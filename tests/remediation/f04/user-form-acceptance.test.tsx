// @vitest-environment jsdom
import '../f05/setup';
// This component test does not invoke export delivery (a Next server-action boundary).
vi.mock('@/components/erp/export/erp-export-menu',()=>({ERPExportMenu:()=>null}));
import { cleanup,fireEvent,render } from '@testing-library/react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { createWorkspaceDraftStore } from '@/lib/workspace/workspace-draft-store';
const ctx=vi.hoisted(()=>({store:null as ReturnType<typeof createWorkspaceDraftStore>|null,dispatch:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/test',useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/components/workspace/workspace-provider',()=>({useWorkspaceContext:()=>({state:{activeTabId:'owner',tabs:[{id:'owner',route:'/test'}]},dispatch:ctx.dispatch})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>ctx.store}));
vi.mock('@/hooks/use-workspace-form-navigation',()=>({useWorkspaceFormNavigation:()=>({activeTab:{id:'owner'},markDirty:vi.fn(),closeTab:vi.fn(),renameTab:vi.fn(),updateTabRoute:vi.fn()})}));
vi.mock('@/components/workspace/erp-record-workspace-form',()=>({ERPRecordWorkspaceForm:({children}:{children:ReactNode})=><div>{children}</div>,ERPRecordSectionPanel:({children}:{children:ReactNode})=><section>{children}</section>}));
vi.mock('@/server/actions/users',()=>({createUser:vi.fn(),adminUpdateUserProfile:vi.fn(),removeRoleFromUser:vi.fn()}));
vi.mock('@/features/users/assign-role-dialog',()=>({AssignRoleDialog:()=>null}));
vi.mock('@/features/users/user-security-section',()=>({SecuritySection:()=>null}));
vi.mock('@/features/users/user-security-history-section',()=>({UserSecurityHistorySection:()=>null}));
vi.mock('@/features/users/user-effective-access-section',()=>({UserEffectiveAccessSection:()=>null}));
vi.mock('@/features/users/employee-identity-link',()=>({EmployeeIdentityLink:()=>null}));
import type { ReactNode } from 'react';
import type { AuthContext } from '@/lib/rbac/check';
import type { Role } from '@/types/domain';
import { UserWorkspaceForm } from '@/features/users/user-workspace-form';
const mount=()=>render(<UserWorkspaceForm mode="add" authContext={{profile:{id:1},permissionCodes:[],roleCodes:[]} as AuthContext} companies={[{id:1,legal_name_en:'Synthetic A',company_code:'A'},{id:2,legal_name_en:'Synthetic B',company_code:'B'}]} branches={[{id:11,owner_company_id:1,branch_name_en:'A1',branch_code:'A1'},{id:22,owner_company_id:2,branch_name_en:'B1',branch_code:'B1'}]}/>);
beforeEach(()=>{ctx.store=createWorkspaceDraftStore();});afterEach(cleanup);
it('invite choice survives remount but a temporary password never does',()=>{
 const ui=mount();fireEvent.click(ui.getByRole('checkbox',{name:'Send Invite Email'}));fireEvent.input(ui.getByLabelText('Temporary Password'),{target:{value:'Synthetic-Not-A-Credential-42'}});ui.unmount();
 const next=mount();expect(next.getByRole('checkbox',{name:'Send Invite Email'}).getAttribute('aria-checked')).toBe('false');expect((next.getByLabelText('Temporary Password') as HTMLInputElement).value).toBe('');expect(JSON.stringify(ctx.store!.getDraft('draft:tab:owner:user-workspace-form'))).not.toContain('Synthetic-Not-A-Credential');
});
it('role company change clears branch and both values survive the form remount',()=>{
 const ui=mount();fireEvent.change(ui.getByLabelText('Role Scope: Company'),{target:{value:'1'}});fireEvent.change(ui.getByLabelText('Role Scope: Branch'),{target:{value:'11'}});fireEvent.change(ui.getByLabelText('Role Scope: Company'),{target:{value:'2'}});ui.unmount();
 const next=mount();expect((next.getByLabelText('Role Scope: Company') as HTMLSelectElement).value).toBe('2');const scope=next.getByLabelText('Role Scope: Branch') as HTMLSelectElement;expect(scope.value).toBe('');expect(Array.from(scope.options).some(o=>o.value==='11')).toBe(false);
});

const adminForm=()=>render(<UserWorkspaceForm mode="add" authContext={{profile:{id:1},isAccountActive:true,permissionCodes:[],roleCodes:['system_admin'],roleAssignments:[{roleCode:'system_admin',ownerCompanyId:null,branchId:null,permissionCodes:[]}]} as AuthContext} roles={[
 {id:1,role_code:'system_admin',role_name:'System Administrator',is_active:true},
 {id:3,role_code:'company_admin',role_name:'Company Administrator',is_active:true},
 {id:4,role_code:'branch_admin',role_name:'Branch Administrator',is_active:true},
] as Role[]} companies={[{id:1,legal_name_en:'Synthetic A',company_code:'A'},{id:2,legal_name_en:'Synthetic B',company_code:'B'}]} branches={[{id:11,owner_company_id:1,branch_name_en:'A1',branch_code:'A1'},{id:22,owner_company_id:2,branch_name_en:'B1',branch_code:'B1'}]}/>);
it('new Branch Administrator requires an explicit branch and cannot select global scope',()=>{
 const ui=adminForm();fireEvent.change(ui.getByLabelText('Primary Role'),{target:{value:'4'}});
 const company=ui.getByLabelText('Role Scope: Company') as HTMLSelectElement;
 expect(Array.from(company.options).some(o=>o.value==='global')).toBe(false);
 fireEvent.change(company,{target:{value:'1'}});
 const branch=ui.getByLabelText('Role Scope: Branch') as HTMLSelectElement;
 expect(branch.required).toBe(true);expect(branch.value).toBe('');expect(branch.disabled).toBe(false);
 fireEvent.change(branch,{target:{value:'11'}});ui.unmount();
 const next=adminForm();expect((next.getByLabelText('Primary Role') as HTMLSelectElement).value).toBe('4');expect((next.getByLabelText('Role Scope: Branch') as HTMLSelectElement).value).toBe('11');
});
it('changing the initial administrator level clears the old scope and restricts its choices',()=>{
 const ui=adminForm();const role=ui.getByLabelText('Primary Role');
 fireEvent.change(role,{target:{value:'4'}});fireEvent.change(ui.getByLabelText('Role Scope: Company'),{target:{value:'1'}});fireEvent.change(ui.getByLabelText('Role Scope: Branch'),{target:{value:'11'}});
 fireEvent.change(role,{target:{value:'3'}});expect((ui.getByLabelText('Role Scope: Company') as HTMLSelectElement).value).toBe('');
 expect((ui.getByLabelText('Role Scope: Branch') as HTMLSelectElement).value).toBe('');expect((ui.getByLabelText('Role Scope: Branch') as HTMLSelectElement).disabled).toBe(true);
 fireEvent.change(role,{target:{value:'1'}});const scope=ui.getByLabelText('Role Scope: Company') as HTMLSelectElement;
 expect(Array.from(scope.options).map(o=>o.value)).toEqual(['','global']);expect(scope.value).toBe('');
});
