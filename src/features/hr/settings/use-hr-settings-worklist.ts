"use client";

import { useEffect, useRef, useState } from "react";
import type { ColumnFiltersState, PaginationState, SortingState, Updater } from "@tanstack/react-table";
import type { ERPTableServerRead } from "@/components/erp/table/erp-table-types";
import { HR_SETTINGS_FIRST_PAGE } from "@/lib/hr/settings-list";
import type { ActionResult, HrSettingsWorklistParams } from "@/server/actions/hr/settings";

type Criteria = { pagination: PaginationState; sorting: SortingState; filters: ColumnFiltersState; search: string };
type Page<T> = { data: T[]; total: number };
export type ListHrSettingsPage<T> = (input: HrSettingsWorklistParams) => Promise<ActionResult<Page<T>>>;
const initialCriteria: Criteria = {
  pagination: { pageIndex: 0, pageSize: HR_SETTINGS_FIRST_PAGE.page_size }, sorting: [], filters: [], search: "",
};
const resolve = <T,>(update: Updater<T>, previous: T) => typeof update === "function" ? (update as (value: T) => T)(previous) : update;

function readParams(criteria: Criteria, pagination = criteria.pagination): HrSettingsWorklistParams {
  return {
    page: pagination.pageIndex + 1, page_size: pagination.pageSize, tableSearch: criteria.search,
    sorting: criteria.sorting, columnFilters: Object.fromEntries(criteria.filters.map(({ id, value }) => [id, String(value)])),
  };
}

function verifyPage<T extends { id: number }>(result: ActionResult<Page<T>>, { pageIndex, pageSize }: PaginationState) {
  const page = result.data;
  if (!result.success || !page || !Number.isSafeInteger(page.total) || page.total < 0 || !Array.isArray(page.data) ||
      page.data.length !== Math.min(pageSize, Math.max(0, page.total - pageSize * pageIndex)) ||
      page.data.some(row => !Number.isSafeInteger(row?.id) || row.id < 1) ||
      new Set(page.data.map(row => row.id)).size !== page.data.length) throw Error("HR settings page could not be verified.");
  return page;
}

export function useHrSettingsWorklist<T extends { id: number }>(
  initialData: T[], initialTotal: number, onList: ListHrSettingsPage<T>, filters: ERPTableServerRead<T>["filters"],
) {
  const [criteria, setCriteria] = useState(initialCriteria);
  const [page, setPage] = useState<Page<T>>({ data: initialData, total: initialTotal });
  const [status, setStatus] = useState<"ready" | "loading" | "failed">("ready");
  const [current] = useState(() => ({ criteria: initialCriteria, sequence: 0, active: true }));
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => {
    current.active = true;
    return () => { current.active = false; current.sequence++; clearTimeout(timer.current); };
  }, [current]);

  function read(next: Criteria, debounce = false) {
    clearTimeout(timer.current);
    const sequence = ++current.sequence;
    current.criteria = next;
    setCriteria(next);
    setStatus("loading");
    const isCurrent = () => current.active && current.sequence === sequence;
    const load = async () => {
      if (!isCurrent()) return;
      try {
        const result = verifyPage(await onList(readParams(next)), next.pagination);
        if (!isCurrent()) return;
        const last = Math.max(0, Math.ceil(result.total / next.pagination.pageSize) - 1);
        if (next.pagination.pageIndex > last) {
          read({ ...next, pagination: { ...next.pagination, pageIndex: last } });
          return;
        }
        setPage(result);
        setStatus("ready");
      } catch {
        if (isCurrent()) setStatus("failed");
      }
    };
    if (debounce) timer.current = setTimeout(() => void load(), 250);
    else void load();
  }

  const reset = <K extends "sorting" | "filters" | "search",>(key: K, update: Updater<Criteria[K]>, debounce = false) => {
    const previous = current.criteria;
    read({ ...previous, [key]: resolve(update, previous[key]), pagination: { ...previous.pagination, pageIndex: 0 } }, debounce);
  };
  const serverRead: ERPTableServerRead<T> = {
    pagination: criteria.pagination, sorting: criteria.sorting, globalFilter: criteria.search,
    columnFilters: criteria.filters, totalCount: status === "ready" ? page.total : null, filters,
    onPaginationChange: update => {
      const previous = current.criteria;
      const pagination = resolve(update, previous.pagination);
      const next = pagination.pageSize === previous.pagination.pageSize ? pagination : { ...pagination, pageIndex: 0 };
      if (next.pageSize !== previous.pagination.pageSize || next.pageIndex !== previous.pagination.pageIndex) read({ ...previous, pagination: next });
    },
    onSortingChange: update => reset("sorting", update),
    onColumnFiltersChange: update => reset("filters", update),
    onGlobalFilterChange: update => reset("search", update, true),
    loadExportData: async () => {
      const sequence = current.sequence, selected = current.criteria;
      const ids = new Set<number>();
      const rows: T[] = [];
      let total: number | undefined;
      for (let pageIndex = 0; total === undefined || rows.length < total; pageIndex++) {
        const pagination = { pageIndex, pageSize: 100 };
        const next = verifyPage(await onList(readParams(selected, pagination)), pagination);
        total ??= next.total;
        if (!current.active || sequence !== current.sequence || total !== next.total) throw Error("HR settings export changed. Refresh and retry.");
        for (const row of next.data) {
          if (ids.has(row.id)) throw Error("HR settings export could not be verified.");
          ids.add(row.id);
          rows.push(row);
        }
      }
      return rows;
    },
  };
  return { rows: status === "ready" ? page.data : [], total: serverRead.totalCount, status, serverRead,
    refresh: () => read(current.criteria) };
}
