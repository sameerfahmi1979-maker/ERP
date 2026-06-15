-- ============================================================================
-- ERP BASE 002F.3C.1 — Geography Global Region Support
-- ============================================================================
-- Created: 2026-06-06
-- Purpose: Add global administrative region support while maintaining UAE compatibility
-- Changes:
--   - Add country_id to emirates table (treat as generic administrative regions)
--   - Add region_type_code to emirates table (EMIRATE, GOVERNORATE, STATE, PROVINCE)
--   - Add country_id to cities table (for reporting/filtering)
--   - Add country_id to ports table (for reporting/filtering)
--   - Update existing UAE data to link to UAE country
--   - Add REGION_TYPES lookup category
--   - Add example global seed data (Jordan, Saudi Arabia, USA)
-- Notes:
--   - emirates table conceptually represents administrative regions globally
--   - emirate_id column conceptually represents region reference
--   - cities.emirate_id and ports.emirate_id remain required (NOT NULL)
--   - Table/column names preserved for backward compatibility
-- ============================================================================

-- ============================================================================
-- 1. Add REGION_TYPES Lookup Category
-- ============================================================================

DO $$
DECLARE
  v_cat_id bigint;
  v_user_id bigint;
BEGIN
  -- Get system user profile ID
  SELECT id INTO v_user_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1;

  -- Insert REGION_TYPES category
  INSERT INTO public.global_lookup_categories (
    category_code,
    category_name_en,
    category_name_ar,
    description,
    module_code,
    category_scope,
    supports_hierarchy,
    supports_color,
    supports_icon,
    supports_effective_dates,
    supports_metadata,
    is_system,
    is_locked,
    is_active,
    sort_order,
    created_by
  ) VALUES (
    'REGION_TYPES',
    'Administrative Region Types',
    'أنواع المناطق الإدارية',
    'Types of administrative regions (Emirate, Governorate, State, Province, Region)',
    'MASTER_DATA',
    'GLOBAL',
    false,
    false,
    false,
    false,
    true,
    true,
    true,
    true,
    102,
    v_user_id
  )
  ON CONFLICT (category_code) DO NOTHING
  RETURNING id INTO v_cat_id;

  -- If category was just created, insert values
  IF v_cat_id IS NOT NULL THEN
    INSERT INTO public.global_lookup_values (category_id, value_code, value_label_en, value_label_ar, sort_order, is_system, is_locked, is_default, created_by)
    VALUES
      (v_cat_id, 'EMIRATE', 'Emirate', 'إمارة', 10, true, true, true, v_user_id),
      (v_cat_id, 'GOVERNORATE', 'Governorate', 'محافظة', 20, true, true, false, v_user_id),
      (v_cat_id, 'STATE', 'State', 'ولاية', 30, true, true, false, v_user_id),
      (v_cat_id, 'PROVINCE', 'Province', 'مقاطعة', 40, true, true, false, v_user_id),
      (v_cat_id, 'REGION', 'Region', 'منطقة', 50, true, true, false, v_user_id),
      (v_cat_id, 'TERRITORY', 'Territory', 'إقليم', 60, true, true, false, v_user_id)
    ON CONFLICT DO NOTHING;
  ELSE
    -- Category already exists, check if values need to be added
    SELECT id INTO v_cat_id FROM public.global_lookup_categories WHERE category_code = 'REGION_TYPES';
    IF v_cat_id IS NOT NULL THEN
      INSERT INTO public.global_lookup_values (category_id, value_code, value_label_en, value_label_ar, sort_order, is_system, is_locked, is_default, created_by)
      VALUES
        (v_cat_id, 'EMIRATE', 'Emirate', 'إمارة', 10, true, true, true, v_user_id),
        (v_cat_id, 'GOVERNORATE', 'Governorate', 'محافظة', 20, true, true, false, v_user_id),
        (v_cat_id, 'STATE', 'State', 'ولاية', 30, true, true, false, v_user_id),
        (v_cat_id, 'PROVINCE', 'Province', 'مقاطعة', 40, true, true, false, v_user_id),
        (v_cat_id, 'REGION', 'Region', 'منطقة', 50, true, true, false, v_user_id),
        (v_cat_id, 'TERRITORY', 'Territory', 'إقليم', 60, true, true, false, v_user_id)
      ON CONFLICT (category_id, value_code) DO NOTHING;
    END IF;
  END IF;
END $$;

-- ============================================================================
-- 2. Add country_id to emirates Table
-- ============================================================================

-- Add country_id column (nullable for backward compatibility)
ALTER TABLE public.emirates
  ADD COLUMN IF NOT EXISTS country_id bigint REFERENCES public.countries(id) ON DELETE RESTRICT;

-- Create index for country filtering
CREATE INDEX IF NOT EXISTS idx_emirates_country_id ON public.emirates(country_id);

-- Update table comment
COMMENT ON TABLE public.emirates IS 'Administrative regions for countries. For UAE these records are Emirates; for other countries they may be Governorates, States, Provinces, or Regions.';

-- Update column comment
COMMENT ON COLUMN public.emirates.country_id IS 'Parent country for this administrative region.';

-- ============================================================================
-- 3. Add region_type_code to emirates Table
-- ============================================================================

-- Add region_type_code column (nullable, optional)
ALTER TABLE public.emirates
  ADD COLUMN IF NOT EXISTS region_type_code text;

-- Create index for filtering by region type
CREATE INDEX IF NOT EXISTS idx_emirates_region_type_code ON public.emirates(region_type_code);

-- Update column comment
COMMENT ON COLUMN public.emirates.region_type_code IS 'Administrative region type code from REGION_TYPES lookup, such as EMIRATE, GOVERNORATE, STATE, PROVINCE, REGION.';

-- ============================================================================
-- 4. Add country_id to cities Table
-- ============================================================================

-- Add country_id column (nullable for backward compatibility)
ALTER TABLE public.cities
  ADD COLUMN IF NOT EXISTS country_id bigint REFERENCES public.countries(id) ON DELETE RESTRICT;

-- Create index for country filtering
CREATE INDEX IF NOT EXISTS idx_cities_country_id ON public.cities(country_id);

-- Update column comment
COMMENT ON COLUMN public.cities.country_id IS 'Parent country for this city. Added for global geography support and reporting. emirate_id remains required and represents the administrative region.';

-- ============================================================================
-- 5. Add country_id to ports Table
-- ============================================================================

-- Add country_id column (nullable for backward compatibility)
ALTER TABLE public.ports
  ADD COLUMN IF NOT EXISTS country_id bigint REFERENCES public.countries(id) ON DELETE RESTRICT;

-- Create index for country filtering
CREATE INDEX IF NOT EXISTS idx_ports_country_id ON public.ports(country_id);

-- Update column comment
COMMENT ON COLUMN public.ports.country_id IS 'Parent country for this port. Added for global geography support and reporting. emirate_id remains required and represents the administrative region.';

-- ============================================================================
-- 6. Update Existing UAE Data
-- ============================================================================

DO $$
DECLARE
  v_uae_country_id bigint;
BEGIN
  -- Get UAE country ID
  SELECT id INTO v_uae_country_id FROM public.countries WHERE country_code = 'AE' LIMIT 1;

  -- Update existing emirates to link to UAE
  IF v_uae_country_id IS NOT NULL THEN
    UPDATE public.emirates
    SET 
      country_id = v_uae_country_id,
      region_type_code = 'EMIRATE'
    WHERE country_id IS NULL;  -- Only update if not already set

    -- Update existing cities to link to UAE
    UPDATE public.cities c
    SET country_id = v_uae_country_id
    WHERE c.country_id IS NULL
      AND c.emirate_id IN (SELECT id FROM public.emirates WHERE country_id = v_uae_country_id);

    -- Update existing ports to link to UAE
    UPDATE public.ports p
    SET country_id = v_uae_country_id
    WHERE p.country_id IS NULL
      AND p.emirate_id IN (SELECT id FROM public.emirates WHERE country_id = v_uae_country_id);
  END IF;
END $$;

-- ============================================================================
-- 7. Seed Global Region Examples
-- ============================================================================

DO $$
DECLARE
  v_user_id bigint;
  v_jordan_id bigint;
  v_saudi_id bigint;
  v_usa_id bigint;
  v_amman_gov_id bigint;
  v_irbid_gov_id bigint;
  v_zarqa_gov_id bigint;
  v_riyadh_region_id bigint;
  v_makkah_region_id bigint;
  v_eastern_region_id bigint;
  v_california_id bigint;
  v_texas_id bigint;
  v_newyork_id bigint;
BEGIN
  -- Get system user profile ID
  SELECT id INTO v_user_id FROM public.user_profiles WHERE auth_user_id = auth.uid() LIMIT 1;

  -- Get country IDs
  SELECT id INTO v_jordan_id FROM public.countries WHERE country_code = 'JO';
  SELECT id INTO v_saudi_id FROM public.countries WHERE country_code = 'SA';
  SELECT id INTO v_usa_id FROM public.countries WHERE country_code = 'US';

  -- ========================================
  -- JORDAN: Governorates
  -- ========================================
  IF v_jordan_id IS NOT NULL THEN
    -- Insert Jordan governorates
    INSERT INTO public.emirates (emirate_code, name_en, name_ar, abbreviation_en, abbreviation_ar, country_id, region_type_code, is_system, is_locked, sort_order, created_by)
    VALUES
      ('AMM', 'Amman Governorate', 'محافظة عمان', 'AMM', 'عمّان', v_jordan_id, 'GOVERNORATE', false, false, 100, v_user_id),
      ('IRB', 'Irbid Governorate', 'محافظة إربد', 'IRB', 'إربد', v_jordan_id, 'GOVERNORATE', false, false, 110, v_user_id),
      ('ZAR', 'Zarqa Governorate', 'محافظة الزرقاء', 'ZAR', 'الزرقاء', v_jordan_id, 'GOVERNORATE', false, false, 120, v_user_id)
    ON CONFLICT (emirate_code) DO NOTHING;

    -- Get governorate IDs
    SELECT id INTO v_amman_gov_id FROM public.emirates WHERE emirate_code = 'AMM';
    SELECT id INTO v_irbid_gov_id FROM public.emirates WHERE emirate_code = 'IRB';
    SELECT id INTO v_zarqa_gov_id FROM public.emirates WHERE emirate_code = 'ZAR';

    -- Insert Jordan cities
    IF v_amman_gov_id IS NOT NULL THEN
      INSERT INTO public.cities (city_code, name_en, name_ar, emirate_id, country_id, is_system, is_locked, sort_order, created_by)
      VALUES
        ('AMMAN_CITY', 'Amman', 'عمان', v_amman_gov_id, v_jordan_id, false, false, 100, v_user_id)
      ON CONFLICT (city_code) DO NOTHING;
    END IF;

    IF v_irbid_gov_id IS NOT NULL THEN
      INSERT INTO public.cities (city_code, name_en, name_ar, emirate_id, country_id, is_system, is_locked, sort_order, created_by)
      VALUES
        ('IRBID_CITY', 'Irbid', 'إربد', v_irbid_gov_id, v_jordan_id, false, false, 110, v_user_id)
      ON CONFLICT (city_code) DO NOTHING;
    END IF;

    IF v_zarqa_gov_id IS NOT NULL THEN
      INSERT INTO public.cities (city_code, name_en, name_ar, emirate_id, country_id, is_system, is_locked, sort_order, created_by)
      VALUES
        ('ZARQA_CITY', 'Zarqa', 'الزرقاء', v_zarqa_gov_id, v_jordan_id, false, false, 120, v_user_id)
      ON CONFLICT (city_code) DO NOTHING;
    END IF;
  END IF;

  -- ========================================
  -- SAUDI ARABIA: Regions
  -- ========================================
  IF v_saudi_id IS NOT NULL THEN
    -- Insert Saudi regions
    INSERT INTO public.emirates (emirate_code, name_en, name_ar, abbreviation_en, abbreviation_ar, country_id, region_type_code, is_system, is_locked, sort_order, created_by)
    VALUES
      ('RUH', 'Riyadh Region', 'منطقة الرياض', 'RUH', 'الرياض', v_saudi_id, 'REGION', false, false, 200, v_user_id),
      ('MAK', 'Makkah Region', 'منطقة مكة المكرمة', 'MAK', 'مكة', v_saudi_id, 'REGION', false, false, 210, v_user_id),
      ('EAS', 'Eastern Province', 'المنطقة الشرقية', 'EAS', 'الشرقية', v_saudi_id, 'PROVINCE', false, false, 220, v_user_id)
    ON CONFLICT (emirate_code) DO NOTHING;

    -- Get region IDs
    SELECT id INTO v_riyadh_region_id FROM public.emirates WHERE emirate_code = 'RUH';
    SELECT id INTO v_makkah_region_id FROM public.emirates WHERE emirate_code = 'MAK';
    SELECT id INTO v_eastern_region_id FROM public.emirates WHERE emirate_code = 'EAS';

    -- Insert Saudi cities
    IF v_riyadh_region_id IS NOT NULL THEN
      INSERT INTO public.cities (city_code, name_en, name_ar, emirate_id, country_id, is_system, is_locked, sort_order, created_by)
      VALUES
        ('RIYADH_CITY', 'Riyadh', 'الرياض', v_riyadh_region_id, v_saudi_id, false, false, 200, v_user_id)
      ON CONFLICT (city_code) DO NOTHING;
    END IF;

    IF v_makkah_region_id IS NOT NULL THEN
      INSERT INTO public.cities (city_code, name_en, name_ar, emirate_id, country_id, is_system, is_locked, sort_order, created_by)
      VALUES
        ('JEDDAH_CITY', 'Jeddah', 'جدة', v_makkah_region_id, v_saudi_id, false, false, 210, v_user_id)
      ON CONFLICT (city_code) DO NOTHING;
    END IF;

    IF v_eastern_region_id IS NOT NULL THEN
      INSERT INTO public.cities (city_code, name_en, name_ar, emirate_id, country_id, is_system, is_locked, sort_order, created_by)
      VALUES
        ('DAMMAM_CITY', 'Dammam', 'الدمام', v_eastern_region_id, v_saudi_id, false, false, 220, v_user_id)
      ON CONFLICT (city_code) DO NOTHING;
    END IF;
  END IF;

  -- ========================================
  -- UNITED STATES: States
  -- ========================================
  IF v_usa_id IS NOT NULL THEN
    -- Insert USA states
    INSERT INTO public.emirates (emirate_code, name_en, name_ar, abbreviation_en, abbreviation_ar, country_id, region_type_code, is_system, is_locked, sort_order, created_by)
    VALUES
      ('CAL', 'California', 'كاليفورنيا', 'CA', 'كاليفورنيا', v_usa_id, 'STATE', false, false, 300, v_user_id),
      ('TEX', 'Texas', 'تكساس', 'TX', 'تكساس', v_usa_id, 'STATE', false, false, 310, v_user_id),
      ('NYK', 'New York', 'نيويورك', 'NY', 'نيويورك', v_usa_id, 'STATE', false, false, 320, v_user_id)
    ON CONFLICT (emirate_code) DO NOTHING;

    -- Get state IDs
    SELECT id INTO v_california_id FROM public.emirates WHERE emirate_code = 'CAL';
    SELECT id INTO v_texas_id FROM public.emirates WHERE emirate_code = 'TEX';
    SELECT id INTO v_newyork_id FROM public.emirates WHERE emirate_code = 'NYK';

    -- Insert USA cities
    IF v_california_id IS NOT NULL THEN
      INSERT INTO public.cities (city_code, name_en, name_ar, emirate_id, country_id, is_system, is_locked, sort_order, created_by)
      VALUES
        ('LA_CITY', 'Los Angeles', 'لوس أنجلوس', v_california_id, v_usa_id, false, false, 300, v_user_id)
      ON CONFLICT (city_code) DO NOTHING;
    END IF;

    IF v_texas_id IS NOT NULL THEN
      INSERT INTO public.cities (city_code, name_en, name_ar, emirate_id, country_id, is_system, is_locked, sort_order, created_by)
      VALUES
        ('HOUSTON_CITY', 'Houston', 'هيوستن', v_texas_id, v_usa_id, false, false, 310, v_user_id)
      ON CONFLICT (city_code) DO NOTHING;
    END IF;

    IF v_newyork_id IS NOT NULL THEN
      INSERT INTO public.cities (city_code, name_en, name_ar, emirate_id, country_id, is_system, is_locked, sort_order, created_by)
      VALUES
        ('NYC_CITY', 'New York City', 'مدينة نيويورك', v_newyork_id, v_usa_id, false, false, 320, v_user_id)
      ON CONFLICT (city_code) DO NOTHING;
    END IF;
  END IF;

END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
