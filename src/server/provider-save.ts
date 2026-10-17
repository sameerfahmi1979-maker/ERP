import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';

const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/).nullable()});
const receiptSchema=z.object({id:z.number().int().positive(),revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean()});
export async function saveProviderMutation(kind:'email'|'ai',id:number|null,action:'save'|'default'|'archive',payload:object,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const parsed=contractSchema.safeParse(contract);
 if(!parsed.success || (id!==null && (!Number.isSafeInteger(id)||id<1||!parsed.data.revision)) || (id===null && parsed.data.revision!==null))
  return {success:false,error:'Reopen this provider before saving. Its save identity or revision is missing.'};
 try{
  const client=await createClient();
  const {data,error}=await client.rpc('save_provider_configuration',{p_kind:kind,p_id:id,p_action:action,p_data:payload,p_operation:parsed.data.operationId,p_revision:parsed.data.revision});
  if(error){
   if(error.code==='PT409')return {success:false,error:'This configuration changed after you opened it. Your entries are retained; reopen and compare before saving.'};
   if(error.code==='PT404')return {success:false,error:'This provider was removed or no longer exists.'};
   if(error.code==='42501')return {success:false,error:'Global provider management is required. Changing a credential-bound destination also requires credential administration.'};
   if(error.code==='23505')return {success:false,error:'A provider with this code already exists. The previous default was preserved.'};
   // Only fixed local validation messages are exposed; never arbitrary provider,
   // SQL, secret, endpoint, row, or transport exception text.
   if(error.code==='22023')return {success:false,error:'Configuration rejected. Check required fields, supported endpoints and modes. Set a replacement before retiring a default; store credentials separately.'};
   const rollback=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   return {success:false,uncertain:!rollback,error:rollback?'The change was rolled back; the previous configuration is preserved.':'Save unconfirmed. Retry the unchanged entries to recover its result.'};
  }
  const receipt=receiptSchema.safeParse(data);
  return receipt.success?{success:true,data:receipt.data}:{success:false,uncertain:true,error:'Save response incomplete. Retry the unchanged entries.'};
 }catch{return {success:false,uncertain:true,error:'Save unconfirmed. Retry the unchanged entries to recover its result.'};}
}

export async function saveProviderFlagMutation(kind:'email'|'ai',code:string,payload:object,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const parsed=contractSchema.safeParse(contract);
 if(!parsed.success||!parsed.data.revision||typeof code!=='string'||!code.length||code.length>100)return {success:false,error:'Reopen settings before changing this flag. Its save identity or revision is missing.'};
 try{
  const client=await createClient();
  const {data,error}=await client.rpc('save_provider_feature_flag',{p_kind:kind,p_code:code,p_data:payload,p_operation:parsed.data.operationId,p_revision:parsed.data.revision});
  if(error){
   if(error.code==='PT409')return {success:false,error:'This flag changed. Refresh and compare before applying another change.'};
   if(error.code==='PT404')return {success:false,error:'This feature flag no longer exists.'};
   if(error.code==='42501')return {success:false,error:'Global feature administration permission is required.'};
   const rollback=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   return {success:false,uncertain:!rollback,error:rollback?'Flag change rejected. Use typed supported values; DMS human review cannot be disabled without separate approval.':'Flag change unconfirmed. Retry the same operation to recover its result.'};
  }
  const receipt=receiptSchema.safeParse(data);
  return receipt.success?{success:true,data:receipt.data}:{success:false,uncertain:true,error:'Flag response incomplete. Retry the unchanged operation.'};
 }catch{return {success:false,uncertain:true,error:'Flag change unconfirmed. Retry the unchanged operation to recover its result.'};}
}
