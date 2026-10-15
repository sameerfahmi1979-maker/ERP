import {beforeEach, describe, expect, it, vi} from "vitest";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import type {AuthContext} from "@/lib/rbac/check";
import {readHrSearch} from "@/server/reads/hr-search";
import {POST} from "@/app/api/reads/hr-search/route";
import {hrSearchFullCriteriaSchema, hrSearchPageReadSchema, hrSearchReadRequestSchema} from "@/lib/reads/hr-search-read-schema";
import {literalContains, literalLike} from "@/lib/reads/search";
const m = vi.hoisted(() => ({auth: vi.fn(), create: vi.fn(), resolve: vi.fn()}));
vi.mock("@/lib/rbac/check", async original => ({...await original<typeof import("@/lib/rbac/check")>(), getAuthContext: m.auth}));
vi.mock("@/lib/supabase/server", () => ({createClient: m.create}));
type Call = [string, ...unknown[]];
type Entry = {table: string; calls: Call[]};
const calls: Entry[] = [];
const tables: Record<string, Record<string, unknown>[]> = {};
const codes = ["hr.employees.view", "hr.recruitment.view", "hr.compliance.view", "hr.medical.view", "hr.confidential.view", "hr.leave.view", "hr.payroll.view", "hr.assignments.view", "hr.actions.view"];
const auth = (permissions = codes): AuthContext => ({profile: {
  id: 8, auth_user_id: "synthetic", must_change_password: false, avatar_url: null, branch_id: null, created_at: "2026-10-05T00:00:00Z",
  department: null, display_name: null, email_confirmed_by_admin_at: null, email_confirmed_by_admin_id: null, employee_reference: null,
  full_name: null, job_title: null, last_admin_updated_at: null, last_password_security_action: null, last_password_security_action_at: null,
  last_password_security_action_by: null, manager_user_profile_id: null, must_change_password_reason: null, notes: null, owner_company_id: null,
  password_changed_at: null, password_reset_sent_at: null, password_set_by_admin_at: null, phone: null, preferred_language: null, status: "active",
  timezone: null, updated_at: "2026-10-05T00:00:00Z", user_code: null,
}, email: null, roleCodes: [], permissionCodes: permissions, globalPermissionCodes: permissions, isAccountActive: true, accountStatus: "active"});
function chain(table: string) {
  const entry = {table, calls: [] as Call[]}; calls.push(entry); const q: Record<string, unknown> = {};
  for (const name of ["select", "is", "eq", "in", "or", "ilike", "gte", "lte", "order", "range", "abortSignal"]) q[name] = (...args: unknown[]) => {entry.calls.push([name, ...args]); return q;};
  q.then = (yes: (v: unknown) => void, no: (e: unknown) => void) => Promise.resolve(m.resolve(entry)).then(yes, no); return q;
}
function resolve(entry: Entry) {
  const all = tables[entry.table] ?? [], range = entry.calls.find(c => c[0] === "range");
  const head = (entry.calls.find(c => c[0] === "select")?.[2] as {head?: boolean})?.head;
  return {data: head ? null : range ? all.slice(Number(range[1]), Number(range[2]) + 1) : all, count: all.length, error: null};
}
function row(id = 1) {return {id, employee_code: `EMP-${id}`, full_name_en: `Employee ${id}`, full_name_ar: "عربي", known_name: null, mobile_number: null, personal_email: null,
  employee_status: "active", joining_date: null, candidate_code: `CAN-${id}`, email: null, candidate_status: "hired", pipeline_stage: "onboarding", created_at: "2026-10-05T00:00:00Z",
  employee_id: 500, employee: {id: 500, employee_code: "EMP-500", full_name_en: "Permitted employee"}, candidate_id: 400,
  candidate: {full_name_en: "Permitted candidate", candidate_code: "CAN-400"}, document_type: {name_en: "passport"}, document_number: "PASS", expiry_date: "2099-01-01", verification_status: "verified",
  access_type: {name_en: "gate"}, card_number: "CARD", status: "active", certificate_number: "CERT", training_type: {name_en: "Safety"},
  record_type: {name_en: "Fitness"}, report_number: "MED", examination_date: "2026-10-05", next_examination_date: null, result: "fit", approval_status: "approved", start_date: "2026-10-05", end_date: "2026-10-06", leave_type: {name_en: "Annual"},
  wps_status: "enrolled", bank_id: 2, is_active: true, assignment_status: "active", effective_from: null, work_site: {site_name: "Permitted site"},
  block_status: "active", process_title: "Visa", process_status: "completed", request_date: null, action_type: "Transfer", action_status: "pending", action_date: null,
  subject: "Synthetic subject", severity: "low", incident_date: null, eos_type: "Resignation", reason: null, case_status: "closed", last_working_date: null,
  task_title: "Start", task_category: "Orientation", task_status: "completed", due_date: null};}
const full = (extra = {}) => ({mode: "results", query: "Employee", ...extra});
beforeEach(() => {vi.clearAllMocks(); calls.length = 0; for (const key of Object.keys(tables)) delete tables[key];
  m.auth.mockResolvedValue(auth()); m.create.mockResolvedValue({from: chain}); m.resolve.mockImplementation(resolve);});
describe("complete fixed-source paging", () => {
  it("reaches past the former 5000 subject walk and reads only a bounded counted page", async () => {
    tables.employees = Array.from({length: 5107}, (_, i) => row(i + 1));
    const result = await readHrSearch(full({categories: ["employees"], page: 101}));
    expect(result).toMatchObject({success: true, data: {totalCount: 5107, groupCounts: {employees: 5107}, hasMore: true}});
    if (!result.success || !("results" in result.data)) throw Error("Wrong result");
    expect(result.data.results).toHaveLength(50); expect(result.data.results[0].entityId).toBe(5001); expect(calls).toHaveLength(2);
    expect(calls[1].calls).toContainEqual(["range", 5000, 5049]); expect(calls[1].calls).toContainEqual(["order", "id", {ascending: true}]);
    expect(calls.flatMap(e => e.calls).some(c => c[0] === "in" && c[1] === "id")).toBe(false);
  });
  it("one global page can cross source boundaries while retaining complete category totals", async () => {
    tables.employees = Array.from({length: 51}, (_, i) => row(i + 1)); tables.hr_candidates = [row(1), row(2)];
    expect(await readHrSearch(full({categories: ["employees", "candidates"], page: 2}))).toMatchObject({success: true, data: {totalCount: 53, groupCounts: {employees: 51, candidates: 2}, hasMore: false,
      results: [{id: "emp-51"}, {id: "cand-1"}, {id: "cand-2"}]}});
    expect(calls.filter(e => e.calls.some(c => c[0] === "range")).map(e => [e.table, e.calls.find(c => c[0] === "range")])).toEqual([
      ["employees", ["range", 50, 50]], ["hr_candidates", ["range", 0, 1]]]);
  });
  it("an out-of-range page returns verified nonzero totals without fetching a phantom page", async () => {
    tables.employees = [row()]; expect(await readHrSearch(full({categories: ["employees"], page: 100}))).toMatchObject({success: true, data: {results: [], totalCount: 1, hasMore: false}});
    expect(calls).toHaveLength(1); expect(calls[0].calls.some(c => c[0] === "range")).toBe(false);
  });
  it("16 source classes are counted, without eager employee lookup, and only intersecting pages are read", async () => {
    expect(await readHrSearch(full())).toMatchObject({success: true, data: {results: [], totalCount: 0}}); expect(calls).toHaveLength(16);
    for (const e of calls) {expect(e.calls).toContainEqual(["is", "deleted_at", null]); expect(e.calls.some(c => c[0] === "range")).toBe(false);}
  });
});
const sourceCases = [
  ["employees", "employees", "emp-1", "Employee 1"], ["hr_candidates", "candidates", "cand-1", "Employee 1"],
  ["employee_identity_documents", "compliance", "comp-id-1", "passport"], ["employee_access_cards", "compliance", "comp-card-1", "Access Card — gate"],
  ["employee_training_certificates", "compliance", "comp-cert-1", "Safety"], ["employee_medical_records", "compliance", "comp-med-1", "Medical: Fitness"],
  ["employee_leave_requests", "time", "time-leave-1", "Leave: Annual"], ["employee_wps_profiles", "payroll", "pay-wps-1", "WPS Profile"],
  ["employee_payroll_holds", "payroll", "pay-hold-1", "Payroll Hold — Active"], ["employee_assignments", "operations", "ops-assign-1", "Assignment: Permitted site"],
  ["employee_operational_blocks", "operations", "ops-block-1", "Operational Block — Active"], ["employee_pro_processes", "actions", "act-pro-1", "PRO: Visa"],
  ["employee_hr_actions", "actions", "act-hr-1", "HR Action: Transfer"], ["employee_disciplinary_records", "actions", "act-disc-1", "Disciplinary — low"],
  ["employee_eos_cases", "actions", "act-eos-1", "EOS: Resignation"], ["hr_onboarding_tasks", "onboarding", "onboard-1", "Start"],
] as const;
it.each(sourceCases)("maps the existing %s minimal display shape without leaking extra source fields", async (table, category, id, title) => {
  tables[table] = [{...row(), bank_account: "PRIVATE", diagnosis: "PRIVATE", file_url: "PRIVATE", salary: 999}];
  const result = await readHrSearch(full({categories: [category]})); expect(result).toMatchObject({success: true, data: {results: [{id, title, category}], totalCount: 1}});
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE|bank_id|bank_account|diagnosis|file_url|"salary"/);
  const projections = calls.map(e => e.calls.find(c => c[0] === "select")?.[1]); expect(projections.every(p => typeof p === "string" && !p.includes("*"))).toBe(true);
});
it("employee scope/status filters occur before count and page and retain literal query characters", async () => {
  tables.employees = [row()]; const query = ' a%,_("ب")\\ ';
  await readHrSearch(full({query, categories: ["employees"], ownerCompanyId: 1, branchId: 2, departmentId: 3, designationId: 4, status: "active"}));
  for (const e of calls) {
    for (const [column, value] of [["owner_company_id", 1], ["branch_id", 2], ["department_id", 3], ["designation_id", 4], ["employee_status", "active"]]) expect(e.calls).toContainEqual(["eq", column, value]);
    expect(e.calls).toContainEqual(["or", ["employee_code", "full_name_en", "full_name_ar", "known_name", "mobile_number", "personal_email"].map(c => `${c}.ilike.${literalContains(query)}`).join(",")]);
  }
});
it("child matching uses filtered left aliases but independently authorized display labels and an inner scoped employee", async () => {
  await readHrSearch(full({categories: ["time"], query: " a% ", ownerCompanyId: 1, branchId: 2})); const e = calls[0];
  expect(e.calls[0][1]).toContain("employee:employees!employee_id!inner(id,employee_code,full_name_en)");
  expect(e.calls[0][1]).toContain("leave_type:hr_leave_types!leave_type_id(name_en)"); expect(e.calls[0][1]).toContain("search_related:hr_leave_types!leave_type_id(id)");
  expect(e.calls).toContainEqual(["eq", "employee.owner_company_id", 1]); expect(e.calls).toContainEqual(["eq", "employee.branch_id", 2]);
  expect(e.calls).toContainEqual(["in", "employee.employee_status", ["active", "probation", "on_leave"]]);
  expect(e.calls).toContainEqual(["or", "search_employee.not.is.null,search_related.not.is.null"]);
  expect(e.calls).toContainEqual(["ilike", "search_related.name_en", literalLike(" a% ")]);
});
it("hidden optional labels are masked rather than dropping lawful rows or replacing them with raw foreign-table data", async () => {
  tables.employee_assignments = [{...row(), work_site: null}]; tables.hr_onboarding_tasks = [{...row(), candidate: null}];
  expect(await readHrSearch(full({categories: ["operations", "onboarding"]}))).toMatchObject({success: true, data: {results: [{title: "Assignment"}, {subtitle: "Candidate #400"}], totalCount: 2}});
});
it("medical reads require the separate capability and no denied source is counted", async () => {
  expect(await readHrSearch(full({categories: ["compliance"]}), auth(["hr.compliance.view"]))).toMatchObject({success: true});
  expect(calls.map(e => e.table)).toEqual(["employee_identity_documents", "employee_access_cards", "employee_training_certificates"]);
});
it("payroll/operations active conditions and existing category-specific employee statuses remain in the native predicate", async () => {
  await readHrSearch(full({categories: ["payroll", "operations"]}));
  for (const e of calls.filter(e => e.table === "employee_payroll_holds")) expect(e.calls).toContainEqual(["eq", "is_active", true]);
  for (const e of calls.filter(e => e.table === "employee_operational_blocks")) {expect(e.calls).toContainEqual(["eq", "block_status", "active"]); expect(e.calls.some(c => c[0] === "or" && String(c[1]).startsWith("effective_to.is.null,"))).toBe(true);}
  for (const e of calls.filter(e => ["employee_payroll_holds", "employee_wps_profiles"].includes(e.table))) expect(e.calls).toContainEqual(["in", "employee.employee_status", ["active", "probation"]]);
});
it("counts onboarding without an unnecessary nullable candidate-label join and keeps that label on the displayed page",async()=>{
  tables.hr_onboarding_tasks=[row()];expect((await readHrSearch(full({categories:["onboarding"]}))).success).toBe(true);
  const selects=calls.filter(e=>e.table==="hr_onboarding_tasks").map(e=>e.calls.find(c=>c[0]==="select")!);
  expect(selects).toHaveLength(2);expect(selects[0][2]).toMatchObject({head:true});expect(selects[0][1]).not.toContain("candidate:hr_candidates");expect(selects[1][1]).toContain("candidate:hr_candidates");
});
it("candidate/onboarding filter-only dates/status remain their own old fields, not invented company scope", async () => {
  await readHrSearch(full({query: "", categories: ["candidates", "onboarding"], status: "completed", dateFrom: "2026-01-01", dateTo: "2026-12-31"}));
  for (const e of calls) {const date = e.table === "hr_candidates" ? "created_at" : "due_date";
    expect(e.calls).toContainEqual(["gte", date, "2026-01-01"]); expect(e.calls).toContainEqual(["lte", date, "2026-12-31"]);
    expect(e.calls).toContainEqual(["eq", e.table === "hr_candidates" ? "candidate_status" : "task_status", "completed"]);
  }
});
it.each([{workSiteId: 1}, {status: "active"}, {dateFrom: "2026-10-01"}, {ownerCompanyId: 1}, {categories: ["time"], query: ""}, {categories: ["payroll"]}])("does not dispatch unsupported or unauthorized criteria %j", async extra => {
  expect(await readHrSearch(full(extra), auth(["hr.employees.view", "hr.recruitment.view", "hr.compliance.view"]))).toMatchObject({success: false, error: expect.stringContaining("Invalid ")}); expect(m.create).not.toHaveBeenCalled();
});
it.each(["count-null", "count-negative", "count-fraction", "read-error", "page-count-drift", "short-page", "duplicate", "hidden-inner-parent", "unexpected-to-many"])("fails closed for %s instead of silently succeeding with partial/empty results", async kind => {
  tables.employee_leave_requests = [row(), row(2)];
  m.resolve.mockImplementation((e: Entry) => {const r = resolve(e), head = (e.calls[0][2] as {head?: boolean})?.head;
    if (kind === "count-null") r.count = null as unknown as number;
    if (kind === "count-negative") r.count = -1;
    if (kind === "count-fraction") r.count = 1.2;
    if (kind === "read-error") r.error = {message: "PRIVATE SQL"} as unknown as null;
    if (!head) {if (kind === "page-count-drift") r.count = 3;
      if (kind === "short-page") r.data = [];
      if (kind === "duplicate") r.data = [row(), row()];
      if (kind === "hidden-inner-parent") r.data = [{...row(), employee: null}, row(2)];
      if (kind === "unexpected-to-many") r.data = [{...row(), leave_type: [{name_en: "one"}, {name_en: "two"}]}, row(2)];}
    return r;});
  const result = await readHrSearch(full({categories: ["time"]})); expect(result.success).toBe(false); expect(result).not.toHaveProperty("data"); expect(JSON.stringify(result)).not.toContain("PRIVATE");
});
it("a single permitted category failure fails the whole read instead of allSettled partial success", async () => {
  tables.employees = [row()]; m.resolve.mockImplementation((e: Entry) => e.table === "hr_candidates" ? {data: null, count: null, error: {message: "hidden failure"}} : resolve(e));
  expect(await readHrSearch(full({categories: ["employees", "candidates"]}))).toMatchObject({success: false});
  expect(calls.every(e => (e.calls[0][2] as {head?: boolean}).head === true)).toBe(true);
});
it("denied, disabled, forced-change and missing principals never create a data client", async () => {
  for (const ctx of [auth([]), {...auth(), profile: null}, {...auth(), isAccountActive: false}, {...auth(), profile: {...auth().profile!, must_change_password: true}}])
    expect(await readHrSearch(full(), ctx)).toMatchObject({success: false, error: "Permission denied"}); expect(m.create).not.toHaveBeenCalled();
});
it("cancellation is passed to both counts/pages and an aborted completion never returns data", async () => {
  const early = new AbortController(); early.abort(); await expect(readHrSearch(full(), auth(), early.signal)).rejects.toMatchObject({name: "AbortError"}); expect(m.create).not.toHaveBeenCalled();
  const late = new AbortController(); m.resolve.mockImplementation((e: Entry) => {late.abort(); return resolve(e);});
  await expect(readHrSearch(full({categories: ["employees"]}), auth(), late.signal)).rejects.toMatchObject({name: "AbortError"}); expect(calls[0].calls).toContainEqual(["abortSignal", late.signal]);
});
it("quick suggestions are explicit top-5/top-3, literal prefix/name matches and never full-result counts", async () => {
  tables.employees = Array.from({length: 8}, (_, i) => row(i + 1)); tables.hr_candidates = Array.from({length: 5}, (_, i) => row(i + 1)); const query = " a% ";
  const result = await readHrSearch({mode: "suggestions", query}); expect(result).toMatchObject({success: true, data: {kind: "quick-suggestions", complete: false, limit: 8}});
  if (!result.success || !("rows" in result.data)) throw Error("Wrong result"); expect(result.data.rows).toHaveLength(8); expect(result.data).not.toHaveProperty("totalCount");
  expect(calls[0].calls).toContainEqual(["range", 0, 4]); expect(calls[1].calls).toContainEqual(["range", 0, 2]);
  expect(calls[0].calls).toContainEqual(["or", `employee_code.ilike.${literalContains(query).replace(/^"%/, '"')},full_name_en.ilike.${literalContains(query)}`]);
});
it.each([{page: 0}, {pageSize: 101}, {query: "x".repeat(201)}, {categories: ["employees", "employees"]}, {dateFrom: "2026-02-30"}, {dateFrom: "2026-12-31", dateTo: "2026-01-01"}, {offset: 2}, {workSiteId: -1}])("rejects malformed read input %j", async extra => {
  expect(hrSearchReadRequestSchema.safeParse(full(extra)).success).toBe(false); expect(await readHrSearch(full(extra))).toMatchObject({success: false}); expect(m.auth).not.toHaveBeenCalled();
});
it("DTO rejects sampled totals, mismatched group sums, duplicate IDs and private fields", () => {
  const criteria = hrSearchFullCriteriaSchema.parse(full()), base = {criteria, results: [], totalCount: 0, groupCounts: {}, hasMore: false, ordering: "category-entity-id-v1", countScope: "authorized-matches"};
  expect(hrSearchPageReadSchema.safeParse(base).success).toBe(true);
  for (const change of [{totalCount: 1000, groupCounts: {employees: 1000}}, {groupCounts: {employees: 1}}, {hasMore: true}, {private: "not allowed"}]) expect(hrSearchPageReadSchema.safeParse({...base, ...change}).success).toBe(false);
});
it.each([[400, {page: 0}], [403, {}], [503, {}], [200, {}]] as const)("route has private no-store and truthful status %i", async (status, extra) => {
  if (status === 403) m.auth.mockResolvedValue(auth([])); if (status === 503) m.resolve.mockResolvedValue({data: null, count: null, error: {message: "PRIVATE"}});
  const response = await POST(new Request("http://offline.test/api/reads/hr-search", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(full(extra))}));
  expect(response.status).toBe(status); expect(response.headers.get("Cache-Control")).toContain("private, no-store"); expect(response.headers.get("Vary")).toBe("Cookie");
  expect(await response.text()).not.toContain("PRIVATE");
});
const searchActionFingerprint = (source: string) => createHash("sha256").update(source.replace(/\r\n/g, "\n")).digest("hex");
it("original search action remains unchanged modulo checkout newline encoding", () => {
  expect(searchActionFingerprint(readFileSync(new URL("../../src/server/actions/hr/search.ts", import.meta.url), "utf8"))).toBe("f456d275a9170a7f093bd3ccdad1db1f5dcff24dab5ed214ec93429f95adba13");
});
const fingerprintControl = 'const label = "Synthetic café";\nreturn label;\n';
it("source fingerprint treats equivalent LF and CRLF checkouts identically", () => {
  expect(searchActionFingerprint(fingerprintControl.replace(/\n/g, "\r\n"))).toBe(searchActionFingerprint(fingerprintControl));
});
it.each([
  ["an added trailing newline", fingerprintControl + "\n"],
  ["a removed trailing newline", fingerprintControl.slice(0, -1)],
  ["a changed space", fingerprintControl.replace(" = ", "  = ")],
  ["a changed character", fingerprintControl.replace("Synthetic", "synthetic")],
  ["a lone carriage return", fingerprintControl.replace("\n", "\r")],
  ["an added BOM", "\uFEFF" + fingerprintControl],
  ["different Unicode encoding", fingerprintControl.replace("é", "e\u0301")],
])("source fingerprint still detects %s", (_name, changed) => {
  expect(searchActionFingerprint(changed)).not.toBe(searchActionFingerprint(fingerprintControl));
});
