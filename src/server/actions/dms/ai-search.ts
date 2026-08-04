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
const AI_SEARCH_PROMPT_VERSION = "v2.0";
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
  person_dob_hint: z.string().nullable().default(null),
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
  return `You are a search intent extractor for an ERP Document Management System (DMS) operating in the UAE.

Your task: analyse the user's question and return ONLY a JSON object that represents the search intent.

RULES:
- Do NOT answer the question. Do NOT invent filters. Do NOT include data you are not sure about.
- Return ONLY valid JSON. No markdown. No explanation.
- Leave a field null if you are not confident about its value.

FIELDS (all nullable unless stated):
- keywords: string[] — short keywords for full-text search of document content (always provide if any meaningful words found)
- document_type_hint: string or null — document type (e.g. "passport", "medical certificate", "insurance policy", "emirates id", "visa")
- category_hint: string or null — broad category (e.g. "HR", "Health & Safety", "Insurance", "Finance")
- person_name_hint: string or null — full or partial name of a person mentioned
- party_name_hint: string or null — company or party name mentioned
- person_dob_hint: string or null — date of birth extracted from the question. Use ISO format:
    * Full date:         "YYYY-MM-DD"  (when year is known — e.g. "born 09 august 1990" → "1990-08-09")
    * Day + month only: "--MM-DD"     (when year is unknown — e.g. "born 09 august" → "--08-09")
    * Month only:       "--MM"        (e.g. "born in August" → "--08")
    * null if date of birth is NOT mentioned
- date_from: string or null — ISO YYYY-MM-DD — earliest issue/creation date relevant to the query
- date_to: string or null — ISO YYYY-MM-DD — latest issue/creation date relevant to the query
- expiry_state: "expired" | "expiring_soon" | "valid" | null — only if query is about document expiry
- outcome_hint: string or null — outcome keyword (e.g. "fit", "unfit", "approved", "rejected", "passed", "failed", "issued")
- risk_hint: "high" | "medium" | "low" | null — only if risk level is explicitly mentioned
- metadata_filters: array of { field_code: string, value: string } — structured field-level filters.
    Use ONLY these field_code values when confident the user mentioned them:
    * "nationality"           → e.g. "Indian", "Pakistani", "Filipino"
    * "gender"                → "male" or "female"
    * "blood_group"           → e.g. "A+", "O-", "AB+"
    * "emirates_id_number"    → UAE national ID number
    * "passport_number"       → passport number value
    * "visa_number"           → visa or UID number
    * "labour_card_number"    → labour/work permit card number
    * "uid_number"            → UID/file number
    * "document_number"       → generic document number
    * "license_number"        → driving or professional license number
    * "result"                → test/medical result value (e.g. "negative", "positive")
    * "medical_center"        → name of medical center/clinic
    Do NOT use "date_of_birth" as a field_code — use person_dob_hint instead.
- confidentiality_max: one of "internal"|"company"|"finance"|"hr"|"legal"|"executive" or null

EXAMPLES:
- "date of birth 09 august"
  → { person_dob_hint: "--08-09", keywords: [] }
- "born 09 august 1990"
  → { person_dob_hint: "1990-08-09", keywords: ["1990"] }
- "employees born in august"
  → { person_dob_hint: "--08", keywords: ["born", "august"] }
- "Indian passport holders"
  → { document_type_hint: "passport", metadata_filters: [{ field_code: "nationality", value: "Indian" }] }
- "employees with blood group A+"
  → { metadata_filters: [{ field_code: "blood_group", value: "A+" }] }
- "people who passed offshore medical"
  → { keywords: ["offshore", "medical"], outcome_hint: "passed", document_type_hint: "offshore medical certificate" }
- "expired passports"
  → { expiry_state: "expired", document_type_hint: "passport" }
- "Petrofac insurance deductible"
  → { keywords: ["Petrofac", "insurance", "deductible"], party_name_hint: "Petrofac" }
- "passport number A1234567"
  → { document_type_hint: "passport", metadata_filters: [{ field_code: "passport_number", value: "A1234567" }] }
- "Filipino workers"
  → { keywords: ["Filipino"], metadata_filters: [{ field_code: "nationality", value: "Filipino" }] }`;
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

// ── Metadata filter helpers ────────────────────────────────────────────────────

/**
 * Resolve metadata_filters + person_dob_hint against dms_document_metadata_values.
 * Returns a set of document IDs that match ANY of the filters.
 * Empty set = no metadata filters were active, not "zero matches".
 */
async function resolveMetadataFilterDocIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  intent: DmsSearchIntent
): Promise<{ ids: Set<number>; reasons: string[] } | null> {
  const filters: Array<{ field_code: string; value: string; isDate?: boolean; isDobPartial?: boolean }> = [];

  // Generic metadata_filters from intent
  for (const mf of intent.metadata_filters ?? []) {
    if (mf.field_code && mf.value) {
      filters.push({ field_code: mf.field_code, value: mf.value });
    }
  }

  // person_dob_hint → date_of_birth field
  if (intent.person_dob_hint) {
    const dob = intent.person_dob_hint;
    filters.push({
      field_code: "date_of_birth",
      value: dob,
      isDate: true,
      isDobPartial: dob.startsWith("--"),
    });
  }

  if (filters.length === 0) return null;

  // Resolve field_codes → definition_ids in one query
  const fieldCodes = [...new Set(filters.map((f) => f.field_code))];
  const { data: defs } = await supabase
    .from("dms_metadata_definitions")
    .select("id, field_code, field_type")
    .in("field_code", fieldCodes)
    .limit(fieldCodes.length + 5);

  if (!defs || defs.length === 0) return null;

  const defMap = new Map<string, { id: number; field_type: string }>();
  for (const d of defs as { id: number; field_code: string; field_type: string }[]) {
    defMap.set(d.field_code, { id: d.id, field_type: d.field_type });
  }

  const matchedDocIds = new Set<number>();
  const reasons: string[] = [];

  for (const f of filters) {
    const def = defMap.get(f.field_code);
    if (!def) continue;

    let valueQuery = supabase
      .from("dms_document_metadata_values")
      .select("document_id")
      .eq("definition_id", def.id)
      .limit(500);

    if (f.isDate) {
      if (f.isDobPartial) {
        // Partial DOB ("--MM-DD" or "--MM") — match month and optionally day from value_date
        const parts = f.value.replace(/^--/, "").split("-");
        const month = parts[0]?.padStart(2, "0");
        const day = parts[1]?.padStart(2, "0");

        if (month && day) {
          // --MM-DD: match YYYY-MM-DD via text cast; PostgREST supports column::text casting
          valueQuery = valueQuery.filter("value_date::text", "like", `%-${month}-${day}`);
          reasons.push(`Born on day ${day} of month ${month}`);
        } else if (month) {
          // --MM: month-only — match YYYY-MM-*
          valueQuery = valueQuery.filter("value_date::text", "like", `%-${month}-%`);
          reasons.push(`Born in month ${month}`);
        } else {
          continue;
        }
      } else {
        // Full DOB: exact date match
        valueQuery = valueQuery.eq("value_date", f.value);
        reasons.push(`Date of birth: ${f.value}`);
      }
    } else {
      // Text field — case-insensitive contains
      valueQuery = valueQuery.ilike("value_text", `%${f.value}%`);
      reasons.push(`${f.field_code}: ${f.value}`);
    }

    const { data: vals } = await valueQuery;
    for (const v of (vals ?? []) as { document_id: number }[]) {
      matchedDocIds.add(v.document_id);
    }
  }

  return { ids: matchedDocIds, reasons };
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

    // Resolve metadata filters (DOB + custom fields) → document IDs
    const metaResult = await resolveMetadataFilterDocIds(supabase, intent);
    const metaDocIds = metaResult?.ids ?? new Set<number>();
    const metaReasons = metaResult?.reasons ?? [];

    // If metadata filters were specified but matched nothing, return empty
    const hasMetaFilters = metaResult !== null;
    if (hasMetaFilters && metaDocIds.size === 0) {
      return { success: true, data: [] };
    }

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

    // Narrow to metadata-matched document IDs (when filters were active)
    if (hasMetaFilters && metaDocIds.size > 0) {
      query = query.in("id", [...metaDocIds]);
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
    } else if (
      !hasMetaFilters &&
      !typeId &&
      !categoryId &&
      !intent.expiry_state &&
      !intent.risk_hint
    ) {
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

      if (metaReasons.length > 0) reasons.push(...metaReasons);
      if (allKeywords.length > 0) reasons.push(`Keywords: ${allKeywords.slice(0, 3).join(", ")}`);
      if (typeId && intent.document_type_hint) reasons.push(`Type: ${intent.document_type_hint}`);
      if (categoryId && intent.category_hint) reasons.push(`Category: ${intent.category_hint}`);
      if (intent.expiry_state) reasons.push(`Expiry: ${intent.expiry_state.replace("_", " ")}`);
      if (intent.risk_hint) reasons.push(`Risk: ${intent.risk_hint}`);
      if (intent.date_from || intent.date_to) reasons.push("Date range match");

      const summary =
        typeof row.ai_summary === "string" && row.ai_summary
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
        completenessScore:
          typeof row.completeness_score === "number" ? row.completeness_score : null,
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
