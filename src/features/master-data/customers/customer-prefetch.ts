/**
 * Customer parent-form runtime prefetch declaration.
 * Phase 002F.3E.3B.6G.1 — Global Parent Form Runtime Standard + Prefetch Utilities
 *
 * Declaration only — NOT wired into the Customer drawer yet.
 * 3B.6G.2 will consume this on drawer open via:
 *   prefetchLookupCategories(qc, CUSTOMER_FORM_PREFETCH.lookupCategories)
 *   prefetchMasterDataQueries(qc, CUSTOMER_FORM_PREFETCH.masterQueries)
 *
 * Category codes verified against live global_lookup_categories (all active).
 * Child-section codes (CONTACT_TYPES, ADDRESS_TYPES, BANK_ACCOUNT_TYPES,
 * COMMUNICATION_PREFERENCE_TYPES) are intentionally excluded: those sections
 * are lazy-mounted, so their LookupSelects fetch when the tab first opens.
 *
 * See: docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
 */

import { queryKeys } from "@/lib/query/query-keys";
import {
  fetchCountries,
  fetchCurrencies,
  fetchPaymentTerms,
  fetchTaxTypes,
} from "@/lib/lookups/master-data-fetchers";
import type { FormPrefetchDeclaration } from "@/lib/query/form-prefetch-types";

/** Lookup categories used by the Customer Basic/Commercial tabs (default-visible fields). */
export const CUSTOMER_LOOKUP_CATEGORIES = [
  "CUSTOMER_TYPES",
  "INDUSTRY_TYPES",
  "CUSTOMER_SEGMENTS",
  "CRM_LEAD_SOURCES",
  "PARTY_STATUS_TYPES",
  "ICV_STATUS_TYPES",
] as const;

export const CUSTOMER_FORM_PREFETCH = {
  formId: "customers",

  lookupCategories: CUSTOMER_LOOKUP_CATEGORIES,

  // Keys/fetchers identical to useCountriesQuery / useCurrenciesQuery /
  // usePaymentTermsQuery / useTaxTypesQuery defaults — prefetched entries are
  // read directly by those hooks.
  masterQueries: [
    { queryKey: queryKeys.countries(false, false), queryFn: () => fetchCountries(false, false) },
    { queryKey: queryKeys.currencies(false), queryFn: () => fetchCurrencies(false) },
    { queryKey: queryKeys.paymentTerms(false), queryFn: () => fetchPaymentTerms(false) },
    { queryKey: queryKeys.taxTypes(false), queryFn: () => fetchTaxTypes(false) },
  ],

  childTables: [
    { tableName: "customer_contacts", sectionId: "contacts" },
    { tableName: "customer_addresses", sectionId: "location" },
    { tableName: "customer_bank_details", sectionId: "finance" },
    { tableName: "customer_documents", sectionId: "documents" },
  ],
} as const satisfies FormPrefetchDeclaration;
