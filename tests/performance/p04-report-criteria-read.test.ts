import {beforeEach, expect, it, vi} from "vitest";
import {existsSync, readFileSync} from "node:fs";
import type {AuthContext} from "@/lib/rbac/check";
type Row = Record<string, unknown>;
type Call = {table: string; methods: unknown[][]};
type SchemaError = {table: string; method: string; column: string};
type MockQuery = PromiseLike<{data: unknown; count: number | null; error: {code: string; message: string} | null}> & Record<"select" | "eq" | "is" | "order" | "or", (...args: unknown[]) => MockQuery>;
// A finite query-column contract, not a database/RLS emulator. In particular,
// company/branch status is real, while deleted_at and is_active are not.
const sourceColumns = vi.hoisted((): Record<string, readonly string[]> => ({
  erp_report_registry: ["report_code", "required_permissions", "filter_schema_json", "is_active", "deleted_at"],
  employees: ["id", "full_name_en", "employee_code", "owner_company_id", "branch_id", "department_id", "deleted_at", "employee_status"],
  owner_companies: ["id", "legal_name_en", "company_code", "status"],
  branches: ["id", "branch_name_en", "owner_company_id", "status"],
  departments: ["id", "department_name_en", "owner_company_id", "branch_id", "deleted_at", "is_active"],
  designations: ["id", "designation_name_en", "owner_company_id", "department_id", "deleted_at", "is_active"],
  work_sites: ["id", "site_name", "owner_company_id", "branch_id", "deleted_at", "status"],
}));
const state = vi.hoisted(() => ({auth: {} as AuthContext, authCalls: 0, clients: 0, calls: [] as Call[], rows: {} as Record<string, Row[]>, fault: "", malformed: "", short: false,
  count: undefined as number | null | undefined, selectedFault: false, selectedCount: undefined as number | null | undefined, recountFault: false, schemaErrors: [] as SchemaError[], exhausted: false, delayed: "", waiters: [] as (() => void)[]}));
vi.mock("@/lib/rbac/check", async () => ({...await vi.importActual("@/lib/rbac/scope"), getAuthContext: async () => {state.authCalls++; return state.auth;}}));
vi.mock("@/lib/supabase/admin", () => ({createAdminClient: () => {throw Error("Privileged client is forbidden");}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => {
  state.clients++;
  return {from(table: string) {
    const call: Call = {table, methods: []}; state.calls.push(call);
    const builder: Record<string, unknown> = {then: (resolve: (value: unknown) => unknown) => {
      const result = () => {
        const head = (call.methods.find(([m]) => m === "select")?.[2] as {head?: boolean})?.head;
        const predicates = new Map<unknown[], RegExpMatchArray[]>();
        for (const methodCall of call.methods) {
          const [method, key] = methodCall;
          let columns: string[] = [];
          if (method === "select") columns = String(key).split(",");
          if (["eq", "is", "order"].includes(String(method))) columns = [String(key)];
          if (method === "or") {
            const parts = [...String(key).matchAll(/(?:^|,)([a-z_][a-z0-9_]*)\.ilike\."%((?:\\.|[^"\\])*)%"/g)];
            if (!parts.length || parts.map(part => part[0]).join("") !== key) return {data: null, count: null, error: {code: "PGRST100", message: "SYNTHETIC_PRIVATE_INVALID_OR"}};
            predicates.set(methodCall, parts); columns = parts.map(part => part[1]);
          }
          for (const column of columns) if (!sourceColumns[table]?.includes(column)) {
            state.schemaErrors.push({table, method: String(method), column});
            return {data: null, count: null, error: {code: "42703", message: `SYNTHETIC_PRIVATE_UNKNOWN_COLUMN ${table}.${column}`}};
          }
        }
        const selected = table !== "erp_report_registry" && call.methods.some(([m, k]) => m === "eq" && k === "id");
        if (state.fault === table || selected && state.selectedFault || head && state.recountFault) return {data: null, count: null, error: {code: "57014", message: "SYNTHETIC_PRIVATE_FAILURE"}};
        let rows = [...(state.rows[table] ?? [])];
        for (const methodCall of call.methods) {
          const [method, key, value] = methodCall;
          if (method === "eq") rows = rows.filter(row => row[String(key)] === value);
          if (method === "is") rows = rows.filter(row => (row[String(key)] ?? null) === value);
          if (method === "or") {
            const parts = predicates.get(methodCall)!;
            rows = rows.filter(row => parts.some(part => String(row[part[1]] ?? "").toLowerCase().includes(part[2].toLowerCase())));
          }
        }
        const orders = call.methods.filter(([m]) => m === "order");
        rows.sort((a, b) => {for (const [, column] of orders) {const key = String(column), compared = typeof a[key] === "number" ? Number(a[key]) - Number(b[key]) : String(a[key]).localeCompare(String(b[key])); if (compared) return compared;} return 0;});
        const count = table === "erp_report_registry" ? rows.length : selected && state.selectedCount !== undefined ? state.selectedCount : state.count !== undefined ? state.count : rows.length;
        const range = call.methods.find(([m]) => m === "range");
        if (state.exhausted && range && Number(range[1]) > 0 && Number(range[1]) >= rows.length) return {data: null, error: {code: "PGRST103"}, count: null, status: 416};
        if (range) rows = rows.slice(Number(range[1]), Number(range[2]) + 1);
        if (state.short && table !== "erp_report_registry" && !selected) rows = rows.slice(0, 1);
        if (state.malformed === table) rows = [{id: 1}];
        return {data: head ? null : call.methods.some(([m]) => m === "maybeSingle") ? rows[0] ?? null : rows, count, error: null, status: 200};
      };
      return (state.delayed === table ? new Promise(resolve => state.waiters.push(() => resolve(result()))) : Promise.resolve(result())).then(resolve);
    }};
    for (const method of ["select", "is", "eq", "order", "or", "range", "maybeSingle", "abortSignal"]) builder[method] = (...args: unknown[]) => {call.methods.push([method, ...args]); return builder;};
    return builder;
  }};
}}));
import {readReportCriteria} from "@/server/reads/report-criteria";
import {createClient} from "@/lib/supabase/server";
import {POST} from "@/app/api/reads/report-criteria/route";
import {REPORT_CRITERION_KEYS, reportCriteriaPageSchema, reportCriteriaRestrictedSchema, reportCriteriaSchema} from "@/lib/reads/report-criteria-schema";
const codes = ["reports.run", "reports.view", "hr.employees.view", "organizations.view", "branches.view", "common_md.view"];
const employee = (id: number, extra: Row = {}) => ({id, full_name_en: `Synthetic ${String(id).padStart(5, "0")}`, employee_code: `TEST-${id}`,
  owner_company_id: 1, branch_id: 11, department_id: 21, deleted_at: null, employee_status: "active", ...extra});
const criteria = (extra = {}) => ({reportCode: "SYNTHETIC_REPORT", key: "employee_id", ...extra});
beforeEach(() => {
  Object.assign(state, {authCalls: 0, clients: 0, calls: [], fault: "", malformed: "", short: false, count: undefined, selectedFault: false, selectedCount: undefined, recountFault: false, schemaErrors: [], exhausted: false, delayed: "", waiters: []});
  state.auth = {profile: {id: 11, auth_user_id: "synthetic", must_change_password: false}, accountStatus: "active", isAccountActive: true, email: null,
    roleCodes: [], permissionCodes: codes, globalPermissionCodes: codes, roleAssignments: [{roleId: 3, roleCode: "synthetic", ownerCompanyId: null, branchId: null, permissionCodes: codes}]} as unknown as AuthContext;
  state.rows = {erp_report_registry: [{report_code: "SYNTHETIC_REPORT", required_permissions: ["reports.run"], filter_schema_json: {filters: [...REPORT_CRITERION_KEYS]}, is_active: true, deleted_at: null}],
    employees: [employee(1)], owner_companies: [{id: 1, legal_name_en: "Synthetic company", company_code: "SYN-C", status: "inactive"}],
    branches: [{id: 11, branch_name_en: "Synthetic branch", owner_company_id: 1, status: "inactive"}], departments: [{id: 21, department_name_en: "Synthetic department", owner_company_id: 1, branch_id: 11, is_active: false, deleted_at: null}],
    designations: [{id: 31, designation_name_en: "Synthetic designation", owner_company_id: 1, department_id: 21, is_active: false, deleted_at: null}],
    work_sites: [{id: 41, site_name: "Synthetic site", owner_company_id: 1, branch_id: 11, status: "closed", deleted_at: null}]};
});
const read = (extra = {}) => readReportCriteria(criteria(extra));
const page = async (extra = {}) => reportCriteriaPageSchema.parse((await read(extra)).data);
const statusSources = [
  {key: "owner_company_id", table: "owner_companies", label: "legal_name_en", id: 1, fields: "id,legal_name_en,company_code"},
  {key: "branch_id", table: "branches", label: "branch_name_en", id: 11, fields: "id,branch_name_en"},
] as const;
it.each(statusSources.flatMap(source => ["ordinary", "search", "selected", "recount"].map(mode => ({...source, mode}))))("strict source schema: $key $mode succeeds without a nonexistent deleted_at predicate", async ({key, table, label, id, fields, mode}) => {
  const base = state.rows[table][0];
  state.rows[table] = [
    {...base, id, [label]: "Alpha historical", status: "inactive"},
    {...base, id: id + 1, [label]: "Needle historical", status: "suspended"},
    {...base, id: id + 2, [label]: "Zulu historical", status: "inactive"},
  ];
  state.exhausted = mode === "recount";
  const extra = {key, pageSize: 2, ...(mode === "ordinary" ? {} : {search: mode === "selected" ? "Alpha" : "Needle"}),
    ...(mode === "selected" ? {selectedId: id + 1} : {}), ...(mode === "recount" ? {page: 3} : {})};
  const response = await read(extra);
  expect(response, JSON.stringify(state.schemaErrors)).toMatchObject({success: true});
  const result = reportCriteriaPageSchema.parse(response.data);
  expect(result.rows.map(row => row.value)).toEqual(mode === "ordinary" ? [id, id + 1] : mode === "recount" ? [] : [mode === "search" ? id + 1 : id]);
  expect(result.totalCount).toBe(mode === "ordinary" ? 3 : 1);
  expect(result.selected?.value ?? null).toBe(mode === "selected" ? id + 1 : null);
  const calls = state.calls.filter(call => call.table === table);
  expect(calls).toHaveLength(["selected", "recount"].includes(mode) ? 2 : 1);
  for (const call of calls) {
    expect(call.methods.some(([method, column]) => method === "is" && column === "deleted_at")).toBe(false);
    expect(call.methods.some(([method, column]) => method === "eq" && ["status", "is_active"].includes(String(column)))).toBe(false);
  }
  expect(calls[0].methods).toContainEqual(["select", fields, {count: "exact", head: false}]);
  expect(state.calls[0].methods).toContainEqual(["is", "deleted_at", null]);
  if (mode === "selected") {
    expect(calls[1].methods).toContainEqual(["eq", "id", id + 1]);
    expect(calls[1].methods.some(([method]) => method === "or")).toBe(false);
  }
  if (mode === "recount") {
    expect(calls[1].methods).toContainEqual(["select", fields, {count: "exact", head: true}]);
    expect(calls[1].methods.find(([method]) => method === "or")).toEqual(calls[0].methods.find(([method]) => method === "or"));
  }
});
it.each(statusSources.flatMap(source => ["select", "eq", "is", "order", "or"].map(method => ({...source, method}))))("strict mock rejects $table unknown columns through $method", async ({table, method}) => {
  const client = await createClient();
  // Deliberately bypass query typing only to exercise the fake's invalid-input boundary.
  const query = client.from(table).select("id") as unknown as MockQuery;
  const args = method === "or" ? ['deleted_at.ilike."%hidden%"'] : method === "eq" || method === "is" ? ["deleted_at", null] : ["deleted_at"];
  const result = await query[method as keyof Pick<MockQuery, "select" | "eq" | "is" | "order" | "or">](...args);
  expect(result).toMatchObject({data: null, count: null, error: {code: "42703"}});
  expect(state.schemaErrors).toEqual([{table, method, column: "deleted_at"}]);
});
it.each(statusSources.flatMap(source => ["source", "selected", "recount"].map(mode => ({...source, mode}))))("$key returned $mode failure stays explicit and sanitized under the strict schema", async ({key, table, id, mode}) => {
  if (mode === "source") state.fault = table;
  if (mode === "selected") state.selectedFault = true;
  if (mode === "recount") {state.exhausted = true; state.recountFault = true;}
  const result = await read({key, ...(mode === "selected" ? {selectedId: id} : {}), ...(mode === "recount" ? {page: 3} : {})});
  expect(result).toEqual({success: false, error: "Report choices could not be loaded. Please retry."});
  expect(state.schemaErrors).toEqual([]);
  expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE");
  if (mode === "recount") expect(state.calls.filter(call => call.table === table)[1].methods).toContainEqual(["select", statusSources.find(source => source.table === table)!.fields, {count: "exact", head: true}]);
});
it.each(statusSources)("$key missing selected identity remains non-enumerating", async ({key, table}) => {
  state.rows[table] = [];
  expect(await page({key, selectedId: 999})).toMatchObject({rows: [], selected: null, totalCount: 0});
  expect(state.schemaErrors).toEqual([]);
});
it("company-constrained branch pages and selected IDs keep the same dependency", async () => {
  const branch = state.rows.branches[0];
  state.rows.branches = [branch, {...branch, id: 12, owner_company_id: 2}];
  const result = await page({key: "branch_id", ownerCompanyId: 1, search: "Synthetic", selectedId: 12});
  expect(result).toMatchObject({rows: [{value: 11}], selected: null, totalCount: 1});
  for (const call of state.calls.slice(1)) expect(call.methods).toContainEqual(["eq", "owner_company_id", 1]);
});
it.each([
  {key: "employee_id", table: "employees"}, {key: "department_id", table: "departments"},
  {key: "designation_id", table: "designations"}, {key: "work_site_id", table: "work_sites"},
].flatMap(source => [false, true].map(recount => ({...source, recount}))))("$key still excludes soft-deleted rows and selected IDs, recount=$recount", async ({key, table, recount}) => {
  const live = state.rows[table][0], deletedId = Number(live.id) + 1;
  state.rows[table] = [live, {...live, id: deletedId, deleted_at: "2026-10-01T00:00:00Z"}];
  state.exhausted = recount;
  const result = await page({key, search: "Synthetic", selectedId: deletedId, pageSize: 1, ...(recount ? {page: 2} : {})});
  expect(result.rows.map(row => row.value)).toEqual(recount ? [] : [live.id]);
  expect(result.totalCount).toBe(1); expect(result.selected).toBeNull();
  const calls = state.calls.filter(call => call.table === table);
  expect(calls).toHaveLength(recount ? 3 : 2);
  for (const call of calls) expect(call.methods).toContainEqual(["is", "deleted_at", null]);
  if (recount) expect(calls.some(call => call.methods.some(([method, , options]) => method === "select" && (options as {head?: boolean}).head))).toBe(true);
  expect(state.schemaErrors).toEqual([]);
});
it("ordinary open uses one live context, one ordinary client, a trusted registry point and one bounded page", async () => {
  state.rows.employees = Array.from({length: 1301}, (_, i) => employee(i + 1)); const result = await page();
  expect(result.rows).toHaveLength(25); expect(result.totalCount).toBe(1301); expect(state.authCalls).toBe(1); expect(state.clients).toBe(1);
  expect(state.calls.map(call => call.table)).toEqual(["erp_report_registry", "employees"]);
  expect(state.calls[1].methods).toContainEqual(["select", "id,full_name_en,employee_code", {count: "exact", head: false}]);
  expect(state.calls[1].methods).toContainEqual(["range", 0, 24]); expect(state.calls[1].methods).toContainEqual(["order", "id", {ascending: true}]);
});
it("server search and native paging find rows beyond 500 and 1000 without whole-collection loading", async () => {
  state.rows.employees = Array.from({length: 1301}, (_, i) => employee(i + 1));
  expect((await page({search: "01301"})).rows.map(row => row.value)).toEqual([1301]);
  const deep = await page({page: 41}); expect(deep.rows[0].value).toBe(1001); expect(deep.totalCount).toBe(1301);
  expect(state.calls.filter(call => call.table === "employees")).toHaveLength(2);
});
it("selected inactive employee is independently pinned even when outside current search and page", async () => {
  state.rows.employees = [employee(1), employee(701, {employee_status: "inactive"})];
  const result = await page({search: "00001", selectedId: 701}); expect(result.rows.map(row => row.value)).toEqual([1]); expect(result.selected?.value).toBe(701);
  expect(state.calls[2].methods).toContainEqual(["eq", "id", 701]); expect(state.calls[2].methods.some(([m]) => m === "or")).toBe(false);
});
it.each(REPORT_CRITERION_KEYS)("%s retains non-deleted historical inactive choices without an invented active filter", async key => {
  const result = await page({key}); expect(result.totalCount).toBe(1);
  expect(state.calls[1].methods.some(([method, column]) => method === "eq" && ["is_active", "employee_status", "status"].includes(String(column)))).toBe(false);
});
it("employee company/branch/department constraints apply equally to searched rows and selected ID", async () => {
  state.rows.employees = [employee(1), employee(2, {branch_id: 12}), employee(3, {owner_company_id: 2}), employee(4, {department_id: 22})];
  const result = await page({ownerCompanyId: 1, branchId: 11, departmentId: 21, selectedId: 2});
  expect(result.rows.map(row => row.value)).toEqual([1]); expect(result.selected).toBeNull();
  for (const call of state.calls.slice(1)) for (const constraint of [["eq", "owner_company_id", 1], ["eq", "branch_id", 11], ["eq", "department_id", 21]]) expect(call.methods).toContainEqual(constraint);
});
it.each([["branch_id", {ownerCompanyId: 1}], ["department_id", {ownerCompanyId: 1}], ["designation_id", {ownerCompanyId: 1, departmentId: 21}], ["work_site_id", {ownerCompanyId: 1}]])("%s respects only source-defined dependency columns", async (key, dependencies) => {
  expect((await page({key, ...dependencies as object})).totalCount).toBe(1);
});
it.each([["department_id", "departments", 21], ["work_site_id", "work_sites", 41]])("%s retains historical company-wide null-branch selections", async (key, table, selectedId) => {
  state.rows[String(table)][0].branch_id = null;
  const result = await page({key, ownerCompanyId: 1, selectedId}); expect(result.selected?.value).toBe(selectedId);
  expect(state.calls.slice(1).every(call => !call.methods.some(([method, column]) => method === "eq" && column === "branch_id"))).toBe(true);
});
it.each(["no-run", "suspended", "forced-password", "no-profile"])("%s fails before any database client or labels", async mode => {
  if (mode === "no-run") state.auth.permissionCodes = ["hr.employees.view"]; if (mode === "suspended") state.auth.isAccountActive = false;
  if (mode === "forced-password") state.auth.profile!.must_change_password = true; if (mode === "no-profile") state.auth.profile = null;
  expect(await read()).toEqual({success: false, error: "Permission denied"}); expect(state.clients).toBe(0);
});
it.each(["reports.run only", "scoped common data"])("%s cannot use the report picker to widen label authority", async mode => {
  state.auth.permissionCodes = mode === "reports.run only" ? ["reports.run"] : ["reports.run", "common_md.view"]; state.auth.globalPermissionCodes = ["reports.run"];
  const result = reportCriteriaRestrictedSchema.parse((await read({key: mode === "reports.run only" ? "employee_id" : "department_id"})).data);
  expect(Object.keys(result).sort()).toEqual(["availability", "criteria"]); expect(state.calls.map(call => call.table)).toEqual(["erp_report_registry"]);
});
it.each(["hidden", "inactive", "deleted", "required-permission"])("%s registry is terminal report denial, not an optional empty lookup", async mode => {
  if (mode === "hidden") state.rows.erp_report_registry = []; if (mode === "inactive") state.rows.erp_report_registry[0].is_active = false;
  if (mode === "deleted") state.rows.erp_report_registry[0].deleted_at = "2026-10-01"; if (mode === "required-permission") state.rows.erp_report_registry[0].required_permissions = ["reports.synthetic.never"];
  expect(await read()).toEqual({success: false, error: "Permission denied"}); expect(state.calls).toHaveLength(1);
});
it.each(["key", "dependency"])("unregistered %s applicability is rejected before any labels", async mode => {
  state.rows.erp_report_registry[0].filter_schema_json = {filters: mode === "key" ? ["date_from"] : ["employee_id"]};
  expect((await read(mode === "key" ? {} : {ownerCompanyId: 1})).error).toMatch(/^Invalid /); expect(state.calls).toHaveLength(1);
});
it.each(["employees", "erp_report_registry", "selected"])("returned %s error is unavailable, never successful empty", async mode => {
  if (mode === "selected") state.selectedFault = true; else state.fault = mode;
  const result = await read({selectedId: 1}); expect(result.success).toBe(false); expect(result.data).toBeUndefined(); expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE");
});
it("confirmed empty rows and an inaccessible selected ID are explicit and non-enumerating", async () => {
  state.rows.employees = [];
  expect(await page({selectedId: 999})).toMatchObject({rows: [], totalCount: 0, selected: null});
});
it.each([null, -1, 1.5, Number.MAX_SAFE_INTEGER + 1])("invalid page count %s is rejected", async count => {state.count = count; expect((await read()).success).toBe(false);});
it.each([null, -1, 2])("invalid selected count %s is rejected", async count => {state.selectedCount = count; expect((await read({selectedId: 1})).success).toBe(false);});
it.each(["employees", "erp_report_registry"])("malformed %s data cannot masquerade as a validated result", async table => {state.malformed = table; expect((await read()).success).toBe(false);});
it("a silently capped page is a read failure", async () => {state.rows.employees = [employee(1), employee(2)]; state.short = true; expect((await read()).success).toBe(false);});
it("a verified native416 recount remains a correct empty out-of-range page", async () => {
  state.exhausted = true; const result = await page({page: 3}); expect(result.rows).toEqual([]); expect(result.totalCount).toBe(1);
  expect(state.calls[2].methods).toContainEqual(["select", "id,full_name_en,employee_code", {count: "exact", head: true}]);
});
it("PostgREST search syntax and SQL wildcards remain literal", async () => {
  await read({search: '5%_(a),"x'});
  expect(state.calls[1].methods.find(([m]) => m === "or")?.[1]).toBe('full_name_en.ilike."%5\\\\%\\\\_(a),\\"x%",employee_code.ilike."%5\\\\%\\\\_(a),\\"x%"');
});
it.each([{page: 0}, {pageSize: 101}, {search: "x".repeat(201)}, {selectedId: 1.1}, {key: "arbitrary"}, {key: "owner_company_id", branchId: 1}, {context: {permissionCodes: ["erp.admin"]}}])("invalid raw criteria %j never reaches authorization", async extra => {
  expect((await read(extra)).error).toMatch(/^Invalid /); expect(state.authCalls).toBe(0); expect(state.clients).toBe(0);
});
it("pre-aborted request does no auth or database work", async () => {
  const abort = new AbortController(); abort.abort(); await expect(readReportCriteria(criteria(), undefined, abort.signal)).rejects.toMatchObject({name: "AbortError"}); expect(state.authCalls).toBe(0); expect(state.clients).toBe(0);
});
it.each(["erp_report_registry", "employees"])("aborted %s late fake success cannot continue or return success", async table => {
  const abort = new AbortController(); state.delayed = table; const pending = readReportCriteria(criteria(), undefined, abort.signal);
  await vi.waitFor(() => expect(state.waiters).toHaveLength(1)); abort.abort(); state.waiters[0](); await expect(pending).rejects.toMatchObject({name: "AbortError"});
  if (table === "erp_report_registry") expect(state.calls).toHaveLength(1);
  for (const call of state.calls) expect(call.methods).toContainEqual(["abortSignal", abort.signal]);
  // maybeSingle narrows the SDK's declared builder type; attach the signal first.
  expect(state.calls[0].methods.slice(-2)).toEqual([["abortSignal", abort.signal], ["maybeSingle"]]);
});
it.each(["ok", "restricted", "denied", "failed", "invalid"])("actual route %s has private headers and truthful HTTP/body classification", async mode => {
  if (mode === "restricted") {state.auth.permissionCodes = ["reports.run"]; state.auth.globalPermissionCodes = ["reports.run"];}
  if (mode === "denied") state.auth.permissionCodes = []; if (mode === "failed") state.fault = "employees";
  const response = await POST(new Request("http://localhost/api/reads/report-criteria", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(criteria(mode === "invalid" ? {page: 0} : {}))}));
  expect(response.status).toBe({ok: 200, restricted: 200, denied: 403, failed: 503, invalid: 400}[mode]);
  expect(response.headers.get("cache-control")).toContain("private, no-store"); expect(response.headers.get("vary")).toBe("Cookie");
  const body = await response.json(); expect(JSON.stringify(body)).not.toContain("SYNTHETIC_PRIVATE");
  if (mode === "restricted") expect(Object.keys(body.data).sort()).toEqual(["availability", "criteria"]);
});
it("obsolete privileged Server Action is removed and neither shipped report component imports it", () => {
  expect(existsSync("src/server/actions/reports/filter-lookups.ts")).toBe(false);
  for (const path of ["src/features/report-center/report-run-page.tsx", "src/features/report-center/report-filter-panel.tsx"]) expect(readFileSync(path, "utf8")).not.toContain("getReportFilterLookups");
});
it("schema rejects duplicate rows, secret fields and wrong selected identities", () => {
  const base = {criteria: reportCriteriaSchema.parse(criteria({selectedId: 1})), rows: [{value: 1, label: "Test", code: null}], selected: {value: 1, label: "Test", code: null}, totalCount: 1};
  expect(reportCriteriaPageSchema.safeParse({...base, rows: [...base.rows, ...base.rows], totalCount: 2}).success).toBe(false);
  expect(reportCriteriaPageSchema.safeParse({...base, selected: {...base.selected, value: 2}}).success).toBe(false);
  expect(reportCriteriaPageSchema.safeParse({...base, rawSalary: "PRIVATE"}).success).toBe(false);
});
