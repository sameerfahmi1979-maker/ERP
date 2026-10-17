"use client";
import {useReadLifetime} from "./use-read-lifetime";
import {useRecordReadActive} from "./use-record-read-active";
import {useCallback, useEffect, useLayoutEffect, useRef, useState} from "react";
import {useQuery, useQueryClient, type Query, type QueryClient} from "@tanstack/react-query";
import type {ColumnFiltersState, PaginationState, SortingState, Updater} from "@tanstack/react-table";
import type {AuthContext} from "@/lib/rbac/check";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {COMPLIANCE_CONFIG, complianceReadIdentity, compliancePageCriteriaSchema, compliancePageResultSchema, complianceDetailResultSchema,
  DEPENDENT_MEDICAL_FIELDS, type ComplianceKind, type ComplianceRowMap, type ComplianceDetailMap, type ComplianceAccess} from "@/lib/reads/hr-compliance-records-schema";
import type {ERPTableServerRead} from "@/components/erp/table/erp-table-types";
import {usePersistentUiState} from "./use-persistent-ui-state";
import {canonicalReadParams} from "./use-server-page";

export const complianceRecordsPrefix = (employeeId: number, kind?: ComplianceKind) => ["hr", "compliance-records", employeeId, ...(kind ? [kind] : [])] as const;
const forbidden = (error: unknown) => error instanceof ReadError && [401, 403].includes(error.status);
const resolve = <T,>(update: Updater<T>, previous: T) => typeof update === "function" ? (update as (p: T) => T)(previous) : update;
const blankAccess: ComplianceAccess = {canManage: false, medicalView: false, medicalManage: false};
// Internal transport receipts, not server authority or mutation/session epochs.
// A new number survives structural sharing even when two outcomes are identical.
let verificationSequence = 0;
type ReadRequest = {verification: number; generation: number; verified: boolean; query: Query; episode: Query["promise"]};
const readLifetime = (owner: string, token: object, client: QueryClient, active = false) => ({owner, token, client, active, sequence: 0, generation: 0,
  denied: false, criteriaAdmitted: false, criteriaKey: "", selectedId: null as number | null,
  clients: new Set([client]), requests: new WeakMap<Query, ReadRequest>()});

export function useHrComplianceRecords<K extends ComplianceKind>(kind: K, employeeId: number, authContext: AuthContext, onSubjectDenied: () => void) {
  const sectionActive = useRecordReadActive();
  const qc = useQueryClient(), identity = complianceReadIdentity(authContext), owner = JSON.stringify([identity, employeeId, kind]);
  const prefix = [...complianceRecordsPrefix(employeeId, kind), identity], memory = `hr:compliance:${owner}`;
  const [pagination, setPagination] = usePersistentUiState<PaginationState>(`${memory}:page`, {pageIndex: 0, pageSize: 25});
  const [sorting, setSorting] = usePersistentUiState<SortingState>(`${memory}:sort`, []);
  const [search, setSearch] = usePersistentUiState(`${memory}:search`, "");
  const [filters, setFilters] = usePersistentUiState<ColumnFiltersState>(`${memory}:filters`, []);
  const [delay, setDelay] = useState({owner, value: search});
  const [deniedOwner, setDeniedOwner] = useState<string | null>(null), [selected, setSelected] = useState<{owner: string; token: object; id: number; sequence: number; after: number} | null>(null);
  const [lifecycle, setLifecycle] = useState(() => ({owner, token: {}}));
  if (lifecycle.owner !== owner) setLifecycle({owner, token: {}});
  const token = lifecycle.token, selectedId = selected?.owner === owner && selected.token === token ? selected.id : null;
  const committed = useRef(readLifetime(owner, token, qc));
  const notification = useRef<string | null>(null);
  const [verified, setVerified] = useState<{owner: string; access: ComplianceAccess} | null>(null);
  const debounced = delay.owner === owner ? delay.value : search;
  useEffect(() => {const timer = setTimeout(() => setDelay({owner, value: search}), 250); return () => clearTimeout(timer);}, [owner, search]);
  const criteriaFor = (value: string) => compliancePageCriteriaSchema.safeParse({operation: "page", kind, employeeId, page: pagination.pageIndex + 1,
    pageSize: pagination.pageSize, search: value, sorting, columnFilters: Object.fromEntries(filters.map(filter => [filter.id, String(filter.value)]))});
  const immediate = criteriaFor(search), settled = criteriaFor(debounced), criteriaAdmitted = immediate.success && settled.success && search === debounced;
  const criteriaKey = settled.success ? canonicalReadParams(settled.data) : "null";
  const allowed = authContext.isAccountActive && !authContext.profile?.must_change_password;
  const beginRequest = (queryKey: readonly unknown[], client: QueryClient) => {
    const lifetime = committed.current, cached = client.getQueryCache().find({queryKey, exact: true});
    if (!lifetime.active || lifetime.owner !== owner || lifetime.token !== token || lifetime.client !== qc || !cached) throw new DOMException("Retired compliance read", "AbortError");
    // QueryObserver can survive a provider replacement. Bind its actual Query,
    // not a same-key Query in the replacement imperative client's cache.
    lifetime.clients.add(client);
    const request: ReadRequest = {verification: ++verificationSequence, generation: lifetime.generation, verified: false, query: cached, episode: cached.promise};
    lifetime.requests.set(cached, request);
    return {lifetime, request};
  };
  const verifyRequest = ({lifetime, request}: ReturnType<typeof beginRequest>, signal: AbortSignal) => {
    signal.throwIfAborted();
    if (!lifetime.active || committed.current !== lifetime || request.generation !== lifetime.generation || lifetime.requests.get(request.query) !== request)
      throw new DOMException("Retired compliance verification", "AbortError");
  };
  const retirePrivateReads = (current: ReturnType<typeof beginRequest>, rowsLost: boolean) => {
    const {lifetime, request} = current, generation = ++lifetime.generation;
    // Fence continuations first. This successful response belongs to the new
    // privacy generation; an older canceled/reverted fetch never does.
    request.generation = generation;
    const victims = [...lifetime.clients].flatMap(client => client.getQueryCache().findAll({queryKey: prefix})
      .map(cached => ({client, cached, promise: cached.promise, request: lifetime.requests.get(cached)})));
    for (const victim of victims) {
      if (!lifetime.active || committed.current !== lifetime || lifetime.generation !== generation) return;
      const {cached} = victim;
      // Cache listeners are synchronous and can start another fetch on the same
      // Query. Never scrub/cancel that replacement or a replacement owner.
      if (victim.client.getQueryCache().get(cached.queryHash) !== cached || cached.promise !== victim.promise || lifetime.requests.get(cached) !== victim.request) continue;
      const envelope = cached.state.data as {success: true; data: unknown; verification: number} | undefined;
      const data = envelope?.data;
      let cleared = false;
      if (rowsLost) {
        if (!(data && typeof data === "object" && "availability" in data)) {
          // Rebase Query's cancellation snapshot as well as its visible state.
          // setQueryData(undefined) would be a no-op; Query.setData is explicit.
          cached.setData(undefined, {manual: true}); cached.setState({status: "pending"}); cleared = true;
        }
      } else if (data && typeof data === "object" && "access" in data) {
        if (cached.queryKey[5] === "detail") {
          const parsed = complianceDetailResultSchema.safeParse(data);
          if (parsed.success && "row" in parsed.data) cached.setData({...envelope, data: {...parsed.data,
            access: {...parsed.data.access, medicalView: false, medicalManage: false},
            row: {...parsed.data.row, ...Object.fromEntries(DEPENDENT_MEDICAL_FIELDS.map(key => [key, null]))}}}, {manual: true});
        } else {
          const parsed = compliancePageResultSchema.safeParse(data);
          if (parsed.success && "access" in parsed.data) cached.setData({...envelope, data: {...parsed.data,
            access: {...parsed.data.access, medicalView: false, medicalManage: false}}}, {manual: true});
        }
      }
      if (!lifetime.active || committed.current !== lifetime || lifetime.generation !== generation) return;
      if (cached.promise !== victim.promise || lifetime.requests.get(cached) !== victim.request) continue;
      if (cached !== request.query && cached.state.fetchStatus !== "idle") void cached.cancel({revert: true});
      if (cleared && cached.promise === victim.promise && lifetime.requests.get(cached) === victim.request) cached.setState({status: "pending"});
    }
  };
  const query = useQuery({queryKey: [...prefix, "page", criteriaKey], enabled: sectionActive && allowed && deniedOwner !== owner && criteriaAdmitted,
    staleTime: 30000, retry: retryAuthorizedRead, queryFn: async ({signal, client}) => {
      if (!criteriaAdmitted || !settled.success) throw new ReadError("Invalid or changing compliance criteria", 400);
      const current = beginRequest([...prefix, "page", criteriaKey], client);
      const response = await readJson<{success: true; data: unknown}>("hr-compliance-records", settled.data, signal);
      verifyRequest(current, signal);
      const data = compliancePageResultSchema.parse(response.data);
      if (data.operation !== "page" || data.kind !== kind || data.employeeId !== employeeId || "rows" in data && (data.page !== settled.data.page || data.pageSize !== settled.data.pageSize)) throw Error("Compliance page mismatch");
      if ("availability" in data || kind === "dependents" && !data.access.medicalView) retirePrivateReads(current, "availability" in data);
      verifyRequest(current, signal); current.request.verified = true;
      return {success: true as const, data, verification: current.request.verification};
    }});
  const readDetail = async ({signal, client, queryKey}: {signal: AbortSignal; client: QueryClient; queryKey: readonly unknown[]}) => {
      const id = queryKey[6];
      if (typeof id !== "number" || !Number.isSafeInteger(id) || id <= 0) throw new ReadError("Invalid compliance detail", 400);
      const current = beginRequest([...prefix, "detail", id], client);
      const response = await readJson<{success: true; data: unknown}>("hr-compliance-records", {operation: "detail", kind, employeeId, recordId: id}, signal);
      verifyRequest(current, signal);
      const data = complianceDetailResultSchema.parse(response.data);
      if (data.operation !== "detail" || data.kind !== kind || data.employeeId !== employeeId || "recordId" in data && data.recordId !== id) throw Error("Compliance detail mismatch");
      if ("availability" in data || kind === "dependents" && !data.access.medicalView) retirePrivateReads(current, "availability" in data);
      verifyRequest(current, signal); current.request.verified = true;
      if ("availability" in data && data.availability === "unavailable")
        for (const client of current.lifetime.clients) void client.invalidateQueries({queryKey: [...prefix, "page"]});
      return {success: true as const, data, verification: current.request.verification};
    };
  const detailOptions = (id: number | null) => ({queryKey: [...prefix, "detail", id], staleTime: 30000, retry: retryAuthorizedRead});
  const detailQuery = useQuery({...detailOptions(selectedId), queryFn: readDetail, enabled: sectionActive && allowed && deniedOwner !== owner && selectedId !== null});
  const denied = !allowed || deniedOwner === owner || forbidden(query.error) || selectedId !== null && forbidden(detailQuery.error);
  if (denied && deniedOwner !== owner) setDeniedOwner(owner);
  const pageData = query.data?.data, detailData = selectedId === null ? undefined : detailQuery.data?.data;
  const restricted = pageData && "availability" in pageData && pageData.availability === "restricted" || detailData && "availability" in detailData && detailData.availability === "restricted" || false;
  const freshDetail = selectedId !== null && !!selected && (detailQuery.data?.verification ?? 0) > selected.after;
  const detailUnavailable = freshDetail && !detailQuery.isError && !!detailData && "availability" in detailData && detailData.availability === "unavailable";
  useLayoutEffect(() => {
    const queryKey = [...complianceRecordsPrefix(employeeId, kind), identity];
    const lifetime = readLifetime(owner, token, qc, true); committed.current = lifetime;
    return () => {lifetime.active = false; lifetime.sequence++; for (const client of lifetime.clients) {void client.cancelQueries({queryKey}); client.removeQueries({queryKey});}};
  }, [owner, token, qc, employeeId, kind, identity]);
  useLayoutEffect(() => {committed.current.denied = denied || restricted; committed.current.criteriaAdmitted = criteriaAdmitted; committed.current.criteriaKey = criteriaKey; committed.current.selectedId = selectedId;}, [owner, token, qc, employeeId, kind, identity, denied, restricted, criteriaAdmitted, criteriaKey, selectedId]);
  useLayoutEffect(() => {
    if (denied) {
      const queryKey = [...complianceRecordsPrefix(employeeId, kind), identity];
      for (const client of committed.current.clients) {void client.cancelQueries({queryKey}); client.removeQueries({queryKey});}
      if (notification.current !== owner) {notification.current = owner; onSubjectDenied();}
    }
  }, [owner, denied, qc, onSubjectDenied, employeeId, kind, identity]);
  const verifiedAccess = !query.isFetching && !query.isError && pageData && "access" in pageData ? pageData.access : undefined;
  const detailAccess = freshDetail && !detailQuery.isFetching && !detailQuery.isError && detailData && "access" in detailData ? detailData.access : undefined;
  const available = [verifiedAccess, detailAccess].filter((a): a is ComplianceAccess => !!a);
  const nextAccess = available.length ? {canManage: available.every(a => a.canManage), medicalView: available.every(a => a.medicalView), medicalManage: available.every(a => a.medicalManage)} : undefined;
  if (nextAccess && (verified?.owner !== owner || JSON.stringify(verified.access) !== JSON.stringify(nextAccess))) setVerified({owner, access: nextAccess});
  // A successful page revocation must redact previously fetched details too.
  // A 503 is not revocation and never erases a legitimate medical draft.
  const access = restricted || denied ? blankAccess : verified?.owner === owner ? verified.access : blankAccess;
  const busy = !denied && immediate.success && (query.isFetching || search !== debounced);
  const page = !denied && !restricted && !busy && !query.isError && criteriaAdmitted && pageData && "rows" in pageData ? pageData : undefined;
  const activity = useReadLifetime(JSON.stringify([owner, sectionActive]));
  const isCurrent = useCallback(() => activity.active && committed.current.token === token && committed.current.client === qc && committed.current.active && !committed.current.denied, [token, qc, activity]);
  const refetch = (options?: Parameters<typeof query.refetch>[0]) => isCurrent() && committed.current.criteriaAdmitted && committed.current.criteriaKey === criteriaKey ? query.refetch(options) : Promise.resolve();
  const refetchDetail = (options?: Parameters<typeof detailQuery.refetch>[0]) => isCurrent() && selectedId !== null && committed.current.selectedId === selectedId && committed.current.sequence === selected?.sequence ? detailQuery.refetch(options) : Promise.resolve();
  useEffect(() => {
    if (!page) return;
    const maximum = Math.max(0, Math.ceil(page.totalCount / pagination.pageSize) - 1);
    if (pagination.pageIndex > maximum) setPagination(p => ({...p, pageIndex: maximum}));
  }, [page, pagination.pageIndex, pagination.pageSize, setPagination]);
  const serverRead: ERPTableServerRead<ComplianceRowMap[K]> = {
    pagination, sorting, globalFilter: search, columnFilters: filters, totalCount: page?.totalCount ?? null,
    onPaginationChange: update => {if (isCurrent()) setPagination(p => {const next = resolve(update, p); return next.pageSize === p.pageSize ? next : {...next, pageIndex: 0};});},
    onSortingChange: update => {if (!isCurrent()) return; setSorting(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    onGlobalFilterChange: update => {if (!isCurrent()) return; setSearch(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    onColumnFiltersChange: update => {if (!isCurrent()) return; setFilters(p => resolve(update, p)); setPagination(p => ({...p, pageIndex: 0}));},
    filters: COMPLIANCE_CONFIG[kind].fields.map(f => ({...f})),
  };
  async function loadDetail(id: number) {
    const lifetime = committed.current;
    if (!isCurrent() || !lifetime.criteriaAdmitted) return null;
    const sequence = ++lifetime.sequence, after = verificationSequence; setSelected({owner, token, id, sequence, after});
    try {
      const pending = qc.fetchQuery({...detailOptions(id), queryFn: readDetail, staleTime: 0});
      const cached = qc.getQueryCache().find({queryKey: [...prefix, "detail", id], exact: true});
      const started = cached && lifetime.requests.get(cached), episode = started?.episode;
      const result = await pending, request = cached && lifetime.requests.get(cached);
      // Automatic retries replace the attempt receipt, not the retryer episode.
      // Silent cancellation may instead piggyback on an independent new fetch;
      // that replacement must never lend its receipt to this original opening.
      return committed.current === lifetime && lifetime.active && !lifetime.denied && lifetime.sequence === sequence
        && cached && started && episode && cached.promise === episode && qc.getQueryCache().get(cached.queryHash) === cached
        && started.verification > after && request?.verified && request.episode === episode && request.generation === lifetime.generation
        && result.verification === request.verification && result.verification > after
        && result.data && "row" in result.data && result.data.access.canManage
        ? result.data.row as ComplianceDetailMap[K] : null;
    } catch (error) {
      if (lifetime.active && lifetime.sequence === sequence && forbidden(error)) setDeniedOwner(owner);
      return null;
    }
  }
  const closeDetail = useCallback(() => {
    if (committed.current.token === token && committed.current.client === qc && committed.current.active && (selected ? selected.token === token && selected.sequence === committed.current.sequence : committed.current.selectedId === null)) {
      committed.current.sequence++; setSelected(null);
    }
  }, [token, qc, selected, setSelected]);
  // A callback from an earlier opening must not regain authority when the same
  // collection (or even the same record) is ready again after close/retirement.
  const isDetailCurrent = (id: number) => isCurrent()
    && selected?.owner === owner && selected.token === token && selected.id === id && committed.current.sequence === selected.sequence;
  const refresh = useCallback(async () => {
    if (!isCurrent()) return;
    const queryKey = [...complianceRecordsPrefix(employeeId, kind), identity];
    await qc.cancelQueries({queryKey}); if (isCurrent()) await qc.invalidateQueries({queryKey});
  }, [qc, employeeId, kind, identity, isCurrent]);
  const admittedQuery = {...query, refetch, isSuccess: query.isSuccess && !busy && !denied && !restricted && criteriaAdmitted,
    isError: criteriaAdmitted && query.isError, isFetching: busy};
  const admittedDetail = {...detailQuery, refetch: refetchDetail, isSuccess: freshDetail && detailQuery.isSuccess && !detailQuery.isFetching && !detailUnavailable && !restricted};
  return {query: admittedQuery, detailQuery: admittedDetail, reads: selectedId === null ? [admittedQuery] : [admittedQuery, admittedDetail], identity, owner, denied, restricted, access,
    medicalViewRetired: verified?.owner === owner && !verified.access.medicalView,
    busy, invalid: !immediate.success, validationMessage: !immediate.success ? "Review the filters, search length and page criteria. Invalid criteria were not sent." : null,
    serverRead, rows: (page?.rows ?? []) as ComplianceRowMap[K][], loadDetail, closeDetail, isDetailCurrent, refresh,
    detailUnavailable, detailPending: selectedId !== null && detailQuery.isFetching,
    detailError: selectedId !== null && detailQuery.isError ? "The complete record could not be verified. Retry before making changes." : null};
}
