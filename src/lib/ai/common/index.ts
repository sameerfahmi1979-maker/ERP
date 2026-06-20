/**
 * ERP COMMON AI.1A — Common AI Library Barrel
 *
 * Central export point for the Common AI engine foundation.
 * Import from "@/lib/ai/common" for types, constants, and registry access.
 *
 * Phase 1A: types/registry/schema/prompt-contract only.
 * No DB tables, server actions, UI, or OpenAI calls.
 */

// Core types
export type {
  ErpAiEntityType,
  ErpAiFieldType,
  ErpAiSuggestionType,
  ErpAiSuggestionStatus,
  ErpAiSafetyClassification,
  ErpAiDocumentEvidenceHint,
  ErpAiEligibleFieldRegistration,
  ErpAiEntityRegistry,
  ErpAiCurrentRecordSnapshot,
  ErpAiDocumentEvidenceSnippet,
  ErpAiFieldSuggestionDraft,
  ErpAiSuggestionGenerationInput,
  ErpAiSuggestionGenerationOutput,
  ErpAiRegistryLookupResult,
} from "./types";

// Constants
export {
  ERP_COMMON_AI_PROMPT_VERSION,
  ERP_COMMON_AI_ALLOWED_ENTITY_TYPES,
  ERP_COMMON_AI_STAGE_1_ENTITY_TYPES,
  ERP_COMMON_AI_STAGE_2_ENTITY_TYPES,
  ERP_COMMON_AI_MAX_EVIDENCE_SNIPPET_CHARS,
  ERP_COMMON_AI_MAX_REASON_CHARS,
  ERP_COMMON_AI_MAX_SUGGESTIONS_PER_RUN,
  ERP_COMMON_AI_MAX_EVIDENCE_SNIPPETS,
  ERP_COMMON_AI_MAX_EVIDENCE_CONTENT_CHARS,
  ERP_COMMON_AI_MIN_PERSIST_CONFIDENCE,
  ERP_AI_FORM_FILL_FLAG,
} from "./constants";

// Non-updatable field guard
export {
  isGloballyNonUpdatableField,
  assertAiFieldCanBeRegistered,
  filterNonUpdatableFields,
  findForbiddenFields,
} from "./non-updatable-fields";

// Registry
export {
  COMMON_AI_ENTITY_REGISTRIES,
  getCommonAiEntityRegistry,
  getCommonAiEligibleFields,
  lookupCommonAiRegistry,
  isCommonAiEntityType,
  validateCommonAiRegistry,
} from "./registry/index";

// Evidence sanitizer (1C)
export {
  sanitizeEvidenceText,
  sanitizeAndCapText,
  buildContentSnippet,
  isDocumentEvidenceAllowedForUser,
  RESTRICTED_CONFIDENTIALITY_LEVELS,
} from "./field-suggestions/evidence-sanitizer";

// Evidence loader types (1C) — loader itself must be imported directly (server-side only)
export type {
  LoadEvidenceInput,
  EvidenceLoadResult,
} from "./field-suggestions/evidence-loader";

// Provider bridge types (1D)
export type {
  CommonAiCallResult,
  CommonAiCallError,
  CommonAiCallOutcome,
} from "./provider-bridge";

// Persistence types (1D)
export type {
  SupersedeResult,
  InsertResult,
  UsageLogInput,
} from "./field-suggestions/persistence";

// Apply engine types (1E)
export type {
  SuggestionForApply,
  ApplySuggestionResult,
} from "./field-suggestions/apply-engine";

// Apply handler types (1E)
export type {
  ApplyHandlerResult,
} from "./field-suggestions/apply-handlers";

// Current record loader (1D) — import directly for server-side use
// loadCurrentRecordSnapshot is a server-side function, import from path directly
