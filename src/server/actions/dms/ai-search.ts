"use server";

/**
 * DMS 12.4 — AI Search Server Actions
 *
 * Implements intent extraction + SQL search.
 * The LLM classifies the user question into a DmsSearchIntent JSON.
 * The database query then executes against real data — no hallucinated results.
 *
 * Hard rules:
 *  - AI search uses intent → SQL, never free-form LLM answers.
 *  - content_text is NEVER returned in search responses.
 *  - hr/legal/executive content excluded for non-admin users.
 *  - Prompts, question text, and raw AI responses are NEVER logged.
 *  - createAdminClient() is NEVER used for user-facing searches.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import { getDmsAiProvider } from "@/lib/dms/ai/factory";
import type { DmsSearchIntent, DmsAiSearchResult } from "@/lib/dms/ai/types";
import { logDmsAiUsage } from "@/lib/ai/observability/log-dms-ai-usage";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CONFIDENTIAL_TYPES = ["hr", "legal", "executive"] as const;
const AI_SEARCH_PROMPT_VERSION = "v1.0";
const MAX_RESULTS = 25;

// ── Feature flag ──────────────────────────────────────────────────────────────

async function isDmsFeatureEnabled(featureCode: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_feature_flags")
      .select("is_enabled")
      .eq("feature_code", featureCode)
      .single();
    return (data as { is_enabled?: boolean } | null)?.is_enabled ?? false;
  } catch {
    return false;
  }
}

// ── Permission helpers ─────────────────────────────────────────────────────────

function isAdminUser(ctx: Awaited<ReturnType<typeof getAuthContext>>) {
  return (
    hasPermission(ctx, "dms.admin") || ctx.roleCodes.includes("system_admin")
  );
}

// ── Zod schema for DmsSearchIntent ───────────────────────────────────────────

const SearchIntentSchema = z.object({
  keywords: z.array(z.string()).default([]),
  document_type_hint: z.string().nullable().default(null),
  category_hint: z.string().nullable().default(null),
  person_name_hint: z.string().nullable().default(null),
  party_name_hint: z.string().nullable().default(null),
  date_from: z.string().nullable().default(null),
  date_to: z.string().nullable().default(null),
  expiry_state: z.enum(["expired", "expiring_soon", "valid"]).nullable().default(null),
  outcome_hint: z.string().nullable().default(null),
  risk_hint: z.enum(["high", "medium", "low"]).nullable().default(null),
  metadata_filters: z
    .array(z.object({ field_code: z.string(), value: z.string() }))
    .default([]),
  confidentiality_max: z
    .enum(["internal", "company", "finance", "hr", "legal", "executive"])
    .nullable()
    .default(null),
});

// ── Intent extraction prompt ──────────────────────────────────────────────────

function buildIntentSystemPrompt(): string {
  return `You are a search intent extractor for an ERP Document Management System operating in the UAE.

Your task: analyse the user's question and return ONLY a JSON object that represents the search intent.

Do NOT answer the question. Do NOT invent filters. Do NOT include data you are not sure about.

Return a JSON object with these fields (all nullable unless specified):
- keywords: string[] — short keywords useful for full-text search of document titles, descriptions, and content
- document_type_hint: string or null — document type name/code (e.g. "passport", "medical certificate", "insurance policy")
- category_hint: string or null — document category name (e.g. "HR", "Health & Safety", "Insurance")
- person_name_hint: string or null — if the question mentions a person's name
- party_name_hint: string or null — if the question mentions a company or party name
- date_from: string or null — ISO date YYYY-MM-DD (earliest date relevant)
- date_to: string or null — ISO date YYYY-MM-DD (latest date relevant)
- expiry_state: "expired" | "expiring_soon" | "valid" | null — if the question is about expiry
- outcome_hint: string or null — business outcome keyword (e.g. "fit", "approved", "rejected", "passed", "failed", "issued")
- risk_hint: "high" | "medium" | "low" | null — if the question mentions risk level
- metadata_filters: array of { field_code: string, value: string } — specific structured metadata filters
- confidentiality_max: one of "internal"|"company"|"finance"|"hr"|"legal"|"executive" or null

Examples:
- "people who passed offshore medical" → keywords: ["offshore", "medical", "passed"], outcome_hint: "passed", document_type_hint: "offshore medical certificate"
- "expired passports" → expiry_state: "expired", document_type_hint: "passport"
- "Petrofac insurance deductible" → keywords: ["Petrofac", "insurance", "deductible"], party_name_hint: "Petrofac"

Return ONLY valid JSON. No markdown. No explanation.`;
}

// ── extractDmsSearchIntent ─────────────────────────────────────────────────────

export async function extractDmsSearchIntent(
  question: string
): Promise<ActionResult<DmsSearchIntent>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.documents.view")) {
    return { success: false, error: "Permission denied." };
  }

  if (!question || question.trim().length < 3) {
    return { success: false, error: "Please enter a search question." };
  }

  const enabled = await isDmsFeatureEnabled("DMS_AI_SEARCH");
  if (!enabled) {
    return { success: false, error: "AI Search feature is currently disabled." };
  }

  const { provider, configId } = await getDmsAiProvider();
  if (!provider.isConfigured()) {
    return { success: false, error: "AI provider is not configured." };
  }

  try {
    const startMs = Date.now();
    const result = await provider.callStructuredCompletion(
      buildIntentSystemPrompt(),
      question.trim().substring(0, 500),
      { maxTokens: 400, temperature: 0.0 }
    );
    const durationMs = Date.now() - startMs;

    const parsed = JSON.parse(result.rawJson) as unknown;
    const validated = SearchIntentSchema.safeParse(parsed);
    if (!validated.success) {
      return { success: false, error: "AI returned an unexpected intent format." };
    }

    void logDmsAiUsage({
      providerConfigId: configId ?? null,
      featureArea: "DMS_AI_SEARCH",
      operationType: "intent_extraction",
      modelId: result.model,
      status: "success",
      inputTokenCount: result.promptTokens ?? null,
      outputTokenCount: result.completionTokens ?? null,
      durationMs,
      createdBy: ctx.profile?.id ?? null,
      metadata: {
        input_char_count: question.length,
        output_char_count: result.rawJson.length,
        prompt_version: AI_SEARCH_PROMPT_VERSION,
      },
    });

    return { success: true, data: validated.data as DmsSearchIntent };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "AI intent extraction failed.",
    };
  }
}

// ── searchDmsDocumentsByIntent ─────────────────────────────────────────────────

export async function searchDmsDocumentsByIntent(
  intent: DmsSearchIntent
): Promise<ActionResult<DmsAiSearchResult[]>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.documents.view")) {
    return { success: false, error: "Permission denied." };
  }

  const isAdmin = isAdminUser(ctx);

  try {
    const supabase = await createClient();

    // Resolve type hint to ID
    let typeId: number | null = null;
    if (intent.document_type_hint) {
      const hint = intent.document_type_hint.toLowerCase();
      const { data: types } = await supabase
        .from("dms_document_types")
        .select("id, name_en, type_code")
        .is("deleted_at", null)
        .limit(50);
      if (types) {
        const match = (types as { id: number; name_en: string; type_code: string }[]).find(
          (t) =>
            t.name_en.toLowerCase().includes(hint) ||
            t.type_code.toLowerCase().includes(hint)
        );
        if (match) typeId = match.id;
      }
    }

    // Resolve category hint to ID
    let categoryId: number | null = null;
    if (intent.category_hint) {
      const hint = intent.category_hint.toLowerCase();
      const { data: cats } = await supabase
        .from("dms_document_categories")
        .select("id, name_en")
        .is("deleted_at", null)
        .limit(50);
      if (cats) {
        const match = (cats as { id: number; name_en: string }[]).find((c) =>
          c.name_en.toLowerCase().includes(hint)
        );
        if (match) categoryId = match.id;
      }
    }

    // Base query — never return content_text
    let query = supabase
      .from("dms_documents")
      .select(
        `id, document_no, title, description, document_type_id, category_id,
         issue_date, expiry_date, confidentiality_level, ai_risk_level,
         completeness_score, ai_summary, content_tsv,
         dms_document_types!left(name_en),
         dms_document_categories!left(name_en)`
      )
      .is("deleted_at", null)
      .limit(MAX_RESULTS);

    // Exclude confidential documents for non-admin users
    if (!isAdmin) {
      query = query.not("confidentiality_level", "in", `(${CONFIDENTIAL_TYPES.join(",")})`);
    }

    // Type filter
    if (typeId) {
      query = query.eq("document_type_id", typeId);
    }

    // Category filter
    if (categoryId) {
      query = query.eq("category_id", categoryId);
    }

    // Expiry state filter
    const today = new Date().toISOString().split("T")[0];
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    if (intent.expiry_state === "expired") {
      query = query.lt("expiry_date", today);
    } else if (intent.expiry_state === "expiring_soon") {
      query = query.gte("expiry_date", today).lte("expiry_date", in30Days);
    } else if (intent.expiry_state === "valid") {
      query = query.or(`expiry_date.is.null,expiry_date.gte.${today}`);
    }

    // Date range filter on issue_date
    if (intent.date_from) {
      query = query.gte("issue_date", intent.date_from);
    }
    if (intent.date_to) {
      query = query.lte("issue_date", intent.date_to);
    }

    // Risk level filter
    if (intent.risk_hint) {
      query = query.eq("ai_risk_level", intent.risk_hint);
    }

    // Full-text search on content_tsv when keywords exist
    const allKeywords = [
      ...(intent.keywords ?? []),
      ...(intent.outcome_hint ? [intent.outcome_hint] : []),
      ...(intent.person_name_hint ? [intent.person_name_hint] : []),
      ...(intent.party_name_hint ? [intent.party_name_hint] : []),
    ].filter(Boolean);

    if (allKeywords.length > 0) {
      const tsQuery = allKeywords.map((k) => k.trim().replace(/\s+/g, " & ")).join(" | ");
      query = query.textSearch("content_tsv", tsQuery, { type: "plain", config: "simple" });
    } else if (!typeId && !categoryId && !intent.expiry_state && !intent.risk_hint) {
      // No usable filters — return empty to avoid full-table scan
      return { success: true, data: [] };
    }

    const { data, error } = await query;
    if (error) {
      return { success: false, error: "Search query failed." };
    }

    const rows = (data ?? []) as Record<string, unknown>[];

    // Build results with matchReason
    const results: DmsAiSearchResult[] = rows.map((row) => {
      const reasons: string[] = [];

      if (allKeywords.length > 0) reasons.push(`Matched keywords: ${allKeywords.slice(0, 4).join(", ")}`);
      if (typeId && intent.document_type_hint) reasons.push(`Type: ${intent.document_type_hint}`);
      if (categoryId && intent.category_hint) reasons.push(`Category: ${intent.category_hint}`);
      if (intent.expiry_state) reasons.push(`Expiry: ${intent.expiry_state.replace("_", " ")}`);
      if (intent.risk_hint) reasons.push(`Risk: ${intent.risk_hint}`);
      if (intent.date_from || intent.date_to) reasons.push("Date range match");

      const summary = typeof row.ai_summary === "string" && row.ai_summary
        ? row.ai_summary.substring(0, 160) + (row.ai_summary.length > 160 ? "…" : "")
        : null;

      return {
        documentId: row.id as number,
        documentNo: (row.document_no as string) ?? "",
        title: (row.title as string) ?? "",
        aiSummarySnippet: summary,
        contentSnippet: null, // content_text never returned in list
        matchReason: reasons.join(" · ") || "General match",
        riskLevel: (row.ai_risk_level as string | null) ?? null,
        completenessScore: typeof row.completeness_score === "number" ? row.completeness_score : null,
        expiryDate: (row.expiry_date as string | null) ?? null,
      };
    });

    return { success: true, data: results };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Search failed.",
    };
  }
}

// ── askDmsDocumentsQuestion ───────────────────────────────────────────────────

export async function askDmsDocumentsQuestion(question: string): Promise<
  ActionResult<{
    intent: DmsSearchIntent;
    results: DmsAiSearchResult[];
  }>
> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.documents.view")) {
    return { success: false, error: "Permission denied." };
  }

  if (!question || question.trim().length < 3) {
    return { success: false, error: "Please enter a search question." };
  }

  const enabled = await isDmsFeatureEnabled("DMS_CROSS_DOC_SEARCH");
  if (!enabled) {
    return { success: false, error: "Cross-document AI search is currently disabled." };
  }

  const intentResult = await extractDmsSearchIntent(question);
  if (!intentResult.success || !intentResult.data) {
    return { success: false, error: intentResult.error ?? "Intent extraction failed." };
  }

  const intent = intentResult.data;
  const searchResult = await searchDmsDocumentsByIntent(intent);
  if (!searchResult.success) {
    return { success: false, error: searchResult.error ?? "Search failed." };
  }

  await logAudit({
    module_code: "DMS",
    action: "dms_ai_search_used",
    entity_name: "dms_documents",
    entity_id: null,
    entity_reference: "",
    new_values: {
      result_count: searchResult.data?.length ?? 0,
      question_char_count: question.length,
    },
  });

  return {
    success: true,
    data: {
      intent,
      results: searchResult.data ?? [],
    },
  };
}
