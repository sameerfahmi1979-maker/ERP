import 'server-only';
import {z} from 'zod';
import {getAuthContext,hasGlobalPermission,hasRole} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';
import {geographySaveReceiptSchema,geographyPaths,type GeographyEntity} from '@/lib/master-data/geography-save-contract';
import {geographyWriteError} from '@/features/master-data/geography/integrity';
const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/).nullable()}).strict();
const feedbackFields=new Set(['name_en','name_ar','nationality_en','nationality_ar','phone_code','abbreviation_en','abbreviation_ar',
 'region_type_code','area_type_code','port_type_code','default_currency_code','icao_code','iata_code','deactivation_reason','city_code','area_code','port_code','sort_order','country_id','emirate_id','city_id']);

/** Reuse the F04 operation/revision contract. Never mint a new operation on a retry. */
export async function saveGeographyInput(entity:GeographyEntity,action:'save'|'active'|'lock'|'retire',input:unknown,schema:z.ZodType,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const parsed=schema.safeParse(input);
 if(!parsed.success)return {success:false,error:'Check the highlighted fields before saving.',fieldErrors:Object.fromEntries(parsed.error.issues.filter(x=>x.path.length).map(x=>[String(x.path[0]),x.message]))};
 const {id=null,...payload}=parsed.data as Record<string,unknown>;
 const c=contractSchema.safeParse(contract);
 if(!c.success||(id!==null&&(!Number.isSafeInteger(id)||Number(id)<1||!c.data.revision))||(id===null&&c.data.revision!==null))
  return {success:false,error:'Reopen this geography record before saving. Its save identity or revision is missing.'};
 try{
  const ctx=await getAuthContext();
  if(!(action==='retire'?hasRole(ctx,'system_admin'):hasGlobalPermission(ctx,action==='lock'?'master_data.lookups.lock':'master_data.geography.manage')))
   return {success:false,error:'You do not have permission to change this shared geography catalogue.'};
  const client=await createClient();
  const {data:raw,error}=await client.rpc('save_geography_record',{p_entity:entity,p_action:action,p_operation:c.data.operationId,p_id:id,p_revision:c.data.revision,p_data:payload});
  if(error){
   if(error.code==='PT409'||error.code==='40001')return {success:false,error:'This geography record changed after you opened it. Your draft is retained. Reopen the latest record and compare before saving.'};
   if(error.code==='PT404')return {success:false,error:'Geography record not found. Reopen the list and check the record.'};
   const rollback=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   if(!rollback)return {success:false,uncertain:true,error:'Geography save unconfirmed. Keep the same values and retry to recover its result.'};
   const fields:Record<string,string>={'Country must match the selected region':'country_id','Choose an active country':'country_id','Choose an active region':'emirate_id','Choose an active city':'city_id'};
   const knownField=fields[error.message]??(feedbackFields.has(error.details)?error.details:undefined);
   const message=error.message==='Invalid geography field'||error.message==='Use typed geography fields'?'Check this field’s format and required value.':
    error.message==='Choose an available geography type'?'Choose an active, currently available type.':error.message==='Choose an active currency'?'Choose an available active currency.':geographyWriteError(error);
   return {success:false,error:message,fieldErrors:knownField?{[knownField]:message}:undefined};
  }
  const receipt=geographySaveReceiptSchema.safeParse(raw);
  if(!receipt.success||(id!==null&&receipt.data.id!==id))return {success:false,uncertain:true,error:'Geography save response incomplete. Retry the same values to recover the result.'};
  try{const base='/admin/master-data/geography/'+geographyPaths[entity];revalidatePath(base);revalidatePath(`${base}/record/${receipt.data.id}`);}catch{/* A confirmed commit remains successful if cache refresh fails. */}
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:true,error:'Geography save unconfirmed. Keep the same values and retry safely.'};}
}
