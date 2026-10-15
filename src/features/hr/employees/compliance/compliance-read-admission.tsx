"use client";
import {useCallback, useLayoutEffect, useMemo, useRef, useState} from "react";
import {Button} from "@/components/ui/button";

type Read = {isSuccess: boolean; isError: boolean; isFetching: boolean; data?: unknown; refetch: (options?: {cancelRefetch?: boolean}) => Promise<unknown>};
export type ComplianceMutationAdmission = {generation: object; ready: boolean; canDispatch: () => boolean; isCurrent: () => boolean; retrying: boolean; retry: () => Promise<void>};
type Lifetime = {generation: object; live: boolean; flight: boolean; ready: boolean; reads: Read[]; parent?: ComplianceMutationAdmission};
export function useComplianceReadAdmission(canManage: boolean, reads: Read[], owner = "default", parent?: ComplianceMutationAdmission): ComplianceMutationAdmission {
  // A fresh token for every committed owner transition, including A → B → A.
  // A nested adapter belongs to this exact parent generation, not its latest ref.
  const parentGeneration = parent?.generation;
  const generation = useMemo(() => ({owner, parentGeneration}), [owner, parentGeneration]);
  const committed = useRef<Lifetime | null>(null);
  const [retryGeneration, setRetryGeneration] = useState<object | null>(null);
  const retrying = retryGeneration === generation;
  const ready = canManage && (parent?.ready ?? true) && !retrying && reads.every(read => read.isSuccess && !read.isError && !read.isFetching && read.data !== undefined);
  useLayoutEffect(() => {
    const lifetime: Lifetime = {generation, live: true, flight: false, ready: false, reads: []};
    committed.current = lifetime;
    return () => {lifetime.live = false; lifetime.ready = false;};
  }, [generation]);
  useLayoutEffect(() => {
    if (committed.current) {committed.current.ready = ready; committed.current.reads = reads; committed.current.parent = parent;}
  });
  const isCurrent = useCallback(() => {
    const lifetime = committed.current;
    return !!lifetime && lifetime.generation === generation && lifetime.live && (lifetime.parent?.isCurrent() ?? true);
  }, [generation]);
  const canDispatch = useCallback(() => {
    const lifetime = committed.current;
    return isCurrent() && !!lifetime && !lifetime.flight && lifetime.ready && (lifetime.parent?.canDispatch() ?? true);
  }, [isCurrent]);
  const retry = useCallback(async () => {
    const lifetime = committed.current;
    if (!isCurrent() || !lifetime || lifetime.flight) return;
    lifetime.flight = true; setRetryGeneration(generation);
    const currentReads = lifetime.reads, currentParent = lifetime.parent;
    try {
      await Promise.allSettled([
        ...currentReads.map(async read => isCurrent() ? read.refetch({cancelRefetch: false}) : undefined),
        Promise.resolve().then(() => isCurrent() ? currentParent?.retry() : undefined),
      ]);
    } finally {
      lifetime.flight = false;
      if (isCurrent() && committed.current === lifetime) setRetryGeneration(null);
    }
  }, [generation, isCurrent]);
  return {generation, ready, canDispatch, isCurrent, retrying, retry};
}
export function ComplianceReadPause({admission}: {admission?: ComplianceMutationAdmission}) {
  if (!admission || admission.ready) return null;
  return <div role="alert" aria-busy={admission.retrying || undefined} className="mb-4 rounded-sm border border-destructive p-3 text-sm">
    <p>Changes are paused until access and required records are verified. Your entries are retained. Retry the checks or cancel this dialog.</p>
    <Button type="button" variant="outline" className="mt-2" disabled={admission.retrying} onClick={() => void admission.retry()}>{admission.retrying ? "Retrying required checks…" : "Retry required checks"}</Button>
  </div>;
}
