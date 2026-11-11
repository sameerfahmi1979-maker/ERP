import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({rpc:vi.fn(),process:vi.fn()}));
vi.mock('@/lib/supabase/admin',()=>({createAdminClient:()=>({rpc:m.rpc})}));
vi.mock('@/lib/dms/ai-jobs/job-runner',()=>({processNextDmsAiJobs:m.process}));
import { startPreparationDispatcher,tickPreparationDispatcher } from '@/server/dms-preparation-dispatcher';
const state=globalThis as typeof globalThis & {algtPreparationPump?:{timer:ReturnType<typeof setInterval>}};
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();vi.stubEnv('NODE_ENV','development');m.rpc.mockResolvedValue({data:{success:true,version:1},error:null});m.process.mockImplementation(()=>new Promise(()=>{}));});
afterEach(()=>{if(state.algtPreparationPump)clearInterval(state.algtPreparationPump.timer);delete state.algtPreparationPump;vi.unstubAllEnvs();vi.useRealTimers();});
it('starts three independent slots, never duplicates the process pump or drains legacy jobs',async()=>{
 startPreparationDispatcher();await vi.advanceTimersByTimeAsync(1);expect(m.process).toHaveBeenCalledTimes(3);
 for(const [input] of m.process.mock.calls)expect(input).toMatchObject({limit:1,preparationOnly:true});
 startPreparationDispatcher();await vi.advanceTimersByTimeAsync(20000);expect(m.process).toHaveBeenCalledTimes(3);expect(m.rpc).toHaveBeenCalledTimes(3);
});
it('fails closed for a missing migration or disabled worker',async()=>{m.rpc.mockResolvedValue({data:{success:false},error:null});startPreparationDispatcher();await vi.advanceTimersByTimeAsync(1);expect(m.process).not.toHaveBeenCalled();});
it('does not activate at build time or in production without explicit configuration',()=>{vi.stubEnv('NODE_ENV','production');startPreparationDispatcher();expect(state.algtPreparationPump).toBeUndefined();vi.stubEnv('DMS_PREPARATION_DISPATCHER_ENABLED','true');vi.stubEnv('NEXT_PHASE','phase-production-build');startPreparationDispatcher();expect(state.algtPreparationPump).toBeUndefined();});
it('releases completed slots and permits subsequent work',async()=>{m.process.mockResolvedValue({processed:1});startPreparationDispatcher();await vi.advanceTimersByTimeAsync(1);expect(m.process).toHaveBeenCalledTimes(3);await tickPreparationDispatcher();await vi.advanceTimersByTimeAsync(1);expect(m.process).toHaveBeenCalledTimes(6);});
