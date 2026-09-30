import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailWorkerEnabled, processQueuedBatch } from "@/lib/email/queue/service";
import { reserveScheduleSlots, type DueScheduleSlot } from "./schedule-slots";
export interface ScheduleWorkerResult {
    claimed: number;
    queued: number;
    succeeded: number;
    skipped: number;
    retryScheduled: number;
    terminal: number;
    leasesReaped: number;
    deliveryUnknown: number;
    durationMs: number;
}
/** Produces durable intents, then invokes the shared queue. No independent report
 * sender, retry claim, lease reaper or provider exists here. */
export async function processDueSchedules(options: {
    workerId: string;
    limit?: number;
}): Promise<ScheduleWorkerResult> {
    const started = Date.now();
    const result: ScheduleWorkerResult = { claimed: 0, queued: 0, succeeded: 0, skipped: 0, retryScheduled: 0, terminal: 0, leasesReaped: 0, deliveryUnknown: 0, durationMs: 0 };
    if (!emailWorkerEnabled())
        return result;
    const policy = process.env.F09_SCHEDULE_CATCHUP_POLICY;
    if (policy !== "one-slot-at-a-time" && policy !== "skip-missed-after-current")
        throw new Error("Approved schedule catch-up policy required");
    const limit = options.limit ?? 10;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 25)
        throw new Error("Invalid schedule limit");
    const db = createAdminClient();
    const { data, error } = await db.from("erp_report_schedules")
        .select("id,frequency,day_of_week,day_of_month,time_of_day,timezone,next_run_at,updated_at")
        .eq("is_active", true).is("deleted_at", null).lte("next_run_at", new Date().toISOString()).order("next_run_at").limit(limit);
    if (error)
        throw new Error("Due schedule lookup failed");
    const slots=(data??[]).map(s=>({...s,time_of_day:s.time_of_day??"07:00"})) as DueScheduleSlot[];
    const reserved = await reserveScheduleSlots(slots, policy, async (s, next) => {
        const r = await db.rpc("f09_reserve_schedule_slot", { p_schedule_id: s.id, p_expected_due: s.next_run_at, p_expected_updated_at: s.updated_at, p_next_due: next });
        if (r.error)
            throw new Error("Slot reservation failed");
        return r.data as number | null;
    });
    result.claimed = reserved.reserved;
    result.skipped = reserved.conflicted + reserved.invalid;
    // Repair reservation->enqueue response loss, never replay pre-F09 runs.
    const pending = await db.from("erp_report_schedule_runs").select("id").eq("delivery_engine", "f09")
        .eq("status", "failed_retryable").eq("attempt_count", 0).order("id").limit(limit);
    if (pending.error)
        throw new Error("Reserved run lookup failed");
    for (const run of pending.data ?? []) {
        const q = await db.rpc("f09_enqueue_schedule_run", { p_run_id: run.id });
        if (q.error) {
            result.terminal++;
            continue;
        }
        if (q.data)
            result.queued++;
        else
            result.skipped++;
    }
    const delivery=await processQueuedBatch({module:"REPORTS",limit});
    result.succeeded=delivery.accepted; // Provider acceptance, not mailbox delivery.
    result.retryScheduled=delivery.retry;
    result.deliveryUnknown=delivery.unknown;
    result.terminal+=delivery.failed;
    result.skipped+=delivery.skipped+delivery.cancelled;
    result.leasesReaped=delivery.leasesReaped;
    result.durationMs = Date.now() - started;
    return result;
}
