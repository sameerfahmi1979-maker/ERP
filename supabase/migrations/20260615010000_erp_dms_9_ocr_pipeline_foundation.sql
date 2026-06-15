-- ============================================================================
-- ERP DMS.9 — OCR Pipeline Foundation
-- Adds OCR columns to dms_document_files and dms_documents,
-- adds file_id to dms_ai_extraction_jobs, and seeds OCR permissions.
-- ============================================================================

-- ── STEP 1: OCR columns on dms_document_files ────────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_document_files' AND column_name = 'ocr_status'
  ) THEN
    ALTER TABLE public.dms_document_files
      ADD COLUMN ocr_status TEXT NOT NULL DEFAULT 'not_started';
    COMMENT ON COLUMN public.dms_document_files.ocr_status IS
      'OCR status for this file: not_started | pending | processing | complete | failed | skipped | not_supported | provider_not_configured';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_document_files' AND column_name = 'ocr_provider'
  ) THEN
    ALTER TABLE public.dms_document_files
      ADD COLUMN ocr_provider TEXT NULL;
    COMMENT ON COLUMN public.dms_document_files.ocr_provider IS
      'OCR provider code used: pdf_text | tesseract | azure_doc_intelligence | noop';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_document_files' AND column_name = 'ocr_model'
  ) THEN
    ALTER TABLE public.dms_document_files
      ADD COLUMN ocr_model TEXT NULL;
    COMMENT ON COLUMN public.dms_document_files.ocr_model IS
      'OCR model or engine version used.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_document_files' AND column_name = 'ocr_started_at'
  ) THEN
    ALTER TABLE public.dms_document_files
      ADD COLUMN ocr_started_at TIMESTAMPTZ NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_document_files' AND column_name = 'ocr_completed_at'
  ) THEN
    ALTER TABLE public.dms_document_files
      ADD COLUMN ocr_completed_at TIMESTAMPTZ NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_document_files' AND column_name = 'ocr_error_message'
  ) THEN
    ALTER TABLE public.dms_document_files
      ADD COLUMN ocr_error_message TEXT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_document_files' AND column_name = 'ocr_confidence'
  ) THEN
    ALTER TABLE public.dms_document_files
      ADD COLUMN ocr_confidence NUMERIC(5,4) NULL;
    COMMENT ON COLUMN public.dms_document_files.ocr_confidence IS
      'Aggregate OCR confidence score (0.0–1.0) from provider, if available.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_document_files' AND column_name = 'ocr_page_count'
  ) THEN
    ALTER TABLE public.dms_document_files
      ADD COLUMN ocr_page_count INT NULL;
    COMMENT ON COLUMN public.dms_document_files.ocr_page_count IS
      'Number of pages processed by OCR (may differ from total page_count if partial).';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_document_files' AND column_name = 'ocr_language'
  ) THEN
    ALTER TABLE public.dms_document_files
      ADD COLUMN ocr_language TEXT NULL;
    COMMENT ON COLUMN public.dms_document_files.ocr_language IS
      'Detected or configured language for OCR (e.g. en, ar).';
  END IF;
END $$;

-- ── STEP 2: OCR columns on dms_documents ─────────────────────────────────────
-- dms_documents.ocr_status already exists (DMS.2, default 'not_required').
-- Align default to 'not_started' and add tracking columns.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_documents' AND column_name = 'ocr_last_run_at'
  ) THEN
    ALTER TABLE public.dms_documents
      ADD COLUMN ocr_last_run_at TIMESTAMPTZ NULL;
    COMMENT ON COLUMN public.dms_documents.ocr_last_run_at IS
      'Timestamp of the most recent OCR run for any file in this document.';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_documents' AND column_name = 'ocr_text_available'
  ) THEN
    ALTER TABLE public.dms_documents
      ADD COLUMN ocr_text_available BOOLEAN NOT NULL DEFAULT false;
    COMMENT ON COLUMN public.dms_documents.ocr_text_available IS
      'True when at least one file has successfully extracted OCR text.';
  END IF;
END $$;

-- ── STEP 3: Add file_id to dms_ai_extraction_jobs ────────────────────────────

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_ai_extraction_jobs' AND column_name = 'file_id'
  ) THEN
    ALTER TABLE public.dms_ai_extraction_jobs
      ADD COLUMN file_id BIGINT REFERENCES public.dms_document_files(id) ON DELETE SET NULL;
    COMMENT ON COLUMN public.dms_ai_extraction_jobs.file_id IS
      'Specific file targeted by this OCR/AI job. NULL means whole-document job.';
  END IF;
END $$;

-- ── STEP 4: Indexes ───────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_dms_document_files_ocr_status
  ON public.dms_document_files (ocr_status)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dms_document_files_ocr_completed_at
  ON public.dms_document_files (ocr_completed_at)
  WHERE ocr_completed_at IS NOT NULL AND deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_dms_ai_jobs_file
  ON public.dms_ai_extraction_jobs (file_id)
  WHERE file_id IS NOT NULL;

-- ── STEP 5: Seed OCR permissions ─────────────────────────────────────────────

INSERT INTO public.permissions (permission_code, permission_name, module_code, action_code, description, is_active)
VALUES
  ('dms.documents.ocr.view',    'DMS OCR — View OCR Text',     'DMS', 'ocr_view',    'View OCR extracted text for DMS document files', true),
  ('dms.documents.ocr.trigger', 'DMS OCR — Trigger OCR',       'DMS', 'ocr_trigger', 'Manually trigger OCR processing for DMS files', true),
  ('dms.documents.ocr.retry',   'DMS OCR — Retry Failed OCR',  'DMS', 'ocr_retry',   'Retry failed OCR jobs for DMS files', true),
  ('dms.documents.ocr.skip',    'DMS OCR — Skip OCR',          'DMS', 'ocr_skip',    'Mark DMS file OCR as skipped', true),
  ('dms.ocr.admin',             'DMS OCR — Admin',             'DMS', 'ocr_admin',   'Full admin access to DMS OCR jobs and queue', true)
ON CONFLICT (permission_code) DO NOTHING;
