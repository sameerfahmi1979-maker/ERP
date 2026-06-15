/**
 * Organization form lookup/master-data prefetch hook.
 * Phase 002F.3E.3B.6G.6 — Runtime QA Closure and Organization/Branch Prefetch Wiring
 *
 * Returns a stable fire-and-forget callback that warms the TanStack Query
 * cache for the data the Organization drawer's default-visible tab needs:
 *
 *   - No lookup categories (Organization form has no LookupSelect fields).
 *   - parallel prefetchQuery for countries and currencies — the two
 *     comboboxes that would otherwise fetch individually on first drawer open.
 *
 * Safe to call repeatedly (page mount + every Add/Edit click): TanStack
 * Query skips fresh cache entries and deduplicates in-flight requests.
 * On failure each combobox falls back to its own per-field fetch gracefully.
 *
 * See: docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md §2–3
 * Declaration: src/features/organizations/organization-prefetch.ts
 */

"use client";

import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  prefetchLookupCategories,
  prefetchMasterDataQueries,
} from "@/lib/query/prefetch-lookups";
import { ORGANIZATION_FORM_PREFETCH } from "@/features/organizations/organization-prefetch";

export function useOrganizationFormPrefetch(): () => void {
  const queryClient = useQueryClient();

  return useCallback(() => {
    // lookupCategories is empty — no-ops immediately
    void prefetchLookupCategories(
      queryClient,
      ORGANIZATION_FORM_PREFETCH.lookupCategories
    );
    // Warms countries + currencies in parallel
    void prefetchMasterDataQueries(
      queryClient,
      ORGANIZATION_FORM_PREFETCH.masterQueries
    );
  }, [queryClient]);
}
