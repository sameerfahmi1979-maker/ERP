/**
 * Zod validation schemas for the Unified Party Master module.
 * Phase ERP BASE 002F.5A.2
 */

import { z } from "zod";

export const createPartySchema = z.object({
  display_name: z.string().min(1, "Display name is required"),
  legal_name_en: z.string().min(1, "Legal name (English) is required"),
  legal_name_ar: z.string().nullable().optional(),
  trade_name_en: z.string().nullable().optional(),
  trade_name_ar: z.string().nullable().optional(),
  short_name: z.string().nullable().optional(),
  party_nature_id: z.number().int().positive("Party nature is required"),
  primary_party_type_id: z.number().int().positive().nullable().optional(),
  parent_party_id: z.number().int().positive().nullable().optional(),
  main_phone: z.string().nullable().optional(),
  main_mobile: z.string().nullable().optional(),
  whatsapp: z.string().nullable().optional(),
  main_email: z.string().email("Invalid email format").nullable().optional().or(z.literal("").transform(() => null)),
  alternate_email: z.string().email("Invalid email format").nullable().optional().or(z.literal("").transform(() => null)),
  website: z.string().url("Invalid URL format").nullable().optional().or(z.literal("").transform(() => null)),
  country_id: z.number().int().positive("Country is required"),
  emirate_id: z.number().int().positive().nullable().optional(),
  city_id: z.number().int().positive().nullable().optional(),
  area_zone_id: z.number().int().positive().nullable().optional(),
  po_box: z.string().nullable().optional(),
  full_address_text: z.string().nullable().optional(),
  google_map_url: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  party_status_id: z.number().int().positive("Party status is required"),
  is_active: z.boolean().optional().default(true),
  remarks: z.string().nullable().optional(),
});

export const updatePartySchema = createPartySchema.extend({
  id: z.number().int().positive(),
});

export const createPartyLicenseSchema = z.object({
  party_id: z.number().int().positive(),
  license_type_id: z.number().int().positive("License type is required"),
  license_number: z.string().min(1, "License number is required"),
  license_name: z.string().nullable().optional(),
  issuing_authority_party_id: z.number().int().positive().nullable().optional(),
  issuing_country_id: z.number().int().positive().nullable().optional(),
  issuing_emirate_id: z.number().int().positive().nullable().optional(),
  issue_date: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  renewal_required: z.boolean().optional().default(false),
  renewal_notice_days: z.number().int().nullable().optional(),
  license_status_id: z.number().int().positive("License status is required"),
  license_activity_text: z.string().nullable().optional(),
  license_document_id: z.number().int().positive().nullable().optional(),
  is_primary: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  remarks: z.string().nullable().optional(),
});

export const updatePartyLicenseSchema = createPartyLicenseSchema.extend({
  id: z.number().int().positive(),
});

export const createPartyTaxRegistrationSchema = z.object({
  party_id: z.number().int().positive(),
  tax_type_id: z.number().int().positive("Tax type is required"),
  tax_registration_number: z.string().min(1, "Tax registration number is required"),
  tax_country_id: z.number().int().positive().nullable().optional(),
  tax_status_id: z.number().int().positive("Tax status is required"),
  effective_from: z.string().nullable().optional(),
  effective_to: z.string().nullable().optional(),
  certificate_document_id: z.number().int().positive().nullable().optional(),
  reverse_charge_applicable: z.boolean().optional().default(false),
  vat_exempt: z.boolean().optional().default(false),
  is_primary: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  remarks: z.string().nullable().optional(),
});

export const updatePartyTaxRegistrationSchema = createPartyTaxRegistrationSchema.extend({
  id: z.number().int().positive(),
});

export const upsertPartyFinanceProfileSchema = z.object({
  party_id: z.number().int().positive(),
  default_currency_id: z.number().int().positive().nullable().optional(),
  default_payment_term_id: z.number().int().positive().nullable().optional(),
  default_payment_method_id: z.number().int().positive().nullable().optional(),
  credit_limit: z.number().nonnegative().nullable().optional(),
  credit_currency_id: z.number().int().positive().nullable().optional(),
  finance_hold: z.boolean().optional().default(false),
  finance_hold_reason: z.string().nullable().optional(),
  finance_remarks: z.string().nullable().optional(),
});

export const createPartyContactSchema = z.object({
  party_id: z.number().int().positive(),
  full_name: z.string().min(1, "Full name is required"),
  designation: z.string().nullable().optional(),
  department_id: z.number().int().positive().nullable().optional(),
  contact_role_id: z.number().int().positive().nullable().optional(),
  email: z.string().email("Invalid email format").nullable().optional().or(z.literal("").transform(() => null)),
  phone: z.string().nullable().optional(),
  mobile: z.string().nullable().optional(),
  whatsapp: z.string().nullable().optional(),
  is_primary: z.boolean().optional().default(false),
  is_accounts_contact: z.boolean().optional().default(false),
  is_sales_contact: z.boolean().optional().default(false),
  is_operations_contact: z.boolean().optional().default(false),
  is_hse_contact: z.boolean().optional().default(false),
  is_documents_contact: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  notes: z.string().nullable().optional(),
});

export const updatePartyContactSchema = createPartyContactSchema.extend({
  id: z.number().int().positive(),
});

export const createPartyAddressSchema = z.object({
  party_id: z.number().int().positive(),
  address_type_id: z.number().int().positive("Address type is required"),
  address_name: z.string().nullable().optional(),
  country_id: z.number().int().positive("Country is required"),
  emirate_id: z.number().int().positive().nullable().optional(),
  city_id: z.number().int().positive().nullable().optional(),
  area_zone_id: z.number().int().positive().nullable().optional(),
  street: z.string().nullable().optional(),
  building: z.string().nullable().optional(),
  floor: z.string().nullable().optional(),
  office_no: z.string().nullable().optional(),
  po_box: z.string().nullable().optional(),
  landmark: z.string().nullable().optional(),
  google_map_url: z.string().nullable().optional(),
  latitude: z.number().nullable().optional(),
  longitude: z.number().nullable().optional(),
  is_primary: z.boolean().optional().default(false),
  is_billing_address: z.boolean().optional().default(false),
  is_shipping_address: z.boolean().optional().default(false),
  is_site_address: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  notes: z.string().nullable().optional(),
});

export const updatePartyAddressSchema = createPartyAddressSchema.extend({
  id: z.number().int().positive(),
});

export const createPartyBankDetailSchema = z.object({
  party_id: z.number().int().positive(),
  bank_id: z.number().int().positive().nullable().optional(),
  bank_name_text: z.string().nullable().optional(),
  account_holder_name: z.string().min(1, "Account holder name is required"),
  account_number: z.string().nullable().optional(),
  iban: z.string().nullable().optional(),
  swift_code: z.string().nullable().optional(),
  currency_id: z.number().int().positive().nullable().optional(),
  branch_name: z.string().nullable().optional(),
  country_id: z.number().int().positive().nullable().optional(),
  is_primary: z.boolean().optional().default(false),
  is_active: z.boolean().optional().default(true),
  remarks: z.string().nullable().optional(),
});

export const updatePartyBankDetailSchema = createPartyBankDetailSchema.extend({
  id: z.number().int().positive(),
});

export const createPartyDocumentSchema = z.object({
  party_id: z.number().int().positive(),
  document_type_id: z.number().int().positive("Document type is required"),
  document_title: z.string().min(1, "Document title is required"),
  document_number: z.string().nullable().optional(),
  issue_date: z.string().nullable().optional(),
  expiry_date: z.string().nullable().optional(),
  issuing_authority_party_id: z.number().int().positive().nullable().optional(),
  expiry_required: z.boolean().optional().default(false),
  renewal_notice_days: z.number().int().nullable().optional(),
  document_status_id: z.number().int().positive("Document status is required"),
  remarks: z.string().nullable().optional(),
});

export const updatePartyDocumentSchema = createPartyDocumentSchema.extend({
  id: z.number().int().positive(),
});

export type CreatePartySchemaInput = z.infer<typeof createPartySchema>;
export type UpdatePartySchemaInput = z.infer<typeof updatePartySchema>;
export type CreatePartyLicenseInput = z.infer<typeof createPartyLicenseSchema>;
export type UpdatePartyLicenseInput = z.infer<typeof updatePartyLicenseSchema>;
export type CreatePartyTaxInput = z.infer<typeof createPartyTaxRegistrationSchema>;
export type UpdatePartyTaxInput = z.infer<typeof updatePartyTaxRegistrationSchema>;
export type UpsertFinanceProfileInput = z.infer<typeof upsertPartyFinanceProfileSchema>;
export type CreatePartyContactInput = z.infer<typeof createPartyContactSchema>;
export type UpdatePartyContactInput = z.infer<typeof updatePartyContactSchema>;
export type CreatePartyAddressInput = z.infer<typeof createPartyAddressSchema>;
export type UpdatePartyAddressInput = z.infer<typeof updatePartyAddressSchema>;
export type CreatePartyBankDetailInput = z.infer<typeof createPartyBankDetailSchema>;
export type UpdatePartyBankDetailInput = z.infer<typeof updatePartyBankDetailSchema>;
export type CreatePartyDocumentInput = z.infer<typeof createPartyDocumentSchema>;
export type UpdatePartyDocumentInput = z.infer<typeof updatePartyDocumentSchema>;
