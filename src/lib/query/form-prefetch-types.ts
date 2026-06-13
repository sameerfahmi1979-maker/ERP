/**
 * Parent form runtime declaration types.
 * Phase 002F.3E.3B.6G.1 — Global Parent Form Runtime Standard + Prefetch Utilities
 *
 * Every parent form (Customer, Vendor, future HR/Fleet/Inventory modules)
 * declares its runtime plan as a `FormPrefetchDeclaration` constant:
 *
 *   - which lookup categories its default tab needs (batch-fetched once),
 *   - which master-data lists it needs (prefetched via TanStack Query),
 *   - which child tables it owns (lazy-fetched per tab activation).
 *
 * The declaration is data-only: it does not fetch anything by itself.
 * 3B.6G.2+ wires declarations into drawer-open prefetch.
 *
 * See: docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
 */

import type { QueryClient, QueryKey } from "@tanstack/react-query";

/** A prefetchable master-data list (countries, currencies, …). */
export interface MasterQueryDescriptor<TData = unknown> {
  /** Exact TanStack key the consuming hook reads — must come from `queryKeys`. */
  readonly queryKey: QueryKey;
  /** Shared fetcher (from `src/lib/lookups/master-data-fetchers.ts`). */
  readonly queryFn: () => Promise<TData>;
  /** Optional per-query staleTime override (ms). */
  readonly staleTime?: number;
}

/** A child table owned by the parent form (contacts, addresses, …). */
export interface ChildTableDescriptor {
  /** Physical table name, e.g. "customer_contacts". */
  readonly tableName: string;
  /** Drawer section/tab id that hosts this child table, e.g. "contacts". */
  readonly sectionId: string;
  /** Optional (3B.6G.4): FK column on the child table, e.g. "customer_id". */
  readonly parentKey?: string;
  /** Optional (3B.6G.4): key factory for this child, e.g. queryKeys.child.customerContacts. */
  readonly queryKey?: (parentId: number | string | null | undefined) => QueryKey;
  /** Optional (3B.6G.4): targeted invalidator, e.g. invalidateCustomerContacts. */
  readonly invalidate?: (queryClient: QueryClient, parentId: number | string) => void;
}

/** Full runtime plan for one parent form. Declare `as const satisfies FormPrefetchDeclaration`. */
export interface FormPrefetchDeclaration {
  /** Module identifier for reports/debugging, e.g. "customers". */
  readonly formId: string;
  /** Lookup category codes (UPPERCASE) needed by the default/basic tab. */
  readonly lookupCategories: readonly string[];
  /** Master-data lists needed by the default/basic tab. */
  readonly masterQueries: readonly MasterQueryDescriptor[];
  /** Child tables fetched lazily when their tab first opens. */
  readonly childTables: readonly ChildTableDescriptor[];
}
