import type {WorkspaceDraftCodec} from '@/hooks/use-workspace-controlled-draft';
import type {UomEntity} from '@/lib/master-data/uom-save-contract';
import type {UomCategory,UnitOfMeasureWithCategory,UomConversionWithUnits} from './types';
export type UomRecord=UomCategory|UnitOfMeasureWithCategory|UomConversionWithUnits;
export type UomFormState=Record<string,string|boolean>;
export type UomField={key:string;label:string;kind?:'boolean'|'number'|'factor'|'category'|'unit'|'rule'|'textarea';required?:boolean;immutable?:boolean;max?:number;initial?:string|boolean;section?:string};
export const uomNames:Record<UomEntity,{label:string;prefix:string}>={uom_categories:{label:'unit category',prefix:'uom-category'},units_of_measure:{label:'unit of measure',prefix:'unit'},uom_conversions:{label:'conversion',prefix:'conversion'}};
export function uomFields(entity:UomEntity):UomField[]{
 const fields:UomField[]=entity==='uom_conversions'?[
  {key:'from_uom_id',label:'From unit',kind:'unit',required:true,immutable:true},{key:'to_uom_id',label:'To unit',kind:'unit',required:true,immutable:true},
  {key:'conversion_factor',label:'Conversion factor',kind:'factor',required:true,initial:'1'},
  {key:'conversion_formula_code',label:'Conversion rule',kind:'rule',max:50},{key:'is_bidirectional',label:'Bidirectional',kind:'boolean',initial:false},
 ]:entity==='units_of_measure'?[
  {key:'uom_category_id',label:'Category',kind:'category',required:true,immutable:true},
  {key:'unit_code',label:'Unit code',required:true,immutable:true},{key:'unit_name_en',label:'English name',required:true,max:255},
  {key:'unit_name_ar',label:'Arabic name',max:255},{key:'symbol',label:'Symbol',max:20},
  {key:'conversion_factor_to_base',label:'Factor to base unit',kind:'factor',required:true,initial:'1',section:'conversion'},
  {key:'is_base_unit',label:'Base unit (factor must equal 1)',kind:'boolean',initial:false,section:'conversion'},
  {key:'decimal_places',label:'Decimal places',kind:'number',max:6,initial:'2',section:'conversion'},
  {key:'allow_fraction',label:'Allow fractions',kind:'boolean',initial:true,section:'conversion'},
 ]:[
  {key:'category_code',label:'Category code',required:true,immutable:true},{key:'category_name_en',label:'English name',required:true,max:255},
  {key:'category_name_ar',label:'Arabic name',max:255},
 ];
 if(entity!=='uom_conversions')fields.push({key:'description_en',label:'Description (English)',kind:'textarea',max:1000},{key:'description_ar',label:'Description (Arabic)',kind:'textarea',max:1000});
 return [...fields,{key:'sort_order',label:'Sort order',kind:'number',max:2147483647,initial:'0'},{key:'notes',label:'Notes',kind:'textarea',max:2000},
  {key:'is_active',label:'Active',kind:'boolean',initial:true,section:'status'}];
}
export function uomFormState(entity:UomEntity,row?:UomRecord|null):UomFormState{
 const source=row as unknown as Record<string,unknown>|undefined;
 return Object.fromEntries(uomFields(entity).map(f=>[f.key,f.kind==='boolean'?(source?.[f.key]??f.initial)===true:String(source?.[f.key]??f.initial??'')]));
}
export const uomDraftCodec:WorkspaceDraftCodec<UomFormState>={
 encode:value=>Object.fromEntries(Object.entries(value).map(([key,v])=>[key,String(v)])),
 restore:(initial,read)=>Object.fromEntries(Object.entries(initial).map(([key,v])=>[key,typeof v==='boolean'?read(key,String(v))==='true':read(key,v)])),
};
export function uomFormPayload(entity:UomEntity,state:UomFormState,editing:boolean):Record<string,unknown>{
 return Object.fromEntries(uomFields(entity).filter(f=>!editing||!f.immutable).map(f=>{
  const raw=state[f.key];let value:unknown=raw;
  if(['number','factor','category','unit'].includes(f.kind??''))value=String(raw).trim()===''?NaN:Number(raw);
  else if(typeof raw==='string'){value=raw.trim();if(!f.required&&value==='')value=null;if(f.immutable&&typeof value==='string')value=value.toUpperCase();}
  return [f.key,value];
 }));
}
