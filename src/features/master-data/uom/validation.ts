/**
 * Zod validation schemas for Units & Measurements Master Data
 * Phase 002F.3C.3
 */

import { z } from "zod";

// ============================================================================
// Helper Regex Patterns
// ============================================================================

const UPPERCASE_ALPHA_UNDERSCORE = /^[A-Z_]+$/;
const UPPERCASE_ALPHANUM_UNDERSCORE = /^[A-Z0-9_]+$/;

// ============================================================================
// UOM Category Schemas
// ============================================================================

export const createUomCategorySchema = z.object({
  category_code: z
    .string()
    .min(1, "Category code is required")
    .regex(UPPERCASE_ALPHA_UNDERSCORE, "Category code must be uppercase letters and underscores only")
    .transform((val) => val.toUpperCase()),

  category_name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters"),

  category_name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),

  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),

  sort_order: z.number().int().min(0).default(0),
});

export type CreateUomCategoryInput = z.infer<typeof createUomCategorySchema>;

export const updateUomCategorySchema = z.object({
  id: z.number().int().positive(),

  // category_code is NOT updatable (immutable)

  category_name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters")
    .optional(),

  category_name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),

  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),

  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export type UpdateUomCategoryInput = z.infer<typeof updateUomCategorySchema>;

// ============================================================================
// Unit of Measure Schemas
// ============================================================================

export const createUnitOfMeasureSchema = z.object({
  uom_category_id: z.number().int().positive("Category is required"),

  unit_code: z
    .string()
    .min(1, "Unit code is required")
    .regex(UPPERCASE_ALPHANUM_UNDERSCORE, "Unit code must be uppercase letters, numbers, and underscores only")
    .transform((val) => val.toUpperCase()),

  unit_name_en: z
    .string()
    .min(1, "English name is required")
    .max(255, "English name must not exceed 255 characters"),

  unit_name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),

  symbol: z
    .string()
    .max(20, "Symbol must not exceed 20 characters")
    .nullable()
    .optional(),

  conversion_factor_to_base: z
    .number()
    .positive("Conversion factor must be greater than 0")
    .default(1),

  is_base_unit: z.boolean().default(false),

  decimal_places: z.number().int().min(0).max(6).default(2),

  allow_fraction: z.boolean().default(true),

  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),

  sort_order: z.number().int().min(0).default(0),
});

export type CreateUnitOfMeasureInput = z.infer<typeof createUnitOfMeasureSchema>;

export const updateUnitOfMeasureSchema = z.object({
  id: z.number().int().positive(),

  // uom_category_id is NOT updatable (immutable)
  // unit_code is NOT updatable (immutable)

  unit_name_en: z
    .string()
    .min(1, "English name is required")
    .max(255, "English name must not exceed 255 characters")
    .optional(),

  unit_name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),

  symbol: z
    .string()
    .max(20, "Symbol must not exceed 20 characters")
    .nullable()
    .optional(),

  conversion_factor_to_base: z
    .number()
    .positive("Conversion factor must be greater than 0")
    .optional(),

  is_base_unit: z.boolean().optional(),

  decimal_places: z.number().int().min(0).max(6).optional(),

  allow_fraction: z.boolean().optional(),

  description_en: z.string().max(1000).nullable().optional(),
  description_ar: z.string().max(1000).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),

  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export type UpdateUnitOfMeasureInput = z.infer<typeof updateUnitOfMeasureSchema>;

// ============================================================================
// UOM Conversion Schemas
// ============================================================================

export const createUomConversionSchema = z
  .object({
    from_uom_id: z.number().int().positive("From unit is required"),
    to_uom_id: z.number().int().positive("To unit is required"),

    conversion_factor: z.number().positive("Conversion factor must be greater than 0"),

    conversion_formula_code: z
      .string()
      .max(50, "Formula code must not exceed 50 characters")
      .nullable()
      .optional(),

    is_bidirectional: z.boolean().default(false),

    notes: z.string().max(2000).nullable().optional(),

    sort_order: z.number().int().min(0).default(0),
  })
  .refine((data) => data.from_uom_id !== data.to_uom_id, {
    message: "From unit and to unit must be different",
    path: ["to_uom_id"],
  });

export type CreateUomConversionInput = z.infer<typeof createUomConversionSchema>;

export const updateUomConversionSchema = z.object({
  id: z.number().int().positive(),

  // from_uom_id is NOT updatable (immutable)
  // to_uom_id is NOT updatable (immutable)

  conversion_factor: z.number().positive("Conversion factor must be greater than 0").optional(),

  conversion_formula_code: z
    .string()
    .max(50, "Formula code must not exceed 50 characters")
    .nullable()
    .optional(),

  is_bidirectional: z.boolean().optional(),

  notes: z.string().max(2000).nullable().optional(),

  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export type UpdateUomConversionInput = z.infer<typeof updateUomConversionSchema>;

// ============================================================================
// Toggle Status Schema
// ============================================================================

export const toggleUomStatusSchema = z.object({
  id: z.number().int().positive(),
  is_active: z.boolean(),
  deactivation_reason: z.string().max(500).nullable().optional(),
});

export type ToggleUomStatusInput = z.infer<typeof toggleUomStatusSchema>;
