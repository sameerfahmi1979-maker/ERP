// @vitest-environment jsdom
import React from 'react';
import {afterEach,beforeEach,expect,it,vi}from 'vitest';
import {act,cleanup,fireEvent,render,screen,waitFor}from '@testing-library/react';
import {QueryClient,QueryClientProvider}from '@tanstack/react-query';
import type {AuthContext}from '@/lib/rbac/check';
import type {EmployeeListRow}from '@/server/actions/hr/employees';
import {syntheticAuthContext}from '../../performance/fixtures/auth-context';
import {createWorkspaceDraftStore}from '@/lib/workspace/workspace-draft-store';
import {RecordReadActivity}from '@/hooks/use-record-read-active';
import {employeeRecoveryIndexKey}from '@/features/hr/employees/use-employee-save-session';
const m=vi.hoisted(()=>({save:vi.fn(),recover:vi.fn(),cache:vi.fn(),error:vi.fn(),success:vi.fn(),refresh:vi.fn(),close:vi.fn(),route:vi.fn(),store:null as ReturnType<typeof createWorkspaceDraftStore>|null,submit:undefined as undefined|(()=>Promise<boolean>)}));
const photo=vi.hoisted(()=>({resolve:vi.fn(),confirmed:vi.fn(),validate:vi.fn(),save:vi.fn(),pending:false}));
vi.mock('@/features/hr/employees/use-subject-photo-draft',()=>({useSubjectPhotoDraft:()=>photo}));
const navigation=vi.hoisted(()=>({section:''}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:m.refresh,replace:m.route})}));
vi.mock('sonner',()=>({toast:{error:m.error,success:m.success}}));
vi.mock('@/lib/query/invalidation',()=>({invalidateHrEmployee:m.cache,invalidateHrEmployees:m.cache}));
vi.mock('@/server/actions/hr/employees',()=>({updateEmployee:m.save,createEmployee:m.save,reconcileEmployeeOperation:m.recover}));
vi.mock('@/hooks/use-workspace',()=>({useWorkspace:()=>({closeTab:m.close,markDirty:vi.fn(),updateTabRoute:m.route,isTabActive:()=>true})}));
vi.mock('@/hooks/use-workspace-form-owner',()=>({useWorkspaceFormOwner:()=>({id:'owned',route:'/admin/hr/employees/record/7'})}));
vi.mock('@/hooks/use-workspace-form-section',()=>({useWorkspaceFormSection:(_form:string,_initial:string,_allowed:readonly string[],preferred?:string)=>React.useState(preferred??'profile')}));
vi.mock('@/hooks/use-workspace-tab-dirty',()=>({useWorkspaceTabDirty:vi.fn()}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>m.store}));
vi.mock('@/components/workspace/draft-restored-notice',()=>({DraftRestoredNotice:()=>null}));
vi.mock('@/components/ui/button',()=>({Button:({variant,...props}:React.ButtonHTMLAttributes<HTMLButtonElement>&{variant?:string})=><button data-variant={variant}{...props}/>}));
vi.mock('@/components/workspace/erp-record-workspace-form',()=>({ERPRecordWorkspaceForm:({onSave,children,isSubmitting,activeSection}:{onSave?:()=>Promise<boolean>;children:React.ReactNode;isSubmitting:boolean;activeSection:string})=>{m.submit=onSave;navigation.section=activeSection;return <><button type="button" disabled={isSubmitting} onClick={()=>void onSave?.()}>Save profile</button>{children}</>;},ERPRecordSectionPanel:({id,children}:{id:string;children:React.ReactNode})=>id==='profile'?children:null}));
vi.mock('@/features/hr/employees/tabs/employee-profile-tab',()=>({EmployeeProfileTab:({form,setForm}:{form:{full_name_en:string;blood_group:string};setForm:React.Dispatch<React.SetStateAction<{full_name_en:string;blood_group:string}>>})=><><button type="button" onClick={()=>setForm(v=>({...v,full_name_en:"Synthetic new",gender:"male",owner_company_id:3,employee_category_id:4,photo_pending:"file"}))}>Stage photo</button><input aria-label="Name" value={form.full_name_en} onChange={e=>setForm(v=>({...v,full_name_en:e.target.value}))}/><input aria-label="Medical" value={form.blood_group} onChange={e=>setForm(v=>({...v,blood_group:e.target.value}))}/></>}));
vi.mock('@/features/hr/employees/tabs/employee-compliance-tab',()=>({EmployeeComplianceTab:()=>null}));
vi.mock('@/features/hr/employees/tabs/employee-time-tab',()=>({EmployeeTimeTab:()=>null}));
vi.mock('@/features/hr/employees/tabs/employee-payroll-tab',()=>({EmployeePayrollTab:()=>null}));
vi.mock('@/features/hr/employees/tabs/employee-operations-tab',()=>({EmployeeOperationsTab:()=>null}));
vi.mock('@/features/hr/employees/tabs/employee-hr-actions-tab',()=>({EmployeeHrActionsTab:()=>null}));
vi.mock('@/features/hr/employees/tabs/employee-overview-tab',()=>({EmployeeOverviewTab:()=>null}));
vi.mock('@/features/hr/employees/employee-employment-history',()=>({EmployeeEmploymentHistory:()=>null}));
vi.mock('@/features/dms/entity-documents',()=>({DmsEntityDocumentsTab:()=>null}));
vi.mock('@/features/hr/ai/hr-ai-review-tab',()=>({HrAiReviewTab:()=>null}));
vi.mock('@/features/hr/employees/employee-letters-forms',()=>({EmployeeLettersForms:()=>null}));
import {EmployeeWorkspaceForm}from '@/features/hr/employees/employee-workspace-form';
const auth=syntheticAuthContext(['hr.employees.create','hr.employees.view','hr.employees.update','hr.medical.view','hr.medical.manage'],{id:7,auth_user_id:'synthetic-a'});
const employee={id:7,workspace_revision:1,full_name_en:'Synthetic original',gender:'male',employee_category_id:4,owner_company_id:3,blood_group:'A+',employee_status:'active'}as EmployeeListRow;
const clients:QueryClient[]=[];
const namespace='draft:tab:owned:employee-workspace-form:actor:7:synthetic-a:save';
beforeEach(()=>{vi.clearAllMocks();m.cache.mockReset();m.refresh.mockReset();m.store=createWorkspaceDraftStore();m.save.mockResolvedValue({success:true,data:{id:7,revision:'2',replayed:false}});m.recover.mockResolvedValue({success:true,data:{id:7,revision:'2',replayed:true}});});
afterEach(()=>{cleanup();clients.splice(0).forEach(c=>c.clear());});
function mount(initial=auth,record=employee,section?:string){const client=new QueryClient({defaultOptions:{queries:{retry:false}}});clients.push(client);const tree=(context:AuthContext,active=true,hint=section)=><QueryClientProvider client={client}><RecordReadActivity active={active}><EmployeeWorkspaceForm mode={record?"edit":"add"} employee={record} authContext={context} initialSection={hint}/></RecordReadActivity></QueryClientProvider>;const view=render(tree(initial));return {...view,replace:(context:AuthContext,active=true)=>view.rerender(tree(context,active)),navigate:(hint:string)=>view.rerender(tree(initial,true,hint))};}

const frame={version:1,source:{documentId:12,versionId:13,fileId:14,sha256:'a'.repeat(64),width:120,height:140},rotation:0,crop:{x:0,y:0,width:100,height:100}};
const photoResult={photo_dms_document_id:12,photo_framing:JSON.stringify(frame),photo_pending:''};
beforeEach(()=>{photo.pending=false;photo.resolve.mockReset().mockResolvedValue(photoResult);photo.confirmed.mockReset();photo.save.mockImplementation(async r=>r.kind==='employee-create'?m.save(r.input,r.contract):m.save(r.id,r.input,r.contract));m.save.mockImplementation(async(first:unknown)=>({success:true,data:{id:7,revision:typeof first==='number'?'2':'1',replayed:false}}));});
it('new person is created before its photo; retries never duplicate that person',async()=>{
 photo.resolve.mockRejectedValueOnce(Error('Photo transfer unconfirmed'));mount(auth,null as never);fireEvent.click(screen.getByText('Stage photo'));
 let saved=true;await act(async()=>{saved=await m.submit!();});expect(saved).toBe(false);expect(m.save).toHaveBeenCalledOnce();expect(m.save.mock.calls[0][0].photo_framing).toBeNull();expect(m.save.mock.calls[0][0].photo_dms_document_id).toBeNull();expect(photo.resolve).toHaveBeenCalledWith(7,null,expect.objectContaining({photo_pending:'file'}));expect(m.close).not.toHaveBeenCalled();
 await act(async()=>{saved=await m.submit!();});expect(saved).toBe(true);expect(m.save).toHaveBeenCalledTimes(2);expect(m.save.mock.calls[1][0]).toBe(7);expect(m.save.mock.calls[1][1].photo_framing).toEqual(frame);expect(photo.confirmed).toHaveBeenCalledOnce();
});
it('lost final photo-save response replays the original payload, revision and operation',async()=>{
 m.save.mockImplementationOnce(async()=>({success:true,data:{id:7,revision:'1',replayed:false}})).mockResolvedValueOnce({success:false,uncertain:true,error:'Final response lost'}).mockResolvedValueOnce({success:true,data:{id:7,revision:'2',replayed:true}});
 mount(auth,null as never);fireEvent.click(screen.getByText('Stage photo'));await act(async()=>{expect(await m.submit!()).toBe(false);});const original=structuredClone(m.save.mock.calls[1]);expect(photo.confirmed).not.toHaveBeenCalled();await act(async()=>{expect(await m.submit!()).toBe(true);});expect(m.save.mock.calls[2]).toEqual(original);expect(m.save.mock.calls.filter(c=>typeof c[0]!=='number')).toHaveLength(1);expect(photo.confirmed).toHaveBeenCalledOnce();
});
it('lost initial person creation retains its operation before any photo work',async()=>{
 m.save.mockResolvedValueOnce({success:false,uncertain:true,error:'Create response lost'}).mockResolvedValueOnce({success:true,data:{id:7,revision:'1',replayed:true}}).mockResolvedValueOnce({success:true,data:{id:7,revision:'2',replayed:false}});
 mount(auth,null as never);fireEvent.click(screen.getByText('Stage photo'));await act(async()=>{expect(await m.submit!()).toBe(false);});expect(photo.resolve).not.toHaveBeenCalled();await act(async()=>{expect(await m.submit!()).toBe(true);});expect(m.save.mock.calls[1]).toEqual(m.save.mock.calls[0]);expect(photo.resolve).toHaveBeenCalledOnce();
});
