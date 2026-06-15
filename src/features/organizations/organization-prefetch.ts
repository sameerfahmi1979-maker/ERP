/**
 * Organization parent-form runtime prefetch declaration.
 * Phase 002F.3E.3B.6G.5 — Apply Standard to Existing Forms / Future-Ready Modules
 *
 * Declaration only — NOT wired into the Organization form yet.
 * The Organization drawer uses CountrySelect, EmirateSelect, CitySelect,
 * AreaZoneSelect, and CurrencySelect — all TanStack-backed hooks that already
 * share cached data across the session (3B.6B).  There are no LookupSelect
 * fields (no global_lookup_values needed).
 *
 * Wiring 3B.6G.5+: wire ORGANIZATION_FORM_PREFETCH.masterQueries into a
 * client-component useEffect on the OrganizationsTable page-mount so the
 * comboboxes render instantly on first drawer open.
 *
 * See: docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
 */

import { queryKeys } from "@/lib/query/query-keys";
import {
  fetchCountries,
  fetchCurrencies,
} from "@/lib/lookups/master-data-fetchers";
import type { FormPrefetchDeclaration } from "@/lib/query/form-prefetch-types";

export const ORGANIZATION_FORM_PREFETCH = {
  formId: "organizations",

  // No global_lookup_values categories are needed — Organization form uses no LookupSelect.
  lookupCategories: [] as const,

  // Countries and currencies are the two slow-loading comboboxes in the
  // Organization drawer and benefit most from open-time prefetch.
  masterQueries: [
    { queryKey: queryKeys.countries(false, false), queryFn: () => fetchCountries(false, false) },
    { queryKey: queryKeys.currencies(false), queryFn: () => fetchCurrencies(false) },
  ],

  // Organization has no child CRUD tables; contacts/bank details are on sub-entities.
  childTables: [] as const,
} as const satisfies FormPrefetchDeclaration;
