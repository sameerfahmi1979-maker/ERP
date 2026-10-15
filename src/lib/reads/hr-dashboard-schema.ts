import {z} from "zod";
export {hrReadIdentity as hrDashboardReadIdentity} from "./hr-read-identity";

const id = z.number().int().positive().refine(Number.isSafeInteger);
const count = z.number().int().nonnegative().refine(Number.isSafeInteger);
export const hrDashboardCriteriaSchema = z.object({
  ownerCompanyId: id.nullable().optional(), branchId: id.nullable().optional(),
  departmentId: id.nullable().optional(), designationId: id.nullable().optional(),
  expiryThresholdDays: z.number().int().min(0).max(3660).default(60),
}).strict();
export type HrDashboardCriteria = z.input<typeof hrDashboardCriteriaSchema>;
export const hrDashboardMetricSchema = z.discriminatedUnion("status", [
  z.object({status: z.literal("ready"), value: count}).strict(),
  z.object({status: z.enum(["restricted", "failed"])}).strict(),
  z.object({status: z.literal("unavailable"), reason: z.enum(["definition", "scope", "no-data"])}).strict(),
]);
export type HrDashboardMetric = z.infer<typeof hrDashboardMetricSchema>;
export const HR_DASHBOARD_METRICS = {
  employee: ["total", "active", "probation", "on_leave", "suspended", "terminated_archived", "new_joiners_this_month"],
  compliance: ["expired_documents", "expiring_soon", "missing_unverified", "active_access_cards", "expired_access_cards", "training_expiring_soon", "medical_expired", "linked_dms_documents"],
  time: ["attendance_pending_approval", "missing_punches", "approved_leave_today", "pending_leave_requests", "overtime_pending_approval"],
  payroll: ["payroll_profiles_configured", "missing_payroll_profile", "wps_ready", "wps_incomplete", "on_payroll_hold", "missing_iban_bank"],
  operations: ["current_assignments", "ready_employees", "not_ready_employees", "blocked_employees", "active_blocks", "assets_issued", "ppe_due_replacement", "accommodation_active"],
  actions: ["open_pro_processes", "open_hr_actions", "pending_approvals", "open_disciplinary", "open_eos_cases", "pending_clearance_items"],
  recruitment: ["open_requisitions", "active_candidates", "interviews_this_week", "offers_pending", "offers_accepted", "onboarding_tasks_pending", "converted_this_month"],
  summary: ["employee_total", "employee_active", "compliance_issues", "attendance_pending", "wps_ready_pct", "active_blocks", "recruitment_active"],
} as const;
export type HrDashboardSection = keyof typeof HR_DASHBOARD_METRICS;
function metrics<K extends readonly string[]>(keys: K) {
  return z.object(Object.fromEntries(keys.map(key => [key, hrDashboardMetricSchema])) as Record<K[number], typeof hrDashboardMetricSchema>).strict();
}
const attentionItem = z.object({id: z.string().min(1), severity: z.enum(["critical", "warning", "info"]),
  category: z.enum(["employee", "compliance", "time", "payroll", "operations", "actions", "recruitment"]),
  title: z.string(), description: z.string(), employeeId: id.optional(), employeeCode: z.string().optional(), employeeName: z.string().optional(),
  candidateId: id.optional(), candidateCode: z.string().optional(), dueDate: z.string().optional(),
  linkHref: z.string().startsWith("/admin/hr/"), linkLabel: z.string(),
}).strict();
export type HrDashboardAttentionItem = z.infer<typeof attentionItem>;
export const hrDashboardSchema = z.object({
  filters: hrDashboardCriteriaSchema, asOf: z.string().datetime(),
  employee: metrics(HR_DASHBOARD_METRICS.employee), compliance: metrics(HR_DASHBOARD_METRICS.compliance),
  time: metrics(HR_DASHBOARD_METRICS.time), payroll: metrics(HR_DASHBOARD_METRICS.payroll),
  operations: metrics(HR_DASHBOARD_METRICS.operations), actions: metrics(HR_DASHBOARD_METRICS.actions),
  recruitment: metrics(HR_DASHBOARD_METRICS.recruitment), summary: metrics(HR_DASHBOARD_METRICS.summary),
  headcount: z.discriminatedUnion("status", [
    z.object({status: z.literal("ready"), items: z.array(z.object({categoryId: id.nullable(), categoryName: z.string(), count}).strict()), total: count}).strict()
      .refine(v => v.items.reduce((n, item) => n + item.count, 0) === v.total && new Set(v.items.map(r => r.categoryId)).size === v.items.length),
    z.object({status: z.enum(["restricted", "failed"])}).strict(),
  ]),
  attention: z.object({items: z.array(attentionItem).max(50), failedSources: z.array(z.enum(["compliance", "actions", "operations", "recruitment"])),
    availableSources: count, limited: z.boolean()}).strict(),
}).strict();
export type HrDashboard = z.infer<typeof hrDashboardSchema>;
