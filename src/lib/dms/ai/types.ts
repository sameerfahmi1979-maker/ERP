/**
 * DMS.10 — AI Document Classification & Extraction Types
 *
 * All DMS AI providers must implement IDmsAiProvider.
 * Results are always SUGGESTIONS — never auto-saved.
 */

// ── Confidence ────────────────────────────────────────────────────────────────

export type ConfidenceLabel = "high" | "medium" | "low" | "needs_manual_review";

export function confidenceLabelFromScore(score: number): ConfidenceLabel {
  if (score >= 0.85) return "high";
  if (score >= 0.65) return "medium";
  if (score >= 0.40) return "low";
  return "needs_manual_review";
}

// ── Classification ────────────────────────────────────────────────────────────

export interface DmsClassificationResult {
  suggestedTypeCode: string | null;
  suggestedTypeId: number | null;
  confidenceScore: number;
  confidenceLabel: ConfidenceLabel;
  reason: string;
}

// ── Field extraction ─────────────────────────────────────────────────────────

export interface DmsExtractedField {
  fieldCode: string;
  value: string;
  confidenceScore: number;
  confidenceLabel: ConfidenceLabel;
  sourceSnippet?: string | null;
}

export interface DmsAdditionalField {
  label: string;
  value: string;
  confidenceScore: number;
}

export interface DmsExtractionResult {
  fields: DmsExtractedField[];
  /** Any extra data read from the document beyond the requested metadata list. */
  additionalFields: DmsAdditionalField[];
  suggestedTitle: string | null;
  suggestedDescription: string | null;
  /** Extracted issue/start date from the document (YYYY-MM-DD). */
  issueDateSuggestion: string | null;
  /** Extracted expiry/end date from the document (YYYY-MM-DD). */
  expiryDateSuggestion: string | null;
}

/** A person/company/organization detected in the document, for DB matching. */
export interface DmsDetectedEntity {
  entityType: string;
  name: string;
  nameAr: string | null;
  identifier: string | null;
  role: string | null;
}

// ── Suggested links ───────────────────────────────────────────────────────────

export interface DmsSuggestedLink {
  entityType: string;
  entityId: number | null;
  entityName: string | null;
  confidenceScore: number;
  reason: string;
}

// ── Combined AI output ────────────────────────────────────────────────────────

export interface DmsAiOutput {
  classification: DmsClassificationResult;
  extraction: DmsExtractionResult;
  suggestedLinks: DmsSuggestedLink[];
  /** Persons/companies detected in the document, for matching against ERP records. */
  detectedEntities: DmsDetectedEntity[];
  warnings: string[];
  rawResponse?: Record<string, unknown>;
}

// ── AI Status ─────────────────────────────────────────────────────────────────

export type DmsAiJobStatus =
  | "pending"
  | "processing"
  | "complete"
  | "failed"
  | "skipped"
  | "provider_not_configured";

// ── Input ─────────────────────────────────────────────────────────────────────

export interface DmsAiDocumentTypeCandidate {
  typeCode: string;
  nameEn: string;
  description: string | null;
  categoryName: string | null;
}

export interface DmsAiMetadataField {
  fieldCode: string;
  labelEn: string;
  fieldType: string;
  isRequired: boolean;
  aiFieldHint: string | null;
  optionsJson: unknown | null;
}

/** An image file passed directly to an AI vision model for OCR + extraction. */
export interface DmsAiImageFile {
  /** Original file name (for context in the prompt). */
  fileName: string;
  /** Base64-encoded file content (no data-URI prefix). */
  base64: string;
  /** MIME type: image/jpeg | image/png | image/webp | image/gif */
  mimeType: string;
}

export interface DmsAiInput {
  /**
   * Combined text extracted from PDF files (may be empty when all content
   * is image-based and sent via imageFiles instead).
   */
  ocrText: string;
  /**
   * Image files sent directly to a vision model for OCR + extraction.
   * Used when files are images or scanned PDFs with no text layer.
   */
  imageFiles: DmsAiImageFile[];
  /** Current document type code (may be null if not yet classified). */
  currentTypeCode: string | null;
  /** Active document type candidates for classification. */
  typeCandidates: DmsAiDocumentTypeCandidate[];
  /** Metadata fields to extract (from current or suggested type). */
  metadataFields: DmsAiMetadataField[];
  /** Original filename — used as a classification hint (e.g. "sameer_EID_3028.pdf"). */
  originalFilename?: string;
}

// ── Summary ───────────────────────────────────────────────────────────────────

/** Output of a document summarisation call (DMS 12.2). */
export interface DmsSummaryOutput {
  summary: string;
  model: string | null;
  /** Token counts for AI usage logging — may be undefined if not returned by provider. */
  promptTokens?: number;
  completionTokens?: number;
}

// ── Embedding output (DMS 12.5) ────────────────────────────────────────────────

/**
 * Output of a text-embedding call (DMS 12.5).
 * `embedding` is a dense float vector (1536 dims for text-embedding-3-small).
 */
export interface DmsEmbeddingOutput {
  embedding: number[];
  model: string;
  inputTokenCount?: number | null;
}

// ── Structured completion output (DMS 12.4) ───────────────────────────────────

/**
 * Generic structured JSON completion output.
 * Used by ai-search, document-qa, ai-tags, ai-links.
 * The caller is responsible for parsing/validating the rawJson string.
 */
export interface DmsStructuredCompletionOutput {
  rawJson: string;
  model: string | null;
  promptTokens?: number;
  completionTokens?: number;
}

// ── AI Search Types (DMS 12.4) ────────────────────────────────────────────────

export interface DmsSearchIntent {
  keywords: string[];
  document_type_hint: string | null;
  category_hint: string | null;
  person_name_hint: string | null;
  party_name_hint: string | null;
  date_from: string | null;
  date_to: string | null;
  expiry_state: "expired" | "expiring_soon" | "valid" | null;
  outcome_hint: string | null;
  risk_hint: "high" | "medium" | "low" | null;
  metadata_filters: Array<{ field_code: string; value: string }>;
  confidentiality_max:
    | "internal"
    | "company"
    | "finance"
    | "hr"
    | "legal"
    | "executive"
    | null;
}

export interface DmsAiSearchResult {
  documentId: number;
  documentNo: string;
  title: string;
  aiSummarySnippet: string | null;
  contentSnippet: string | null;
  matchReason: string;
  riskLevel: string | null;
  completenessScore: number | null;
  expiryDate: string | null;
}

// ── Semantic Search Types (DMS 12.5) ──────────────────────────────────────────

export interface DmsSemanticSearchResult {
  documentId: number;
  documentNo: string;
  title: string;
  aiSummarySnippet: string | null;
  /** Cosine similarity 0..1 (higher = closer). */
  similarity: number;
  riskLevel: string | null;
  completenessScore: number | null;
  expiryDate: string | null;
  matchReason: string;
}

export type DmsEmbeddingStatus =
  | "pending"
  | "complete"
  | "failed"
  | "skipped"
  | "not_required";

export interface DmsDocumentEmbeddingStatusRow {
  documentId: number;
  status: DmsEmbeddingStatus | null;
  model: string | null;
  source: "ai_summary" | "content_text" | null;
  updatedAt: string | null;
  error: string | null;
  hasEmbedding: boolean;
}

// ── Document Q&A Types (DMS 12.4) ─────────────────────────────────────────────

export interface DmsDocumentQuestionAnswer {
  answer: string;
  confidence: "high" | "medium" | "low";
  sourceUsed: "content_text" | "ai_summary" | "metadata" | "not_found";
}

// ── Tag/Link Suggestion Types (DMS 12.4) ──────────────────────────────────────

export interface DmsTagSuggestion {
  tagId: number | null;
  tagName: string;
  confidence: number;
  reason: string;
}

export interface DmsLinkSuggestion {
  entityType: "party" | "employee" | "vehicle" | "equipment" | "project" | "contract" | string;
  entityId: number | null;
  entityName: string | null;
  confidence: number;
  reason: string;
}

// ── Provider interface ────────────────────────────────────────────────────────

export interface IDmsAiProvider {
  readonly providerCode: string;
  readonly providerName: string;
  readonly modelId: string | null;
  isConfigured(): boolean;
  analyze(input: DmsAiInput): Promise<DmsAiOutput>;
  /**
   * Generate a plain-text summary from a structured prompt.
   * DMS 12.2 — called by generateAndSaveDmsAiSummary.
   * Must return plain text only (no JSON, no markdown).
   */
  summarize(systemPrompt: string, userMessage: string): Promise<DmsSummaryOutput>;
  /**
   * Generic structured JSON completion — DMS 12.4.
   * Returns raw JSON string; caller validates against a Zod schema.
   * Uses response_format: json_object.
   */
  callStructuredCompletion(
    systemPrompt: string,
    userMessage: string,
    opts?: { maxTokens?: number; temperature?: number }
  ): Promise<DmsStructuredCompletionOutput>;
  /**
   * Generate a dense embedding vector for the given text — DMS 12.5.
   * Used for semantic similarity search over AI summaries.
   * Must never log the input text. Returns a 1536-dim vector for the
   * default text-embedding-3-small model.
   */
  embedText(
    input: string,
    options?: { model?: string }
  ): Promise<DmsEmbeddingOutput>;
}
