/**
 * DMS AI Phase 4/5 — Approve & Save Saga Orchestrator
 *
 * Implements Hybrid Option C:
 *   TypeScript validation + storage saga → atomic Postgres RPC for core DB writes.
 *
 * Sequence:
 * The compatibility export delegates to the F07 retained batch protocol.
 * PostgreSQL freezes the original run, payload and path and commits its receipt
 * atomically. Receipt-only replay never repeats post-commit provider work.
 *
 * Safety rules:
 *  - NEVER deletes from dms-temp
 *  - NEVER deletes a copied final object on an absent/failed transaction response
 *  - OCR/content failure does NOT roll back a successful approval
 *  - Orchestration failure does NOT roll back a successful approval (Phase 5)
 *  - No raw OCR text, prompts, or AI responses in approve run metadata
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";
import {finalizeRetainedBatch} from '@/server/dms-retained-batch-finalization';
import type {AiApprovalInput} from '@/lib/dms/numbered-ai-approval';
import { persistFileOcrResult } from "@/lib/dms/ocr/persist-file-ocr-result";
import { writeDocumentContentTextSystem } from "@/server/actions/dms/document-content";
import { extractFileContent } from "@/lib/dms/file-content-extractor";
import { getDmsAiProvider, getAzureDocumentIntelligenceProvider } from "@/lib/dms/ai/factory";
import { loadOcrFeatureFlags, routeOcr } from "@/lib/dms/ocr/ocr-router";
import { AzureOcrProvider } from "@/lib/dms/ocr/azure-ocr-provider";
import {
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
  | { success: false; error: string; uncertain?: boolean; retained?: {approveRunId:number|null;documentId:number;uploadSessionId:number} };

// ── Main saga ─────────────────────────────────────────────────────────────────

/** Compatibility export: every remaining legacy caller uses the same retained
 * protocol. Never create a new run or storage year from a retry. */
export async function runApproveAiIntakeSaga(
  supabase: SupabaseClient,
  adminClient: SupabaseClient,
  input: ApproveAiIntakeSagaInput
): Promise<ApproveAiIntakeSagaResult> {
  if(input.mode!=="existing_batch_draft")return {success:false,error:"Single-file approval requires its retained numbered protocol."};
  const result=await finalizeRetainedBatch(supabase,adminClient,{
    uploadSessionId:input.uploadSessionId,title:input.title,description:input.description,documentTypeId:input.documentTypeId,
    confidentialityLevel:input.confidentialityLevel as AiApprovalInput["confidentialityLevel"],
    owningCompanyId:input.owningCompanyId,owningBranchId:input.owningBranchId,partyId:input.partyId,
    issueDate:input.issueDate,expiryDate:input.expiryDate,
    metadataValues:input.metadataValues as AiApprovalInput["metadataValues"],tagIds:input.tagIds,
    links:input.links as AiApprovalInput["links"],aiResultId:input.aiResultId,standardFileName:input.resolvedFileName,allowDuplicate:false,
  },input.resolvedFileName,input.userId);
  if(!result.success)return result;
  if(!result.replayed){
    try{await runPostCommitOcr(supabase,adminClient,{documentId:result.data.documentId,aiResultId:input.aiResultId,
      fileId:input.existingFileId??null,createFileVersion:true,sessionCode:input.sessionCode,userId:input.userId,
      mimeType:input.mimeType,resolvedFileName:input.resolvedFileName});}catch{/* Committed receipt wins. */}
    try{await triggerDmsPostApproveOrchestration({sessionCode:input.sessionCode,documentId:result.data.documentId,
      uploadSessionId:input.uploadSessionId,approveRunId:result.approveRunId,source:"batch_finalize"});}catch{/* No inline retry/fallback. */}
  }
  return {success:true,data:result.data};
}

// ── Post-commit OCR helper ────────────────────────────────────────────────────

export async function runPostCommitOcr(
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
              const { provider: gptProvider } = await getDmsAiProvider("ocr");
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
                const { provider: aiProvider } = await getDmsAiProvider("ocr");
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
        const savedOcr = await persistFileOcrResult({
          supabase,
          fileId: resolvedFileId,
          documentId,
          text: rawOcrText,
          provider: ocrFallbackProviderCode as Parameters<typeof persistFileOcrResult>[0]["provider"],
          model: null,
          performedBy: userId,
          source: "ai_intake",
        });
        if (!savedOcr.fileUpdated || !savedOcr.documentUpdated || (savedOcr.hasText && !savedOcr.contentSynced)) {
          logger.warn("[approve-saga] OCR synchronization incomplete; retry OCR for this document", {
            documentId, fileId: resolvedFileId, fileUpdated: savedOcr.fileUpdated,
            documentUpdated: savedOcr.documentUpdated, contentSynced: savedOcr.contentSynced,
          });
        }
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
