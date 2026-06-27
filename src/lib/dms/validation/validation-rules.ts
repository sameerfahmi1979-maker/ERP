/**
 * ERP DMS AI Phase 13 — Deterministic Validation Rule Registry
 *
 * Defines all deterministic validation rules.
 * Rules are evaluated in the validation engine with access to document data.
 *
 * Safety rules:
 *   - No raw OCR/content/chunk text in any summary or message.
 *   - Summaries truncated to max 200 chars before storing.
 *   - Rules are additive — Phase 12 behavior is not changed.
 */

import type { DmsValidationRule } from "./validation-types";

// ── Rule registry ─────────────────────────────────────────────────────────────

export const VALIDATION_RULES: Record<string, DmsValidationRule> = {
  EXPIRY_BEFORE_ISSUE_DATE: {
    ruleCode:    "EXPIRY_BEFORE_ISSUE_DATE",
    ruleLabel:   "Expiry Date Before Issue Date",
    ruleVersion: "1.0",
    findingType: "expiry_before_issue_date",
    severity:    "error",
    aiGenerated: false,
    description: "Document expiry_date is earlier than issue_date",
  },
  EXPIRY_DATE_IN_PAST: {
    ruleCode:    "EXPIRY_DATE_IN_PAST",
    ruleLabel:   "Expiry Date in Past",
    ruleVersion: "1.0",
    findingType: "expiry_in_past",
    severity:    "warning",
    aiGenerated: false,
    description: "Document expiry_date is in the past (document may be expired)",
  },
  ISSUE_DATE_IN_FUTURE: {
    ruleCode:    "ISSUE_DATE_IN_FUTURE",
    ruleLabel:   "Issue Date in Future",
    ruleVersion: "1.0",
    findingType: "issue_date_in_future",
    severity:    "warning",
    aiGenerated: false,
    description: "Document issue_date is more than 7 days in the future",
  },
  CLASSIFICATION_CONFIDENCE_LOW: {
    ruleCode:    "CLASSIFICATION_CONFIDENCE_LOW",
    ruleLabel:   "Low AI Classification Confidence",
    ruleVersion: "1.0",
    findingType: "ai_confidence_low",
    severity:    "warning",
    aiGenerated: false,
    description: "AI classification confidence score is below threshold (0.60)",
  },
  CLASSIFICATION_TYPE_MISMATCH: {
    ruleCode:    "CLASSIFICATION_TYPE_MISMATCH",
    ruleLabel:   "AI Classification Doesn't Match Document Type",
    ruleVersion: "1.0",
    findingType: "classification_mismatch",
    severity:    "warning",
    aiGenerated: false,
    description: "AI suggested document type does not match the saved document type",
  },
  OWNER_COMPANY_MISSING: {
    ruleCode:    "OWNER_COMPANY_MISSING",
    ruleLabel:   "Owner Company Not Set",
    ruleVersion: "1.0",
    findingType: "document_inconsistency",
    severity:    "info",
    aiGenerated: false,
    description: "Document has no owning_company_id assigned",
  },
  DUPLICATE_DOCUMENT_DETECTED: {
    ruleCode:    "DUPLICATE_DOCUMENT_DETECTED",
    ruleLabel:   "Duplicate Document Detected",
    ruleVersion: "1.0",
    findingType: "duplicate_document",
    severity:    "warning",
    aiGenerated: false,
    description: "Upload session is_duplicate flag is true — possible duplicate upload",
  },
  REQUIRED_FIELD_MISSING: {
    ruleCode:    "REQUIRED_FIELD_MISSING",
    ruleLabel:   "Required Metadata Field Missing",
    ruleVersion: "1.0",
    findingType: "required_field_missing",
    severity:    "error",
    aiGenerated: false,
    description: "A required metadata field has no saved value",
  },
  AI_VALUE_CONFLICTS_SAVED: {
    ruleCode:    "AI_VALUE_CONFLICTS_SAVED",
    ruleLabel:   "AI Value Conflicts with Saved Metadata",
    ruleVersion: "1.0",
    findingType: "ai_value_conflict",
    severity:    "warning",
    aiGenerated: false,
    description: "AI extracted value differs significantly from saved metadata value",
  },
};

export function getRuleByCode(ruleCode: string): DmsValidationRule | null {
  return VALIDATION_RULES[ruleCode] ?? null;
}

export function getAllRuleCodes(): string[] {
  return Object.keys(VALIDATION_RULES);
}
