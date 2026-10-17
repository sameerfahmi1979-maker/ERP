// Native HTTP/Data API integration only. No browser engine or provider calls.
import {beforeAll,describe,it,expect,vi} from 'vitest';
import {createClient} from '@supabase/supabase-js';
import {runWithJobClaim,currentJobClaim} from '@/lib/dms/ai-jobs/claim-scope';
vi.mock('@/lib/config/server-features',()=>({getAdminConfig:()=>({url:process.env.F07_T07_URL,serviceKey:process.env.F07_T07_SERVICE_TOKEN})}));
import {createAdminClient} from '@/lib/supabase/admin';
const url=process.env.F07_T07_URL!;
let user:ReturnType<typeof createClient>,admin:ReturnType<typeof createClient>;
beforeAll(()=>{expect(process.env.F07_T07_NATIVE).toBe('owned-local-only');expect(url).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);user=createClient(url,process.env.F07_T07_USER_TOKEN!,{auth:{autoRefreshToken:false,persistSession:false}});admin=createAdminClient();});
const enqueue=async(key:string)=>{const r=await user.rpc('f07_ai_job_control',{p_action:'enqueue',p_data:{jobType:'ai_re_extraction',payload:{documentId:7001,source:'admin_manual_retry'},relatedDocumentId:7001,idempotencyKey:key+'-'+process.env.F07_T07_RUN}});expect(r.error).toBeNull();return r.data.jobId as number;};
const claim=async()=>{const r=await admin.rpc('f07_ai_worker',{p_action:'claim',p_data:{workerId:'native-http-only',limit:1}});expect(r.error).toBeNull();expect(r.data).toHaveLength(1);return {jobId:r.data[0].job.id as number,token:r.data[0].token as string,workerId:'native-http-only',attemptNumber:r.data[0].job.attempt_count as number};};
describe('T07 real Supabase client through owned local PostgREST',()=>{
 it('admits with scoped Auth and returns one stable operation',async()=>{
  const first=await enqueue('t07-http-1');expect(await enqueue('t07-http-1')).toBe(first);
 });
 it('publishes an allowed derived output with real request-header fencing',async()=>{
  const c=await claim();const r=await runWithJobClaim(c,()=>createAdminClient().from('dms_documents').update({ai_summary:'Synthetic native HTTP output'}).eq('id',7001).select('id').single());expect(r.error).toBeNull();expect(r.data?.id).toBe(7001);
  const cancel=await user.rpc('f07_ai_job_control',{p_action:'cancel',p_data:{jobId:c.jobId}});expect(cancel.error).toBeNull();
  const denied=await runWithJobClaim(c,async()=>{const result=await createAdminClient().from('dms_documents').update({ai_summary:'Stale overwrite'}).eq('id',7001);expect(currentJobClaim()?.failed).toBe(true);return result;});expect(denied.error).not.toBeNull();
  const read=await admin.from('dms_documents').select('ai_summary').eq('id',7001).single();expect(read.data?.ai_summary).toBe('Synthetic native HTTP output');
 });
 it('publishes suggestions through the digit-containing canonical RPC',async()=>{
  await enqueue('t07-http-2');const c=await claim();
  const r=await runWithJobClaim(c,()=>createAdminClient().rpc('f07_ai_metadata_suggestions',{p_job:c.jobId,p_token:c.token,p_fields:{notes:'Synthetic HTTP pending suggestion'}}));expect(r.error).toBeNull();expect(r.data.success).toBe(true);
  const rows=await admin.from('dms_document_metadata_values').select('id').eq('document_id',7001);expect(rows.data).toHaveLength(0);
  const settled=await admin.rpc('f07_ai_worker',{p_action:'settle',p_data:{jobId:c.jobId,token:c.token,success:true}});expect(settled.data?.status).toBe('completed');
 });
 it('does not expose claim secrets or worker API to an ordinary user',async()=>{
  const r=await user.rpc('f07_ai_worker',{p_action:'claim',p_data:{workerId:'forbidden',limit:1}});expect(r.error).not.toBeNull();
 });
});
