"use server";
import { z } from "zod";
import { reviewedCall } from "@/server/dms-reviewed-updates";
import { duplicateAdvisorySchema, preparationId, preparationHash, preparationStartSchema, preparationSnapshotSchema, preparationApplySchema, preparationProfileSchema } from "@/lib/dms/preparation/contracts";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";

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
  return reviewedCall("ai_mod04_preparation", { p_action: "start", p_data: p }, z.strictObject({ documentId: z.literal(p.documentId), requestId: z.literal(p.requestId), jobId: preparationId, status: z.string(), replayed: z.boolean() }));
}
export async function getDocumentPreparationStatus(documentId: number, jobId: number) {
  if (!preparationId.safeParse(documentId).success || !preparationId.safeParse(jobId).success) return { success: false as const, error: "Invalid retained preparation." };
  return reviewedCall("ai_mod04_preparation", { p_action: "status", p_data: { documentId, jobId } }, z.strictObject({
    documentId: z.literal(documentId), jobId: z.literal(jobId), state: z.string(), queueStatus: z.string(), sourceCurrent: z.boolean(),
    preparedText:z.array(z.strictObject({fileId:preparationId,name:z.string(),text:z.string().nullable(),truncated:z.boolean().nullable()})).max(10), resultId: preparationId.nullable(), candidate: z.unknown().nullable(), snapshot: preparationHash,
  }));
}
export async function recoverDocumentPreparation(documentId: number) {
  if (!preparationId.safeParse(documentId).success) return { success: false as const, error: "Invalid document." };
  return reviewedCall("ai_mod04_preparation", { p_action: "recover", p_data: { documentId } }, z.strictObject({ recovery: z.strictObject({ jobId: preparationId, requestId: z.uuid(), snapshot: preparationHash, mode: z.enum(["reuse_text", "reread_files"]), fileIds: z.array(preparationId).min(1).max(10), state: z.string() }).nullable() }));
}
export async function cancelDocumentPreparation(documentId: number, jobId: number) {
  if (!preparationId.safeParse(documentId).success || !preparationId.safeParse(jobId).success) return { success: false as const, error: "Invalid retained preparation." };
  return reviewedCall("ai_mod04_preparation", { p_action: "cancel", p_data: { documentId, jobId } }, z.strictObject({ documentId: z.literal(documentId), jobId: z.literal(jobId), state: z.literal("cancelled") }));
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
