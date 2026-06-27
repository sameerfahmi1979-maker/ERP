-- ============================================================================
-- ERP DMS AI Phase 15 — Security / RLS QA Checks
-- ============================================================================
-- Execute via Supabase SQL Editor or user-supabase MCP.
-- All queries are READ-ONLY. No data is mutated.
-- Expected result for each section: 0 rows = PASS.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- SECTION 1: Verify RLS + FORCE RLS on all 13 DMS AI tables
-- Expected: 13 rows, all rls_enabled=true, force_rls=true
-- ---------------------------------------------------------------------------
SELECT
  c.relname   AS table_name,
  c.relrowsecurity     AS rls_enabled,
  c.relforcerowsecurity AS force_rls,
  CASE
    WHEN c.relrowsecurity AND c.relforcerowsecurity THEN 'PASS'
    ELSE 'FAIL'
  END AS result
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relname IN (
    'dms_ai_job_queue',
    'dms_ai_job_attempts',
    'dms_document_content_chunks',
    'dms_review_queue',
    'dms_ai_validation_findings',
    'dms_ai_entity_match_candidates',
    'erp_ai_model_cost_rates',
    'erp_ai_usage_logs',
    'dms_ai_tag_suggestions',
    'dms_ai_link_suggestions',
    'dms_ai_extraction_jobs',
    'dms_ai_extraction_results',
    'dms_document_content'
  )
ORDER BY c.relname;

-- ---------------------------------------------------------------------------
-- SECTION 2: Detect any broad USING (true) SELECT policies
-- Expected: 0 rows = PASS (no broad unscoped SELECT access)
-- ---------------------------------------------------------------------------
SELECT
  tablename,
  policyname,
  cmd,
  qual AS using_clause
FROM pg_policies
WHERE tablename IN (
  'dms_ai_job_queue',
  'dms_ai_job_attempts',
  'dms_document_content_chunks',
  'dms_review_queue',
  'dms_ai_validation_findings',
  'dms_ai_entity_match_candidates',
  'erp_ai_model_cost_rates',
  'erp_ai_usage_logs',
  'dms_ai_tag_suggestions',
  'dms_ai_link_suggestions',
  'dms_ai_extraction_jobs',
  'dms_ai_extraction_results',
  'dms_document_content'
)
AND cmd = 'SELECT'
AND qual = 'true';

-- ---------------------------------------------------------------------------
-- SECTION 3: Detect any anon-accessible policies
-- Expected: 0 rows = PASS (no anonymous access allowed)
-- ---------------------------------------------------------------------------
SELECT
  tablename,
  policyname,
  roles,
  cmd
FROM pg_policies
WHERE tablename IN (
  'dms_ai_job_queue',
  'dms_ai_job_attempts',
  'dms_document_content_chunks',
  'dms_review_queue',
  'dms_ai_validation_findings',
  'dms_ai_entity_match_candidates',
  'erp_ai_model_cost_rates',
  'erp_ai_usage_logs',
  'dms_ai_tag_suggestions',
  'dms_ai_link_suggestions',
  'dms_ai_extraction_jobs',
  'dms_ai_extraction_results',
  'dms_document_content'
)
AND roles::text LIKE '%anon%';

-- ---------------------------------------------------------------------------
-- SECTION 4: Verify NO DELETE policies on append-only tables
-- Expected: 0 rows = PASS
-- ---------------------------------------------------------------------------
SELECT
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename IN (
  'dms_ai_job_queue',
  'dms_ai_job_attempts',
  'erp_ai_usage_logs',
  'erp_ai_model_cost_rates',
  'dms_ai_validation_findings',
  'dms_ai_entity_match_candidates'
)
AND cmd = 'DELETE';

-- ---------------------------------------------------------------------------
-- SECTION 5: Verify INSERT WITH CHECK is scoped (not bare true)
-- Expected: 0 rows with with_check = 'true'
-- ---------------------------------------------------------------------------
SELECT
  tablename,
  policyname,
  cmd,
  with_check
FROM pg_policies
WHERE tablename IN (
  'dms_ai_job_queue',
  'dms_ai_job_attempts',
  'dms_document_content_chunks',
  'dms_review_queue',
  'dms_ai_validation_findings',
  'dms_ai_entity_match_candidates',
  'erp_ai_model_cost_rates',
  'erp_ai_usage_logs',
  'dms_ai_tag_suggestions',
  'dms_ai_link_suggestions',
  'dms_ai_extraction_jobs',
  'dms_ai_extraction_results',
  'dms_document_content'
)
AND cmd = 'INSERT'
AND with_check = 'true';

-- ---------------------------------------------------------------------------
-- SECTION 6: Show current erp_ai_usage_logs INSERT policy WITH CHECK
-- For manual review — not a pass/fail test
-- ---------------------------------------------------------------------------
SELECT
  tablename,
  policyname,
  cmd,
  qual         AS using_clause,
  with_check
FROM pg_policies
WHERE tablename = 'erp_ai_usage_logs'
  AND cmd = 'INSERT';

-- ---------------------------------------------------------------------------
-- SECTION 7: Verify erp_ai_model_cost_rates has no DELETE policy
-- Expected: 0 rows = PASS
-- ---------------------------------------------------------------------------
SELECT
  tablename,
  policyname,
  cmd
FROM pg_policies
WHERE tablename = 'erp_ai_model_cost_rates'
  AND cmd = 'DELETE';

-- ---------------------------------------------------------------------------
-- SECTION 8: Summary of all policies on DMS AI tables (informational)
-- ---------------------------------------------------------------------------
SELECT
  tablename,
  policyname,
  cmd,
  qual         AS using_clause,
  with_check
FROM pg_policies
WHERE tablename IN (
  'dms_ai_job_queue',
  'dms_ai_job_attempts',
  'dms_document_content_chunks',
  'dms_review_queue',
  'dms_ai_validation_findings',
  'dms_ai_entity_match_candidates',
  'erp_ai_model_cost_rates',
  'erp_ai_usage_logs',
  'dms_ai_tag_suggestions',
  'dms_ai_link_suggestions',
  'dms_ai_extraction_jobs',
  'dms_ai_extraction_results',
  'dms_document_content'
)
ORDER BY tablename, cmd, policyname;

-- ---------------------------------------------------------------------------
-- SECTION 9: Note on semantic chunk search RPC
-- The match_dms_document_chunks RPC function uses SECURITY DEFINER or
-- caller-level access. Verify manually:
--
-- SELECT proname, prosecdef
-- FROM pg_proc
-- WHERE proname LIKE 'match_dms%';
--
-- Expected: prosecdef = true (SECURITY DEFINER) — function enforces its own
-- access control and does not expose chunk_text to caller.
-- ---------------------------------------------------------------------------
SELECT
  proname      AS function_name,
  prosecdef    AS security_definer
FROM pg_proc
WHERE proname LIKE 'match_dms%'
   OR proname LIKE 'search_dms%';
