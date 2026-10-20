// @vitest-environment jsdom
import "../remediation/f05/setup";
import React from "react";
import {afterEach,beforeEach,expect,it,vi} from "vitest";
import {act,cleanup,fireEvent,render,screen,waitFor,within} from "@testing-library/react";
import {QueryClient,QueryClientProvider} from "@tanstack/react-query";
import {WorkspaceUiMemoryProvider} from "@/hooks/use-persistent-ui-state";
import type {AuthContext} from "@/lib/rbac/check";
import {hrReadIdentity as readIdentity} from "@/lib/reads/hr-read-identity";
import {EmployeeHrActionsTab} from "@/features/hr/employees/tabs/employee-hr-actions-tab";
import {actionRecordDetail} from "./hr-action-record-fixtures";
import {HR_ACTION_RECORD_CONFIG,hrActionRecordRowSchemas, type HrActionRecordKind} from "@/lib/reads/hr-action-records-schema";
import {ReadError} from "@/lib/reads/client";
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import {childRecoveryMarkers} from '@/lib/hr/child-operation-state';
import type {ChildMutation,ChildSaveContract} from '@/lib/hr/child-save-contract';
import type {ERPChildDialogFormProps} from "@/components/erp/erp-child-dialog-form";


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

const state=vi.hoisted(()=>({
 reads:Object.fromEntries(['pro','actions','performance','disciplinary','notes','approvals','eos','clearance'].map(k=>[k,vi.fn()])),
 mutations:Object.fromEntries(['acknowledgeEmployeeDisciplinaryRecord','approveEmployeeApprovalRequest','approveEmployeePerformanceRecord','archiveEmployeeDisciplinaryRecord','archiveEmployeeHrAction','archiveEmployeeHrNote','archiveEmployeePerformanceRecord','archiveEmployeeProProcess','blockEmployeeClearanceItem','cancelEmployeeApprovalRequest','clearEmployeeClearanceItem','closeEmployeeHrAction','createEmployeeApprovalRequest','createEmployeeClearanceItem','createEmployeeDisciplinaryRecord','createEmployeeEosCase','createEmployeeHrAction','createEmployeeHrNote','createEmployeePerformanceRecord','createEmployeeProProcess','rejectEmployeeApprovalRequest','submitEmployeePerformanceRecord','updateEmployeeDisciplinaryRecord','updateEmployeeEosCase','updateEmployeeHrAction','updateEmployeePerformanceRecord','updateEmployeeProProcess'].map(n=>[n,vi.fn()])),
 details:vi.fn(),pages:vi.fn(),transport:vi.fn(),success:vi.fn(),error:vi.fn(),
 child:vi.fn(),store:null as ReturnType<typeof createWorkspaceDraftStore>|null,
 clearanceForms:[] as ERPChildDialogFormProps[],clearanceInvalidations:vi.fn()
}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>state.store}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:'clearance-privacy-owner'})}));
vi.mock('@/hooks/use-workspace-tab-dirty',()=>({useWorkspaceTabDirty:vi.fn()}));
vi.mock('sonner',()=>({toast:{success:state.success,error:state.error}}));
vi.mock('next/navigation',()=>({usePathname:()=>'/admin/hr/employees/record/880301'}));
vi.mock('@/components/erp/erp-child-dialog-form',async()=>{
 const actual=await vi.importActual<typeof import('@/components/erp/erp-child-dialog-form')>('@/components/erp/erp-child-dialog-form');
 return {...actual,ERPChildDialogForm:(props:ERPChildDialogFormProps)=>{
  if(props.open&&props.title==='Add Clearance Item')state.clearanceForms.push(props);
  return <actual.ERPChildDialogForm {...props}/>;
 }};
});
vi.mock('@/lib/query/invalidation',async()=>{
 const actual=await vi.importActual<typeof import('@/lib/query/invalidation')>('@/lib/query/invalidation');
 return {...actual,invalidateHrEmployeeClearance:(...args:Parameters<typeof actual.invalidateHrEmployeeClearance>)=>{
  state.clearanceInvalidations(...args);return actual.invalidateHrEmployeeClearance(...args);
 }};
});
vi.mock('@/server/actions/hr/actions',()=>({
 listEmployeeProProcesses:state.reads.pro,listEmployeeHrActions:state.reads.actions,
 listEmployeePerformanceRecords:state.reads.performance,listEmployeeDisciplinaryRecords:state.reads.disciplinary,
 listEmployeeHrNotes:state.reads.notes,listEmployeeApprovalRequests:state.reads.approvals,
 listEmployeeEosCases:state.reads.eos,listEmployeeClearanceItems:state.reads.clearance,...state.mutations
}));
// F11 now reads the editable PRO fields and opening revision atomically. Keep
// the real mounted editor and permissions lifecycle; mock only this read service.
vi.mock('@/server/actions/hr/child-mutation',()=>({
 readEosCaseOpening:async(_employee:number,id:number)=>{
  try{
   const raw=await state.details('eos',id)as Record<string,unknown>;
   const {eosCaseOpeningValues}=await import('@/lib/hr/child-save-contract');
   return{success:true,revision:'4',values:eosCaseOpeningValues.parse(Object.fromEntries(['eos_type','case_status','notice_date','last_working_date','reason'].map(key=>[key,raw[key]])))};
  }catch(error){return error instanceof ReadError&&error.status===403?{success:false,denied:true,error:'Current case access is unavailable.'}:{success:false,error:'The current case and revision could not be verified.'};}
 },
 readProProcessOpening:async(_employee:number,id:number)=>{
  try{
   const raw=await state.details('pro',id)as Record<string,unknown>;
   const {proProcessOpeningValues}=await import('@/lib/hr/child-save-contract');
   return{success:true,revision:'4',values:proProcessOpeningValues.parse(Object.fromEntries(['process_title','process_status','priority','request_date','target_date','notes'].map(key=>[key,raw[key]])))};
  }catch(error){return error instanceof ReadError&&error.status===403?{success:false,denied:true,error:'Current process access is unavailable.'}:{success:false,error:'The current process and revision could not be verified.'};}
 },
 readHrActionOpening:async(_employee:number,id:number)=>{
  try{
   const raw=await state.details('actions',id)as Record<string,unknown>;
   const {hrActionOpeningValues}=await import('@/lib/hr/child-save-contract');
   return{success:true,revision:'4',values:hrActionOpeningValues.parse(Object.fromEntries(['action_title','action_type','action_status','action_date','due_date','notes'].map(key=>[key,raw[key]])))};
  }catch(error){return error instanceof ReadError&&error.status===403?{success:false,denied:true,error:'Current action access is unavailable.'}:{success:false,error:'The current process and revision could not be verified.'};}
 },
 readPerformanceOpening:async(_employee:number,id:number)=>{
  try{
   const raw=await state.details('performance',id)as Record<string,unknown>;
   const {performanceOpeningValues}=await import('@/lib/hr/child-save-contract');
   return{success:true,revision:'4',values:performanceOpeningValues.parse(Object.fromEntries(['review_type','review_date','rating','summary','status'].map(key=>[key,raw[key]])))};
  }catch(error){return error instanceof ReadError&&error.status===403?{success:false,denied:true,error:'Current confidential review access is unavailable.'}:{success:false,error:'The current review and revision could not be verified.'};}
 },
 readDisciplinaryOpening:async(_employee:number,id:number)=>{
  try{
   const raw=await state.details('disciplinary',id)as Record<string,unknown>;
   const {disciplinaryOpeningValues}=await import('@/lib/hr/child-save-contract');
   return{success:true,revision:'4',values:disciplinaryOpeningValues.parse(Object.fromEntries(['subject','disciplinary_type','record_date','incident_date','severity','status','description','action_taken','creates_operational_block'].map(key=>[key,raw[key]])))};
  }catch(error){return error instanceof ReadError&&error.status===403?{success:false,denied:true,error:'Current confidential record access is unavailable.'}:{success:false,error:'The current disciplinary record and revision could not be verified.'};}
 },
 mutateHrChild:state.child,reconcileHrChild:()=>{throw Error('No recovery dispatch in read/privacy regression');},
}));
vi.mock('@/lib/reads/client',async()=>{
 const actual=await vi.importActual<typeof import('@/lib/reads/client')>('@/lib/reads/client');
 return {...actual,readJson:async(resource:string,input:{kind:HrActionRecordKind;employeeId:number;eosCaseId?:number;recordId?:number;page:number;pageSize:number},signal?:AbortSignal)=>{
  state.transport(resource,input,signal);
  if(resource==='hr-action-record-detail')return {success:true,data:{kind:input.kind,employeeId:input.employeeId,...(input.eosCaseId?{eosCaseId:input.eosCaseId}:{}),row:await state.details(input.kind,input.recordId)}};
  const supplied=await state.pages(input,signal);
  if(supplied)return {success:true,data:{kind:input.kind,employeeId:input.employeeId,...(input.eosCaseId?{eosCaseId:input.eosCaseId}:{}),rows:supplied.rows.map((r:unknown)=>hrActionRecordRowSchemas[input.kind].parse(r)),totalCount:supplied.totalCount,page:input.page,pageSize:input.pageSize}};
  let rows:unknown[];
  try{rows=await state.reads[input.kind](input.kind==='clearance'?input.eosCaseId:input.employeeId);}catch{throw new actual.ReadError('Controlled invalid-read failure (no transient retry)',400);}
  return {success:true,data:{kind:input.kind,employeeId:input.employeeId,...(input.eosCaseId?{eosCaseId:input.eosCaseId}:{}),rows:rows.map(r=>hrActionRecordRowSchemas[input.kind].parse(r)),totalCount:rows.length,page:input.page,pageSize:input.pageSize}};
 }};
});
const kinds=['pro','actions','performance','disciplinary','notes','approvals','eos'] as const;
const permissionCodes=['hr.actions.view','hr.actions.manage','hr.confidential.view','hr.confidential.manage'];
const context={profile:{id:6,auth_user_id:'synthetic-old-actor',must_change_password:false},
 accountStatus:'active',isAccountActive:true,permissionCodes,roleCodes:['hr_scoped'],
 roleAssignments:[{roleId:880106,roleCode:'hr_scoped',ownerCompanyId:880101,branchId:null,permissionCodes}]} as unknown as AuthContext;
const changedScope=()=>({...context,roleAssignments:context.roleAssignments!.map(a=>({...a,branchId:880202}))});
const day=(id:number)=>String((id-1)%28+1).padStart(2,'0');
const token=(kind:string,id=1)=>kind==='eos'?`Last working date: 2026-04-${day(id)}`:kind==='performance'?`2026-05-${day(id)}`:kind==='notes'?`Note #${id} · confidential`:`PRIVATE_SYNTHETIC_${kind.toUpperCase()}_${id}`;
function row(kind:string,id=1){return {...actionRecordDetail(kind as HrActionRecordKind,id,880301),id,employee_id:880301,process_title:token(kind,id),process_status:'draft',priority:'normal',request_date:'2026-01-01',target_date:null,
 action_title:token(kind,id),action_type:'general',action_status:'open',action_date:'2026-01-01',due_date:null,
 review_type:'annual',review_date:`2026-05-${day(id)}`,summary:token(kind,id),rating:'good',
 disciplinary_type:'written_warning',record_date:'2026-01-01',severity:'medium',subject:token(kind,id),description:null,
 note_type:'confidential',note_text:token(kind,id),visibility:'restricted',created_at:'2026-01-01T00:00:00Z',
 approval_type:'other',request_title:token(kind,id),request_status:'pending',requested_at:'2026-01-01T00:00:00Z',
 eos_type:'resignation',case_status:'draft',notice_date:null,last_working_date:`2026-04-${day(id)}`,reason:token(kind,id),final_settlement_status:'not_started',clearance_completed:false,
 eos_case_id:1,clearance_area:'it',item_status:'pending',item_title:token(kind,id),status:kind==='disciplinary'?'open':'draft'};}
const clients:QueryClient[]=[];
beforeEach(()=>{
 state.store=createWorkspaceDraftStore();state.child.mockImplementation(async(r:ChildMutation,c:ChildSaveContract)=>{if(r.kind!=='clearance')throw Error('Read/privacy regression must not issue an unrelated mutation');return clearanceReply(r,c);});
 for(const [kind,read]of Object.entries(state.reads))read.mockResolvedValue([row(kind)]);
 state.details.mockImplementation(async(kind:string,id:number)=>row(kind,id));
 for(const action of Object.values(state.mutations))action.mockImplementation(()=>{throw Error('Privacy tests must not execute business mutations');});
});
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());state.clearanceForms.length=0;for(const mock of [...Object.values(state.reads),...Object.values(state.mutations),state.details,state.pages,state.transport,state.success,state.error,state.clearanceInvalidations,state.child])mock.mockReset();});
type LayoutProbe={layout:()=>void;passive:()=>void};
function EnclosingLayoutProbe({probe,children}:{probe?:LayoutProbe;children:React.ReactNode}){
 React.useLayoutEffect(()=>{probe?.layout();},[probe]);
 React.useEffect(()=>{probe?.passive();},[probe]);
 return <>{children}</>;
}
function mount(initial:AuthContext=context){
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:60000}}});clients.push(client);
 const onChildOpen=vi.fn(),wrap=(ctx:AuthContext,visible=true,probe?:LayoutProbe)=><QueryClientProvider client={client}><WorkspaceUiMemoryProvider><EnclosingLayoutProbe probe={probe}>{visible&&<EmployeeHrActionsTab employeeId={880301} authContext={ctx} onChildOpen={onChildOpen}/>}</EnclosingLayoutProbe></WorkspaceUiMemoryProvider></QueryClientProvider>;
 const view=render(wrap(initial));return {...view,client,onChildOpen,replace:(ctx:AuthContext,probe?:LayoutProbe)=>view.rerender(wrap(ctx,true,probe)),hide:(probe?:LayoutProbe)=>view.rerender(wrap(initial,false,probe)),restore:()=>view.rerender(wrap(initial)),inspectLayout:(probe:LayoutProbe)=>view.rerender(wrap(initial,true,probe))};
}
it.each(kinds)('%s permitted synthetic rows use counted read transport and preserve mutation invalidation prefix',async kind=>{
 const view=mount();await screen.findAllByText(token(kind));expect(state.reads[kind]).toHaveBeenCalledTimes(1);expect(state.reads[kind]).toHaveBeenCalledWith(880301);
 const cached=view.client.getQueryCache().getAll().filter(q=>q.queryKey[0]==='hr'&&q.queryKey[1]==='actions');expect(cached.length).toBeGreaterThanOrEqual(7);
 expect(cached.every(q=>q.queryKey.at(-1)===readIdentity(context))).toBe(true);
 expect(state.transport.mock.calls.filter(c=>c[0]==='hr-action-records'&&c[1].kind===kind)[0][1]).toMatchObject({kind,employeeId:880301,page:1,pageSize:25});
});
it.each(kinds)('%s narrowing branch hides old warm content and retires its cache',async kind=>{
 state.reads[kind].mockResolvedValueOnce([row(kind)]).mockImplementation(()=>new Promise(()=>{}));
 const view=mount();await screen.findAllByText(token(kind));view.replace(changedScope());expect(screen.queryAllByText(token(kind))).toHaveLength(0);
 await waitFor(()=>expect(state.reads[kind]).toHaveBeenCalledTimes(2));expect(view.client.getQueryCache().getAll().some(q=>q.queryKey.at(-1)===readIdentity(context))).toBe(false);
});
it.each(kinds)('%s changing accounts never reuses the first principal rows',async kind=>{
 state.reads[kind].mockResolvedValueOnce([row(kind)]).mockImplementation(()=>new Promise(()=>{}));
 const view=mount();await screen.findAllByText(token(kind));view.replace({...context,profile:{...context.profile!,id:7,auth_user_id:'synthetic-new-actor'}});
 expect(screen.queryAllByText(token(kind))).toHaveLength(0);await waitFor(()=>expect(state.reads[kind]).toHaveBeenCalledTimes(2));
});
it.each(kinds)('%s a retired in-flight read cannot restore old content or cache',async kind=>{
 let finish!:(v:unknown)=>void;state.reads[kind].mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue([row(kind,2)]);
 const view=mount();await waitFor(()=>expect(state.reads[kind]).toHaveBeenCalledTimes(1));view.replace(changedScope());await screen.findAllByText(token(kind,2));
 await act(async()=>finish([row(kind)]));expect(screen.queryAllByText(token(kind))).toHaveLength(0);expect(screen.queryAllByText(token(kind,2)).length).toBeGreaterThan(0);
 expect(view.client.getQueryCache().getAll().some(q=>q.queryKey.at(-1)===readIdentity(context))).toBe(false);
});
it.each(['suspended','forced-password','signed-out','view-revoked'])('%s stale capabilities cannot keep warm records or run new reads',async mode=>{
 const view=mount();await screen.findAllByText(token('notes'));
 const changed=mode==='suspended'?{...context,isAccountActive:false,accountStatus:'suspended'}:mode==='forced-password'?{...context,profile:{...context.profile!,must_change_password:true}}:mode==='signed-out'?{...context,profile:null,isAccountActive:false}:{...context,permissionCodes:[],roleAssignments:[]};
 view.replace(changed as AuthContext);expect(screen.queryAllByText(token('notes'))).toHaveLength(0);expect(screen.getByText('You do not have permission to view HR actions.')).toBeTruthy();
 for(const kind of kinds)expect(state.reads[kind]).toHaveBeenCalledTimes(1);
 await waitFor(()=>expect(view.client.getQueryCache().getAll().some(q=>q.queryKey.at(-1)===readIdentity(context))).toBe(false));
});
it('scope retirement closes private child drafts without executing a mutation',async()=>{
 const view=mount();await screen.findAllByText(token('pro'));fireEvent.click(screen.getByRole('button',{name:'Add Process'}));
 const input=await screen.findByLabelText('Process Title');fireEvent.change(input,{target:{value:'PRIVATE UNSAVED HR DRAFT'}});expect(view.onChildOpen).toHaveBeenCalledWith(true);
 view.replace(changedScope());expect(screen.queryByRole('dialog')).toBeNull();expect(screen.queryByDisplayValue('PRIVATE UNSAVED HR DRAFT')).toBeNull();expect(view.onChildOpen).toHaveBeenLastCalledWith(false);
 expect(Object.values(state.mutations).every(action=>action.mock.calls.length===0)).toBe(true);
});
it('EOS-only permission does not start the six unrelated action reads',async()=>{
 const permissions=['hr.eos.view'],ctx={...context,permissionCodes:permissions,roleAssignments:context.roleAssignments!.map(a=>({...a,permissionCodes:permissions}))};
 mount(ctx);await screen.findAllByText(token('eos'));for(const kind of kinds.filter(k=>k!=='eos'))expect(state.reads[kind]).not.toHaveBeenCalled();expect(state.reads.eos).toHaveBeenCalledTimes(1);
});
it('ordinary action viewing does not fetch confidential notes, discipline or performance without the separate permission',async()=>{
 const permissions=['hr.actions.view'],ctx={...context,permissionCodes:permissions,roleAssignments:context.roleAssignments!.map(a=>({...a,permissionCodes:permissions}))};
 mount(ctx);await screen.findAllByText(token('pro'));for(const kind of ['performance','disciplinary','notes'])expect(state.reads[kind]).not.toHaveBeenCalled();
});
it('clearance reads preserve their EOS subject and share the current principal identity',async()=>{
 const view=mount();await screen.findAllByText(token('clearance'));expect(state.reads.clearance).toHaveBeenCalledTimes(1);expect(state.reads.clearance).toHaveBeenCalledWith(1);
 const entry=view.client.getQueriesData({queryKey:['hr','actions','clearance-items',1]});expect(entry).toHaveLength(1);expect(entry[0][0].at(-1)).toBe(readIdentity(context));
});
it('branch change hides and retires an already loaded clearance record',async()=>{
 state.reads.clearance.mockResolvedValueOnce([row('clearance')]).mockImplementation(()=>new Promise(()=>{}));
 const view=mount();await screen.findAllByText(token('clearance'));view.replace(changedScope());expect(screen.queryAllByText(token('clearance'))).toHaveLength(0);
 await waitFor(()=>expect(state.reads.clearance).toHaveBeenCalledTimes(2));expect(view.client.getQueryCache().getAll().some(q=>q.queryKey.at(-1)===readIdentity(context))).toBe(false);
});
it('account change cannot reuse a warm clearance checklist',async()=>{
 state.reads.clearance.mockResolvedValueOnce([row('clearance')]).mockImplementation(()=>new Promise(()=>{}));
 const view=mount();await screen.findAllByText(token('clearance'));view.replace({...context,profile:{...context.profile!,id:7,auth_user_id:'synthetic-new-actor'}});
 expect(screen.queryAllByText(token('clearance'))).toHaveLength(0);await waitFor(()=>expect(state.reads.clearance).toHaveBeenCalledTimes(2));
});
it('late clearance reply cannot restore the previous principal checklist',async()=>{
 let finish!:(v:unknown)=>void;state.reads.clearance.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;})).mockResolvedValue([row('clearance',2)]);
 const view=mount();await waitFor(()=>expect(state.reads.clearance).toHaveBeenCalledTimes(1));view.replace(changedScope());await screen.findAllByText(token('clearance',2));
 await act(async()=>finish([row('clearance')]));expect(screen.queryAllByText(token('clearance'))).toHaveLength(0);
 expect(view.client.getQueryCache().getAll().some(q=>q.queryKey.at(-1)===readIdentity(context))).toBe(false);
});
const recordId=(kind: typeof kinds[number])=>({pro:'ProProcessesSection',actions:'HrActionsSection',performance:'PerformanceSection',disciplinary:'DisciplinarySection',notes:'HrNotesSection',approvals:'ApprovalsSection',eos:'EosSection'}[kind]);
function recordSearch(kind: typeof kinds[number], value: string){act(()=>controller(recordId(kind)).onGlobalFilterChange(value));}
const prefixes={pro:'pro-processes',actions:'hr-actions',performance:'performance',disciplinary:'disciplinary',notes:'notes',approvals:'approvals',eos:'eos-cases'};
it('EOS-only scoped manager sees the case form without acquiring unrelated HR actions',async()=>{
 const permissions=['hr.eos.view','hr.eos.manage'],ctx={...context,permissionCodes:permissions,roleAssignments:context.roleAssignments!.map(a=>({...a,permissionCodes:permissions}))};
 mount(ctx);await screen.findByText(token('eos'));expect(screen.queryByRole('button',{name:'Add Process'})).toBeNull();fireEvent.click(screen.getByRole('button',{name:'Open EOS Case'}));await screen.findByLabelText('Reason');expect(screen.getByText(/This is an end-of-service process shell only/)).toBeTruthy();expect(state.mutations.createEmployeeEosCase).not.toHaveBeenCalled();
});
it('EOS list failure retains the new-form reason and gives a local retry instead of hiding the draft',async()=>{
 const view=mount();await screen.findByText(token('eos'));fireEvent.click(screen.getByRole('button',{name:'Open EOS Case'}));fireEvent.change(await screen.findByLabelText('Reason'),{target:{value:'PRIVATE_RETAINED_EOS'}});
 state.reads.eos.mockRejectedValue(Error('Controlled EOS read failure'));await act(async()=>{await view.client.invalidateQueries({queryKey:['hr','actions','eos-cases',880301]});});await screen.findByText('Current EOS cases are unavailable. Your draft is retained; retry before saving.');expect((screen.getByLabelText('Reason')as HTMLTextAreaElement).value).toBe('PRIVATE_RETAINED_EOS');
 expect((screen.getByRole('button',{name:'Save case'})as HTMLButtonElement).disabled).toBe(true);state.reads.eos.mockResolvedValue([row('eos')]);fireEvent.click(screen.getByRole('button',{name:'Retry current list'}));await waitFor(()=>expect(screen.queryByText('Current EOS cases are unavailable. Your draft is retained; retry before saving.')).toBeNull());expect((screen.getByLabelText('Reason')as HTMLTextAreaElement).value).toBe('PRIVATE_RETAINED_EOS');expect(state.mutations.createEmployeeEosCase).not.toHaveBeenCalled();
});
const emptyText={pro:'No permitted records match this view.',actions:'No permitted records match this view.',performance:'No permitted records match this view.',disciplinary:'No permitted records match this view.',notes:'No permitted records match this view.',approvals:'No permitted records match this view.',eos:'No permitted records match this view.'};
it.each(kinds)('%s failed refresh hides warm content, does not claim empty, and manual retry recovers once',async kind=>{
 const view=mount();await screen.findAllByText(token(kind));state.reads[kind].mockRejectedValue(Error('Owned synthetic read failure'));
 await act(async()=>{await view.client.invalidateQueries({queryKey:['hr','actions',prefixes[kind],880301]});});
 await screen.findByRole('alert');expect(state.reads[kind]).toHaveBeenCalledTimes(2);expect(screen.queryAllByText(token(kind))).toHaveLength(0);expect(screen.queryByText(emptyText[kind])).toBeNull();
 state.reads[kind].mockResolvedValue([row(kind,2)]);fireEvent.click(screen.getByRole('button',{name:'Retry loading'}));await screen.findAllByText(token(kind,2));expect(state.reads[kind]).toHaveBeenCalledTimes(3);
});
it.each(['system_admin','group_admin'])('%s code on a company-scoped assignment does not grant global editing',async roleCode=>{
 const permissions=['hr.actions.view','hr.confidential.view'],ctx={...context,permissionCodes:permissions,roleCodes:[roleCode],roleAssignments:context.roleAssignments!.map(a=>({...a,roleCode,permissionCodes:permissions}))};
 mount(ctx);await screen.findAllByText(token('pro'));expect(screen.queryByRole('button',{name:'Add Process'})).toBeNull();expect(screen.queryAllByRole('button',{name:'Edit record'})).toHaveLength(0);
});

const titles={pro:'PRO Processes',actions:'HR Actions',performance:'Performance Reviews',disciplinary:'Disciplinary & Warnings',notes:'HR Notes',approvals:'Approval Requests',eos:'EOS & Clearance'};
function section(kind:typeof kinds[number]){const element=screen.getByText(titles[kind]).closest('div.rounded-lg');if(!element)throw Error('Actual section missing');return within(element as HTMLElement);}
type PageInput={kind:HrActionRecordKind;page:number;pageSize:number;search:string;columnFilters:Record<string,string>;sortKey:string;sortDir:string;eosCaseId?:number};
it.each(kinds)('%s compact Next and retained page-size controller page a 1,107-row total without confusing page length with completeness',async kind=>{
 state.pages.mockImplementation(async(input:PageInput)=>input.kind===kind?{rows:Array.from({length:Math.min(input.pageSize,1107-(input.page-1)*input.pageSize)},(_,n)=>row(kind,(input.page-1)*input.pageSize+n+1)),totalCount:1107}:undefined);
 mount();await waitFor(()=>expect(section(kind).getByText('1107')).toBeTruthy());
 expect(state.transport.mock.calls.filter(c=>c[1].kind===kind)).toHaveLength(1);
 fireEvent.click(section(kind).getAllByRole('button',{name:'Next'}).at(-1)!);
 await waitFor(()=>expect(state.transport.mock.calls.filter(c=>c[1].kind===kind).at(-1)?.[1]).toMatchObject({page:2,pageSize:25}));
 await waitFor(()=>expect(section(kind).getByText('1107')).toBeTruthy());
 expect(state.transport.mock.calls.filter(c=>c[1].kind===kind)).toHaveLength(2);
 expect(section(kind).queryByLabelText('Rows per page')).toBeNull();
 act(()=>controller(recordId(kind)).onPaginationChange({pageIndex:0,pageSize:100}));
 await waitFor(()=>expect(state.transport.mock.calls.filter(c=>c[1].kind===kind).at(-1)?.[1]).toMatchObject({page:1,pageSize:100}));
 await waitFor(()=>expect(section(kind).getByText('1107')).toBeTruthy());
});
it('invalid search criteria do not send a read or claim an empty result',async()=>{
 mount();await screen.findAllByText(token('pro'));const calls=state.transport.mock.calls.filter(c=>c[1].kind==='pro').length;
 recordSearch('pro','x'.repeat(201));
 await screen.findByText('Review the filters, search length and page criteria. Invalid criteria were not sent.');
 expect(state.transport.mock.calls.filter(c=>c[1].kind==='pro')).toHaveLength(calls);
 expect(section('pro').queryByText('No permitted records match this view.')).toBeNull();
 expect(controller(recordId('pro')).totalCount).toBeNull();
});
it('injected legacy search and sort reach the native-read criteria and page state returns from workspace memory without disk storage',async()=>{
 state.pages.mockImplementation(async(input:PageInput)=>input.kind==='pro'?{rows:[row('pro',input.search?101:input.page)],totalCount:input.search?1:1}:undefined);
 const view=mount();await screen.findAllByText(token('pro'));
 recordSearch('pro','literal %_ اختبار');
 await screen.findAllByText(token('pro',101));
 act(()=>controller(recordId('pro')).onSortingChange([{id:'process_title',desc:false}]));
 await waitFor(()=>expect(state.transport.mock.calls.filter(c=>c[1].kind==='pro').at(-1)?.[1]).toMatchObject({page:1,search:'literal %_ اختبار',sortKey:'process_title'}));
 const calls=state.transport.mock.calls.length;view.hide();view.restore();await screen.findAllByText(token('pro',101));
 expect(controller(recordId('pro')).globalFilter).toBe('literal %_ اختبار');expect(state.transport).toHaveBeenCalledTimes(calls);
 expect(Object.values(localStorage).some(v=>typeof v==='string'&&v.includes('literal %_ اختبار'))).toBe(false);
});
it('read-only EOS users can select each case checklist and selection returns with its owned workspace',async()=>{
 state.reads.eos.mockResolvedValue([row('eos',1),row('eos',2)]);state.reads.clearance.mockImplementation(async(id:number)=>[{...row('clearance',id),eos_case_id:id}]);
 const permissions=['hr.eos.view'],ctx={...context,permissionCodes:permissions,roleAssignments:context.roleAssignments!.map(a=>({...a,permissionCodes:permissions}))};
 const view=mount(ctx);await screen.findAllByText(token('clearance'));
 fireEvent.click(section('eos').getAllByRole('button',{name:'Show clearance checklist'})[1]);await screen.findAllByText(token('clearance',2));
 expect(state.reads.clearance).toHaveBeenLastCalledWith(2);expect(section('eos').queryByRole('button',{name:'Open EOS Case'})).toBeNull();
 const count=state.reads.clearance.mock.calls.length;view.hide();view.restore();await screen.findAllByText(token('clearance',2));expect(state.reads.clearance).toHaveBeenCalledTimes(count);
 expect(Object.values(state.mutations).every(m=>m.mock.calls.length===0)).toBe(true);
});
it('transient failure retries once, while a forbidden read retires every private collection without retry',async()=>{
 let calls=0;state.pages.mockImplementation(async(input:PageInput)=>{if(input.kind==='pro'&&++calls===1)throw new ReadError('Owned transient failure',503);return undefined;});
 const view=mount();await screen.findAllByText(token('pro'),{}, {timeout:4000});expect(calls).toBe(2);
 state.pages.mockImplementation(async(input:PageInput)=>{if(input.kind==='pro')throw new ReadError('Owned denial',403);return undefined;});
 const initial=state.transport.mock.calls.filter(c=>c[1].kind==='pro').length;
 await act(async()=>{await view.client.invalidateQueries({queryKey:['hr','actions','pro-processes',880301]});});
 await screen.findByText('You do not have permission to view HR actions.');expect(state.transport.mock.calls.filter(c=>c[1].kind==='pro')).toHaveLength(initial+1);
 expect(screen.queryAllByText(token('notes'))).toHaveLength(0);await waitFor(()=>expect(view.client.getQueryCache().getAll().filter(q=>q.queryKey[0]==='hr'&&q.queryKey[1]==='actions')).toHaveLength(0));
});
it('complete wording is lazy, retained in full and removed when principal access changes',async()=>{
 const full='Full synthetic confidential body '+ 'x'.repeat(5000);state.details.mockImplementation(async(kind:string,id:number)=>({...row(kind,id),note_text:full}));
 const view=mount();await screen.findAllByText(token('notes'));expect(screen.queryByText(full)).toBeNull();expect(state.details).not.toHaveBeenCalled();
 fireEvent.click(section('notes').getByRole('button',{name:'View complete details'}));await screen.findByText(full);expect(state.details).toHaveBeenCalledTimes(1);
 fireEvent.click(section('notes').getByRole('button',{name:'Hide complete details'}));expect(screen.queryByText(full)).toBeNull();
 fireEvent.click(section('notes').getByRole('button',{name:'View complete details'}));await screen.findByText(full);view.replace(changedScope());expect(screen.queryByText(full)).toBeNull();
});
it('late complete detail cannot reopen a retired private editor',async()=>{
 let finish!:(v:unknown)=>void;state.details.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const view=mount();await screen.findAllByText(token('pro'));fireEvent.click(section('pro').getByRole('button',{name:'Edit record'}));
 await waitFor(()=>expect(state.details).toHaveBeenCalledTimes(1));view.replace(changedScope());await act(async()=>finish(row('pro')));
 expect(screen.queryByRole('dialog')).toBeNull();expect(view.onChildOpen).toHaveBeenLastCalledWith(false);
});
it('failed complete detail does not open a partial editor and permits a fresh explicit retry',async()=>{
 state.details.mockRejectedValue(new ReadError('Owned point failure',400));const view=mount();await screen.findAllByText(token('pro'));
 fireEvent.click(section('pro').getByRole('button',{name:'Edit record'}));await screen.findByText('The current process and revision could not be verified.');expect(screen.queryByLabelText('Notes')).toBeNull();expect(screen.getByRole('dialog',{name:'Open PRO Process'})).toBeTruthy();
 const notes='Original complete wording '+ 'x'.repeat(5000);state.details.mockResolvedValue({...row('pro'),notes});fireEvent.click(screen.getByRole('button',{name:'Retry process opening'}));await screen.findByLabelText('Notes');
 expect((screen.getByLabelText('Notes') as HTMLTextAreaElement).value).toBe(notes);expect(Object.values(state.mutations).every(m=>m.mock.calls.length===0)).toBe(true);expect(view.onChildOpen).toHaveBeenLastCalledWith(true);
});
it.each(kinds)('%s retained controller search and two AND filters reach the guarded reader',async kind=>{
 state.pages.mockImplementation(async(input:PageInput)=>input.kind===kind?{rows:[row(kind,input.search?1101:1)],totalCount:1}:undefined);
 mount();await screen.findAllByText(token(kind));
 recordSearch(kind,'literal %_ اختبار');
 await waitFor(()=>expect(state.transport.mock.calls.filter(c=>c[1].kind===kind).at(-1)?.[1].search).toBe('literal %_ اختبار'));
 await waitFor(()=>expect(section(kind).getAllByText('1').length).toBeGreaterThan(0));
 expect(section(kind).queryByRole('button',{name:'Edit filters'})).toBeNull();
 const fields=HR_ACTION_RECORD_CONFIG[kind].fields.slice(0,2),expected:Record<string,string>={};
 for(const field of fields){let value=field.type==='date'?'2026-01-01':'Synthetic';if(field.type==='select'){if(!field.options?.[0])throw Error('Native filter options missing');value=field.options[0].value;}expected[field.id]=value;}
 act(()=>controller(recordId(kind)).onColumnFiltersChange(Object.entries(expected).map(([id,value])=>({id,value}))));
 await waitFor(()=>expect(state.transport.mock.calls.filter(c=>c[1].kind===kind).at(-1)?.[1]).toMatchObject({page:1,search:'literal %_ اختبار',columnFilters:expected}));
});
it('an obsolete search is aborted and a late response cannot replace the latest matching rows',async()=>{
 let finish!:(v:unknown)=>void;state.pages.mockImplementation(async(input:PageInput)=>{
  if(input.kind!=='pro')return undefined;
  if(input.search==='obsolete')return new Promise(resolve=>{finish=resolve;});
  return {rows:[row('pro',input.search==='latest'?3:1)],totalCount:1};
 });mount();await screen.findAllByText(token('pro'));
 recordSearch('pro','obsolete');
 await waitFor(()=>expect(finish).toBeTypeOf('function'));const obsolete=state.transport.mock.calls.find(c=>c[1].kind==='pro'&&c[1].search==='obsolete');
 recordSearch('pro','latest');await screen.findAllByText(token('pro',3));
 expect(obsolete?.[2]?.aborted).toBe(true);await act(async()=>finish({rows:[row('pro',2)],totalCount:1}));
 expect(screen.queryAllByText(token('pro',2))).toHaveLength(0);expect(screen.queryAllByText(token('pro',3)).length).toBeGreaterThan(0);
});
it.each([['pro','Notes','notes'],['actions','Notes','notes'],['performance','Summary','summary'],['disciplinary','Description','description'],['eos','Reason','reason']] as const)('%s editor receives complete original wording, not the lean list projection',async(kind,label,property)=>{
 const full='Full original synthetic editor wording '+'x'.repeat(5000);state.details.mockImplementation(async(k:string,id:number)=>({...row(k,id),[property]:full}));
 mount();await screen.findAllByText(token(kind));fireEvent.click(section(kind).getByRole('button',{name:'Edit record'}));
 expect((await screen.findByLabelText(label) as HTMLTextAreaElement).value).toBe(full);expect(Object.values(state.mutations).every(m=>m.mock.calls.length===0)).toBe(true);
});
it('an approved review has an explicit revision-bound close confirmation, not an editable status bypass',async()=>{
 state.reads.performance.mockResolvedValue([{...row('performance'),status:'approved'}]);
 state.details.mockImplementation(async(k:string,id:number)=>({...row(k,id),...(k==='performance'?{status:'approved'}:{})}));
 mount();const close=await screen.findByRole('button',{name:'Close review'});fireEvent.click(close);
 await screen.findByText(/review #.*using its verified opening revision/);
 expect(screen.queryByLabelText('Summary')).toBeNull();expect(Object.values(state.mutations).every(m=>m.mock.calls.length===0)).toBe(true);
});
it('a forbidden point-detail read retires the warm lists and never opens an editor',async()=>{
 const view=mount();await screen.findAllByText(token('pro'));state.details.mockRejectedValue(new ReadError('Owned point denial',403));
 fireEvent.click(section('pro').getByRole('button',{name:'Edit record'}));await screen.findByText('You do not have permission to view HR actions.');
 expect(state.details).toHaveBeenCalledTimes(1);expect(screen.queryByRole('dialog')).toBeNull();expect(view.onChildOpen).toHaveBeenLastCalledWith(false);
 expect(view.client.getQueryCache().getAll().filter(q=>q.queryKey[0]==='hr'&&q.queryKey[1]==='actions')).toHaveLength(0);
});

function deferred<T>(){
 let resolve!:(value:T)=>void,reject!:(reason:unknown)=>void;
 const promise=new Promise<T>((yes,no)=>{resolve=yes;reject=no;});
 return {promise,resolve,reject};
}
function clearanceReply(request:ChildMutation,contract:ChildSaveContract){return{success:true,data:{kind:'clearance',id:701,employee_id:request.employeeId,eos_case_id:request.values.eos_case_id,operation_id:contract.operationId,revision:'1',replayed:false}};}
function expectClearanceCall(title:string){expect(state.child).toHaveBeenCalledExactlyOnceWith({kind:'clearance',employeeId:880301,id:null,revision:null,action:'create',values:{eos_case_id:1,clearance_area:'hr',item_title:title}},{operationId:expect.any(String),revision:null});}
function clearanceCases(ids:number[]){
 state.reads.eos.mockResolvedValue(ids.map(id=>row('eos',id)));
 state.reads.clearance.mockImplementation(async(id:number)=>[{...row('clearance',id),eos_case_id:id}]);
}
async function openClearance(caseId=1,title='SYNTHETIC CASE A DRAFT'){
 const label=await screen.findByText(token('eos',caseId)),card=label.closest('div.rounded.border');
 if(!card)throw Error('Actual EOS case card missing');
 fireEvent.click(within(card as HTMLElement).getByRole('button',{name:'Clearance'}));
 const dialog=await screen.findByRole('dialog',{name:'Add Clearance Item'});
 fireEvent.change(within(dialog).getByLabelText('Item Title'),{target:{value:title}});
 await screen.findAllByText(token('clearance',caseId));
 const retained=state.clearanceForms.at(-1)?.onSubmit;
 if(!retained)throw Error('Actual clearance submit handler missing');
 return {dialog,retained,title};
}
function clearanceAdd(){return within(screen.getByRole('dialog',{name:'Add Clearance Item'})).getByRole('button',{name:/^(Save|Retry unchanged change)$/}) as HTMLButtonElement;}
async function refreshEos(view:ReturnType<typeof mount>,ids:number[]){
 const read=deferred<{rows:ReturnType<typeof row>[];totalCount:number}>();
 state.pages.mockImplementation((input:PageInput)=>input.kind==='eos'?read.promise:undefined);
 act(()=>{void view.client.invalidateQueries({queryKey:['hr','actions','eos-cases',880301]});});
 await waitFor(()=>expect(state.pages.mock.calls.some(([input])=>input.kind==='eos')).toBe(true));
 await act(async()=>read.resolve({rows:ids.map(id=>row('eos',id)),totalCount:ids.length}));
 await screen.findAllByText(token('clearance',ids[0]));
}
async function discardClearance(){
 const dialog=screen.getByRole('dialog',{name:'Add Clearance Item'});
 fireEvent.click(within(dialog).getByRole('button',{name:'Cancel'}));
 expect(within(dialog).getByText('Discard unsaved changes?')).toBeTruthy();
 fireEvent.click(within(dialog).getByRole('button',{name:'Discard changes'}));
 await waitFor(()=>expect(screen.queryByRole('dialog',{name:'Add Clearance Item'})).toBeNull());
}
it.each(['actual Add','retained handler'])('clearance C1 blocks %s instead of retargeting an A draft to refreshed B',async path=>{
 clearanceCases([1,2]);
 const view=mount(),draft=await openClearance();await refreshEos(view,[2]);
 if(path==='actual Add')fireEvent.click(clearanceAdd());else await act(async()=>{await draft.retained();});
 expect(state.child).not.toHaveBeenCalled();
 expect((screen.getByLabelText('Item Title') as HTMLInputElement).value).toBe(draft.title);
 expect(screen.getByText('The original case and its checklist must be available before adding this item. Your draft is retained.')).toBeTruthy();
 expect(clearanceAdd().disabled).toBe(true);await discardClearance();
});
it('clearance C2 never adopts the fallback case after a real page-two count clamp',async()=>{
 clearanceCases([1]);let shrunk=false;
 state.pages.mockImplementation(async(input:PageInput)=>input.kind==='eos'?{
  rows:shrunk?(input.page===1?[row('eos',1)]:[]):input.page===1?Array.from({length:25},(_,i)=>row('eos',i+1)):[row('eos',26)],totalCount:shrunk?1:26
 }:undefined);
 const view=mount();await screen.findByText(token('eos',1));
 fireEvent.click(section('eos').getAllByRole('button',{name:'Next'}).at(-1)!);const draft=await openClearance(26);
 shrunk=true;await act(async()=>{await view.client.invalidateQueries({queryKey:['hr','actions','eos-cases',880301]});});
 await screen.findAllByText(token('clearance',1));
 expect(state.transport.mock.calls.filter(c=>c[1].kind==='eos').map(c=>c[1].page)).toEqual([1,2,2,1]);
 fireEvent.click(clearanceAdd());expect(state.child).not.toHaveBeenCalled();
 expect((screen.getByLabelText('Item Title') as HTMLInputElement).value).toBe(draft.title);await discardClearance();
});
it('clearance C3 retains explicit exactly-once submission when refreshed A is still admitted',async()=>{
 clearanceCases([1,2]);
 const view=mount(),draft=await openClearance();await refreshEos(view,[1,2]);
 expect(state.child).not.toHaveBeenCalled();
 fireEvent.click(clearanceAdd());await waitFor(()=>expect(state.success).toHaveBeenCalledWith('Clearance item added'));
 expectClearanceCall(draft.title);
 expect(state.clearanceInvalidations).toHaveBeenCalledExactlyOnceWith(view.client,1,880301);
 expect(screen.queryByRole('dialog',{name:'Add Clearance Item'})).toBeNull();
});
it.each([['pending','actual Add'],['pending','retained handler'],['failed','actual Add'],['failed','retained handler']] as const)('clearance C4 blocks %s checklist admission through %s and recovers without replay',async(mode,path)=>{
 clearanceCases([1]);
 const view=mount(),draft=await openClearance(),read=deferred<undefined>();
 state.pages.mockImplementation((input:PageInput)=>{
  if(input.kind!=='clearance')return undefined;
  if(mode==='failed')throw new ReadError('Controlled clearance outage',503);
  return read.promise;
 });
 act(()=>{void view.client.invalidateQueries({queryKey:['hr','actions','clearance-items',1]});});
 await waitFor(()=>expect(state.pages.mock.calls.filter(([input])=>input.kind==='clearance').length).toBeGreaterThan(0));
 if(mode==='failed')await waitFor(()=>expect(view.client.getQueryCache().find({queryKey:['hr','actions','clearance-items',1],exact:false})?.state.status).toBe('error'),{timeout:4000});
 if(path==='actual Add')fireEvent.click(clearanceAdd());else await act(async()=>{await draft.retained();});
 expect(state.child).not.toHaveBeenCalled();
 expect(clearanceAdd().disabled).toBe(true);expect((screen.getByLabelText('Item Title') as HTMLInputElement).value).toBe(draft.title);
 expect(screen.getByText('The original case and its checklist must be available before adding this item. Your draft is retained.')).toBeTruthy();
 expect((within(screen.getByRole('dialog')).getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(false);
 state.pages.mockReset();if(mode==='pending')await act(async()=>read.resolve(undefined));
 else await act(async()=>{await view.client.refetchQueries({queryKey:['hr','actions','clearance-items',1]});});
 await waitFor(()=>expect(clearanceAdd().disabled).toBe(false));expect(state.child).not.toHaveBeenCalled();
 fireEvent.click(clearanceAdd());await waitFor(()=>expect(state.child).toHaveBeenCalledTimes(1));
 expectClearanceCall(draft.title);
});
it('clearance C5 preserves a dispatched A success and its captured invalidation after a B-only refresh',async()=>{
 clearanceCases([1,2]);const write=deferred<{success:true}>();state.child.mockImplementation((r:ChildMutation,c:ChildSaveContract)=>write.promise.then(value=>value.success?clearanceReply(r,c):value));
 const view=mount(),draft=await openClearance();fireEvent.click(clearanceAdd());
 await waitFor(()=>expect(state.child).toHaveBeenCalledTimes(1));await refreshEos(view,[2]);
 await act(async()=>write.resolve({success:true}));
 expectClearanceCall(draft.title);
 expect(state.clearanceInvalidations).toHaveBeenCalledExactlyOnceWith(view.client,1,880301);expect(state.success).toHaveBeenCalledExactlyOnceWith('Clearance item added');
 expect(screen.queryByRole('dialog',{name:'Add Clearance Item'})).toBeNull();
});
it.each(['rejected','unconfirmed'])('clearance C6 preserves %s outcomes and never treats read recovery as a new write',async outcome=>{
 clearanceCases([1]);const write=deferred<{success:false;error:string}>();state.child.mockImplementation((r:ChildMutation,c:ChildSaveContract)=>write.promise.then(value=>value.success?clearanceReply(r,c):value));
 const view=mount(),draft=await openClearance();fireEvent.click(clearanceAdd());await waitFor(()=>expect(state.child).toHaveBeenCalledTimes(1));
 await act(async()=>{if(outcome==='rejected')write.resolve({success:false,error:'Controlled rejection'});else write.reject(Error('Controlled lost response'));});
 await waitFor(()=>expect(clearanceAdd().disabled).toBe(false));
 expect((await screen.findByRole('alert')).textContent).toContain(outcome==='rejected'?'Controlled rejection':'The result is unconfirmed');
 expect((screen.getByLabelText('Item Title') as HTMLInputElement).value).toBe(draft.title);
 await refreshEos(view,[1]);expect(state.child).toHaveBeenCalledTimes(1);
 if(outcome==='unconfirmed'){expect((screen.getByLabelText('Item Title')as HTMLInputElement).disabled).toBe(true);fireEvent.click(clearanceAdd());await waitFor(()=>expect(state.child).toHaveBeenCalledTimes(2));expect(state.child.mock.calls[1]).toEqual(state.child.mock.calls[0]);}else expect((screen.getByLabelText('Item Title')as HTMLInputElement).disabled).toBe(false);
 expect(state.child).toHaveBeenCalledTimes(outcome==='unconfirmed'?2:1);expect(state.success).not.toHaveBeenCalled();expect(state.clearanceInvalidations).not.toHaveBeenCalled();
});
it.each(['scope','unmount'])('clearance C7 refuses a retained pre-dispatch handler after %s retirement',async retirement=>{
 clearanceCases([1]);
 const view=mount(),draft=await openClearance();if(retirement==='scope')view.replace(changedScope());else view.hide();
 await act(async()=>{await draft.retained();});expect(state.child).not.toHaveBeenCalled();
 expect(screen.queryByRole('dialog',{name:'Add Clearance Item'})).toBeNull();
});
it.each(['scope','unmount'])('clearance C7 preserves old A receipt without publishing retired UI after %s',async retirement=>{
 clearanceCases([1]);const write=deferred<{success:true}>();state.child.mockImplementation((r:ChildMutation,c:ChildSaveContract)=>write.promise.then(value=>value.success?clearanceReply(r,c):value));
 const view=mount();await openClearance();fireEvent.click(clearanceAdd());await waitFor(()=>expect(state.child).toHaveBeenCalledTimes(1));
 let newer:Awaited<ReturnType<typeof openClearance>>|undefined;
 if(retirement==='scope'){clearanceCases([2]);view.replace(changedScope());newer=await openClearance(2,'SYNTHETIC NEW OWNER B DRAFT');}else view.hide();
 const callbacks=view.onChildOpen.mock.calls.length;await act(async()=>write.resolve({success:true}));
 expect(state.clearanceInvalidations).not.toHaveBeenCalled();expect(state.child).toHaveBeenCalledTimes(1);
 expect(childRecoveryMarkers(state.store!,'6:synthetic-old-actor')).toEqual([expect.objectContaining({employeeId:880301,caseId:1,kind:'clearance',operationId:state.child.mock.calls[0][1].operationId})]);
 expect(state.success).not.toHaveBeenCalled();expect(view.onChildOpen).toHaveBeenCalledTimes(callbacks);
 if(newer){expect((screen.getByLabelText('Item Title') as HTMLInputElement).value).toBe(newer.title);expect(view.onChildOpen).toHaveBeenLastCalledWith(true);}else expect(screen.queryByRole('dialog')).toBeNull();
});
it.each(['scope','unmount'])('clearance C8 fences retained actions in the enclosing layout after committed %s retirement',async retirement=>{
 clearanceCases([1]);const write=deferred<{success:true}>();state.child.mockImplementation((r:ChildMutation,c:ChildSaveContract)=>write.promise.then(value=>value.success?clearanceReply(r,c):value));
 const view=mount(),draft=await openClearance(),close=state.clearanceForms.at(-1)!.onOpenChange;
 expect(clearanceAdd().disabled).toBe(false);
 let passive=false;
 const observed:Array<{passive:boolean;dialogAbsent:boolean;dispatches:number;closeCallbacks:number}>=[];
 const probe:LayoutProbe={layout:()=>{
  const callbacks=view.onChildOpen.mock.calls.length,dialogAbsent=screen.queryByRole('dialog',{name:'Add Clearance Item'})===null;
  // This enclosing caller runs after the child's commit, before passive cleanup.
  void draft.retained();close(false);
  observed.push({passive,dialogAbsent,dispatches:state.child.mock.calls.length,closeCallbacks:view.onChildOpen.mock.calls.length-callbacks});
 },passive:()=>{passive=true;}};
 if(retirement==='scope')view.replace(changedScope(),probe);else view.hide(probe);
 expect(observed).toHaveLength(1);expect(observed[0]).toMatchObject({passive:false,dialogAbsent:true});expect(passive).toBe(true);
 expect(observed[0].dispatches).toBe(0);expect(observed[0].closeCallbacks).toBe(0);
 expect(state.child).not.toHaveBeenCalled();expect(state.clearanceInvalidations).not.toHaveBeenCalled();expect(state.success).not.toHaveBeenCalled();
});
it('clearance C8 fences the retained admitted submit in the enclosing layout of a real matching-checklist refresh',async()=>{
 clearanceCases([1]);const write=deferred<{success:true}>();state.child.mockImplementation((r:ChildMutation,c:ChildSaveContract)=>write.promise.then(value=>value.success?clearanceReply(r,c):value));
 const view=mount(),draft=await openClearance(),read=deferred<undefined>();
 expect(clearanceAdd().disabled).toBe(false);
 state.pages.mockImplementation((input:PageInput)=>input.kind==='clearance'?read.promise:undefined);
 let passive=false;
 const observed:Array<{passive:boolean;fetching:boolean;childDenied:boolean;addDisabled:boolean;title:string;dispatches:number;closeCallbacks:number}>=[];
 const probe:LayoutProbe={layout:()=>{
  const callbacks=view.onChildOpen.mock.calls.length;
  const fetching=view.client.getQueryCache().find({queryKey:['hr','actions','clearance-items',1],exact:false})?.state.fetchStatus==='fetching';
  const childDenied=state.clearanceForms.at(-1)?.submitDisabled===true,addDisabled=clearanceAdd().disabled,title=(screen.getByLabelText('Item Title') as HTMLInputElement).value;
  // The actual reader has rendered unavailable in this commit; no mocked hook.
  void draft.retained();
  observed.push({passive,fetching,childDenied,addDisabled,title,dispatches:state.child.mock.calls.length,closeCallbacks:view.onChildOpen.mock.calls.length-callbacks});
 },passive:()=>{passive=true;}};
 act(()=>{void view.client.invalidateQueries({queryKey:['hr','actions','clearance-items',1]});view.inspectLayout(probe);});
 expect(observed).toHaveLength(1);expect(observed[0]).toMatchObject({passive:false,fetching:true,childDenied:true,addDisabled:true,title:draft.title});expect(passive).toBe(true);
 expect(observed[0].dispatches).toBe(0);expect(observed[0].closeCallbacks).toBe(0);
 expect(state.child).not.toHaveBeenCalled();expect(state.clearanceInvalidations).not.toHaveBeenCalled();
 expect((within(screen.getByRole('dialog')).getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(false);
 await act(async()=>read.resolve(undefined));await waitFor(()=>expect(clearanceAdd().disabled).toBe(false));
 expect((screen.getByLabelText('Item Title') as HTMLInputElement).value).toBe(draft.title);expect(state.child).not.toHaveBeenCalled();
});
