-- ============================================================================
-- ERP COMMON AI.6 — AI Search Across ERP — Schema Review (READ ONLY)
-- Date: 2026-06-17
-- Status: REVIEW ONLY — DO NOT APPLY
-- Tool: user-supabase (https://mmiefuieduzdiiwnqpie.supabase.co)
-- ============================================================================

-- ── 1. Feature flags ──────────────────────────────────────────────────────────
-- IMPORTANT: Live flag is AI_SEARCH (not ERP_AI_SEARCH — that does not exist)

SELECT feature_code, is_enabled, requires_human_review, description
FROM erp_ai_feature_flags
WHERE feature_code IN (
  'AI_SEARCH',
  'ERP_AI_SEARCH',         -- should NOT exist
  'DMS_SEMANTIC_SEARCH',
  'ERP_AI_RISK_SCORE',
  'ERP_AI_COMPLIANCE',
  'ERP_AI_DUPLICATE_DETECT',
  'ERP_AI_DOC_UNDERSTANDING'
)
ORDER BY feature_code;

-- ── 2. Search permissions ─────────────────────────────────────────────────────

SELECT permission_code, permission_name, module_code, action_code, is_active
FROM permissions
WHERE permission_code LIKE 'ai.search%'
   OR permission_code LIKE 'ai.common%'
ORDER BY permission_code;

-- Role mappings for ai.search.*
SELECT rp.role_id, r.role_code, p.permission_code
FROM role_permissions rp
JOIN roles r ON r.id = rp.role_id
JOIN permissions p ON p.id = rp.permission_id
WHERE p.permission_code LIKE 'ai.search%'
ORDER BY r.role_code, p.permission_code;

-- ── 3. Entity table searchable columns ────────────────────────────────────────

SELECT table_name, column_name, data_type, is_nullable, character_maximum_length
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name IN ('owner_companies', 'branches', 'parties', 'work_sites')
  AND column_name IN (
    'id', 'trade_name', 'legal_name_en', 'legal_name_ar', 'short_name', 'company_code',
    'branch_name_en', 'branch_name_ar', 'branch_code', 'display_name', 'party_code',
    'trade_name_en', 'site_name', 'site_code', 'status', 'is_active', 'deleted_at',
    'compliance_status', 'owner_company_id', 'branch_id', 'main_email', 'phone'
  )
ORDER BY table_name, column_name;

-- ── 4. Entity table indexes (search-relevant) ────────────────────────────────

SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('owner_companies', 'branches', 'parties', 'work_sites')
ORDER BY tablename, indexname;

-- ── 5. DMS search columns and FTS/vector indexes ─────────────────────────────

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_documents'
  AND column_name IN (
    'id', 'document_no', 'title', 'description', 'ai_summary', 'ai_summary_status',
    'summary_embedding_status', 'ai_risk_score', 'ai_risk_level',
    'completeness_score', 'expiry_date', 'issue_date', 'status',
    'ocr_text_available', 'confidentiality_level', 'document_type_id',
    'owning_company_id', 'owning_branch_id', 'party_id',
    'content_tsv', 'deleted_at'
  )
ORDER BY column_name;

-- DMS indexes (FTS, trigram, HNSW vector)
SELECT schemaname, tablename, indexname, indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND tablename IN ('dms_documents', 'dms_document_content')
  AND (
    indexdef ILIKE '%tsvector%'
    OR indexdef ILIKE '%gin%'
    OR indexdef ILIKE '%hnsw%'
    OR indexdef ILIKE '%vector%'
    OR indexname ILIKE '%fts%'
    OR indexname ILIKE '%trgm%'
    OR indexname ILIKE '%embed%'
  )
ORDER BY tablename, indexname;

-- Vector column info (pgvector)
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_documents'
  AND udt_name = 'vector';

-- ── 6. AI.3 / AI.4 / AI.5 columns for search badges ─────────────────────────

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'erp_ai_duplicate_candidates'
ORDER BY ordinal_position;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'erp_ai_compliance_findings'
ORDER BY ordinal_position;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'erp_ai_risk_scores'
ORDER BY ordinal_position;

SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'erp_ai_field_suggestions'
ORDER BY ordinal_position;

-- ── 7. RLS on entity and AI tables ───────────────────────────────────────────

SELECT relname, relrowsecurity, relforcerowsecurity
FROM pg_class
WHERE relname IN (
  'owner_companies', 'branches', 'parties', 'work_sites',
  'dms_documents',
  'erp_ai_duplicate_candidates', 'erp_ai_compliance_findings',
  'erp_ai_risk_scores', 'erp_ai_field_suggestions'
)
ORDER BY relname;

-- RLS policies on AI tables
SELECT schemaname, tablename, policyname, permissive, roles, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'erp_ai_duplicate_candidates', 'erp_ai_compliance_findings',
    'erp_ai_risk_scores', 'erp_ai_field_suggestions'
  )
ORDER BY tablename, policyname;

-- ── 8. AI provider and DMS AI provider configs (no API keys — never) ─────────

SELECT pc.provider_type, pc.display_name, pc.is_active, pc.is_default,
       pc.purpose_codes, pc.model_name, pc.api_version
FROM erp_ai_provider_configs pc
WHERE pc.is_active = true
ORDER BY pc.is_default DESC, pc.display_name;

-- ── 9. Check for existing search-related tables ───────────────────────────────

SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name LIKE '%search%'
ORDER BY table_name;

-- erp_ai_recent_searches — expected: does NOT exist yet
SELECT table_name
FROM information_schema.tables
WHERE table_schema = 'public'
  AND table_name = 'erp_ai_recent_searches';

-- ── 10. DMS content table ─────────────────────────────────────────────────────

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_document_content'
ORDER BY ordinal_position;

-- Row count
SELECT COUNT(*) AS content_rows, COUNT(*) FILTER (WHERE content_text IS NOT NULL) AS with_content
FROM dms_document_content;

-- ── 11. DMS document summary embedding status ─────────────────────────────────

SELECT
  COUNT(*) AS total_docs,
  COUNT(*) FILTER (WHERE summary_embedding IS NOT NULL) AS embedded_docs,
  COUNT(*) FILTER (WHERE summary_embedding_status = 'complete') AS embedding_complete,
  COUNT(*) FILTER (WHERE ai_summary IS NOT NULL) AS with_summary,
  COUNT(*) FILTER (WHERE ocr_text_available = true) AS with_ocr,
  COUNT(*) FILTER (WHERE ai_risk_score IS NOT NULL) AS risk_scored,
  COUNT(*) FILTER (WHERE confidentiality_level IN ('hr','legal','executive')) AS confidential_docs
FROM dms_documents
WHERE deleted_at IS NULL;

-- ── 12. DMS semantic search RPC (pgvector) ───────────────────────────────────

-- Check if search_dms_documents_by_embedding function exists
SELECT proname, proargnames, prokind
FROM pg_proc
WHERE proname LIKE '%search%dms%' OR proname LIKE '%embedding%'
ORDER BY proname;

-- ── 13. AI usage logs baseline ───────────────────────────────────────────────

SELECT feature_area, COUNT(*) AS cnt
FROM erp_ai_usage_logs
WHERE created_at > now() - interval '30 days'
GROUP BY feature_area
ORDER BY cnt DESC;

-- ── 14. Entity row counts ─────────────────────────────────────────────────────

SELECT 'owner_companies' AS entity, COUNT(*) AS total, COUNT(*) FILTER (WHERE deleted_at IS NULL) AS active FROM owner_companies
UNION ALL
SELECT 'branches', COUNT(*), COUNT(*) FILTER (WHERE deleted_at IS NULL) FROM branches
UNION ALL
SELECT 'parties', COUNT(*), COUNT(*) FILTER (WHERE deleted_at IS NULL) FROM parties
UNION ALL
SELECT 'work_sites', COUNT(*), COUNT(*) FILTER (WHERE deleted_at IS NULL AND status != 'inactive') FROM work_sites
UNION ALL
SELECT 'dms_documents', COUNT(*), COUNT(*) FILTER (WHERE deleted_at IS NULL) FROM dms_documents
ORDER BY entity;

-- ── 15. Workspace route registry — check for /search route ───────────────────

-- (Code review only — no DB table; inspect src/lib/workspace/workspace-route-registry.ts)
-- Expected: no /search or /admin/ai/search route registered yet
