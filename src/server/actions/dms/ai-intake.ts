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
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { getDmsAiProvider } from "@/lib/dms/ai/factory";
import { hashOcrText, PROMPT_VERSION } from "@/lib/dms/ai/prompt-builders";
import { extractFileContent } from "@/lib/dms/file-content-extractor";
import { revalidatePath } from "next/cache";
import { writeDocumentContentTextSystem } from "@/server/actions/dms/document-content";
import { persistFileOcrResult } from "@/lib/dms/ocr/persist-file-ocr-result";
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
      console.warn("[ai-intake] party match failed for entity:", name, err);
    }
  }

  return links.slice(0, 8);
}

// ── Storage path helpers ──────────────────────────────────────────────────────

function buildFinalStoragePath(
  owningCompanyId: number | null,
  year: number,
  typeCode: string,
  documentId: number,
  versionNumber: number,
  ext: string
): string {
  const company = owningCompanyId ?? 0;
  return `${company}/${year}/${typeCode}/${documentId}/v${versionNumber}/original.${ext}`;
}

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "bin";
}

// ── Expiry reminder days ──────────────────────────────────────────────────────

const REMINDER_DAYS = [90, 60, 30, 14, 7, 1];

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
});

// ── Helper: resolve metadata value columns by field type ─────────────────────

function resolveMetadataValueColumns(fieldType: string, rawValue: string) {
  switch (fieldType) {
    case "number":
    case "decimal": {
      const num = parseFloat(rawValue);
      return { value_number: isNaN(num) ? null : num };
    }
    case "date":
      return { value_date: rawValue || null };
    case "datetime":
      return { value_datetime: rawValue || null };
    case "boolean":
      return { value_boolean: rawValue === "true" || rawValue === "1" };
    case "json":
      try {
        return { value_json: JSON.parse(rawValue) };
      } catch {
        return { value_json: rawValue };
      }
    default:
      return { value_text: rawValue || null };
  }
}

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

      // Universal extractor: PDF (text or rendered images), images, TIFF→PNG,
      // DOC/DOCX, XLS/XLSX — all handled in one place.
      const extracted = await extractFileContent(buffer, mimeType, originalFilename);
      console.log(`[ai-intake] content extraction method: ${extracted.method} (text=${extracted.text.length} chars, images=${extracted.images.length})`);

      ocrText = extracted.text;
      for (const img of extracted.images) {
        imageFiles.push({ fileName: img.fileName, base64: img.base64, mimeType: img.mimeType });
      }

      // Proceed even if extraction produced nothing — the AI will note the limitation.
      contentExtracted = true;
    } catch (err) {
      console.error("[ai-intake] file content extraction error:", err);
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

    // ── Load type candidates + metadata fields ─────────────────────────────

    const { data: typeRows } = await supabase
      .from("dms_document_types")
      .select("id, type_code, name_en, description, category_id")
      .eq("is_active", true)
      .is("deleted_at", null)
      .limit(50);

    const typeCandidates: DmsAiDocumentTypeCandidate[] = (typeRows ?? []).map((t) => ({
      typeCode: t.type_code as string,
      nameEn: t.name_en as string,
      description: (t.description as string | null) ?? null,
      categoryName: null,
    }));

    // For intake, no current type — pass all fields as potential extraction targets
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

    // ── Resolve type ID from suggested code ────────────────────────────────

    const suggestedTypeCode = aiOutput.classification.suggestedTypeCode;
    let suggestedTypeId: number | null = null;
    if (suggestedTypeCode) {
      const matched = typeRows?.find((t) => t.type_code === suggestedTypeCode);
      if (matched) {
        suggestedTypeId = matched.id as number;
        aiOutput.classification.suggestedTypeId = suggestedTypeId;
      }
    }

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
          classification: aiOutput.rawResponse.classification,
          suggested_title: aiOutput.rawResponse.suggested_title,
          suggested_description: aiOutput.rawResponse.suggested_description,
          field_count: (aiOutput.rawResponse.fields as unknown[])?.length ?? 0,
          warnings: aiOutput.rawResponse.warnings,
        }
      : null;

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
        event: "ai_intake_ai_completed",
        job_id: jobId,
        result_id: resultId,
        duration_ms: durationMs,
        suggested_type_code: suggestedTypeCode,
      },
    });

    revalidatePath("/dms/inbox");

    return {
      success: true,
      data: { sessionCode, status: "review_pending", message: "AI analysis complete" },
    };
  } catch (e) {
    console.error("startAiIntakeFromUploadSession error", e);
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
      allowDuplicate,
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

    if (typedSession.intake_status === "approved") {
      // Idempotency: if already approved, return existing document
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
    // Duplicate detection is informational only — the UI shows a warning. Admins may proceed.

    // ── Load document type ────────────────────────────────────────────────

    const { data: docType, error: typeError } = await supabase
      .from("dms_document_types")
      .select("id, type_code, category_id, default_confidentiality, is_active")
      .eq("id", documentTypeId)
      .single();

    if (typeError || !docType) return { success: false, error: "Document type not found" };
    if (!(docType.is_active as boolean)) return { success: false, error: "Selected document type is not active" };

    // ── Generate document number ───────────────────────────────────────────

    const { data: docNoData, error: docNoError } = await supabase
      .rpc("generate_next_reference_number", { p_rule_code: "MASTER_DMS_DOCUMENT" });

    // RPC returns an array of rows; extract the generated reference from the first row
    const docNoRows = docNoData as Array<{ generated_reference_number: string }>;
    if (docNoError || !docNoRows || docNoRows.length === 0 || !docNoRows[0]?.generated_reference_number) {
      return { success: false, error: docNoError?.message ?? "Failed to generate document number" };
    }

    const documentNo = String(docNoRows[0].generated_reference_number);
    const year = new Date().getFullYear();
    const ext = getExtension(typedSession.original_filename as string);
    const userId = ctx.profile.id;
    const confidentiality = confidentialityLevel ?? (docType.default_confidentiality as string | null) ?? "internal";

    // ── Create dms_documents record ────────────────────────────────────────

    const { data: document, error: docInsertError } = await supabase
      .from("dms_documents")
      .insert({
        document_no: documentNo,
        title,
        description: description ?? null,
        document_type_id: documentTypeId,
        category_id: docType.category_id,
        status: "active",
        confidentiality_level: confidentiality,
        owner_user_id: userId,
        owning_company_id: owningCompanyId ?? null,
        owning_branch_id: owningBranchId ?? null,
        party_id: partyId ?? null,
        issue_date: issueDate ?? null,
        expiry_date: expiryDate ?? null,
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (docInsertError) return { success: false, error: docInsertError.message };

    const documentId = document.id as number;

    // ── Copy file from dms-temp to dms-documents ───────────────────────────

    const finalPath = buildFinalStoragePath(
      owningCompanyId ?? null,
      year,
      docType.type_code as string,
      documentId,
      1,
      ext
    );

    const { data: tempFileData, error: downloadError } = await adminClient.storage
      .from("dms-temp")
      .download(typedSession.temp_storage_path as string);

    if (downloadError || !tempFileData) {
      await supabase.from("dms_documents").delete().eq("id", documentId);
      return { success: false, error: `Failed to read temp file: ${downloadError?.message}` };
    }

    const { error: uploadError } = await adminClient.storage
      .from("dms-documents")
      .upload(finalPath, tempFileData, {
        contentType: typedSession.mime_type as string,
        upsert: false,
      });

    if (uploadError) {
      await supabase.from("dms_documents").delete().eq("id", documentId);
      return { success: false, error: `Failed to store file: ${uploadError.message}` };
    }

    // ── Create dms_document_versions v1 ──────────────────────────────────

    const { data: version, error: verError } = await supabase
      .from("dms_document_versions")
      .insert({
        document_id: documentId,
        version_number: 1,
        version_label: "v1",
        change_notes: "Created from AI intake",
        is_current: true,
        created_by: userId,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (verError) {
      await supabase.from("dms_documents").delete().eq("id", documentId);
      return { success: false, error: verError.message };
    }

    // ── Create dms_document_files ─────────────────────────────────────────

    const { data: fileRecord, error: fileError } = await supabase
      .from("dms_document_files")
      .insert({
        document_id: documentId,
        version_id: version.id,
        file_role: "original",
        storage_bucket: "dms-documents",
        storage_path: finalPath,
        file_name: typedSession.original_filename,
        mime_type: typedSession.mime_type,
        file_size_bytes: typedSession.file_size_bytes,
        sha256_hash: typedSession.sha256_hash ?? null,
        created_by: userId,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (fileError) {
      await supabase.from("dms_documents").delete().eq("id", documentId);
      return { success: false, error: fileError.message };
    }

    // ── Update document current_version_id ────────────────────────────────

    await supabase
      .from("dms_documents")
      .update({ current_version_id: version.id, updated_at: new Date().toISOString() })
      .eq("id", documentId);

    // ── Save accepted metadata values ─────────────────────────────────────

    if (metadataValues && metadataValues.length > 0) {
      const metaUpserts = metadataValues
        .filter((v) => v.rawValue !== null && v.rawValue !== undefined && v.rawValue !== "")
        .map((v) => ({
          document_id: documentId,
          definition_id: v.definitionId,
          ...resolveMetadataValueColumns(v.fieldType, v.rawValue),
          updated_by: userId,
          updated_at: new Date().toISOString(),
        }));

      if (metaUpserts.length > 0) {
        const { error: metaErr } = await supabase
          .from("dms_document_metadata_values")
          .upsert(metaUpserts, { onConflict: "document_id,definition_id" });
        if (metaErr) {
          console.error("metadata save error (non-fatal):", metaErr.message);
        }
      }
    }

    // ── Save accepted tags ────────────────────────────────────────────────

    if (tagIds && tagIds.length > 0) {
      const tagInserts = tagIds.map((tagId) => ({
        document_id: documentId,
        tag_id: tagId,
        created_by: userId,
      }));
      await supabase.from("dms_document_tags").insert(tagInserts);
    }

    // ── Save accepted ERP links ───────────────────────────────────────────

    if (links && links.length > 0) {
      const linkInserts = links.map((l) => ({
        document_id: documentId,
        entity_type: l.entityType,
        entity_id: l.entityId,
        link_role: l.linkRole ?? "related",
        is_primary: l.isPrimary ?? false,
        linked_at: new Date().toISOString(),
        created_by: userId,
      }));
      await supabase.from("dms_document_links").insert(linkInserts);
    }

    // ── Generate expiry reminders ─────────────────────────────────────────

    if (expiryDate) {
      const expiry = new Date(expiryDate);
      const now = new Date();
      for (const daysBefore of REMINDER_DAYS) {
        const reminderDate = new Date(expiry);
        reminderDate.setDate(reminderDate.getDate() - daysBefore);
        await supabase
          .from("dms_expiry_reminders")
          .upsert(
            {
              document_id: documentId,
              reminder_days_before: daysBefore,
              reminder_date: reminderDate.toISOString().split("T")[0],
              status: reminderDate < now ? "pending" : "pending",
              updated_at: new Date().toISOString(),
            },
            { onConflict: "document_id,reminder_days_before", ignoreDuplicates: false }
          );
      }
    }

    // ── Mark AI result accepted ───────────────────────────────────────────

    const effectiveAiResultId = aiResultId ?? (typedSession.ai_result_id as number | null);
    if (effectiveAiResultId) {
      await supabase
        .from("dms_ai_extraction_results")
        .update({
          ai_status: "accepted",
          review_action: "accepted",
          reviewed_by: userId,
          reviewed_at: new Date().toISOString(),
          document_id: documentId,
        })
        .eq("id", effectiveAiResultId);
    }

    // ── Sync content text — with vision fallback when raw_ocr_text is empty ──

    try {
      let rawOcrText: string | null = null;
      if (effectiveAiResultId) {
        const { data: aiRawRow } = await supabase
          .from("dms_ai_extraction_results")
          .select("raw_ocr_text")
          .eq("id", effectiveAiResultId)
          .single();
        rawOcrText = (aiRawRow as Record<string, unknown> | null)?.raw_ocr_text as string | null ?? null;
      }

      // If raw_ocr_text is empty (JSON truncation or scanned doc with no local text),
      // run vision OCR fallback on the uploaded file before finalising content sync.
      if (!rawOcrText?.trim() && fileRecord?.storage_path && fileRecord?.storage_bucket) {
        try {
          const adminCl = await createAdminClient();
          const { data: blob } = await adminCl.storage
            .from(fileRecord.storage_bucket as string)
            .download(fileRecord.storage_path as string);
          if (blob) {
            const buffer = Buffer.from(await blob.arrayBuffer());
            const content = await extractFileContent(
              buffer,
              fileRecord.mime_type as string,
              fileRecord.file_name as string
            );
            if (content.hasContent) {
              const { provider: aiProvider } = await getDmsAiProvider();
              if (aiProvider.isConfigured()) {
                const fallbackOutput = await aiProvider.analyze({
                  ocrText: content.text,
                  imageFiles: content.images,
                  currentTypeCode: null,
                  typeCandidates: [],
                  metadataFields: [],
                  originalFilename: fileRecord.file_name as string,
                });
                const transcription = fallbackOutput.extraction?.fullTextTranscription;
                const fallbackText = transcription?.trim() || content.text?.trim() || null;
                if (fallbackText) {
                  rawOcrText = fallbackText;
                  // Update the AI result record with the salvaged text
                  if (effectiveAiResultId) {
                    await supabase
                      .from("dms_ai_extraction_results")
                      .update({ raw_ocr_text: fallbackText.slice(0, 100_000) })
                      .eq("id", effectiveAiResultId);
                  }
                }
              }
            }
          }
        } catch {
          // Vision fallback failed — continue without text; not fatal
        }
      }

      const fileId = (fileRecord as { id?: number } | null)?.id ?? null;

      if (rawOcrText && rawOcrText.trim().length > 0 && fileId) {
        await persistFileOcrResult({
          supabase,
          fileId,
          documentId,
          text: rawOcrText,
          provider: "ai_intake",
          model: null,
          performedBy: userId,
          source: "ai_intake",
        });
      } else if (rawOcrText && rawOcrText.trim().length > 0) {
        // No file record available — write content text directly
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
    } catch (contentSyncErr) {
      console.warn("[DMS OCR-AI FIX.1] Content text sync (non-fatal):", String(contentSyncErr));
    }

    // ── Update upload session ─────────────────────────────────────────────

    await supabase
      .from("dms_upload_sessions")
      .update({
        status: "completed",
        intake_status: "approved",
        review_status: "approved",
        document_id: documentId,
        review_completed_at: new Date().toISOString(),
        reviewed_by: userId,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", uploadSessionId);

    // ── Insert document events ────────────────────────────────────────────

    const now2 = new Date().toISOString();
    await supabase.from("dms_document_events").insert([
      {
        document_id: documentId,
        event_type: "document_created_from_ai_intake",
        description: `Document created from AI intake: "${title}" — session ${sessionCode}`,
        performed_by: userId,
        performed_at: now2,
        metadata_json: { document_no: documentNo, upload_session_id: uploadSessionId, ai_result_id: effectiveAiResultId },
      },
      {
        document_id: documentId,
        event_type: "ai_intake_approved",
        description: "AI intake review approved by user",
        performed_by: userId,
        performed_at: now2,
        metadata_json: { ai_result_id: effectiveAiResultId },
      },
      {
        document_id: documentId,
        event_type: "file_uploaded",
        description: `File uploaded from AI intake: ${typedSession.original_filename} (v1)`,
        performed_by: userId,
        performed_at: now2,
        metadata_json: { file_id: fileRecord.id, version_id: version.id, version_number: 1 },
      },
      {
        document_id: documentId,
        event_type: "version_uploaded",
        description: "First version created: v1",
        performed_by: userId,
        performed_at: now2,
        metadata_json: { version_id: version.id, version_number: 1, is_current: true },
      },
    ]);

    if (metadataValues && metadataValues.length > 0) {
      await supabase.from("dms_document_events").insert({
        document_id: documentId,
        event_type: "metadata_updated",
        description: `${metadataValues.length} metadata field(s) saved from AI intake`,
        performed_by: userId,
        performed_at: now2,
      });
    }

    // ── Audit log ─────────────────────────────────────────────────────────

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: documentId,
      entity_reference: documentNo,
      action: "create",
      new_values: {
        event: "document_created_from_ai_intake",
        upload_session_id: uploadSessionId,
        ai_result_id: effectiveAiResultId,
      },
    });

    // ── Revalidate ────────────────────────────────────────────────────────

    revalidatePath("/dms/documents");
    revalidatePath("/dms/inbox");
    revalidatePath(`/dms/intake/${sessionCode}`);

    return { success: true, data: { documentId, documentNo } };
  } catch (e) {
    console.error("approveAiIntakeAndCreateDocument error", e);
    return { success: false, error: String(e) };
  }
}
