"use client";
import {useCallback, useLayoutEffect, useRef, useState} from "react";
import {Button} from "@/components/ui/button";
import {useReadLifetime} from "@/hooks/use-read-lifetime";

type Read = {isSuccess: boolean; isError: boolean; isFetching: boolean; data?: unknown; refetch: (options?: {cancelRefetch?: boolean}) => Promise<unknown>};
/** Each committed opening has a distinct token, including close/reopen of the
 * same record. A retained callback cannot borrow a later opening's admission. */
export function useTimeDialogLifetime(owner: string, open: boolean) {
  const [state, setState] = useState(() => ({owner, open, token: {}}));
  if (state.owner !== owner || state.open !== open) setState({owner, open, token: {}});
  const live = useRef<object | null>(null), token = state.token;
  useLayoutEffect(() => {live.current = open ? token : null; return () => {if (live.current === token) live.current = null;};}, [token, open]);
  return useCallback(() => open && live.current === token, [open, token]);
}
export function useTimeReadAdmission(canManage: boolean, reads: Read[], owner: string) {
  const flight = useRef(false), committed = useRef(false);
  const lifetime = useReadLifetime(owner);
  const [retryOwner, setRetryOwner] = useState<object|null>(null);
  const retrying = retryOwner === lifetime;
  const ready = canManage && !retrying && reads.every(read => read.isSuccess && !read.isError && !read.isFetching && read.data !== undefined);
  useLayoutEffect(() => {flight.current = false; return () => {committed.current = false;};}, [lifetime]);
  useLayoutEffect(() => {committed.current = ready; return () => {committed.current = false;};}, [ready]);
  const canDispatch = useCallback(() => lifetime.active && committed.current, [lifetime]);
  const isCurrent = useCallback(() => lifetime.active, [lifetime]);
  async function retry() {
    if (!lifetime.active || flight.current) return;
    flight.current = true; setRetryOwner(lifetime);
    try {await Promise.allSettled(reads.map(read => read.refetch({cancelRefetch: false})));}
    finally {if (lifetime.active) {flight.current = false; setRetryOwner(null);}}
  }
  return {ready, canDispatch, isCurrent, retrying, retry};
}
export function useTimeChildOpen(open: boolean, onChildOpen?: (open: boolean) => void) {
  const previous = useRef(false);
  useLayoutEffect(() => {if (previous.current !== open) {previous.current = open; onChildOpen?.(open);}}, [open, onChildOpen]);
}
export function TimeReadPause({admission}: {admission: ReturnType<typeof useTimeReadAdmission>}) {
  if (admission.ready) return null;
  return <div role="alert" aria-busy={admission.retrying || undefined} className="mb-4 rounded-sm border border-destructive p-3 text-sm">
    <p>Changes are paused until access and required records are verified. Your entries are retained. Retry the checks or cancel this dialog.</p>
    <Button type="button" variant="outline" className="mt-2" disabled={admission.retrying} onClick={() => void admission.retry()}>{admission.retrying ? "Retrying required checks…" : "Retry required checks"}</Button>
  </div>;
}
