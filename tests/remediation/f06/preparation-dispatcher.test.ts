import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),process:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:m.rpc})}));
vi.mock('@/lib/dms/ai-jobs/job-runner',()=>({processNextDmsAiJobs:m.process}));
import { startPreparationDispatcher,tickPreparationDispatcher,wakePreparationDispatcher } from '@/server/dms-preparation-dispatcher';
const state=globalThis as typeof globalThis & {algtPreparationPump?:{timer:ReturnType<typeof setInterval>}};
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();vi.stubEnv('NODE_ENV','development');vi.stubEnv('DMS_PREPARATION_DISPATCHER_ENABLED','true');vi.stubEnv('DMS_PREPARATION_RUNTIME_ID','synthetic-worker');vi.stubEnv('DMS_PREPARATION_RUNTIME_SECRET','s'.repeat(40));m.rpc.mockResolvedValue({data:{success:true,version:2},error:null});m.process.mockImplementation(()=>new Promise(()=>{}));});
afterEach(()=>{if(state.algtPreparationPump)clearInterval(state.algtPreparationPump.timer);delete state.algtPreparationPump;vi.unstubAllEnvs();vi.useRealTimers();});
it('starts three independent slots, never duplicates the process pump or drains legacy jobs',async()=>{
 startPreparationDispatcher();await vi.advanceTimersByTimeAsync(1);expect(m.process).toHaveBeenCalledTimes(3);
 for(const [input] of m.process.mock.calls)expect(input).toMatchObject({limit:1,preparationOnly:true});
 startPreparationDispatcher();await vi.advanceTimersByTimeAsync(20000);expect(m.process).toHaveBeenCalledTimes(3);expect(m.rpc).toHaveBeenCalledTimes(3);
});
it('fails closed for a missing migration or disabled worker',async()=>{m.rpc.mockResolvedValue({data:{success:false},error:null});startPreparationDispatcher();await vi.advanceTimersByTimeAsync(1);expect(m.process).not.toHaveBeenCalled();});
it('requires explicit opt-in plus runtime credentials and excludes builds',()=>{
 vi.stubEnv('DMS_PREPARATION_DISPATCHER_ENABLED','');startPreparationDispatcher();expect(state.algtPreparationPump).toBeUndefined();
 vi.stubEnv('DMS_PREPARATION_DISPATCHER_ENABLED','true');vi.stubEnv('DMS_PREPARATION_RUNTIME_SECRET','');startPreparationDispatcher();expect(state.algtPreparationPump).toBeUndefined();
 vi.stubEnv('DMS_PREPARATION_RUNTIME_SECRET','s'.repeat(40));vi.stubEnv('NEXT_PHASE','phase-production-build');startPreparationDispatcher();expect(state.algtPreparationPump).toBeUndefined();
});
it('refills a confirmed settled slot immediately and stops when no claim is found',async()=>{
 m.process.mockResolvedValueOnce({completed:1,failed:0,retryScheduled:0}).mockResolvedValue({completed:0,failed:0,retryScheduled:0});
 startPreparationDispatcher();await vi.advanceTimersByTimeAsync(1);expect(m.process).toHaveBeenCalledTimes(4);
 expect(m.process).toHaveBeenCalledWith({limit:1,preparationOnly:true,workerId:'synthetic-worker',runtimeSecret:'s'.repeat(40)});
 await tickPreparationDispatcher();await vi.advanceTimersByTimeAsync(1);expect(m.process).toHaveBeenCalledTimes(7);
});
it('wakes an idle runtime immediately after a durable admission',async()=>{
 m.process.mockResolvedValue({completed:0,failed:0,retryScheduled:0});
 startPreparationDispatcher();await vi.advanceTimersByTimeAsync(1);
 expect(m.process).toHaveBeenCalledTimes(3);
 wakePreparationDispatcher();await vi.advanceTimersByTimeAsync(1);
 expect(m.process).toHaveBeenCalledTimes(6);
 expect(m.rpc).toHaveBeenCalledTimes(2);
});
