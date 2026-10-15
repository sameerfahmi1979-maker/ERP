"use client";
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {ColumnFiltersState, PaginationState, SortingState, Updater} from "@tanstack/react-table";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";
import {ReadError, readJson, retryAuthorizedRead} from "@/lib/reads/client";
import {canonicalReadParams, type ReadPage} from "./use-server-page";
import {usePersistentUiState} from "./use-persistent-ui-state";

type Options<T> = {
  resource: string; prefix: readonly string[]; identity: string; allowed: boolean;
  seed?: ReadPage<T>; seedIdentity?: string; seedUpdatedAt?: number;
  defaultSort: SortingState; filters: ERPTableServerRead<T>["filters"];
  parseCriteria: (input: unknown) => Record<string, unknown> | null;
  parsePage: (input: unknown) => ReadPage<T>;
};
const resolve = <T,>(value: Updater<T>, old: T): T => typeof value === "function" ? (value as (old: T) => T)(old) : value;
/** Page bodies key their mount by resource + authorization identity. Only UI
 * criteria enter workspace memory; data remains ephemeral and owner-bound. */
export function useCountedTableRead<T>(options: Options<T>) {
  const {resource, identity, allowed} = options, qc = useQueryClient();
  const key = [...options.prefix, identity].join(":"), prefixJson = JSON.stringify([...options.prefix, identity]);
  const [pagination, setPagination] = usePersistentUiState<PaginationState>(key + ":page", {pageIndex: 0, pageSize: 25});
  const [sorting, setSorting] = usePersistentUiState<SortingState>(key + ":sort", options.defaultSort);
  const [filters, setFilters] = usePersistentUiState<ColumnFiltersState>(key + ":filters", []);
  const [search, setSearch] = usePersistentUiState(key + ":search", "");
  const [debounced, setDebounced] = useState(search), [denied, setDenied] = useState(false), [seedRetired, setSeedRetired] = useState(false);
  const owner = useMemo(() => ({identity, resource, qc}), [identity, resource, qc]);
  const liveOwner = useRef<typeof owner | null>(null);
  useLayoutEffect(() => {liveOwner.current = owner; return () => {if (liveOwner.current === owner) liveOwner.current = null;};}, [owner]);
  useEffect(() => {const timer = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(timer);}, [search]);
  const input = {...Object.fromEntries(filters.map(f => [f.id, f.value])), page: pagination.pageIndex + 1, pageSize: pagination.pageSize, sorting, search: debounced};
  const parsed = options.parseCriteria(input), immediate = options.parseCriteria({...input, search});
  const params = parsed ? canonicalReadParams(parsed) : "null", initial = canonicalReadParams(options.parseCriteria({}) ?? {});
  if (params !== initial && !seedRetired) setSeedRetired(true);
  const admitted = allowed && !denied && parsed !== null && immediate !== null && search === debounced;
  let seed: ReadPage<T> | undefined;
  try {if (options.seed) {const value = options.parsePage(options.seed); if (value.page === 1 && value.pageSize === 25) seed = value;}} catch { /* Invalid hydration cannot replace an authenticated read. */ }
  const queryKey = [...JSON.parse(prefixJson) as string[], "page", params];
  const q = useQuery({queryKey, enabled: admitted, gcTime: 0, staleTime: 30000, retry: retryAuthorizedRead,
    initialData: () => admitted && !seedRetired && params === initial && options.seedIdentity === identity && qc.getQueryState(queryKey) === undefined ? seed : undefined,
    initialDataUpdatedAt: options.seedUpdatedAt,
    queryFn: async ({signal}) => {
      if (liveOwner.current !== owner || !admitted) throw new DOMException("Read cancelled", "AbortError");
      const result = await readJson<{success: true; data: unknown}>(resource, JSON.parse(params), signal);
      signal.throwIfAborted(); if (liveOwner.current !== owner) throw new DOMException("Read cancelled", "AbortError");
      const page = options.parsePage(result.data);
      if (page.page !== parsed!.page || page.pageSize !== parsed!.pageSize) throw Error("Page and count could not be verified");
      return page;
    }});
  const accessDenied = !allowed || denied || q.error instanceof ReadError && [401, 403].includes(q.error.status);
  if (accessDenied && !denied) setDenied(true);
  useEffect(() => {if (accessDenied) {const queryKey = JSON.parse(prefixJson) as string[]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});}}, [accessDenied, prefixJson, qc]);
  const failed = q.isError || !parsed || !immediate, busy = !accessDenied && !!parsed && !!immediate && (q.isPending || q.isFetching || search !== debounced);
  const page = accessDenied || failed || busy ? undefined : q.data;
  useEffect(() => {if (page) {const maximum = Math.max(0, Math.ceil(page.totalCount / pagination.pageSize) - 1); if (pagination.pageIndex > maximum) setPagination(p => ({...p, pageIndex: maximum}));}}, [page, pagination.pageIndex, pagination.pageSize, setPagination]);
  const reset = () => {setSeedRetired(true); setPagination(p => ({...p, pageIndex: 0}));};
  const serverRead: ERPTableServerRead<T> = {pagination, sorting, globalFilter: search, columnFilters: filters, totalCount: page?.totalCount ?? null, filters: options.filters,
    onPaginationChange: update => {setSeedRetired(true); setPagination(p => {const next = resolve(update, p); return next.pageSize === p.pageSize ? next : {...next, pageIndex: 0};});},
    onSortingChange: update => {reset(); setSorting(p => resolve(update, p));}, onGlobalFilterChange: update => {reset(); setSearch(p => resolve(update, p));},
    onColumnFiltersChange: update => {reset(); setFilters(p => resolve(update, p));},
  };
  return {rows: page?.rows ?? [], totalCount: page?.totalCount ?? null, busy, failed: !!failed, denied: accessDenied, serverRead,
    refresh: () => {if (liveOwner.current === owner && admitted) {setSeedRetired(true); void qc.invalidateQueries({queryKey: JSON.parse(prefixJson) as string[]});}},
    canAct: () => liveOwner.current === owner && admitted && !accessDenied && !failed && !busy && !!page};
}
