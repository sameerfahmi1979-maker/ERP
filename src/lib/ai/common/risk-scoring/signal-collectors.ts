/**
 * ERP COMMON AI.5 — Signal Collectors
 * Transforms fetched DB data into RiskSignal arrays. No DB access.
 */

import type {
  ComplianceFindingSignalInput,
  LinkedDocumentSignalInput,
  RiskCalculationInput,
  RiskSignal,
  RiskSignalCode,
} from "./types";

const CONFIDENTIAL_LEVELS = new Set(["hr", "legal", "executive"]);

const FINDING_TYPE_TO_SIGNAL: Record<string, RiskSignalCode> = {
  missing_required_document: "missing_required_document",
  expired_document: "document_expired",
  expiring_soon_document: "document_expiring_soon",
  document_high_risk: "document_high_risk",
  document_critical_risk: "document_critical_risk",
  document_incomplete: "document_incomplete",
  missing_ocr: "missing_ocr",
  missing_ai_summary: "missing_ai_summary",
  missing_embedding: "missing_embedding",
  unlinked_document: "unlinked_document",
  wrong_document_type: "wrong_document_link",
  duplicate_conflict_open: "open_duplicate_conflict",
  field_suggestion_conflict_open: "open_field_conflict",
  license_expiry_mismatch: "license_expiry_mismatch",
  trn_mismatch: "trn_mismatch",
  confidential_document_requires_admin_review: "confidential_admin_review_required",
};

function docLabel(doc: LinkedDocumentSignalInput, isAdmin: boolean): string {
  if (
    doc.confidentialityLevel &&
    CONFIDENTIAL_LEVELS.has(doc.confidentialityLevel) &&
    !isAdmin
  ) {
    return "Confidential document";
  }
  return doc.documentNo ?? `Document #${doc.documentId}`;
}

function isExpired(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  return expiry.getTime() < today.getTime();
}

function isExpiringSoon(expiryDate: string | null): boolean {
  if (!expiryDate) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);
  const diffDays = Math.ceil((expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays <= 30;
}

export function collectSignalsFromComplianceFindings(
  findings: ComplianceFindingSignalInput[]
): RiskSignal[] {
  const signals: RiskSignal[] = [];

  for (const finding of findings) {
    const mapped = FINDING_TYPE_TO_SIGNAL[finding.findingType];
    if (mapped) {
      signals.push({
        code: mapped,
        count: 1,
        label: finding.findingType.replace(/_/g, " "),
      });
      continue;
    }

    if (finding.severity === "critical") {
      signals.push({
        code: "open_compliance_critical",
        count: 1,
        label: "Critical compliance finding",
      });
    } else if (finding.severity === "high") {
      signals.push({
        code: "open_compliance_high",
        count: 1,
        label: "High compliance finding",
      });
    }
  }

  return signals;
}

export function collectSignalsFromLinkedDocuments(
  docs: LinkedDocumentSignalInput[],
  isAdmin: boolean,
  skipBuckets: Set<RiskSignalCode>
): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const add = (code: RiskSignalCode, label: string, evidence?: Record<string, unknown>) => {
    if (skipBuckets.has(code)) return;
    signals.push({ code, count: 1, label, evidence });
  };

  for (const doc of docs) {
    const label = docLabel(doc, isAdmin);

    if (!skipBuckets.has("document_expired") && isExpired(doc.expiryDate)) {
      add("document_expired", `Expired: ${label}`, { documentId: doc.documentId });
    } else if (!skipBuckets.has("document_expiring_soon") && isExpiringSoon(doc.expiryDate)) {
      add("document_expiring_soon", `Expiring soon: ${label}`, { documentId: doc.documentId });
    }

    if (!skipBuckets.has("document_critical_risk") && doc.aiRiskLevel === "critical") {
      add("document_critical_risk", `Critical risk: ${label}`, { documentId: doc.documentId });
    } else if (!skipBuckets.has("document_high_risk") && doc.aiRiskLevel === "high") {
      add("document_high_risk", `High risk: ${label}`, { documentId: doc.documentId });
    }

    if (
      !skipBuckets.has("document_incomplete") &&
      doc.completenessScore != null &&
      doc.completenessScore < 0.6
    ) {
      add("document_incomplete", `Incomplete: ${label}`, { documentId: doc.documentId });
    }

    if (!skipBuckets.has("missing_ocr") && doc.ocrTextAvailable === false) {
      add("missing_ocr", `Missing OCR: ${label}`, { documentId: doc.documentId });
    }

    const summaryComplete =
      doc.aiSummaryStatus === "complete" || doc.aiSummaryStatus === "done";
    if (!skipBuckets.has("missing_ai_summary") && !summaryComplete) {
      add("missing_ai_summary", `Missing summary: ${label}`, { documentId: doc.documentId });
    }

    const embeddingReady =
      doc.summaryEmbeddingStatus === "complete" || doc.summaryEmbeddingStatus === "ready";
    if (!skipBuckets.has("missing_embedding") && !embeddingReady) {
      add("missing_embedding", `Missing embedding: ${label}`, { documentId: doc.documentId });
    }

    if (
      !skipBuckets.has("confidential_admin_review_required") &&
      doc.confidentialityLevel &&
      CONFIDENTIAL_LEVELS.has(doc.confidentialityLevel) &&
      !isAdmin
    ) {
      add("confidential_admin_review_required", "Confidential document requires admin review", {
        documentId: doc.documentId,
      });
    }
  }

  return signals;
}

export function collectSignalsFromComplianceSummary(
  summary: RiskCalculationInput["complianceSummary"],
  skipBuckets: Set<RiskSignalCode>
): RiskSignal[] {
  const signals: RiskSignal[] = [];
  const addCount = (code: RiskSignalCode, count: number, label: string) => {
    if (count <= 0 || skipBuckets.has(code)) return;
    signals.push({ code, count, label });
  };

  addCount("missing_required_document", summary.missingRequiredDocuments, "Missing required documents");
  addCount("document_expired", summary.expiredDocuments, "Expired documents");
  addCount("document_expiring_soon", summary.expiringSoonDocuments, "Expiring soon documents");
  addCount("document_critical_risk", summary.criticalRiskDocuments, "Critical risk documents");
  addCount("document_high_risk", summary.highRiskDocuments, "High risk documents");

  return signals;
}

export function collectAllSignals(input: RiskCalculationInput): RiskSignal[] {
  const findingSignals = collectSignalsFromComplianceFindings(input.complianceFindings);
  const coveredBuckets = new Set(findingSignals.map((s) => s.code));

  const docSignals = collectSignalsFromLinkedDocuments(
    input.linkedDocuments,
    input.isAdminViewer,
    coveredBuckets
  );

  const summarySignals = collectSignalsFromComplianceSummary(
    input.complianceSummary,
    coveredBuckets
  );

  let signals = [...findingSignals, ...docSignals, ...summarySignals];

  if (!coveredBuckets.has("open_duplicate_conflict") && input.pendingDuplicateCount > 0) {
    signals.push({
      code: "open_duplicate_conflict",
      count: input.pendingDuplicateCount,
      label: "Open duplicate/conflict candidates",
    });
  }

  if (!coveredBuckets.has("open_field_conflict") && input.pendingFieldConflictCount > 0) {
    signals.push({
      code: "open_field_conflict",
      count: input.pendingFieldConflictCount,
      label: "Open field conflict suggestions",
    });
  }

  if (input.manualNonCompliant) {
    signals.push({
      code: "manual_non_compliant_status",
      count: 1,
      label: "Manual non-compliant status",
    });
  }

  if (
    input.understandingHealthScore != null &&
    input.understandingHealthScore < 50 &&
    input.entityType === "dms_document"
  ) {
    signals.push({
      code: "understanding_health_low",
      count: 1,
      label: "Low document understanding health",
    });
  }

  return signals;
}
