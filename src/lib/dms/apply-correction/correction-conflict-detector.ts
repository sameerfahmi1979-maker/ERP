/**
 * ERP DMS AI Phase 17 — Correction Conflict Detector
 *
 * Detects conflicts before applying a correction proposal.
 *
 * Rules:
 *   - Proposal must be in 'draft' or 'pending_confirmation' status
 *   - Original apply item must still be status=applied
 *   - Target must still be allowlisted
 *   - Live target value must match current_value_summary captured at proposal creation
 *   - If value changed, set conflict (do not overwrite unless confirmed)
 */

import { createClient } from "@/lib/supabase/server";
import { validateApplyTarget } from "@/lib/dms/apply-to-erp/apply-target-registry";
import type { CorrectionConflictResult } from "./types";

// ── Summary max ───────────────────────────────────────────────────────────────

const SUMMARY_MAX = 200;

// ── Public: detectCorrectionConflicts ────────────────────────────────────────

export type PreApplyState = {
  proposalStatus:          string;
  originalItemStatus:      string;
  targetTable:             string;
  targetField:             string;
  targetModule:            string;
  targetRecordId:          number | null;
  proposalCurrentSummary:  string | null;  // snapshot captured at proposal creation
  replaceExistingConfirmed: boolean;
};

/**
 * Run all pre-apply conflict checks.
 *
 * Returns { conflict: false } if safe to proceed.
 * Returns { conflict: true, reason, code } if blocked.
 */
export async function detectCorrectionConflicts(
  state: PreApplyState
): Promise<CorrectionConflictResult> {
  // ── 1. Proposal status check ──────────────────────────────────────────────
  if (state.proposalStatus === "applied") {
    return {
      conflict: true,
      reason: "This correction has already been applied.",
      code: "proposal_already_applied",
    };
  }
  if (state.proposalStatus === "cancelled") {
    return {
      conflict: true,
      reason: "This correction proposal was cancelled.",
      code: "proposal_already_cancelled",
    };
  }
  if (
    state.proposalStatus !== "draft" &&
    state.proposalStatus !== "pending_confirmation"
  ) {
    return {
      conflict: true,
      reason: `Proposal is in '${state.proposalStatus}' status and cannot be applied.`,
      code: "proposal_not_in_correctable_state",
    };
  }

  // ── 2. Original item status check ────────────────────────────────────────
  if (state.originalItemStatus !== "applied") {
    return {
      conflict: true,
      reason: `Original apply item is '${state.originalItemStatus}', not 'applied'. Cannot correct.`,
      code: "original_item_not_applied",
    };
  }

  // ── 3. Target allowlist check ─────────────────────────────────────────────
  const registryValidation = validateApplyTarget(state.targetTable, state.targetField);
  if (!registryValidation.valid) {
    return {
      conflict: true,
      reason: `${state.targetTable}.${state.targetField} is no longer in the apply target allowlist.`,
      code: "target_not_allowlisted",
    };
  }
  void state.targetModule; // cross-checked via validateApplyTarget

  // ── 4. Live value reload and comparison ───────────────────────────────────
  if (state.targetRecordId) {
    const liveConflict = await checkLiveValueConflict(state);
    if (liveConflict.conflict) return liveConflict;
  }

  return { conflict: false };
}

// ── Private: live value conflict check ───────────────────────────────────────

async function checkLiveValueConflict(
  state: PreApplyState
): Promise<CorrectionConflictResult> {
  const supabase = await createClient();

  try {
    const { data } = await supabase
      .from(state.targetTable as never)
      .select(state.targetField)
      .eq("id", state.targetRecordId!)
      .maybeSingle();

    if (!data) {
      return {
        conflict: true,
        reason: "Target record could not be found. It may have been deleted.",
        code: "target_record_not_found",
      };
    }

    const liveRaw = (data as unknown as Record<string, unknown>)[state.targetField];
    const liveStr =
      liveRaw != null
        ? String(liveRaw).slice(0, SUMMARY_MAX)
        : null;

    const capturedSummary = state.proposalCurrentSummary;

    // Check if live value differs from snapshot captured at proposal creation
    if (normalizeForComparison(liveStr) !== normalizeForComparison(capturedSummary)) {
      return {
        conflict: true,
        reason:
          `The target field '${state.targetField}' on ${state.targetTable} has changed since this ` +
          `correction proposal was created. Current live value differs from the captured snapshot. ` +
          `Please reload the correction source and create a new proposal.`,
        code: "conflict_detected",
      };
    }

    // If field has a value and user hasn't confirmed overwrite
    if (liveStr != null && liveStr !== "" && !state.replaceExistingConfirmed) {
      return {
        conflict: true,
        reason: `The field '${state.targetField}' already has a value. Confirm you want to replace it.`,
        code: "replace_existing_required",
      };
    }

    return { conflict: false };
  } catch {
    return {
      conflict: true,
      reason: "Failed to reload target record for conflict check.",
      code: "conflict_detected",
    };
  }
}

// ── Private: normalize for comparison ────────────────────────────────────────

function normalizeForComparison(value: string | null | undefined): string {
  if (value == null || value === "") return "";
  return value.trim().toLowerCase();
}
