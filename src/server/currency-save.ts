import {isFinanceSystemAdmin} from '@/lib/master-data/finance-reference-contract';
import 'server-only';
import {z} from 'zod';
import {getAuthContext,hasGlobalPermission} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';
import {currencySaveReceiptSchema} from '@/lib/master-data/currency-save-receipt';
const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/).nullable()}).strict();
export async function saveCurrencyRecord(action:'save'|'active'|'lock'|'retire',id:number|null,data:object,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const c=contractSchema.safeParse(contract);
 if(!c.success||(id!==null&&(!Number.isSafeInteger(id)||id<1||!c.data.revision))||(id===null&&c.data.revision!==null))return {success:false,error:'Reopen this currency before saving. Its save identity or revision is missing.'};
 try{
  const ctx=await getAuthContext();
  const allowed=action==='retire'?isFinanceSystemAdmin(ctx):hasGlobalPermission(ctx,action==='lock'?'master_data.lookups.lock':'master_data.finance_basics.manage');
  if(!allowed)return {success:false,error:'You do not have permission to change this shared currency catalogue.'};
  const client=await createClient();
  const {data:raw,error}=await client.rpc('save_currency_record',{p_operation:c.data.operationId,p_id:id,p_revision:c.data.revision,p_action:action,p_data:data});
  if(error){
   if(error.code==='PT409'||error.code==='40001')return {success:false,error:'This currency changed after you opened it. Your draft is retained. Reopen the latest record and compare before saving.'};
   if(error.code==='PT404')return {success:false,error:'Currency not found. Reopen the list and check the record.'};
   if(error.code==='42501')return {success:false,error:'This currency is locked, unavailable, or you no longer have permission to change it.'};
   if(error.code==='23505')return {success:false,error:'This currency code or base-currency designation is already in use. Check the existing records; no currency was replaced.'};
   const rollback=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   return {success:false,uncertain:!rollback,error:rollback?'The currency change was rejected. Check its values and try again.':'Currency save unconfirmed. Keep the same values and retry to recover its result.'};
  }
  const receipt=currencySaveReceiptSchema.safeParse(raw);
  if(!receipt.success||(id!==null&&receipt.data.id!==id))return {success:false,uncertain:true,error:'Currency save response incomplete. Retry the same values to recover the result.'};
  // A cache refresh failure must never turn a committed mutation into a new save.
  try{revalidatePath('/admin/master-data/finance-basics/currencies');revalidatePath(`/admin/master-data/finance-basics/currencies/record/${receipt.data.id}`);}catch{/* Confirmed database receipt remains authoritative. */}
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:true,error:'Currency save unconfirmed. Keep the same values and retry safely.'};}
}
