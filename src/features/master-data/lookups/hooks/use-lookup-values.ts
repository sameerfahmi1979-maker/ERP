/**
 * React hook for loading lookup values
 * Phase 002F.3B
 */

"use client";

import { useEffect, useState } from "react";
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

  const [values, setValues] = useState<LookupValue[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchValues = async () => {
    if (!enabled || !categoryCode) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const result = await getActiveLookupValuesByCategoryCode(
        categoryCode,
        parentValueCode,
        includeInactive
      );

      if (result.success && result.data) {
        setValues(result.data);
      } else {
        setError(result.error || "Failed to load lookup values");
        setValues([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An unexpected error occurred");
      setValues([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchValues();
  }, [categoryCode, parentValueCode, includeInactive, enabled]);

  return {
    values,
    loading,
    error,
    refetch: fetchValues,
  };
}
