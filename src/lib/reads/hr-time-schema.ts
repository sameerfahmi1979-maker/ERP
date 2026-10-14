import {z} from "zod";
export {hrReadIdentity as hrTimeReadIdentity} from "./hr-read-identity";
export const HR_TIME_KINDS = ["attendance", "shifts", "leave"] as const;
export type HrTimeKind = typeof HR_TIME_KINDS[number];
export type HrTimeField = {id: string; label: string; type: "text" | "number" | "select" | "date"; options?: {value: string; label: string}[]};
const text = (id: string, label: string): HrTimeField => ({id, label, type: "text"});
const number = (id: string, label: string): HrTimeField => ({id, label, type: "number"});
const date = (id: string, label: string): HrTimeField => ({id, label, type: "date"});
const status = (values: string[]): HrTimeField => ({id: "approval_status", label: "Status", type: "select", options: values.map(value => ({value, label: value}))});
const boolean = (id: string, label: string): HrTimeField => ({id, label, type: "select", options: [{value: "true", label: "Yes"}, {value: "false", label: "No"}]});
/** Static native-table contracts, never browser-supplied identifiers or SQL. */
export const HR_TIME_CONFIG = {
  attendance: {table: "employee_attendance_daily_summary", prefix: "daily-attendance", sort: "attendance_date", search: ["attendance_type", "approval_status"], fields: [date("attendance_date", "Date"), number("employee_id", "Employee ID"), text("attendance_type", "Attendance type"), number("total_hours", "Hours"), number("overtime_hours", "Overtime hours"), number("late_minutes", "Late minutes"), boolean("is_missing_punch", "Missing punch"), status(["pending", "approved", "queried"])], statuses: ["pending", "approved", "queried"]},
  shifts: {table: "employee_shift_assignments", prefix: "global-shift-assignments", sort: "effective_from", search: ["weekly_off_day"], fields: [number("employee_id", "Employee ID"), text("shift_name", "Shift"), text("calendar_name", "Calendar"), date("effective_from", "Effective from"), date("effective_to", "Effective to"), boolean("overtime_eligible", "Overtime eligible"), boolean("attendance_required", "Attendance required"), text("weekly_off_day", "Weekly off day")], statuses: []},
  leave: {table: "employee_leave_requests", prefix: "global-leave-requests", sort: "start_date", search: ["approval_status"], fields: [text("employee_name", "Employee"), number("employee_id", "Employee ID"), text("leave_type_name", "Leave type"), date("start_date", "Start date"), date("end_date", "End date"), number("total_days", "Days"), status(["pending", "approved", "rejected", "cancelled"])], statuses: ["pending", "approved", "rejected", "cancelled"]},
} as const satisfies Record<HrTimeKind, {table: string; prefix: string; sort: string; search: readonly string[]; fields: readonly HrTimeField[]; statuses: readonly string[]}>;
const realDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
const search = z.string().trim().max(200), id = z.number().int().positive().refine(Number.isSafeInteger);
export const hrTimeCriteriaSchema = z.object({
  kind: z.enum(HR_TIME_KINDS), page: z.number().int().min(1).max(100000).default(1), pageSize: z.number().int().min(1).max(100).default(25), search: search.default(""),
  sortKey: z.string().max(100).optional(), sortDir: z.enum(["asc", "desc"]).default("desc"), columnFilters: z.record(z.string(), search).default({}),
  date: z.string().refine(realDate).optional(), dateFrom: z.string().refine(realDate).optional(), dateTo: z.string().refine(realDate).optional(), status: z.string().max(30).optional(), employeeId: id.optional(),
}).strict().transform(p => ({...p, sortKey: p.sortKey ?? HR_TIME_CONFIG[p.kind].sort})).superRefine((p, ctx) => {
  const fields: readonly HrTimeField[] = HR_TIME_CONFIG[p.kind].fields;
  if (!fields.some(f => f.id === p.sortKey)) ctx.addIssue({code: "custom", message: "Unsupported time sort", path: ["sortKey"]});
  if (p.status && !(HR_TIME_CONFIG[p.kind].statuses as readonly string[]).includes(p.status)) ctx.addIssue({code: "custom", message: "Invalid time status", path: ["status"]});
  if (p.date && p.kind !== "attendance") ctx.addIssue({code: "custom", message: "Exact attendance date only", path: ["date"]});
  if (p.dateFrom && p.dateTo && p.dateFrom > p.dateTo) ctx.addIssue({code: "custom", message: "Invalid date range", path: ["dateTo"]});
  for (const [key, value] of Object.entries(p.columnFilters)) {
    const f = fields.find(field => field.id === key);
    if (!f) {ctx.addIssue({code: "custom", message: "Unsupported time filter", path: ["columnFilters", key]}); continue;}
    if (!value) continue;
    const valid = f.type === "number" ? /^\d+(\.\d+)?$/.test(value) && Number.isFinite(Number(value)) && (f.id.endsWith("_id") ? Number.isSafeInteger(Number(value)) && Number(value) > 0 : Number(value) <= 2147483647) : f.type === "date" ? realDate(value) : f.type === "select" ? !!f.options?.some(o => o.value === value) : true;
    if (!valid) ctx.addIssue({code: "custom", message: "Invalid time filter", path: ["columnFilters", key]});
  }
});
const employee = z.object({employee_code: z.string(), full_name_en: z.string(), full_name_ar: z.string().nullable()}).strip().nullable();
export const hrTimeAttendanceRowSchema = z.object({id, employee_id: id, attendance_date: z.string().refine(realDate), attendance_type: z.string(), total_hours: z.number().nullable(), overtime_hours: z.number(), late_minutes: z.number().int(), is_missing_punch: z.boolean(), approval_status: z.string()}).strip();
export const hrTimeShiftRowSchema = z.object({id, employee_id: id, effective_from: z.string().refine(realDate), effective_to: z.string().refine(realDate).nullable(), weekly_off_day: z.string().nullable(), overtime_eligible: z.boolean(), attendance_required: z.boolean(), work_calendar: z.object({calendar_name: z.string()}).strip().nullable(), work_shift: z.object({shift_name: z.string()}).strip().nullable()}).strip();
export const hrTimeLeaveRowSchema = z.object({id, employee_id: id, start_date: z.string().refine(realDate), end_date: z.string().refine(realDate), total_days: z.number().nullable(), approval_status: z.string(), employee, leave_type: z.object({name_en: z.string(), code: z.string()}).strip().nullable()}).strip();
const envelope = {page: z.number().int().min(1).max(100000), pageSize: z.number().int().min(1).max(100), totalCount: z.number().int().nonnegative().refine(Number.isSafeInteger)};
export const hrTimePageSchema = z.discriminatedUnion("kind", [
  z.object({...envelope, kind: z.literal("attendance"), rows: z.array(hrTimeAttendanceRowSchema)}).strict(),
  z.object({...envelope, kind: z.literal("shifts"), rows: z.array(hrTimeShiftRowSchema)}).strict(),
  z.object({...envelope, kind: z.literal("leave"), rows: z.array(hrTimeLeaveRowSchema)}).strict(),
]).refine(p => p.rows.length === Math.min(p.pageSize, Math.max(0, p.totalCount - (p.page - 1) * p.pageSize)) && new Set(p.rows.map(row => row.id)).size === p.rows.length);
export type HrTimeCriteria = z.infer<typeof hrTimeCriteriaSchema>;
export type HrTimePage = z.infer<typeof hrTimePageSchema>;
export type HrTimeAttendanceRow = z.infer<typeof hrTimeAttendanceRowSchema>;
export type HrTimeShiftRow = z.infer<typeof hrTimeShiftRowSchema>;
export type HrTimeLeaveRow = z.infer<typeof hrTimeLeaveRowSchema>;
export type HrTimeRow = HrTimePage["rows"][number];
