BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- These two lateral checks retain the extraction and file table policies.
-- The caller supplies only the IDs in the already-counted page.
CREATE FUNCTION public.hr_document_choice_page_flags(document_ids bigint[])
RETURNS TABLE (document_id bigint, has_extraction boolean, has_ocr boolean)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $flags$
  SELECT requested.id,
    EXISTS (SELECT 1 FROM public.dms_ai_extraction_results extraction
      WHERE extraction.document_id = requested.id AND extraction.ai_status <> 'superseded'),
    EXISTS (SELECT 1 FROM public.dms_document_files file
      WHERE file.document_id = requested.id AND file.deleted_at IS NULL AND file.ocr_status = 'done')
  FROM (
    SELECT DISTINCT id FROM unnest(document_ids) id
    WHERE cardinality(document_ids) BETWEEN 1 AND 50 AND id > 0
  ) requested;
$flags$;
REVOKE ALL ON FUNCTION public.hr_document_choice_page_flags(bigint[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.hr_document_choice_page_flags(bigint[]) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
