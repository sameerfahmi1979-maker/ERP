"use server";
import { z } from "zod";
import { reviewedCall } from "@/server/dms-reviewed-updates";
import { duplicateAdvisorySchema, preparationId, preparationHash, preparationStartSchema, preparationSnapshotSchema, preparationApplySchema, preparationProfileSchema } from "@/lib/dms/preparation/contracts";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { requireDmsFilePipelineAccess } from '@/server/dms-file-pipeline-access';
import { preparationReviewOpenSchema, preparationDraftSaveSchema } from '@/lib/dms/preparation/contracts';

/** Read-only opening: do not conflate a read failure with an uncertain save. */
export async function openDocumentPreparationReview(documentId: number) {
  if (!preparationId.safeParse(documentId).success) return { success: false as const, error: 'Invalid document.' };
  try {
    const client = await createClient();
    const response = await client.rpc('dms_saved_document_review', {p_action: 'open', p_data: {documentId}});
    if (response.error) {
      const code = /^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(response.error.code ?? '') ? response.error.code : 'unavailable';
      // 42501 also covers lifecycle holds. Only read state through the caller's
      // normal RLS client; never use elevated access to explain a denied record.
      if (code === '42501') {
        const visible = await client.from('dms_documents').select('is_archived,status')
          .eq('id', documentId).is('deleted_at', null).maybeSingle();
        if (!visible.error && visible.data && (visible.data.is_archived === true || visible.data.status === 'archived'))
          return {success: false as const, error: 'This document is archived. Restore it through Archive before running AI. If restoration is blocked, its archive history must be reviewed first. Reference: review-archived. No AI request was started.'};
        if (!visible.error && visible.data?.status === 'superseded')
          return {success: false as const, error: 'This document has been replaced. Open the current document to run AI. Reference: review-replaced. No AI request was started.'};
      }
      const explanation = code === '42501' ? 'Review access could not be confirmed. Your session, document access or document state may have changed. Refresh and try again; if it continues, contact your administrator.'
        : code === '55P03' || code === '40P01' ? 'This document is being updated. Please try opening the review again.'
        : 'The saved document review could not be opened.';
      return {success: false as const, error: `${explanation} Reference: review-${code}. No AI request was started.`};
    }
    const parsed = preparationReviewOpenSchema.safeParse(response.data);
    if (!parsed.success || parsed.data.source.documentId !== documentId)
      return {success: false as const, error: 'The saved document review returned incomplete information. Reference: review-format. No AI request was started.'};
    return {success: true as const, data: parsed.data};
  } catch { return {success: false as const, error: 'The saved document review is temporarily unavailable. Please retry. No AI request was started.'}; }
}

export async function saveDocumentPreparationDraft(raw: unknown) {
  const input = preparationDraftSaveSchema.safeParse(raw);
  if (!input.success) return {success: false as const, error: 'Check the review draft fields.'};
  const p = input.data;
  return reviewedCall('dms_saved_document_review', {p_action: 'save_draft', p_data: p}, z.strictObject({
    documentId: z.literal(p.documentId), jobId: z.literal(p.jobId), requestId: z.literal(p.requestId),
    revision: z.literal(p.expectedRevision + 1), saved: z.literal(true),
  }));
}

export async function checkDmsDuplicateBeforeUpload(sha256: string, size: number) {
  if (!preparationHash.safeParse(sha256).success || !z.number().int().positive().max(52428800).safeParse(size).success)
    return { success: false as const, error: "Invalid file details." };
  return reviewedCall("ai_mod04_duplicate_advisory", { p_sha256: sha256, p_size: size }, duplicateAdvisorySchema);
}
const profileReceipt = z.strictObject({documentTypeId:preparationId,profile:preparationProfileSchema,profileHash:preparationHash});
export async function getDmsPreparationProfile(documentTypeId:number) {
  if(!preparationId.safeParse(documentTypeId).success)return {success:false as const,error:"Invalid document type."};
  return reviewedCall("ai_mod04_profile_snapshot",{p_type:documentTypeId},z.strictObject({documentTypeId:z.literal(documentTypeId),typeCode:z.string(),name:z.string(),requiresExpiry:z.boolean(),activeProfile:preparationProfileSchema.nullable(),profile:preparationProfileSchema.nullable(),profileHash:preparationHash,fields:z.array(z.strictObject({code:z.string(),label:z.string()})).max(250),companies:z.array(z.strictObject({id:preparationId,name:z.string()})),branches:z.array(z.strictObject({id:preparationId,companyId:preparationId,name:z.string()}))}));
}
export async function saveDmsPreparationProfile(documentTypeId:number,expectedHash:string,raw:unknown) {
  if(!preparationId.safeParse(documentTypeId).success||!preparationHash.safeParse(expectedHash).success||!raw||typeof raw!=="object")return {success:false as const,error:"Reload the current profile before saving."};
  const input=raw as Record<string,unknown>;
  const rules=preparationProfileSchema.safeParse({...input,status:"draft",approvedBy:null,approvedAt:null});
  if(!rules.success||!z.enum(["draft","evaluated","approved","active","retired"]).safeParse(input.status).success)return {success:false as const,error:"Check the processing rules and reminder scopes."};
  return reviewedCall("ai_mod04_save_profile",{p_type:documentTypeId,p_expected_hash:expectedHash,p_profile:{...rules.data,status:input.status}},profileReceipt.refine(p=>p.documentTypeId===documentTypeId));
}
export async function getDocumentPreparationSnapshot(documentId: number) {
  if (!preparationId.safeParse(documentId).success) return { success: false as const, error: "Invalid document." };
  return reviewedCall("ai_mod04_preparation", { p_action: "snapshot", p_data: { documentId } }, preparationSnapshotSchema.refine(v => v.documentId === documentId));
}
export async function getDmsPreparationTagOptions() {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile || !ctx.isAccountActive || ctx.profile.must_change_password || (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin"))) return { success: false as const, error: "Permission denied" };
    const result = await (await createClient()).from("dms_tags").select("id,tag_name").eq("is_active", true).is("deleted_at", null).order("id").limit(1001);
    if (result.error || !result.data || result.data.length > 1000) return { success: false as const, error: "The current tag catalogue could not be verified. No new tag was created." };
    return { success: true as const, data: z.array(z.strictObject({ id: preparationId, tag_name: z.string() })).max(1000).parse(result.data) };
  } catch { return { success: false as const, error: "The current tag catalogue is unavailable." }; }
}
export async function startDocumentPreparation(raw: unknown) {
  const input = preparationStartSchema.safeParse(raw);
  if (!input.success) return { success: false as const, error: "Retain the original request and select its current source files." };
  const p = input.data;
  const denied = await requireDmsFilePipelineAccess(p.documentId);
  if (denied) return { success: false as const, error: denied };
  return reviewedCall("ai_mod04_preparation", { p_action: "start", p_data: p }, z.strictObject({ documentId: z.literal(p.documentId), requestId: z.literal(p.requestId), jobId: preparationId, status: z.string(), replayed: z.boolean() }));
}
export async function getDocumentPreparationStatus(documentId: number, jobId: number, resume = false) {
  if (!preparationId.safeParse(documentId).success || !preparationId.safeParse(jobId).success) return { success: false as const, error: "Invalid retained preparation." };
  if (resume !== false && resume !== true) return { success: false as const, error: 'Invalid resume request.' };
  return reviewedCall("dms_preparation_progress", { p_document: documentId, p_job: jobId, p_resume: resume }, z.strictObject({
    documentId: z.literal(documentId), jobId: z.literal(jobId), state: z.string(), queueStatus: z.string(), sourceCurrent: z.boolean(),
    preparedText:z.array(z.strictObject({fileId:preparationId,name:z.string(),text:z.string().nullable(),truncated:z.boolean().nullable()})).max(10), resultId: preparationId.nullable(), candidate: z.unknown().nullable(), snapshot: preparationHash,
    progress: z.strictObject({ stage: z.enum(['waiting','reading','analysing','ready','held','retry_wait','applied','cancelled']), admitted: z.boolean(), workerHealthy: z.boolean(), createdAt: z.string(), startedAt: z.string().nullable(), updatedAt: z.string(), errorCode: z.string().nullable(), holdReason: z.enum(['paused','daily_limit']).nullable() }),
  }));
}
export async function recoverDocumentPreparation(documentId: number) {
  if (!preparationId.safeParse(documentId).success) return { success: false as const, error: "Invalid document." };
  return reviewedCall("ai_mod04_preparation", { p_action: "recover", p_data: { documentId } }, z.strictObject({ recovery: z.strictObject({ jobId: preparationId, requestId: z.uuid(), snapshot: preparationHash, mode: z.enum(["reuse_text", "reread_files"]), fileIds: z.array(preparationId).min(1).max(10), state: z.string() }).nullable() }));
}
export async function cancelDocumentPreparation(documentId: number, jobId: number) {
  if (!preparationId.safeParse(documentId).success || !preparationId.safeParse(jobId).success) return { success: false as const, error: "Invalid retained preparation." };
  return reviewedCall("ai_mod04_preparation", { p_action: "cancel", p_data: { documentId, jobId } }, z.strictObject({ documentId: z.literal(documentId), jobId: z.literal(jobId), state: z.literal("cancelled") }),{
    '55000':'The earlier AI attempt has no confirmed result. An administrator must reconcile it before another run to avoid a possible duplicate AI charge. Your document and original file are unchanged.',
  });
}
export async function applyDocumentPreparation(raw: unknown) {
  const input = preparationApplySchema.safeParse(raw);
  if (!input.success) return { success: false as const, error: "Select and confirm the values you reviewed. Keep the original request if its outcome is unknown." };
  const p = input.data;
  const result = await reviewedCall("ai_mod04_apply_preparation", { p_data: p }, z.strictObject({ documentId: z.literal(p.documentId), jobId: z.literal(p.jobId), requestId: z.literal(p.requestId), appliedCount: z.literal(p.selections.length), state: z.literal("applied"), derivedReadiness:z.record(z.string(),z.unknown()) }));
  if (result.success) revalidatePath(`/dms/documents/record/${p.documentId}`);
  return result;
}
const routingPerson=z.strictObject({id:preparationId,label:z.string(),eligible:z.boolean()});
export async function getDmsApprovalRouting(documentId:number){
 if(!preparationId.safeParse(documentId).success)return {success:false as const,error:"Invalid document."};
 return reviewedCall("ai_mod04_approval_routing",{p_action:"read",p_data:{documentId}},z.strictObject({state:z.enum(["assigned","not_pending","held_source_or_mapping"]),approvalId:preparationId.nullable(),snapshot:preparationHash.nullable(),assignees:z.array(routingPerson).max(50),options:z.array(routingPerson.omit({eligible:true})).max(500),canReassign:z.boolean(),canDelegate:z.boolean(),decisionRule:z.enum(["one_assigned","all_assigned"]).nullable(),notificationReadiness:z.string()}));
}
export async function changeDmsApprovalRouting(raw:unknown){
 const parsed=z.strictObject({documentId:preparationId,approvalId:preparationId,requestId:z.uuid(),snapshot:preparationHash,action:z.enum(["reassign","delegate"]),profileIds:z.array(preparationId).min(1).max(50),reason:z.string().trim().min(5).max(1000)}).safeParse(raw);
 if(!parsed.success)return {success:false as const,error:"Select independent reviewers and explain the assignment change."};
 const {action,...p}=parsed.data;
 return reviewedCall("ai_mod04_approval_routing",{p_action:action,p_data:p},z.strictObject({documentId:z.literal(p.documentId),approvalId:z.literal(p.approvalId),requestId:z.literal(p.requestId),state:z.literal("assigned"),snapshot:preparationHash}));
}
