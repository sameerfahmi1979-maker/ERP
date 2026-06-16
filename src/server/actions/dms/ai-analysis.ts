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
import { hashOcrText, PROMPT_VERSION } from "@/lib/dms/ai/prompt-builders";
import type {
  DmsAiDocumentTypeCandidate,
  DmsAiImageFile,
  DmsAiMetadataField,
  DmsAiOutput,
} from "@/lib/dms/ai/types";
import { revalidatePath } from "next/cache";
import { extractFileContent } from "@/lib/dms/file-content-extractor";
import { persistFileOcrResult } from "@/lib/dms/ocr/persist-file-ocr-result";

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
    const { data: typeRows } = await supabase
      .from("dms_document_types")
      .select("id, type_code, name_en, description, category_id")
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(30);

    const typeCandidates: DmsAiDocumentTypeCandidate[] = (typeRows ?? []).map((t) => ({
      typeCode: t.type_code as string,
      nameEn: t.name_en as string,
      description: (t.description as string | null) ?? null,
      categoryName: null,
    }));

    // Load metadata fields for current document type
    const { data: metaRows } = await supabase
      .from("dms_metadata_definitions")
      .select("field_code, field_label_en, field_type, is_required, is_ai_extractable, ai_field_hint, options_json")
      .eq("document_type_id", doc.document_type_id as number)
      .eq("is_ai_extractable", true)
      .eq("is_active", true)
      .order("sort_order");

    const metadataFields: DmsAiMetadataField[] = (metaRows ?? []).map((f) => ({
      fieldCode: f.field_code as string,
      labelEn: f.field_label_en as string,
      fieldType: f.field_type as string,
      isRequired: f.is_required as boolean,
      aiFieldHint: (f.ai_field_hint as string | null) ?? null,
      optionsJson: f.options_json ?? null,
    }));

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
          classification: aiOutput.rawResponse.classification,
          suggested_title: aiOutput.rawResponse.suggested_title,
          suggested_description: aiOutput.rawResponse.suggested_description,
          fields: (aiOutput.rawResponse.fields as unknown[])?.length ?? 0,
          warnings: aiOutput.rawResponse.warnings,
        }
      : null;

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
