"use client";
import {useEffect, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {queryKeys} from "@/lib/query/query-keys";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {hrDashboardCriteriaSchema, hrDashboardReadIdentity, hrDashboardSchema, type HrDashboard, type HrDashboardCriteria} from "@/lib/reads/hr-dashboard-schema";

export type HrDashboardSeed = {identity: string; data: HrDashboard};
// Weak, client-memory seed retirement only; not an authorization cache. A
// retained workspace element must not reapply the same SSR payload after a
// failed/denied refresh. A newly server-verified response is a different object.
const retiredSeeds = new WeakSet<HrDashboard>();
export function useHrDashboard(authContext: AuthContext, filters: HrDashboardCriteria, seed?: HrDashboardSeed) {
  const identity = hrDashboardReadIdentity(authContext), criteria = hrDashboardCriteriaSchema.parse(filters);
  const key = [...queryKeys.hr.dashboard.summary(), identity, criteria] as const;
  const owner = JSON.stringify(key), previous = useRef(key), committed = useRef(owner), qc = useQueryClient();
  const [deniedOwner, setDeniedOwner] = useState<string | null>(null);
  const allowed = hasPermission(authContext, "hr.dashboard.view") || hasPermission(authContext, "hr.employees.view");
  useEffect(() => {
    committed.current = owner;
    if (JSON.stringify(previous.current) !== owner) {
      const old = previous.current; void qc.cancelQueries({queryKey: old, exact: true}); qc.removeQueries({queryKey: old, exact: true}); previous.current = key;
    }
    return () => {if (committed.current === owner) committed.current = "";};
    // The deterministic owner includes all key state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, qc]);
  const query = useQuery({queryKey: key, staleTime: 30000, refetchOnWindowFocus: true, retry: retryAuthorizedRead,
    enabled: allowed && deniedOwner !== owner,
    initialData: allowed && deniedOwner !== owner && seed && seed.identity === identity && !retiredSeeds.has(seed.data) && JSON.stringify(seed.data.filters) === JSON.stringify(criteria) ? seed.data : undefined,
    initialDataUpdatedAt: seed ? Date.parse(seed.data.asOf) : undefined,
    queryFn: async ({signal}) => {
      const result = await readJson<{success: true; data: unknown}>("hr-dashboard", criteria, signal);
      const data = hrDashboardSchema.parse(result.data);
      if (JSON.stringify(data.filters) !== JSON.stringify(criteria)) throw Error("Dashboard response did not match its filters");
      return data;
    }});
  const denied = !allowed || deniedOwner === owner || query.error instanceof ReadError && [401, 403].includes(query.error.status);
  if (denied && deniedOwner !== owner) setDeniedOwner(owner);
  useEffect(() => {
    if (seed && (denied || query.isError)) retiredSeeds.add(seed.data);
    if (denied) {void qc.cancelQueries({queryKey: key, exact: true}); qc.removeQueries({queryKey: key, exact: true});}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [denied, query.isError, seed, owner, qc]);
  return {...query, denied, data: denied || query.isError || query.isFetching ? undefined : query.data,
    retry: () => {if (committed.current === owner && !denied && qc.getQueryState(key)?.fetchStatus !== "fetching") void query.refetch({cancelRefetch: false});}};
}
