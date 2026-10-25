import {beforeEach,describe,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
const state=vi.hoisted(()=>({ctx:{} as AuthContext,admin:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await vi.importActual('@/lib/rbac/scope'),getAuthContext:async()=>state.ctx}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:state.admin}));
vi.mock('@/server/actions/audit',()=>({logAudit:vi.fn()}));
vi.mock('@/server/actions/reports/templates',()=>({listReportTemplates:vi.fn(),listBrandingProfiles:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {createReportRegistryEntry,updateReportRegistryEntry} from '@/server/actions/reports/registry';
describe('shared report registry administration',()=>{
 beforeEach(()=>{vi.clearAllMocks();state.ctx={profile:{id:1,must_change_password:false} as AuthContext['profile'],email:null,roleCodes:['company_admin'],permissionCodes:['reports.manage'],accountStatus:'active',isAccountActive:true,globalPermissionCodes:[],roleAssignments:[{roleId:1,roleCode:'company_admin',ownerCompanyId:1,branchId:null,permissionCodes:['reports.manage']}]};});
 it('does not let a company permission reach the privileged registry writer',async()=>{
  expect((await createReportRegistryEntry({} as Parameters<typeof createReportRegistryEntry>[0])).success).toBe(false);
  expect((await updateReportRegistryEntry({id:1})).success).toBe(false);
  expect(state.admin).not.toHaveBeenCalled();
 });
 it('does not widen two branch assignments into a global permission',async()=>{
  state.ctx.roleAssignments=[1,2].map(branchId=>({roleId:1,roleCode:'branch_admin',ownerCompanyId:1,branchId,permissionCodes:['reports.manage']}));
  expect((await updateReportRegistryEntry({id:1})).success).toBe(false);expect(state.admin).not.toHaveBeenCalled();
 });
 it('still validates input for an authorized global sender',async()=>{
  state.ctx.globalPermissionCodes=['reports.manage'];
  const result=await createReportRegistryEntry({} as Parameters<typeof createReportRegistryEntry>[0]);
  expect(result.success).toBe(false);expect(result.error).not.toContain('permission');expect(state.admin).not.toHaveBeenCalled();
 });
});
