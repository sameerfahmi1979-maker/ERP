/**
 * Stable TanStack Query key factories for all ERP master-data and lookup queries.
 * Phase 002F.3E.3B.6B — Global Lookup Cache and Hook Standard
 *
 * Rules:
 *  - Keys are arrays of serialisable primitives (no objects at the leaf)
 *  - Outer segments are broad (used for invalidation prefix matching)
 *  - Inner segments narrow the specific query variant
 *  - Undefined/null dependencies become null so keys remain stable
 */

export const queryKeys = {
  // ── Lookup engine ──────────────────────────────────────────────────────────
  lookup: {
    /** Active lookup values for a single category */
    values: (
      categoryCode: string,
      parentValueCode: string | null | undefined = null,
      includeInactive = false
    ) =>
      [
        "lookup",
        "values",
        categoryCode.toUpperCase(),
        parentValueCode ?? null,
        includeInactive,
      ] as const,

    /** Batch lookup: multiple categories in one round-trip */
    batch: (categoryCodes: string[], includeInactive = false) =>
      [
        "lookup",
        "batch",
        [...categoryCodes].map((c) => c.toUpperCase()).sort(),
        includeInactive,
      ] as const,
  },

  // ── Geography ──────────────────────────────────────────────────────────────
  countries: (gccOnly = false, includeInactive = false) =>
    ["master", "countries", gccOnly, includeInactive] as const,

  emirates: (countryId: number | null | undefined = null, includeInactive = false) =>
    ["master", "emirates", countryId ?? null, includeInactive] as const,

  cities: (emirateId: number | null | undefined = null, includeInactive = false) =>
    ["master", "cities", emirateId ?? null, includeInactive] as const,

  areas: (cityId: number | null | undefined = null, includeInactive = false) =>
    ["master", "areas", cityId ?? null, includeInactive] as const,

  ports: (
    emirateId: number | null | undefined = null,
    portTypeCode: string | null | undefined = null,
    includeInactive = false
  ) =>
    ["master", "ports", emirateId ?? null, portTypeCode ?? null, includeInactive] as const,

  // ── Finance basics ─────────────────────────────────────────────────────────
  currencies: (includeInactive = false) =>
    ["master", "currencies", includeInactive] as const,

  banks: (countryId: number | null | undefined = null, includeInactive = false) =>
    ["master", "banks", countryId ?? null, includeInactive] as const,

  paymentTerms: (includeInactive = false) =>
    ["master", "payment_terms", includeInactive] as const,

  taxTypes: (includeInactive = false) =>
    ["master", "tax_types", includeInactive] as const,

  // ── Unit of measure ────────────────────────────────────────────────────────
  uomCategories: (includeInactive = false) =>
    ["master", "uom_categories", includeInactive] as const,

  unitsOfMeasure: (
    categoryId: number | null | undefined = null,
    includeInactive = false
  ) => ["master", "units_of_measure", categoryId ?? null, includeInactive] as const,

  // ── Organisation structure ─────────────────────────────────────────────────
  ownerCompanies: (includeInactive = false) =>
    ["master", "owner_companies", includeInactive] as const,

  branches: (
    ownerCompanyId: number | null | undefined = null,
    includeInactive = false
  ) => ["master", "branches", ownerCompanyId ?? null, includeInactive] as const,

  // ── Finance cost/profit centres ────────────────────────────────────────────
  costCenters: (
    ownerCompanyId: number | null | undefined = null,
    includeInactive = false
  ) => ["master", "cost_centers", ownerCompanyId ?? null, includeInactive] as const,

  profitCenters: (
    ownerCompanyId: number | null | undefined = null,
    includeInactive = false
  ) => ["master", "profit_centers", ownerCompanyId ?? null, includeInactive] as const,
};
