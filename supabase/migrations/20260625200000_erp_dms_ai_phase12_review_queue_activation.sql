-- ============================================================================
-- ERP DMS AI Phase 12 — Review Queue Activation
-- Migration: 20260625200000_erp_dms_ai_phase12_review_queue_activation.sql
-- Date: 2026-06-25
--
-- Activates the existing dms_review_queue stub table (0 rows, 14 columns)
-- into a production-ready AI human review queue.
--
-- Strategy: ADDITIVE only. Existing 14 columns are untouched.
--   - Adds 20 new columns for review type, idempotency, source linking, etc.
--   - Adds CHECK constraints for status, review_type, priority.
--   - Adds partial unique index for idempotency.
--   - Adds 9 performance indexes.
--   - Replaces broad RLS policies with granular SELECT / UPDATE / INSERT.
--   - Seeds 4 new dms.review_queue.* permissions.
--   - Grants new permissions to system_admin role.
--
-- Safety rules:
--   - No UUID. All PKs/FKs are BIGINT.
--   - RLS remains enabled and FORCE ROW LEVEL SECURITY remains ON.
--   - No broad USING (true) policies.
--   - No destructive changes.
--   - Idempotent: uses IF NOT EXISTS / DO NOTHING / OR REPLACE patterns.
-- ============================================================================

-- ── SECTION 1: Add new columns to dms_review_queue ──────────────────────────

ALTER TABLE public.dms_review_queue
  ADD COLUMN IF NOT EXISTS idempotency_key         TEXT,
  ADD COLUMN IF NOT EXISTS review_type             TEXT NOT NULL DEFAULT 'intake_classification_review',
  ADD COLUMN IF NOT EXISTS source_type             TEXT,
  ADD COLUMN IF NOT EXISTS source_id               TEXT,
  ADD COLUMN IF NOT EXISTS ai_result_id            BIGINT
    REFERENCES public.dms_ai_extraction_results(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_job_id               BIGINT
    REFERENCES public.dms_ai_job_queue(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata_definition_id  BIGINT
    REFERENCES public.dms_metadata_definitions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS field_code              TEXT,
  ADD COLUMN IF NOT EXISTS reason_code             TEXT,
  ADD COLUMN IF NOT EXISTS reason_message          TEXT,
  ADD COLUMN IF NOT EXISTS confidence              NUMERIC(5,4),
  ADD COLUMN IF NOT EXISTS payload_json            JSONB,
  ADD COLUMN IF NOT EXISTS assigned_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by             BIGINT
    REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reviewed_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolved_at             TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS resolution_code         TEXT,
  ADD COLUMN IF NOT EXISTS resolution_note         TEXT,
  ADD COLUMN IF NOT EXISTS due_at                  TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS updated_by              BIGINT
    REFERENCES public.user_profiles(id) ON DELETE SET NULL;

-- ── SECTION 2: CHECK constraints ─────────────────────────────────────────────

-- Status constraint — includes new values + backward-compat legacy values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dms_review_queue_status_check'
      AND conrelid = 'public.dms_review_queue'::regclass
  ) THEN
    ALTER TABLE public.dms_review_queue
      ADD CONSTRAINT dms_review_queue_status_check
      CHECK (status IN (
        'open', 'assigned', 'in_review', 'resolved',
        'dismissed', 'superseded', 'cancelled',
        'pending', 'completed'  -- retained for backward-compat (table had 0 rows)
      ));
  END IF;
END $$;

-- Review type constraint (Phase 12 types only — extended by later migrations)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dms_review_queue_review_type_check'
      AND conrelid = 'public.dms_review_queue'::regclass
  ) THEN
    ALTER TABLE public.dms_review_queue
      ADD CONSTRAINT dms_review_queue_review_type_check
      CHECK (review_type IN (
        'intake_classification_review',
        'intake_metadata_review',
        'ai_analysis_metadata_review',
        'ocr_failure_review',
        'semantic_index_review',
        'ai_job_failure_review'
      ));
  END IF;
END $$;

-- Priority constraint
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'dms_review_queue_priority_check'
      AND conrelid = 'public.dms_review_queue'::regclass
  ) THEN
    ALTER TABLE public.dms_review_queue
      ADD CONSTRAINT dms_review_queue_priority_check
      CHECK (priority IN ('urgent', 'high', 'normal', 'low'));
  END IF;
END $$;

-- ── SECTION 3: Partial unique index for idempotency ──────────────────────────

-- Allows same key after item is closed (resolved/dismissed/cancelled/superseded/completed)
CREATE UNIQUE INDEX IF NOT EXISTS idx_dms_review_queue_idempotency_key
  ON public.dms_review_queue (idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND deleted_at IS NULL
    AND status NOT IN ('resolved', 'dismissed', 'cancelled', 'superseded', 'completed');

-- ── SECTION 4: Performance indexes ───────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_dms_review_queue_review_type
  ON public.dms_review_queue (review_type);

CREATE INDEX IF NOT EXISTS idx_dms_review_queue_priority
  ON public.dms_review_queue (priority);

CREATE INDEX IF NOT EXISTS idx_dms_review_queue_document_id
  ON public.dms_review_queue (document_id)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_review_queue_upload_session_id
  ON public.dms_review_queue (upload_session_id)
  WHERE upload_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_review_queue_ai_result_id
  ON public.dms_review_queue (ai_result_id)
  WHERE ai_result_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_review_queue_ai_job_id
  ON public.dms_review_queue (ai_job_id)
  WHERE ai_job_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_review_queue_queued_at
  ON public.dms_review_queue (queued_at DESC);

CREATE INDEX IF NOT EXISTS idx_dms_review_queue_due_at
  ON public.dms_review_queue (due_at)
  WHERE due_at IS NOT NULL;

-- Active items composite — for dashboard counts
CREATE INDEX IF NOT EXISTS idx_dms_review_queue_active
  ON public.dms_review_queue (status, priority, queued_at)
  WHERE status IN ('open', 'assigned', 'in_review') AND deleted_at IS NULL;

-- ── SECTION 5: RLS policies — replace with granular policies ─────────────────

-- FORCE RLS is already ON (set in DMS.2 migration); preserve it
ALTER TABLE public.dms_review_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_review_queue FORCE ROW LEVEL SECURITY;

-- Drop old broad policies
DROP POLICY IF EXISTS dms_review_queue_select ON public.dms_review_queue;
DROP POLICY IF EXISTS dms_review_queue_manage ON public.dms_review_queue;

-- SELECT: authenticated users with review/admin permissions
CREATE POLICY dms_review_queue_select ON public.dms_review_queue
  FOR SELECT
  TO authenticated
  USING (
    auth.uid() IS NOT NULL AND (
      current_user_has_permission('dms.review_queue.view')
      OR current_user_has_permission('dms.review_queue.manage')
      OR current_user_has_permission('dms.documents.review_ai')
      OR current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
    )
  );

-- UPDATE: manage/admin (application generates items via admin client that bypasses RLS)
CREATE POLICY dms_review_queue_update ON public.dms_review_queue
  FOR UPDATE
  TO authenticated
  USING (
    current_user_has_permission('dms.review_queue.manage')
    OR current_user_has_permission('dms.documents.review_ai')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  )
  WITH CHECK (
    current_user_has_permission('dms.review_queue.manage')
    OR current_user_has_permission('dms.documents.review_ai')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

-- INSERT: admin/system only (upsertDmsReviewQueueItem uses createAdminClient — bypasses RLS)
-- This policy covers any direct INSERT that might occur through the anon/authenticated role
CREATE POLICY dms_review_queue_insert ON public.dms_review_queue
  FOR INSERT
  TO authenticated
  WITH CHECK (
    current_user_has_permission('dms.review_queue.admin')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

-- ── SECTION 6: Seed new permissions ─────────────────────────────────────────

INSERT INTO public.permissions (permission_code, permission_name, module_code, action_code, description, is_active)
VALUES
  ('dms.review_queue.view',   'View DMS Review Queue',         'DMS', 'view',   'View DMS AI review queue items and summaries',               true),
  ('dms.review_queue.manage', 'Manage DMS Review Queue',       'DMS', 'manage', 'Assign, start, resolve, and dismiss review queue items',     true),
  ('dms.review_queue.bulk',   'Bulk Manage DMS Review Queue',  'DMS', 'manage', 'Bulk assign and bulk dismiss review queue items',             true),
  ('dms.review_queue.admin',  'Admin DMS Review Queue',        'DMS', 'admin',  'Rebuild queue, cancel items, and full review queue access',   true)
ON CONFLICT (permission_code) DO UPDATE SET
  permission_name = EXCLUDED.permission_name,
  description     = EXCLUDED.description,
  module_code     = EXCLUDED.module_code,
  action_code     = EXCLUDED.action_code,
  is_active       = EXCLUDED.is_active,
  updated_at      = NOW();

-- Grant all new review_queue permissions to system_admin role
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'system_admin'
  AND p.permission_code IN (
    'dms.review_queue.view',
    'dms.review_queue.manage',
    'dms.review_queue.bulk',
    'dms.review_queue.admin'
  )
ON CONFLICT DO NOTHING;

-- Grant view + manage to group_admin
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.role_code = 'group_admin'
  AND p.permission_code IN (
    'dms.review_queue.view',
    'dms.review_queue.manage'
  )
ON CONFLICT DO NOTHING;

-- ── SECTION 7: DMS_AI_REVIEW feature flag — verify/update notes ─────────────

-- Feature flag already exists with is_enabled=true. Update notes only.
UPDATE public.erp_ai_feature_flags
SET
  notes       = 'Phase 12 — Review Queue Activation. When true, /dms/review-queue page is active and queue generation hooks create items. When false, page is blocked and no items are created.',
  updated_at  = NOW()
WHERE feature_code = 'DMS_AI_REVIEW';

-- ── SECTION 8: Comments ───────────────────────────────────────────────────────

COMMENT ON COLUMN public.dms_review_queue.idempotency_key IS
  'Unique key to prevent duplicate active items. Format: {type}:{source_id}[:field:{def_id}]. '
  'Partial unique index allows same key after item is closed.';

COMMENT ON COLUMN public.dms_review_queue.review_type IS
  'Type of review: intake_classification_review | intake_metadata_review | '
  'ai_analysis_metadata_review | ocr_failure_review | semantic_index_review | ai_job_failure_review';

COMMENT ON COLUMN public.dms_review_queue.payload_json IS
  'Safe metadata only — IDs, reason codes, short summaries. '
  'NEVER store OCR text, chunk text, full AI responses, prompts, or API keys.';

COMMENT ON COLUMN public.dms_review_queue.resolution_note IS
  'Reviewer notes on resolution. Max 500 chars enforced at application layer.';
