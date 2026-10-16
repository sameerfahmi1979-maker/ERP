"use client";
import { useEffect, useLayoutEffect, useMemo, useState, useSyncExternalStore } from "react";
import { notifyManager, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useReadCacheOwner, type ReadCacheIdentity, type ReadCacheOwner } from "@/components/layout/read-cache-boundary";
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
// One authorized query can serve several mounted screens. The shared request
// belongs to that uninterrupted group, not whichever screen dispatched first.
// Emptying the group permanently retires it, even if the same key later returns.
type ReadGroup = {live: boolean; members: Set<() => boolean>};
const readGroups = new WeakMap<ReadCacheOwner, Map<string, ReadGroup>>();
function retainReadGroup(owner: ReadCacheOwner, client: QueryClient, key: string, queryKey: readonly unknown[], allows: () => boolean) {
  let groups = readGroups.get(owner);
  if (!groups) {groups = new Map();readGroups.set(owner, groups);}
  let group = groups.get(key);
  if (!group) {group = {live: true, members: new Set()};groups.set(key, group);}
  const registeredGroup = group;
  registeredGroup.members.add(allows);
  return () => {
    registeredGroup.members.delete(allows);
    if (registeredGroup.members.size !== 0) return;
    registeredGroup.live = false;
    if (groups.get(key) === registeredGroup) groups.delete(key);
    // TanStack keeps disabled observers attached. Explicitly cancel the last
    // admitted consumer so an enabled/identity ABA cannot publish its old read.
    void client.cancelQueries({queryKey, exact: true});
  };
}
function liveReadGroup(group: ReadGroup | undefined): boolean {
  return group?.live === true && [...group.members].some(allows => allows());
}
function validPage<T>(data: ReadPage<T> | undefined, params: Record<string, unknown>): data is ReadPage<T> {
  if (!data || !Array.isArray(data.rows) || data.rows.some(row => !row || typeof row !== "object" || Array.isArray(row)) ||
    !Number.isSafeInteger(data.totalCount) || data.totalCount < 0 || !Number.isSafeInteger(data.page) || data.page < 1 ||
    !Number.isSafeInteger(data.pageSize) || data.pageSize < 1 || data.pageSize > 100) return false;
  if ((params.page !== undefined && params.page !== data.page) || (params.pageSize !== undefined && params.pageSize !== data.pageSize)) return false;
  const offset = (data.page - 1) * data.pageSize;
  return Number.isSafeInteger(offset) && data.rows.length === Math.min(data.pageSize, Math.max(0, data.totalCount - offset));
}

/** Seed identity MUST originate with its authorized server read. The independently
 * current protected boundary, not retained page props, admits reads/cache writes.
 * No business reader is adopted by this generic foundation. */
type ServerPageOptions<T> = {
  resource: string; params: Record<string, unknown>; enabled?: boolean; keyPrefix?: readonly unknown[];
} & ({seed: ServerPageSeed<T>; seedParams?: never; updatedAt?: never}
  | {seed: ReadPage<T>; seedParams: Record<string, unknown>; updatedAt: number});
export function useServerPage<T>({resource, params, seed: inputSeed, seedParams, enabled = true, keyPrefix}: ServerPageOptions<T>) {
  const owner = useReadCacheOwner(), client = useQueryClient();
  const ownedSeed = "identity" in inputSeed;
  // Compatibility for client-only legacy callers. Their unowned seed is NEVER
  // admitted or relabelled with the current identity; only a fresh read is allowed.
  const seed = useMemo(() => "identity" in inputSeed ? inputSeed : {identity: undefined, params: seedParams ?? {}, data: inputSeed, updatedAt: 0}, [inputSeed, seedParams]);
  const admitted = () => enabled && owner?.client === client && owner.isLive() &&
    (ownedSeed ? owner.admits(seed.identity) : owner.identity !== null);
  // A custom prefix partitions this resource; it is not a new authority. Keep
  // resource/owner denial shared across partitions, but never their data.
  const ownerKey = [owner?.identity?.authUserId ?? null, owner?.identity?.scopeVersion ?? null, owner?.generation ?? null];
  const prefix = canonicalReadParams({prefix: [...(keyPrefix ?? ["read", resource]), "$erp-read-owner", resource, ...ownerKey]});
  const namespace = JSON.parse(prefix).prefix as unknown[];
  const sameNamespace = (key: readonly unknown[]) => canonicalReadParams({prefix: key.slice(0, -1)}) === prefix;
  const sameResource = (key: readonly unknown[]) => key.length >= 6 && key.at(-6) === "$erp-read-owner" && key.at(-5) === resource && key.slice(-4, -1).every((part, index) => part === ownerKey[index]);
  const denialVersion = useSyncExternalStore(owner?.subscribe ?? noSubscription, () => owner?.readDenialVersion(resource) ?? 0, noDenial);
  // Retry handles retain this exact local admission, not a same-shaped future
  // admission. Resource, prefix, enabled and seed-identity ABA cannot revive it.
  const authUserId = seed.identity?.authUserId, scopeVersion = seed.identity?.scopeVersion;
  const admission = useMemo(() => ({live: false, client, enabled, owner, ownedSeed, authUserId, scopeVersion, prefix}), [client, enabled, owner, ownedSeed, authUserId, scopeVersion, prefix]);
  useLayoutEffect(() => {
    admission.live = enabled;
    return () => {admission.live = false;};
  }, [enabled, admission]);
  const currentLease = () => admitted() && admission.live ? admission : null;
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
  const groupKey = canonicalReadParams({prefix, criteria});
  useLayoutEffect(() => {
    const allows = () => admission.live && enabled && owner?.client === client && owner.isLive() &&
      (ownedSeed ? owner.admits({authUserId: authUserId ?? "", scopeVersion: scopeVersion ?? ""}) : owner.identity !== null);
    if (!owner || !allows()) return;
    return retainReadGroup(owner, client, groupKey, [...(JSON.parse(prefix).prefix as unknown[]), criteria], allows);
  }, [admission, enabled, owner, client, ownedSeed, authUserId, scopeVersion, prefix, criteria, groupKey]);
  const validSeed = ownedSeed && validPage(seed.data, seed.params) && Number.isFinite(seed.updatedAt) && seed.updatedAt > 0;
  const maySeed = admitted() && validSeed && denialVersion === 0;
  useEffect(() => {
    if (!enabled || owner?.client !== client || !owner.admits(seed.identity) || owner.readDenialVersion(resource) !== 0 || !validSeed) return;
    const key = [...(JSON.parse(prefix).prefix as unknown[]), initial], state = client.getQueryState(key);
    const currentKey = [...(JSON.parse(prefix).prefix as unknown[]), criteria];
    // A stale seed must not convert a failure or a manual retry into success.
    if (state?.status === "error" || (state?.data === undefined && (state?.errorUpdateCount ?? 0) > 0) ||
        denied(client.getQueryState(currentKey)?.error) || (state?.dataUpdatedAt ?? 0) >= seed.updatedAt) return;
    const verify = state?.isInvalidated === true || (state !== undefined && state.fetchStatus !== "idle");
    notifyManager.batch(() => {
      if (verify) void client.cancelQueries({queryKey: key, exact: true}, {revert: true});
      client.setQueryData(key, seed.data, {updatedAt: seed.updatedAt});
      // A timestamp cannot order a sibling's in-flight read. Preserve one
      // shared active verification; never initiate reads for an inactive key.
      if (verify) void client.invalidateQueries({queryKey: key, exact: true, refetchType: "active"}, {cancelRefetch: true});
    });
  }, [client, owner, enabled, seed, validSeed, prefix, initial, criteria, denialVersion, resource]);
  const query = useQuery({queryKey, enabled: admitted(), queryFn: async ({signal}) => {
    const group = owner ? readGroups.get(owner)?.get(groupKey) : undefined;
    const dispatchedVersion = owner?.readDenialVersion(resource);
    const mayComplete = () => liveReadGroup(group) && !signal.aborted && owner?.readDenialVersion(resource) === dispatchedVersion;
    if (!currentLease() || !mayComplete()) throw retired();
    try {
      const result = await readJson<{success: true; data: ReadPage<T>}>(resource, JSON.parse(criteria), signal);
      if (!mayComplete()) throw retired();
      if (!validPage(result.data, JSON.parse(criteria))) throw new ReadError("Record page and count could not be verified.", 422);
      return result.data;
    } catch (error) {
      if (!mayComplete()) throw retired();
      if (denied(error)) {
        // Preserve this query's denial; cancel other pre-denial reads, then mask
        // every warm criteria. No automatic fan-out or denial retry is issued.
        void client.cancelQueries({predicate: entry => sameResource(entry.queryKey) && !(sameNamespace(entry.queryKey) && entry.queryKey.at(-1) === criteria)});
        void client.invalidateQueries({predicate: entry => sameResource(entry.queryKey), refetchType: "none"});
        owner?.denyReadNamespace(resource, client.getQueryCache().findAll({predicate: entry => sameResource(entry.queryKey)}));
      }
      throw error;
    }
  }, initialData: () => maySeed && criteria === initial && client.getQueryState(queryKey) === undefined ? seed.data : undefined,
  initialDataUpdatedAt: seed.updatedAt, staleTime: 30000, refetchOnWindowFocus: true,
  placeholderData: (previous, previousQuery) => admitted() && previousQuery && sameNamespace(previousQuery.queryKey) && owner?.readDataIsCurrent(resource, previousQuery) && !denied(previousQuery.state.error) ? previous : undefined,
  retry: retryAuthorizedRead});
  const readable = admitted() && !denied(query.error) && owner?.readDataIsCurrent(resource, client.getQueryCache().find({queryKey, exact: true})) === true;
  const isBusy = current !== criteria || query.isFetching || query.isPlaceholderData;
  // The transport may have succeeded just as its authority was retired. Its
  // observer status cannot promise that protected data is still readable.
  type GuardedRefetchResult = Omit<Awaited<ReturnType<typeof query.refetch>>, "data" | "refetch"> & {
    data: ReadPage<T> | undefined; canUseData: boolean; refetch: GuardedRefetch;
  };
  type GuardedRefetch = (...args: Parameters<typeof query.refetch>) => Promise<GuardedRefetchResult>;
  const refetch: GuardedRefetch = async (...args) => {
    const lease = currentLease(), dispatchedVersion = owner?.readDenialVersion(resource);
    if (!lease) throw retired();
    const result = await query.refetch(...args);
    const canUseData = lease.live && currentLease() === lease &&
      owner?.readDenialVersion(resource) === dispatchedVersion &&
      owner?.readDataIsCurrent(resource, client.getQueryCache().find({queryKey, exact: true})) === true &&
      !denied(result.error) && !result.isError && result.data !== undefined;
    return {...result, refetch, canUseData, data: canUseData ? result.data : undefined};
  };
  return {...query, refetch, data: readable ? query.data : undefined, isBusy,
    // Freshness only, never permission to edit a business record.
    canUseData: readable && !query.isError && !isBusy && query.data !== undefined,
  };
}
