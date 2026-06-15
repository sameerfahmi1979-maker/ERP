/**
 * Zod validation schemas for Global Lookup / Dropdown Engine
 * Phase 002F.3B
 */

import { z } from "zod";

// ============================================================================
// Helper Regex Patterns
// ============================================================================

const UPPERCASE_ALPHA_UNDERSCORE = /^[A-Z0-9_]+$/;
const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

// ============================================================================
// Category Scope Enum
// ============================================================================

export const categoryScopeSchema = z.enum(['GLOBAL', 'COMPANY', 'BRANCH', 'MODULE']);

// ============================================================================
// Create Lookup Category Schema
// ============================================================================

export const createLookupCategorySchema = z.object({
  category_code: z
    .string()
    .min(2, "Category code must be at least 2 characters")
    .max(100, "Category code must not exceed 100 characters")
    .regex(UPPERCASE_ALPHA_UNDERSCORE, "Category code must contain only uppercase letters, numbers, and underscores")
    .transform(val => val.toUpperCase()),
  
  category_name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(200, "English name must not exceed 200 characters"),
  
  category_name_ar: z
    .string()
    .max(200, "Arabic name must not exceed 200 characters")
    .nullable()
    .optional(),
  
  description: z
    .string()
    .max(1000, "Description must not exceed 1000 characters")
    .nullable()
    .optional(),
  
  module_code: z
    .string()
    .max(50, "Module code must not exceed 50 characters")
    .nullable()
    .optional(),
  
  category_scope: categoryScopeSchema.default('GLOBAL'),
  
  supports_hierarchy: z.boolean().default(false),
  supports_color: z.boolean().default(false),
  supports_icon: z.boolean().default(false),
  supports_effective_dates: z.boolean().default(false),
  supports_metadata: z.boolean().default(true),
  
  is_active: z.boolean().default(true),
  sort_order: z.number().int().min(0).default(0),
});

export type CreateLookupCategoryInput = z.infer<typeof createLookupCategorySchema>;

// ============================================================================
// Update Lookup Category Schema
// ============================================================================

export const updateLookupCategorySchema = z.object({
  id: z.number().int().positive(),
  
  // category_code is NOT updatable (immutable)
  
  category_name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(200, "English name must not exceed 200 characters")
    .optional(),
  
  category_name_ar: z
    .string()
    .max(200, "Arabic name must not exceed 200 characters")
    .nullable()
    .optional(),
  
  description: z
    .string()
    .max(1000, "Description must not exceed 1000 characters")
    .nullable()
    .optional(),
  
  module_code: z
    .string()
    .max(50, "Module code must not exceed 50 characters")
    .nullable()
    .optional(),
  
  category_scope: categoryScopeSchema.optional(),
  
  supports_hierarchy: z.boolean().optional(),
  supports_color: z.boolean().optional(),
  supports_icon: z.boolean().optional(),
  supports_effective_dates: z.boolean().optional(),
  supports_metadata: z.boolean().optional(),
  
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export type UpdateLookupCategoryInput = z.infer<typeof updateLookupCategorySchema>;

// ============================================================================
// Create Lookup Value Schema
// ============================================================================

export const createLookupValueSchema = z.object({
  category_id: z.number().int().positive("Category is required"),
  
  value_code: z
    .string()
    .min(1, "Value code is required")
    .max(100, "Value code must not exceed 100 characters")
    .regex(UPPERCASE_ALPHA_UNDERSCORE, "Value code must contain only uppercase letters, numbers, and underscores")
    .transform(val => val.toUpperCase()),
  
  value_label_en: z
    .string()
    .min(1, "English label is required")
    .max(200, "English label must not exceed 200 characters"),
  
  value_label_ar: z
    .string()
    .max(200, "Arabic label must not exceed 200 characters")
    .nullable()
    .optional(),
  
  description: z
    .string()
    .max(1000, "Description must not exceed 1000 characters")
    .nullable()
    .optional(),
  
  parent_value_id: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),
  
  color_hex: z
    .string()
    .regex(HEX_COLOR, "Color must be a valid hex color (e.g., #22C55E)")
    .nullable()
    .optional(),
  
  icon_name: z
    .string()
    .max(50, "Icon name must not exceed 50 characters")
    .nullable()
    .optional(),
  
  badge_variant: z
    .string()
    .max(50, "Badge variant must not exceed 50 characters")
    .nullable()
    .optional(),
  
  sort_order: z.number().int().min(0).default(0),
  
  is_default: z.boolean().default(false),
  is_active: z.boolean().default(true),
  
  effective_from: z
    .string()
    .nullable()
    .optional()
    .refine(
      (val) => !val || !isNaN(Date.parse(val)),
      "Effective from must be a valid date"
    ),
  
  effective_to: z
    .string()
    .nullable()
    .optional()
    .refine(
      (val) => !val || !isNaN(Date.parse(val)),
      "Effective to must be a valid date"
    ),
  
  metadata_json: z
    .record(z.string(), z.unknown())
    .default({}),
}).refine(
  (data) => {
    if (data.effective_from && data.effective_to) {
      return new Date(data.effective_to) >= new Date(data.effective_from);
    }
    return true;
  },
  {
    message: "Effective to date must be after effective from date",
    path: ["effective_to"],
  }
);

export type CreateLookupValueInput = z.infer<typeof createLookupValueSchema>;

// ============================================================================
// Update Lookup Value Schema
// ============================================================================

export const updateLookupValueSchema = z.object({
  id: z.number().int().positive(),
  
  // category_id and value_code are NOT updatable (immutable)
  
  value_label_en: z
    .string()
    .min(1, "English label is required")
    .max(200, "English label must not exceed 200 characters")
    .optional(),
  
  value_label_ar: z
    .string()
    .max(200, "Arabic label must not exceed 200 characters")
    .nullable()
    .optional(),
  
  description: z
    .string()
    .max(1000, "Description must not exceed 1000 characters")
    .nullable()
    .optional(),
  
  parent_value_id: z
    .number()
    .int()
    .positive()
    .nullable()
    .optional(),
  
  color_hex: z
    .string()
    .regex(HEX_COLOR, "Color must be a valid hex color (e.g., #22C55E)")
    .nullable()
    .optional(),
  
  icon_name: z
    .string()
    .max(50, "Icon name must not exceed 50 characters")
    .nullable()
    .optional(),
  
  badge_variant: z
    .string()
    .max(50, "Badge variant must not exceed 50 characters")
    .nullable()
    .optional(),
  
  sort_order: z.number().int().min(0).optional(),
  
  is_default: z.boolean().optional(),
  is_active: z.boolean().optional(),
  
  effective_from: z
    .string()
    .nullable()
    .optional()
    .refine(
      (val) => !val || !isNaN(Date.parse(val)),
      "Effective from must be a valid date"
    ),
  
  effective_to: z
    .string()
    .nullable()
    .optional()
    .refine(
      (val) => !val || !isNaN(Date.parse(val)),
      "Effective to must be a valid date"
    ),
  
  metadata_json: z
    .record(z.string(), z.unknown())
    .optional(),
}).refine(
  (data) => {
    if (data.effective_from && data.effective_to) {
      return new Date(data.effective_to) >= new Date(data.effective_from);
    }
    return true;
  },
  {
    message: "Effective to date must be after effective from date",
    path: ["effective_to"],
  }
);

export type UpdateLookupValueInput = z.infer<typeof updateLookupValueSchema>;

// ============================================================================
// Toggle Status/Lock Schemas
// ============================================================================

export const toggleLookupStatusSchema = z.object({
  id: z.number().int().positive(),
  is_active: z.boolean(),
  deactivation_reason: z
    .string()
    .max(500, "Deactivation reason must not exceed 500 characters")
    .nullable()
    .optional(),
});

export const toggleLookupLockSchema = z.object({
  id: z.number().int().positive(),
  is_locked: z.boolean(),
});

export const setDefaultValueSchema = z.object({
  id: z.number().int().positive(),
  category_id: z.number().int().positive(),
});

export const reorderValuesSchema = z.object({
  category_id: z.number().int().positive(),
  value_ids: z.array(z.number().int().positive()).min(1),
});
