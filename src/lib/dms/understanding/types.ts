/**
 * ERP COMMON AI.2 — AI Document Understanding Center
 *
 * View model types for the Document Understanding aggregation.
 * All fields are safe metadata — no raw OCR text, content_text,
 * prompts, AI responses, vectors, or API keys.
 */

// ── Field candidate (from COMMON AI.1 registry) ───────────────────────────────

export interface DmsUnderstandingFieldCandidate {
  fieldLabel: string;
  targetField: string;
  targetTable: string;
  documentTypeHints: string[];
  hasPendingSuggestion: boolean;
  pendingSuggestionId: number | null;
  safetyClassification: string;
  /** High = document type matches field's documentTypeHints; General = other registered field */
  relevance: "high" | "general";
}

// ── Recommended action ────────────────────────────────────────────────────────

export interface DmsUnderstandingAction {
  actionCode: string;
  label: string;
  description: string;
  priority: "high" | "medium" | "low";
  /** Section id to navigate to within document record */
  linkToTab?: string;
  /** External route link */
  linkToRoute?: string;
  /** Why this action is recommended */
  condition: string;
}

// ── Health score ──────────────────────────────────────────────────────────────

export interface DmsUnderstandingHealth {
  /** Composite score 0–100 */
  score: number;
  label: "Excellent" | "Good" | "Needs Attention" | "Critical";
  hasOcr: boolean;
  hasSummary: boolean;
  hasIntelligence: boolean;
  hasEmbedding: boolean;
  hasLinks: boolean;
  warningCount: number;
}

// ── Main understanding view model ─────────────────────────────────────────────

export interface DmsDocumentUnderstanding {
  documentId: number;
  generatedAt: string;

  // ── 1. Document Identity
  identity: {
    documentNo: string | null;
    title: string | null;
    typeCode: string | null;
    typeName: string | null;
    typeNameAr: string | null;
    categoryName: string | null;
    status: string | null;
    confidentialityLevel: string | null;
    issueDate: string | null;
    expiryDate: string | null;
    daysUntilExpiry: number | null;
    expiryStatus: "valid" | "expiring_soon" | "expired" | "unknown";
  };

  // ── 2. OCR / Text Status
  ocrStatus: {
    ocrLastRunAt: string | null;
    ocrTextAvailable: boolean;
    fileCount: number;
    filesWithOcr: number;
    contentTextAvailable: boolean;
    contentTextCharCount: number | null;
    contentTextTruncated: boolean;
    contentTextSource: string | null;
  };

  // ── 3. AI Summary
  summaryStatus: {
    status: string | null;
    /** null if confidential + non-admin */
    summaryText: string | null;
    isConfidentialRedacted: boolean;
    summaryModel: string | null;
    summaryUpdatedAt: string | null;
  };

  // ── 4. AI Classification / Extraction
  extractionStatus: {
    hasResult: boolean;
    aiStatus: string | null;
    classificationConfidence: number | null;
    classificationReason: string | null;
    extractedFieldCount: number;
    lowConfidenceFieldCount: number;
    needsHumanReview: boolean;
  };

  // ── 5. Completeness
  completeness: {
    score: number | null;
    missingFieldLabels: string[];
    totalMetadataFields: number;
    filledMetadataFields: number;
  };

  // ── 6. Risk
  risk: {
    riskLevel: string | null;
    riskScore: number | null;
    riskReasonLabels: string[];
    isExpired: boolean;
    isExpiringSoon: boolean;
  };

  // ── 7. Semantic Embedding
  embedding: {
    status: string | null;
    model: string | null;
    source: string | null;
    readyForSemanticSearch: boolean;
  };

  // ── 8. Tags & Links
  tagsLinks: {
    tagCount: number;
    tagNames: string[];
    pendingTagSuggestions: number;
    linkCount: number;
    linkedEntities: Array<{
      entityType: string;
      entityId: number;
      entityDisplayName: string | null;
      isPrimary: boolean;
    }>;
    pendingLinkSuggestions: number;
  };

  // ── 9. ORCH.1 Pipeline Status
  orchestrationStatus: {
    available: boolean;
    status: string | null;
    steps: Array<{ step: string; status: string; durationMs?: number | null }>;
    completedSteps: number;
    failedSteps: number;
  };

  // ── 10. Field Update Candidates (COMMON AI.1 preview)
  fieldCandidates: {
    entityType: string | null;
    entityId: number | null;
    registryAvailable: boolean;
    candidateFields: DmsUnderstandingFieldCandidate[];
    pendingSuggestionCount: number;
    hasAiReviewTab: boolean;
    aiReviewRoute: string | null;
  };

  // ── Computed: Overall health
  health: DmsUnderstandingHealth;

  // ── Computed: Recommended actions
  actions: DmsUnderstandingAction[];

  // ── COMMON AI.3: Duplicate/conflict candidates (read-only count)
  duplicateCandidates: {
    pendingCount: number;
    hasPending: boolean;
    reviewRoute: string | null;
  };

  // ── COMMON AI.4: Compliance findings (read-only count)
  complianceFindings: {
    openCount: number;
    hasCritical: boolean;
    reviewRoute: string | null;
  };

  // ── COMMON AI.5: Linked entity risk (read-only)
  entityRisk: {
    entityType: string;
    entityId: number;
    riskScore: number | null;
    riskLevel: string | null;
    status: string | null;
    isStale: boolean;
    reviewRoute: string | null;
  } | null;
}
