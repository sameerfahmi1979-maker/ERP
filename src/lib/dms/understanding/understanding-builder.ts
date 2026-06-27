/**
 * ERP COMMON AI.2 — Understanding Builder
 *
 * Pure helper functions for computing document understanding health score
 * and recommended actions. No DB access. No AI calls. No logging of sensitive values.
 */

import type {
  DmsDocumentUnderstanding,
  DmsUnderstandingHealth,
  DmsUnderstandingAction,
} from "./types";

// ── Expiry status calculation ─────────────────────────────────────────────────

export function calculateExpiryStatus(
  expiryDate: string | null
): { status: "valid" | "expiring_soon" | "expired" | "unknown"; daysUntilExpiry: number | null } {
  if (!expiryDate) return { status: "unknown", daysUntilExpiry: null };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expiry = new Date(expiryDate);
  expiry.setHours(0, 0, 0, 0);

  const diffMs = expiry.getTime() - today.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays < 0) return { status: "expired", daysUntilExpiry: diffDays };
  if (diffDays <= 30) return { status: "expiring_soon", daysUntilExpiry: diffDays };
  return { status: "valid", daysUntilExpiry: diffDays };
}

// ── Safe label extraction from JSONB ─────────────────────────────────────────

/**
 * Extracts safe human-readable labels from stored JSONB arrays.
 * Caps to maxItems. Never returns raw DB values or sensitive data.
 */
export function sanitizeJsonLabels(
  json: unknown,
  maxItems = 8
): string[] {
  if (!json || !Array.isArray(json)) return [];

  const labels: string[] = [];
  for (const item of json.slice(0, maxItems * 2)) {
    if (typeof item === "string" && item.trim()) {
      labels.push(item.trim().slice(0, 100));
    } else if (typeof item === "object" && item !== null) {
      const obj = item as Record<string, unknown>;
      // Extract label/reason/field fields — safe metadata only
      const label = obj.label ?? obj.reason ?? obj.field ?? obj.field_label ?? obj.name;
      if (typeof label === "string" && label.trim()) {
        labels.push(label.trim().slice(0, 100));
      }
    }
    if (labels.length >= maxItems) break;
  }
  return labels;
}

// ── Health score calculation ──────────────────────────────────────────────────

export function calculateDocumentUnderstandingHealth(
  data: Pick<
    DmsDocumentUnderstanding,
    "ocrStatus" | "summaryStatus" | "completeness" | "risk" | "embedding" | "tagsLinks" | "extractionStatus" | "duplicateCandidates" | "complianceFindings"
  >
): DmsUnderstandingHealth {
  let score = 0;
  let warningCount = 0;

  // OCR available (20 pts) — text exists OR OCR processing completed on files
  const hasOcr =
    data.ocrStatus.ocrTextAvailable ||
    data.ocrStatus.contentTextAvailable ||
    data.ocrStatus.ocrRunComplete;
  if (hasOcr) score += 20;
  else warningCount++;

  // AI Summary (20 pts)
  const hasSummary = data.summaryStatus.status === "complete";
  if (hasSummary) score += 20;
  else if (data.summaryStatus.status === "failed") warningCount++;

  // Intelligence: completeness + risk (20 pts)
  const hasIntelligence =
    data.completeness.score !== null || data.risk.riskLevel !== null;
  if (hasIntelligence) {
    score += 20;
    if (data.risk.riskLevel === "high" || data.risk.riskLevel === "critical") warningCount++;
    if (data.risk.isExpired) warningCount++;
    if (data.risk.isExpiringSoon) warningCount++;
    if ((data.completeness.score ?? 1) < 0.5) warningCount++;
  } else {
    warningCount++;
  }

  // Embedding (20 pts)
  const hasEmbedding = data.embedding.status === "complete";
  if (hasEmbedding) score += 20;

  // Tags & Links (10 pts)
  const hasLinks = data.tagsLinks.linkCount > 0;
  if (hasLinks) score += 10;
  else warningCount++;

  // Duplicate candidates penalty (COMMON AI.3)
  if (data.duplicateCandidates.hasPending) warningCount++;

  // Compliance findings penalty (COMMON AI.4)
  if (data.complianceFindings.openCount > 0) warningCount++;
  if (data.complianceFindings.hasCritical) warningCount++;

  // AI extraction (10 pts)
  if (data.extractionStatus.hasResult && data.extractionStatus.aiStatus === "complete") {
    score += 10;
  }

  // Label
  const label: DmsUnderstandingHealth["label"] =
    score >= 85 ? "Excellent"
    : score >= 65 ? "Good"
    : score >= 40 ? "Needs Attention"
    : "Critical";

  return {
    score,
    label,
    hasOcr,
    hasSummary,
    hasIntelligence,
    hasEmbedding,
    hasLinks,
    warningCount,
  };
}

// ── Recommended actions ───────────────────────────────────────────────────────

export function buildRecommendedUnderstandingActions(
  data: DmsDocumentUnderstanding
): DmsUnderstandingAction[] {
  const actions: DmsUnderstandingAction[] = [];

  // HIGH: Expired
  if (data.risk.isExpired) {
    actions.push({
      actionCode: "RENEW_EXPIRED",
      label: "Renew Expired Document",
      description: "This document has expired. Start a renewal or upload a new version.",
      priority: "high",
      linkToTab: "expiry",
      condition: "Document is expired",
    });
  }

  // HIGH: No OCR run yet
  const ocrSatisfied =
    data.ocrStatus.ocrTextAvailable ||
    data.ocrStatus.contentTextAvailable ||
    data.ocrStatus.ocrRunComplete;
  if (!ocrSatisfied) {
    actions.push({
      actionCode: "RUN_OCR",
      label: "Run OCR",
      description: "No text extracted yet. Run OCR to enable AI analysis, search, and summaries.",
      priority: "high",
      linkToTab: "ocr",
      condition: "No OCR text available",
    });
  } else if (
    data.ocrStatus.ocrRunComplete &&
    !data.ocrStatus.ocrTextAvailable &&
    !data.ocrStatus.contentTextAvailable
  ) {
    actions.push({
      actionCode: "RERUN_OCR",
      label: "Re-run OCR",
      description: "OCR completed but no text was extracted. Re-run OCR or check scan quality.",
      priority: "medium",
      linkToTab: "ocr",
      condition: "OCR complete with no extractable text",
    });
  }

  // HIGH: No AI summary
  if (!data.summaryStatus.status || data.summaryStatus.status === "pending") {
    actions.push({
      actionCode: "GENERATE_SUMMARY",
      label: "Generate AI Summary",
      description: "AI summary not generated yet. Run it to improve searchability.",
      priority: "high",
      linkToTab: "ai-summary",
      condition: "AI summary not generated",
    });
  }

  // HIGH: Critical risk
  if (data.risk.riskLevel === "critical") {
    actions.push({
      actionCode: "REVIEW_RISK",
      label: "Review Critical Risk",
      description: `Critical risk detected: ${data.risk.riskReasonLabels.slice(0, 2).join(", ") || "see risk details"}.`,
      priority: "high",
      linkToTab: "intelligence",
      condition: "Document has critical risk level",
    });
  }

  // MEDIUM: Expiring soon
  if (data.risk.isExpiringSoon && !data.risk.isExpired) {
    actions.push({
      actionCode: "PLAN_RENEWAL",
      label: "Plan Renewal",
      description: `Document expires in ${data.identity.daysUntilExpiry ?? "?"} days. Start the renewal process.`,
      priority: "medium",
      linkToTab: "expiry",
      condition: "Document expiring within 30 days",
    });
  }

  // MEDIUM: Pending tag suggestions
  if (data.tagsLinks.pendingTagSuggestions > 0) {
    actions.push({
      actionCode: "REVIEW_TAGS",
      label: `Review ${data.tagsLinks.pendingTagSuggestions} AI Tag Suggestion(s)`,
      description: "AI has suggested tags for this document. Review and accept or reject them.",
      priority: "medium",
      linkToTab: "tags",
      condition: "Pending AI tag suggestions exist",
    });
  }

  // MEDIUM: Pending link suggestions
  if (data.tagsLinks.pendingLinkSuggestions > 0) {
    actions.push({
      actionCode: "REVIEW_LINKS",
      label: `Review ${data.tagsLinks.pendingLinkSuggestions} AI Link Suggestion(s)`,
      description: "AI has suggested entity links. Confirm or reject each suggestion.",
      priority: "medium",
      linkToTab: "links",
      condition: "Pending AI link suggestions exist",
    });
  }

  // MEDIUM: No entity linked
  if (data.tagsLinks.linkCount === 0) {
    actions.push({
      actionCode: "ADD_ENTITY_LINK",
      label: "Link to an ERP Entity",
      description: "No entity is linked to this document. Link it to an organization, party, or branch.",
      priority: "medium",
      linkToTab: "links",
      condition: "Document has no entity links",
    });
  }

  // MEDIUM: Low completeness
  if (data.completeness.score !== null && data.completeness.score < 0.6) {
    actions.push({
      actionCode: "FILL_METADATA",
      label: "Fill Missing Metadata",
      description: `Completeness is ${Math.round((data.completeness.score ?? 0) * 100)}%. Fill in: ${data.completeness.missingFieldLabels.slice(0, 3).join(", ") || "missing fields"}.`,
      priority: "medium",
      linkToTab: "metadata",
      condition: "Completeness score below 60%",
    });
  }

  // LOW: No embedding
  if (data.embedding.status !== "complete") {
    actions.push({
      actionCode: "GENERATE_EMBEDDING",
      label: "Generate Semantic Embedding",
      description: "Embedding not ready. Generate it to enable 'Find Similar Documents' and semantic search.",
      priority: "low",
      linkToTab: "semantic",
      condition: "Semantic embedding not generated",
    });
  }

  // LOW: Field candidates available, no suggestions
  if (
    data.fieldCandidates.registryAvailable &&
    data.fieldCandidates.pendingSuggestionCount === 0 &&
    data.fieldCandidates.aiReviewRoute
  ) {
    actions.push({
      actionCode: "GENERATE_FIELD_SUGGESTIONS",
      label: "Generate AI Field Suggestions",
      description: `This document can update ${data.fieldCandidates.candidateFields.length} field(s) on the linked ${data.fieldCandidates.entityType ?? "entity"}. Open the AI Review tab to generate suggestions.`,
      priority: "low",
      linkToRoute: data.fieldCandidates.aiReviewRoute,
      condition: "Field candidates available, no suggestions generated yet",
    });
  }

  // LOW: ORCH.1 warnings
  if (data.orchestrationStatus.available && data.orchestrationStatus.failedSteps > 0) {
    actions.push({
      actionCode: "RETRY_PIPELINE",
      label: `Retry ${data.orchestrationStatus.failedSteps} Failed Pipeline Step(s)`,
      description: "Some AI pipeline steps failed during upload. Use the manual AI tools to retry.",
      priority: "low",
      linkToTab: "ai-summary",
      condition: "ORCH.1 pipeline had failed steps",
    });
  }

  // MEDIUM: Pending duplicate/conflict candidates (COMMON AI.3)
  if (data.duplicateCandidates.hasPending) {
    actions.push({
      actionCode: "REVIEW_DUPLICATES",
      label: `Review ${data.duplicateCandidates.pendingCount} Duplicate/Conflict Candidate(s)`,
      description: "AI duplicate detection found potential duplicates or conflicts involving this document.",
      priority: "medium",
      linkToRoute:
        data.duplicateCandidates.reviewRoute ??
        `/admin/ai/duplicates?documentId=${data.documentId}`,
      condition: "Pending duplicate/conflict candidates exist",
    });
  }

  // MEDIUM: Open compliance findings (COMMON AI.4)
  if (data.complianceFindings.openCount > 0) {
    actions.push({
      actionCode: "REVIEW_COMPLIANCE",
      label: `Review ${data.complianceFindings.openCount} Compliance Finding(s)`,
      description: "AI compliance checker found open findings linked to this document or its entities.",
      priority: data.complianceFindings.hasCritical ? "high" : "medium",
      linkToRoute:
        data.complianceFindings.reviewRoute ??
        `/admin/ai/compliance?documentId=${data.documentId}`,
      condition: "Open compliance findings exist",
    });
  }

  // HIGH: Linked entity risk (COMMON AI.5)
  if (
    data.entityRisk &&
    (data.entityRisk.riskLevel === "high" ||
      data.entityRisk.riskLevel === "critical" ||
      (data.entityRisk.riskScore != null && data.entityRisk.riskScore >= 50))
  ) {
    actions.push({
      actionCode: "REVIEW_ENTITY_RISK",
      label: `Review Entity Risk (${data.entityRisk.riskLevel ?? "elevated"})`,
      description: `Linked ${data.entityRisk.entityType} has an elevated AI risk score for human review.`,
      priority: data.entityRisk.riskLevel === "critical" ? "high" : "medium",
      linkToRoute:
        data.entityRisk.reviewRoute ??
        `/admin/ai/risk?entityType=${data.entityRisk.entityType}&entityId=${data.entityRisk.entityId}`,
      condition: "Linked entity risk score is high or critical",
    });
  }

  // Sort: high → medium → low, cap to 8 actions
  const order = { high: 0, medium: 1, low: 2 };
  return actions
    .sort((a, b) => order[a.priority] - order[b.priority])
    .slice(0, 8);
}
