import {z} from "zod";
export {hrReadIdentity as reportHistoryIdentity} from "./hr-read-identity";

const id = z.number().int().positive().refine(Number.isSafeInteger);
const text = z.string().trim().max(200);
// This explicit complete-result contract replaces the legacy loaded-sample
// auto comparator; natural-key/collation acceptance is a deployment gate.
export const REPORT_HISTORY_ORDER_CONTRACT = "RH-NATURAL-ICU-UTF8-V1";
export const REPORT_HISTORY_SORT_KEYS = ["report", "output_format", "run_status", "row_count", "duration", "run_by", "started_at"] as const;
export const reportHistorySortingSchema = z.array(z.object({id: z.enum(REPORT_HISTORY_SORT_KEYS), desc: z.boolean()}).strict()).max(7)
  .refine(v => new Set(v.map(s => s.id)).size === v.length, "Duplicate report history sort");
const integerFilter = text.refine(v => v === "" || /^-?\d+$/.test(v) && Number.isSafeInteger(Number(v)) && Number(v) >= -2147483648 && Number(v) <= 2147483647);
const date = text.refine(v => v === "" || /^\d{4}-\d{2}-\d{2}$/.test(v) && Number.isFinite(Date.parse(v + "T00:00:00Z")) && new Date(v + "T00:00:00Z").toISOString().slice(0, 10) === v);
export const REPORT_RUN_STATUSES = ["success", "failed", "cancelled", "running"] as const;
export const REPORT_RUN_FORMATS = ["screen", "pdf", "excel", "csv", "print", "email"] as const;
export const reportHistoryCriteriaSchema = z.object({
  mode: z.literal("list").default("list"), page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25),
  search: z.string().max(200).default(""), sorting: reportHistorySortingSchema.default([{id: "started_at", desc: true}]),
  columnFilters: z.object({report_code: text.optional(), run_reference: text.optional(), output_format: z.enum(["", ...REPORT_RUN_FORMATS]).optional(), run_status: z.enum(["", ...REPORT_RUN_STATUSES]).optional(), row_count: integerFilter.optional(), duration: integerFilter.optional(), started_at: date.optional()}).strict().default({}),
}).strict();
export const reportHistoryDetailCriteriaSchema = z.object({mode: z.literal("detail"), recordId: id}).strict();
export const reportHistoryRequestSchema = z.union([reportHistoryCriteriaSchema, reportHistoryDetailCriteriaSchema]);
const timestamp = z.iso.datetime({offset: true}).nullable();
export const reportHistoryRowSchema = z.object({
  id, report_code: z.string(), run_reference: z.string().nullable(), run_status: z.enum(REPORT_RUN_STATUSES).nullable(), output_format: z.enum(REPORT_RUN_FORMATS),
  row_count: z.number().int().nullable(), duration_ms: z.number().int().nullable(), run_by: id.nullable(), started_at: timestamp,
  sensitive_data_included: z.boolean().nullable(), was_multi_company: z.boolean().nullable(),
  report: z.object({report_name_en: z.string(), module_code: z.string()}).strip().nullable(), runner: z.object({display_name: z.string().nullable()}).strip().nullable(),
}).strip();
export const reportHistoryPageSchema = z.object({mode: z.literal("list"), page: z.number().int().min(1).max(100000), pageSize: z.number().int().min(1).max(100), totalCount: z.number().int().nonnegative().refine(Number.isSafeInteger), rows: z.array(reportHistoryRowSchema)}).strict()
  .refine(v => v.rows.length === Math.min(v.pageSize, Math.max(0, v.totalCount - (v.page - 1) * v.pageSize)) && new Set(v.rows.map(r => r.id)).size === v.rows.length, "Incomplete report history page");
export const reportHistoryDetailSchema = reportHistoryRowSchema.extend({
  completed_at: timestamp, template_selected_manually: z.boolean().nullable(), error_message: z.string().nullable(),
  redaction_summary_json: z.object({wasRedacted: z.boolean().optional(), totalFieldsRedacted: z.number().int().nonnegative().optional(), redactedFields: z.array(z.object({field: z.string(), action: z.string(), reason: z.string().optional()}).strip()).optional()}).strip().nullable(),
}).strip();
export type ReportHistoryCriteria = z.infer<typeof reportHistoryCriteriaSchema>;
export type ReportHistoryRow = z.infer<typeof reportHistoryRowSchema>;
export type ReportHistoryPageData = z.infer<typeof reportHistoryPageSchema>;
export type ReportHistoryDetail = z.infer<typeof reportHistoryDetailSchema>;
