/**
 * ERP DMS AI Phase 16 — Apply Audit Helpers
 *
 * Safe audit event builders for Apply-to-ERP operations (Tier 1 + Tier 2).
 *
 * Safety rules:
 *   - No raw OCR/content/prompt/AI response in audit metadata
 *   - Value summaries max 200 chars
 *   - Summaries only (no full record dumps)
 *   - TRN summaries masked in Tier 2 party tax events
 *   - Uses the same logAudit() pattern as other DMS AI phases
 */

// ── Event types ───────────────────────────────────────────────────────────────

export type ApplyAuditEvent =
  | "dms_apply_to_erp_run_created"
  | "dms_apply_to_erp_item_applied"
  | "dms_apply_to_erp_item_skipped"
  | "dms_apply_to_erp_item_conflict"
  | "dms_apply_to_erp_run_completed"
  | "dms_apply_to_erp_run_cancelled";

// ── Safe metadata builders ─────────────────────────────────────────────────────

/** Safe metadata for a run creation event. */
export function buildRunCreatedMeta(opts: {
  runId:         number;
  runCode:       string | null;
  documentId:    number | null;
  sourceType:    string;
  targetModule:  string;
  targetTable:   string;
  itemCount:     number;
  /** Tier 2: party context */
  partyId?:      number | null;
  partyName?:    string | null;
}) {
  const base = {
    run_id:       opts.runId,
    run_code:     opts.runCode,
    document_id:  opts.documentId,
    source_type:  opts.sourceType,
    target_module: opts.targetModule,
    target_table: opts.targetTable,
    item_count:   opts.itemCount,
  };
  if (opts.partyId != null) {
    return { ...base, party_id: opts.partyId, party_name: opts.partyName ?? null };
  }
  return base;
}

/** Safe metadata for a run completion event. */
export function buildRunCompletedMeta(opts: {
  runId:          number;
  runCode:        string | null;
  documentId:     number | null;
  status:         string;
  appliedCount:   number;
  skippedCount:   number;
  conflictCount:  number;
  failedCount:    number;
}) {
  return {
    run_id:         opts.runId,
    run_code:       opts.runCode,
    document_id:    opts.documentId,
    final_status:   opts.status,
    applied_count:  opts.appliedCount,
    skipped_count:  opts.skippedCount,
    conflict_count: opts.conflictCount,
    failed_count:   opts.failedCount,
  };
}

/** Safe metadata for a run cancellation event. */
export function buildRunCancelledMeta(opts: {
  runId:       number;
  runCode:     string | null;
  documentId:  number | null;
  cancelledBy: number;
}) {
  return {
    run_id:       opts.runId,
    run_code:     opts.runCode,
    document_id:  opts.documentId,
    cancelled_by: opts.cancelledBy,
  };
}

/** Safe metadata for an item applied event. */
export function buildItemAppliedMeta(opts: {
  itemId:               number;
  runId:                number;
  targetTable:          string;
  targetField:          string;
  targetRecordId:       number | null;
  appliedValueSummary:  string | null;  // max 200 chars — caller must truncate
  /** Tier 2: party context */
  partyId?:             number | null;
  partyDisplayName?:    string | null;
  targetChildCode?:     string | null;
  targetChildLabel?:    string | null;
}) {
  const base = {
    item_id:              opts.itemId,
    run_id:               opts.runId,
    target_table:         opts.targetTable,
    target_field:         opts.targetField,
    target_record_id:     opts.targetRecordId,
    applied_value_summary: opts.appliedValueSummary,  // safe summary, not raw value
  };
  // Attach party context if provided (Tier 2)
  if (opts.partyId != null) {
    return {
      ...base,
      party_id:           opts.partyId,
      party_display_name: opts.partyDisplayName ?? null,
      target_child_code:  opts.targetChildCode ?? null,
      target_child_label: opts.targetChildLabel ?? null,
    };
  }
  return base;
}

/** Safe metadata for an item skipped/conflict event. */
export function buildItemSkippedMeta(opts: {
  itemId:       number;
  runId:        number;
  targetTable:  string;
  targetField:  string;
  reason:       string;
  status:       "skipped" | "conflict" | "failed" | "forbidden";
}) {
  return {
    item_id:     opts.itemId,
    run_id:      opts.runId,
    target_table: opts.targetTable,
    target_field: opts.targetField,
    reason:      opts.reason.slice(0, 200),  // safe truncation
    status:      opts.status,
  };
}
