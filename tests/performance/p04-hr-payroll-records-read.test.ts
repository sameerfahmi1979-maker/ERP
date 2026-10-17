import {afterEach, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({permissions: ["hr.payroll.view", "hr.banking.view"], active: true, password: false, authReads: 0, calls: [] as unknown[][], grants: {} as Record<string, unknown>, employee: {data: {id: 880301}, error: null} as unknown, result: {} as unknown, queue: [] as unknown[], byTable: {} as Record<string, unknown>}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => {state.authReads++; return {profile: {id: 6, must_change_password: state.password}, isAccountActive: state.active, permissionCodes: state.permissions, roleCodes: [], roleAssignments: []};}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({
  rpc: async (name: string, params: {employee_id: number; permission_code: string}) => {state.calls.push(["rpc", name, params]); return state.grants[params.permission_code] ?? {data: true, error: null};},
  from: (table: string) => {
    state.calls.push(["from", table]); const q: Record<string, unknown> = {then: (resolve: (value: unknown) => unknown) => Promise.resolve(table === "employees" ? state.employee : state.queue.length ? state.queue.shift() : state.byTable[table] ?? state.result).then(resolve)};
    for (const method of ["select", "is", "or", "ilike", "eq", "order", "range", "maybeSingle"]) q[method] = (...args: unknown[]) => {state.calls.push([method, ...args]); return q;};
    return q;
  },
})}));
import {readPayrollRecords, readPayrollPoint, readPayrollChoices} from "@/server/reads/hr-payroll-records";
import {PAYROLL_RECORD_KINDS, PAYROLL_RECORD_FIELDS, payrollRecordRows, payrollRecordCriteriaSchema} from "@/lib/reads/hr-payroll-records-schema";
import {payrollRecordFixture, payrollProfileFixture, payrollWpsFixture} from "./hr-payroll-record-fixtures";
import {POST as recordsPost} from "@/app/api/reads/hr-payroll-records/route";
import {POST as pointPost} from "@/app/api/reads/hr-payroll-point/route";
import {POST as choicesPost} from "@/app/api/reads/hr-payroll-choices/route";
afterEach(() => Object.assign(state, {permissions: ["hr.payroll.view", "hr.banking.view"], active: true, password: false, authReads: 0, calls: [], grants: {}, employee: {data: {id: 880301}, error: null}, result: {}, queue: [], byTable: {}}));
it.each(PAYROLL_RECORD_KINDS)("%s provides complete counted pages beyond backend cap and checks exact subject", async kind => {
  state.result = {data: [payrollRecordFixture(kind)], count: 1101, error: null};
  const result = await readPayrollRecords({kind, employeeId: 880301, page: 12, pageSize: 100});
  expect(result.success, result.error).toBe(true); expect(result.data).toEqual({kind, employeeId: 880301, page: 12, pageSize: 100, totalCount: 1101, rows: [payrollRecordRows[kind].parse(payrollRecordFixture(kind))], ...(kind === "holds" ? {activeCount: 1101} : {})});
  expect(state.authReads).toBe(1); expect(state.calls).toContainEqual(["rpc", "f03_has_employee_permission", {employee_id: 880301, permission_code: "hr.payroll.view"}]); expect(state.calls).toContainEqual(["range", 1100, 1199]); expect(state.calls).toContainEqual(["eq", "employee_id", 880301]);
  expect(state.calls.filter(c => c[0] === "select").every(c => !String(c[1]).includes("*"))).toBe(true);
});
it.each(PAYROLL_RECORD_KINDS)("%s full-result literal search and every exposed sort precede paging", async kind => {
  state.result = {data: [], count: 0, error: null};
  for (const field of PAYROLL_RECORD_FIELDS[kind]) {
    state.calls = []; expect((await readPayrollRecords({kind, employeeId: 880301, search: "اختبار_%", sortKey: field.id, sortDir: "asc"})).success).toBe(true);
    expect(state.calls).toContainEqual(["order", field.id === "component_type_name_en" ? "component_type(name_en)" : field.id, {ascending: true, nullsFirst: false}]); expect(state.calls).toContainEqual(["order", "id", {ascending: true}]);
    expect(state.calls.findLastIndex(c => c[0] === "or")).toBeLessThan(state.calls.findIndex(c => c[0] === "range"));
  }
});
it("salary component default preserves active-first ordering but an explicit user sort is not prefixed", async () => {
  state.result = {data: [], count: 0, error: null};
  expect((await readPayrollRecords({kind: "salary-components", employeeId: 880301})).success).toBe(true);
  expect(state.calls.filter(c => c[0] === "order")).toEqual([["order", "is_active", {ascending: false}], ["order", "effective_from", {ascending: false}], ["order", "id", {ascending: true}]]);
  state.calls = [];
  expect((await readPayrollRecords({kind: "salary-components", employeeId: 880301, sortKey: "effective_from", sortDir: "desc"})).success).toBe(true);
  expect(state.calls.filter(c => c[0] === "order")).toEqual([["order", "effective_from", {ascending: false, nullsFirst: false}], ["order", "id", {ascending: true}]]);
});
it("component label filters/search preserve independent native related-label protection", async () => {
  state.result = {data: [], count: 0, error: null};
  expect((await readPayrollRecords({kind: "salary-components", employeeId: 880301, search: "بدل_%", columnFilters: {component_type_name_en: "بدل", effective_from: "2026-01-01"}})).success).toBe(true);
  expect(String(state.calls.find(c => c[0] === "select" && String(c[1]).includes("component_type"))?.[1])).toContain("!employee_salary_components_component_type_id_fkey!inner(");
  expect(state.calls).toContainEqual(["eq", "effective_from", "2026-01-01"]); expect(JSON.stringify(state.calls)).toContain("name_ar.ilike"); expect(state.calls.filter(c => c[0] === "from")).toEqual([["from", "employees"], ["from", "employee_salary_components"]]);
});
it("boolean/date filters are typed and combined; no arbitrary native expression", async () => {
  state.result = {data: [], count: 0, error: null}; expect((await readPayrollRecords({kind: "holds", employeeId: 880301, columnFilters: {is_active: "false", hold_date: "2026-01-01", hold_reason: "%_"}})).success).toBe(true);
  expect(state.calls).toContainEqual(["eq", "is_active", false]); expect(state.calls).toContainEqual(["eq", "hold_date", "2026-01-01"]); expect(state.calls.some(c => c[0] === "ilike" && String(c[2]).includes("\\%\\_"))).toBe(true);
});
it("invalid employee, page, sort, filters and unknown detail fields fail before auth", async () => {
  expect(payrollRecordCriteriaSchema.parse({kind: "holds", employeeId: 1}).pageSize).toBe(25);
  for (const invalid of [{employeeId: 0}, {page: 0}, {pageSize: 101}, {search: "x".repeat(201)}, {sortKey: "notes"}, {columnFilters: {hold_date: "2026-02-30"}}, {columnFilters: {is_active: "yes"}}, {table: "users"}]) expect((await readPayrollRecords({kind: "holds", employeeId: 880301, ...invalid})).success).toBe(false);
  for (const input of [{kind: "component-detail", employeeId: 1}, {kind: "profile", employeeId: 1, recordId: 2}, {kind: "profile", employeeId: 1, context: {}}]) expect((await readPayrollPoint(input)).success).toBe(false);
  expect(state.authReads).toBe(0); expect(state.calls).toHaveLength(0);
});
it.each(["no-role", "suspended", "password"])("%s cannot read payroll rows or details", async mode => {
  if (mode === "no-role") state.permissions = []; if (mode === "suspended") state.active = false; if (mode === "password") state.password = true;
  expect((await readPayrollRecords({kind: "holds", employeeId: 880301})).error).toBe("Permission denied"); expect((await readPayrollPoint({kind: "profile", employeeId: 880301})).error).toBe("Permission denied"); expect(state.calls).toHaveLength(0);
});
it("a capability in a different subject scope does not become an empty authorized payroll result", async () => {
  state.grants["hr.payroll.view"] = {data: false, error: null};
  for (const kind of PAYROLL_RECORD_KINDS) expect((await readPayrollRecords({kind, employeeId: 880301})).error).toBe("Permission denied");
  expect((await readPayrollPoint({kind: "profile", employeeId: 880301})).error).toBe("Permission denied"); expect(state.calls.some(c => c[0] === "from")).toBe(false);
});
it("authorization failure remains a retryable unavailable result, never denied or zero", async () => {
  state.grants["hr.payroll.view"] = {data: null, error: {message: "PRIVATE_AUTH_ERROR"}};
  const result = await readPayrollPoint({kind: "salary-totals", employeeId: 880301}); expect(result.success).toBe(false); expect(result.error).not.toBe("Permission denied"); expect(JSON.stringify(result)).not.toContain("PRIVATE_AUTH_ERROR");
});
it.each(PAYROLL_RECORD_KINDS)("%s rejects short/capped/malformed/duplicate/wrong-subject/failed pages", async kind => {
  for (const response of [{data: [], count: null}, {data: [], count: 10}, {data: [payrollRecordFixture(kind), payrollRecordFixture(kind)], count: 2}, {data: [{...payrollRecordFixture(kind), employee_id: 999}], count: 1}, {data: [{id: 1}], count: 1}, {data: [], count: 0, error: {code: "57014"}}]) {state.result = response; expect((await readPayrollRecords({kind, employeeId: 880301})).success).toBe(false);}
});
it.each(PAYROLL_RECORD_KINDS)("%s reconciles a deleted final page with the identical filtered count", async kind => {
  state.queue = [{data: null, count: null, status: 416, error: {code: "PGRST103"}}, ...(kind === "holds" ? [{data: null, count: 1200, error: null}] : []), {data: null, count: 1107, error: null}];
  expect((await readPayrollRecords({kind, employeeId: 880301, page: 13, pageSize: 100, search: "test"})).data).toMatchObject({rows: [], totalCount: 1107});
  const selects = state.calls.filter(c => c[0] === "select").slice(1); expect(selects).toHaveLength(kind === "holds" ? 3 : 2); expect(selects[0][1]).toBe(selects.at(-1)?.[1]); expect(selects.at(-1)?.[2]).toEqual({head: true, count: "exact"});
});
it.each(["self", "team"])("existing %s capability still requires the exact native payroll/banking subject grants", async suffix => {
  state.permissions = [`hr.payroll.view.${suffix}`, `hr.banking.view.${suffix}`];
  state.byTable = {employee_wps_profiles: {data: payrollWpsFixture, error: null}, employee_payroll_holds: {data: null, count: 0, error: null}, employee_salary_components: {data: [], count: 0, error: null}};
  expect((await readPayrollPoint({kind: "wps", employeeId: 880301})).success).toBe(true);
  expect(state.calls.filter(c => c[0] === "rpc")).toEqual([["rpc", "f03_has_employee_permission", {employee_id: 880301, permission_code: "hr.payroll.view"}], ["rpc", "f03_has_employee_permission", {employee_id: 880301, permission_code: "hr.banking.view"}]]);
  state.grants["hr.payroll.view"] = {data: false, error: null}; state.calls = [];
  expect((await readPayrollPoint({kind: "wps", employeeId: 880301})).error).toBe("Permission denied"); expect(state.calls.some(c => c[0] === "from")).toBe(false);
});
it.each([null, {id: 999}])("independent employee visibility %s cannot become a missing profile or zero salary", async employee => {
  state.employee = {data: employee, error: null};
  for (const kind of ["profile", "salary-totals", "wps", "component-detail"]) expect((await readPayrollPoint({kind, employeeId: 880301, ...(kind === "component-detail" ? {recordId: 1} : {})})).error).toBe("Permission denied");
  expect(state.calls.filter(c => c[0] === "from").every(c => c[1] === "employees")).toBe(true);
});
it("employee authorization query failure stays unavailable; private details are not fetched", async () => {
  state.employee = {data: null, error: {code: "57014"}};
  const result = await readPayrollPoint({kind: "profile", employeeId: 880301}); expect(result.success).toBe(false); expect(result.error).not.toBe("Permission denied"); expect(state.calls.filter(c => c[0] === "from")).toEqual([["from", "employees"]]);
});
it("null component amounts preserve existing zero fallback, not a new salary rule", async () => {
  state.result = {data: [{id: 1, amount: null, is_active: true, deleted_at: null, component_type: {component_kind: "earning", is_basic: true}}], count: 1, error: null};
  expect((await readPayrollPoint({kind: "salary-totals", employeeId: 880301})).data?.value).toEqual({gross: 0, basic: 0, activeCount: 1});
});
it("active hold KPI counts the complete employee scope independently of a released-only filtered page", async () => {
  state.queue = [{data: [], count: 0, error: null}, {data: null, count: 1107, error: null}];
  const result = await readPayrollRecords({kind: "holds", employeeId: 880301, search: "unmatched", columnFilters: {is_active: "false"}});
  expect(result.success, result.error).toBe(true); expect(result.data).toMatchObject({rows: [], totalCount: 0, activeCount: 1107});
  const second = state.calls.slice(state.calls.findLastIndex(c => c[0] === "from"));
  expect(second).toEqual([["from", "employee_payroll_holds"], ["select", "id", {head: true, count: "exact"}], ["eq", "employee_id", 880301], ["eq", "is_active", true], ["is", "deleted_at", null]]);
});
it.each([null, -1, 1.2, Number.MAX_SAFE_INTEGER + 1, "2"])("missing or invalid active hold count %s is unavailable, not zero", async count => {
  state.queue = [{data: [], count: 0, error: null}, {data: null, count, error: null}];
  expect((await readPayrollRecords({kind: "holds", employeeId: 880301})).success).toBe(false);
});
it("failed active hold count does not present an empty or partial hold result", async () => {
  state.queue = [{data: [], count: 0, error: null}, {data: null, count: 0, error: {code: "57014"}}];
  expect((await readPayrollRecords({kind: "holds", employeeId: 880301})).success).toBe(false);
});
it("profile returns all editor data without unrelated private columns; foreign detail rejected", async () => {
  state.result = {data: {...payrollProfileFixture, unrelated: "PRIVATE_SECRET"}, error: null};
  const profile = await readPayrollPoint({kind: "profile", employeeId: 880301}); expect(profile.success, profile.error).toBe(true); expect(JSON.stringify(profile)).not.toContain("PRIVATE_SECRET");
  state.result = {data: {...payrollRecordFixture("salary-components"), id: 5}, error: null}; expect((await readPayrollPoint({kind: "component-detail", employeeId: 880301, recordId: 1})).success).toBe(false);
});
it("salary totals read every bounded page beyond 1000 components and preserve original deterministic rules", async () => {
  const row = (id: number) => ({id, amount: 10, is_active: id !== 1101, deleted_at: null, component_type: {component_kind: id === 1100 ? "deduction" : "earning", is_basic: id % 2 === 0}});
  state.queue = [500, 500, 101].map((length, i) => ({data: Array.from({length}, (_, n) => row(i * 500 + n + 1)), count: 1101, error: null}));
  const result = await readPayrollPoint({kind: "salary-totals", employeeId: 880301}); expect(result.success, result.error).toBe(true); expect(result.data?.value).toEqual({gross: 10990, basic: 5500, activeCount: 1100});
  expect(state.calls.filter(c => c[0] === "range")).toEqual([["range", 0, 499], ["range", 500, 999], ["range", 1000, 1499]]);
});
it.each(["short", "count-change", "failed", "duplicate"])("salary totals reject %s intermediate pages", async mode => {
  const row = (id: number) => ({id, amount: 10, is_active: true, deleted_at: null, component_type: null});
  state.queue = [{data: Array.from({length: 500}, (_, i) => row(i + 1)), count: 501, error: null}, {data: mode === "short" ? [] : [row(mode === "duplicate" ? 1 : 501)], count: mode === "count-change" ? 502 : 501, error: mode === "failed" ? {code: "57014"} : null}];
  expect((await readPayrollPoint({kind: "salary-totals", employeeId: 880301})).success).toBe(false);
});
it("banking permission is independently checked for the exact employee before fetching WPS", async () => {
  state.permissions = ["hr.payroll.view"]; expect((await readPayrollPoint({kind: "wps", employeeId: 880301})).error).toBe("Permission denied"); expect(state.calls).toHaveLength(0);
  state.permissions.push("hr.banking.view"); state.grants["hr.banking.view"] = {data: false, error: null}; expect((await readPayrollPoint({kind: "wps", employeeId: 880301})).error).toBe("Permission denied"); expect(state.calls.filter(c => c[0] === "rpc")).toHaveLength(2); expect(state.calls.some(c => c[0] === "from")).toBe(false);
});
it("WPS response masks raw banking values and retains deterministic readiness", async () => {
  state.byTable = {employee_wps_profiles: {data: payrollWpsFixture, error: null}, employee_payroll_holds: {data: null, count: 0, error: null}, employee_salary_components: {data: [{id: 1, amount: 1000, is_active: true, deleted_at: null, component_type: {component_kind: "earning", is_basic: true}}], count: 1, error: null}};
  const result = await readPayrollPoint({kind: "wps", employeeId: 880301}); expect(result.success, result.error).toBe(true); expect(result.data?.value).toMatchObject({profile: {iban: null, account_number: null, account_number_masked: "******7890"}, readiness: {status: "ready", missingRequirements: []}}); expect(JSON.stringify(result)).not.toContain(payrollWpsFixture.iban); expect(JSON.stringify(result)).not.toContain(payrollWpsFixture.account_number);
});
it.each(["employee_wps_profiles", "employee_payroll_holds", "employee_salary_components"])("failure in %s never becomes ready/not-enrolled WPS", async table => {
  state.byTable = {employee_wps_profiles: {data: payrollWpsFixture, error: null}, employee_payroll_holds: {data: null, count: 0, error: null}, employee_salary_components: {data: [], count: 0, error: null}, [table]: {data: null, count: null, error: {message: "PRIVATE_ERROR"}}};
  expect((await readPayrollPoint({kind: "wps", employeeId: 880301})).success).toBe(false);
});
it.each(["payroll-groups", "salary-component-types", "mohre-establishments"])("%s picker is paged with a separately authorized inactive selection", async kind => {
  const normal = {id: 1, code: "SYN", name_en: "Synthetic", name_ar: null, is_active: true}, inactive = {...normal, id: 2, is_active: false};
  state.queue = [{data: [kind === "mohre-establishments" ? {...normal, status: "active"} : normal], count: 51, error: null}, {data: kind === "mohre-establishments" ? {...inactive, status: "inactive"} : inactive, error: null}];
  const result = await readPayrollChoices({kind, employeeId: 880301, page: 2, pageSize: 50, search: "اختبار_%", selectedId: 2}); expect(result.success, result.error).toBe(true); expect(result.data?.selected).toEqual(inactive); expect(state.calls).toContainEqual(["range", 50, 99]); expect(state.calls).toContainEqual(["eq", "id", 2]);
  expect(state.calls.filter(c => c[0] === "eq" && c[1] === "is_active")).toHaveLength(kind === "mohre-establishments" ? 0 : 1);
  expect(state.calls).toContainEqual(["order", kind === "mohre-establishments" ? "establishment_name" : kind === "salary-component-types" ? "sort_order" : "name_en"]);
});
it("read endpoints reject unsafe input and sanitize unavailable native errors", async () => {
  state.result = {data: null, count: null, error: {message: "PRIVATE_DATABASE_FAILURE"}};
  for (const [post, input] of [[recordsPost, {kind: "holds", employeeId: 880301}], [pointPost, {kind: "profile", employeeId: 880301}], [choicesPost, {kind: "payroll-groups", employeeId: 880301}]] as const) {
    const response = await post(new Request("http://localhost/api/reads/test", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(input)})); expect(response.status).toBe(503); expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(response.headers.get("X-ERP-Correlation")).toBeTruthy(); expect(await response.text()).not.toContain("PRIVATE_DATABASE_FAILURE");
  }
});

function wpsCountFixture(holds: Record<string, unknown>, profile: unknown = payrollWpsFixture) {
  state.queue = [];
  state.byTable = {
    employee_wps_profiles: {data: profile, error: null},
    employee_payroll_holds: {data: null, error: null, ...holds},
    employee_salary_components: {data: [{id: 1, amount: 1000, is_active: true, deleted_at: null, component_type: {component_kind: "earning", is_basic: true}}], count: 1, error: null},
  };
}
const invalidWpsCounts = [
  {name: "missing", holds: {}}, {name: "undefined", holds: {count: undefined}},
  {name: "NaN", holds: {count: NaN}}, {name: "negative", holds: {count: -1}},
  {name: "fractional", holds: {count: 1.5}}, {name: "unsafe integer", holds: {count: Number.MAX_SAFE_INTEGER + 1}},
  {name: "string zero", holds: {count: "0"}}, {name: "Infinity", holds: {count: Infinity}},
  {name: "negative Infinity", holds: {count: -Infinity}}, {name: "null", holds: {count: null}},
];
const wpsPointRequest = () => new Request("http://localhost/api/reads/hr-payroll-point", {
  method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({kind: "wps", employeeId: 880301}),
});
it.each(invalidWpsCounts.flatMap(c => [false, true].map(absent => ({...c, absent}))))(
  "raw $name hold count is unavailable in the reader and real route (absent profile=$absent)",
  async ({holds, absent}) => {
    // Inject raw backend values, not request JSON (which would turn NaN into null).
    wpsCountFixture(holds, absent ? null : payrollWpsFixture);
    // Soft assertions still fail the case, but also exercise the route on the original reader.
    expect.soft(await readPayrollPoint({kind: "wps", employeeId: 880301})).toEqual({success: false, error: "Payroll detail could not be completely loaded. Please retry."});
    const response = await pointPost(wpsPointRequest()), body = await response.json();
    expect.soft(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
    expect(response.headers.get("Vary")).toBe("Cookie");
    expect(response.headers.get("X-ERP-Correlation")).toBeTruthy();
    expect(body).toEqual({success: false, error: "Records could not be loaded. Please retry.", correlationId: response.headers.get("X-ERP-Correlation")});
    expect(JSON.stringify(body)).not.toContain(payrollWpsFixture.iban);
    expect(JSON.stringify(body)).not.toContain(payrollWpsFixture.account_number);
    expect(state.queue).toHaveLength(0);
  },
);
it.each([0, 1, Number.MAX_SAFE_INTEGER])("numeric safe hold count %s preserves readiness and banking redaction", async count => {
  wpsCountFixture({count});
  const expected = {profile: {iban: null, account_number: null, account_number_masked: "******7890"}, readiness: count === 0
    ? {status: "ready", missingRequirements: []} : {status: "on_hold", missingRequirements: ["Active payroll hold exists"]}};
  const result = await readPayrollPoint({kind: "wps", employeeId: 880301});
  expect(result.success, result.error).toBe(true); expect(result.data?.value).toMatchObject(expected);
  const response = await pointPost(wpsPointRequest()), body = await response.json();
  expect(response.status).toBe(200); expect(body.data.value).toMatchObject(expected);
  for (const value of [result, body]) {
    expect(JSON.stringify(value)).not.toContain(payrollWpsFixture.iban);
    expect(JSON.stringify(value)).not.toContain(payrollWpsFixture.account_number);
  }
});
it("valid zero with no WPS profile remains Not Enrolled", async () => {
  wpsCountFixture({count: 0}, null);
  expect((await readPayrollPoint({kind: "wps", employeeId: 880301})).data?.value).toEqual({profile: null, readiness: {status: "not_enrolled", missingRequirements: ["WPS profile not configured"]}});
  const response = await pointPost(wpsPointRequest());
  expect(response.status).toBe(200); expect((await response.json()).data.value.readiness.status).toBe("not_enrolled");
});
it.each([
  {name: "not applicable before active hold", profile: {...payrollWpsFixture, wps_applicable: false}, count: 1, status: "exempt", missing: []},
  {name: "exempt before active hold", profile: {...payrollWpsFixture, wps_status: "exempt"}, count: 1, status: "exempt", missing: []},
  {name: "profile hold with zero active holds", profile: {...payrollWpsFixture, wps_status: "hold"}, count: 0, status: "on_hold", missing: ["WPS status is on hold"]},
])("valid WPS count preserves $name precedence", async ({profile, count, status, missing}) => {
  wpsCountFixture({count}, profile);
  const result = await readPayrollPoint({kind: "wps", employeeId: 880301});
  expect(result.success, result.error).toBe(true);
  expect(result.data?.value).toMatchObject({readiness: {status, missingRequirements: missing}});
});
