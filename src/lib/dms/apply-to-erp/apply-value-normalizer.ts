/**
 * ERP DMS AI Phase 16 — Apply Value Normalizer
 *
 * Normalizes, validates, and safely summarizes values for Apply-to-ERP.
 *
 * Safety rules:
 *   - Summaries max 200 chars
 *   - date must be ISO YYYY-MM-DD
 *   - bigint fields must be positive integers
 *   - title max 200, description max 500, text max 2000
 *   - expiry_date cannot be before issue_date when both are provided
 *   - Sensitive field patterns are masked
 *   - No raw OCR/content/prompt/AI response returned
 *   - TRN (tax_registration_number) summaries masked: first4****last4
 */

import type { ApplyValueType } from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

const SUMMARY_MAX_CHARS  = 200;
const TITLE_MAX_CHARS    = 200;
const DESC_MAX_CHARS     = 500;
const TEXT_META_MAX_CHARS = 2000;

const ISO_DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

// Fields that require full masking in summaries
const SENSITIVE_FIELD_CODES = new Set([
  "iban", "account_number", "password", "salary", "basic_salary",
  "total_salary", "api_key", "secret", "token", "raw_response",
  "ocr_text", "content_text", "chunk_text", "embedding",
]);

// Fields that require partial TRN-style masking (first4****last4)
const TRN_FIELD_CODES = new Set([
  "tax_registration_number", "trn", "tax_registration",
]);

// ── Normalization result ───────────────────────────────────────────────────────

export type NormalizeResult =
  | { valid: true;  normalizedValue: unknown; validationError: null }
  | { valid: false; normalizedValue: null;    validationError: string };

// ── maskTrnSummary ─────────────────────────────────────────────────────────────

/**
 * Mask a TRN (Tax Registration Number) for display in summaries/audit.
 * - Length <= 8: return "****"
 * - Length > 8: first 4 chars + "****" + last 4 chars
 */
export function maskTrnSummary(value: string): string {
  if (!value) return "****";
  const cleaned = value.trim();
  if (cleaned.length <= 8) return "****";
  return cleaned.slice(0, 4) + "****" + cleaned.slice(-4);
}

// ── normalizeApplyValue ───────────────────────────────────────────────────────

/**
 * Normalize and validate a raw value for a given target field.
 *
 * @param rawValue    - raw AI-suggested value
 * @param valueType   - declared value type
 * @param targetField - column name (used for length limits)
 * @param extraContext - optional: { issueDate, maxLength } for ordering checks and party fields
 */
export function normalizeApplyValue(
  rawValue: unknown,
  valueType: ApplyValueType,
  targetField: string,
  extraContext?: { issueDate?: string | null; maxLength?: number | null }
): NormalizeResult {
  if (rawValue === null || rawValue === undefined || rawValue === "") {
    return { valid: false, normalizedValue: null, validationError: "value is null or empty" };
  }

  switch (valueType) {
    case "text": {
      const str = String(rawValue).trim();
      if (!str) {
        return { valid: false, normalizedValue: null, validationError: "text value is empty after trim" };
      }
      let maxLen: number;
      if (extraContext?.maxLength != null) {
        maxLen = extraContext.maxLength;
      } else if (targetField === "title") {
        maxLen = TITLE_MAX_CHARS;
      } else if (targetField === "description") {
        maxLen = DESC_MAX_CHARS;
      } else {
        maxLen = TEXT_META_MAX_CHARS;
      }
      if (str.length > maxLen) {
        return { valid: false, normalizedValue: null, validationError: `text value exceeds max ${maxLen} chars` };
      }
      return { valid: true, normalizedValue: str, validationError: null };
    }

    case "date": {
      const str = String(rawValue).trim();
      if (!ISO_DATE_REGEX.test(str)) {
        return { valid: false, normalizedValue: null, validationError: `date value "${str}" is not ISO YYYY-MM-DD` };
      }
      const dateMs = Date.parse(str);
      if (isNaN(dateMs)) {
        return { valid: false, normalizedValue: null, validationError: `date value "${str}" is not a valid date` };
      }
      // Expiry date ordering: expiry must not be before issue_date
      if (targetField === "expiry_date" && extraContext?.issueDate) {
        const issueMs = Date.parse(extraContext.issueDate);
        if (!isNaN(issueMs) && dateMs < issueMs) {
          return {
            valid: false,
            normalizedValue: null,
            validationError: `expiry_date ${str} is before issue_date ${extraContext.issueDate}`,
          };
        }
      }
      return { valid: true, normalizedValue: str, validationError: null };
    }

    case "number": {
      const num = Number(rawValue);
      if (isNaN(num)) {
        return { valid: false, normalizedValue: null, validationError: `value "${rawValue}" is not a valid number` };
      }
      return { valid: true, normalizedValue: num, validationError: null };
    }

    case "boolean": {
      if (typeof rawValue === "boolean") {
        return { valid: true, normalizedValue: rawValue, validationError: null };
      }
      const str = String(rawValue).toLowerCase().trim();
      if (str === "true" || str === "1" || str === "yes") {
        return { valid: true, normalizedValue: true, validationError: null };
      }
      if (str === "false" || str === "0" || str === "no") {
        return { valid: true, normalizedValue: false, validationError: null };
      }
      return { valid: false, normalizedValue: null, validationError: `value "${rawValue}" is not a valid boolean` };
    }

    case "bigint": {
      const num = typeof rawValue === "bigint" ? Number(rawValue) : Number(rawValue);
      if (isNaN(num) || !Number.isInteger(num)) {
        return { valid: false, normalizedValue: null, validationError: `value "${rawValue}" is not a valid integer` };
      }
      if (num <= 0) {
        return { valid: false, normalizedValue: null, validationError: `bigint FK value must be positive integer, got ${num}` };
      }
      return { valid: true, normalizedValue: num, validationError: null };
    }

    default:
      return { valid: false, normalizedValue: null, validationError: `unknown valueType "${valueType}"` };
  }
}

// ── buildValueSummary ─────────────────────────────────────────────────────────

/**
 * Build a safe, truncated summary string for storage in apply history.
 * Max 200 chars. Never stores raw content.
 */
export function buildValueSummary(
  value: unknown,
  valueType: ApplyValueType
): string | null {
  if (value === null || value === undefined) return null;

  let str: string;
  switch (valueType) {
    case "text":
      str = String(value);
      break;
    case "date":
      str = String(value);
      break;
    case "number":
    case "bigint":
      str = String(value);
      break;
    case "boolean":
      str = value ? "true" : "false";
      break;
    default:
      str = String(value);
  }

  return str.length > SUMMARY_MAX_CHARS
    ? str.slice(0, SUMMARY_MAX_CHARS - 3) + "..."
    : str;
}

// ── maskSensitiveSummary ──────────────────────────────────────────────────────

/**
 * Mask a summary if the fieldCode matches a sensitive pattern.
 * - TRN fields: masked with first4****last4
 * - Fully sensitive fields: [masked: type]
 * Defense-in-depth — forbidden patterns should never reach allowlist.
 */
export function maskSensitiveSummary(
  fieldCode: string,
  value: unknown
): string | null {
  const lower = fieldCode.toLowerCase();

  // TRN / tax_registration_number: partial masking
  for (const trnField of TRN_FIELD_CODES) {
    if (lower.includes(trnField)) {
      return maskTrnSummary(String(value ?? ""));
    }
  }

  // Fully sensitive: full mask
  for (const sensitive of SENSITIVE_FIELD_CODES) {
    if (lower.includes(sensitive)) {
      return `[masked: ${typeof value}]`;
    }
  }
  return buildValueSummary(value, "text");
}

/**
 * Build a safe summary for a Party child record field.
 * Applies TRN masking for tax_registration_number fields.
 */
export function buildPartyFieldSummary(
  fieldCode: string,
  value: unknown,
  valueType: "text" | "date"
): string | null {
  if (value === null || value === undefined || value === "") return null;
  const lower = fieldCode.toLowerCase();

  // TRN masking for tax registration number
  for (const trnField of TRN_FIELD_CODES) {
    if (lower.includes(trnField)) {
      return maskTrnSummary(String(value));
    }
  }

  return buildValueSummary(value, valueType);
}

// ── truncateSummary ────────────────────────────────────────────────────────────

/** Enforce max 200 char summary at any output boundary. */
export function truncateSummary(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.length > SUMMARY_MAX_CHARS
    ? value.slice(0, SUMMARY_MAX_CHARS - 3) + "..."
    : value;
}
