/**
 * ERP DMS AI Phase 13 — Validation Engine Types
 *
 * Pure type definitions for validation findings, rules, and run results.
 * No Supabase, no React, no server-only code.
 *
 * Safety contract:
 *   - DmsValidationFindingInput.currentValueSummary max 200 chars — enforced in engine.
 *   - DmsValidationFindingInput.aiValueSummary max 200 chars — enforced in engine.
 *   - DmsValidationFindingInput.reasonMessage max 500 chars — enforced in upsert.
 *   - No raw OCR/content/chunk text in any field.
 */

// ── Severity ──────────────────────────────────────────────────────────────────

export type DmsValidationSeverity = "error" | "warning" | "info";

// ── Finding type ──────────────────────────────────────────────────────────────

export type DmsValidationFindingType =
  | "required_field_missing"
  | "expiry_before_issue_date"
  | "expiry_in_past"
  | "issue_date_in_future"
  | "format_violation"
  | "ai_confidence_low"
  | "ai_value_conflict"
  | "classification_mismatch"
  | "duplicate_document"
  | "document_inconsistency"
  | "ai_assisted_conflict";

// ── Status ────────────────────────────────────────────────────────────────────

export type DmsValidationFindingStatus =
  | "open"
  | "reviewed"
  | "false_positive"
  | "superseded"
  | "dismissed";

// ── Finding input (passed to upsertDmsValidationFinding) ─────────────────────

export interface DmsValidationFindingInput {
  findingKey:              string;           // idempotency key
  documentId?:             number | null;
  uploadSessionId?:        number | null;
  aiResultId?:             number | null;
  metadataDefinitionId?:   number | null;
  fieldCode?:              string | null;
  findingType:             DmsValidationFindingType;
  severity:                DmsValidationSeverity;
  sourceModule:            string;
  ruleCode:                string;
  ruleLabel:               string;
  ruleVersion?:            string;
  aiGenerated:             boolean;
  confidence?:             number | null;
  currentValueSummary?:    string | null;    // max 200 chars, never raw OCR
  aiValueSummary?:         string | null;    // max 200 chars
  expectedValueSummary?:   string | null;    // max 200 chars
  reasonMessage?:          string | null;    // max 500 chars
  evidenceJson?:           Record<string, unknown> | null; // safe IDs/codes only
  createdBy?:              number | null;
}

// ── Rule definition ───────────────────────────────────────────────────────────

export interface DmsValidationRule {
  ruleCode:     string;
  ruleLabel:    string;
  ruleVersion:  string;
  findingType:  DmsValidationFindingType;
  severity:     DmsValidationSeverity;
  aiGenerated:  boolean;
  description?: string;
}

// ── Run result ────────────────────────────────────────────────────────────────

export interface DmsValidationRunResult {
  documentId?:      number | null;
  uploadSessionId?: number | null;
  findingsCreated:  number;
  findingsSkipped:  number;     // duplicate active findings skipped
  findingIds:       number[];   // IDs of newly created findings
  queueItemIds:     number[];   // IDs of newly created review queue items
  errors:           string[];   // non-fatal error messages
  rulesFired:       string[];   // rule codes that produced findings
}

// ── Validation options ────────────────────────────────────────────────────────

export interface DmsValidationOptions {
  maxFindings?:          number;  // default 10
  includeAiAssisted?:    boolean; // requires DMS_AI_VALIDATION_ASSISTED flag
  createQueueItems?:     boolean; // default true — create review queue items
  dryRun?:               boolean; // run rules but don't persist findings
}
