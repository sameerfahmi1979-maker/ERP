"use client";
import {useEffect, useRef} from "react";
import {useInfiniteQuery, useQuery, useQueryClient} from "@tanstack/react-query";
import {z} from "zod";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {canonicalReadParams} from "./use-server-page";
import {dmsBrowserCriteriaSchema, dmsBrowserIdentity, dmsBrowserSearchCriteria, dmsBrowserSearchPage, dmsBrowserFilesPage,
  dmsBrowserFilesUnavailable, dmsBrowserTypesPage, dmsBrowserTooLarge, type DmsBrowserCriteria} from "@/lib/reads/dms-browser-schema";

export const dmsBrowserPrefix = (identity: string) => ["dms", "browser", identity] as const;
const searchResponse = z.union([dmsBrowserSearchPage, dmsBrowserTooLarge.refine(v => v.criteria.operation === "search")]);
const schemas = {types: z.union([dmsBrowserTypesPage, dmsBrowserTooLarge.refine(v => v.criteria.operation === "types")]), files: z.union([dmsBrowserFilesPage, dmsBrowserFilesUnavailable])};
const canRead = (auth: AuthContext) => hasPermission(auth, "dms.documents.view") || hasPermission(auth, "dms.admin");
const isDenied = (error: unknown) => error instanceof ReadError && [401, 403].includes(error.status);

function useRetirement(key: readonly unknown[], denied: boolean, onDenied?: () => void) {
  const qc = useQueryClient(), owner = canonicalReadParams({key}), previous = useRef(key), current = useRef(owner);
  useEffect(() => {
    current.current = owner;
    if (canonicalReadParams({key: previous.current}) !== owner) {const old = previous.current; void qc.cancelQueries({queryKey: old, exact: true}); qc.removeQueries({queryKey: old, exact: true}); previous.current = key;}
    return () => {current.current = ""; void qc.cancelQueries({queryKey: key, exact: true}); qc.removeQueries({queryKey: key, exact: true});};
    // Canonical owner captures the complete principal/operation/request tuple.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, qc]);
  useEffect(() => {if (denied) {void qc.cancelQueries({queryKey: key, exact: true}); qc.removeQueries({queryKey: key, exact: true}); onDenied?.();}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [denied, owner, qc, onDenied]);
  return {qc, active: () => current.current === owner};
}

export function useDmsBrowserRead<K extends "files" | "types">(auth: AuthContext, criteria: DmsBrowserCriteria & {operation: K}, options: {enabled?: boolean; onDenied?: () => void} = {}) {
  const identity = dmsBrowserIdentity(auth), parsed = dmsBrowserCriteriaSchema.parse(criteria), serialized = canonicalReadParams(parsed);
  const key = [...dmsBrowserPrefix(identity), criteria.operation, serialized], enabled = options.enabled !== false && canRead(auth);
  const query = useQuery<z.infer<(typeof schemas)[K]>, Error>({queryKey: key, enabled, staleTime: 30000, retry: retryAuthorizedRead, refetchOnWindowFocus: true,
    queryFn: async ({signal}) => {
      const response = await readJson<{success: true; data: unknown}>("dms-browser", parsed, signal), data = schemas[criteria.operation].parse(response.data);
      if (canonicalReadParams(data.criteria) !== serialized) throw Error("Browser response did not match its request");
      return data as z.infer<(typeof schemas)[K]>;
    }});
  const denied = !canRead(auth) || isDenied(query.error), lifecycle = useRetirement(key, denied, options.onDenied);
  return {...query, denied, data: !enabled || denied || query.isError || query.isFetching ? undefined : query.data,
    retry: () => {if (enabled && !denied && lifecycle.active() && lifecycle.qc.getQueryState(key)?.fetchStatus !== "fetching") void query.refetch({cancelRefetch: false});}};
}

export function useDmsBrowserSearch(auth: AuthContext, input: z.infer<typeof dmsBrowserSearchCriteria>, options: {enabled: boolean; onDenied?: () => void}) {
  const criteria = dmsBrowserSearchCriteria.parse({...input, offset: 0}), serialized = canonicalReadParams(criteria);
  const key = [...dmsBrowserPrefix(dmsBrowserIdentity(auth)), "search", serialized], enabled = options.enabled && canRead(auth);
  const query = useInfiniteQuery({queryKey: key, enabled, initialPageParam: 0, staleTime: 30000, retry: retryAuthorizedRead, refetchOnWindowFocus: true,
    queryFn: async ({signal, pageParam}) => {
      const p = {...criteria, offset: pageParam}, response = await readJson<{success: true; data: unknown}>("dms-browser", p, signal), data = searchResponse.parse(response.data);
      if (canonicalReadParams(data.criteria) !== canonicalReadParams(p)) throw Error("Browser response did not match its request");
      return data;
    },
    getNextPageParam: last => last.availability === "available" && last.criteria.offset + last.rows.length < last.totalCount ? last.criteria.offset + last.rows.length : undefined,
  });
  const denied = !canRead(auth) || isDenied(query.error), lifecycle = useRetirement(key, denied, options.onDenied);
  const pages = query.data?.pages;
  const first = pages?.[0], rows = pages?.flatMap(page => page.availability === "available" ? page.rows : []) ?? [];
  const inconsistent = !!pages && (pages.some((page, i) => page.availability !== "available" && i > 0 || page.availability === "available" && (first?.availability !== "available" || page.totalCount !== first.totalCount || page.criteria.offset !== i * criteria.limit)) || new Set(rows.map(row => row.id)).size !== rows.length);
  const failed = query.isError || inconsistent;
  const visible = enabled && !denied && !failed && (!query.isFetching || query.isFetchingNextPage);
  return {...query, denied, failed, data: visible && first ? {availability: first.availability, rows, totalCount: first.availability === "available" ? first.totalCount : undefined} : undefined,
    retry: () => {if (enabled && !denied && lifecycle.active() && lifecycle.qc.getQueryState(key)?.fetchStatus !== "fetching") void lifecycle.qc.resetQueries({queryKey: key, exact: true});},
    loadMore: () => {if (enabled && !denied && !failed && lifecycle.active() && query.hasNextPage && lifecycle.qc.getQueryState(key)?.fetchStatus !== "fetching") void query.fetchNextPage({cancelRefetch: false});},
  };
}
