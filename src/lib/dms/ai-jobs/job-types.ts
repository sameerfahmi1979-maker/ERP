/**
 * ERP DMS AI Phase 9 — Job Queue Types
 *
 * Central type registry for all DMS AI async job types.
 *
 * Security rules:
 *   - Payload schemas MUST NOT include OCR text, AI prompts, raw AI responses,
 *     document content, file contents, API keys, or full extracted field values.
 *   - Payloads contain only IDs, codes, and small control flags.
 */

import { z } from "zod";

// ── Job type constants ────────────────────────────────────────────────────────

export const DMS_AI_JOB_TYPE = {
  POST_APPROVE_ORCHESTRATION: "post_approve_orchestration",
  CONTENT_SYNC:               "content_sync",
  AI_SUMMARY:                 "ai_summary",
  AI_INTELLIGENCE:            "ai_intelligence",
  EMBEDDING:                  "embedding",
  TAG_SUGGESTIONS:            "tag_suggestions",
  LINK_SUGGESTIONS:           "link_suggestions",
  // Phase 10B — queue-backed admin OCR backfill:
  OCR_BACKFILL:               "ocr_backfill",
  // Phase 11 — chunk-level semantic indexing:
  SEMANTIC_DOCUMENT_INDEX:    "semantic_document_index",
} as const;

export type DmsAiJobType = typeof DMS_AI_JOB_TYPE[keyof typeof DMS_AI_JOB_TYPE];

// ── Job status ────────────────────────────────────────────────────────────────

export const DMS_AI_JOB_STATUS = {
  QUEUED:            "queued",
  RUNNING:           "running",
  RETRY_SCHEDULED:   "retry_scheduled",
  COMPLETED:         "completed",
  FAILED:            "failed",
  CANCELLED:         "cancelled",
  SUPERSEDED:        "superseded",
} as const;

export type DmsAiJobStatus = typeof DMS_AI_JOB_STATUS[keyof typeof DMS_AI_JOB_STATUS];

// ── Attempt status ────────────────────────────────────────────────────────────

export const DMS_AI_ATTEMPT_STATUS = {
  RUNNING:    "running",
  COMPLETED:  "completed",
  FAILED:     "failed",
  TIMED_OUT:  "timed_out",
} as const;

export type DmsAiAttemptStatus = typeof DMS_AI_ATTEMPT_STATUS[keyof typeof DMS_AI_ATTEMPT_STATUS];

// ── Queue row type (mirrors DB schema) ───────────────────────────────────────

export interface DmsAiJobQueueRow {
  id:                        number;
  job_type:                  string;
  job_status:                string;
  priority:                  number;
  payload_json:              Record<string, unknown>;
  idempotency_key:           string | null;
  related_document_id:       number | null;
  related_upload_session_id: number | null;
  related_ai_result_id:      number | null;
  related_approve_run_id:    number | null;
  attempt_count:             number;
  max_attempts:              number;
  locked_by:                 string | null;
  locked_at:                 string | null;
  run_after:                 string;
  started_at:                string | null;
  completed_at:              string | null;
  failed_at:                 string | null;
  last_error_code:           string | null;
  last_error_message:        string | null;
  safe_error_json:           Record<string, unknown> | null;
  created_by:                number | null;
  created_at:                string;
  updated_at:                string;
}

// ── Attempt row type ──────────────────────────────────────────────────────────

export interface DmsAiJobAttemptRow {
  id:                number;
  job_id:            number;
  attempt_number:    number;
  started_at:        string;
  completed_at:      string | null;
  status:            string;
  duration_ms:       number | null;
  error_code:        string | null;
  safe_error_message: string | null;
  worker_id:         string | null;
  usage_log_id:      number | null;
  token_count_in:    number | null;
  token_count_out:   number | null;
  model_name:        string | null;
  provider_code:     string | null;
  cost_estimate:     number | null;
}

// ── Job handler result ────────────────────────────────────────────────────────

export interface DmsAiJobHandlerResult {
  success:     boolean;
  errorCode?:  string;
  safeMessage?: string;
  /** Whether this error is retryable (defaults true for unexpected errors) */
  retryable?:  boolean;
  /** Phase 14 — Optional observability fields. Handlers may return these to wire job-attempt usage columns. */
  usageLogId?:        number | null;
  inputTokenCount?:   number | null;
  outputTokenCount?:  number | null;
  modelName?:         string | null;
  providerCode?:      string | null;
  estimatedCost?:     number | null;
}

// ── Enqueue input ─────────────────────────────────────────────────────────────

export interface EnqueueDmsAiJobInput {
  jobType:                   DmsAiJobType;
  payload:                   Record<string, unknown>;
  idempotencyKey?:           string;
  priority?:                 number;
  maxAttempts?:              number;
  relatedDocumentId?:        number;
  relatedUploadSessionId?:   number;
  relatedAiResultId?:        number;
  relatedApproveRunId?:      number;
  runAfter?:                 Date;
  createdBy?:                number;
}

// ── Handler type ──────────────────────────────────────────────────────────────

export interface DmsAiJobHandlerCtx {
  jobId:         number;
  workerId:      string;
  attemptNumber: number;
}

export type DmsAiJobHandler = {
  jobType: DmsAiJobType;
  handle(
    payload: Record<string, unknown>,
    ctx?:    DmsAiJobHandlerCtx
  ): Promise<DmsAiJobHandlerResult>;
};

// ── Payload schemas ───────────────────────────────────────────────────────────

/**
 * POST_APPROVE_ORCHESTRATION payload.
 * References only IDs + control codes. No document content.
 */
export const PostApproveOrchestrationPayloadSchema = z.object({
  sessionCode:     z.string().min(1),
  documentId:      z.number().int().positive(),
  uploadSessionId: z.number().int().positive(),
  approveRunId:    z.number().int().positive(),
  source:          z.enum(["single_file_approve", "batch_finalize"]),
});

export type PostApproveOrchestrationPayload = z.infer<typeof PostApproveOrchestrationPayloadSchema>;

/** Single-document step payloads (future use, defined for registry completeness) */
export const SingleDocumentPayloadSchema = z.object({
  documentId:      z.number().int().positive(),
  uploadSessionId: z.number().int().positive().optional(),
});

export type SingleDocumentPayload = z.infer<typeof SingleDocumentPayloadSchema>;

/**
 * OCR_BACKFILL payload.
 * References only file/document IDs + small control flags.
 * Never contains OCR text, prompts, raw provider responses, or API keys.
 */
export const OcrBackfillPayloadSchema = z.object({
  fileId:     z.number().int().positive(),
  documentId: z.number().int().positive(),
  forceRetry: z.boolean().optional().default(false),
  source:     z.enum(["admin_backfill", "manual_admin_retry"]).default("admin_backfill"),
});

export type OcrBackfillPayload = z.infer<typeof OcrBackfillPayloadSchema>;

/**
 * SEMANTIC_DOCUMENT_INDEX payload.
 * Phase 11 — chunk-level semantic indexing for a single document.
 * References only IDs + control codes. Never contains content/chunk text.
 */
export const SemanticDocumentIndexPayloadSchema = z.object({
  documentId:   z.number().int().positive(),
  source:       z.enum([
    "post_approve_orchestration",
    "admin_backfill",
    "manual_rebuild",
    "content_sync_trigger",
  ]),
  forceRebuild: z.boolean().optional().default(false),
});

export type SemanticDocumentIndexPayload = z.infer<typeof SemanticDocumentIndexPayloadSchema>;

/** Per-job-type max attempts */
export const JOB_TYPE_MAX_ATTEMPTS: Record<DmsAiJobType, number> = {
  post_approve_orchestration: 3,
  content_sync:               2,
  ai_summary:                 3,
  ai_intelligence:            2,
  embedding:                  2,
  tag_suggestions:            2,
  link_suggestions:           2,
  ocr_backfill:               3,
  semantic_document_index:    3,
};

/** Retryable error codes (all others are non-retryable — fail permanently) */
export const RETRYABLE_ERROR_CODES = new Set([
  "provider_timeout",
  "provider_rate_limit",
  "provider_unavailable",
  "network_error",
  "database_error",
  "stale_lock",
  "unexpected",
]);

export function isRetryableErrorCode(code: string): boolean {
  return RETRYABLE_ERROR_CODES.has(code);
}
