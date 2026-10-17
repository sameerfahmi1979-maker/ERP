"use client";
import {useRecordReadActive} from "./use-record-read-active";
import {useEffect, useLayoutEffect, useRef, useState} from "react";
import {useReadLifetime} from "./use-read-lifetime";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {ColumnFiltersState, PaginationState, SortingState, Updater} from "@tanstack/react-table";
import {usePersistentUiState} from "./use-persistent-ui-state";
import {canonicalReadParams} from "./use-server-page";
import {ReadError, readJson, retryAuthorizedRead} from "@/lib/reads/client";
import {HR_ACTION_RECORD_CONFIG, hrActionRecordCriteriaSchema, hrActionRecordPageSchema, hrActionRecordDetailSchema, type HrActionRecordKind, type HrActionRecordRowMap} from "@/lib/reads/hr-action-records-schema";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";
const resolve = <T,>(update: Updater<T>, previous: T) => typeof update === "function" ? (update as (p: T) => T)(previous) : update;
export function useHrActionRecords<K extends HrActionRecordKind>(kind: K, employeeId: number, identity: string, eosCaseId?: number, onDenied?: () => void) {
  const sectionActive = useRecordReadActive();
  const config = HR_ACTION_RECORD_CONFIG[kind], qc = useQueryClient(), key = `hr:action-records:${identity}:${employeeId}:${kind}:${eosCaseId ?? "none"}`, prefix = ["hr", "actions", config.prefix, kind === "clearance" ? eosCaseId ?? "none" : employeeId] as const;
  const [pagination, setPagination] = usePersistentUiState<PaginationState>(`${key}:pagination`, {pageIndex: 0, pageSize: 25}), [sorting, setSorting] = usePersistentUiState<SortingState>(`${key}:sorting`, [{id: config.sort, desc: kind !== "clearance"}]);
  const [search, setSearch] = usePersistentUiState(`${key}:search`, ""), [filters, setFilters] = usePersistentUiState<ColumnFiltersState>(`${key}:filters`, []), [debounced, setDebounced] = useState(search);
  const [detailError, setDetailError] = useState<string | null>(null), [detailPending, setDetailPending] = useState(false), lifetime = useRef({active: true, latest: 0});
  useEffect(() => {const timer = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(timer);}, [search]);
  useEffect(() => {const owner = lifetime.current; owner.active = true; return () => {owner.active = false; owner.latest++;};}, []);
  const enabled = kind !== "clearance" || eosCaseId !== undefined;
  const safe = hrActionRecordCriteriaSchema.safeParse({kind, employeeId, ...(eosCaseId !== undefined ? {eosCaseId} : {}), page: pagination.pageIndex + 1, pageSize: pagination.pageSize, search, sorting, columnFilters: Object.fromEntries(filters.map(f => [f.id, String(f.value)]))});
  const request = hrActionRecordCriteriaSchema.safeParse({kind, employeeId, ...(eosCaseId !== undefined ? {eosCaseId} : {}), page: pagination.pageIndex + 1, pageSize: pagination.pageSize, search: debounced, sorting, columnFilters: Object.fromEntries(filters.map(f => [f.id, String(f.value)]))});
  const admitted = safe.success && request.success && search === debounced;
  const effective = request.success ? canonicalReadParams(request.data) : "null";
  const criteriaOwner = useReadLifetime(JSON.stringify([identity, employeeId, kind, eosCaseId, effective, search]));
  const readiness = useRef(false);
  const [detailOwner, setDetailOwner] = useState(criteriaOwner);
  if (detailOwner !== criteriaOwner) {setDetailOwner(criteriaOwner); setDetailPending(false); setDetailError(null);}
  useLayoutEffect(() => {lifetime.current.latest++;}, [criteriaOwner]);
  const query = useQuery({queryKey: [...prefix, "counted-page", effective, identity], enabled: sectionActive && enabled && admitted, staleTime: 30000, retry: retryAuthorizedRead, refetchOnWindowFocus: true,
    queryFn: async ({signal}) => {
      if (!admitted || !request.success) throw new ReadError("HR action criteria are invalid or still changing", 400);
      const result = await readJson<{success: true; data: unknown}>("hr-action-records", request.data, signal), parsed = hrActionRecordPageSchema.safeParse(result.data);
      if (!parsed.success || parsed.data.kind !== kind || parsed.data.employeeId !== employeeId || parsed.data.eosCaseId !== eosCaseId || parsed.data.page !== request.data.page || parsed.data.pageSize !== request.data.pageSize) throw Error("HR action page and total could not be verified");
      return parsed.data;
    }});
  const denied = query.error instanceof ReadError && [401, 403].includes(query.error.status);
  useEffect(() => {if (denied) onDenied?.();}, [denied, onDenied]);
  const busy = enabled && (query.isFetching || search !== debounced), page = !admitted || query.isError || busy ? undefined : query.data;
  useEffect(() => {if (page) {const maximum = Math.max(0, Math.ceil(page.totalCount / pagination.pageSize) - 1); if (pagination.pageIndex > maximum) {void qc.invalidateQueries({queryKey: ["hr", "actions", config.prefix, kind === "clearance" ? eosCaseId ?? "none" : employeeId], refetchType: "none"}); setPagination(p => ({...p, pageIndex: maximum}));}}}, [page, pagination.pageIndex, pagination.pageSize, setPagination, qc, config.prefix, employeeId, kind, eosCaseId]);
  useLayoutEffect(() => {readiness.current = enabled && !!page && !denied;});
  const canDispatch = () => criteriaOwner.active && lifetime.current.active && readiness.current;
  const refetch = (options?: Parameters<typeof query.refetch>[0]) => criteriaOwner.active && lifetime.current.active && enabled && admitted && !denied ? query.refetch(options) : Promise.resolve();
  const serverRead: ERPTableServerRead<HrActionRecordRowMap[K]> = {pagination, sorting, globalFilter: search, columnFilters: filters, totalCount: page?.totalCount ?? null,
    onPaginationChange: update => setPagination(p => {const next = resolve(update, p); return next.pageSize === p.pageSize ? next : {...next, pageIndex: 0};}),
    onSortingChange: update => {setSorting(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    onGlobalFilterChange: update => {setSearch(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    onColumnFiltersChange: update => {setFilters(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    filters: config.fields.map(f => ({...f, options: "options" in f && f.options ? [...f.options] : undefined})),
  };
  async function loadDetail(recordId: number) {
    if (!canDispatch() || !page?.rows.some(row => row.id === recordId)) return null;
    const owner = lifetime.current, sequence = ++owner.latest;
    setDetailError(null); setDetailPending(true);
    try {
      const data = await qc.fetchQuery({queryKey: [...prefix, "point-detail", recordId, identity], staleTime: 0, retry: retryAuthorizedRead, queryFn: async ({signal}) => {
        const result = await readJson<{success: true; data: unknown}>("hr-action-record-detail", {kind, employeeId, recordId, ...(eosCaseId !== undefined ? {eosCaseId} : {})}, signal), parsed = hrActionRecordDetailSchema.safeParse(result.data);
        if (!parsed.success || parsed.data.kind !== kind || parsed.data.employeeId !== employeeId || parsed.data.eosCaseId !== eosCaseId || parsed.data.row.id !== recordId) throw Error("Complete HR action detail could not be verified");
        return parsed.data.row;
      }});
      return criteriaOwner.active && owner.active && owner.latest === sequence ? data : null;
    } catch (error) {
      if (owner.active && owner.latest === sequence) {if (error instanceof ReadError && [401, 403].includes(error.status)) onDenied?.(); else setDetailError("The complete record could not be loaded. Your editor was not opened with partial data. Please retry.");}
      return null;
    } finally {if (owner.active && owner.latest === sequence) setDetailPending(false);}
  }
  const unavailable = enabled && (busy || query.isError || !safe.success);
  return {...query, refetch, canDispatch, ready: enabled && !!page && !denied, data: page?.rows as HrActionRecordRowMap[K][] | undefined, isLoading: unavailable, loadDetail, detailPending,
    collection: {serverRead, isLoading: unavailable, message: enabled && !safe.success ? "Review the filters, search length and page criteria. Invalid criteria were not sent." : detailError, userProfileId: identity}};
}
