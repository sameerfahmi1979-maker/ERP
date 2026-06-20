/**
 * ERP COMMON AI.6 — Recent Searches
 *
 * Manages per-user recent search history in erp_ai_recent_searches.
 * Stores safe user-typed text only. Never stores AI output, prompts, or raw AI responses.
 */

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ErpRecentSearch, ErpSearchEntityType, ErpSearchMode, SaveRecentSearchInput } from "./types";

const MAX_RECENT = 20;

type RawRow = {
  id: number;
  search_text: string;
  entity_types: unknown;
  search_mode: string;
  result_count: number;
  created_at: string;
};

function rowToRecent(row: RawRow): ErpRecentSearch {
  return {
    id: row.id,
    searchText: row.search_text,
    entityTypes: Array.isArray(row.entity_types)
      ? (row.entity_types as ErpSearchEntityType[])
      : [],
    searchMode: (row.search_mode as ErpSearchMode) ?? "quick_keyword",
    resultCount: row.result_count ?? 0,
    createdAt: row.created_at,
  };
}

// ── Load recent searches (own only — RLS enforced) ───────────────────────────

export async function loadRecentSearches(
  userProfileId: number
): Promise<ErpRecentSearch[]> {
  try {
    const supabase = await createClient();
    const { data } = await supabase
      .from("erp_ai_recent_searches")
      .select("id, search_text, entity_types, search_mode, result_count, created_at")
      .eq("user_id", userProfileId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(MAX_RECENT);

    return (data ?? []).map((r) => rowToRecent(r as RawRow));
  } catch {
    return [];
  }
}

// ── Save recent search ────────────────────────────────────────────────────────

export async function saveRecentSearch(
  userProfileId: number,
  input: SaveRecentSearchInput
): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.from("erp_ai_recent_searches").insert({
      user_id: userProfileId,
      search_text: input.searchText.substring(0, 500),
      entity_types: input.entityTypes ?? [],
      search_mode: input.searchMode ?? "quick_keyword",
      result_count: input.resultCount ?? 0,
    });

    await trimRecentSearches(userProfileId, MAX_RECENT);
  } catch {
    // Silent — recent searches are non-critical
  }
}

// ── Clear recent searches ─────────────────────────────────────────────────────

export async function clearRecentSearches(userProfileId: number): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase
      .from("erp_ai_recent_searches")
      .update({ deleted_at: new Date().toISOString() })
      .eq("user_id", userProfileId)
      .is("deleted_at", null);
  } catch {
    // Silent
  }
}

// ── Trim to max ───────────────────────────────────────────────────────────────

export async function trimRecentSearches(
  userProfileId: number,
  max: number = MAX_RECENT
): Promise<void> {
  try {
    const adminClient = await createAdminClient();

    const { data } = await adminClient
      .from("erp_ai_recent_searches")
      .select("id, created_at")
      .eq("user_id", userProfileId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    const rows = (data ?? []) as Array<{ id: number }>;
    if (rows.length <= max) return;

    const toDelete = rows.slice(max).map((r) => r.id);
    if (toDelete.length > 0) {
      await adminClient
        .from("erp_ai_recent_searches")
        .update({ deleted_at: new Date().toISOString() })
        .in("id", toDelete);
    }
  } catch {
    // Silent
  }
}
