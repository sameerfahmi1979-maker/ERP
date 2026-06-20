-- ============================================================================
-- ERP DMS AI ORCH.1 — Optional Migration Review SQL
-- Purpose: Proposed schema changes for review — NOT APPLIED
-- Date: 2026-06-17
-- Status: REVIEW ONLY — DO NOT APPLY
-- ============================================================================
--
-- Summary of recommendation:
--   A migration IS recommended for ORCH.1. The safest approach is to extend
--   dms_upload_sessions with orchestration tracking columns rather than
--   creating new tables.
--
--   Rationale:
--   - dms_upload_sessions already IS the canonical state for a single upload run.
--   - Adding JSONB orchestration_steps_json avoids table JOINs.
--   - Batch orchestration can reuse the same mechanism per-session.
--   - Avoids schema complexity of dms_ai_orchestration_runs + _run_steps.
--   - If ORCH.2 needs richer run tracking, new tables can be added then.
--
-- ============================================================================

-- REVIEW ONLY — DO NOT APPLY

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 1: Extend dms_upload_sessions for orchestration tracking
-- ────────────────────────────────────────────────────────────────────────────

-- Add orchestration status column
-- Values: pending | running | complete | complete_with_warnings | failed | skipped_feature_disabled
ALTER TABLE public.dms_upload_sessions
  ADD COLUMN IF NOT EXISTS orchestration_status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT dms_upload_sessions_orch_status_chk
    CHECK (orchestration_status IN (
      'pending',
      'running',
      'complete',
      'complete_with_warnings',
      'failed',
      'skipped_feature_disabled'
    ));

-- Add orchestration step-level JSONB tracking
-- Shape: [ { "step": "ai_summary", "status": "completed", "started_at": "...", "completed_at": "...", "duration_ms": 3200 }, ... ]
-- NEVER contains: prompt text, OCR text, AI response, file content, API keys, sensitive values
ALTER TABLE public.dms_upload_sessions
  ADD COLUMN IF NOT EXISTS orchestration_steps_json JSONB;

-- Timing columns
ALTER TABLE public.dms_upload_sessions
  ADD COLUMN IF NOT EXISTS orchestration_started_at TIMESTAMPTZ;

ALTER TABLE public.dms_upload_sessions
  ADD COLUMN IF NOT EXISTS orchestration_completed_at TIMESTAMPTZ;

-- Index for looking up sessions by orchestration status (for admin tools / batch processing)
CREATE INDEX IF NOT EXISTS idx_dms_upload_sessions_orch_status
  ON public.dms_upload_sessions(orchestration_status)
  WHERE deleted_at IS NULL;

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 2: New DMS_AI_ORCHESTRATION feature flag
-- ────────────────────────────────────────────────────────────────────────────

-- IMPORTANT: Default is FALSE. Must be explicitly enabled by admin after UAT.
-- When disabled, runDmsAiOrchestrationPostDraft returns immediately with
-- orchestration_status = 'skipped_feature_disabled'. No AI cost. No behavior change.

INSERT INTO public.erp_ai_feature_flags (
  feature_code, feature_name, description,
  is_enabled, requires_human_review, min_confidence_threshold
) VALUES (
  'DMS_AI_ORCHESTRATION',
  'DMS Full AI Pipeline Orchestration',
  'Enables automatic post-upload full AI processing pipeline: summary, intelligence, embedding, tags, and links after AI intake draft creation. Does not affect OCR/classification/extraction (always run). Default: disabled.',
  false,
  false,
  0.000
)
ON CONFLICT (feature_code) DO UPDATE SET
  feature_name = EXCLUDED.feature_name,
  description = EXCLUDED.description,
  updated_at = now();
-- is_enabled NOT overwritten on conflict — preserves admin toggles

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 3: (NOT RECOMMENDED) Alternative new table design
-- ────────────────────────────────────────────────────────────────────────────
--
-- The following tables are proposed as a Phase ORCH.2 enhancement only.
-- Do NOT create them in ORCH.1.
-- Shown here for reference and future planning.
--
-- CREATE TABLE IF NOT EXISTS public.dms_ai_orchestration_runs (
--   id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
--   session_id           BIGINT NOT NULL REFERENCES public.dms_upload_sessions(id) ON DELETE CASCADE,
--   batch_id             BIGINT REFERENCES public.dms_upload_batches(id) ON DELETE SET NULL,
--   document_id          BIGINT REFERENCES public.dms_documents(id) ON DELETE SET NULL,
--   run_status           TEXT NOT NULL DEFAULT 'pending',
--   created_by           BIGINT REFERENCES public.user_profiles(id) ON DELETE SET NULL,
--   created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
--   started_at           TIMESTAMPTZ,
--   completed_at         TIMESTAMPTZ,
--   deleted_at           TIMESTAMPTZ
-- );
--
-- CREATE TABLE IF NOT EXISTS public.dms_ai_orchestration_run_steps (
--   id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
--   run_id          BIGINT NOT NULL REFERENCES public.dms_ai_orchestration_runs(id) ON DELETE CASCADE,
--   step_code       TEXT NOT NULL,
--   step_status     TEXT NOT NULL DEFAULT 'pending',
--   started_at      TIMESTAMPTZ,
--   completed_at    TIMESTAMPTZ,
--   duration_ms     INTEGER,
--   error_code      TEXT,
--   safe_message    TEXT,
--   created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
-- );
--
-- Decision: DEFER to ORCH.2. ORCH.1 uses JSONB column approach instead.

-- ────────────────────────────────────────────────────────────────────────────
-- SECTION 4: Verification queries (run after applying migration)
-- ────────────────────────────────────────────────────────────────────────────

-- Confirm new columns exist:
-- SELECT column_name, data_type FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name = 'dms_upload_sessions'
--   AND column_name LIKE 'orchestration%';

-- Confirm feature flag exists:
-- SELECT feature_code, is_enabled FROM erp_ai_feature_flags
-- WHERE feature_code = 'DMS_AI_ORCHESTRATION';
