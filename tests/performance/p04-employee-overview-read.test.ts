import {afterEach, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({active: true, password: false, subject: true, authorizations: 0, denied: [] as string[], failedPermission: "", fault: "", malformed: "", duplicate: false,
  rows: {} as Record<string, Record<string, unknown>[]>, counts: {} as Record<string, number>, points: {} as Record<string, unknown>, calls: [] as {table: string; methods: unknown[][]}[], rpc: [] as unknown[][]}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => {
  state.authorizations++; return {profile: {id: 6, must_change_password: state.password}, isAccountActive: state.active, permissionCodes: ["hr.employees.view"], roleCodes: [], roleAssignments: []};
}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({rpc: (name: string, params: {permission_code: string}) => {
  state.rpc.push([name, params]);
  if(name === 'f12_salary_as_of') return Promise.resolve({data: state.points.salary ?? {asOf: new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()), currency:'USD',gross:'6000.00',activeCount:1,payrollStatus:'active'}, error: state.fault === 'salary' ? {message:'PRIVATE_NATIVE_FAILURE'} : null});
  return Promise.resolve({data: !state.denied.includes(params.permission_code), error: params.permission_code === state.failedPermission ? {message: "PRIVATE_PERMISSION_FAILURE"} : null});
}, from: (table: string) => {
  const call = {table, methods: [] as unknown[][]}; state.calls.push(call);
  const query: Record<string, unknown> = {then: (resolve: (r: unknown) => unknown) => {
    if (state.fault === table) return Promise.resolve({data: null, count: null, error: {message: "PRIVATE_NATIVE_FAILURE"}}).then(resolve);
    const selected = call.methods.find(m => m[0] === "select"), isPoint = call.methods.some(m => m[0] === "maybeSingle"), range = call.methods.find(m => m[0] === "range"), limit = call.methods.find(m => m[0] === "limit");
    const all = state.rows[table] ?? [], count = state.counts[table] ?? all.length;
    let data: unknown = all.slice(range ? Number(range[1]) : 0, range ? Number(range[2]) + 1 : limit ? Number(limit[1]) : undefined);
    if (state.duplicate && range && Number(range[1]) > 0 && table === "employee_salary_components") data = [{...all[0]}, ...all.slice(Number(range[1]) + 1, Number(range[2]) + 1)];
    if (isPoint) data = table === "employees" ? state.subject ? state.points.employment ?? {id: 7,employee_status:'active',joining_date:'2020-01-01'} : null : state.points[table] ?? null;
    if ((selected?.[2] as {head?: boolean})?.head) data = null;
    if (state.malformed === table) data = [{id: "BROKEN"}];
    return Promise.resolve({data, count, error: null}).then(resolve);
  }};
  for (const name of ["select", "eq", "is", "order", "limit", "maybeSingle", "range", "gte", "lte", "or", "not"]) query[name] = (...args: unknown[]) => {call.methods.push([name, ...args]); return query;};
  return query;
}})}));
import {readEmployeeOverview} from "@/server/reads/employee-overview";
import {POST} from "@/app/api/reads/employee-overview/route";
import {EMPLOYEE_OVERVIEW_SECTIONS} from "@/lib/reads/employee-overview-schema";
afterEach(() => {vi.useRealTimers(); Object.assign(state, {active: true, password: false, subject: true, authorizations: 0, denied: [], failedPermission: "", fault: "", malformed: "", duplicate: false, rows: {}, counts: {}, points: {}, calls: [], rpc: []});});
const read = (sections?: string[]) => readEmployeeOverview({employeeId: 7, ...(sections ? {sections} : {})});
const targets = {compliance: "employee_identity_documents", time: "employee_attendance_daily_summary", payroll: "salary", operations: "employee_assets", actions: "employee_approval_requests", recruitment: "employee_recruitment_links"};

it("composes all six native sections with exactly one live authorization and only lean projections", async () => {
  const result = await read(); expect(result.success, result.error).toBe(true); expect(state.authorizations).toBe(1);
  expect(Object.keys(result.data!.sections)).toEqual([...EMPLOYEE_OVERVIEW_SECTIONS]);
  expect(Object.values(result.data!.sections).every(s => s?.status === "ready")).toBe(true);
  expect(state.calls.flatMap(c => c.methods).filter(m => m[0] === "select").every(m => !String(m[1]).includes("*"))).toBe(true);
  expect(state.rpc.filter(r => (r[1] as {permission_code: string}).permission_code === "hr.medical.view")).toHaveLength(1);
});
it.each(EMPLOYEE_OVERVIEW_SECTIONS)("%s native error remains a failed section without hiding five successful sections", async section => {
  state.fault = targets[section]; const result = await read(); expect(result.success).toBe(true);
  expect(result.data!.sections[section]).toEqual({status: "failed"});
  expect(Object.entries(result.data!.sections).filter(([key, value]) => key !== section && value.status === "ready")).toHaveLength(5);
  expect(JSON.stringify(result)).not.toContain("PRIVATE_NATIVE_FAILURE");
});
it.each(EMPLOYEE_OVERVIEW_SECTIONS)("%s can be retried alone without reading unrelated sections", async section => {
  const result = await read([section]); expect(result.success).toBe(true); expect(Object.keys(result.data!.sections)).toEqual([section]);
  for (const other of EMPLOYEE_OVERVIEW_SECTIONS.filter(s => s !== section)) expect(state.calls.some(c => c.table === targets[other])).toBe(false);
});
it.each([0, -1, 7.2, "7", null])("invalid employee %s does not reach auth or business reads", async employeeId => {
  expect((await readEmployeeOverview({employeeId})).success).toBe(false); expect(state.authorizations).toBe(0); expect(state.calls).toHaveLength(0);
});
it("unsupported/duplicate sections and client authorization contexts are rejected", async () => {
  for (const bad of [{sections: []}, {sections: ["salary"]}, {sections: ["time", "time"]}, {context: {isAccountActive: true}}]) expect((await readEmployeeOverview({employeeId: 7, ...bad})).success).toBe(false);
  expect(state.authorizations).toBe(0);
});
it.each(["inactive", "password", "subject"])("%s gates cannot become successful empty summaries", async mode => {
  if (mode === "inactive") state.active = false; if (mode === "password") state.password = true; if (mode === "subject") state.subject = false;
  expect((await read()).error).toBe("Permission denied"); expect(state.rpc).toHaveLength(0); expect(state.calls.every(c => c.table === "employees")).toBe(true);
});
it("subject capability denial is explicit despite another role's flat capability list", async () => {
  state.denied = ["hr.payroll.view", "hr.recruitment.view"];
  const result = await read(); expect(result.data!.sections.payroll).toEqual({status: "restricted"}); expect(result.data!.sections.recruitment).toEqual({status: "restricted"});
  expect(state.calls.some(c => c.table === "employee_salary_components" || c.table === "employee_recruitment_links")).toBe(false);
});
it("failed capability lookup is a failure, never a permission grant or empty result", async () => {
  state.failedPermission = "hr.payroll.view"; const result = await read(); expect(result.data!.sections.payroll).toEqual({status: "failed"}); expect(state.calls.some(c => c.table === "employee_salary_components")).toBe(false);
});
it("medical, banking, confidential and leave restrictions do not masquerade as zero records", async () => {
  state.denied = ["hr.medical.view", "hr.banking.view", "hr.confidential.view", "hr.leave.view", "hr.leave.manage"];
  const result = await read(); expect(result.data!.sections.compliance).toMatchObject({status: "ready", data: {medicalRecords: null, medicalInsurances: null}});
  expect(result.data!.sections.payroll).toMatchObject({status: "ready", data: {wpsReadiness: null, wpsStatus: null, bankingRestricted: true}});
  expect(result.data!.sections.actions).toMatchObject({status: "ready", data: {performance_reviews: null, open_disciplinary: null}});
  expect(result.data!.sections.time).toMatchObject({status: "ready", data: {leaveBalanceCount: null, pendingLeaveCount: null}});
  for (const table of ["employee_medical_records", "employee_medical_insurances", "employee_wps_profiles", "employee_performance_records", "employee_disciplinary_records", "employee_leave_balances", "employee_leave_requests"]) expect(state.calls.some(c => c.table === table)).toBe(false);
});
it("salary overview uses one atomic dated ordinary-client fact read, not embedded undated components", async () => {
  const result = await read(["payroll"]);
  expect(result.data!.sections.payroll).toMatchObject({status:"ready",data:{grossSalary:6000,currency:"USD"}});
  expect(state.rpc.filter(r=>r[0]==="f12_salary_as_of")).toHaveLength(1);
  expect(state.calls.some(c=>c.table==="employee_salary_components")).toBe(false);
  state.fault="salary";expect((await read(["payroll"])).data!.sections.payroll).toEqual({status:"failed"});
});
it.each([{}, {asOf:"2020-01-01",currency:"USD",gross:"0.00",activeCount:1,payrollStatus:"active"},
  {asOf:"2026-10-24",currency:"",gross:"100.00",activeCount:1,payrollStatus:"active"}])("malformed or wrong-date native salary cannot become a ready overview",async salary=>{
  state.points.salary=salary;expect((await read(["payroll"])).data!.sections.payroll).toEqual({status:"failed"});
});
it("compliance preserves distinct training/identity expiry rules and complete totals", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-04T08:00:00Z"));
  const rows = [{id: 1, status: "active", expiry_date: "2026-10-04"}, {id: 2, status: "inactive", expiry_date: "2026-10-05"}, {id: 3, status: "valid", expiry_date: "2026-10-03"}, {id: 4, status: "expired", expiry_date: "2027-01-01"}];
  state.rows.employee_identity_documents = rows; state.rows.employee_training_certificates = rows;
  const result = await read(["compliance"]); expect(result.data!.sections.compliance).toMatchObject({status: "ready", data: {
    identityDocuments: {total: 4, active: 1, expiringSoon: 1, expired: 2}, trainingCertificates: {total: 4, valid: 1, expiringSoon: 1, expired: 2},
  }});
});
it("native exact counts survive the backend row cap and expose only latest readiness", async () => {
  state.counts.employee_assets = 1107; state.counts.employee_site_readiness = 1107; state.rows.employee_site_readiness = [{readiness_status: "ready", private_note: "SYNTHETIC_SECRET"}];
  const result = await read(["operations"]); expect(result.data!.sections.operations).toMatchObject({status: "ready", data: {issuedAssetCount: 1107, readinessCount: 1107, latestReadinessStatus: "ready"}});
  expect(JSON.stringify(result)).not.toContain("SYNTHETIC_SECRET");
});
it("genuine missing recruitment origin differs from failure, while related labels stay masked", async () => {
  expect((await read(["recruitment"])).data!.sections.recruitment).toEqual({status: "ready", data: null});
  state.points.employee_recruitment_links = {candidate_id: 8, converted_at: "2026-10-04T08:00:00Z", candidate: null, requisition: null, notes: "PRIVATE_NOTE"};
  const result = await read(["recruitment"]); expect(result.data!.sections.recruitment).toMatchObject({status: "ready", data: {candidate: null, requisition: null}}); expect(JSON.stringify(result)).not.toContain("PRIVATE_NOTE");
  state.fault = "employee_recruitment_links"; expect((await read(["recruitment"])).data!.sections.recruitment).toEqual({status: "failed"});
});
it("complete medical and dependent totals do not stop at the native response cap", async () => {
  state.rows.employee_medical_records = Array.from({length: 1107}, (_, i) => ({id: i + 1, result: i % 2 === 0 ? "fit" : "unfit", examination_date: i === 1106 ? "2026-10-04" : "2026-01-01"}));
  state.rows.employee_dependents = Array.from({length: 1107}, (_, i) => ({id: i + 1, is_active: i % 2 === 0}));
  state.counts.employee_document_links = 1107;
  const result = await read(["compliance"]);
  expect(result.data!.sections.compliance).toMatchObject({status: "ready", data: {medicalRecords: {total: 1107, fit: 554, lastExaminationDate: "2026-10-04"}, dependents: {total: 1107, active: 554}, dmsDocuments: {total: 1107}}});
  expect(state.calls.filter(c => c.table === "employee_medical_records")).toHaveLength(3);
  expect(state.calls.filter(c => c.table === "employee_dependents")).toHaveLength(3);
});
it("complete overtime totals and attendance counts preserve the original month predicates", async () => {
  vi.useFakeTimers(); vi.setSystemTime(new Date("2026-10-04T08:00:00Z"));
  state.rows.employee_overtime_records = Array.from({length: 1107}, (_, i) => ({id: i + 1, hours: 1.5})); state.counts.employee_attendance_daily_summary = 1107;
  const result = await read(["time"]);
  expect(result.data!.sections.time).toMatchObject({status: "ready", data: {attendanceThisMonthCount: 1107, overtimeHoursThisMonth: 1660.5}});
  expect(state.calls.filter(c => c.table === "employee_overtime_records")).toHaveLength(3);
  for (const call of state.calls.filter(c => c.table === "employee_overtime_records")) {
    expect(call.methods).toContainEqual(["eq", "approval_status", "approved"]); expect(call.methods).toContainEqual(["gte", "overtime_date", "2026-10-01"]);
  }
});
it.each(["ready", "incomplete", "on_hold", "exempt", "not_enrolled"] as const)("WPS %s retains original rules without exposing bank or identity values", async status => {
  state.rows.employee_salary_components = [
    {id: 1, amount: 6000, is_active: true, deleted_at: null, component_type: {component_kind: "earning"}},
    {id: 2, amount: 100, is_active: true, deleted_at: null, component_type: {component_kind: "deduction"}},
    {id: 3, amount: 999, is_active: false, deleted_at: null, component_type: {component_kind: "earning"}},
    {id: 4, amount: 999, is_active: true, deleted_at: "2026-01-01", component_type: {component_kind: "earning"}},
  ];
  state.points.employee_wps_profiles = status === "not_enrolled" ? null : {wps_applicable: status !== "exempt", wps_status: "active", bank_id: 1, account_number: "PRIVATE_BANK_ACCOUNT", iban: status === "incomplete" ? null : "PRIVATE_IBAN", exchange_house: null, salary_payment_method: "bank_transfer", labour_card_number: "PRIVATE_LABOUR_CARD", mohre_person_code: "PRIVATE_MOHRE"};
  if (status === "on_hold") state.counts.employee_payroll_holds = 1;
  const result = await read(["payroll"]);
  expect(result.data!.sections.payroll).toMatchObject({status: "ready", data: {grossSalary: 6000, bankingRestricted: false, wpsReadiness: {status}}});
  expect(JSON.stringify(result)).not.toContain("PRIVATE_");
});
it.each([-1, 1.5, Infinity])("invalid count %s cannot become a successful zero or partial card", async total => {
  state.counts.employee_assets = total; const result = await read(["operations"]);
  expect(result.data!.sections.operations).toEqual({status: "failed"});
});
it("overview routes are private, uncached, strictly validated and hide internal failures", async () => {
  const request = (body: unknown) => new Request("http://localhost/api/reads/employee-overview", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
  const response = await POST(request({employeeId: 7})); expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect((await POST(request({employeeId: 7, context: {}}))).status).toBe(400);
  state.fault = "employees"; const failed = await POST(request({employeeId: 7})); expect(failed.status).toBe(503); expect(await failed.text()).not.toContain("PRIVATE_NATIVE_FAILURE");
});
