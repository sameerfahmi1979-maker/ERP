import {z} from 'zod';
const id=z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
export const departmentScopeCatalogueSchema=z.object({
 companies:z.array(z.object({id,legal_name_en:z.string(),company_code:z.string(),status:z.string(),can_manage:z.boolean()}).strict()),
 branches:z.array(z.object({id,owner_company_id:id,branch_name_en:z.string(),branch_name_ar:z.string().nullable(),branch_code:z.string(),status:z.string(),can_manage:z.boolean()}).strict()),
}).strict();
export type DepartmentScopeCatalogue=z.infer<typeof departmentScopeCatalogueSchema>;
