BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE TABLE erp_private.f07_verified_temp_uploads(
 upload_session_id bigint PRIMARY KEY, source jsonb NOT NULL, actor_id bigint NOT NULL, auth_session_id uuid NOT NULL,
 object_id uuid NOT NULL, object_version text NOT NULL, object_updated_at timestamptz NOT NULL,
 sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'), verified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE erp_private.f07_verified_temp_uploads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f07_verified_temp_uploads FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.f07_temp_source(p_session bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.dms_upload_sessions;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR NOT erp_private.upload_session_permission(p_session,'dms.documents.upload') THEN RAISE EXCEPTION 'Upload access denied' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session AND deleted_at IS NULL;
 IF NOT FOUND OR (s.uploaded_by IS DISTINCT FROM public.current_user_profile_id() AND NOT erp_private.permission_in_scope('dms.admin',s.owning_company_id,s.owning_branch_id)) THEN RAISE EXCEPTION 'Upload owner unavailable' USING ERRCODE='42501';END IF;
 IF s.document_id IS NOT NULL OR s.status NOT IN ('uploading','uploaded') OR s.expires_at<=clock_timestamp() OR s.temp_cleaned_at IS NOT NULL THEN RAISE EXCEPTION 'Upload is bound, closed or expired' USING ERRCODE='PT409';END IF;
 RETURN jsonb_build_object('id',s.id,'name',s.original_filename,'mime',s.mime_type,'size',s.file_size_bytes,'sha256',s.sha256_hash,'path',s.temp_storage_path,
  'owner',s.uploaded_by,'company',s.owning_company_id,'branch',s.owning_branch_id,'expiry',s.expires_at);
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_temp_source(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_temp_source(bigint) TO authenticated;
CREATE FUNCTION public.f07_prepare_temp_upload(p_session bigint) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('source',erp_private.f07_temp_source($1),'actorId',public.current_user_profile_id(),'authSessionId',auth.jwt()->>'session_id');
$$;
REVOKE ALL ON FUNCTION public.f07_prepare_temp_upload(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f07_prepare_temp_upload(bigint) TO authenticated;
CREATE FUNCTION public.f07_attest_temp_upload(p_session bigint,p_actor bigint,p_auth_session uuid,p_source jsonb,p_object uuid,p_version text,p_updated timestamptz,p_sha256 text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.dms_upload_sessions; object storage.objects; source jsonb; old erp_private.f07_verified_temp_uploads;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT erp_private.provider_actor_session_valid(p_actor,p_auth_session) THEN RAISE EXCEPTION 'Verification session unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session AND deleted_at IS NULL FOR UPDATE;
 source:=jsonb_build_object('id',s.id,'name',s.original_filename,'mime',s.mime_type,'size',s.file_size_bytes,'sha256',s.sha256_hash,'path',s.temp_storage_path,
  'owner',s.uploaded_by,'company',s.owning_company_id,'branch',s.owning_branch_id,'expiry',s.expires_at);
 IF s.id IS NULL OR source IS DISTINCT FROM p_source OR s.document_id IS NOT NULL OR s.status NOT IN ('uploading','uploaded') OR s.expires_at<=clock_timestamp()
  OR p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$' OR (s.sha256_hash IS NOT NULL AND p_sha256 IS DISTINCT FROM lower(s.sha256_hash)) OR s.file_size_bytes NOT BETWEEN 1 AND 52428800 THEN RAISE EXCEPTION 'Verified source mismatch' USING ERRCODE='PT409';END IF;
 SELECT * INTO object FROM storage.objects WHERE bucket_id='dms-temp' AND name=s.temp_storage_path FOR SHARE;
 IF NOT FOUND OR ROW(object.id,object.version,date_trunc('milliseconds',object.updated_at)) IS DISTINCT FROM ROW(p_object,p_version,p_updated)
  OR object.version IS NULL OR (object.metadata->>'size')::bigint IS DISTINCT FROM s.file_size_bytes OR object.metadata->>'mimetype' IS DISTINCT FROM s.mime_type THEN RAISE EXCEPTION 'Storage identity changed' USING ERRCODE='PT409';END IF;
 SELECT * INTO old FROM erp_private.f07_verified_temp_uploads WHERE upload_session_id=s.id;
 IF FOUND THEN
  IF ROW(old.source,old.object_id,old.object_version,old.object_updated_at,old.sha256) IS DISTINCT FROM ROW(source,p_object,p_version,object.updated_at,p_sha256) THEN RAISE EXCEPTION 'Temporary upload proof cannot be rewritten' USING ERRCODE='PT409';END IF;
 ELSE
  INSERT INTO erp_private.f07_verified_temp_uploads(upload_session_id,source,actor_id,auth_session_id,object_id,object_version,object_updated_at,sha256)
   VALUES(s.id,source,p_actor,p_auth_session,p_object,p_version,object.updated_at,p_sha256);
 END IF;
END $$;
REVOKE ALL ON FUNCTION public.f07_attest_temp_upload(bigint,bigint,uuid,jsonb,uuid,text,timestamptz,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f07_attest_temp_upload(bigint,bigint,uuid,jsonb,uuid,text,timestamptz,text) TO service_role;
CREATE FUNCTION erp_private.f07_complete_temp_upload(p_session bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source jsonb; proof erp_private.f07_verified_temp_uploads; object storage.objects; result public.dms_upload_sessions;
BEGIN
 source:=erp_private.f07_temp_source(p_session);
 PERFORM id FROM public.dms_upload_sessions WHERE id=p_session FOR UPDATE;
 source:=erp_private.f07_temp_source(p_session);
 SELECT * INTO proof FROM erp_private.f07_verified_temp_uploads WHERE upload_session_id=p_session;
 IF NOT FOUND OR proof.source IS DISTINCT FROM source THEN RAISE EXCEPTION 'No trusted byte verification' USING ERRCODE='42501';END IF;
 SELECT * INTO object FROM storage.objects WHERE bucket_id='dms-temp' AND name=source->>'path' FOR SHARE;
 IF NOT FOUND OR ROW(object.id,object.version,object.updated_at) IS DISTINCT FROM ROW(proof.object_id,proof.object_version,proof.object_updated_at)
  OR (object.metadata->>'size')::bigint IS DISTINCT FROM (source->>'size')::bigint OR object.metadata->>'mimetype' IS DISTINCT FROM source->>'mime' THEN RAISE EXCEPTION 'Verified upload changed' USING ERRCODE='PT409';END IF;
 UPDATE public.dms_upload_sessions SET status='uploaded',updated_at=clock_timestamp() WHERE id=p_session RETURNING * INTO result;
 RETURN to_jsonb(result);
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_complete_temp_upload(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_complete_temp_upload(bigint) TO authenticated;
CREATE FUNCTION public.f07_complete_temp_upload(p_session bigint) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_complete_temp_upload($1); $$;
REVOKE ALL ON FUNCTION public.f07_complete_temp_upload(bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f07_complete_temp_upload(bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
