import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';
import {invalidateCommittedBranding} from '@/server/branding-invalidation';

const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/).nullable()});
const receiptSchema=z.object({id:z.number().int().positive(),revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean(),owner_company_id:z.number().int().positive().nullable()});

/** Session-bound transaction owns scope, concurrency, audit and replay together. */
export async function saveBrandingMutation(kind:'app'|'report',id:number|null,payload:object,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const parsed=contractSchema.safeParse(contract);
 if(!parsed.success || (id!==null && (!Number.isSafeInteger(id)||id<1||!parsed.data.revision)) || (id===null && (parsed.data.revision!==null||kind==='app')))
  return {success:false,error:'Reopen branding before saving. Its save identity or revision is missing.'};
 try{
  const client=await createClient();
  const {data,error}=await client.rpc('save_branding_configuration',{p_kind:kind,p_id:id,p_data:payload,p_operation:parsed.data.operationId,p_revision:parsed.data.revision});
  if(error){
   if(error.code==='PT409')return {success:false,error:'Branding changed after you opened it. Your entries are retained; reopen and compare before saving.'};
   if(error.code==='42501')return {success:false,error:'Branding is unavailable or you lack authority for its company. Signatory changes require separate signing permission.'};
   if(error.code==='23505')return {success:false,error:'This branding code already exists. The previous company default was preserved.'};
   if(error.code==='23503')return {success:false,error:'Choose an active, authorized issuing company before saving.'};
   if(error.code==='22023')return {success:false,error:'Check branding values and ownership. Use governed image uploads; choose a replacement before retiring a company default.'};
   const rollback=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   return {success:false,uncertain:!rollback,error:rollback?'The change was rolled back. Previous branding is preserved.':'Save unconfirmed. Retry the unchanged entries to recover its result.'};
  }
  const receipt=receiptSchema.safeParse(data);
  if(!receipt.success)return {success:false,uncertain:true,error:'Save response incomplete. Retry the unchanged entries.'};
  // Confirmed receipts, including recovered requests, stay successful even if
  // UI refresh fails. The editor rereads before announcing completion.
  if(receipt.data.changed)try{invalidateCommittedBranding(kind,receipt.data.owner_company_id);}catch{/* authoritative commit retained */}
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:true,error:'Save unconfirmed. Retry the unchanged entries to recover its result.'};}
}
