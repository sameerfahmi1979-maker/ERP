import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {getAuthContext,hasGlobalPermission} from '@/lib/rbac/check';
import {revalidatePath} from 'next/cache';
import {partySaveReceipt,type PartySaveReceipt} from '@/lib/master-data/party-save-contract';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {ActionResult} from '@/features/master-data/parties/party-types';
const permissions={party_contacts:'master_data.parties.manage_contacts',party_bank_details:'master_data.parties.manage_bank_details',party_licenses:'master_data.parties.manage_licenses',party_tax_registrations:'master_data.parties.manage_tax',party_documents:'master_data.parties.manage_documents',party_notes:'master_data.parties.edit'} as const;
export type PartyChildEntity=keyof typeof permissions;
const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/)}).strict();
export async function verifyPartyBank(id:number,contract?:WorkspaceSaveContract):Promise<ActionResult<PartySaveReceipt>>{
 const c=contractSchema.safeParse(contract);
 if(!c.success||!Number.isSafeInteger(id)||id<1)return {success:false,error:'Reopen the bank details before verifying. The reviewed revision is unavailable.'};
 let dispatched=false;
 try{
  const ctx=await getAuthContext();
  if(!hasGlobalPermission(ctx,'master_data.parties.verify_bank_details')||
   !(hasGlobalPermission(ctx,'master_data.parties.view_bank_details')||hasGlobalPermission(ctx,'master_data.parties.manage_bank_details')))
   return {success:false,error:'You need permission to view and verify these shared bank details.'};
  const client=await createClient();dispatched=true;
  const {data,error}=await client.rpc('verify_party_bank_record',{p_operation:c.data.operationId,p_id:id,p_revision:c.data.revision});
  if(error){
   const rollback=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   return {success:false,uncertain:!rollback,error:error.code==='PT404'?'Bank details not found. Reopen the list.':
    error.code==='PT409'||error.code==='40001'?'These bank details changed after your review. Reopen and review them before verifying.':
    error.code==='42501'?'These bank details are unavailable or your verification permission has changed.':
    rollback?'Verification was rejected. No verification change was committed.':'Verification unconfirmed. Retry this same review to recover its result.'};
  }
  const receipt=partySaveReceipt.safeParse(data);
  if(!receipt.success||receipt.data.id!==id)return {success:false,uncertain:true,error:'Verification response incomplete. Retry this same review.'};
  try{revalidatePath('/admin/master-data/parties');}catch{/* A confirmed verification remains successful. */}
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:dispatched,error:dispatched?'Verification unconfirmed. Retry this same review.':'Verification could not start. Check your session and try again.'};}
}
export async function savePartyChild(entity:PartyChildEntity,id:number,data:object,contract?:WorkspaceSaveContract):Promise<ActionResult<PartySaveReceipt>>{
 const c=contractSchema.safeParse(contract);
 if(!Object.hasOwn(permissions,entity)||!c.success||!Number.isSafeInteger(id)||id<1)return {success:false,error:'Reopen this record before saving. Its revision or save identity is unavailable.'};
 let dispatched=false;
 try{
  const ctx=await getAuthContext();
  // Bank management grants its own read capability. Private-note authorship
  // and public/private SELECT requirements are checked against the locked row.
  if(!hasGlobalPermission(ctx,permissions[entity])||(!['party_bank_details','party_notes'].includes(entity)&&!hasGlobalPermission(ctx,'master_data.parties.view')))
   return {success:false,error:'You do not have permission to change this shared party record.'};
  const client=await createClient();dispatched=true;
  const {data:raw,error}=await client.rpc('save_party_child_record',{p_entity:entity,p_operation:c.data.operationId,p_id:id,p_revision:c.data.revision,p_data:data});
  if(error){
   const rollback=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   const message=error.code==='PT404'?'Record not found. Reopen the list and check the record.':
    error.code==='PT409'||error.code==='40001'?'This record changed after you opened it. Your draft is retained; reopen and compare before saving.':
    error.code==='42501'?'The record is unavailable or you no longer have permission to edit it.':
    error.code==='23503'?'A selected reference is unavailable. Check the relationships before saving.':
    rollback?'The change was rejected. Check the fields; no record change was committed.':'Save unconfirmed. Retry the same unchanged entries to recover the result.';
   return {success:false,uncertain:!rollback,error:message};
  }
  const receipt=partySaveReceipt.safeParse(raw);
  if(!receipt.success||receipt.data.id!==id)return {success:false,uncertain:true,error:'Save response incomplete. Retry the same unchanged entries.'};
  try{revalidatePath('/admin/master-data/parties');}catch{/* Confirmed commit, not a new retry operation. */}
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:dispatched,error:dispatched?'Save unconfirmed. Retry the same unchanged entries.':'The save could not start. Check your session and try again.'};}
}
