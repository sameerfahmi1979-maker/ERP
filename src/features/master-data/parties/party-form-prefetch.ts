/**
 * Party Master form runtime prefetch declaration.
 * Phase ERP BASE 002F.5A.3
 *
 * Prefetches the Basic Information choices on add/edit navigation.
 * The workspace's lazy panels load their own choices when they activate.
 *
 * Usage:
 *   const qc = useQueryClient();
 *   // On "Add Party" or "Edit Party" click, before opening the drawer:
 *   await prefetchPartyFormData(qc);
 */

import type { QueryClient } from "@tanstack/react-query";
import { prefetchMasterDataQueries, type PrefetchMasterDataResult } from "@/lib/query/prefetch-lookups";
import { queryKeys } from "@/lib/query/query-keys";
import { fetchCountries } from "@/lib/lookups/master-data-fetchers";
import { getPartyNatures, getPartyStatuses } from "@/server/actions/master-data/parties";

/** Never turn a denied/failed legacy action into a successful empty cache entry. */
async function actionChoices<T>(action: () => Promise<{success: boolean; data?: T[]; error?: string}>, signal?: AbortSignal): Promise<T[]> {
  signal?.throwIfAborted();
  const result = await action();
  signal?.throwIfAborted();
  if (!result.success || !Array.isArray(result.data)) throw new Error("Party choices could not be loaded. Please retry.");
  return result.data;
}
export async function prefetchPartyFormData(queryClient: QueryClient): Promise<PrefetchMasterDataResult> {
  const staleTime = 5 * 60 * 1000;

  const result = await prefetchMasterDataQueries(queryClient, [
    { queryKey: queryKeys.countries(false, false), queryFn: (signal) => fetchCountries(false, false, signal), staleTime },

    // Each queryFn must unwrap the ActionResult to match how the consuming component's queryFn reads the cache.
    { queryKey: ["party_natures"], queryFn: (signal) => actionChoices(getPartyNatures, signal), staleTime },
    { queryKey: ["party_statuses"], queryFn: (signal) => actionChoices(getPartyStatuses, signal), staleTime },
  ]);
  // Do not propagate transport or generic prefetch errors into the Party form.
  // Keep successful keys truthful while providing its stable, actionable message.
  return {...result, error: result.error ? "Party choices could not be loaded. Please retry." : null};
}
