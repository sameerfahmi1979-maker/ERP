import type {HrLookupTable} from './settings-save-contract';

type Flag = {kind:'flag'; key:string; label:string; initial:boolean};
type Numeric = {kind:'number'; key:string; label:string; initial:number|null; min:number; max:number; step:number|'any'; optional?:boolean};
type Choice = {kind:'choice'; key:string; label:string; initial:string; options:readonly (readonly [string,string])[]};
type Reference = {kind:'reference'; key:'training_category_id';label:string;initial:null};
export type HrLookupOptionField = Flag|Numeric|Choice|Reference;
export type HrLookupOptionState = Record<string,string|boolean>;
const flag=(key:string,label:string,initial:boolean):Flag=>({kind:'flag',key,label,initial});
const duration=(key:string,label:string):Numeric=>({kind:'number',key,label,initial:null,min:1,max:2147483647,step:1,optional:true});
const expiry:Numeric={kind:'number',key:'default_expiry_alert_days',label:'Expiry alert (days before expiry)',initial:60,min:1,max:365,step:1};

// These defaults mirror the existing approved action schemas; this is not new HR policy.
export const hrLookupOptionFields:Partial<Record<HrLookupTable,readonly HrLookupOptionField[]>>={
 hr_grades:[duration('grade_level','Grade level')],
 hr_identity_document_types:[expiry,flag('requires_issue_date','Issue date required',true),flag('requires_expiry_date','Expiry date required',true),flag('requires_document_number','Document number required',true),flag('is_government_document','Government document',true),flag('is_sensitive','Sensitive document',true)],
 hr_access_card_types:[expiry,{kind:'choice',key:'scope_type',label:'Access card scope',initial:'configurable',options:[['global','Global'],['site','Work site'],['client','Client'],['configurable','Configurable']]},flag('requires_work_site','Work site required',false),flag('requires_client_authority','Client authority required',true)],
 hr_training_types:[{kind:'reference',key:'training_category_id',label:'Training category',initial:null},duration('default_validity_months','Default validity (months)'),expiry,flag('requires_certificate_number','Certificate number required',true),flag('requires_provider','Training provider required',false),flag('is_site_required','Required for work site',false),flag('is_designation_required','Required for designation',false)],
 hr_medical_record_types:[duration('default_validity_months','Default validity (months)'),expiry,flag('is_confidential','Confidential medical record',true),flag('requires_dms_document','Document attachment required',true)],
 hr_leave_types:[{kind:'number',key:'default_entitlement_days',label:'Default entitlement (days)',initial:null,min:0,max:365,step:0.1,optional:true},{kind:'choice',key:'reset_basis',label:'Entitlement reset',initial:'joining_anniversary',options:[['joining_anniversary','Joining anniversary'],['calendar_year','Calendar year'],['manual','Manual']]},flag('is_paid','Paid leave',true),flag('requires_document','Supporting document required',false),flag('requires_approval','Approval required',true),flag('allow_half_day','Half-day leave allowed',true)],
 hr_salary_component_types:[{kind:'choice',key:'component_kind',label:'Component kind',initial:'earning',options:[['earning','Earning'],['deduction','Deduction'],['info','Information only']]},flag('is_basic','Basic salary component',false),flag('is_wps_component','WPS component',true),flag('is_taxable','Taxable component',false)],
 hr_payroll_groups:[{kind:'choice',key:'pay_frequency',label:'Pay frequency',initial:'monthly',options:[['monthly','Monthly'],['weekly','Weekly'],['biweekly','Every two weeks'],['manual','Manual']]},flag('wps_applicable_default','WPS applicable by default',true)],
 hr_pro_process_types:[duration('default_due_days','Default due period (days)'),expiry,flag('requires_dms_document','Document attachment required',false)],
};

export function initialHrLookupOptions(entity:HrLookupTable,row?:object|null):HrLookupOptionState {
 const values=row as Record<string,unknown>|undefined|null;
 return Object.fromEntries((hrLookupOptionFields[entity]??[]).flatMap(field=>{
  // An incomplete edit projection must not substitute create defaults for missing fields.
  if(values&&!Object.hasOwn(values,field.key))return [];
  const value=values?values[field.key]:field.initial;
  return [[field.key,field.kind==='flag'?value===true:value==null?'':String(value)]];
 }));
}

export function hrLookupOptionPayload(entity:HrLookupTable,state:HrLookupOptionState):Record<string,unknown> {
 return Object.fromEntries((hrLookupOptionFields[entity]??[]).flatMap(field=>{
  if(!Object.hasOwn(state,field.key))return [];
  const value=state[field.key];
  return [[field.key,field.kind==='reference'?(String(value).trim()===''?null:Number(value)):field.kind!=='number'?value:String(value).trim()===''?(field.optional?null:NaN):Number(value)]];
 }));
}
