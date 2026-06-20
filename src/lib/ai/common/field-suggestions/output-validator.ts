/**
 * ERP COMMON AI.1A — Field Suggestion Output Validator
 *
 * Validates and sanitizes raw AI JSON output for field suggestions.
 * This is the only code that touches the raw AI response — no other module
 * should parse AI output directly.
 *
 * Rules:
 * - Only suggestions for registered, AI-eligible fields are accepted.
 * - Globally non-updatable fields are always rejected.
 * - sourceExcerpt and aiReason are hard-capped to constants.
 * - Raw AI responses are never logged or returned in error messages.
 * - No OpenAI calls in this file.
 */

import {
  ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS,
  ERP_COMMON_AI_MAX_REASON_CHARS,
} from "../constants";
import { isGloballyNonUpdatableField } from "../non-updatable-fields";
import type {
  ErpAiEntityRegistry,
  ErpAiFieldSuggestionDraft,
  ErpAiSuggestionGenerationOutput,
} from "../types";
import {
  ErpAiSuggestionGenerationOutputSchema,
  type ErpAiFieldSuggestionOutput,
} from "./output-schema";

// ── Validation result ──────────────────────────────────────────────────────────

export interface ErpAiValidationResult {
  ok: boolean;
  output?: ErpAiSuggestionGenerationOutput;
  /** Safe validation error — never contains raw AI response content. */
  error?: string;
  /** Number of suggestions rejected due to unregistered/forbidden fields. */
  rejectedCount: number;
}

// ── Main validator ─────────────────────────────────────────────────────────────

/**
 * Validates raw AI JSON output against the schema and the entity registry.
 *
 * Steps:
 * 1. Strip code fences from the raw string.
 * 2. Parse JSON safely.
 * 3. Validate against Zod schema.
 * 4. Filter to registered AI-eligible fields only.
 * 5. Reject globally non-updatable fields.
 * 6. Sanitize string lengths.
 *
 * @param raw - Raw string from the AI (may include code fences).
 * @param registry - The entity registry to validate against.
 */
export function validateErpAiSuggestionOutput(
  raw: unknown,
  registry: ErpAiEntityRegistry
): ErpAiValidationResult {
  // 1. Parse if string
  let parsed: unknown;

  if (typeof raw === "string") {
    const cleaned = stripCodeFences(raw);
    try {
      parsed = JSON.parse(cleaned);
    } catch {
      return {
        ok: false,
        error: "AI response could not be parsed as valid JSON.",
        rejectedCount: 0,
      };
    }
  } else {
    parsed = raw;
  }

  // 2. Validate against Zod schema
  const result = ErpAiSuggestionGenerationOutputSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .slice(0, 3)
      .map((i) => `${i.path.join(".")}: ${i.message}`)
      .join("; ");
    return {
      ok: false,
      error: `AI output schema validation failed: ${issues}`,
      rejectedCount: 0,
    };
  }

  const validated = result.data;

  // 3. Build registered field lookup: "table.field" → registration
  const registeredFieldKeys = new Set(
    registry.fields
      .filter((f) => f.isAiEligible === true)
      .map((f) => buildFieldKey(f.targetTable, f.targetField))
  );

  // 4. Filter and sanitize suggestions
  const accepted: ErpAiFieldSuggestionDraft[] = [];
  let rejectedCount = 0;

  for (const raw of validated.suggestions) {
    // Determine which table the field belongs to via registry lookup
    const fieldReg = registry.fields.find(
      (f) => f.targetField === raw.targetField && f.isAiEligible === true
    );

    if (!fieldReg) {
      rejectedCount++;
      continue; // unregistered field — discard
    }

    const fieldKey = buildFieldKey(fieldReg.targetTable, raw.targetField);

    if (!registeredFieldKeys.has(fieldKey)) {
      rejectedCount++;
      continue;
    }

    if (isGloballyNonUpdatableField(raw.targetField)) {
      rejectedCount++;
      continue;
    }

    accepted.push(sanitizeSuggestion(raw));
  }

  const warnings: string[] = [];
  if (rejectedCount > 0) {
    warnings.push(
      `${rejectedCount} suggestion(s) were discarded: fields not registered or globally forbidden.`
    );
  }

  return {
    ok: true,
    output: {
      entityType: validated.entityType as import("../types").ErpAiEntityType,
      entityId: validated.entityId,
      promptVersion: validated.promptVersion,
      suggestions: accepted,
      rawSuggestionCount: validated.suggestions.length,
      warnings,
    },
    rejectedCount,
  };
}

// ── Sanitization helpers ───────────────────────────────────────────────────────

/**
 * Sanitizes a single field suggestion:
 * - Caps sourceExcerpt to MAX_EVIDENCE_SNIPPET_CHARS
 * - Caps aiReason to MAX_REASON_CHARS
 * - Converts to ErpAiFieldSuggestionDraft
 */
export function sanitizeAiSuggestionDraft(
  raw: ErpAiFieldSuggestionOutput
): ErpAiFieldSuggestionDraft {
  return sanitizeSuggestion(raw);
}

/**
 * Filters a list of suggestions to only those targeting registered, AI-eligible fields.
 * Does NOT re-run Zod validation — use validateErpAiSuggestionOutput for full validation.
 */
export function filterSuggestionsToRegisteredFields(
  suggestions: ErpAiFieldSuggestionDraft[],
  registry: ErpAiEntityRegistry
): ErpAiFieldSuggestionDraft[] {
  const registeredFields = new Set(
    registry.fields
      .filter((f) => f.isAiEligible === true)
      .map((f) => f.targetField)
  );

  return suggestions.filter(
    (s) =>
      registeredFields.has(s.targetField) &&
      !isGloballyNonUpdatableField(s.targetField)
  );
}

// ── Private helpers ───────────────────────────────────────────────────────────

function buildFieldKey(targetTable: string, targetField: string): string {
  return `${targetTable}.${targetField}`;
}

function sanitizeSuggestion(
  raw: ErpAiFieldSuggestionOutput
): ErpAiFieldSuggestionDraft {
  return {
    targetField: raw.targetField,
    fieldLabel: raw.fieldLabel,
    fieldType: raw.fieldType,
    currentValue: raw.currentValue ?? null,
    suggestedValue: raw.suggestedValue,
    suggestedValueJson: raw.suggestedValueJson,
    suggestionType: raw.suggestionType,
    confidenceScore: Math.max(0, Math.min(1, raw.confidenceScore)),
    sourceDocumentId: raw.sourceDocumentId,
    sourceFileId: raw.sourceFileId,
    sourceDocumentType: raw.sourceDocumentType,
    sourceExcerpt: raw.sourceExcerpt
      ? raw.sourceExcerpt.slice(0, ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS)
      : undefined,
    aiReason: raw.aiReason
      ? raw.aiReason.slice(0, ERP_COMMON_AI_MAX_REASON_CHARS)
      : undefined,
  };
}

function stripCodeFences(text: string): string {
  const trimmed = text.trim();
  const fenceMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start !== -1 && end > start) return trimmed.slice(start, end + 1);
  return trimmed;
}
