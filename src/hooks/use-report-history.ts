"use client";
import {useEffect, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {ColumnFiltersState, PaginationState, SortingState, Updater} from "@tanstack/react-table";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {REPORT_RUN_FORMATS, REPORT_RUN_STATUSES, reportHistoryCriteriaSchema, reportHistoryPageSchema, reportHistoryDetailSchema, type ReportHistoryPageData, type ReportHistoryRow} from "@/lib/reads/report-history-schema";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";
import {usePersistentUiState} from "./use-persistent-ui-state";
import {canonicalReadParams} from "./use-server-page";

export type ReportHistoryProps = {authContext: AuthContext; initialPage?: ReportHistoryPageData; initialUpdatedAt?: number; initialReadIdentity?: string};
const resolve = <T,>(update: Updater<T>, previous: T) => typeof update === "function" ? (update as (p: T) => T)(previous) : update;
const isDenied = (error: unknown) => error instanceof ReadError && [401, 403].includes(error.status);
/** The containing view is keyed to identity. Data never outlives its principal;
 * F04 criteria memory is reused without persisting report contents to disk. */
export function useReportHistory(props: ReportHistoryProps, identity: string) {
  const qc = useQueryClient(), prefix = ["report-history", identity], key = `report-history:${identity}`;
  const [pagination, setPagination] = usePersistentUiState<PaginationState>(key + ":page", {pageIndex: 0, pageSize: 25});
  const [sorting, setSorting] = usePersistentUiState<SortingState>(key + ":sort", [{id: "started_at", desc: true}]);
  const [filters, setFilters] = usePersistentUiState<ColumnFiltersState>(key + ":filters", []), [search, setSearch] = usePersistentUiState(key + ":search", "");
  const [debounced, setDebounced] = useState(search), [accessDenied, setAccessDenied] = useState(false), [selectedId, setSelectedId] = useState<number | null>(null), [seedRetired, setSeedRetired] = useState(false);
  useEffect(() => {const timer = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(timer);}, [search]);
  const allowed = hasPermission(props.authContext, "reports.view") || hasPermission(props.authContext, "reports.history.view");
  const safe = reportHistoryCriteriaSchema.safeParse({page: pagination.pageIndex + 1, pageSize: pagination.pageSize, sorting, search, columnFilters: Object.fromEntries(filters.map(f => [f.id, String(f.value)]))});
  const request = safe.success ? reportHistoryCriteriaSchema.safeParse({...safe.data, search: debounced}) : safe;
  const params = request.success ? canonicalReadParams(request.data) : "null", initial = canonicalReadParams(reportHistoryCriteriaSchema.parse({}));
  if (params !== initial && !seedRetired) setSeedRetired(true);
  const validated = reportHistoryPageSchema.safeParse(props.initialPage);
  // Hydration is an initial render optimization, not a reusable data source.
  // gcTime=0 must not resurrect old SSR rows when returning from a later page.
  const seed = allowed && !accessDenied && !seedRetired && props.initialReadIdentity === identity && validated.success && validated.data.page === 1 && validated.data.pageSize === 25 ? validated.data : undefined;
  const query = useQuery({queryKey: [...prefix, "page", params], enabled: allowed && !accessDenied && request.success,
    initialData: params === initial ? seed : undefined, initialDataUpdatedAt: props.initialUpdatedAt, staleTime: 30000, gcTime: 0, retry: retryAuthorizedRead, refetchOnWindowFocus: true,
    queryFn: async ({signal}) => {
      if (!request.success) throw Error("Invalid report history criteria");
      const result = await readJson<{success: true; data: unknown}>("report-history", JSON.parse(params), signal), page = reportHistoryPageSchema.safeParse(result.data);
      if (!page.success || page.data.page !== request.data.page || page.data.pageSize !== request.data.pageSize) throw Error("Report history and count could not be verified");
      return page.data;
    }});
  const detailQuery = useQuery({queryKey: [...prefix, "detail", selectedId], enabled: allowed && !accessDenied && !isDenied(query.error) && selectedId !== null,
    gcTime: 0, staleTime: 0, retry: retryAuthorizedRead, refetchOnWindowFocus: true,
    queryFn: async ({signal}) => {
      const result = await readJson<{success: true; data: {mode?: unknown; record?: unknown}}>("report-history", {mode: "detail", recordId: selectedId}, signal);
      const detail = reportHistoryDetailSchema.safeParse(result.data?.record);
      if (result.data?.mode !== "detail" || !detail.success || detail.data.id !== selectedId) throw Error("Complete report details could not be verified");
      return detail.data;
    }});
  const denied = !allowed || accessDenied || isDenied(query.error) || isDenied(detailQuery.error);
  if (denied && !accessDenied) {setAccessDenied(true); setSelectedId(null);}
  useEffect(() => {
    if (denied) {
      const queryKey = ["report-history", identity]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});
    }
  }, [denied, identity, qc]);
  const busy = allowed && !denied && safe.success && (query.isFetching || search !== debounced);
  const page = denied || busy || !request.success || query.isError ? undefined : query.data;
  useEffect(() => {
    if (page) {
      const maximum = Math.max(0, Math.ceil(page.totalCount / pagination.pageSize) - 1);
      if (pagination.pageIndex > maximum) setPagination(p => ({...p, pageIndex: maximum}));
    }
  }, [page, pagination.pageIndex, pagination.pageSize, setPagination]);
  const serverRead: ERPTableServerRead<ReportHistoryRow> = {pagination, sorting, globalFilter: search, columnFilters: filters, totalCount: page?.totalCount ?? null,
    onPaginationChange: update => {setSeedRetired(true); setPagination(p => {const next = resolve(update, p); return next.pageSize === p.pageSize ? next : {...next, pageIndex: 0};});},
    onSortingChange: update => {setSeedRetired(true); setSorting(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    onGlobalFilterChange: update => {setSeedRetired(true); setSearch(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    onColumnFiltersChange: update => {setSeedRetired(true); setFilters(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    filters: [{id: "report_code", label: "Report code", type: "text"}, {id: "run_reference", label: "Reference", type: "text"},
      {id: "output_format", label: "Format", type: "select", options: REPORT_RUN_FORMATS.map(value => ({value, label: value.toUpperCase()}))},
      {id: "run_status", label: "Status", type: "select", options: REPORT_RUN_STATUSES.map(value => ({value, label: value}))},
      {id: "row_count", label: "Rows", type: "number"}, {id: "duration", label: "Duration (ms)", type: "number"}, {id: "started_at", label: "Started (UTC)", type: "date"}],
  };
  return {rows: page?.rows ?? [], totalCount: page?.totalCount ?? null, busy, denied, invalid: !safe.success, error: query.error,
    refresh: () => {setSeedRetired(true); return qc.invalidateQueries({queryKey: prefix});}, retry: () => query.refetch(), serverRead,
    selectedId: denied ? null : selectedId, select: (id: number | null) => {if (!denied) setSelectedId(id);},
    detail: denied || selectedId === null || detailQuery.isFetching || detailQuery.isError ? undefined : detailQuery.data,
    detailBusy: selectedId !== null && !denied && detailQuery.isFetching, detailError: detailQuery.error, retryDetail: () => detailQuery.refetch()};
}
