// @vitest-environment jsdom
// Actual candidate record admission/privacy acceptance with controlled transport. Real parent,
// seven tabs, shared record shell, QueryClient, and in-memory F04 draft store.
// Server Actions/read transport and workspace/router context are synthetic.
// This does NOT exercise SSR, native RLS, a browser, or account switching.
import React, {useLayoutEffect} from 'react';
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
import {candidateRecordKey, useCandidateSalaryAccess, useHrCandidateRecord} from '@/hooks/use-hr-candidate-record';
import {candidateRecordIdentity, type CandidateRecordInitial, type CandidateSalaryAccess} from '@/lib/reads/hr-candidate-record-schema';
import {readScopeVersion} from '@/lib/reads/scope-version';
import {saveRetirementKey} from '@/lib/workspace/save-retirement';
import type {AuthContext} from '@/lib/rbac/check';
import type {CandidateRow} from '@/server/actions/hr/recruitment';

const state = vi.hoisted(() => ({read: vi.fn(), salary: vi.fn(), requisitions: vi.fn(), docs: vi.fn(), interviews: vi.fn(), offers: vi.fn(),
  onboarding: vi.fn(), prep: vi.fn(), mutate: vi.fn(), dispatch: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn(),
  replace: vi.fn(), refresh: vi.fn(), closeTab: vi.fn(), markDirty: vi.fn(), updateTabRoute: vi.fn(),
  parentSave: null as (() => unknown) | null,
  store: null as ReturnType<typeof createWorkspaceDraftStore> | null, pathname: '/admin/hr/recruitment/candidates/record/880100'}));
vi.mock('@/lib/reads/client', async original => ({...await original<typeof import('@/lib/reads/client')>(), readJson:
  (route: string, input: {kind: CandidateChildKind; operation?: string}, signal?: AbortSignal) => {
    if (route !== 'hr-candidate-children') return state.read(route, input, signal);
    const fixture = input.kind === 'documents' ? state.docs : state[input.kind];
    // Existing spy assertions count page reads; editor details have independent
    // request assertions in hr-candidate-child-read-components.test.tsx.
    return candidateChildFixtureReply(input, input.operation === 'detail' ? fixture.getMockImplementation()?.() : fixture());
  }}));
vi.mock('next/navigation', () => ({usePathname: () => state.pathname, useRouter: () => ({replace: state.replace, refresh: state.refresh})}));
vi.mock('@/components/workspace/workspace-provider', () => ({useWorkspaceContext: () => ({state: {activeTabId: 'candidate-review-owner', isHydrated: true,
  tabs: [{id: 'candidate-review-owner', route: state.pathname}]}, dispatch: state.dispatch})}));
vi.mock('@/components/workspace/workspace-draft-provider', () => ({useWorkspaceDraftStoreContext: () => state.store}));
vi.mock('@/hooks/use-workspace', () => ({useWorkspace: () => ({closeTab: state.closeTab, markDirty: state.markDirty, updateTabRoute: state.updateTabRoute, isTabActive: () => true})}));
vi.mock('@/components/workspace/erp-record-workspace-form', async original => {
  const actual = await original<typeof import('@/components/workspace/erp-record-workspace-form')>();
  return {...actual, ERPRecordWorkspaceForm: (props: React.ComponentProps<typeof actual.ERPRecordWorkspaceForm>) => {
    state.parentSave = props.onSave ?? null;
    return <actual.ERPRecordWorkspaceForm {...props}/>;
  }};
});
vi.mock('sonner', () => ({toast: {error: state.error, success: state.success, warning: state.warning}}));
vi.mock('@/server/actions/hr/recruitment', () => ({
  createCandidate: state.mutate, updateCandidate: state.mutate, getRecruitmentSalaryAccess: state.salary, listJobRequisitions: state.requisitions,
  listCandidateDocuments: state.docs, archiveCandidateDocument: state.mutate, linkCandidateDmsDocument: state.mutate, verifyCandidateDocument: state.mutate,
  listCandidateInterviews: state.interviews, archiveInterview: state.mutate, createInterview: state.mutate, updateInterview: state.mutate,
  listCandidateOffers: state.offers, archiveOffer: state.mutate, changeOfferStatus: state.mutate, createOffer: state.mutate, updateOffer: state.mutate,
  listCandidateOnboardingTasks: state.onboarding, archiveOnboardingTask: state.mutate, completeOnboardingTask: state.mutate, createOnboardingTask: state.mutate, updateOnboardingTask: state.mutate,
  prepareCandidateEmployeeConversion: state.prep, convertCandidateToEmployee: state.mutate,
}));

const permissions = ['hr.recruitment.view', 'hr.recruitment.manage', 'hr.payroll.view', 'hr.payroll.manage', 'hr.employees.create'];
const context = {profile: {id: 880106, auth_user_id: 'synthetic-candidate-record-review', must_change_password: false}, accountStatus: 'active', isAccountActive: true,
  permissionCodes: permissions, roleCodes: ['hr_scoped'], roleAssignments: [{roleId: 880106, roleCode: 'hr_scoped', ownerCompanyId: 880101, branchId: null, permissionCodes: permissions}]} as unknown as AuthContext;
const candidate = {full_name_ar:null,gender:null,nationality_id:null,date_of_birth:null,mobile_number:null,source:null,agency_name:null,referred_by_employee_id:null,current_employer:null,current_position:null,notice_period_days:null,rating:null,availability_date:null,created_at:'2026-10-04T00:00:00Z',updated_at:'2026-10-04T00:00:00Z',created_by:null,deleted_at:null,requisition:null,nationality:null,referred_by:null,id: 880100, workspace_revision: 17, candidate_code: 'SYNTHETIC-880100', full_name_en: 'Synthetic retained candidate', candidate_status: 'new', pipeline_stage: 'new',
  joining_status:'not_started',requisition_id: 880109, expected_salary: 54321, email: 'synthetic@example.invalid', current_location: 'Synthetic private location', notes: 'SYNTHETIC PRIVATE PROFILE NOTES'} as CandidateRow;
const draftKey = 'draft:tab:candidate-review-owner:candidate-workspace-form';
const salaryKey = ['hr','recruitment','salary-access',880109];
const recordKey = candidateRecordKey(880100,candidateRecordIdentity(context));
const access = {canView:true,canManage:true,canManageCandidate:true,companyId:880101,branchId:null};
let salaryVisible = true;
const reply = (route:string, input:{kind?:string;requisitionId?:number|null;candidateId?:number}) => {
 if(route==='hr-candidate-summary')return Promise.resolve({...counts,data:{...counts.data,candidateId:input.candidateId??880100}});
 const salaryAccess={...access,canView:salaryVisible,canManage:salaryVisible};
 return Promise.resolve({success:true,data:input.kind==='salary-access'?{kind:'salary-access',requisitionId:input.requisitionId,salaryAccess}:{kind:'record',candidate:{...candidate,expected_salary:salaryVisible?candidate.expected_salary:null},salaryAccess}});
};
const summaryKey = ['hr', 'recruitment', 'candidate', 880100];
const counts = {success: true, data: {candidateId: 880100, interview_count: 4, offer_count: 3, document_count: 2, onboarding_task_count: 11, pending_task_count: 1}};
const clients: QueryClient[] = [];

beforeEach(() => {
  vi.clearAllMocks(); state.store = createWorkspaceDraftStore(); state.parentSave = null;
  salaryVisible=true; state.read.mockImplementation(reply);
  state.salary.mockResolvedValue({success: true, data: {canView: true, canManage: true, companyId: 880101, branchId: null}});
  state.requisitions.mockResolvedValue({success: true, data: {rows: [{id: 880109, requisition_code: 'SYNTHETIC-REQ', requisition_title: 'Synthetic job'}], totalCount: 1}});
  state.docs.mockResolvedValue({success: true, data: [{id: 880111, candidate_id: 880100, dms_document_id: 880112, document_purpose: 'cv', verification_status: 'unverified',
    dms_document: {id: 880112, document_title: 'SYNTHETIC PRIVATE CV TITLE', document_number: 'SYN-DOC'}}]});
  state.interviews.mockResolvedValue({success: true, data: []});
  state.offers.mockResolvedValue({success: true, data: []});
  state.onboarding.mockResolvedValue({success: true, data: []});
  state.prep.mockResolvedValue({success: true, data: {candidate, latest_offer: null, already_converted: false}});
});
afterEach(() => {cleanup(); clients.splice(0).forEach(client => client.clear()); state.store = null;});

function node(row = candidate, authContext = context) {return <CandidateWorkspaceForm candidate={row} mode='edit' authContext={authContext}/>;}
function CommitProbe({children, afterCommit}: {children: React.ReactNode; afterCommit?: () => void}) {
  useLayoutEffect(() => {afterCommit?.();});
  return children;
}
function mount(strict = false) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}}); clients.push(client);
  const wrap = (child: React.ReactNode, afterCommit?: () => void) => <QueryClientProvider client={client}><WorkspaceUiMemoryProvider><CommitProbe afterCommit={afterCommit}>{strict ? <React.StrictMode>{child}</React.StrictMode> : child}</CommitProbe></WorkspaceUiMemoryProvider></QueryClientProvider>;
  const view = render(wrap(node()));
  return {...view, client, display: (child: React.ReactNode, afterCommit?: () => void) => view.rerender(wrap(child, afterCommit)),
    replace: (row: CandidateRow, auth = context, afterCommit?: () => void) => view.rerender(wrap(node(row, auth), afterCommit))};
}
async function ready() {
  await screen.findByText('11');
  await waitFor(() => expect(state.read).toHaveBeenCalled());
  await waitFor(() => expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).disabled).toBe(false));
}
function section(label: string) {fireEvent.click(screen.getAllByRole('button', {name: label})[0]);}
// A hidden tab deliberately does not refetch on ordinary invalidation. This
// explicit transport probe models confirmed authority loss from another active
// consumer while preserving the hidden-tab no-background-read contract.
async function probeSummary(client:QueryClient){
 const query=client.getQueryCache().find({queryKey:summaryKey,exact:false});
 if(!query)throw Error("Expected retained summary query");
 await client.fetchQuery({queryKey:query.queryKey,queryFn:()=>state.read("hr-candidate-summary",{candidateId:880100}),retry:false,staleTime:0}).catch(()=>{});
}
async function deny(client: QueryClient) {
  state.read.mockRejectedValue(new ReadError('Synthetic subject denied', 403));
  await act(async () => {await probeSummary(client);});
  await screen.findByText(/Candidate information is unavailable for this session\./);
}
async function revokeSalary(client:QueryClient) {
 salaryVisible=false;
 await act(async()=>{await client.invalidateQueries({queryKey:salaryKey});});
 await waitFor(()=>expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).disabled).toBe(true));
}


it.each([401,403])('same-principal summary %s retires parent header, fields, all tabs, caches and an open actual child dialog', async status=>{
 const view=mount();await ready(); section('Profile');
 fireEvent.change(screen.getByLabelText('Internal Notes'),{target:{value:'SYNTHETIC UNSAVED PRIVATE'}});
 section('Documents');
 await waitFor(()=>expect((screen.getByRole('button',{name:'Link DMS Document'}) as HTMLButtonElement).disabled).toBe(false));
 fireEvent.click(screen.getByRole('button',{name:'Link DMS Document'}));
 const dialog=await screen.findByRole('dialog');fireEvent.change(within(dialog).getByLabelText('Notes'),{target:{value:'SYNTHETIC CHILD SECRET'}});
 state.read.mockRejectedValue(new ReadError('Denied',status));
 await act(async()=>{await probeSummary(view.client);});
 await screen.findByText(/Candidate information is unavailable for this session\./);
 expect(screen.queryByRole('heading',{name:candidate.full_name_en})).toBeNull();
 expect(screen.queryByDisplayValue('SYNTHETIC UNSAVED PRIVATE')).toBeNull();
 expect(screen.queryByRole('dialog')).toBeNull();expect(screen.queryByRole('button',{name:'Save'})).toBeNull();
 expect(screen.queryAllByText('SYNTHETIC PRIVATE CV TITLE')).toHaveLength(0);
 expect(state.store!.hasDraft(draftKey)).toBe(false);
 await waitFor(()=>expect(view.client.getQueryCache().getAll().filter(query=>
   query.queryKey.includes(880100) && query.state.data).length).toBe(0));
 expect(state.mutate).not.toHaveBeenCalled();
});
it('record-point denial retires the form independently of an already-cached successful summary',async()=>{
 const view=mount();await ready();
 state.read.mockImplementation((route,input)=>input.kind==='record'?Promise.reject(new ReadError('Denied',403)):reply(route,input));
 await act(async()=>{await view.client.invalidateQueries({queryKey:recordKey});});
 await screen.findByText(/Candidate information is unavailable for this session\./);
 expect(screen.queryByRole('heading',{level:1})).toBeNull();
 expect(screen.queryByLabelText('Internal Notes')).toBeNull();expect(state.mutate).not.toHaveBeenCalled();
});
it('salary view revocation redacts Profile, Overview and stored value while retaining allowed dirty notes',async()=>{
 const view=mount();await ready();await screen.findByText('54,321 AED');section('Profile');
 fireEvent.change(screen.getByLabelText('Internal Notes'),{target:{value:'Retain permitted notes'}});
 expect(state.store!.getDraft(draftKey)?.expected_salary).toBe('54321');
 await revokeSalary(view.client);
 expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).value).toBe('');
 expect(screen.queryByText('54,321 AED')).toBeNull();
 expect((screen.getByLabelText('Internal Notes') as HTMLTextAreaElement).value).toBe('Retain permitted notes');
 expect(state.store!.getDraft(draftKey)?.expected_salary).toBe('');
 expect(view.client.getQueryData<{candidate:{expected_salary:number|null}}>(recordKey)?.candidate.expected_salary).toBe(null);
 view.replace({...candidate,expected_salary:null});
 expect(state.store!.getDraft(draftKey)?.notes).toBe('Retain permitted notes');
 expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).value).toBe('');
});
it('view-only salary permission keeps display, removes editing and omits salary from mutation payload',async()=>{
 state.read.mockImplementation(async(route,input)=>{
  const result=await reply(route,input);
  if('salaryAccess'in result.data)result.data.salaryAccess.canManage=false;
  return result;
 });
 state.mutate.mockResolvedValue({success:true,data:{id:880100,revision:'18',replayed:false}});
 const view=mount();await screen.findByText('11');section('Profile');
 await waitFor(()=>expect(screen.getByRole('button',{name:'Save'})).toBeTruthy());
 expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).value).toBe('54321');
 expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).disabled).toBe(true);
 fireEvent.change(screen.getByLabelText('Internal Notes'),{target:{value:'Allowed notes'}});
 fireEvent.click(screen.getByRole('button',{name:'Save'}));
 await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
 expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('expected_salary');
 expect(state.mutate.mock.calls[0][2].revision).toBe('17');
 view.unmount();
});
it('ordinary record 503 preserves actual form node, allowed drafts and original opening revision',async()=>{
 const view=mount();await ready();section('Profile');
 const input=screen.getByLabelText('Internal Notes');
 fireEvent.change(input,{target:{value:'Outage draft survives'}});
 state.read.mockImplementation((route,input)=>input.kind==='record'?Promise.reject(new ReadError('Outage',503)):reply(route,input));
 await act(async()=>{await view.client.invalidateQueries({queryKey:recordKey});});
 await screen.findByText(/Access could not be refreshed/);
 expect(screen.getByLabelText('Internal Notes')).toBe(input);
 expect((input as HTMLTextAreaElement).value).toBe('Outage draft survives');
 expect(state.store!.getDraft(draftKey)?.notes).toBe('Outage draft survives');
 expect(state.mutate).not.toHaveBeenCalled();
 state.read.mockImplementation(reply);
 await act(async()=>{await view.client.invalidateQueries({queryKey:recordKey});});
 await waitFor(()=>expect(screen.queryByText(/Access could not be refreshed/)).toBeNull());
 state.mutate.mockResolvedValue({success:false,error:'Known rollback'});
 fireEvent.click(screen.getByRole('button',{name:'Save'}));
 await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
 expect(state.mutate.mock.calls[0][2].revision).toBe('17');
});
it('a user without salary viewing can save nonsalary details without false uncertain-operation blocking',async()=>{
 salaryVisible=false;state.mutate.mockResolvedValue({success:false,error:'Known validation rollback'});
 const view=mount();await screen.findByText('11');section('Profile');
 fireEvent.change(screen.getByLabelText('Internal Notes'),{target:{value:'Ordinary permitted update'}});
 fireEvent.click(screen.getByRole('button',{name:'Save'}));
 await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
 expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('expected_salary');
 expect(screen.queryByText(/Saving is blocked after an access change/)).toBeNull();
 expect(state.store!.getViewState(saveRetirementKey('hr_candidates:record:880100'))).toBeUndefined();
 fireEvent.click(screen.getByRole('button',{name:'Save'}));await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(2));
 view.unmount();
});
it('a new candidate can enter salary after selecting an authorized requisition, despite no global salary access',async()=>{
 state.read.mockImplementation((route,input)=>input.kind==='salary-access' && input.requisitionId===null
  ? Promise.resolve({success:true,data:{kind:'salary-access',requisitionId:null,salaryAccess:{...access,canView:false,canManage:false,canManageCandidate:false,companyId:null}}}) : reply(route,input));
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);
 render(<QueryClientProvider client={client}><WorkspaceUiMemoryProvider><CandidateWorkspaceForm mode="add" authContext={context}/></WorkspaceUiMemoryProvider></QueryClientProvider>);
 await screen.findByText('Fill the Profile tab to create a new candidate.');section('Profile');
 await waitFor(()=>expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).disabled).toBe(true));
 fireEvent.change(screen.getByLabelText('Internal Notes'),{target:{value:'New candidate draft preserved'}});
 fireEvent.click(screen.getByRole('combobox',{name:'Job Requisition'}));
 fireEvent.click(await screen.findByRole('option',{name:'SYNTHETIC-REQ — Synthetic job'}));
 await waitFor(()=>expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).disabled).toBe(false));
 fireEvent.change(screen.getByLabelText('Expected Salary (AED)'),{target:{value:'7654'}});
 expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).value).toBe('7654');
 expect((screen.getByLabelText('Internal Notes') as HTMLTextAreaElement).value).toBe('New candidate draft preserved');
 expect(state.mutate).not.toHaveBeenCalled();
});
it('late successful save after subject denial resolves opaque marker but cannot restore data or navigate',async()=>{
 let settle!:(value:unknown)=>void;
 state.mutate.mockImplementation(()=>new Promise(resolve=>{settle=resolve;}));
 const view=mount();await ready();section('Profile');
 fireEvent.change(screen.getByLabelText('Internal Notes'),{target:{value:'Private pending save'}});
 fireEvent.click(screen.getByRole('button',{name:'Save & Close'}));
 await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
 await deny(view.client);
 const key=saveRetirementKey('hr_candidates:record:880100');
 await waitFor(()=>expect(state.store!.getViewState(key)).toContain(state.mutate.mock.calls[0][2].operationId));
 expect(state.store!.getViewState('draft:tab:candidate-review-owner:candidate-workspace-form:save')).not.toContain('Private pending save');
 await act(async()=>settle({success:true,data:{id:880100,revision:'18',replayed:false}}));
 expect(state.store!.getViewState(key)).toBe('');
 expect(state.store!.hasDraft(draftKey)).toBe(false);
 expect(screen.queryByRole('heading',{level:1})).toBeNull();expect(state.success).not.toHaveBeenCalled();
});
it('salary revocation during an uncertain save keeps notes but scrubs pending payload and blocks resubmission after remount',async()=>{
 let fail!:(value:unknown)=>void;
 state.mutate.mockImplementation(()=>new Promise(resolve=>{fail=resolve;}));
 const view=mount();await ready();section('Profile');
 fireEvent.change(screen.getByLabelText('Internal Notes'),{target:{value:'Permitted draft after salary loss'}});
 fireEvent.click(screen.getByRole('button',{name:'Save'}));
 await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
 await revokeSalary(view.client);
 const key=saveRetirementKey('hr_candidates:record:880100');
 expect(state.store!.getViewState(key)).not.toContain('54321');
 expect(state.store!.getViewState('draft:tab:candidate-review-owner:candidate-workspace-form:save')).not.toContain('Permitted draft');
 await act(async()=>fail({success:false,error:'Unknown outcome',uncertain:true}));
 expect(state.store!.getViewState(key)).toBeTruthy();
 expect(state.store!.getDraft(draftKey)?.notes).toBe('Permitted draft after salary loss');
 view.unmount();state.store!.clearDraftsForTab('candidate-review-owner');
 mount();await screen.findByText('11');section('Profile');
 const save=screen.queryByRole('button',{name:'Save'});if(save)fireEvent.click(save);
 expect(state.mutate).toHaveBeenCalledTimes(1);
});
it('SSR identity-matched admission does not duplicate initial record/capability reads',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);
 render(<QueryClientProvider client={client}><WorkspaceUiMemoryProvider><CandidateWorkspaceForm candidate={candidate} mode="edit" authContext={context}
 initialRead={{identity:candidateRecordIdentity(context),updatedAt:Date.now(),data:{kind:'record',candidate:{...candidate,deleted_at:null,requisition:null,nationality:null,referred_by:null},salaryAccess:access}}}/></WorkspaceUiMemoryProvider></QueryClientProvider>);
 await ready();
 expect(state.read.mock.calls.filter(call=>call[0]==='hr-candidate-record')).toHaveLength(0);
});
it('newer same-identity SSR salary redaction cannot resurrect its earlier warm cache or draft value',async()=>{
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);
 const record={kind:'record' as const,candidate:{...candidate,deleted_at:null,requisition:null,nationality:null,referred_by:null},salaryAccess:access};
 const updatedAt=Date.now();
 const wrap=(data:typeof record,time:number)=><QueryClientProvider client={client}><WorkspaceUiMemoryProvider><CandidateWorkspaceForm candidate={data.candidate} mode="edit" authContext={context}
  initialRead={{identity:candidateRecordIdentity(context),updatedAt:time,data}}/></WorkspaceUiMemoryProvider></QueryClientProvider>;
 const view=render(wrap(record,updatedAt));await ready();section('Profile');
 fireEvent.change(screen.getByLabelText('Internal Notes'),{target:{value:'Allowed draft after fresh server response'}});
 const masked={...record,candidate:{...record.candidate,expected_salary:null},salaryAccess:{...access,canView:false,canManage:false}};
 view.rerender(wrap(masked,updatedAt+1000));
 await waitFor(()=>expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).value).toBe(''));
 expect((screen.getByLabelText('Internal Notes') as HTMLTextAreaElement).value).toBe('Allowed draft after fresh server response');
 expect(state.store!.getDraft(draftKey)?.expected_salary).toBe('');
 expect(client.getQueryData<{candidate:{expected_salary:number|null}}>(recordKey)?.candidate.expected_salary).toBe(null);
});
it('scope identity change revalidates admission and keeps allowed notes while redacting revoked salary',async()=>{
 const view=mount();await ready();section('Profile');
 fireEvent.change(screen.getByLabelText('Internal Notes'),{target:{value:'Allowed draft across scope refresh'}});
 salaryVisible=false;
 const narrowed={...context,permissionCodes:['hr.recruitment.view','hr.recruitment.manage'],roleAssignments:context.roleAssignments?.map(a=>({...a,permissionCodes:['hr.recruitment.view','hr.recruitment.manage']}))};
 view.replace(candidate,narrowed);
 await waitFor(()=>expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).value).toBe(''));
 expect((screen.getByLabelText('Internal Notes') as HTMLTextAreaElement).value).toBe('Allowed draft across scope refresh');
 expect(view.client.getQueryData(recordKey)).toBeUndefined();
 expect(state.store!.getDraft(draftKey)?.expected_salary).toBe('');
});
it('late record response for an earlier candidate cannot reveal or retire a different candidate',async()=>{
 let finish!:(value:unknown)=>void;
 const first={...candidate,id:880200,full_name_en:'Earlier pending candidate'};
 state.read.mockImplementation((route,input)=>input.kind==='record'&&input.candidateId===880200
  ? new Promise(resolve=>{finish=resolve;}) : reply(route,input));
 const view=mount();await ready();view.replace(first);
 await waitFor(()=>expect(state.read.mock.calls.some(call=>call[1].candidateId===880200)).toBe(true));
 view.replace(candidate);await ready();
 await act(async()=>finish({success:true,data:{kind:'record',candidate:{...candidate,id:880200,full_name_en:'OLD PRIVATE SUBJECT'},salaryAccess:access}}));
 expect(screen.queryByText('OLD PRIVATE SUBJECT')).toBeNull();expect(screen.getByRole('heading',{level:1,name:candidate.full_name_en})).toBeTruthy();
 expect(state.mutate).not.toHaveBeenCalled();
});

const saveKey = `${draftKey}:save`;
const recordEvidence = (salaryAccess = access, updatedAt = Date.now()): CandidateRecordInitial => ({
 identity:candidateRecordIdentity(context),updatedAt,data:{kind:'record',candidate:{...candidate,deleted_at:null,requisition:null,nationality:null,referred_by:null,expected_salary:salaryAccess.canView?candidate.expected_salary:null},salaryAccess},
});
function clearPresentationSpies() {
 for (const spy of [state.closeTab,state.markDirty,state.updateTabRoute,state.replace,state.refresh,state.error,state.success]) spy.mockClear();
}
function expectNoPresentation() {
 for (const spy of [state.closeTab,state.markDirty,state.updateTabRoute,state.replace,state.refresh,state.error,state.success]) expect(spy).not.toHaveBeenCalled();
}
it.each(['record-only','SSR'] as const)('newer %s management evidence replaces a warm salary grant without replacing the draft/revision',async source=>{
 const view=mount();await ready();section('Profile');
 const notes=screen.getByLabelText('Internal Notes');fireEvent.change(notes,{target:{value:'Keep opening revision and notes'}});
 let timestamp=Date.now()+1000;const seed=recordEvidence({...access,canManage:false},timestamp);
 const salaryReads=state.read.mock.calls.filter(call=>call[1].kind==='salary-access').length;
 if(source==='SSR')view.display(<CandidateWorkspaceForm candidate={candidate} mode='edit' authContext={context} initialRead={seed}/>);
 else {
  state.read.mockImplementation((route,input)=>input.kind==='record'?Promise.resolve({success:true,data:seed.data}):reply(route,input));
  await act(async()=>{await view.client.invalidateQueries({queryKey:recordKey,exact:true});});
  timestamp=view.client.getQueryState(recordKey)!.dataUpdatedAt;
 }
 await waitFor(()=>expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).disabled).toBe(true));
 expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).value).toBe('54321');
 expect(screen.getByLabelText('Internal Notes')).toBe(notes);expect((notes as HTMLTextAreaElement).value).toBe('Keep opening revision and notes');
 expect(state.read.mock.calls.filter(call=>call[1].kind==='salary-access')).toHaveLength(salaryReads);
 state.mutate.mockResolvedValue({success:false,error:'Known rollback'});fireEvent.click(screen.getByRole('button',{name:'Save'}));
 await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('expected_salary');
 expect(state.mutate.mock.calls[0][2].revision).toBe('17');
 expect(view.client.getQueryState([...salaryKey,candidateRecordIdentity(context)])?.dataUpdatedAt).toBe(timestamp);
});

it.each([false,true])('late confirmed update after real unmount (replacement=%s) settles only original bookkeeping',async replacement=>{
 let finish!:(value:unknown)=>void;state.mutate.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const view=mount();await ready();section('Profile');fireEvent.change(screen.getByLabelText('Internal Notes'),{target:{value:'Original dispatched notes'}});
 fireEvent.click(screen.getByRole('button',{name:'Save & Close'}));await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
 const operationId=state.mutate.mock.calls[0][2].operationId, invalidate=vi.spyOn(view.client,'invalidateQueries');
 view.display(null);
 expect(state.store!.getViewState(saveRetirementKey('hr_candidates:record:880100'))).toBeUndefined();
 if(replacement){view.display(node());await ready();section('Profile');fireEvent.change(screen.getByLabelText('Internal Notes'),{target:{value:'Replacement-owned draft'}});}
 const recordReads=state.read.mock.calls.filter(call=>call[1].kind==='record').length;clearPresentationSpies();
 await act(async()=>finish({success:true,data:{id:880100,revision:'18',replayed:false}}));
 expect(JSON.parse(state.store!.getViewState(saveKey)!)).toEqual({id:880100,revision:'18'});
 expect(invalidate).toHaveBeenCalledExactlyOnceWith({queryKey:recordKey,exact:true,refetchType:'none'});
 expect(view.client.getQueryState(recordKey)?.isInvalidated).toBe(true);
 expect(state.read.mock.calls.filter(call=>call[1].kind==='record')).toHaveLength(recordReads);
 expectNoPresentation();expect(state.mutate).toHaveBeenCalledTimes(1);expect(operationId).toMatch(/^[\da-f-]{36}$/);
 expect(state.store!.getViewState(saveRetirementKey('hr_candidates:record:880100'))).toBeUndefined();
 if(replacement){expect((screen.getByLabelText('Internal Notes') as HTMLTextAreaElement).value).toBe('Replacement-owned draft');expect(state.store!.getDraft(draftKey)?.notes).toBe('Replacement-owned draft');}
 // No assertion that the already-mounted replacement adopts a session receipt:
 // F04 sessions are captured per instance, not a cross-remount subscription.
});
it.each(['rollback','uncertain','throw','incomplete'] as const)('late %s after unmount preserves replacement draft and the truthful pending outcome',async outcome=>{
 let finish!:(value:unknown)=>void,fail!:(error:Error)=>void;
 state.mutate.mockImplementation(()=>new Promise((resolve,reject)=>{finish=resolve;fail=reject;}));
 const view=mount();await ready();fireEvent.click(screen.getByRole('button',{name:'Save & Close'}));await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
 const contract=state.mutate.mock.calls[0][2],invalidate=vi.spyOn(view.client,'invalidateQueries');
 view.display(null);view.display(node());await ready();section('Profile');fireEvent.change(screen.getByLabelText('Internal Notes'),{target:{value:'Untouched replacement'}});clearPresentationSpies();
 await act(async()=>{if(outcome==='throw')fail(Error('Synthetic transport uncertainty'));else finish(outcome==='incomplete'?{success:true,data:{id:880100}}:{success:false,error:'Synthetic result',uncertain:outcome==='uncertain'});});
 const stored=JSON.parse(state.store!.getViewState(saveKey)!);
 if(outcome==='rollback')expect(stored.pending).toBeUndefined();else expect(stored.pending.contract).toEqual(contract);
 expect(invalidate).not.toHaveBeenCalled();expectNoPresentation();expect(state.mutate).toHaveBeenCalledTimes(1);
 expect(state.store!.getDraft(draftKey)?.notes).toBe('Untouched replacement');expect((screen.getByLabelText('Internal Notes') as HTMLTextAreaElement).value).toBe('Untouched replacement');
 expect(state.store!.getViewState(saveRetirementKey('hr_candidates:record:880100'))).toBeUndefined();
});
it('same-ID flat permission loss retires the local owner even before the outer scope remount',async()=>{
 let finish!:(value:unknown)=>void;state.mutate.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
 const view=mount();await ready();section('Profile');fireEvent.click(screen.getByRole('button',{name:'Save & Close'}));await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
 fireEvent.change(screen.getByLabelText('Internal Notes'),{target:{value:'Current notes survive old-owner settlement'}});
 const scopedContext={...context,permissionCodes:permissions.filter(code=>code!=='hr.recruitment.manage')};
 // Current P03 also changes the outer generation. This harness intentionally
 // retains its store to exercise the inner fence independently of that remount.
 expect(candidateRecordIdentity(scopedContext)).not.toBe(candidateRecordIdentity(context));expect(readScopeVersion(scopedContext)).not.toBe(readScopeVersion(context));
 const store=state.store,invalidate=vi.spyOn(view.client,'invalidateQueries'),marker=saveRetirementKey('hr_candidates:record:880100');
 view.replace(candidate,scopedContext);await screen.findByRole('heading',{level:1,name:candidate.full_name_en});
 await waitFor(()=>expect(state.store!.getViewState(marker)).toContain(state.mutate.mock.calls[0][2].operationId));
 expect(state.store).toBe(store);expect(view.client.getQueryData(candidateRecordKey(candidate.id,candidateRecordIdentity(scopedContext)))).toBeTruthy();
 clearPresentationSpies();await act(async()=>finish({success:true,data:{id:880100,revision:'18',replayed:false}}));
 expect(state.store!.getViewState(marker)).toBe('');expect(JSON.parse(state.store!.getViewState(saveKey)!)).toEqual({id:880100,revision:'18'});
 expect(invalidate).toHaveBeenCalledExactlyOnceWith({queryKey:recordKey,exact:true,refetchType:'none'});expectNoPresentation();expect(state.mutate).toHaveBeenCalledTimes(1);
 expect(state.store!.getDraft(draftKey)?.notes).toBe('Current notes survive old-owner settlement');expect((screen.getByLabelText('Internal Notes') as HTMLTextAreaElement).value).toBe('Current notes survive old-owner settlement');
});
it.each(['permission','unmount'] as const)('retained parent Save cannot enter an action after %s commit, before passive effects',async change=>{
 const view=mount();await ready();const retained=state.parentSave!;expect(retained).toBeTypeOf('function');
 state.mutate.mockResolvedValue({success:false,error:'Known rollback'});
 const invoke=()=>{void retained();};
 if(change==='unmount')view.display(null,invoke);
 else view.replace(candidate,{...context,permissionCodes:['hr.recruitment.view'],roleAssignments:[]},invoke);
 expect(state.mutate).not.toHaveBeenCalled();expect(JSON.parse(state.store!.getViewState(saveKey)!).pending).toBeUndefined();
 expect(state.error).not.toHaveBeenCalled();
});
it('same-ID identity A-B-A cannot resurrect a retained A callback and current StrictMode controls still save',async()=>{
 const view=mount(true);await ready();const retained=state.parentSave!;
 const next={...context,permissionCodes:permissions.filter(code=>code!=='hr.employees.create')};
 view.replace(candidate,next);await ready();view.replace(candidate,context);await ready();
 state.mutate.mockResolvedValue({success:false,error:'Known rollback'});await act(async()=>{await retained();});expect(state.mutate).not.toHaveBeenCalled();
 fireEvent.click(screen.getByRole('button',{name:'Save'}));await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));expect(state.mutate.mock.calls[0][2].revision).toBe('17');
});
it('a live completion preserves edits made during save, and a later unchanged save may close',async()=>{
 let finish!:(value:unknown)=>void;state.mutate.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
 const view=mount();await ready();section('Profile');fireEvent.change(screen.getByLabelText('Internal Notes'),{target:{value:'Submitted'}});
 const invalidate=vi.spyOn(view.client,'invalidateQueries');fireEvent.click(screen.getByRole('button',{name:'Save & Close'}));await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
 fireEvent.change(screen.getByLabelText('Internal Notes'),{target:{value:'Later lawful edit'}});
 await act(async()=>finish({success:true,data:{id:880100,revision:'18',replayed:false}}));
 expect(state.store!.getDraft(draftKey)?.notes).toBe('Later lawful edit');expect(state.closeTab).not.toHaveBeenCalled();
 expect(invalidate).toHaveBeenCalledExactlyOnceWith({queryKey:recordKey,exact:true});expect(state.success).toHaveBeenCalledTimes(1);
 await waitFor(()=>expect((screen.getByRole('button',{name:'Save & Close'}) as HTMLButtonElement).disabled).toBe(false));
 state.mutate.mockResolvedValueOnce({success:true,data:{id:880100,revision:'19',replayed:false}});fireEvent.click(screen.getByRole('button',{name:'Save & Close'}));
 await waitFor(()=>expect(state.closeTab).toHaveBeenCalledExactlyOnceWith('candidate-review-owner',{force:true}));expect(state.mutate.mock.calls[1][2].revision).toBe('18');
 expect(state.store!.hasDraft(draftKey)).toBe(false);view.unmount();
});
it('a retained parent Save uses committed draft-B authority, not the earlier A salary grant',async()=>{
 state.requisitions.mockResolvedValue({success:true,data:{rows:[{id:880109,requisition_code:'SYNTHETIC-REQ',requisition_title:'Synthetic job'},
  {id:880119,requisition_code:'SYNTHETIC-B',requisition_title:'Unsaved requisition'}],totalCount:2}});
 state.read.mockImplementation((route,input)=>input.kind==='salary-access'&&input.requisitionId===880119
  ?Promise.resolve({success:true,data:{kind:'salary-access',requisitionId:880119,salaryAccess:{...access,canManage:false,companyId:880102}}}):reply(route,input));
 const view=mount();await ready();const retained=state.parentSave!;section('Profile');
 fireEvent.click(screen.getByRole('combobox',{name:'Job Requisition'}));fireEvent.click(await screen.findByRole('option',{name:'SYNTHETIC-B — Unsaved requisition'}));
 await waitFor(()=>expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).disabled).toBe(true));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Save'}) as HTMLButtonElement).disabled).toBe(false));
 state.mutate.mockResolvedValue({success:false,error:'Known rollback'});await act(async()=>{await retained();});
 expect(state.mutate).toHaveBeenCalledTimes(1);expect(state.mutate.mock.calls[0][1]).toMatchObject({requisition_id:880119});
 expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('expected_salary');expect(state.mutate.mock.calls[0][2].revision).toBe('17');view.unmount();
});

// These focused hook controls use the same suite/client boundary. They exercise
// cache publication races precisely; the real-parent cases above prove wiring.
type SalarySeed={requisitionId:number|null;access:CandidateSalaryAccess;identity:string;updatedAt:number};
function salaryProbe(initial:SalarySeed, beforeEffects?:()=>void) {
 const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);
 let current!:ReturnType<typeof useCandidateSalaryAccess>;
 function Probe({seed,commit}:{seed:SalarySeed;commit?:()=>void}){const value=useCandidateSalaryAccess(880109,context,true,seed);useLayoutEffect(()=>{current=value;commit?.();});return null;}
 const wrap=(seed:SalarySeed,commit?:()=>void)=><QueryClientProvider client={client}><Probe seed={seed} commit={commit}/></QueryClientProvider>;
 const view=render(wrap(initial,beforeEffects));return {...view,client,current:()=>current,seed:(seed:SalarySeed,commit?:()=>void)=>view.rerender(wrap(seed,commit))};
}
const salarySeed=(updatedAt=Date.now(),value:CandidateSalaryAccess=access):SalarySeed=>({identity:candidateRecordIdentity(context),requisitionId:880109,access:value,updatedAt});
it.each(['stale','foreign','wrong-requisition'] as const)('%s salary seed cannot replace the current whole authority tuple',kind=>{
 const first=salarySeed(),view=salaryProbe(first),key=[...salaryKey,candidateRecordIdentity(context)];
 const foreign={...salarySeed(first.updatedAt+1000,{...access,canManage:false,companyId:880102,branchId:880103}),
  ...(kind==='stale'?{updatedAt:first.updatedAt-1}:kind==='foreign'?{identity:'synthetic-foreign-identity'}:{requisitionId:880119})};
 view.seed(foreign);expect(view.current().data).toEqual(access);expect(view.client.getQueryState(key)?.dataUpdatedAt).toBe(first.updatedAt);
});
it('newer salary seed adopts the complete tuple, identical equal evidence is a no-op and equal conflict is unavailable',()=>{
 const first=salarySeed(),view=salaryProbe(first),tuple={...access,canManage:false,canManageCandidate:false,companyId:880102,branchId:880103};
 const newer=salarySeed(first.updatedAt+1000,tuple);view.seed(newer);expect(view.current().data).toEqual(tuple);
 const key=[...salaryKey,candidateRecordIdentity(context)],snapshot=view.client.getQueryState(key);view.seed({...newer,access:{...tuple}});
 expect(view.client.getQueryState(key)).toBe(snapshot);
 view.seed({...newer,access:{...tuple,canManage:true}});expect(view.current().data).toBeUndefined();expect(view.client.getQueryState(key)).toBe(snapshot);
});
it('live newer independent salary evidence settling before passive publication cannot be overwritten by the rendered seed',()=>{
 const first=salarySeed(),view=salaryProbe(first),newer={...access,canManage:false,companyId:880102,branchId:880103};let settled=false;
 const key=[...salaryKey,candidateRecordIdentity(context)];
 view.seed(salarySeed(first.updatedAt+1000),()=>{if(!settled){settled=true;view.client.setQueryData(key,{kind:'salary-access',requisitionId:880109,salaryAccess:newer},{updatedAt:first.updatedAt+2000});}});
 expect(view.client.getQueryData<{salaryAccess:CandidateSalaryAccess}>(key)?.salaryAccess).toEqual(newer);expect(view.client.getQueryState(key)?.dataUpdatedAt).toBe(first.updatedAt+2000);
});
it.each((['record','salary'] as const).flatMap(kind=>(['error','fetching'] as const).map(status=>({kind,status}))))(
 'new SSR evidence cannot disguise $kind $status metadata as a successful read',async({kind,status})=>{
 const first=recordEvidence(),client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);
 let admitted=false;
 function Probe({seed}:{seed:CandidateRecordInitial}){
  const record=useHrCandidateRecord(candidate.id,context,seed);
  const salary=useCandidateSalaryAccess(candidate.requisition_id,context,true,{requisitionId:candidate.requisition_id,access:seed.data.salaryAccess,identity:seed.identity,updatedAt:seed.updatedAt});
  useLayoutEffect(()=>{admitted=kind==='record'?record.verified:!!salary.data;});return null;
 }
 const wrap=(seed:CandidateRecordInitial)=><QueryClientProvider client={client}><Probe seed={seed}/></QueryClientProvider>,view=render(wrap(first));
 const key=kind==='record'?recordKey:[...salaryKey,candidateRecordIdentity(context)],query=client.getQueryCache().find({queryKey:key,exact:true})!,error=new ReadError('Synthetic outage',503);
 await act(async()=>{query.setState(status==='error'?{status:'error',error,fetchStatus:'idle',fetchFailureCount:2,fetchFailureReason:error,errorUpdatedAt:first.updatedAt+1,errorUpdateCount:1}:{fetchStatus:'fetching'});});
 const before=query.state;
 view.rerender(wrap(recordEvidence({...access,canManage:false},first.updatedAt+1000)));
 expect(admitted).toBe(false);
 for(const field of ['status','error','fetchStatus','fetchFailureCount','fetchFailureReason','errorUpdatedAt','errorUpdateCount','dataUpdatedAt'] as const)expect(query.state[field]).toBe(before[field]);
 await act(async()=>{query.setState({fetchStatus:'idle'});await client.refetchQueries({queryKey:key,exact:true});});
 await waitFor(()=>expect(admitted).toBe(true));
});
