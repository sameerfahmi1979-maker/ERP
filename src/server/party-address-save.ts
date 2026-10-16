import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {getAuthContext,hasGlobalPermission} from '@/lib/rbac/check';
import {revalidatePath} from 'next/cache';
import {partySaveReceipt,type PartySaveReceipt} from '@/lib/master-data/party-save-contract';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {ActionResult} from '@/features/master-data/parties/party-types';

const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/)}).strict();
export async function savePartyAddress(id:number,data:object,contract?:WorkspaceSaveContract):Promise<ActionResult<PartySaveReceipt>>{
 const c=contractSchema.safeParse(contract);
 if(!c.success||!Number.isSafeInteger(id)||id<1)return {success:false,error:'Reopen this address before saving. Its revision or save identity is unavailable.'};
 let dispatched=false;
 try{
  const ctx=await getAuthContext();
  if(!hasGlobalPermission(ctx,'master_data.parties.view')||!hasGlobalPermission(ctx,'master_data.parties.manage_addresses'))
   return {success:false,error:'You do not have permission to change addresses in the shared party catalogue.'};
  const client=await createClient();dispatched=true;
  const {data:raw,error}=await client.rpc('save_party_address',{p_operation:c.data.operationId,p_id:id,p_revision:c.data.revision,p_data:data});
  if(error){
   const rollback=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   const message=error.code==='PT404'?'Address not found. Reopen the list and check the record.':
    error.code==='PT409'||error.code==='40001'?'This address changed after you opened it. Your draft is retained; reopen and compare before saving.':
    error.code==='42501'?'The party is unavailable or you no longer have permission to edit this address.':
    error.code==='23503'?'A selected reference is unavailable. Check the party, address type and geography before saving.':
    rollback?'The change was rejected. Check the fields; no address change was committed.':'Save unconfirmed. Retry the same unchanged entries to recover the result.';
   return {success:false,uncertain:!rollback,error:message};
  }
  const receipt=partySaveReceipt.safeParse(raw);
  if(!receipt.success||receipt.data.id!==id)return {success:false,uncertain:true,error:'Save response incomplete. Retry the same unchanged entries.'};
  try{revalidatePath('/admin/master-data/parties');}catch{/* A confirmed commit remains a success if cache refresh fails. */}
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:dispatched,error:dispatched?'Save unconfirmed. Retry the same unchanged entries.':'The save could not start. Check your session and try again.'};}
}
