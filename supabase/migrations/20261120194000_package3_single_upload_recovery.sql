BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION erp_private.f07_resume_single_upload(p_request jsonb, p_session_code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor bigint := public.current_user_profile_id();
  original erp_private.f07_single_upload_admissions;
  receipt jsonb;
BEGIN
  IF auth.uid() IS NULL OR actor IS NULL OR NOT erp_private.business_principal_is_active() THEN
    RAISE EXCEPTION 'Original upload unavailable' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_request) IS DISTINCT FROM 'object'
     OR p_request->>'authUserId' IS DISTINCT FROM auth.uid()::text
     OR coalesce(p_request->>'operationId', '') !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
     OR coalesce(p_session_code, '') !~ '^[a-zA-Z0-9._-]{1,80}$' THEN
    RAISE EXCEPTION 'Invalid original upload request' USING ERRCODE = '22023';
  END IF;

  SELECT a.* INTO original
  FROM erp_private.f07_single_upload_admissions a
  JOIN public.dms_upload_sessions s ON s.id = a.upload_session_id
  WHERE a.actor_id = actor AND s.uploaded_by = actor AND s.session_code = p_session_code
    AND s.status IN ('uploading', 'uploaded') AND s.document_id IS NULL
    AND s.deleted_at IS NULL AND s.temp_cleaned_at IS NULL
    AND s.intake_status NOT IN ('discarded', 'approved') AND s.expires_at > clock_timestamp()
  FOR KEY SHARE OF a NOWAIT;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Original upload unavailable' USING ERRCODE = '42501';
  END IF;
  IF original.request IS DISTINCT FROM (p_request || jsonb_build_object('operationId', original.operation_id)) THEN
    RAISE EXCEPTION 'Original upload request differs' USING ERRCODE = 'PT409';
  END IF;

  -- Holding the existing binding guarantees that canonical admission takes its
  -- replay branch and rechecks the current subject, company, branch and actor.
  receipt := erp_private.f07_admit_single_upload(original.request);
  IF receipt#>>'{session,id}' IS DISTINCT FROM original.upload_session_id::text
     OR receipt#>>'{session,session_code}' IS DISTINCT FROM p_session_code
     OR receipt#>>'{session,status}' NOT IN ('uploading', 'uploaded')
     OR receipt#>'{session,document_id}' IS DISTINCT FROM 'null'::jsonb
     OR receipt#>'{session,temp_cleaned_at}' IS DISTINCT FROM 'null'::jsonb
     OR receipt#>>'{session,intake_status}' IN ('discarded', 'approved') THEN
    RAISE EXCEPTION 'Original upload unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_request->>'operationId' <> original.operation_id::text THEN
    RETURN jsonb_build_object('recovery', original.request);
  END IF;
  RETURN receipt;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_resume_single_upload(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_resume_single_upload(jsonb,text) TO authenticated;

CREATE FUNCTION public.f07_resume_single_upload(p_request jsonb, p_session_code text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT erp_private.f07_resume_single_upload($1, $2);
$$;
REVOKE ALL ON FUNCTION public.f07_resume_single_upload(jsonb,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.f07_resume_single_upload(jsonb,text) TO authenticated;

-- The duplicate advisory itself remains an invoker. Its only new private
-- lookup confirms that the caller can resume an existing single admission.
CREATE FUNCTION erp_private.f07_single_transfer_resumable(p_session bigint)
RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND erp_private.business_principal_is_active()
    AND EXISTS (
      SELECT 1 FROM erp_private.f07_single_upload_admissions a
      WHERE a.upload_session_id = p_session AND a.actor_id = public.current_user_profile_id()
    )
    AND (erp_private.upload_session_permission(p_session, 'dms.documents.upload')
      OR erp_private.upload_session_permission(p_session, 'dms.admin'));
$$;
REVOKE ALL ON FUNCTION erp_private.f07_single_transfer_resumable(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_single_transfer_resumable(bigint) TO authenticated;

CREATE OR REPLACE FUNCTION public.ai_mod04_duplicate_advisory(p_sha256 text, p_size bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE found_document record; own_session record;
BEGIN
  IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  IF p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$' OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 52428800 THEN
    RAISE EXCEPTION 'Invalid file fingerprint' USING ERRCODE = '22023';
  END IF;
  SELECT d.id, d.document_no, d.title INTO found_document
  FROM public.dms_document_files f JOIN public.dms_documents d ON d.id = f.document_id
  WHERE f.sha256_hash = p_sha256 AND f.file_size_bytes = p_size AND f.deleted_at IS NULL
    AND d.deleted_at IS NULL AND erp_private.document_permission(d.id, 'dms.documents.view')
  ORDER BY d.id LIMIT 1;
  IF FOUND THEN
    RETURN jsonb_build_object('status', 'existing_document', 'authoritative', false, 'documentId', found_document.id,
      'documentNo', found_document.document_no, 'title', found_document.title);
  END IF;

  SELECT s.id, s.session_code, s.status INTO own_session
  FROM public.dms_upload_sessions s
  WHERE s.uploaded_by = public.current_user_profile_id() AND s.sha256_hash = p_sha256 AND s.file_size_bytes = p_size
    AND s.deleted_at IS NULL AND s.document_id IS NULL AND s.expires_at > clock_timestamp()
    AND s.status NOT IN ('cancelled', 'expired', 'discarded', 'failed', 'completed')
    AND coalesce(s.intake_status, 'uploaded') NOT IN ('discarded', 'approved') AND s.temp_cleaned_at IS NULL
  ORDER BY s.id LIMIT 1;
  IF FOUND THEN
    IF own_session.status = 'uploading' THEN
      RETURN jsonb_build_object('status', 'transfer_pending', 'authoritative', false, 'sessionCode', own_session.session_code,
        'resumable', coalesce(erp_private.f07_single_transfer_resumable(own_session.id), false));
    END IF;
    RETURN jsonb_build_object('status', 'retained_upload', 'authoritative', false, 'sessionCode', own_session.session_code);
  END IF;
  RETURN jsonb_build_object('status', 'no_visible_match', 'authoritative', false);
END $$;
NOTIFY pgrst, 'reload schema';
COMMIT;
