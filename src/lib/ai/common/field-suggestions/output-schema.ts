/**
 * ERP COMMON AI.1A — Field Suggestion Output Schema
 *
 * Zod schema for validating raw AI JSON output for field suggestions.
 * This schema is used by the output validator (output-validator.ts) to parse
 * and validate the AI response before any persistence or display.
 *
 * Rules:
 * - All string caps enforced at schema level.
 * - confidenceScore clamped to 0–1.
 * - Max suggestions per run enforced.
 * - No OpenAI calls in this file.
 */

import { z } from "zod";
import {
  ERP_COMMON_AI_ALLOWED_ENTITY_TYPES,
  ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS,
  ERP_COMMON_AI_MAX_REASON_CHARS,
  ERP_COMMON_AI_MAX_SUGGESTIONS_PER_RUN,
} from "../constants";

// ── Enum schemas ───────────────────────────────────────────────────────────────

export const ErpAiFieldTypeSchema = z.enum([
  "text",
  "date",
  "number",
  "boolean",
  "fk",
  "json",
]);

export const ErpAiSuggestionTypeSchema = z.enum([
  "fill_missing",
  "correct_value",
  "update_existing",
  "clear_wrong_value",
  "conflict_detected",
  "needs_human_review",
]);

export const ErpAiEntityTypeSchema = z.enum(
  ERP_COMMON_AI_ALLOWED_ENTITY_TYPES as unknown as [string, ...string[]]
);

// ── Single field suggestion schema ────────────────────────────────────────────

/**
 * Schema for a single AI field suggestion.
 * The AI must output suggestions matching this shape.
 */
export const ErpAiFieldSuggestionOutputSchema = z.object({
  /** DB column name of the target field. */
  targetField: z
    .string()
    .min(1)
    .max(100)
    .describe("DB column name of the field to fill or correct."),

  /** Human-readable label as registered. AI must echo the label from the prompt. */
  fieldLabel: z
    .string()
    .min(1)
    .max(255)
    .describe("Human-readable field label."),

  fieldType: ErpAiFieldTypeSchema,

  /** Current value of the field (null if empty). */
  currentValue: z
    .string()
    .max(2000)
    .nullable()
    .optional()
    .default(null)
    .describe("Current field value in the DB. Null if empty."),

  /** Suggested new value as a string. Null = suggest clearing the field. */
  suggestedValue: z
    .string()
    .max(2000)
    .nullable()
    .describe("Suggested new value as a plain string. Null means clear."),

  /** For JSON/FK fields: the structured suggested value (optional). */
  suggestedValueJson: z
    .unknown()
    .optional()
    .describe("Structured value for FK/JSON fields. Optional."),

  suggestionType: ErpAiSuggestionTypeSchema,

  /** Confidence score 0–1. Must be present. AI must not omit this. */
  confidenceScore: z
    .number()
    .min(0)
    .max(1)
    .describe("Confidence score 0 (no confidence) to 1 (certain)."),

  /** DMS document ID from which this value was extracted. */
  sourceDocumentId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("DMS document ID used as evidence. Preferred for traceability."),

  /** DMS file ID within the document. */
  sourceFileId: z
    .number()
    .int()
    .positive()
    .optional()
    .describe("DMS file ID within the source document. Optional."),

  /** Document type code of the source document. */
  sourceDocumentType: z
    .string()
    .max(100)
    .optional()
    .describe("DMS document type code of the evidence document."),

  /** Short verbatim excerpt from the evidence document. Hard capped. */
  sourceExcerpt: z
    .string()
    .max(ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS)
    .optional()
    .describe(
      `Short excerpt from the document where this value was found. Max ${ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS} chars.`
    ),

  /** AI explanation for this suggestion. Hard capped. */
  aiReason: z
    .string()
    .max(ERP_COMMON_AI_MAX_REASON_CHARS)
    .optional()
    .describe(
      `Brief explanation of why this suggestion was made. Max ${ERP_COMMON_AI_MAX_REASON_CHARS} chars.`
    ),
});

export type ErpAiFieldSuggestionOutput = z.infer<
  typeof ErpAiFieldSuggestionOutputSchema
>;

// ── Full generation output schema ─────────────────────────────────────────────

/**
 * Schema for the complete AI suggestion generation output JSON.
 * The AI must produce a JSON object matching this structure exactly.
 */
export const ErpAiSuggestionGenerationOutputSchema = z.object({
  entityType: ErpAiEntityTypeSchema,
  entityId: z
    .number()
    .int()
    .positive()
    .describe("The numeric BIGINT ID of the target entity record."),
  promptVersion: z
    .string()
    .min(1)
    .max(100)
    .describe("Must match the prompt version used to generate this output."),
  suggestions: z
    .array(ErpAiFieldSuggestionOutputSchema)
    .max(ERP_COMMON_AI_MAX_SUGGESTIONS_PER_RUN)
    .describe(
      `List of field suggestions. Max ${ERP_COMMON_AI_MAX_SUGGESTIONS_PER_RUN} per run.`
    ),
});

export type ErpAiSuggestionGenerationOutputFromSchema = z.infer<
  typeof ErpAiSuggestionGenerationOutputSchema
>;
