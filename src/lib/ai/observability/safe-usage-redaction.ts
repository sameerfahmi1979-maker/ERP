/**
 * ERP DMS AI Phase 14 — Safe Usage Redaction Helper
 *
 * Strips sensitive keys from AI usage metadata before storage or display.
 * Never allows prompts, responses, OCR text, vectors, API keys, or secrets
 * to pass into erp_ai_usage_logs.metadata_json.
 *
 * Security rules:
 *   - BLOCKED_KEYS list covers all known sensitive field names.
 *   - Recursive sanitization with max depth 2.
 *   - String values capped at 500 chars for metadata.
 *   - Error messages capped at 200 chars; stack traces stripped.
 */

// ── Blocked keys ──────────────────────────────────────────────────────────────

const BLOCKED_KEYS = new Set([
  "prompt",
  "raw_prompt",
  "system_prompt",
  "user_prompt",
  "messages",
  "raw_response",
  "response_text",
  "completion_text",
  "ocr_text",
  "content_text",
  "chunk_text",
  "full_text",
  "text",
  "api_key",
  "secret",
  "password",
  "token",
  "bearer",
  "embedding",
  "vector",
  "embeddings",
  "provider_response",
  "raw_content",
  "transcription",
  "full_transcription",
  "full_text_transcription",
]);

// ── buildSafeMetadata ─────────────────────────────────────────────────────────

/**
 * Strips blocked keys from a metadata object.
 * Sanitizes recursively up to maxDepth=2.
 * Returns null if input is null/undefined.
 */
export function buildSafeMetadata(
  input: Record<string, unknown> | null | undefined,
  _depth = 0
): Record<string, unknown> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;

  const MAX_DEPTH = 2;
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(input)) {
    // Drop blocked keys entirely
    if (BLOCKED_KEYS.has(key.toLowerCase())) continue;

    if (value === null || value === undefined) {
      result[key] = value;
    } else if (typeof value === "string") {
      result[key] = value.slice(0, 500);
    } else if (typeof value === "number" || typeof value === "boolean") {
      result[key] = value;
    } else if (typeof value === "object" && !Array.isArray(value) && _depth < MAX_DEPTH) {
      const nested = buildSafeMetadata(value as Record<string, unknown>, _depth + 1);
      if (nested !== null) result[key] = nested;
    } else if (Array.isArray(value)) {
      // Allow simple arrays of primitives (e.g. string codes, numbers)
      if (value.every((v) => typeof v === "string" || typeof v === "number" || typeof v === "boolean")) {
        result[key] = value.slice(0, 20);
      }
      // Drop arrays of objects
    }
    // Drop all other complex values silently
  }

  return Object.keys(result).length > 0 ? result : null;
}

// ── sanitizeErrorMessage ──────────────────────────────────────────────────────

/**
 * Returns a safe, capped error message (max 200 chars).
 * Strips stack traces and known sensitive patterns.
 */
export function sanitizeErrorMessage(error: unknown): string | null {
  if (!error) return null;

  let msg: string;
  if (error instanceof Error) {
    msg = error.message ?? String(error);
  } else if (typeof error === "string") {
    msg = error;
  } else {
    msg = String(error);
  }

  // Strip stack trace lines
  msg = msg.split("\n")[0] ?? msg;

  // Strip anything that looks like an API key or secret
  msg = msg.replace(/sk-[A-Za-z0-9-_]{10,}/g, "[REDACTED]");
  msg = msg.replace(/Bearer [A-Za-z0-9-_.]{10,}/gi, "Bearer [REDACTED]");
  msg = msg.replace(/password=\S+/gi, "password=[REDACTED]");
  msg = msg.replace(/api[_-]?key[=:]\s*\S+/gi, "api_key=[REDACTED]");

  return msg.slice(0, 200);
}

// ── extractSafeUsageDisplayFields ─────────────────────────────────────────────

/**
 * Extracts safe display fields from a usage log's metadata_json.
 * Only returns known-safe fields. Never returns text content.
 */
export function extractSafeUsageDisplayFields(metadataJson: unknown): {
  documentId?: number;
  promptVersion?: string;
  inputCharCount?: number;
  outputCharCount?: number;
  inputTruncated?: boolean;
  source?: string;
  chunkCount?: number;
  embeddedCount?: number;
  failedCount?: number;
  resultCount?: number;
} {
  if (!metadataJson || typeof metadataJson !== "object" || Array.isArray(metadataJson)) {
    return {};
  }

  const m = metadataJson as Record<string, unknown>;
  const result: ReturnType<typeof extractSafeUsageDisplayFields> = {};

  if (typeof m.document_id === "number") result.documentId = m.document_id;
  if (typeof m.prompt_version === "string") result.promptVersion = m.prompt_version.slice(0, 50);
  if (typeof m.input_char_count === "number") result.inputCharCount = m.input_char_count;
  if (typeof m.output_char_count === "number") result.outputCharCount = m.output_char_count;
  if (typeof m.input_truncated === "boolean") result.inputTruncated = m.input_truncated;
  if (typeof m.source === "string") result.source = m.source.slice(0, 50);
  if (typeof m.chunk_count === "number") result.chunkCount = m.chunk_count;
  if (typeof m.embedded_count === "number") result.embeddedCount = m.embedded_count;
  if (typeof m.failed_count === "number") result.failedCount = m.failed_count;
  if (typeof m.result_count === "number") result.resultCount = m.result_count;

  return result;
}
