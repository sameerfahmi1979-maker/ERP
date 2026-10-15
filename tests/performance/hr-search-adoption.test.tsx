// @vitest-environment jsdom
import React from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import type {HrSearchFullCriteria} from "@/lib/reads/hr-search-read-schema";
import {HrSearchPageClient} from "@/features/hr/search/hr-search-page-client";
import {ReadError} from "@/lib/reads/client";
const m = vi.hoisted(() => ({read: vi.fn(), old: vi.fn(), suggest: vi.fn()}));
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: m.read}));
vi.mock("@/server/actions/hr/search", () => ({searchHr: m.old, getHrSearchSuggestions: m.suggest}));
vi.mock("@/components/ui/button", () => ({Button: ({children, variant, size, ...props}: React.ButtonHTMLAttributes<HTMLButtonElement> & {variant?: string; size?: string}) => {void variant; void size; return <button {...props}>{children}</button>;}}));
vi.mock("@/components/ui/input", () => ({Input: React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function TestInput(props, ref) {return <input {...props} ref={ref}/>;})}));
vi.mock("@/components/ui/label", () => ({Label: (props: React.LabelHTMLAttributes<HTMLLabelElement>) => <label {...props}/>}));
vi.mock("@/components/erp/table/record-collection", () => ({RecordCollection: ({rows, renderRecord}: {rows: unknown[]; renderRecord: (row: unknown) => React.ReactNode}) => <>{rows.map(renderRecord)}</>}));
vi.mock("@/features/hr/ai/hr-ai-search-assist", () => ({HrAiSearchAssist: () => null}));
const codes = ["hr.employees.view", "hr.recruitment.view", "hr.compliance.view"];
const auth: AuthContext = {profile: {
  id: 6, auth_user_id: "hr-search-synthetic", must_change_password: false, avatar_url: null, branch_id: null, created_at: "2026-10-05T00:00:00Z",
  department: null, display_name: null, email_confirmed_by_admin_at: null, email_confirmed_by_admin_id: null, employee_reference: null,
  full_name: null, job_title: null, last_admin_updated_at: null, last_password_security_action: null, last_password_security_action_at: null,
  last_password_security_action_by: null, manager_user_profile_id: null, must_change_password_reason: null, notes: null, owner_company_id: null,
  password_changed_at: null, password_reset_sent_at: null, password_set_by_admin_at: null, phone: null, preferred_language: null, status: "active",
  timezone: null, updated_at: "2026-10-05T00:00:00Z", user_code: null,
}, isAccountActive: true, accountStatus: "active", email: null, roleCodes: [], permissionCodes: codes, globalPermissionCodes: codes};
const permissions = {canEmployees: true, canRecruitment: true, canCompliance: true, canTime: false, canPayroll: false, canOperations: false, canActions: false};
function wrap() {const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); return {client, wrapper: ({children}: React.PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>};}
function page(criteria: HrSearchFullCriteria, totalCount = 1107) {return {success: true, data: {criteria, totalCount, groupCounts: {employees: totalCount}, hasMore: criteria.page * criteria.pageSize < totalCount,
  ordering: "category-entity-id-v1", countScope: "authorized-matches", results: Array.from({length: Math.min(criteria.pageSize, Math.max(0, totalCount - (criteria.page - 1) * criteria.pageSize))}, (_, i) => {
    const id = (criteria.page - 1) * criteria.pageSize + i + 1;
    return {id: `emp-${id}`, category: "employees", entityType: "employee", entityId: id, title: `Synthetic employee ${id}`, href: `/admin/hr/employees/record/${id}`, matchedFields: []};})}};}
function search(value = "Synthetic") {fireEvent.change(screen.getByPlaceholderText(/Search employees/), {target: {value}}); fireEvent.click(screen.getByRole("button", {name: /^Search$/}));}
beforeEach(() => {vi.clearAllMocks(); m.old.mockResolvedValue({results: [], totalCount: 0, groupCounts: {}, query: "Synthetic", hasMore: false}); m.suggest.mockResolvedValue([]);
  m.read.mockImplementation(async (_path, criteria) => criteria.mode === "suggestions" ? {success: true, data: {criteria, kind: "quick-suggestions", limit: 8, complete: false, rows: []}} : page(criteria));});
afterEach(cleanup);
it("the actual page exposes full authorized counts and a next page, not capped Server Action results", async () => {
  render(<HrSearchPageClient {...{permissions, authContext: auth}}/>, {wrapper: wrap().wrapper}); search();
  await screen.findByText("Synthetic employee 1"); expect(m.old).not.toHaveBeenCalled(); expect(screen.getByText("1107")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Next results"})); await screen.findByText("Synthetic employee 51");
  expect(m.read.mock.calls.filter(c => c[1].mode === "results").at(-1)?.[1]).toMatchObject({page: 2, pageSize: 50});
});
it("unsupported cross-category status filtering explains the issue and dispatches no full search", async () => {
  render(<HrSearchPageClient {...{permissions, authContext: auth}}/>, {wrapper: wrap().wrapper});
  fireEvent.click(screen.getByRole("button", {name: /Advanced Filters/})); fireEvent.change(screen.getByLabelText("Status"), {target: {value: "active"}}); search();
  expect(await screen.findByRole("alert")).toHaveProperty("textContent", expect.stringContaining("Status filtering"));
  expect(m.old).not.toHaveBeenCalled(); expect(m.read.mock.calls.filter(c => c[1].mode === "results")).toHaveLength(0);
});
it("a failed complete search is unavailable rather than successful zero results and can be retried", async () => {
  m.read.mockRejectedValue(new ReadError("PRIVATE", 400)); render(<HrSearchPageClient {...{permissions, authContext: auth}}/>, {wrapper: wrap().wrapper}); search();
  await screen.findByRole("alert"); expect(screen.queryByText("No results found")).toBeNull(); expect(screen.queryByText(/PRIVATE/)).toBeNull();
  m.read.mockImplementation(async (_path, criteria) => page(criteria, 0)); fireEvent.click(screen.getByRole("button", {name: "Retry search"}));
  await screen.findByText("No results found");
});
it("the real suggestion input coalesces typing and labels its deliberately incomplete preview", async () => {
  m.read.mockImplementation(async (_path, criteria) => ({success: true, data: {criteria, kind: "quick-suggestions", limit: 8, complete: false,
    rows: [{label: "Synthetic preview", href: "/admin/hr/employees/record/1", category: "employees"}]}}));
  render(<HrSearchPageClient {...{permissions, authContext: auth}}/>, {wrapper: wrap().wrapper}); const input = screen.getByPlaceholderText(/Search employees/);
  fireEvent.change(input, {target: {value: " Sy"}}); fireEvent.change(input, {target: {value: " Sy "}}); expect(m.read).not.toHaveBeenCalled();
  await screen.findByText("Synthetic preview"); expect(screen.getByText(/Quick suggestions/)).toBeTruthy(); expect(m.suggest).not.toHaveBeenCalled();
  expect(m.read.mock.calls[0][1].query).toBe(" Sy ");
});
it("switching the account removes results and entered search without sharing the previous page", async () => {
  const {wrapper, client} = wrap(); const ui = render(<HrSearchPageClient {...{permissions, authContext: auth}}/>, {wrapper}); search(); await screen.findByText("Synthetic employee 1");
  ui.rerender(<HrSearchPageClient {...{permissions, authContext: {...auth, profile: {...auth.profile!, id: 7, auth_user_id: "other"}}}}/>);
  expect(screen.queryByText("Synthetic employee 1")).toBeNull(); expect((screen.getByPlaceholderText(/Search employees/) as HTMLInputElement).value).toBe("");
  await act(async () => {}); expect(client.getQueryCache().getAll().every(q => !q.state.data)).toBe(true);
});
it("changing filter drafts does not silently change the displayed committed result, and Search resets the page", async () => {
  render(<HrSearchPageClient {...{permissions, authContext: auth}}/>, {wrapper: wrap().wrapper}); search(); await screen.findByText("Synthetic employee 1");
  fireEvent.click(screen.getByRole("button", {name: "Next results"})); await screen.findByText("Synthetic employee 51");
  const before = m.read.mock.calls.filter(c => c[1].mode === "results").length; fireEvent.click(screen.getByRole("button", {name: /^Employees$/}));
  expect(m.read.mock.calls.filter(c => c[1].mode === "results")).toHaveLength(before); search(" changed "); await screen.findByText("Synthetic employee 1");
  expect(m.read.mock.calls.filter(c => c[1].mode === "results").at(-1)?.[1]).toMatchObject({page: 1, query: " changed ", categories: ["employees"]});
});
it("clearing an in-flight search aborts it and a late result cannot replace the initial screen", async () => {
  let finish!: (v: unknown) => void; let request: HrSearchFullCriteria | undefined;
  m.read.mockImplementation((_path, criteria) => {request = criteria; return new Promise(resolve => {finish = resolve;});});
  render(<HrSearchPageClient permissions={permissions} authContext={auth}/>, {wrapper: wrap().wrapper}); search();
  await waitFor(() => expect(m.read).toHaveBeenCalledTimes(1)); const signal = m.read.mock.calls[0][2] as AbortSignal;
  fireEvent.click(screen.getByRole("button", {name: /^Clear Search$/})); expect(signal.aborted).toBe(true);
  await act(async () => finish(page(request!))); expect(screen.queryByText("Synthetic employee 1")).toBeNull(); expect(screen.getByText("Search HR Records")).toBeTruthy();
});
it("failed background refresh removes old totals/rows and retains the editable search controls", async () => {
  render(<HrSearchPageClient permissions={permissions} authContext={auth}/>, {wrapper: wrap().wrapper}); search(); await screen.findByText("Synthetic employee 1");
  m.read.mockRejectedValue(new ReadError("PRIVATE", 400)); fireEvent.click(screen.getByRole("button", {name: /^Refresh$/})); await screen.findByRole("alert");
  expect(screen.queryByText("1107")).toBeNull(); expect(screen.queryByText("Synthetic employee 1")).toBeNull(); expect(screen.queryByText("No results found")).toBeNull();
  expect(screen.getByLabelText("HR search")).toBeTruthy();
});
it("suggestion failure does not hide the search input or prevent the separate complete search", async () => {
  m.read.mockImplementation(async (_path, criteria) => {if (criteria.mode === "suggestions") throw new ReadError("PRIVATE", 400); return page(criteria);});
  render(<HrSearchPageClient permissions={permissions} authContext={auth}/>, {wrapper: wrap().wrapper});
  fireEvent.change(screen.getByLabelText("HR search"), {target: {value: "Synthetic"}}); await screen.findByText(/Suggestions are unavailable/);
  fireEvent.click(screen.getByRole("button", {name: /^Search$/})); await screen.findByText("Synthetic employee 1"); expect(screen.queryByText(/PRIVATE/)).toBeNull();
});
it("correcting an unsupported filter requires explicit Search and then uses the compatible category", async () => {
  render(<HrSearchPageClient permissions={permissions} authContext={auth}/>, {wrapper: wrap().wrapper});
  fireEvent.click(screen.getByRole("button", {name: /Advanced Filters/})); fireEvent.change(screen.getByLabelText("Status"), {target: {value: "active"}}); search(); await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", {name: /^Employees$/})); expect(m.read.mock.calls.filter(c => c[1].mode === "results")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", {name: /^Search$/})); await screen.findByText("Synthetic employee 1");
  expect(m.read.mock.calls.filter(c => c[1].mode === "results").at(-1)?.[1]).toMatchObject({categories: ["employees"], status: "active", page: 1});
});
it.each(["results", "suggestions"])("a non-Error falsy %s rejection renders the sanitized failed state, never the thrown value", async mode => {
  m.read.mockRejectedValue(0);
  render(<HrSearchPageClient permissions={permissions} authContext={auth}/>, {wrapper: wrap().wrapper});
  if (mode === "results") search();
  else fireEvent.change(screen.getByLabelText("HR search"), {target: {value: "Synthetic"}});
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain(mode === "results" ? "HR search could not be completely loaded" : "Suggestions are unavailable");
  expect(screen.queryByText("No results found")).toBeNull();
  expect(screen.queryByText("0")).toBeNull();
});
