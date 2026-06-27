"use server";

/**
 * DMS.10 — AI Document Classification & Extraction Server Actions
 *
 * AI results are SUGGESTIONS only. Nothing is auto-saved to metadata.
 * OCR text and AI prompts are NEVER logged.
 * Confidential documents (hr/legal/executive) require dms.admin.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { getDmsAiProvider } from "@/lib/dms/ai/factory";
import { upsertDmsReviewQueueItem, isDmsAiReviewEnabled } from "@/lib/dms/review-queue/review-queue-upsert";
import { logger } from "@/lib/logger";
import { hashOcrText, PROMPT_VERSION } from "@/lib/dms/ai/prompt-builders";
import type {
  DmsAiDocumentTypeCandidate,
  DmsAiImageFile,
  DmsAiMetadataField,
  DmsAiOutput,
  DmsClassificationCandidatePacket,
} from "@/lib/dms/ai/types";
import { revalidatePath } from "next/cache";
import { extractFileContent } from "@/lib/dms/file-content-extractor";
import { persistFileOcrResult } from "@/lib/dms/ocr/persist-file-ocr-result";
import { loadMetadataFieldsForDocumentType } from "@/lib/dms/ai/load-metadata-fields";
import { buildClassificationCandidates } from "@/lib/dms/ai/classification-candidate-builder";
import { buildSanitizedClassificationPayload } from "@/lib/dms/ai/classification-output";
import { logDmsAiUsage } from "@/lib/ai/observability/log-dms-ai-usage";

// ── Types ────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type DmsAiJobRow = {
  id: number;
  document_id: number | null;
  file_id: number | null;
  job_type: string;
  provider: string | null;
  model: string | null;
  status: string;
  run_source: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
  retry_count: number;
  created_at: string;
};

export type DmsAiResultRow = {
  id: number;
  job_id: number;
  document_id: number | null;
  file_id: number | null;
  result_type: string | null;
  ai_status: string;
  suggested_document_type_id: number | null;
  classification_confidence: string | null;
  classification_score: number | null;
  classification_reason: string | null;
  extracted_fields_json: Record<string, unknown> | null;
  field_confidence_json: Record<string, unknown> | null;
  suggested_links_json: unknown[] | null;
  expiry_date_suggestion: string | null;
  suggested_title: string | null;
  suggested_description: string | null;
  review_action: string | null;
  reviewed_by: number | null;
  reviewed_at: string | null;
  raw_response_json: Record<string, unknown> | null;
  created_at: string;
  // joined
  suggested_type?: { type_code: string; name_en: string } | null;
};

export type DmsAiAnalysisStatus = {
  document_id: number;
  ai_status: string;
  has_results: boolean;
  latest_result: DmsAiResultRow | null;
  pending_jobs: number;
};

// ── Confidential document levels that require dms.admin ─────────────────────

const RESTRICTED_CONFIDENTIALITY = new Set(["hr", "legal", "executive"]);

// ── Permission helpers ────────────────────────────────────────────────────────

function canViewAi(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.ai.view") ||
    hasPermission(ctx, "dms.documents.view") ||
    hasPermission(ctx, "dms.documents.review_ai") ||
    hasPermission(ctx, "dms.admin")
  );
}

function canRunAi(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.ai.run") ||
    hasPermission(ctx, "dms.documents.review_ai") ||
    hasPermission(ctx, "dms.admin")
  );
}

function canAdminAi(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "dms.admin") || hasPermission(ctx, "dms.documents.review_ai");
}

// ── getDmsAiAnalysisStatus ────────────────────────────────────────────────────

export async function getDmsAiAnalysisStatus(
  documentId: number
): Promise<ActionResult<DmsAiAnalysisStatus>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewAi(ctx)) return { success: false, error: "Permission denied" };

    const { data: doc, error: docErr } = await supabase
      .from("dms_documents")
      .select("id, ai_status, confidentiality_level")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();
    if (docErr || !doc) return { success: false, error: "Document not found" };

    // Confidential check
    if (RESTRICTED_CONFIDENTIALITY.has(doc.confidentiality_level as string)) {
      if (!hasPermission(ctx, "dms.admin")) {
        return { success: false, error: "AI analysis not permitted for confidential documents without dms.admin permission" };
      }
    }

    // Latest result
    const { data: results } = await supabase
      .from("dms_ai_extraction_results")
      .select(`id, job_id, document_id, file_id, result_type, ai_status,
               suggested_document_type_id, classification_confidence, classification_score,
               classification_reason, extracted_fields_json, field_confidence_json,
               suggested_links_json, expiry_date_suggestion, suggested_title,
               suggested_description, review_action, reviewed_by, reviewed_at,
               raw_response_json, created_at,
               suggested_type:dms_document_types!suggested_document_type_id(type_code, name_en)`)
      .eq("document_id", documentId)
      .neq("ai_status", "superseded")
      .order("created_at", { ascending: false })
      .limit(1);

    const latestResult = results && results.length > 0
      ? (results[0] as unknown as DmsAiResultRow)
      : null;

    // Pending jobs count
    const { count } = await supabase
      .from("dms_ai_extraction_jobs")
      .select("id", { count: "exact", head: true })
      .eq("document_id", documentId)
      .in("job_type", ["classify", "extract", "classify_extract"])
      .in("status", ["pending", "processing"]);

    return {
      success: true,
      data: {
        document_id: documentId,
        ai_status: (doc.ai_status as string) ?? "not_required",
        has_results: !!latestResult,
        latest_result: latestResult,
        pending_jobs: count ?? 0,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── getDmsAiExtractionResults ─────────────────────────────────────────────────

export async function getDmsAiExtractionResults(
  documentId: number
): Promise<ActionResult<DmsAiResultRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewAi(ctx)) return { success: false, error: "Permission denied" };

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_ai_extraction_results",
      entity_id: documentId,
      entity_reference: `DOC-${documentId}`,
      action: "view",
      new_values: { event: "ai_result_viewed", document_id: documentId },
    });

    const { data, error } = await supabase
      .from("dms_ai_extraction_results")
      .select(`id, job_id, document_id, file_id, result_type, ai_status,
               suggested_document_type_id, classification_confidence, classification_score,
               classification_reason, extracted_fields_json, field_confidence_json,
               suggested_links_json, expiry_date_suggestion, suggested_title,
               suggested_description, review_action, reviewed_by, reviewed_at,
               raw_response_json, created_at,
               suggested_type:dms_document_types!suggested_document_type_id(type_code, name_en)`)
      .eq("document_id", documentId)
      .order("created_at", { ascending: false })
      .limit(10);

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data ?? []) as unknown as DmsAiResultRow[] };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── getDmsAiExtractionResult ──────────────────────────────────────────────────

export async function getDmsAiExtractionResult(
  resultId: number
): Promise<ActionResult<DmsAiResultRow>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewAi(ctx)) return { success: false, error: "Permission denied" };

    const { data, error } = await supabase
      .from("dms_ai_extraction_results")
      .select(`id, job_id, document_id, file_id, result_type, ai_status,
               suggested_document_type_id, classification_confidence, classification_score,
               classification_reason, extracted_fields_json, field_confidence_json,
               suggested_links_json, expiry_date_suggestion, suggested_title,
               suggested_description, review_action, reviewed_by, reviewed_at,
               raw_response_json, created_at,
               suggested_type:dms_document_types!suggested_document_type_id(type_code, name_en)`)
      .eq("id", resultId)
      .single();

    if (error || !data) return { success: false, error: "Result not found" };
    return { success: true, data: data as unknown as DmsAiResultRow };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── runDmsAiAnalysisForDocument ───────────────────────────────────────────────

const RunAnalysisSchema = z.object({
  documentId: z.number().int().positive(),
  jobType: z.enum(["classify", "extract", "classify_extract"]).optional().default("classify_extract"),
  forceRun: z.boolean().optional().default(false),
});

export async function runDmsAiAnalysisForDocument(
  input: z.input<typeof RunAnalysisSchema>
): Promise<ActionResult<{ job_id: number; result_id: number | null; status: string; message: string }>> {
  try {
    const parsed = RunAnalysisSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };

    const { documentId, jobType, forceRun } = parsed.data;
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canRunAi(ctx)) return { success: false, error: "Permission denied" };

    // Load document
    const { data: doc, error: docErr } = await supabase
      .from("dms_documents")
      .select("id, title, document_type_id, confidentiality_level, current_version_id, ocr_text_available")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();
    if (docErr || !doc) return { success: false, error: "Document not found" };

    // Confidential restriction
    if (RESTRICTED_CONFIDENTIALITY.has(doc.confidentiality_level as string)) {
      if (!hasPermission(ctx, "dms.admin")) {
        return { success: false, error: "AI analysis not permitted for confidential documents without dms.admin" };
      }
    }

    // Guard existing pending job
    if (!forceRun) {
      const { count } = await supabase
        .from("dms_ai_extraction_jobs")
        .select("id", { count: "exact", head: true })
        .eq("document_id", documentId)
        .in("status", ["pending", "processing"]);
      if ((count ?? 0) > 0) {
        return { success: false, error: "An AI analysis job is already running for this document. Wait for it to complete or use forceRun." };
      }
    }

    // ── Collect all document files ─────────────────────────────────────────────
    // We download every attached file and auto-extract content so the user
    // never needs to run OCR separately. One click = AI analysis.
    const { data: allFiles } = await supabase
      .from("dms_document_files")
      .select("id, file_name, mime_type, storage_bucket, storage_path, ocr_text, ocr_status")
      .eq("document_id", documentId)
      .order("created_at", { ascending: true });

    if (!allFiles || allFiles.length === 0) {
      return { success: false, error: "No files are attached to this document. Upload a file and then run AI analysis." };
    }

    const adminClient = await createAdminClient();
    const ocrParts: string[] = [];
    const imageFiles: DmsAiImageFile[] = [];
    // Track files that contributed images (to persist transcription after AI call)
    const imageOnlyFileIds: number[] = [];

    for (const file of allFiles) {
      const mimeType = (file.mime_type as string ?? "").toLowerCase().split(";")[0].trim();
      const storagePath = file.storage_path as string | null;
      const storageBucket = (file.storage_bucket as string | null) ?? "dms-documents";

      if (!storagePath) continue;

      // ── Use cached OCR text when available (any file type) ───────────────────
      if (file.ocr_status === "complete" && typeof file.ocr_text === "string" && file.ocr_text.trim()) {
        ocrParts.push(`--- ${file.file_name} ---\n${file.ocr_text}`);
        continue;
      }

      // ── Download and extract via unified extractor ────────────────────────────
      try {
        const { data: blob } = await adminClient.storage.from(storageBucket).download(storagePath);
        if (!blob) continue;
        const buffer = Buffer.from(await blob.arrayBuffer());

        const content = await extractFileContent(buffer, mimeType, file.file_name as string);
        if (!content.hasContent) continue;

        if (content.text) {
          ocrParts.push(`--- ${file.file_name} ---\n${content.text}`);
          // Cache text immediately (no AI needed for digital text)
          await persistFileOcrResult({
            supabase,
            fileId: file.id as number,
            documentId,
            text: content.text,
            provider: "vision",
            model: content.method ?? "pdf-text-layer",
            performedBy: ctx.profile.id,
            source: "ocr",
          });
        }

        // Collect up to 4 images per file for vision (avoids token overload)
        if (content.images.length > 0) {
          const pagesToUse = content.images.slice(0, 4);
          for (const img of pagesToUse) {
            imageFiles.push({ fileName: img.fileName, base64: img.base64, mimeType: img.mimeType });
          }
          imageOnlyFileIds.push(file.id as number);
          if (content.images.length > 4) {
            // Warn about capped pages (non-fatal, handled in AI prompt warnings)
          }
        }
      } catch { /* skip this file on download/extract error */ }
    }

    if (ocrParts.length === 0 && imageFiles.length === 0) {
      return {
        success: false,
        error: "No supported file content found. Supported types: PDF (text layer or scanned pages), images (JPG, PNG, WebP, TIFF), DOCX, and XLSX.",
      };
    }

    const combinedOcr = ocrParts.join("\n\n");
    const inputHash = hashOcrText(combinedOcr + `+images:${imageFiles.length}`);

    // Get AI provider
    const { provider, configCode, configId } = await getDmsAiProvider();
    const providerNotConfigured = !provider.isConfigured();

    // Create job record (always, even if provider not configured)
    const { data: job, error: jobErr } = await supabase
      .from("dms_ai_extraction_jobs")
      .insert({
        document_id: documentId,
        job_type: jobType,
        provider: provider.providerCode,
        model: provider.modelId ?? null,
        status: providerNotConfigured ? "provider_not_configured" : "pending",
        run_source: "manual",
        input_text_hash: inputHash,
        prompt_version: PROMPT_VERSION,
        provider_config_id: configId ?? null,
        created_by: ctx.profile.id,
      })
      .select("id")
      .single();

    if (jobErr || !job) return { success: false, error: "Failed to create AI job" };
    const jobId = job.id as number;

    if (providerNotConfigured) {
      await insertDocumentEvent(supabase, documentId, "ai_analysis_failed", ctx.profile.id, {
        job_id: jobId,
        reason: "provider_not_configured",
      });
      return {
        success: false,
        data: { job_id: jobId, result_id: null, status: "provider_not_configured", message: "No AI provider is configured or enabled. Please configure one in Administration → Settings → AI Settings." },
        error: "No AI provider configured",
      };
    }

    // Load document type candidates for classification
    const docTypeId = doc.document_type_id as number | null;
    const useMetadataAwareClassification = !docTypeId;

    let typeCandidates: DmsAiDocumentTypeCandidate[] = [];
    let classificationPackets: DmsClassificationCandidatePacket[] | undefined;
    let typeRows: Array<{ id: number; type_code: string; name_en?: string }> = [];

    if (useMetadataAwareClassification) {
      const built = await buildClassificationCandidates(supabase, combinedOcr);
      typeCandidates = built.typeCandidates;
      classificationPackets = built.packets;
      typeRows = built.scoredTypes.map((s) => ({
        id: s.id,
        type_code: s.type_code,
        name_en: s.name_en,
      }));
    } else {
      const { data: rows } = await supabase
        .from("dms_document_types")
        .select("id, type_code, name_en, description, category_id")
        .eq("is_active", true)
        .is("deleted_at", null)
        .limit(30);
      typeRows = (rows ?? []) as Array<{ id: number; type_code: string; name_en?: string }>;
      typeCandidates = typeRows.map((t) => ({
        typeCode: t.type_code as string,
        nameEn: (t.name_en as string) ?? t.type_code,
        description: null,
        categoryName: null,
      }));
    }

    const metadataFields: DmsAiMetadataField[] = docTypeId
      ? await loadMetadataFieldsForDocumentType(supabase, docTypeId, "analysis")
      : [];

    // Get current type code
    const currentType = typeCandidates.find((t) => {
      const docTypeId = doc.document_type_id as number | null;
      return docTypeId && typeRows?.find((r) => r.id === docTypeId)?.type_code === t.typeCode;
    });

    // Mark processing
    await supabase
      .from("dms_ai_extraction_jobs")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", jobId);

    await supabase
      .from("dms_documents")
      .update({ ai_status: "processing" })
      .eq("id", documentId);

    await insertDocumentEvent(supabase, documentId, "ai_analysis_started", ctx.profile.id, {
      job_id: jobId,
      provider: provider.providerCode,
      model: provider.modelId,
      text_files: ocrParts.length,
      image_files: imageFiles.length,
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_ai_extraction_jobs",
      entity_id: jobId,
      entity_reference: `JOB-${jobId}`,
      action: "create",
      new_values: { event: "ai_analysis_started", document_id: documentId, provider: provider.providerCode },
    });

    // Run AI analysis
    const startMs = Date.now();
    let aiOutput: DmsAiOutput | null = null;
    let aiError: string | null = null;

    try {
      aiOutput = await provider.analyze({
        ocrText: combinedOcr,
        imageFiles,
        currentTypeCode: currentType?.typeCode ?? null,
        typeCandidates,
        metadataFields,
        classificationPackets,
      });
    } catch (err) {
      aiError = String(err);
    }

    const durationMs = Date.now() - startMs;
    const completedAt = new Date().toISOString();

    // Log AI usage (non-fatal)
    void logDmsAiUsage({
      providerConfigId: configId ?? null,
      featureArea: "DMS_AI_ANALYSIS",
      operationType: "classify_extract",
      modelId: provider.modelId,
      status: aiError ? "failed" : "success",
      inputTokenCount: aiOutput?.promptTokens ?? null,
      outputTokenCount: aiOutput?.completionTokens ?? null,
      durationMs,
      errorMessage: aiError,
      documentId,
      createdBy: ctx.profile.id,
      metadata: {
        prompt_version: PROMPT_VERSION,
        document_type_id: doc.document_type_id as number | null,
        suggested_document_type_id: aiOutput?.classification?.suggestedTypeId ?? null,
        input_char_count: combinedOcr.length + imageFiles.length * 500,
        image_file_count: imageFiles.length,
        text_file_count: ocrParts.length,
      },
    });

    if (aiError || !aiOutput) {
      await supabase
        .from("dms_ai_extraction_jobs")
        .update({ status: "failed", error_message: (aiError ?? "").slice(0, 500), completed_at: completedAt, duration_ms: durationMs })
        .eq("id", jobId);
      await supabase
        .from("dms_documents")
        .update({ ai_status: "failed" })
        .eq("id", documentId);
      await insertDocumentEvent(supabase, documentId, "ai_analysis_failed", ctx.profile.id, {
        job_id: jobId,
        error_summary: (aiError ?? "").slice(0, 200),
        duration_ms: durationMs,
      });
      await logAudit({
        module_code: "DMS",
        entity_name: "dms_ai_extraction_jobs",
        entity_id: jobId,
        entity_reference: `JOB-${jobId}`,
        action: "update",
        new_values: { event: "ai_analysis_failed", duration_ms: durationMs },
      });
      return { success: false, error: aiError ?? "AI analysis failed" };
    }

    // Resolve suggested type ID
    const suggestedTypeCode = aiOutput.classification.suggestedTypeCode;
    let suggestedTypeId: number | null = null;
    if (suggestedTypeCode) {
      const matched = typeRows?.find((t) => t.type_code === suggestedTypeCode);
      if (matched) {
        suggestedTypeId = matched.id as number;
        aiOutput.classification.suggestedTypeId = suggestedTypeId;
      }
    }

    // Build extracted_fields_json
    const extractedFieldsJson: Record<string, unknown> = {};
    for (const field of aiOutput.extraction.fields) {
      extractedFieldsJson[field.fieldCode] = field.value;
    }

    // Build field_confidence_json
    const fieldConfidenceJson: Record<string, unknown> = {};
    for (const field of aiOutput.extraction.fields) {
      fieldConfidenceJson[field.fieldCode] = {
        score: field.confidenceScore,
        label: field.confidenceLabel,
        source_snippet: field.sourceSnippet ?? null,
      };
    }

    // Sanitize raw response (remove any keys that might contain large text)
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
          fields: (aiOutput.rawResponse.fields as unknown[])?.length ?? 0,
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

    // Store result
    const { data: result, error: resultErr } = await supabase
      .from("dms_ai_extraction_results")
      .insert({
        job_id: jobId,
        document_id: documentId,
        result_type: "combined",
        ai_status: "pending_review",
        suggested_document_type_id: suggestedTypeId,
        classification_confidence: aiOutput.classification.confidenceLabel,
        classification_score: aiOutput.classification.confidenceScore,
        classification_reason: aiOutput.classification.reason?.slice(0, 500) ?? null,
        extracted_fields_json: Object.keys(extractedFieldsJson).length > 0 ? extractedFieldsJson : null,
        field_confidence_json: Object.keys(fieldConfidenceJson).length > 0 ? fieldConfidenceJson : null,
        suggested_links_json: aiOutput.suggestedLinks.length > 0 ? aiOutput.suggestedLinks : null,
        issue_date_suggestion: aiOutput.extraction.issueDateSuggestion ?? null,
        expiry_date_suggestion: aiOutput.extraction.expiryDateSuggestion ?? null,
        suggested_title: aiOutput.extraction.suggestedTitle,
        suggested_description: aiOutput.extraction.suggestedDescription,
        raw_ocr_text: null, // never stored — already in dms_document_files
        raw_response_json: sanitizedResponse as Record<string, unknown> | null,
      })
      .select("id")
      .single();

    if (resultErr || !result) {
      aiError = resultErr?.message ?? "Failed to save AI result";
    }

    const resultId = result?.id as number | null;

    // Update job as completed
    await supabase
      .from("dms_ai_extraction_jobs")
      .update({ status: "completed", completed_at: completedAt, duration_ms: durationMs, model: provider.modelId ?? null })
      .eq("id", jobId);

    // ── Persist fullTextTranscription from vision to files/content (non-fatal) ──
    // When images were sent to vision (scanned PDFs, image files), the AI returns
    // a full_text_transcription. Persist it to dms_document_files + content_text.
    if (aiOutput?.extraction?.fullTextTranscription && imageOnlyFileIds.length > 0) {
      const transcription = aiOutput.extraction.fullTextTranscription;
      try {
        // Store transcription in the first image-only file (single-file documents)
        // or skip per-file storage for multi-file docs (complex to split).
        const targetFileId = imageOnlyFileIds.length === 1 ? imageOnlyFileIds[0] : null;
        if (targetFileId) {
          await persistFileOcrResult({
            supabase,
            fileId: targetFileId,
            documentId,
            text: transcription,
            provider: "vision",
            model: provider.modelId ?? "gpt-4.1",
            performedBy: ctx.profile.id,
            source: "ocr",
          });
        } else {
          // Multi-file: update document content text directly without per-file write
          const { writeDocumentContentTextSystem } = await import("@/server/actions/dms/document-content");
          await writeDocumentContentTextSystem({
            documentId,
            text: transcription,
            source: "ocr",
            performedBy: ctx.profile.id,
          });
          await supabase
            .from("dms_documents")
            .update({ ocr_text_available: true, updated_at: new Date().toISOString() })
            .eq("id", documentId);
        }
      } catch { /* non-fatal */ }
    }

    // Update document ai_status + ocr_text_available flag (side-effect of auto-extraction)
    const hasTextAfterAnalysis = ocrParts.length > 0 || (imageOnlyFileIds.length > 0 && !!(aiOutput?.extraction?.fullTextTranscription));
    await supabase
      .from("dms_documents")
      .update({
        ai_status: "completed",
        ocr_text_available: hasTextAfterAnalysis,
        ocr_last_run_at: hasTextAfterAnalysis ? new Date().toISOString() : undefined,
      })
      .eq("id", documentId);

    await insertDocumentEvent(supabase, documentId, "ai_classification_completed", ctx.profile.id, {
      job_id: jobId,
      result_id: resultId,
      suggested_type_code: suggestedTypeCode,
      confidence: aiOutput.classification.confidenceLabel,
      field_count: aiOutput.extraction.fields.length,
      duration_ms: durationMs,
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_ai_extraction_jobs",
      entity_id: jobId,
      entity_reference: `JOB-${jobId}`,
      action: "update",
      new_values: {
        event: "ai_analysis_completed",
        result_id: resultId,
        provider: configCode,
        duration_ms: durationMs,
        confidence_label: aiOutput.classification.confidenceLabel,
      },
    });

    revalidatePath(`/dms/documents/record/${documentId}`);

    // ── Phase 12: Non-fatal review queue generation hook ─────────────────────
    // Creates one result-level review queue item for AI analysis results
    // that require human review. NEVER blocks the analysis workflow.
    if (resultId) {
      try {
        const reviewEnabled = await isDmsAiReviewEnabled();
        if (reviewEnabled) {
          const confScore = aiOutput.classification.confidenceScore ?? 1;
          const confLabel = aiOutput.classification.confidenceLabel;
          const needsReview = aiOutput.classification.needsHumanReview || confScore < 0.6;

          if (needsReview) {
            await upsertDmsReviewQueueItem({
              idempotencyKey:  `ai_analysis:${resultId}:result`,
              reviewType:      "ai_analysis_metadata_review",
              sourceType:      "ai_analysis",
              sourceId:        String(resultId),
              documentId,
              aiResultId:      resultId,
              reasonCode:      "ai_analysis_pending_review",
              reasonMessage:   `AI analysis result ${resultId} has ${confLabel} confidence (${(confScore * 100).toFixed(0)}%) and requires review.`,
              confidence:      confScore,
              priority:        confScore < 0.4 ? "high" : "normal",
              payloadJson: {
                ai_result_id:        resultId,
                document_id:         documentId,
                suggested_type_code: suggestedTypeCode,
                confidence_label:    confLabel,
                confidence_score:    confScore,
              },
              createdBy: ctx.profile.id,
            });
          }
        }
      } catch (hookErr) {
        logger.warn("[ai-analysis] review queue hook failed (non-fatal)", { documentId, resultId, error: String(hookErr).slice(0, 200) });
      }
    }

    const fieldCount = aiOutput.extraction.fields.length;
    return {
      success: true,
      data: {
        job_id: jobId,
        result_id: resultId,
        status: "complete",
        message: `AI analysis complete — classified as "${suggestedTypeCode ?? "unknown"}" (${aiOutput.classification.confidenceLabel} confidence), ${fieldCount} field${fieldCount !== 1 ? "s" : ""} extracted`,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── retryDmsAiAnalysisJob ─────────────────────────────────────────────────────

export async function retryDmsAiAnalysisJob(
  jobId: number
): Promise<ActionResult<{ job_id: number; result_id: number | null; status: string; message: string }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canRunAi(ctx)) return { success: false, error: "Permission denied" };

    const { data: job, error: jobErr } = await supabase
      .from("dms_ai_extraction_jobs")
      .select("id, document_id, job_type, status, retry_count")
      .eq("id", jobId)
      .single();

    if (jobErr || !job) return { success: false, error: "AI job not found" };
    if (!["failed", "provider_not_configured", "cancelled"].includes(job.status as string)) {
      return { success: false, error: "Only failed or cancelled AI jobs can be retried" };
    }
    if (!job.document_id) return { success: false, error: "Job has no document_id" };

    await supabase
      .from("dms_ai_extraction_jobs")
      .update({ retry_count: ((job.retry_count as number) ?? 0) + 1 })
      .eq("id", jobId);

    const result = await runDmsAiAnalysisForDocument({
      documentId: job.document_id as number,
      jobType: (job.job_type as "classify" | "extract" | "classify_extract") ?? "classify_extract",
      forceRun: true,
    });

    if (job.document_id) {
      await insertDocumentEvent(supabase, job.document_id as number, "ai_analysis_retried", ctx.profile.id, {
        original_job_id: jobId,
        outcome: result.success ? "success" : "failed",
      });
    }

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_ai_extraction_jobs",
      entity_id: jobId,
      entity_reference: `JOB-${jobId}`,
      action: "update",
      new_values: { event: "ai_analysis_retried", outcome: result.success ? "success" : "failed" },
    });

    return result.data
      ? { success: result.success, data: result.data }
      : { success: false, error: result.error };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── markDmsAiResultSuperseded ─────────────────────────────────────────────────

export async function markDmsAiResultSuperseded(
  resultId: number
): Promise<ActionResult<{ result_id: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canAdminAi(ctx)) return { success: false, error: "Permission denied" };

    const { data: result, error: resErr } = await supabase
      .from("dms_ai_extraction_results")
      .select("id, document_id")
      .eq("id", resultId)
      .single();

    if (resErr || !result) return { success: false, error: "AI result not found" };

    await supabase
      .from("dms_ai_extraction_results")
      .update({ ai_status: "superseded", reviewed_by: ctx.profile.id, reviewed_at: new Date().toISOString() })
      .eq("id", resultId);

    if (result.document_id) {
      await insertDocumentEvent(supabase, result.document_id as number, "ai_result_superseded", ctx.profile.id, {
        result_id: resultId,
      });
    }

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_ai_extraction_results",
      entity_id: resultId,
      entity_reference: `AIRESULT-${resultId}`,
      action: "update",
      new_values: { event: "ai_result_superseded", result_id: resultId },
    });

    revalidatePath(`/dms/documents/record/${result.document_id}`);
    return { success: true, data: { result_id: resultId } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── applyAiAnalysisToMetadata ─────────────────────────────────────────────────

export type ApplyAiMetadataSelection = {
  definitionId: number;
  fieldCode: string;
  applyMode: "fill_missing_only" | "replace_selected";
  expectedCurrentValue?: string | null;
  expectedUpdatedAt?: string | null;
};

export type ApplyAiMetadataInput = {
  documentId: number;
  aiResultId: number;
  selections: ApplyAiMetadataSelection[];
  confirmation: {
    replaceExistingConfirmed: boolean;
    lowConfidenceConfirmed: boolean;
  };
};

export type ApplyAiMetadataResult = {
  appliedCount: number;
  skippedCount: number;
  appliedFields: string[];
  skippedFields: Array<{ fieldCode: string; reason: string }>;
  aiResultStatus: string;
};

import {
  buildMetadataDiff,
  convertAiValueForFieldType,
  summarizeMetadataValue,
  type CurrentMetadataValueRow,
  type ConfidenceEntry,
} from "@/lib/dms/metadata/metadata-diff";
import {
  DMS_METADATA_DEFINITION_SELECT,
  filterMetadataDefinitionsByContext,
  mapMetadataDefinitionRow,
} from "@/lib/dms/metadata/metadata-definition-shared";

const ApplyAiMetadataSchema = z.object({
  documentId: z.number().int().positive(),
  aiResultId: z.number().int().positive(),
  selections: z
    .array(
      z.object({
        definitionId: z.number().int().positive(),
        fieldCode: z.string().min(1),
        applyMode: z.enum(["fill_missing_only", "replace_selected"]),
        expectedCurrentValue: z.string().nullable().optional(),
        expectedUpdatedAt: z.string().nullable().optional(),
      })
    )
    .min(1)
    .max(50),
  confirmation: z.object({
    replaceExistingConfirmed: z.boolean(),
    lowConfidenceConfirmed: z.boolean(),
  }),
});

function canApplyMetadataAction(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.edit") ||
    hasPermission(ctx, "dms.documents.review_ai") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin") ||
    ctx.roleCodes.includes("group_admin")
  );
}

function buildMetadataValueUpsert(
  documentId: number,
  definitionId: number,
  aiValueConverted: unknown,
  fieldType: string,
  userId: number
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    document_id: documentId,
    definition_id: definitionId,
    value_text: null,
    value_number: null,
    value_date: null,
    value_datetime: null,
    value_boolean: null,
    value_json: null,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  switch (fieldType) {
    case "text":
    case "textarea":
    case "url":
    case "email":
    case "phone":
    case "select":
      return { ...base, value_text: String(aiValueConverted) };
    case "multiselect":
    case "json":
      return { ...base, value_json: aiValueConverted };
    case "number":
    case "currency":
      return { ...base, value_number: Number(aiValueConverted) };
    case "date":
      return { ...base, value_date: String(aiValueConverted) };
    case "datetime":
      return { ...base, value_datetime: String(aiValueConverted) };
    case "boolean":
      return { ...base, value_boolean: Boolean(aiValueConverted) };
    default:
      return { ...base, value_text: String(aiValueConverted) };
  }
}

export async function applyAiAnalysisToMetadata(
  input: ApplyAiMetadataInput
): Promise<ActionResult<ApplyAiMetadataResult>> {
  // runId tracks the apply history row (null if history write failed — non-fatal)
  let runId: number | null = null;

  try {
    // ── 1. Validate input ──────────────────────────────────────────────────────
    const parsed = ApplyAiMetadataSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const { documentId, aiResultId, selections, confirmation } = parsed.data;

    // ── 2. Auth + permission ───────────────────────────────────────────────────
    const supabase = await createClient();
    const adminClient = await createAdminClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canApplyMetadataAction(ctx)) return { success: false, error: "Permission denied" };

    // ── 3. Load document ───────────────────────────────────────────────────────
    const { data: doc, error: docErr } = await supabase
      .from("dms_documents")
      .select("id, title, document_no, document_type_id, confidentiality_level, status")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docErr || !doc) return { success: false, error: "Document not found" };
    if ((doc.status as string) === "archived") {
      return { success: false, error: "Cannot modify metadata on an archived document" };
    }

    // ── 4. Confidentiality gate ────────────────────────────────────────────────
    if (RESTRICTED_CONFIDENTIALITY.has(doc.confidentiality_level as string)) {
      if (!hasPermission(ctx, "dms.admin")) {
        return { success: false, error: "Modifying metadata on confidential documents requires dms.admin" };
      }
    }

    // ── 5. Load AI result ──────────────────────────────────────────────────────
    const { data: aiResult, error: resultErr } = await supabase
      .from("dms_ai_extraction_results")
      .select("id, document_id, ai_status, extracted_fields_json, field_confidence_json")
      .eq("id", aiResultId)
      .single();

    if (resultErr || !aiResult) return { success: false, error: "AI result not found" };
    if ((aiResult.document_id as number) !== documentId) {
      return { success: false, error: "AI result does not belong to this document" };
    }
    if ((aiResult.ai_status as string) === "superseded") {
      return { success: false, error: "Cannot apply from a superseded AI result" };
    }

    const docTypeId = doc.document_type_id as number | null;
    if (!docTypeId) return { success: false, error: "Document has no document type assigned" };

    // ── 6. Load metadata definitions ──────────────────────────────────────────
    const { data: defRows } = await supabase
      .from("dms_metadata_definitions")
      .select(DMS_METADATA_DEFINITION_SELECT)
      .eq("document_type_id", docTypeId)
      .eq("is_active", true)
      .is("deleted_at", null)
      .order("sort_order");

    const definitions = filterMetadataDefinitionsByContext(
      (defRows ?? []).map((r) => mapMetadataDefinitionRow(r as Record<string, unknown>)),
      "all"
    );

    // ── 7. Load current metadata values ───────────────────────────────────────
    const { data: valueRows } = await supabase
      .from("dms_document_metadata_values")
      .select("definition_id, value_text, value_number, value_date, value_datetime, value_boolean, value_json, updated_at")
      .eq("document_id", documentId)
      .is("deleted_at", null);

    const currentValues: CurrentMetadataValueRow[] = (valueRows ?? []).map((r) => ({
      definition_id: (r as { definition_id: number }).definition_id,
      value_text: (r as { value_text: string | null }).value_text,
      value_number: (r as { value_number: number | null }).value_number,
      value_date: (r as { value_date: string | null }).value_date,
      value_datetime: (r as { value_datetime: string | null }).value_datetime,
      value_boolean: (r as { value_boolean: boolean | null }).value_boolean,
      value_json: (r as { value_json: unknown }).value_json,
      updated_at: (r as { updated_at: string | null }).updated_at,
    }));

    // ── 8. Build server-side diff ──────────────────────────────────────────────
    const extractedFields = (aiResult.extracted_fields_json as Record<string, unknown> | null) ?? null;
    const fieldConf = (aiResult.field_confidence_json as Record<string, ConfidenceEntry> | null) ?? null;
    const diffRows = buildMetadataDiff(definitions, currentValues, extractedFields, fieldConf);

    const diffMap = new Map(diffRows.map((r) => [r.definitionId, r]));

    // ── 9. Process each selection ──────────────────────────────────────────────
    const userId = ctx.profile.id;
    const now = new Date().toISOString();
    const appliedFields: string[] = [];
    const skippedFields: Array<{ fieldCode: string; reason: string }> = [];

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: documentId,
      entity_reference: String(doc.document_no ?? documentId),
      action: "update",
      new_values: {
        event: "ai_metadata_apply_started",
        document_id: documentId,
        ai_result_id: aiResultId,
        selected_count: selections.length,
      },
    });

    // ── Phase 7: Insert apply run row (non-fatal) ──────────────────────────────
    try {
      const { data: runRow } = await adminClient
        .from("dms_ai_metadata_apply_runs")
        .insert({
          document_id: documentId,
          ai_result_id: aiResultId,
          applied_by: userId,
          apply_status: "started",
          selected_count: selections.length,
          replace_confirmed: confirmation.replaceExistingConfirmed,
          low_confidence_confirmed: confirmation.lowConfidenceConfirmed,
          created_at: now,
        })
        .select("id")
        .single();
      runId = runRow?.id ?? null;
    } catch {
      // Non-fatal: audit_logs is the fallback official trail
    }

    for (const sel of selections) {
      const diffRow = diffMap.get(sel.definitionId);
      let itemStatus: "applied" | "skipped" | "blocked" = "skipped";
      let skipReason: string | null = null;

      if (!diffRow) {
        skipReason = "Definition not found";
        skippedFields.push({ fieldCode: sel.fieldCode, reason: skipReason });
      } else if (!diffRow.canApply) {
        itemStatus = "blocked";
        skipReason = diffRow.validationError ?? `Cannot apply (state: ${diffRow.diffState})`;
        skippedFields.push({ fieldCode: sel.fieldCode, reason: skipReason });
      } else if (diffRow.aiValueConverted === null || diffRow.aiValueConverted === undefined) {
        skipReason = "No converted value available";
        skippedFields.push({ fieldCode: sel.fieldCode, reason: skipReason });
      } else if (sel.applyMode === "fill_missing_only" && diffRow.currentValueRaw !== null && diffRow.currentValueRaw.trim() !== "") {
        skipReason = "Field already has a value (fill_missing_only mode)";
        skippedFields.push({ fieldCode: sel.fieldCode, reason: skipReason });
      } else if (
        sel.applyMode === "replace_selected" &&
        diffRow.currentValueRaw !== null &&
        diffRow.currentValueRaw.trim() !== "" &&
        !confirmation.replaceExistingConfirmed
      ) {
        // This is a hard error — return immediately (mark run as failed if possible)
        if (runId !== null) {
          try {
            await adminClient
              .from("dms_ai_metadata_apply_runs")
              .update({ apply_status: "failed", error_message: "replaceExistingConfirmed required", completed_at: new Date().toISOString() })
              .eq("id", runId);
          } catch { /* non-fatal */ }
        }
        return {
          success: false,
          error: "Replacing existing values requires replaceExistingConfirmed = true",
        };
      } else if (diffRow.diffState === "low_confidence" && !confirmation.lowConfidenceConfirmed) {
        if (runId !== null) {
          try {
            await adminClient
              .from("dms_ai_metadata_apply_runs")
              .update({ apply_status: "failed", error_message: "lowConfidenceConfirmed required", completed_at: new Date().toISOString() })
              .eq("id", runId);
          } catch { /* non-fatal */ }
        }
        return {
          success: false,
          error: "Applying low-confidence values requires lowConfidenceConfirmed = true",
        };
      } else {
        const def = definitions.find((d) => d.id === sel.definitionId);
        if (!def) {
          skipReason = "Definition not found after re-lookup";
          skippedFields.push({ fieldCode: sel.fieldCode, reason: skipReason });
        } else {
          const upsertRow = buildMetadataValueUpsert(
            documentId,
            sel.definitionId,
            diffRow.aiValueConverted,
            def.field_type,
            userId
          );

          const { error: upsertErr } = await supabase
            .from("dms_document_metadata_values")
            .upsert(upsertRow, { onConflict: "document_id,definition_id" });

          if (upsertErr) {
            skipReason = upsertErr.message;
            skippedFields.push({ fieldCode: sel.fieldCode, reason: skipReason });
          } else {
            itemStatus = "applied";
            appliedFields.push(sel.fieldCode);

            const oldSummary = summarizeMetadataValue(diffRow.currentValueRaw, def.field_type);
            const newSummary = summarizeMetadataValue(diffRow.aiValueConverted, def.field_type);

            await logAudit({
              module_code: "DMS",
              entity_name: "dms_document_metadata_values",
              entity_id: documentId,
              entity_reference: `${String(doc.document_no ?? documentId)}:${def.field_code}`,
              action: "update",
              new_values: {
                event: "ai_metadata_field_applied",
                document_id: documentId,
                ai_result_id: aiResultId,
                definition_id: sel.definitionId,
                field_code: sel.fieldCode,
                old_value_summary: oldSummary,
                new_value_summary: newSummary,
                confidence_score: diffRow.confidenceScore,
                confidence_label: diffRow.confidenceLabel,
                apply_mode: sel.applyMode,
                user_id: userId,
              },
            });

            // Phase 7: insert apply item (non-fatal)
            if (runId !== null) {
              try {
                await adminClient
                  .from("dms_ai_metadata_apply_items")
                  .insert({
                    apply_run_id: runId,
                    document_id: documentId,
                    definition_id: sel.definitionId,
                    field_code: sel.fieldCode,
                    old_value_summary: (oldSummary ?? "").slice(0, 100) || null,
                    new_value_summary: (newSummary ?? "").slice(0, 100) || null,
                    confidence_score: diffRow.confidenceScore,
                    confidence_label: diffRow.confidenceLabel,
                    apply_mode: sel.applyMode,
                    item_status: "applied",
                    skip_reason: null,
                  });
              } catch { /* non-fatal */ }
            }
            continue;
          }
        }
      }

      // Insert skipped/blocked item (non-fatal)
      if (runId !== null) {
        try {
          await adminClient
            .from("dms_ai_metadata_apply_items")
            .insert({
              apply_run_id: runId,
              document_id: documentId,
              definition_id: sel.definitionId,
              field_code: sel.fieldCode,
              old_value_summary: null,
              new_value_summary: null,
              confidence_score: diffRow?.confidenceScore ?? null,
              confidence_label: diffRow?.confidenceLabel ?? null,
              apply_mode: sel.applyMode,
              item_status: itemStatus,
              skip_reason: skipReason?.slice(0, 200) ?? null,
            });
        } catch { /* non-fatal */ }
      }
    }

    const appliedCount = appliedFields.length;
    const skippedCount = skippedFields.length;

    // ── Phase 7: Finalize apply run (non-fatal) ────────────────────────────────
    if (runId !== null) {
      const finalStatus = skippedCount === 0 ? "completed" : "partial";
      try {
        await adminClient
          .from("dms_ai_metadata_apply_runs")
          .update({
            apply_status: finalStatus,
            applied_count: appliedCount,
            skipped_count: skippedCount,
            completed_at: new Date().toISOString(),
          })
          .eq("id", runId);
      } catch { /* non-fatal */ }
    }

    // ── 10. Document event ─────────────────────────────────────────────────────
    await insertDocumentEvent(supabase, documentId, "ai_metadata_applied", userId, {
      ai_result_id: aiResultId,
      applied_count: appliedCount,
      skipped_count: skippedCount,
      applied_fields: appliedFields,
    });

    // ── 11. Summary audit ──────────────────────────────────────────────────────
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: documentId,
      entity_reference: String(doc.document_no ?? documentId),
      action: "update",
      new_values: {
        event: "ai_metadata_apply_completed",
        document_id: documentId,
        ai_result_id: aiResultId,
        applied_count: appliedCount,
        skipped_count: skippedCount,
        replace_confirmed: confirmation.replaceExistingConfirmed,
        low_confidence_confirmed: confirmation.lowConfidenceConfirmed,
      },
    });

    // ── 12. Mark AI result accepted ────────────────────────────────────────────
    let aiResultStatus = aiResult.ai_status as string;
    if (appliedCount > 0) {
      await supabase
        .from("dms_ai_extraction_results")
        .update({
          ai_status: "accepted",
          reviewed_by: userId,
          reviewed_at: now,
        })
        .eq("id", aiResultId);
      aiResultStatus = "accepted";
    }

    // ── 13. Revalidate ─────────────────────────────────────────────────────────
    revalidatePath(`/dms/documents/record/${documentId}`);

    return {
      success: true,
      data: { appliedCount, skippedCount, appliedFields, skippedFields, aiResultStatus },
    };
  } catch (e) {
    // Mark apply run as failed if created (non-fatal)
    if (runId !== null) {
      void (async () => {
        try {
          const ac = await createAdminClient();
          await ac
            .from("dms_ai_metadata_apply_runs")
            .update({ apply_status: "failed", error_message: String(e).slice(0, 200), completed_at: new Date().toISOString() })
            .eq("id", runId!);
        } catch { /* non-fatal */ }
      })();
    }
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: input.documentId,
      entity_reference: String(input.documentId),
      action: "update",
      new_values: {
        event: "ai_metadata_apply_failed",
        document_id: input.documentId,
        ai_result_id: input.aiResultId,
        safe_error_message: String(e).slice(0, 200),
      },
    }).catch(() => {});
    return { success: false, error: String(e) };
  }
}

// ── getDmsAiMetadataApplyHistory ──────────────────────────────────────────────

export type DmsAiMetadataApplyHistoryItem = {
  id: number;
  applyRunId: number;
  documentId: number;
  definitionId: number | null;
  fieldCode: string;
  oldValueSummary: string | null;
  newValueSummary: string | null;
  confidenceScore: number | null;
  confidenceLabel: string | null;
  applyMode: string | null;
  itemStatus: string;
  skipReason: string | null;
  createdAt: string;
};

export type DmsAiMetadataApplyHistoryRun = {
  id: number;
  documentId: number;
  aiResultId: number | null;
  appliedBy: number;
  appliedByName: string | null;
  applyStatus: string;
  selectedCount: number;
  appliedCount: number;
  skippedCount: number;
  replaceConfirmed: boolean;
  lowConfidenceConfirmed: boolean;
  createdAt: string;
  completedAt: string | null;
  items: DmsAiMetadataApplyHistoryItem[];
};

const GetApplyHistorySchema = z.object({
  documentId: z.number().int().positive(),
});

export async function getDmsAiMetadataApplyHistory(
  documentId: number
): Promise<ActionResult<DmsAiMetadataApplyHistoryRun[]>> {
  try {
    const parsed = GetApplyHistorySchema.safeParse({ documentId });
    if (!parsed.success) return { success: false, error: "Invalid document ID" };

    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewAi(ctx)) return { success: false, error: "Permission denied" };

    // Confidentiality gate
    const { data: doc } = await supabase
      .from("dms_documents")
      .select("id, confidentiality_level")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (!doc) return { success: false, error: "Document not found" };

    if (RESTRICTED_CONFIDENTIALITY.has(doc.confidentiality_level as string)) {
      if (!hasPermission(ctx, "dms.admin")) {
        return { success: false, error: "Apply history for confidential documents requires dms.admin" };
      }
    }

    // Load runs with items (using admin client so history is readable regardless of row-level state)
    const adminClient = await createAdminClient();

    const { data: rawRuns, error: runsErr } = await adminClient
      .from("dms_ai_metadata_apply_runs")
      .select(`
        id, document_id, ai_result_id, applied_by,
        apply_status, selected_count, applied_count, skipped_count,
        replace_confirmed, low_confidence_confirmed,
        created_at, completed_at,
        applied_by_profile:user_profiles!applied_by(full_name_en)
      `)
      .eq("document_id", documentId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (runsErr) return { success: false, error: runsErr.message };
    if (!rawRuns || rawRuns.length === 0) return { success: true, data: [] };

    const runs = rawRuns as unknown as Array<Record<string, unknown>>;
    const runIds = runs.map((r) => r["id"] as number);

    const { data: rawItems } = await adminClient
      .from("dms_ai_metadata_apply_items")
      .select(
        "id, apply_run_id, document_id, definition_id, field_code, " +
        "old_value_summary, new_value_summary, confidence_score, confidence_label, " +
        "apply_mode, item_status, skip_reason, created_at"
      )
      .in("apply_run_id", runIds)
      .order("created_at", { ascending: true });

    const items = (rawItems ?? []) as unknown as Array<Record<string, unknown>>;

    const itemsByRunId = new Map<number, DmsAiMetadataApplyHistoryItem[]>();
    for (const item of items) {
      const rid = item["apply_run_id"] as number;
      if (!itemsByRunId.has(rid)) itemsByRunId.set(rid, []);
      itemsByRunId.get(rid)!.push({
        id: item["id"] as number,
        applyRunId: rid,
        documentId: item["document_id"] as number,
        definitionId: (item["definition_id"] as number | null) ?? null,
        fieldCode: item["field_code"] as string,
        oldValueSummary: (item["old_value_summary"] as string | null) ?? null,
        newValueSummary: (item["new_value_summary"] as string | null) ?? null,
        confidenceScore: (item["confidence_score"] as number | null) ?? null,
        confidenceLabel: (item["confidence_label"] as string | null) ?? null,
        applyMode: (item["apply_mode"] as string | null) ?? null,
        itemStatus: (item["item_status"] as string) ?? "skipped",
        skipReason: (item["skip_reason"] as string | null) ?? null,
        createdAt: item["created_at"] as string,
      });
    }

    const result: DmsAiMetadataApplyHistoryRun[] = runs.map((r) => {
      const profile = r["applied_by_profile"] as { full_name_en?: string } | null;
      return {
        id: r["id"] as number,
        documentId: r["document_id"] as number,
        aiResultId: (r["ai_result_id"] as number | null) ?? null,
        appliedBy: r["applied_by"] as number,
        appliedByName: profile?.full_name_en ?? null,
        applyStatus: r["apply_status"] as string,
        selectedCount: (r["selected_count"] as number) ?? 0,
        appliedCount: (r["applied_count"] as number) ?? 0,
        skippedCount: (r["skipped_count"] as number) ?? 0,
        replaceConfirmed: (r["replace_confirmed"] as boolean) ?? false,
        lowConfidenceConfirmed: (r["low_confidence_confirmed"] as boolean) ?? false,
        createdAt: r["created_at"] as string,
        completedAt: (r["completed_at"] as string | null) ?? null,
        items: itemsByRunId.get(r["id"] as number) ?? [],
      };
    });

    return { success: true, data: result };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

async function insertDocumentEvent(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  documentId: number,
  eventType: string,
  userId: number,
  meta: Record<string, unknown>
) {
  await supabase.from("dms_document_events").insert({
    document_id: documentId,
    event_type: eventType,
    description: `AI event: ${eventType}`,
    performed_by: userId,
    metadata_json: meta,
  });
}
