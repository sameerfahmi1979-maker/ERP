/**
 * TanStack Query hooks for global lookup values.
 * Phase 002F.3E.3B.6B — Global Lookup Cache and Hook Standard
 *
 * Opt-in P02 transport; existing legacy hooks remain unchanged.
 * Multiple consumers of identical criteria share one cached result.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/authorized-lookup-keys";
import { ReadError, readJson, retryAuthorizedRead } from "@/lib/reads/client";
import type { LookupChoice as LookupValue } from "@/lib/reads/lookup-contract";
import type { ERPComboboxOption } from "@/components/erp/combobox";

const mapLookupValueToOption = (row: LookupValue): ERPComboboxOption => ({value: row.id, label: row.value_label_en, labelAr: row.value_label_ar, code: row.value_code, colorHex: row.color_hex, badge: row.badge_variant, raw: row});

// ── Options types ──────────────────────────────────────────────────────────────

export interface LookupQueryOptions {
  parentValueCode?: string | null;
  includeInactive?: boolean;
  enabled?: boolean;
  selected?: string | number | null;
  valueField?: "id" | "code";
}

export interface LookupQueryResult {
  data: LookupValue[];
  options: ERPComboboxOption[];
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  refetch: () => Promise<unknown>;
}

export interface LookupBatchQueryResult {
  data: Record<string, LookupValue[]>;
  options: Record<string, ERPComboboxOption[]>;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  refetch: () => Promise<unknown>;
}

// ── useLookupValuesQuery ───────────────────────────────────────────────────────

/**
 * Cached lookup values for a single category code.
 *
 * TanStack Query deduplicates concurrent calls with the same key, so two
 * LookupSelect components with categoryCode="PARTY_STATUS_TYPES" share ONE
 * read request and ONE cache entry.
 */
export function useLookupValuesQuery(
  categoryCode: string,
  options: LookupQueryOptions = {}
): LookupQueryResult {
  const { parentValueCode = null, includeInactive = false, enabled = true, selected = null, valueField = "id" } = options;

  const result = useQuery({
    queryKey: queryKeys.lookup.values(categoryCode, parentValueCode, includeInactive),
    queryFn: async ({signal}) => {
      const res = await readJson<{success:true;data:LookupValue[]}>("lookup-values", {categoryCode,parentValueCode,includeInactive}, signal);
      if (!res.success || !Array.isArray(res.data)) {
        throw new Error("Failed to load lookup values");
      }
      return res.data;
    },
    enabled: !!categoryCode && enabled,
    retry: retryAuthorizedRead,
  });

  const present = (result.data ?? []).some(value => String(valueField === "code" ? value.value_code : value.id) === String(selected));
  const selection = useQuery({
    queryKey: [...queryKeys.lookup.values(categoryCode, parentValueCode, includeInactive), "selected", valueField, selected],
    queryFn: async ({signal}) => {
      const result = (await readJson<{success:true;data:LookupValue[]}>("lookup-values", {categoryCode,parentValueCode,includeInactive,selected,valueField}, signal)).data;
      if (!Array.isArray(result)) throw Error("Failed to load lookup values");
      return result;
    },
    enabled: !!categoryCode && enabled && selected !== null && selected !== "" && result.isSuccess && !present,
    retry: retryAuthorizedRead,
  });
  const denied = (result.error instanceof ReadError && [401,403].includes(result.error.status)) || (!present && selection.error instanceof ReadError && [401,403].includes(selection.error.status));
  const data = denied ? [] : [...(result.data ?? []), ...(!present && selected !== null ? selection.data ?? [] : [])];

  return {
    data,
    options: data.map(mapLookupValueToOption),
    isLoading: result.isLoading || selection.isLoading,
    isFetching: result.isFetching || selection.isFetching,
    error: result.error instanceof Error ? result.error.message : !present && selection.error instanceof Error ? selection.error.message : null,
    refetch: async () => { await result.refetch(); if (selected !== null && !present) await selection.refetch(); },
  };
}

// ── useLookupBatchQuery ────────────────────────────────────────────────────────

/**
 * Fetch multiple lookup categories in one HTTP read request with count-checked database paging.
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
    queryFn: async ({signal}) => {
      const res = await readJson<{success:true;data:Record<string,LookupValue[]>}>("lookup-batch", {categoryCodes,includeInactive}, signal);
      if (!res.success || !res.data || categoryCodes.some(code => !Array.isArray(res.data[code.trim().toUpperCase()]))) {
        throw new Error("Failed to load lookup values");
      }
      return res.data;
    },
    enabled: categoryCodes.length > 0 && enabled,
    retry: retryAuthorizedRead,
  });

  const denied = result.error instanceof ReadError && [401,403].includes(result.error.status);
  const data = denied ? {} : result.data ?? {};

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
    refetch: () => result.refetch(),
  };
}
