import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { startPreparationDispatcher, wakePreparationDispatcher } from '@/server/dms-preparation-dispatcher';

const mocks = vi.hoisted(() => ({ rpc: vi.fn(), handle: vi.fn(), available: false, recover: true, idleHint: undefined as unknown }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ rpc: mocks.rpc }) }));
vi.mock('@/lib/dms/ai-jobs/job-registry', () => ({ getDmsAiJobHandler: () => ({ handle: mocks.handle }) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));

const state = globalThis as typeof globalThis & { algtPreparationPump?: { timer: ReturnType<typeof setInterval> } };
const calls = (action: string) => mocks.rpc.mock.calls.filter(([, request]) => request.p_action === action);

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers();
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('DMS_PREPARATION_DISPATCHER_ENABLED', 'true');
  vi.stubEnv('DMS_PREPARATION_RUNTIME_ID', 'synthetic-worker');
  vi.stubEnv('DMS_PREPARATION_RUNTIME_SECRET', 'offline'.repeat(6));
  mocks.available = false;
  mocks.recover = true;
  mocks.idleHint = undefined;
  mocks.handle.mockResolvedValue({ success: true });
  mocks.rpc.mockImplementation(async (_name, { p_action }) => {
    if (p_action === 'heartbeat') return { data: { success: true, version: 2, hasWork: mocks.idleHint }, error: null };
    if (p_action === 'recover') return { data: { success: mocks.recover }, error: null };
    if (p_action === 'claim') {
      const available = mocks.available;
      mocks.available = false;
      return { data: available ? [{
        token: '11111111-1111-4111-8111-111111111111',
        job: { id: 9, job_type: 'synthetic', payload_json: {}, attempt_count: 1, max_attempts: 3, locked_by: 'synthetic-worker' },
      }] : [], error: null };
    }
    if (p_action === 'assert') return { data: { success: true }, error: null };
    if (p_action === 'settle') return { data: { success: true, jobId: 9, attemptNumber: 1, status: 'completed' }, error: null };
    throw new Error('Unexpected synthetic RPC');
  });
});
afterEach(() => {
  if (state.algtPreparationPump) clearInterval(state.algtPreparationPump.timer);
  delete state.algtPreparationPump;
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

it('reuses one preparation recovery per tick while keeping all three scoped claims', async () => {
  startPreparationDispatcher();
  await vi.advanceTimersByTimeAsync(20_001);
  expect(calls('heartbeat')).toHaveLength(3);
  expect(calls('recover')).toHaveLength(3);
  expect(calls('claim')).toHaveLength(9);
  expect(calls('claim').every(([name, request]) =>
    name === 'dms_preparation_dispatch_worker' && request.p_data.runtimeId === 'synthetic-worker' &&
    request.p_data.limit === 1 && request.p_data.preparationVersion === 1,
  )).toBe(true);
});

it('holds every slot when a shared recovery is rejected', async () => {
  mocks.recover = false;
  startPreparationDispatcher();
  await vi.advanceTimersByTimeAsync(1);
  expect(calls('recover')).toHaveLength(1);
  expect(calls('claim')).toHaveLength(0);
  expect(mocks.handle).not.toHaveBeenCalled();
});

it('preserves immediate wake, exclusive claim and refill after verified settlement', async () => {
  startPreparationDispatcher();
  await vi.advanceTimersByTimeAsync(1);
  mocks.available = true;
  wakePreparationDispatcher();
  await vi.advanceTimersByTimeAsync(1);
  expect(mocks.handle).toHaveBeenCalledOnce();
  expect(calls('settle')).toHaveLength(1);
  expect(calls('claim')).toHaveLength(7);
  expect(calls('recover')).toHaveLength(3);
});

it('skips recovery and claims for an authenticated explicit idle heartbeat only', async () => {
  mocks.idleHint = false;
  startPreparationDispatcher();
  await vi.advanceTimersByTimeAsync(20_001);
  expect(calls('heartbeat')).toHaveLength(3);
  expect(calls('recover')).toHaveLength(0);
  expect(calls('claim')).toHaveLength(0);
});

it.each([null, 'false', 0])('retains the normal claim fence for unrecognized hint %j', async idleHint => {
  mocks.idleHint = idleHint;
  startPreparationDispatcher();
  await vi.advanceTimersByTimeAsync(1);
  expect(calls('recover')).toHaveLength(1);
  expect(calls('claim')).toHaveLength(3);
});

it('retains a local wake that races an in-flight idle heartbeat', async () => {
  vi.useRealTimers();
  const original = mocks.rpc.getMockImplementation()!;
  let release!: (value: { data: { success: true; version: 2; hasWork: false }; error: null }) => void;
  mocks.rpc.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const processed = new Promise<void>(resolve => mocks.handle.mockImplementationOnce(async () => {
    resolve();
    return { success: true };
  }));
  startPreparationDispatcher();
  mocks.available = true;
  wakePreparationDispatcher();
  expect(calls('heartbeat')).toHaveLength(1);
  release({ data: { success: true, version: 2, hasWork: false }, error: null });
  await expect(processed).resolves.toBeUndefined();
  expect(calls('heartbeat')).toHaveLength(2);
  expect(mocks.handle).toHaveBeenCalledOnce();
  expect(mocks.rpc.getMockImplementation()).toBe(original);
}, 2_000);
