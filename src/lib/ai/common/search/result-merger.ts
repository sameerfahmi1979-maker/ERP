/**
 * ERP COMMON AI.6 — Result Merger
 *
 * Merges, deduplicates, ranks, and caps search results from multiple sources.
 */

import type { ErpSearchResult, ErpSearchResultGroup } from "./types";

const RISK_ORDER: Record<string, number> = {
  critical: 5,
  high: 4,
  medium: 3,
  low: 2,
  none: 1,
};

// ── Deduplication ─────────────────────────────────────────────────────────────

export function dedupeResults(results: ErpSearchResult[]): ErpSearchResult[] {
  const seen = new Map<string, ErpSearchResult>();
  for (const r of results) {
    const existing = seen.get(r.key);
    if (!existing || r.relevanceScore > existing.relevanceScore) {
      seen.set(r.key, r);
    }
  }
  return Array.from(seen.values());
}

// ── Scoring / ranking ─────────────────────────────────────────────────────────

function computeFinalScore(result: ErpSearchResult): number {
  let score = result.relevanceScore;

  if (result.semanticSimilarity != null) {
    score += result.semanticSimilarity * 20;
  }

  const riskLevel = result.badges?.riskLevel;
  if (riskLevel) {
    score += (RISK_ORDER[riskLevel] ?? 0) * 2;
  }

  const openCompliance = result.badges?.openComplianceCount ?? 0;
  if (openCompliance > 0) score += Math.min(openCompliance * 1, 5);

  return score;
}

// ── Sort ──────────────────────────────────────────────────────────────────────

export function sortResults(results: ErpSearchResult[]): ErpSearchResult[] {
  return [...results].sort((a, b) => computeFinalScore(b) - computeFinalScore(a));
}

// ── Merge ─────────────────────────────────────────────────────────────────────

export function mergeAndRankResults(
  resultSets: ErpSearchResult[][],
  maxTotal = 100
): ErpSearchResult[] {
  const flat = resultSets.flat();
  const deduped = dedupeResults(flat);
  const sorted = sortResults(deduped);
  return sorted.slice(0, maxTotal);
}

// ── Group summary ─────────────────────────────────────────────────────────────

const GROUP_LABELS: Record<string, string> = {
  organization: "Organizations",
  branch: "Branches",
  party: "Parties",
  site: "Work Sites",
  dms_document: "Documents",
  duplicate_candidate: "Duplicate Candidates",
  compliance_finding: "Compliance Findings",
  risk_score: "Risk Scores",
  field_suggestion: "Field Suggestions",
};

export function groupResults(results: ErpSearchResult[]): ErpSearchResultGroup[] {
  const map = new Map<string, number>();
  for (const r of results) {
    map.set(r.resultType, (map.get(r.resultType) ?? 0) + 1);
  }
  return Array.from(map.entries()).map(([resultType, count]) => ({
    resultType: resultType as ErpSearchResult["resultType"],
    label: GROUP_LABELS[resultType] ?? resultType,
    count,
  }));
}
