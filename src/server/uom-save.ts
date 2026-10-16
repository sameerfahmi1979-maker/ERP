import 'server-only';
import {z} from 'zod';
import {getAuthContext,hasGlobalPermission,hasRole} from '@/lib/rbac/check';
import {createClient} from '@/lib/supabase/server';
import {revalidatePath} from 'next/cache';
import type {WorkspaceSaveContract} from '@/lib/workspace/save-contract';
import type {WorkspaceSaveResult} from '@/server/workspace-save';
import {uomPaths,uomSaveReceiptSchema,type UomEntity} from '@/lib/master-data/uom-save-contract';
const contractSchema=z.object({operationId:z.string().uuid(),revision:z.string().regex(/^[1-9]\d*$/).nullable()}).strict();
const guidance:Record<string,{message:string;field?:string}>={
 'Choose an active unit category':{message:'Choose an active unit category.',field:'uom_category_id'},
 'Choose two different active units in active categories':{message:'Choose two different active units in active categories.',field:'from_uom_id'},
 'Use a finite positive factor; base units must have factor 1':{message:'A base unit must have factor 1; other factors must be finite and positive.',field:'conversion_factor_to_base'},
 'Retire active conversions before retiring their unit':{message:'Retire the active conversions before retiring their unit.'},
 'Retire active units before retiring their category':{message:'Retire the active units before retiring their category.'},
 'Retire the other active units before removing their base unit':{message:'Retire the other active units before removing their base unit.'},
 'Choose two available units before defining a conversion':{message:'Choose two available units before defining a conversion.',field:'from_uom_id'},
 'Choose a supported conversion rule; arbitrary formulas are not executed':{message:'Choose a supported conversion rule. Free-text formulas are not calculated.',field:'conversion_formula_code'},
 'Cross-category conversion requires an explicit fixed-ratio rule':{message:'These units belong to different categories. Choose a documented fixed-ratio rule and explain its source and applicability.',field:'conversion_formula_code'},
 'Document the fixed-ratio source and when it is valid':{message:'In Notes, document the fixed ratio’s source and when it is valid (at least 10 characters).',field:'notes'},
};
const fields=new Set(['category_code','category_name_en','category_name_ar','unit_code','unit_name_en','unit_name_ar','uom_category_id','symbol','decimal_places','conversion_factor_to_base','is_base_unit','from_uom_id','to_uom_id','conversion_factor','conversion_formula_code','description_en','description_ar','notes','deactivation_reason','sort_order']);
/** Caller-authenticated RPC. No privileged-client fallback or standalone audit. */
export async function saveUomRecord(entity:UomEntity,action:'save'|'active'|'lock'|'retire',id:number|null,data:object,contract?:WorkspaceSaveContract):Promise<WorkspaceSaveResult>{
 const c=contractSchema.safeParse(contract);
 if(!c.success||(id!==null&&(!Number.isSafeInteger(id)||id<1||!c.data.revision))||(id===null&&c.data.revision!==null))
  return {success:false,error:'Reopen this units record before saving. Its save identity or revision is missing.'};
 try{
  const ctx=await getAuthContext();
  if(!(action==='lock'||action==='retire'?hasRole(ctx,'system_admin'):hasGlobalPermission(ctx,'master_data.uom.manage')))
   return {success:false,error:'You do not have permission to administer this units catalogue.'};
  const client=await createClient();
  const {data:raw,error}=await client.rpc('save_uom_record',{p_entity:entity,p_action:action,p_operation:c.data.operationId,p_id:id,p_revision:c.data.revision,p_data:data});
  if(error){
   if(error.code==='PT409'||error.code==='40001')return {success:false,error:'This units record changed after you opened it. Your draft is retained. Reopen the latest record and compare before saving.'};
   if(error.code==='PT404')return {success:false,error:'Units record not found. Reopen the list and check the record.'};
   if(error.code==='42501')return {success:false,error:'This units record is locked, unavailable, or you no longer have permission to change it.'};
   if(error.code==='23505'){
    const base=error.message.includes('idx_units_one_base_per_category'),message=base?'This category already has a base unit. Review the existing base unit first.':'This code or conversion pair is already in use. No existing record was replaced.';
    const field=base?'is_base_unit':entity==='uom_categories'?'category_code':entity==='units_of_measure'?'unit_code':'to_uom_id';
    return {success:false,error:message,fieldErrors:{[field]:message}};
   }
   const rolledBack=(typeof error.code==='string'&&error.code.length===5&&(/^(?:22|23|42|P0|PT|55)[0-9A-Z]{3}$/.test(error.code)||['40000','40001','40002','40P01'].includes(error.code)));
   if(!rolledBack)return {success:false,uncertain:true,error:'Units save unconfirmed. Keep the same values and retry to recover its result.'};
   const known=guidance[error.message];
   const message=known?.message??'The units change was rejected. Check its values and try again.';
   const field=known?.field??(fields.has(error.details)?error.details:undefined);
   return {success:false,uncertain:!rolledBack,error:message,fieldErrors:field?{[field]:message}:undefined};
  }
  const receipt=uomSaveReceiptSchema.safeParse(raw);
  if(!receipt.success||(id!==null&&receipt.data.id!==id))return {success:false,uncertain:true,error:'Units save response incomplete. Retry the same values to recover the result.'};
  try{for(const route of Object.values(uomPaths))revalidatePath('/admin/master-data/uom/'+route);revalidatePath('/admin/master-data/uom/'+uomPaths[entity]+'/record/'+receipt.data.id);}catch{/* Confirmed commit survives a refresh failure. */}
  return {success:true,data:receipt.data};
 }catch{return {success:false,uncertain:true,error:'Units save unconfirmed. Keep the same values and retry safely.'};}
}
