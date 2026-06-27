/**
 * DMS.10 — AI Result Validator
 *
 * Parses and validates raw AI JSON responses.
 * If parsing fails, returns a safe error result — never throws to callers.
 */

import { confidenceLabelFromScore } from "./types";
import type {
  DmsAiOutput,
  DmsClassificationResult,
  DmsExtractedField,
  DmsExtractionResult,
  DmsAdditionalField,
  DmsDetectedEntity,
  DmsSuggestedLink,
  ConfidenceLabel,
} from "./types";
import { parseExtendedClassification } from "./classification-output";

export interface ValidateResult {
  ok: boolean;
  output?: DmsAiOutput;
  error?: string;
  rawText: string;
}

/**
 * Attempts to extract JSON from an AI response that may contain
 * leading/trailing text or markdown fences.
 */
function extractJson(text: string): string {
  const trimmed = text.trim();

  // Remove code fences
  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenceMatch) return fenceMatch[1].trim();

  // Find first { and last }
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) {
    return trimmed.slice(start, end + 1);
  }

  return trimmed;
}

function safeConfidence(val: unknown): number {
  const n = typeof val === "number" ? val : parseFloat(String(val ?? "0"));
  return isNaN(n) ? 0 : Math.max(0, Math.min(1, n));
}

function safeConfidenceLabel(val: unknown, score: number): ConfidenceLabel {
  const valid: ConfidenceLabel[] = ["high", "medium", "low", "needs_manual_review"];
  if (typeof val === "string" && valid.includes(val as ConfidenceLabel)) {
    return val as ConfidenceLabel;
  }
  return confidenceLabelFromScore(score);
}

/**
 * When the AI response JSON is truncated or malformed (common for long transcriptions),
 * attempt to regex-extract full_text_transcription so OCR text is not lost.
 * Returns the transcription string, or null if not found.
 */
function salvageTranscription(text: string): string | null {
  // Match the JSON string value — may be unclosed due to truncation
  const m = text.match(/"full_text_transcription"\s*:\s*"((?:[^"\\]|\\[\s\S])*)(?:"|$)/);
  if (m?.[1]) {
    try {
      return JSON.parse(`"${m[1]}"`);
    } catch {
      return m[1].slice(0, 200_000); // return raw string without JSON unescaping
    }
  }
  return null;
}

/** Build a minimal DmsAiOutput for when full parse fails but we salvaged a transcription. */
function buildPartialOutput(rawText: string, transcription: string): DmsAiOutput {
  const score = 0;
  const classification: DmsClassificationResult = {
    suggestedTypeCode: null,
    suggestedTypeId: null,
    confidenceScore: score,
    confidenceLabel: "needs_manual_review",
    reason: "AI response was truncated; classification could not be extracted.",
  };
  const extraction: DmsExtractionResult = {
    fields: [],
    additionalFields: [],
    suggestedTitle: null,
    suggestedDescription: null,
    issueDateSuggestion: null,
    expiryDateSuggestion: null,
    fullTextTranscription: transcription.slice(0, 200_000),
  };
  return {
    classification,
    extraction,
    suggestedLinks: [],
    detectedEntities: [],
    warnings: ["AI response JSON was truncated. Classification and field extraction skipped; transcription salvaged."],
    rawResponse: { _salvaged: true, _rawLength: rawText.length },
  };
}

export function validateAiOutput(rawText: string): ValidateResult {
  const jsonStr = extractJson(rawText);

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(jsonStr) as Record<string, unknown>;
  } catch (e) {
    // Before giving up: attempt to salvage full_text_transcription from the raw text.
    // This rescues OCR results when the JSON is truncated by token limits.
    const salvaged = salvageTranscription(rawText);
    if (salvaged && salvaged.trim().length > 10) {
      return {
        ok: true,
        output: buildPartialOutput(rawText, salvaged),
        rawText,
      };
    }
    return {
      ok: false,
      error: `JSON parse failed: ${String(e).slice(0, 200)}`,
      rawText,
    };
  }

  // ── Classification ────────────────────────────────────────────────────────
  const rawClass = (parsed.classification ?? {}) as Record<string, unknown>;
  const classScore = safeConfidence(rawClass.confidence_score);
  const confidenceLabel = safeConfidenceLabel(rawClass.confidence_label, classScore);
  const suggestedTypeCode =
    typeof rawClass.suggested_type_code === "string" && rawClass.suggested_type_code
      ? rawClass.suggested_type_code
      : null;
  const extended = parseExtendedClassification(
    rawClass,
    classScore,
    confidenceLabel,
    suggestedTypeCode
  );
  const classification: DmsClassificationResult = {
    suggestedTypeCode,
    suggestedTypeId: null,
    confidenceScore: classScore,
    confidenceLabel,
    reason: typeof rawClass.reason === "string" ? rawClass.reason.slice(0, 500) : "",
    alternativeDocumentTypes: extended.alternativeDocumentTypes,
    classificationEvidence: extended.classificationEvidence,
    needsHumanReview: extended.needsHumanReview,
    reviewReason: extended.reviewReason,
  };

  // ── Field extraction ──────────────────────────────────────────────────────
  const rawFields = Array.isArray(parsed.fields) ? parsed.fields : [];
  const fields: DmsExtractedField[] = rawFields
    .filter((f): f is Record<string, unknown> => typeof f === "object" && f !== null)
    .map((f) => {
      const score = safeConfidence(f.confidence_score);
      return {
        fieldCode: typeof f.field_code === "string" ? f.field_code : "",
        value: typeof f.value === "string" ? f.value : String(f.value ?? ""),
        confidenceScore: score,
        confidenceLabel: safeConfidenceLabel(f.confidence_label, score),
        sourceSnippet: typeof f.source_snippet === "string" ? f.source_snippet.slice(0, 300) : null,
      };
    })
    .filter((f) => f.fieldCode.length > 0);

  /** Attempt to parse a YYYY-MM-DD date from various formats the AI might return. */
  function parseDate(val: unknown): string | null {
    if (typeof val !== "string" || !val.trim()) return null;
    const v = val.trim();
    // Already YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    // DD/MM/YYYY or DD-MM-YYYY
    const dmy = v.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, "0")}-${dmy[1].padStart(2, "0")}`;
    // MM/YYYY or MM-YYYY
    const my = v.match(/^(\d{1,2})[\/\-](\d{4})$/);
    if (my) return `${my[2]}-${my[1].padStart(2, "0")}-01`;
    return null;
  }

  // ── Additional fields (anything beyond the requested metadata list) ────────
  const rawAdditional = Array.isArray(parsed.additional_fields) ? parsed.additional_fields : [];
  const additionalFields: DmsAdditionalField[] = rawAdditional
    .filter((a): a is Record<string, unknown> => typeof a === "object" && a !== null)
    .map((a) => ({
      label: typeof a.label === "string" ? a.label.slice(0, 120) : "",
      value: typeof a.value === "string" ? a.value.slice(0, 500) : String(a.value ?? ""),
      confidenceScore: safeConfidence(a.confidence_score),
    }))
    .filter((a) => a.label.length > 0 && a.value.length > 0)
    .slice(0, 40);

  const extraction: DmsExtractionResult = {
    fields,
    additionalFields,
    suggestedTitle:
      typeof parsed.suggested_title === "string" && parsed.suggested_title
        ? parsed.suggested_title.slice(0, 255)
        : null,
    suggestedDescription:
      typeof parsed.suggested_description === "string" && parsed.suggested_description
        ? parsed.suggested_description.slice(0, 500)
        : null,
    // 1. Try top-level date fields
    issueDateSuggestion: parseDate(parsed.suggested_issue_date),
    expiryDateSuggestion: parseDate(parsed.suggested_expiry_date),
    // Full text transcription from the AI (primary OCR output for image-based docs)
    fullTextTranscription:
      typeof parsed.full_text_transcription === "string" && parsed.full_text_transcription.trim()
        ? parsed.full_text_transcription.slice(0, 200_000)
        : null,
  };

  // 2. Fall back: look for issue date in the fields array
  if (!extraction.issueDateSuggestion) {
    const issueField = fields.find((f) =>
      ["issue_date", "issued_date", "date_issued", "start_date"].includes(f.fieldCode.toLowerCase())
    );
    if (issueField) extraction.issueDateSuggestion = parseDate(issueField.value);
  }

  // 3. Fall back: look for expiry date in the fields array
  if (!extraction.expiryDateSuggestion) {
    const expiryField = fields.find((f) =>
      ["expiry_date", "expiry", "valid_until", "validity_date", "end_date", "date_expiry"].includes(f.fieldCode.toLowerCase())
    );
    if (expiryField) extraction.expiryDateSuggestion = parseDate(expiryField.value);
  }

  // ── Suggested links ───────────────────────────────────────────────────────
  const rawLinks = Array.isArray(parsed.suggested_links) ? parsed.suggested_links : [];
  const suggestedLinks: DmsSuggestedLink[] = rawLinks
    .filter((l): l is Record<string, unknown> => typeof l === "object" && l !== null)
    .slice(0, 5)
    .map((l) => ({
      entityType: typeof l.entity_type === "string" ? l.entity_type : "unknown",
      entityId: typeof l.entity_id === "number" ? l.entity_id : null,
      entityName: typeof l.entity_name === "string" ? l.entity_name : null,
      confidenceScore: safeConfidence(l.confidence_score),
      reason: typeof l.reason === "string" ? l.reason.slice(0, 200) : "",
    }));

  // ── Detected entities (persons / companies for DB matching) ────────────────
  const rawEntities = Array.isArray(parsed.detected_entities) ? parsed.detected_entities : [];
  const detectedEntities: DmsDetectedEntity[] = rawEntities
    .filter((e): e is Record<string, unknown> => typeof e === "object" && e !== null)
    .map((e) => ({
      entityType: typeof e.entity_type === "string" ? e.entity_type.slice(0, 40) : "unknown",
      name: typeof e.name === "string" ? e.name.slice(0, 200) : "",
      nameAr: typeof e.name_ar === "string" && e.name_ar ? e.name_ar.slice(0, 200) : null,
      identifier: typeof e.identifier === "string" && e.identifier ? e.identifier.slice(0, 100) : null,
      role: typeof e.role === "string" && e.role ? e.role.slice(0, 60) : null,
    }))
    .filter((e) => e.name.length > 0)
    .slice(0, 20);

  // ── Warnings ──────────────────────────────────────────────────────────────
  const rawWarnings = Array.isArray(parsed.warnings) ? parsed.warnings : [];
  const warnings: string[] = rawWarnings
    .filter((w): w is string => typeof w === "string")
    .slice(0, 10)
    .map((w) => w.slice(0, 300));

  const output: DmsAiOutput = {
    classification,
    extraction,
    suggestedLinks,
    detectedEntities,
    warnings,
    rawResponse: parsed,
  };

  return { ok: true, output, rawText };
}
