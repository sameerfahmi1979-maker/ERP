/**
 * TanStack Query hooks for Unit of Measure master-data.
 * Phase 002F.3E.3B.6D — Apply Optimized Hooks to Current Forms
 *
 * Covers: UOM categories and units of measure.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/query-keys";
import {
  mapUomCategoryToOption,
  mapUnitOfMeasureToOption,
  type UomCategoryRow,
  type UnitOfMeasureRow,
} from "@/lib/lookups/option-mappers";
import type { ERPComboboxOption } from "@/components/erp/combobox";

// ── Shared ─────────────────────────────────────────────────────────────────────

interface UomQueryResult<T> {
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

// ── useUomCategoriesQuery ──────────────────────────────────────────────────────

export interface UomCategoriesQueryOptions {
  includeInactive?: boolean;
  enabled?: boolean;
}

export function useUomCategoriesQuery(
  options: UomCategoriesQueryOptions = {}
): UomQueryResult<UomCategoryRow> {
  const { includeInactive = false, enabled = true } = options;

  const result = useQuery({
    queryKey: queryKeys.uomCategories(includeInactive),
    queryFn: async (): Promise<UomCategoryRow[]> => {
      const supabase = createClient();
      let query = supabase
        .from("uom_categories")
        .select("id, category_code, category_name_en, category_name_ar")
        .order("sort_order", { ascending: true })
        .order("category_name_en", { ascending: true });

      if (!includeInactive) query = query.eq("is_active", true);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as UomCategoryRow[];
    },
    enabled,
  });

  const data = result.data ?? [];
  return {
    data,
    options: data.map(mapUomCategoryToOption),
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? errorMsg(result.error) : null,
    refetch: () => { void result.refetch(); },
  };
}

// ── useUnitsOfMeasureQuery ─────────────────────────────────────────────────────

export interface UnitsOfMeasureQueryOptions {
  categoryId?: number | null;
  includeInactive?: boolean;
  enabled?: boolean;
}

export function useUnitsOfMeasureQuery(
  options: UnitsOfMeasureQueryOptions = {}
): UomQueryResult<UnitOfMeasureRow> {
  const { categoryId = null, includeInactive = false, enabled = true } = options;

  const result = useQuery({
    queryKey: queryKeys.unitsOfMeasure(categoryId, includeInactive),
    queryFn: async (): Promise<UnitOfMeasureRow[]> => {
      const supabase = createClient();
      let query = supabase
        .from("units_of_measure")
        .select("id, unit_code, unit_name_en, unit_name_ar, symbol, is_base_unit")
        .order("sort_order", { ascending: true })
        .order("unit_name_en", { ascending: true });

      if (!includeInactive) query = query.eq("is_active", true);
      if (categoryId) query = query.eq("uom_category_id", categoryId);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as UnitOfMeasureRow[];
    },
    enabled,
  });

  const data = result.data ?? [];
  return {
    data,
    options: data.map(mapUnitOfMeasureToOption),
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? errorMsg(result.error) : null,
    refetch: () => { void result.refetch(); },
  };
}
