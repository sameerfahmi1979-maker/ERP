import type {SupabaseClient} from '@supabase/supabase-js';
import type {WorkspaceFieldErrors} from '@/lib/workspace/field-errors';

type Failure={success:false;error:string;fieldErrors?:WorkspaceFieldErrors};
const fail=(field:string,error:string):Failure=>({success:false,error,fieldErrors:{[field]:error}});

/** Business validation through the caller's client, not a new lookup/cache layer.
 * Database guards repeat these rules under a transaction-wide catalogue lock. */
export async function validateUomReferences(client:Pick<SupabaseClient,'from'>,entity:'units_of_measure'|'uom_conversions',input:Record<string,unknown>,current?:Record<string,unknown>):Promise<Failure|null>{
 const data={...current,...Object.fromEntries(Object.entries(input).filter(([,value])=>value!==undefined))};
 const activated=!current||(data.is_active===true&&current.is_active===false);
 try{
  if(entity==='units_of_measure'){
   if(data.is_base_unit===true&&data.conversion_factor_to_base!==1)return fail('conversion_factor_to_base','A base unit must have conversion factor 1.');
   if(activated){
    const category=await client.from('uom_categories').select('id,is_active').eq('id',data.uom_category_id).maybeSingle();
    if(category.error)return fail('uom_category_id','Category availability could not be checked. Retry before saving.');
    if(category.data?.id!==data.uom_category_id||category.data?.is_active!==true)return fail('uom_category_id','Choose an available active category.');
   }
   if(data.is_base_unit===true&&(!current||current.is_base_unit!==true)){
    let query=client.from('units_of_measure').select('id').eq('uom_category_id',data.uom_category_id).eq('is_base_unit',true);
    if(current?.id!=null)query=query.neq('id',current.id);
    const bases=await query.limit(1);
    if(bases.error)return fail('is_base_unit','The existing base unit could not be checked. Retry before saving.');
    if(bases.data?.length)return fail('is_base_unit','This category already has a base unit, including retained inactive units.');
   }
  }else if(activated){
   if(data.from_uom_id===data.to_uom_id)return fail('to_uom_id','Choose two different units.');
   for(const field of ['from_uom_id','to_uom_id']){
    const result=await client.from('units_of_measure').select('id,is_active,category:uom_categories!units_of_measure_uom_category_id_fkey(is_active)').eq('id',data[field]).maybeSingle();
    if(result.error)return fail(field,'Unit availability could not be checked. Retry before saving.');
    const category=result.data?.category as unknown as {is_active:boolean}|null;
    if(result.data?.id!==data[field]||result.data?.is_active!==true||category?.is_active!==true)return fail(field,'Choose an available active unit in an active category.');
   }
  }
  return null;
 }catch{return {success:false,error:'Unit relationships could not be checked. Retry before saving.'};}
}

export function uomLifecycleMetadata(input:Record<string,unknown>,current:Record<string,unknown>|undefined,actor:number|null):{deactivated_at?:string|null;deactivated_by?:number|null;deactivation_reason?:string|null}{
 if(typeof input.is_active!=='boolean'||input.is_active===current?.is_active)return {};
 return input.is_active?{deactivated_at:null,deactivated_by:null,deactivation_reason:null}:
  {deactivated_at:new Date().toISOString(),deactivated_by:actor};
}

export function uomWriteError(error:{code?:string;message?:string}):string{
 const known:Record<string,string>={
  'Use a finite positive factor; base units must have factor 1':'Use a finite positive conversion factor. A base unit must have factor 1.',
  'Retire active units before retiring their category':'Retire the active units before retiring their category.',
  'Retire active conversions before retiring their unit':'Retire the active conversion rules before retiring their unit.',
  'Retire the other active units before removing their base unit':'Retire the other active units before retiring or changing their base unit.',
  'Choose an active unit category':'Choose an available active category.',
  'Choose two different active units in active categories':'Choose two different active units in active categories.',
  'Unit code and established category are immutable':'The saved unit code and category cannot be changed.',
  'Established conversion endpoints are immutable':'The saved conversion endpoints cannot be changed.',
  'Category code is immutable':'The saved category code cannot be changed.',
 };
 if(error.message&&Object.hasOwn(known,error.message))return known[error.message];
 if(error.code==='23505')return 'This code, conversion pair or category base unit already exists.';
 if(error.code==='42501')return 'This record is unavailable or you no longer have permission to change it.';
 if(error.code==='23503')return 'An active dependency must be resolved, or a selected record is unavailable.';
 if(error.code==='23514'||error.code==='22023')return 'The unit values do not meet the catalogue rules. Check the entered fields.';
 return 'The units catalogue change was not confirmed. Check the latest record before trying again.';
}
