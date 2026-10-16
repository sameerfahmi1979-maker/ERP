"use client";
import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useReadCacheOwner, type ReadCacheIdentity } from "@/components/layout/read-cache-boundary";
import { readJson, retryAuthorizedRead, ReadError } from "@/lib/reads/client";

export type ReadPage<T> = {rows: T[]; totalCount: number; page: number; pageSize: number};
export type ServerPageSeed<T> = {identity: ReadCacheIdentity; params: Record<string, unknown>; data: ReadPage<T>; updatedAt: number};
export function canonicalReadParams(params: Record<string, unknown>): string {
  const normalize = (value: unknown): unknown => Array.isArray(value) ? value.map(normalize) : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, normalize(v)])) : value;
  return JSON.stringify(normalize(params));
}
function denied(error: unknown): boolean {
  return error instanceof ReadError && (error.status === 401 || error.status === 403);
}
function retired(): Error {const error = new Error("Read ownership is no longer current.");error.name = "AbortError";return error;}
const noSubscription = () => () => {};
const noDenial = () => 0;
function validPage<T>(data: ReadPage<T> | undefined, params: Record<string, unknown>): data is ReadPage<T> {
  if (!data || !Array.isArray(data.rows) || data.rows.some(row => !row || typeof row !== "object" || Array.isArray(row)) ||
    !Number.isSafeInteger(data.totalCount) || data.totalCount < 0 || !Number.isSafeInteger(data.page) || data.page < 1 ||
    !Number.isSafeInteger(data.pageSize) || data.pageSize < 1) return false;
  if ((params.page !== undefined && params.page !== data.page) || (params.pageSize !== undefined && params.pageSize !== data.pageSize)) return false;
  const offset = (data.page - 1) * data.pageSize;
  return Number.isSafeInteger(offset) && data.rows.length === Math.min(data.pageSize, Math.max(0, data.totalCount - offset));
}

/** Seed identity MUST originate with its authorized server read. The independently
 * current protected boundary, not retained page props, admits reads/cache writes.
 * No business reader is adopted by this generic foundation. */
export function useServerPage<T>({resource, params, seed, enabled = true, keyPrefix}: {
  resource: string; params: Record<string, unknown>; seed: ServerPageSeed<T>; enabled?: boolean; keyPrefix?: readonly unknown[];
}) {
  const owner = useReadCacheOwner(), client = useQueryClient();
  const admitted = () => enabled && owner?.client === client && owner.admits(seed.identity);
  // A custom prefix partitions this resource; it is not a new authority. Keep
  // resource/owner denial shared across partitions, but never their data.
  const ownerKey = [owner?.identity?.authUserId ?? null, owner?.identity?.scopeVersion ?? null, owner?.generation ?? null];
  const prefix = canonicalReadParams({prefix: ["read", resource, ...(keyPrefix ? [keyPrefix] : []), ...ownerKey]});
  const namespace = JSON.parse(prefix).prefix as unknown[];
  const sameNamespace = (key: readonly unknown[]) => canonicalReadParams({prefix: key.slice(0, -1)}) === prefix;
  const sameResource = (key: readonly unknown[]) => key.length >= 6 && key[0] === "read" && key[1] === resource && key.slice(-4, -1).every((part, index) => part === ownerKey[index]);
  const denialVersion = useSyncExternalStore(owner?.subscribe ?? noSubscription, () => owner?.readDenialVersion(resource) ?? 0, noDenial);
  // A dispatched read also holds its exact committed local admission. Toggling
  // enabled/seed identity off then on cannot resurrect that old in-flight read.
  const authUserId = seed.identity?.authUserId, scopeVersion = seed.identity?.scopeVersion;
  const admission = useRef<{live: boolean; owner: typeof owner; authUserId: string | undefined; scopeVersion: string | undefined; prefix: string} | null>(null);
  useLayoutEffect(() => {
    const lease = {live: enabled, owner, authUserId, scopeVersion, prefix};admission.current = lease;
    return () => {lease.live = false;};
  }, [enabled, owner, authUserId, scopeVersion, prefix]);
  const currentLease = () => {
    const lease = admission.current;
    return admitted() && lease?.live && lease.owner === owner && lease.authUserId === authUserId && lease.scopeVersion === scopeVersion && lease.prefix === prefix ? lease : null;
  };
  const current = canonicalReadParams(params), initial = canonicalReadParams(seed.params);
  const nested = params.filters && typeof params.filters === "object" ? params.filters as Record<string, unknown> : null;
  const text = canonicalReadParams({search: params.search, nestedSearch: nested?.search});
  const [debouncedText, setDebouncedText] = useState(text);
  // Only text search is debounced. Page, dropdown and sort changes are immediate.
  useEffect(() => {const timer = setTimeout(() => setDebouncedText(text), 250);return () => clearTimeout(timer);}, [text]);
  const pendingText = JSON.parse(debouncedText) as {search?: unknown; nestedSearch?: unknown};
  const effective = {...params, ...("search" in params || "search" in pendingText ? {search: pendingText.search} : {}), ...(nested ? {filters: {...nested, search: pendingText.nestedSearch}} : {})};
  const criteria = canonicalReadParams(effective);
  const queryKey = [...namespace, criteria];
  const validSeed = validPage(seed.data, seed.params) && Number.isFinite(seed.updatedAt) && seed.updatedAt > 0;
  const maySeed = admitted() && validSeed && denialVersion === 0;
  useEffect(() => {
    if (!enabled || owner?.client !== client || !owner.admits(seed.identity) || owner.readDenialVersion(resource) !== 0 || !validSeed) return;
    const key = [...(JSON.parse(prefix).prefix as unknown[]), initial], state = client.getQueryState(key);
    const currentKey = [...(JSON.parse(prefix).prefix as unknown[]), criteria];
    if (!denied(state?.error) && !denied(client.getQueryState(currentKey)?.error) && (state?.dataUpdatedAt ?? 0) < seed.updatedAt) client.setQueryData(key, seed.data, {updatedAt: seed.updatedAt});
  }, [client, owner, enabled, seed, validSeed, prefix, initial, criteria, denialVersion, resource]);
  const query = useQuery({queryKey, enabled: admitted(), queryFn: async ({signal}) => {
    const lease = currentLease(), dispatchedVersion = owner?.readDenialVersion(resource);
    if (!lease || signal.aborted) throw retired();
    try {
      const result = await readJson<{success: true; data: ReadPage<T>}>(resource, JSON.parse(criteria), signal);
      if (!lease.live || currentLease() !== lease || signal.aborted || owner?.readDenialVersion(resource) !== dispatchedVersion) throw retired();
      if (!validPage(result.data, JSON.parse(criteria))) throw new ReadError("Record page and count could not be verified.", 422);
      return result.data;
    } catch (error) {
      if (!lease.live || currentLease() !== lease || signal.aborted || owner?.readDenialVersion(resource) !== dispatchedVersion) throw retired();
      if (denied(error)) {
        // Preserve this query's denial; cancel other pre-denial reads, then mask
        // every warm criteria. No automatic fan-out or denial retry is issued.
        void client.cancelQueries({queryKey: ["read", resource], predicate: entry => sameResource(entry.queryKey) && !(sameNamespace(entry.queryKey) && entry.queryKey.at(-1) === criteria)});
        void client.invalidateQueries({queryKey: ["read", resource], predicate: entry => sameResource(entry.queryKey), refetchType: "none"});
        owner?.denyReadNamespace(resource, client.getQueryCache().findAll({queryKey: ["read", resource], predicate: entry => sameResource(entry.queryKey)}));
      }
      throw error;
    }
  }, initialData: maySeed && criteria === initial && !denied(client.getQueryState(queryKey)?.error) ? seed.data : undefined,
  initialDataUpdatedAt: seed.updatedAt, staleTime: 30000, refetchOnWindowFocus: true,
  placeholderData: (previous, previousQuery) => admitted() && previousQuery && sameNamespace(previousQuery.queryKey) && owner?.readDataIsCurrent(resource, previousQuery) && !denied(previousQuery.state.error) ? previous : undefined,
  retry: retryAuthorizedRead});
  const readable = admitted() && !denied(query.error) && owner?.readDataIsCurrent(resource, client.getQueryCache().find({queryKey, exact: true})) === true;
  const isBusy = current !== criteria || query.isFetching || query.isPlaceholderData;
  return {...query, data: readable ? query.data : undefined, isBusy,
    // Freshness only, never permission to edit a business record.
    canUseData: readable && !query.isError && !isBusy && query.data !== undefined,
    refetch: async (...args: Parameters<typeof query.refetch>) => {
      const lease = currentLease(), dispatchedVersion = owner?.readDenialVersion(resource);
      if (!lease) throw retired();
      const result = await query.refetch(...args);
      return {...result, data: lease.live && currentLease() === lease && owner?.readDenialVersion(resource) === dispatchedVersion && owner?.readDataIsCurrent(resource, client.getQueryCache().find({queryKey, exact: true})) && !denied(result.error) ? result.data : undefined};
    },
  };
}
