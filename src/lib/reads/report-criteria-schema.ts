import {z} from "zod";
import type {AuthContext} from "@/lib/rbac/check";
import {hasGlobalPermission, hasPermission} from "@/lib/rbac/scope";
export {hrReadIdentity as reportCriteriaIdentity} from "./hr-read-identity";

export const REPORT_CRITERION_KEYS = ["employee_id", "owner_company_id", "department_id", "branch_id", "designation_id", "work_site_id"] as const;
export const reportCriterionKeySchema = z.enum(REPORT_CRITERION_KEYS);
export type ReportCriterionKey = z.infer<typeof reportCriterionKeySchema>;
const id = z.number().int().positive().refine(Number.isSafeInteger);
export const REPORT_CRITERION_DEPENDENCIES: Record<ReportCriterionKey, readonly ("ownerCompanyId" | "branchId" | "departmentId")[]> = {
  employee_id: ["ownerCompanyId", "branchId", "departmentId"], owner_company_id: [], branch_id: ["ownerCompanyId"],
  department_id: ["ownerCompanyId"], designation_id: ["ownerCompanyId", "departmentId"], work_site_id: ["ownerCompanyId"],
};
export const reportCriteriaSchema = z.object({
  reportCode: z.string().trim().min(1).max(100).transform(value => value.toUpperCase()), key: reportCriterionKeySchema,
  search: z.string().max(200).transform(value => value.trim()).default(""),
  page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25),
  selectedId: id.optional(), ownerCompanyId: id.optional(), branchId: id.optional(), departmentId: id.optional(),
}).strict().superRefine((value, ctx) => {
  for (const key of ["ownerCompanyId", "branchId", "departmentId"] as const) {
    if (value[key] !== undefined && !REPORT_CRITERION_DEPENDENCIES[value.key].includes(key)) ctx.addIssue({code: "custom", path: [key], message: "Unsupported filter dependency"});
  }
});
export type ReportCriteria = z.infer<typeof reportCriteriaSchema>;
export const reportCriterionOptionSchema = z.object({value: id, label: z.string(), code: z.string().nullable()}).strict();
export type ReportCriterionOption = z.infer<typeof reportCriterionOptionSchema>;
export const reportCriteriaPageSchema = z.object({
  criteria: reportCriteriaSchema, rows: z.array(reportCriterionOptionSchema), selected: reportCriterionOptionSchema.nullable(),
  totalCount: z.number().int().nonnegative().refine(Number.isSafeInteger),
}).strict().superRefine((value, ctx) => {
  const {criteria: p, rows, selected, totalCount} = value;
  if (rows.length !== Math.min(p.pageSize, Math.max(0, totalCount - (p.page - 1) * p.pageSize)) || new Set(rows.map(row => row.value)).size !== rows.length)
    ctx.addIssue({code: "custom", path: ["rows"], message: "Incomplete choice page"});
  if (selected && selected.value !== p.selectedId) ctx.addIssue({code: "custom", path: ["selected"], message: "Mismatched selected choice"});
  const same = selected && rows.find(row => row.value === selected.value);
  if (same && JSON.stringify(same) !== JSON.stringify(selected)) ctx.addIssue({code: "custom", path: ["selected"], message: "Choice changed during read"});
});
export type ReportCriteriaPage = z.infer<typeof reportCriteriaPageSchema>;
/** Report applicability succeeded, but this optional entity-label capability
 * is independently unavailable. It conveys no row, count or existence claim. */
export const reportCriteriaRestrictedSchema = z.object({criteria: reportCriteriaSchema, availability: z.literal("restricted")}).strict();
export const reportCriteriaResponseSchema = z.union([reportCriteriaPageSchema, reportCriteriaRestrictedSchema]);
export type ReportCriteriaResponse = z.infer<typeof reportCriteriaResponseSchema>;

/** Display admission mirrors existing native gates; it is never a row-access grant.
 * Common-master SELECT policies use global current_user_has_permission, while
 * employee and organization/branch policies independently enforce row scope. */
export function canReadReportCriterion(ctx: AuthContext, key: ReportCriterionKey): boolean {
  if (!hasPermission(ctx, "reports.run")) return false;
  switch (key) {
    case "employee_id": return ["hr.employees.view", "hr.employee_profile.view", "hr.employees.view.self", "hr.employees.view.team"].some(code => hasPermission(ctx, code));
    case "owner_company_id": return ["organizations.view", "organizations.manage"].some(code => hasPermission(ctx, code));
    case "branch_id": return ["branches.view", "branches.manage"].some(code => hasPermission(ctx, code));
    default: {
      const kind = {department_id: "departments", designation_id: "designations", work_site_id: "work_sites"}[key];
      return hasGlobalPermission(ctx, "common_md.view") || hasGlobalPermission(ctx, `common_md.${kind}.view`);
    }
  }
}
