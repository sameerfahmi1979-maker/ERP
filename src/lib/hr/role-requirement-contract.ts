import{z}from'zod';
import{employeeDate}from'./employee-contract';
const fields={requirement_name:z.string().trim().min(1,'Requirement name is required.').max(500),requirement_type:z.enum(['document','training','medical','access_card','license','other']),status:z.enum(['met','missing','expired','expiring_soon','waived','not_required']),expiry_date:employeeDate.nullable(),is_required:z.boolean()};
export const roleRequirementValues=z.object(fields).strict();
export const roleRequirementCreateValues=roleRequirementValues.refine(v=>v.status!=='waived',{path:['status'],message:'Create the requirement, then use Waive with a reviewed reason.'});
export const roleRequirementOpeningValues=z.object({...fields,requirement_name:z.string()}).strict();
export const requirementWaiverValues=z.object({waiver_reason:z.string().trim().min(1,'Waiver reason is required.').max(2000)}).strict();
export const requirementRefreshValues=z.object({fingerprint:z.string().regex(/^[0-9a-f]{64}$/)}).strict();
