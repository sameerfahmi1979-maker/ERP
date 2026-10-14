"use client";
import {useLayoutEffect, useMemo} from "react";
import {useRecordReadActive} from "./use-record-read-active";

const activeLifetimes = new WeakSet<object>();
/** Imperative callbacks retained by a retired screen must not revive its reads. */
export function useReadLifetime(key: string) {
  const active = useRecordReadActive();
  const lifetime = useMemo(() => {
    const token = {key, enabled:active, get active() {return activeLifetimes.has(token);}};
    return token;
  }, [key, active]);
  useLayoutEffect(() => {
    if (active) activeLifetimes.add(lifetime);
    return () => {activeLifetimes.delete(lifetime);};
  }, [lifetime, active]);
  return lifetime;
}
