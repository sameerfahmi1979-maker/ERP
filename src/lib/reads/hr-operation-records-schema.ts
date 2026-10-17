import {z} from "zod";
import {normalizeReadSorting, readSortingSchema} from "./read-sorting";
import {operationsRealDate, type HrOperationsField} from "./hr-operations-schema";
export {hrOperationsReadIdentity as hrOperationRecordIdentity} from "./hr-operations-schema";
export const HR_OPERATION_RECORD_KINDS = ["assignments", "requirements", "readiness", "blocks", "assets", "ppe", "accommodation"] as const;
export type HrOperationRecordKind = typeof HR_OPERATION_RECORD_KINDS[number];
const text = (id: string, label: string): HrOperationsField => ({id, label, type: "text"});
const date = (id: string, label: string): HrOperationsField => ({id, label, type: "date"});
const select = (id: string, label: string, values: readonly string[]): HrOperationsField => ({id, label, type: "select", options: values.map(value => ({value, label: value.replaceAll("_", " ")}))});
/** Only fields already permitted by each original reader. No inferred columns,
 * secret notes in search, dynamic relation names or new business capability. */
export const HR_OPERATION_RECORD_CONFIG = {
  assignments: {table: "employee_assignments", prefix: "assignments", sort: "effective_from", fields: [select("assignment_status", "Assignment Status", ["active", "planned", "completed", "cancelled"]), date("effective_from", "Effective From"), date("effective_to", "Effective To"), select("assignment_type", "Assignment Type", ["primary", "temporary", "project", "site", "department", "relief"]), text("site_name", "Work Site"), text("department_name", "Department"), text("designation_name", "Designation")]},
  requirements: {table: "employee_role_requirements", prefix: "role-requirements", sort: "requirement_type", fields: [select("requirement_type", "Requirement Type", ["document", "training", "medical", "access_card", "license", "other"]), select("status", "Status", ["met", "missing", "expired", "expiring_soon", "waived", "not_required"]), text("requirement_name", "Requirement Name"), date("expiry_date", "Expiry Date")]},
  readiness: {table: "employee_site_readiness", prefix: "site-readiness", sort: "checked_at", fields: [select("readiness_status", "Readiness Status", ["ready", "not_ready", "blocked", "expired", "needs_review"]), date("checked_at", "Checked At (UTC)"), text("site_name", "Work Site")]},
  blocks: {table: "employee_operational_blocks", prefix: "blocks", sort: "created_at", fields: [select("block_type", "Block Type", ["compliance", "medical", "training", "access", "payroll", "hr_hold", "operations", "safety", "other"]), select("block_status", "Block Status", ["active", "released", "expired", "cancelled"]), text("block_reason", "Block Reason"), date("effective_from", "Effective From"), date("effective_to", "Effective To"), date("created_at", "Created At (UTC)")]},
  assets: {table: "employee_assets", prefix: "assets", sort: "issued_date", fields: [text("asset_description", "Asset Description"), date("issued_date", "Issued Date"), select("status", "Status", ["issued", "returned", "lost", "damaged", "cancelled"]), text("asset_reference", "Asset Reference"), select("asset_type", "Asset Type", ["id_card", "phone", "sim", "laptop", "vehicle", "tool", "key", "other"]), date("return_due_date", "Return Due Date"), date("returned_date", "Returned Date")]},
  ppe: {table: "employee_ppe_issues", prefix: "ppe", sort: "issued_date", fields: [text("ppe_item", "PPE Item"), date("issued_date", "Issued Date"), text("standard_or_size", "Size / Standard"), {id: "quantity", label: "Quantity", type: "number"} as HrOperationsField, select("status", "Status", ["issued", "returned", "expired", "lost", "damaged", "cancelled"]), date("expiry_or_replacement_date", "Expiry / Replacement Date"), date("returned_date", "Returned Date")]},
  accommodation: {table: "employee_accommodation_records", prefix: "accommodation", sort: "assigned_from", fields: [date("assigned_from", "Assigned From"), date("assigned_to", "Assigned To"), text("accommodation_location", "Location"), text("room_or_bed_no", "Room / Bed"), select("accommodation_type", "Accommodation Type", ["company_camp", "rented_room", "allowance", "other"]), select("status", "Status", ["active", "ended", "cancelled"])]},
} as const;
const id = z.number().int().positive().refine(Number.isSafeInteger), search = z.string().trim().max(200), nativeDate = z.string().refine(operationsRealDate), timestamp = z.iso.datetime({offset: true});
export const hrOperationRecordCriteriaSchema = z.object({kind: z.enum(HR_OPERATION_RECORD_KINDS), employeeId: id, page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25), search: search.default(""), sortKey: z.string().max(100).optional(), sortDir: z.enum(["asc", "desc"]).optional(), sorting: readSortingSchema.optional(), columnFilters: z.record(z.string(), search).default({})}).strict().transform((p, ctx) => normalizeReadSorting(p, ctx, {allowed: HR_OPERATION_RECORD_CONFIG[p.kind].fields.map(field => field.id), defaultKey: HR_OPERATION_RECORD_CONFIG[p.kind].sort, defaultDir: "desc", emptyDir: p.kind === "requirements" ? "asc" : "desc"})).superRefine((p, ctx) => {
  const fields: readonly HrOperationsField[] = HR_OPERATION_RECORD_CONFIG[p.kind].fields;
  if (!fields.some(f => f.id === p.sortKey)) ctx.addIssue({code: "custom", message: "Unsupported operational record sort", path: ["sortKey"]});
  for (const [key, value] of Object.entries(p.columnFilters)) {
    const f = fields.find(field => field.id === key);
    if (!f) {ctx.addIssue({code: "custom", message: "Unsupported operational record filter", path: ["columnFilters", key]}); continue;}
    if (!value) continue;
    const valid = f.type === "number" ? Number.isFinite(Number(value)) && Number(value) > 0 && /^\d+(\.\d+)?$/.test(value) : f.type === "date" ? operationsRealDate(value) : f.type === "select" ? !!f.options?.some(o => o.value === value) : true;
    if (!valid) ctx.addIssue({code: "custom", message: "Invalid operational record filter", path: ["columnFilters", key]});
  }
});
export const hrOperationRecordDetailCriteriaSchema = z.object({kind: z.enum(HR_OPERATION_RECORD_KINDS), employeeId: id, recordId: id}).strict();
const label = z.object({id, name_en: z.string()}).strip().nullable(), named = z.object({id, name: z.string()}).strip().nullable(), person = z.object({id, full_name_en: z.string(), employee_code: z.string()}).strip().nullable();
const assignment = z.object({id, assignment_type: z.enum(["primary", "temporary", "project", "site", "department", "relief"]), assignment_status: z.enum(["active", "planned", "completed", "cancelled"]), effective_from: nativeDate, effective_to: nativeDate.nullable(), departments: label, designations: label, work_sites: label}).strip();
const requirement = z.object({id, requirement_type: z.enum(["document", "training", "medical", "access_card", "license", "other"]), requirement_name: z.string(), is_required: z.boolean(), is_met: z.boolean(), status: z.enum(["met", "missing", "expired", "expiring_soon", "waived", "not_required"]), expiry_date: nativeDate.nullable()}).strip();
const readiness = z.object({id, readiness_status: z.enum(["ready", "not_ready", "blocked", "expired", "needs_review"]), checked_at: timestamp, work_sites: label}).strip();
const block = z.object({id, block_type: z.enum(["compliance", "medical", "training", "access", "payroll", "hr_hold", "operations", "safety", "other"]), block_reason: z.string(), block_status: z.enum(["active", "released", "expired", "cancelled"]), effective_from: nativeDate, effective_to: nativeDate.nullable(), created_at: timestamp}).strip();
const asset = z.object({id, asset_type: z.enum(["id_card", "phone", "sim", "laptop", "vehicle", "tool", "key", "other"]), asset_description: z.string(), asset_reference: z.string().nullable(), issued_date: nativeDate, return_due_date: nativeDate.nullable(), returned_date: nativeDate.nullable(), status: z.enum(["issued", "returned", "lost", "damaged", "cancelled"])}).strip();
const ppe = z.object({id, ppe_item: z.string(), standard_or_size: z.string().nullable(), quantity: z.number().positive().finite(), issued_date: nativeDate, expiry_or_replacement_date: nativeDate.nullable(), returned_date: nativeDate.nullable(), status: z.enum(["issued", "returned", "expired", "lost", "damaged", "cancelled"])}).strip();
const accommodation = z.object({id, accommodation_type: z.enum(["company_camp", "rented_room", "allowance", "other"]).nullable(), accommodation_location: z.string().nullable(), room_or_bed_no: z.string().nullable(), assigned_from: nativeDate, assigned_to: nativeDate.nullable(), status: z.enum(["active", "ended", "cancelled"])}).strip();
export const hrOperationRecordRowSchemas = {assignments: assignment, requirements: requirement, readiness, blocks: block, assets: asset, ppe, accommodation};
/** Point detail retains the ORIGINAL allowed projection for existing editors. */
export const hrOperationRecordDetailSchemas = {
  assignments: assignment.extend({notes: z.string().nullable(), created_at: timestamp, updated_at: timestamp, owner_companies: named, branches: named, reporting_manager: person, supervisor: person}).strip(),
  requirements: requirement.extend({waived_at: timestamp.nullable(), waiver_reason: z.string().nullable(), met_record_type: z.string().nullable(), met_record_id: id.nullable(), created_at: timestamp, updated_at: timestamp, designations: label}).strip(),
  readiness: readiness.extend({notes: z.string().nullable(), missing_requirements_json: z.unknown().nullable(), hr_access_card_types: label}).strip(),
  blocks: block.extend({released_at: timestamp.nullable(), release_reason: z.string().nullable(), related_record_type: z.string().nullable(), notes: z.string().nullable()}).strip(),
  assets: asset.extend({condition_on_issue: z.string().nullable(), condition_on_return: z.string().nullable(), notes: z.string().nullable(), created_at: timestamp}).strip(),
  ppe: ppe.extend({notes: z.string().nullable(), created_at: timestamp}).strip(),
  accommodation: accommodation.extend({notes: z.string().nullable(), created_at: timestamp}).strip(),
};
const pageEnvelope = z.object({kind: z.enum(HR_OPERATION_RECORD_KINDS), employeeId: id, page: z.number().int().min(1).max(100000), pageSize: z.number().int().min(1).max(100), totalCount: z.number().int().nonnegative().refine(Number.isSafeInteger), rows: z.array(z.unknown())}).strict();
export const hrOperationRecordPageSchema = pageEnvelope.transform((p, ctx) => {
  const parsed = z.array(hrOperationRecordRowSchemas[p.kind]).safeParse(p.rows);
  if (!parsed.success || p.rows.length !== Math.min(p.pageSize, Math.max(0, p.totalCount - (p.page - 1) * p.pageSize)) || new Set(parsed.success ? parsed.data.map(r => r.id) : []).size !== p.rows.length) {ctx.addIssue({code: "custom", message: "Incomplete operational record page"}); return z.NEVER;}
  return {...p, rows: parsed.data as Record<string, unknown>[]};
});
export const hrOperationRecordDetailSchema = z.object({kind: z.enum(HR_OPERATION_RECORD_KINDS), employeeId: id, row: z.unknown()}).strict().transform((p, ctx) => {
  const parsed = hrOperationRecordDetailSchemas[p.kind].safeParse(p.row);
  if (!parsed.success) {ctx.addIssue({code: "custom", message: "Incomplete operational record detail"}); return z.NEVER;}
  return {...p, row: parsed.data as Record<string, unknown>};
});
export type HrOperationRecordCriteria = z.infer<typeof hrOperationRecordCriteriaSchema>;
export type HrOperationRecordPage = z.infer<typeof hrOperationRecordPageSchema>;
