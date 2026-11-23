import {beforeEach,expect,it,vi} from 'vitest';
import {input,prepared,contract,receipt,snapshot,plan} from './dms-ai-approval-fixtures';
const m=vi.hoisted(()=>({ctx:vi.fn(),can:vi.fn(),lookup:vi.fn(),visible:vi.fn(),claims:vi.fn(),source:vi.fn()}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.ctx,hasPermission:m.can}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:m.lookup})}));
vi.mock('@/lib/supabase/server',()=>({createClient:async()=>({auth:{getClaims:m.claims},rpc:m.visible,from:()=>{
 const q={select:()=>q,eq:()=>q,is:()=>q,maybeSingle:m.source};return q;
}})}));
import {recoverNumberedAiApproval} from '@/server/dms-ai-approval-recovery';
import {withMobileToken} from '@/lib/supabase/mobile-request';
const original=()=>({input:{...input,prepared},contract,receipt:null});
beforeEach(()=>{vi.resetAllMocks();m.ctx.mockResolvedValue({profile:{id:11}});m.can.mockReturnValue(true);
 m.source.mockResolvedValue({data:{id:17,status:'uploaded',document_id:null},error:null});m.claims.mockResolvedValue({data:{claims:{session_id:plan.auth_session_id}},error:null});
 m.lookup.mockResolvedValue({data:original(),error:null});m.visible.mockResolvedValue({data:snapshot,error:null});});
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
it('completed receipt requires current approval authority on the same document',async()=>{
 m.lookup.mockResolvedValue({data:{...original(),receipt:receipt()},error:null});m.source.mockResolvedValue({data:{id:17,status:'completed',document_id:41}});
 m.visible.mockResolvedValue({data:true,error:null});
 expect((await recoverNumberedAiApproval(17)).success).toBe(true);
 expect(m.visible).toHaveBeenCalledWith('verify_completed_numbered_ai_intake',{p_operation:contract.operationId,p_request:expect.objectContaining(original().input)});
 m.visible.mockResolvedValue({data:false,error:null});expect((await recoverNumberedAiApproval(17)).success).toBe(false);
});

it('operation-bound recovery hides a different completed operation before verifying a receipt', async () => {
  m.source.mockResolvedValue({data:{id:17,status:'completed',document_id:41},error:null});
  m.lookup.mockResolvedValue({data:{...original(),receipt:receipt()},error:null});

  const result = await recoverNumberedAiApproval(17, '12345678-1234-4234-8234-123456789012');

  expect(result.success).toBe(false);
  expect(result).not.toHaveProperty('data');
  expect(m.visible).not.toHaveBeenCalled();
});

it('operation-bound recovery uses the native bearer to verify the exact completed receipt', async () => {
  m.source.mockResolvedValue({data:{id:17,status:'completed',document_id:41},error:null});
  m.lookup.mockResolvedValue({data:{...original(),receipt:receipt()},error:null});
  m.visible.mockResolvedValue({data:true,error:null});

  const result = await withMobileToken('offline-native-bearer', () => recoverNumberedAiApproval(17, contract.operationId));

  expect(m.claims).toHaveBeenCalledExactlyOnceWith('offline-native-bearer');
  expect(m.visible).toHaveBeenCalledWith('verify_completed_numbered_ai_intake', {
    p_operation:contract.operationId,
    p_request:{ ...original().input, allowDuplicate:false, links:[], metadataValues:[], tagIds:[] },
  });
  expect(result).toMatchObject({success:true,data:{receipt:{documentId:41,operation_id:contract.operationId}}});
});
