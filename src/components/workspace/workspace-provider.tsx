"use client";

/**
 * ERP GLOBAL UI.4A/4B — WorkspaceProvider
 *
 * Provides the workspace state context to the entire app.
 * Handles:
 *  - localStorage restore on mount
 *  - Ensuring dashboard tab always exists
 *  - Syncing active tab on pathname change (browser back/forward)
 *  - Persisting tabs after every state change
 *  - Max-tab toast enforcement (4A)
 *  - Dirty tab close confirmation dialog (4B)
 *  - Browser beforeunload warning when any tab is dirty (4B)
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { toast } from "sonner";
import type { WorkspaceTab, WorkspaceState, WorkspaceAction } from "@/lib/workspace/workspace-types";
import {
  workspaceReducer,
  getInitialState,
  persistToStorage,
  restoreFromStorage,
  MAX_TABS,
} from "@/lib/workspace/workspace-store";
import {
  createTabFromRoute,
  isWorkspaceRoute,
} from "@/lib/workspace/workspace-route-registry";
import { UnsavedChangesDialog } from "@/components/erp/unsaved-changes-dialog";
import { useWorkspaceDraftStoreContext } from "@/components/workspace/workspace-draft-provider";

// ── Context ───────────────────────────────────────────────────────────────────

type WorkspaceContextValue = {
  state: WorkspaceState;
  dispatch: React.Dispatch<WorkspaceAction>;
  openTab: (tab: Partial<WorkspaceTab> & { route: string }) => void;
  /**
   * Request close — shows confirmation if tab is dirty, else closes immediately.
   * Pass `{ force: true }` to bypass the dirty dialog (e.g. right after Save & Close,
   * where the data is already persisted but the dirty flag may not have propagated yet).
   */
  closeTab: (tabId: string, opts?: { force?: boolean }) => void;
  setActiveTab: (tabId: string) => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function WorkspaceProvider({ children, defaultRoute }: { children: ReactNode; defaultRoute?: string }) {
  const [state, dispatch] = useReducer(workspaceReducer, undefined, getInitialState);
  const pathname = usePathname();
  const router = useRouter();
  const prevPathname = useRef<string | null>(null);

  // Draft store — available when WorkspaceDraftProvider wraps this provider
  const draftStore = useWorkspaceDraftStoreContext();

  // ── Dirty close dialog state (4B) ─────────────────────────────────────────
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null);
  const pendingCloseTab = state.tabs.find((t) => t.id === pendingCloseTabId) ?? null;

  // ── Restore from localStorage on first client mount ────────────────────────
  useEffect(() => {
    const saved = restoreFromStorage();
    if (saved) {
      dispatch({ type: "RESTORE_TABS", tabs: saved.tabs, activeTabId: saved.activeTabId });
    } else {
      // No saved state — create a tab for the current URL
      const tab = createTabFromRoute(pathname);
      dispatch({ type: "RESTORE_TABS", tabs: [tab], activeTabId: tab.id });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync active tab when pathname changes (browser back/forward, direct URL) ─
  useEffect(() => {
    if (!state.isHydrated) return;
    if (pathname === prevPathname.current) return;
    prevPathname.current = pathname;

    if (!isWorkspaceRoute(pathname)) return;

    // Compare by pathname only — tab routes may include ?mode=... query params
    const existing = state.tabs.find((t) => t.route.split("?")[0] === pathname);
    if (existing) {
      dispatch({ type: "SYNC_ROUTE", route: pathname });
    } else {
      const newTab = createTabFromRoute(pathname);
      dispatch({ type: "SYNC_ROUTE", route: pathname, tab: newTab });
    }
  }, [pathname, state.isHydrated]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Persist to localStorage after every state change ──────────────────────
  useEffect(() => {
    if (!state.isHydrated) return;
    persistToStorage(state.tabs, state.activeTabId);
  }, [state.tabs, state.activeTabId, state.isHydrated]);

  // ── Browser beforeunload warning when any tab is dirty (4B) ───────────────
  useEffect(() => {
    const hasDirty = state.tabs.some((t) => t.dirty);
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    if (hasDirty) {
      window.addEventListener("beforeunload", handler);
    } else {
      window.removeEventListener("beforeunload", handler);
    }
    return () => window.removeEventListener("beforeunload", handler);
  }, [state.tabs]);

  // ── Internal: actually close tab and navigate ──────────────────────────────
  const doCloseTab = useCallback(
    (tabId: string) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab || !tab.closable) return;

      // Clear all unsaved form drafts for this tab
      draftStore?.clearDraftsForTab(tabId);

      const wasActive = state.activeTabId === tabId;
      dispatch({ type: "CLOSE_TAB", tabId });

      if (wasActive) {
        // Prefer an explicit returnRoute (e.g. a document opened from a Batch
        // Review Queue tab) over the "most recently active tab" heuristic —
        // the heuristic can pick the wrong tab if the user briefly visited
        // another screen (e.g. Upload Inbox) while reviewing.
        if (tab.returnRoute) {
          router.push(tab.returnRoute);
          return;
        }

        const remaining = state.tabs.filter((t) => t.id !== tabId);
        if (remaining.length > 0) {
          const sorted = [...remaining].sort(
            (a, b) =>
              new Date(b.lastActiveAt).getTime() -
              new Date(a.lastActiveAt).getTime()
          );
          router.push(sorted[0].route);
        }
      }
    },
    [state.tabs, state.activeTabId, router]
  );

  // ── openTab ────────────────────────────────────────────────────────────────
  const openTab = useCallback(
    (config: Partial<WorkspaceTab> & { route: string }) => {
      // For record tabs: deduplicate by entityId (same entity = switch, not duplicate).
      // For list/singleton tabs: deduplicate by exact route pathname.
      const configPath = config.route.split("?")[0];
      const existingForRoute = config.tabKind === "record" && config.entityId
        ? state.tabs.find((t) => t.entityType === config.entityType && t.entityId === config.entityId)
        : state.tabs.find((t) => t.route.split("?")[0] === configPath);
      if (existingForRoute) {
        dispatch({ type: "SET_ACTIVE_TAB", tabId: existingForRoute.id });
        router.push(config.route);
        return;
      }

      const closableCount = state.tabs.filter((t) => t.closable).length;
      if (closableCount >= MAX_TABS) {
        toast.warning("Maximum workspace tabs reached. Close a tab before opening another screen.");
        return;
      }

      const now = new Date().toISOString();
      const base = createTabFromRoute(config.route);
      const newTab: WorkspaceTab = {
        ...base,
        ...config,
        id: crypto.randomUUID(),
        openedAt: now,
        lastActiveAt: now,
        closable: config.closable ?? base.closable,
      };

      dispatch({ type: "OPEN_TAB", tab: newTab });
      router.push(config.route);
    },
    [state.tabs, router]
  );

  // ── closeTab — dirty-safe (4B) ─────────────────────────────────────────────
  const closeTab = useCallback(
    (tabId: string, opts?: { force?: boolean }) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab || !tab.closable) return;

      if (tab.dirty && !opts?.force) {
        // Show confirmation dialog before closing
        setPendingCloseTabId(tabId);
      } else {
        doCloseTab(tabId);
      }
    },
    [state.tabs, doCloseTab]
  );

  // ── setActiveTab ───────────────────────────────────────────────────────────
  const setActiveTab = useCallback(
    (tabId: string) => {
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      dispatch({ type: "SET_ACTIVE_TAB", tabId });
      router.push(tab.route);
    },
    [state.tabs, router]
  );

  // ── Dirty close dialog handlers ────────────────────────────────────────────
  const handleDirtyCloseStay = () => {
    setPendingCloseTabId(null);
  };

  const handleDirtyCloseDiscard = () => {
    if (pendingCloseTabId) {
      dispatch({ type: "MARK_DIRTY", tabId: pendingCloseTabId, dirty: false });
      doCloseTab(pendingCloseTabId);
    }
    setPendingCloseTabId(null);
  };

  return (
    <WorkspaceContext.Provider value={{ state, dispatch, openTab, closeTab, setActiveTab }}>
      {children}

      {/* Dirty tab close confirmation dialog (ERP GLOBAL UI.4B) */}
      <UnsavedChangesDialog
        open={!!pendingCloseTabId}
        onOpenChange={(open) => { if (!open) setPendingCloseTabId(null); }}
        onStay={handleDirtyCloseStay}
        onDiscard={handleDirtyCloseDiscard}
        title="Unsaved changes in this tab"
        description={
          pendingCloseTab
            ? `"${pendingCloseTab.title}" has unsaved changes. Closing this tab will discard those changes.`
            : "This tab has unsaved changes. Closing it will discard those changes."
        }
        stayLabel="Stay on Tab"
        discardLabel="Discard Changes"
      />
    </WorkspaceContext.Provider>
  );
}

// ── Consumer hook ─────────────────────────────────────────────────────────────

/**
 * Returns the workspace context, or null if used outside WorkspaceProvider.
 * Components that must have the context (tab bar, sidebar) should assert non-null.
 * Components that are optionally workspace-aware (ERPDrawerForm) use the null guard.
 */
export function useWorkspaceContext(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext);
}
