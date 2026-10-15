"use client";
import {useEffect, useId, useLayoutEffect, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {ZodType} from "zod";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
import {canonicalReadParams} from "./use-server-page";
import {useRecordReadActive} from "./use-record-read-active";
import {canReadDmsApprovals, dmsApprovalReadIdentity, dmsApprovalQueueCriteriaSchema, dmsApprovalQueuePageSchema, dmsApprovalStateCriteriaSchema,
  dmsApprovalStateResponseSchema, dmsApprovalHistoryCriteriaSchema, dmsApprovalHistoryPageSchema, type DmsApprovalQueueCriteria} from "@/lib/reads/dms-approvals-schema";

function useApprovalRead<T extends {criteria: unknown}>(auth: AuthContext, request: unknown, schema: ZodType, response: ZodType<T>,
  prefix: readonly (string | number)[], resource: string, requestedEnabled: boolean, debounce: boolean) {
  const recordActive=useRecordReadActive(),enabled=requestedEnabled&&recordActive;
  const instance = useId(), identity = dmsApprovalReadIdentity(auth), qc = useQueryClient();
  const authorization = JSON.stringify([identity, resource, enabled]);
  const [lifetime, setLifetime] = useState(() => ({authorization, serial: 0, generation: {}}));
  if (lifetime.authorization !== authorization) setLifetime({authorization, serial: lifetime.serial + 1, generation: {}});
  const generation = lifetime.authorization === authorization ? lifetime.generation : null;
  const owner = JSON.stringify([authorization, instance, lifetime.serial]), ownerKey = [...prefix, owner];
  const [settled, setSettled] = useState({owner, value: request});
  const requestKey = canonicalReadParams(request as Record<string, unknown>);
  useEffect(() => {if (!debounce) return; const timer = setTimeout(() => setSettled({owner, value: JSON.parse(requestKey)}), 250); return () => clearTimeout(timer);}, [owner, requestKey, debounce]);
  const immediate = schema.safeParse(request), delayed = schema.safeParse(!debounce || settled.owner !== owner ? request : settled.value);
  const params = canonicalReadParams((delayed.success ? delayed.data : request) as Record<string, unknown>);
  const aligned = immediate.success && delayed.success && canonicalReadParams(immediate.data as Record<string, unknown>) === params;
  const [deniedOwner, setDeniedOwner] = useState<string | null>(null);
  const active = !!auth.profile?.id && auth.isAccountActive && !auth.profile.must_change_password;
  const admitted = !!generation && active && enabled && aligned && deniedOwner !== owner;
  const key = [...ownerKey, params];
  const live = useRef<{owner: string; generation: object | null; params: string; admitted: boolean; ready: boolean} | null>(null);
  const query = useQuery({queryKey: key, enabled: admitted, gcTime: 0, staleTime: 15000, retry: retryAuthorizedRead, refetchOnWindowFocus: true,
    queryFn: async ({signal}) => {
      if (!admitted || !immediate.success || !delayed.success) throw new ReadError("Invalid approval criteria", 400);
      signal.throwIfAborted(); const result = await readJson<{success: true; data: unknown}>("dms-approvals", delayed.data as Record<string, unknown>, signal);
      signal.throwIfAborted(); const data = response.parse(result.data);
      if (canonicalReadParams(data.criteria as Record<string, unknown>) !== params) throw Error("Approval response mismatch");
      return data;
    }});
  const serverDenied = query.error instanceof ReadError && [401, 403].includes(query.error.status);
  if (serverDenied && deniedOwner !== owner) setDeniedOwner(owner);
  const denied = !active || deniedOwner === owner || serverDenied;
  const ready = admitted && !denied && query.isSuccess && !query.isFetching && !query.isError;
  useLayoutEffect(() => {live.current = {owner, generation, params, admitted: admitted && !denied, ready}; return () => {if (live.current?.generation === generation) live.current = null;};});
  const prefixKey = JSON.stringify(prefix);
  useLayoutEffect(() => () => {
    if (live.current?.generation === generation) live.current = null;
    const queryKey = [...JSON.parse(prefixKey) as (string | number)[], owner]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});
  }, [qc, owner, generation, prefixKey]);
  useEffect(() => {if (denied || !enabled) {const queryKey = [...JSON.parse(prefixKey) as (string | number)[], owner]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});}}, [denied, enabled, qc, prefixKey, owner]);
  const belongs = () => !!generation && live.current?.generation === generation && live.current.owner === owner;
  const current = () => belongs() && live.current?.params === params;
  const currentData = () => {
    const state = qc.getQueryState<T>(key);
    // Query state can change before React's batched observer notification.
    // A retained action must not use the previous capability during that gap.
    return state?.status === "success" && state.fetchStatus === "idle" && !state.isInvalidated && state.data === query.data;
  };
  return {owner, generation, ready, data: ready ? query.data : undefined, denied, invalid: !immediate.success,
    busy: active && enabled && !denied && immediate.success && (!aligned || query.isFetching || query.isPending),
    error: admitted && !denied && query.isError ? query.error : null,
    isCurrent: () => current() && live.current?.ready === true && currentData(),
    retry: () => {if (current() && live.current?.admitted && admitted && qc.getQueryState(key)?.fetchStatus !== "fetching") void query.refetch({cancelRefetch: false});},
    // A confirmed mutation must refresh the current page of this same lifetime,
    // even if the user changed search/page while the business action awaited.
    refresh: async () => {if (!belongs() || !enabled || denied) return; await qc.cancelQueries({queryKey: ownerKey});
      if (belongs() && live.current?.admitted) await qc.invalidateQueries({queryKey: ownerKey, refetchType: "active"});},
  };
}
export function useDmsApprovalQueue(auth: AuthContext, criteria: Partial<DmsApprovalQueueCriteria>) {
  const read = useApprovalRead(auth, {mode: "queue", ...criteria}, dmsApprovalQueueCriteriaSchema, dmsApprovalQueuePageSchema,
    ["dms", "approvals", "queue"], "queue", canReadDmsApprovals(auth), true);
  return {...read, denied: read.denied || !canReadDmsApprovals(auth)};
}
export function useDmsApprovalState(auth: AuthContext, documentId: number, enabled = true) {
  const allowed = canReadDmsApprovals(auth) || hasPermission(auth, "dms.documents.view");
  const read = useApprovalRead(auth, {mode: "state", documentId}, dmsApprovalStateCriteriaSchema, dmsApprovalStateResponseSchema,
    ["dms", "approval-state", documentId], "state:" + documentId, enabled && allowed, false);
  return {...read, denied: read.denied || !allowed};
}
export function useDmsApprovalHistory(auth: AuthContext, documentId: number, page: number, enabled: boolean) {
  return useApprovalRead(auth, {mode: "history", documentId, page, pageSize: 20}, dmsApprovalHistoryCriteriaSchema, dmsApprovalHistoryPageSchema,
    ["dms", "approval-history", documentId], "history:" + documentId, enabled, false);
}
