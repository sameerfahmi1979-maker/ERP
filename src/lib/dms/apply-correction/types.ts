/**
 * ERP DMS AI Phase 17 — Apply Correction Proposal Types
 *
 * Pure type definitions for the Apply Correction engine.
 * No Supabase, no React, no server-only code.
 *
 * Safety contract:
 *   - No raw OCR/content/prompt/AI response in any type
 *   - correction_value_json is scalar only: { v: string | number | boolean }
 *   - Summary fields max 200 chars — enforced in value builder
 *   - Not rollback. Not undo. Human-reviewed correction only.
 */

import type { ApplyTargetModule, ApplyValueType, ApplyErrorCode } from "@/lib/dms/apply-to-erp/types";

// ── Correction modes ──────────────────────────────────────────────────────────

export type CorrectionMode =
  | "manual"           // user enters correction value from scratch
  | "restore_previous" // prefill from original_before_summary (with truncation warning)
  | "reapply_ai_value"; // prefill from original_applied_summary (re-apply the AI value)

// ── Proposal status lifecycle ─────────────────────────────────────────────────

export type CorrectionProposalStatus =
  | "draft"               // proposal created, not yet confirmed
  | "pending_confirmation" // awaiting final apply confirmation
  | "applied"             // correction written to target
  | "conflict"            // conflict detected — not written
  | "cancelled"           // user cancelled
  | "failed";             // unexpected server error during apply

// ── Scalar correction value wrapper ──────────────────────────────────────────

/**
 * Scalar-only correction value.
 * Only { v: string | number | boolean } is allowed.
 * Arrays and nested objects are FORBIDDEN.
 */
export type CorrectionScalarValue = {
  v: string | number | boolean;
};

// ── Source data (read from original apply item + live target reload) ──────────

export type CorrectionSourceData = {
  /** The original apply item (must be status=applied). */
  originalApplyItemId:    number;
  originalApplyRunId:     number;
  documentId:             number | null;

  /** Target coordinates (read from original item). */
  targetModule:           ApplyTargetModule;
  targetTable:            string;
  targetField:            string;
  targetRecordId:         number | null;
  targetDisplayLabel:     string | null;
  valueType:              ApplyValueType;

  /** History snapshots from original apply item. */
  originalBeforeSummary:  string | null;  // what the field was before apply
  originalAppliedSummary: string | null;  // what the AI wrote

  /** Live value read at correction source load time (fresh reload). */
  currentValueSummary:    string | null;

  /** Whether Use Previous Value (Mode B) is eligible. */
  restorePreviousEnabled: boolean;
  restorePreviousWarning: string | null; // populated when text may be truncated
};

// ── Create proposal input ─────────────────────────────────────────────────────

export type CreateCorrectionProposalInput = {
  originalApplyItemId:       number;
  correctionMode:            CorrectionMode;
  /** Human-entered correction value (scalar only). */
  correctionValue:           CorrectionScalarValue;
  proposedCorrectionSummary: string; // display summary max 200 chars
  /** Source data snapshot (captured at proposal creation time). */
  sourceSnapshot:            CorrectionSourceData;
};

// ── Apply correction input ────────────────────────────────────────────────────

export type ApplyCorrectionInput = {
  proposalId:              number;
  humanReviewConfirmed:    boolean;
  replaceExistingConfirmed: boolean;
};

// ── Proposal row (from DB) ────────────────────────────────────────────────────

export type CorrectionProposalRow = {
  id:                          number;
  proposal_code:               string | null;
  original_apply_run_id:       number;
  original_apply_item_id:      number;
  document_id:                 number | null;
  target_module:               ApplyTargetModule;
  target_table:                string;
  target_field:                string;
  target_record_id:            number | null;
  value_type:                  ApplyValueType;
  original_before_summary:     string | null;
  original_applied_summary:    string | null;
  current_value_summary:       string | null;
  proposed_correction_summary: string | null;
  correction_value_json:       CorrectionScalarValue | null;
  correction_mode:             CorrectionMode;
  status:                      CorrectionProposalStatus;
  conflict_status:             string | null;
  conflict_reason:             string | null;
  correction_apply_run_id:     number | null;
  requested_by:                number;
  confirmed_by:                number | null;
  applied_by:                  number | null;
  created_at:                  string;
  confirmed_at:                string | null;
  applied_at:                  string | null;
  cancelled_at:                string | null;
  failed_at:                   string | null;
  updated_at:                  string;
  failure_reason:              string | null;
};

// ── Correction result ─────────────────────────────────────────────────────────

export type CorrectionResult =
  | { success: true;  proposalId: number; status: CorrectionProposalStatus }
  | { success: false; error: CorrectionErrorCode; message: string };

// ── Error codes ───────────────────────────────────────────────────────────────

/** Correction error codes — subset of ApplyErrorCode */
export type CorrectionErrorCode = Extract<ApplyErrorCode,
  | "feature_flag_disabled"
  | "permission_denied"
  | "original_item_not_found"
  | "original_item_not_applied"
  | "original_run_not_found"
  | "target_not_allowlisted"
  | "target_record_not_found"
  | "target_record_inactive"
  | "invalid_correction_value"
  | "correction_value_not_scalar"
  | "correction_value_forbidden_pattern"
  | "proposal_not_found"
  | "proposal_not_in_correctable_state"
  | "proposal_already_applied"
  | "proposal_already_cancelled"
  | "conflict_detected"
  | "confirmation_required"
  | "replace_existing_required"
  | "server_error"
>;

// ── Conflict detection result ─────────────────────────────────────────────────

export type CorrectionConflictResult =
  | { conflict: false }
  | { conflict: true; reason: string; code: CorrectionErrorCode };

// ── List filter ───────────────────────────────────────────────────────────────

export type ListCorrectionProposalsFilter = {
  documentId?:       number;
  targetTable?:      string;
  targetRecordId?:   number;
  status?:           CorrectionProposalStatus | CorrectionProposalStatus[];
  requestedBy?:      number;
  page?:             number;
  pageSize?:         number;
};
