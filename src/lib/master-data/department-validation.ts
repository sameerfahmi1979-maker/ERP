import {z} from 'zod';
const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const departmentFields=z.object({
 department_code:z.string().trim().min(1).max(20),department_name_en:z.string().trim().min(1).max(200),department_name_ar:z.string().max(200).optional().nullable(),
 owner_company_id:id,branch_id:id.optional().nullable(),parent_department_id:id.optional().nullable(),cost_center_id:id.optional().nullable(),department_head_user_id:id.optional().nullable(),
 description:z.string().max(1000).optional().nullable(),is_active:z.boolean().default(true),effective_from:z.iso.date().optional().nullable(),effective_to:z.iso.date().optional().nullable(),
});
const chronology=(value:{effective_from?:string|null;effective_to?:string|null},ctx:z.RefinementCtx)=>{
 if(value.effective_from&&value.effective_to&&value.effective_to<value.effective_from)ctx.addIssue({code:'custom',path:['effective_to'],message:'Effective To must be on or after Effective From.'});
};
export const createDepartmentSchema=departmentFields.superRefine(chronology);
export const updateDepartmentSchema=departmentFields.extend({is_active:departmentFields.shape.is_active.removeDefault()}).partial().extend({id}).superRefine(chronology);
