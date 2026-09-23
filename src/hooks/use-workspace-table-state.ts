"use client";

/**
 * ERP GLOBAL UI.4E — useWorkspaceTableState
 *
 * Standardises and persists table UI state (search, filters, sorting,
 * pagination, column visibility) for workspace list screens.
 *
 * All currently implemented list/table screens that use ERPDataTable get
 * workspace session caching automatically via ERPDataTable's own extended
 * preferences system (UI.4E). This hook is provided as an optional wrapper
 * for screens that manage their own state outside ERPDataTable, or for future
 * modules that need fine-grained control over table state persistence.
 *
 * Usage:
 *   const {
 *     search, setSearch,
 *     sorting, setSorting,
 *     pagination, setPagination,
 *     columnVisibility, setColumnVisibility,
 *   } = useWorkspaceTableState({
 *     key: "parties-table",
 *     scope: "route",
 *     identifier: "/admin/master-data/parties",
 *   });
 */

import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";
import {
  buildPageStateKey,
  type WorkspacePageStateScope
} from "@/lib/workspace/workspace-page-state";
import type { SortingState, VisibilityState } from "@tanstack/react-table";
import { useCallback, useMemo } from "react";

interface PaginationState {
  pageIndex: number;
  pageSize: number;
}

interface UseWorkspaceTableStateOptions {
  key: string;
  initialSearch?: string;
  initialFilters?: Record<string, unknown>;
  initialSorting?: SortingState;
  initialPagination?: PaginationState;
  initialColumnVisibility?: VisibilityState;
  scope?: WorkspacePageStateScope;
  /** Route path or tab ID */
  identifier: string;
}

interface WorkspaceTableState {
  search: string;
  setSearch: (v: string) => void;
  filters: Record<string, unknown>;
  setFilters: (v: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)) => void;
  sorting: SortingState;
  setSorting: (v: SortingState) => void;
  pagination: PaginationState;
  setPagination: (v: PaginationState | ((prev: PaginationState) => PaginationState)) => void;
  columnVisibility: VisibilityState;
  setColumnVisibility: (v: VisibilityState) => void;
  resetTableState: () => void;
}

type StoredTableState = {
  search: string;
  filters: Record<string, unknown>;
  sorting: SortingState;
  pagination: PaginationState;
  columnVisibility: VisibilityState;
};

export function useWorkspaceTableState(
  options: UseWorkspaceTableStateOptions
): WorkspaceTableState {
  const {
    key,
    initialSearch = "",
    initialFilters = {},
    initialSorting = [],
    initialPagination = { pageIndex: 0, pageSize: 25 },
    initialColumnVisibility = {},
    scope = "route",
    identifier,
  } = options;

  const storageKey = useMemo(
    () => buildPageStateKey(scope, identifier, key),
    [scope, identifier, key]
  );

  const defaults: StoredTableState = useMemo(
    () => ({
      search: initialSearch,
      filters: initialFilters,
      sorting: initialSorting,
      pagination: initialPagination,
      columnVisibility: initialColumnVisibility,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const [tableState, setTableState] = usePersistentUiState(storageKey, defaults);

  const setSearch = useCallback(
    (v: string) => {
      setTableState((prev) => {
        const next = { ...prev, search: v };
        return next;
      });
    },
    [setTableState]
  );

  const setFilters = useCallback(
    (v: Record<string, unknown> | ((prev: Record<string, unknown>) => Record<string, unknown>)) => {
      setTableState((prev) => {
        const next = { ...prev, filters: typeof v === "function" ? v(prev.filters) : v };
        return next;
      });
    },
    [setTableState]
  );

  const setSorting = useCallback(
    (v: SortingState) => {
      setTableState((prev) => {
        const next = { ...prev, sorting: v };
        return next;
      });
    },
    [setTableState]
  );

  const setPagination = useCallback(
    (v: PaginationState | ((prev: PaginationState) => PaginationState)) => {
      setTableState((prev) => {
        const next = { ...prev, pagination: typeof v === "function" ? v(prev.pagination) : v };
        return next;
      });
    },
    [setTableState]
  );

  const setColumnVisibility = useCallback(
    (v: VisibilityState) => {
      setTableState((prev) => {
        const next = { ...prev, columnVisibility: v };
        return next;
      });
    },
    [setTableState]
  );

  const resetTableState = useCallback(() => {
    setTableState(defaults);
  }, [defaults, setTableState]);

  return {
    search: tableState.search,
    setSearch,
    filters: tableState.filters,
    setFilters,
    sorting: tableState.sorting,
    setSorting,
    pagination: tableState.pagination,
    setPagination,
    columnVisibility: tableState.columnVisibility,
    setColumnVisibility,
    resetTableState,
  };
}
