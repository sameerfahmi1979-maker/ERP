/**
 * ERP COMMON AI.7 — Assistant Intent Extractor
 *
 * Extracts structured intent from user messages.
 * Max 1 AI call. Zod-validated. Falls back to SEARCH_ERP on failure.
 *
 * Safety rules:
 * - Do not log prompt, raw response, or user message.
 * - Do not return raw AI output to the caller.
 * - Use callCommonAiStructuredCompletion() only.
 */

import { z } from "zod";
import { callCommonAiStructuredCompletion } from "@/lib/ai/common/provider-bridge";
import type { AssistantIntent, AssistantActionCode, AssistantIntentType } from "./types";

// ── Zod schema for structured intent output ────────────────────────────────────

const IntentSchema = z.object({
  intentType: z
    .enum([
      "search",
      "navigate",
      "explain_risk",
      "explain_compliance",
      "explain_duplicate",
      "explain_document",
      "prepare_draft",
      "show_next_actions",
      "blocked_dangerous",
      "unknown",
    ])
    .default("search"),
  candidateActions: z
    .array(
      z.enum([
        "SEARCH_ERP",
        "OPEN_RECORD",
        "EXPLAIN_RISK",
        "EXPLAIN_COMPLIANCE",
        "EXPLAIN_DUPLICATE",
        "EXPLAIN_DOCUMENT",
        "PREPARE_FIELD_UPDATE_DRAFT",
        "PREPARE_EMAIL_DRAFT_TEXT",
        "PREPARE_RENEWAL_NOTE",
        "SHOW_NEXT_ACTIONS",
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
      ])
    )
    .default(["SEARCH_ERP"]),
  targetEntityType: z.string().nullable().optional(),
  targetEntityId: z.number().nullable().optional(),
  searchQuery: z.string().max(500).nullable().optional(),
  documentTypeHint: z.string().max(100).nullable().optional(),
  draftHint: z.string().max(200).nullable().optional(),
  confidence: z.enum(["high", "medium", "low"]).default("low"),
});

// ── System prompt for intent extraction ────────────────────────────────────────
// This is a safe structural prompt. No user content is embedded in the system prompt.

const INTENT_SYSTEM_PROMPT = `You are an ERP assistant intent classifier. 
Given a user message, extract the intent as structured JSON.

Intent types: search, navigate, explain_risk, explain_compliance, explain_duplicate, explain_document, prepare_draft, show_next_actions, blocked_dangerous, unknown.

Candidate actions (only these are approved):
- SEARCH_ERP: user wants to find records
- OPEN_RECORD: user wants to view a specific record
- EXPLAIN_RISK: user wants to understand risk score
- EXPLAIN_COMPLIANCE: user wants to understand compliance issues
- EXPLAIN_DUPLICATE: user wants to understand duplicate conflicts
- EXPLAIN_DOCUMENT: user wants to understand a document
- PREPARE_FIELD_UPDATE_DRAFT: user wants a field update draft
- PREPARE_EMAIL_DRAFT_TEXT: user wants an email draft (NOT to send)
- PREPARE_RENEWAL_NOTE: user wants a renewal note draft
- SHOW_NEXT_ACTIONS: user wants recommendations

Dangerous actions (classify as blocked_dangerous):
DELETE_PARTY, DELETE_DOCUMENT, DELETE_BRANCH, DELETE_ORGANIZATION, APPROVE_DOCUMENT, APPROVE_DMS_INTAKE, SEND_EMAIL, SEND_NOTIFICATION, MERGE_DUPLICATES, WAIVE_COMPLIANCE_FINDING, APPLY_ALL_SUGGESTIONS, RESOLVE_RISK_REVIEW, CHANGE_COMPLIANCE_STATUS, BULK_UPDATE_RECORDS.

Return ONLY valid JSON matching this schema:
{
  "intentType": string,
  "candidateActions": string[],
  "targetEntityType": string | null,
  "targetEntityId": number | null,
  "searchQuery": string | null,
  "documentTypeHint": string | null,
  "draftHint": string | null,
  "confidence": "high" | "medium" | "low"
}`;

// ── Safe fallback intent ───────────────────────────────────────────────────────

function fallbackIntent(searchQuery: string): AssistantIntent {
  return {
    intentType: "search" as AssistantIntentType,
    candidateActions: ["SEARCH_ERP"],
    targetEntityType: null,
    targetEntityId: null,
    searchQuery: searchQuery.slice(0, 200),
    documentTypeHint: null,
    draftHint: null,
    confidence: "low",
  };
}

// ── Extractor ──────────────────────────────────────────────────────────────────

export async function extractAssistantIntent(
  userMessage: string,
  contextEntityType?: string | null,
  contextEntityId?: number | null
): Promise<AssistantIntent> {
  // Build user prompt with safe context only
  let contextHint = "";
  if (contextEntityType) {
    contextHint = `\nContext entity type: ${contextEntityType}`;
    if (contextEntityId) {
      contextHint += `, id: ${contextEntityId}`;
    }
  }

  // Truncate user message to avoid expensive AI calls
  const safeUserMsg = userMessage.slice(0, 800);
  const userPrompt = `User message: "${safeUserMsg}"${contextHint}\n\nReturn JSON intent.`;

  const outcome = await callCommonAiStructuredCompletion(
    INTENT_SYSTEM_PROMPT,
    userPrompt,
    { maxTokens: 300, temperature: 0 }
  );

  if (!outcome.success) {
    return fallbackIntent(safeUserMsg);
  }

  try {
    const parsed = JSON.parse(outcome.rawJson);
    const validated = IntentSchema.safeParse(parsed);
    if (!validated.success) {
      return fallbackIntent(safeUserMsg);
    }
    const data = validated.data;
    return {
      intentType: data.intentType as AssistantIntentType,
      candidateActions: data.candidateActions as AssistantActionCode[],
      targetEntityType: data.targetEntityType ?? null,
      targetEntityId: data.targetEntityId ?? null,
      searchQuery: data.searchQuery ?? safeUserMsg.slice(0, 200),
      documentTypeHint: data.documentTypeHint ?? null,
      draftHint: data.draftHint ?? null,
      confidence: data.confidence,
    };
  } catch {
    return fallbackIntent(safeUserMsg);
  }
}
