"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import { randomUUID } from "crypto";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

import {
  DMS_ALLOWED_MIME_TYPES,
  DMS_ALLOWED_EXTENSIONS,
  DMS_MAX_FILE_SIZE_BYTES,
} from "@/features/dms/upload/dms-upload-constants";

// ── Types ────────────────────────────────────────────────────────────────────

export type DmsUploadSessionRow = {
  id: number;
  session_code: string;
  status: string;
  original_filename: string;
  mime_type: string;
  file_size_bytes: number;
  sha256_hash: string | null;
  temp_storage_path: string | null;
  is_duplicate: boolean;
  duplicate_document_id: number | null;
  uploaded_by: number | null;
  uploaded_at: string;
  expires_at: string | null;
  completed_at: string | null;
  temp_cleaned_at: string | null;
  cleanup_error_message: string | null;
  error_message: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // DMS.11 — AI-first intake lifecycle
  intake_status: string;
  ai_result_id: number | null;
  // joined
  duplicate_document?: { id: number; document_no: string; title: string } | null;
  uploader?: { full_name: string | null; email: string | null } | null;
};

export type DmsUploadSessionFilters = {
  status?: string;
  is_duplicate?: boolean;
  uploaded_by_me?: boolean;
  include_completed?: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/_{2,}/g, "_")
    .substring(0, 200);
}

function getFileExtension(filename: string): string {
  const parts = filename.split(".");
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : "";
}

function canViewDms(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "dms.documents.view") || hasPermission(ctx, "dms.admin");
}

function canUploadDms(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "dms.documents.upload") || hasPermission(ctx, "dms.admin");
}

// ── Get upload sessions ───────────────────────────────────────────────────────

export async function getDmsUploadSessions(
  filters: DmsUploadSessionFilters = {}
): Promise<ActionResult<DmsUploadSessionRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewDms(ctx)) return { success: false, error: "Permission denied" };

    let query = supabase
      .from("dms_upload_sessions")
      .select(
        `id, session_code, status, original_filename, mime_type, file_size_bytes,
         sha256_hash, temp_storage_path, is_duplicate, duplicate_document_id,
         uploaded_by, uploaded_at, expires_at, completed_at, error_message,
         temp_cleaned_at, cleanup_error_message, intake_status, ai_result_id,
         created_at, updated_at, deleted_at,
         duplicate_document:dms_documents!duplicate_document_id(id, document_no, title),
         uploader:user_profiles!uploaded_by(full_name, email)`
      )
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(100);

    if (filters.status) query = query.eq("status", filters.status);
    if (filters.is_duplicate !== undefined)
      query = query.eq("is_duplicate", filters.is_duplicate);
    if (filters.uploaded_by_me && ctx.profile?.id)
      query = query.eq("uploaded_by", ctx.profile.id);
    if (!filters.include_completed) {
      // Exclude completed, cancelled, expired
      query = query
        .neq("status", "completed")
        .neq("status", "cancelled")
        .neq("status", "expired");
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };
    return { success: true, data: (data as unknown as DmsUploadSessionRow[]) ?? [] };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

export async function getDmsUploadSession(
  id: number
): Promise<ActionResult<DmsUploadSessionRow>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewDms(ctx)) return { success: false, error: "Permission denied" };

    const { data, error } = await supabase
      .from("dms_upload_sessions")
      .select(
        `id, session_code, status, original_filename, mime_type, file_size_bytes,
         sha256_hash, temp_storage_path, is_duplicate, duplicate_document_id,
         uploaded_by, uploaded_at, expires_at, completed_at, error_message,
         intake_status, ai_result_id,
         created_at, updated_at, deleted_at,
         duplicate_document:dms_documents!duplicate_document_id(id, document_no, title),
         uploader:user_profiles!uploaded_by(full_name, email)`
      )
      .eq("id", id)
      .is("deleted_at", null)
      .single();

    if (error) return { success: false, error: error.message };
    if (!data) return { success: false, error: "Upload session not found" };
    return { success: true, data: data as unknown as DmsUploadSessionRow };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Create upload session + get signed upload URL ─────────────────────────────

const CreateSessionSchema = z.object({
  original_filename: z.string().min(1).max(500),
  mime_type: z.string().min(1),
  file_size_bytes: z.number().int().positive().max(DMS_MAX_FILE_SIZE_BYTES, {
    message: "File exceeds maximum size of 50 MB",
  }),
  sha256_hash: z.string().length(64, { message: "Invalid SHA-256 hash" }),
});

export type CreateUploadSessionInput = z.infer<typeof CreateSessionSchema>;

export type CreateUploadSessionResult = {
  session: DmsUploadSessionRow;
  signedUrl: string;
  token: string;
  path: string;
  isDuplicate: boolean;
  duplicateDocument?: { id: number; document_no: string; title: string } | null;
};

export async function createDmsUploadSession(
  input: CreateUploadSessionInput
): Promise<ActionResult<CreateUploadSessionResult>> {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canUploadDms(ctx))
      return { success: false, error: "You do not have permission to upload documents" };

    const parsed = CreateSessionSchema.safeParse(input);
    if (!parsed.success)
      return { success: false, error: parsed.error.issues[0]?.message ?? "Validation error" };

    const { original_filename, mime_type, file_size_bytes, sha256_hash } = parsed.data;

    // Validate MIME type
    if (!DMS_ALLOWED_MIME_TYPES.includes(mime_type as typeof DMS_ALLOWED_MIME_TYPES[number])) {
      return { success: false, error: `File type '${mime_type}' is not allowed` };
    }

    // Validate extension
    const ext = getFileExtension(original_filename);
    if (!DMS_ALLOWED_EXTENSIONS.includes(ext)) {
      return { success: false, error: `File extension '.${ext}' is not allowed` };
    }

    // Check for duplicate by SHA-256
    const { data: existingFile } = await supabase
      .from("dms_document_files")
      .select("id, document_id, dms_documents!document_id(id, document_no, title)")
      .eq("sha256_hash", sha256_hash)
      .eq("file_role", "original")
      .is("deleted_at", null)
      .limit(1)
      .maybeSingle();

    const isDuplicate = !!existingFile;
    const duplicateDocId = existingFile ? (existingFile.document_id as number) : null;
    const duplicateDoc = isDuplicate
      ? (existingFile.dms_documents as unknown as { id: number; document_no: string; title: string } | null)
      : null;

    // Generate session code and storage path
    const sessionCode = randomUUID().replace(/-/g, "").substring(0, 20).toUpperCase();
    const safeName = sanitizeFilename(original_filename);
    const tempPath = `sessions/${sessionCode}/${safeName}`;
    const expiresAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();

    // Create session record
    const { data: session, error: sessionError } = await supabase
      .from("dms_upload_sessions")
      .insert({
        session_code: sessionCode,
        status: "uploaded",
        original_filename,
        mime_type,
        file_size_bytes,
        sha256_hash,
        temp_storage_path: tempPath,
        is_duplicate: isDuplicate,
        duplicate_document_id: duplicateDocId,
        uploaded_by: ctx.profile.id,
        uploaded_at: new Date().toISOString(),
        expires_at: expiresAt,
      })
      .select()
      .single();

    if (sessionError) return { success: false, error: sessionError.message };

    // Generate signed upload URL via admin client
    const { data: signedData, error: signedError } = await adminClient.storage
      .from("dms-temp")
      .createSignedUploadUrl(tempPath);

    if (signedError || !signedData) {
      await supabase.from("dms_upload_sessions").delete().eq("id", session.id);
      return { success: false, error: signedError?.message ?? "Failed to create upload URL" };
    }

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_upload_sessions",
      entity_id: session.id,
      entity_reference: sessionCode,
      action: "create",
      new_values: { original_filename, mime_type, file_size_bytes, is_duplicate: isDuplicate },
    });

    return {
      success: true,
      data: {
        session: session as DmsUploadSessionRow,
        signedUrl: signedData.signedUrl,
        token: signedData.token,
        path: signedData.path,
        isDuplicate,
        duplicateDocument: duplicateDoc,
      },
    };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Complete temp upload ──────────────────────────────────────────────────────

export async function completeDmsTempUpload(
  sessionId: number
): Promise<ActionResult<DmsUploadSessionRow>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };

    const { data: session, error: fetchError } = await supabase
      .from("dms_upload_sessions")
      .select("*")
      .eq("id", sessionId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !session) return { success: false, error: "Upload session not found" };

    if (session.uploaded_by !== ctx.profile.id && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const { data: updated, error: updateError } = await supabase
      .from("dms_upload_sessions")
      .update({ status: "uploaded", updated_at: new Date().toISOString() })
      .eq("id", sessionId)
      .select()
      .single();

    if (updateError) return { success: false, error: updateError.message };
    revalidatePath("/dms/inbox");
    return { success: true, data: updated as DmsUploadSessionRow };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Cancel upload session ────────────────────────────────────────────────────

export async function cancelDmsUploadSession(
  sessionId: number
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };

    const { data: session, error: fetchError } = await supabase
      .from("dms_upload_sessions")
      .select("id, session_code, uploaded_by, status, temp_storage_path")
      .eq("id", sessionId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !session) return { success: false, error: "Upload session not found" };
    if (session.status === "completed")
      return { success: false, error: "Cannot cancel a completed upload session" };

    if (session.uploaded_by !== ctx.profile.id && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const { error: updateError } = await supabase
      .from("dms_upload_sessions")
      .update({
        status: "cancelled",
        updated_at: new Date().toISOString(),
        deleted_at: new Date().toISOString(),
      })
      .eq("id", sessionId);

    if (updateError) return { success: false, error: updateError.message };

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_upload_sessions",
      entity_id: sessionId,
      entity_reference: session.session_code,
      action: "delete",
    });

    revalidatePath("/dms/inbox");
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
