-- ============================================================
-- ERP DMS AI Phase 11 — Semantic Chunking and Embeddings
-- Migration 1: dms_document_content_chunks table + RLS + Indexes + HNSW
-- Migration: 20260625100000_erp_dms_ai_phase11_semantic_chunks.sql
-- Date: 2026-06-25
--
-- Additive only. No destructive changes.
-- pgvector extension already enabled by 20260615100000.
-- vector(1536) dimension matches text-embedding-3-small (confirmed).
-- ============================================================

-- ── 1. Create dms_document_content_chunks table ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.dms_document_content_chunks (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id             BIGINT NOT NULL
                            REFERENCES public.dms_documents(id) ON DELETE CASCADE,
  content_id              BIGINT NULL
                            REFERENCES public.dms_document_content(id) ON DELETE SET NULL,
  chunk_index             INTEGER NOT NULL,
  chunk_text              TEXT NOT NULL,
  chunk_hash              TEXT NOT NULL,
  content_hash            TEXT NOT NULL,
  source_kind             TEXT NOT NULL DEFAULT 'document_content'
                            CHECK (source_kind IN ('document_content','truncated_content','short_document')),
  language                TEXT NULL,
  page_start              INTEGER NULL,
  page_end                INTEGER NULL,
  token_estimate          INTEGER NULL,
  char_count              INTEGER NOT NULL,
  embedding_status        TEXT NOT NULL DEFAULT 'pending'
                            CHECK (embedding_status IN ('pending','complete','failed','skipped','not_required')),
  embedding_provider      TEXT NULL,
  embedding_model         TEXT NULL,
  embedding               vector(1536) NULL,
  embedded_at             TIMESTAMPTZ NULL,
  embedding_error_code    TEXT NULL,
  embedding_error_message TEXT NULL,
  is_active               BOOLEAN NOT NULL DEFAULT true,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by              BIGINT NULL,
  updated_by              BIGINT NULL,
  deleted_at              TIMESTAMPTZ NULL,

  CONSTRAINT chk_dms_chunks_char_count CHECK (char_count > 0),
  CONSTRAINT chk_dms_chunks_chunk_index CHECK (chunk_index >= 0)
);

-- ── 2. Enable RLS ─────────────────────────────────────────────────────────────

ALTER TABLE public.dms_document_content_chunks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_document_content_chunks FORCE ROW LEVEL SECURITY;

-- ── 3. RLS Policies ───────────────────────────────────────────────────────────

-- SELECT: authenticated user with dms.documents.view, parent document not deleted,
--         and if confidential (hr/legal/executive) require dms.admin or system_admin.
CREATE POLICY dms_chunks_select
  ON public.dms_document_content_chunks
  FOR SELECT
  TO public
  USING (
    auth.uid() IS NOT NULL
    AND current_user_has_permission('dms.documents.view')
    AND EXISTS (
      SELECT 1 FROM public.dms_documents d
      WHERE d.id = document_id
        AND d.deleted_at IS NULL
        AND (
          d.confidentiality_level NOT IN ('hr', 'legal', 'executive')
          OR current_user_has_permission('dms.admin')
          OR current_user_has_role('system_admin')
        )
    )
  );

-- INSERT/UPDATE/DELETE: dms.documents.edit, dms.admin, or system_admin
CREATE POLICY dms_chunks_manage
  ON public.dms_document_content_chunks
  FOR ALL
  TO public
  USING (
    current_user_has_permission('dms.documents.edit')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  )
  WITH CHECK (
    current_user_has_permission('dms.documents.edit')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

-- ── 4. Unique index: one active chunk per (doc, index, content_hash) ──────────

CREATE UNIQUE INDEX IF NOT EXISTS uidx_dms_chunks_doc_idx_hash
  ON public.dms_document_content_chunks (document_id, chunk_index, content_hash)
  WHERE is_active = true AND deleted_at IS NULL;

-- ── 5. Standard lookup indexes ────────────────────────────────────────────────

-- Document lookup (primary access pattern)
CREATE INDEX IF NOT EXISTS idx_dms_chunks_document_id
  ON public.dms_document_content_chunks (document_id)
  WHERE is_active = true AND deleted_at IS NULL;

-- Content hash lookup for invalidation detection
CREATE INDEX IF NOT EXISTS idx_dms_chunks_content_hash
  ON public.dms_document_content_chunks (document_id, content_hash)
  WHERE is_active = true;

-- Chunk hash lookup for deduplication
CREATE INDEX IF NOT EXISTS idx_dms_chunks_chunk_hash
  ON public.dms_document_content_chunks (chunk_hash)
  WHERE is_active = true AND deleted_at IS NULL;

-- Embedding status for backfill / queue processing
CREATE INDEX IF NOT EXISTS idx_dms_chunks_embedding_status
  ON public.dms_document_content_chunks (document_id, embedding_status)
  WHERE is_active = true AND deleted_at IS NULL;

-- ── 6. HNSW partial index for semantic vector search ─────────────────────────
-- Partial index: only active, fully-embedded, non-null chunks.
-- Excludes NULL vectors (which would cause errors).
-- pgvector v0.8.0 supports HNSW natively (no training required).

CREATE INDEX IF NOT EXISTS idx_dms_chunks_embedding_hnsw
  ON public.dms_document_content_chunks
  USING hnsw (embedding vector_cosine_ops)
  WHERE is_active = true
    AND embedding IS NOT NULL
    AND embedding_status = 'complete';
