import {z} from "zod";
import {normalizeReadSorting, readSortingSchema} from "./read-sorting";
import {HR_ACTION_RECORD_CONFIG, hrActionRecordRowSchemas, hrActionRecordDetailSchemas} from "./hr-action-records-schema";
import {operationsRealDate, type HrOperationsField} from "./hr-operations-schema";
export {hrActionRecordIdentity as hrActionInquiryIdentity} from "./hr-action-records-schema";

export const HR_ACTION_INQUIRY_KINDS = ["pro", "disciplinary", "approvals", "eos"] as const;
export type HrActionInquiryKind = typeof HR_ACTION_INQUIRY_KINDS[number];
export const HR_ACTION_INQUIRY_FIELDS: Record<HrActionInquiryKind, readonly HrOperationsField[]> = {
  pro: HR_ACTION_RECORD_CONFIG.pro.fields,
  disciplinary: [
    {id: "employee_name", label: "Employee", type: "text"},
    {id: "employee_code", label: "Employee code", type: "text"},
    ...HR_ACTION_RECORD_CONFIG.disciplinary.fields,
  ],
  approvals: HR_ACTION_RECORD_CONFIG.approvals.fields,
  eos: [...HR_ACTION_RECORD_CONFIG.eos.fields,
    {id: "final_settlement_status", label: "Settlement", type: "select", options: ["not_started", "pending_finance", "completed"].map(value => ({value, label: value.replaceAll("_", " ")}))},
    {id: "clearance_completed", label: "Clearance", type: "select", options: [{value: "true", label: "Completed"}, {value: "false", label: "Pending"}]},
  ],
};
const id = z.number().int().positive().refine(Number.isSafeInteger);
const search = z.string().trim().max(200);
export const hrActionInquiryCriteriaSchema = z.object({
  kind: z.enum(HR_ACTION_INQUIRY_KINDS), page: z.number().int().min(1).max(100000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25), search: search.default(""),
  sortKey: z.string().max(100).optional(), sortDir: z.enum(["asc", "desc"]).optional(), sorting: readSortingSchema.optional(),
  columnFilters: z.record(z.string(), search).default({}),
}).strict().transform((p, ctx) => normalizeReadSorting(p, ctx, {allowed: HR_ACTION_INQUIRY_FIELDS[p.kind].map(field => field.id), defaultKey: HR_ACTION_RECORD_CONFIG[p.kind].sort, defaultDir: "desc"})).superRefine((p, ctx) => {
  const fields = HR_ACTION_INQUIRY_FIELDS[p.kind];
  if (!fields.some(f => f.id === p.sortKey)) ctx.addIssue({code: "custom", message: "Unsupported HR inquiry sort", path: ["sortKey"]});
  for (const [key, value] of Object.entries(p.columnFilters)) {
    const f = fields.find(field => field.id === key);
    if (!f || value && (f.type === "date" ? !operationsRealDate(value) : f.type === "select" ? !f.options?.some(o => o.value === value) : false)) {
      ctx.addIssue({code: "custom", message: "Invalid HR inquiry filter", path: ["columnFilters", key]});
    }
  }
});
export const hrActionInquiryEmployeeSchema = z.object({full_name_en: z.string(), full_name_ar: z.string().nullable(), employee_code: z.string()}).strip().nullable();
export const hrActionInquiryRowSchemas = {
  pro: hrActionRecordRowSchemas.pro,
  disciplinary: hrActionRecordRowSchemas.disciplinary.extend({employee: hrActionInquiryEmployeeSchema}),
  approvals: hrActionRecordRowSchemas.approvals,
  eos: hrActionRecordRowSchemas.eos,
};
const envelope = {page: z.number().int().min(1).max(100000), pageSize: z.number().int().min(1).max(100), totalCount: z.number().int().nonnegative().refine(Number.isSafeInteger)};
export const hrActionInquiryPageSchema = z.discriminatedUnion("kind", [
  z.object({...envelope, kind: z.literal("pro"), rows: z.array(hrActionInquiryRowSchemas.pro)}).strict(),
  z.object({...envelope, kind: z.literal("disciplinary"), rows: z.array(hrActionInquiryRowSchemas.disciplinary)}).strict(),
  z.object({...envelope, kind: z.literal("approvals"), rows: z.array(hrActionInquiryRowSchemas.approvals)}).strict(),
  z.object({...envelope, kind: z.literal("eos"), rows: z.array(hrActionInquiryRowSchemas.eos)}).strict(),
]).refine(p => p.rows.length === Math.min(p.pageSize, Math.max(0, p.totalCount - (p.page - 1) * p.pageSize)) && new Set(p.rows.map(r => r.id)).size === p.rows.length);
export const hrDisciplinaryInquiryDetailCriteriaSchema = z.object({recordId: id, employeeId: id}).strict();
export const hrDisciplinaryInquiryDetailSchema = hrActionRecordDetailSchemas.disciplinary.extend({employee: hrActionInquiryEmployeeSchema}).strip();
export type HrActionInquiryCriteria = z.infer<typeof hrActionInquiryCriteriaSchema>;
export type HrActionInquiryPage = z.infer<typeof hrActionInquiryPageSchema>;
export type HrActionInquiryRowMap = {[K in HrActionInquiryKind]: z.infer<(typeof hrActionInquiryRowSchemas)[K]>};
export type HrDisciplinaryInquiryDetail = z.infer<typeof hrDisciplinaryInquiryDetailSchema>;
