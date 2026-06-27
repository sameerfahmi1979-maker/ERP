/**
 * ERP DMS AI Phase 13 — Match Signal Utilities
 *
 * Pure utility functions for name normalization, scoring, and safe summary generation.
 * No Supabase, no React.
 *
 * Safety rules:
 *   - truncateSafeSummary always limits to 200 chars.
 *   - These functions never store or return raw OCR/content text.
 */

import type { DmsEntityMatchMethod } from "./entity-match-types";
import { MATCH_SCORE_THRESHOLDS } from "./entity-match-types";

// ── Text normalization ────────────────────────────────────────────────────────

/** Normalizes English name: lowercase, collapse whitespace, remove punctuation. */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Normalizes Arabic name: remove tashkeel (diacritics), normalize alef forms. */
export function normalizeArabicName(name: string): string {
  return name
    .replace(/[\u064B-\u065F\u0670]/g, "")  // remove tashkeel
    .replace(/[\u0622\u0623\u0625]/g, "\u0627") // normalize alef forms → plain alef
    .replace(/\u0629/g, "\u0647")             // ta marbuta → ha
    .replace(/\s+/g, " ")
    .trim();
}

/** Truncate a string to safe max length. Never stores raw OCR. */
export function truncateSafeSummary(text: string | null | undefined, max = 200): string | null {
  if (text == null || text.length === 0) return null;
  return text.slice(0, max);
}

// ── Score functions ───────────────────────────────────────────────────────────

/** Score 1.00 if code matches exactly (case-insensitive). */
export function scoreExactCode(
  candidate: string | null | undefined,
  target: string | null | undefined
): { score: number; method: DmsEntityMatchMethod } | null {
  if (!candidate || !target) return null;
  if (candidate.trim().toLowerCase() === target.trim().toLowerCase()) {
    return { score: MATCH_SCORE_THRESHOLDS.EXACT_CODE, method: "exact_code" };
  }
  return null;
}

/** Score 0.95 if identifier (TRN, license no, etc.) matches exactly. */
export function scoreExactIdentifier(
  candidate: string | null | undefined,
  target: string | null | undefined
): { score: number; method: DmsEntityMatchMethod } | null {
  if (!candidate || !target) return null;
  const a = candidate.replace(/\s+/g, "").toLowerCase();
  const b = target.replace(/\s+/g, "").toLowerCase();
  if (a.length > 3 && a === b) {
    return { score: MATCH_SCORE_THRESHOLDS.EXACT_IDENTIFIER, method: "exact_identifier" };
  }
  return null;
}

/** Score 0.90 if normalized names match. */
export function scoreNormalizedName(
  candidate: string | null | undefined,
  target: string | null | undefined
): { score: number; method: DmsEntityMatchMethod } | null {
  if (!candidate || !target) return null;
  const a = normalizeName(candidate);
  const b = normalizeName(target);
  if (a.length > 2 && a === b) {
    return { score: MATCH_SCORE_THRESHOLDS.NAME_NORMALIZED, method: "name_normalized" };
  }
  return null;
}

/** Fuzzy score 0.75 for prefix match or substring containment. */
export function scoreFuzzyName(
  candidate: string | null | undefined,
  target: string | null | undefined
): { score: number; method: DmsEntityMatchMethod } | null {
  if (!candidate || !target) return null;
  const a = normalizeName(candidate);
  const b = normalizeName(target);
  if (a.length < 4 || b.length < 4) return null;
  if (a.startsWith(b) || b.startsWith(a) || a.includes(b) || b.includes(a)) {
    return { score: MATCH_SCORE_THRESHOLDS.FUZZY, method: "fuzzy" };
  }
  return null;
}

/** Best score from all signal attempts. */
export function bestScore(
  candidate: string | null | undefined,
  target: string | null | undefined,
  signalLabel?: string
): { score: number; method: DmsEntityMatchMethod; signal: string } | null {
  const scores = [
    scoreExactCode(candidate, target),
    scoreExactIdentifier(candidate, target),
    scoreNormalizedName(candidate, target),
    scoreFuzzyName(candidate, target),
  ].filter((s): s is NonNullable<typeof s> => s !== null);

  if (scores.length === 0) return null;
  const best = scores.reduce((prev, cur) => cur.score > prev.score ? cur : prev);
  return { ...best, signal: truncateSafeSummary(signalLabel ?? candidate, 200) ?? "" };
}
