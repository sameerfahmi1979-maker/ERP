import 'server-only';
import {z} from 'zod';
import {getAuthContext,hasGlobalPermission} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';
import {partyTypeSaveReceipt} from '@/lib/master-data/party-type-contract';
const saveContract=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/).nullable()}).strict();
export async function savePartyType(id:number|null,data:object,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const c=saveContract.safeParse(contract);
 if(!c.success||(id!==null&&(!Number.isSafeInteger(id)||id<1||c.data.revision===null))||(id===null&&c.data.revision!==null))return {success:false,error:'Reopen this party type before saving. Its save identity or revision is unavailable.'};
 let started=false;
 try{
  if(!hasGlobalPermission(await getAuthContext(),'master_data.parties.manage_types'))return {success:false,error:'You do not have permission to change this shared classification catalogue.'};
  const client=await createClient();started=true;
  const {data:raw,error}=await client.rpc('save_party_type',{p_operation:c.data.operationId,p_id:id,p_revision:c.data.revision,p_data:data});
  if(error){
   if(error.code==='PT404')return {success:false,error:'Party type not found. Reopen the list and check the record.'};
   if(error.code==='PT409'||error.code==='40001')return {success:false,error:'This party type changed after you opened it. Your draft is retained; reopen and compare before saving.'};
   if(error.code==='42501')return {success:false,error:'You no longer have permission to change this shared classification catalogue.'};
   if(error.code==='23505')return {success:false,error:'This party type code already exists. No existing type was replaced.'};
   if(error.code==='23503')return {success:false,error:'Active parties or assignments still use this type. Reassign or retire those links before deactivating it; history will be retained.'};
   const rollback=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   return {success:false,uncertain:!rollback,error:rollback?'The party type change was rejected. Check its fields; codes and system flags cannot change.':'Save unconfirmed. Retry the same unchanged entries to recover the result.'};
  }
  const receipt=partyTypeSaveReceipt.safeParse(raw);
  if(!receipt.success||(id!==null&&receipt.data.id!==id))return {success:false,uncertain:true,error:'Save response incomplete. Retry the same unchanged entries.'};
  try{revalidatePath('/admin/master-data/parties/types');revalidatePath('/admin/master-data/parties');}catch{/* The committed receipt is authoritative. */}
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:started,error:started?'Save unconfirmed. Retry the same unchanged entries.':'The save could not start. Check your session and try again.'};}
}
