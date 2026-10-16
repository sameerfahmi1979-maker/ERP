import {z} from 'zod';

export const hrSpecializedTables=['hr_mohre_establishments','hr_readiness_rule_templates','hr_role_requirement_matrix','hr_site_requirement_matrix','hr_approval_workflows'] as const;
export type HrSpecializedTable=typeof hrSpecializedTables[number];
export function isHrSpecializedTable(table:string):table is HrSpecializedTable{return (hrSpecializedTables as readonly string[]).includes(table);}
const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const optionalId=id.nullable().optional();
const name=z.string().trim().min(1,'Name is required.').max(200);
const code=z.string().trim().min(1,'Code is required.').max(100);
const optionalText=(max:number)=>z.string().trim().max(max).transform(v=>v||null).nullable().optional();
const flag=z.boolean().optional();
const positiveInt=z.number().int().positive().max(2147483647);
export const hrSpecializedSchemas={
 hr_mohre_establishments:z.object({owner_company_id:id,establishment_number:code,establishment_name:name,emirate_id:optionalId,status:z.enum(['active','inactive']).optional(),notes:optionalText(2000)}).strict(),
 hr_readiness_rule_templates:z.object({rule_code:code,rule_name_en:name,rule_name_ar:optionalText(200),
  readiness_dimension:z.enum(['legal','medical','training','cicpa','adnoc','offshore','driver','insurance','general']),
  requirement_type:z.enum(['identity_document','training','access_card','medical_record','insurance','custom']),
  required_document_type_id:optionalId,required_training_type_id:optionalId,required_access_card_type_id:optionalId,required_medical_record_type_id:optionalId,
  applies_to_category_id:optionalId,applies_to_designation_id:optionalId,applies_to_work_site_id:optionalId,
  is_critical:flag,expiry_buffer_days:positiveInt.max(365).optional(),is_active:flag,sort_order:z.number().int().min(0).max(9999).optional()}).strict(),
 hr_role_requirement_matrix:z.object({employee_category_id:optionalId,designation_id:optionalId,readiness_rule_template_id:id,is_required:flag,notes:optionalText(2000),is_active:flag}).strict(),
 hr_site_requirement_matrix:z.object({work_site_id:optionalId,access_card_type_id:optionalId,training_type_id:optionalId,medical_record_type_id:optionalId,readiness_rule_template_id:optionalId,is_required:flag,notes:optionalText(2000),is_active:flag}).strict(),
 hr_approval_workflows:z.object({workflow_code:code,workflow_name_en:name,workflow_name_ar:optionalText(200),workflow_type:z.enum(['leave','payroll_change','pro_process','eos','recruitment','general']),
  approval_step:positiveInt.optional(),approval_role_id:optionalId,is_required:flag,sla_hours:positiveInt.nullable().optional(),escalation_role_id:optionalId,is_active:flag}).strict(),
};
