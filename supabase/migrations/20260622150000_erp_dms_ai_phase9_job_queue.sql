-- ============================================================================
-- ERP DMS AI Corrected Phase 9 — Async AI Job Queue
-- Migration: 20260622150000_erp_dms_ai_phase9_job_queue.sql
--
-- Adds:
--   dms_ai_job_queue        — Generic async AI job queue
--   dms_ai_job_attempts     — Per-attempt tracking for observability (Phase 14)
--
-- Security rules:
--   - Queue payload stores only IDs and control flags.
--     No OCR text, prompts, AI responses, document content, or API keys.
--   - RLS: SELECT for DMS AI viewers/reviewers/admins.
--     INSERT/UPDATE for dms.admin/system_admin (or via admin client from server actions).
--   - BIGINT PKs consistent with project standard.
-- ============================================================================

-- ── 1. dms_ai_job_queue ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dms_ai_job_queue (
  id                        BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_type                  TEXT NOT NULL,
    -- post_approve_orchestration | content_sync | ai_summary | ai_intelligence |
    -- embedding | tag_suggestions | link_suggestions | ai_analysis (future)
  job_status                TEXT NOT NULL DEFAULT 'queued'
                              CHECK (job_status IN ('queued','running','retry_scheduled','completed','failed','cancelled','superseded')),
    -- queued | running | retry_scheduled | completed | failed | cancelled | superseded
  priority                  INT  NOT NULL DEFAULT 100,
    -- lower = higher priority. 1 = critical, 50 = high, 100 = normal, 500 = background
  payload_json              JSONB NOT NULL DEFAULT '{}',
    -- IDs and control flags ONLY.
    -- MUST NOT contain: OCR text, AI prompts, raw AI responses, document content,
    -- file contents, API keys, full metadata values, full extracted fields.
  idempotency_key           TEXT UNIQUE,
    -- Prevents duplicate jobs for the same logical operation.
    -- Format: "<job_type>:<entity_identifier>"
  related_document_id       BIGINT REFERENCES public.dms_documents(id) ON DELETE SET NULL,
  related_upload_session_id BIGINT REFERENCES public.dms_upload_sessions(id) ON DELETE SET NULL,
  related_ai_result_id      BIGINT REFERENCES public.dms_ai_extraction_results(id) ON DELETE SET NULL,
  related_approve_run_id    BIGINT REFERENCES public.dms_approve_runs(id) ON DELETE SET NULL,
  attempt_count             INT  NOT NULL DEFAULT 0,
  max_attempts              INT  NOT NULL DEFAULT 3,
  locked_by                 TEXT,
    -- Worker ID that claimed this job. NULL when not running.
  locked_at                 TIMESTAMPTZ,
    -- When the lock was acquired. Used for stale lock recovery.
  run_after                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- Job should not be claimed before this time. Used for retry backoff.
  started_at                TIMESTAMPTZ,
  completed_at              TIMESTAMPTZ,
  failed_at                 TIMESTAMPTZ,
  last_error_code           TEXT,
    -- Sanitized error code only. Never a raw exception message.
    -- Examples: 'provider_timeout' | 'provider_not_configured' | 'feature_disabled'
    --           | 'document_not_found' | 'stale_lock' | 'unexpected'
  last_error_message        TEXT,
    -- Safe, sanitized user-facing message. Max ~200 chars. No stack traces.
  safe_error_json           JSONB,
    -- Structured safe metadata. No prompts, OCR, or sensitive data.
  created_by                BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.dms_ai_job_queue IS
  'Generic DMS AI async job queue (Phase 9). Stores only ID references — no raw content, OCR text, prompts, or AI responses.';

COMMENT ON COLUMN public.dms_ai_job_queue.payload_json IS
  'Payload MUST contain only IDs, codes, and control flags. No document content or AI data.';

COMMENT ON COLUMN public.dms_ai_job_queue.idempotency_key IS
  'Optional unique key to prevent duplicate job creation. Pattern: "<job_type>:<entity_id>". Unique constraint enforced.';

-- ── Indexes for dms_ai_job_queue ─────────────────────────────────────────────

-- Primary claim index: status + run_after + priority (partial for active jobs)
CREATE INDEX IF NOT EXISTS idx_dms_ai_job_queue_claim
  ON public.dms_ai_job_queue (job_status, run_after, priority)
  WHERE job_status IN ('queued', 'retry_scheduled');

-- Document FK index
CREATE INDEX IF NOT EXISTS idx_dms_ai_job_queue_document
  ON public.dms_ai_job_queue (related_document_id)
  WHERE related_document_id IS NOT NULL;

-- Upload session FK index
CREATE INDEX IF NOT EXISTS idx_dms_ai_job_queue_session
  ON public.dms_ai_job_queue (related_upload_session_id)
  WHERE related_upload_session_id IS NOT NULL;

-- Type + status index (for monitoring)
CREATE INDEX IF NOT EXISTS idx_dms_ai_job_queue_type_status
  ON public.dms_ai_job_queue (job_type, job_status);

-- Locked_at index (for stale lock recovery)
CREATE INDEX IF NOT EXISTS idx_dms_ai_job_queue_locked_at
  ON public.dms_ai_job_queue (locked_at)
  WHERE locked_at IS NOT NULL;

-- ── 2. dms_ai_job_attempts ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.dms_ai_job_attempts (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  job_id            BIGINT NOT NULL
                      REFERENCES public.dms_ai_job_queue(id) ON DELETE CASCADE,
  attempt_number    INT NOT NULL,
  started_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at      TIMESTAMPTZ,
  status            TEXT NOT NULL
                      CHECK (status IN ('running','completed','failed','timed_out')),
    -- running | completed | failed | timed_out
  duration_ms       INT,
  error_code        TEXT,
    -- Sanitized error code. No raw exception details.
  safe_error_message TEXT,
    -- Safe, user-facing error message. No sensitive data.
  worker_id         TEXT,
  usage_log_id      BIGINT REFERENCES public.erp_ai_usage_logs(id) ON DELETE SET NULL,
    -- Links to erp_ai_usage_logs row for token/cost tracking (Phase 14)
  token_count_in    INT,
  token_count_out   INT,
  model_name        TEXT,
  provider_code     TEXT,
  cost_estimate     NUMERIC(12, 6)
);

COMMENT ON TABLE public.dms_ai_job_attempts IS
  'Per-attempt tracking for dms_ai_job_queue. Supports observability and cost tracking (Phase 14). No sensitive data stored.';

-- ── Indexes for dms_ai_job_attempts ──────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_dms_ai_job_attempts_job_id
  ON public.dms_ai_job_attempts (job_id);

CREATE INDEX IF NOT EXISTS idx_dms_ai_job_attempts_started
  ON public.dms_ai_job_attempts (started_at DESC);

-- ── 3. RLS for dms_ai_job_queue ──────────────────────────────────────────────

ALTER TABLE public.dms_ai_job_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_ai_job_queue FORCE ROW LEVEL SECURITY;

-- SELECT: DMS AI viewers/reviewers/admins may view jobs for their documents
CREATE POLICY "dms_ai_job_queue_select"
  ON public.dms_ai_job_queue
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      current_user_has_permission('dms.documents.review_ai')
      OR current_user_has_permission('dms.documents.edit')
      OR current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
      OR current_user_has_role('group_admin')
    )
  );

-- INSERT: dms.admin and system roles only (server actions use admin client for broader inserts)
CREATE POLICY "dms_ai_job_queue_insert"
  ON public.dms_ai_job_queue
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
      OR current_user_has_role('group_admin')
    )
  );

-- UPDATE: dms.admin and system roles only (worker uses admin client — bypasses RLS)
CREATE POLICY "dms_ai_job_queue_update"
  ON public.dms_ai_job_queue
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
      OR current_user_has_role('group_admin')
    )
  );

-- ── 4. RLS for dms_ai_job_attempts ────────────────────────────────────────────

ALTER TABLE public.dms_ai_job_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dms_ai_job_attempts FORCE ROW LEVEL SECURITY;

-- SELECT: same as job queue
CREATE POLICY "dms_ai_job_attempts_select"
  ON public.dms_ai_job_attempts
  FOR SELECT
  USING (
    auth.uid() IS NOT NULL
    AND (
      current_user_has_permission('dms.documents.review_ai')
      OR current_user_has_permission('dms.documents.edit')
      OR current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
      OR current_user_has_role('group_admin')
    )
  );

-- INSERT/UPDATE: admin/system only (worker uses admin client)
CREATE POLICY "dms_ai_job_attempts_insert"
  ON public.dms_ai_job_attempts
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND (
      current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
      OR current_user_has_role('group_admin')
    )
  );

CREATE POLICY "dms_ai_job_attempts_update"
  ON public.dms_ai_job_attempts
  FOR UPDATE
  USING (
    auth.uid() IS NOT NULL
    AND (
      current_user_has_permission('dms.admin')
      OR current_user_has_role('system_admin')
      OR current_user_has_role('group_admin')
    )
  );
