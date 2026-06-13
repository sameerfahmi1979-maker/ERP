/**
 * Branch parent-form runtime prefetch declaration.
 * Phase 002F.3E.3B.6G.5 — Apply Standard to Existing Forms / Future-Ready Modules
 *
 * Declaration only — NOT wired into the Branch form yet.
 * The Branch drawer uses CountrySelect, EmirateSelect, CitySelect, and
 * AreaZoneSelect — all TanStack-backed hooks (3B.6B).  No LookupSelect fields.
 *
 * Unlike Organization the Branch form does NOT use CurrencySelect, so only
 * countries need warming.
 *
 * Wiring 3B.6G.5+: wire BRANCH_FORM_PREFETCH.masterQueries into a
 * client-component useEffect on the BranchesTable page-mount.
 *
 * See: docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
 */

import { queryKeys } from "@/lib/query/query-keys";
import { fetchCountries } from "@/lib/lookups/master-data-fetchers";
import type { FormPrefetchDeclaration } from "@/lib/query/form-prefetch-types";

export const BRANCH_FORM_PREFETCH = {
  formId: "branches",

  lookupCategories: [] as const,

  masterQueries: [
    { queryKey: queryKeys.countries(false, false), queryFn: () => fetchCountries(false, false) },
  ],

  childTables: [] as const,
} as const satisfies FormPrefetchDeclaration;
