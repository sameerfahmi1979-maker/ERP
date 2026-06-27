/**
 * ERP DMS AI Phase 9 — Job Registry
 *
 * Maps job_type strings to their handler implementations.
 * Only registered handlers can be executed by the runner.
 *
 * Security rules:
 *   - Handlers are only invoked by the authenticated worker (WORKER_SECRET verified).
 *   - No handler may write to ERP target tables (HR, Party, Fleet, Asset).
 *   - No handler may auto-approve or auto-save metadata.
 */

import type { DmsAiJobHandler } from "./job-types";
import { DMS_AI_JOB_TYPE } from "./job-types";
import { postApproveOrchestrationHandler } from "./handlers/post-approve-orchestration.handler";
import { ocrBackfillHandler } from "./handlers/ocr-backfill.handler";
import { semanticDocumentIndexHandler } from "./handlers/semantic-document-index.handler";

// ── Handler registry ──────────────────────────────────────────────────────────

const HANDLER_MAP = new Map<string, DmsAiJobHandler>([
  [DMS_AI_JOB_TYPE.POST_APPROVE_ORCHESTRATION, postApproveOrchestrationHandler],
  // Phase 10B — queue-backed admin OCR backfill:
  [DMS_AI_JOB_TYPE.OCR_BACKFILL,               ocrBackfillHandler],
  // Phase 11 — chunk-level semantic indexing:
  [DMS_AI_JOB_TYPE.SEMANTIC_DOCUMENT_INDEX,    semanticDocumentIndexHandler],
  // Future handlers (Phase 12+):
  // [DMS_AI_JOB_TYPE.AI_SUMMARY,        aiSummaryHandler],
  // [DMS_AI_JOB_TYPE.AI_INTELLIGENCE,   aiIntelligenceHandler],
  // [DMS_AI_JOB_TYPE.EMBEDDING,         embeddingHandler],
  // [DMS_AI_JOB_TYPE.TAG_SUGGESTIONS,   tagSuggestionsHandler],
  // [DMS_AI_JOB_TYPE.LINK_SUGGESTIONS,  linkSuggestionsHandler],
  // [DMS_AI_JOB_TYPE.CONTENT_SYNC,      contentSyncHandler],
]);

/**
 * Returns the handler for a given job type, or null if not registered.
 */
export function getDmsAiJobHandler(jobType: string): DmsAiJobHandler | null {
  return HANDLER_MAP.get(jobType) ?? null;
}

/**
 * Returns all registered job types.
 */
export function getRegisteredJobTypes(): string[] {
  return Array.from(HANDLER_MAP.keys());
}

/**
 * Whether a given job type has a registered handler.
 */
export function isJobTypeRegistered(jobType: string): boolean {
  return HANDLER_MAP.has(jobType);
}
