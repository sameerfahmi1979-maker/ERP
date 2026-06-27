"use client";

import { useMemo, useState } from "react";

export type SortDir = "asc" | "desc";

export interface UseSortPaginateOptions<T> {
  /** Default number of rows per page. */
  defaultPageSize?: number;
  /** Initial sort key (string field name). */
  defaultSortKey?: string | null;
  /** Initial sort direction. */
  defaultSortDir?: SortDir;
  /**
   * Provide a function that turns a row into a searchable string.
   * When omitted, the search box is hidden / ineffective.
   */
  getSearchText?: (row: T) => string;
  /**
   * Custom comparator per sort key.
   * When a key is not listed here the hook falls back to natural comparison.
   */
  comparators?: Partial<Record<string, (a: T, b: T) => number>>;
}

export interface UseSortPaginateReturn<T> {
  rows: T[];
  total: number;
  totalFiltered: number;
  page: number;
  setPage: (p: number) => void;
  pageSize: number;
  setPageSize: (s: number) => void;
  totalPages: number;
  sortKey: string | null;
  sortDir: SortDir;
  toggleSort: (key: string) => void;
  query: string;
  setQuery: (q: string) => void;
  isSorted: (key: string) => boolean;
  sortDirFor: (key: string) => SortDir | null;
}

function naturalCompare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b);
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? -1 : 1;
  return String(a).localeCompare(String(b));
}

export function useSortPaginate<T>(
  data: T[],
  options: UseSortPaginateOptions<T> = {}
): UseSortPaginateReturn<T> {
  const {
    defaultPageSize = 25,
    defaultSortKey = null,
    defaultSortDir = "asc",
    getSearchText,
    comparators = {},
  } = options;

  const [page, setPageRaw] = useState(1);
  const [pageSize, setPageSizeRaw] = useState(defaultPageSize);
  const [sortKey, setSortKey] = useState<string | null>(defaultSortKey);
  const [sortDir, setSortDir] = useState<SortDir>(defaultSortDir);
  const [query, setQueryRaw] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !getSearchText) return data;
    return data.filter((row) => getSearchText(row).toLowerCase().includes(q));
  }, [data, query, getSearchText]);

  const sorted = useMemo(() => {
    if (!sortKey) return filtered;
    const custom = comparators[sortKey];
    return [...filtered].sort((a, b) => {
      const cmp = custom
        ? custom(a, b)
        : naturalCompare((a as Record<string, unknown>)[sortKey], (b as Record<string, unknown>)[sortKey]);
      return sortDir === "asc" ? cmp : -cmp;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sortKey, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, totalPages);

  const paged = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return sorted.slice(start, start + pageSize);
  }, [sorted, safePage, pageSize]);

  const setPage = (p: number) => setPageRaw(Math.max(1, Math.min(p, totalPages)));
  const setPageSize = (s: number) => { setPageSizeRaw(s); setPageRaw(1); };
  const setQuery = (q: string) => { setQueryRaw(q); setPageRaw(1); };
  const toggleSort = (key: string) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
    setPageRaw(1);
  };

  return {
    rows: paged,
    total: sorted.length,
    totalFiltered: filtered.length,
    page: safePage,
    setPage,
    pageSize,
    setPageSize,
    totalPages,
    sortKey,
    sortDir,
    toggleSort,
    query,
    setQuery,
    isSorted: (key) => sortKey === key,
    sortDirFor: (key) => (sortKey === key ? sortDir : null),
  };
}
