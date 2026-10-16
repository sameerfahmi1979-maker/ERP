/**
 * Lookup + master-data prefetch utilities for parent forms.
 * Phase 002F.3E.3B.6G.1 — Global Parent Form Runtime Standard + Prefetch Utilities
 *
 * Problem solved (from 3B.6G plan):
 *   Each LookupSelect fires its own server action, and Next.js serializes
 *   server actions — so a form with 6 lookup fields populates one by one.
 *
 * Standard fix:
 *   1. Batch-fetch all category values through one complete HTTP read resource.
 *   2. Populate the INDIVIDUAL query keys that LookupSelect already reads:
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
import { readJson, retryAuthorizedRead } from "@/lib/reads/client";
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
  /** Verified empty codes, or requested codes whose read failed. */
  missingCodes: readonly string[];
  /** Total number of lookup values written into the cache. */
  seededCount: number;
  /** Non-null if the batch or an individual query failed. */
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
 * Batch-fetch lookup categories through one HTTP read and populate individual
 * LookupSelect keys under their own cancellable query ownership.
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
  const requestedCodes = [...new Set(categoryCodes.map((c) => c.trim().toUpperCase()))].sort();

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
    const batch = queryClient.fetchQuery({
      queryKey: queryKeys.lookup.batch([...requestedCodes], includeInactive),
      retry: retryAuthorizedRead,
      queryFn: async ({signal}) => {
        const result = (await readJson<{success:true;data:Record<string,LookupValue[]>}>(
          "lookup-batch", {categoryCodes:[...requestedCodes],includeInactive}, signal)).data;
        if (!result || requestedCodes.some(code => !Object.hasOwn(result,code) || !Array.isArray(result[code]))) {
          throw new Error("Choices could not be completely loaded. Please retry.");
        }
        return result;
      },
    });
    // Each individual query owns its result. Register before awaiting so a
    // mounted field shares the pending batch instead of opening a second read.
    const individual = requestedCodes.map(code => queryClient.fetchQuery({
      queryKey: queryKeys.lookup.values(code, null, includeInactive),
      retry: retryAuthorizedRead,
      queryFn: async ({signal}) => {
        const values = (await batch)[code];
        signal.throwIfAborted();
        return values;
      },
    }));
    const [, ...values] = await Promise.all([batch, ...individual]);
    // Receipt only: fetchQuery has already committed admitted results. A second
    // setQueryData here could refill an identity cache cleared after completion.
    const populated = values as LookupValue[][];
    return {
      requestedCodes,
      seededCodes: requestedCodes.filter((_, index) => populated[index].length > 0),
      missingCodes: requestedCodes.filter((_, index) => populated[index].length === 0),
      seededCount: populated.reduce((total, rows) => total + rows.length, 0),
      error: null,
    };
  } catch {
    return {
      requestedCodes,
      seededCodes: [],
      missingCodes: requestedCodes,
      seededCount: 0,
      error: "Choices could not be completely loaded. Please retry.",
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
 * form. Uses queryClient.fetchQuery so failures are observable and:
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
        await queryClient.fetchQuery({
          queryKey: descriptor.queryKey,
          queryFn: ({signal}) => descriptor.queryFn(signal),
          retry: retryAuthorizedRead,
          ...(descriptor.staleTime !== undefined
            ? { staleTime: descriptor.staleTime }
            : {}),
        });
        prefetchedKeys.push([...descriptor.queryKey]);
      } catch {
        // Descriptors may throw provider diagnostics; only a safe receipt leaves
        // this boundary. Each successful sibling still reports its own key.
        error = "Choices failed";
      }
    })
  );

  return {
    requestedCount: queryDescriptors.length,
    prefetchedKeys,
    error,
  };
}
