-- ============================================================
-- ERP DMS.11 — Option A AI-First Upload-Session Intake
-- Extends upload sessions with intake/review tracking.
-- Extends AI extraction tables with upload_session_id.
-- Adds dms_intake_review_values for draft persistence.
-- ============================================================

-- ── Extend dms_upload_sessions ────────────────────────────────────────────────

ALTER TABLE public.dms_upload_sessions
  ADD COLUMN IF NOT EXISTS document_id BIGINT
    REFERENCES public.dms_documents(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_job_id BIGINT
    REFERENCES public.dms_ai_extraction_jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ai_result_id BIGINT
    REFERENCES public.dms_ai_extraction_results(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS intake_status TEXT NOT NULL DEFAULT 'uploaded',
  ADD COLUMN IF NOT EXISTS review_status TEXT NOT NULL DEFAULT 'not_started',
  ADD COLUMN IF NOT EXISTS review_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS review_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS reviewed_by BIGINT
    REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS discarded_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS discard_reason TEXT;

COMMENT ON COLUMN public.dms_upload_sessions.intake_status IS
  'AI intake lifecycle: uploaded | ocr_pending | ocr_processing | ocr_complete | ai_pending | ai_processing | ai_complete | review_pending | review_in_progress | approved | discarded | failed';
COMMENT ON COLUMN public.dms_upload_sessions.review_status IS
  'User review state: not_started | pending | in_review | approved | discarded | failed';
COMMENT ON COLUMN public.dms_upload_sessions.document_id IS
  'Populated after approveAiIntakeAndCreateDocument() completes.';
COMMENT ON COLUMN public.dms_upload_sessions.ai_result_id IS
  'The dms_ai_extraction_results row created during intake.';

-- ── Extend dms_ai_extraction_jobs ────────────────────────────────────────────

ALTER TABLE public.dms_ai_extraction_jobs
  ADD COLUMN IF NOT EXISTS upload_session_id BIGINT
    REFERENCES public.dms_upload_sessions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.dms_ai_extraction_jobs.upload_session_id IS
  'Set when the job was created for an intake session (before document exists).';

-- ── Extend dms_ai_extraction_results ─────────────────────────────────────────

ALTER TABLE public.dms_ai_extraction_results
  ADD COLUMN IF NOT EXISTS upload_session_id BIGINT
    REFERENCES public.dms_upload_sessions(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.dms_ai_extraction_results.upload_session_id IS
  'Set when the result was created for an intake session (before document exists).';

-- ── dms_intake_review_values — draft persistence for review screen ─────────────

CREATE TABLE IF NOT EXISTS public.dms_intake_review_values (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  upload_session_id BIGINT NOT NULL
    REFERENCES public.dms_upload_sessions(id) ON DELETE CASCADE,
  field_scope  TEXT NOT NULL,
  -- 'document' | 'metadata' | 'tag' | 'link'
  field_code   TEXT NOT NULL,
  field_label  TEXT,
  field_type   TEXT,
  suggested_value_json JSONB,
  reviewed_value_json  JSONB,
  confidence_score     NUMERIC(5,4),
  confidence_label     TEXT,
  source_snippet       TEXT,
  review_status TEXT NOT NULL DEFAULT 'pending',
  -- pending | accepted | edited | rejected
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.dms_intake_review_values ENABLE ROW LEVEL SECURITY;

-- Restrict to authenticated users only
CREATE POLICY "auth_users_manage_intake_review_values"
  ON public.dms_intake_review_values
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_dms_upload_sessions_intake_status
  ON public.dms_upload_sessions (intake_status);

CREATE INDEX IF NOT EXISTS idx_dms_upload_sessions_document_id
  ON public.dms_upload_sessions (document_id)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_ai_jobs_session_id
  ON public.dms_ai_extraction_jobs (upload_session_id)
  WHERE upload_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_ai_results_session_id
  ON public.dms_ai_extraction_results (upload_session_id)
  WHERE upload_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_intake_review_session
  ON public.dms_intake_review_values (upload_session_id);
