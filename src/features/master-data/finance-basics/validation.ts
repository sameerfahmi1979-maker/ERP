/**
 * Zod validation schemas for Finance Basics Master Data
 * Phase 002F.3C.2
 */

import { z } from "zod";

// ============================================================================
// Helper Regex Patterns
// ============================================================================

const ISO3_CURRENCY_CODE = /^[A-Z]{3}$/;
const UPPERCASE_ALPHA_UNDERSCORE = /^[A-Z0-9_]+$/;
const UPPERCASE_ALPHA_UNDERSCORE_HYPHEN = /^[A-Z0-9_\-]+$/;
const SWIFT_CODE = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

// ============================================================================
// Create Currency Schema
// ============================================================================

export const createCurrencySchema = z.object({
  currency_code: z
    .string()
    .length(3, "Currency code must be exactly 3 characters (ISO 4217)")
    .regex(ISO3_CURRENCY_CODE, "Currency code must be uppercase letters only (e.g., AED, USD)")
    .transform((val) => val.toUpperCase()),

  currency_name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters"),

  currency_name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),

  symbol: z
    .string()
    .max(10, "Symbol must not exceed 10 characters")
    .nullable()
    .optional(),

  decimal_places: z.number().int().min(0).max(4).default(2),

  is_base_currency: z.boolean().default(false),

  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),

  sort_order: z.number().int().min(0).default(0),
});

export type CreateCurrencyInput = z.infer<typeof createCurrencySchema>;

// ============================================================================
// Update Currency Schema
// ============================================================================

export const updateCurrencySchema = z.object({
  id: z.number().int().positive(),

  // currency_code is NOT updatable (immutable)

  currency_name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters")
    .optional(),

  currency_name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),

  symbol: z
    .string()
    .max(10, "Symbol must not exceed 10 characters")
    .nullable()
    .optional(),

  decimal_places: z.number().int().min(0).max(4).optional(),

  is_base_currency: z.boolean().optional(),

  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),

  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export type UpdateCurrencyInput = z.infer<typeof updateCurrencySchema>;

// ============================================================================
// Create Payment Term Schema
// ============================================================================

export const createPaymentTermSchema = z.object({
  term_code: z
    .string()
    .min(2, "Term code is required (minimum 2 characters)")
    .max(50, "Term code must not exceed 50 characters")
    .regex(UPPERCASE_ALPHA_UNDERSCORE, "Term code must contain only uppercase letters, numbers, and underscores")
    .transform((val) => val.toUpperCase()),

  term_name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters"),

  term_name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),

  due_days: z.number().int().min(0).default(0),
  advance_percentage: z.number().min(0).max(100).default(0),
  retention_percentage: z.number().min(0).max(100).default(0),

  calculation_notes: z.string().max(1000).nullable().optional(),
  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),

  sort_order: z.number().int().min(0).default(0),
});

export type CreatePaymentTermInput = z.infer<typeof createPaymentTermSchema>;

// ============================================================================
// Update Payment Term Schema
// ============================================================================

export const updatePaymentTermSchema = z.object({
  id: z.number().int().positive(),

  // term_code is NOT updatable (immutable)

  term_name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters")
    .optional(),

  term_name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),

  due_days: z.number().int().min(0).optional(),
  advance_percentage: z.number().min(0).max(100).optional(),
  retention_percentage: z.number().min(0).max(100).optional(),

  calculation_notes: z.string().max(1000).nullable().optional(),
  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),

  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export type UpdatePaymentTermInput = z.infer<typeof updatePaymentTermSchema>;

// ============================================================================
// Create Tax Type Schema
// ============================================================================

export const createTaxTypeSchema = z.object({
  tax_code: z
    .string()
    .min(2, "Tax code is required (minimum 2 characters)")
    .max(50, "Tax code must not exceed 50 characters")
    .regex(UPPERCASE_ALPHA_UNDERSCORE, "Tax code must contain only uppercase letters, numbers, and underscores")
    .transform((val) => val.toUpperCase()),

  tax_name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters"),

  tax_name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),

  tax_rate: z.number().min(0).max(100).default(0),

  tax_treatment_code: z
    .string()
    .min(1, "Tax treatment is required")
    .max(50, "Tax treatment code must not exceed 50 characters"),

  is_vat: z.boolean().default(false),
  is_reverse_charge: z.boolean().default(false),
  applies_to_sales: z.boolean().default(true),
  applies_to_purchases: z.boolean().default(true),
  applies_to_scrap: z.boolean().default(false),

  effective_from: z.string().min(1, "Effective from date is required").default("2018-01-01"),
  effective_to: z.string().nullable().optional(),

  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),

  sort_order: z.number().int().min(0).default(0),
}).refine(
  (data) => !data.effective_to || data.effective_to >= data.effective_from,
  { message: "Effective to date must be on or after effective from date", path: ["effective_to"] },
);

export type CreateTaxTypeInput = z.infer<typeof createTaxTypeSchema>;

// ============================================================================
// Update Tax Type Schema
// ============================================================================

export const updateTaxTypeSchema = z.object({
  id: z.number().int().positive(),

  // tax_code is NOT updatable (immutable)

  tax_name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters")
    .optional(),

  tax_name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),

  tax_rate: z.number().min(0).max(100).optional(),

  tax_treatment_code: z
    .string()
    .min(1, "Tax treatment is required")
    .max(50, "Tax treatment code must not exceed 50 characters")
    .optional(),

  is_vat: z.boolean().optional(),
  is_reverse_charge: z.boolean().optional(),
  applies_to_sales: z.boolean().optional(),
  applies_to_purchases: z.boolean().optional(),
  applies_to_scrap: z.boolean().optional(),

  effective_from: z.string().optional(),
  effective_to: z.string().nullable().optional(),

  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),

  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
}).refine(
  (data) => {
    if (!data.effective_from || !data.effective_to) return true;
    return data.effective_to >= data.effective_from;
  },
  { message: "Effective to date must be on or after effective from date", path: ["effective_to"] },
);

export type UpdateTaxTypeInput = z.infer<typeof updateTaxTypeSchema>;

// ============================================================================
// Create Bank Schema
// ============================================================================

export const createBankSchema = z.object({
  bank_code: z
    .string()
    .min(2, "Bank code is required (minimum 2 characters)")
    .max(50, "Bank code must not exceed 50 characters")
    .regex(UPPERCASE_ALPHA_UNDERSCORE, "Bank code must contain only uppercase letters, numbers, and underscores")
    .transform((val) => val.toUpperCase()),

  bank_name_en: z
    .string()
    .min(2, "English bank name is required (minimum 2 characters)")
    .max(255, "English bank name must not exceed 255 characters"),

  bank_name_ar: z
    .string()
    .max(255, "Arabic bank name must not exceed 255 characters")
    .nullable()
    .optional(),

  short_name: z
    .string()
    .max(50, "Short name must not exceed 50 characters")
    .nullable()
    .optional(),

  country_id: z.number().int().positive().nullable().optional(),

  bank_type_code: z
    .string()
    .max(50, "Bank type code must not exceed 50 characters")
    .nullable()
    .optional(),

  swift_code: z
    .string()
    .transform((val) => (val === "" ? null : val.toUpperCase()))
    .refine((val) => val === null || SWIFT_CODE.test(val), "SWIFT/BIC code must be 8 or 11 uppercase alphanumeric characters")
    .nullable()
    .optional(),

  website_url: z
    .string()
    .transform((val) => (val === "" ? null : val))
    .refine((val) => val === null || z.string().url().safeParse(val).success, "Website must be a valid URL")
    .nullable()
    .optional(),
  contact_phone: z
    .string()
    .max(30)
    .transform((val) => (val === "" ? null : val))
    .nullable()
    .optional(),
  contact_email: z
    .string()
    .transform((val) => (val === "" ? null : val))
    .refine((val) => val === null || z.string().email().safeParse(val).success, "Contact email must be valid")
    .nullable()
    .optional(),

  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),

  sort_order: z.number().int().min(0).default(0),
});

export type CreateBankInput = z.infer<typeof createBankSchema>;

// ============================================================================
// Update Bank Schema
// ============================================================================

export const updateBankSchema = z.object({
  id: z.number().int().positive(),

  // bank_code is NOT updatable (immutable)

  bank_name_en: z
    .string()
    .min(2, "English bank name is required (minimum 2 characters)")
    .max(255, "English bank name must not exceed 255 characters")
    .optional(),

  bank_name_ar: z
    .string()
    .max(255, "Arabic bank name must not exceed 255 characters")
    .nullable()
    .optional(),

  short_name: z
    .string()
    .max(50, "Short name must not exceed 50 characters")
    .nullable()
    .optional(),

  country_id: z.number().int().positive().nullable().optional(),

  bank_type_code: z
    .string()
    .max(50, "Bank type code must not exceed 50 characters")
    .nullable()
    .optional(),

  swift_code: z
    .string()
    .transform((val) => (val === "" ? null : val.toUpperCase()))
    .refine((val) => val === null || SWIFT_CODE.test(val), "SWIFT/BIC code must be 8 or 11 uppercase alphanumeric characters")
    .nullable()
    .optional(),

  website_url: z
    .string()
    .transform((val) => (val === "" ? null : val))
    .refine((val) => val === null || z.string().url().safeParse(val).success, "Website must be a valid URL")
    .nullable()
    .optional(),
  contact_phone: z
    .string()
    .max(30)
    .transform((val) => (val === "" ? null : val))
    .nullable()
    .optional(),
  contact_email: z
    .string()
    .transform((val) => (val === "" ? null : val))
    .refine((val) => val === null || z.string().email().safeParse(val).success, "Contact email must be valid")
    .nullable()
    .optional(),

  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),

  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export type UpdateBankInput = z.infer<typeof updateBankSchema>;

// ============================================================================
// Create Cost Center Schema
// ============================================================================

export const createCostCenterSchema = z.object({
  cost_center_code: z
    .string()
    .min(2, "Cost center code is required (minimum 2 characters)")
    .max(50, "Cost center code must not exceed 50 characters")
    .regex(UPPERCASE_ALPHA_UNDERSCORE_HYPHEN, "Cost center code must contain only uppercase letters, numbers, underscores, and hyphens")
    .transform((val) => val.toUpperCase()),

  cost_center_name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters"),

  cost_center_name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),

  cost_center_type_code: z
    .string()
    .max(50, "Cost center type code must not exceed 50 characters")
    .nullable()
    .optional(),

  parent_cost_center_id: z.number().int().positive().nullable().optional(),
  owner_company_id: z.number().int().positive().nullable().optional(),
  branch_id: z.number().int().positive().nullable().optional(),

  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),

  sort_order: z.number().int().min(0).default(0),
});

export type CreateCostCenterInput = z.infer<typeof createCostCenterSchema>;

// ============================================================================
// Update Cost Center Schema
// ============================================================================

export const updateCostCenterSchema = z.object({
  id: z.number().int().positive(),

  // cost_center_code is NOT updatable (immutable)

  cost_center_name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters")
    .optional(),

  cost_center_name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),

  cost_center_type_code: z
    .string()
    .max(50, "Cost center type code must not exceed 50 characters")
    .nullable()
    .optional(),

  parent_cost_center_id: z.number().int().positive().nullable().optional(),
  owner_company_id: z.number().int().positive().nullable().optional(),
  branch_id: z.number().int().positive().nullable().optional(),

  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),

  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export type UpdateCostCenterInput = z.infer<typeof updateCostCenterSchema>;

// ============================================================================
// Create Profit Center Schema
// ============================================================================

export const createProfitCenterSchema = z.object({
  profit_center_code: z
    .string()
    .min(2, "Profit center code is required (minimum 2 characters)")
    .max(50, "Profit center code must not exceed 50 characters")
    .regex(UPPERCASE_ALPHA_UNDERSCORE_HYPHEN, "Profit center code must contain only uppercase letters, numbers, underscores, and hyphens")
    .transform((val) => val.toUpperCase()),

  profit_center_name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters"),

  profit_center_name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),

  profit_center_type_code: z
    .string()
    .max(50, "Profit center type code must not exceed 50 characters")
    .nullable()
    .optional(),

  parent_profit_center_id: z.number().int().positive().nullable().optional(),
  owner_company_id: z.number().int().positive().nullable().optional(),
  branch_id: z.number().int().positive().nullable().optional(),

  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),

  sort_order: z.number().int().min(0).default(0),
});

export type CreateProfitCenterInput = z.infer<typeof createProfitCenterSchema>;

// ============================================================================
// Update Profit Center Schema
// ============================================================================

export const updateProfitCenterSchema = z.object({
  id: z.number().int().positive(),

  // profit_center_code is NOT updatable (immutable)

  profit_center_name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters")
    .optional(),

  profit_center_name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),

  profit_center_type_code: z
    .string()
    .max(50, "Profit center type code must not exceed 50 characters")
    .nullable()
    .optional(),

  parent_profit_center_id: z.number().int().positive().nullable().optional(),
  owner_company_id: z.number().int().positive().nullable().optional(),
  branch_id: z.number().int().positive().nullable().optional(),

  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),

  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export type UpdateProfitCenterInput = z.infer<typeof updateProfitCenterSchema>;

// ============================================================================
// Toggle Lock Schema
// ============================================================================

export const toggleFinanceBasicsLockSchema = z.object({
  id: z.number().int().positive(),
  is_locked: z.boolean(),
});

export type ToggleFinanceBasicsLockInput = z.infer<typeof toggleFinanceBasicsLockSchema>;

// ============================================================================
// Toggle Status Schema
// ============================================================================

export const toggleFinanceBasicsStatusSchema = z.object({
  id: z.number().int().positive(),
  is_active: z.boolean(),
  deactivation_reason: z
    .string()
    .max(500, "Deactivation reason must not exceed 500 characters")
    .nullable()
    .optional(),
});

export type ToggleFinanceBasicsStatusInput = z.infer<typeof toggleFinanceBasicsStatusSchema>;
