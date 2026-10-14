"use client";
import {useEffect, useRef, useState} from "react";
import {useReadLifetime} from "./use-read-lifetime";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {ColumnFiltersState, PaginationState, SortingState, Updater} from "@tanstack/react-table";
import type {AuthContext} from "@/lib/rbac/check";
import {usePersistentUiState} from "./use-persistent-ui-state";
import {canonicalReadParams} from "./use-server-page";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {PAYROLL_INQUIRY_CONFIG, canReadPayrollInquiry, payrollInquiryCriteriaSchema, payrollInquiryIdentity, payrollInquiryPageSchema, type PayrollInquiryKind, type PayrollInquiryPage, type PayrollInquiryRowMap} from "@/lib/reads/hr-payroll-inquiries-schema";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";

export type PayrollInquiryProps = {authContext: AuthContext; initialPage?: PayrollInquiryPage; initialUpdatedAt?: number; initialReadIdentity?: string; initialReadError?: boolean};
export const payrollInquiryPrefix = (kind: PayrollInquiryKind) => ["hr", "payroll", PAYROLL_INQUIRY_CONFIG[kind].prefix] as const;
const resolve = <T,>(update: Updater<T>, previous: T) => typeof update === "function" ? (update as (p: T) => T)(previous) : update;
export function usePayrollInquiryIdentity(kind: PayrollInquiryKind, ctx: AuthContext) {
  const identity = payrollInquiryIdentity(ctx), qc = useQueryClient(), previous = useRef({kind, identity});
  useEffect(() => {
    if (previous.current.identity !== identity || previous.current.kind !== kind) {
      const queryKey = [...payrollInquiryPrefix(previous.current.kind), previous.current.identity];
      void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey}); previous.current = {kind, identity};
    }
  }, [kind, identity, qc]);
  return identity;
}
export function usePayrollInquiry<K extends PayrollInquiryKind>(kind: K, props: PayrollInquiryProps, identity: string) {
  const qc = useQueryClient(), key = `hr:payroll-inquiry:${kind}:${identity}`, config = PAYROLL_INQUIRY_CONFIG[kind];
  const [pagination, setPagination] = usePersistentUiState<PaginationState>(`${key}:page`, {pageIndex: 0, pageSize: 25});
  const [sorting, setSorting] = usePersistentUiState<SortingState>(`${key}:sort`, [{id: "full_name_en", desc: false}]);
  const [search, setSearch] = usePersistentUiState(`${key}:search`, ""), [filters, setFilters] = usePersistentUiState<ColumnFiltersState>(`${key}:filters`, []);
  const [employeeSearch, setEmployeeSearch] = usePersistentUiState(`${key}:employee-search`, ""), [employeeInput, setEmployeeInput] = usePersistentUiState(`${key}:employee-input`, "");
  const [status, setStatus] = usePersistentUiState(`${key}:status`, ""), [activeHoldOnly, setActiveHoldOnly] = usePersistentUiState(`${key}:hold-only`, false);
  const [debounced, setDebounced] = useState(search), [accessDenied, setAccessDenied] = useState(false);
  const [bootstrapFailed, setBootstrapFailed] = useState(props.initialReadIdentity === identity && props.initialReadError === true);
  const seedRetired = useRef(false);
  // The SSR envelope hydrates only the first render. Its data remains reusable
  // in the normal fresh cache, never as a source after eviction or invalidation.
  useEffect(() => {seedRetired.current = true;}, []);
  useEffect(() => {const timer = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(timer);}, [search]);
  const allowed = canReadPayrollInquiry(props.authContext, kind);
  const safe = payrollInquiryCriteriaSchema.safeParse({kind, page: pagination.pageIndex + 1, pageSize: pagination.pageSize, search, employeeSearch, status: status || null, activeHoldOnly, sorting, columnFilters: Object.fromEntries(filters.map(f => [f.id, String(f.value)]))});
  const request = safe.success ? payrollInquiryCriteriaSchema.safeParse({...safe.data, search: debounced}) : safe;
  const effective = request.success ? canonicalReadParams(request.data) : "null";
  const owner = useReadLifetime(JSON.stringify([identity, kind, effective, search]));
  const initial = canonicalReadParams(payrollInquiryCriteriaSchema.parse({kind})), validatedSeed = payrollInquiryPageSchema.safeParse(props.initialPage);
  const seed = allowed && !accessDenied && !bootstrapFailed && props.initialReadIdentity === identity && validatedSeed.success && validatedSeed.data.kind === kind && validatedSeed.data.page === 1 && validatedSeed.data.pageSize === 25 ? validatedSeed.data : undefined;
  const updatedAt = props.initialUpdatedAt ?? 0;
  const query = useQuery({queryKey: [...payrollInquiryPrefix(kind), identity, "counted-page", effective], enabled: allowed && !accessDenied && !bootstrapFailed && request.success && search === debounced,
    initialData: () => !seedRetired.current && effective === initial ? seed : undefined, initialDataUpdatedAt: updatedAt || undefined, staleTime: 30000, retry: retryAuthorizedRead, refetchOnWindowFocus: true,
    queryFn: async ({signal}) => {
      if (!request.success || search !== debounced) throw Error("Invalid or pending payroll criteria");
      const result = await readJson<{success: true; data: unknown}>("hr-payroll-inquiries", JSON.parse(effective), signal), parsed = payrollInquiryPageSchema.safeParse(result.data);
      if (!parsed.success || parsed.data.kind !== kind || parsed.data.page !== request.data.page || parsed.data.pageSize !== request.data.pageSize) throw Error("Payroll records and matching total could not be verified");
      return parsed.data;
    }});
  const denied = !allowed || accessDenied || query.error instanceof ReadError && [401, 403].includes(query.error.status);
  if (denied && !accessDenied) setAccessDenied(true);
  useEffect(() => {if (accessDenied) {const queryKey = [...payrollInquiryPrefix(kind), identity]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});}}, [accessDenied, qc, kind, identity]);
  const busy = allowed && !denied && safe.success && (query.isFetching || search !== debounced);
  const page = denied || bootstrapFailed || !request.success || query.isError || busy ? undefined : query.data;
  useEffect(() => {
    if (page) {
      const maximum = Math.max(0, Math.ceil(page.totalCount / pagination.pageSize) - 1);
      if (pagination.pageIndex > maximum) {void qc.invalidateQueries({queryKey: payrollInquiryPrefix(kind), refetchType: "none"}); setPagination(p => ({...p, pageIndex: maximum}));}
    }
  }, [page, pagination.pageIndex, pagination.pageSize, qc, kind, setPagination]);
  const resetPage = () => setPagination(p => ({...p, pageIndex: 0}));
  const serverRead: ERPTableServerRead<PayrollInquiryRowMap[K]> = {pagination, sorting, globalFilter: search, columnFilters: filters, totalCount: page?.totalCount ?? null,
    onPaginationChange: update => setPagination(p => {const next = resolve(update, p); return next.pageSize === p.pageSize ? next : {...next, pageIndex: 0};}),
    onSortingChange: update => {setSorting(p => resolve(update, p)); resetPage();},
    onGlobalFilterChange: update => {setSearch(p => resolve(update, p)); resetPage();},
    onColumnFiltersChange: update => {setFilters(p => resolve(update, p)); resetPage();}, filters: [...config.fields],
  };
  const refresh = () => {if (!owner.active || denied || !request.success || search !== debounced || busy) return; if (bootstrapFailed) setBootstrapFailed(false); else void query.refetch();};
  return {data: (page?.rows ?? []) as PayrollInquiryRowMap[K][], serverRead, busy, denied, invalid: !safe.success, isError: bootstrapFailed || query.isError, refresh,
    employeeInput, setEmployeeInput, employeeSearch, applyEmployeeSearch: () => {setEmployeeSearch(employeeInput); resetPage();}, clearEmployeeSearch: () => {setEmployeeInput(""); setEmployeeSearch(""); resetPage();},
    status, changeStatus: (value: string) => {setStatus(value); resetPage();}, activeHoldOnly, changeActiveHoldOnly: (value: boolean) => {setActiveHoldOnly(value); resetPage();}};
}
