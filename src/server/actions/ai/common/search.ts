"use server";

/**
 * ERP COMMON AI.6 — AI Search Across ERP — Server Actions
 *
 * Read-only, permission-aware search. No action execution, no record mutation.
 * Never returns content_text, OCR text, prompts, raw AI responses, or API keys.
 */

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAuthContext, hasPermission } from "@/lib/rbac/check";
import { logAudit } from "@/server/actions/audit";
import {
  runErpSearch,
  extractErpSearchIntent,
  loadRecentSearches,
  saveRecentSearch,
  clearRecentSearches,
} from "@/lib/ai/common/search";
import type {
  ErpSearchMode,
  ErpSearchEntityType,
  ErpSearchFilters,
  ErpSearchResponse,
  ErpRecentSearch,
  SaveRecentSearchInput,
} from "@/lib/ai/common/search";

export type ActionResult<T = undefined> = T extends undefined
  ? { success: boolean; error?: string; code?: string }
  : { success: boolean; data?: T; error?: string; code?: string };

// ── Feature flag helpers ────────────────────────────────────────────────────────

async function isErpFeatureEnabled(featureCode: string): Promise<boolean> {
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

function canSearch(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "ai.search.use") ||
    hasPermission(ctx, "ai.search.view") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

function canUseAiSearch(ctx: Awaited<ReturnType<typeof getAuthContext>>): boolean {
  return (
    hasPermission(ctx, "ai.search.use") ||
    hasPermission(ctx, "ai.common.admin") ||
    ctx.roleCodes.includes("system_admin")
  );
}

// ── Input schemas ──────────────────────────────────────────────────────────────

const SearchModeSchema = z.enum([
  "quick_keyword",
  "safe_fts",
  "ai_intent",
  "semantic_documents",
  "hybrid",
  "entity_filtered",
]);

const EntityTypeSchema = z.enum([
  "organization",
  "branch",
  "party",
  "site",
  "dms_document",
]);

const SearchInputSchema = z.object({
  query: z.string().min(1).max(500),
  mode: SearchModeSchema.optional().default("quick_keyword"),
  entityTypes: z.array(EntityTypeSchema).optional(),
  riskLevel: z.enum(["none", "low", "medium", "high", "critical"]).optional(),
  page: z.number().int().min(1).max(10).optional().default(1),
  limit: z.number().int().min(1).max(25).optional().default(10),
  includeAiSignals: z.boolean().optional().default(true),
});

const SaveRecentSearchSchema = z.object({
  searchText: z.string().min(1).max(500),
  entityTypes: z.array(EntityTypeSchema).optional(),
  searchMode: SearchModeSchema.optional(),
  resultCount: z.number().int().min(0).optional(),
});

const IntentInputSchema = z.object({
  query: z.string().min(1).max(500),
});

const SuggestionsInputSchema = z.object({
  query: z.string().min(1).max(200),
  limit: z.number().int().min(1).max(10).optional().default(5),
});

// ── searchAcrossErp ────────────────────────────────────────────────────────────

export async function searchAcrossErp(
  rawInput: unknown
): Promise<ActionResult<ErpSearchResponse>> {
  try {
    const parsed = SearchInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
    }

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated.", code: "UNAUTHENTICATED" };
    if (!canSearch(ctx)) return { success: false, error: "Permission denied.", code: "PERMISSION_DENIED" };

    const input = parsed.data;
    const aiSearchEnabled = await isErpFeatureEnabled("AI_SEARCH");
    const semanticEnabled = await isErpFeatureEnabled("DMS_SEMANTIC_SEARCH");

    const filters: ErpSearchFilters = {
      query: input.query,
      mode: input.mode as ErpSearchMode,
      entityTypes: input.entityTypes as ErpSearchEntityType[] | undefined,
      limit: input.limit,
      includeAiSignals: input.includeAiSignals,
    };

    const response = await runErpSearch(filters, ctx, {
      aiSearchEnabled,
      semanticEnabled,
    });

    // Save recent search (non-blocking — safe metadata only)
    void saveRecentSearch(ctx.profile.id as number, {
      searchText: input.query,
      entityTypes: input.entityTypes as ErpSearchEntityType[] | undefined,
      searchMode: input.mode as ErpSearchMode,
      resultCount: response.totalCount,
    });

    // Audit log — safe metadata only, never query text
    void logAudit({
      module_code: "AI",
      entity_name: "erp_ai_search",
      entity_id: null,
      entity_reference: "",
      action: "read",
      new_values: {
        action: "erp_search_performed",
        mode: input.mode,
        result_count: response.totalCount,
        partial: response.partialResults,
        user_id: ctx.profile.id,
      },
    });

    return { success: true, data: response };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Search failed.",
    };
  }
}

// ── extractErpSearchIntentAction ───────────────────────────────────────────────

export async function extractErpSearchIntentAction(
  rawInput: unknown
): Promise<ActionResult<{ intent: ReturnType<typeof extractErpSearchIntent> extends Promise<infer T> ? T : never }>> {
  try {
    const parsed = IntentInputSchema.safeParse(rawInput);
    if (!parsed.success) {
      return { success: false, error: "Invalid input." };
    }

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canUseAiSearch(ctx)) return { success: false, error: "Permission denied." };

    const aiSearchEnabled = await isErpFeatureEnabled("AI_SEARCH");
    if (!aiSearchEnabled) {
      return { success: false, error: "AI Search feature is currently disabled.", code: "FEATURE_DISABLED" };
    }

    const result = await extractErpSearchIntent(parsed.data.query, true);

    void logAudit({
      module_code: "AI",
      entity_name: "erp_ai_search",
      entity_id: null,
      entity_reference: "",
      action: "read",
      new_values: {
        action: "erp_search_intent_extracted",
        used_ai: result.usedAi,
        user_id: ctx.profile.id,
      },
    });

    return { success: true, data: { intent: result } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Intent extraction failed." };
  }
}

// ── getErpSearchSuggestions ────────────────────────────────────────────────────

export async function getErpSearchSuggestions(
  rawInput: unknown
): Promise<ActionResult<string[]>> {
  try {
    const parsed = SuggestionsInputSchema.safeParse(rawInput);
    if (!parsed.success) return { success: false, error: "Invalid input." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canSearch(ctx)) return { success: false, error: "Permission denied." };

    const q = parsed.data.query.trim();
    const limit = parsed.data.limit;

    const supabase = await createClient();

    // Suggest from recent searches — only own (RLS)
    const { data } = await supabase
      .from("erp_ai_recent_searches")
      .select("search_text")
      .eq("user_id", ctx.profile.id as number)
      .is("deleted_at", null)
      .ilike("search_text", `${q}%`)
      .order("created_at", { ascending: false })
      .limit(limit);

    const suggestions = [
      ...new Set((data ?? []).map((r: Record<string, unknown>) => r.search_text as string)),
    ].slice(0, limit);

    return { success: true, data: suggestions };
  } catch {
    return { success: true, data: [] };
  }
}

// ── getRecentSearches ──────────────────────────────────────────────────────────

export async function getRecentSearches(): Promise<ActionResult<ErpRecentSearch[]>> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canSearch(ctx)) return { success: false, error: "Permission denied." };

    const results = await loadRecentSearches(ctx.profile.id as number);
    return { success: true, data: results };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to load recent searches." };
  }
}

// ── saveRecentSearchAction ─────────────────────────────────────────────────────

export async function saveRecentSearchAction(
  rawInput: unknown
): Promise<ActionResult> {
  try {
    const parsed = SaveRecentSearchSchema.safeParse(rawInput);
    if (!parsed.success) return { success: false, error: "Invalid input." };

    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canUseAiSearch(ctx)) return { success: false, error: "Permission denied." };

    const input: SaveRecentSearchInput = {
      searchText: parsed.data.searchText,
      entityTypes: parsed.data.entityTypes as ErpSearchEntityType[] | undefined,
      searchMode: parsed.data.searchMode as ErpSearchMode | undefined,
      resultCount: parsed.data.resultCount,
    };

    await saveRecentSearch(ctx.profile.id as number, input);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to save." };
  }
}

// ── clearRecentSearchesAction ──────────────────────────────────────────────────

export async function clearRecentSearchesAction(): Promise<ActionResult> {
  try {
    const ctx = await getAuthContext();
    if (!ctx.profile) return { success: false, error: "Not authenticated." };
    if (!canUseAiSearch(ctx)) return { success: false, error: "Permission denied." };

    await clearRecentSearches(ctx.profile.id as number);
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to clear." };
  }
}

// ── isAiSearchEnabled ──────────────────────────────────────────────────────────

export async function isAiSearchEnabled(): Promise<ActionResult<{ enabled: boolean; semanticEnabled: boolean }>> {
  try {
    const [aiSearch, semantic] = await Promise.all([
      isErpFeatureEnabled("AI_SEARCH"),
      isErpFeatureEnabled("DMS_SEMANTIC_SEARCH"),
    ]);
    return { success: true, data: { enabled: aiSearch, semanticEnabled: semantic } };
  } catch {
    return { success: true, data: { enabled: false, semanticEnabled: false } };
  }
}
