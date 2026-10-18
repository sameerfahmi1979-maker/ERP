import {beforeEach,expect,it,vi} from 'vitest';
import {syntheticAuthContext} from '../../performance/fixtures/auth-context';
const m=vi.hoisted(()=>({ctx:vi.fn(),db:vi.fn(),rpc:vi.fn(),reads:[] as unknown[][]}));
vi.mock('@/lib/rbac/check',()=>({getAuthContext:m.ctx}));
vi.mock('@/lib/supabase/server',()=>({createClient:m.db}));
import {getEmailDeliveryReviews,recordEmailDeliveryReview} from '@/server/actions/notifications/email-reviews';
const input={queueId:7,operationId:'00000000-0000-4000-8000-000000000099',disposition:'investigating' as const,traceReference:'F09 ticket 01'};
beforeEach(()=>{vi.clearAllMocks();m.reads=[];m.ctx.mockResolvedValue(syntheticAuthContext(['notifications.email_queue.view','notifications.email_queue.manage','notifications.email_queue.process']));m.rpc.mockResolvedValue({data:5,error:null});m.db.mockImplementation(()=>{const q:Record<string,unknown>={then:(resolve:(v:unknown)=>unknown)=>Promise.resolve({data:[],error:null}).then(resolve)};for(const method of ['select','eq','order','limit'])q[method]=(...args:unknown[])=>{m.reads.push([method,...args]);return q;};return {from:()=>q,rpc:m.rpc};});});
it('recording requires both global manage and process before any persistence',async()=>{
 for(const permission of ['notifications.email_queue.view','notifications.email_queue.manage','notifications.email_queue.process']){m.ctx.mockResolvedValue(syntheticAuthContext([permission]));expect((await recordEmailDeliveryReview(input)).success).toBe(false);}expect(m.db).not.toHaveBeenCalled();
});
it('scoped review capabilities never become global authority',async()=>{
 const ctx=syntheticAuthContext(['notifications.email_queue.manage','notifications.email_queue.process']);ctx.globalPermissionCodes=[];m.ctx.mockResolvedValue(ctx);expect((await recordEmailDeliveryReview(input)).success).toBe(false);expect(m.db).not.toHaveBeenCalled();
});
it.each(['email@example.invalid','https://erp.algt.net/?token=SECRET','x',''])('rejects a sensitive or invalid trace reference %s',async traceReference=>{
 expect((await recordEmailDeliveryReview({...input,traceReference})).success).toBe(false);expect(m.rpc).not.toHaveBeenCalled();
});
it('calls only the review RPC with the original operation, never a send transition',async()=>{
 expect(await recordEmailDeliveryReview(input)).toEqual({success:true,data:{id:5}});expect(m.rpc).toHaveBeenCalledExactlyOnceWith('f09_record_delivery_review',{p_queue:7,p_operation:input.operationId,p_disposition:'investigating',p_trace:'F09 ticket 01'});
});
it('loss or malformed receipt retains uncertainty and masks provider details',async()=>{
 m.rpc.mockRejectedValueOnce(Error('PRIVATE'));expect(await recordEmailDeliveryReview(input)).toMatchObject({success:false,uncertain:true});m.rpc.mockResolvedValue({data:{private:'PRIVATE'},error:null});const r=await recordEmailDeliveryReview(input);expect(r).toMatchObject({success:false,uncertain:true});expect(JSON.stringify(r)).not.toContain('PRIVATE');
});
it('review reads remain bounded and do not request message bodies or secrets',async()=>{
 expect(await getEmailDeliveryReviews(7)).toEqual({success:true,data:[]});expect(m.reads).toContainEqual(['limit',100]);expect(String(m.reads.find(r=>r[0]==='select')?.[1])).not.toMatch(/\*|body|credential|lease_token/);
});
