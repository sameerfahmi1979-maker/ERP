-- ERP DMS.DELETE.2 — Enhanced purge_dms_document RPC
-- Adds two pre-delete steps to handle the indirect upload_session → review_queue
-- linkage that CASCADE alone cannot resolve.
-- Pre-delete A runs BEFORE upload_sessions are removed so the IN subquery still works.

CREATE OR REPLACE FUNCTION purge_dms_document(p_id bigint)
RETURNS TABLE(out_storage_files jsonb, out_files_found int)
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_doc_exists  BOOLEAN;
  v_storage     JSONB;
  v_file_count  INT;
BEGIN
  SELECT EXISTS(SELECT 1 FROM dms_documents WHERE id = p_id)
    INTO v_doc_exists;

  IF NOT v_doc_exists THEN
    RAISE EXCEPTION 'dms_document % not found', p_id;
  END IF;

  -- Collect physical file paths for post-transaction Storage purge (unchanged)
  SELECT
    COALESCE(
      jsonb_agg(jsonb_build_object('bucket', storage_bucket, 'path', storage_path))
        FILTER (WHERE storage_bucket IS NOT NULL AND storage_path IS NOT NULL),
      '[]'::jsonb
    ),
    COUNT(*)
  INTO v_storage, v_file_count
  FROM dms_document_files
  WHERE document_id = p_id;

  -- Pre-delete A: Remove review queue items linked via upload session
  -- (the direct document_id → CASCADE handles direct links;
  --  this step covers the indirect path: session.document_id = p_id)
  DELETE FROM dms_review_queue
    WHERE upload_session_id IN (
      SELECT id FROM dms_upload_sessions WHERE document_id = p_id
    );

  -- Pre-delete B: Remove upload sessions that generated this document
  DELETE FROM dms_upload_sessions WHERE document_id = p_id;

  -- Hard-delete the document row.
  -- DB CASCADE now removes: dms_review_queue (direct), dms_ai_job_queue,
  -- dms_ai_extraction_jobs, dms_ai_extraction_results, and all 20 original
  -- CASCADE child tables.
  DELETE FROM dms_documents WHERE id = p_id;

  out_storage_files := v_storage;
  out_files_found   := v_file_count;
  RETURN NEXT;
END;
$$;
