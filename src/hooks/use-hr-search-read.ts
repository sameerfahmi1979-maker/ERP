"use client";
import {useEffect, useId, useLayoutEffect, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {ZodType} from "zod";
import type {AuthContext} from "@/lib/rbac/check";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {canonicalReadParams} from "./use-server-page";
import {hrSearchAllowedCategories, hrSearchCriteriaIssue, hrSearchReadIdentity, hrSearchFullCriteriaSchema, hrSearchSuggestionCriteriaSchema,
  hrSearchPageReadSchema, hrSearchSuggestionsReadSchema, type HrSearchFullCriteria} from "@/lib/reads/hr-search-read-schema";

function useHrRead<T extends {criteria: unknown}>(auth: AuthContext, mode: "results" | "suggestions", input: unknown, criteriaSchema: ZodType,
  responseSchema: ZodType<T>, enabled: boolean, issue: string | null, debounce: boolean) {
  const qc = useQueryClient(), instance = useId(), identity = hrSearchReadIdentity(auth), authorization = JSON.stringify([identity, mode, enabled]);
  const [lifetime, setLifetime] = useState(() => ({authorization, serial: 0, generation: {}}));
  if (lifetime.authorization !== authorization) setLifetime({authorization, serial: lifetime.serial + 1, generation: {}});
  const generation = authorization === lifetime.authorization ? lifetime.generation : null, owner = JSON.stringify([authorization, instance, lifetime.serial]);
  const keyPrefix = ["hr", "search", mode, owner];
  const [settled, setSettled] = useState({owner: debounce ? "" : owner, input});
  const immediateKey = canonicalReadParams(input as Record<string, unknown>);
  const [criteriaLifetime, setCriteriaLifetime] = useState(() => ({key: immediateKey, generation: {}}));
  if (criteriaLifetime.key !== immediateKey) setCriteriaLifetime({key: immediateKey, generation: {}});
  const criteriaGeneration = criteriaLifetime.key === immediateKey ? criteriaLifetime.generation : null;
  useEffect(() => {if (!debounce) return; const timer = setTimeout(() => setSettled({owner, input: JSON.parse(immediateKey)}), 250); return () => clearTimeout(timer);}, [debounce, owner, immediateKey]);
  const immediate = criteriaSchema.safeParse(input), delayed = criteriaSchema.safeParse(debounce && settled.owner === owner ? settled.input : input);
  const params = canonicalReadParams((delayed.success ? delayed.data : input) as Record<string, unknown>);
  const aligned = (!debounce || settled.owner === owner) && immediate.success && delayed.success && canonicalReadParams(immediate.data as Record<string, unknown>) === params;
  const [deniedOwner, setDeniedOwner] = useState<string | null>(null);
  const allowed = !!auth.profile?.id && auth.isAccountActive && !auth.profile.must_change_password && hrSearchAllowedCategories(auth).length > 0;
  const admitted = !!generation && !!criteriaGeneration && enabled && allowed && !issue && aligned && deniedOwner !== owner;
  const live = useRef<{owner: string; generation: object | null; criteriaGeneration: object | null; params: string; admitted: boolean; ready: boolean} | null>(null);
  const key = [...keyPrefix, params];
  const query = useQuery({queryKey: key, enabled: admitted, gcTime: 0, staleTime: mode === "suggestions" ? 10000 : 30000, retry: retryAuthorizedRead,
    queryFn: async ({signal}) => {if (!admitted || !delayed.success) throw new ReadError("Invalid HR search criteria", 400);
      signal.throwIfAborted(); const result = await readJson<{success: true; data: unknown}>("hr-search", delayed.data, signal); signal.throwIfAborted();
      const data = responseSchema.parse(result.data);
      if (canonicalReadParams(data.criteria as Record<string, unknown>) !== params) throw Error("Mismatched search response"); return data;}});
  const serverDenied = query.error instanceof ReadError && [401, 403].includes(query.error.status);
  if (serverDenied && deniedOwner !== owner) setDeniedOwner(owner);
  const denied = !allowed || serverDenied || deniedOwner === owner;
  const ready = admitted && !denied && query.isSuccess && !query.isFetching && !query.isError;
  useLayoutEffect(() => {live.current = {owner, generation, criteriaGeneration, params, admitted: admitted && !denied, ready}; return () => {if (live.current?.generation === generation) live.current = null;};});
  useLayoutEffect(() => () => {if (live.current?.generation === generation) live.current = null;
    const queryKey = ["hr", "search", mode, owner]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});}, [qc, mode, owner, generation]);
  useEffect(() => {if (denied || !enabled) {const queryKey = ["hr", "search", mode, owner]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});}}, [qc, mode, owner, denied, enabled]);
  const current = () => !!generation && !!criteriaGeneration && live.current?.generation === generation && live.current.criteriaGeneration === criteriaGeneration && live.current.owner === owner && live.current.params === params;
  return {owner, ready, data: ready ? query.data : undefined, denied, invalid: !immediate.success || !!issue, issue: issue ?? (!immediate.success ? "Check the search text, filters, dates and page." : null),
    busy: enabled && allowed && !denied && immediate.success && !issue && (!aligned || query.isFetching || query.isPending),
    failed: admitted && !denied && query.isError,
    error: admitted && !denied && query.isError ? query.error : null,
    isCurrent: () => current() && live.current?.ready === true,
    retry: () => {if (current() && admitted && live.current?.admitted && qc.getQueryState(key)?.fetchStatus !== "fetching") void query.refetch({cancelRefetch: false});}};
}
export function useHrSearchResults(auth: AuthContext, input: Partial<HrSearchFullCriteria> | null) {
  const request = {mode: "results", ...input}, parsed = hrSearchFullCriteriaSchema.safeParse(request);
  const issue = parsed.success && input ? hrSearchCriteriaIssue(parsed.data, hrSearchAllowedCategories(auth)) : null;
  return useHrRead(auth, "results", request, hrSearchFullCriteriaSchema, hrSearchPageReadSchema, input !== null, issue, false);
}
export function useHrSearchSuggestions(auth: AuthContext, query: string, enabled: boolean) {
  return useHrRead(auth, "suggestions", {mode: "suggestions", query}, hrSearchSuggestionCriteriaSchema, hrSearchSuggestionsReadSchema, enabled && query.length >= 2, null, true);
}
