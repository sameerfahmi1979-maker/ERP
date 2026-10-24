// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import {WorkspaceDraftProvider} from "@/components/workspace/workspace-draft-provider";
import {RequisitionsPageClient} from "@/features/hr/recruitment/requisitions-page-client";
import {CandidateOverviewTab} from "@/features/hr/recruitment/tabs/candidate-overview-tab";
import {ReadError} from "@/lib/reads/client";
import {recruitmentReadIdentity, recruitmentInquiryRowSchemas} from "@/lib/reads/hr-recruitment-inquiries-schema";
import {recruitmentInquiryFixture as fixture} from "./hr-recruitment-inquiry-fixtures";
import {POST} from "@/app/api/reads/hr-candidate-summary/route";
import type {AuthContext} from "@/lib/rbac/check";
import type {CandidateRow} from "@/server/actions/hr/recruitment";

// Actual read route, hooks, screens, dialogs and QueryClient; controlled transport,
// native builder and mutation boundaries only. This is not native-RLS acceptance.
const state = vi.hoisted(() => ({read: vi.fn(), mutate: vi.fn(), error: vi.fn(), success: vi.fn(), context: null as unknown,
  visible: true, nativeFailure: false, permission: true, rowId: null as number | null, nativeCalls: 0}));
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: state.read}));
vi.mock("@/lib/rbac/check", () => ({getAuthContext: async () => state.context, hasPermission: () => state.permission}));
vi.mock("@/lib/logger", () => ({logger: {warn: vi.fn(), error: vi.fn(), info: vi.fn()}}));
vi.mock("@/lib/supabase/server", () => ({createClient: async () => ({from: (table: string) => {
  state.nativeCalls++;
  let subjectId: unknown = 100, pending = false;
  const q: Record<string, unknown> = {then: (resolve: (v: unknown) => unknown) => Promise.resolve(
    table === "hr_candidates" ? {data: state.visible ? {id: state.rowId ?? subjectId} : null, error: state.nativeFailure ? {code: "57014"} : null}
      : {data: null, error: null, count: table === "hr_onboarding_tasks" ? (pending ? 11 : 1107) : 1003}
  ).then(resolve)};
  for (const method of ["select", "is", "eq", "in", "gte", "maybeSingle"]) q[method] = (...args: unknown[]) => {
    if (method === "eq" && args[0] === "id") subjectId = args[1];
    if (method === "in") pending = true;
    return q;
  };
  return q;
}})}));
vi.mock("@/server/actions/hr/recruitment", () => ({
  createJobRequisition: state.mutate, updateJobRequisition: state.mutate, archiveJobRequisition: state.mutate,
}));
vi.mock("sonner", () => ({toast: {success: state.success, error: state.error}}));
vi.mock("@/server/actions/hr/recruitment-lifecycle", () => ({mutateRecruitmentLifecycle: state.mutate}));
vi.mock("@/hooks/realtime/use-realtime-sync", () => ({useRealtimeSync: () => {}}));
vi.mock("next/navigation", () => ({usePathname: () => "/admin/hr/recruitment"}));

const permissions = ["hr.recruitment.view", "hr.recruitment.manage"];
const context = {profile: {id: 6, auth_user_id: "synthetic-denial-lifetime", must_change_password: false}, accountStatus: "active", isAccountActive: true,
  permissionCodes: permissions, roleCodes: ["hr_scoped"], roleAssignments: [{roleId: 880106, roleCode: "hr_scoped", ownerCompanyId: 880101, branchId: null, permissionCodes: permissions}]} as unknown as AuthContext;
const candidate = {id: 100, candidate_code: "SYNTHETIC-100", full_name_en: "Synthetic candidate A", candidate_status: "new", pipeline_stage: "new",
  email: "synthetic@example.invalid", notes: "SYNTHETIC PRIVATE NOTES"} as CandidateRow;
const counts = (id = 100) => ({success: true, data: {candidateId: id, interview_count: 1003, offer_count: 1004, document_count: 1005,
  onboarding_task_count: id === 100 ? 1107 : 1207, pending_task_count: 11}});
const clients: QueryClient[] = [];
function mount(node: React.ReactNode) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0, staleTime: Infinity}}}); clients.push(client);
  const wrap = (child: React.ReactNode) => <QueryClientProvider client={client}><WorkspaceDraftProvider><WorkspaceUiMemoryProvider>{child}</WorkspaceUiMemoryProvider></WorkspaceDraftProvider></QueryClientProvider>;
  const view = render(wrap(node)); return {...view, client, replace: (next: React.ReactNode) => view.rerender(wrap(next))};
}
function requisitions() {return <RequisitionsPageClient authContext={context} initialReadIdentity={recruitmentReadIdentity(context)} initialUpdatedAt={Date.now()}
  initialPage={{kind: "requisitions", page: 1, pageSize: 25, totalCount: 1, rows: [recruitmentInquiryRowSchemas.requisitions.parse(fixture("requisitions"))]}} />;}
function overview(row = candidate, authContext = context) {return <CandidateOverviewTab candidate={row} authContext={authContext} canManage />;}
function request(candidateId = 100) {return new Request("http://localhost/api/reads/hr-candidate-summary", {
  method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({candidateId}),
});}
async function nativeTransport(_route: string, params: {candidateId: number}) {
  const response = await POST(request(params.candidateId)), body: unknown = await response.json();
  if (!response.ok) throw new ReadError("Synthetic API response", response.status);
  return body;
}
const inquiryPrefix = ["hr", "recruitment", "requisitions", recruitmentReadIdentity(context), "counted-page"];
beforeEach(() => {state.context = context; state.visible = true; state.nativeFailure = false; state.permission = true; state.rowId = null; state.nativeCalls = 0;});
afterEach(() => {cleanup(); clients.splice(0).forEach(c => c.clear()); for (const mock of [state.read, state.mutate, state.error, state.success]) mock.mockReset();});

it.each([401, 403])("same-principal warm %s retires an already-open requisition editor and actions", async status => {
  state.read.mockResolvedValueOnce({success: true, data: fixture("requisitions")});
  const view = mount(requisitions()); await screen.findByText("Synthetic requisition 1");
  fireEvent.click(screen.getByRole("button", {name: "Edit record"})); const dialog = await screen.findByRole("dialog");
  expect((within(dialog).getByLabelText("Job Description") as HTMLTextAreaElement).value).toBe("Complete original wording");
  fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "Synthetic unsaved private wording"}});
  state.read.mockRejectedValue(new ReadError("Denied", status));
  await act(async () => {await view.client.invalidateQueries({queryKey: inquiryPrefix});});
  await screen.findByRole("alert");
  await waitFor(() => expect(view.client.getQueryCache().getAll().some(q => q.state.data)).toBe(false));
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByDisplayValue("Synthetic unsaved private wording")).toBeNull();
  expect(screen.queryByRole("button", {name: "New Requisition"})).toBeNull();
  expect(state.read).toHaveBeenCalledTimes(2); expect(state.mutate).not.toHaveBeenCalled();
});
it.each([401, 403])("late requisition details cannot reopen an editor after a same-principal %s", async status => {
  let finish!: (data: unknown) => void; let detailSignal: AbortSignal | undefined;
  state.read.mockImplementation((route: string, _params: unknown, signal: AbortSignal) => route === "hr-recruitment-requisition-detail"
    ? new Promise(resolve => {finish = resolve; detailSignal = signal;}) : Promise.reject(new ReadError("Denied", status)));
  const view = mount(requisitions()); await screen.findByText("Synthetic requisition 1");
  fireEvent.click(screen.getByRole("button", {name: "Edit record"})); await screen.findByText("Loading complete requisition…");
  await act(async () => {await view.client.invalidateQueries({queryKey: inquiryPrefix});});
  await screen.findByRole("alert"); expect(detailSignal?.aborted).toBe(true);
  await act(async () => finish({success: true, data: fixture("requisitions")}));
  expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByText("Synthetic requisition 1")).toBeNull();
  expect(state.mutate).not.toHaveBeenCalled();
});
it("ordinary 503 pauses the requisition portal, preserves its draft, and a rejected save does not discard it", async () => {
  state.read.mockResolvedValueOnce({success: true, data: fixture("requisitions")});
  const view = mount(requisitions()); await screen.findByText("Synthetic requisition 1"); fireEvent.click(screen.getByRole("button", {name: "Edit record"}));
  const dialog = await screen.findByRole("dialog"); fireEvent.change(within(dialog).getByLabelText("Job Description"), {target: {value: "Retained synthetic draft"}});
  state.read.mockRejectedValue(new ReadError("Temporary failure", 503));
  await act(async () => {await view.client.invalidateQueries({queryKey: inquiryPrefix});});
  // F12 retains the visible draft and pauses submission during an outage.
  await screen.findByText(/Your fields are retained; saving is paused/);
  expect(within(screen.getByRole("dialog")).getByRole("button", {name: /^Save/})).toHaveProperty("disabled", true);
  expect(state.mutate).not.toHaveBeenCalled();
  state.read.mockResolvedValue({success: true, data: {kind: "requisitions", page: 1, pageSize: 25, totalCount: 1, rows: [recruitmentInquiryRowSchemas.requisitions.parse(fixture("requisitions"))]}});
  await act(async () => {await view.client.invalidateQueries({queryKey: inquiryPrefix});});
  const restoredDialog = await screen.findByRole("dialog");
  expect((within(restoredDialog).getByLabelText("Job Description") as HTMLTextAreaElement).value).toBe("Retained synthetic draft");
  state.mutate.mockResolvedValue({success: false, error: "Synthetic validation failure"});
  fireEvent.change(within(restoredDialog).getByLabelText("Decision / change reason"), {target: {value: "Synthetic wording correction"}});
  fireEvent.click(within(restoredDialog).getByRole("button", {name: /^Save/})); await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
  expect(state.mutate).toHaveBeenCalledWith(expect.objectContaining({kind: "requisition", id: 1, revision: "1", action: "update", reason: "Synthetic wording correction", values: expect.objectContaining({job_description: "Retained synthetic draft", requirements: "Complete requirements"})}), expect.any(String));
  expect((within(restoredDialog).getByLabelText("Job Description") as HTMLTextAreaElement).value).toBe("Retained synthetic draft");
});

it("native absent subject yields non-disclosing 403 without a false empty summary", async () => {
  state.visible = false; const response = await POST(request()), body = await response.json();
  expect(response.status).toBe(403); expect(body).toMatchObject({success: false, error: "Permission denied"});
  expect(body).not.toHaveProperty("data"); expect(response.headers.get("Cache-Control")).toContain("no-store");
});
it("general permission loss denies without starting native business reads", async () => {
  state.permission = false; expect((await POST(request())).status).toBe(403); expect(state.nativeCalls).toBe(0);
});
it.each(["native failure", "wrong subject"])("%s remains an unavailable 503 rather than a false denial", async mode => {
  if (mode === "native failure") state.nativeFailure = true; else state.rowId = 101;
  const response = await POST(request()); expect(response.status).toBe(503); expect(response.headers.get("Cache-Control")).toContain("no-store");
});
it("actual overview hides old candidate fields after an error-free native subject lookup becomes invisible", async () => {
  state.read.mockImplementation(nativeTransport); const view = mount(overview()); await screen.findByText("1107");
  expect(screen.getByText("SYNTHETIC PRIVATE NOTES")).toBeTruthy(); state.visible = false;
  await act(async () => {await view.client.invalidateQueries({queryKey: ["hr", "recruitment", "candidate", 100]});});
  await screen.findByRole("alert"); expect(screen.queryByText("SYNTHETIC PRIVATE NOTES")).toBeNull();
  expect(screen.queryByText("Synthetic candidate A")).toBeNull(); expect(screen.queryByText("0")).toBeNull();
  expect(state.read).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(view.client.getQueryCache().getAll().some(q => q.state.data)).toBe(false));
});
it("a genuine native outage remains explicitly retryable and verified subject information recovers", async () => {
  state.read.mockImplementation(nativeTransport); const view = mount(overview()); await screen.findByText("1107"); state.nativeFailure = true;
  await act(async () => {await view.client.invalidateQueries({queryKey: ["hr", "recruitment", "candidate", 100]});});
  await screen.findByRole("alert"); expect(screen.getByRole("button", {name: "Retry candidate summary"})).toBeTruthy();
  expect(screen.queryByText("0")).toBeNull(); state.nativeFailure = false;
  fireEvent.click(screen.getByRole("button", {name: "Retry candidate summary"})); await screen.findByText("1107"); expect(screen.getByText("SYNTHETIC PRIVATE NOTES")).toBeTruthy();
});
it("candidate A denial does not poison permitted candidate B under the same principal", async () => {
  state.read.mockRejectedValueOnce(new ReadError("Denied candidate A", 403)); const view = mount(overview()); await screen.findByRole("alert");
  state.read.mockImplementation(async (_route: string, params: {candidateId: number}) => counts(params.candidateId));
  view.replace(overview({...candidate, id: 101, full_name_en: "Permitted synthetic candidate B"}));
  await screen.findByText("1207"); expect(screen.getByText("Permitted synthetic candidate B")).toBeTruthy(); expect(screen.queryByText("Synthetic candidate A")).toBeNull();
  expect(state.read.mock.calls.filter(([, params]) => params.candidateId === 101)).toHaveLength(1);
});
it.each(["resolve", "deny"])("late %s from prior candidate A cannot retire or populate current candidate B", async mode => {
  let finish!: (data: unknown) => void, reject!: (error: unknown) => void; let oldSignal: AbortSignal | undefined;
  state.read.mockResolvedValueOnce(counts());
  const view = mount(overview()); await screen.findByText("1107");
  state.read.mockImplementation((_route: string, params: {candidateId: number}, signal: AbortSignal) => params.candidateId === 100
    ? new Promise((resolve, failure) => {finish = resolve; reject = failure; oldSignal = signal;}) : Promise.resolve(counts(101)));
  await act(async () => {void view.client.invalidateQueries({queryKey: ["hr", "recruitment", "candidate", 100]});});
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(2));
  view.replace(overview({...candidate, id: 101, full_name_en: "Permitted synthetic candidate B"})); await screen.findByText("1207");
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => {if (mode === "deny") reject(new ReadError("Old candidate denied", 403)); else finish(counts());});
  expect(screen.getByText("1207")).toBeTruthy(); expect(screen.queryByRole("alert")).toBeNull(); expect(screen.queryByText("1107")).toBeNull();
  expect(view.client.getQueryCache().getAll().some(q => q.queryKey[3] === 100 && q.state.data)).toBe(false);
});
it("principal change masks retained candidate props until that principal verifies the subject", async () => {
  state.read.mockResolvedValueOnce(counts()); const view = mount(overview()); await screen.findByText("SYNTHETIC PRIVATE NOTES");
  let finish!: (value: unknown) => void; state.read.mockImplementation(() => new Promise(resolve => {finish = resolve;}));
  const nextContext = {...context, profile: {...context.profile!, id: 7, auth_user_id: "synthetic-new-principal"}} as AuthContext;
  view.replace(overview(candidate, nextContext)); await waitFor(() => expect(state.read).toHaveBeenCalledTimes(2));
  expect(screen.queryByText("SYNTHETIC PRIVATE NOTES")).toBeNull(); expect(screen.queryByText("Synthetic candidate A")).toBeNull();
  expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(recruitmentReadIdentity(context)) && q.state.data)).toBe(false);
  await act(async () => finish(counts())); await screen.findByText("SYNTHETIC PRIVATE NOTES");
});
