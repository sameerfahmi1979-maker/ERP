// @vitest-environment jsdom
// Actual parent, four real tabs, tables, portal dialogs and QueryClient. Only
// transports/router/workspace ownership are synthetic: not a native/RLS/browser test.
import React from "react";
import "../remediation/f05/setup";
import {act, cleanup, fireEvent, render, renderHook, screen, waitFor, within} from "@testing-library/react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {CandidateWorkspaceForm} from "@/features/hr/recruitment/candidate-workspace-form";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import {createWorkspaceDraftStore} from "@/lib/workspace/workspace-draft-store";
import {candidateChildPrefix, useHrCandidateChildren} from "@/hooks/use-hr-candidate-children";
import {candidateRecordIdentity} from "@/lib/reads/hr-candidate-record-schema";
import {ReadError} from "@/lib/reads/client";
import {candidateChildCriteriaSchema, type CandidateChildKind} from "@/lib/reads/hr-candidate-children-schema";
import {candidateChildFixtureReply} from "./fixtures/candidate-child-read-fixture";
import type {AuthContext} from "@/lib/rbac/check";
import type {CandidateRow} from "@/server/actions/hr/recruitment";


// F05 compact forms have no worklist criteria controls. Capture the real
// collection adapter without replacing its renderer, read hook or authority.
// Criteria-injection cases below test controller compatibility, not visible UI.
const embeddedAdapters = vi.hoisted(() => new Map<string, import("@/components/erp/table/erp-table-types").ERPTableServerRead<unknown>>());
vi.mock("@/components/erp/table/record-collection", async original => {
  const actual = await original<typeof import("@/components/erp/table/record-collection")>();
  return {...actual, RecordCollection: (props: React.ComponentProps<typeof actual.RecordCollection>) => {
    if (props.serverRead) embeddedAdapters.set(props.id, props.serverRead);
    return <actual.RecordCollection {...props} />;
  }};
});
function controller(fragment: string) {
  const found = [...embeddedAdapters].find(([id]) => id.includes(fragment))?.[1];
  if (!found) throw Error("Real embedded adapter missing: " + fragment);
  return found;
}
beforeEach(() => embeddedAdapters.clear());

const state = vi.hoisted(() => ({read: vi.fn(), legacyList: vi.fn(), prerequisites: vi.fn(), prep: vi.fn(), mutate: vi.fn(),
  dispatch: vi.fn(), toast: vi.fn(), store: null as ReturnType<typeof createWorkspaceDraftStore> | null,
  submit: null as (() => void | Promise<unknown>) | null}));
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: state.read}));
vi.mock("next/navigation", () => ({usePathname: () => "/admin/hr/recruitment/candidates/record/880100", useRouter: () => ({replace: vi.fn(), refresh: vi.fn()})}));
vi.mock("@/components/workspace/workspace-provider", () => ({useWorkspaceContext: () => ({state: {activeTabId: "child-read-owner", isHydrated: true,
  tabs: [{id: "child-read-owner", route: "/admin/hr/recruitment/candidates/record/880100"}]}, dispatch: state.dispatch})}));
vi.mock("@/components/workspace/workspace-draft-provider", () => ({useWorkspaceDraftStoreContext: () => state.store}));
vi.mock("@/hooks/use-workspace", () => ({useWorkspace: () => ({closeTab: vi.fn(), markDirty: vi.fn(), updateTabRoute: vi.fn(), isTabActive: () => true})}));
vi.mock("sonner", () => ({toast: {error: state.toast, success: state.toast, warning: state.toast}}));
vi.mock("@/server/actions/hr/recruitment", () => ({
  createCandidate: state.mutate, updateCandidate: state.mutate, getRecruitmentSalaryAccess: state.prerequisites, listJobRequisitions: state.prerequisites,
  listCandidateDocuments: state.legacyList, listCandidateInterviews: state.legacyList, listCandidateOffers: state.legacyList, listCandidateOnboardingTasks: state.legacyList,
  archiveCandidateDocument: state.mutate, linkCandidateDmsDocument: state.mutate, verifyCandidateDocument: state.mutate,
  archiveInterview: state.mutate, createInterview: state.mutate, updateInterview: state.mutate,
  archiveOffer: state.mutate, changeOfferStatus: state.mutate, createOffer: state.mutate, updateOffer: state.mutate,
  archiveOnboardingTask: state.mutate, completeOnboardingTask: state.mutate, createOnboardingTask: state.mutate, updateOnboardingTask: state.mutate,
  prepareCandidateEmployeeConversion: state.prep, convertCandidateToEmployee: state.mutate,
}));
vi.mock("@/components/erp/erp-child-dialog-form", async original => {
  const actual = await original<typeof import("@/components/erp/erp-child-dialog-form")>();
  return {...actual, ERPChildDialogForm: (props: React.ComponentProps<typeof actual.ERPChildDialogForm>) => {
    if (props.open) state.submit = props.onSubmit ?? null;
    return <actual.ERPChildDialogForm {...props}/>;
  }};
});
const permissions = ["hr.recruitment.view", "hr.recruitment.manage", "hr.payroll.view", "hr.payroll.manage", "hr.employees.create"];
const context = {profile: {id: 880106, auth_user_id: "synthetic-child-reader", must_change_password: false}, accountStatus: "active", isAccountActive: true,
  permissionCodes: permissions, roleCodes: ["hr_scoped"], roleAssignments: [{roleId: 880106, roleCode: "hr_scoped", ownerCompanyId: 880101, branchId: null, permissionCodes: permissions}]} as unknown as AuthContext;
const candidate = {full_name_ar: null, gender: null, nationality_id: null, date_of_birth: null, mobile_number: null, source: null, agency_name: null,
  referred_by_employee_id: null, current_employer: null, current_position: null, notice_period_days: null, rating: null, availability_date: null,
  created_at: "2026-10-04T00:00:00Z", updated_at: "2026-10-04T00:00:00Z", created_by: null, deleted_at: null, requisition: null, nationality: null, referred_by: null,
  id: 880100, workspace_revision: 17, candidate_code: "SYNTHETIC-880100", full_name_en: "Synthetic child reader candidate", candidate_status: "new", pipeline_stage: "new",
  requisition_id: 880109, expected_salary: 12345, email: "synthetic@example.invalid", current_location: null, notes: "Original synthetic parent notes"} as CandidateRow;
const access = {canView: true, canManage: true, canManageCandidate: true, companyId: 880101, branchId: null};
const scenarios = [
  {kind: "documents", section: "Documents", add: "Link DMS Document", field: "Notes"},
  {kind: "interviews", section: "Interviews", add: "Schedule Interview", field: "Feedback", dialog: "Edit Interview"},
  {kind: "offers", section: "Offers", add: "Create Offer", field: "Notes", dialog: "Edit Offer"},
  {kind: "onboarding", section: "Onboarding", add: "Add Task", field: "Notes", dialog: "Edit Task"},
] as const;
const editors = [scenarios[1], scenarios[2], scenarios[3]] as const;
type Scenario = typeof scenarios[number];
const clients: QueryClient[] = [];
let rowCount = 1, childFailure: ((input: ReturnType<typeof candidateChildCriteriaSchema.parse>) => unknown) | null = null;
let offerAccess = {companyId: 880101, branchId: null as number | null, canView: true, canManage: true};
function fixtureRows(kind: CandidateChildKind, candidateId: number) {
  return Array.from({length: rowCount}, (_, index) => {
    const id = 880200 + index, base = {id, candidate_id: candidateId, notes: "Complete private detail " + id};
    if (kind === "documents") return {...base, dms_document_id: id + 2000, dms_document: {document_title: "Synthetic document " + id}, document_purpose: "cv"};
    if (kind === "interviews") return {...base, interview_location: "Synthetic room " + id, feedback: "Complete feedback " + id, next_step: "Review " + id};
    if (kind === "offers") return {...base, owner_company_id: 880101, branch_id: null, offer_date: "2026-10-01", valid_until: "2026-10-31",
      designation: {id, designation_name_en: "Synthetic position " + id}, basic_salary: offerAccess.canView ? 43210 : null, gross_salary: offerAccess.canView ? 54320 : null, salaryAccess: {...offerAccess}};
    return {...base, task_title: "Synthetic task " + id};
  });
}
async function reply(route: string, input: Record<string, unknown>) {
  if (route === "hr-candidate-children") {
    const request = candidateChildCriteriaSchema.parse(input);
    if (childFailure) return await childFailure(request);
    let rows = fixtureRows(request.kind, request.candidateId);
    // A controlled synthetic transport models paging/search only. Native query
    // construction is checked independently by hr-candidate-child-read.test.ts.
    if (request.operation === "page" && request.search) rows = rows.filter(row => JSON.stringify(row).includes(request.search));
    return candidateChildFixtureReply(request, {success: true, data: rows});
  }
  if (route === "hr-candidate-summary") return {success: true, data: {candidateId: input.candidateId, interview_count: 1, offer_count: 1, document_count: 1, onboarding_task_count: 1, pending_task_count: 1}};
  if (route === "hr-candidate-record") return {success: true, data: input.kind === "salary-access"
    ? {kind: "salary-access", requisitionId: input.requisitionId, salaryAccess: access}
    : {kind: "record", candidate: {...candidate, id: input.candidateId}, salaryAccess: access}};
  throw Error("Unexpected controlled read " + route);
}
beforeEach(() => {
  vi.clearAllMocks(); state.store = createWorkspaceDraftStore(); state.submit = null; rowCount = 1; childFailure = null;
  offerAccess = {companyId: 880101, branchId: null, canView: true, canManage: true};
  state.read.mockImplementation(reply); state.legacyList.mockImplementation(() => {throw Error("Unbounded legacy list must not be called");});
  state.prerequisites.mockResolvedValue({success: true, data: {rows: [{id: 880109, requisition_code: "SYNTHETIC", requisition_title: "Synthetic job"}], totalCount: 1}});
  state.prep.mockResolvedValue({success: true, data: {candidate, latest_offer: null, already_converted: false}});
  state.mutate.mockResolvedValue({success: false, error: "Controlled synthetic mutation rejection"});
});
afterEach(() => {cleanup(); clients.splice(0).forEach(client => client.clear()); state.store = null;});
function mount(mode: "add" | "edit" = "edit") {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const tree = (id = candidate.id, authContext = context) => <QueryClientProvider client={client}><WorkspaceUiMemoryProvider>
    <CandidateWorkspaceForm candidate={mode === "edit" ? {...candidate, id} : null} mode={mode} authContext={authContext}/>
  </WorkspaceUiMemoryProvider></QueryClientProvider>;
  const view = render(tree()); return {...view, client, replace: (id: number, authContext = context) => view.rerender(tree(id, authContext))};
}
const recordId=(kind: CandidateChildKind)=>({documents:'CandidateDocumentsTab',interviews:'CandidateInterviewsTab',offers:'CandidateOffersTab',onboarding:'CandidateOnboardingTab'}[kind]);
function recordSearch(kind: CandidateChildKind,value:string){act(()=>controller(recordId(kind)).onGlobalFilterChange(value));}
async function ready() {await waitFor(() => expect((screen.getByLabelText("Expected Salary (AED)") as HTMLInputElement).disabled).toBe(false));}
function calls(kind?: CandidateChildKind, operation?: "page" | "detail") {return state.read.mock.calls.filter(([route, input]) => route === "hr-candidate-children" && (!kind || input.kind === kind) && (!operation || input.operation === operation));}
function section(s: Scenario) {fireEvent.click(screen.getAllByRole("button", {name: s.section})[0]);}
async function visit(s: Scenario) {
  section(s); await waitFor(() => expect((screen.getByRole("button", {name: s.add}) as HTMLButtonElement).disabled).toBe(false));
}
async function openEditor(s: typeof editors[number]) {
  await visit(s); fireEvent.click(screen.getByRole("button", {name: "Edit record"}));
  const dialog = await screen.findByRole("dialog", {name: s.dialog});
  await waitFor(() => expect((within(dialog).getByRole("button", {name: "Save"}) as HTMLButtonElement).disabled).toBe(false));
  return dialog;
}

it("actual parent defers four untouched child reads, then reuses each visited page", async () => {
  mount(); await ready(); expect(calls()).toHaveLength(0);
  for (const s of scenarios) {await visit(s); expect(calls(s.kind, "page")).toHaveLength(1);}
  for (const s of scenarios) await visit(s);
  expect(calls()).toHaveLength(4); expect(state.legacyList).not.toHaveBeenCalled();
});
it("an unsaved candidate never requests child collections", async () => {
  mount("add"); await ready(); for (const s of scenarios) section(s);
  expect(calls()).toHaveLength(0); expect(state.legacyList).not.toHaveBeenCalled();
});
it.each(scenarios)("$kind compact Next pages beyond the old cap and legacy criteria retain safe clear on zero", async s => {
  rowCount = 1036; mount(); await ready(); await visit(s);
  expect(await screen.findByText("Page 1 of 42")).toBeTruthy(); expect(calls(s.kind, "page")[0][1]).toMatchObject({candidateId: 880100, page: 1, pageSize: 25});
  fireEvent.click(screen.getByRole("button", {name: "Next"})); await screen.findByText("Page 2 of 42");
  expect(calls(s.kind, "page")).toHaveLength(2);
  recordSearch(s.kind,"881235");
  await waitFor(()=>expect(controller(recordId(s.kind)).totalCount).toBe(1)); expect(calls(s.kind, "page").at(-1)![1]).toMatchObject({page: 1, search: "881235"});
  recordSearch(s.kind,"NO SUCH SYNTHETIC ROW");
  await screen.findByText("No records match the current criteria."); expect(controller(recordId(s.kind)).totalCount).toBe(0); expect(screen.getByRole("button", {name: "Clear list criteria"})).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Clear list criteria"})); await screen.findByText("Page 1 of 42");
  expect(state.legacyList).not.toHaveBeenCalled(); expect(calls(s.kind, "detail")).toHaveLength(0);
});
it.each([
  {s: scenarios[0], filter: "Document Purpose", key: "document_purpose", value: "cv", sort: "Document Title", sortKey: "dms_document_document_title"},
  {s: scenarios[1], filter: "Interview Round", key: "interview_round", value: "first", sort: "Interview Round", sortKey: "interview_round"},
  {s: scenarios[2], filter: "Offer Status", key: "offer_status", value: "draft", sort: "Offer Status", sortKey: "offer_status"},
  {s: scenarios[3], filter: "Task Status", key: "task_status", value: "pending", sort: "Task Title", sortKey: "task_title"},
])("$s.kind retained controller sends approved filter/sort criteria and resets the page", async ({s, key, value, sortKey}) => {
  rowCount = 60; mount(); await ready(); await visit(s);
  fireEvent.click(screen.getByRole("button", {name: "Next"})); await screen.findByText("Page 2 of 3");
  expect(screen.queryByRole("button", {name:"Edit filters"})).toBeNull();
  act(()=>controller(recordId(s.kind)).onColumnFiltersChange([{id:key,value}]));
  await waitFor(() => expect(calls(s.kind, "page").at(-1)![1]).toMatchObject({page: 1, columnFilters: {[key]: value}}));
  act(()=>controller(recordId(s.kind)).onSortingChange([{id:sortKey,desc:false}]));
  await waitFor(() => expect(calls(s.kind, "page").at(-1)![1]).toMatchObject({page: 1, sortKey, columnFilters: {[key]: value}}));
});
it.each(scenarios.flatMap(s => ["unavailable", "malformed", "partial", "wrong-subject"].map(failure => ({s, failure}))))(
  "$s.kind never turns $failure into a verified zero", async ({s, failure}) => {
    const view = mount(); await ready(); await visit(s);
    childFailure = async input => {
      if (failure === "unavailable") throw new ReadError("Synthetic unavailable", 503);
      if (failure === "malformed") return {success: true, data: {rows: []}};
      const result = await candidateChildFixtureReply(input, {success: true, data: fixtureRows(input.kind, input.candidateId)});
      return {success: true, data: {...result.data, ...(failure === "partial" ? {totalCount: 100} : {candidateId: 880101})}};
    };
    await act(async () => {await view.client.invalidateQueries({queryKey: candidateChildPrefix(s.kind, candidate.id)});});
    await screen.findByText(/This is not an empty result/); expect(screen.queryByText("0 permitted records")).toBeNull();
    expect(screen.getByText("Records could not yet be verified. Check the read status or retry.")).toBeTruthy(); expect((screen.getByRole("button", {name: s.add}) as HTMLButtonElement).disabled).toBe(true);
    expect(state.mutate).not.toHaveBeenCalled();
  });
it.each(scenarios.flatMap(s => [401, 403].map(status => ({s, status}))))("$s.kind terminal $status retires the actual parent", async ({s, status}) => {
  const view = mount(); await ready(); await visit(s);
  childFailure = () => {throw new ReadError("Synthetic denied", status);};
  await act(async () => {await view.client.invalidateQueries({queryKey: candidateChildPrefix(s.kind, candidate.id)});});
  await screen.findByText(/Candidate information is unavailable for this session/);
  expect(screen.queryByRole("heading", {name: candidate.full_name_en})).toBeNull(); expect(state.mutate).not.toHaveBeenCalled();
});
it.each(editors)("$kind opens exactly one verified full detail and preserves its existing mutation payload", async s => {
  mount(); await ready(); const dialog = await openEditor(s);
  expect(calls(s.kind, "page")).toHaveLength(1); expect(calls(s.kind, "detail")).toHaveLength(1);
  expect(calls(s.kind, "detail")[0][1]).toEqual({operation: "detail", kind: s.kind, candidateId: candidate.id, recordId: 880200});
  const original = s.kind === "interviews" ? "Complete feedback 880200" : "Complete private detail 880200";
  expect((within(dialog).getByLabelText(s.field) as HTMLInputElement).value).toBe(original);
  fireEvent.change(within(dialog).getByLabelText(s.field), {target: {value: "Retained edited detail"}});
  fireEvent.click(within(dialog).getByRole("button", {name: "Save"})); await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
  expect(state.mutate.mock.calls[0][0]).toBe(880200); expect(state.mutate.mock.calls[0][1]).toHaveProperty(s.kind === "interviews" ? "feedback" : "notes", "Retained edited detail");
});
it.each(editors)("$kind detail503 never opens a partially-filled editor", async s => {
  const view = mount(); await ready(); await visit(s);
  childFailure = input => {if (input.operation === "detail") throw new ReadError("Synthetic detail unavailable", 503);
    return candidateChildFixtureReply(input, {success: true, data: fixtureRows(input.kind, input.candidateId)});};
  fireEvent.click(screen.getByRole("button", {name: "Edit record"})); await screen.findByText(/This is not an empty result/);
  expect(screen.queryByRole("dialog")).toBeNull(); expect(state.mutate).not.toHaveBeenCalled();
  childFailure = null; fireEvent.click(screen.getByRole("button", {name: "Retry loading"}));
  await waitFor(() => expect((screen.getByRole("button", {name: "Edit record"}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", {name: "Edit record"})); await screen.findByRole("dialog", {name: s.dialog});
  expect(view.client.getQueryCache().getAll().some(query => query.queryKey.includes("detail") && query.state.data)).toBe(true);
});
it.each(editors)("$kind observed detail503 preserves the portal draft, blocks retained callbacks and retries", async s => {
  const view = mount(); await ready(); const dialog = await openEditor(s), retained = state.submit!;
  fireEvent.change(within(dialog).getByLabelText(s.field), {target: {value: "Private unsaved child draft"}});
  childFailure = input => {if (input.operation === "detail") throw new ReadError("Synthetic detail unavailable", 503);
    return candidateChildFixtureReply(input, {success: true, data: fixtureRows(input.kind, input.candidateId)});};
  await act(async () => {await view.client.invalidateQueries({queryKey: candidateChildPrefix(s.kind, candidate.id)});});
  expect(screen.getByRole("dialog", {name: s.dialog})).toBe(dialog); expect((within(dialog).getByLabelText(s.field) as HTMLInputElement).value).toBe("Private unsaved child draft");
  expect((within(dialog).getByRole("button", {name: "Save"}) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => {await retained();}); expect(state.mutate).not.toHaveBeenCalled();
  childFailure = null; fireEvent.click(within(dialog).getByRole("button", {name: "Retry required checks"}));
  await waitFor(() => expect((within(dialog).getByRole("button", {name: "Save"}) as HTMLButtonElement).disabled).toBe(false));
  expect((within(dialog).getByLabelText(s.field) as HTMLInputElement).value).toBe("Private unsaved child draft");
});
it.each(editors.flatMap(s => [401, 403].map(status => ({s, status}))))("$s.kind detail$status retires a real open portal and its retained callback", async ({s, status}) => {
  const view = mount(); await ready(); const dialog = await openEditor(s), retained = state.submit!;
  childFailure = input => {if (input.operation === "detail") throw new ReadError("Synthetic denied detail", status);
    return candidateChildFixtureReply(input, {success: true, data: fixtureRows(input.kind, input.candidateId)});};
  await act(async () => {await view.client.invalidateQueries({queryKey: candidateChildPrefix(s.kind, candidate.id)});});
  await screen.findByText(/Candidate information is unavailable for this session/); expect(document.body.contains(dialog)).toBe(false);
  await act(async () => {await retained();}); expect(state.mutate).not.toHaveBeenCalled();
});
it("same-identity exact-offer view loss clears editor and all owned projections, not just the visible page", async () => {
  const view = mount(); await ready(); const dialog = await openEditor(scenarios[2]), retained = state.submit!;
  fireEvent.change(within(dialog).getByLabelText("Basic Salary"), {target: {value: "76543"}});
  offerAccess = {...offerAccess, canView: false, canManage: false};
  await act(async () => {await view.client.invalidateQueries({queryKey: candidateChildPrefix("offers", candidate.id), predicate: query => query.queryKey.includes("detail")});});
  await waitFor(() => expect((within(dialog).getByLabelText("Basic Salary") as HTMLInputElement).value).toBe(""));
  expect(JSON.stringify(view.client.getQueriesData({queryKey: candidateChildPrefix("offers", candidate.id)}))).not.toContain("43210");
  offerAccess = {...offerAccess, canView: true, canManage: true};
  await act(async () => {await view.client.invalidateQueries({queryKey: candidateChildPrefix("offers", candidate.id)});});
  expect((within(dialog).getByLabelText("Basic Salary") as HTMLInputElement).value).toBe("");
  await act(async () => {await retained();}); await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
  expect(state.mutate.mock.calls[0][1]).not.toHaveProperty("basic_salary");
});
it("late denied detail from candidate A cannot retire candidate B", async () => {
  const view = mount(); await ready(); await visit(scenarios[1]);
  let rejectOld!: (error: Error) => void;
  childFailure = input => input.candidateId === candidate.id && input.operation === "detail"
    ? new Promise((_resolve, reject) => {rejectOld = reject;}) : candidateChildFixtureReply(input, {success: true, data: fixtureRows(input.kind, input.candidateId)});
  fireEvent.click(screen.getByRole("button", {name: "Edit record"})); await waitFor(() => expect(rejectOld).toBeTypeOf("function"));
  view.replace(880999); await ready(); await visit(scenarios[1]);
  await act(async () => {rejectOld(new ReadError("Old subject denied", 403));});
  expect(screen.queryByText(/Candidate information is unavailable for this session/)).toBeNull();
  expect((screen.getByRole("button", {name: "Schedule Interview"}) as HTMLButtonElement).disabled).toBe(false);
  expect(state.mutate).not.toHaveBeenCalled();
});
it.each(editors)("child-only unavailable $kind retires just that editor and preserves a permitted parent draft", async s => {
  const view = mount(); await ready();
  fireEvent.click(screen.getAllByRole("button", {name: "Profile"})[0]);
  fireEvent.change(screen.getByLabelText("Internal Notes"), {target: {value: "Permitted parent draft must survive"}});
  const dialog = await openEditor(s), retained = state.submit!;
  fireEvent.change(within(dialog).getByLabelText(s.field), {target: {value: "Child private draft must retire"}});
  childFailure = input => input.operation === "detail" ? {success: true, data: {...input, availability: "unavailable"}}
    : candidateChildFixtureReply(input, {success: true, data: []});
  await act(async () => {await view.client.invalidateQueries({queryKey: candidateChildPrefix(s.kind, candidate.id)});});
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("heading", {name: candidate.full_name_en})).toBeTruthy();
  expect((screen.getByLabelText("Internal Notes") as HTMLTextAreaElement).value).toBe("Permitted parent draft must survive");
  expect(JSON.stringify(view.client.getQueriesData({queryKey: candidateChildPrefix(s.kind, candidate.id)}))).not.toContain("Complete private detail");
  await act(async () => {await retained();}); expect(state.mutate).not.toHaveBeenCalled();
});
it("a retained candidate A closeDetail cannot clear candidate B's observed editor", async () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const wrapper = ({children}: {children: React.ReactNode}) => <QueryClientProvider client={client}><WorkspaceUiMemoryProvider>{children}</WorkspaceUiMemoryProvider></QueryClientProvider>;
  const hook = renderHook(({id}) => useHrCandidateChildren("offers", id, {authContext: context}), {initialProps: {id: candidate.id}, wrapper});
  await waitFor(() => expect(hook.result.current.query.isSuccess).toBe(true));
  const oldClose = hook.result.current.closeDetail;
  hook.rerender({id: 880999}); await waitFor(() => expect(hook.result.current.query.isSuccess).toBe(true));
  await act(async () => {await hook.result.current.loadDetail(880200);});
  await waitFor(() => expect(hook.result.current.activeDetail?.candidate_id).toBe(880999));
  act(() => oldClose());
  expect(hook.result.current.activeDetail?.candidate_id).toBe(880999);
});
it("actual parent identity cleanup retires old private keys but preserves already-verified new-owner keys and drafts", async () => {
  const view = mount(); await ready();
  fireEvent.click(screen.getAllByRole("button", {name: "Profile"})[0]);
  fireEvent.change(screen.getByLabelText("Internal Notes"), {target: {value: "Preserve candidate edit across capability refresh"}});
  const dialog = await openEditor(scenarios[2]);
  fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "Preserve permitted offer edit"}});
  const next = {...context, permissionCodes: [...permissions, "hr.synthetic.extra"], roleAssignments: context.roleAssignments!.map(role => ({...role, permissionCodes: [...permissions, "hr.synthetic.extra"]}))};
  const oldIdentity = candidateRecordIdentity(context), newIdentity = candidateRecordIdentity(next);
  const prefix = candidateChildPrefix("offers", candidate.id);
  const oldQueries = view.client.getQueryCache().findAll({queryKey: [...prefix, oldIdentity]});
  const newer = oldQueries.filter(query => query.state.data).map(query => {
    const key = query.queryKey.map(part => part === oldIdentity ? newIdentity : part);
    view.client.setQueryData(key, query.state.data);
    return {key, query: view.client.getQueryCache().find({queryKey: key, exact: true})};
  });
  expect(newer).toHaveLength(2);
  await act(async () => {view.replace(candidate.id, next);});
  await waitFor(() => expect((within(dialog).getByRole("button", {name: "Save"}) as HTMLButtonElement).disabled).toBe(false));
  for (const item of newer) expect(view.client.getQueryCache().find({queryKey: item.key, exact: true})).toBe(item.query);
  expect(view.client.getQueryCache().findAll({queryKey: [...prefix, oldIdentity]})).toHaveLength(0);
  expect((screen.getByLabelText("Internal Notes") as HTMLTextAreaElement).value).toBe("Preserve candidate edit across capability refresh");
  expect((within(dialog).getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Preserve permitted offer edit");
});
