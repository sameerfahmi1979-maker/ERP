/**
 * Branch form lookup/master-data prefetch hook.
 * Phase 002F.3E.3B.6G.6 — Runtime QA Closure and Organization/Branch Prefetch Wiring
 *
 * Returns a stable fire-and-forget callback that warms the TanStack Query
 * cache for the data the Branch drawer's default-visible tab needs:
 *
 *   - No lookup categories (Branch form has no LookupSelect fields).
 *   - parallel prefetchQuery for countries — the combobox that would
 *     otherwise fetch individually on first drawer open.
 *
 * Safe to call repeatedly (page mount + every Add/Edit click): TanStack
 * Query skips fresh cache entries and deduplicates in-flight requests.
 *
 * See: docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md §2–3
 * Declaration: src/features/branches/branch-prefetch.ts
 */

"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  prefetchLookupCategories,
  prefetchMasterDataQueries,
} from "@/lib/query/prefetch-lookups";
import { BRANCH_FORM_PREFETCH } from "@/features/branches/branch-prefetch";

export function useBranchFormPrefetch(): () => void {
  const queryClient = useQueryClient();

  return useCallback(() => {
    // lookupCategories is empty — no-ops immediately
    void prefetchLookupCategories(
      queryClient,
      BRANCH_FORM_PREFETCH.lookupCategories
    );
    // Warms countries in parallel
    void prefetchMasterDataQueries(
      queryClient,
      BRANCH_FORM_PREFETCH.masterQueries
    );
  }, [queryClient]);
}
