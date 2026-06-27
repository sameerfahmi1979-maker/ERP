/**
 * ERP DMS AI Phase 10B — OCR Backfill Job Handler
 *
 * Handles ocr_backfill job type.
 * Validates the payload, then calls processDmsFileOcrSystem() which:
 *   - Downloads the file from storage using admin client.
 *   - Routes OCR through the Phase 10A three-tier OCR router.
 *   - Persists results through persistFileOcrResult().
 *   - Syncs document content through writeDocumentContentTextSystem() (non-fatal).
 *
 * Security rules:
 *   - Called only from the WORKER_SECRET-authenticated worker route.
 *   - Never logs OCR text, prompts, raw provider responses, or API keys.
 *   - Queue payload stores only IDs + control flags.
 *   - Error messages are sanitized — no raw stack traces or sensitive data.
 *   - Uses performedBy=0 (system/worker context — no user session available).
 */

import type { DmsAiJobHandler, DmsAiJobHandlerResult } from "@/lib/dms/ai-jobs/job-types";
import { DMS_AI_JOB_TYPE, OcrBackfillPayloadSchema } from "@/lib/dms/ai-jobs/job-types";
import { processDmsFileOcrSystem } from "@/lib/dms/ocr/process-file-ocr";

// ── Retryable error codes (must match process-file-ocr.ts set) ────────────────

const RETRYABLE_CODES = new Set([
  "provider_timeout",
  "provider_rate_limit",
  "provider_unavailable",
  "network_error",
  "storage_download_failed",
  "database_error",
  "unexpected",
]);

// ── Handler ────────────────────────────────────────────────────────────────────

export const ocrBackfillHandler: DmsAiJobHandler = {
  jobType: DMS_AI_JOB_TYPE.OCR_BACKFILL,

  async handle(payload: Record<string, unknown>): Promise<DmsAiJobHandlerResult> {
    // ── 1. Validate payload ──────────────────────────────────────────────────
    const parsed = OcrBackfillPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        success:     false,
        errorCode:   "validation_error",
        safeMessage: `Invalid OCR backfill payload: ${parsed.error.issues[0]?.message ?? "unknown"}`,
        retryable:   false,
      };
    }

    const { fileId, documentId, forceRetry } = parsed.data;

    // ── 2. Run system OCR processing ─────────────────────────────────────────
    const result = await processDmsFileOcrSystem({
      fileId,
      documentId,
      forceRetry,
      source:      "admin_backfill",
      performedBy: 0,   // system context — no user session in worker
    });

    // ── 3. Map result ────────────────────────────────────────────────────────
    if (result.success) {
      return { success: true };
    }

    const errorCode   = result.errorCode ?? "ocr_backfill_failed";
    const safeMessage = result.safeMessage ?? "OCR backfill failed.";
    const retryable   = result.retryable ?? RETRYABLE_CODES.has(errorCode);

    return {
      success:     false,
      errorCode,
      safeMessage,
      retryable,
    };
  },
};
