"use client";
import {useEffect, useLayoutEffect, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {ColumnFiltersState, PaginationState, SortingState, Updater} from "@tanstack/react-table";
import {usePersistentUiState} from "./use-persistent-ui-state";
import {canonicalReadParams} from "./use-server-page";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {hasPermission} from "@/lib/rbac/scope";
import type {AuthContext} from "@/lib/rbac/check";
import {HR_ACTION_RECORD_CONFIG} from "@/lib/reads/hr-action-records-schema";
import {HR_ACTION_INQUIRY_FIELDS, hrActionInquiryCriteriaSchema, hrActionInquiryPageSchema, hrActionInquiryIdentity, hrDisciplinaryInquiryDetailSchema, type HrActionInquiryKind, type HrActionInquiryPage, type HrActionInquiryRowMap} from "@/lib/reads/hr-action-inquiries-schema";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";

export type HrActionInquiryProps = {authContext: AuthContext; initialPage?: HrActionInquiryPage; initialUpdatedAt?: number; initialReadIdentity?: string};
const prefixes = {pro: "global-pro-processes", disciplinary: "global-disciplinary", approvals: "global-approvals", eos: "global-eos-cases"} as const;
export const hrActionInquiryPrefix = (kind: HrActionInquiryKind) => ["hr", "actions", prefixes[kind]] as const;
const resolve = <T,>(update: Updater<T>, previous: T) => typeof update === "function" ? (update as (p: T) => T)(previous) : update;

/** Each page keys its complete form/dialog session by this identity. */
export function useHrActionInquiryIdentity(kind: HrActionInquiryKind, ctx: AuthContext) {
  const identity = hrActionInquiryIdentity(ctx), qc = useQueryClient(), previous = useRef({kind, identity});
  useEffect(() => {
    if (previous.current.identity !== identity || previous.current.kind !== kind) {
      const queryKey = [...hrActionInquiryPrefix(previous.current.kind), previous.current.identity];
      void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey}); previous.current = {kind, identity};
    }
  }, [kind, identity, qc]);
  return identity;
}

export function useHrActionInquiry<K extends HrActionInquiryKind>(kind: K, props: HrActionInquiryProps, identity: string) {
  const qc = useQueryClient(), config = HR_ACTION_RECORD_CONFIG[kind], key = `hr:action-inquiry:${kind}:${identity}`;
  const [pagination, setPagination] = usePersistentUiState<PaginationState>(`${key}:page`, {pageIndex: 0, pageSize: 25});
  const [sorting, setSorting] = usePersistentUiState<SortingState>(`${key}:sort`, [{id: config.sort, desc: true}]);
  const [search, setSearch] = usePersistentUiState(`${key}:search`, ""), [filters, setFilters] = usePersistentUiState<ColumnFiltersState>(`${key}:filters`, []);
  const [debounced, setDebounced] = useState(search), [accessDenied, setAccessDenied] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null), [detailPending, setDetailPending] = useState(false);
  const lifetime = useRef({active: true, sequence: 0});
  useEffect(() => {const timer = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(timer);}, [search]);
  useEffect(() => {const owner = lifetime.current; owner.active = true; return () => {owner.active = false; owner.sequence++;};}, []);
  const allowed = (hasPermission(props.authContext, "hr.actions.view") || kind === "eos" && hasPermission(props.authContext, "hr.eos.view")) && (kind !== "disciplinary" || hasPermission(props.authContext, "hr.confidential.view"));
  const safe = hrActionInquiryCriteriaSchema.safeParse({kind, page: pagination.pageIndex + 1, pageSize: pagination.pageSize, search, sorting, columnFilters: Object.fromEntries(filters.map(f => [f.id, String(f.value)]))});
  const request = hrActionInquiryCriteriaSchema.safeParse({kind, page: pagination.pageIndex + 1, pageSize: pagination.pageSize, search: debounced, sorting, columnFilters: Object.fromEntries(filters.map(f => [f.id, String(f.value)]))});
  const admitted = safe.success && request.success && search === debounced;
  const effective = request.success ? canonicalReadParams(request.data) : "null";
  const criteriaIdentity = safe.success ? canonicalReadParams(safe.data) : "invalid";
  const previousCriteria = useRef(criteriaIdentity);
  useLayoutEffect(() => {
    if (previousCriteria.current !== criteriaIdentity) {
      lifetime.current.sequence++; previousCriteria.current = criteriaIdentity;
      setDetailPending(false); setDetailError(null);
    }
  }, [criteriaIdentity]);
  const initial = canonicalReadParams(hrActionInquiryCriteriaSchema.parse({kind, sorting: [{id: config.sort, desc: true}]})), validatedSeed = hrActionInquiryPageSchema.safeParse(props.initialPage);
  const seed = allowed && !accessDenied && props.initialReadIdentity === identity && validatedSeed.success && validatedSeed.data.kind === kind && validatedSeed.data.page === 1 && validatedSeed.data.pageSize === 25 ? validatedSeed.data : undefined;
  const updatedAt = props.initialUpdatedAt ?? 0;
  // SSR may initialize an absent cache, never replace a failed or invalidated observation.
  const query = useQuery({queryKey: [...hrActionInquiryPrefix(kind), identity, "counted-page", effective], enabled: allowed && !accessDenied && admitted,
    initialData: () => effective === initial && qc.getQueryState([...hrActionInquiryPrefix(kind), identity, "counted-page", effective]) === undefined ? seed : undefined, initialDataUpdatedAt: updatedAt || undefined, staleTime: 30000, retry: retryAuthorizedRead, refetchOnWindowFocus: true,
    queryFn: async ({signal}) => {
      if (!admitted || !request.success) throw new ReadError("HR inquiry criteria are invalid or still changing", 400);
      const result = await readJson<{success: true; data: unknown}>("hr-action-inquiries", request.data, signal), parsed = hrActionInquiryPageSchema.safeParse(result.data);
      if (!parsed.success || parsed.data.kind !== kind || parsed.data.page !== request.data.page || parsed.data.pageSize !== request.data.pageSize) throw Error("HR records and total could not be verified");
      return parsed.data;
    }});
  const denied = !allowed || accessDenied || query.error instanceof ReadError && [401, 403].includes(query.error.status);
  if (denied && !accessDenied) setAccessDenied(true);
  useEffect(() => {
    if (accessDenied) {lifetime.current.sequence++; const queryKey = [...hrActionInquiryPrefix(kind), identity]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});}
  }, [accessDenied, qc, kind, identity]);
  const busy = allowed && !denied && safe.success && (query.isFetching || search !== debounced);
  const page = denied || !admitted || query.isError || busy ? undefined : query.data;
  const refetch = (options?: Parameters<typeof query.refetch>[0]) => lifetime.current.active && admitted && !denied ? query.refetch(options) : Promise.resolve();
  useEffect(() => {
    if (page) {
      const maximum = Math.max(0, Math.ceil(page.totalCount / pagination.pageSize) - 1);
      if (pagination.pageIndex > maximum) {void qc.invalidateQueries({queryKey: hrActionInquiryPrefix(kind), refetchType: "none"}); setPagination(p => ({...p, pageIndex: maximum}));}
    }
  }, [page, pagination.pageIndex, pagination.pageSize, qc, kind, setPagination]);
  const serverRead: ERPTableServerRead<HrActionInquiryRowMap[K]> = {
    pagination, sorting, globalFilter: search, columnFilters: filters, totalCount: page?.totalCount ?? null,
    onPaginationChange: update => setPagination(p => {const next = resolve(update, p); return next.pageSize === p.pageSize ? next : {...next, pageIndex: 0};}),
    onSortingChange: update => {setSorting(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    onGlobalFilterChange: update => {setSearch(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    onColumnFiltersChange: update => {setFilters(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    filters: HR_ACTION_INQUIRY_FIELDS[kind].map(f => ({...f, options: f.options ? [...f.options] : undefined})),
  };
  async function loadDetail(recordId: number, employeeId: number) {
    if (kind !== "disciplinary" || denied || busy || !admitted || !page?.rows.some(row => row.id === recordId && row.employee_id === employeeId)) return null;
    const owner = lifetime.current, sequence = ++owner.sequence;
    setDetailError(null); setDetailPending(true);
    try {
      const data = await qc.fetchQuery({queryKey: [...hrActionInquiryPrefix(kind), identity, "detail", recordId, employeeId], staleTime: 0, retry: retryAuthorizedRead,
        queryFn: async ({signal}) => {
          const result = await readJson<{success: true; data: unknown}>("hr-disciplinary-detail", {recordId, employeeId}, signal), parsed = hrDisciplinaryInquiryDetailSchema.safeParse(result.data);
          if (!parsed.success || parsed.data.id !== recordId || parsed.data.employee_id !== employeeId) throw Error("Complete disciplinary detail could not be verified");
          return parsed.data;
        }});
      return owner.active && owner.sequence === sequence ? data : null;
    } catch (error) {
      if (owner.active && owner.sequence === sequence) {
        if (error instanceof ReadError && [401, 403].includes(error.status)) setAccessDenied(true);
        else setDetailError("The complete record could not be loaded. Please retry opening it.");
      }
      return null;
    } finally {if (owner.active && owner.sequence === sequence) setDetailPending(false);}
  }
  return {...query, refetch, data: (page?.rows ?? []) as HrActionInquiryRowMap[K][], serverRead, criteriaIdentity, busy, denied, invalid: !safe.success, detailPending, detailError, loadDetail};
}
