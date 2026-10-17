"use server";
import {changeDocumentVersion,versionIdentity} from "@/server/dms-version-transition";
import {readAllPages} from "@/server/reads/all-pages";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import { checkDocumentConfidentialityAccess } from "@/lib/dms/document-access";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  uncertain?: boolean;
};

// ── Types ────────────────────────────────────────────────────────────────────

export type DmsDocumentFileRow = {
  id: number;
  document_id: number;
  version_id: number | null;
  file_role: string;
  // DMS.3C: storage_bucket and storage_path are intentionally NOT included here.
  // They are internal storage fields and must not be returned to the UI.
  // Use getDmsDocumentFileSignedUrl(fileId, action) to generate download/preview URLs.
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
  unlinked_at?: string | null;
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

    // DMS.3C — confidentiality check before returning files
    const access = await checkDocumentConfidentialityAccess(supabase, documentId, ctx);
    if (!access.allowed) return { success: false, error: access.error ?? "Document access is restricted." };

    const data = await readAllPages(async (from,to) => {
      const result = await supabase
      .from("dms_document_files")
      .select(
        `id, document_id, version_id, file_role,
         file_name, mime_type, file_size_bytes, sha256_hash, page_count, language,
         integrity_status, integrity_checked_at, integrity_error_message,
         ocr_status, ocr_provider, ocr_model, ocr_started_at, ocr_completed_at,
         ocr_error_message, ocr_confidence, ocr_page_count, ocr_language,
         created_by, created_at, deleted_at,
         version:dms_document_versions!version_id(version_number, version_label),
         creator:user_profiles!created_by(full_name)`
      , {count:"exact"})
      .eq("document_id", documentId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }).order("id",{ascending:true}).range(from,to);
      return result;
    }, {identity:row=>row.id,maxRows:10000});

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

    // DMS.3D/E — confidentiality check before returning version history
    const access = await checkDocumentConfidentialityAccess(supabase, documentId, ctx);
    if (!access.allowed) return { success: false, error: access.error ?? "Document access is restricted." };

    const data = await readAllPages(async (from,to) => {
      const result = await supabase
      .from("dms_document_versions")
      .select(
        `id, document_id, version_number, version_label, change_notes, is_current, unlinked_at,
         created_by, created_at,
         creator:user_profiles!created_by(full_name)`
      , {count:"exact"})
      .eq("document_id", documentId)
      .order("version_number", { ascending: false }).order("id",{ascending:true}).range(from,to);
      return result;
    }, {identity:row=>row.id,maxRows:10000});

    return { success: true, data: (data as unknown as DmsDocumentVersionRow[]) ?? [] };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Get signed URL for preview or download ────────────────────────────────────

/** Compatibility name: new URLs are authenticated endpoints, not bearer capabilities. */
export async function getDmsDocumentFileSignedUrl(
  fileId: number,
  action: "preview" | "download"
): Promise<ActionResult<{ signedUrl: string; expiresIn: number }>> {
  try {
    if (!Number.isSafeInteger(fileId) || fileId <= 0 || !["preview", "download"].includes(action)) return { success: false, error: "Invalid file action" };
    const supabase = await createClient();
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

    // DMS.3C — confidentiality check before issuing signed URL
    const access = await checkDocumentConfidentialityAccess(supabase, file.document_id as number, ctx, `dms.documents.${action}`);
    if (!access.allowed) return { success: false, error: access.error ?? "Document access is restricted." };

    // A URL request is not a download. The endpoint records actual server byte delivery.
    return { success: true, data: { signedUrl: `/api/dms/file?fileId=${fileId}&disposition=${action === "download" ? "attachment" : "inline"}`, expiresIn: 0 } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

// ── Set current version ────────────────────────────────────────────────────────

export async function setDmsDocumentCurrentVersion(documentId:number,versionId:number):Promise<ActionResult>{
 const ctx=await getAuthContext();
 if(!ctx.profile||(!hasPermission(ctx,"dms.documents.edit")&&!hasPermission(ctx,"dms.admin")))return {success:false,error:"Permission denied"};
 const result=await changeDocumentVersion(await createClient(),documentId,versionId,"promote");
 if(result.success){try{revalidatePath(`/dms/documents/record/${documentId}`);}catch{/* confirmed transaction wins */}}
 return result;
}

// ── Unlink a version (DMS VERSION LINK.1 — Option B) ──────────────────────────
// Removes the version row and soft-deletes its associated file row(s). The
// physical file stays in storage. If the unlinked version was current, the
// next-highest remaining version is promoted; if it was the only version, the
// document reverts to a "no file attached" state.

export type UnlinkVersionResult = {
  filesRemoved: number;
  promotedVersionNumber: number | null;
  documentHasNoVersion: boolean;
};

export async function unlinkDmsDocumentVersion(versionId:number):Promise<ActionResult<UnlinkVersionResult>>{
 try{
  const ctx=await getAuthContext();
  if(!ctx.profile||(!hasPermission(ctx,"dms.documents.edit")&&!hasPermission(ctx,"dms.admin")))return {success:false,error:"Permission denied"};
  if(!versionIdentity.safeParse(versionId).success)return {success:false,error:"The selected version is invalid."};
  const client=await createClient(),version=await client.from("dms_document_versions").select("id,document_id").eq("id",versionId).maybeSingle();
  if(version.error||!version.data)return {success:false,error:"The selected version could not be verified."};
  const result=await changeDocumentVersion(client,version.data.document_id,versionId,"unlink");
  if(result.success){try{revalidatePath(`/dms/documents/record/${version.data.document_id}`);}catch{/* confirmed transaction wins */}}
  return result;
 }catch{return {success:false,error:"The version could not be prepared. No new version change was sent."};}
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

/** No Storage-first destructive fallback: preserve originals, decisions and receipts. */
export async function adminDeleteDmsDocumentFile(_fileId:number):Promise<ActionResult<AdminDeleteFileResult>> {
  if(!Number.isSafeInteger(_fileId)||_fileId<=0)return {success:false,error:"Invalid file identifier"};
  return {success:false,error:"Permanent file disposal is unavailable in a record form. Unlink a version using the checked lifecycle action, or request separately approved retention review."};
}

// ── Admin: scoped files, including deleted files of accessible active documents ──

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
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 250 || !Number.isSafeInteger(offset) || offset < 0) {
      return { success: false, error: "Invalid file-list page." };
    }

    let query = supabase
      .rpc("f03_read_document_files_for_admin", {}, { get: true, count: "exact" })
      .select(`
        id, document_id, version_id, file_role, storage_bucket, storage_path,
        file_name, mime_type, file_size_bytes, sha256_hash,
        ocr_status, created_at, deleted_at,
        document:dms_documents!document_id(document_no, title, deleted_at)
      `)
      .order("created_at", { ascending: false })
      .range(offset, offset + limit - 1);

    if (!includeDeleted) {
      query = query.is("deleted_at", null);
    }

    const { data, error, count } = await query;
    if (error) return { success: false, error: error.message };
    if (!Array.isArray(data)) return { success: false, error: "Invalid file-list response." };

    const rows: AdminFileRow[] = data.map((f) => {
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

/** Permanent disposal is deliberately unavailable until a separately approved
 * retention/legal-hold/independent-approval contract exists. Refuse before any
 * Storage or database call: a later SQL denial cannot recover deleted bytes. */
export async function adminHardDeleteDmsFile(
  fileId: number
): Promise<ActionResult<{ storageDeleted: boolean; aiResultsRemoved: number }>> {
  if(!Number.isSafeInteger(fileId)||fileId<=0)return {success:false,error:"Invalid file identifier"};
  return {success:false,error:"Permanent file disposal is unavailable. It requires a separately approved retention and legal-hold process; use the permitted replacement, unlink or archive operations for routine work."};
}
