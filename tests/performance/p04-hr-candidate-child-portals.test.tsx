// @vitest-environment jsdom
// Actual candidate record admission/privacy acceptance with controlled transport. Real parent,
// seven tabs, shared record shell, QueryClient, and in-memory F04 draft store.
// Server Actions/read transport and workspace/router context are synthetic.
// This does NOT exercise SSR, native RLS, a browser, or account switching.
import React from 'react';
import {candidateChildFixtureReply} from './fixtures/candidate-child-read-fixture';
import type {CandidateChildKind} from '@/lib/reads/hr-candidate-children-schema';
import '../remediation/f05/setup';
import {act, cleanup, fireEvent, render, screen, waitFor, within} from '@testing-library/react';
import {afterEach, beforeEach, expect, it, vi} from 'vitest';
import {QueryClient, QueryClientProvider} from '@tanstack/react-query';
import {CandidateWorkspaceForm} from '@/features/hr/recruitment/candidate-workspace-form';
import {WorkspaceUiMemoryProvider} from '@/hooks/use-persistent-ui-state';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import {ReadError} from '@/lib/reads/client';
import {candidateRecordKey} from '@/hooks/use-hr-candidate-record';
import {candidateRecordIdentity} from '@/lib/reads/hr-candidate-record-schema';
import {queryKeys} from '@/lib/query/query-keys';
import type {AuthContext} from '@/lib/rbac/check';
import type {CandidateRow} from '@/server/actions/hr/recruitment';

const state = vi.hoisted(() => ({read: vi.fn(), salary: vi.fn(), requisitions: vi.fn(), docs: vi.fn(), interviews: vi.fn(), offers: vi.fn(),
  onboarding: vi.fn(), prep: vi.fn(), mutate: vi.fn(), dispatch: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn(),
  dialogSubmit: null as (()=>void|Promise<unknown>) | null,
  store: null as ReturnType<typeof createWorkspaceDraftStore> | null, pathname: '/admin/hr/recruitment/candidates/record/880100'}));
// These regressions retain their original admission/privacy assertions. The
// native action/HTTP protocol has separate F12 tests; this adapter only keeps
// the earlier controlled action spy's argument shape for those assertions.
vi.mock('@/server/actions/hr/recruitment-lifecycle',()=>({mutateRecruitmentLifecycle:async(r:{kind:string;candidateId:number;id:number|null;values:unknown},operation:string)=>{const result=await state.mutate(r.id??r.candidateId,r.values);return result.success?{...result,data:{kind:r.kind,id:r.id??880299,candidate_id:r.candidateId,employee_id:null,operation_id:operation,revision:'1',replayed:false}}:result;},reconcileRecruitmentLifecycle:vi.fn(),readRecruitmentAssignees:async()=>({success:true,rows:[],hasMore:false}),readRecruitmentTaskChoices:async()=>({success:true,rows:[],hasMore:false}),prepareJoiningTask:async(candidate:number)=>({success:true,data:{candidate_id:candidate,employee_id:null}})}));
vi.mock('@/features/hr/recruitment/recruitment-assignee',()=>({RecruitmentAssignee:({label,value,onChange}:{label:string;value:number|null;onChange:(id:number)=>void})=><input aria-label={label}value={value??''}onChange={e=>onChange(Number(e.target.value))}/>}));
vi.mock('@/lib/reads/client', async original => ({...await original<typeof import('@/lib/reads/client')>(), readJson:
  (route: string, input: {kind: CandidateChildKind; operation?: string}, signal?: AbortSignal) => {
    if (route !== 'hr-candidate-children') return state.read(route, input, signal);
    const fixture = input.kind === 'documents' ? state.docs : state[input.kind];
    // Existing spy assertions count page reads; editor details have independent
    // request assertions in hr-candidate-child-read-components.test.tsx.
    return candidateChildFixtureReply(input, input.operation === 'detail' ? fixture.getMockImplementation()?.() : fixture());
  }}));
vi.mock('next/navigation', () => ({usePathname: () => state.pathname, useRouter: () => ({replace: vi.fn(), refresh: vi.fn()})}));
vi.mock('@/components/workspace/workspace-provider', () => ({useWorkspaceContext: () => ({state: {activeTabId: 'candidate-review-owner', isHydrated: true,
  tabs: [{id: 'candidate-review-owner', route: state.pathname}]}, dispatch: state.dispatch})}));
vi.mock('@/components/workspace/workspace-draft-provider', () => ({useWorkspaceDraftStoreContext: () => state.store}));
vi.mock('@/hooks/use-workspace', () => ({useWorkspace: () => ({closeTab: vi.fn(), markDirty: vi.fn(), updateTabRoute: vi.fn(), isTabActive: () => true})}));
vi.mock('sonner', () => ({toast: {error: state.error, success: state.success, warning: state.warning}}));
vi.mock('@/server/actions/hr/recruitment', () => ({
  createCandidate: state.mutate, updateCandidate: state.mutate, getRecruitmentSalaryAccess: state.salary, listJobRequisitions: state.requisitions,
  listCandidateDocuments: state.docs, archiveCandidateDocument: state.mutate, linkCandidateDmsDocument: state.mutate, verifyCandidateDocument: state.mutate,
  listCandidateInterviews: state.interviews, archiveInterview: state.mutate, createInterview: state.mutate, updateInterview: state.mutate,
  listCandidateOffers: state.offers, archiveOffer: state.mutate, changeOfferStatus: state.mutate, createOffer: state.mutate, updateOffer: state.mutate,
  listCandidateOnboardingTasks: state.onboarding, archiveOnboardingTask: state.mutate, completeOnboardingTask: state.mutate, createOnboardingTask: state.mutate, updateOnboardingTask: state.mutate,
  prepareCandidateEmployeeConversion: state.prep, convertCandidateToEmployee: state.mutate,
}));

const permissions = ['hr.recruitment.view', 'hr.recruitment.manage', 'hr.payroll.view', 'hr.payroll.manage', 'hr.employees.create', 'hr.employees.view', 'hr.employees.update'];
const numberingPermissions = ['numbering.rules.generate'];
const context = {profile: {id: 880106, auth_user_id: 'synthetic-candidate-record-review', must_change_password: false}, accountStatus: 'active', isAccountActive: true,
  permissionCodes: [...permissions, ...numberingPermissions], globalPermissionCodes: numberingPermissions, roleCodes: ['hr_scoped', 'numbering_only'], roleAssignments: [
    {roleId: 880106, roleCode: 'hr_scoped', ownerCompanyId: 880101, branchId: null, permissionCodes: permissions},
    {roleId: 880107, roleCode: 'numbering_only', ownerCompanyId: null, branchId: null, permissionCodes: numberingPermissions},
  ]} as unknown as AuthContext;
const candidate = {full_name_ar:null,gender:null,nationality_id:null,date_of_birth:null,mobile_number:null,source:null,agency_name:null,referred_by_employee_id:null,current_employer:null,current_position:null,notice_period_days:null,rating:null,availability_date:null,created_at:'2026-10-04T00:00:00Z',updated_at:'2026-10-04T00:00:00Z',created_by:null,deleted_at:null,requisition:null,nationality:null,referred_by:null,id: 880100, workspace_revision: 17, candidate_code: 'SYNTHETIC-880100', full_name_en: 'Synthetic retained candidate', candidate_status: 'new', pipeline_stage: 'new',
  joining_status:'not_started',requisition_id: 880109, expected_salary: 54321, email: 'synthetic@example.invalid', current_location: 'Synthetic private location', notes: 'SYNTHETIC PRIVATE PROFILE NOTES'} as CandidateRow;
const salaryKey = ['hr','recruitment','salary-access',880109];
const recordKey = candidateRecordKey(880100,candidateRecordIdentity(context));
const access = {canView:true,canManage:true,canManageCandidate:true,companyId:880101,branchId:null};
let salaryVisible = true;
const reply = (route:string, input:{kind?:string;requisitionId?:number|null;candidateId?:number}) => {
 if(route==='hr-candidate-summary')return Promise.resolve({...counts,data:{...counts.data,candidateId:input.candidateId??880100}});
 const salaryAccess={...access,canView:salaryVisible,canManage:salaryVisible};
 return Promise.resolve({success:true,data:input.kind==='salary-access'?{kind:'salary-access',requisitionId:input.requisitionId,salaryAccess}:{kind:'record',candidate:{...candidate,expected_salary:salaryVisible?candidate.expected_salary:null},salaryAccess}});
};
const counts = {success: true, data: {candidateId: 880100, interview_count: 4, offer_count: 3, document_count: 2, onboarding_task_count: 11, pending_task_count: 1}};
const clients: QueryClient[] = [];

beforeEach(() => {
  vi.clearAllMocks(); state.store = createWorkspaceDraftStore();
  salaryVisible=true; state.read.mockImplementation(reply);
  state.salary.mockResolvedValue({success: true, data: {canView: true, canManage: true, companyId: 880101, branchId: null}});
  state.requisitions.mockResolvedValue({success: true, data: {rows: [{id: 880109, requisition_code: 'SYNTHETIC-REQ', requisition_title: 'Synthetic job'}], totalCount: 1}});
  state.docs.mockResolvedValue({success: true, data: [{id: 880111, candidate_id: 880100, dms_document_id: 880112, document_purpose: 'cv', verification_status: 'unverified',
    dms_document: {id: 880112, document_title: 'SYNTHETIC PRIVATE CV TITLE', document_number: 'SYN-DOC'}}]});
  state.interviews.mockResolvedValue({success: true, data: []});
  state.offers.mockResolvedValue({success: true, data: []});
  state.onboarding.mockResolvedValue({success: true, data: []});
  state.prep.mockResolvedValue({success: true, data: {candidate, latest_offer:acceptedOffer, already_converted: false}});
});
afterEach(() => {cleanup(); clients.splice(0).forEach(client => client.clear()); state.store = null;});

function node(row = candidate, authContext = context) {return <CandidateWorkspaceForm candidate={row} mode='edit' authContext={authContext}/>;}
function mount() {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}}); clients.push(client);
  const wrap = (child: React.ReactNode) => <QueryClientProvider client={client}><WorkspaceUiMemoryProvider>{child}</WorkspaceUiMemoryProvider></QueryClientProvider>;
  const view = render(wrap(node()));
  return {...view, client, replace: (row: CandidateRow, auth = context) => view.rerender(wrap(node(row, auth)))};
}
async function ready() {
  await screen.findByText('11');
  await waitFor(() => expect(state.read).toHaveBeenCalled());
  await waitFor(() => expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).disabled).toBe(false));
}
function section(label: string) {fireEvent.click(screen.getAllByRole('button', {name: label})[0]);}

const scenarios=[
 {kind:'interviews',section:'Interviews',open:'Schedule Interview',dialog:'Schedule Interview',submit:'Add',field:'Feedback',list:'interviews',key:queryKeys.recruitment.candidateInterviews(candidate.id)},
 {kind:'offers',section:'Offers',open:'Create Offer',dialog:'Create Offer',submit:'Add',field:'Notes',list:'offers',key:queryKeys.recruitment.candidateOffers(candidate.id)},
 {kind:'onboarding',section:'Onboarding',open:'Add Task',dialog:'Add Onboarding Task',submit:'Add',field:'Notes',list:'onboarding',key:queryKeys.recruitment.candidateOnboarding(candidate.id)},
 {kind:'conversion',section:'Conversion',open:'Convert to Employee',dialog:'Convert to Employee',submit:'Confirm Conversion',field:'Conversion Notes',list:'prep',key:['recruitment','conversion-prep',candidate.id]},
] as const;
const acceptedOffer={id:880160,offer_revision:'4',offer_terms_version:'1',requisition_id:880109,owner_company_id:880101,branch_id:null,department_id:null,designation_id:null,employment_type_id:null,proposed_joining_date:'2026-10-04'};
type Scenario=typeof scenarios[number];
vi.mock('@/components/erp/erp-child-dialog-form',async original=>{
 const actual=await original<typeof import('@/components/erp/erp-child-dialog-form')>();
 return {...actual,ERPChildDialogForm:(props:React.ComponentProps<typeof actual.ERPChildDialogForm>)=>{
  if(props.open)state.dialogSubmit=props.onSubmit??null;
  return <actual.ERPChildDialogForm {...props}/>;
 }};
});
beforeEach(()=>{state.dialogSubmit=null;state.mutate.mockResolvedValue({success:false,error:'Synthetic controlled child rollback'});});
async function openChild(s:Scenario){
 section(s.section);const button=screen.getByRole('button',{name:s.open});
 await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(button);const dialog=await screen.findByRole('dialog',{name:s.dialog});
 if(s.kind!=='conversion')fireEvent.change(within(dialog).getByLabelText('Decision / change reason'),{target:{value:'Synthetic reviewed action'}});
 if(s.kind==='interviews'){fireEvent.change(within(dialog).getByLabelText('Interviewer'),{target:{value:'880106'}});fireEvent.change(within(dialog).getByLabelText('Date & Time'),{target:{value:'2026-10-04T10:00'}});}
 if(s.kind==='onboarding'){fireEvent.change(within(dialog).getByLabelText('Authorized assignee'),{target:{value:'880106'}});fireEvent.change(within(dialog).getByLabelText('Completion criteria'),{target:{value:'Synthetic explicit verification'}});fireEvent.change(within(dialog).getByLabelText('Due Date'),{target:{value:'2026-10-21'}});}
 if(s.kind==='onboarding')fireEvent.change(within(dialog).getByLabelText('Task Title'),{target:{value:'Synthetic required task'}});
 if(s.kind==='conversion'){
  fireEvent.change(within(dialog).getByLabelText('Owner Company ID'),{target:{value:'880101'}});
  fireEvent.change(within(dialog).getByLabelText('Joining Date'),{target:{value:'2026-10-04'}});
  fireEvent.change(within(dialog).getByLabelText('Emergency Contact Name'),{target:{value:'Synthetic emergency contact'}});
  fireEvent.change(within(dialog).getByLabelText('Emergency Contact Mobile'),{target:{value:'000'}});
 }
 fireEvent.change(within(dialog).getByLabelText(s.field),{target:{value:'SYNTHETIC CHILD NOTES'}});
 return dialog;
}
async function failRead(view:ReturnType<typeof mount>,s:Scenario,failure:'record'|'salary-access'|'own-rejection'|'own-envelope'){
 if(failure==='record'||failure==='salary-access'){
  state.read.mockImplementation((route,input)=>input.kind===failure?Promise.reject(new ReadError('Synthetic admission unavailable',503)):reply(route,input));
  await act(async()=>{await view.client.invalidateQueries({queryKey:failure==='record'?recordKey:salaryKey});});
  await screen.findByText(/Access could not be refreshed/);
 }else{
  if(failure==='own-rejection')state[s.list].mockRejectedValue(new Error('Synthetic child collection unavailable'));
  else state[s.list].mockResolvedValue({success:false,error:'Synthetic child collection unavailable'});
  await act(async()=>{await view.client.invalidateQueries({queryKey:s.key});});
  await screen.findByText(/Some records or choices could not be loaded/);
 }
}

function healthy(s:Scenario){
 return s.kind==='conversion'?{success:true,data:{candidate,latest_offer:acceptedOffer,already_converted:false}}:{success:true,data:[]};
}
function expectedArgs(s:Scenario){
 if(s.kind==='interviews')return [candidate.id,{interview_round:'first',interview_datetime:'2026-10-04T10:00:00+04:00',interviewer_id:880106,interview_location:null,result:null,score:null,feedback:'SYNTHETIC CHILD NOTES',next_step:null}];
 if(s.kind==='offers')return [candidate.id,{offer_date:null,valid_until:null,proposed_joining_date:null,basic_salary:null,gross_salary:null,housing_allowance:null,transport_allowance:null,other_allowances:null,currency:'AED',notes:'SYNTHETIC CHILD NOTES'}];
 if(s.kind==='onboarding')return [candidate.id,{task_title:'Synthetic required task',task_category:null,due_date:'2026-10-21',notes:'SYNTHETIC CHILD NOTES',candidate_id:candidate.id,employee_id:null,assigned_to:880106,completion_criteria:'Synthetic explicit verification',is_required:true,evidence_required:false,dms_document_id:null,prerequisite_task_id:null}];
 return [candidate.id,{owner_company_id:880101,branch_id:null,department_id:null,designation_id:null,employment_type_id:null,employee_category_id:null,joining_date:'2026-10-04',employee_status:'active',conversion_notes:'SYNTHETIC CHILD NOTES',offer_id:acceptedOffer.id,offer_revision:'4',offer_terms_version:'1',requisition_id:880109,emergency_contact_name:'Synthetic emergency contact',emergency_contact_mobile:'000'},
  {operationId:expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),revision:'17'}];
}
function savedResult(s:Scenario){
 if(s.kind!=='conversion')return {success:true,data:{employee_id:880999,employee_code:'SYN-EMP-880999'}};
 return {success:true,data:{employee_id:880999,employee_code:'SYN-EMP-880999',candidate_id:candidate.id,candidate_revision:'18',employee_revision:'1',link_id:880998,
  operation_id:state.mutate.mock.calls.at(-1)![2].operationId,replayed:false,reference_id:880997}};
}
async function checkBlocked(s:Scenario,dialog:HTMLElement,retained:()=>void|Promise<unknown>){
 const submit=within(dialog).getByRole('button',{name:s.submit}) as HTMLButtonElement;
 expect(submit.disabled).toBe(true);
 expect((within(dialog).getByLabelText(s.field) as HTMLTextAreaElement).value).toBe('SYNTHETIC CHILD NOTES');
 fireEvent.click(submit);
 await act(async()=>{await retained();await state.dialogSubmit?.();});
 expect(state.mutate).not.toHaveBeenCalled();
}

it.each(scenarios.flatMap(s=>['record','salary-access','own-rejection','own-envelope'].map(failure=>({s,failure}))))(
 '$s.kind preserves its real portal draft, blocks callbacks on $failure and retries inside the dialog',async({s,failure})=>{
 const view=mount();await ready();const dialog=await openChild(s);const retained=state.dialogSubmit!;
 expect(view.container.contains(dialog)).toBe(false);
 await failRead(view,s,failure as 'record'|'salary-access'|'own-rejection'|'own-envelope');
 expect(screen.getByRole('dialog',{name:s.dialog})).toBe(dialog);expect(dialog.closest('[inert]')).toBeNull();
 await checkBlocked(s,dialog,retained);
 state.read.mockImplementation(reply);state[s.list].mockResolvedValue(healthy(s));
 fireEvent.click(within(dialog).getByRole('button',{name:'Retry required checks'}));
 await waitFor(()=>expect((within(dialog).getByRole('button',{name:s.submit}) as HTMLButtonElement).disabled).toBe(false));
 expect(screen.getByRole('dialog',{name:s.dialog})).toBe(dialog);
 expect((within(dialog).getByLabelText(s.field) as HTMLTextAreaElement).value).toBe('SYNTHETIC CHILD NOTES');
 state.mutate.mockImplementation(async()=>savedResult(s));
 fireEvent.click(within(dialog).getByRole('button',{name:s.submit}));
 await waitFor(()=>expect(state.mutate).toHaveBeenCalledExactlyOnceWith(...expectedArgs(s)));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
});
it.each(scenarios)('$kind Cancel and dirty-discard remain usable during parent503',async s=>{
 const view=mount();await ready();const dialog=await openChild(s);await failRead(view,s,'record');
 const cancel=within(dialog).getByRole('button',{name:'Cancel'}) as HTMLButtonElement;
 expect(cancel.disabled).toBe(false);fireEvent.click(cancel);
 await within(dialog).findByText('Discard unsaved changes?');fireEvent.click(within(dialog).getByRole('button',{name:'Discard changes'}));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());expect(state.mutate).not.toHaveBeenCalled();
});
it.each(scenarios.flatMap(s=>[401,403].map(status=>({s,status}))))('$s.kind terminal$status retires real portal and retained callbacks',async({s,status})=>{
 const view=mount();await ready();const dialog=await openChild(s);const retained=state.dialogSubmit!;
 state.read.mockImplementation((route,input)=>input.kind==='record'?Promise.reject(new ReadError('Synthetic denied',status)):reply(route,input));
 await act(async()=>{await view.client.invalidateQueries({queryKey:recordKey});});
 await screen.findByText(/Candidate information is unavailable for this session/);
 expect(screen.queryByRole('dialog')).toBeNull();expect(document.body.contains(dialog)).toBe(false);
 await act(async()=>{await retained();});expect(state.mutate).not.toHaveBeenCalled();
});
it.each(scenarios)('$kind successful admission cannot replace revoked recruitment manage authority',async s=>{
 const view=mount();await ready();const dialog=await openChild(s);const retained=state.dialogSubmit!;
 state.read.mockImplementation(async(route,input)=>{const result=await reply(route,input);if(input.kind==='record'&&'salaryAccess'in result.data)result.data.salaryAccess.canManageCandidate=false;return result;});
 await act(async()=>{await view.client.invalidateQueries({queryKey:recordKey});});
 await within(dialog).findByText(/You do not have permission to make this change/);
 await checkBlocked(s,dialog,retained);
});
it.each(scenarios)('$kind coalesces modal retry clicks with accessible pending state and no business dispatch',async s=>{
 const view=mount();await ready();const dialog=await openChild(s);await failRead(view,s,'record');
 const releases:Array<()=>void>=[];
 state.read.mockImplementation((route,input)=>new Promise(resolve=>{releases.push(()=>{void reply(route,input).then(resolve);});}));
 state[s.list].mockImplementation(()=>new Promise(resolve=>{releases.push(()=>resolve(healthy(s)));}));
 const reads=state.read.mock.calls.length,own=state[s.list].mock.calls.length;
 const retry=within(dialog).getByRole('button',{name:'Retry required checks'});
 await act(async()=>{fireEvent.click(retry);fireEvent.click(retry);});
 await waitFor(()=>expect(state.read).toHaveBeenCalledTimes(reads+2));expect(state[s.list]).toHaveBeenCalledTimes(own+1);
 expect((within(dialog).getByRole('button',{name:'Retrying required checks…'}) as HTMLButtonElement).disabled).toBe(true);
 expect(within(dialog).getByRole('alert').getAttribute('aria-busy')).toBe('true');
 expect((within(dialog).getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(false);
 expect(state.mutate).not.toHaveBeenCalled();
 await act(async()=>{releases.forEach(release=>release());});
 await waitFor(()=>expect((within(dialog).getByRole('button',{name:s.submit}) as HTMLButtonElement).disabled).toBe(false));
 expect(state.mutate).not.toHaveBeenCalled();
});
it.each(scenarios)('$kind permitted rapid submits dispatch once with unchanged business payload',async s=>{
 let finish!:(value:unknown)=>void;state.mutate.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 mount();await ready();const dialog=await openChild(s),submit=within(dialog).getByRole('button',{name:s.submit}),retained=state.dialogSubmit!;
 await act(async()=>{fireEvent.click(submit);fireEvent.click(submit);await retained();});
 expect(state.mutate).toHaveBeenCalledExactlyOnceWith(...expectedArgs(s));
 await act(async()=>finish(savedResult(s)));
 await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
});
it.each(scenarios.flatMap(s=>['success','rejection','unknown'].map(outcome=>({s,outcome}))))(
 '$s.kind preserves actual already-dispatched $outcome after parent denial',async({s,outcome})=>{
 let finish!:(value:unknown)=>void,fail!:(error:Error)=>void;
 state.mutate.mockImplementation(()=>new Promise((resolve,reject)=>{finish=resolve;fail=reject;}));
 const view=mount();await ready();const dialog=await openChild(s);
 fireEvent.click(within(dialog).getByRole('button',{name:s.submit}));await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
 const retainedSubmit=state.dialogSubmit!;
 const numberedKey=`draft:tab:candidate-review-owner:numbered-recruitment:conversion:${candidate.id}:${context.profile!.id}`;
 const originalNumberedRequest=s.kind==='conversion'?state.store!.getViewState(numberedKey):undefined;
 if(s.kind==='conversion')expect(JSON.parse(originalNumberedRequest!)).toEqual({pending:{kind:'conversion',candidateId:candidate.id,payload:state.mutate.mock.calls[0][1],contract:state.mutate.mock.calls[0][2]},receipt:null});
 state.read.mockImplementation((route,input)=>input.kind==='record'?Promise.reject(new ReadError('Synthetic denied',403)):reply(route,input));
 await act(async()=>{await view.client.invalidateQueries({queryKey:recordKey});});
 await screen.findByText(/Candidate information is unavailable for this session/);
 await act(async()=>{if(outcome==='unknown')fail(new Error('Synthetic reply lost'));else finish(outcome==='success'?savedResult(s):{success:false,error:'Synthetic actual rejection'});});
 expect(screen.queryByRole('dialog')).toBeNull();expect(state.mutate).toHaveBeenCalledTimes(1);
 if(s.kind==='conversion'){
  // F06 numbered mutations retain the exact unacknowledged operation in the
  // original account/tab memory, but cannot publish a late result into a
  // privacy-retired candidate or dispatch through its retained callback.
  expect(state.store!.getViewState(numberedKey)).toBe(originalNumberedRequest);
  expect(state.success).not.toHaveBeenCalled();expect(state.error).not.toHaveBeenCalled();
  expect(screen.queryByText(/Employee created:/)).toBeNull();
  await act(async()=>{await retainedSubmit();});expect(state.mutate).toHaveBeenCalledTimes(1);
 }else{
  // F12 aligns child completion with F11's strict retirement: a late reply
  // cannot toast, resurrect fields or replay. Reconcile the original receipt.
  expect(state.success).not.toHaveBeenCalled();expect(state.error).not.toHaveBeenCalled();
  const marker=state.store!.getViewState(`f12-hiring:v1:${context.profile!.id}:${candidate.id}:-:${s.kind==='interviews'?'interview':s.kind==='offers'?'offer':'task'}`)!;
  expect(JSON.parse(marker)).toMatchObject({pending:null,retired:{candidate:candidate.id}});expect(marker).not.toContain('SYNTHETIC CHILD NOTES');
  await act(async()=>{await retainedSubmit();});expect(state.mutate).toHaveBeenCalledTimes(1);
 }
});
it('Conversion cannot proceed when a refreshed prerequisite says already converted',async()=>{
 const s=scenarios[3],view=mount();await ready();const dialog=await openChild(s),retained=state.dialogSubmit!;
 state.prep.mockResolvedValue({success:true,data:{candidate,latest_offer:null,already_converted:true}});
 await act(async()=>{await view.client.invalidateQueries({queryKey:s.key});});
 await within(dialog).findByText(/This candidate has already been converted\. Your entries are retained/);
 await checkBlocked(s,dialog,retained);
});
it('Conversion keeps employee-create permission additional to recruitment management',async()=>{
 const s=scenarios[3],view=mount();await ready();const dialog=await openChild(s),retained=state.dialogSubmit!;
 const next={...context,permissionCodes:context.permissionCodes.filter(code=>code!=='hr.employees.create'),roleAssignments:context.roleAssignments!.map(role=>({...role,permissionCodes:role.permissionCodes.filter(code=>code!=='hr.employees.create')}))};
 await act(async()=>{view.client.setQueryData(candidateRecordKey(candidate.id,candidateRecordIdentity(next)),{kind:'record',candidate,salaryAccess:access});view.replace(candidate,next);});
 await within(dialog).findByText(/You do not have permission to make this change/);await checkBlocked(s,dialog,retained);
});
it.each([
 {field:'Owner Company ID',message:'Owner company is required'},
 {field:'Joining Date',message:'Joining date is required'},
 {field:'Emergency Contact Name',message:'Emergency contact name is required'},
 {field:'Emergency Contact Mobile',message:'Emergency contact mobile is required'},
])('Conversion direct handler keeps required $field validation',async({field,message})=>{
 mount();await ready();const dialog=await openChild(scenarios[3]);
 fireEvent.change(within(dialog).getByLabelText(field),{target:{value:''}});
 await act(async()=>{await state.dialogSubmit?.();});
 expect(state.mutate).not.toHaveBeenCalled();
 expect(state.error).toHaveBeenCalledExactlyOnceWith(message);
});
it.each([
 {field:'Owner Company ID',value:'0',message:'Choose a valid owner company.'},
 {field:'Owner Company ID',value:'-1',message:'Choose a valid owner company.'},
 {field:'Owner Company ID',value:'1.5',message:'Choose a valid owner company.'},
 {field:'Joining Date',value:'2026-02-30',message:'Enter a valid joining date (YYYY-MM-DD).'},
 {field:'Joining Date',value:'2026-2-01',message:'Enter a valid joining date (YYYY-MM-DD).'},
 {field:'Joining Date',value:'not-a-date',message:'Enter a valid joining date (YYYY-MM-DD).'},
])('Conversion rejects invalid $field value $value with a helpful field error',async({field,value,message})=>{
 mount();await ready();const dialog=await openChild(scenarios[3]);
 const input=within(dialog).getByLabelText(field) as HTMLInputElement;
 // Bypass native input sanitizing only in this adversarial test, so the real
 // handler/schema must reject malformed values even without browser help.
 if(field==='Joining Date')input.type='text';
 fireEvent.change(input,{target:{value}});
 await act(async()=>{await state.dialogSubmit?.();});
 expect(state.mutate).not.toHaveBeenCalled();
 expect(state.error).toHaveBeenCalledExactlyOnceWith(message);
 expect(screen.getByRole('dialog',{name:scenarios[3].dialog})).toBe(dialog);
 expect((within(dialog).getByLabelText('Conversion Notes') as HTMLTextAreaElement).value).toBe('SYNTHETIC CHILD NOTES');
});
