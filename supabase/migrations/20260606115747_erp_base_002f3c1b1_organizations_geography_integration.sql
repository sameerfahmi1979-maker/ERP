-- ERP Base 002F.3C.1B.1: Organizations / Owner Companies Geography Integration
-- Phase 002F.3C.1B.1 - Add Geography FK Columns to owner_companies
-- Migration created: June 6, 2026
--
-- Purpose:
-- 1. Add geography FK columns (country_id, emirate_id, city_id, area_zone_id) to owner_companies table
-- 2. Create indexes for performance
-- 3. Migrate existing text data to FK columns where exact match found
-- 4. Create view for unmatched migration report
-- 5. Keep legacy text columns for backward compatibility
--
-- IMPORTANT: This migration is ADDITIVE and NON-DESTRUCTIVE
-- - Old text columns (country, emirate, city, area) are PRESERVED
-- - New FK columns are NULLABLE
-- - No data is lost

-- ---------------------------------------------------------------------------
-- 1. ADD GEOGRAPHY FK COLUMNS TO owner_companies
-- ---------------------------------------------------------------------------

ALTER TABLE public.owner_companies
  ADD COLUMN IF NOT EXISTS country_id bigint REFERENCES public.countries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS emirate_id bigint REFERENCES public.emirates(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS city_id bigint REFERENCES public.cities(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS area_zone_id bigint REFERENCES public.areas_zones(id) ON DELETE SET NULL;

-- ---------------------------------------------------------------------------
-- 2. CREATE INDEXES FOR PERFORMANCE
-- ---------------------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_owner_companies_country_id ON public.owner_companies(country_id);
CREATE INDEX IF NOT EXISTS idx_owner_companies_emirate_id ON public.owner_companies(emirate_id);
CREATE INDEX IF NOT EXISTS idx_owner_companies_city_id ON public.owner_companies(city_id);
CREATE INDEX IF NOT EXISTS idx_owner_companies_area_zone_id ON public.owner_companies(area_zone_id);

-- ---------------------------------------------------------------------------
-- 3. ADD COLUMN COMMENTS
-- ---------------------------------------------------------------------------

COMMENT ON COLUMN public.owner_companies.country_id IS 'FK to countries.id for structured geography. Legacy text location fields are retained temporarily for backward compatibility.';
COMMENT ON COLUMN public.owner_companies.emirate_id IS 'FK to emirates.id, used conceptually as Region / Emirate / Governorate for global compatibility.';
COMMENT ON COLUMN public.owner_companies.city_id IS 'FK to cities.id for structured geography.';
COMMENT ON COLUMN public.owner_companies.area_zone_id IS 'FK to areas_zones.id for structured geography. Enables industrial zones, residential areas, etc.';

-- ---------------------------------------------------------------------------
-- 4. DATA MIGRATION: COUNTRY MATCHING
-- ---------------------------------------------------------------------------

-- Match owner_companies.country (TEXT) → countries.id (BIGINT)
-- Exact match by country_code, name_en, name_ar
-- Includes safe UAE synonyms

UPDATE public.owner_companies oc
SET country_id = c.id
FROM public.countries c
WHERE oc.country_id IS NULL
  AND oc.country IS NOT NULL
  AND TRIM(oc.country) != ''
  AND (
    -- Exact match by code
    UPPER(TRIM(oc.country)) = UPPER(c.country_code)
    -- Exact match by English name
    OR LOWER(TRIM(oc.country)) = LOWER(TRIM(c.name_en))
    -- Exact match by Arabic name
    OR (c.name_ar IS NOT NULL AND LOWER(TRIM(oc.country)) = LOWER(TRIM(c.name_ar)))
    -- UAE synonyms
    OR (c.country_code = 'AE' AND LOWER(TRIM(oc.country)) IN (
      'uae', 'u.a.e', 'u.a.e.', 'united arab emirates', 'emirates', 'الإمارات', 'الامارات'
    ))
    -- Saudi Arabia synonyms
    OR (c.country_code = 'SA' AND LOWER(TRIM(oc.country)) IN (
      'saudi', 'saudi arabia', 'ksa', 'السعودية'
    ))
    -- Qatar synonyms
    OR (c.country_code = 'QA' AND LOWER(TRIM(oc.country)) IN (
      'qatar', 'قطر'
    ))
    -- Oman synonyms
    OR (c.country_code = 'OM' AND LOWER(TRIM(oc.country)) IN (
      'oman', 'عمان'
    ))
    -- Bahrain synonyms
    OR (c.country_code = 'BH' AND LOWER(TRIM(oc.country)) IN (
      'bahrain', 'البحرين'
    ))
    -- Kuwait synonyms
    OR (c.country_code = 'KW' AND LOWER(TRIM(oc.country)) IN (
      'kuwait', 'الكويت'
    ))
  );

-- ---------------------------------------------------------------------------
-- 5. DATA MIGRATION: EMIRATE/REGION MATCHING
-- ---------------------------------------------------------------------------

-- Match owner_companies.emirate (TEXT) → emirates.id (BIGINT)
-- Filter by country_id if available
-- Exact match by emirate_code, name_en, name_ar
-- Includes safe UAE emirate synonyms

UPDATE public.owner_companies oc
SET emirate_id = e.id
FROM public.emirates e
WHERE oc.emirate_id IS NULL
  AND oc.emirate IS NOT NULL
  AND TRIM(oc.emirate) != ''
  -- Filter by country if already matched
  AND (oc.country_id IS NULL OR e.country_id = oc.country_id)
  AND (
    -- Exact match by emirate_code
    UPPER(TRIM(oc.emirate)) = UPPER(e.emirate_code)
    -- Exact match by English name
    OR LOWER(TRIM(oc.emirate)) = LOWER(TRIM(e.name_en))
    -- Exact match by Arabic name
    OR (e.name_ar IS NOT NULL AND LOWER(TRIM(oc.emirate)) = LOWER(TRIM(e.name_ar)))
    -- UAE emirate synonyms
    OR LOWER(TRIM(oc.emirate)) IN (
      -- Abu Dhabi variants
      CASE WHEN e.emirate_code = 'AD' THEN 'abu dhabi' ELSE NULL END,
      CASE WHEN e.emirate_code = 'AD' THEN 'abudhabi' ELSE NULL END,
      CASE WHEN e.emirate_code = 'AD' THEN 'ad' ELSE NULL END,
      CASE WHEN e.emirate_code = 'AD' THEN 'adh' ELSE NULL END,
      CASE WHEN e.emirate_code = 'AD' THEN 'auh' ELSE NULL END,
      CASE WHEN e.emirate_code = 'AD' THEN 'أبوظبي' ELSE NULL END,
      -- Dubai variants
      CASE WHEN e.emirate_code = 'DB' THEN 'dubai' ELSE NULL END,
      CASE WHEN e.emirate_code = 'DB' THEN 'dxb' ELSE NULL END,
      CASE WHEN e.emirate_code = 'DB' THEN 'db' ELSE NULL END,
      CASE WHEN e.emirate_code = 'DB' THEN 'دبي' ELSE NULL END,
      -- Sharjah variants
      CASE WHEN e.emirate_code = 'SH' THEN 'sharjah' ELSE NULL END,
      CASE WHEN e.emirate_code = 'SH' THEN 'shj' ELSE NULL END,
      CASE WHEN e.emirate_code = 'SH' THEN 'الشارقة' ELSE NULL END,
      -- Ajman variants
      CASE WHEN e.emirate_code = 'AJ' THEN 'ajman' ELSE NULL END,
      CASE WHEN e.emirate_code = 'AJ' THEN 'ajm' ELSE NULL END,
      CASE WHEN e.emirate_code = 'AJ' THEN 'عجمان' ELSE NULL END,
      -- Umm Al Quwain variants
      CASE WHEN e.emirate_code = 'UQ' THEN 'umm al quwain' ELSE NULL END,
      CASE WHEN e.emirate_code = 'UQ' THEN 'umm al qaiwain' ELSE NULL END,
      CASE WHEN e.emirate_code = 'UQ' THEN 'uaq' ELSE NULL END,
      CASE WHEN e.emirate_code = 'UQ' THEN 'أم القيوين' ELSE NULL END,
      -- Ras Al Khaimah variants
      CASE WHEN e.emirate_code = 'RK' THEN 'ras al khaimah' ELSE NULL END,
      CASE WHEN e.emirate_code = 'RK' THEN 'ras al-khaimah' ELSE NULL END,
      CASE WHEN e.emirate_code = 'RK' THEN 'rak' ELSE NULL END,
      CASE WHEN e.emirate_code = 'RK' THEN 'رأس الخيمة' ELSE NULL END,
      -- Fujairah variants
      CASE WHEN e.emirate_code = 'FJ' THEN 'fujairah' ELSE NULL END,
      CASE WHEN e.emirate_code = 'FJ' THEN 'fuj' ELSE NULL END,
      CASE WHEN e.emirate_code = 'FJ' THEN 'الفجيرة' ELSE NULL END
    )
  );

-- If emirate was matched but country was not, infer country from emirate
UPDATE public.owner_companies oc
SET country_id = e.country_id
FROM public.emirates e
WHERE oc.country_id IS NULL
  AND oc.emirate_id IS NOT NULL
  AND e.id = oc.emirate_id
  AND e.country_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 6. DATA MIGRATION: CITY MATCHING
-- ---------------------------------------------------------------------------

-- Match owner_companies.city (TEXT) → cities.id (BIGINT)
-- Filter by emirate_id and/or country_id if available

UPDATE public.owner_companies oc
SET city_id = ct.id
FROM public.cities ct
WHERE oc.city_id IS NULL
  AND oc.city IS NOT NULL
  AND TRIM(oc.city) != ''
  -- Filter by emirate if already matched
  AND (oc.emirate_id IS NULL OR ct.emirate_id = oc.emirate_id)
  -- Filter by country if already matched
  AND (oc.country_id IS NULL OR ct.country_id = oc.country_id)
  AND (
    -- Exact match by city_code
    UPPER(TRIM(oc.city)) = UPPER(ct.city_code)
    -- Exact match by English name
    OR LOWER(TRIM(oc.city)) = LOWER(TRIM(ct.name_en))
    -- Exact match by Arabic name
    OR (ct.name_ar IS NOT NULL AND LOWER(TRIM(oc.city)) = LOWER(TRIM(ct.name_ar)))
  );

-- If city was matched but emirate/country not, infer from city
UPDATE public.owner_companies oc
SET emirate_id = ct.emirate_id,
    country_id = ct.country_id
FROM public.cities ct
WHERE oc.city_id IS NOT NULL
  AND ct.id = oc.city_id
  AND (
    (oc.emirate_id IS NULL AND ct.emirate_id IS NOT NULL)
    OR (oc.country_id IS NULL AND ct.country_id IS NOT NULL)
  );

-- ---------------------------------------------------------------------------
-- 7. DATA MIGRATION: AREA/ZONE MATCHING
-- ---------------------------------------------------------------------------

-- Match owner_companies.area (TEXT) → areas_zones.id (BIGINT)
-- Filter by city_id if available

UPDATE public.owner_companies oc
SET area_zone_id = az.id
FROM public.areas_zones az
WHERE oc.area_zone_id IS NULL
  AND oc.area IS NOT NULL
  AND TRIM(oc.area) != ''
  -- Filter by city if already matched
  AND (oc.city_id IS NULL OR az.city_id = oc.city_id)
  AND (
    -- Exact match by area_code
    UPPER(TRIM(oc.area)) = UPPER(az.area_code)
    -- Exact match by English name
    OR LOWER(TRIM(oc.area)) = LOWER(TRIM(az.name_en))
    -- Exact match by Arabic name
    OR (az.name_ar IS NOT NULL AND LOWER(TRIM(oc.area)) = LOWER(TRIM(az.name_ar)))
  );

-- ---------------------------------------------------------------------------
-- 8. CREATE UNMATCHED MIGRATION REPORT VIEW
-- ---------------------------------------------------------------------------

-- This view shows owner companies with legacy text values that could not be matched
-- to geography master data, requiring manual review and correction

CREATE OR REPLACE VIEW public.v_owner_companies_geography_migration_unmatched AS
SELECT
  oc.id,
  oc.company_code,
  oc.legal_name_en,
  oc.legal_name_ar,
  -- Legacy text values
  oc.country AS legacy_country_text,
  oc.emirate AS legacy_emirate_text,
  oc.city AS legacy_city_text,
  oc.area AS legacy_area_text,
  -- New FK values
  oc.country_id,
  oc.emirate_id,
  oc.city_id,
  oc.area_zone_id,
  -- Match status flags
  CASE 
    WHEN oc.country IS NOT NULL AND TRIM(oc.country) != '' AND oc.country_id IS NULL 
    THEN true 
    ELSE false 
  END AS unmatched_country,
  CASE 
    WHEN oc.emirate IS NOT NULL AND TRIM(oc.emirate) != '' AND oc.emirate_id IS NULL 
    THEN true 
    ELSE false 
  END AS unmatched_emirate,
  CASE 
    WHEN oc.city IS NOT NULL AND TRIM(oc.city) != '' AND oc.city_id IS NULL 
    THEN true 
    ELSE false 
  END AS unmatched_city,
  CASE 
    WHEN oc.area IS NOT NULL AND TRIM(oc.area) != '' AND oc.area_zone_id IS NULL 
    THEN true 
    ELSE false 
  END AS unmatched_area,
  -- Audit fields
  oc.created_at,
  oc.updated_at,
  oc.status
FROM public.owner_companies oc
WHERE
  (oc.country IS NOT NULL AND TRIM(oc.country) != '' AND oc.country_id IS NULL)
  OR (oc.emirate IS NOT NULL AND TRIM(oc.emirate) != '' AND oc.emirate_id IS NULL)
  OR (oc.city IS NOT NULL AND TRIM(oc.city) != '' AND oc.city_id IS NULL)
  OR (oc.area IS NOT NULL AND TRIM(oc.area) != '' AND oc.area_zone_id IS NULL)
ORDER BY oc.company_code;

-- Grant access to view for authenticated users (follows RLS on owner_companies)
COMMENT ON VIEW public.v_owner_companies_geography_migration_unmatched IS 
  'Shows owner companies with legacy location text that could not be automatically matched to geography master data. '
  'Requires manual review and correction by system admin. '
  'Created by ERP BASE 002F.3C.1B.1 migration.';

-- ---------------------------------------------------------------------------
-- MIGRATION COMPLETE
-- ---------------------------------------------------------------------------

-- Summary:
-- ✅ Added 4 geography FK columns to owner_companies (country_id, emirate_id, city_id, area_zone_id)
-- ✅ Created indexes for performance
-- ✅ Migrated existing text data to FK columns where exact match found
-- ✅ Created unmatched migration report view
-- ✅ Preserved all legacy text columns (country, emirate, city, area)
-- ✅ No data loss - all operations additive and non-destructive
--
-- Next steps:
-- 1. Query v_owner_companies_geography_migration_unmatched to see unmatched records
-- 2. Manually review and correct unmatched records via UI
-- 3. Update UI forms to use geography select components
-- 4. After verification period (3-6 months), consider deprecating legacy text columns
