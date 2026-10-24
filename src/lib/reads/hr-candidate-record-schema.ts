import {z} from "zod";
export {recruitmentReadIdentity as candidateRecordIdentity} from "./hr-recruitment-inquiries-schema";
const id = z.number().int().positive().refine(Number.isSafeInteger), text = z.string().nullable();
export const candidateRouteIdSchema = z.string().regex(/^[1-9]\d*$/).transform(Number).pipe(id);
export const candidateRecordCriteriaSchema = z.discriminatedUnion("kind", [
  z.object({kind: z.literal("record"), candidateId: id}).strict(),
  z.object({kind: z.literal("salary-access"), requisitionId: id.nullable()}).strict(),
]);
export const candidateRecordRowSchema = z.object({
  id, candidate_code: text, requisition_id: id.nullable(), full_name_en: z.string(), full_name_ar: text,
  gender: text, nationality_id: id.nullable(), date_of_birth: text, mobile_number: text, email: text,
  current_location: text, source: text, agency_name: text, referred_by_employee_id: id.nullable(),
  current_employer: text, current_position: text, expected_salary: z.number().finite().nullable(),
  notice_period_days: z.number().int().nullable(), candidate_status: z.string(), pipeline_stage: z.string(), joining_status:z.enum(['not_started','in_progress','completed','cancelled','no_show']),rating: text,
  availability_date: text, notes: text, created_at: z.string().min(1), updated_at: z.string().min(1),
  workspace_revision: z.number().int().positive().refine(Number.isSafeInteger), created_by: id.nullable(), deleted_at: z.null(),
  requisition: z.object({id, requisition_code: text, requisition_title: z.string()}).strip().nullable(),
  nationality: z.object({id, name_en: z.string()}).strip().nullable(),
  referred_by: z.object({id, full_name_en: z.string(), employee_code: z.string()}).strip().nullable(),
}).strip();
export const candidateSalaryAccessSchema = z.object({canView: z.boolean(), canManage: z.boolean(),
  canManageCandidate: z.boolean(), companyId: id.nullable(), branchId: id.nullable()}).strict()
  .refine(value => (!value.canManage || value.canView) && (value.companyId !== null || value.branchId === null));
export const candidateRecordSchema = z.object({kind: z.literal("record"), candidate: candidateRecordRowSchema, salaryAccess: candidateSalaryAccessSchema}).strict()
  .refine(value => value.salaryAccess.canView || value.candidate.expected_salary === null);
export const candidateSalaryReadSchema = z.object({kind: z.literal("salary-access"), requisitionId: id.nullable(), salaryAccess: candidateSalaryAccessSchema}).strict();
export type CandidateRecordRead = z.infer<typeof candidateRecordSchema>;
export type CandidateSalaryAccess = z.infer<typeof candidateSalaryAccessSchema>;
export type CandidateRecordInitial = {data: CandidateRecordRead; identity: string; updatedAt: number};
