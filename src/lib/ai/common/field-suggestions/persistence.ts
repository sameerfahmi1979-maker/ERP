/**
 * ERP COMMON AI.1D — Suggestion Persistence
 *
 * Handles DB writes for Common AI field suggestions:
 *   1. Supersede existing pending suggestions before insert
 *   2. Insert new pending suggestions
 *   3. Insert generated events for each suggestion
 *
 * Rules:
 * - Only server-side (uses createClient / createAdminClient).
 * - source_excerpt max 500 chars (DB constraint enforces this too).
 * - ai_reason max 1000 chars (DB constraint enforces this too).
 * - No raw OCR/content/prompt/AI response stored.
 * - Audit trail is append-only in erp_ai_field_suggestion_events.
 * - No accept/reject/apply logic here.
 */

import { createClient } from "@/lib/supabase/server";
import type { ErpAiFieldSuggestionDraft, ErpAiEntityType } from "../types";
import {
  ERP_COMMON_AI_PROMPT_VERSION,
  ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS,
  ERP_COMMON_AI_MAX_REASON_CHARS,
} from "../constants";

// ── Result types ──────────────────────────────────────────────────────────────

export interface SupersedeResult {
  supersededCount: number;
  supersededIds: number[];
}

export interface InsertResult {
  insertedCount: number;
  generationBatchId: number;
  insertedIds: number[];
}

// ── Supersede pending suggestions ─────────────────────────────────────────────

/**
 * Supersedes all currently pending suggestions for an entity.
 * Must be called BEFORE inserting new pending suggestions to avoid unique index violation.
 *
 * @param entityType - Entity type
 * @param entityId - Entity record ID
 * @param userProfileId - User performing the operation (for updated_by)
 * @returns Count and IDs of superseded suggestions
 */
export async function supersedePendingSuggestions(
  entityType: ErpAiEntityType,
  entityId: number,
  userProfileId: number
): Promise<SupersedeResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("erp_ai_field_suggestions")
    .update({
      status: "superseded",
      updated_at: new Date().toISOString(),
      updated_by: userProfileId,
    })
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .eq("status", "pending")
    .is("deleted_at", null)
    .select("id");

  if (error) {
    // Non-fatal: log safely and continue (generation proceeds with potential unique conflict)
    return { supersededCount: 0, supersededIds: [] };
  }

  const ids = (data ?? []).map((r) => (r as { id: number }).id);
  return { supersededCount: ids.length, supersededIds: ids };
}

/**
 * Inserts superseded events for each superseded suggestion ID.
 * Best-effort: non-fatal if any event insert fails.
 */
export async function insertSupersededEvents(
  supersededIds: number[],
  actorUserId: number
): Promise<void> {
  if (supersededIds.length === 0) return;

  const supabase = await createClient();

  const events = supersededIds.map((id) => ({
    suggestion_id: id,
    event_type: "superseded",
    actor_user_id: actorUserId,
    event_data_json: { reason: "new_generation_run" },
    created_at: new Date().toISOString(),
  }));

  await supabase
    .from("erp_ai_field_suggestion_events")
    .insert(events);
  // Non-fatal — ignore errors
}

// ── Insert new pending suggestions ────────────────────────────────────────────

/**
 * Inserts validated field suggestion drafts as pending suggestions.
 * Uses timestamp-derived batch ID (epoch ms) — avoids requiring a DB sequence.
 *
 * @param entityType - Entity type
 * @param entityId - Entity record ID
 * @param registry_targetTable - Not used here; stored per-suggestion from draft
 * @param suggestions - Validated suggestion drafts from output-validator
 * @param userProfileId - Creating user's profile ID
 * @returns Insert result with batch ID
 */
export async function insertPendingSuggestions(
  entityType: ErpAiEntityType,
  entityId: number,
  suggestions: ErpAiFieldSuggestionDraft[],
  userProfileId: number,
  targetTableByField: Map<string, string>
): Promise<InsertResult> {
  if (suggestions.length === 0) {
    return { insertedCount: 0, generationBatchId: 0, insertedIds: [] };
  }

  const supabase = await createClient();

  // Use epoch ms as batch ID (safe BIGINT, no migration required)
  const generationBatchId = Date.now();

  const now = new Date().toISOString();

  const rows = suggestions.map((s) => ({
    entity_type: entityType,
    entity_id: entityId,
    target_table: targetTableByField.get(s.targetField) ?? "",
    target_field: s.targetField,
    field_label: s.fieldLabel,
    field_type: s.fieldType,
    current_value: s.currentValue ? String(s.currentValue).slice(0, 2000) : null,
    suggested_value: s.suggestedValue
      ? String(s.suggestedValue).slice(0, 2000)
      : null,
    suggested_value_json: s.suggestedValueJson ?? null,
    suggestion_type: s.suggestionType,
    confidence_score: s.confidenceScore,
    source_document_id: s.sourceDocumentId ?? null,
    source_file_id: s.sourceFileId ?? null,
    source_document_type: s.sourceDocumentType ?? null,
    // Hard caps enforced by DB constraints AND here
    source_excerpt: s.sourceExcerpt
      ? s.sourceExcerpt.slice(0, ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS)
      : null,
    ai_reason: s.aiReason
      ? s.aiReason.slice(0, ERP_COMMON_AI_MAX_REASON_CHARS)
      : null,
    status: "pending",
    prompt_version: ERP_COMMON_AI_PROMPT_VERSION,
    generation_batch_id: generationBatchId,
    created_by: userProfileId,
    updated_by: userProfileId,
    created_at: now,
    updated_at: now,
  }));

  const { data, error } = await supabase
    .from("erp_ai_field_suggestions")
    .insert(rows)
    .select("id");

  if (error) {
    throw new Error(`Failed to insert AI field suggestions: ${error.message.slice(0, 200)}`);
  }

  const insertedIds = (data ?? []).map((r) => (r as { id: number }).id);

  return {
    insertedCount: insertedIds.length,
    generationBatchId,
    insertedIds,
  };
}

// ── Insert generated events ───────────────────────────────────────────────────

/**
 * Inserts a "generated" event for each inserted suggestion.
 * Safe event_data_json only — no prompt/evidence/OCR/raw response.
 */
export async function insertGeneratedEvents(
  insertedIds: number[],
  suggestions: ErpAiFieldSuggestionDraft[],
  actorUserId: number
): Promise<void> {
  if (insertedIds.length === 0) return;

  const supabase = await createClient();

  const events = insertedIds.map((id, i) => {
    const s = suggestions[i];
    return {
      suggestion_id: id,
      event_type: "generated",
      actor_user_id: actorUserId,
      event_data_json: {
        promptVersion: ERP_COMMON_AI_PROMPT_VERSION,
        suggestionType: s?.suggestionType ?? null,
        confidenceScore: s?.confidenceScore ?? null,
        sourceDocumentId: s?.sourceDocumentId ?? null,
        sourceFileId: s?.sourceFileId ?? null,
      },
      created_at: new Date().toISOString(),
    };
  });

  await supabase
    .from("erp_ai_field_suggestion_events")
    .insert(events);
  // Best-effort — non-fatal
}

// ── Usage log helper ──────────────────────────────────────────────────────────

export interface UsageLogInput {
  configId: number | null;
  model: string | null;
  entityType: ErpAiEntityType;
  entityId: number;
  suggestionCount: number;
  promptTokens: number | null;
  completionTokens: number | null;
  durationMs: number;
  status: "complete" | "failed" | "failed_validation" | "no_evidence";
  errorMessage?: string | null;
  userProfileId: number;
}

/**
 * Logs safe metadata to erp_ai_usage_logs.
 * Never logs prompts, raw responses, evidence text, or field values.
 * Non-fatal — best-effort.
 */
export async function logCommonAiUsage(input: UsageLogInput): Promise<void> {
  try {
    const supabase = await createClient();

    await supabase.from("erp_ai_usage_logs").insert({
      provider_config_id: input.configId,
      feature_area: "ERP_AI_FIELD_SUGGESTIONS",
      operation_type: "generate_field_suggestions",
      model_id: input.model,
      status: input.status,
      input_token_count: input.promptTokens,
      output_token_count: input.completionTokens,
      duration_ms: input.durationMs,
      error_message: input.errorMessage
        ? input.errorMessage.slice(0, 300)
        : null,
      metadata_json: {
        entity_type: input.entityType,
        entity_id: input.entityId,
        suggestion_count: input.suggestionCount,
        prompt_version: ERP_COMMON_AI_PROMPT_VERSION,
      },
      created_by: input.userProfileId,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Non-fatal — never throw from usage log
  }
}
