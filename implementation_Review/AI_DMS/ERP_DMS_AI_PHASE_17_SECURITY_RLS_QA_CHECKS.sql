-- ============================================================================
-- ERP DMS AI Phase 17 — Security RLS QA Checks
-- File: implementation_Review/ERP_DMS_AI_PHASE_17_SECURITY_RLS_QA_CHECKS.sql
-- Date: 2026-06-27
--
-- Purpose: Verify Phase 17 database security controls are correct.
-- Run via Supabase MCP or SQL editor.
-- All queries should return expected results as documented.
-- ============================================================================

-- ── 1. Correction table exists ────────────────────────────────────────────────

SELECT
  'TABLE_EXISTS' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = 'dms_ai_erp_apply_correction_proposals'
  ) THEN 'PASS' ELSE 'FAIL' END AS result;

-- ── 2. BIGINT PK ──────────────────────────────────────────────────────────────

SELECT
  'BIGINT_PK' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dms_ai_erp_apply_correction_proposals'
      AND column_name = 'id'
      AND data_type = 'bigint'
  ) THEN 'PASS' ELSE 'FAIL' END AS result;

-- ── 3. RLS enabled ────────────────────────────────────────────────────────────

SELECT
  'RLS_ENABLED' AS check_name,
  CASE WHEN (
    SELECT relrowsecurity
    FROM pg_class
    WHERE relname = 'dms_ai_erp_apply_correction_proposals'
      AND relnamespace = 'public'::regnamespace
  ) THEN 'PASS' ELSE 'FAIL' END AS result;

-- ── 4. FORCE RLS enabled ─────────────────────────────────────────────────────

SELECT
  'FORCE_RLS_ENABLED' AS check_name,
  CASE WHEN (
    SELECT relforcerowsecurity
    FROM pg_class
    WHERE relname = 'dms_ai_erp_apply_correction_proposals'
      AND relnamespace = 'public'::regnamespace
  ) THEN 'PASS' ELSE 'FAIL' END AS result;

-- ── 5. No broad USING(true) policies ─────────────────────────────────────────

SELECT
  'NO_BROAD_POLICIES' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dms_ai_erp_apply_correction_proposals'
      AND (qual = 'true' OR with_check = 'true')
  ) THEN 'PASS' ELSE 'FAIL: broad policy found' END AS result;

-- ── 6. No DELETE policy ───────────────────────────────────────────────────────

SELECT
  'NO_DELETE_POLICY' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dms_ai_erp_apply_correction_proposals'
      AND cmd = 'DELETE'
  ) THEN 'PASS' ELSE 'FAIL: DELETE policy exists' END AS result;

-- ── 7. Expected policies exist ────────────────────────────────────────────────

SELECT
  'POLICIES_EXIST' AS check_name,
  (
    SELECT COUNT(*) FROM pg_policies
    WHERE tablename = 'dms_ai_erp_apply_correction_proposals'
      AND policyname IN (
        'dms_ai_erp_corrections_select',
        'dms_ai_erp_corrections_insert',
        'dms_ai_erp_corrections_update'
      )
  )::text || '/3 policies found' AS result;

-- ── 8. Feature flag DMS_AI_APPLY_CORRECTION_PROPOSALS exists and is false ─────

SELECT
  'FLAG_CORRECTION_PROPOSALS' AS check_name,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.erp_ai_feature_flags
      WHERE feature_code = 'DMS_AI_APPLY_CORRECTION_PROPOSALS'
    ) THEN 'FAIL: flag missing'
    WHEN (
      SELECT is_enabled FROM public.erp_ai_feature_flags
      WHERE feature_code = 'DMS_AI_APPLY_CORRECTION_PROPOSALS'
    ) IS TRUE THEN 'WARN: flag is true (expected false for post-UAT)'
    ELSE 'PASS: flag exists and is false'
  END AS result;

-- ── 9. Feature flag DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS exists and is false

SELECT
  'FLAG_RESTORE_PREVIOUS' AS check_name,
  CASE
    WHEN NOT EXISTS (
      SELECT 1 FROM public.erp_ai_feature_flags
      WHERE feature_code = 'DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS'
    ) THEN 'FAIL: flag missing'
    WHEN (
      SELECT is_enabled FROM public.erp_ai_feature_flags
      WHERE feature_code = 'DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS'
    ) IS TRUE THEN 'WARN: flag is true (expected false for post-UAT)'
    ELSE 'PASS: flag exists and is false'
  END AS result;

-- ── 10. Permissions seeded ────────────────────────────────────────────────────

SELECT
  'PERMISSIONS_SEEDED' AS check_name,
  (
    SELECT COUNT(*) FROM public.permissions
    WHERE permission_code IN (
      'dms.apply_correction.view',
      'dms.apply_correction.create',
      'dms.apply_correction.run',
      'dms.apply_correction.admin'
    )
  )::text || '/4 permissions found' AS result;

-- ── 11. source_type CHECK includes correction_proposal ───────────────────────

SELECT
  'SOURCE_TYPE_CHECK' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dms_ai_erp_apply_runs_source_type_check'
      AND conrelid = 'public.dms_ai_erp_apply_runs'::regclass
      AND pg_get_constraintdef(oid) LIKE '%correction_proposal%'
  ) THEN 'PASS' ELSE 'FAIL: correction_proposal not in CHECK constraint' END AS result;

-- ── 12. Status CHECK constraint ───────────────────────────────────────────────

SELECT
  'STATUS_CHECK' AS check_name,
  CASE WHEN EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dms_ai_erp_corrections_status_check'
      AND conrelid = 'public.dms_ai_erp_apply_correction_proposals'::regclass
  ) THEN 'PASS' ELSE 'FAIL: status CHECK missing' END AS result;

-- ── 13. Indexes exist ─────────────────────────────────────────────────────────

SELECT
  'INDEXES' AS check_name,
  (
    SELECT COUNT(*) FROM pg_indexes
    WHERE tablename = 'dms_ai_erp_apply_correction_proposals'
      AND indexname IN (
        'idx_dms_ai_erp_corrections_apply_item',
        'idx_dms_ai_erp_corrections_apply_run',
        'idx_dms_ai_erp_corrections_document',
        'idx_dms_ai_erp_corrections_target',
        'idx_dms_ai_erp_corrections_status_created',
        'idx_dms_ai_erp_corrections_requested_by'
      )
  )::text || '/6 indexes found' AS result;

-- ── 14. Role permissions granted (system_admin) ───────────────────────────────

SELECT
  'SYSTEM_ADMIN_PERMISSIONS' AS check_name,
  (
    SELECT COUNT(*) FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE r.role_code = 'system_admin'
      AND p.permission_code IN (
        'dms.apply_correction.view',
        'dms.apply_correction.create',
        'dms.apply_correction.run',
        'dms.apply_correction.admin'
      )
  )::text || '/4 permissions granted to system_admin' AS result;

-- ── 15. Summary: All checks ───────────────────────────────────────────────────

WITH checks AS (
  SELECT 'table_exists' AS chk,
    EXISTS (
      SELECT 1 FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name = 'dms_ai_erp_apply_correction_proposals'
    ) AS passed
  UNION ALL
  SELECT 'rls_enabled',
    (SELECT relrowsecurity FROM pg_class
     WHERE relname = 'dms_ai_erp_apply_correction_proposals'
       AND relnamespace = 'public'::regnamespace)
  UNION ALL
  SELECT 'force_rls',
    (SELECT relforcerowsecurity FROM pg_class
     WHERE relname = 'dms_ai_erp_apply_correction_proposals'
       AND relnamespace = 'public'::regnamespace)
  UNION ALL
  SELECT 'no_delete_policy',
    NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE tablename = 'dms_ai_erp_apply_correction_proposals'
        AND cmd = 'DELETE'
    )
  UNION ALL
  SELECT 'source_type_check',
    EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conname = 'dms_ai_erp_apply_runs_source_type_check'
        AND conrelid = 'public.dms_ai_erp_apply_runs'::regclass
        AND pg_get_constraintdef(oid) LIKE '%correction_proposal%'
    )
)
SELECT
  SUM(CASE WHEN passed THEN 1 ELSE 0 END) AS passed_count,
  SUM(CASE WHEN NOT passed THEN 1 ELSE 0 END) AS failed_count,
  COUNT(*) AS total_checks
FROM checks;

-- ============================================================================
-- End of Security RLS QA Checks
-- ============================================================================
