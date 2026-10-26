import {beforeEach,expect,it,vi} from 'vitest';
import {input,prepared,contract,receipt,snapshot,plan} from './dms-ai-approval-fixtures';
const m=vi.hoisted(()=>({ctx:vi.fn(),can:vi.fn(),lookup:vi.fn(),visible:vi.fn(),claims:vi.fn(),source:vi.fn(),document:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.ctx,hasPermission:m.can}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:m.lookup})}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getClaims:m.claims},rpc:m.visible,from:(table:string)=>{
 const q={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:table==='dms_upload_sessions'?m.source:m.document};return q;
}})}));
import {recoverNumberedAiApproval} from '@/server/dms-ai-approval-recovery';
const original=()=>({input:{...input,prepared},contract,receipt:null});
beforeEach(()=>{vi.resetAllMocks();m.ctx.mockResolvedValue({profile:{id:11}});m.can.mockReturnValue(true);
 m.source.mockResolvedValue({data:{id:17,status:'uploaded',document_id:null},error:null});m.claims.mockResolvedValue({data:{claims:{session_id:plan.auth_session_id}},error:null});
 m.lookup.mockResolvedValue({data:original(),error:null});m.visible.mockResolvedValue({data:snapshot,error:null});m.document.mockResolvedValue({data:{id:41,document_no:'DMS-41'},error:null});});
it('returns original values only after caller-RLS preparation validates current access',async()=>{
 const r=await recoverNumberedAiApproval(17);expect(r.success).toBe(true);expect(m.lookup).toHaveBeenCalledWith('read_numbered_ai_intake_recovery',{p_actor:11,p_auth_session:plan.auth_session_id,p_session:17});
 expect(m.visible).toHaveBeenCalledWith('prepare_numbered_ai_intake',{p_request:expect.objectContaining(original().input)});
 expect(m.lookup.mock.invocationCallOrder[0]).toBeLessThan(m.visible.mock.invocationCallOrder[0]);
});
it.each(['anonymous','permission','hidden-source','cancelled','invalid-session'])('%s cannot read the privileged recovery ledger',async kind=>{
 if(kind==='anonymous')m.ctx.mockResolvedValue({profile:null});if(kind==='permission')m.can.mockReturnValue(false);
 if(kind==='hidden-source')m.source.mockResolvedValue({data:null});if(kind==='cancelled')m.source.mockResolvedValue({data:{id:17,status:'cancelled'}});
 if(kind==='invalid-session')m.claims.mockResolvedValue({data:{claims:{}}});
 expect((await recoverNumberedAiApproval(17)).success).toBe(false);expect(m.lookup).not.toHaveBeenCalled();
});
it.each(['revoked-linked-record','malformed','wrong-source','lookup-denied'])('%s returns no private payload',async kind=>{
 if(kind==='revoked-linked-record')m.visible.mockResolvedValue({data:null,error:{code:'42501'}});
 if(kind==='malformed')m.lookup.mockResolvedValue({data:{input:{title:'PRIVATE'}},error:null});
 if(kind==='wrong-source')m.visible.mockResolvedValue({data:{...snapshot,source:{...snapshot.source,id:99}},error:null});
 if(kind==='lookup-denied')m.lookup.mockResolvedValue({data:null,error:{code:'42501'}});
 const r=await recoverNumberedAiApproval(17);expect(r.success).toBe(false);expect(r).not.toHaveProperty('data');
});
it('an empty ledger is a successful discovery, not a failed request',async()=>{m.lookup.mockResolvedValue({data:null,error:null});expect(await recoverNumberedAiApproval(17)).toEqual({success:true,data:null});expect(m.visible).not.toHaveBeenCalled();});
it('completed receipt requires current visibility of the same document',async()=>{
 m.lookup.mockResolvedValue({data:{...original(),receipt:receipt()},error:null});m.source.mockResolvedValue({data:{id:17,status:'completed',document_id:41}});
 expect((await recoverNumberedAiApproval(17)).success).toBe(true);expect(m.visible).not.toHaveBeenCalled();m.document.mockResolvedValue({data:null});expect((await recoverNumberedAiApproval(17)).success).toBe(false);
});
