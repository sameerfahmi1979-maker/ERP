/**
 * Customer form lookup/master-data prefetch hook.
 * Phase 002F.3E.3B.6G.2 — Customer Basic Tab Lookup Prefetch Wiring
 *
 * Returns a stable fire-and-forget callback that warms the TanStack Query
 * cache for everything the Customer drawer's default-visible tabs need:
 *
 *   - ONE batch server action for the 6 lookup categories, seeded into the
 *     individual ["lookup","values",CODE,null,false] keys LookupSelect reads
 *   - parallel prefetchQuery for countries / currencies / payment terms /
 *     tax types (skipped automatically when cache is still fresh)
 *
 * Safe to call repeatedly (page mount + every Add/Edit click): TanStack
 * Query deduplicates in-flight fetches and skips fresh entries, and the
 * utilities never throw — on failure each LookupSelect just falls back to
 * its own per-field fetch.
 *
 * See: docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md §2–3
 */

"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  prefetchLookupCategories,
  prefetchMasterDataQueries,
} from "@/lib/query/prefetch-lookups";
import { CUSTOMER_FORM_PREFETCH } from "@/features/master-data/customers/customer-prefetch";

export function useCustomerFormPrefetch(): () => void {
  const queryClient = useQueryClient();

  return useCallback(() => {
    void prefetchLookupCategories(
      queryClient,
      CUSTOMER_FORM_PREFETCH.lookupCategories
    );
    void prefetchMasterDataQueries(
      queryClient,
      CUSTOMER_FORM_PREFETCH.masterQueries
    );
  }, [queryClient]);
}
