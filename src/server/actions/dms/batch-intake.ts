"use server";
import {readAllPages} from "@/server/reads/all-pages";

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
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import {admitBatch, bootstrapBatchOrigin, discoverBatchAdmissions, verifyBatchUpload, bindBatchAdmission, refreshBatchAdmission, recoverBatchMemberUpload, verifySelectedBatchUpload} from "@/server/dms-batch-admission";
import {batchMemberRequestSchema,batchRequestSchema,type BatchMemberUploadResult,type BatchAdmissionResult, type BatchBootstrapResult, type BatchDiscoveryResult, type BatchObjectResult, type BatchRequest} from "@/lib/dms/batch-admission";
import {
  startAiIntakeFromUploadSession,
  retryAiIntake,
} from "@/server/actions/dms/ai-intake";
import { resolveStandardFileNameForIntakeApprove } from "@/server/actions/dms/standard-file-name";
import { validateStandardFileName } from "@/lib/dms/standard-file-name";
import {batchDraftInputSchema,batchDraftContractSchema,batchDraftPrepareRpcSchema,type BatchDraftReceipt,type BatchDraftResult} from "@/lib/dms/numbered-batch-draft";
import {batchDraftSaveError,createNumberedBatchDraft,batchDraftRecoveryError,readNumberedBatchDraftRecovery,prepareRecoverableNumberedBatchDraft} from "@/server/numbered-batch-draft";
import type {BatchDraftRecoveryResult,BatchDraftPreparationResult} from "@/lib/dms/numbered-batch-draft";
import type {WorkspaceSaveContract} from "@/lib/workspace/save-contract";
import { runPostCommitOcr } from "@/lib/dms/approve/approve-ai-intake";
import {finalizeRetainedBatch} from '@/server/dms-retained-batch-finalization';
import {aiApprovalInputSchema,type AiApprovalInput} from '@/lib/dms/numbered-ai-approval';
import {triggerDmsPostApproveOrchestration} from '@/lib/dms/orchestration/post-approve-orchestration';
import {discardRetainedIntake} from '@/server/dms-intake-discard';
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
  // Retain the existing caller signature, but do not ask scoped DMS actors for
  // global settings visibility merely to read this one admission boolean.
  void supabase;
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile || !canUpload(ctx)) return false;
    const { data, error } = await createAdminClient()
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_BATCH_INTAKE")
      .single();
    return !error && data?.is_enabled === true;
  } catch { return false; }
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

// ── Small local helpers ────────────────────────────────────────────────────────

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

export type CreateBatchInput = BatchRequest;
export type CreateBatchResult = BatchAdmissionResult;

export async function bootstrapDmsBatchOrigin(): Promise<BatchBootstrapResult> {
  return bootstrapBatchOrigin();
}

export async function createDmsUploadBatch(input: BatchRequest): Promise<BatchAdmissionResult> {
  const result = await admitBatch(input);
  if (result.state === "admitted") {
    try { revalidatePath("/dms/inbox"); } catch { /* A cache failure cannot revoke a committed receipt. */ }
  }
  return result;
}

export async function recoverDmsUploadBatch(input: BatchRequest): Promise<BatchAdmissionResult> {
  return createDmsUploadBatch(input);
}

export async function discoverDmsBatchAdmissions(): Promise<BatchDiscoveryResult> {
  return discoverBatchAdmissions();
}

export async function verifyDmsBatchUpload(input: {request: BatchRequest; position: number}): Promise<BatchObjectResult> {
  return verifyBatchUpload(input);
}

// ════════════════════════════════════════════════════════════════════════════
// 2. startAiIntakeAndCreateDraft  (one file → one pending_ai_review draft)
// ════════════════════════════════════════════════════════════════════════════


/** Full durable read; recent-page discovery and complete upload plans are not prerequisites. */
export async function readDmsUploadBatchDraftRecovery(request:BatchRequest):Promise<BatchDraftRecoveryResult>{
  if(!batchRequestSchema.safeParse(request).success)return batchDraftRecoveryError("22023");
  try{
    const bound=await bindBatchAdmission(request);
    const result=await readNumberedBatchDraftRecovery(bound.client,bound.receipt,bound.origin);
    if(!result.success)return result;
    await refreshBatchAdmission(bound);
    return {success:true,receipt:bound.receipt,recovery:result.data};
  }catch(error){return batchDraftRecoveryError(typeof error==="object"&&error!==null&&"code" in error?error.code:undefined);}
}

export async function recoverDmsBatchMemberUpload(input:{request:BatchRequest;position:number}):Promise<BatchMemberUploadResult>{
  return recoverBatchMemberUpload(input);
}

export async function prepareDmsUploadBatchMemberDraft(input:{request:BatchRequest;position:number}):Promise<BatchDraftPreparationResult>{
  const parsed=batchMemberRequestSchema.safeParse(input);
  if(!parsed.success)return batchDraftRecoveryError("22023");
  try{
    const {request,position}=parsed.data;
    const bound=await bindBatchAdmission(request);
    const prepare=()=>prepareRecoverableNumberedBatchDraft(bound.client,bound.receipt,bound.origin,position);
    let result=await prepare();
    if(!result.success)return result;
    const operation=result.data.member.draft_operation_id;
    await refreshBatchAdmission(bound);
    if(result.data.member.kind==="prepared"||result.data.member.processing)
      return {success:true,receipt:bound.receipt,preparation:result.data};
    const object=await verifySelectedBatchUpload(bound,position);
    if(object.state!=="present")return batchDraftRecoveryError();
    await refreshBatchAdmission(bound);
    result=await prepare();
    if(!result.success)return result;
    if(result.data.member.draft_operation_id!==operation)return batchDraftRecoveryError();
    await refreshBatchAdmission(bound);
    if(result.data.member.kind==="prepared"||result.data.member.processing)
      return {success:true,receipt:bound.receipt,preparation:result.data};
    const member=bound.receipt.members[position];
    let analyzed:Awaited<ReturnType<typeof startAiIntakeFromUploadSession>>;
    try{analyzed=await startAiIntakeFromUploadSession({uploadSessionId:member.id,allowDuplicate:false});}
    catch{return batchDraftRecoveryError();}
    const response=z.object({success:z.literal(true),data:z.object({sessionCode:z.literal(member.code),status:z.enum(["review_pending","already_processing"]),message:z.string().optional()}).strict()}).strict().safeParse(analyzed);
    if(!response.success)return batchDraftRecoveryError();
    await refreshBatchAdmission(bound);
    result=await prepare();
    if(!result.success)return result;
    if(result.data.member.draft_operation_id!==operation)return batchDraftRecoveryError();
    await refreshBatchAdmission(bound);
    return {success:true,receipt:bound.receipt,preparation:result.data};
  }catch(error){return batchDraftRecoveryError(typeof error==="object"&&error!==null&&"code" in error?error.code:undefined);}
}

const StartDraftSchema = batchDraftInputSchema;
export type StartDraftResult = BatchDraftReceipt;

/** Two-phase handoff: preparation allocates nothing. The caller retains the
 * prepared snapshot before dispatching the one atomic numbered consumer. */
export async function startAiIntakeAndCreateDraft(
  input: z.input<typeof StartDraftSchema>,
  contract?: WorkspaceSaveContract,
): Promise<BatchDraftResult> {
  const identity=batchDraftContractSchema.safeParse(contract);
  const parsed=StartDraftSchema.safeParse(input);
  if(!identity.success)return {success:false,error:"Reopen the batch inbox. Its draft request identity is missing."};
  if(!parsed.success)return {success:false,error:"The draft request is invalid or belongs to another upload."};
  try {
    const ctx=await getAuthContext();
    if(!ctx.profile||!hasPermission(ctx,"dms.documents.upload")||!hasPermission(ctx,"numbering.rules.generate"))
      return {success:false,error:"Document upload and numbering generation permissions are required."};
    const supabase=await createClient();
    if(parsed.data.prepared) {
      const result=await createNumberedBatchDraft(supabase,parsed.data,identity.data);
      if(result.success) {
        // Summary/cache work is not a second creation and cannot revoke a receipt.
        try { if(!result.data.replayed&&parsed.data.prepared.batch_id)await recomputeBatchStatus(parsed.data.prepared.batch_id); } catch {}
        try { revalidatePath("/dms/inbox"); } catch {}
      }
      return result;
    }
    // Only explicit historical NULL provenance permits the old two-phase path.
    const source=await supabase.from("dms_upload_sessions").select("batch_draft_operation_id").eq("id",parsed.data.uploadSessionId).is("deleted_at",null).single();
    if(source.error||!source.data||source.data.batch_draft_operation_id!==null)
      return {success:false,uncertain:true,error:"Use the retained batch recovery workflow. This upload cannot start a new legacy draft attempt."};
    const prepare=async()=>{
      const response=await supabase.rpc("prepare_numbered_dms_batch_draft",{p_session:parsed.data.uploadSessionId});
      if(response.error)return {error:batchDraftSaveError(response.error.code)};
      const value=batchDraftPrepareRpcSchema.safeParse(response.data);
      if(!value.success)return {error:{success:false,uncertain:true,error:"Draft preparation could not be verified. Retry this request."} as BatchDraftResult};
      return {value:value.data};
    };
    // Database admission checks pinned source scope before any provider access.
    let preparation=await prepare();
    if(preparation.error)return preparation.error;
    if(preparation.value!.kind==="analysis_required") {
      const pending=preparation.value!;
      if(pending.processing)return {success:false,uncertain:true,error:"Analysis is still in progress. Retry this retained draft request when it finishes."};
      const analysis=await startAiIntakeFromUploadSession({uploadSessionId:parsed.data.uploadSessionId,allowDuplicate:parsed.data.allowDuplicate});
      if(!analysis.success) {
        try {
          if(pending.batch_id)await recomputeBatchStatus(pending.batch_id);
          await logAudit({module_code:"DMS",entity_name:"dms_upload_sessions",entity_id:parsed.data.uploadSessionId,entity_reference:pending.session_code,action:"update",new_values:{event:"dms_batch_draft_failed",batch_id:pending.batch_id}});
        } catch {}
        return {success:false,uncertain:true,error:"Analysis was not confirmed. No draft was submitted; retry this retained request after checking the intake."};
      }
      preparation=await prepare();
      if(preparation.error)return preparation.error;
    }
    if(preparation.value!.kind!=="prepared")return {success:false,uncertain:true,error:"Analysis is not ready. Retry this retained draft request when it finishes."};
    const snapshot=preparation.value!.snapshot;
    if(snapshot.upload_session_id!==parsed.data.uploadSessionId)return {success:false,uncertain:true,error:"Prepared draft identity did not match the upload."};
    return {success:false,prepared:{operation_id:identity.data.operationId,snapshot}};
  } catch {
    return {success:false,uncertain:true,error:"Draft preparation or save was not confirmed. Retry the retained request."};
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
    standardFileName: z.string().min(1).max(200).nullable().optional(),
    allowDuplicate:z.boolean().optional().default(false),
  })
  .refine(
    (v) => (v.uploadSessionId != null) !== (v.documentId != null),
    { message: "Provide exactly one of uploadSessionId or documentId" }
  );

export type FinalizeDraftInput = z.input<typeof FinalizeSchema>;

/** Original actor/current access only. An unavailable read is not an empty
 * recovery state and must never authorize a replacement finalization. */
export async function recoverDraftFinalization(uploadSessionId:number):Promise<ActionResult<AiApprovalInput|null>>{
 try{
  if(!Number.isSafeInteger(uploadSessionId)||uploadSessionId<1)return {success:false,error:'Invalid intake'};
  const ctx=await getAuthContext();if(!ctx.profile||!canApprove(ctx))return {success:false,error:'Finalization recovery unavailable'};
  const client=await createClient(),r=await client.rpc('f07_recover_batch_finalization',{p_session:uploadSessionId});
  if(r.error)return {success:false,error:'The original finalization could not be read. Do not submit a replacement.'};
  if(r.data===null)return {success:true,data:null};
  const p=aiApprovalInputSchema.safeParse(r.data);
  if(!p.success||p.data.uploadSessionId!==uploadSessionId||p.data.prepared)return {success:false,error:'The retained request could not be verified.'};
  return {success:true,data:p.data};
 }catch{return {success:false,error:'Finalization recovery is unavailable. Retain this intake.'};}
}

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
    const sessionCode = session.session_code as string;
    if (!documentId) return { success: false, error: "This intake has no draft document to finalize" };

    // Load the draft document.
    const { data: doc, error: docErr } = await supabase
      .from("dms_documents")
      .select("id, document_no, status, current_version_id, owning_company_id, owning_branch_id")
      .eq("id", documentId)
      .is("deleted_at", null)
      .single();
    if (docErr || !doc) return { success: false, error: "Draft document not found" };

    // A status is not a receipt. The retained protocol alone can confirm replay.
    if (doc.status !== "pending_ai_review" && doc.status !== "active") {
      return { success: false, error: `Document is not a pending AI draft (status: ${doc.status})` };
    }

    // Validate the chosen type is active and resolve its category.
    const { data: docType, error: typeError } = await supabase
      .from("dms_document_types")
      .select("id, type_code, category_id, default_confidentiality, is_active, requires_expiry_tracking")
      .eq("id", v.documentTypeId)
      .single();
    if (typeError || !docType) return { success: false, error: "Document type not found" };
    if (!docType.is_active) return { success: false, error: "Selected document type is not active" };

    const requiresExpiryTracking = (docType.requires_expiry_tracking as boolean) ?? false;
    const userId = ctx.profile.id;

    const resolvedFileName = await resolveStandardFileNameForIntakeApprove({
      uploadSessionId,
      documentTypeId: v.documentTypeId,
      expiryDate: v.expiryDate ?? null,
      documentNo: doc.document_no as string,
      partyId: v.partyId ?? null,
      links: v.links?.map((l) => ({ entityType: l.entityType, entityId: l.entityId })),
      metadataValues: v.metadataValues,
      standardFileName: v.standardFileName ?? null,
      originalFilename: session.original_filename as string,
      aiResultId: v.aiResultId ?? (session.ai_result_id as number | null),
      description: v.description ?? null,
      title: v.title,
    });

    const nameValidation = validateStandardFileName(resolvedFileName, { requiresExpiryTracking });
    if (!nameValidation.valid) {
      return {
        success: false,
        error: `Standard file name is incomplete (missing: ${nameValidation.missing.join(", ")}). Fix on the review screen before approving.`,
      };
    }

    const effectiveAiResultId = v.aiResultId ?? (session.ai_result_id as number | null);
    const confidentiality = v.confidentialityLevel ?? (docType.default_confidentiality as string | null) ?? "internal";
    const business=aiApprovalInputSchema.safeParse({uploadSessionId,title:v.title,description:v.description??null,documentTypeId:v.documentTypeId,
     confidentialityLevel:confidentiality,owningCompanyId:v.owningCompanyId===undefined?doc.owning_company_id:v.owningCompanyId,
     owningBranchId:v.owningBranchId===undefined?doc.owning_branch_id:v.owningBranchId,partyId:v.partyId??null,issueDate:v.issueDate??null,expiryDate:v.expiryDate??null,
     metadataValues:v.metadataValues,tagIds:v.tagIds,links:v.links,aiResultId:effectiveAiResultId,standardFileName:v.standardFileName??null,allowDuplicate:v.allowDuplicate});
    if(!business.success)return {success:false,error:business.error.issues[0]?.message??'Invalid finalization values'};
    const sagaResult=await finalizeRetainedBatch(supabase,admin,business.data,resolvedFileName,userId);
    if (!sagaResult.success) return sagaResult;
    // Keep the deployed OCR implementation. Receipt-only replay never invokes
    // the provider pipeline or reprocesses a document a second time.
    if(!sagaResult.replayed)try{await runPostCommitOcr(supabase,admin,{documentId,aiResultId:effectiveAiResultId,fileId:null,
     createFileVersion:true,sessionCode,userId,mimeType:session.mime_type as string,resolvedFileName});}catch{/* Confirmed core commit is authoritative. */}
    if(!sagaResult.replayed)try{await triggerDmsPostApproveOrchestration({sessionCode,documentId,uploadSessionId,approveRunId:sagaResult.approveRunId,source:'batch_finalize'});}catch{/* Existing T07 admission keeps its own retained job outcome; no fallback. */}

    try {
      if (batchId) await recomputeBatchStatus(batchId);
      revalidatePath("/dms/documents");
      revalidatePath("/dms/inbox");
      revalidatePath(`/dms/intake/${sessionCode}`);
    } catch { /* The confirmed business transaction wins over cache/bookkeeping. */ }

    return { success: true, data: sagaResult.data };
  } catch (e) {
    logger.error("finalizeDraftIntake error", e);
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
 * recompute so bulk discards can batch the bookkeeping). The checked operation
 * archives an unpublished draft and retains its files, versions and receipts.
 * This is NOT an approval path; bulk discard simply loops this helper.
 */
async function performDraftDiscard(
  session: DiscardableSession,
  reason: string | undefined,
  supabase: SupabaseClient
): Promise<{ ok: true; batchId: number | null } | { ok: false; error: string }> {
  return discardRetainedIntake(supabase,{sessionId:session.id,documentId:session.document_id,reason});
}

export async function discardDraftIntake(
  input: DiscardDraftInput
): Promise<ActionResult> {
  try {
    const parsed = DiscardSchema.safeParse(input);
    if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? "Validation error" };
    const { uploadSessionId, documentId, reason } = parsed.data;

    const supabase = await createClient();
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

    const res = await performDraftDiscard(session as DiscardableSession, reason, supabase);
    if (!res.ok) return { success: false, error: res.error };

    if (res.batchId) await recomputeBatchStatus(res.batchId);

    revalidatePath("/dms/inbox");
    revalidatePath("/dms/documents");

    return { success: true };
  } catch (e) {
    logger.error("discardDraftIntake error", e);
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
      const res = await performDraftDiscard(session, reason, supabase);
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
    logger.error("discardDraftIntakeBulk error", e);
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
  limit?: number
): Promise<ActionResult<DmsUploadBatchListRow[]>> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!ctx.isAccountActive || ctx.profile.must_change_password || !canView(ctx)) return { success: false, error: "Permission denied" };

    if(limit!==undefined&&(!Number.isInteger(limit)||limit<1||limit>200))return {success:false,error:"Invalid batch limit"};
    const batches=await readAllPages(async(from,to)=>await supabase
      .from("dms_upload_batches")
      .select("id, batch_code, status, total_files, processed_files, approved_files, failed_files, entity_type, entity_id, created_at",{count:"exact"})
      .is("deleted_at", null)
      .order("created_at", { ascending: false }).order("id").range(from,to),{identity:row=>row.id,maxRows:10000});
    const batchRows = (limit===undefined?batches:batches.slice(0,limit)) as DmsUploadBatchRow[];
    if (batchRows.length === 0) return { success: true, data: [] };

    // Aggregate live per-draft counts (one query for all listed batches).
    const batchIds = batchRows.map((b) => b.id);
    const sessions=[];
    for(let offset=0;offset<batchIds.length;offset+=100){
      const part=await readAllPages(async(from,to)=>await supabase.from("dms_upload_sessions")
        .select("id,batch_id,intake_status,document:dms_documents!document_id(status)",{count:"exact"})
        .in("batch_id",batchIds.slice(offset,offset+100)).is("deleted_at",null).order("id").range(from,to),{identity:row=>row.id,maxRows:10000});
      sessions.push(...part);
    }

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
): Promise<ActionResult<DmsBatchDraftRow[]> & { updatedAt?: number }> {
  try {
    const supabase = await createClient();
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated" };
    if (!Number.isSafeInteger(batchId)||batchId<=0)return {success:false,error:"Invalid batch"};
    if (!ctx.isAccountActive || ctx.profile.must_change_password || !canView(ctx)) return { success: false, error: "Permission denied" };

    const parent=await supabase.from("dms_upload_batches").select("id").eq("id",batchId).is("deleted_at",null).maybeSingle();
    if(parent.error)return {success:false,error:"Batch access unavailable"};
    if(!parent.data)return {success:false,error:"Permission denied"};
    const sessions = await readAllPages(async(from,to)=>{const r=await supabase
      .from("dms_upload_sessions")
      .select(`id, session_code, original_filename, intake_status, is_duplicate, document_id, ai_result_id,
               document:dms_documents!document_id(id, document_no, title, status, document_type:dms_document_types!document_type_id(name_en)),
               ai_result:dms_ai_extraction_results!ai_result_id(classification_confidence)`,{count:"exact"})
      .eq("batch_id", batchId)
      .is("deleted_at", null)
      .order("id", { ascending: true }).range(from,to);return r;},{identity:row=>row.id,maxRows:10000});


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

    return { success: true, data: rows, updatedAt: Date.now() };
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
