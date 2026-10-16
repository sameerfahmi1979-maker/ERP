"use server";

import { clampToValidDate } from "@/lib/dms/date-validators";
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import type { UploadCreationInput, UploadCreationResult } from "@/lib/dms/numbered-upload-create";
import { createNumberedDocumentFromUpload } from "@/server/numbered-upload-create";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/server/reads/all-pages";
import { createClient } from "@/lib/supabase/server";
import { checkDocumentConfidentialityAccess } from "@/lib/dms/document-access";
import { logAudit } from "@/server/actions/audit";
import {
  resolveStandardFileNameForExistingDocument,
} from "@/server/actions/dms/standard-file-name";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

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

function getExtension(filename: string, mimeType?: string | null): string {
  const parts = filename.split(".");
  if (parts.length > 1) return parts[parts.length - 1].toLowerCase();
  // Fallback: derive from MIME type to avoid generic ".bin" extension
  if (mimeType) {
    const m = mimeType.toLowerCase().split(";")[0].trim();
    const mimeMap: Record<string, string> = {
      "application/pdf": "pdf",
      "image/jpeg": "jpg", "image/jpg": "jpg",
      "image/png": "png", "image/gif": "gif", "image/webp": "webp",
      "image/tiff": "tiff", "image/heic": "heic",
      "application/msword": "doc",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
      "application/vnd.ms-excel": "xls",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
      "text/plain": "txt", "text/csv": "csv", "application/zip": "zip",
    };
    if (mimeMap[m]) return mimeMap[m];
  }
  return "pdf"; // safer default than "bin" — almost all DMS documents are PDFs
}

function canAttach(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.upload") ||
    hasPermission(ctx, "dms.documents.edit") ||
    hasPermission(ctx, "dms.admin")
  );
}

// ── insertDmsEvent helper ─────────────────────────────────────────────────────

async function insertDmsEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  documentId: number,
  eventType: string,
  performedBy: number,
  description: string,
  metadata?: Record<string, unknown>
) {
  await supabase.from("dms_document_events").insert({
    document_id: documentId,
    event_type: eventType,
    description,
    performed_by: performedBy,
    performed_at: new Date().toISOString(),
    metadata_json: metadata ?? null,
  });
}

// ── Attach upload to existing document ───────────────────────────────────────

const AttachSchema = z.object({
  uploadSessionId: z.number().int().positive(),
  documentId: z.number().int().positive(),
  changeNotes: z.string().max(2000).optional(),
  versionLabel: z.string().max(100).optional(),
  allowDuplicate: z.boolean().optional().default(false),
});

export type AttachUploadInput = z.infer<typeof AttachSchema>;

export async function attachUploadToExistingDocument(
  input: AttachUploadInput
): Promise<ActionResult<{ documentId: number; versionId: number; fileId: number }>> {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canAttach(ctx))
      return { success: false, error: "Permission denied: requires dms.documents.upload or dms.documents.edit" };

    const parsed = AttachSchema.safeParse(input);
    if (!parsed.success)
      return { success: false, error: parsed.error.issues[0]?.message ?? "Validation error" };

    const { uploadSessionId, documentId, changeNotes, versionLabel, allowDuplicate } = parsed.data;

    const { data: session, error: sessionError } = await supabase
      .from("dms_upload_sessions")
      .select("*")
      .eq("id", uploadSessionId)
      .is("deleted_at", null)
      .single();

    if (sessionError || !session) return { success: false, error: "Upload session not found" };
    if (session.status === "completed") return { success: false, error: "Upload session is already completed" };
    if (session.status === "cancelled") return { success: false, error: "Upload session has been cancelled" };
    if (!session.temp_storage_path) return { success: false, error: "Temporary file path is missing" };
    // Duplicate detection is informational only — admins may proceed intentionally.

    const { data: document, error: docError } = await supabase
      .from("dms_documents")
      .select("id, document_no, owning_company_id, document_type_id, document_type:dms_document_types!document_type_id(type_code, name_en)")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docError || !document) return { success: false, error: "Document not found" };

    // Authorize the destination action before using the service-key Storage client.
    // A read grant or an upload grant in another company is not attachment authority.
    const destination = await checkDocumentConfidentialityAccess(supabase, documentId, ctx, "dms.documents.upload");
    const editable = destination.allowed ? destination : await checkDocumentConfidentialityAccess(supabase, documentId, ctx, "dms.documents.edit");
    const administrative = editable.allowed ? editable : await checkDocumentConfidentialityAccess(supabase, documentId, ctx, "dms.admin");
    if (!administrative.allowed) return { success: false, error: "Document attachment access is restricted." };

    const typeCode = (document.document_type as unknown as { type_code: string } | null)?.type_code ?? "OTHER";
    const year = new Date().getFullYear();
    const userId = ctx.profile.id;

    // DMS VERSION LINK.1 — require AI review before a file can become a document version.
    // This closes the gap where wrong-type / already-expired files could silently become
    // the current version of a document without any content validation.
    const intakeStatus = session.intake_status as string | undefined;
    if (intakeStatus !== "review_pending") {
      return {
        success: false,
        error:
          "This file hasn't completed AI review yet. Go to the Inbox and run \"Upload & AI Fill\" on it before linking it as a document version.",
      };
    }

    const aiResultId = session.ai_result_id as number | null;
    if (aiResultId) {
      const { data: aiResult } = await supabase
        .from("dms_ai_extraction_results")
        .select(
          `suggested_document_type_id, expiry_date_suggestion,
           suggested_document_type:dms_document_types!suggested_document_type_id(name_en)`
        )
        .eq("id", aiResultId)
        .maybeSingle();

      if (aiResult) {
        const suggestedTypeId = aiResult.suggested_document_type_id as number | null;
        if (suggestedTypeId && suggestedTypeId !== document.document_type_id) {
          const suggestedTypeName =
            (aiResult.suggested_document_type as unknown as { name_en: string } | null)?.name_en ??
            "a different document type";
          const targetTypeName =
            (document.document_type as unknown as { name_en: string } | null)?.name_en ?? "this document's type";
          return {
            success: false,
            error: `AI identified this file as "${suggestedTypeName}", which does not match ${targetTypeName}. Attach it to a matching document instead, or upload the correct file.`,
          };
        }

        const expirySuggestion = clampToValidDate(aiResult.expiry_date_suggestion as string | null);
        const today = new Date().toISOString().slice(0, 10);
        if (expirySuggestion && expirySuggestion < today) {
          return {
            success: false,
            error: `AI detected that this file's expiry date (${expirySuggestion}) has already passed. Upload a valid, non-expired document instead.`,
          };
        }
      }
    }

    const { data: maxVerRow } = await supabase
      .from("dms_document_versions")
      .select("version_number")
      .eq("document_id", documentId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersionNumber = (maxVerRow?.version_number ?? 0) + 1;
    const sessionMimeType = session.mime_type as string | null;
    const ext = getExtension(session.original_filename as string, sessionMimeType);

    const resolvedFileName = await resolveStandardFileNameForExistingDocument({
      documentId,
      originalFilename: session.original_filename as string,
      mimeType: sessionMimeType,
    });

    const finalPath = buildFinalStoragePath(
      document.owning_company_id as number | null,
      year,
      typeCode,
      documentId,
      nextVersionNumber,
      ext
    );

    const { data: tempFileData, error: downloadError } = await adminClient.storage
      .from("dms-temp")
      .download(session.temp_storage_path as string);

    if (downloadError || !tempFileData)
      return { success: false, error: `Failed to read temp file: ${downloadError?.message}` };

    const { error: uploadError } = await adminClient.storage
      .from("dms-documents")
      .upload(finalPath, tempFileData, { contentType: session.mime_type as string, upsert: false });

    if (uploadError) return { success: false, error: `Failed to store file: ${uploadError.message}` };

    await supabase
      .from("dms_document_versions")
      .update({ is_current: false })
      .eq("document_id", documentId);

    const { data: version, error: verError } = await supabase
      .from("dms_document_versions")
      .insert({
        document_id: documentId,
        version_number: nextVersionNumber,
        version_label: versionLabel ?? `v${nextVersionNumber}`,
        change_notes: changeNotes ?? null,
        is_current: true,
        created_by: userId,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (verError) return { success: false, error: verError.message };

    const { data: fileRecord, error: fileError } = await supabase
      .from("dms_document_files")
      .insert({
        document_id: documentId,
        version_id: version.id,
        file_role: "original",
        storage_bucket: "dms-documents",
        storage_path: finalPath,
        file_name: resolvedFileName,
        mime_type: session.mime_type,
        file_size_bytes: session.file_size_bytes,
        sha256_hash: session.sha256_hash,
        created_by: userId,
        created_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (fileError) return { success: false, error: fileError.message };

    await supabase
      .from("dms_documents")
      .update({ current_version_id: version.id, updated_by: userId, updated_at: new Date().toISOString() })
      .eq("id", documentId);

    await supabase
      .from("dms_upload_sessions")
      .update({ document_id: documentId, status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", uploadSessionId);

    await insertDmsEvent(supabase, documentId, "file_uploaded", userId,
      `File uploaded: ${session.original_filename} (v${nextVersionNumber})`,
      { file_id: fileRecord.id, version_id: version.id, version_number: nextVersionNumber });

    await insertDmsEvent(supabase, documentId, "version_uploaded", userId,
      `New version created: v${nextVersionNumber}`,
      { version_id: version.id, version_number: nextVersionNumber, is_current: true });

    await insertDmsEvent(supabase, documentId, "current_version_changed", userId,
      `Current version updated to v${nextVersionNumber}`,
      { version_id: version.id, version_number: nextVersionNumber });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: documentId,
      entity_reference: document.document_no as string,
      action: "update",
      new_values: { event: "file_attached", version_number: nextVersionNumber },
    });

    revalidatePath(`/dms/documents/record/${documentId}`);
    revalidatePath("/dms/documents");
    revalidatePath("/dms/inbox");

    return { success: true, data: { documentId, versionId: version.id, fileId: fileRecord.id } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── DMS VERSION LINK.1 — eligible inbox files for linking as a new version ───
// Instead of a raw re-upload, "Link New Version" on a document picks from files
// that have already been uploaded to the Inbox AND completed AI Fill review.
// This guarantees expiry / document-type validation ran before the file can
// become the current version of an existing document.

export type EligibleVersionLinkCandidate = {
  id: number;
  session_code: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  uploaded_at: string;
  suggested_document_type_id: number | null;
  suggested_document_type_name: string | null;
  classification_confidence: string | null;
  expiry_date_suggestion: string | null;
  type_match: "match" | "mismatch" | "unknown";
  is_expired_suggestion: boolean;
  eligible: boolean;
  ineligible_reason: string | null;
};

export async function getEligibleUploadSessionsForVersionLink(
  documentId: number
): Promise<ActionResult<EligibleVersionLinkCandidate[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!ctx.isAccountActive || ctx.profile.must_change_password || !canAttach(ctx)) return { success: false, error: "Permission denied" };

    const { data: document, error: docError } = await supabase
      .from("dms_documents")
      .select("id, document_type_id")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docError || !document) return { success: false, error: "Document not found" };

    const sessions = await readAllPages(async(from,to)=>await supabase
      .from("dms_upload_sessions")
      .select("id, session_code, original_filename, mime_type, file_size_bytes, uploaded_at, ai_result_id",{count:"exact"})
      .eq("status", "uploaded")
      .eq("intake_status", "review_pending")
      .is("document_id", null)
      .is("deleted_at", null)
      .order("uploaded_at", { ascending: false })
      .order("id").range(from,to),{identity:row=>row.id,maxRows:10000});


    const resultIds = (sessions ?? [])
      .map((s) => s.ai_result_id as number | null)
      .filter((id): id is number => id != null);

    const resultsById = new Map<
      number,
      {
        suggested_document_type_id: number | null;
        suggested_document_type_name: string | null;
        classification_confidence: string | null;
        expiry_date_suggestion: string | null;
      }
    >();

    for(let offset=0;offset<resultIds.length;offset+=100) {
      const aiResults = await readAllPages(async(from,to)=>await supabase
        .from("dms_ai_extraction_results")
        .select(
          `id, suggested_document_type_id, classification_confidence, expiry_date_suggestion,
           suggested_document_type:dms_document_types!suggested_document_type_id(name_en)`,{count:"exact"}
        )
        .in("id", resultIds.slice(offset,offset+100)).order("id").range(from,to),{identity:row=>row.id,maxRows:10000});

      for (const r of aiResults ?? []) {
        resultsById.set(r.id as number, {
          suggested_document_type_id: r.suggested_document_type_id as number | null,
          suggested_document_type_name:
            (r.suggested_document_type as unknown as { name_en: string } | null)?.name_en ?? null,
          classification_confidence: r.classification_confidence as string | null,
          expiry_date_suggestion: r.expiry_date_suggestion as string | null,
        });
      }
    }

    const today = new Date().toISOString().slice(0, 10);

    const candidates: EligibleVersionLinkCandidate[] = (sessions ?? []).map((s) => {
      const ai = s.ai_result_id ? resultsById.get(s.ai_result_id as number) : undefined;
      const suggestedTypeId = ai?.suggested_document_type_id ?? null;
      const typeMatch: "match" | "mismatch" | "unknown" =
        suggestedTypeId == null
          ? "unknown"
          : suggestedTypeId === document.document_type_id
          ? "match"
          : "mismatch";
      const isExpiredSuggestion = !!(ai?.expiry_date_suggestion && ai.expiry_date_suggestion < today);

      let eligible = true;
      let ineligibleReason: string | null = null;
      if (typeMatch === "mismatch") {
        eligible = false;
        ineligibleReason = `AI detected type "${ai?.suggested_document_type_name ?? "a different type"}" — does not match this document`;
      } else if (isExpiredSuggestion) {
        eligible = false;
        ineligibleReason = `AI detected expiry date ${ai?.expiry_date_suggestion} has already passed`;
      }

      return {
        id: s.id as number,
        session_code: s.session_code as string,
        original_filename: s.original_filename as string,
        mime_type: s.mime_type as string,
        file_size_bytes: s.file_size_bytes as number,
        uploaded_at: s.uploaded_at as string,
        suggested_document_type_id: suggestedTypeId,
        suggested_document_type_name: ai?.suggested_document_type_name ?? null,
        classification_confidence: ai?.classification_confidence ?? null,
        expiry_date_suggestion: ai?.expiry_date_suggestion ?? null,
        type_match: typeMatch,
        is_expired_suggestion: isExpiredSuggestion,
        eligible,
        ineligible_reason: ineligibleReason,
      };
    });

    return { success: true, data: candidates };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Create new document from upload ──────────────────────────────────────────

export type CreateDocumentFromUploadInput = UploadCreationInput;

export async function createDocumentFromUpload(
  input: CreateDocumentFromUploadInput,
  contract?: WorkspaceSaveContract
): Promise<UploadCreationResult> {
  const result = await createNumberedDocumentFromUpload(input, contract);
  if (result.success) {
    // UI/cache effects cannot turn a confirmed completion into another creation.
    try { revalidatePath("/dms/documents"); revalidatePath("/dms/inbox"); } catch { /* confirmed receipt wins */ }
  }
  return result;
}
