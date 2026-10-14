import {afterEach, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({permissions: ["hr.actions.view", "hr.confidential.view"], active: true, password: false, authReads: 0, calls: [] as unknown[][], result: {} as unknown, queue: [] as unknown[]}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => {
  state.authReads++; return {profile: {id: 6, must_change_password: state.password}, isAccountActive: state.active, permissionCodes: state.permissions, roleCodes: [], roleAssignments: []};
}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({from: (...args: unknown[]) => {
  state.calls.push(["from", ...args]);
  const query: Record<string, unknown> = {then: (resolve: (r: unknown) => unknown) => Promise.resolve(state.queue.length ? state.queue.shift() : state.result).then(resolve)};
  for (const method of ["select", "is", "or", "ilike", "eq", "gte", "lt", "order", "range", "maybeSingle"]) query[method] = (...values: unknown[]) => {state.calls.push([method, ...values]); return query;};
  return query;
}})}));
import {readHrActionInquiry, readHrDisciplinaryInquiryDetail} from "@/server/reads/hr-action-inquiries";
import {POST as pagePost} from "@/app/api/reads/hr-action-inquiries/route";
import {POST as detailPost} from "@/app/api/reads/hr-disciplinary-detail/route";
import {HR_ACTION_INQUIRY_KINDS, HR_ACTION_INQUIRY_FIELDS, hrActionInquiryCriteriaSchema, hrActionInquiryRowSchemas, type HrActionInquiryKind} from "@/lib/reads/hr-action-inquiries-schema";
import {actionRecordDetail} from "./hr-action-record-fixtures";
const fixture = (kind: HrActionInquiryKind, id = 1) => ({...actionRecordDetail(kind, id), employee: {full_name_en: "Synthetic employee", full_name_ar: "موظف", employee_code: "PERF-1"}, salary: "UNRELATED_SECRET"});
afterEach(() => Object.assign(state, {permissions: ["hr.actions.view", "hr.confidential.view"], active: true, password: false, authReads: 0, calls: [], result: {}, queue: []}));

it.each(HR_ACTION_INQUIRY_KINDS)("%s returns lean complete-count pages past the backend cap with one authorization", async kind => {
  state.result = {data: [fixture(kind)], count: 1101, error: null};
  const result = await readHrActionInquiry({kind, page: 12, pageSize: 100});
  expect(result.success, result.error).toBe(true); expect(result.data).toEqual({kind, page: 12, pageSize: 100, totalCount: 1101, rows: [hrActionInquiryRowSchemas[kind].parse(fixture(kind))]});
  expect(state.authReads).toBe(1); expect(state.calls).toContainEqual(["range", 1100, 1199]); expect(state.calls).toContainEqual(["is", "deleted_at", null]);
  expect(state.calls.filter(c => c[0] === "select").every(c => !String(c[1]).includes("*"))).toBe(true);
  expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE"); expect(JSON.stringify(result)).not.toContain("UNRELATED_SECRET");
});
it.each(HR_ACTION_INQUIRY_KINDS)("%s full-result search and every allowed sort remain before the page limit", async kind => {
  state.result = {data: [], count: 0, error: null};
  for (const f of HR_ACTION_INQUIRY_FIELDS[kind]) {
    state.calls = []; expect((await readHrActionInquiry({kind, search: "اختبار_%", sortKey: f.id, sortDir: "asc"})).success).toBe(true);
    const sort = f.id === "employee_name" ? "employee(full_name_en)" : f.id === "employee_code" ? "employee(employee_code)" : f.id;
    expect(state.calls).toContainEqual(["order", sort, {ascending: true, nullsFirst: false}]); expect(state.calls).toContainEqual(["order", "id", {ascending: true}]);
    expect(state.calls.findLastIndex(c => c[0] === "or")).toBeLessThan(state.calls.findIndex(c => c[0] === "range"));
  }
});
it("disciplinary employee search uses independently protected joins, not a capped employee-ID fetch", async () => {
  state.result = {data: [], count: 0, error: null};
  expect((await readHrActionInquiry({kind: "disciplinary", search: "موظف_%", columnFilters: {employee_code: "PERF_%", severity: "high", record_date: "2026-01-02"}})).success).toBe(true);
  const projection = String(state.calls.find(c => c[0] === "select")?.[1]);
  expect(projection).toContain("employee:employees!employee_id!inner("); expect(projection).toContain("search_employee:employees!employee_id(id)");
  expect(state.calls.filter(c => c[0] === "from")).toEqual([["from", "employee_disciplinary_records"]]);
  expect(state.calls).toContainEqual(["eq", "severity", "high"]); expect(state.calls).toContainEqual(["eq", "record_date", "2026-01-02"]);
  expect(state.calls.some(c => c[0] === "ilike" && c[1] === "employee.employee_code" && String(c[2]).includes("\\_\\%"))).toBe(true);
  expect(state.calls.some(c => c[0] === "or" && (c[2] as {referencedTable?: string})?.referencedTable === "search_employee" && String(c[1]).includes("full_name_ar"))).toBe(true);
});
it("timestamp filters use a complete UTC day and boolean clearance never uses ilike", async () => {
  state.result = {data: [], count: 0, error: null};
  expect((await readHrActionInquiry({kind: "eos", search: "true", columnFilters: {created_at: "2026-01-02", clearance_completed: "false", final_settlement_status: "pending_finance"}})).success).toBe(true);
  expect(state.calls).toContainEqual(["gte", "created_at", "2026-01-02T00:00:00Z"]); expect(state.calls).toContainEqual(["lt", "created_at", "2026-01-03T00:00:00.000Z"]);
  expect(state.calls).toContainEqual(["eq", "clearance_completed", false]); expect(JSON.stringify(state.calls)).not.toContain("clearance_completed.ilike");
});
it("invalid dates/criteria/fields are rejected before authorization and database reads", async () => {
  expect(hrActionInquiryCriteriaSchema.parse({kind: "pro"}).pageSize).toBe(25);
  for (const bad of [{kind: "notes"}, {table: "employees"}, {page: 0}, {page: 100001}, {pageSize: 101}, {search: "x".repeat(201)}, {sortKey: "notes"}, {columnFilters: {request_date: "2026-02-30"}}, {columnFilters: {process_status: "unknown"}}, {columnFilters: {salary: "10"}}]) expect((await readHrActionInquiry({kind: "pro", ...bad})).success).toBe(false);
  expect((await readHrDisciplinaryInquiryDetail({recordId: -1, employeeId: 100})).success).toBe(false);
  expect(state.authReads).toBe(0); expect(state.calls).toHaveLength(0);
});
it.each(["no-role", "suspended", "password"])("%s cannot read any business page or detail", async mode => {
  if (mode === "no-role") state.permissions = []; if (mode === "suspended") state.active = false; if (mode === "password") state.password = true;
  for (const kind of HR_ACTION_INQUIRY_KINDS) expect((await readHrActionInquiry({kind})).error).toBe("Permission denied");
  expect((await readHrDisciplinaryInquiryDetail({recordId: 1, employeeId: 100})).error).toBe("Permission denied"); expect(state.calls).toHaveLength(0);
});
it("confidential access remains separate and EOS-only access grants no ordinary HR inquiry", async () => {
  state.permissions = ["hr.actions.view"]; expect((await readHrActionInquiry({kind: "disciplinary"})).error).toBe("Permission denied");
  expect((await readHrDisciplinaryInquiryDetail({recordId: 1, employeeId: 100})).error).toBe("Permission denied");
  state.permissions = ["hr.eos.view"]; state.result = {data: [], count: 0, error: null};
  expect((await readHrActionInquiry({kind: "eos"})).success).toBe(true);
  for (const kind of ["pro", "disciplinary", "approvals"]) expect((await readHrActionInquiry({kind})).error).toBe("Permission denied");
});
it.each(HR_ACTION_INQUIRY_KINDS)("%s missing counts, short pages, duplicate rows and failures cannot become a valid empty result", async kind => {
  for (const result of [{data: [], count: null}, {data: [], count: 5}, {data: [fixture(kind), fixture(kind)], count: 2}, {data: [{id: 1}], count: 1}, {data: [], count: 0, error: {code: "57014"}}]) {state.result = result; expect((await readHrActionInquiry({kind})).success).toBe(false);}
  state.result = {data: [], count: 0, error: null}; expect((await readHrActionInquiry({kind})).data?.totalCount).toBe(0);
});
it.each(HR_ACTION_INQUIRY_KINDS)("%s out-of-range recovery counts the identical filtered result", async kind => {
  state.queue = [{data: null, count: null, status: 416, error: {code: "PGRST103"}}, {data: null, count: 1107, error: null}];
  const result = await readHrActionInquiry({kind, page: 13, pageSize: 100, search: "test_%"}); expect(result.data).toMatchObject({rows: [], totalCount: 1107});
  const selects = state.calls.filter(c => c[0] === "select"); expect(selects).toHaveLength(2); expect(selects[0][1]).toBe(selects[1][1]); expect(selects[1][2]).toEqual({head: true, count: "exact"});
});
it("unverified recovery counts and ordinary failures do not trigger false range recovery", async () => {
  for (const count of [null, -1, 1201, 1.5]) {state.queue = [{data: null, status: 416, error: {code: "PGRST103"}}, {data: null, count, error: null}]; expect((await readHrActionInquiry({kind: "pro", page: 13, pageSize: 100})).success).toBe(false);}
  state.calls = []; state.result = {data: null, status: 503, error: {code: "57014"}}; expect((await readHrActionInquiry({kind: "pro", page: 13})).success).toBe(false); expect(state.calls.filter(c => c[0] === "select")).toHaveLength(1);
});
it("complete disciplinary detail keeps all original wording and independently masked employee/issuer labels", async () => {
  state.result = {data: {...fixture("disciplinary"), employee: null, issued_by_profile: {display_name: null}}, error: null};
  const result = await readHrDisciplinaryInquiryDetail({recordId: 1, employeeId: 100}); expect(result.success, result.error).toBe(true);
  expect(result.data).toMatchObject({description: "SYNTHETIC_PRIVATE_DISCIPLINE", action_taken: "Retain full action", employee: null, issued_by_profile: {display_name: null}});
  expect(state.calls).toContainEqual(["eq", "id", 1]); expect(state.calls).toContainEqual(["eq", "employee_id", 100]); expect(JSON.stringify(result)).not.toContain("UNRELATED_SECRET");
});
it.each([null, {id: 1}, {...fixture("disciplinary"), id: 2}, {...fixture("disciplinary"), employee_id: 101}])("unavailable/mismatched detail stays failed", async data => {
  state.result = {data, error: null}; expect((await readHrDisciplinaryInquiryDetail({recordId: 1, employeeId: 100})).success).toBe(false);
});
it("route errors are correlated, uncached and do not expose native details", async () => {
  state.result = {data: null, count: null, error: {message: "PRIVATE_DATABASE_FAILURE"}};
  for (const [post, input] of [[pagePost, {kind: "pro"}], [detailPost, {recordId: 1, employeeId: 100}]] as const) {
    const response = await post(new Request("http://localhost/api/reads/test", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(input)}));
    expect(response.status).toBe(503); expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(response.headers.get("X-ERP-Correlation")).toBeTruthy(); expect(await response.text()).not.toContain("PRIVATE_DATABASE_FAILURE");
  }
});
