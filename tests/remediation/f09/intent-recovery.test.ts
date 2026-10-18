import {beforeEach,expect,it,vi} from 'vitest';
import {syntheticAuthContext} from '../../performance/fixtures/auth-context';
const m=vi.hoisted(()=>({actor:vi.fn(),db:vi.fn(),results:[] as unknown[]}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.actor}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.db}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:m.db}));
vi.mock('@/lib/email/queue/service',()=>({processQueuedEmail:vi.fn(),processQueuedBatch:vi.fn()}));
vi.mock('@/server/actions/audit',()=>({logAudit:vi.fn()}));
vi.mock('next/cache',()=>({revalidatePath:vi.fn()}));
import {queueEmail} from '@/server/actions/notifications/email-queue';
const request={request_id:'00000000-0000-4000-8000-000000000099',source_module:'SYSTEM',to_emails:['synthetic@example.invalid'],subject:'Synthetic',text_body:'Synthetic body',priority:'normal' as const,max_attempts:3};
const prior={...request,id:7,created_by:1,deleted_at:null};
beforeEach(()=>{
 vi.clearAllMocks();m.results=[];m.actor.mockResolvedValue(syntheticAuthContext(['notifications.email_queue.manage','notifications.email_queue.process']));
 m.db.mockImplementation(()=>{const q:Record<string,unknown>={};for(const method of ['insert','select','eq'])q[method]=()=>q;for(const method of ['single','maybeSingle'])q[method]=async()=>m.results.shift();return {from:()=>q};});
});
it('a lost insert response is reconciled only against the exact original intent',async()=>{
 m.results=[{data:null,error:{code:'23505'}},{data:prior,error:null}];expect(await queueEmail(request)).toMatchObject({success:true,data:{id:7,sent:false}});
});
it.each([{subject:'Other'},{created_by:2},{deleted_at:'2026-10-18T00:00:00Z'},{to_emails:['other@example.invalid']}])('same key with a mismatched original is not reported saved: %j',async patch=>{
 m.results=[{data:null,error:{code:'23505'}},{data:{...prior,...patch},error:null}];expect((await queueEmail(request)).success).toBe(false);
});
it('JSON object key ordering does not create a false changed-payload conflict',async()=>{
 m.results=[{data:null,error:{code:'23505'}},{data:{...prior,template_variables_json:{b:2,a:1}},error:null}];expect((await queueEmail({...request,template_variables_json:{a:1,b:2}})).success).toBe(true);
});
it('a duplicate reconciliation query failure remains unconfirmed and does not invent a new intent',async()=>{
 m.results=[{data:null,error:{code:'23505'}},{data:null,error:{message:'PRIVATE'}}];const result=await queueEmail(request);expect(result.success).toBe(false);expect(JSON.stringify(result)).not.toContain('PRIVATE');
});
it('total recipients are bounded before persistence',async()=>{
 expect((await queueEmail({...request,cc_emails:Array.from({length:100},(_,i)=>'test'+i+'@example.invalid')})).success).toBe(false);expect(m.db).not.toHaveBeenCalled();
});
