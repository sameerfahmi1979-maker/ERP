-- ============================================================
-- DMS Final Cleanup — Normalize Legacy Absolute Notification Action URLs
-- Migration: 20260724120000_dms_final_normalize_notification_action_urls.sql
-- Phase: DMS FINAL PRODUCTION CLEANUP
-- Date: 2026-07-24
--
-- Purpose:
--   DMS.4 found 43 erp_notifications rows with absolute action_url values
--   like 'https://erp.algt.net/dms/documents/record/{id}' created before
--   the DMS.3F fix. All new notifications use relative paths ('/dms/...').
--
--   This migration converts same-domain ALGT ERP absolute DMS URLs to
--   relative internal paths so that assertInternalActionUrl passes on read,
--   and the notification bell behaves correctly on all domains (dev/prod).
--
-- Safety guarantees:
--   - ONLY matches https://erp.algt.net and http://erp.algt.net variants
--   - ONLY matches paths starting with /dms/
--   - Does NOT touch null action_url
--   - Does NOT touch already-relative action_url
--   - Does NOT touch non-DMS or unrelated URLs
--   - Does NOT touch title, message, recipient_user_id, payload_json
--   - Idempotent: safe to re-run (WHERE clause excludes already-relative rows)
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- Pre-migration audit
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_count_abs INT;
  v_count_other_external INT;
BEGIN
  SELECT COUNT(*) INTO v_count_abs
  FROM public.erp_notifications
  WHERE action_url ~ '^https?://(www\.)?erp\.algt\.net/dms/';

  SELECT COUNT(*) INTO v_count_other_external
  FROM public.erp_notifications
  WHERE action_url ~ '^https?://'
    AND action_url NOT LIKE '%erp.algt.net%';

  RAISE NOTICE 'PRE-MIGRATION: % rows with absolute erp.algt.net/dms/ URLs to normalize.', v_count_abs;
  RAISE NOTICE 'PRE-MIGRATION: % rows with other external absolute URLs (should be 0).', v_count_other_external;

  -- Hard safety gate: refuse if any non-ALGT external URL is present
  IF v_count_other_external > 0 THEN
    RAISE EXCEPTION 'SAFETY GATE: Found % non-ALGT external action_url values. Review before proceeding.', v_count_other_external;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────
-- Main update: strip the https://erp.algt.net (or www.) prefix
-- Only affects DMS paths on the known ALGT ERP domain
-- ──────────────────────────────────────────────────────────────

UPDATE public.erp_notifications
SET
  action_url = regexp_replace(
    action_url,
    '^https?://(www\.)?erp\.algt\.net',
    ''
  ),
  updated_at = NOW()
WHERE action_url ~ '^https?://(www\.)?erp\.algt\.net/dms/';

-- ──────────────────────────────────────────────────────────────
-- Post-migration validation
-- ──────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_remaining_abs INT;
  v_remaining_abs_dms INT;
  v_converted INT;
  v_relative_dms INT;
BEGIN
  SELECT COUNT(*) INTO v_remaining_abs
  FROM public.erp_notifications
  WHERE action_url ~ '^https?://';

  SELECT COUNT(*) INTO v_remaining_abs_dms
  FROM public.erp_notifications
  WHERE action_url ~ '^https?://(www\.)?erp\.algt\.net/dms/';

  SELECT COUNT(*) INTO v_relative_dms
  FROM public.erp_notifications
  WHERE action_url LIKE '/dms/%';

  RAISE NOTICE 'POST-MIGRATION: % rows still have absolute URLs (all domains).', v_remaining_abs;
  RAISE NOTICE 'POST-MIGRATION: % rows still have absolute erp.algt.net/dms/ URLs (should be 0).', v_remaining_abs_dms;
  RAISE NOTICE 'POST-MIGRATION: % rows now have relative /dms/... action_url.', v_relative_dms;

  IF v_remaining_abs_dms > 0 THEN
    RAISE EXCEPTION 'VALIDATION FAILED: % absolute erp.algt.net/dms/ rows still present after migration.', v_remaining_abs_dms;
  END IF;

  RAISE NOTICE 'DMS FINAL CLEANUP MIGRATION: action_url normalization PASSED.';
END $$;
