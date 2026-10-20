import {z} from 'zod';
import {employeeCreateShape,employeeChronology,employeeDate} from '@/lib/hr/employee-contract';
import type {AuthContext} from '@/lib/rbac/check';
import {hasGlobalPermission,hasPermission,hasPermissionInScope} from '@/lib/rbac/scope';
import type {HrDocumentToEmployeeReviewPayload} from '@/lib/hr/document-to-record/types';
import type {DuplicateCheckResult} from '@/lib/hr/document-to-record/duplicate-checks';

export const documentEmployeeId=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const optionalId=documentEmployeeId.nullish();
const text=z.string().nullish();
const requiredText=z.string().trim().min(1,'A required field is blank.');
const date=employeeDate;
const optionalDate=date.nullish();
const commonChild={tempId:requiredText,sourceDocumentId:documentEmployeeId,dms_document_id:documentEmployeeId,
 verification_status:z.enum(['unverified','verified','failed']).default('unverified'),
 renewal_status:z.enum(['not_required','pending','in_progress','complete']),notes:text};
const identity=z.object({...commonChild,kind:z.literal('identity_document'),document_type_id:documentEmployeeId,document_number:requiredText,
 issue_date:optionalDate,expiry_date:optionalDate,issuing_authority:text,issuing_authority_party_id:optionalId,issue_country_id:optionalId,
 issuing_emirate_id:optionalId,status:z.enum(['active','expired','cancelled','pending']).default('active'),renewal_status:commonChild.renewal_status.default('not_required'),
 emirates_id_application_no:text,visa_file_number:text,uid_number:text,labour_card_number:text,work_permit_number:text,mohre_person_code:text,
 profession_on_document:text,sponsor_company_id:optionalId,place_of_issue:text}).strict();
const medical=z.object({...commonChild,kind:z.literal('medical_insurance'),insurance_provider:requiredText,policy_number:requiredText,tpa:text,
 insurance_card_number:text,network_class:text,issue_date:optionalDate,expiry_date:date,employee_covered:z.boolean(),dependent_coverage_included:z.boolean(),
 status:z.enum(['active','expired','cancelled','pending']).default('active'),renewal_status:commonChild.renewal_status.default('pending')}).strict();
const training=z.object({...z.object(commonChild).omit({renewal_status:true}).shape,kind:z.literal('training_certificate'),training_type_id:documentEmployeeId,training_category_id:optionalId,
 provider:text,certificate_number:text,completion_date:optionalDate,expiry_date:optionalDate,status:z.enum(['valid','expired','pending','in_progress']).default('valid')}).strict();
export const documentEmployeeChildSchema=z.discriminatedUnion('kind',[identity,medical,training]);
export const documentEmployeeInputSchema=z.object({
 selectedDocumentIds:z.array(documentEmployeeId).min(1).max(200),full_name_en:employeeCreateShape.full_name_en,full_name_ar:text,gender:employeeCreateShape.gender,
 date_of_birth:date,nationality_id:optionalId,mobile_number:employeeCreateShape.mobile_number,personal_email:employeeCreateShape.personal_email,
 owner_company_id:documentEmployeeId,branch_id:optionalId,department_id:optionalId,designation_id:optionalId,employee_category_id:employeeCreateShape.employee_category_id,employment_type_id:optionalId,
 joining_date:date,employee_status:employeeCreateShape.employee_status,reporting_manager_id:optionalId,
 emergency_contact_name:employeeCreateShape.emergency_contact_name,emergency_contact_mobile:employeeCreateShape.emergency_contact_mobile,emergency_contact_relationship_type_id:optionalId,
 complianceRecords:z.array(documentEmployeeChildSchema).max(200).default([]),conflictsReviewed:z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).default(0),
 totalDocumentsSelected:z.number().int().min(1).max(200),
}).strict().superRefine((value,ctx)=>{
 employeeChronology(value,ctx);
 const selected=new Set(value.selectedDocumentIds);
 if(selected.size!==value.selectedDocumentIds.length||value.totalDocumentsSelected!==selected.size)ctx.addIssue({code:'custom',path:['selectedDocumentIds'],message:'Select each source document once; its count must match.'});
 const tempIds=new Set<string>();
 value.complianceRecords.forEach((child,index)=>{
  if(!selected.has(child.sourceDocumentId)||child.dms_document_id!==child.sourceDocumentId)ctx.addIssue({code:'custom',path:['complianceRecords',index],message:'Every included record must use its selected source document.'});
  if(tempIds.has(child.tempId))ctx.addIssue({code:'custom',path:['complianceRecords',index,'tempId'],message:'Each reviewed record must have a distinct identity.'});
  tempIds.add(child.tempId);
  if(child.kind==='training_certificate'&&child.completion_date&&child.expiry_date&&child.expiry_date<child.completion_date)ctx.addIssue({code:'custom',path:['complianceRecords',index,'expiry_date'],message:'Expiry must not precede the reviewed completion date.'});
 });
});
export const documentEmployeeSourcesSchema=z.array(z.object({documentId:documentEmployeeId,fingerprint:z.string().regex(/^[a-f0-9]{64}$/)}).strict()).min(1).max(200)
 .refine(values=>new Set(values.map(value=>value.documentId)).size===values.length,'Source identities must be distinct.');
export const documentEmployeeContractSchema=z.object({operationId:z.string().uuid(),reviewedSources:documentEmployeeSourcesSchema}).strict();
export const documentEmployeePreparedSourcesSchema=z.array(z.object({documentId:documentEmployeeId,fingerprint:z.string().regex(/^[a-f0-9]{64}$/),
 document:z.object({id:documentEmployeeId,document_no:z.string(),title:z.string(),status:z.string(),issue_date:z.string().nullable(),expiry_date:z.string().nullable(),created_at:z.string(),
  document_type:z.object({id:documentEmployeeId,type_code:z.string(),name_en:z.string()}).nullable()}).passthrough(),
 extraction:z.object({extracted_fields_json:z.record(z.string(),z.unknown()).nullable(),field_confidence_json:z.record(z.string(),z.unknown()).nullable()}).nullable(),
}).strict()).min(1).max(200);
export const documentEmployeeReceiptSchema=z.object({employeeId:documentEmployeeId,employeeCode:z.string().min(1),employeeRevision:z.string().regex(/^[1-9]\d*$/),
 referenceId:documentEmployeeId,operationId:z.string().uuid(),sourceDocumentIds:z.array(documentEmployeeId).min(1),linkIds:z.array(documentEmployeeId).min(1),
 childRecords:z.array(z.object({kind:z.enum(['identity_document','medical_insurance','training_certificate']),id:documentEmployeeId,sourceDocumentId:documentEmployeeId}).strict()),
 complianceRecordsCreated:z.number().int().min(0),documentsLinked:z.number().int().positive(),warnings:z.array(z.string()),replayed:z.boolean(),
}).strict().refine(value=>value.complianceRecordsCreated===value.childRecords.length&&value.documentsLinked===value.linkIds.length&&value.documentsLinked===value.sourceDocumentIds.length,'Receipt counts do not match.');
export type DocumentEmployeeInput=z.input<typeof documentEmployeeInputSchema>;
export type DocumentEmployeeContract=z.infer<typeof documentEmployeeContractSchema>;
export type DocumentEmployeeReceipt=z.infer<typeof documentEmployeeReceiptSchema>;
export type DocumentEmployeeReview=HrDocumentToEmployeeReviewPayload&{duplicates:DuplicateCheckResult[];reviewedSources:z.infer<typeof documentEmployeeSourcesSchema>};
export type DocumentEmployeeResult={success:boolean;data?:DocumentEmployeeReceipt;error?:string;uncertain?:boolean};
export function canStartDocumentEmployee(ctx:AuthContext){return hasGlobalPermission(ctx,'numbering.rules.generate')&&hasPermission(ctx,'hr.employees.create')&&(hasPermission(ctx,'dms.documents.view')||hasPermission(ctx,'dms.admin'))&&hasPermission(ctx,'dms.documents.preview')&&hasPermission(ctx,'dms.documents.edit');}
/** Display admission only: exact new subject/self/team authority stays in F03 RLS. */
export function canSaveDocumentEmployee(ctx:AuthContext,company:number|null,branch:number|null,kinds:string[]){
 if(!canStartDocumentEmployee(ctx)||company===null)return false;
 const allowed=(code:string)=>hasPermissionInScope(ctx,code,company,branch);
 const subject=(codes:string[])=>codes.some(code=>[code,`${code}.self`,`${code}.team`].some(allowed));
 return allowed('hr.employees.create')&&subject(['hr.employees.view','hr.employee_profile.view'])&&subject(['hr.employees.update','hr.employee_profile.manage'])
  &&(!kinds.some(kind=>kind!=='medical_insurance')||(subject(['hr.compliance.manage'])&&subject(['hr.compliance.view'])))
  &&(!kinds.includes('medical_insurance')||(subject(['hr.medical.manage'])&&subject(['hr.medical.view'])));
}
