// @vitest-environment jsdom
// Actual query cache, PERF inquiry hook and mutation-read boundary. Only the
// network/action ports and dialog/combobox presentation are controlled doubles.
import '../f05/setup';
import {act,cleanup,fireEvent,render as renderUI,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ReactElement,ReactNode} from 'react';
import type {AuthContext} from '@/lib/rbac/check';
import type {CandidateRow} from '@/server/actions/hr/recruitment';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
const m=vi.hoisted(()=>({store:null as unknown,create:vi.fn(),convert:vi.fn(),read:vi.fn(),prepare:vi.fn(),success:vi.fn(),error:vi.fn(),message:vi.fn(),prep:null as unknown}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:'owner'})}));
vi.mock('@/hooks/use-guarded-transition',()=>({useGuardedTransition:()=>[false,(run:()=>void)=>run()]}));
vi.mock('sonner',()=>({toast:{success:m.success,error:m.error,message:m.message}}));
vi.mock('@/lib/reads/client',async importOriginal=>({...await importOriginal<typeof import('@/lib/reads/client')>(),readJson:m.read,retryAuthorizedRead:()=>false}));
vi.mock('@/components/erp/erp-child-dialog-form',()=>({ERPChildDialogForm:({open,onOpenChange,onSubmit,children,submitLabel,isSubmitting,submitDisabled}:{open:boolean;onOpenChange:(v:boolean)=>void;onSubmit:()=>Promise<void>;children:ReactNode;submitLabel?:string;isSubmitting:boolean;submitDisabled?:boolean})=>open?<form aria-label="Child form" onSubmit={e=>{e.preventDefault();void onSubmit();}}>{children}<button type="button" onClick={()=>onOpenChange(false)}>Close</button><button type="submit" disabled={isSubmitting||submitDisabled}>{submitLabel??'Save'}</button></form>:null}));
vi.mock('@/components/erp/combobox',()=>({ERPCombobox:({ariaLabel,value,onValueChange,options}:{ariaLabel:string;value:string|null;onValueChange:(v:string)=>void;options:{value:string;label:string}[]})=><select aria-label={ariaLabel} value={value??''} onChange={e=>onValueChange(e.target.value)}>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}));
vi.mock('@/server/actions/hr/recruitment',()=>({createJobRequisition:m.create,convertCandidateToEmployee:m.convert,listJobRequisitions:vi.fn(),updateJobRequisition:vi.fn(),archiveJobRequisition:vi.fn(),prepareCandidateEmployeeConversion:m.prepare}));
import {RequisitionsPageClient} from '@/features/hr/recruitment/requisitions-page-client';
import {CandidateConversionTab} from '@/features/hr/recruitment/tabs/candidate-conversion-tab';
const codes=['hr.recruitment.manage','hr.recruitment.view','hr.employees.create','hr.employees.view','hr.employees.update','numbering.rules.generate'];
const auth={profile:{id:8,auth_user_id:'11111111-1111-4111-8111-111111111111'},isAccountActive:true,permissionCodes:codes,globalPermissionCodes:codes,roleCodes:[],roleAssignments:[{roleId:1,roleCode:'synthetic',ownerCompanyId:null,branchId:null,permissionCodes:codes}]} as AuthContext;
const candidate={id:7,workspace_revision:3,requisition_id:null,full_name_en:'Synthetic',candidate_code:'SYN',joining_status:'not_started'} as CandidateRow;
const acceptedOffer={id:61,offer_revision:'4',offer_terms_version:'1',requisition_id:62,owner_company_id:2,branch_id:null,department_id:null,designation_id:null,employment_type_id:null,proposed_joining_date:'2026-10-04'};
let queryClient:QueryClient;
const render=(node:ReactElement)=>renderUI(node,{wrapper:({children})=><QueryClientProvider client={queryClient}>{children}</QueryClientProvider>});
const conversion=()=> <CandidateConversionTab candidate={candidate} authContext={auth} canManage canCreateEmployee/>;
type UI=ReturnType<typeof render>;
async function open(ui:UI,label:string){
  const button=await ui.findByRole('button',{name:label,exact:true});
  await waitFor(()=>expect((button as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(button);
}
async function submit(ui:UI){await act(async()=>{fireEvent.submit(ui.getByRole('form'));});}
function fillConversion(ui:UI){
  for(const [label,value] of [['Owner Company ID','2'],['Joining Date','2026-10-04'],['Emergency Contact Name','Contact'],['Emergency Contact Mobile','000']])fireEvent.change(ui.getByLabelText(label),{target:{value}});
}
beforeEach(()=>{
  vi.resetAllMocks();
  queryClient=new QueryClient({defaultOptions:{queries:{retry:false,staleTime:Infinity},mutations:{retry:false}}});
  m.store=createWorkspaceDraftStore();
  m.prep={success:true,data:{candidate:{id:7,workspace_revision:3,requisition_id:null},latest_offer:acceptedOffer,already_converted:false}};
  m.read.mockResolvedValue({success:true,data:{kind:'requisitions',page:1,pageSize:25,rows:[],totalCount:0}});
  m.prepare.mockImplementation(async()=>m.prep);
  m.create.mockImplementation((_payload,contract)=>Promise.resolve({success:true,data:{id:21,requisition_code:'SYN-21',reference_id:31,operation_id:contract.operationId,replayed:false}}));
  m.convert.mockImplementation((_id,_payload,contract)=>Promise.resolve({success:true,data:{employee_id:22,employee_code:'SYN-22',candidate_id:7,candidate_revision:'4',employee_revision:'1',link_id:23,reference_id:32,operation_id:contract.operationId,replayed:false}}));
});
afterEach(()=>{cleanup();queryClient.clear();vi.restoreAllMocks();});

it('mounted create form does not turn zero vacancies into one',async()=>{
  const ui=render(<RequisitionsPageClient authContext={auth}/>);
  await open(ui,'New Requisition');
  fireEvent.change(ui.getByLabelText('Requisition Title'),{target:{value:'Synthetic'}});
  fireEvent.change(ui.getByLabelText('Vacancies'),{target:{value:'0'}});
  await submit(ui);
  expect(m.create).not.toHaveBeenCalled();expect(m.error).toHaveBeenCalled();
});
it('mounted create preserves a committed receipt when list refresh fails',async()=>{
  const ui=render(<RequisitionsPageClient authContext={auth}/>);
  await open(ui,'New Requisition');
  vi.spyOn(queryClient,'invalidateQueries').mockRejectedValueOnce(Error('refresh'));
  fireEvent.change(ui.getByLabelText('Requisition Title'),{target:{value:'Synthetic'}});
  await submit(ui);
  expect(m.success).toHaveBeenCalledWith('Requisition created');expect(m.error).not.toHaveBeenCalled();expect(ui.queryByRole('form')).toBeNull();
});
it('mounted lost requisition response reopens frozen original values and retries same operation',async()=>{
  m.create.mockRejectedValueOnce(Error('lost'));
  const ui=render(<RequisitionsPageClient authContext={auth}/>);
  await open(ui,'New Requisition');
  fireEvent.change(ui.getByLabelText('Requisition Title'),{target:{value:'Original'}});
  await submit(ui);
  const first=structuredClone(m.create.mock.calls[0]);
  fireEvent.click(ui.getByRole('button',{name:'Close'}));
  await open(ui,'Recover Requisition');
  expect((ui.getByLabelText('Requisition Title') as HTMLInputElement).value).toBe('Original');
  await submit(ui);
  expect(m.create.mock.calls[1]).toEqual(first);
});
it('mounted requisition admits explicit scope selection without inventing global scope',async()=>{
  const scoped={...auth,globalPermissionCodes:['numbering.rules.generate'],roleAssignments:[{roleId:1,roleCode:'synthetic',ownerCompanyId:1,branchId:null,permissionCodes:codes}]} as AuthContext;
  const ui=render(<RequisitionsPageClient authContext={scoped}/>);
  await waitFor(()=>expect(ui.getByText('0 permitted records')).toBeTruthy());
  expect((ui.getByRole('button',{name:'New Requisition'}) as HTMLButtonElement).disabled).toBe(false);
  await open(ui,'New Requisition');expect((ui.getByRole('button',{name:'Save'})as HTMLButtonElement).disabled).toBe(true);await submit(ui);expect(m.create).not.toHaveBeenCalled();
});
it('mounted conversion collects mandatory contacts and pins reviewed candidate revision',async()=>{
  const ui=render(conversion());
  await open(ui,'Convert to Employee');
  fireEvent.change(ui.getByLabelText('Owner Company ID'),{target:{value:'2'}});
  fireEvent.change(ui.getByLabelText('Joining Date'),{target:{value:'2026-10-04'}});
  await submit(ui);expect(m.convert).not.toHaveBeenCalled();
  fireEvent.change(ui.getByLabelText('Emergency Contact Name'),{target:{value:'Contact'}});
  fireEvent.change(ui.getByLabelText('Emergency Contact Mobile'),{target:{value:'000'}});
  await submit(ui);
  expect(m.convert).toHaveBeenCalledWith(7,expect.objectContaining({emergency_contact_name:'Contact',emergency_contact_mobile:'000'}),expect.objectContaining({revision:'3'}));
  expect(m.success).toHaveBeenCalledWith('Candidate converted to employee SYN-22');
});
it('mounted stale source displays a reload outcome without dispatch',async()=>{
  m.prep={success:true,data:{candidate:{id:7,workspace_revision:4,requisition_id:null},latest_offer:acceptedOffer,already_converted:false}};
  const ui=render(conversion());
  await waitFor(()=>expect(ui.getByRole('alert').textContent).toContain('candidate changed'));
  expect((ui.getByRole('button',{name:'Convert to Employee'}) as HTMLButtonElement).disabled).toBe(true);expect(m.convert).not.toHaveBeenCalled();
});
it('mounted conversion response loss remains recoverable after preparation read failure',async()=>{
  m.convert.mockRejectedValueOnce(Error('lost'));
  const ui=render(conversion());
  await open(ui,'Convert to Employee');fillConversion(ui);await submit(ui);
  const first=structuredClone(m.convert.mock.calls[0]);
  fireEvent.click(ui.getByRole('button',{name:'Close'}));
  m.prep={success:false,error:'Unavailable'};
  await act(async()=>{await queryClient.invalidateQueries({queryKey:['recruitment','conversion-prep',7]});});
  await waitFor(()=>expect(m.prepare).toHaveBeenCalledTimes(2));
  await open(ui,'Recover Original Conversion');
  await submit(ui);
  await waitFor(()=>expect(m.convert).toHaveBeenCalledTimes(2));expect(m.convert.mock.calls[1]).toEqual(first);
});
it('new requisition waits for the real counted-page read before admitting a mutation',async()=>{
  let finish!:(value:unknown)=>void;
  m.read.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve;}));
  const ui=render(<RequisitionsPageClient authContext={auth}/>);
  await waitFor(()=>expect(m.read).toHaveBeenCalledOnce());
  const button=ui.getByRole('button',{name:'New Requisition'});
  fireEvent.click(button);
  expect(ui.queryByRole('form')).toBeNull();expect(m.create).not.toHaveBeenCalled();
  await act(async()=>finish({success:true,data:{kind:'requisitions',page:1,pageSize:25,rows:[],totalCount:0}}));
  await waitFor(()=>expect(ui.getByText('0 permitted records')).toBeTruthy());
  await open(ui,'New Requisition');expect(ui.getByRole('form')).toBeTruthy();
});
it('fresh conversion retains its fields but cannot dispatch during a failed preparation recheck',async()=>{
  const ui=render(conversion());await open(ui,'Convert to Employee');fillConversion(ui);
  m.prep={success:false,error:'Unavailable'};
  await act(async()=>{await queryClient.invalidateQueries({queryKey:['recruitment','conversion-prep',7]});});
  await waitFor(()=>expect((ui.getByRole('button',{name:'Confirm Conversion'}) as HTMLButtonElement).disabled).toBe(true));
  expect((ui.getByLabelText('Emergency Contact Name') as HTMLInputElement).value).toBe('Contact');
  await submit(ui);expect(m.convert).not.toHaveBeenCalled();
});
