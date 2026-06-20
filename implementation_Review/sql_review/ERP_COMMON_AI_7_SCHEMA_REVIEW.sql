-- ERP COMMON AI.7 — AI Assistant for Actions — Schema Review (READ ONLY)
-- Date: 2026-06-17
-- Purpose: Audit live DB state to inform AI.7 implementation planning.
-- DO NOT APPLY / DO NOT MODIFY DATA.

-- ── 1. Feature flag audit ──────────────────────────────────────────────────────

-- Check for assistant-related flags
SELECT feature_code, is_enabled, requires_human_review, description
FROM erp_ai_feature_flags
WHERE feature_code ILIKE '%ASSISTANT%'
   OR feature_code ILIKE '%ACTIONS%'
   OR feature_code ILIKE '%AI_ACTION%'
ORDER BY feature_code;

-- Review all AI feature flags
SELECT feature_code, is_enabled, requires_human_review
FROM erp_ai_feature_flags
ORDER BY feature_code;

-- ── 2. Permission audit ────────────────────────────────────────────────────────

-- Check for existing assistant permissions
SELECT permission_code, permission_name, module_code, is_active
FROM permissions
WHERE permission_code ILIKE 'ai.assistant%'
   OR permission_code ILIKE 'ai.actions%'
ORDER BY permission_code;

-- Full AI permission list
SELECT permission_code, module_code, is_active
FROM permissions
WHERE permission_code ILIKE 'ai.%'
ORDER BY permission_code;

-- Check role mappings for ai.actions.prepare + ai.actions.execute_after_confirm
SELECT r.role_code, p.permission_code
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE p.permission_code IN ('ai.actions.prepare', 'ai.actions.execute_after_confirm',
                             'ai.assistant.use', 'ai.assistant.view', 'ai.assistant.admin')
ORDER BY p.permission_code, r.role_code;

-- ── 3. Existing assistant tables ───────────────────────────────────────────────

-- Check for assistant tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name ILIKE '%assistant%'
ORDER BY table_name;

-- Check for existing erp_ai_* tables
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name ILIKE 'erp_ai_%'
ORDER BY table_name;

-- ── 4. AI signal tables audit ─────────────────────────────────────────────────

-- Key columns in AI.1–AI.6 tables (for integration reference)
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN (
    'erp_ai_field_suggestions',
    'erp_ai_duplicate_candidates',
    'erp_ai_compliance_findings',
    'erp_ai_risk_scores',
    'erp_ai_recent_searches'
  )
ORDER BY table_name, ordinal_position;

-- ── 5. RLS audit on existing AI tables ────────────────────────────────────────

SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN (
  'erp_ai_field_suggestions',
  'erp_ai_duplicate_candidates',
  'erp_ai_compliance_findings',
  'erp_ai_risk_scores',
  'erp_ai_recent_searches',
  'erp_ai_assistant_sessions',
  'erp_ai_assistant_messages',
  'erp_ai_assistant_action_drafts'
);

-- ── 6. Helper function availability ───────────────────────────────────────────

-- Confirm RLS helper functions exist
SELECT routine_name, routine_type
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_name IN (
    'current_user_profile_id',
    'current_user_has_permission',
    'current_user_has_role'
  );

-- ── 7. AI provider config audit ───────────────────────────────────────────────

-- Review AI provider configs (no API keys — metadata only)
SELECT config_code, provider_type, provider_name, purpose, is_default, is_enabled, is_active
FROM erp_ai_provider_configs
ORDER BY is_default DESC, config_code;

-- ── 8. AI usage logs table ────────────────────────────────────────────────────

-- Confirm erp_ai_usage_logs exists and check columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'erp_ai_usage_logs'
ORDER BY ordinal_position;

-- Recent usage by feature area
SELECT feature_area, COUNT(*) as usage_count
FROM erp_ai_usage_logs
WHERE created_at > now() - interval '7 days'
GROUP BY feature_area
ORDER BY usage_count DESC;

-- ── 9. Entity table availability for assistant context ────────────────────────

-- Owner companies columns (for context enrichment)
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'owner_companies'
  AND column_name IN ('id','trade_name','company_code','status','updated_at')
ORDER BY ordinal_position;

-- Parties columns
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'parties'
  AND column_name IN ('id','display_name','party_ref','party_type_code','is_active','updated_at')
ORDER BY ordinal_position;

-- ── 10. DMS document columns available for assistant ─────────────────────────

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_documents'
  AND column_name IN (
    'id','document_no','title','confidentiality_level',
    'ai_summary','ai_summary_status',
    'ai_risk_level','ai_risk_score',
    'completeness_score',
    'summary_embedding_status',
    'expiry_date','deleted_at','updated_at'
  )
ORDER BY ordinal_position;

-- ── 11. erp_ai_risk_scores columns (for EXPLAIN_RISK) ────────────────────────

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'erp_ai_risk_scores'
ORDER BY ordinal_position;

-- ── 12. erp_ai_compliance_findings columns (for EXPLAIN_COMPLIANCE) ──────────

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'erp_ai_compliance_findings'
ORDER BY ordinal_position;

-- ── 13. Duplicate candidates columns (for EXPLAIN_DUPLICATE) ─────────────────

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'erp_ai_duplicate_candidates'
ORDER BY ordinal_position;

-- ── 14. user_profiles table (for session FK reference) ───────────────────────

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'user_profiles'
  AND column_name IN ('id','auth_user_id','email','full_name')
ORDER BY ordinal_position;

-- ── 15. Existing indexes on AI tables ────────────────────────────────────────

SELECT
  ix.indrelid::regclass AS table_name,
  ix.indexrelid::regclass AS index_name,
  am.amname AS index_type,
  ix.indisunique AS is_unique
FROM pg_index ix
JOIN pg_am am ON am.oid = (SELECT relam FROM pg_class WHERE oid = ix.indexrelid)
WHERE ix.indrelid::regclass::text IN (
  'erp_ai_field_suggestions',
  'erp_ai_duplicate_candidates',
  'erp_ai_compliance_findings',
  'erp_ai_risk_scores',
  'erp_ai_recent_searches'
)
ORDER BY table_name, index_name;
