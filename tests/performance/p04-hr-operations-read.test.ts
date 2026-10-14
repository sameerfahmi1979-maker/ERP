import {afterEach, expect, it, vi} from "vitest";
const s = vi.hoisted(() => ({active: true, password: false, permitted: true, authReads: 0, calls: [] as unknown[][], result: {} as unknown, queue: [] as unknown[]}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => {s.authReads++; return {profile: {id: 6, must_change_password: s.password}, isAccountActive: s.active, permissionCodes: s.permitted ? ["hr.assignments.view"] : [], roleCodes: [], roleAssignments: []};}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({from: (...v: unknown[]) => {s.calls.push(["from", ...v]); const q: Record<string, unknown> = {then: (resolve: (r: unknown) => unknown) => Promise.resolve(s.queue.length ? s.queue.shift() : s.result).then(resolve)}; for (const n of ["select", "is", "or", "ilike", "eq", "gte", "lt", "order", "range"]) q[n] = (...v: unknown[]) => {s.calls.push([n, ...v]); return q;}; return q;}})}));
import {readHrOperations} from "@/server/reads/hr-operations";
import {POST} from "@/app/api/reads/hr-operations/route";
import {HR_OPERATIONS_KINDS, HR_OPERATIONS_CONFIG, hrOperationsCriteriaSchema} from "@/lib/reads/hr-operations-schema";
import type {AuthContext} from "@/lib/rbac/check";
const person = {id: 881401, full_name_en: "Synthetic employee", full_name_ar: "موظف تجريبي", employee_code: "PERF-E01101"};
const rows = {
  assignments: {id: 1081101, employee_id: 881401, assignment_type: "primary", assignment_status: "active", effective_from: "2026-01-02", effective_to: null, employee: person, company: null, department: null, designation: null, site: null},
  blocks: {id: 1083101, employee_id: 881401, block_type: "other", block_reason: "Synthetic permitted reason", block_status: "active", effective_from: "2026-01-02", effective_to: null, created_at: "2026-01-02T00:00:00+00:00", employee: person},
  readiness: {id: 1085101, employee_id: 881401, readiness_status: "ready", checked_at: "2026-01-02T00:00:00+00:00", employee: person, site: null},
};
afterEach(() => {Object.assign(s, {active: true, password: false, permitted: true, authReads: 0, calls: [], result: {}, queue: []});});
it.each(HR_OPERATIONS_KINDS)("%s retains minimal native projections, bounded100 and unique ties", async kind => {
  s.result = {data: [{...rows[kind], notes: "PRIVATE-SYNTHETIC", released_by: 1, missing_requirements_json: {secret: true}, search_employee: {id: 1}}], count: 1101, error: null};
  const result = await readHrOperations({kind, page: 12, pageSize: 100}); expect(result.success, result.error).toBe(true); expect(result.data).toMatchObject({kind, totalCount: 1101, rows: [rows[kind]]});
  expect(s.calls).toContainEqual(["from", HR_OPERATIONS_CONFIG[kind].table]); expect(s.calls).toContainEqual(["range", 1100, 1199]); expect(s.calls).toContainEqual(["order", HR_OPERATIONS_CONFIG[kind].sort, {ascending: false, nullsFirst: false}]); expect(s.calls).toContainEqual(["order", "id", {ascending: true}]);
  expect(String(s.calls.find(c => c[0] === "select")?.[1])).not.toContain("*"); expect(s.calls.filter(c => c[0] === "from")).toHaveLength(1); expect(JSON.stringify(result)).not.toContain("PRIVATE-SYNTHETIC"); expect(JSON.stringify(result)).not.toContain("search_employee");
});
it("rejects unsafe or unsupported criteria before auth or database work", async () => {
  expect(hrOperationsCriteriaSchema.parse({kind: "assignments"}).pageSize).toBe(25);
  for (const bad of [{kind: "auth.users"}, {table: "employees"}, {page: 0}, {pageSize: 101}, {page: 100001}, {sortKey: "created_by"}, {sortKey: "employee(full_name_en)"}, {sortDir: "injection"}, {search: "x".repeat(201)}, {employeeId: 1.5}, {employeeId: Number.MAX_SAFE_INTEGER + 1}, {status: "deleted"}, {columnFilters: {notes: "medical"}}, {columnFilters: {employee_id: "9007199254740992"}}, {columnFilters: {employee_id: "1.5"}}, {columnFilters: {effective_from: "2026-02-30"}}, {columnFilters: {assignment_status: "sometimes"}}]) expect((await readHrOperations({kind: "assignments", ...bad})).success).toBe(false);
  expect((await readHrOperations({kind: "blocks", workSiteId: 1})).success).toBe(false); expect((await readHrOperations({kind: "readiness", departmentId: 1})).success).toBe(false);
  expect(s.calls).toHaveLength(0); expect(s.authReads).toBe(0);
});
it("preserves exact capability guard, active/password-complete principal and request context reuse", async () => {
  s.active = false; expect((await readHrOperations({kind: "blocks"})).error).toBe("Permission denied"); s.active = true; s.password = true; expect((await readHrOperations({kind: "blocks"})).error).toBe("Permission denied"); s.password = false; s.permitted = false; expect((await readHrOperations({kind: "blocks"})).error).toBe("Permission denied"); expect(s.calls).toHaveLength(0);
  s.authReads = 0; s.result = {data: [], count: 0, error: null}; const context = {profile: {id: 6}, isAccountActive: true, permissionCodes: ["hr.assignments.view"], roleCodes: []} as unknown as AuthContext;
  expect((await readHrOperations({kind: "blocks"}, context)).success).toBe(true); expect(s.authReads).toBe(0);
});
it.each(HR_OPERATIONS_KINDS)("%s bilingual literal search is native before pagination, without a capped employee-ID fetch", async kind => {
  s.result = {data: [], count: 0, error: null}; expect((await readHrOperations({kind, search: "موارد_%"})).success).toBe(true);
  const clauses = s.calls.filter(c => c[0] === "or"); expect(clauses.some(c => JSON.stringify(c).includes("full_name_ar.ilike") && JSON.stringify(c).includes("search_employee"))).toBe(true); expect(clauses.some(c => String(c[1]).includes("search_employee.not.is.null"))).toBe(true); expect(clauses.some(c => String(c[1]).includes("\\\\_\\\\%"))).toBe(true);
  expect(s.calls.findIndex(c => c[0] === "or")).toBeLessThan(s.calls.findIndex(c => c[0] === "range")); expect(s.calls.filter(c => c[0] === "from")).toHaveLength(1);
});
it.each(HR_OPERATIONS_KINDS)("%s validates every full-result filter and intersects it before paging", async kind => {
  const filters = Object.fromEntries(HR_OPERATIONS_CONFIG[kind].fields.map(f => [f.id, f.type === "number" ? "881401" : f.type === "date" ? "2026-01-02" : f.type === "select" ? f.id === "assignment_type" ? "primary" : f.id === "block_type" ? "other" : f.id === "readiness_status" ? "ready" : "active" : "موارد_%"]));
  s.result = {data: [], count: 0, error: null}; const result = await readHrOperations({kind, columnFilters: filters}); expect(result.success, result.error).toBe(true);
  expect(s.calls.filter(c => ["eq", "or", "ilike", "gte"].includes(String(c[0]))).length).toBe(HR_OPERATIONS_CONFIG[kind].fields.length);
  expect(String(s.calls.find(c => c[0] === "select")?.[1])).toContain("!inner(");
  if (kind !== "assignments") {const field = kind === "blocks" ? "created_at" : "checked_at"; expect(s.calls).toContainEqual(["gte", field, "2026-01-02T00:00:00Z"]); expect(s.calls).toContainEqual(["lt", field, "2026-01-03T00:00:00.000Z"]);}
});
it("native employee/site/department/designation and status narrow, never expand, the same query", async () => {
  s.result = {data: [], count: 0, error: null}; expect((await readHrOperations({kind: "assignments", employeeId: 881401, workSiteId: 1087001, departmentId: 1, designationId: 2, status: "planned"})).success).toBe(true);
  for (const c of [["eq", "employee_id", 881401], ["eq", "work_site_id", 1087001], ["eq", "department_id", 1], ["eq", "designation_id", 2], ["eq", "assignment_status", "planned"]]) expect(s.calls).toContainEqual(c);
});
it.each([
  {kind: "assignments", sortKey: "company_name", alias: "company"},
  {kind: "assignments", sortKey: "department_name", alias: "department"},
  {kind: "assignments", sortKey: "designation_name", alias: "designation"},
  {kind: "assignments", sortKey: "site_name", alias: "site"},
  {kind: "readiness", sortKey: "site_name", alias: "site"},
] as const)("$kind $sortKey sorts the selected protected label alias, not an absent raw column", async ({kind, sortKey, alias}) => {
  s.result = {data: [], count: 0, error: null}; expect((await readHrOperations({kind, sortKey, sortDir: "asc"})).success).toBe(true);
  expect(s.calls).toContainEqual(["order", `${alias}(name_en)`, {ascending: true, nullsFirst: false}]); expect(s.calls).toContainEqual(["order", "id", {ascending: true}]);
});
it.each([{data: null, count: 0, error: null}, {data: [], count: null, error: null}, {data: [], count: 1, error: null}, {data: [rows.blocks, rows.blocks], count: 2, error: null}, {data: [{id: 1}], count: 1, error: null}, {data: [rows.blocks], count: 1, error: {message: "PRIVATE-SYNTHETIC", code: "57014"}}])("malformed, duplicate, truncated or failed reads are never successful empty", async result => {
  s.result = result; const r = await readHrOperations({kind: "blocks"}); expect(r.success).toBe(false); expect(r.data).toBeUndefined(); expect(JSON.stringify(r)).not.toContain("PRIVATE-SYNTHETIC");
});
it("416 reconciliation requires independently verified identical filtered native count", async () => {
  s.queue = [{data: null, count: null, status: 416, error: {code: "PGRST103"}}, {data: null, count: 1103, error: null}]; const r = await readHrOperations({kind: "blocks", page: 13, pageSize: 100, status: "active"}); expect(r.data).toMatchObject({rows: [], totalCount: 1103}); expect(s.calls.filter(c => c[0] === "eq")).toEqual([["eq", "block_status", "active"], ["eq", "block_status", "active"]]);
});
it.each([null, -1, 1201, 1.5, Number.MAX_SAFE_INTEGER + 1])("unverified reconciliation count %s stays failed", async count => {
  s.queue = [{data: null, count: null, status: 416, error: {code: "PGRST103"}}, {data: null, count, error: null}]; expect((await readHrOperations({kind: "readiness", page: 13, pageSize: 100})).success).toBe(false);
});
it("ordinary error does not trigger invisible count recovery and route fails privately", async () => {
  s.result = {data: null, count: null, status: 500, error: {code: "57014", message: "PRIVATE-SYNTHETIC"}}; expect((await readHrOperations({kind: "assignments", page: 13})).success).toBe(false); expect(s.calls.filter(c => c[0] === "select")).toHaveLength(1);
  const response = await POST(new Request("http://localhost/api/reads/hr-operations", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({kind: "assignments"})})); expect(response.status).toBe(503); expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(response.headers.get("X-ERP-Correlation")).toBeTruthy(); expect(await response.text()).not.toContain("PRIVATE-SYNTHETIC");
});
