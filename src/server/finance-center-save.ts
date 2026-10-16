import {isFinanceSystemAdmin} from '@/lib/master-data/finance-reference-contract';
import 'server-only';
import {z} from 'zod';
import {getAuthContext,hasGlobalPermission} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';
import {financeCenterPaths,financeCenterSaveReceiptSchema,type FinanceCenterEntity} from '@/lib/master-data/finance-center-save-contract';
const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/).nullable()}).strict();
const publicErrors=new Set(['Choose an active company','Branch must belong to the selected company','Choose an active branch',
 'Choose an active parent centre','Parent centre must cover the same company and branch','Finance centre hierarchy cannot contain a cycle',
 'Centre scope change would contradict its children','Centre scope change would contradict a branch reference',
 'Retire active child centres first','An active branch still uses this centre','Choose an available finance centre type']);
const feedbackFields=new Set(['cost_center_code','profit_center_code','cost_center_name_en','profit_center_name_en','cost_center_name_ar','profit_center_name_ar',
 'cost_center_type_code','profit_center_type_code','parent_cost_center_id','parent_profit_center_id','owner_company_id','branch_id','description_en','description_ar','notes','deactivation_reason','sort_order']);

/** Same authority as the existing catalogue policies; no scoped-to-global upgrade. */
export async function saveFinanceCenterRecord(entity:FinanceCenterEntity,action:'save'|'active'|'lock'|'retire',id:number|null,data:object,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const c=contractSchema.safeParse(contract);
 if(!c.success||(id!==null&&(!Number.isSafeInteger(id)||id<1||!c.data.revision))||(id===null&&c.data.revision!==null))
  return {success:false,error:'Reopen this finance centre before saving. Its save identity or revision is missing.'};
 try{
  const ctx=await getAuthContext();
  if(!(action==='retire'?isFinanceSystemAdmin(ctx):hasGlobalPermission(ctx,action==='lock'?'master_data.lookups.lock':'master_data.finance_basics.manage')))
   return {success:false,error:'You do not have permission to administer this finance catalogue.'};
  const client=await createClient();
  const {data:raw,error}=await client.rpc('save_finance_center_record',{p_entity:entity,p_action:action,p_operation:c.data.operationId,p_id:id,p_revision:c.data.revision,p_data:data});
  if(error){
   if(error.code==='PT409'||error.code==='40001')return {success:false,error:'This finance centre changed after you opened it. Your draft is retained. Reopen the latest record and compare before saving.'};
   if(error.code==='PT404')return {success:false,error:'Finance centre not found. Reopen the list and check the record.'};
   if(error.code==='42501')return {success:false,error:'This finance centre is locked, unavailable, or you no longer have permission to change it.'};
   if(error.code==='23505')return {success:false,error:'This finance centre code is already in use. No existing record was replaced.'};
   const rolledBack=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT|55)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   if(!rolledBack)return {success:false,uncertain:true,error:'Finance centre save unconfirmed. Keep the same values and retry to recover its result.'};
   const message=publicErrors.has(error.message)?error.message:'The finance centre change was rejected. Check its values and try again.';
   return {success:false,uncertain:!rolledBack,error:message,fieldErrors:feedbackFields.has(error.details)?{[error.details]:message}:undefined};
  }
  const receipt=financeCenterSaveReceiptSchema.safeParse(raw);
  if(!receipt.success||(id!==null&&receipt.data.id!==id))return {success:false,uncertain:true,error:'Finance centre save response incomplete. Retry the same values to recover the result.'};
  try{const base='/admin/master-data/finance-basics/'+financeCenterPaths[entity];revalidatePath(base);revalidatePath(`${base}/record/${receipt.data.id}`);}catch{/* The committed receipt remains authoritative if refresh fails. */}
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:true,error:'Finance centre save unconfirmed. Keep the same values and retry safely.'};}
}
