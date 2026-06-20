/**
 * ERP COMMON AI.5 — AI Risk Scoring
 */

export * from "./types";
export * from "./scoring-engine";
export * from "./signal-collectors";
export * from "./document-bridge";
export * from "./stale-detector";
export * from "./score-builder";

import type { RiskCalculationInput, RiskEntityType, RiskScoreResult } from "./types";
import { collectAllSignals } from "./signal-collectors";
import { calculateRiskScoreFromSignals } from "./scoring-engine";
import { buildDocumentEntityRiskResult } from "./document-bridge";

export function calculateEntityRisk(input: RiskCalculationInput): RiskScoreResult {
  if (input.entityType === "dms_document") {
    const extraSignals = collectAllSignals({
      ...input,
      linkedDocuments: [],
      complianceSummary: {
        missingRequiredDocuments: 0,
        expiredDocuments: 0,
        expiringSoonDocuments: 0,
        highRiskDocuments: 0,
        criticalRiskDocuments: 0,
        openComplianceFindings: 0,
      },
      manualNonCompliant: false,
    });

    return buildDocumentEntityRiskResult({
      documentId: input.entityId,
      aiRiskScore: input.dmsDocumentRisk?.aiRiskScore ?? null,
      aiRiskLevel: input.dmsDocumentRisk?.aiRiskLevel ?? null,
      aiRiskReasonsJson: input.dmsDocumentRisk?.aiRiskReasonsJson ?? null,
      extraSignals,
    });
  }

  const signals = collectAllSignals(input);
  return calculateRiskScoreFromSignals(signals);
}

export const RISK_ENTITY_TYPES: RiskEntityType[] = [
  "company",
  "party",
  "branch",
  "site",
  "dms_document",
];

export function mapEntityTypeForDb(entityType: string): RiskEntityType | null {
  if (RISK_ENTITY_TYPES.includes(entityType as RiskEntityType)) {
    return entityType as RiskEntityType;
  }
  return null;
}
