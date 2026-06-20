/**
 * ERP COMMON AI.3 — Duplicate / Conflict Detection Types
 */

export type DuplicateCandidateType =
  | "duplicate_party_trn"
  | "duplicate_party_iban"
  | "duplicate_party_license"
  | "duplicate_party_email"
  | "duplicate_party_name"
  | "duplicate_company_name"
  | "duplicate_branch_license"
  | "duplicate_site_name"
  | "duplicate_document_hash"
  | "duplicate_document_link"
  | "conflict_license_expiry"
  | "conflict_trn_value"
  | "conflict_company_name"
  | "wrong_document_link"
  | "similar_name";

export type DuplicateDetectionMethod = "deterministic" | "ai" | "hybrid";

export type DuplicateCandidateStatus =
  | "pending"
  | "reviewed"
  | "confirmed_duplicate"
  | "confirmed_conflict"
  | "ignored"
  | "resolved"
  | "superseded"
  | "failed";

export type DuplicateReviewDecision =
  | "confirmed_duplicate"
  | "confirmed_conflict"
  | "not_duplicate"
  | "needs_more_review"
  | "ignored";

export type DuplicateEntityType =
  | "party"
  | "company"
  | "branch"
  | "site"
  | "dms_document";

export type DuplicateScanScope =
  | "full"
  | "party"
  | "company"
  | "branch"
  | "site"
  | "dms_document";

export interface DuplicateRuleResult {
  candidateType: DuplicateCandidateType;
  detectionMethod: DuplicateDetectionMethod;
  entityTypeA: DuplicateEntityType | string;
  entityIdA: number;
  entityTypeB?: DuplicateEntityType | string | null;
  entityIdB?: number | null;
  conflictField?: string | null;
  valueA?: string | null;
  valueB?: string | null;
  valueKind?: "iban" | "trn" | "email" | "name" | "license" | "hash" | "date" | "text";
  confidenceScore: number;
  evidenceJson?: Record<string, unknown> | null;
  aiReason?: string | null;
  sourceDocumentId?: number | null;
}

export interface DuplicateCandidateInput {
  candidateType: DuplicateCandidateType;
  detectionMethod: DuplicateDetectionMethod;
  candidateKey: string;
  entityTypeA: string;
  entityIdA: number;
  entityTypeB?: string | null;
  entityIdB?: number | null;
  conflictField?: string | null;
  valueA?: string | null;
  valueB?: string | null;
  confidenceScore: number;
  evidenceJson?: Record<string, unknown> | null;
  aiReason?: string | null;
  sourceDocumentId?: number | null;
}

export interface DuplicateCandidateRow {
  id: number;
  candidateType: DuplicateCandidateType;
  detectionMethod: DuplicateDetectionMethod;
  candidateKey: string;
  entityTypeA: string;
  entityIdA: number;
  entityTypeB: string | null;
  entityIdB: number | null;
  conflictField: string | null;
  valueA: string | null;
  valueB: string | null;
  confidenceScore: number;
  evidenceJson: Record<string, unknown> | null;
  aiReason: string | null;
  sourceDocumentId: number | null;
  status: DuplicateCandidateStatus;
  reviewDecision: DuplicateReviewDecision | null;
  reviewNotes: string | null;
  reviewedBy: number | null;
  reviewedAt: string | null;
  resolvedBy: number | null;
  resolvedAt: string | null;
  createdAt: string;
  createdBy: number | null;
  updatedAt: string;
}

export interface DuplicateCandidateDetail extends DuplicateCandidateRow {
  entityLabelA: string | null;
  entityLabelB: string | null;
  sourceDocumentNo: string | null;
  sourceDocumentTitle: string | null;
  events: Array<{
    id: number;
    eventType: string;
    eventDataJson: Record<string, unknown> | null;
    actorUserId: number | null;
    createdAt: string;
  }>;
}

export interface DuplicateScanInput {
  scope?: DuplicateScanScope;
  entityType?: DuplicateEntityType;
  entityId?: number;
  includeAiRules?: boolean;
  dryRun?: boolean;
  limit?: number;
  aiCallLimit?: number;
  supersedeExisting?: boolean;
}

export interface DuplicateScanResult {
  deterministicDetected: number;
  aiDetected: number;
  inserted: number;
  skippedExisting: number;
  superseded: number;
  failedRules: string[];
  aiCallsMade: number;
  dryRun: boolean;
  previewCount?: number;
}

export interface DuplicateCandidateFilters {
  status?: DuplicateCandidateStatus;
  candidateType?: DuplicateCandidateType;
  entityType?: string;
  entityId?: number;
  documentId?: number;
  minConfidence?: number;
  maxConfidence?: number;
  limit?: number;
  offset?: number;
}

export const DUPLICATE_SCAN_DEFAULT_PAIR_LIMIT = 1000;
export const DUPLICATE_SCAN_DEFAULT_AI_CALL_LIMIT = 50;
export const DUPLICATE_AI_MIN_CONFIDENCE = 0.7;
