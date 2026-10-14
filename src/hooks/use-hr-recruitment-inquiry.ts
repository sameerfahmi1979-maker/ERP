"use client";
import {useEffect, useLayoutEffect, useRef, useState} from "react";
import {useReadLifetime} from "./use-read-lifetime";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {ColumnFiltersState, PaginationState, SortingState, Updater} from "@tanstack/react-table";
import {usePersistentUiState} from "./use-persistent-ui-state";
import {canonicalReadParams} from "./use-server-page";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {hasPermission} from "@/lib/rbac/scope";
import type {AuthContext} from "@/lib/rbac/check";
import {RECRUITMENT_INQUIRY_CONFIG, recruitmentInquiryCriteriaSchema, recruitmentInquiryPageSchema, recruitmentReadIdentity, recruitmentRequisitionDetailSchema, type RecruitmentInquiryKind, type RecruitmentInquiryPage, type RecruitmentInquiryRowMap} from "@/lib/reads/hr-recruitment-inquiries-schema";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";

export type RecruitmentInquiryProps = {authContext: AuthContext; initialPage?: RecruitmentInquiryPage; initialUpdatedAt?: number; initialReadIdentity?: string};
export const recruitmentInquiryPrefix = (kind: RecruitmentInquiryKind) => ["hr", "recruitment", RECRUITMENT_INQUIRY_CONFIG[kind].prefix] as const;
const resolve = <T,>(update: Updater<T>, previous: T) => typeof update === "function" ? (update as (p: T) => T)(previous) : update;
export function useRecruitmentInquiryIdentity(kind: RecruitmentInquiryKind, ctx: AuthContext) {
  const identity = recruitmentReadIdentity(ctx), qc = useQueryClient(), previous = useRef({kind, identity});
  useEffect(() => {
    if (previous.current.identity !== identity || previous.current.kind !== kind) {
      const queryKey = [...recruitmentInquiryPrefix(previous.current.kind), previous.current.identity];
      void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey}); previous.current = {kind, identity};
    }
  }, [kind, identity, qc]);
  return identity;
}

export function useRecruitmentInquiry<K extends RecruitmentInquiryKind>(kind: K, props: RecruitmentInquiryProps, identity: string) {
  const qc = useQueryClient(), config = RECRUITMENT_INQUIRY_CONFIG[kind], key = `hr:recruitment-inquiry:${kind}:${identity}`;
  const [pagination, setPagination] = usePersistentUiState<PaginationState>(`${key}:page`, {pageIndex: 0, pageSize: 25});
  const [sorting, setSorting] = usePersistentUiState<SortingState>(`${key}:sort`, [{id: config.sort, desc: kind !== "onboarding"}]);
  const [search, setSearch] = usePersistentUiState(`${key}:search`, ""), [filters, setFilters] = usePersistentUiState<ColumnFiltersState>(`${key}:filters`, []);
  const [debounced, setDebounced] = useState(search), [accessDenied, setAccessDenied] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null), [detailPending, setDetailPending] = useState(false);
  const lifetime = useRef({active: true, sequence: 0});
  useEffect(() => {const timer = setTimeout(() => setDebounced(search), 250); return () => clearTimeout(timer);}, [search]);
  useEffect(() => {const owner = lifetime.current; owner.active = true; return () => {owner.active = false; owner.sequence++;};}, []);
  const allowed = hasPermission(props.authContext, "hr.recruitment.view") || hasPermission(props.authContext, "hr.recruitment.manage");
  const safe = recruitmentInquiryCriteriaSchema.safeParse({kind, page: pagination.pageIndex + 1, pageSize: pagination.pageSize, search, sorting, columnFilters: Object.fromEntries(filters.map(f => [f.id, String(f.value)]))});
  const request = recruitmentInquiryCriteriaSchema.safeParse({kind, page: pagination.pageIndex + 1, pageSize: pagination.pageSize, search: debounced, sorting, columnFilters: Object.fromEntries(filters.map(f => [f.id, String(f.value)]))});
  const admitted = safe.success && request.success && search === debounced;
  const effective = request.success ? canonicalReadParams(request.data) : "null";
  const criteriaOwner = useReadLifetime(JSON.stringify([kind, identity, effective, search]));
  const [detailOwner, setDetailOwner] = useState(criteriaOwner);
  if (detailOwner !== criteriaOwner) {setDetailOwner(criteriaOwner); setDetailPending(false); setDetailError(null);}
  useLayoutEffect(() => {lifetime.current.sequence++;}, [criteriaOwner]);
  const initial = canonicalReadParams(recruitmentInquiryCriteriaSchema.parse({kind, sorting: [{id: config.sort, desc: kind !== "onboarding"}]})), validatedSeed = recruitmentInquiryPageSchema.safeParse(props.initialPage);
  const seed = allowed && !accessDenied && props.initialReadIdentity === identity && validatedSeed.success && validatedSeed.data.kind === kind && validatedSeed.data.page === 1 && validatedSeed.data.pageSize === 25 ? validatedSeed.data : undefined;
  const updatedAt = props.initialUpdatedAt ?? 0;
  // Initial SSR observation only; never overwrite a failed/invalidated cache.
  const query = useQuery({queryKey: [...recruitmentInquiryPrefix(kind), identity, "counted-page", effective], enabled: allowed && !accessDenied && admitted,
    initialData: () => effective === initial && qc.getQueryState([...recruitmentInquiryPrefix(kind), identity, "counted-page", effective]) === undefined ? seed : undefined, initialDataUpdatedAt: updatedAt || undefined, staleTime: 30000, retry: retryAuthorizedRead, refetchOnWindowFocus: true,
    queryFn: async ({signal}) => {
      if (!admitted || !request.success) throw new ReadError("Recruitment criteria are invalid or still changing", 400);
      const result = await readJson<{success: true; data: unknown}>("hr-recruitment-inquiries", request.data, signal), parsed = recruitmentInquiryPageSchema.safeParse(result.data);
      if (!parsed.success || parsed.data.kind !== kind || parsed.data.page !== request.data.page || parsed.data.pageSize !== request.data.pageSize) throw Error("Recruitment records and total could not be verified");
      return parsed.data;
    }});
  const denied = !allowed || accessDenied || query.error instanceof ReadError && [401, 403].includes(query.error.status);
  if (denied && !accessDenied) setAccessDenied(true);
  useEffect(() => {
    if (accessDenied) {lifetime.current.sequence++; const queryKey = [...recruitmentInquiryPrefix(kind), identity]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});}
  }, [accessDenied, qc, kind, identity]);
  const busy = allowed && !denied && safe.success && (query.isFetching || search !== debounced);
  const page = denied || !admitted || query.isError || busy ? undefined : query.data;
  const refetch = (options?: Parameters<typeof query.refetch>[0]) => lifetime.current.active && criteriaOwner.active && admitted && !denied ? query.refetch(options) : Promise.resolve();
  useEffect(() => {
    if (page) {
      const maximum = Math.max(0, Math.ceil(page.totalCount / pagination.pageSize) - 1);
      if (pagination.pageIndex > maximum) {void qc.invalidateQueries({queryKey: recruitmentInquiryPrefix(kind), refetchType: "none"}); setPagination(p => ({...p, pageIndex: maximum}));}
    }
  }, [page, pagination.pageIndex, pagination.pageSize, qc, kind, setPagination]);
  const serverRead: ERPTableServerRead<RecruitmentInquiryRowMap[K]> = {
    pagination, sorting, globalFilter: search, columnFilters: filters, totalCount: page?.totalCount ?? null,
    onPaginationChange: update => setPagination(p => {const next = resolve(update, p); return next.pageSize === p.pageSize ? next : {...next, pageIndex: 0};}),
    onSortingChange: update => {setSorting(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    onGlobalFilterChange: update => {setSearch(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    onColumnFiltersChange: update => {setFilters(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    filters: config.fields.map(f => ({...f, options: f.options ? [...f.options] : undefined})),
  };
  async function loadRequisition(recordId: number) {
    if (kind !== "requisitions" || denied || !criteriaOwner.active || !page?.rows.some(row => row.id === recordId)) return null;
    const owner = lifetime.current, sequence = ++owner.sequence;
    setDetailError(null); setDetailPending(true);
    try {
      const data = await qc.fetchQuery({queryKey: [...recruitmentInquiryPrefix(kind), identity, "detail", recordId], staleTime: 0, retry: retryAuthorizedRead,
        queryFn: async ({signal}) => {
          const result = await readJson<{success: true; data: unknown}>("hr-recruitment-requisition-detail", {recordId}, signal), parsed = recruitmentRequisitionDetailSchema.safeParse(result.data);
          if (!parsed.success || parsed.data.id !== recordId) throw Error("Complete requisition could not be verified");
          return parsed.data;
        }});
      return owner.active && owner.sequence === sequence ? data : null;
    } catch (error) {
      if (owner.active && owner.sequence === sequence) {
        if (error instanceof ReadError && [401, 403].includes(error.status)) setAccessDenied(true);
        else setDetailError("The complete requisition could not be loaded. Please retry opening it.");
      }
      return null;
    } finally {if (owner.active && owner.sequence === sequence) setDetailPending(false);}
  }
  return {...query, refetch, data: (page?.rows ?? []) as RecruitmentInquiryRowMap[K][], serverRead, busy, denied, invalid: !safe.success, detailPending, detailError, loadRequisition};
}
