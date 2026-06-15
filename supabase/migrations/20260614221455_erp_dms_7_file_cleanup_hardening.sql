-- =============================================================================
-- ERP DMS.7 — Versioning, Cleanup Jobs, Temp Session Cleanup, File Integrity Hardening
-- Phase:  ERP DMS.7
-- Date:   2026-06-15
-- Notes:  All additions are nullable and backward-compatible.
--         No permanent files touched by cleanup logic.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- STEP 1: Add cleanup tracking columns to dms_upload_sessions
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dms_upload_sessions' AND column_name = 'temp_cleaned_at'
  ) THEN
    ALTER TABLE public.dms_upload_sessions
      ADD COLUMN temp_cleaned_at TIMESTAMPTZ NULL;
    COMMENT ON COLUMN public.dms_upload_sessions.temp_cleaned_at IS
      'DMS.7: timestamp when the temp file was deleted from dms-temp bucket during cleanup.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dms_upload_sessions' AND column_name = 'cleanup_error_message'
  ) THEN
    ALTER TABLE public.dms_upload_sessions
      ADD COLUMN cleanup_error_message TEXT NULL;
    COMMENT ON COLUMN public.dms_upload_sessions.cleanup_error_message IS
      'DMS.7: error message from the last cleanup attempt, if any.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- STEP 2: Add integrity columns to dms_document_files
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dms_document_files' AND column_name = 'integrity_status'
  ) THEN
    ALTER TABLE public.dms_document_files
      ADD COLUMN integrity_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (integrity_status IN ('pending','verified','failed','skipped'));
    COMMENT ON COLUMN public.dms_document_files.integrity_status IS
      'DMS.7: file integrity verification status (pending/verified/failed/skipped).';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dms_document_files' AND column_name = 'integrity_checked_at'
  ) THEN
    ALTER TABLE public.dms_document_files
      ADD COLUMN integrity_checked_at TIMESTAMPTZ NULL;
    COMMENT ON COLUMN public.dms_document_files.integrity_checked_at IS
      'DMS.7: timestamp of the last integrity check.';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'dms_document_files' AND column_name = 'integrity_error_message'
  ) THEN
    ALTER TABLE public.dms_document_files
      ADD COLUMN integrity_error_message TEXT NULL;
    COMMENT ON COLUMN public.dms_document_files.integrity_error_message IS
      'DMS.7: error message from the last integrity check, if status=failed.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- STEP 3: Index on integrity_status for quick lookups
-- -----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS dms_doc_files_integrity_status_idx
  ON public.dms_document_files (integrity_status)
  WHERE integrity_status != 'verified';

-- =============================================================================
-- END DMS.7 Migration
-- =============================================================================
