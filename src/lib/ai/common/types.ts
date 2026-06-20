/**
 * ERP COMMON AI.1A — Registry, Types, Prompt Contract, Output Schema
 *
 * Core TypeScript types for the Universal Internal AI Field Suggestion Engine.
 *
 * GOVERNANCE RULES (erp-common-ai-standard.mdc):
 * - All AI-eligible fields must be explicitly registered with isAiEligible: true.
 * - AI must never update IDs, codes, numbering fields, or audit fields.
 * - Human review is required before applying any suggestion.
 * - DMS-linked documents are the only evidence source.
 * - No OpenAI calls in this file.
 */

// ── Entity Types ───────────────────────────────────────────────────────────────

/** Pilot entity types supported by the Common AI engine. */
export type ErpAiEntityType = "company" | "party" | "branch" | "site";

// ── Field Types ────────────────────────────────────────────────────────────────

/** Allowed field value types for AI-eligible fields. */
export type ErpAiFieldType =
  | "text"
  | "date"
  | "number"
  | "boolean"
  | "fk"
  | "json";

// ── Suggestion Types ───────────────────────────────────────────────────────────

/** The kind of change the AI is suggesting. */
export type ErpAiSuggestionType =
  | "fill_missing"       // field is null/empty — AI found a value
  | "correct_value"      // field has a value but AI found a discrepancy
  | "update_existing"    // field has a value but AI found a better/newer one
  | "clear_wrong_value"  // field has an incorrect value that should be cleared
  | "conflict_detected"  // evidence documents disagree with each other
  | "needs_human_review"; // AI is uncertain — must not auto-apply

// ── Suggestion Status ──────────────────────────────────────────────────────────

/** Lifecycle status of a field suggestion record (Phase 1B DB schema). */
export type ErpAiSuggestionStatus =
  | "pending"    // awaiting human decision
  | "accepted"   // human accepted — not yet written
  | "rejected"   // human rejected
  | "superseded" // a newer suggestion replaced this one
  | "applied"    // accepted and written to target record
  | "failed";    // apply attempt failed

// ── Safety Classification ──────────────────────────────────────────────────────

/**
 * Governs how a field suggestion may be applied.
 * - business_safe: low-risk text/date fields; can show inline in review panel
 * - requires_review: FK/status fields; must show diff and require explicit confirm
 * - restricted: sensitive or complex fields; blocked from AI suggestions
 */
export type ErpAiSafetyClassification =
  | "business_safe"
  | "requires_review"
  | "restricted";

// ── Document Evidence Hint ────────────────────────────────────────────────────

/**
 * A document type code hint that tells the AI which document types are relevant
 * as evidence sources for a given field or entity.
 */
export interface ErpAiDocumentEvidenceHint {
  /** DMS document type code (e.g. "TRADE_LICENSE", "VAT_CERTIFICATE"). */
  documentTypeCode: string;
  /** Human-readable label for UI display. */
  label: string;
  /** Optional note explaining why this document is relevant. */
  relevanceNote?: string;
}

// ── Eligible Field Registration ────────────────────────────────────────────────

/**
 * Registers a single field on an entity as eligible for AI suggestions.
 *
 * Only fields with isAiEligible: true appear in the AI prompt.
 * All other fields are silently excluded from suggestions by the validator.
 */
export interface ErpAiEligibleFieldRegistration {
  /** Parent entity type this field belongs to. */
  entityType: ErpAiEntityType;
  /** Database table where this field lives. May be the main table or a child table. */
  targetTable: string;
  /** Database column name. */
  targetField: string;
  /** Human-readable label shown in review UI. */
  fieldLabel: string;
  /** Value type for display and validation. */
  fieldType: ErpAiFieldType;
  /** Document types that are relevant evidence sources for this field. */
  documentTypeHints: string[];
  /** Must always be true — this discriminates registered vs unregistered fields. */
  isAiEligible: true;
  /** Controls how the suggestion may be applied. */
  safetyClassification: ErpAiSafetyClassification;
  /** Optional description explaining what this field represents. */
  description?: string;
  /** Optional hint for the AI about how to extract/format this field value. */
  validationHint?: string;
  /** Max character length for text fields (for truncation in suggestions). */
  maxLength?: number;
  /**
   * Whether AI may suggest a new value when the field already has data.
   * Defaults to false — AI only fills empty fields unless explicitly allowed.
   */
  allowOverwrite?: boolean;
  /**
   * Whether AI may suggest clearing an existing value (suggestedValue = null).
   * Defaults to false.
   */
  allowClear?: boolean;
  /**
   * When true, the AI must cite a specific document ID/file ID as evidence.
   * Suggestions without a sourceDocumentId will be rejected by the validator.
   */
  requiresExactDocumentEvidence?: boolean;
  /**
   * Whether AI may suggest updating FK fields (foreign keys to other DB tables).
   * Must be true for fieldType "fk". Defaults to false — FK fields are denied
   * unless explicitly opted in and safetyClassification is "requires_review".
   */
  allowForeignKeyUpdate?: boolean;
  /**
   * Key identifying the apply handler function to be resolved at Phase 1E.
   * In Phase 1A/1B/1C/1D, this is a string reference only.
   * Example: "apply_owner_company_field", "apply_party_field"
   */
  applyHandlerKey: string;
}

// ── Entity Registry ───────────────────────────────────────────────────────────

/**
 * Describes an ERP entity type that is registered with the Common AI engine.
 * Contains the entity metadata and all registered AI-eligible fields.
 */
export interface ErpAiEntityRegistry {
  /** The entity type code. */
  entityType: ErpAiEntityType;
  /** Human-readable label for UI display. */
  entityLabel: string;
  /** Primary DB table for this entity. */
  targetTable: string;
  /** Primary key column name (must be BIGINT). */
  idField: string;
  /** Column used for human-readable display (e.g. "trade_name", "display_name"). */
  displayField: string;
  /** ERP permission code required to view this entity. */
  viewPermission: string;
  /** ERP permission code required to manage (edit) this entity. */
  managePermission: string;
  /**
   * Implementation stage:
   * - stage_1: active — organization + party — available for Phase 1C+ generation
   * - stage_2_stub: defined but NOT yet available for generation — branch + site
   */
  stage: "stage_1" | "stage_2_stub";
  /** All AI-eligible field registrations for this entity. */
  fields: ErpAiEligibleFieldRegistration[];
}

// ── Current Record Snapshot ───────────────────────────────────────────────────

/**
 * A snapshot of the current field values of a target record.
 * Passed to the AI prompt as context for what needs filling or correcting.
 * Only registered, AI-eligible fields are included.
 */
export interface ErpAiCurrentRecordSnapshot {
  entityType: ErpAiEntityType;
  entityId: number;
  /** Map of fieldName → current value (null if empty). Sanitized — no sensitive values. */
  fields: Record<string, string | null>;
}

// ── Document Evidence Snippet ─────────────────────────────────────────────────

/**
 * A short evidence snippet extracted from a linked DMS document.
 * Passed to the AI prompt as evidence for field suggestions.
 * Content is strictly capped — full document content never leaves DMS.
 *
 * Extended in COMMON AI.1C with additional metadata fields.
 */
export interface ErpAiDocumentEvidenceSnippet {
  documentId: number;
  fileId?: number;
  /** DMS document number (e.g. DMS-2026-000001). */
  documentNo?: string | null;
  documentTypeCode?: string | null;
  /** Human-readable document type name. */
  documentType?: string | null;
  documentTitle?: string | null;
  /** DMS category name. */
  categoryName?: string | null;
  /** Issue date of the document (YYYY-MM-DD), if available. */
  issueDate?: string | null;
  /** Expiry date of the document (YYYY-MM-DD), if available. */
  expiryDate?: string | null;
  /** AI risk level from DMS intelligence (e.g. "low", "medium", "high", "critical"). */
  riskLevel?: string | null;
  /** DMS completeness score 0–1. */
  completenessScore?: number | null;
  /**
   * Which source was used to populate contentSnippet:
   * - ai_summary: from dms_documents.ai_summary
   * - content_text: from dms_document_content.content_text (capped)
   * - ocr_text: from dms_document_files.ocr_text (capped)
   * - metadata: title + description only (no content available)
   */
  sourceKind: "ai_summary" | "content_text" | "ocr_text" | "metadata";
  /** Short excerpt of relevant content, max 500 chars. Never full OCR text. */
  contentSnippet: string;
  /** AI summary of the document, max 500 chars. (Legacy field — kept for prompt-builder compatibility) */
  aiSummarySnippet?: string | null;
}

// ── Field Suggestion Draft ────────────────────────────────────────────────────

/**
 * A single field suggestion produced by the AI, validated and sanitized.
 * This is the in-memory representation before Phase 1B DB persistence.
 */
export interface ErpAiFieldSuggestionDraft {
  targetField: string;
  fieldLabel: string;
  fieldType: ErpAiFieldType;
  /** Current value in the DB (null if empty). Sanitized. */
  currentValue: string | null;
  /** Suggested new value as string. Null means "clear this field". */
  suggestedValue: string | null;
  /** For JSON/FK fields, the raw parsed suggested value. */
  suggestedValueJson?: unknown;
  suggestionType: ErpAiSuggestionType;
  /** Confidence score 0–1. */
  confidenceScore: number;
  /** Source DMS document ID for evidence traceability. */
  sourceDocumentId?: number;
  /** Source DMS file ID for evidence traceability. */
  sourceFileId?: number;
  /** Document type code of the source document. */
  sourceDocumentType?: string;
  /** Short verbatim excerpt from the source document. Max 500 chars. */
  sourceExcerpt?: string;
  /** AI explanation for this suggestion. Max 1000 chars. */
  aiReason?: string;
}

// ── Suggestion Generation Input ───────────────────────────────────────────────

/**
 * Input to the AI suggestion generation pipeline (Phases 1C–1D).
 * All content is sanitized — no raw OCR, no full document text.
 */
export interface ErpAiSuggestionGenerationInput {
  entityType: ErpAiEntityType;
  entityId: number;
  promptVersion: string;
  /** Sanitized current values of registered AI-eligible fields only. */
  currentRecord: ErpAiCurrentRecordSnapshot;
  /** Registered field definitions — defines what the AI may suggest. */
  registeredFields: ErpAiEligibleFieldRegistration[];
  /** Evidence from linked DMS documents (capped snippets only). */
  evidenceSnippets: ErpAiDocumentEvidenceSnippet[];
}

// ── Suggestion Generation Output ──────────────────────────────────────────────

/**
 * The validated output from a Common AI suggestion generation run.
 * Produced by the output validator after AI response parsing.
 */
export interface ErpAiSuggestionGenerationOutput {
  entityType: ErpAiEntityType;
  entityId: number;
  promptVersion: string;
  suggestions: ErpAiFieldSuggestionDraft[];
  /** Total number of suggestions before filtering (for diagnostics). */
  rawSuggestionCount: number;
  /** Warnings from the validation step. */
  warnings: string[];
}

// ── Registry Lookup Result ────────────────────────────────────────────────────

/**
 * Result of looking up an entity registry, including validation status.
 */
export interface ErpAiRegistryLookupResult {
  registry: ErpAiEntityRegistry | null;
  found: boolean;
  /** True if stage_1 and available for generation. */
  isActiveStage: boolean;
  error?: string;
}
