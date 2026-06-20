/**
 * ERP COMMON AI.1C — Evidence Sanitizer
 *
 * Text sanitization and capping helpers for DMS document evidence.
 * Used by the evidence loader before assembling ErpAiDocumentEvidenceSnippet[].
 *
 * Rules:
 * - Never log input or output.
 * - Never include API keys, secrets, or personal data beyond what's already in DMS.
 * - All caps enforced via ERP_COMMON_AI_* constants.
 * - Remove control characters and excessive whitespace.
 */

import {
  ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS,
  ERP_COMMON_AI_MAX_EVIDENCE_CONTENT_CHARS,
} from "../constants";

// ── Control character regex (excludes normal whitespace) ──────────────────────

const CONTROL_CHAR_PATTERN = /[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g;
const EXCESSIVE_WHITESPACE_PATTERN = /[ \t]{2,}/g;
const EXCESS_NEWLINES_PATTERN = /\n{3,}/g;

// ── Sanitize raw text ─────────────────────────────────────────────────────────

/**
 * Sanitizes a raw text string:
 * - Removes control characters
 * - Collapses excessive whitespace
 * - Collapses excessive newlines (max 2 consecutive)
 * - Trims
 *
 * Does not cap length — call with a cap function for that.
 */
export function sanitizeEvidenceText(text: string): string {
  return text
    .replace(CONTROL_CHAR_PATTERN, "")
    .replace(EXCESSIVE_WHITESPACE_PATTERN, " ")
    .replace(EXCESS_NEWLINES_PATTERN, "\n\n")
    .trim();
}

/**
 * Sanitizes and caps text to `maxChars` characters.
 * Returns null if input is null/undefined/empty after sanitization.
 *
 * @param input - Raw text string (may be null/undefined).
 * @param maxChars - Maximum characters to return. Defaults to MAX_EVIDENCE_SNIPPET_CHARS.
 */
export function sanitizeAndCapText(
  input: string | null | undefined,
  maxChars: number = ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS
): string | null {
  if (!input || typeof input !== "string") return null;
  const cleaned = sanitizeEvidenceText(input);
  if (!cleaned) return null;
  return cleaned.length > maxChars ? cleaned.slice(0, maxChars) : cleaned;
}

// ── Evidence snippet builder ──────────────────────────────────────────────────

/**
 * Builds a contentSnippet from available document text sources.
 * Applies priority ordering:
 *   1. AI summary (if complete and not redacted)
 *   2. DMS content_text excerpt
 *   3. OCR text excerpt
 *   4. Title + description metadata only
 *
 * Returns the snippet and which source was used.
 */
export function buildContentSnippet(input: {
  aiSummary: string | null | undefined;
  contentText: string | null | undefined;
  ocrText: string | null | undefined;
  title: string | null | undefined;
  description: string | null | undefined;
  maxSnippetChars?: number;
  maxContentChars?: number;
}): {
  contentSnippet: string;
  aiSummarySnippet: string | null;
  sourceKind: "ai_summary" | "content_text" | "ocr_text" | "metadata";
} {
  const snippetCap = input.maxSnippetChars ?? ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS;
  const contentCap = input.maxContentChars ?? ERP_COMMON_AI_MAX_EVIDENCE_CONTENT_CHARS;

  // AI summary is always capped to snippet limit
  const cleanSummary = sanitizeAndCapText(input.aiSummary, snippetCap);

  // 1. AI summary — primary source
  if (cleanSummary) {
    return {
      contentSnippet: cleanSummary,
      aiSummarySnippet: cleanSummary,
      sourceKind: "ai_summary",
    };
  }

  // 2. Content text excerpt — capped to content limit
  const cleanContent = sanitizeAndCapText(input.contentText, contentCap);
  if (cleanContent) {
    return {
      contentSnippet: cleanContent.slice(0, snippetCap),
      aiSummarySnippet: null,
      sourceKind: "content_text",
    };
  }

  // 3. OCR text excerpt — capped to content limit
  const cleanOcr = sanitizeAndCapText(input.ocrText, contentCap);
  if (cleanOcr) {
    return {
      contentSnippet: cleanOcr.slice(0, snippetCap),
      aiSummarySnippet: null,
      sourceKind: "ocr_text",
    };
  }

  // 4. Metadata fallback — title + description
  const titlePart = sanitizeAndCapText(input.title, 200) ?? "";
  const descPart = sanitizeAndCapText(input.description, 300) ?? "";
  const metaText = [titlePart, descPart].filter(Boolean).join(". ").trim();

  return {
    contentSnippet: metaText.slice(0, snippetCap) || "[No content available]",
    aiSummarySnippet: null,
    sourceKind: "metadata",
  };
}

/** DMS confidentiality levels that require elevated permission. */
export const RESTRICTED_CONFIDENTIALITY_LEVELS: ReadonlySet<string> = new Set([
  "hr",
  "legal",
  "executive",
]);

/**
 * Returns true if the document's confidentiality level is permitted for the user.
 *
 * @param confidentialityLevel - Document confidentiality level string.
 * @param isAdmin - Whether the user has dms.admin or system_admin access.
 */
export function isDocumentEvidenceAllowedForUser(
  confidentialityLevel: string | null | undefined,
  isAdmin: boolean
): boolean {
  if (!confidentialityLevel) return true;
  if (RESTRICTED_CONFIDENTIALITY_LEVELS.has(confidentialityLevel)) {
    return isAdmin;
  }
  return true;
}
