"use client";
import {useEffect, useId, useLayoutEffect, useRef, useState} from "react";
import {useQueries, useQueryClient} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {canonicalReadParams} from "./use-server-page";
import {REPORT_CRITERION_DEPENDENCIES, canReadReportCriterion, reportCriteriaIdentity, reportCriteriaSchema, reportCriteriaResponseSchema,
  type ReportCriterionKey, type ReportCriterionOption, type ReportCriteriaPage} from "@/lib/reads/report-criteria-schema";

type Settings = Partial<Record<ReportCriterionKey, {search: string; page: number}>>;
export type ReportCriterionControl = {
  owner: string; value: number | null; options: ReportCriterionOption[]; busy: boolean; denied: boolean; invalid: boolean;
  error: boolean; selectionUnavailable: boolean; ready: boolean; page: number; totalCount: number | null;
  search: (value: string) => void; move: (page: number) => void; retry: () => void; select: (value: string | number | null) => void;
};
export type ReportCriteriaControl = {fields: Partial<Record<ReportCriterionKey, ReportCriterionControl>>; ownerDenied: boolean; canRun: boolean; canRunNow: () => boolean};
const dependencyFields = {ownerCompanyId: "owner_company_id", branchId: "branch_id", departmentId: "department_id"} as const;

/** Lookup search is request-bound and independent of the report's business
 * filters. A failed blank optional lookup does not invent a mandatory filter;
 * a nonblank choice must be verified before a new report can be dispatched. */
export function useReportCriteria(auth: AuthContext, reportCode: string, keys: readonly ReportCriterionKey[], filters: Record<string, string>, onChange: (key: string, value: string) => void): ReportCriteriaControl {
  const identity = reportCriteriaIdentity(auth), prefix = ["reports", "criteria", identity, reportCode] as const;
  const authorization = JSON.stringify(prefix), instance = useId();
  const [lifetime, setLifetime] = useState(() => ({authorization, generation: {}, serial: 0}));
  if (lifetime.authorization !== authorization) setLifetime({authorization, generation: {}, serial: lifetime.serial + 1});
  const generation = lifetime.authorization === authorization ? lifetime.generation : null;
  const owner = JSON.stringify([authorization, instance, lifetime.serial]);
  const [state, setState] = useState<{owner: string; settings: Settings}>({owner, settings: {}});
  const [settled, setSettled] = useState<{owner: string; settings: Settings}>({owner, settings: {}});
  const [denials, setDenials] = useState<{owner: string; keys: ReportCriterionKey[]}>({owner, keys: []});
  const [deniedOwner, setDeniedOwner] = useState<string | null>(null);
  const settings = state.owner === owner ? state.settings : {}, settledSettings = settled.owner === owner ? settled.settings : {};
  const qc = useQueryClient(), previous = useRef<readonly unknown[][]>([]);
  const formToken = canonicalReadParams(filters);
  // Immediate input changes retire callbacks even if the same values return
  // before debounce settles. Keep the combobox owner stable while typing.
  const interactionToken = canonicalReadParams({owner, filters, settings, keys});
  const [interaction, setInteraction] = useState(() => ({token: interactionToken, generation: {}}));
  if (interaction.token !== interactionToken) setInteraction({token: interactionToken, generation: {}});
  const interactionGeneration = interaction.token === interactionToken ? interaction.generation : null;
  const committed = useRef<{owner: string; generation: object | null; interactionGeneration: object | null; ownerDenied: boolean; formToken: string; canRun: boolean;
    fields: Partial<Record<ReportCriterionKey, {request: string; ready: boolean; canRead: boolean; options: ReportCriterionOption[]}>>} | null>(null);
  const settingsToken = canonicalReadParams({owner, settings});
  useEffect(() => {
    const timer = setTimeout(() => setSettled({owner, settings}), 250); return () => clearTimeout(timer);
    // Serialized settings contain every search/page edit without unstable refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settingsToken]);
  const requests = keys.map(key => {
    const input = (search: string) => ({reportCode, key, search, page: settings[key]?.page ?? 1, pageSize: 25,
      ...(filters[key] ? {selectedId: Number(filters[key])} : {}),
      ...Object.fromEntries(REPORT_CRITERION_DEPENDENCIES[key].flatMap(dependency => {
        const field = dependencyFields[dependency]; return keys.includes(field) && filters[field] ? [[dependency, Number(filters[field])]] : [];
      }))});
    const current = reportCriteriaSchema.safeParse(input(settings[key]?.search ?? ""));
    const delayed = reportCriteriaSchema.safeParse(input(settledSettings[key]?.search ?? ""));
    const serialized = canonicalReadParams(delayed.success ? delayed.data : input(settledSettings[key]?.search ?? ""));
    const aligned = current.success && delayed.success && canonicalReadParams(current.data) === serialized;
    const denied = !hasPermission(auth, "reports.run") || deniedOwner === owner;
    const retiredRestriction = denials.owner === owner && denials.keys.includes(key);
    const restricted = !canReadReportCriterion(auth, key) || retiredRestriction;
    // The criterion and serialized params retain their shared invalidation slots.
    return {key, current, delayed, serialized, aligned, denied, restricted, retiredRestriction, queryKey: [...prefix, key, serialized, owner]};
  });
  const ownerPermitted = hasPermission(auth, "reports.run") && deniedOwner !== owner;
  const queries = useQueries({queries: (ownerPermitted ? requests : []).map(request => ({queryKey: request.queryKey, gcTime: 0, staleTime: 30000, retry: retryAuthorizedRead,
    refetchOnWindowFocus: true, enabled: !!generation && !!interactionGeneration && !request.denied && !request.retiredRestriction && request.aligned,
    queryFn: async ({signal}: {signal: AbortSignal}) => {
      if (!generation || !interactionGeneration || !request.current.success || !request.delayed.success || !request.aligned || request.denied || request.retiredRestriction) throw new ReadError("Invalid report criteria", 400);
      signal.throwIfAborted();
      const response = await readJson<{success: true; data: unknown}>("report-criteria", request.delayed.data, signal);
      signal.throwIfAborted(); const page = reportCriteriaResponseSchema.parse(response.data);
      if (canonicalReadParams(page.criteria) !== request.serialized) throw Error("Criteria response did not match its request");
      return page;
    },
  }))});
  const queryToken = JSON.stringify(requests.map(request => request.queryKey));
  useLayoutEffect(() => {
    const current: unknown[][] = JSON.parse(queryToken);
    const set = new Set(current.map(key => JSON.stringify(key)));
    for (const old of previous.current) if (!set.has(JSON.stringify(old))) {
      void qc.cancelQueries({queryKey: old, exact: true}); qc.removeQueries({queryKey: old, exact: true});
    }
    previous.current = current;
  }, [qc, queryToken]);
  const serverDenied = requests.filter((_request, index) => queries[index]?.error instanceof ReadError && [401, 403].includes((queries[index].error as ReadError).status)).map(request => request.key);
  const terminal = deniedOwner === owner || serverDenied.length > 0;
  if (serverDenied.length > 0 && deniedOwner !== owner) setDeniedOwner(owner);
  const denialToken = JSON.stringify(serverDenied);
  useEffect(() => {
    if (!terminal) return;
    const owned = {queryKey: prefix, predicate: (query: {queryKey: readonly unknown[]}) => query.queryKey[6] === owner};
    void qc.cancelQueries(owned); qc.removeQueries(owned);
    // Retire this owner only; sibling observers must stay tracked for invalidation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, denialToken, terminal, qc]);

  const fields: ReportCriteriaControl["fields"] = {}, admitted: NonNullable<typeof committed.current>["fields"] = {};
  const belongs = () => !!generation && !!interactionGeneration && committed.current?.generation === generation
    && committed.current.interactionGeneration === interactionGeneration && committed.current.owner === owner && !committed.current.ownerDenied;
  let selectionsVerified = true;
  for (const [index, request] of requests.entries()) {
    const query = queries[index], restricted = request.restricted || !!query?.data && "availability" in query.data;
    const denied = request.denied || terminal || restricted;
    const ready = !!query && !denied && request.aligned && query.isSuccess && !query.isFetching && !query.isError;
    const data: ReportCriteriaPage | undefined = ready && query?.data && !("availability" in query.data) ? query.data : undefined;
    const options = data ? [...data.rows, ...(data.selected && !data.rows.some(row => row.value === data.selected!.value) ? [data.selected] : [])] : [];
    const selectionUnavailable = !!filters[request.key] && ready && !data?.selected;
    if (filters[request.key] && (!ready || !data?.selected)) selectionsVerified = false;
    admitted[request.key] = {request: request.serialized, ready, canRead: !denied && request.aligned, options};
    const update = (change: Partial<{search: string; page: number}>) => {
      if (!belongs()) return;
      setState(previous => ({owner, settings: {...(previous.owner === owner ? previous.settings : {}), [request.key]: {...(previous.owner === owner ? previous.settings[request.key] : undefined) ?? {search: "", page: 1}, ...change}}}));
    };
    fields[request.key] = {
      owner: `${owner}:${request.key}`, value: data?.selected?.value ?? null, options, ready, denied, invalid: !request.current.success,
      busy: !!query && !denied && request.current.success && (!request.aligned || query.isPending || query.isFetching), error: !!query && !denied && query.isError,
      selectionUnavailable, page: settings[request.key]?.page ?? 1, totalCount: data?.totalCount ?? null,
      search: value => update({search: value, page: 1}),
      move: page => {if (Number.isSafeInteger(page) && page >= 1 && page <= 100000 && committed.current?.fields[request.key]?.request === request.serialized && committed.current.fields[request.key]?.ready) update({page});},
      retry: () => {
        if (!belongs() || committed.current?.fields[request.key]?.request !== request.serialized || !committed.current.fields[request.key]?.canRead || !request.current.success || !request.delayed.success || !request.aligned || denied) return;
        if (qc.getQueryState(request.queryKey)?.fetchStatus !== "fetching") void query?.refetch({cancelRefetch: false});
      },
      select: value => {
        if (!belongs() || committed.current?.fields[request.key]?.request !== request.serialized) return;
        if (value === null) {onChange(request.key, ""); update({search: "", page: 1}); return;}
        const current = committed.current.fields[request.key];
        if (!current?.ready || current.request !== request.serialized || !current.options.some(option => option.value === Number(value))) return;
        onChange(request.key, String(value)); update({search: "", page: 1});
      },
    };
  }
  const restrictedKeys = requests.filter((_request, index) => !!queries[index]?.data && "availability" in queries[index].data!).map(request => request.key);
  if (restrictedKeys.length && (denials.owner !== owner || restrictedKeys.some(key => !denials.keys.includes(key))))
    setDenials({owner, keys: [...new Set([...(denials.owner === owner ? denials.keys : []), ...restrictedKeys])]});
  const restrictedToken = JSON.stringify(restrictedKeys);
  useEffect(() => {
    const keys: ReportCriterionKey[] = JSON.parse(restrictedToken); if (!keys.length) return;
    // Retire this owner's warm payloads for a verified restricted entity.
    for (const key of keys) {
      const owned = {queryKey: [...prefix, key], predicate: (query: {queryKey: readonly unknown[]}) => query.queryKey[6] === owner};
      void qc.cancelQueries(owned); qc.removeQueries(owned);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, restrictedToken, qc]);
  const ownerDenied = terminal || !hasPermission(auth, "reports.run");
  const canRun = !!generation && !!interactionGeneration && !ownerDenied && selectionsVerified;
  useLayoutEffect(() => {
    const current = {owner, generation, interactionGeneration, ownerDenied, formToken, fields: admitted, canRun};
    committed.current = current;
    return () => {if (committed.current === current) committed.current = null;};
  });
  useLayoutEffect(() => () => {
    // Exact instance-owned keys prevent one workspace closing another's reads.
    for (const queryKey of previous.current) {void qc.cancelQueries({queryKey, exact: true}); qc.removeQueries({queryKey, exact: true});}
    previous.current = [];
  }, [qc]);
  return {fields, ownerDenied, canRun, canRunNow: () => belongs() && committed.current?.formToken === formToken && committed.current.canRun};
}
