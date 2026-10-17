"use client";

import {useLayoutEffect, useMemo, useRef} from "react";
import {useQueryClient, type QueryKey} from "@tanstack/react-query";
import {useReadCacheOwner} from "@/components/layout/read-cache-boundary";

function retired(): Error {
  const error = new Error("Read ownership is no longer current.");
  error.name = "AbortError";
  return error;
}

/** Dispatch lifetime only, never authorization or a source of seed identity.
 * Standalone legacy QueryClient providers remain usable; protected pages also
 * require their independent identity-owned boundary to remain current. */
export function useLookupReadLease(enabled: boolean, queryKey: QueryKey) {
  const client = useQueryClient(), owner = useReadCacheOwner();
  const key = JSON.stringify(queryKey);
  const lease = useMemo(() => ({client, owner, enabled, key}), [client, owner, enabled, key]);
  const activeLease = useRef<typeof lease | null>(null);
  useLayoutEffect(() => {
    activeLease.current = lease;
    return () => {if (activeLease.current === lease) activeLease.current = null;};
  }, [lease]);
  const readable = () => owner === null || (owner.client === client && owner.identity !== null && owner.isLive());
  const isCurrent = () => enabled && activeLease.current === lease && readable();
  return {
    enabled: enabled && readable(),
    readable,
    isCurrent,
    async run<T>(signal: AbortSignal, work: () => Promise<T>): Promise<T> {
      // TanStack's signal owns a coalesced request, not the first component
      // that happened to dispatch it. A surviving sibling can still use its
      // result, but a retired identity can never publish it.
      if (!readable() || signal.aborted) throw retired();
      try {
        const result = await work();
        if (!readable() || signal.aborted) throw retired();
        return result;
      } catch (error) {
        if (!readable() || signal.aborted) throw retired();
        throw error;
      }
    },
  };
}
