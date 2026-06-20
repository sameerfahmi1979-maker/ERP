/**
 * ERP COMMON AI.4 — Required Document Rule Engine
 */

import type {
  ComplianceRuleResult,
  LinkedDocumentForCompliance,
  RequiredDocumentRuleForCompliance,
} from "./types";
import { COMPLIANCE_EXPIRING_SOON_DAYS } from "./types";

function getExpiringSoonDays(rule: RequiredDocumentRuleForCompliance): number {
  const days = rule.reminderDaysBeforeExpiry;
  if (days && days.length > 0) {
    return Math.min(...days.filter((d) => d > 0));
  }
  return COMPLIANCE_EXPIRING_SOON_DAYS;
}

function findMatchingDocs(
  docs: LinkedDocumentForCompliance[],
  rule: RequiredDocumentRuleForCompliance
): LinkedDocumentForCompliance[] {
  if (!rule.documentTypeId) return [];
  return docs.filter(
    (d) =>
      d.documentTypeId === rule.documentTypeId &&
      d.status !== "archived" &&
      d.status !== "deleted"
  );
}

export function evaluateRequiredDocumentRulesForEntity(input: {
  entityType: string;
  entityId: number;
  rules: RequiredDocumentRuleForCompliance[];
  linkedDocuments: LinkedDocumentForCompliance[];
}): ComplianceRuleResult[] {
  const results: ComplianceRuleResult[] = [];
  const now = new Date();
  const defaultSoon = new Date(now);
  defaultSoon.setDate(defaultSoon.getDate() + COMPLIANCE_EXPIRING_SOON_DAYS);

  for (const rule of input.rules) {
    if (rule.entityType !== input.entityType) continue;

    const matching = findMatchingDocs(input.linkedDocuments, rule);
    const soonDays = getExpiringSoonDays(rule);
    const soonThreshold = new Date(now);
    soonThreshold.setDate(soonThreshold.getDate() + soonDays);

    if (rule.isRequired && matching.length === 0) {
      results.push({
        findingType: "missing_required_document",
        severity: rule.blocksActivation ? "critical" : "high",
        detectionMethod: "deterministic",
        entityType: input.entityType,
        entityId: input.entityId,
        sourceRuleId: rule.id,
        confidenceScore: 0.98,
        evidenceJson: {
          ruleCode: rule.ruleCode,
          ruleName: rule.ruleName,
          typeCode: rule.typeCode,
        },
        recommendedAction: `Upload and link ${rule.ruleName} via DMS inbox`,
      });
      continue;
    }

    for (const doc of matching) {
      if (rule.documentTypeId && doc.documentTypeId !== rule.documentTypeId) {
        results.push({
          findingType: "wrong_document_type",
          severity: "high",
          detectionMethod: "deterministic",
          entityType: input.entityType,
          entityId: input.entityId,
          documentId: doc.id,
          sourceRuleId: rule.id,
          expectedValue: rule.typeCode,
          actualValue: doc.typeCode,
          confidenceScore: 0.95,
          evidenceJson: {
            ruleCode: rule.ruleCode,
            documentNo: doc.documentNo,
            expectedTypeCode: rule.typeCode,
            actualTypeCode: doc.typeCode,
          },
          recommendedAction: "Replace or relink the correct document type",
        });
      }

      if (rule.requiresIssueDate && !doc.issueDate) {
        results.push({
          findingType: "missing_issue_date",
          severity: "medium",
          detectionMethod: "deterministic",
          entityType: input.entityType,
          entityId: input.entityId,
          documentId: doc.id,
          sourceRuleId: rule.id,
          confidenceScore: 0.95,
          evidenceJson: { ruleCode: rule.ruleCode, documentNo: doc.documentNo },
          recommendedAction: "Add issue date to the linked document",
        });
      }

      if (doc.expiryDate) {
        const expiry = new Date(doc.expiryDate);
        if (expiry < now) {
          results.push({
            findingType: "expired_document",
            severity: "critical",
            detectionMethod: "deterministic",
            entityType: input.entityType,
            entityId: input.entityId,
            documentId: doc.id,
            sourceRuleId: rule.id,
            actualValue: doc.expiryDate,
            confidenceScore: 0.99,
            evidenceJson: {
              ruleCode: rule.ruleCode,
              documentNo: doc.documentNo,
              expiryDate: doc.expiryDate,
            },
            recommendedAction: "Start renewal or upload a new version",
          });
        } else if (expiry <= soonThreshold) {
          results.push({
            findingType: "expiring_soon_document",
            severity: "medium",
            detectionMethod: "deterministic",
            entityType: input.entityType,
            entityId: input.entityId,
            documentId: doc.id,
            sourceRuleId: rule.id,
            actualValue: doc.expiryDate,
            confidenceScore: 0.95,
            evidenceJson: {
              ruleCode: rule.ruleCode,
              documentNo: doc.documentNo,
              daysUntilExpiry: Math.ceil(
                (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
              ),
            },
            recommendedAction: "Plan document renewal",
          });
        }
      }

      if (rule.blocksActivation) {
        results.push({
          findingType: "blocks_activation_warning",
          severity: "high",
          detectionMethod: "deterministic",
          entityType: input.entityType,
          entityId: input.entityId,
          documentId: doc.id,
          sourceRuleId: rule.id,
          confidenceScore: 0.9,
          evidenceJson: { ruleCode: rule.ruleCode, blocksActivation: true },
          recommendedAction: "Management review required — rule blocks activation",
        });
      }
    }
  }

  return results;
}

export function countMissingRequiredDocuments(input: {
  entityType: string;
  rules: RequiredDocumentRuleForCompliance[];
  linkedDocuments: LinkedDocumentForCompliance[];
}): number {
  let count = 0;
  for (const rule of input.rules) {
    if (rule.entityType !== input.entityType || !rule.isRequired) continue;
    const matching = findMatchingDocs(input.linkedDocuments, rule);
    if (matching.length === 0) count++;
  }
  return count;
}
