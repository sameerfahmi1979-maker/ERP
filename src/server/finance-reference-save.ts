import 'server-only';
import {z} from 'zod';
import {getAuthContext} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import {financeReferencePayloadSchema,financeReferencePaths,financeReferencePermissions,verifyFinanceReferenceReceipt,type FinanceReferenceEntity,type FinanceReferenceAction} from '@/lib/master-data/finance-reference-contract';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';
import {workspaceValidationFailure} from '@/lib/workspace/field-errors';
const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/).nullable()}).strict();
const entities=new Set(['banks','payment_terms','tax_types']),actions=new Set(['save','active','lock','retire']);
const fields=new Set(['bank_code','bank_name_en','bank_name_ar','short_name','country_id','bank_type_code','swift_code','website_url','contact_phone','contact_email','term_code','term_name_en','term_name_ar','due_days','advance_percentage','retention_percentage','calculation_notes','tax_code','tax_name_en','tax_name_ar','tax_rate','tax_treatment_code','effective_from','effective_to','sort_order','description_en','description_ar','notes','deactivation_reason']);
const messages=new Set(['Choose an active finance type','Choose an active country','Effective to date precedes effective from date','English name requires 2 to 255 characters','Invalid finance percentage precision','Invalid finance integer','Invalid SWIFT code','Invalid contact email','Invalid website URL','Finance text is too long']);
export async function saveFinanceReferenceRecord(entity:FinanceReferenceEntity,action:FinanceReferenceAction,id:number|null,data:Record<string,unknown>,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const c=contractSchema.safeParse(contract);
 if(!entities.has(entity)||!actions.has(action)||!c.success||(id!==null&&(!Number.isSafeInteger(id)||id<1||!c.data.revision))||(id===null&&(c.data.revision!==null||action!=='save')))
  return {success:false,error:'Reopen this finance record before saving. Its save identity or revision is missing.'};
 const parsed=financeReferencePayloadSchema(entity,action,id===null).safeParse(data);
 if(!parsed.success)return workspaceValidationFailure(parsed.error.issues);
 try{
  const ctx=await getAuthContext(),p=financeReferencePermissions(ctx);
  if(!(action==='retire'?p.retire:action==='lock'?p.lock:p.manage))return {success:false,error:'You do not have permission to change this shared finance catalogue.'};
  const client=await createClient();
  // Preserve the ORIGINAL validated bytes. Normalization belongs to the atomic
  // database operation after hashing; no new operation is minted on this server.
  const {data:raw,error}=await client.rpc('save_finance_reference_record',{p_entity:entity,p_action:action,p_id:id,p_revision:c.data.revision,p_operation:c.data.operationId,p_data:data});
  if(error){
   if(error.code==='PT409'||error.code==='40001')return {success:false,error:'This finance record changed after you opened it. Keep your draft and reopen the latest record to compare.'};
   if(error.code==='PT404')return {success:false,error:'Finance record not found. Reopen the list.'};
   if(error.code==='42501')return {success:false,error:'This finance record is locked, unavailable, or you no longer have permission.'};
   if(error.code==='23505')return {success:false,error:'This code or save identity is already in use. No existing record was replaced.'};
   const rollback=typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT|55)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code));
   if(!rollback)return {success:false,uncertain:true,error:'Finance save unconfirmed. Retry the original change to recover its result.'};
   const message=messages.has(error.message)?error.message:'The finance change was rejected. Check the values and try again.';
   return {success:false,error:message,fieldErrors:fields.has(error.details)?{[error.details]:message}:undefined};
  }
  const receipt=verifyFinanceReferenceReceipt(raw,id,c.data);
  if(!receipt)return {success:false,uncertain:true,error:'Finance save response incomplete. Retry the original change to recover its result.'};
  try{const base='/admin/master-data/finance-basics/'+financeReferencePaths[entity];revalidatePath(base);revalidatePath(`${base}/record/${receipt.id}`);}catch{/* A verified commit is terminal even when display refresh fails. */}
  return {success:true,data:receipt};
 }catch{return {success:false,uncertain:true,error:'Finance save unconfirmed. Retry the original change to recover its result.'};}
}
