/**
 * ERP DMS AI Phase 13 — Validation Finding Upsert Helper
 *
 * Persists validation findings idempotently and creates linked review queue items.
 *
 * Security rules:
 *   - Uses createAdminClient() — caller must enforce auth + feature flag.
 *   - finding_key partial unique index prevents duplicate active findings.
 *   - Queue items are created via upsertDmsReviewQueueItem (safe payload only).
 *   - No raw content stored. Summaries truncated to 200 chars.
 *   - No Apply-to-ERP writes.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import {
  upsertDmsReviewQueueItem,
  type DmsReviewType,
} from "@/lib/dms/review-queue/review-queue-upsert";
import type { DmsValidationFindingInput } from "./validation-types";

// ── Result types ──────────────────────────────────────────────────────────────

export interface ValidationFindingUpsertResult {
  inserted:   boolean;
  findingId:  number | null;
}

export interface ValidationQueueItemResult {
  inserted: boolean;
  itemId:   number | null;
}

// ── Safe truncation ───────────────────────────────────────────────────────────

function trunc(s: string | null | undefined, max: number): string | null {
  if (s == null || s.length === 0) return null;
  return s.slice(0, max);
}

// ── Rule → review_type mapping ─────────────────────────────────────────────

function ruleToReviewType(ruleCode: string, findingType: string): DmsReviewType {
  switch (findingType) {
    case "duplicate_document":
      return "duplicate_document_review";
    case "required_field_missing":
    case "format_violation":
    case "expiry_before_issue_date":
    case "expiry_in_past":
    case "issue_date_in_future":
      return "metadata_rule_violation_review";
    case "classification_mismatch":
    case "ai_confidence_low":
      return "validation_conflict_review";
    case "ai_value_conflict":
    case "ai_assisted_conflict":
      return "validation_conflict_review";
    case "document_inconsistency":
      return "document_consistency_review";
    default:
      return "validation_conflict_review";
  }
}

// ── upsertDmsValidationFinding ────────────────────────────────────────────────

export async function upsertDmsValidationFinding(
  input: DmsValidationFindingInput
): Promise<ValidationFindingUpsertResult> {
  const db = createAdminClient();

  // Belt-and-suspenders active check (partial unique index is primary guard)
  if (input.findingKey) {
    const { data: existing } = await db
      .from("dms_ai_validation_findings")
      .select("id")
      .eq("finding_key", input.findingKey)
      .is("deleted_at", null)
      .not("status", "in", '("reviewed","false_positive","superseded","dismissed")')
      .maybeSingle();

    if (existing) {
      return { inserted: false, findingId: (existing as Record<string, unknown>).id as number };
    }
  }

  const { data, error } = await db
    .from("dms_ai_validation_findings")
    .insert({
      finding_key:            input.findingKey,
      document_id:            input.documentId ?? null,
      upload_session_id:      input.uploadSessionId ?? null,
      ai_result_id:           input.aiResultId ?? null,
      metadata_definition_id: input.metadataDefinitionId ?? null,
      field_code:             input.fieldCode ?? null,
      finding_type:           input.findingType,
      severity:               input.severity,
      status:                 "open",
      source_module:          input.sourceModule,
      rule_code:              input.ruleCode,
      rule_label:             input.ruleLabel,
      rule_version:           input.ruleVersion ?? "1.0",
      ai_generated:           input.aiGenerated,
      confidence:             input.confidence ?? null,
      current_value_summary:  trunc(input.currentValueSummary, 200),
      ai_value_summary:       trunc(input.aiValueSummary, 200),
      expected_value_summary: trunc(input.expectedValueSummary, 200),
      reason_message:         trunc(input.reasonMessage, 500),
      evidence_json:          input.evidenceJson ?? null,
      created_by:             input.createdBy ?? null,
      created_at:             new Date().toISOString(),
      updated_at:             new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") {
      // Unique constraint — active duplicate
      logger.info("[validation-upsert] duplicate finding skipped", { findingKey: input.findingKey });
      return { inserted: false, findingId: null };
    }
    logger.warn("[validation-upsert] finding insert failed", {
      ruleCode: input.ruleCode,
      error: (error as { message?: string }).message?.slice(0, 200),
    });
    return { inserted: false, findingId: null };
  }

  const findingId = (data as Record<string, unknown>).id as number;
  logger.info("[validation-upsert] finding created", { findingId, ruleCode: input.ruleCode });
  return { inserted: true, findingId };
}

// ── createReviewQueueItemForValidationFinding ─────────────────────────────────

export async function createReviewQueueItemForValidationFinding(params: {
  findingId:  number;
  finding:    DmsValidationFindingInput;
  documentId: number;
}): Promise<ValidationQueueItemResult> {
  const { findingId, finding, documentId } = params;
  const db = createAdminClient();

  const reviewType    = ruleToReviewType(finding.ruleCode, finding.findingType);
  const idempotencyKey = `p13:finding:${findingId}`;
  const priority      = finding.severity === "error" ? "high"
                      : finding.severity === "warning" ? "normal"
                      : "low";

  const queueResult = await upsertDmsReviewQueueItem({
    idempotencyKey,
    reviewType,
    documentId,
    uploadSessionId:      finding.uploadSessionId ?? null,
    aiResultId:           finding.aiResultId ?? null,
    metadataDefinitionId: finding.metadataDefinitionId ?? null,
    fieldCode:            finding.fieldCode ?? null,
    reasonCode:           finding.ruleCode,
    reasonMessage:        trunc(finding.reasonMessage, 1000),
    confidence:           finding.confidence ?? null,
    priority:             priority as "high" | "normal" | "low",
    payloadJson:          {
      rule_code:     finding.ruleCode,
      finding_type:  finding.findingType,
      finding_id:    findingId,
    },
    createdBy:            finding.createdBy ?? null,
    validationFindingId:  findingId,
  });

  if (queueResult.inserted && queueResult.itemId) {
    // Back-link the finding to the queue item
    await db
      .from("dms_ai_validation_findings")
      .update({ review_queue_item_id: queueResult.itemId, updated_at: new Date().toISOString() })
      .eq("id", findingId);
  }

  return { inserted: queueResult.inserted, itemId: queueResult.itemId };
}
