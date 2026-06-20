/**
 * ERP COMMON AI.5 — AI Risk Scoring Types
 * Safe metadata only — no OCR, content_text, prompts, or raw AI responses.
 */

export type RiskEntityType = "company" | "party" | "branch" | "site" | "dms_document";

export type RiskLevel = "none" | "low" | "medium" | "high" | "critical";

export type RiskScoreStatus =
  | "pending"
  | "calculated"
  | "stale"
  | "reviewed"
  | "accepted"
  | "superseded"
  | "failed";

export type RiskReviewDecision =
  | "accepted"
  | "needs_more_review"
  | "false_positive_signal"
  | "manual_override_note";

export type RiskSignalCode =
  | "document_expired"
  | "document_expiring_soon"
  | "document_critical_risk"
  | "document_high_risk"
  | "document_incomplete"
  | "missing_required_document"
  | "open_compliance_critical"
  | "open_compliance_high"
  | "open_duplicate_conflict"
  | "open_field_conflict"
  | "missing_ocr"
  | "missing_ai_summary"
  | "missing_embedding"
  | "unlinked_document"
  | "wrong_document_link"
  | "license_expiry_mismatch"
  | "trn_mismatch"
  | "confidential_admin_review_required"
  | "manual_non_compliant_status"
  | "understanding_health_low";

export type RiskSignal = {
  code: RiskSignalCode;
  count: number;
  label: string;
  evidence?: Record<string, unknown>;
};

export type RiskBreakdownItem = {
  signalCode: RiskSignalCode;
  count: number;
  unitWeight: number;
  points: number;
  cap: number;
  label: string;
};

export type RiskScoreResult = {
  riskScore: number;
  riskLevel: RiskLevel;
  riskConfidence: number;
  calculationMethod: "deterministic" | "hybrid";
  reasons: Array<{ code: string; message: string; points: number }>;
  breakdown: RiskBreakdownItem[];
  sourceCounts: Record<string, number>;
};

export type RiskScoreRow = {
  id: number;
  entityType: RiskEntityType;
  entityId: number;
  entityLabel: string | null;
  riskScore: number;
  riskLevel: RiskLevel;
  riskConfidence: number;
  calculationMethod: string;
  status: RiskScoreStatus;
  reviewDecision: RiskReviewDecision | null;
  reviewNotes: string | null;
  reviewedAt: string | null;
  calculatedAt: string;
  staleAt: string | null;
  staleReason: string | null;
  isStale: boolean;
};

export type RiskScoreEventRow = {
  id: number;
  eventType: string;
  priorRiskScore: number | null;
  priorRiskLevel: string | null;
  newRiskScore: number | null;
  newRiskLevel: string | null;
  notes: string | null;
  actorId: number | null;
  createdAt: string;
};

export type RiskScoreDetail = RiskScoreRow & {
  riskReasons: Array<{ code: string; message: string; points: number }>;
  riskBreakdown: RiskBreakdownItem[];
  sourceCounts: Record<string, number>;
  events: RiskScoreEventRow[];
};

export type LinkedDocumentSignalInput = {
  documentId: number;
  documentNo: string | null;
  expiryDate: string | null;
  aiRiskLevel: string | null;
  completenessScore: number | null;
  ocrTextAvailable: boolean | null;
  aiSummaryStatus: string | null;
  summaryEmbeddingStatus: string | null;
  confidentialityLevel: string | null;
};

export type ComplianceFindingSignalInput = {
  findingType: string;
  severity: string;
};

export type RiskCalculationInput = {
  entityType: RiskEntityType;
  entityId: number;
  isAdminViewer: boolean;
  linkedDocuments: LinkedDocumentSignalInput[];
  complianceFindings: ComplianceFindingSignalInput[];
  complianceSummary: {
    missingRequiredDocuments: number;
    expiredDocuments: number;
    expiringSoonDocuments: number;
    highRiskDocuments: number;
    criticalRiskDocuments: number;
    openComplianceFindings: number;
  };
  pendingDuplicateCount: number;
  pendingFieldConflictCount: number;
  manualNonCompliant: boolean;
  understandingHealthScore: number | null;
  dmsDocumentRisk?: {
    aiRiskScore: number | null;
    aiRiskLevel: string | null;
    aiRiskReasonsJson: unknown;
  };
};

export type RiskCalculationResult = {
  result: RiskScoreResult;
  dryRun: boolean;
};

export type RiskBatchCalculationResult = {
  processed: number;
  succeeded: number;
  failed: number;
  dryRun: boolean;
  results: Array<{
    entityType: RiskEntityType;
    entityId: number;
    success: boolean;
    riskScore?: number;
    riskLevel?: RiskLevel;
    error?: string;
  }>;
};

export const DEDUP_BUCKETS: Partial<Record<RiskSignalCode, RiskSignalCode[]>> = {
  missing_required_document: ["missing_required_document"],
  document_expired: ["document_expired"],
  document_expiring_soon: ["document_expiring_soon"],
  document_critical_risk: ["document_critical_risk"],
  document_high_risk: ["document_high_risk"],
  document_incomplete: ["document_incomplete"],
  missing_ocr: ["missing_ocr"],
  missing_ai_summary: ["missing_ai_summary"],
  missing_embedding: ["missing_embedding"],
  open_duplicate_conflict: ["open_duplicate_conflict"],
  open_field_conflict: ["open_field_conflict"],
  license_expiry_mismatch: ["license_expiry_mismatch"],
  trn_mismatch: ["trn_mismatch"],
  confidential_admin_review_required: ["confidential_admin_review_required"],
  unlinked_document: ["unlinked_document"],
  wrong_document_link: ["wrong_document_link"],
};
