BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE OR REPLACE FUNCTION erp_private.f07_attachment_source(p_session bigint,p_document bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.dms_upload_sessions;d public.dms_documents;intent erp_private.f07_attachment_intents;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR
  NOT erp_private.upload_session_permission(p_session,'dms.documents.upload') OR
  NOT (erp_private.document_permission(p_document,'dms.documents.upload') OR erp_private.document_permission(p_document,'dms.admin')) OR
  NOT (erp_private.document_permission(p_document,'dms.documents.edit') OR erp_private.document_permission(p_document,'dms.admin')) OR
  NOT erp_private.document_permission(p_document,'dms.documents.preview') THEN RAISE EXCEPTION 'Attachment access denied' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session AND deleted_at IS NULL;
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL;
 IF s.id IS NULL OR d.id IS NULL OR ROW(s.owning_company_id,s.owning_branch_id) IS DISTINCT FROM ROW(d.owning_company_id,d.owning_branch_id)
  OR d.is_archived OR d.status IN ('archived','superseded','deleted') THEN RAISE EXCEPTION 'Attachment scope unavailable' USING ERRCODE='42501';END IF;
 IF s.status='completed' AND s.document_id=d.id THEN
  SELECT * INTO intent FROM erp_private.f07_attachment_intents WHERE upload_session_id=s.id AND document_id=d.id AND actor_id=public.current_user_profile_id() AND receipt IS NOT NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'No matching completed attachment receipt' USING ERRCODE='PT409';END IF;
  -- A receipt replays the original result, not a new review of a closed upload.
  RETURN intent.source;
 END IF;
 IF s.expires_at<=clock_timestamp() OR s.status IN ('cancelled','expired') OR s.intake_status IN ('discarded','cancelled','expired') OR
  s.temp_cleaned_at IS NOT NULL THEN RAISE EXCEPTION 'Upload is closed or expired' USING ERRCODE='PT409';END IF;
 IF nullif(s.temp_storage_path,'') IS NULL OR s.file_size_bytes NOT BETWEEN 1 AND 52428800 THEN RAISE EXCEPTION 'Invalid upload source' USING ERRCODE='22023';END IF;
 IF s.intake_status NOT IN ('review_pending','review_in_progress') THEN RAISE EXCEPTION 'Review the uploaded file before attaching' USING ERRCODE='PT409';END IF;
 PERFORM erp_private.f07_assert_intake_review(s.id,d.document_type_id,d.expiry_date);
 RETURN jsonb_build_object('path',s.temp_storage_path,'name',s.original_filename,'mime',s.mime_type,'size',s.file_size_bytes,'sha256',s.sha256_hash,
  'company',s.owning_company_id,'branch',s.owning_branch_id,'aiResult',s.ai_result_id);
END $$;
DO $patch$
DECLARE original text;needle text;addition text;
BEGIN
 SELECT pg_get_functiondef('erp_private.ai_approval_snapshot(jsonb)'::regprocedure) INTO original;
 needle:=' analysis_id:=s.ai_result_id;';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Single review adoption requires source reconciliation';END IF;
 addition:=' PERFORM erp_private.f07_assert_intake_review(s.id,(p_request->>''documentTypeId'')::bigint,nullif(p_request->>''expiryDate'','''')::date);';
 EXECUTE replace(original,needle,addition||E'\n'||needle);
 SELECT pg_get_functiondef('public.approve_dms_ai_intake(jsonb)'::regprocedure) INTO original;
 needle:='  IF v_session.intake_status IN (''discarded'', ''cancelled'', ''expired'') THEN';
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION 'Legacy review adoption requires source reconciliation';END IF;
 addition:='  PERFORM erp_private.f07_assert_intake_review(v_upload_session_id,(p_payload->>''document_type_id'')::bigint,nullif(p_payload->>''expiry_date'','''')::date);';
 EXECUTE replace(original,needle,addition||E'\n'||needle);
END $patch$;
NOTIFY pgrst,'reload schema';
COMMIT;
