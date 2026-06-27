-- ============================================================
-- ERP DMS AI Phase 11 — Semantic Chunking and Embeddings
-- Migration 3: Chunk Search RPC
-- Migration: 20260625102000_erp_dms_ai_phase11_chunk_search_rpc.sql
-- Date: 2026-06-25
--
-- Creates search_dms_document_chunks_by_embedding RPC.
-- SECURITY INVOKER — RLS is enforced for the calling user.
-- Returns only a 250-char snippet; never returns full chunk_text.
-- Confidentiality gate: excludes hr/legal/executive from non-admin results.
-- ============================================================

CREATE OR REPLACE FUNCTION public.search_dms_document_chunks_by_embedding(
  p_query_embedding      vector(1536),
  p_match_count          integer          DEFAULT 50,
  p_match_threshold      double precision DEFAULT 0.2,
  p_is_admin             boolean          DEFAULT false,
  p_document_type_id     bigint           DEFAULT NULL
)
RETURNS TABLE (
  chunk_id              bigint,
  document_id           bigint,
  document_no           text,
  title                 text,
  chunk_index           integer,
  snippet               text,
  similarity            double precision,
  confidentiality_level text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    c.id                                                          AS chunk_id,
    d.id                                                          AS document_id,
    d.document_no,
    d.title,
    c.chunk_index,
    left(c.chunk_text, 250)                                       AS snippet,
    1 - (c.embedding <=> p_query_embedding)                       AS similarity,
    d.confidentiality_level
  FROM public.dms_document_content_chunks c
  JOIN public.dms_documents d ON d.id = c.document_id
  WHERE c.is_active = true
    AND c.deleted_at IS NULL
    AND c.embedding_status = 'complete'
    AND c.embedding IS NOT NULL
    AND d.deleted_at IS NULL
    AND (
      p_is_admin = true
      OR d.confidentiality_level NOT IN ('hr', 'legal', 'executive')
    )
    AND (
      p_document_type_id IS NULL
      OR d.document_type_id = p_document_type_id
    )
    AND (1 - (c.embedding <=> p_query_embedding)) >= p_match_threshold
  ORDER BY c.embedding <=> p_query_embedding
  LIMIT GREATEST(1, LEAST(p_match_count, 100))
$$;
