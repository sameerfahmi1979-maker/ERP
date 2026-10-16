import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import type {ActionResult} from '@/lib/dms/apply-to-erp/types';
import type {CorrectionSourceData} from '@/lib/dms/apply-correction/types';

const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const receipt=z.object({proposalId:id,status:z.enum(['draft','applied','cancelled'])}).strict();
const source=z.object({originalApplyItemId:id,originalApplyRunId:id,documentId:id,partyId:id,targetModule:z.literal('party'),targetTable:z.enum(['party_licenses','party_tax_registrations']),targetField:z.string(),targetRecordId:id,targetDisplayLabel:z.string().nullable(),valueType:z.enum(['text','date']),reviewedRevision:z.string().regex(/^[1-9]\d*$/),originalBeforeSummary:z.string().nullable(),originalAppliedSummary:z.string().nullable(),currentValueSummary:z.string().nullable(),originalBeforeValue:z.string().nullable(),originalAppliedValue:z.string().nullable(),restorePreviousEnabled:z.boolean(),restorePreviousWarning:z.string().nullable(),reapplyAvailable:z.boolean()}).strict();
const uncertain='The outcome is unconfirmed. Retry this same correction to recover its result; do not create another proposal.';
async function call(action:string,data:object):Promise<ActionResult<unknown>>{
 try{
  const db=await createClient(),r=await db.rpc('party_dms_correction',{p_action:action,p_data:data});
  if(r.error){const code=r.error.code??'',known=(typeof code==='string'&&code.length===5&&(/^(?:22|23|P0|42)[0-9A-Z]{3}$/.test(code)||['40000','40001','40002','40P01'].includes(code)))||code==='PT404'||code==='PT409';
   return {success:false,uncertain:!known,errorCode:code==='42501'?'permission_denied':code==='PT409'?'conflict_detected':code==='PT404'?'original_item_not_found':'server_error',error:code==='42501'?'You do not have the required document and party correction access, or the feature is disabled.':code==='PT409'?'The correction or reviewed record changed. Refresh and review it again.':code==='PT404'?'The original applied record is no longer available.':known?'The correction was rejected. No change was committed.':uncertain};
  }
  return {success:true,data:r.data};
 }catch{return {success:false,uncertain:true,error:uncertain,errorCode:'server_error'};}
}
export const isPartyCorrectionTarget=(table:string)=>table==='party_licenses'||table==='party_tax_registrations';
export async function loadPartyCorrectionSource(itemId:number):Promise<ActionResult<CorrectionSourceData>>{
 if(!id.safeParse(itemId).success)return {success:false,error:'Invalid applied record.',errorCode:'invalid_input'};
 const r=await call('source',{originalApplyItemId:itemId});if(!r.success)return r as ActionResult<CorrectionSourceData>;
 const parsed=source.safeParse(r.data);return parsed.success&&parsed.data.originalApplyItemId===itemId?{success:true,data:parsed.data}:{success:false,error:'The correction source could not be verified.',errorCode:'server_error'};
}
export async function runPartyCorrection(action:'prepare'|'apply'|'cancel',data:Record<string,unknown>):Promise<ActionResult<z.infer<typeof receipt>>>{
 if(action==='prepare'&&!z.uuid().safeParse(data.requestId).success)return {success:false,error:'Reload this correction to start a tracked review.',errorCode:'invalid_input'};
 if(action!=='prepare'&&!id.safeParse(data.proposalId).success)return {success:false,error:'Invalid correction.',errorCode:'invalid_input'};
 const r=await call(action,data);if(!r.success)return r as ActionResult<z.infer<typeof receipt>>;
 const parsed=receipt.safeParse(r.data),status=action==='prepare'?'draft':action==='apply'?'applied':'cancelled';
 return parsed.success&&parsed.data.status===status&&(action==='prepare'||parsed.data.proposalId===data.proposalId)?{success:true,data:parsed.data}:{success:false,uncertain:true,error:uncertain,errorCode:'server_error'};
}
