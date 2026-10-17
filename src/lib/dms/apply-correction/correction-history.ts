import type { CorrectionProposalHistory } from "./types";

// Explicit projection: newly added database columns must not silently become
// browser-visible. The legacy engine keeps its separate, server-only row type.
const historyFields = [
  "id", "proposal_code", "original_apply_run_id", "original_apply_item_id",
  "document_id", "target_module", "target_table", "target_field", "target_record_id",
  "value_type", "original_before_summary", "original_applied_summary",
  "current_value_summary", "proposed_correction_summary", "correction_mode",
  "status", "conflict_status", "conflict_reason", "correction_apply_run_id",
  "requested_by", "confirmed_by", "applied_by", "created_at", "confirmed_at",
  "applied_at", "cancelled_at", "failed_at", "updated_at", "failure_reason",
] as const satisfies readonly (keyof CorrectionProposalHistory)[];

export const correctionHistorySelect = historyFields.join(",");

export function projectCorrectionHistory(row: CorrectionProposalHistory): CorrectionProposalHistory {
  if (!row || !Number.isSafeInteger(row.id) || row.id <= 0) throw new Error("Invalid correction history");
  const result = Object.fromEntries(historyFields.map(key => [key, row[key]])) as CorrectionProposalHistory;
  for (const key of ["original_before_summary", "original_applied_summary", "current_value_summary", "proposed_correction_summary"] as const) {
    const value = result[key];
    if (value == null) continue;
    if (typeof value !== "string") throw new Error("Invalid correction summary");
    // Old history may predate masking. Never edit retained historical values.
    result[key] = ["tax_registration_number", "trn", "tax_registration"].includes(row.target_field)
      ? (value.length > 4 ? "*".repeat(Math.min(value.length - 4, 196)) + value.slice(-4) : "****")
      : value.length > 200 ? value.slice(0, 197) + "..." : value;
  }
  // Historical reasons may contain raw provider/database diagnostics.
  result.failure_reason = row.failure_reason ? "The correction could not be completed. Review the source and try again." : null;
  result.conflict_reason = row.conflict_reason ? "The record changed or is no longer available for this correction. Review it again." : null;
  return result;
}
