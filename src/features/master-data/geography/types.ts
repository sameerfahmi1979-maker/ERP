/**
 * TypeScript types for Geography & Locations Master Data
 * Phase 002F.3C.1
 */

// ============================================================================
// Database Types
// ============================================================================

export interface Country {
  id: number;
  country_code: string;
  iso3_code: string;
  name_en: string;
  name_ar: string | null;
  nationality_en: string;
  nationality_ar: string | null;
  phone_code: string | null;
  default_currency_code: string | null;
  is_gcc: boolean;
  is_uae: boolean;
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

// NOTE: The emirates table is used as the administrative_regions concept globally.
// For UAE, records are Emirates. For other countries, records may be Governorates, States, Provinces, or Regions.
// The table name remains "emirates" and FK column remains "emirate_id" for backward compatibility.
export interface Emirate {
  id: number;
  emirate_code: string;
  name_en: string;
  name_ar: string | null;
  abbreviation_en: string;
  abbreviation_ar: string | null;
  country_id?: number | null; // Parent country for this administrative region (added for global support)
  region_type_code?: string | null; // Type from REGION_TYPES lookup (EMIRATE, GOVERNORATE, STATE, PROVINCE, REGION)
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

// Type alias for clarity (can be used interchangeably with Emirate)
export type AdministrativeRegion = Emirate;

export interface City {
  id: number;
  city_code: string;
  name_en: string;
  name_ar: string | null;
  emirate_id: number; // emirate_id remains required and represents the administrative region
  country_id?: number | null; // country_id is added for global geography support and reporting
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

export interface AreaZone {
  id: number;
  area_code: string;
  name_en: string;
  name_ar: string | null;
  city_id: number;
  area_type_code: string | null;
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

export interface Port {
  id: number;
  port_code: string;
  name_en: string;
  name_ar: string | null;
  emirate_id: number; // emirate_id remains required and represents the administrative region
  country_id?: number | null; // country_id is added for global geography support and reporting
  port_type_code: string;
  icao_code: string | null;
  iata_code: string | null;
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
// Extended Types (with relationships)
// ============================================================================

export interface CityWithEmirate extends City {
  emirate?: {
    emirate_code: string;
    name_en: string;
    name_ar: string | null;
  };
}

export interface AreaZoneWithRelations extends AreaZone {
  city?: {
    city_code: string;
    name_en: string;
    name_ar: string | null;
  };
  emirate?: {
    emirate_code: string;
    name_en: string;
    name_ar: string | null;
  };
  area_type?: {
    value_code: string;
    value_label_en: string;
    value_label_ar: string | null;
  };
}

export interface PortWithRelations extends Port {
  emirate?: {
    emirate_code: string;
    name_en: string;
    name_ar: string | null;
  };
  port_type?: {
    value_code: string;
    value_label_en: string;
    value_label_ar: string | null;
  };
}

// ============================================================================
// Input Types (for create/update operations)
// ============================================================================

export interface CreateCountryInput {
  country_code: string;
  iso3_code: string;
  name_en: string;
  name_ar?: string | null;
  nationality_en: string;
  nationality_ar?: string | null;
  phone_code?: string | null;
  default_currency_code?: string | null;
  is_gcc?: boolean;
  is_uae?: boolean;
  sort_order?: number;
}

export interface UpdateCountryInput {
  id: number;
  name_en?: string;
  name_ar?: string | null;
  nationality_en?: string;
  nationality_ar?: string | null;
  phone_code?: string | null;
  default_currency_code?: string | null;
  is_gcc?: boolean;
  is_uae?: boolean;
  is_active?: boolean;
  sort_order?: number;
}

export interface CreateEmirateInput {
  emirate_code: string;
  name_en: string;
  name_ar?: string | null;
  abbreviation_en: string;
  abbreviation_ar?: string | null;
  country_id?: number | null; // Parent country for this administrative region
  region_type_code?: string | null; // Type from REGION_TYPES lookup
  sort_order?: number;
}

export interface UpdateEmirateInput {
  id: number;
  name_en?: string;
  name_ar?: string | null;
  abbreviation_en?: string;
  abbreviation_ar?: string | null;
  country_id?: number | null; // Parent country for this administrative region
  region_type_code?: string | null; // Type from REGION_TYPES lookup
  is_active?: boolean;
  sort_order?: number;
}

export interface CreateCityInput {
  city_code: string;
  name_en: string;
  name_ar?: string | null;
  emirate_id: number; // emirate_id remains required (represents administrative region)
  country_id?: number | null; // country_id is optional (inferred from emirate if not provided)
  sort_order?: number;
}

export interface UpdateCityInput {
  id: number;
  name_en?: string;
  name_ar?: string | null;
  emirate_id?: number; // emirate_id remains required in updates
  country_id?: number | null; // country_id is optional
  is_active?: boolean;
  sort_order?: number;
}

export interface CreateAreaZoneInput {
  area_code: string;
  name_en: string;
  name_ar?: string | null;
  city_id: number;
  area_type_code?: string | null;
  sort_order?: number;
}

export interface UpdateAreaZoneInput {
  id: number;
  name_en?: string;
  name_ar?: string | null;
  city_id?: number;
  area_type_code?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

export interface CreatePortInput {
  port_code: string;
  name_en: string;
  name_ar?: string | null;
  emirate_id: number; // emirate_id remains required (represents administrative region)
  country_id?: number | null; // country_id is optional (inferred from emirate if not provided)
  port_type_code: string;
  icao_code?: string | null;
  iata_code?: string | null;
  sort_order?: number;
}

export interface UpdatePortInput {
  id: number;
  name_en?: string;
  name_ar?: string | null;
  emirate_id?: number; // emirate_id remains required in updates
  country_id?: number | null; // country_id is optional
  port_type_code?: string;
  icao_code?: string | null;
  iata_code?: string | null;
  is_active?: boolean;
  sort_order?: number;
}

// ============================================================================
// Filter/Query Types
// ============================================================================

export interface CountryFilters {
  search?: string;
  is_active?: boolean;
  is_gcc?: boolean;
  is_uae?: boolean;
  is_system?: boolean;
  is_locked?: boolean;
}

export interface EmirateFilters {
  search?: string;
  country_id?: number; // Filter by parent country
  is_active?: boolean;
  is_system?: boolean;
  is_locked?: boolean;
}

export interface CityFilters {
  search?: string;
  emirate_id?: number;
  country_id?: number; // Filter by parent country
  is_active?: boolean;
  is_system?: boolean;
  is_locked?: boolean;
}

export interface AreaZoneFilters {
  search?: string;
  city_id?: number;
  emirate_id?: number;
  area_type_code?: string;
  is_active?: boolean;
  is_system?: boolean;
  is_locked?: boolean;
}

export interface PortFilters {
  search?: string;
  emirate_id?: number;
  country_id?: number; // Filter by parent country
  port_type_code?: string;
  is_active?: boolean;
  is_system?: boolean;
  is_locked?: boolean;
}

// ============================================================================
// Select Component Props Types
// ============================================================================

export interface GeographySelectOption {
  value: number;
  label: string;
  code?: string;
  parent_id?: number | null;
  is_system?: boolean;
  is_locked?: boolean;
}

export interface CountrySelectProps {
  value?: number | null;
  onValueChange?: (value: number | null) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  gccOnly?: boolean;
  includeInactive?: boolean;
  language?: 'en' | 'ar';
  showCode?: boolean;
  allowClear?: boolean;
  className?: string;
  name?: string;
  error?: string;
}

export interface EmirateSelectProps {
  value?: number | null;
  onValueChange?: (value: number | null) => void;
  countryId?: number | null; // Filter regions/emirates by country (for global support)
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  includeInactive?: boolean;
  language?: 'en' | 'ar';
  showCode?: boolean;
  allowClear?: boolean;
  className?: string;
  name?: string;
  error?: string;
}

export interface CitySelectProps {
  value?: number | null;
  onValueChange?: (value: number | null) => void;
  emirateId?: number | null;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  includeInactive?: boolean;
  language?: 'en' | 'ar';
  showCode?: boolean;
  allowClear?: boolean;
  className?: string;
  name?: string;
  error?: string;
}

export interface AreaZoneSelectProps {
  value?: number | null;
  onValueChange?: (value: number | null) => void;
  cityId?: number | null;
  areaTypeCode?: string | null;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  includeInactive?: boolean;
  language?: 'en' | 'ar';
  showCode?: boolean;
  allowClear?: boolean;
  className?: string;
  name?: string;
  error?: string;
}

export interface PortSelectProps {
  value?: number | null;
  onValueChange?: (value: number | null) => void;
  emirateId?: number | null;
  portTypeCode?: string | null;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  includeInactive?: boolean;
  language?: 'en' | 'ar';
  showCode?: boolean;
  allowClear?: boolean;
  className?: string;
  name?: string;
  error?: string;
}

// ============================================================================
// Dashboard Stats Types
// ============================================================================

export interface GeographyDashboardStats {
  total_countries: number;
  gcc_countries: number;
  total_emirates: number;
  total_cities: number;
  total_areas_zones: number;
  total_ports: number;
  ports_by_type: Array<{
    port_type_code: string;
    port_type_label: string;
    count: number;
  }>;
  areas_by_type: Array<{
    area_type_code: string;
    area_type_label: string;
    count: number;
  }>;
  cities_by_emirate: Array<{
    emirate_code: string;
    emirate_name: string;
    cities_count: number;
  }>;
}
