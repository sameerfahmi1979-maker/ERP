/**
 * ERP DMS AI Phase 17 — Correction Engine
 *
 * Core engine operations for the Apply Correction Proposal workflow.
 *
 * Functions:
 *   createCorrectionProposal()  — writes proposal only, not the target
 *   executeCorrectionProposal() — applies the correction to the target after confirmation
 *   cancelCorrectionProposal()  — status-only update, no target write
 *
 * Safety:
 *   - createCorrectionProposal may only write to dms_ai_erp_apply_correction_proposals + audit_logs
 *   - executeCorrectionProposal requires humanReviewConfirmed + replaceExistingConfirmed checks
 *   - executeCorrectionProposal reloads target before write and runs conflict detection
 *   - executeCorrectionProposal creates a linked apply run with source_type=correction_proposal
 *   - No automatic rollback, no one-click undo, no background reversal
 */

import { createClient } from "@/lib/supabase/server";
import { logAudit } from "@/server/actions/audit";
import {
  buildCorrectionProposalCreatedMeta,
  buildCorrectionAppliedMeta,
  buildCorrectionConflictMeta,
  buildCorrectionCancelledMeta,
  buildCorrectionFailedMeta,
} from "./correction-audit";
import { detectCorrectionConflicts } from "./correction-conflict-detector";
import type {
  CreateCorrectionProposalInput,
  ApplyCorrectionInput,
  CorrectionResult,
  CorrectionProposalRow,
} from "./types";

// ── Code generator ────────────────────────────────────────────────────────────

function generateProposalCode(): string {
  const ts = new Date().toISOString().replace(/[-:T.Z]/g, "").slice(0, 14);
  const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
  return `CORR-${ts}-${rand}`;
}

// ── createCorrectionProposal ─────────────────────────────────────────────────

/**
 * Create a correction proposal row.
 * Writes ONLY to dms_ai_erp_apply_correction_proposals and audit_logs.
 * Does NOT touch any target ERP table.
 */
export async function createCorrectionProposal(
  input: CreateCorrectionProposalInput,
  userId: number,
  userProfileId: number
): Promise<CorrectionResult> {
  const supabase = await createClient();
  const proposalCode = generateProposalCode();

  const src = input.sourceSnapshot;

  const { data: proposal, error } = await supabase
    .from("dms_ai_erp_apply_correction_proposals")
    .insert({
      proposal_code:                proposalCode,
      original_apply_run_id:        src.originalApplyRunId,
      original_apply_item_id:       src.originalApplyItemId,
      document_id:                  src.documentId,
      target_module:                src.targetModule,
      target_table:                 src.targetTable,
      target_field:                 src.targetField,
      target_record_id:             src.targetRecordId,
      value_type:                   src.valueType,
      original_before_summary:      src.originalBeforeSummary,
      original_applied_summary:     src.originalAppliedSummary,
      current_value_summary:        src.currentValueSummary,
      proposed_correction_summary:  input.proposedCorrectionSummary.slice(0, 200),
      correction_value_json:        input.correctionValue,
      correction_mode:              input.correctionMode,
      status:                       "draft",
      requested_by:                 userProfileId,
    })
    .select("id, proposal_code, status")
    .single();

  if (error || !proposal) {
    return {
      success: false,
      error: "server_error",
      message: error?.message ?? "Failed to create correction proposal.",
    };
  }

  // Audit (safe — no raw content, no correction_value_json)
  void logAudit({
    module_code:     "dms_ai",
    entity_name:     "dms_ai_erp_apply_correction_proposals",
    entity_id:       proposal.id,
    entity_reference: proposalCode,
    action:          "dms_apply_correction_proposal_created",
    new_values:      buildCorrectionProposalCreatedMeta({
      proposalId:                 proposal.id,
      proposalCode:               proposalCode,
      originalApplyItemId:        input.originalApplyItemId,
      documentId:                 src.documentId,
      targetTable:                src.targetTable,
      targetField:                src.targetField,
      targetRecordId:             src.targetRecordId,
      correctionMode:             input.correctionMode,
      proposedCorrectionSummary:  input.proposedCorrectionSummary,
      requestedBy:                userProfileId,
    }),
  });
  void userId;

  return {
    success: true,
    proposalId: proposal.id,
    status: "draft",
  };
}

// ── executeCorrectionProposal ─────────────────────────────────────────────────

/**
 * Apply a correction proposal to the target ERP field.
 * Requires humanReviewConfirmed = true.
 * Reloads target record and runs conflict detection before writing.
 */
export async function executeCorrectionProposal(
  applyInput: ApplyCorrectionInput,
  userId: number,
  userProfileId: number
): Promise<CorrectionResult> {
  const supabase = await createClient();

  // ── 1. Confirmation gate ──────────────────────────────────────────────────
  if (!applyInput.humanReviewConfirmed) {
    return {
      success: false,
      error: "confirmation_required",
      message: "You must confirm you have reviewed the correction before applying.",
    };
  }

  // ── 2. Load proposal ──────────────────────────────────────────────────────
  const { data: proposal, error: propErr } = await supabase
    .from("dms_ai_erp_apply_correction_proposals")
    .select("*")
    .eq("id", applyInput.proposalId)
    .maybeSingle();

  if (propErr || !proposal) {
    return {
      success: false,
      error: "proposal_not_found",
      message: `Correction proposal ${applyInput.proposalId} not found.`,
    };
  }

  const p = proposal as unknown as CorrectionProposalRow;

  // ── 3. Load original apply item (re-verify status=applied) ───────────────
  const { data: originalItem } = await supabase
    .from("dms_ai_erp_apply_items")
    .select("id, status")
    .eq("id", p.original_apply_item_id)
    .maybeSingle();

  // ── 4. Conflict detection ─────────────────────────────────────────────────
  const conflictResult = await detectCorrectionConflicts({
    proposalStatus:          p.status,
    originalItemStatus:      (originalItem as { status?: string } | null)?.status ?? "unknown",
    targetTable:             p.target_table,
    targetField:             p.target_field,
    targetModule:            p.target_module,
    targetRecordId:          p.target_record_id,
    proposalCurrentSummary:  p.current_value_summary,
    replaceExistingConfirmed: applyInput.replaceExistingConfirmed,
  });

  if (conflictResult.conflict) {
    // Mark proposal as conflicted
    await supabase
      .from("dms_ai_erp_apply_correction_proposals")
      .update({
        status:          "conflict",
        conflict_status: conflictResult.code,
        conflict_reason: conflictResult.reason.slice(0, 500),
        updated_at:      new Date().toISOString(),
      })
      .eq("id", p.id);

    void logAudit({
      module_code:     "dms_ai",
      entity_name:     "dms_ai_erp_apply_correction_proposals",
      entity_id:       p.id,
      entity_reference: p.proposal_code ?? String(p.id),
      action:          "dms_apply_correction_conflict",
      new_values:      buildCorrectionConflictMeta({
        proposalId:     p.id,
        proposalCode:   p.proposal_code,
        documentId:     p.document_id,
        targetTable:    p.target_table,
        targetField:    p.target_field,
        targetRecordId: p.target_record_id,
        conflictReason: conflictResult.reason,
        detectedBy:     userProfileId,
      }),
    });

    return {
      success: false,
      error: conflictResult.code,
      message: conflictResult.reason,
    };
  }

  // ── 5. Extract typed correction value ─────────────────────────────────────
  const correctionValue = p.correction_value_json;
  if (!correctionValue || typeof correctionValue !== "object" || !("v" in correctionValue)) {
    await markProposalFailed(supabase, p, "Invalid correction_value_json stored in proposal.");
    return {
      success: false,
      error: "invalid_correction_value",
      message: "Correction value is malformed.",
    };
  }

  const scalarValue = (correctionValue as { v: unknown }).v;

  // ── 6. Create a linked apply run (source_type=correction_proposal) ────────
  const runCode = `CORR-RUN-${Date.now().toString(36).toUpperCase()}`;
  const { data: correctionRun, error: runErr } = await supabase
    .from("dms_ai_erp_apply_runs")
    .insert({
      run_code:           runCode,
      document_id:        p.document_id,
      source_type:        "correction_proposal",
      target_module:      p.target_module,
      target_table:       p.target_table,
      target_record_id:   p.target_record_id,
      status:             "in_progress",
      confirmed_by:       userProfileId,
      requested_by:       userProfileId,
    })
    .select("id")
    .single();

  if (runErr || !correctionRun) {
    return {
      success: false,
      error: "server_error",
      message: `Failed to create correction apply run: ${runErr?.message ?? "unknown"}`,
    };
  }

  // ── 7. Write the correction to the target field ───────────────────────────
  let writeError: string | null = null;

  if (p.target_record_id) {
    const updatePayload: Record<string, unknown> = {
      [p.target_field]: scalarValue,
      updated_at: new Date().toISOString(),
    };

    const { error: writeErr } = await supabase
      .from(p.target_table as never)
      .update(updatePayload)
      .eq("id", p.target_record_id);

    if (writeErr) {
      writeError = writeErr.message;
    }
  }

  if (writeError) {
    // Mark proposal as failed
    await supabase
      .from("dms_ai_erp_apply_runs")
      .update({ status: "failed", updated_at: new Date().toISOString() })
      .eq("id", correctionRun.id);

    await markProposalFailed(supabase, p, writeError);

    void logAudit({
      module_code:     "dms_ai",
      entity_name:     "dms_ai_erp_apply_correction_proposals",
      entity_id:       p.id,
      entity_reference: p.proposal_code ?? String(p.id),
      action:          "dms_apply_correction_failed",
      new_values:      buildCorrectionFailedMeta({
        proposalId:    p.id,
        proposalCode:  p.proposal_code,
        documentId:    p.document_id,
        targetTable:   p.target_table,
        targetField:   p.target_field,
        failureReason: writeError,
      }),
    });

    return {
      success: false,
      error: "server_error",
      message: `Failed to write correction to ${p.target_table}.${p.target_field}: ${writeError}`,
    };
  }

  // ── 8. Create linked apply item (correction_proposal history row) ──────────
  await supabase.from("dms_ai_erp_apply_items").insert({
    apply_run_id:             correctionRun.id,
    source_type:              "correction_proposal",
    source_id:                p.id,
    source_field_code:        p.target_field,
    target_table:             p.target_table,
    target_field:             p.target_field,
    target_record_id:         p.target_record_id,
    target_display_label:     `Correction of ${p.target_field}`,
    value_type:               p.value_type,
    current_value_summary:    p.current_value_summary,
    applied_value_summary:    p.proposed_correction_summary,
    status:                   "applied",
    applied_at:               new Date().toISOString(),
  });

  // ── 9. Mark run as completed ──────────────────────────────────────────────
  await supabase
    .from("dms_ai_erp_apply_runs")
    .update({ status: "completed", updated_at: new Date().toISOString() })
    .eq("id", correctionRun.id);

  // ── 10. Mark proposal as applied ─────────────────────────────────────────
  const now = new Date().toISOString();
  await supabase
    .from("dms_ai_erp_apply_correction_proposals")
    .update({
      status:                  "applied",
      correction_apply_run_id: correctionRun.id,
      confirmed_by:            userProfileId,
      applied_by:              userProfileId,
      confirmed_at:            now,
      applied_at:              now,
      updated_at:              now,
    })
    .eq("id", p.id);

  // ── 11. Audit ─────────────────────────────────────────────────────────────
  void logAudit({
    module_code:     "dms_ai",
    entity_name:     "dms_ai_erp_apply_correction_proposals",
    entity_id:       p.id,
    entity_reference: p.proposal_code ?? String(p.id),
    action:          "dms_apply_correction_applied",
    new_values:      buildCorrectionAppliedMeta({
      proposalId:                 p.id,
      proposalCode:               p.proposal_code,
      correctionApplyRunId:       correctionRun.id,
      documentId:                 p.document_id,
      targetTable:                p.target_table,
      targetField:                p.target_field,
      targetRecordId:             p.target_record_id,
      proposedCorrectionSummary:  p.proposed_correction_summary,
      appliedBy:                  userProfileId,
    }),
  });
  void userId;

  return {
    success: true,
    proposalId: p.id,
    status: "applied",
  };
}

// ── cancelCorrectionProposal ──────────────────────────────────────────────────

/**
 * Cancel a correction proposal (status-only update, no target write).
 */
export async function cancelCorrectionProposal(
  proposalId: number,
  userId: number,
  userProfileId: number
): Promise<CorrectionResult> {
  const supabase = await createClient();

  const { data: proposal } = await supabase
    .from("dms_ai_erp_apply_correction_proposals")
    .select("id, proposal_code, document_id, status")
    .eq("id", proposalId)
    .maybeSingle();

  if (!proposal) {
    return {
      success: false,
      error: "proposal_not_found",
      message: `Correction proposal ${proposalId} not found.`,
    };
  }

  const p = proposal as Pick<CorrectionProposalRow, "id" | "proposal_code" | "document_id" | "status">;

  if (p.status === "applied") {
    return {
      success: false,
      error: "proposal_already_applied",
      message: "Cannot cancel a correction that has already been applied.",
    };
  }
  if (p.status === "cancelled") {
    return {
      success: false,
      error: "proposal_already_cancelled",
      message: "Correction proposal is already cancelled.",
    };
  }

  await supabase
    .from("dms_ai_erp_apply_correction_proposals")
    .update({
      status:       "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at:   new Date().toISOString(),
    })
    .eq("id", proposalId);

  void logAudit({
    module_code:     "dms_ai",
    entity_name:     "dms_ai_erp_apply_correction_proposals",
    entity_id:       proposalId,
    entity_reference: p.proposal_code ?? String(proposalId),
    action:          "dms_apply_correction_cancelled",
    new_values:      buildCorrectionCancelledMeta({
      proposalId:   p.id,
      proposalCode: p.proposal_code,
      documentId:   p.document_id,
      cancelledBy:  userProfileId,
    }),
  });
  void userId;

  return {
    success: true,
    proposalId,
    status: "cancelled",
  };
}

// ── Private helper ────────────────────────────────────────────────────────────

async function markProposalFailed(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  proposal: Pick<CorrectionProposalRow, "id">,
  reason: string
): Promise<void> {
  const now = new Date().toISOString();
  await supabase
    .from("dms_ai_erp_apply_correction_proposals")
    .update({
      status:         "failed",
      failure_reason: reason.slice(0, 500),
      failed_at:      now,
      updated_at:     now,
    })
    .eq("id", proposal.id);
}
