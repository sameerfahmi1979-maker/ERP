-- ============================================================================
-- ERP DMS 13 — Multi-File Batch Upload → Draft Intake Queue
-- ============================================================================
-- Adds:
--   1. dms_upload_batches  (BIGINT identity PK, ownership-scoped RLS)
--   2. dms_upload_sessions.batch_id  (FK → dms_upload_batches)
--   3. DMS_BATCH_INTAKE feature flag
--
-- Governance: one-by-one approval only. NO bulk approval. NO pgvector changes.
-- Does NOT weaken any existing RLS. Does NOT alter dms_documents.status
-- (verified live: no CHECK constraint on status, so 'pending_ai_review' is
-- already storable).
-- ============================================================================

-- ── 1. Batch table ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.dms_upload_batches (
  id                 BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batch_code         TEXT NOT NULL UNIQUE,
  status             TEXT NOT NULL DEFAULT 'processing'
                       CHECK (status IN ('processing','ready_for_review',
                                         'partially_approved','completed','cancelled')),
  total_files        INTEGER NOT NULL DEFAULT 0 CHECK (total_files >= 0),
  processed_files    INTEGER NOT NULL DEFAULT 0 CHECK (processed_files >= 0),
  approved_files     INTEGER NOT NULL DEFAULT 0 CHECK (approved_files >= 0),
  failed_files       INTEGER NOT NULL DEFAULT 0 CHECK (failed_files >= 0),
  entity_type        TEXT NULL,
  entity_id          BIGINT NULL,
  created_by         BIGINT NULL REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  deleted_at         TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_dms_upload_batches_created_by
  ON public.dms_upload_batches (created_by);

CREATE INDEX IF NOT EXISTS idx_dms_upload_batches_status
  ON public.dms_upload_batches (status)
  WHERE deleted_at IS NULL;

-- ── 2. RLS (ownership-scoped + admin) ───────────────────────────────────────
ALTER TABLE public.dms_upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_upload_batches FORCE ROW LEVEL SECURITY;

-- Users with dms.documents.upload (or admin) can create batches.
DROP POLICY IF EXISTS dms_upload_batches_insert ON public.dms_upload_batches;
CREATE POLICY dms_upload_batches_insert ON public.dms_upload_batches
  FOR INSERT
  WITH CHECK (
    current_user_has_permission('dms.documents.upload')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

-- Users can view ONLY their own batches; admins can view all.
DROP POLICY IF EXISTS dms_upload_batches_select ON public.dms_upload_batches;
CREATE POLICY dms_upload_batches_select ON public.dms_upload_batches
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      created_by = current_user_profile_id()
      OR current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
    )
  );

-- Users can update ONLY their own batches; admins can update all.
DROP POLICY IF EXISTS dms_upload_batches_update ON public.dms_upload_batches;
CREATE POLICY dms_upload_batches_update ON public.dms_upload_batches
  FOR UPDATE
  USING (
    created_by = current_user_profile_id()
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  )
  WITH CHECK (
    created_by = current_user_profile_id()
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

-- ── 3. batch_id on upload sessions ──────────────────────────────────────────
ALTER TABLE public.dms_upload_sessions
  ADD COLUMN IF NOT EXISTS batch_id BIGINT NULL
  REFERENCES public.dms_upload_batches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_dms_upload_sessions_batch
  ON public.dms_upload_sessions (batch_id)
  WHERE batch_id IS NOT NULL;

-- ── 4. Feature flag ─────────────────────────────────────────────────────────
INSERT INTO public.erp_ai_feature_flags
  (feature_code, feature_name, description, is_enabled, requires_human_review, min_confidence_threshold)
VALUES
  ('DMS_BATCH_INTAKE', 'DMS Batch Upload Intake',
   'Multi-file batch upload with AI draft intake queue. One-by-one approval only (no bulk approval).',
   true, true, 0.000)
ON CONFLICT (feature_code) DO NOTHING;
