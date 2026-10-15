"use client";
import {useRecordReadActive} from "./use-record-read-active";
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {ColumnFiltersState, PaginationState, SortingState, Updater} from "@tanstack/react-table";
import type {AuthContext} from "@/lib/rbac/check";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {TIME_RECORD_CONFIG, timeRecordsReadIdentity, timeRecordPageCriteriaSchema, timeRecordPageResultSchema, timeRecordDetailResultSchema,
  type TimeRecordKind, type TimeRecordRowMap, type TimeRecordDetailMap, type TimeRecordAccess} from "@/lib/reads/hr-time-records-schema";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";
import {usePersistentUiState} from "./use-persistent-ui-state";
import {canonicalReadParams} from "./use-server-page";

export const timeRecordsPrefix = (employeeId: number, kind?: TimeRecordKind) => ["hr", "time-records", employeeId, ...(kind ? [kind] : [])] as const;
const forbidden = (error: unknown) => error instanceof ReadError && [401, 403].includes(error.status);
const resolve = <T,>(update: Updater<T>, previous: T) => typeof update === "function" ? (update as (p: T) => T)(previous) : update;
type Options = {enabled?: boolean; summaryId?: number; year?: number};

export function useHrTimeRecords<K extends TimeRecordKind>(kind: K, employeeId: number, authContext: AuthContext, onSubjectDenied: () => void, options: Options = {}) {
  const sectionActive = useRecordReadActive();
  const qc = useQueryClient(), identity = timeRecordsReadIdentity(authContext), scope = JSON.stringify([options.summaryId ?? null, options.year ?? null]);
  const prefix = [...timeRecordsPrefix(employeeId, kind), identity, scope], owner = JSON.stringify(prefix), memory = `hr:time-records:${owner}`;
  const [pagination, setPagination] = usePersistentUiState<PaginationState>(`${memory}:page`, {pageIndex: 0, pageSize: 25});
  const [sorting, setSorting] = usePersistentUiState<SortingState>(`${memory}:sort`, []);
  const [search, setSearch] = usePersistentUiState(`${memory}:search`, "");
  const [filters, setFilters] = usePersistentUiState<ColumnFiltersState>(`${memory}:filters`, []);
  const [delay, setDelay] = useState({owner, value: search});
  const [deniedOwner, setDeniedOwner] = useState<string | null>(null), [selected, setSelected] = useState<{owner: string; token: object; id: number; sequence: number} | null>(null);
  const enabled = sectionActive && options.enabled !== false;
  const [lifecycle, setLifecycle] = useState(() => ({owner, enabled, token: {}}));
  if (lifecycle.owner !== owner || lifecycle.enabled !== enabled) setLifecycle({owner, enabled, token: {}});
  const token = lifecycle.token;
  const selectedId = selected?.owner === owner && selected.token === token ? selected.id : null;
  const committed = useRef({owner, token, active: false, sequence: 0, denied: false, criteriaAdmitted: false, criteriaKey: "", pageReady: false, canManage: false, selectedId: null as number | null});
  const committedRows = useRef<{owner: string; rows: Record<string, unknown>[]; detail: Record<string, unknown> | null}>({owner, rows: [], detail: null});
  const notification = useRef<string | null>(null);
  const [verified, setVerified] = useState<{owner: string; access: TimeRecordAccess} | null>(null);
  const debounced = delay.owner === owner ? delay.value : search;
  useEffect(() => {const timer = setTimeout(() => setDelay({owner, value: search}), 250); return () => clearTimeout(timer);}, [owner, search]);
  const criteriaFor = (value: string) => timeRecordPageCriteriaSchema.safeParse({operation: "page", kind, employeeId,
    ...(options.summaryId !== undefined ? {summaryId: options.summaryId} : {}), ...(options.year !== undefined ? {year: options.year} : {}),
    page: pagination.pageIndex + 1, pageSize: pagination.pageSize, search: value, sorting, columnFilters: Object.fromEntries(filters.map(filter => [filter.id, String(filter.value)]))});
  const immediate = criteriaFor(search), settled = criteriaFor(debounced), criteriaAdmitted = immediate.success && settled.success && search === debounced;
  const criteriaKey = settled.success ? canonicalReadParams(settled.data) : "null";
  const allowed = authContext.isAccountActive && !authContext.profile?.must_change_password;
  const query = useQuery({queryKey: [...prefix, "page", criteriaKey], enabled: sectionActive && enabled && allowed && deniedOwner !== owner && criteriaAdmitted,
    staleTime: 30000, retry: retryAuthorizedRead, queryFn: async ({signal}) => {
      if (!criteriaAdmitted || !settled.success) throw new ReadError("Invalid or changing time criteria", 400);
      const response = await readJson<{success: true; data: unknown}>("hr-time-records", settled.data, signal); signal.throwIfAborted();
      const data = timeRecordPageResultSchema.parse(response.data);
      if (data.operation !== "page" || data.kind !== kind || data.employeeId !== employeeId || ("summaryId" in data ? data.summaryId : undefined) !== options.summaryId
        || ("year" in data ? data.year : undefined) !== options.year || "rows" in data && (data.page !== settled.data.page || data.pageSize !== settled.data.pageSize)) throw Error("Time page mismatch");
      return {success: true as const, data};
    }});
  const detailOptions = (id: number | null) => ({queryKey: [...prefix, "detail", id], staleTime: 30000, retry: retryAuthorizedRead,
    queryFn: async ({signal}: {signal: AbortSignal}) => {
      const response = await readJson<{success: true; data: unknown}>("hr-time-records", {operation: "detail", kind, employeeId, recordId: id, ...(kind === "corrections" ? {summaryId: options.summaryId} : {})}, signal); signal.throwIfAborted();
      const data = timeRecordDetailResultSchema.parse(response.data);
      if (data.operation !== "detail" || data.kind !== kind || data.employeeId !== employeeId || "recordId" in data && data.recordId !== id || data.summaryId !== options.summaryId) throw Error("Time detail mismatch");
      return {success: true as const, data};
    }});
  const detailQuery = useQuery({...detailOptions(selectedId), enabled: sectionActive && enabled && allowed && deniedOwner !== owner && selectedId !== null});
  const denied = !allowed || deniedOwner === owner || forbidden(query.error) || selectedId !== null && forbidden(detailQuery.error);
  if (denied && deniedOwner !== owner) setDeniedOwner(owner);
  const pageData = query.data?.data, detailData = selectedId === null ? undefined : detailQuery.data?.data;
  const restricted = !!(pageData && "availability" in pageData && pageData.availability === "restricted" || detailData && "availability" in detailData && detailData.availability === "restricted");
  const collectionUnavailable = !!pageData && "availability" in pageData && pageData.availability === "unavailable";
  const detailUnavailable = !!detailData && "availability" in detailData && detailData.availability === "unavailable";
  useLayoutEffect(() => {
    const queryKey = [...timeRecordsPrefix(employeeId, kind), identity, scope];
    const lifetime = {owner, token, active: enabled, sequence: 0, denied: false, criteriaAdmitted: false, criteriaKey: "", pageReady: false, canManage: false, selectedId: null as number | null}; committed.current = lifetime;
    return () => {lifetime.active = false; lifetime.sequence++; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});};
  }, [owner, token, enabled, qc, employeeId, kind, identity, scope]);
  useLayoutEffect(() => {committed.current.denied = denied || restricted || !enabled;}, [denied, restricted, enabled]);
  useLayoutEffect(() => {
    if (!denied) return;
    const queryKey = [...timeRecordsPrefix(employeeId, kind), identity, scope];
    void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});
    if (notification.current !== owner) {notification.current = owner; onSubjectDenied();}
  }, [owner, denied, qc, onSubjectDenied, employeeId, kind, identity, scope]);
  const available = [!query.isFetching && !query.isError && pageData && "access" in pageData ? pageData.access : undefined,
    !detailQuery.isFetching && !detailQuery.isError && detailData && "access" in detailData ? detailData.access : undefined].filter((a): a is TimeRecordAccess => !!a);
  const nextAccess = available.length ? {canManage: available.every(a => a.canManage)} : undefined;
  if (nextAccess && (verified?.owner !== owner || verified.access.canManage !== nextAccess.canManage)) setVerified({owner, access: nextAccess});
  const access = denied || restricted ? {canManage: false} : verified?.owner === owner ? verified.access : {canManage: false};
  useEffect(() => {
    if (!detailUnavailable && !restricted && !collectionUnavailable) return;
    const queryKey = [...timeRecordsPrefix(employeeId, kind), identity, scope];
    for (const cached of qc.getQueryCache().findAll({queryKey})) {
      const data = (cached.state.data as {data?: unknown} | undefined)?.data;
      if (data && typeof data === "object" && "availability" in data) continue;
      cached.setState({data: undefined, status: "pending"});
    }
    if (detailUnavailable) void qc.invalidateQueries({queryKey: [...queryKey, "page"]});
  }, [detailUnavailable, restricted, collectionUnavailable, selectedId, employeeId, kind, identity, scope, qc]);
  const busy = enabled && !denied && immediate.success && (query.isFetching || search !== debounced);
  const page = enabled && !denied && !restricted && !busy && !query.isError && criteriaAdmitted && pageData && "rows" in pageData ? pageData : undefined;
  useLayoutEffect(() => {
    committed.current.criteriaAdmitted = criteriaAdmitted; committed.current.criteriaKey = criteriaKey;
    committed.current.pageReady = !!page; committed.current.canManage = access.canManage; committed.current.selectedId = selectedId;
    committedRows.current = {owner, rows: page?.rows ?? [], detail: !detailQuery.isFetching && !detailQuery.isError && detailData && "row" in detailData ? detailData.row : null};
  }, [owner, page, detailData, detailQuery.isFetching, detailQuery.isError, criteriaAdmitted, criteriaKey, access.canManage, selectedId]);
  const isCurrent = useCallback(() => committed.current.token === token && committed.current.active && !committed.current.denied, [token]);
  const refetch = (opts?: Parameters<typeof query.refetch>[0]) => isCurrent() && committed.current.criteriaAdmitted && committed.current.criteriaKey === criteriaKey ? query.refetch(opts) : Promise.resolve();
  const refetchDetail = (opts?: Parameters<typeof detailQuery.refetch>[0]) => isCurrent() && selectedId !== null && committed.current.selectedId === selectedId && committed.current.sequence === selected?.sequence ? detailQuery.refetch(opts) : Promise.resolve();
  useEffect(() => {
    if (!page) return;
    const maximum = Math.max(0, Math.ceil(page.totalCount / pagination.pageSize) - 1);
    if (pagination.pageIndex > maximum) setPagination(p => ({...p, pageIndex: maximum}));
  }, [page, pagination.pageIndex, pagination.pageSize, setPagination]);
  const serverRead: ERPTableServerRead<TimeRecordRowMap[K]> = {
    pagination, sorting, globalFilter: search, columnFilters: filters, totalCount: page?.totalCount ?? null,
    onPaginationChange: update => {if (isCurrent()) setPagination(p => {const next = resolve(update, p); return next.pageSize === p.pageSize ? next : {...next, pageIndex: 0};});},
    onSortingChange: update => {if (!isCurrent()) return; setSorting(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    onGlobalFilterChange: update => {if (!isCurrent()) return; setSearch(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    onColumnFiltersChange: update => {if (!isCurrent()) return; setFilters(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));}, filters: TIME_RECORD_CONFIG[kind].fields.map(f => ({...f})),
  };
  async function loadDetail(id: number) {
    const lifetime = committed.current;
    if (!isCurrent() || !lifetime.pageReady || !lifetime.canManage || !committedRows.current.rows.some(row => row.id === id)) return null;
    const sequence = ++lifetime.sequence; setSelected({owner, token, id, sequence});
    try {
      const result = await qc.fetchQuery({...detailOptions(id), staleTime: 0});
      return lifetime.active && !lifetime.denied && lifetime.sequence === sequence && "row" in result.data && result.data.access.canManage ? result.data.row as TimeRecordDetailMap[K] : null;
    } catch (error) {if (lifetime.active && lifetime.sequence === sequence && forbidden(error)) setDeniedOwner(owner); return null;}
  }
  const closeDetail = useCallback(() => {
    if (committed.current.token === token && committed.current.active && (selected ? selected.token === token && selected.sequence === committed.current.sequence : committed.current.selectedId === null)) {
      committed.current.sequence++; setSelected(null);
    }
  }, [token, selected, setSelected]);
  const isDetailCurrent = (id: number, statuses?: readonly string[]) => isCurrent()
    && selected?.owner === owner && selected.token === token && selected.id === id && committed.current.sequence === selected.sequence && committedRows.current.owner === owner
    && committedRows.current.detail?.id === id && (!statuses || statuses.includes(String(committedRows.current.detail.approval_status)));
  const isRowCurrent = (id: number, statuses?: readonly string[]) => isCurrent()
    && committedRows.current.owner === owner && committedRows.current.rows.some(row => row.id === id && (!statuses || statuses.includes(String(row.approval_status))));
  const refresh = useCallback(async () => {
    if (!isCurrent()) return;
    const queryKey = [...timeRecordsPrefix(employeeId, kind), identity, scope];
    await qc.cancelQueries({queryKey}); if (isCurrent()) await qc.invalidateQueries({queryKey});
  }, [qc, employeeId, kind, identity, scope, isCurrent]);
  const admittedQuery = {...query, refetch, isSuccess: enabled && query.isSuccess && !busy && !denied && !restricted && !collectionUnavailable && criteriaAdmitted,
    isError: enabled && criteriaAdmitted && query.isError, isFetching: busy};
  const admittedDetail = {...detailQuery, refetch: refetchDetail, isSuccess: detailQuery.isSuccess && !detailUnavailable && !restricted};
  return {query: admittedQuery, detailQuery: admittedDetail, reads: !enabled ? [] : selectedId === null ? [admittedQuery] : [admittedQuery, admittedDetail],
    identity, owner, denied, restricted, collectionUnavailable, access, busy, invalid: enabled && !immediate.success,
    validationMessage: enabled && !immediate.success ? "Review the filters, search length and page criteria. Invalid criteria were not sent." : null,
    serverRead, rows: (page?.rows ?? []) as TimeRecordRowMap[K][], loadDetail, closeDetail, isDetailCurrent, isRowCurrent, refresh,
    detailUnavailable, detailPending: selectedId !== null && detailQuery.isFetching,
    detailError: selectedId !== null && detailQuery.isError ? "The complete record could not be verified. Retry before making changes." : null};
}
