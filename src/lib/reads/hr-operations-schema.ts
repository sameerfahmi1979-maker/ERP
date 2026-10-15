import {z} from "zod";
export {hrReadIdentity as hrOperationsReadIdentity} from "./hr-read-identity";
export const HR_OPERATIONS_KINDS = ["assignments", "blocks", "readiness"] as const;
export type HrOperationsKind = typeof HR_OPERATIONS_KINDS[number];
export type HrOperationsField = {id: string; label: string; type: "text" | "number" | "select" | "date"; options?: {value: string; label: string}[]};
const text = (id: string, label: string): HrOperationsField => ({id, label, type: "text"});
const date = (id: string, label: string): HrOperationsField => ({id, label, type: "date"});
const select = (id: string, label: string, values: readonly string[]): HrOperationsField => ({id, label, type: "select", options: values.map(value => ({value, label: value.replaceAll("_", " ")}))});
const employee: HrOperationsField[] = [text("employee_name", "Employee"), text("employee_code", "Employee code"), {id: "employee_id", label: "Employee ID", type: "number"}];
const assignmentStatuses = ["active", "planned", "completed", "cancelled"] as const;
const blockStatuses = ["active", "released", "expired", "cancelled"] as const;
const readinessStatuses = ["ready", "not_ready", "blocked", "expired", "needs_review"] as const;
/** Static native identifiers only. User input never chooses a table or SQL path. */
export const HR_OPERATIONS_CONFIG = {
  assignments: {table: "employee_assignments", title: "Employee Assignments", description: "All employee operational assignments", sort: "effective_from", status: "assignment_status", defaultStatus: "active", statuses: assignmentStatuses, search: ["assignment_type", "assignment_status"], fields: [...employee, select("assignment_type", "Assignment type", ["primary", "temporary", "project", "site", "department", "relief"]), select("assignment_status", "Status", assignmentStatuses), date("effective_from", "Effective from"), date("effective_to", "Effective to"), text("company_name", "Company"), text("department_name", "Department"), text("designation_name", "Designation"), text("site_name", "Work site")]},
  blocks: {table: "employee_operational_blocks", title: "Operational Blocks", description: "All employee operational blocks", sort: "created_at", status: "block_status", defaultStatus: "active", statuses: blockStatuses, search: ["block_type", "block_status", "block_reason"], fields: [...employee, select("block_type", "Block type", ["compliance", "medical", "training", "access", "payroll", "hr_hold", "operations", "safety", "other"]), select("block_status", "Status", blockStatuses), text("block_reason", "Reason"), date("created_at", "Created date (UTC)"), date("effective_from", "Effective from"), date("effective_to", "Effective to")]},
  readiness: {table: "employee_site_readiness", title: "Readiness Monitor", description: "Employee site readiness status across all work sites", sort: "checked_at", status: "readiness_status", defaultStatus: "", statuses: readinessStatuses, search: ["readiness_status"], fields: [...employee, select("readiness_status", "Status", readinessStatuses), text("site_name", "Work site"), date("checked_at", "Checked date (UTC)")]},
} as const;
const id = z.number().int().positive().refine(Number.isSafeInteger), search = z.string().trim().max(200);
export const operationsRealDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && value.slice(0, 4) !== "0000" && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export const hrOperationsCriteriaSchema = z.object({kind: z.enum(HR_OPERATIONS_KINDS), page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25), search: search.default(""), sortKey: z.string().max(100).optional(), sortDir: z.enum(["asc", "desc"]).default("desc"), columnFilters: z.record(z.string(), search).default({}), status: z.string().max(30).optional(), employeeId: id.optional(), workSiteId: id.optional(), departmentId: id.optional(), designationId: id.optional()}).strict().transform(p => ({...p, sortKey: p.sortKey ?? HR_OPERATIONS_CONFIG[p.kind].sort})).superRefine((p, ctx) => {
  const fields: readonly HrOperationsField[] = HR_OPERATIONS_CONFIG[p.kind].fields;
  if (!fields.some(f => f.id === p.sortKey)) ctx.addIssue({code: "custom", message: "Unsupported operational sort", path: ["sortKey"]});
  if (p.status && !(HR_OPERATIONS_CONFIG[p.kind].statuses as readonly string[]).includes(p.status)) ctx.addIssue({code: "custom", message: "Invalid operational status", path: ["status"]});
  if (p.kind === "blocks" && p.workSiteId || p.kind !== "assignments" && (p.departmentId || p.designationId)) ctx.addIssue({code: "custom", message: "Unsupported operational criteria"});
  for (const [key, value] of Object.entries(p.columnFilters)) {
    const f = fields.find(field => field.id === key);
    if (!f) {ctx.addIssue({code: "custom", message: "Unsupported operational filter", path: ["columnFilters", key]}); continue;}
    if (!value) continue;
    const valid = f.type === "number" ? /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 : f.type === "date" ? operationsRealDate(value) : f.type === "select" ? !!f.options?.some(o => o.value === value) : true;
    if (!valid) ctx.addIssue({code: "custom", message: "Invalid operational filter", path: ["columnFilters", key]});
  }
});
const person = z.object({id, full_name_en: z.string(), full_name_ar: z.string().nullable(), employee_code: z.string()}).strip().nullable();
const label = z.object({id, name_en: z.string()}).strip().nullable();
const nativeDate = z.string().refine(operationsRealDate), timestamp = z.iso.datetime({offset: true});
export const hrAssignmentRowSchema = z.object({id, employee_id: id, assignment_type: z.enum(["primary", "temporary", "project", "site", "department", "relief"]), assignment_status: z.enum(assignmentStatuses), effective_from: nativeDate, effective_to: nativeDate.nullable(), employee: person, company: label, department: label, designation: label, site: label}).strip();
export const hrBlockRowSchema = z.object({id, employee_id: id, block_type: z.enum(["compliance", "medical", "training", "access", "payroll", "hr_hold", "operations", "safety", "other"]), block_reason: z.string(), block_status: z.enum(blockStatuses), effective_from: nativeDate, effective_to: nativeDate.nullable(), created_at: timestamp, employee: person}).strip();
export const hrReadinessRowSchema = z.object({id, employee_id: id, readiness_status: z.enum(readinessStatuses), checked_at: timestamp, employee: person, site: label}).strip();
const envelope = {page: z.number().int().min(1).max(100000), pageSize: z.number().int().min(1).max(100), totalCount: z.number().int().nonnegative().refine(Number.isSafeInteger)};
export const hrOperationsPageSchema = z.discriminatedUnion("kind", [z.object({...envelope, kind: z.literal("assignments"), rows: z.array(hrAssignmentRowSchema)}).strict(), z.object({...envelope, kind: z.literal("blocks"), rows: z.array(hrBlockRowSchema)}).strict(), z.object({...envelope, kind: z.literal("readiness"), rows: z.array(hrReadinessRowSchema)}).strict()]).refine(p => p.rows.length === Math.min(p.pageSize, Math.max(0, p.totalCount - (p.page - 1) * p.pageSize)) && new Set(p.rows.map(row => row.id)).size === p.rows.length);
export type HrOperationsCriteria = z.infer<typeof hrOperationsCriteriaSchema>;
export type HrOperationsPage = z.infer<typeof hrOperationsPageSchema>;
export type HrOperationsRow = HrOperationsPage["rows"][number];
