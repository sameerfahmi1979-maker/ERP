"use client";
import {useEffect, useLayoutEffect, useMemo, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {ColumnFiltersState, PaginationState, SortingState, Updater} from "@tanstack/react-table";
import type {AuthContext} from "@/lib/rbac/check";
import {canUseApplication, hasPermission} from "@/lib/rbac/scope";
import {notificationCriteriaSchema, notificationPageSchema, NOTIFICATION_SEVERITIES, NOTIFICATION_STATUSES, type NotificationPage, type NotificationReadRow} from "@/lib/reads/notifications-schema";
import {ReadError, readJson, retryAuthorizedRead} from "@/lib/reads/client";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";
import {canonicalReadParams} from "./use-server-page";
import {usePersistentUiState} from "./use-persistent-ui-state";

export type NotificationPageProps = {authContext: AuthContext; audience?: "my" | "admin"; initialPage?: NotificationPage; initialIdentity?: string; initialUpdatedAt?: number};
const resolve = <T,>(value: Updater<T>, old: T): T => typeof value === "function" ? (value as (old: T) => T)(old) : value;
export function useNotificationPage(props: NotificationPageProps, identity: string) {
  const audience = props.audience ?? "my", qc = useQueryClient();
  const prefix = ["notifications", audience, identity], stateKey = prefix.join(":");
  const [pagination, setPagination] = usePersistentUiState<PaginationState>(stateKey + ":page", {pageIndex: 0, pageSize: 25});
  const [sorting, setSorting] = usePersistentUiState<SortingState>(stateKey + ":sort", [{id: "createdAt", desc: true}]);
  const [filters, setFilters] = usePersistentUiState<ColumnFiltersState>(stateKey + ":filters", []);
  const [search, setSearch] = usePersistentUiState(stateKey + ":search", "");
  const [status, setStatus] = usePersistentUiState(stateKey + ":status", "");
  const [debounced, setDebounced] = useState(search), [retiredSeed, setRetiredSeed] = useState(false), [denied, setDenied] = useState(false);
  useEffect(() => {const timer = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(timer);}, [search]);
  const owner = useMemo(() => ({identity, audience, qc}), [identity, audience, qc]);
  const liveOwner = useRef<typeof owner | null>(null);
  useLayoutEffect(() => {liveOwner.current = owner; return () => {if (liveOwner.current === owner) liveOwner.current = null;};}, [owner]);
  const allowed = canUseApplication(props.authContext) && (audience === "my" || hasPermission(props.authContext, "notifications.admin") || hasPermission(props.authContext, "notifications.manage"));
  const parsed = notificationCriteriaSchema.safeParse({...Object.fromEntries(filters.map(f => [f.id, f.value])), audience, page: pagination.pageIndex + 1, pageSize: pagination.pageSize, sorting, search: debounced, ...(status ? {status} : {})});
  const params = parsed.success ? canonicalReadParams(parsed.data) : "null", initial = canonicalReadParams(notificationCriteriaSchema.parse({audience}));
  if (params !== initial && !retiredSeed) setRetiredSeed(true);
  const seed = notificationPageSchema.safeParse(props.initialPage);
  const q = useQuery({queryKey: [...prefix, "page", params], enabled: allowed && !denied && parsed.success,
    initialData: () => !retiredSeed && params === initial && props.initialIdentity === identity && seed.success && seed.data.page === 1 && seed.data.pageSize === 25 ? seed.data : undefined,
    initialDataUpdatedAt: props.initialUpdatedAt, staleTime: 30000, gcTime: 0, retry: retryAuthorizedRead,
    queryFn: async ({signal}) => {
      if (liveOwner.current !== owner || !parsed.success) throw new DOMException("Read cancelled", "AbortError");
      const result = await readJson<{success: true; data: unknown}>("notifications", JSON.parse(params), signal);
      signal.throwIfAborted(); if (liveOwner.current !== owner) throw new DOMException("Read cancelled", "AbortError");
      const page = notificationPageSchema.parse(result.data);
      if (page.page !== parsed.data.page || page.pageSize !== parsed.data.pageSize) throw Error("Notification page could not be verified");
      return page;
    }});
  const accessDenied = !allowed || denied || q.error instanceof ReadError && [401, 403].includes(q.error.status);
  if (accessDenied && !denied) setDenied(true);
  useEffect(() => {if (accessDenied) {const queryKey = ["notifications", audience, identity]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});}}, [accessDenied, audience, identity, qc]);
  const busy = !accessDenied && (search !== debounced || q.isFetching || q.isPending), failed = q.isError || !parsed.success;
  const page = busy || failed || accessDenied ? undefined : q.data;
  useEffect(() => {if (page) {const maximum = Math.max(0, Math.ceil(page.totalCount / pagination.pageSize) - 1); if (pagination.pageIndex > maximum) setPagination(p => ({...p, pageIndex: maximum}));}}, [page, pagination.pageIndex, pagination.pageSize, setPagination]);
  const reset = () => {setRetiredSeed(true); setPagination(p => ({...p, pageIndex: 0}));};
  const serverRead: ERPTableServerRead<NotificationReadRow> = {pagination, sorting, globalFilter: search, columnFilters: filters, totalCount: page?.totalCount ?? null,
    onPaginationChange: update => {setRetiredSeed(true); setPagination(p => {const next = resolve(update, p); return next.pageSize === p.pageSize ? next : {...next, pageIndex: 0};});},
    onSortingChange: update => {reset(); setSorting(p => resolve(update, p));}, onGlobalFilterChange: update => {reset(); setSearch(p => resolve(update, p));},
    onColumnFiltersChange: update => {reset(); setStatus(""); setFilters(p => resolve(update, p));},
    filters: [{id: "status", label: "Status", type: "select", options: NOTIFICATION_STATUSES.map(value => ({value, label: value}))},
      {id: "severity", label: "Severity", type: "select", options: NOTIFICATION_SEVERITIES.map(value => ({value, label: value}))}, {id: "sourceModule", label: "Module", type: "text"}],
  };
  return {rows: page?.rows ?? [], totalCount: page?.totalCount ?? null, busy, failed, denied: accessDenied, serverRead, status,
    setStatus: (value: string) => {if (liveOwner.current === owner) {reset(); setFilters(p => p.filter(filter => filter.id !== "status")); setStatus(value);}},
    refresh: () => {if (liveOwner.current === owner && allowed && !denied && parsed.success) {setRetiredSeed(true); void qc.invalidateQueries({queryKey: prefix});}},
    isCurrent: () => liveOwner.current === owner && allowed && !accessDenied && !busy && !failed};
}
