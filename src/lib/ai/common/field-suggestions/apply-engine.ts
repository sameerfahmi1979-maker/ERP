/**
 * ERP COMMON AI.1E — Apply Engine
 *
 * Orchestrates applying an accepted AI field suggestion to the target ERP record.
 * Called by the server action after all permission and status checks.
 *
 * Rules:
 * - Only Stage 1 entities (company, party) are supported.
 * - Branch/Site apply is blocked until Stage 2 approval.
 * - Suggestion must be in "accepted" status before apply is called.
 * - Only registered, AI-eligible fields may be applied.
 * - No auto-apply — caller must have already accepted the suggestion.
 * - FK fields are blocked in Phase 1E (see apply-handlers.ts).
 * - No prompt/OCR/evidence text is written to target or event tables.
 */

import { createClient } from "@/lib/supabase/server";
import { isGloballyNonUpdatableField } from "../non-updatable-fields";
import { getCommonAiEntityRegistry } from "../registry/index";
import type { ErpAiEntityType, ErpAiFieldType } from "../types";
import { APPLY_HANDLER_REGISTRY } from "./apply-handlers";

// ── Types ─────────────────────────────────────────────────────────────────────

/** A suggestion row loaded from DB for apply processing. */
export interface SuggestionForApply {
  id: number;
  entityType: ErpAiEntityType;
  entityId: number;
  targetTable: string;
  targetField: string;
  fieldLabel: string;
  fieldType: ErpAiFieldType;
  suggestedValue: string | null;
  suggestedValueJson: unknown | null;
  status: string;
  applyHandlerKey: string | null;
  deletedAt: string | null;
}

export interface ApplySuggestionResult {
  success: boolean;
  suggestionId: number;
  entityType: ErpAiEntityType;
  entityId: number;
  targetTable: string;
  targetField: string;
  status: "applied" | "failed";
  message?: string;
  /** Sanitized old value for audit (never raw AI response). */
  oldValue?: string | null;
}

// ── Load suggestion ───────────────────────────────────────────────────────────

/**
 * Loads a suggestion row from DB by ID.
 * Returns null if not found or soft-deleted.
 */
export async function loadSuggestionForApply(
  suggestionId: number
): Promise<SuggestionForApply | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("erp_ai_field_suggestions")
    .select(
      "id, entity_type, entity_id, target_table, target_field, field_label, field_type, suggested_value, suggested_value_json, status, deleted_at"
    )
    .eq("id", suggestionId)
    .is("deleted_at", null)
    .single();

  if (error || !data) return null;

  const row = data as Record<string, unknown>;

  // Look up applyHandlerKey from the registry
  const entityType = row.entity_type as ErpAiEntityType;
  const registry = getCommonAiEntityRegistry(entityType);
  const field = registry?.fields.find(
    (f) =>
      f.targetTable === (row.target_table as string) &&
      f.targetField === (row.target_field as string)
  );

  return {
    id: row.id as number,
    entityType,
    entityId: row.entity_id as number,
    targetTable: row.target_table as string,
    targetField: row.target_field as string,
    fieldLabel: row.field_label as string,
    fieldType: row.field_type as ErpAiFieldType,
    suggestedValue: (row.suggested_value as string | null) ?? null,
    suggestedValueJson: (row.suggested_value_json as unknown) ?? null,
    status: row.status as string,
    applyHandlerKey: field?.applyHandlerKey ?? null,
    deletedAt: (row.deleted_at as string | null) ?? null,
  };
}

// ── Apply engine entry point ──────────────────────────────────────────────────

/**
 * Applies a suggestion to the target ERP field via the registered apply handler.
 *
 * @param suggestionId - The ID of the accepted suggestion to apply.
 * @param userProfileId - The user performing the apply.
 * @returns ApplySuggestionResult with success/failure status and safe message.
 */
export async function applyAiSuggestionByRegisteredHandler(
  suggestionId: number,
  userProfileId: number
): Promise<ApplySuggestionResult> {
  // ── 1. Load suggestion ─────────────────────────────────────────────────────
  const suggestion = await loadSuggestionForApply(suggestionId);
  if (!suggestion) {
    return {
      success: false,
      suggestionId,
      entityType: "company",
      entityId: 0,
      targetTable: "",
      targetField: "",
      status: "failed",
      message: "Suggestion not found or has been deleted.",
    };
  }

  // ── 2. Status validation ───────────────────────────────────────────────────
  if (suggestion.status !== "accepted") {
    return {
      success: false,
      suggestionId,
      entityType: suggestion.entityType,
      entityId: suggestion.entityId,
      targetTable: suggestion.targetTable,
      targetField: suggestion.targetField,
      status: "failed",
      message: `Suggestion status is "${suggestion.status}". Only "accepted" suggestions can be applied.`,
    };
  }

  // ── 3. Stage gate — block branch/site ─────────────────────────────────────
  const STAGE_1_TYPES: ReadonlyArray<string> = ["company", "party"];
  if (!STAGE_1_TYPES.includes(suggestion.entityType)) {
    return {
      success: false,
      suggestionId,
      entityType: suggestion.entityType,
      entityId: suggestion.entityId,
      targetTable: suggestion.targetTable,
      targetField: suggestion.targetField,
      status: "failed",
      message: `Apply for "${suggestion.entityType}" is not active yet. Stage 2 requires separate approval.`,
    };
  }

  // ── 4. Registry validation ────────────────────────────────────────────────
  const registry = getCommonAiEntityRegistry(suggestion.entityType);
  if (!registry) {
    return {
      success: false,
      suggestionId,
      entityType: suggestion.entityType,
      entityId: suggestion.entityId,
      targetTable: suggestion.targetTable,
      targetField: suggestion.targetField,
      status: "failed",
      message: `Entity type "${suggestion.entityType}" is not registered in the Common AI engine.`,
    };
  }

  const registeredField = registry.fields.find(
    (f) =>
      f.targetTable === suggestion.targetTable &&
      f.targetField === suggestion.targetField &&
      f.isAiEligible === true
  );

  if (!registeredField) {
    return {
      success: false,
      suggestionId,
      entityType: suggestion.entityType,
      entityId: suggestion.entityId,
      targetTable: suggestion.targetTable,
      targetField: suggestion.targetField,
      status: "failed",
      message: `Field "${suggestion.targetField}" on "${suggestion.targetTable}" is not registered as AI-eligible.`,
    };
  }

  // ── 5. Non-updatable field guard ───────────────────────────────────────────
  if (
    isGloballyNonUpdatableField(suggestion.targetField) &&
    !(registeredField.fieldType === "fk" && registeredField.allowForeignKeyUpdate)
  ) {
    return {
      success: false,
      suggestionId,
      entityType: suggestion.entityType,
      entityId: suggestion.entityId,
      targetTable: suggestion.targetTable,
      targetField: suggestion.targetField,
      status: "failed",
      message: `Field "${suggestion.targetField}" is globally non-updatable and cannot be applied.`,
    };
  }

  // ── 6. Apply handler lookup ────────────────────────────────────────────────
  const handlerKey = suggestion.applyHandlerKey ?? registeredField.applyHandlerKey;
  const handler = APPLY_HANDLER_REGISTRY[handlerKey];

  if (!handler) {
    return {
      success: false,
      suggestionId,
      entityType: suggestion.entityType,
      entityId: suggestion.entityId,
      targetTable: suggestion.targetTable,
      targetField: suggestion.targetField,
      status: "failed",
      message: `No apply handler found for key "${handlerKey}". Field must be applied manually.`,
    };
  }

  // ── 7. Execute handler ────────────────────────────────────────────────────
  const handlerResult = await handler({
    entityId: suggestion.entityId,
    suggestedValue: suggestion.suggestedValue,
    fieldType: suggestion.fieldType,
    maxLength: registeredField.maxLength,
    allowClear: registeredField.allowClear,
  });

  // ── 8. Update suggestion status ────────────────────────────────────────────
  await updateSuggestionStatus(
    suggestionId,
    handlerResult.success ? "applied" : "failed",
    userProfileId,
    handlerResult.success ? null : handlerResult.message
  );

  return {
    success: handlerResult.success,
    suggestionId,
    entityType: suggestion.entityType,
    entityId: suggestion.entityId,
    targetTable: suggestion.targetTable,
    targetField: suggestion.targetField,
    status: handlerResult.success ? "applied" : "failed",
    message: handlerResult.message,
    oldValue: handlerResult.oldValue,
  };
}

// ── Status updater ────────────────────────────────────────────────────────────

/**
 * Updates a suggestion's status column.
 * Used internally by accept/reject/apply operations.
 */
export async function updateSuggestionStatus(
  suggestionId: number,
  newStatus: "accepted" | "rejected" | "applied" | "failed",
  userProfileId: number,
  applyError?: string | null,
  extraFields?: {
    accepted_by?: number;
    accepted_at?: string;
    rejected_by?: number;
    rejected_at?: string;
    applied_by?: number;
    applied_at?: string;
  }
): Promise<{ success: boolean }> {
  try {
    const supabase = await createClient();

    const now = new Date().toISOString();

    const update: Record<string, unknown> = {
      status: newStatus,
      updated_at: now,
      updated_by: userProfileId,
    };

    if (applyError !== undefined) {
      update.apply_error = applyError ? applyError.slice(0, 500) : null;
    }

    if (extraFields) {
      Object.assign(update, extraFields);
    }

    const { error } = await supabase
      .from("erp_ai_field_suggestions")
      .update(update)
      .eq("id", suggestionId)
      .is("deleted_at", null);

    return { success: !error };
  } catch {
    return { success: false };
  }
}

// ── Insert single event ───────────────────────────────────────────────────────

/**
 * Inserts a lifecycle event for a suggestion.
 * event_data_json contains safe metadata only.
 */
export async function insertSuggestionEvent(
  suggestionId: number,
  eventType: "accepted" | "rejected" | "applied" | "apply_failed" | "superseded" | "status_changed",
  actorUserId: number,
  safeData: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("erp_ai_field_suggestion_events").insert({
      suggestion_id: suggestionId,
      event_type: eventType,
      actor_user_id: actorUserId,
      event_data_json: safeData,
      created_at: new Date().toISOString(),
    });
  } catch {
    // Best-effort — never throw from event insert
  }
}
