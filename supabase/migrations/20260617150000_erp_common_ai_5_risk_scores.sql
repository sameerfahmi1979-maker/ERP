-- ERP COMMON AI.5 — AI Risk Scoring
-- Creates erp_ai_risk_scores + erp_ai_risk_score_events
-- Adds ai.risk.review permission
-- Feature flag ERP_AI_RISK_SCORE already exists (is_enabled=false — do not enable)

-- ── erp_ai_risk_scores ────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_ai_risk_scores (
  id                              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  entity_type                     TEXT NOT NULL,
  entity_id                       BIGINT NOT NULL,

  risk_score                      NUMERIC(5,2) NOT NULL,
  risk_level                      TEXT NOT NULL,
  risk_confidence                 NUMERIC(5,4) NOT NULL DEFAULT 1.0000,
  calculation_method              TEXT NOT NULL DEFAULT 'deterministic',

  risk_reasons_json               JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_breakdown_json             JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_counts_json              JSONB NOT NULL DEFAULT '{}'::jsonb,

  status                          TEXT NOT NULL DEFAULT 'calculated',
  review_decision                 TEXT,
  review_notes                    TEXT,
  reviewed_by                     BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reviewed_at                     TIMESTAMPTZ,

  calculated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  calculated_by                   BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  stale_at                        TIMESTAMPTZ,
  stale_reason                    TEXT,

  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by                      BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by                      BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  deleted_at                      TIMESTAMPTZ,

  CONSTRAINT erp_ai_risk_scores_level_chk CHECK (risk_level IN (
    'none', 'low', 'medium', 'high', 'critical'
  )),
  CONSTRAINT erp_ai_risk_scores_status_chk CHECK (status IN (
    'pending', 'calculated', 'stale', 'reviewed', 'accepted', 'superseded', 'failed'
  )),
  CONSTRAINT erp_ai_risk_scores_review_decision_chk CHECK (
    review_decision IS NULL OR review_decision IN (
      'accepted', 'needs_more_review', 'false_positive_signal', 'manual_override_note'
    )
  ),
  CONSTRAINT erp_ai_risk_scores_entity_type_chk CHECK (entity_type IN (
    'company', 'party', 'branch', 'site', 'dms_document'
  )),
  CONSTRAINT erp_ai_risk_scores_method_chk CHECK (
    calculation_method IN ('deterministic', 'hybrid')
  ),
  CONSTRAINT erp_ai_risk_scores_score_range_chk CHECK (
    risk_score >= 0 AND risk_score <= 100
  ),
  CONSTRAINT erp_ai_risk_scores_confidence_chk CHECK (
    risk_confidence >= 0 AND risk_confidence <= 1
  )
);

COMMENT ON TABLE public.erp_ai_risk_scores IS
  'COMMON AI.5 — Current entity risk score for human review. No auto-block/update. '
  'risk_reasons_json / risk_breakdown_json never contain OCR text, prompts, or API keys.';

CREATE UNIQUE INDEX IF NOT EXISTS uq_erp_ai_risk_scores_entity_active
  ON public.erp_ai_risk_scores (entity_type, entity_id)
  WHERE deleted_at IS NULL AND status NOT IN ('superseded', 'failed');

CREATE INDEX IF NOT EXISTS idx_erp_ai_risk_scores_level_status
  ON public.erp_ai_risk_scores (risk_level, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ai_risk_scores_calculated_at
  ON public.erp_ai_risk_scores (calculated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_erp_ai_risk_scores_entity
  ON public.erp_ai_risk_scores (entity_type, entity_id)
  WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_erp_ai_risk_scores_updated_at ON public.erp_ai_risk_scores;
CREATE TRIGGER trg_erp_ai_risk_scores_updated_at
  BEFORE UPDATE ON public.erp_ai_risk_scores
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ── RLS: erp_ai_risk_scores ─────────────────────────────────────────────────

ALTER TABLE public.erp_ai_risk_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_ai_risk_scores FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_ai_risk_scores_select ON public.erp_ai_risk_scores;
CREATE POLICY erp_ai_risk_scores_select
  ON public.erp_ai_risk_scores FOR SELECT
  USING (
    deleted_at IS NULL
    AND (
      current_user_has_permission('ai.risk.view')
      OR current_user_has_permission('ai.common.admin')
      OR current_user_has_role('system_admin')
    )
  );

DROP POLICY IF EXISTS erp_ai_risk_scores_insert ON public.erp_ai_risk_scores;
CREATE POLICY erp_ai_risk_scores_insert
  ON public.erp_ai_risk_scores FOR INSERT
  WITH CHECK (
    current_user_has_permission('ai.risk.generate')
    OR current_user_has_permission('ai.common.admin')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS erp_ai_risk_scores_update ON public.erp_ai_risk_scores;
CREATE POLICY erp_ai_risk_scores_update
  ON public.erp_ai_risk_scores FOR UPDATE
  USING (
    deleted_at IS NULL
    AND (
      current_user_has_permission('ai.risk.review')
      OR current_user_has_permission('ai.risk.generate')
      OR current_user_has_permission('ai.common.admin')
      OR current_user_has_role('system_admin')
    )
  )
  WITH CHECK (
    current_user_has_permission('ai.risk.review')
    OR current_user_has_permission('ai.risk.generate')
    OR current_user_has_permission('ai.common.admin')
    OR current_user_has_role('system_admin')
  );

-- ── erp_ai_risk_score_events (append-only) ────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.erp_ai_risk_score_events (
  id                              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  risk_score_id                   BIGINT NOT NULL
    REFERENCES public.erp_ai_risk_scores(id) ON DELETE CASCADE,

  event_type                      TEXT NOT NULL,
  event_payload_json              JSONB NOT NULL DEFAULT '{}'::jsonb,

  prior_risk_score                NUMERIC(5,2),
  prior_risk_level                TEXT,
  new_risk_score                  NUMERIC(5,2),
  new_risk_level                  TEXT,

  actor_id                        BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  notes                           TEXT,

  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT erp_ai_risk_score_events_type_chk CHECK (event_type IN (
    'calculated', 'recalculated', 'marked_stale', 'reviewed', 'accepted',
    'needs_more_review', 'false_positive_signal', 'manual_override_note', 'failed'
  ))
);

COMMENT ON TABLE public.erp_ai_risk_score_events IS
  'COMMON AI.5 — Append-only audit trail for risk score lifecycle events.';

CREATE INDEX IF NOT EXISTS idx_erp_ai_risk_score_events_score_id
  ON public.erp_ai_risk_score_events (risk_score_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_erp_ai_risk_score_events_type
  ON public.erp_ai_risk_score_events (event_type, created_at DESC);

ALTER TABLE public.erp_ai_risk_score_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_ai_risk_score_events FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS erp_ai_risk_score_events_select ON public.erp_ai_risk_score_events;
CREATE POLICY erp_ai_risk_score_events_select
  ON public.erp_ai_risk_score_events FOR SELECT
  USING (
    current_user_has_permission('ai.risk.view')
    OR current_user_has_permission('ai.common.admin')
    OR current_user_has_role('system_admin')
  );

DROP POLICY IF EXISTS erp_ai_risk_score_events_insert ON public.erp_ai_risk_score_events;
CREATE POLICY erp_ai_risk_score_events_insert
  ON public.erp_ai_risk_score_events FOR INSERT
  WITH CHECK (
    actor_id = current_user_profile_id()
    AND (
      current_user_has_permission('ai.risk.review')
      OR current_user_has_permission('ai.risk.generate')
      OR current_user_has_permission('ai.common.admin')
      OR current_user_has_role('system_admin')
    )
  );

-- No UPDATE/DELETE policies — append-only

-- ── ai.risk.review permission ─────────────────────────────────────────────────

INSERT INTO permissions (permission_code, permission_name, description, module_code, action_code, is_active)
VALUES (
  'ai.risk.review',
  'Review AI Risk Scores',
  'Accept, flag, or annotate AI risk scores for human review',
  'AI', 'review', true
) ON CONFLICT (permission_code) DO NOTHING;

INSERT INTO role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.role_code IN ('system_admin', 'group_admin')
  AND p.permission_code = 'ai.risk.review'
ON CONFLICT DO NOTHING;
