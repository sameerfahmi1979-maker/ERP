/**
 * ERP COMMON AI.7 — AI Assistant for Actions — Type Definitions
 *
 * Safety guarantees:
 * - No raw AI output, no raw prompts, no OCR text, no content_text.
 * - All stored text is sanitized human-readable only.
 * - Action drafts never auto-execute ERP mutations.
 */

// ── Intent types ───────────────────────────────────────────────────────────────

export type AssistantIntentType =
  | "search"
  | "navigate"
  | "explain_risk"
  | "explain_compliance"
  | "explain_duplicate"
  | "explain_document"
  | "prepare_draft"
  | "show_next_actions"
  | "blocked_dangerous"
  | "unknown";

// ── Action codes ───────────────────────────────────────────────────────────────

export type AssistantActionCode =
  // Approved v1 actions
  | "SEARCH_ERP"
  | "OPEN_RECORD"
  | "EXPLAIN_RISK"
  | "EXPLAIN_COMPLIANCE"
  | "EXPLAIN_DUPLICATE"
  | "EXPLAIN_DOCUMENT"
  | "PREPARE_FIELD_UPDATE_DRAFT"
  | "PREPARE_EMAIL_DRAFT_TEXT"
  | "PREPARE_RENEWAL_NOTE"
  | "SHOW_NEXT_ACTIONS"
  // Blocked dangerous actions
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
  | "BULK_UPDATE_RECORDS";

// ── Safety taxonomy ────────────────────────────────────────────────────────────

export type AssistantSafetyClass =
  | "read_only"
  | "navigation"
  | "draft_only"
  | "requires_confirmation"
  | "blocked_dangerous";

// ── Output types ───────────────────────────────────────────────────────────────

export type AssistantOutputType =
  | "text"
  | "search_results"
  | "navigation_link"
  | "explanation"
  | "draft_created"
  | "blocked_notice"
  | "error";

// ── Session and draft statuses ─────────────────────────────────────────────────

export type AssistantSessionStatus = "active" | "completed" | "failed" | "archived";

export type AssistantDraftStatus =
  | "draft"
  | "reviewed"
  | "accepted_for_manual_action"
  | "dismissed"
  | "superseded"
  | "failed";

// ── Intent schema (AI extracted) ───────────────────────────────────────────────

export interface AssistantIntent {
  intentType: AssistantIntentType;
  candidateActions: AssistantActionCode[];
  targetEntityType?: string | null;
  targetEntityId?: number | null;
  searchQuery?: string | null;
  documentTypeHint?: string | null;
  draftHint?: string | null;
  confidence: "high" | "medium" | "low";
}

// ── Action definition (registry entry) ────────────────────────────────────────

export interface AssistantActionDefinition {
  code: AssistantActionCode;
  label: string;
  safetyClass: AssistantSafetyClass;
  requiredPermission?: string;
  description: string;
  isBlocked: boolean;
}

// ── Action draft payload (safe content only) ───────────────────────────────────

export interface AssistantActionDraftPayload {
  /** Human-readable summary for UI display */
  summary: string;
  /** Draft field values (field label → safe value, no sensitive data) */
  draftFields?: Record<string, string>;
  /** Navigation route suggestion */
  navigationRoute?: string;
  /** Safe notes/instructions for human reviewer */
  reviewNotes?: string;
}

// ── Blocked action record ──────────────────────────────────────────────────────

export interface AssistantBlockedAction {
  requestedCode: string;
  reason: string;
  alternativeActions: string[];
}

// ── Turn result ────────────────────────────────────────────────────────────────

export interface AssistantTurnResult {
  /** Sanitized response text shown to user */
  responseText: string;
  outputType: AssistantOutputType;
  /** Created draft IDs (if any) */
  draftIds?: number[];
  /** Navigation routes for OPEN_RECORD results */
  navigationLinks?: Array<{ label: string; route: string }>;
  /** Search results summary (max 5) */
  searchResultSummary?: Array<{
    title: string;
    subtitle?: string | null;
    route: string;
    resultType: string;
  }>;
  /** Whether a blocked action was detected */
  wasBlocked?: boolean;
  blockedActions?: AssistantBlockedAction[];
  /** Safe metadata for audit logging (no user text, no AI output) */
  safeAuditMeta: {
    actionCodes: AssistantActionCode[];
    draftCount: number;
    blockedActionCodes: string[];
    durationMs: number;
    aiCallCount: number;
  };
}

// ── Constants (safe for client) ───────────────────────────────────────────────

/** Max user message length — shared between client chat input and server engine */
export const ASSISTANT_MAX_USER_MESSAGE_LENGTH = 1000;

// ── Server action inputs ───────────────────────────────────────────────────────

export interface StartAssistantSessionInput {
  title?: string;
  contextEntityType?: string;
  contextEntityId?: number;
}

export interface SendAssistantMessageInput {
  sessionId: number;
  userMessage: string;
}

export interface GetAssistantSessionsInput {
  includeArchived?: boolean;
  limit?: number;
}

// ── Session / message / draft row shapes ──────────────────────────────────────

export interface AssistantSessionRow {
  id: number;
  sessionCode: string;
  title: string | null;
  ownerUserProfileId: number;
  contextEntityType: string | null;
  contextEntityId: number | null;
  status: AssistantSessionStatus;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface AssistantMessageRow {
  id: number;
  sessionId: number;
  role: "user" | "assistant" | "system_notice";
  messageText: string;
  outputType: AssistantOutputType | null;
  safeMetadataJson: Record<string, unknown>;
  createdAt: string;
}

export interface AssistantDraftRow {
  id: number;
  sessionId: number;
  actionCode: string;
  safetyClass: AssistantSafetyClass;
  targetEntityType: string | null;
  targetEntityId: number | null;
  draftPayloadJson: AssistantActionDraftPayload;
  status: AssistantDraftStatus;
  createdAt: string;
  reviewedAt: string | null;
  reviewedBy: number | null;
}
