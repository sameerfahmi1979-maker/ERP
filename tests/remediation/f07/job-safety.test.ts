import { describe, it, expect, vi, beforeEach } from 'vitest';
import { runWithJobClaim, currentJobClaim, jobScopedFetch, JOB_OUTPUT_TABLES } from '@/lib/dms/ai-jobs/claim-scope';
import { validateJobInput } from '@/lib/dms/ai-jobs/job-types';
import fs from 'node:fs';
const claim = { jobId: 7, token: 'c7000000-0000-4000-8000-000000000001', workerId: 'test', attemptNumber: 1 };
const input = { jobType: 'ai_re_extraction' as const, payload: { documentId: 7, source: 'admin_manual_retry' }, relatedDocumentId: 7, idempotencyKey: 'operation-7' };
describe('T07 request-local publication fence', () => {
  it('does not alter non-worker interactive/OCR requests', async () => {
    const base = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    await jobScopedFetch(base)('https://example.invalid/rest/v1/other', { method: 'PATCH' });
    expect(base.mock.calls[0][1]).toEqual({ method: 'PATCH' });
  });
  it('carries the exact fence through nested admin requests', async () => {
    const base = vi.fn<typeof fetch>().mockResolvedValue(new Response());
    await runWithJobClaim(claim, () => jobScopedFetch(base)('https://example.invalid/rest/v1/dms_documents', { method: 'PATCH' }));
    const headers = base.mock.calls[0][1]?.headers as Headers;
    expect(headers.get('x-algt-ai-job')).toBe('7'); expect(headers.get('x-algt-ai-claim')).toBe(claim.token);
    expect(currentJobClaim()).toBeUndefined();
  });
  it.each(['f07_ai_worker','f07_ai_metadata_suggestions'])('allows the canonical digit-containing RPC %s',async name=>{
    const base=vi.fn<typeof fetch>().mockResolvedValue(new Response());
    await runWithJobClaim(claim,()=>jobScopedFetch(base)(`https://example.invalid/rest/v1/rpc/${name}`,{method:'POST'}));expect(base).toHaveBeenCalledTimes(1);
  });
  it('does not send a claim capability to Storage downloads',async()=>{
    const base=vi.fn<typeof fetch>().mockResolvedValue(new Response());await runWithJobClaim(claim,()=>jobScopedFetch(base)('https://example.invalid/storage/v1/object/dms/test'));
    expect(base.mock.calls[0][1]).toBeUndefined();
  });
  it('keeps concurrent claim identities isolated', async () => {
    const seen: string[] = [];
    const base = vi.fn<typeof fetch>(async (_url, init) => { await Promise.resolve(); seen.push(new Headers(init?.headers).get('x-algt-ai-job')!);return new Response(); });
    await Promise.all([7,8].map(jobId => runWithJobClaim({...claim,jobId}, () => jobScopedFetch(base)('https://example.invalid/rest/v1/dms_documents', {method:'PATCH'}))));
    expect(seen.sort()).toEqual(['7','8']);
  });
  it('awaits lazy database builders before leaving the claim scope',async()=>{
    const value=await runWithJobClaim(claim,()=>({then:(resolve:(id:number|undefined)=>void)=>Promise.resolve().then(()=>resolve(currentJobClaim()?.jobId))}));expect(value).toBe(7);
  });
  it.each(['employees','dms_metadata_definitions','dms_document_metadata_values','dms_ai_erp_apply_runs','erp_notifications'])( 'blocks authority/delivery table %s', async table => {
    const base=vi.fn<typeof fetch>();
    await expect(runWithJobClaim(claim,()=>jobScopedFetch(base)(`https://example.invalid/rest/v1/${table}`,{method:'POST'}))).rejects.toThrow('allowlist');
    expect(base).not.toHaveBeenCalled();
  });
  it.each(['/rest/v1/rpc/complete_dms_ai_job','/storage/v1/object/dms/x','/auth/v1/admin/users'])('blocks unfenced API path %s',async path=>{
    const base=vi.fn<typeof fetch>();
    await expect(runWithJobClaim(claim,()=>jobScopedFetch(base)('https://example.invalid'+path,{method:'POST'}))).rejects.toThrow('allowlist');
    expect(base).not.toHaveBeenCalled();
  });
  it('poisons an attempt even when a legacy helper swallows a rejected write',async()=>{
    const base=vi.fn<typeof fetch>().mockResolvedValue(new Response('{}',{status:409}));
    await runWithJobClaim(claim,async()=>{
      await jobScopedFetch(base)('https://example.invalid/rest/v1/dms_documents',{method:'PATCH'}).catch(()=>undefined);
      expect(currentJobClaim()?.failed).toBe(true);
      await expect(jobScopedFetch(base)('https://example.invalid/rest/v1/dms_documents')).rejects.toThrow('reconcile');
    });expect(base).toHaveBeenCalledTimes(1);
  });
  it('poisons ambiguous network outcomes instead of issuing another mutation',async()=>{
    const base=vi.fn<typeof fetch>().mockRejectedValue(new Error('lost response'));
    await runWithJobClaim(claim,async()=>{
      await jobScopedFetch(base)('https://example.invalid/rest/v1/dms_documents',{method:'PATCH'}).catch(()=>undefined);
      expect(currentJobClaim()?.failed).toBe(true);
    });
  });
  it('all allowed output tables have a database transaction fence',()=>{
    const sql=fs.readFileSync('supabase/migrations/20261017161219_f07_fenced_ai_job_safety.sql','utf8');
    const tables=sql.match(/FOREACH t IN ARRAY ARRAY\[(.*?)\] LOOP/s)![1];
    for(const table of JOB_OUTPUT_TABLES)expect(tables).toContain(`'${table}'`);
  });
});
describe('T07 payload admission',()=>{
  it('accepts registered strict IDs/control flags',()=>expect(validateJobInput(input).payload).toEqual(input.payload));
  it.each(['rawOcrText','prompt','response','apiKey'])('rejects sensitive %s payload',key=>expect(()=>validateJobInput({...input,payload:{...input.payload,[key]:'private'}})).toThrow());
  it('rejects unregistered types',()=>expect(()=>validateJobInput({...input,jobType:'content_sync'})).toThrow());
  it('rejects mismatched document references',()=>expect(()=>validateJobInput({...input,relatedDocumentId:8})).toThrow());
  it.each([0,-1,4,999,1.5])('rejects invalid attempt budget %s',maxAttempts=>expect(()=>validateJobInput({...input,maxAttempts})).toThrow());
  it('rejects unknown source codes',()=>expect(()=>validateJobInput({...input,payload:{documentId:7,source:'auto_apply'}})).toThrow());
});

const mocks=vi.hoisted(()=>({rpc:vi.fn(),handler:vi.fn(),client:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:mocks.rpc})}));
vi.mock('@/lib/supabase/server',()=>({createClient:()=>Promise.resolve({rpc:mocks.rpc})}));
vi.mock('@/lib/dms/ai-jobs/job-registry',()=>({getDmsAiJobHandler:()=>({handle:mocks.handler})}));
vi.mock('@/lib/logger',()=>({logger:{warn:vi.fn(),info:vi.fn(),error:vi.fn()}}));
import { processNextDmsAiJobs, runDmsAiJob, enqueueUniqueDmsAiJob, sanitizeJobError } from '@/lib/dms/ai-jobs/job-runner';
const job={id:7,job_type:'ai_re_extraction',payload_json:input.payload,attempt_count:1,max_attempts:3,locked_by:'test'} as Parameters<typeof runDmsAiJob>[0];
beforeEach(()=>{vi.clearAllMocks();mocks.handler.mockResolvedValue({success:true});});
describe('T07 runner acceptance',()=>{
  it('uses a single atomic user admission and preserves terminal replay',async()=>{
    mocks.rpc.mockResolvedValue({data:{success:true,jobId:7,skipped:true},error:null});
    expect(await enqueueUniqueDmsAiJob(input)).toEqual({success:true,jobId:7,skipped:true});
    expect(mocks.rpc).toHaveBeenCalledTimes(1);expect(mocks.rpc.mock.calls[0][0]).toBe('f07_ai_job_control');
  });
  it('does not return success for malformed admission receipts',async()=>{
    mocks.rpc.mockResolvedValue({data:{success:true},error:null});expect((await enqueueUniqueDmsAiJob(input)).success).toBe(false);
  });
  it('does not execute a handler after assert denial',async()=>{
    mocks.rpc.mockResolvedValue({error:{code:'PT409'}});expect(await runDmsAiJob(job,claim)).toBeNull();expect(mocks.handler).not.toHaveBeenCalled();
  });
  it('uses the consumed database attempt rather than incrementing it again',async()=>{
    mocks.rpc.mockResolvedValueOnce({data:{success:true},error:null}).mockResolvedValueOnce({data:{success:true,jobId:7,attemptNumber:1,status:'completed'},error:null});
    expect(await runDmsAiJob(job,claim)).toBe('completed');expect(mocks.handler.mock.calls[0][1].attemptNumber).toBe(1);
  });
  it('does not accept an unrelated settlement receipt',async()=>{
    mocks.rpc.mockResolvedValueOnce({data:{success:true},error:null}).mockResolvedValueOnce({data:{success:true,jobId:8,attemptNumber:1,status:'completed'},error:null});expect(await runDmsAiJob(job,claim)).toBeNull();
  });
  it('does not count unconfirmed settlement as complete',async()=>{
    mocks.rpc.mockResolvedValueOnce({data:{success:true},error:null}).mockRejectedValueOnce(new Error('lost response'));expect(await runDmsAiJob(job,claim)).toBeNull();
  });
  it('claims just-in-time and obtains no extra preclaimed leases',async()=>{
    mocks.rpc.mockImplementation(async(_name,args)=>({error:null,data:args.p_action==='recover'||args.p_action==='assert'?{success:true}:args.p_action==='claim'?[{job,token:claim.token}]:{success:true,jobId:7,attemptNumber:1,status:'completed'}}));
    const result=await processNextDmsAiJobs({limit:1,workerId:'test'});expect(result.completed).toBe(1);
    const calls=mocks.rpc.mock.calls.filter(c=>c[1].p_action==='claim');expect(calls).toHaveLength(1);expect(calls[0][1].p_data.limit).toBe(1);
  });
  it('stops when recovery cannot be confirmed',async()=>{
    mocks.rpc.mockResolvedValue({data:null,error:{}});expect((await processNextDmsAiJobs({limit:5,workerId:'test'})).processed).toBe(0);expect(mocks.rpc).toHaveBeenCalledTimes(1);
  });
  it.each([0,51,1.5])('rejects invalid processing limit %s',async limit=>{await processNextDmsAiJobs({limit,workerId:'test'});expect(mocks.rpc).not.toHaveBeenCalled();});
  it('never returns provider errors, prompts or secrets verbatim',()=>expect(sanitizeJobError(new Error('key secret document text'))).toEqual({code:'unexpected',message:'AI job did not complete. Review the safe attempt code.'}));
});
