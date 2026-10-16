import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import type {ActionResult,ApplyRunConfirmation,ApplyRunResult,CreateApplyRunInput} from '@/lib/dms/apply-to-erp/types';

const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const prepared=z.object({runId:id,runCode:z.string().startsWith('APPLY-')}).strict();
const item=z.object({itemId:id,targetTable:z.enum(['party_licenses','party_tax_registrations']),targetField:z.string(),targetRecordId:id,status:z.enum(['applied','skipped']),appliedValueSummary:z.string().max(200).nullable(),skipReason:z.string().nullable(),failureReason:z.null()}).strict();
const applied=z.object({runId:id,runCode:z.string(),status:z.enum(['completed','completed_with_warnings']),appliedCount:z.number().int().nonnegative(),skippedCount:z.number().int().nonnegative(),conflictCount:z.literal(0),failedCount:z.literal(0),items:z.array(item),errorMessage:z.null()}).strict();
const reviewItem=z.object({targetRecordId:id,targetTable:z.enum(['party_licenses','party_tax_registrations']),targetField:z.string(),reviewedRevision:z.string().regex(/^[1-9]\d*$/),proposedValue:z.string().min(1).max(1000)});
const uncertain='The outcome is unconfirmed. Retry this same review to recover its result; do not create another review.';
async function call(action:string,data:object):Promise<ActionResult<unknown>>{
 try{const db=await createClient();const r=await db.rpc('party_dms_apply',{p_action:action,p_data:data});
  if(r.error){
   const code=r.error.code??'';
   const known=(typeof code==='string'&&code.length===5&&(/^(?:22|23|P0|42)[0-9A-Z]{3}$/.test(code)||['40000','40001','40002','40P01'].includes(code)))||code==='PT409'||code==='PT404';
   return {success:false,uncertain:!known,
    errorCode:code==='42501'?'permission_denied':code==='PT409'?'conflict_detected':code==='PT404'?'target_record_not_found':'server_error',
    error:code==='42501'?'You do not have the required document and party access, or this feature is disabled.':code==='PT409'?'The review or selected record changed. Refresh and review it again.':code==='PT404'?'The selected record is no longer available. Refresh and choose an available record.':known?'The reviewed values were rejected. No change was committed.':uncertain};
  }
  return {success:true,data:r.data};
 }catch{return {success:false,uncertain:true,error:uncertain,errorCode:'server_error'};}
}
export async function preparePartyDmsRun(input:CreateApplyRunInput):Promise<ActionResult<{runId:number;runCode:string}>>{
 const key=z.uuid().safeParse(input.requestId),items=z.array(reviewItem).min(1).max(6).safeParse(input.items);
 if(!key.success||!items.success||!id.safeParse(input.documentId).success||!id.safeParse(input.partyId).success||input.targetTable!==input.targetKind)return {success:false,error:'Select the live target record and review its full proposed values again.',errorCode:'invalid_input'};
 const first=items.data[0];
 if(items.data.some(i=>i.targetTable!==input.targetKind||i.targetRecordId!==first.targetRecordId||i.reviewedRevision!==first.reviewedRevision)||new Set(items.data.map(i=>i.targetField)).size!==items.data.length)return {success:false,error:'Each field must refer to the same reviewed record and revision.',errorCode:'invalid_input'};
 const r=await call('prepare',{requestId:key.data,documentId:input.documentId,partyId:input.partyId,targetTable:input.targetKind,targetId:first.targetRecordId,revision:first.reviewedRevision,fields:Object.fromEntries(items.data.map(i=>[i.targetField,i.proposedValue])),sourceType:input.sourceType,sourceId:input.sourceId});
 if(!r.success)return {success:false,uncertain:r.uncertain,error:r.error,errorCode:r.errorCode};const parsed=prepared.safeParse(r.data);
 return parsed.success&&parsed.data.runCode===`APPLY-${key.data}`?{success:true,data:parsed.data}:{success:false,uncertain:true,error:uncertain,errorCode:'server_error'};
}
export async function executePartyDmsRun(runId:number,confirmation:ApplyRunConfirmation):Promise<ActionResult<ApplyRunResult>>{
 if(!id.safeParse(runId).success)return {success:false,error:'Invalid review identity.',errorCode:'invalid_input'};
 const r=await call('apply',{runId,...confirmation});if(!r.success)return {success:false,uncertain:r.uncertain,error:r.error,errorCode:r.errorCode};const parsed=applied.safeParse(r.data);
 if(!parsed.success||parsed.data.runId!==runId||parsed.data.appliedCount!==parsed.data.items.filter(i=>i.status==='applied').length||parsed.data.skippedCount!==parsed.data.items.filter(i=>i.status==='skipped').length||new Set(parsed.data.items.map(i=>i.itemId)).size!==parsed.data.items.length||parsed.data.items.some(i=>(i.status==='applied')!==confirmation.confirmedItemIds.includes(i.itemId))||confirmation.confirmedItemIds.some(id=>!parsed.data.items.some(i=>i.itemId===id)))return {success:false,uncertain:true,error:uncertain,errorCode:'server_error'};
 return {success:true,data:parsed.data};
}
export async function cancelPartyDmsRun(runId:number):Promise<ActionResult<void>>{
 if(!id.safeParse(runId).success)return {success:false,error:'Invalid review identity.',errorCode:'invalid_input'};
 const r=await call('cancel',{runId});if(!r.success)return {success:false,uncertain:r.uncertain,error:r.error,errorCode:r.errorCode};
 return z.object({cancelled:z.literal(true)}).strict().safeParse(r.data).success?{success:true}:{success:false,uncertain:true,error:uncertain,errorCode:'server_error'};
}
