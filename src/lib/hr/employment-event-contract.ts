import {z}from 'zod';
import {employeeDate,employeeId,EMPLOYMENT_FIELDS}from './employee-contract';
const fields:readonly string[]=[...EMPLOYMENT_FIELDS,'inactive_date','inactive_reason','deleted_at'];
const values=z.record(z.string(),z.union([z.string(),z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),z.null()])).refine(value=>Object.keys(value).every(key=>fields.includes(key)),'Unexpected employment projection');
export const employmentEventSchema=z.object({id:employeeId,employee_id:employeeId,old_values:values.nullable(),new_values:values,reason:z.string(),effective_date:employeeDate,created_at:z.string().datetime({offset:true}),created_by:employeeId.nullable(),revision:employeeId}).strict();
export type EmployeeEmploymentEvent=z.infer<typeof employmentEventSchema>;
