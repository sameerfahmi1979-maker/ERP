"use client";
import {useReadLifetime} from "./use-read-lifetime";
import {useRecordReadActive} from "./use-record-read-active";
import {useEffect, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {canUseApplication} from "@/lib/rbac/scope";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {EMPLOYEE_OVERVIEW_SECTIONS, employeeOverviewIdentity, employeeOverviewSchema, type EmployeeOverview, type EmployeeOverviewSection} from "@/lib/reads/employee-overview-schema";

export const employeeOverviewPrefix = (employeeId: number) => ["hr", "employees", "overview", employeeId] as const;
export function useEmployeeOverview(authContext: AuthContext, employeeId: number) {
  const sectionActive = useRecordReadActive();
  const identity = employeeOverviewIdentity(authContext), qc = useQueryClient();
  const key = [...employeeOverviewPrefix(employeeId), identity], previous = useRef(key);
  const activity = useReadLifetime(JSON.stringify(key));
  const owner = JSON.stringify(key), life = useRef({owner, generation: 0});
  const [denied, setDenied] = useState<string | null>(null), [retrying, setRetrying] = useState<{owner: string; section: EmployeeOverviewSection} | null>(null);
  const allowed = canUseApplication(authContext) && denied !== owner;
  useEffect(() => {
    life.current = {owner, generation: life.current.generation + 1};
    if (JSON.stringify(previous.current) !== owner) {
      const old = previous.current; void qc.cancelQueries({queryKey: old}); qc.removeQueries({queryKey: old}); previous.current = key;
    }
    return () => {life.current.generation++;};
    // identity is a deterministic scalar; key contains no additional state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [owner, qc]);
  const fetchOverview = async (sections: EmployeeOverviewSection[], signal: AbortSignal) => {
    const result = await readJson<{success: true; data: unknown}>("employee-overview", {employeeId, sections}, signal);
    const parsed = employeeOverviewSchema.parse(result.data);
    if (parsed.employeeId !== employeeId || Object.keys(parsed.sections).length !== sections.length || sections.some(s => !parsed.sections[s])) throw Error("Overview response did not match its request");
    return parsed;
  };
  const query = useQuery({queryKey: key, enabled: sectionActive && allowed, staleTime: 30000, refetchOnWindowFocus: true, retry: retryAuthorizedRead,
    queryFn: ({signal}) => {life.current.generation++; return fetchOverview([...EMPLOYEE_OVERVIEW_SECTIONS], signal);}});
  const authorizationError = query.error instanceof ReadError && [401, 403].includes(query.error.status);
  // Latch an authorization rejection before a cache removal can restart this query.
  if (authorizationError && denied !== owner) setDenied(owner);
  const accessDenied = !allowed || authorizationError;
  useEffect(() => {
    if (accessDenied) {void qc.cancelQueries({queryKey: key}); qc.removeQueries({queryKey: key});}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessDenied, owner, qc]);
  const data = accessDenied || query.isError || query.isFetching ? undefined : query.data;
  async function retrySection(section: EmployeeOverviewSection) {
    if (!activity.active || accessDenied || retrying?.owner === owner) return;
    const currentOwner = life.current.owner, generation = life.current.generation;
    const previousUpdatedAt = qc.getQueryState(key)?.dataUpdatedAt;
    setRetrying({owner, section});
    try {
      const result = await qc.fetchQuery({queryKey: [...key, "retry", section], staleTime: 0, retry: retryAuthorizedRead, queryFn: ({signal}) => fetchOverview([section], signal)});
      const current = qc.getQueryState(key);
      if (activity.active && life.current.owner === currentOwner && life.current.generation === generation && current?.fetchStatus !== "fetching" && !current?.isInvalidated && current?.dataUpdatedAt === previousUpdatedAt) {
        qc.setQueryData<EmployeeOverview>(key, previousData => previousData ? {...previousData, sections: {...previousData.sections, [section]: result.sections[section]}} : undefined);
      }
    } catch (error) {
      if (activity.active && life.current.owner === currentOwner && life.current.generation === generation && error instanceof ReadError && [401, 403].includes(error.status)) setDenied(owner);
      // Failed sections remain explicitly failed; no zero or cached success.
    } finally {
      qc.removeQueries({queryKey: [...key, "retry", section], exact: true});
      if (activity.active && life.current.owner === currentOwner) setRetrying(null);
    }
  }
  return {query: {...query, refetch: (options?: Parameters<typeof query.refetch>[0]) => activity.active && !accessDenied ? query.refetch(options) : Promise.resolve()}, data, denied: accessDenied, pending: allowed && !accessDenied && query.isPending, refreshing: allowed && query.isFetching, retrying: retrying?.owner === owner ? retrying.section : null, retrySection};
}
