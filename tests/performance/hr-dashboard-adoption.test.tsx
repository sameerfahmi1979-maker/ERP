// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
const state = vi.hoisted(() => ({read: vi.fn()}));
vi.mock("@/lib/reads/client", async () => ({...await vi.importActual("@/lib/reads/client"), readJson: state.read}));
// Only chart geometry is replaced: jsdom has no layout. Cards, hook, shared
// read boundary, controls and TanStack lifecycle are the actual shipped code.
vi.mock("recharts", () => ({ResponsiveContainer: ({children}: React.PropsWithChildren) => <div>{children}</div>, PieChart: ({children}: React.PropsWithChildren) => <div>{children}</div>, Pie: () => <span>Chart geometry</span>, Cell: () => null}));
import {HrDashboardPageClient, type HrDashboardPermissions} from "@/features/hr/dashboard/hr-dashboard-page-client";
import {HR_DASHBOARD_METRICS, hrDashboardSchema, hrDashboardReadIdentity, type HrDashboard} from "@/lib/reads/hr-dashboard-schema";
import type {AuthContext} from "@/lib/rbac/check";
import {ReadError} from "@/lib/reads/client";
import {invalidateHrDashboard, invalidateHrDashboardSummary} from "@/lib/query/invalidation";
const context = {profile: {id: 6, auth_user_id: "synthetic-one", must_change_password: false}, email: null, isAccountActive: true, accountStatus: "active", roleCodes: [], permissionCodes: ["hr.dashboard.view", "hr.employees.view"], roleAssignments: []} as unknown as AuthContext;
const permissions: HrDashboardPermissions = {canViewEmployees: true, canViewCompliance: true, canViewMedical: true, canViewAttendance: true, canViewLeave: true, canViewPayroll: true, canViewAssignments: true, canViewActions: true, canViewEos: true, canViewRecruitment: true};
function dashboard(token = "CURRENT_CATEGORY"): HrDashboard {
  return hrDashboardSchema.parse({filters: {expiryThresholdDays: 60}, asOf: new Date().toISOString(),
    ...Object.fromEntries(Object.entries(HR_DASHBOARD_METRICS).map(([section, keys]) => [section, Object.fromEntries(keys.map(key => [key, {status: "ready", value: 0}]))])),
    headcount: {status: "ready", items: [{categoryId: 1, categoryName: token, count: 1371}], total: 1371}, attention: {items: [], failedSources: [], availableSources: 6, limited: false}});
}
const reply = (data = dashboard()) => ({success: true, data});
const clients: QueryClient[] = [];
function mount(auth = context, seed?: HrDashboard) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const ui = (ctx: AuthContext, filters = {}, initial = seed) => <QueryClientProvider client={client}><HrDashboardPageClient authContext={ctx} permissions={permissions} initialFilters={filters}
    initialRead={initial ? {identity: hrDashboardReadIdentity(auth), data: initial} : undefined} /></QueryClientProvider>;
  const view = render(ui(auth)); return {...view, client, replace: (ctx: AuthContext, filters = {}) => view.rerender(ui(ctx, filters)), reopen: () => {view.rerender(<QueryClientProvider client={client}>{null}</QueryClientProvider>); view.rerender(ui(auth));}};
}
afterEach(() => {cleanup(); clients.splice(0).forEach(client => client.clear()); state.read.mockReset();});
function row(label: string) {return screen.getByText(label).parentElement!;}
it('saved site checks are labelled historical and never mixed with blocked people into a current deployability percentage',async()=>{
  const data=dashboard();data.operations.ready_employees={status:'ready',value:2};data.operations.not_ready_employees={status:'ready',value:1};data.operations.blocked_employees={status:'ready',value:9};
  state.read.mockResolvedValue(reply(data));mount();await screen.findByText('CURRENT_CATEGORY');
  expect(screen.getByText('Recorded site checks')).toBeTruthy();expect(screen.getByText('67%')).toBeTruthy();
  expect(screen.queryByText('Deployable right now')).toBeNull();expect(screen.getByText(/Saved results, not current clearance/)).toBeTruthy();
  expect(within(row('Saved Ready checks')).getByText('2')).toBeTruthy();expect(within(row('People with active blocks')).getByText('9')).toBeTruthy();
});
it('active blocks without any saved checks never produce an invented saved-readiness percentage',async()=>{
  const data=dashboard();data.operations.blocked_employees={status:'ready',value:9};state.read.mockResolvedValue(reply(data));mount();await screen.findByText('CURRENT_CATEGORY');
  expect(screen.getByText('No saved readiness checks')).toBeTruthy();const ring=screen.getByText('Recorded site checks').parentElement!.parentElement!;expect(within(ring).queryByText('0%')).toBeNull();expect(screen.queryByText('Deployable right now')).toBeNull();
});
it("all real dashboard cards and category widget share one transport and fresh cache on workspace return", async () => {
  state.read.mockResolvedValue(reply()); const view = mount(); await screen.findByText("CURRENT_CATEGORY");
  expect(state.read).toHaveBeenCalledTimes(1); expect(state.read.mock.calls[0].slice(0, 2)).toEqual(["hr-dashboard", {expiryThresholdDays: 60}]);
  for (const title of ["Employee Overview", "Compliance", "Attendance & Leave", "Payroll & WPS", "Operations & Readiness", "HR Actions", "Recruitment & Onboarding", "Headcount by Category", "Attention Required"]) expect(screen.getByText(title)).toBeTruthy();
  expect(screen.getByText("1371")).toBeTruthy(); view.reopen(); await screen.findByText("CURRENT_CATEGORY"); expect(state.read).toHaveBeenCalledTimes(1);
});
it("matching SSR seed paints all cards without an immediate duplicate request", () => {
  mount(context, dashboard("SEEDED_CATEGORY")); expect(screen.getByText("SEEDED_CATEGORY")).toBeTruthy(); expect(state.read).not.toHaveBeenCalled();
});
it.each(["failed", "restricted", "unavailable"] as const)("%s metrics show dashes, no zero substitution or green readiness", async status => {
  const data = dashboard(); const metric = status === "unavailable" ? {status, reason: "scope" as const} : {status};
  data.payroll.wps_ready = metric; data.operations.ready_employees = metric; data.summary.compliance_issues = metric;
  state.read.mockResolvedValue(reply(data)); mount(); await screen.findByText("CURRENT_CATEGORY");
  expect(within(row("WPS ready")).getByText("—")).toBeTruthy(); expect(within(row("Saved Ready checks")).getByText("—")).toBeTruthy();
  expect(screen.getByText("Readiness could not be verified")).toBeTruthy(); expect(within(row("WPS ready")).queryByText("0")).toBeNull();
  if (status === "failed") expect(screen.getByRole("status").textContent).toContain("Some dashboard counts could not be loaded");
});
it("failed attention does not claim All clear, while confirmed empty checks do", async () => {
  const data = dashboard(); data.attention.failedSources = ["compliance"]; state.read.mockResolvedValueOnce(reply(data)).mockResolvedValue(reply()); mount();
  await screen.findByText("CURRENT_CATEGORY"); expect(screen.queryByText("All clear")).toBeNull(); expect(screen.getByText(/Some attention checks failed/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: "Refresh"})); await screen.findByText("All clear"); expect(state.read).toHaveBeenCalledTimes(2);
});
it("no authorized attention sources are restricted, not All clear", async () => {
  const data = dashboard(); data.attention.availableSources = 0; state.read.mockResolvedValue(reply(data)); mount();
  await screen.findByText("Attention checks are restricted by your access."); expect(screen.queryByText("All clear")).toBeNull();
});
it("partial attention shows legitimate items and an explicit limited/failed-source qualifier", async () => {
  const data = dashboard(); data.attention.failedSources = ["recruitment"]; data.attention.limited = true;
  data.attention.items = [{id: "synthetic-1", title: "SYNTHETIC ALERT", severity: "critical", category: "compliance", description: "Synthetic only", linkHref: "/admin/hr/employees/record/1", linkLabel: "View Employee"}];
  state.read.mockResolvedValue(reply(data)); mount(); await screen.findByText("SYNTHETIC ALERT"); expect(screen.getByText(/1 shown · limited priority list/)).toBeTruthy(); expect(screen.queryByText("All clear")).toBeNull();
});
it("category read failure is retryable without false no-active-employees state", async () => {
  const data = dashboard(); data.headcount = {status: "failed"}; state.read.mockResolvedValueOnce(reply(data)).mockResolvedValue(reply()); mount();
  await screen.findByText("Failed to load headcount data"); expect(screen.queryByText("No active employees")).toBeNull(); fireEvent.click(screen.getByRole("button", {name: "Retry headcount"}));
  await screen.findByText("CURRENT_CATEGORY"); expect(state.read).toHaveBeenCalledTimes(2);
});
it("medical undefined metric stays visible with explanation, not an invented expiry count", async () => {
  const data = dashboard(); data.compliance.medical_expired = {status: "unavailable", reason: "definition"}; state.read.mockResolvedValue(reply(data)); mount();
  await screen.findByText(/Medical expiry needs an agreed validity rule/); expect(within(row("Medical records expired")).getByText("—")).toBeTruthy();
});
it.each([401, 403])("warm %s denial clears all cards and exact cached payload without automatic retry", async status => {
  state.read.mockResolvedValueOnce(reply()).mockRejectedValue(new ReadError("Denied", status)); const view = mount(); await screen.findByText("CURRENT_CATEGORY");
  await act(async () => {await view.client.invalidateQueries({queryKey: ["hr", "dashboard"]});});
  await screen.findByRole("alert"); expect(screen.queryByText("CURRENT_CATEGORY")).toBeNull(); expect(screen.queryByText("Total Employees")).toBeNull();
  expect(state.read).toHaveBeenCalledTimes(2); expect(view.client.getQueryCache().getAll().some(q => q.state.data)).toBe(false);
});
it("terminal denial cannot rehydrate a retired SSR seed into the private cache", async () => {
  state.read.mockRejectedValue(new ReadError("Denied", 403)); const view = mount(context, dashboard("RETIRED_SEED")); expect(screen.getByText("RETIRED_SEED")).toBeTruthy();
  await act(async () => {await view.client.invalidateQueries({queryKey: ["hr", "dashboard"]});});
  await screen.findByRole("alert"); expect(screen.queryByText("RETIRED_SEED")).toBeNull();
  expect(view.client.getQueryCache().getAll().some(q => q.state.data)).toBe(false);
});
it("workspace remount after denial re-verifies access instead of displaying the same retired server seed", async () => {
  state.read.mockRejectedValueOnce(new ReadError("Denied", 403)).mockImplementation(() => new Promise(() => {}));
  const view = mount(context, dashboard("RETIRED_SEED"));
  await act(async () => {await view.client.invalidateQueries({queryKey: ["hr", "dashboard"]});}); await screen.findByRole("alert");
  view.reopen(); expect(screen.queryByText("RETIRED_SEED")).toBeNull(); await waitFor(() => expect(state.read).toHaveBeenCalledTimes(2));
});
it("ordinary 503 suppresses previous totals, retries once, and supports a successful retry", async () => {
  state.read.mockResolvedValueOnce(reply()).mockRejectedValue(new ReadError("Temporarily unavailable", 503)); const view = mount(); await screen.findByText("CURRENT_CATEGORY");
  await act(async () => {await view.client.invalidateQueries({queryKey: ["hr", "dashboard"]});});
  await screen.findByRole("alert"); expect(screen.queryByText("CURRENT_CATEGORY")).toBeNull(); expect(state.read).toHaveBeenCalledTimes(3);
  expect(screen.queryByText("No saved readiness checks")).toBeNull(); expect(screen.queryByText("No active employees")).toBeNull(); expect(screen.queryByText("0 shown")).toBeNull();
  state.read.mockResolvedValue(reply(dashboard("RECOVERED_CATEGORY"))); fireEvent.click(screen.getByRole("button", {name: "Retry loading"})); await screen.findByText("RECOVERED_CATEGORY");
});
it.each(["missing-metric", "wrong-filter", "private-field", "bad-total"])("%s DTO cannot become an accepted dashboard", async mode => {
  const data: Record<string, unknown> = {...dashboard()};
  if (mode === "missing-metric") data.employee = {}; if (mode === "wrong-filter") data.filters = {expiryThresholdDays: 1};
  if (mode === "private-field") data.privateSalary = "SYNTHETIC_PRIVATE"; if (mode === "bad-total") data.headcount = {...dashboard().headcount, total: 1};
  state.read.mockResolvedValue({success: true, data}); mount(); await screen.findByRole("alert"); expect(screen.queryByText("CURRENT_CATEGORY")).toBeNull(); expect(state.read).toHaveBeenCalledTimes(2);
});
it("account switch aborts old in-flight read and rejects its late result", async () => {
  let finish!: (value: unknown) => void, signal!: AbortSignal;
  state.read.mockImplementationOnce((_r, _p, s) => {signal = s; return new Promise(resolve => {finish = resolve;});}).mockResolvedValue(reply(dashboard("OTHER_CATEGORY")));
  const view = mount(); await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1));
  const other = {...context, profile: {...context.profile!, id: 7, auth_user_id: "synthetic-two"}}; view.replace(other); await screen.findByText("OTHER_CATEGORY"); expect(signal.aborted).toBe(true);
  await act(async () => finish(reply(dashboard("STALE_CATEGORY")))); expect(screen.queryByText("STALE_CATEGORY")).toBeNull();
  expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(hrDashboardReadIdentity(context)))).toBe(false);
});
it.each(["scope", "suspended", "forced-password"])("%s rotation immediately retires prior warm metrics", async mode => {
  state.read.mockResolvedValueOnce(reply()).mockImplementation(() => new Promise(() => {})); const view = mount(); await screen.findByText("CURRENT_CATEGORY");
  const next = mode === "scope" ? {...context, roleAssignments: [{roleId: 2, roleCode: "synthetic", ownerCompanyId: 2, branchId: 3, permissionCodes: ["hr.dashboard.view"]}]} : mode === "suspended" ? {...context, isAccountActive: false} : {...context, profile: {...context.profile!, must_change_password: true}};
  view.replace(next); expect(screen.queryByText("CURRENT_CATEGORY")).toBeNull();
  await waitFor(() => expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(hrDashboardReadIdentity(context)) && q.state.data)).toBe(false));
});
it.each([invalidateHrDashboard, invalidateHrDashboardSummary])("existing dashboard invalidation refreshes composite cards once", async invalidate => {
  state.read.mockResolvedValueOnce(reply()).mockResolvedValue(reply(dashboard("AFTER_MUTATION_CATEGORY"))); const view = mount(); await screen.findByText("CURRENT_CATEGORY");
  act(() => invalidate(view.client)); await screen.findByText("AFTER_MUTATION_CATEGORY"); expect(state.read).toHaveBeenCalledTimes(2);
});
it("repeated Refresh while pending coalesces into a single read and hides stale cards", async () => {
  let finish!: (value: unknown) => void;
  state.read.mockResolvedValueOnce(reply()).mockImplementationOnce(() => new Promise(resolve => {finish = resolve;})); mount(); await screen.findByText("CURRENT_CATEGORY");
  const refresh = screen.getByRole("button", {name: "Refresh"}); fireEvent.click(refresh); fireEvent.click(refresh);
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(2)); expect(screen.queryByText("CURRENT_CATEGORY")).toBeNull(); expect((screen.getByRole("button", {name: "Refreshing…"}) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => finish(reply(dashboard("REFRESHED_CATEGORY")))); await screen.findByText("REFRESHED_CATEGORY");
});
