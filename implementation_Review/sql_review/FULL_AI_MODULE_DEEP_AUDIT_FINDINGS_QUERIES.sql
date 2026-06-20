-- FULL AI MODULE DEEP AUDIT v2 — Findings Investigation Queries
-- Run against: user-supabase
-- Generated: 2026-06-18

-- ── F-001: Verify audit_logs column names (bug evidence) ─────────────────────

-- Correct columns in audit_logs:
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'audit_logs'
ORDER BY ordinal_position;

-- Verify: 'event_type' does NOT exist (wrong name used by data-quality.ts)
SELECT COUNT(*) AS event_type_exists
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'audit_logs'
  AND column_name = 'event_type';
-- Expected: 0 (it doesn't exist — that's the bug)

-- Verify: 'actor_id' does NOT exist (wrong name used by data-quality.ts)
SELECT COUNT(*) AS actor_id_exists
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'audit_logs'
  AND column_name = 'actor_id';
-- Expected: 0

-- Verify: 'metadata_json' does NOT exist (wrong name used by data-quality.ts)
SELECT COUNT(*) AS metadata_json_exists
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'audit_logs'
  AND column_name = 'metadata_json';
-- Expected: 0

-- Verify correct column names DO exist:
SELECT column_name FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'audit_logs'
  AND column_name IN ('actor_user_profile_id', 'action', 'new_values', 'module_code');
-- Expected: 4 rows

-- ── F-002: Verify permission code mismatches ──────────────────────────────────

-- Check ai.duplicate.view (WRONG — used by action-registry.ts line 67)
SELECT COUNT(*) AS wrong_perm_exists
FROM permissions
WHERE permission_code = 'ai.duplicate.view';
-- Expected: 0 (doesn't exist — that's the bug)

-- Check ai.duplicates.view (CORRECT)
SELECT COUNT(*) AS correct_perm_exists
FROM permissions
WHERE permission_code = 'ai.duplicates.view';
-- Expected: 1

-- Check dms.document.view (WRONG — used by action-registry.ts line 75)
SELECT COUNT(*) AS wrong_dms_perm_exists
FROM permissions
WHERE permission_code = 'dms.document.view';
-- Expected: 0 (doesn't exist — that's the bug)

-- Check dms.documents.view (CORRECT)
SELECT COUNT(*) AS correct_dms_perm_exists
FROM permissions
WHERE permission_code = 'dms.documents.view';
-- Expected: 1

-- ── F-003: Dual data quality flag investigation ───────────────────────────────

-- Show both flags and their states
SELECT feature_code, is_enabled, requires_human_review
FROM erp_ai_feature_flags
WHERE feature_code IN ('ERP_AI_DATA_QUALITY', 'ERP_AI_DATA_QUALITY_MONITOR')
ORDER BY feature_code;
-- Expected: ERP_AI_DATA_QUALITY=true, ERP_AI_DATA_QUALITY_MONITOR=false

-- Simulate what isDataQualityMonitorEnabled() returns (either flag enabled)
SELECT EXISTS (
  SELECT 1 FROM erp_ai_feature_flags
  WHERE feature_code IN ('ERP_AI_DATA_QUALITY_MONITOR', 'ERP_AI_DATA_QUALITY')
    AND is_enabled = true
  LIMIT 1
) AS monitor_considered_enabled;
-- Expected: true (because ERP_AI_DATA_QUALITY is true — legacy flag keeps it active)

-- ── F-005: Orphan flag — ERP_AI_ERP_SEARCH ───────────────────────────────────

-- Show flag state
SELECT feature_code, is_enabled
FROM erp_ai_feature_flags
WHERE feature_code IN ('ERP_AI_ERP_SEARCH', 'AI_SEARCH');
-- Note: ERP_AI_ERP_SEARCH is enabled but code uses AI_SEARCH

-- ── F-009: ERP_AI_DAILY_BRIEF orphan flag ────────────────────────────────────

SELECT feature_code, is_enabled
FROM erp_ai_feature_flags
WHERE feature_code = 'ERP_AI_DAILY_BRIEF';
-- Enabled but no code references it

-- ── Permission health: permissions with no role mapping ──────────────────────

SELECT p.permission_code
FROM permissions p
LEFT JOIN role_permissions rp ON rp.permission_id = p.id
WHERE rp.id IS NULL
  AND p.permission_code LIKE 'ai.%'
ORDER BY p.permission_code;
-- These permissions exist but no role has them — effectively unreachable

-- ── AI usage log summary ──────────────────────────────────────────────────────

SELECT
  COUNT(*) AS total_usage_logs,
  COUNT(DISTINCT config_id) AS distinct_providers_used,
  AVG(total_tokens) AS avg_tokens,
  MAX(created_at) AS most_recent_call
FROM erp_ai_usage_logs;

-- ── Check if any audit_logs have module_code = 'AI' (should be some) ─────────

SELECT COUNT(*) AS ai_audit_log_count
FROM audit_logs
WHERE module_code = 'AI';
-- Note: Should be > 0 if assistant sessions were started and logged
-- Data quality scan events will NOT appear here due to F-001 bug
