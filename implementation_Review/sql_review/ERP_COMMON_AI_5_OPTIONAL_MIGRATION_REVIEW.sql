-- ============================================================================
-- ERP COMMON AI.5 — AI Risk Scoring — Optional Migration Review
-- Date: 2026-06-17
-- Status: REVIEW ONLY — DO NOT APPLY
-- ============================================================================
--
-- RECOMMENDATION: MIGRATION IS REQUIRED for ERP COMMON AI.5.
-- Primary table: erp_ai_risk_scores (required — one current row per entity)
-- Event table: erp_ai_risk_score_events (recommended for v1 audit + trend)
-- Optional: ai.risk.review permission (recommended for parity with AI.3/AI.4)
-- Optional: denormalized columns on pilot entity tables (deferred to v1.1)
--
-- Feature flag ERP_AI_RISK_SCORE already exists (is_enabled=false) — do NOT create
-- ERP_AI_RISK_SCORING (that code does not exist in DB).
--
-- DMS document risk (DMS.12.3) stays on dms_documents — AI.5 reads, does not replace.
--
-- ============================================================================

-- REVIEW ONLY — DO NOT APPLY

-- ── SECTION 1: erp_ai_risk_scores (current score per entity) ──────────────────

CREATE TABLE IF NOT EXISTS public.erp_ai_risk_scores (
  id                              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Target entity (company, party, branch, site, dms_document)
  entity_type                     TEXT NOT NULL,
  entity_id                       BIGINT NOT NULL,

  -- Score model (0–100 entity scale; document rows mirror DMS 0–1 converted to 0–100)
  risk_score                      NUMERIC(5,2) NOT NULL,
  risk_level                      TEXT NOT NULL,
  risk_confidence                 NUMERIC(5,4) NOT NULL DEFAULT 1.0000,
  calculation_method              TEXT NOT NULL DEFAULT 'deterministic',

  -- Safe structured outputs (no OCR/content/prompt/raw AI response)
  risk_reasons_json               JSONB NOT NULL DEFAULT '[]'::jsonb,
  risk_breakdown_json             JSONB NOT NULL DEFAULT '[]'::jsonb,
  source_counts_json              JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Lifecycle
  status                          TEXT NOT NULL DEFAULT 'calculated',
  review_decision                 TEXT,
  review_notes                    TEXT,
  reviewed_by                     BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  reviewed_at                     TIMESTAMPTZ,

  calculated_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  calculated_by                     BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
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
  CONSTRAINT erp_ai_risk_scores_score_range_chk CHECK (
    risk_score >= 0 AND risk_score <= 100
  )
);

-- One active score row per entity (upsert target)
CREATE UNIQUE INDEX IF NOT EXISTS erp_ai_risk_scores_entity_active_uidx
  ON public.erp_ai_risk_scores (entity_type, entity_id)
  WHERE deleted_at IS NULL AND status NOT IN ('superseded', 'failed');

CREATE INDEX IF NOT EXISTS erp_ai_risk_scores_level_status_idx
  ON public.erp_ai_risk_scores (risk_level, status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS erp_ai_risk_scores_calculated_at_idx
  ON public.erp_ai_risk_scores (calculated_at DESC)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS erp_ai_risk_scores_entity_type_idx
  ON public.erp_ai_risk_scores (entity_type, entity_id)
  WHERE deleted_at IS NULL;

-- ── SECTION 2: erp_ai_risk_score_events (append-only history) ─────────────────

CREATE TABLE IF NOT EXISTS public.erp_ai_risk_score_events (
  id                              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  risk_score_id                   BIGINT NOT NULL REFERENCES public.erp_ai_risk_scores(id) ON DELETE CASCADE,

  event_type                      TEXT NOT NULL,
  event_payload_json              JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Snapshot of score at event time (safe fields only)
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

CREATE INDEX IF NOT EXISTS erp_ai_risk_score_events_score_id_idx
  ON public.erp_ai_risk_score_events (risk_score_id, created_at DESC);

CREATE INDEX IF NOT EXISTS erp_ai_risk_score_events_type_idx
  ON public.erp_ai_risk_score_events (event_type, created_at DESC);

-- ── SECTION 3: RLS — erp_ai_risk_scores ───────────────────────────────────────

ALTER TABLE public.erp_ai_risk_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_ai_risk_scores FORCE ROW LEVEL SECURITY;

-- SELECT: ai.risk.view OR ai.common.admin OR system_admin
CREATE POLICY erp_ai_risk_scores_select ON public.erp_ai_risk_scores
  FOR SELECT TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.has_permission(auth.uid(), 'ai.risk.view')
      OR public.has_permission(auth.uid(), 'ai.common.admin')
      OR public.is_system_admin(auth.uid())
    )
  );

-- INSERT: ai.risk.generate OR ai.common.admin OR system_admin
CREATE POLICY erp_ai_risk_scores_insert ON public.erp_ai_risk_scores
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'ai.risk.generate')
    OR public.has_permission(auth.uid(), 'ai.common.admin')
    OR public.is_system_admin(auth.uid())
  );

-- UPDATE: ai.risk.review (review fields) OR ai.risk.generate (recalc) OR admin
CREATE POLICY erp_ai_risk_scores_update ON public.erp_ai_risk_scores
  FOR UPDATE TO authenticated
  USING (
    deleted_at IS NULL
    AND (
      public.has_permission(auth.uid(), 'ai.risk.review')
      OR public.has_permission(auth.uid(), 'ai.risk.generate')
      OR public.has_permission(auth.uid(), 'ai.common.admin')
      OR public.is_system_admin(auth.uid())
    )
  )
  WITH CHECK (
    deleted_at IS NULL
    AND (
      public.has_permission(auth.uid(), 'ai.risk.review')
      OR public.has_permission(auth.uid(), 'ai.risk.generate')
      OR public.has_permission(auth.uid(), 'ai.common.admin')
      OR public.is_system_admin(auth.uid())
    )
  );

-- Soft delete: admin only
CREATE POLICY erp_ai_risk_scores_delete ON public.erp_ai_risk_scores
  FOR UPDATE TO authenticated
  USING (
    public.has_permission(auth.uid(), 'ai.common.admin')
    OR public.is_system_admin(auth.uid())
  );

-- ── SECTION 4: RLS — erp_ai_risk_score_events ─────────────────────────────────

ALTER TABLE public.erp_ai_risk_score_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_ai_risk_score_events FORCE ROW LEVEL SECURITY;

CREATE POLICY erp_ai_risk_score_events_select ON public.erp_ai_risk_score_events
  FOR SELECT TO authenticated
  USING (
    public.has_permission(auth.uid(), 'ai.risk.view')
    OR public.has_permission(auth.uid(), 'ai.common.admin')
    OR public.is_system_admin(auth.uid())
  );

CREATE POLICY erp_ai_risk_score_events_insert ON public.erp_ai_risk_score_events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_permission(auth.uid(), 'ai.risk.generate')
    OR public.has_permission(auth.uid(), 'ai.risk.review')
    OR public.has_permission(auth.uid(), 'ai.common.admin')
    OR public.is_system_admin(auth.uid())
  );

-- Events are append-only — no UPDATE/DELETE policies

-- ── SECTION 5: ai.risk.review permission (recommended) ───────────────────────

INSERT INTO public.permissions (
  permission_code, permission_name, description, module_code, action_code, is_active
)
VALUES (
  'ai.risk.review',
  'Review AI Risk Scores',
  'Accept, flag, or annotate AI risk scores for human review',
  'AI',
  'review',
  true
)
ON CONFLICT (permission_code) DO NOTHING;

-- Grant to system_admin + ai_admin roles (adjust role_codes to match live roles)
-- INSERT INTO public.role_permissions (role_id, permission_id)
-- SELECT r.id, p.id
-- FROM roles r, permissions p
-- WHERE r.role_code IN ('system_admin', 'ai_admin')
--   AND p.permission_code = 'ai.risk.review'
-- ON CONFLICT DO NOTHING;

-- ── SECTION 6: Feature flag note ──────────────────────────────────────────────

-- ERP_AI_RISK_SCORE already seeded in COMMON AI.0 migration.
-- Do NOT insert ERP_AI_RISK_SCORING.
-- Keep is_enabled = false until UAT approval.

-- Optional UAT toggle (admin only, not in v1 migration):
-- UPDATE erp_ai_feature_flags
-- SET requires_human_review = true
-- WHERE feature_code = 'ERP_AI_RISK_SCORE';

-- ── SECTION 7: Deferred v1.1 — denormalized entity columns ──────────────────

-- Roadmap proposed optional columns on owner_companies, parties, branches, work_sites:
--   ai_risk_score NUMERIC(5,2), ai_risk_level TEXT, last_ai_risk_review_at TIMESTAMPTZ
-- DEFER to v1.1 — v1 reads from erp_ai_risk_scores join/subquery.

-- ── SECTION 8: Deferred — erp_ai_risk_snapshots ───────────────────────────────

-- Roadmap Phase 5 proposed erp_ai_risk_snapshots with is_current flag.
-- PLAN RECOMMENDATION: Use erp_ai_risk_scores (unique active row) + events table instead.
-- Avoid duplicate snapshot table in v1.
