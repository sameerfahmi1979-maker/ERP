"use client";

import { useCallback, useRef, useState, type SetStateAction } from "react";
import { useWorkspaceFormDraft } from "./use-workspace-form-draft";
import { useWorkspaceTabDirty } from "./use-workspace-tab-dirty";
import type { WorkspaceFormDraft } from "@/lib/workspace/workspace-draft-types";

export type WorkspaceDraftCodec<T> = {
  encode: (value: T) => WorkspaceFormDraft;
  restore: (initial: T, read: (field: string, fallback?: string | number | null) => string) => T;
};

function equalDraft(a:WorkspaceFormDraft,b:WorkspaceFormDraft) {
  const keys=Object.keys(a);
  return keys.length===Object.keys(b).length && keys.every(key=>a[key]===b[key]);
}

/** Explicit typed adapter. No arbitrary object serialization, files or disk persistence. */
export function useWorkspaceControlledDraft<T>({formId, initialValue, codec, enabled}: {
  formId: string; initialValue: T; codec: WorkspaceDraftCodec<T>; enabled: boolean;
}) {
  const draft = useWorkspaceFormDraft({formId, enabled});
  const [value, setInternal] = useState(() => enabled ? codec.restore(initialValue, draft.getDraftDefault) : initialValue);
  const current = useRef(value);
  const [baseline, setBaseline] = useState(initialValue);
  const retired = useRef(false);
  const redactions = useRef<Partial<T>>({});
  const isDirty = enabled && !equalDraft(codec.encode(value),codec.encode(baseline));
  useWorkspaceTabDirty({isDirty, enabled});
  const {writeDraftField, clearDraft, retireDraft, redactDraft} = draft;
  const setValue = useCallback((update: SetStateAction<T>) => {
    if (retired.current || !enabled) return;
    const updated = typeof update === "function" ? (update as (old: T) => T)(current.current) : update;
    const next = Object.keys(redactions.current).length ? {...updated, ...redactions.current} : updated;
    current.current = next;
    for (const [field, fieldValue] of Object.entries(codec.encode(next))) writeDraftField(field, fieldValue);
    setInternal(next);
  }, [codec, enabled, writeDraftField]);
  const acceptSaved = useCallback((submitted: T) => {
    if (retired.current) return false;
    const safe = Object.keys(redactions.current).length ? {...submitted, ...redactions.current} : submitted;
    const accepted = codec.encode(safe);
    setBaseline(safe);
    const unchanged = equalDraft(codec.encode(current.current),accepted);
    if (unchanged) clearDraft();
    return unchanged;
  }, [clearDraft, codec]);
  const redact = useCallback((fields: Partial<T>) => {
    if (retired.current) return;
    redactions.current = {...redactions.current, ...fields};
    const next = {...current.current, ...fields};
    current.current = next; setInternal(next); setBaseline(previous => ({...previous, ...fields}));
    const encoded = codec.encode(next);
    redactDraft(Object.fromEntries(Object.keys(fields).map(field => [field, encoded[field]])));
  }, [codec, redactDraft]);
  const retire = useCallback((emptyValue: T) => {
    retired.current = true; current.current = emptyValue; setInternal(emptyValue); setBaseline(emptyValue); retireDraft();
  }, [retireDraft]);
  return {value, setValue, isDirty, acceptSaved, redact, retire, restoredFromDraft: draft.restoredFromDraft, getCurrent: () => current.current};
}
