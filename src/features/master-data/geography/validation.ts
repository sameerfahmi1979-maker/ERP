/**
 * Zod validation schemas for Geography & Locations Master Data
 * Phase 002F.3C.1
 */

import { z } from "zod";

// ============================================================================
// Helper Regex Patterns
// ============================================================================

const ISO2_COUNTRY_CODE = /^[A-Z]{2}$/;
const ISO3_COUNTRY_CODE = /^[A-Z]{3}$/;
const EMIRATE_CODE = /^[A-Z]{3}$/;
const UPPERCASE_ALPHA_UNDERSCORE = /^[A-Z0-9_]+$/;
const ICAO_CODE = /^[A-Z]{4}$/;
const IATA_CODE = /^[A-Z]{3}$/;

// ============================================================================
// Create Country Schema
// ============================================================================

export const createCountrySchema = z.object({
  country_code: z
    .string()
    .length(2, "Country code must be exactly 2 characters (ISO 3166-1 alpha-2)")
    .regex(ISO2_COUNTRY_CODE, "Country code must be uppercase letters only (e.g., AE, SA)")
    .transform(val => val.toUpperCase()),
  
  iso3_code: z
    .string()
    .length(3, "ISO3 code must be exactly 3 characters (ISO 3166-1 alpha-3)")
    .regex(ISO3_COUNTRY_CODE, "ISO3 code must be uppercase letters only (e.g., ARE, SAU)")
    .transform(val => val.toUpperCase()),
  
  name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters"),
  
  name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),
  
  nationality_en: z
    .string()
    .min(2, "English nationality is required (minimum 2 characters)")
    .max(100, "English nationality must not exceed 100 characters"),
  
  nationality_ar: z
    .string()
    .max(100, "Arabic nationality must not exceed 100 characters")
    .nullable()
    .optional(),
  
  phone_code: z
    .string()
    .max(10, "Phone code must not exceed 10 characters")
    .nullable()
    .optional(),
  
  default_currency_code: z
    .string()
    .length(3, "Currency code must be exactly 3 characters (e.g., AED, USD)")
    .nullable()
    .optional(),
  
  is_gcc: z.boolean().default(false),
  is_uae: z.boolean().default(false),
  sort_order: z.number().int().min(0).default(0),
});

export type CreateCountryInput = z.infer<typeof createCountrySchema>;

// ============================================================================
// Update Country Schema
// ============================================================================

export const updateCountrySchema = z.object({
  id: z.number().int().positive(),
  
  // country_code and iso3_code are NOT updatable (immutable)
  
  name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters")
    .optional(),
  
  name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),
  
  nationality_en: z
    .string()
    .min(2, "English nationality is required (minimum 2 characters)")
    .max(100, "English nationality must not exceed 100 characters")
    .optional(),
  
  nationality_ar: z
    .string()
    .max(100, "Arabic nationality must not exceed 100 characters")
    .nullable()
    .optional(),
  
  phone_code: z
    .string()
    .max(10, "Phone code must not exceed 10 characters")
    .nullable()
    .optional(),
  
  default_currency_code: z
    .string()
    .length(3, "Currency code must be exactly 3 characters (e.g., AED, USD)")
    .nullable()
    .optional(),
  
  is_gcc: z.boolean().optional(),
  is_uae: z.boolean().optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export type UpdateCountryInput = z.infer<typeof updateCountrySchema>;

// ============================================================================
// Create Emirate Schema
// ============================================================================

export const createEmirateSchema = z.object({
  emirate_code: z
    .string()
    .length(3, "Region code must be exactly 3 characters")
    .regex(EMIRATE_CODE, "Region code must be uppercase letters only (e.g., AUH, DXB, AMM)")
    .transform(val => val.toUpperCase()),
  
  name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters"),
  
  name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),
  
  abbreviation_en: z
    .string()
    .min(1, "English abbreviation is required")
    .max(20, "English abbreviation must not exceed 20 characters"),
  
  abbreviation_ar: z
    .string()
    .max(20, "Arabic abbreviation must not exceed 20 characters")
    .nullable()
    .optional(),
  
  country_id: z.number().int().positive("Country is required").nullable().optional(),
  
  region_type_code: z
    .string()
    .max(50, "Region type code must not exceed 50 characters")
    .nullable()
    .optional(),
  
  sort_order: z.number().int().min(0).default(0),
});

export type CreateEmirateInput = z.infer<typeof createEmirateSchema>;

// ============================================================================
// Update Emirate Schema
// ============================================================================

export const updateEmirateSchema = z.object({
  id: z.number().int().positive(),
  
  // emirate_code is NOT updatable (immutable)
  
  name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters")
    .optional(),
  
  name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),
  
  abbreviation_en: z
    .string()
    .min(1, "English abbreviation is required")
    .max(20, "English abbreviation must not exceed 20 characters")
    .optional(),
  
  abbreviation_ar: z
    .string()
    .max(20, "Arabic abbreviation must not exceed 20 characters")
    .nullable()
    .optional(),
  
  country_id: z.number().int().positive("Country is required").nullable().optional(),
  
  region_type_code: z
    .string()
    .max(50, "Region type code must not exceed 50 characters")
    .nullable()
    .optional(),
  
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export type UpdateEmirateInput = z.infer<typeof updateEmirateSchema>;

// ============================================================================
// Create City Schema
// ============================================================================

export const createCitySchema = z.object({
  city_code: z
    .string()
    .min(2, "City code is required (minimum 2 characters)")
    .max(100, "City code must not exceed 100 characters")
    .regex(UPPERCASE_ALPHA_UNDERSCORE, "City code must contain only uppercase letters, numbers, and underscores")
    .transform(val => val.toUpperCase()),
  
  name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters"),
  
  name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),
  
  emirate_id: z.number().int().positive("Region / Emirate / Governorate is required"),
  
  country_id: z.number().int().positive().nullable().optional(),
  
  sort_order: z.number().int().min(0).default(0),
});

export type CreateCityInput = z.infer<typeof createCitySchema>;

// ============================================================================
// Update City Schema
// ============================================================================

export const updateCitySchema = z.object({
  id: z.number().int().positive(),
  
  // city_code is NOT updatable (immutable)
  
  name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters")
    .optional(),
  
  name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),
  
  emirate_id: z.number().int().positive("Region / Emirate / Governorate is required").optional(),
  
  country_id: z.number().int().positive().nullable().optional(),
  
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export type UpdateCityInput = z.infer<typeof updateCitySchema>;

// ============================================================================
// Create Area/Zone Schema
// ============================================================================

export const createAreaZoneSchema = z.object({
  area_code: z
    .string()
    .min(2, "Area code is required (minimum 2 characters)")
    .max(100, "Area code must not exceed 100 characters")
    .regex(UPPERCASE_ALPHA_UNDERSCORE, "Area code must contain only uppercase letters, numbers, and underscores")
    .transform(val => val.toUpperCase()),
  
  name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters"),
  
  name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),
  
  city_id: z.number().int().positive("City is required"),
  
  area_type_code: z
    .string()
    .max(50, "Area type code must not exceed 50 characters")
    .nullable()
    .optional(),
  
  sort_order: z.number().int().min(0).default(0),
});

export type CreateAreaZoneInput = z.infer<typeof createAreaZoneSchema>;

// ============================================================================
// Update Area/Zone Schema
// ============================================================================

export const updateAreaZoneSchema = z.object({
  id: z.number().int().positive(),
  
  // area_code is NOT updatable (immutable)
  
  name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters")
    .optional(),
  
  name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),
  
  city_id: z.number().int().positive("City is required").optional(),
  
  area_type_code: z
    .string()
    .max(50, "Area type code must not exceed 50 characters")
    .nullable()
    .optional(),
  
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export type UpdateAreaZoneInput = z.infer<typeof updateAreaZoneSchema>;

// ============================================================================
// Create Port Schema
// ============================================================================

export const createPortSchema = z.object({
  port_code: z
    .string()
    .min(2, "Port code is required (minimum 2 characters)")
    .max(100, "Port code must not exceed 100 characters")
    .regex(UPPERCASE_ALPHA_UNDERSCORE, "Port code must contain only uppercase letters, numbers, and underscores")
    .transform(val => val.toUpperCase()),
  
  name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters"),
  
  name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),
  
  emirate_id: z.number().int().positive("Region / Emirate / Governorate is required"),
  
  country_id: z.number().int().positive().nullable().optional(),
  
  port_type_code: z
    .string()
    .min(1, "Port type is required")
    .max(50, "Port type code must not exceed 50 characters"),
  
  icao_code: z
    .string()
    .length(4, "ICAO code must be exactly 4 characters")
    .regex(ICAO_CODE, "ICAO code must be uppercase letters only (e.g., OMDB)")
    .transform(val => val.toUpperCase())
    .nullable()
    .optional(),
  
  iata_code: z
    .string()
    .length(3, "IATA code must be exactly 3 characters")
    .regex(IATA_CODE, "IATA code must be uppercase letters only (e.g., DXB)")
    .transform(val => val.toUpperCase())
    .nullable()
    .optional(),
  
  sort_order: z.number().int().min(0).default(0),
});

export type CreatePortInput = z.infer<typeof createPortSchema>;

// ============================================================================
// Update Port Schema
// ============================================================================

export const updatePortSchema = z.object({
  id: z.number().int().positive(),
  
  // port_code is NOT updatable (immutable)
  
  name_en: z
    .string()
    .min(2, "English name is required (minimum 2 characters)")
    .max(255, "English name must not exceed 255 characters")
    .optional(),
  
  name_ar: z
    .string()
    .max(255, "Arabic name must not exceed 255 characters")
    .nullable()
    .optional(),
  
  emirate_id: z.number().int().positive("Region / Emirate / Governorate is required").optional(),
  
  country_id: z.number().int().positive().nullable().optional(),
  
  port_type_code: z
    .string()
    .min(1, "Port type is required")
    .max(50, "Port type code must not exceed 50 characters")
    .optional(),
  
  icao_code: z
    .string()
    .length(4, "ICAO code must be exactly 4 characters")
    .regex(ICAO_CODE, "ICAO code must be uppercase letters only (e.g., OMDB)")
    .transform(val => val.toUpperCase())
    .nullable()
    .optional(),
  
  iata_code: z
    .string()
    .length(3, "IATA code must be exactly 3 characters")
    .regex(IATA_CODE, "IATA code must be uppercase letters only (e.g., DXB)")
    .transform(val => val.toUpperCase())
    .nullable()
    .optional(),
  
  is_active: z.boolean().optional(),
  sort_order: z.number().int().min(0).optional(),
});

export type UpdatePortInput = z.infer<typeof updatePortSchema>;

// ============================================================================
// Toggle Lock Schema
// ============================================================================

export const toggleGeographyLockSchema = z.object({
  id: z.number().int().positive(),
  is_locked: z.boolean(),
});

export type ToggleGeographyLockInput = z.infer<typeof toggleGeographyLockSchema>;

// ============================================================================
// Toggle Status Schemas
// ============================================================================

export const toggleGeographyStatusSchema = z.object({
  id: z.number().int().positive(),
  is_active: z.boolean(),
  deactivation_reason: z
    .string()
    .max(500, "Deactivation reason must not exceed 500 characters")
    .nullable()
    .optional(),
});

export type ToggleGeographyStatusInput = z.infer<typeof toggleGeographyStatusSchema>;
