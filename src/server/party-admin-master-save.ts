import 'server-only';
import {z} from 'zod';
import {getAuthContext,hasGlobalPermission} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';
import {partyAdminMasterPermission,partyAdminMasterPath,partyAdminMasterSaveReceipt,type PartyAdminMasterEntity} from '@/lib/master-data/party-admin-master-contract';

const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/).nullable()}).strict();
export async function savePartyAdminMaster(entity:PartyAdminMasterEntity,id:number|null,data:object,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const parsed=contractSchema.safeParse(contract);
 if(!parsed.success||(id!==null&&(!Number.isSafeInteger(id)||id<1||parsed.data.revision===null))||(id===null&&parsed.data.revision!==null))return {success:false,error:'Reopen this catalogue record before saving. Its save identity or revision is unavailable.'};
 let started=false;
 try{
  if(!hasGlobalPermission(await getAuthContext(),partyAdminMasterPermission[entity]))return {success:false,error:'You do not have permission to change this shared catalogue.'};
  const client=await createClient();started=true;
  const {data:raw,error}=await client.rpc('save_party_admin_master',{p_entity:entity,p_operation:parsed.data.operationId,p_id:id,p_revision:parsed.data.revision,p_data:data});
  if(error){
   if(error.code==='PT404')return {success:false,error:'Catalogue record not found. Reopen the list and check the record.'};
   if(error.code==='PT409'||error.code==='40001')return {success:false,error:'This record changed after you opened it. Your draft is retained; reopen and compare before saving.'};
   if(error.code==='42501')return {success:false,error:'You no longer have permission to change this shared catalogue.'};
   if(error.code==='23505')return {success:false,error:'This catalogue code already exists. No existing record was replaced.'};
   if(error.code==='23503')return {success:false,error:'Choose an active parent without a cycle. Before retiring a record, retire or reassign active children and assignments, and clear government-profile references. History is retained.'};
   const rollback=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01','55P03','57014'].includes(error.code)));
   return {success:false,uncertain:!rollback,error:rollback?'The catalogue change was rejected. Check its fields; codes and system flags cannot change.':'Save unconfirmed. Retry the same unchanged entries to recover the result.'};
  }
  const receipt=partyAdminMasterSaveReceipt.safeParse(raw);
  if(!receipt.success||(id!==null&&receipt.data.id!==id))return {success:false,uncertain:true,error:'Save response incomplete. Retry the same unchanged entries.'};
  try{revalidatePath(partyAdminMasterPath[entity]);revalidatePath('/admin/master-data/parties');}catch{/* Confirmed database receipt remains authoritative. */}
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:started,error:started?'Save unconfirmed. Retry the same unchanged entries.':'The save could not start. Check your session and try again.'};}
}
