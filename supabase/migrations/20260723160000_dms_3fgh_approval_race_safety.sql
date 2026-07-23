-- ============================================================
-- DMS.3F/G/H — Approval Race Safety + dms-temp Cleanup Index
-- Migration: 20260723160000_dms_3fgh_approval_race_safety.sql
-- Phase: DMS.3F/G/H
-- Date: 2026-07-23
-- Purpose:
--   1. Add partial unique index on dms_document_approvals(document_id)
--      WHERE is_current = TRUE — prevents duplicate active approval rows
--      from concurrent submissions (race condition mitigation).
--
-- Note: This is additive and idempotent (CREATE UNIQUE INDEX IF NOT EXISTS).
-- No data-modifying changes.
-- ============================================================

-- ──────────────────────────────────────────────────────────────
-- 1. Partial unique index: at most one is_current=TRUE row per document
--
-- Protects against race: two concurrent submitDocumentForApproval calls
-- both passing the approval_status check before either updates the doc.
-- The DB will reject the second INSERT with a unique violation, which
-- is caught as an error in the server action (approvalErr) and returns
-- an error to the caller.
-- ──────────────────────────────────────────────────────────────

CREATE UNIQUE INDEX IF NOT EXISTS idx_dms_approvals_one_current_per_doc
  ON public.dms_document_approvals(document_id)
  WHERE is_current = TRUE;

-- ──────────────────────────────────────────────────────────────
-- Validation
-- ──────────────────────────────────────────────────────────────

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE tablename = 'dms_document_approvals'
      AND indexname = 'idx_dms_approvals_one_current_per_doc'
  ) THEN
    RAISE EXCEPTION 'VALIDATION FAILED: idx_dms_approvals_one_current_per_doc not found';
  END IF;

  RAISE NOTICE 'DMS.3F/G/H validation PASSED: approval race safety index ✓';
END $$;
