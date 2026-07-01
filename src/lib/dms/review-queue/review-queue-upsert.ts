/**
 * ERP DMS AI Phase 12 — Review Queue Upsert Helper
 *
 * Internal module for creating idempotent review queue items and notifications.
 *
 * Security rules:
 *   - Uses createAdminClient() — bypasses RLS; caller is responsible for prior auth.
 *   - payload_json MUST contain ONLY safe summaries (IDs, codes, short text).
 *   - NEVER store OCR text, chunk text, full AI responses, prompts, or API keys.
 *   - reasonMessage is truncated to max 1000 chars.
 *   - resolutionNote is truncated to max 500 chars.
 *   - Non-fatal by design — callers MUST wrap in try/catch.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

// ── Types ──────────────────────────────────────────────────────────────────────

export type DmsReviewType =
  // Phase 12
  | "intake_classification_review"
  | "intake_metadata_review"
  | "ai_analysis_metadata_review"
  | "ocr_failure_review"
  | "semantic_index_review"
  | "ai_job_failure_review"
  // Phase 13
  | "validation_conflict_review"
  | "metadata_rule_violation_review"
  | "owner_matching_review"
  | "party_matching_review"
  | "employee_matching_review"
  | "duplicate_document_review"
  | "document_consistency_review"
  // DMS AI META.2 — first-upload AI metadata suggestion workflow (approval-based)
  | "metadata_definition_suggestions_review";

export type DmsReviewPriority = "urgent" | "high" | "normal" | "low";

export interface ReviewQueueUpsertInput {
  idempotencyKey:           string;
  reviewType:               DmsReviewType;
  sourceType?:              string | null;
  sourceId?:                string | null;
  uploadSessionId?:         number | null;
  documentId?:              number | null;
  aiResultId?:              number | null;
  aiJobId?:                 number | null;
  metadataDefinitionId?:    number | null;
  fieldCode?:               string | null;
  reasonCode?:              string | null;
  reasonMessage?:           string | null;
  confidence?:              number | null;
  priority?:                DmsReviewPriority;
  payloadJson?:             Record<string, unknown> | null;
  createdBy?:               number | null;
  // Phase 13: link to validation finding or entity match candidate
  validationFindingId?:     number | null;
  entityMatchCandidateId?:  number | null;
}

export interface ReviewQueueUpsertResult {
  inserted: boolean;
  itemId:   number | null;
}

// ── Due date helper ───────────────────────────────────────────────────────────

function computeDueAt(priority: DmsReviewPriority): Date | null {
  const now = new Date();
  switch (priority) {
    case "urgent": {
      const d = new Date(now);
      d.setHours(d.getHours() + 24);
      return d;
    }
    case "high": {
      const d = new Date(now);
      d.setHours(d.getHours() + 72);
      return d;
    }
    case "normal": {
      const d = new Date(now);
      d.setDate(d.getDate() + 7);
      return d;
    }
    case "low":
      return null;
  }
}

// ── Payload sanitizer ─────────────────────────────────────────────────────────

const BLOCKED_KEYS = new Set([
  "ocr_text", "content_text", "chunk_text", "full_text", "raw_response",
  "raw_prompt", "prompt", "api_key", "secret", "password", "token",
  "extracted_fields", "raw_ocr", "transcription", "fullTextTranscription",
]);

/**
 * DMS AI META.2 — narrow allowlist for the "suggestions" array used by the
 * metadata_definition_suggestions_review review type ONLY.
 *
 * This is an explicit, hard-coded allowlist (not a generic "allow any array"
 * relaxation) so the rest of the review queue payload sanitizer keeps
 * dropping all other nested objects/arrays exactly as before. Each item is
 * a plain object with only primitive, size-capped fields — no OCR text, no
 * prompts, no raw AI responses. `reasoning` is included because it is
 * display-only AI commentary already shown to users in the META.1 dialog;
 * it is never sent to createDmsMetadataDefinition.
 */
const SUGGESTION_ITEM_ALLOWED_KEYS = new Set([
  "field_code",
  "field_label_en",
  "field_type",
  "is_required",
  "is_ai_extractable",
  "ai_field_hint",
  "sort_order",
  "reasoning",
]);
const MAX_SUGGESTION_ITEMS = 30;
const MAX_SUGGESTION_STRING_LEN = 500;

function sanitizeSuggestionItem(item: unknown): Record<string, unknown> | null {
  if (typeof item !== "object" || item === null || Array.isArray(item)) return null;
  const safeItem: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(item as Record<string, unknown>)) {
    if (!SUGGESTION_ITEM_ALLOWED_KEYS.has(key)) continue;
    if (typeof value === "string") {
      safeItem[key] = value.slice(0, MAX_SUGGESTION_STRING_LEN);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      safeItem[key] = value;
    }
    // ai_example_values and other nested arrays intentionally dropped —
    // not needed for the review queue summary/dialog re-hydration path.
  }
  return Object.keys(safeItem).length > 0 ? safeItem : null;
}

/**
 * Ensures payload_json contains only safe, non-sensitive data.
 * Removes any keys containing suspicious content.
 */
function sanitizePayload(
  payload: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!payload) return null;

  const safe: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (BLOCKED_KEYS.has(key)) continue;

    if (key === "suggestions" && Array.isArray(value)) {
      const safeSuggestions = value
        .slice(0, MAX_SUGGESTION_ITEMS)
        .map(sanitizeSuggestionItem)
        .filter((v): v is Record<string, unknown> => v !== null);
      if (safeSuggestions.length > 0) safe[key] = safeSuggestions;
      continue;
    }

    // Truncate string values to 200 chars
    if (typeof value === "string") {
      safe[key] = value.slice(0, 200);
    } else if (typeof value === "number" || typeof value === "boolean" || value === null) {
      safe[key] = value;
    }
    // Skip all other nested objects/arrays — too risky for safe payload
  }
  return Object.keys(safe).length > 0 ? safe : null;
}

// ── DMS_AI_REVIEW feature flag check ─────────────────────────────────────────

export async function isDmsAiReviewEnabled(): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_AI_REVIEW")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

// ── upsertDmsReviewQueueItem ──────────────────────────────────────────────────

/**
 * Idempotently creates a review queue item.
 *
 * Uses a partial unique index on idempotency_key so that:
 * - Active duplicate → INSERT is blocked by constraint → returns inserted=false
 * - Closed item with same key → INSERT succeeds (new item for same event after re-occurrence)
 *
 * NON-FATAL: callers MUST wrap in try/catch.
 */
export async function upsertDmsReviewQueueItem(
  input: ReviewQueueUpsertInput
): Promise<ReviewQueueUpsertResult> {
  const db = createAdminClient();
  const priority = input.priority ?? "normal";
  const dueAt    = computeDueAt(priority);

  // Check for existing active item (belt-and-suspenders alongside DB constraint)
  if (input.idempotencyKey) {
    const { data: existing } = await db
      .from("dms_review_queue")
      .select("id")
      .eq("idempotency_key", input.idempotencyKey)
      .in("status", ["open", "assigned", "in_review", "pending"])
      .is("deleted_at", null)
      .maybeSingle();

    if (existing) {
      return { inserted: false, itemId: (existing as Record<string, unknown>).id as number };
    }
  }

  const safePayload = sanitizePayload(input.payloadJson);
  const safeReasonMessage = input.reasonMessage
    ? input.reasonMessage.slice(0, 1000)
    : null;

  const { data, error } = await db
    .from("dms_review_queue")
    .insert({
      idempotency_key:        input.idempotencyKey,
      review_type:            input.reviewType,
      source_type:            input.sourceType ?? null,
      source_id:              input.sourceId ?? null,
      upload_session_id:      input.uploadSessionId ?? null,
      document_id:            input.documentId ?? null,
      ai_result_id:           input.aiResultId ?? null,
      ai_job_id:              input.aiJobId ?? null,
      metadata_definition_id:    input.metadataDefinitionId ?? null,
      field_code:                input.fieldCode ?? null,
      reason_code:               input.reasonCode ?? null,
      reason_message:            safeReasonMessage,
      validation_finding_id:     input.validationFindingId ?? null,
      entity_match_candidate_id: input.entityMatchCandidateId ?? null,
      confidence:             input.confidence ?? null,
      priority,
      payload_json:           safePayload,
      due_at:                 dueAt?.toISOString() ?? null,
      created_by:             input.createdBy ?? null,
      status:                 "open",
      queued_at:              new Date().toISOString(),
      created_at:             new Date().toISOString(),
      updated_at:             new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    // Unique constraint violation = active duplicate exists
    if (error.code === "23505") {
      logger.info("[review-queue] duplicate active item skipped", {
        idempotencyKey: input.idempotencyKey,
        reviewType: input.reviewType,
      });
      return { inserted: false, itemId: null };
    }
    logger.warn("[review-queue] upsert failed", {
      idempotencyKey: input.idempotencyKey,
      error: (error as { message?: string }).message?.slice(0, 200),
    });
    return { inserted: false, itemId: null };
  }

  const itemId = (data as Record<string, unknown>).id as number;
  logger.info("[review-queue] item created", {
    itemId,
    reviewType: input.reviewType,
    idempotencyKey: input.idempotencyKey,
  });

  return { inserted: true, itemId };
}

// ── createDmsReviewQueueNotification ─────────────────────────────────────────

/**
 * Creates an in-app notification for review queue events.
 * NON-FATAL: errors are logged and swallowed.
 *
 * Events:
 *   created  — critical/high item created → notify DMS admins (via role)
 *   assigned — item assigned to a user   → notify that user directly
 */
export async function createDmsReviewQueueNotification(input: {
  itemId:      number;
  priority:    string;
  reviewType:  string;
  documentId?: number | null;
  assignedTo?: number | null;
  eventType:   "created" | "assigned";
}): Promise<void> {
  try {
    const db = createAdminClient();
    const { itemId, priority, reviewType, documentId, assignedTo, eventType } = input;

    const actionUrl = "/dms/review-queue";
    const reviewTypeLabel = reviewType.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

    if (eventType === "assigned" && assignedTo) {
      // Notify assigned user
      await db.from("erp_notifications").insert({
        source_module:      "DMS",
        source_entity_type: "dms_review_queue",
        source_entity_id:   itemId,
        notification_type:  "dms_review_queue_assigned",
        severity:           "info",
        title:              "Review Queue Item Assigned",
        message:            `A review queue item (${reviewTypeLabel}) has been assigned to you.`,
        recipient_user_id:  assignedTo,
        channel_in_app:     true,
        channel_email:      false,
        status:             "unread",
        scheduled_for:      new Date().toISOString(),
        action_url:         actionUrl,
        action_label:       "View Queue",
        metadata_json:      { item_id: itemId, review_type: reviewType, document_id: documentId ?? null },
      });

      return;
    }

    if (eventType === "created" && (priority === "urgent" || priority === "high")) {
      // Notify via role code — uses recipient_role_code to fan out to role members
      await db.from("erp_notifications").insert({
        source_module:      "DMS",
        source_entity_type: "dms_review_queue",
        source_entity_id:   itemId,
        notification_type:  "dms_review_queue_critical_item",
        severity:           priority === "urgent" ? "error" : "warning",
        title:              `${priority === "urgent" ? "Urgent" : "High Priority"} DMS Review Item`,
        message:            `A ${priority} priority review queue item (${reviewTypeLabel}) requires attention.`,
        recipient_user_id:  null,
        recipient_role_code: "system_admin", // DMS admins — adapt if DMS-specific role exists
        channel_in_app:     true,
        channel_email:      false,
        status:             "unread",
        scheduled_for:      new Date().toISOString(),
        action_url:         actionUrl,
        action_label:       "View Queue",
        metadata_json:      { item_id: itemId, review_type: reviewType, priority, document_id: documentId ?? null },
      });
    }
  } catch (err) {
    logger.warn("[review-queue] notification creation failed (non-fatal)", {
      itemId: input.itemId,
      error: String(err).slice(0, 200),
    });
  }
}
