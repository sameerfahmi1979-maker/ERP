/**
 * ERP COMMON AI.6 — AI Search Across ERP — Type Definitions
 *
 * These types govern the secure, permission-aware, read-only global search.
 * No action types, no write types, no AI output exposure.
 */

// ── Search modes ──────────────────────────────────────────────────────────────

export type ErpSearchMode =
  | "quick_keyword"
  | "safe_fts"
  | "ai_intent"
  | "semantic_documents"
  | "hybrid"
  | "entity_filtered";

// ── Entity / result types ─────────────────────────────────────────────────────

export type ErpSearchEntityType =
  | "organization"
  | "branch"
  | "party"
  | "site"
  | "dms_document";

export type ErpSearchResultType =
  | "organization"
  | "branch"
  | "party"
  | "site"
  | "dms_document"
  | "duplicate_candidate"
  | "compliance_finding"
  | "risk_score"
  | "field_suggestion";

// ── AI intent shape ────────────────────────────────────────────────────────────

export interface ErpSearchIntent {
  query: string;
  entityTypes: ErpSearchEntityType[];
  keywords: string[];
  riskLevel?: "none" | "low" | "medium" | "high" | "critical" | null;
  complianceStatus?: "open" | "critical" | "high" | null;
  hasDuplicates?: boolean | null;
  expiryState?: "expired" | "expiring_soon" | null;
  status?: string | null;
  dateFrom?: string | null;
  dateTo?: string | null;
  documentTypeHint?: string | null;
}

// ── Search input filters ───────────────────────────────────────────────────────

export interface ErpSearchFilters {
  query: string;
  mode: ErpSearchMode;
  entityTypes?: ErpSearchEntityType[];
  riskLevel?: "none" | "low" | "medium" | "high" | "critical";
  page?: number;
  limit?: number;
  includeAiSignals?: boolean;
}

// ── Risk/compliance badges on results ─────────────────────────────────────────

export interface ErpSearchBadgeData {
  riskLevel?: "none" | "low" | "medium" | "high" | "critical" | null;
  riskScore?: number | null;
  openComplianceCount?: number | null;
  criticalComplianceCount?: number | null;
  pendingDuplicateCount?: number | null;
}

// ── Individual search result ───────────────────────────────────────────────────

export interface ErpSearchResult {
  /** Unique key for deduplication: resultType:entityId */
  key: string;
  resultType: ErpSearchResultType;
  entityType?: ErpSearchEntityType;
  entityId: number;
  /** Display title — never raw AI output */
  title: string;
  /** Safe subtitle / code / reference */
  subtitle?: string | null;
  /** Short safe snippet — never content_text, OCR text, or AI raw response */
  snippet?: string | null;
  /** Navigation route for "Open Record" */
  route: string;
  /** Similarity score 0–1 for semantic results */
  semanticSimilarity?: number | null;
  /** Badges from AI signals */
  badges?: ErpSearchBadgeData;
  /** Confidential flag — redacted DMS content */
  isConfidential?: boolean;
  /** Soft relevance score for ranking */
  relevanceScore: number;
  updatedAt?: string | null;
}

// ── Group summary ──────────────────────────────────────────────────────────────

export interface ErpSearchResultGroup {
  resultType: ErpSearchResultType;
  label: string;
  count: number;
}

// ── Full search response ───────────────────────────────────────────────────────

export interface ErpSearchResponse {
  query: string;
  mode: ErpSearchMode;
  intent?: ErpSearchIntent | null;
  results: ErpSearchResult[];
  groups: ErpSearchResultGroup[];
  partialResults: boolean;
  failedSources: string[];
  totalCount: number;
}

// ── Recent search record ───────────────────────────────────────────────────────

export interface ErpRecentSearch {
  id: number;
  searchText: string;
  entityTypes: ErpSearchEntityType[];
  searchMode: ErpSearchMode;
  resultCount: number;
  createdAt: string;
}

// ── Server action input / output ───────────────────────────────────────────────

export interface SearchAcrossErpInput {
  query: string;
  mode?: ErpSearchMode;
  entityTypes?: ErpSearchEntityType[];
  riskLevel?: "none" | "low" | "medium" | "high" | "critical";
  page?: number;
  limit?: number;
  includeAiSignals?: boolean;
}

export interface SaveRecentSearchInput {
  searchText: string;
  entityTypes?: ErpSearchEntityType[];
  searchMode?: ErpSearchMode;
  resultCount?: number;
}
