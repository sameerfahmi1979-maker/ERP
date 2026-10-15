// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import {ReadError} from "@/lib/reads/client";
import {PAYROLL_INQUIRY_KINDS, PAYROLL_INQUIRY_CONFIG, payrollInquiryIdentity, type PayrollInquiryKind, type PayrollInquiryCriteria} from "@/lib/reads/hr-payroll-inquiries-schema";
import {HrSalariesPageClient} from "@/features/hr/payroll/salaries/hr-salaries-page-client";
import {HrWpsPageClient} from "@/features/hr/payroll/wps/hr-wps-page-client";
import {payrollInquiryContext as context, payrollInquiryPage} from "./hr-payroll-inquiry-fixtures";
const state = vi.hoisted(() => ({read: vi.fn()}));
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: state.read}));
vi.mock("@/hooks/realtime/use-realtime-sync", () => ({useRealtimeSync: () => {}}));
vi.mock("next/navigation", () => ({usePathname: () => "/admin/hr/payroll"}));
const components = {salary: HrSalariesPageClient, wps: HrWpsPageClient};
function page(kind: PayrollInquiryKind, options: {context?: AuthContext; count?: number; seedIdentity?: string; initialReadError?: boolean} = {}) {
  const Component = components[kind];
  return <Component authContext={options.context ?? context} initialPage={options.initialReadError ? undefined : payrollInquiryPage({kind}, {count: options.count ?? 1107})} initialReadIdentity={options.seedIdentity ?? payrollInquiryIdentity(context)} initialUpdatedAt={Date.now()} initialReadError={options.initialReadError} />;
}
const clients: QueryClient[] = [];
function mount(node: React.ReactNode) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const wrap = (child: React.ReactNode) => <QueryClientProvider client={client}><WorkspaceUiMemoryProvider>{child}</WorkspaceUiMemoryProvider></QueryClientProvider>;
  const view = render(wrap(node)); return {...view, client, replace: (child: React.ReactNode) => view.rerender(wrap(child))};
}
const ready = (id = 1) => screen.findByText(`Synthetic payroll employee ${id}`);
const last = () => state.read.mock.calls.at(-1)?.[1] as PayrollInquiryCriteria;
const response = (p: unknown, options: {first?: number; count?: number} = {}) => ({success: true, data: payrollInquiryPage(p, options)});
afterEach(() => {cleanup(); clients.splice(0).forEach(c => c.clear()); state.read.mockReset();});

it.each(PAYROLL_INQUIRY_KINDS)("%s actual screen seeds exactly once and has one server-driven pager", async kind => {
  mount(page(kind)); await ready(); await act(async () => {}); expect(state.read).not.toHaveBeenCalled();
  expect(screen.getByText("1107 matching permitted employees")).toBeTruthy(); expect(screen.getAllByRole("button", {name: "Next"})).toHaveLength(1);
  expect(screen.getByRole("link", {name: "Open employee payroll for Synthetic payroll employee 1"}).getAttribute("href")).toBe("/admin/hr/employees/record/1?section=payroll");
});
it.each(PAYROLL_INQUIRY_KINDS)("%s actual screen reaches later pages and restores workspace criteria", async kind => {
  state.read.mockImplementation((_r, p) => Promise.resolve(response(p))); const view = mount(page(kind)); await ready(); fireEvent.click(screen.getByRole("button", {name: "Next"})); await ready(26);
  expect(last()).toMatchObject({kind, page: 2, pageSize: 25}); expect(screen.queryByText("Synthetic payroll employee 1")).toBeNull();
  view.replace(null); view.replace(page(kind)); await ready(26); expect(state.read).toHaveBeenCalledTimes(1);
});
it.each(PAYROLL_INQUIRY_KINDS)("%s full-result Unicode search hides stale rows and returns beyond-cap employee", async kind => {
  state.read.mockImplementation((_r, p) => Promise.resolve(response(p, {first: 1101, count: 1}))); mount(page(kind)); await ready();
  fireEvent.change(screen.getByPlaceholderText("Search all permitted records…"), {target: {value: "اختبار_%"}});
  expect(screen.queryByText("Synthetic payroll employee 1")).toBeNull(); expect(state.read).not.toHaveBeenCalled(); await ready(1101);
  expect(last()).toMatchObject({kind, search: "اختبار_%", page: 1}); expect(state.read).toHaveBeenCalledTimes(1);
});
it.each(PAYROLL_INQUIRY_KINDS)("%s employee search is separate server criteria and combines with status", async kind => {
  state.read.mockImplementation((_r, p) => Promise.resolve(response(p, {first: 1102, count: 1}))); mount(page(kind)); await ready();
  fireEvent.change(screen.getByLabelText("Search employee"), {target: {value: "PAY-1102"}}); expect(state.read).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", {name: "Find employee"})); await ready(1102);
  expect(last()).toMatchObject({employeeSearch: "PAY-1102", search: ""}); fireEvent.change(screen.getByLabelText(kind === "salary" ? "Payroll status" : "WPS status"), {target: {value: "hold"}});
  await waitFor(() => expect(last()).toMatchObject({status: "hold", employeeSearch: "PAY-1102", page: 1}));
});
it("WPS active-hold-only reaches the read contract and resets paging", async () => {
  state.read.mockImplementation((_r, p) => Promise.resolve(response(p))); mount(page("wps")); await ready(); fireEvent.click(screen.getByRole("button", {name: "Next"})); await ready(26);
  fireEvent.click(screen.getByRole("checkbox", {name: "Active Payroll Hold Only"})); await ready(); expect(last()).toMatchObject({kind: "wps", activeHoldOnly: true, page: 1});
});
it.each(PAYROLL_INQUIRY_KINDS)("%s exposes each full-result filter even for an empty page", async kind => {
  state.read.mockImplementation((_r, p) => Promise.resolve(response(p, {count: 0}))); mount(page(kind, {count: 0}));
  fireEvent.click(screen.getByRole("button", {name: /^Edit filters/})); const dialog = await screen.findByRole("dialog");
  const fields = PAYROLL_INQUIRY_CONFIG[kind].fields;
  for (const f of fields) fireEvent.change(within(dialog).getByLabelText(f.label), {target: {value: "literal_%"}});
  fireEvent.click(within(dialog).getByRole("button", {name: "Apply"})); await waitFor(() => expect(state.read).toHaveBeenCalled());
  expect(last().columnFilters).toEqual(Object.fromEntries(fields.map(f => [f.id, "literal_%"])));
});
for (const kind of PAYROLL_INQUIRY_KINDS) for (const f of PAYROLL_INQUIRY_CONFIG[kind].fields) it(`${kind} ${f.id} delegates both sort directions to the server`, async () => {
  state.read.mockImplementation((_r, p: PayrollInquiryCriteria) => Promise.resolve(response(p, {first: p.sorting[0]?.desc ? 51 : 1, count: 1}))); mount(page(kind, {count: 1})); await ready();
  fireEvent.click(screen.getByRole("button", {name: f.label})); await waitFor(() => expect(state.read).toHaveBeenCalled()); const first = last().sorting[0].desc; expect(last().sorting[0].id).toBe(f.id); await ready(first ? 51 : 1);
  fireEvent.click(screen.getByRole("button", {name: f.label}));
  if (f.id === "full_name_en") {
    // Removing the only sort is represented honestly by []. The native model
    // applies the original default name order with the deterministic ID tie.
    await ready();
  }
  await waitFor(() => expect(state.read.mock.calls.length).toBeGreaterThan(1));
  expect(last().sorting).toEqual(f.id === "full_name_en" ? [] : [{id: f.id, desc: !first}]);
  await ready(first ? 1 : 51);
});
it("Salary remains available without banking; WPS retires data as restricted", async () => {
  const ctx = {...context, permissionCodes: ["hr.payroll.view"], roleAssignments: []}; const view = mount(page("salary", {context: ctx, seedIdentity: payrollInquiryIdentity(ctx), count: 1})); await ready();
  view.replace(page("wps", {context: ctx, seedIdentity: payrollInquiryIdentity(ctx), count: 1})); await screen.findByRole("alert"); expect(screen.queryByText("Synthetic payroll employee 1")).toBeNull(); expect(screen.queryByText("Not Enrolled")).toBeNull(); expect(state.read).not.toHaveBeenCalled();
});
it.each(["profile", "scope", "permission"])("%s identity changes cancel pending reads and retire old seeds/cache", async change => {
  const pending: {p: PayrollInquiryCriteria; signal: AbortSignal; finish: (value: unknown) => void}[] = [];
  state.read.mockImplementation((_r, p, signal) => new Promise(finish => pending.push({p, signal, finish}))); const view = mount(page("salary", {count: 1})); await ready();
  fireEvent.change(screen.getByPlaceholderText("Search all permitted records…"), {target: {value: "Old request"}}); await waitFor(() => expect(pending).toHaveLength(1));
  const changed = change === "profile" ? {...context, profile: {...context.profile!, id: 7, auth_user_id: "new-synthetic"}} : change === "scope" ? {...context, roleAssignments: context.roleAssignments!.map(a => ({...a, branchId: 880202}))} : {...context, permissionCodes: ["hr.payroll.view.self"], roleAssignments: []};
  view.replace(page("salary", {context: changed, count: 1})); await waitFor(() => expect(pending).toHaveLength(2)); expect(pending[0].signal.aborted).toBe(true); expect(screen.queryByText("Synthetic payroll employee 1")).toBeNull();
  await act(async () => pending[0].finish(response(pending[0].p, {first: 91, count: 1}))); expect(screen.queryByText("Synthetic payroll employee 91")).toBeNull();
  await act(async () => pending[1].finish(response(pending[1].p, {first: 51, count: 1}))); await ready(51);
  expect(view.client.getQueryCache().findAll().some(q => q.queryKey.includes(payrollInquiryIdentity(context)))).toBe(false);
});
it("a missing RPC during bootstrap stays unavailable until one explicit manual retry", async () => {
  state.read.mockImplementation((_r, p) => Promise.resolve(response(p, {count: 1}))); mount(page("salary", {initialReadError: true})); await screen.findByRole("alert"); expect(state.read).not.toHaveBeenCalled(); expect(screen.queryByText("0 matching permitted employees")).toBeNull();
  fireEvent.click(screen.getByRole("button", {name: "Retry loading records"})); await ready(); expect(state.read).toHaveBeenCalledTimes(1);
});
it("invalid combined criteria hide old private rows and do not reach transport", async () => {
  mount(page("salary", {count: 1})); await ready();
  fireEvent.click(screen.getByRole("button", {name: /^Edit filters/})); const dialog = await screen.findByRole("dialog");
  for (const f of PAYROLL_INQUIRY_CONFIG.salary.fields) fireEvent.change(within(dialog).getByLabelText(f.label), {target: {value: "😀".repeat(200)}});
  fireEvent.click(within(dialog).getByRole("button", {name: "Apply"})); await screen.findByRole("alert");
  expect(screen.queryByText("Synthetic payroll employee 1")).toBeNull(); expect(state.read).not.toHaveBeenCalled();
  expect(screen.getByRole("button", {name: "Refresh records"}).hasAttribute("disabled")).toBe(true);
});
it("failed refresh masks salary/count, retries once, and permits a manual retry", async () => {
  state.read.mockRejectedValue(new ReadError("Unavailable", 503)); mount(page("salary", {count: 1})); await ready(); fireEvent.click(screen.getByRole("button", {name: "Refresh records"})); await screen.findByRole("alert");
  expect(state.read).toHaveBeenCalledTimes(2); expect(screen.queryByText("Synthetic payroll employee 1")).toBeNull(); expect(screen.queryByText("0 matching permitted employees")).toBeNull();
  state.read.mockImplementation((_r, p) => Promise.resolve(response(p, {first: 51, count: 1}))); fireEvent.click(screen.getByRole("button", {name: "Retry loading records"})); await ready(51); expect(state.read).toHaveBeenCalledTimes(3);
});
it.each([401, 403])("HTTP %s permanently retires this principal's private data without retry", async status => {
  state.read.mockRejectedValue(new ReadError("Restricted", status)); const view = mount(page("wps", {count: 1})); await ready(); fireEvent.click(screen.getByRole("button", {name: "Refresh records"})); await screen.findByRole("alert");
  expect(state.read).toHaveBeenCalledTimes(1); expect(screen.queryByText("Synthetic payroll employee 1")).toBeNull(); expect(screen.queryByRole("button", {name: "Refresh records"})).toBeNull();
  expect(view.client.getQueryCache().findAll().some(q => q.queryKey.includes(payrollInquiryIdentity(context)))).toBe(false);
});
it("an out-of-range result preserves count and returns to the last valid page", async () => {
  state.read.mockImplementation((_r, p) => Promise.resolve(response(p, {count: 1}))); mount(page("salary")); await ready(); fireEvent.click(screen.getByRole("button", {name: "Next"}));
  await waitFor(() => expect(last()).toMatchObject({page: 1})); await ready(); expect(screen.getByText("1 matching permitted employees")).toBeTruthy();
});
it.each(PAYROLL_INQUIRY_KINDS)("%s actual Shift-click retains and changes ordered multi-sort across pages", async kind => {
  state.read.mockImplementation((_r, p) => Promise.resolve(response(p)));
  mount(page(kind)); await ready(); fireEvent.click(screen.getByRole("button", {name: "Next"})); await ready(26);
  const fields = PAYROLL_INQUIRY_CONFIG[kind].fields;
  for (const f of fields.slice(1)) {
    const calls = state.read.mock.calls.length;
    fireEvent.click(screen.getByRole("button", {name: f.label}), {shiftKey: true});
    await waitFor(() => expect(state.read.mock.calls.length).toBe(calls + 1)); await ready();
  }
  expect(last().sorting).toEqual(fields.map(f => ({id: f.id, desc: f.id === "gross_salary" || f.id === "has_active_hold"})));
  expect(last().page).toBe(1);
  fireEvent.click(screen.getByRole("button", {name: "Employee"}), {shiftKey: true});
  await waitFor(() => expect(last().sorting[0]).toEqual({id: "full_name_en", desc: true}));
  expect(last().sorting.slice(1)).toEqual(fields.slice(1).map(f => ({id: f.id, desc: f.id === "gross_salary" || f.id === "has_active_hold"})));
  await ready();
  fireEvent.click(screen.getByRole("button", {name: "Next"})); await ready(26);
  expect(last().sorting).toHaveLength(5); expect(last().page).toBe(2);
});
it.each(PAYROLL_INQUIRY_KINDS)("%s actual global/employee/column inputs retain literal surrounding spaces", async kind => {
  state.read.mockImplementation((_r, p) => Promise.resolve(response(p, {first: 1101, count: 1})));
  mount(page(kind)); await ready();
  fireEvent.change(screen.getByPlaceholderText("Search all permitted records…"), {target: {value: " "}});
  await ready(1101); expect(last().search).toBe(" ");
  fireEvent.change(screen.getByLabelText("Search employee"), {target: {value: " PAY-1101 "}});
  fireEvent.click(screen.getByRole("button", {name: "Find employee"}));
  await waitFor(() => expect(last().employeeSearch).toBe(" PAY-1101 "));
  fireEvent.click(screen.getByRole("button", {name: /^Edit filters/})); const dialog = await screen.findByRole("dialog");
  fireEvent.change(within(dialog).getByLabelText("Employee"), {target: {value: "\u00a0Doe_%\\ "}});
  fireEvent.click(within(dialog).getByRole("button", {name: "Apply"}));
  await waitFor(() => expect(last().columnFilters).toEqual({full_name_en: "\u00a0Doe_%\\ "}));
  expect(last()).toMatchObject({search: " ", employeeSearch: " PAY-1101 "});
});
it.each(PAYROLL_INQUIRY_KINDS)("%s invalid stale debounce cannot issue a request through refresh", async kind => {
  state.read.mockImplementation((_r, p) => Promise.resolve(response(p, {first: 1102, count: 1})));
  mount(page(kind)); await ready(); const input = screen.getByPlaceholderText("Search all permitted records…");
  fireEvent.change(input, {target: {value: "x".repeat(201)}}); await screen.findByRole("alert");
  await act(async () => {await new Promise(resolve => setTimeout(resolve, 280));});
  expect(state.read).not.toHaveBeenCalled(); expect(screen.queryByText("Synthetic payroll employee 1")).toBeNull();
  fireEvent.change(input, {target: {value: " repaired "}});
  const refresh = screen.getByRole("button", {name: "Refresh records"});
  expect(refresh.hasAttribute("disabled")).toBe(true); fireEvent.click(refresh);
  expect(state.read).not.toHaveBeenCalled(); await ready(1102);
  expect(state.read).toHaveBeenCalledTimes(1); expect(last().search).toBe(" repaired ");
});
it("bootstrap manual retry waits for current valid literal criteria, not an invalid old debounce", async () => {
  state.read.mockImplementation((_r, p) => Promise.resolve(response(p, {first: 1103, count: 1})));
  mount(page("salary", {initialReadError: true}));
  const input = screen.getByPlaceholderText("Search all permitted records…");
  fireEvent.change(input, {target: {value: "x".repeat(201)}});
  await act(async () => {await new Promise(resolve => setTimeout(resolve, 280));});
  const retry = screen.getByRole("button", {name: "Retry loading records"});
  expect(retry.hasAttribute("disabled")).toBe(true); fireEvent.click(retry); expect(state.read).not.toHaveBeenCalled();
  fireEvent.change(input, {target: {value: " fresh "}});
  expect(retry.hasAttribute("disabled")).toBe(true); fireEvent.click(retry); expect(state.read).not.toHaveBeenCalled();
  await waitFor(() => expect(screen.getByRole("button", {name: "Retry loading records"}).hasAttribute("disabled")).toBe(false));
  expect(state.read).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", {name: "Retry loading records"}));
  await ready(1103); expect(state.read).toHaveBeenCalledTimes(1); expect(last().search).toBe(" fresh ");
});
it.each(PAYROLL_INQUIRY_KINDS)("%s returning to an evicted first page fetches current data, not the old SSR envelope", async kind => {
  state.read.mockImplementation((_r, p: PayrollInquiryCriteria) => Promise.resolve(response(p, {first: p.page === 1 ? 501 : undefined})));
  const view = mount(page(kind)); await ready(); fireEvent.click(screen.getByRole("button", {name: "Next"})); await ready(26);
  const original = view.client.getQueryCache().findAll().find(q => q.queryKey.includes("counted-page") && JSON.parse(String(q.queryKey.at(-1))).page === 1);
  expect(original).toBeDefined(); act(() => view.client.removeQueries({queryKey: original!.queryKey, exact: true}));
  fireEvent.click(screen.getByRole("button", {name: "Previous"}));
  expect(screen.queryByText("Synthetic payroll employee 1")).toBeNull(); await ready(501);
  expect(state.read).toHaveBeenCalledTimes(2); expect(last().page).toBe(1);
});
it.each(PAYROLL_INQUIRY_KINDS)("%s evicting the active default page cannot hydrate the old SSR data again", async kind => {
  state.read.mockImplementation((_r, p) => Promise.resolve(response(p, {first: 601, count: 1})));
  const view = mount(page(kind, {count: 1})); await ready();
  act(() => view.client.removeQueries({queryKey: ["hr", "payroll", PAYROLL_INQUIRY_CONFIG[kind].prefix]}));
  view.replace(page(kind, {count: 1}));
  expect(screen.queryByText("Synthetic payroll employee 1")).toBeNull(); await ready(601);
  expect(state.read).toHaveBeenCalledTimes(1); expect(last().page).toBe(1);
});
