"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { ColumnFiltersState, PaginationState, SortingState, Updater } from "@tanstack/react-table";
import type { ERPTableServerRead } from "@/components/erp/table/erp-table-types";
import { usePersistentUiState } from "@/hooks/use-persistent-ui-state";
import { getPartyCatalogueExport, getPartyCataloguePage } from "@/server/actions/master-data/parties";
import { partyCatalogueColumns, partyCataloguePageSize, type PartyCataloguePage, type PartyCatalogueRow } from "./party-catalogue";

type View = { pagination: PaginationState; sorting: SortingState; filters: ColumnFiltersState; search: string };
const firstView: View = { pagination: { pageIndex: 0, pageSize: partyCataloguePageSize }, sorting: [], filters: [], search: "" };
const noRows: PartyCatalogueRow[] = [];
const filters: ERPTableServerRead<PartyCatalogueRow>["filters"] = Object.entries(partyCatalogueColumns).map(([id, label]) => ({ id, label, type: "text" }));
const apply = <T,>(change: Updater<T>, previous: T): T => typeof change === "function" ? (change as (value: T) => T)(previous) : change;
const params = (view: View, typeCode?: string) => ({
  typeCode, search: view.search, sorting: view.sorting, filters: view.filters,
  locale: view.filters.length ? Intl.DateTimeFormat().resolvedOptions().locale : undefined,
});

export function usePartyCatalogue(initialPage: PartyCataloguePage, typeCode?: string, principal?: number) {
  const [view, setView] = usePersistentUiState(`party-catalogue:${principal}:${typeCode ?? "all"}`, firstView);
  const [changed, setChanged] = useState(false);
  const [refreshId, setRefreshId] = useState(0);
  const [selectionScope, setSelectionScope] = useState(0);
  const request = useMemo(() => ({ view, initialPage, refreshId, typeCode }), [view, initialPage, refreshId, typeCode]);
  const [response, setResponse] = useState<{ request: typeof request; page?: PartyCataloguePage }>();
  const current = useRef({ epoch: 0, exportEpoch: 0, search: view.search });
  const useInitial = !changed && !view.search && !view.filters.length && !view.sorting.length &&
    view.pagination.pageIndex === 0 && view.pagination.pageSize === partyCataloguePageSize;
  const page = useInitial ? initialPage : response?.request === request ? response.page : undefined;
  const failed = !useInitial && response?.request === request && !page;
  const pending = !page && !failed;

  useEffect(() => {
    if (useInitial) return;
    let active = true;
    const scope = current.current;
    const epoch = ++scope.epoch;
    const delay = view.search === scope.search ? 0 : 250;
    scope.search = view.search;
    const timer = setTimeout(async () => {
      try {
        const result = await getPartyCataloguePage({ ...params(view, typeCode), ...view.pagination });
        if (!active || scope.epoch !== epoch) return;
        if (!result.success || !result.data) throw Error("Party list unavailable");
        const last = Math.max(0, Math.ceil(result.data.totalCount / view.pagination.pageSize) - 1);
        if (last < view.pagination.pageIndex) {
          setView(previous => ({ ...previous, pagination: { ...previous.pagination, pageIndex: last } }));
          return;
        }
        setResponse({ request, page: result.data });
      } catch {
        if (active && scope.epoch === epoch) setResponse({ request });
      }
    }, delay);
    return () => { active = false; clearTimeout(timer); scope.epoch++; };
  }, [request, setView, typeCode, useInitial, view]);

  // Retire output prepared for a remounted principal, route or source refresh.
  useEffect(() => {
    const scope = current.current;
    return () => { scope.epoch++; };
  }, [request]);

  function update<K extends keyof View>(key: K, change: Updater<View[K]>) {
    current.current.epoch++;
    setChanged(true);
    setView(previous => ({
      ...previous,
      pagination: { ...previous.pagination, pageIndex: 0 },
      [key]: apply(change, previous[key]),
    }));
  }

  async function loadExport(ids?: string[]) {
    const scope = current.current, epoch = scope.epoch;
    const exportEpoch = scope.exportEpoch;
    if (!page) throw Error("Party list unavailable");
    const result = await getPartyCatalogueExport({ ...params(view, typeCode), selectedIds: ids?.map(Number) });
    if (scope.epoch !== epoch || scope.exportEpoch !== exportEpoch || !result.success || !result.data || result.data.length !== (ids?.length ?? page.totalCount)) {
      throw Error("The full authorized Party result changed. Refresh and retry.");
    }
    return result.data;
  }

  const serverRead: ERPTableServerRead<PartyCatalogueRow> = {
    pagination: view.pagination,
    sorting: view.sorting,
    columnFilters: view.filters,
    globalFilter: view.search,
    totalCount: page?.totalCount ?? null,
    filters,
    onPaginationChange: change => {
      const next = apply(change, view.pagination);
      if (next.pageIndex !== view.pagination.pageIndex || next.pageSize !== view.pagination.pageSize) update("pagination", change);
    },
    onSortingChange: change => update("sorting", change),
    onColumnFiltersChange: change => update("filters", change),
    onGlobalFilterChange: change => update("search", change),
    loadExportData: () => loadExport(),
    exportSelection: { scope: selectionScope, load: loadExport },
    completeLegacyEmail: true,
    exportScope: JSON.stringify([view.search, view.filters, view.sorting, selectionScope, principal, typeCode]),
  };

  return {
    rows: page?.rows ?? noRows,
    serverRead,
    sortAscendingFirst: page?.sortAscendingFirst ?? initialPage.sortAscendingFirst,
    pending,
    failed,
    retireSelection: () => { current.current.exportEpoch++; setSelectionScope(id => id + 1); },
    retry: () => { current.current.epoch++; setChanged(true); setRefreshId(id => id + 1); },
  };
}
