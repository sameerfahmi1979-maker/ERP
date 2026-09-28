/**
 * ERP GLOBAL UI.4A — Workspace Store (React context + useReducer)
 *
 * Manages all open workspace tabs, active tab, and localStorage persistence.
 * Built with React context + useReducer — no external state library needed.
 *
 * localStorage keys:
 *   algt_erp_workspace_tabs        — PersistedWorkspaceTab[]
 *   algt_erp_workspace_active_tab  — string (tabId)
 */

import type {
  WorkspaceState,
  WorkspaceAction,
  WorkspaceTab,
  PersistedWorkspaceTab,
} from "./workspace-types";
import {
  createTabFromRoute,
  DASHBOARD_ROUTE,
  isWorkspaceRoute,
  safePersistedWorkspaceRoute,
} from "./workspace-route-registry";

// WORKSPACE.PERF.1 (D1): restored to 10 per the workspace tabs standard.
// Users with more persisted tabs keep them until closed — only opening NEW
// tabs is blocked at the limit (never silently close existing tabs).
export const MAX_TABS = 10;

const MANIFEST_PREFIX = "algt_erp_workspace_manifest:v5:";
function manifestKey(principalId?: string): string | null {
  return principalId && /^[a-zA-Z0-9-]{1,128}$/.test(principalId) ? MANIFEST_PREFIX + principalId : null;
}

// ── Initial state ─────────────────────────────────────────────────────────────

function makeDashboardTab(): WorkspaceTab {
  return createTabFromRoute(DASHBOARD_ROUTE);
}

export function getInitialState(): WorkspaceState {
  return {
    tabs: [makeDashboardTab()],
    activeTabId: null,
    isHydrated: false,
    maxTabs: MAX_TABS,
  };
}

// ── Reducer ───────────────────────────────────────────────────────────────────

export function workspaceReducer(
  state: WorkspaceState,
  action: WorkspaceAction
): WorkspaceState {
  switch (action.type) {
    case "OPEN_TAB": {
      const { tab } = action;
      if (!isWorkspaceRoute(tab.route)) return state;
      // Singleton check: if a tab with this route already exists, just activate it
      const isSingleton =
        tab.tabKind !== "record" ||
        (tab.tabKind === "record" && !tab.entityId);
      const existing = state.tabs.find(
        (t) =>
          t.route === tab.route &&
          (isSingleton || t.entityId === tab.entityId)
      );
      if (existing) {
        return {
          ...state,
          activeTabId: existing.id,
          tabs: state.tabs.map((t) =>
            t.id === existing.id
              ? { ...t, lastActiveAt: new Date().toISOString() }
              : t
          ),
        };
      }

      // Max tabs check (dashboard + closable tabs)
      const closableCount = state.tabs.filter((t) => t.closable).length;
      if (closableCount >= state.maxTabs) {
        // Caller (WorkspaceProvider) shows toast — reducer just returns unchanged
        return { ...state, _maxTabsBlocked: true } as WorkspaceState & {
          _maxTabsBlocked?: boolean;
        };
      }

      return {
        ...state,
        tabs: [...state.tabs, tab],
        activeTabId: tab.id,
      };
    }

    case "CLOSE_TAB": {
      const { tabId } = action;
      const tab = state.tabs.find((t) => t.id === tabId);
      if (!tab || !tab.closable) return state;

      const remaining = state.tabs.filter((t) => t.id !== tabId);
      if (remaining.length === 0) {
        // Should never happen (dashboard is pinned) but guard anyway
        const dash = makeDashboardTab();
        return { ...state, tabs: [dash], activeTabId: dash.id };
      }

      let newActiveId = state.activeTabId;
      if (state.activeTabId === tabId) {
        // Activate the tab that was most recently active before this one
        const sorted = [...remaining].sort(
          (a, b) =>
            new Date(b.lastActiveAt).getTime() -
            new Date(a.lastActiveAt).getTime()
        );
        newActiveId = sorted[0].id;
      }

      return { ...state, tabs: remaining, activeTabId: newActiveId };
    }

    case "CLOSE_OTHER_TABS": {
      if (!state.tabs.some(tab => tab.id === action.tabId)) return state;
      const kept = state.tabs.filter(
        (t) => !t.closable || t.id === action.tabId
      );
      return { ...state, tabs: kept, activeTabId: action.tabId };
    }

    case "CLOSE_ALL_CLOSABLE": {
      const kept = state.tabs.filter((t) => !t.closable);
      const newActiveId = kept.length > 0 ? kept[kept.length - 1].id : null;
      return { ...state, tabs: kept, activeTabId: newActiveId };
    }

    case "SET_ACTIVE_TAB": {
      if (!state.tabs.some(tab => tab.id === action.tabId)) return state;
      return {
        ...state,
        activeTabId: action.tabId,
        tabs: state.tabs.map((t) =>
          t.id === action.tabId
            ? { ...t, lastActiveAt: new Date().toISOString() }
            : t
        ),
      };
    }

    case "MARK_DIRTY": {
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.tabId ? { ...t, dirty: action.dirty } : t
        ),
      };
    }

    case "MARK_CHILD_DIALOG_OPEN": {
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.tabId
            ? { ...t, childDialogOpen: action.open }
            : t
        ),
      };
    }

    case "RENAME_TAB": {
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.tabId
            ? { ...t, title: action.title, subtitle: action.subtitle }
            : t
        ),
      };
    }

    case "UPDATE_TAB_ROUTE": {
      if (!isWorkspaceRoute(action.route)) return state;
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.tabId
            ? {
                ...t,
                route: action.route,
                // A created record is no longer a "New" tab. Keep manually named existing records intact.
                title: t.formMode === "add" && action.formMode !== "add"
                  ? createTabFromRoute(action.route).title : t.title,
                entityId: action.entityId ?? t.entityId,
                formMode: action.formMode ?? t.formMode,
              }
            : t
        ),
      };
    }

    case "RESTORE_TABS": {
      // ERP USERS.4 — Use defaultRoute (from server permissions) or fall back to Dashboard.
      // This ensures users without dashboard.view don't get a pinned inaccessible tab.
      const homeRoute = action.defaultRoute ?? DASHBOARD_ROUTE;
      const hasPinned = action.tabs.some((t) => t.route === homeRoute);
      const homeTile = createTabFromRoute(homeRoute);
      const tabs = hasPinned ? action.tabs : [homeTile, ...action.tabs];
      // Ensure home tab is always non-closable and pinned
      const fixedTabs = tabs.map((t) =>
        t.route === homeRoute
          ? { ...t, closable: false, pinned: true }
          : { ...t, closable: true, pinned: false }
      );
      const activeTabId = fixedTabs.some(tab => tab.id === action.activeTabId)
        ? action.activeTabId : fixedTabs[0]?.id ?? null;
      return {
        ...state,
        tabs: fixedTabs,
        activeTabId,
        isHydrated: true,
      };
    }

    case "SYNC_ROUTE": {
      const { route, tab: newTab } = action;
      if (!isWorkspaceRoute(route)) return state;
      // Compare by pathname only — usePathname() strips query params but tab routes may have them
      const incomingPath = route.split("?")[0];
      const existing = state.tabs.find((t) => t.route.split("?")[0] === incomingPath);
      if (existing) {
        return {
          ...state,
          activeTabId: existing.id,
          tabs: state.tabs.map((t) =>
            t.id === existing.id
              ? { ...t, route, formMode: new URLSearchParams(route.split("?")[1]).get("mode") === "edit" ? "edit" : "view", lastActiveAt: new Date().toISOString() }
              : t
          ),
        };
      }
      // Create a new tab for this route
      if (newTab && state.tabs.filter(tab => tab.closable).length < state.maxTabs) {
        return {
          ...state,
          tabs: [...state.tabs, newTab],
          activeTabId: newTab.id,
        };
      }
      return state;
    }

    default:
      return state;
  }
}

// ── localStorage helpers ──────────────────────────────────────────────────────

export function persistToStorage(tabs: WorkspaceTab[], activeTabId: string | null, principalId?: string): void {
  const key = manifestKey(principalId);
  if (!key) return; // No identity means no durable restore, never a shared fallback.
  try {
    const persisted: PersistedWorkspaceTab[] = tabs.flatMap(tab => {
      const route = safePersistedWorkspaceRoute(tab.route);
      if (!route) return [];
      const returnRoute = tab.returnRoute ? safePersistedWorkspaceRoute(tab.returnRoute) : null;
      return [{id:tab.id, route, openedAt:tab.openedAt, lastActiveAt:tab.lastActiveAt, ...(returnRoute ? {returnRoute} : {})}];
    }).slice(0, MAX_TABS + 1);
    localStorage.setItem(key, JSON.stringify({
      version:5, principalId, tabs:persisted,
      activeTabId:persisted.some(tab => tab.id === activeTabId) ? activeTabId : null,
    }));
  } catch { /* Storage can be disabled; working memory remains available. */ }
}

export function restoreFromStorage(principalId?: string): {tabs:WorkspaceTab[];activeTabId:string|null} | null {
  try {
    // Retire only the three obsolete tab-manifest keys, not unrelated browser data.
    for (const key of ["algt_erp_workspace_tabs","algt_erp_workspace_active_tab","algt_erp_workspace_version"]) localStorage.removeItem(key);
    const key = manifestKey(principalId);
    if (!key) return null;
    const raw = localStorage.getItem(key);
    if (!raw || raw.length > 100000) return null;
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object") return null;
    const manifest = data as Record<string, unknown>;
    if (manifest.version !== 5 || manifest.principalId !== principalId || !Array.isArray(manifest.tabs) || manifest.tabs.length > MAX_TABS + 1) return null;
    const tabs: WorkspaceTab[] = [];
    const ids = new Set<string>(), routes = new Set<string>();
    for (const item of manifest.tabs) {
      if (!item || typeof item !== "object") return null;
      const entry = item as Record<string, unknown>;
      if (typeof entry.id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(entry.id) || ids.has(entry.id)
        || typeof entry.route !== "string") return null;
      const route = safePersistedWorkspaceRoute(entry.route);
      if (!route || route !== entry.route || routes.has(route.split("?")[0])) return null;
      if (typeof entry.openedAt !== "string" || !Number.isFinite(Date.parse(entry.openedAt))
        || typeof entry.lastActiveAt !== "string" || !Number.isFinite(Date.parse(entry.lastActiveAt))) return null;
      const returnRoute = typeof entry.returnRoute === "string" ? safePersistedWorkspaceRoute(entry.returnRoute) : null;
      // Display text, pinning and permissions are derived again, never trusted from storage.
      tabs.push({...createTabFromRoute(route), id:entry.id, openedAt:entry.openedAt,
        lastActiveAt:entry.lastActiveAt, dirty:false, childDialogOpen:false, ...(returnRoute ? {returnRoute} : {})});
      ids.add(entry.id); routes.add(route.split("?")[0]);
    }
    return tabs.length ? {tabs,activeTabId:typeof manifest.activeTabId === "string" && ids.has(manifest.activeTabId) ? manifest.activeTabId : null} : null;
  } catch { return null; }
}
