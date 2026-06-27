/**
 * ERP DMS AI Phase 16 — Apply-to-ERP Types
 *
 * Pure type definitions for the Apply-to-ERP engine.
 * No Supabase, no React, no server-only code.
 *
 * Tier 1 scope (DMS-only targets):
 *   - dms_documents FK and basic fields
 *   - dms_document_metadata_values (via Phase 6/7 engine bridge)
 *
 * Tier 2 scope (Party child targets):
 *   - party_licenses (allowlisted fields only)
 *   - party_tax_registrations (allowlisted fields only)
 *
 * Safety contract:
 *   - No raw OCR/content/prompt/AI response in any type
 *   - Value summaries max 200 chars — enforced in normalizer
 *   - No HR targets
 *   - No direct parties/party_bank_details writes
 */

// ── Source types (what generated the apply proposal) ─────────────────────────

export type ApplySourceType =
  | "extraction_result"        // dms_ai_extraction_results
  | "validation_finding"       // dms_ai_validation_findings
  | "entity_match_candidate"   // dms_ai_entity_match_candidates
  | "dms_metadata_apply";      // bridge to Phase 6/7 applyAiAnalysisToMetadata

// ── Target modules ────────────────────────────────────────────────────────────

export type ApplyTargetModule =
  | "dms_document"    // Tier 1: dms_documents table (FK and basic fields)
  | "dms_metadata"    // Tier 1: dms_document_metadata_values (via Phase 6/7 engine)
  | "party";          // Tier 2: party_licenses, party_tax_registrations (child rows)
// Phase 17+: "hr"

// ── Party apply types (Tier 2) ────────────────────────────────────────────────

/** Which Party child table is the apply target. */
export type PartyApplyTargetKind = "party_licenses" | "party_tax_registrations";

/** Safe (read-only) row returned by getPartyApplyTargetRows for license rows. */
export type PartyLicenseRow = {
  id:           number;
  party_id:     number;
  license_code: string | null;
  license_number: string | null;
  license_name: string | null;
  issue_date:   string | null;   // ISO date string
  expiry_date:  string | null;   // ISO date string
  is_active:    boolean;
};

/** Safe (read-only) row returned by getPartyApplyTargetRows for tax rows. */
export type PartyTaxRow = {
  id:                      number;
  party_id:                number;
  tax_registration_code:   string | null;
  tax_registration_number_masked: string | null; // masked in UI (TRN)
  effective_from:          string | null;  // ISO date string
  effective_to:            string | null;  // ISO date string
  is_active:               boolean;
};

/** Context resolved before building a Party apply run. */
export type PartyApplyContext = {
  partyId:        number;
  partyName:      string | null;
  targetKind:     PartyApplyTargetKind;
  targetRecordId: number;
};

// ── Value types ───────────────────────────────────────────────────────────────

export type ApplyValueType =
  | "text"
  | "date"
  | "number"
  | "boolean"
  | "bigint";

// ── Apply item status ─────────────────────────────────────────────────────────

export type ApplyItemStatus =
  | "proposed"    // item created, awaiting confirmation
  | "applied"     // write succeeded
  | "skipped"     // user did not include item in confirmedItemIds
  | "conflict"    // target value changed since preview; not applied
  | "failed"      // write attempted but failed
  | "forbidden";  // target is in the forbidden list

// ── Apply run status ──────────────────────────────────────────────────────────

export type ApplyRunStatus =
  | "pending"                // run created; not yet confirmed
  | "confirmed"              // user confirmed; execution imminent
  | "in_progress"            // executing writes
  | "completed"              // all selected items applied
  | "completed_with_warnings" // some applied, some skipped/conflict
  | "failed"                 // no items applied; all blocked
  | "cancelled";             // user or admin cancelled

// ── Error codes ───────────────────────────────────────────────────────────────

export type ApplyErrorCode =
  | "not_authenticated"
  | "permission_denied"
  | "feature_flag_disabled"
  | "invalid_input"
  | "run_not_found"
  | "run_not_in_pending_state"
  | "source_not_found"
  | "source_dismissed"
  | "target_forbidden"
  | "target_not_allowlisted"
  | "target_record_not_found"
  | "target_record_inactive"
  | "target_field_conflict"
  | "no_items_applied"
  | "no_confirmed_items"
  // Phase 17 — Apply Correction error codes
  | "original_item_not_found"
  | "original_item_not_applied"
  | "original_run_not_found"
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
  | "server_error";

// ── Apply item proposal (read-only, pre-confirmation) ─────────────────────────

export type ApplyItemProposal = {
  sourceType:          ApplySourceType;
  sourceId:            number | null;
  sourceFieldCode:     string | null;
  targetTable:         string;
  targetField:         string;
  targetRecordId:      number | null;
  targetDisplayLabel:  string;
  currentValueSummary: string | null;   // max 200 chars, never raw content
  proposedValueSummary: string | null;  // max 200 chars
  valueType:           ApplyValueType;
  confidence:          number | null;
  requiresConfirmation: boolean;
  conflictRisk:        boolean;         // true if field already has a value
};

// ── Create apply run input ────────────────────────────────────────────────────

export type CreateApplyRunInput = {
  sourceType:          ApplySourceType;
  sourceId:            number | null;
  documentId:          number;
  reviewQueueItemId:   number | null;
  targetModule:        ApplyTargetModule;
  targetTable:         string;
  targetRecordId:      number | null;
  items:               ApplyItemProposal[];
  /** Tier 2 only: required when targetModule === "party" */
  partyId?:            number | null;
  /** Tier 2 only: required when targetModule === "party" */
  targetKind?:         PartyApplyTargetKind | null;
};

// ── Execute apply run confirmation ────────────────────────────────────────────

export type ApplyRunConfirmation = {
  confirmedItemIds:     number[];  // item ids from dms_ai_erp_apply_items to write
  humanReviewConfirmed: boolean;   // user checked "I have reviewed each field"
  replaceExistingConfirmed: boolean; // user confirmed overwriting existing values
};

// ── Apply item result ─────────────────────────────────────────────────────────

export type ApplyItemResult = {
  itemId:              number;
  targetTable:         string;
  targetField:         string;
  targetRecordId:      number | null;
  status:              ApplyItemStatus;
  appliedValueSummary: string | null;  // max 200 chars
  skipReason:          string | null;  // max 200 chars
  failureReason:       string | null;  // max 200 chars
};

// ── Apply run result ──────────────────────────────────────────────────────────

export type ApplyRunResult = {
  runId:           number;
  runCode:         string | null;
  status:          ApplyRunStatus;
  appliedCount:    number;
  skippedCount:    number;
  conflictCount:   number;
  failedCount:     number;
  items:           ApplyItemResult[];
  errorMessage:    string | null;
};

// ── Apply run DB row ──────────────────────────────────────────────────────────

export type DmsErpApplyRun = {
  id:                   number;
  runCode:              string | null;
  sourceType:           ApplySourceType;
  sourceId:             number | null;
  documentId:           number | null;
  reviewQueueItemId:    number | null;
  status:               ApplyRunStatus;
  targetModule:         ApplyTargetModule;
  targetTable:          string;
  targetRecordId:       number | null;
  requestedBy:          number;
  requestedByName:      string | null;
  confirmedBy:          number | null;
  confirmedByName:      string | null;
  startedAt:            string | null;
  completedAt:          string | null;
  failedAt:             string | null;
  cancelledAt:          string | null;
  errorMessage:         string | null;
  createdAt:            string;
  updatedAt:            string;
  items:                DmsErpApplyItem[];
};

// ── Apply item DB row ─────────────────────────────────────────────────────────

export type DmsErpApplyItem = {
  id:                   number;
  applyRunId:           number;
  sourceType:           ApplySourceType;
  sourceId:             number | null;
  sourceFieldCode:      string | null;
  targetTable:          string;
  targetField:          string;
  targetRecordId:       number | null;
  targetDisplayLabel:   string | null;
  currentValueSummary:  string | null;
  proposedValueSummary: string | null;
  appliedValueSummary:  string | null;
  valueType:            ApplyValueType | null;
  confidence:           number | null;
  status:               ApplyItemStatus;
  skipReason:           string | null;
  failureReason:        string | null;
  requiresConfirmation: boolean;
  confirmed:            boolean;
  appliedAt:            string | null;
  appliedBy:            number | null;
  createdAt:            string;
  updatedAt:            string;
};

// ── Conflict detection result ─────────────────────────────────────────────────

export type ConflictDetectionResult =
  | { conflict: false }
  | { conflict: true; reason: string };

// ── ActionResult wrapper (same pattern used throughout DMS AI) ────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  errorCode?: ApplyErrorCode;
};
