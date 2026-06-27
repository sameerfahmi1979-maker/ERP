-- ============================================================================
-- ERP DMS AI Phase 16 — Human-Reviewed Apply-to-ERP Records (Tier 1)
-- Migration: 20260629000000_erp_dms_ai_phase16_human_reviewed_apply_to_erp.sql
-- Date: 2026-06-26
--
-- Tier 1 scope (DMS-only):
--   - dms_documents FK fields (owning_company_id, owning_branch_id, party_id)
--   - dms_documents basic fields (issue_date, expiry_date, title, description)
--   - dms_document_metadata_values (via Phase 6/7 engine bridge)
--
-- Creates:
--   dms_ai_erp_apply_runs  — one row per human-confirmed Apply-to-ERP operation
--   dms_ai_erp_apply_items — one row per field-level item within a run
--
-- Seeds:
--   3 Tier-1 feature flags (default false)
--   4 dms.apply_to_erp.* permissions
--   Grants to system_admin and group_admin
--
-- Safety rules:
--   BIGINT PKs/FKs only — no UUIDs
--   No raw content columns (no ocr_text, content_text, raw_response, prompt)
--   Value summaries max 200 chars — enforced at application layer
--   RLS enabled and FORCE ROW LEVEL SECURITY on all new tables
--   No broad USING (true) policies
--   No anon access
--   No DELETE policies — history is append-only
--   Feature flags default false
--   No Party/HR flags in Tier 1
--   Idempotent throughout (IF NOT EXISTS, ON CONFLICT DO NOTHING)
-- ============================================================================

-- ── SECTION 1: Create dms_ai_erp_apply_runs ───────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dms_ai_erp_apply_runs (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Unique run identifier (generated at application layer)
  run_code                TEXT,

  -- Source of the apply proposal
  source_type             TEXT NOT NULL,
  -- Tier 1 values: 'extraction_result' | 'validation_finding'
  --                | 'entity_match_candidate' | 'dms_metadata_apply'

  source_id               BIGINT,        -- FK to source table row (nullable — some sources have no single id)

  -- Document reference
  document_id             BIGINT
                            REFERENCES public.dms_documents(id) ON DELETE CASCADE,

  -- Optional review queue item that triggered this run
  review_queue_item_id    BIGINT
                            REFERENCES public.dms_review_queue(id) ON DELETE SET NULL,

  -- Run status
  status                  TEXT NOT NULL DEFAULT 'pending',
  -- Values: 'pending' | 'confirmed' | 'in_progress' | 'completed'
  --         | 'completed_with_warnings' | 'failed' | 'cancelled'

  -- Target (Tier 1: dms_document | dms_metadata)
  target_module           TEXT NOT NULL,
  target_table            TEXT NOT NULL,
  target_record_id        BIGINT,        -- FK to target record (nullable for multi-item runs)

  -- Actors
  requested_by            BIGINT NOT NULL
                            REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  confirmed_by            BIGINT
                            REFERENCES public.user_profiles(id) ON DELETE SET NULL,

  -- Timestamps
  started_at              TIMESTAMPTZ,
  completed_at            TIMESTAMPTZ,
  failed_at               TIMESTAMPTZ,
  cancelled_at            TIMESTAMPTZ,

  -- Safe error message (max 500 chars, no raw content)
  error_message           TEXT,

  -- Audit
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at              TIMESTAMPTZ
);

-- CHECK constraints for status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dms_ai_erp_apply_runs_status_check'
      AND conrelid = 'public.dms_ai_erp_apply_runs'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_erp_apply_runs ADD CONSTRAINT dms_ai_erp_apply_runs_status_check
      CHECK (status IN (
        'pending', 'confirmed', 'in_progress', 'completed',
        'completed_with_warnings', 'failed', 'cancelled'
      ));
  END IF;
END $$;

-- CHECK for source_type (Tier 1 values)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dms_ai_erp_apply_runs_source_type_check'
      AND conrelid = 'public.dms_ai_erp_apply_runs'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_erp_apply_runs ADD CONSTRAINT dms_ai_erp_apply_runs_source_type_check
      CHECK (source_type IN (
        'extraction_result', 'validation_finding',
        'entity_match_candidate', 'dms_metadata_apply'
      ));
  END IF;
END $$;

-- CHECK for target_module (Tier 1 values)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dms_ai_erp_apply_runs_target_module_check'
      AND conrelid = 'public.dms_ai_erp_apply_runs'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_erp_apply_runs ADD CONSTRAINT dms_ai_erp_apply_runs_target_module_check
      CHECK (target_module IN ('dms_document', 'dms_metadata'));
  END IF;
END $$;

COMMENT ON TABLE public.dms_ai_erp_apply_runs IS
  'Phase 16 Tier 1 — One row per human-confirmed Apply-to-ERP operation. '
  'Separate from dms_ai_metadata_apply_runs (Phase 7, DMS metadata only). '
  'NEVER store raw OCR/content/prompt/AI response. Value summaries max 200 chars.';

COMMENT ON COLUMN public.dms_ai_erp_apply_runs.source_type IS
  'Tier 1: extraction_result | validation_finding | entity_match_candidate | dms_metadata_apply';

COMMENT ON COLUMN public.dms_ai_erp_apply_runs.target_module IS
  'Tier 1: dms_document | dms_metadata. Phase 17+ will add hr, party.';

COMMENT ON COLUMN public.dms_ai_erp_apply_runs.error_message IS
  'Safe error summary — max 500 chars. Never raw content.';

-- ── SECTION 2: Create dms_ai_erp_apply_items ──────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dms_ai_erp_apply_items (
  id                      BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Parent run
  apply_run_id            BIGINT NOT NULL
                            REFERENCES public.dms_ai_erp_apply_runs(id) ON DELETE CASCADE,

  -- Source
  source_type             TEXT NOT NULL,
  source_id               BIGINT,
  source_field_code       TEXT,

  -- Target
  target_table            TEXT NOT NULL,
  target_field            TEXT NOT NULL,
  target_record_id        BIGINT,
  target_display_label    TEXT,          -- human-readable label, max 200 chars

  -- Safe value summaries (max 200 chars each — enforced at application layer)
  current_value_summary   TEXT,          -- what was there before apply (null = empty/missing)
  proposed_value_summary  TEXT,          -- what AI suggested
  applied_value_summary   TEXT,          -- what was actually written (null if not applied)

  -- Value metadata
  value_type              TEXT,
  -- Values: 'text' | 'date' | 'number' | 'boolean' | 'bigint'

  confidence              NUMERIC(5,4),
  -- CHECK: 0 <= confidence <= 1 if not null

  -- Item status
  status                  TEXT NOT NULL DEFAULT 'proposed',
  -- Values: 'proposed' | 'applied' | 'skipped' | 'conflict' | 'failed' | 'forbidden'

  skip_reason             TEXT,          -- max 200 chars
  failure_reason          TEXT,          -- max 200 chars

  -- Confirmation tracking
  requires_confirmation   BOOLEAN NOT NULL DEFAULT TRUE,
  confirmed               BOOLEAN NOT NULL DEFAULT FALSE,

  -- Apply actor
  applied_at              TIMESTAMPTZ,
  applied_by              BIGINT
                            REFERENCES public.user_profiles(id) ON DELETE SET NULL,

  -- Audit
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- CHECK constraints for status
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dms_ai_erp_apply_items_status_check'
      AND conrelid = 'public.dms_ai_erp_apply_items'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_erp_apply_items ADD CONSTRAINT dms_ai_erp_apply_items_status_check
      CHECK (status IN ('proposed', 'applied', 'skipped', 'conflict', 'failed', 'forbidden'));
  END IF;
END $$;

-- CHECK for value_type
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dms_ai_erp_apply_items_value_type_check'
      AND conrelid = 'public.dms_ai_erp_apply_items'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_erp_apply_items ADD CONSTRAINT dms_ai_erp_apply_items_value_type_check
      CHECK (value_type IS NULL OR value_type IN ('text', 'date', 'number', 'boolean', 'bigint'));
  END IF;
END $$;

-- CHECK for confidence range
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dms_ai_erp_apply_items_confidence_check'
      AND conrelid = 'public.dms_ai_erp_apply_items'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_erp_apply_items ADD CONSTRAINT dms_ai_erp_apply_items_confidence_check
      CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));
  END IF;
END $$;

COMMENT ON TABLE public.dms_ai_erp_apply_items IS
  'Phase 16 Tier 1 — One row per field-level item in a dms_ai_erp_apply_runs run. '
  'NEVER store raw OCR/content/prompt/AI response. Value summaries max 200 chars.';

COMMENT ON COLUMN public.dms_ai_erp_apply_items.current_value_summary IS
  'Safe truncated summary of the value before apply (max 200 chars). Never raw content.';

COMMENT ON COLUMN public.dms_ai_erp_apply_items.proposed_value_summary IS
  'Safe truncated summary of the AI-suggested value (max 200 chars). Never raw content.';

COMMENT ON COLUMN public.dms_ai_erp_apply_items.applied_value_summary IS
  'Safe truncated summary of the value actually written (max 200 chars). Null if not applied.';

-- ── SECTION 3: Indexes ────────────────────────────────────────────────────────

-- dms_ai_erp_apply_runs indexes
CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_apply_runs_document_id
  ON public.dms_ai_erp_apply_runs (document_id)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_apply_runs_status
  ON public.dms_ai_erp_apply_runs (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_apply_runs_requested_by
  ON public.dms_ai_erp_apply_runs (requested_by);

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_apply_runs_source
  ON public.dms_ai_erp_apply_runs (source_type, source_id)
  WHERE source_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_apply_runs_target
  ON public.dms_ai_erp_apply_runs (target_module, target_table, target_record_id)
  WHERE target_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_apply_runs_queue
  ON public.dms_ai_erp_apply_runs (review_queue_item_id)
  WHERE review_queue_item_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_apply_runs_created_at
  ON public.dms_ai_erp_apply_runs (created_at DESC);

-- dms_ai_erp_apply_items indexes
CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_apply_items_run_id
  ON public.dms_ai_erp_apply_items (apply_run_id);

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_apply_items_target
  ON public.dms_ai_erp_apply_items (target_table, target_field, target_record_id)
  WHERE target_record_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_apply_items_status
  ON public.dms_ai_erp_apply_items (status);

-- ── SECTION 4: Row Level Security ────────────────────────────────────────────

ALTER TABLE public.dms_ai_erp_apply_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_ai_erp_apply_runs FORCE ROW LEVEL SECURITY;

ALTER TABLE public.dms_ai_erp_apply_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_ai_erp_apply_items FORCE ROW LEVEL SECURITY;

-- ── RLS policies: dms_ai_erp_apply_runs ──────────────────────────────────────

-- SELECT: users with apply view, DMS view, or admin roles
CREATE POLICY dms_ai_erp_apply_runs_select ON public.dms_ai_erp_apply_runs
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      current_user_has_permission('dms.apply_to_erp.view')
      OR current_user_has_permission('dms.apply_to_erp.run')
      OR current_user_has_permission('dms.apply_to_erp.admin')
      OR current_user_has_permission('dms.documents.view')
      OR current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
      OR current_user_has_role('group_admin')
    )
  );

-- INSERT: users who can run apply operations (server actions use admin client)
CREATE POLICY dms_ai_erp_apply_runs_insert ON public.dms_ai_erp_apply_runs
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_has_permission('dms.apply_to_erp.run')
    OR current_user_has_permission('dms.apply_to_erp.admin')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
    OR current_user_has_role('group_admin')
  );

-- UPDATE: run/admin users (for status updates)
CREATE POLICY dms_ai_erp_apply_runs_update ON public.dms_ai_erp_apply_runs
  FOR UPDATE TO authenticated
  USING (
    current_user_has_permission('dms.apply_to_erp.run')
    OR current_user_has_permission('dms.apply_to_erp.admin')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
    OR current_user_has_role('group_admin')
  )
  WITH CHECK (
    current_user_has_permission('dms.apply_to_erp.run')
    OR current_user_has_permission('dms.apply_to_erp.admin')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
    OR current_user_has_role('group_admin')
  );

-- NO DELETE policy — history is append-only. Soft-delete via deleted_at only.

-- ── RLS policies: dms_ai_erp_apply_items ─────────────────────────────────────

CREATE POLICY dms_ai_erp_apply_items_select ON public.dms_ai_erp_apply_items
  FOR SELECT TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      current_user_has_permission('dms.apply_to_erp.view')
      OR current_user_has_permission('dms.apply_to_erp.run')
      OR current_user_has_permission('dms.apply_to_erp.admin')
      OR current_user_has_permission('dms.documents.view')
      OR current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
      OR current_user_has_role('group_admin')
    )
  );

CREATE POLICY dms_ai_erp_apply_items_insert ON public.dms_ai_erp_apply_items
  FOR INSERT TO authenticated
  WITH CHECK (
    current_user_has_permission('dms.apply_to_erp.run')
    OR current_user_has_permission('dms.apply_to_erp.admin')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
    OR current_user_has_role('group_admin')
  );

CREATE POLICY dms_ai_erp_apply_items_update ON public.dms_ai_erp_apply_items
  FOR UPDATE TO authenticated
  USING (
    current_user_has_permission('dms.apply_to_erp.run')
    OR current_user_has_permission('dms.apply_to_erp.admin')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
    OR current_user_has_role('group_admin')
  )
  WITH CHECK (
    current_user_has_permission('dms.apply_to_erp.run')
    OR current_user_has_permission('dms.apply_to_erp.admin')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
    OR current_user_has_role('group_admin')
  );

-- NO DELETE policy — items are append-only history.

-- ── SECTION 5: Seed feature flags ─────────────────────────────────────────────
-- All Tier 1 flags default false.
-- Party/HR flags are NOT created in this Tier 1 migration.

INSERT INTO public.erp_ai_feature_flags (feature_code, is_enabled, notes, created_at, updated_at)
VALUES
  (
    'DMS_AI_APPLY_TO_ERP',
    false,
    'Phase 16 Tier 1 — Master gate for Apply-to-ERP UI and server actions. '
    'Default false. Enable to unlock the Apply-to-ERP interface. '
    'Sub-flags (DMS_AI_APPLY_TO_ERP_DMS_METADATA, DMS_AI_APPLY_TO_ERP_ENTITY_LINKS) '
    'must also be enabled per target module.',
    NOW(), NOW()
  ),
  (
    'DMS_AI_APPLY_TO_ERP_DMS_METADATA',
    false,
    'Phase 16 Tier 1 — Enable DMS document metadata value write-back via existing Phase 6/7 engine. '
    'Requires DMS_AI_APPLY_TO_ERP=true. Default false.',
    NOW(), NOW()
  ),
  (
    'DMS_AI_APPLY_TO_ERP_ENTITY_LINKS',
    false,
    'Phase 16 Tier 1 — Enable DMS document FK field write-back '
    '(owning_company_id, owning_branch_id, party_id, issue_date, expiry_date, title, description). '
    'Requires DMS_AI_APPLY_TO_ERP=true. Default false.',
    NOW(), NOW()
  )
ON CONFLICT (feature_code) DO NOTHING;

-- ── SECTION 6: Seed permissions ───────────────────────────────────────────────

INSERT INTO public.permissions (permission_code, permission_name, module_code, action_code, description, is_active)
VALUES
  (
    'dms.apply_to_erp.view',
    'View DMS Apply-to-ERP History',
    'DMS', 'view',
    'View apply run history and apply item details. No target record writes.',
    true
  ),
  (
    'dms.apply_to_erp.preview',
    'Preview DMS Apply-to-ERP Proposals',
    'DMS', 'preview',
    'Run preview/proposal generation for Apply-to-ERP. No target record writes.',
    true
  ),
  (
    'dms.apply_to_erp.run',
    'Run DMS Apply-to-ERP',
    'DMS', 'run',
    'Create and execute human-confirmed Apply-to-ERP runs. '
    'Also requires target module permission (e.g., dms.documents.edit).',
    true
  ),
  (
    'dms.apply_to_erp.admin',
    'Admin DMS Apply-to-ERP',
    'DMS', 'admin',
    'Cancel other users apply runs, view all history, full admin access to apply engine.',
    true
  )
ON CONFLICT (permission_code) DO UPDATE SET
  permission_name = EXCLUDED.permission_name,
  description     = EXCLUDED.description,
  module_code     = EXCLUDED.module_code,
  action_code     = EXCLUDED.action_code,
  is_active       = EXCLUDED.is_active,
  updated_at      = NOW();

-- ── SECTION 7: Grant permissions ──────────────────────────────────────────────

-- system_admin: all 4 permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'system_admin'
  AND p.permission_code IN (
    'dms.apply_to_erp.view',
    'dms.apply_to_erp.preview',
    'dms.apply_to_erp.run',
    'dms.apply_to_erp.admin'
  )
ON CONFLICT DO NOTHING;

-- group_admin: view, preview, run (not admin)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'group_admin'
  AND p.permission_code IN (
    'dms.apply_to_erp.view',
    'dms.apply_to_erp.preview',
    'dms.apply_to_erp.run'
  )
ON CONFLICT DO NOTHING;

-- dms_admin role (if exists): view, preview, run
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'dms_admin'
  AND p.permission_code IN (
    'dms.apply_to_erp.view',
    'dms.apply_to_erp.preview',
    'dms.apply_to_erp.run'
  )
ON CONFLICT DO NOTHING;
-- Note: If dms_admin role does not exist, this INSERT returns 0 rows safely.
