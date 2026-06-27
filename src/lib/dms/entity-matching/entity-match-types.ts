/**
 * ERP DMS AI Phase 13 — Entity Matching Types
 *
 * Pure type definitions for entity match candidates and run results.
 * No Supabase, no React, no server-only code.
 *
 * IMPORTANT: Accepting a candidate does NOT write to dms_documents owner fields.
 * Apply-to-ERP is Phase 16. This phase is human-review-only.
 */

// ── Target entity type ────────────────────────────────────────────────────────

export type DmsEntityMatchTargetType =
  | "owner_company"
  | "branch"
  | "party"
  | "employee"
  | "work_site";

// ── Match status ──────────────────────────────────────────────────────────────

export type DmsEntityMatchStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "superseded";

// ── Match method ──────────────────────────────────────────────────────────────

export type DmsEntityMatchMethod =
  | "exact_code"
  | "exact_identifier"
  | "name_normalized"
  | "fuzzy"
  | "ai_candidate";

// ── Candidate input ───────────────────────────────────────────────────────────

export interface DmsEntityMatchCandidateInput {
  candidateKey:        string;           // idempotency key
  documentId?:         number | null;
  uploadSessionId?:    number | null;
  aiResultId?:         number | null;
  sourceTextSummary?:  string | null;    // max 200 chars, NEVER raw OCR
  matchSignal?:        string | null;    // what matched (code, name, identifier)
  targetEntityType:    DmsEntityMatchTargetType;
  targetEntityId:      number;
  targetDisplayName?:  string | null;
  matchScore:          number;
  matchMethod:         DmsEntityMatchMethod;
  matchReason?:        string | null;    // max 200 chars
  aiGenerated:         boolean;
  createdBy?:          number | null;
}

// ── Run result ────────────────────────────────────────────────────────────────

export interface DmsEntityMatchRunResult {
  documentId?:        number | null;
  uploadSessionId?:   number | null;
  candidatesCreated:  number;
  candidatesSkipped:  number;
  candidateIds:       number[];
  queueItemIds:       number[];
  errors:             string[];
  targetsMatched:     DmsEntityMatchTargetType[];
}

// ── Match options ─────────────────────────────────────────────────────────────

export interface DmsEntityMatchOptions {
  targetTypes?:      DmsEntityMatchTargetType[];  // default: all except work_site
  minScore?:         number;                       // default 0.60
  createQueueItems?: boolean;                      // default true
  dryRun?:           boolean;
}

// ── Score thresholds ──────────────────────────────────────────────────────────

export const MATCH_SCORE_THRESHOLDS = {
  EXACT_CODE:       1.00,
  EXACT_IDENTIFIER: 0.95,
  NAME_NORMALIZED:  0.90,
  FUZZY:            0.75,
  AI_CANDIDATE:     0.60,
  DISCARD_BELOW:    0.60,
} as const;
