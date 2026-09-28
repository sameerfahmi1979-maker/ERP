"use client";

import { createContext, createElement, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode, type SetStateAction } from "react";

/** In-memory store. Persistence requires a separate, explicitly allowlisted schema. */
export function createUiPreferenceStore<T>(fallback: T) {
  let value = fallback;
  const listeners = new Set<() => void>();
  return {
    getSnapshot: () => value,
    getServerSnapshot: () => fallback,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    set: (update: SetStateAction<T>) => {
      value = typeof update === "function" ? (update as (previous:T)=>T)(value) : update;
      listeners.forEach(listener => listener());
    },
  };
}

type MemoryStores = Map<string, ReturnType<typeof createUiPreferenceStore<unknown>>>;
const MemoryContext = createContext<MemoryStores | null>(null);

/** Remounted for each authenticated principal; never serializes arbitrary UI/search values to disk. */
export function WorkspaceUiMemoryProvider({children}:{children:ReactNode}) {
  const [stores]=useState<MemoryStores>(()=>new Map());
  useEffect(()=>{
    // Retire only owned, legacy PII-bearing keys. Never clear browser/auth storage wholesale.
    try { Object.keys(localStorage).filter(key=>key.startsWith("algt_erp_workspace_page_state:") || key.startsWith("erp_table_prefs:v2:")).forEach(key=>localStorage.removeItem(key)); } catch { /* unavailable storage */ }
  },[]);
  return createElement(MemoryContext.Provider,{value:stores},children);
}

/** Compatibility name; arbitrary page/table state is now session memory only. */
export function usePersistentUiState<T>(key: string | undefined, initialValue: T): [T, (update: SetStateAction<T>) => void] {
  const stores=useContext(MemoryContext);
  const [fallback] = useState(() => initialValue);
  const store = useMemo(() => {
    if (key && stores?.has(key)) return stores.get(key)! as ReturnType<typeof createUiPreferenceStore<T>>;
    const next=createUiPreferenceStore<T>(fallback);
    if(key && stores) stores.set(key,next as ReturnType<typeof createUiPreferenceStore<unknown>>);
    return next;
  }, [key, fallback, stores]);
  const value = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return [value, store.set];
}
