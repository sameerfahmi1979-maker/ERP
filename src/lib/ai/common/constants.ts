/**
 * ERP COMMON AI.1A — Registry, Types, Prompt Contract, Output Schema
 *
 * Constants for the Universal Internal AI Field Suggestion Engine.
 */

/** Prompt version string — must be bumped when system prompt changes. */
export const ERP_COMMON_AI_PROMPT_VERSION = "common-ai-field-suggestions-v1.0";

/** All entity types supported by the Common AI engine. */
export const ERP_COMMON_AI_ALLOWED_ENTITY_TYPES = [
  "company",
  "party",
  "branch",
  "site",
] as const;

/** Stage 1 entity types — active for AI generation. */
export const ERP_COMMON_AI_STAGE_1_ENTITY_TYPES = ["company", "party"] as const;

/** Stage 2 entity types — registered as stubs, not yet active for generation. */
export const ERP_COMMON_AI_STAGE_2_ENTITY_TYPES = ["branch", "site"] as const;

/** Max characters for a source excerpt in a suggestion (enforced by validator). */
export const ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS = 500;

/** Max characters for the AI reason field in a suggestion. */
export const ERP_COMMON_AI_MAX_REASON_CHARS = 1_000;

/** Max suggestions the AI may return in a single generation run. */
export const ERP_COMMON_AI_MAX_SUGGESTIONS_PER_RUN = 50;

/** Max evidence snippets passed to a single AI prompt (Phase 1C). */
export const ERP_COMMON_AI_MAX_EVIDENCE_SNIPPETS = 10;

/** Max characters per evidence snippet content passed to the AI prompt. */
export const ERP_COMMON_AI_MAX_EVIDENCE_CONTENT_CHARS = 2_000;

/** Min confidence score to persist a suggestion as pending (vs. discarding). */
export const ERP_COMMON_AI_MIN_PERSIST_CONFIDENCE = 0.30;

/**
 * Feature flag code that must be enabled before any Common AI form fill
 * generation can run. Checked in server actions (Phase 1D).
 */
export const ERP_AI_FORM_FILL_FLAG = "ERP_AI_FORM_FILL";
