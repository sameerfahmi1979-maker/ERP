-- ============================================================================
-- ERP COMMON AI.2 — Document Understanding Center — Schema Review
-- Purpose: Read-only audit queries for planning
-- Date: 2026-06-17
-- Status: READ-ONLY — DO NOT MODIFY DATA
-- ============================================================================

-- ── 1. DMS document intelligence columns (confirmed in live DB) ───────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_documents'
  AND column_name IN (
    'id', 'document_no', 'title', 'status', 'confidentiality_level',
    'issue_date', 'expiry_date', 'deleted_at',
    'ocr_last_run_at', 'ocr_text_available',
    'ai_summary', 'ai_summary_status', 'ai_summary_updated_at',
    'ai_summary_model', 'ai_summary_error', 'ai_summary_input_truncated',
    'completeness_score', 'missing_fields_json',
    'ai_risk_score', 'ai_risk_level', 'ai_risk_reasons_json', 'ai_risk_updated_at',
    'summary_embedding_status', 'summary_embedding_model', 'summary_embedding_source',
    'summary_embedding_updated_at'
  )
ORDER BY ordinal_position;

-- ── 2. dms_document_content columns ──────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_document_content'
ORDER BY ordinal_position;

-- ── 3. dms_document_files OCR columns ─────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_document_files'
  AND column_name IN (
    'id', 'document_id', 'is_current_version', 'deleted_at',
    'ocr_status', 'ocr_confidence', 'ocr_page_count', 'ocr_completed_at',
    'mime_type', 'file_name'
  )
ORDER BY ordinal_position;

-- ── 4. dms_ai_extraction_results columns ──────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_ai_extraction_results'
  AND column_name IN (
    'id', 'document_id', 'upload_session_id', 'result_type', 'ai_status',
    'classification_score', 'classification_reason',
    'suggested_title', 'suggested_description',
    'field_confidence_json', 'created_at'
  )
ORDER BY ordinal_position;

-- ── 5. dms_ai_tag_suggestions columns ─────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_ai_tag_suggestions'
  AND column_name IN ('id', 'document_id', 'status', 'confidence', 'created_at')
ORDER BY ordinal_position;

-- ── 6. dms_ai_link_suggestions columns ────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_ai_link_suggestions'
  AND column_name IN ('id', 'document_id', 'entity_type', 'entity_id', 'entity_name', 'status', 'confidence', 'created_at')
ORDER BY ordinal_position;

-- ── 7. dms_document_links columns ─────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_document_links'
  AND column_name IN ('id', 'document_id', 'entity_type', 'entity_id', 'is_primary', 'linked_at', 'deleted_at')
ORDER BY ordinal_position;

-- ── 8. dms_upload_sessions orchestration columns ──────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_upload_sessions'
  AND column_name IN (
    'id', 'document_id', 'intake_status', 'review_status',
    'orchestration_status', 'orchestration_steps_json',
    'orchestration_started_at', 'orchestration_completed_at'
  )
ORDER BY ordinal_position;

-- ── 9. erp_ai_field_suggestions columns ───────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'erp_ai_field_suggestions'
  AND column_name IN (
    'id', 'entity_type', 'entity_id', 'target_table', 'target_field',
    'field_label', 'status', 'deleted_at', 'created_at'
  )
ORDER BY ordinal_position;

-- ── 10. RLS status on all tables used by AI.2 ────────────────────────────────
SELECT c.relname AS table_name,
       c.relrowsecurity AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'dms_documents', 'dms_document_content', 'dms_document_files',
    'dms_ai_extraction_results', 'dms_document_metadata_values',
    'dms_document_links', 'dms_document_tags',
    'dms_ai_tag_suggestions', 'dms_ai_link_suggestions',
    'dms_upload_sessions', 'erp_ai_field_suggestions'
  )
ORDER BY c.relname;

-- ── 11. RLS policies on key tables ────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN (
    'dms_documents', 'dms_document_links', 'dms_ai_tag_suggestions',
    'dms_ai_link_suggestions', 'erp_ai_field_suggestions'
  )
ORDER BY tablename, policyname;

-- ── 12. Feature flags relevant to AI.2 ───────────────────────────────────────
SELECT feature_code, is_enabled, requires_human_review, description
FROM erp_ai_feature_flags
WHERE feature_code IN (
  'ERP_AI_DOC_UNDERSTANDING',
  'DMS_AI_SUMMARY', 'DMS_COMPLETENESS', 'DMS_RISK_SCORE',
  'DMS_SEMANTIC_SEARCH', 'DMS_AUTO_TAGS', 'DMS_SMART_LINKS',
  'DMS_DOCUMENT_QA', 'DMS_AI_ORCHESTRATION', 'DMS_AI_SEARCH'
)
ORDER BY feature_code;

-- ── 13. Indexes on document_id for AI.2 query performance ────────────────────
SELECT t.relname AS table_name, i.relname AS index_name, pg_get_indexdef(i.oid) AS definition
FROM pg_index ix
JOIN pg_class t ON t.oid = ix.indrelid
JOIN pg_class i ON i.oid = ix.indexrelid
JOIN pg_namespace n ON n.oid = t.relnamespace
WHERE n.nspname = 'public'
  AND t.relname IN (
    'dms_document_content', 'dms_document_files', 'dms_ai_extraction_results',
    'dms_document_links', 'dms_ai_tag_suggestions', 'dms_ai_link_suggestions',
    'dms_upload_sessions', 'erp_ai_field_suggestions'
  )
  AND pg_get_indexdef(i.oid) LIKE '%document_id%'
ORDER BY t.relname, i.relname;

-- ── 14. Count existing Understanding-related data (canary check) ──────────────
SELECT
  (SELECT COUNT(*) FROM dms_documents WHERE deleted_at IS NULL) AS total_documents,
  (SELECT COUNT(*) FROM dms_documents WHERE ai_summary_status = 'complete' AND deleted_at IS NULL) AS with_summary,
  (SELECT COUNT(*) FROM dms_documents WHERE completeness_score IS NOT NULL AND deleted_at IS NULL) AS with_completeness,
  (SELECT COUNT(*) FROM dms_documents WHERE ai_risk_level IS NOT NULL AND deleted_at IS NULL) AS with_risk,
  (SELECT COUNT(*) FROM dms_documents WHERE summary_embedding_status = 'complete' AND deleted_at IS NULL) AS with_embedding,
  (SELECT COUNT(*) FROM dms_document_links WHERE deleted_at IS NULL) AS total_links,
  (SELECT COUNT(*) FROM dms_ai_tag_suggestions WHERE status = 'pending') AS pending_tag_suggestions,
  (SELECT COUNT(*) FROM dms_ai_link_suggestions WHERE status = 'pending') AS pending_link_suggestions,
  (SELECT COUNT(*) FROM erp_ai_field_suggestions WHERE status = 'pending' AND deleted_at IS NULL) AS pending_field_suggestions;

-- ── 15. dms_document_understanding_snapshots — check if already exists ────────
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables
  WHERE table_schema = 'public' AND table_name = 'dms_document_understanding_snapshots'
) AS snapshot_table_exists;
