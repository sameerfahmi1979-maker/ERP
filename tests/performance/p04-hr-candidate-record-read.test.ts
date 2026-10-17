import {beforeEach, expect, it, vi} from "vitest";
import {readCandidateRecord} from "@/server/reads/hr-candidate-record";
import {POST} from "@/app/api/reads/hr-candidate-record/route";
import {candidateRecordRowSchema, candidateRouteIdSchema} from "@/lib/reads/hr-candidate-record-schema";
import type {AuthContext} from "@/lib/rbac/check";
const state = vi.hoisted(() => ({context: null as unknown, candidate: null as unknown, requisition: null as unknown,
  candidateError: false, requisitionError: false, calls: [] as {table: string; steps: [string, ...unknown[]][]}[]}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => state.context}));
vi.mock("@/lib/logger", () => ({logger: {warn: vi.fn()}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({from: (table: string) => {
  const call = {table, steps: [] as [string, ...unknown[]][]}; state.calls.push(call);
  const builder: Record<string, unknown> = {then: (resolve: (result: unknown) => unknown) => Promise.resolve({
    data: table === "hr_candidates" ? state.candidate : state.requisition,
    error: (table === "hr_candidates" ? state.candidateError : state.requisitionError) ? {code: "57014", message: "PRIVATE NATIVE DETAIL"} : null,
  }).then(resolve)};
  for (const method of ["select", "eq", "is", "maybeSingle"]) builder[method] = (...args: unknown[]) => {call.steps.push([method, ...args]); return builder;};
  return builder;
}})}));
const permissions = ["hr.recruitment.view", "hr.recruitment.manage", "hr.payroll.view", "hr.payroll.manage"];
const context = {profile: {id: 8001, auth_user_id: "synthetic-candidate-reader", must_change_password: false}, accountStatus: "active", isAccountActive: true,
  permissionCodes: permissions, globalPermissionCodes: [], roleCodes: ["scoped"], roleAssignments: [{roleId: 8001, roleCode: "scoped", ownerCompanyId: 8002, branchId: 8003, permissionCodes: permissions}]} as unknown as AuthContext;
const row = {id: 8004, candidate_code: "SYNTHETIC-CAND", requisition_id: 8005, full_name_en: "Synthetic candidate", full_name_ar: null,
  gender: null, nationality_id: null, date_of_birth: null, mobile_number: null, email: null, current_location: null, source: null,
  agency_name: null, referred_by_employee_id: null, current_employer: null, current_position: null, expected_salary: 54321,
  notice_period_days: null, candidate_status: "new", pipeline_stage: "new", rating: null, availability_date: null, notes: "Synthetic private note",
  created_at: "2026-10-04T00:00:00Z", updated_at: "2026-10-04T00:00:00Z", workspace_revision: 17, created_by: null, deleted_at: null,
  requisition: {id: 8005, requisition_code: "SYNTHETIC-REQ", requisition_title: "Synthetic role"}, nationality: null, referred_by: null};
beforeEach(() => {state.context = context; state.candidate = {...row}; state.requisition = {id: 8005, owner_company_id: 8002, branch_id: 8003};
  state.candidateError = false; state.requisitionError = false; state.calls = [];});
const request = (body: unknown) => new Request("http://localhost/api/reads/hr-candidate-record", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
it("projects a complete native candidate and exact requisition scope, preserving opening revision", async () => {
  const result = await readCandidateRecord({kind: "record", candidateId: 8004});
  expect(result).toEqual({success: true, updatedAt: expect.any(Number), data: {kind: "record", candidate: row, salaryAccess: {canView: true, canManage: true, canManageCandidate: true, companyId: 8002, branchId: 8003}}});
  expect(state.calls).toHaveLength(2);
  expect(state.calls[0].table).toBe("hr_candidates"); expect(state.calls[0].steps).toContainEqual(["eq", "id", 8004]);
  expect(state.calls[0].steps).toContainEqual(["is", "deleted_at", null]); expect(state.calls[0].steps).toContainEqual(["maybeSingle"]);
  expect(state.calls[0].steps[0][1]).not.toContain("*"); expect(state.calls[0].steps[0][1]).toContain("expected_salary");
});
it("retains native null salary and never fabricates data from broad payroll permission", async () => {
  state.candidate = {...row, expected_salary: null}; const result = await readCandidateRecord({kind: "record", candidateId: 8004});
  expect(result.success && result.data.kind === "record" && result.data.candidate.expected_salary).toBe(null);
});
it.each(["other company", "other branch", "no salary grant"])("%s redacts expected salary and independently denies salary editing", async kind => {
  state.context = {...context, roleAssignments: [{...context.roleAssignments![0], ownerCompanyId: kind === "other company" ? 8012 : 8002,
    branchId: kind === "other branch" ? 8013 : 8003, permissionCodes: kind === "no salary grant" ? ["hr.recruitment.view", "hr.recruitment.manage"] : permissions}]};
  const result = await readCandidateRecord({kind: "record", candidateId: 8004});
  expect(result.success && result.data.kind === "record" && result.data.candidate.expected_salary).toBe(null);
  expect(result.success && result.data.salaryAccess.canView).toBe(false); expect(result.success && result.data.salaryAccess.canManage).toBe(false);
});
it("salary view without salary manage does not imply edit permission", async () => {
  state.context = {...context, roleAssignments: [{...context.roleAssignments![0], permissionCodes: ["hr.recruitment.view", "hr.payroll.view"]}]};
  const result = await readCandidateRecord({kind: "record", candidateId: 8004});
  expect(result.success && result.data.salaryAccess).toMatchObject({canView: true, canManage: false, canManageCandidate: false});
});
it("unassigned candidates require global salary permission rather than a company assignment", async () => {
  state.candidate = {...row, requisition_id: null, requisition: null};
  const result = await readCandidateRecord({kind: "record", candidateId: 8004});
  expect(result.success && result.data.salaryAccess).toEqual({canView: false, canManage: false, canManageCandidate: false, companyId: null, branchId: null});
  expect(state.calls).toHaveLength(1);
});
it.each([null, {...context, isAccountActive: false}, {...context, permissionCodes: [], roleAssignments: []}])("inactive/unpermitted contexts never start business reads", async deniedContext => {
  state.context = deniedContext ?? {...context, profile: null};
  expect(await readCandidateRecord({kind: "record", candidateId: 8004})).toEqual({success: false, error: "Permission denied"}); expect(state.calls).toHaveLength(0);
});
it.each([{kind: "record", candidateId: "8004"}, {kind: "record", candidateId: 0}, {kind: "record", candidateId: 8004, companyId: 1}, {kind: "salary-access", requisitionId: -1}])("invalid or client-supplied scope is 400 before native reads: %j", async params => {
  expect((await POST(request(params))).status).toBe(400); expect(state.calls).toHaveLength(0);
});
it.each(["candidate", "requisition"])("error-free missing native %s produces non-disclosing 403 without private details", async kind => {
  if (kind === "candidate") state.candidate = null; else state.requisition = null;
  const response = await POST(request({kind: "record", candidateId: 8004}));
  expect(response.status).toBe(403); expect(response.headers.get("Cache-Control")).toContain("no-store");
  expect(await response.json()).toMatchObject({success: false, error: "Permission denied"});
});
it.each(["candidate", "requisition", "malformed", "wrong subject", "wrong join", "wrong scope"])("%s failure remains unavailable 503, never an empty/denied success", async kind => {
  if (kind === "candidate") state.candidateError = true;
  if (kind === "requisition") state.requisitionError = true;
  if (kind === "malformed") state.candidate = {...row, workspace_revision: "17"};
  if (kind === "wrong subject") state.candidate = {...row, id: 8006};
  if (kind === "wrong join") state.candidate = {...row, requisition: {...row.requisition, id: 8006}};
  if (kind === "wrong scope") state.requisition = {...state.requisition as object, id: 8006};
  const response = await POST(request({kind: "record", candidateId: 8004}));
  expect(response.status).toBe(503); expect(await response.text()).not.toContain("PRIVATE NATIVE DETAIL");
});
it("salary-access read follows selected native requisition and never loads candidate PII", async () => {
  expect((await POST(request({kind: "salary-access", requisitionId: 8005}))).status).toBe(200);
  expect(state.calls.map(call => call.table)).toEqual(["hr_job_requisitions"]);
});
it("wire DTO strips unexpected native fields and validates route IDs without prefix parsing", () => {
  expect(candidateRecordRowSchema.parse({...row, unrelated_private_field: "never transfer"})).not.toHaveProperty("unrelated_private_field");
  for (const id of ["0", "-1", "8004foo", "8.5", "1e3", "9007199254740992"]) expect(candidateRouteIdSchema.safeParse(id).success).toBe(false);
  expect(candidateRouteIdSchema.parse("8004")).toBe(8004);
});
