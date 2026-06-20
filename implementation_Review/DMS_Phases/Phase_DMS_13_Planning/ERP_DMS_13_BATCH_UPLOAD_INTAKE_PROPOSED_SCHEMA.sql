-- ============================================================================
-- ERP DMS 13 — Multi-File Batch Upload → Draft Intake Queue
-- REVIEW-ONLY COPY of supabase/migrations/20260615120000_erp_dms_13_batch_upload_intake.sql
-- ============================================================================
-- This file is a human-readable review copy. The authoritative migration lives
-- in supabase/migrations/. Applied to the live project after Sameer approval.
--
-- Summary:
--   1. dms_upload_batches  — new table, BIGINT identity PK, ownership-scoped RLS
--   2. dms_upload_sessions.batch_id  — new nullable FK
--   3. DMS_BATCH_INTAKE  — feature flag (enabled for admin/UAT testing)
--
-- Governance notes:
--   - One-by-one approval ONLY. No bulk-approval object exists in DB or code.
--   - No pgvector / semantic-search changes.
--   - No change to dms_documents.status (no CHECK constraint exists; verified).
--   - No existing RLS weakened.
-- ============================================================================

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
  ON public.dms_upload_batches (status) WHERE deleted_at IS NULL;

ALTER TABLE public.dms_upload_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_upload_batches FORCE ROW LEVEL SECURITY;

-- INSERT: uploaders + admins
CREATE POLICY dms_upload_batches_insert ON public.dms_upload_batches
  FOR INSERT WITH CHECK (
    current_user_has_permission('dms.documents.upload')
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

-- SELECT: own batches OR admin
CREATE POLICY dms_upload_batches_select ON public.dms_upload_batches
  FOR SELECT USING (
    auth.uid() IS NOT NULL
    AND (
      created_by = current_user_profile_id()
      OR current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
    )
  );

-- UPDATE: own batches OR admin
CREATE POLICY dms_upload_batches_update ON public.dms_upload_batches
  FOR UPDATE USING (
    created_by = current_user_profile_id()
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  ) WITH CHECK (
    created_by = current_user_profile_id()
    OR current_user_has_permission('dms.admin')
    OR current_user_has_role('system_admin')
  );

ALTER TABLE public.dms_upload_sessions
  ADD COLUMN IF NOT EXISTS batch_id BIGINT NULL
  REFERENCES public.dms_upload_batches(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_dms_upload_sessions_batch
  ON public.dms_upload_sessions (batch_id) WHERE batch_id IS NOT NULL;

INSERT INTO public.erp_ai_feature_flags
  (feature_code, feature_name, description, is_enabled, requires_human_review, min_confidence_threshold)
VALUES
  ('DMS_BATCH_INTAKE', 'DMS Batch Upload Intake',
   'Multi-file batch upload with AI draft intake queue. One-by-one approval only (no bulk approval).',
   true, true, 0.000)
ON CONFLICT (feature_code) DO NOTHING;
