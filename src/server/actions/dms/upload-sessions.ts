"use server";

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { revalidatePath } from "next/cache";
import type { z } from "zod";
import {verifyTemporaryUpload} from '@/server/dms-temp-upload-verification';
import {discardRetainedIntake} from '@/server/dms-intake-discard';
import {admitSingleUpload,acknowledgeSingleUpload,type SingleUploadContract,type SingleUploadAdmissionResult} from '@/server/dms-single-upload-admission';
import type {SingleUploadRequest,UploadOwningScope} from '@/lib/dms/single-upload-admission';

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  uncertain?: boolean;
};

import type { dmsFileMetadataSchema } from "@/lib/dms/batch-admission";

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
  origin_entity_type?: string | null;
  origin_entity_id?: number | null;
  // DMS.11 — AI-first intake lifecycle
  intake_status: string;
  ai_result_id: number | null;
  // joined
  duplicate_document?: { id: number; document_no: string; title: string } | null;
  uploader?: { full_name: string | null } | null;
};

export type DmsUploadSessionFilters = {
  status?: string;
  is_duplicate?: boolean;
  uploaded_by_me?: boolean;
  include_completed?: boolean;
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function canViewDms(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return hasPermission(ctx, "dms.documents.view") || hasPermission(ctx, "dms.admin");
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
         created_at, updated_at, deleted_at, origin_entity_type, origin_entity_id,
         duplicate_document:dms_documents!duplicate_document_id(id, document_no, title),
         uploader:user_profiles!uploaded_by(full_name)`
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
         created_at, updated_at, deleted_at, origin_entity_type, origin_entity_id,
         duplicate_document:dms_documents!duplicate_document_id(id, document_no, title),
         uploader:user_profiles!uploaded_by(full_name)`
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

export type CreateUploadSessionInput = z.infer<typeof dmsFileMetadataSchema> & {context?:{entityType:string;entityId:number};scope?:UploadOwningScope};

export type CreateUploadSessionResult = {
  session: DmsUploadSessionRow;
  signedUrl: string;
  token: string;
  path: string;
  uploadRequired: boolean;
  isDuplicate: boolean;
  duplicateDocument?: { id: number; document_no: string; title: string } | null;
};

export async function createDmsUploadSession(
  input: CreateUploadSessionInput,
  contract?: SingleUploadContract
): Promise<SingleUploadAdmissionResult> {
  return admitSingleUpload(input,contract);
}

export async function acknowledgeDmsSingleUpload(request:SingleUploadRequest,sessionId:number):Promise<ActionResult>{
  return acknowledgeSingleUpload(request,sessionId);
}

// ── Complete temp upload ──────────────────────────────────────────────────────

export async function completeDmsTempUpload(sessionId:number):Promise<ActionResult<DmsUploadSessionRow>> {
  const result=await verifyTemporaryUpload(sessionId);
  if(result.success){try{revalidatePath("/dms/inbox");}catch{/* Verified receipt remains valid. */}}
  return result;
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
      .select("id, session_code, uploaded_by, status, temp_storage_path, document_id")
      .eq("id", sessionId)
      .is("deleted_at", null)
      .single();

    if (fetchError || !session) return { success: false, error: "Upload session not found" };
    if (session.status === "completed")
      return { success: false, error: "Cannot cancel a completed upload session" };

    if (session.uploaded_by !== ctx.profile.id && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "Permission denied" };
    }

    const result=await discardRetainedIntake(supabase,{sessionId,documentId:session.document_id as number|null,reason:'Uploader cancelled intake'});
    if(!result.ok)return {success:false,uncertain:result.uncertain,error:result.error};
    try{revalidatePath("/dms/inbox");}catch{/* Retained receipt is authoritative. */}
    return { success: true };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}
