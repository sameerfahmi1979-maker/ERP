/**
 * ERP DMS AI Phase 17 — Correction Value Builder
 *
 * Validates, normalizes, and safely builds correction values.
 *
 * Safety rules:
 *   - Scalar only: { v: string | number | boolean }
 *   - No arrays, no nested objects
 *   - No raw OCR/content/prompt/AI response
 *   - No sensitive field patterns (iban, account_number, api_key, etc.)
 *   - TRN fields get partial masking in summary: first4****last4
 *   - Summary max 200 chars
 *   - Reuses normalizeApplyValue() from Phase 16 for type normalization
 */

import { normalizeApplyValue, type NormalizeResult } from "@/lib/dms/apply-to-erp/apply-value-normalizer";
import type { ApplyValueType } from "@/lib/dms/apply-to-erp/types";
import type { CorrectionScalarValue } from "./types";

// ── Constants ─────────────────────────────────────────────────────────────────

const SUMMARY_MAX = 200;

const FORBIDDEN_FIELD_CODES = new Set([
  "ocr_text", "content_text", "chunk_text", "embedding", "raw_response",
  "ai_response", "prompt_text", "model_output", "password", "api_key",
  "secret", "token",
]);

const TRN_FIELD_CODES = new Set([
  "tax_registration_number", "trn", "tax_registration",
]);

const SENSITIVE_FIELD_CODES = new Set([
  "iban", "account_number", "salary", "basic_salary", "total_salary",
]);

// ── Build result ──────────────────────────────────────────────────────────────

export type BuildCorrectionValueResult =
  | {
      ok: true;
      correctionValueJson: CorrectionScalarValue;
      proposedCorrectionSummary: string;
    }
  | { ok: false; error: string };

// ── Public: buildCorrectionValue ─────────────────────────────────────────────

/**
 * Validate and normalize a human-entered correction value.
 *
 * @param rawValue   - the user-entered string (always a string from UI inputs)
 * @param valueType  - expected type for the field
 * @param fieldCode  - the target field name (for sensitivity checks)
 */
export function buildCorrectionValue(
  rawValue: string | number | boolean | null | undefined,
  valueType: ApplyValueType,
  fieldCode: string
): BuildCorrectionValueResult {
  // ── Reject forbidden field codes ──────────────────────────────────────────
  const lowerField = fieldCode.toLowerCase();
  if (FORBIDDEN_FIELD_CODES.has(lowerField)) {
    return {
      ok: false,
      error: `Field '${fieldCode}' cannot be a correction target.`,
    };
  }

  // ── Reject null/empty ─────────────────────────────────────────────────────
  if (rawValue == null || rawValue === "") {
    return {
      ok: false,
      error: "Correction value cannot be empty.",
    };
  }

  // ── Reject arrays and objects ─────────────────────────────────────────────
  if (typeof rawValue === "object") {
    return {
      ok: false,
      error: "Correction value must be a scalar (string, number, or boolean). Arrays and objects are not allowed.",
    };
  }

  // ── Normalize using Phase 16 normalizer ───────────────────────────────────
  const normalizeResult: NormalizeResult = normalizeApplyValue(String(rawValue), valueType, fieldCode);

  if (!normalizeResult.valid) {
    return {
      ok: false,
      error: normalizeResult.validationError ?? "Invalid correction value.",
    };
  }

  // ── Build typed scalar ────────────────────────────────────────────────────
  const typedValue = toTypedScalar(String(normalizeResult.normalizedValue!), valueType);
  if (typedValue === null) {
    return {
      ok: false,
      error: `Could not convert value to expected type '${valueType}'.`,
    };
  }

  const correctionValueJson: CorrectionScalarValue = { v: typedValue };

  // ── Build safe summary ────────────────────────────────────────────────────
  const summary = buildSummary(String(normalizeResult.normalizedValue!), fieldCode, lowerField);

  return {
    ok: true,
    correctionValueJson,
    proposedCorrectionSummary: summary,
  };
}

// ── Private helpers ───────────────────────────────────────────────────────────

function toTypedScalar(
  value: string,
  valueType: ApplyValueType
): string | number | boolean | null {
  switch (valueType) {
    case "boolean":
      if (value === "true")  return true;
      if (value === "false") return false;
      return null;

    case "number": {
      const n = Number(value);
      return isNaN(n) ? null : n;
    }

    case "bigint": {
      const n = Number(value);
      return isNaN(n) || !Number.isInteger(n) || n <= 0 ? null : n;
    }

    case "date":
    case "text":
    default:
      return value;
  }
}

function buildSummary(value: string, _fieldCode: string, lowerField: string): string {
  let display: string;

  if (SENSITIVE_FIELD_CODES.has(lowerField)) {
    display = "****";
  } else if (TRN_FIELD_CODES.has(lowerField)) {
    display = maskTrn(value);
  } else {
    display = value;
  }

  return display.length <= SUMMARY_MAX
    ? display
    : display.slice(0, SUMMARY_MAX - 3) + "...";
}

function maskTrn(value: string): string {
  if (value.length <= 8) return "****";
  return `${value.slice(0, 4)}****${value.slice(-4)}`;
}
