-- Require successful upload-bound extraction, not a manually set status marker.
-- Exact byte binding and governed manual override remain separate acceptance gates.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION erp_private.f07_attachment_source(p_session bigint,p_document bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.dms_upload_sessions; d public.dms_documents; ai public.dms_ai_extraction_results;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR
  NOT erp_private.upload_session_permission(p_session,'dms.documents.upload') OR
  NOT (erp_private.document_permission(p_document,'dms.documents.upload') OR erp_private.document_permission(p_document,'dms.admin')) OR
  NOT (erp_private.document_permission(p_document,'dms.documents.edit') OR erp_private.document_permission(p_document,'dms.admin')) OR
  NOT erp_private.document_permission(p_document,'dms.documents.preview') THEN
  RAISE EXCEPTION 'Attachment access denied' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session AND deleted_at IS NULL;
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL;
 IF s.id IS NULL OR d.id IS NULL OR ROW(s.owning_company_id,s.owning_branch_id) IS DISTINCT FROM ROW(d.owning_company_id,d.owning_branch_id)
  OR d.is_archived OR d.status IN ('archived','superseded','deleted') THEN RAISE EXCEPTION 'Attachment scope unavailable' USING ERRCODE='42501';END IF;
 IF (s.status<>'completed' AND s.expires_at<=clock_timestamp()) OR s.status IN ('cancelled','expired') OR s.intake_status IN ('discarded','cancelled','expired') THEN
  RAISE EXCEPTION 'Upload is closed or expired' USING ERRCODE='PT409';END IF;
 IF nullif(s.temp_storage_path,'') IS NULL OR s.file_size_bytes NOT BETWEEN 1 AND 52428800 THEN RAISE EXCEPTION 'Invalid upload source' USING ERRCODE='22023';END IF;
 IF s.intake_status<>'review_pending' AND s.status<>'completed' THEN RAISE EXCEPTION 'Review the uploaded file before attaching' USING ERRCODE='PT409';END IF;
 IF s.ai_result_id IS NULL THEN RAISE EXCEPTION 'A review-pending marker is not extraction evidence; run AI Fill before linking' USING ERRCODE='PT409';END IF;
 IF s.ai_result_id IS NOT NULL THEN
  SELECT * INTO ai FROM public.dms_ai_extraction_results WHERE id=s.ai_result_id AND upload_session_id=s.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Extraction result is unavailable' USING ERRCODE='PT409';END IF;
  IF ai.ai_status NOT IN ('pending_review','approved') OR NOT EXISTS(SELECT 1 FROM public.dms_ai_extraction_jobs j WHERE j.id=ai.job_id AND j.upload_session_id=s.id AND j.status='complete') THEN RAISE EXCEPTION 'Successful extraction for this upload is required' USING ERRCODE='PT409';END IF;
  IF ai.suggested_document_type_id IS NOT NULL AND ai.suggested_document_type_id<>d.document_type_id THEN RAISE EXCEPTION 'Reviewed type does not match destination' USING ERRCODE='PT409';END IF;
  IF ai.expiry_date_suggestion IS NOT NULL AND ai.expiry_date_suggestion<current_date THEN RAISE EXCEPTION 'Review the expired file before linking' USING ERRCODE='PT409';END IF;
 END IF;
 RETURN jsonb_build_object('path',s.temp_storage_path,'name',s.original_filename,'mime',s.mime_type,'size',s.file_size_bytes,'sha256',s.sha256_hash,
  'company',s.owning_company_id,'branch',s.owning_branch_id,'aiResult',s.ai_result_id);
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;
