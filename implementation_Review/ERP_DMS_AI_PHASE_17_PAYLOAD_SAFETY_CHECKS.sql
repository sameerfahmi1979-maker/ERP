-- ============================================================================
-- ERP DMS AI Phase 17 — Payload Safety Checks
-- File: implementation_Review/ERP_DMS_AI_PHASE_17_PAYLOAD_SAFETY_CHECKS.sql
-- Date: 2026-06-27
--
-- Purpose: Verify correction proposal rows do not contain raw/sensitive data.
-- Run via Supabase MCP after creating test correction proposals.
-- ============================================================================

-- ── 1. No raw OCR columns in table ────────────────────────────────────────────

SELECT
  'NO_RAW_CONTENT_COLUMNS' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'dms_ai_erp_apply_correction_proposals'
      AND column_name IN (
        'ocr_text', 'content_text', 'chunk_text', 'embedding',
        'raw_response', 'ai_response', 'prompt_text', 'model_output'
      )
  ) THEN 'PASS: no raw content columns found'
  ELSE 'FAIL: raw content column(s) present'
  END AS result;

-- ── 2. Summary fields are max 200 chars (where populated) ────────────────────

SELECT
  'SUMMARY_LENGTH_ORIGINAL_BEFORE' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.dms_ai_erp_apply_correction_proposals
    WHERE original_before_summary IS NOT NULL
      AND LENGTH(original_before_summary) > 200
  ) THEN 'PASS: all original_before_summary ≤ 200 chars'
  ELSE 'FAIL: some original_before_summary > 200 chars'
  END AS result;

SELECT
  'SUMMARY_LENGTH_ORIGINAL_APPLIED' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.dms_ai_erp_apply_correction_proposals
    WHERE original_applied_summary IS NOT NULL
      AND LENGTH(original_applied_summary) > 200
  ) THEN 'PASS: all original_applied_summary ≤ 200 chars'
  ELSE 'FAIL: some original_applied_summary > 200 chars'
  END AS result;

SELECT
  'SUMMARY_LENGTH_CURRENT' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.dms_ai_erp_apply_correction_proposals
    WHERE current_value_summary IS NOT NULL
      AND LENGTH(current_value_summary) > 200
  ) THEN 'PASS: all current_value_summary ≤ 200 chars'
  ELSE 'FAIL: some current_value_summary > 200 chars'
  END AS result;

SELECT
  'SUMMARY_LENGTH_PROPOSED' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.dms_ai_erp_apply_correction_proposals
    WHERE proposed_correction_summary IS NOT NULL
      AND LENGTH(proposed_correction_summary) > 200
  ) THEN 'PASS: all proposed_correction_summary ≤ 200 chars'
  ELSE 'FAIL: some proposed_correction_summary > 200 chars'
  END AS result;

-- ── 3. Failure reason max 500 chars ──────────────────────────────────────────

SELECT
  'FAILURE_REASON_LENGTH' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.dms_ai_erp_apply_correction_proposals
    WHERE failure_reason IS NOT NULL
      AND LENGTH(failure_reason) > 500
  ) THEN 'PASS: all failure_reason ≤ 500 chars'
  ELSE 'FAIL: some failure_reason > 500 chars'
  END AS result;

SELECT
  'CONFLICT_REASON_LENGTH' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.dms_ai_erp_apply_correction_proposals
    WHERE conflict_reason IS NOT NULL
      AND LENGTH(conflict_reason) > 500
  ) THEN 'PASS: all conflict_reason ≤ 500 chars'
  ELSE 'FAIL: some conflict_reason > 500 chars'
  END AS result;

-- ── 4. correction_value_json is scalar-only { "v": <scalar> } ────────────────

SELECT
  'CORRECTION_VALUE_SCALAR' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.dms_ai_erp_apply_correction_proposals
    WHERE correction_value_json IS NOT NULL
      AND (
        -- Not a single-key object with key "v"
        jsonb_typeof(correction_value_json) != 'object'
        OR NOT (correction_value_json ? 'v')
        -- Value itself must be scalar (not array or object)
        OR jsonb_typeof(correction_value_json -> 'v') IN ('array', 'object')
        -- Must have only the "v" key
        OR (SELECT COUNT(*) FROM jsonb_object_keys(correction_value_json)) > 1
      )
  ) THEN 'PASS: all correction_value_json are scalar-only { v: scalar }'
  ELSE 'FAIL: some correction_value_json violate scalar-only rule'
  END AS result;

-- ── 5. No forbidden keys in correction_value_json ────────────────────────────

SELECT
  'NO_FORBIDDEN_KEYS' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM public.dms_ai_erp_apply_correction_proposals
    WHERE correction_value_json IS NOT NULL
      AND (
        correction_value_json ? 'ocr_text'       OR
        correction_value_json ? 'content_text'   OR
        correction_value_json ? 'raw_response'   OR
        correction_value_json ? 'ai_response'    OR
        correction_value_json ? 'embedding'      OR
        correction_value_json ? 'prompt_text'    OR
        correction_value_json ? 'password'       OR
        correction_value_json ? 'api_key'        OR
        correction_value_json ? 'secret'
      )
  ) THEN 'PASS: no forbidden keys found in correction_value_json'
  ELSE 'FAIL: forbidden key(s) found in correction_value_json'
  END AS result;

-- ── 6. No anon policies on correction table ───────────────────────────────────

SELECT
  'NO_ANON_POLICIES' AS check_name,
  CASE WHEN NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dms_ai_erp_apply_correction_proposals'
      AND roles @> ARRAY['anon']::name[]
  ) THEN 'PASS: no anon policies'
  ELSE 'FAIL: anon policy found'
  END AS result;

-- ── 7. Correction summary: raw counts ────────────────────────────────────────

SELECT
  COUNT(*) AS total_proposals,
  COUNT(*) FILTER (WHERE status = 'draft') AS draft,
  COUNT(*) FILTER (WHERE status = 'pending_confirmation') AS pending_confirmation,
  COUNT(*) FILTER (WHERE status = 'applied') AS applied,
  COUNT(*) FILTER (WHERE status = 'conflict') AS conflict,
  COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled,
  COUNT(*) FILTER (WHERE status = 'failed') AS failed
FROM public.dms_ai_erp_apply_correction_proposals;

-- ── 8. Correction apply runs with source_type=correction_proposal ─────────────

SELECT
  COUNT(*) AS correction_apply_runs
FROM public.dms_ai_erp_apply_runs
WHERE source_type = 'correction_proposal';

-- ============================================================================
-- End of Payload Safety Checks
-- ============================================================================
