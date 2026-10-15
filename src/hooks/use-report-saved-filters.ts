"use client";
import {useEffect, useId, useLayoutEffect, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {reportSavedFiltersIdentity, reportSavedFiltersListSchema, reportSavedFiltersPageSchema, reportSavedFilterDetailCriteriaSchema,
  reportSavedFilterDetailResponseSchema, type ReportSavedFilterDetail} from "@/lib/reads/report-saved-filters-schema";
import {canonicalReadParams} from "./use-server-page";

type LoadResult = {success: true; data: ReportSavedFilterDetail} | {success: false; kind: "retired" | "unavailable" | "failed" | "forbidden"};
const isDenied = (error: unknown) => error instanceof ReadError && [401, 403].includes(error.status);

/** Ordinary read-only state. The parent retains create/delete/default mutations
 * and must still guard its own filter draft before applying an awaited detail. */
export function useReportSavedFilters(auth: AuthContext, reportCode: string, options: {enabled?: boolean; generation?: string} = {}) {
  const identity = reportSavedFiltersIdentity(auth), instance = useId();
  const authorization = JSON.stringify([identity, reportCode, options.generation ?? "", options.enabled !== false]);
  const [lifetime, setLifetime] = useState(() => ({authorization, generation: {}, serial: 0}));
  if (lifetime.authorization !== authorization) setLifetime({authorization, generation: {}, serial: lifetime.serial + 1});
  const generation = lifetime.authorization === authorization ? lifetime.generation : null;
  const owner = JSON.stringify([authorization, instance, lifetime.serial]);
  const prefix = ["report-saved-filters", owner] as const, qc = useQueryClient();
  const [state, setState] = useState({owner, search: "", page: 1});
  const [settled, setSettled] = useState({owner, search: ""});
  const [deniedOwner, setDeniedOwner] = useState<string | null>(null);
  const search = state.owner === owner ? state.search : "", page = state.owner === owner ? state.page : 1;
  const delayedSearch = settled.owner === owner ? settled.search : "";
  useEffect(() => {const timer = setTimeout(() => setSettled({owner, search}), 250); return () => clearTimeout(timer);}, [owner, search]);
  const current = reportSavedFiltersListSchema.safeParse({reportCode, search, page});
  const delayed = reportSavedFiltersListSchema.safeParse({reportCode, search: delayedSearch, page});
  const params = canonicalReadParams(delayed.success ? delayed.data : {reportCode, search: delayedSearch, page});
  const aligned = current.success && delayed.success && canonicalReadParams(current.data) === params;
  const permitted = !!generation && options.enabled !== false && hasPermission(auth, "reports.run") && deniedOwner !== owner;
  const key = [...prefix, "page", params];
  const live = useRef<{generation: object | null; owner: string; params: string; authorized: boolean; admitted: boolean; ready: boolean} | null>(null);
  const query = useQuery({queryKey: key, enabled: permitted && aligned, gcTime: 0, staleTime: 30000,
    retry: retryAuthorizedRead, refetchOnWindowFocus: true,
    queryFn: async ({signal}) => {
      if (!current.success || !delayed.success || !aligned || !permitted) throw new ReadError("Invalid saved-filter criteria", 400);
      signal.throwIfAborted();
      const response = await readJson<{success: true; data: unknown}>("report-saved-filters", delayed.data, signal);
      signal.throwIfAborted(); const data = reportSavedFiltersPageSchema.parse(response.data);
      if (canonicalReadParams(data.criteria) !== params) throw Error("Saved-filter response does not match");
      return data;
    }});
  const denied = !hasPermission(auth, "reports.run") || deniedOwner === owner || isDenied(query.error);
  if (isDenied(query.error) && deniedOwner !== owner) setDeniedOwner(owner);
  const admitted = permitted && !denied && aligned;
  const ready = admitted && query.isSuccess && !query.isError && !query.isFetching;
  useLayoutEffect(() => {live.current = {generation, owner, params, authorized: permitted && !denied, admitted, ready}; return () => {if (live.current?.generation === generation) live.current = null;};});
  useLayoutEffect(() => () => {
    if (live.current?.generation === generation) live.current = null;
    const queryKey = ["report-saved-filters", owner]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});
  }, [qc, owner, generation]);
  useEffect(() => {
    if (denied || options.enabled === false) {const queryKey = ["report-saved-filters", owner]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});}
  }, [denied, options.enabled, qc, owner]);
  const belongsToOwner = () => !!generation && live.current?.generation === generation && live.current.owner === owner;
  const belongs = () => belongsToOwner() && live.current?.params === params;
  const data = ready ? query.data : undefined;
  return {
    owner, rows: data?.rows ?? [], totalCount: data?.totalCount ?? null, search, page, pageSize: 25, ready,
    busy: permitted && !denied && current.success && (!aligned || query.isPending || query.isFetching), denied,
    invalid: !current.success, error: admitted && query.isError ? query.error : null,
    setSearch: (value: string) => {if (belongs()) setState({owner, search: value, page: 1});},
    move: (value: number) => {if (belongs() && live.current?.ready && Number.isSafeInteger(value) && value >= 1 && value <= 100000) setState({owner, search, page: value});},
    retry: () => {if (belongs() && live.current?.admitted && admitted && qc.getQueryState(key)?.fetchStatus !== "fetching") void query.refetch({cancelRefetch: false});},
    refresh: async () => {
      // A completed write belongs to this authorization lifetime, not to the
      // search/page that happened to be displayed when it was dispatched.
      if (!belongsToOwner() || !permitted || denied || !live.current?.authorized) return;
      await qc.cancelQueries({queryKey: prefix});
      if (!belongsToOwner() || !live.current?.authorized) return;
      // Saved filters may be edited/deleted/defaulted; do not reuse a warm detail.
      // Invalid/changing criteria disable fetching, not stale-cache retirement.
      qc.removeQueries({queryKey: [...prefix, "detail"]});
      await qc.invalidateQueries({queryKey: prefix, refetchType: "active"});
    },
    loadFilter: async (id: number): Promise<LoadResult> => {
      const criteria = reportSavedFilterDetailCriteriaSchema.safeParse({mode: "detail", reportCode, id});
      if (!criteria.success || !belongs() || !live.current?.ready || !admitted) return {success: false, kind: "retired"};
      try {
        const result = await qc.fetchQuery({queryKey: [...prefix, "detail", id], gcTime: 0, staleTime: 0, retry: retryAuthorizedRead,
          queryFn: async ({signal}) => {
            signal.throwIfAborted();
            const response = await readJson<{success: true; data: unknown}>("report-saved-filters", criteria.data, signal);
            signal.throwIfAborted(); const data = reportSavedFilterDetailResponseSchema.parse(response.data);
            if (canonicalReadParams(data.criteria) !== canonicalReadParams(criteria.data)) throw Error("Saved-filter detail does not match");
            return data.record;
          }});
        if (!belongs() || !live.current?.admitted) return {success: false, kind: "retired"};
        return result ? {success: true, data: result} : {success: false, kind: "unavailable"};
      } catch (error) {
        if (!belongs() || !live.current?.admitted) return {success: false, kind: "retired"};
        if (isDenied(error)) {setDeniedOwner(owner); return {success: false, kind: "forbidden"};}
        return {success: false, kind: "failed"};
      } finally {qc.removeQueries({queryKey: [...prefix, "detail", id], exact: true});}
    },
  };
}
