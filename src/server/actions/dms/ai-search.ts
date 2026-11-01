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
import {aiSearchTextTerms, buildAiSearchTextQuery, matchAiSearchLookups, type AiSearchLookup} from "@/lib/dms/ai/search-text";
import {readAllPages} from "@/server/reads/all-pages";
import {prepareDocumentQuery,SearchClarification} from "@/server/ai/search/document-query";
import {normalizeIdentity} from "@/lib/ai/search/vocabulary";
import {verifySearchDelivery} from "@/server/ai/search/security";
import {constrainDocumentQuery} from "@/server/ai/search/documents";
import {sharedSearchSchema} from "@/lib/ai/search/vocabulary";
import { logDmsAiUsage } from "@/lib/ai/observability/log-dms-ai-usage";
import { logger } from "@/lib/logger";

// ── Types ─────────────────────────────────────────────────────────────────────

export type ActionResult<T = unknown> = {
  success: boolean;
  data?: T;
  error?: string;
  totalCount?:number;
};

// ── Constants ─────────────────────────────────────────────────────────────────

const CONFIDENTIAL_TYPES = ["hr", "legal", "executive"] as const;
const AI_SEARCH_PROMPT_VERSION = "v2.1";
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
  keywords: z.array(z.string().max(200)).max(40).default([]),
  document_type_hint: z.string().nullable().default(null),
  category_hint: z.string().nullable().default(null),
  person_name_hint: z.string().nullable().default(null),
  party_name_hint: z.string().nullable().default(null),
  person_dob_hint: z.string().nullable().default(null),
  date_from: z.iso.date().nullable().default(null),
  date_to: z.iso.date().nullable().default(null),
  expiry_state: z.enum(["expired", "expiring_soon", "valid"]).nullable().default(null),
  outcome_hint: z.string().nullable().default(null),
  risk_hint: z.enum(["high", "medium", "low"]).nullable().default(null),
  metadata_filters: z
    .array(z.object({ field_code: z.string().regex(/^[a-z][a-z0-9_]{0,99}$/), value: z.string().min(1).max(200) }).strict()).max(20)
    .default([]),
  confidentiality_max: z
    .enum(["internal", "company", "finance", "hr", "legal", "executive"])
    .nullable()
    .default(null),
}).strict();

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
- "ISO certificates"
  → { keywords: ["ISO", "certificate"], document_type_hint: "ISO certificate" }
- "ISO 9001 certificates"
  → { keywords: ["ISO", "9001", "certificate"], document_type_hint: "ISO 9001 certificate" }
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
async function readSearchLookups(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: "dms_document_types" | "dms_document_categories",
): Promise<AiSearchLookup[]> {
  const columns = table === "dms_document_types"
    ? "id,name_en,type_code"
    : "id,name_en,type_code:category_code";
  return readAllPages<AiSearchLookup>(async (from, to) => {
    const {data, count, error} = await supabase.from(table)
      .select(columns, {count: "exact"}).is("deleted_at", null)
      .order("id").range(from, to);
    return {data: data as unknown as AiSearchLookup[] | null, count, error};
  }, {batchSize: 100, identity: row => row.id, maxRows: 5000});
}

// ── searchDmsDocumentsByIntent ─────────────────────────────────────────────────

export async function searchDmsDocumentsByIntent(
  intent: DmsSearchIntent,paging:unknown={page:1,pageSize:MAX_RESULTS},scope:unknown={}
): Promise<ActionResult<DmsAiSearchResult[]>> {
  const ctx = await getAuthContext();
  if (!hasPermission(ctx, "dms.documents.view")) {
    return { success: false, error: "Permission denied." };
  }

  const parsedIntent = SearchIntentSchema.safeParse(intent);
  if (!parsedIntent.success) return {success: false, error: "Invalid search filters."};
  const parsedPage=z.strictObject({page:z.number().int().min(1).max(100000).default(1),pageSize:z.number().int().min(1).max(100).default(MAX_RESULTS)}).safeParse(paging);
  if(!parsedPage.success)return {success:false,error:"Invalid search page."};
  const parsedScope=sharedSearchSchema.shape.filters.safeParse(scope);if(!parsedScope.success)return {success:false,error:"Invalid search scope."};
  intent = parsedIntent.data;
  if(intent.confidentiality_max!==null)return {success:false,error:"A confidentiality ceiling is not supported. Use the exact confidentiality filter."};
  const isAdmin = isAdminUser(ctx);

  try {
    const supabase = await createClient();

    const metadataFilters=[...(intent.metadata_filters??[]),...(intent.person_dob_hint?[{field_code:"date_of_birth",value:intent.person_dob_hint}]:[])];
    const hasMetaFilters=metadataFilters.length>0;
    const metaReasons=metadataFilters.map(f=>f.field_code+": "+f.value);

    // Resolve every permitted configured type/category, not just the first 50.
    // Failed/incomplete lookup reads must not silently remove a user constraint.
    const typeRows=intent.document_type_hint?await readSearchLookups(supabase,"dms_document_types"):[];
    const typeIds = intent.document_type_hint
      ? matchAiSearchLookups(intent.document_type_hint,typeRows).map(row => row.id)
      : [];
    const categoryIds = intent.category_hint
      ? matchAiSearchLookups(intent.category_hint,
          await readSearchLookups(supabase, "dms_document_categories")).map(row => row.id)
      : [];

    // Base query — never return content_text
    const planned=await prepareDocumentQuery(supabase,"",ctx,{personHint:intent.person_name_hint??intent.party_name_hint,typeHint:intent.document_type_hint,metadataFilters,types:typeRows});
    let query = planned.query
      .select(
        "id,document_no,title,created_at,expiry_date,ai_risk_level,completeness_score,ai_summary"
      )
      .is("deleted_at", null)
      .order("created_at",{ascending:false,nullsFirst:false}).order("id",{ascending:false})
      .range((parsedPage.data.page-1)*parsedPage.data.pageSize,parsedPage.data.page*parsedPage.data.pageSize-1);
    query=constrainDocumentQuery(query,sharedSearchSchema.parse({query:"",filters:parsedScope.data}));

    // Exclude confidential documents for non-admin users
    if (!isAdmin) {
      query = query.not("confidentiality_level", "in", `(${CONFIDENTIAL_TYPES.join(",")})`);
    }

    // Type filter
    if (typeIds.length > 0) {
      query = query.in("document_type_id", typeIds);
    }

    // Category filter
    if (categoryIds.length > 0) {
      query = query.in("category_id", categoryIds);
    }

    // Expiry state filter
    const today = new Date(Date.now()+4*3600000).toISOString().split("T")[0];
    const in30Days = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0];

    if (intent.expiry_state === "expired") {
      query = query.lt("expiry_date", today);
    } else if (intent.expiry_state === "expiring_soon") {
      query = query.gte("expiry_date", today).lte("expiry_date", in30Days);
    } else if (intent.expiry_state === "valid") {
      query = query.gte("expiry_date",today).not("expiry_date","is",null);
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

    // Keep independent concepts conjunctive. Expand only reviewed certificate
    // forms; the simple index deliberately does not stem multilingual text.
    const subjectWords=new Set(planned.subject?normalizeIdentity(intent.person_name_hint??intent.party_name_hint??"").split(" "):[]);
    const constrainedIntent=planned.subject?{...intent,keywords:intent.keywords.filter(word=>!subjectWords.has(normalizeIdentity(word))),person_name_hint:null,party_name_hint:null}:intent;
    const allKeywords = aiSearchTextTerms(constrainedIntent, typeIds.length > 0, categoryIds.length > 0);
    const tsQuery = buildAiSearchTextQuery(allKeywords);
    if (tsQuery) {
      query = query.textSearch("content_tsv", tsQuery, {config: "simple"});
    } else if (
      !hasMetaFilters &&
      !planned.subject &&
      typeIds.length === 0 &&
      categoryIds.length === 0 &&
      !intent.expiry_state &&
      !intent.risk_hint &&
      !intent.date_from &&
      !intent.date_to
    ) {
      return { success: true, data: [] };
    }

    const { data, error, count } = await query;
    if (error) {
      // Database messages/details can contain search terms or confidential
      // records. Keep only the bounded diagnostic code, never the raw error.
      const code = typeof error.code === "string" && /^(?:[A-Z0-9]{5}|PGRST\d{3})$/.test(error.code)
        ? error.code : "UNAVAILABLE";
      const column = code === "42703" && typeof error.message === "string"
        ? error.message.match(/^column (?:[a-z_][a-z0-9_]*\.)?"?([a-z_][a-z0-9_]{0,62})"? does not exist$/i)?.[1]
        : undefined;
      logger.error("DMS AI search query failed", { code, ...(column ? {column} : {}) });
      const message = code === "57014"
        ? "The search took too long. No incomplete results were returned."
        : code === "42501"
          ? "Search access could not be verified. Sign in again and retry."
          : "The document search could not be completed.";
      return { success: false, error: `${message} Reference: ${code}${column ? ` (${column})` : ""}.` };
    }

    const rows = (data ?? []) as Record<string, unknown>[];

    // Build results with matchReason
    const results: DmsAiSearchResult[] = rows.map((row) => {
      const reasons: string[] = [];

      if (metaReasons.length > 0) reasons.push(...metaReasons);
      if (allKeywords.length > 0) reasons.push(`Keywords: ${allKeywords.slice(0, 3).join(", ")}`);
      if (typeIds.length > 0 && intent.document_type_hint) reasons.push(`Type: ${intent.document_type_hint}`);
      if (categoryIds.length > 0 && intent.category_hint) reasons.push(`Category: ${intent.category_hint}`);
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

    if(count===null||!Number.isSafeInteger(count)||results.length!==Math.min(parsedPage.data.pageSize,Math.max(0,count-(parsedPage.data.page-1)*parsedPage.data.pageSize)))return {success:false,error:"Search count or page could not be verified."};
    await verifySearchDelivery(ctx);
    return { success: true, data: results,totalCount:count };
  } catch (err) {
    return {
      success: false,
      error: err instanceof SearchClarification?err.message:err instanceof Error ? err.message : "Search failed.",
    };
  }
}

// ── askDmsDocumentsQuestion ───────────────────────────────────────────────────

export async function askDmsDocumentsQuestion(question: string,scope:unknown={}): Promise<
  ActionResult<{
    intent: DmsSearchIntent;
    results: DmsAiSearchResult[];
    totalCount:number;
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
  const searchResult = await searchDmsDocumentsByIntent(intent,undefined,scope);
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
      totalCount:searchResult.totalCount??0,
    },
  };
}
