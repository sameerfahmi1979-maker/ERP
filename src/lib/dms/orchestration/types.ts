/**
 * ERP DMS AI ORCH.1 — One-Click Upload & Full AI Processing Pipeline
 *
 * Types and constants for the DMS AI orchestration pipeline.
 *
 * Security rules:
 * - orchestration_steps_json NEVER contains OCR text, prompts, AI responses,
 *   content_text, file content, API keys, or sensitive extracted values.
 * - Only safe metadata: step code, status, timestamps, duration, error code.
 */

// ── Step codes ─────────────────────────────────────────────────────────────────

export const DMS_AI_ORCH_STEPS = [
  "upload_received",
  "ocr_and_extraction",
  "draft_ready",
  "content_sync",
  "ai_summary",
  "intelligence",
  "embedding",
  "tag_suggestions",
  "link_suggestions",
  "ready_for_review",
] as const;

export type DmsAiOrchestrationStepCode = (typeof DMS_AI_ORCH_STEPS)[number];

/**
 * Phase A informational steps: completed during upload and OCR phase.
 * These should be marked "skipped" in the post-approval orchestration run
 * because they were already completed before the human approval step.
 */
export const DMS_AI_ORCH_PHASE_A_STEPS: ReadonlyArray<DmsAiOrchestrationStepCode> = [
  "upload_received",
  "ocr_and_extraction",
  "draft_ready",
];

/** Best-effort steps that may be retried individually. */
export const DMS_AI_ORCH_BEST_EFFORT_STEPS: ReadonlyArray<DmsAiOrchestrationStepCode> = [
  "content_sync",
  "ai_summary",
  "intelligence",
  "embedding",
  "tag_suggestions",
  "link_suggestions",
];

// ── Step status ────────────────────────────────────────────────────────────────

export type DmsAiOrchestrationStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "skipped"
  | "failed";

// ── Overall orchestration status ──────────────────────────────────────────────

export type DmsAiOrchestrationStatus =
  | "pending"              // not yet started
  | "queued"               // Phase 9: enqueued in async job queue, worker will process
  | "running"              // pipeline in progress
  | "complete"             // all steps completed
  | "complete_with_warnings" // some best-effort steps failed
  | "failed"               // critical step failed
  | "skipped_feature_disabled"; // DMS_AI_ORCHESTRATION flag is off

// ── Per-step result ───────────────────────────────────────────────────────────

/**
 * Safe per-step result stored in orchestration_steps_json.
 * NEVER includes content: no OCR text, prompts, AI responses, file data.
 */
export interface DmsAiOrchestrationStepResult {
  step: DmsAiOrchestrationStepCode;
  status: DmsAiOrchestrationStepStatus;
  startedAt?: string;
  completedAt?: string;
  durationMs?: number;
  /** Safe error code only (e.g., "provider_not_configured", "flag_disabled"). */
  errorCode?: string;
  /** Safe, sanitized user-facing error message. No raw provider error details. */
  safeErrorMessage?: string;
}

// ── Run result ────────────────────────────────────────────────────────────────

export interface DmsAiOrchestrationRunResult {
  sessionCode: string;
  documentId: number;
  orchestrationStatus: DmsAiOrchestrationStatus;
  steps: DmsAiOrchestrationStepResult[];
  durationMs: number;
  completedStepCount: number;
  failedStepCount: number;
  skippedStepCount: number;
}

// ── Status row from DB ────────────────────────────────────────────────────────

export interface DmsAiOrchestrationStatusRow {
  sessionCode: string;
  documentId: number | null;
  orchestrationStatus: DmsAiOrchestrationStatus;
  steps: DmsAiOrchestrationStepResult[];
  orchestrationStartedAt: string | null;
  orchestrationCompletedAt: string | null;
}
