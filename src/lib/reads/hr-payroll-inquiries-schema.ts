import {z} from "zod";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPayrollReadCapability} from "./hr-payroll-records-schema";
export {hrPayrollReadIdentity as payrollInquiryIdentity} from "./hr-payroll-records-schema";

export const PAYROLL_INQUIRY_KINDS = ["salary", "wps"] as const;
export type PayrollInquiryKind = typeof PAYROLL_INQUIRY_KINDS[number];
const field = (id: string, label: string) => ({id, label, type: "text" as const});
export const PAYROLL_INQUIRY_CONFIG = {
  salary: {prefix: "global-salary-profiles", tableId: "hr.payroll.salaries.hr-salaries-page-client", title: "Salary Profiles", fields: [field("full_name_en", "Employee"), field("payroll_group_name", "Payroll Group"), field("payroll_status", "Status"), field("gross_salary", "Gross Salary"), field("currency", "Currency")], statuses: ["active", "hold", "inactive", "not_configured"]},
  wps: {prefix: "global-wps-readiness", tableId: "hr.payroll.wps.hr-wps-page-client", title: "WPS Readiness", fields: [field("full_name_en", "Employee"), field("wps_status", "WPS Status"), field("salary_payment_method", "Payment Method"), field("has_active_hold", "Payroll Hold"), field("readiness_status", "Readiness")], statuses: ["active", "hold", "exempt", "not_enrolled"]},
} as const;
/** Coarse display/refusal only. The native read independently checks employee
 * visibility and exact F03 payroll/banking grants for each employee. */
export function canReadPayrollInquiry(ctx: AuthContext | null | undefined, kind: PayrollInquiryKind) {
  return !!ctx && hasPayrollReadCapability(ctx, "hr.payroll.view") && (kind === "salary" || hasPayrollReadCapability(ctx, "hr.banking.view"));
}
const id = z.number().int().positive().refine(Number.isSafeInteger);
// Unicode scalar count matches PostgreSQL char_length; reject NUL/isolated UTF-16
// surrogates rather than allowing an encoding failure or a changed literal.
const text = z.string().refine(v => Array.from(v).length <= 200 && !/[\u0000\uD800-\uDFFF]/u.test(v), "Invalid search text");
const sort = z.object({id: z.enum(["full_name_en", "payroll_group_name", "payroll_status", "gross_salary", "currency", "wps_status", "salary_payment_method", "has_active_hold", "readiness_status"]), desc: z.boolean()}).strict();
export const payrollInquiryCriteriaSchema = z.object({kind: z.enum(PAYROLL_INQUIRY_KINDS), page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25), search: text.default(""), employeeSearch: text.default(""), ownerCompanyId: id.nullable().default(null), branchId: id.nullable().default(null), status: z.string().max(40).nullable().default(null), activeHoldOnly: z.boolean().default(false), sorting: z.array(sort).max(5).default([{id: "full_name_en", desc: false}]), columnFilters: z.record(z.string(), text).default({})}).strict().superRefine((p, ctx) => {
  const cfg = PAYROLL_INQUIRY_CONFIG[p.kind];
  if (p.sorting.some(s => !cfg.fields.some(f => f.id === s.id)) || new Set(p.sorting.map(s => s.id)).size !== p.sorting.length) ctx.addIssue({code: "custom", message: "Invalid payroll sort"});
  if (p.status !== null && !(cfg.statuses as readonly string[]).includes(p.status)) ctx.addIssue({code: "custom", message: "Invalid payroll status"});
  if (p.kind === "salary" && p.activeHoldOnly) ctx.addIssue({code: "custom", message: "Hold-only requires WPS"});
  for (const key of Object.keys(p.columnFilters)) if (!cfg.fields.some(f => f.id === key)) ctx.addIssue({code: "custom", message: "Invalid payroll filter"});
  // The shared private-read transport admits at most 4,000 UTF-8 bytes. Count
  // the canonical/defaulted request, not UTF-16 units, before sending it.
  if (new TextEncoder().encode(JSON.stringify(p)).byteLength > 4000) ctx.addIssue({code: "custom", message: "Payroll criteria exceed the request limit"});
});
const nullableText = z.string().nullable(), count = z.number().int().nonnegative().refine(Number.isSafeInteger);
const employee = {employee_id: id, employee_code: z.string(), full_name_en: z.string()};
// Serialization availability limit, not a salary rule. Below 2^45, a double's
// spacing is at most 1/256 (< 0.01); nearest rounding cannot merge adjacent
// exact-cent NUMERIC totals or change their two-decimal display. A wider range
// needs a separately reviewed decimal-string/minor-unit response contract.
export const PAYROLL_INQUIRY_MAX_GROSS = 2 ** 45 - 1;
export const salaryInquiryRowSchema = z.object({...employee, payroll_status: z.enum(["active", "hold", "inactive", "not_configured"]).nullable(), payroll_group_name: nullableText, gross_salary: z.number().finite().min(-PAYROLL_INQUIRY_MAX_GROSS).max(PAYROLL_INQUIRY_MAX_GROSS), currency: nullableText}).strict();
export const wpsInquiryRowSchema = z.object({...employee, wps_status: z.enum(["active", "hold", "exempt", "not_enrolled"]).nullable(), salary_payment_method: z.enum(["bank_transfer", "exchange_house", "cheque"]).nullable(), has_active_hold: z.boolean(), readiness_status: z.enum(["ready", "incomplete", "on_hold", "exempt", "not_enrolled"])}).strict();
const envelope = {contractVersion: z.literal(1), page: z.number().int().min(1).max(100000), pageSize: z.number().int().min(1).max(100), totalCount: count};
export const payrollInquiryPageSchema = z.discriminatedUnion("kind", [z.object({...envelope, kind: z.literal("salary"), rows: z.array(salaryInquiryRowSchema)}).strict(), z.object({...envelope, kind: z.literal("wps"), rows: z.array(wpsInquiryRowSchema)}).strict()]).refine(p => p.rows.length === Math.min(p.pageSize, Math.max(0, p.totalCount - (p.page - 1) * p.pageSize)) && new Set(p.rows.map(r => r.employee_id)).size === p.rows.length, "Incomplete payroll page");
export type PayrollInquiryCriteria = z.infer<typeof payrollInquiryCriteriaSchema>;
export type PayrollInquiryPage = z.infer<typeof payrollInquiryPageSchema>;
export type PayrollInquiryRowMap = {salary: z.infer<typeof salaryInquiryRowSchema>; wps: z.infer<typeof wpsInquiryRowSchema>};
