/**
 * TypeScript types for Global Lookup / Dropdown Engine
 * Phase 002F.3B
 */

// ============================================================================
// Database Types
// ============================================================================

export type CategoryScope = 'GLOBAL' | 'COMPANY' | 'BRANCH' | 'MODULE';

export interface LookupCategory {
  id: number;
  category_code: string;
  category_name_en: string;
  category_name_ar: string | null;
  description: string | null;
  module_code: string | null;
  category_scope: CategoryScope;
  supports_hierarchy: boolean;
  supports_color: boolean;
  supports_icon: boolean;
  supports_effective_dates: boolean;
  supports_metadata: boolean;
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

export interface LookupValue {
  id: number;
  category_id: number;
  value_code: string;
  value_label_en: string;
  value_label_ar: string | null;
  description: string | null;
  parent_value_id: number | null;
  color_hex: string | null;
  icon_name: string | null;
  badge_variant: string | null;
  sort_order: number;
  is_default: boolean;
  is_system: boolean;
  is_locked: boolean;
  is_active: boolean;
  effective_from: string | null;
  effective_to: string | null;
  metadata_json: Record<string, unknown>;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  updated_by: number | null;
  deactivated_at: string | null;
  deactivated_by: number | null;
  deactivation_reason: string | null;
}

// ============================================================================
// Extended Types (with relationships)
// ============================================================================

export interface LookupCategoryWithStats extends LookupCategory {
  total_values?: number;
  active_values?: number;
  inactive_values?: number;
  locked_values?: number;
}

export interface LookupValueWithCategory extends LookupValue {
  category?: {
    category_code: string;
    category_name_en: string;
    category_name_ar: string | null;
  };
  parent_value?: {
    value_code: string;
    value_label_en: string;
    value_label_ar: string | null;
  };
}

// ============================================================================
// Input Types (for create/update operations)
// ============================================================================

export interface CreateLookupCategoryInput {
  category_code: string;
  category_name_en: string;
  category_name_ar?: string | null;
  description?: string | null;
  module_code?: string | null;
  category_scope?: CategoryScope;
  supports_hierarchy?: boolean;
  supports_color?: boolean;
  supports_icon?: boolean;
  supports_effective_dates?: boolean;
  supports_metadata?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

export interface UpdateLookupCategoryInput {
  id: number;
  category_name_en?: string;
  category_name_ar?: string | null;
  description?: string | null;
  module_code?: string | null;
  category_scope?: CategoryScope;
  supports_hierarchy?: boolean;
  supports_color?: boolean;
  supports_icon?: boolean;
  supports_effective_dates?: boolean;
  supports_metadata?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

export interface CreateLookupValueInput {
  category_id: number;
  value_code: string;
  value_label_en: string;
  value_label_ar?: string | null;
  description?: string | null;
  parent_value_id?: number | null;
  color_hex?: string | null;
  icon_name?: string | null;
  badge_variant?: string | null;
  sort_order?: number;
  is_default?: boolean;
  is_active?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
  metadata_json?: Record<string, unknown>;
}

export interface UpdateLookupValueInput {
  id: number;
  value_label_en?: string;
  value_label_ar?: string | null;
  description?: string | null;
  parent_value_id?: number | null;
  color_hex?: string | null;
  icon_name?: string | null;
  badge_variant?: string | null;
  sort_order?: number;
  is_default?: boolean;
  is_active?: boolean;
  effective_from?: string | null;
  effective_to?: string | null;
  metadata_json?: Record<string, unknown>;
}

// ============================================================================
// Filter/Query Types
// ============================================================================

export interface LookupCategoryFilters {
  search?: string;
  is_active?: boolean;
  is_system?: boolean;
  is_locked?: boolean;
  module_code?: string;
  category_scope?: CategoryScope;
}

export interface LookupValueFilters {
  search?: string;
  category_id?: number;
  category_code?: string;
  is_active?: boolean;
  is_system?: boolean;
  is_locked?: boolean;
  is_default?: boolean;
  parent_value_id?: number | null;
}

// ============================================================================
// Component Props Types
// ============================================================================

export interface LookupSelectOption {
  value: string | number;
  label: string;
  color?: string;
  icon?: string;
  badge_variant?: string;
  is_default?: boolean;
  parent_value_id?: number | null;
}

export interface LookupSelectProps {
  categoryCode: string;
  value?: string | number | null;
  onValueChange?: (value: string | number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  includeInactive?: boolean;
  parentValueCode?: string;
  language?: 'en' | 'ar';
  showCode?: boolean;
  showColor?: boolean;
  allowClear?: boolean;
  valueField?: 'id' | 'code';  // NEW: Choose between ID or code
  className?: string;
  name?: string;
  error?: string;
}

// ============================================================================
// Dashboard Stats Types
// ============================================================================

export interface LookupDashboardStats {
  total_categories: number;
  active_categories: number;
  inactive_categories: number;
  locked_categories: number;
  total_values: number;
  active_values: number;
  inactive_values: number;
  locked_values: number;
  recently_updated: Array<{
    category_name: string;
    value_label: string;
    updated_at: string;
    updated_by_name: string | null;
  }>;
}
