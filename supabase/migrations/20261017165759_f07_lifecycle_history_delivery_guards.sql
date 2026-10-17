-- F07-T08. No backfill, object deletion, provider or worker activation.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';

CREATE FUNCTION erp_private.f07_immutable_document_event() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'Document history is append-only' USING ERRCODE='42501';
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_immutable_document_event() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f07_immutable_document_event BEFORE UPDATE OR DELETE ON public.dms_document_events
 FOR EACH ROW EXECUTE FUNCTION erp_private.f07_immutable_document_event();

-- The old purge has no retention/legal-hold approval contract and destroys its
-- own history. Retire it, including direct DELETE bypasses. Archive/unlink are
-- reversible canonical operations; they do not authorize irreversible disposal.
CREATE OR REPLACE FUNCTION public.purge_dms_document(p_id bigint)
RETURNS TABLE(out_storage_files jsonb,out_files_found integer)
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Permanent disposal requires a separately approved retention and legal-hold process. Use Archive for routine work.' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION public.purge_dms_document(bigint) FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.f07_no_routine_purge() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN RAISE EXCEPTION 'Permanent disposal is not a routine lifecycle action' USING ERRCODE='42501'; END $$;
REVOKE ALL ON FUNCTION erp_private.f07_no_routine_purge() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f07_no_routine_purge BEFORE DELETE ON public.dms_documents FOR EACH ROW EXECUTE FUNCTION erp_private.f07_no_routine_purge();
CREATE TRIGGER f07_no_routine_file_purge BEFORE DELETE ON public.dms_document_files FOR EACH ROW EXECUTE FUNCTION erp_private.f07_no_routine_purge();
-- Row triggers do not intercept TRUNCATE. Existing service-role ALL grants
-- otherwise leave an irreversible history-disposal shortcut outside this gate.
REVOKE TRUNCATE ON public.dms_documents,public.dms_document_files,public.dms_document_versions,public.dms_document_events FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.f07_record_file_response(p_file bigint,p_binding jsonb,p_action text,p_bytes bigint,p_sha text,p_claims jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.dms_documents; f public.dms_document_files; actor bigint; eid bigint; required text; saved_claims text;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted delivery endpoint required' USING ERRCODE='42501'; END IF;
 saved_claims:=current_setting('request.jwt.claims',true);
 -- Only the trusted endpoint can attest byte preparation. It supplies verified
 -- claims, not a browser-supplied actor. Re-evaluate the original live session.
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p_claims->>'sub','session_id',p_claims->>'session_id','role','authenticated')::text,true);
 IF p_action IS NULL OR p_action NOT IN ('preview','download') OR p_bytes IS NULL OR p_bytes<0 OR p_sha IS NULL OR p_sha!~'^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'Invalid delivery receipt' USING ERRCODE='22023'; END IF;
 required:=CASE WHEN p_action='download' THEN 'dms.documents.download' ELSE 'dms.documents.preview' END;
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'File unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO f FROM public.dms_document_files WHERE id=p_file AND deleted_at IS NULL;
 IF NOT FOUND OR NOT (erp_private.document_permission(f.document_id,required) OR erp_private.document_permission(f.document_id,'dms.admin')) THEN RAISE EXCEPTION 'File unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.dms_documents WHERE id=f.document_id AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'File unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO f FROM public.dms_document_files WHERE id=p_file AND document_id=d.id AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND OR NOT (erp_private.document_permission(d.id,required) OR erp_private.document_permission(d.id,'dms.admin')) THEN RAISE EXCEPTION 'File unavailable' USING ERRCODE='42501'; END IF;
 IF p_binding IS DISTINCT FROM jsonb_build_object('id',f.id,'document_id',f.document_id,'version_id',f.version_id,
  'storage_bucket',f.storage_bucket,'storage_path',f.storage_path,'file_name',f.file_name,'mime_type',f.mime_type,
  'file_size_bytes',f.file_size_bytes,'sha256_hash',f.sha256_hash) OR
  (f.file_size_bytes IS NOT NULL AND f.file_size_bytes<>p_bytes) OR (f.sha256_hash IS NOT NULL AND lower(f.sha256_hash)<>p_sha) THEN
  RAISE EXCEPTION 'File binding or bytes changed; retry from the current record' USING ERRCODE='PT409'; END IF;
 actor:=public.current_user_profile_id();
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json)
 VALUES(d.id,CASE WHEN p_action='download' THEN 'file_download_response_prepared' ELSE 'file_preview_response_prepared' END,
  'Authenticated file response prepared; receipt does not prove client receipt, reading or saving.',actor,
  jsonb_build_object('file_id',f.id,'version_id',f.version_id,'bytes',p_bytes,'delivery','response_prepared','historical',f.version_id IS DISTINCT FROM d.current_version_id)) RETURNING id INTO eid;
 PERFORM set_config('request.jwt.claims',coalesce(saved_claims,''),true);
 RETURN jsonb_build_object('eventId',eid,'fileId',f.id,'documentId',d.id,'versionId',f.version_id);
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_record_file_response(bigint,jsonb,text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp_private.f07_record_file_response(bigint,jsonb,text,bigint,text,jsonb) TO service_role;
CREATE FUNCTION public.f07_record_file_response(p_file bigint,p_binding jsonb,p_action text,p_bytes bigint,p_sha text,p_claims jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_record_file_response($1,$2,$3,$4,$5,$6); $$;
REVOKE ALL ON FUNCTION public.f07_record_file_response(bigint,jsonb,text,bigint,text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f07_record_file_response(bigint,jsonb,text,bigint,text,jsonb) TO service_role;

CREATE FUNCTION erp_private.f07_guard_delivery_event() RETURNS trigger
LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF NEW.event_type IN ('file_download_response_prepared','file_preview_response_prepared') AND current_user IN ('anon','authenticated','service_role') THEN
  RAISE EXCEPTION 'Use the authenticated file receipt operation' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_guard_delivery_event() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f07_guard_delivery_event BEFORE INSERT ON public.dms_document_events FOR EACH ROW EXECUTE FUNCTION erp_private.f07_guard_delivery_event();
CREATE INDEX IF NOT EXISTS f07_document_event_page ON public.dms_document_events(document_id,performed_at DESC,id DESC);
NOTIFY pgrst,'reload schema';
COMMIT;
