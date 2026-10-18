// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
const state = vi.hoisted(() => ({read: vi.fn()}));
vi.mock("@/lib/reads/client", async () => ({...await vi.importActual("@/lib/reads/client"), readJson: state.read}));
import {EmployeeOverviewTab} from "@/features/hr/employees/tabs/employee-overview-tab";
import type {EmployeeListRow} from "@/server/actions/hr/employees";
import type {AuthContext} from "@/lib/rbac/check";
import {ReadError} from "@/lib/reads/client";
import {EMPLOYEE_OVERVIEW_SECTIONS, employeeOverviewIdentity, type EmployeeOverview} from "@/lib/reads/employee-overview-schema";
import {employeeOverviewPrefix} from "@/hooks/use-employee-overview";
import {invalidateHrEmployeePayroll, invalidateHrEmployeeBlocks, invalidateHrEmployeeRecruitmentLink} from "@/lib/query/invalidation";

const context = {profile: {id: 6, auth_user_id: "synthetic-one", must_change_password: false}, isAccountActive: true, accountStatus: "active", permissionCodes: ["hr.employees.view"], roleCodes: [], roleAssignments: []} as unknown as AuthContext;
const employee = {id: 7, employee_code: "PERF-7", full_name_en: "Synthetic overview", employee_status: "active"} as EmployeeListRow;
function overview(token = "OVERVIEW_CURRENT", id = 7): EmployeeOverview {
  const empty = {total: 0, active: 0, expiringSoon: 0, expired: 0};
  return {employeeId: id, sections: {
    compliance: {status: "ready", data: {identityDocuments: empty, medicalInsurances: null, dependents: {total: 0, active: 0}, accessCards: empty, trainingCertificates: {total: 0, valid: 0, expiringSoon: 0, expired: 0}, medicalRecords: null, dmsDocuments: {total: 0}}},
    time: {status: "ready", data: {currentShiftAssignment: null, attendanceThisMonthCount: 0, leaveBalanceCount: null, pendingLeaveCount: null, overtimeHoursThisMonth: 0}},
    payroll: {status: "ready", data: {payrollStatus: token, grossSalary: 2214, hasActiveHold: false, wpsStatus: null, wpsReadiness: null, bankingRestricted: true}},
    operations: {status: "ready", data: {currentAssignment: null, activeBlockCount: 0, issuedAssetCount: 0, issuedPpeCount: 0, activeAccommodation: null, readinessCount: 1107, latestReadinessStatus: "ready"}},
    actions: {status: "ready", data: {open_pro_processes: 0, open_hr_actions: 0, performance_reviews: null, open_disciplinary: null, pending_approvals: 0, open_eos_case: false}},
    recruitment: {status: "ready", data: null},
  }};
}
const response = (data = overview()) => ({success: true, data});
const clients: QueryClient[] = [];
function mount(ctx = context) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const ui = (auth: AuthContext, record: EmployeeListRow = employee) => <QueryClientProvider client={client}><EmployeeOverviewTab authContext={auth} employee={record} /></QueryClientProvider>;
  const view = render(ui(ctx)); return {...view, client, replace: (auth: AuthContext, record?: EmployeeListRow) => view.rerender(ui(auth, record)), reopen: () => {view.rerender(<QueryClientProvider client={client}>{null}</QueryClientProvider>); view.rerender(ui(ctx));}};
}
afterEach(() => {cleanup(); clients.splice(0).forEach(client => client.clear()); state.read.mockReset();});

it("six actual cards share one request and reuse a fresh same-identity workspace cache", async () => {
  state.read.mockResolvedValue(response()); const view = mount(); await screen.findByText("OVERVIEW_CURRENT");
  expect(state.read).toHaveBeenCalledTimes(1); expect(state.read.mock.calls[0].slice(0, 2)).toEqual(["employee-overview", {employeeId: 7, sections: [...EMPLOYEE_OVERVIEW_SECTIONS]}]);
  expect(screen.getByText("1107 site(s) tracked")).toBeTruthy(); expect(screen.getByText("No recruitment origin recorded.")).toBeTruthy();
  expect(screen.getAllByText("Restricted").length).toBeGreaterThanOrEqual(6);
  view.reopen(); await screen.findByText("OVERVIEW_CURRENT"); expect(state.read).toHaveBeenCalledTimes(1);
});
it.each(EMPLOYEE_OVERVIEW_SECTIONS)("%s failure is visible and retries only that card", async section => {
  const broken = overview(); broken.sections[section] = {status: "failed"};
  state.read.mockResolvedValueOnce(response(broken)).mockResolvedValueOnce(response({employeeId: 7, sections: {[section]: overview().sections[section]}}));
  mount(); await screen.findByRole("alert"); if (section !== "payroll") expect(screen.getByText("OVERVIEW_CURRENT")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", {name: /^Retry /})); await waitFor(() => expect(screen.queryByRole("alert")).toBeNull());
  expect(state.read).toHaveBeenCalledTimes(2); expect(state.read.mock.calls[1][1]).toEqual({employeeId: 7, sections: [section]});
});
it("actual empty recruitment differs from its visible failed read", async () => {
  const broken = overview(); broken.sections.recruitment = {status: "failed"}; state.read.mockResolvedValue(response(broken)); mount();
  await screen.findByRole("alert"); expect(screen.queryByText("No recruitment origin recorded.")).toBeNull(); expect(screen.getByText("Recruitment Origin")).toBeTruthy();
});
it("a restricted section remains visible as restricted without salary or false zero content", async () => {
  const restricted = overview(); restricted.sections.payroll = {status: "restricted"}; state.read.mockResolvedValue(response(restricted)); mount();
  await screen.findByText("This information is restricted for this employee."); expect(screen.queryByText("OVERVIEW_CURRENT")).toBeNull(); expect(screen.queryByText(/AED 2,214/)).toBeNull();
});
it.each([401, 403])("warm authorization denial %s retires every cached summary without retry", async status => {
  state.read.mockResolvedValueOnce(response()).mockRejectedValue(new ReadError("Denied", status)); const view = mount(); await screen.findByText("OVERVIEW_CURRENT");
  await act(async () => {await view.client.invalidateQueries({queryKey: employeeOverviewPrefix(7)});});
  await waitFor(() => expect(screen.getAllByText("This information is restricted for this employee.")).toHaveLength(6));
  expect(screen.queryByText("OVERVIEW_CURRENT")).toBeNull(); expect(state.read).toHaveBeenCalledTimes(2);
  // Rendering masks data immediately; cache retirement is a post-commit effect.
  // Observe both contracts without assuming a CI runner's React scheduling order.
  await waitFor(() => expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(employeeOverviewIdentity(context)) && q.state.data)).toBe(false));
});
it("account switch aborts the old request and excludes its late result and cache", async () => {
  let finish!: (v: unknown) => void; let oldSignal!: AbortSignal;
  state.read.mockImplementationOnce((_r, _p, signal) => {oldSignal = signal; return new Promise(resolve => {finish = resolve;});}).mockResolvedValue(response(overview("OTHER_ACCOUNT")));
  const view = mount(); await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1));
  const other = {...context, profile: {...context.profile!, id: 8, auth_user_id: "synthetic-two"}};
  view.replace(other); await screen.findByText("OTHER_ACCOUNT"); expect(oldSignal.aborted).toBe(true);
  await act(async () => finish(response(overview("STALE_ACCOUNT")))); expect(screen.queryByText("STALE_ACCOUNT")).toBeNull();
  expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(employeeOverviewIdentity(context)))).toBe(false);
});
it.each(["scope", "suspended", "password"])("%s change masks warm summaries immediately", async mode => {
  state.read.mockResolvedValueOnce(response()).mockImplementation(() => new Promise(() => {})); const view = mount(); await screen.findByText("OVERVIEW_CURRENT");
  const next = mode === "suspended" ? {...context, isAccountActive: false, accountStatus: "suspended"} : mode === "password" ? {...context, profile: {...context.profile!, must_change_password: true}} : {...context, roleAssignments: [{roleId: 10, roleCode: "employee", ownerCompanyId: 2, branchId: 3, permissionCodes: ["hr.employees.view"]}]};
  view.replace(next as AuthContext); expect(screen.queryByText("OVERVIEW_CURRENT")).toBeNull();
  await waitFor(() => expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(employeeOverviewIdentity(context)) && q.state.data)).toBe(false));
});
it("switching employee cannot display a previous employee's totals", async () => {
  state.read.mockResolvedValueOnce(response()).mockResolvedValue(response(overview("EMPLOYEE_EIGHT", 8))); const view = mount(); await screen.findByText("OVERVIEW_CURRENT");
  view.replace(context, {...employee, id: 8}); expect(screen.queryByText("OVERVIEW_CURRENT")).toBeNull(); await screen.findByText("EMPLOYEE_EIGHT");
});
it("whole-request transient errors retry once and never expose stale successful totals", async () => {
  state.read.mockRejectedValue(new Error("offline")); mount(); await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(6)); expect(state.read).toHaveBeenCalledTimes(2);
  state.read.mockResolvedValue(response()); fireEvent.click(screen.getAllByRole("button", {name: /^Retry /})[0]); await screen.findByText("OVERVIEW_CURRENT"); expect(screen.queryByRole("alert")).toBeNull();
});
it.each(["wrong-subject", "missing-section", "malformed"])("%s response fails validation, not a successful empty screen", async mode => {
  const data: unknown = mode === "wrong-subject" ? overview("UNSAFE", 8) : mode === "missing-section" ? {employeeId: 7, sections: {}} : {employeeId: 7, sections: {payroll: {status: "ready", data: {grossSalary: "invalid"}}}};
  state.read.mockResolvedValue(response(data as EmployeeOverview)); mount(); await waitFor(() => expect(screen.getAllByRole("alert")).toHaveLength(6)); expect(screen.queryByText("UNSAFE")).toBeNull();
});
it.each([invalidateHrEmployeePayroll, invalidateHrEmployeeBlocks, invalidateHrEmployeeRecruitmentLink])("existing mutation invalidation refreshes the combined overview", async invalidate => {
  state.read.mockResolvedValueOnce(response()).mockResolvedValue(response(overview("AFTER_MUTATION"))); const view = mount(); await screen.findByText("OVERVIEW_CURRENT");
  act(() => invalidate(view.client, 7)); await screen.findByText("AFTER_MUTATION"); expect(state.read).toHaveBeenCalledTimes(2);
});
it("late section retry cannot overwrite a newer complete refresh", async () => {
  const broken = overview(); broken.sections.payroll = {status: "failed"}; let finish!: (v: unknown) => void;
  state.read.mockResolvedValueOnce(response(broken)).mockImplementationOnce(() => new Promise(r => {finish = r;})).mockResolvedValueOnce(response(overview("NEWER_FULL_REFRESH")));
  const view = mount(); await screen.findByRole("alert"); fireEvent.click(screen.getByRole("button", {name: /^Retry Payroll/}));
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(2)); await act(async () => {await view.client.invalidateQueries({queryKey: employeeOverviewPrefix(7), exact: false});});
  await screen.findByText("NEWER_FULL_REFRESH"); await act(async () => finish(response({employeeId: 7, sections: {payroll: overview("OLD_PARTIAL").sections.payroll}})));
  expect(screen.queryByText("OLD_PARTIAL")).toBeNull(); expect(screen.getByText("NEWER_FULL_REFRESH")).toBeTruthy();
});
it.each([401, 403])("section retry authorization rejection %s masks all cards and purges the identity", async status => {
  const broken = overview(); broken.sections.recruitment = {status: "failed"};
  state.read.mockResolvedValueOnce(response(broken)).mockRejectedValue(new ReadError("Denied", status));
  const view = mount(); await screen.findByText("OVERVIEW_CURRENT");
  fireEvent.click(screen.getByRole("button", {name: /^Retry Recruitment/}));
  await waitFor(() => expect(screen.getAllByText("This information is restricted for this employee.")).toHaveLength(6));
  expect(screen.queryByText("OVERVIEW_CURRENT")).toBeNull(); expect(state.read).toHaveBeenCalledTimes(2);
  await waitFor(() => expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(employeeOverviewIdentity(context)) && q.state.data)).toBe(false));
});
it("an account switch prevents a late partial authorization rejection from locking the new account", async () => {
  const broken = overview(); broken.sections.recruitment = {status: "failed"}; let fail!: (v: unknown) => void;
  state.read.mockResolvedValueOnce(response(broken)).mockImplementationOnce(() => new Promise((_resolve, reject) => {fail = reject;})).mockResolvedValue(response(overview("NEW_ACCOUNT")));
  const view = mount(); await screen.findByText("OVERVIEW_CURRENT"); fireEvent.click(screen.getByRole("button", {name: /^Retry Recruitment/}));
  await waitFor(() => expect(state.read).toHaveBeenCalledTimes(2));
  view.replace({...context, profile: {...context.profile!, id: 8, auth_user_id: "synthetic-two"}});
  await screen.findByText("NEW_ACCOUNT"); await act(async () => fail(new ReadError("Denied", 403)));
  expect(screen.getByText("NEW_ACCOUNT")).toBeTruthy(); expect(screen.queryByText("This information is restricted for this employee.")).toBeNull();
});
