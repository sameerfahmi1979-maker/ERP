/**
 * ERP DMS AI ORCH.1 — Pipeline Runner
 *
 * Safe step-by-step orchestration utilities.
 * Each step is isolated in try/catch — a failure in one best-effort step
 * does not stop the pipeline or block the review screen.
 *
 * Security rules:
 * - Never log OCR text, prompts, AI responses, content_text, or file content.
 * - Error codes are sanitized — no raw provider stack traces exposed.
 * - All AI calls go through existing DMS provider layer (getDmsAiProvider).
 */

import type {
  DmsAiOrchestrationStepCode,
  DmsAiOrchestrationStepResult,
  DmsAiOrchestrationStatus,
  DmsAiOrchestrationRunResult,
} from "./types";
import { DMS_AI_ORCH_STEPS, DMS_AI_ORCH_PHASE_A_STEPS } from "./types";

// ── Build initial step list ───────────────────────────────────────────────────

/**
 * Returns the initial step array for the post-draft / post-approval pipeline.
 *
 * Phase A informational steps (upload_received, ocr_and_extraction, draft_ready)
 * are marked as "skipped" immediately — they were completed earlier in the pipeline
 * and are not actionable in this best-effort post-approval phase.
 *
 * Phase B actionable steps (content_sync → ready_for_review) start as "pending".
 */
export function buildInitialSteps(): DmsAiOrchestrationStepResult[] {
  const phaseASet = new Set<DmsAiOrchestrationStepCode>(DMS_AI_ORCH_PHASE_A_STEPS);
  return DMS_AI_ORCH_STEPS.map((step) => ({
    step,
    status: phaseASet.has(step)
      ? ("skipped" as const)
      : ("pending" as const),
    ...(phaseASet.has(step) && {
      safeErrorMessage: "Completed in Phase A (upload and OCR extraction).",
    }),
  }));
}

// ── Safe step runner ──────────────────────────────────────────────────────────

/**
 * Runs a single pipeline step safely.
 * - Catches all errors and returns safe error codes.
 * - Measures duration.
 * - Never throws.
 * - Never exposes raw provider errors to step result.
 */
export async function runPipelineStepSafe(
  stepCode: DmsAiOrchestrationStepCode,
  fn: () => Promise<{ success: boolean; error?: string; skipped?: boolean }>
): Promise<DmsAiOrchestrationStepResult> {
  const startedAt = new Date().toISOString();
  const startMs = Date.now();

  try {
    const result = await fn();
    const durationMs = Date.now() - startMs;
    const completedAt = new Date().toISOString();

    if (result.skipped) {
      return {
        step: stepCode,
        status: "skipped",
        startedAt,
        completedAt,
        durationMs,
        safeErrorMessage: result.error ? sanitizePipelineError(result.error) : "Step was skipped.",
      };
    }

    if (!result.success) {
      return {
        step: stepCode,
        status: "failed",
        startedAt,
        completedAt,
        durationMs,
        errorCode: extractErrorCode(result.error ?? ""),
        safeErrorMessage: sanitizePipelineError(result.error ?? "Unknown error."),
      };
    }

    return {
      step: stepCode,
      status: "completed",
      startedAt,
      completedAt,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startMs;
    const completedAt = new Date().toISOString();
    const rawMsg = err instanceof Error ? err.message : String(err);

    return {
      step: stepCode,
      status: "failed",
      startedAt,
      completedAt,
      durationMs,
      errorCode: extractErrorCode(rawMsg),
      safeErrorMessage: sanitizePipelineError(rawMsg),
    };
  }
}

// ── Merge step result into list ───────────────────────────────────────────────

/**
 * Returns a new step array with the given result merged in.
 */
export function mergeStepResult(
  steps: DmsAiOrchestrationStepResult[],
  result: DmsAiOrchestrationStepResult
): DmsAiOrchestrationStepResult[] {
  return steps.map((s) => (s.step === result.step ? result : s));
}

// ── Calculate overall status ──────────────────────────────────────────────────

/**
 * Derives the overall orchestration status from completed step results.
 */
export function calculateOverallStatus(
  steps: DmsAiOrchestrationStepResult[]
): DmsAiOrchestrationStatus {
  const hasAnyFailed = steps.some((s) => s.status === "failed");
  const allCompleted = steps.every(
    (s) => s.status === "completed" || s.status === "skipped"
  );
  const hasAnyCompleted = steps.some((s) => s.status === "completed");

  if (allCompleted && !hasAnyFailed) return "complete";
  if (hasAnyCompleted && hasAnyFailed) return "complete_with_warnings";
  if (hasAnyFailed && !hasAnyCompleted) return "failed";
  return "complete_with_warnings";
}

// ── Build run result ──────────────────────────────────────────────────────────

export function buildRunResult(input: {
  sessionCode: string;
  documentId: number;
  steps: DmsAiOrchestrationStepResult[];
  startMs: number;
}): DmsAiOrchestrationRunResult {
  const { sessionCode, documentId, steps, startMs } = input;
  const durationMs = Date.now() - startMs;
  const orchestrationStatus = calculateOverallStatus(steps);
  const completedStepCount = steps.filter((s) => s.status === "completed").length;
  const failedStepCount = steps.filter((s) => s.status === "failed").length;
  const skippedStepCount = steps.filter((s) => s.status === "skipped").length;

  return {
    sessionCode,
    documentId,
    orchestrationStatus,
    steps,
    durationMs,
    completedStepCount,
    failedStepCount,
    skippedStepCount,
  };
}

// ── Error sanitization ────────────────────────────────────────────────────────

/**
 * Sanitizes a raw error message for safe client display.
 * Strips stack traces, file paths, and any potentially sensitive content.
 * Caps to 200 chars.
 */
export function sanitizePipelineError(rawMsg: string): string {
  const safe = rawMsg
    .replace(/\n.*/g, "") // take only first line
    .replace(/at\s+\w+.*$/g, "") // strip stack frame hints
    .trim()
    .slice(0, 200);

  // Known safe transformations
  if (safe.toLowerCase().includes("not configured")) return "AI provider is not configured.";
  if (safe.toLowerCase().includes("permission")) return "Permission denied for this step.";
  if (safe.toLowerCase().includes("flag") || safe.toLowerCase().includes("disabled")) return "This step is currently disabled.";
  if (safe.toLowerCase().includes("not found")) return "Required data not found.";
  if (safe.toLowerCase().includes("timeout")) return "Step timed out. You can retry it manually.";

  return safe || "Step failed. You can retry it manually.";
}

/**
 * Extracts a safe error code from a raw error message.
 */
export function extractErrorCode(rawMsg: string): string {
  const lower = rawMsg.toLowerCase();
  if (lower.includes("not configured") || lower.includes("provider")) return "provider_not_configured";
  if (lower.includes("flag") || lower.includes("disabled")) return "flag_disabled";
  if (lower.includes("permission")) return "permission_denied";
  if (lower.includes("not found")) return "not_found";
  if (lower.includes("timeout")) return "timeout";
  if (lower.includes("confidential")) return "confidential_restricted";
  return "step_failed";
}
