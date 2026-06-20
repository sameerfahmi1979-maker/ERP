-- ============================================================================
-- ERP DMS AI ORCH.1 — Schema Review SQL
-- Purpose: Read-only audit queries for orchestration planning
-- Date: 2026-06-17
-- Status: READ-ONLY — DO NOT MODIFY DATA
-- ============================================================================

-- ── 1. Upload session columns relevant to orchestration ────────────────────────
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_upload_sessions'
ORDER BY ordinal_position;

-- ── 2. Upload batch columns ───────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_upload_batches'
ORDER BY ordinal_position;

-- ── 3. Document intelligence columns ─────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_documents'
  AND column_name IN (
    'id', 'status', 'deleted_at',
    'ocr_last_run_at', 'ocr_text_available',
    'ai_summary', 'ai_summary_status', 'ai_summary_updated_at',
    'ai_summary_model', 'ai_summary_error', 'ai_summary_input_truncated',
    'completeness_score', 'missing_fields_json',
    'ai_risk_score', 'ai_risk_level', 'ai_risk_reasons_json', 'ai_risk_updated_at',
    'summary_embedding', 'summary_embedding_status', 'summary_embedding_model',
    'summary_embedding_updated_at', 'summary_embedding_error', 'summary_embedding_source'
  )
ORDER BY ordinal_position;

-- ── 4. Document files OCR columns ─────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_document_files'
  AND column_name IN (
    'id', 'document_id', 'version_id', 'is_current_version', 'deleted_at',
    'ocr_status', 'ocr_provider', 'ocr_model',
    'ocr_started_at', 'ocr_completed_at', 'ocr_error_message', 'ocr_confidence',
    'ocr_page_count', 'ocr_language', 'ocr_text'
  )
ORDER BY ordinal_position;

-- ── 5. AI extraction jobs/results columns ─────────────────────────────────────
SELECT t.table_name, c.column_name, c.data_type, c.is_nullable
FROM information_schema.columns c
JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
WHERE c.table_schema = 'public'
  AND c.table_name IN ('dms_ai_extraction_jobs', 'dms_ai_extraction_results')
ORDER BY c.table_name, c.ordinal_position;

-- ── 6. Document content table ─────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_document_content'
ORDER BY ordinal_position;

-- ── 7. Tag/link suggestion tables ────────────────────────────────────────────
SELECT t.table_name, c.column_name, c.data_type, c.is_nullable
FROM information_schema.columns c
JOIN information_schema.tables t ON t.table_name = c.table_name AND t.table_schema = c.table_schema
WHERE c.table_schema = 'public'
  AND c.table_name IN ('dms_ai_tag_suggestions', 'dms_ai_link_suggestions')
ORDER BY c.table_name, c.ordinal_position;

-- ── 8. RLS status on orchestration-relevant tables ────────────────────────────
SELECT c.relname AS table_name,
       c.relrowsecurity  AS rls_enabled,
       c.relforcerowsecurity AS rls_forced
FROM pg_class c
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public'
  AND c.relkind = 'r'
  AND c.relname IN (
    'dms_upload_sessions',
    'dms_upload_batches',
    'dms_documents',
    'dms_document_files',
    'dms_document_content',
    'dms_ai_extraction_jobs',
    'dms_ai_extraction_results',
    'dms_ai_tag_suggestions',
    'dms_ai_link_suggestions',
    'erp_ai_usage_logs',
    'erp_ai_feature_flags'
  )
ORDER BY c.relname;

-- ── 9. RLS policies on upload sessions and documents ─────────────────────────
SELECT schemaname, tablename, policyname, cmd
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('dms_upload_sessions', 'dms_upload_batches', 'dms_documents')
ORDER BY tablename, policyname;

-- ── 10. Current feature flag states ──────────────────────────────────────────
SELECT feature_code, is_enabled, requires_human_review, min_confidence_threshold
FROM erp_ai_feature_flags
WHERE feature_code LIKE 'DMS_%'
   OR feature_code LIKE 'ERP_AI_%'
ORDER BY feature_code;

-- ── 11. Check if orchestration columns already exist ──────────────────────────
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_upload_sessions'
  AND column_name LIKE 'orchestration%'
ORDER BY ordinal_position;

-- ── 12. Check current dms_documents status constraint ────────────────────────
SELECT conname, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'dms_documents'::regclass
  AND contype = 'c'
ORDER BY conname;

-- ── 13. Usage log schema ──────────────────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'erp_ai_usage_logs'
ORDER BY ordinal_position;

-- ── 14. Intake review values schema ──────────────────────────────────────────
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'dms_intake_review_values'
ORDER BY ordinal_position;

-- ── 15. Count of pending_ai_review documents (canary check) ──────────────────
SELECT status, COUNT(*) AS count
FROM dms_documents
WHERE deleted_at IS NULL
GROUP BY status
ORDER BY count DESC;
