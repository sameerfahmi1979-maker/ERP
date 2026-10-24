import {employeeCreateShape, employeeDate, EMPLOYMENT_FIELDS} from './employee-contract';

export type EmployeeField = keyof typeof employeeCreateShape;
export type EmployeeFieldGroup = 'person' | 'employment' | 'organisation' | 'emergency';
type FieldRule = {label:string;group:EmployeeFieldGroup;required:boolean;sensitive?:'medical';source:string;date?:'fact'|'employment'};
const rule=(label:string,group:EmployeeFieldGroup,required=false,extra:Partial<FieldRule>={}):FieldRule=>({label,group,required,source:'employees',...extra});

/** Runtime dictionary is deliberately exhaustive: a new canonical field cannot
 * silently miss ownership, intake, privacy and quality review. Not a new schema. */
export const EMPLOYEE_FOUNDATION_FIELDS = {
 full_name_en:rule('Full Name (English)','person',true),full_name_ar:rule('Full Name (Arabic)','person'),known_name:rule('Known Name','person'),
 gender:rule('Gender','person',true),nationality_id:rule('Nationality','person',false,{source:'countries'}),date_of_birth:rule('Date of Birth','person',true,{date:'fact'}),
 marital_status:rule('Marital Status','person'),mobile_number:rule('Mobile Number','person',true),personal_email:rule('Personal Email','person'),
 uae_address:rule('UAE Address','person'),home_country_address:rule('Home Country Address','person'),blood_group:rule('Blood Group','person',false,{sensitive:'medical'}),photo_dms_document_id:rule('Photo','person',false,{source:'dms_documents'}),
 owner_company_id:rule('Employer Company','employment',true,{source:'owner_companies'}),employee_category_id:rule('Employee Category','employment',true,{source:'hr_employee_categories'}),employment_type_id:rule('Employment Type','employment',false,{source:'hr_employment_types'}),
 joining_date:rule('Joining Date','employment',true,{date:'employment'}),actual_joining_date:rule('Actual Joining Date','employment',false,{date:'employment'}),employee_status:rule('Employment Status','employment'),
 sponsor_company_id:rule('Sponsor Company','employment',false,{source:'owner_companies'}),mohre_establishment_id:rule('MOHRE Establishment','employment',false,{source:'hr_mohre_establishments'}),
 probation_start_date:rule('Probation Start Date','employment',false,{date:'employment'}),probation_end_date:rule('Probation End Date','employment',false,{date:'employment'}),
 contract_type:rule('Contract Type','employment'),contract_start_date:rule('Contract Start Date','employment',false,{date:'employment'}),contract_end_date:rule('Contract End Date','employment',false,{date:'employment'}),notice_period_days:rule('Notice Period (Days)','employment'),
 branch_id:rule('Branch','organisation',false,{source:'branches'}),department_id:rule('Department','organisation',false,{source:'departments'}),designation_id:rule('Designation','organisation',false,{source:'designations'}),
 reporting_manager_id:rule('Reporting Manager','organisation',false,{source:'employees'}),supervisor_id:rule('Supervisor','organisation',false,{source:'employees'}),primary_work_site_id:rule('Primary Work Site','organisation',false,{source:'work_sites'}),
 emergency_contact_name:rule('Emergency Contact Name','emergency',true),emergency_contact_mobile:rule('Emergency Contact Mobile','emergency',true),emergency_contact_relationship_type_id:rule('Emergency Relationship','emergency',false,{source:'hr_relationship_types'}),
} satisfies Record<EmployeeField,FieldRule>;

export type EmploymentFacts=Partial<Record<typeof EMPLOYMENT_FIELDS[number]|'inactive_date'|'inactive_reason',unknown>>;
const journalFields=[...EMPLOYMENT_FIELDS,'inactive_date','inactive_reason'] as const;
const normalized=(value:unknown)=>value===''||value===undefined||value===null?null:String(value);
export function changedEmploymentFields(previous:EmploymentFacts,next:EmploymentFacts){
 return journalFields.filter(field=>Object.hasOwn(next,field)&&normalized(previous[field])!==normalized(next[field]));
}
const actionFields={
 'Change employer':['owner_company_id','sponsor_company_id','mohre_establishment_id'],
 'Change organisation':['branch_id','department_id','designation_id','primary_work_site_id'],
 'Change reporting relationship':['reporting_manager_id','supervisor_id'],
 'Amend employment terms':['employee_category_id','employment_type_id','joining_date','actual_joining_date','contract_type','contract_start_date','contract_end_date','notice_period_days'],
 'Record probation change':['probation_start_date','probation_end_date'],
 'Record employment status':['employee_status','inactive_date','inactive_reason'],
} as const;
export function employmentChangeSummary(previous:EmploymentFacts,next:EmploymentFacts){
 const fields=changedEmploymentFields(previous,next);
 return {fields,actions:Object.entries(actionFields).filter(([,keys])=>fields.some(field=>(keys as readonly string[]).includes(field))).map(([name])=>name),
  impacts:fields.length?['Required employment history will be recorded.','Access assignments, salary, attendance and site readiness are not automatically approved or changed.']:[]};
}

export type FoundationIssue={field:string;code:'missing-required'|'legacy-category'|'invalid-chronology';label:string};
/** Inspect one already-authorized record. Never fetch another employee, infer a
 * manager/link, persist corrections or include medical facts in the result. */
export function employeeFoundationIssues(facts:Record<string,unknown>,legacy=false):FoundationIssue[]{
 const issues:FoundationIssue[]=[];
 for(const [field,meta]of Object.entries(EMPLOYEE_FOUNDATION_FIELDS)){
  if(!meta.required)continue;
  const value=facts[field];
  if(value===null||value===undefined||typeof value==='string'&&!value.trim()){
   issues.push({field,code:field==='employee_category_id'&&legacy?'legacy-category':'missing-required',label:meta.label});
  }
 }
 for(const [from,to]of [['date_of_birth','joining_date'],['contract_start_date','contract_end_date'],['probation_start_date','probation_end_date']]as const){
  if(typeof facts[from]==='string'&&typeof facts[to]==='string'&&facts[from]&&facts[to]&&facts[from]>facts[to])issues.push({field:to,code:'invalid-chronology',label:EMPLOYEE_FOUNDATION_FIELDS[to].label});
 }
 return issues;
}

export function employmentFieldLabel(field:string){return Object.hasOwn(EMPLOYEE_FOUNDATION_FIELDS,field)?EMPLOYEE_FOUNDATION_FIELDS[field as EmployeeField].label:field==='inactive_date'?'Inactive Date':field==='inactive_reason'?'Inactive Reason':field.replaceAll('_',' ');}

export const EMPLOYEE_QUALITY_FILTERS=[
 {value:'legacy-category',label:'Legacy category needs review'},
 {value:'missing-emergency',label:'Missing emergency contact'},
] as const;
export type EmployeeQualityFilter=typeof EMPLOYEE_QUALITY_FILTERS[number]['value'];

/** A recorded snapshot is evidence, not reconstructed pre-system history.
 * Recorded order cannot safely resolve backdated/same-day differing facts. */
export function employmentSnapshotAt(events:readonly {id:number;effective_date:string;new_values:Record<string,unknown>}[],date:string){
 if(!employeeDate.safeParse(date).success||events.some(event=>!Number.isSafeInteger(event.id)||event.id<=0||!employeeDate.safeParse(event.effective_date).success)||new Set(events.map(event=>event.id)).size!==events.length)return {status:'review-required' as const,reason:'The recorded history or requested date could not be verified.'};
 const eligible=events.filter(event=>event.effective_date<=date);
 if(!eligible.length)return {status:'unknown' as const,reason:'No recorded employment snapshot proves this date.'};
 const day=eligible.reduce((latest,event)=>event.effective_date>latest?event.effective_date:latest,'');
 const matches=eligible.filter(event=>event.effective_date===day);
 const latest=eligible.reduce((a,b)=>a.id>b.id?a:b);
 if(matches.length!==1||latest.effective_date!==day)return {status:'review-required' as const,reason:'Same-day or backdated changes require explicit review; no historical value was guessed.'};
 return {status:'recorded' as const,eventId:matches[0].id,effectiveDate:day,facts:{...matches[0].new_values}};
}
