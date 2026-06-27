"use client";

/**
 * ERP GLOBAL UI.4A — useWorkspace hook
 *
 * Primary API for components to interact with the workspace.
 * Sidebar, tab bar, and future record forms use this hook.
 */

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useWorkspaceContext } from "@/components/workspace/workspace-provider";
import { useWorkspaceDraftStoreContext } from "@/components/workspace/workspace-draft-provider";
import type { WorkspaceTab } from "@/lib/workspace/workspace-types";
import { DASHBOARD_ROUTE } from "@/lib/workspace/workspace-route-registry";

export type OpenTabOptions = Partial<WorkspaceTab> & { route: string };

export function useWorkspace() {
  const ctx = useWorkspaceContext();
  if (!ctx) {
    throw new Error("useWorkspace must be used inside WorkspaceProvider");
  }
  const { state, dispatch, openTab, closeTab, setActiveTab } = ctx;
  const draftStore = useWorkspaceDraftStoreContext();
  const router = useRouter();

  const activeTab = state.tabs.find((t) => t.id === state.activeTabId) ?? null;

  const markDirty = useCallback((tabId: string, dirty: boolean) => {
    dispatch({ type: "MARK_DIRTY", tabId, dirty });
  }, [dispatch]);

  const markChildDialogOpen = useCallback((tabId: string, open: boolean) => {
    dispatch({ type: "MARK_CHILD_DIALOG_OPEN", tabId, open });
  }, [dispatch]);

  const renameTab = useCallback((tabId: string, title: string, subtitle?: string) => {
    dispatch({ type: "RENAME_TAB", tabId, title, subtitle });
  }, [dispatch]);

  const updateTabRoute = useCallback((
    tabId: string,
    route: string,
    entityId?: number | string,
    formMode?: "add" | "edit" | "view"
  ) => {
    dispatch({ type: "UPDATE_TAB_ROUTE", tabId, route, entityId, formMode });
  }, [dispatch]);

  /**
   * Force-close the active tab immediately after a successful save.
   *
   * After save, `resetDirty()` schedules a React state update (async).
   * Calling the standard `closeTab` in the same tick still sees `dirty:true`
   * in the workspace store and shows the "Unsaved changes" dialog.
   * This helper bypasses the dirty guard because the data is already persisted.
   *
   * Usage — always call this (not `closeTab`) in save-success handlers:
   *   const ok = await handleSave();
   *   if (ok) forceCloseActiveTab();
   */
  const forceCloseActiveTab = useCallback(() => {
    if (activeTab) {
      closeTab(activeTab.id, { force: true });
    }
  }, [activeTab, closeTab]);

  const closeOtherTabs = useCallback((tabId: string) => {
    const closing = state.tabs.filter((t) => t.closable && t.id !== tabId);
    closing.forEach((t) => draftStore?.clearDraftsForTab(t.id));
    dispatch({ type: "CLOSE_OTHER_TABS", tabId });
  }, [state.tabs, draftStore, dispatch]);

  const closeAllClosableTabs = useCallback(() => {
    const closing = state.tabs.filter((t) => t.closable);
    closing.forEach((t) => draftStore?.clearDraftsForTab(t.id));
    dispatch({ type: "CLOSE_ALL_CLOSABLE" });
    // Navigate to the dashboard so the viewport reflects the now-active tab.
    router.push(DASHBOARD_ROUTE);
  }, [state.tabs, draftStore, dispatch, router]);

  return {
    /** All open tabs */
    tabs: state.tabs,
    /** The currently active tab */
    activeTab,
    /** True when localStorage restore has completed */
    isHydrated: state.isHydrated,
    /** Open or switch to a workspace tab */
    openTab,
    /**
     * Close a tab by ID (dirty-safe since ERP GLOBAL UI.4B).
     * If the tab has unsaved changes, shows UnsavedChangesDialog before closing.
     * Pass `{ force: true }` to bypass the dirty dialog (e.g. right after Save & Close).
     */
    closeTab,
    /** Alias for closeTab — dirty-safe close */
    requestCloseTab: closeTab,
    /** Set a tab as active and navigate to its route */
    setActiveTab,
    /** Mark a tab as dirty (has unsaved changes) */
    markDirty,
    /** Mark a tab's child dialog open state */
    markChildDialogOpen,
    /** Rename a tab's title/subtitle (e.g. after saving a new record) */
    renameTab,
    /** Update a tab's route/entityId/formMode without closing it (e.g. after Add→Save) */
    updateTabRoute,
    /** Close all tabs except the specified one */
    closeOtherTabs,
    /** Close all closable tabs */
    closeAllClosableTabs,
    /**
     * Force-close the active tab after a successful save.
     * Bypasses the dirty-state dialog because data is already persisted.
     * Always use this instead of closeTab() in save-success handlers.
     */
    forceCloseActiveTab,
  };
}
