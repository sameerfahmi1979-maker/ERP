/**
 * ERP COMMON AI.6 — ERP Search Intent Extractor
 *
 * Uses the DMS AI provider layer to extract structured search intent from
 * a natural-language query. Gated by AI_SEARCH flag + ai.search.use permission.
 *
 * Safety rules:
 * - 1 AI call max per query.
 * - Structured JSON + Zod validation.
 * - Falls back to keyword intent on failure.
 * - Never logs query text, prompt, or raw AI response.
 */

import { z } from "zod";
import { getDmsAiProvider } from "@/lib/dms/ai/factory";
import type { ErpSearchIntent, ErpSearchEntityType } from "./types";

const PROMPT_VERSION = "erp_search_intent_v1";

// ── Zod schema for intent validation ─────────────────────────────────────────

const ErpSearchIntentSchema = z.object({
  query: z.string().default(""),
  entityTypes: z
    .array(
      z.enum(["organization", "branch", "party", "site", "dms_document"])
    )
    .default([]),
  keywords: z.array(z.string()).default([]),
  riskLevel: z
    .enum(["none", "low", "medium", "high", "critical"])
    .nullable()
    .optional(),
  complianceStatus: z.enum(["open", "critical", "high"]).nullable().optional(),
  hasDuplicates: z.boolean().nullable().optional(),
  expiryState: z.enum(["expired", "expiring_soon"]).nullable().optional(),
  status: z.string().nullable().optional(),
  dateFrom: z.string().nullable().optional(),
  dateTo: z.string().nullable().optional(),
  documentTypeHint: z.string().nullable().optional(),
});

// ── Prompt builder ────────────────────────────────────────────────────────────

function buildSystemPrompt(): string {
  return `You are a search intent extractor for an ERP system operating in the UAE.

Your task: analyse the user's search query and return ONLY a JSON object representing search intent.

Do NOT answer the question. Do NOT invent filters. Do NOT include data you are not sure about. Do NOT propose actions.

Return a JSON object with these fields (all optional/nullable unless stated):
- keywords: string[] — short keywords for name/title search (required)
- entityTypes: array of zero or more: "organization","branch","party","site","dms_document"
- riskLevel: "none"|"low"|"medium"|"high"|"critical"|null — if user mentions risk level
- complianceStatus: "open"|"critical"|"high"|null — if user asks about compliance issues
- hasDuplicates: boolean|null — if user asks about duplicate records
- expiryState: "expired"|"expiring_soon"|null — if user asks about expiry
- status: string|null — entity status filter hint
- dateFrom: string|null — ISO date YYYY-MM-DD
- dateTo: string|null — ISO date YYYY-MM-DD
- documentTypeHint: string|null — document type hint if asking about documents

Examples:
- "show me high risk companies" → entityTypes:["organization"], riskLevel:"high", keywords:["company"]
- "parties with open compliance issues" → entityTypes:["party"], complianceStatus:"open", keywords:["compliance"]
- "expired passport documents" → entityTypes:["dms_document"], expiryState:"expired", documentTypeHint:"passport", keywords:["passport","expired"]
- "Alliance Group" → keywords:["Alliance","Group"], entityTypes:[]

Return ONLY valid JSON. No markdown. No explanation. No actions.`;
}

// ── Keyword fallback ──────────────────────────────────────────────────────────

function keywordFallbackIntent(query: string): ErpSearchIntent {
  const keywords = query
    .trim()
    .split(/\s+/)
    .filter((w) => w.length > 1)
    .slice(0, 10);
  return {
    query,
    entityTypes: [],
    keywords,
  };
}

// ── extractErpSearchIntent ────────────────────────────────────────────────────

export async function extractErpSearchIntent(
  query: string,
  isEnabled: boolean
): Promise<{ intent: ErpSearchIntent; usedAi: boolean }> {
  if (!isEnabled || !query || query.trim().length < 3) {
    return { intent: keywordFallbackIntent(query), usedAi: false };
  }

  try {
    const { provider } = await getDmsAiProvider();
    if (!provider.isConfigured()) {
      return { intent: keywordFallbackIntent(query), usedAi: false };
    }

    const result = await provider.callStructuredCompletion(
      buildSystemPrompt(),
      query.trim().substring(0, 500),
      { maxTokens: 300, temperature: 0.0 }
    );

    const parsed = JSON.parse(result.rawJson) as unknown;
    const validated = ErpSearchIntentSchema.safeParse(parsed);

    if (!validated.success) {
      return { intent: keywordFallbackIntent(query), usedAi: false };
    }

    const data = validated.data;
    const intent: ErpSearchIntent = {
      query,
      entityTypes: (data.entityTypes ?? []) as ErpSearchEntityType[],
      keywords: data.keywords ?? [],
      riskLevel: data.riskLevel ?? null,
      complianceStatus: data.complianceStatus ?? null,
      hasDuplicates: data.hasDuplicates ?? null,
      expiryState: data.expiryState ?? null,
      status: data.status ?? null,
      dateFrom: data.dateFrom ?? null,
      dateTo: data.dateTo ?? null,
      documentTypeHint: data.documentTypeHint ?? null,
    };

    return { intent, usedAi: true };
  } catch {
    return { intent: keywordFallbackIntent(query), usedAi: false };
  }
}

export { PROMPT_VERSION as ERP_SEARCH_INTENT_PROMPT_VERSION };
