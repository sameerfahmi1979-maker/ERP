import {z} from "zod";
export {hrReadIdentity as employeeOverviewIdentity} from "./hr-read-identity";

export const EMPLOYEE_OVERVIEW_SECTIONS = ["compliance", "time", "payroll", "operations", "actions", "recruitment"] as const;
export type EmployeeOverviewSection = typeof EMPLOYEE_OVERVIEW_SECTIONS[number];
const id = z.number().int().positive().refine(Number.isSafeInteger);
const count = z.number().int().nonnegative().refine(Number.isSafeInteger);
const text = z.string().nullable();
const expiry = z.object({total: count, active: count, expiringSoon: count, expired: count}).strict();
export const employeeOverviewCriteriaSchema = z.object({employeeId: id, sections: z.array(z.enum(EMPLOYEE_OVERVIEW_SECTIONS)).min(1).max(6).default([...EMPLOYEE_OVERVIEW_SECTIONS])}).strict()
  .refine(p => new Set(p.sections).size === p.sections.length);

/** Summary-only projections. Null sensitive values mean restricted, not zero. */
export const employeeOverviewDataSchemas = {
  compliance: z.object({identityDocuments: expiry, medicalInsurances: expiry.nullable(), dependents: z.object({total: count, active: count}).strict(), accessCards: expiry,
    trainingCertificates: z.object({total: count, valid: count, expiringSoon: count, expired: count}).strict(),
    medicalRecords: z.object({total: count, fit: count, lastExaminationDate: text}).strict().nullable(), dmsDocuments: z.object({total: count}).strict()}).strict(),
  time: z.object({currentShiftAssignment: z.object({work_calendar: z.object({calendar_name: z.string()}).strip().nullable(), work_shift: z.object({shift_name: z.string()}).strip().nullable()}).strip().nullable(),
    attendanceThisMonthCount: count, leaveBalanceCount: count.nullable(), pendingLeaveCount: count.nullable(), overtimeHoursThisMonth: z.number().finite()}).strict(),
  payroll: z.object({payrollStatus: text, grossSalary: z.number().finite(), hasActiveHold: z.boolean(), wpsStatus: text,
    wpsReadiness: z.object({status: z.enum(["ready", "incomplete", "on_hold", "exempt", "not_enrolled"])}).strict().nullable(), bankingRestricted: z.boolean()}).strict(),
  operations: z.object({currentAssignment: z.object({departments: z.object({name_en: z.string()}).strip().nullable(), designations: z.object({name_en: z.string()}).strip().nullable(), work_sites: z.object({name_en: z.string()}).strip().nullable()}).strip().nullable(),
    activeBlockCount: count, issuedAssetCount: count, issuedPpeCount: count, activeAccommodation: z.object({accommodation_location: text}).strip().nullable(),
    readinessCount: count, latestReadinessStatus: text}).strict(),
  actions: z.object({open_pro_processes: count, open_hr_actions: count, performance_reviews: count.nullable(), open_disciplinary: count.nullable(), pending_approvals: count, open_eos_case: z.boolean()}).strict(),
  recruitment: z.object({candidate_id: id, converted_at: z.string().min(1),
    candidate: z.object({id, candidate_code: text, full_name_en: z.string()}).strip().nullable(),
    requisition: z.object({id, requisition_code: text, requisition_title: z.string()}).strip().nullable()}).strip().nullable(),
};
function section<S extends z.ZodType>(data: S) {
  return z.discriminatedUnion("status", [z.object({status: z.literal("ready"), data}).strict(), z.object({status: z.literal("restricted")}).strict(), z.object({status: z.literal("failed")}).strict()]);
}
export const employeeOverviewSchema = z.object({employeeId: id, sections: z.object({
  compliance: section(employeeOverviewDataSchemas.compliance).optional(), time: section(employeeOverviewDataSchemas.time).optional(), payroll: section(employeeOverviewDataSchemas.payroll).optional(),
  operations: section(employeeOverviewDataSchemas.operations).optional(), actions: section(employeeOverviewDataSchemas.actions).optional(), recruitment: section(employeeOverviewDataSchemas.recruitment).optional(),
}).strict()}).strict();
export type EmployeeOverview = z.infer<typeof employeeOverviewSchema>;
export type EmployeeOverviewData<K extends EmployeeOverviewSection> = z.infer<(typeof employeeOverviewDataSchemas)[K]>;
