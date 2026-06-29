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
} from "./workspace-route-registry";

export const MAX_TABS = 20;

const STORAGE_TABS_KEY = "algt_erp_workspace_tabs";
const STORAGE_ACTIVE_KEY = "algt_erp_workspace_active_tab";

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
      return {
        ...state,
        tabs: state.tabs.map((t) =>
          t.id === action.tabId
            ? {
                ...t,
                route: action.route,
                entityId: action.entityId ?? t.entityId,
                formMode: action.formMode ?? t.formMode,
              }
            : t
        ),
      };
    }

    case "RESTORE_TABS": {
      // Ensure dashboard always present
      const hasDash = action.tabs.some((t) => t.route === DASHBOARD_ROUTE);
      const dash = makeDashboardTab();
      const tabs = hasDash ? action.tabs : [dash, ...action.tabs];
      // Fix dashboard tab to always be non-closable pinned
      const fixedTabs = tabs.map((t) =>
        t.route === DASHBOARD_ROUTE
          ? { ...t, closable: false, pinned: true }
          : t
      );
      const activeTabId =
        action.activeTabId ?? fixedTabs[0]?.id ?? null;
      return {
        ...state,
        tabs: fixedTabs,
        activeTabId,
        isHydrated: true,
      };
    }

    case "SYNC_ROUTE": {
      const { route, tab: newTab } = action;
      // Compare by pathname only — usePathname() strips query params but tab routes may have them
      const incomingPath = route.split("?")[0];
      const existing = state.tabs.find((t) => t.route.split("?")[0] === incomingPath);
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
      // Create a new tab for this route
      if (newTab) {
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

export function persistToStorage(
  tabs: WorkspaceTab[],
  activeTabId: string | null
): void {
  try {
    const persisted: PersistedWorkspaceTab[] = tabs.map((t) => ({
      id: t.id,
      route: t.route,
      title: t.title,
      subtitle: t.subtitle,
      icon: t.icon,
      tabKind: t.tabKind,
      closable: t.closable,
      pinned: t.pinned,
      moduleCode: t.moduleCode,
      entityType: t.entityType,
      entityId: t.entityId,
      openedAt: t.openedAt,
      lastActiveAt: t.lastActiveAt,
    }));
    localStorage.setItem(STORAGE_TABS_KEY, JSON.stringify(persisted));
    localStorage.setItem(STORAGE_ACTIVE_KEY, activeTabId ?? "");
  } catch {
    // localStorage might be unavailable in some contexts — fail silently
  }
}

export function restoreFromStorage(): {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
} | null {
  try {
    const raw = localStorage.getItem(STORAGE_TABS_KEY);
    const activeId = localStorage.getItem(STORAGE_ACTIVE_KEY) || null;
    if (!raw) return null;
    const persisted = JSON.parse(raw) as PersistedWorkspaceTab[];
    if (!Array.isArray(persisted) || persisted.length === 0) return null;
    const tabs: WorkspaceTab[] = persisted.map((p) => ({
      ...p,
      dirty: false,
      childDialogOpen: false,
    }));
    return { tabs, activeTabId: activeId };
  } catch {
    return null;
  }
}
