// @vitest-environment jsdom
import {useState} from 'react';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {cleanup,fireEvent,render,waitFor} from '@testing-library/react';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import {syntheticAuthContext} from '../../performance/fixtures/auth-context';
import type {EmployeeFormState} from '@/features/hr/employees/document-create/hr-document-employee-review-step';
import type {HrEmployeeDraftFromDocuments} from '@/lib/hr/document-to-record/types';
const m=vi.hoisted(()=>({read:vi.fn(),blocked:false}));
vi.mock('@/lib/reads/client',()=>({readJson:m.read,retryAuthorizedRead:()=>false}));
vi.mock('@/hooks/lookups/use-org-queries',()=>({useOwnerCompaniesQuery:()=>({options:[{value:1,label:'Company A'},{value:2,label:'Company B'}]}),useBranchesQuery:()=>({options:[{value:10,label:'Branch A'},{value:11,label:'Branch B'}]})}));
vi.mock('@/hooks/lookups/use-geography-queries',()=>({useCountriesQuery:()=>({options:[]})}));
vi.mock('@/components/erp/combobox',()=>({ERPCombobox:({ariaLabel,value,options,onValueChange,disabled}:{ariaLabel:string;value:number|null;options:{value:number;label:string;disabled?:boolean}[];onValueChange:(value:number|null)=>void;disabled?:boolean})=><select aria-label={ariaLabel} value={value??''} disabled={disabled} onChange={e=>onValueChange(e.target.value?Number(e.target.value):null)}><option value="">Choose</option>{options.map(o=><option key={o.value} value={o.value} disabled={o.disabled}>{o.label}</option>)}</select>}));
import {HrDocumentEmployeeReviewStep} from '@/features/hr/employees/document-create/hr-document-employee-review-step';
const auth=syntheticAuthContext(['hr.employees.create']);
const core:EmployeeFormState={full_name_en:'Synthetic',full_name_ar:'',gender:'male',date_of_birth:'1985-01-01',nationality_id:null,mobile_number:'',personal_email:'',owner_company_id:1,branch_id:10,department_id:14,designation_id:20,employee_category_id:4,employment_type_id:null,joining_date:'2022-01-01',emergency_contact_name:'',emergency_contact_mobile:''};
beforeEach(()=>{m.blocked=false;m.read.mockReset();m.read.mockImplementation(async(_resource,params)=>{const ready=(options:unknown[]=[])=>({status:'ready',options});return {success:true,data:{departments:ready([{value:14,label:'Scoped department'}]),designations:m.blocked?{status:'restricted',error:'Catalogue access unavailable'}:ready([{value:20,label:'Scoped operator'},{value:21,label:'Shared operator'}]),categories:ready([{value:4,label:'Operator'}]),employment:ready(),sites:ready(),mohre:ready(),relationships:ready()}};});});
afterEach(cleanup);
const mount=(patch:Partial<EmployeeFormState>={})=>{
 function Form(){const [form,setForm]=useState({...core,...patch});return <><output data-testid="state">{JSON.stringify(form)}</output><HrDocumentEmployeeReviewStep authContext={auth} draft={{conflicts:[]} as unknown as HrEmployeeDraftFromDocuments} form={form} setForm={patch=>setForm(prev=>({...prev,...patch}))} conflicts={[]} onResolveConflict={vi.fn()} duplicates={[]} identityDocDuplicates={[]} onNext={vi.fn()} onBack={vi.fn()}/></>;}
 return render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Form/></QueryClientProvider>);
};
it('uses scoped, fresh-creation choices and allows blank contact fields',async()=>{const ui=mount();await waitFor(()=>expect((ui.getByRole('button',{name:'Review Compliance Records'}) as HTMLButtonElement).disabled).toBe(false));expect(m.read).toHaveBeenCalledWith('employee-profile-choices',expect.objectContaining({companyId:1,branchId:10,departmentId:14,selected:expect.objectContaining({designations:null})}),expect.any(AbortSignal));expect(ui.getByRole('option',{name:'Scoped operator'})).toBeTruthy();expect(ui.getByRole('option',{name:'Shared operator'})).toBeTruthy();});
it.each([['Employer Company','2',['branch_id','department_id','designation_id']],['Branch','11',['department_id','designation_id']],['Department','',['designation_id']]])('clears dependent references after changing %s',async(label,value,fields)=>{const ui=mount();await ui.findByRole('option',{name:'Scoped operator'});fireEvent.change(ui.getByLabelText(label),{target:{value}});const state=JSON.parse(ui.getByTestId('state').textContent!);for(const field of fields)expect(state[field]).toBeNull();});
it('holds a previous foreign designation rather than allowing an invalid save',async()=>{const ui=mount({designation_id:75});expect(await ui.findByText(/previous selection is no longer available/)).toBeTruthy();expect((ui.getByRole('button',{name:'Review Compliance Records'}) as HTMLButtonElement).disabled).toBe(true);});
it('permission failure is visible and cannot use a retained selection',async()=>{m.blocked=true;const ui=mount();expect(await ui.findByText(/Catalogue access unavailable/)).toBeTruthy();expect((ui.getByRole('button',{name:'Review Compliance Records'}) as HTMLButtonElement).disabled).toBe(true);});
