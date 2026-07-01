"use server";

/**
 * DMS AI META.2 — AI Metadata Suggestions: Approval Finalization
 *
 * Governance rule: AI suggests. Human chooses. System saves only approved items.
 *
 * This module never creates metadata definitions itself — that always happens
 * via createDmsMetadataDefinition(), called by the client dialog in a loop
 * BEFORE any of the actions below run. These actions only handle the
 * "aftermath" of a human decision on an AI suggestion batch:
 *   - approveMetadataSuggestions: resolve the review queue item (if any),
 *     enqueue AI_RE_EXTRACTION for the trigger document, write audit events.
 *   - rejectMetadataSuggestions: dismiss the review queue item, write audit event.
 *   - skipMetadataSuggestionsForNow: best-effort audit event for Flow A "Skip".
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import { canApproveAiMetadataSuggestions } from "@/lib/dms/metadata/ai-suggestion-permissions";
import { enqueueUniqueDmsAiJob } from "@/lib/dms/ai-jobs/job-runner";
import { DMS_AI_JOB_TYPE } from "@/lib/dms/ai-jobs/job-types";

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

export type MetadataSuggestionSource = "intake_review" | "review_queue";

export type ApproveMetadataSuggestionsInput = {
  documentTypeId: number;
  documentTypeCode?: string | null;
  /** The document that triggered the AI suggestion workflow (Flow A or Flow B). */
  triggerDocumentId?: number | null;
  /** The dms_review_queue.id being resolved, when approving from Flow B. */
  reviewQueueItemId?: number | null;
  suggestionCount: number;
  selectedCount: number;
  createdCount: number;
  model?: string | null;
  source: MetadataSuggestionSource;
};

/**
 * Called after the client dialog finishes calling createDmsMetadataDefinition
 * for every selected/checked suggestion row and at least one succeeded.
 *
 * Responsibilities (all best-effort / non-fatal where noted):
 *   1. Permission re-check (defense in depth — createDmsMetadataDefinition
 *      already enforced this per-row).
 *   2. Mark dms_document_types.ai_suggestions_approved_at.
 *   3. Resolve the review queue item, if this came from Flow B.
 *   4. Enqueue AI_RE_EXTRACTION for the trigger document, if one exists.
 *   5. Audit: DMS_AI_METADATA_SUGGESTIONS_APPROVED + (if enqueued)
 *      DMS_AI_METADATA_REEXTRACTION_ENQUEUED.
 */
export async function approveMetadataSuggestions(
  input: ApproveMetadataSuggestionsInput
): Promise<ActionResult<{ reExtractionEnqueued: boolean }>> {
  try {
    const ctx = await getAuthContext();
    if (!canApproveAiMetadataSuggestions(ctx)) {
      return { success: false, error: "Permission denied" };
    }
    if (!Number.isInteger(input.documentTypeId) || input.documentTypeId <= 0) {
      return { success: false, error: "Invalid document type ID" };
    }
    if (input.createdCount <= 0) {
      return { success: false, error: "No fields were created — nothing to approve" };
    }

    const supabase = await createClient();
    const nowIso = new Date().toISOString();

    await supabase
      .from("dms_document_types")
      .update({ ai_suggestions_approved_at: nowIso })
      .eq("id", input.documentTypeId);

    if (input.reviewQueueItemId) {
      await supabase
        .from("dms_review_queue")
        .update({
          status: "resolved",
          reviewed_by: ctx.profile?.id ?? null,
          reviewed_at: nowIso,
          resolved_at: nowIso,
          review_completed_at: nowIso,
          resolution_code: "approved",
          resolution_note: `${input.createdCount} of ${input.suggestionCount} suggested fields created.`,
          updated_by: ctx.profile?.id ?? null,
          updated_at: nowIso,
        })
        .eq("id", input.reviewQueueItemId)
        .in("status", ["open", "assigned", "in_review"])
        .is("deleted_at", null);
    }

    let reExtractionEnqueued = false;
    if (input.triggerDocumentId) {
      const enqueueResult = await enqueueUniqueDmsAiJob({
        jobType: DMS_AI_JOB_TYPE.AI_RE_EXTRACTION,
        payload: {
          documentId: input.triggerDocumentId,
          source: "metadata_suggestions_approved",
        },
        idempotencyKey: `re_extraction:doc:${input.triggerDocumentId}:after_meta_approval`,
        priority: 5,
        relatedDocumentId: input.triggerDocumentId,
      });
      reExtractionEnqueued = enqueueResult.success;
    }

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_metadata_definitions",
      entity_id: input.documentTypeId,
      entity_reference: input.documentTypeCode ?? String(input.documentTypeId),
      action: "DMS_AI_METADATA_SUGGESTIONS_APPROVED",
      new_values: {
        document_type_id: input.documentTypeId,
        document_type_code: input.documentTypeCode ?? null,
        trigger_document_id: input.triggerDocumentId ?? null,
        review_queue_item_id: input.reviewQueueItemId ?? null,
        suggestion_count: input.suggestionCount,
        selected_count: input.selectedCount,
        created_count: input.createdCount,
        rejected_count: Math.max(0, input.selectedCount - input.createdCount),
        model: input.model ?? null,
        source: input.source,
        approved_by_profile_id: ctx.profile?.id ?? null,
      },
    }).catch(() => undefined);

    if (reExtractionEnqueued && input.triggerDocumentId) {
      await logAudit({
        module_code: "DMS",
        entity_name: "dms_documents",
        entity_id: input.triggerDocumentId,
        entity_reference: String(input.triggerDocumentId),
        action: "DMS_AI_METADATA_REEXTRACTION_ENQUEUED",
        new_values: {
          document_id: input.triggerDocumentId,
          document_type_id: input.documentTypeId,
          reason: "metadata_suggestions_approved",
        },
      }).catch(() => undefined);
    }

    revalidatePath("/admin/dms/metadata-definitions");
    revalidatePath("/dms/review-queue");

    return { success: true, data: { reExtractionEnqueued } };
  } catch (err) {
    logger.error("[metadata-suggestion-review] approve failed", { error: String(err).slice(0, 200) });
    return { success: false, error: "Failed to finalize suggestion approval." };
  }
}

export type RejectMetadataSuggestionsInput = {
  documentTypeId: number;
  documentTypeCode?: string | null;
  reviewQueueItemId?: number | null;
  suggestionCount: number;
  reason?: string | null;
  source: MetadataSuggestionSource;
};

/**
 * Called when an authorized user dismisses/rejects an AI suggestion batch
 * without creating any definitions. Never touches dms_metadata_definitions.
 */
export async function rejectMetadataSuggestions(
  input: RejectMetadataSuggestionsInput
): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!canApproveAiMetadataSuggestions(ctx)) {
      return { success: false, error: "Permission denied" };
    }

    if (input.reviewQueueItemId) {
      const supabase = await createClient();
      const nowIso = new Date().toISOString();
      await supabase
        .from("dms_review_queue")
        .update({
          status: "dismissed",
          reviewed_by: ctx.profile?.id ?? null,
          reviewed_at: nowIso,
          resolved_at: nowIso,
          review_completed_at: nowIso,
          resolution_code: "rejected",
          resolution_note: (input.reason ?? "Suggestions rejected by reviewer.").slice(0, 500),
          updated_by: ctx.profile?.id ?? null,
          updated_at: nowIso,
        })
        .eq("id", input.reviewQueueItemId)
        .in("status", ["open", "assigned", "in_review"])
        .is("deleted_at", null);
    }

    await logAudit({
      module_code: "DMS",
      entity_name: "dms_metadata_definitions",
      entity_id: input.documentTypeId,
      entity_reference: input.documentTypeCode ?? String(input.documentTypeId),
      action: "DMS_AI_METADATA_SUGGESTIONS_REJECTED",
      new_values: {
        document_type_id: input.documentTypeId,
        document_type_code: input.documentTypeCode ?? null,
        review_queue_item_id: input.reviewQueueItemId ?? null,
        suggestion_count: input.suggestionCount,
        source: input.source,
        rejected_by_profile_id: ctx.profile?.id ?? null,
      },
    }).catch(() => undefined);

    revalidatePath("/dms/review-queue");
    return { success: true };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}

/**
 * Best-effort audit event for Flow A "Skip for Now". Never blocks the
 * intake review flow — failures are swallowed.
 */
export async function skipMetadataSuggestionsForNow(
  documentTypeId: number,
  triggerDocumentId?: number | null
): Promise<void> {
  try {
    const ctx = await getAuthContext();
    await logAudit({
      module_code: "DMS",
      entity_name: "dms_document_types",
      entity_id: documentTypeId,
      entity_reference: String(documentTypeId),
      action: "DMS_AI_METADATA_SUGGESTIONS_SKIPPED",
      new_values: {
        document_type_id: documentTypeId,
        trigger_document_id: triggerDocumentId ?? null,
        skipped_by_profile_id: ctx.profile?.id ?? null,
      },
    });
  } catch {
    // Non-fatal by design — never blocks intake review.
  }
}

/**
 * Client-callable permission check for the intake review zero-definition
 * notice — decides whether to show the AI suggestion buttons or the
 * "Ask a DMS Manager" message.
 */
export async function canCurrentUserApproveAiMetadataSuggestions(): Promise<boolean> {
  try {
    const ctx = await getAuthContext();
    return canApproveAiMetadataSuggestions(ctx);
  } catch {
    return false;
  }
}

export type PendingMetadataSuggestionsBatch = {
  reviewQueueItemId: number;
  suggestions: Array<{
    field_code: string;
    field_label_en: string;
    field_type: "text" | "date" | "number" | "boolean" | "currency";
    is_required: boolean;
    is_ai_extractable: boolean;
    ai_field_hint: string;
    ai_example_values: string[];
    sort_order: number;
    reasoning: string;
  }>;
  model: string | null;
};

/**
 * Read-only helper for the intake review zero-definition notice: checks
 * whether an open metadata_definition_suggestions_review item already
 * exists for this document type (Flow B may have already generated one),
 * and returns the suggestion batch so it can be reviewed inline without a
 * separate review-queue permission check (the caller must already have
 * passed canCurrentUserApproveAiMetadataSuggestions() to show this notice).
 */
export async function getOpenMetadataSuggestionsReviewItem(
  documentTypeId: number
): Promise<ActionResult<PendingMetadataSuggestionsBatch | null>> {
  try {
    const ctx = await getAuthContext();
    if (!canApproveAiMetadataSuggestions(ctx)) {
      return { success: false, error: "Permission denied" };
    }

    const db = createAdminClient();
    const { data } = await db
      .from("dms_review_queue")
      .select("id, payload_json")
      .eq("review_type", "metadata_definition_suggestions_review")
      .eq("source_type", "document_type")
      .eq("source_id", String(documentTypeId))
      .in("status", ["open", "assigned", "in_review", "pending"])
      .is("deleted_at", null)
      .maybeSingle();

    if (!data) return { success: true, data: null };

    const row = data as { id: number; payload_json: Record<string, unknown> | null };
    const rawSuggestions = Array.isArray(row.payload_json?.suggestions) ? row.payload_json?.suggestions : [];
    // The review queue payload sanitizer intentionally drops ai_example_values
    // (see SUGGESTION_ITEM_ALLOWED_KEYS) — restore it as an empty array so the
    // shape matches AiSuggestedField for the review dialog.
    const suggestions = (rawSuggestions as Record<string, unknown>[]).map((s) => ({
      field_code: String(s.field_code ?? ""),
      field_label_en: String(s.field_label_en ?? ""),
      field_type: (s.field_type as PendingMetadataSuggestionsBatch["suggestions"][number]["field_type"]) ?? "text",
      is_required: s.is_required === true,
      is_ai_extractable: s.is_ai_extractable !== false,
      ai_field_hint: String(s.ai_field_hint ?? ""),
      ai_example_values: [] as string[],
      sort_order: typeof s.sort_order === "number" ? s.sort_order : 0,
      reasoning: String(s.reasoning ?? ""),
    }));

    return {
      success: true,
      data: {
        reviewQueueItemId: row.id,
        suggestions,
        model: (row.payload_json?.model as string | null) ?? null,
      },
    };
  } catch (err) {
    return { success: false, error: String(err).slice(0, 200) };
  }
}
