"use server";

import {attachVerifiedDocumentVersion,type AttachmentInput} from '@/server/dms-version-attachment';
import type { WorkspaceSaveContract } from "@/lib/workspace/save-contract";
import type { UploadCreationInput, UploadCreationResult } from "@/lib/dms/numbered-upload-create";
import { createNumberedDocumentFromUpload } from "@/server/numbered-upload-create";
import { getAuthContext, hasPermission,hasPermissionInScope,hasGlobalPermission } from "@/lib/rbac/check";
import { readAllPages } from "@/server/reads/all-pages";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {attachmentRecoverySchema,type AttachmentRecovery} from '@/lib/dms/attachment-recovery';
import {discardRetainedIntake} from '@/server/dms-intake-discard';

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};


function canAttach(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.documents.upload") ||
    hasPermission(ctx, "dms.documents.edit") ||
    hasPermission(ctx, "dms.admin")
  );
}


// ── Attach upload to existing document ───────────────────────────────────────

export type AttachUploadInput = AttachmentInput;

export async function readOriginalAttachmentRequests(input:{uploadSessionId?:number;documentId?:number;page?:number}):Promise<ActionResult<AttachmentRecovery>>{
 try{
  const {uploadSessionId,documentId,page=1}=input;
  if((uploadSessionId===undefined)===(documentId===undefined)||!Number.isSafeInteger(uploadSessionId??documentId)||(uploadSessionId??documentId??0)<1||!Number.isInteger(page)||page<1||page>10000)return {success:false,error:'Invalid original attachment selector'};
  const client=await createClient(),r=await client.rpc('f07_read_attachment_recovery',{p_session:uploadSessionId??null,p_document:documentId??null,p_page:page});
  const p=attachmentRecoverySchema.safeParse(r.data);
  if(r.error||!p.success||p.data.page!==page||p.data.rows.some(row=>uploadSessionId!==undefined?row.uploadSessionId!==uploadSessionId:!row.unavailable&&row.documentId!==documentId))return {success:false,error:'The original attachment requests are unavailable. No empty recovery result was substituted.'};
  return {success:true,data:p.data};
 }catch{return {success:false,error:'The original attachment requests could not be read. Retain the original upload.'};}
}

export async function cancelOriginalAttachmentRequest(input:{uploadSessionId:number;documentId:number;operationId:string}):Promise<ActionResult<{cancelled:true;uploadSessionId:number;operationId:string}>>{
 try{
  const discovered=await readOriginalAttachmentRequests({uploadSessionId:input.uploadSessionId});
  const row=discovered.data?.rows[0];
  if(!discovered.success||!row||row.unavailable||row.documentId!==input.documentId||row.operationId!==input.operationId)return {success:false,error:'The owned original attachment could not be verified. Its request and files are retained.'};
  if(row.completed)return {success:false,error:'This attachment already completed. Confirm its original result; the destination must not be archived or cancelled.'};
  if(!row.closed){
   const client=await createClient();
   const r=await discardRetainedIntake(client,{sessionId:input.uploadSessionId,documentId:null,reason:'Reviewer explicitly cancelled this uncommitted attachment. Original request, history and copied bytes remain retained.'});
   if(!r.ok)return {success:false,error:'Cancellation was not confirmed. Read the original request again; its files remain retained.'};
  }
  try{revalidatePath('/dms/inbox');revalidatePath(`/dms/documents/record/${row.documentId}`);}catch{/* The checked cancellation receipt wins over cache refresh. */}
  return {success:true,data:{cancelled:true,uploadSessionId:row.uploadSessionId,operationId:row.operationId}};
 }catch{return {success:false,error:'Cancellation is unconfirmed. Retain this upload and read its original request again.'};}
}

export async function attachUploadToExistingDocument(input: AttachUploadInput) {
  const result=await attachVerifiedDocumentVersion(input);
  if(result.success){try{revalidatePath(`/dms/documents/record/${input.documentId}`);revalidatePath("/dms/documents");revalidatePath("/dms/inbox");}catch{/* Confirmed transaction cannot be undone by cache failure. */}}
  return result;
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
      .select("id, document_type_id, owning_company_id, owning_branch_id")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();

    if (docError || !document) return { success: false, error: "Document not found" };

    const sessions = await readAllPages(async(from,to)=>{
      let query=supabase
      .from("dms_upload_sessions")
      .select("id, session_code, original_filename, mime_type, file_size_bytes, uploaded_at, ai_result_id",{count:"exact"})
      .eq("status", "uploaded")
      .eq("intake_status", "review_pending")
      .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
      .is("document_id", null)
      .is("deleted_at", null);
      query=document.owning_company_id===null?query.is('owning_company_id',null):query.eq('owning_company_id',document.owning_company_id);
      query=document.owning_branch_id===null?query.is('owning_branch_id',null):query.eq('owning_branch_id',document.owning_branch_id);
      return await query.order("uploaded_at", { ascending: false }).order("id").range(from,to);
    },{identity:row=>row.id,maxRows:10000});


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
        upload_session_id: number | null;
        successful_job: boolean;
      }
    >();

    for(let offset=0;offset<resultIds.length;offset+=100) {
      const aiResults = await readAllPages(async(from,to)=>await supabase
        .from("dms_ai_extraction_results")
        .select(
          `id, upload_session_id, suggested_document_type_id, classification_confidence, expiry_date_suggestion,
           job:dms_ai_extraction_jobs!job_id(status),
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
          upload_session_id:r.upload_session_id as number|null,
          successful_job:(r.job as unknown as {status:string}|null)?.status==='complete',
        });
      }
    }

    const today = new Date().toISOString().slice(0, 10);
    const mayOverride=document.owning_company_id===null?hasGlobalPermission(ctx,'dms.admin'):hasPermissionInScope(ctx,'dms.admin',document.owning_company_id,document.owning_branch_id);

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
      if (!ai||ai.upload_session_id!==s.id||!ai.successful_job) {
        eligible=false;
        ineligibleReason='A successful AI Fill result for this upload is required. Re-run its review in the Inbox.';
      } else if (typeMatch === "mismatch") {
        eligible = false;
        ineligibleReason = `AI detected type "${ai?.suggested_document_type_name ?? "a different type"}" — does not match this document`;
      } else if (isExpiredSuggestion) {
        eligible = false;
        ineligibleReason = `AI detected expiry date ${ai?.expiry_date_suggestion} has already passed`;
      }

      if(!eligible&&mayOverride){eligible=true;ineligibleReason='Administrator review and a recorded manual-override reason are required. This is not verified AI classification.';}
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
