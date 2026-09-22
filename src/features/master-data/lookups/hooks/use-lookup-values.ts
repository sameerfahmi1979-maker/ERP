/**
 * React hook for loading lookup values
 * Phase 002F.3B
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { getActiveLookupValuesByCategoryCode } from "@/server/actions/master-data/lookups";
import type { LookupValue } from "@/features/master-data/lookups/types";

export interface UseLookupValuesOptions {
  categoryCode: string;
  parentValueCode?: string | null;
  includeInactive?: boolean;
  enabled?: boolean;
}

export interface UseLookupValuesResult {
  values: LookupValue[];
  loading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

/**
 * Hook to load lookup values by category code
 * 
 * Features:
 * - Automatic loading on mount
 * - Loading and error states
 * - Client-side caching (during component lifecycle)
 * - Refetch capability
 * - Support for hierarchical filtering by parent value
 */
export function useLookupValues(options: UseLookupValuesOptions): UseLookupValuesResult {
  const { categoryCode, parentValueCode, includeInactive = false, enabled = true } = options;

  const active = enabled && !!categoryCode;
  const query = useQuery({
    queryKey: ["lookup-values", categoryCode, parentValueCode, includeInactive],
    enabled: active,
    queryFn: async () => {
      const result = await getActiveLookupValuesByCategoryCode(
        categoryCode,
        parentValueCode,
        includeInactive
      );

      if (!result.success || !result.data) throw new Error(result.error || "Failed to load lookup values");
      return result.data;
    },
    retry: false,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  return {
    values: active ? query.data ?? [] : [],
    loading: active && query.isFetching,
    error: query.error?.message ?? null,
    refetch: async () => { if (active) await query.refetch(); },
  };
}
