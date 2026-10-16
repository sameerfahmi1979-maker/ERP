"use client";
import { createContext, useContext, useLayoutEffect, useState, useSyncExternalStore } from "react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import { makeQueryClient } from "@/lib/query/query-client";
import { registerPrivateCache } from "@/lib/query/private-cache";
export type ReadCacheIdentity = Readonly<{authUserId: string; scopeVersion: string}>;
type ReadDataVersion = {readonly state: {readonly dataUpdateCount: number}};
export type ReadCacheOwner = Readonly<{
  client: QueryClient;
  identity: ReadCacheIdentity | null;
  generation: number;
  admits: (identity: ReadCacheIdentity | null | undefined) => boolean;
  subscribe: (listener: () => void) => () => void;
  isLive: () => boolean;
  readDenialVersion: (namespace: string) => number;
  denyReadNamespace: (namespace: string, entries: readonly ReadDataVersion[]) => void;
  readDataIsCurrent: (namespace: string, entry: ReadDataVersion | undefined) => boolean;
}>;
const OwnerContext = createContext<ReadCacheOwner | null>(null);
const noSubscription = () => () => {};
const notLive = () => false;

/** This is a UX cache lifetime, never server authorization. No unowned default. */
export function useReadCacheOwner(): ReadCacheOwner | null {
  const owner = useContext(OwnerContext);
  useSyncExternalStore(owner?.subscribe ?? noSubscription, owner?.isLive ?? notLive, owner?.isLive ?? notLive);
  return owner;
}

function lifetime(client: QueryClient, identity: ReadCacheIdentity | null, generation: number) {
  let live = true;
  const listeners = new Set<() => void>();
  // Admission metadata only, not another data cache. A known denial permanently
  // withdraws retained SSR seeds for this namespace/lifetime, even after query
  // garbage collection or a page component remount. Fresh reads can still recover.
  const denials = new Map<string, {version: number; dataVersions: WeakMap<ReadDataVersion, number>}>();
  return Object.freeze({
    client, identity, generation,
    isLive: () => live,
    readDenialVersion: (namespace: string) => denials.get(namespace)?.version ?? 0,
    readDataIsCurrent: (namespace: string, entry: ReadDataVersion | undefined) => {
      const denial = denials.get(namespace);
      return live && (!denial || !!entry && entry.state.dataUpdateCount > (denial.dataVersions.get(entry) ?? 0));
    },
    denyReadNamespace: (namespace: string, entries: readonly ReadDataVersion[]) => {
      if (!live) return;
      denials.set(namespace, {version: (denials.get(namespace)?.version ?? 0) + 1,
        dataVersions: new WeakMap(entries.map(entry => [entry, entry.state.dataUpdateCount]))});
      listeners.forEach(listener => listener());
    },
    admits: (candidate: ReadCacheIdentity | null | undefined) => live && identity !== null &&
      candidate?.authUserId === identity.authUserId && candidate?.scopeVersion === identity.scopeVersion,
    subscribe: (listener: () => void) => {listeners.add(listener);return () => {listeners.delete(listener);};},
    retire: () => {if (live) {live = false;listeners.forEach(listener => listener());}},
  });
}

function OwnedReadCacheBoundary({children, authUserId, scopeVersion}: BoundaryProps) {
  const [cache] = useState(() => {
    const client = makeQueryClient();
    const identity = authUserId && scopeVersion ? Object.freeze({authUserId, scopeVersion}) : null;
    const listeners = new Set<() => void>();
    let generation = 0;
    let currentOwner = lifetime(client, identity, generation);
    return {client, snapshot: () => currentOwner,
      subscribe: (listener: () => void) => {listeners.add(listener);return () => {listeners.delete(listener);};},
      register: () => {
        // Strict Mode replays setup after cleanup. Issue a NEW token; callbacks
        // holding the retired token never regain admission on this same client.
        if (!currentOwner.isLive()) {currentOwner = lifetime(client, identity, ++generation);listeners.forEach(listener => listener());}
        return registerPrivateCache(client, currentOwner.retire);
      },
    };
  });
  const owner = useSyncExternalStore(cache.subscribe, cache.snapshot, cache.snapshot);
  useLayoutEffect(() => cache.register(), [cache]);
  return <QueryClientProvider client={cache.client}><OwnerContext.Provider value={owner}>{children}</OwnerContext.Provider></QueryClientProvider>;
}

type BoundaryProps = {children: React.ReactNode; authUserId?: string; scopeVersion?: string};
/** Identity comes from the protected layout, independently of any page's seed. */
export function ReadCacheBoundary(props: BoundaryProps) {
  return <OwnedReadCacheBoundary key={JSON.stringify([props.authUserId, props.scopeVersion])} {...props}/>;
}
