import {describe,it,expect,vi,beforeEach,afterEach} from 'vitest';import {NextRequest} from 'next/server';
const state=vi.hoisted(()=>({from:vi.fn(),process:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({from:state.from})}));
vi.mock('@/lib/dms/ai-jobs/job-runner',()=>({processNextDmsAiJobs:state.process}));
vi.mock('@/lib/logger',()=>({logger:{info:vi.fn(),warn:vi.fn(),error:vi.fn()}}));
import {GET,POST} from '@/app/api/internal/dms-ai-jobs/process/route';
const request=(token='synthetic-test-secret')=>new NextRequest('http://local.invalid/api/internal/dms-ai-jobs/process',{method:'POST',headers:{authorization:'Bearer '+token}});
beforeEach(()=>{vi.clearAllMocks();vi.stubEnv('WORKER_SECRET','synthetic-test-secret');});afterEach(()=>vi.unstubAllEnvs());
describe('T07 worker route stays guarded and dormant',()=>{
 it.each(['','wrong-secret'])('rejects invalid secret %s before database work',async secret=>{expect((await POST(request(secret))).status).toBe(401);expect(state.from).not.toHaveBeenCalled();expect(state.process).not.toHaveBeenCalled();});
 it('rejects a missing configured secret',async()=>{vi.stubEnv('WORKER_SECRET','');expect((await POST(request())).status).toBe(401);expect(state.process).not.toHaveBeenCalled();});
 it('does not process while the existing worker feature flag is disabled',async()=>{
  const q={select:()=>q,eq:()=>q,single:async()=>({data:{is_enabled:false},error:null})};state.from.mockReturnValue(q);const r=await POST(request());expect(r.status).toBe(200);expect((await r.json()).processed).toBe(0);expect(state.process).not.toHaveBeenCalled();
 });
 it('does not falsely report empty healthy counts on a database failure',async()=>{
  const q={select:()=>q,in:async()=>({count:null,error:{code:'XX000'}}),eq:()=>q,single:async()=>({data:null,error:{code:'XX000'}}),then:(resolve:(x:unknown)=>void)=>Promise.resolve({count:null,error:{code:'XX000'}}).then(resolve)};state.from.mockReturnValue(q);expect((await GET(request())).status).toBe(503);
 });
});
