/**
 * DMS AI Phase 4 — Approve Run Event and Audit Helpers
 *
 * Manages dms_approve_runs lifecycle:
 *   create → storage_copied → db_committed (by RPC) → completed
 *                           → failed (on any failure)
 *
 * Rules:
 *  - No OCR text, prompts, or raw field values are stored.
 *  - Only IDs, counts, status, and sanitized error messages are logged.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { logger } from "@/lib/logger";

// ── Stage constants ───────────────────────────────────────────────────────────

export const APPROVE_STAGE = {
  STARTED: "approve_save_started",
  VALIDATION_PASSED: "approve_save_validation_passed",
  STORAGE_COPIED: "approve_save_storage_copied",
  DB_STARTED: "approve_save_db_transaction_started",
  DB_COMPLETED: "approve_save_db_transaction_completed",
  POST_COMMIT_STARTED: "approve_save_post_commit_started",
  COMPLETED: "approve_save_completed",
  FAILED: "approve_save_failed",
  RETRY: "approve_save_retry",
  ALREADY_APPROVED: "approve_save_already_approved",
  CLEANUP_FAILED: "approve_save_failed_storage_cleanup",
} as const;

export type ApproveStage = (typeof APPROVE_STAGE)[keyof typeof APPROVE_STAGE];

export const APPROVE_STATUS = {
  STARTED: "started",
  STORAGE_COPIED: "storage_copied",
  DB_COMMITTED: "db_committed",
  COMPLETED: "completed",
  FAILED: "failed",
  FAILED_STORAGE_CLEANUP: "failed_storage_cleanup",
  ALREADY_APPROVED: "already_approved",
} as const;

// ── Sanitize error ────────────────────────────────────────────────────────────

export function sanitizeApproveError(err: unknown): {
  code: string;
  message: string;
} {
  const raw = String(err ?? "Unknown error");
  // Truncate long messages and strip anything that looks like raw data
  const safeMessage = raw
    .replace(/\{[^}]*\}/g, "[data]")
    .slice(0, 500);
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as Record<string, unknown>).code ?? "UNKNOWN")
      : "UNKNOWN";
  return { code: code.slice(0, 50), message: safeMessage };
}

// ── Approve run CRUD ──────────────────────────────────────────────────────────

export interface CreateApproveRunParams {
  uploadSessionId: number;
  aiResultId: number | null;
  runKey: string;
  startedBy: number;
}

export async function createApproveRun(
  supabase: SupabaseClient,
  params: CreateApproveRunParams
): Promise<number | null> {
  try {
    const { data, error } = await supabase
      .from("dms_approve_runs")
      .insert({
        upload_session_id: params.uploadSessionId,
        ai_result_id: params.aiResultId ?? null,
        run_key: params.runKey,
        status: APPROVE_STATUS.STARTED,
        stage: APPROVE_STAGE.STARTED,
        started_by: params.startedBy,
        started_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !data) {
      logger.warn("[approve-run] failed to create approve run", {
        uploadSessionId: params.uploadSessionId,
        error: error?.message,
      });
      return null;
    }
    return data.id as number;
  } catch (err) {
    logger.warn("[approve-run] createApproveRun exception", { err: String(err) });
    return null;
  }
}

export async function updateApproveRunStage(
  supabase: SupabaseClient,
  runId: number | null,
  status: string,
  stage: string,
  extra?: {
    documentId?: number | null;
    finalStorageBucket?: string | null;
    finalStoragePath?: string | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    metadata?: Record<string, unknown>;
    completedAt?: string;
  }
): Promise<void> {
  if (!runId) return;
  try {
    const now = new Date().toISOString();
    const update: Record<string, unknown> = {
      status,
      stage,
      updated_at: now,
    };
    if (extra?.documentId !== undefined) update.document_id = extra.documentId ?? null;
    if (extra?.finalStorageBucket !== undefined) update.final_storage_bucket = extra.finalStorageBucket ?? null;
    if (extra?.finalStoragePath !== undefined) update.final_storage_path = extra.finalStoragePath ?? null;
    if (extra?.errorCode !== undefined) update.error_code = extra.errorCode ?? null;
    if (extra?.errorMessage !== undefined) update.error_message = extra.errorMessage ?? null;
    if (extra?.completedAt) update.completed_at = extra.completedAt;
    if (extra?.metadata) {
      update.metadata_json = extra.metadata;
    }

    await supabase.from("dms_approve_runs").update(update).eq("id", runId);
  } catch (err) {
    logger.warn("[approve-run] updateApproveRunStage exception", { runId, err: String(err) });
  }
}

export async function recordApproveRunOnSession(
  supabase: SupabaseClient,
  uploadSessionId: number,
  runId: number | null,
  status: string,
  errorMessage?: string | null
): Promise<void> {
  try {
    const update: Record<string, unknown> = {
      approve_status: status,
      updated_at: new Date().toISOString(),
    };
    if (runId != null) update.approve_run_id = runId;
    if (errorMessage !== undefined) update.approve_error = errorMessage?.slice(0, 500) ?? null;

    await supabase.from("dms_upload_sessions").update(update).eq("id", uploadSessionId);
  } catch (err) {
    logger.warn("[approve-run] recordApproveRunOnSession exception", { uploadSessionId, err: String(err) });
  }
}
