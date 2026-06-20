"use server";

/**
 * ERP COMMON AI.1D — Field Suggestions Server Actions
 *
 * Phase 1D: Full generation implemented.
 * - generateAiFieldSuggestions: full pipeline (evidence → AI → validate → persist)
 * - getAiFieldSuggestions: implemented read
 * - supersedeAiFieldSuggestions: implemented (also called internally by generate)
 * - accept/reject/apply: Phase 1E skeleton (gated)
 *
 * Security rules (enforced):
 * - No raw prompt/response/OCR/evidence text returned to client or logged
 * - Stage 1 only: company + party
 * - ERP_AI_FORM_FILL feature flag required for generation
 * - DMS confidentiality respected via evidence loader
 */

import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { z } from "zod";
import {
  lookupCommonAiRegistry,
  isCommonAiEntityType,
} from "@/lib/ai/common/registry/index";
import {
  ERP_COMMON_AI_STAGE_1_ENTITY_TYPES,
  ERP_COMMON_AI_PROMPT_VERSION,
} from "@/lib/ai/common/constants";
import { loadLinkedDmsDocumentEvidence } from "@/lib/ai/common/field-suggestions/evidence-loader";
import { loadCurrentRecordSnapshot } from "@/lib/ai/common/field-suggestions/current-record-loader";
import {
  buildErpAiFieldSuggestionPrompt,
} from "@/lib/ai/common/field-suggestions/prompt-builder";
import { validateErpAiSuggestionOutput } from "@/lib/ai/common/field-suggestions/output-validator";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import {
  supersedePendingSuggestions,
  insertSupersededEvents,
  insertPendingSuggestions,
  insertGeneratedEvents,
  logCommonAiUsage,
} from "@/lib/ai/common/field-suggestions/persistence";
import {
  applyAiSuggestionByRegisteredHandler,
  updateSuggestionStatus,
  insertSuggestionEvent,
  loadSuggestionForApply,
} from "@/lib/ai/common/field-suggestions/apply-engine";
import { revalidatePath } from "next/cache";

// ── Shared ActionResult type ──────────────────────────────────────────────────

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string }
  : { success: boolean; data?: T; error?: string };

// ── DB row type ───────────────────────────────────────────────────────────────

export interface AiFieldSuggestionRow {
  id: number;
  entityType: string;
  entityId: number;
  targetTable: string;
  targetField: string;
  fieldLabel: string;
  fieldType: string;
  currentValue: string | null;
  suggestedValue: string | null;
  suggestedValueJson: unknown | null;
  suggestionType: string;
  confidenceScore: number | null;
  sourceDocumentId: number | null;
  sourceFileId: number | null;
  sourceDocumentType: string | null;
  sourceExcerpt: string | null;
  aiReason: string | null;
  status: string;
  acceptedBy: number | null;
  acceptedAt: string | null;
  rejectedBy: number | null;
  rejectedAt: string | null;
  appliedBy: number | null;
  appliedAt: string | null;
  applyError: string | null;
  generationBatchId: number | null;
  promptVersion: string | null;
  createdAt: string;
  createdBy: number | null;
  updatedAt: string;
}

// ── Zod Input Schemas ─────────────────────────────────────────────────────────

const entitySuggestionInputSchema = z.object({
  entityType: z.enum(["company", "party", "branch", "site"]),
  entityId: z.coerce.number().int().positive(),
});

const suggestionIdInputSchema = z.object({
  suggestionId: z.coerce.number().int().positive(),
});

const selectedSuggestionsInputSchema = z.object({
  entityType: z.enum(["company", "party", "branch", "site"]),
  entityId: z.coerce.number().int().positive(),
  suggestionIds: z
    .array(z.coerce.number().int().positive())
    .min(1)
    .max(50),
});

const getAiFieldSuggestionsInputSchema = entitySuggestionInputSchema.extend({
  status: z
    .enum(["pending", "accepted", "rejected", "superseded", "applied", "failed"])
    .optional(),
});

// ── Feature flag helper ───────────────────────────────────────────────────────

async function isErpAiFormFillEnabled(): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "ERP_AI_FORM_FILL")
      .single();
    return data?.is_enabled === true;
  } catch {
    return false;
  }
}

// ── Entity view/manage permission helpers (TS-side) ───────────────────────────

function getEntityViewPermission(entityType: string): string | null {
  switch (entityType) {
    case "company": return "organizations.view";
    case "party":   return "master_data.party_master.view";
    case "branch":  return "branches.view";
    case "site":    return "common_md.work_sites.view";
    default:        return null;
  }
}

function getEntityManagePermission(entityType: string): string | null {
  switch (entityType) {
    case "company": return "organizations.manage";
    case "party":   return "master_data.party_master.manage";
    case "branch":  return "branches.manage";
    case "site":    return "common_md.work_sites.manage";
    default:        return null;
  }
}

// ── Row mapper ────────────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): AiFieldSuggestionRow {
  return {
    id: row.id as number,
    entityType: row.entity_type as string,
    entityId: row.entity_id as number,
    targetTable: row.target_table as string,
    targetField: row.target_field as string,
    fieldLabel: row.field_label as string,
    fieldType: row.field_type as string,
    currentValue: (row.current_value as string | null) ?? null,
    suggestedValue: (row.suggested_value as string | null) ?? null,
    suggestedValueJson: (row.suggested_value_json as unknown | null) ?? null,
    suggestionType: row.suggestion_type as string,
    confidenceScore:
      row.confidence_score != null
        ? parseFloat(String(row.confidence_score))
        : null,
    sourceDocumentId: (row.source_document_id as number | null) ?? null,
    sourceFileId: (row.source_file_id as number | null) ?? null,
    sourceDocumentType: (row.source_document_type as string | null) ?? null,
    sourceExcerpt: (row.source_excerpt as string | null) ?? null,
    aiReason: (row.ai_reason as string | null) ?? null,
    status: row.status as string,
    acceptedBy: (row.accepted_by as number | null) ?? null,
    acceptedAt: (row.accepted_at as string | null) ?? null,
    rejectedBy: (row.rejected_by as number | null) ?? null,
    rejectedAt: (row.rejected_at as string | null) ?? null,
    appliedBy: (row.applied_by as number | null) ?? null,
    appliedAt: (row.applied_at as string | null) ?? null,
    applyError: (row.apply_error as string | null) ?? null,
    generationBatchId: (row.generation_batch_id as number | null) ?? null,
    promptVersion: (row.prompt_version as string | null) ?? null,
    createdAt: row.created_at as string,
    createdBy: (row.created_by as number | null) ?? null,
    updatedAt: row.updated_at as string,
  };
}

// ── 1. getAiFieldSuggestions — Implemented read action ───────────────────────

/**
 * Reads AI field suggestions for a given entity.
 *
 * Permissions required:
 *   - Target entity view permission (from registry)
 *   - ai.field_suggestions.view
 */
export async function getAiFieldSuggestions(
  input: unknown
): Promise<ActionResult<AiFieldSuggestionRow[]>> {
  try {
    const parsed = getAiFieldSuggestionsInputSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid input: " + parsed.error.issues[0]?.message };
    }
    const { entityType, entityId, status } = parsed.data;

    const ctx = await getAuthContext();

    if (!hasPermission(ctx, "ai.field_suggestions.view")) {
      return { success: false, error: "You do not have permission to view AI field suggestions." };
    }

    const entityViewPerm = getEntityViewPermission(entityType);
    if (
      !entityViewPerm ||
      (!hasPermission(ctx, entityViewPerm) && !hasPermission(ctx, "ai.common.admin"))
    ) {
      return { success: false, error: "You do not have permission to view this entity." };
    }

    const supabase = await createClient();
    let query = supabase
      .from("erp_ai_field_suggestions")
      .select("*")
      .eq("entity_type", entityType)
      .eq("entity_id", entityId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
    if (error) return { success: false, error: error.message };

    return {
      success: true,
      data: (data ?? []).map((row) => mapRow(row as Record<string, unknown>)),
    };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── 2. generateAiFieldSuggestions — Gated skeleton (Phase 1D implements) ─────

// ── Generation result type ────────────────────────────────────────────────────

export interface GenerationResult {
  entityType: string;
  entityId: number;
  generatedCount: number;
  supersededCount: number;
  linkedDocumentCount: number;
  skippedConfidentialCount: number;
  generationBatchId: number;
}

/**
 * Generates AI field suggestions for a given Stage 1 entity (company or party).
 *
 * Full pipeline:
 *   auth → permission gates → feature flag → registry → evidence loader →
 *   current record snapshot → prompt builder → AI call → output validator →
 *   supersede old pending → insert new pending → insert events → usage log → audit
 *
 * Returns safe metadata only — never evidence text, prompts, or raw AI response.
 */
export async function generateAiFieldSuggestions(
  input: unknown
): Promise<ActionResult<GenerationResult>> {
  try {
    const parsed = entitySuggestionInputSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid input: " + parsed.error.issues[0]?.message };
    }
    const { entityType, entityId } = parsed.data;

    const ctx = await getAuthContext();
    const userProfileId = ctx.profile?.id ?? 0;

    // ── 1. Feature flag gate ───────────────────────────────────────────────────
    const flagEnabled = await isErpAiFormFillEnabled();
    if (!flagEnabled) {
      return {
        success: false,
        error: "Common AI form fill is not yet enabled. Contact your system administrator to enable ERP_AI_FORM_FILL.",
      };
    }

    // ── 2. Permission gates ────────────────────────────────────────────────────
    if (!hasPermission(ctx, "ai.field_suggestions.generate") && !hasPermission(ctx, "ai.common.admin")) {
      return { success: false, error: "You do not have permission to generate AI field suggestions." };
    }
    if (!hasPermission(ctx, "dms.documents.view") && !hasPermission(ctx, "dms.admin")) {
      return { success: false, error: "You do not have permission to view DMS documents (required for AI evidence)." };
    }
    const entityViewPerm = getEntityViewPermission(entityType);
    if (!entityViewPerm || (!hasPermission(ctx, entityViewPerm) && !hasPermission(ctx, "ai.common.admin"))) {
      return { success: false, error: "You do not have permission to access this entity." };
    }

    // ── 3. Registry + stage validation ────────────────────────────────────────
    const lookup = lookupCommonAiRegistry(entityType);
    if (!lookup.found || !lookup.registry) {
      return { success: false, error: `Entity type "${entityType}" is not registered in the Common AI engine.` };
    }
    if (!lookup.isActiveStage) {
      return {
        success: false,
        error: `AI generation for "${entityType}" is not yet available (Stage 2 — pending Stage 1 UAT).`,
      };
    }
    const stage1Types: ReadonlyArray<string> = ERP_COMMON_AI_STAGE_1_ENTITY_TYPES;
    if (!stage1Types.includes(entityType)) {
      return {
        success: false,
        error: `AI generation is currently limited to Stage 1 entities: ${ERP_COMMON_AI_STAGE_1_ENTITY_TYPES.join(", ")}.`,
      };
    }

    const registry = lookup.registry;
    const registeredFields = registry.fields.filter((f) => f.isAiEligible === true);

    // ── 4. Load DMS evidence ──────────────────────────────────────────────────
    const isAdmin =
      hasPermission(ctx, "dms.admin") ||
      ctx.roleCodes?.includes("system_admin") === true;

    const evidenceResult = await loadLinkedDmsDocumentEvidence({
      entityType,
      entityId,
      registry,
      userProfileId,
      isAdmin,
    });

    if (evidenceResult.snippets.length === 0) {
      return {
        success: false,
        error: `No linked DMS documents found with accessible content (${evidenceResult.totalLinked} linked, ${evidenceResult.skippedConfidential} confidential skipped). Link relevant documents before generating suggestions.`,
      };
    }

    // ── 5. Load current record snapshot ──────────────────────────────────────
    const currentRecord = await loadCurrentRecordSnapshot(entityType, entityId, registry);

    // ── 6. Build prompt ───────────────────────────────────────────────────────
    const builtPrompt = buildErpAiFieldSuggestionPrompt({
      entityType,
      entityId,
      promptVersion: ERP_COMMON_AI_PROMPT_VERSION,
      currentRecord,
      registeredFields,
      evidenceSnippets: evidenceResult.snippets,
    });

    // ── 7. Call AI provider via shared bridge (no direct OpenAI) ─────────────
    const aiResult = await callCommonAiStructuredCompletion(
      builtPrompt.systemPrompt,
      builtPrompt.userPrompt,
      { maxTokens: 4000, temperature: 0 }
    );

    if (!aiResult.success) {
      await logCommonAiUsage({
        configId: null,
        model: null,
        entityType,
        entityId,
        suggestionCount: 0,
        promptTokens: null,
        completionTokens: null,
        durationMs: aiResult.durationMs,
        status: "failed",
        errorMessage: aiResult.error,
        userProfileId,
      });
      return { success: false, error: aiResult.error };
    }

    // ── 8. Validate AI output ─────────────────────────────────────────────────
    const validation = validateErpAiSuggestionOutput(aiResult.rawJson, registry);

    if (!validation.ok || !validation.output) {
      await logCommonAiUsage({
        configId: aiResult.configId,
        model: aiResult.model,
        entityType,
        entityId,
        suggestionCount: 0,
        promptTokens: aiResult.promptTokens,
        completionTokens: aiResult.completionTokens,
        durationMs: aiResult.durationMs,
        status: "failed_validation",
        errorMessage: validation.error ?? "Output validation failed",
        userProfileId,
      });
      return {
        success: false,
        error: "AI output failed validation — no suggestions stored. Please try again.",
      };
    }

    const validatedSuggestions = validation.output.suggestions;

    if (validatedSuggestions.length === 0) {
      await logCommonAiUsage({
        configId: aiResult.configId,
        model: aiResult.model,
        entityType,
        entityId,
        suggestionCount: 0,
        promptTokens: aiResult.promptTokens,
        completionTokens: aiResult.completionTokens,
        durationMs: aiResult.durationMs,
        status: "complete",
        userProfileId,
      });
      return {
        success: true,
        data: {
          entityType,
          entityId,
          generatedCount: 0,
          supersededCount: 0,
          linkedDocumentCount: evidenceResult.totalLinked,
          skippedConfidentialCount: evidenceResult.skippedConfidential,
          generationBatchId: 0,
        },
      };
    }

    // ── 9. Target-table lookup map ────────────────────────────────────────────
    const targetTableByField = new Map<string, string>(
      registeredFields.map((f) => [f.targetField, f.targetTable])
    );

    // ── 10. Supersede old pending suggestions (required before insert) ─────────
    const supersedeResult = await supersedePendingSuggestions(
      entityType,
      entityId,
      userProfileId
    );
    if (supersedeResult.supersededIds.length > 0) {
      await insertSupersededEvents(supersedeResult.supersededIds, userProfileId);
    }

    // ── 11. Insert new pending suggestions ────────────────────────────────────
    let insertResult;
    try {
      insertResult = await insertPendingSuggestions(
        entityType,
        entityId,
        validatedSuggestions,
        userProfileId,
        targetTableByField
      );
    } catch (insertErr) {
      await logCommonAiUsage({
        configId: aiResult.configId,
        model: aiResult.model,
        entityType,
        entityId,
        suggestionCount: 0,
        promptTokens: aiResult.promptTokens,
        completionTokens: aiResult.completionTokens,
        durationMs: aiResult.durationMs,
        status: "failed",
        errorMessage: String(insertErr).slice(0, 200),
        userProfileId,
      });
      return { success: false, error: "Failed to store AI suggestions. Please try again." };
    }

    // ── 12. Insert generated events (best-effort) ─────────────────────────────
    await insertGeneratedEvents(insertResult.insertedIds, validatedSuggestions, userProfileId);

    // ── 13. Log safe usage metadata ───────────────────────────────────────────
    await logCommonAiUsage({
      configId: aiResult.configId,
      model: aiResult.model,
      entityType,
      entityId,
      suggestionCount: insertResult.insertedCount,
      promptTokens: aiResult.promptTokens,
      completionTokens: aiResult.completionTokens,
      durationMs: aiResult.durationMs,
      status: "complete",
      userProfileId,
    });

    // ── 14. Safe audit event (counts only — no content) ───────────────────────
    await logAudit({
      module_code: "AI",
      entity_name: "erp_ai_field_suggestions",
      entity_id: entityId,
      entity_reference: `${entityType}:${entityId}`,
      action: "erp_ai_field_suggestions_generated",
      new_values: {
        entityType,
        entityId,
        suggestionCount: insertResult.insertedCount,
        supersededCount: supersedeResult.supersededCount,
        linkedDocumentCount: evidenceResult.totalLinked,
        skippedConfidentialCount: evidenceResult.skippedConfidential,
        promptVersion: ERP_COMMON_AI_PROMPT_VERSION,
        generationBatchId: insertResult.generationBatchId,
      },
    });

    return {
      success: true,
      data: {
        entityType,
        entityId,
        generatedCount: insertResult.insertedCount,
        supersededCount: supersedeResult.supersededCount,
        linkedDocumentCount: evidenceResult.totalLinked,
        skippedConfidentialCount: evidenceResult.skippedConfidential,
        generationBatchId: insertResult.generationBatchId,
      },
    };
  } catch (err) {
    return { success: false, error: `Generation failed: ${String(err).slice(0, 200)}` };
  }
}

// ── 3. acceptAiFieldSuggestion — Gated skeleton ───────────────────────────────

/**
 * Skeleton: Accept a single AI field suggestion (marks as accepted, not yet applied).
 *
 * Phase 1B: Gates only. Returns "not yet implemented" error.
 * Phase 1E: Will write accepted_by, accepted_at, insert event, return for apply.
 */
export async function acceptAiFieldSuggestion(
  input: unknown
): Promise<ActionResult> {
  try {
    const parsed = suggestionIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid input: " + parsed.error.issues[0]?.message };
    }

    const ctx = await getAuthContext();
    const userProfileId = ctx.profile?.id ?? 0;

    // Permission: accept requires entity manage + ai.field_suggestions.apply
    if (!hasPermission(ctx, "ai.field_suggestions.apply") && !hasPermission(ctx, "ai.common.admin")) {
      return { success: false, error: "You do not have permission to accept AI field suggestions." };
    }

    const { suggestionId } = parsed.data;

    // Load suggestion to check status and get entity info for permission check
    const suggestion = await loadSuggestionForApply(suggestionId);
    if (!suggestion) {
      return { success: false, error: "Suggestion not found." };
    }
    if (suggestion.status !== "pending") {
      return { success: false, error: `Suggestion is in "${suggestion.status}" status. Only pending suggestions can be accepted.` };
    }

    const entityManagePerm = getEntityManagePermission(suggestion.entityType);
    if (entityManagePerm && !hasPermission(ctx, entityManagePerm) && !hasPermission(ctx, "ai.common.admin")) {
      return { success: false, error: "You do not have permission to manage this entity." };
    }

    const now = new Date().toISOString();

    await updateSuggestionStatus(suggestionId, "accepted", userProfileId, null, {
      accepted_by: userProfileId,
      accepted_at: now,
    });

    await insertSuggestionEvent(suggestionId, "accepted", userProfileId, {
      fieldLabel: suggestion.fieldLabel,
      targetTable: suggestion.targetTable,
      targetField: suggestion.targetField,
      oldStatus: "pending",
      newStatus: "accepted",
    });

    await logAudit({
      module_code: "AI",
      entity_name: "erp_ai_field_suggestions",
      entity_id: suggestion.entityId,
      entity_reference: `${suggestion.entityType}:${suggestion.entityId}`,
      action: "erp_ai_field_suggestion_accepted",
      new_values: {
        suggestionId,
        entityType: suggestion.entityType,
        targetField: suggestion.targetField,
        fieldLabel: suggestion.fieldLabel,
        status: "accepted",
      },
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── 4. rejectAiFieldSuggestion — IMPLEMENTED (Phase 1E) ──────────────────────

/**
 * Rejects an AI field suggestion (pending or accepted).
 * Does not update the target ERP record.
 */
export async function rejectAiFieldSuggestion(
  input: unknown
): Promise<ActionResult> {
  try {
    const parsed = suggestionIdInputSchema
      .extend({ reason: z.string().max(500).optional() })
      .safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid input: " + parsed.error.issues[0]?.message };
    }

    const ctx = await getAuthContext();
    const userProfileId = ctx.profile?.id ?? 0;

    // Permission: reject requires entity view + ai.field_suggestions.view
    if (!hasPermission(ctx, "ai.field_suggestions.view") && !hasPermission(ctx, "ai.common.admin")) {
      return { success: false, error: "You do not have permission to reject AI field suggestions." };
    }

    const { suggestionId, reason } = parsed.data;

    const suggestion = await loadSuggestionForApply(suggestionId);
    if (!suggestion) {
      return { success: false, error: "Suggestion not found." };
    }
    if (!["pending", "accepted"].includes(suggestion.status)) {
      return { success: false, error: `Suggestion is in "${suggestion.status}" status. Only pending or accepted suggestions can be rejected.` };
    }

    const entityViewPerm = getEntityViewPermission(suggestion.entityType);
    if (entityViewPerm && !hasPermission(ctx, entityViewPerm) && !hasPermission(ctx, "ai.common.admin")) {
      return { success: false, error: "You do not have permission to view this entity." };
    }

    const now = new Date().toISOString();

    await updateSuggestionStatus(suggestionId, "rejected", userProfileId, null, {
      rejected_by: userProfileId,
      rejected_at: now,
    });

    await insertSuggestionEvent(suggestionId, "rejected", userProfileId, {
      fieldLabel: suggestion.fieldLabel,
      targetTable: suggestion.targetTable,
      targetField: suggestion.targetField,
      oldStatus: suggestion.status,
      newStatus: "rejected",
      safeReason: reason ? reason.slice(0, 300) : null,
    });

    await logAudit({
      module_code: "AI",
      entity_name: "erp_ai_field_suggestions",
      entity_id: suggestion.entityId,
      entity_reference: `${suggestion.entityType}:${suggestion.entityId}`,
      action: "erp_ai_field_suggestion_rejected",
      new_values: {
        suggestionId,
        entityType: suggestion.entityType,
        targetField: suggestion.targetField,
        fieldLabel: suggestion.fieldLabel,
        status: "rejected",
      },
    });

    return { success: true };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── 5. acceptSelectedAiFieldSuggestions — IMPLEMENTED (Phase 1E) ─────────────

export interface BatchAcceptApplyItemResult {
  suggestionId: number;
  targetField: string;
  status: "applied" | "failed" | "skipped";
  message?: string;
}

export interface BatchAcceptApplyResult {
  appliedCount: number;
  failedCount: number;
  skippedCount: number;
  items: BatchAcceptApplyItemResult[];
}

/**
 * Accepts and applies selected AI field suggestions for a given entity.
 * Processes sequentially with per-item results. Never all-at-once.
 */
export async function acceptSelectedAiFieldSuggestions(
  input: unknown
): Promise<ActionResult<BatchAcceptApplyResult>> {
  try {
    const parsed = selectedSuggestionsInputSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid input: " + parsed.error.issues[0]?.message };
    }

    const ctx = await getAuthContext();
    const userProfileId = ctx.profile?.id ?? 0;

    if (!hasPermission(ctx, "ai.field_suggestions.apply") && !hasPermission(ctx, "ai.common.admin")) {
      return { success: false, error: "You do not have permission to accept AI field suggestions." };
    }

    const { entityType, entityId, suggestionIds } = parsed.data;
    const entityManagePerm = getEntityManagePermission(entityType);
    if (entityManagePerm && !hasPermission(ctx, entityManagePerm) && !hasPermission(ctx, "ai.common.admin")) {
      return { success: false, error: "You do not have permission to manage this entity." };
    }

    const results: BatchAcceptApplyItemResult[] = [];
    const now = new Date().toISOString();

    for (const suggestionId of suggestionIds) {
      // Load suggestion
      const suggestion = await loadSuggestionForApply(suggestionId);
      if (!suggestion) {
        results.push({ suggestionId, targetField: "", status: "skipped", message: "Not found." });
        continue;
      }

      // Verify it belongs to this entity
      if (suggestion.entityType !== entityType || suggestion.entityId !== entityId) {
        results.push({ suggestionId, targetField: suggestion.targetField, status: "skipped", message: "Suggestion does not belong to this entity." });
        continue;
      }

      // Skip non-pending
      if (!["pending", "accepted"].includes(suggestion.status)) {
        results.push({ suggestionId, targetField: suggestion.targetField, status: "skipped", message: `Suggestion is "${suggestion.status}" — skipped.` });
        continue;
      }

      // Accept if pending
      if (suggestion.status === "pending") {
        await updateSuggestionStatus(suggestionId, "accepted", userProfileId, null, {
          accepted_by: userProfileId,
          accepted_at: now,
        });
        await insertSuggestionEvent(suggestionId, "accepted", userProfileId, {
          targetField: suggestion.targetField,
          oldStatus: "pending",
          newStatus: "accepted",
          batchOperation: true,
        });
      }

      // Apply
      const applyResult = await applyAiSuggestionByRegisteredHandler(suggestionId, userProfileId);

      await insertSuggestionEvent(
        suggestionId,
        applyResult.success ? "applied" : "apply_failed",
        userProfileId,
        {
          targetField: suggestion.targetField,
          applyHandlerKey: suggestion.applyHandlerKey ?? "",
          status: applyResult.status,
          safeMessage: applyResult.message ? applyResult.message.slice(0, 200) : null,
        }
      );

      if (applyResult.success) {
        await updateSuggestionStatus(suggestionId, "applied", userProfileId, null, {
          applied_by: userProfileId,
          applied_at: now,
        });
        results.push({ suggestionId, targetField: suggestion.targetField, status: "applied", message: applyResult.message });
      } else {
        results.push({ suggestionId, targetField: suggestion.targetField, status: "failed", message: applyResult.message });
      }
    }

    const appliedCount = results.filter((r) => r.status === "applied").length;
    const failedCount = results.filter((r) => r.status === "failed").length;
    const skippedCount = results.filter((r) => r.status === "skipped").length;

    // Audit the batch
    await logAudit({
      module_code: "AI",
      entity_name: "erp_ai_field_suggestions",
      entity_id: entityId,
      entity_reference: `${entityType}:${entityId}`,
      action: "erp_ai_field_suggestions_batch_accept_apply",
      new_values: { entityType, entityId, appliedCount, failedCount, skippedCount, totalRequested: suggestionIds.length },
    });

    revalidateEntityPath(entityType, entityId);

    return { success: true, data: { appliedCount, failedCount, skippedCount, items: results } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── 6. applyAiFieldSuggestion — IMPLEMENTED (Phase 1E) ───────────────────────

/**
 * Applies a single accepted AI field suggestion to the target ERP record.
 * Requires suggestion.status = "accepted".
 * Does NOT auto-apply — user must have explicitly accepted first.
 */
export async function applyAiFieldSuggestion(
  input: unknown
): Promise<ActionResult<{ targetField: string; status: string }>> {
  try {
    const parsed = suggestionIdInputSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid input: " + parsed.error.issues[0]?.message };
    }

    const ctx = await getAuthContext();
    const userProfileId = ctx.profile?.id ?? 0;

    if (!hasPermission(ctx, "ai.field_suggestions.apply") && !hasPermission(ctx, "ai.common.admin")) {
      return { success: false, error: "You do not have permission to apply AI field suggestions." };
    }

    const { suggestionId } = parsed.data;

    // Load suggestion for entity permission check
    const suggestion = await loadSuggestionForApply(suggestionId);
    if (!suggestion) {
      return { success: false, error: "Suggestion not found." };
    }

    const entityManagePerm = getEntityManagePermission(suggestion.entityType);
    if (entityManagePerm && !hasPermission(ctx, entityManagePerm) && !hasPermission(ctx, "ai.common.admin")) {
      return { success: false, error: "You do not have permission to manage this entity." };
    }

    // Call apply engine — validates status + handler + executes write
    const applyResult = await applyAiSuggestionByRegisteredHandler(suggestionId, userProfileId);

    const now = new Date().toISOString();

    await insertSuggestionEvent(
      suggestionId,
      applyResult.success ? "applied" : "apply_failed",
      userProfileId,
      {
        targetField: applyResult.targetField,
        targetTable: applyResult.targetTable,
        applyHandlerKey: suggestion.applyHandlerKey ?? "",
        status: applyResult.status,
        safeMessage: applyResult.message ? applyResult.message.slice(0, 200) : null,
      }
    );

    if (applyResult.success) {
      await updateSuggestionStatus(suggestionId, "applied", userProfileId, null, {
        applied_by: userProfileId,
        applied_at: now,
      });

      await logAudit({
        module_code: "AI",
        entity_name: "erp_ai_field_suggestions",
        entity_id: applyResult.entityId,
        entity_reference: `${applyResult.entityType}:${applyResult.entityId}`,
        action: "erp_ai_field_suggestion_applied",
        new_values: {
          suggestionId,
          entityType: applyResult.entityType,
          targetField: applyResult.targetField,
          fieldLabel: suggestion.fieldLabel,
          status: "applied",
        },
      });

      revalidateEntityPath(applyResult.entityType, applyResult.entityId);

      return { success: true, data: { targetField: applyResult.targetField, status: "applied" } };
    } else {
      await logAudit({
        module_code: "AI",
        entity_name: "erp_ai_field_suggestions",
        entity_id: applyResult.entityId,
        entity_reference: `${applyResult.entityType}:${applyResult.entityId}`,
        action: "erp_ai_field_suggestion_apply_failed",
        new_values: {
          suggestionId,
          entityType: applyResult.entityType,
          targetField: applyResult.targetField,
          status: "failed",
        },
      });

      return { success: false, error: applyResult.message ?? "Apply failed." };
    }
  } catch (err) {
    return { success: false, error: String(err) };
  }
}

// ── Revalidation helper ───────────────────────────────────────────────────────

function revalidateEntityPath(entityType: string, entityId: number): void {
  try {
    if (entityType === "company") {
      revalidatePath("/admin/organizations");
      revalidatePath(`/admin/organizations/record/${entityId}`);
    } else if (entityType === "party") {
      revalidatePath("/admin/master-data/parties");
      revalidatePath(`/admin/master-data/parties/record/${entityId}`);
    }
  } catch {
    // Non-fatal — revalidatePath may fail if not in a request context
  }
}

// ── 7. supersedeAiFieldSuggestions — IMPLEMENTED (Phase 1D) ──────────────────

/**
 * Supersedes all pending AI field suggestions for a given entity.
 * Also called internally by generateAiFieldSuggestions before inserting new ones.
 */
export async function supersedeAiFieldSuggestions(
  input: unknown
): Promise<ActionResult<{ supersededCount: number }>> {
  try {
    const parsed = entitySuggestionInputSchema.safeParse(input);
    if (!parsed.success) {
      return { success: false, error: "Invalid input: " + parsed.error.issues[0]?.message };
    }

    const ctx = await getAuthContext();
    if (!hasPermission(ctx, "ai.field_suggestions.generate") && !hasPermission(ctx, "ai.common.admin")) {
      return { success: false, error: "You do not have permission to supersede AI field suggestions." };
    }

    const { entityType, entityId } = parsed.data;
    const userProfileId = ctx.profile?.id ?? 0;

    const result = await supersedePendingSuggestions(entityType, entityId, userProfileId);
    if (result.supersededIds.length > 0) {
      await insertSupersededEvents(result.supersededIds, userProfileId);
    }

    return { success: true, data: { supersededCount: result.supersededCount } };
  } catch (err) {
    return { success: false, error: String(err) };
  }
}
