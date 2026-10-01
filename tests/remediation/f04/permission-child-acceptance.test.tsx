// @vitest-environment jsdom
import '../f05/setup';
vi.mock('@/components/erp/export/erp-export-menu',()=>({ERPExportMenu:()=>null}));
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { createWorkspaceDraftStore } from '@/lib/workspace/workspace-draft-store';
const ctx=vi.hoisted(()=>({store:null as ReturnType<typeof createWorkspaceDraftStore>|null,save:vi.fn(),dispatch:vi.fn()}));
vi.mock('next/navigation',()=>({usePathname:()=>'/admin/roles/record/99001',useRouter:()=>({refresh:vi.fn()})}));
vi.mock('@/components/workspace/workspace-provider',()=>({useWorkspaceContext:()=>({state:{activeTabId:'role-owner',tabs:[{id:'role-owner',route:'/admin/roles/record/99001'}]},dispatch:ctx.dispatch})}));
vi.mock('@/components/workspace/workspace-draft-provider',()=>({useWorkspaceDraftStoreContext:()=>ctx.store}));
vi.mock('@tanstack/react-query',()=>({useQuery:()=>({data:[{module_code:'hr',permissions:[{id:1,permission_name:'Synthetic self view',permission_code:'hr.synthetic.view',assigned:false,is_active:true},{id:2,permission_name:'Synthetic legacy view',permission_code:'hr.synthetic.legacy',assigned:true,is_active:true}]}],refetch:vi.fn()})}));
vi.mock('@/server/actions/permissions',()=>({saveRolePermissionDraftChanges:(input:unknown)=>ctx.save(input)}));
vi.mock('@/server/actions/roles',()=>({getRolePermissionsAction:vi.fn()}));
import { RolePermissionsSection } from '@/features/roles/role-permissions-section';
beforeEach(()=>{ctx.store=createWorkspaceDraftStore();ctx.save.mockReset().mockResolvedValue({success:false,error:'Synthetic conflict'});});
afterEach(cleanup);
const mount=()=>render(<RolePermissionsSection roleId={99001} isSystemRole={false} canManage isGlobalAdmin={false}/>);
it('multi-select grant/revoke drafts survive remount but require a fresh review before apply',async()=>{
 const a=mount();fireEvent.click(a.getAllByRole('checkbox')[0]);fireEvent.click(a.getAllByRole('checkbox')[1]);fireEvent.click(a.getByText('Review changes'));a.unmount();const b=mount();expect(b.getAllByRole('checkbox')[0].getAttribute('aria-checked')).toBe('true');expect(b.getAllByRole('checkbox')[1].getAttribute('aria-checked')).toBe('false');expect(b.queryByText('Apply reviewed changes')).toBeNull();expect(ctx.save).not.toHaveBeenCalled();fireEvent.click(b.getByText('Review changes'));fireEvent.click(b.getByText('Apply reviewed changes'));await waitFor(()=>expect(ctx.save).toHaveBeenCalledTimes(1));expect(ctx.save.mock.calls[0][0]).toEqual(expect.arrayContaining([expect.objectContaining({permissionId:1,roleId:99001,action:'grant',expectedAssigned:false}),expect.objectContaining({permissionId:2,action:'revoke',expectedAssigned:true})]));expect(b.getByRole('status').textContent).toContain('2 unsaved');
});
it('reverting staged selections produces no pending changes or action',()=>{
 const a=mount();fireEvent.click(a.getAllByRole('checkbox')[0]);fireEvent.click(a.getAllByRole('checkbox')[0]);expect(a.queryByText('Review changes')).toBeNull();expect(ctx.save).not.toHaveBeenCalled();
});
it('independent principal store cannot restore another principal permission draft',()=>{
 const a=mount();fireEvent.click(a.getAllByRole('checkbox')[0]);a.unmount();ctx.store=createWorkspaceDraftStore();const b=mount();expect(b.getAllByRole('checkbox')[0].getAttribute('aria-checked')).toBe('false');expect(b.queryByText('Review changes')).toBeNull();expect(localStorage.length).toBe(0);expect(sessionStorage.length).toBe(0);
});
it('view-only and non-global system-role viewers cannot stage grants',()=>{
 for(const props of [{canManage:false,isSystemRole:false},{canManage:true,isSystemRole:true}]){
  const ui=render(<RolePermissionsSection roleId={99002} {...props} isGlobalAdmin={false}/>);
  for(const box of ui.getAllByRole('checkbox'))expect(box.getAttribute('data-disabled')!==null||box.hasAttribute('disabled')).toBe(true);
  expect(ui.queryByText('Review changes')).toBeNull();ui.unmount();
 }
 expect(ctx.save).not.toHaveBeenCalled();
});
