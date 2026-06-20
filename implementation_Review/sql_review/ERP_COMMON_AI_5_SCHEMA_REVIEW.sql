-- ============================================================================
-- ERP COMMON AI.5 — AI Risk Scoring — Schema Review (READ ONLY)
-- Date: 2026-06-17
-- Status: REVIEW ONLY — DO NOT APPLY
-- Tool: user-supabase (https://mmiefuieduzdiiwnqpie.supabase.co)
-- ============================================================================

-- ── 1. Feature flags (note: live code is ERP_AI_RISK_SCORE, not ERP_AI_RISK_SCORING) ──

SELECT feature_code, is_enabled, requires_human_review, min_confidence_threshold, description
FROM erp_ai_feature_flags
WHERE feature_code IN (
  'ERP_AI_RISK_SCORE', 'ERP_AI_RISK_SCORING',
  'DMS_RISK_SCORE',
  'ERP_AI_COMPLIANCE', 'ERP_AI_DUPLICATE_DETECT', 'ERP_AI_DOC_UNDERSTANDING'
)
ORDER BY feature_code;

-- ── 2. Risk permissions ───────────────────────────────────────────────────────

SELECT permission_code, permission_name, module_code, action_code, is_active
FROM permissions
WHERE permission_code LIKE 'ai.risk%'
ORDER BY permission_code;

-- Role mappings for ai.risk.*
SELECT rp.role_id, r.role_code, p.permission_code
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE p.permission_code LIKE 'ai.risk%'
ORDER BY r.role_code, p.permission_code;

-- ── 3. Entity risk tables (expected: do not exist yet) ────────────────────────

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE 'erp_ai_risk%'
ORDER BY table_name;

-- ── 4. DMS document risk / completeness columns ───────────────────────────────

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_documents'
  AND column_name IN (
    'ai_risk_score', 'ai_risk_level', 'ai_risk_reasons_json', 'ai_risk_updated_at',
    'completeness_score', 'missing_fields_json',
    'expiry_date', 'issue_date', 'status',
    'ocr_text_available', 'ai_summary_status', 'summary_embedding_status',
    'confidentiality_level', 'document_type_id',
    'owning_company_id', 'owning_branch_id', 'party_id'
  )
ORDER BY column_name;

-- DMS risk score distribution
SELECT
  COUNT(*) AS total_docs,
  COUNT(*) FILTER (WHERE ai_risk_score IS NOT NULL) AS scored_docs,
  COUNT(*) FILTER (WHERE ai_risk_level = 'critical') AS critical_docs,
  COUNT(*) FILTER (WHERE ai_risk_level = 'high') AS high_docs,
  COUNT(*) FILTER (WHERE ai_risk_level IN ('medium','low','none')) AS lower_risk_docs,
  COUNT(*) FILTER (WHERE completeness_score IS NOT NULL AND completeness_score < 0.60) AS incomplete_docs
FROM dms_documents
WHERE deleted_at IS NULL;

-- ── 5. DMS links and required document rules ──────────────────────────────────

SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN (
  'dms_documents', 'dms_document_links', 'dms_required_document_rules',
  'dms_expiry_reminders', 'dms_renewal_requests'
)
ORDER BY relname;

SELECT rule_code, entity_type, is_required, is_active
FROM dms_required_document_rules
WHERE deleted_at IS NULL
ORDER BY entity_type, rule_code;

-- ── 6. AI.4 compliance findings ───────────────────────────────────────────────

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'erp_ai_compliance_findings'
ORDER BY ordinal_position;

SELECT status, severity, COUNT(*) AS cnt
FROM erp_ai_compliance_findings
WHERE deleted_at IS NULL
GROUP BY status, severity
ORDER BY status, severity;

-- ── 7. AI.3 duplicate candidates ──────────────────────────────────────────────

SELECT status, candidate_type, COUNT(*) AS cnt
FROM erp_ai_duplicate_candidates
WHERE deleted_at IS NULL
GROUP BY status, candidate_type
ORDER BY status, candidate_type;

-- ── 8. COMMON AI.1 field suggestions (conflict_detected) ──────────────────────

SELECT suggestion_type, status, COUNT(*) AS cnt
FROM erp_ai_field_suggestions
WHERE deleted_at IS NULL
GROUP BY suggestion_type, status
ORDER BY suggestion_type, status;

SELECT COUNT(*) AS pending_conflicts
FROM erp_ai_field_suggestions
WHERE deleted_at IS NULL
  AND status = 'pending'
  AND suggestion_type = 'conflict_detected';

-- ── 9. Entity manual / compliance columns ─────────────────────────────────────

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('owner_companies', 'parties', 'branches', 'work_sites',
                     'party_licenses', 'party_tax_registrations', 'party_compliance_profiles')
  AND column_name IN (
    'compliance_status', 'expiry_date', 'license_number', 'trn',
    'dms_license_document_id', 'kyc_status_id', 'ai_risk_score', 'ai_risk_level'
  )
ORDER BY table_name, column_name;

-- owner_companies compliance_status values
SELECT compliance_status, COUNT(*) AS cnt
FROM owner_companies
WHERE deleted_at IS NULL
GROUP BY compliance_status
ORDER BY compliance_status;

-- ── 10. Indexes on related tables ─────────────────────────────────────────────

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'dms_documents', 'dms_document_links',
    'erp_ai_compliance_findings', 'erp_ai_duplicate_candidates',
    'erp_ai_field_suggestions'
  )
ORDER BY tablename, indexname;

-- ── 11. RLS policies on AI tables ─────────────────────────────────────────────

SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'erp_ai_compliance_findings', 'erp_ai_duplicate_candidates',
    'erp_ai_field_suggestions', 'dms_documents'
  )
ORDER BY tablename, policyname;

-- ── 12. AI usage logs (for cost baseline) ─────────────────────────────────────

SELECT feature_area, COUNT(*) AS cnt
FROM erp_ai_usage_logs
WHERE created_at > now() - interval '30 days'
GROUP BY feature_area
ORDER BY cnt DESC;
