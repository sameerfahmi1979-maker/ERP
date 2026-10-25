// @vitest-environment jsdom
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { AssignRoleDialog } from '@/features/users/assign-role-dialog';
import type { UserWithRoles, Role, OwnerCompany, Branch } from '@/types/domain';

const actions=vi.hoisted(()=>({assign:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>({refresh:actions.refresh})}));
vi.mock('@/server/actions/users',()=>({assignRoleToUser:actions.assign}));
vi.mock('@/components/erp/erp-child-dialog-form',()=>({ERPChildDialogForm:({children,onSubmit}:{children:ReactNode;onSubmit:()=>void})=><div>{children}<button onClick={onSubmit}>Submit assignment</button></div>}));
vi.mock('@/components/erp/combobox',()=>({ERPCombobox:({value,onValueChange,options,placeholder}:{value:string;onValueChange:(value:string|null)=>void;options:{value:string;label:string}[];placeholder:string})=><select aria-label={placeholder} value={value} onChange={e=>onValueChange(e.target.value||null)}><option value="">Clear</option>{options.map(o=><option key={o.value} value={o.value}>{o.label}</option>)}</select>}));
const props={open:true,canAssignGlobal:true,onOpenChange:vi.fn(),user:{id:999,full_name:'Synthetic',owner_company_id:101,branch_id:201} as UserWithRoles,roles:[{id:7,role_name:'Synthetic role',role_code:'synthetic',is_active:true,is_assignable:true} as Role],companies:[{id:101,legal_name_en:'Synthetic company'} as OwnerCompany],branches:[{id:201,owner_company_id:101,branch_name_en:'Synthetic branch'} as Branch]};
afterEach(()=>{cleanup();vi.resetAllMocks();});
it('keeps company/branch defaults when the required scope selector is cleared',async()=>{
 actions.assign.mockResolvedValue({success:true});
 const ui=render(<AssignRoleDialog {...props}/>);
 fireEvent.change(ui.getByLabelText('Select role...'),{target:{value:'7'}});
 fireEvent.change(ui.getByLabelText('Select scope...'),{target:{value:''}});
 expect((ui.getByLabelText('Select scope...') as HTMLSelectElement).value).toBe('branch');
 fireEvent.click(ui.getByText('Submit assignment'));
 await waitFor(()=>expect(actions.assign).toHaveBeenCalledWith({user_profile_id:999,role_id:7,owner_company_id:101,branch_id:201,is_active:true}));
});
it('uses global scope only after explicit selection',async()=>{
 actions.assign.mockResolvedValue({success:true});
 const ui=render(<AssignRoleDialog {...props}/>);
 fireEvent.change(ui.getByLabelText('Select role...'),{target:{value:'7'}});
 fireEvent.change(ui.getByLabelText('Select scope...'),{target:{value:'global'}});
 fireEvent.click(ui.getByText('Submit assignment'));
 await waitFor(()=>expect(actions.assign).toHaveBeenCalledWith({user_profile_id:999,role_id:7,owner_company_id:null,branch_id:null,is_active:true}));
});
it('restores subject defaults after close/reopen without submitting discarded state',()=>{
 const ui=render(<AssignRoleDialog {...props}/>);
 fireEvent.change(ui.getByLabelText('Select scope...'),{target:{value:'global'}});
 ui.rerender(<AssignRoleDialog {...props} open={false}/>);
 ui.rerender(<AssignRoleDialog {...props}/>);
 expect((ui.getByLabelText('Select scope...') as HTMLSelectElement).value).toBe('branch');
 expect((ui.getByLabelText('Select organization...') as HTMLSelectElement).value).toBe('101');
 expect((ui.getByLabelText('Select branch...') as HTMLSelectElement).value).toBe('201');
 expect(actions.assign).not.toHaveBeenCalled();
});

it('hides Global System and privileged role choices from a scoped administrator',()=>{
 const ui=render(<AssignRoleDialog {...props} canAssignGlobal={false} roles={[...props.roles,{id:8,role_name:'System Administrator',role_code:'system_admin',is_active:true} as Role,{id:9,role_name:'Company Administrator',role_code:'company_admin',is_active:true} as Role]}/>);
 expect(ui.queryByText('Global System — all companies and branches')).toBeNull();
 expect(ui.queryByText('Global System Administrator')).toBeNull();expect(ui.queryByText('Company Administrator')).toBeNull();
});
it('requires a specific branch for Branch Administrator and sends the exact scope',async()=>{
 actions.assign.mockResolvedValue({success:true});
 const ui=render(<AssignRoleDialog {...props} roles={[{id:8,role_name:'Branch Administrator',role_code:'branch_admin',is_active:true} as Role]}/>);
 fireEvent.change(ui.getByLabelText('Select role...'),{target:{value:'8'}});
 expect((ui.getByLabelText('Select scope...') as HTMLSelectElement).value).toBe('branch');
 expect(ui.queryByText('Global System — all companies and branches')).toBeNull();
 fireEvent.change(ui.getByLabelText('Select branch...'),{target:{value:''}});
 fireEvent.click(ui.getByText('Submit assignment'));expect(actions.assign).not.toHaveBeenCalled();
 fireEvent.change(ui.getByLabelText('Select branch...'),{target:{value:'201'}});fireEvent.click(ui.getByText('Submit assignment'));
 await waitFor(()=>expect(actions.assign).toHaveBeenCalledWith({user_profile_id:999,role_id:8,owner_company_id:101,branch_id:201,is_active:true}));
});
it('Company Administrator clears a previous branch instead of silently retaining it',async()=>{
 actions.assign.mockResolvedValue({success:true});
 const ui=render(<AssignRoleDialog {...props} roles={[{id:8,role_name:'Company Administrator',role_code:'company_admin',is_active:true} as Role]}/>);
 fireEvent.change(ui.getByLabelText('Select role...'),{target:{value:'8'}});fireEvent.click(ui.getByText('Submit assignment'));
 await waitFor(()=>expect(actions.assign).toHaveBeenCalledWith({user_profile_id:999,role_id:8,owner_company_id:101,branch_id:null,is_active:true}));
});

it('adds another independent company scope without closing or reusing the last company',async()=>{
 actions.assign.mockResolvedValue({success:true});
 const close=vi.fn();
 const ui=render(<AssignRoleDialog {...props} onOpenChange={close} roles={[{id:8,role_name:'Company Administrator',role_code:'company_admin',is_active:true} as Role]} companies={[...props.companies,{id:102,legal_name_en:'Second company'} as OwnerCompany]}/>);
 fireEvent.change(ui.getByLabelText('Select role...'),{target:{value:'8'}});
 fireEvent.click(ui.getByLabelText('Keep open to add another company or branch'));
 fireEvent.click(ui.getByText('Submit assignment'));
 await waitFor(()=>expect(actions.assign).toHaveBeenCalledTimes(1));
 expect(close).not.toHaveBeenCalled();
 expect((ui.getByLabelText('Select organization...') as HTMLSelectElement).value).toBe('');
 fireEvent.change(ui.getByLabelText('Select organization...'),{target:{value:'102'}});
 fireEvent.click(ui.getByText('Submit assignment'));
 await waitFor(()=>expect(actions.assign).toHaveBeenCalledTimes(2));
 expect(actions.assign.mock.calls.map(call=>call[0].owner_company_id)).toEqual([101,102]);
 expect(actions.assign.mock.calls.every(call=>call[0].branch_id===null)).toBe(true);
});

it('resets branch choices when company changes, including identically named branches',async()=>{
 actions.assign.mockResolvedValue({success:true});
 const ui=render(<AssignRoleDialog {...props} roles={[{id:8,role_name:'Branch Administrator',role_code:'branch_admin',is_active:true} as Role]} companies={[...props.companies,{id:102,legal_name_en:'Second company'} as OwnerCompany]} branches={[...props.branches,{id:202,owner_company_id:102,branch_name_en:'Synthetic branch',branch_code:'B2'} as Branch]}/>);
 fireEvent.change(ui.getByLabelText('Select role...'),{target:{value:'8'}});
 fireEvent.change(ui.getByLabelText('Select organization...'),{target:{value:'102'}});
 const branch=ui.getByLabelText('Select branch...') as HTMLSelectElement;
 expect(branch.value).toBe('');expect(Array.from(branch.options).some(o=>o.value==='201')).toBe(false);
 fireEvent.click(ui.getByText('Submit assignment'));expect(actions.assign).not.toHaveBeenCalled();
 fireEvent.change(branch,{target:{value:'202'}});fireEvent.click(ui.getByText('Submit assignment'));
 await waitFor(()=>expect(actions.assign).toHaveBeenCalledWith({user_profile_id:999,role_id:8,owner_company_id:102,branch_id:202,is_active:true}));
});
it('retains selections after a rejected save so the user can correct and retry',async()=>{
 actions.assign.mockResolvedValue({success:false,error:'Scope unavailable'});const close=vi.fn();
 const ui=render(<AssignRoleDialog {...props} onOpenChange={close}/>);
 fireEvent.change(ui.getByLabelText('Select role...'),{target:{value:'7'}});fireEvent.click(ui.getByText('Submit assignment'));
 await waitFor(()=>expect(actions.assign).toHaveBeenCalledTimes(1));expect(close).not.toHaveBeenCalled();
 expect((ui.getByLabelText('Select organization...') as HTMLSelectElement).value).toBe('101');
 expect((ui.getByLabelText('Select branch...') as HTMLSelectElement).value).toBe('201');
});
