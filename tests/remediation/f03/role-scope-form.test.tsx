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
const props={open:true,onOpenChange:vi.fn(),user:{id:999,full_name:'Synthetic',owner_company_id:101,branch_id:201} as UserWithRoles,roles:[{id:7,role_name:'Synthetic role',role_code:'synthetic',is_active:true,is_assignable:true} as Role],companies:[{id:101,legal_name_en:'Synthetic company'} as OwnerCompany],branches:[{id:201,owner_company_id:101,branch_name_en:'Synthetic branch'} as Branch]};
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
