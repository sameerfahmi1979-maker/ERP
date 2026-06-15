/**
 * Shared DMS Admin constants — used by both server actions and client components.
 * Must NOT have "use server" directive.
 */

export const ALLOWED_CONFIDENTIALITY = [
  "internal",
  "company",
  "hr",
  "finance",
  "legal",
  "executive",
] as const;

export type DmsConfidentiality = typeof ALLOWED_CONFIDENTIALITY[number];

export const ALLOWED_ENTITY_TYPES = [
  "party",
  "party_license",
  "party_tax_registration",
  "employee",
  "vehicle",
  "equipment",
  "project",
  "contract",
  "purchase_order",
  "invoice",
  "job_card",
  "hse_incident",
  "company",
  "branch",
  "bank",
] as const;

export type DmsEntityType = typeof ALLOWED_ENTITY_TYPES[number];

/** The 14 type_codes that correspond to existing party_document_types */
export const PARTY_DOC_TYPE_CODES = new Set([
  "TRADE_LICENSE",
  "MOA",
  "AOA",
  "TRN_CERTIFICATE",
  "VAT_CERTIFICATE",
  "INSURANCE_CERTIFICATE",
  "BANK_GUARANTEE",
  "POWER_OF_ATTORNEY",
  "PASSPORT_COPY",
  "EMIRATES_ID",
  "ISO_CERTIFICATE",
  "PREQUALIFICATION",
  "CONTRACT",
  "OTHER",
]);

export const ALLOWED_FIELD_TYPES = [
  "text",
  "textarea",
  "number",
  "date",
  "datetime",
  "boolean",
  "select",
  "multi_select",
  "party_ref",
  "employee_ref",
  "vehicle_ref",
  "equipment_ref",
  "project_ref",
  "currency",
  "country_ref",
  "region_ref",
  "city_ref",
  "area_ref",
  "json",
] as const;

export type DmsFieldType = typeof ALLOWED_FIELD_TYPES[number];

export const ALLOWED_ACTIONS_ON_EXPIRY = [
  "notify",
  "archive",
  "delete_prompt",
  "review",
] as const;

export type DmsActionOnExpiry = typeof ALLOWED_ACTIONS_ON_EXPIRY[number];
