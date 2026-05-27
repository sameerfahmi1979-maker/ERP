-- ERP Base 002D: Admin Master Data Hardening Migration (CORRECTED)
-- Phase 002D - UAE-Ready Master Data Fields
-- Migration created: May 27, 2026
-- Migration corrected: May 27, 2026 (Fixed constraint syntax, removed trigger recreation)
-- WARNING: Do NOT apply until reviewed and approved by user

-- ---------------------------------------------------------------------------
-- Purpose:
-- 1. Add UAE compliance fields to owner_companies
-- 2. Add operational fields to branches
-- 3. Add enhancement fields to roles, permissions, user_profiles
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- 1. OWNER_COMPANIES ENHANCEMENTS
-- ---------------------------------------------------------------------------

-- Add UAE legal, licensing, tax, and address fields
ALTER TABLE public.owner_companies
  -- Address fields (6 columns)
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS area text,
  ADD COLUMN IF NOT EXISTS address_line_1 text,
  ADD COLUMN IF NOT EXISTS address_line_2 text,
  ADD COLUMN IF NOT EXISTS po_box text,
  ADD COLUMN IF NOT EXISTS makani_number text,
  
  -- Legal & Licensing (5 columns)
  ADD COLUMN IF NOT EXISTS trade_license_issue_date date,
  ADD COLUMN IF NOT EXISTS trade_license_expiry_date date,
  ADD COLUMN IF NOT EXISTS licensing_authority text,
  ADD COLUMN IF NOT EXISTS chamber_membership_no text,
  ADD COLUMN IF NOT EXISTS chamber_membership_expiry_date date,
  
  -- Tax & Compliance (7 columns)
  ADD COLUMN IF NOT EXISTS vat_registered boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS corporate_tax_registered boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS icv_certificate_no text,
  ADD COLUMN IF NOT EXISTS icv_score numeric(5,2),
  ADD COLUMN IF NOT EXISTS icv_issue_date date,
  ADD COLUMN IF NOT EXISTS icv_expiry_date date,
  ADD COLUMN IF NOT EXISTS adnoc_supplier_no text,
  
  -- Notes (1 column)
  ADD COLUMN IF NOT EXISTS notes text;

-- Add check constraint for ICV score using safe existence check
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'owner_companies_icv_score_range'
  ) THEN
    ALTER TABLE public.owner_companies
      ADD CONSTRAINT owner_companies_icv_score_range
      CHECK (icv_score IS NULL OR (icv_score >= 0 AND icv_score <= 100));
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_owner_companies_emirate ON public.owner_companies(emirate);
CREATE INDEX IF NOT EXISTS idx_owner_companies_city ON public.owner_companies(city);
CREATE INDEX IF NOT EXISTS idx_owner_companies_trade_license_no ON public.owner_companies(trade_license_no);
CREATE INDEX IF NOT EXISTS idx_owner_companies_trn ON public.owner_companies(trn);
CREATE INDEX IF NOT EXISTS idx_owner_companies_status ON public.owner_companies(status);
CREATE INDEX IF NOT EXISTS idx_owner_companies_vat_registered ON public.owner_companies(vat_registered);

-- Add column comments
COMMENT ON COLUMN public.owner_companies.makani_number IS 'UAE Makani address number for precise location identification';
COMMENT ON COLUMN public.owner_companies.licensing_authority IS 'DED (Department of Economic Development) or FTZ (Free Trade Zone) authority';
COMMENT ON COLUMN public.owner_companies.icv_score IS 'In-Country Value score (0-100) for UAE/GCC government contracts';
COMMENT ON COLUMN public.owner_companies.adnoc_supplier_no IS 'ADNOC supplier registration number if applicable';

-- ---------------------------------------------------------------------------
-- 2. BRANCHES ENHANCEMENTS
-- ---------------------------------------------------------------------------

-- Add operational fields and enhanced location data
ALTER TABLE public.branches
  -- Branch categorization (3 columns)
  ADD COLUMN IF NOT EXISTS branch_type text,
  ADD COLUMN IF NOT EXISTS is_main_branch boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS operating_status text DEFAULT 'active',
  
  -- Location fields (4 columns)
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS makani_number text,
  ADD COLUMN IF NOT EXISTS latitude numeric(10,7),
  ADD COLUMN IF NOT EXISTS longitude numeric(10,7),
  
  -- Contact information (3 columns)
  ADD COLUMN IF NOT EXISTS contact_person_name text,
  ADD COLUMN IF NOT EXISTS contact_phone text,
  ADD COLUMN IF NOT EXISTS contact_email text,
  
  -- Operational flags for business modules (4 columns)
  ADD COLUMN IF NOT EXISTS has_workshop boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_warehouse boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_yard boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS has_weighbridge boolean DEFAULT false,
  
  -- Notes (1 column)
  ADD COLUMN IF NOT EXISTS notes text;

-- Add check constraints using safe existence checks
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'branches_branch_type_check'
  ) THEN
    ALTER TABLE public.branches
      ADD CONSTRAINT branches_branch_type_check
      CHECK (branch_type IS NULL OR branch_type IN (
        'Head Office', 'Branch Office', 'Yard', 'Workshop', 
        'Warehouse', 'Camp', 'Project Site', 'Weighbridge', 'Other'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'branches_operating_status_check'
  ) THEN
    ALTER TABLE public.branches
      ADD CONSTRAINT branches_operating_status_check
      CHECK (operating_status IN ('active', 'maintenance', 'suspended', 'closed'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'branches_latitude_range'
  ) THEN
    ALTER TABLE public.branches
      ADD CONSTRAINT branches_latitude_range
      CHECK (latitude IS NULL OR (latitude >= -90 AND latitude <= 90));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'branches_longitude_range'
  ) THEN
    ALTER TABLE public.branches
      ADD CONSTRAINT branches_longitude_range
      CHECK (longitude IS NULL OR (longitude >= -180 AND longitude <= 180));
  END IF;
END $$;

-- Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_branches_branch_type ON public.branches(branch_type);
CREATE INDEX IF NOT EXISTS idx_branches_emirate ON public.branches(emirate);
CREATE INDEX IF NOT EXISTS idx_branches_city ON public.branches(city);
CREATE INDEX IF NOT EXISTS idx_branches_operating_status ON public.branches(operating_status);
CREATE INDEX IF NOT EXISTS idx_branches_is_main_branch ON public.branches(is_main_branch);
CREATE INDEX IF NOT EXISTS idx_branches_has_workshop ON public.branches(has_workshop);
CREATE INDEX IF NOT EXISTS idx_branches_has_warehouse ON public.branches(has_warehouse);
CREATE INDEX IF NOT EXISTS idx_branches_has_yard ON public.branches(has_yard);
CREATE INDEX IF NOT EXISTS idx_branches_has_weighbridge ON public.branches(has_weighbridge);

-- Add column comments
COMMENT ON COLUMN public.branches.branch_type IS 'Categorizes branch by primary function: office, yard, workshop, warehouse, etc.';
COMMENT ON COLUMN public.branches.is_main_branch IS 'Identifies the primary/head branch for the company';
COMMENT ON COLUMN public.branches.operating_status IS 'Current operational state: active, maintenance, suspended, closed';
COMMENT ON COLUMN public.branches.makani_number IS 'UAE Makani address number for precise location';
COMMENT ON COLUMN public.branches.has_workshop IS 'Indicates if branch has vehicle workshop/service center';
COMMENT ON COLUMN public.branches.has_warehouse IS 'Indicates if branch has inventory storage warehouse';
COMMENT ON COLUMN public.branches.has_yard IS 'Indicates if branch has vehicle/equipment yard';
COMMENT ON COLUMN public.branches.has_weighbridge IS 'Indicates if branch has weighbridge for cargo/vehicle weighing';

-- ---------------------------------------------------------------------------
-- 3. ROLES ENHANCEMENTS (Optional)
-- ---------------------------------------------------------------------------

-- Add display and categorization fields to roles
ALTER TABLE public.roles
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS role_category text,
  ADD COLUMN IF NOT EXISTS role_level text,
  ADD COLUMN IF NOT EXISTS is_assignable boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_roles_role_category ON public.roles(role_category);
CREATE INDEX IF NOT EXISTS idx_roles_is_assignable ON public.roles(is_assignable);

COMMENT ON COLUMN public.roles.display_name IS 'User-friendly display name for UI';
COMMENT ON COLUMN public.roles.role_category IS 'Category: Admin, Operational, Executive, Technical, etc.';
COMMENT ON COLUMN public.roles.role_level IS 'Seniority level: Junior, Senior, Manager, Executive, etc.';
COMMENT ON COLUMN public.roles.is_assignable IS 'Whether this role can be assigned to users (false for deprecated roles)';

-- ---------------------------------------------------------------------------
-- 4. PERMISSIONS ENHANCEMENTS (Optional)
-- ---------------------------------------------------------------------------

-- Add display and visibility fields to permissions
ALTER TABLE public.permissions
  ADD COLUMN IF NOT EXISTS display_name text,
  ADD COLUMN IF NOT EXISTS is_system_permission boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS is_visible boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_permissions_module_code ON public.permissions(module_code);
CREATE INDEX IF NOT EXISTS idx_permissions_is_visible ON public.permissions(is_visible);
CREATE INDEX IF NOT EXISTS idx_permissions_sort_order ON public.permissions(sort_order);

COMMENT ON COLUMN public.permissions.display_name IS 'User-friendly display name for permission matrix';
COMMENT ON COLUMN public.permissions.is_system_permission IS 'System-managed permission that cannot be deleted';
COMMENT ON COLUMN public.permissions.is_visible IS 'Whether to show in permission matrix';
COMMENT ON COLUMN public.permissions.sort_order IS 'Display order in permission matrix';

-- ---------------------------------------------------------------------------
-- 5. USER_PROFILES ENHANCEMENTS (Optional)
-- ---------------------------------------------------------------------------

-- Add employee reference and admin tracking fields
ALTER TABLE public.user_profiles
  ADD COLUMN IF NOT EXISTS employee_reference text,
  ADD COLUMN IF NOT EXISTS manager_user_profile_id bigint REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS preferred_language text DEFAULT 'en',
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Asia/Dubai',
  ADD COLUMN IF NOT EXISTS last_admin_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_user_profiles_employee_reference ON public.user_profiles(employee_reference);
CREATE INDEX IF NOT EXISTS idx_user_profiles_manager ON public.user_profiles(manager_user_profile_id);
CREATE INDEX IF NOT EXISTS idx_user_profiles_preferred_language ON public.user_profiles(preferred_language);

COMMENT ON COLUMN public.user_profiles.employee_reference IS 'Employee ID or HR reference number';
COMMENT ON COLUMN public.user_profiles.manager_user_profile_id IS 'Direct manager/supervisor user profile';
COMMENT ON COLUMN public.user_profiles.preferred_language IS 'UI language preference: en, ar';
COMMENT ON COLUMN public.user_profiles.timezone IS 'User timezone for time display';
COMMENT ON COLUMN public.user_profiles.last_admin_updated_at IS 'Timestamp of last admin profile edit';

-- ---------------------------------------------------------------------------
-- MIGRATION VALIDATION
-- ---------------------------------------------------------------------------

DO $$
BEGIN
  -- Verify BIGINT primary keys maintained
  ASSERT (SELECT data_type FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = 'owner_companies' AND column_name = 'id') = 'bigint',
         'owner_companies.id must be BIGINT';
  
  ASSERT (SELECT data_type FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = 'branches' AND column_name = 'id') = 'bigint',
         'branches.id must be BIGINT';
  
  ASSERT (SELECT data_type FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = 'roles' AND column_name = 'id') = 'bigint',
         'roles.id must be BIGINT';
  
  ASSERT (SELECT data_type FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = 'permissions' AND column_name = 'id') = 'bigint',
         'permissions.id must be BIGINT';
  
  ASSERT (SELECT data_type FROM information_schema.columns 
          WHERE table_schema = 'public' AND table_name = 'user_profiles' AND column_name = 'id') = 'bigint',
         'user_profiles.id must be BIGINT';
  
  -- Verify no UUID primary keys were added for ERP tables
  ASSERT NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name IN ('owner_companies', 'branches', 'roles', 'permissions', 'user_profiles')
      AND column_name = 'id'
      AND data_type = 'uuid'
  ), 'No UUID primary keys allowed for ERP tables';
  
  RAISE NOTICE 'Migration validation passed: All primary keys are BIGINT, no UUIDs added';
END $$;

-- ---------------------------------------------------------------------------
-- MIGRATION SUMMARY
-- ---------------------------------------------------------------------------

-- CORRECTED COLUMN COUNT:
-- owner_companies: +19 columns (UAE compliance fields)
-- branches: +15 columns (operational flags and location)
-- roles: +5 columns (display and categorization)
-- permissions: +4 columns (display and visibility)
-- user_profiles: +6 columns (employee reference and preferences)

-- Total: +49 new columns across 5 tables
-- All columns nullable or have defaults (non-breaking change)
-- All primary keys remain BIGINT
-- No UUID additions for ERP tables
-- All indexes added for query performance
-- Existing updated_at triggers from Phase 001 remain functional (not recreated)
-- RLS policies inherited from table-level policies (no policy changes)

COMMENT ON SCHEMA public IS 'ERP Base 002D Migration Ready: Admin Master Data Hardening (Corrected)';

-- ---------------------------------------------------------------------------
-- CORRECTION NOTES
-- ---------------------------------------------------------------------------

-- FIX 1: Replaced invalid "ADD CONSTRAINT IF NOT EXISTS" syntax with safe DO $$ blocks
-- FIX 2: Removed trigger recreation section (existing Phase 001 triggers work fine)
-- FIX 3: Corrected column count from 47 to 49 (branches had 15, not 13)
-- FIX 4: Kept safe "ADD COLUMN IF NOT EXISTS" for all columns
-- FIX 5: Manager FK uses inline syntax (acceptable, creates system-named constraint)
-- FIX 6: BIGINT validation enhanced to check for no UUID PKs
-- FIX 7: No RLS policy changes (confirmed)

-- ---------------------------------------------------------------------------
-- END OF MIGRATION
-- ---------------------------------------------------------------------------
