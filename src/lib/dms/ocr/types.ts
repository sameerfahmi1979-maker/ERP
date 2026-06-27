/**
 * DMS.9 — OCR Provider Abstraction Types
 *
 * All OCR providers must implement IOcrProvider.
 * No AI classification or field extraction is performed here — text only.
 */

// ── OCR Status ────────────────────────────────────────────────────────────────

export type OcrStatus =
  | "not_started"
  | "pending"
  | "processing"
  | "complete"
  | "failed"
  | "skipped"
  | "not_supported"
  | "provider_not_configured"
  | "not_required";

// ── Provider codes ─────────────────────────────────────────────────────────────

export type OcrProviderCode =
  | "pdf_text"         // Text-layer extraction from digital PDFs (pdf-parse)
  | "vision"           // GPT-4.1 vision fallback for scanned/image-based documents
  | "tesseract"        // Tesseract OCR (deferred — not implemented in DMS.9)
  | "azure_doc_intel"  // Azure Document Intelligence (deferred)
  | "noop";            // No-op fallback — always returns provider_not_configured

// ── Input / Output ─────────────────────────────────────────────────────────────

export interface OcrInput {
  /** Raw file buffer. */
  buffer: Buffer;
  /** MIME type of the file (e.g. application/pdf, image/png). */
  mimeType: string;
  /** Original file name for diagnostics. */
  fileName: string;
  /** Maximum file size the provider will attempt (bytes). Defaults to 20 MB. */
  maxFileSizeBytes?: number;
}

export interface OcrPage {
  pageNumber: number;
  text: string;
  confidence?: number;
}

export interface OcrResult {
  /** Aggregate text from all pages, joined by newlines. */
  text: string;
  /** Per-page breakdown (optional — providers may omit). */
  pages?: OcrPage[];
  /** Number of pages processed. */
  pageCount?: number;
  /** Aggregate confidence (0.0 – 1.0) if available. */
  confidence?: number;
  /** Detected language code if available (e.g. "en", "ar"). */
  language?: string;
  /** Human-readable provider model/version string. */
  model?: string;
  // ── Phase 10A — OCR router additions (all optional) ────────────────────────
  /** How the document content was classified by the router. */
  sourceKind?: "digital" | "scanned" | "image" | "office" | "unknown";
  /** True when the extracted text was truncated to the storage cap. */
  isTruncated?: boolean;
  /** Safe, non-sensitive warnings (never contain document content). */
  warnings?: string[];
  /** True when Azure failed and GPT-4.1 vision was used as a fallback. */
  fallbackUsed?: boolean;
  /** Internal extraction method identifier (e.g. "pdf-text-layer", "azure-di", "gpt-vision"). */
  method?: string;
}

// ── Provider interface ─────────────────────────────────────────────────────────

export interface IOcrProvider {
  /** Code identifying this provider. */
  readonly providerCode: OcrProviderCode;

  /** Human-readable name for logging / UI. */
  readonly providerName: string;

  /** List of MIME types this provider supports. */
  readonly supportedMimeTypes: string[];

  /** Whether this provider is properly configured and ready to use. */
  isConfigured(): boolean;

  /**
   * Returns true when the given MIME type can be processed.
   * Implementations should NOT throw — return false for unsupported types.
   */
  supports(mimeType: string): boolean;

  /**
   * Extract text from the provided file buffer.
   * Throws on hard failure; returns an OcrResult on success.
   * For graceful no-op, return text = "" and indicate via model/confidence.
   */
  extractText(input: OcrInput): Promise<OcrResult>;
}
