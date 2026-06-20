/**
 * ERP COMMON AI.4 — AI Compliance Checker Types
 */

export type ComplianceFindingType =
  | "missing_required_document"
  | "expired_document"
  | "expiring_soon_document"
  | "document_high_risk"
  | "document_critical_risk"
  | "document_incomplete"
  | "missing_ocr"
  | "missing_ai_summary"
  | "missing_embedding"
  | "unlinked_document"
  | "wrong_document_type"
  | "duplicate_conflict_open"
  | "field_suggestion_conflict_open"
  | "license_expiry_mismatch"
  | "trn_mismatch"
  | "missing_required_metadata"
  | "missing_issue_date"
  | "confidential_document_requires_admin_review"
  | "open_renewal_request"
  | "blocks_activation_warning"
  | "ai_compliance_note";

export type ComplianceSeverity = "info" | "low" | "medium" | "high" | "critical";

export type ComplianceFindingStatus =
  | "open"
  | "reviewed"
  | "accepted"
  | "waived"
  | "resolved"
  | "false_positive"
  | "superseded"
  | "failed";

export type ComplianceDetectionMethod = "deterministic" | "ai" | "hybrid";

export type ComplianceEntityType = "party" | "company" | "branch" | "site" | "dms_document";

export type ComplianceReviewDecision =
  | "accepted"
  | "waived"
  | "resolved"
  | "false_positive"
  | "needs_more_review";

export interface ComplianceRuleResult {
  findingType: ComplianceFindingType;
  severity: ComplianceSeverity;
  detectionMethod: ComplianceDetectionMethod;
  entityType: string;
  entityId: number;
  documentId?: number | null;
  sourceRuleId?: number | null;
  sourceDuplicateCandidateId?: number | null;
  sourceFieldSuggestionId?: number | null;
  fieldCode?: string | null;
  expectedValue?: string | null;
  actualValue?: string | null;
  valueKind?: "trn" | "iban" | "date" | "text";
  confidenceScore: number;
  evidenceJson?: Record<string, unknown> | null;
  aiReason?: string | null;
  recommendedAction?: string | null;
}

export interface ComplianceFindingInput {
  findingType: ComplianceFindingType;
  severity: ComplianceSeverity;
  detectionMethod: ComplianceDetectionMethod;
  findingKey: string;
  entityType: string;
  entityId: number;
  documentId?: number | null;
  sourceRuleId?: number | null;
  sourceDuplicateCandidateId?: number | null;
  sourceFieldSuggestionId?: number | null;
  fieldCode?: string | null;
  expectedValue?: string | null;
  actualValue?: string | null;
  confidenceScore: number;
  evidenceJson?: Record<string, unknown> | null;
  aiReason?: string | null;
  recommendedAction?: string | null;
}

export interface ComplianceFindingRow {
  id: number;
  findingType: ComplianceFindingType;
  severity: ComplianceSeverity;
  detectionMethod: ComplianceDetectionMethod;
  findingKey: string;
  entityType: string;
  entityId: number;
  documentId: number | null;
  sourceRuleId: number | null;
  sourceDuplicateCandidateId: number | null;
  sourceFieldSuggestionId: number | null;
  fieldCode: string | null;
  expectedValue: string | null;
  actualValue: string | null;
  confidenceScore: number;
  evidenceJson: Record<string, unknown> | null;
  aiReason: string | null;
  recommendedAction: string | null;
  status: ComplianceFindingStatus;
  reviewDecision: ComplianceReviewDecision | null;
  reviewNotes: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null;
  resolvedBy: number | null;
  resolvedAt: string | null;
  waivedBy: number | null;
  waivedAt: string | null;
  waiverReason: string | null;
  createdAt: string;
  createdBy: number | null;
  updatedAt: string;
}

export interface ComplianceFindingDetail extends ComplianceFindingRow {
  entityLabel: string | null;
  documentNo: string | null;
  documentTitle: string | null;
  ruleName: string | null;
  events: Array<{
    id: number;
    eventType: string;
    eventDataJson: Record<string, unknown> | null;
    actorUserId: number | null;
    createdAt: string;
  }>;
}

export interface ComplianceScanInput {
  entityType?: ComplianceEntityType;
  entityId?: number;
  includeAiNotes?: boolean;
  dryRun?: boolean;
  limit?: number;
  aiCallLimit?: number;
  supersedeExisting?: boolean;
}

export interface ComplianceScanResult {
  detected: number;
  inserted: number;
  skippedExisting: number;
  superseded: number;
  failedEntities: string[];
  aiCallsMade: number;
  dryRun: boolean;
  previewCount?: number;
}

export interface EntityComplianceSummary {
  entityType: string;
  entityId: number;
  openFindingCount: number;
  criticalCount: number;
  highCount: number;
  overallStatus:
    | "ready"
    | "missing_documents"
    | "expired"
    | "expiring_soon"
    | "needs_review"
    | "blocked_candidate";
  lastScannedAt: string | null;
}

export interface ComplianceFindingFilters {
  status?: ComplianceFindingStatus;
  findingType?: ComplianceFindingType;
  entityType?: string;
  entityId?: number;
  documentId?: number;
  severity?: ComplianceSeverity;
  limit?: number;
  offset?: number;
}

export interface LinkedDocumentForCompliance {
  id: number;
  documentNo: string | null;
  title: string | null;
  documentTypeId: number | null;
  typeCode: string | null;
  issueDate: string | null;
  expiryDate: string | null;
  aiRiskLevel: string | null;
  completenessScore: number | null;
  ocrTextAvailable: boolean;
  aiSummaryStatus: string | null;
  summaryEmbeddingStatus: string | null;
  confidentialityLevel: string | null;
  status: string | null;
}

export interface RequiredDocumentRuleForCompliance {
  id: number;
  ruleCode: string;
  ruleName: string;
  entityType: string;
  documentTypeId: number | null;
  typeCode: string | null;
  isRequired: boolean;
  requiresExpiryDate: boolean;
  requiresIssueDate: boolean;
  blocksActivation: boolean;
  reminderDaysBeforeExpiry: number[] | null;
}

export const COMPLIANCE_EXPIRING_SOON_DAYS = 30;
export const COMPLIANCE_INCOMPLETE_THRESHOLD = 0.6;
export const COMPLIANCE_MAX_FINDINGS_PER_ENTITY = 200;
export const COMPLIANCE_MAX_FINDINGS_PER_SCAN = 2000;
export const COMPLIANCE_MAX_AI_CALLS_PER_SCAN = 20;
export const COMPLIANCE_AI_MIN_CONFIDENCE = 0.7;
export const COMPLIANCE_SCAN_DEFAULT_ENTITY_LIMIT = 500;
