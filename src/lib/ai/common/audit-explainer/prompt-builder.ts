// ERP COMMON AI.14 — Audit Explainer Prompt Builder
// Builds structured safe prompts from sanitized audit events.
// NEVER includes: raw OCR, content_text, raw AI responses, API keys, IBAN, TRN.

import { AUDIT_EXPLAINER_PROMPT_VERSION } from "./types";
import { truncateSafeText } from "./audit-sanitizer";
import type { AuditTimelineItem } from "./types";

export const AUDIT_EXPLAINER_SYSTEM_PROMPT = `You are an ERP audit trail analyst. Your role is to explain audit log entries in clear, professional business language.

Rules:
- Explain what happened in plain English
- Focus on business impact, not technical details
- Do not reveal or infer sensitive data (IBAN, bank accounts, personal numbers, API keys)
- Do not make up information not present in the input
- Keep explanations concise and actionable
- Confidence: high = clear complete data, medium = partial data, low = ambiguous

Respond ONLY with valid JSON matching exactly:
{
  "title": "brief title (max 80 chars)",
  "plainEnglishSummary": "1-3 sentence summary",
  "whatChanged": ["change 1", "change 2"],
  "whoAndWhen": "actor and timestamp description",
  "businessImpact": "brief business impact or null",
  "recommendedReviewLinks": [],
  "confidence": "high|medium|low"
}`;

export function buildAuditExplainerPrompt(
  items: AuditTimelineItem[],
  context?: { entityType?: string; entityId?: number; scope?: string }
): { systemPrompt: string; userPrompt: string } {
  const safeEvents = items.slice(0, 15).map((item) => ({
    action: item.action,
    entity: item.entityType,
    entityRef: item.entityReference ?? `#${item.entityId ?? "?"}`,
    module: item.moduleCode ?? "ERP",
    when: item.occurredAt,
    detail: item.safeDetail ? truncateSafeText(item.safeDetail, 150) : undefined,
  }));

  const contextStr = context?.entityType
    ? `Entity: ${context.entityType}${context.entityId ? ` #${context.entityId}` : ""}. Scope: ${context.scope ?? "recent"}.`
    : `Scope: ${context?.scope ?? "recent"}.`;

  const userPrompt = `Explain the following ERP audit events in plain English.

${contextStr}

Events (${safeEvents.length}):
${safeEvents.map((e, i) => `${i + 1}. [${e.module}] ${e.action} on ${e.entity} ${e.entityRef} at ${e.when}${e.detail ? ` — ${e.detail}` : ""}`).join("\n")}

Prompt version: ${AUDIT_EXPLAINER_PROMPT_VERSION}

Respond with JSON only.`;

  return {
    systemPrompt: AUDIT_EXPLAINER_SYSTEM_PROMPT,
    userPrompt,
  };
}
