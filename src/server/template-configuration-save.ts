import 'server-only';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';
import {templateConfigurationReceipt} from '@/lib/report-center/template-save-receipt';

const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/).nullable()}).strict();

export async function saveTemplateConfiguration(id:number|null,payload:object,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const parsed=contractSchema.safeParse(contract);
 if(!parsed.success||(id===null?parsed.data.revision!==null:!Number.isSafeInteger(id)||id<1||!parsed.data.revision))return {success:false,error:'Reopen this template before saving. Its save identity or revision is missing.'};
 try{
  const db=await createClient();
  const {data,error}=await db.rpc('save_template_configuration',{p_id:id,p_revision:parsed.data.revision,p_operation:parsed.data.operationId,p_data:payload});
  if(error){
   if(error.code==='PT409')return {success:false,error:'This template changed after you opened it. Your draft is retained; reopen and compare before saving.'};
   if(error.code==='PT404'||error.code==='42501')return {success:false,error:'Template or branding unavailable, or company/signing permission is missing.'};
   if(error.code==='23505')return {success:false,error:'This template code already exists. Check the existing record before retrying.'};
   if(error.code==='22023')return {success:false,error:'Check template values. Only drafts or rejected templates can be edited; company and code cannot change.'};
   const rollback=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   return {success:false,uncertain:!rollback,error:rollback?'The template change was rolled back. Previous data is preserved.':'Save unconfirmed. Retry the unchanged entries to recover its result.'};
  }
  const receipt=templateConfigurationReceipt.safeParse(data);
  if(!receipt.success||(id!==null&&receipt.data.id!==id))return {success:false,uncertain:true,error:'Save response incomplete. Retry the unchanged entries.'};
  if(receipt.data.changed)try{revalidatePath('/admin/reports');revalidatePath('/admin/reports/templates');revalidatePath('/admin/reports/templates/governance');}catch{/* Confirmed commit remains authoritative. */}
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:true,error:'Save unconfirmed. Retry the unchanged entries to recover its result.'};}
}
