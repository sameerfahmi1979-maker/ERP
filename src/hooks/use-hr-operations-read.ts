"use client";
import {useEffect, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import {useReadLifetime} from "./use-read-lifetime";
import {canonicalReadParams} from "@/hooks/use-server-page";
import {readJson, retryAuthorizedRead} from "@/lib/reads/client";
import {HR_OPERATIONS_CONFIG, hrOperationsCriteriaSchema, hrOperationsPageSchema, hrOperationsReadIdentity, type HrOperationsCriteria, type HrOperationsKind, type HrOperationsPage} from "@/lib/reads/hr-operations-schema";
import type {AuthContext} from "@/lib/rbac/check";
export const hrOperationsReadPrefix = (kind: HrOperationsKind) => ["hr", "operations", kind, "counted-page"] as const;
export async function fetchHrOperations(input: HrOperationsCriteria, signal: AbortSignal) {
  const r = await readJson<{success: true; data: unknown}>("hr-operations", input, signal), safe = hrOperationsPageSchema.safeParse(r.data);
  if (!safe.success || safe.data.kind !== input.kind || safe.data.page !== input.page || safe.data.pageSize !== input.pageSize) throw Error("Operational records and total could not be verified");
  return safe.data;
}
export function useHrOperationsInquiryIdentity(kind: HrOperationsKind, context: AuthContext) {
  const identity = hrOperationsReadIdentity(context), qc = useQueryClient(), previous = useRef({identity, kind});
  useEffect(() => {if (previous.current.identity !== identity || previous.current.kind !== kind) {const queryKey = [...hrOperationsReadPrefix(previous.current.kind), previous.current.identity]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey}); previous.current = {identity, kind};}}, [identity, kind, qc]);
  return identity;
}
export function useHrOperationsRead(criteria: HrOperationsCriteria | null, context: AuthContext, seed?: HrOperationsPage, updatedAt = 0, seedIdentity?: string) {
  const qc = useQueryClient(), identity = hrOperationsReadIdentity(context), kind = criteria?.kind ?? seed?.kind;
  const initial = kind ? canonicalReadParams(hrOperationsCriteriaSchema.parse({kind, ...(HR_OPERATIONS_CONFIG[kind].defaultStatus ? {status: HR_OPERATIONS_CONFIG[kind].defaultStatus} : {})})) : "null";
  const safeSeed = hrOperationsPageSchema.safeParse(seed), matchedSeed = safeSeed.success && seedIdentity === identity && safeSeed.data.kind === kind ? safeSeed.data : undefined;
  const [search, setSearch] = useState(criteria?.search ?? "");
  useEffect(() => {const timer = setTimeout(() => setSearch(criteria?.search ?? ""), 250); return () => clearTimeout(timer);}, [criteria?.search]);
  const effective = criteria ? canonicalReadParams({...criteria, search}) : "null", prefix = kind ? hrOperationsReadPrefix(kind) : ["hr", "operations", "unavailable", "counted-page"];
  // An SSR prop is an initial observation, never authority to replace a newer,
  // invalidated or failed cache entry. Explicit refresh owns subsequent reads.
  const q = useQuery({queryKey: [...prefix, identity, effective], queryFn: ({signal}) => {if (!criteria) throw Error("Operational criteria unavailable"); return fetchHrOperations(JSON.parse(effective), signal);}, enabled: !!criteria,
    initialData: () => effective === initial && qc.getQueryState([...prefix, identity, effective]) === undefined ? matchedSeed : undefined, initialDataUpdatedAt: updatedAt || undefined, staleTime: 30000, retry: retryAuthorizedRead, refetchOnWindowFocus: true});
  const lifetime = useReadLifetime(JSON.stringify([identity, kind, effective, criteria?.search]));
  const refetch = (options?: Parameters<typeof q.refetch>[0]) => lifetime.active && criteria && search === criteria.search ? q.refetch(options) : Promise.resolve();
  return {...q, refetch, data: !criteria || q.isError || search !== criteria.search ? undefined : q.data, isBusy: !!criteria && (search !== criteria.search || q.isFetching)};
}
