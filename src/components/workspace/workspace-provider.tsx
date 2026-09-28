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

import { UnsavedChangesDialog } from "@/components/erp/unsaved-changes-dialog";
import { useWorkspaceDraftStoreContext } from "@/components/workspace/workspace-draft-provider";
import {
  createTabFromRoute,
  isWorkspaceRoute,
} from "@/lib/workspace/workspace-route-registry";
import {
  getInitialState,
  MAX_TABS,
  persistToStorage,
  restoreFromStorage,
  workspaceReducer,
} from "@/lib/workspace/workspace-store";
import type { WorkspaceAction, WorkspaceState, WorkspaceTab } from "@/lib/workspace/workspace-types";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";

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
  isTabActive: (tabId: string) => boolean;
  closeOtherTabs: (tabId: string) => void;
  closeAllClosableTabs: () => void;
};

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

// ── Provider ──────────────────────────────────────────────────────────────────

export function WorkspaceProvider({ children, defaultRoute, principalId, canRestoreRoute }: {
  children: ReactNode; defaultRoute?: string; principalId?: string; canRestoreRoute?: (route: string) => boolean;
}) {
  const [state, setState] = useState(getInitialState);
  const stateRef = useRef(state);
  // Event-time state is authoritative even for callbacks captured before an await.
  const dispatch = useCallback((action: WorkspaceAction) => {
    const next = workspaceReducer(stateRef.current, action);
    stateRef.current = next;
    setState(next);
  }, []);
  const pathname = usePathname();
  const query = useSearchParams().toString();
  const route = query ? `${pathname}?${query}` : pathname;
  const router = useRouter();
  const prevPathname = useRef<string | null>(null);
  const isTabActive = useCallback((tabId: string) => stateRef.current.activeTabId === tabId, []);
  const navigationBlocked = useCallback(() => {
    if (!stateRef.current.tabs.some(tab => tab.id === stateRef.current.activeTabId && tab.childDialogOpen)) return false;
    toast.warning("Finish or close the open dialog, and wait for any save to finish before leaving this record.");
    return true;
  }, []);

  // Draft store — available when WorkspaceDraftProvider wraps this provider
  const draftStore = useWorkspaceDraftStoreContext();

  // ── Dirty close dialog state (4B) ─────────────────────────────────────────
  const [pendingCloseTabId, setPendingCloseTabId] = useState<string | null>(null);
  const [pendingBulk,setPendingBulk]=useState<{ids:string[];keep?:string}|null>(null);
  const pendingCloseTab = state.tabs.find((t) => t.id === pendingCloseTabId) ?? null;

  // ── Restore from localStorage on first client mount ────────────────────────
  useEffect(() => {
    const saved = restoreFromStorage(principalId);
    if (saved && canRestoreRoute) saved.tabs = saved.tabs.filter(tab => canRestoreRoute(tab.route));
    if (saved) {
      dispatch({ type: "RESTORE_TABS", tabs: saved.tabs, activeTabId: saved.activeTabId, defaultRoute });
    } else {
      // No saved state — create a tab for the current URL
      const tab = createTabFromRoute(route);
      dispatch({ type: "RESTORE_TABS", tabs: [tab], activeTabId: tab.id, defaultRoute });
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync active tab when pathname changes (browser back/forward, direct URL) ─
  useEffect(() => {
    if (!state.isHydrated) return;
    if (route === prevPathname.current) return;
    prevPathname.current = route;
    if (!isWorkspaceRoute(route)) return;
    const current = stateRef.current;
    const existing = current.tabs.find(tab => tab.route.split("?")[0] === pathname);
    if (existing) {
      dispatch({type:"SYNC_ROUTE", route});
    } else if (current.tabs.filter(tab => tab.closable).length >= MAX_TABS) {
      // A direct Link/Back navigation must not bypass admission or evict dirty work.
      toast.warning("Maximum workspace tabs reached. Close a tab before opening another screen.");
      const active = current.tabs.find(tab => tab.id === current.activeTabId);
      if (active) router.replace(active.route);
    } else {
      dispatch({type:"SYNC_ROUTE", route, tab:createTabFromRoute(route)});
    }
  }, [route, pathname, state.isHydrated, dispatch, router]);

  // ── Persist to localStorage after every state change ──────────────────────
  useEffect(() => {
    if (!state.isHydrated) return;
    persistToStorage(state.tabs, state.activeTabId, principalId);
  }, [state.tabs, state.activeTabId, state.isHydrated, principalId]);

  // ── Browser beforeunload warning when any tab is dirty (4B) ───────────────
  useEffect(() => {
    const hasDirty = state.tabs.some((t) => t.dirty || t.childDialogOpen);
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
      const tab = stateRef.current.tabs.find((t) => t.id === tabId);
      if (!tab || !tab.closable) return;

      // Clear all unsaved form drafts for this tab
      draftStore?.clearDraftsForTab(tabId);

      const wasActive = stateRef.current.activeTabId === tabId;
      dispatch({ type: "CLOSE_TAB", tabId });

      if (wasActive) {
        // Prefer an explicit returnRoute (e.g. a document opened from a Batch
        // Review Queue tab) over the "most recently active tab" heuristic —
        // the heuristic can pick the wrong tab if the user briefly visited
        // another screen (e.g. Upload Inbox) while reviewing.
        if (tab.returnRoute && isWorkspaceRoute(tab.returnRoute)) {
          router.push(tab.returnRoute);
          return;
        }

        const remaining = stateRef.current.tabs.filter((t) => t.id !== tabId);
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
    [dispatch, router, draftStore]
  );

  // ── openTab ────────────────────────────────────────────────────────────────
  const openTab = useCallback(
    (config: Partial<WorkspaceTab> & { route: string }) => {
      if (!isWorkspaceRoute(config.route)) return;
      if (navigationBlocked()) return;
      const current = stateRef.current;
      // For record tabs: deduplicate by entityId (same entity = switch, not duplicate).
      // For list/singleton tabs: deduplicate by exact route pathname.
      const configPath = config.route.split("?")[0];
      const existingForRoute = config.tabKind === "record" && config.entityId
        ? current.tabs.find((t) => t.entityType === config.entityType && t.entityId === config.entityId)
        : current.tabs.find((t) => t.route.split("?")[0] === configPath);
      if (existingForRoute) {
        dispatch({ type: "SYNC_ROUTE", route: config.route });
        router.push(config.route);
        return;
      }

      const closableCount = current.tabs.filter((t) => t.closable).length;
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
    [dispatch, router, navigationBlocked]
  );

  // ── closeTab — dirty-safe (4B) ─────────────────────────────────────────────
  const closeTab = useCallback(
    (tabId: string, opts?: { force?: boolean }) => {
      const tab = stateRef.current.tabs.find((t) => t.id === tabId);
      if (!tab || !tab.closable) return;
      if (tab.childDialogOpen && !opts?.force) { toast.warning("Finish or close this record's dialog and wait for its save before closing."); return; }

      if (tab.dirty && !opts?.force) {
        // Show confirmation dialog before closing
        setPendingCloseTabId(tabId);
      } else {
        doCloseTab(tabId);
      }
    },
    [doCloseTab]
  );

  // ── setActiveTab ───────────────────────────────────────────────────────────
  const setActiveTab = useCallback(
    (tabId: string) => {
      const tab = stateRef.current.tabs.find((t) => t.id === tabId);
      if (!tab) return;
      if (tabId !== stateRef.current.activeTabId && navigationBlocked()) return;
      dispatch({ type: "SET_ACTIVE_TAB", tabId });
      router.push(tab.route);
    },
    [dispatch, router, navigationBlocked]
  );

  // ── Dirty close dialog handlers ────────────────────────────────────────────
  const doBulkClose=useCallback((ids:string[],keep?:string)=>{
    for(const id of ids) {
      if(!stateRef.current.tabs.some(t=>t.id===id && t.closable)) continue;
      draftStore?.clearDraftsForTab(id);
      dispatch({type:"CLOSE_TAB",tabId:id});
    }
    if(keep && stateRef.current.tabs.some(t=>t.id===keep)) dispatch({type:"SET_ACTIVE_TAB",tabId:keep});
    const active=stateRef.current.tabs.find(t=>t.id===stateRef.current.activeTabId);
    if(active) router.push(active.route);
  },[dispatch,draftStore,router]);
  const requestBulkClose=useCallback((keep?:string)=>{
    if(keep && !stateRef.current.tabs.some(t=>t.id===keep)) return;
    const closing=stateRef.current.tabs.filter(t=>t.closable && t.id!==keep);
    if(closing.some(t=>t.childDialogOpen)) { toast.warning("Finish open dialogs and saves before closing workspace tabs."); return; }
    const ids=closing.map(t=>t.id);
    if(closing.some(t=>t.dirty)) setPendingBulk({ids,keep});
    else doBulkClose(ids,keep);
  },[doBulkClose]);
  const closeOtherTabs=useCallback((id:string)=>requestBulkClose(id),[requestBulkClose]);
  const closeAllClosableTabs=useCallback(()=>requestBulkClose(),[requestBulkClose]);
  const handleDirtyCloseStay = () => {
    setPendingCloseTabId(null);
    setPendingBulk(null);
  };

  const handleDirtyCloseDiscard = () => {
    if(pendingBulk) doBulkClose(pendingBulk.ids,pendingBulk.keep);
    setPendingBulk(null);
    if (pendingCloseTabId) {
      dispatch({ type: "MARK_DIRTY", tabId: pendingCloseTabId, dirty: false });
      doCloseTab(pendingCloseTabId);
    }
    setPendingCloseTabId(null);
  };

  return (
    <WorkspaceContext.Provider value={{ state, dispatch, openTab, closeTab, setActiveTab, isTabActive, closeOtherTabs, closeAllClosableTabs }}>
      {children}

      {/* Dirty tab close confirmation dialog (ERP GLOBAL UI.4B) */}
      <UnsavedChangesDialog
        open={!!pendingCloseTabId || !!pendingBulk}
        onOpenChange={(open) => { if (!open) handleDirtyCloseStay(); }}
        onStay={handleDirtyCloseStay}
        onDiscard={handleDirtyCloseDiscard}
        title={pendingBulk ? "Close workspace tabs?" : "Unsaved changes in this tab"}
        description={
          pendingBulk ? "Some tabs have unsaved changes. Closing these tabs will discard those changes." : pendingCloseTab
            ? `"${pendingCloseTab.title}" has unsaved changes. Closing this tab will discard those changes.`
            : "This tab has unsaved changes. Closing it will discard those changes."
        }
        stayLabel={pendingBulk ? "Keep tabs open" : "Stay on Tab"}
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
