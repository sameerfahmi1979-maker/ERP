import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { processNextDmsAiJobs, type PreparationRecoveryPass } from '@/lib/dms/ai-jobs/job-runner';
import { logger } from '@/lib/logger';

// One local pump per process; the database enforces three slots across ALL processes.
const state = globalThis as typeof globalThis & { algtPreparationPump?: { timer: ReturnType<typeof setInterval>; active: number; checking: boolean; wakePending: boolean; runtimeId: string; runtimeSecret: string } };

function startSlot(pump: NonNullable<typeof state.algtPreparationPump>, preparationRecovery?: PreparationRecoveryPass) {
  pump.active++;
  void processNextDmsAiJobs({
    limit: 1, workerId: pump.runtimeId, runtimeSecret: pump.runtimeSecret, preparationOnly: true,
    ...(preparationRecovery && { preparationRecovery }),
  })
    .then(result => {
      pump.active--;
      if (state.algtPreparationPump === pump && result.completed + result.failed + result.retryScheduled > 0) startSlot(pump);
    }, () => {
      pump.active--;
      logger.warn('AI preparation dispatcher unavailable; saved requests retained');
    });
}
export async function tickPreparationDispatcher() {
  const pump = state.algtPreparationPump;
  if (!pump || pump.checking) return;
  pump.checking = true;
  try {
    const { runtimeId, runtimeSecret } = pump;
    const { data, error } = await createAdminClient().rpc('dms_preparation_dispatch_worker', { p_action: 'heartbeat', p_data: {runtimeId,runtimeSecret} });
    if (error || data?.success !== true || data.version !== 2 || data.hasWork === false) return;
    // One recovery covers this runtime's starting slots for this tick. Claims
    // still run independently and refill after each confirmed settlement.
    const preparationRecovery: PreparationRecoveryPass = { runtimeId };
    while (pump.active < 3) {
      startSlot(pump, preparationRecovery);
    }
  } catch { logger.warn('AI preparation service unavailable; saved requests retained'); }
  finally {
    pump.checking = false;
    if (pump.wakePending) {
      pump.wakePending = false;
      if (state.algtPreparationPump === pump && pump.active < 3) void tickPreparationDispatcher();
    }
  }
}

export function wakePreparationDispatcher() {
  const pump = state.algtPreparationPump;
  if (!pump || pump.active >= 3) return;
  // A local admission may commit just after an in-flight heartbeat observes no work.
  if (pump.checking) {
    pump.wakePending = true;
    return;
  }
  void tickPreparationDispatcher();
}

export function startPreparationDispatcher() {
  if (state.algtPreparationPump || process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV === 'test') return;
  if (process.env.DMS_PREPARATION_DISPATCHER_ENABLED !== 'true') return;
  const runtimeId = process.env.DMS_PREPARATION_RUNTIME_ID ?? '';
  const runtimeSecret = process.env.DMS_PREPARATION_RUNTIME_SECRET ?? '';
  if (!/^[a-z0-9][a-z0-9-]{0,47}$/.test(runtimeId) || runtimeSecret.length < 32 || runtimeSecret.length > 256) return;
  const timer = setInterval(() => { void tickPreparationDispatcher(); }, 10_000);
  timer.unref();
  state.algtPreparationPump = { timer, active: 0, checking: false, wakePending: false, runtimeId, runtimeSecret };
  void tickPreparationDispatcher();
}
