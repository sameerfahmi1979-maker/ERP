import {beforeEach,expect,it,vi} from 'vitest';
const m=vi.hoisted(()=>({enabled:true,allow:true,owner:11,scope:true,rpc:vi.fn(),recover:vi.fn(),audit:vi.fn(),state:'reconciliation_required',company:1,legacy:false}));
vi.mock('@/lib/output/feature-flags',()=>({isOutputCoordinatorEnabled:()=>m.enabled,isOutputOpsConsoleEnabled:()=>m.enabled}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:async()=>({profile:{id:11},roleCodes:['system_admin']}),hasPermission:()=>m.allow}));
vi.mock('@/lib/rbac/employee-access',()=>({getEmployeeAccess:async()=>({allows:()=>m.scope})}));
vi.mock('@/lib/output/issued-file-access',()=>({canAccessIssuedFile:async()=>m.scope,issuedFileUrl:(id:number)=>`/api/output/file?issuanceId=${id}`}));
vi.mock('@/lib/output/durable-operation',()=>({recoverDurableOutput:m.recover}));
vi.mock('@/server/actions/audit',()=>({logAudit:m.audit}));
vi.mock('@/lib/pdf/gotenberg',()=>({isGotenbergHealthy:async()=>false}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>{throw Error('Privileged metadata path not permitted in this test');}}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({rpc:m.rpc,from:()=>{
 const b={select:()=>b,eq:()=>b,single:async()=>({error:null,data:{id:7,generated_by:m.owner,source_record_id:1,source_record_type:'employee',policy_snapshot_json:{},request_key:'req_original',output_code:m.legacy?null:'F08_QA',owner_company_id:m.company,lifecycle_state:m.state}})};return b;
}})}));
import {recoverOfficialDocument} from '@/server/actions/output/recover-official-document';
import {retryOpsIssuance,cancelOpsIssuance} from '@/server/actions/output/ops-console';
beforeEach(()=>{vi.resetAllMocks();m.enabled=m.allow=m.scope=true;m.owner=11;m.state='reconciliation_required';m.company=1;m.legacy=false;m.rpc.mockResolvedValue({data:{id:7},error:null});m.recover.mockResolvedValue({kind:'issued',issuanceId:7,storagePath:'original/7.pdf',fileName:'original.pdf',fileSizeBytes:100,finalSha256:'a'.repeat(64),serialNo:'F08-7',qr:{status:'not_requested'},idempotentReplay:true,reissued:false});});
it('recovery returns only original file metadata, never retained private bytes or input payload',async()=>{
 const result=await recoverOfficialDocument(7);expect(result).toMatchObject({success:true,issuanceId:7,requestKey:'req_original'});expect(result).not.toHaveProperty('pdf');expect(result).not.toHaveProperty('plan');expect(m.recover).toHaveBeenCalledWith(7);
});
it.each(['owner','scope','disabled'] as const)('denies %s loss before protected recovery',async kind=>{if(kind==='owner')m.owner=12;if(kind==='scope')m.scope=false;if(kind==='disabled')m.enabled=false;expect((await recoverOfficialDocument(7)).success).toBe(false);expect(m.recover).not.toHaveBeenCalled();});
it.each(['pending','rendering','uploaded','failed_retryable','reconciliation_required','issued'])('operator %s recovery resumes the same ID, including interrupted/QR-only states',async state=>{
 m.state=state;expect(await retryOpsIssuance({issuanceId:7,reason:' Synthetic recovery '})).toMatchObject({success:true,data:{outcome:{success:true,issuanceId:7}}});expect(m.recover).toHaveBeenCalledWith(7);expect(m.audit).toHaveBeenCalledWith(expect.objectContaining({new_values:{event:'output_recovery_requested',reason:'Synthetic recovery'}}));expect(m.rpc).not.toHaveBeenCalled();
});
it('operator audit failure prevents any recovery or replacement',async()=>{m.audit.mockRejectedValue(Error('Audit unavailable'));expect((await retryOpsIssuance({issuanceId:7,reason:'Synthetic recovery'})).success).toBe(false);expect(m.recover).not.toHaveBeenCalled();});
it.each(['cancelled','failed_terminal'])('operator cannot restart %s',async state=>{m.state=state;expect((await retryOpsIssuance({issuanceId:7,reason:'Synthetic recovery'})).success).toBe(false);expect(m.recover).not.toHaveBeenCalled();});
it('cancellation is one authenticated atomic command, with its meaningful reason',async()=>{
 expect(await cancelOpsIssuance({issuanceId:7,reason:' Synthetic cancellation '})).toMatchObject({success:true});expect(m.rpc).toHaveBeenCalledWith('f08_end_operation',{p_id:7,p_lease:null,p_cancel:true,p_reason:'Synthetic cancellation'});expect(m.audit).not.toHaveBeenCalled();
});
it('unknown cancellation response never reports success',async()=>{m.rpc.mockResolvedValue({data:null,error:{code:'lost'}});expect((await cancelOpsIssuance({issuanceId:7,reason:'Synthetic cancellation'})).success).toBe(false);});
