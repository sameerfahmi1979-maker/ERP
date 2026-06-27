/**
 * ERP DMS AI Phase 9 — Post-Approve Orchestration Job Handler
 *
 * Handles the post_approve_orchestration job type.
 * Validates the payload, then calls the system-level orchestration pipeline
 * (runDmsAiOrchestrationPostDraftSystem) which uses createAdminClient()
 * and does not require user session cookies.
 *
 * Security rules:
 *   - Called only from the authenticated worker route (WORKER_SECRET verified).
 *   - Does NOT auto-approve or auto-save metadata.
 *   - Does NOT write to ERP target tables.
 *   - All errors are sanitized before storage — no raw stack traces.
 *   - Human-review-first: this fires AFTER a human approval has succeeded.
 */

import type { DmsAiJobHandler, DmsAiJobHandlerResult } from "@/lib/dms/ai-jobs/job-types";
import {
  DMS_AI_JOB_TYPE,
  PostApproveOrchestrationPayloadSchema,
} from "@/lib/dms/ai-jobs/job-types";
import { runDmsAiOrchestrationPostDraftSystem } from "@/lib/dms/orchestration/system-pipeline";

export const postApproveOrchestrationHandler: DmsAiJobHandler = {
  jobType: DMS_AI_JOB_TYPE.POST_APPROVE_ORCHESTRATION,

  async handle(
    payload: Record<string, unknown>
  ): Promise<DmsAiJobHandlerResult> {
    // ── Validate payload ───────────────────────────────────────────────────
    const parsed = PostApproveOrchestrationPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        success:     false,
        errorCode:   "validation_error",
        safeMessage: `Invalid payload: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        retryable:   false,
      };
    }

    const { sessionCode, documentId, uploadSessionId } = parsed.data;

    // ── Run system orchestration pipeline ──────────────────────────────────
    const result = await runDmsAiOrchestrationPostDraftSystem({
      sessionCode,
      documentId,
      uploadSessionId,
    });

    if (!result.success) {
      // Determine if retryable based on error message pattern
      const errMsg = (result.error ?? "").toLowerCase();
      const isRetryable =
        errMsg.includes("timeout") ||
        errMsg.includes("rate limit") ||
        errMsg.includes("unavailable") ||
        errMsg.includes("network") ||
        errMsg.includes("database");

      return {
        success:     false,
        errorCode:   isRetryable ? "provider_timeout" : "unexpected",
        safeMessage: result.error?.slice(0, 200) ?? "Orchestration failed.",
        retryable:   isRetryable,
      };
    }

    const orchData = result.data;
    if (orchData) {
      const status = orchData.orchestrationStatus;
      if (status === "failed") {
        return {
          success:     false,
          errorCode:   "orchestration_failed",
          safeMessage: `Pipeline completed with status: ${status}. All steps failed.`,
          retryable:   true,
        };
      }
    }

    return { success: true };
  },
};
