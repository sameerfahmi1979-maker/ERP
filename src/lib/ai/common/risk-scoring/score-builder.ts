/**
 * ERP COMMON AI.5 — Score Builder (safe DTOs)
 */

import type { RiskScoreResult } from "./types";

const MAX_BREAKDOWN = 50;
const MAX_REASONS = 12;

export function buildStoredRiskJson(result: RiskScoreResult): {
  riskReasonsJson: unknown;
  riskBreakdownJson: unknown;
  sourceCountsJson: unknown;
} {
  return {
    riskReasonsJson: result.reasons.slice(0, MAX_REASONS),
    riskBreakdownJson: result.breakdown.slice(0, MAX_BREAKDOWN),
    sourceCountsJson: result.sourceCounts,
  };
}

export function parseRiskReasonsJson(json: unknown): Array<{ code: string; message: string; points: number }> {
  if (!json || !Array.isArray(json)) return [];
  return json.slice(0, MAX_REASONS).map((item) => {
    if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      return {
        code: typeof obj.code === "string" ? obj.code : "unknown",
        message: typeof obj.message === "string" ? obj.message.slice(0, 300) : "Risk factor",
        points: typeof obj.points === "number" ? obj.points : 0,
      };
    }
    return { code: "unknown", message: String(item).slice(0, 300), points: 0 };
  });
}

export function parseRiskBreakdownJson(json: unknown): RiskScoreResult["breakdown"] {
  if (!json || !Array.isArray(json)) return [];
  return json.slice(0, MAX_BREAKDOWN).map((item) => {
    const obj = item as Record<string, unknown>;
    return {
      signalCode: obj.signalCode as RiskScoreResult["breakdown"][0]["signalCode"],
      count: Number(obj.count) || 0,
      unitWeight: Number(obj.unitWeight) || 0,
      points: Number(obj.points) || 0,
      cap: Number(obj.cap) || 0,
      label: typeof obj.label === "string" ? obj.label : "Signal",
    };
  });
}

export function parseSourceCountsJson(json: unknown): Record<string, number> {
  if (!json || typeof json !== "object") return {};
  const result: Record<string, number> = {};
  for (const [key, val] of Object.entries(json as Record<string, unknown>)) {
    if (typeof val === "number") result[key] = val;
  }
  return result;
}
