'use server';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {getAuthContext,hasGlobalPermission} from '@/lib/rbac/check';
import {revalidatePath} from 'next/cache';
import {partySaveReceipt,type PartySaveReceipt} from '@/lib/master-data/party-save-contract';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {ActionResult} from '@/features/master-data/parties/party-types';

const permissions={party_contacts:'master_data.parties.manage_contacts',party_addresses:'master_data.parties.manage_addresses',party_bank_details:'master_data.parties.manage_bank_details',party_licenses:'master_data.parties.manage_licenses',party_tax_registrations:'master_data.parties.manage_tax',party_documents:'master_data.parties.manage_documents',party_notes:'master_data.parties.edit'} as const;
const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/)}).strict();
const receiptSchema=partySaveReceipt.extend({archived:z.boolean()});
export async function setPartyChildArchived(entity:keyof typeof permissions,id:number,archived:boolean,contract?:WorkspaceSaveContract):Promise<ActionResult<PartySaveReceipt&{archived:boolean}>>{
 const c=contractSchema.safeParse(contract);
 if(!Object.hasOwn(permissions,entity)||!Number.isSafeInteger(id)||id<1||typeof archived!=='boolean'||!c.success)
  return {success:false,error:'Reopen the record before changing its archive state.'};
 let dispatched=false;
 try{
  const ctx=await getAuthContext();
  if(!hasGlobalPermission(ctx,permissions[entity])||(!['party_bank_details','party_notes'].includes(entity)&&!hasGlobalPermission(ctx,'master_data.parties.view')))
   return {success:false,error:'You do not have permission to archive or restore this shared record.'};
  const client=await createClient();dispatched=true;
  const {data,error}=await client.rpc('set_party_child_archived',{p_entity:entity,p_id:id,p_archived:archived,p_revision:c.data.revision,p_operation:c.data.operationId});
  if(error){
   const rollback=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   return {success:false,uncertain:!rollback,error:error.code==='PT404'?'Record not found. Reopen the list.':
    error.code==='PT409'||error.code==='40001'?'This record changed. Reopen and review its latest version before continuing.':
    error.code==='42501'?'The record is unavailable or your permission has changed.':
    error.code==='23503'?(archived?'This document is still used as evidence. Replace or archive its referring records first.':'The parent or evidence is unavailable. Restore the required records first.'):
    rollback?'The archive change was rejected. No change was committed.':'Archive result unconfirmed. Retry the same action to recover its result.'};
  }
  const receipt=receiptSchema.safeParse(data);
  if(!receipt.success||receipt.data.id!==id||receipt.data.archived!==archived)return {success:false,uncertain:true,error:'Archive response incomplete. Retry the same action.'};
  try{revalidatePath('/admin/master-data/parties');}catch{/* A confirmed result remains successful. */}
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:dispatched,error:dispatched?'Archive result unconfirmed. Retry the same action.':'The archive action could not start. Check your session.'};}
}
