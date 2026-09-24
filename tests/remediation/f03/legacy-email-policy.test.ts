import { beforeEach, expect, it, vi } from 'vitest';
const state=vi.hoisted(()=>({ctx:null as any,send:vi.fn(),provider:vi.fn(),audit:vi.fn()}));
vi.mock('server-only',()=>({}));
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:vi.fn(()=>{throw new Error('unexpected service query');})}));
vi.mock('@/lib/rbac/check',async importOriginal=>({...await importOriginal<typeof import('@/lib/rbac/check')>(),getAuthContext:async()=>state.ctx}));
vi.mock('@/lib/email/providers/factory',()=>({getDefaultEmailProvider:state.provider}));
vi.mock('@/server/actions/audit',()=>({logAudit:state.audit}));
import { canSendLegacyExport } from '@/lib/email/legacy-export-policy';
import { sendExportEmail,sendReportEmail } from '@/server/actions/email';
beforeEach(()=>{
 vi.clearAllMocks();state.audit.mockResolvedValue(undefined);
 state.send.mockResolvedValue({ok:true,status:'sent'});state.provider.mockResolvedValue({config:{providerCode:'synthetic'},sendEmail:state.send});
 state.ctx={profile:{id:123,must_change_password:false},isAccountActive:true,accountStatus:'active',roleCodes:[],permissionCodes:['reports.email','reports.export'],globalPermissionCodes:[],roleAssignments:[{roleId:1,roleCode:'scoped',ownerCompanyId:1,branchId:null,permissionCodes:['reports.email','reports.export']}]};
});
const input={to:['f00-test@example.invalid'],subject:'Synthetic only',body:'Synthetic only',attachment:{filename:'synthetic.pdf',contentType:'application/pdf',base64Content:'dGVzdA==',sizeBytes:4}};
it.each(['reports','dms.expiry','organizations','erp'])('forged module %s does not authorize scoped browser attachments',async moduleCode=>{
 const r=await sendExportEmail({...input,context:{moduleCode}});expect(r.statusCode).toBe(403);expect(state.provider).not.toHaveBeenCalled();expect(state.send).not.toHaveBeenCalled();
});
it('the report wrapper denies before sending or writing another run log',async()=>{
 expect((await sendReportEmail({...input,runId:999})).statusCode).toBe(403);expect(state.provider).not.toHaveBeenCalled();
});
it('global send AND export grants are required',()=>{
 state.ctx.globalPermissionCodes=['reports.email'];expect(canSendLegacyExport(state.ctx)).toBe(false);
 state.ctx.globalPermissionCodes.push('reports.export');expect(canSendLegacyExport(state.ctx)).toBe(true);
});
it('global admin is permitted but company-assigned admin is not',()=>{
 state.ctx.roleAssignments[0].roleCode='system_admin';expect(canSendLegacyExport(state.ctx)).toBe(false);
 state.ctx.roleAssignments[0].ownerCompanyId=null;expect(canSendLegacyExport(state.ctx)).toBe(true);
});
it('inactive or forced-change accounts cannot send even with global grants',()=>{
 state.ctx.globalPermissionCodes=['reports.email','reports.export'];state.ctx.isAccountActive=false;expect(canSendLegacyExport(state.ctx)).toBe(false);
 state.ctx.isAccountActive=true;state.ctx.profile.must_change_password=true;expect(canSendLegacyExport(state.ctx)).toBe(false);
});
it('globally authorized sender retains legacy delivery (mock transport only)',async()=>{
 state.ctx.globalPermissionCodes=['reports.email','reports.export'];expect((await sendExportEmail(input)).success).toBe(true);expect(state.send).toHaveBeenCalledOnce();
});
