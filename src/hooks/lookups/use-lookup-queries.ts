/**
 * TanStack Query hooks for global lookup values.
 * Phase 002F.3E.3B.6B — Global Lookup Cache and Hook Standard
 *
 * These replace the per-instance useLookupValues hook.
 * Multiple components requesting the same categoryCode share ONE cached result.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { mapLookupValueToOption } from "@/lib/lookups/option-mappers";
import {
  getActiveLookupValuesByCategoryCode,
  getActiveLookupValuesByCategoryCodes,
} from "@/server/actions/master-data/lookups";
import type { LookupValue } from "@/features/master-data/lookups/types";
import type { ERPComboboxOption } from "@/components/erp/combobox";

// ── Options types ──────────────────────────────────────────────────────────────

export interface LookupQueryOptions {
  parentValueCode?: string | null;
  includeInactive?: boolean;
  enabled?: boolean;
}

export interface LookupQueryResult {
  data: LookupValue[];
  options: ERPComboboxOption[];
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  refetch: () => void;
}

export interface LookupBatchQueryResult {
  data: Record<string, LookupValue[]>;
  options: Record<string, ERPComboboxOption[]>;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  refetch: () => void;
}

// ── useLookupValuesQuery ───────────────────────────────────────────────────────

/**
 * Cached lookup values for a single category code.
 *
 * TanStack Query deduplicates concurrent calls with the same key, so two
 * LookupSelect components with categoryCode="PARTY_STATUS_TYPES" share ONE
 * server action call and ONE cache entry.
 */
export function useLookupValuesQuery(
  categoryCode: string,
  options: LookupQueryOptions = {}
): LookupQueryResult {
  const { parentValueCode = null, includeInactive = false, enabled = true } = options;

  const result = useQuery({
    queryKey: queryKeys.lookup.values(categoryCode, parentValueCode, includeInactive),
    queryFn: async () => {
      const res = await getActiveLookupValuesByCategoryCode(
        categoryCode,
        parentValueCode,
        includeInactive
      );
      if (!res.success || !res.data) {
        throw new Error(res.error ?? "Failed to load lookup values");
      }
      return res.data;
    },
    enabled: !!categoryCode && enabled,
  });

  const data = result.data ?? [];

  return {
    data,
    options: data.map(mapLookupValueToOption),
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error instanceof Error ? result.error.message : null,
    refetch: () => { void result.refetch(); },
  };
}

// ── useLookupBatchQuery ────────────────────────────────────────────────────────

/**
 * Fetch multiple lookup categories in TWO Supabase round-trips instead of 2×N.
 *
 * Ideal for forms that need many lookup fields (e.g. Customer form with 6
 * categories).  Parent-value filtering is not supported; returns top-level
 * values only.
 *
 * Returns maps: data["CATEGORY_CODE"] and options["CATEGORY_CODE"].
 */
export function useLookupBatchQuery(
  categoryCodes: string[],
  options: { includeInactive?: boolean; enabled?: boolean } = {}
): LookupBatchQueryResult {
  const { includeInactive = false, enabled = true } = options;

  const result = useQuery({
    queryKey: queryKeys.lookup.batch(categoryCodes, includeInactive),
    queryFn: async () => {
      const res = await getActiveLookupValuesByCategoryCodes(
        categoryCodes,
        includeInactive
      );
      if (!res.success || !res.data) {
        throw new Error(res.error ?? "Failed to load lookup values");
      }
      return res.data;
    },
    enabled: categoryCodes.length > 0 && enabled,
  });

  const data = result.data ?? {};

  const mappedOptions: Record<string, ERPComboboxOption[]> = {};
  for (const [code, values] of Object.entries(data)) {
    mappedOptions[code] = values.map(mapLookupValueToOption);
  }

  return {
    data,
    options: mappedOptions,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error instanceof Error ? result.error.message : null,
    refetch: () => { void result.refetch(); },
  };
}
