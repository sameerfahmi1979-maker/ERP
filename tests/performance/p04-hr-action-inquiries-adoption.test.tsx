// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import type {AuthContext} from "@/lib/rbac/check";
import {ReadError} from "@/lib/reads/client";
import {HR_ACTION_INQUIRY_KINDS, HR_ACTION_INQUIRY_FIELDS, hrActionInquiryIdentity, hrActionInquiryRowSchemas, type HrActionInquiryCriteria, type HrActionInquiryKind, type HrActionInquiryPage} from "@/lib/reads/hr-action-inquiries-schema";
import {HrProProcessesPageClient} from "@/features/hr/actions/hr-pro-processes-page-client";
import {HrEosPageClient} from "@/features/hr/actions/hr-eos-page-client";
import {HrApprovalsPageClient} from "@/features/hr/actions/hr-approvals-page-client";
import {HrDisciplinaryPageClient} from "@/features/hr/actions/hr-disciplinary-page-client";
import {actionRecordDetail} from "./hr-action-record-fixtures";
const state = vi.hoisted(() => ({read: vi.fn(), approve: vi.fn(), reject: vi.fn(), update: vi.fn(), archive: vi.fn(), success: vi.fn(), error: vi.fn()}));
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: state.read}));
vi.mock("@/server/actions/hr/actions", () => ({approveEmployeeApprovalRequest: state.approve, rejectEmployeeApprovalRequest: state.reject, updateEmployeeDisciplinaryRecord: state.update, archiveEmployeeDisciplinaryRecord: state.archive}));
vi.mock("sonner", () => ({toast: {success: state.success, error: state.error}}));
vi.mock("next/navigation", () => ({usePathname: () => "/admin/hr/actions"}));
const permissions = ["hr.actions.view", "hr.actions.manage", "hr.confidential.view"];
const context = {profile: {id: 6, auth_user_id: "synthetic-inquiry-owner", must_change_password: false}, accountStatus: "active", isAccountActive: true, permissionCodes: permissions, roleCodes: ["hr_scoped"], roleAssignments: [{roleId: 880106, roleCode: "hr_scoped", ownerCompanyId: 880101, branchId: null, permissionCodes: permissions}]} as unknown as AuthContext;
const date = (id: number) => new Date(Date.UTC(2026, 0, 1 + id)).toISOString().slice(0, 10);
const token = (kind: HrActionInquiryKind, id: number) => kind === "eos" ? date(id) : kind === "pro" ? `Synthetic process ${id}` : kind === "approvals" ? `Synthetic request ${id}` : `Synthetic warning ${id}`;
function full(kind: HrActionInquiryKind, id: number) {return {...actionRecordDetail(kind, id), process_title: token("pro", id), request_title: token("approvals", id), subject: token("disciplinary", id), last_working_date: date(id), employee: {full_name_en: "Synthetic employee " + id, full_name_ar: null, employee_code: "PERF-" + id}};}
function envelope(p: HrActionInquiryCriteria, first = 26, count = 1107) {
  return {success: true, data: {kind: p.kind, page: p.page, pageSize: p.pageSize, totalCount: count, rows: Array.from({length: Math.min(p.pageSize, Math.max(0, count - (p.page - 1) * p.pageSize))}, (_, i) => hrActionInquiryRowSchemas[p.kind].parse(full(p.kind, first + i)))}};
}
function page(kind: HrActionInquiryKind, options: {context?: AuthContext; count?: number; seedIdentity?: string} = {}) {
  const count = options.count ?? 1107, ctx = options.context ?? context;
  const common = {authContext: ctx, initialPage: {kind, rows: Array.from({length: Math.min(25, count)}, (_, i) => hrActionInquiryRowSchemas[kind].parse(full(kind, i + 1))), totalCount: count, page: 1, pageSize: 25} as HrActionInquiryPage, initialReadIdentity: options.seedIdentity ?? hrActionInquiryIdentity(context), initialUpdatedAt: Date.now()};
  return kind === "pro" ? <HrProProcessesPageClient {...common} /> : kind === "eos" ? <HrEosPageClient {...common} /> : kind === "approvals" ? <HrApprovalsPageClient {...common} /> : <HrDisciplinaryPageClient {...common} />;
}
const clients: QueryClient[] = [];
function mount(node: React.ReactNode) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const wrap = (child: React.ReactNode) => <QueryClientProvider client={client}><WorkspaceUiMemoryProvider>{child}</WorkspaceUiMemoryProvider></QueryClientProvider>;
  const view = render(wrap(node)); return {...view, client, replace: (child: React.ReactNode) => view.rerender(wrap(child))};
}
const lastParams = () => state.read.mock.calls.at(-1)?.[1] as HrActionInquiryCriteria;
const ready = (kind: HrActionInquiryKind, id = 1) => screen.findByText(token(kind, id));
afterEach(() => {cleanup(); clients.splice(0).forEach(c => c.clear()); Object.values(state).forEach(m => m.mockReset());});

it.each(HR_ACTION_INQUIRY_KINDS)("%s matching SSR data is usable without a duplicate initial read", async kind => {
  mount(page(kind)); await ready(kind); await act(async () => {}); expect(state.read).not.toHaveBeenCalled(); expect(screen.getByText("1107 permitted records")).toBeTruthy();
});
it.each(HR_ACTION_INQUIRY_KINDS)("%s page navigation reads full counted data beyond the initial page", async kind => {
  state.read.mockImplementation((_r, p) => Promise.resolve(envelope(p))); mount(page(kind)); await ready(kind);
  fireEvent.click(screen.getByRole("button", {name: "Next"})); await ready(kind, 26); expect(lastParams()).toMatchObject({kind, page: 2, pageSize: 25}); expect(screen.queryByText(token(kind, 1))).toBeNull();
});
it.each(HR_ACTION_INQUIRY_KINDS)("%s bilingual search masks old rows and searches beyond the backend cap", async kind => {
  state.read.mockImplementation((_r, p) => Promise.resolve(envelope(p, 1101, 1))); mount(page(kind)); await ready(kind);
  fireEvent.change(screen.getByPlaceholderText("Search all permitted records…"), {target: {value: "اختبار_%"}});
  expect(screen.queryByText(token(kind, 1))).toBeNull(); expect(state.read).not.toHaveBeenCalled(); await ready(kind, 1101);
  expect(lastParams()).toMatchObject({kind, page: 1, search: "اختبار_%"}); expect(state.read).toHaveBeenCalledTimes(1);
});
it.each(HR_ACTION_INQUIRY_KINDS)("%s full-result filters work even when the visible result is empty", async kind => {
  state.read.mockImplementation((_r, p) => Promise.resolve(envelope(p, 1101, 1))); mount(page(kind, {count: 0}));
  fireEvent.click(screen.getByRole("button", {name: /^Edit filters/})); const dialog = await screen.findByRole("dialog");
  const f = HR_ACTION_INQUIRY_FIELDS[kind].find(field => field.type === "select")!;
  fireEvent.change(within(dialog).getByLabelText(f.label), {target: {value: f.options![1].value}}); fireEvent.click(within(dialog).getByRole("button", {name: "Apply"}));
  await ready(kind, 1101); expect(lastParams().columnFilters).toEqual({[f.id]: f.options![1].value});
});
it.each(HR_ACTION_INQUIRY_KINDS)("%s restored workspace page remains distinct from the default seed", async kind => {
  state.read.mockImplementation((_r, p) => Promise.resolve(envelope(p))); const view = mount(page(kind)); await ready(kind);
  fireEvent.click(screen.getByRole("button", {name: "Next"})); await ready(kind, 26); view.replace(null); view.replace(page(kind)); await ready(kind, 26);
  expect(screen.queryByText(token(kind, 1))).toBeNull(); expect(state.read).toHaveBeenCalledTimes(1);
});
it.each(HR_ACTION_INQUIRY_KINDS)("%s account switch retires the old seed and cached principal", async kind => {
  let finish!: (r: unknown) => void; state.read.mockImplementation(() => new Promise(r => {finish = r;})); const view = mount(page(kind, {count: 1})); await ready(kind);
  const changed = {...context, profile: {...context.profile!, id: 7, auth_user_id: "synthetic-other"}} as AuthContext;
  view.replace(page(kind, {count: 1, context: changed})); await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1)); expect(screen.queryByText(token(kind, 1))).toBeNull();
  expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(hrActionInquiryIdentity(context)))).toBe(false);
  await act(async () => finish(envelope(lastParams(), 51, 1))); await ready(kind, 51);
});
it.each([401, 403])("warm denial %s clears rows and does not silently retry", async status => {
  state.read.mockRejectedValue(new ReadError("Denied", status)); const view = mount(page("pro", {count: 1})); await ready("pro");
  fireEvent.click(screen.getByRole("button", {name: "Refresh records"})); await screen.findByRole("alert"); expect(screen.queryByText(token("pro", 1))).toBeNull(); expect(state.read).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(hrActionInquiryIdentity(context)) && q.state.data)).toBe(false));
});
it.each(["suspended", "password", "confidential-revoked"])("%s clears disciplinary rows and an open private editor", async mode => {
  state.read.mockResolvedValue({success: true, data: full("disciplinary", 1)}); const view = mount(page("disciplinary", {count: 1})); await ready("disciplinary");
  fireEvent.click(screen.getByRole("button", {name: /^Edit$/})); const dialog = await screen.findByRole("dialog"); expect(within(dialog).getByLabelText("Description")).toBeTruthy();
  const changed = mode === "suspended" ? {...context, isAccountActive: false, accountStatus: "suspended"} : mode === "password" ? {...context, profile: {...context.profile!, must_change_password: true}} : {...context, permissionCodes: ["hr.actions.view"], roleAssignments: context.roleAssignments!.map(r => ({...r, permissionCodes: ["hr.actions.view"]}))};
  view.replace(page("disciplinary", {count: 1, context: changed as AuthContext})); await screen.findByRole("alert"); expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByText(token("disciplinary", 1))).toBeNull();
});
it("disciplinary editing loads complete wording before opening and retains it on failure", async () => {
  let finish!: (v: unknown) => void; state.read.mockImplementation(() => new Promise(r => {finish = r;})); state.update.mockResolvedValue({success: false, error: "Synthetic validation failure"});
  mount(page("disciplinary", {count: 1})); await ready("disciplinary"); fireEvent.click(screen.getByRole("button", {name: /^Edit$/}));
  await screen.findByText("Loading complete record…"); expect(screen.queryByRole("dialog")).toBeNull(); expect(state.read.mock.calls[0].slice(0, 2)).toEqual(["hr-disciplinary-detail", {recordId: 1, employeeId: 100}]);
  await act(async () => finish({success: true, data: full("disciplinary", 1)})); const dialog = await screen.findByRole("dialog");
  expect((within(dialog).getByLabelText("Description") as HTMLTextAreaElement).value).toBe("SYNTHETIC_PRIVATE_DISCIPLINE");
  fireEvent.change(within(dialog).getByLabelText("Description"), {target: {value: "Retained edited wording"}});
  fireEvent.click(within(dialog).getByRole("button", {name: /^Save/})); await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
  expect(state.update.mock.calls[0][1]).toMatchObject({description: "Retained edited wording", action_taken: "Retain full action"}); expect((within(dialog).getByLabelText("Description") as HTMLTextAreaElement).value).toBe("Retained edited wording");
});
it("failed or mismatched detail never opens a partial editor", async () => {
  state.read.mockResolvedValue({success: true, data: {...full("disciplinary", 1), id: 999}}); mount(page("disciplinary", {count: 1})); await ready("disciplinary");
  fireEvent.click(screen.getByRole("button", {name: /^Edit$/})); await screen.findByRole("alert"); expect(screen.queryByRole("dialog")).toBeNull(); expect(state.update).not.toHaveBeenCalled();
});
it("approval double-click uses the existing admission guard and invalidates the paged inquiry", async () => {
  let finish!: (v: unknown) => void; state.approve.mockImplementation(() => new Promise(r => {finish = r;})); state.read.mockImplementation((_r, p) => Promise.resolve(envelope(p, 1, 1)));
  mount(page("approvals", {count: 1})); await ready("approvals"); const button = screen.getByRole("button", {name: /^Approve$/}); fireEvent.click(button); fireEvent.click(button);
  expect(state.approve).toHaveBeenCalledTimes(1); expect(state.approve).toHaveBeenCalledWith(1);
  await act(async () => finish({success: true})); await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1)); expect(lastParams().kind).toBe("approvals");
});
it("a failed warm read stays explicit and retry restores data without false zero", async () => {
  state.read.mockRejectedValue(new ReadError("Controlled outage", 503)); mount(page("eos", {count: 1})); await ready("eos"); fireEvent.click(screen.getByRole("button", {name: "Refresh records"}));
  await screen.findByRole("alert"); expect(screen.queryByText("0 permitted records")).toBeNull(); expect(screen.queryByText(token("eos", 1))).toBeNull(); expect(state.read).toHaveBeenCalledTimes(2);
  state.read.mockImplementation((_r, p) => Promise.resolve(envelope(p, 51, 1))); fireEvent.click(screen.getByRole("button", {name: "Retry loading records"})); await ready("eos", 51); expect(state.read).toHaveBeenCalledTimes(3);
});
it("an obsolete reply cannot resurrect retired principal data", async () => {
  const pending: {params: HrActionInquiryCriteria; signal: AbortSignal; finish: (v: unknown) => void}[] = [];
  state.read.mockImplementation((_r, params, signal) => new Promise(finish => pending.push({params, signal, finish})));
  const view = mount(page("pro", {count: 1})); await ready("pro"); fireEvent.change(screen.getByPlaceholderText("Search all permitted records…"), {target: {value: "Old search"}}); await waitFor(() => expect(pending).toHaveLength(1));
  const changed = {...context, profile: {...context.profile!, id: 7, auth_user_id: "synthetic-new"}} as AuthContext; view.replace(page("pro", {count: 1, context: changed})); await waitFor(() => expect(pending).toHaveLength(2)); expect(pending[0].signal.aborted).toBe(true);
  await act(async () => pending[0].finish(envelope(pending[0].params, 91, 1))); expect(screen.queryByText(token("pro", 91))).toBeNull(); await act(async () => pending[1].finish(envelope(pending[1].params, 51, 1))); await ready("pro", 51);
});
