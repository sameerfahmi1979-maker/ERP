/**
 * Lookup + master-data prefetch utilities for parent forms.
 * Phase 002F.3E.3B.6G.1 — Global Parent Form Runtime Standard + Prefetch Utilities
 *
 * Problem solved (from 3B.6G plan):
 *   Each LookupSelect fires its own server action, and Next.js serializes
 *   server actions — so a form with 6 lookup fields populates one by one.
 *
 * Standard fix:
 *   1. Batch-fetch all category values in ONE server action
 *      (getActiveLookupValuesByCategoryCodes — 2 Supabase round-trips total).
 *   2. Seed the INDIVIDUAL query keys that LookupSelect already reads:
 *      ["lookup", "values", CODE, null, includeInactive]
 *      (queryKeys.lookup.values(code) — parentValueCode defaults to null).
 *
 * After seeding, every LookupSelect on the form finds fresh cache and renders
 * instantly with zero network calls. Dependent lookups (parentValueCode set)
 * are intentionally NOT seeded — they fetch when their parent value exists.
 *
 * See: docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
 */

import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";
import { getActiveLookupValuesByCategoryCodes } from "@/server/actions/master-data/lookups";
import type { LookupValue } from "@/features/master-data/lookups/types";
import type { MasterQueryDescriptor } from "@/lib/query/form-prefetch-types";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PrefetchLookupOptions {
  /** Must match the includeInactive the consuming LookupSelect uses (default false). */
  includeInactive?: boolean;
}

/** Metadata returned for reports, QA harnesses, and debugging. */
export interface PrefetchLookupResult {
  /** Codes asked for (normalized to UPPERCASE). */
  requestedCodes: readonly string[];
  /** Codes whose individual query key was seeded with values. */
  seededCodes: readonly string[];
  /** Requested codes that came back empty/absent (inactive or unknown category). */
  missingCodes: readonly string[];
  /** Total number of lookup values written into the cache. */
  seededCount: number;
  /** Non-null if the batch server action failed; nothing was seeded. */
  error: string | null;
}

// ── seedLookupCategoryValues ──────────────────────────────────────────────────

/**
 * Seed individual LookupSelect query keys from an already-fetched batch result.
 *
 * CRITICAL: writes to queryKeys.lookup.values(code, null, includeInactive) —
 * the exact key useLookupValuesQuery/LookupSelect reads with default options.
 * Never invent another key shape here.
 */
export function seedLookupCategoryValues(
  queryClient: QueryClient,
  batchResult: Record<string, LookupValue[]>,
  options: PrefetchLookupOptions = {}
): PrefetchLookupResult {
  const { includeInactive = false } = options;

  const requestedCodes = Object.keys(batchResult).map((c) => c.toUpperCase());
  const seededCodes: string[] = [];
  const missingCodes: string[] = [];
  let seededCount = 0;

  for (const code of requestedCodes) {
    const values = batchResult[code] ?? [];
    queryClient.setQueryData<LookupValue[]>(
      queryKeys.lookup.values(code, null, includeInactive),
      values
    );
    if (values.length > 0) {
      seededCodes.push(code);
      seededCount += values.length;
    } else {
      // Still seeded (prevents a pointless refetch) but flagged for QA.
      missingCodes.push(code);
    }
  }

  return { requestedCodes, seededCodes, missingCodes, seededCount, error: null };
}

// ── prefetchLookupCategories ──────────────────────────────────────────────────

/**
 * Batch-fetch lookup categories in ONE server action and seed the individual
 * LookupSelect query keys.
 *
 * Call on drawer open (3B.6G.2+), before or in parallel with first render:
 *
 *   const qc = useQueryClient();
 *   useEffect(() => {
 *     if (!open) return;
 *     void prefetchLookupCategories(qc, CUSTOMER_PREFETCH.lookupCategories);
 *   }, [open, qc]);
 *
 * Errors are returned in metadata, never thrown — a failed prefetch must not
 * break the form; LookupSelect simply falls back to its own per-field fetch.
 */
export async function prefetchLookupCategories(
  queryClient: QueryClient,
  categoryCodes: readonly string[],
  options: PrefetchLookupOptions = {}
): Promise<PrefetchLookupResult> {
  const { includeInactive = false } = options;
  const requestedCodes = categoryCodes.map((c) => c.toUpperCase());

  if (requestedCodes.length === 0) {
    return {
      requestedCodes,
      seededCodes: [],
      missingCodes: [],
      seededCount: 0,
      error: null,
    };
  }

  try {
    const res = await getActiveLookupValuesByCategoryCodes(
      [...requestedCodes],
      includeInactive
    );

    if (!res.success || !res.data) {
      return {
        requestedCodes,
        seededCodes: [],
        missingCodes: requestedCodes,
        seededCount: 0,
        error: res.error ?? "Failed to batch-fetch lookup values",
      };
    }

    // Ensure every requested code gets seeded even if absent from the result,
    // so LookupSelect does not refetch a category we already know is empty.
    const completeResult: Record<string, LookupValue[]> = {};
    for (const code of requestedCodes) {
      completeResult[code] = res.data[code] ?? [];
    }

    return seedLookupCategoryValues(queryClient, completeResult, { includeInactive });
  } catch (err) {
    return {
      requestedCodes,
      seededCodes: [],
      missingCodes: requestedCodes,
      seededCount: 0,
      error: err instanceof Error ? err.message : "Lookup prefetch failed",
    };
  }
}

// ── prefetchMasterDataQueries ─────────────────────────────────────────────────

export interface PrefetchMasterDataResult {
  /** Number of descriptors processed. */
  requestedCount: number;
  /** Keys that prefetched without throwing (cached or newly fetched). */
  prefetchedKeys: readonly unknown[][];
  /** Non-null if any descriptor's fetch threw (others still complete). */
  error: string | null;
}

/**
 * Prefetch master-data lists (countries, currencies, …) declared by a parent
 * form. Uses queryClient.prefetchQuery so:
 *   - already-fresh cache entries are NOT refetched,
 *   - the consuming hook (same queryKey) mounts with data instantly.
 *
 * Descriptors must use `queryKeys` factories and shared fetchers from
 * `src/lib/lookups/master-data-fetchers.ts` so key + row shape always match
 * the hooks. Runs all prefetches in parallel; never throws.
 */
export async function prefetchMasterDataQueries(
  queryClient: QueryClient,
  queryDescriptors: readonly MasterQueryDescriptor[]
): Promise<PrefetchMasterDataResult> {
  const prefetchedKeys: unknown[][] = [];
  let error: string | null = null;

  await Promise.all(
    queryDescriptors.map(async (descriptor) => {
      try {
        await queryClient.prefetchQuery({
          queryKey: descriptor.queryKey,
          queryFn: descriptor.queryFn,
          ...(descriptor.staleTime !== undefined
            ? { staleTime: descriptor.staleTime }
            : {}),
        });
        prefetchedKeys.push([...descriptor.queryKey]);
      } catch (err) {
        error = err instanceof Error ? err.message : "Master-data prefetch failed";
      }
    })
  );

  return {
    requestedCount: queryDescriptors.length,
    prefetchedKeys,
    error,
  };
}
