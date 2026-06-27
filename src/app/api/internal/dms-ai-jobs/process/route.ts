/**
 * ERP DMS AI Phase 9 — Protected Internal Worker Route
 *
 * POST /api/internal/dms-ai-jobs/process
 *
 * Processes pending DMS AI jobs from the queue.
 * Protected by WORKER_SECRET environment variable.
 * Also requires DMS_AI_JOB_QUEUE_WORKER_ENABLED feature flag to be true.
 *
 * Security rules:
 *   - Requires Authorization: Bearer ${WORKER_SECRET} header.
 *   - Returns HTTP 401 immediately for missing or invalid secret.
 *   - No user session required or accepted — machine-to-machine only.
 *   - DMS_AI_JOB_QUEUE_WORKER_ENABLED flag must be true to process jobs.
 *   - Does not return raw job payloads, OCR text, prompts, or AI responses.
 *   - GET returns health status only (no job processing).
 *   - Route is under /api/internal — not publicly documented.
 *
 * Trigger options:
 *   - Vercel Cron: add "path": "/api/internal/dms-ai-jobs/process" in vercel.json
 *   - External cron: POST with Authorization header
 *   - Manual trigger: admin POST with Authorization header
 */

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { processNextDmsAiJobs } from "@/lib/dms/ai-jobs/job-runner";
import { logger } from "@/lib/logger";

export const runtime = "nodejs";

// ── Secret verification ───────────────────────────────────────────────────────

function verifyWorkerSecret(request: NextRequest): boolean {
  const workerSecret = process.env.WORKER_SECRET;
  if (!workerSecret || workerSecret.trim() === "") {
    // WORKER_SECRET is not configured — block all processing
    return false;
  }

  const authHeader = request.headers.get("authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return false;
  }

  const providedSecret = authHeader.slice("Bearer ".length).trim();
  return providedSecret === workerSecret;
}

// ── Feature flag check (admin client) ────────────────────────────────────────

async function isWorkerEnabled(): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_AI_JOB_QUEUE_WORKER_ENABLED")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

// ── GET: Health check ─────────────────────────────────────────────────────────

export async function GET(request: NextRequest): Promise<NextResponse> {
  if (!verifyWorkerSecret(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const db = createAdminClient();

    const [queuedCount, runningCount, workerEnabled] = await Promise.all([
      db
        .from("dms_ai_job_queue")
        .select("id", { count: "exact", head: true })
        .in("job_status", ["queued", "retry_scheduled"]),
      db
        .from("dms_ai_job_queue")
        .select("id", { count: "exact", head: true })
        .eq("job_status", "running"),
      isWorkerEnabled(),
    ]);

    return NextResponse.json({
      status:              "ok",
      workerEnabled,
      pendingJobs:         (queuedCount as { count?: number | null }).count ?? 0,
      runningJobs:         (runningCount as { count?: number | null }).count ?? 0,
      timestamp:           new Date().toISOString(),
    });
  } catch (err) {
    logger.error("[worker-route] GET health check failed", { error: String(err) });
    return NextResponse.json({ status: "error", error: "Health check failed." }, { status: 500 });
  }
}

// ── POST: Process jobs ────────────────────────────────────────────────────────

export async function POST(request: NextRequest): Promise<NextResponse> {
  // ── 1. Verify WORKER_SECRET ───────────────────────────────────────────────
  if (!verifyWorkerSecret(request)) {
    logger.warn("[worker-route] unauthorized request — missing or invalid WORKER_SECRET");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Check DMS_AI_JOB_QUEUE_WORKER_ENABLED ─────────────────────────────
  const workerEnabled = await isWorkerEnabled();
  if (!workerEnabled) {
    return NextResponse.json({
      processed:      0,
      completed:      0,
      failed:         0,
      retryScheduled: 0,
      durationMs:     0,
      message:        "Worker is disabled. Set DMS_AI_JOB_QUEUE_WORKER_ENABLED = true to enable.",
    });
  }

  // ── 3. Parse optional parameters ─────────────────────────────────────────
  let limit    = 5;
  let workerId = `worker-${Date.now()}`;

  try {
    const body = await request.json() as { limit?: number; workerId?: string };
    if (typeof body.limit === "number" && body.limit > 0 && body.limit <= 50) {
      limit = body.limit;
    }
    if (typeof body.workerId === "string" && body.workerId.trim()) {
      workerId = body.workerId.trim().slice(0, 64);
    }
  } catch {
    // Body is optional — use defaults
  }

  // ── 4. Process jobs ───────────────────────────────────────────────────────
  logger.info("[worker-route] starting job processing", { limit, workerId });

  const result = await processNextDmsAiJobs({ limit, workerId });

  logger.info("[worker-route] processing complete", { ...result });

  return NextResponse.json({
    processed:      result.processed,
    completed:      result.completed,
    failed:         result.failed,
    retryScheduled: result.retryScheduled,
    durationMs:     result.durationMs,
  });
}
