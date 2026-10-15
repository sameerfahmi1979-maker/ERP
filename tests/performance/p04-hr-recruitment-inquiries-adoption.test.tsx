// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import type {AuthContext} from "@/lib/rbac/check";
import {ReadError} from "@/lib/reads/client";
import {RECRUITMENT_INQUIRY_KINDS, RECRUITMENT_INQUIRY_CONFIG, recruitmentReadIdentity, recruitmentInquiryRowSchemas, type RecruitmentInquiryCriteria, type RecruitmentInquiryKind, type RecruitmentInquiryPage} from "@/lib/reads/hr-recruitment-inquiries-schema";
import {CandidatesPageClient} from "@/features/hr/recruitment/candidates-page-client";
import {RequisitionsPageClient} from "@/features/hr/recruitment/requisitions-page-client";
import {InterviewsPageClient} from "@/features/hr/recruitment/interviews-page-client";
import {OffersPageClient} from "@/features/hr/recruitment/offers-page-client";
import {GlobalOnboardingPageClient} from "@/features/hr/recruitment/global-onboarding-page-client";
import {recruitmentInquiryFixture as fixture} from "./hr-recruitment-inquiry-fixtures";
const state = vi.hoisted(() => ({read: vi.fn(), create: vi.fn(), update: vi.fn(), archive: vi.fn(), success: vi.fn(), error: vi.fn()}));
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: state.read}));
vi.mock("@/server/actions/hr/recruitment", () => ({createJobRequisition: state.create, updateJobRequisition: state.update, archiveJobRequisition: state.archive}));
vi.mock("@/hooks/realtime/use-realtime-sync", () => ({useRealtimeSync: () => {}}));
vi.mock("sonner", () => ({toast: {success: state.success, error: state.error}}));
vi.mock("next/navigation", () => ({usePathname: () => "/admin/hr/recruitment"}));
const permissions = ["hr.recruitment.view", "hr.recruitment.manage"];
const context = {profile: {id: 6, auth_user_id: "synthetic-recruitment-owner", must_change_password: false}, accountStatus: "active", isAccountActive: true, permissionCodes: permissions, roleCodes: ["hr_scoped"], roleAssignments: [{roleId: 880106, roleCode: "hr_scoped", ownerCompanyId: 880101, branchId: null, permissionCodes: permissions}]} as unknown as AuthContext;
const components = {candidates: CandidatesPageClient, requisitions: RequisitionsPageClient, interviews: InterviewsPageClient, offers: OffersPageClient, onboarding: GlobalOnboardingPageClient};
const token = (kind: RecruitmentInquiryKind, id: number) => kind === "requisitions" ? "Synthetic requisition " + id : kind === "onboarding" ? "Synthetic task " + id : "Synthetic candidate " + id;
function envelope(p: RecruitmentInquiryCriteria, first = 26, count = 1107) {
  return {success: true, data: {kind: p.kind, page: p.page, pageSize: p.pageSize, totalCount: count, rows: Array.from({length: Math.min(p.pageSize, Math.max(0, count - (p.page - 1) * p.pageSize))}, (_, i) => recruitmentInquiryRowSchemas[p.kind].parse(fixture(p.kind, first + i)))}};
}
function page(kind: RecruitmentInquiryKind, options: {context?: AuthContext; count?: number; seedIdentity?: string} = {}) {
  const count = options.count ?? 1107, ctx = options.context ?? context, Component = components[kind];
  const common = {authContext: ctx, initialPage: {kind, rows: Array.from({length: Math.min(25, count)}, (_, i) => recruitmentInquiryRowSchemas[kind].parse(fixture(kind, i + 1))), totalCount: count, page: 1, pageSize: 25} as RecruitmentInquiryPage, initialReadIdentity: options.seedIdentity ?? recruitmentReadIdentity(context), initialUpdatedAt: Date.now()};
  return <Component {...common} />;
}
const clients: QueryClient[] = [];
function mount(node: React.ReactNode) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const wrap = (child: React.ReactNode) => <QueryClientProvider client={client}><WorkspaceUiMemoryProvider>{child}</WorkspaceUiMemoryProvider></QueryClientProvider>;
  const view = render(wrap(node)); return {...view, client, replace: (child: React.ReactNode) => view.rerender(wrap(child))};
}
const lastParams = () => state.read.mock.calls.at(-1)?.[1] as RecruitmentInquiryCriteria;
const ready = (kind: RecruitmentInquiryKind, id = 1) => screen.findByText(token(kind, id));
afterEach(() => {cleanup(); clients.splice(0).forEach(c => c.clear()); Object.values(state).forEach(m => m.mockReset());});

it.each(RECRUITMENT_INQUIRY_KINDS)("%s actual screen uses matching SSR without a duplicate business read", async kind => {
  mount(page(kind)); await ready(kind); await act(async () => {}); expect(state.read).not.toHaveBeenCalled(); expect(screen.getByText("1107 permitted records")).toBeTruthy();
});
it.each(RECRUITMENT_INQUIRY_KINDS)("%s actual screen reaches later counted pages", async kind => {
  state.read.mockImplementation((_r, p) => Promise.resolve(envelope(p))); mount(page(kind)); await ready(kind);
  fireEvent.click(screen.getByRole("button", {name: "Next"})); await ready(kind, 26); expect(lastParams()).toMatchObject({kind, page: 2, pageSize: 25}); expect(screen.queryByText(token(kind, 1))).toBeNull();
});
it.each(RECRUITMENT_INQUIRY_KINDS)("%s Arabic search masks the old result and sends one debounced complete-result request", async kind => {
  state.read.mockImplementation((_r, p) => Promise.resolve(envelope(p, 1101, 1))); mount(page(kind)); await ready(kind);
  fireEvent.change(screen.getByPlaceholderText("Search all permitted records…"), {target: {value: "اختبار_%"}});
  expect(screen.queryByText(token(kind, 1))).toBeNull(); expect(state.read).not.toHaveBeenCalled(); await ready(kind, 1101);
  expect(lastParams()).toMatchObject({kind, page: 1, search: "اختبار_%"}); expect(state.read).toHaveBeenCalledTimes(1);
});
it.each(RECRUITMENT_INQUIRY_KINDS)("%s filters stay usable when no rows match", async kind => {
  state.read.mockImplementation((_r, p) => Promise.resolve(envelope(p, 1101, 1))); mount(page(kind, {count: 0}));
  fireEvent.click(screen.getByRole("button", {name: /^Edit filters/})); const dialog = await screen.findByRole("dialog");
  const field = RECRUITMENT_INQUIRY_CONFIG[kind].fields.find(f => f.type === "select")!;
  fireEvent.change(within(dialog).getByLabelText(field.label), {target: {value: field.options![1].value}}); fireEvent.click(within(dialog).getByRole("button", {name: "Apply"}));
  await ready(kind, 1101); expect(lastParams().columnFilters).toEqual({[field.id]: field.options![1].value});
});
it.each(RECRUITMENT_INQUIRY_KINDS)("%s restored workspace page is not replaced by default initial rows", async kind => {
  state.read.mockImplementation((_r, p) => Promise.resolve(envelope(p))); const view = mount(page(kind)); await ready(kind);
  fireEvent.click(screen.getByRole("button", {name: "Next"})); await ready(kind, 26); view.replace(null); view.replace(page(kind)); await ready(kind, 26);
  expect(screen.queryByText(token(kind, 1))).toBeNull(); expect(state.read).toHaveBeenCalledTimes(1);
});
it.each(RECRUITMENT_INQUIRY_KINDS)("%s account switch retires the old seed and principal-owned cache", async kind => {
  let finish!: (r: unknown) => void; state.read.mockImplementation(() => new Promise(r => {finish = r;})); const view = mount(page(kind, {count: 1})); await ready(kind);
  const changed = {...context, profile: {...context.profile!, id: 7, auth_user_id: "synthetic-other"}} as AuthContext;
  view.replace(page(kind, {count: 1, context: changed})); await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1)); expect(screen.queryByText(token(kind, 1))).toBeNull();
  expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(recruitmentReadIdentity(context)))).toBe(false);
  await act(async () => finish(envelope(lastParams(), 51, 1))); await ready(kind, 51);
});
it.each([401, 403])("warm denial %s removes cached records without silently retrying", async status => {
  state.read.mockRejectedValue(new ReadError("Denied", status)); const view = mount(page("candidates", {count: 1})); await ready("candidates");
  fireEvent.click(screen.getByRole("button", {name: "Refresh records"})); await screen.findByRole("alert"); expect(screen.queryByText(token("candidates", 1))).toBeNull(); expect(state.read).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(recruitmentReadIdentity(context)) && q.state.data)).toBe(false));
});
it.each(["suspended", "password", "revoked"])("%s removes an open requisition editor and its old values", async mode => {
  state.read.mockResolvedValue({success: true, data: fixture("requisitions")}); const view = mount(page("requisitions", {count: 1})); await ready("requisitions");
  fireEvent.click(screen.getByRole("button", {name: "Edit record"})); const dialog = await screen.findByRole("dialog"); expect(within(dialog).getByLabelText("Job Description")).toBeTruthy();
  const changed = mode === "suspended" ? {...context, isAccountActive: false, accountStatus: "suspended"} : mode === "password" ? {...context, profile: {...context.profile!, must_change_password: true}} : {...context, permissionCodes: [], roleAssignments: []};
  view.replace(page("requisitions", {count: 1, context: changed as AuthContext})); await screen.findByRole("alert"); expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByText(token("requisitions", 1))).toBeNull();
});
it("requisition edit retrieves complete wording on demand and preserves dirty wording after save failure", async () => {
  let finish!: (v: unknown) => void; state.read.mockImplementation(() => new Promise(r => {finish = r;})); state.update.mockResolvedValue({success: false, error: "Synthetic validation failure"});
  mount(page("requisitions", {count: 1})); await ready("requisitions"); fireEvent.click(screen.getByRole("button", {name: "Edit record"}));
  await screen.findByText("Loading complete requisition…"); expect(screen.queryByRole("dialog")).toBeNull(); expect(state.read.mock.calls[0].slice(0, 2)).toEqual(["hr-recruitment-requisition-detail", {recordId: 1}]);
  await act(async () => finish({success: true, data: fixture("requisitions")})); const dialog = await screen.findByRole("dialog");
  expect((within(dialog).getByLabelText("Job Description") as HTMLTextAreaElement).value).toBe("Complete original wording");
  fireEvent.change(within(dialog).getByLabelText("Job Description"), {target: {value: "Retained draft"}});
  fireEvent.click(within(dialog).getByRole("button", {name: /^Save/})); await waitFor(() => expect(state.update).toHaveBeenCalledTimes(1));
  expect(state.update.mock.calls[0][1]).toMatchObject({job_description: "Retained draft", requirements: "Complete requirements"}); expect((within(dialog).getByLabelText("Job Description") as HTMLTextAreaElement).value).toBe("Retained draft");
});
it("mismatched requisition details cannot open a partial editor", async () => {
  state.read.mockResolvedValue({success: true, data: {...fixture("requisitions"), id: 999}}); mount(page("requisitions", {count: 1})); await ready("requisitions");
  fireEvent.click(screen.getByRole("button", {name: "Edit record"})); await screen.findByRole("alert"); expect(screen.queryByRole("dialog")).toBeNull(); expect(state.update).not.toHaveBeenCalled();
});
it("a failed refresh is explicit, bounded retry does not show a false zero, and manual retry recovers", async () => {
  state.read.mockRejectedValue(new ReadError("Controlled outage", 503)); mount(page("offers", {count: 1})); await ready("offers"); fireEvent.click(screen.getByRole("button", {name: "Refresh records"}));
  await screen.findByRole("alert"); expect(screen.queryByText("0 permitted records")).toBeNull(); expect(screen.queryByText(token("offers", 1))).toBeNull(); expect(state.read).toHaveBeenCalledTimes(2);
  state.read.mockImplementation((_r, p) => Promise.resolve(envelope(p, 51, 1))); fireEvent.click(screen.getByRole("button", {name: "Retry loading records"})); await ready("offers", 51); expect(state.read).toHaveBeenCalledTimes(3);
});
it("obsolete replies cannot resurrect a retired principal", async () => {
  const pending: {params: RecruitmentInquiryCriteria; signal: AbortSignal; finish: (v: unknown) => void}[] = [];
  state.read.mockImplementation((_r, params, signal) => new Promise(finish => pending.push({params, signal, finish})));
  const view = mount(page("candidates", {count: 1})); await ready("candidates"); fireEvent.change(screen.getByPlaceholderText("Search all permitted records…"), {target: {value: "Old search"}}); await waitFor(() => expect(pending).toHaveLength(1));
  const changed = {...context, profile: {...context.profile!, id: 7, auth_user_id: "synthetic-new"}} as AuthContext; view.replace(page("candidates", {count: 1, context: changed})); await waitFor(() => expect(pending).toHaveLength(2)); expect(pending[0].signal.aborted).toBe(true);
  await act(async () => pending[0].finish(envelope(pending[0].params, 91, 1))); expect(screen.queryByText(token("candidates", 91))).toBeNull(); await act(async () => pending[1].finish(envelope(pending[1].params, 51, 1))); await ready("candidates", 51);
});
