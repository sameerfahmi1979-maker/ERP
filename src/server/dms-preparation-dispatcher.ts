import 'server-only';
import { randomUUID } from 'node:crypto';
import { createAdminClient } from '@/lib/supabase/admin';
import { processNextDmsAiJobs } from '@/lib/dms/ai-jobs/job-runner';
import { logger } from '@/lib/logger';

// One local pump per process; the database enforces three slots across ALL processes.
const state = globalThis as typeof globalThis & { algtPreparationPump?: { timer: ReturnType<typeof setInterval>; active: number; checking: boolean } };
export async function tickPreparationDispatcher() {
  const pump = state.algtPreparationPump;
  if (!pump || pump.checking) return;
  pump.checking = true;
  try {
    const { data, error } = await createAdminClient().rpc('dms_preparation_dispatch_worker', { p_action: 'heartbeat', p_data: {} });
    if (error || data?.success !== true || data.version !== 1) return;
    while (pump.active < 3) {
      pump.active++;
      // Requests only the explicitly admitted preparation lane. Never drains the old queue.
      void processNextDmsAiJobs({ limit: 1, workerId: `prep-${randomUUID()}`, preparationOnly: true })
        .catch(() => logger.warn('AI preparation dispatcher unavailable; saved requests retained'))
        .finally(() => { pump.active--; });
    }
  } catch { logger.warn('AI preparation service unavailable; saved requests retained'); }
  finally { pump.checking = false; }
}
export function startPreparationDispatcher() {
  if (state.algtPreparationPump || process.env.NEXT_PHASE === 'phase-production-build' || process.env.NODE_ENV === 'test') return;
  if (process.env.DMS_PREPARATION_DISPATCHER_ENABLED === 'false') return;
  if (process.env.NODE_ENV !== 'development' && process.env.DMS_PREPARATION_DISPATCHER_ENABLED !== 'true') return;
  const timer = setInterval(() => { void tickPreparationDispatcher(); }, 10_000);
  timer.unref();
  state.algtPreparationPump = { timer, active: 0, checking: false };
  void tickPreparationDispatcher();
}
