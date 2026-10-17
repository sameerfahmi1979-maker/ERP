"use client";
import {useCallback, useEffect, useRef, useState} from "react";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {candidateRecordIdentity, candidateRecordSchema, candidateSalaryReadSchema, type CandidateRecordInitial, type CandidateSalaryAccess} from "@/lib/reads/hr-candidate-record-schema";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";

export const candidateRecordKey = (id: number | null, identity: string) => ["hr", "recruitment", "candidate-record", id, identity] as const;
const forbidden = (error: unknown) => error instanceof ReadError && [401, 403].includes(error.status);
export function useHrCandidateRecord(candidateId: number | null, context: AuthContext, initial?: CandidateRecordInitial) {
  const identity = candidateRecordIdentity(context), qc = useQueryClient(), owner = JSON.stringify([identity, candidateId]);
  const previous = useRef({identity, candidateId});
  const [deniedOwner, setDeniedOwner] = useState<string | null>(null);
  const allowed = hasPermission(context, "hr.recruitment.view") || hasPermission(context, "hr.recruitment.manage");
  const key = candidateRecordKey(candidateId, identity);
  const seed = allowed && deniedOwner !== owner && initial?.identity === identity && initial.data.candidate.id === candidateId ? initial : undefined;
  const query = useQuery({queryKey: key, enabled: candidateId !== null && allowed && deniedOwner !== owner, staleTime: 30000,
    initialData: seed?.data, initialDataUpdatedAt: seed?.updatedAt, retry: retryAuthorizedRead,
    queryFn: async ({signal}) => {
      const result = await readJson<{success: true; data: unknown}>("hr-candidate-record", {kind: "record", candidateId}, signal);
      const data = candidateRecordSchema.parse(result.data);
      if (data.candidate.id !== candidateId) throw Error("Candidate record response did not match its request");
      return data;
    }});
  const denied = !allowed || deniedOwner === owner || forbidden(query.error);
  if (denied && deniedOwner !== owner) setDeniedOwner(owner);
  const retire = useCallback(() => setDeniedOwner(owner), [owner, setDeniedOwner]);
  useEffect(() => {
    if (previous.current.identity !== identity || previous.current.candidateId !== candidateId) {
      const old = candidateRecordKey(previous.current.candidateId, previous.current.identity);
      void qc.cancelQueries({queryKey: old, exact: true}); qc.removeQueries({queryKey: old, exact: true}); previous.current = {identity, candidateId};
    }
    if (denied) {void qc.cancelQueries({queryKey: key, exact: true}); qc.removeQueries({queryKey: key, exact: true});}
    // key consists solely of the dependencies below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [identity, candidateId, denied, qc]);
  // A later server refresh can revoke a sensitive projection without changing
  // the serialized client identity. Adopt that newer authoritative snapshot,
  // but leave the form's opening revision/unsaved business fields untouched.
  const freshSeed = seed && seed.updatedAt > query.dataUpdatedAt ? seed : undefined;
  useEffect(() => {
    const live = qc.getQueryState<CandidateRecordInitial["data"]>(key);
    // Publication must not erase a failed read or impersonate a completed fetch.
    // Another response may also have settled since this render selected its seed.
    if (freshSeed && !denied && live?.status === "success" && live.fetchStatus === "idle" && freshSeed.updatedAt > live.dataUpdatedAt)
      qc.setQueryData(key, freshSeed.data, {updatedAt: freshSeed.updatedAt});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshSeed, denied, identity, candidateId, qc, query.isError, query.isFetching]);
  const data = freshSeed?.data ?? query.data;
  return {query, identity, owner, denied, retire, data: denied ? undefined : data,
    evidenceUpdatedAt: freshSeed?.updatedAt ?? query.dataUpdatedAt,
    verified: !denied && !query.isError && !query.isFetching && !!data};
}

const sameSalaryAccess = (a: CandidateSalaryAccess, b: CandidateSalaryAccess) =>
  a.canView === b.canView && a.canManage === b.canManage && a.canManageCandidate === b.canManageCandidate &&
  a.companyId === b.companyId && a.branchId === b.branchId;

export function useCandidateSalaryAccess(requisitionId: number | null, context: AuthContext, enabled: boolean,
  initial?: {requisitionId: number | null; access: CandidateSalaryAccess; identity: string; updatedAt: number}) {
  const identity = candidateRecordIdentity(context), qc = useQueryClient();
  const key = ["hr", "recruitment", "salary-access", requisitionId, identity] as const;
  const previous = useRef(key);
  const seed = enabled && initial?.identity === identity && initial.requisitionId === requisitionId ? initial : undefined;
  const query = useQuery({queryKey: key, enabled, staleTime: 30000, retry: retryAuthorizedRead,
    initialData: seed ? {kind: "salary-access" as const, requisitionId, salaryAccess: seed.access} : undefined, initialDataUpdatedAt: seed?.updatedAt,
    queryFn: async ({signal}) => {
      const result = await readJson<{success: true; data: unknown}>("hr-candidate-record", {kind: "salary-access", requisitionId}, signal);
      const data = candidateSalaryReadSchema.parse(result.data);
      if (data.requisitionId !== requisitionId) throw Error("Salary access response did not match its request");
      return data;
    }});
  useEffect(() => {
    const removeInactive = (queryKey: typeof key) => {
      // Draft and saved-candidate observers can share this exact request. One
      // observer moving away must not detach or abort the still-enabled owner.
      const filter = {queryKey, exact: true, type: "inactive" as const};
      void qc.cancelQueries(filter); qc.removeQueries(filter);
    };
    if (JSON.stringify(previous.current) !== JSON.stringify(key)) {removeInactive(previous.current); previous.current = key;}
    if (!enabled) removeInactive(key);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requisitionId, identity, enabled, qc]);
  const denied = forbidden(query.error);
  const freshSeed = seed && seed.updatedAt > query.dataUpdatedAt ? seed : undefined;
  const conflictingSeed = seed && query.data && seed.updatedAt === query.dataUpdatedAt && !sameSalaryAccess(seed.access, query.data.salaryAccess);
  useEffect(() => {
    const live = qc.getQueryState<{salaryAccess: CandidateSalaryAccess}>(key);
    if (freshSeed && !denied && live?.status === "success" && live.fetchStatus === "idle" && freshSeed.updatedAt > live.dataUpdatedAt)
      qc.setQueryData(key, {kind: "salary-access", requisitionId, salaryAccess: freshSeed.access}, {updatedAt: freshSeed.updatedAt});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [freshSeed, denied, requisitionId, identity, qc, query.isError, query.isFetching]);
  return {query, denied, data: enabled && !denied && !conflictingSeed && !query.isError && !query.isFetching
    ? freshSeed?.access ?? query.data?.salaryAccess : undefined};
}
