import { z } from "zod";

/**
 * Owner Company (Organization) Validation Schema
 * 
 * Based on the owner_companies table schema from the ERP foundation migration.
 */

// Status enum
export const ownerCompanyStatusSchema = z.enum(["active", "inactive", "suspended"]);

// Create schema (for new organizations)
export const createOrganizationSchema = z.object({
  // Basic Information
  legal_name_en: z.string().min(1, "English legal name is required").max(255),
  legal_name_ar: z.string().max(255).optional().nullable(),
  short_name: z.string().max(100).optional().nullable(),
  company_code: z
    .string()
    .min(1, "Company code is required")
    .max(50)
    .regex(/^[A-Z0-9_-]+$/, "Company code must be uppercase letters, numbers, hyphens, or underscores")
    .transform((val) => val.toUpperCase()), // Auto-convert to uppercase
  legal_form: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  status: ownerCompanyStatusSchema.default("active"),
  
  // Geography FK Fields (Phase 002F.3C.1B.1)
  country_id: z.number().int().positive().nullable().optional(),
  emirate_id: z.number().int().positive().nullable().optional(),
  city_id: z.number().int().positive().nullable().optional(),
  area_zone_id: z.number().int().positive().nullable().optional(),
  
  // Address & Contact (Phase 002D)
  emirate: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  area: z.string().max(100).optional().nullable(),
  address_line_1: z.string().max(500).optional().nullable(),
  address_line_2: z.string().max(500).optional().nullable(),
  po_box: z.string().max(50).optional().nullable(),
  makani_number: z.string().max(50).optional().nullable(),
  primary_email: z.string().email("Invalid email format").max(255).optional().nullable().or(z.literal("")),
  primary_phone: z.string().max(50).optional().nullable(),
  website: z.string().url("Invalid URL format").max(255).optional().nullable().or(z.literal("")),
  default_currency: z.string().max(10).default("AED"),
  
  // Legal & Licensing (Phase 002D)
  trade_license_no: z.string().max(100).optional().nullable(),
  trade_license_issue_date: z.string().optional().nullable(),
  trade_license_expiry_date: z.string().optional().nullable(),
  licensing_authority: z.string().max(255).optional().nullable(),
  chamber_membership_no: z.string().max(100).optional().nullable(),
  chamber_membership_expiry_date: z.string().optional().nullable(),
  
  // Tax & Compliance (Phase 002D)
  trn: z.string().max(100).optional().nullable(),
  vat_registered: z.boolean().default(true),
  corporate_tax_no: z.string().max(100).optional().nullable(),
  corporate_tax_registered: z.boolean().default(false),
  icv_certificate_no: z.string().max(100).optional().nullable(),
  icv_score: z.number().min(0).max(100).optional().nullable(),
  icv_issue_date: z.string().optional().nullable(),
  icv_expiry_date: z.string().optional().nullable(),
  adnoc_supplier_no: z.string().max(100).optional().nullable(),
  
  // Other
  logo_url: z.string().url("Invalid URL format").max(500).optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable(),
});

// Update schema (for editing organizations)
export const updateOrganizationSchema = z.object({
  id: z.number().int().positive(),
  // Basic Information - more lenient for updates
  legal_name_en: z.string().min(1, "English legal name is required").max(255).optional(),
  legal_name_ar: z.string().max(255).optional().nullable(),
  short_name: z.string().max(100).optional().nullable(),
  company_code: z
    .string()
    .min(1, "Company code is required")
    .max(50)
    .regex(/^[A-Z0-9_-]+$/, "Company code must be uppercase letters, numbers, hyphens, or underscores")
    .transform((val) => val.toUpperCase())
    .nullable()
    .optional(),
  legal_form: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  status: ownerCompanyStatusSchema.optional(),
  
  // Geography FK Fields (Phase 002F.3C.1B.1)
  country_id: z.number().int().positive().nullable().optional(),
  emirate_id: z.number().int().positive().nullable().optional(),
  city_id: z.number().int().positive().nullable().optional(),
  area_zone_id: z.number().int().positive().nullable().optional(),
  
  // Address & Contact (Phase 002D)
  emirate: z.string().max(100).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  area: z.string().max(100).optional().nullable(),
  address_line_1: z.string().max(500).optional().nullable(),
  address_line_2: z.string().max(500).optional().nullable(),
  po_box: z.string().max(50).optional().nullable(),
  makani_number: z.string().max(50).optional().nullable(),
  primary_email: z.string().email("Invalid email format").max(255).optional().nullable().or(z.literal("")),
  primary_phone: z.string().max(50).optional().nullable(),
  website: z.string().url("Invalid URL format").max(255).optional().nullable().or(z.literal("")),
  default_currency: z.string().max(10).optional(),
  
  // Legal & Licensing (Phase 002D)
  trade_license_no: z.string().max(100).optional().nullable(),
  trade_license_issue_date: z.string().optional().nullable(),
  trade_license_expiry_date: z.string().optional().nullable(),
  licensing_authority: z.string().max(255).optional().nullable(),
  chamber_membership_no: z.string().max(100).optional().nullable(),
  chamber_membership_expiry_date: z.string().optional().nullable(),
  
  // Tax & Compliance (Phase 002D)
  trn: z.string().max(100).optional().nullable(),
  vat_registered: z.boolean().optional(),
  corporate_tax_no: z.string().max(100).optional().nullable(),
  corporate_tax_registered: z.boolean().optional(),
  icv_certificate_no: z.string().max(100).optional().nullable(),
  icv_score: z.number().min(0).max(100).optional().nullable(),
  icv_issue_date: z.string().optional().nullable(),
  icv_expiry_date: z.string().optional().nullable(),
  adnoc_supplier_no: z.string().max(100).optional().nullable(),
  
  // Other
  logo_url: z.string().url("Invalid URL format").max(500).optional().nullable().or(z.literal("")),
  notes: z.string().optional().nullable(),
});

// Type exports
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type OwnerCompanyStatus = z.infer<typeof ownerCompanyStatusSchema>;
