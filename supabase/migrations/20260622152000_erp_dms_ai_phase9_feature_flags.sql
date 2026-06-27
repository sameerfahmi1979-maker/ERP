-- ============================================================================
-- ERP DMS AI Corrected Phase 9 — Feature Flags
-- Migration: 20260622152000_erp_dms_ai_phase9_feature_flags.sql
--
-- Inserts Phase 9 feature flags into erp_ai_feature_flags.
-- Both flags default to is_enabled = false.
-- Deploying Phase 9 code does NOT change runtime behavior until flags are enabled.
--
-- Rollout sequence:
--   1. Deploy code (flags = false) → zero behavior change
--   2. Set DMS_AI_JOB_QUEUE = true → jobs enqueue instead of running inline
--   3. Set DMS_AI_JOB_QUEUE_WORKER_ENABLED = true → worker route accepts requests
--   4. Wire worker route to cron → automatic processing
-- ============================================================================

INSERT INTO public.erp_ai_feature_flags
  (feature_code, feature_name, description, is_enabled, requires_human_review, notes)
VALUES
  (
    'DMS_AI_JOB_QUEUE',
    'DMS AI Job Queue',
    'Master gate for async AI job queue. When true, post-approval orchestration enqueues instead of running inline. When false, existing inline behavior is preserved.',
    false,
    true,
    'Phase 9 — Async AI Job Queue / Workflow Runner. Set to true only after confirming DMS_AI_JOB_QUEUE_WORKER_ENABLED is ready.'
  ),
  (
    'DMS_AI_JOB_QUEUE_WORKER_ENABLED',
    'DMS AI Job Queue Worker Enabled',
    'Whether the protected worker route (/api/internal/dms-ai-jobs/process) is enabled. Requires WORKER_SECRET env var to be set.',
    false,
    true,
    'Phase 9 — Set to true only after DMS_AI_JOB_QUEUE is enabled and WORKER_SECRET is configured in the environment.'
  )
ON CONFLICT (feature_code) DO NOTHING;
