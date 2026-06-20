-- ============================================================================
-- ERP COMMON AI.4 — AI Compliance Checker — Schema Review (READ ONLY)
-- Date: 2026-06-17
-- Status: REVIEW ONLY — DO NOT APPLY
-- Tool: user-supabase (https://mmiefuieduzdiiwnqpie.supabase.co)
-- ============================================================================

-- ── 1. Feature flag (note: code is ERP_AI_COMPLIANCE, not ERP_AI_COMPLIANCE_CHECKER) ──

SELECT feature_code, is_enabled, requires_human_review, min_confidence_threshold, description
FROM erp_ai_feature_flags
WHERE feature_code IN ('ERP_AI_COMPLIANCE', 'ERP_AI_COMPLIANCE_CHECKER', 'ERP_AI_DOC_UNDERSTANDING', 'ERP_AI_DUPLICATE_DETECT');

-- ── 2. Compliance permissions ─────────────────────────────────────────────────

SELECT permission_code, permission_name, module_code, action_type, is_active
FROM permissions
WHERE permission_code LIKE 'ai.compliance%'
ORDER BY permission_code;

-- Role mappings for ai.compliance.*
SELECT rp.role_id, r.role_code, p.permission_code
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE p.permission_code LIKE 'ai.compliance%'
ORDER BY r.role_code, p.permission_code;

-- ── 3. dms_required_document_rules ────────────────────────────────────────────

SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'dms_required_document_rules'
ORDER BY ordinal_position;

SELECT rule_code, entity_type, entity_subtype, document_type_id, is_required,
       requires_expiry_date, requires_issue_date, blocks_activation,
       owner_company_id, branch_id, department_id, is_active
FROM dms_required_document_rules
WHERE deleted_at IS NULL
ORDER BY entity_type, rule_code;

-- Join rules to document types
SELECT r.rule_code, r.entity_type, r.is_required, dt.type_code, dt.name_en
FROM dms_required_document_rules r
JOIN dms_document_types dt ON dt.id = r.document_type_id
WHERE r.deleted_at IS NULL AND r.is_active = true
ORDER BY r.entity_type, r.rule_code;

-- ── 4. Entity compliance-related columns ──────────────────────────────────────

SELECT table_name, column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('owner_companies', 'parties', 'branches', 'work_sites',
                     'party_licenses', 'party_tax_registrations', 'party_compliance_profiles')
  AND column_name IN ('compliance_status', 'expiry_date', 'license_number', 'trn',
                      'dms_license_document_id', 'kyc_status_id')
ORDER BY table_name, column_name;

-- ── 5. DMS document compliance columns ────────────────────────────────────────

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'dms_documents'
  AND column_name IN (
    'document_type_id', 'expiry_date', 'issue_date', 'status',
    'completeness_score', 'missing_fields_json',
    'ai_risk_level', 'ai_risk_score', 'ai_risk_reasons_json',
    'ai_summary_status', 'ocr_text_available',
    'summary_embedding_status', 'confidentiality_level',
    'owning_company_id', 'owning_branch_id', 'party_id'
  )
ORDER BY column_name;

-- ── 6. DMS links and expiry infrastructure ────────────────────────────────────

SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN (
  'dms_document_links', 'dms_documents', 'dms_document_content',
  'dms_expiry_reminders', 'dms_renewal_requests', 'dms_required_document_rules'
)
ORDER BY relname;

-- Sample linked document counts by entity type
SELECT entity_type, COUNT(*) AS link_count
FROM dms_document_links
WHERE deleted_at IS NULL
GROUP BY entity_type
ORDER BY link_count DESC;

-- ── 7. AI.3 duplicate candidates (integration source) ─────────────────────────

SELECT candidate_type, status, COUNT(*) AS cnt
FROM erp_ai_duplicate_candidates
WHERE deleted_at IS NULL
GROUP BY candidate_type, status
ORDER BY candidate_type, status;

SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('erp_ai_duplicate_candidates', 'erp_ai_duplicate_candidate_events');

-- ── 8. COMMON AI.1 field suggestions (conflict_detected integration) ────────────

SELECT suggestion_type, status, COUNT(*) AS cnt
FROM erp_ai_field_suggestions
WHERE deleted_at IS NULL
GROUP BY suggestion_type, status
ORDER BY suggestion_type, status;

SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN ('erp_ai_field_suggestions', 'erp_ai_field_suggestion_events');

-- ── 9. Check AI.4 tables do NOT exist yet ─────────────────────────────────────

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name IN (
    'erp_ai_compliance_findings',
    'erp_ai_compliance_finding_events',
    'erp_ai_compliance_snapshots'
  );

-- ── 10. Indexes on compliance-relevant tables ─────────────────────────────────

SELECT tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN (
    'dms_required_document_rules', 'dms_document_links', 'dms_documents',
    'party_licenses', 'erp_ai_duplicate_candidates', 'erp_ai_field_suggestions'
  )
ORDER BY tablename, indexname;
