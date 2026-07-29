-- ============================================================================
-- ERP DMS AI Phase 15 — Performance Review Queries
-- ============================================================================
-- Execute via Supabase SQL Editor or user-supabase MCP.
-- All queries are READ-ONLY. Uses EXPLAIN (ANALYZE, BUFFERS) where safe.
-- Document: query plan, actual time, index used, rows returned.
-- Thresholds: job_claim<10ms, review_queue<50ms, usage_log_7d<200ms,
--             semantic_search<500ms, count_queries<20ms.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- PERF-01: Job queue claim query (critical path for worker)
-- Should use: idx_dms_ai_job_queue_claim (partial index on job_status)
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM public.dms_ai_job_queue
WHERE job_status IN ('queued','retry_scheduled')
  AND run_after <= NOW()
ORDER BY priority ASC, run_after ASC
LIMIT 5;

-- ---------------------------------------------------------------------------
-- PERF-02: Job queue status count (dashboard/admin)
-- Should use: idx_dms_ai_job_queue_claim or idx_dms_ai_job_queue_type_status
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT job_status, COUNT(*)
FROM public.dms_ai_job_queue
GROUP BY job_status;

-- ---------------------------------------------------------------------------
-- PERF-03: Review queue active list (main UI list)
-- Should use: idx_dms_review_queue_active
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, review_type, status, priority, queued_at
FROM public.dms_review_queue
WHERE status IN ('open','assigned','in_review')
  AND deleted_at IS NULL
ORDER BY priority ASC, queued_at DESC
LIMIT 50;

-- ---------------------------------------------------------------------------
-- PERF-04: Review queue count by status (dashboard cards)
-- Should use: idx_dms_review_queue_status or idx_dms_review_queue_active
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT status, COUNT(*)
FROM public.dms_review_queue
WHERE deleted_at IS NULL
GROUP BY status;

-- ---------------------------------------------------------------------------
-- PERF-05: Usage log 7-day aggregate (observability dashboard)
-- Should use: idx_erp_ai_usage_created (on created_at DESC)
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT
  feature_area,
  operation_type,
  status,
  COUNT(*)          AS event_count,
  SUM(input_token_count)  AS total_input_tokens,
  SUM(output_token_count) AS total_output_tokens,
  SUM(estimated_cost)     AS total_cost
FROM public.erp_ai_usage_logs
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY feature_area, operation_type, status
ORDER BY feature_area, operation_type;

-- ---------------------------------------------------------------------------
-- PERF-06: Usage log date-range count (observability overview)
-- Should use: idx_erp_ai_usage_created
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM public.erp_ai_usage_logs
WHERE created_at >= NOW() - INTERVAL '30 days';

-- ---------------------------------------------------------------------------
-- PERF-07: Validation findings open count
-- Should use: idx_dms_ai_validation_findings_active (partial index)
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM public.dms_ai_validation_findings
WHERE status = 'open'
  AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- PERF-08: Entity match candidates pending count
-- Should use: idx_dms_ai_entity_match_candidates_active (partial index)
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM public.dms_ai_entity_match_candidates
WHERE status = 'pending'
  AND deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- PERF-09: Semantic chunk embedding status count
-- Should use: idx_dms_chunks_embedding_status or idx_dms_chunks_document_id
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT embedding_status, COUNT(*)
FROM public.dms_document_content_chunks
WHERE is_active = true
  AND deleted_at IS NULL
GROUP BY embedding_status;

-- ---------------------------------------------------------------------------
-- PERF-10: Job queue — stale running jobs (recovery query)
-- Should use: idx_dms_ai_job_queue_locked_at (partial index on locked_at)
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT id, job_type, locked_at, locked_by
FROM public.dms_ai_job_queue
WHERE job_status = 'running'
  AND locked_at < NOW() - INTERVAL '10 minutes';

-- ---------------------------------------------------------------------------
-- PERF-11: OCR backfill source query (dry-run candidate count)
-- Identifies files eligible for OCR backfill (no OCR result yet)
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM public.dms_document_files f
JOIN public.dms_documents d ON d.id = f.document_id
WHERE f.ocr_status IN ('pending', 'failed')
  AND f.deleted_at IS NULL
  AND d.deleted_at IS NULL
LIMIT 1;

-- ---------------------------------------------------------------------------
-- PERF-12: Semantic index backfill dry-run source query
-- Identifies documents needing semantic re-index
-- ---------------------------------------------------------------------------
EXPLAIN (ANALYZE, BUFFERS)
SELECT COUNT(*)
FROM public.dms_documents d
WHERE d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.dms_document_content_chunks c
    WHERE c.document_id = d.id
      AND c.is_active = true
      AND c.embedding_status = 'complete'
      AND c.deleted_at IS NULL
  )
LIMIT 1;

-- ---------------------------------------------------------------------------
-- PERF-13: Duplicate index check on erp_ai_usage_logs
-- Should show whether redundant index pairs were removed
-- ---------------------------------------------------------------------------
SELECT
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'erp_ai_usage_logs'
ORDER BY indexname;

-- ---------------------------------------------------------------------------
-- PERF-14: Check for seq scans on large tables (informational)
-- After running the above EXPLAIN queries, note if any show "Seq Scan".
-- Current row counts are small (65 usage_logs, 9 jobs), so seq scans are
-- normal at this scale. Document for future monitoring when data grows.
-- ---------------------------------------------------------------------------
SELECT
  schemaname,
  relname      AS table_name,
  n_live_tup   AS live_rows,
  seq_scan,
  idx_scan
FROM pg_stat_user_tables
WHERE relname IN (
  'dms_ai_job_queue',
  'dms_ai_job_attempts',
  'dms_document_content_chunks',
  'dms_review_queue',
  'dms_ai_validation_findings',
  'dms_ai_entity_match_candidates',
  'erp_ai_usage_logs'
)
ORDER BY relname;
