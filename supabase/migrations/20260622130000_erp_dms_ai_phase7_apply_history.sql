-- ============================================================================
-- ERP DMS AI Phase 7 — Apply History Tables
-- Migration: 20260622130000_erp_dms_ai_phase7_apply_history.sql
--
-- Creates:
--   dms_ai_metadata_apply_runs  — one row per applyAiAnalysisToMetadata call
--   dms_ai_metadata_apply_items — one row per selected field (applied/skipped)
--
-- Strategy: Hybrid — audit_logs remains the official immutable audit trail.
-- These tables are an operational read-model for the Apply History UI.
--
-- Safety rules:
--   BIGINT PKs (no UUIDs)
--   CASCADE on document delete (run history meaningless without document)
--   SET NULL on ai_result / definition delete (history survives)
--   RLS enabled and forced on both tables
-- ============================================================================

-- ── dms_ai_metadata_apply_runs ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dms_ai_metadata_apply_runs (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id               BIGINT NOT NULL
                              REFERENCES public.dms_documents(id) ON DELETE CASCADE,
  ai_result_id              BIGINT
                              REFERENCES public.dms_ai_extraction_results(id) ON DELETE SET NULL,
  applied_by                BIGINT NOT NULL
                              REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  apply_status              TEXT NOT NULL DEFAULT 'completed',
                              -- 'started' | 'completed' | 'partial' | 'failed'
  selected_count            INT NOT NULL DEFAULT 0,
  applied_count             INT NOT NULL DEFAULT 0,
  skipped_count             INT NOT NULL DEFAULT 0,
  replace_confirmed         BOOLEAN NOT NULL DEFAULT FALSE,
  low_confidence_confirmed  BOOLEAN NOT NULL DEFAULT FALSE,
  error_message             TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at              TIMESTAMPTZ
);

COMMENT ON TABLE public.dms_ai_metadata_apply_runs IS
  'Operational read-model: one row per applyAiAnalysisToMetadata call. '
  'audit_logs remains the official immutable audit trail.';

COMMENT ON COLUMN public.dms_ai_metadata_apply_runs.apply_status IS
  'started | completed | partial | failed';

CREATE INDEX idx_dms_ai_metadata_apply_runs_document_id
  ON public.dms_ai_metadata_apply_runs(document_id);

CREATE INDEX idx_dms_ai_metadata_apply_runs_ai_result_id
  ON public.dms_ai_metadata_apply_runs(ai_result_id);

CREATE INDEX idx_dms_ai_metadata_apply_runs_applied_by
  ON public.dms_ai_metadata_apply_runs(applied_by);

CREATE INDEX idx_dms_ai_metadata_apply_runs_created_at
  ON public.dms_ai_metadata_apply_runs(created_at DESC);

-- ── dms_ai_metadata_apply_items ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dms_ai_metadata_apply_items (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  apply_run_id      BIGINT NOT NULL
                      REFERENCES public.dms_ai_metadata_apply_runs(id) ON DELETE CASCADE,
  document_id       BIGINT NOT NULL
                      REFERENCES public.dms_documents(id) ON DELETE CASCADE,
  definition_id     BIGINT
                      REFERENCES public.dms_metadata_definitions(id) ON DELETE SET NULL,
  field_code        TEXT NOT NULL,
  old_value_summary TEXT,      -- max 100 chars; null = no previous value
  new_value_summary TEXT,      -- max 100 chars; null = skipped
  confidence_score  NUMERIC(5, 4),
  confidence_label  TEXT,
  apply_mode        TEXT,      -- 'fill_missing_only' | 'replace_selected'
  item_status       TEXT NOT NULL DEFAULT 'applied',
                      -- 'applied' | 'skipped' | 'blocked'
  skip_reason       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.dms_ai_metadata_apply_items IS
  'Per-field row for each selection in a dms_ai_metadata_apply_runs run. '
  'item_status: applied | skipped | blocked.';

CREATE INDEX idx_dms_ai_metadata_apply_items_run_id
  ON public.dms_ai_metadata_apply_items(apply_run_id);

CREATE INDEX idx_dms_ai_metadata_apply_items_document_id
  ON public.dms_ai_metadata_apply_items(document_id);

CREATE INDEX idx_dms_ai_metadata_apply_items_definition_id
  ON public.dms_ai_metadata_apply_items(definition_id);

-- ── Row Level Security ────────────────────────────────────────────────────────

ALTER TABLE public.dms_ai_metadata_apply_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_ai_metadata_apply_runs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.dms_ai_metadata_apply_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_ai_metadata_apply_items FORCE ROW LEVEL SECURITY;

-- SELECT: users with DMS document view or DMS admin permission
-- Permission check via user_role_permissions join (same pattern as other DMS tables)

CREATE POLICY "dms_ai_apply_runs_select_authorized"
  ON public.dms_ai_metadata_apply_runs
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.user_role_assignments ura ON ura.user_profile_id = up.id
      JOIN public.user_role_permissions urp ON urp.role_id = ura.role_id
      WHERE up.auth_user_id = auth.uid()
        AND ura.is_active = true
        AND urp.permission_code IN (
          'dms.documents.view',
          'dms.documents.ai.view',
          'dms.documents.review_ai',
          'dms.admin'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.user_role_assignments ura ON ura.user_profile_id = up.id
      JOIN public.user_roles ur ON ur.id = ura.role_id
      WHERE up.auth_user_id = auth.uid()
        AND ura.is_active = true
        AND ur.role_code IN ('system_admin', 'group_admin')
    )
  );

-- INSERT: DMS editors / reviewers / admins (server actions use admin client)
-- Server-side writes use createAdminClient() which bypasses RLS.
-- This policy gates any direct API access.
CREATE POLICY "dms_ai_apply_runs_insert_authorized"
  ON public.dms_ai_metadata_apply_runs
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.user_role_assignments ura ON ura.user_profile_id = up.id
      JOIN public.user_role_permissions urp ON urp.role_id = ura.role_id
      WHERE up.auth_user_id = auth.uid()
        AND ura.is_active = true
        AND urp.permission_code IN (
          'dms.documents.edit',
          'dms.documents.review_ai',
          'dms.admin'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.user_role_assignments ura ON ura.user_profile_id = up.id
      JOIN public.user_roles ur ON ur.id = ura.role_id
      WHERE up.auth_user_id = auth.uid()
        AND ura.is_active = true
        AND ur.role_code IN ('system_admin', 'group_admin')
    )
  );

-- UPDATE: same as INSERT (for apply_status / completed_at update)
CREATE POLICY "dms_ai_apply_runs_update_authorized"
  ON public.dms_ai_metadata_apply_runs
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.user_role_assignments ura ON ura.user_profile_id = up.id
      JOIN public.user_role_permissions urp ON urp.role_id = ura.role_id
      WHERE up.auth_user_id = auth.uid()
        AND ura.is_active = true
        AND urp.permission_code IN (
          'dms.documents.edit',
          'dms.documents.review_ai',
          'dms.admin'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.user_role_assignments ura ON ura.user_profile_id = up.id
      JOIN public.user_roles ur ON ur.id = ura.role_id
      WHERE up.auth_user_id = auth.uid()
        AND ura.is_active = true
        AND ur.role_code IN ('system_admin', 'group_admin')
    )
  );

-- Items: same pattern

CREATE POLICY "dms_ai_apply_items_select_authorized"
  ON public.dms_ai_metadata_apply_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.user_role_assignments ura ON ura.user_profile_id = up.id
      JOIN public.user_role_permissions urp ON urp.role_id = ura.role_id
      WHERE up.auth_user_id = auth.uid()
        AND ura.is_active = true
        AND urp.permission_code IN (
          'dms.documents.view',
          'dms.documents.ai.view',
          'dms.documents.review_ai',
          'dms.admin'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.user_role_assignments ura ON ura.user_profile_id = up.id
      JOIN public.user_roles ur ON ur.id = ura.role_id
      WHERE up.auth_user_id = auth.uid()
        AND ura.is_active = true
        AND ur.role_code IN ('system_admin', 'group_admin')
    )
  );

CREATE POLICY "dms_ai_apply_items_insert_authorized"
  ON public.dms_ai_metadata_apply_items
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.user_role_assignments ura ON ura.user_profile_id = up.id
      JOIN public.user_role_permissions urp ON urp.role_id = ura.role_id
      WHERE up.auth_user_id = auth.uid()
        AND ura.is_active = true
        AND urp.permission_code IN (
          'dms.documents.edit',
          'dms.documents.review_ai',
          'dms.admin'
        )
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_profiles up
      JOIN public.user_role_assignments ura ON ura.user_profile_id = up.id
      JOIN public.user_roles ur ON ur.id = ura.role_id
      WHERE up.auth_user_id = auth.uid()
        AND ura.is_active = true
        AND ur.role_code IN ('system_admin', 'group_admin')
    )
  );
