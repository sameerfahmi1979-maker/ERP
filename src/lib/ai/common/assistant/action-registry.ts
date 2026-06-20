/**
 * ERP COMMON AI.7 — Assistant Action Registry
 *
 * Defines the approved v1 action set and the blocked dangerous action list.
 * No auto-execution. No real ERP mutations.
 */

import type { AssistantActionCode, AssistantActionDefinition } from "./types";

// ── Approved v1 action definitions ────────────────────────────────────────────

export const ASSISTANT_ACTION_REGISTRY: Record<
  Exclude<
    AssistantActionCode,
    | "DELETE_PARTY"
    | "DELETE_DOCUMENT"
    | "DELETE_BRANCH"
    | "DELETE_ORGANIZATION"
    | "APPROVE_DOCUMENT"
    | "APPROVE_DMS_INTAKE"
    | "SEND_EMAIL"
    | "SEND_NOTIFICATION"
    | "MERGE_DUPLICATES"
    | "WAIVE_COMPLIANCE_FINDING"
    | "APPLY_ALL_SUGGESTIONS"
    | "RESOLVE_RISK_REVIEW"
    | "CHANGE_COMPLIANCE_STATUS"
    | "BULK_UPDATE_RECORDS"
  >,
  AssistantActionDefinition
> = {
  SEARCH_ERP: {
    code: "SEARCH_ERP",
    label: "Search ERP",
    safetyClass: "read_only",
    requiredPermission: "ai.search.use",
    description: "Search across ERP entities using AI.6 search engine",
    isBlocked: false,
  },
  OPEN_RECORD: {
    code: "OPEN_RECORD",
    label: "Open Record",
    safetyClass: "navigation",
    description: "Return a navigation link to an ERP record",
    isBlocked: false,
  },
  EXPLAIN_RISK: {
    code: "EXPLAIN_RISK",
    label: "Explain Risk Score",
    safetyClass: "read_only",
    requiredPermission: "ai.risk.view",
    description: "Read and explain the AI.5 risk score for an entity",
    isBlocked: false,
  },
  EXPLAIN_COMPLIANCE: {
    code: "EXPLAIN_COMPLIANCE",
    label: "Explain Compliance Findings",
    safetyClass: "read_only",
    requiredPermission: "ai.compliance.view",
    description: "Read and explain open AI.4 compliance findings",
    isBlocked: false,
  },
  EXPLAIN_DUPLICATE: {
    code: "EXPLAIN_DUPLICATE",
    label: "Explain Duplicate Candidates",
    safetyClass: "read_only",
    requiredPermission: "ai.duplicates.view",
    description: "Read and explain AI.3 duplicate candidate conflicts",
    isBlocked: false,
  },
  EXPLAIN_DOCUMENT: {
    code: "EXPLAIN_DOCUMENT",
    label: "Explain Document",
    safetyClass: "read_only",
    requiredPermission: "dms.documents.view",
    description: "Read and explain DMS document AI.2 understanding (sanitized only)",
    isBlocked: false,
  },
  PREPARE_FIELD_UPDATE_DRAFT: {
    code: "PREPARE_FIELD_UPDATE_DRAFT",
    label: "Prepare Field Update Draft",
    safetyClass: "draft_only",
    requiredPermission: "ai.actions.prepare",
    description: "Prepare a draft field update for human review — does not apply suggestion",
    isBlocked: false,
  },
  PREPARE_EMAIL_DRAFT_TEXT: {
    code: "PREPARE_EMAIL_DRAFT_TEXT",
    label: "Prepare Email Draft",
    safetyClass: "draft_only",
    requiredPermission: "ai.actions.prepare",
    description: "Prepare an email subject/body draft — does not send",
    isBlocked: false,
  },
  PREPARE_RENEWAL_NOTE: {
    code: "PREPARE_RENEWAL_NOTE",
    label: "Prepare Renewal Note",
    safetyClass: "draft_only",
    requiredPermission: "ai.actions.prepare",
    description: "Prepare a renewal note draft — does not create a renewal request",
    isBlocked: false,
  },
  SHOW_NEXT_ACTIONS: {
    code: "SHOW_NEXT_ACTIONS",
    label: "Show Next Actions",
    safetyClass: "read_only",
    description: "Read AI.3/AI.4/AI.5 signals and recommend human actions",
    isBlocked: false,
  },
};

// ── Blocked dangerous actions ──────────────────────────────────────────────────

export const BLOCKED_DANGEROUS_ACTIONS: Set<AssistantActionCode> = new Set([
  "DELETE_PARTY",
  "DELETE_DOCUMENT",
  "DELETE_BRANCH",
  "DELETE_ORGANIZATION",
  "APPROVE_DOCUMENT",
  "APPROVE_DMS_INTAKE",
  "SEND_EMAIL",
  "SEND_NOTIFICATION",
  "MERGE_DUPLICATES",
  "WAIVE_COMPLIANCE_FINDING",
  "APPLY_ALL_SUGGESTIONS",
  "RESOLVE_RISK_REVIEW",
  "CHANGE_COMPLIANCE_STATUS",
  "BULK_UPDATE_RECORDS",
]);

// ── Keyword patterns that indicate blocked dangerous intent ────────────────────

const BLOCKED_KEYWORD_PATTERNS: RegExp[] = [
  /\bdelete\b/i,
  /\bremove\b.*\brecord\b/i,
  /\bapprove\b.*\bdocument\b/i,
  /\bapprove\b.*\bdms\b/i,
  /\bsend\b.*\bemail\b/i,
  /\bsend\b.*\bnotif/i,
  /\bmerge\b.*\bduplicat/i,
  /\bwaive\b/i,
  /\bresolve\b.*\brisk\b/i,
  /\bapply\b.*\ball\b.*\bsuggestion/i,
  /\bbulk\b.*\bupdat/i,
  /\bchange\b.*\bcompliance\b.*\bstatus\b/i,
];

// ── Registry helpers ───────────────────────────────────────────────────────────

export function getAssistantActionDefinition(
  code: AssistantActionCode
): AssistantActionDefinition | null {
  if (BLOCKED_DANGEROUS_ACTIONS.has(code)) {
    return {
      code,
      label: code,
      safetyClass: "blocked_dangerous",
      description: "Blocked — requires explicit human review and approval",
      isBlocked: true,
    };
  }
  return (ASSISTANT_ACTION_REGISTRY as Record<string, AssistantActionDefinition>)[code] ?? null;
}

export function isBlockedDangerousRequest(userMessage: string): boolean {
  return BLOCKED_KEYWORD_PATTERNS.some((p) => p.test(userMessage));
}

export function isApprovedAction(code: AssistantActionCode): boolean {
  return !BLOCKED_DANGEROUS_ACTIONS.has(code) && code in ASSISTANT_ACTION_REGISTRY;
}
