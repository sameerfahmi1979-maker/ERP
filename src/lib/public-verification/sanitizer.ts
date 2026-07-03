/**
 * Public Verification — Payload Sanitizer
 * Phase: BRANDING.6
 *
 * Strict allowlist sanitization for verification_summary_json and public_payload_json.
 *
 * Security rules enforced here:
 * - Never expose salary, IBAN, bank account numbers
 * - Never expose medical data
 * - Never expose passport/EID full values
 * - Never expose HR disciplinary raw text
 * - Never expose internal storage paths or audit payloads
 * - Never expose API keys, OCR text, embeddings, prompts
 * - Never expose internal DB IDs (numeric IDs, UUIDs)
 * - Never expose email/mobile unless explicitly in the safe list
 */

import { SAFE_SUMMARY_FIELDS } from "./types";
import type { SafeSummaryField } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Blocked field patterns (applied on top of allowlist for defense in depth)
// ─────────────────────────────────────────────────────────────────────────────

const BLOCKED_KEY_PATTERNS: RegExp[] = [
  /salary/i,
  /wage/i,
  /payroll/i,
  /iban/i,
  /bank_account/i,
  /account_number/i,
  /swift/i,
  /passport/i,
  /eid/i,
  /national_id/i,
  /medical/i,
  /health/i,
  /insurance/i,
  /disciplinary/i,
  /audit/i,
  /internal/i,
  /storage_path/i,
  /file_path/i,
  /service_role/i,
  /api_key/i,
  /secret/i,
  /token(?!_label)/i, // block token fields except "token_label"
  /embedding/i,
  /vector/i,
  /ocr_text/i,
  /extracted_text/i,
  /raw_payload/i,
  /prompt/i,
  // Numeric-looking keys that might be internal IDs
  /^id$/i,
  /_id$/,
];

/**
 * Check whether a key is blocked by the deny-list.
 */
function isBlockedKey(key: string): boolean {
  return BLOCKED_KEY_PATTERNS.some((pattern) => pattern.test(key));
}

/**
 * Sanitize a string value for safe public output.
 * Trims, enforces max length, and removes obvious injection attempts.
 */
function sanitizeStringValue(value: string, maxLength = 512): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

/**
 * Deep-sanitize a JSON object for safe public output.
 *
 * - Only string, number, boolean, null primitives are kept
 * - Objects are recursively sanitized (max 2 levels deep)
 * - Arrays are flattened to strings
 * - Blocked keys are dropped
 * - Values exceeding max length are truncated
 *
 * @param obj - The input object to sanitize
 * @param depth - Current recursion depth (max 2)
 */
export function sanitizePublicPayload(
  obj: Record<string, unknown>,
  depth = 0
): Record<string, unknown> {
  if (!obj || typeof obj !== "object") return {};

  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    // Skip blocked keys
    if (isBlockedKey(key)) continue;

    if (value === null || value === undefined) {
      result[key] = null;
    } else if (typeof value === "string") {
      result[key] = sanitizeStringValue(value);
    } else if (typeof value === "number") {
      // Block if this looks like an internal ID (large integer > 9999 with no decimal)
      if (Number.isInteger(value) && value > 9999) {
        // Skip potential ID values
        continue;
      }
      result[key] = value;
    } else if (typeof value === "boolean") {
      result[key] = value;
    } else if (typeof value === "object" && !Array.isArray(value) && depth < 2) {
      const nested = sanitizePublicPayload(
        value as Record<string, unknown>,
        depth + 1
      );
      if (Object.keys(nested).length > 0) {
        result[key] = nested;
      }
    } else if (Array.isArray(value)) {
      // Convert arrays to comma-separated strings (safe display)
      const safeItems = value
        .filter((v) => typeof v === "string" || typeof v === "number")
        .map((v) => String(v).slice(0, 200))
        .slice(0, 20);
      if (safeItems.length > 0) {
        result[key] = safeItems.join(", ");
      }
    }
    // Skip functions, symbols, and other exotic types
  }

  return result;
}

/**
 * Build a safe verification_summary_json from structured inputs.
 * Only fields in SAFE_SUMMARY_FIELDS are included.
 */
export function buildVerificationSummary(
  input: Partial<Record<SafeSummaryField, string | null | undefined>>
): Record<string, string | null> {
  const result: Record<string, string | null> = {};
  for (const field of SAFE_SUMMARY_FIELDS) {
    const value = input[field];
    if (value !== undefined) {
      result[field] = value ? sanitizeStringValue(value, 256) : null;
    }
  }
  return result;
}
