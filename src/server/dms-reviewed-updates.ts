import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import type {ActionResult,ApplyItemProposal,ApplyRunConfirmation,ApplyRunResult,CreateApplyRunInput} from '@/lib/dms/apply-to-erp/types';
import type {CorrectionSourceData} from '@/lib/dms/apply-correction/types';

const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const reviewHash=z.string().regex(/^[a-f0-9]{64}$/);
const key=z.uuid();
const uncertain='The result is unconfirmed. Keep this review and retry the same request to recover its result; do not create another operation.';

/** No admin client: the checked database operation evaluates the current session. */
export async function reviewedCall<T>(rpc:string,args:Record<string,unknown>,schema:z.ZodType<T>):Promise<ActionResult<T>>{
 try{
  const db=await createClient(),r=await db.rpc(rpc,args);
  if(r.error){
   const code=r.error.code??'',known=typeof code==='string'&&code.length===5&&(/^(?:22|23|42|P0)[A-Z0-9]{3}$/.test(code)||['PT409','PT404','40001','40P01'].includes(code));
   return {success:false,uncertain:!known,errorCode:code==='42501'?'permission_denied':code==='PT409'?'conflict_detected':'server_error',
    error:code==='42501'?'Document or source access is unavailable, or this feature is disabled.':code==='PT409'?'The reviewed document, values or definitions changed. Reload and review again.':known?'No change was committed. Check required fields, types, allowed selections and confirmation.':uncertain};
  }
  const parsed=schema.safeParse(r.data);
  return parsed.success?{success:true,data:parsed.data}:{success:false,uncertain:true,error:uncertain,errorCode:'server_error'};
 }catch{return {success:false,uncertain:true,error:uncertain,errorCode:'server_error'};}
}

const valueRow=z.object({id,document_id:id,definition_id:id,value_text:z.string().nullable(),value_number:z.number().nullable(),value_date:z.string().nullable(),value_datetime:z.string().nullable(),value_boolean:z.boolean().nullable(),value_json:z.unknown()}).passthrough();
export async function readMetadataSnapshot(documentId:number,aiResultId?:number){
 if(!id.safeParse(documentId).success||(aiResultId!==undefined&&!id.safeParse(aiResultId).success))return {success:false as const,error:'Invalid metadata document.'};
 const result=await reviewedCall('f07_metadata_operation',{p_action:'snapshot',p_data:{documentId,...(aiResultId?{aiResultId}:{})}},z.object({documentId:id,snapshot:reviewHash,sourceSnapshot:reviewHash.nullable(),values:z.array(valueRow)}).strict());
 if(result.success&&(result.data?.documentId!==documentId||result.data.values.some(v=>v.document_id!==documentId)||(aiResultId&&!result.data.sourceSnapshot)))return {success:false as const,uncertain:true,error:uncertain};
 return result;
}

export async function saveReviewedMetadata(documentId:number,values:unknown[],review?:{requestId:string;snapshot:string}){
 const input=z.object({documentId:id,values:z.array(z.object({definition_id:id,value_text:z.string().nullable().optional(),value_number:z.number().finite().nullable().optional(),value_date:z.string().nullable().optional(),value_datetime:z.string().nullable().optional(),value_boolean:z.boolean().nullable().optional(),value_json:z.unknown().optional()}).strict()).max(250),requestId:key,snapshot:reviewHash}).strict().safeParse({documentId,values,...review});
 if(!input.success)return {success:false as const,error:'Reload metadata and retain the review identity before saving.'};
 const r=await reviewedCall('f07_metadata_operation',{p_action:'save',p_data:input.data},z.object({documentId:id,savedCount:z.number().int().nonnegative(),requestId:key,snapshot:reviewHash}).strict());
 if(r.success&&(r.data?.documentId!==documentId||r.data.requestId!==review?.requestId||r.data.savedCount!==values.length))return {success:false as const,uncertain:true,error:uncertain};
 return r;
}

const proposal=z.object({sourceType:z.enum(['extraction_result','validation_finding','entity_match_candidate','dms_metadata_apply']),sourceId:id.nullable(),sourceFieldCode:z.string().nullable(),targetTable:z.enum(['dms_documents','dms_document_metadata_values']),targetField:z.string(),targetRecordId:id,targetDisplayLabel:z.string(),currentValue:z.string().nullable().optional(),currentValueSummary:z.string().nullable(),proposedValueSummary:z.string().nullable(),valueType:z.enum(['text','date','number','boolean','bigint']),confidence:z.number().nullable(),requiresConfirmation:z.boolean(),conflictRisk:z.boolean(),proposedValue:z.string().max(16000)});
export async function previewDmsUpdate(documentId:number,items:ApplyItemProposal[]){
 if(!id.safeParse(documentId).success||items.length<1||items.length>50)return {success:false as const,error:'Invalid document review.'};
 return reviewedCall('f07_dms_apply',{p_action:'preview',p_data:{documentId,items}},z.object({documentId:z.literal(documentId),snapshot:reviewHash,items:z.array(proposal).min(1).max(50)}).strict());
}

export async function prepareDmsUpdate(input:CreateApplyRunInput){
 if(!key.safeParse(input.requestId).success||!reviewHash.safeParse(input.reviewedSnapshot).success||!id.safeParse(input.documentId).success)return {success:false as const,error:'Load and confirm the complete current review before applying.'};
 return reviewedCall('f07_dms_apply',{p_action:'prepare',p_data:{documentId:input.documentId,requestId:input.requestId,snapshot:input.reviewedSnapshot,items:input.items}},z.object({runId:id,runCode:z.literal(`APPLY-${input.requestId}`)}).strict());
}
const appliedItem=z.object({itemId:id,targetTable:z.enum(['dms_documents','dms_document_metadata_values']),targetField:z.string(),targetRecordId:id,status:z.enum(['applied','skipped']),appliedValueSummary:z.string().nullable(),skipReason:z.string().nullable(),failureReason:z.null()}).strict();
export async function executeDmsUpdate(runId:number,confirmation:ApplyRunConfirmation):Promise<ActionResult<ApplyRunResult>>{
 if(!id.safeParse(runId).success||!confirmation.humanReviewConfirmed||!confirmation.confirmedItemIds.length||new Set(confirmation.confirmedItemIds).size!==confirmation.confirmedItemIds.length)return {success:false,error:'Invalid confirmed review.'};
 const r=await reviewedCall('f07_dms_apply',{p_action:'apply',p_data:{runId,...confirmation}},z.object({runId:z.literal(runId),runCode:z.string(),status:z.enum(['completed','completed_with_warnings']),appliedCount:z.number().int().nonnegative(),skippedCount:z.number().int().nonnegative(),conflictCount:z.literal(0),failedCount:z.literal(0),items:z.array(appliedItem),errorMessage:z.null()}).strict());
 if(r.success&&r.data&&(r.data.appliedCount!==r.data.items.filter(i=>i.status==='applied').length||r.data.skippedCount!==r.data.items.filter(i=>i.status==='skipped').length||new Set(r.data.items.map(i=>i.itemId)).size!==r.data.items.length||r.data.items.some(i=>(i.status==='applied')!==confirmation.confirmedItemIds.includes(i.itemId))||confirmation.confirmedItemIds.some(id=>!r.data?.items.some(i=>i.itemId===id))))return {success:false,uncertain:true,error:uncertain};
 return r;
}
export async function cancelDmsUpdate(runId:number):Promise<ActionResult<void>>{
 const r=await reviewedCall('f07_dms_apply',{p_action:'cancel',p_data:{runId}},z.object({cancelled:z.literal(true)}).strict());
 return r.success?{success:true}:{success:false,uncertain:r.uncertain,error:r.error,errorCode:r.errorCode};
}
const correctionSource=z.object({originalApplyItemId:id,originalApplyRunId:id,documentId:id,targetModule:z.enum(['dms_document','dms_metadata']),targetTable:z.enum(['dms_documents','dms_document_metadata_values']),targetField:z.string(),targetRecordId:id,targetDisplayLabel:z.string().nullable(),valueType:z.enum(['text','date','number','boolean','bigint']),originalBeforeSummary:z.string().nullable(),originalAppliedSummary:z.string().nullable(),currentValue:z.string().nullable().optional(),currentValueSummary:z.string().nullable(),restorePreviousEnabled:z.boolean(),restorePreviousWarning:z.string().nullable(),originalBeforeValue:z.string().nullable(),originalAppliedValue:z.string().nullable(),reapplyAvailable:z.boolean(),reviewedSnapshot:reviewHash}).strict();
export async function readDmsCorrection(originalApplyItemId:number):Promise<ActionResult<CorrectionSourceData>>{
 if(!id.safeParse(originalApplyItemId).success)return {success:false,error:'Invalid applied item.'};
 return reviewedCall('f07_dms_apply',{p_action:'correction_source',p_data:{originalApplyItemId}},correctionSource.refine(v=>v.originalApplyItemId===originalApplyItemId));
}
export async function runDmsCorrection(action:'prepare'|'apply'|'cancel',data:Record<string,unknown>){
 const expected=action==='prepare'?'draft':action==='apply'?'applied':'cancelled';
 if(action==='prepare'&&(!key.safeParse(data.requestId).success||!reviewHash.safeParse(data.snapshot).success))return {success:false as const,error:'Reload this correction and retain its complete review.'};
 return reviewedCall('f07_dms_apply',{p_action:`correction_${action}`,p_data:data},z.object({proposalId:action==='prepare'?id:z.literal(data.proposalId as number),status:z.literal(expected)}).strict());
}

export async function applyReviewedAiMetadata(input:{documentId:number;aiResultId:number;requestId?:string;snapshot?:string;sourceSnapshot?:string;selections:unknown[];confirmation:unknown}){
 const parsed=z.object({documentId:id,aiResultId:id,requestId:key,snapshot:reviewHash,sourceSnapshot:reviewHash,selections:z.array(z.object({definitionId:id,fieldCode:z.string().min(1),applyMode:z.enum(['fill_missing_only','replace_selected']),expectedCurrentValue:z.string().nullable().optional(),expectedUpdatedAt:z.string().nullable().optional()}).strict()).min(1).max(50),confirmation:z.object({replaceExistingConfirmed:z.boolean(),lowConfidenceConfirmed:z.boolean()}).strict()}).strict().safeParse(input);
 if(!parsed.success)return {success:false as const,error:'Reload the AI metadata review and retain its request identity.'};
 return reviewedCall('f07_ai_metadata_apply',{p_data:parsed.data},z.object({documentId:z.literal(input.documentId),requestId:z.literal(parsed.data.requestId),appliedCount:z.literal(input.selections.length),skippedCount:z.literal(0),appliedFields:z.array(z.string()).length(input.selections.length),skippedFields:z.array(z.object({fieldCode:z.string(),reason:z.string()})).length(0),aiResultStatus:z.enum(['accepted','partially_accepted'])}).strict());
}
