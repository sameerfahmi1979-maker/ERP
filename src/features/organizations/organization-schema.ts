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
  legal_name_en: z.string().min(1, "English legal name is required").max(255),
  legal_name_ar: z.string().max(255).optional().nullable(),
  short_name: z.string().max(100).optional().nullable(),
  company_code: z
    .string()
    .min(1, "Company code is required")
    .max(50)
    .regex(/^[A-Z0-9_-]+$/, "Company code must be uppercase letters, numbers, hyphens, or underscores"),
  legal_form: z.string().max(100).optional().nullable(),
  country: z.string().max(100).optional().nullable(),
  emirate: z.string().max(100).optional().nullable(),
  trade_license_no: z.string().max(100).optional().nullable(),
  trn: z.string().max(100).optional().nullable(),
  corporate_tax_no: z.string().max(100).optional().nullable(),
  default_currency: z.string().max(10).default("AED"),
  status: ownerCompanyStatusSchema.default("active"),
  primary_email: z.string().email("Invalid email format").max(255).optional().nullable().or(z.literal("")),
  primary_phone: z.string().max(50).optional().nullable(),
  website: z.string().url("Invalid URL format").max(255).optional().nullable().or(z.literal("")),
  logo_url: z.string().url("Invalid URL format").max(500).optional().nullable().or(z.literal("")),
});

// Update schema (for editing organizations)
export const updateOrganizationSchema = createOrganizationSchema.partial().extend({
  id: z.number().int().positive(),
});

// Type exports
export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;
export type UpdateOrganizationInput = z.infer<typeof updateOrganizationSchema>;
export type OwnerCompanyStatus = z.infer<typeof ownerCompanyStatusSchema>;
