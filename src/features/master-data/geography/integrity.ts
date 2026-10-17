import type {SupabaseClient} from '@supabase/supabase-js';
import type {WorkspaceFieldErrors} from '@/lib/workspace/field-errors';

type GeographyEntity='emirates'|'cities'|'ports'|'areas_zones';
type Failure={success:false;error:string;fieldErrors?:WorkspaceFieldErrors};
const failure=(field:string,error:string):Failure=>({success:false,error,fieldErrors:{[field]:error}});

/** Business validation using the caller's existing client, not a second read or
 * lookup framework. DB triggers recheck under a catalogue mutation lock. */
export async function validateGeographyReferences(client:Pick<SupabaseClient,'from'>,entity:GeographyEntity,input:Record<string,unknown>,current?:Record<string,unknown>):Promise<Failure|null>{
 const fields=entity==='areas_zones'?['city_id']:entity==='emirates'?['country_id']:['country_id','emirate_id'];
 const data={...current,...Object.fromEntries(Object.entries(input).filter(([,value])=>value!==undefined))};
 const changed=!current||fields.some(field=>data[field]!==current[field])||(data.is_active===true&&current.is_active===false);
 if(!changed)return null; // An unrelated edit may retain an existing inactive selection.
 try{
  if(entity!=='areas_zones'&&data.country_id!=null){
   const result=await client.from('countries').select('id,is_active').eq('id',data.country_id).maybeSingle();
   if(result.error)return failure('country_id','Country availability could not be checked. Retry before saving.');
   if(result.data?.id!==data.country_id||result.data?.is_active!==true)return failure('country_id','Choose an available active country.');
  }
  if(entity==='cities'||entity==='ports'){
   const result=await client.from('emirates').select('id,country_id,is_active').eq('id',data.emirate_id).maybeSingle();
   if(result.error)return failure('emirate_id','Region availability could not be checked. Retry before saving.');
   if(result.data?.id!==data.emirate_id||result.data?.is_active!==true)return failure('emirate_id','Choose an available active region.');
   if(data.country_id!=null&&result.data.country_id!==data.country_id)return failure('country_id','Country must match the selected region.');
  }else if(entity==='areas_zones'){
   const result=await client.from('cities').select('id,is_active').eq('id',data.city_id).maybeSingle();
   if(result.error)return failure('city_id','City availability could not be checked. Retry before saving.');
   if(result.data?.id!==data.city_id||result.data?.is_active!==true)return failure('city_id','Choose an available active city.');
  }
  return null;
 }catch{return {success:false,error:'The geography relationship could not be checked. Retry before saving.'};}
}

export function geographyWriteError(error:{code?:string;message?:string}):string{
 const known:Record<string,string>={
  'Country must match the selected region':'Country must match the selected region.',
  'Choose an active country':'Choose an available active country.',
  'Choose an active region':'Choose an available active region.',
  'Choose an active city':'Choose an available active city.',
  'Referenced region cannot move to a different country; retain its history':'This region is referenced by cities or ports. Keep its country unchanged to preserve their history.',
  'Country has active geography dependencies':'Deactivate the active regions, cities and ports before retiring this country.',
  'Region has active geography dependencies':'Deactivate the active cities and ports before retiring this region.',
  'City has active areas':'Deactivate the active areas before retiring this city.',
  'Geography identity and system status are immutable':'Codes and system status cannot be changed.',
  'Enter a valid geography name':'Enter a name of 2–255 characters.',
  'Sort order cannot be negative':'Sort order must be zero or a positive whole number.',
 };
 if(error.message&&Object.hasOwn(known,error.message))return known[error.message];
 if(error.code==='23505')return 'A geography record with this unique value already exists.';
 if(error.code==='42501')return 'This record is unavailable or you no longer have permission to change it.';
 if(error.code==='23503')return 'The selection is unavailable or this record is still referenced. Check its dependencies.';
 return 'The geography change was not confirmed. Check the latest record before trying again.';
}
