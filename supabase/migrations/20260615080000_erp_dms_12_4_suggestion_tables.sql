-- ERP DMS 12.4 — AI Search, Ask AI, Auto Tags, Smart Links
-- Date: 2026-06-15
-- Purpose: Create suggestion tables for AI-proposed tags and ERP entity links.
--          Suggestions are pending until a human explicitly accepts or rejects them.

-- ── 1. dms_ai_tag_suggestions ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dms_ai_tag_suggestions (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id         BIGINT NOT NULL REFERENCES public.dms_documents(id) ON DELETE CASCADE,
  tag_id              BIGINT NULL REFERENCES public.dms_tags(id) ON DELETE SET NULL,
  suggested_tag_name  TEXT NULL,
  confidence          NUMERIC(5,4) CHECK (confidence >= 0 AND confidence <= 1),
  reason              TEXT,
  status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','accepted','rejected','superseded')),
  suggested_by_user_id BIGINT NULL,
  reviewed_by         BIGINT NULL,
  reviewed_at         TIMESTAMPTZ NULL,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at          TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_dms_ai_tag_suggestions_doc
  ON public.dms_ai_tag_suggestions (document_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dms_ai_tag_suggestions_status
  ON public.dms_ai_tag_suggestions (status)
  WHERE deleted_at IS NULL;

-- Prevent duplicate pending suggestion for same document + existing tag
CREATE UNIQUE INDEX IF NOT EXISTS idx_dms_ai_tag_suggestions_pending_tag
  ON public.dms_ai_tag_suggestions (document_id, tag_id)
  WHERE status = 'pending' AND tag_id IS NOT NULL AND deleted_at IS NULL;

ALTER TABLE public.dms_ai_tag_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_ai_tag_suggestions FORCE ROW LEVEL SECURITY;

CREATE POLICY dms_ai_tag_sugg_select ON public.dms_ai_tag_suggestions
  FOR SELECT USING (current_user_has_permission('dms.documents.view'));

CREATE POLICY dms_ai_tag_sugg_write ON public.dms_ai_tag_suggestions
  FOR ALL USING (
    current_user_has_permission('dms.documents.edit') OR
    current_user_has_permission('dms.admin') OR
    current_user_has_role('service_role')
  );

-- ── 2. dms_ai_link_suggestions ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dms_ai_link_suggestions (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id    BIGINT NOT NULL REFERENCES public.dms_documents(id) ON DELETE CASCADE,
  entity_type    TEXT NOT NULL,
  entity_id      BIGINT NULL,
  entity_name    TEXT NULL,
  confidence     NUMERIC(5,4) CHECK (confidence >= 0 AND confidence <= 1),
  reason         TEXT,
  status         TEXT NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','accepted','rejected','superseded')),
  reviewed_by    BIGINT NULL,
  reviewed_at    TIMESTAMPTZ NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at     TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_dms_ai_link_suggestions_doc
  ON public.dms_ai_link_suggestions (document_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dms_ai_link_suggestions_entity
  ON public.dms_ai_link_suggestions (entity_type, entity_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dms_ai_link_suggestions_status
  ON public.dms_ai_link_suggestions (status)
  WHERE deleted_at IS NULL;

ALTER TABLE public.dms_ai_link_suggestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_ai_link_suggestions FORCE ROW LEVEL SECURITY;

CREATE POLICY dms_ai_link_sugg_select ON public.dms_ai_link_suggestions
  FOR SELECT USING (current_user_has_permission('dms.documents.view'));

CREATE POLICY dms_ai_link_sugg_write ON public.dms_ai_link_suggestions
  FOR ALL USING (
    current_user_has_permission('dms.documents.edit') OR
    current_user_has_permission('dms.admin') OR
    current_user_has_role('service_role')
  );
