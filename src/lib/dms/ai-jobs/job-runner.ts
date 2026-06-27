/**
 * ERP DMS AI Phase 9 — Job Runner
 *
 * Provides functions to enqueue, claim, execute, and complete DMS AI jobs.
 * All DB operations use createAdminClient() (service role, bypasses RLS).
 * Server actions wrap these functions with explicit permission checks.
 *
 * Security rules:
 *   - Uses admin client — caller is responsible for prior auth verification.
 *   - Queue payloads store ONLY IDs and control flags (no OCR text, prompts, AI responses).
 *   - Errors are sanitized before storage (no raw stack traces or sensitive data).
 *   - Idempotency keys prevent duplicate job creation.
 *   - Worker secret validated by the worker route before calling processNextDmsAiJobs.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  type EnqueueDmsAiJobInput,
  type DmsAiJobQueueRow,
  type DmsAiJobHandlerResult,
  DMS_AI_JOB_STATUS,
  DMS_AI_ATTEMPT_STATUS,
  JOB_TYPE_MAX_ATTEMPTS,
  isRetryableErrorCode,
} from "./job-types";
import { getDmsAiJobHandler } from "./job-registry";
import { upsertDmsReviewQueueItem, isDmsAiReviewEnabled, type DmsReviewPriority } from "@/lib/dms/review-queue/review-queue-upsert";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface EnqueueResult {
  success:  boolean;
  jobId?:   number;
  skipped?: boolean;
  error?:   string;
}

export interface ProcessResult {
  processed:       number;
  completed:       number;
  failed:          number;
  retryScheduled:  number;
  durationMs:      number;
}

// ── Error sanitization ────────────────────────────────────────────────────────

/**
 * Sanitizes an error to a safe string for storage.
 * Never stores raw stack traces, prompts, OCR text, or API keys.
 */
export function sanitizeJobError(error: unknown): { code: string; message: string } {
  const msg = error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200);
  if (/timeout|ETIMEDOUT/i.test(msg))            return { code: "provider_timeout",    message: "Request timed out." };
  if (/rate.?limit|429/i.test(msg))              return { code: "provider_rate_limit", message: "Rate limit reached." };
  if (/unavailable|503|502/i.test(msg))          return { code: "provider_unavailable", message: "Provider unavailable." };
  if (/network|ECONNREFUSED/i.test(msg))         return { code: "network_error",        message: "Network error." };
  if (/duplicate|unique.*violation/i.test(msg))  return { code: "database_error",       message: "Database constraint violation." };
  if (/not found|404/i.test(msg))                return { code: "document_not_found",   message: "Resource not found." };
  if (/not authenticated|permission denied/i.test(msg)) return { code: "auth_error",   message: "Authentication or permission error." };
  return { code: "unexpected", message: msg };
}

// ── Enqueue ───────────────────────────────────────────────────────────────────

/**
 * Enqueues a new DMS AI job.
 */
export async function enqueueDmsAiJob(input: EnqueueDmsAiJobInput): Promise<EnqueueResult> {
  try {
    const db = createAdminClient();
    const maxAttempts = input.maxAttempts ?? JOB_TYPE_MAX_ATTEMPTS[input.jobType] ?? 3;

    const { data, error } = await db
      .from("dms_ai_job_queue")
      .insert({
        job_type:                  input.jobType,
        job_status:                DMS_AI_JOB_STATUS.QUEUED,
        priority:                  input.priority ?? 100,
        payload_json:              input.payload,
        idempotency_key:           input.idempotencyKey ?? null,
        related_document_id:       input.relatedDocumentId ?? null,
        related_upload_session_id: input.relatedUploadSessionId ?? null,
        related_ai_result_id:      input.relatedAiResultId ?? null,
        related_approve_run_id:    input.relatedApproveRunId ?? null,
        max_attempts:              maxAttempts,
        run_after:                 input.runAfter?.toISOString() ?? new Date().toISOString(),
        created_by:                input.createdBy ?? null,
      })
      .select("id")
      .single();

    if (error || !data) {
      const msg = (error as { message?: string } | null)?.message ?? "DB insert failed";
      logger.warn("[job-runner] enqueueDmsAiJob failed", { jobType: input.jobType, error: msg });
      return { success: false, error: msg.slice(0, 200) };
    }

    const jobId = (data as Record<string, unknown>).id as number;
    logger.info("[job-runner] job enqueued", { jobType: input.jobType, jobId });
    return { success: true, jobId };
  } catch (err) {
    return { success: false, error: sanitizeJobError(err).message };
  }
}

/**
 * Enqueues a DMS AI job with idempotency — if a job with the same key already
 * exists in queued/running/retry_scheduled, returns the existing job ID.
 */
export async function enqueueUniqueDmsAiJob(
  input: EnqueueDmsAiJobInput & { idempotencyKey: string }
): Promise<EnqueueResult> {
  try {
    if (!input.idempotencyKey) {
      return { success: false, error: "idempotencyKey is required for enqueueUniqueDmsAiJob." };
    }

    const db = createAdminClient();

    // Check for existing active job with same idempotency key
    const { data: existing } = await db
      .from("dms_ai_job_queue")
      .select("id, job_status")
      .eq("idempotency_key", input.idempotencyKey)
      .in("job_status", [
        DMS_AI_JOB_STATUS.QUEUED,
        DMS_AI_JOB_STATUS.RUNNING,
        DMS_AI_JOB_STATUS.RETRY_SCHEDULED,
      ])
      .maybeSingle();

    if (existing) {
      const existingRow = existing as Record<string, unknown>;
      logger.info("[job-runner] duplicate job skipped", {
        idempotencyKey: input.idempotencyKey,
        existingJobId:  existingRow.id,
        jobStatus:      existingRow.job_status,
      });
      return { success: true, jobId: existingRow.id as number, skipped: true };
    }

    return await enqueueDmsAiJob(input);
  } catch (err) {
    return { success: false, error: sanitizeJobError(err).message };
  }
}

// ── Process jobs ──────────────────────────────────────────────────────────────

/**
 * Claims and processes up to `limit` jobs using the given worker ID.
 * Called by the protected worker route after WORKER_SECRET verification.
 */
export async function processNextDmsAiJobs(input: {
  limit:    number;
  workerId: string;
}): Promise<ProcessResult> {
  const { limit, workerId } = input;
  const startMs = Date.now();
  let processed = 0, completed = 0, failed = 0, retryScheduled = 0;

  try {
    const db = createAdminClient();

    // Recover stale jobs first
    await db.rpc("recover_stale_dms_ai_jobs", { p_stale_after_minutes: 10 });

    // Claim jobs atomically
    const { data: claimedJobs, error: claimError } = await db.rpc("claim_dms_ai_jobs", {
      p_worker_id: workerId,
      p_limit: limit,
    });

    if (claimError) {
      logger.warn("[job-runner] claim_dms_ai_jobs failed", { error: String(claimError) });
      return { processed, completed, failed, retryScheduled, durationMs: Date.now() - startMs };
    }

    const jobs = (claimedJobs ?? []) as unknown as DmsAiJobQueueRow[];
    processed = jobs.length;

    for (const job of jobs) {
      await runDmsAiJob(job, workerId);

      // Check resulting status
      const { data: updatedJob } = await db
        .from("dms_ai_job_queue")
        .select("job_status")
        .eq("id", job.id)
        .single();

      const status = (updatedJob as Record<string, unknown> | null)?.job_status as string ?? "";
      if (status === DMS_AI_JOB_STATUS.COMPLETED)          completed++;
      else if (status === DMS_AI_JOB_STATUS.FAILED)         failed++;
      else if (status === DMS_AI_JOB_STATUS.RETRY_SCHEDULED) retryScheduled++;
    }
  } catch (err) {
    logger.error("[job-runner] processNextDmsAiJobs error", { error: sanitizeJobError(err).message });
  }

  return { processed, completed, failed, retryScheduled, durationMs: Date.now() - startMs };
}

/**
 * Runs a single claimed job: validates handler, logs attempt, executes, records result.
 */
export async function runDmsAiJob(
  job:      DmsAiJobQueueRow,
  workerId: string
): Promise<void> {
  const db = createAdminClient();
  const attemptNumber  = (job.attempt_count ?? 0) + 1;
  const attemptStartMs = Date.now();
  let attemptId: number | null = null;

  // Create attempt record
  try {
    const { data: attemptRow } = await db
      .from("dms_ai_job_attempts")
      .insert({
        job_id:         job.id,
        attempt_number: attemptNumber,
        status:         DMS_AI_ATTEMPT_STATUS.RUNNING,
        worker_id:      workerId,
      })
      .select("id")
      .single();
    if (attemptRow) {
      attemptId = (attemptRow as Record<string, unknown>).id as number;
    }
  } catch {
    // Attempt logging is non-fatal
  }

  // Find handler
  const handler = getDmsAiJobHandler(job.job_type);
  if (!handler) {
    const errorCode = "handler_not_found";
    const errorMsg  = `No handler registered for job type: ${job.job_type}`;
    await db.rpc("fail_dms_ai_job", {
      p_job_id:        job.id,
      p_error_code:    errorCode,
      p_error_message: errorMsg,
      p_retry:         false,
    });
    await updateAttemptFailed(db, attemptId, attemptStartMs, errorCode, errorMsg);
    return;
  }

  // Execute handler
  let handlerResult: DmsAiJobHandlerResult;
  try {
    handlerResult = await handler.handle(job.payload_json, {
      jobId:         job.id,
      workerId,
      attemptNumber,
    });
  } catch (err) {
    const { code, message } = sanitizeJobError(err);
    handlerResult = { success: false, errorCode: code, safeMessage: message, retryable: true };
  }

  if (handlerResult.success) {
    await db.rpc("complete_dms_ai_job", { p_job_id: job.id });
    await updateAttemptCompleted(db, attemptId, attemptStartMs, handlerResult);
    logger.info("[job-runner] job completed", { jobId: job.id, jobType: job.job_type });
  } else {
    const errorCode   = handlerResult.errorCode ?? "unexpected";
    const safeMessage = handlerResult.safeMessage ?? "Job handler failed.";
    const isRetryable = handlerResult.retryable ?? isRetryableErrorCode(errorCode);
    const canRetry    = isRetryable && (job.attempt_count + 1) < job.max_attempts;

    await db.rpc("fail_dms_ai_job", {
      p_job_id:        job.id,
      p_error_code:    errorCode,
      p_error_message: safeMessage,
      p_retry:         canRetry,
    });
    await updateAttemptFailed(db, attemptId, attemptStartMs, errorCode, safeMessage);
    logger.warn("[job-runner] job failed", { jobId: job.id, jobType: job.job_type, errorCode, canRetry });

    // ── Phase 12: Non-fatal review queue hook for permanent failures ─────────
    // Only triggers when job is permanently failed (no more retries).
    if (!canRetry) {
      try {
        const reviewEnabled = await isDmsAiReviewEnabled();
        if (reviewEnabled) {
          // Determine review type: semantic failures use semantic_index_review; others use ai_job_failure_review
          const isSemantic = job.job_type === "semantic_document_index";

          const JOB_PRIORITY: Record<string, DmsReviewPriority> = {
            post_approve_orchestration: "high",
            ocr_backfill:               "high",
            semantic_document_index:    "low",
            ai_summary:                 "normal",
            ai_intelligence:            "normal",
            embedding:                  "normal",
            tag_suggestions:            "low",
            link_suggestions:           "low",
          };
          const priority: DmsReviewPriority = JOB_PRIORITY[job.job_type] ?? "normal";

          await upsertDmsReviewQueueItem({
            idempotencyKey:  isSemantic
              ? `semantic_doc:${job.related_document_id ?? job.id}`
              : `ai_job:${job.id}`,
            reviewType:      isSemantic ? "semantic_index_review" : "ai_job_failure_review",
            sourceType:      isSemantic ? "semantic" : "ai_job",
            sourceId:        String(job.id),
            documentId:      job.related_document_id ?? null,
            aiJobId:         job.id,
            reasonCode:      errorCode,
            reasonMessage:   `Job ${job.id} (${job.job_type}) permanently failed: ${safeMessage.slice(0, 200)}`,
            priority,
            payloadJson: {
              job_id:               job.id,
              job_type:             job.job_type,
              error_code:           errorCode,
              related_document_id:  job.related_document_id ?? null,
            },
          });
        }
      } catch (hookErr) {
        logger.warn("[job-runner] review queue hook failed (non-fatal)", { jobId: job.id, error: String(hookErr).slice(0, 200) });
      }
    }
  }
}

// ── Attempt helpers ───────────────────────────────────────────────────────────

async function updateAttemptCompleted(
  db: ReturnType<typeof createAdminClient>,
  attemptId: number | null,
  startMs: number,
  result?: Pick<DmsAiJobHandlerResult, "usageLogId" | "inputTokenCount" | "outputTokenCount" | "modelName" | "providerCode" | "estimatedCost">
): Promise<void> {
  if (!attemptId) return;
  try {
    await db.from("dms_ai_job_attempts").update({
      status:         DMS_AI_ATTEMPT_STATUS.COMPLETED,
      completed_at:   new Date().toISOString(),
      duration_ms:    Date.now() - startMs,
      usage_log_id:   result?.usageLogId ?? null,
      token_count_in: result?.inputTokenCount ?? null,
      token_count_out: result?.outputTokenCount ?? null,
      model_name:     result?.modelName ?? null,
      provider_code:  result?.providerCode ?? null,
      cost_estimate:  result?.estimatedCost ?? null,
    }).eq("id", attemptId);
  } catch { /* Non-fatal */ }
}

async function updateAttemptFailed(
  db: ReturnType<typeof createAdminClient>,
  attemptId: number | null,
  startMs: number,
  errorCode: string,
  safeMessage: string
): Promise<void> {
  if (!attemptId) return;
  try {
    await db.from("dms_ai_job_attempts").update({
      status:             DMS_AI_ATTEMPT_STATUS.FAILED,
      completed_at:       new Date().toISOString(),
      duration_ms:        Date.now() - startMs,
      error_code:         errorCode,
      safe_error_message: safeMessage.slice(0, 500),
    }).eq("id", attemptId);
  } catch { /* Non-fatal */ }
}
