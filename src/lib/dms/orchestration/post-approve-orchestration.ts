/**
 * DMS AI Phase 5 — Post-Approve Orchestration Trigger
 * DMS AI Phase 9 — Queue-or-Inline routing (conditional)
 *
 * Thin abstraction that triggers the DMS AI orchestration pipeline after a
 * successful document approval (single-file or batch draft).
 *
 * Behavior:
 *   - DMS_AI_JOB_QUEUE = false (default): runs inline via runDmsAiOrchestrationPostDraft (Phase 5 behavior)
 *   - DMS_AI_JOB_QUEUE = true: enqueues a post_approve_orchestration job; worker processes async
 *
 * Safety rules:
 *   - Orchestration failure NEVER fails or rolls back document approval.
 *   - OCR text, prompts, and AI responses are never logged here.
 *   - DMS_AI_ORCHESTRATION feature flag is checked inside runDmsAiOrchestrationPostDraft.
 *   - Human-review-first: this only fires after a human-triggered approval succeeds.
 *   - If queue enqueue fails, falls back to inline orchestration (fail-safe).
 *   - Phase 4 approve RPC and approval transaction remain UNCHANGED.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { logAudit } from "@/server/actions/audit";
import { runDmsAiOrchestrationPostDraft } from "@/server/actions/dms/orchestration";
import { enqueueUniqueDmsAiJob } from "@/lib/dms/ai-jobs/job-runner";
import { DMS_AI_JOB_TYPE } from "@/lib/dms/ai-jobs/job-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export type PostApproveOrchestrationInput = {
  sessionCode:     string;
  documentId:      number;
  uploadSessionId: number;
  approveRunId:    number;
  source:          "single_file_approve" | "batch_finalize";
};

export type PostApproveOrchestrationResult = {
  triggered:             boolean;
  orchestrationStatus:   string;
  jobId?:                number;
  skippedReason?:        string;
  error?:                string;
};

// ── Status values that should block a re-trigger ──────────────────────────────

const SKIP_TRIGGER_STATUSES = new Set(["running", "complete", "complete_with_warnings"]);

// ── Feature flag helpers ──────────────────────────────────────────────────────

async function isJobQueueEnabled(): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_AI_JOB_QUEUE")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

// ── Main trigger function ─────────────────────────────────────────────────────

/**
 * Triggers the DMS AI orchestration pipeline after a successful document approval.
 *
 * Phase 9 behavior:
 *   - If DMS_AI_JOB_QUEUE = true:
 *       Enqueues post_approve_orchestration job, returns immediately.
 *       Worker processes the pipeline asynchronously.
 *       Falls back to inline if enqueue fails (fail-safe).
 *   - If DMS_AI_JOB_QUEUE = false (default):
 *       Runs inline (exact Phase 5 behavior, unchanged).
 *
 * Always returns a result — never throws.
 */
export async function triggerDmsPostApproveOrchestration(
  input: PostApproveOrchestrationInput
): Promise<PostApproveOrchestrationResult> {
  const { sessionCode, documentId, uploadSessionId, approveRunId, source } = input;

  try {
    if (!sessionCode || !documentId || !uploadSessionId || !approveRunId) {
      return {
        triggered: false,
        orchestrationStatus: "skipped",
        skippedReason: "Missing required input.",
      };
    }

    // ── 1. Check current orchestration status ──────────────────────────────

    const supabase = await createClient();
    const { data: sessionRow } = await supabase
      .from("dms_upload_sessions")
      .select("orchestration_status")
      .eq("session_code", sessionCode)
      .is("deleted_at", null)
      .maybeSingle();

    const currentStatus = (sessionRow as { orchestration_status?: string } | null)?.orchestration_status ?? "pending";

    // ── 2. Guard duplicate runs ────────────────────────────────────────────

    if (SKIP_TRIGGER_STATUSES.has(currentStatus)) {
      await logAudit({
        module_code:      "DMS",
        entity_name:      "dms_upload_sessions",
        entity_id:        uploadSessionId,
        entity_reference: sessionCode,
        action:           "dms_post_approve_orchestration_skipped",
        new_values: {
          sessionCode,
          documentId,
          source,
          approveRunId,
          existingOrchestrationStatus: currentStatus,
        },
      });

      return {
        triggered:           false,
        orchestrationStatus: currentStatus,
        skippedReason: `Orchestration already in state '${currentStatus}' — not re-triggered.`,
      };
    }

    // ── 3. Record source and approve run linkage on session ────────────────

    try {
      await supabase
        .from("dms_upload_sessions")
        .update({
          orchestration_source: source,
          orchestration_triggered_by_approve_run_id: approveRunId,
          updated_at: new Date().toISOString(),
        })
        .eq("session_code", sessionCode)
        .is("deleted_at", null);
    } catch {
      // Non-fatal — columns may not exist in older environments; continue
    }

    // ── 4. Check if queue is enabled ───────────────────────────────────────

    const useQueue = await isJobQueueEnabled();

    if (useQueue) {
      return await triggerViaQueue(input);
    } else {
      return await triggerInline(input);
    }
  } catch (err) {
    const safeMsg = err instanceof Error ? err.message.slice(0, 200) : String(err).slice(0, 200);

    logger.warn("[post-approve-orchestration] trigger failed unexpectedly", {
      sessionCode,
      documentId,
      source,
      error: safeMsg,
    });

    try {
      await logAudit({
        module_code:      "DMS",
        entity_name:      "dms_upload_sessions",
        entity_id:        uploadSessionId,
        entity_reference: sessionCode,
        action:           "dms_post_approve_orchestration_error",
        new_values: { sessionCode, source, safeErrorMessage: safeMsg },
      });
    } catch {
      // Audit log failure is non-fatal
    }

    return {
      triggered:           false,
      orchestrationStatus: "error",
      error:               safeMsg,
    };
  }
}

// ── Queue path ────────────────────────────────────────────────────────────────

async function triggerViaQueue(
  input: PostApproveOrchestrationInput
): Promise<PostApproveOrchestrationResult> {
  const { sessionCode, documentId, uploadSessionId, approveRunId, source } = input;

  const idempotencyKey = `post_approve_orchestration:${uploadSessionId}:${approveRunId}`;

  // Log queue trigger attempt
  await logAudit({
    module_code:      "DMS",
    entity_name:      "dms_documents",
    entity_id:        documentId,
    entity_reference: sessionCode,
    action:           "dms_post_approve_orchestration_queued",
    new_values: {
      sessionCode,
      documentId,
      uploadSessionId,
      approveRunId,
      source,
      idempotencyKey,
    },
  });

  const enqueueResult = await enqueueUniqueDmsAiJob({
    jobType:                 DMS_AI_JOB_TYPE.POST_APPROVE_ORCHESTRATION,
    payload: {
      sessionCode,
      documentId,
      uploadSessionId,
      approveRunId,
      source,
    },
    idempotencyKey,
    priority:                50,
    relatedDocumentId:       documentId,
    relatedUploadSessionId:  uploadSessionId,
    relatedApproveRunId:     approveRunId,
  });

  if (!enqueueResult.success) {
    // Enqueue failed — fall back to inline to preserve approval quality
    logger.warn("[post-approve-orchestration] queue enqueue failed, falling back to inline", {
      sessionCode,
      documentId,
      error: enqueueResult.error,
    });

    return await triggerInline(input);
  }

  if (enqueueResult.skipped) {
    logger.info("[post-approve-orchestration] duplicate job skipped (idempotency)", {
      sessionCode,
      documentId,
      jobId: enqueueResult.jobId,
    });
  }

  return {
    triggered:           true,
    orchestrationStatus: "queued",
    jobId:               enqueueResult.jobId,
  };
}

// ── Inline path (Phase 5 exact behavior) ─────────────────────────────────────

async function triggerInline(
  input: PostApproveOrchestrationInput
): Promise<PostApproveOrchestrationResult> {
  const { sessionCode, documentId, uploadSessionId, approveRunId, source } = input;

  // Audit: trigger start
  await logAudit({
    module_code:      "DMS",
    entity_name:      "dms_documents",
    entity_id:        documentId,
    entity_reference: sessionCode,
    action:           "dms_post_approve_orchestration_triggered",
    new_values: {
      sessionCode,
      documentId,
      uploadSessionId,
      approveRunId,
      source,
    },
  });

  // Run the orchestration pipeline
  const orchResult = await runDmsAiOrchestrationPostDraft({ sessionCode });

  const finalStatus = orchResult.data?.orchestrationStatus ?? (orchResult.success ? "complete" : "failed");

  // Audit: completion
  const auditAction = orchResult.success
    ? "dms_post_approve_orchestration_completed"
    : "dms_post_approve_orchestration_error";

  await logAudit({
    module_code:      "DMS",
    entity_name:      "dms_documents",
    entity_id:        documentId,
    entity_reference: sessionCode,
    action:           auditAction,
    new_values: {
      sessionCode,
      documentId,
      source,
      orchestrationStatus: finalStatus,
      completedSteps:  orchResult.data?.completedStepCount ?? 0,
      failedSteps:     orchResult.data?.failedStepCount ?? 0,
      skippedSteps:    orchResult.data?.skippedStepCount ?? 0,
      durationMs:      orchResult.data?.durationMs ?? 0,
    },
  });

  return {
    triggered:           true,
    orchestrationStatus: finalStatus,
    error:               orchResult.success ? undefined : orchResult.error,
  };
}
