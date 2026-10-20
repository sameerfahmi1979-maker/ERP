// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach, beforeEach, expect, it, vi} from "vitest";
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
const state = vi.hoisted(() => ({opening:vi.fn(),child:vi.fn(),read: vi.fn(), approve: vi.fn(), reject: vi.fn(), update: vi.fn(), archive: vi.fn(), success: vi.fn(), error: vi.fn()}));
vi.mock("@/lib/reads/client", async original => ({...await original<typeof import("@/lib/reads/client")>(), readJson: state.read}));
vi.mock("@/server/actions/hr/actions", () => ({approveEmployeeApprovalRequest: state.approve, rejectEmployeeApprovalRequest: state.reject, updateEmployeeDisciplinaryRecord: state.update, archiveEmployeeDisciplinaryRecord: state.archive}));
vi.mock("sonner", () => ({toast: {success: state.success, error: state.error}}));
vi.mock("next/navigation", () => ({usePathname: () => "/admin/hr/actions"}));

import{createWorkspaceDraftStore}from'@/lib/workspace/workspace-draft-store';
import{childOperationKey,childRecoveryMarkers}from'@/lib/hr/child-operation-state';
const drafts=vi.hoisted(()=>({store:null as ReturnType<typeof createWorkspaceDraftStore>|null}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>drafts.store}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:'global-disciplinary-test-owner'})}));
vi.mock('@/hooks/use-workspace-tab-dirty',()=>({useWorkspaceTabDirty:vi.fn()}));
vi.mock('@/server/actions/hr/child-mutation',()=>({
 readApprovalOpening:state.opening,
 readDisciplinaryOpening:async(employee:number,id:number)=>{
  try{
   const r=await state.read('hr-disciplinary-detail',{recordId:id,employeeId:employee}),row=r.data;
   if(!r.success||row.id!==id||row.employee_id!==employee)return{success:false,error:'Complete disciplinary opening could not be verified.'};
   const {disciplinaryOpeningValues}=await import('@/lib/hr/child-save-contract');
   return{success:true,revision:'4',values:disciplinaryOpeningValues.parse(Object.fromEntries(['subject','disciplinary_type','record_date','incident_date','severity','status','description','action_taken','creates_operational_block'].map(key=>[key,row[key]])))};
  }catch{return{success:false,error:'Complete disciplinary opening could not be verified.'};}
 },
 mutateHrChild:state.child,reconcileHrChild:vi.fn(),listRecentHrChildReceipts:vi.fn()
}));
beforeEach(()=>{drafts.store=createWorkspaceDraftStore();state.opening.mockResolvedValue({success:true,revision:'4',values:{approval_type:'other',request_title:'Synthetic request'}});});
const permissions = ["hr.actions.view", "hr.actions.manage", "hr.confidential.view", "hr.confidential.manage"];
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
  fireEvent.click(screen.getByRole("button", {name: /^Edit$/})); await screen.findByLabelText("Description"); const dialog = screen.getByRole("dialog"); expect(within(dialog).getByLabelText("Description")).toBeTruthy();
  const changed = mode === "suspended" ? {...context, isAccountActive: false, accountStatus: "suspended"} : mode === "password" ? {...context, profile: {...context.profile!, must_change_password: true}} : {...context, permissionCodes: ["hr.actions.view"], roleAssignments: context.roleAssignments!.map(r => ({...r, permissionCodes: ["hr.actions.view"]}))};
  view.replace(page("disciplinary", {count: 1, context: changed as AuthContext})); await screen.findByRole("alert"); expect(screen.queryByRole("dialog")).toBeNull(); expect(screen.queryByText(token("disciplinary", 1))).toBeNull();
});
it("disciplinary editing loads complete wording before opening and retains it on failure", async () => {
  let finish!: (v: unknown) => void; state.read.mockImplementation(() => new Promise(r => {finish = r;})); state.child.mockResolvedValue({success: false, error: "Synthetic validation failure",uncertain:false});
  mount(page("disciplinary", {count: 1})); await ready("disciplinary"); fireEvent.click(screen.getByRole("button", {name: /^Edit$/}));
  await screen.findByText("Loading current record and its revision…"); expect(screen.queryByLabelText("Description")).toBeNull(); expect(state.read.mock.calls[0].slice(0, 2)).toEqual(["hr-disciplinary-detail", {recordId: 1, employeeId: 100}]);
  await act(async () => finish({success: true, data: full("disciplinary", 1)})); await screen.findByLabelText("Description"); const dialog = screen.getByRole("dialog");
  expect((within(dialog).getByLabelText("Description") as HTMLTextAreaElement).value).toBe("SYNTHETIC_PRIVATE_DISCIPLINE");
  fireEvent.change(within(dialog).getByLabelText("Description"), {target: {value: "Retained edited wording"}});
  fireEvent.click(within(dialog).getByRole("button", {name: /^Save/})); await waitFor(() => expect(state.child).toHaveBeenCalledTimes(1));
  expect(state.child.mock.calls[0][0]).toMatchObject({kind:"disciplinary",employeeId:100,id:1,revision:"4",values:{description:"Retained edited wording",action_taken:"Retain full action"}}); expect(state.child.mock.calls[0][1]).toMatchObject({revision:"4",operationId:expect.any(String)});expect(state.update).not.toHaveBeenCalled(); expect((within(dialog).getByLabelText("Description") as HTMLTextAreaElement).value).toBe("Retained edited wording");
});
it("failed or mismatched detail never opens a partial editor", async () => {
  state.read.mockResolvedValue({success: true, data: {...full("disciplinary", 1), id: 999}}); mount(page("disciplinary", {count: 1})); await ready("disciplinary");
  fireEvent.click(screen.getByRole("button", {name: /^Edit$/})); await screen.findByRole("alert"); expect(screen.queryByLabelText("Description")).toBeNull(); expect(state.child).not.toHaveBeenCalled();expect(state.update).not.toHaveBeenCalled();
});
it('global disciplinary uncertainty can detach through the actual dialog without retaining wording or accepting a late result',async()=>{
 let finish!:(value:unknown)=>void;state.child.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));state.read.mockResolvedValue({success:true,data:full('disciplinary',1)});
 mount(page('disciplinary',{count:1}));await ready('disciplinary');fireEvent.click(screen.getByRole('button',{name:/^Edit$/}));
 const description=await screen.findByLabelText('Description');fireEvent.change(description,{target:{value:'GLOBAL_PRIVATE_DRAFT'}});fireEvent.click(screen.getByRole('button',{name:'Save record'}));await waitFor(()=>expect(state.child).toHaveBeenCalledOnce());
 const [request,contract]=state.child.mock.calls[0];fireEvent.click(screen.getByRole('button',{name:'Close and check later'}));await waitFor(()=>expect(screen.queryByLabelText('Description')).toBeNull());
 const actor='6:synthetic-inquiry-owner';expect(childRecoveryMarkers(drafts.store!,actor)).toHaveLength(1);expect(drafts.store!.getViewState(childOperationKey(actor,100,'disciplinary'))).not.toContain('GLOBAL_PRIVATE_DRAFT');
 await act(async()=>finish({success:true,data:{kind:'disciplinary',employee_id:request.employeeId,id:request.id,revision:'5',operation_id:contract.operationId,replayed:false}}));expect(state.success).not.toHaveBeenCalled();expect(state.update).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Check unconfirmed HR child changes'}));expect(await screen.findByText(/Earlier disciplinary record change/)).toBeTruthy();
});
it('failed global inquiry refresh retains the current private draft and blocks a new dispatch',async()=>{
 state.read.mockResolvedValue({success:true,data:full('disciplinary',1)});const view=mount(page('disciplinary',{count:1}));await ready('disciplinary');fireEvent.click(screen.getByRole('button',{name:/^Edit$/}));const description=await screen.findByLabelText('Description');fireEvent.change(description,{target:{value:'RETAINED_GLOBAL_DRAFT'}});
 state.read.mockRejectedValue(new ReadError('Synthetic counted-page failure',400));await act(async()=>{await view.client.invalidateQueries({queryKey:['hr','actions','global-disciplinary']});});
 await screen.findByRole('alert');expect((screen.getByLabelText('Description')as HTMLTextAreaElement).value).toBe('RETAINED_GLOBAL_DRAFT');expect((screen.getByRole('button',{name:'Save record'})as HTMLButtonElement).disabled).toBe(true);expect(state.child).not.toHaveBeenCalled();
 state.read.mockImplementation((resource,p)=>Promise.resolve(resource==='hr-disciplinary-detail'?{success:true,data:full('disciplinary',1)}:envelope(p,1,1)));fireEvent.click(screen.getByRole('button',{name:'Retry current list'}));await waitFor(()=>expect((screen.getByRole('button',{name:'Save record'})as HTMLButtonElement).disabled).toBe(false));expect((screen.getByLabelText('Description')as HTMLTextAreaElement).value).toBe('RETAINED_GLOBAL_DRAFT');expect(state.child).not.toHaveBeenCalled();
});
it('global archival wording does not claim permanent deletion and uses the revision-bound confirmation',async()=>{
 state.read.mockResolvedValue({success:true,data:full('disciplinary',1)});mount(page('disciplinary',{count:1}));await ready('disciplinary');expect(screen.queryByRole('button',{name:'Delete'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Archive'}));await screen.findByText(/Archive record #1 using its verified opening revision/);expect(screen.queryByText(/permanently remove/)).toBeNull();expect(state.archive).not.toHaveBeenCalled();expect(state.child).not.toHaveBeenCalled();
});
it('global acknowledgement correction remains available as an explicit operation rather than an unversioned checkbox',async()=>{
 const original=page('disciplinary',{count:1})as React.ReactElement<React.ComponentProps<typeof HrDisciplinaryPageClient>>;
 const seeded={...original.props.initialPage!,rows:[hrActionInquiryRowSchemas.disciplinary.parse({...full('disciplinary',1),acknowledged_by_employee:true})]}as HrActionInquiryPage;
 state.read.mockResolvedValue({success:true,data:{...full('disciplinary',1),acknowledged_by_employee:true}});
 mount(React.cloneElement(original,{initialPage:seeded}));fireEvent.click(await screen.findByRole('button',{name:'Correct acknowledgement'}));await screen.findByText(/recorded in error/);expect(screen.queryByLabelText('Description')).toBeNull();expect(state.update).not.toHaveBeenCalled();expect(state.child).not.toHaveBeenCalled();
});
it("approval double-click opens one revision-bound editor and dispatches one sealed decision", async () => {
 let finish!:(value:unknown)=>void;state.child.mockImplementation(()=>new Promise(r=>{finish=r;}));state.read.mockImplementation((_r,p)=>Promise.resolve(envelope(p,1,1)));
 mount(page("approvals",{count:1}));await ready("approvals");const open=screen.getByRole("button",{name:/^Approve$/});fireEvent.click(open);fireEvent.click(open);
 await screen.findByLabelText('Decision notes (optional)');expect(state.opening).toHaveBeenCalledWith(100,1,'approve');expect(state.approve).not.toHaveBeenCalled();
 const submit=screen.getByRole('button',{name:'Approve request'});fireEvent.click(submit);fireEvent.click(submit);await waitFor(()=>expect(state.child).toHaveBeenCalledOnce());
 const [request,contract]=state.child.mock.calls[0];expect(request).toEqual({kind:'approval',employeeId:100,id:1,revision:'4',action:'approve',values:{reason:''}});
 await act(async()=>finish({success:true,data:{kind:'approval',employee_id:100,id:1,revision:'5',operation_id:contract.operationId,replayed:false}}));await waitFor(()=>expect(state.read).toHaveBeenCalledOnce());expect(lastParams().kind).toBe('approvals');
});
it('global approval retains decision wording during ordinary list failure and can retry admission',async()=>{
 state.read.mockImplementation((_r,p)=>Promise.resolve(envelope(p,1,1)));const view=mount(page('approvals',{count:1}));fireEvent.click(await screen.findByRole('button',{name:/^Reject$/}));fireEvent.change(await screen.findByLabelText('Reason'),{target:{value:'PRIVATE_GLOBAL_DECISION'}});
 state.read.mockRejectedValue(new ReadError('Synthetic list failure',400));await act(async()=>{await view.client.invalidateQueries({queryKey:['hr','actions','global-approvals']});});
 await screen.findByText(/approval list changed or is unavailable/i);expect((screen.getByLabelText('Reason')as HTMLTextAreaElement).value).toBe('PRIVATE_GLOBAL_DECISION');expect((screen.getByRole('button',{name:'Reject request'})as HTMLButtonElement).disabled).toBe(true);expect(state.child).not.toHaveBeenCalled();
 state.read.mockImplementation((_r,p)=>Promise.resolve(envelope(p,1,1)));fireEvent.click(screen.getByRole('button',{name:'Retry current list'}));await waitFor(()=>expect((screen.getByRole('button',{name:'Reject request'})as HTMLButtonElement).disabled).toBe(false));expect((screen.getByLabelText('Reason')as HTMLTextAreaElement).value).toBe('PRIVATE_GLOBAL_DECISION');
});
it('global mapping hold blocks decision without hiding unrelated permitted requests',async()=>{
 state.opening.mockResolvedValue({success:false,error:'Held for approval-role mapping review'});mount(page('approvals',{count:1}));fireEvent.click(await screen.findByRole('button',{name:/^Approve$/}));await screen.findByText('Held for approval-role mapping review');expect(screen.getByText(token('approvals',1))).toBeTruthy();expect(screen.queryByLabelText('Decision notes (optional)')).toBeNull();expect(state.child).not.toHaveBeenCalled();
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
