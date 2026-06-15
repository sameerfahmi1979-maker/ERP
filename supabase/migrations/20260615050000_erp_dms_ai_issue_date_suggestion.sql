-- ERP DMS — Add issue_date_suggestion to dms_ai_extraction_results
-- Required for the improved AI extraction that now returns both issue and expiry dates.

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'dms_ai_extraction_results'
      AND column_name  = 'issue_date_suggestion'
  ) THEN
    ALTER TABLE public.dms_ai_extraction_results
      ADD COLUMN issue_date_suggestion DATE;
  END IF;
END $$;
