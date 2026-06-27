"use server";

/**
 * ERP DMS AI Phase 16 — Apply-to-ERP Server Actions
 *
 * Server actions for human-reviewed Apply-to-ERP operations.
 *
 * Tier 1 targets (DMS-only):
 *   - dms_documents FK fields (owning_company_id, owning_branch_id, party_id)
 *   - dms_documents basic fields (issue_date, expiry_date, title, description)
 *   - dms_document_metadata_values (via Phase 6/7 engine bridge)
 *
 * Tier 2 targets (Party child records — Tier 2 flags required):
 *   - party_licenses (license_number, license_name, license_activity_text, issue_date, expiry_date, remarks)
 *   - party_tax_registrations (tax_registration_number, effective_from, effective_to, remarks)
 *
 * Governance:
 *   - ALL writes require human confirmation (confirmedItemIds + humanReviewConfirmed)
 *   - ALL writes are feature-flag gated
 *   - Tier 2 requires: master + DMS_AI_APPLY_TO_ERP_PARTY + specific sub-flag
 *   - Dual permission: dms.apply_to_erp.run + target Party permission
 *   - Server-side revalidation before every write (record reloaded from DB)
 *   - Conflict detection: stale fields are skipped, not overwritten
 *   - Audit log every apply event (no raw content, TRN masked)
 *   - No HR writes
 *   - No direct parties/party_bank_details writes
 *   - No auto-apply, no auto-create, no auto-merge
 *   - Preview/create-run/get/list/getPartyApplyTargetRows are READ-ONLY
 *   - Only applyDmsApplyToErpRun() performs target record writes
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import {
  validateApplyTarget,
  isForbiddenTarget,
  getTargetPermissions,
} from "@/lib/dms/apply-to-erp/apply-target-registry";
import {
  normalizeApplyValue,
  buildValueSummary,
  buildPartyFieldSummary,
  truncateSummary,
} from "@/lib/dms/apply-to-erp/apply-value-normalizer";
import {
  detectDmsDocumentFieldConflict,
  detectPartyLicenseFieldConflict,
  detectPartyTaxFieldConflict,
  type PartyLicenseRecord,
  type PartyTaxRecord,
} from "@/lib/dms/apply-to-erp/apply-conflict-detector";
import {
  buildRunCreatedMeta,
  buildRunCompletedMeta,
  buildRunCancelledMeta,
  buildItemAppliedMeta,
  buildItemSkippedMeta,
} from "@/lib/dms/apply-to-erp/apply-audit";
import type {
  ActionResult,
  ApplyRunStatus,
  ApplyItemStatus,
  DmsErpApplyRun,
  DmsErpApplyItem,
  ApplyItemProposal,
  CreateApplyRunInput,
  ApplyRunConfirmation,
  ApplyRunResult,
  ApplyValueType,
  PartyApplyTargetKind,
  PartyLicenseRow,
  PartyTaxRow,
} from "@/lib/dms/apply-to-erp/types";

// ── Feature flag helpers ───────────────────────────────────────────────────────

async function isDmsApplyToErpEnabled(): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_AI_APPLY_TO_ERP")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

async function isDmsApplyToErpSubFlagEnabled(
  flagCode:
    | "DMS_AI_APPLY_TO_ERP_DMS_METADATA"
    | "DMS_AI_APPLY_TO_ERP_ENTITY_LINKS"
    | "DMS_AI_APPLY_TO_ERP_PARTY"
    | "DMS_AI_APPLY_TO_ERP_PARTY_LICENSES"
    | "DMS_AI_APPLY_TO_ERP_PARTY_TAX"
): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", flagCode)
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

/** Check all required Tier 2 party flags for a given target table. */
async function checkPartySubFlags(
  targetTable: "party_licenses" | "party_tax_registrations"
): Promise<{ ok: boolean; reason?: string }> {
  const partyGate = await isDmsApplyToErpSubFlagEnabled("DMS_AI_APPLY_TO_ERP_PARTY");
  if (!partyGate) return { ok: false, reason: "DMS_AI_APPLY_TO_ERP_PARTY is disabled" };

  if (targetTable === "party_licenses") {
    const ok = await isDmsApplyToErpSubFlagEnabled("DMS_AI_APPLY_TO_ERP_PARTY_LICENSES");
    if (!ok) return { ok: false, reason: "DMS_AI_APPLY_TO_ERP_PARTY_LICENSES is disabled" };
  } else {
    const ok = await isDmsApplyToErpSubFlagEnabled("DMS_AI_APPLY_TO_ERP_PARTY_TAX");
    if (!ok) return { ok: false, reason: "DMS_AI_APPLY_TO_ERP_PARTY_TAX is disabled" };
  }
  return { ok: true };
}

// ── Run code generator ─────────────────────────────────────────────────────────

function generateRunCode(): string {
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `APPLY-${ts}-${rand}`;
}

// ── Input Schemas ─────────────────────────────────────────────────────────────

const ApplyItemProposalSchema = z.object({
  sourceType:           z.enum(["extraction_result", "validation_finding", "entity_match_candidate", "dms_metadata_apply"]),
  sourceId:             z.number().int().positive().nullable().optional(),
  sourceFieldCode:      z.string().max(100).nullable().optional(),
  targetTable:          z.string().max(100),
  targetField:          z.string().max(100),
  targetRecordId:       z.number().int().positive().nullable().optional(),
  targetDisplayLabel:   z.string().max(200),
  currentValueSummary:  z.string().max(200).nullable().optional(),
  proposedValueSummary: z.string().max(200).nullable().optional(),
  valueType:            z.enum(["text", "date", "number", "boolean", "bigint"]),
  confidence:           z.number().min(0).max(1).nullable().optional(),
  requiresConfirmation: z.boolean().optional().default(true),
  conflictRisk:         z.boolean().optional().default(false),
});

const CreateRunInputSchema = z.object({
  sourceType:        z.enum(["extraction_result", "validation_finding", "entity_match_candidate", "dms_metadata_apply"]),
  sourceId:          z.number().int().positive().nullable().optional(),
  documentId:        z.number().int().positive(),
  reviewQueueItemId: z.number().int().positive().nullable().optional(),
  targetModule:      z.enum(["dms_document", "dms_metadata", "party"]),
  targetTable:       z.string().max(100),
  targetRecordId:    z.number().int().positive().nullable().optional(),
  items:             z.array(ApplyItemProposalSchema).min(1).max(50),
  // Tier 2 Party context (required when targetModule === "party")
  partyId:           z.number().int().positive().nullable().optional(),
  targetKind:        z.enum(["party_licenses", "party_tax_registrations"]).nullable().optional(),
}).refine(
  (data) => {
    // When targetModule is "party", partyId and targetKind are required
    if (data.targetModule === "party") {
      return data.partyId != null && data.targetKind != null;
    }
    return true;
  },
  { message: "partyId and targetKind are required when targetModule is 'party'" }
);

const ApplyRunConfirmationSchema = z.object({
  confirmedItemIds:         z.array(z.number().int().positive()).min(1),
  humanReviewConfirmed:     z.literal(true),
  replaceExistingConfirmed: z.boolean(),
});

// ── getDmsApplyToErpPreview ───────────────────────────────────────────────────

/**
 * READ-ONLY: Validate and return preview proposals for Apply-to-ERP.
 * No target record writes. No history rows created.
 */
export async function getDmsApplyToErpPreview(
  proposals: ApplyItemProposal[]
): Promise<ActionResult<ApplyItemProposal[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canPreview =
      hasPermission(ctx, "dms.apply_to_erp.preview") ||
      hasPermission(ctx, "dms.apply_to_erp.view") ||
      hasPermission(ctx, "dms.apply_to_erp.run") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (!canPreview) {
      return { success: false, error: "Permission denied", errorCode: "permission_denied" };
    }

    const masterEnabled = await isDmsApplyToErpEnabled();
    if (!masterEnabled) {
      return { success: false, error: "Apply-to-ERP feature is not enabled", errorCode: "feature_flag_disabled" };
    }

    // Validate each proposal against allowlist and forbidden list
    const validated: ApplyItemProposal[] = [];
    for (const proposal of proposals) {
      if (isForbiddenTarget(proposal.targetTable, proposal.targetField)) {
        logger.warn("[apply-to-erp] forbidden target in preview", {
          targetTable: proposal.targetTable,
          targetField: proposal.targetField,
          userId: ctx.profile.id,
        });
        continue;  // skip forbidden — do not expose as error, just filter
      }
      const v = validateApplyTarget(proposal.targetTable, proposal.targetField);
      if (!v.valid) {
        logger.warn("[apply-to-erp] non-allowlisted target in preview", {
          targetTable: proposal.targetTable,
          targetField: proposal.targetField,
          reason: v.reason,
        });
        continue;
      }
      validated.push(proposal);
    }

    return { success: true, data: validated };
  } catch (err) {
    logger.error("[apply-to-erp] getDmsApplyToErpPreview error", { error: String(err) });
    return { success: false, error: "Preview failed: internal error" };
  }
}

// ── createDmsApplyToErpRun ─────────────────────────────────────────────────────

/**
 * READ-ONLY on target records: creates apply run + items in history only.
 * No target record writes happen here.
 */
export async function createDmsApplyToErpRun(
  rawInput: CreateApplyRunInput
): Promise<ActionResult<{ runId: number; runCode: string }>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canRun =
      hasPermission(ctx, "dms.apply_to_erp.run") ||
      hasPermission(ctx, "dms.apply_to_erp.admin") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (!canRun) {
      return { success: false, error: "Permission denied: requires dms.apply_to_erp.run", errorCode: "permission_denied" };
    }

    const masterEnabled = await isDmsApplyToErpEnabled();
    if (!masterEnabled) {
      return { success: false, error: "Apply-to-ERP feature is not enabled", errorCode: "feature_flag_disabled" };
    }

    // Validate input
    const parsed = CreateRunInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: `Invalid input: ${parsed.error.issues[0]?.message}`, errorCode: "invalid_input" };
    }
    const input = parsed.data;

    // Tier 2 — Party flag checks
    if (input.targetModule === "party" && input.targetKind) {
      const flagCheck = await checkPartySubFlags(input.targetKind);
      if (!flagCheck.ok) {
        return { success: false, error: flagCheck.reason ?? "Party apply flag disabled", errorCode: "feature_flag_disabled" };
      }
      // Verify that all items target the same party table specified in targetKind
      const tableMatch = input.items.every((item) => item.targetTable === input.targetKind);
      if (!tableMatch) {
        return { success: false, error: "All items must target the specified targetKind table", errorCode: "invalid_input" };
      }
    }

    // Validate all items against allowlist and forbidden list
    const validItems = input.items.filter((item) => {
      if (isForbiddenTarget(item.targetTable, item.targetField)) return false;
      const v = validateApplyTarget(item.targetTable, item.targetField);
      return v.valid;
    });

    if (validItems.length === 0) {
      return { success: false, error: "No valid apply items after allowlist/forbidden check", errorCode: "invalid_input" };
    }

    const db = createAdminClient();
    const runCode = generateRunCode();
    const userId = ctx.profile.id;

    // Create the apply run (history only — no target record writes)
    const { data: runData, error: runError } = await db
      .from("dms_ai_erp_apply_runs")
      .insert({
        run_code:            runCode,
        source_type:         input.sourceType,
        source_id:           input.sourceId ?? null,
        document_id:         input.documentId,
        review_queue_item_id: input.reviewQueueItemId ?? null,
        status:              "pending" as ApplyRunStatus,
        target_module:       input.targetModule,
        target_table:        input.targetTable,
        // For party module, target_record_id stores the partyId (parent entity).
        // Child record IDs (license/tax) are stored per-item in apply_items.target_record_id.
        target_record_id:    input.targetModule === "party" ? (input.partyId ?? null) : (input.targetRecordId ?? null),
        requested_by:        userId,
        created_at:          new Date().toISOString(),
        updated_at:          new Date().toISOString(),
      })
      .select("id")
      .single();

    if (runError || !runData) {
      logger.error("[apply-to-erp] createDmsApplyToErpRun run insert error", {
        error: (runError as { message?: string })?.message?.slice(0, 200),
      });
      return { success: false, error: "Failed to create apply run" };
    }

    const runId = (runData as { id: number }).id;

    // Create apply items (history only)
    const itemsToInsert = validItems.map((item) => ({
      apply_run_id:          runId,
      source_type:           item.sourceType,
      source_id:             item.sourceId ?? null,
      source_field_code:     item.sourceFieldCode ?? null,
      target_table:          item.targetTable,
      target_field:          item.targetField,
      target_record_id:      item.targetRecordId ?? null,
      target_display_label:  truncateSummary(item.targetDisplayLabel),
      current_value_summary: truncateSummary(item.currentValueSummary ?? null),
      proposed_value_summary: truncateSummary(item.proposedValueSummary ?? null),
      value_type:            item.valueType,
      confidence:            item.confidence ?? null,
      status:                "proposed" as ApplyItemStatus,
      requires_confirmation: item.requiresConfirmation ?? true,
      confirmed:             false,
      created_at:            new Date().toISOString(),
      updated_at:            new Date().toISOString(),
    }));

    const { error: itemsError } = await db
      .from("dms_ai_erp_apply_items")
      .insert(itemsToInsert);

    if (itemsError) {
      logger.error("[apply-to-erp] createDmsApplyToErpRun items insert error", {
        error: (itemsError as { message?: string })?.message?.slice(0, 200),
      });
      // Attempt cleanup
      await db.from("dms_ai_erp_apply_runs").delete().eq("id", runId);
      return { success: false, error: "Failed to create apply items" };
    }

    // Audit run creation
    void logAudit({
      module_code:     "dms_ai",
      entity_name:     "dms_ai_erp_apply_runs",
      entity_id:       runId,
      entity_reference: runCode,
      action:          "dms_apply_to_erp_run_created",
      new_values:      buildRunCreatedMeta({
        runId,
        runCode,
        documentId:  input.documentId,
        sourceType:  input.sourceType,
        targetModule: input.targetModule,
        targetTable: input.targetTable,
        itemCount:   validItems.length,
      }),
    });

    logger.info("[apply-to-erp] run created", { runId, runCode, itemCount: validItems.length, userId });

    return { success: true, data: { runId, runCode } };
  } catch (err) {
    logger.error("[apply-to-erp] createDmsApplyToErpRun error", { error: String(err) });
    return { success: false, error: "Failed to create apply run" };
  }
}

// ── applyDmsApplyToErpRun ──────────────────────────────────────────────────────

/**
 * THE ONLY ACTION THAT WRITES TO TARGET RECORDS.
 *
 * Executes confirmed items from an apply run.
 *
 * Requirements:
 *   - confirmedItemIds must be non-empty
 *   - humanReviewConfirmed must be true
 *   - run must be in 'pending' status
 *   - each item is server-revalidated before write
 *   - conflicts are skipped (not overwritten unless replaceExistingConfirmed=true)
 *   - forbidden items are never written
 *   - metadata apply uses the dms_metadata module path only
 */
export async function applyDmsApplyToErpRun(
  runId: number,
  rawConfirmation: ApplyRunConfirmation
): Promise<ActionResult<ApplyRunResult>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canRun =
      hasPermission(ctx, "dms.apply_to_erp.run") ||
      hasPermission(ctx, "dms.apply_to_erp.admin") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (!canRun) {
      return { success: false, error: "Permission denied: requires dms.apply_to_erp.run", errorCode: "permission_denied" };
    }

    // Validate confirmation
    const parsedConfirmation = ApplyRunConfirmationSchema.safeParse(rawConfirmation);
    if (!parsedConfirmation.success) {
      return {
        success: false,
        error: `Invalid confirmation: ${parsedConfirmation.error.issues[0]?.message}`,
        errorCode: "invalid_input",
      };
    }
    const confirmation = parsedConfirmation.data;

    if (!confirmation.humanReviewConfirmed) {
      return { success: false, error: "Human review must be confirmed", errorCode: "invalid_input" };
    }
    if (confirmation.confirmedItemIds.length === 0) {
      return { success: false, error: "No confirmed items provided", errorCode: "no_confirmed_items" };
    }

    // Feature flags
    const masterEnabled = await isDmsApplyToErpEnabled();
    if (!masterEnabled) {
      return { success: false, error: "Apply-to-ERP feature is not enabled", errorCode: "feature_flag_disabled" };
    }

    const db = createAdminClient();
    const userId = ctx.profile.id;

    // Reload run record
    const { data: runRow, error: runLoadErr } = await db
      .from("dms_ai_erp_apply_runs")
      .select("id, run_code, status, document_id, source_type, target_module, target_table, target_record_id, requested_by")
      .eq("id", runId)
      .single();

    if (runLoadErr || !runRow) {
      return { success: false, error: "Apply run not found", errorCode: "run_not_found" };
    }
    const run = runRow as {
      id: number; run_code: string | null; status: string; document_id: number | null;
      source_type: string; target_module: string; target_table: string;
      target_record_id: number | null; requested_by: number;
    };

    if (run.status !== "pending") {
      return {
        success: false,
        error: `Run is in "${run.status}" status; only pending runs can be executed`,
        errorCode: "run_not_in_pending_state",
      };
    }

    // Mark run as in_progress
    await db.from("dms_ai_erp_apply_runs").update({
      status:     "in_progress",
      started_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      confirmed_by: userId,
    }).eq("id", runId);

    // Load only the confirmed items
    const { data: itemRows, error: itemsLoadErr } = await db
      .from("dms_ai_erp_apply_items")
      .select("*")
      .eq("apply_run_id", runId)
      .in("id", confirmation.confirmedItemIds);

    if (itemsLoadErr) {
      await db.from("dms_ai_erp_apply_runs").update({
        status:     "failed",
        failed_at:  new Date().toISOString(),
        error_message: "Failed to load apply items",
        updated_at: new Date().toISOString(),
      }).eq("id", runId);
      return { success: false, error: "Failed to load apply items" };
    }

    const items = (itemRows ?? []) as Array<{
      id: number; target_table: string; target_field: string;
      target_record_id: number | null; proposed_value_summary: string | null;
      current_value_summary: string | null; value_type: string | null;
      source_type: string; source_id: number | null; target_module: string | null;
    }>;

    // Track all items in the run (including unconfirmed = skipped)
    const { data: allItemRows } = await db
      .from("dms_ai_erp_apply_items")
      .select("id, status")
      .eq("apply_run_id", runId);

    const allItemIds = new Set((allItemRows ?? []).map((i: { id: number }) => i.id));
    const confirmedSet = new Set(confirmation.confirmedItemIds);

    let appliedCount = 0;
    let skippedCount = 0;
    let conflictCount = 0;
    let failedCount = 0;
    const itemResults = [];

    // Process confirmed items
    for (const item of items) {
      // Forbidden check
      if (isForbiddenTarget(item.target_table, item.target_field)) {
        await db.from("dms_ai_erp_apply_items").update({
          status:         "forbidden",
          failure_reason: "target is in the forbidden list",
          updated_at:     new Date().toISOString(),
        }).eq("id", item.id);
        failedCount++;
        itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "forbidden" as ApplyItemStatus, appliedValueSummary: null, skipReason: null, failureReason: "forbidden target" });

        void logAudit({
          module_code: "dms_ai", entity_name: "dms_ai_erp_apply_items", entity_id: item.id,
          entity_reference: String(runId), action: "dms_apply_to_erp_item_skipped",
          new_values: buildItemSkippedMeta({ itemId: item.id, runId, targetTable: item.target_table, targetField: item.target_field, reason: "forbidden target", status: "forbidden" }),
        });
        continue;
      }

      // Allowlist check
      const validation = validateApplyTarget(item.target_table, item.target_field);
      if (!validation.valid) {
        await db.from("dms_ai_erp_apply_items").update({
          status:         "forbidden",
          failure_reason: validation.reason.slice(0, 200),
          updated_at:     new Date().toISOString(),
        }).eq("id", item.id);
        failedCount++;
        itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "forbidden" as ApplyItemStatus, appliedValueSummary: null, skipReason: null, failureReason: validation.reason });
        continue;
      }

      // Target permission check
      const perms = getTargetPermissions(item.target_table, item.target_field);
      const hasTargetPermission =
        hasPermission(ctx, perms.targetPermission) ||
        hasPermission(ctx, perms.adminPermission) ||
        hasPermission(ctx, "dms.admin") ||
        hasPermission(ctx, "system_admin");

      if (!hasTargetPermission) {
        await db.from("dms_ai_erp_apply_items").update({
          status:         "failed",
          failure_reason: `insufficient target permission: requires ${perms.targetPermission}`,
          updated_at:     new Date().toISOString(),
        }).eq("id", item.id);
        failedCount++;
        itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "failed" as ApplyItemStatus, appliedValueSummary: null, skipReason: null, failureReason: "insufficient permission" });
        continue;
      }

      // Determine which sub-flag is needed
      let subFlagOk = true;
      if (item.target_module === "dms_metadata" || item.target_table === "dms_document_metadata_values") {
        subFlagOk = await isDmsApplyToErpSubFlagEnabled("DMS_AI_APPLY_TO_ERP_DMS_METADATA");
      } else if (item.target_table === "dms_documents") {
        subFlagOk = await isDmsApplyToErpSubFlagEnabled("DMS_AI_APPLY_TO_ERP_ENTITY_LINKS");
      } else if (item.target_table === "party_licenses") {
        const flagCheck = await checkPartySubFlags("party_licenses");
        subFlagOk = flagCheck.ok;
      } else if (item.target_table === "party_tax_registrations") {
        const flagCheck = await checkPartySubFlags("party_tax_registrations");
        subFlagOk = flagCheck.ok;
      }

      if (!subFlagOk) {
        await db.from("dms_ai_erp_apply_items").update({
          status:         "skipped",
          skip_reason:    "sub-feature flag not enabled for this target type",
          updated_at:     new Date().toISOString(),
        }).eq("id", item.id);
        skippedCount++;
        itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "skipped" as ApplyItemStatus, appliedValueSummary: null, skipReason: "sub-flag disabled", failureReason: null });
        continue;
      }

      // ── party_licenses field apply (Tier 2) ──────────────────────────────────
      if (item.target_table === "party_licenses" && item.target_record_id) {
        // Reload current party_licenses row fresh from DB
        const { data: licRow } = await db
          .from("party_licenses")
          .select("id, party_id, is_active, license_number, license_name, license_activity_text, issue_date, expiry_date, remarks")
          .eq("id", item.target_record_id)
          .single();

        const licRecord = licRow as PartyLicenseRecord | null;

        // Determine expected party_id from the run record
        const expectedPartyId = run.target_record_id;  // stored in the run's party context
        if (!expectedPartyId) {
          await db.from("dms_ai_erp_apply_items").update({ status: "failed", failure_reason: "missing party context in run", updated_at: new Date().toISOString() }).eq("id", item.id);
          failedCount++;
          itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "failed" as ApplyItemStatus, appliedValueSummary: null, skipReason: null, failureReason: "missing party context" });
          continue;
        }

        const conflictResult = detectPartyLicenseFieldConflict(
          licRecord,
          expectedPartyId,
          item.target_field,
          item.current_value_summary,
          confirmation.replaceExistingConfirmed
        );

        if (conflictResult.conflict) {
          await db.from("dms_ai_erp_apply_items").update({ status: "conflict", skip_reason: conflictResult.reason.slice(0, 200), updated_at: new Date().toISOString() }).eq("id", item.id);
          conflictCount++;
          itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "conflict" as ApplyItemStatus, appliedValueSummary: null, skipReason: conflictResult.reason, failureReason: null });
          void logAudit({ module_code: "dms_ai", entity_name: "dms_ai_erp_apply_items", entity_id: item.id, entity_reference: String(runId), action: "dms_apply_to_erp_item_conflict", new_values: buildItemSkippedMeta({ itemId: item.id, runId, targetTable: item.target_table, targetField: item.target_field, reason: conflictResult.reason, status: "conflict" }) });
          continue;
        }

        const fieldMeta = validation.field;
        const normalized = normalizeApplyValue(
          item.proposed_value_summary,
          fieldMeta.valueType,
          item.target_field,
          { maxLength: fieldMeta.maxLength }
        );

        if (!normalized.valid) {
          await db.from("dms_ai_erp_apply_items").update({ status: "failed", failure_reason: normalized.validationError?.slice(0, 200), updated_at: new Date().toISOString() }).eq("id", item.id);
          failedCount++;
          itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "failed" as ApplyItemStatus, appliedValueSummary: null, skipReason: null, failureReason: normalized.validationError ?? "normalization failed" });
          continue;
        }

        const { error: writeErr } = await db
          .from("party_licenses")
          .update({ [item.target_field]: normalized.normalizedValue, updated_by: userId, updated_at: new Date().toISOString() })
          .eq("id", item.target_record_id);

        if (writeErr) {
          await db.from("dms_ai_erp_apply_items").update({ status: "failed", failure_reason: (writeErr as { message?: string })?.message?.slice(0, 200), updated_at: new Date().toISOString() }).eq("id", item.id);
          failedCount++;
          itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "failed" as ApplyItemStatus, appliedValueSummary: null, skipReason: null, failureReason: "DB write error" });
          continue;
        }

        const appliedSummary = buildPartyFieldSummary(item.target_field, normalized.normalizedValue, fieldMeta.valueType === "date" ? "date" : "text");
        await db.from("dms_ai_erp_apply_items").update({ status: "applied", applied_value_summary: truncateSummary(appliedSummary), applied_at: new Date().toISOString(), applied_by: userId, confirmed: true, updated_at: new Date().toISOString() }).eq("id", item.id);
        appliedCount++;
        itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "applied" as ApplyItemStatus, appliedValueSummary: truncateSummary(appliedSummary), skipReason: null, failureReason: null });

        void logAudit({ module_code: "dms_ai", entity_name: "dms_ai_erp_apply_items", entity_id: item.id, entity_reference: String(runId), action: "dms_apply_to_erp_item_applied",
          new_values: buildItemAppliedMeta({ itemId: item.id, runId, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, appliedValueSummary: truncateSummary(appliedSummary), partyId: expectedPartyId, targetChildCode: (licRecord?.license_code as string | null) ?? null, targetChildLabel: (licRecord?.license_name as string | null) ?? null }) });

      // ── party_tax_registrations field apply (Tier 2) ─────────────────────────
      } else if (item.target_table === "party_tax_registrations" && item.target_record_id) {
        const { data: taxRow } = await db
          .from("party_tax_registrations")
          .select("id, party_id, is_active, tax_registration_number, effective_from, effective_to, remarks, tax_registration_code")
          .eq("id", item.target_record_id)
          .single();

        const taxRecord = taxRow as PartyTaxRecord | null;

        const expectedPartyId = run.target_record_id;
        if (!expectedPartyId) {
          await db.from("dms_ai_erp_apply_items").update({ status: "failed", failure_reason: "missing party context in run", updated_at: new Date().toISOString() }).eq("id", item.id);
          failedCount++;
          itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "failed" as ApplyItemStatus, appliedValueSummary: null, skipReason: null, failureReason: "missing party context" });
          continue;
        }

        const conflictResult = detectPartyTaxFieldConflict(
          taxRecord,
          expectedPartyId,
          item.target_field,
          item.current_value_summary,
          confirmation.replaceExistingConfirmed
        );

        if (conflictResult.conflict) {
          await db.from("dms_ai_erp_apply_items").update({ status: "conflict", skip_reason: conflictResult.reason.slice(0, 200), updated_at: new Date().toISOString() }).eq("id", item.id);
          conflictCount++;
          itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "conflict" as ApplyItemStatus, appliedValueSummary: null, skipReason: conflictResult.reason, failureReason: null });
          void logAudit({ module_code: "dms_ai", entity_name: "dms_ai_erp_apply_items", entity_id: item.id, entity_reference: String(runId), action: "dms_apply_to_erp_item_conflict", new_values: buildItemSkippedMeta({ itemId: item.id, runId, targetTable: item.target_table, targetField: item.target_field, reason: conflictResult.reason, status: "conflict" }) });
          continue;
        }

        const fieldMeta = validation.field;
        const normalized = normalizeApplyValue(
          item.proposed_value_summary,
          fieldMeta.valueType,
          item.target_field,
          { maxLength: fieldMeta.maxLength }
        );

        if (!normalized.valid) {
          await db.from("dms_ai_erp_apply_items").update({ status: "failed", failure_reason: normalized.validationError?.slice(0, 200), updated_at: new Date().toISOString() }).eq("id", item.id);
          failedCount++;
          itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "failed" as ApplyItemStatus, appliedValueSummary: null, skipReason: null, failureReason: normalized.validationError ?? "normalization failed" });
          continue;
        }

        const { error: writeErr } = await db
          .from("party_tax_registrations")
          .update({ [item.target_field]: normalized.normalizedValue, updated_by: userId, updated_at: new Date().toISOString() })
          .eq("id", item.target_record_id);

        if (writeErr) {
          await db.from("dms_ai_erp_apply_items").update({ status: "failed", failure_reason: (writeErr as { message?: string })?.message?.slice(0, 200), updated_at: new Date().toISOString() }).eq("id", item.id);
          failedCount++;
          itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "failed" as ApplyItemStatus, appliedValueSummary: null, skipReason: null, failureReason: "DB write error" });
          continue;
        }

        // TRN fields get masked summary for audit storage
        const appliedSummary = buildPartyFieldSummary(item.target_field, normalized.normalizedValue, fieldMeta.valueType === "date" ? "date" : "text");
        await db.from("dms_ai_erp_apply_items").update({ status: "applied", applied_value_summary: truncateSummary(appliedSummary), applied_at: new Date().toISOString(), applied_by: userId, confirmed: true, updated_at: new Date().toISOString() }).eq("id", item.id);
        appliedCount++;
        itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "applied" as ApplyItemStatus, appliedValueSummary: truncateSummary(appliedSummary), skipReason: null, failureReason: null });

        void logAudit({ module_code: "dms_ai", entity_name: "dms_ai_erp_apply_items", entity_id: item.id, entity_reference: String(runId), action: "dms_apply_to_erp_item_applied",
          new_values: buildItemAppliedMeta({ itemId: item.id, runId, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, appliedValueSummary: truncateSummary(appliedSummary), partyId: expectedPartyId, targetChildCode: (taxRecord?.tax_registration_code as string | null) ?? null, targetChildLabel: "Tax Registration" }) });

      // ── dms_documents field apply ────────────────────────────────────────────
      } else if (item.target_table === "dms_documents" && item.target_record_id) {
        // Reload current document record
        const { data: docRow } = await db
          .from("dms_documents")
          .select("id, owning_company_id, owning_branch_id, party_id, issue_date, expiry_date, title, description, deleted_at")
          .eq("id", item.target_record_id)
          .single();

        const doc = docRow as {
          id: number; owning_company_id: number | null; owning_branch_id: number | null;
          party_id: number | null; issue_date: string | null; expiry_date: string | null;
          title: string | null; description: string | null; deleted_at: string | null;
        } | null;

        // Conflict detection
        const conflictResult = detectDmsDocumentFieldConflict(
          doc,
          item.target_field as keyof typeof doc,
          item.current_value_summary,
          confirmation.replaceExistingConfirmed
        );

        if (conflictResult.conflict) {
          await db.from("dms_ai_erp_apply_items").update({
            status:         "conflict",
            skip_reason:    conflictResult.reason.slice(0, 200),
            updated_at:     new Date().toISOString(),
          }).eq("id", item.id);
          conflictCount++;
          itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "conflict" as ApplyItemStatus, appliedValueSummary: null, skipReason: conflictResult.reason, failureReason: null });

          void logAudit({
            module_code: "dms_ai", entity_name: "dms_ai_erp_apply_items", entity_id: item.id,
            entity_reference: String(runId), action: "dms_apply_to_erp_item_conflict",
            new_values: buildItemSkippedMeta({ itemId: item.id, runId, targetTable: item.target_table, targetField: item.target_field, reason: conflictResult.reason, status: "conflict" }),
          });
          continue;
        }

        // Normalize proposed value
        const valueType = (item.value_type ?? "text") as ApplyValueType;
        const normalized = normalizeApplyValue(
          item.proposed_value_summary,
          valueType,
          item.target_field,
          doc ? { issueDate: doc.issue_date } : undefined
        );

        if (!normalized.valid) {
          await db.from("dms_ai_erp_apply_items").update({
            status:         "failed",
            failure_reason: normalized.validationError?.slice(0, 200),
            updated_at:     new Date().toISOString(),
          }).eq("id", item.id);
          failedCount++;
          itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "failed" as ApplyItemStatus, appliedValueSummary: null, skipReason: null, failureReason: normalized.validationError ?? "normalization failed" });
          continue;
        }

        // Apply the write
        const updatePayload: Record<string, unknown> = {
          [item.target_field]: normalized.normalizedValue,
          updated_by:          userId,
          updated_at:          new Date().toISOString(),
        };

        const { error: writeErr } = await db
          .from("dms_documents")
          .update(updatePayload)
          .eq("id", item.target_record_id);

        if (writeErr) {
          await db.from("dms_ai_erp_apply_items").update({
            status:         "failed",
            failure_reason: (writeErr as { message?: string })?.message?.slice(0, 200),
            updated_at:     new Date().toISOString(),
          }).eq("id", item.id);
          failedCount++;
          itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "failed" as ApplyItemStatus, appliedValueSummary: null, skipReason: null, failureReason: "DB write error" });
          continue;
        }

        const appliedSummary = buildValueSummary(normalized.normalizedValue, valueType);

        await db.from("dms_ai_erp_apply_items").update({
          status:                "applied",
          applied_value_summary: truncateSummary(appliedSummary),
          applied_at:            new Date().toISOString(),
          applied_by:            userId,
          confirmed:             true,
          updated_at:            new Date().toISOString(),
        }).eq("id", item.id);

        appliedCount++;
        itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "applied" as ApplyItemStatus, appliedValueSummary: truncateSummary(appliedSummary), skipReason: null, failureReason: null });

        void logAudit({
          module_code: "dms_ai", entity_name: "dms_ai_erp_apply_items", entity_id: item.id,
          entity_reference: String(runId), action: "dms_apply_to_erp_item_applied",
          new_values: buildItemAppliedMeta({
            itemId: item.id, runId, targetTable: item.target_table,
            targetField: item.target_field, targetRecordId: item.target_record_id,
            appliedValueSummary: truncateSummary(appliedSummary),
          }),
        });
      } else {
        // Metadata items or items without a record ID — skip gracefully
        // (metadata apply is handled separately via Phase 6/7 bridge)
        await db.from("dms_ai_erp_apply_items").update({
          status:      "skipped",
          skip_reason: "metadata apply uses Phase 6/7 engine — see applyAiAnalysisToMetadata()",
          updated_at:  new Date().toISOString(),
        }).eq("id", item.id);
        skippedCount++;
        itemResults.push({ itemId: item.id, targetTable: item.target_table, targetField: item.target_field, targetRecordId: item.target_record_id, status: "skipped" as ApplyItemStatus, appliedValueSummary: null, skipReason: "metadata apply via Phase 6/7", failureReason: null });
      }
    }  // end for (const item of items)

    // Mark unconfirmed items as skipped
    for (const itemId of allItemIds) {
      if (!confirmedSet.has(itemId)) {
        const alreadyProcessed = itemResults.find((r) => r.itemId === itemId);
        if (!alreadyProcessed) {
          await db.from("dms_ai_erp_apply_items").update({
            status:      "skipped",
            skip_reason: "not included in confirmed items selection",
            updated_at:  new Date().toISOString(),
          }).eq("id", itemId);
          skippedCount++;
        }
      }
    }

    // Determine final run status
    let finalStatus: ApplyRunStatus;
    if (appliedCount === 0 && (failedCount > 0 || conflictCount > 0)) {
      finalStatus = "failed";
    } else if (appliedCount > 0 && (skippedCount > 0 || conflictCount > 0 || failedCount > 0)) {
      finalStatus = "completed_with_warnings";
    } else if (appliedCount > 0) {
      finalStatus = "completed";
    } else {
      finalStatus = "completed_with_warnings";
    }

    const now = new Date().toISOString();
    await db.from("dms_ai_erp_apply_runs").update({
      status:       finalStatus,
      completed_at: now,
      failed_at:    finalStatus === "failed" ? now : null,
      updated_at:   now,
    }).eq("id", runId);

    void logAudit({
      module_code: "dms_ai", entity_name: "dms_ai_erp_apply_runs", entity_id: runId,
      entity_reference: run.run_code ?? String(runId), action: "dms_apply_to_erp_run_completed",
      new_values: buildRunCompletedMeta({
        runId, runCode: run.run_code, documentId: run.document_id, status: finalStatus,
        appliedCount, skippedCount, conflictCount, failedCount,
      }),
    });

    // Revalidate DMS document pages
    if (run.document_id) {
      revalidatePath(`/dms/documents/record/${run.document_id}`);
    }
    revalidatePath("/dms/documents");

    // Revalidate Party pages if this was a Tier 2 party apply run
    if (run.target_module === "party" && run.target_record_id) {
      revalidatePath("/admin/master-data/parties");
      revalidatePath(`/admin/master-data/parties/record/${run.target_record_id}`);
    }

    const result: ApplyRunResult = {
      runId,
      runCode: run.run_code,
      status:  finalStatus,
      appliedCount,
      skippedCount,
      conflictCount,
      failedCount,
      items:        itemResults,
      errorMessage: null,
    };

    return { success: true, data: result };
  } catch (err) {
    logger.error("[apply-to-erp] applyDmsApplyToErpRun error", { error: String(err) });
    return { success: false, error: "Apply run execution failed" };
  }
}

// ── getPartyApplyTargetRows ───────────────────────────────────────────────────

/**
 * READ-ONLY: Returns safe list of party_licenses or party_tax_registrations rows
 * for the given party, for human selection before creating a party apply run.
 *
 * Never writes. Never auto-selects or auto-creates.
 * TRN fields are masked in the returned rows.
 */
export async function getPartyApplyTargetRows(input: {
  documentId: number;
  partyId:    number;
  targetKind: PartyApplyTargetKind;
}): Promise<ActionResult<PartyLicenseRow[] | PartyTaxRow[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canView =
      hasPermission(ctx, "master_data.parties.view") ||
      hasPermission(ctx, "master_data.parties.manage_licenses") ||
      hasPermission(ctx, "master_data.parties.manage_tax") ||
      hasPermission(ctx, "master_data.parties.edit") ||
      hasPermission(ctx, "system_admin");

    if (!canView) {
      return { success: false, error: "Permission denied: requires master_data.parties.view", errorCode: "permission_denied" };
    }

    const masterEnabled = await isDmsApplyToErpEnabled();
    if (!masterEnabled) {
      return { success: false, error: "Apply-to-ERP feature is not enabled", errorCode: "feature_flag_disabled" };
    }
    const partyGate = await isDmsApplyToErpSubFlagEnabled("DMS_AI_APPLY_TO_ERP_PARTY");
    if (!partyGate) {
      return { success: false, error: "Party apply feature is not enabled", errorCode: "feature_flag_disabled" };
    }

    const db = createAdminClient();

    if (input.targetKind === "party_licenses") {
      const { data, error } = await db
        .from("party_licenses")
        .select("id, party_id, license_code, license_number, license_name, issue_date, expiry_date, is_active")
        .eq("party_id", input.partyId)
        .order("is_active", { ascending: false })
        .order("id", { ascending: false });

      if (error) {
        return { success: false, error: "Failed to load party licenses" };
      }

      const rows: PartyLicenseRow[] = (data ?? []).map((r: Record<string, unknown>) => ({
        id:           r.id as number,
        party_id:     r.party_id as number,
        license_code: (r.license_code as string | null) ?? null,
        license_number: (r.license_number as string | null) ?? null,
        license_name: (r.license_name as string | null) ?? null,
        issue_date:   (r.issue_date as string | null) ?? null,
        expiry_date:  (r.expiry_date as string | null) ?? null,
        is_active:    Boolean(r.is_active),
      }));

      return { success: true, data: rows };

    } else {
      // party_tax_registrations
      const { data, error } = await db
        .from("party_tax_registrations")
        .select("id, party_id, tax_registration_code, tax_registration_number, effective_from, effective_to, is_active")
        .eq("party_id", input.partyId)
        .order("is_active", { ascending: false })
        .order("id", { ascending: false });

      if (error) {
        return { success: false, error: "Failed to load party tax registrations" };
      }

      const rows: PartyTaxRow[] = (data ?? []).map((r: Record<string, unknown>) => {
        const rawTrn = (r.tax_registration_number as string | null) ?? null;
        return {
          id:                           r.id as number,
          party_id:                     r.party_id as number,
          tax_registration_code:        (r.tax_registration_code as string | null) ?? null,
          tax_registration_number_masked: rawTrn
            ? (rawTrn.length <= 8 ? "****" : rawTrn.slice(0, 4) + "****" + rawTrn.slice(-4))
            : null,
          effective_from:               (r.effective_from as string | null) ?? null,
          effective_to:                 (r.effective_to as string | null) ?? null,
          is_active:                    Boolean(r.is_active),
        };
      });

      return { success: true, data: rows };
    }
  } catch (err) {
    logger.error("[apply-to-erp] getPartyApplyTargetRows error", { error: String(err) });
    return { success: false, error: "Failed to load party target rows" };
  }
}

// ── getDmsApplyToErpRun ────────────────────────────────────────────────────────

/** READ-ONLY: Get a single apply run with its items. */
export async function getDmsApplyToErpRun(
  runId: number
): Promise<ActionResult<DmsErpApplyRun>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canView =
      hasPermission(ctx, "dms.apply_to_erp.view") ||
      hasPermission(ctx, "dms.apply_to_erp.run") ||
      hasPermission(ctx, "dms.apply_to_erp.admin") ||
      hasPermission(ctx, "dms.documents.view") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (!canView) {
      return { success: false, error: "Permission denied", errorCode: "permission_denied" };
    }

    const db = await createClient();

    const { data: runRow, error } = await db
      .from("dms_ai_erp_apply_runs")
      .select(`
        id, run_code, source_type, source_id, document_id, review_queue_item_id,
        status, target_module, target_table, target_record_id,
        requested_by, confirmed_by, started_at, completed_at, failed_at, cancelled_at,
        error_message, created_at, updated_at
      `)
      .eq("id", runId)
      .single();

    if (error || !runRow) {
      return { success: false, error: "Apply run not found", errorCode: "run_not_found" };
    }

    const { data: itemRows } = await db
      .from("dms_ai_erp_apply_items")
      .select("*")
      .eq("apply_run_id", runId)
      .order("id");

    const run = mapRunRow(runRow as Record<string, unknown>, (itemRows ?? []) as Record<string, unknown>[]);
    return { success: true, data: run };
  } catch (err) {
    logger.error("[apply-to-erp] getDmsApplyToErpRun error", { error: String(err) });
    return { success: false, error: "Failed to load apply run" };
  }
}

// ── listDmsApplyToErpRuns ─────────────────────────────────────────────────────

/** READ-ONLY: List apply runs with optional filters. */
export async function listDmsApplyToErpRuns(filters?: {
  documentId?:  number;
  status?:      string;
  page?:        number;
  pageSize?:    number;
}): Promise<ActionResult<{ runs: DmsErpApplyRun[]; total: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canView =
      hasPermission(ctx, "dms.apply_to_erp.view") ||
      hasPermission(ctx, "dms.apply_to_erp.run") ||
      hasPermission(ctx, "dms.apply_to_erp.admin") ||
      hasPermission(ctx, "dms.documents.view") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (!canView) {
      return { success: false, error: "Permission denied", errorCode: "permission_denied" };
    }

    const db = await createClient();
    const page = filters?.page ?? 1;
    const pageSize = Math.min(filters?.pageSize ?? 20, 100);
    const from = (page - 1) * pageSize;

    let query = db
      .from("dms_ai_erp_apply_runs")
      .select("id, run_code, source_type, status, target_module, target_table, document_id, requested_by, created_at, updated_at, completed_at, cancelled_at", { count: "exact" });

    if (filters?.documentId) {
      query = query.eq("document_id", filters.documentId);
    }
    if (filters?.status) {
      query = query.eq("status", filters.status);
    }

    query = query.order("created_at", { ascending: false }).range(from, from + pageSize - 1);

    const { data, error, count } = await query;

    if (error) {
      return { success: false, error: "Failed to list apply runs" };
    }

    const runs = (data ?? []).map((row) => mapRunRow(row as Record<string, unknown>, []));
    return { success: true, data: { runs, total: count ?? 0 } };
  } catch (err) {
    logger.error("[apply-to-erp] listDmsApplyToErpRuns error", { error: String(err) });
    return { success: false, error: "Failed to list apply runs" };
  }
}

// ── cancelDmsApplyToErpRun ────────────────────────────────────────────────────

/** Cancel a pending apply run. Does not revert applied items. */
export async function cancelDmsApplyToErpRun(
  runId: number
): Promise<ActionResult<void>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canRun =
      hasPermission(ctx, "dms.apply_to_erp.run") ||
      hasPermission(ctx, "dms.apply_to_erp.admin") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (!canRun) {
      return { success: false, error: "Permission denied", errorCode: "permission_denied" };
    }

    const db = createAdminClient();
    const userId = ctx.profile.id;

    const { data: runRow } = await db
      .from("dms_ai_erp_apply_runs")
      .select("id, run_code, status, document_id, requested_by")
      .eq("id", runId)
      .single();

    if (!runRow) {
      return { success: false, error: "Apply run not found", errorCode: "run_not_found" };
    }

    const run = runRow as { id: number; run_code: string | null; status: string; document_id: number | null; requested_by: number };

    if (!["pending", "confirmed"].includes(run.status)) {
      return { success: false, error: `Cannot cancel run in "${run.status}" status; only pending/confirmed runs can be cancelled` };
    }

    // Only the requestor or an admin can cancel
    const isAdmin =
      hasPermission(ctx, "dms.apply_to_erp.admin") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (run.requested_by !== userId && !isAdmin) {
      return { success: false, error: "Permission denied: only run requestor or admin can cancel", errorCode: "permission_denied" };
    }

    await db.from("dms_ai_erp_apply_runs").update({
      status:       "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    }).eq("id", runId);

    void logAudit({
      module_code: "dms_ai", entity_name: "dms_ai_erp_apply_runs", entity_id: runId,
      entity_reference: run.run_code ?? String(runId), action: "dms_apply_to_erp_run_cancelled",
      new_values: buildRunCancelledMeta({ runId, runCode: run.run_code, documentId: run.document_id, cancelledBy: userId }),
    });

    return { success: true };
  } catch (err) {
    logger.error("[apply-to-erp] cancelDmsApplyToErpRun error", { error: String(err) });
    return { success: false, error: "Failed to cancel apply run" };
  }
}

// ── Row mappers ───────────────────────────────────────────────────────────────

function mapRunRow(
  row: Record<string, unknown>,
  items: Record<string, unknown>[]
): DmsErpApplyRun {
  return {
    id:                 row.id as number,
    runCode:            (row.run_code as string | null) ?? null,
    sourceType:         row.source_type as DmsErpApplyRun["sourceType"],
    sourceId:           (row.source_id as number | null) ?? null,
    documentId:         (row.document_id as number | null) ?? null,
    reviewQueueItemId:  (row.review_queue_item_id as number | null) ?? null,
    status:             row.status as ApplyRunStatus,
    targetModule:       row.target_module as DmsErpApplyRun["targetModule"],
    targetTable:        row.target_table as string,
    targetRecordId:     (row.target_record_id as number | null) ?? null,
    requestedBy:        row.requested_by as number,
    requestedByName:    null,
    confirmedBy:        (row.confirmed_by as number | null) ?? null,
    confirmedByName:    null,
    startedAt:          (row.started_at as string | null) ?? null,
    completedAt:        (row.completed_at as string | null) ?? null,
    failedAt:           (row.failed_at as string | null) ?? null,
    cancelledAt:        (row.cancelled_at as string | null) ?? null,
    errorMessage:       (row.error_message as string | null) ?? null,
    createdAt:          row.created_at as string,
    updatedAt:          row.updated_at as string,
    items:              items.map(mapItemRow),
  };
}

function mapItemRow(row: Record<string, unknown>): DmsErpApplyItem {
  return {
    id:                   row.id as number,
    applyRunId:           row.apply_run_id as number,
    sourceType:           row.source_type as DmsErpApplyItem["sourceType"],
    sourceId:             (row.source_id as number | null) ?? null,
    sourceFieldCode:      (row.source_field_code as string | null) ?? null,
    targetTable:          row.target_table as string,
    targetField:          row.target_field as string,
    targetRecordId:       (row.target_record_id as number | null) ?? null,
    targetDisplayLabel:   (row.target_display_label as string | null) ?? null,
    currentValueSummary:  (row.current_value_summary as string | null) ?? null,
    proposedValueSummary: (row.proposed_value_summary as string | null) ?? null,
    appliedValueSummary:  (row.applied_value_summary as string | null) ?? null,
    valueType:            (row.value_type as DmsErpApplyItem["valueType"]) ?? null,
    confidence:           (row.confidence as number | null) ?? null,
    status:               row.status as ApplyItemStatus,
    skipReason:           (row.skip_reason as string | null) ?? null,
    failureReason:        (row.failure_reason as string | null) ?? null,
    requiresConfirmation: Boolean(row.requires_confirmation),
    confirmed:            Boolean(row.confirmed),
    appliedAt:            (row.applied_at as string | null) ?? null,
    appliedBy:            (row.applied_by as number | null) ?? null,
    createdAt:            row.created_at as string,
    updatedAt:            row.updated_at as string,
  };
}
