"use client";

import { useCallback, useState } from "react";
import { useWorkspaceDraftStoreContext } from "@/components/workspace/workspace-draft-provider";
import { useWorkspaceFormOwner } from "./use-workspace-form-owner";

/** Memory view state is distinct from unsaved business input and cannot dirty a form. */
export function useWorkspaceFormSection(formId: string, initial: string, allowed: readonly string[]) {
  const owner = useWorkspaceFormOwner();
  const store = useWorkspaceDraftStoreContext();
  const key = owner ? `draft:tab:${owner.id}:section:${formId}` : null;
  const [section, setSection] = useState(() => {
    const saved = key ? store?.getViewState(key) : undefined;
    return saved && allowed.includes(saved) ? saved : initial;
  });
  const select = useCallback((next: string) => {
    if (!allowed.includes(next)) return;
    if (key) store?.setViewState(key, next);
    setSection(next);
  }, [allowed, key, store]);
  return [section, select] as const;
}
