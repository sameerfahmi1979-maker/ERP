import 'server-only';
import {z} from 'zod';
import {getAuthContext,hasPermission} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';
import {administrationWriteError} from '@/lib/master-data/administration-validation';

const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/).nullable()}).strict();
const receiptSchema=z.object({id:z.number().int().positive().max(Number.MAX_SAFE_INTEGER),revision:z.string().regex(/^[1-9]\d*$/),changed:z.boolean(),replayed:z.boolean()});

export async function saveAdministrationRecord(entity:'owner_companies'|'branches',id:number|null,data:object,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const c=contractSchema.safeParse(contract);
 if(!c.success||(id!==null&&(!Number.isSafeInteger(id)||id<1||!c.data.revision))||(id===null&&c.data.revision!==null))
  return {success:false,error:'Reopen this company or branch before saving. Its save identity or revision is missing.'};
 try{
  const ctx=await getAuthContext();
  if(!hasPermission(ctx,entity==='branches'?'branches.manage':'organizations.manage'))return {success:false,error:'You do not have permission to administer this record.'};
  const client=await createClient();
  const {data:raw,error}=await client.rpc('save_administration_record',{p_entity:entity,p_operation:c.data.operationId,p_id:id,p_revision:c.data.revision,p_data:data});
  if(error){
   if(error.code==='PT409'||error.code==='40001')return {success:false,error:'This record changed after you opened it. Your draft is retained. Reopen the latest record and compare before saving.'};
   if(error.code==='PT404')return {success:false,error:'This company or branch is unavailable. Reopen the list and check the record.'};
   const rolledBack=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT|55)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   return {success:false,uncertain:!rolledBack,error:rolledBack?administrationWriteError(error):'Save unconfirmed. Keep the same values and retry to recover its result.'};
  }
  const r=receiptSchema.safeParse(raw);
  if(!r.success||(id!==null&&r.data.id!==id))return {success:false,uncertain:true,error:'Save response incomplete. Retry the same values to recover its result.'};
  try{const base=entity==='branches'?'/admin/branches':'/admin/organizations';revalidatePath(base);revalidatePath(`${base}/record/${r.data.id}`);}catch{/* A cache failure cannot undo the committed receipt. */}
  return {success:true,data:r.data};
 }catch{return {success:false,uncertain:true,error:'Save unconfirmed. Keep the same values and retry safely.'};}
}
