/**
 * DMS 12.1 — Content Text Utilities
 *
 * Server-side only. Normalisation, capping, and SHA-256 hashing of document content text.
 * Never import into client components.
 */

import { createHash } from "crypto";

/** Hard cap: first 100,000 characters only. */
export const CONTENT_TEXT_MAX_CHARS = 100_000;

/** Separator inserted between file sections in multi-file documents. */
export function contentTextFileSeparator(filename: string): string {
  return `\n\n--- [File: ${filename}] ---\n\n`;
}

/** Normalise line endings. */
export function normalizeDmsContentText(text: string): string {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
}

/**
 * Cap extracted text to CONTENT_TEXT_MAX_CHARS characters.
 * Returns the capped text and whether it was truncated.
 */
export function capDmsContentText(text: string): {
  text: string;
  isTruncated: boolean;
} {
  const normalized = normalizeDmsContentText(text);
  if (normalized.length <= CONTENT_TEXT_MAX_CHARS) {
    return { text: normalized, isTruncated: false };
  }
  return { text: normalized.slice(0, CONTENT_TEXT_MAX_CHARS), isTruncated: true };
}

/** SHA-256 hex digest of the stored text. */
export function sha256Text(text: string): string {
  return createHash("sha256").update(text, "utf8").digest("hex");
}
