import 'server-only';
import {z} from 'zod';
import {getAuthContext,hasGlobalPermission} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import {hrSettingsSchemas,hrLookupSaveReceipt,type HrSettingsTable} from '@/lib/hr/settings-save-contract';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';
const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/).nullable()}).strict();
export async function saveHrLookup(table:HrSettingsTable,id:number|null,input:unknown,contract?:WorkspaceSaveContract,action:'save'|'archive'|'restore'='save'):Promise<WorkspaceSaveResult>{
 let started=false;
 try{
  const ctx=await getAuthContext();
  if(!hasGlobalPermission(ctx,'hr.settings.manage')&&!hasGlobalPermission(ctx,'hr.admin'))return {success:false,error:'Global HR configuration permission is required to change shared HR settings.'};
  const c=contractSchema.safeParse(contract);
  if(!c.success||(id===null&&c.data.revision!==null)||(id!==null&&(!Number.isSafeInteger(id)||id<1||c.data.revision===null)))return {success:false,error:'Reopen this record before saving. Its save identity or revision is unavailable.'};
  const parsed=(action!=='save'?z.object({}).strict():id===null?hrSettingsSchemas[table]:hrSettingsSchemas[table].partial()).safeParse(input);
  if(!parsed.success)return {success:false,error:'Check the entered values. Use a name, whole sort order, valid configuration fields and the original code.'};
  if(table==='hr_training_types'&&action==='save'){
   const values=parsed.data as {is_active?:boolean;training_category_id?:number|null};
   if((id===null&&values.is_active!==false||values.is_active===true&&Object.hasOwn(values,'training_category_id'))&&values.training_category_id==null)return {success:false,error:'Choose a training category before saving an active training type.'};
  }
  const client=await createClient();started=true;
  const {data,error}=await client.rpc('save_hr_lookup',{p_table:table,p_id:id,p_operation:c.data.operationId,p_revision:c.data.revision,p_data:parsed.data,p_action:action});
  if(error){
   if(table==='hr_training_types'&&error.code==='23503'&&error.message==='Choose an active HR catalogue record')return {success:false,uncertain:false,error:'Choose a training category that is active. Reload the category choices before saving.'};
   if(table==='hr_training_types'&&error.code==='23514'&&error.message==='Choose an active training category before saving this training type')return {success:false,uncertain:false,error:'Choose a training category that is active. Reload the category choices before saving.'};
   if(table==='hr_training_types'&&error.code==='23514'&&error.message?.includes('hr_training_types_active_category_required'))return {success:false,uncertain:false,error:'Choose a training category before saving or activating this training type.'};
   const messages:Record<string,string>={PT404:'This HR record is no longer available. Reopen the list to check it.',PT409:'This record changed after you opened it. Your entries are retained; reopen and compare before saving.',
    '42501':'You no longer have permission to change shared HR settings.','23505':'This HR record identity already exists. No existing record was replaced.',
    '23503':'A selected record is unavailable, or current records still use this setting. Check dependencies before retiring it; history is retained.'};
   if(typeof error.code==='string'&&error.code.length===5&&Object.hasOwn(messages,error.code))return {success:false,error:messages[error.code]};
   const rejected=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   return {success:false,uncertain:!rejected,error:rejected?'The change was rejected. Check the values and original code.':'Save unconfirmed. Retry the same unchanged entries to recover the result.'};
  }
  const receipt=hrLookupSaveReceipt.safeParse(data);
  if(!receipt.success||receipt.data.entity!==table||(id!==null&&receipt.data.id!==id))return {success:false,uncertain:true,error:'Save response incomplete. Retry the same unchanged entries.'};
  try{revalidatePath('/admin/hr/settings','layout');}catch{/* A refresh failure cannot undo a confirmed transaction. */}
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:started,error:started?'Save unconfirmed. Retry the same unchanged entries.':'The save could not start. Check your session and retry.'};}
}
