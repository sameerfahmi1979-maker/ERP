/**
 * TypeScript types for Units & Measurements Master Data
 * Phase 002F.3C.3
 */

// ============================================================================
// Database Types
// ============================================================================

export interface UomCategory {
  id: number;
  category_code: string;
  category_name_en: string;
  category_name_ar: string | null;
  description_en: string | null;
  description_ar: string | null;
  notes: string | null;
  is_system: boolean;
  is_locked: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
}

export interface UnitOfMeasure {
  id: number;
  uom_category_id: number;
  unit_code: string;
  unit_name_en: string;
  unit_name_ar: string | null;
  symbol: string | null;
  conversion_factor_to_base: number;
  is_base_unit: boolean;
  decimal_places: number;
  allow_fraction: boolean;
  description_en: string | null;
  description_ar: string | null;
  notes: string | null;
  is_system: boolean;
  is_locked: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
}

export interface UomConversion {
  id: number;
  from_uom_id: number;
  to_uom_id: number;
  conversion_factor: number;
  conversion_formula_code: string | null;
  is_bidirectional: boolean;
  notes: string | null;
  is_system: boolean;
  is_locked: boolean;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
}

// ============================================================================
// Extended Types with Relations
// ============================================================================

export interface UnitOfMeasureWithCategory extends UnitOfMeasure {
  category?: UomCategory;
}

export interface UomConversionWithUnits extends UomConversion {
  from_unit?: UnitOfMeasure;
  to_unit?: UnitOfMeasure;
}

// ============================================================================
// Filter Types
// ============================================================================

export interface UomCategoryFilters {
  searchTerm?: string;
  isActive?: boolean;
  isSystem?: boolean;
}

export interface UnitOfMeasureFilters {
  searchTerm?: string;
  categoryId?: number;
  isActive?: boolean;
  isBaseUnit?: boolean;
  isSystem?: boolean;
}

export interface UomConversionFilters {
  searchTerm?: string;
  fromUomId?: number;
  toUomId?: number;
  isActive?: boolean;
  isSystem?: boolean;
}

// ============================================================================
// Select Component Types
// ============================================================================

export interface UomSelectOption {
  id: number;
  code: string;
  name_en: string;
  name_ar: string | null;
  symbol?: string | null;
  is_base_unit?: boolean;
}

export interface UomSelectProps {
  value: number | null;
  onValueChange?: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  includeInactive?: boolean;
  language?: "en" | "ar";
  showCode?: boolean;
  showSymbol?: boolean;
  allowClear?: boolean;
  className?: string;
  name?: string;
  error?: string;
}

export interface UnitByCategorySelectProps extends UomSelectProps {
  categoryId?: number | null;
  excludeId?: number;
}
