// @vitest-environment jsdom
// Candidate Documents portal admission regressions with controlled transport. Real parent,
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
  dialogSubmit: null as (() => void | Promise<unknown>) | null,
  store: null as ReturnType<typeof createWorkspaceDraftStore> | null, pathname: '/admin/hr/recruitment/candidates/record/880100'}));
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

const permissions = ['hr.recruitment.view', 'hr.recruitment.manage', 'hr.payroll.view', 'hr.payroll.manage', 'hr.employees.create'];
const context = {profile: {id: 880106, auth_user_id: 'synthetic-candidate-record-review', must_change_password: false}, accountStatus: 'active', isAccountActive: true,
  permissionCodes: permissions, roleCodes: ['hr_scoped'], roleAssignments: [{roleId: 880106, roleCode: 'hr_scoped', ownerCompanyId: 880101, branchId: null, permissionCodes: permissions}]} as unknown as AuthContext;
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
  vi.clearAllMocks(); state.dialogSubmit = null; state.store = createWorkspaceDraftStore();
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

vi.mock('@/components/erp/erp-child-dialog-form', async original => {
  const actual=await original<typeof import('@/components/erp/erp-child-dialog-form')>();
  return {...actual,ERPChildDialogForm:(props:React.ComponentProps<typeof actual.ERPChildDialogForm>)=>{
    // Capture only the callback; the actual dialog, portal and behavior still render.
    if(props.open && props.title==='Link DMS Document')state.dialogSubmit=props.onSubmit??null;
    return <actual.ERPChildDialogForm {...props}/>;
  }};
});

beforeEach(()=>{state.mutate.mockResolvedValue({success:false,error:'Synthetic controlled rollback'});});
const documentsKey=queryKeys.recruitment.candidateDocuments(candidate.id);
const linkedDocuments=()=>({success:true,data:[{id:880111,candidate_id:880100,dms_document_id:880112,document_purpose:'cv',verification_status:'unverified',
  dms_document:{id:880112,document_title:'SYNTHETIC PRIVATE CV TITLE',document_number:'SYN-DOC'}}]});

async function openFilledDocumentDialog() {
  section('Documents');
  const opener=screen.getByRole('button',{name:'Link DMS Document'}) as HTMLButtonElement;
  await waitFor(()=>expect(opener.disabled).toBe(false));
  fireEvent.click(opener);
  const dialog=await screen.findByRole('dialog',{name:'Link DMS Document'});
  fireEvent.change(within(dialog).getByLabelText('DMS Document ID'),{target:{value:'880112'}});
  fireEvent.change(within(dialog).getByLabelText('Notes'),{target:{value:'DIALOG SYNTHETIC DRAFT'}});
  return dialog;
}
async function failParentRead(client:QueryClient,kind:'record'|'salary-access') {
  state.read.mockImplementation((route,input)=>input.kind===kind
    ? Promise.reject(new ReadError('Synthetic parent admission outage',503)):reply(route,input));
  await act(async()=>{await client.invalidateQueries({queryKey:kind==='record'?recordKey:salaryKey});});
  await screen.findByText(/Access could not be refreshed\. Your draft is retained; saving is paused\./);
}
function assertDraft(dialog:HTMLElement) {
  expect((within(dialog).getByLabelText('DMS Document ID') as HTMLInputElement).value).toBe('880112');
  expect((within(dialog).getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('DIALOG SYNTHETIC DRAFT');
}
async function assertPaused(dialog:HTMLElement,retainedSubmit:()=>void|Promise<unknown>) {
  const submit=within(dialog).getByRole('button',{name:'Link Document'}) as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  expect(within(dialog).getByRole('alert').textContent).toContain('Your entries are retained');
  assertDraft(dialog);
  // Exercise both the real disabled control and direct callbacks, including one
  // captured before the failure; neither may rely on the DOM disabled state.
  fireEvent.click(submit);
  await act(async()=>{await retainedSubmit();await state.dialogSubmit?.();});
  expect(state.mutate).not.toHaveBeenCalled();
}
async function submitOne(dialog:HTMLElement) {
  const submit=within(dialog).getByRole('button',{name:'Link Document'}) as HTMLButtonElement;
  await waitFor(()=>expect(submit.disabled).toBe(false));
  state.mutate.mockResolvedValue({success:true,data:{id:880111}});
  fireEvent.click(submit);
  await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
  expect(state.mutate).toHaveBeenCalledWith(880100,{dms_document_id:880112,document_purpose:null,notes:'DIALOG SYNTHETIC DRAFT'});
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
}

it.each(['record','salary-access'] as const)(
  'parent %s 503 pauses the real portal and direct callbacks, then in-dialog retry preserves entries and permits one link',
  async kind=>{
    const view=mount();await ready();const dialog=await openFilledDocumentDialog();
    const retainedSubmit=state.dialogSubmit!;
    expect(view.container.contains(dialog)).toBe(false);
    await failParentRead(view.client,kind);
    expect(screen.getByRole('dialog',{name:'Link DMS Document'})).toBe(dialog);
    expect(dialog.closest('[inert]')).toBeNull();
    await assertPaused(dialog,retainedSubmit);
    state.read.mockImplementation(reply);
    fireEvent.click(within(dialog).getByRole('button',{name:'Retry document checks'}));
    await waitFor(()=>expect(screen.queryByText(/Access could not be refreshed/)).toBeNull());
    expect(screen.getByRole('dialog',{name:'Link DMS Document'})).toBe(dialog);
    assertDraft(dialog);await submitOne(dialog);
  }
);

it.each(['rejected','failure-envelope'] as const)(
  'own Documents %s read failure also pauses portal dispatch and recovers through its retry',
  async failure=>{
    const view=mount();await ready();const dialog=await openFilledDocumentDialog();
    const retainedSubmit=state.dialogSubmit!;
    if(failure==='rejected')state.docs.mockRejectedValue(new Error('Synthetic document collection unavailable'));
    else state.docs.mockResolvedValue({success:false,error:'Synthetic document collection unavailable'});
    await act(async()=>{await view.client.invalidateQueries({queryKey:documentsKey});});
    await waitFor(()=>expect((within(dialog).getByRole('button',{name:'Link Document'}) as HTMLButtonElement).disabled).toBe(true));
    await assertPaused(dialog,retainedSubmit);
    const parentReads=state.read.mock.calls.length;
    state.docs.mockResolvedValue(linkedDocuments());
    fireEvent.click(within(dialog).getByRole('button',{name:'Retry document checks'}));
    await waitFor(()=>expect(state.read.mock.calls.length).toBeGreaterThan(parentReads));
    await waitFor(()=>expect((within(dialog).getByRole('button',{name:'Link Document'}) as HTMLButtonElement).disabled).toBe(false));
    expect(screen.getByRole('dialog',{name:'Link DMS Document'})).toBe(dialog);
    assertDraft(dialog);await submitOne(dialog);
  }
);

it('Cancel and dirty-discard remain usable while the parent is inert after 503',async()=>{
  const view=mount();await ready();const dialog=await openFilledDocumentDialog();
  await failParentRead(view.client,'record');
  const cancel=within(dialog).getByRole('button',{name:'Cancel'}) as HTMLButtonElement;
  expect(cancel.disabled).toBe(false);fireEvent.click(cancel);
  await within(dialog).findByText('Discard unsaved changes?');
  fireEvent.click(within(dialog).getByRole('button',{name:'Discard changes'}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  expect(screen.getByRole('button',{name:'Retry candidate access'})).toBeTruthy();
  expect(state.mutate).not.toHaveBeenCalled();
});

it('successful read admission does not replace business permission when candidate manage access is removed',async()=>{
  const view=mount();await ready();const dialog=await openFilledDocumentDialog();
  const retainedSubmit=state.dialogSubmit!;
  state.read.mockImplementation(async(route,input)=>{
    const result=await reply(route,input);
    if(input.kind==='record' && 'salaryAccess' in result.data)result.data.salaryAccess.canManageCandidate=false;
    return result;
  });
  await act(async()=>{await view.client.invalidateQueries({queryKey:recordKey});});
  await within(dialog).findByText(/You do not have permission to change candidate documents/);
  expect((within(dialog).getByRole('button',{name:'Link Document'}) as HTMLButtonElement).disabled).toBe(true);
  await act(async()=>{await retainedSubmit();await state.dialogSubmit?.();});
  expect(state.mutate).not.toHaveBeenCalled();assertDraft(dialog);
});

it.each([401,403])('terminal parent %s closes the portal and retires an earlier retained callback',async status=>{
  const view=mount();await ready();const dialog=await openFilledDocumentDialog();
  const retainedSubmit=state.dialogSubmit!;
  state.read.mockImplementation((route,input)=>input.kind==='record'?Promise.reject(new ReadError('Synthetic subject denial',status)):reply(route,input));
  await act(async()=>{await view.client.invalidateQueries({queryKey:recordKey});});
  await screen.findByText(/Candidate information is unavailable for this session\./);
  expect(screen.queryByRole('dialog')).toBeNull();expect(document.body.contains(dialog)).toBe(false);
  expect(screen.queryByDisplayValue('DIALOG SYNTHETIC DRAFT')).toBeNull();
  await act(async()=>{await retainedSubmit();});
  expect(state.mutate).not.toHaveBeenCalled();
});

it('permitted dialog dispatches only once on rapid repeated submission and preserves the original payload',async()=>{
  let finish!:(value:unknown)=>void;
  state.mutate.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  mount();await ready();const dialog=await openFilledDocumentDialog();
  const submit=within(dialog).getByRole('button',{name:'Link Document'});
  const directSubmit=state.dialogSubmit!;
  await act(async()=>{fireEvent.click(submit);fireEvent.click(submit);await directSubmit();});
  expect(state.mutate).toHaveBeenCalledTimes(1);
  expect(state.mutate).toHaveBeenCalledWith(880100,{dms_document_id:880112,document_purpose:null,notes:'DIALOG SYNTHETIC DRAFT'});
  await act(async()=>finish({success:true,data:{id:880111}}));
  await waitFor(()=>expect(screen.queryByRole('dialog')).toBeNull());
  expect(state.success).toHaveBeenCalledWith('Document linked');
});

it('in-dialog retry has accessible pending state and coalesces rapid retry clicks without a business dispatch',async()=>{
  const view=mount();await ready();const dialog=await openFilledDocumentDialog();
  await failParentRead(view.client,'record');
  const releases:Array<()=>void>=[];
  state.read.mockImplementation((route,input)=>new Promise(resolve=>{releases.push(()=>{void reply(route,input).then(resolve);});}));
  state.docs.mockImplementation(()=>new Promise(resolve=>{releases.push(()=>resolve(linkedDocuments()));}));
  const readCount=state.read.mock.calls.length,documentCount=state.docs.mock.calls.length;
  const retry=within(dialog).getByRole('button',{name:'Retry document checks'});
  await act(async()=>{fireEvent.click(retry);fireEvent.click(retry);});
  await waitFor(()=>expect(state.read).toHaveBeenCalledTimes(readCount+2));
  expect(state.docs).toHaveBeenCalledTimes(documentCount+1);
  const pending=within(dialog).getByRole('button',{name:'Retrying document checks…'}) as HTMLButtonElement;
  expect(pending.disabled).toBe(true);expect(within(dialog).getByRole('alert').getAttribute('aria-busy')).toBe('true');
  expect((within(dialog).getByRole('button',{name:'Cancel'}) as HTMLButtonElement).disabled).toBe(false);
  expect((within(dialog).getByRole('button',{name:'Link Document'}) as HTMLButtonElement).disabled).toBe(true);
  expect(state.mutate).not.toHaveBeenCalled();
  await act(async()=>{releases.forEach(release=>release());});
  await waitFor(()=>expect((within(dialog).getByRole('button',{name:'Link Document'}) as HTMLButtonElement).disabled).toBe(false));
  assertDraft(dialog);expect(state.mutate).not.toHaveBeenCalled();
});

it.each(['success','failure'] as const)('an already-dispatched link keeps its actual controlled %s outcome after parent denial',async outcome=>{
  let finish!:(value:unknown)=>void;
  state.mutate.mockImplementation(()=>new Promise(resolve=>{finish=resolve;}));
  const view=mount();await ready();const dialog=await openFilledDocumentDialog();
  fireEvent.click(within(dialog).getByRole('button',{name:'Link Document'}));
  await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
  state.read.mockImplementation((route,input)=>input.kind==='record'?Promise.reject(new ReadError('Synthetic denied subject',403)):reply(route,input));
  await act(async()=>{await view.client.invalidateQueries({queryKey:recordKey});});
  await screen.findByText(/Candidate information is unavailable for this session\./);
  await act(async()=>finish(outcome==='success'?{success:true,data:{id:880111}}:{success:false,error:'Synthetic actual rejection'}));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(state.mutate).toHaveBeenCalledTimes(1);
  if(outcome==='success')expect(state.success).toHaveBeenCalledWith('Document linked');
  else {expect(state.error).toHaveBeenCalledWith('Synthetic actual rejection');expect(state.success).not.toHaveBeenCalled();}
});

it('a lost response after terminal denial remains explicitly unconfirmed rather than canceled or successful',async()=>{
  let reject!:(error:Error)=>void;
  state.mutate.mockImplementation(()=>new Promise((_resolve,fail)=>{reject=fail;}));
  const view=mount();await ready();const dialog=await openFilledDocumentDialog();
  fireEvent.click(within(dialog).getByRole('button',{name:'Link Document'}));
  await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
  state.read.mockImplementation((route,input)=>input.kind==='record'?Promise.reject(new ReadError('Synthetic denied subject',403)):reply(route,input));
  await act(async()=>{await view.client.invalidateQueries({queryKey:recordKey});});
  await screen.findByText(/Candidate information is unavailable for this session\./);
  await act(async()=>reject(new Error('Synthetic response lost')));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(state.success).not.toHaveBeenCalled();
  expect(state.error).toHaveBeenCalledWith(expect.stringContaining('The operation could not be confirmed.'));
  expect(state.mutate).toHaveBeenCalledTimes(1);
});
