/**
 * ERP COMMON AI.5 — Document Risk Bridge
 * For dms_document entity: base score from DMS.12.3 stored values.
 */

import type { RiskLevel, RiskScoreResult, RiskSignal } from "./types";
import { calculateRiskScoreFromSignals, riskLevelFromScore } from "./scoring-engine";

export type DmsDocumentRiskInput = {
  documentId: number;
  aiRiskScore: number | null;
  aiRiskLevel: string | null;
  aiRiskReasonsJson: unknown;
  extraSignals: RiskSignal[];
};

function levelFromDms(level: string | null, score: number): RiskLevel {
  if (level === "critical" || level === "high" || level === "medium" || level === "low" || level === "none") {
    return level;
  }
  return riskLevelFromScore(score);
}

function sanitizeDmsReasons(json: unknown): Array<{ code: string; message: string; points: number }> {
  if (!json || !Array.isArray(json)) return [];

  return json.slice(0, 12).map((item, idx) => {
    if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      const message =
        typeof obj.message === "string"
          ? obj.message.slice(0, 200)
          : typeof obj.label === "string"
            ? obj.label.slice(0, 200)
            : `Risk factor ${idx + 1}`;
      const code = typeof obj.code === "string" ? obj.code : "dms_risk";
      const score = typeof obj.score === "number" ? Math.round(obj.score * 100) : 0;
      return { code, message, points: score };
    }
    return { code: "dms_risk", message: String(item).slice(0, 200), points: 0 };
  });
}

export function buildDocumentEntityRiskResult(input: DmsDocumentRiskInput): RiskScoreResult {
  const baseScore =
    input.aiRiskScore != null ? Math.round(Number(input.aiRiskScore) * 10000) / 100 : 0;
  const baseLevel = levelFromDms(input.aiRiskLevel, baseScore);

  const extraResult =
    input.extraSignals.length > 0 ? calculateRiskScoreFromSignals(input.extraSignals) : null;

  const mergedScore = Math.min(100, baseScore + (extraResult?.riskScore ?? 0));
  const mergedLevel = riskLevelFromScore(mergedScore);

  const dmsReasons = sanitizeDmsReasons(input.aiRiskReasonsJson);
  const extraReasons = extraResult?.reasons ?? [];
  const reasons = [...dmsReasons, ...extraReasons].slice(0, 12);

  const breakdown = [
    {
      signalCode: "document_critical_risk" as const,
      count: 1,
      unitWeight: baseScore,
      points: baseScore,
      cap: 100,
      label: `DMS document risk (base ${baseLevel})`,
    },
    ...(extraResult?.breakdown ?? []),
  ].filter((b) => b.points > 0);

  return {
    riskScore: mergedScore,
    riskLevel: mergedLevel,
    riskConfidence: 1,
    calculationMethod: "deterministic",
    reasons:
      reasons.length > 0
        ? reasons
        : [{ code: "dms_base", message: `DMS base risk level: ${baseLevel}`, points: baseScore }],
    breakdown,
    sourceCounts: {
      dmsBaseScore: baseScore,
      ...(extraResult?.sourceCounts ?? {}),
    },
  };
}
