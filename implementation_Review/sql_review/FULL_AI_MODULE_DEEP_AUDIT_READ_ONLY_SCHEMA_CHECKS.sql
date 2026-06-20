-- FULL AI MODULE DEEP AUDIT v2 — Read-Only Schema Checks
-- Run against: user-supabase (Supabase project: mmiefuieduzdiiwnqpie)
-- Generated: 2026-06-18
-- All queries are SELECT only. No DML.

-- ── 1. Feature Flags ──────────────────────────────────────────────────────────

SELECT feature_code, is_enabled, requires_human_review
FROM erp_ai_feature_flags
ORDER BY feature_code;
-- Expected: 33 rows. ERP_AI_DATA_QUALITY=true, ERP_AI_DATA_QUALITY_MONITOR=false.

-- ── 2. AI Permissions ────────────────────────────────────────────────────────

SELECT permission_code FROM permissions
WHERE permission_code LIKE 'ai.%' ORDER BY permission_code;
-- Expected: 33 rows. ai.duplicates.view should exist. ai.duplicate.view should NOT.

-- ── 3. DMS Permissions ───────────────────────────────────────────────────────

SELECT permission_code FROM permissions
WHERE permission_code LIKE 'dms.%' ORDER BY permission_code;
-- Expected: 37 rows. dms.documents.view should exist. dms.document.view should NOT.

-- ── 4. Permission + Role Mapping ─────────────────────────────────────────────

SELECT p.permission_code,
       array_agg(DISTINCT r.role_code ORDER BY r.role_code) AS roles
FROM permissions p
LEFT JOIN role_permissions rp ON rp.permission_id = p.id
LEFT JOIN roles r ON r.id = rp.role_id
WHERE p.permission_code LIKE 'ai.%'
GROUP BY p.permission_code
ORDER BY p.permission_code;

-- ── 5. RLS Status — All AI Tables ────────────────────────────────────────────

SELECT tablename, relrowsecurity AS rls_enabled, relforcerowsecurity AS rls_forced
FROM pg_class
JOIN pg_tables ON tablename = relname AND schemaname = 'public'
WHERE tablename LIKE 'erp_ai_%'
   OR tablename LIKE 'dms_ai_%'
   OR tablename = 'dms_document_content'
ORDER BY tablename;
-- Expected: All true/true. No false.

-- ── 6. Event Table Policies (Append-Only Check) ───────────────────────────────

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'erp_ai_field_suggestion_events',
    'erp_ai_duplicate_candidate_events',
    'erp_ai_compliance_finding_events',
    'erp_ai_risk_score_events',
    'erp_ai_data_quality_finding_events',
    'erp_ai_assistant_messages'
  )
ORDER BY tablename, cmd;
-- Expected: Only SELECT + INSERT policies. No UPDATE or DELETE.

-- ── 7. Assistant Table Policies ───────────────────────────────────────────────

SELECT tablename, policyname, cmd, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'erp_ai_assistant%'
ORDER BY tablename, cmd;

-- ── 8. Data Quality Table Policies ───────────────────────────────────────────

SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public' AND tablename LIKE 'erp_ai_data_quality%'
ORDER BY tablename, cmd;

-- ── 9. audit_logs Schema (F-001 Evidence) ────────────────────────────────────

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'audit_logs'
ORDER BY ordinal_position;
-- Key: actor_user_profile_id (not actor_id), action (not event_type),
--       new_values (not metadata_json), NO entity_type column.

-- ── 10. erp_ai_data_quality_findings Schema ──────────────────────────────────

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'erp_ai_data_quality_findings'
ORDER BY ordinal_position;

-- ── 11. AI Provider Config Columns ───────────────────────────────────────────

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'erp_ai_provider_configs'
ORDER BY ordinal_position;
-- Key: provider_type (not provider_code), model_id (not model_name),
--      secret_ref (not api_key), masked_secret_preview (not api_key value)

-- ── 12. Row Counts — All AI Tables ───────────────────────────────────────────

SELECT 'erp_ai_usage_logs' AS t, COUNT(*) FROM erp_ai_usage_logs;
SELECT 'erp_ai_field_suggestions' AS t, COUNT(*) FROM erp_ai_field_suggestions;
SELECT 'erp_ai_field_suggestion_events' AS t, COUNT(*) FROM erp_ai_field_suggestion_events;
SELECT 'erp_ai_duplicate_candidates' AS t, COUNT(*) FROM erp_ai_duplicate_candidates;
SELECT 'erp_ai_duplicate_candidate_events' AS t, COUNT(*) FROM erp_ai_duplicate_candidate_events;
SELECT 'erp_ai_compliance_findings' AS t, COUNT(*) FROM erp_ai_compliance_findings;
SELECT 'erp_ai_compliance_finding_events' AS t, COUNT(*) FROM erp_ai_compliance_finding_events;
SELECT 'erp_ai_risk_scores' AS t, COUNT(*) FROM erp_ai_risk_scores;
SELECT 'erp_ai_risk_score_events' AS t, COUNT(*) FROM erp_ai_risk_score_events;
SELECT 'erp_ai_recent_searches' AS t, COUNT(*) FROM erp_ai_recent_searches;
SELECT 'erp_ai_assistant_sessions' AS t, COUNT(*) FROM erp_ai_assistant_sessions;
SELECT 'erp_ai_assistant_messages' AS t, COUNT(*) FROM erp_ai_assistant_messages;
SELECT 'erp_ai_assistant_action_drafts' AS t, COUNT(*) FROM erp_ai_assistant_action_drafts;
SELECT 'erp_ai_audit_explanations' AS t, COUNT(*) FROM erp_ai_audit_explanations;
SELECT 'erp_ai_data_quality_findings' AS t, COUNT(*) FROM erp_ai_data_quality_findings;
SELECT 'erp_ai_data_quality_finding_events' AS t, COUNT(*) FROM erp_ai_data_quality_finding_events;
SELECT 'dms_ai_tag_suggestions' AS t, COUNT(*) FROM dms_ai_tag_suggestions;
SELECT 'dms_ai_link_suggestions' AS t, COUNT(*) FROM dms_ai_link_suggestions;
