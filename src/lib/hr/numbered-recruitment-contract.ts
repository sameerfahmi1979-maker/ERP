import {z} from 'zod';
import type {AuthContext} from '@/lib/rbac/check';
import {hasGlobalPermission,hasPermissionInScope} from '@/lib/rbac/scope';

export const recruitmentId=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const optionalId=recruitmentId.nullable().optional();
const text=z.string().nullable().optional();
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value,'Enter a valid date.');
const revision=z.string().regex(/^[1-9]\d*$/).refine(value=>BigInt(value)<=BigInt(Number.MAX_SAFE_INTEGER));
export const requisitionCreationSchema=z.object({
 requisition_title:z.string().trim().min(1,'Title is required'),owner_company_id:optionalId,branch_id:optionalId,
 department_id:optionalId,designation_id:optionalId,work_site_id:optionalId,requested_by:optionalId,hiring_manager_id:optionalId,
 employment_type_id:optionalId,employee_category_id:optionalId,vacancies_count:z.number().int().min(1).max(2147483647).default(1),
 target_start_date:date.nullable().optional(),requisition_status:z.enum(['draft','open','on_hold','filled','cancelled','closed']).default('draft'),
 priority:z.enum(['low','normal','high','urgent']).default('normal'),
 budgeted_salary_min:z.number().min(0).max(9999999999.99).nullable().optional(),budgeted_salary_max:z.number().min(0).max(9999999999.99).nullable().optional(),
 job_description:text,requirements:text,notes:text,
}).strict().refine(value=>value.branch_id==null||value.owner_company_id!=null,'A branch requires its owner company.')
 .refine(value=>value.budgeted_salary_min==null||value.budgeted_salary_max==null||value.budgeted_salary_min<=value.budgeted_salary_max,'Min salary must not exceed max salary');
export const candidateConversionInputSchema=z.object({
 owner_company_id:recruitmentId,branch_id:optionalId,department_id:optionalId,designation_id:optionalId,
 employment_type_id:optionalId,employee_category_id:optionalId,joining_date:date,
 employee_status:z.enum(['active','probation','suspended','inactive','terminated']).default('active'),
 reporting_manager_id:optionalId,primary_work_site_id:optionalId,conversion_notes:text,offer_id:optionalId,requisition_id:optionalId,
 emergency_contact_name:z.string().trim().min(1,'Emergency contact name is required'),
 emergency_contact_mobile:z.string().trim().min(1,'Emergency contact mobile is required'),
}).strict();
export const requisitionCreationContractSchema=z.object({operationId:z.string().uuid(),revision:z.null()}).strict();
export const candidateConversionContractSchema=z.object({operationId:z.string().uuid(),revision}).strict();
export const requisitionCreationReceiptSchema=z.object({id:recruitmentId,requisition_code:z.string().min(1),operation_id:z.string().uuid(),replayed:z.boolean(),reference_id:recruitmentId}).strict();
export const candidateConversionReceiptSchema=z.object({employee_id:recruitmentId,employee_code:z.string().min(1),candidate_id:recruitmentId,candidate_revision:revision,employee_revision:revision,link_id:recruitmentId,operation_id:z.string().uuid(),replayed:z.boolean(),reference_id:recruitmentId}).strict();
export const candidateConversionPreparationSchema=z.object({
 candidate:z.object({id:recruitmentId,workspace_revision:recruitmentId,requisition_id:recruitmentId.nullable()}).strict(),
 latest_offer:z.object({id:recruitmentId,requisition_id:recruitmentId.nullable(),department_id:recruitmentId.nullable(),designation_id:recruitmentId.nullable(),employment_type_id:recruitmentId.nullable(),owner_company_id:recruitmentId.nullable(),branch_id:recruitmentId.nullable(),proposed_joining_date:z.string().nullable()}).strict().nullable(),
 already_converted:z.boolean(),
}).strict();
export type CandidateConversionPreparation=z.infer<typeof candidateConversionPreparationSchema>;
export type RequisitionCreationInput=z.input<typeof requisitionCreationSchema>;
export type CandidateConversionInput=z.input<typeof candidateConversionInputSchema>;
export type RequisitionCreationReceipt=z.infer<typeof requisitionCreationReceiptSchema>;
export type CandidateConversionReceipt=z.infer<typeof candidateConversionReceiptSchema>;
export type RecruitmentMutationResult<T>={success:boolean;data?:T;error?:string;uncertain?:boolean};
/** Display/admission only. The transaction rechecks F03 subject authority. */
export function recruitmentScope(ctx:AuthContext,code:string,company:number|null|undefined,branch:number|null|undefined){
 return company==null?hasGlobalPermission(ctx,code):hasPermissionInScope(ctx,code,company,branch??null);
}
export function canCreateRecruitmentDestination(ctx:AuthContext,company:number|null|undefined,branch:number|null|undefined,employee=false){
 if(!hasGlobalPermission(ctx,'numbering.rules.generate')||!recruitmentScope(ctx,'hr.recruitment.manage',company,branch))return false;
 // Self/team authority depends on the freshly created subject. Admit an
 // eligible scoped capability here; the invoker RPC verifies the actual row.
 const any=(codes:string[])=>codes.some(code=>recruitmentScope(ctx,code,company,branch));
 return !employee||(recruitmentScope(ctx,'hr.employees.create',company,branch)&&recruitmentScope(ctx,'hr.recruitment.view',company,branch)
  &&any(['hr.employees.view','hr.employee_profile.view'].flatMap(code=>[code,`${code}.self`,`${code}.team`]))
  &&any(['hr.employees.update','hr.employee_profile.manage'].flatMap(code=>[code,`${code}.self`,`${code}.team`])));
}
