/**
 * TanStack Query cache invalidation utilities for ERP master-data.
 * Phase 002F.3E.3B.6B — Global Lookup Cache and Hook Standard
 *
 * Call these from server-action success handlers (e.g. after creating a new
 * country, currency, or lookup value) so all cached comboboxes refresh.
 *
 * Usage example — inside a client-side onSuccess callback:
 *   import { useQueryClient } from "@tanstack/react-query";
 *   import { invalidateLookupCategory } from "@/lib/query/invalidation";
 *   const qc = useQueryClient();
 *   invalidateLookupCategory(qc, "CUSTOMER_TYPES");
 */

import type { QueryClient } from "@tanstack/react-query";

// ── Lookup values ─────────────────────────────────────────────────────────────

/** Invalidate a single lookup category cache (all variant keys for that code). */
export function invalidateLookupCategory(
  queryClient: QueryClient,
  categoryCode: string
): void {
  queryClient.invalidateQueries({
    queryKey: ["lookup", "values", categoryCode.toUpperCase()],
  });
  // Also clear batch entries so any batch query that included this category refetches
  queryClient.invalidateQueries({ queryKey: ["lookup", "batch"] });
}

/** Invalidate all lookup value caches. */
export function invalidateAllLookups(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["lookup"] });
}

// ── Geography ─────────────────────────────────────────────────────────────────

export function invalidateCountries(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "countries"] });
}

export function invalidateEmirates(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "emirates"] });
}

export function invalidateCities(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "cities"] });
}

export function invalidateAreas(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "areas"] });
}

export function invalidatePorts(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "ports"] });
}

/** Invalidate all geography tables (countries → emirates → cities → areas → ports). */
export function invalidateGeography(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "countries"] });
  queryClient.invalidateQueries({ queryKey: ["master", "emirates"] });
  queryClient.invalidateQueries({ queryKey: ["master", "cities"] });
  queryClient.invalidateQueries({ queryKey: ["master", "areas"] });
  queryClient.invalidateQueries({ queryKey: ["master", "ports"] });
}

// ── Finance basics ────────────────────────────────────────────────────────────

export function invalidateCurrencies(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "currencies"] });
}

export function invalidateBanks(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "banks"] });
}

export function invalidatePaymentTerms(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "payment_terms"] });
}

export function invalidateTaxTypes(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "tax_types"] });
}

/** Invalidate all finance basics caches. */
export function invalidateFinanceBasics(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "currencies"] });
  queryClient.invalidateQueries({ queryKey: ["master", "banks"] });
  queryClient.invalidateQueries({ queryKey: ["master", "payment_terms"] });
  queryClient.invalidateQueries({ queryKey: ["master", "tax_types"] });
}

// ── Unit of measure ───────────────────────────────────────────────────────────

/** Invalidate UOM categories and unit lists. */
export function invalidateUom(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "uom_categories"] });
  queryClient.invalidateQueries({ queryKey: ["master", "units_of_measure"] });
}

// ── Organisation structure ────────────────────────────────────────────────────

/** Invalidate owner companies and branches. */
export function invalidateOrganizations(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "owner_companies"] });
  queryClient.invalidateQueries({ queryKey: ["master", "branches"] });
}

// ── Cost / profit centres ─────────────────────────────────────────────────────

export function invalidateCostCenters(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "cost_centers"] });
}

export function invalidateProfitCenters(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["master", "profit_centers"] });
}

// ── Child tables (Phase 3B.6G.1) ──────────────────────────────────────────────
// Targeted invalidation: a child mutation must refresh ONLY its own
// ["child", <table>, <parentId>] entry — never parent or master caches.

/** Invalidate one child table for one parent record. */
export function invalidateChildTable(
  queryClient: QueryClient,
  tableName: string,
  parentId: number | string | null | undefined
): void {
  queryClient.invalidateQueries({
    queryKey: ["child", tableName, parentId ?? null],
  });
}

/** Invalidate every cached child table (e.g. on logout / role switch). */
export function invalidateAllChildTables(queryClient: QueryClient): void {
  queryClient.invalidateQueries({ queryKey: ["child"] });
}

/**
 * Factory producing an entity-specific child invalidator (3B.6G.4).
 * Future modules generate their helpers in one line:
 *   export const invalidateVendorContacts = createChildInvalidator("vendor_contacts");
 */
export function createChildInvalidator(
  tableName: string
): (queryClient: QueryClient, parentId: number | string) => void {
  return (queryClient, parentId) =>
    invalidateChildTable(queryClient, tableName, parentId);
}

// Customer child helpers (reference implementation — consumed since 3B.6G.3)

export const invalidateCustomerContacts = createChildInvalidator("customer_contacts");
export const invalidateCustomerAddresses = createChildInvalidator("customer_addresses");
export const invalidateCustomerBankDetails = createChildInvalidator("customer_bank_details");
export const invalidateCustomerDocuments = createChildInvalidator("customer_documents");
