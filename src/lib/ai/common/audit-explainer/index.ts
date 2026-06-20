// ERP COMMON AI.14 — Audit Explainer Library Barrel
// Types only exported — safe for client components.
// Server-only modules (collectors, explanation-builder, cache) must be imported directly.

export type {
  AuditExplainerScope,
  AuditExplainerSourceType,
  AuditExplainerInput,
  AuditTimelineItem,
  AuditExplanationSummary,
  AuditExplainerPermissionState,
  AuditExplanationOutput,
  AuditExplainerOverview,
} from "./types";

export { AUDIT_EXPLAINER_PROMPT_VERSION } from "./types";
