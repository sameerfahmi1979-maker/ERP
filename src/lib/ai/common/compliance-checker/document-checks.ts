/**
 * ERP COMMON AI.4 — Linked Document Health Checks
 */

import type { ComplianceRuleResult, LinkedDocumentForCompliance } from "./types";
import { COMPLIANCE_INCOMPLETE_THRESHOLD } from "./types";

const CONFIDENTIAL_LEVELS = new Set(["hr", "legal", "executive"]);
const OPEN_RENEWAL_STATUSES = new Set([
  "draft",
  "requested",
  "in_progress",
  "waiting_for_document",
]);

export function evaluateLinkedDocumentHealth(input: {
  entityType: string;
  entityId: number;
  documents: LinkedDocumentForCompliance[];
  openRenewalDocumentIds: Set<number>;
  isAdminViewer: boolean;
}): ComplianceRuleResult[] {
  const results: ComplianceRuleResult[] = [];
  const now = new Date();
  const soonThreshold = new Date(now);
  soonThreshold.setDate(soonThreshold.getDate() + 30);

  for (const doc of input.documents) {
    if (doc.aiRiskLevel === "critical") {
      results.push({
        findingType: "document_critical_risk",
        severity: "critical",
        detectionMethod: "deterministic",
        entityType: input.entityType,
        entityId: input.entityId,
        documentId: doc.id,
        confidenceScore: 0.95,
        evidenceJson: { documentNo: doc.documentNo, aiRiskLevel: doc.aiRiskLevel },
        recommendedAction: "Immediate review in DMS Intelligence tab",
      });
    } else if (doc.aiRiskLevel === "high") {
      results.push({
        findingType: "document_high_risk",
        severity: "high",
        detectionMethod: "deterministic",
        entityType: input.entityType,
        entityId: input.entityId,
        documentId: doc.id,
        confidenceScore: 0.95,
        evidenceJson: { documentNo: doc.documentNo, aiRiskLevel: doc.aiRiskLevel },
        recommendedAction: "Review in DMS Intelligence tab",
      });
    }

    if (
      doc.completenessScore != null &&
      doc.completenessScore < COMPLIANCE_INCOMPLETE_THRESHOLD
    ) {
      results.push({
        findingType: "document_incomplete",
        severity: "medium",
        detectionMethod: "deterministic",
        entityType: input.entityType,
        entityId: input.entityId,
        documentId: doc.id,
        actualValue: String(doc.completenessScore),
        confidenceScore: 0.9,
        evidenceJson: {
          documentNo: doc.documentNo,
          completenessScore: doc.completenessScore,
        },
        recommendedAction: "Fill missing document metadata",
      });
    }

    if (!doc.ocrTextAvailable) {
      results.push({
        findingType: "missing_ocr",
        severity: "medium",
        detectionMethod: "deterministic",
        entityType: input.entityType,
        entityId: input.entityId,
        documentId: doc.id,
        confidenceScore: 0.9,
        evidenceJson: { documentNo: doc.documentNo },
        recommendedAction: "Run OCR on document files",
      });
    }

    if (doc.aiSummaryStatus !== "complete") {
      results.push({
        findingType: "missing_ai_summary",
        severity: "low",
        detectionMethod: "deterministic",
        entityType: input.entityType,
        entityId: input.entityId,
        documentId: doc.id,
        confidenceScore: 0.85,
        evidenceJson: {
          documentNo: doc.documentNo,
          aiSummaryStatus: doc.aiSummaryStatus,
        },
        recommendedAction: "Generate AI summary",
      });
    }

    if (doc.summaryEmbeddingStatus && doc.summaryEmbeddingStatus !== "complete") {
      results.push({
        findingType: "missing_embedding",
        severity: "low",
        detectionMethod: "deterministic",
        entityType: input.entityType,
        entityId: input.entityId,
        documentId: doc.id,
        confidenceScore: 0.85,
        evidenceJson: {
          documentNo: doc.documentNo,
          embeddingStatus: doc.summaryEmbeddingStatus,
        },
        recommendedAction: "Generate semantic embedding",
      });
    }

    if (
      doc.confidentialityLevel &&
      CONFIDENTIAL_LEVELS.has(doc.confidentialityLevel) &&
      !input.isAdminViewer
    ) {
      results.push({
        findingType: "confidential_document_requires_admin_review",
        severity: "info",
        detectionMethod: "deterministic",
        entityType: input.entityType,
        entityId: input.entityId,
        documentId: doc.id,
        confidenceScore: 0.95,
        evidenceJson: { documentNo: doc.documentNo },
        recommendedAction: "Request admin review for confidential document",
      });
    }

    if (input.openRenewalDocumentIds.has(doc.id)) {
      results.push({
        findingType: "open_renewal_request",
        severity: "medium",
        detectionMethod: "deterministic",
        entityType: input.entityType,
        entityId: input.entityId,
        documentId: doc.id,
        confidenceScore: 0.95,
        evidenceJson: { documentNo: doc.documentNo },
        recommendedAction: "Complete open renewal workflow",
      });
    }

    // Expiry checks for docs not already covered by rule engine (non-rule docs)
    if (doc.expiryDate) {
      const expiry = new Date(doc.expiryDate);
      if (expiry < now) {
        const alreadyExpired = results.some(
          (r) =>
            r.documentId === doc.id && r.findingType === "expired_document"
        );
        if (!alreadyExpired) {
          results.push({
            findingType: "expired_document",
            severity: "critical",
            detectionMethod: "deterministic",
            entityType: input.entityType,
            entityId: input.entityId,
            documentId: doc.id,
            actualValue: doc.expiryDate,
            confidenceScore: 0.99,
            evidenceJson: { documentNo: doc.documentNo, expiryDate: doc.expiryDate },
            recommendedAction: "Renew or replace expired document",
          });
        }
      } else if (expiry <= soonThreshold) {
        const alreadyExpiring = results.some(
          (r) =>
            r.documentId === doc.id && r.findingType === "expiring_soon_document"
        );
        if (!alreadyExpiring) {
          results.push({
            findingType: "expiring_soon_document",
            severity: "medium",
            detectionMethod: "deterministic",
            entityType: input.entityType,
            entityId: input.entityId,
            documentId: doc.id,
            actualValue: doc.expiryDate,
            confidenceScore: 0.95,
            evidenceJson: { documentNo: doc.documentNo },
            recommendedAction: "Plan document renewal",
          });
        }
      }
    }
  }

  if (input.documents.length === 0) {
    results.push({
      findingType: "unlinked_document",
      severity: "info",
      detectionMethod: "deterministic",
      entityType: input.entityType,
      entityId: input.entityId,
      confidenceScore: 0.9,
      evidenceJson: { linkCount: 0 },
      recommendedAction: "Link documents via DMS inbox",
    });
  }

  return results;
}

export function mapLinkedDocumentRow(row: Record<string, unknown>): LinkedDocumentForCompliance {
  const doc = row.document as Record<string, unknown> | null;
  const docType = doc?.document_type as Record<string, unknown> | null;
  return {
    id: doc?.id as number,
    documentNo: (doc?.document_no as string | null) ?? null,
    title: (doc?.title as string | null) ?? null,
    documentTypeId: (doc?.document_type_id as number | null) ?? null,
    typeCode: (docType?.type_code as string | null) ?? null,
    issueDate: (doc?.issue_date as string | null) ?? null,
    expiryDate: (doc?.expiry_date as string | null) ?? null,
    aiRiskLevel: (doc?.ai_risk_level as string | null) ?? null,
    completenessScore:
      doc?.completeness_score != null ? Number(doc.completeness_score) : null,
    ocrTextAvailable: (doc?.ocr_text_available as boolean) ?? false,
    aiSummaryStatus: (doc?.ai_summary_status as string | null) ?? null,
    summaryEmbeddingStatus: (doc?.summary_embedding_status as string | null) ?? null,
    confidentialityLevel: (doc?.confidentiality_level as string | null) ?? null,
    status: (doc?.status as string | null) ?? null,
  };
}

export { OPEN_RENEWAL_STATUSES };
