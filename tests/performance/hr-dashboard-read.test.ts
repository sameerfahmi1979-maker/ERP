import {afterEach, beforeEach, expect, it, vi} from "vitest";
import type {AuthContext} from "@/lib/rbac/check";
type Call = {table: string; methods: unknown[][]};
const state = vi.hoisted(() => ({authorizations: 0, clients: 0, context: {} as AuthContext, calls: [] as Call[], rows: {} as Record<string, Record<string, unknown>[]>, fault: "", malformed: "", countOverride: undefined as number | null | undefined, cap: false, duplicate: false}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => {state.authorizations++; return state.context;}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => {
  state.clients++;
  return {from: (table: string) => {
    const call: Call = {table, methods: []}; state.calls.push(call);
    const builder: Record<string, unknown> = {then: (resolve: (data: unknown) => unknown) => {
      if (state.fault === table) return Promise.resolve({data: null, count: null, error: {message: "SYNTHETIC_PRIVATE_FAILURE"}}).then(resolve);
      let rows = [...(state.rows[table] ?? [])];
      for (const [method, key, value] of call.methods) {
        const k = String(key);
        if (method === "eq") rows = rows.filter(r => r[k] === value);
        if (method === "is") rows = rows.filter(r => (r[k] ?? null) === value);
        if (method === "neq") rows = rows.filter(r => r[k] != null && r[k] !== value);
        if (method === "in") rows = rows.filter(r => (value as unknown[]).includes(r[k]));
        if (["lt", "lte", "gte"].includes(String(method))) rows = rows.filter(r => r[k] != null && (method === "lt" ? String(r[k]) < String(value) : method === "lte" ? String(r[k]) <= String(value) : String(r[k]) >= String(value)));
        if (method === "not" && value === "is") rows = rows.filter(r => r[k] != null);
        if (method === "or" && String(key).startsWith("effective_to")) rows = rows.filter(r => r.effective_to == null || String(r.effective_to) >= "2026-10-04");
        if (method === "or" && String(key).startsWith("iban")) rows = rows.filter(r => r.iban == null || r.iban === "");
      }
      const orders = call.methods.filter(m => m[0] === "order").map(m => String(m[1]));
      rows.sort((a, b) => {for (const key of orders) {const compare = typeof a[key] === "number" ? Number(a[key]) - Number(b[key]) : String(a[key] ?? "").localeCompare(String(b[key] ?? "")); if (compare) return compare;} return 0;});
      const count = state.countOverride !== undefined && table === "employees" ? state.countOverride : rows.length;
      const range = call.methods.find(m => m[0] === "range");
      if (range) rows = rows.slice(Number(range[1]), Number(range[2]) + 1);
      if (state.cap && table === "employees") rows = rows.slice(0, 20);
      if (state.duplicate && table === "employees" && Number(range?.[1]) > 0) rows[0] = {...state.rows.employees[0]};
      if (state.malformed === table) rows = [{id: "bad"}];
      const head = (call.methods.find(m => m[0] === "select")?.[2] as {head?: boolean})?.head;
      return Promise.resolve({data: head ? null : rows, count, error: null}).then(resolve);
    }};
    for (const method of ["select", "eq", "is", "neq", "in", "not", "or", "lt", "lte", "gte", "order", "range"]) builder[method] = (...args: unknown[]) => {call.methods.push([method, ...args]); return builder;};
    return builder;
  }};
}}));
import {readHrDashboard} from "@/server/reads/hr-dashboard";
import {POST} from "@/app/api/reads/hr-dashboard/route";
import {hrDashboardSchema, hrDashboardCriteriaSchema} from "@/lib/reads/hr-dashboard-schema";
const allCodes = ["dashboard", "employees", "compliance", "medical", "attendance", "leave", "payroll", "banking", "assignments", "actions", "confidential", "eos", "recruitment"].map(c => `hr.${c}.view`);
function employee(id: number, more: Record<string, unknown> = {}) {return {id, employee_status: "active", joining_date: "2026-10-01", employee_category_id: 1, owner_company_id: 1, branch_id: 1, employee_code: `SYN-${id}`, full_name_en: `Synthetic ${id}`, deleted_at: null, ...more};}
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-04T08:00:00Z"));
  state.context = {profile: {id: 1, auth_user_id: "synthetic", must_change_password: false} as AuthContext["profile"], email: null, roleCodes: [], permissionCodes: allCodes,
    globalPermissionCodes: allCodes, roleAssignments: [{roleId: 1, roleCode: "synthetic", ownerCompanyId: null, branchId: null, permissionCodes: allCodes}], accountStatus: "active", isAccountActive: true};
  state.rows = {employees: [employee(1)], hr_employee_categories: [{id: 1, name_en: "Synthetic category"}]};
});
afterEach(() => {vi.useRealTimers(); Object.assign(state, {authorizations: 0, clients: 0, calls: [], rows: {}, fault: "", malformed: "", countOverride: undefined, cap: false, duplicate: false});});
const read = (filters: Record<string, unknown> = {}) => readHrDashboard(filters);
it("composes one authorized request/client, shares scope/counts and exposes only the validated DTO", async () => {
  const result = await read(); expect(result.success, result.error).toBe(true); expect(hrDashboardSchema.safeParse(result.data).success).toBe(true);
  expect(state.authorizations).toBe(1); expect(state.clients).toBe(1); expect(state.calls.filter(c => c.table === "employees")).toHaveLength(1);
  expect(result.data?.summary.employee_active).toEqual({status: "ready", value: 1});
  expect(state.calls.filter(c => c.table === "hr_candidates")).toHaveLength(1);
  expect(state.calls.filter(c => c.table === "employee_attendance_daily_summary" && c.methods.some(m => m[0] === "eq" && m[1] === "approval_status"))).toHaveLength(1);
  expect(state.calls.flatMap(c => c.methods).filter(m => m[0] === "select").every(m => !String(m[1]).includes("*"))).toBe(true);
  expect(JSON.stringify(result)).not.toContain("Synthetic 1");
});
it("preserves employee/date/category distinctions, including active+probation only in top summary", async () => {
  state.rows.employees = [employee(1), employee(2, {employee_status: "probation", employee_category_id: 9}), employee(3, {employee_status: "on_leave", joining_date: "2026-09-30"}), employee(4, {employee_status: "resigned"})];
  const result = await read(); expect(result.data?.employee.active).toEqual({status: "ready", value: 1}); expect(result.data?.employee.terminated_archived).toEqual({status: "ready", value: 1});
  const legacyMonthStart = new Date(2026, 9, 1).toISOString().slice(0, 10);
  expect(result.data?.employee.new_joiners_this_month).toEqual({status: "ready", value: legacyMonthStart === "2026-09-30" ? 4 : 3}); expect(result.data?.summary.employee_active).toEqual({status: "ready", value: 2});
  expect(result.data?.headcount).toMatchObject({status: "ready", total: 2, items: [{categoryId: 1, count: 1}, {categoryId: 9, categoryName: "Category unavailable", count: 1}]});
});
it("covers more than the provider cap with stable bounded employee pages and bounded ID predicates", async () => {
  state.rows.employees = Array.from({length: 1107}, (_, i) => employee(i + 1));
  const result = await read(); expect(result.data?.employee.total).toEqual({status: "ready", value: 1107});
  expect(state.calls.filter(c => c.table === "employees").map(c => c.methods.find(m => m[0] === "range"))).toEqual([["range", 0, 499], ["range", 500, 999], ["range", 1000, 1499]]);
  expect(state.calls.flatMap(c => c.methods).filter(m => m[0] === "in" && m[1] === "employee_id").every(m => (m[2] as unknown[]).length <= 200)).toBe(true);
});
it.each(["cap", "duplicate", "malformed", "fault"])("%s in the shared subject read cannot return successful zeros", async mode => {
  state.rows.employees = Array.from({length: 601}, (_, i) => employee(i + 1));
  if (mode === "cap") state.cap = true; if (mode === "duplicate") state.duplicate = true; if (mode === "malformed") state.malformed = "employees"; if (mode === "fault") state.fault = "employees";
  const result = await read(); expect(result.success).toBe(false); expect(result.data).toBeUndefined(); expect(JSON.stringify(result)).not.toContain("PRIVATE");
});
it.each([null, -1, 1.5, 50001])("subject count %s is rejected before a misleading complete total", async count => {
  state.countOverride = count; expect((await read()).success).toBe(false);
});
it("empty authorized employees produce genuine zeros, while undefined medical and unenrolled WPS remain unknown", async () => {
  state.rows.employees = []; const result = await read(); expect(result.data?.employee.total).toEqual({status: "ready", value: 0});
  expect(result.data?.compliance.expired_documents).toEqual({status: "ready", value: 0}); expect(result.data?.compliance.medical_expired).toEqual({status: "unavailable", reason: "definition"});
  expect(result.data?.summary.wps_ready_pct).toEqual({status: "unavailable", reason: "no-data"});
  expect(state.calls.some(c => c.table === "employee_medical_records")).toBe(false);
});
it("module errors remain failed metrics and failed attention sources, without poisoning unrelated confirmed counts", async () => {
  state.fault = "employee_identity_documents"; const result = await read(); expect(result.success).toBe(true);
  expect(result.data?.compliance.expired_documents).toEqual({status: "failed"}); expect(result.data?.summary.compliance_issues).toEqual({status: "failed"});
  expect(result.data?.attention.failedSources).toEqual(["compliance"]); expect(result.data?.employee.total).toEqual({status: "ready", value: 1});
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
});
it("expired/soon document endpoints include today once and preserve custom threshold", async () => {
  state.rows.employee_identity_documents = ["2026-10-03", "2026-10-04", "2026-10-09", "2026-10-10"].map((expiry_date, i) => ({id: i + 1, employee_id: 1, expiry_date, verification_status: "pending", document_type: null}));
  const result = await read({expiryThresholdDays: 5}); expect(result.data?.compliance.expired_documents).toEqual({status: "ready", value: 1});
  expect(result.data?.compliance.expiring_soon).toEqual({status: "ready", value: 2}); expect(result.data?.summary.compliance_issues).toEqual({status: "ready", value: 3});
  expect(result.data?.attention.items).toHaveLength(3);
});
it("medical/banking/confidential/EOS restrictions do not become zero or query their protected content", async () => {
  state.context.permissionCodes = allCodes.filter(c => !["hr.medical.view", "hr.banking.view", "hr.confidential.view", "hr.eos.view"].includes(c));
  const result = await read(); expect(result.data?.payroll.wps_ready).toEqual({status: "restricted"}); expect(result.data?.payroll.wps_incomplete).toEqual({status: "restricted"});
  expect(result.data?.actions.open_disciplinary).toEqual({status: "restricted"}); expect(result.data?.actions.open_eos_cases).toEqual({status: "restricted"});
  for (const table of ["employee_wps_profiles", "employee_medical_records", "employee_disciplinary_records", "employee_eos_cases", "employee_clearance_items"]) expect(state.calls.some(c => c.table === table)).toBe(false);
});
it("combined roles from different company/branch scopes cannot turn masked bank rows into WPS readiness or incomplete totals", async () => {
  state.context.globalPermissionCodes = [];
  state.context.roleAssignments = [{roleId: 1, roleCode: "payroll", ownerCompanyId: 1, branchId: null, permissionCodes: ["hr.payroll.view"]}, {roleId: 2, roleCode: "banking", ownerCompanyId: 2, branchId: null, permissionCodes: ["hr.banking.view"]}];
  const result = await read(); expect(result.data?.payroll.wps_ready).toEqual({status: "unavailable", reason: "scope"}); expect(state.calls.some(c => c.table === "employee_wps_profiles")).toBe(false);
  state.context.roleAssignments[1].ownerCompanyId = 1; state.context.roleAssignments[1].branchId = 2;
  expect((await read()).data?.summary.wps_ready_pct).toEqual({status: "unavailable", reason: "scope"});
});
it("bank-authorized WPS retains legacy bank-and-IBAN definition without fetching financial values", async () => {
  state.rows.employee_wps_profiles = [{id: 1, employee_id: 1, iban: "SYNTHETIC_PRIVATE_IBAN", bank_id: 1}, {id: 2, employee_id: 1, iban: "", bank_id: 1}, {id: 3, employee_id: 1, iban: "X", bank_id: null}];
  const result = await read(); expect(result.data?.payroll.wps_ready).toEqual({status: "ready", value: 1}); expect(result.data?.payroll.wps_incomplete).toEqual({status: "ready", value: 2});
  expect(result.data?.payroll.missing_iban_bank).toEqual({status: "ready", value: 1}); expect(result.data?.summary.wps_ready_pct).toEqual({status: "ready", value: 33});
  expect(state.calls.filter(c => c.table === "employee_wps_profiles").every(c => c.methods.some(m => m[0] === "select" && m[1] === "id" && (m[2] as {head: boolean}).head))).toBe(true);
  expect(JSON.stringify(result)).not.toContain("PRIVATE");
});
it("filters the shared subjects while retaining all-permitted category/recruitment/clearance scope", async () => {
  state.rows.employees = [employee(1, {department_id: 4}), employee(2, {department_id: 9})];
  const result = await read({departmentId: 4}); expect(result.data?.employee.total).toEqual({status: "ready", value: 1}); expect(result.data?.headcount).toMatchObject({status: "ready", total: 2});
  for (const call of state.calls.filter(c => ["hr_candidates", "employee_clearance_items"].includes(c.table))) expect(call.methods.some(m => m[1] === "employee_id" || m[1] === "department_id")).toBe(false);
});
it("complete distinct blocked employees are not block row totals and canonical current-block predicates are retained", async () => {
  state.rows.employee_operational_blocks = Array.from({length: 1107}, (_, i) => ({id: i + 1, employee_id: 1, block_status: "active", effective_from: "2026-10-01", effective_to: null}));
  const result = await read(); expect(result.data?.operations.blocked_employees).toEqual({status: "ready", value: 1}); expect(result.data?.operations.active_blocks).toEqual({status: "ready", value: 1107});
  expect(state.calls.filter(c => c.table === "employee_operational_blocks" && c.methods.some(m => m[0] === "range" && Number(m[1]) > 0))).toHaveLength(2);
  expect(result.data?.attention.limited).toBe(true); expect(result.data?.attention.items).toHaveLength(10);
});
it("attention uses unique row IDs, keeps oldest approvals across ID batches, and reports priority truncation", async () => {
  state.rows.employees = Array.from({length: 201}, (_, i) => employee(i + 1));
  state.rows.employee_approval_requests = Array.from({length: 15}, (_, i) => ({id: i + 1, employee_id: i < 10 ? 1 : 201, created_at: i < 10 ? "2026-10-03" : "2026-10-01", approval_type: "Synthetic", request_status: "pending"}));
  const result = await read(); const alerts = result.data!.attention.items;
  expect(alerts).toHaveLength(10); expect(new Set(alerts.map(r => r.id)).size).toBe(10);
  expect([11, 12, 13, 14, 15].every(id => alerts.some(a => a.id === `action-approval-${id}`))).toBe(true); expect(result.data?.attention.limited).toBe(true);
});
it("protected recruitment labels may be null without fabricating empty or private display values", async () => {
  state.rows.hr_offers = [{id: 1, candidate_id: 9, valid_until: "2026-10-08", offer_status: "sent", candidate: null}];
  expect((await read()).data?.attention.items).toMatchObject([{description: "Candidate unavailable", candidateId: 9}]);
});
it("overdue employee-linked onboarding with no candidate remains an attention item without an invalid candidate link", async () => {
  state.rows.hr_onboarding_tasks = [{id: 1, candidate_id: null, task_title: "Synthetic task", due_date: "2026-10-03", task_status: "pending", candidate: null}];
  const result = await read(); expect(result.data?.attention.failedSources).toEqual([]);
  expect(result.data?.attention.items).toMatchObject([{title: "Overdue onboarding: Synthetic task", linkHref: "/admin/hr/recruitment/onboarding", linkLabel: "View Onboarding"}]);
  expect(result.data?.recruitment.onboarding_tasks_pending).toEqual({status: "ready", value: 1});
});
it.each([{ownerCompanyId: 0}, {branchId: "1"}, {expiryThresholdDays: -1}, {expiryThresholdDays: 3661}, {context: {isAccountActive: true}}])("invalid parameters %j fail before authorization or native reads", async filters => {
  expect((await read(filters)).success).toBe(false); expect(state.authorizations).toBe(0); expect(state.calls).toHaveLength(0);
});
it.each(["inactive", "password", "permission"])("%s gate cannot return data", async mode => {
  if (mode === "inactive") state.context.isAccountActive = false;
  if (mode === "password") state.context.profile!.must_change_password = true;
  if (mode === "permission") state.context.permissionCodes = [];
  expect((await read()).error).toBe("Permission denied"); expect(state.calls).toHaveLength(0);
});
it("SSR can reuse the same already-validated request context without resolving auth twice", async () => {
  expect((await readHrDashboard({}, state.context)).success).toBe(true); expect(state.authorizations).toBe(0); expect(state.clients).toBe(1);
});
it("route validates input and uses private/no-store headers, with generic errors", async () => {
  const request = (body: unknown) => new Request("http://localhost/api/reads/hr-dashboard", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
  const ok = await POST(request({})); expect(ok.status).toBe(200); expect(ok.headers.get("cache-control")).toContain("private, no-store"); expect(ok.headers.get("vary")).toBe("Cookie");
  expect((await POST(request({context: state.context}))).status).toBe(400);
  state.fault = "employees"; const unavailable = await POST(request({})); expect(unavailable.status).toBe(503); expect(await unavailable.text()).not.toContain("PRIVATE");
  state.context.isAccountActive = false; expect((await POST(request({}))).status).toBe(403);
});
it("strict response schema rejects missing statuses, extra private values, and wrong headcount totals", () => {
  expect(hrDashboardCriteriaSchema.parse({})).toEqual({expiryThresholdDays: 60});
  expect(hrDashboardSchema.safeParse({employee: {total: 0}}).success).toBe(false);
});
