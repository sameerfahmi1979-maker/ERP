/**
 * DMS AI Phase 4/5 — Approve & Save Saga Orchestrator
 *
 * Implements Hybrid Option C:
 *   TypeScript validation + storage saga → atomic Postgres RPC for core DB writes.
 *
 * Sequence:
 *  1. Create approve run record
 *  2. Set session approve_status = 'processing'
 *  3. Copy file dms-temp → dms-documents (upsert: false)
 *  4. Update approve run to storage_copied
 *  5. Call approve_dms_ai_intake() RPC (atomic DB transaction)
 *  6a. If RPC fails: cleanup copied file, update approve run to failed, return error
 *  6b. If RPC succeeds: run post-commit OCR/content sync best-effort (Phase 4)
 *  7. Update approve run to completed
 *  8. Trigger post-approve AI orchestration pipeline best-effort (Phase 5)
 *  9. Return document_id / document_no
 *
 * Safety rules:
 *  - NEVER deletes from dms-temp
 *  - Compensates storage on RPC failure where possible
 *  - OCR/content failure does NOT roll back a successful approval
 *  - Orchestration failure does NOT roll back a successful approval (Phase 5)
 *  - No raw OCR text, prompts, or AI responses in approve run metadata
 */

import { randomUUID } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import { logAudit } from "@/server/actions/audit";
import { persistFileOcrResult } from "@/lib/dms/ocr/persist-file-ocr-result";
import { writeDocumentContentTextSystem } from "@/server/actions/dms/document-content";
import { extractFileContent } from "@/lib/dms/file-content-extractor";
import { getDmsAiProvider, getAzureDocumentIntelligenceProvider } from "@/lib/dms/ai/factory";
import { loadOcrFeatureFlags, routeOcr } from "@/lib/dms/ocr/ocr-router";
import { AzureOcrProvider } from "@/lib/dms/ocr/azure-ocr-provider";
import {
  createApproveRun,
  updateApproveRunStage,
  recordApproveRunOnSession,
  sanitizeApproveError,
  APPROVE_STAGE,
  APPROVE_STATUS,
} from "./approve-ai-intake-events";
import {
  buildFinalStoragePath,
  getFileExtension,
  copyFileToFinalStorage,
  cleanupFinalStorageFile,
} from "./approve-ai-intake-storage";
import {
  buildApproveRpcPayload,
  type MetadataValueInput,
  type LinkInput,
} from "./approve-ai-intake-payload";
import { triggerDmsPostApproveOrchestration } from "@/lib/dms/orchestration/post-approve-orchestration";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ApproveAiIntakeSagaInput = {
  mode: "single_file_new_document" | "existing_batch_draft";
  uploadSessionId: number;
  sessionCode: string;
  tempStoragePath: string;
  originalFilename: string;
  mimeType: string;
  fileSizeBytes: number;
  sha256Hash: string | null;
  /** Reserved via reserve_dms_document_id() for single_file mode. Same as draft doc id for batch mode. */
  documentId: number;
  documentNo: string;
  title: string;
  description: string | null;
  documentTypeId: number;
  categoryId: number;
  typeCode: string;
  confidentialityLevel: string;
  owningCompanyId: number | null;
  owningBranchId: number | null;
  partyId: number | null;
  issueDate: string | null;
  expiryDate: string | null;
  resolvedFileName: string;
  /** Whether to create version+file rows in the RPC (false for batch drafts that already have a file). */
  createFileVersion: boolean;
  /** If createFileVersion is false (batch), the existing file id for OCR post-commit. */
  existingFileId?: number | null;
  metadataValues: MetadataValueInput[];
  tagIds: number[];
  links: LinkInput[];
  aiResultId: number | null;
  userId: number;
};

export type ApproveAiIntakeSagaResult =
  | { success: true; data: { documentId: number; documentNo: string } }
  | { success: false; error: string };

// ── RPC response type ─────────────────────────────────────────────────────────

type RpcResultRow = {
  out_document_id: number;
  out_document_no: string;
  out_status: string;
};

// ── Main saga ─────────────────────────────────────────────────────────────────

export async function runApproveAiIntakeSaga(
  supabase: SupabaseClient,
  adminClient: SupabaseClient,
  input: ApproveAiIntakeSagaInput
): Promise<ApproveAiIntakeSagaResult> {
  const {
    mode,
    uploadSessionId,
    sessionCode,
    tempStoragePath,
    originalFilename,
    mimeType,
    fileSizeBytes,
    sha256Hash,
    documentId,
    documentNo,
    title,
    description,
    documentTypeId,
    categoryId,
    typeCode,
    confidentialityLevel,
    owningCompanyId,
    owningBranchId,
    partyId,
    issueDate,
    expiryDate,
    resolvedFileName,
    createFileVersion,
    existingFileId,
    metadataValues,
    tagIds,
    links,
    aiResultId,
    userId,
  } = input;

  const runKey = `${uploadSessionId}-${randomUUID()}`;

  // ── 1. Create approve run ────────────────────────────────────────────────
  const approveRunId = await createApproveRun(supabase, {
    uploadSessionId,
    aiResultId,
    runKey,
    startedBy: userId,
  });

  await recordApproveRunOnSession(supabase, uploadSessionId, approveRunId, "processing");

  await logAudit({
    module_code: "DMS",
    entity_name: "dms_upload_sessions",
    entity_id: uploadSessionId,
    entity_reference: sessionCode,
    action: "update",
    new_values: {
      event: APPROVE_STAGE.STARTED,
      approve_run_id: approveRunId,
      document_no: documentNo,
      mode,
    },
  });

  // ── 2. Storage copy ──────────────────────────────────────────────────────

  const year = new Date().getFullYear();
  const ext = getFileExtension(originalFilename);

  let finalPath: string | null = null;
  let finalBucket: string | null = null;
  let fileId: number | null = existingFileId ?? null;

  if (createFileVersion) {
    finalPath = buildFinalStoragePath({
      owningCompanyId,
      year,
      typeCode,
      documentId,
      versionNumber: 1,
      ext,
    });
    finalBucket = "dms-documents";

    const copyResult = await copyFileToFinalStorage(adminClient, {
      tempBucket: "dms-temp",
      tempPath: tempStoragePath,
      finalBucket,
      finalPath,
      mimeType,
    });

    if (!copyResult.success) {
      const errInfo = sanitizeApproveError(copyResult.error);
      await updateApproveRunStage(supabase, approveRunId, APPROVE_STATUS.FAILED, APPROVE_STAGE.FAILED, {
        errorCode: errInfo.code,
        errorMessage: errInfo.message,
        completedAt: new Date().toISOString(),
      });
      await recordApproveRunOnSession(supabase, uploadSessionId, approveRunId, "failed", errInfo.message);
      return { success: false, error: copyResult.error ?? "Failed to copy file to final storage" };
    }

    await updateApproveRunStage(supabase, approveRunId, APPROVE_STATUS.STORAGE_COPIED, APPROVE_STAGE.STORAGE_COPIED, {
      finalStorageBucket: finalBucket,
      finalStoragePath: finalPath,
    });

    logger.info("[approve-saga] storage copied", { sessionCode, finalPath, documentId });
  }

  // ── 3. Build and call atomic RPC ─────────────────────────────────────────

  await updateApproveRunStage(supabase, approveRunId, APPROVE_STATUS.STORAGE_COPIED, APPROVE_STAGE.DB_STARTED);

  const rpcPayload = buildApproveRpcPayload({
    mode,
    uploadSessionId,
    approveRunId,
    aiResultId,
    documentId,
    documentNo,
    title,
    description,
    documentTypeId,
    categoryId,
    confidentialityLevel,
    owningCompanyId,
    owningBranchId,
    partyId,
    issueDate,
    expiryDate,
    createFileVersion,
    finalStorageBucket: finalBucket,
    finalStoragePath: finalPath,
    fileName: resolvedFileName,
    mimeType,
    fileSizeBytes,
    sha256Hash,
    versionNumber: 1,
    metadataValues,
    tagIds,
    links,
  });

  const { data: rpcRows, error: rpcError } = await supabase.rpc(
    "approve_dms_ai_intake",
    { p_payload: rpcPayload }
  );

  if (rpcError) {
    // ── Compensate storage if DB commit failed ──────────────────────────
    let cleanupStatus: string = APPROVE_STATUS.FAILED;
    let cleanupStage: string = APPROVE_STAGE.FAILED;

    if (createFileVersion && finalBucket && finalPath) {
      const cleanup = await cleanupFinalStorageFile(adminClient, finalBucket, finalPath);
      if (!cleanup.success) {
        cleanupStatus = APPROVE_STATUS.FAILED_STORAGE_CLEANUP;
        cleanupStage = APPROVE_STAGE.CLEANUP_FAILED;
        logger.warn("[approve-saga] storage compensation failed — orphaned object", {
          finalBucket,
          finalPath,
          sessionCode,
        });
      }
    }

    const errInfo = sanitizeApproveError(rpcError);
    await updateApproveRunStage(supabase, approveRunId, cleanupStatus, cleanupStage, {
      errorCode: errInfo.code,
      errorMessage: errInfo.message,
      completedAt: new Date().toISOString(),
    });
    await recordApproveRunOnSession(supabase, uploadSessionId, approveRunId, "failed", errInfo.message);

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_upload_sessions",
      entity_id: uploadSessionId,
      entity_reference: sessionCode,
      action: "update",
      new_values: {
        event: APPROVE_STAGE.FAILED,
        approve_run_id: approveRunId,
        error_code: errInfo.code,
      },
    });

    return { success: false, error: rpcError.message ?? "DB transaction failed during approval" };
  }

  // ── 4. Extract RPC result ────────────────────────────────────────────────

  const rpcResult = (rpcRows as RpcResultRow[] | null)?.[0];
  if (!rpcResult?.out_document_id) {
    const errInfo = sanitizeApproveError("RPC returned no result rows");
    await updateApproveRunStage(supabase, approveRunId, APPROVE_STATUS.FAILED, APPROVE_STAGE.FAILED, {
      errorCode: errInfo.code,
      errorMessage: errInfo.message,
      completedAt: new Date().toISOString(),
    });
    await recordApproveRunOnSession(supabase, uploadSessionId, approveRunId, "failed");
    return { success: false, error: "Approval RPC returned no result" };
  }

  const finalDocumentId = rpcResult.out_document_id;
  const finalDocumentNo = rpcResult.out_document_no;
  const rpcStatus = rpcResult.out_status;

  // ── 5. Post-commit OCR / content sync (best-effort) ──────────────────────

  await updateApproveRunStage(supabase, approveRunId, APPROVE_STATUS.DB_COMMITTED, APPROVE_STAGE.POST_COMMIT_STARTED, {
    documentId: finalDocumentId,
  });

  await runPostCommitOcr(supabase, adminClient, {
    documentId: finalDocumentId,
    aiResultId,
    fileId,
    createFileVersion,
    sessionCode,
    userId,
    mimeType,
    resolvedFileName,
  });

  // ── 6. Mark completed ────────────────────────────────────────────────────

  await updateApproveRunStage(supabase, approveRunId, APPROVE_STATUS.COMPLETED, APPROVE_STAGE.COMPLETED, {
    documentId: finalDocumentId,
    completedAt: new Date().toISOString(),
    metadata: {
      mode,
      rpc_status: rpcStatus,
      metadata_count: metadataValues.filter((v) => v.rawValue !== "").length,
      tag_count: tagIds.length,
      link_count: links.length,
    },
  });

  await logAudit({
    module_code: "DMS",
    entity_name: "dms_documents",
    entity_id: finalDocumentId,
    entity_reference: finalDocumentNo,
    action: "create",
    new_values: {
      event: APPROVE_STAGE.COMPLETED,
      upload_session_id: uploadSessionId,
      ai_result_id: aiResultId,
      approve_run_id: approveRunId,
      mode,
    },
  });

  // ── 8. Phase 5 — Trigger post-approve AI orchestration (best-effort) ───────
  // approveRunId may be null if run record creation failed earlier; skip trigger in that case.
  if (approveRunId != null) {
    try {
      await triggerDmsPostApproveOrchestration({
        sessionCode,
        documentId: finalDocumentId,
        uploadSessionId,
        approveRunId,
        source: mode === "existing_batch_draft" ? "batch_finalize" : "single_file_approve",
      });
    } catch {
      // Non-fatal — orchestration failure must never fail approval
      logger.warn("[approve-saga] post-approve orchestration trigger threw unexpectedly", { sessionCode });
    }
  }

  return { success: true, data: { documentId: finalDocumentId, documentNo: finalDocumentNo } };
}

// ── Post-commit OCR helper ────────────────────────────────────────────────────

async function runPostCommitOcr(
  supabase: SupabaseClient,
  adminClient: SupabaseClient,
  params: {
    documentId: number;
    aiResultId: number | null;
    fileId: number | null;
    createFileVersion: boolean;
    sessionCode: string;
    userId: number;
    mimeType: string;
    resolvedFileName: string;
  }
): Promise<void> {
  const { documentId, aiResultId, fileId: inputFileId, createFileVersion, userId, mimeType, resolvedFileName } = params;

  try {
    let rawOcrText: string | null = null;

    // Fetch OCR text from AI result record
    if (aiResultId) {
      const { data: aiRaw } = await supabase
        .from("dms_ai_extraction_results")
        .select("raw_ocr_text")
        .eq("id", aiResultId)
        .single();
      rawOcrText = (aiRaw as Record<string, unknown> | null)?.raw_ocr_text as string | null ?? null;
    }

    // For newly created file versions, resolve the file id from DB
    let resolvedFileId = inputFileId;
    if (createFileVersion && !resolvedFileId) {
      const { data: fileRow } = await supabase
        .from("dms_document_files")
        .select("id, storage_bucket, storage_path")
        .eq("document_id", documentId)
        .eq("file_role", "original")
        .is("deleted_at", null)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (fileRow) {
        resolvedFileId = fileRow.id as number;
      }
    }

    // OCR fallback: if no OCR text, try to extract from the final file.
    // Phase 10A: uses OCR router when DMS_OCR_ROUTER=true (three-tier: local → Azure → GPT).
    // Legacy (DMS_OCR_ROUTER=false): uses extractFileContent + GPT-4.1 vision directly.
    // Track the actual provider code for the bottom persistFileOcrResult call.
    let ocrFallbackProviderCode: string = "ai_intake";

    if (!rawOcrText?.trim() && resolvedFileId) {
      try {
        const { data: fileRow } = await supabase
          .from("dms_document_files")
          .select("storage_bucket, storage_path, file_name, mime_type")
          .eq("id", resolvedFileId)
          .single();

        if (fileRow?.storage_path) {
          const { data: blob } = await adminClient.storage
            .from((fileRow.storage_bucket as string | null) ?? "dms-documents")
            .download(fileRow.storage_path as string);

          if (blob) {
            const buffer = Buffer.from(await blob.arrayBuffer());
            const fileMime = (fileRow.mime_type as string | null) ?? mimeType;
            const fileNameResolved = (fileRow.file_name as string | null) ?? resolvedFileName;

            // Load OCR feature flags to decide routing path
            const featureFlags = await loadOcrFeatureFlags(supabase);

            let fallbackText: string | null = null;

            if (featureFlags.dmsOcrRouter) {
              // Phase 10A router path
              const { provider: gptProvider } = await getDmsAiProvider();
              const { provider: azureAdapter } = await getAzureDocumentIntelligenceProvider();
              const azureProvider = azureAdapter ? new AzureOcrProvider(azureAdapter) : null;

              const routerResult = await routeOcr({
                buffer,
                mimeType: fileMime,
                fileName: fileNameResolved,
                featureFlags,
                azureProvider,
                gptProvider: gptProvider.isConfigured() ? gptProvider : null,
              });

              fallbackText = routerResult.text.trim() || null;
              ocrFallbackProviderCode = routerResult.providerCode;
            } else {
              // Legacy path: extractFileContent + GPT-4.1 vision
              const content = await extractFileContent(buffer, fileMime, fileNameResolved);
              if (content.hasContent) {
                const { provider: aiProvider } = await getDmsAiProvider();
                if (aiProvider.isConfigured()) {
                  const fallbackOutput = await aiProvider.analyze({
                    ocrText: content.text,
                    imageFiles: content.images,
                    currentTypeCode: null,
                    typeCandidates: [],
                    metadataFields: [],
                    originalFilename: fileNameResolved,
                  });
                  const transcription = fallbackOutput.extraction?.fullTextTranscription;
                  fallbackText = transcription?.trim() || content.text?.trim() || null;
                }
              }
            }

            if (fallbackText) {
              rawOcrText = fallbackText;
              if (aiResultId) {
                await supabase
                  .from("dms_ai_extraction_results")
                  .update({ raw_ocr_text: fallbackText.slice(0, 100_000) })
                  .eq("id", aiResultId);
              }
            }
          }
        }
      } catch {
        // OCR fallback failed — non-fatal
      }
    }

    // Persist OCR result — uses ocrFallbackProviderCode to record actual provider used.
    if (rawOcrText && rawOcrText.trim().length > 0) {
      if (resolvedFileId) {
        await persistFileOcrResult({
          supabase,
          fileId: resolvedFileId,
          documentId,
          text: rawOcrText,
          provider: ocrFallbackProviderCode as Parameters<typeof persistFileOcrResult>[0]["provider"],
          model: null,
          performedBy: userId,
          source: "ai_intake",
        });
      } else {
        await writeDocumentContentTextSystem({
          documentId,
          text: rawOcrText,
          source: "ai_intake",
          performedBy: userId,
        });
        await supabase
          .from("dms_documents")
          .update({ ocr_text_available: true, updated_at: new Date().toISOString() })
          .eq("id", documentId);
      }
    }
  } catch (err) {
    logger.warn("[approve-saga] post-commit OCR sync failed (non-fatal)", {
      documentId,
      err: String(err).slice(0, 200),
    });
  }
}
