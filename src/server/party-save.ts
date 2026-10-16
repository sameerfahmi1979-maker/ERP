import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {getAuthContext,hasGlobalPermission} from '@/lib/rbac/check';
import {revalidatePath} from 'next/cache';
import {partySaveReceipt,type PartySaveReceipt} from '@/lib/master-data/party-save-contract';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {ActionResult} from '@/features/master-data/parties/party-types';

const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/)}).strict();
export async function savePartyRecord(id:number,data:object,contract?:WorkspaceSaveContract):Promise<ActionResult<PartySaveReceipt>>{
 return mutateParty(id,data,contract,'save');
}
export async function changePartyState(id:number,action:'active'|'types',data:object,contract?:WorkspaceSaveContract):Promise<ActionResult<PartySaveReceipt>>{
 const valid=action==='active'?z.object({is_active:z.boolean(),reason:z.string().max(1000).nullable()}).strict():
  z.object({selected:z.array(z.number().int().positive().max(Number.MAX_SAFE_INTEGER)).max(100),primary:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullable()}).strict()
   .refine(v=>new Set(v.selected).size===v.selected.length&&(v.primary===null||v.selected.includes(v.primary)));
 if(!valid.safeParse(data).success)return {success:false,error:'Check the party status or type selection before saving.'};
 return mutateParty(id,data,contract,action);
}
async function mutateParty(id:number,data:object,contract:WorkspaceSaveContract|undefined,action:'save'|'active'|'types'):Promise<ActionResult<PartySaveReceipt>>{
 const c=contractSchema.safeParse(contract);
 if(!c.success||!Number.isSafeInteger(id)||id<1)return {success:false,error:'Reopen this party before saving. Its revision or save identity is unavailable.'};
 let dispatched=false;
 try{
  const ctx=await getAuthContext();
  const canChange=action==='save'?(hasGlobalPermission(ctx,'master_data.parties.edit')||hasGlobalPermission(ctx,'master_data.party_master.manage')):
   hasGlobalPermission(ctx,action==='active'?'master_data.parties.deactivate':'master_data.parties.manage_types');
  if(!canChange
   ||!(hasGlobalPermission(ctx,'master_data.parties.view')||hasGlobalPermission(ctx,'master_data.party_master.view')))
   return {success:false,error:'You do not have permission to change this shared party catalogue.'};
  const client=await createClient();dispatched=true;
  const {data:raw,error}=await client.rpc(action==='save'?'save_party_record':'change_party_state',{p_operation:c.data.operationId,p_id:id,p_revision:c.data.revision,p_data:data,...(action==='save'?{}:{p_action:action})});
  if(error){
   const rollback=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   const message=error.code==='PT404'?'Party not found. Reopen the list and check the record.':
    error.code==='PT409'||error.code==='40001'?'This party changed after you opened it. Your draft is retained; reopen and compare before saving.':
    error.code==='42501'?'This party is locked or you no longer have permission to edit it.':
    error.code==='PT422'?'Existing type assignments are inconsistent and need administrator review. No changes were saved.':
    error.code==='23503'?'A selected reference is unavailable or active child parties depend on this record. Check the relationships before saving.':
    rollback?'The change was rejected. Check the fields; no party change was committed.':'Save unconfirmed. Retry the same unchanged entries to recover the result.';
   return {success:false,uncertain:!rollback,error:message};
  }
  const receipt=partySaveReceipt.safeParse(raw);
  if(!receipt.success||receipt.data.id!==id)return {success:false,uncertain:true,error:'Save response incomplete. Retry the same unchanged entries.'};
  try{revalidatePath('/admin/master-data/parties');}catch{/* A confirmed commit must not be retried as a new change. */}
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:dispatched,error:dispatched?'Save unconfirmed. Retry the same unchanged entries.':'The save could not start. Check your session and try again.'};}
}
