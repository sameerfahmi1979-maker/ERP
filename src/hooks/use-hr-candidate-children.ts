"use client";
import {useRecordReadActive} from "./use-record-read-active";
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {ColumnFiltersState, PaginationState, SortingState, Updater} from "@tanstack/react-table";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {CANDIDATE_CHILD_CONFIG, candidateChildReadIdentity, candidateChildPageCriteriaSchema, candidateChildPageSchema,
  candidateChildDetailResultSchema, type CandidateChildKind, type CandidateChildRowMap, type CandidateChildDetailMap} from "@/lib/reads/hr-candidate-children-schema";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";
import {usePersistentUiState} from "./use-persistent-ui-state";
import {canonicalReadParams} from "./use-server-page";
import {useReadLifetime} from "./use-read-lifetime";

export type CandidateChildReadProps = {authContext: AuthContext; onReadDenied?: () => void};
export const candidateChildPrefix = (kind: CandidateChildKind, candidateId: number) => ["hr", "recruitment", CANDIDATE_CHILD_CONFIG[kind].prefix, candidateId] as const;
const forbidden = (error: unknown) => error instanceof ReadError && [401, 403].includes(error.status);
const resolve = <T,>(update: Updater<T>, previous: T) => typeof update === "function" ? (update as (p: T) => T)(previous) : update;

/** Pages and open-editor detail are separately verified, subject/principal-owned reads.
 * Mutation authorization stays in the existing server actions. */
export function useHrCandidateChildren<K extends CandidateChildKind>(kind: K, candidateId: number, props: CandidateChildReadProps) {
  const sectionActive = useRecordReadActive();
  const qc = useQueryClient(), identity = candidateChildReadIdentity(props.authContext), config = CANDIDATE_CHILD_CONFIG[kind];
  const owner = JSON.stringify([kind, candidateId, identity]), prefix = [...candidateChildPrefix(kind, candidateId), identity];
  const memory = `hr:candidate-child:${owner}`;
  const [pagination, setPagination] = usePersistentUiState<PaginationState>(`${memory}:page`, {pageIndex: 0, pageSize: 25});
  const [sorting, setSorting] = usePersistentUiState<SortingState>(`${memory}:sort`, [{id: config.sort, desc: !config.ascending}]);
  const [search, setSearch] = usePersistentUiState(`${memory}:search`, "");
  const [filters, setFilters] = usePersistentUiState<ColumnFiltersState>(`${memory}:filters`, []);
  const [searchDelay, setSearchDelay] = useState({owner, value: search});
  const [deniedOwner, setDeniedOwner] = useState<string | null>(null);
  const [selected, setSelected] = useState<{candidateId: number; kind: CandidateChildKind; id: number} | null>(null);
  const selectedId = selected?.candidateId === candidateId && selected.kind === kind ? selected.id : null;
  const committed = useRef({owner, active: false, sequence: 0, denied: false});
  const previousPrefix = useRef(prefix), notified = useRef<string | null>(null);
  const allowed = hasPermission(props.authContext, "hr.recruitment.view") || hasPermission(props.authContext, "hr.recruitment.manage");
  const debounced = searchDelay.owner === owner ? searchDelay.value : search;
  useEffect(() => {const timer = setTimeout(() => setSearchDelay({owner, value: search}), 250); return () => clearTimeout(timer);}, [search, owner]);
  const current = candidateChildPageCriteriaSchema.safeParse({operation: "page", kind, candidateId, page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize, search, sorting,
    columnFilters: Object.fromEntries(filters.map(filter => [filter.id, String(filter.value)]))});
  const criteria = candidateChildPageCriteriaSchema.safeParse({operation: "page", kind, candidateId, page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize, search: debounced, sorting,
    columnFilters: Object.fromEntries(filters.map(filter => [filter.id, String(filter.value)]))});
  const admitted = current.success && criteria.success && search === debounced;
  const serialized = criteria.success ? canonicalReadParams(criteria.data) : "null";
  const query = useQuery({queryKey: [...prefix, "page", serialized], enabled: sectionActive && allowed && deniedOwner !== owner && admitted,
    staleTime: 30000, retry: retryAuthorizedRead, queryFn: async ({signal}) => {
      if (!admitted || !criteria.success) throw new ReadError("Candidate child criteria are invalid or still changing", 400);
      const response = await readJson<{success: true; data: unknown}>("hr-candidate-children", criteria.data, signal);
      const data = candidateChildPageSchema.parse(response.data);
      if (data.kind !== kind || data.candidateId !== candidateId || data.page !== criteria.data.page || data.pageSize !== criteria.data.pageSize) throw Error("Candidate child response did not match its request");
      return {success: true as const, data};
    }});
  function detailOptions(id: number | null) {
    return {queryKey: [...prefix, "detail", id], staleTime: 30000, retry: retryAuthorizedRead,
      queryFn: async ({signal}: {signal: AbortSignal}) => {
        const response = await readJson<{success: true; data: unknown}>("hr-candidate-children", {operation: "detail", kind, candidateId, recordId: id}, signal);
        const data = candidateChildDetailResultSchema.parse(response.data);
        if (data.kind !== kind || data.candidateId !== candidateId || data.recordId !== id) throw Error("Candidate child detail did not match its request");
        return {success: true as const, data};
      }};
  }
  // Keep the selected detail observed while an editor is open. A verified salary
  // revocation must reach that editor even when its row is not on the current page.
  const detailQuery = useQuery({...detailOptions(selectedId), enabled: sectionActive && selectedId !== null && allowed && deniedOwner !== owner});
  const detailUnavailable = selectedId !== null && detailQuery.isSuccess && !!detailQuery.data && "availability" in detailQuery.data.data;
  const denied = !allowed || deniedOwner === owner || forbidden(query.error) || selectedId !== null && forbidden(detailQuery.error);
  if (denied && deniedOwner !== owner) setDeniedOwner(owner);
  useLayoutEffect(() => {
    const current = {owner, active: true, sequence: 0, denied: false}; committed.current = current;
    return () => {current.active = false; current.sequence++;};
  }, [owner]);
  useLayoutEffect(() => {committed.current.denied = denied;}, [denied]);
  useEffect(() => {
    if (JSON.stringify(previousPrefix.current) !== JSON.stringify(prefix)) {
      const old = previousPrefix.current; void qc.cancelQueries({queryKey: old}); qc.removeQueries({queryKey: old}); previousPrefix.current = prefix;
    }
    if (denied) {
      void qc.cancelQueries({queryKey: prefix}); qc.removeQueries({queryKey: prefix});
      if (notified.current !== owner) {notified.current = owner; props.onReadDenied?.();}
    }
    // Prefix and callback ownership are represented by this exact read owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, denied, qc, props.onReadDenied]);
  useEffect(() => {
    if (!detailUnavailable) return;
    // An unavailable child must not survive in another cached page. Its previous
    // total is unknown now: retire those projections before a permitted refresh.
    const queryKey = [...candidateChildPrefix(kind, candidateId), identity, "page"];
    for (const cached of qc.getQueryCache().findAll({queryKey})) cached.setState({data: undefined, status: "pending"});
    void qc.invalidateQueries({queryKey});
  }, [detailUnavailable, selectedId, kind, candidateId, identity, qc]);
  const busy = !denied && current.success && (query.isFetching || search !== debounced);
  const page = denied || query.isError || !admitted || busy ? undefined : query.data?.data;
  const criteriaOwner = useReadLifetime(JSON.stringify([owner, search, pagination, sorting, filters]));
  const refetch = (options?: Parameters<typeof query.refetch>[0]) => criteriaOwner.active && committed.current.active && committed.current.owner === owner && !committed.current.denied && admitted && !denied ? query.refetch(options) : Promise.resolve();
  useEffect(() => {
    if (!page) return;
    const maximum = Math.max(0, Math.ceil(page.totalCount / pagination.pageSize) - 1);
    if (pagination.pageIndex > maximum) setPagination(value => ({...value, pageIndex: maximum}));
  }, [page, pagination.pageIndex, pagination.pageSize, setPagination]);
  const serverRead: ERPTableServerRead<CandidateChildRowMap[K]> = {
    pagination, sorting, globalFilter: search, columnFilters: filters, totalCount: page?.totalCount ?? null,
    onPaginationChange: update => setPagination(value => {const next = resolve(update, value); return next.pageSize === value.pageSize ? next : {...next, pageIndex: 0};}),
    onSortingChange: update => {setSorting(value => resolve(update, value)); setPagination(value => ({...value, pageIndex: 0}));},
    onGlobalFilterChange: update => {setSearch(value => resolve(update, value)); setPagination(value => ({...value, pageIndex: 0}));},
    onColumnFiltersChange: update => {setFilters(value => resolve(update, value)); setPagination(value => ({...value, pageIndex: 0}));},
    filters: config.fields.map(field => ({...field, options: field.options ? [...field.options] : undefined})),
  };
  async function loadDetail(id: number) {
    const lifetime = committed.current;
    if (!criteriaOwner.active || !lifetime.active || lifetime.owner !== owner || lifetime.denied || denied || !page?.rows.some(row => row.id === id)) return null;
    const sequence = ++lifetime.sequence;
    setSelected({candidateId, kind, id});
    try {
      const result = await qc.fetchQuery({...detailOptions(id), staleTime: 0});
      return criteriaOwner.active && lifetime.active && !lifetime.denied && lifetime.sequence === sequence && "row" in result.data
        ? result.data.row as CandidateChildDetailMap[K] : null;
    } catch (error) {
      if (lifetime.active && lifetime.sequence === sequence && forbidden(error)) setDeniedOwner(owner);
      return null;
    }
  }
  const closeDetail = useCallback(() => {
    if (!committed.current.active || committed.current.owner !== owner) return;
    committed.current.sequence++; setSelected(null);
  }, [owner]);
  const activeDetail = !denied && selectedId !== null && !detailQuery.isError && !detailQuery.isFetching && detailQuery.data && "row" in detailQuery.data.data
    ? detailQuery.data.data.row as CandidateChildDetailMap[K] : undefined;
  // Invalid local criteria and a debounce are pauses, not successful empty reads.
  // Local validation must not inert the search/filter controls needed to fix it.
  // It still closes mutation admission: a pause is never a successful read.
  const admittedQuery = {...query, refetch, isSuccess: query.isSuccess && !busy && !denied && admitted,
    isError: admitted && query.isError, isFetching: busy};
  const admittedDetail = {...detailQuery, refetch: (options?: Parameters<typeof detailQuery.refetch>[0]) => criteriaOwner.active && committed.current.active && !committed.current.denied && selectedId !== null ? detailQuery.refetch(options) : Promise.resolve(), isSuccess: detailQuery.isSuccess && !detailUnavailable};
  return {query: admittedQuery, detailQuery: admittedDetail, reads: selectedId === null ? [admittedQuery] : [admittedQuery, admittedDetail],
    identity, owner, denied, busy, invalid: !current.success, validationMessage: !current.success ? "Review the filters, search length and page criteria. Invalid criteria were not sent." : null,
    serverRead, rows: (page?.rows ?? []) as CandidateChildRowMap[K][],
    loadDetail, closeDetail, activeDetail, detailUnavailable, detailPending: selectedId !== null && detailQuery.isFetching,
    detailError: selectedId !== null && detailQuery.isError ? "The complete record could not be verified. Retry loading before making changes." : null};
}
