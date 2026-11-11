import {beforeEach,expect,it,vi} from 'vitest';
import type {AuthContext} from '@/lib/rbac/check';
import {canRunDmsFilePipeline} from '@/lib/dms/file-pipeline-access';
const m=vi.hoisted(()=>({auth:vi.fn(),rpc:vi.fn(),reviewed:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.auth,hasPermission:()=>true}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc})}));
vi.mock('@/server/dms-reviewed-updates',()=>({reviewedCall:m.reviewed}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {requireDmsFilePipelineAccess} from '@/server/dms-file-pipeline-access';
import {startDocumentPreparation} from '@/server/actions/dms/document-preparation';
const assignment=(roleCode:string,ownerCompanyId:number|null=1,branchId:number|null=null,permissionCodes=['dms.documents.ai.run'])=>({roleId:1,roleCode,ownerCompanyId,branchId,permissionCodes});
const context=(...roleAssignments:NonNullable<AuthContext['roleAssignments']>):AuthContext=>({profile:{id:1,must_change_password:false} as AuthContext['profile'],email:null,isAccountActive:true,accountStatus:'active',roleCodes:roleAssignments.map(a=>a.roleCode),permissionCodes:['dms.admin','dms.documents.ai.run'],roleAssignments});
beforeEach(()=>{vi.resetAllMocks();m.auth.mockResolvedValue(context(assignment('dms_manager')));m.rpc.mockResolvedValue({data:true,error:null});m.reviewed.mockResolvedValue({success:true});});
it.each(['dms_manager','dms_admin','company_admin','branch_admin'])('allows %s only in its assigned scope',role=>{
 const ctx=context(assignment(role,1,role==='branch_admin'?10:null));
 expect(canRunDmsFilePipeline(ctx,1,10)).toBe(true);expect(canRunDmsFilePipeline(ctx,2,20)).toBe(false);
 if(role==='branch_admin')expect(canRunDmsFilePipeline(ctx,1,11)).toBe(false);
});
it.each(['system_admin','group_admin'])('requires explicit global assignment for %s',role=>{expect(canRunDmsFilePipeline(context(assignment(role,null)),2)).toBe(true);expect(canRunDmsFilePipeline(context(assignment(role,1)),1)).toBe(false);});
it('denies ordinary AI operators, stale capability arrays, malformed branches and scope mixing',()=>{
 expect(canRunDmsFilePipeline(context(assignment('hr_manager')),1)).toBe(false);
 expect(canRunDmsFilePipeline(context(assignment('branch_admin',1,null)),1)).toBe(false);
 expect(canRunDmsFilePipeline(context(assignment('dms_manager',null,10)),1,10)).toBe(false);
 expect(canRunDmsFilePipeline(context(assignment('dms_manager',1,null,[]),assignment('hr_manager',1)),1)).toBe(false);
 expect(canRunDmsFilePipeline(context(assignment('dms_manager',2),assignment('hr_manager',1)),1)).toBe(false);
 expect(canRunDmsFilePipeline(context(),1)).toBe(false);
});
it('denies inactive accounts and mandatory password changes',()=>{
 const ctx=context(assignment('system_admin',null));ctx.isAccountActive=false;expect(canRunDmsFilePipeline(ctx,1)).toBe(false);
 ctx.isAccountActive=true;ctx.profile!.must_change_password=true;expect(canRunDmsFilePipeline(ctx,1)).toBe(false);
});
it('rechecks current database authority instead of trusting UI permission',async()=>{
 expect(await requireDmsFilePipelineAccess(8)).toBeNull();expect(m.rpc).toHaveBeenCalledWith('dms_can_run_file_pipeline',{p_document:8});
 m.rpc.mockResolvedValue({data:false,error:null});expect(await requireDmsFilePipelineAccess(8)).toContain('scope');
 m.rpc.mockResolvedValue({data:null,error:{code:'42883'}});expect(await requireDmsFilePipelineAccess(8)).toContain('could not be verified');
});
it('denies direct server-action calls before preparation admission',async()=>{
 m.auth.mockResolvedValue(context(assignment('hr_manager')));
 const request={documentId:8,requestId:'00000000-0000-4000-8000-000000000008',snapshot:'a'.repeat(64),mode:'reread_files',fileIds:[4]};
 expect(await startDocumentPreparation(request)).toMatchObject({success:false});expect(m.reviewed).not.toHaveBeenCalled();expect(m.rpc).not.toHaveBeenCalled();
});
it('admits the original request unchanged only after current database approval',async()=>{
 const request={documentId:8,requestId:'00000000-0000-4000-8000-000000000008',snapshot:'a'.repeat(64),mode:'reread_files',fileIds:[4]};
 expect(await startDocumentPreparation(request)).toMatchObject({success:true});expect(m.reviewed.mock.calls[0][1]).toEqual({p_action:'start',p_data:request});
});
