"use client";
import {useEffect, useRef, useState} from "react";
import {useReadLifetime} from "./use-read-lifetime";
import {useRecordReadActive} from "./use-record-read-active";
import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {AuthContext} from "@/lib/rbac/check";
import {hasPermission} from "@/lib/rbac/scope";
import {recruitmentReadIdentity} from "@/lib/reads/hr-recruitment-inquiries-schema";
import {candidateSummarySchema} from "@/lib/reads/hr-recruitment-summary-schema";
import {readJson, ReadError, retryAuthorizedRead} from "@/lib/reads/client";
export function useCandidateSummary(candidateId: number, context: AuthContext) {
  const sectionActive = useRecordReadActive();
  const identity = recruitmentReadIdentity(context), qc = useQueryClient(), previous = useRef({identity, candidateId});
  const subject = JSON.stringify([identity, candidateId]);
  const owner = useReadLifetime(subject);
  const [deniedSubject, setDeniedSubject] = useState<string | null>(null);
  const allowed = hasPermission(context, "hr.recruitment.view") || hasPermission(context, "hr.recruitment.manage");
  const queryKey = ["hr", "recruitment", "candidate", candidateId, identity, "counts"] as const;
  useEffect(() => {
    if (previous.current.identity !== identity || previous.current.candidateId !== candidateId) {
      const queryKey = ["hr", "recruitment", "candidate", previous.current.candidateId, previous.current.identity, "counts"];
      void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey}); previous.current = {identity, candidateId};
    }
  }, [identity, candidateId, qc]);
  const query = useQuery({queryKey, staleTime: 30000, enabled: sectionActive && allowed && deniedSubject !== subject, retry: retryAuthorizedRead,
    queryFn: async ({signal}) => {
      const result = await readJson<{success: true; data: unknown}>("hr-candidate-summary", {candidateId}, signal), safe = candidateSummarySchema.safeParse(result.data);
      if (!safe.success || safe.data.candidateId !== candidateId) throw Error("Candidate summary could not be verified");
      return safe.data;
    }});
  // Denial belongs to this principal AND candidate. An old subject's denial
  // must not retire a different permitted candidate in the same account.
  const denied = !allowed || deniedSubject === subject || query.error instanceof ReadError && [401, 403].includes(query.error.status);
  if (denied && deniedSubject !== subject) setDeniedSubject(subject);
  useEffect(() => {
    if (deniedSubject === subject) {const queryKey = ["hr", "recruitment", "candidate", candidateId, identity, "counts"]; void qc.cancelQueries({queryKey}); qc.removeQueries({queryKey});}
  }, [deniedSubject, subject, identity, candidateId, qc]);
  return {...query, refetch: (options?: Parameters<typeof query.refetch>[0]) => owner.active && !denied ? query.refetch(options) : Promise.resolve(), denied, data: denied || query.isError || query.isFetching ? undefined : query.data};
}
