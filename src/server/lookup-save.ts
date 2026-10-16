import 'server-only';
import { getAuthContext, hasGlobalPermission } from '@/lib/rbac/check';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';
import type { Json } from '@/types/database';
import {lookupCommandSchema,lookupContractSchema,verifyLookupReceipt,lookupWriteError,type LookupCommand,type LookupMutationContract,type LookupMutationResult} from '@/features/master-data/lookups/mutation-contract';

export async function saveLookupMutation(id:number|null,command:LookupCommand,contract?:LookupMutationContract):Promise<LookupMutationResult>{
 const c=lookupContractSchema.safeParse(contract),cmd=lookupCommandSchema.safeParse(command);
 if(!c.success||!cmd.success||(id!==null&&(!Number.isSafeInteger(id)||id<1||!c.data.revision))||(id===null&&c.data.revision!==null)||
  (cmd.success&&c.success&&(cmd.data.categoryId!==c.data.categoryId||cmd.data.categoryRevision!==c.data.categoryRevision)))
  return {success:false,error:'Reopen this lookup before saving. Its original identity or revision is unavailable.'};
 let dispatched=false;
 try{
  const ctx=await getAuthContext();
  if(!hasGlobalPermission(ctx,command.action==='lock'?'master_data.lookups.lock':'master_data.lookups.manage'))return {success:false,...lookupWriteError('42501')};
  const client=await createClient();dispatched=true;
  const {data,error}=await client.rpc('save_lookup_configuration',{
   p_kind:command.kind,p_action:command.action,p_id:id,p_revision:c.data.revision,
   p_category_id:command.categoryId,p_category_revision:command.categoryRevision,p_operation:c.data.operationId,p_data:command.data as Json,
  });
  if(error)return {success:false,...lookupWriteError(error.code)};
  let receipt;
  try{receipt=verifyLookupReceipt(data,id,command,c.data);}catch{return {success:false,uncertain:true,error:'The save response could not be verified. Retry the original unchanged request.'};}
  let refreshWarning=false;
  try{for(const path of ['/admin/master-data','/admin/master-data/lookups/categories','/admin/master-data/lookups/values','/admin/master-data/lookups/system'])revalidatePath(path);}catch{refreshWarning=true;}
  return {success:true,data:receipt,refreshWarning};
 }catch{return {success:false,uncertain:dispatched,error:dispatched?'Save unconfirmed. Retry the original unchanged request.':'The save could not start. Check your session and try again.'};}
}
