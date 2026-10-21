// @vitest-environment jsdom
// Actual candidate offer salary retirement regression with controlled transport. Real parent,
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
import {CandidateOffersTab} from '@/features/hr/recruitment/tabs/candidate-offers-tab';
import {WorkspaceUiMemoryProvider} from '@/hooks/use-persistent-ui-state';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
import {ReadError} from '@/lib/reads/client';
import {candidateRecordKey} from '@/hooks/use-hr-candidate-record';
import {candidateRecordIdentity, type CandidateRecordInitial, type CandidateSalaryAccess} from '@/lib/reads/hr-candidate-record-schema';
import {queryKeys} from '@/lib/query/query-keys';
import type {AuthContext} from '@/lib/rbac/check';
import type {CandidateRow} from '@/server/actions/hr/recruitment';

const state = vi.hoisted(() => ({read: vi.fn(), salary: vi.fn(), requisitions: vi.fn(), docs: vi.fn(), interviews: vi.fn(), offers: vi.fn(),
  onboarding: vi.fn(), prep: vi.fn(), mutate: vi.fn(), dispatch: vi.fn(), error: vi.fn(), success: vi.fn(), warning: vi.fn(),
  dialogSubmit: null as (()=>void|Promise<unknown>) | null,
  store: null as ReturnType<typeof createWorkspaceDraftStore> | null, pathname: '/admin/hr/recruitment/candidates/record/880100'}));
// Retain this suite's earlier action-spy shape; F12's native contract and HTTP
// suites verify the real request/receipt protocol independently.
vi.mock('@/server/actions/hr/recruitment-lifecycle',()=>({mutateRecruitmentLifecycle:async(r:{kind:string;candidateId:number;id:number|null;values:unknown},operation:string)=>{const result=await state.mutate(r.id??r.candidateId,r.values);return result.success?{...result,data:{kind:r.kind,id:r.id??880299,candidate_id:r.candidateId,employee_id:null,operation_id:operation,revision:'1',replayed:false}}:result;},reconcileRecruitmentLifecycle:vi.fn()}));
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
  vi.clearAllMocks(); state.store = createWorkspaceDraftStore();
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
function mount(row = candidate, auth = context, initialRead?: CandidateRecordInitial) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false, staleTime: Infinity}}}); clients.push(client);
  const wrap = (child: React.ReactNode) => <QueryClientProvider client={client}><WorkspaceUiMemoryProvider>{child}</WorkspaceUiMemoryProvider></QueryClientProvider>;
  const view = render(wrap(<CandidateWorkspaceForm candidate={row} mode='edit' authContext={auth} initialRead={initialRead}/>));
  return {...view, client, replace: (row: CandidateRow, auth = context) => view.rerender(wrap(node(row, auth))),
   seed: (initialRead:CandidateRecordInitial) => view.rerender(wrap(<CandidateWorkspaceForm candidate={row} mode='edit' authContext={auth} initialRead={initialRead}/>))};
}
async function ready() {
  await screen.findByText('11');
  await waitFor(() => expect(state.read).toHaveBeenCalled());
  await waitFor(() => expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).disabled).toBe(false));
}
function section(label: string) {fireEvent.click(screen.getAllByRole('button', {name: label})[0]);}

const offer={id:880120,candidate_id:880100,requisition_id:880109,offer_status:'draft',owner_company_id:880101,branch_id:null,
 basic_salary:43210,gross_salary:54320,currency:'AED',notes:'SYNTHETIC OFFER NOTE'};
const offerKey=queryKeys.recruitment.candidateOffers(candidate.id);
vi.mock('@/components/erp/erp-child-dialog-form',async original=>{
 const actual=await original<typeof import('@/components/erp/erp-child-dialog-form')>();
 return {...actual,ERPChildDialogForm:(props:React.ComponentProps<typeof actual.ERPChildDialogForm>)=>{
  if(props.open && (props.title==='Edit Offer'||props.title==='Create Offer'))state.dialogSubmit=props.onSubmit??null;
  return <actual.ERPChildDialogForm {...props}/>;
 }};
});
beforeEach(()=>{state.dialogSubmit=null;state.offers.mockResolvedValue({success:true,data:[offer]});state.mutate.mockResolvedValue({success:false,error:'Synthetic rollback'});});
async function openOffer(mode:'edit'|'new'='edit'){
 section('Offers');
 const button=await screen.findByRole('button',{name:mode==='edit'?'Edit record':'Create Offer'});
 await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));fireEvent.click(button);
 const dialog=await screen.findByRole('dialog',{name:mode==='edit'?'Edit Offer':'Create Offer'});
 fireEvent.change(within(dialog).getByLabelText('Decision / change reason'),{target:{value:'Synthetic reviewed change'}});return dialog;
}
async function permissionChange(view:ReturnType<typeof mount>,lost:'view'|'manage'|'none'){
 const perms=permissions.filter(code=>lost==='none'||code!==('hr.payroll.'+lost));
 const next={...context,permissionCodes:perms,roleAssignments:context.roleAssignments!.map(role=>({...role,permissionCodes:perms}))};
 const salaryAccess={...access,canView:lost!=='view',canManage:lost==='none'};
 await act(async()=>{
  view.client.setQueryData(candidateRecordKey(candidate.id,candidateRecordIdentity(next)),{kind:'record',candidate:{...candidate,expected_salary:lost==='view'?null:candidate.expected_salary},salaryAccess});
  view.replace(candidate,next);
 });
 await waitFor(()=>expect((within(screen.getByRole('dialog')).getByRole('button',{name:'Save'}) as HTMLButtonElement).disabled).toBe(false));
 return next;
}
function salary(dialog:HTMLElement,label='Basic Salary'){return within(dialog).getByLabelText(label) as HTMLInputElement;}
function cachedOffers(view:ReturnType<typeof mount>){
 const cached=view.client.getQueryCache().findAll({queryKey:offerKey}).map(query=>query.state.data as {success:boolean;data:{operation:string;rows?:Array<typeof offer>;row?:typeof offer}}|undefined);
 const detail=cached.find(value=>value?.data.operation==='detail'&&value.data.row);
 if(detail?.data.row)return {success:detail.success,data:[detail.data.row]};
 const page=cached.find(value=>value?.data.operation==='page'&&value.data.rows);
 return page?.data.rows?{success:page.success,data:page.data.rows}:undefined;
}
async function serverCapability(view:ReturnType<typeof mount>,change:Partial<Omit<typeof access,'branchId'> & {branchId:number|null}>){
 state.read.mockImplementation((route,input)=>{
  if(route==='hr-candidate-summary')return reply(route,input);
  const salaryAccess={...access,...change};
  return Promise.resolve({success:true,data:input.kind==='salary-access'
   ?{kind:'salary-access',requisitionId:input.requisitionId,salaryAccess}
   :{kind:'record',candidate:{...candidate,expected_salary:salaryAccess.canView?candidate.expected_salary:null},salaryAccess}});
 });
 await act(async()=>{await Promise.all([view.client.invalidateQueries({queryKey:recordKey}),view.client.invalidateQueries({queryKey:salaryKey})]);});
}
async function temporaryFailure(view:ReturnType<typeof mount>,kind:'record'|'salary-access'){
 state.read.mockImplementation((route,input)=>input.kind===kind?Promise.reject(new ReadError('Synthetic unavailable',503)):reply(route,input));
 await act(async()=>{await view.client.invalidateQueries({queryKey:kind==='record'?recordKey:salaryKey});});
 await screen.findByText(/Access could not be refreshed/);
}

it('verified exact-scope view loss retires editing/form/cache salary but retains permitted notes',async()=>{
 const view=mount();await ready();const dialog=await openOffer(),retained=state.dialogSubmit!;
 fireEvent.change(salary(dialog),{target:{value:'76543'}});
 fireEvent.change(within(dialog).getByLabelText('Notes'),{target:{value:'Permitted unsaved note'}});
 await permissionChange(view,'view');
 await waitFor(()=>expect(salary(dialog).value).toBe(''));
 expect(salary(dialog,'Gross Salary').value).toBe('');expect(salary(dialog).disabled).toBe(true);
 expect((within(dialog).getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Permitted unsaved note');
 await waitFor(()=>expect(cachedOffers(view)?.data[0].basic_salary).toBeNull());
 expect(cachedOffers(view)?.data[0].gross_salary).toBeNull();
 await act(async()=>{await retained();});expect(state.mutate).not.toHaveBeenCalled();
 // A retired authority callback cannot dispatch. The current permitted form
 // may still save its nonsalary notes after explicit user submission.
 fireEvent.click(within(dialog).getByRole('button',{name:'Save'}));await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
 expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('basic_salary');expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('gross_salary');
});
it('restoring view/manage never resurrects retired salary in an already-open editor or retained callback',async()=>{
 const view=mount();await ready();const dialog=await openOffer(),retained=state.dialogSubmit!;
 fireEvent.change(salary(dialog),{target:{value:'76543'}});await permissionChange(view,'view');await permissionChange(view,'none');
 await waitFor(()=>expect(salary(dialog).value).toBe(''));expect(salary(dialog).disabled).toBe(true);
 await act(async()=>{await retained();});expect(state.mutate).not.toHaveBeenCalled();
 fireEvent.click(within(dialog).getByRole('button',{name:'Save'}));await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
 expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('basic_salary');
 expect(JSON.stringify(state.mutate.mock.calls)).not.toContain('76543');
});
it('manage-only permission loss preserves readable salary but retained callback cannot submit it',async()=>{
 const view=mount();await ready();const dialog=await openOffer(),retained=state.dialogSubmit!;
 fireEvent.change(salary(dialog),{target:{value:'76543'}});
 await permissionChange(view,'manage');await waitFor(()=>expect(salary(dialog).disabled).toBe(true));
 expect(salary(dialog).value).toBe('76543');expect(salary(dialog,'Gross Salary').value).toBe('54320');
 // Role-snapshot changes rotate identity; the actual parent may retire the whole
 // child cache. If retained, manage-only loss must not redact its readable value.
 const cached=cachedOffers(view);
 if(cached)expect(cached.data[0].basic_salary).toBe(43210);
 else expect(view.client.getQueryState(offerKey)).toBeUndefined();
 await act(async()=>{await retained();});expect(state.mutate).not.toHaveBeenCalled();
 // The retired authority callback cannot dispatch. Only a fresh explicit
 // nonsalary save under the current identity may submit the retained notes.
 await act(async()=>{await state.dialogSubmit?.();});await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
 expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('basic_salary');expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('gross_salary');
});
it.each((['edit','new'] as const).flatMap(mode=>(['record','salary-access'] as const).map(kind=>({mode,kind}))))(
 '$mode offer keeps legitimate salary draft through ordinary $kind 503, then recovers',async({mode,kind})=>{
 const view=mount();await ready();const dialog=await openOffer(mode),retained=state.dialogSubmit!;
 fireEvent.change(salary(dialog),{target:{value:'76543'}});fireEvent.change(salary(dialog,'Gross Salary'),{target:{value:'87654'}});
 await temporaryFailure(view,kind);
 expect(salary(dialog).value).toBe('76543');expect(salary(dialog,'Gross Salary').value).toBe('87654');
 expect(within(dialog).queryByText(/Earlier salary values were removed/)).toBeNull();
 await act(async()=>{await retained();});expect(state.mutate).not.toHaveBeenCalled();
 state.read.mockImplementation(reply);fireEvent.click(within(dialog).getByRole('button',{name:'Retry required checks'}));
 await waitFor(()=>expect((within(dialog).getByRole('button',{name:mode==='edit'?'Save':'Add'}) as HTMLButtonElement).disabled).toBe(false));
 expect(salary(dialog).value).toBe('76543');expect(salary(dialog).disabled).toBe(false);
 await act(async()=>{await state.dialogSubmit?.();});await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
 expect(state.mutate.mock.calls[0][1]).toMatchObject({basic_salary:76543,gross_salary:87654});
});
it('salary cache redaction preserves failed read status, error and original data timestamp',async()=>{
 const view=mount();await ready();const dialog=await openOffer(),retained=state.dialogSubmit!;await permissionChange(view,'view');
 const query=view.client.getQueryCache().findAll({queryKey:offerKey}).find(item=>item.queryKey.includes('detail'))!,error=new Error('Synthetic existing read failure');
 const prior=query.state.data as {success:true;data:{row:Record<string,unknown>}};
 await act(async()=>{query.setState({status:'error',error,fetchStatus:'idle',dataUpdatedAt:12000,data:{...prior,data:{...prior.data,row:{...prior.data.row,...offer}}}});});
 await waitFor(()=>expect(cachedOffers(view)?.data[0].basic_salary).toBeNull());
 expect(query.state.status).toBe('error');expect(query.state.error).toBe(error);expect(query.state.fetchStatus).toBe('idle');expect(query.state.dataUpdatedAt).toBe(12000);
 expect((within(dialog).getByRole('button',{name:'Save'}) as HTMLButtonElement).disabled).toBe(true);
 await act(async()=>{await retained();});expect(state.mutate).not.toHaveBeenCalled();
});
it('same-identity server-verified view loss retires exact-scope salary despite stale role projection',async()=>{
 const view=mount();await ready();const dialog=await openOffer(),retained=state.dialogSubmit!;
 fireEvent.change(salary(dialog),{target:{value:'76543'}});await serverCapability(view,{canView:false,canManage:false});
 await waitFor(()=>expect(salary(dialog).value).toBe(''));
 expect(salary(dialog,'Gross Salary').value).toBe('');await waitFor(()=>expect(cachedOffers(view)?.data[0].basic_salary).toBeNull());
 await act(async()=>{await retained();});await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
 expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('basic_salary');
});
it('same-identity server-verified manage-only loss keeps readable salary but omits it from stale callback payload',async()=>{
 const view=mount();await ready();const dialog=await openOffer(),retained=state.dialogSubmit!;
 fireEvent.change(salary(dialog),{target:{value:'76543'}});await serverCapability(view,{canView:true,canManage:false});
 await waitFor(()=>expect(salary(dialog).disabled).toBe(true));expect(salary(dialog).value).toBe('76543');
 expect(cachedOffers(view)?.data[0].basic_salary).toBe(43210);
 await act(async()=>{await retained();});await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
 expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('basic_salary');
});
it('server capability for another scope does not revoke this offer salary',async()=>{
 const view=mount();await ready();const dialog=await openOffer();
 fireEvent.change(salary(dialog),{target:{value:'76543'}});
 await serverCapability(view,{companyId:880102,branchId:null,canView:false,canManage:false});
 expect(salary(dialog).value).toBe('76543');expect(salary(dialog).disabled).toBe(false);
 expect(cachedOffers(view)?.data[0].basic_salary).toBe(43210);
});
it('a payroll role in another company never grants access to this offer salary',async()=>{
 const view=mount();await ready();const dialog=await openOffer(),retained=state.dialogSubmit!;
 const recruitment=permissions.filter(code=>!code.startsWith('hr.payroll.')),payroll=permissions.filter(code=>code.startsWith('hr.payroll.'));
 const next={...context,roleAssignments:[{...context.roleAssignments![0],permissionCodes:recruitment},{...context.roleAssignments![0],roleId:880199,roleCode:'other_payroll',ownerCompanyId:880102,permissionCodes:payroll}]};
 await act(async()=>{view.client.setQueryData(candidateRecordKey(candidate.id,candidateRecordIdentity(next)),{kind:'record',candidate:{...candidate,expected_salary:null},salaryAccess:{...access,canView:false,canManage:false}});view.replace(candidate,next);});
 await waitFor(()=>expect(salary(dialog).value).toBe(''));expect(salary(dialog).disabled).toBe(true);
 await act(async()=>{await retained();});expect(state.mutate).not.toHaveBeenCalled();
 await act(async()=>{await state.dialogSubmit?.();});await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('basic_salary');
});
it.each([401,403])('terminal %s retires salary portal, cached projections and retained dispatch',async status=>{
 const view=mount();await ready();const dialog=await openOffer(),retained=state.dialogSubmit!;
 state.read.mockImplementation((route,input)=>input.kind==='record'?Promise.reject(new ReadError('Synthetic denied',status)):reply(route,input));
 await act(async()=>{await view.client.invalidateQueries({queryKey:recordKey});});await screen.findByText(/Candidate information is unavailable for this session/);
 expect(document.body.contains(dialog)).toBe(false);expect(cachedOffers(view)).toBeUndefined();
 await act(async()=>{await retained();});expect(state.mutate).not.toHaveBeenCalled();
});
it('confirmed same-scope denial stays retired through subsequent 503 and a later restored capability',async()=>{
 const view=mount();await ready();const dialog=await openOffer();fireEvent.change(salary(dialog),{target:{value:'76543'}});
 await serverCapability(view,{canView:false,canManage:false});await waitFor(()=>expect(salary(dialog).value).toBe(''));
 await temporaryFailure(view,'salary-access');expect(salary(dialog).value).toBe('');
 state.read.mockImplementation(reply);fireEvent.click(within(dialog).getByRole('button',{name:'Retry required checks'}));
 await waitFor(()=>expect((within(dialog).getByRole('button',{name:'Save'}) as HTMLButtonElement).disabled).toBe(false));
 expect(salary(dialog).value).toBe('');expect(salary(dialog).disabled).toBe(true);
});
it('verified denial in another branch is not a denial for a company-wide offer',async()=>{
 const view=mount();await ready();const dialog=await openOffer();fireEvent.change(salary(dialog),{target:{value:'76543'}});
 await serverCapability(view,{companyId:880101,branchId:880105,canView:false,canManage:false});
 expect(salary(dialog).value).toBe('76543');expect(salary(dialog).disabled).toBe(false);
});
it.each(['identity','subject'] as const)('standalone Offers evidence cache retires across %s ownership change without widening role scope',async change=>{
 // The enclosing provider owns real account-switch retirement. This small real-tab control
 // tests only that this local evidence cache does not survive an ownership change.
 const client=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity}}});clients.push(client);
 const nextContext=change==='identity'?{...context,profile:{...context.profile!,id:880107,auth_user_id:'synthetic-other-owner'}}:context;
 const nextId=change==='subject'?880200:candidate.id;
 const wrap=(auth:AuthContext,id:number,admitted:boolean,proof:typeof access|null)=><QueryClientProvider client={client}><WorkspaceUiMemoryProvider>
  <CandidateOffersTab candidateId={id} authContext={auth} canManage defaultCompanyId={880101} defaultBranchId={null}
   mutationAdmitted={admitted} verifiedPayrollAccess={proof}/></WorkspaceUiMemoryProvider></QueryClientProvider>;
 const view=render(wrap(context,candidate.id,true,{...access,canView:false,canManage:false}));
 await screen.findByText('Salary: Restricted or not recorded');
 if(change==='subject')state.offers.mockResolvedValue({success:true,data:[{...offer,candidate_id:nextId}]});
 view.rerender(wrap(nextContext,nextId,false,null));
 await waitFor(()=>expect((screen.getByRole('button',{name:'Create Offer'}) as HTMLButtonElement).disabled).toBe(true));
 view.rerender(wrap(nextContext,nextId,true,null));
 const add=screen.getByRole('button',{name:'Create Offer'});await waitFor(()=>expect((add as HTMLButtonElement).disabled).toBe(false));fireEvent.click(add);
 const dialog=await screen.findByRole('dialog',{name:'Create Offer'});expect(salary(dialog).value).toBe('');expect(salary(dialog).disabled).toBe(false);
 expect(state.mutate).not.toHaveBeenCalled();
});

const draftRequisition=880119;
const bothCompanies={...context,roleAssignments:[...context.roleAssignments!,{...context.roleAssignments![0],roleId:880107,ownerCompanyId:880102}]};
function scopedReplies(saved:CandidateRow,a:CandidateSalaryAccess,b:CandidateSalaryAccess){
 state.requisitions.mockResolvedValue({success:true,data:{rows:[
  {id:880109,requisition_code:'SYNTHETIC-REQ',requisition_title:'Synthetic job'},
  {id:draftRequisition,requisition_code:'SYNTHETIC-B',requisition_title:'Unsaved requisition'},
 ],totalCount:2}});
 const respond=(route:string,input:{kind?:string;requisitionId?:number|null;candidateId?:number})=>{
  if(route==='hr-candidate-summary')return reply(route,input);
  if(input.kind==='salary-access')return Promise.resolve({success:true,data:{kind:'salary-access',requisitionId:input.requisitionId,salaryAccess:input.requisitionId===draftRequisition?b:a}});
  return Promise.resolve({success:true,data:{kind:'record',candidate:{...saved,expected_salary:a.canView?saved.expected_salary:null},salaryAccess:a}});
 };
 state.read.mockImplementation(respond);return respond;
}
async function chooseDraftB(){
 section('Profile');fireEvent.change(screen.getByLabelText('Internal Notes'),{target:{value:'Unsaved B profile notes'}});
 fireEvent.click(screen.getByRole('combobox',{name:'Job Requisition'}));fireEvent.click(await screen.findByRole('option',{name:'SYNTHETIC-B — Unsaved requisition'}));
 await waitFor(()=>expect(state.store!.getDraft('draft:tab:candidate-review-owner:candidate-workspace-form')?.requisition_id).toBe(String(draftRequisition)));
}
it.each(['record-only','SSR'] as const)('open Offer honors newer %s manage-only evidence without a salary invalidation',async source=>{
 const view=mount();await ready();const dialog=await openOffer(),retained=state.dialogSubmit!;
 fireEvent.change(salary(dialog),{target:{value:'76543'}});fireEvent.change(within(dialog).getByLabelText('Notes'),{target:{value:'Retained offer notes'}});
 const time=Date.now()+1000,seed:CandidateRecordInitial={identity:candidateRecordIdentity(context),updatedAt:time,data:{kind:'record',candidate:{...candidate,deleted_at:null,requisition:null,nationality:null,referred_by:null},salaryAccess:{...access,canManage:false}}};
 const before=state.read.mock.calls.filter(call=>call[1].kind==='salary-access').length;
 if(source==='SSR')view.seed(seed);else {
  state.read.mockImplementation((route,input)=>input.kind==='record'?Promise.resolve({success:true,data:seed.data}):reply(route,input));
  await act(async()=>{await view.client.invalidateQueries({queryKey:recordKey,exact:true});});
 }
 await waitFor(()=>expect(salary(dialog).disabled).toBe(true));expect(salary(dialog).value).toBe('76543');expect((within(dialog).getByLabelText('Notes') as HTMLTextAreaElement).value).toBe('Retained offer notes');
 expect(state.read.mock.calls.filter(call=>call[1].kind==='salary-access')).toHaveLength(before);
 await act(async()=>{await retained();});expect(state.mutate).toHaveBeenCalledTimes(1);expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('basic_salary');
 expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('gross_salary');
});
it.each([false,true])('new Offer follows saved A manage=%s while unsaved B has the opposite grant',async aManage=>{
 scopedReplies(candidate,{...access,canManage:aManage},{...access,companyId:880102,canManage:!aManage});
 const view=mount(candidate,bothCompanies);await screen.findByText('11');await chooseDraftB();
 await waitFor(()=>expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).disabled).toBe(aManage));
 const dialog=await openOffer('new');expect(salary(dialog).disabled).toBe(!aManage);
 if(aManage){fireEvent.change(salary(dialog),{target:{value:'76543'}});fireEvent.change(salary(dialog,'Gross Salary'),{target:{value:'87654'}});}
 await act(async()=>{await state.dialogSubmit?.();});await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
 expect(state.mutate.mock.calls[0][0]).toBe(candidate.id);
 if(aManage)expect(state.mutate.mock.calls[0][1]).toMatchObject({basic_salary:76543,gross_salary:87654});
 else{expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('basic_salary');expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('gross_salary');}
 expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('requisition_id');
 expect(state.store!.getDraft('draft:tab:candidate-review-owner:candidate-workspace-form')).toMatchObject({requisition_id:String(draftRequisition),notes:'Unsaved B profile notes'});
 expect(JSON.parse(state.store!.getViewState('draft:tab:candidate-review-owner:candidate-workspace-form:save')!).revision).toBe('17');view.unmount();
});
it('known saved null uses global denial, never the manageable company of unsaved B',async()=>{
 const saved={...candidate,requisition_id:null,expected_salary:null};
 scopedReplies(saved,{...access,canView:false,canManage:false,companyId:null},{...access,companyId:880102});
 mount(saved,bothCompanies);await screen.findByText('11');await chooseDraftB();
 await waitFor(()=>expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).disabled).toBe(false));
 const dialog=await openOffer('new');expect(salary(dialog).disabled).toBe(true);expect(salary(dialog).value).toBe('');
 await act(async()=>{await state.dialogSubmit?.();});expect(state.mutate).toHaveBeenCalledTimes(1);expect(state.mutate.mock.calls[0][1]).not.toHaveProperty('basic_salary');
});
it('switching draft A to B cannot abort or detach the pending saved-A observer and same-key reads deduplicate',async()=>{
 const respond=scopedReplies(candidate,access,{...access,companyId:880102}),view=mount(candidate,bothCompanies);await ready();
 const identity=candidateRecordIdentity(bothCompanies),key=[...salaryKey,identity];let finish!:(value:unknown)=>void,signal:AbortSignal|undefined;
 const before=state.read.mock.calls.filter(call=>call[1].kind==='salary-access'&&call[1].requisitionId===880109).length;
 state.read.mockImplementation((route,input,currentSignal)=>input.kind==='salary-access'&&input.requisitionId===880109
  ?new Promise(resolve=>{finish=resolve;signal=currentSignal;}):respond(route,input));
 act(()=>{void view.client.invalidateQueries({queryKey:key,exact:true});});await waitFor(()=>expect(finish).toBeTypeOf('function'));
 await chooseDraftB();expect(signal?.aborted).toBe(false);
 const query=view.client.getQueryCache().find({queryKey:key,exact:true});expect(query).toBeTruthy();expect(query!.getObserversCount()).toBeGreaterThan(0);
 expect(state.read.mock.calls.filter(call=>call[1].kind==='salary-access'&&call[1].requisitionId===880109)).toHaveLength(before+1);
 await act(async()=>finish({success:true,data:{kind:'salary-access',requisitionId:880109,salaryAccess:access}}));
 const dialog=await openOffer('new');expect(salary(dialog).disabled).toBe(false);expect(view.client.getQueryCache().find({queryKey:key,exact:true})).toBe(query);
});
it.each([false,true])('only draft B failure does not disable healthy saved-A Offer (alreadyOpen=%s)',async alreadyOpen=>{
 const respond=scopedReplies(candidate,access,{...access,companyId:880102}),view=mount(candidate,bothCompanies);await ready();await chooseDraftB();
 let dialog=alreadyOpen?await openOffer('new'):undefined;const retained=state.dialogSubmit;
 state.read.mockImplementation((route,input)=>input.kind==='salary-access'&&input.requisitionId===draftRequisition?Promise.reject(new ReadError('Synthetic B outage',503)):respond(route,input));
 await act(async()=>{await view.client.invalidateQueries({queryKey:['hr','recruitment','salary-access',draftRequisition],exact:false});});
 await screen.findByText(/Access could not be refreshed/);expect(screen.queryByRole('button',{name:'Save & Close'})).toBeNull();
 if(!dialog){section('Offers');const opener=screen.getByRole('button',{name:'Create Offer'});expect(opener.closest('[inert]')).toBeNull();dialog=await openOffer('new');}
 expect(salary(dialog).disabled).toBe(false);fireEvent.change(salary(dialog),{target:{value:'76543'}});
 await act(async()=>{await (retained??state.dialogSubmit)?.();});expect(state.mutate).toHaveBeenCalledTimes(1);expect(state.mutate.mock.calls[0][1]).toMatchObject({basic_salary:76543});
});
it.each(['record','saved-A'] as const)('$0 failure pauses Offer despite healthy B; its retry does not reread B',async failed=>{
 const respond=scopedReplies(candidate,access,{...access,companyId:880102}),view=mount(candidate,bothCompanies);await ready();await chooseDraftB();
 const dialog=await openOffer('new'),retained=state.dialogSubmit!;fireEvent.change(salary(dialog),{target:{value:'76543'}});
 state.read.mockImplementation((route,input)=>(failed==='record'?input.kind==='record':input.kind==='salary-access'&&input.requisitionId===880109)
  ?Promise.reject(new ReadError('Synthetic saved dependency unavailable',503)):respond(route,input));
 await act(async()=>{await view.client.invalidateQueries({queryKey:failed==='record'?candidateRecordKey(candidate.id,candidateRecordIdentity(bothCompanies)):[...salaryKey,candidateRecordIdentity(bothCompanies)],exact:true});});
 await screen.findByText(/Access could not be refreshed/);expect(salary(dialog).value).toBe('76543');expect(within(dialog).queryByText(/Earlier salary values were removed/)).toBeNull();
 await act(async()=>{await retained();});expect(state.mutate).not.toHaveBeenCalled();
 const before=state.read.mock.calls.filter(call=>call[1].kind==='salary-access'&&call[1].requisitionId===draftRequisition).length;
 state.read.mockImplementation(respond);fireEvent.click(within(dialog).getByRole('button',{name:'Retry required checks'}));
 await waitFor(()=>expect((within(dialog).getByRole('button',{name:'Add'}) as HTMLButtonElement).disabled).toBe(false));
 expect(state.read.mock.calls.filter(call=>call[1].kind==='salary-access'&&call[1].requisitionId===draftRequisition)).toHaveLength(before);
 await act(async()=>{await retained();});expect(state.mutate).toHaveBeenCalledTimes(1);expect(state.mutate.mock.calls[0][1]).toMatchObject({basic_salary:76543});
});
it('an existing offer keeps its own scope when both saved A and dirty B refer elsewhere',async()=>{
 scopedReplies(candidate,{...access,canManage:false,companyId:880102},{...access,companyId:880102,canManage:false});
 mount(candidate,bothCompanies);await screen.findByText('11');await chooseDraftB();const dialog=await openOffer();
 expect(salary(dialog).disabled).toBe(false);fireEvent.change(salary(dialog),{target:{value:'76543'}});
 await act(async()=>{await state.dialogSubmit?.();});expect(state.mutate).toHaveBeenCalledTimes(1);expect(state.mutate.mock.calls[0][1]).toMatchObject({basic_salary:76543});
});
it('draft-B view denial redacts Profile without relabeling the healthy saved-A Offer authority',async()=>{
 scopedReplies(candidate,access,{...access,companyId:880102,canView:false,canManage:false});
 const view=mount(candidate,bothCompanies);await ready();await chooseDraftB();
 await waitFor(()=>expect((screen.getByLabelText('Expected Salary (AED)') as HTMLInputElement).value).toBe(''));
 expect(state.store!.getDraft('draft:tab:candidate-review-owner:candidate-workspace-form')?.notes).toBe('Unsaved B profile notes');
 const dialog=await openOffer('new');expect(salary(dialog).disabled).toBe(false);
 fireEvent.change(salary(dialog),{target:{value:'76543'}});await act(async()=>{await state.dialogSubmit?.();});
 expect(state.mutate).toHaveBeenCalledTimes(1);expect(state.mutate.mock.calls[0][1]).toMatchObject({basic_salary:76543});
 expect(view.client.getQueryData<{salaryAccess:CandidateSalaryAccess}>(candidateRecordKey(candidate.id,candidateRecordIdentity(bothCompanies)))?.salaryAccess).toEqual(access);
});
