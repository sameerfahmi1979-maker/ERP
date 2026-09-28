// @vitest-environment jsdom
import { cleanup,fireEvent,render } from '@testing-library/react';
import { afterEach,beforeEach,expect,it,vi } from 'vitest';
import { createWorkspaceDraftStore } from '@/lib/workspace/workspace-draft-store';
const ctx=vi.hoisted(()=>({store:null as ReturnType<typeof createWorkspaceDraftStore>|null,dispatch:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/test',useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/components/workspace/workspace-provider',()=>({useWorkspaceContext:()=>({state:{activeTabId:'owner',tabs:[{id:'owner',route:'/test'}]},dispatch:ctx.dispatch})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>ctx.store}));
vi.mock('@/hooks/use-workspace-form-navigation',()=>({useWorkspaceFormNavigation:()=>({activeTab:{id:'owner'},markDirty:vi.fn(),closeTab:vi.fn(),renameTab:vi.fn(),updateTabRoute:vi.fn()})}));
vi.mock('@/components/workspace/erp-record-workspace-form',()=>({ERPRecordWorkspaceForm:({children}:any)=><div>{children}</div>,ERPRecordSectionPanel:({children}:any)=><section>{children}</section>}));
vi.mock('@/server/actions/users',()=>({createUser:vi.fn(),adminUpdateUserProfile:vi.fn(),removeRoleFromUser:vi.fn()}));
vi.mock('@/features/users/assign-role-dialog',()=>({AssignRoleDialog:()=>null}));
vi.mock('@/features/users/user-security-section',()=>({SecuritySection:()=>null}));
vi.mock('@/features/users/user-security-history-section',()=>({UserSecurityHistorySection:()=>null}));
vi.mock('@/features/users/user-effective-access-section',()=>({UserEffectiveAccessSection:()=>null}));
vi.mock('@/features/users/employee-identity-link',()=>({EmployeeIdentityLink:()=>null}));
import { UserWorkspaceForm } from '@/features/users/user-workspace-form';
const mount=()=>render(<UserWorkspaceForm mode="add" authContext={{profile:{id:1},permissionCodes:[],roleCodes:[]} as any} companies={[{id:1,legal_name_en:'Synthetic A',company_code:'A'},{id:2,legal_name_en:'Synthetic B',company_code:'B'}] as any} branches={[{id:11,owner_company_id:1,branch_name_en:'A1',branch_code:'A1'},{id:22,owner_company_id:2,branch_name_en:'B1',branch_code:'B1'}] as any}/>);
beforeEach(()=>{ctx.store=createWorkspaceDraftStore();});afterEach(cleanup);
it('invite choice survives remount but a temporary password never does',()=>{
 const ui=mount();fireEvent.click(ui.getByRole('checkbox',{name:'Send Invite Email'}));fireEvent.input(ui.getByLabelText('Temporary Password'),{target:{value:'Synthetic-Not-A-Credential-42'}});ui.unmount();
 const next=mount();expect(next.getByRole('checkbox',{name:'Send Invite Email'}).getAttribute('aria-checked')).toBe('false');expect((next.getByLabelText('Temporary Password') as HTMLInputElement).value).toBe('');expect(JSON.stringify(ctx.store!.getDraft('draft:tab:owner:user-workspace-form'))).not.toContain('Synthetic-Not-A-Credential');
});
it('role company change clears branch and both values survive the form remount',()=>{
 const ui=mount();fireEvent.change(ui.getByLabelText('Role Scope: Company'),{target:{value:'1'}});fireEvent.change(ui.getByLabelText('Role Scope: Branch'),{target:{value:'11'}});fireEvent.change(ui.getByLabelText('Role Scope: Company'),{target:{value:'2'}});ui.unmount();
 const next=mount();expect((next.getByLabelText('Role Scope: Company') as HTMLSelectElement).value).toBe('2');const scope=next.getByLabelText('Role Scope: Branch') as HTMLSelectElement;expect(scope.value).toBe('');expect(Array.from(scope.options).some(o=>o.value==='11')).toBe(false);
});
