/**
 * TanStack Query hooks for organisation and finance-centre master-data.
 * Phase 002F.3E.3B.6D — Apply Optimized Hooks to Current Forms
 *
 * Covers: owner companies, branches, cost centres, profit centres.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/query-keys";
import {
  mapOwnerCompanyToOption,
  mapBranchToOption,
  mapCostCenterToOption,
  mapProfitCenterToOption,
  type OwnerCompanyRow,
  type BranchRow,
  type CostCenterRow,
  type ProfitCenterRow,
} from "@/lib/lookups/option-mappers";
import type { ERPComboboxOption } from "@/components/erp/combobox";

// ── Shared ─────────────────────────────────────────────────────────────────────

interface OrgQueryResult<T> {
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

// ── useOwnerCompaniesQuery ─────────────────────────────────────────────────────

export interface OwnerCompaniesQueryOptions {
  includeInactive?: boolean;
  enabled?: boolean;
}

export function useOwnerCompaniesQuery(
  options: OwnerCompaniesQueryOptions = {}
): OrgQueryResult<OwnerCompanyRow> {
  const { includeInactive = false, enabled = true } = options;

  const result = useQuery({
    queryKey: queryKeys.ownerCompanies(includeInactive),
    queryFn: async (): Promise<OwnerCompanyRow[]> => {
      const supabase = createClient();
      let query = supabase
        .from("owner_companies")
        .select("id, company_code, legal_name_en, legal_name_ar, short_name")
        .order("legal_name_en", { ascending: true });

      if (!includeInactive) query = query.eq("status", "active");

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as OwnerCompanyRow[];
    },
    enabled,
  });

  const data = result.data ?? [];
  return {
    data,
    options: data.map(mapOwnerCompanyToOption),
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? errorMsg(result.error) : null,
    refetch: () => { void result.refetch(); },
  };
}

// ── useBranchesQuery ───────────────────────────────────────────────────────────

export interface BranchesQueryOptions {
  ownerCompanyId?: number | null;
  includeInactive?: boolean;
  enabled?: boolean;
}

export function useBranchesQuery(
  options: BranchesQueryOptions = {}
): OrgQueryResult<BranchRow> {
  const { ownerCompanyId = null, includeInactive = false, enabled = true } = options;

  const result = useQuery({
    queryKey: queryKeys.branches(ownerCompanyId, includeInactive),
    queryFn: async (): Promise<BranchRow[]> => {
      const supabase = createClient();
      let query = supabase
        .from("branches")
        .select("id, branch_code, branch_name_en, branch_name_ar, owner_company_id")
        .order("branch_name_en", { ascending: true });

      if (ownerCompanyId) query = query.eq("owner_company_id", ownerCompanyId);
      if (!includeInactive) query = query.eq("status", "active");

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as BranchRow[];
    },
    enabled,
  });

  const data = result.data ?? [];
  return {
    data,
    options: data.map(mapBranchToOption),
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? errorMsg(result.error) : null,
    refetch: () => { void result.refetch(); },
  };
}

// ── useCostCentersQuery ────────────────────────────────────────────────────────

export interface CostCentersQueryOptions {
  ownerCompanyId?: number | null;
  includeInactive?: boolean;
  enabled?: boolean;
}

export function useCostCentersQuery(
  options: CostCentersQueryOptions = {}
): OrgQueryResult<CostCenterRow> {
  const { ownerCompanyId = null, includeInactive = false, enabled = true } = options;

  const result = useQuery({
    queryKey: queryKeys.costCenters(ownerCompanyId, includeInactive),
    queryFn: async (): Promise<CostCenterRow[]> => {
      const supabase = createClient();
      let query = supabase
        .from("cost_centers")
        .select("id, cost_center_code, cost_center_name_en, cost_center_name_ar, owner_company_id")
        .order("sort_order", { ascending: true })
        .order("cost_center_name_en", { ascending: true });

      if (!includeInactive) query = query.eq("is_active", true);
      if (ownerCompanyId != null) query = query.eq("owner_company_id", ownerCompanyId);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as CostCenterRow[];
    },
    enabled,
  });

  const data = result.data ?? [];
  return {
    data,
    options: data.map(mapCostCenterToOption),
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? errorMsg(result.error) : null,
    refetch: () => { void result.refetch(); },
  };
}

// ── useProfitCentersQuery ──────────────────────────────────────────────────────

export interface ProfitCentersQueryOptions {
  ownerCompanyId?: number | null;
  includeInactive?: boolean;
  enabled?: boolean;
}

export function useProfitCentersQuery(
  options: ProfitCentersQueryOptions = {}
): OrgQueryResult<ProfitCenterRow> {
  const { ownerCompanyId = null, includeInactive = false, enabled = true } = options;

  const result = useQuery({
    queryKey: queryKeys.profitCenters(ownerCompanyId, includeInactive),
    queryFn: async (): Promise<ProfitCenterRow[]> => {
      const supabase = createClient();
      let query = supabase
        .from("profit_centers")
        .select("id, profit_center_code, profit_center_name_en, profit_center_name_ar, owner_company_id")
        .order("sort_order", { ascending: true })
        .order("profit_center_name_en", { ascending: true });

      if (!includeInactive) query = query.eq("is_active", true);
      if (ownerCompanyId != null) query = query.eq("owner_company_id", ownerCompanyId);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as ProfitCenterRow[];
    },
    enabled,
  });

  const data = result.data ?? [];
  return {
    data,
    options: data.map(mapProfitCenterToOption),
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? errorMsg(result.error) : null,
    refetch: () => { void result.refetch(); },
  };
}
