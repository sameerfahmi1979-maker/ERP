/**
 * Future party-master module prefetch declaration templates.
 * Phase 002F.3E.3B.6G.5 — Apply Standard to Existing Forms / Future-Ready Modules
 *
 * These are TEMPLATES, not active runtime declarations.  They are NOT imported
 * by any component or page yet.  When a new party-master module is built
 * (Vendor, Subcontractor, Consultant, Government Authority, Recruitment Agency)
 * its implementation engineer should:
 *
 *   1. Copy the relevant template constant into the new module's own
 *      `<module>-prefetch.ts` file (e.g. `src/features/master-data/vendors/vendor-prefetch.ts`).
 *   2. Verify the lookup category codes against the live global_lookup_categories table.
 *   3. Add any module-specific lookup categories found in the actual form.
 *   4. Wire the declaration into the module's table/list page-mount prefetch
 *      (same pattern as `useCustomerFormPrefetch` in 3B.6G.2).
 *
 * Lookup categories verified against live Supabase global_lookup_categories:
 *   VENDOR_TYPES ✅  VENDOR_CATEGORIES ✅  INDUSTRY_TYPES ✅  PARTY_STATUS_TYPES ✅  ICV_STATUS_TYPES ✅
 *   SUBCONTRACTOR_TYPES ✅  SUBCONTRACTOR_CATEGORIES ✅
 *   CONSULTANT_TYPES ✅  CONSULTANT_CATEGORIES ✅
 *   GOVERNMENT_AUTHORITY_TYPES ✅  GOVERNMENT_AUTHORITY_CATEGORIES ✅
 *   RECRUITMENT_AGENCY_TYPES ✅  RECRUITMENT_AGENCY_CATEGORIES ✅
 *
 * See: docs/standards/ERP_GLOBAL_PARENT_FORM_RUNTIME_STANDARD.md
 * Reference: Legacy customer prefetch (retired — use Party Master instead)
 */

import { queryKeys } from "@/lib/query/query-keys";
import {
  fetchCountries,
  fetchCurrencies,
  fetchPaymentTerms,
  fetchTaxTypes,
} from "@/lib/lookups/master-data-fetchers";
import type { FormPrefetchDeclaration } from "@/lib/query/form-prefetch-types";
import {
  createChildInvalidator,
} from "@/lib/query/invalidation";

// ── Child table invalidator factories (ready to use) ─────────────────────────
// Each future module wires these into its mutation success handlers.

export const invalidateVendorContacts = createChildInvalidator("vendor_contacts");
export const invalidateVendorAddresses = createChildInvalidator("vendor_addresses");
export const invalidateVendorBankDetails = createChildInvalidator("vendor_bank_details");
export const invalidateVendorDocuments = createChildInvalidator("vendor_documents");

export const invalidateSubcontractorContacts = createChildInvalidator("subcontractor_contacts");
export const invalidateSubcontractorAddresses = createChildInvalidator("subcontractor_addresses");
export const invalidateSubcontractorBankDetails = createChildInvalidator("subcontractor_bank_details");
export const invalidateSubcontractorDocuments = createChildInvalidator("subcontractor_documents");

export const invalidateConsultantContacts = createChildInvalidator("consultant_contacts");
export const invalidateConsultantAddresses = createChildInvalidator("consultant_addresses");
export const invalidateConsultantBankDetails = createChildInvalidator("consultant_bank_details");
export const invalidateConsultantDocuments = createChildInvalidator("consultant_documents");

export const invalidateGovernmentAuthorityContacts = createChildInvalidator("government_authority_contacts");
export const invalidateGovernmentAuthorityAddresses = createChildInvalidator("government_authority_addresses");
export const invalidateGovernmentAuthorityDocuments = createChildInvalidator("government_authority_documents");
// Note: government_authorities has no bank_details table by design.

export const invalidateRecruitmentAgencyContacts = createChildInvalidator("recruitment_agency_contacts");
export const invalidateRecruitmentAgencyAddresses = createChildInvalidator("recruitment_agency_addresses");
export const invalidateRecruitmentAgencyBankDetails = createChildInvalidator("recruitment_agency_bank_details");
export const invalidateRecruitmentAgencyDocuments = createChildInvalidator("recruitment_agency_documents");

// ── Child table descriptor sets ──────────────────────────────────────────────

export const VENDOR_CHILD_TABLES = [
  { tableName: "vendor_contacts",     sectionId: "contacts",   parentKey: "vendor_id", invalidate: invalidateVendorContacts },
  { tableName: "vendor_addresses",    sectionId: "location",   parentKey: "vendor_id", invalidate: invalidateVendorAddresses },
  { tableName: "vendor_bank_details", sectionId: "finance",    parentKey: "vendor_id", invalidate: invalidateVendorBankDetails },
  { tableName: "vendor_documents",    sectionId: "documents",  parentKey: "vendor_id", invalidate: invalidateVendorDocuments },
] as const;

export const SUBCONTRACTOR_CHILD_TABLES = [
  { tableName: "subcontractor_contacts",     sectionId: "contacts",  parentKey: "subcontractor_id", invalidate: invalidateSubcontractorContacts },
  { tableName: "subcontractor_addresses",    sectionId: "location",  parentKey: "subcontractor_id", invalidate: invalidateSubcontractorAddresses },
  { tableName: "subcontractor_bank_details", sectionId: "finance",   parentKey: "subcontractor_id", invalidate: invalidateSubcontractorBankDetails },
  { tableName: "subcontractor_documents",    sectionId: "documents", parentKey: "subcontractor_id", invalidate: invalidateSubcontractorDocuments },
] as const;

export const CONSULTANT_CHILD_TABLES = [
  { tableName: "consultant_contacts",     sectionId: "contacts",  parentKey: "consultant_id", invalidate: invalidateConsultantContacts },
  { tableName: "consultant_addresses",    sectionId: "location",  parentKey: "consultant_id", invalidate: invalidateConsultantAddresses },
  { tableName: "consultant_bank_details", sectionId: "finance",   parentKey: "consultant_id", invalidate: invalidateConsultantBankDetails },
  { tableName: "consultant_documents",    sectionId: "documents", parentKey: "consultant_id", invalidate: invalidateConsultantDocuments },
] as const;

export const GOVERNMENT_AUTHORITY_CHILD_TABLES = [
  { tableName: "government_authority_contacts",  sectionId: "contacts",  parentKey: "government_authority_id", invalidate: invalidateGovernmentAuthorityContacts },
  { tableName: "government_authority_addresses", sectionId: "location",  parentKey: "government_authority_id", invalidate: invalidateGovernmentAuthorityAddresses },
  { tableName: "government_authority_documents", sectionId: "documents", parentKey: "government_authority_id", invalidate: invalidateGovernmentAuthorityDocuments },
  // No bank_details — government_authorities table has no bank_details child by design.
] as const;

export const RECRUITMENT_AGENCY_CHILD_TABLES = [
  { tableName: "recruitment_agency_contacts",     sectionId: "contacts",  parentKey: "recruitment_agency_id", invalidate: invalidateRecruitmentAgencyContacts },
  { tableName: "recruitment_agency_addresses",    sectionId: "location",  parentKey: "recruitment_agency_id", invalidate: invalidateRecruitmentAgencyAddresses },
  { tableName: "recruitment_agency_bank_details", sectionId: "finance",   parentKey: "recruitment_agency_id", invalidate: invalidateRecruitmentAgencyBankDetails },
  { tableName: "recruitment_agency_documents",    sectionId: "documents", parentKey: "recruitment_agency_id", invalidate: invalidateRecruitmentAgencyDocuments },
] as const;

// ── FormPrefetchDeclaration templates ─────────────────────────────────────────
// NOTE: When implementing each module, verify lookup category codes against the
// actual form fields and against live global_lookup_categories.

/** Vendor form prefetch declaration template. */
export const VENDOR_FORM_PREFETCH_TEMPLATE = {
  formId: "vendors",
  // Adjust: add any vendor-form-specific categories found during form design.
  lookupCategories: [
    "VENDOR_TYPES",
    "VENDOR_CATEGORIES",
    "INDUSTRY_TYPES",
    "PARTY_STATUS_TYPES",
    "ICV_STATUS_TYPES",
  ] as const,
  masterQueries: [
    { queryKey: queryKeys.countries(false, false), queryFn: () => fetchCountries(false, false) },
    { queryKey: queryKeys.currencies(false), queryFn: () => fetchCurrencies(false) },
    { queryKey: queryKeys.paymentTerms(false), queryFn: () => fetchPaymentTerms(false) },
    { queryKey: queryKeys.taxTypes(false), queryFn: () => fetchTaxTypes(false) },
  ],
  childTables: VENDOR_CHILD_TABLES,
} as const satisfies FormPrefetchDeclaration;

/** Subcontractor form prefetch declaration template. */
export const SUBCONTRACTOR_FORM_PREFETCH_TEMPLATE = {
  formId: "subcontractors",
  lookupCategories: [
    "SUBCONTRACTOR_TYPES",
    "SUBCONTRACTOR_CATEGORIES",
    "INDUSTRY_TYPES",
    "PARTY_STATUS_TYPES",
  ] as const,
  masterQueries: [
    { queryKey: queryKeys.countries(false, false), queryFn: () => fetchCountries(false, false) },
    { queryKey: queryKeys.currencies(false), queryFn: () => fetchCurrencies(false) },
    { queryKey: queryKeys.paymentTerms(false), queryFn: () => fetchPaymentTerms(false) },
    { queryKey: queryKeys.taxTypes(false), queryFn: () => fetchTaxTypes(false) },
  ],
  childTables: SUBCONTRACTOR_CHILD_TABLES,
} as const satisfies FormPrefetchDeclaration;

/** Consultant form prefetch declaration template. */
export const CONSULTANT_FORM_PREFETCH_TEMPLATE = {
  formId: "consultants",
  lookupCategories: [
    "CONSULTANT_TYPES",
    "CONSULTANT_CATEGORIES",
    "INDUSTRY_TYPES",
    "PARTY_STATUS_TYPES",
  ] as const,
  masterQueries: [
    { queryKey: queryKeys.countries(false, false), queryFn: () => fetchCountries(false, false) },
    { queryKey: queryKeys.currencies(false), queryFn: () => fetchCurrencies(false) },
    { queryKey: queryKeys.paymentTerms(false), queryFn: () => fetchPaymentTerms(false) },
    { queryKey: queryKeys.taxTypes(false), queryFn: () => fetchTaxTypes(false) },
  ],
  childTables: CONSULTANT_CHILD_TABLES,
} as const satisfies FormPrefetchDeclaration;

/** Government Authority form prefetch declaration template. */
export const GOVERNMENT_AUTHORITY_FORM_PREFETCH_TEMPLATE = {
  formId: "government_authorities",
  lookupCategories: [
    "GOVERNMENT_AUTHORITY_TYPES",
    "GOVERNMENT_AUTHORITY_CATEGORIES",
    "PARTY_STATUS_TYPES",
  ] as const,
  masterQueries: [
    { queryKey: queryKeys.countries(false, false), queryFn: () => fetchCountries(false, false) },
  ],
  childTables: GOVERNMENT_AUTHORITY_CHILD_TABLES,
} as const satisfies FormPrefetchDeclaration;

/** Recruitment Agency form prefetch declaration template. */
export const RECRUITMENT_AGENCY_FORM_PREFETCH_TEMPLATE = {
  formId: "recruitment_agencies",
  lookupCategories: [
    "RECRUITMENT_AGENCY_TYPES",
    "RECRUITMENT_AGENCY_CATEGORIES",
    "INDUSTRY_TYPES",
    "PARTY_STATUS_TYPES",
  ] as const,
  masterQueries: [
    { queryKey: queryKeys.countries(false, false), queryFn: () => fetchCountries(false, false) },
    { queryKey: queryKeys.currencies(false), queryFn: () => fetchCurrencies(false) },
    { queryKey: queryKeys.paymentTerms(false), queryFn: () => fetchPaymentTerms(false) },
  ],
  childTables: RECRUITMENT_AGENCY_CHILD_TABLES,
} as const satisfies FormPrefetchDeclaration;
