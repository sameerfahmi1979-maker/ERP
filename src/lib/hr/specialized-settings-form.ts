import type {HrSpecializedTable} from './specialized-settings-contract';

export type HrRuleEntity=Exclude<HrSpecializedTable,'hr_mohre_establishments'>;
export type HrRuleRow={id:number;workspace_revision?:number|string;is_active:boolean;[key:string]:unknown};
export type HrRuleField={key:string;label:string;kind:'text'|'number'|'boolean'|'enum'|'reference'|'notes';required?:boolean;immutable?:boolean;max?:number;min?:number;options?:readonly string[];relation?:string;nameKey?:string;emptyLabel?:string;defaultValue?:string|boolean};
const text=(key:string,label:string,required=false,immutable=false):HrRuleField=>({key,label,kind:'text',required,immutable,max:required&&immutable?100:200});
const ref=(key:string,label:string,relation:string,nameKey='name_en',required=false,emptyLabel='Not assigned'):HrRuleField=>({key,label,kind:'reference',relation,nameKey,required,emptyLabel});
const bool=(key:string,label:string,defaultValue=false):HrRuleField=>({key,label,kind:'boolean',defaultValue});
const number=(key:string,label:string,min:number,max:number,defaultValue='',required=false,immutable=false):HrRuleField=>({key,label,kind:'number',min,max,defaultValue,required,immutable});
const enumField=(key:string,label:string,options:readonly string[],defaultValue:string):HrRuleField=>({key,label,kind:'enum',options,defaultValue,required:true});
const notes:HrRuleField={key:'notes',label:'Notes',kind:'notes',max:2000};
export const hrRuleForms:Record<HrRuleEntity,{title:string;singular:string;description:string;fields:HrRuleField[]}>= {
 hr_readiness_rule_templates:{title:'Readiness Rule Templates',singular:'readiness rule',description:'Configure employee readiness requirements and expiry warnings.',fields:[
  text('rule_code','Rule code',true,true),text('rule_name_en','Name (English)',true),text('rule_name_ar','Name (Arabic)'),
  enumField('readiness_dimension','Readiness dimension',['legal','medical','training','cicpa','adnoc','offshore','driver','insurance','general'],'general'),
  enumField('requirement_type','Requirement type',['identity_document','training','access_card','medical_record','insurance','custom'],'custom'),
  ref('required_document_type_id','Document type','required_document'),ref('required_training_type_id','Training type','required_training'),
  ref('required_access_card_type_id','Access card type','required_access_card'),ref('required_medical_record_type_id','Medical record type','required_medical'),
  ref('applies_to_category_id','Employee category','category','name_en',false,'No category selected'),ref('applies_to_designation_id','Designation','designation','designation_name_en',false,'No designation selected'),
  ref('applies_to_work_site_id','Work site','work_site','site_name',false,'No work site selected'),
  number('expiry_buffer_days','Expiry warning (days)',1,365,'60',true),number('sort_order','Sort order',0,9999,'0',true),bool('is_critical','Critical',true),bool('is_active','Active'),
 ]},
 hr_role_requirement_matrix:{title:'Role Requirement Matrix',singular:'role requirement',description:'Link categories and designations to approved readiness rules.',fields:[
  ref('readiness_rule_template_id','Readiness rule','readiness_rule','rule_name_en',true),
  ref('employee_category_id','Employee category','employee_category','name_en',false,'No category selected'),ref('designation_id','Designation','designation','designation_name_en',false,'No designation selected'),
  bool('is_required','Required',true),bool('is_active','Active'),notes,
 ]},
 hr_site_requirement_matrix:{title:'Site Requirement Matrix',singular:'site requirement',description:'Configure readiness, training, access and medical requirements for work sites.',fields:[
  ref('work_site_id','Work site','work_site','site_name',false,'No work site selected'),ref('readiness_rule_template_id','Readiness rule','readiness_rule','rule_name_en'),
  ref('access_card_type_id','Access card type','access_card_type'),ref('training_type_id','Training type','training_type'),ref('medical_record_type_id','Medical record type','medical_record_type'),
  bool('is_required','Required',true),bool('is_active','Active'),notes,
 ]},
 hr_approval_workflows:{title:'Approval Workflows',singular:'workflow step',description:'Configure approval steps without assigning roles to users or taking business decisions.',fields:[
  text('workflow_code','Workflow code',true,true),text('workflow_name_en','Name (English)',true),text('workflow_name_ar','Name (Arabic)'),
  enumField('workflow_type','Workflow type',['leave','payroll_change','pro_process','eos','recruitment','general'],'general'),
  number('approval_step','Step',1,2147483647,'1',true,true),ref('approval_role_id','Approval role','approval_role','role_name'),ref('escalation_role_id','Escalation role','escalation_role','role_name'),
  number('sla_hours','Response time (hours)',1,2147483647),bool('is_required','Required',true),bool('is_active','Active'),
 ]},
};
export type HrRuleFormState=Record<string,string|boolean>;
export type HrRuleChoice={id:number;label:string};
export type HrRuleChoices=Record<string,HrRuleChoice[]>;
export function initialHrRuleForm(entity:HrRuleEntity,row?:HrRuleRow):HrRuleFormState{
 return Object.fromEntries(hrRuleForms[entity].fields.map(f=>[f.key,f.kind==='boolean'?typeof row?.[f.key]==='boolean'?row[f.key] as boolean:f.defaultValue??false:row?.[f.key]==null?row? '':f.defaultValue??'':String(row[f.key])]));
}
export function hrRulePayload(entity:HrRuleEntity,state:HrRuleFormState,row?:HrRuleRow):Record<string,unknown>{
 return Object.fromEntries(hrRuleForms[entity].fields.filter(f=>!row||(!f.immutable&&Object.hasOwn(row,f.key))).map(f=>{
  const value=state[f.key];return[f.key,f.kind==='boolean'?value:f.kind==='number'||f.kind==='reference'?value===''?null:Number(value):typeof value==='string'?value.trim()||null:value];
 }));
}
export function hrRuleReferenceLabel(row:HrRuleRow,field:HrRuleField):string{
 const relation=row[field.relation??''];
 if(relation&&typeof relation==='object'){
  const r=relation as Record<string,unknown>,name=r[field.nameKey??'name_en'];
  const company=r.owner_company as {legal_name_en?:string}|undefined;
  if(typeof name==='string'&&name.trim())return `${name}${company?.legal_name_en?' — '+company.legal_name_en:''}`;
 }
 return row[field.key]==null?field.emptyLabel??'Not assigned':'Saved selection (details unavailable)';
}
export function hrRuleTitle(entity:HrRuleEntity,row:HrRuleRow):string{
 if(entity==='hr_readiness_rule_templates')return String(row.rule_name_en??'Readiness rule');
 if(entity==='hr_approval_workflows')return String(row.workflow_name_en??'Workflow step');
 const fields=hrRuleForms[entity].fields.filter(field=>field.kind==='reference'&&(row[field.key]!=null||field.key==='work_site_id'));
 const context=fields.map(field=>hrRuleReferenceLabel(row,field)).join(' · ');
 return `${entity==='hr_role_requirement_matrix'?'Role':'Site'} requirement${context?': '+context:''}`;
}

/** F06 consumes the existing authorized paged actions; shared transport/cache
 * remains PERF-owned. Reject partial/changing results rather than treating a cap as complete. */
export async function loadHrRuleRows<T extends {id:number}>(list:(params:{page:number;page_size:number})=>Promise<{success:boolean;data?:{data:T[];total:number}}>):Promise<T[]>{
 const rows:T[]=[],ids=new Set<number>();let total:number|undefined;
 for(let page=1;;page++){
  const result=await list({page,page_size:200});
  if(!result.success||!result.data||!Number.isSafeInteger(result.data.total)||result.data.total<0)throw Error('HR configuration unavailable');
  total??=result.data.total;if(total!==result.data.total)throw Error('HR configuration changed during loading');
  for(const row of result.data.data){if(!Number.isSafeInteger(row.id)||row.id<1||ids.has(row.id))throw Error('Incomplete HR configuration');ids.add(row.id);rows.push(row);}
  if(rows.length===total)return rows;
  if(!result.data.data.length||rows.length>total)throw Error('Incomplete HR configuration');
 }
}
