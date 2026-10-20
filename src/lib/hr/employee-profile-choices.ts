import {z} from 'zod';
import {employeeId} from './employee-contract';
export const EMPLOYEE_CHOICE_KINDS=['departments','designations','sites','categories','employment','mohre','relationships'] as const;
export const employeeProfileChoiceCriteria=z.object({companyId:employeeId.nullable(),branchId:employeeId.nullable(),departmentId:employeeId.nullable(),selected:z.object({departments:employeeId.nullable(),designations:employeeId.nullable(),sites:employeeId.nullable(),categories:employeeId.nullable(),employment:employeeId.nullable(),mohre:employeeId.nullable(),relationships:employeeId.nullable()}).strict()}).strict();
const option=z.object({value:employeeId,label:z.string(),code:z.string().nullable().optional(),disabled:z.boolean().optional()}).strict();
export const employeeChoiceGroup=z.discriminatedUnion('status',[z.object({status:z.literal('ready'),options:z.array(option)}).strict(),z.object({status:z.enum(['failed','restricted']),error:z.string()}).strict()]);
export const employeeProfileChoices=z.object({departments:employeeChoiceGroup,designations:employeeChoiceGroup,sites:employeeChoiceGroup,categories:employeeChoiceGroup,employment:employeeChoiceGroup,mohre:employeeChoiceGroup,relationships:employeeChoiceGroup}).strict();
export type EmployeeChoiceKind=typeof EMPLOYEE_CHOICE_KINDS[number];
export type EmployeeProfileChoices=z.infer<typeof employeeProfileChoices>;
