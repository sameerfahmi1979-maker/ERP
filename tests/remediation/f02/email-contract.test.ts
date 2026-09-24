import { beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({ctx:vi.fn(),provider:vi.fn(),send:vi.fn(),audit:vi.fn()}));
vi.mock('@/lib/rbac/check',async original=>({...await original<typeof import('@/lib/rbac/check')>(),getAuthContext:m.ctx}));
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn(()=>{throw Error('No database allowed');})}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:vi.fn(()=>{throw Error('No database allowed');})}));
vi.mock('@/lib/email/providers/factory',()=>({getDefaultEmailProvider:m.provider}));
vi.mock('@/server/actions/audit',()=>({logAudit:m.audit}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import { sendExpiryDocumentsEmail } from '@/server/actions/dms/expiry-reminders';
import { sendExportEmail } from '@/server/actions/email';
const principal=(permissionCodes:string[],globalPermissionCodes:string[]=[])=>({profile:{id:900001,must_change_password:false},isAccountActive:true,accountStatus:'active',permissionCodes,globalPermissionCodes,roleCodes:[],roleAssignments:[]});
beforeEach(()=>{vi.clearAllMocks();m.ctx.mockResolvedValue(principal(['dms.expiry.view'],['reports.email','reports.export']));m.audit.mockResolvedValue(undefined);m.provider.mockResolvedValue({config:{providerCode:'F02_OFFLINE'},sendEmail:m.send});m.send.mockResolvedValue({ok:true});});
const base={to:['nobody@example.invalid'],subject:'F02 synthetic',body:'Offline only',tabTitle:'F02 Expiry',docs:[{document_no:'F02-001',title:'Test العربية, "quoted"',document_type:null,category:null,expiry_date:null,days_remaining:null,status:'active'}]};
it('body-only expiry is delivered to the mock without dereferencing a missing attachment',async()=>{expect(await sendExpiryDocumentsEmail({...base,attachmentFormat:'none'})).toEqual({success:true});expect(m.send).toHaveBeenCalledOnce();expect(m.send.mock.calls[0][0].attachments).toEqual([]);expect(m.audit.mock.calls.at(-1)?.[0].new_values.attachment_filename).toBeNull();});
// Real Excel/PDF libraries perform cold native/module loading on Windows bind
// mounts. This is an output-contract test, not a 5-second performance budget.
it.each(['csv','excel','pdf'] as const)('%s attachment has actual bytes, MIME type, and safe canonical context', {timeout:30000}, async format=>{
 expect(await sendExpiryDocumentsEmail({...base,attachmentFormat:format})).toEqual({success:true});
 const a=m.send.mock.calls[0][0].attachments[0];
 expect(a.sizeBytes).toBe(Buffer.from(a.base64Content,'base64').byteLength);
 expect(a.sizeBytes).toBeGreaterThan(0);
 expect(a.contentType).toBe({csv:'text/csv',excel:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',pdf:'application/pdf'}[format]);
 expect(a).not.toHaveProperty('mimeType');
 expect(m.audit.mock.calls.at(-1)?.[0].module_code).toBe('dms.expiry');
 if(format==='csv')expect(Buffer.from(a.base64Content,'base64').toString('utf8')).toContain('"Test العربية, ""quoted"""');
});
it.each(['dms.expiry.view','dms.documents.view','dms.admin'])('%s alone cannot send browser-supplied content after owner-approved F03 containment',async code=>{m.ctx.mockResolvedValue(principal([code]));expect((await sendExpiryDocumentsEmail({...base,attachmentFormat:'none'})).success).toBe(false);expect(m.provider).not.toHaveBeenCalled();});
it('no capability cannot reach a provider',async()=>{m.ctx.mockResolvedValue({profile:{id:900001},permissionCodes:[]});expect((await sendExpiryDocumentsEmail({...base,attachmentFormat:'csv'})).success).toBe(false);expect(m.provider).not.toHaveBeenCalled();});
it('no session cannot reach a provider',async()=>{m.ctx.mockResolvedValue({profile:null,permissionCodes:[]});expect((await sendExpiryDocumentsEmail({...base,attachmentFormat:'none'})).success).toBe(false);expect(m.provider).not.toHaveBeenCalled();});
it('generic expiry entry point also checks permission',async()=>{m.ctx.mockResolvedValue({profile:{id:900001},permissionCodes:[]});expect((await sendExportEmail({...base,context:{moduleCode:'dms.expiry'}})).statusCode).toBe(403);expect(m.provider).not.toHaveBeenCalled();});
it('unrelated module permission is not sufficient',async()=>{m.ctx.mockResolvedValue({profile:{id:900001},permissionCodes:['reports.view']});expect((await sendExpiryDocumentsEmail({...base,attachmentFormat:'none'})).success).toBe(false);expect(m.provider).not.toHaveBeenCalled();});
it('provider failure is not reported as success or retried',async()=>{m.send.mockResolvedValue({ok:false,message:'Synthetic provider failure'});expect(await sendExpiryDocumentsEmail({...base,attachmentFormat:'none'})).toEqual({success:false,error:'Synthetic provider failure'});expect(m.send).toHaveBeenCalledOnce();});
