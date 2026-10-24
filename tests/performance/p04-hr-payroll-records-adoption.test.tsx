// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
import {act, cleanup, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import {QueryClient, QueryClientProvider, QueryObserver} from "@tanstack/react-query";
import {RecordReadActivity} from "@/hooks/use-record-read-active";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import{createWorkspaceDraftStore}from'@/lib/workspace/workspace-draft-store';
import{PAYROLL_CHILD_COLUMNS,payrollOpeningValues,type PayrollChildKind}from'@/lib/hr/payroll-child-contract';
import type{ChildMutation,ChildSaveContract}from'@/lib/hr/child-save-contract';
import type {AuthContext} from "@/lib/rbac/check";
import {hrPayrollReadIdentity, type PayrollRecordKind} from "@/lib/reads/hr-payroll-records-schema";
import {EmployeePayrollTab} from "@/features/hr/employees/tabs/employee-payroll-tab";
import {ReadError} from "@/lib/reads/client";
import {payrollRecordFixture, payrollProfileFixture, payrollWpsFixture} from "./hr-payroll-record-fixtures";
import {redactWpsProfile} from "@/lib/hr/payroll/redaction";
import {HrSalariesPageClient} from "@/features/hr/payroll/salaries/hr-salaries-page-client";
import {HrWpsPageClient} from "@/features/hr/payroll/wps/hr-wps-page-client";
import {payrollInquiryIdentity, type PayrollInquiryCriteria, type PayrollInquiryKind} from "@/lib/reads/hr-payroll-inquiries-schema";
import {payrollInquiryPrefix} from "@/hooks/use-hr-payroll-inquiries";
import {payrollInquiryPage} from "./hr-payroll-inquiry-fixtures";

// F05 compact forms have no worklist criteria controls. Capture the real
// collection adapter without replacing its renderer, read hook or authority.
// Criteria-injection cases below test controller compatibility, not visible UI.
const embeddedAdapters = vi.hoisted(() => new Map<string, import("@/components/erp/table/erp-table-types").ERPTableServerRead<unknown>>());
vi.mock("@/components/erp/table/record-collection", async original => {
  const actual = await original<typeof import("@/components/erp/table/record-collection")>();
  return {...actual, RecordCollection: (props: React.ComponentProps<typeof actual.RecordCollection>) => {
    if (props.serverRead) embeddedAdapters.set(props.id, props.serverRead);
    return <actual.RecordCollection {...props} />;
  }};
});
function controller(fragment: string) {
  const found = [...embeddedAdapters].find(([id]) => id.includes(fragment))?.[1];
  if (!found) throw Error("Real embedded adapter missing: " + fragment);
  return found;
}
beforeEach(() => embeddedAdapters.clear());

const state = vi.hoisted(() => ({store:null as ReturnType<typeof createWorkspaceDraftStore>|null,transport: vi.fn(), page: vi.fn(), point: vi.fn(), choices: vi.fn(), inquiry: vi.fn(), success: vi.fn(), error: vi.fn(), mutations: Object.fromEntries(["archiveEmployeePayrollHold", "archiveEmployeeSalaryComponent", "createEmployeeSalaryComponent", "createEmployeeSalaryRevision", "createOrUpdateEmployeePayrollProfile", "createOrUpdateEmployeeWpsProfile", "placeEmployeePayrollHold", "releaseEmployeePayrollHold", "updateEmployeeSalaryComponent"].map(k => [k, vi.fn()]))}));
vi.mock("sonner", () => ({toast: {success: state.success, error: state.error}}));
vi.mock("next/navigation", () => ({usePathname: () => "/admin/hr/employees/record/880301"}));
vi.mock("@/server/actions/hr/payroll", () => state.mutations);
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>state.store}));
vi.mock('@/hooks/lookups',()=>({useBanksQuery:()=>({isLoading:false,error:null})}));
// Boundary spies below retain the original inquiry-consumer assertions. The
// actual new server/native contract is independently tested in F11, not inferred
// from this mounted parent harness. No real account or bank values are used.
vi.mock('@/server/actions/hr/child-mutation',()=>({
 readPayrollChildOpening:async(kind:PayrollChildKind,employeeId:number,id:number|null)=>{
  try{
   if(kind==='salary-revision')return{success:true,id:null,revision:null,values:{fingerprint:'a'.repeat(64)}};
   let row:Record<string,unknown>|null;
   if(kind==='payroll-hold')row=payrollRecordFixture('holds',id??undefined)as unknown as Record<string,unknown>;
   else{const point=await state.point({kind:kind==='payroll-profile'?'profile':kind==='salary-component'?'component-detail':'wps',employeeId,...(kind==='salary-component'?{recordId:id}:{})});row=kind==='wps-profile'?point?.profile:point;}
   if(!row)return id===null&&['payroll-profile','wps-profile'].includes(kind)?{success:true,id:null,revision:null,values:{}}:{success:false,error:'The complete original payroll record could not be verified.'};
   const values=Object.fromEntries(PAYROLL_CHILD_COLUMNS[kind].split(',').map(key=>[key,row![key]])),parsed=payrollOpeningValues(kind).safeParse(values);
   if(!parsed.success)return{success:false,error:'The complete original payroll record could not be verified.'};
   return{success:true,id:id??null,revision:id?'4':null,values:id?parsed.data:{}};
  }catch{return{success:false,error:'The complete original payroll record could not be verified.'};}
 },
 mutateHrChild:async(request:ChildMutation,contract:ChildSaveContract)=>{
  const kind=request.kind,name=kind==='payroll-profile'?'createOrUpdateEmployeePayrollProfile':kind==='wps-profile'?'createOrUpdateEmployeeWpsProfile':kind==='salary-revision'?'createEmployeeSalaryRevision':kind==='salary-component'?request.action==='archive'?'archiveEmployeeSalaryComponent':request.action==='update'?'updateEmployeeSalaryComponent':'createEmployeeSalaryComponent':request.action==='release'?'releaseEmployeePayrollHold':request.action==='archive'?'archiveEmployeePayrollHold':'placeEmployeePayrollHold';
  const employeeTarget=['payroll-profile','wps-profile','salary-revision'].includes(kind)||request.action==='create';
  const result=await state.mutations[name](employeeTarget?request.employeeId:request.id,request.values,contract);
  return result?.success?{success:true,data:{kind,employee_id:request.employeeId,id:request.id??51,revision:String(Number(request.revision??0)+1),operation_id:contract.operationId,replayed:false}}:result;
 },reconcileHrChild:()=>{throw Error('No automatic recovery dispatch');},listRecentHrChildReceipts:()=>{throw Error('No automatic receipt read');},
}));
vi.mock("@/hooks/realtime/use-realtime-sync", () => ({useRealtimeSync: () => {}}));
vi.mock("@/components/erp/finance-basics/bank-select", () => ({BankSelect: () => <span>Shared bank selector outside payroll adoption scope</span>}));
vi.mock("@/lib/reads/client", async () => ({...await vi.importActual<typeof import("@/lib/reads/client")>("@/lib/reads/client"), readJson: async (resource: string, input: Record<string, unknown>, signal?: AbortSignal) => {
  state.transport(resource, input, signal);
  if (resource === "hr-payroll-records") {
    const page = await state.page(input, signal);
    return {success: true, data: {...input, rows: undefined, search: undefined, sortKey: undefined, sortDir: undefined, columnFilters: undefined, ...(input.kind === "holds" ? {activeCount: page.totalCount} : {}), ...page}};
  }
  if (resource === "hr-payroll-point") return {success: true, data: {kind: input.kind, employeeId: input.employeeId, value: await state.point(input, signal)}};
  if (resource === "hr-payroll-inquiries") return {success: true, data: await state.inquiry(input, signal)};
  return {success: true, data: await state.choices(input, signal)};
}}));
const permissionCodes = ["hr.payroll.view", "hr.payroll.manage", "hr.banking.view", "hr.banking.manage"];
const context = {profile: {id: 6, auth_user_id: "synthetic-payroll", must_change_password: false}, accountStatus: "active", isAccountActive: true, permissionCodes, roleCodes: ["hr_scoped"], roleAssignments: [{roleId: 880106, roleCode: "hr_scoped", ownerCompanyId: 880101, branchId: null, permissionCodes}]} as unknown as AuthContext;
const clients: QueryClient[] = [];
// Node 26 exposes its own optional localStorage. Bind this mounted suite to
// the actual JSDOM stores, not the host's unrelated/undefined storage getter.
const storageDescriptors = Object.fromEntries((["localStorage", "sessionStorage"] as const).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
const browserWindow = (globalThis as unknown as {jsdom: {window: {localStorage: Storage; sessionStorage: Storage}}}).jsdom.window;
type PageInput = {kind: PayrollRecordKind; employeeId: number; page: number; pageSize: number; search: string; columnFilters: Record<string, string>};
type PointInput = {kind: string; employeeId: number; recordId?: number};
type ChoiceInput = {kind: string; employeeId: number; page: number; pageSize: number; search: string; selectedId: number | null};
beforeEach(() => {
  state.store=createWorkspaceDraftStore();
  for (const key of ["localStorage", "sessionStorage"] as const) {
    Object.defineProperty(globalThis, key, {configurable: true, writable: true, value: browserWindow[key]});
    browserWindow[key].clear();
  }
  state.page.mockImplementation(async (input: PageInput) => ({rows: [payrollRecordFixture(input.kind)], totalCount: 1}));
  state.point.mockImplementation(async (input: PointInput) => input.kind === "profile" ? payrollProfileFixture : input.kind === "salary-totals" ? {gross: 1234, basic: 1000, activeCount: 1} : input.kind === "component-detail" ? payrollRecordFixture("salary-components", input.recordId) : {profile: redactWpsProfile(payrollWpsFixture, true), readiness: {status: "ready", missingRequirements: []}});
  state.inquiry.mockImplementation(async (input: PayrollInquiryCriteria) => payrollInquiryPage(input, {count: 1}));
  state.choices.mockImplementation(async (input: ChoiceInput) => {const row = {id: input.selectedId ?? 100, code: "SYNTH", name_en: "Selected synthetic legacy value", name_ar: null, is_active: false}; return {kind: input.kind, employeeId: input.employeeId, page: input.page, pageSize: input.pageSize, rows: [], selected: input.selectedId === null ? null : row, totalCount: 0};});
  for (const mutation of Object.values(state.mutations)) mutation.mockImplementation(() => {throw Error("Unexpected business mutation in read test");});
});
afterEach(() => {
  cleanup(); clients.splice(0).forEach(q => q.clear()); Object.values(state).forEach(v => {if (typeof v === "function" && "mockReset" in v) v.mockReset();}); Object.values(state.mutations).forEach(v => v.mockReset());
  for (const key of ["localStorage", "sessionStorage"] as const) {
    const descriptor = storageDescriptors[key];
    if (descriptor) Object.defineProperty(globalThis, key, descriptor);
    else Reflect.deleteProperty(globalThis, key);
  }
});
function mount(initial: AuthContext = context) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: 60000}}}); clients.push(client); const onChildOpen = vi.fn();
  const wrap = (ctx: AuthContext, visible = true, active = true) => <QueryClientProvider client={client}><WorkspaceUiMemoryProvider><RecordReadActivity active={active}>{visible && <EmployeePayrollTab employeeId={880301} authContext={ctx} onChildOpen={onChildOpen} />}</RecordReadActivity></WorkspaceUiMemoryProvider></QueryClientProvider>;
  const view = render(wrap(initial)); return {...view, client, onChildOpen, replace: (ctx: AuthContext) => view.rerender(wrap(ctx)), hide: () => view.rerender(wrap(initial, false)), restore: () => view.rerender(wrap(initial)), pause: () => view.rerender(wrap(initial, true, false))};
}
const recordId = (kind: PayrollRecordKind) => ({"salary-components":"SalaryComponentsSection", "salary-revisions":"SalaryRevisionSection", holds:"PayrollHoldsSection"}[kind]);
function recordSearch(kind: PayrollRecordKind, value: string) {act(() => controller(recordId(kind)).onGlobalFilterChange(value));}
const titles = {"salary-components": "Salary Components", "salary-revisions": "Salary Revision History", holds: "Payroll Holds"};
function section(kind: PayrollRecordKind) {const element = screen.getByText(titles[kind]).closest("div.rounded-xl"); if (!element) throw Error("Actual payroll section missing"); return within(element as HTMLElement);}
const token = (kind: PayrollRecordKind, id = 1) => kind === "salary-components" ? `Synthetic earning ${id}` : kind === "salary-revisions" ? `Synthetic revision ${id}` : `Synthetic hold ${id}`;
it("hidden payroll sections pause background refresh without unmounting local drafts", async () => {
 const view=mount();await screen.findAllByText(token("holds"));
 fireEvent.click(screen.getByRole("button",{name:"Edit Profile"}));
 await screen.findByRole("dialog",{name:"Edit Salary Profile"});await screen.findByText("Selected synthetic legacy value");
 fireEvent.change(screen.getByLabelText("Notes"),{target:{value:"Retained synthetic draft"}});
 view.pause();const calls=state.transport.mock.calls.length;
 await act(async()=>{await view.client.invalidateQueries({queryKey:["hr"]});});
 expect(state.transport).toHaveBeenCalledTimes(calls);
 expect(screen.queryByLabelText("Notes")).toBeNull();
 view.restore();await waitFor(()=>expect(state.transport.mock.calls.length).toBeGreaterThan(calls));
 expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Retained synthetic draft");
 expect(Object.values(state.mutations).every(m=>m.mock.calls.length===0)).toBe(true);
});
it.each(["salary-components", "salary-revisions", "holds"] as const)("%s actual payroll controls use a counted page and principal-owned key", async kind => {
  const view = mount(); await screen.findAllByText(token(kind)); expect(state.transport.mock.calls.filter(c => c[0] === "hr-payroll-records" && c[1].kind === kind)).toHaveLength(1);
  expect(view.client.getQueryCache().getAll().filter(q => q.queryKey[0] === "hr").every(q => q.queryKey.at(-1) === hrPayrollReadIdentity(context))).toBe(true);
  expect(state.transport.mock.calls.find(c => c[0] === "hr-payroll-records" && c[1].kind === kind)?.[1]).toMatchObject({employeeId: 880301, page: 1, pageSize: 25});
  expect(state.transport.mock.calls.some(c => c[0] === "hr-payroll-choices")).toBe(false);
});
it.each(["salary-components", "salary-revisions", "holds"] as const)("%s actual controls use complete total and next page instead of local slicing", async kind => {
  state.page.mockImplementation(async (input: PageInput) => input.kind === kind ? {rows: Array.from({length: Math.min(input.pageSize, 1107 - (input.page - 1) * input.pageSize)}, (_, n) => payrollRecordFixture(kind, (input.page - 1) * input.pageSize + n + 1)), totalCount: 1107} : {rows: [], totalCount: 0});
  mount(); await waitFor(() => expect(section(kind).getByText("Page 1 of 45")).toBeTruthy());
  fireEvent.click(section(kind).getAllByRole("button", {name: "Next"}).at(-1)!);
  await waitFor(() => expect(state.transport.mock.calls.filter(c => c[0] === "hr-payroll-records" && c[1].kind === kind).at(-1)?.[1]).toMatchObject({page: 2, pageSize: 25}));
  await screen.findAllByText(token(kind, 26)); expect(section(kind).queryAllByText(token(kind, 1))).toHaveLength(0);
});
it("empty compact record pages omit worklist controls and never call old Server Actions", async () => {
  state.page.mockResolvedValue({rows: [], totalCount: 0}); mount(); await screen.findAllByText("No related records yet."); expect(screen.queryByPlaceholderText("Search all permitted records…")).toBeNull(); expect(screen.queryByRole("button", {name: "Edit filters"})).toBeNull();
  expect(Object.values(state.mutations).every(m => m.mock.calls.length === 0)).toBe(true);
});
it.each(["salary-components", "salary-revisions", "holds"] as const)("%s failed refresh clears old rows, reports failure and manually retries", async kind => {
  const view = mount(); await screen.findAllByText(token(kind)); state.page.mockImplementation(async (input: PageInput) => {if (input.kind === kind) throw new ReadError("Controlled read failure", 400); return {rows: [payrollRecordFixture(input.kind)], totalCount: 1};});
  await act(async () => {await view.client.invalidateQueries({queryKey: ["hr", "payroll", kind, 880301]});}); await screen.findByRole("alert"); expect(screen.queryAllByText(token(kind))).toHaveLength(0); expect(section(kind).queryByText("No permitted records match this view.")).toBeNull();
  state.page.mockImplementation(async (input: PageInput) => ({rows: [payrollRecordFixture(input.kind, 2)], totalCount: 1})); fireEvent.click(screen.getByRole("button", {name: "Retry loading"})); await screen.findAllByText(token(kind, 2));
});
it.each(["account", "branch"])("%s change retires old warm data and cannot display a late old response", async change => {
  const view = mount(); await screen.findAllByText(token("salary-components")); let finish!: (result: unknown) => void;
  state.page.mockImplementationOnce(() => new Promise(resolve => {finish = resolve;}));
  await act(async () => {void view.client.invalidateQueries({queryKey: ["hr", "payroll", "salary-components", 880301]});});
  state.page.mockImplementation(async (input: PageInput) => ({rows: [payrollRecordFixture(input.kind, 2)], totalCount: 1}));
  view.replace(change === "account" ? {...context, profile: {...context.profile!, id: 7, auth_user_id: "new-payroll-actor"}} : {...context, roleAssignments: context.roleAssignments!.map(a => ({...a, branchId: 880202}))});
  await screen.findAllByText(token("salary-components", 2)); await act(async () => finish({rows: [payrollRecordFixture("salary-components", 99)], totalCount: 1}));
  expect(screen.queryAllByText(token("salary-components", 99))).toHaveLength(0); expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(hrPayrollReadIdentity(context)))).toBe(false);
});
it("banking access remains independent; no-role/suspended users make no reads", async () => {
  const codes = ["hr.payroll.view"], view = mount({...context, permissionCodes: codes, roleAssignments: context.roleAssignments!.map(a => ({...a, permissionCodes: codes}))});
  await screen.findAllByText(token("holds")); expect(state.point.mock.calls.some(c => c[0].kind === "wps")).toBe(false); expect(screen.getByText(/Separate banking access is required/)).toBeTruthy();
  state.transport.mockClear(); view.replace({...context, isAccountActive: false}); expect(screen.getByText("Payroll information is restricted.")).toBeTruthy(); expect(state.transport).not.toHaveBeenCalled();
});
it("scoped admin role codes alone do not grant payroll editing", async () => {
  const codes = ["hr.payroll.view"], ctx = {...context, permissionCodes: codes, roleCodes: ["system_admin"], roleAssignments: context.roleAssignments!.map(a => ({...a, roleCode: "system_admin", permissionCodes: codes}))};
  mount(ctx); await screen.findAllByText(token("holds")); expect(screen.queryByRole("button", {name: "Add Component"})).toBeNull(); expect(screen.queryByRole("button", {name: "Place Hold"})).toBeNull();
});
it.each(["self", "team"])("existing %s payroll/banking capabilities reach authorized read controls without granting manage", async suffix => {
  const codes = [`hr.payroll.view.${suffix}`, `hr.banking.view.${suffix}`], ctx = {...context, permissionCodes: codes, roleAssignments: context.roleAssignments!.map(a => ({...a, permissionCodes: codes}))};
  mount(ctx); await screen.findAllByText(token("holds")); await screen.findByText("Synthetic bank"); expect(screen.queryByRole("button", {name: "Add Component"})).toBeNull(); expect(screen.queryByRole("button", {name: "Edit WPS Profile"})).toBeNull();
});
it("forbidden subject read clears all private sections and closes child dialogs without retry", async () => {
  const view = mount(); await screen.findAllByText(token("holds")); state.page.mockRejectedValue(new ReadError("Subject access revoked", 403));
  await act(async () => {await view.client.invalidateQueries({queryKey: ["hr", "payroll", "holds", 880301]});}); await screen.findByText("Payroll information is restricted.");
  expect(screen.queryAllByText(token("salary-components"))).toHaveLength(0);
  // Restricted rendering precedes the passive effect that retires child/cache state.
  await waitFor(() => {
    expect(view.onChildOpen).toHaveBeenLastCalledWith(false);
    expect(view.client.getQueryCache().getAll().some(q => q.queryKey[1] === "payroll")).toBe(false);
  });
});
it("component editor waits for fresh complete detail and preserves a selected inactive catalog value", async () => {
  mount(); await screen.findAllByText(token("salary-components")); expect(state.point.mock.calls.some(c => c[0].kind === "component-detail")).toBe(false);
  state.point.mockImplementation(async (input: PointInput) => input.kind === "component-detail" ? {...payrollRecordFixture("salary-components"), notes: "Full current editor notes"} : null);
  fireEvent.click(section("salary-components").getByRole("button", {name: "Edit record"})); await screen.findByRole("dialog", {name: "Edit Salary Component"});
  await screen.findByText("Selected synthetic legacy value"); expect((screen.getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Full current editor notes");
  expect(state.choices).toHaveBeenCalledWith(expect.objectContaining({kind: "salary-component-types", selectedId: 100, page: 1, pageSize: 50}), expect.anything()); expect(Object.values(state.mutations).every(m => m.mock.calls.length === 0)).toBe(true);
});
it("detail failure never opens a partial component editor", async () => {
  mount(); await screen.findAllByText(token("salary-components")); state.point.mockRejectedValue(new ReadError("Controlled detail failure", 400));
  fireEvent.click(section("salary-components").getByRole("button", {name: "Edit record"})); await screen.findByText("The complete original payroll record could not be verified."); expect(screen.queryByLabelText("Amount (AED)")).toBeNull(); expect(screen.getByRole("button",{name:"Retry payroll opening"})).toBeTruthy();
});
it("bounded salary totals coalesce between profile and revision editor and retain prior invalidation", async () => {
  const view = mount(); await screen.findAllByText(token("salary-revisions")); expect(state.point.mock.calls.filter(c => c[0].kind === "salary-totals")).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", {name: "Record Revision"})); await screen.findByRole("dialog", {name: "Record Salary Revision"}); expect((screen.getByLabelText("Current Basic (profile currency)") as HTMLInputElement).value).toBe("1,000.00");
  expect(state.point.mock.calls.filter(c => c[0].kind === "salary-totals")).toHaveLength(1);
  await act(async () => {await view.client.invalidateQueries({queryKey: ["hr", "payroll", "gross-salary", 880301]});}); expect(state.point.mock.calls.filter(c => c[0].kind === "salary-totals")).toHaveLength(2);
});
it("workspace criteria restore without persisting salary data to browser storage", async () => {
  localStorage.setItem("synthetic-unrelated-control", "retain-local"); sessionStorage.setItem("synthetic-unrelated-control", "retain-session");
  const localBefore = {...localStorage}, sessionBefore = {...sessionStorage};
  const view = mount(); await screen.findAllByText(token("holds")); recordSearch("holds", "اختبار_%");
  await waitFor(() => expect(state.transport.mock.calls.filter(c => c[0] === "hr-payroll-records" && c[1].kind === "holds").at(-1)?.[1]).toMatchObject({search: "اختبار_%"}));
  await screen.findAllByText(token("holds")); const count = state.transport.mock.calls.length; view.hide(); view.restore(); await screen.findAllByText(token("holds"));
  expect(controller(recordId("holds")).globalFilter).toBe("اختبار_%"); expect(section("holds").getByRole("button", {name: "Clear list criteria"})).toBeTruthy(); expect(state.transport).toHaveBeenCalledTimes(count);
  expect({...localStorage}).toEqual(localBefore); expect({...sessionStorage}).toEqual(sessionBefore);
  expect(localStorage.getItem("synthetic-unrelated-control")).toBe("retain-local"); expect(sessionStorage.getItem("synthetic-unrelated-control")).toBe("retain-session");
});
it.each([
  ["Edit Profile", "Edit Salary Profile", "Payroll Group", "payroll-groups", 100],
  ["Edit record", "Edit Salary Component", "Component Type", "salary-component-types", 100],
  ["Edit WPS Profile", "Edit WPS / Bank Details", "MOHRE Establishment", "mohre-establishments", null],
] as const)("%s activates only its own complete counted choice page", async (button, dialogTitle, label, kind, selectedId) => {
  state.choices.mockImplementation(async (input: ChoiceInput) => ({kind: input.kind, employeeId: input.employeeId, page: input.page, pageSize: input.pageSize, totalCount: 1107, rows: Array.from({length: 50}, (_, n) => ({id: (input.page - 1) * 50 + n + 1, code: `SYN-${n}`, name_en: `Synthetic choice ${n}`, name_ar: null, is_active: true})), selected: input.selectedId === null ? null : {id: input.selectedId, code: "LEGACY", name_en: "Permitted inactive legacy", name_ar: null, is_active: false}}));
  mount(); await screen.findAllByText(token("holds")); expect(state.choices).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", {name: button})); const dialog = await screen.findByRole("dialog", {name: dialogTitle});
  await waitFor(() => expect(state.choices).toHaveBeenCalledWith(expect.objectContaining({kind, selectedId, page: 1, pageSize: 50}), expect.anything()));
  await within(dialog).findByText("1107 matching choices · page 1"); fireEvent.click(within(dialog).getByRole("button", {name: `Next ${label.toLowerCase()} choices`}));
  await within(dialog).findByText("1107 matching choices · page 2"); expect(state.choices.mock.calls.at(-1)?.[0]).toMatchObject({kind, page: 2, pageSize: 50});
  expect(state.choices.mock.calls.every(c => c[0].kind === kind)).toBe(true);
});
it("failed choice loading keeps the payroll draft and blocks saving until explicit retry", async () => {
  mount(); await screen.findAllByText(token("salary-components")); fireEvent.click(section("salary-components").getByRole("button", {name: "Edit record"})); const dialog = await screen.findByRole("dialog", {name: "Edit Salary Component"}); await screen.findByText("Selected synthetic legacy value");
  fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "Unsaved synthetic payroll draft"}});
  state.choices.mockRejectedValue(new ReadError("Choice failure", 400));
  fireEvent.click(within(dialog).getByRole("combobox", {name: "Component Type"}));
  fireEvent.change(await screen.findByPlaceholderText("Search..."), {target: {value: "test"}});
  await screen.findByText(/Choices could not be loaded. Your entries are retained/); expect((within(dialog).getByRole("button", {name: /^Save /}) as HTMLButtonElement).disabled).toBe(true); expect((within(dialog).getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Unsaved synthetic payroll draft");
  state.choices.mockImplementation(async (input: ChoiceInput) => ({kind: input.kind, employeeId: input.employeeId, page: input.page, pageSize: input.pageSize, rows: [], selected: {id: 100, code: "SYNTH", name_en: "Selected synthetic legacy value", name_ar: null, is_active: false}, totalCount: 0}));
  fireEvent.click(screen.getByRole("button", {name: "Retry component type choices"})); await waitFor(() => expect((within(dialog).getByRole("button", {name: /^Save /}) as HTMLButtonElement).disabled).toBe(false)); expect((within(dialog).getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Unsaved synthetic payroll draft");
});
it("account change closes a private editor, cancels the old choice request and clears its cache", async () => {
  const view = mount(); await screen.findAllByText(token("salary-components")); fireEvent.click(section("salary-components").getByRole("button", {name: "Edit record"})); await screen.findByRole("dialog", {name: "Edit Salary Component"}); await screen.findByText("Selected synthetic legacy value");
  fireEvent.change(screen.getByLabelText("Notes"), {target: {value: "Private unsaved notes"}});
  view.replace({...context, profile: {...context.profile!, id: 7, auth_user_id: "other-actor"}});
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull()); expect(view.onChildOpen).toHaveBeenLastCalledWith(false); expect(view.client.getQueryCache().getAll().some(q => q.queryKey.includes(hrPayrollReadIdentity(context)))).toBe(false); expect(screen.queryByDisplayValue("Private unsaved notes")).toBeNull();
});
it("double Save dispatches once and explicit uncertain retry preserves the original operation",async()=>{
 let reject!:(reason:unknown)=>void;state.mutations.updateEmployeeSalaryComponent.mockImplementation(()=>new Promise((_,no)=>{reject=no;}));
 mount();await screen.findAllByText(token("salary-components"));fireEvent.click(section("salary-components").getByRole("button",{name:"Edit record"}));const dialog=await screen.findByRole("dialog",{name:"Edit Salary Component"});await screen.findByText("Selected synthetic legacy value");
 const save=within(dialog).getByRole("button",{name:/^Save /});fireEvent.click(save);fireEvent.click(save);await waitFor(()=>expect(state.mutations.updateEmployeeSalaryComponent).toHaveBeenCalledOnce());
 await act(async()=>reject(Error("Synthetic response lost after mock commit")));await screen.findByText(/The result is unconfirmed/);expect(state.success).not.toHaveBeenCalled();expect(state.mutations.updateEmployeeSalaryComponent).toHaveBeenCalledOnce();
 fireEvent.click(within(dialog).getByRole("button",{name:"Retry unchanged payroll change"}));await waitFor(()=>expect(state.mutations.updateEmployeeSalaryComponent).toHaveBeenCalledTimes(2));expect(state.mutations.updateEmployeeSalaryComponent.mock.calls[1]).toEqual(state.mutations.updateEmployeeSalaryComponent.mock.calls[0]);
});
it("injected legacy search is not sent, exposes correction feedback and cannot claim an empty payroll result", async () => {
  mount(); await screen.findAllByText(token("holds")); const count = state.transport.mock.calls.filter(c => c[0] === "hr-payroll-records" && c[1].kind === "holds").length;
  recordSearch("holds", "x".repeat(201)); await screen.findByText(/Invalid criteria were not sent/);
  expect(state.transport.mock.calls.filter(c => c[0] === "hr-payroll-records" && c[1].kind === "holds")).toHaveLength(count); expect(section("holds").queryByText("No permitted records match this view.")).toBeNull();
});
it("transient read retries once while remaining a failed result after the second attempt", async () => {
  state.page.mockImplementation(async (input: PageInput) => {if (input.kind === "holds") throw new ReadError("Synthetic unavailable", 503); return {rows: [], totalCount: 0};});
  mount(); await screen.findByText(/This is not an empty result/, {}, {timeout: 5000}); expect(state.page.mock.calls.filter(c => c[0].kind === "holds")).toHaveLength(2); expect(section("holds").queryByText("No permitted records match this view.")).toBeNull();
});
it("injected legacy search wins and aborts its obsolete request", async () => {
  let finish!: (data: unknown) => void; let oldSignal: AbortSignal | undefined;
  state.page.mockImplementation(async (input: PageInput, signal: AbortSignal) => input.kind === "holds" && input.search === "old" ? new Promise(resolve => {finish = resolve; oldSignal = signal;}) : {rows: [payrollRecordFixture(input.kind, input.search === "new" ? 2 : 1)], totalCount: 1});
  mount(); await screen.findAllByText(token("holds"));
  recordSearch("holds", "old"); await waitFor(() => expect(oldSignal).toBeDefined()); recordSearch("holds", "new"); await screen.findAllByText(token("holds", 2));
  await act(async () => finish({rows: [payrollRecordFixture("holds", 99)], totalCount: 1})); expect(oldSignal?.aborted).toBe(true); expect(screen.queryAllByText(token("holds", 99))).toHaveLength(0);
});
it("failed salary aggregate does not display a zero salary or absent salary profile", async () => {
  state.point.mockImplementation(async (input: PointInput) => {if (input.kind === "salary-totals") throw new ReadError("Controlled aggregate error", 400); return input.kind === "profile" ? payrollProfileFixture : {profile: redactWpsProfile(payrollWpsFixture, true), readiness: {status: "ready", missingRequirements: []}};});
  mount(); await screen.findByText("Salary unavailable"); expect(screen.queryByText("No payroll profile configured yet.")).toBeNull(); expect(screen.queryByText("AED 0.00")).toBeNull();
});
it("new payroll profile setup does not depend on the aggregate that requires that profile", async () => {
  state.point.mockImplementation(async(input:PointInput)=>{if(input.kind==='profile')return null;if(input.kind==='salary-totals')throw new ReadError('Profile not configured',400);return {profile:null,readiness:{status:'not_enrolled',missingRequirements:['WPS profile not configured']}};});
  mount();const setup=await screen.findByRole('button',{name:'Setup Profile'});await waitFor(()=>expect(setup).toHaveProperty('disabled',false));fireEvent.click(setup);
  const dialog=await screen.findByRole('dialog',{name:'Setup Salary Profile'});fireEvent.change(within(dialog).getByLabelText('Effective Date'),{target:{value:'2026-10-23'}});fireEvent.change(within(dialog).getByLabelText('Currency'),{target:{value:'USD'}});
  fireEvent.click(within(dialog).getByRole('button',{name:'Save salary profile'}));await waitFor(()=>expect(state.mutations.createOrUpdateEmployeePayrollProfile).toHaveBeenCalledTimes(1));expect(state.mutations.createOrUpdateEmployeePayrollProfile.mock.calls[0][1]).toMatchObject({currency:'USD',effective_date:'2026-10-23'});expect(screen.queryByText('AED 0.00')).toBeNull();
});
it("active hold KPI remains complete when no filtered rows match", async () => {
  state.page.mockImplementation(async (input: PageInput) => ({rows: [], totalCount: 0, ...(input.kind === "holds" ? {activeCount: 1107} : {})}));
  mount(); await section("holds").findByText("1107 Active"); expect(section("holds").getByText("0 matching holds")).toBeTruthy(); expect(section("holds").getByText("No related records yet.")).toBeTruthy();
});

type MutationJourney = {name: string; mutation: string; affected: Array<"salary" | "wps">; button: string; section?: PayrollRecordKind; dialog?: string; submit?: string; revisionHistoryOnly?: boolean};
const mutationJourneys: MutationJourney[] = [
  {name: "payroll profile save", mutation: "createOrUpdateEmployeePayrollProfile", affected: ["salary", "wps"], button: "Edit Profile", dialog: "Edit Salary Profile"},
  {name: "component save", mutation: "updateEmployeeSalaryComponent", affected: ["salary", "wps"], button: "Edit record", section: "salary-components", dialog: "Edit Salary Component"},
  {name: "component archive", mutation: "archiveEmployeeSalaryComponent", affected: ["salary", "wps"], button: "Archive record", section: "salary-components", dialog:"Archive Salary Component",submit:"Archive salary component"},
  {name: "pending salary proposal (not an application)", mutation: "createEmployeeSalaryRevision", affected: [], button: "Record Revision", dialog: "Record Salary Revision", submit: "Save salary revision"},
  {name: "history-only salary revision", mutation: "createEmployeeSalaryRevision", affected: [], button: "Record Revision", dialog: "Record Salary Revision", submit: "Save salary revision", revisionHistoryOnly: true},
  {name: "WPS profile save", mutation: "createOrUpdateEmployeeWpsProfile", affected: ["wps"], button: "Edit WPS Profile", dialog: "Edit WPS / Bank Details"},
  {name: "hold placement", mutation: "placeEmployeePayrollHold", affected: ["salary", "wps"], button: "Place Hold", dialog: "Place Payroll Hold", submit: "Save payroll hold"},
  {name: "hold release", mutation: "releaseEmployeePayrollHold", affected: ["salary", "wps"], button: "Release", section: "holds",dialog:"Release Payroll Hold",submit:"Release payroll hold"},
  {name: "hold archive", mutation: "archiveEmployeePayrollHold", affected: ["wps"], button: "Archive record", section: "holds",dialog:"Archive Payroll Hold",submit:"Archive payroll hold"},
];
it.each(mutationJourneys.flatMap(journey => [true, false].map(success => ({...journey, success}))))("$name (confirmed success=$success) refreshes active inquiry consumers only after success", async journey => {
  // The real UI permits archiving a released hold, not an active hold.
  if (journey.mutation === "archiveEmployeePayrollHold") state.page.mockImplementation(async (input: PageInput) => ({rows: [{...payrollRecordFixture(input.kind), ...(input.kind === "holds" ? {is_active: false, release_date: "2026-01-02"} : {})}], totalCount: 1, ...(input.kind === "holds" ? {activeCount: 0} : {})}));
  const view = mount(); await screen.findAllByText(token("holds"));
  const observed = (["salary", "wps"] as const).map(kind => {
    const prefix = kind === "salary" ? "global-salary-profiles" : "global-wps-readiness";
    const key = ["hr", "payroll", prefix, "current-synthetic-principal", "counted-page", "{}"];
    const inactive = ["hr", "payroll", prefix, "different-synthetic-principal", "counted-page", "{}"];
    view.client.setQueryData(key, {revision: 1}); view.client.setQueryData(inactive, {revision: 77});
    const read = vi.fn(async () => ({revision: 2}));
    const observer = new QueryObserver(view.client, {queryKey: key, queryFn: read, staleTime: Infinity});
    return {kind, key, inactive, read, stop: observer.subscribe(() => {})};
  });
  const unrelated = ["workspace", "synthetic-unrelated-draft"];
  view.client.setQueryData(unrelated, {text: "retain this draft"});
  state.mutations[journey.mutation].mockResolvedValue(journey.success ? {success: true} : {success: false, error: "Controlled mutation rejection"});
  try {
    fireEvent.click((journey.section ? section(journey.section) : screen).getByRole("button", {name: journey.button}));
    if (journey.dialog) {
      const dialog = await screen.findByRole("dialog", {name: journey.dialog});
      if (journey.mutation === "createEmployeeSalaryRevision") {
        fireEvent.change(within(dialog).getByLabelText("New Basic (profile currency)"), {target: {value: "1400"}});
        if (journey.revisionHistoryOnly) fireEvent.click(within(dialog).getByRole("switch"));
      }
      if (journey.mutation === "placeEmployeePayrollHold") fireEvent.change(within(dialog).getByLabelText("Hold Reason"), {target: {value: "Synthetic cache refresh check"}});
      const save = within(dialog).getByRole("button", {name: journey.submit ?? /^Save /});
      await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
      fireEvent.click(save);
    }
    await waitFor(() => expect(state.mutations[journey.mutation]).toHaveBeenCalledTimes(1));
    if(journey.success)await waitFor(()=>expect(state.success).toHaveBeenCalled());
    else{await screen.findByText('Controlled mutation rejection');expect(state.success).not.toHaveBeenCalled();}
    await act(async () => {await new Promise(resolve => setTimeout(resolve, 0));});
    for (const consumer of observed) {
      const refreshed = journey.success && journey.affected.includes(consumer.kind);
      expect(consumer.read).toHaveBeenCalledTimes(refreshed ? 1 : 0);
      expect(view.client.getQueryData(consumer.key)).toEqual({revision: refreshed ? 2 : 1});
      expect(view.client.getQueryData(consumer.inactive)).toEqual({revision: 77});
      expect(view.client.getQueryState(consumer.inactive)?.fetchStatus).toBe("idle");
    }
    expect(view.client.getQueryData(unrelated)).toEqual({text: "retain this draft"});
    if (!journey.success && journey.dialog) expect(screen.getByRole("dialog", {name: journey.dialog})).toBeTruthy();
  } finally {observed.forEach(consumer => consumer.stop());}
});

function mountWithInquiries() {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, retryDelay: 0, staleTime: 60000}}}); clients.push(client);
  const view = render(<QueryClientProvider client={client}><WorkspaceUiMemoryProvider>
    <EmployeePayrollTab employeeId={880301} authContext={context} />
    <div data-testid="salary-inquiry"><HrSalariesPageClient authContext={context} /></div>
    <div data-testid="wps-inquiry"><HrWpsPageClient authContext={context} /></div>
  </WorkspaceUiMemoryProvider></QueryClientProvider>);
  return {...view, client};
}
const inquiryView = (kind: PayrollInquiryKind) => within(screen.getByTestId(`${kind}-inquiry`));
const inquiryReads = (kind: PayrollInquiryKind) => state.inquiry.mock.calls.filter(c => c[0].kind === kind);
async function readyInquiries() {
  await screen.findAllByText(token("salary-components"));
  for (const kind of ["salary", "wps"] as const) await inquiryView(kind).findByText("1 matching permitted employees");
}
async function openPayrollSave(journey: MutationJourney) {
  fireEvent.click((journey.section ? section(journey.section) : screen).getByRole("button", {name: journey.button}));
  const dialog = await screen.findByRole("dialog", {name: journey.dialog!}), save = within(dialog).getByRole("button", {name: /^Save /});
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  return {dialog, save};
}
type InquiryPending = {input: PayrollInquiryCriteria; signal: AbortSignal; finish: (page: ReturnType<typeof payrollInquiryPage>) => void};
const inquirySaveJourneys = mutationJourneys.filter(j => ["updateEmployeeSalaryComponent", "createOrUpdateEmployeePayrollProfile", "createOrUpdateEmployeeWpsProfile"].includes(j.mutation));
it.each(inquirySaveJourneys)("$name reaches the actual inquiry A→B→A debounce race without replaying its confirmed write", async journey => {
  let finishWrite!: (result: {success: boolean}) => void;
  state.mutations[journey.mutation].mockImplementation(() => new Promise(resolve => {finishWrite = resolve;}));
  const view = mountWithInquiries(); await readyInquiries();
  const old: Partial<Record<PayrollInquiryKind, InquiryPending>> = {}, fresh: typeof old = {};
  let confirmed = false;
  state.inquiry.mockImplementation((input: PayrollInquiryCriteria, signal: AbortSignal) => new Promise(resolve => {
    (confirmed ? fresh : old)[input.kind] = {input, signal, finish: resolve};
  }));
  const queries = (["salary", "wps"] as const).map(kind => {
    const query = view.client.getQueryCache().find({queryKey: [...payrollInquiryPrefix(kind), payrollInquiryIdentity(context)], exact: false})!;
    expect(query).toBeDefined(); return {kind, query, data: query.state.data};
  });
  for (const kind of journey.affected) fireEvent.click(inquiryView(kind).getByRole("button", {name: "Refresh records"}));
  await waitFor(() => {for (const kind of journey.affected) expect(old[kind]).toBeDefined();});
  // Advance only well below 250 ms: React/Query notifications settle, B never becomes effective.
  vi.useFakeTimers({toFake: ["setTimeout", "clearTimeout"]});
  try {
    for (const kind of journey.affected) fireEvent.change(inquiryView(kind).getByPlaceholderText("Search all permitted records…"), {target: {value: "B pending"}});
    await act(async () => {});
    for (const {kind, query} of queries.filter(q => journey.affected.includes(q.kind))) {
      expect(query.getObserversCount()).toBe(1); expect(query.isActive()).toBe(false); expect(query.state.fetchStatus).toBe("fetching");
      expect(inquiryReads(kind)).toHaveLength(2);
    }
    // Enter pending search while the inquiry is accessible, then open the real
    // modal. Its sibling controls stay inaccessible until confirmed save closes it.
    fireEvent.click((journey.section ? section(journey.section) : screen).getByRole("button", {name: journey.button}));
    await act(async () => {await vi.advanceTimersByTimeAsync(5);});
    const dialog = screen.getByRole("dialog", {name: journey.dialog!}), save = within(dialog).getByRole("button", {name: /^Save /});
    // Component detail opens the dialog asynchronously; allow the subsequently
    // mounted choice reader's notification before using its enabled Save control.
    await act(async () => {await vi.advanceTimersByTimeAsync(5);});
    expect((save as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(save); await act(async () => {});
    expect(state.mutations[journey.mutation]).toHaveBeenCalledTimes(1);
    confirmed = true;
    await act(async () => {finishWrite({success: true}); await vi.advanceTimersByTimeAsync(5);});
    for (const kind of journey.affected) expect.soft(old[kind]!.signal.aborted).toBe(true);
    await act(async () => {
      for (const kind of journey.affected) old[kind]!.finish(payrollInquiryPage(old[kind]!.input, {first: 99, count: 3}));
      await vi.advanceTimersByTimeAsync(5);
    });
    for (const kind of journey.affected) fireEvent.change(inquiryView(kind).getByPlaceholderText("Search all permitted records…"), {target: {value: ""}});
    await act(async () => {await vi.advanceTimersByTimeAsync(5);});
    await act(async () => {
      for (const kind of journey.affected) {
        const pending = fresh[kind];
        if (pending) pending.finish(payrollInquiryPage(pending.input, {first: 51, count: 2}));
      }
      await vi.advanceTimersByTimeAsync(5);
    });
    for (const {kind, query, data} of queries) {
      if (journey.affected.includes(kind)) {
        expect(inquiryView(kind).queryByText("Synthetic payroll employee 99")).toBeNull();
        expect(inquiryView(kind).getByText("Synthetic payroll employee 51")).toBeTruthy();
        expect(inquiryView(kind).getByText("2 matching permitted employees")).toBeTruthy();
        expect(inquiryReads(kind)).toHaveLength(3);
        expect(query.state.data).toEqual(payrollInquiryPage(fresh[kind]!.input, {first: 51, count: 2}));
      } else {
        expect(inquiryReads(kind)).toHaveLength(1); expect(query.state.data).toBe(data); expect(query.state.isInvalidated).toBe(false);
        expect(inquiryView(kind).getByText("1 matching permitted employees")).toBeTruthy();
      }
    }
    expect(state.inquiry.mock.calls.every(c => c[0].search === "")).toBe(true);
    expect(state.mutations[journey.mutation]).toHaveBeenCalledTimes(1); expect(state.success).toHaveBeenCalledOnce(); expect(state.error).not.toHaveBeenCalled();
  } finally {view.unmount(); view.client.clear(); vi.useRealTimers();}
});
it.each((["salary", "wps"] as const).flatMap(kind => ([403, 503, "malformed"] as const).map(failure => ({kind, failure}))))(
  "confirmed component save plus $kind $failure read failure never becomes a failed/uncertain business write",
  async ({kind, failure}) => {
    const journey = inquirySaveJourneys.find(j => j.mutation === "updateEmployeeSalaryComponent")!;
    const view = mountWithInquiries(); await readyInquiries(); const {save} = await openPayrollSave(journey);
    state.inquiry.mockImplementation(async (input: PayrollInquiryCriteria) => {
      const page = payrollInquiryPage(input, {first: 51, count: 1});
      if (input.kind !== kind) return page;
      if (failure === "malformed") return {...page, totalCount: 2};
      throw new ReadError("SYNTHETIC_PRIVATE_INQUIRY_FAILURE", failure);
    });
    state.mutations[journey.mutation].mockResolvedValue({success: true}); fireEvent.click(save);
    await inquiryView(kind).findByRole("alert");
    await waitFor(() => expect(state.success).toHaveBeenCalledOnce());
    expect(state.error).not.toHaveBeenCalled(); expect(screen.queryByRole("dialog")).toBeNull();
    expect(inquiryView(kind).queryByText("Synthetic payroll employee 1")).toBeNull();
    expect(inquiryView(kind).queryByText("0 matching permitted employees")).toBeNull();
    expect(inquiryView(kind).queryByText("Ready")).toBeNull(); expect(screen.queryByText("SYNTHETIC_PRIVATE_INQUIRY_FAILURE")).toBeNull();
    expect(inquiryReads(kind)).toHaveLength(failure === 403 ? 2 : 3);
    state.inquiry.mockImplementation(async (input: PayrollInquiryCriteria) => payrollInquiryPage(input, {first: 51, count: 2}));
    if (failure === 403) {
      expect(inquiryView(kind).getByText(/restricted for this session/)).toBeTruthy();
      expect(inquiryView(kind).queryByRole("button", {name: "Retry loading records"})).toBeNull();
      expect(inquiryView(kind).queryByRole("button", {name: "Refresh records"})).toBeNull();
      // A sibling rerender may rebuild an empty disabled Query after removal;
      // the session latch must keep every retained Query private-data-free/idle.
      for (const query of view.client.getQueryCache().findAll({queryKey: [...payrollInquiryPrefix(kind), payrollInquiryIdentity(context)]})) {
        expect(query.state.data).toBeUndefined(); expect(query.state.fetchStatus).toBe("idle"); expect(query.isActive()).toBe(false);
      }
    } else {
      fireEvent.click(inquiryView(kind).getByRole("button", {name: "Retry loading records"}));
      await inquiryView(kind).findByText("Synthetic payroll employee 51");
      expect(inquiryView(kind).getByText("2 matching permitted employees")).toBeTruthy(); expect(inquiryReads(kind)).toHaveLength(4);
    }
    expect(state.mutations[journey.mutation]).toHaveBeenCalledTimes(1); expect(state.error).not.toHaveBeenCalled();
  },
);
it.each(["rejected", "unknown"] as const)("%s component write retains its draft and never notifies actual inquiry consumers", async outcome => {
  const journey = inquirySaveJourneys.find(j => j.mutation === "updateEmployeeSalaryComponent")!;
  const view = mountWithInquiries(); await readyInquiries(); const {dialog, save} = await openPayrollSave(journey);
  fireEvent.change(within(dialog).getByLabelText("Notes"), {target: {value: "Unsaved inquiry isolation draft"}});
  const original = (["salary", "wps"] as const).map(kind => ({kind, query: view.client.getQueryCache().find({queryKey: [...payrollInquiryPrefix(kind), payrollInquiryIdentity(context)], exact: false})!}));
  if (outcome === "unknown") state.mutations[journey.mutation].mockRejectedValue(Error("SYNTHETIC_PRIVATE_RESPONSE_LOSS"));
  else state.mutations[journey.mutation].mockResolvedValue({success: false, error: "Controlled rejection"});
  fireEvent.click(save);
  await screen.findByText(outcome==='unknown'?/The result is unconfirmed/:"Controlled rejection");
  expect(state.error).not.toHaveBeenCalled();
  expect(screen.getByRole("dialog", {name: journey.dialog!})).toBeTruthy();
  expect((within(dialog).getByLabelText("Notes") as HTMLTextAreaElement).value).toBe("Unsaved inquiry isolation draft");
  if (outcome === "unknown") {
    const retry=within(dialog).getByRole('button',{name:'Retry unchanged payroll change'});
    expect((retry as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByText('SYNTHETIC_PRIVATE_RESPONSE_LOSS')).toBeNull();
  }
  expect(state.mutations[journey.mutation]).toHaveBeenCalledTimes(1); expect(state.success).not.toHaveBeenCalled();
  for (const {kind, query} of original) {
    expect(inquiryReads(kind)).toHaveLength(1); expect(query.state.isInvalidated).toBe(false);
    expect(query.state.data).toEqual(payrollInquiryPage({kind}, {count: 1}));
  }
});
