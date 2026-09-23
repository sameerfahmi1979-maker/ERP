"use client";

import { useMemo, useState, useSyncExternalStore, type SetStateAction } from "react";
import { notifyUiStorageChange, UI_STORAGE_CHANGE_EVENT } from "@/lib/workspace/workspace-page-state";

/** UI preferences only. Never use for credentials, records or unsaved PII. */
export function createUiPreferenceStore<T>(key: string | undefined, fallback: T) {
  let cachedRaw: string | null | undefined;
  let cachedValue = fallback;
  let memoryOnly = !key;
  const listeners = new Set<() => void>();
  const getSnapshot = (): T => {
    if (typeof window === "undefined" || memoryOnly) return cachedValue;
    let raw: string | null;
    try { raw = window.localStorage.getItem(key!); } catch { return cachedValue; }
    if (raw === cachedRaw) return cachedValue;
    cachedRaw = raw;
    try {
      const parsed: unknown = raw === null ? fallback : JSON.parse(raw);
      cachedValue = parsed !== null && typeof parsed === typeof fallback && Array.isArray(parsed) === Array.isArray(fallback)
        ? parsed as T : fallback;
    } catch { cachedValue = fallback; }
    return cachedValue;
  };
  return {
    getSnapshot,
    getServerSnapshot: () => fallback,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      const changed = (event: Event) => {
        if (event instanceof StorageEvent && event.key !== null && event.key !== key) return;
        if (event instanceof CustomEvent && event.detail !== key) return;
        listener();
      };
      window.addEventListener("storage", changed);
      window.addEventListener(UI_STORAGE_CHANGE_EVENT, changed);
      return () => { listeners.delete(listener); window.removeEventListener("storage", changed); window.removeEventListener(UI_STORAGE_CHANGE_EVENT, changed); };
    },
    set: (update: SetStateAction<T>) => {
      const next = typeof update === "function" ? (update as (previous: T) => T)(getSnapshot()) : update;
      cachedValue = next;
      if (key && typeof window !== "undefined") {
        try { cachedRaw = JSON.stringify(next); window.localStorage.setItem(key, cachedRaw); }
        catch { memoryOnly = true; }
        notifyUiStorageChange(key);
      }
      listeners.forEach(listener => listener());
    },
  };
}

export function usePersistentUiState<T>(key: string | undefined, initialValue: T): [T, (update: SetStateAction<T>) => void] {
  const [fallback] = useState(() => initialValue);
  const store = useMemo(() => createUiPreferenceStore(key, fallback), [key, fallback]);
  const value = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getServerSnapshot);
  return [value, store.set];
}
