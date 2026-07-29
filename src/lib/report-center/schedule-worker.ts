/**
 * OUTPUT.7 (WP11) — Schedules processing worker.
 *
 * Invoked exclusively by the authenticated internal route
 * `/api/internal/report-schedules/process` (WORKER_SECRET bearer).
 *
 * Guarantees:
 *  - Run-once per due slot: a run row keyed by UNIQUE
 *    `sched-{scheduleId}-{dueSlotEpoch}` is inserted BEFORE any work; a
 *    concurrent worker hitting the same slot fails the insert and skips.
 *  - Lease/lock: each run row is leased to one worker id with an expiry;
 *    expired leases (crashed workers) are reaped back to retryable.
 *  - Bounded retries: failures are retried with linear backoff up to
 *    max_attempts, then become failed_terminal (visible in the Ops Console).
 *  - No duplicate output/email on retry: only runs still in a retryable state
 *    can be claimed (atomic conditional update); succeeded runs are never
 *    re-executed.
 *  - Output class policy: only analytical/export classes (E/F/G or
 *    unclassified) may be scheduled. Official classes A–D are refused — no
 *    scheduled official issuance or public QR.
 *  - Company scope + permissions: execution impersonates the schedule
 *    creator's permission set (as designed in REPORT.5); reports run
 *    company-scoped through the report runner.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { logAudit } from "@/server/actions/audit";
import {
  executeScheduleRun,
  getCreatorPermissions,
  calculateNextRunAt,
  type ExecutableSchedule,
} from "@/lib/report-center/schedule-execution";
import {
  LEASE_MINUTES,
  buildRunKey,
  retryBackoffMs,
  isSchedulableClass,
  sanitizeFailureReason,
} from "@/lib/report-center/schedule-worker-core";

export interface ScheduleWorkerResult {
  claimed: number;
  succeeded: number;
  skipped: number;
  retryScheduled: number;
  terminal: number;
  leasesReaped: number;
  durationMs: number;
}

type ScheduleRow = ExecutableSchedule & {
  schedule_code: string | null;
  schedule_name: string;
  frequency: "daily" | "weekly" | "monthly";
  day_of_week: number | null;
  day_of_month: number | null;
  time_of_day: string | null;
  timezone: string;
  next_run_at: string;
  report: ExecutableSchedule["report"] & { document_class?: string | null };
};

const SCHEDULE_SELECT = `
  id, schedule_code, schedule_name, created_by, owner_company_id, filters_json,
  selected_template_id, output_format, recipient_to, recipient_cc,
  email_subject_template, email_body_template, frequency, day_of_week,
  day_of_month, time_of_day, timezone, next_run_at,
  report:erp_report_registry(
    id, report_code, report_name_en, required_permissions,
    sensitive_profile, is_active, supports_scheduling, document_class
  )
`;

export async function processDueSchedules(options: {
  workerId: string;
  limit?: number;
}): Promise<ScheduleWorkerResult> {
  const started = Date.now();
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 25);
  const db = createAdminClient();
  const nowIso = new Date().toISOString();

  const result: ScheduleWorkerResult = {
    claimed: 0, succeeded: 0, skipped: 0, retryScheduled: 0, terminal: 0,
    leasesReaped: 0, durationMs: 0,
  };

  // ── 0. Reap expired leases (crashed workers) back to retryable ────────────
  const { data: reaped } = await db
    .from("erp_report_schedule_runs")
    .update({
      status: "failed_retryable",
      failure_reason: "Lease expired (worker did not complete) — recovered for retry.",
      next_attempt_at: nowIso,
      leased_by: null,
      leased_until: null,
    })
    .in("status", ["leased", "running"])
    .lt("leased_until", nowIso)
    .select("id");
  result.leasesReaped = reaped?.length ?? 0;

  // ── 1. New due schedules ───────────────────────────────────────────────────
  const { data: due } = await db
    .from("erp_report_schedules")
    .select(SCHEDULE_SELECT)
    .eq("is_active", true)
    .is("deleted_at", null)
    .not("next_run_at", "is", null)
    .lte("next_run_at", nowIso)
    .order("next_run_at")
    .limit(limit);

  for (const raw of (due ?? []) as unknown as ScheduleRow[]) {
    await processOneDueSchedule(db, raw, options.workerId, result);
  }

  // ── 2. Retryable runs whose backoff has elapsed ───────────────────────────
  const { data: retryable } = await db
    .from("erp_report_schedule_runs")
    .select("id, schedule_id, attempt_count, max_attempts")
    .eq("status", "failed_retryable")
    .lte("next_attempt_at", nowIso)
    .order("next_attempt_at")
    .limit(limit);

  for (const run of retryable ?? []) {
    await processRetry(db, run as { id: number; schedule_id: number; attempt_count: number; max_attempts: number }, options.workerId, result);
  }

  result.durationMs = Date.now() - started;
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────

async function processOneDueSchedule(
  db: ReturnType<typeof createAdminClient>,
  sched: ScheduleRow,
  workerId: string,
  result: ScheduleWorkerResult
): Promise<void> {
  const dueSlot = sched.next_run_at;
  const runKey = buildRunKey(sched.id, dueSlot);

  // ── Claim: idempotent run-once insert. Unique violation = another worker. ──
  const { data: runRow, error: insertErr } = await db
    .from("erp_report_schedule_runs")
    .insert({
      schedule_id: sched.id,
      scheduled_for: dueSlot,
      run_key: runKey,
      status: "leased",
      leased_by: workerId,
      leased_until: new Date(Date.now() + LEASE_MINUTES * 60_000).toISOString(),
    })
    .select("id")
    .single();

  if (insertErr || !runRow) {
    if (insertErr?.code !== "23505") {
      logger.warn(`[schedule-worker] claim failed for schedule ${sched.id}: ${insertErr?.message}`);
    }
    return; // already claimed for this slot — run-once guarantee
  }
  const runId = (runRow as { id: number }).id;
  result.claimed++;

  // ── Advance the schedule immediately so the slot is consumed exactly once ──
  const nextRunAt = calculateNextRunAt(
    sched.frequency, sched.day_of_week, sched.day_of_month,
    sched.time_of_day ?? "07:00", sched.timezone
  );
  await db
    .from("erp_report_schedules")
    .update({ next_run_at: nextRunAt, updated_at: new Date().toISOString() })
    .eq("id", sched.id)
    .eq("next_run_at", dueSlot); // conditional: no-op if another writer advanced it

  // ── Pre-flight validations → skipped (no retry) ───────────────────────────
  const skip = async (reason: string) => {
    await finishRun(db, runId, { status: "skipped", failure_reason: reason });
    await setScheduleStatus(db, sched.id, "skipped");
    await auditRun(sched, runId, "skipped", reason);
    result.skipped++;
  };

  if (!sched.report?.is_active) {
    return skip("Report is inactive.");
  }
  if (!isSchedulableClass(sched.report.document_class)) {
    return skip(
      `Output class ${sched.report.document_class} is an official document class — official issuance and public QR links cannot be scheduled.`
    );
  }
  if (!sched.selected_template_id && sched.owner_company_id === null) {
    return skip("Multi-company report requires template selection.");
  }
  const creatorPermissions = await getCreatorPermissions(db, sched.created_by);
  const missingPerms = (sched.report.required_permissions ?? []).filter(
    (p) => !creatorPermissions.includes(p)
  );
  if (missingPerms.length > 0) {
    return skip(`Schedule creator is missing required permissions: ${missingPerms.join(", ")}`);
  }

  // ── Execute attempt 1 ──────────────────────────────────────────────────────
  await executeAttempt(db, runId, sched, creatorPermissions, 1, 3, result);
}

async function processRetry(
  db: ReturnType<typeof createAdminClient>,
  run: { id: number; schedule_id: number; attempt_count: number; max_attempts: number },
  workerId: string,
  result: ScheduleWorkerResult
): Promise<void> {
  // Atomic conditional claim — a concurrent worker loses and skips.
  const { data: claimed } = await db
    .from("erp_report_schedule_runs")
    .update({
      status: "running",
      leased_by: workerId,
      leased_until: new Date(Date.now() + LEASE_MINUTES * 60_000).toISOString(),
    })
    .eq("id", run.id)
    .eq("status", "failed_retryable")
    .eq("attempt_count", run.attempt_count)
    .select("id");
  if (!claimed || claimed.length === 0) return;

  const { data: schedData } = await db
    .from("erp_report_schedules")
    .select(SCHEDULE_SELECT)
    .eq("id", run.schedule_id)
    .is("deleted_at", null)
    .maybeSingle();

  const sched = schedData as unknown as ScheduleRow | null;
  if (!sched || !sched.report?.is_active) {
    await finishRun(db, run.id, {
      status: "failed_terminal",
      failure_reason: "Schedule or report no longer available — retry abandoned.",
    });
    result.terminal++;
    return;
  }
  // A schedule deactivated after the failure must not keep retrying.
  const { data: activeCheck } = await db
    .from("erp_report_schedules")
    .select("is_active")
    .eq("id", run.schedule_id)
    .single();
  if (!(activeCheck as { is_active?: boolean } | null)?.is_active) {
    await finishRun(db, run.id, {
      status: "failed_terminal",
      failure_reason: "Schedule was deactivated — retry abandoned.",
    });
    result.terminal++;
    return;
  }

  const creatorPermissions = await getCreatorPermissions(db, sched.created_by);
  await executeAttempt(
    db, run.id, sched, creatorPermissions,
    run.attempt_count + 1, run.max_attempts, result
  );
}

async function executeAttempt(
  db: ReturnType<typeof createAdminClient>,
  runId: number,
  sched: ScheduleRow,
  creatorPermissions: string[],
  attemptNo: number,
  maxAttempts: number,
  result: ScheduleWorkerResult
): Promise<void> {
  await db
    .from("erp_report_schedule_runs")
    .update({
      status: "running",
      attempt_count: attemptNo,
      started_at: new Date().toISOString(),
    })
    .eq("id", runId);

  let outcome: Awaited<ReturnType<typeof executeScheduleRun>>;
  try {
    outcome = await executeScheduleRun(sched, creatorPermissions);
  } catch (err) {
    outcome = { success: false, error: err instanceof Error ? err.message : String(err) };
  }

  if (outcome.success) {
    await finishRun(db, runId, {
      status: "succeeded",
      report_run_id: outcome.reportRunId ?? null,
      delivery_log_id: outcome.deliveryLogId ?? null,
      attachment_filename: outcome.attachmentFilename ?? null,
      attachment_size_bytes: outcome.attachmentSizeBytes ?? null,
      recipient_count: outcome.recipientCount ?? null,
      failure_reason: null,
    });
    await setScheduleStatus(db, sched.id, "success");
    await auditRun(sched, runId, "succeeded", `Delivered on attempt ${attemptNo}.`);
    result.succeeded++;
    return;
  }

  const reason = sanitizeFailureReason(outcome.error ?? "Unknown failure.");
  if (attemptNo >= maxAttempts) {
    await finishRun(db, runId, {
      status: "failed_terminal",
      delivery_log_id: outcome.deliveryLogId ?? null,
      failure_reason: `Attempt ${attemptNo}/${maxAttempts}: ${reason}`,
    });
    await setScheduleStatus(db, sched.id, "failed");
    await auditRun(sched, runId, "failed_terminal", reason);
    result.terminal++;
  } else {
    await db
      .from("erp_report_schedule_runs")
      .update({
        status: "failed_retryable",
        delivery_log_id: outcome.deliveryLogId ?? null,
        failure_reason: `Attempt ${attemptNo}/${maxAttempts}: ${reason}`,
        next_attempt_at: new Date(Date.now() + retryBackoffMs(attemptNo)).toISOString(),
        leased_by: null,
        leased_until: null,
      })
      .eq("id", runId);
    await setScheduleStatus(db, sched.id, "failed");
    await auditRun(sched, runId, "failed_retryable", reason);
    result.retryScheduled++;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Small helpers
// ─────────────────────────────────────────────────────────────────────────────

async function finishRun(
  db: ReturnType<typeof createAdminClient>,
  runId: number,
  patch: Record<string, unknown>
): Promise<void> {
  await db
    .from("erp_report_schedule_runs")
    .update({
      ...patch,
      finished_at: new Date().toISOString(),
      leased_by: null,
      leased_until: null,
    })
    .eq("id", runId);
}

async function setScheduleStatus(
  db: ReturnType<typeof createAdminClient>,
  scheduleId: number,
  status: "success" | "failed" | "skipped"
): Promise<void> {
  await db
    .from("erp_report_schedules")
    .update({
      last_run_at: new Date().toISOString(),
      last_status: status,
      updated_at: new Date().toISOString(),
    })
    .eq("id", scheduleId);
}

async function auditRun(
  sched: ScheduleRow,
  runId: number,
  outcome: string,
  detail: string
): Promise<void> {
  await logAudit({
    module_code: "REPORTS",
    entity_name: "erp_report_schedule_runs",
    entity_id: runId,
    entity_reference: sched.schedule_code ?? String(sched.id),
    action: "update",
    new_values: {
      event: "schedule_worker_run",
      schedule_id: sched.id,
      report_code: sched.report?.report_code,
      outcome,
      detail,
    },
  }).catch(() => {});
}
