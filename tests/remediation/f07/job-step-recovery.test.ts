import {describe,it,expect,vi,beforeEach} from 'vitest';
import {runWithJobClaim} from '@/lib/dms/ai-jobs/claim-scope';
const state=vi.hoisted(()=>({rpc:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:state.rpc})}));
vi.mock('@/lib/supabase/server',()=>({createClient:vi.fn()}));
vi.mock('@/lib/dms/ai/factory',()=>({getDmsAiProvider:vi.fn(),getDmsEmbeddingProvider:vi.fn()}));
vi.mock('@/lib/dms/ai-jobs/job-runner',()=>({enqueueUniqueDmsAiJob:vi.fn()}));
import {runDurableStep} from '@/lib/dms/orchestration/system-pipeline';
const claim={jobId:7,token:'c7000000-0000-4000-8000-000000000001',workerId:'test',attemptNumber:2};
beforeEach(()=>vi.clearAllMocks());
describe('T07 durable orchestration step recovery',()=>{
 it('reuses a committed step without another provider call',async()=>{
  state.rpc.mockResolvedValue({data:{success:true,step:{step:'ai_summary',status:'completed'}},error:null});const work=vi.fn();
  expect(await runWithJobClaim(claim,()=>runDurableStep('ai_summary',work))).toMatchObject({status:'completed'});expect(work).not.toHaveBeenCalled();
 });
 it('retains a successful step receipt with the current fence',async()=>{
  state.rpc.mockResolvedValueOnce({data:{success:true,step:null},error:null}).mockResolvedValueOnce({data:{success:true},error:null});
  expect(await runWithJobClaim(claim,()=>runDurableStep('ai_summary',async()=>({success:true})))).toMatchObject({status:'completed'});
  expect(state.rpc.mock.calls[1][1]).toMatchObject({p_action:'step_save',p_data:{jobId:7,token:claim.token,step:'ai_summary',status:'completed'}});
 });
 it('does not execute after an unconfirmed read',async()=>{
  state.rpc.mockResolvedValue({error:{code:'PT409'},data:null});const work=vi.fn();await expect(runWithJobClaim(claim,()=>runDurableStep('ai_summary',work))).rejects.toThrow('unavailable');expect(work).not.toHaveBeenCalled();
 });
 it('does not claim success after an unconfirmed step receipt',async()=>{
  state.rpc.mockResolvedValueOnce({data:{success:true},error:null}).mockResolvedValueOnce({error:{code:'08007'},data:null});await expect(runWithJobClaim(claim,()=>runDurableStep('ai_summary',async()=>({success:true})))).rejects.toThrow('not confirmed');
 });
 it('does not persist or return raw provider failure text',async()=>{
  state.rpc.mockResolvedValue({data:{success:true},error:null});const r=await runWithJobClaim(claim,()=>runDurableStep('ai_summary',async()=>({success:false,error:'secret prompt private document'})));expect(r.status).toBe('failed');expect(JSON.stringify(r)).not.toContain('secret');expect(state.rpc).toHaveBeenCalledTimes(1);
 });
 it('leaves the interactive pipeline path unchanged',async()=>{
  expect((await runDurableStep('content_sync',async()=>({success:true}))).status).toBe('completed');expect(state.rpc).not.toHaveBeenCalled();
 });
 it('worker logs retain identity but not prompts, exceptions or tokens',async()=>{
  const {logger}=await vi.importActual<typeof import('@/lib/logger')>('@/lib/logger');const log=vi.spyOn(console,'error').mockImplementation(()=>undefined);
  await runWithJobClaim(claim,async()=>logger.error('private document text',new Error('secret '+claim.token)));
  expect(JSON.stringify(log.mock.calls)).toContain('jobId');expect(JSON.stringify(log.mock.calls)).not.toMatch(/private|secret|c7000000/);log.mockRestore();
 });
});
