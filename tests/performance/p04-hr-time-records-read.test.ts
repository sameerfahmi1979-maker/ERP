import {beforeEach, describe, expect, it, vi} from "vitest";
import {readHrTimeRecords} from "@/server/reads/hr-time-records";
import {POST} from "@/app/api/reads/hr-time-records/route";
import {TIME_RECORD_CONFIG, TIME_RECORD_KINDS, type TimeRecordKind} from "@/lib/reads/hr-time-records-schema";
import {timeFixture} from "./fixtures/time-record-fixture";

type Row = Record<string, unknown>;
type Call = {table: string; steps: [string, ...unknown[]][]};
const state = vi.hoisted(() => ({subject: {id: 7} as unknown, summary: {id: 17, employee_id: 7} as unknown,
  subjectError: false, summaryError: false, context: {} as unknown, rows: [] as Row[], calls: [] as Call[],
  grants: {} as Record<string, unknown>, rpcError: false, error: false, partial: false, duplicate: false, noCount: false,
  forcedCount: null as number | null, range416: false, headError: false, abortAfter: null as AbortController | null, authCalls: 0, changeProjected: false}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => {state.authCalls++; return state.context;}}));
vi.mock("@/lib/logger", () => ({logger: {warn: vi.fn()}}));
vi.mock("@/lib/supabase/admin", () => ({createAdminClient: () => {throw Error("Privileged access forbidden");}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({from: (table: string) => builder(table),
  rpc: (name: string, args: {employee_id: number; permission_code: string}) => builder(name, args)})}));
function builder(table: string, args?: {employee_id: number; permission_code: string}) {
  const call: Call = {table, steps: args ? [["args", args]] : []}; state.calls.push(call);
  const q: Record<string, unknown> = {then: (resolve: (value: unknown) => unknown) => {
    const select = call.steps.find(s => s[0] === "select"), head = (select?.[2] as {head?: boolean} | undefined)?.head;
    if (args) return Promise.resolve({data: state.grants[args.permission_code] ?? true, error: state.rpcError ? {message: "PRIVATE NATIVE ERROR"} : null}).then(resolve);
    if (table === "employees") return Promise.resolve({data: state.subject, error: state.subjectError ? {message: "PRIVATE NATIVE ERROR"} : null}).then(resolve);
    if (table === "employee_attendance_daily_summary" && select?.[1] === "id,employee_id") return Promise.resolve({data: state.summary, error: state.summaryError ? {message: "PRIVATE NATIVE ERROR"} : null}).then(resolve);
    let rows = [...state.rows];
    for (const [method, key, value] of call.steps) {
      if (method === "eq") rows = rows.filter(row => row[String(key)] === value);
      if (method === "in") rows = rows.filter(row => (value as unknown[]).includes(row[String(key)]));
    }
    const range = call.steps.find(s => s[0] === "range"), count = state.noCount ? null : state.forcedCount ?? rows.length;
    if (range && state.range416) return Promise.resolve({data: null, count: null, status: 416, error: {code: "PGRST103"}}).then(resolve);
    if (range) rows = rows.slice(Number(range[1]), Number(range[2]) + 1);
    if (state.changeProjected && call.steps.some(s => s[0] === "in")) rows = rows.map(row => ({...row, attendance_date: "2028-01-01"}));
    if (state.partial) rows = rows.slice(0, -1);
    if (state.duplicate && rows.length > 1) rows[1] = rows[0];
    state.abortAfter?.abort();
    return Promise.resolve({data: head ? null : call.steps.some(s => s[0] === "maybeSingle") ? rows[0] ?? null : rows, count,
      error: state.error || head && state.headError ? {message: "PRIVATE NATIVE ERROR"} : null, status: 200}).then(resolve);
  }};
  for (const method of ["select", "eq", "is", "in", "order", "range", "abortSignal"]) q[method] = (...args: unknown[]) => {call.steps.push([method, ...args]); return q;};
  // Match the terminal builder's declared surface rather than allowing fluent
  // filters/cancellation after maybeSingle only because the test stub did so.
  q.maybeSingle = () => {call.steps.push(["maybeSingle"]); return {then: q.then};};
  return q;
}
const page = (kind: TimeRecordKind, extra = {}) => ({operation: "page", kind, employeeId: 7, ...(kind === "corrections" ? {summaryId: 17} : {}), ...extra});
const detail = (kind: TimeRecordKind) => ({operation: "detail", kind, employeeId: 7, recordId: 17, ...(kind === "corrections" ? {summaryId: 17} : {})});
const request = (body: unknown, signal?: AbortSignal) => new Request("http://localhost/api/reads/hr-time-records", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body), signal});
beforeEach(() => {
  state.subject = {id: 7}; state.summary = {id: 17, employee_id: 7}; state.subjectError = false; state.summaryError = false;
  state.context = {profile: {id: 7, must_change_password: false}, isAccountActive: true}; state.rows = []; state.calls = []; state.grants = {};
  state.rpcError = false; state.error = false; state.partial = false; state.duplicate = false; state.noCount = false; state.forcedCount = null;
  state.abortAfter = null; state.range416 = false; state.headError = false; state.authCalls = 0; state.changeProjected = false;
});

describe.each(TIME_RECORD_KINDS)("%s actual request composition", kind => {
  it("uses one ordinary context and exact employee permission before a counted lean page", async () => {
    state.rows = [timeFixture(kind)]; const result = await readHrTimeRecords(page(kind));
    if (!result.success || !("rows" in result.data)) throw Error("Expected complete page");
    expect(state.authCalls).toBe(1); expect(result.data).toMatchObject({totalCount: 1, page: 1, pageSize: 25, employeeId: 7});
    expect(result.data.rows[0]).not.toHaveProperty("notes"); expect(result.data.rows[0]).not.toHaveProperty("sick_leave_document_id");
    expect(state.calls[0].table).toBe("employees"); const call = state.calls.at(-1)!;
    expect(call.table).toBe(TIME_RECORD_CONFIG[kind].table); expect(call.steps).toContainEqual(["eq", "employee_id", 7]);
    expect(call.steps).toContainEqual(["range", 0, 24]); expect(call.steps).toContainEqual(["order", "id", {ascending: true}]);
    expect(call.steps.some(s => s[0] === "is" && s[1] === "deleted_at")).toBe(TIME_RECORD_CONFIG[kind].deleted);
    expect(call.steps.find(s => s[0] === "select")?.[1]).not.toContain("*");
    expect(state.calls.filter(c => c.table === "f03_has_employee_permission").map(c => c.steps[0][1])).toContainEqual({employee_id: 7, permission_code: ["leave", "balances"].includes(kind) ? "hr.leave.view" : "hr.attendance.view"});
  });
  it("distinguishes true zero from returned errors, partial rows, null counts and duplicate IDs", async () => {
    expect((await POST(request(page(kind)))).status).toBe(200);
    for (const flag of ["error", "partial", "noCount", "duplicate"] as const) {
      state.rows = [timeFixture(kind), timeFixture(kind, 18)]; state[flag] = true;
      const response = await POST(request(page(kind))); expect(response.status).toBe(503); expect(await response.text()).not.toContain("PRIVATE NATIVE ERROR"); state[flag] = false;
    }
  });
  it("pages beyond a simulated 1,000-row native cap without truncating the count", async () => {
    state.rows = Array.from({length: 1234}, (_, i) => timeFixture(kind, i + 1));
    const result = await readHrTimeRecords(page(kind, {page: 13, pageSize: 100}));
    expect(result.success && "rows" in result.data && result.data.rows.map(r => r.id)).toEqual(Array.from({length: 34}, (_, i) => i + 1201));
    expect(result.success && "totalCount" in result.data && result.data.totalCount).toBe(1234);
  });
  it("selected detail is exact and missing child is non-enumerating, not whole employee denial", async () => {
    const absent = await readHrTimeRecords(detail(kind)); expect(absent.success && absent.data).toEqual({...detail(kind), availability: "unavailable"});
    state.rows = [timeFixture(kind)]; const result = await readHrTimeRecords(detail(kind));
    expect(result.success && "row" in result.data && result.data.row.id).toBe(17);
    expect(state.calls.at(-1)?.steps).toContainEqual(["eq", "id", 17]); expect(state.calls.at(-1)?.steps).toContainEqual(["eq", "employee_id", 7]);
    delete state.rows[0].employee_id; expect((await readHrTimeRecords(detail(kind))).success).toBe(true); // RLS-empty analogue, not malformed data.
  });
  it("restricts an unauthorized kind without a fabricated empty list or a child table read", async () => {
    state.grants = {"hr.attendance.view": false, "hr.attendance.manage": false, "hr.leave.view": false, "hr.leave.manage": false};
    const result = await readHrTimeRecords(page(kind)); expect(result.success && result.data).toEqual({...page(kind), availability: "restricted"});
    expect(state.calls.some(call => call.table === TIME_RECORD_CONFIG[kind].table)).toBe(false);
  });
  it("preserves native/cleared-sort default and deterministic ties", async () => {
    await readHrTimeRecords(page(kind, {sorting: []}));
    expect(state.calls.at(-1)?.steps).toContainEqual(["order", TIME_RECORD_CONFIG[kind].sort, {ascending: false}]);
    if (kind === "balances") expect(state.calls.at(-1)?.steps).toContainEqual(["order", "leave_type_id", {ascending: true}]);
  });
});
it.each([{employeeId: "7"}, {employeeId: 0}, {employeeId: 2 ** 53}, {page: 0}, {pageSize: 101}, {search: "x".repeat(201)}, {table: "users"}, {columnFilters: {notes: "secret"}},
  {sorting: [{id: "notes", desc: false}]}, {sorting: [{id: "attendance_date", desc: true}, {id: "attendance_date", desc: false}]}, {summaryId: 3}, {year: 2026}])("rejects untrusted criteria before auth: %j", async input => {
  expect((await POST(request(page("daily", input)))).status).toBe(400); expect(state.authCalls).toBe(0); expect(state.calls).toEqual([]);
});
it.each([null, {id: 8}, {id: "7"}])("missing or mismatched subject stops before child reads: %j", async subject => {
  state.subject = subject; expect((await POST(request(page("daily")))).status).toBe(subject === null ? 403 : 503); expect(state.calls).toHaveLength(1);
});
it.each(["suspended", "must-change"])("inactive application admission %s performs no database work", async condition => {
  state.context = {profile: {id: 7, must_change_password: condition === "must-change"}, isAccountActive: condition !== "suspended"};
  expect((await POST(request(page("daily")))).status).toBe(403); expect(state.calls).toEqual([]);
});
it.each(["self", "team"])("uses native exact-subject %s response without promoting manage access", async scope => {
  state.context = {profile: {id: 7, must_change_password: false}, isAccountActive: true, permissionCodes: [`hr.employees.view.${scope}`, `hr.attendance.view.${scope}`]};
  state.grants = {"hr.attendance.view": true, "hr.attendance.manage": false}; state.rows = [timeFixture("daily")];
  const result = await readHrTimeRecords(page("daily")); expect(result.success && "access" in result.data && result.data.access).toEqual({canManage: false});
  expect(state.calls.find(c => c.table === "f03_has_employee_permission")?.steps[0][1]).toEqual({employee_id: 7, permission_code: "hr.attendance.view"});
});
it.each(["other employee", "other branch", "missing valid employee link"])("RLS-hidden %s is terminal at employee point", async () => {
  state.subject = null; expect((await POST(request(page("daily")))).status).toBe(403); expect(state.calls.map(c => c.table)).toEqual(["employees"]);
});
it("leave manage may read by existing policy, but attendance manage never substitutes for attendance view", async () => {
  state.grants = {"hr.attendance.view": false, "hr.attendance.manage": true, "hr.leave.view": false, "hr.leave.manage": true};
  expect((await readHrTimeRecords(page("leave"))).success).toBe(true);
  const attendance = await readHrTimeRecords(page("daily")); expect(attendance.success && attendance.data).toEqual({...page("daily"), availability: "restricted"});
});
it("module management is insufficient without exact employee-management authority", async () => {
  state.grants = {"hr.employees.update": false, "hr.employee_profile.manage": false};
  const result = await readHrTimeRecords(page("daily")); expect(result.success && "access" in result.data && result.data.access.canManage).toBe(false);
  state.grants["hr.employee_profile.manage"] = true;
  const managed = await readHrTimeRecords(page("daily")); expect(managed.success && "access" in managed.data && managed.data.access.canManage).toBe(true);
});
it("capability and employee transport failures are unavailable, not false permission or zero", async () => {
  state.rpcError = true; expect((await POST(request(page("daily")))).status).toBe(503);
  state.rpcError = false; state.subjectError = true; expect((await POST(request(page("daily")))).status).toBe(503);
});
it.each([null, {id: 18, employee_id: 7}, {id: 17, employee_id: 8}])("correction history independently authorizes its exact employee/summary parent: %j", async summary => {
  state.summary = summary; const response = await POST(request(page("corrections")));
  expect(response.status).toBe(summary === null ? 200 : 503);
  if (summary === null) expect((await response.json()).data).toEqual({...page("corrections"), availability: "unavailable"});
  expect(state.calls.some(call => call.table === "employee_attendance_corrections")).toBe(false);
  expect(state.calls.at(-1)?.steps).toContainEqual(["eq", "employee_id", 7]);
});
it("correction parent errors are not a complete absence", async () => {state.summaryError = true; expect((await POST(request(page("corrections")))).status).toBe(503);});
it("correction detail also binds the selected parent, not just the employee", async () => {
  state.rows = [timeFixture("corrections")];
  expect((await POST(request({operation: "detail", kind: "corrections", employeeId: 7, recordId: 17}))).status).toBe(400);
  state.summary = {id: 18, employee_id: 7};
  const result = await readHrTimeRecords({...detail("corrections"), summaryId: 18});
  expect(result.success && result.data).toEqual({...detail("corrections"), summaryId: 18, availability: "unavailable"});
  expect(state.calls.at(-1)?.steps).toContainEqual(["eq", "summary_id", 18]);
});
it("current-year balance selection is server-bound and preserves other years outside the page", async () => {
  state.rows = [timeFixture("balances"), {...timeFixture("balances", 18), leave_year: 2025}];
  const result = await readHrTimeRecords(page("balances", {year: 2026})); expect(result.success && "rows" in result.data && result.data.rows.map(r => r.id)).toEqual([17]);
  expect(state.calls.at(-1)?.steps).toContainEqual(["eq", "leave_year", 2026]);
});
it("date substring filters traverse all count-checked lean metadata beyond 500", async () => {
  state.rows = Array.from({length: 602}, (_, i) => ({...timeFixture("daily", i + 1), attendance_date: i === 601 ? "2028-12-04" : "2027-01-01"}));
  const result = await readHrTimeRecords(page("daily", {search: "2028-12"})); expect(result.success && "rows" in result.data && result.data.rows.map(r => r.id)).toEqual([602]);
  expect(state.calls.filter(c => c.table === TIME_RECORD_CONFIG.daily.table).map(c => c.steps.find(s => s[0] === "range"))).toEqual([["range", 0, 499], ["range", 500, 999], ["range", 0, 24]]);
  expect(state.calls.find(c => c.table === TIME_RECORD_CONFIG.daily.table)?.steps[0][1]).toBe("id,attendance_date,approval_status");
});
it("text filters are literal and multi-sort priority follows the original table comparator", async () => {
  state.rows = Array.from({length: 16}, (_, i) => ({...timeFixture("daily", i + 1), attendance_date: i < 8 ? "2027-01-01" : "2028-01-01", approval_status: `pending ${16-i}`}));
  const result = await readHrTimeRecords(page("daily", {sorting: [{id: "attendance_date", desc: true}, {id: "approval_status", desc: false}]}));
  expect(result.success && "rows" in result.data && result.data.rows.map(r => r.id)).toEqual([16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1]);
  const literal = await readHrTimeRecords(page("daily", {search: "%_"})); expect(literal.success && "totalCount" in literal.data && literal.data.totalCount).toBe(0);
});
it.each([{sortKey: "attendance_date", sortDir: "asc"}, {sorting: [{id: "attendance_date", desc: false}]}])("legacy scalar and explicit sort remain equivalent: %j", async sort => {
  state.rows = [{...timeFixture("daily", 1), attendance_date: "2026-10-04"}, {...timeFixture("daily", 2), attendance_date: "2026-10-03"}];
  const result = await readHrTimeRecords(page("daily", sort)); expect(result.success && "rows" in result.data && result.data.rows.map(r => r.id)).toEqual([2, 1]);
});
it("changed filter/sort projection and oversized composition fail instead of returning partial success", async () => {
  state.rows = [timeFixture("daily")]; state.changeProjected = true;
  expect((await POST(request(page("daily", {search: "2026"})))).status).toBe(503);
  state.changeProjected = false; state.forcedCount = 10001;
  expect((await POST(request(page("daily", {search: "2026"})))).status).toBe(503);
});
it("a checked out-of-range page recounts truthfully and rejects recount errors", async () => {
  state.range416 = true; state.rows = [timeFixture("daily")];
  const result = await readHrTimeRecords(page("daily", {page: 9})); expect(result.success && "rows" in result.data && result.data.rows).toEqual([]);
  expect(result.success && "totalCount" in result.data && result.data.totalCount).toBe(1);
  state.headError = true; expect((await POST(request(page("daily", {page: 9})))).status).toBe(503);
});
it.each([
  ["page", "daily"], ["detail", "daily"], ["page", "corrections"], ["detail", "corrections"],
] as const)("binds cancellation before terminal builders for a time %s/%s read", async (operation, kind) => {
  state.rows = [timeFixture(kind)]; const controller = new AbortController();
  const result = await readHrTimeRecords(operation === "page" ? page(kind) : detail(kind), undefined, controller.signal);
  expect(result.success).toBe(true);
  if (!result.success) throw Error("Expected authorized time read");
  if (operation === "page") expect("rows" in result.data && result.data.rows.map(row => row.id)).toEqual([17]);
  else expect("row" in result.data && result.data.row.id).toBe(17);
  const terminalCalls = state.calls.filter(call => call.steps.some(step => step[0] === "maybeSingle"));
  expect(terminalCalls).toHaveLength(1 + Number(operation === "detail") + Number(kind === "corrections"));
  expect(terminalCalls[0].table).toBe("employees");
  if (kind === "corrections") {
    expect(terminalCalls[1].table).toBe("employee_attendance_daily_summary");
    expect(terminalCalls[1].steps).toContainEqual(["eq", "id", 17]);
    expect(terminalCalls[1].steps).toContainEqual(["eq", "employee_id", 7]);
  }
  for (const call of terminalCalls) {
    expect(call.steps).toContainEqual(["abortSignal", controller.signal]);
    expect(call.steps.findIndex(step => step[0] === "abortSignal")).toBeLessThan(call.steps.findIndex(step => step[0] === "maybeSingle"));
  }
});
it("forwards cancellation to subject, capabilities and collection and rejects late fake success", async () => {
  state.rows = [timeFixture("daily")]; const control = new AbortController(); await POST(request(page("daily"), control.signal));
  expect(state.calls.every(call => call.steps.some(step => step[0] === "abortSignal"))).toBe(true);
  state.calls = []; state.authCalls = 0; control.abort();
  expect((await readHrTimeRecords(page("daily"), undefined, control.signal)).success).toBe(false); expect(state.calls).toEqual([]); expect(state.authCalls).toBe(0);
  state.abortAfter = new AbortController(); expect((await readHrTimeRecords(page("daily"), undefined, state.abortAfter.signal)).success).toBe(false);
});
it("route is private/no-store, bounds bodies and leaves mutations untouched", async () => {
  const response = await POST(request(page("daily"))); expect(response.headers.get("Cache-Control")).toContain("private, no-store"); expect(response.headers.get("Vary")).toBe("Cookie");
  const oversized = await POST(request({padding: "x".repeat(20000)})); expect([400, 413]).toContain(oversized.status);
  expect(state.calls.every(c => !c.steps.some(s => ["insert", "update", "delete"].includes(s[0])))).toBe(true);
});
