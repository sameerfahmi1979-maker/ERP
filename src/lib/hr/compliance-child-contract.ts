import {z} from 'zod';
import {employeeDate,employeeId} from './employee-contract';

export const complianceChildKind=z.enum(['identity-document','medical-insurance','access-card','training-certificate','medical-record']);
export type ComplianceChildKind=z.infer<typeof complianceChildKind>;
const text=z.string().max(10000).nullish(),date=employeeDate.nullish(),id=employeeId.nullish();
const status=z.enum(['active','expired','cancelled','pending']);
export const renewalValues=z.object({renewal_status:z.enum(['not_required','pending','in_progress','complete'])}).strict();
const verification=z.enum(['unverified','verified','failed']);
const shared={dms_document_id:id,notes:text};
export const complianceValueSchemas={
 'identity-document':z.object({...shared,document_type_id:employeeId,document_number:z.string().trim().min(1).max(500),issue_date:date,expiry_date:date,issuing_authority:text,issuing_authority_party_id:id,issue_country_id:id,issuing_emirate_id:id,issue_city_id:id,status:status.default('active'),verification_status:verification.default('unverified'),renewal_status:renewalValues.shape.renewal_status.default('not_required'),emirates_id_application_no:text,visa_file_number:text,uid_number:text,labour_card_number:text,work_permit_number:text,mohre_person_code:text,profession_on_document:text,sponsor_company_id:id,place_of_issue:text}).strict(),
 'medical-insurance':z.object({...shared,insurance_provider:z.string().trim().min(1).max(500),tpa:text,policy_number:z.string().trim().min(1).max(500),insurance_card_number:text,network_class:text,issue_date:date,expiry_date:employeeDate,employee_covered:z.boolean().default(true),dependent_coverage_included:z.boolean().default(false),dependent_count_covered:z.number().int().min(0).max(2147483647).nullish(),status:status.default('active'),verification_status:verification.default('unverified'),renewal_status:renewalValues.shape.renewal_status.default('pending')}).strict(),
 'access-card':z.object({...shared,access_type_id:employeeId,client_authority:text,work_site_id:id,card_number:text,application_reference:text,issue_date:date,expiry_date:date,status:z.enum(['active','expired','cancelled','suspended','pending','in_application']).default('pending'),renewal_status:renewalValues.shape.renewal_status.default('not_required')}).strict(),
 'training-certificate':z.object({...shared,training_category_id:id,training_type_id:employeeId,provider:text,approval_body:text,certificate_number:text,completion_date:date,expiry_date:date,required_for_designation:z.boolean().default(false),required_for_site:z.boolean().default(false),status:z.enum(['valid','expired','pending','in_progress']).default('valid'),verification_status:verification.default('unverified')}).strict(),
 'medical-record':z.object({...shared,medical_record_type_id:employeeId,medical_center:text,report_number:text,examination_date:employeeDate,result:z.enum(['fit','unfit','conditionally_fit','under_review']),fit_for_work:z.boolean().default(false),work_restrictions:z.boolean().default(false),restriction_details:text,next_examination_date:date,required_for_visa:z.boolean().default(false),required_for_site:z.boolean().default(false),required_for_noc:z.boolean().default(false)}).strict(),
} as const;
export const COMPLIANCE_CHILD_TABLES={'identity-document':'employee_identity_documents','medical-insurance':'employee_medical_insurances','access-card':'employee_access_cards','training-certificate':'employee_training_certificates','medical-record':'employee_medical_records'} as const;
export const COMPLIANCE_CHILD_ACTIONS:Record<ComplianceChildKind,readonly string[]>={
 'identity-document':['create','update','archive','verify','renewal'],
 'medical-insurance':['create','update','archive','verify','renewal'],
 'access-card':['create','update','archive','renewal'],
 'training-certificate':['create','update','archive','verify'],
 'medical-record':['create','update','archive'],
};
/** Source document identities are part of the original operation, not a second
 * best-effort linking request. Unknown or protected fields are never accepted. */
export function complianceOperationValues(kind:ComplianceChildKind,action:string){
 if(action==='archive'||action==='verify')return z.object({}).strict();
 if(action==='renewal')return renewalValues;
 const original=complianceValueSchemas[kind];
 const values=action==='update'?z.object(Object.fromEntries(Object.entries(original.shape).map(([key,field])=>[key,(field instanceof z.ZodDefault?field.removeDefault():field).optional()]))).strict():original;
 return values.extend({entry_source:z.literal('document').optional(),source_document_ids:z.array(employeeId).max(100).optional()}).superRefine((v,ctx)=>{
  if(v.entry_source!==undefined&&action!=='create')ctx.addIssue({code:'custom',path:['entry_source'],message:'Document entry is a creation operation.'});
  if(Array.isArray(v.source_document_ids)&&new Set(v.source_document_ids).size!==v.source_document_ids.length)ctx.addIssue({code:'custom',path:['source_document_ids'],message:'Duplicate source documents.'});
  const row=v as Record<string,unknown>;
  for(const [from,to] of [['issue_date','expiry_date'],['completion_date','expiry_date'],['examination_date','next_examination_date']])if(typeof row[from]==='string'&&typeof row[to]==='string'&&row[to]<row[from])ctx.addIssue({code:'custom',path:[to],message:'End date must not precede the start date.'});
  if(kind==='medical-record'&&row.work_restrictions===true&&!(typeof row.restriction_details==='string'&&row.restriction_details.trim()))ctx.addIssue({code:'custom',path:['restriction_details'],message:'Describe the work restrictions.'});
 });
}
