-- ============================================================================
-- ERP DMS AI Phase 16 — Security & RLS QA Checks
-- Run via: user-supabase MCP execute_sql
-- ============================================================================

-- ── 1. Table existence ────────────────────────────────────────────────────────

SELECT
  CASE WHEN COUNT(*) = 2 THEN 'PASS' ELSE 'FAIL' END AS table_existence_check,
  array_agg(table_name ORDER BY table_name) AS tables_found
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN ('dms_ai_erp_apply_runs', 'dms_ai_erp_apply_items');

-- ── 2. BIGINT PK check ───────────────────────────────────────────────────────

SELECT
  CASE WHEN COUNT(*) = 2 THEN 'PASS' ELSE 'FAIL' END AS bigint_pk_check,
  array_agg(col.table_name || '.' || col.column_name ORDER BY col.table_name) AS pk_columns
FROM information_schema.columns col
JOIN information_schema.table_constraints tc
  ON tc.table_name  = col.table_name
  AND tc.table_schema = col.table_schema
  AND tc.constraint_type = 'PRIMARY KEY'
JOIN information_schema.key_column_usage kcu
  ON kcu.constraint_name = tc.constraint_name
  AND kcu.table_name     = col.table_name
  AND kcu.column_name    = col.column_name
WHERE col.table_schema = 'public'
  AND col.table_name IN ('dms_ai_erp_apply_runs', 'dms_ai_erp_apply_items')
  AND col.data_type  = 'bigint';

-- ── 3. RLS enabled ───────────────────────────────────────────────────────────

SELECT
  relname AS table_name,
  CASE WHEN relrowsecurity    THEN 'ENABLED' ELSE 'DISABLED — FAIL' END AS rls_status,
  CASE WHEN relforcerowsecurity THEN 'FORCED' ELSE 'NOT FORCED — FAIL' END AS rls_force
FROM pg_class
WHERE relname IN ('dms_ai_erp_apply_runs', 'dms_ai_erp_apply_items')
  AND relkind = 'r'
ORDER BY relname;

-- ── 4. No broad USING (true) policies ────────────────────────────────────────

SELECT
  CASE WHEN COUNT(*) = 0 THEN 'PASS — no USING(true) found' ELSE 'FAIL — broad policy detected' END AS broad_policy_check,
  array_agg(polname) AS offending_policies
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname IN ('dms_ai_erp_apply_runs', 'dms_ai_erp_apply_items')
  AND pg_get_expr(p.polqual, p.polrelid) = 'true';

-- ── 5. No DELETE policies ─────────────────────────────────────────────────────

SELECT
  CASE WHEN COUNT(*) = 0 THEN 'PASS — no DELETE policies' ELSE 'FAIL — DELETE policy exists' END AS delete_policy_check,
  array_agg(polname) AS delete_policies
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname IN ('dms_ai_erp_apply_runs', 'dms_ai_erp_apply_items')
  AND p.polcmd = 'd';

-- ── 6. No anon access ─────────────────────────────────────────────────────────

SELECT
  CASE WHEN COUNT(*) = 0 THEN 'PASS — no anon grants' ELSE 'FAIL — anon access found' END AS anon_access_check,
  array_agg(DISTINCT grantee || ' on ' || table_name) AS offending_grants
FROM information_schema.role_table_grants
WHERE table_schema = 'public'
  AND table_name IN ('dms_ai_erp_apply_runs', 'dms_ai_erp_apply_items')
  AND grantee IN ('anon', 'public');

-- ── 7. RLS policy names (completeness check) ─────────────────────────────────

SELECT
  c.relname AS table_name,
  p.polname AS policy_name,
  CASE p.polcmd
    WHEN 'r' THEN 'SELECT'
    WHEN 'a' THEN 'INSERT'
    WHEN 'w' THEN 'UPDATE'
    WHEN 'd' THEN 'DELETE'
    ELSE 'ALL'
  END AS operation
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
WHERE c.relname IN ('dms_ai_erp_apply_runs', 'dms_ai_erp_apply_items')
ORDER BY c.relname, p.polcmd;

-- ── 8. Feature flags default false ────────────────────────────────────────────

SELECT
  feature_code,
  is_enabled,
  CASE WHEN is_enabled = false THEN 'PASS' ELSE 'FAIL — flag is enabled (should be false)' END AS flag_status
FROM erp_ai_feature_flags
WHERE feature_code LIKE 'DMS_AI_APPLY%'
ORDER BY feature_code;

-- ── 9. Permissions seeded ────────────────────────────────────────────────────

SELECT
  permission_code,
  permission_name,
  is_active,
  CASE WHEN is_active = true THEN 'PASS' ELSE 'FAIL' END AS perm_status
FROM permissions
WHERE permission_code LIKE 'dms.apply_to_erp%'
ORDER BY permission_code;

-- ── 10. Role grants (system_admin should have all 4, group_admin should have 3) ─

SELECT
  r.role_code,
  COUNT(p.id) AS permission_count,
  CASE
    WHEN r.role_code = 'system_admin' AND COUNT(p.id) >= 4 THEN 'PASS'
    WHEN r.role_code = 'group_admin'  AND COUNT(p.id) >= 3 THEN 'PASS'
    ELSE 'PARTIAL — check manually'
  END AS grant_status
FROM roles r
JOIN role_permissions rp ON rp.role_id = r.id
JOIN permissions p ON p.id = rp.permission_id
WHERE r.role_code IN ('system_admin', 'group_admin')
  AND p.permission_code LIKE 'dms.apply_to_erp%'
GROUP BY r.role_code
ORDER BY r.role_code;

-- ── 11. No Party/HR flags created ────────────────────────────────────────────

SELECT
  CASE WHEN COUNT(*) = 0 THEN 'PASS — no Party/HR apply flags' ELSE 'FAIL — Party/HR flag found' END AS party_hr_flag_check,
  array_agg(feature_code) AS flags_found
FROM erp_ai_feature_flags
WHERE feature_code LIKE 'DMS_AI_APPLY%'
  AND feature_code NOT IN (
    'DMS_AI_APPLY_TO_ERP',
    'DMS_AI_APPLY_TO_ERP_DMS_METADATA',
    'DMS_AI_APPLY_TO_ERP_ENTITY_LINKS'
  );

-- ── 12. CHECK constraints present ────────────────────────────────────────────

SELECT
  conname AS constraint_name,
  'PRESENT' AS status
FROM pg_constraint
WHERE conrelid IN (
  'public.dms_ai_erp_apply_runs'::regclass,
  'public.dms_ai_erp_apply_items'::regclass
)
  AND contype = 'c'
ORDER BY conname;

-- ── 13. Indexes present ───────────────────────────────────────────────────────

SELECT
  indexname,
  'PRESENT' AS status
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('dms_ai_erp_apply_runs', 'dms_ai_erp_apply_items')
  AND indexname LIKE 'idx_dms_ai_erp_apply%'
ORDER BY indexname;
