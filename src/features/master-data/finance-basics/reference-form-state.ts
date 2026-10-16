import type {WorkspaceDraftCodec} from '@/hooks/use-workspace-controlled-draft';
import type {FinanceReferenceEntity} from '@/lib/master-data/finance-reference-contract';
import type {Bank,PaymentTerm,TaxType} from './types';
export type FinanceReferenceRecord=Bank|PaymentTerm|TaxType;
export type ReferenceFormState=Record<string,string|boolean>;
export type ReferenceField={key:string;label:string;kind?:'boolean'|'number'|'country'|'lookup'|'textarea'|'date'|'email'|'url';required?:boolean;immutable?:boolean;max?:number;step?:number;category?:string;section?:string};
export const referenceNames={banks:{label:'Bank',prefix:'bank',code:'bank_code',name:'bank_name_en'},payment_terms:{label:'Payment term',prefix:'payment-term',code:'term_code',name:'term_name_en'},tax_types:{label:'Tax type',prefix:'tax-type',code:'tax_code',name:'tax_name_en'}};
export function referenceFields(entity:FinanceReferenceEntity):ReferenceField[]{
 const n=referenceNames[entity];
 const base:ReferenceField[]=[{key:n.code,label:entity==='payment_terms'?'Term Code':entity==='tax_types'?'Tax Code':'Bank Code',required:true,immutable:true,max:50},{key:n.name,label:'English Name',required:true,max:255},{key:n.name.replace('_en','_ar'),label:'Arabic Name',max:255}];
 if(entity==='banks')base.push({key:'short_name',label:'Short Name',max:50},{key:'country_id',label:'Country',kind:'country'},
  {key:'bank_type_code',label:'Bank Type',kind:'lookup',category:'BANK_TYPES'},{key:'swift_code',label:'SWIFT Code',max:11},
  {key:'contact_phone',label:'Contact Phone',max:30,section:'contact'},{key:'contact_email',label:'Contact Email',kind:'email',max:320,section:'contact'},{key:'website_url',label:'Website',kind:'url',max:2048,section:'contact'});
 if(entity==='payment_terms')base.push({key:'due_days',label:'Due Days',required:true,kind:'number',step:1,section:'terms'},
  {key:'advance_percentage',label:'Advance %',kind:'number',step:0.01,section:'terms'},{key:'retention_percentage',label:'Retention %',kind:'number',step:0.01,section:'terms'},
  {key:'calculation_notes',label:'Calculation Notes',kind:'textarea',max:1000,section:'terms'},{key:'description_en',label:'Description (EN)',kind:'textarea',max:1000,section:'terms'},{key:'description_ar',label:'Description (AR)',kind:'textarea',max:1000,section:'terms'});
 if(entity==='tax_types')base.push({key:'tax_rate',label:'Tax Rate (%)',kind:'number',step:0.0001,required:true},
  {key:'tax_treatment_code',label:'Tax Treatment',kind:'lookup',required:true,category:'TAX_TREATMENT_TYPES'},
  {key:'effective_from',label:'Effective From',kind:'date',required:true},{key:'effective_to',label:'Effective To',kind:'date'},
  {key:'is_vat',label:'VAT Tax',kind:'boolean',section:'vat'},{key:'is_reverse_charge',label:'Reverse Charge',kind:'boolean',section:'vat'},
  {key:'applies_to_sales',label:'Sales',kind:'boolean',section:'vat'},{key:'applies_to_purchases',label:'Purchases',kind:'boolean',section:'vat'},{key:'applies_to_scrap',label:'Scrap / Waste',kind:'boolean',section:'vat'},
  {key:'description_en',label:'Description (EN)',kind:'textarea',max:1000,section:'vat'});
 base.push({key:'sort_order',label:'Sort Order',kind:'number',step:1,section:entity==='banks'?'contact':entity==='payment_terms'?'terms':'vat'},
  {key:'is_active',label:'Active',kind:'boolean',section:'status'});
 return base;
}
export function referenceFormState(entity:FinanceReferenceEntity,row?:FinanceReferenceRecord|null):ReferenceFormState{
 const source:Record<string,unknown>=row?{...row}:{};
 return Object.fromEntries(referenceFields(entity).map(f=>[f.key,f.kind==='boolean'?(source[f.key]??['is_active','applies_to_sales','applies_to_purchases'].includes(f.key))===true:String(source[f.key]??(f.kind==='number'?'0':f.key==='effective_from'?'2018-01-01':''))]));
}
export const referenceDraftCodec:WorkspaceDraftCodec<ReferenceFormState>={encode:value=>Object.fromEntries(Object.entries(value).map(([k,v])=>[k,String(v)])),restore:(initial,read)=>Object.fromEntries(Object.entries(initial).map(([k,v])=>[k,typeof v==='boolean'?['true','on'].includes(read(k,String(v))):read(k,v)]))};
/** Rendered fields only. Hidden descriptions/notes are never reconstructed as
 * null. Unchanged visible historical values are omitted on an ordinary edit. */
export function referenceFormPayload(entity:FinanceReferenceEntity,state:ReferenceFormState,opening:ReferenceFormState|null){
 return Object.fromEntries(referenceFields(entity).filter(f=>!opening||(!f.immutable&&state[f.key]!==opening[f.key])).map(f=>{
  const raw=state[f.key];let value:unknown=raw;
  if(f.kind==='number')value=String(raw).trim()===''?NaN:Number(raw);
  else if(f.kind==='country')value=raw===''?null:Number(raw);
  else if(typeof raw==='string'){value=raw.trim();if(!f.required&&value==='')value=null;if((f.immutable||f.key==='swift_code')&&typeof value==='string')value=value.toUpperCase();}
  return [f.key,value];
 }));
}
export function referenceSubmittedState(entity:FinanceReferenceEntity,current:ReferenceFormState,payload:Record<string,unknown>):ReferenceFormState{
 const state={...current};for(const f of referenceFields(entity))if(Object.hasOwn(payload,f.key))state[f.key]=typeof payload[f.key]==='boolean'?payload[f.key] as boolean:String(payload[f.key]??'');return state;
}
