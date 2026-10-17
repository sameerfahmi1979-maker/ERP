"use server";

import {
  createNumberingRuleSchema,
  updateNumberingRuleSchema,
  type CreateNumberingRuleInput,
  type GenerateReferenceInput,
  type GenerateReferenceResult,
  type NumberingRule,
  type PreviewReferenceInput,
  type PreviewReferenceResult,
  type UpdateNumberingRuleInput,
} from "@/features/numbering/numbering-types";
import { logger } from "@/lib/logger";
import { getAuthContext, hasGlobalPermission } from "@/lib/rbac/check";
import {saveNumberingMutation} from '@/server/numbering-save';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';
import {workspaceValidationFailure} from '@/lib/workspace/field-errors';
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import {numberingPreviewInput,numberingAllocationInput,numberingPreviewReceipt,numberingLegacyReceipt,numberingAllocationReceipt,singleNumberingReceipt,numberingRollback,numberingUnconfirmed,numberingRejection} from '@/lib/numbering/action-contract';

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  kind?: 'not_found'|'forbidden'|'failed';
  uncertain?: boolean;
};

function invalidateNumberingAfterCommit():void{
  // The database receipt remains authoritative even when cache refresh fails.
  try{revalidatePath('/admin/settings/numbering');}
  catch{logger.warn('Numbering change committed; list invalidation unavailable.');}
}

// ============================================================================
// CRUD OPERATIONS
// ============================================================================

/**
 * Fetch all numbering rules
 */
export async function getNumberingRules(): Promise<ActionResult<NumberingRule[]>> {
  try {
    const ctx = await getAuthContext();
    if (!['numbering.rules.view','numbering.rules.manage','numbering.rules.lock'].some(code=>hasGlobalPermission(ctx,code))) {
      return { success: false, kind:'forbidden', error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("global_numbering_rules")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) {
      logger.error("getNumberingRules error", error);
      return { success: false, kind:'failed', error: 'Numbering rules could not be loaded.' };
    }

    return { success: true, data: data as NumberingRule[] };
  } catch (error) {
    logger.error("getNumberingRules exception", error);
    return { success: false, error: "Failed to fetch numbering rules" };
  }
}

/**
 * Fetch a single numbering rule by ID
 */
export async function getNumberingRuleById(id: number): Promise<ActionResult<NumberingRule>> {
  try {
    const ctx = await getAuthContext();
    if (!['numbering.rules.view','numbering.rules.manage','numbering.rules.lock'].some(code=>hasGlobalPermission(ctx,code))) {
      return { success: false, kind:'forbidden', error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("global_numbering_rules")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) {
      logger.error("getNumberingRuleById error", error);
      return { success: false, kind:'failed', error: 'This numbering rule could not be loaded.' };
    }
    if(!data)return {success:false,kind:'not_found',error:'Numbering rule not found.'};
    return { success: true, data: data as NumberingRule };
  } catch (error) {
    logger.error("getNumberingRuleById exception", error);
    return { success: false, error: "Failed to fetch numbering rule" };
  }
}

/** Save through the caller-authenticated, atomic F06 mutation contract. */
export async function createNumberingRule(input: CreateNumberingRuleInput, contract: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed=createNumberingRuleSchema.safeParse(input);
  if(!parsed.success)return workspaceValidationFailure(parsed.error.issues);
  const ctx=await getAuthContext();
  if(!hasGlobalPermission(ctx,'numbering.rules.manage'))return {success:false,error:'Permission denied'};
  const result=await saveNumberingMutation(null,'save',parsed.data,contract);
  if(result.success)invalidateNumberingAfterCommit();
  return result;
}

export async function updateNumberingRule(input: UpdateNumberingRuleInput, contract: WorkspaceSaveContract): Promise<WorkspaceSaveResult> {
  const parsed=updateNumberingRuleSchema.safeParse(input);
  if(!parsed.success)return workspaceValidationFailure(parsed.error.issues);
  const ctx=await getAuthContext();
  if(!hasGlobalPermission(ctx,'numbering.rules.manage'))return {success:false,error:'Permission denied'};
  const {id,...data}=parsed.data;
  const result=await saveNumberingMutation(id,'save',data,contract);
  if(result.success)invalidateNumberingAfterCommit();
  return result;
}

export async function toggleNumberingRuleActive(id:number,isActive:boolean,contract:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
  const ctx=await getAuthContext();
  if(!hasGlobalPermission(ctx,'numbering.rules.manage')||typeof isActive!=='boolean')return {success:false,error:'Permission denied or invalid status'};
  const result=await saveNumberingMutation(id,'active',{is_active:isActive},contract);
  if(result.success)invalidateNumberingAfterCommit();
  return result;
}

export async function toggleNumberingRuleLock(id:number,isLocked:boolean,contract:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
  const ctx=await getAuthContext();
  if(!hasGlobalPermission(ctx,'numbering.rules.lock')||typeof isLocked!=='boolean')return {success:false,error:'Permission denied or invalid lock status'};
  const result=await saveNumberingMutation(id,'lock',{is_locked:isLocked},contract);
  if(result.success)invalidateNumberingAfterCommit();
  return result;
}

// ============================================================================
// PREVIEW & GENERATION
// ============================================================================

/**
 * Preview the next reference number without consuming sequence
 */
export async function previewNextReference(
  input: PreviewReferenceInput
): Promise<ActionResult<PreviewReferenceResult>> {
  try {
    const parsed=numberingPreviewInput.safeParse(input);
    if(!parsed.success)return {success:false,error:'Choose a valid numbering rule and positive sequence.'};
    const request=parsed.data;
    const ctx = await getAuthContext();
    if (!hasGlobalPermission(ctx, "numbering.rules.preview")) {
      return { success: false, kind:'forbidden', error: "Permission denied" };
    }

    const supabase = await createClient();
    const { data, error } = await supabase.rpc("preview_numbering_reference", {
      p_rule_id: request.ruleId ?? null,
      p_rule_code: request.ruleCode ?? null,
      p_document_type_code: request.documentTypeCode ?? null,
      p_sequence: request.nextSequenceNumber ?? null,
    });

    if (error) {
      return { success: false, error: numberingRollback(error.code)?numberingRejection(error.code):'Preview unavailable. Retry when the connection is restored.' };
    }

    const receipt=numberingPreviewReceipt.safeParse(singleNumberingReceipt(data));
    if(!receipt.success || (request.ruleId!==undefined && receipt.data.rule_id!==request.ruleId))return {success:false,error:'Preview response incomplete or inconsistent. Refresh the preview before continuing.'};
    const preview=receipt.data;
    return {
      success: true,
      data: {
        previewReferenceNumber: preview.preview_reference_number,
        documentPrefix: preview.document_prefix,
        sequenceNumber: preview.sequence_number,
        formatTemplate: preview.format_template,
        ruleId: preview.rule_id,
      },
    };
  } catch {
    return { success: false, error: "Failed to preview reference number" };
  }
}

/**
 * Generate and consume the next reference number
 */
export async function generateNextReference(
  input: GenerateReferenceInput
): Promise<ActionResult<GenerateReferenceResult>> {
  let allocationStarted=false;
  let retained=false;
  try {
    const parsed=numberingAllocationInput.safeParse(input);
    if(!parsed.success)return {success:false,error:'Choose valid allocation details. ID-selected allocations require their retained operation ID.'};
    const request=parsed.data;
    retained=request.operationId!==undefined;
    const ctx = await getAuthContext();
    if (!hasGlobalPermission(ctx, "numbering.rules.generate")) {
      return { success: false, kind:'forbidden', error: "Permission denied" };
    }

    const supabase = await createClient();
    // Legacy external callers retain their signature. F06 party creation uses
    // its atomic consumer RPC. Never mint a fresh request ID on an automatic retry.
    allocationStarted=true;
    const { data, error } = request.operationId ? await supabase.rpc("allocate_numbering_reference", {
      p_operation: request.operationId,
      p_rule_id: request.ruleId ?? null,
      p_status: 'consumed',
      p_rule_code: request.ruleCode ?? null,
      p_document_type_code: request.documentTypeCode ?? null,
      p_target_table_name: request.targetTableName ?? null,
      p_target_record_id: request.targetRecordId ?? null,
      p_reason: request.generationReason ?? null,
    }) : await supabase.rpc('generate_next_reference_number',{
      p_rule_code:request.ruleCode??null,p_document_type_code:request.documentTypeCode??null,
      p_target_table_name:request.targetTableName??null,p_target_record_id:request.targetRecordId??null,
      p_generation_reason:request.generationReason??null,p_generated_by:ctx.profile?.id??null,
    });

    if (error) {
      const rollback=numberingRollback(error.code);
      return { success: false, uncertain:!rollback, error: rollback?numberingRejection(error.code):numberingUnconfirmed(retained) };
    }

    const raw=singleNumberingReceipt(data);
    const receipt=numberingLegacyReceipt.safeParse(raw);
    const retainedReceipt=retained?numberingAllocationReceipt.safeParse(raw):null;
    if(!receipt.success || (retainedReceipt && !retainedReceipt.success)
      || (request.ruleId!==undefined && receipt.data.numbering_rule_id!==request.ruleId))return {success:false,uncertain:true,error:numberingUnconfirmed(retained)};
    const generated=receipt.data;
    invalidateNumberingAfterCommit();

    return {
      success: true,
      data: {
        id: retainedReceipt?.success?retainedReceipt.data.id:undefined,
        replayed: retainedReceipt?.success?retainedReceipt.data.replayed:undefined,
        generatedReferenceNumber: generated.generated_reference_number,
        generatedSequenceNumber: generated.generated_sequence_number,
        numberingRuleId: generated.numbering_rule_id,
        sequenceStateId: generated.sequence_state_id,
        generationStatus: generated.generation_status,
      },
    };
  } catch {
    return allocationStarted?{success:false,uncertain:true,error:numberingUnconfirmed(retained)}:{success:false,error:'Allocation could not start. Check your session and try again.'};
  }
}
