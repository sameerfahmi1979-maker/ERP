import {z} from "zod";
import {normalizeReadSorting, readSortingSchema} from "./read-sorting";
export {hrReadIdentity as timeRecordsReadIdentity} from "./hr-read-identity";

export const TIME_RECORD_KINDS = ["daily", "punches", "corrections", "shifts", "leave", "balances", "overtime"] as const;
export type TimeRecordKind = typeof TIME_RECORD_KINDS[number];
const field = (id: string, label: string) => ({id, label, type: "text" as const});
/** Preserve the actual record-tab scalar accessors, not global inquiry columns. */
export const TIME_RECORD_CONFIG = {
  daily: {table: "employee_attendance_daily_summary", sort: "attendance_date", deleted: false, fields: [field("attendance_date", "Attendance Date"), field("approval_status", "Approval Status")]},
  punches: {table: "employee_attendance_punches", sort: "punch_datetime", deleted: false, fields: [field("punch_datetime", "Punch Datetime"), field("punch_type", "Punch Type")]},
  corrections: {table: "employee_attendance_corrections", sort: "created_at", deleted: false, fields: [field("created_at", "Created At")]},
  shifts: {table: "employee_shift_assignments", sort: "effective_from", deleted: true, fields: [field("effective_from", "Effective From"), field("effective_to", "Effective To")]},
  leave: {table: "employee_leave_requests", sort: "start_date", deleted: true, fields: [field("start_date", "Start Date"), field("end_date", "End Date"), field("approval_status", "Approval Status")]},
  balances: {table: "employee_leave_balances", sort: "leave_year", deleted: false, fields: []},
  overtime: {table: "employee_overtime_records", sort: "overtime_date", deleted: true, fields: [field("overtime_date", "Overtime Date"), field("approval_status", "Approval Status")]},
} as const;
const id = z.number().int().positive().refine(Number.isSafeInteger), text = z.string().nullable(), date = z.iso.date(), timestamp = z.iso.datetime({offset: true});
const base = {id, employee_id: id};
const leaveType = z.object({name_en: z.string(), code: z.string()}).strip().nullable();
export const timeRecordRowSchemas = {
  daily: z.object({...base, attendance_date: date, attendance_type: z.string(), total_hours: z.number().nullable(), overtime_hours: z.number(), is_missing_punch: z.boolean(), approval_status: z.string()}).strip(),
  punches: z.object({...base, punch_datetime: timestamp, punch_type: z.string(), punch_source: text}).strip(),
  corrections: z.object({...base, summary_id: id, created_at: timestamp, correction_reason: z.string()}).strip(),
  shifts: z.object({...base, effective_from: date, effective_to: date.nullable(), overtime_eligible: z.boolean(), attendance_required: z.boolean(),
    work_calendar: z.object({calendar_name: z.string()}).strip().nullable(), work_shift: z.object({shift_name: z.string()}).strip().nullable()}).strip(),
  leave: z.object({...base, start_date: date, end_date: date, total_days: z.number().nullable(), approval_status: z.string(), leave_type: leaveType}).strip(),
  balances: z.object({...base, leave_type_id: id, leave_year: z.number().int(), entitled_days: z.number(), used_days: z.number(), balance_days: z.number(), carry_forward: z.number(), leave_type: leaveType}).strip(),
  overtime: z.object({...base, overtime_date: date, hours: z.number(), reason: text, approval_status: z.string()}).strip(),
};
/** Only full values required by these editors; no raw audit JSON, medical-file
 * reference, device identifier or unrelated employee field is exposed. */
export const timeRecordDetailSchemas = {
  daily: timeRecordRowSchemas.daily.extend({late_minutes: z.number().int(), early_out_minutes: z.number().int(), notes: text}),
  punches: timeRecordRowSchemas.punches.extend({notes: text}),
  corrections: timeRecordRowSchemas.corrections,
  shifts: timeRecordRowSchemas.shifts.extend({work_calendar_id: id.nullable(), work_shift_id: id.nullable(), weekly_off_day: text, notes: text}),
  leave: timeRecordRowSchemas.leave.extend({leave_type_id: id, reason: text, notes: text}),
  balances: timeRecordRowSchemas.balances,
  overtime: timeRecordRowSchemas.overtime.extend({notes: text}),
};
const owner = {kind: z.enum(TIME_RECORD_KINDS), employeeId: id};
const scope = {summaryId: id.optional(), year: z.number().int().refine(Number.isSafeInteger).optional()};
const search = z.string().max(200);
export const timeRecordPageCriteriaSchema = z.object({...owner, ...scope, operation: z.literal("page"), page: z.number().int().min(1).max(100000).default(1),
  pageSize: z.number().int().min(1).max(100).default(25), search: search.default(""), sorting: readSortingSchema.optional(), sortKey: z.string().max(100).optional(),
  sortDir: z.enum(["asc", "desc"]).optional(), columnFilters: z.record(z.string(), search).default({}),
}).strict().transform((p, ctx) => normalizeReadSorting(p, ctx, {allowed: [...TIME_RECORD_CONFIG[p.kind].fields.map(f => f.id), TIME_RECORD_CONFIG[p.kind].sort], defaultKey: TIME_RECORD_CONFIG[p.kind].sort, defaultDir: "desc"})).superRefine((p, ctx) => {
  if ((p.kind === "corrections") !== (p.summaryId !== undefined)) ctx.addIssue({code: "custom", path: ["summaryId"], message: "Correction history requires its selected attendance summary"});
  if (p.year !== undefined && p.kind !== "balances") ctx.addIssue({code: "custom", path: ["year"], message: "Year applies to leave balances only"});
  if (p.kind === "balances" && p.search) ctx.addIssue({code: "custom", path: ["search"], message: "Balance cards do not support text search"});
  for (const key of Object.keys(p.columnFilters)) if (!TIME_RECORD_CONFIG[p.kind].fields.some(f => f.id === key)) ctx.addIssue({code: "custom", path: ["columnFilters", key], message: "Unsupported time record filter"});
});
export const timeRecordDetailCriteriaSchema = z.object({...owner, operation: z.literal("detail"), recordId: id, summaryId: id.optional()}).strict().superRefine((p, ctx) => {
  if ((p.kind === "corrections") !== (p.summaryId !== undefined)) ctx.addIssue({code: "custom", path: ["summaryId"], message: "Correction detail requires its selected attendance summary"});
});
export const timeRecordCriteriaSchema = z.union([timeRecordPageCriteriaSchema, timeRecordDetailCriteriaSchema]);
export const timeRecordAccessSchema = z.object({canManage: z.boolean()}).strict();
export const timeRecordRestrictedSchema = z.object({...owner, ...scope, operation: z.enum(["page", "detail"]), availability: z.literal("restricted")}).strict();
export const timeRecordUnavailableSchema = timeRecordDetailCriteriaSchema.safeExtend({availability: z.literal("unavailable")}).strict();
export const timeHistoryUnavailableSchema = z.object({operation: z.literal("page"), kind: z.literal("corrections"), employeeId: id, summaryId: id, availability: z.literal("unavailable")}).strict();
export const timeRecordPageSchema = z.object({...owner, ...scope, operation: z.literal("page"), page: z.number().int().positive(), pageSize: z.number().int().min(1).max(100),
  totalCount: z.number().int().nonnegative().refine(Number.isSafeInteger), rows: z.array(z.unknown()), access: timeRecordAccessSchema,
}).strict().transform((p, ctx) => {
  const result = z.array(timeRecordRowSchemas[p.kind]).safeParse(p.rows);
  if (!result.success || result.data.some(r => r.employee_id !== p.employeeId || p.kind === "corrections" && (r as {summary_id?: number}).summary_id !== p.summaryId || p.kind === "balances" && p.year !== undefined && (r as {leave_year?: number}).leave_year !== p.year)
    || (p.kind === "corrections") !== (p.summaryId !== undefined) || p.kind !== "balances" && p.year !== undefined
    || new Set(result.data.map(r => r.id)).size !== result.data.length || result.data.length !== Math.min(p.pageSize, Math.max(0, p.totalCount - (p.page - 1) * p.pageSize))) {
    ctx.addIssue({code: "custom", message: "Incomplete time record page"}); return z.NEVER;
  }
  return {...p, rows: result.data};
});
export const timeRecordDetailSchema = timeRecordDetailCriteriaSchema.safeExtend({row: z.unknown(), access: timeRecordAccessSchema}).strict().transform((p, ctx) => {
  const result = timeRecordDetailSchemas[p.kind].safeParse(p.row);
  if (!result.success || result.data.id !== p.recordId || result.data.employee_id !== p.employeeId || p.kind === "corrections" && (result.data as {summary_id?: number}).summary_id !== p.summaryId) {ctx.addIssue({code: "custom", message: "Incomplete time record detail"}); return z.NEVER;}
  return {...p, row: result.data};
});
export const timeRecordPageResultSchema = z.union([timeRecordPageSchema, timeRecordRestrictedSchema, timeHistoryUnavailableSchema]);
export const timeRecordDetailResultSchema = z.union([timeRecordDetailSchema, timeRecordRestrictedSchema, timeRecordUnavailableSchema]);
export type TimeRecordRowMap = {[K in TimeRecordKind]: z.infer<(typeof timeRecordRowSchemas)[K]>};
export type TimeRecordDetailMap = {[K in TimeRecordKind]: z.infer<(typeof timeRecordDetailSchemas)[K]>};
export type TimeRecordAccess = z.infer<typeof timeRecordAccessSchema>;
