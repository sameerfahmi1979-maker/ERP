-- ============================================================================
-- ERP DMS AI ORCH.1 — One-Click Upload & Full AI Processing Pipeline
-- Migration: erp_dms_ai_orch_1_orchestration_columns
-- Date: 2026-06-17
-- Scope:
--   1. Add orchestration tracking columns to dms_upload_sessions
--   2. Add DMS_AI_ORCHESTRATION feature flag (default: disabled)
--
-- Does NOT:
--   - Create new tables
--   - Change RLS policies (existing upload session policies apply to new columns)
--   - Enable auto-approval
--   - Alter any existing DMS AI behavior
-- ============================================================================

-- ── 1. Orchestration tracking columns on dms_upload_sessions ─────────────────

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
    )),
  ADD COLUMN IF NOT EXISTS orchestration_steps_json JSONB,
  ADD COLUMN IF NOT EXISTS orchestration_started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS orchestration_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN public.dms_upload_sessions.orchestration_status IS
  'DMS AI ORCH.1 — overall orchestration pipeline status for this upload session. Default: pending (no run yet).';

COMMENT ON COLUMN public.dms_upload_sessions.orchestration_steps_json IS
  'DMS AI ORCH.1 — per-step status JSONB. Each entry: {step, status, startedAt, completedAt, durationMs, errorCode, safeErrorMessage}. Never contains OCR text, prompts, AI responses, or file content.';

-- Index: look up sessions needing orchestration (e.g., admin backfill)
CREATE INDEX IF NOT EXISTS idx_dms_upload_sessions_orchestration_status
  ON public.dms_upload_sessions(orchestration_status)
  WHERE deleted_at IS NULL;

-- ── 2. DMS_AI_ORCHESTRATION feature flag ─────────────────────────────────────

INSERT INTO public.erp_ai_feature_flags (
  feature_code,
  feature_name,
  description,
  is_enabled,
  requires_human_review,
  min_confidence_threshold
) VALUES (
  'DMS_AI_ORCHESTRATION',
  'DMS Full AI Pipeline Orchestration',
  'Enables automatic post-upload full AI processing pipeline (content sync, AI summary, intelligence evaluation, embedding, tag suggestions, smart links) after draft creation from Upload & AI Fill. Default: disabled. Enable only after UAT.',
  false,
  false,
  0.000
)
ON CONFLICT (feature_code) DO UPDATE SET
  feature_name         = EXCLUDED.feature_name,
  description          = EXCLUDED.description,
  requires_human_review = EXCLUDED.requires_human_review,
  updated_at           = now();
-- NOTE: is_enabled is NOT overwritten on conflict — preserves admin UAT toggles.
