/**
 * ERP DMS AI Phase 11 — Semantic Document Index Handler
 *
 * Handles semantic_document_index queue jobs.
 * Validates payload and delegates to indexDmsDocumentSemantically().
 *
 * Security rules:
 *   - Only invoked by the authenticated worker route (WORKER_SECRET verified).
 *   - Never logs chunk text, content text, prompts, or provider responses.
 *   - Retries provider/network/temporary errors.
 *   - Does not retry no_content/provider_disabled/validation errors.
 */

import type { DmsAiJobHandler, DmsAiJobHandlerResult } from "../job-types";
import { DMS_AI_JOB_TYPE, SemanticDocumentIndexPayloadSchema } from "../job-types";
import { indexDmsDocumentSemantically } from "@/lib/dms/semantic/semantic-indexer";
import type { SemanticDocumentIndexInput } from "@/lib/dms/semantic/semantic-indexer";

const NON_RETRYABLE_ERROR_CODES = new Set([
  "no_content",
  "provider_disabled",
  "validation_error",
  "dimension_mismatch",
  "document_not_found",
]);

export const semanticDocumentIndexHandler: DmsAiJobHandler = {
  jobType: DMS_AI_JOB_TYPE.SEMANTIC_DOCUMENT_INDEX,

  async handle(payload: Record<string, unknown>): Promise<DmsAiJobHandlerResult> {
    // ── Validate payload ────────────────────────────────────────────────────────
    const parsed = SemanticDocumentIndexPayloadSchema.safeParse(payload);
    if (!parsed.success) {
      return {
        success:      false,
        errorCode:    "validation_error",
        safeMessage:  "Invalid semantic_document_index payload.",
        retryable:    false,
      };
    }

    const { documentId, source, forceRebuild } = parsed.data;

    // ── Delegate to semantic indexer ────────────────────────────────────────────
    const result = await indexDmsDocumentSemantically({
      documentId,
      source: source as SemanticDocumentIndexInput["source"],
      forceRebuild,
    });

    if (result.success) {
      return {
        success:     true,
        safeMessage: `${result.status}: ${result.chunksCreated} chunks, ${result.chunksEmbedded} embedded, ${result.pendingRemaining} pending.`,
      };
    }

    const isRetryable = !NON_RETRYABLE_ERROR_CODES.has(result.errorCode ?? "");

    return {
      success:      false,
      errorCode:    result.errorCode ?? "unexpected",
      safeMessage:  result.safeMessage ?? "Semantic indexing failed.",
      retryable:    isRetryable,
    };
  },
};
