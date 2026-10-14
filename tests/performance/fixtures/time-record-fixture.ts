/** Explicit synthetic construction for offline component/reader tests only. */
export const timeKinds = ["daily", "punches", "corrections", "shifts", "leave", "balances", "overtime"] as const;
export type TimeFixtureKind = typeof timeKinds[number];
export function timeFixture(kind: TimeFixtureKind, id = 17, employeeId = 7): Record<string, unknown> {
  const base = {id, employee_id: employeeId, created_at: "2026-10-04T00:00:00Z", updated_at: "2026-10-04T00:00:00Z", notes: "INITIAL_PRIVATE_NOTE"};
  if (kind === "daily") return {...base, attendance_date: "2026-10-04", attendance_type: "site", work_site_id: null, first_in_at: null, last_out_at: null, total_hours: 8,
    overtime_hours: 0, late_minutes: 0, early_out_minutes: 0, is_missing_punch: false, approval_status: "pending", approved_by: null, approved_at: null, work_site: null, approver: null};
  if (kind === "punches") return {...base, punch_datetime: "2026-10-04T08:00:00Z", punch_type: "in", work_site_id: null, punch_source: "manual", work_site: null};
  if (kind === "corrections") return {...base, summary_id: 17, correction_reason: "Synthetic correction"};
  if (kind === "shifts") return {...base, work_calendar_id: 1, work_shift_id: 1, weekly_off_day: null, overtime_eligible: true, attendance_required: true, effective_from: "2026-10-01", effective_to: null,
    work_calendar: {calendar_name: "Synthetic calendar"}, work_shift: {shift_name: "Synthetic shift"}};
  if (kind === "leave") return {...base, leave_type_id: 1, request_date: "2026-10-01", start_date: "2026-10-04", end_date: "2026-10-05", total_days: 2, reason: "Synthetic leave reason",
    approval_status: "pending", leave_type: {name_en: "Synthetic leave", code: "SYNTH"}};
  if (kind === "balances") return {...base, leave_type_id: 1, leave_year: 2026, entitled_days: 30, used_days: 3, balance_days: 29, carry_forward: 2, leave_type: {name_en: "Synthetic leave", code: "SYNTH"}};
  return {...base, overtime_date: "2026-10-04", hours: 2, reason: "Synthetic overtime", approval_status: "pending"};
}
export function timeFixtureReply(input: Record<string, unknown>, rows = [timeFixture(input.kind as TimeFixtureKind, 17, Number(input.employeeId))], access = {canManage: true}) {
  const owner = {kind: input.kind, employeeId: input.employeeId, ...(input.kind === "corrections" ? {summaryId: input.summaryId} : {})};
  if (input.operation === "detail") {
    const row = rows.find(row => row.id === input.recordId);
    return {success: true, data: row ? {...owner, operation: "detail", recordId: input.recordId, row, access} : {...owner, operation: "detail", recordId: input.recordId, availability: "unavailable"}};
  }
  const page = Number(input.page ?? 1), pageSize = Number(input.pageSize ?? 25), from = (page - 1) * pageSize;
  return {success: true, data: {...owner, operation: "page", page, pageSize, rows: rows.slice(from, from + pageSize), totalCount: rows.length, access,
    ...(input.kind === "corrections" ? {summaryId: input.summaryId} : {}), ...(input.kind === "balances" && input.year !== undefined ? {year: input.year} : {})}};
}
