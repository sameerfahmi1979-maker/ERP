-- ─────────────────────────────────────────────────────────────────────────────
-- REPORT.5 — Security / RLS UAT Checks
-- Read-only diagnostic queries. No destructive SQL.
-- Run in Supabase SQL editor with service role (admin) context.
-- ─────────────────────────────────────────────────────────────────────────────

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 1: RLS enabled and forced on all report center tables
-- Expected: all rows show rowsecurity = true AND forcerowsecurity = true
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  relname AS table_name,
  relrowsecurity AS rls_enabled,
  relforcerowsecurity AS rls_forced
FROM pg_class
WHERE relname IN (
  'erp_report_branding_profiles',
  'erp_report_templates',
  'erp_report_registry',
  'erp_report_runs',
  'erp_report_delivery_logs',
  'erp_report_saved_filters',
  'erp_report_column_profiles',
  'erp_report_schedules'
)
ORDER BY relname;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 2: No report center table uses UUID / SERIAL / BIGSERIAL PK
-- Expected: all id columns use BIGINT GENERATED ALWAYS AS IDENTITY
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  c.table_name,
  c.column_name,
  c.data_type,
  c.is_identity,
  c.identity_generation
FROM information_schema.columns c
WHERE c.table_schema = 'public'
  AND c.column_name = 'id'
  AND c.table_name IN (
    'erp_report_branding_profiles',
    'erp_report_templates',
    'erp_report_registry',
    'erp_report_runs',
    'erp_report_delivery_logs',
    'erp_report_saved_filters',
    'erp_report_column_profiles',
    'erp_report_schedules'
  )
ORDER BY c.table_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 3: Report run history contains no raw row data
-- Expected: erp_report_runs has no column storing row data (arrays/jsonb of rows)
-- The table stores metadata only: row_count (integer), filters_json (filter criteria)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  column_name,
  data_type,
  udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'erp_report_runs'
ORDER BY ordinal_position;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 4: Delivery logs contain metadata only (no raw report rows)
-- Expected: no column named rows_data, report_data, or data_blob
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  column_name,
  data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'erp_report_delivery_logs'
ORDER BY ordinal_position;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 5: HR_WPS_READINESS uses payroll sensitive profile
-- Expected: sensitive_profile = 'payroll'
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  report_code,
  sensitive_profile,
  required_permissions
FROM erp_report_registry
WHERE report_code = 'HR_WPS_READINESS';

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 6: HR_DISCIPLINARY_SUMMARY uses disciplinary sensitive profile
-- Expected: sensitive_profile = 'disciplinary'
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  report_code,
  sensitive_profile,
  required_permissions
FROM erp_report_registry
WHERE report_code = 'HR_DISCIPLINARY_SUMMARY';

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 7: HR_EMPLOYEE_PROFILE uses mixed_sensitive profile
-- Expected: sensitive_profile = 'mixed_sensitive'
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  report_code,
  sensitive_profile,
  required_permissions
FROM erp_report_registry
WHERE report_code = 'HR_EMPLOYEE_PROFILE';

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 8: Active templates are linked to valid branding profiles
-- Expected: no active template has a branding_profile_id pointing to a non-existent or inactive profile
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  t.id,
  t.template_code,
  t.template_name,
  t.is_active,
  t.branding_profile_id,
  p.is_active AS profile_active,
  p.profile_code
FROM erp_report_templates t
LEFT JOIN erp_report_branding_profiles p ON p.id = t.branding_profile_id
WHERE t.is_active = true
  AND t.deleted_at IS NULL
ORDER BY t.template_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 9: Multi-company detection (requiresManualTemplateSelection)
-- Verify branding_strategy = 'auto_by_owner_company' reports exist in registry
-- These are the reports that WILL require manual template selection for multi-company data
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  report_code,
  report_name_en,
  branding_strategy,
  is_letter_type,
  module_code
FROM erp_report_registry
WHERE branding_strategy = 'auto_by_owner_company'
  AND is_active = true
  AND deleted_at IS NULL
ORDER BY report_code;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 10: All REPORT.5 new tables exist with correct structure
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  table_name,
  (SELECT COUNT(*) FROM information_schema.columns c2
   WHERE c2.table_name = t.table_name AND c2.table_schema = 'public') AS column_count
FROM information_schema.tables t
WHERE table_schema = 'public'
  AND table_name IN (
    'erp_report_saved_filters',
    'erp_report_column_profiles',
    'erp_report_schedules'
  )
ORDER BY table_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 11: New permissions seeded for REPORT.5
-- Expected: 4 new permission_codes exist
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  permission_code,
  permission_name,
  module_code,
  sort_order
FROM permissions
WHERE permission_code IN (
  'reports.schedule.view',
  'reports.schedule.manage',
  'reports.saved_filters.manage',
  'reports.column_profiles.manage'
)
ORDER BY sort_order;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 12: RLS policies exist for all new tables
-- Expected: at least 4 policies per new table (SELECT/INSERT/UPDATE/DELETE)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  schemaname,
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN (
  'erp_report_saved_filters',
  'erp_report_column_profiles',
  'erp_report_schedules'
)
ORDER BY tablename, cmd;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 13: No data leakage — delivery log does not store sensitive report content
-- Expected: body_preview exists but is TEXT (not full body), no rows_data column
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  column_name,
  data_type,
  character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'erp_report_delivery_logs'
  AND column_name IN ('body_preview', 'subject', 'attachment_filename', 'attachment_size_bytes')
ORDER BY column_name;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 14: Schedule table has proper constraint on output_format and frequency
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  conname AS constraint_name,
  pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.erp_report_schedules'::regclass
  AND contype = 'c'
ORDER BY conname;

-- ─────────────────────────────────────────────────────────────────────────────
-- CHECK 15: Registry entries for all 26 HR reports seeded (REPORT.4 verification)
-- ─────────────────────────────────────────────────────────────────────────────

SELECT
  report_code,
  report_name_en,
  module_code,
  sensitive_profile,
  is_active
FROM erp_report_registry
WHERE module_code = 'hr'
ORDER BY sort_order, report_code;
