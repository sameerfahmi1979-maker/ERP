"use server";

/**
 * DMS AI META.2 — Background Suggestion Queue (Flow B)
 *
 * Generates AI metadata field suggestions for a zero-definition document type
 * and stores them in the DMS review queue for later authorized human review.
 *
 * Governance rule: AI suggests. Human chooses. System saves only approved items.
 *
 * This module NEVER creates metadata definitions and NEVER writes to
 * dms_metadata_definitions. It only:
 *   1. Generates suggestions using the same AI logic as META.1.
 *   2. Stores the suggestion batch in dms_review_queue.payload_json.
 *   3. Marks dms_document_types.ai_suggestions_generated_at.
 *
 * Callable from:
 *   - the GENERATE_METADATA_DEFINITION_SUGGESTIONS job handler (system/worker
 *     context, no user session — uses createAdminClient() throughout)
 *   - a future authorized admin-manual trigger (source = "admin_manual")
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";
import { logAudit } from "@/server/actions/audit";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import { upsertDmsReviewQueueItem } from "@/lib/dms/review-queue/review-queue-upsert";
import {
  aiSuggestedFieldSchema,
  buildAiDefinitionPrompt,
  deduplicateAndFilterSuggestions,
  assignSortOrders,
  extractSuggestionArray,
  type AiSuggestedField,
} from "@/lib/dms/metadata/ai-definition-builder";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  skipped?: boolean;
};

// ── Feature flag helper (admin client — safe in worker context) ──────────────

async function isMetadataSuggestionsFeatureEnabled(): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_AI_FIRST_UPLOAD_METADATA_SUGGESTIONS")
      .maybeSingle();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

/** Exported so intake review UI / pipeline can check the flag without duplicating logic. */
export async function checkMetadataSuggestionsFeatureEnabled(): Promise<boolean> {
  return isMetadataSuggestionsFeatureEnabled();
}

// ── generateAndQueueMetadataSuggestions ───────────────────────────────────────

export async function generateAndQueueMetadataSuggestions(
  documentTypeId: number,
  triggerDocumentId: number,
  source: "post_approve" | "admin_manual"
): Promise<ActionResult<{ reviewQueueItemId: number | null; suggestionCount: number }>> {
  try {
    if (!Number.isInteger(documentTypeId) || documentTypeId <= 0) {
      return { success: false, error: "Invalid document type ID" };
    }

    const flagEnabled = await isMetadataSuggestionsFeatureEnabled();
    if (!flagEnabled) {
      return { success: true, skipped: true, error: "DMS_AI_FIRST_UPLOAD_METADATA_SUGGESTIONS disabled." };
    }

    const db = createAdminClient();

    // ── Document type must exist, not be deleted, not be a system type ──────
    const { data: docType } = await db
      .from("dms_document_types")
      .select("id, type_code, name_en, description, is_system, deleted_at")
      .eq("id", documentTypeId)
      .maybeSingle();

    const dt = docType as Record<string, unknown> | null;
    if (!dt || dt.deleted_at) {
      return { success: false, error: "Document type not found." };
    }
    if (dt.is_system === true) {
      return { success: true, skipped: true, error: "System document types are excluded from AI suggestions." };
    }

    // ── Must have zero ACTIVE definitions ────────────────────────────────────
    const { count: activeDefCount } = await db
      .from("dms_metadata_definitions")
      .select("id", { count: "exact", head: true })
      .eq("document_type_id", documentTypeId)
      .eq("is_active", true)
      .is("deleted_at", null);

    if ((activeDefCount ?? 0) > 0) {
      return { success: true, skipped: true, error: "Document type already has active metadata definitions." };
    }

    // ── Idempotency: skip if an open suggestion review item already exists ──
    const idempotencyKey = `meta_suggestions:type:${documentTypeId}`;
    const { data: existingOpenItem } = await db
      .from("dms_review_queue")
      .select("id")
      .eq("idempotency_key", idempotencyKey)
      .in("status", ["open", "assigned", "in_review", "pending"])
      .is("deleted_at", null)
      .maybeSingle();

    if (existingOpenItem) {
      return {
        success: true,
        skipped: true,
        data: { reviewQueueItemId: (existingOpenItem as { id: number }).id, suggestionCount: 0 },
        error: "Suggestions are already pending review for this document type.",
      };
    }

    // ── Build prompt (no existing fields, no reference examples in system context) ──
    const { systemPrompt, userPrompt } = buildAiDefinitionPrompt({
      documentTypeName: String(dt.name_en ?? dt.type_code),
      documentTypeCode: String(dt.type_code),
      documentTypeDescription: (dt.description as string | null) ?? null,
      existingFieldCodes: [],
      referenceExamples: [],
    });

    const aiOutcome = await callCommonAiStructuredCompletion(systemPrompt, userPrompt, {
      maxTokens: 2000,
      temperature: 0,
    });

    if (!aiOutcome.success) {
      logger.warn("[metadata-suggestion-queue] AI call failed (non-fatal)", {
        documentTypeId,
        isProviderNotConfigured: aiOutcome.isProviderNotConfigured,
      });
      return { success: false, error: "AI provider call failed or is not configured." };
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(aiOutcome.rawJson);
    } catch {
      return { success: false, error: "AI returned an invalid response." };
    }
    const suggestionArray = extractSuggestionArray(parsed);
    if (!suggestionArray) {
      return { success: false, error: "AI returned an unexpected format." };
    }

    const validatedItems: AiSuggestedField[] = [];
    for (const item of suggestionArray) {
      const result = aiSuggestedFieldSchema.safeParse(item);
      if (result.success) validatedItems.push(result.data as AiSuggestedField);
    }

    const { safe } = deduplicateAndFilterSuggestions(validatedItems, new Set());
    assignSortOrders(safe, -1);

    const nowIso = new Date().toISOString();

    if (safe.length === 0) {
      // Still mark generated_at so we don't retry endlessly on an unproductive type.
      await db
        .from("dms_document_types")
        .update({ ai_suggestions_generated_at: nowIso })
        .eq("id", documentTypeId);
      return { success: true, skipped: true, error: "AI could not generate any new field suggestions." };
    }

    // ── Store suggestion batch in the review queue (payload_json only) ──────
    const payloadJson = {
      document_type_id: documentTypeId,
      document_type_code: String(dt.type_code),
      document_type_name: String(dt.name_en ?? dt.type_code),
      trigger_document_id: triggerDocumentId,
      model: aiOutcome.model ?? null,
      generated_at: nowIso,
      suggestion_count: safe.length,
      suggestions: safe,
    };

    const upsertResult = await upsertDmsReviewQueueItem({
      idempotencyKey,
          reviewType: "metadata_definition_suggestions_review",
          sourceType: "document_type",
          sourceId: String(documentTypeId),
      documentId: triggerDocumentId,
      metadataDefinitionId: null,
      reasonCode: "zero_definitions_first_upload",
      reasonMessage: `AI has suggested ${safe.length} metadata fields for ${String(dt.name_en ?? dt.type_code)}. Review and approve the fields you need.`,
      priority: "normal",
      payloadJson,
    });

    await db
      .from("dms_document_types")
      .update({ ai_suggestions_generated_at: nowIso })
      .eq("id", documentTypeId);

    logger.info("[metadata-suggestion-queue] suggestions generated", {
      documentTypeId,
      triggerDocumentId,
      source,
      suggestionCount: safe.length,
      reviewQueueItemId: upsertResult.itemId,
      inserted: upsertResult.inserted,
    });

    // Best-effort audit entry — only succeeds when called with an active user
    // session (e.g. a future admin-manual trigger). When invoked from the
    // system worker (source="post_approve") there is no user session, so
    // logAudit safely no-ops (see src/server/actions/audit.ts); the
    // logger.info call above always records the event for observability.
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_types",
      entity_id: documentTypeId,
      entity_reference: String(dt.type_code),
      action: "DMS_AI_METADATA_SUGGESTIONS_GENERATED",
      new_values: {
        document_type_id: documentTypeId,
        document_type_code: String(dt.type_code),
        trigger_document_id: triggerDocumentId,
        suggestion_count: safe.length,
        model: aiOutcome.model ?? null,
        source,
      },
    }).catch(() => undefined);

    return {
      success: true,
      data: { reviewQueueItemId: upsertResult.itemId, suggestionCount: safe.length },
    };
  } catch (err) {
    logger.error("[metadata-suggestion-queue] unexpected error", { error: String(err).slice(0, 200) });
    return { success: false, error: "Failed to generate metadata suggestions." };
  }
}
