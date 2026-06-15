"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
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

function getExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "bin";
}

function canAttach(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.upload") ||
    hasPermission(ctx, "dms.documents.edit") ||
    hasPermission(ctx, "dms.admin")
  );
}

function canUpload(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "dms.documents.upload") || hasPermission(ctx, "dms.admin");
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
      .select("id, document_no, owning_company_id, document_type_id, document_type:dms_document_types!document_type_id(type_code)")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docError || !document) return { success: false, error: "Document not found" };

    const typeCode = (document.document_type as unknown as { type_code: string } | null)?.type_code ?? "OTHER";
    const year = new Date().getFullYear();
    const userId = ctx.profile.id;

    const { data: maxVerRow } = await supabase
      .from("dms_document_versions")
      .select("version_number")
      .eq("document_id", documentId)
      .order("version_number", { ascending: false })
      .limit(1)
      .maybeSingle();

    const nextVersionNumber = (maxVerRow?.version_number ?? 0) + 1;
    const ext = getExtension(session.original_filename as string);
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
        file_name: session.original_filename,
        mime_type: session.mime_type,
        file_size_bytes: session.file_size_bytes,
        sha256_hash: session.sha256_hash,
        created_by: userId,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (fileError) return { success: false, error: fileError.message };

    await supabase
      .from("dms_documents")
      .update({ current_version_id: version.id, updated_by: userId, updated_at: new Date().toISOString() })
      .eq("id", documentId);

    await supabase
      .from("dms_upload_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
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

// ── Create new document from upload ──────────────────────────────────────────

const CreateFromUploadSchema = z.object({
  uploadSessionId: z.number().int().positive(),
  title: z.string().min(1, "Title is required").max(500),
  document_type_id: z.number().int().positive("Document type is required"),
  description: z.string().max(2000).optional(),
  issue_date: z.string().optional(),
  expiry_date: z.string().optional(),
  owning_company_id: z.number().int().positive().optional(),
  allowDuplicate: z.boolean().optional().default(false),
});

export type CreateDocumentFromUploadInput = z.infer<typeof CreateFromUploadSchema>;

export async function createDocumentFromUpload(
  input: CreateDocumentFromUploadInput
): Promise<ActionResult<{ documentId: number; documentNo: string }>> {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canUpload(ctx))
      return { success: false, error: "Permission denied: requires dms.documents.upload" };

    const parsed = CreateFromUploadSchema.safeParse(input);
    if (!parsed.success)
      return { success: false, error: parsed.error.issues[0]?.message ?? "Validation error" };

    const {
      uploadSessionId, title, document_type_id, description,
      issue_date, expiry_date, owning_company_id, allowDuplicate,
    } = parsed.data;

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

    if (issue_date && expiry_date && expiry_date < issue_date)
      return { success: false, error: "Expiry date must be on or after issue date" };

    const { data: docType, error: typeError } = await supabase
      .from("dms_document_types")
      .select("id, type_code, category_id, default_confidentiality, is_active")
      .eq("id", document_type_id)
      .single();

    if (typeError || !docType) return { success: false, error: "Document type not found" };
    if (!docType.is_active) return { success: false, error: "Selected document type is not active" };

    const { data: docNoData, error: docNoError } = await supabase
      .rpc("generate_next_reference_number", { p_rule_code: "MASTER_DMS_DOCUMENT" });

    // RPC returns an array of rows; extract the generated reference from the first row
    const docNoRows = docNoData as Array<{ generated_reference_number: string }>;
    if (docNoError || !docNoRows || docNoRows.length === 0 || !docNoRows[0]?.generated_reference_number)
      return { success: false, error: docNoError?.message ?? "Failed to generate document number" };

    const documentNo = String(docNoRows[0].generated_reference_number);
    const year = new Date().getFullYear();
    const ext = getExtension(session.original_filename as string);
    const userId = ctx.profile.id;

    const { data: document, error: docInsertError } = await supabase
      .from("dms_documents")
      .insert({
        document_no: documentNo,
        title,
        description: description ?? null,
        document_type_id,
        category_id: docType.category_id,
        status: "active",
        confidentiality_level: docType.default_confidentiality ?? "internal",
        owner_user_id: userId,
        owning_company_id: owning_company_id ?? null,
        issue_date: issue_date ?? null,
        expiry_date: expiry_date ?? null,
        created_by: userId,
        created_at: new Date().toISOString(),
        updated_by: userId,
        updated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (docInsertError) return { success: false, error: docInsertError.message };

    const finalPath = buildFinalStoragePath(
      owning_company_id ?? null,
      year,
      docType.type_code as string,
      document.id,
      1,
      ext
    );

    const { data: tempFileData, error: downloadError } = await adminClient.storage
      .from("dms-temp")
      .download(session.temp_storage_path as string);

    if (downloadError || !tempFileData) {
      await supabase.from("dms_documents").delete().eq("id", document.id);
      return { success: false, error: `Failed to read temp file: ${downloadError?.message}` };
    }

    const { error: uploadError } = await adminClient.storage
      .from("dms-documents")
      .upload(finalPath, tempFileData, { contentType: session.mime_type as string, upsert: false });

    if (uploadError) {
      await supabase.from("dms_documents").delete().eq("id", document.id);
      return { success: false, error: `Failed to store file: ${uploadError.message}` };
    }

    const { data: version, error: verError } = await supabase
      .from("dms_document_versions")
      .insert({
        document_id: document.id,
        version_number: 1,
        version_label: "v1",
        change_notes: "Initial upload",
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
        document_id: document.id,
        version_id: version.id,
        file_role: "original",
        storage_bucket: "dms-documents",
        storage_path: finalPath,
        file_name: session.original_filename,
        mime_type: session.mime_type,
        file_size_bytes: session.file_size_bytes,
        sha256_hash: session.sha256_hash,
        created_by: userId,
        created_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (fileError) return { success: false, error: fileError.message };

    await supabase
      .from("dms_documents")
      .update({ current_version_id: version.id, updated_at: new Date().toISOString() })
      .eq("id", document.id);

    await supabase
      .from("dms_upload_sessions")
      .update({ status: "completed", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", uploadSessionId);

    await insertDmsEvent(supabase, document.id, "document_created", userId,
      `Document created from upload: ${title}`,
      { document_no: documentNo, upload_session_id: uploadSessionId });

    await insertDmsEvent(supabase, document.id, "file_uploaded", userId,
      `File uploaded: ${session.original_filename} (v1)`,
      { file_id: fileRecord.id, version_id: version.id, version_number: 1 });

    await insertDmsEvent(supabase, document.id, "version_uploaded", userId,
      "First version created: v1",
      { version_id: version.id, version_number: 1, is_current: true });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_documents",
      entity_id: document.id,
      entity_reference: documentNo,
      action: "create",
      new_values: { event: "document_created_from_upload", upload_session_id: uploadSessionId },
    });

    revalidatePath("/dms/documents");
    revalidatePath("/dms/inbox");

    return { success: true, data: { documentId: document.id, documentNo } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
