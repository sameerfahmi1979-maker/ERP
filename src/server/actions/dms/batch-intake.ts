"use server";

/**
 * ERP DMS 13 — Multi-File Batch Upload → Draft Intake Queue (server actions)
 *
 * GOVERNANCE — ONE-BY-ONE APPROVAL ONLY:
 *   Every AI-created draft must be reviewed and approved individually via the
 *   per-draft review screen. There is intentionally NO bulk-approve / approve-
 *   selected / approve-all / confidence-based auto-approval action in this file
 *   or anywhere else. `finalizeDraftIntake` operates on EXACTLY ONE draft.
 *
 * Security/logging:
 *   - OCR text, AI prompts, raw AI responses, content text and extracted
 *     personal values are NEVER logged. Only safe metadata (ids, counts,
 *     status, model, duration) is logged.
 *   - The existing single-file Upload & AI Fill flow is untouched; this file
 *     reuses its proven AI-analysis action (`startAiIntakeFromUploadSession`).
 */

import { z } from "zod";
import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import {
  createDmsUploadSession,
  type CreateUploadSessionInput,
} from "@/server/actions/dms/upload-sessions";
import {
  startAiIntakeFromUploadSession,
  retryAiIntake,
} from "@/server/actions/dms/ai-intake";
import { writeDocumentContentTextSystem } from "@/server/actions/dms/document-content";
import { persistFileOcrResult } from "@/lib/dms/ocr/persist-file-ocr-result";
import { extractFileContent } from "@/lib/dms/file-content-extractor";
import { getDmsAiProvider } from "@/lib/dms/ai/factory";
import { DMS_MAX_BATCH_FILES } from "@/features/dms/upload/dms-upload-constants";
import type { SupabaseClient } from "@supabase/supabase-js";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Permission helpers ────────────────────────────────────────────────────────

function canUpload(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "dms.documents.upload") || hasPermission(ctx, "dms.admin");
}
function canView(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.view") ||
    hasPermission(ctx, "dms.documents.upload") ||
    hasPermission(ctx, "dms.admin")
  );
}
function canApprove(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.review_ai") ||
    hasPermission(ctx, "dms.documents.upload") ||
    hasPermission(ctx, "dms.admin")
  );
}
function canDiscard(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.upload") ||
    hasPermission(ctx, "dms.documents.delete") ||
    hasPermission(ctx, "dms.admin")
  );
}

async function isBatchIntakeEnabled(supabase: SupabaseClient): Promise<boolean> {
  const { data } = await supabase
    .from("erp_ai_feature_flags")
    .select("is_enabled")
    .eq("feature_code", "DMS_BATCH_INTAKE")
    .single();
  return !!data?.is_enabled;
}

/** Public flag check for gating the batch UI (server components). */
export async function isDmsBatchIntakeEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    return await isBatchIntakeEnabled(supabase);
  } catch {
    return false;
  }
}

// ── Small local helpers (mirrors ai-intake.ts; cannot import from a "use server" file) ──

const REMINDER_DAYS = [90, 60, 30, 14, 7, 1];

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "bin";
}

function stripExtension(filename: string): string {
  const idx = filename.lastIndexOf(".");
  return (idx > 0 ? filename.slice(0, idx) : filename).slice(0, 480);
}

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

// ── Batch counts / status recompute (admin client = reliable bookkeeping) ──────

async function recomputeBatchStatus(batchId: number): Promise<void> {
  const admin = createAdminClient();
  const { data: batch } = await admin
    .from("dms_upload_batches")
    .select("id, total_files")
    .eq("id", batchId)
    .single();
  if (!batch) return;

  const { data: sessions } = await admin
    .from("dms_upload_sessions")
    .select("intake_status")
    .eq("batch_id", batchId)
    .is("deleted_at", null);

  const rows = (sessions ?? []) as { intake_status: string | null }[];
  const total = (batch.total_files as number) || rows.length;
  let approved = 0;
  let failed = 0;
  let discarded = 0;
  let pending = 0;
  let processing = 0;

  for (const r of rows) {
    switch (r.intake_status) {
      case "approved":
        approved++;
        break;
      case "failed":
        failed++;
        break;
      case "discarded":
        discarded++;
        break;
      case "review_pending":
      case "review_in_progress":
        pending++;
        break;
      default:
        processing++;
        break;
    }
  }

  const processed = approved + failed + discarded + pending;

  let status: string;
  if (approved + discarded >= total && total > 0) {
    status = "completed";
  } else if (processing > 0) {
    status = "processing";
  } else if (approved > 0) {
    status = "partially_approved";
  } else {
    status = "ready_for_review";
  }

  await admin
    .from("dms_upload_batches")
    .update({
      processed_files: processed,
      approved_files: approved,
      failed_files: failed,
      status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", batchId);
}

// ════════════════════════════════════════════════════════════════════════════
// 1. createDmsUploadBatch
// ════════════════════════════════════════════════════════════════════════════

const BatchFileSchema = z.object({
  original_filename: z.string().min(1).max(500),
  mime_type: z.string().min(1),
  file_size_bytes: z.number().int().positive(),
  sha256_hash: z.string().length(64),
});

const CreateBatchSchema = z.object({
  files: z.array(BatchFileSchema).min(1).max(DMS_MAX_BATCH_FILES, {
    message: `A batch may contain at most ${DMS_MAX_BATCH_FILES} files`,
  }),
  entityType: z.string().optional(),
  entityId: z.number().int().positive().optional(),
});

export type CreateBatchInput = z.input<typeof CreateBatchSchema>;

export type BatchSessionResult = {
  sessionId: number;
  sessionCode: string;
  signedUrl: string;
  token?: string;
  path: string;
  originalFilename: string;
  isDuplicate: boolean;
  duplicateDocument?: { id: number; document_no: string; title: string } | null;
};

export type CreateBatchResult = {
  batchId: number;
  batchCode: string;
  sessions: BatchSessionResult[];
};

export async function createDmsUploadBatch(
  input: CreateBatchInput
): Promise<ActionResult<CreateBatchResult>> {
  try {
    const parsed = CreateBatchSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Validation error" };
    }
    const { files, entityType, entityId } = parsed.data;

    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canUpload(ctx))
      return { success: false, error: "You do not have permission to upload documents" };
    if (!(await isBatchIntakeEnabled(supabase)))
      return { success: false, error: "Batch upload is not enabled" };

    const batchCode = "B" + randomUUID().replace(/-/g, "").substring(0, 19).toUpperCase();

    // Create the batch row (RLS: uploader/admin).
    const { data: batch, error: batchErr } = await supabase
      .from("dms_upload_batches")
      .insert({
        batch_code: batchCode,
        status: "processing",
        total_files: files.length,
        entity_type: entityType ?? null,
        entity_id: entityId ?? null,
        created_by: ctx.profile.id,
      })
      .select("id, batch_code")
      .single();

    if (batchErr || !batch) {
      return { success: false, error: batchErr?.message ?? "Failed to create batch" };
    }

    const batchId = batch.id as number;
    const sessions: BatchSessionResult[] = [];

    // Create one upload session per file (reuses proven dedupe + signed URL logic).
    for (const file of files) {
      const sessionInput: CreateUploadSessionInput = {
        original_filename: file.original_filename,
        mime_type: file.mime_type,
        file_size_bytes: file.file_size_bytes,
        sha256_hash: file.sha256_hash,
      };
      const res = await createDmsUploadSession(sessionInput);
      if (!res.success || !res.data) {
        // Roll back the batch: nothing has been uploaded yet.
        await supabase
          .from("dms_upload_batches")
          .update({ status: "cancelled", deleted_at: new Date().toISOString() })
          .eq("id", batchId);
        return {
          success: false,
          error: `Failed to prepare "${file.original_filename}": ${res.error ?? "unknown error"}`,
        };
      }
      const d = res.data;
      // Tag the session with its batch (admin client: bookkeeping update).
      await createAdminClient()
        .from("dms_upload_sessions")
        .update({ batch_id: batchId })
        .eq("id", d.session.id);

      sessions.push({
        sessionId: d.session.id,
        sessionCode: d.session.session_code,
        signedUrl: d.signedUrl,
        token: d.token,
        path: d.path,
        originalFilename: file.original_filename,
        isDuplicate: d.isDuplicate,
        duplicateDocument: d.duplicateDocument ?? null,
      });
    }

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_upload_batches",
      entity_id: batchId,
      entity_reference: batchCode,
      action: "create",
      new_values: { event: "dms_batch_created", total_files: files.length, entity_type: entityType ?? null },
    });

    revalidatePath("/dms/inbox");

    return { success: true, data: { batchId, batchCode, sessions } };
  } catch (e) {
    console.error("createDmsUploadBatch error", e);
    return { success: false, error: String(e) };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 2. startAiIntakeAndCreateDraft  (one file → one pending_ai_review draft)
// ════════════════════════════════════════════════════════════════════════════

const StartDraftSchema = z.object({
  uploadSessionId: z.number().int().positive(),
  allowDuplicate: z.boolean().optional().default(false),
});

export type StartDraftResult = {
  documentId: number;
  documentNo: string;
  status: string;
  confidence: string | null;
};

export async function startAiIntakeAndCreateDraft(
  input: z.input<typeof StartDraftSchema>
): Promise<ActionResult<StartDraftResult>> {
  try {
    const parsed = StartDraftSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message };
    const { uploadSessionId, allowDuplicate } = parsed.data;

    const supabase = await createClient();
    const admin = createAdminClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canUpload(ctx)) return { success: false, error: "Permission denied" };
    if (!(await isBatchIntakeEnabled(supabase)))
      return { success: false, error: "Batch upload is not enabled" };

    // Load the session.
    const { data: session, error: sessErr } = await supabase
      .from("dms_upload_sessions")
      .select("id, session_code, batch_id, document_id, intake_status, original_filename")
      .eq("id", uploadSessionId)
      .is("deleted_at", null)
      .single();
    if (sessErr || !session) return { success: false, error: "Upload session not found" };

    const batchId = session.batch_id as number | null;

    // entity_type/entity_id are stored on the batch, not on individual sessions.
    let batchEntityType: string | null = null;
    let batchEntityId: number | null = null;
    if (batchId) {
      const { data: batchRow } = await supabase
        .from("dms_upload_batches")
        .select("entity_type, entity_id")
        .eq("id", batchId)
        .single();
      batchEntityType = (batchRow?.entity_type as string | null) ?? null;
      batchEntityId = (batchRow?.entity_id as number | null) ?? null;
    }

    // Idempotency: draft already created for this session.
    if (session.document_id) {
      const { data: existingDoc } = await supabase
        .from("dms_documents")
        .select("id, document_no, status")
        .eq("id", session.document_id as number)
        .single();
      if (existingDoc) {
        return {
          success: true,
          data: {
            documentId: existingDoc.id as number,
            documentNo: existingDoc.document_no as string,
            status: existingDoc.status as string,
            confidence: null,
          },
        };
      }
    }

    // Run the proven single-file AI analysis path (OCR + AI + stores result,
    // sets session.intake_status = review_pending). No draft doc created by it.
    const aiRes = await startAiIntakeFromUploadSession({ uploadSessionId, allowDuplicate });
    if (!aiRes.success) {
      // Session is already marked failed by the analysis action.
      if (batchId) await recomputeBatchStatus(batchId);
      await logAudit({
        module_code: "DMS",
        entity_name: "dms_upload_sessions",
        entity_id: uploadSessionId,
        entity_reference: session.session_code as string,
        action: "update",
        new_values: { event: "dms_batch_draft_failed", batch_id: batchId },
      });
      return { success: false, error: aiRes.error ?? "AI analysis failed" };
    }

    // Reload session to pick up ai_result_id.
    const { data: session2 } = await supabase
      .from("dms_upload_sessions")
      .select("id, ai_result_id, mime_type, original_filename, sha256_hash, file_size_bytes")
      .eq("id", uploadSessionId)
      .single();

    const aiResultId = (session2?.ai_result_id as number | null) ?? null;

    // Load AI suggestions.
    let suggestedTypeId: number | null = null;
    let suggestedTitle: string | null = null;
    let suggestedDescription: string | null = null;
    let issueDate: string | null = null;
    let expiryDate: string | null = null;
    let confidenceLabel: string | null = null;
    if (aiResultId) {
      const { data: ai } = await supabase
        .from("dms_ai_extraction_results")
        .select("suggested_document_type_id, suggested_title, suggested_description, issue_date_suggestion, expiry_date_suggestion, classification_confidence")
        .eq("id", aiResultId)
        .single();
      if (ai) {
        suggestedTypeId = (ai.suggested_document_type_id as number | null) ?? null;
        suggestedTitle = (ai.suggested_title as string | null) ?? null;
        suggestedDescription = (ai.suggested_description as string | null) ?? null;
        issueDate = (ai.issue_date_suggestion as string | null) ?? null;
        expiryDate = (ai.expiry_date_suggestion as string | null) ?? null;
        confidenceLabel = (ai.classification_confidence as string | null) ?? null;
      }
    }

    // Resolve type + category. dms_documents.document_type_id and category_id
    // are NOT NULL, so a draft must always carry a (correctable) type/category.
    // Use the AI-suggested type if resolvable; otherwise fall back to the first
    // active type. The user MUST review/correct this before approval.
    let typeId = suggestedTypeId;
    let categoryId: number | null = null;
    let typeDefaultConfidentiality: string | null = null;
    if (typeId) {
      const { data: t } = await supabase
        .from("dms_document_types")
        .select("id, category_id, default_confidentiality, is_active")
        .eq("id", typeId)
        .single();
      if (t && t.is_active) {
        categoryId = t.category_id as number | null;
        typeDefaultConfidentiality = t.default_confidentiality as string | null;
      } else {
        typeId = null;
      }
    }
    if (!typeId || categoryId == null) {
      const { data: fallback } = await supabase
        .from("dms_document_types")
        .select("id, category_id, default_confidentiality")
        .eq("is_active", true)
        .is("deleted_at", null)
        .not("category_id", "is", null)
        .order("sort_order", { ascending: true })
        .order("id", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!fallback) {
        return { success: false, error: "No active document type is configured to host a draft" };
      }
      typeId = fallback.id as number;
      categoryId = fallback.category_id as number;
      typeDefaultConfidentiality = fallback.default_confidentiality as string | null;
    }

    // Generate document number.
    const { data: docNoData, error: docNoError } = await supabase.rpc(
      "generate_next_reference_number",
      { p_rule_code: "MASTER_DMS_DOCUMENT" }
    );
    const docNoRows = docNoData as Array<{ generated_reference_number: string }> | null;
    if (docNoError || !docNoRows || docNoRows.length === 0 || !docNoRows[0]?.generated_reference_number) {
      return { success: false, error: docNoError?.message ?? "Failed to generate document number" };
    }
    const documentNo = String(docNoRows[0].generated_reference_number);

    const filename = (session.original_filename as string) ?? "Document";
    const title = (suggestedTitle && suggestedTitle.trim()) || stripExtension(filename) || documentNo;
    const confidentiality = typeDefaultConfidentiality ?? "internal";

    // Entity-context carry-through from the parent batch (party only at draft stage).
    const partyId = batchEntityType === "party" && batchEntityId ? batchEntityId : null;

    // Create the DRAFT document (pending_ai_review). No file copied yet; the
    // file stays in dms-temp until the user approves this single draft, exactly
    // like the single-file flow. The intake review screen previews from dms-temp.
    const nowIso = new Date().toISOString();
    const { data: draft, error: draftErr } = await supabase
      .from("dms_documents")
      .insert({
        document_no: documentNo,
        title,
        description: suggestedDescription ?? null,
        document_type_id: typeId,
        category_id: categoryId,
        status: "pending_ai_review",
        confidentiality_level: confidentiality,
        owner_user_id: ctx.profile.id,
        party_id: partyId,
        issue_date: issueDate ?? null,
        expiry_date: expiryDate ?? null,
        created_by: ctx.profile.id,
        created_at: nowIso,
        updated_by: ctx.profile.id,
        updated_at: nowIso,
      })
      .select("id, document_no")
      .single();

    if (draftErr || !draft) {
      return { success: false, error: draftErr?.message ?? "Failed to create draft document" };
    }
    const documentId = draft.id as number;

    // Link the session to the draft (keep intake_status = review_pending).
    await supabase
      .from("dms_upload_sessions")
      .update({ document_id: documentId, updated_at: nowIso })
      .eq("id", uploadSessionId);

    // Point the AI result at the draft doc.
    if (aiResultId) {
      await supabase
        .from("dms_ai_extraction_results")
        .update({ document_id: documentId })
        .eq("id", aiResultId);
    }

    // Persist field-level AI suggestions in REVIEW/DRAFT storage only.
    const reviewRows = [
      { field_code: "title", field_type: "text", value: title },
      { field_code: "document_type_id", field_type: "number", value: typeId },
      { field_code: "description", field_type: "text", value: suggestedDescription ?? null },
      { field_code: "issue_date", field_type: "date", value: issueDate ?? null },
      { field_code: "expiry_date", field_type: "date", value: expiryDate ?? null },
      { field_code: "confidentiality_level", field_type: "text", value: confidentiality },
    ]
      .filter((r) => r.value !== null && r.value !== undefined && r.value !== "")
      .map((r) => ({
        upload_session_id: uploadSessionId,
        field_scope: "document",
        field_code: r.field_code,
        field_type: r.field_type,
        suggested_value_json: r.value as unknown,
        reviewed_value_json: r.value as unknown,
        confidence_label: confidenceLabel,
        review_status: "suggested",
        updated_at: nowIso,
      }));
    if (reviewRows.length > 0) {
      await supabase
        .from("dms_intake_review_values")
        .upsert(reviewRows, { onConflict: "upload_session_id,field_scope,field_code" });
    }

    // Draft-created document event (safe metadata only).
    await admin.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "batch_draft_created",
      description: `AI draft created from batch intake — session ${session.session_code}`,
      performed_by: ctx.profile.id,
      performed_at: nowIso,
      metadata_json: { document_no: documentNo, upload_session_id: uploadSessionId, batch_id: batchId, ai_result_id: aiResultId },
    });

    if (batchId) await recomputeBatchStatus(batchId);

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: documentId,
      entity_reference: documentNo,
      action: "create",
      new_values: { event: "dms_batch_draft_created", upload_session_id: uploadSessionId, batch_id: batchId, ai_result_id: aiResultId },
    });

    revalidatePath("/dms/inbox");

    return {
      success: true,
      data: { documentId, documentNo, status: "pending_ai_review", confidence: confidenceLabel },
    };
  } catch (e) {
    console.error("startAiIntakeAndCreateDraft error", e);
    return { success: false, error: String(e) };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 3. finalizeDraftIntake  (approves EXACTLY ONE draft — never an array)
// ════════════════════════════════════════════════════════════════════════════

const FinalizeSchema = z
  .object({
    uploadSessionId: z.number().int().positive().optional(),
    documentId: z.number().int().positive().optional(),
    title: z.string().min(1, "Title is required").max(500),
    documentTypeId: z.number().int().positive("Document type is required"),
    description: z.string().max(2000).nullable().optional(),
    issueDate: z.string().nullable().optional(),
    expiryDate: z.string().nullable().optional(),
    confidentialityLevel: z.string().optional(),
    owningCompanyId: z.number().int().positive().nullable().optional(),
    owningBranchId: z.number().int().positive().nullable().optional(),
    partyId: z.number().int().positive().nullable().optional(),
    metadataValues: z
      .array(z.object({ definitionId: z.number().int().positive(), fieldType: z.string(), rawValue: z.string() }))
      .optional()
      .default([]),
    tagIds: z.array(z.number().int().positive()).optional().default([]),
    links: z
      .array(z.object({ entityType: z.string(), entityId: z.number().int().positive(), linkRole: z.string().optional(), isPrimary: z.boolean().optional() }))
      .optional()
      .default([]),
    aiResultId: z.number().int().positive().nullable().optional(),
  })
  .refine(
    (v) => (v.uploadSessionId != null) !== (v.documentId != null),
    { message: "Provide exactly one of uploadSessionId or documentId" }
  );

export type FinalizeDraftInput = z.input<typeof FinalizeSchema>;

export async function finalizeDraftIntake(
  input: FinalizeDraftInput
): Promise<ActionResult<{ documentId: number; documentNo: string }>> {
  try {
    const parsed = FinalizeSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Validation error" };
    const v = parsed.data;

    const supabase = await createClient();
    const admin = createAdminClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canApprove(ctx)) return { success: false, error: "Permission denied" };

    if (v.issueDate && v.expiryDate && v.expiryDate < v.issueDate) {
      return { success: false, error: "Expiry date must be on or after issue date" };
    }

    // Resolve the single upload session (by session id or by its draft document id).
    let sessionQuery = supabase
      .from("dms_upload_sessions")
      .select("id, session_code, batch_id, document_id, intake_status, temp_storage_path, original_filename, mime_type, file_size_bytes, sha256_hash, ai_result_id")
      .is("deleted_at", null);
    sessionQuery = v.uploadSessionId
      ? sessionQuery.eq("id", v.uploadSessionId)
      : sessionQuery.eq("document_id", v.documentId!);

    const { data: session, error: sessErr } = await sessionQuery.single();
    if (sessErr || !session) return { success: false, error: "Draft intake session not found" };

    const uploadSessionId = session.id as number;
    const documentId = session.document_id as number | null;
    const batchId = session.batch_id as number | null;
    if (!documentId) return { success: false, error: "This intake has no draft document to finalize" };

    // Load the draft document.
    const { data: doc, error: docErr } = await supabase
      .from("dms_documents")
      .select("id, document_no, status, current_version_id, owning_company_id")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();
    if (docErr || !doc) return { success: false, error: "Draft document not found" };

    // Idempotency: already approved.
    if (doc.status === "active" || session.intake_status === "approved") {
      return { success: true, data: { documentId, documentNo: doc.document_no as string } };
    }
    if (doc.status !== "pending_ai_review") {
      return { success: false, error: `Document is not a pending AI draft (status: ${doc.status})` };
    }

    // Validate the chosen type is active and resolve its category.
    const { data: docType, error: typeError } = await supabase
      .from("dms_document_types")
      .select("id, type_code, category_id, default_confidentiality, is_active")
      .eq("id", v.documentTypeId)
      .single();
    if (typeError || !docType) return { success: false, error: "Document type not found" };
    if (!docType.is_active) return { success: false, error: "Selected document type is not active" };

    const userId = ctx.profile.id;
    const nowIso = new Date().toISOString();
    const confidentiality = v.confidentialityLevel ?? (docType.default_confidentiality as string | null) ?? "internal";

    // ── Promote the existing draft to ACTIVE with the user-confirmed values ──
    const { error: updErr } = await supabase
      .from("dms_documents")
      .update({
        title: v.title,
        description: v.description ?? null,
        document_type_id: v.documentTypeId,
        category_id: docType.category_id,
        status: "active",
        confidentiality_level: confidentiality,
        owning_company_id: v.owningCompanyId ?? doc.owning_company_id ?? null,
        owning_branch_id: v.owningBranchId ?? null,
        party_id: v.partyId ?? null,
        issue_date: v.issueDate ?? null,
        expiry_date: v.expiryDate ?? null,
        updated_by: userId,
        updated_at: nowIso,
      })
      .eq("id", documentId);
    if (updErr) return { success: false, error: updErr.message };

    // ── Copy the file dms-temp → dms-documents + version/file rows (once) ────
    let fileRecordId: number | null = null;
    if (!doc.current_version_id && session.temp_storage_path) {
      const year = new Date().getFullYear();
      const ext = getExtension(session.original_filename as string);
      const finalPath = buildFinalStoragePath(
        v.owningCompanyId ?? (doc.owning_company_id as number | null) ?? null,
        year,
        docType.type_code as string,
        documentId,
        1,
        ext
      );

      const { data: tempBlob, error: dlErr } = await admin.storage
        .from("dms-temp")
        .download(session.temp_storage_path as string);
      if (dlErr || !tempBlob) {
        // Revert to draft so the user can retry.
        await supabase.from("dms_documents").update({ status: "pending_ai_review", updated_at: new Date().toISOString() }).eq("id", documentId);
        return { success: false, error: `Failed to read temp file: ${dlErr?.message ?? "unknown"}` };
      }
      const { error: upErr } = await admin.storage
        .from("dms-documents")
        .upload(finalPath, tempBlob, { contentType: session.mime_type as string, upsert: false });
      if (upErr) {
        await supabase.from("dms_documents").update({ status: "pending_ai_review", updated_at: new Date().toISOString() }).eq("id", documentId);
        return { success: false, error: `Failed to store file: ${upErr.message}` };
      }

      const { data: version, error: verErr } = await supabase
        .from("dms_document_versions")
        .insert({
          document_id: documentId,
          version_number: 1,
          version_label: "v1",
          change_notes: "Created from AI batch intake",
          is_current: true,
          created_by: userId,
          created_at: nowIso,
        })
        .select("id")
        .single();
      if (verErr || !version) return { success: false, error: verErr?.message ?? "Failed to create version" };

      const { data: fileRecord, error: fileErr } = await supabase
        .from("dms_document_files")
        .insert({
          document_id: documentId,
          version_id: version.id,
          file_role: "original",
          storage_bucket: "dms-documents",
          storage_path: finalPath,
          file_name: session.original_filename,
          mime_type: session.mime_type,
          file_size_bytes: session.file_size_bytes,
          sha256_hash: session.sha256_hash ?? null,
          created_by: userId,
          created_at: nowIso,
        })
        .select("id")
        .single();
      if (fileErr || !fileRecord) return { success: false, error: fileErr?.message ?? "Failed to create file record" };
      fileRecordId = fileRecord.id as number;

      await supabase
        .from("dms_documents")
        .update({ current_version_id: version.id, updated_at: new Date().toISOString() })
        .eq("id", documentId);
    }

    // ── Approved metadata (now allowed — user approved THIS draft) ───────────
    if (v.metadataValues && v.metadataValues.length > 0) {
      const metaUpserts = v.metadataValues
        .filter((m) => m.rawValue !== null && m.rawValue !== undefined && m.rawValue !== "")
        .map((m) => ({
          document_id: documentId,
          definition_id: m.definitionId,
          ...resolveMetadataValueColumns(m.fieldType, m.rawValue),
          updated_by: userId,
          updated_at: nowIso,
        }));
      if (metaUpserts.length > 0) {
        await supabase
          .from("dms_document_metadata_values")
          .upsert(metaUpserts, { onConflict: "document_id,definition_id" });
      }
    }

    // ── Tags ──────────────────────────────────────────────────────────────
    if (v.tagIds && v.tagIds.length > 0) {
      await supabase
        .from("dms_document_tags")
        .insert(v.tagIds.map((tagId) => ({ document_id: documentId, tag_id: tagId, created_by: userId })));
    }

    // ── Links ─────────────────────────────────────────────────────────────
    if (v.links && v.links.length > 0) {
      await supabase.from("dms_document_links").insert(
        v.links.map((l) => ({
          document_id: documentId,
          entity_type: l.entityType,
          entity_id: l.entityId,
          link_role: l.linkRole ?? "related",
          is_primary: l.isPrimary ?? false,
          linked_at: nowIso,
          created_by: userId,
        }))
      );
    }

    // ── Expiry reminders ────────────────────────────────────────────────────
    if (v.expiryDate) {
      const expiry = new Date(v.expiryDate);
      for (const daysBefore of REMINDER_DAYS) {
        const reminderDate = new Date(expiry);
        reminderDate.setDate(reminderDate.getDate() - daysBefore);
        await supabase.from("dms_expiry_reminders").upsert(
          {
            document_id: documentId,
            reminder_days_before: daysBefore,
            reminder_date: reminderDate.toISOString().split("T")[0],
            status: "pending",
            updated_at: nowIso,
          },
          { onConflict: "document_id,reminder_days_before", ignoreDuplicates: false }
        );
      }
    }

    // ── Mark AI result accepted + sync content text ──────────────────────────
    const effectiveAiResultId = v.aiResultId ?? (session.ai_result_id as number | null);
    if (effectiveAiResultId) {
      await supabase
        .from("dms_ai_extraction_results")
        .update({ ai_status: "accepted", review_action: "accepted", reviewed_by: userId, reviewed_at: nowIso, document_id: documentId })
        .eq("id", effectiveAiResultId);

      try {
        const { data: aiRaw } = await supabase
          .from("dms_ai_extraction_results")
          .select("raw_ocr_text")
          .eq("id", effectiveAiResultId)
          .single();
        let rawOcrText = (aiRaw as Record<string, unknown> | null)?.raw_ocr_text as string | null;

        // Vision fallback: if raw_ocr_text is empty, download the file and run vision OCR
        if (!rawOcrText?.trim() && fileRecordId) {
          try {
            const { data: fileRow } = await supabase
              .from("dms_document_files")
              .select("storage_bucket, storage_path, file_name, mime_type")
              .eq("id", fileRecordId)
              .single();
            if (fileRow?.storage_path) {
              const { data: blob } = await admin.storage
                .from((fileRow.storage_bucket as string | null) ?? "dms-documents")
                .download(fileRow.storage_path as string);
              if (blob) {
                const buffer = Buffer.from(await blob.arrayBuffer());
                const content = await extractFileContent(buffer, fileRow.mime_type as string, fileRow.file_name as string);
                if (content.hasContent) {
                  const { provider: aiProvider } = await getDmsAiProvider();
                  if (aiProvider.isConfigured()) {
                    const fallbackOutput = await aiProvider.analyze({
                      ocrText: content.text,
                      imageFiles: content.images,
                      currentTypeCode: null,
                      typeCandidates: [],
                      metadataFields: [],
                      originalFilename: fileRow.file_name as string,
                    });
                    const transcription = fallbackOutput.extraction?.fullTextTranscription;
                    const fallbackText = transcription?.trim() || content.text?.trim() || null;
                    if (fallbackText) {
                      rawOcrText = fallbackText;
                      await supabase
                        .from("dms_ai_extraction_results")
                        .update({ raw_ocr_text: fallbackText.slice(0, 100_000) })
                        .eq("id", effectiveAiResultId);
                    }
                  }
                }
              }
            }
          } catch { /* fallback failed — continue without text */ }
        }

        if (rawOcrText && rawOcrText.trim().length > 0) {
          if (fileRecordId) {
            await persistFileOcrResult({
              supabase,
              fileId: fileRecordId,
              documentId,
              text: rawOcrText,
              provider: "ai_intake",
              model: null,
              performedBy: userId,
              source: "ai_intake",
            });
          } else {
            await writeDocumentContentTextSystem({ documentId, text: rawOcrText, source: "ai_intake", performedBy: userId });
            await supabase.from("dms_documents").update({ ocr_text_available: true, updated_at: nowIso }).eq("id", documentId);
          }
        }
      } catch (contentErr) {
        console.warn("[DMS OCR-AI FIX.1] batch content text sync (non-fatal):", String(contentErr));
      }
    }

    // ── Update upload session → approved ─────────────────────────────────────
    await supabase
      .from("dms_upload_sessions")
      .update({
        status: "completed",
        intake_status: "approved",
        review_status: "approved",
        review_completed_at: nowIso,
        reviewed_by: userId,
        completed_at: nowIso,
        updated_at: nowIso,
      })
      .eq("id", uploadSessionId);

    // ── Document events ──────────────────────────────────────────────────────
    await admin.from("dms_document_events").insert([
      {
        document_id: documentId,
        event_type: "batch_draft_approved",
        description: `AI batch draft approved & activated — session ${session.session_code}`,
        performed_by: userId,
        performed_at: nowIso,
        metadata_json: { document_no: doc.document_no, upload_session_id: uploadSessionId, batch_id: batchId, ai_result_id: effectiveAiResultId },
      },
    ]);

    if (batchId) await recomputeBatchStatus(batchId);

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: documentId,
      entity_reference: doc.document_no as string,
      action: "update",
      new_values: { event: "dms_batch_draft_approved", upload_session_id: uploadSessionId, batch_id: batchId },
    });

    revalidatePath("/dms/documents");
    revalidatePath("/dms/inbox");
    revalidatePath(`/dms/intake/${session.session_code}`);

    return { success: true, data: { documentId, documentNo: doc.document_no as string } };
  } catch (e) {
    console.error("finalizeDraftIntake error", e);
    return { success: false, error: String(e) };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 4. discardDraftIntake  (one draft only — follows the approved DMS delete std)
// ════════════════════════════════════════════════════════════════════════════

const DiscardSchema = z
  .object({
    uploadSessionId: z.number().int().positive().optional(),
    documentId: z.number().int().positive().optional(),
    reason: z.string().max(500).optional(),
  })
  .refine((v) => v.uploadSessionId != null || v.documentId != null, {
    message: "Provide uploadSessionId or documentId",
  });

export type DiscardDraftInput = z.input<typeof DiscardSchema>;

type DiscardableSession = {
  id: number;
  session_code: string;
  batch_id: number | null;
  document_id: number | null;
  intake_status: string | null;
};

/**
 * Core single-draft discard (no batch recompute — the caller decides when to
 * recompute so bulk discards can batch the bookkeeping). Soft-deletes the draft
 * document + files and purges storage, per the approved DMS delete standard.
 * This is NOT an approval path; bulk discard simply loops this helper.
 */
async function performDraftDiscard(
  session: DiscardableSession,
  reason: string | undefined,
  supabase: SupabaseClient,
  admin: SupabaseClient,
  profileId: number
): Promise<{ ok: true; batchId: number | null } | { ok: false; error: string }> {
  if (session.intake_status === "approved") {
    return { ok: false, error: "Cannot discard an already-approved intake" };
  }

  const sessId = session.id;
  const docId = session.document_id;
  const batchId = session.batch_id;
  const now = new Date().toISOString();

  // Soft-delete the draft document + files, purge storage — per the approved
  // DMS delete standard (same behaviour as deleteDmsDocument).
  if (docId) {
    const { data: fileRows } = await supabase
      .from("dms_document_files")
      .select("id, storage_bucket, storage_path")
      .eq("document_id", docId)
      .is("deleted_at", null);
    const storageFiles = (fileRows ?? []) as { id: number; storage_bucket: string | null; storage_path: string | null }[];

    await supabase
      .from("dms_documents")
      .update({ deleted_at: now, status: "deleted", updated_by: profileId })
      .eq("id", docId)
      .is("deleted_at", null);
    await supabase.from("dms_document_files").update({ deleted_at: now }).eq("document_id", docId).is("deleted_at", null);
    await supabase.from("dms_document_versions").update({ is_current: false }).eq("document_id", docId);

    const byBucket = new Map<string, string[]>();
    for (const f of storageFiles) {
      if (!f.storage_bucket || !f.storage_path) continue;
      const paths = byBucket.get(f.storage_bucket) ?? [];
      paths.push(f.storage_path);
      byBucket.set(f.storage_bucket, paths);
    }
    for (const [bucket, paths] of byBucket.entries()) {
      try {
        await admin.storage.from(bucket).remove(paths);
      } catch (storageErr) {
        console.warn(`[DMS 13 discard] storage purge failed for "${bucket}":`, String(storageErr));
      }
    }
  }

  // Mark the session discarded.
  await supabase
    .from("dms_upload_sessions")
    .update({
      intake_status: "discarded",
      review_status: "discarded",
      discarded_at: now,
      discard_reason: reason?.slice(0, 500) ?? null,
      updated_at: now,
    })
    .eq("id", sessId);

  await logAudit({
    module_code: "DMS",
    entity_name: "dms_upload_sessions",
    entity_id: sessId,
    entity_reference: session.session_code,
    action: "delete",
    new_values: { event: "dms_batch_draft_discarded", document_id: docId, batch_id: batchId },
  });

  return { ok: true, batchId };
}

export async function discardDraftIntake(
  input: DiscardDraftInput
): Promise<ActionResult> {
  try {
    const parsed = DiscardSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Validation error" };
    const { uploadSessionId, documentId, reason } = parsed.data;

    const supabase = await createClient();
    const admin = createAdminClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canDiscard(ctx)) return { success: false, error: "Permission denied" };

    let q = supabase
      .from("dms_upload_sessions")
      .select("id, session_code, batch_id, document_id, intake_status")
      .is("deleted_at", null);
    q = uploadSessionId ? q.eq("id", uploadSessionId) : q.eq("document_id", documentId!);
    const { data: session, error: sessErr } = await q.single();
    if (sessErr || !session) return { success: false, error: "Draft intake session not found" };

    const res = await performDraftDiscard(session as DiscardableSession, reason, supabase, admin, ctx.profile.id);
    if (!res.ok) return { success: false, error: res.error };

    if (res.batchId) await recomputeBatchStatus(res.batchId);

    revalidatePath("/dms/inbox");
    revalidatePath("/dms/documents");

    return { success: true };
  } catch (e) {
    console.error("discardDraftIntake error", e);
    return { success: false, error: String(e) };
  }
}

// ── Bulk discard (DISCARD-ONLY — explicitly NOT an approval path) ──────────────
// Multi-select discard is permitted because discarding is a destructive cleanup
// action, not an approval. There is still NO bulk approval anywhere.

const BulkDiscardSchema = z.object({
  uploadSessionIds: z.array(z.number().int().positive()).min(1).max(50),
  reason: z.string().max(500).optional(),
});

export type BulkDiscardInput = z.input<typeof BulkDiscardSchema>;

export async function discardDraftIntakeBulk(
  input: BulkDiscardInput
): Promise<ActionResult<{ discarded: number; failed: number; errors: string[] }>> {
  try {
    const parsed = BulkDiscardSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Validation error" };
    const { uploadSessionIds, reason } = parsed.data;

    const supabase = await createClient();
    const admin = createAdminClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canDiscard(ctx)) return { success: false, error: "Permission denied" };

    const uniqueIds = Array.from(new Set(uploadSessionIds));
    const { data: sessions } = await supabase
      .from("dms_upload_sessions")
      .select("id, session_code, batch_id, document_id, intake_status")
      .in("id", uniqueIds)
      .is("deleted_at", null);

    const found = (sessions ?? []) as DiscardableSession[];
    const affectedBatches = new Set<number>();
    let discarded = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const id of uniqueIds) {
      const session = found.find((s) => s.id === id);
      if (!session) {
        failed++;
        errors.push(`Session ${id}: not found`);
        continue;
      }
      const res = await performDraftDiscard(session, reason, supabase, admin, ctx.profile.id);
      if (res.ok) {
        discarded++;
        if (res.batchId) affectedBatches.add(res.batchId);
      } else {
        failed++;
        errors.push(`${session.session_code}: ${res.error}`);
      }
    }

    for (const batchId of affectedBatches) {
      await recomputeBatchStatus(batchId);
    }

    revalidatePath("/dms/inbox");
    revalidatePath("/dms/documents");

    return { success: true, data: { discarded, failed, errors } };
  } catch (e) {
    console.error("discardDraftIntakeBulk error", e);
    return { success: false, error: String(e) };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 5. rerunBatchDraftAi  (one draft only)
// ════════════════════════════════════════════════════════════════════════════

export async function rerunBatchDraftAi(
  uploadSessionId: number
): Promise<ActionResult<{ sessionCode: string; status: string }>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canUpload(ctx)) return { success: false, error: "Permission denied" };

    const result = await retryAiIntake(uploadSessionId);

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_upload_sessions",
      entity_id: uploadSessionId,
      entity_reference: result.data?.sessionCode ?? String(uploadSessionId),
      action: "update",
      new_values: { event: "dms_batch_ai_rerun" },
    });

    revalidatePath("/dms/inbox");
    return result;
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ════════════════════════════════════════════════════════════════════════════
// 6/7. Read actions for the Batch Review Queue
// ════════════════════════════════════════════════════════════════════════════

export type DmsUploadBatchRow = {
  id: number;
  batch_code: string;
  status: string;
  total_files: number;
  processed_files: number;
  approved_files: number;
  failed_files: number;
  entity_type: string | null;
  entity_id: number | null;
  created_at: string;
};

export type DmsBatchDraftRow = {
  sessionId: number;
  sessionCode: string;
  originalFilename: string;
  intakeStatus: string;
  isDuplicate: boolean;
  documentId: number | null;
  documentNo: string | null;
  aiTitle: string | null;
  documentStatus: string | null;
  documentTypeName: string | null;
  confidenceLabel: string | null;
};

export type DmsUploadBatchListRow = DmsUploadBatchRow & {
  pendingCount: number;
  approvedCount: number;
  discardedCount: number;
  failedCount: number;
};

/**
 * RLS-scoped list of the user's upload batches (admins see all via policy).
 * Surfaces pending-review counts so unfinished batches are never "lost" — they
 * remain reachable from the Batch Intake list until every draft is resolved.
 */
export async function listDmsUploadBatches(
  limit = 100
): Promise<ActionResult<DmsUploadBatchListRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canView(ctx)) return { success: false, error: "Permission denied" };

    const { data: batches, error } = await supabase
      .from("dms_upload_batches")
      .select("id, batch_code, status, total_files, processed_files, approved_files, failed_files, entity_type, entity_id, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 200));

    if (error) return { success: false, error: error.message };
    const batchRows = (batches ?? []) as DmsUploadBatchRow[];
    if (batchRows.length === 0) return { success: true, data: [] };

    // Aggregate live per-draft counts (one query for all listed batches).
    const batchIds = batchRows.map((b) => b.id);
    const { data: sessions } = await supabase
      .from("dms_upload_sessions")
      .select("batch_id, intake_status, document:dms_documents!document_id(status)")
      .in("batch_id", batchIds)
      .is("deleted_at", null);

    const counts = new Map<number, { pending: number; approved: number; discarded: number; failed: number }>();
    for (const s of sessions ?? []) {
      const sd = s as Record<string, unknown>;
      const bId = sd.batch_id as number | null;
      if (bId == null) continue;
      const doc = sd.document as Record<string, unknown> | null;
      const intake = sd.intake_status as string | null;
      const docStatus = (doc?.status as string | null) ?? null;
      const c = counts.get(bId) ?? { pending: 0, approved: 0, discarded: 0, failed: 0 };
      if (intake === "discarded") c.discarded++;
      else if (intake === "failed") c.failed++;
      else if (docStatus === "active" || intake === "approved") c.approved++;
      else if (docStatus === "pending_ai_review") c.pending++;
      counts.set(bId, c);
    }

    const rows: DmsUploadBatchListRow[] = batchRows.map((b) => {
      const c = counts.get(b.id) ?? { pending: 0, approved: 0, discarded: 0, failed: 0 };
      return {
        ...b,
        pendingCount: c.pending,
        approvedCount: c.approved,
        discardedCount: c.discarded,
        failedCount: c.failed,
      };
    });

    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getDmsUploadBatch(
  batchCode: string
): Promise<ActionResult<DmsUploadBatchRow>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canView(ctx)) return { success: false, error: "Permission denied" };

    const { data, error } = await supabase
      .from("dms_upload_batches")
      .select("id, batch_code, status, total_files, processed_files, approved_files, failed_files, entity_type, entity_id, created_at")
      .eq("batch_code", batchCode)
      .is("deleted_at", null)
      .single();
    if (error || !data) return { success: false, error: "Batch not found" };
    return { success: true, data: data as DmsUploadBatchRow };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getDmsUploadBatchDrafts(
  batchId: number
): Promise<ActionResult<DmsBatchDraftRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canView(ctx)) return { success: false, error: "Permission denied" };

    const { data: sessions, error } = await supabase
      .from("dms_upload_sessions")
      .select(`id, session_code, original_filename, intake_status, is_duplicate, document_id, ai_result_id,
               document:dms_documents!document_id(id, document_no, title, status, document_type:dms_document_types!document_type_id(name_en)),
               ai_result:dms_ai_extraction_results!ai_result_id(classification_confidence)`)
      .eq("batch_id", batchId)
      .is("deleted_at", null)
      .order("id", { ascending: true });

    if (error) return { success: false, error: error.message };

    const rows: DmsBatchDraftRow[] = (sessions ?? []).map((s) => {
      const sd = s as Record<string, unknown>;
      const doc = sd.document as Record<string, unknown> | null;
      const docType = doc?.document_type as Record<string, unknown> | null;
      const ai = sd.ai_result as Record<string, unknown> | null;
      return {
        sessionId: sd.id as number,
        sessionCode: sd.session_code as string,
        originalFilename: sd.original_filename as string,
        intakeStatus: (sd.intake_status as string) ?? "uploaded",
        isDuplicate: !!sd.is_duplicate,
        documentId: (doc?.id as number | null) ?? null,
        documentNo: (doc?.document_no as string | null) ?? null,
        aiTitle: (doc?.title as string | null) ?? null,
        documentStatus: (doc?.status as string | null) ?? null,
        documentTypeName: (docType?.name_en as string | null) ?? null,
        confidenceLabel: (ai?.classification_confidence as string | null) ?? null,
      };
    });

    return { success: true, data: rows };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getNextPendingDraftInBatch(
  batchId: number
): Promise<ActionResult<{ sessionCode: string; sessionId: number } | null>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canView(ctx)) return { success: false, error: "Permission denied" };

    const { data, error } = await supabase
      .from("dms_upload_sessions")
      .select("id, session_code, intake_status, document:dms_documents!document_id(status)")
      .eq("batch_id", batchId)
      .is("deleted_at", null)
      .in("intake_status", ["review_pending", "review_in_progress"])
      .order("id", { ascending: true });

    if (error) return { success: false, error: error.message };

    // Return the first session whose draft document is still pending_ai_review.
    for (const s of data ?? []) {
      const sd = s as Record<string, unknown>;
      const doc = sd.document as Record<string, unknown> | null;
      if (!doc || doc.status === "pending_ai_review") {
        return { success: true, data: { sessionCode: sd.session_code as string, sessionId: sd.id as number } };
      }
    }
    return { success: true, data: null };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
