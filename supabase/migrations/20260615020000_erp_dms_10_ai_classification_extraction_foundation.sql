-- ============================================================================
-- ERP DMS.10 — AI Document Classification and Extraction Foundation
-- Adds run_source, input_text_hash, prompt_version to dms_ai_extraction_jobs.
-- Adds file_id, result_type, ai_status, field_confidence_json,
-- classification_reason, suggested_title, suggested_description
-- to dms_ai_extraction_results.
-- Adds 4 DMS AI permissions.
-- ============================================================================

-- STEP 1: dms_ai_extraction_jobs
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_ai_extraction_jobs' AND column_name = 'run_source'
  ) THEN
    ALTER TABLE public.dms_ai_extraction_jobs ADD COLUMN run_source TEXT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_ai_extraction_jobs' AND column_name = 'input_text_hash'
  ) THEN
    ALTER TABLE public.dms_ai_extraction_jobs ADD COLUMN input_text_hash TEXT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_ai_extraction_jobs' AND column_name = 'prompt_version'
  ) THEN
    ALTER TABLE public.dms_ai_extraction_jobs ADD COLUMN prompt_version TEXT NULL;
  END IF;
END $$;

-- STEP 2: dms_ai_extraction_results
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_ai_extraction_results' AND column_name = 'file_id'
  ) THEN
    ALTER TABLE public.dms_ai_extraction_results
      ADD COLUMN file_id BIGINT REFERENCES public.dms_document_files(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_ai_extraction_results' AND column_name = 'result_type'
  ) THEN
    ALTER TABLE public.dms_ai_extraction_results ADD COLUMN result_type TEXT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_ai_extraction_results' AND column_name = 'ai_status'
  ) THEN
    ALTER TABLE public.dms_ai_extraction_results
      ADD COLUMN ai_status TEXT NOT NULL DEFAULT 'pending_review';
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_ai_extraction_results' AND column_name = 'field_confidence_json'
  ) THEN
    ALTER TABLE public.dms_ai_extraction_results ADD COLUMN field_confidence_json JSONB NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_ai_extraction_results' AND column_name = 'classification_reason'
  ) THEN
    ALTER TABLE public.dms_ai_extraction_results ADD COLUMN classification_reason TEXT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_ai_extraction_results' AND column_name = 'suggested_title'
  ) THEN
    ALTER TABLE public.dms_ai_extraction_results ADD COLUMN suggested_title TEXT NULL;
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dms_ai_extraction_results' AND column_name = 'suggested_description'
  ) THEN
    ALTER TABLE public.dms_ai_extraction_results ADD COLUMN suggested_description TEXT NULL;
  END IF;
END $$;

-- STEP 3: Indexes
CREATE INDEX IF NOT EXISTS idx_dms_ai_results_document_status
  ON public.dms_ai_extraction_results (document_id, ai_status)
  WHERE document_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_ai_results_file
  ON public.dms_ai_extraction_results (file_id)
  WHERE file_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_dms_ai_jobs_run_source
  ON public.dms_ai_extraction_jobs (run_source)
  WHERE run_source IS NOT NULL;

-- STEP 4: Permissions
INSERT INTO public.permissions (permission_code, permission_name, module_code, action_code, description, is_active)
VALUES
  ('dms.documents.ai.view',       'DMS AI - View AI Results',       'DMS', 'ai_view',      'View AI classification and extraction results', true),
  ('dms.documents.ai.run',        'DMS AI - Run AI Analysis',       'DMS', 'ai_run',       'Trigger AI classification/extraction', true),
  ('dms.documents.ai.retry',      'DMS AI - Retry AI Analysis',     'DMS', 'ai_retry',     'Retry failed AI analysis jobs', true),
  ('dms.documents.ai.supersede',  'DMS AI - Supersede AI Result',   'DMS', 'ai_supersede', 'Mark AI result as superseded', true)
ON CONFLICT (permission_code) DO NOTHING;
