/**
 * ERP GLOBAL UI.4A — Workspace Foundation Types
 * Phase: ERP GLOBAL UI.4A
 *
 * SECURITY: Never store form field values, auth tokens, or sensitive business
 * data in WorkspaceTab. Route + display metadata only.
 */

export type WorkspaceTabKind =
  | "dashboard"
  | "list"
  | "record"
  | "settings"
  | "utility";

export type WorkspaceTab = {
  /** Stable unique ID for this tab instance (crypto.randomUUID) */
  id: string;
  /** Full pathname, e.g. "/admin/master-data/parties" */
  route: string;
  /** Human-readable tab title, e.g. "All Parties" */
  title: string;
  /** Optional sub-label shown below title or as small badge, e.g. record code */
  subtitle?: string;
  /** Lucide icon name string, e.g. "Building2" */
  icon?: string;
  /** Logical module grouping, e.g. "PARTY_MASTER" */
  moduleCode?: string;
  /** Entity type for record tabs, e.g. "party" */
  entityType?: string;
  /** Entity PK for record tabs — used to detect duplicate open */
  entityId?: number | string;
  /** True when associated form has unsaved changes — set by ERP GLOBAL UI.4B */
  dirty?: boolean;
  /** True when a child ERPChildDialogForm is open inside this tab */
  childDialogOpen?: boolean;
  /** Whether the tab can be closed (dashboard = false) */
  closable: boolean;
  /** Pinned tabs appear first and cannot be reordered */
  pinned?: boolean;
  /** Tab classification driving open/switch/singleton behavior */
  tabKind: WorkspaceTabKind;
  /** Add / edit / view — only relevant for record tabs (4C+) */
  formMode?: "add" | "edit" | "view";
  /** ISO timestamp when tab was opened */
  openedAt: string;
  /** ISO timestamp when tab was last made active */
  lastActiveAt: string;
};

/** Subset safe to persist to localStorage — no form values, no sensitive data */
export type PersistedWorkspaceTab = Pick<
  WorkspaceTab,
  | "id"
  | "route"
  | "title"
  | "subtitle"
  | "icon"
  | "tabKind"
  | "closable"
  | "pinned"
  | "moduleCode"
  | "entityType"
  | "entityId"
  | "openedAt"
  | "lastActiveAt"
>;

export type WorkspaceState = {
  tabs: WorkspaceTab[];
  activeTabId: string | null;
  /** True after localStorage restore has run on client */
  isHydrated: boolean;
  maxTabs: number;
};

export type WorkspaceAction =
  | { type: "OPEN_TAB"; tab: WorkspaceTab }
  | { type: "CLOSE_TAB"; tabId: string }
  | { type: "CLOSE_OTHER_TABS"; tabId: string }
  | { type: "CLOSE_ALL_CLOSABLE" }
  | { type: "SET_ACTIVE_TAB"; tabId: string }
  | { type: "MARK_DIRTY"; tabId: string; dirty: boolean }
  | { type: "MARK_CHILD_DIALOG_OPEN"; tabId: string; open: boolean }
  | { type: "RENAME_TAB"; tabId: string; title: string; subtitle?: string }
  /**
   * UPDATE_TAB_ROUTE — used after Add→Save to update a tab's route/entityId/formMode
   * without closing and re-opening the tab (ERP GLOBAL UI.4D).
   */
  | { type: "UPDATE_TAB_ROUTE"; tabId: string; route: string; entityId?: number | string; formMode?: "add" | "edit" | "view" }
  | { type: "RESTORE_TABS"; tabs: WorkspaceTab[]; activeTabId: string | null; defaultRoute?: string }
  | { type: "SYNC_ROUTE"; route: string; tab?: WorkspaceTab };
