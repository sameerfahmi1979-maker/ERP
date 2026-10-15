"use client";

import {useCallback, useLayoutEffect, useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {readHasFailed} from "@/components/erp/query-read-boundary";

export type CandidateChildAdmissionProps = {
  /** A read pause is not a business permission grant or revocation. */
  mutationAdmitted?: boolean;
  onRetryMutationAdmission?: () => Promise<unknown>;
};
type ActiveRead = {
  isError: boolean;
  isSuccess: boolean;
  isFetching: boolean;
  data?: {success: boolean};
  refetch: (options?: {cancelRefetch?: boolean}) => Promise<unknown>;
};

/** Recruitment-local control for legacy child actions. Native checks still authorize writes. */
export function useCandidateChildReadAdmission({canManage, mutationAdmitted = true, prerequisitesMet = true, reads, onRetryMutationAdmission}:
  CandidateChildAdmissionProps & {canManage: boolean; prerequisitesMet?: boolean; reads: ActiveRead[]}) {
  const [retrying, setRetrying] = useState(false);
  const retryFlight = useRef(false), mounted = useRef(false), committed = useRef(false);
  const ready = canManage && mutationAdmitted && prerequisitesMet && !retrying && reads.every(read =>
    read.isSuccess && read.data?.success === true && !read.isFetching && !readHasFailed(read));
  useLayoutEffect(() => {mounted.current = true; return () => {mounted.current = false;};}, []);
  useLayoutEffect(() => {committed.current = ready; return () => {committed.current = false;};}, [ready]);
  const canDispatch = useCallback(() => committed.current, []);
  async function retry() {
    if (!mounted.current || retryFlight.current) return;
    retryFlight.current = true; setRetrying(true);
    try {
      await Promise.allSettled([
        Promise.resolve().then(() => onRetryMutationAdmission?.()),
        ...reads.map(read => read.refetch({cancelRefetch: false})),
      ]);
    } finally {retryFlight.current = false; if (mounted.current) setRetrying(false);}
  }
  return {ready, canDispatch, retrying, retry};
}

/** This lives inside the portal: an inert background cannot provide its retry UI. */
export function CandidateChildReadPause({admission, canManage, blockedReason}:
  {admission: ReturnType<typeof useCandidateChildReadAdmission>; canManage: boolean; blockedReason?: string}) {
  if (admission.ready) return null;
  return <div role="alert" className="mb-4 rounded-sm border border-destructive p-3 text-sm" aria-busy={admission.retrying || undefined}>
    <p>{!canManage ? "You do not have permission to make this change. Your entries are retained; cancel this dialog."
      : blockedReason ?? "Changes are paused until access and required records are verified. Your entries are retained. Retry the checks or cancel this dialog."}</p>
    {canManage && <Button type="button" variant="outline" className="mt-2" disabled={admission.retrying}
      onClick={() => void admission.retry()}>{admission.retrying ? "Retrying required checks…" : "Retry required checks"}</Button>}
  </div>;
}
