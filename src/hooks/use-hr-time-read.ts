"use client";
import {useEffect, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {useReadLifetime} from "./use-read-lifetime";
import {canonicalReadParams} from "@/hooks/use-server-page";
import {readJson, retryAuthorizedRead} from "@/lib/reads/client";
import {HR_TIME_CONFIG, hrTimeCriteriaSchema, hrTimePageSchema, hrTimeReadIdentity, type HrTimeCriteria, type HrTimeKind, type HrTimePage} from "@/lib/reads/hr-time-schema";
import type {AuthContext} from "@/lib/rbac/check";
export const hrTimeReadPrefix = (kind: HrTimeKind) => ["hr", "time", HR_TIME_CONFIG[kind].prefix, "counted-page"] as const;
export async function fetchHrTime(input: HrTimeCriteria, signal: AbortSignal) {
  const r = await readJson<{success: true; data: unknown}>("hr-time", input, signal), safe = hrTimePageSchema.safeParse(r.data);
  if (!safe.success || safe.data.kind !== input.kind || safe.data.page !== input.page || safe.data.pageSize !== input.pageSize) throw Error("Time records and total could not be verified");
  return safe.data;
}
export function useHrTimeInquiryIdentity(kind: HrTimeKind, context: AuthContext) {
  const identity = hrTimeReadIdentity(context), qc = useQueryClient(), previous = useRef({identity, kind});
  useEffect(() => {if (previous.current.identity !== identity || previous.current.kind !== kind) {const queryKey = [...hrTimeReadPrefix(previous.current.kind), previous.current.identity]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey}); previous.current = {identity, kind};}}, [identity, kind, qc]);
  return identity;
}
export function useHrTimeRead(criteria: HrTimeCriteria | null, context: AuthContext, seed?: HrTimePage, updatedAt = 0, seedIdentity?: string) {
  const qc = useQueryClient(), identity = hrTimeReadIdentity(context), kind = criteria?.kind ?? seed?.kind;
  const initial = kind ? canonicalReadParams(hrTimeCriteriaSchema.parse({kind, ...(kind === "leave" ? {status: "pending"} : {})})) : "null";
  const safeSeed = hrTimePageSchema.safeParse(seed), matchedSeed = safeSeed.success && seedIdentity === identity && safeSeed.data.kind === kind ? safeSeed.data : undefined;
  const [search, setSearch] = useState(criteria?.search ?? "");
  useEffect(() => {const timer = setTimeout(() => setSearch(criteria?.search ?? ""), 250); return () => clearTimeout(timer);}, [criteria?.search]);
  const effective = criteria ? canonicalReadParams({...criteria, search}) : "null", prefix = kind ? hrTimeReadPrefix(kind) : ["hr", "time", "unavailable", "counted-page"];
  const q = useQuery({queryKey: [...prefix, identity, effective], queryFn: ({signal}) => {if (!criteria) throw Error("Time criteria unavailable"); return fetchHrTime(JSON.parse(effective), signal);}, enabled: !!criteria,
    initialData: () => effective === initial && qc.getQueryState([...prefix, identity, effective]) === undefined ? matchedSeed : undefined, initialDataUpdatedAt: updatedAt || undefined, staleTime: 30000, retry: retryAuthorizedRead, refetchOnWindowFocus: true});
  const lifetime = useReadLifetime(JSON.stringify([identity, kind, effective, criteria?.search]));
  const refetch = (options?: Parameters<typeof q.refetch>[0]) => lifetime.active && criteria && search === criteria.search ? q.refetch(options) : Promise.resolve();
  return {...q, refetch, data: !criteria || q.isError || search !== criteria.search ? undefined : q.data, isBusy: !!criteria && (search !== criteria.search || q.isFetching)};
}
