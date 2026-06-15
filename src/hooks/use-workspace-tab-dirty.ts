"use client";

/**
 * ERP GLOBAL UI.4B — useWorkspaceTabDirty
 *
 * Bridges a form's local isDirty boolean into the active workspace tab's
 * dirty state. Call this inside any form component that tracks useFormDirty.
 *
 * Design rules:
 * - Syncs isDirty → workspaceStore.markDirty(activeTabId) on every change.
 * - Does NOT auto-clear dirty on unmount: the workspace tab retains the
 *   dirty indicator until the user explicitly saves or discards. Clearing
 *   happens only when isDirty becomes false (after save or resetDirty).
 * - Safe outside WorkspaceProvider — uses null-safe context accessor.
 * - When `enabled = false` (e.g. view mode), dirty is always reported false.
 */

import { useEffect } from "react";
import { useWorkspaceContext } from "@/components/workspace/workspace-provider";

export type UseWorkspaceTabDirtyOptions = {
  /** The current form dirty state from useFormDirty or local state */
  isDirty: boolean;
  /** Set false in view mode or when tracking is disabled. Defaults to true. */
  enabled?: boolean;
  /**
   * Explicit tabId to mark dirty. If omitted, uses the currently active tab.
   * Provide this when the form renders inside a non-active tab to avoid
   * mis-tagging the wrong tab.
   */
  tabId?: string;
};

export function useWorkspaceTabDirty({
  isDirty,
  enabled = true,
  tabId,
}: UseWorkspaceTabDirtyOptions): void {
  // Null-safe: returns null when outside WorkspaceProvider
  const ctx = useWorkspaceContext();

  useEffect(() => {
    if (!ctx || !enabled) return;
    const targetId = tabId ?? ctx.state.tabs.find((t) => t.id === ctx.state.activeTabId)?.id;
    if (!targetId) return;
    ctx.dispatch({ type: "MARK_DIRTY", tabId: targetId, dirty: isDirty });
    // Intentionally NOT clearing on unmount — see hook doc above.
    // The form must call resetDirty() / save for the tab dot to clear.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDirty, enabled, tabId, ctx?.state.activeTabId]);
}
