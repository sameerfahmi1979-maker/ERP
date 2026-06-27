-- ============================================================================
-- ERP DMS AI Phase 5 — Single and Batch Upload Orchestration Unification
-- Additive migration: orchestration source tracking columns.
-- ============================================================================

-- ── 1. Orchestration source tracking on dms_upload_sessions ──────────────────

ALTER TABLE public.dms_upload_sessions
  ADD COLUMN IF NOT EXISTS orchestration_source TEXT NULL,
  ADD COLUMN IF NOT EXISTS orchestration_triggered_by_approve_run_id BIGINT NULL
    REFERENCES public.dms_approve_runs(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.dms_upload_sessions.orchestration_source IS
  'DMS AI Phase 5 — how the orchestration pipeline was triggered.
   Values: single_file_approve, batch_finalize, manual_batch_button, manual_retry, auto_trigger_ui.
   NULL means orchestration was never triggered or was triggered before Phase 5.';

COMMENT ON COLUMN public.dms_upload_sessions.orchestration_triggered_by_approve_run_id IS
  'DMS AI Phase 5 — FK to dms_approve_runs.id when orchestration was triggered by an approval action.
   NULL for manual triggers or pre-Phase 5 sessions.';

-- ── 2. Index on orchestration_source for production observability ─────────────

CREATE INDEX IF NOT EXISTS idx_dms_upload_sessions_orch_source
  ON public.dms_upload_sessions(orchestration_source)
  WHERE orchestration_source IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dms_upload_sessions_orch_approve_run
  ON public.dms_upload_sessions(orchestration_triggered_by_approve_run_id)
  WHERE orchestration_triggered_by_approve_run_id IS NOT NULL;

-- ── Notes ─────────────────────────────────────────────────────────────────────
-- Does NOT change orchestration_status CHECK constraint.
-- Does NOT add new orchestration status values.
-- Does NOT create new tables.
-- Does NOT weaken RLS — existing dms_upload_sessions RLS policies cover new columns.
-- All existing sessions remain valid (both columns are nullable).
