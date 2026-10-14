import {afterEach, expect, it, vi} from "vitest";
const s = vi.hoisted(() => ({active: true, password: false, permission: true, global: false, authReads: 0, calls: [] as unknown[][], result: {} as unknown, queue: [] as unknown[]}));
vi.mock("@/lib/rbac/check", () => ({getAuthContext: async () => {s.authReads++; return {profile: {id: 6, must_change_password: s.password}, isAccountActive: s.active};}, hasPermission: (_c: unknown, permission: string) => s.permission && permission === "hr.leave.view", isGlobalAdmin: () => s.global, canUseApplication: (c: {profile: {must_change_password?: boolean} | null; isAccountActive: boolean}) => c.isAccountActive && !!c.profile && !c.profile.must_change_password}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({from: (...v: unknown[]) => {s.calls.push(["from", ...v]); const q: Record<string, unknown> = {then: (resolve: (r: unknown) => unknown) => Promise.resolve(s.queue.length ? s.queue.shift() : s.result).then(resolve)}; for (const n of ["select", "is", "or", "ilike", "eq", "gte", "lte", "order", "range"]) q[n] = (...v: unknown[]) => {s.calls.push([n, ...v]); return q;}; return q;}})}));
import {readHrTime} from "@/server/reads/hr-time";
import {POST} from "@/app/api/reads/hr-time/route";
import {HR_TIME_KINDS, HR_TIME_CONFIG, hrTimeCriteriaSchema, hrTimePageSchema} from "@/lib/reads/hr-time-schema";
import type {AuthContext} from "@/lib/rbac/check";
const rows = {
  attendance: {id: 1071101, employee_id: 881401, attendance_date: "2026-02-02", attendance_type: "office", total_hours: 8, overtime_hours: 1, late_minutes: 1, is_missing_punch: false, approval_status: "pending"},
  shifts: {id: 1073101, employee_id: 881401, effective_from: "2026-01-02", effective_to: null, weekly_off_day: "Sunday", overtime_eligible: false, attendance_required: true, work_calendar: null, work_shift: null},
  leave: {id: 1075101, employee_id: 881401, start_date: "2026-03-02", end_date: "2026-03-03", total_days: 2, approval_status: "pending", employee: {employee_code: "SYNTHETIC", full_name_en: "Synthetic employee", full_name_ar: "موظف تجريبي"}, leave_type: {name_en: "Synthetic leave", code: "SYNTHETIC"}},
};
afterEach(() => {Object.assign(s, {active: true, password: false, permission: true, global: false, authReads: 0, calls: [], result: {}, queue: []});});
it("preserves the leave capability and employee-readable intersection without a capped ID intermediary", async () => {
 s.permission = false; expect((await readHrTime({kind: "leave"})).error).toBe("Permission denied");
 expect(s.calls).not.toContainEqual(["from", "employee_leave_requests"]);
 s.calls = []; s.permission = true; s.result = {data: [], count: 0, error: null};
 expect((await readHrTime({kind: "leave"})).success).toBe(true);
 expect(String(s.calls.find(c => c[0] === "select")?.[1])).toContain("employee_leave_requests_employee_id_fkey!inner(");
 expect(s.calls).toContainEqual(["is", "employee.deleted_at", null]);
 expect(s.calls.filter(c => c[0] === "from")).toHaveLength(1);
});
it.each(HR_TIME_KINDS)("%s uses a bounded native counted projection and unique stable tie-breaker", async kind => {
  s.result = {data: [{...rows[kind], reason: "PRIVATE-SYNTHETIC", notes: "PRIVATE-SYNTHETIC", approved_by: 1, search_employee: {id: 1}}], count: 1101, error: null};
  const r = await readHrTime({kind, page: 12, pageSize: 100}); expect(r.success, r.error).toBe(true); expect(r.data).toMatchObject({kind, totalCount: 1101, rows: [rows[kind]]});
  expect(s.calls).toContainEqual(["from", HR_TIME_CONFIG[kind].table]); expect(s.calls).toContainEqual(["range", 1100, 1199]); expect(s.calls).toContainEqual(["order", HR_TIME_CONFIG[kind].sort, {ascending: false, nullsFirst: false}]); expect(s.calls).toContainEqual(["order", "id", {ascending: true}]);
  expect(String(s.calls.find(c => c[0] === "select")?.[1])).not.toContain("*"); expect(s.calls.filter(c => c[0] === "from")).toHaveLength(1); expect(JSON.stringify(r)).not.toContain("PRIVATE-SYNTHETIC"); expect(JSON.stringify(r)).not.toContain("search_employee");
});
it("defaults to25, caps100 and rejects unsafe table/filter/order/page/date/search input before auth", async () => {
  expect(hrTimeCriteriaSchema.parse({kind: "attendance"}).pageSize).toBe(25);
  for (const bad of [{kind: "auth.users"}, {table: "employees"}, {page: 0}, {pageSize: 101}, {page: 100001}, {sortKey: "created_by"}, {sortKey: "employee(full_name_en)"}, {sortDir: "injection"}, {search: "x".repeat(201)}, {employeeId: 1.5}, {dateFrom: "2026-02-30"}, {dateFrom: "2026-02-02", dateTo: "2026-01-01"}, {status: "deleted"}, {columnFilters: {reason: "medical"}}, {columnFilters: {employee_id: "9007199254740992"}}, {columnFilters: {employee_id: "1.5"}}, {columnFilters: {attendance_date: "2026-02-30"}}, {columnFilters: {is_missing_punch: "sometimes"}}]) expect((await readHrTime({kind: "attendance", ...bad})).success).toBe(false);
  expect(s.calls).toHaveLength(0); expect(s.authReads).toBe(0);
});
it("requires active password-complete principal and reuses explicitly validated request context", async () => {
  s.active = false; expect((await readHrTime({kind: "leave"})).error).toBe("Permission denied"); s.active = true; s.password = true; expect((await readHrTime({kind: "leave"})).error).toBe("Permission denied"); expect(s.calls).toHaveLength(0);
  s.authReads = 0; s.password = false; s.result = {data: [], count: 0, error: null}; expect((await readHrTime({kind: "leave"}, {profile: {id: 6}, isAccountActive: true} as AuthContext)).success).toBe(true); expect(s.authReads).toBe(0);
});
it.each(HR_TIME_KINDS)("%s bilingual/literal full-result search remains native before paging", async kind => {
  s.result = {data: [], count: 0, error: null}; expect((await readHrTime({kind, search: "موارد_%"})).success).toBe(true);
  const clauses = s.calls.filter(c => c[0] === "or"); expect(clauses.some(c => JSON.stringify(c).includes("full_name_ar.ilike") && JSON.stringify(c).includes("search_employee"))).toBe(true); expect(clauses.some(c => String(c[1]).includes("search_employee.not.is.null"))).toBe(true);
  expect(clauses.some(c => String(c[1]).includes("\\\\_\\\\%"))).toBe(true); expect(s.calls.findIndex(c => c[0] === "or")).toBeLessThan(s.calls.findIndex(c => c[0] === "range"));
});
it.each(HR_TIME_KINDS)("%s applies every allowlisted typed AND filter", async kind => {
  const filters = Object.fromEntries(HR_TIME_CONFIG[kind].fields.map(f => [f.id, f.type === "number" ? "1" : f.type === "date" ? "2026-01-01" : f.type === "select" ? f.id === "approval_status" ? "pending" : "false" : "موارد_%"]));
  s.result = {data: [], count: 0, error: null}; const r = await readHrTime({kind, columnFilters: filters}); expect(r.success, r.error).toBe(true); expect(s.calls.filter(c => ["eq", "or", "ilike"].includes(String(c[0]))).length).toBe(HR_TIME_CONFIG[kind].fields.length);
  const projection = String(s.calls.find(c => c[0] === "select")?.[1]); if (kind === "leave" || kind === "shifts") expect(projection).toContain("!inner(");
});
it("preserves leave's contained date semantics and intersects employee/status/column criteria", async () => {
  s.result = {data: [], count: 0, error: null}; expect((await readHrTime({kind: "leave", employeeId: 881403, status: "pending", dateFrom: "2026-03-01", dateTo: "2026-03-05", columnFilters: {total_days: "2"}})).success).toBe(true);
  for (const call of [["eq", "employee_id", 881403], ["eq", "approval_status", "pending"], ["gte", "start_date", "2026-03-01"], ["lte", "end_date", "2026-03-05"], ["eq", "total_days", 2]]) expect(s.calls).toContainEqual(call);
  expect(s.calls.filter(c => c[0] === "from")).toHaveLength(1);
});
it("exact attendance date remains an exact intersection and is rejected for other inquiries", async () => {
  s.result = {data: [], count: 0, error: null};
  expect((await readHrTime({kind: "attendance", date: "2026-02-03", dateFrom: "2026-02-01", dateTo: "2026-02-05"})).success).toBe(true);
  expect(s.calls).toContainEqual(["eq", "attendance_date", "2026-02-03"]);
  expect(s.calls).toContainEqual(["gte", "attendance_date", "2026-02-01"]);
  expect(s.calls).toContainEqual(["lte", "attendance_date", "2026-02-05"]);
  s.calls = []; s.authReads = 0;
  for (const kind of ["leave", "shifts"]) expect((await readHrTime({kind, date: "2026-02-03"})).success).toBe(false);
  expect(s.calls).toHaveLength(0); expect(s.authReads).toBe(0);
});
it.each([{data: null, count: 0, error: null}, {data: [], count: null, error: null}, {data: [], count: 1, error: null}, {data: [rows.attendance, rows.attendance], count: 2, error: null}, {data: [{id: 1}], count: 1, error: null}, {data: [rows.attendance], count: 1, error: {message: "PRIVATE-SYNTHETIC", code: "57014"}}])("malformed, truncated, duplicate and failed reads never become empty success", async result => {
  s.result = result; const r = await readHrTime({kind: "attendance"}); expect(r.success).toBe(false); expect(r.data).toBeUndefined(); expect(JSON.stringify(r)).not.toContain("PRIVATE-SYNTHETIC");
});
it("allows truthful out-of-range only after independently verified identical native count", async () => {
  s.queue = [{data: null, count: null, status: 416, error: {code: "PGRST103"}}, {data: null, count: 1103, error: null}]; const r = await readHrTime({kind: "leave", page: 13, pageSize: 100, status: "pending"}); expect(r.data).toMatchObject({rows: [], totalCount: 1103}); expect(s.calls.filter(c => c[0] === "eq")).toEqual([["eq", "approval_status", "pending"], ["eq", "approval_status", "pending"]]);
});
it.each([null, -1, 1201, 1.5, Number.MAX_SAFE_INTEGER + 1])("count reconciliation rejects unverified total %s", async count => {
  s.queue = [{data: null, count: null, status: 416, error: {code: "PGRST103"}}, {data: null, count, error: null}]; expect((await readHrTime({kind: "leave", page: 13, pageSize: 100})).success).toBe(false);
});
it("count reconciliation failure and ordinary failures remain failures without invisible recovery", async () => {
  s.queue = [{data: null, count: null, status: 416, error: {code: "PGRST103"}}, {data: null, count: 0, error: {code: "42501"}}]; expect((await readHrTime({kind: "leave", page: 13, pageSize: 100})).success).toBe(false);
  s.calls = []; s.result = {data: null, count: null, status: 500, error: {code: "57014"}}; expect((await readHrTime({kind: "attendance", page: 13})).success).toBe(false); expect(s.calls.filter(c => c[0] === "select")).toHaveLength(1);
});
it("safe read route validates method body, carries no-store and correlation on failure", async () => {
  s.result = {data: [], count: 0, error: null}; const ok = await POST(new Request("http://localhost/api/reads/hr-time", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({kind: "attendance"})})); expect(ok.status).toBe(200); expect(ok.headers.get("Cache-Control")).toContain("no-store"); expect(hrTimePageSchema.safeParse((await ok.json()).data).success).toBe(true);
  s.result = {error: {message: "PRIVATE-SYNTHETIC"}, data: null, count: null}; const failed = await POST(new Request("http://localhost/api/reads/hr-time", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({kind: "attendance"})})); expect(failed.status).toBe(503); expect(failed.headers.get("X-ERP-Correlation")).toBeTruthy(); expect(await failed.text()).not.toContain("PRIVATE-SYNTHETIC");
});
