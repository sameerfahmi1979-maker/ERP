-- ERP DMS 12.5 — Semantic Search / pgvector / Embeddings
-- Additive only. No destructive changes. RLS untouched (inherits dms_documents policies).
-- Applied to live DB 2026-06-15 via user-supabase MCP.

-- 1. Enable pgvector extension (available v0.8.0 — supports HNSW)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Embedding columns on dms_documents
ALTER TABLE public.dms_documents
  ADD COLUMN IF NOT EXISTS summary_embedding vector(1536),
  ADD COLUMN IF NOT EXISTS summary_embedding_model TEXT,
  ADD COLUMN IF NOT EXISTS summary_embedding_status TEXT DEFAULT 'pending'
    CHECK (summary_embedding_status IN ('pending','complete','failed','skipped','not_required')),
  ADD COLUMN IF NOT EXISTS summary_embedding_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS summary_embedding_error TEXT,
  ADD COLUMN IF NOT EXISTS summary_embedding_source TEXT
    CHECK (summary_embedding_source IN ('ai_summary','content_text'));

-- 3. HNSW cosine index (works at any table size, no training rows required)
CREATE INDEX IF NOT EXISTS idx_dms_documents_summary_embedding
  ON public.dms_documents
  USING hnsw (summary_embedding vector_cosine_ops);

-- 4. Semantic search RPC — SECURITY INVOKER so RLS is enforced for the caller.
--    Never returns content_text. Applies confidentiality filter in addition to RLS.
CREATE OR REPLACE FUNCTION public.search_dms_documents_by_embedding(
  p_query_embedding vector(1536),
  p_match_count integer DEFAULT 25,
  p_match_threshold double precision DEFAULT 0.2,
  p_is_admin boolean DEFAULT false,
  p_exclude_document_id bigint DEFAULT NULL
)
RETURNS TABLE (
  document_id bigint,
  document_no text,
  title text,
  ai_summary text,
  ai_risk_level text,
  completeness_score numeric,
  expiry_date date,
  confidentiality_level text,
  similarity double precision
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    d.id,
    d.document_no,
    d.title,
    d.ai_summary,
    d.ai_risk_level,
    d.completeness_score,
    d.expiry_date,
    d.confidentiality_level,
    1 - (d.summary_embedding <=> p_query_embedding) AS similarity
  FROM public.dms_documents d
  WHERE d.deleted_at IS NULL
    AND d.summary_embedding IS NOT NULL
    AND (p_exclude_document_id IS NULL OR d.id <> p_exclude_document_id)
    AND (
      p_is_admin = true
      OR d.confidentiality_level NOT IN ('hr','legal','executive')
    )
    AND (1 - (d.summary_embedding <=> p_query_embedding)) >= p_match_threshold
  ORDER BY d.summary_embedding <=> p_query_embedding
  LIMIT GREATEST(1, LEAST(p_match_count, 50));
$$;

-- 5. Feature flag
INSERT INTO public.erp_ai_feature_flags
  (feature_code, feature_name, description, is_enabled, requires_human_review, min_confidence_threshold)
VALUES
  ('DMS_SEMANTIC_SEARCH', 'DMS Semantic Search',
   'Semantic document search using pgvector embeddings of AI summaries.',
   true, false, 0.000)
ON CONFLICT (feature_code) DO NOTHING;
