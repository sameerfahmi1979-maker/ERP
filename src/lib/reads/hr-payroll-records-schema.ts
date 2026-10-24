import {z} from "zod";
import {normalizeReadSorting, readSortingSchema} from "./read-sorting";
import {operationsRealDate, type HrOperationsField} from "./hr-operations-schema";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
export {hrActionRecordIdentity as hrPayrollReadIdentity} from "./hr-action-records-schema";

/** Display/early-refusal only; native employee visibility and the exact F03
 * subject grant remain authoritative in each server read. */
export function hasPayrollReadCapability(ctx: AuthContext, code: "hr.payroll.view" | "hr.banking.view") {
  return [code, `${code}.self`, `${code}.team`].some(value => hasPermission(ctx, value));
}

const id = z.number().int().positive().refine(Number.isSafeInteger);
const text = z.string().nullable();
const amount = z.number().finite().nullable();
const person = z.object({display_name: text}).strip().nullable();
export const payrollComponentTypeSchema = z.object({id, code: z.string(), name_en: z.string(), component_kind: z.string(), is_wps_component: z.boolean()}).strip().nullable();
export const payrollComponentSchema = z.object({id, employee_id: id, component_type_id: id, amount, effective_from: z.string(), effective_to: text, is_active: z.boolean(), notes: text, created_at: z.string(), updated_at: z.string(), deleted_at: text, component_type: payrollComponentTypeSchema}).strip();
export const payrollComponentListSchema = payrollComponentSchema.omit({notes: true, created_at: true, updated_at: true, deleted_at: true});
const revisionReview = z.object({revision_id: id, employee_id: id, status: z.enum(["recorded", "pending", "approved", "rejected", "withdrawn", "applied"]), workspace_revision: z.number().int().positive().refine(Number.isSafeInteger), currency: z.string().regex(/^[A-Z]{3}$/)}).strip().nullable().default(null);
export const payrollRevisionSchema = z.object({id, employee_id: id, effective_date: z.string(), revision_reason: text, old_gross: amount, new_gross: amount, approved_by: id.nullable(), created_at: z.string(), created_by: id.nullable(), approver: person, creator: person, review: revisionReview}).strip().refine(row => !row.review || row.review.revision_id === row.id && row.review.employee_id === row.employee_id);
export const payrollHoldSchema = z.object({id, employee_id: id, hold_reason: z.string(), hold_date: z.string(), release_date: text, released_by: id.nullable(), notes: text, is_active: z.boolean(), created_at: z.string(), updated_at: z.string(), deleted_at: text, releaser: person}).strip();
export const PAYROLL_RECORD_KINDS = ["salary-components", "salary-revisions", "holds"] as const;
export type PayrollRecordKind = typeof PAYROLL_RECORD_KINDS[number];
export const PAYROLL_RECORD_FIELDS: Record<PayrollRecordKind, readonly HrOperationsField[]> = {
  "salary-components": [{id: "component_type_name_en", label: "Component", type: "text"}, {id: "effective_from", label: "Effective From", type: "date"}, {id: "effective_to", label: "Effective To", type: "date"}],
  "salary-revisions": [{id: "effective_date", label: "Effective Date", type: "date"}, {id: "revision_reason", label: "Revision Reason", type: "text"}],
  holds: [{id: "hold_reason", label: "Hold Reason", type: "text"}, {id: "is_active", label: "Is Active", type: "select", options: [{value: "true", label: "Active"}, {value: "false", label: "Released"}]}, {id: "hold_date", label: "Hold Date", type: "date"}],
};
export const PAYROLL_RECORD_SORT = {"salary-components": "original", "salary-revisions": "effective_date", holds: "hold_date"} as const;
export const payrollRecordCriteriaSchema = z.object({kind: z.enum(PAYROLL_RECORD_KINDS), employeeId: id, page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25), search: z.string().trim().max(200).default(""), sortKey: z.string().max(100).optional(), sortDir: z.enum(["asc", "desc"]).optional(), sorting: readSortingSchema.optional(), columnFilters: z.record(z.string(), z.string().trim().max(200)).default({})}).strict().transform((p, ctx) => normalizeReadSorting(p, ctx, {allowed: [...PAYROLL_RECORD_FIELDS[p.kind].map(field => field.id), PAYROLL_RECORD_SORT[p.kind]], defaultKey: PAYROLL_RECORD_SORT[p.kind], defaultDir: "desc"})).superRefine((p, ctx) => {
  const fields = PAYROLL_RECORD_FIELDS[p.kind];
  if (p.sorting && p.sorting.length > 1 && p.sorting.some(sort => sort.id === "original")) ctx.addIssue({code: "custom", message: "Native payroll ordering cannot be mixed with explicit columns", path: ["sorting"]});
  if (!fields.some(f => f.id === p.sortKey) && !(p.kind === "salary-components" && p.sortKey === "original")) ctx.addIssue({code: "custom", message: "Invalid payroll sort"});
  for (const [key, value] of Object.entries(p.columnFilters)) {
    const f = fields.find(f => f.id === key);
    if (!f || value && (f.type === "date" ? !operationsRealDate(value) : f.type === "select" ? !f.options?.some(o => o.value === value) : false)) ctx.addIssue({code: "custom", message: "Invalid payroll filter"});
  }
});
export const payrollRecordRows = {"salary-components": payrollComponentListSchema, "salary-revisions": payrollRevisionSchema, holds: payrollHoldSchema};
const page = {employeeId: id, page: z.number().int().min(1), pageSize: z.number().int().min(1).max(100), totalCount: z.number().int().nonnegative().refine(Number.isSafeInteger)};
export const payrollRecordPageSchema = z.discriminatedUnion("kind", [z.object({...page, kind: z.literal("salary-components"), rows: z.array(payrollComponentListSchema)}), z.object({...page, kind: z.literal("salary-revisions"), rows: z.array(payrollRevisionSchema)}), z.object({...page, kind: z.literal("holds"), rows: z.array(payrollHoldSchema), activeCount: page.totalCount})]).refine(p => p.rows.length === Math.min(p.pageSize, Math.max(0, p.totalCount - (p.page - 1) * p.pageSize)) && new Set(p.rows.map(r => r.id)).size === p.rows.length && p.rows.every(r => r.employee_id === p.employeeId) && (p.kind !== "holds" || p.activeCount >= p.rows.filter(r => r.is_active).length));
export type PayrollRecordRowMap = {[K in PayrollRecordKind]: z.infer<(typeof payrollRecordRows)[K]>};
export type PayrollRecordPage = z.infer<typeof payrollRecordPageSchema>;
export const payrollPointCriteriaSchema = z.object({employeeId: id, kind: z.enum(["profile", "salary-totals", "wps", "component-detail"]), recordId: id.optional()}).strict().superRefine((p, ctx) => {if ((p.kind === "component-detail") !== (p.recordId !== undefined)) ctx.addIssue({code: "custom", message: "Invalid payroll detail identity"});});
export const payrollProfileSchema = z.object({id, employee_id: id, payroll_group_id: id.nullable(), effective_date: z.string(), currency: z.string(), payroll_status: z.string(), notes: text, created_at: z.string(), updated_at: z.string(), created_by: id.nullable(), updated_by: id.nullable(), deleted_at: text, payroll_group: z.object({id, name_en: z.string(), pay_frequency: z.string()}).strip().nullable()}).strip();
export const payrollWpsRawSchema = z.object({id, employee_id: id, wps_applicable: z.boolean(), wps_status: z.string(), bank_id: id.nullable(), account_holder_name: text, account_number: text, iban: text, exchange_house: text, salary_payment_method: z.string(), labour_card_number: text, mohre_person_code: text, mohre_establishment_id: id.nullable(), salary_effective_date: text, created_at: z.string(), updated_at: z.string(), deleted_at: text, bank: z.object({id, bank_name_en: z.string(), bank_code: text}).strip().nullable(), mohre_establishment: z.object({id, establishment_name: z.string(), establishment_number: z.string()}).strip().nullable()}).strip();
export const payrollWpsSchema = payrollWpsRawSchema.extend({iban: z.null(), account_number: z.null(), iban_masked: z.string(), account_number_masked: z.string()});
export const payrollReadinessSchema = z.object({status: z.enum(["ready", "incomplete", "on_hold", "exempt", "not_enrolled"]), missingRequirements: z.array(z.string())}).strict();
export const payrollPointSchemas = {
  profile: payrollProfileSchema.nullable(),
  "salary-totals": z.object({gross: z.number().finite(), basic: z.number().finite(), activeCount: z.number().int().nonnegative()}).strict(),
  wps: z.object({profile: payrollWpsSchema.nullable(), readiness: payrollReadinessSchema}).strict(),
  "component-detail": payrollComponentSchema,
};
export type PayrollPointKind = keyof typeof payrollPointSchemas;
export type PayrollPointMap = {[K in PayrollPointKind]: z.infer<(typeof payrollPointSchemas)[K]>};
export const payrollChoiceCriteriaSchema = z.object({employeeId: id, kind: z.enum(["payroll-groups", "salary-component-types", "mohre-establishments"]), page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(50), search: z.string().trim().max(200).default(""), selectedId: id.nullable().default(null)}).strict();
export const payrollChoiceRowSchema = z.object({id, code: z.string(), name_en: z.string(), name_ar: text, is_active: z.boolean()}).strip();
export const payrollChoicePageSchema = z.object({kind: payrollChoiceCriteriaSchema.shape.kind, employeeId: id, rows: z.array(payrollChoiceRowSchema), selected: payrollChoiceRowSchema.nullable(), totalCount: z.number().int().nonnegative().refine(Number.isSafeInteger), page: z.number().int().min(1), pageSize: z.number().int().min(1).max(100)}).strict().refine(p => p.rows.length === Math.min(p.pageSize, Math.max(0, p.totalCount - (p.page - 1) * p.pageSize)) && new Set(p.rows.map(r => r.id)).size === p.rows.length);
export type PayrollChoiceKind = z.infer<typeof payrollChoiceCriteriaSchema>["kind"];
