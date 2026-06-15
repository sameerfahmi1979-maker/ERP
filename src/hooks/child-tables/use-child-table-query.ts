/**
 * Generic child-table TanStack Query helper.
 * Phase 002F.3E.3B.6G.4 — Generic Child Table Query / Invalidation Pattern
 *
 * Extracts the pattern proven by the Customer child sections (3B.6G.3) so
 * every parent-child module (Vendors, Subcontractors, Consultants,
 * Government Authorities, Recruitment Agencies, HR, Fleet, Workshop,
 * Inventory, Projects, …) defines its child hooks in a few lines instead of
 * copy-pasting query logic.
 *
 * Standard (ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md §4):
 *  - key: queryKeys.child.table(tableName, parentId) → ["child", table, id]
 *  - disabled until parentId exists (Add mode never fetches)
 *  - section lazy-mount remains the first gate; `enabled` is the second
 *  - mutations call invalidateChildTable(qc, tableName, parentId) — targeted
 *
 * Usage (new module):
 *   export function useVendorContactsQuery(
 *     vendorId: number | null | undefined,
 *     options: ChildTableQueryOptions = {}
 *   ) {
 *     return useChildTableQuery<VendorContact>({
 *       tableName: "vendor_contacts",
 *       parentId: vendorId,
 *       fetcher: getVendorContacts,
 *       errorLabel: "contacts",
 *       enabled: options.enabled,
 *     });
 *   }
 */

"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/query-keys";

/** Structural match for every module-level ActionResult<T> in the project. */
export interface ChildActionResult<TItem> {
  success: boolean;
  data?: TItem[];
  error?: string;
}

export interface ChildTableQueryOptions {
  enabled?: boolean;
}

export interface ChildTableQueryConfig<TItem> extends ChildTableQueryOptions {
  /** Physical child table name, e.g. "customer_contacts". Becomes the key segment. */
  tableName: string;
  /** Parent record id; null/undefined (Add mode) keeps the query disabled. */
  parentId: number | string | null | undefined;
  /** Existing server action fetching all child rows for the parent. */
  fetcher: (parentId: number) => Promise<ChildActionResult<TItem>>;
  /** Used in the fallback error message, e.g. "contacts". Defaults to "rows". */
  errorLabel?: string;
  /** Override defaults only when a table has special freshness needs. */
  staleTime?: number;
  gcTime?: number;
}

export interface ChildTableQueryResult<TItem> {
  /** Convenience alias for child table UIs. Same array as `data`. */
  items: TItem[];
  data: TItem[];
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Child-table cache configuration (updated 3B.6G.3B).
 *
 * staleTime 5 min — within a typical ERP work session the same customer
 * drawer is opened/closed repeatedly; 5 min avoids redundant server-action
 * round-trips without risking staleness in ERP data-entry workflows.
 *
 * gcTime 30 min — keeps the entry alive while the user navigates away
 * and returns to the same parent record.
 */
export const CHILD_TABLE_STALE_TIME = 5 * 60 * 1000;   // 5 min
export const CHILD_TABLE_GC_TIME = 30 * 60 * 1000;     // 30 min

export function useChildTableQuery<TItem>(
  config: ChildTableQueryConfig<TItem>
): ChildTableQueryResult<TItem> {
  const {
    tableName,
    parentId,
    fetcher,
    errorLabel = "rows",
    enabled = true,
    staleTime = CHILD_TABLE_STALE_TIME,
    gcTime = CHILD_TABLE_GC_TIME,
  } = config;

  const result = useQuery({
    queryKey: queryKeys.child.table(tableName, parentId),
    queryFn: async (): Promise<TItem[]> => {
      // parentId is guaranteed by `enabled`; numeric ids arrive as numbers.
      const res = await fetcher(parentId as number);
      if (!res.success || !res.data) {
        throw new Error(res.error ?? `Failed to load ${errorLabel}`);
      }
      return res.data;
    },
    enabled: !!parentId && enabled,
    staleTime,
    gcTime,
    refetchOnWindowFocus: false,
  });

  const items = result.data ?? [];

  return {
    items,
    data: items,
    isLoading: result.isLoading,
    isFetching: result.isFetching,
    error: result.error instanceof Error ? result.error.message : null,
    refetch: () => { void result.refetch(); },
  };
}
