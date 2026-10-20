import{z}from'zod';
import{employeeDate}from'./employee-contract';
export const operationalBlockFields={block_type:z.enum(['compliance','medical','training','access','payroll','hr_hold','operations','safety','other']),block_reason:z.string().trim().min(1,'Block reason is required.').max(2000),effective_from:employeeDate,effective_to:employeeDate.nullable(),notes:z.string().max(2000).nullable()};
export const operationalBlockValues=z.object(operationalBlockFields).strict().refine(v=>v.effective_to===null||v.effective_to>=v.effective_from,{path:['effective_to'],message:'Effective to must not precede effective from.'});
/** Complete historical wording is readable, not replaced by new-form defaults. */
export const operationalBlockOpeningValues=z.object({...operationalBlockFields,block_reason:z.string(),notes:z.string().nullable()}).strict();
export const blockReleaseValues=z.object({release_reason:z.string().trim().min(1,'Release reason is required.').max(2000)}).strict();
