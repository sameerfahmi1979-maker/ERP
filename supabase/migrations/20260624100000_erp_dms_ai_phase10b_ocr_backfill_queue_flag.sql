-- ─────────────────────────────────────────────────────────────────────────────
-- ERP DMS AI Phase 10B — OCR Backfill Queue Feature Flag
-- Migration: 20260624100000
--
-- Adds DMS_OCR_BACKFILL_QUEUE feature flag (default: false).
--
-- When false (default): Admin OCR backfill uses dry_run or inline (synchronous)
--   mode only — exactly preserving pre-Phase-10B behaviour.
-- When true:  Admin can select "Enqueue Jobs" mode which creates one
--   ocr_backfill queue job per eligible file, processed by the worker route.
--   Requires DMS_AI_JOB_QUEUE=true and DMS_AI_JOB_QUEUE_WORKER_ENABLED=true
--   to actually process the jobs.
--
-- No new tables, columns, or RPCs are created by this migration.
-- Safe to apply with zero behaviour change (flag defaults to false).
-- ─────────────────────────────────────────────────────────────────────────────

INSERT INTO public.erp_ai_feature_flags (
  feature_code,
  feature_name,
  description,
  is_enabled,
  requires_human_review,
  min_confidence_threshold
) VALUES (
  'DMS_OCR_BACKFILL_QUEUE',
  'DMS OCR Backfill — Queue Mode',
  'Enables queue-backed admin OCR backfill (Phase 10B). '
  'When true, the Enqueue Jobs mode in DMS Intelligence Admin creates one '
  'ocr_backfill job in dms_ai_job_queue per eligible file. '
  'Jobs are processed by the WORKER_SECRET-gated worker route using the '
  'Phase 10A three-tier OCR router. '
  'Requires DMS_AI_JOB_QUEUE=true and DMS_AI_JOB_QUEUE_WORKER_ENABLED=true. '
  'When false (default), only Dry Run and Inline modes are available.',
  false,   -- disabled by default — no behaviour change on deploy
  false,
  0.000
)
ON CONFLICT (feature_code) DO UPDATE SET
  feature_name           = EXCLUDED.feature_name,
  description            = EXCLUDED.description,
  updated_at             = now();
