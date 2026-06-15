-- ============================================================
-- ERP DMS 12.1 — Content Text Foundation and Full-Text Search
-- Phase: 12.1 (Content Text Foundation)
-- Date: 2026-06-15
-- ============================================================

-- ── 1. dms_document_content table ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dms_document_content (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id               BIGINT NOT NULL UNIQUE
                              REFERENCES public.dms_documents(id) ON DELETE CASCADE,
  content_text              TEXT,
  content_text_updated_at   TIMESTAMPTZ,
  content_text_source       TEXT CHECK (content_text_source IN (
                              'ocr','ai_intake','manual_override','truncated','system_resync'
                            )),
  content_text_sha256       TEXT,
  content_text_char_count   INTEGER CHECK (content_text_char_count >= 0),
  is_truncated              BOOLEAN NOT NULL DEFAULT false,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.dms_document_content ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_document_content FORCE ROW LEVEL SECURITY;

-- Select: authenticated user with dms.documents.view
CREATE POLICY dms_doc_content_select
  ON public.dms_document_content
  FOR SELECT
  TO public
  USING (
    auth.uid() IS NOT NULL
    AND current_user_has_permission('dms.documents.view')
  );

-- Manage: users with dms.documents.edit or system_admin
CREATE POLICY dms_doc_content_manage
  ON public.dms_document_content
  FOR ALL
  TO public
  USING (
    current_user_has_permission('dms.documents.edit')
    OR current_user_has_role('system_admin')
  )
  WITH CHECK (
    current_user_has_permission('dms.documents.edit')
    OR current_user_has_role('system_admin')
  );

-- Indexes
CREATE INDEX IF NOT EXISTS idx_dms_document_content_doc
  ON public.dms_document_content (document_id);

CREATE INDEX IF NOT EXISTS idx_dms_doc_content_fts
  ON public.dms_document_content
  USING GIN (to_tsvector('simple', coalesce(content_text, '')));


-- ── 2. New columns on dms_documents ────────────────────────────────────────

-- Full-text search vector (safe text only — never raw OCR)
ALTER TABLE public.dms_documents
  ADD COLUMN IF NOT EXISTS content_tsv TSVECTOR;

-- AI summary placeholder columns (populated in Phase 12.2)
ALTER TABLE public.dms_documents
  ADD COLUMN IF NOT EXISTS ai_summary                     TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary_updated_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ai_summary_model               TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary_status              TEXT
    DEFAULT 'pending'
    CHECK (ai_summary_status IN ('not_required','pending','complete','failed','skipped')),
  ADD COLUMN IF NOT EXISTS ai_summary_error               TEXT,
  ADD COLUMN IF NOT EXISTS ai_summary_input_char_count    INTEGER,
  ADD COLUMN IF NOT EXISTS ai_summary_input_truncated     BOOLEAN DEFAULT false;

-- Completeness placeholder columns (scored in Phase 12.3)
ALTER TABLE public.dms_documents
  ADD COLUMN IF NOT EXISTS completeness_score             NUMERIC(5,4)
    CHECK (completeness_score >= 0 AND completeness_score <= 1),
  ADD COLUMN IF NOT EXISTS missing_fields_json            JSONB,
  ADD COLUMN IF NOT EXISTS ai_warnings_json               JSONB;

-- Risk score placeholder columns (computed in Phase 12.3)
ALTER TABLE public.dms_documents
  ADD COLUMN IF NOT EXISTS ai_risk_score                  NUMERIC(5,4)
    CHECK (ai_risk_score >= 0 AND ai_risk_score <= 1),
  ADD COLUMN IF NOT EXISTS ai_risk_level                  TEXT
    CHECK (ai_risk_level IN ('none','low','medium','high','critical')),
  ADD COLUMN IF NOT EXISTS ai_risk_reasons_json           JSONB,
  ADD COLUMN IF NOT EXISTS ai_risk_updated_at             TIMESTAMPTZ;


-- ── 3. Trigger function for content_tsv ────────────────────────────────────
-- content_tsv uses 'simple' config (no stemming — safe for UAE codes, IDs, Arabic names)
-- Weights: A = document_no, title  |  B = description, ai_summary
-- content_text is deliberately excluded — raw OCR belongs in dms_document_content only

CREATE OR REPLACE FUNCTION public.update_dms_document_content_tsv()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.content_tsv :=
    setweight(to_tsvector('simple', coalesce(NEW.document_no, '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.title,       '')), 'A') ||
    setweight(to_tsvector('simple', coalesce(NEW.description, '')), 'B') ||
    setweight(to_tsvector('simple', coalesce(NEW.ai_summary,  '')), 'B');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_dms_documents_content_tsv
  BEFORE INSERT OR UPDATE OF document_no, title, description, ai_summary
  ON public.dms_documents
  FOR EACH ROW
  EXECUTE FUNCTION public.update_dms_document_content_tsv();


-- ── 4. Indexes on dms_documents ────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_dms_documents_content_tsv
  ON public.dms_documents USING GIN (content_tsv);

CREATE INDEX IF NOT EXISTS idx_dms_documents_risk_level
  ON public.dms_documents (ai_risk_level)
  WHERE ai_risk_level IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dms_documents_no_summary
  ON public.dms_documents (id)
  WHERE ai_summary IS NULL AND deleted_at IS NULL;


-- ── 5. Backfill content_tsv for all existing documents ─────────────────────

UPDATE public.dms_documents
SET content_tsv =
  setweight(to_tsvector('simple', coalesce(document_no, '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(title,       '')), 'A') ||
  setweight(to_tsvector('simple', coalesce(description, '')), 'B')
WHERE deleted_at IS NULL
  AND content_tsv IS NULL;


-- ── 6. Phase 12 AI feature flags ───────────────────────────────────────────

INSERT INTO public.erp_ai_feature_flags
  (feature_code, feature_name, description, is_enabled, requires_human_review, min_confidence_threshold)
VALUES
  ('DMS_CONTENT_TEXT_SYNC',
   'DMS Content Text Sync',
   'Sync extracted text to dms_document_content after OCR or AI intake approval.',
   true, false, 0.000),

  ('DMS_AI_SUMMARY',
   'DMS AI Document Summary',
   '3-5 sentence AI summary per document. Generated after intake or on demand.',
   true, false, 0.000),

  ('DMS_AI_SEARCH',
   'DMS AI Natural Language Search',
   'LLM intent extraction + SQL search across documents.',
   true, false, 0.000),

  ('DMS_AUTO_TAGS',
   'DMS AI Auto-Tag Suggestion',
   'AI suggests document tags. User must approve before saving.',
   true, true, 0.700),

  ('DMS_SMART_LINKS',
   'DMS AI Smart ERP Linking',
   'AI suggests ERP record links (party, employee, etc.). User must approve.',
   true, true, 0.750),

  ('DMS_RISK_SCORE',
   'DMS AI Risk Scoring',
   'Compute ai_risk_score from expiry, completeness, and AI warnings.',
   true, false, 0.000),

  ('DMS_COMPLETENESS',
   'DMS AI Completeness Check',
   'Compute completeness_score from required metadata fields.',
   true, false, 0.000),

  ('DMS_DUPLICATE_DETECT',
   'DMS Duplicate Document Detection',
   'Detect similar documents by sha256, metadata identifiers, and party+type+date.',
   true, true, 0.800),

  ('DMS_EXPIRY_INTEL',
   'DMS AI Expiry Intelligence',
   'AI classifies expiry state from document text.',
   true, false, 0.000),

  ('DMS_DOCUMENT_QA',
   'DMS Ask About Document',
   'Natural language Q&A for one specific document using content_text and ai_summary.',
   true, false, 0.000),

  ('DMS_CROSS_DOC_SEARCH',
   'DMS Cross-Document AI Search',
   'AI intent extraction + SQL search across all accessible documents.',
   true, false, 0.000)

ON CONFLICT (feature_code) DO NOTHING;
