// @vitest-environment jsdom
import "../remediation/f05/setup";
import React, {useLayoutEffect} from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, renderHook, screen, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import {EmployeeTimeTab} from "@/features/hr/employees/tabs/employee-time-tab";
import {useHrTimeRecords} from "@/hooks/use-hr-time-records";
import {ReadError} from "@/lib/reads/client";
import {timeFixture, timeFixtureReply, timeKinds, type TimeFixtureKind} from "./fixtures/time-record-fixture";

const state = vi.hoisted(() => ({read: vi.fn(), list: vi.fn(), mutate: vi.fn(), failed: false, error: vi.fn(), success: vi.fn(), submits: new Map<string, (() => unknown) | undefined>()}));
vi.mock("@/components/erp/erp-child-dialog-form", async original => {
  const actual = await original<typeof import("@/components/erp/erp-child-dialog-form")>();
  return {...actual, ERPChildDialogForm: (props: React.ComponentProps<typeof actual.ERPChildDialogForm>) => {
    state.submits.set(props.title, props.onSubmit); return <actual.ERPChildDialogForm {...props} />;
  }};
});
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: state.read}));
vi.mock("sonner", () => ({toast: {error: state.error, success: state.success}}));
vi.mock("@/server/actions/hr/time", () => Object.fromEntries([
  "listEmployeeAttendanceDailySummary", "listEmployeeAttendancePunches", "listAttendanceCorrections", "listEmployeeShiftAssignments", "listEmployeeLeaveRequests", "listEmployeeLeaveBalances", "listEmployeeOvertimeRecords", "listActiveLeaveTypesForForm", "listWorkShiftsForTimeTab",
  "approveAttendanceDailySummary", "queryAttendanceDailySummary", "createOrUpdateAttendanceDailySummary", "createEmployeeAttendancePunch", "correctAttendanceDailySummary", "createEmployeeShiftAssignment", "updateEmployeeShiftAssignment", "archiveEmployeeShiftAssignment",
  "createLeaveRequest", "approveLeaveRequest", "rejectLeaveRequest", "cancelLeaveRequest", "createOrUpdateLeaveBalance", "createOvertimeRecord", "updateOvertimeRecord", "approveOvertimeRecord", "rejectOvertimeRecord", "archiveOvertimeRecord",
].map(name => [name, (...args: unknown[]) => name.startsWith("list") ? state.list(name, args) : state.mutate(name, args)])));
vi.mock("@/lib/reads/hr-time-choice-client", () => ({getWorkCalendarComboboxOptions: async () => ({success: true, data: [{value: 1, label: "Synthetic calendar"}]}),
  listWorkShiftsForTimeTab: (...args: unknown[]) => state.list("listWorkShiftsForTimeTab",args),listActiveLeaveTypesForForm: (...args: unknown[]) => state.list("listActiveLeaveTypesForForm",args)}));

const auth = {profile: {id: 7, auth_user_id: "time-synthetic-a", must_change_password: false}, accountStatus: "active", isAccountActive: true,
  permissionCodes: ["hr.employees.view", "hr.attendance.view", "hr.attendance.manage", "hr.leave.view", "hr.leave.manage"], roleCodes: [], roleAssignments: []} as unknown as AuthContext;
const clients: QueryClient[] = [];
const legacyKinds: Record<string, TimeFixtureKind> = {listEmployeeAttendanceDailySummary: "daily", listEmployeeAttendancePunches: "punches", listAttendanceCorrections: "corrections",
  listEmployeeShiftAssignments: "shifts", listEmployeeLeaveRequests: "leave", listEmployeeLeaveBalances: "balances", listEmployeeOvertimeRecords: "overtime"};
beforeEach(() => {
  state.failed = false;
  state.list.mockImplementation(async (name: string) => {
    if (state.failed) return {success: false, error: "Synthetic read unavailable"};
    if (name === "listWorkShiftsForTimeTab") return {success: true, data: [{id: 1, shift_name: "Synthetic shift", shift_code: "SYNTH", calendar_id: 1}]};
    const rows = name === "listActiveLeaveTypesForForm" ? [{id: 1, name_en: "Synthetic leave", code: "SYNTH"}] : [timeFixture(legacyKinds[name])];
    return {success: true, data: {data: rows, count: rows.length}};
  });
  state.read.mockImplementation(async (_resource: string, input: Record<string, unknown>) => {
    if (state.failed) throw new ReadError("Synthetic read unavailable", 503);
    return timeFixtureReply(input);
  });
  state.mutate.mockResolvedValue({success: true, data: {id: 17}});
});
afterEach(() => {cleanup(); clients.splice(0).forEach(client => client.clear()); state.submits.clear(); for (const fn of [state.read, state.list, state.mutate, state.error, state.success]) fn.mockReset();});
function mount(context = auth, employeeId = 7) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const tree = (ctx: AuthContext, id: number) => <QueryClientProvider client={client}><WorkspaceUiMemoryProvider><EmployeeTimeTab employeeId={id} authContext={ctx} /></WorkspaceUiMemoryProvider></QueryClientProvider>;
  const view = render(tree(context, employeeId));
  return {...view, client, replace: (ctx: AuthContext, id = employeeId) => view.rerender(tree(ctx, id))};
}
function section(label: string) {return screen.getByRole("heading", {name: label}).closest("section") as HTMLElement;}
async function editDaily() {
  await screen.findByText("Synthetic shift");
  fireEvent.click(within(section("Attendance")).getByRole("button", {name: "Edit record"}));
  return screen.findByRole("dialog", {name: "Edit Daily Attendance"});
}
async function ready() {await screen.findByText("Synthetic shift"); await waitFor(() => expect((within(section("Attendance")).getByRole("button", {name: "Daily Summary"}) as HTMLButtonElement).disabled).toBe(false));}
async function closeDialog(dialog: HTMLElement, dirty = true) {
  fireEvent.click(within(dialog).getByRole("button", {name: "Cancel"}));
  if (dirty) fireEvent.click(await screen.findByRole("button", {name: "Discard changes"}));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
}
it("uses a counted employee-bound read page instead of fixed first-page actions", async () => {
  mount(); await screen.findByText("Synthetic shift");
  expect(state.read.mock.calls.some(([resource, p]) => resource === "hr-time-records" && p.kind === "daily" && p.employeeId === 7 && p.pageSize === 25)).toBe(true);
  expect(state.list.mock.calls.filter(([name]) => name in legacyKinds)).toEqual([]);
});
it("requests full selected daily detail before admitting the actual edit form", async () => {
  mount(); const dialog = await editDaily();
  expect(state.read.mock.calls.filter(([, p]) => p.operation === "detail" && p.kind === "daily" && p.recordId === 17)).toHaveLength(1);
  expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("INITIAL_PRIVATE_NOTE");
});
it("retains an open draft but blocks portaled dispatch after an ordinary read failure", async () => {
  const {client} = mount(); const dialog = await editDaily();
  fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "UNSAVED_TIME_DRAFT"}});
  state.failed = true;
  await act(async () => {await client.invalidateQueries({predicate: query => query.queryKey[0] === "hr"});});
  await waitFor(() => expect(client.getQueryCache().getAll().some(query => query.state.status === "error")).toBe(true));
  expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("UNSAVED_TIME_DRAFT");
  fireEvent.click(within(dialog).getByRole("button", {name: /^Save/}));
  expect(state.mutate).not.toHaveBeenCalled();
  expect(within(dialog).getByRole("button", {name: /Retry.*checks/})).toBeTruthy();
});
it("preserves the permitted daily save action and payload", async () => {
  mount(); const dialog = await editDaily();
  fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "Synthetic changed note"}});
  fireEvent.click(within(dialog).getByRole("button", {name: /^Save/}));
  await waitFor(() => expect(state.mutate).toHaveBeenCalledWith("createOrUpdateAttendanceDailySummary", [7, expect.objectContaining({attendance_date: "2026-10-04", notes: "Synthetic changed note"})]));
});
it.each(["self", "team"])("lets the existing %s read hint request authoritative employee access without granting management", async suffix => {
  mount({...auth, permissionCodes: [`hr.employees.view.${suffix}`, `hr.attendance.view.${suffix}`, `hr.leave.view.${suffix}`]});
  await waitFor(() => expect(state.read.mock.calls.some(([, p]) => p.kind === "daily" && p.employeeId === 7)).toBe(true));
  expect(screen.queryByRole("button", {name: "Daily Summary"})).toBeNull();
  expect(state.mutate).not.toHaveBeenCalled();
});

it("a retained create callback cannot dispatch into a closed and reopened daily dialog", async () => {
  mount(); await screen.findByText("Synthetic shift");
  const add = within(section("Attendance")).getByRole("button", {name: "Daily Summary"});
  await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(add);
  let dialog = await screen.findByRole("dialog", {name: "Add Daily Attendance"});
  fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "RETIRED_OLD_CREATE_DRAFT"}});
  const oldSubmit = state.submits.get("Add Daily Attendance")!;
  fireEvent.click(within(dialog).getByRole("button", {name: "Cancel"}));
  fireEvent.click(await screen.findByRole("button", {name: "Discard changes"}));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  fireEvent.click(add); dialog = await screen.findByRole("dialog", {name: "Add Daily Attendance"});
  fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "NEW_CREATE_DRAFT"}});
  await act(async () => {await oldSubmit();});
  expect(state.mutate).not.toHaveBeenCalled();
  expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("NEW_CREATE_DRAFT");
});

it("an already-dispatched daily save keeps the actual guarded single-dispatch behavior", async () => {
  let finish!: (value: unknown) => void;
  state.mutate.mockImplementation(() => new Promise(resolve => {finish = resolve;}));
  mount(); const first = await editDaily();
  await act(async () => {void state.submits.get("Edit Daily Attendance")!();});
  await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1));
  // Simulates a parent-owned dialog closure while the action remains pending.
  // The real wrapper disables its Cancel button during dispatch.
  fireEvent.keyDown(first, {key: "Escape"});
  // This control records the existing guarded wrapper's in-flight behavior;
  // it must not permit a second request or claim the first was canceled.
  await act(async () => {finish({success: true, data: {id: 17}});});
  await waitFor(() => expect(state.success).toHaveBeenCalledWith("Attendance updated"));
  expect(state.mutate).toHaveBeenCalledTimes(1);
});

function mountRead() {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  const wrapper = ({children}: {children: React.ReactNode}) => <QueryClientProvider client={client}><WorkspaceUiMemoryProvider>{children}</WorkspaceUiMemoryProvider></QueryClientProvider>;
  const hook = renderHook(({id, enabled}) => useHrTimeRecords("daily", id, auth, vi.fn(), {enabled}), {wrapper, initialProps: {id: 7, enabled: true}});
  return {...hook, client};
}
it.each(["owner-return", "enabled-return"])("old read/detail/refresh callbacks cannot regain authority after %s", async mode => {
  const hook = mountRead(); await waitFor(() => expect(hook.result.current.rows.length).toBe(1));
  await act(async () => {await hook.result.current.loadDetail(17);});
  await waitFor(() => expect(hook.result.current.detailQuery.isSuccess).toBe(true));
  const old = hook.result.current;
  hook.rerender(mode === "owner-return" ? {id: 8, enabled: true} : {id: 7, enabled: false});
  if (mode === "owner-return") await waitFor(() => expect(hook.result.current.rows[0]?.employee_id).toBe(8));
  hook.rerender({id: 7, enabled: true}); await waitFor(() => expect(hook.result.current.rows.length).toBe(1));
  const before = state.read.mock.calls.length;
  await act(async () => {await old.query.refetch(); await old.detailQuery.refetch(); await old.refresh(); await old.loadDetail(17); old.closeDetail();});
  expect(state.read.mock.calls.length).toBe(before);
  expect(old.isRowCurrent(17)).toBe(false); expect(old.isDetailCurrent(17)).toBe(false);
});
it("parent layout-before-passive unmount cannot dispatch a retired read callback", async () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
  let retired: ReturnType<typeof useHrTimeRecords<"daily">> | undefined;
  function Child() {retired = useHrTimeRecords("daily", 7, auth, () => {}); return null;}
  function Parent({show}: {show: boolean}) {
    useLayoutEffect(() => {if (!show) {void retired?.query.refetch(); void retired?.refresh(); void retired?.loadDetail(17);}}, [show]);
    return show ? <Child /> : null;
  }
  const tree = (show: boolean) => <QueryClientProvider client={client}><WorkspaceUiMemoryProvider><Parent show={show} /></WorkspaceUiMemoryProvider></QueryClientProvider>;
  const view = render(tree(true)); await waitFor(() => expect(retired?.rows.length).toBe(1)); const before = state.read.mock.calls.length;
  view.rerender(tree(false)); await act(async () => {});
  expect(state.read.mock.calls.length).toBe(before);
  expect(client.getQueryCache().findAll({queryKey: ["hr", "time-records", 7]})).toEqual([]);
});

const portals = [
  {kind: "daily", section: "Attendance", button: "Edit record", title: "Edit Daily Attendance", field: "Notes", action: "createOrUpdateAttendanceDailySummary"},
  {kind: "daily", section: "Attendance", button: "Correct", title: "Record Attendance Correction", field: "Correction Reason", action: "correctAttendanceDailySummary"},
  {kind: "daily", section: "Attendance", button: "Query", title: "Query attendance record", field: "Reason", action: "queryAttendanceDailySummary"},
  {kind: "shifts", section: "Shift & Calendar", button: "Edit record", title: "Edit Shift Assignment", field: "Notes", action: "updateEmployeeShiftAssignment"},
  {kind: "leave", section: "Leave Requests & Balances", button: "Reject", title: "Reject Leave Request", field: "Reason", action: "rejectLeaveRequest"},
  {kind: "leave", section: "Leave Requests & Balances", button: "Cancel", title: "Cancel Leave Request", field: "Reason", action: "cancelLeaveRequest"},
  {kind: "overtime", section: "Overtime", button: "Edit record", title: "Edit Overtime", field: "Notes", action: "updateOvertimeRecord"},
  {kind: "overtime", section: "Overtime", button: "Reject", title: "Reject Overtime Record", field: "Reason", action: "rejectOvertimeRecord"},
] as const;
async function openPortal(test: typeof portals[number]) {
  await ready(); const button = within(section(test.section)).getByRole("button", {name: test.button});
  await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(button);
  const dialog = await screen.findByRole("dialog", {name: test.title});
  await waitFor(() => expect(within(dialog).queryByRole("button", {name: /Retry required checks/})).toBeNull()); return dialog;
}
it.each(portals)("$title verifies selected detail, pauses actual portal and retained callback on 503, then retries without discarding", async test => {
  const {client} = mount(); const dialog = await openPortal(test);
  expect(state.read.mock.calls.filter(([, p]) => p.operation === "detail" && p.kind === test.kind)).toHaveLength(1);
  fireEvent.change(within(dialog).getByLabelText(test.field), {target: {value: "PRESERVED_DIALOG_ENTRY"}});
  const submit = state.submits.get(test.title)!; state.failed = true;
  await act(async () => {await client.invalidateQueries({queryKey: ["hr", "time-records", 7, test.kind]});});
  const retry = await within(dialog).findByRole("button", {name: "Retry required checks"});
  await act(async () => {await submit();}); expect(state.mutate).not.toHaveBeenCalled();
  expect((within(dialog).getByLabelText(test.field) as HTMLInputElement).value).toBe("PRESERVED_DIALOG_ENTRY");
  state.failed = false; fireEvent.click(retry);
  await waitFor(() => expect(within(dialog).queryByRole("button", {name: /Retry required checks|Retrying required checks/})).toBeNull());
  await act(async () => {await state.submits.get(test.title)!();});
  await waitFor(() => expect(state.mutate).toHaveBeenCalledTimes(1)); expect(state.mutate.mock.calls[0][0]).toBe(test.action);
});
it.each(portals.filter(test => test.button === "Edit record"))("$title retires an unavailable selected child but preserves the permitted employee page", async test => {
  const {client} = mount(); const dialog = await openPortal(test);
  fireEvent.change(within(dialog).getByLabelText(test.field), {target: {value: "PRIVATE_RETIRED_CHILD"}}); const submit = state.submits.get(test.title)!;
  state.read.mockImplementation(async (_resource: string, input: Record<string, unknown>) => input.kind === test.kind && input.operation === "detail"
    ? {success: true, data: {operation: "detail", kind: test.kind, employeeId: 7, recordId: 17, availability: "unavailable"}} : timeFixtureReply(input));
  await act(async () => {await client.invalidateQueries({queryKey: ["hr", "time-records", 7, test.kind]});});
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByRole("heading", {name: "Attendance"})).toBeTruthy(); expect(screen.queryByText(/do not have permission to view time/)).toBeNull();
  await act(async () => {await submit();}); expect(state.mutate).not.toHaveBeenCalled();
  expect(JSON.stringify(client.getQueryCache().getAll().map(q => q.state.data))).not.toContain("PRIVATE_RETIRED_CHILD");
});
it.each([401, 403])("terminal %i retires the whole actual Time owner and its open private draft", async status => {
  const {client} = mount(); const dialog = await editDaily(); fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "PRIVATE_DENIED_NOTE"}});
  const submit = state.submits.get("Edit Daily Attendance")!;
  state.read.mockRejectedValue(new ReadError("Synthetic denied", status));
  await act(async () => {await client.invalidateQueries({queryKey: ["hr", "time-records", 7, "daily"]});});
  await screen.findByText("You do not have permission to view time records.");
  expect(screen.queryByRole("dialog")).toBeNull(); await act(async () => {await submit();}); expect(state.mutate).not.toHaveBeenCalled();
  expect(client.getQueryCache().findAll({queryKey: ["hr", "time-records", 7]})).toEqual([]);
});
it("same-owner manage-only loss preserves a readable draft but prevents a retained submit", async () => {
  const {client} = mount(); const dialog = await editDaily(); fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "READABLE_DRAFT"}});
  const submit = state.submits.get("Edit Daily Attendance")!;
  state.read.mockImplementation(async (_resource: string, input: Record<string, unknown>) => timeFixtureReply(input, undefined, {canManage: false}));
  await act(async () => {await client.invalidateQueries({queryKey: ["hr", "time-records", 7, "daily"]});});
  await waitFor(() => expect(within(dialog).getByRole("button", {name: "Retry required checks"})).toBeTruthy());
  expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("READABLE_DRAFT");
  await act(async () => {await submit();}); expect(state.mutate).not.toHaveBeenCalled(); await closeDialog(dialog);
});
it.each(["account", "permissions", "employee"])("a changed %s retires private Time data and prior dialog callbacks", async change => {
  const mounted = mount(); const dialog = await editDaily(); fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "OLD_OWNER_DRAFT"}});
  const submit = state.submits.get("Edit Daily Attendance")!, beforeKeys = mounted.client.getQueryCache().findAll({queryKey: ["hr", "time-records", 7]}).map(q => q.queryKey);
  mounted.replace(change === "account" ? {...auth, profile: {...auth.profile!, id: 8, auth_user_id: "time-synthetic-b"}} : change === "permissions" ? {...auth, permissionCodes: ["hr.attendance.view"]} : auth, change === "employee" ? 8 : 7);
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); await act(async () => {await submit();}); expect(state.mutate).not.toHaveBeenCalled();
  expect(beforeKeys.every(key => mounted.client.getQueryState(key) === undefined)).toBe(true);
  expect(document.body.textContent).not.toContain("OLD_OWNER_DRAFT");
});
it("lookup failure inside an open shift dialog pauses dispatch and Cancel remains usable", async () => {
  mount(); const dialog = await openPortal(portals[3]); fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "SHIFT_DRAFT"}});
  const submit = state.submits.get("Edit Shift Assignment")!; state.failed = true;
  await act(async () => {await clients.at(-1)!.invalidateQueries({queryKey: ["hr", "time-records-options"]});});
  await within(dialog).findByRole("button", {name: "Retry required checks"}); await act(async () => {await submit();});
  expect(state.mutate).not.toHaveBeenCalled(); await closeDialog(dialog);
});
it("all six tables and current-year balances use real page controls beyond their old caps", async () => {
  state.read.mockImplementation(async (_resource: string, input: Record<string, unknown>) => timeFixtureReply(input, Array.from({length: 61}, (_, index) => timeFixture(input.kind as TimeFixtureKind, index + 1, 7))));
  mount(); await waitFor(() => expect(screen.getAllByText("Synthetic shift")).toHaveLength(25));
  // Enable the two optional collections, then use their actual table controls.
  fireEvent.click(within(section("Attendance")).getByRole("button", {name: /Show Raw Punches/}));
  fireEvent.click(within(section("Attendance")).getAllByRole("button", {name: "Show correction history"})[16]);
  await waitFor(() => expect(state.read.mock.calls.some(([, p]) => p.kind === "corrections" && p.summaryId === 17)).toBe(true));
  await waitFor(() => expect(screen.getAllByRole("button", {name: "Next"}).length).toBe(6));
  for (const button of screen.getAllByRole("button", {name: "Next"})) {await waitFor(() => expect((button as HTMLButtonElement).disabled).toBe(false)); fireEvent.click(button);}
  fireEvent.click(screen.getByRole("button", {name: "Next balances"}));
  await waitFor(() => {for (const kind of timeKinds) expect(state.read.mock.calls.some(([, p]) => p.kind === kind && p.page === 2 && p.pageSize === 25)).toBe(true);});
  expect(state.mutate).not.toHaveBeenCalled(); expect(state.list.mock.calls.filter(([name]) => name in legacyKinds)).toEqual([]);
}, 15000); // Seven rendered collections; bounded integration budget, not an API timeout.
it("invalid search remains correctable and cannot escape via manual retry", async () => {
  const hook = mountRead(); await waitFor(() => expect(hook.result.current.rows.length).toBe(1));
  act(() => hook.result.current.serverRead.onGlobalFilterChange("x".repeat(201)));
  await waitFor(() => expect(hook.result.current.invalid).toBe(true)); const before = state.read.mock.calls.length;
  await act(async () => {await hook.result.current.query.refetch();}); expect(state.read.mock.calls.length).toBe(before);
  act(() => hook.result.current.serverRead.onGlobalFilterChange("pending"));
  await waitFor(() => expect(state.read.mock.calls.some(([, p]) => p.search === "pending")).toBe(true));
});
it("approved overtime indicator states that it describes only the visible page", async () => {
  state.read.mockImplementation(async (_resource: string, input: Record<string, unknown>) => timeFixtureReply(input, [{...timeFixture(input.kind as TimeFixtureKind), ...(input.kind === "overtime" ? {approval_status: "approved", hours: 2} : {})}]));
  mount(); await screen.findByText(/Approved on this page:/); expect(screen.queryByText(/^\(Approved:/)).toBeNull();
});
it("actual Shift-sort preserves ordered priorities and returns pagination to page one", async () => {
  mount(); await ready(); const root = section("Attendance");
  fireEvent.click(within(root).getByRole("button", {name: "Attendance Date"}));
  await waitFor(() => expect(state.read.mock.calls.filter(([, p]) => p.kind === "daily").at(-1)?.[1].sorting).toEqual([{id: "attendance_date", desc: false}]));
  await waitFor(() => expect((within(root).getByRole("button", {name: "Daily Summary"}) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(within(root).getByRole("button", {name: "Approval Status"}), {shiftKey: true});
  await waitFor(() => expect(state.read.mock.calls.filter(([, p]) => p.kind === "daily").at(-1)?.[1]).toMatchObject({page: 1, sorting: [{id: "attendance_date", desc: false}, {id: "approval_status", desc: false}]}));
});
it("a canceled old search reply cannot replace current rows", async () => {
  let finish!: (result: unknown) => void, oldSignal: AbortSignal | undefined;
  state.read.mockImplementation(async (_resource: string, input: Record<string, unknown>, signal: AbortSignal) => {
    if (input.kind === "daily" && input.search === "OLDER") {oldSignal = signal; return new Promise(resolve => {finish = resolve;});}
    return timeFixtureReply(input, [{...timeFixture(input.kind as TimeFixtureKind, input.search === "NEWER" ? 19 : 17), attendance_type: input.search === "NEWER" ? "office" : "site"}]);
  });
  mount(); await ready(); const input = within(section("Attendance")).getByLabelText("Search all permitted records…");
  fireEvent.change(input, {target: {value: "OLDER"}}); await waitFor(() => expect(oldSignal).toBeTruthy());
  fireEvent.change(input, {target: {value: "NEWER"}}); await waitFor(() => expect(within(section("Attendance")).getByText("Office")).toBeTruthy());
  expect(oldSignal?.aborted).toBe(true);
  await act(async () => {finish(timeFixtureReply({operation: "page", kind: "daily", employeeId: 7, page: 1, pageSize: 25}, [{...timeFixture("daily"), attendance_type: "RETIRED_LATE_ROW"}]));});
  expect(document.body.textContent).not.toContain("RETIRED_LATE_ROW");
});
it("an old selected-detail close and retry cannot replace a newer opening", async () => {
  const hook = mountRead(); await waitFor(() => expect(hook.result.current.rows.length).toBe(1));
  await act(async () => {await hook.result.current.loadDetail(17);}); await waitFor(() => expect(hook.result.current.detailQuery.isSuccess).toBe(true));
  const old = hook.result.current; act(() => old.closeDetail());
  await act(async () => {await hook.result.current.loadDetail(17);}); await waitFor(() => expect(hook.result.current.isDetailCurrent(17)).toBe(true));
  const before = state.read.mock.calls.length;
  await act(async () => {old.closeDetail(); await old.detailQuery.refetch();});
  expect(state.read.mock.calls.length).toBe(before); expect(hook.result.current.isDetailCurrent(17)).toBe(true); expect(old.isDetailCurrent(17)).toBe(false);
});
it("an unavailable correction parent can be closed without denying the whole employee", async () => {
  state.read.mockImplementation(async (_resource: string, input: Record<string, unknown>) => input.kind === "corrections"
    ? {success: true, data: {operation: "page", kind: "corrections", employeeId: 7, summaryId: 17, availability: "unavailable"}} : timeFixtureReply(input));
  mount(); await ready(); fireEvent.click(within(section("Attendance")).getByRole("button", {name: "Show correction history"}));
  await screen.findByText(/selected attendance record is no longer available/);
  expect(screen.queryByText(/do not have permission to view time/)).toBeNull();
  fireEvent.click(screen.getByRole("button", {name: "Close history"}));
  await waitFor(() => expect((within(section("Attendance")).getByRole("button", {name: "Daily Summary"}) as HTMLButtonElement).disabled).toBe(false));
  expect(state.mutate).not.toHaveBeenCalled();
});
it.each(["rejected", "thrown"])("a %s business save retains the existing draft and does not invent confirmed success", async mode => {
  if (mode === "rejected") state.mutate.mockResolvedValue({success: false, error: "Synthetic rejected save"});
  else state.mutate.mockRejectedValue(new Error("Synthetic response lost"));
  mount(); const dialog = await editDaily(); fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "UNCERTAIN_OR_REJECTED_DRAFT"}});
  await act(async () => {await state.submits.get("Edit Daily Attendance")!();});
  await waitFor(() => expect(state.error).toHaveBeenCalled()); expect(state.success).not.toHaveBeenCalled();
  expect((within(dialog).getByLabelText("Notes") as HTMLInputElement).value).toBe("UNCERTAIN_OR_REJECTED_DRAFT");
  if (mode === "thrown") {await act(async () => {await state.submits.get("Edit Daily Attendance")!();}); expect(state.mutate).toHaveBeenCalledTimes(1);}
});
