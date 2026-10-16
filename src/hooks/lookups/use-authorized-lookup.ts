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
import { useLookupReadLease } from "./use-lookup-read-lease";

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
  const hasSelected = selected !== null && selected !== "";
  const queryKey = queryKeys.lookup.values(categoryCode, parentValueCode, includeInactive);
  const activeLease = useLookupReadLease(enabled && !!categoryCode, queryKey);

  const result = useQuery({
    queryKey,
    queryFn: ({signal}) => activeLease.run(signal, async () => {
      const res = await readJson<{success:true;data:LookupValue[]}>("lookup-values", {categoryCode,parentValueCode,includeInactive}, signal);
      if (!res.success || !Array.isArray(res.data)) {
        throw new Error("Failed to load lookup values");
      }
      return res.data;
    }),
    enabled: activeLease.enabled,
    retry: retryAuthorizedRead,
  });

  const present = (result.data ?? []).some(value => String(valueField === "code" ? value.value_code : value.id) === String(selected));
  const selectedKey = [...queryKey, "selected", valueField, selected];
  const selectedLease = useLookupReadLease(enabled && !!categoryCode && hasSelected, selectedKey);
  const selection = useQuery({
    queryKey: selectedKey,
    queryFn: ({signal}) => selectedLease.run(signal, async () => {
      const result = (await readJson<{success:true;data:LookupValue[]}>("lookup-values", {categoryCode,parentValueCode,includeInactive,selected,valueField}, signal)).data;
      if (!Array.isArray(result)) throw Error("Failed to load lookup values");
      return result;
    }),
    enabled: selectedLease.enabled && result.isSuccess && !present,
    retry: retryAuthorizedRead,
  });
  const denied = (result.error instanceof ReadError && [401,403].includes(result.error.status)) || (!present && selection.error instanceof ReadError && [401,403].includes(selection.error.status));
  const data = denied || !activeLease.readable() ? [] : [...(result.data ?? []), ...(!present && hasSelected && selectedLease.readable() ? selection.data ?? [] : [])];

  return {
    data,
    options: data.map(mapLookupValueToOption),
    isLoading: result.isLoading || selection.isLoading,
    isFetching: result.isFetching || selection.isFetching,
    error: result.error instanceof Error ? result.error.message : !present && selection.error instanceof Error ? selection.error.message : null,
    refetch: async () => {
      if (!activeLease.isCurrent() || (hasSelected && !present && !selectedLease.isCurrent())) return;
      // Register all reads before yielding: a cancelled first read can resolve,
      // but must not dispatch a selected-value read into a retired cache.
      const pending = [result.refetch()];
      if (hasSelected && !present && selectedLease.isCurrent()) pending.push(selection.refetch());
      await Promise.all(pending);
    },
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
  const queryKey = queryKeys.lookup.batch(categoryCodes, includeInactive);
  const lease = useLookupReadLease(enabled && categoryCodes.length > 0, queryKey);

  const result = useQuery({
    queryKey,
    queryFn: ({signal}) => lease.run(signal, async () => {
      const res = await readJson<{success:true;data:Record<string,LookupValue[]>}>("lookup-batch", {categoryCodes,includeInactive}, signal);
      if (!res.success || !res.data || categoryCodes.some(code => !Array.isArray(res.data[code.trim().toUpperCase()]))) {
        throw new Error("Failed to load lookup values");
      }
      return res.data;
    }),
    enabled: lease.enabled,
    retry: retryAuthorizedRead,
  });

  const denied = result.error instanceof ReadError && [401,403].includes(result.error.status);
  const data = denied || !lease.readable() ? {} : result.data ?? {};

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
    refetch: async () => { if (lease.isCurrent()) await result.refetch(); },
  };
}
