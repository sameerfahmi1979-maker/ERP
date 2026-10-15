import {z} from "zod";
import {normalizeReadSorting, readSortingSchema} from "./read-sorting";
import {operationsRealDate, type HrOperationsField} from "./hr-operations-schema";
export {hrReadIdentity as hrActionRecordIdentity} from "./hr-read-identity";

export const HR_ACTION_RECORD_KINDS = ["pro", "actions", "performance", "disciplinary", "notes", "approvals", "eos", "clearance"] as const;
export type HrActionRecordKind = typeof HR_ACTION_RECORD_KINDS[number];
const text = (id: string, label: string): HrOperationsField => ({id, label, type: "text"});
const date = (id: string, label: string): HrOperationsField => ({id, label, type: "date"});
const select = (id: string, label: string, values: readonly string[]): HrOperationsField => ({id, label, type: "select", options: values.map(value => ({value, label: value.replaceAll("_", " ")}))});
const processStatus = ["draft", "requested", "in_progress", "waiting_for_document", "submitted", "approved", "rejected", "cancelled", "completed"] as const;
const actionStatus = ["open", "in_progress", "closed", "cancelled"] as const;
const reviewStatus = ["draft", "submitted", "approved", "closed", "cancelled"] as const;
const disciplineStatus = ["open", "under_review", "closed", "cancelled"] as const;
const approvalStatus = ["pending", "approved", "rejected", "cancelled"] as const;
const eosStatus = ["draft", "notice_served", "clearance_in_progress", "pending_final_settlement", "closed", "cancelled"] as const;
const clearanceStatus = ["pending", "cleared", "not_applicable", "blocked"] as const;
const reviewType = ["probation", "annual", "project", "incident_followup", "other"] as const;
const actionType = ["general", "probation_review", "transfer", "promotion", "increment_recommendation", "status_change", "warning", "memo", "other"] as const;
const disciplineType = ["verbal_warning", "written_warning", "final_warning", "suspension_notice", "incident", "other"] as const;
const approvalType = ["hr_action", "pro_process", "performance", "disciplinary", "eos", "clearance", "other"] as const;
const eosType = ["resignation", "termination", "contract_end", "absconding", "death", "other"] as const;
const clearanceArea = ["hr", "operations", "it", "finance", "camp", "workshop", "store", "hse", "other"] as const;
const noteType = ["general", "confidential", "management", "legal", "other"] as const;
const visibility = ["hr_only", "management", "restricted"] as const;
const priority = ["low", "normal", "high", "urgent"] as const;
const rating = ["excellent", "good", "satisfactory", "needs_improvement", "unsatisfactory"] as const;
const severity = ["low", "medium", "high", "critical"] as const;
/** Static existing native identifiers only. Separate confidential capability is
 * not replaced by ordinary action viewing. Large wording is point-detail data. */
export const HR_ACTION_RECORD_CONFIG = {
  pro: {table: "employee_pro_processes", prefix: "pro-processes", sort: "created_at", confidential: false, bodySearch: ["notes"], fields: [text("process_title", "Process Title"), select("process_status", "Status", processStatus), select("priority", "Priority", priority), date("request_date", "Request Date"), date("target_date", "Target Date"), date("created_at", "Created (UTC)")]},
  actions: {table: "employee_hr_actions", prefix: "hr-actions", sort: "action_date", confidential: false, bodySearch: ["notes"], fields: [text("action_title", "Action Title"), select("action_status", "Status", actionStatus), select("action_type", "Action Type", actionType), date("action_date", "Action Date"), date("due_date", "Due Date")]},
  performance: {table: "employee_performance_records", prefix: "performance", sort: "review_date", confidential: true, bodySearch: ["summary"], fields: [select("review_type", "Review Type", reviewType), select("status", "Status", reviewStatus), select("rating", "Rating", rating), date("review_date", "Review Date"), date("review_period_start", "Period Start"), date("review_period_end", "Period End")]},
  disciplinary: {table: "employee_disciplinary_records", prefix: "disciplinary", sort: "record_date", confidential: true, bodySearch: ["description"], fields: [text("subject", "Subject"), select("disciplinary_type", "Type", disciplineType), select("severity", "Severity", severity), select("status", "Status", disciplineStatus), date("record_date", "Record Date"), date("incident_date", "Incident Date")]},
  notes: {table: "employee_hr_notes", prefix: "notes", sort: "created_at", confidential: true, bodySearch: ["note_text"], fields: [select("note_type", "Note Type", noteType), select("visibility", "Visibility", visibility), date("created_at", "Created (UTC)")]},
  approvals: {table: "employee_approval_requests", prefix: "approvals", sort: "requested_at", confidential: false, bodySearch: ["decision_reason"], fields: [text("request_title", "Request Title"), select("request_status", "Status", approvalStatus), select("approval_type", "Type", approvalType), date("requested_at", "Requested (UTC)")]},
  eos: {table: "employee_eos_cases", prefix: "eos-cases", sort: "created_at", confidential: false, bodySearch: ["reason", "notes"], fields: [select("eos_type", "EOS Type", eosType), select("case_status", "Status", eosStatus), date("last_working_date", "Last Working Date"), date("notice_date", "Notice Date"), date("created_at", "Created (UTC)")]},
  clearance: {table: "employee_clearance_items", prefix: "clearance-items", sort: "clearance_area", confidential: false, bodySearch: ["notes"], fields: [text("item_title", "Item"), select("clearance_area", "Area", clearanceArea), select("item_status", "Status", clearanceStatus), date("created_at", "Created (UTC)")]},
} as const;

const id = z.number().int().positive().refine(Number.isSafeInteger), search = z.string().trim().max(200), nativeDate = z.string().refine(operationsRealDate), timestamp = z.iso.datetime({offset: true});
export const hrActionRecordCriteriaSchema = z.object({kind: z.enum(HR_ACTION_RECORD_KINDS), employeeId: id, eosCaseId: id.optional(), page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25), search: search.default(""), sortKey: z.string().max(100).optional(), sortDir: z.enum(["asc", "desc"]).optional(), sorting: readSortingSchema.optional(), columnFilters: z.record(z.string(), search).default({})}).strict().transform((p, ctx) => normalizeReadSorting(p, ctx, {allowed: HR_ACTION_RECORD_CONFIG[p.kind].fields.map(field => field.id), defaultKey: HR_ACTION_RECORD_CONFIG[p.kind].sort, defaultDir: "desc", emptyDir: p.kind === "clearance" ? "asc" : "desc"})).superRefine((p, ctx) => {
  if ((p.kind === "clearance") !== (p.eosCaseId !== undefined)) ctx.addIssue({code: "custom", message: "Clearance requires its EOS subject; other records do not accept one", path: ["eosCaseId"]});
  const fields: readonly HrOperationsField[] = HR_ACTION_RECORD_CONFIG[p.kind].fields;
  if (!fields.some(f => f.id === p.sortKey)) ctx.addIssue({code: "custom", message: "Unsupported HR action sort", path: ["sortKey"]});
  for (const [key, value] of Object.entries(p.columnFilters)) {
    const field = fields.find(f => f.id === key);
    if (!field) {ctx.addIssue({code: "custom", message: "Unsupported HR action filter", path: ["columnFilters", key]}); continue;}
    if (value && (field.type === "date" ? !operationsRealDate(value) : field.type === "select" ? !field.options?.some(o => o.value === value) : false)) ctx.addIssue({code: "custom", message: "Invalid HR action filter", path: ["columnFilters", key]});
  }
});
export const hrActionRecordDetailCriteriaSchema = z.object({kind: z.enum(HR_ACTION_RECORD_KINDS), employeeId: id, eosCaseId: id.optional(), recordId: id}).strict().superRefine((p, ctx) => {
  if ((p.kind === "clearance") !== (p.eosCaseId !== undefined)) ctx.addIssue({code: "custom", message: "Invalid EOS subject", path: ["eosCaseId"]});
});
const base = {id, employee_id: id};
const pro = z.object({...base, process_title: z.string(), process_status: z.enum(processStatus), priority: z.enum(priority), request_date: nativeDate, target_date: nativeDate.nullable(), created_at: timestamp}).strip();
const actions = z.object({...base, action_title: z.string(), action_type: z.enum(actionType), action_status: z.enum(actionStatus), action_date: nativeDate, due_date: nativeDate.nullable()}).strip();
const performance = z.object({...base, review_type: z.enum(reviewType), status: z.enum(reviewStatus), review_date: nativeDate, review_period_start: nativeDate.nullable(), review_period_end: nativeDate.nullable(), rating: z.enum(rating).nullable()}).strip();
const disciplinary = z.object({...base, subject: z.string(), disciplinary_type: z.enum(disciplineType), severity: z.enum(severity), status: z.enum(disciplineStatus), record_date: nativeDate, incident_date: nativeDate.nullable(), acknowledged_by_employee: z.boolean()}).strip();
const notes = z.object({...base, note_type: z.enum(noteType), visibility: z.enum(visibility), created_at: timestamp}).strip();
const approvals = z.object({...base, request_title: z.string(), request_status: z.enum(approvalStatus), approval_type: z.enum(approvalType), requested_at: timestamp}).strip();
const eos = z.object({...base, eos_type: z.enum(eosType), case_status: z.enum(eosStatus), last_working_date: nativeDate.nullable(), notice_date: nativeDate.nullable(), final_settlement_status: z.enum(["not_started", "pending_finance", "completed"]), clearance_completed: z.boolean(), created_at: timestamp}).strip();
const clearance = z.object({...base, eos_case_id: id, item_title: z.string(), clearance_area: z.enum(clearanceArea), item_status: z.enum(clearanceStatus), created_at: timestamp}).strip();
export const hrActionRecordRowSchemas = {pro, actions, performance, disciplinary, notes, approvals, eos, clearance};
const audit = {created_at: timestamp, updated_at: timestamp, created_by: id.nullable(), updated_by: id.nullable(), deleted_at: timestamp.nullable()};
const relationship = {related_record_type: z.string().nullable(), related_record_id: id.nullable()};
const person = z.object({display_name: z.string().nullable()}).strip().nullable();
export const hrActionRecordDetailSchemas = {
  pro: pro.extend({...audit, ...relationship, process_type_id: id.nullable(), submitted_date: nativeDate.nullable(), completed_date: nativeDate.nullable(), assigned_to: id.nullable(), related_document_id: id.nullable(), notes: z.string().nullable(), process_type: z.object({name_en: z.string()}).strip().nullable(), assigned_to_profile: person}).strip(),
  actions: actions.extend({...audit, ...relationship, assigned_to: id.nullable(), dms_document_id: id.nullable(), requires_approval: z.boolean(), approval_request_id: id.nullable(), notes: z.string().nullable()}).strip(),
  performance: performance.extend({...audit, reviewer_id: id.nullable(), summary: z.string().nullable(), strengths: z.string().nullable(), improvement_areas: z.string().nullable(), next_review_date: nativeDate.nullable(), dms_document_id: id.nullable(), reviewer: person}).strip(),
  disciplinary: disciplinary.extend({...audit, description: z.string().nullable(), action_taken: z.string().nullable(), issued_by: id.nullable(), acknowledged_at: timestamp.nullable(), dms_document_id: id.nullable(), creates_operational_block: z.boolean(), operational_block_id: id.nullable(), issued_by_profile: person}).strip(),
  notes: notes.extend({...relationship, note_text: z.string(), created_by: id.nullable(), deleted_at: timestamp.nullable()}).strip(),
  approvals: approvals.extend({...audit, ...relationship, approval_role_id: id.nullable(), requested_by: id.nullable(), approved_by: id.nullable(), approved_at: timestamp.nullable(), rejected_by: id.nullable(), rejected_at: timestamp.nullable(), cancelled_by: id.nullable(), cancelled_at: timestamp.nullable(), decision_reason: z.string().nullable(), approval_role: z.object({name: z.string()}).strip().nullable(), requested_by_profile: person}).strip(),
  eos: eos.extend({...audit, reason: z.string().nullable(), notes: z.string().nullable(), dms_document_id: id.nullable()}).strip(),
  clearance: clearance.extend({...audit, responsible_user_id: id.nullable(), cleared_by: id.nullable(), cleared_at: timestamp.nullable(), notes: z.string().nullable()}).strip(),
};
export const hrActionRecordPageSchema = z.object({kind: z.enum(HR_ACTION_RECORD_KINDS), employeeId: id, eosCaseId: id.optional(), page: z.number().int().min(1).max(100000), pageSize: z.number().int().min(1).max(100), totalCount: z.number().int().nonnegative().refine(Number.isSafeInteger), rows: z.array(z.unknown())}).strict().transform((p, ctx) => {
  const rows = z.array(hrActionRecordRowSchemas[p.kind]).safeParse(p.rows);
  if ((p.kind === "clearance") !== (p.eosCaseId !== undefined) || !rows.success || p.rows.length !== Math.min(p.pageSize, Math.max(0, p.totalCount - (p.page - 1) * p.pageSize)) || new Set(rows.success ? rows.data.map(r => r.id) : []).size !== p.rows.length || rows.success && rows.data.some(r => r.employee_id !== p.employeeId || p.kind === "clearance" && (r as {eos_case_id?: number}).eos_case_id !== p.eosCaseId)) {ctx.addIssue({code: "custom", message: "Incomplete or mismatched HR action page"}); return z.NEVER;}
  return {...p, rows: rows.data as Record<string, unknown>[]};
});
export const hrActionRecordDetailSchema = z.object({kind: z.enum(HR_ACTION_RECORD_KINDS), employeeId: id, eosCaseId: id.optional(), row: z.unknown()}).strict().transform((p, ctx) => {
  const row = hrActionRecordDetailSchemas[p.kind].safeParse(p.row);
  if ((p.kind === "clearance") !== (p.eosCaseId !== undefined) || !row.success || row.data.employee_id !== p.employeeId || p.kind === "clearance" && (row.data as {eos_case_id?: number}).eos_case_id !== p.eosCaseId) {ctx.addIssue({code: "custom", message: "Incomplete or mismatched HR action detail"}); return z.NEVER;}
  return {...p, row: row.data as Record<string, unknown>};
});
export type HrActionRecordCriteria = z.infer<typeof hrActionRecordCriteriaSchema>;
export type HrActionRecordPage = z.infer<typeof hrActionRecordPageSchema>;
export type HrActionRecordRowMap = {[K in HrActionRecordKind]: z.infer<(typeof hrActionRecordRowSchemas)[K]>};
