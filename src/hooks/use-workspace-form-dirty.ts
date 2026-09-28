"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useWorkspaceDraftStoreContext } from "@/components/workspace/workspace-draft-provider";
import { buildWorkspaceDraftKey } from "@/lib/workspace/workspace-draft-types";
import { useFormDirty } from "./use-form-dirty";
import { useWorkspaceFormOwner } from "./use-workspace-form-owner";

const emptySubscribe = () => () => {};
const cleanSnapshot = () => false;

/** Includes custom controls that do not emit a native form change event. */
export function useWorkspaceFormDirty(options: { formId: string; enabled: boolean }) {
  const local = useFormDirty(options);
  const store = useWorkspaceDraftStoreContext();
  const owner = useWorkspaceFormOwner();
  const getSnapshot = useCallback(() =>
    Boolean(options.enabled && owner && store?.hasDraft(buildWorkspaceDraftKey({
      tabId: owner.id,
      formId: options.formId,
    }))), [options.enabled, options.formId, owner, store]
  );
  const draftDirty = useSyncExternalStore(store?.subscribe ?? emptySubscribe, getSnapshot, cleanSnapshot);
  return {
    isDirty: options.enabled && (local.isDirty || draftDirty),
    markDirty: local.markDirty,
    resetDirty: local.resetDirty,
  };
}
