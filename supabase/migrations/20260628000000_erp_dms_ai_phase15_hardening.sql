-- ============================================================================
-- ERP DMS AI Phase 15 — Hardening Migration
-- ============================================================================
-- Safe, non-breaking hardening changes only:
-- 1. Drop duplicate indexes on erp_ai_usage_logs (2 redundant pairs confirmed).
-- 2. Tighten erp_ai_usage_logs INSERT policy (any auth user → dms permission).
--
-- All application writes to erp_ai_usage_logs use createAdminClient()
-- (service role, bypasses RLS), so tightening this policy does NOT break
-- any existing AI usage logging. Only direct SDK INSERT calls are affected.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop redundant duplicate indexes on erp_ai_usage_logs
-- Keep: idx_erp_ai_usage_created (more descriptive name)
-- Drop: erp_ai_usage_logs_created_at_idx (duplicate of idx_erp_ai_usage_created)
-- Keep: idx_erp_ai_usage_config (more descriptive name)
-- Drop: erp_ai_usage_logs_provider_config_idx (duplicate of idx_erp_ai_usage_config)
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS public.erp_ai_usage_logs_created_at_idx;
DROP INDEX IF EXISTS public.erp_ai_usage_logs_provider_config_idx;

-- ---------------------------------------------------------------------------
-- 2. Tighten erp_ai_usage_logs INSERT policy
--
-- Before: any authenticated user (auth.uid() IS NOT NULL) can insert
-- After: only users with dms.admin permission OR system_admin/group_admin role
--
-- Rationale: All legitimate AI usage logging uses createAdminClient() which
-- bypasses RLS. Direct SDK inserts by non-admin users would pollute metrics.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS "erp_ai_usage_insert" ON public.erp_ai_usage_logs;

CREATE POLICY "erp_ai_usage_insert"
  ON public.erp_ai_usage_logs
  FOR INSERT
  WITH CHECK (
    current_user_has_permission('dms.admin'::text)
    OR current_user_has_role('system_admin'::text)
    OR current_user_has_role('group_admin'::text)
  );

-- ---------------------------------------------------------------------------
-- Comments
-- ---------------------------------------------------------------------------
COMMENT ON POLICY "erp_ai_usage_insert" ON public.erp_ai_usage_logs IS
  'Phase 15 hardening: allows inserts only for dms.admin permission holders or admin roles. Application writes use service role (bypasses RLS).';
