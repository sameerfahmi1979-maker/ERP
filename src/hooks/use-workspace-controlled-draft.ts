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
  const [baseline, setBaseline] = useState(() => codec.encode(initialValue));
  const isDirty = enabled && !equalDraft(codec.encode(value),baseline);
  useWorkspaceTabDirty({isDirty, enabled});
  const {writeDraftField, clearDraft} = draft;
  const setValue = useCallback((update: SetStateAction<T>) => {
    if (!enabled) return;
    const next = typeof update === "function" ? (update as (old: T) => T)(current.current) : update;
    current.current = next;
    for (const [field, fieldValue] of Object.entries(codec.encode(next))) writeDraftField(field, fieldValue);
    setInternal(next);
  }, [codec, enabled, writeDraftField]);
  const acceptSaved = useCallback((submitted: T) => {
    const accepted = codec.encode(submitted);
    setBaseline(accepted);
    const unchanged = equalDraft(codec.encode(current.current),accepted);
    if (unchanged) clearDraft();
    return unchanged;
  }, [clearDraft, codec]);
  return {value, setValue, isDirty, acceptSaved, restoredFromDraft: draft.restoredFromDraft, getCurrent: () => current.current};
}
