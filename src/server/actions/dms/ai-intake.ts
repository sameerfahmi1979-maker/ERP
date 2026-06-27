"use server";

/**
 * DMS.11 — Option A AI-First Upload-Session Intake Server Actions
 *
 * Flow: Upload → AI Fill → User Reviews → Approve & Save → Final DMS Document
 *
 * Key rules:
 * - AI results are NEVER auto-saved to dms_documents or metadata.
 * - Final document is ONLY created on approveAiIntakeAndCreateDocument().
 * - OCR text and AI prompts are NEVER logged.
 */

import { z } from "zod";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { upsertDmsReviewQueueItem, isDmsAiReviewEnabled } from "@/lib/dms/review-queue/review-queue-upsert";
import { getDmsAiProvider, getAzureDocumentIntelligenceProvider } from "@/lib/dms/ai/factory";
import { hashOcrText, PROMPT_VERSION } from "@/lib/dms/ai/prompt-builders";
import { buildClassificationCandidates } from "@/lib/dms/ai/classification-candidate-builder";
import { buildSanitizedClassificationPayload } from "@/lib/dms/ai/classification-output";
import { resolveSuggestedDocumentType } from "@/lib/dms/ai/classification-resolver";
import { loadMetadataFieldsForDocumentType } from "@/lib/dms/ai/load-metadata-fields";
import { extractFileContent } from "@/lib/dms/file-content-extractor";
import { loadOcrFeatureFlags, routeOcr } from "@/lib/dms/ocr/ocr-router";
import { AzureOcrProvider } from "@/lib/dms/ocr/azure-ocr-provider";
import { revalidatePath } from "next/cache";
import { resolveStandardFileNameForIntakeApprove } from "@/server/actions/dms/standard-file-name";
import { validateStandardFileName } from "@/lib/dms/standard-file-name";
import { runApproveAiIntakeSaga } from "@/lib/dms/approve/approve-ai-intake";
import type {
  DmsAiDocumentTypeCandidate,
  DmsAiImageFile,
  DmsAiMetadataField,
  DmsAiOutput,
  DmsDetectedEntity,
  DmsSuggestedLink,
} from "@/lib/dms/ai/types";
import type { SupabaseClient } from "@supabase/supabase-js";

// ── Entity → party database matching ──────────────────────────────────────────

/**
 * Searches the parties table for records whose names match the AI-detected
 * entities. Returns suggested links the user can confirm during review.
 */
async function matchEntitiesToParties(
  supabase: SupabaseClient,
  entities: DmsDetectedEntity[]
): Promise<DmsSuggestedLink[]> {
  if (!entities || entities.length === 0) return [];

  const links: DmsSuggestedLink[] = [];
  const seenPartyIds = new Set<number>();

  for (const entity of entities.slice(0, 10)) {
    const name = entity.name?.trim();
    if (!name || name.length < 3) continue;

    try {
      // Case-insensitive partial match across the party name columns
      const pattern = `%${name.replace(/[%_]/g, "")}%`;
      const { data } = await supabase
        .from("parties")
        .select("id, party_no, display_name, legal_name_en, trade_name_en")
        .or(
          `display_name.ilike.${pattern},legal_name_en.ilike.${pattern},trade_name_en.ilike.${pattern}`
        )
        .limit(3);

      for (const p of (data ?? []) as Record<string, unknown>[]) {
        const pid = p.id as number;
        if (seenPartyIds.has(pid)) continue;
        seenPartyIds.add(pid);

        const partyName =
          (p.display_name as string) ||
          (p.legal_name_en as string) ||
          (p.trade_name_en as string) ||
          `Party #${pid}`;

        // Confidence: exact (case-insensitive) name match scores higher
        const exact = partyName.trim().toLowerCase() === name.toLowerCase();

        links.push({
          entityType: "party",
          entityId: pid,
          entityName: partyName,
          confidenceScore: exact ? 0.9 : 0.6,
          reason: `Matched ${entity.entityType || "entity"} "${name}"${entity.role ? ` (${entity.role})` : ""} from the document to party ${p.party_no ?? pid}`,
        });
      }
    } catch (err) {
      logger.warn("[ai-intake] party match failed for entity", { name, err: String(err) });
    }
  }

  return links.slice(0, 8);
}

// ── Permission helpers ────────────────────────────────────────────────────────

function canStartIntake(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.upload") ||
    hasPermission(ctx, "dms.admin")
  );
}

function canViewIntake(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.upload") ||
    hasPermission(ctx, "dms.documents.view") ||
    hasPermission(ctx, "dms.documents.review_ai") ||
    hasPermission(ctx, "dms.admin")
  );
}

function canApproveIntake(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.review_ai") ||
    hasPermission(ctx, "dms.documents.upload") ||
    hasPermission(ctx, "dms.admin")
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type IntakeAiResultRow = {
  id: number;
  upload_session_id: number | null;
  document_id: number | null;
  job_id: number;
  ai_status: string;
  suggested_document_type_id: number | null;
  classification_confidence: string | null;
  classification_score: number | null;
  classification_reason: string | null;
  extracted_fields_json: Record<string, unknown> | null;
  field_confidence_json: Record<string, unknown> | null;
  suggested_links_json: unknown[] | null;
  issue_date_suggestion: string | null;
  expiry_date_suggestion: string | null;
  suggested_title: string | null;
  suggested_description: string | null;
  review_action: string | null;
  raw_response_json: Record<string, unknown> | null;
  created_at: string;
  suggested_type?: { type_code: string; name_en: string } | null;
};

export type IntakeSessionData = {
  id: number;
  session_code: string;
  status: string;
  intake_status: string;
  review_status: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  temp_storage_path: string | null;
  is_duplicate: boolean;
  duplicate_document_id: number | null;
  ai_result_id: number | null;
  document_id: number | null;
  reviewed_by: number | null;
  discarded_at: string | null;
  discard_reason: string | null;
  uploaded_at: string;
  ai_result?: IntakeAiResultRow | null;
  draft_values?: IntakeReviewValueRow[] | null;
};

export type IntakeReviewValueRow = {
  id: number;
  upload_session_id: number;
  field_scope: string;
  field_code: string;
  field_label: string | null;
  field_type: string | null;
  suggested_value_json: unknown;
  reviewed_value_json: unknown;
  confidence_score: number | null;
  confidence_label: string | null;
  source_snippet: string | null;
  review_status: string;
};

export type ApproveIntakeInput = {
  uploadSessionId: number;
  title: string;
  documentTypeId: number;
  description?: string | null;
  issueDate?: string | null;
  expiryDate?: string | null;
  confidentialityLevel?: string;
  owningCompanyId?: number | null;
  owningBranchId?: number | null;
  partyId?: number | null;
  metadataValues?: {
    definitionId: number;
    fieldType: string;
    rawValue: string;
  }[];
  tagIds?: number[];
  links?: {
    entityType: string;
    entityId: number;
    linkRole?: string;
    isPrimary?: boolean;
  }[];
  aiResultId?: number | null;
  allowDuplicate?: boolean;
  standardFileName?: string | null;
};

// ── Validation schemas ────────────────────────────────────────────────────────

const StartIntakeSchema = z.object({
  uploadSessionId: z.number().int().positive(),
  allowDuplicate: z.boolean().optional().default(false),
});

const ApproveIntakeSchema = z.object({
  uploadSessionId: z.number().int().positive(),
  title: z.string().min(1, "Title is required").max(500),
  documentTypeId: z.number().int().positive("Document type is required"),
  description: z.string().max(2000).nullable().optional(),
  issueDate: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  confidentialityLevel: z.string().optional(),
  owningCompanyId: z.number().int().positive().nullable().optional(),
  owningBranchId: z.number().int().positive().nullable().optional(),
  partyId: z.number().int().positive().nullable().optional(),
  metadataValues: z.array(z.object({
    definitionId: z.number().int().positive(),
    fieldType: z.string(),
    rawValue: z.string(),
  })).optional().default([]),
  tagIds: z.array(z.number().int().positive()).optional().default([]),
  links: z.array(z.object({
    entityType: z.string(),
    entityId: z.number().int().positive(),
    linkRole: z.string().optional(),
    isPrimary: z.boolean().optional(),
  })).optional().default([]),
  aiResultId: z.number().int().positive().nullable().optional(),
  allowDuplicate: z.boolean().optional().default(false),
  standardFileName: z.string().min(1).max(200).nullable().optional(),
});

// ── startAiIntakeFromUploadSession ───────────────────────────────────────────

export async function startAiIntakeFromUploadSession(
  input: z.input<typeof StartIntakeSchema>
): Promise<ActionResult<{ sessionCode: string; status: string; message?: string }>> {
  try {
    const parsed = StartIntakeSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const { uploadSessionId, allowDuplicate } = parsed.data;
    const supabase = await createClient();
    const adminClient = createAdminClient();
    const ctx = await getAuthContext();

    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canStartIntake(ctx)) return { success: false, error: "Permission denied: requires dms.documents.upload" };

    // ── Load upload session ─────────────────────────────────────────────────

    const { data: session, error: sessionError } = await supabase
      .from("dms_upload_sessions")
      .select("*")
      .eq("id", uploadSessionId)
      .is("deleted_at", null)
      .single();

    if (sessionError || !session) return { success: false, error: "Upload session not found" };

    const typedSession = session as Record<string, unknown>;
    if (typedSession.status === "completed") return { success: false, error: "Upload session is already completed" };
    if (typedSession.status === "cancelled") return { success: false, error: "Upload session has been cancelled" };
    if (!typedSession.temp_storage_path) return { success: false, error: "Temporary file path is missing" };
    if ((typedSession.intake_status as string) === "approved") return { success: false, error: "Intake already approved" };
    if ((typedSession.intake_status as string) === "discarded") return { success: false, error: "Intake was discarded" };
    // Duplicate detection is informational only — the UI shows a warning badge.
    // Admins may intentionally create a second document from the same file.

    const sessionCode = typedSession.session_code as string;

    // ── Check AI provider ───────────────────────────────────────────────────

    const { provider, configId } = await getDmsAiProvider();

    if (!provider.isConfigured()) {
      // Mark as failed but return sessionCode so user can proceed manually
      await supabase
        .from("dms_upload_sessions")
        .update({ intake_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", uploadSessionId);

      await logAudit({
        module_code: "DMS",
        entity_name: "dms_upload_sessions",
        entity_id: uploadSessionId,
        entity_reference: sessionCode,
        action: "update",
        new_values: { event: "ai_intake_failed", reason: "provider_not_configured" },
      });

      return {
        success: false,
        data: { sessionCode, status: "provider_not_configured", message: "No AI provider configured. Please configure one in Administration → Settings → AI Settings." },
        error: "No AI provider configured",
      };
    }

    // ── Update status: processing ───────────────────────────────────────────

    await supabase
      .from("dms_upload_sessions")
      .update({ intake_status: "ocr_processing", updated_at: new Date().toISOString() })
      .eq("id", uploadSessionId);

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_upload_sessions",
      entity_id: uploadSessionId,
      entity_reference: sessionCode,
      action: "update",
      new_values: { event: "ai_intake_started", uploaded_by: ctx.profile.id },
    });

    // ── Extract file content from dms-temp ─────────────────────────────────

    const tempPath = typedSession.temp_storage_path as string;
    const mimeType = (typedSession.mime_type as string ?? "").toLowerCase().split(";")[0].trim();
    const originalFilename = typedSession.original_filename as string;

    let ocrText = "";
    const imageFiles: DmsAiImageFile[] = [];
    let contentExtracted = false;

    try {
      const { data: blob, error: dlErr } = await adminClient.storage.from("dms-temp").download(tempPath);
      if (dlErr || !blob) {
        await supabase
          .from("dms_upload_sessions")
          .update({ intake_status: "failed", updated_at: new Date().toISOString() })
          .eq("id", uploadSessionId);
        return { success: false, error: "Failed to read uploaded file from temporary storage" };
      }

      const buffer = Buffer.from(await blob.arrayBuffer());

      // Content extraction — Phase 10A: router-aware.
      // When DMS_OCR_ROUTER=true: router handles text extraction (local → Azure → GPT).
      //   Passes extracted text to AI classification; imageFiles is empty (router got text).
      // When DMS_OCR_ROUTER=false: legacy path — extractFileContent + combined GPT call.
      const featureFlags = await loadOcrFeatureFlags(supabase);

      if (featureFlags.dmsOcrRouter) {
        // Phase 10A router path
        const { provider: gptProvider } = await getDmsAiProvider();
        const { provider: azureAdapter } = await getAzureDocumentIntelligenceProvider();
        const azureProvider = azureAdapter ? new AzureOcrProvider(azureAdapter) : null;

        const routerResult = await routeOcr({
          buffer,
          mimeType,
          fileName: originalFilename,
          featureFlags,
          azureProvider,
          gptProvider: gptProvider.isConfigured() ? gptProvider : null,
        });

        ocrText = routerResult.text;
        // imageFiles left empty — router already performed OCR and returned text.
        logger.info(`[ai-intake] OCR router: method=${routerResult.method} provider=${routerResult.providerCode} text=${ocrText.length} chars`);
      } else {
        // Legacy path: extractFileContent produces text and/or rendered images for GPT.
        const extracted = await extractFileContent(buffer, mimeType, originalFilename);
        logger.info(`[ai-intake] content extraction method: ${extracted.method} (text=${extracted.text.length} chars, images=${extracted.images.length})`);

        ocrText = extracted.text;
        for (const img of extracted.images) {
          imageFiles.push({ fileName: img.fileName, base64: img.base64, mimeType: img.mimeType });
        }
      }

      // Proceed even if extraction produced nothing — the AI will note the limitation.
      contentExtracted = true;
    } catch (err) {
      logger.error("[ai-intake] file content extraction error:", err);
      // Don't block the pipeline — let the AI report it couldn't read the file.
      contentExtracted = true;
    }

    if (!contentExtracted) {
      await supabase
        .from("dms_upload_sessions")
        .update({ intake_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", uploadSessionId);
      return { success: false, error: "Failed to read uploaded file from temporary storage" };
    }

    // ── Update status: AI processing ────────────────────────────────────────

    await supabase
      .from("dms_upload_sessions")
      .update({ intake_status: "ai_processing", updated_at: new Date().toISOString() })
      .eq("id", uploadSessionId);

    // ── Create AI job record ────────────────────────────────────────────────

    const inputHash = hashOcrText(ocrText + `+images:${imageFiles.length}+session:${uploadSessionId}`);

    const { data: job, error: jobErr } = await supabase
      .from("dms_ai_extraction_jobs")
      .insert({
        document_id: null,
        upload_session_id: uploadSessionId,
        job_type: "classify_extract",
        provider: provider.providerCode,
        model: provider.modelId ?? null,
        status: "pending",
        run_source: "ai_intake",
        input_text_hash: inputHash,
        prompt_version: PROMPT_VERSION,
        provider_config_id: configId ?? null,
        created_by: ctx.profile.id,
      })
      .select("id")
      .single();

    if (jobErr || !job) {
      await supabase
        .from("dms_upload_sessions")
        .update({ intake_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", uploadSessionId);
      return { success: false, error: "Failed to create AI job record" };
    }

    const jobId = job.id as number;

    // ── Load metadata-aware classification candidates (Phase 3 Pass 1) ─────

    const { packets: classificationPackets, typeCandidates, scoredTypes } =
      await buildClassificationCandidates(supabase, ocrText, originalFilename);

    const typeRows = scoredTypes.map((s) => ({
      id: s.id,
      type_code: s.type_code,
      name_en: s.name_en,
    }));

    // Pass 1: classify + transcribe — no per-field extraction list
    const metadataFields: DmsAiMetadataField[] = [];

    // ── Mark job processing ────────────────────────────────────────────────

    await supabase
      .from("dms_ai_extraction_jobs")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", jobId);

    // ── Run AI ────────────────────────────────────────────────────────────

    const startMs = Date.now();
    let aiOutput: DmsAiOutput | null = null;
    let aiError: string | null = null;

    try {
      aiOutput = await provider.analyze({
        ocrText,
        imageFiles,
        currentTypeCode: null,
        typeCandidates,
        metadataFields,
        originalFilename,
        classificationPackets,
      });
    } catch (err) {
      aiError = String(err);
    }

    const durationMs = Date.now() - startMs;
    const completedAt = new Date().toISOString();

    if (aiError || !aiOutput) {
      await supabase
        .from("dms_ai_extraction_jobs")
        .update({ status: "failed", error_message: (aiError ?? "").slice(0, 500), completed_at: completedAt, duration_ms: durationMs })
        .eq("id", jobId);
      await supabase
        .from("dms_upload_sessions")
        .update({ intake_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", uploadSessionId);
      await logAudit({
        module_code: "DMS",
        entity_name: "dms_upload_sessions",
        entity_id: uploadSessionId,
        entity_reference: sessionCode,
        action: "update",
        new_values: { event: "ai_intake_ai_failed", job_id: jobId, duration_ms: durationMs },
      });
      return { success: false, error: aiError ?? "AI analysis failed" };
    }

    // ── Pass 2: type-specific metadata extraction (when type resolved) ─────

    const pass1Transcription =
      aiOutput.extraction.fullTextTranscription ?? ocrText ?? "";

    const typeResolution = resolveSuggestedDocumentType(
      aiOutput.classification.suggestedTypeCode,
      typeRows as Array<{ id: number; type_code: string; name_en?: string }>,
      pass1Transcription,
      aiOutput.classification.confidenceScore
    );

    let suggestedTypeId = typeResolution.typeId;
    let suggestedTypeCode = typeResolution.typeCode;

    if (typeResolution.source !== "ai" && typeResolution.typeCode) {
      aiOutput.classification.suggestedTypeCode = typeResolution.typeCode;
      aiOutput.classification.suggestedTypeId = typeResolution.typeId;
      if (typeResolution.overrideReason) {
        aiOutput.warnings = [
          ...(aiOutput.warnings ?? []),
          `Classification adjusted: ${typeResolution.overrideReason}`,
        ];
      }
    }

    if (suggestedTypeId) {
      const typeSpecificFields = await loadMetadataFieldsForDocumentType(supabase, suggestedTypeId, "intake");
      if (typeSpecificFields.length > 0) {
        try {
          const extractOutput = await provider.analyze({
            ocrText: pass1Transcription || ocrText,
            imageFiles,
            currentTypeCode: suggestedTypeCode,
            typeCandidates,
            metadataFields: typeSpecificFields,
            originalFilename,
          });
          // Merge pass-2 extraction; keep pass-1 classification + transcription
          aiOutput.extraction.fields = extractOutput.extraction.fields;
          aiOutput.extraction.additionalFields = [
            ...aiOutput.extraction.additionalFields,
            ...extractOutput.extraction.additionalFields,
          ];
          if (!aiOutput.extraction.suggestedTitle && extractOutput.extraction.suggestedTitle) {
            aiOutput.extraction.suggestedTitle = extractOutput.extraction.suggestedTitle;
          }
          if (!aiOutput.extraction.suggestedDescription && extractOutput.extraction.suggestedDescription) {
            aiOutput.extraction.suggestedDescription = extractOutput.extraction.suggestedDescription;
          }
          if (!aiOutput.extraction.issueDateSuggestion && extractOutput.extraction.issueDateSuggestion) {
            aiOutput.extraction.issueDateSuggestion = extractOutput.extraction.issueDateSuggestion;
          }
          if (!aiOutput.extraction.expiryDateSuggestion && extractOutput.extraction.expiryDateSuggestion) {
            aiOutput.extraction.expiryDateSuggestion = extractOutput.extraction.expiryDateSuggestion;
          }
          if (!aiOutput.extraction.fullTextTranscription && extractOutput.extraction.fullTextTranscription) {
            aiOutput.extraction.fullTextTranscription = extractOutput.extraction.fullTextTranscription;
          }
          if (extractOutput.detectedEntities.length > 0) {
            aiOutput.detectedEntities = extractOutput.detectedEntities;
          }
        } catch (err) {
          logger.warn("[ai-intake] pass-2 type-specific extraction failed (non-fatal)", {
            typeCode: suggestedTypeCode,
            err: String(err).slice(0, 200),
          });
        }
      }
    }

    // ── Finalize classification on output ──────────────────────────────────

    aiOutput.classification.suggestedTypeCode = suggestedTypeCode;
    aiOutput.classification.suggestedTypeId = suggestedTypeId;

    // ── Build extracted fields JSON ────────────────────────────────────────

    const extractedFieldsJson: Record<string, unknown> = {};
    const fieldConfidenceJson: Record<string, unknown> = {};
    for (const field of aiOutput.extraction.fields) {
      extractedFieldsJson[field.fieldCode] = field.value;
      fieldConfidenceJson[field.fieldCode] = {
        score: field.confidenceScore,
        label: field.confidenceLabel,
        source_snippet: field.sourceSnippet ?? null,
      };
    }
    // Preserve everything else the AI read, so no information is lost.
    if (aiOutput.extraction.additionalFields.length > 0) {
      extractedFieldsJson.__additional_fields = aiOutput.extraction.additionalFields.map((a) => ({
        label: a.label,
        value: a.value,
        confidence: a.confidenceScore,
      }));
    }

    // ── Match detected entities against the parties database ───────────────
    const partyMatches = await matchEntitiesToParties(supabase, aiOutput.detectedEntities);
    const suggestedLinks = [
      ...(aiOutput.suggestedLinks ?? []),
      ...partyMatches,
    ];

    // ── Sanitize raw response (never log large text) ───────────────────────

    const sanitizedResponse = aiOutput.rawResponse
      ? {
          classification: buildSanitizedClassificationPayload(
            aiOutput.rawResponse.classification as Record<string, unknown> | undefined,
            aiOutput.classification.confidenceScore,
            aiOutput.classification.confidenceLabel,
            aiOutput.classification.suggestedTypeCode,
            aiOutput.classification.reason ?? ""
          ),
          suggested_title: aiOutput.rawResponse.suggested_title,
          suggested_description: aiOutput.rawResponse.suggested_description,
          field_count: (aiOutput.rawResponse.fields as unknown[])?.length ?? 0,
          warnings: aiOutput.rawResponse.warnings,
        }
      : {
          classification: buildSanitizedClassificationPayload(
            undefined,
            aiOutput.classification.confidenceScore,
            aiOutput.classification.confidenceLabel,
            aiOutput.classification.suggestedTypeCode,
            aiOutput.classification.reason ?? ""
          ),
        };

    // ── Store AI result ────────────────────────────────────────────────────

    const { data: result, error: resultErr } = await supabase
      .from("dms_ai_extraction_results")
      .insert({
        job_id: jobId,
        document_id: null,
        upload_session_id: uploadSessionId,
        result_type: "combined",
        ai_status: "pending_review",
        suggested_document_type_id: suggestedTypeId,
        classification_confidence: aiOutput.classification.confidenceLabel,
        classification_score: aiOutput.classification.confidenceScore,
        classification_reason: (aiOutput.classification.reason ?? "").slice(0, 500),
        extracted_fields_json: extractedFieldsJson,
        field_confidence_json: fieldConfidenceJson,
        suggested_links_json: suggestedLinks,
        issue_date_suggestion: aiOutput.extraction.issueDateSuggestion ?? null,
        expiry_date_suggestion: aiOutput.extraction.expiryDateSuggestion ?? null,
        suggested_title: aiOutput.extraction.suggestedTitle?.slice(0, 500) ?? null,
        suggested_description: aiOutput.extraction.suggestedDescription?.slice(0, 2000) ?? null,
        review_action: null,
        reviewed_by: null,
        reviewed_at: null,
        raw_response_json: sanitizedResponse,
        // For image-based docs (passports, Emirates IDs, certificates, scanned PDFs)
        // local OCR produces no text — use the AI's full_text_transcription instead.
        // For digital PDFs/DOCX, use the locally extracted text (more reliable).
        raw_ocr_text: (() => {
          const localText = ocrText && ocrText.trim().length > 0 ? ocrText.trim() : null;
          const aiTranscription = aiOutput.extraction.fullTextTranscription ?? null;
          const best = localText ?? aiTranscription;
          return best ? best.slice(0, 100_000) : null;
        })(),
        created_at: completedAt,
      })
      .select("id")
      .single();

    if (resultErr || !result) {
      await supabase
        .from("dms_ai_extraction_jobs")
        .update({ status: "failed", error_message: resultErr?.message ?? "Failed to store result", completed_at: completedAt, duration_ms: durationMs })
        .eq("id", jobId);
      await supabase
        .from("dms_upload_sessions")
        .update({ intake_status: "failed", updated_at: new Date().toISOString() })
        .eq("id", uploadSessionId);
      return { success: false, error: resultErr?.message ?? "Failed to store AI result" };
    }

    const resultId = result.id as number;

    // ── Complete job + update session ──────────────────────────────────────

    await supabase
      .from("dms_ai_extraction_jobs")
      .update({ status: "complete", completed_at: completedAt, duration_ms: durationMs })
      .eq("id", jobId);

    await supabase
      .from("dms_upload_sessions")
      .update({
        intake_status: "review_pending",
        review_status: "pending",
        ai_job_id: jobId,
        ai_result_id: resultId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", uploadSessionId);

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_upload_sessions",
      entity_id: uploadSessionId,
      entity_reference: sessionCode,
      action: "update",
      new_values: {
        event: "classification_completed",
        job_id: jobId,
        result_id: resultId,
        duration_ms: durationMs,
        suggested_type_code: suggestedTypeCode,
        classification_score: aiOutput.classification.confidenceScore,
        needs_human_review: aiOutput.classification.needsHumanReview ?? false,
        prompt_version: PROMPT_VERSION,
      },
    });

    if (
      aiOutput.classification.needsHumanReview ||
      (aiOutput.classification.confidenceScore != null &&
        aiOutput.classification.confidenceScore < 0.6)
    ) {
      await logAudit({
        module_code: "DMS",
        entity_name: "dms_upload_sessions",
        entity_id: uploadSessionId,
        entity_reference: sessionCode,
        action: "update",
        new_values: {
          event: "classification_low_confidence",
          result_id: resultId,
          classification_score: aiOutput.classification.confidenceScore,
          review_reason: aiOutput.classification.reviewReason ?? null,
        },
      });
    }

    revalidatePath("/dms/inbox");

    // ── Phase 12: Non-fatal review queue generation hook ─────────────────────
    // Creates review queue items for low-confidence or missing-field classifications.
    // NEVER blocks the intake workflow.
    try {
      const reviewEnabled = await isDmsAiReviewEnabled();
      if (reviewEnabled) {
        const classificationScore = aiOutput.classification.confidenceScore ?? 1;
        const needsReview = aiOutput.classification.needsHumanReview || classificationScore < 0.6;

        if (needsReview) {
          await upsertDmsReviewQueueItem({
            idempotencyKey:  `intake_classification:${uploadSessionId}:classification`,
            reviewType:      "intake_classification_review",
            sourceType:      "intake",
            sourceId:        String(uploadSessionId),
            uploadSessionId,
            aiResultId:      resultId,
            reasonCode:      "classification_low_confidence",
            reasonMessage:   `Classification confidence ${(classificationScore * 100).toFixed(0)}% is below threshold or reviewer flagged.`,
            confidence:      classificationScore,
            priority:        classificationScore < 0.4 ? "high" : "normal",
            payloadJson: {
              upload_session_id: uploadSessionId,
              session_code: sessionCode,
              suggested_type_code: suggestedTypeCode,
              classification_score: classificationScore,
            },
            createdBy: ctx.profile.id,
          });
        }
      }
    } catch (hookErr) {
      logger.warn("[ai-intake] review queue hook failed (non-fatal)", { uploadSessionId, error: String(hookErr).slice(0, 200) });
    }

    return {
      success: true,
      data: { sessionCode, status: "review_pending", message: "AI analysis complete" },
    };
  } catch (e) {
    logger.error("startAiIntakeFromUploadSession error", e);
    return { success: false, error: String(e) };
  }
}

// ── getAiIntakeSession ────────────────────────────────────────────────────────

export async function getAiIntakeSession(
  sessionCode: string
): Promise<ActionResult<IntakeSessionData>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewIntake(ctx)) return { success: false, error: "Permission denied" };

    const { data: session, error: sessionError } = await supabase
      .from("dms_upload_sessions")
      .select("*")
      .eq("session_code", sessionCode)
      .is("deleted_at", null)
      .single();

    if (sessionError || !session) return { success: false, error: "Intake session not found" };

    const typedSession = session as Record<string, unknown>;
    const sessionId = typedSession.id as number;
    const aiResultId = typedSession.ai_result_id as number | null;

    // Load AI result if available
    let aiResult: IntakeAiResultRow | null = null;
    if (aiResultId) {
      const { data: resultRow } = await supabase
        .from("dms_ai_extraction_results")
        .select(`id, upload_session_id, document_id, job_id, ai_status,
                 suggested_document_type_id, classification_confidence, classification_score,
                 classification_reason, extracted_fields_json, field_confidence_json,
                 suggested_links_json, issue_date_suggestion, expiry_date_suggestion, suggested_title,
                 suggested_description, review_action, raw_response_json, created_at,
                 suggested_type:dms_document_types!suggested_document_type_id(type_code, name_en)`)
        .eq("id", aiResultId)
        .single();
      if (resultRow) aiResult = resultRow as unknown as IntakeAiResultRow;
    }

    // Load any saved draft values
    const { data: draftRows } = await supabase
      .from("dms_intake_review_values")
      .select("*")
      .eq("upload_session_id", sessionId)
      .order("field_scope")
      .order("field_code");

    const intakeData: IntakeSessionData = {
      id: sessionId,
      session_code: typedSession.session_code as string,
      status: typedSession.status as string,
      intake_status: (typedSession.intake_status as string) ?? "uploaded",
      review_status: (typedSession.review_status as string) ?? "not_started",
      original_filename: typedSession.original_filename as string,
      mime_type: typedSession.mime_type as string,
      file_size_bytes: typedSession.file_size_bytes as number,
      temp_storage_path: typedSession.temp_storage_path as string | null,
      is_duplicate: typedSession.is_duplicate as boolean,
      duplicate_document_id: typedSession.duplicate_document_id as number | null,
      ai_result_id: aiResultId,
      document_id: typedSession.document_id as number | null,
      reviewed_by: typedSession.reviewed_by as number | null,
      discarded_at: typedSession.discarded_at as string | null,
      discard_reason: typedSession.discard_reason as string | null,
      uploaded_at: typedSession.uploaded_at as string ?? typedSession.created_at as string,
      ai_result: aiResult,
      draft_values: draftRows as unknown as IntakeReviewValueRow[] | null,
    };

    return { success: true, data: intakeData };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── getIntakeSessionSignedUrl ─────────────────────────────────────────────────

export async function getIntakeSessionSignedUrl(
  uploadSessionId: number
): Promise<ActionResult<{ url: string }>> {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewIntake(ctx)) return { success: false, error: "Permission denied" };

    const { data: session, error } = await supabase
      .from("dms_upload_sessions")
      .select("temp_storage_path, mime_type")
      .eq("id", uploadSessionId)
      .is("deleted_at", null)
      .single();

    if (error || !session) return { success: false, error: "Session not found" };
    if (!session.temp_storage_path) return { success: false, error: "No file path available" };

    const { data: signedUrlData, error: urlError } = await adminClient.storage
      .from("dms-temp")
      .createSignedUrl(session.temp_storage_path as string, 300); // 5 minutes

    if (urlError || !signedUrlData) return { success: false, error: "Failed to generate preview URL" };

    return { success: true, data: { url: signedUrlData.signedUrl } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── rerunMetadataExtractionForIntakeSession (Phase 3) ─────────────────────────

const rerunExtractionSchema = z.object({
  uploadSessionId: z.number().int().positive(),
  documentTypeId: z.number().int().positive(),
  mergeMode: z.enum(["fill_missing_only", "replace_ai_values", "keep_user_values"]),
});

export type RerunExtractionMergeMode = z.infer<typeof rerunExtractionSchema>["mergeMode"];

export async function rerunMetadataExtractionForIntakeSession(input: {
  uploadSessionId: number;
  documentTypeId: number;
  mergeMode: RerunExtractionMergeMode;
}): Promise<
  ActionResult<{
    extractedFieldsJson: Record<string, unknown>;
    fieldConfidenceJson: Record<string, unknown>;
    skipped: boolean;
  }>
> {
  try {
    const parsed = rerunExtractionSchema.parse(input);
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewIntake(ctx)) return { success: false, error: "Permission denied" };

    const { data: session, error: sessionErr } = await supabase
      .from("dms_upload_sessions")
      .select("id, session_code, intake_status, ai_result_id, original_filename")
      .eq("id", parsed.uploadSessionId)
      .is("deleted_at", null)
      .single();

    if (sessionErr || !session) return { success: false, error: "Upload session not found" };

    const intakeStatus = (session as Record<string, unknown>).intake_status as string;
    if (intakeStatus === "approved" || intakeStatus === "discarded") {
      return { success: false, error: "Cannot re-run extraction for a completed intake" };
    }

    const aiResultId = (session as Record<string, unknown>).ai_result_id as number | null;
    if (!aiResultId) return { success: false, error: "No AI result available for this session" };

    const { data: aiResult, error: resultErr } = await supabase
      .from("dms_ai_extraction_results")
      .select("id, raw_ocr_text, extracted_fields_json, field_confidence_json, suggested_document_type_id")
      .eq("id", aiResultId)
      .single();

    if (resultErr || !aiResult) return { success: false, error: "AI result not found" };

    const sessionCode = (session as Record<string, unknown>).session_code as string;
    const originalFilename = (session as Record<string, unknown>).original_filename as string;

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_upload_sessions",
      entity_id: parsed.uploadSessionId,
      entity_reference: sessionCode,
      action: "update",
      new_values: {
        event: "metadata_extraction_rerun_started",
        document_type_id: parsed.documentTypeId,
        merge_mode: parsed.mergeMode,
      },
    });

    if (parsed.mergeMode === "keep_user_values") {
      await logAudit({
        module_code: "DMS",
        entity_name: "dms_upload_sessions",
        entity_id: parsed.uploadSessionId,
        entity_reference: sessionCode,
        action: "update",
        new_values: { event: "metadata_extraction_values_kept", merge_mode: parsed.mergeMode },
      });
      return {
        success: true,
        data: {
          extractedFieldsJson: (aiResult.extracted_fields_json as Record<string, unknown>) ?? {},
          fieldConfidenceJson: (aiResult.field_confidence_json as Record<string, unknown>) ?? {},
          skipped: true,
        },
      };
    }

    const ocrText = ((aiResult.raw_ocr_text as string | null) ?? "").trim();
    if (!ocrText) {
      return { success: false, error: "No OCR text available — cannot re-run extraction without re-running full AI intake" };
    }

    const { data: typeRow } = await supabase
      .from("dms_document_types")
      .select("id, type_code, name_en")
      .eq("id", parsed.documentTypeId)
      .single();

    if (!typeRow) return { success: false, error: "Document type not found" };

    const typeSpecificFields = await loadMetadataFieldsForDocumentType(
      supabase,
      parsed.documentTypeId,
      "intake"
    );
    if (typeSpecificFields.length === 0) {
      return { success: false, error: "No metadata fields defined for this document type" };
    }

    const { provider } = await getDmsAiProvider();
    if (!provider.isConfigured()) {
      return { success: false, error: "No AI provider configured" };
    }

    const typeCandidates: DmsAiDocumentTypeCandidate[] = [
      {
        typeCode: typeRow.type_code as string,
        nameEn: typeRow.name_en as string,
        description: null,
        categoryName: null,
      },
    ];

    let extractOutput: DmsAiOutput;
    try {
      extractOutput = await provider.analyze({
        ocrText,
        imageFiles: [],
        currentTypeCode: typeRow.type_code as string,
        typeCandidates,
        metadataFields: typeSpecificFields,
        originalFilename,
      });
    } catch (err) {
      return { success: false, error: String(err) };
    }

    const existingExtracted = (aiResult.extracted_fields_json as Record<string, unknown>) ?? {};
    const existingConfidence = (aiResult.field_confidence_json as Record<string, unknown>) ?? {};

    const newExtracted: Record<string, unknown> = { ...existingExtracted };
    const newConfidence: Record<string, unknown> = { ...existingConfidence };

    for (const field of extractOutput.extraction.fields) {
      const existingVal = existingExtracted[field.fieldCode];
      const isEmpty =
        existingVal == null ||
        (typeof existingVal === "string" && existingVal.trim() === "");

      if (parsed.mergeMode === "fill_missing_only" && !isEmpty) continue;

      newExtracted[field.fieldCode] = field.value;
      newConfidence[field.fieldCode] = {
        score: field.confidenceScore,
        label: field.confidenceLabel,
        source_snippet: field.sourceSnippet ?? null,
      };
    }

    if (extractOutput.extraction.additionalFields.length > 0) {
      newExtracted.__additional_fields = extractOutput.extraction.additionalFields.map((a) => ({
        label: a.label,
        value: a.value,
        confidence: a.confidenceScore,
      }));
    }

    const { error: updateErr } = await supabase
      .from("dms_ai_extraction_results")
      .update({
        extracted_fields_json: newExtracted,
        field_confidence_json: newConfidence,
      })
      .eq("id", aiResultId);

    if (updateErr) return { success: false, error: updateErr.message };

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_upload_sessions",
      entity_id: parsed.uploadSessionId,
      entity_reference: sessionCode,
      action: "update",
      new_values: {
        event: "metadata_extraction_rerun_completed",
        merge_mode: parsed.mergeMode,
        fields_updated: extractOutput.extraction.fields.length,
        document_type_id: parsed.documentTypeId,
      },
    });

    if (parsed.mergeMode === "replace_ai_values") {
      await logAudit({
        module_code: "DMS",
        entity_name: "dms_upload_sessions",
        entity_id: parsed.uploadSessionId,
        entity_reference: sessionCode,
        action: "update",
        new_values: { event: "metadata_extraction_values_replaced" },
      });
    }

    revalidatePath(`/dms/intake/${sessionCode}`);

    return {
      success: true,
      data: {
        extractedFieldsJson: newExtracted,
        fieldConfidenceJson: newConfidence,
        skipped: false,
      },
    };
  } catch (e) {
    logger.error("rerunMetadataExtractionForIntakeSession error", e);
    return { success: false, error: String(e) };
  }
}

// ── saveAiIntakeDraft ─────────────────────────────────────────────────────────

export async function saveAiIntakeDraft(
  uploadSessionId: number,
  draftValues: {
    fieldScope: string;
    fieldCode: string;
    fieldLabel?: string | null;
    fieldType?: string | null;
    reviewedValueJson: unknown;
    suggestedValueJson?: unknown;
    confidenceScore?: number | null;
    confidenceLabel?: string | null;
    sourceSnippet?: string | null;
    reviewStatus?: string;
  }[]
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewIntake(ctx)) return { success: false, error: "Permission denied" };

    // Verify session belongs to a valid intake
    const { data: session, error: sessionError } = await supabase
      .from("dms_upload_sessions")
      .select("id, intake_status")
      .eq("id", uploadSessionId)
      .is("deleted_at", null)
      .single();

    if (sessionError || !session) return { success: false, error: "Upload session not found" };

    const intakeStatus = (session as Record<string, unknown>).intake_status as string;
    if (intakeStatus === "approved" || intakeStatus === "discarded") {
      return { success: false, error: "Cannot save draft for a completed or discarded intake" };
    }

    const now = new Date().toISOString();

    // Upsert each field value
    for (const v of draftValues) {
      await supabase
        .from("dms_intake_review_values")
        .upsert(
          {
            upload_session_id: uploadSessionId,
            field_scope: v.fieldScope,
            field_code: v.fieldCode,
            field_label: v.fieldLabel ?? null,
            field_type: v.fieldType ?? null,
            suggested_value_json: v.suggestedValueJson ?? null,
            reviewed_value_json: v.reviewedValueJson,
            confidence_score: v.confidenceScore ?? null,
            confidence_label: v.confidenceLabel ?? null,
            source_snippet: v.sourceSnippet ?? null,
            review_status: v.reviewStatus ?? "edited",
            updated_at: now,
          },
          { onConflict: "upload_session_id,field_scope,field_code" }
        );
    }

    // Update review status
    await supabase
      .from("dms_upload_sessions")
      .update({ review_status: "in_review", updated_at: now })
      .eq("id", uploadSessionId);

    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── retryAiIntake ─────────────────────────────────────────────────────────────

export async function retryAiIntake(
  uploadSessionId: number
): Promise<ActionResult<{ sessionCode: string; status: string }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canStartIntake(ctx)) return { success: false, error: "Permission denied" };

    // Reset intake status before retrying
    await supabase
      .from("dms_upload_sessions")
      .update({
        intake_status: "uploaded",
        review_status: "not_started",
        ai_result_id: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", uploadSessionId);

    return startAiIntakeFromUploadSession({ uploadSessionId });
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── discardAiIntake ───────────────────────────────────────────────────────────

export async function discardAiIntake(
  uploadSessionId: number,
  reason?: string
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewIntake(ctx)) return { success: false, error: "Permission denied" };

    const { data: session, error: sessionError } = await supabase
      .from("dms_upload_sessions")
      .select("id, session_code, intake_status")
      .eq("id", uploadSessionId)
      .is("deleted_at", null)
      .single();

    if (sessionError || !session) return { success: false, error: "Upload session not found" };
    const typedSession = session as Record<string, unknown>;

    if (typedSession.intake_status === "approved") {
      return { success: false, error: "Cannot discard an already-approved intake" };
    }

    const now = new Date().toISOString();
    await supabase
      .from("dms_upload_sessions")
      .update({
        intake_status: "discarded",
        review_status: "discarded",
        discarded_at: now,
        discard_reason: reason?.slice(0, 500) ?? null,
        updated_at: now,
      })
      .eq("id", uploadSessionId);

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_upload_sessions",
      entity_id: uploadSessionId,
      entity_reference: typedSession.session_code as string,
      action: "update",
      new_values: { event: "ai_intake_discarded", reason: reason ?? null, discarded_by: ctx.profile.id },
    });

    revalidatePath("/dms/inbox");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── approveAiIntakeAndCreateDocument ─────────────────────────────────────────

export async function approveAiIntakeAndCreateDocument(
  input: ApproveIntakeInput
): Promise<ActionResult<{ documentId: number; documentNo: string }>> {
  try {
    const parsed = ApproveIntakeSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Validation error" };

    const {
      uploadSessionId,
      title,
      documentTypeId,
      description,
      issueDate,
      expiryDate,
      confidentialityLevel,
      owningCompanyId,
      owningBranchId,
      partyId,
      metadataValues,
      tagIds,
      links,
      aiResultId,
      standardFileName,
    } = parsed.data;

    const supabase = await createClient();
    const adminClient = createAdminClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canApproveIntake(ctx)) return { success: false, error: "Permission denied: requires dms.documents.review_ai or dms.documents.upload" };

    // ── Validate dates ────────────────────────────────────────────────────

    if (issueDate && expiryDate && expiryDate < issueDate) {
      return { success: false, error: "Expiry date must be on or after issue date" };
    }

    // ── Load upload session ────────────────────────────────────────────────

    const { data: session, error: sessionError } = await supabase
      .from("dms_upload_sessions")
      .select("*")
      .eq("id", uploadSessionId)
      .is("deleted_at", null)
      .single();

    if (sessionError || !session) return { success: false, error: "Upload session not found" };
    const typedSession = session as Record<string, unknown>;
    const sessionCode = typedSession.session_code as string;

    // ── Idempotency: already approved ─────────────────────────────────────

    if (typedSession.intake_status === "approved") {
      const existingDocId = typedSession.document_id as number | null;
      if (existingDocId) {
        const { data: existingDoc } = await supabase
          .from("dms_documents")
          .select("id, document_no")
          .eq("id", existingDocId)
          .single();
        if (existingDoc) {
          return { success: true, data: { documentId: existingDocId, documentNo: existingDoc.document_no as string } };
        }
      }
      return { success: false, error: "Intake already approved but document reference is missing" };
    }

    if (typedSession.intake_status === "discarded") {
      return { success: false, error: "Cannot approve a discarded intake" };
    }

    if (!typedSession.temp_storage_path) return { success: false, error: "Temporary file path is missing" };

    // ── Load document type ────────────────────────────────────────────────

    const { data: docType, error: typeError } = await supabase
      .from("dms_document_types")
      .select("id, type_code, category_id, default_confidentiality, is_active, requires_expiry_tracking")
      .eq("id", documentTypeId)
      .single();

    if (typeError || !docType) return { success: false, error: "Document type not found" };
    if (!(docType.is_active as boolean)) return { success: false, error: "Selected document type is not active" };

    const requiresExpiryTracking = (docType.requires_expiry_tracking as boolean) ?? false;

    // ── Generate document number ───────────────────────────────────────────

    const { data: docNoData, error: docNoError } = await supabase
      .rpc("generate_next_reference_number", { p_rule_code: "MASTER_DMS_DOCUMENT" });

    const docNoRows = docNoData as Array<{ generated_reference_number: string }>;
    if (docNoError || !docNoRows || docNoRows.length === 0 || !docNoRows[0]?.generated_reference_number) {
      return { success: false, error: docNoError?.message ?? "Failed to generate document number" };
    }

    const documentNo = String(docNoRows[0].generated_reference_number);
    const userId = ctx.profile.id;
    const confidentiality = confidentialityLevel ?? (docType.default_confidentiality as string | null) ?? "internal";

    // ── Resolve and validate standard filename ─────────────────────────────

    const resolvedFileName = await resolveStandardFileNameForIntakeApprove({
      uploadSessionId,
      documentTypeId,
      expiryDate: expiryDate ?? null,
      documentNo,
      partyId: partyId ?? null,
      links: links?.map((l) => ({ entityType: l.entityType, entityId: l.entityId })),
      metadataValues,
      standardFileName: standardFileName ?? null,
      originalFilename: typedSession.original_filename as string,
      aiResultId: aiResultId ?? null,
      description: description ?? null,
      title,
    });

    const nameValidation = validateStandardFileName(resolvedFileName, { requiresExpiryTracking });
    if (!nameValidation.valid) {
      return {
        success: false,
        error: `Standard file name is incomplete (missing: ${nameValidation.missing.join(", ")}). Fix on the review screen before approving.`,
      };
    }

    // ── Reserve document ID for deterministic storage path ─────────────────

    const { data: reservedIdData, error: reserveIdError } = await supabase
      .rpc("reserve_dms_document_id");

    if (reserveIdError || !reservedIdData) {
      return { success: false, error: reserveIdError?.message ?? "Failed to reserve document ID" };
    }

    const reservedDocumentId = Number(reservedIdData);

    // ── Delegate to transactional approve saga ─────────────────────────────

    const effectiveAiResultId = aiResultId ?? (typedSession.ai_result_id as number | null);

    const sagaResult = await runApproveAiIntakeSaga(supabase, adminClient, {
      mode: "single_file_new_document",
      uploadSessionId,
      sessionCode,
      tempStoragePath: typedSession.temp_storage_path as string,
      originalFilename: typedSession.original_filename as string,
      mimeType: typedSession.mime_type as string,
      fileSizeBytes: typedSession.file_size_bytes as number,
      sha256Hash: (typedSession.sha256_hash as string | null) ?? null,
      documentId: reservedDocumentId,
      documentNo,
      title,
      description: description ?? null,
      documentTypeId,
      categoryId: docType.category_id as number,
      typeCode: docType.type_code as string,
      confidentialityLevel: confidentiality,
      owningCompanyId: owningCompanyId ?? null,
      owningBranchId: owningBranchId ?? null,
      partyId: partyId ?? null,
      issueDate: issueDate ?? null,
      expiryDate: expiryDate ?? null,
      resolvedFileName,
      createFileVersion: true,
      metadataValues: metadataValues ?? [],
      tagIds: tagIds ?? [],
      links: links ?? [],
      aiResultId: effectiveAiResultId,
      userId,
    });

    if (!sagaResult.success) return sagaResult;

    // ── Revalidate ────────────────────────────────────────────────────────

    revalidatePath("/dms/documents");
    revalidatePath("/dms/inbox");
    revalidatePath(`/dms/intake/${sessionCode}`);

    return { success: true, data: sagaResult.data };
  } catch (e) {
    logger.error("approveAiIntakeAndCreateDocument error", e);
    return { success: false, error: String(e) };
  }
}
