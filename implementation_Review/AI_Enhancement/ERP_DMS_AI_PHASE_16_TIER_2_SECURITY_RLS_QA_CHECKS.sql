-- ============================================================================
-- ERP DMS AI Phase 16 Tier 2 — Security / RLS QA Checks
-- ============================================================================
--
-- Run these queries to verify:
--   1. target_module CHECK includes 'party'
--   2. Tier 2 feature flags exist and are false
--   3. Tier 1 flags still false
--   4. apply tables RLS enabled and forced
--   5. No broad policies / no DELETE policies
--   6. Required permissions exist
--
-- Expected: All checks pass with the expected values.
-- ============================================================================

-- ── 1. Verify target_module CHECK constraint includes 'party' ─────────────────

SELECT
  tc.constraint_name,
  cc.check_clause
FROM information_schema.table_constraints tc
JOIN information_schema.check_constraints cc
  ON tc.constraint_name = cc.constraint_name
WHERE tc.table_name = 'dms_ai_erp_apply_runs'
  AND tc.constraint_type = 'CHECK'
  AND cc.check_clause LIKE '%target_module%';
-- Expected: check_clause = "(target_module = ANY (ARRAY['dms_document'::text, 'dms_metadata'::text, 'party'::text]))"

-- ── 2. Verify Tier 2 feature flags exist and are FALSE ───────────────────────

SELECT feature_code, feature_name, is_enabled
FROM erp_ai_feature_flags
WHERE feature_code IN (
  'DMS_AI_APPLY_TO_ERP_PARTY',
  'DMS_AI_APPLY_TO_ERP_PARTY_LICENSES',
  'DMS_AI_APPLY_TO_ERP_PARTY_TAX'
)
ORDER BY feature_code;
-- Expected: 3 rows, all is_enabled = false

-- ── 3. Verify ALL apply feature flags are false (default safe state) ─────────

SELECT feature_code, is_enabled
FROM erp_ai_feature_flags
WHERE feature_code LIKE 'DMS_AI_APPLY_TO_ERP%'
ORDER BY feature_code;
-- Expected: All is_enabled = false (after UAT restore)

-- ── 4. Verify RLS is enabled on apply tables ──────────────────────────────────

SELECT
  schemaname,
  tablename,
  rowsecurity,
  forcerowsecurity
FROM pg_tables
WHERE tablename IN ('dms_ai_erp_apply_runs', 'dms_ai_erp_apply_items')
  AND schemaname = 'public';
-- Expected: rowsecurity = true, forcerowsecurity = true for both

-- ── 5. Verify policies on apply tables (no broad all-table policies) ──────────

SELECT
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE tablename IN ('dms_ai_erp_apply_runs', 'dms_ai_erp_apply_items')
  AND schemaname = 'public'
ORDER BY tablename, policyname;
-- Expected: Only granular policies for 'authenticated' role
-- No DELETE policies (delete is not supported)
-- No anon/public policies

-- ── 6. Verify no DELETE policies on apply tables ──────────────────────────────

SELECT COUNT(*)
FROM pg_policies
WHERE tablename IN ('dms_ai_erp_apply_runs', 'dms_ai_erp_apply_items')
  AND cmd = 'DELETE';
-- Expected: 0

-- ── 7. Verify required Party permissions exist ───────────────────────────────

SELECT DISTINCT permission_code
FROM permissions
WHERE permission_code IN (
  'master_data.parties.manage_licenses',
  'master_data.parties.manage_tax',
  'master_data.parties.edit',
  'master_data.parties.view',
  'dms.apply_to_erp.run'
)
ORDER BY permission_code;
-- Expected: 5 rows (all permissions present)

-- ── 8. Verify party_licenses and party_tax_registrations not altered ──────────

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_name IN ('party_licenses', 'party_tax_registrations')
  AND column_name IN (
    'license_number', 'license_name', 'license_activity_text', 'issue_date', 'expiry_date', 'remarks',
    'tax_registration_number', 'effective_from', 'effective_to'
  )
ORDER BY table_name, column_name;
-- Expected: All Tier 2 allowlisted columns present with correct types

-- ── 9. Verify no bank/HR tables were altered by Tier 2 migration ─────────────

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'party_bank_details', 'party_contacts', 'party_addresses',
    'employee_identity_documents', 'employee_medical_insurances',
    'employee_salaries', 'payroll_records'
  )
ORDER BY table_name;
-- These tables should NOT have new columns related to apply-to-erp

-- ── 10. Audit: most recent apply run target_module values ─────────────────────

SELECT target_module, COUNT(*) AS run_count
FROM dms_ai_erp_apply_runs
GROUP BY target_module
ORDER BY target_module;
-- Informational: shows existing distribution of run types
-- Expected after UAT: should include 'party' entries if UAT was completed

-- ── End of Security RLS QA Checks ────────────────────────────────────────────
