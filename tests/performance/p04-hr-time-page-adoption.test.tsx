// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import {WorkspaceProvider} from "@/components/workspace/workspace-provider";
import type {AuthContext} from "@/lib/rbac/check";
import {HR_TIME_KINDS, hrTimeReadIdentity, type HrTimeAttendanceRow, type HrTimeShiftRow, type HrTimeLeaveRow, type HrTimeKind, type HrTimeCriteria} from "@/lib/reads/hr-time-schema";
import {HrAttendancePageClient} from "@/features/hr/time/attendance/hr-attendance-page-client";
import {HrShiftsPageClient} from "@/features/hr/time/shifts/hr-shifts-page-client";
import {HrLeavePageClient} from "@/features/hr/time/leave/hr-leave-page-client";
import{createWorkspaceDraftStore}from'@/lib/workspace/workspace-draft-store';
import type{ChildMutation,ChildSaveContract}from'@/lib/hr/child-save-contract';
import{timeValues}from'../remediation/f11/time-child-fixtures';
import {ReadError} from "@/lib/reads/client";
const state = vi.hoisted(() => ({commands:vi.fn(),store:null as ReturnType<typeof createWorkspaceDraftStore>|null,read: vi.fn(), approveAttendance: vi.fn(), approveLeave: vi.fn(), rejectLeave: vi.fn(), success: vi.fn(), error: vi.fn()}));
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: state.read}));
vi.mock("@/server/actions/hr/time", () => ({approveAttendanceDailySummary: state.approveAttendance, approveLeaveRequest: state.approveLeave, rejectLeaveRequest: state.rejectLeave}));
vi.mock("@/hooks/realtime/use-realtime-sync", () => ({useRealtimeSync: vi.fn()}));
vi.mock("next/navigation", () => ({usePathname: () => "/admin/hr/time/attendance", useSearchParams: () => new URLSearchParams(), useRouter: () => ({push: vi.fn(), replace: vi.fn()})}));
// History is the subject here; leave the real daily-entry workbench mounted but
// do not select a company or invoke its separate roster/lookup transport.
// Daily-entry actions and draft recovery have their own F12 component coverage.
vi.mock("@/components/erp/organizations/owner-company-select", () => ({OwnerCompanySelect: () => <span>Select a company for daily entry</span>}));

vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>state.store}));
vi.mock('@/server/actions/hr/child-mutation',()=>({
 readTimeChildOpening:async(kind:keyof typeof timeValues,_employee:number,id:number,action:string)=>({success:true,id,revision:'4',values:action==='reject'?{reason:''}:action==='approve'?{}:timeValues[kind]}),
 mutateHrChild:async(r:ChildMutation,c:ChildSaveContract)=>{state.commands(r,c);const fn=r.kind==='attendance-summary'?state.approveAttendance:r.action==='reject'?state.rejectLeave:state.approveLeave,result=await fn(r.id,...(r.action==='reject'?[r.values.reason]:[]));return result?.success?{success:true,data:{kind:r.kind,employee_id:r.employeeId,id:r.id,revision:'5',operation_id:c.operationId,replayed:false}}:result;},reconcileHrChild:vi.fn(),listRecentHrChildReceipts:vi.fn()
}));
vi.mock("sonner", () => ({toast: {success: state.success, error: state.error}}));
const context = {profile: {id: 1, auth_user_id: "owned-synthetic-admin", must_change_password: false}, accountStatus: "active", isAccountActive: true, permissionCodes: [], roleCodes: ["system_admin"], roleAssignments: [{roleId: 880101, roleCode: "system_admin", ownerCompanyId: null, branchId: null, permissionCodes: []}]} as unknown as AuthContext;
const attendance = (id: number): HrTimeAttendanceRow => ({id, employee_id: id, attendance_date: "2026-02-01", attendance_type: "office", total_hours: 8, overtime_hours: 0, late_minutes: 0, is_missing_punch: false, approval_status: "pending"});
const shift = (id: number): HrTimeShiftRow => ({id, employee_id: id, weekly_off_day: null, overtime_eligible: false, attendance_required: true, effective_from: "2026-01-01", effective_to: null, work_shift: {shift_name: "Synthetic shift " + id}, work_calendar: null});
const leave = (id: number): HrTimeLeaveRow => ({id, employee_id: id, start_date: "2026-03-01", end_date: "2026-03-02", total_days: 2, approval_status: "pending", employee: {full_name_en: "Synthetic leave employee " + id, full_name_ar: null, employee_code: "PERF-E" + id}, leave_type: null});
const row = (kind: HrTimeKind, id: number) => kind === "attendance" ? attendance(id) : kind === "shifts" ? shift(id) : leave(id);
const envelope = (p: HrTimeCriteria, first = 26, count = 1107) => ({success: true, data: {kind: p.kind, page: p.page, pageSize: p.pageSize, totalCount: count, rows: Array.from({length: Math.min(p.pageSize, Math.max(0, count - (p.page - 1) * p.pageSize))}, (_, i) => row(p.kind, first + i))}});
function page(kind: HrTimeKind, options: {context?: AuthContext; seedIdentity?: string; count?: number; first?: number} = {}) {
 const count = options.count ?? 1107, ctx = options.context ?? context;
 const common = {initialCount: count, authContext: ctx, initialReadIdentity: options.seedIdentity ?? hrTimeReadIdentity(context), initialUpdatedAt: Date.now()};
 const ids = Array.from({length: Math.min(25, count)}, (_, i) => (options.first ?? 1) + i);
 return kind === "attendance" ? <HrAttendancePageClient {...common} initialRows={ids.map(attendance)} /> : kind === "shifts" ? <HrShiftsPageClient {...common} initialRows={ids.map(shift)} /> : <HrLeavePageClient {...common} initialRows={ids.map(leave)} />;
}
const clients: QueryClient[] = [];
function mount(children: React.ReactNode) {
 state.store=createWorkspaceDraftStore(); const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0}}}); clients.push(client);
 const wrap = (node: React.ReactNode) => <QueryClientProvider client={client}><WorkspaceProvider principalId="synthetic-time-history"><WorkspaceUiMemoryProvider>{node}</WorkspaceUiMemoryProvider></WorkspaceProvider></QueryClientProvider>;
 const openHistory = () => {const button = screen.queryByRole("button", {name: "Attendance history"}); if (button) fireEvent.click(button);};
 const view = render(wrap(children)); openHistory(); return {...view, client, replace: (node: React.ReactNode) => {view.rerender(wrap(node)); openHistory();}};
}
function readyRow(kind: HrTimeKind, id: number) {return kind === "attendance" ? screen.findByText(`EMP-${id}`) : kind === "shifts" ? screen.findAllByText(`Synthetic shift ${id}`) : screen.findAllByText(`Synthetic leave employee ${id}`);}
function absentRow(kind: HrTimeKind, id: number) {return screen.queryAllByText(kind === "attendance" ? `EMP-${id}` : kind === "shifts" ? `Synthetic shift ${id}` : `Synthetic leave employee ${id}`);}
const lastParams = () => state.read.mock.calls.at(-1)?.[1] as HrTimeCriteria;
afterEach(() => {cleanup(); clients.splice(0).forEach(c => c.clear()); vi.clearAllMocks(); state.read.mockReset();});

// These retain all nine prior mounted defect checks against the actual typed adapter.
it.each(HR_TIME_KINDS)("%s retains the approved human-readable date presentation without changing ISO filters", async kind => {
 mount(page(kind, {count: 1})); await readyRow(kind, 1);
 expect(screen.getAllByText(kind === "attendance" ? "01 Feb 2026" : kind === "leave" ? "01 Mar 2026" : "01 Jan 2026").length).toBeGreaterThan(0);
 expect(state.read).not.toHaveBeenCalled();
});
it.each(["attendance", "shifts"] as const)("%s page2 fetches page2, never marks the SSR first page as its fresh result", async kind => {
 state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p)));
 mount(page(kind)); await screen.findByText("Page 1 of 45"); expect(state.read).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button", {name: "Next"})); await readyRow(kind, 26);
 expect(lastParams()).toMatchObject({kind, page: 2, pageSize: 25}); expect(absentRow(kind, 1)).toHaveLength(0);
});
it("leave matching SSR pending page is immediately usable without a redundant initial request", async () => {
 state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p)));
 mount(page("leave")); await readyRow("leave", 1); await act(async () => {}); expect(state.read).not.toHaveBeenCalled();
});
it("attendance changed exact date loads matching rows, not the initial page", async () => {
 state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p, 51, 1)));
 mount(page("attendance", {count: 1})); fireEvent.change(screen.getByLabelText("Date", {selector: 'input[aria-label="Date"]'}), {target: {value: "2026-02-03"}});
 await readyRow("attendance", 51); expect(lastParams()).toMatchObject({kind: "attendance", page: 1, pageSize: 25, date: "2026-02-03"}); expect(absentRow("attendance", 1)).toHaveLength(0);
});
it("leave clearing pending criteria fetches all statuses, never reseeds pending rows", async () => {
 state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p, 51, 1)));
 mount(page("leave", {count: 1})); fireEvent.click(screen.getByRole("button", {name: /^Clear$/}));
 await readyRow("leave", 51); expect(lastParams()).toMatchObject({kind: "leave", page: 1, pageSize: 25}); expect(lastParams()).not.toHaveProperty("status"); expect(absentRow("leave", 1)).toHaveLength(0);
});
it.each(HR_TIME_KINDS)("%s rejects success without verified rows/count rather than inventing empty or SSR fallback", async kind => {
 state.read.mockResolvedValue({success: true}); mount(page(kind, {count: 1, seedIdentity: "different-principal"}));
 await screen.findByRole("alert"); expect(state.read).toHaveBeenCalled(); expect(absentRow(kind, 1)).toHaveLength(0); expect(screen.queryByText("0 permitted records")).toBeNull();
});
it("account switch rejects the old SSR seed and retires its cached attendance", async () => {
 let complete!: (r: unknown) => void; state.read.mockImplementation(() => new Promise(r => {complete = r;}));
 const view = mount(page("attendance", {count: 1})), identity = hrTimeReadIdentity(context);
 await readyRow("attendance", 1); const changed = {...context, profile: {...context.profile!, id: 2, auth_user_id: "owned-other-synthetic"}} as AuthContext;
 view.replace(page("attendance", {count: 1, context: changed})); await waitFor(() => expect(state.read).toHaveBeenCalledTimes(1));
 expect(absentRow("attendance", 1)).toHaveLength(0); expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(identity))).toBe(false);
 await act(async () => complete(envelope(lastParams(), 51, 1))); await readyRow("attendance", 51); expect(absentRow("attendance", 1)).toHaveLength(0);
});

it.each(HR_TIME_KINDS)("%s search is debounced, masks old rows and queries all permitted results", async kind => {
 state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p, 1101, 1))); mount(page(kind)); await readyRow(kind, 1);
 fireEvent.change(screen.getByPlaceholderText("Search all permitted time records…"), {target: {value: "موارد_%"}});
 expect(absentRow(kind, 1)).toHaveLength(0); expect(state.read).not.toHaveBeenCalled();
 await readyRow(kind, 1101); expect(state.read).toHaveBeenCalledTimes(1); expect(lastParams()).toMatchObject({kind, search: "موارد_%", page: 1});
});
it.each(HR_TIME_KINDS)("%s sorting uses the full-result server contract with page reset", async kind => {
 state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p, 51, 1))); mount(page(kind)); await readyRow(kind, 1);
 fireEvent.click(screen.getByRole("button", {name: /^Employee ID$/})); await readyRow(kind, 51);
 expect(lastParams()).toMatchObject({kind, sortKey: "employee_id", page: 1}); expect(lastParams().sortDir).toMatch(/^(asc|desc)$/);
});
it.each(HR_TIME_KINDS)("%s filters are AND criteria in the counted read, not loaded-page matching", async kind => {
 state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p, 1101, 1))); mount(page(kind)); await readyRow(kind, 1);
 fireEvent.click(screen.getByRole("button", {name: /^Edit filters/})); const dialog = await screen.findByRole("dialog");
 fireEvent.change(within(dialog).getByLabelText("Employee ID"), {target: {value: "1101"}});
 const second = kind === "attendance" ? "Hours" : kind === "shifts" ? "Overtime eligible" : "Days";
 fireEvent.change(within(dialog).getByLabelText(second), {target: {value: kind === "shifts" ? "false" : "2"}});
 fireEvent.click(within(dialog).getByRole("button", {name: "Apply"})); await readyRow(kind, 1101);
 expect(lastParams().columnFilters).toEqual({employee_id: "1101", [kind === "attendance" ? "total_hours" : kind === "shifts" ? "overtime_eligible" : "total_days"]: kind === "shifts" ? "false" : "2"});
});
it.each(HR_TIME_KINDS)("%s invalid date range is not sent and never reports a false empty result", async kind => {
 mount(page(kind)); await readyRow(kind, 1); fireEvent.change(screen.getByLabelText("From"), {target: {value: "2026-04-01"}});
 fireEvent.change(screen.getByLabelText("To"), {target: {value: "2026-03-01"}}); await screen.findByRole("alert");
 // The first valid date can start one read; the invalid combination must not.
 expect(state.read.mock.calls.every(c => c[1].dateTo !== "2026-03-01")).toBe(true); expect(absentRow(kind, 1)).toHaveLength(0); expect(screen.queryByText("0 permitted records")).toBeNull();
});
it.each([401, 403])("denied %s refresh masks and retires warm records and never silently retries", async status => {
 state.read.mockRejectedValue(new ReadError("Denied synthetic read", status)); const view = mount(page("attendance", {count: 1})); await readyRow("attendance", 1);
 fireEvent.click(screen.getByRole("button", {name: "Refresh records"})); await screen.findByRole("alert");
 expect(absentRow("attendance", 1)).toHaveLength(0); expect(state.read).toHaveBeenCalledTimes(1);
 await waitFor(() => expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(hrTimeReadIdentity(context)) && q.state.data !== undefined)).toBe(false));
});
it.each(["suspended", "password", "signed-out"] as const)("%s state cannot reuse warm rows or start a read", async stateName => {
 const view = mount(page("leave", {count: 1})); await readyRow("leave", 1);
 const changed = stateName === "suspended" ? {...context, isAccountActive: false, accountStatus: "suspended"} : stateName === "password" ? {...context, profile: {...context.profile!, must_change_password: true}} : {...context, profile: null, isAccountActive: false};
 view.replace(page("leave", {count: 1, context: changed as AuthContext})); await screen.findByRole("alert"); expect(absentRow("leave", 1)).toHaveLength(0); expect(state.read).not.toHaveBeenCalled();
});
it("late search response after account switch cannot restore the retired principal's rows", async () => {
 const pending: {params: HrTimeCriteria; signal: AbortSignal; resolve: (v: unknown) => void}[] = [];
 state.read.mockImplementation((_resource, params, signal) => new Promise(resolve => pending.push({params, signal, resolve})));
 const view = mount(page("attendance", {count: 1})); await readyRow("attendance", 1);
 fireEvent.change(screen.getByPlaceholderText("Search all permitted time records…"), {target: {value: "old synthetic"}}); await waitFor(() => expect(pending).toHaveLength(1));
 const changed = {...context, profile: {...context.profile!, id: 2, auth_user_id: "owned-new"}} as AuthContext;
 view.replace(page("attendance", {context: changed, count: 1})); await waitFor(() => expect(pending).toHaveLength(2)); expect(pending[0].signal.aborted).toBe(true);
 await act(async () => {pending[1].resolve(envelope(pending[1].params, 51, 1)); pending[0].resolve(envelope(pending[0].params, 91, 1));}); await readyRow("attendance", 51);
 expect(absentRow("attendance", 91)).toHaveLength(0); expect(absentRow("attendance", 1)).toHaveLength(0);
});
it("manual retry recovers a failed read without an empty-success fallback", async () => {
 state.read.mockRejectedValueOnce(new ReadError("Controlled outage", 503)).mockRejectedValueOnce(new ReadError("Controlled outage", 503)).mockImplementation((_resource, p) => Promise.resolve(envelope(p, 51, 1)));
 mount(page("shifts", {count: 1})); await readyRow("shifts", 1); fireEvent.click(screen.getByRole("button", {name: "Refresh records"})); await screen.findByRole("alert");
 expect(screen.queryByText("0 permitted records")).toBeNull(); expect(state.read).toHaveBeenCalledTimes(2); fireEvent.click(screen.getByRole("button", {name: "Retry loading records"})); await readyRow("shifts", 51); expect(state.read).toHaveBeenCalledTimes(3);
});
it("returning to an in-memory workspace retains page criteria instead of reseeding SSR page1", async () => {
 state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p))); const view = mount(page("attendance")); await screen.findByText("Page 1 of 45");
 fireEvent.click(screen.getByRole("button", {name: "Next"})); await readyRow("attendance", 26); view.replace(null); view.replace(page("attendance"));
 await screen.findByText("Page 2 of 45"); await readyRow("attendance", 26); expect(absentRow("attendance", 1)).toHaveLength(0); expect(state.read).toHaveBeenCalledTimes(1);
});
it.each(["attendance", "leave"] as const)("%s duplicate approval admission is synchronous and remains a mutation action", async kind => {
 let complete!: (v: unknown) => void; const action = kind === "attendance" ? state.approveAttendance : state.approveLeave; action.mockImplementation(() => new Promise(r => {complete = r;}));
 mount(page(kind, {count: 1})); await readyRow(kind, 1); const approve = screen.getByRole("button", {name: /^Approve$/});
 act(() => {fireEvent.click(approve); fireEvent.click(approve);});expect(action).not.toHaveBeenCalled();
 const dialog=await screen.findByRole('dialog',{name:kind==='attendance'?'Approve Daily Attendance':'Approve Leave Request'}),confirm=within(dialog).getByRole('button',{name:kind==='attendance'?'Approve attendance':'Approve leave request'});
 act(()=>{fireEvent.click(confirm);fireEvent.click(confirm);});await waitFor(()=>expect(action).toHaveBeenCalledTimes(1));expect(action).toHaveBeenCalledWith(1);
 state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p, 1, 1))); await act(async () => complete({success: true})); expect(state.success).toHaveBeenCalledTimes(1);
});
it("an open rejection reason is retired on account switch and cannot execute under the new account", async () => {
 const view = mount(page("leave", {count: 1})); await readyRow("leave", 1); fireEvent.click(screen.getByRole("button", {name: /^Reject$/}));
 fireEvent.change(await screen.findByLabelText("Reason"), {target: {value: "PRIVATE SYNTHETIC REASON"}});
 state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p, 51, 1)));
 const changed = {...context, profile: {...context.profile!, id: 2, auth_user_id: "owned-new"}} as AuthContext; view.replace(page("leave", {count: 1, context: changed}));
 await readyRow("leave", 51); expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByDisplayValue("PRIVATE SYNTHETIC REASON")).toBeNull(); expect(state.rejectLeave).not.toHaveBeenCalled();
});
it("a same-criteria refresh pauses the rejection portal without losing its draft", async () => {
 let complete!: (v: unknown) => void;
 state.read.mockImplementation(() => new Promise(resolve => {complete = resolve;}));
 mount(page("leave", {count: 1})); await readyRow("leave", 1);
 fireEvent.click(screen.getByRole("button", {name: /^Reject$/}));
 fireEvent.change(await screen.findByLabelText("Reason"), {target: {value: "SYNTHETIC RETAINED REASON"}});
 fireEvent.click(screen.getByRole("button", {name: "Refresh records", hidden: true}));
 await waitFor(()=>expect(screen.getByRole('button',{name:'Reject leave request'})).toHaveProperty('disabled',true));
 expect(screen.getByLabelText('Reason')).toHaveProperty('value','SYNTHETIC RETAINED REASON');
 expect(state.rejectLeave).not.toHaveBeenCalled();
 await act(async () => complete(envelope(lastParams(), 1, 1)));
 await screen.findByRole("dialog"); expect(screen.getByDisplayValue("SYNTHETIC RETAINED REASON")).toBeTruthy();
});
it("changing leave criteria retires the previous rejection target and permits a fresh target", async () => {
 state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p, 51, 1)));
 mount(page("leave", {count: 1})); await readyRow("leave", 1);
 fireEvent.click(screen.getByRole("button", {name: /^Reject$/})); await screen.findByRole("dialog");
 fireEvent.change(screen.getByPlaceholderText("Search all permitted time records…"), {target: {value: "new criteria"}});
 await readyRow("leave", 51); expect(screen.queryByRole("dialog")).toBeNull(); expect(state.rejectLeave).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole("button", {name: /^Reject$/})); await screen.findByRole("dialog");
});
it.each(["attendance", "leave"] as const)("%s mutation response loss stays uncertain, does not auto-repeat, and requires review", async kind => {
 const action = kind === "attendance" ? state.approveAttendance : state.approveLeave; action.mockRejectedValue(new Error("Synthetic lost response"));
 mount(page(kind, {count: 1})); await readyRow(kind, 1); fireEvent.click(screen.getByRole("button", {name: /^Approve$/}));
 const confirm=await screen.findByRole('button',{name:kind==='attendance'?'Approve attendance':'Approve leave request'});fireEvent.click(confirm);
 await screen.findByText(/The result is unconfirmed/);expect(state.success).not.toHaveBeenCalled();expect(state.error).not.toHaveBeenCalled();expect(action).toHaveBeenCalledTimes(1);
 const original=state.commands.mock.calls[0];fireEvent.click(screen.getByRole('button',{name:'Retry unchanged Time change'}));await waitFor(()=>expect(action).toHaveBeenCalledTimes(2));expect(state.commands.mock.calls[1]).toEqual(original);
});
it.each(["attendance", "leave"] as const)("%s late approval completion is not accepted after an account switch", async kind => {
 let complete!: (v: unknown) => void; const action = kind === "attendance" ? state.approveAttendance : state.approveLeave;
 action.mockImplementation(() => new Promise(r => {complete = r;})); state.read.mockImplementation((_resource, p) => Promise.resolve(envelope(p, 51, 1)));
 const view = mount(page(kind, {count: 1})); await readyRow(kind, 1); fireEvent.click(screen.getByRole("button", {name: /^Approve$/}));
 const confirm=await screen.findByRole('button',{name:kind==='attendance'?'Approve attendance':'Approve leave request'});fireEvent.click(confirm);await waitFor(()=>expect(action).toHaveBeenCalledOnce());
 const changed = {...context, profile: {...context.profile!, id: 2, auth_user_id: "owned-new"}} as AuthContext; view.replace(page(kind, {count: 1, context: changed})); await readyRow(kind, 51);
 await act(async () => complete({success: true})); expect(state.success).not.toHaveBeenCalled(); expect(action).toHaveBeenCalledTimes(1); expect(absentRow(kind, 1)).toHaveLength(0);
});
