/**
 * TanStack Query hooks for finance-basics and related master-data.
 * Phase 002F.3E.3B.6B — Global Lookup Cache and Hook Standard
 *
 * Uses the Supabase browser client directly (consistent with existing pattern).
 * TanStack Query deduplicates and caches results so opening Customer + Branch
 * forms in the same session does not re-fetch the currencies / payment terms lists.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/query-keys";
import {
  mapCurrencyToOption,
  mapBankToOption,
  mapPaymentTermToOption,
  mapTaxTypeToOption,
  type CurrencyRow,
  type BankRow,
  type PaymentTermRow,
  type TaxTypeRow,
} from "@/lib/lookups/option-mappers";
import type { ERPComboboxOption } from "@/components/erp/combobox";
import {
  fetchCurrencies,
  fetchPaymentTerms,
  fetchTaxTypes,
} from "@/lib/lookups/master-data-fetchers";

interface FinanceQueryResult<T> {
  data: T[];
  options: ERPComboboxOption[];
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  refetch: () => void;
}

function errorMsg(err: unknown): string {
  return err instanceof Error ? err.message : "Failed to load data";
}

// ── useCurrenciesQuery ─────────────────────────────────────────────────────────

export interface CurrenciesQueryOptions {
  includeInactive?: boolean;
  enabled?: boolean;
}

export function useCurrenciesQuery(
  options: CurrenciesQueryOptions = {}
): FinanceQueryResult<CurrencyRow> {
  const { includeInactive = false, enabled = true } = options;

  const result = useQuery({
    queryKey: queryKeys.currencies(includeInactive),
    // Shared fetcher (3B.6G.1) so prefetch and hook can never drift.
    queryFn: () => fetchCurrencies(includeInactive),
    enabled,
  });

  const data = result.data ?? [];
  return {
    data,
    options: data.map(mapCurrencyToOption),
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? errorMsg(result.error) : null,
    refetch: () => { void result.refetch(); },
  };
}

// ── useBanksQuery ─────────────────────────────────────────────────────────────

export interface BanksQueryOptions {
  countryId?: number | null;
  includeInactive?: boolean;
  enabled?: boolean;
}

export function useBanksQuery(
  options: BanksQueryOptions = {}
): FinanceQueryResult<BankRow> {
  const { countryId = null, includeInactive = false, enabled = true } = options;

  const result = useQuery({
    queryKey: queryKeys.banks(countryId, includeInactive),
    queryFn: async (): Promise<BankRow[]> => {
      const supabase = createClient();
      let query = supabase
        .from("banks")
        .select("id, bank_code, bank_name_en, bank_name_ar, short_name")
        .order("sort_order", { ascending: true })
        .order("bank_name_en", { ascending: true });

      if (!includeInactive) query = query.eq("is_active", true);
      if (countryId) query = query.eq("country_id", countryId);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as BankRow[];
    },
    enabled,
  });

  const data = result.data ?? [];
  return {
    data,
    options: data.map(mapBankToOption),
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? errorMsg(result.error) : null,
    refetch: () => { void result.refetch(); },
  };
}

// ── usePaymentTermsQuery ───────────────────────────────────────────────────────

export interface PaymentTermsQueryOptions {
  includeInactive?: boolean;
  enabled?: boolean;
}

export function usePaymentTermsQuery(
  options: PaymentTermsQueryOptions = {}
): FinanceQueryResult<PaymentTermRow> {
  const { includeInactive = false, enabled = true } = options;

  const result = useQuery({
    queryKey: queryKeys.paymentTerms(includeInactive),
    // Shared fetcher (3B.6G.1) so prefetch and hook can never drift.
    queryFn: () => fetchPaymentTerms(includeInactive),
    enabled,
  });

  const data = result.data ?? [];
  return {
    data,
    options: data.map(mapPaymentTermToOption),
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? errorMsg(result.error) : null,
    refetch: () => { void result.refetch(); },
  };
}

// ── useTaxTypesQuery ──────────────────────────────────────────────────────────

export interface TaxTypesQueryOptions {
  includeInactive?: boolean;
  enabled?: boolean;
}

export function useTaxTypesQuery(
  options: TaxTypesQueryOptions = {}
): FinanceQueryResult<TaxTypeRow> {
  const { includeInactive = false, enabled = true } = options;

  const result = useQuery({
    queryKey: queryKeys.taxTypes(includeInactive),
    // Shared fetcher (3B.6G.1) so prefetch and hook can never drift.
    queryFn: () => fetchTaxTypes(includeInactive),
    enabled,
  });

  const data = result.data ?? [];
  return {
    data,
    options: data.map(mapTaxTypeToOption),
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? errorMsg(result.error) : null,
    refetch: () => { void result.refetch(); },
  };
}
