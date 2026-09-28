"use client";

import { useCallback } from "react";
import { useWorkspace } from "./use-workspace";
import { useWorkspaceFormOwner } from "./use-workspace-form-owner";

/** Compatibility bridge for legacy forms: activeTab means this mounted form's owner. */
export function useWorkspaceFormNavigation() {
  const workspace = useWorkspace();
  const owner = useWorkspaceFormOwner();
  const closeTab = workspace.closeTab;
  const ownerId = owner?.id;
  const forceCloseActiveTab = useCallback(() => {
    if (ownerId) closeTab(ownerId, { force: true });
  }, [closeTab, ownerId]);
  return { ...workspace, activeTab: owner, forceCloseActiveTab };
}
