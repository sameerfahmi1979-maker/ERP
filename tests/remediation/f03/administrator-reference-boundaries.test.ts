import {beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
const m=vi.hoisted(()=>({ctx:{} as AuthContext,rpc:vi.fn(),admin:vi.fn(),client:vi.fn()}));
vi.mock('@/lib/rbac/check',async()=>({...await vi.importActual('@/lib/rbac/scope'),getAuthContext:async()=>m.ctx,assertAccountActive:(c:AuthContext)=>{if(!c.isAccountActive)throw Error('Inactive');}}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.admin}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.client}));
vi.mock('@/server/actions/audit',()=>({logAudit:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
vi.mock('@/lib/logger',()=>({logger:{error:vi.fn(),warn:vi.fn(),info:vi.fn()}}));
import {getDmsDocumentSemanticIndexStatus} from '@/server/actions/dms/intelligence-admin';
import {getEmployeeIdentityLink,setEmployeeIdentityLink} from '@/server/actions/users/employee-link';
import {getDmsNotificationSettings,saveDmsNotificationSettings} from '@/server/actions/dms/notification-settings';
import {adminListApprovalRoleOptions,adminListApprovalWorkflows,adminGetApprovalWorkflow,adminDeactivateApprovalWorkflow} from '@/server/actions/dms/document-approvals';
beforeEach(()=>{
 vi.clearAllMocks();const codes=['dms.documents.view','users.employee_link.manage','dms.notifications.manage','dms.notifications.view','dms.approvals.admin'];
 m.ctx={profile:{id:1,must_change_password:false}as AuthContext['profile'],email:null,roleCodes:['company_admin'],permissionCodes:codes,globalPermissionCodes:[],isAccountActive:true,accountStatus:'active',roleAssignments:[{roleId:1,roleCode:'company_admin',ownerCompanyId:1,branchId:null,permissionCodes:codes}]};
 m.rpc.mockResolvedValue({data:false,error:null});m.client.mockResolvedValue({rpc:m.rpc});
 m.admin.mockImplementation(()=>{throw Error('Unexpected privileged read');});
});
it.each([{data:false,error:null},{data:null,error:{code:'503'}},{data:true,error:{code:'42501'}}])('denies semantic counts and hashes when current document permission fails %j',async result=>{
 m.rpc.mockResolvedValue(result);expect((await getDmsDocumentSemanticIndexStatus(2)).success).toBe(false);expect(m.rpc).toHaveBeenCalledWith('f03_has_document_permission',{document_id:2,permission_code:'dms.documents.view'});expect(m.admin).not.toHaveBeenCalled();
});
it('only reaches scoped semantic counts after current native document permission succeeds',async()=>{
 m.rpc.mockResolvedValue({data:true,error:null});const chain={select:vi.fn(),eq:vi.fn(),is:vi.fn(),limit:vi.fn(),maybeSingle:vi.fn(async()=>({data:null,error:null})),then:(resolve:(r:{count:number;data:null;error:null})=>unknown)=>resolve({count:0,data:null,error:null})};for(const f of[chain.select,chain.eq,chain.is,chain.limit])f.mockReturnValue(chain);m.admin.mockReturnValue({from:()=>chain});
 expect((await getDmsDocumentSemanticIndexStatus(2)).data?.totalChunks).toBe(0);expect(m.admin).toHaveBeenCalledOnce();
});
it.each([false,null,'true'])('rejects employee-link reads and mutations unless whole-identity authority is true: %j',async data=>{
 m.rpc.mockResolvedValue({data,error:null});expect((await getEmployeeIdentityLink(2)).success).toBe(false);expect((await setEmployeeIdentityLink(2,null)).success).toBe(false);expect(m.admin).not.toHaveBeenCalled();expect(m.rpc.mock.calls.every(c=>c[0]==='administrator_can_manage_identity'&&c[1].capability==='users.employee_link.manage')).toBe(true);
});
it('does not treat scoped DMS operational permissions as shared notification configuration rights',async()=>{
 expect((await getDmsNotificationSettings()).error).toBe('Permission denied');expect((await saveDmsNotificationSettings({} as Parameters<typeof saveDmsNotificationSettings>[0])).error).toContain('Permission denied');expect(m.rpc).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();
});
it('does not expose or mutate global approval configuration through scoped approval authority',async()=>{
 for(const r of[await adminListApprovalRoleOptions(),await adminListApprovalWorkflows(),await adminGetApprovalWorkflow(1),await adminDeactivateApprovalWorkflow(1,'2026-01-01T00:00:00Z')])expect(r.success).toBe(false);expect(m.client).not.toHaveBeenCalled();expect(m.admin).not.toHaveBeenCalled();
});
