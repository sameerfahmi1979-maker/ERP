/**
 * OUTPUT.7 (WP11) — Protected internal schedules worker route.
 *
 * POST /api/internal/report-schedules/process
 *
 * Security rules (mirrors /api/internal/dms-ai-jobs/process):
 *   - Requires Authorization: Bearer ${WORKER_SECRET}; 401 otherwise.
 *   - Machine-to-machine only — no user session accepted.
 *   - OUTPUT_SCHEDULES_WORKER_ENABLED must be true to process anything.
 *   - Responses contain operational counts only — no report data, recipient
 *     lists, attachment contents, or secrets.
 *   - GET returns health/queue status only.
 *
 * Trigger options: Vercel/Railway cron, external cron, or manual POST.
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processDueSchedules } from "@/lib/report-center/schedule-worker";
import { isSchedulesWorkerEnabled } from "@/lib/output/feature-flags";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

function verifyWorkerSecret(request: NextRequest): boolean {
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerSecret || workerSecret.trim().length < 32) {
    // Missing or weak secret — block all processing (secret gate).
    return false;
  }
  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) return false;
  return authHeader.slice("Bearer ".length).trim() === workerSecret;
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyWorkerSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = createAdminClient();
    const nowIso = new Date().toISOString();

    const [dueCount, retryableCount, terminalCount, lastRun] = await Promise.all([
      db.from("erp_report_schedules")
        .select("id", { count: "exact", head: true })
        .eq("is_active", true).is("deleted_at", null)
        .not("next_run_at", "is", null).lte("next_run_at", nowIso),
      db.from("erp_report_schedule_runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed_retryable"),
      db.from("erp_report_schedule_runs")
        .select("id", { count: "exact", head: true })
        .eq("status", "failed_terminal"),
      db.from("erp_report_schedule_runs")
        .select("finished_at").not("finished_at", "is", null)
        .order("finished_at", { ascending: false }).limit(1).maybeSingle(),
    ]);

    return NextResponse.json({
      status: "ok",
      workerEnabled: isSchedulesWorkerEnabled(),
      dueSchedules: (dueCount as { count?: number | null }).count ?? 0,
      retryableRuns: (retryableCount as { count?: number | null }).count ?? 0,
      terminalRuns: (terminalCount as { count?: number | null }).count ?? 0,
      lastRunFinishedAt: (lastRun.data as { finished_at?: string } | null)?.finished_at ?? null,
      timestamp: nowIso,
    });
  } catch (err) {
    logger.error("[schedule-worker-route] GET health check failed", { error: String(err) });
    return NextResponse.json({ status: "error", error: "Health check failed." }, { status: 500 });
  }
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  if (!verifyWorkerSecret(request)) {
    logger.warn("[schedule-worker-route] unauthorized request");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isSchedulesWorkerEnabled()) {
    return NextResponse.json({
      claimed: 0, succeeded: 0, skipped: 0, retryScheduled: 0, terminal: 0,
      leasesReaped: 0, durationMs: 0,
      message: "Schedules worker is disabled. Set OUTPUT_SCHEDULES_WORKER_ENABLED=true to enable.",
    });
  }

  let limit = 10;
  let workerId = `schedule-worker-${Date.now()}`;
  try {
    const body = (await request.json()) as { limit?: number; workerId?: string };
    if (typeof body.limit === "number" && body.limit > 0 && body.limit <= 25) limit = body.limit;
    if (typeof body.workerId === "string" && body.workerId.trim()) {
      workerId = body.workerId.trim().slice(0, 64);
    }
  } catch {
    // Body optional.
  }

  logger.info("[schedule-worker-route] processing", { limit, workerId });
  const result = await processDueSchedules({ workerId, limit });
  logger.info("[schedule-worker-route] complete", { ...result });

  return NextResponse.json(result);
}
