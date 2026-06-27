-- ============================================================
-- ERP DMS AI Phase 11 — Semantic Chunking and Embeddings
-- Migration 2: Phase 11 Feature Flags
-- Migration: 20260625101000_erp_dms_ai_phase11_semantic_flags.sql
-- Date: 2026-06-25
--
-- Inserts Phase 11 feature flags. ALL default to is_enabled = false.
-- Zero behavior change upon deploy. Enable flags in rollout sequence:
--   1. DMS_EMBEDDING             → document-level embedding in orchestration
--   2. DMS_SEMANTIC_CHUNKING     → chunk creation enabled
--   3. DMS_SEMANTIC_EMBEDDINGS   → chunk embedding generation enabled
--   4. DMS_SEMANTIC_INDEX_QUEUE  → admin can enqueue semantic index backfill
--   5. DMS_SEMANTIC_SEARCH_CHUNKS → search uses chunk-level RPC
--
-- IMPORTANT: DMS_SEMANTIC_SEARCH (already true) is NOT changed.
-- ============================================================

INSERT INTO public.erp_ai_feature_flags
  (feature_code, feature_name, description, is_enabled, requires_human_review, min_confidence_threshold)
VALUES
  -- FIX: DMS_EMBEDDING referenced in system-pipeline.ts but was never inserted
  (
    'DMS_EMBEDDING',
    'DMS Document-Level Embedding',
    'Enables document-level summary embedding step in the post-approve orchestration pipeline. When false, the embedding step is skipped silently.',
    false, false, 0.000
  ),
  -- Phase 11 new flags
  (
    'DMS_SEMANTIC_CHUNKING',
    'DMS Semantic Chunking',
    'Enables splitting dms_document_content.content_text into overlapping paragraph chunks stored in dms_document_content_chunks. Requires DMS_EMBEDDING.',
    false, false, 0.000
  ),
  (
    'DMS_SEMANTIC_EMBEDDINGS',
    'DMS Chunk Embeddings',
    'Enables embedding vector generation for document content chunks. Requires DMS_SEMANTIC_CHUNKING and a configured DEFAULT_EMBEDDING provider.',
    false, false, 0.000
  ),
  (
    'DMS_SEMANTIC_INDEX_QUEUE',
    'DMS Semantic Index Queue',
    'Enables queue-backed semantic indexing and admin backfill via dms_ai_job_queue. Requires DMS_AI_JOB_QUEUE=true.',
    false, false, 0.000
  ),
  (
    'DMS_SEMANTIC_SEARCH_CHUNKS',
    'DMS Chunk-Level Semantic Search',
    'When enabled, semantic search uses chunk-level vector search (search_dms_document_chunks_by_embedding). Falls back to document-level search when disabled or no chunks indexed.',
    false, false, 0.000
  )
ON CONFLICT (feature_code) DO UPDATE SET
  feature_name  = EXCLUDED.feature_name,
  description   = EXCLUDED.description;
-- Note: is_enabled is NOT updated on conflict — preserves any manual admin override.
