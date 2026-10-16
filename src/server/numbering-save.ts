import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';

const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/).nullable()});
const receiptSchema=z.object({id:z.number().int().positive(),revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean()});
export async function saveNumberingMutation(id:number|null,action:'save'|'active'|'lock',payload:object,contract:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const parsed=contractSchema.safeParse(contract);
 if(!parsed.success || (id!==null && (!Number.isSafeInteger(id)||id<1||!parsed.data.revision)))
  return {success:false,error:'Reopen this rule before saving. Its save identity or revision is missing.'};
 try{
  const client=await createClient();
  const {data,error}=await client.rpc('save_numbering_rule',{p_id:id,p_action:action,p_data:payload,p_operation:parsed.data.operationId,p_revision:parsed.data.revision});
  if(error){
   if(error.code==='PT409')return {success:false,error:'This rule changed after you opened it. Your entries are retained; reopen and compare before saving.'};
   if(error.code==='PT404')return {success:false,error:'This numbering rule no longer exists.'};
   if(error.code==='42501')return {success:false,error:'You no longer have permission for this change, or the rule is locked.'};
   if(error.code==='23505')return {success:false,error:'A rule with this code already exists.'};
   const rollback=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   return {success:false,uncertain:!rollback,error:rollback?'The change was rejected. Check its format, dates and lock status; issued formats cannot be rewritten.':'Save unconfirmed. Retry the unchanged entries to recover its result.'};
  }
  const receipt=receiptSchema.safeParse(data);
  return receipt.success?{success:true,data:receipt.data}:{success:false,uncertain:true,error:'Save response incomplete. Retry the unchanged entries.'};
 }catch{return {success:false,uncertain:true,error:'Save unconfirmed. Retry the unchanged entries to recover its result.'};}
}
