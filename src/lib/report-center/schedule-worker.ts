import "server-only";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { emailWorkerEnabled, processQueuedBatch } from "@/lib/email/queue/service";
import { reserveScheduleSlots, type DueScheduleSlot } from "./schedule-slots";
import { withDeadline } from "@/lib/email/queue/delivery-contract";
import { F09_LIMITS, queryWithin } from "@/lib/email/queue/runtime-limits";

const positiveId = z.number().int().positive();
const reservedRuns = z.array(z.object({ id: positiveId })).max(25);
const scheduleInventory = z.object({
    due: z.array(z.object({
        id: positiveId,
        frequency: z.enum(["daily", "weekly", "monthly"]),
        day_of_week: z.number().int().nullable(),
        day_of_month: z.number().int().nullable(),
        time_of_day: z.string().nullable(),
        timezone: z.string(),
        next_run_at: z.string(),
        updated_at: z.string(),
    })).max(25),
    reserved: reservedRuns,
});
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
    await withDeadline(F09_LIMITS.scheduleProductionMs, async signal => {
    const { data, error } = await queryWithin(db.rpc("f09_schedule_worker_inventory", {
        p_limit: limit, p_due_at: new Date().toISOString(),
    }), signal);
    if (error)
        throw new Error("Schedule inventory unavailable");
    const inventory = scheduleInventory.parse(data);
    if (inventory.due.length > limit || inventory.reserved.length > limit)
        throw new Error("Schedule inventory exceeds the requested limit");
    const slots: DueScheduleSlot[] = inventory.due.map(s => ({ ...s, time_of_day: s.time_of_day ?? "07:00" }));
    const reserved = await reserveScheduleSlots(slots, policy, async (s, next) => {
        signal.throwIfAborted();
        const r = await queryWithin(db.rpc("f09_reserve_schedule_slot", { p_schedule_id: s.id, p_expected_due: s.next_run_at, p_expected_updated_at: s.updated_at, p_next_due: next }), signal);
        if (r.error)
            throw new Error("Slot reservation failed");
        return r.data as number | null;
    });
    result.claimed = reserved.reserved;
    result.skipped = reserved.conflicted + reserved.invalid;
    signal.throwIfAborted();
    let pending = inventory.reserved;
    if (slots.length > 0) {
        // A reservation may have committed even when its response was lost.
        const refreshed = await queryWithin(db.from("erp_report_schedule_runs").select("id").eq("delivery_engine", "f09")
            .eq("status", "failed_retryable").eq("attempt_count", 0).order("id").limit(limit), signal);
        if (refreshed.error)
            throw new Error("Reserved run lookup failed");
        pending = reservedRuns.parse(refreshed.data);
        if (pending.length > limit)
            throw new Error("Reserved runs exceed the requested limit");
    }
    for (const run of pending) {
        signal.throwIfAborted();
        const q = await queryWithin(db.rpc("f09_enqueue_schedule_run", { p_run_id: run.id }), signal);
        if (q.error) {
            result.terminal++;
            continue;
        }
        if (q.data)
            result.queued++;
        else
            result.skipped++;
    }
    });
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
