import type {WorkspaceDraftCodec} from '@/hooks/use-workspace-controlled-draft';
import type {FinanceCenterEntity} from '@/lib/master-data/finance-center-save-contract';
import type {CostCenterWithRelations,ProfitCenterWithRelations} from './types';
export type CenterRecord=CostCenterWithRelations|ProfitCenterWithRelations;
export type CenterFormState=Record<string,string|boolean>;
export type CenterField={key:string;label:string;kind?:'boolean'|'number'|'company'|'branch'|'parent'|'lookup'|'textarea';required?:boolean;immutable?:boolean;max?:number;category?:string;section?:string};
export const centerNames:Record<FinanceCenterEntity,{label:string;prefix:string}>={cost_centers:{label:'cost centre',prefix:'cost-center'},profit_centers:{label:'profit centre',prefix:'profit-center'}};
export function centerFields(entity:FinanceCenterEntity):CenterField[]{
 const prefix=entity==='cost_centers'?'cost':'profit';
 return [{key:prefix+'_center_code',label:'Code',required:true,immutable:true,max:50},
  {key:prefix+'_center_name_en',label:'English name',required:true,max:255},{key:prefix+'_center_name_ar',label:'Arabic name',max:255},
  {key:prefix+'_center_type_code',label:'Type',kind:'lookup',category:prefix.toUpperCase()+'_CENTER_TYPES'},
  {key:'parent_'+prefix+'_center_id',label:'Parent centre',kind:'parent'},{key:'sort_order',label:'Sort order',kind:'number'},
  {key:'owner_company_id',label:'Owner company',kind:'company',section:'org'},{key:'branch_id',label:'Branch',kind:'branch',section:'org'},
  {key:'description_en',label:'Description (English)',kind:'textarea',max:1000,section:'org'},
  {key:'description_ar',label:'Description (Arabic)',kind:'textarea',max:1000,section:'org'},
  {key:'notes',label:'Notes',kind:'textarea',max:2000,section:'org'},{key:'is_active',label:'Active',kind:'boolean',section:'status'}];
}
export function centerFormState(entity:FinanceCenterEntity,row?:CenterRecord|null):CenterFormState{
 const source=row as unknown as Record<string,unknown>|undefined;
 return Object.fromEntries(centerFields(entity).map(f=>[f.key,f.kind==='boolean'?(source?.[f.key]??true)===true:String(source?.[f.key]??(f.kind==='number'?'0':''))]));
}
export const centerDraftCodec:WorkspaceDraftCodec<CenterFormState>={
 encode:value=>Object.fromEntries(Object.entries(value).map(([key,v])=>[key,String(v)])),
 restore:(initial,read)=>Object.fromEntries(Object.entries(initial).map(([key,v])=>[key,typeof v==='boolean'?read(key,String(v))==='true':read(key,v)])),
};
export function centerFormPayload(entity:FinanceCenterEntity,state:CenterFormState,editing:boolean):Record<string,unknown>{
 return Object.fromEntries(centerFields(entity).filter(f=>!editing||!f.immutable).map(f=>{
  const raw=state[f.key];let value:unknown=raw;
  if(f.kind==='number')value=String(raw).trim()===''?NaN:Number(raw);
  else if(['company','branch','parent'].includes(f.kind??''))value=raw===''?null:Number(raw);
  else if(typeof raw==='string'){value=raw.trim();if(!f.required&&value==='')value=null;if(f.immutable&&typeof value==='string')value=value.toUpperCase();}
  return [f.key,value];
 }));
}
