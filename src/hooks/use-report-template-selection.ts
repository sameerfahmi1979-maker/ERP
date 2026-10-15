"use client";
import {useEffect, useId, useLayoutEffect, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {reportTemplateSelectionIdentity, reportTemplateSelectionCriteriaSchema, reportTemplateSelectionPageSchema, type ReportTemplateSelectionRow} from "@/lib/reads/report-template-selection-schema";
import {canonicalReadParams} from "./use-server-page";

export function useReportTemplateSelection(auth: AuthContext, options: {ownerCompanyIds?: number[]; issuableOnly?: boolean; selectedId?: number | null; enabled?: boolean; generation?: string}) {
  const instance = useId(), authorization = canonicalReadParams({identity: reportTemplateSelectionIdentity(auth), companies: [...new Set(options.ownerCompanyIds ?? [])].sort((a, b) => a - b), issuable: options.issuableOnly ?? false, generation: options.generation ?? "", enabled: options.enabled !== false});
  const [lifetime, setLifetime] = useState(() => ({authorization, generation: {}, serial: 0}));
  if (lifetime.authorization !== authorization) setLifetime({authorization, generation: {}, serial: lifetime.serial + 1});
  const generation = lifetime.authorization === authorization ? lifetime.generation : null;
  const owner = JSON.stringify([authorization, instance, lifetime.serial]);
  const qc = useQueryClient(), prefix = ["report-template-selection", owner] as const;
  const [state, setState] = useState({owner, search: "", page: 1}), [settled, setSettled] = useState({owner, search: ""});
  const [deniedOwner, setDeniedOwner] = useState<string | null>(null);
  const search = state.owner === owner ? state.search : "", page = state.owner === owner ? state.page : 1;
  const delayedSearch = settled.owner === owner ? settled.search : "";
  useEffect(() => {const timer = setTimeout(() => setSettled({owner, search}), 250); return () => clearTimeout(timer);}, [owner, search]);
  const input = (value: string) => ({search: value, page, ownerCompanyIds: options.ownerCompanyIds ?? [], issuableOnly: options.issuableOnly ?? false, ...(options.selectedId != null ? {selectedId: options.selectedId} : {})});
  const current = reportTemplateSelectionCriteriaSchema.safeParse(input(search)), delayed = reportTemplateSelectionCriteriaSchema.safeParse(input(delayedSearch));
  const params = canonicalReadParams(delayed.success ? delayed.data : input(delayedSearch));
  const aligned = current.success && delayed.success && canonicalReadParams(current.data) === params;
  const permitted = hasPermission(auth, "reports.view") || hasPermission(auth, "reports.manage");
  const admitted = !!generation && permitted && options.enabled !== false && deniedOwner !== owner && aligned;
  const key = [...prefix, params];
  const live = useRef<{generation: object | null; owner: string; params: string; admitted: boolean; ready: boolean; selected: ReportTemplateSelectionRow | null} | null>(null);
  const query = useQuery({queryKey: key, enabled: admitted, gcTime: 0, staleTime: 0, retry: retryAuthorizedRead, refetchOnWindowFocus: true,
    queryFn: async ({signal}) => {
      if (!current.success || !delayed.success || !admitted) throw new ReadError("Invalid template selection criteria", 400);
      signal.throwIfAborted(); const response = await readJson<{success: true; data: unknown}>("report-template-selection", delayed.data, signal);
      signal.throwIfAborted(); const data = reportTemplateSelectionPageSchema.parse(response.data);
      if (canonicalReadParams(data.criteria) !== params) throw Error("Template selection response does not match");
      return data;
    }});
  const serverDenied = query.error instanceof ReadError && [401, 403].includes(query.error.status);
  if (serverDenied && deniedOwner !== owner) setDeniedOwner(owner);
  const denied = !permitted || deniedOwner === owner || serverDenied, ready = admitted && !denied && query.isSuccess && !query.isFetching && !query.isError;
  const data = ready ? query.data : undefined;
  useLayoutEffect(() => {live.current = {generation, owner, params, admitted: admitted && !denied, ready, selected: data?.selected ?? null}; return () => {if (live.current?.generation === generation) live.current = null;};});
  useLayoutEffect(() => () => {
    if (live.current?.generation === generation) live.current = null;
    const queryKey = ["report-template-selection", owner]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});
  }, [qc, owner, generation]);
  useEffect(() => {
    if (denied || options.enabled === false) {const queryKey = ["report-template-selection", owner]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});}
  }, [denied, options.enabled, qc, owner]);
  const belongs = () => !!generation && live.current?.generation === generation && live.current.owner === owner && live.current.params === params;
  return {owner, rows: data?.rows ?? [], selected: data?.selected ?? null, totalCount: data?.totalCount ?? null, search, page, pageSize: 25,
    busy: permitted && options.enabled !== false && !denied && current.success && (!aligned || query.isPending || query.isFetching), ready, denied, invalid: !current.success,
    error: admitted && query.isError ? query.error : null,
    selectionUnavailable: ready && options.selectedId != null && !data?.selected,
    setSearch: (value: string) => {if (belongs()) setState({owner, search: value, page: 1});},
    move: (value: number) => {if (belongs() && live.current?.ready && Number.isSafeInteger(value) && value >= 1 && value <= 100000) setState({owner, search, page: value});},
    retry: () => {if (belongs() && live.current?.admitted && admitted && qc.getQueryState(key)?.fetchStatus !== "fetching") void query.refetch({cancelRefetch: false});},
    getSelectedNow: () => belongs() && live.current?.ready && live.current.selected?.selectable ? live.current.selected : null,
  };
}
