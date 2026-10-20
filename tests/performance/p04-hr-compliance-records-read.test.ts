import {beforeEach, describe, expect, it, vi} from "vitest";
import {readHrComplianceRecords} from "@/server/reads/hr-compliance-records";
import {POST} from "@/app/api/reads/hr-compliance-records/route";
import {COMPLIANCE_KINDS, COMPLIANCE_CONFIG, compliancePageCriteriaSchema, DEPENDENT_MEDICAL_FIELDS, type ComplianceKind} from "@/lib/reads/hr-compliance-records-schema";
import {complianceFixture} from "./fixtures/compliance-record-fixture";
import {literalLike} from "@/lib/reads/search";

type Row = Record<string, unknown>;
type Call = {table: string; steps: [string, ...unknown[]][]};
type RpcArgs={employee_id?:number;permission_code?:string;p_employee?:number;p_dependent?:number;p_revision?:number};
const state = vi.hoisted(() => ({subject: {id: 7} as unknown, subjectError: false, context: {} as unknown, rows: [] as Row[], calls: [] as Call[],
  grants: {} as Record<string, unknown>, rpcError: false, error: false, partial: false, duplicate: false, noCount: false, forcedCount: null as number | null,
  abortAfter: null as AbortController | null, range416: false, headError: false, authCalls: 0, changeProjected: false}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => {state.authCalls++; return state.context;}}));
vi.mock("@/lib/logger", () => ({logger: {warn: vi.fn()}}));
vi.mock("@/lib/supabase/admin", () => ({createAdminClient: () => {throw Error("Privileged access forbidden");}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({
  rpc: (name: string, args: RpcArgs) => builder(name, args),
  from: (table: string) => builder(table),
})}));
function builder(table: string, args?: RpcArgs) {
  const call: Call = {table, steps: args ? [["args", args]] : []}; state.calls.push(call);
  const q: Record<string, unknown> = {then: (resolve: (value: unknown) => unknown) => {
    const head = (call.steps.find(s => s[0] === "select")?.[2] as {head?: boolean} | undefined)?.head;
    if(table==='f11_dependent_medical'&&args){const found=state.rows.find(r=>r.id===args.p_dependent&&r.employee_id===args.p_employee&&r.workspace_revision===args.p_revision);return Promise.resolve({data:found?{id:found.id,employee_id:found.employee_id,revision:found.workspace_revision,...Object.fromEntries(DEPENDENT_MEDICAL_FIELDS.map(field=>[field,found[field]]))}:null,error:state.rpcError?{message:'PRIVATE ERROR'}:null}).then(resolve);}
    if (args) return Promise.resolve({data: state.grants[args.permission_code??''] ?? true, error: state.rpcError ? {message: "PRIVATE ERROR"} : null}).then(resolve);
    if (table === "employees") return Promise.resolve({data: state.subject, error: state.subjectError ? {message: "PRIVATE ERROR"} : null}).then(resolve);
    let rows = [...state.rows];
    for (const [method, key, value] of call.steps) {
      if (method === "eq" && key === "id") rows = rows.filter(r => r.id === value);
      if (method === "in") rows = rows.filter(r => (value as unknown[]).includes(r[String(key)]));
    }
    const range = call.steps.find(s => s[0] === "range"), count = state.noCount ? null : state.forcedCount ?? rows.length;
    if (range && state.range416) return Promise.resolve({data: null, count: null, status: 416, error: {code: "PGRST103"}}).then(resolve);
    if (range) rows = rows.slice(Number(range[1]), Number(range[2]) + 1);
    if (state.changeProjected && call.steps.some(s => s[0] === "in")) rows = rows.map(row => ({...row, document_number: "CHANGED_AFTER_METADATA"}));
    if (state.partial) rows = rows.slice(0, -1);
    if (state.duplicate && rows.length > 1) rows[1] = rows[0];
    state.abortAfter?.abort();
    return Promise.resolve({data: head ? null : call.steps.some(s => s[0] === "maybeSingle") ? rows[0] ?? null : rows, count,
      error: state.error || head && state.headError ? {message: "PRIVATE ERROR"} : null, status: 200}).then(resolve);
  }};
  for (const method of ["select", "eq", "is", "in", "order", "range", "ilike", "abortSignal"]) q[method] = (...args: unknown[]) => {call.steps.push([method, ...args]); return q;};
  // Model the declared terminal PostgREST API: filters/cancellation must be
  // configured before maybeSingle, whose exposed builder is only awaitable.
  q.maybeSingle = () => {call.steps.push(["maybeSingle"]); return {then: q.then};};
  return q;
}
const page = (kind: ComplianceKind, extra = {}) => ({operation: "page", kind, employeeId: 7, ...extra});
const detail = (kind: ComplianceKind) => ({operation: "detail", kind, employeeId: 7, recordId: 17});
const request = (body: unknown, signal?: AbortSignal) => new Request("http://localhost/api/reads/hr-compliance-records", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify(body), signal});
beforeEach(() => {
  state.subject = {id: 7}; state.subjectError = false; state.context = {profile: {id: 7, must_change_password: false}, isAccountActive: true}; state.rows = [];
  state.calls = []; state.grants = {}; state.rpcError = false; state.error = false; state.partial = false; state.duplicate = false; state.noCount = false;
  state.forcedCount = null; state.abortAfter = null; state.range416 = false; state.headError = false; state.authCalls = 0; state.changeProjected = false;
});
describe.each(COMPLIANCE_KINDS)("%s scoped read", kind => {
  it("uses one request auth context and exact employee/kind capability before a counted lean page", async () => {
    state.rows = [complianceFixture(kind)]; const result = await readHrComplianceRecords(page(kind));
    expect(result.success).toBe(true); if (!result.success || !("rows" in result.data)) throw Error("Expected page");
    expect(state.authCalls).toBe(1); expect(result.data).toMatchObject({totalCount: 1, employeeId: 7, page: 1, pageSize: 25});
    expect(result.data.rows[0]).not.toHaveProperty("notes"); expect(result.data.rows[0]).not.toHaveProperty("restriction_details");
    expect(state.calls[0].table).toBe("employees"); expect(state.calls[0].steps).toContainEqual(["select", "id"]);
    const read = state.calls.at(-1)!; expect(read.table).toBe(COMPLIANCE_CONFIG[kind].table);
    expect(read.steps).toContainEqual(["eq", "employee_id", 7]); expect(read.steps).toContainEqual(["is", "deleted_at", null]);
    expect(read.steps).toContainEqual(["range", 0, 24]); expect(read.steps).toContainEqual(["order", "id", {ascending: true}]);
    expect(read.steps.find(s => s[0] === "select")?.[1]).not.toContain("*");
    expect(state.calls.filter(c => c.table === "f03_has_employee_permission").map(c => c.steps[0][1])).toContainEqual({employee_id: 7, permission_code: ["insurance", "medical"].includes(kind) ? "hr.medical.view" : "hr.compliance.view"});
  });
  it("returns actual zero but rejects errors, partial rows, null counts and duplicate IDs", async () => {
    expect((await POST(request(page(kind)))).status).toBe(200);
    for (const flag of ["error", "partial", "noCount", "duplicate"] as const) {
      state.rows = [complianceFixture(kind), complianceFixture(kind, 18)]; state[flag] = true;
      const response = await POST(request(page(kind))); expect(response.status).toBe(503); expect(await response.text()).not.toContain("PRIVATE ERROR"); state[flag] = false;
    }
  });
  it("pages beyond a simulated 1,000-row cap instead of truncating", async () => {
    state.rows = Array.from({length: 1234}, (_, i) => complianceFixture(kind, i + 1));
    const result = await readHrComplianceRecords(page(kind, {page: 13, pageSize: 100}));
    expect(result.success && "rows" in result.data && result.data.rows.map(r => r.id)).toEqual(Array.from({length: 34}, (_, i) => i + 1201));
    expect(result.success && "totalCount" in result.data && result.data.totalCount).toBe(1234);
  });
  it("loads exact selected detail without a partial editor and distinguishes unavailable child", async () => {
    const absent = await readHrComplianceRecords(detail(kind)); expect(absent.success && absent.data).toEqual({...detail(kind), availability: "unavailable"});
    state.rows = [complianceFixture(kind)]; const full = await readHrComplianceRecords(detail(kind));
    expect(full.success && "row" in full.data && full.data.row.notes).toBe("INITIAL_PRIVATE_NOTE");
    const ordinary=state.calls.findLast(c=>c.table===COMPLIANCE_CONFIG[kind].table);
    expect(ordinary?.steps).toContainEqual(["eq", "id", 17]);
    if(kind==='dependents'){
      for(const field of DEPENDENT_MEDICAL_FIELDS)expect(ordinary?.steps.find(s=>s[0]==='select')?.[1]).not.toContain(field);
      expect(state.calls.at(-1)).toEqual({table:'f11_dependent_medical',steps:[['args',{p_employee:7,p_dependent:17,p_revision:1}]]});
    }
    delete state.rows[0].notes; expect((await POST(request(detail(kind)))).status).toBe(503);
  });
  it("returns row-free restricted kind access, never a fabricated zero or entire-employee denial", async () => {
    state.grants[["insurance", "medical"].includes(kind) ? "hr.medical.view" : "hr.compliance.view"] = false;
    const result = await POST(request(page(kind))); expect(result.status).toBe(200);
    expect((await result.json()).data).toEqual({operation: "page", kind, employeeId: 7, availability: "restricted"});
    expect(state.calls.some(c => c.table === COMPLIANCE_CONFIG[kind].table)).toBe(false);
  });
  it("retains native empty-sort default order with stable ID ties", async () => {
    await readHrComplianceRecords(page(kind, {sorting: []}));
    expect(state.calls.at(-1)?.steps).toContainEqual(["order", COMPLIANCE_CONFIG[kind].sort, {ascending: COMPLIANCE_CONFIG[kind].ascending}]);
  });
});
it.each([{employeeId: "7"}, {employeeId: 0}, {employeeId: 2 ** 53}, {page: 0}, {pageSize: 101}, {search: "x".repeat(201)}, {table: "users"}, {columnFilters: {notes: "secret"}}, {sorting: [{id: "notes", desc: false}]}, {sorting: [{id: "expiry_date", desc: true}, {id: "expiry_date", desc: false}]}])("invalid untrusted input fails before auth: %j", async input => {
  expect((await POST(request(page("identity", input)))).status).toBe(400); expect(state.authCalls).toBe(0); expect(state.calls).toEqual([]);
});
it.each([null, {id: 8}, {id: "7"}])("missing/mismatched employee does not reach child reads: %j", async value => {
  state.subject = value; expect((await POST(request(page("identity")))).status).toBe(value === null ? 403 : 503); expect(state.calls).toHaveLength(1);
});
it("capability transport failure is 503, not denied/empty", async () => {state.rpcError = true; expect((await POST(request(page("identity")))).status).toBe(503);});
it("inactive principal does no database work", async () => {state.context = {isAccountActive: false}; expect((await POST(request(page("identity")))).status).toBe(403); expect(state.calls).toEqual([]);});
describe("existing F03 subject contract responses (synthetic transport, not native RLS acceptance)", () => {
  it.each(["self", "team"])("an authorized %s subject uses the bare exact-subject RPC and remains read-only", async scope => {
    state.context = {profile: {id: 7, must_change_password: false}, isAccountActive: true, permissionCodes: [`hr.employees.view.${scope}`, `hr.compliance.view.${scope}`]};
    state.grants = {"hr.compliance.view": true, "hr.compliance.manage": false, "hr.medical.view": false, "hr.medical.manage": false}; state.rows = [complianceFixture("identity")];
    const result = await readHrComplianceRecords(page("identity"));
    expect(result.success && "access" in result.data && result.data.access).toEqual({canManage: false, medicalView: false, medicalManage: false});
    expect(state.calls.find(c => c.table === "f03_has_employee_permission")?.steps[0][1]).toEqual({employee_id: 7, permission_code: "hr.compliance.view"});
  });
  it.each(["other employee", "other branch", "missing valid employee link"])("an RLS-hidden %s stops before child or capability reads", async () => {
    state.context = {profile: {id: 7, must_change_password: false}, isAccountActive: true, permissionCodes: ["hr.employees.view.self", "hr.compliance.view.self"]}; state.subject = null;
    expect((await POST(request(page("identity")))).status).toBe(403); expect(state.calls.map(c => c.table)).toEqual(["employees"]);
  });
  it("employee visibility or a medical manage hint does not substitute for medical view authority", async () => {
    state.context = {profile: {id: 7, must_change_password: false}, isAccountActive: true, permissionCodes: ["hr.employees.view.team", "hr.medical.manage"]};
    state.grants = {"hr.medical.view": false, "hr.medical.manage": true};
    const result = await readHrComplianceRecords(page("medical")); expect(result.success && result.data).toEqual({...page("medical"), availability: "restricted"});
    expect(state.calls.some(c => c.table === "employee_medical_records")).toBe(false);
  });
});
it("keeps medical view/manage independent and explicitly masks dependent sensitive detail", async () => {
  state.rows = [complianceFixture("dependents")]; state.grants["hr.medical.view"] = false;
  const result = await readHrComplianceRecords(detail("dependents")); if (!result.success || !("row" in result.data)) throw Error("Expected detail");
  for (const key of DEPENDENT_MEDICAL_FIELDS) expect((result.data.row as Row)[key]).toBeNull();
  expect(result.data.access).toEqual({canManage: true, medicalView: false, medicalManage: false});
  state.grants["hr.medical.view"] = true; state.grants["hr.medical.manage"] = false;
  const viewOnly = await readHrComplianceRecords(detail("dependents")); expect(viewOnly.success && "row" in viewOnly.data && (viewOnly.data.row as Row).medical_insurance_policy).toBe("SENSITIVE POLICY");
});
it("applies literal text filters without treating percent/underscore as wildcards", async () => {
  await readHrComplianceRecords(page("dependents", {search: "A%_", columnFilters: {dependent_name_en: " B "}}));
  expect(state.calls.at(-1)?.steps).toContainEqual(["ilike", "dependent_name_en", literalLike("A%_")]);
  expect(state.calls.at(-1)?.steps).toContainEqual(["ilike", "dependent_name_en", literalLike(" B ")]);
});
it("preserves date substring filtering using complete lean metadata traversal beyond 500", async () => {
  state.rows = Array.from({length: 602}, (_, i) => complianceFixture("identity", i + 1, 7, {expiry_date: i === 601 ? "2028-12-04" : "2027-01-01"}));
  const result = await readHrComplianceRecords(page("identity", {search: "2028-12"}));
  expect(result.success && "rows" in result.data && result.data.rows.map(r => r.id)).toEqual([602]);
  expect(state.calls.filter(c => c.table === COMPLIANCE_CONFIG.identity.table).map(c => c.steps.find(s => s[0] === "range"))).toEqual([["range", 0, 499], ["range", 500, 999], ["range", 0, 24]]);
  expect(state.calls.find(c => c.table === COMPLIANCE_CONFIG.identity.table)?.steps[0][1]).toBe("id,created_at,document_number,expiry_date");
});
it("retains multiple text sort priorities and exact table auto comparator behavior", async () => {
  state.rows = Array.from({length: 16}, (_, i) => complianceFixture("identity", i + 1, 7, {document_number: `DOC-${16-i}`, expiry_date: i < 8 ? "2027-01-01" : "2028-01-01"}));
  const result = await readHrComplianceRecords(page("identity", {sorting: [{id: "expiry_date", desc: true}, {id: "document_number", desc: false}]}));
  expect(result.success && "rows" in result.data && result.data.rows.map(r => r.id)).toEqual([16,15,14,13,12,11,10,9,8,7,6,5,4,3,2,1]);
});
it.each([{sortKey: "created_at", sortDir: "asc"}, {sorting: [{id: "created_at", desc: false}]}])("honors an allowed native field override even when that field is not a visible text column: %j", async sort => {
  state.rows = [complianceFixture("identity", 1, 7, {created_at: "2026-10-04T00:00:00Z"}), complianceFixture("identity", 2, 7, {created_at: "2026-10-03T00:00:00Z"})];
  const result = await readHrComplianceRecords(page("identity", sort));
  expect(result.success && "rows" in result.data && result.data.rows.map(r => r.id)).toEqual([2, 1]);
});
it("rejects a selected projection whose filter/sort values changed after metadata composition", async () => {
  state.rows = [complianceFixture("identity")]; state.changeProjected = true;
  const result = await POST(request(page("identity", {search: "SYNTHETIC-ID-001"})));
  expect(result.status).toBe(503);
});
it("rejects over-bound composition truthfully instead of returning a truncated successful page", async () => {
  state.forcedCount = 10001; state.rows = [complianceFixture("identity")];
  expect((await POST(request(page("identity", {search: "2027"})))).status).toBe(503);
});
it.each(["page", "detail"] as const)("binds cancellation before terminal builders for a compliance %s read", async operation => {
  state.rows = [complianceFixture("identity")]; const controller = new AbortController();
  const result = await readHrComplianceRecords(operation === "page" ? page("identity") : detail("identity"), undefined, controller.signal);
  expect(result.success).toBe(true);
  if (!result.success) throw Error("Expected authorized compliance read");
  if (operation === "page") expect("rows" in result.data && result.data.rows.map(row => row.id)).toEqual([17]);
  else expect("row" in result.data && result.data.row.id).toBe(17);
  const terminalCalls = state.calls.filter(call => call.steps.some(step => step[0] === "maybeSingle"));
  expect(terminalCalls).toHaveLength(operation === "page" ? 1 : 2);
  expect(terminalCalls[0].table).toBe("employees");
  for (const call of terminalCalls) {
    expect(call.steps).toContainEqual(["abortSignal", controller.signal]);
    expect(call.steps.findIndex(step => step[0] === "abortSignal")).toBeLessThan(call.steps.findIndex(step => step[0] === "maybeSingle"));
  }
});
it("forwards request cancellation to subject, capabilities and collection, and rejects a late fake success", async () => {
  state.rows = [complianceFixture("identity")]; const control = new AbortController();
  await POST(request(page("identity"), control.signal));
  expect(state.calls.every(call => call.steps.some(step => step[0] === "abortSignal"))).toBe(true);
  state.calls = []; state.authCalls = 0; control.abort();
  expect((await readHrComplianceRecords(page("identity"), undefined, control.signal)).success).toBe(false); expect(state.calls).toEqual([]); expect(state.authCalls).toBe(0);
  state.abortAfter = new AbortController();
  expect((await readHrComplianceRecords(page("identity"), undefined, state.abortAfter.signal)).success).toBe(false);
});
it("route uses private/no-store and does not expose raw native errors", async () => {
  const response = await POST(request(page("identity"))); expect(response.headers.get("Cache-Control")).toContain("private, no-store"); expect(response.headers.get("Vary")).toBe("Cookie");
  expect(compliancePageCriteriaSchema.parse(page("identity", {columnFilters: {expiry_date: "-01"}})).columnFilters.expiry_date).toBe("-01");
});
