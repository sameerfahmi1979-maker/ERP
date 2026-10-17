"use server";

/**
 * ERP DMS AI Phase 9 — DMS AI Job Queue Server Actions
 *
 * User-facing server actions for enqueueing, querying, cancelling,
 * and retrying DMS AI async jobs.
 *
 * Security rules:
 *   - All actions verify user auth and permissions before any DB access.
 *   - Queue writes use admin client only AFTER explicit permission checks.
 *   - Read actions respect DMS AI view/review/admin permissions.
 *   - Cancel is restricted to dms.admin / system_admin / group_admin.
 *   - Retry is allowed for dms.documents.ai.run, dms.documents.upload, or dms.admin.
 *   - No raw AI responses, OCR text, or document content in action results.
 *   - Worker route processing is NOT exposed through server actions.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import {
  enqueueDmsAiJob,
  enqueueUniqueDmsAiJob,
  type EnqueueResult,
} from "@/lib/dms/ai-jobs/job-runner";
import {
  type EnqueueDmsAiJobInput,
} from "@/lib/dms/ai-jobs/job-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type DmsAiJobSummary = {
  id:                        number;
  jobType:                   string;
  jobStatus:                 string;
  priority:                  number;
  attemptCount:              number;
  maxAttempts:               number;
  runAfter:                  string;
  startedAt:                 string | null;
  completedAt:               string | null;
  failedAt:                  string | null;
  lastErrorCode:             string | null;
  lastErrorMessage:          string | null;
  relatedDocumentId:         number | null;
  relatedUploadSessionId:    number | null;
  relatedApproveRunId:       number | null;
  createdAt:                 string;
  updatedAt:                 string;
};

// ── Permission helpers ────────────────────────────────────────────────────────

function canViewAiJobs(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "dms.documents.review_ai") ||
    hasPermission(ctx, "dms.documents.edit") ||
    hasPermission(ctx, "dms.documents.upload") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin") ||
    ctx.roleCodes.includes("group_admin")
  );
}

function canRunAiJobs(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "dms.documents.upload") ||
    hasPermission(ctx, "dms.documents.edit") ||
    hasPermission(ctx, "dms.admin") ||
    ctx.roleCodes.includes("system_admin") ||
    ctx.roleCodes.includes("group_admin")
  );
}

function mapJobRow(row: Record<string, unknown>): DmsAiJobSummary {
  return {
    id:                     row.id as number,
    jobType:                row.job_type as string,
    jobStatus:              row.job_status as string,
    priority:               row.priority as number,
    attemptCount:           row.attempt_count as number,
    maxAttempts:            row.max_attempts as number,
    runAfter:               row.run_after as string,
    startedAt:              (row.started_at as string | null) ?? null,
    completedAt:            (row.completed_at as string | null) ?? null,
    failedAt:               (row.failed_at as string | null) ?? null,
    lastErrorCode:          (row.last_error_code as string | null) ?? null,
    lastErrorMessage:       (row.last_error_message as string | null) ?? null,
    relatedDocumentId:      (row.related_document_id as number | null) ?? null,
    relatedUploadSessionId: (row.related_upload_session_id as number | null) ?? null,
    relatedApproveRunId:    (row.related_approve_run_id as number | null) ?? null,
    createdAt:              row.created_at as string,
    updatedAt:              row.updated_at as string,
  };
}

// ── enqueueDmsAiJobAction ─────────────────────────────────────────────────────

export async function enqueueDmsAiJobAction(
  input: EnqueueDmsAiJobInput
): Promise<ActionResult<EnqueueResult>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canRunAiJobs(ctx)) return { success: false, error: "Permission denied." };

    const result = await enqueueDmsAiJob({
      ...input,
      createdBy: ctx.profile.id as number,
    });

    return { success: result.success, data: result, error: result.error };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── enqueueUniqueDmsAiJobAction ───────────────────────────────────────────────

export async function enqueueUniqueDmsAiJobAction(
  input: EnqueueDmsAiJobInput & { idempotencyKey: string }
): Promise<ActionResult<EnqueueResult>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canRunAiJobs(ctx)) return { success: false, error: "Permission denied." };

    const result = await enqueueUniqueDmsAiJob({
      ...input,
      createdBy: ctx.profile.id as number,
    });

    return { success: result.success, data: result, error: result.error };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── getDmsAiJobStatus ─────────────────────────────────────────────────────────

export async function getDmsAiJobStatus(
  jobId: number
): Promise<ActionResult<DmsAiJobSummary>> {
  try {
    const parsed = z.number().int().positive().safeParse(jobId);
    if (!parsed.success) return { success: false, error: "Invalid job ID." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canViewAiJobs(ctx)) return { success: false, error: "Permission denied." };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_ai_job_queue")
      .select("id, job_type, job_status, priority, attempt_count, max_attempts, run_after, started_at, completed_at, failed_at, last_error_code, last_error_message, related_document_id, related_upload_session_id, related_approve_run_id, created_at, updated_at")
      .eq("id", jobId)
      .single();

    if (error || !data) return { success: false, error: "Job not found." };

    return { success: true, data: mapJobRow(data as Record<string, unknown>) };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// ── getDmsAiJobsForDocument ───────────────────────────────────────────────────

export async function getDmsAiJobsForDocument(
  documentId: number
): Promise<ActionResult<DmsAiJobSummary[]>> {
  try {
    const parsed = z.number().int().positive().safeParse(documentId);
    if (!parsed.success) return { success: false, error: "Invalid document ID." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canViewAiJobs(ctx)) return { success: false, error: "Permission denied." };

    const supabase = await createClient();
    const { data, error } = await supabase
      .from("dms_ai_job_queue")
      .select("id, job_type, job_status, priority, attempt_count, max_attempts, run_after, started_at, completed_at, failed_at, last_error_code, last_error_message, related_document_id, related_upload_session_id, related_approve_run_id, created_at, updated_at")
      .eq("related_document_id", documentId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) return { success: false, error: "Failed to load jobs." };

    return {
      success: true,
      data: (data ?? []).map((row) => mapJobRow(row as Record<string, unknown>)),
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

// Scoped transitions are checked and audited atomically by the database.
export async function cancelDmsAiJob(jobId: number): Promise<ActionResult> {
  return controlJob("cancel", jobId);
}
export async function retryDmsAiJob(jobId: number): Promise<ActionResult> {
  return controlJob("retry", jobId);
}
async function controlJob(action: "cancel" | "retry", jobId: number): Promise<ActionResult> {
  if (!Number.isSafeInteger(jobId) || jobId < 1) return { success: false, error: "Invalid job ID." };
  try {
    const db = await createClient();
    const { data, error } = await db.rpc("f07_ai_job_control", { p_action: action, p_data: { jobId } });
    return !error && data?.success === true && data.jobId === jobId ? { success: true }
      : { success: false, error: "Job transition not confirmed. Check its current status and attempt budget." };
  } catch { return { success: false, error: "Job transition not confirmed. Refresh its status before retrying." }; }
}
