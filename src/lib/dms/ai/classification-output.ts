/**
 * Phase 3 — Classification output types and parsing helpers.
 */

import type { ConfidenceLabel } from "./types";
import { confidenceLabelFromScore } from "./types";

export type DmsClassificationAlternative = {
  documentType: string;
  confidence: number;
  reason: string;
};

export type DmsClassificationEvidence = {
  matchedKeywords: string[];
  matchedPatterns: string[];
  negativeMatches: string[];
};

export type ExtendedClassificationFields = {
  alternativeDocumentTypes: DmsClassificationAlternative[];
  classificationEvidence: DmsClassificationEvidence | null;
  needsHumanReview: boolean;
  reviewReason: string | null;
};

const MAX_ALTERNATIVES = 3;
const MAX_EVIDENCE_ITEMS = 8;
const MAX_REASON_LEN = 200;

function safeConfidence(val: unknown): number {
  const n = typeof val === "number" ? val : parseFloat(String(val ?? "0"));
  return isNaN(n) ? 0 : Math.max(0, Math.min(1, n));
}

function safeStringArray(val: unknown, max: number): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .slice(0, max)
    .map((s) => s.slice(0, 120));
}

export function parseAlternativeDocumentTypes(raw: unknown): DmsClassificationAlternative[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
    .slice(0, MAX_ALTERNATIVES)
    .map((a) => ({
      documentType:
        typeof a.document_type === "string"
          ? a.document_type
          : typeof a.suggested_type_code === "string"
            ? a.suggested_type_code
            : "",
      confidence: safeConfidence(a.confidence ?? a.confidence_score),
      reason:
        typeof a.reason === "string" ? a.reason.slice(0, MAX_REASON_LEN) : "",
    }))
    .filter((a) => a.documentType.length > 0);
}

export function parseClassificationEvidence(raw: unknown): DmsClassificationEvidence | null {
  if (!raw || typeof raw !== "object") return null;
  const e = raw as Record<string, unknown>;
  const matchedKeywords = safeStringArray(e.matched_keywords, MAX_EVIDENCE_ITEMS);
  const matchedPatterns = safeStringArray(e.matched_patterns, MAX_EVIDENCE_ITEMS);
  const negativeMatches = safeStringArray(e.negative_matches, MAX_EVIDENCE_ITEMS);
  if (
    matchedKeywords.length === 0 &&
    matchedPatterns.length === 0 &&
    negativeMatches.length === 0
  ) {
    return null;
  }
  return { matchedKeywords, matchedPatterns, negativeMatches };
}

export function deriveNeedsHumanReview(
  confidenceScore: number,
  confidenceLabel: ConfidenceLabel,
  suggestedTypeCode: string | null,
  explicit?: boolean | null
): boolean {
  if (explicit === true) return true;
  if (explicit === false) return false;
  if (!suggestedTypeCode) return true;
  if (confidenceLabel === "needs_manual_review") return true;
  return confidenceScore < 0.6;
}

/** Parse extended classification fields from raw AI classification object. */
export function parseExtendedClassification(
  rawClass: Record<string, unknown>,
  confidenceScore: number,
  confidenceLabel: ConfidenceLabel,
  suggestedTypeCode: string | null
): ExtendedClassificationFields {
  const alternativeDocumentTypes = parseAlternativeDocumentTypes(
    rawClass.alternative_document_types
  );
  const classificationEvidence = parseClassificationEvidence(
    rawClass.classification_evidence
  );
  const needsHumanReview = deriveNeedsHumanReview(
    confidenceScore,
    confidenceLabel,
    suggestedTypeCode,
    typeof rawClass.needs_human_review === "boolean" ? rawClass.needs_human_review : null
  );
  const reviewReason =
    typeof rawClass.review_reason === "string" && rawClass.review_reason.trim()
      ? rawClass.review_reason.slice(0, MAX_REASON_LEN)
      : needsHumanReview && confidenceScore < 0.6
        ? "Classification confidence is below the review threshold"
        : null;

  return {
    alternativeDocumentTypes,
    classificationEvidence,
    needsHumanReview,
    reviewReason,
  };
}

/** Read classification review metadata from stored raw_response_json. */
export function getClassificationReviewMeta(rawResponseJson: Record<string, unknown> | null | undefined): {
  alternatives: DmsClassificationAlternative[];
  evidence: DmsClassificationEvidence | null;
  needsHumanReview: boolean;
  reviewReason: string | null;
} {
  if (!rawResponseJson?.classification || typeof rawResponseJson.classification !== "object") {
    return {
      alternatives: [],
      evidence: null,
      needsHumanReview: false,
      reviewReason: null,
    };
  }
  const c = rawResponseJson.classification as Record<string, unknown>;
  const score = safeConfidence(c.confidence_score);
  const label =
    typeof c.confidence_label === "string"
      ? (c.confidence_label as ConfidenceLabel)
      : confidenceLabelFromScore(score);
  const typeCode =
    typeof c.suggested_type_code === "string" ? c.suggested_type_code : null;
  const ext = parseExtendedClassification(c, score, label, typeCode);
  return {
    alternatives: ext.alternativeDocumentTypes,
    evidence: ext.classificationEvidence,
    needsHumanReview: ext.needsHumanReview,
    reviewReason: ext.reviewReason,
  };
}

/** Build sanitized classification object for raw_response_json storage. */
export function buildSanitizedClassificationPayload(
  rawClass: Record<string, unknown> | undefined,
  confidenceScore: number,
  confidenceLabel: ConfidenceLabel,
  suggestedTypeCode: string | null,
  reason: string
): Record<string, unknown> {
  const ext = rawClass
    ? parseExtendedClassification(rawClass, confidenceScore, confidenceLabel, suggestedTypeCode)
    : {
        alternativeDocumentTypes: [] as DmsClassificationAlternative[],
        classificationEvidence: null as DmsClassificationEvidence | null,
        needsHumanReview: deriveNeedsHumanReview(
          confidenceScore,
          confidenceLabel,
          suggestedTypeCode,
          null
        ),
        reviewReason: null as string | null,
      };

  return {
    suggested_type_code: suggestedTypeCode,
    confidence_score: confidenceScore,
    confidence_label: confidenceLabel,
    reason: reason.slice(0, 500),
    alternative_document_types: ext.alternativeDocumentTypes.map((a) => ({
      document_type: a.documentType,
      confidence: a.confidence,
      reason: a.reason,
    })),
    classification_evidence: ext.classificationEvidence
      ? {
          matched_keywords: ext.classificationEvidence.matchedKeywords,
          matched_patterns: ext.classificationEvidence.matchedPatterns,
          negative_matches: ext.classificationEvidence.negativeMatches,
        }
      : null,
    needs_human_review: ext.needsHumanReview,
    review_reason: ext.reviewReason,
  };
}
