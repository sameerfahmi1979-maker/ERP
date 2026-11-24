// @vitest-environment jsdom
import {act,cleanup,fireEvent,render} from '@testing-library/react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import type {ReactNode} from 'react';
import type {AuthContext} from '@/lib/rbac/check';
import {createWorkspaceDraftStore} from '@/lib/workspace/workspace-draft-store';
const m=vi.hoisted(()=>({store:null as unknown,save:vi.fn(),shared:vi.fn(),push:vi.fn(),success:vi.fn(),error:vi.fn(),warning:vi.fn(),invalidChild:false,medical:false,training:false,reviewedCompletion:false,showShared:false,selectExtra:false}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:'owner'})}));
vi.mock('next/navigation',()=>({useRouter:()=>({push:m.push})}));
vi.mock('sonner',()=>({toast:{success:m.success,error:m.error,warning:m.warning}}));
vi.mock('@/server/actions/hr/document-to-employee',()=>({createEmployeeFromDmsDocuments:m.save}));
vi.mock('@/server/actions/hr/shared-document-employee-draft',()=>({accessSharedDocumentEmployeeDraft:m.shared}));
vi.mock('@/components/erp/erp-child-dialog-form',()=>({ERPChildDialogForm:({open,children,onOpenChange}:{open:boolean;children:ReactNode;onOpenChange:(value:boolean)=>void})=>open?<div>{children}<button onClick={()=>onOpenChange(false)}>Close</button></div>:null}));
vi.mock('@/features/hr/employees/document-create/hr-document-picker-step',()=>({HrDocumentPickerStep:({onNext,onToggle}:{onNext:(value:unknown)=>void;onToggle:(value:unknown)=>void})=><button onClick={()=>{onToggle({id:2,title:'Source',document_no:'SYN-DOC'});if(m.selectExtra)onToggle({id:3,title:'Extra source',document_no:'SYN-EXTRA'});onNext({selectedDocumentIds:[2],selectedDocuments:[{id:2,title:'Source',document_no:'SYN-DOC'}],sharedDraftAvailable:m.showShared,employeeDraft:{conflicts:[]},complianceSuggestions:m.training?[{kind:'training_certificate',tempId:'training',sourceDocumentId:2,included:true,fields:{training_type_id:6,provider:'Synthetic',certificate_number:'SYN-CERT',issue_date:'2025-12-01',...(m.reviewedCompletion?{completion_date:'2026-01-01'}:{}),expiry_date:'2027-01-01'},warnings:[],fieldConfidence:{}}]:m.medical?[{kind:'medical_insurance',tempId:'medical',sourceDocumentId:2,included:true,fields:{insurance_provider:'Synthetic',policy_number:'SYN',expiry_date:'2027-01-01',employee_covered:true,dependent_coverage_included:false},warnings:[],fieldConfidence:{}}]:m.invalidChild?[{kind:'identity_document',tempId:'one',sourceDocumentId:2,included:true,fields:{document_type_id:5,document_number:''},warnings:[],fieldConfidence:{}}]:[],duplicates:[],identityDocDuplicates:[],reviewedSources:[{documentId:2,fingerprint:'a'.repeat(64)}]});}}>Prepare source</button>}));
vi.mock('@/features/hr/employees/document-create/hr-document-employee-review-step',()=>({HrDocumentEmployeeReviewStep:({form,setForm,onNext}:{form:{full_name_en:string};setForm:(value:unknown)=>void;onNext?:()=>void})=><><input aria-label="Employee name" value={form.full_name_en} onChange={event=>setForm({full_name_en:event.target.value})}/>{onNext&&<button onClick={()=>{setForm({full_name_en:form.full_name_en||'Synthetic',gender:'male',date_of_birth:'1990-01-01',mobile_number:'000',owner_company_id:3,employee_category_id:4,joining_date:'2026-10-04',emergency_contact_name:'Contact',emergency_contact_mobile:'000'});onNext();}}>Review employee</button>}</>}));
vi.mock('@/features/hr/employees/document-create/hr-document-compliance-review-step',()=>({HrDocumentComplianceReviewStep:({onNext,onChange,suggestions}:{onNext:()=>void;onChange:(value:unknown)=>void;suggestions:{fields:Record<string,unknown>}[]})=><><button onClick={()=>onChange(suggestions.map(s=>({...s,fields:{...s.fields,employee_covered:false,dependent_coverage_included:false}})))}>Confirm explicit no coverage</button><button onClick={onNext}>Review compliance</button></>}));
vi.mock('@/features/hr/employees/document-create/hr-document-create-summary-step',()=>({HrDocumentCreateSummaryStep:({onSubmit,isSubmitting}:{onSubmit:()=>void;isSubmitting:boolean})=><button disabled={isSubmitting} onClick={onSubmit}>Confirm employee</button>}));
import {HrDocumentEmployeeCreateWizard} from '@/features/hr/employees/document-create/hr-document-employee-create-wizard';
const codes=['hr.employees.create','hr.employees.view','hr.employees.update','hr.compliance.manage','hr.compliance.view','hr.medical.manage','hr.medical.view','dms.documents.view','dms.documents.preview','dms.documents.edit','numbering.rules.generate'];
const auth={profile:{id:8},isAccountActive:true,permissionCodes:codes,globalPermissionCodes:codes,roleCodes:[],roleAssignments:[{roleId:1,roleCode:'synthetic',ownerCompanyId:null,branchId:null,permissionCodes:codes}]} as AuthContext;
const mount=(context=auth)=>render(<HrDocumentEmployeeCreateWizard open onOpenChange={vi.fn()} authContext={context}/>);
const review=(ui:ReturnType<typeof mount>)=>{fireEvent.click(ui.getByRole('button',{name:'Prepare source'}));fireEvent.click(ui.getByRole('button',{name:'Review employee'}));fireEvent.click(ui.getByRole('button',{name:'Review compliance'}));};
beforeEach(()=>{vi.clearAllMocks();m.invalidChild=false;m.medical=false;m.training=false;m.reviewedCompletion=false;m.showShared=false;m.selectExtra=false;m.shared.mockReset();m.store=createWorkspaceDraftStore();m.save.mockImplementation((payload,contract)=>Promise.resolve({success:true,data:{employeeId:11,employeeCode:'SYN',employeeRevision:'1',referenceId:12,operationId:contract.operationId,sourceDocumentIds:[2],linkIds:[13],childRecords:payload.complianceRecords.map((child:{kind:string;sourceDocumentId:number},index:number)=>({kind:child.kind,sourceDocumentId:child.sourceDocumentId,id:20+index})),complianceRecordsCreated:payload.complianceRecords.length,documentsLinked:1,warnings:[],replayed:false}}));m.push.mockReset();});
afterEach(cleanup);
it('mounted wizard submits reviewed sources and preserves a saved outcome',async()=>{const ui=mount();review(ui);await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Confirm employee'}));});expect(m.save).toHaveBeenCalledWith(expect.objectContaining({full_name_en:'Synthetic',selectedDocumentIds:[2]}),expect.objectContaining({reviewedSources:[{documentId:2,fingerprint:'a'.repeat(64)}]}));expect(m.success).toHaveBeenCalled();expect(m.push).toHaveBeenCalledWith('/admin/hr/employees/record/11');});
it('does not silently drop invalid included children',async()=>{m.invalidChild=true;const ui=mount();review(ui);await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Confirm employee'}));});expect(m.save).not.toHaveBeenCalled();expect(m.error).toHaveBeenCalledWith(expect.stringContaining('every included record'));});
it('close/remount recovers exact original request without re-preparation',async()=>{m.save.mockRejectedValueOnce(Error('Lost'));const ui=mount();review(ui);await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Confirm employee'}));});const original=structuredClone(m.save.mock.calls[0]);fireEvent.click(ui.getByRole('button',{name:'Close'}));ui.unmount();const next=mount();expect(next.queryByRole('button',{name:'Prepare source'})).toBeNull();await act(async()=>{fireEvent.click(next.getByRole('button',{name:'Retry original request'}));});expect(m.save.mock.calls[1]).toEqual(original);});
it('permission loss does not hide or erase uncertain-request recovery',async()=>{m.save.mockRejectedValueOnce(Error('Lost')).mockResolvedValueOnce({success:false,uncertain:false,error:'Denied'});const ui=mount();review(ui);await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Confirm employee'}));});ui.unmount();const next=mount({...auth,permissionCodes:[],globalPermissionCodes:[],roleAssignments:[]});await act(async()=>{fireEvent.click(next.getByRole('button',{name:'Retry original request'}));});expect(next.getByRole('button',{name:'Retry original request'})).toBeTruthy();expect(m.save.mock.calls[1]).toEqual(m.save.mock.calls[0]);});
it('navigation failure cannot turn a known commit into failure',async()=>{m.push.mockImplementation(()=>{throw Error('Navigation');});const ui=mount();review(ui);await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Confirm employee'}));});expect(m.success).toHaveBeenCalled();expect(m.error).not.toHaveBeenCalled();expect(m.warning).toHaveBeenCalledWith(expect.stringContaining('Saved.'));});
it('missing destination scope prevents submission without wiping form',()=>{const ui=mount({...auth,roleAssignments:[{roleId:2,roleCode:'foreign',ownerCompanyId:4,branchId:null,permissionCodes:codes}]});review(ui);expect((ui.getByRole('button',{name:'Confirm employee'}) as HTMLButtonElement).disabled).toBe(true);expect(m.save).not.toHaveBeenCalled();});
it('does not accept guessed shared-mapper medical coverage defaults',async()=>{m.medical=true;const ui=mount();review(ui);await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Confirm employee'}));});expect(m.save).not.toHaveBeenCalled();expect(m.error).toHaveBeenCalledWith(expect.stringContaining('every included record'));});
it('submits both explicitly reviewed false medical choices unchanged',async()=>{m.medical=true;const ui=mount();fireEvent.click(ui.getByRole('button',{name:'Prepare source'}));fireEvent.click(ui.getByRole('button',{name:'Review employee'}));fireEvent.click(ui.getByRole('button',{name:'Confirm explicit no coverage'}));fireEvent.click(ui.getByRole('button',{name:'Review compliance'}));await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Confirm employee'}));});expect(m.save.mock.calls[0][0].complianceRecords[0]).toMatchObject({employee_covered:false,dependent_coverage_included:false});expect(m.success).toHaveBeenCalled();});
it('closed recovery stays reachable after create admission is revoked',async()=>{m.save.mockRejectedValueOnce(Error('Lost'));const ui=mount();review(ui);await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Confirm employee'}));});ui.unmount();const open=vi.fn(),next=render(<HrDocumentEmployeeCreateWizard open={false} onOpenChange={open} authContext={{...auth,permissionCodes:[],globalPermissionCodes:[],roleAssignments:[]}}/>);fireEvent.click(next.getByRole('button',{name:'Recover document employee request'}));expect(open).toHaveBeenCalledWith(true);});
it.each([false,true])('training wizard submits actual columns and no guessed completion (reviewed=%s)',async reviewed=>{m.training=true;m.reviewedCompletion=reviewed;const ui=mount();review(ui);await act(async()=>{fireEvent.click(ui.getByRole('button',{name:'Confirm employee'}));});const child=m.save.mock.calls[0][0].complianceRecords[0];expect(child.completion_date).toBe(reviewed?'2026-01-01':null);expect(child).not.toHaveProperty('issue_date');expect(child).not.toHaveProperty('renewal_status');expect(m.success).toHaveBeenCalled();});

const held = {
  draftId: '3731e900-a7f0-41de-b53b-fd53bede10a8',
  revision: 1,
  ownerCompanyId: 3,
  branchId: null,
  sourceFingerprints: [{documentId: 2, fingerprint: 'a'.repeat(64)}],
  payload: {full_name_en: 'Saved draft name'},
};

it('keeps the ordinary reviewed employee flow when shared drafts are off',()=>{
  const ui=mount();
  fireEvent.click(ui.getByRole('button',{name:'Prepare source'}));
  expect(ui.queryByRole('button',{name:'Open shared draft'})).toBeNull();
  expect(ui.getByRole('button',{name:'Review employee'})).toBeTruthy();
  expect(m.shared).not.toHaveBeenCalled();
});

it('withholds shared drafts when the picker selection changes before source review returns',()=>{
  m.showShared=true;
  m.selectExtra=true;
  const ui=mount();
  fireEvent.click(ui.getByRole('button',{name:'Prepare source'}));
  expect(ui.queryByRole('button',{name:'Open shared draft'})).toBeNull();
  expect(m.shared).not.toHaveBeenCalled();
});

it('opens the saved version in the wizard and keeps its values out of employee creation', async () => {
  m.showShared=true;
  m.shared.mockResolvedValueOnce({success:true,data:held});
  const ui=mount();
  fireEvent.click(ui.getByRole('button',{name:'Prepare source'}));
  fireEvent.change(ui.getByLabelText('Employee name'),{target:{value:'Current review name'}});
  await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Open shared draft'})));
  expect(m.shared).toHaveBeenCalledWith({kind:'open',reviewedSources:held.sourceFingerprints});
  expect(ui.getByLabelText('Employee name')).toHaveProperty('value','Saved draft name');
  expect(ui.queryByRole('button',{name:'Review employee'})).toBeNull();
  expect(ui.queryByRole('button',{name:'Confirm employee'})).toBeNull();
  expect(m.save).not.toHaveBeenCalled();
  fireEvent.click(ui.getByRole('button',{name:'Return to employee review'}));
  expect(ui.getByLabelText('Employee name')).toHaveProperty('value','Current review name');
  fireEvent.click(ui.getByRole('button',{name:'Review employee'}));
  fireEvent.click(ui.getByRole('button',{name:'Review compliance'}));
  await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Confirm employee'})));
  expect(m.save).toHaveBeenCalledWith(expect.objectContaining({full_name_en:'Current review name'}),
    expect.objectContaining({reviewedSources:held.sourceFingerprints}));
});

it.each([
  {success:false,code:'changed',error:'The draft or its source changed.'},
  {success:false,code:'unconfirmed',error:'The draft result could not be confirmed.'},
])('clears private draft values on $code and reopens through a fresh source check', async (failure) => {
  m.showShared=true;
  m.shared
    .mockResolvedValueOnce({success:true,data:held})
    .mockResolvedValueOnce(failure)
    .mockResolvedValueOnce(failure)
    .mockResolvedValueOnce({success:true,data:{...held,revision:2,payload:{full_name_en:'New saved revision'}}});
  const ui=mount();
  fireEvent.click(ui.getByRole('button',{name:'Prepare source'}));
  fireEvent.change(ui.getByLabelText('Employee name'),{target:{value:'Ordinary review change'}});
  await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Open shared draft'})));
  fireEvent.change(ui.getByLabelText('Employee name'),{target:{value:'Unsaved change'}});
  await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Save shared draft'})));
  expect(m.shared.mock.calls[1][0]).toMatchObject({
    kind:'save',draftId:held.draftId,revision:1,reviewedSources:held.sourceFingerprints,payload:{full_name_en:'Unsaved change'},
  });
  expect(m.shared.mock.calls[1][0].payload).not.toHaveProperty('owner_company_id');
  expect(ui.getByLabelText('Employee name')).toHaveProperty('value','Ordinary review change');
  expect(ui.queryByDisplayValue('Saved draft name')).toBeNull();
  expect(ui.queryByDisplayValue('Unsaved change')).toBeNull();
  expect(ui.queryByRole('button',{name:'Save shared draft'})).toBeNull();
  await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Reopen shared draft'})));
  expect(m.shared.mock.calls[2][0]).toEqual({kind:'read',draftId:held.draftId,reviewedSources:held.sourceFingerprints});
  expect(ui.getByLabelText('Employee name')).toHaveProperty('value','Ordinary review change');
  expect(ui.queryByRole('button',{name:'Save shared draft'})).toBeNull();
  await act(async()=>fireEvent.click(ui.getByRole('button',{name:'Reopen shared draft'})));
  expect(ui.getByLabelText('Employee name')).toHaveProperty('value','New saved revision');
  expect(ui.getByRole('button',{name:'Save shared draft'})).toHaveProperty('disabled',false);
  expect(m.save).not.toHaveBeenCalled();
});

it('ignores a held draft result after the wizard closes', async () => {
  m.showShared=true;
  let resolve!: (value: unknown) => void;
  m.shared.mockReturnValueOnce(new Promise(done=>{resolve=done;}));
  const ui=mount();
  fireEvent.click(ui.getByRole('button',{name:'Prepare source'}));
  fireEvent.click(ui.getByRole('button',{name:'Open shared draft'}));
  fireEvent.click(ui.getByRole('button',{name:'Close'}));
  fireEvent.click(ui.getByRole('button',{name:'Prepare source'}));
  await act(async()=>resolve({success:true,data:held}));
  expect(ui.getByLabelText('Employee name')).toHaveProperty('value','');
  expect(ui.queryByRole('button',{name:'Save shared draft'})).toBeNull();
});
