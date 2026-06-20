/**
 * ERP COMMON AI.5 — Deterministic Risk Scoring Engine (pure functions)
 */

import type {
  RiskBreakdownItem,
  RiskLevel,
  RiskSignal,
  RiskSignalCode,
  RiskScoreResult,
} from "./types";

export const SIGNAL_WEIGHTS: Record<
  RiskSignalCode,
  { weight: number; cap: number; label: string }
> = {
  document_expired: { weight: 25, cap: 50, label: "Expired linked document(s)" },
  document_expiring_soon: { weight: 10, cap: 20, label: "Document(s) expiring soon" },
  document_critical_risk: { weight: 20, cap: 40, label: "Critical document risk" },
  document_high_risk: { weight: 12, cap: 24, label: "High document risk" },
  document_incomplete: { weight: 8, cap: 16, label: "Incomplete document metadata" },
  missing_required_document: { weight: 15, cap: 45, label: "Missing required document(s)" },
  open_compliance_critical: { weight: 20, cap: 40, label: "Critical compliance finding(s)" },
  open_compliance_high: { weight: 12, cap: 24, label: "High compliance finding(s)" },
  open_duplicate_conflict: { weight: 15, cap: 30, label: "Open duplicate/conflict candidate(s)" },
  open_field_conflict: { weight: 10, cap: 20, label: "Open field conflict suggestion(s)" },
  missing_ocr: { weight: 5, cap: 10, label: "Missing OCR text" },
  missing_ai_summary: { weight: 4, cap: 8, label: "Missing AI summary" },
  missing_embedding: { weight: 2, cap: 4, label: "Missing semantic embedding" },
  unlinked_document: { weight: 8, cap: 8, label: "Unlinked document reference" },
  wrong_document_link: { weight: 10, cap: 20, label: "Wrong document link" },
  license_expiry_mismatch: { weight: 18, cap: 18, label: "License expiry mismatch" },
  trn_mismatch: { weight: 15, cap: 15, label: "TRN mismatch" },
  confidential_admin_review_required: {
    weight: 8,
    cap: 16,
    label: "Confidential document requires admin review",
  },
  manual_non_compliant_status: { weight: 10, cap: 10, label: "Manual non-compliant status" },
  understanding_health_low: { weight: 10, cap: 10, label: "Low document understanding health" },
};

export function riskLevelFromScore(score: number): RiskLevel {
  if (score <= 0) return "none";
  if (score <= 24) return "low";
  if (score <= 49) return "medium";
  if (score <= 74) return "high";
  return "critical";
}

export function applySignalCaps(signals: RiskSignal[]): RiskBreakdownItem[] {
  const byCode = new Map<RiskSignalCode, number>();

  for (const signal of signals) {
    byCode.set(signal.code, (byCode.get(signal.code) ?? 0) + signal.count);
  }

  const breakdown: RiskBreakdownItem[] = [];

  for (const [code, count] of byCode.entries()) {
    const config = SIGNAL_WEIGHTS[code];
    if (!config || count <= 0) continue;

    const rawPoints = count * config.weight;
    const points = Math.min(rawPoints, config.cap);

    breakdown.push({
      signalCode: code,
      count,
      unitWeight: config.weight,
      points,
      cap: config.cap,
      label: config.label,
    });
  }

  return breakdown.sort((a, b) => b.points - a.points);
}

export function calculateRiskScoreFromBreakdown(breakdown: RiskBreakdownItem[]): RiskScoreResult {
  const totalScore = Math.min(
    100,
    breakdown.reduce((sum, item) => sum + item.points, 0)
  );
  const riskLevel = riskLevelFromScore(totalScore);

  const reasons = breakdown
    .filter((b) => b.points > 0)
    .slice(0, 12)
    .map((b) => ({
      code: b.signalCode,
      message: `${b.label}${b.count > 1 ? ` (${b.count})` : ""}`,
      points: b.points,
    }));

  const sourceCounts: Record<string, number> = {};
  for (const item of breakdown) {
    sourceCounts[item.signalCode] = item.count;
  }

  return {
    riskScore: Math.round(totalScore * 100) / 100,
    riskLevel,
    riskConfidence: 1,
    calculationMethod: "deterministic",
    reasons,
    breakdown,
    sourceCounts,
  };
}

export function calculateRiskScoreFromSignals(signals: RiskSignal[]): RiskScoreResult {
  const breakdown = applySignalCaps(signals);
  return calculateRiskScoreFromBreakdown(breakdown);
}

export function deduplicateSignals(
  findingSignals: RiskSignal[],
  rawSignals: RiskSignal[]
): RiskSignal[] {
  const coveredCodes = new Set(findingSignals.map((s) => s.code));
  const filteredRaw = rawSignals.filter((s) => !coveredCodes.has(s.code));
  return [...findingSignals, ...filteredRaw];
}
