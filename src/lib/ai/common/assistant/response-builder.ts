/**
 * ERP COMMON AI.7 — Response Builder
 *
 * Builds safe, sanitized assistant responses.
 * No raw AI output, no prompts, no OCR text.
 */

import type {
  AssistantActionDraftPayload,
  AssistantBlockedAction,
  AssistantTurnResult,
  AssistantOutputType,
} from "./types";

const MAX_RESPONSE_LENGTH = 2000;
const MAX_STORED_LENGTH = 4000;

// ── Text sanitizer ─────────────────────────────────────────────────────────────

export function sanitizeAssistantText(text: string, maxLen = MAX_RESPONSE_LENGTH): string {
  // Strip any patterns that look like raw API keys, tokens, or structured AI artifacts
  let safe = text
    .replace(/sk-[a-zA-Z0-9]{20,}/g, "[REDACTED]")
    .replace(/Bearer\s+[a-zA-Z0-9._-]{20,}/g, "[REDACTED]")
    .trim();

  if (safe.length > maxLen) {
    safe = safe.slice(0, maxLen) + "…";
  }
  return safe;
}

export function sanitizeForStorage(text: string): string {
  return sanitizeAssistantText(text, MAX_STORED_LENGTH);
}

// ── Main response builder ──────────────────────────────────────────────────────

export function buildAssistantResponse(
  text: string,
  outputType: AssistantOutputType,
  extras?: Partial<
    Pick<
      AssistantTurnResult,
      "navigationLinks" | "searchResultSummary" | "draftIds"
    >
  >
): Partial<AssistantTurnResult> {
  return {
    responseText: sanitizeAssistantText(text),
    outputType,
    ...extras,
  };
}

// ── Blocked action response ────────────────────────────────────────────────────

export function buildBlockedActionResponse(blocked: AssistantBlockedAction[]): Partial<AssistantTurnResult> {
  const codes = blocked.map((b) => b.requestedCode).join(", ");
  const text =
    `I cannot execute this automatically. This requires explicit human review and approval.\n\n` +
    `**Blocked action(s):** ${codes}\n\n` +
    `I can:\n` +
    `• Open the correct review page\n` +
    `• Explain the issue\n` +
    `• Prepare a draft note or email\n\n` +
    `Please use the ERP interface to take this action after your review.`;

  return {
    responseText: sanitizeAssistantText(text),
    outputType: "blocked_notice",
    wasBlocked: true,
    blockedActions: blocked,
  };
}

// ── Draft created response ─────────────────────────────────────────────────────

export function buildDraftCreatedResponse(
  draftId: number,
  payload: AssistantActionDraftPayload,
  responseText: string
): Partial<AssistantTurnResult> {
  const label = "\n\n⚠ **AI draft — requires human review before any action is taken.**";
  return {
    responseText: sanitizeAssistantText(responseText + label),
    outputType: "draft_created",
    draftIds: [draftId],
    navigationLinks: payload.navigationRoute
      ? [{ label: "Open Record", route: payload.navigationRoute }]
      : undefined,
  };
}
