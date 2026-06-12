/**
 * Customer Validation Schemas
 * Phase: 002F.3E.3 — Customers Module
 */

import { z } from "zod";

// Customer Main Form Schema - Base
const customerBaseSchema = z.object({
  // customer_code is auto-generated, not in create input
  customer_name_en: z.string().min(1, "Customer name (English) is required").max(500),
  customer_name_ar: z.string().max(500).optional().nullable(),
  customer_type_code: z.string().min(1, "Customer type is required"),
  industry_type_code: z.string().optional().nullable(),
  customer_segment_code: z.string().optional().nullable(),
  lead_source_code: z.string().optional().nullable(),
  trn: z
    .string()
    .optional()
    .nullable()
    .refine((val) => !val || /^\d{15}$/.test(val), {
      message: "TRN must be exactly 15 digits",
    }),
  trade_license_number: z.string().max(100).optional().nullable(),
  license_expiry_date: z.string().optional().nullable(),
  website_url: z
    .string()
    .optional()
    .nullable()
    .refine((val) => !val || /^https?:\/\/.+/.test(val), {
      message: "Invalid URL format",
    }),
  primary_email: z
    .string()
    .optional()
    .nullable()
    .refine((val) => !val || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(val), {
      message: "Invalid email format",
    }),
  primary_phone: z.string().max(50).optional().nullable(),
  primary_mobile: z.string().max(50).optional().nullable(),
  country_id: z.number().optional().nullable(),
  emirate_id: z.number().optional().nullable(),
  city_id: z.number().optional().nullable(),
  area_zone_id: z.number().optional().nullable(),
  address_line_1: z.string().max(500).optional().nullable(),
  address_line_2: z.string().max(500).optional().nullable(),
  po_box: z.string().max(50).optional().nullable(),
  makani_number: z.string().max(50).optional().nullable(),
  currency_id: z.number().optional().nullable(),
  payment_term_id: z.number().optional().nullable(),
  tax_type_id: z.number().optional().nullable(),
  credit_limit: z
    .number()
    .min(0, "Credit limit cannot be negative")
    .optional()
    .nullable(),
  credit_days: z
    .number()
    .int()
    .min(0, "Credit days cannot be negative")
    .optional()
    .nullable(),
  sales_owner_user_profile_id: z.number().optional().nullable(),
  icv_certificate_number: z.string().max(100).optional().nullable(),
  icv_score_percentage: z
    .number()
    .min(0, "ICV score must be between 0 and 100")
    .max(100, "ICV score must be between 0 and 100")
    .optional()
    .nullable(),
  icv_issue_date: z.string().optional().nullable(),
  icv_expiry_date: z.string().optional().nullable(),
  icv_company_type: z.string().max(100).optional().nullable(),
  icv_financial_year_end_date: z.string().optional().nullable(),
  icv_certification_body: z.string().max(255).optional().nullable(),
  icv_version: z.string().max(50).optional().nullable(),
  icv_status_code: z.string().optional().nullable(),
  cicpa_registration_number: z.string().max(100).optional().nullable(),
  notes: z.string().optional().nullable(),
  status_code: z.string().default("ACTIVE"),
  sort_order: z.number().int().default(0),
});

export const createCustomerSchema = customerBaseSchema.refine(
  (data) => {
    if (data.icv_issue_date && data.icv_expiry_date) {
      return new Date(data.icv_expiry_date) >= new Date(data.icv_issue_date);
    }
    return true;
  },
  {
    message: "ICV expiry date must be on or after issue date",
    path: ["icv_expiry_date"],
  }
);

export const updateCustomerSchema = customerBaseSchema.partial().extend({
  id: z.number(),
  is_active: z.boolean().optional(),
}).refine(
  (data) => {
    if (data.icv_issue_date && data.icv_expiry_date) {
      return new Date(data.icv_expiry_date) >= new Date(data.icv_issue_date);
    }
    return true;
  },
  {
    message: "ICV expiry date must be on or after issue date",
    path: ["icv_expiry_date"],
  }
);

export type CreateCustomerInput = z.infer<typeof createCustomerSchema>;
export type UpdateCustomerInput = z.infer<typeof updateCustomerSchema>;

// Customer Contact Schema - Base
const customerContactBaseSchema = z.object({
  customer_id: z.number(),
  contact_name_en: z.string().min(1, "Contact name (English) is required").max(255),
  contact_name_ar: z.string().max(255).optional().nullable(),
  designation: z.string().max(100).optional().nullable(),
  department: z.string().max(100).optional().nullable(),
  contact_type_code: z.string().optional().nullable(),
  email: z.string().email("Invalid email").max(255).optional().or(z.literal("")).transform((v) => (v === "" ? null : v)),
  mobile: z.string().max(50).optional().nullable(),
  phone: z.string().max(50).optional().nullable(),
  whatsapp: z.string().max(50).optional().nullable(),
  is_primary: z.boolean().default(false),
  is_authorized_signatory: z.boolean().default(false),
  is_decision_maker: z.boolean().default(false),
  is_finance_contact: z.boolean().default(false),
  is_operations_contact: z.boolean().default(false),
  preferred_communication_code: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status_code: z.string().default("ACTIVE"),
  sort_order: z.number().int().default(0),
});

export const createCustomerContactSchema = customerContactBaseSchema.refine(
  (data) => {
    return data.email || data.mobile || data.phone;
  },
  {
    message: "At least one contact method (email, mobile, or phone) is required",
    path: ["email"],
  }
);

export const updateCustomerContactSchema = customerContactBaseSchema.partial().extend({
  id: z.number(),
  contact_code: z.string().optional(),
  is_active: z.boolean().optional(),
}).refine(
  (data) => {
    return data.email || data.mobile || data.phone;
  },
  {
    message: "At least one contact method (email, mobile, or phone) is required",
    path: ["email"],
  }
);

export type CreateCustomerContactInput = z.infer<typeof createCustomerContactSchema>;
export type UpdateCustomerContactInput = z.infer<typeof updateCustomerContactSchema>;

// Customer Address Schema
export const createCustomerAddressSchema = z.object({
  customer_id: z.number(),
  address_type_code: z.string().optional().nullable(),
  country_id: z.number().optional().nullable(),
  emirate_id: z.number().optional().nullable(),
  city_id: z.number().optional().nullable(),
  area_zone_id: z.number().optional().nullable(),
  address_line_1: z.string().max(500).optional().nullable(),
  address_line_2: z.string().max(500).optional().nullable(),
  building_name: z.string().max(255).optional().nullable(),
  street_name: z.string().max(255).optional().nullable(),
  po_box: z.string().max(50).optional().nullable(),
  makani_number: z.string().max(50).optional().nullable(),
  latitude: z.number().optional().nullable(),
  longitude: z.number().optional().nullable(),
  is_primary: z.boolean().default(false),
  is_billing_address: z.boolean().default(false),
  is_shipping_address: z.boolean().default(false),
  notes: z.string().optional().nullable(),
  status_code: z.string().default("ACTIVE"),
  sort_order: z.number().int().default(0),
});

export const updateCustomerAddressSchema = createCustomerAddressSchema.partial().extend({
  id: z.number(),
  is_active: z.boolean().optional(),
});

export type CreateCustomerAddressInput = z.infer<typeof createCustomerAddressSchema>;
export type UpdateCustomerAddressInput = z.infer<typeof updateCustomerAddressSchema>;

// Customer Bank Detail Schema
export const createCustomerBankDetailSchema = z.object({
  customer_id: z.number(),
  bank_id: z.number().optional().nullable(),
  bank_account_type_code: z.string().optional().nullable(),
  account_name: z.string().min(1, "Account name is required").max(255),
  account_number: z.string().min(1, "Account number is required").max(100),
  iban: z
    .string()
    .regex(/^[A-Z]{2}[0-9]{2}[A-Z0-9]+$/, "Invalid IBAN format")
    .max(34)
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v)),
  swift_code: z
    .string()
    .regex(/^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/, "SWIFT code must be 8 or 11 characters")
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" ? null : v)),
  currency_id: z.number().optional().nullable(),
  is_primary: z.boolean().default(false),
  is_active: z.boolean().default(true),
  notes: z.string().optional().nullable(),
});

export const updateCustomerBankDetailSchema = createCustomerBankDetailSchema.partial().extend({
  id: z.number(),
});

export type CreateCustomerBankDetailInput = z.infer<typeof createCustomerBankDetailSchema>;
export type UpdateCustomerBankDetailInput = z.infer<typeof updateCustomerBankDetailSchema>;
