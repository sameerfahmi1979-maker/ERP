"use server";

/**
 * ERP DMS AI Phase 17 — Apply Correction Server Actions
 *
 * Server actions for the human-reviewed Apply Correction Proposal workflow.
 *
 * Governance:
 *   - ALL actions require DMS_AI_APPLY_CORRECTION_PROPOSALS feature flag
 *   - Permission gates enforced per action
 *   - createApplyCorrectionProposal writes proposal table only, not the target
 *   - applyCorrectionProposal requires humanReviewConfirmed + conflict check + target reload
 *   - All events are audited (no raw content, TRN masked)
 *   - No automatic rollback, no one-click undo, no background reversal
 */

import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logger } from "@/lib/logger";
import { revalidatePath } from "next/cache";
import {isPartyCorrectionTarget,runPartyCorrection} from '@/server/party-dms-correction';
import {correctionHistorySelect,projectCorrectionHistory} from '@/lib/dms/apply-correction/correction-history';
import {
  loadCorrectionSource,
} from "@/lib/dms/apply-correction/correction-source-loader";
import {
  buildCorrectionValue,
} from "@/lib/dms/apply-correction/correction-value-builder";
import {
  createCorrectionProposal,
  executeCorrectionProposal,
  cancelCorrectionProposal,
} from "@/lib/dms/apply-correction/correction-engine";
import { logAudit } from "@/server/actions/audit";
import {
  buildCorrectionSourceViewedMeta,
} from "@/lib/dms/apply-correction/correction-audit";
import {
  validateApplyTarget,
  getTargetPermissions,
} from "@/lib/dms/apply-to-erp/apply-target-registry";
import type {
  CorrectionSourceData,
  CorrectionProposalHistory,
  CorrectionResult,
  ListCorrectionProposalsFilter,
  CorrectionMode,
} from "@/lib/dms/apply-correction/types";
import type { ActionResult } from "@/lib/dms/apply-to-erp/types";

// ── Feature flag helpers ──────────────────────────────────────────────────────

async function isCorrectionProposalsEnabled(): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_AI_APPLY_CORRECTION_PROPOSALS")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

async function isRestorePreviousEnabled(): Promise<boolean> {
  try {
    const db = createAdminClient();
    const { data } = await db
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", "DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS")
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled === true;
  } catch {
    return false;
  }
}

// ── getApplyCorrectionAccess ──────────────────────────────────────────────────

/**
 * Lightweight check: returns whether the current user has access to the
 * Apply Correction Proposal feature (flag enabled + create permission).
 * Used by the document AI section to conditionally render the "Propose Correction" button.
 */
export async function getApplyCorrectionAccess(): Promise<
  ActionResult<{ proposalsEnabled: boolean; restorePreviousEnabled: boolean }>
> {
  try {
    const [proposalsEnabled, restorePreviousEnabled, authContext] = await Promise.all([
      isCorrectionProposalsEnabled(),
      isRestorePreviousEnabled(),
      getAuthContext(),
    ]);
    const canCreate = hasPermission(authContext, "dms.apply_correction.create");
    return {
      success: true,
      data: {
        proposalsEnabled: proposalsEnabled && canCreate,
        restorePreviousEnabled: restorePreviousEnabled && canCreate,
      },
    };
  } catch (err) {
    logger.error("[getApplyCorrectionAccess] error", err);
    return { success: true, data: { proposalsEnabled: false, restorePreviousEnabled: false } };
  }
}

// ── getApplyCorrectionSource ──────────────────────────────────────────────────

/**
 * Load correction source data for a given apply item.
 * Read-only — writes nothing.
 */
export async function getApplyCorrectionSource(
  applyItemId: number
): Promise<ActionResult<CorrectionSourceData>> {
  try {
    if (!isSafeNumber(applyItemId)) {
      return { success: false, error: "Invalid applyItemId" };
    }

    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canView =
      hasPermission(ctx, "dms.apply_correction.view") ||
      hasPermission(ctx, "dms.apply_correction.create") ||
      hasPermission(ctx, "dms.apply_to_erp.view") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (!canView) {
      return { success: false, error: "Permission denied", errorCode: "permission_denied" };
    }

    const flagEnabled = await isCorrectionProposalsEnabled();
    if (!flagEnabled) {
      return { success: false, error: "Apply Correction feature is not enabled.", errorCode: "feature_flag_disabled" };
    }

    const restoreEnabled = await isRestorePreviousEnabled();

    const result = await loadCorrectionSource(applyItemId, ctx.profile.id);
    if (!result.ok) {
      return { success: false, error: result.error.message, errorCode: result.error.error };
    }

    // Override restorePreviousEnabled based on feature flag
    const sourceData = {
      ...result.data,
      restorePreviousEnabled: result.data.restorePreviousEnabled && restoreEnabled,
      restorePreviousWarning: restoreEnabled ? result.data.restorePreviousWarning : null,
    };

    // Audit source viewed
    void logAudit({
      module_code:     "dms_ai",
      entity_name:     "dms_ai_erp_apply_items",
      entity_id:       applyItemId,
      entity_reference: String(applyItemId),
      action:          "dms_apply_correction_source_viewed",
      new_values:      buildCorrectionSourceViewedMeta({
        applyItemId:    applyItemId,
        applyRunId:     sourceData.originalApplyRunId,
        documentId:     sourceData.documentId,
        targetTable:    sourceData.targetTable,
        targetField:    sourceData.targetField,
        targetRecordId: sourceData.targetRecordId,
        viewedBy:       ctx.profile.id,
      }),
    });

    return { success: true, data: sourceData };
  } catch (err) {
    logger.error("[apply-correction] getApplyCorrectionSource error", { error: String(err) });
    return { success: false, error: "Failed to load correction source." };
  }
}

// ── createApplyCorrectionProposal ─────────────────────────────────────────────

const CreateProposalSchema = z.object({
  requestId: z.uuid().optional(),
  originalApplyItemId:       z.number().int().positive(),
  correctionMode:            z.enum(["manual", "restore_previous", "reapply_ai_value"]),
  rawCorrectionValue:        z.string().min(1, "Correction value cannot be empty."),
  /** Source snapshot captured by UI from getApplyCorrectionSource response. */
  sourceSnapshot:            z.object({
    reviewedRevision: z.string().regex(/^[1-9]\d*$/).optional(),
    originalApplyItemId:    z.number(),
    originalApplyRunId:     z.number(),
    documentId:             z.number().nullable(),
    targetModule:           z.string(),
    targetTable:            z.string(),
    targetField:            z.string(),
    targetRecordId:         z.number().nullable(),
    targetDisplayLabel:     z.string().nullable().optional(),
    valueType:              z.string(),
    originalBeforeSummary:  z.string().nullable(),
    originalAppliedSummary: z.string().nullable(),
    currentValueSummary:    z.string().nullable(),
    restorePreviousEnabled: z.boolean(),
    restorePreviousWarning: z.string().nullable().optional(),
  }),
});

type CreateProposalInput = z.infer<typeof CreateProposalSchema>;

/**
 * Create a correction proposal.
 * Writes to dms_ai_erp_apply_correction_proposals only — NOT the target.
 */
export async function createApplyCorrectionProposal(
  rawInput: CreateProposalInput
): Promise<ActionResult<{ proposalId: number }>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canCreate =
      hasPermission(ctx, "dms.apply_correction.create") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (!canCreate) {
      return { success: false, error: "Permission denied: requires dms.apply_correction.create", errorCode: "permission_denied" };
    }

    const flagEnabled = await isCorrectionProposalsEnabled();
    if (!flagEnabled) {
      return { success: false, error: "Apply Correction feature is not enabled.", errorCode: "feature_flag_disabled" };
    }

    // Validate input
    const parsed = CreateProposalSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const input = parsed.data;

    // Reload the authoritative item first; never let a browser select which
    // record the correction actually targets, including a forged non-party type.
    const canonical=await loadCorrectionSource(input.originalApplyItemId,ctx.profile.id);
    if(!canonical.ok)return {success:false,error:canonical.error.message,errorCode:canonical.error.error};
    const keys=['originalApplyItemId','originalApplyRunId','documentId','targetModule','targetTable','targetField','targetRecordId','valueType'] as const;
    if(keys.some(key=>input.sourceSnapshot[key]!==canonical.data[key]))return {success:false,error:'The original correction target changed. Reload it and review again.',errorCode:'conflict_detected'};
    if(isPartyCorrectionTarget(canonical.data.targetTable)){
      const result=await runPartyCorrection('prepare',{originalApplyItemId:input.originalApplyItemId,requestId:input.requestId,snapshot:input.sourceSnapshot,mode:input.correctionMode,value:input.rawCorrectionValue});
      if(result.success)refreshCorrectionViews(canonical.data.documentId,canonical.data.partyId);
      return result;
    }

    // Validate target still allowlisted
    const targetValidation = validateApplyTarget(
      input.sourceSnapshot.targetTable,
      input.sourceSnapshot.targetField
    );
    if (!targetValidation.valid) {
      return { success: false, error: targetValidation.reason, errorCode: "target_not_allowlisted" };
    }

    // Build and validate correction value
    const valueResult = buildCorrectionValue(
      input.rawCorrectionValue,
      input.sourceSnapshot.valueType as never,
      input.sourceSnapshot.targetField
    );
    if (!valueResult.ok) {
      return { success: false, error: valueResult.error };
    }

    // Create the proposal (writes proposal row only)
    const result: CorrectionResult = await createCorrectionProposal(
      {
        originalApplyItemId:       input.originalApplyItemId,
        correctionMode:            input.correctionMode as CorrectionMode,
        correctionValue:           valueResult.correctionValueJson,
        proposedCorrectionSummary: valueResult.proposedCorrectionSummary,
        sourceSnapshot:            input.sourceSnapshot as CorrectionSourceData,
      },
      ctx.profile.id,
      ctx.profile.id
    );

    if (!result.success) {
      return { success: false, error: result.message, errorCode: result.error };
    }

    revalidatePath("/dms");

    return { success: true, data: { proposalId: result.proposalId } };
  } catch (err) {
    logger.error("[apply-correction] createApplyCorrectionProposal error", { error: String(err) });
    return { success: false, error: "Failed to create correction proposal." };
  }
}

// ── getApplyCorrectionProposal ────────────────────────────────────────────────

/**
 * Get a single correction proposal by ID.
 */
export async function getApplyCorrectionProposal(
  proposalId: number
): Promise<ActionResult<CorrectionProposalHistory>> {
  try {
    if (!isSafeNumber(proposalId)) {
      return { success: false, error: "Invalid proposalId" };
    }

    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canView =
      hasPermission(ctx, "dms.apply_correction.view") ||
      hasPermission(ctx, "dms.apply_correction.create") ||
      hasPermission(ctx, "dms.apply_to_erp.view") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (!canView) {
      return { success: false, error: "Permission denied", errorCode: "permission_denied" };
    }

    const flagEnabled = await isCorrectionProposalsEnabled();
    if (!flagEnabled) {
      return { success: false, error: "Apply Correction feature is not enabled.", errorCode: "feature_flag_disabled" };
    }

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const { data, error } = await supabase
      .from("dms_ai_erp_apply_correction_proposals")
      .select(correctionHistorySelect)
      .eq("id", proposalId)
      .maybeSingle();

    if (error) return {success:false,error:"Correction history could not be loaded. Please try again.",errorCode:error.code==='42501'?'permission_denied':'server_error'};
    if (!data) {
      return { success: false, error: `Correction proposal ${proposalId} not found.`, errorCode: "proposal_not_found" };
    }

    return { success: true, data: projectCorrectionHistory(data as unknown as CorrectionProposalHistory) };
  } catch (err) {
    logger.error("[apply-correction] getApplyCorrectionProposal error", { error: String(err) });
    return { success: false, error: "Failed to load correction proposal.", errorCode: "server_error" };
  }
}

// ── listApplyCorrectionProposals ──────────────────────────────────────────────

/**
 * List correction proposals with optional filters.
 */
const HistoryFilterSchema = z.object({
  documentId:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  targetTable:z.string().regex(/^[a-z][a-z0-9_]{0,99}$/).optional(),
  targetRecordId:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  requestedBy:z.number().int().positive().max(Number.MAX_SAFE_INTEGER).optional(),
  status:z.union([z.enum(['draft','pending_confirmation','applied','conflict','cancelled','failed']),z.array(z.enum(['draft','pending_confirmation','applied','conflict','cancelled','failed'])).min(1).max(6)]).optional(),
  page:z.number().int().min(0).max(Math.floor(Number.MAX_SAFE_INTEGER / 100)-1).optional(),
  pageSize:z.number().int().min(1).max(100).optional(),
}).strict();

export async function listApplyCorrectionProposals(
  filters: ListCorrectionProposalsFilter = {}
): Promise<ActionResult<CorrectionProposalHistory[]>> {
  try {
    if(!HistoryFilterSchema.safeParse(filters).success)return {success:false,error:'Invalid correction-history filters.',errorCode:'invalid_input'};
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canView =
      hasPermission(ctx, "dms.apply_correction.view") ||
      hasPermission(ctx, "dms.apply_correction.create") ||
      hasPermission(ctx, "dms.apply_to_erp.view") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (!canView) {
      return { success: false, error: "Permission denied", errorCode: "permission_denied" };
    }

    const flagEnabled = await isCorrectionProposalsEnabled();
    if (!flagEnabled) {
      return { success: false, error: "Apply Correction feature is not enabled.", errorCode: "feature_flag_disabled" };
    }

    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    let query = supabase
      .from("dms_ai_erp_apply_correction_proposals")
      .select(correctionHistorySelect)
      .order("created_at", { ascending: false })
      .order("id", { ascending: false });

    if (filters.documentId != null) {
      query = query.eq("document_id", filters.documentId);
    }
    if (filters.targetTable) {
      query = query.eq("target_table", filters.targetTable);
    }
    if (filters.targetRecordId != null) {
      query = query.eq("target_record_id", filters.targetRecordId);
    }
    if (filters.requestedBy != null) {
      query = query.eq("requested_by", filters.requestedBy);
    }
    if (filters.status) {
      const statuses = Array.isArray(filters.status) ? filters.status : [filters.status];
      query = query.in("status", statuses);
    }

    const pageSize = Math.min(filters.pageSize ?? 50, 100);
    const page = filters.page ?? 0;
    query = query.range(page * pageSize, (page + 1) * pageSize - 1);

    const { data, error } = await query;

    if (error) {
      return { success: false, error: "Correction history could not be loaded. Please try again.", errorCode:error.code==='42501'?'permission_denied':'server_error' };
    }

    return { success: true, data: ((data ?? []) as unknown as CorrectionProposalHistory[]).map(projectCorrectionHistory) };
  } catch (err) {
    logger.error("[apply-correction] listApplyCorrectionProposals error", { error: String(err) });
    return { success: false, error: "Failed to list correction proposals.", errorCode: "server_error" };
  }
}

// ── applyCorrectionProposal ───────────────────────────────────────────────────

const ApplyCorrectionSchema = z.object({
  proposalId:               z.number().int().positive(),
  humanReviewConfirmed:     z.boolean(),
  replaceExistingConfirmed: z.boolean(),
});

/**
 * Apply a correction proposal to the target ERP field.
 * Requires: dms.apply_correction.run AND dms.apply_to_erp.run AND target permission.
 */
export async function applyCorrectionProposal(
  rawInput: z.infer<typeof ApplyCorrectionSchema>
): Promise<ActionResult<{ proposalId: number; status: string }>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canRun =
      (hasPermission(ctx, "dms.apply_correction.run") ||
       hasPermission(ctx, "dms.admin") ||
       hasPermission(ctx, "system_admin")) &&
      (hasPermission(ctx, "dms.apply_to_erp.run") ||
       hasPermission(ctx, "dms.admin") ||
       hasPermission(ctx, "system_admin"));

    if (!canRun) {
      return {
        success: false,
        error: "Permission denied: requires dms.apply_correction.run AND dms.apply_to_erp.run",
        errorCode: "permission_denied",
      };
    }

    const flagEnabled = await isCorrectionProposalsEnabled();
    if (!flagEnabled) {
      return { success: false, error: "Apply Correction feature is not enabled.", errorCode: "feature_flag_disabled" };
    }

    const parsed = ApplyCorrectionSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
    }
    const input = parsed.data;

    if (!input.humanReviewConfirmed) {
      return {
        success: false,
        error: "You must confirm you have reviewed the correction before applying.",
        errorCode: "confirmation_required",
      };
    }

    // Load proposal first to check target permissions
    const { createClient } = await import("@/lib/supabase/server");
    const supabase = await createClient();

    const { data: proposal } = await supabase
      .from("dms_ai_erp_apply_correction_proposals")
      .select("target_table, target_field")
      .eq("id", input.proposalId)
      .maybeSingle();

    if (!proposal) {
      return { success: false, error: `Correction proposal ${input.proposalId} not found.`, errorCode: "proposal_not_found" };
    }

    // Check target-specific permission
    const targetPerms = getTargetPermissions(
      (proposal as { target_table: string }).target_table,
      (proposal as { target_field: string }).target_field
    );

    const hasTargetPerm =
      hasPermission(ctx, targetPerms.targetPermission) ||
      hasPermission(ctx, targetPerms.adminPermission) ||
      hasPermission(ctx, "system_admin");

    if (!hasTargetPerm) {
      return {
        success: false,
        error: `Permission denied: requires ${targetPerms.targetPermission} for this target.`,
        errorCode: "permission_denied",
      };
    }

    if(isPartyCorrectionTarget((proposal as {target_table:string}).target_table)){
      const result=await runPartyCorrection('apply',input);
      if(result.success)refreshCorrectionViews();
      return result;
    }

    // Execute the correction
    const result = await executeCorrectionProposal(
      {
        proposalId:               input.proposalId,
        humanReviewConfirmed:     input.humanReviewConfirmed,
        replaceExistingConfirmed: input.replaceExistingConfirmed,
      },
      ctx.profile.id,
      ctx.profile.id
    );

    if (!result.success) {
      return { success: false, error: result.message, errorCode: result.error };
    }

    revalidatePath("/dms");

    return { success: true, data: { proposalId: result.proposalId, status: result.status } };
  } catch (err) {
    logger.error("[apply-correction] applyCorrectionProposal error", { error: String(err) });
    return { success: false, error: "Failed to apply correction." };
  }
}

// ── cancelApplyCorrectionProposal ─────────────────────────────────────────────

/**
 * Cancel a correction proposal (status-only — no target write).
 */
export async function cancelApplyCorrectionProposal(
  proposalId: number
): Promise<ActionResult<{ proposalId: number }>> {
  try {
    if (!isSafeNumber(proposalId)) {
      return { success: false, error: "Invalid proposalId" };
    }

    const ctx = await getAuthContext();
    if (!ctx.profile?.id) {
      return { success: false, error: "Not authenticated", errorCode: "not_authenticated" };
    }

    const canCancel =
      hasPermission(ctx, "dms.apply_correction.create") ||
      hasPermission(ctx, "dms.apply_correction.run") ||
      hasPermission(ctx, "dms.apply_correction.admin") ||
      hasPermission(ctx, "dms.admin") ||
      hasPermission(ctx, "system_admin");

    if (!canCancel) {
      return { success: false, error: "Permission denied", errorCode: "permission_denied" };
    }

    const flagEnabled = await isCorrectionProposalsEnabled();
    if (!flagEnabled) {
      return { success: false, error: "Apply Correction feature is not enabled.", errorCode: "feature_flag_disabled" };
    }

    const {createClient}=await import('@/lib/supabase/server');
    const db=await createClient(),loaded=await db.from('dms_ai_erp_apply_correction_proposals').select('target_table').eq('id',proposalId).maybeSingle();
    if(loaded.error||!loaded.data)return {success:false,error:'Correction proposal unavailable.',errorCode:'proposal_not_found'};
    if(isPartyCorrectionTarget(loaded.data.target_table)){
      const result=await runPartyCorrection('cancel',{proposalId});
      if(result.success)refreshCorrectionViews();
      return result;
    }
    const result = await cancelCorrectionProposal(proposalId, ctx.profile.id, ctx.profile.id);

    if (!result.success) {
      return { success: false, error: result.message, errorCode: result.error };
    }

    revalidatePath("/dms");

    return { success: true, data: { proposalId } };
  } catch (err) {
    logger.error("[apply-correction] cancelApplyCorrectionProposal error", { error: String(err) });
    return { success: false, error: "Failed to cancel correction proposal." };
  }
}

// ── Private ───────────────────────────────────────────────────────────────────

function isSafeNumber(n: unknown): n is number {
  return typeof n === "number" && Number.isSafeInteger(n) && n > 0;
}

function refreshCorrectionViews(documentId?:number|null,partyId?:number){
  const paths=['/dms','/dms/review-queue','/dms/documents','/admin/master-data/parties'];
  if(documentId)paths.push(`/dms/documents/record/${documentId}`);
  if(partyId)paths.push(`/admin/master-data/parties/record/${partyId}`);
  for(const path of paths)try{revalidatePath(path);}catch{logger.warn('[party-correction] committed result; view refresh unavailable');}
}
