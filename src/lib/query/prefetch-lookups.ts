import type { QueryClient } from "@tanstack/react-query";
import { queryKeys } from "./authorized-lookup-keys";
import type { LookupChoice } from "@/lib/reads/lookup-contract";
import { retryAuthorizedRead } from "@/lib/reads/client";
import type { MasterQueryDescriptor } from "./form-prefetch-types";

export { prefetchLookupCategories } from "./prefetch-authorized-lookups";
export interface PrefetchLookupOptions { includeInactive?: boolean }
export interface PrefetchLookupResult {
  requestedCodes: readonly string[]; seededCodes: readonly string[];
  missingCodes: readonly string[]; seededCount: number; error: string | null;
}

/** Synchronous caller-owned seed only; asynchronous prefetch uses cancellable P02 queries. */
export function seedLookupCategoryValues(client: QueryClient, values: Record<string, LookupChoice[]>, options: PrefetchLookupOptions = {}): PrefetchLookupResult {
  const requestedCodes = Object.keys(values);
  if (requestedCodes.some(code => !Array.isArray(values[code]))) return {requestedCodes, seededCodes: [], missingCodes: requestedCodes, seededCount: 0, error: "Choices could not be completely loaded. Please retry."};
  const seededCodes: string[] = [], missingCodes: string[] = [];
  let seededCount = 0;
  for (const code of requestedCodes) {
    client.setQueryData(queryKeys.lookup.values(code, null, options.includeInactive), values[code]);
    (values[code].length ? seededCodes : missingCodes).push(code);
    seededCount += values[code].length;
  }
  return {requestedCodes, seededCodes, missingCodes, seededCount, error: null};
}
export interface PrefetchMasterDataResult {
  requestedCount: number; prefetchedKeys: readonly unknown[][]; error: string | null;
}
/** fetchQuery, unlike prefetchQuery, reports failure; no false successful prefetch receipt. */
export async function prefetchMasterDataQueries(client: QueryClient, descriptors: readonly MasterQueryDescriptor[]): Promise<PrefetchMasterDataResult> {
  const prefetchedKeys: unknown[][] = [];
  let error: string | null = null;
  await Promise.all(descriptors.map(async descriptor => {
    try {
      await client.fetchQuery({queryKey: descriptor.queryKey, queryFn: ({signal}) => descriptor.queryFn(signal), retry: retryAuthorizedRead,
        ...(descriptor.staleTime !== undefined ? {staleTime: descriptor.staleTime} : {})});
      prefetchedKeys.push([...descriptor.queryKey]);
    } catch (cause) { error = cause instanceof Error ? cause.message : "Master-data prefetch failed"; }
  }));
  return {requestedCount: descriptors.length, prefetchedKeys, error};
}
