import {beforeEach, describe, expect, it, vi} from "vitest";
import {readCandidateChildren} from "@/server/reads/hr-candidate-children";
import {POST} from "@/app/api/reads/hr-candidate-children/route";
import {CANDIDATE_CHILD_KINDS, CANDIDATE_CHILD_CONFIG, candidateChildPageCriteriaSchema, candidateChildPageSchema, candidateChildDetailResultSchema, type CandidateChildKind} from "@/lib/reads/hr-candidate-children-schema";
import {literalContains, literalLike} from "@/lib/reads/search";
import type {AuthContext} from "@/lib/rbac/check";

type Row = Record<string, unknown>;
type Call = {table: string; steps: [string, ...unknown[]][]};
const state = vi.hoisted(() => ({context: null as unknown, subject: null as unknown, subjectError: false, rows: [] as Row[],
  childError: false, partial: false, duplicate: false, badCount: false, rangeFailure: false, headError: false,
  forcedCount: undefined as number | undefined, malformedLabel: false, hiddenLabel: false, offerLabelError: false, offerLabelPartial: false, calls: [] as Call[]}));
vi.mock("@/lib/rbac/check", async () => ({...await import("@/lib/rbac/scope"), getAuthContext: async () => state.context}));
vi.mock("@/lib/logger", () => ({logger: {warn: vi.fn()}}));
vi.mock("@/lib/supabase/admin", () => ({createAdminClient: () => {throw Error("A business read must not use admin access");}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({from: (table: string) => {
  const call: Call = {table, steps: []}; state.calls.push(call);
  const builder: Record<string, unknown> = {then: (resolve: (result: unknown) => unknown) => {
    const head = (call.steps.find(step => step[0] === "select")?.[2] as {head?: boolean} | undefined)?.head;
    if (table === "hr_candidates") return Promise.resolve({data: state.subject, error: state.subjectError ? {code: "57014", message: "PRIVATE NATIVE DETAIL"} : null}).then(resolve);
    if (table === "designations") {
      const ids = call.steps.find(step => step[0] === "in")?.[2] as number[];
      const labels = [...new Map(state.rows.filter(row => ids.includes(Number(row.designation_id)) && row.designation).map(row => [row.designation_id, row.designation])).values()];
      return Promise.resolve({data: state.offerLabelPartial ? [] : labels, count: labels.length, error: state.offerLabelError ? {message: "PRIVATE NATIVE DETAIL"} : null}).then(resolve);
    }
    let rows = [...state.rows];
    for (const [method, key, value] of call.steps) if (method === "eq" && key === "id") rows = rows.filter(row => row.id === value);
    const range = call.steps.find(step => step[0] === "range");
    if (range && state.rangeFailure) return Promise.resolve({data: null, count: null, status: 416, error: {code: "PGRST103"}}).then(resolve);
    const count = state.badCount ? null : state.forcedCount ?? rows.length;
    if (range) rows = rows.slice(Number(range[1]), Number(range[2]) + 1);
    if (state.partial) rows = rows.slice(0, -1);
    if (state.duplicate && rows.length > 1) rows[1] = rows[0];
    if (table === "perf_hr_candidate_document_reads") rows = rows.map(row => {
      const doc = row.dms_document as {id:number;document_number:string|null;document_title:string|null}|null;
      return {...row,document_visible_id:state.hiddenLabel?null:doc?.id??null,document_number:doc?.document_number??null,document_title:state.malformedLabel?undefined:doc?.document_title??null};
    });
    return Promise.resolve({data: head ? null : call.steps.some(step => step[0] === "maybeSingle") ? rows[0] ?? null : rows,
      count, error: state.childError || head && state.headError ? {code: "57014", message: "PRIVATE NATIVE DETAIL"} : null, status: 200}).then(resolve);
  }};
  for (const method of ["select", "eq", "is", "in", "maybeSingle", "order", "range", "or", "ilike", "gte", "lt"]) builder[method] = (...args: unknown[]) => {call.steps.push([method, ...args]); return builder;};
  return builder;
}})}));

const permissions = ["hr.recruitment.view", "hr.recruitment.manage", "hr.payroll.view", "hr.payroll.manage"];
const context = {profile: {id: 8101, auth_user_id: "synthetic-child-reader", must_change_password: false}, accountStatus: "active", isAccountActive: true,
  permissionCodes: permissions, globalPermissionCodes: [], roleCodes: ["scoped"], roleAssignments: [{roleId: 8101, roleCode: "scoped", ownerCompanyId: 8102, branchId: 8103, permissionCodes: permissions}]} as unknown as AuthContext;
const stamp = "2026-10-04T00:00:00Z", candidateId = 8104;
const fixture = (kind: CandidateChildKind, id = 8105): Row => {
  const common = {id, candidate_id: candidateId,workspace_revision:1, created_at: stamp, notes: "Private edit note", unrelated_private: "do not transfer"};
  switch (kind) {
    case "documents": return {...common, dms_document_id: 8106, document_purpose: "cv", verification_status: "verified", dms_document: {id: 8106, document_number: "SYNTHETIC-DMS", document_title: "Synthetic سيرة"}};
    case "interviews": return {...common,interviewer_id:null, interview_round: "first", interview_status: "scheduled", interview_datetime: stamp, interview_location: null, result: null, score: null, feedback: "Private feedback", next_step: "Synthetic next step"};
    case "offers": return {...common,terms_version:1,approved_terms_version:null,accepted_terms_version:null,housing_allowance:null,transport_allowance:null,other_allowances:null, owner_company_id: 8102, branch_id: 8103, offer_status: "draft", proposed_joining_date: null, valid_until: null,
      basic_salary: 50123, gross_salary: 60123, currency: "AED", designation_id: null, designation: null, offer_date: null};
    case "onboarding": return {...common,employee_id:null,checklist_version:1,is_required:true,completion_criteria:null,evidence_required:false,prerequisite_task_id:null,assigned_to:null,dms_document_id:null,completed_by:null,completed_at:null, task_title: "Synthetic task", task_category: null, task_status: "pending", due_date: null};
  }
};
const page = (kind: CandidateChildKind, extra: Record<string, unknown> = {}) => ({operation: "page", kind, candidateId, ...extra});
const detail = (kind: CandidateChildKind, recordId = 8105) => ({operation: "detail", kind, candidateId, recordId});
const request = (body: unknown) => new Request("http://localhost/api/reads/hr-candidate-children", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body)});
beforeEach(() => {state.context = context; state.subject = {id: candidateId}; state.subjectError = false; state.rows = [];
  state.childError = false; state.partial = false; state.duplicate = false; state.badCount = false; state.rangeFailure = false; state.headError = false; state.forcedCount = undefined;
  state.malformedLabel = false; state.hiddenLabel = false; state.offerLabelError = false; state.offerLabelPartial = false; state.calls = [];});
const tableFor = (kind: CandidateChildKind) => kind === "documents" ? "perf_hr_candidate_document_reads" : CANDIDATE_CHILD_CONFIG[kind].table;
it.each(["valid", "error", "partial", "wrong identity"])("offer designation labels are bounded and checked: %s", async failure => {
  state.rows = [{...fixture("offers"), designation_id: 8201, designation: {id: failure === "wrong identity" ? 8202 : 8201, designation_name_en: "Synthetic designation"}}];
  state.offerLabelError = failure === "error"; state.offerLabelPartial = failure === "partial";
  const result = await readCandidateChildren(page("offers")); expect(result.success).toBe(failure === "valid");
  expect(state.calls[1].steps[0][1]).not.toContain("designations("); expect(state.calls[2].steps).toContainEqual(["in", "id", [8201]]);
});

describe.each(CANDIDATE_CHILD_KINDS)("%s counted child read", kind => {
  it("verifies the candidate before bounded native reads and projects a lean page", async () => {
    state.rows = [fixture(kind)]; const result = await readCandidateChildren(page(kind));
    expect(result.success).toBe(true);
    if (!result.success || result.data.operation !== "page") throw Error("Expected page");
    expect(result.data).toMatchObject({kind, candidateId, page: 1, pageSize: 25, totalCount: 1});
    expect(result.data.rows).toHaveLength(1); expect(result.data.rows[0]).not.toHaveProperty("notes"); expect(result.data.rows[0]).not.toHaveProperty("unrelated_private");
    expect(state.calls.map(call => call.table)).toEqual(["hr_candidates", tableFor(kind)]);
    expect(state.calls[0].steps).toContainEqual(["select", "id"]); expect(state.calls[0].steps).toContainEqual(["eq", "id", candidateId]);
    expect(state.calls[1].steps).toContainEqual(["eq", "candidate_id", candidateId]); expect(state.calls[1].steps).toContainEqual(["is", "deleted_at", null]);
    expect(state.calls[1].steps).toContainEqual(["range", 0, 24]);
    expect(state.calls[1].steps).toContainEqual(["order", "id", {ascending: true}]);
    expect(state.calls[1].steps[0][1]).not.toContain("*"); expect(state.calls[1].steps[0][2]).toEqual({count: "exact", head: false});
  });
  it("authorized zero is a successful verified zero, not a denial", async () => {
    const result = await readCandidateChildren(page(kind)); expect(result.success && result.data.operation === "page" && result.data.totalCount).toBe(0);
    expect(result.success && result.data.operation === "page" && result.data.rows).toEqual([]);
  });
  it("reads later bounded pages beyond a simulated first 1,000 rows", async () => {
    state.rows = Array.from({length: 1234}, (_, index) => fixture(kind, index + 1));
    const result = await readCandidateChildren(page(kind, {page: 13, pageSize: 100}));
    expect(result.success && result.data.operation === "page" && result.data.totalCount).toBe(1234);
    expect(result.success && result.data.operation === "page" && result.data.rows.map(row => row.id)).toEqual(Array.from({length: 34}, (_, index) => index + 1201));
    expect(state.calls[1].steps).toContainEqual(["range", 1200, 1299]);
  });
  it("loads edit detail only for the requested candidate and row", async () => {
    state.rows = [fixture(kind)]; const result = await readCandidateChildren(detail(kind));
    expect(result.success).toBe(true); if (!result.success || result.data.operation !== "detail" || !("row" in result.data)) throw Error("Expected detail");
    expect(result.data.row.id).toBe(8105); expect(result.data.row).not.toHaveProperty("unrelated_private");
    expect(state.calls[1].steps).toContainEqual(["eq", "candidate_id", candidateId]); expect(state.calls[1].steps).toContainEqual(["eq", "id", 8105]);
    expect(state.calls[1].steps).toContainEqual(["maybeSingle"]); expect(state.calls[1].steps.some(step => step[0] === "range")).toBe(false);
  });
  it.each(["native error", "partial", "duplicate", "null count", "wrong candidate", "malformed"])("rejects %s without success/zero/private error", async failure => {
    state.rows = [fixture(kind), fixture(kind, 8115)];
    if (failure === "native error") state.childError = true;
    if (failure === "partial") state.partial = true;
    if (failure === "duplicate") state.duplicate = true;
    if (failure === "null count") state.badCount = true;
    if (failure === "wrong candidate") state.rows[0].candidate_id = 99;
    if (failure === "malformed") state.rows[0].id = "8105";
    const result = await POST(request(page(kind))); expect(result.status).toBe(503); expect(await result.text()).not.toContain("PRIVATE NATIVE DETAIL");
  });
  it("error-free absent child detail is unavailable rather than a partial editor", async () => {
    const response = await POST(request(detail(kind))); expect(response.status).toBe(200);
    expect((await response.json()).data).toEqual({...detail(kind), availability: "unavailable"});
    expect(state.calls.map(call => call.table)).toEqual(["hr_candidates", tableFor(kind)]);
  });
});

it.each([null, {id: 99}, {id: "8104"}])("subject absence/mismatch is handled before child access: %j", async subject => {
  state.subject = subject; const result = await POST(request(page("documents")));
  expect(result.status).toBe(subject === null ? 403 : 503); expect(state.calls).toHaveLength(1);
});
it("subject transport failure is unavailable and does not query children", async () => {
  state.subjectError = true; expect((await POST(request(page("documents")))).status).toBe(503); expect(state.calls).toHaveLength(1);
});
it.each([{...context, profile: null}, {...context, isAccountActive: false}, {...context, permissionCodes: [], roleAssignments: []}])("denied principal never queries business data", async actor => {
  state.context = actor; expect((await POST(request(page("documents")))).status).toBe(403); expect(state.calls).toHaveLength(0);
});
it.each([{candidateId: 0}, {candidateId: "8104"}, {candidateId: 2 ** 53}, {page: 0}, {pageSize: 101}, {pageSize: 1.5}, {table: "user_profiles"}, {ownerCompanyId: 1}, {kind: "users"}, {sortKey: "notes"}, {search: "a".repeat(201)}, {columnFilters: {deleted_at: "true"}}, {columnFilters: {document_purpose: "invalid"}}])("invalid criteria rejected before auth data: %j", async input => {
  expect((await POST(request(page("documents", input)))).status).toBe(400); expect(state.calls).toHaveLength(0);
});
it("validates impossible date filters", () => {
  expect(candidateChildPageCriteriaSchema.safeParse(page("offers", {columnFilters: {valid_until: "2026-02-30"}})).success).toBe(false);
});
it("preserves private no-store/cookie response and safe correlation", async () => {
  const response = await POST(request(page("documents")));
  expect(response.status).toBe(200); expect(response.headers.get("Cache-Control")).toBe("private, no-store, max-age=0");
  expect(response.headers.get("Vary")).toBe("Cookie"); expect(response.headers.get("X-ERP-Correlation")).toMatch(/^[a-f0-9-]{36}$/);
});
it("Document invoker projection preserves nullable protected labels without per-row joins", async () => {
  state.rows = [{...fixture("documents"), dms_document: null}]; const result = await readCandidateChildren(page("documents"));
  expect(result.success).toBe(true); const selection = String(state.calls[1].steps[0][1]);
  expect(selection).toContain("document_visible_id,document_number,document_title"); expect(selection).not.toContain("storage");
  expect(state.calls[1].steps[0][1]).not.toContain("dms_documents");
  expect(state.calls).toHaveLength(2);
  expect(result.success && result.data.operation === "page" && "dms_document" in result.data.rows[0] && result.data.rows[0].dms_document).toBe(null);
});
it.each(["error", "malformed", "hidden metadata"])("document label %s never becomes a successful incomplete page", async failure => {
  state.rows = [fixture("documents")]; state.childError = failure === "error"; state.malformedLabel = failure === "malformed"; state.hiddenLabel = failure === "hidden metadata";
  const response = await POST(request(page("documents"))); expect(response.status).toBe(503); expect(await response.text()).not.toContain("PRIVATE NATIVE DETAIL");
});
it("document metadata transfer is bounded to the requested native page", async () => {
  state.rows = Array.from({length: 1107}, (_, index) => ({...fixture("documents", index + 1), dms_document_id: index + 12000, dms_document: {id: index + 12000, document_number: "SYNTHETIC", document_title: "Title"}}));
  const result = await readCandidateChildren(page("documents", {page: 12, pageSize: 100})); expect(result.success).toBe(true);
  expect(state.calls[1].steps).toContainEqual(["range",1100,1199]);expect(state.calls).toHaveLength(2);
  expect(result.success && result.data.operation === "page" && result.data.rows.length).toBe(7);
});
it("rejects mismatched Document related identity", async () => {
  state.rows = [{...fixture("documents"), dms_document: {id: 99, document_number: "No", document_title: "Wrong"}}];
  expect((await POST(request(page("documents")))).status).toBe(503);
});
it("searches all authorized Document titles OR purpose before range, preserving literal Arabic/wildcards", async () => {
  const search = 'سيرة_%"'; await readCandidateChildren(page("documents", {search, columnFilters: {dms_document_document_title: "ملف"}, sortKey: "dms_document_document_title", sortDir: "asc"}));
  const call = state.calls[1]; expect(call.table).toBe("perf_hr_candidate_document_reads");expect(call.steps[0][1]).not.toContain("!");
  expect(call.steps).toContainEqual(["or", `document_purpose.ilike.${literalContains(search)},document_title.ilike.${literalContains(search)}`]);
  expect(call.steps).toContainEqual(["ilike", "document_title", literalLike("ملف")]);
  expect(call.steps).toContainEqual(["order", "document_title", {ascending: true, nullsFirst: false}]);
});
it("timestamp date criteria use explicit UTC day bounds, not invalid ilike casts", async () => {
  await readCandidateChildren(page("interviews", {search: "2026-10-04", columnFilters: {interview_datetime: "2026-10-04"}}));
  expect(state.calls[1].steps).toContainEqual(["gte", "interview_datetime", "2026-10-04T00:00:00Z"]);
  expect(state.calls[1].steps).toContainEqual(["lt", "interview_datetime", "2026-10-05T00:00:00.000Z"]);
  expect(state.calls[1].steps).toContainEqual(["order", "interview_datetime", {ascending: false, nullsFirst: true}]);
});
it.each(["offers", "onboarding"] as const)("%s statuses and real dates filter native full result", async kind => {
  const filters = kind === "offers" ? {offer_status: "accepted", valid_until: "2026-10-04"} : {task_status: "completed", due_date: "2026-10-04"};
  await readCandidateChildren(page(kind, {columnFilters: filters}));
  for (const [key, value] of Object.entries(filters)) expect(state.calls[1].steps).toContainEqual(["eq", key, value]);
});
it.each(["other company", "other branch", "no payroll", "view only", "view and manage"])("Offer detail uses its own exact salary scope: %s", async scenario => {
  state.rows = [fixture("offers")];
  state.context = {...context, roleAssignments: [{...context.roleAssignments![0], ownerCompanyId: scenario === "other company" ? 9991 : 8102,
    branchId: scenario === "other branch" ? 9992 : 8103,
    permissionCodes: scenario === "no payroll" ? ["hr.recruitment.view"] : scenario === "view only" ? ["hr.recruitment.view", "hr.payroll.view"] : permissions}]};
  const result = await readCandidateChildren(detail("offers")); expect(result.success).toBe(true);
  if (!result.success || result.data.operation !== "detail" || !("row" in result.data) || !("salaryAccess" in result.data.row)) throw Error("Expected offer detail");
  const allowed = scenario === "view only" || scenario === "view and manage";
  expect(result.data.row.basic_salary).toBe(allowed ? 50123 : null); expect(result.data.row.gross_salary).toBe(allowed ? 60123 : null);
  expect(result.data.row.salaryAccess).toEqual({companyId: 8102, branchId: 8103, canView: allowed, canManage: scenario === "view and manage"});
});
it("native null salary remains null even when client scope permits it", async () => {
  state.rows = [{...fixture("offers"), basic_salary: null, gross_salary: null}]; const result = await readCandidateChildren(detail("offers"));
  expect(result.success && result.data.operation === "detail" && "row" in result.data && "salaryAccess" in result.data.row && result.data.row.basic_salary).toBe(null);
});
it("global salary scope is required for a native unscoped offer", async () => {
  state.rows = [{...fixture("offers"), owner_company_id: null, branch_id: null}];
  const result = await readCandidateChildren(page("offers")); expect(result.success && result.data.operation === "page" && "salaryAccess" in result.data.rows[0] && result.data.rows[0].salaryAccess.canView).toBe(false);
});
it.each([{row: fixture("offers")}, {reason: "exists but hidden"}, {availability: "denied"}, {recordId: 0}])("unavailable child DTO cannot carry private/existence hints or malformed identity: %j", extra => {
  expect(candidateChildDetailResultSchema.safeParse({...detail("offers"), availability: "unavailable", ...extra}).success).toBe(false);
});
it("a checked count can reconcile a now-out-of-range page without pretending a failure was zero", async () => {
  state.rangeFailure = true; state.forcedCount = 123;
  const result = await readCandidateChildren(page("onboarding", {page: 3, pageSize: 100}));
  expect(result.success && result.data.operation === "page" && result.data.totalCount).toBe(123);
  expect(result.success && result.data.operation === "page" && result.data.rows).toEqual([]);
  expect(state.calls).toHaveLength(3); expect(state.calls[2].steps[0][2]).toEqual({count: "exact", head: true});
});
it.each(["head error", "null count", "inconsistent count"])("range recovery rejects %s", async failure => {
  state.rangeFailure = true; state.headError = failure === "head error"; state.badCount = failure === "null count"; state.forcedCount = failure === "inconsistent count" ? 250 : 123;
  expect((await POST(request(page("onboarding", {page: 3, pageSize: 100})))).status).toBe(503);
});
it("the wire contract rejects capability masking or subject mismatches independently", () => {
  const envelope = {operation: "page", kind: "offers", candidateId, page: 1, pageSize: 25, totalCount: 1,
    rows: [{...fixture("offers"), salaryAccess: {companyId: 8102, branchId: 8103, canView: false, canManage: false}}]};
  expect(candidateChildPageSchema.safeParse(envelope).success).toBe(false);
  expect(candidateChildPageSchema.safeParse({...envelope, rows: [{...envelope.rows[0], basic_salary: null}]}).success).toBe(true);
});
