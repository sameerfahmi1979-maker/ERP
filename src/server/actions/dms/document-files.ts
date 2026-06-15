"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { revalidatePath } from "next/cache";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Types ────────────────────────────────────────────────────────────────────

export type DmsDocumentFileRow = {
  id: number;
  document_id: number;
  version_id: number | null;
  file_role: string;
  storage_bucket: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  sha256_hash: string | null;
  page_count: number | null;
  language: string | null;
  integrity_status: string;
  integrity_checked_at: string | null;
  integrity_error_message: string | null;
  // DMS.9 OCR fields
  ocr_status: string;
  ocr_provider: string | null;
  ocr_model: string | null;
  ocr_started_at: string | null;
  ocr_completed_at: string | null;
  ocr_error_message: string | null;
  ocr_confidence: number | null;
  ocr_page_count: number | null;
  ocr_language: string | null;
  created_by: number | null;
  created_at: string;
  deleted_at: string | null;
  // joined
  version?: { version_number: number; version_label: string | null } | null;
  creator?: { full_name: string | null } | null;
};

export type DmsDocumentVersionRow = {
  id: number;
  document_id: number;
  version_number: number;
  version_label: string | null;
  change_notes: string | null;
  is_current: boolean;
  created_by: number | null;
  created_at: string;
  // joined
  creator?: { full_name: string | null } | null;
  files?: DmsDocumentFileRow[];
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function canViewDms(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "dms.documents.view") || hasPermission(ctx, "dms.admin");
}

// ── Get files for a document ──────────────────────────────────────────────────

export async function getDmsDocumentFiles(
  documentId: number
): Promise<ActionResult<DmsDocumentFileRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewDms(ctx)) return { success: false, error: "Permission denied" };

    const { data, error } = await supabase
      .from("dms_document_files")
      .select(
        `id, document_id, version_id, file_role, storage_bucket, storage_path,
         file_name, mime_type, file_size_bytes, sha256_hash, page_count, language,
         integrity_status, integrity_checked_at, integrity_error_message,
         ocr_status, ocr_provider, ocr_model, ocr_started_at, ocr_completed_at,
         ocr_error_message, ocr_confidence, ocr_page_count, ocr_language,
         created_by, created_at, deleted_at,
         version:dms_document_versions!version_id(version_number, version_label),
         creator:user_profiles!created_by(full_name)`
      )
      .eq("document_id", documentId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data as unknown as DmsDocumentFileRow[]) ?? [] };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Get versions for a document ───────────────────────────────────────────────

export async function getDmsDocumentVersions(
  documentId: number
): Promise<ActionResult<DmsDocumentVersionRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!canViewDms(ctx)) return { success: false, error: "Permission denied" };

    const { data, error } = await supabase
      .from("dms_document_versions")
      .select(
        `id, document_id, version_number, version_label, change_notes, is_current,
         created_by, created_at,
         creator:user_profiles!created_by(full_name)`
      )
      .eq("document_id", documentId)
      .order("version_number", { ascending: false });

    if (error) return { success: false, error: error.message };
    return { success: true, data: (data as unknown as DmsDocumentVersionRow[]) ?? [] };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Get signed URL for preview or download ────────────────────────────────────

const PREVIEW_EXPIRY_SECONDS = 5 * 60;   // 5 min
const DOWNLOAD_EXPIRY_SECONDS = 60 * 60; // 1 hour

export async function getDmsDocumentFileSignedUrl(
  fileId: number,
  action: "preview" | "download"
): Promise<ActionResult<{ signedUrl: string; expiresIn: number }>> {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };

    const canAct = action === "preview"
      ? hasPermission(ctx, "dms.documents.preview") || hasPermission(ctx, "dms.admin")
      : hasPermission(ctx, "dms.documents.download") || hasPermission(ctx, "dms.admin");

    if (!canAct)
      return { success: false, error: `Permission denied: requires dms.documents.${action}` };

    const { data: file, error: fileError } = await supabase
      .from("dms_document_files")
      .select("id, document_id, storage_bucket, storage_path, file_name")
      .eq("id", fileId)
      .is("deleted_at", null)
      .single();

    if (fileError || !file) return { success: false, error: "File not found" };

    const expiresIn = action === "preview" ? PREVIEW_EXPIRY_SECONDS : DOWNLOAD_EXPIRY_SECONDS;

    const { data: signedData, error: signedError } = await adminClient.storage
      .from(file.storage_bucket as string)
      .createSignedUrl(
        file.storage_path as string,
        expiresIn,
        action === "download" ? { download: file.file_name as string } : undefined
      );

    if (signedError || !signedData)
      return { success: false, error: signedError?.message ?? "Failed to generate URL" };

    // Insert audit event (do not log the URL itself)
    await supabase.from("dms_document_events").insert({
      document_id: file.document_id,
      event_type: action === "preview" ? "file_previewed" : "file_downloaded",
      description: `File ${action === "preview" ? "previewed" : "downloaded"}: ${file.file_name}`,
      performed_by: ctx.profile.id,
      performed_at: new Date().toISOString(),
      metadata_json: { file_id: fileId, action },
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_files",
      entity_id: fileId,
      entity_reference: String(file.document_id),
      action: action === "preview" ? "read" : "export",
    });

    return { success: true, data: { signedUrl: signedData.signedUrl, expiresIn } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Set current version ────────────────────────────────────────────────────────

export async function setDmsDocumentCurrentVersion(
  documentId: number,
  versionId: number
): Promise<ActionResult> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "dms.documents.edit") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied: requires dms.documents.edit" };
    }

    // Verify version belongs to document
    const { data: version, error: verError } = await supabase
      .from("dms_document_versions")
      .select("id, version_number, document_id")
      .eq("id", versionId)
      .eq("document_id", documentId)
      .single();

    if (verError || !version) return { success: false, error: "Version not found or does not belong to this document" };

    // Mark all versions of this document as not current
    await supabase
      .from("dms_document_versions")
      .update({ is_current: false })
      .eq("document_id", documentId);

    // Set selected version as current
    await supabase
      .from("dms_document_versions")
      .update({ is_current: true })
      .eq("id", versionId);

    // Update document.current_version_id
    await supabase
      .from("dms_documents")
      .update({
        current_version_id: versionId,
        updated_by: ctx.profile.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", documentId);

    // Audit
    await supabase.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "current_version_changed",
      description: `Current version set to v${version.version_number}`,
      performed_by: ctx.profile.id,
      metadata_json: { version_id: versionId, version_number: version.version_number },
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_versions",
      entity_id: versionId,
      entity_reference: String(documentId),
      action: "update",
      new_values: { is_current: true, version_number: version.version_number },
    });

    const { revalidatePath: rv } = await import("next/cache");
    rv(`/dms/documents/record/${documentId}`);

    return { success: true };
  } catch (e) {
    console.error("setDmsDocumentCurrentVersion error", e);
    return { success: false, error: String(e) };
  }
}

// ── Admin: purge a file record and all its connections ────────────────────────

export type AdminDeleteFileResult = {
  fileDeleted: boolean;
  storageDeleted: boolean;
  storageAlreadyMissing: boolean;
  aiResultsNulled: number;
  versionCleaned: boolean;
  currentVersionUpdated: boolean;
};

export async function adminDeleteDmsDocumentFile(
  fileId: number
): Promise<ActionResult<AdminDeleteFileResult>> {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();
    const ctx = await getAuthContext();

    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied: requires dms.admin" };
    }

    // ── Load the file record ────────────────────────────────────────────────

    const { data: file, error: fileError } = await supabase
      .from("dms_document_files")
      .select("id, document_id, version_id, storage_bucket, storage_path, file_name, file_role")
      .eq("id", fileId)
      .is("deleted_at", null)
      .single();

    if (fileError || !file) return { success: false, error: "File record not found or already deleted" };

    const documentId = file.document_id as number;
    const versionId = file.version_id as number | null;
    const storageBucket = (file.storage_bucket as string) || "dms-documents";
    const storagePath = file.storage_path as string | null;
    const fileName = file.file_name as string;
    const now = new Date().toISOString();

    const result: AdminDeleteFileResult = {
      fileDeleted: false,
      storageDeleted: false,
      storageAlreadyMissing: false,
      aiResultsNulled: 0,
      versionCleaned: false,
      currentVersionUpdated: false,
    };

    // ── 1. Remove from storage ─────────────────────────────────────────────

    if (storagePath) {
      const { error: storageError } = await adminClient.storage
        .from(storageBucket)
        .remove([storagePath]);

      if (storageError) {
        // Storage returns an error for missing files in some versions.
        // Treat "not found" gracefully — the goal is cleanup.
        const msg = storageError.message?.toLowerCase() ?? "";
        if (msg.includes("not found") || msg.includes("does not exist") || msg.includes("404")) {
          result.storageAlreadyMissing = true;
        } else {
          console.error(`Storage delete warning for ${storagePath}:`, storageError.message);
          result.storageAlreadyMissing = true; // treat as missing, continue
        }
      } else {
        result.storageDeleted = true;
      }
    } else {
      result.storageAlreadyMissing = true;
    }

    // ── 2. Null out file_id on AI extraction results for this file ────────
    // Note: dms_ai_extraction_jobs does not have a file_id column — only results do.

    const { count: aiResultCount } = await supabase
      .from("dms_ai_extraction_results")
      .select("id", { count: "exact", head: true })
      .eq("file_id", fileId);

    if ((aiResultCount ?? 0) > 0) {
      await supabase
        .from("dms_ai_extraction_results")
        .update({ file_id: null })
        .eq("file_id", fileId);
      result.aiResultsNulled = aiResultCount ?? 0;
    }

    // ── 4. Soft-delete the file record ────────────────────────────────────

    await supabase
      .from("dms_document_files")
      .update({ deleted_at: now })
      .eq("id", fileId);

    result.fileDeleted = true;

    // ── 5. Version cleanup: if version has no remaining files, clean up ────

    if (versionId) {
      const { count: remainingFiles } = await supabase
        .from("dms_document_files")
        .select("id", { count: "exact", head: true })
        .eq("version_id", versionId)
        .is("deleted_at", null);

      if ((remainingFiles ?? 0) === 0) {
        // Version is now empty — check if it was the current version
        const { data: version } = await supabase
          .from("dms_document_versions")
          .select("id, is_current, version_number")
          .eq("id", versionId)
          .single();

        if (version?.is_current) {
          // Find the next most recent version that still has files
          const { data: prevVersions } = await supabase
            .from("dms_document_versions")
            .select(`id, version_number,
              files:dms_document_files(id)`)
            .eq("document_id", documentId)
            .neq("id", versionId)
            .order("version_number", { ascending: false });

          const nextVersion = prevVersions?.find(
            (v) => (v.files as { id: number }[]).length > 0
          );

          if (nextVersion) {
            // Promote this version as current
            await supabase
              .from("dms_document_versions")
              .update({ is_current: false })
              .eq("document_id", documentId);
            await supabase
              .from("dms_document_versions")
              .update({ is_current: true })
              .eq("id", nextVersion.id);
            await supabase
              .from("dms_documents")
              .update({ current_version_id: nextVersion.id, updated_by: ctx.profile.id, updated_at: now })
              .eq("id", documentId);
            result.currentVersionUpdated = true;
          } else {
            // No other versions with files — clear current_version_id
            await supabase
              .from("dms_documents")
              .update({ current_version_id: null, updated_by: ctx.profile.id, updated_at: now })
              .eq("id", documentId);
            result.currentVersionUpdated = true;
          }
        }

        // Mark the now-empty version as not current
        await supabase
          .from("dms_document_versions")
          .update({ is_current: false })
          .eq("id", versionId);

        result.versionCleaned = true;
      }
    }

    // ── 6. Document event + audit ─────────────────────────────────────────

    await supabase.from("dms_document_events").insert({
      document_id: documentId,
      event_type: "file_deleted_by_admin",
      description: `File "${fileName}" permanently deleted by admin`,
      performed_by: ctx.profile.id,
      performed_at: now,
      metadata_json: {
        file_id: fileId,
        storage_path: storagePath,
        storage_deleted: result.storageDeleted,
        storage_already_missing: result.storageAlreadyMissing,
        ai_results_nulled: result.aiResultsNulled,
        version_cleaned: result.versionCleaned,
      },
    });

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_files",
      entity_id: fileId,
      entity_reference: fileName,
      action: "delete",
      new_values: {
        event: "admin_file_purge",
        document_id: documentId,
        storage_path: storagePath,
        storage_deleted: result.storageDeleted,
      },
    });

    revalidatePath(`/dms/documents/record/${documentId}`);
    revalidatePath("/dms/documents");

    return { success: true, data: result };
  } catch (e) {
    console.error("adminDeleteDmsDocumentFile error", e);
    return { success: false, error: String(e) };
  }
}

// ── Admin: list ALL files for inspection (including from deleted documents) ───

export type AdminFileRow = {
  id: number;
  document_id: number | null;
  version_id: number | null;
  file_role: string;
  storage_bucket: string;
  storage_path: string | null;
  file_name: string;
  mime_type: string;
  file_size_bytes: number;
  sha256_hash: string | null;
  ocr_status: string;
  created_at: string;
  deleted_at: string | null;
  document_no: string | null;
  document_title: string | null;
  document_deleted: boolean;
};

export async function adminListDmsFiles(opts?: {
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}): Promise<ActionResult<{ rows: AdminFileRow[]; total: number }>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "dms.admin")) return { success: false, error: "Permission denied: requires dms.admin" };

    const { includeDeleted = true, limit = 100, offset = 0 } = opts ?? {};

    let query = supabase
      .from("dms_document_files")
      .select(`
        id, document_id, version_id, file_role, storage_bucket, storage_path,
        file_name, mime_type, file_size_bytes, sha256_hash,
        ocr_status, created_at, deleted_at,
        document:dms_documents!document_id(document_no, title, deleted_at)
      `, { count: "exact" })
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (!includeDeleted) {
      query = query.is("deleted_at", null);
    }

    const { data, error, count } = await query;
    if (error) return { success: false, error: error.message };

    const rows: AdminFileRow[] = (data ?? []).map((f) => {
      const docRaw = f.document as unknown;
      const doc = (Array.isArray(docRaw) ? docRaw[0] : docRaw) as { document_no: string; title: string; deleted_at: string | null } | null;
      return {
        id: f.id as number,
        document_id: f.document_id as number | null,
        version_id: f.version_id as number | null,
        file_role: f.file_role as string,
        storage_bucket: (f.storage_bucket as string) || "dms-documents",
        storage_path: f.storage_path as string | null,
        file_name: f.file_name as string,
        mime_type: f.mime_type as string,
        file_size_bytes: f.file_size_bytes as number,
        sha256_hash: f.sha256_hash as string | null,
        ocr_status: (f.ocr_status as string) || "not_started",
        created_at: f.created_at as string,
        deleted_at: f.deleted_at as string | null,
        document_no: doc?.document_no ?? null,
        document_title: doc?.title ?? null,
        document_deleted: !!doc?.deleted_at,
      };
    });

    return { success: true, data: { rows, total: count ?? 0 } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Admin: HARD-delete a file record + storage + AI results ──────────────────
// Unlike the soft-delete approach, this permanently removes the DB row so the
// sha256_hash is fully gone and can never trigger duplicate detection again.

export async function adminHardDeleteDmsFile(
  fileId: number
): Promise<ActionResult<{ storageDeleted: boolean; aiResultsRemoved: number }>> {
  try {
    const supabase = await createClient();
    const adminClient = createAdminClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!hasPermission(ctx, "dms.admin")) return { success: false, error: "Permission denied: requires dms.admin" };

    // Load file record (allow already-soft-deleted rows so we can fully clean them)
    const { data: file, error: fileError } = await supabase
      .from("dms_document_files")
      .select("id, document_id, storage_bucket, storage_path, file_name")
      .eq("id", fileId)
      .maybeSingle();

    if (fileError || !file) return { success: false, error: "File record not found" };

    const storageBucket = (file.storage_bucket as string) || "dms-documents";
    const storagePath = file.storage_path as string | null;
    const fileName = file.file_name as string;
    const documentId = file.document_id as number | null;

    let storageDeleted = false;

    // 1. Delete from storage
    if (storagePath) {
      const { error: storageErr } = await adminClient.storage
        .from(storageBucket)
        .remove([storagePath]);
      if (!storageErr) storageDeleted = true;
    }

    // 2. Null out file_id on AI extraction results
    const { count: aiCount } = await supabase
      .from("dms_ai_extraction_results")
      .select("id", { count: "exact", head: true })
      .eq("file_id", fileId);

    if ((aiCount ?? 0) > 0) {
      await supabase
        .from("dms_ai_extraction_results")
        .update({ file_id: null })
        .eq("file_id", fileId);
    }

    // 3. HARD-delete the row — sha256_hash is now completely gone from the table
    await supabase
      .from("dms_document_files")
      .delete()
      .eq("id", fileId);

    // 4. Clear current_version_id on the document if it now has no active files
    if (documentId) {
      const { count: remainingFiles } = await supabase
        .from("dms_document_files")
        .select("id", { count: "exact", head: true })
        .eq("document_id", documentId)
        .is("deleted_at", null);

      if ((remainingFiles ?? 0) === 0) {
        await supabase
          .from("dms_documents")
          .update({ current_version_id: null })
          .eq("id", documentId);
      }
    }

    // 5. Audit
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_files",
      entity_id: fileId,
      entity_reference: fileName,
      action: "delete",
      new_values: { event: "admin_hard_delete", storage_path: storagePath, storage_deleted: storageDeleted },
    });

    if (documentId) revalidatePath(`/dms/documents/record/${documentId}`);
    revalidatePath("/dms/documents");

    return { success: true, data: { storageDeleted, aiResultsRemoved: aiCount ?? 0 } };
  } catch (e) {
    console.error("adminHardDeleteDmsFile error", e);
    return { success: false, error: String(e) };
  }
}
