import {afterEach, expect, it, vi} from "vitest";
const state = vi.hoisted(() => ({permissions: ["hr.recruitment.view"], active: true, password: false, authReads: 0, calls: [] as unknown[][], result: {} as unknown, queue: [] as unknown[]}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => {
  state.authReads++; return {profile: {id: 6, must_change_password: state.password}, isAccountActive: state.active, permissionCodes: state.permissions, roleCodes: [], roleAssignments: []};
}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({from: (...args: unknown[]) => {
  state.calls.push(["from", ...args]);
  let labelIds:number[]|null=null;
  const query: Record<string, unknown> = {then: (resolve: (r: unknown) => unknown) => Promise.resolve(labelIds?{data:labelIds.map(id=>({id,candidate_code:"PERF-CAND-"+id,full_name_en:"Synthetic candidate 1",full_name_ar:"مرشح اختباري"})),error:null}:state.queue.length ? state.queue.shift() : state.result).then(resolve)};
  for (const method of ["select", "is", "or", "ilike", "eq", "gte", "lt", "order", "range", "maybeSingle", "in"]) query[method] = (...values: unknown[]) => {state.calls.push([method, ...values]); if(method==="in")labelIds=values[1] as number[];return query;};
  return query;
}})}));
import {readRecruitmentInquiry, readRecruitmentRequisitionDetail} from "@/server/reads/hr-recruitment-inquiries";
import {POST as pagePost} from "@/app/api/reads/hr-recruitment-inquiries/route";
import {POST as detailPost} from "@/app/api/reads/hr-recruitment-requisition-detail/route";
import {RECRUITMENT_INQUIRY_KINDS, RECRUITMENT_INQUIRY_CONFIG, recruitmentInquiryCriteriaSchema, recruitmentInquiryRowSchemas} from "@/lib/reads/hr-recruitment-inquiries-schema";
import {recruitmentInquiryFixture as fixture} from "./hr-recruitment-inquiry-fixtures";
afterEach(() => Object.assign(state, {permissions: ["hr.recruitment.view"], active: true, password: false, authReads: 0, calls: [], result: {}, queue: []}));

it.each(RECRUITMENT_INQUIRY_KINDS)("%s has bounded lean pages with exact complete-result count", async kind => {
  state.result = {data: [fixture(kind)], count: 1101, error: null};
  const result = await readRecruitmentInquiry({kind, page: 12, pageSize: 100});
  expect(result.success, result.error).toBe(true); expect(result.data).toEqual({kind, page: 12, pageSize: 100, totalCount: 1101, rows: [recruitmentInquiryRowSchemas[kind].parse(fixture(kind))]});
  expect(state.authReads).toBe(1); expect(state.calls).toContainEqual(["range", 1100, 1199]); expect(state.calls).toContainEqual(["is", "deleted_at", null]);
  expect(state.calls.filter(c => c[0] === "select").every(c => !String(c[1]).includes("*"))).toBe(true);
  expect(JSON.stringify(result)).not.toContain("SYNTHETIC_PRIVATE"); expect(JSON.stringify(result)).not.toContain("OMIT_UNRELATED");
});
it.each(RECRUITMENT_INQUIRY_KINDS)("%s searches complete results before paging and allows only reviewed stable sorts", async kind => {
  state.result = {data: [], count: 0, error: null};
  for (const field of RECRUITMENT_INQUIRY_CONFIG[kind].fields) {
    state.calls = []; expect((await readRecruitmentInquiry({kind, search: "اختبار_%", sortKey: field.id, sortDir: "asc"})).success).toBe(true);
    const related = kind !== "candidates" && kind !== "requisitions";
    const sort = related && field.id === "candidate_name" ? "candidate(full_name_en)" : related && field.id === "candidate_code" ? "candidate(candidate_code)" : field.id;
    expect(state.calls).toContainEqual(["order", sort, {ascending: true, nullsFirst: false}]); expect(state.calls).toContainEqual(["order", "id", {ascending: true}]);
    expect(state.calls.findLastIndex(c => c[0] === "or")).toBeLessThan(state.calls.findIndex(c => c[0] === "range"));
  }
});
it.each(["interviews", "offers", "onboarding"] as const)("%s related search/filter uses protected joins, no intermediary capped ID fetch", async kind => {
  state.result = {data: [], count: 0, error: null};
  expect((await readRecruitmentInquiry({kind, search: "مرشح_%", columnFilters: {candidate_name: "مرشح", candidate_code: "PERF_%"}})).success).toBe(true);
  expect(String(state.calls.find(c => c[0] === "select")?.[1])).toContain("candidate:hr_candidates!candidate_id!inner(");
  expect(String(state.calls.find(c => c[0] === "select")?.[1])).toContain("search_candidate:hr_candidates!candidate_id(id)");
  expect(state.calls.filter(c => c[0] === "from")).toHaveLength(1);
  expect(state.calls).toContainEqual(["ilike", "candidate.candidate_code", "%PERF\\_\\%%"]);
  expect(state.calls.some(c => c[0] === "or" && (c[2] as {referencedTable?: string})?.referencedTable === "search_candidate" && String(c[1]).includes("full_name_ar"))).toBe(true);
});
it("timestamp and calendar-date filters retain their separate UTC-day semantics", async () => {
  state.result = {data: [], count: 0, error: null};
  await readRecruitmentInquiry({kind: "offers", columnFilters: {created_at: "2026-01-02", proposed_joining_date: "2026-02-01", offer_status: "draft"}});
  expect(state.calls).toContainEqual(["gte", "created_at", "2026-01-02T00:00:00Z"]); expect(state.calls).toContainEqual(["lt", "created_at", "2026-01-03T00:00:00.000Z"]);
  expect(state.calls).toContainEqual(["eq", "proposed_joining_date", "2026-02-01"]); expect(state.calls).toContainEqual(["eq", "offer_status", "draft"]);
});
it("invalid criteria and unreviewed salary filters fail before authorization/database work", async () => {
  expect(recruitmentInquiryCriteriaSchema.parse({kind: "candidates"}).pageSize).toBe(25);
  for (const bad of [{kind: "anything"}, {table: "employees"}, {context: {role: "system_admin"}}, {page: 0}, {page: 100001}, {pageSize: 101}, {search: "x".repeat(201)}, {sortKey: "basic_salary"}, {columnFilters: {created_at: "2026-02-30"}}, {columnFilters: {candidate_status: "unknown"}}, {columnFilters: {expected_salary: "10"}}]) expect((await readRecruitmentInquiry({kind: "candidates", ...bad})).success).toBe(false);
  expect((await readRecruitmentRequisitionDetail({recordId: -1})).success).toBe(false);
  expect(state.authReads).toBe(0); expect(state.calls).toHaveLength(0);
});
it.each(["no-role", "suspended", "password"])("%s cannot read pages or detail", async mode => {
  if (mode === "no-role") state.permissions = []; if (mode === "suspended") state.active = false; if (mode === "password") state.password = true;
  for (const kind of RECRUITMENT_INQUIRY_KINDS) expect((await readRecruitmentInquiry({kind})).error).toBe("Permission denied");
  expect((await readRecruitmentRequisitionDetail({recordId: 1})).error).toBe("Permission denied"); expect(state.calls).toHaveLength(0);
});
it.each(RECRUITMENT_INQUIRY_KINDS)("%s malformed, partial, duplicate or failed data cannot become an accepted empty result", async kind => {
  for (const result of [{data: [], count: null}, {data: [], count: 5}, {data: [fixture(kind), fixture(kind)], count: 2}, {data: [{id: 1}], count: 1}, {data: [], count: 0, error: {code: "57014"}}]) {state.result = result; expect((await readRecruitmentInquiry({kind})).success).toBe(false);}
  state.result = {data: [], count: 0, error: null}; expect((await readRecruitmentInquiry({kind})).data?.totalCount).toBe(0);
});
it.each(RECRUITMENT_INQUIRY_KINDS)("%s range recovery reuses exact criteria and verifies the count", async kind => {
  state.queue = [{data: null, status: 416, error: {code: "PGRST103"}}, {data: null, count: 1107, error: null}];
  const result = await readRecruitmentInquiry({kind, page: 13, pageSize: 100, search: "test_%"}); expect(result.data).toMatchObject({rows: [], totalCount: 1107});
  const selects = state.calls.filter(c => c[0] === "select"); expect(selects).toHaveLength(2); expect(selects[0][1]).toBe(selects[1][1]); expect(selects[1][2]).toEqual({head: true, count: "exact"});
});
it("range count cannot hide a failed read or incomplete page", async () => {
  for (const count of [null, -1, 1201, 1.5]) {state.queue = [{data: null, status: 416, error: {code: "PGRST103"}}, {data: null, count, error: null}]; expect((await readRecruitmentInquiry({kind: "candidates", page: 13, pageSize: 100})).success).toBe(false);}
  state.calls = []; state.result = {data: null, status: 503, error: {code: "57014"}}; expect((await readRecruitmentInquiry({kind: "candidates", page: 13})).success).toBe(false); expect(state.calls.filter(c => c[0] === "select")).toHaveLength(1);
});
it("requisition detail retains all editor wording and independently masked labels", async () => {
  state.result = {data: fixture("requisitions"), error: null};
  const result = await readRecruitmentRequisitionDetail({recordId: 1}); expect(result.success).toBe(true);
  expect(result.data).toMatchObject({job_description: "Complete original wording", requirements: "Complete requirements", notes: "SYNTHETIC_PRIVATE_NOTES", department: null, designation: null});
  expect(state.calls).toContainEqual(["eq", "id", 1]); expect(JSON.stringify(result)).not.toContain("OMIT_UNRELATED");
});
it.each([null, {id: 1}, {...fixture("requisitions"), id: 2}, {...fixture("requisitions"), workspace_revision: undefined}])("unavailable/mismatched/unversioned detail is rejected", async data => {
  state.result = {data, error: null}; expect((await readRecruitmentRequisitionDetail({recordId: 1})).success).toBe(false);
});
it("external reads stay private, correlated, bounded and opaque on failure", async () => {
  state.result = {data: null, count: null, error: {message: "PRIVATE_DATABASE_FAILURE"}};
  for (const [post, input] of [[pagePost, {kind: "candidates"}], [detailPost, {recordId: 1}]] as const) {
    const response = await post(new Request("http://localhost/api/reads/test", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(input)}));
    expect(response.status).toBe(503); expect(response.headers.get("Cache-Control")).toContain("no-store"); expect(response.headers.get("X-ERP-Correlation")).toBeTruthy(); expect(await response.text()).not.toContain("PRIVATE_DATABASE_FAILURE");
  }
});
