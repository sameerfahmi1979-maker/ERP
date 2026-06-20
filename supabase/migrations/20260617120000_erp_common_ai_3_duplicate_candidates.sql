-- ERP COMMON AI.3 — Duplicate / Conflict Detection
-- Creates erp_ai_duplicate_candidates + erp_ai_duplicate_candidate_events
-- Feature flag ERP_AI_DUPLICATE_DETECT already exists (is_enabled=false — do not enable)

-- ── erp_ai_duplicate_candidates ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_ai_duplicate_candidates (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  candidate_type       TEXT NOT NULL,
  detection_method     TEXT NOT NULL DEFAULT 'deterministic',
  candidate_key        TEXT NOT NULL,

  entity_type_a        TEXT NOT NULL,
  entity_id_a          BIGINT NOT NULL,
  entity_type_b        TEXT,
  entity_id_b          BIGINT,

  conflict_field       TEXT,
  value_a              TEXT,
  value_b              TEXT,
  confidence_score     NUMERIC(5,4) NOT NULL DEFAULT 0.80,

  evidence_json        JSONB,
  ai_reason            TEXT,

  source_document_id   BIGINT REFERENCES public.dms_documents(id) ON DELETE SET NULL,

  status               TEXT NOT NULL DEFAULT 'pending',
  review_decision      TEXT,
  review_notes         TEXT,

  reviewed_by          BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reviewed_at          TIMESTAMPTZ,
  resolved_by          BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  resolved_at          TIMESTAMPTZ,

  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by           BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by           BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  deleted_at           TIMESTAMPTZ,

  CONSTRAINT erp_ai_dup_candidates_type_chk CHECK (candidate_type IN (
    'duplicate_party_trn', 'duplicate_party_iban', 'duplicate_party_license',
    'duplicate_party_email', 'duplicate_party_name',
    'duplicate_company_name', 'duplicate_branch_license', 'duplicate_site_name',
    'duplicate_document_hash', 'duplicate_document_link',
    'conflict_license_expiry', 'conflict_trn_value',
    'conflict_company_name', 'wrong_document_link', 'similar_name'
  )),
  CONSTRAINT erp_ai_dup_candidates_method_chk CHECK (
    detection_method IN ('deterministic', 'ai', 'hybrid')
  ),
  CONSTRAINT erp_ai_dup_candidates_status_chk CHECK (status IN (
    'pending', 'reviewed', 'confirmed_duplicate', 'confirmed_conflict',
    'ignored', 'resolved', 'superseded', 'failed'
  )),
  CONSTRAINT erp_ai_dup_candidates_confidence_chk CHECK (
    confidence_score >= 0 AND confidence_score <= 1
  ),
  CONSTRAINT erp_ai_dup_candidates_reason_len_chk CHECK (
    ai_reason IS NULL OR char_length(ai_reason) <= 500
  )
);

COMMENT ON TABLE public.erp_ai_duplicate_candidates IS
  'COMMON AI.3 — Duplicate and conflict detection candidates for review. '
  'No automatic merge/delete/update. evidence_json and value_a/b never contain raw OCR text, prompts, or API keys.';

CREATE INDEX IF NOT EXISTS idx_erp_ai_dup_candidates_status
  ON public.erp_ai_duplicate_candidates(status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ai_dup_candidates_entity_a
  ON public.erp_ai_duplicate_candidates(entity_type_a, entity_id_a)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ai_dup_candidates_entity_b
  ON public.erp_ai_duplicate_candidates(entity_type_b, entity_id_b)
  WHERE entity_type_b IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ai_dup_candidates_type_status
  ON public.erp_ai_duplicate_candidates(candidate_type, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ai_dup_candidates_doc
  ON public.erp_ai_duplicate_candidates(source_document_id)
  WHERE source_document_id IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ai_dup_candidates_confidence
  ON public.erp_ai_duplicate_candidates(confidence_score DESC, status)
  WHERE deleted_at IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_ai_dup_candidates_pending_key
  ON public.erp_ai_duplicate_candidates(candidate_key)
  WHERE status = 'pending' AND deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_erp_ai_dup_candidates_updated_at ON public.erp_ai_duplicate_candidates;
CREATE TRIGGER trg_erp_ai_dup_candidates_updated_at
  BEFORE UPDATE ON public.erp_ai_duplicate_candidates
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS: erp_ai_duplicate_candidates ──────────────────────────────────────────

ALTER TABLE public.erp_ai_duplicate_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_ai_duplicate_candidates FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_ai_dup_candidates_select ON public.erp_ai_duplicate_candidates;
CREATE POLICY erp_ai_dup_candidates_select
  ON public.erp_ai_duplicate_candidates FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      current_user_has_permission('ai.duplicates.view')
      OR current_user_has_permission('ai.common.admin')
      OR current_user_has_role('system_admin')
    )
  );

DROP POLICY IF EXISTS erp_ai_dup_candidates_insert ON public.erp_ai_duplicate_candidates;
CREATE POLICY erp_ai_dup_candidates_insert
  ON public.erp_ai_duplicate_candidates FOR INSERT
  WITH CHECK (
    current_user_has_permission('ai.common.admin')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS erp_ai_dup_candidates_update ON public.erp_ai_duplicate_candidates;
CREATE POLICY erp_ai_dup_candidates_update
  ON public.erp_ai_duplicate_candidates FOR UPDATE
  USING (
    deleted_at IS NULL
    AND (
      current_user_has_permission('ai.duplicates.review')
      OR current_user_has_permission('ai.common.admin')
      OR current_user_has_role('system_admin')
    )
  )
  WITH CHECK (
    current_user_has_permission('ai.duplicates.review')
    OR current_user_has_permission('ai.common.admin')
    OR current_user_has_role('system_admin')
  );

-- ── erp_ai_duplicate_candidate_events (append-only) ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_ai_duplicate_candidate_events (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  candidate_id    BIGINT NOT NULL
    REFERENCES public.erp_ai_duplicate_candidates(id) ON DELETE CASCADE,
  event_type      TEXT NOT NULL,
  event_data_json JSONB,
  actor_user_id   BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT erp_ai_dup_events_type_chk CHECK (event_type IN (
    'detected', 'reviewed', 'confirmed', 'ignored', 'resolved', 'superseded', 'failed'
  ))
);

COMMENT ON TABLE public.erp_ai_duplicate_candidate_events IS
  'COMMON AI.3 — Append-only audit trail for duplicate candidate lifecycle events.';

CREATE INDEX IF NOT EXISTS idx_erp_ai_dup_events_candidate
  ON public.erp_ai_duplicate_candidate_events(candidate_id);

CREATE INDEX IF NOT EXISTS idx_erp_ai_dup_events_created
  ON public.erp_ai_duplicate_candidate_events(created_at DESC);

ALTER TABLE public.erp_ai_duplicate_candidate_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_ai_duplicate_candidate_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_ai_dup_events_select ON public.erp_ai_duplicate_candidate_events;
CREATE POLICY erp_ai_dup_events_select
  ON public.erp_ai_duplicate_candidate_events FOR SELECT
  USING (
    current_user_has_permission('ai.duplicates.view')
    OR current_user_has_permission('ai.common.admin')
    OR current_user_has_role('system_admin')
  );

-- AI.3 correction: review users may insert review events
DROP POLICY IF EXISTS erp_ai_dup_events_insert ON public.erp_ai_duplicate_candidate_events;
CREATE POLICY erp_ai_dup_events_insert
  ON public.erp_ai_duplicate_candidate_events FOR INSERT
  WITH CHECK (
    actor_user_id = current_user_profile_id()
    AND (
      current_user_has_permission('ai.duplicates.review')
      OR current_user_has_permission('ai.common.admin')
      OR current_user_has_role('system_admin')
    )
  );
