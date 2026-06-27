/**
 * ERP DMS AI Phase 17 — Correction Audit Helpers
 *
 * Safe audit event builders for Apply Correction operations.
 *
 * Safety rules:
 *   - No raw OCR/content/prompt/AI response in audit metadata
 *   - Summary fields max 200 chars
 *   - Summaries only (no full record dumps, no correction_value_json)
 *   - Uses the same logAudit() pattern as Phase 16
 */

// ── Event types ───────────────────────────────────────────────────────────────

export type CorrectionAuditEvent =
  | "dms_apply_correction_source_viewed"
  | "dms_apply_correction_proposal_created"
  | "dms_apply_correction_applied"
  | "dms_apply_correction_conflict"
  | "dms_apply_correction_cancelled"
  | "dms_apply_correction_failed";

// ── Safe metadata builders ────────────────────────────────────────────────────

/** Safe metadata for a source-viewed event. */
export function buildCorrectionSourceViewedMeta(opts: {
  applyItemId:   number;
  applyRunId:    number;
  documentId:    number | null;
  targetTable:   string;
  targetField:   string;
  targetRecordId: number | null;
  viewedBy:      number;
}) {
  return {
    apply_item_id:   opts.applyItemId,
    apply_run_id:    opts.applyRunId,
    document_id:     opts.documentId,
    target_table:    opts.targetTable,
    target_field:    opts.targetField,
    target_record_id: opts.targetRecordId,
    viewed_by:       opts.viewedBy,
  };
}

/** Safe metadata for a proposal-created event. */
export function buildCorrectionProposalCreatedMeta(opts: {
  proposalId:                  number;
  proposalCode:                string | null;
  originalApplyItemId:         number;
  documentId:                  number | null;
  targetTable:                 string;
  targetField:                 string;
  targetRecordId:              number | null;
  correctionMode:              string;
  proposedCorrectionSummary:   string | null; // max 200 chars — no raw content
  requestedBy:                 number;
}) {
  return {
    proposal_id:                  opts.proposalId,
    proposal_code:                opts.proposalCode,
    original_apply_item_id:       opts.originalApplyItemId,
    document_id:                  opts.documentId,
    target_table:                 opts.targetTable,
    target_field:                 opts.targetField,
    target_record_id:             opts.targetRecordId,
    correction_mode:              opts.correctionMode,
    proposed_correction_summary:  opts.proposedCorrectionSummary?.slice(0, 200) ?? null,
    requested_by:                 opts.requestedBy,
  };
}

/** Safe metadata for a correction-applied event. */
export function buildCorrectionAppliedMeta(opts: {
  proposalId:                  number;
  proposalCode:                string | null;
  correctionApplyRunId:        number | null;
  documentId:                  number | null;
  targetTable:                 string;
  targetField:                 string;
  targetRecordId:              number | null;
  proposedCorrectionSummary:   string | null; // max 200 chars — not raw value
  appliedBy:                   number;
}) {
  return {
    proposal_id:                  opts.proposalId,
    proposal_code:                opts.proposalCode,
    correction_apply_run_id:      opts.correctionApplyRunId,
    document_id:                  opts.documentId,
    target_table:                 opts.targetTable,
    target_field:                 opts.targetField,
    target_record_id:             opts.targetRecordId,
    proposed_correction_summary:  opts.proposedCorrectionSummary?.slice(0, 200) ?? null,
    applied_by:                   opts.appliedBy,
  };
}

/** Safe metadata for a conflict event. */
export function buildCorrectionConflictMeta(opts: {
  proposalId:    number;
  proposalCode:  string | null;
  documentId:    number | null;
  targetTable:   string;
  targetField:   string;
  targetRecordId: number | null;
  conflictReason: string;
  detectedBy:    number;
}) {
  return {
    proposal_id:    opts.proposalId,
    proposal_code:  opts.proposalCode,
    document_id:    opts.documentId,
    target_table:   opts.targetTable,
    target_field:   opts.targetField,
    target_record_id: opts.targetRecordId,
    conflict_reason: opts.conflictReason.slice(0, 200),
    detected_by:    opts.detectedBy,
  };
}

/** Safe metadata for a cancellation event. */
export function buildCorrectionCancelledMeta(opts: {
  proposalId:   number;
  proposalCode: string | null;
  documentId:   number | null;
  cancelledBy:  number;
}) {
  return {
    proposal_id:   opts.proposalId,
    proposal_code: opts.proposalCode,
    document_id:   opts.documentId,
    cancelled_by:  opts.cancelledBy,
  };
}

/** Safe metadata for a failure event. */
export function buildCorrectionFailedMeta(opts: {
  proposalId:    number;
  proposalCode:  string | null;
  documentId:    number | null;
  targetTable:   string;
  targetField:   string;
  failureReason: string;
}) {
  return {
    proposal_id:    opts.proposalId,
    proposal_code:  opts.proposalCode,
    document_id:    opts.documentId,
    target_table:   opts.targetTable,
    target_field:   opts.targetField,
    failure_reason: opts.failureReason.slice(0, 200),
  };
}
