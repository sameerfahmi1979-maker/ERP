// @vitest-environment jsdom
// Independent review/regression: initial RED receipt and test bytes are retained privately.
// No production calls, mutations, native SQL, or replacements of real controls.
import "../remediation/f05/setup";
import React, {type ReactNode} from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, renderHook, screen, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import {PayrollReadScope, usePayrollRecords} from "@/hooks/use-hr-payroll-records";
import {EmployeePayrollTab} from "@/features/hr/employees/tabs/employee-payroll-tab";
import {PayrollChoicePicker} from "@/features/hr/payroll/payroll-choice-picker";
import {ReadError} from "@/lib/reads/client";
import {payrollChoiceCriteriaSchema, payrollRecordCriteriaSchema, type PayrollChoiceKind, type PayrollRecordKind} from "@/lib/reads/hr-payroll-records-schema";
import {invalidateHrPayrollGroups, invalidateHrSalaryComponentTypes} from "@/lib/query/invalidation";
import type {AuthContext} from "@/lib/rbac/check";
import {redactWpsProfile} from "@/lib/hr/payroll/redaction";
import {payrollProfileFixture, payrollRecordFixture, payrollWpsFixture} from "./hr-payroll-record-fixtures";

const state = vi.hoisted(() => ({transport: vi.fn(), page: vi.fn(), point: vi.fn(), choices: vi.fn(), mutation: vi.fn()}));
vi.mock("next/navigation", () => ({usePathname: () => "/admin/hr/employees/record/880301"}));
vi.mock("sonner", () => ({toast: {success: vi.fn(), error: vi.fn()}}));
vi.mock("@/server/actions/hr/payroll", () => Object.fromEntries([
  "archiveEmployeePayrollHold", "archiveEmployeeSalaryComponent", "createEmployeeSalaryComponent", "createEmployeeSalaryRevision",
  "createOrUpdateEmployeePayrollProfile", "createOrUpdateEmployeeWpsProfile", "placeEmployeePayrollHold", "releaseEmployeePayrollHold", "updateEmployeeSalaryComponent",
].map(name => [name, state.mutation])));
vi.mock("@/components/erp/finance-basics/bank-select", () => ({BankSelect: () => <span>Unrelated bank control</span>}));
vi.mock("@/lib/reads/client", async () => ({...await vi.importActual<typeof import("@/lib/reads/client")>("@/lib/reads/client"),
  readJson: async (resource: string, input: unknown, signal?: AbortSignal) => {
    state.transport(resource, input, signal);
    if (resource === "hr-payroll-records") {
      const safe = payrollRecordCriteriaSchema.safeParse(input);
      if (!safe.success) throw new ReadError("Invalid payroll record criteria", 400);
      const p = safe.data, page = await state.page(p, signal);
      return {success: true, data: {kind: p.kind, employeeId: p.employeeId, page: p.page, pageSize: p.pageSize,
        ...(p.kind === "holds" ? {activeCount: page.totalCount} : {}), ...page}};
    }
    if (resource === "hr-payroll-choices") {
      const safe = payrollChoiceCriteriaSchema.safeParse(input);
      if (!safe.success) throw new ReadError("Invalid payroll choice criteria", 400);
      return {success: true, data: await state.choices(safe.data, signal)};
    }
    const p = input as {kind: string; employeeId: number; recordId?: number};
    return {success: true, data: {kind: p.kind, employeeId: p.employeeId, value: await state.point(p, signal)}};
  },
}));

const employeeId = 880301, invalidSearch = "x".repeat(201);
const permissionCodes = ["hr.payroll.view", "hr.payroll.manage", "hr.banking.view", "hr.banking.manage"];
const context = {profile: {id: 6, auth_user_id: "synthetic-criteria-review", must_change_password: false}, accountStatus: "active", isAccountActive: true,
  permissionCodes, roleCodes: ["hr_scoped"], roleAssignments: [{roleId: 880106, roleCode: "hr_scoped", ownerCompanyId: 880101, branchId: null, permissionCodes}]} as unknown as AuthContext;
const clients: QueryClient[] = [];
const storageDescriptors = Object.fromEntries((["localStorage", "sessionStorage"] as const).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const browserWindow = (globalThis as unknown as {jsdom: {window: {localStorage: Storage; sessionStorage: Storage}}}).jsdom.window;

type RecordInput = {kind: PayrollRecordKind; search: string};
type ChoiceInput = {kind: PayrollChoiceKind; employeeId: number; page: number; pageSize: number; selectedId: number | null; search: string};
const choiceRow = {id: 100, code: "SYNTH", name_en: "Permitted synthetic choice", name_ar: null, is_active: true};
beforeEach(() => {
  for (const key of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, key, {configurable: true, writable: true, value: browserWindow[key]}); browserWindow[key].clear();
  }
  state.page.mockImplementation(async (p: RecordInput) => ({rows: [payrollRecordFixture(p.kind)], totalCount: 1}));
  state.point.mockImplementation(async (p: {kind: string; recordId?: number}) => p.kind === "profile" ? payrollProfileFixture
    : p.kind === "salary-totals" ? {gross: 1234, basic: 1000, activeCount: 1}
      : p.kind === "component-detail" ? payrollRecordFixture("salary-components", p.recordId)
        : {profile: redactWpsProfile(payrollWpsFixture, true), readiness: {status: "ready", missingRequirements: []}});
  state.choices.mockImplementation(async (p: ChoiceInput) => ({kind: p.kind, employeeId: p.employeeId, page: p.page, pageSize: p.pageSize,
    totalCount: 1, rows: [choiceRow], selected: p.selectedId === null ? null : {...choiceRow, id: p.selectedId}}));
  state.mutation.mockImplementation(() => {throw Error("Review must not mutate business data");});
});
afterEach(() => {
  cleanup(); clients.splice(0).forEach(client => client.clear()); Object.values(state).forEach(mock => mock.mockReset());
  for (const key of ["localStorage", "sessionStorage"] as const) {
    const descriptor = storageDescriptors[key]; if (descriptor) Object.defineProperty(globalThis, key, descriptor); else Reflect.deleteProperty(globalThis, key);
  }
});
function client() {const value = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: 60000}}}); clients.push(value); return value;}
function mountPayroll() {
  const qc = client(); render(<QueryClientProvider client={qc}><WorkspaceUiMemoryProvider><EmployeePayrollTab employeeId={employeeId} authContext={context} /></WorkspaceUiMemoryProvider></QueryClientProvider>);
  return qc;
}
const labels: Record<PayrollChoiceKind, string> = {"payroll-groups": "Payroll Group", "salary-component-types": "Component Type", "mohre-establishments": "MOHRE Establishment"};
function mountChoice(kind: PayrollChoiceKind = "payroll-groups") {
  const qc = client(), onReadState = vi.fn();
  render(<QueryClientProvider client={qc}><PayrollReadScope identity="synthetic-criteria-review" onDenied={vi.fn()}>
    <PayrollChoicePicker kind={kind} employeeId={employeeId} value={100} onValueChange={vi.fn()} enabled onReadState={onReadState} ariaLabel={labels[kind]} />
  </PayrollReadScope></QueryClientProvider>);
  return {qc, onReadState};
}
const titles = {"salary-components": "Salary Components", "salary-revisions": "Salary Revision History", holds: "Payroll Holds"};
function section(kind: PayrollRecordKind) {
  const element = screen.getByText(titles[kind]).closest("div.rounded-xl"); if (!element) throw Error("Actual payroll section missing"); return within(element as HTMLElement);
}
const token = (kind: PayrollRecordKind) => kind === "salary-components" ? "Synthetic earning 1" : kind === "salary-revisions" ? "Synthetic revision 1" : "Synthetic hold 1";
const dispatched = (resource: string, kind?: string) => state.transport.mock.calls.filter(c => c[0] === resource && (!kind || c[1]?.kind === kind));
const settle = () => act(async () => {await new Promise(resolve => setTimeout(resolve, 300));});
async function choiceSearch(kind: PayrollChoiceKind) {
  await screen.findByText("1 matching choices · page 1"); fireEvent.click(screen.getByRole("combobox", {name: labels[kind]})); return screen.findByPlaceholderText("Search...");
}

it("CONTROL: actual record search sends valid settled criteria and leaves unrelated lists unchanged", async () => {
  mountPayroll(); await screen.findAllByText(token("holds"));
  fireEvent.change(section("holds").getByPlaceholderText("Search all permitted records…"), {target: {value: "اختبار_%"}});
  await waitFor(() => expect(dispatched("hr-payroll-records", "holds").at(-1)?.[1]).toMatchObject({search: "اختبار_%"}));
  expect(dispatched("hr-payroll-records").every(c => payrollRecordCriteriaSchema.safeParse(c[1]).success)).toBe(true);
  expect(dispatched("hr-payroll-records", "salary-components")).toHaveLength(1); expect(state.mutation).not.toHaveBeenCalled();
});
it.each(["salary-components", "salary-revisions", "holds"] as const)("%s correcting settled invalid search never dispatches that invalid value", async kind => {
  mountPayroll(); await screen.findAllByText(token(kind)); const input = section(kind).getByPlaceholderText("Search all permitted records…");
  fireEvent.change(input, {target: {value: invalidSearch}}); await settle(); expect(dispatched("hr-payroll-records", kind)).toHaveLength(1);
  fireEvent.change(input, {target: {value: "corrected"}});
  await waitFor(() => expect(dispatched("hr-payroll-records", kind).at(-1)?.[1]).toMatchObject({search: "corrected"}));
  expect(dispatched("hr-payroll-records", kind).filter(c => !payrollRecordCriteriaSchema.safeParse(c[1]).success)).toEqual([]);
});
it.each(["payroll-groups", "salary-component-types", "mohre-establishments"] as const)("actual %s picker validates the settled value before dispatch", async kind => {
  mountChoice(kind); const input = await choiceSearch(kind);
  fireEvent.change(input, {target: {value: invalidSearch}}); await settle(); expect(dispatched("hr-payroll-choices", kind)).toHaveLength(1);
  fireEvent.change(input, {target: {value: "corrected"}});
  await waitFor(() => expect(dispatched("hr-payroll-choices", kind).at(-1)?.[1]).toMatchObject({search: "corrected"}));
  expect(dispatched("hr-payroll-choices", kind).filter(c => !payrollChoiceCriteriaSchema.safeParse(c[1]).success)).toEqual([]);
});
it("actual picker Retry refuses invalid or still-changing criteria after a legitimate read failure", async () => {
  mountChoice(); const input = await choiceSearch("payroll-groups");
  state.choices.mockRejectedValue(new ReadError("Controlled valid-request failure", 400));
  fireEvent.change(input, {target: {value: "valid"}});
  await screen.findByRole("button", {name: "Retry payroll group choices"});
  // The real open combobox input stays editable; its current query is errored.
  expect((input as HTMLInputElement).disabled).toBe(false);
  fireEvent.change(input, {target: {value: invalidSearch}});
  expect(screen.getByText("Search is too long. Use at most 200 characters.")).toBeTruthy();
  const before = dispatched("hr-payroll-choices").length;
  fireEvent.click(screen.getByRole("button", {name: "Retry payroll group choices"}));
  await act(async () => {await new Promise(resolve => setTimeout(resolve, 30));});
  expect(dispatched("hr-payroll-choices")).toHaveLength(before);
  fireEvent.change(input, {target: {value: "corrected"}});
  fireEvent.click(screen.getByRole("button", {name: "Retry payroll group choices"}));
  await act(async () => {await new Promise(resolve => setTimeout(resolve, 30));});
  expect(dispatched("hr-payroll-choices")).toHaveLength(before);
  await waitFor(() => expect(dispatched("hr-payroll-choices").at(-1)?.[1]).toMatchObject({search: "corrected"}));
});
it("CONTROL: actual picker valid manual retry recovers without exposing an empty result or mutation", async () => {
  mountChoice(); const input = await choiceSearch("payroll-groups"); state.choices.mockRejectedValue(new ReadError("Controlled read failure", 400));
  fireEvent.change(input, {target: {value: "valid"}}); await screen.findByRole("button", {name: "Retry payroll group choices"});
  expect(screen.queryByText("0 matching choices · page 1")).toBeNull();
  state.choices.mockImplementation(async (p: ChoiceInput) => ({kind: p.kind, employeeId: p.employeeId, page: p.page, pageSize: p.pageSize, totalCount: 1, rows: [choiceRow], selected: choiceRow}));
  fireEvent.click(screen.getByRole("button", {name: "Retry payroll group choices"})); await screen.findByText("1 matching choices · page 1");
  expect(dispatched("hr-payroll-choices").every(c => payrollChoiceCriteriaSchema.safeParse(c[1]).success)).toBe(true); expect(state.mutation).not.toHaveBeenCalled();
});
it("mounted record hook's exported refetch refuses invalid criteria (API contract, not an app-visible retry claim)", async () => {
  const qc = client();
  const wrapper = ({children}: {children: ReactNode}) => <QueryClientProvider client={qc}><WorkspaceUiMemoryProvider><PayrollReadScope identity="synthetic-hook-review" onDenied={vi.fn()}>{children}</PayrollReadScope></WorkspaceUiMemoryProvider></QueryClientProvider>;
  const {result} = renderHook(() => usePayrollRecords("holds", employeeId), {wrapper});
  await waitFor(() => expect(result.current.data?.success).toBe(true));
  act(() => result.current.collection.serverRead.onGlobalFilterChange(invalidSearch)); await settle();
  const before = dispatched("hr-payroll-records").length;
  await act(async () => {await result.current.refetch();});
  expect(dispatched("hr-payroll-records")).toHaveLength(before);
});
it("successful payroll-group catalog changes refresh the mounted employee profile as well as choices", async () => {
  const qc = mountPayroll(); await screen.findByText("Synthetic payroll group");
  state.point.mockImplementation(async (p: {kind: string}) => p.kind === "profile" ? {...payrollProfileFixture, payroll_group: {...payrollProfileFixture.payroll_group, name_en: "Renamed payroll group"}}
    : p.kind === "salary-totals" ? {gross: 1234, basic: 1000, activeCount: 1} : {profile: redactWpsProfile(payrollWpsFixture, true), readiness: {status: "ready", missingRequirements: []}});
  await act(async () => {invalidateHrPayrollGroups(qc); await Promise.resolve();});
  expect(state.point.mock.calls.filter(c => c[0].kind === "profile")).toHaveLength(2);
});
it("successful component-type catalog changes refresh mounted component labels, salary aggregate and WPS point", async () => {
  const qc = mountPayroll(); await screen.findAllByText(token("salary-components")); await screen.findByText("Synthetic bank");
  const before = {records: dispatched("hr-payroll-records", "salary-components").length, totals: state.point.mock.calls.filter(c => c[0].kind === "salary-totals").length, wps: state.point.mock.calls.filter(c => c[0].kind === "wps").length};
  await act(async () => {invalidateHrSalaryComponentTypes(qc); await Promise.resolve();});
  expect.soft(dispatched("hr-payroll-records", "salary-components")).toHaveLength(before.records + 1);
  expect.soft(state.point.mock.calls.filter(c => c[0].kind === "salary-totals")).toHaveLength(before.totals + 1);
  expect.soft(state.point.mock.calls.filter(c => c[0].kind === "wps")).toHaveLength(before.wps + 1);
});
