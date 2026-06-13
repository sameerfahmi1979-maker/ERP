/**
 * TanStack Query hooks for geography master-data.
 * Phase 002F.3E.3B.6B — Global Lookup Cache and Hook Standard
 *
 * Uses the Supabase browser client directly (consistent with existing pattern).
 * TanStack Query deduplicates and caches results across all components that
 * request the same geography data in the same session.
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { queryKeys } from "@/lib/query/query-keys";
import {
  mapCountryToOption,
  mapEmirateToOption,
  mapCityToOption,
  mapAreaZoneToOption,
  mapPortToOption,
  type CountryRow,
  type EmirateRow,
  type CityRow,
  type AreaZoneRow,
  type PortRow,
} from "@/lib/lookups/option-mappers";
import type { ERPComboboxOption } from "@/components/erp/combobox";
import { fetchCountries } from "@/lib/lookups/master-data-fetchers";

// ── Shared result shape ─────────────────────────────────────────────────────────

interface GeoQueryResult<T> {
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

// ── useCountriesQuery ───────────────────────────────────────────────────────────

export interface CountriesQueryOptions {
  gccOnly?: boolean;
  includeInactive?: boolean;
  enabled?: boolean;
}

export function useCountriesQuery(
  options: CountriesQueryOptions = {}
): GeoQueryResult<CountryRow> {
  const { gccOnly = false, includeInactive = false, enabled = true } = options;

  const result = useQuery({
    queryKey: queryKeys.countries(gccOnly, includeInactive),
    // Shared fetcher (3B.6G.1) so prefetch and hook can never drift.
    queryFn: () => fetchCountries(gccOnly, includeInactive),
    enabled,
  });

  const data = result.data ?? [];
  return {
    data,
    options: data.map(mapCountryToOption),
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? errorMsg(result.error) : null,
    refetch: () => { void result.refetch(); },
  };
}

// ── useEmiratesQuery ────────────────────────────────────────────────────────────

export interface EmiratesQueryOptions {
  countryId?: number | null;
  includeInactive?: boolean;
  enabled?: boolean;
}

export function useEmiratesQuery(
  options: EmiratesQueryOptions = {}
): GeoQueryResult<EmirateRow> {
  const { countryId = null, includeInactive = false, enabled = true } = options;

  const result = useQuery({
    queryKey: queryKeys.emirates(countryId, includeInactive),
    queryFn: async (): Promise<EmirateRow[]> => {
      const supabase = createClient();
      let query = supabase
        .from("emirates")
        .select("id, emirate_code, name_en, name_ar")
        .order("sort_order", { ascending: true });

      if (!includeInactive) query = query.eq("is_active", true);
      if (countryId) query = query.eq("country_id", countryId);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as EmirateRow[];
    },
    enabled,
  });

  const data = result.data ?? [];
  return {
    data,
    options: data.map(mapEmirateToOption),
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? errorMsg(result.error) : null,
    refetch: () => { void result.refetch(); },
  };
}

// ── useCitiesQuery ─────────────────────────────────────────────────────────────

export interface CitiesQueryOptions {
  emirateId?: number | null;
  includeInactive?: boolean;
  enabled?: boolean;
}

export function useCitiesQuery(
  options: CitiesQueryOptions = {}
): GeoQueryResult<CityRow> {
  const { emirateId = null, includeInactive = false, enabled = true } = options;

  const result = useQuery({
    queryKey: queryKeys.cities(emirateId, includeInactive),
    queryFn: async (): Promise<CityRow[]> => {
      const supabase = createClient();
      let query = supabase
        .from("cities")
        .select("id, city_code, name_en, name_ar, emirate_id")
        .order("sort_order", { ascending: true })
        .order("name_en", { ascending: true });

      if (!includeInactive) query = query.eq("is_active", true);
      if (emirateId) query = query.eq("emirate_id", emirateId);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as CityRow[];
    },
    enabled,
  });

  const data = result.data ?? [];
  return {
    data,
    options: data.map(mapCityToOption),
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? errorMsg(result.error) : null,
    refetch: () => { void result.refetch(); },
  };
}

// ── useAreasQuery ──────────────────────────────────────────────────────────────

export interface AreasQueryOptions {
  cityId?: number | null;
  areaTypeCode?: string | null;
  includeInactive?: boolean;
  enabled?: boolean;
}

export function useAreasQuery(
  options: AreasQueryOptions = {}
): GeoQueryResult<AreaZoneRow> {
  const {
    cityId = null,
    areaTypeCode = null,
    includeInactive = false,
    enabled = true,
  } = options;

  const result = useQuery({
    queryKey: [...queryKeys.areas(cityId, includeInactive), areaTypeCode ?? null],
    queryFn: async (): Promise<AreaZoneRow[]> => {
      const supabase = createClient();
      let query = supabase
        .from("areas_zones")
        .select("id, area_code, name_en, name_ar, city_id, area_type_code")
        .order("sort_order", { ascending: true })
        .order("name_en", { ascending: true });

      if (!includeInactive) query = query.eq("is_active", true);
      if (cityId) query = query.eq("city_id", cityId);
      if (areaTypeCode) query = query.eq("area_type_code", areaTypeCode);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as AreaZoneRow[];
    },
    enabled,
  });

  const data = result.data ?? [];
  return {
    data,
    options: data.map(mapAreaZoneToOption),
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? errorMsg(result.error) : null,
    refetch: () => { void result.refetch(); },
  };
}

// ── usePortsQuery ──────────────────────────────────────────────────────────────

export interface PortsQueryOptions {
  emirateId?: number | null;
  portTypeCode?: string | null;
  includeInactive?: boolean;
  enabled?: boolean;
}

export function usePortsQuery(
  options: PortsQueryOptions = {}
): GeoQueryResult<PortRow> {
  const {
    emirateId = null,
    portTypeCode = null,
    includeInactive = false,
    enabled = true,
  } = options;

  const result = useQuery({
    queryKey: [...queryKeys.ports(emirateId, portTypeCode, includeInactive)],
    queryFn: async (): Promise<PortRow[]> => {
      const supabase = createClient();
      let query = supabase
        .from("ports")
        .select("id, port_code, name_en, name_ar, emirate_id, port_type_code")
        .order("sort_order", { ascending: true })
        .order("name_en", { ascending: true });

      if (!includeInactive) query = query.eq("is_active", true);
      if (emirateId) query = query.eq("emirate_id", emirateId);
      if (portTypeCode) query = query.eq("port_type_code", portTypeCode);

      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as PortRow[];
    },
    enabled,
  });

  const data = result.data ?? [];
  return {
    data,
    options: data.map(mapPortToOption),
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error ? errorMsg(result.error) : null,
    refetch: () => { void result.refetch(); },
  };
}
