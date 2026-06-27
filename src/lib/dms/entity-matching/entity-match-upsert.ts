/**
 * ERP DMS AI Phase 13 — Entity Match Candidate Upsert Helper
 *
 * Persists match candidates idempotently and creates linked review queue items.
 *
 * Security rules:
 *   - candidate_key partial unique index prevents duplicate active candidates.
 *   - Accepting a candidate does NOT write to dms_documents owner fields.
 *   - No Apply-to-ERP. Human-review-only.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  upsertDmsReviewQueueItem,
  type DmsReviewType,
} from "@/lib/dms/review-queue/review-queue-upsert";
import { truncateSafeSummary } from "./match-signals";
import type { DmsEntityMatchCandidateInput, DmsEntityMatchTargetType } from "./entity-match-types";

// ── Result types ──────────────────────────────────────────────────────────────

export interface EntityMatchCandidateUpsertResult {
  inserted:    boolean;
  candidateId: number | null;
}

export interface EntityMatchQueueItemResult {
  inserted: boolean;
  itemId:   number | null;
}

// ── Target type → review_type mapping ────────────────────────────────────────

function targetTypeToReviewType(targetType: DmsEntityMatchTargetType): DmsReviewType {
  switch (targetType) {
    case "owner_company":
    case "branch":
    case "work_site":
      return "owner_matching_review";
    case "party":
      return "party_matching_review";
    case "employee":
      return "employee_matching_review";
    default:
      return "owner_matching_review";
  }
}

// ── upsertDmsEntityMatchCandidate ─────────────────────────────────────────────

export async function upsertDmsEntityMatchCandidate(
  input: DmsEntityMatchCandidateInput
): Promise<EntityMatchCandidateUpsertResult> {
  const db = createAdminClient();

  // Belt-and-suspenders active check
  if (input.candidateKey) {
    const { data: existing } = await db
      .from("dms_ai_entity_match_candidates")
      .select("id")
      .eq("candidate_key", input.candidateKey)
      .is("deleted_at", null)
      .not("status", "in", '("accepted","rejected","superseded")')
      .maybeSingle();

    if (existing) {
      return { inserted: false, candidateId: (existing as Record<string, unknown>).id as number };
    }
  }

  const { data, error } = await db
    .from("dms_ai_entity_match_candidates")
    .insert({
      candidate_key:      input.candidateKey,
      document_id:        input.documentId ?? null,
      upload_session_id:  input.uploadSessionId ?? null,
      ai_result_id:       input.aiResultId ?? null,
      source_text_summary: truncateSafeSummary(input.sourceTextSummary),
      match_signal:       truncateSafeSummary(input.matchSignal),
      target_entity_type: input.targetEntityType,
      target_entity_id:   input.targetEntityId,
      target_display_name: truncateSafeSummary(input.targetDisplayName),
      match_score:        input.matchScore,
      match_method:       input.matchMethod,
      match_reason:       truncateSafeSummary(input.matchReason),
      ai_generated:       input.aiGenerated,
      status:             "pending",
      created_by:         input.createdBy ?? null,
      created_at:         new Date().toISOString(),
      updated_at:         new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      logger.info("[entity-match-upsert] duplicate candidate skipped", { candidateKey: input.candidateKey });
      return { inserted: false, candidateId: null };
    }
    logger.warn("[entity-match-upsert] candidate insert failed", {
      error: (error as { message?: string }).message?.slice(0, 200),
    });
    return { inserted: false, candidateId: null };
  }

  const candidateId = (data as Record<string, unknown>).id as number;
  logger.info("[entity-match-upsert] candidate created", { candidateId, targetEntityType: input.targetEntityType });
  return { inserted: true, candidateId };
}

// ── createReviewQueueItemForEntityMatchCandidate ──────────────────────────────

export async function createReviewQueueItemForEntityMatchCandidate(params: {
  candidateId:  number;
  candidate:    DmsEntityMatchCandidateInput;
  documentId:   number;
}): Promise<EntityMatchQueueItemResult> {
  const { candidateId, candidate, documentId } = params;
  const db = createAdminClient();

  const reviewType      = targetTypeToReviewType(candidate.targetEntityType);
  const idempotencyKey  = `p13:candidate:${candidateId}`;
  const priority        = candidate.matchScore >= 0.90 ? "high" : "normal";

  const queueResult = await upsertDmsReviewQueueItem({
    idempotencyKey,
    reviewType,
    documentId,
    uploadSessionId:        candidate.uploadSessionId ?? null,
    aiResultId:             candidate.aiResultId ?? null,
    reasonCode:             `entity_match:${candidate.targetEntityType}`,
    reasonMessage:          truncateSafeSummary(candidate.matchReason, 1000),
    confidence:             candidate.matchScore,
    priority,
    payloadJson:            {
      target_entity_type: candidate.targetEntityType,
      target_entity_id:   candidate.targetEntityId,
      match_method:       candidate.matchMethod,
      match_score:        candidate.matchScore,
      candidate_id:       candidateId,
    },
    createdBy:              candidate.createdBy ?? null,
    entityMatchCandidateId: candidateId,
  });

  if (queueResult.inserted && queueResult.itemId) {
    // Back-link the candidate to the queue item
    await db
      .from("dms_ai_entity_match_candidates")
      .update({ review_queue_item_id: queueResult.itemId, updated_at: new Date().toISOString() })
      .eq("id", candidateId);
  }

  return { inserted: queueResult.inserted, itemId: queueResult.itemId };
}
