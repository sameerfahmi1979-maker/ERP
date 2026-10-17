"use client";
import {useRecordReadActive} from "./use-record-read-active";
import {createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type ReactNode} from "react";
import {useReadLifetime} from "./use-read-lifetime";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {ColumnFiltersState, PaginationState, SortingState, Updater} from "@tanstack/react-table";
import {usePersistentUiState} from "./use-persistent-ui-state";
import {canonicalReadParams} from "./use-server-page";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {PAYROLL_RECORD_FIELDS, PAYROLL_RECORD_SORT, payrollPointSchemas, payrollRecordCriteriaSchema, payrollRecordPageSchema, type PayrollPointKind, type PayrollPointMap, type PayrollRecordKind, type PayrollRecordRowMap} from "@/lib/reads/hr-payroll-records-schema";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";

const Context = createContext<{identity: string; onDenied: () => void} | null>(null);
export function PayrollReadScope({identity, onDenied, children}: {identity: string; onDenied: () => void; children: ReactNode}) {
  return <Context.Provider value={{identity, onDenied}}>{children}</Context.Provider>;
}
export function usePayrollReadScope() {const scope = useContext(Context); if (!scope) throw Error("Payroll read scope missing"); return scope;}
const pointPrefix = {profile: "profile", "salary-totals": "gross-salary", wps: "wps-readiness", "component-detail": "salary-components"} as const;
export async function fetchPayrollPoint<K extends PayrollPointKind>(kind: K, employeeId: number, signal?: AbortSignal, recordId?: number): Promise<PayrollPointMap[K]> {
  const result = await readJson<{success: true; data: {kind: string; employeeId: number; value: unknown}}>("hr-payroll-point", {kind, employeeId, ...(recordId ? {recordId} : {})}, signal);
  const safe = payrollPointSchemas[kind].safeParse(result.data?.value);
  if (result.data?.kind !== kind || result.data.employeeId !== employeeId || !safe.success || kind === "component-detail" && safe.data && "id" in safe.data && safe.data.id !== recordId) throw Error("Complete payroll detail could not be verified");
  if (safe.data && "employee_id" in safe.data && safe.data.employee_id !== employeeId || safe.data && "profile" in safe.data && safe.data.profile && safe.data.profile.employee_id !== employeeId) throw Error("Payroll subject could not be verified");
  return safe.data as PayrollPointMap[K];
}
export function usePayrollPoint<K extends PayrollPointKind>(kind: K, employeeId: number, enabled = true) {
  const sectionActive = useRecordReadActive();
  const {identity, onDenied} = usePayrollReadScope();
  const owner = useReadLifetime(JSON.stringify([identity, employeeId, kind, enabled]));
  const readiness = useRef(false);
  const query = useQuery({queryKey: ["hr", "payroll", pointPrefix[kind], employeeId, "authorized-point", identity], enabled: sectionActive && enabled, staleTime: 30000, retry: retryAuthorizedRead,
    queryFn: ({signal}) => fetchPayrollPoint(kind, employeeId, signal)});
  const denied = query.error instanceof ReadError && [401, 403].includes(query.error.status);
  useEffect(() => {if (denied) onDenied();}, [denied, onDenied]);
  const ready = enabled && !query.isError && !query.isFetching && query.data !== undefined;
  useLayoutEffect(() => {readiness.current = ready;});
  const canDispatch = () => owner.active && readiness.current;
  const refetch = (options?: Parameters<typeof query.refetch>[0]) => owner.active && enabled && !denied ? query.refetch(options) : Promise.resolve();
  return {...query, refetch, ready, canDispatch, data: ready ? {success: true as const, data: query.data} : undefined, isLoading: enabled && (query.isPending || query.isFetching || query.isError)};
}
const resolve = <T,>(update: Updater<T>, previous: T) => typeof update === "function" ? (update as (p: T) => T)(previous) : update;
export function usePayrollRecords<K extends PayrollRecordKind>(kind: K, employeeId: number) {
  const sectionActive = useRecordReadActive();
  const {identity, onDenied} = usePayrollReadScope(), qc = useQueryClient(), key = `hr:payroll:${kind}:${employeeId}:${identity}`, prefix = ["hr", "payroll", kind, employeeId] as const;
  const [pagination, setPagination] = usePersistentUiState<PaginationState>(`${key}:page`, {pageIndex: 0, pageSize: 25}), [sorting, setSorting] = usePersistentUiState<SortingState>(`${key}:sort`, kind === "salary-components" ? [] : [{id: PAYROLL_RECORD_SORT[kind], desc: true}]);
  const [search, setSearch] = usePersistentUiState(`${key}:search`, ""), [filters, setFilters] = usePersistentUiState<ColumnFiltersState>(`${key}:filters`, []), [debounced, setDebounced] = useState(search);
  const [detailError, setDetailError] = useState<string | null>(null), [detailPending, setDetailPending] = useState(false), lifetime = useRef({active: true, sequence: 0});
  useEffect(() => {const timer = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(timer);}, [search]);
  useEffect(() => {const owner = lifetime.current; owner.active = true; return () => {owner.active = false; owner.sequence++;};}, []);
  const safe = payrollRecordCriteriaSchema.safeParse({kind, employeeId, page: pagination.pageIndex + 1, pageSize: pagination.pageSize, search, sorting, columnFilters: Object.fromEntries(filters.map(f => [f.id, String(f.value)]))});
  const request = payrollRecordCriteriaSchema.safeParse({kind, employeeId, page: pagination.pageIndex + 1, pageSize: pagination.pageSize, search: debounced, sorting, columnFilters: Object.fromEntries(filters.map(f => [f.id, String(f.value)]))});
  const admitted = safe.success && request.success && search === debounced;
  const effective = request.success ? canonicalReadParams(request.data) : "null";
  const ownerToken = useReadLifetime(JSON.stringify([identity, employeeId, kind, effective, search]));
  const readiness = useRef(false);
  const [detailOwner, setDetailOwner] = useState(ownerToken);
  if (detailOwner !== ownerToken) {setDetailOwner(ownerToken); setDetailPending(false); setDetailError(null);}
  useLayoutEffect(() => {lifetime.current.sequence++;}, [ownerToken]);
  const query = useQuery({queryKey: [...prefix, "counted-page", effective, identity], enabled: sectionActive && admitted, staleTime: 30000, retry: retryAuthorizedRead,
    queryFn: async ({signal}) => {
      // Manual refetch can bypass enabled. Validate the actual settled request
      // again before transport; a corrected input must not send its old value.
      if (!admitted || !request.success) throw new ReadError("Payroll criteria are invalid or still changing", 400);
      const result = await readJson<{success: true; data: unknown}>("hr-payroll-records", request.data, signal), parsed = payrollRecordPageSchema.safeParse(result.data);
      if (!parsed.success || parsed.data.kind !== kind || parsed.data.employeeId !== employeeId || parsed.data.page !== request.data.page || parsed.data.pageSize !== request.data.pageSize) throw Error("Payroll page and total could not be verified");
      return parsed.data;
    }});
  const denied = query.error instanceof ReadError && [401, 403].includes(query.error.status);
  useEffect(() => {if (denied) onDenied();}, [denied, onDenied]);
  const busy = query.isFetching || search !== debounced, page = !admitted || query.isError || busy ? undefined : query.data;
  const refetch = (options?: Parameters<typeof query.refetch>[0]) => ownerToken.active && admitted && !denied ? query.refetch(options) : Promise.resolve();
  useEffect(() => {if (page) {const maximum = Math.max(0, Math.ceil(page.totalCount / pagination.pageSize) - 1); if (pagination.pageIndex > maximum) setPagination(p => ({...p, pageIndex: maximum}));}}, [page, pagination.pageIndex, pagination.pageSize, setPagination]);
  const ready = !!page && !denied;
  useLayoutEffect(() => {readiness.current = ready;});
  const canDispatch = () => ownerToken.active && readiness.current;
  const serverRead: ERPTableServerRead<PayrollRecordRowMap[K]> = {pagination, sorting, globalFilter: search, columnFilters: filters, totalCount: page?.totalCount ?? null,
    onPaginationChange: update => setPagination(p => {const next = resolve(update, p); return next.pageSize === p.pageSize ? next : {...next, pageIndex: 0};}),
    onSortingChange: update => {setSorting(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    onGlobalFilterChange: update => {setSearch(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    onColumnFiltersChange: update => {setFilters(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    filters: PAYROLL_RECORD_FIELDS[kind].map(f => ({...f, options: f.options ? [...f.options] : undefined})),
  };
  async function loadComponentDetail(recordId: number) {
    if (kind !== "salary-components" || !canDispatch() || !page?.rows.some(row => row.id === recordId)) return null;
    const owner = lifetime.current, sequence = ++owner.sequence;
    setDetailError(null); setDetailPending(true);
    try {
      const detail = await qc.fetchQuery({queryKey: [...prefix, "point-detail", recordId, identity], staleTime: 0, retry: retryAuthorizedRead, queryFn: ({signal}) => fetchPayrollPoint("component-detail", employeeId, signal, recordId)});
      return ownerToken.active && owner.active && owner.sequence === sequence ? detail : null;
    } catch (error) {
      if (ownerToken.active && owner.active && owner.sequence === sequence) {if (error instanceof ReadError && [401, 403].includes(error.status)) onDenied(); else setDetailError("The complete salary component could not be loaded. Retry opening it; no partial editor was opened.");}
      return null;
    } finally {if (ownerToken.active && owner.active && owner.sequence === sequence) setDetailPending(false);}
  }
  return {...query, refetch, ready, canDispatch, data: page ? {success: true as const, data: page.rows as PayrollRecordRowMap[K][]} : undefined, activeHoldCount: page?.kind === "holds" ? page.activeCount : null, isLoading: busy, loadComponentDetail, detailPending,
    collection: {serverRead, isLoading: busy || query.isError || !admitted, userProfileId: identity, message: !safe.success ? "Review the filters, search and page criteria. Invalid criteria were not sent." : detailError}};
}
