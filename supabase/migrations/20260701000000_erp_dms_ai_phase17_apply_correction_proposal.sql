-- ============================================================================
-- ERP DMS AI Phase 17 — Apply Correction Proposal
-- Migration: 20260701000000_erp_dms_ai_phase17_apply_correction_proposal.sql
-- Date: 2026-06-27
--
-- Purpose:
--   Allow users to propose and apply human-reviewed corrections to previously
--   applied Apply-to-ERP items. NOT rollback. NOT one-click undo. Correction
--   only after human review, confirmation, target reload, and conflict check.
--
-- Creates:
--   dms_ai_erp_apply_correction_proposals — correction proposal lifecycle table
--
-- Extends:
--   dms_ai_erp_apply_runs.source_type CHECK — adds 'correction_proposal'
--
-- Seeds:
--   2 feature flags: DMS_AI_APPLY_CORRECTION_PROPOSALS, DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS
--   4 permissions: dms.apply_correction.{view,create,run,admin}
--   Grants to system_admin, group_admin, dms_admin (if exists)
--
-- Safety:
--   BIGINT PKs/FKs only
--   No raw content columns (no ocr_text, content_text, raw_response, prompt)
--   Summary fields max 200 chars — enforced at application layer
--   RLS ENABLED + FORCE ROW LEVEL SECURITY
--   No DELETE policy — correction history is append-only
--   Feature flags default false
--   correction_value_json is scalar-only { "v": <scalar> } — enforced at app layer
--   Idempotent throughout (IF NOT EXISTS, ON CONFLICT DO NOTHING)
-- ============================================================================

-- ── SECTION 1: Extend source_type CHECK on dms_ai_erp_apply_runs ──────────────
-- The existing constraint allows: extraction_result, validation_finding,
--   entity_match_candidate, dms_metadata_apply
-- We add: correction_proposal
-- Must DROP + RE-ADD because PostgreSQL does not support ALTER CONSTRAINT for CHECK.

DO $$
BEGIN
  -- Drop the existing source_type CHECK so we can replace it
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dms_ai_erp_apply_runs_source_type_check'
      AND conrelid = 'public.dms_ai_erp_apply_runs'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_erp_apply_runs
      DROP CONSTRAINT dms_ai_erp_apply_runs_source_type_check;
  END IF;

  -- Re-add with correction_proposal included
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dms_ai_erp_apply_runs_source_type_check'
      AND conrelid = 'public.dms_ai_erp_apply_runs'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_erp_apply_runs
      ADD CONSTRAINT dms_ai_erp_apply_runs_source_type_check
      CHECK (source_type IN (
        'extraction_result',
        'validation_finding',
        'entity_match_candidate',
        'dms_metadata_apply',
        'correction_proposal'
      ));
  END IF;
END $$;

COMMENT ON COLUMN public.dms_ai_erp_apply_runs.source_type IS
  'Phase 16 Tier 1+: extraction_result | validation_finding | entity_match_candidate | dms_metadata_apply. '
  'Phase 17+: correction_proposal (linked to dms_ai_erp_apply_correction_proposals).';

-- ── SECTION 2: Create dms_ai_erp_apply_correction_proposals ──────────────────

CREATE TABLE IF NOT EXISTS public.dms_ai_erp_apply_correction_proposals (
  id                              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,

  -- Unique correction proposal code (generated at application layer)
  proposal_code                   TEXT,

  -- Linkage to original applied item (required — must be an applied apply item)
  original_apply_run_id           BIGINT NOT NULL
                                    REFERENCES public.dms_ai_erp_apply_runs(id) ON DELETE RESTRICT,
  original_apply_item_id          BIGINT NOT NULL
                                    REFERENCES public.dms_ai_erp_apply_items(id) ON DELETE RESTRICT,

  -- Document context (denormalized from run for convenience)
  document_id                     BIGINT
                                    REFERENCES public.dms_documents(id) ON DELETE CASCADE,

  -- Target coordinates (denormalized from original item — read-only display)
  target_module                   TEXT NOT NULL,
  target_table                    TEXT NOT NULL,
  target_field                    TEXT NOT NULL,
  target_record_id                BIGINT,
  value_type                      TEXT NOT NULL,

  -- History snapshots — summaries only, max 200 chars, no raw content
  original_before_summary         TEXT,   -- current_value_summary from original item (pre-apply)
  original_applied_summary        TEXT,   -- applied_value_summary from original item
  current_value_summary           TEXT,   -- live value at correction source load time
  proposed_correction_summary     TEXT,   -- human-entered correction value summary

  -- Safe typed correction value — scalar only: { "v": string|number|boolean }
  -- No raw OCR, no AI prompt, no AI response, no embeddings.
  correction_value_json           JSONB,

  -- Correction mode
  correction_mode                 TEXT NOT NULL DEFAULT 'manual',

  -- Proposal status lifecycle
  status                          TEXT NOT NULL DEFAULT 'draft',

  -- Conflict detail (populated when status = conflict)
  conflict_status                 TEXT,
  conflict_reason                 TEXT,

  -- Linked apply run created when correction was applied (null until applied)
  correction_apply_run_id         BIGINT
                                    REFERENCES public.dms_ai_erp_apply_runs(id) ON DELETE SET NULL,

  -- Actors
  requested_by                    BIGINT NOT NULL
                                    REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
  confirmed_by                    BIGINT
                                    REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  applied_by                      BIGINT
                                    REFERENCES public.user_profiles(id) ON DELETE SET NULL,

  -- Timestamps
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmed_at                    TIMESTAMPTZ,
  applied_at                      TIMESTAMPTZ,
  cancelled_at                    TIMESTAMPTZ,
  failed_at                       TIMESTAMPTZ,
  updated_at                      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  -- Safe failure/conflict reason (max 500 chars, no raw content)
  failure_reason                  TEXT
);

COMMENT ON TABLE public.dms_ai_erp_apply_correction_proposals IS
  'Phase 17 — Human-reviewed correction proposals for previously applied Apply-to-ERP items. '
  'NOT rollback. NOT undo. Every correction requires human confirmation, conflict check, and audit. '
  'NEVER store raw OCR/content/prompt/AI response. Summary fields max 200 chars. '
  'correction_value_json is scalar-only { "v": <string|number|boolean> }.';

-- ── SECTION 3: CHECK constraints ──────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dms_ai_erp_corrections_status_check'
      AND conrelid = 'public.dms_ai_erp_apply_correction_proposals'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_erp_apply_correction_proposals
      ADD CONSTRAINT dms_ai_erp_corrections_status_check
      CHECK (status IN (
        'draft', 'pending_confirmation', 'applied', 'conflict', 'cancelled', 'failed'
      ));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dms_ai_erp_corrections_mode_check'
      AND conrelid = 'public.dms_ai_erp_apply_correction_proposals'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_erp_apply_correction_proposals
      ADD CONSTRAINT dms_ai_erp_corrections_mode_check
      CHECK (correction_mode IN ('manual', 'restore_previous', 'reapply_ai_value'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dms_ai_erp_corrections_module_check'
      AND conrelid = 'public.dms_ai_erp_apply_correction_proposals'::regclass
  ) THEN
    ALTER TABLE public.dms_ai_erp_apply_correction_proposals
      ADD CONSTRAINT dms_ai_erp_corrections_module_check
      CHECK (target_module IN ('dms_document', 'dms_metadata', 'party'));
  END IF;
END $$;

-- ── SECTION 4: Indexes ────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_corrections_apply_item
  ON public.dms_ai_erp_apply_correction_proposals (original_apply_item_id);

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_corrections_apply_run
  ON public.dms_ai_erp_apply_correction_proposals (original_apply_run_id);

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_corrections_document
  ON public.dms_ai_erp_apply_correction_proposals (document_id);

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_corrections_target
  ON public.dms_ai_erp_apply_correction_proposals (target_table, target_record_id);

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_corrections_status_created
  ON public.dms_ai_erp_apply_correction_proposals (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_dms_ai_erp_corrections_requested_by
  ON public.dms_ai_erp_apply_correction_proposals (requested_by);

-- ── SECTION 5: RLS ────────────────────────────────────────────────────────────

ALTER TABLE public.dms_ai_erp_apply_correction_proposals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_ai_erp_apply_correction_proposals FORCE ROW LEVEL SECURITY;

-- SELECT: correction view, apply-to-erp view, or admin roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dms_ai_erp_apply_correction_proposals'
      AND policyname = 'dms_ai_erp_corrections_select'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY dms_ai_erp_corrections_select
        ON public.dms_ai_erp_apply_correction_proposals
        FOR SELECT TO authenticated
        USING (
          auth.uid() IS NOT NULL AND (
            current_user_has_permission('dms.apply_correction.view')
            OR current_user_has_permission('dms.apply_to_erp.view')
            OR current_user_has_permission('dms.apply_to_erp.run')
            OR current_user_has_permission('dms.admin')
            OR current_user_has_role('system_admin')
            OR current_user_has_role('group_admin')
          )
        );
    $policy$;
  END IF;
END $$;

-- INSERT: correction create or admin
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dms_ai_erp_apply_correction_proposals'
      AND policyname = 'dms_ai_erp_corrections_insert'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY dms_ai_erp_corrections_insert
        ON public.dms_ai_erp_apply_correction_proposals
        FOR INSERT TO authenticated
        WITH CHECK (
          current_user_has_permission('dms.apply_correction.create')
          OR current_user_has_permission('dms.admin')
          OR current_user_has_role('system_admin')
        );
    $policy$;
  END IF;
END $$;

-- UPDATE: correction run/admin or admin roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dms_ai_erp_apply_correction_proposals'
      AND policyname = 'dms_ai_erp_corrections_update'
  ) THEN
    EXECUTE $policy$
      CREATE POLICY dms_ai_erp_corrections_update
        ON public.dms_ai_erp_apply_correction_proposals
        FOR UPDATE TO authenticated
        USING (
          current_user_has_permission('dms.apply_correction.run')
          OR current_user_has_permission('dms.apply_correction.admin')
          OR current_user_has_permission('dms.admin')
          OR current_user_has_role('system_admin')
        )
        WITH CHECK (
          current_user_has_permission('dms.apply_correction.run')
          OR current_user_has_permission('dms.apply_correction.admin')
          OR current_user_has_permission('dms.admin')
          OR current_user_has_role('system_admin')
        );
    $policy$;
  END IF;
END $$;

-- NO DELETE policy — correction proposals are append-only history.

-- ── SECTION 6: Feature flags ──────────────────────────────────────────────────
-- Both default false. Phase 17 is invisible when flags are off.

INSERT INTO public.erp_ai_feature_flags (
  feature_code, feature_name, description, is_enabled,
  requires_human_review, min_confidence_threshold, notes, created_at, updated_at
)
VALUES
  (
    'DMS_AI_APPLY_CORRECTION_PROPOSALS',
    'Apply Correction Proposals',
    'Phase 17 master gate for Apply Correction Proposal feature.',
    false,
    true, 0.000,
    'Phase 17 — Master gate. Default false. When false, no correction UI appears and all '
    'correction server actions return feature_flag_disabled. Set true to enable.',
    NOW(), NOW()
  ),
  (
    'DMS_AI_APPLY_CORRECTION_RESTORE_PREVIOUS',
    'Apply Correction - Use Previous Value',
    'Phase 17 sub-flag enabling the Use Previous Value (Mode B) prefill button.',
    false,
    true, 0.000,
    'Phase 17 — Sub-flag for Mode B (restore_previous). Requires DMS_AI_APPLY_CORRECTION_PROPOSALS=true. '
    'Default false. Text fields show truncation warning when the summary may not be exact.',
    NOW(), NOW()
  )
ON CONFLICT (feature_code) DO NOTHING;

-- ── SECTION 7: Permissions ────────────────────────────────────────────────────

INSERT INTO public.permissions (permission_code, permission_name, module_code, action_code, description, is_active)
VALUES
  (
    'dms.apply_correction.view',
    'View DMS Apply Corrections',
    'DMS', 'view',
    'View correction proposals and correction history. No target record writes.',
    true
  ),
  (
    'dms.apply_correction.create',
    'Create DMS Apply Corrections',
    'DMS', 'create',
    'Create new correction proposals. Writes only to correction_proposals table. No target writes.',
    true
  ),
  (
    'dms.apply_correction.run',
    'Apply DMS Corrections',
    'DMS', 'run',
    'Confirm and apply a correction proposal. Also requires dms.apply_to_erp.run '
    'and the specific target module permission (e.g., master_data.parties.manage_licenses).',
    true
  ),
  (
    'dms.apply_correction.admin',
    'Admin DMS Apply Corrections',
    'DMS', 'admin',
    'Cancel any correction proposal; view all corrections regardless of requestor.',
    true
  )
ON CONFLICT (permission_code) DO UPDATE SET
  permission_name = EXCLUDED.permission_name,
  description     = EXCLUDED.description,
  module_code     = EXCLUDED.module_code,
  action_code     = EXCLUDED.action_code,
  is_active       = EXCLUDED.is_active,
  updated_at      = NOW();

-- ── SECTION 8: Grant permissions ──────────────────────────────────────────────

-- system_admin: all 4 correction permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'system_admin'
  AND p.permission_code IN (
    'dms.apply_correction.view',
    'dms.apply_correction.create',
    'dms.apply_correction.run',
    'dms.apply_correction.admin'
  )
ON CONFLICT DO NOTHING;

-- group_admin: view, create, run (not admin)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'group_admin'
  AND p.permission_code IN (
    'dms.apply_correction.view',
    'dms.apply_correction.create',
    'dms.apply_correction.run'
  )
ON CONFLICT DO NOTHING;

-- dms_admin role (if it exists): view, create, run
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'dms_admin'
  AND p.permission_code IN (
    'dms.apply_correction.view',
    'dms.apply_correction.create',
    'dms.apply_correction.run'
  )
ON CONFLICT DO NOTHING;

-- ============================================================================
-- End of Phase 17 migration
-- No automatic rollback, no undo, no background reversal implemented here.
-- ============================================================================
