-- F07-T01/T02/T03: retain attachment intent across Storage/DB response loss.
-- Service role may attest verified bytes only; the caller completes business writes.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
CREATE TABLE erp_private.f07_attachment_intents(
 upload_session_id bigint PRIMARY KEY, operation_id uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
 actor_id bigint NOT NULL, auth_session_id uuid NOT NULL, document_id bigint NOT NULL,
 request jsonb NOT NULL, source jsonb NOT NULL, expected_current bigint, expected_updated timestamptz NOT NULL,
 version_number integer NOT NULL, storage_path text NOT NULL UNIQUE, created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 object_id uuid, object_version text, object_updated_at timestamptz, verified_sha256 text, verified_size bigint, file_name text,
 receipt jsonb
);
ALTER TABLE erp_private.f07_attachment_intents ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f07_attachment_intents FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.f07_attachment_source(p_session bigint,p_document bigint)
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
 IF s.ai_result_id IS NOT NULL THEN
  SELECT * INTO ai FROM public.dms_ai_extraction_results WHERE id=s.ai_result_id AND upload_session_id=s.id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Extraction result is unavailable' USING ERRCODE='PT409';END IF;
  IF ai.suggested_document_type_id IS NOT NULL AND ai.suggested_document_type_id<>d.document_type_id THEN RAISE EXCEPTION 'Reviewed type does not match destination' USING ERRCODE='PT409';END IF;
  IF ai.expiry_date_suggestion IS NOT NULL AND ai.expiry_date_suggestion<current_date THEN RAISE EXCEPTION 'Review the expired file before linking' USING ERRCODE='PT409';END IF;
 END IF;
 RETURN jsonb_build_object('path',s.temp_storage_path,'name',s.original_filename,'mime',s.mime_type,'size',s.file_size_bytes,'sha256',s.sha256_hash,
  'company',s.owning_company_id,'branch',s.owning_branch_id,'aiResult',s.ai_result_id);
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_attachment_source(bigint,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_attachment_source(bigint,bigint) TO authenticated;

CREATE FUNCTION erp_private.f07_prepare_attachment(p_session bigint,p_document bigint,p_notes text,p_label text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE intent erp_private.f07_attachment_intents; d public.dms_documents; s public.dms_upload_sessions; source jsonb; request jsonb;
 actor bigint:=public.current_user_profile_id(); number integer; operation uuid:=gen_random_uuid(); ext text; sid uuid;
BEGIN
 IF p_notes IS NOT NULL AND length(p_notes)>2000 OR p_label IS NOT NULL AND length(p_label)>100 THEN RAISE EXCEPTION 'Invalid attachment text' USING ERRCODE='22023';END IF;
 source:=erp_private.f07_attachment_source(p_session,p_document);
 sid:=(auth.jwt()->>'session_id')::uuid;
 IF NOT erp_private.provider_actor_session_valid(actor,sid) THEN RAISE EXCEPTION 'Attachment session ended' USING ERRCODE='42501';END IF;
 PERFORM id FROM public.dms_upload_sessions WHERE id=p_session FOR UPDATE;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session AND deleted_at IS NULL;
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL FOR UPDATE;
 source:=erp_private.f07_attachment_source(p_session,p_document);
 request:=jsonb_build_object('documentId',p_document,'notes',p_notes,'label',p_label);
 SELECT * INTO intent FROM erp_private.f07_attachment_intents WHERE upload_session_id=p_session FOR UPDATE;
 IF FOUND THEN
  IF intent.actor_id IS DISTINCT FROM actor OR intent.request IS DISTINCT FROM request OR intent.source IS DISTINCT FROM source THEN
   RAISE EXCEPTION 'Retained attachment belongs to another request; do not replace its identity' USING ERRCODE='PT409';END IF;
 ELSE
  IF s.document_id IS NOT NULL OR s.status='completed' OR d.approval_status='pending_approval' THEN RAISE EXCEPTION 'Upload is bound or approval is active' USING ERRCODE='PT409';END IF;
  SELECT greatest(coalesce((SELECT max(version_number) FROM public.dms_document_versions WHERE document_id=d.id),0),
   coalesce((SELECT max(version_number) FROM erp_private.f07_attachment_intents WHERE document_id=d.id),0))+1 INTO number;
  ext:=lower(substring(s.original_filename FROM '\.([A-Za-z0-9]+)$'));
  IF ext IS NULL OR ext NOT IN ('pdf','jpg','jpeg','png','tif','tiff','webp','doc','docx','xls','xlsx') THEN RAISE EXCEPTION 'Unsupported attachment type' USING ERRCODE='22023';END IF;
  INSERT INTO erp_private.f07_attachment_intents(upload_session_id,operation_id,actor_id,auth_session_id,document_id,request,source,expected_current,expected_updated,version_number,storage_path)
   VALUES(p_session,operation,actor,sid,d.id,request,source,d.current_version_id,d.updated_at,number,
    coalesce(d.owning_company_id,0)||'/'||extract(year FROM current_date)::integer||'/F07/'||d.id||'/v'||number||'/original.'||ext) RETURNING * INTO intent;
 END IF;
 RETURN jsonb_build_object('operationId',intent.operation_id,'actorId',actor,'authSessionId',sid,'documentId',d.id,'uploadSessionId',p_session,
  'versionNumber',intent.version_number,'storagePath',intent.storage_path,'source',intent.source,'receipt',intent.receipt);
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_prepare_attachment(bigint,bigint,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_prepare_attachment(bigint,bigint,text,text) TO authenticated;
CREATE FUNCTION public.f07_prepare_attachment(p_session bigint,p_document bigint,p_notes text DEFAULT NULL,p_label text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_prepare_attachment($1,$2,$3,$4); $$;
REVOKE ALL ON FUNCTION public.f07_prepare_attachment(bigint,bigint,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f07_prepare_attachment(bigint,bigint,text,text) TO authenticated;

CREATE FUNCTION public.f07_attest_attachment(p_session bigint,p_actor bigint,p_auth_session uuid,p_operation uuid,p_object uuid,p_version text,p_updated timestamptz,p_sha256 text,p_size bigint,p_file_name text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE intent erp_private.f07_attachment_intents; object storage.objects;
BEGIN
 IF auth.role() IS DISTINCT FROM 'service_role' OR NOT erp_private.provider_actor_session_valid(p_actor,p_auth_session) THEN RAISE EXCEPTION 'Verification principal unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO intent FROM erp_private.f07_attachment_intents WHERE upload_session_id=p_session FOR UPDATE;
 IF NOT FOUND OR intent.operation_id IS DISTINCT FROM p_operation OR intent.actor_id IS DISTINCT FROM p_actor THEN RAISE EXCEPTION 'Attachment intent unavailable' USING ERRCODE='42501';END IF;
 IF p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$' OR p_size IS DISTINCT FROM (intent.source->>'size')::bigint
  OR (intent.source->>'sha256' IS NOT NULL AND p_sha256 IS DISTINCT FROM lower(intent.source->>'sha256')) OR coalesce(length(p_file_name),0) NOT BETWEEN 1 AND 255 THEN
  RAISE EXCEPTION 'Verified bytes do not match source' USING ERRCODE='PT409';END IF;
 SELECT * INTO object FROM storage.objects WHERE bucket_id='dms-documents' AND name=intent.storage_path FOR SHARE;
 IF NOT FOUND OR object.id IS DISTINCT FROM p_object OR object.version IS DISTINCT FROM p_version OR date_trunc('milliseconds',object.updated_at) IS DISTINCT FROM p_updated
  OR (object.metadata->>'size')::bigint IS DISTINCT FROM p_size OR object.metadata->>'mimetype' IS DISTINCT FROM intent.source->>'mime' THEN RAISE EXCEPTION 'Storage identity changed' USING ERRCODE='PT409';END IF;
 IF intent.object_id IS NOT NULL AND ROW(intent.object_id,intent.object_version,intent.object_updated_at,intent.verified_sha256,intent.verified_size,intent.file_name)
  IS DISTINCT FROM ROW(p_object,p_version,object.updated_at,p_sha256,p_size,p_file_name) THEN RAISE EXCEPTION 'Copy attestation is immutable' USING ERRCODE='PT409';END IF;
 UPDATE erp_private.f07_attachment_intents SET object_id=p_object,object_version=p_version,object_updated_at=object.updated_at,
  verified_sha256=p_sha256,verified_size=p_size,file_name=p_file_name WHERE upload_session_id=p_session;
END $$;
REVOKE ALL ON FUNCTION public.f07_attest_attachment(bigint,bigint,uuid,uuid,uuid,text,timestamptz,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f07_attest_attachment(bigint,bigint,uuid,uuid,uuid,text,timestamptz,text,bigint,text) TO service_role;

CREATE FUNCTION erp_private.f07_finish_attachment(p_session bigint,p_document bigint,p_notes text,p_label text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE intent erp_private.f07_attachment_intents; d public.dms_documents; object storage.objects; source jsonb;
 actor bigint:=public.current_user_profile_id(); version_id bigint; file_id bigint; at_time timestamptz:=clock_timestamp(); result_receipt jsonb;
BEGIN
 source:=erp_private.f07_attachment_source(p_session,p_document);
 PERFORM id FROM public.dms_upload_sessions WHERE id=p_session FOR UPDATE;
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL FOR UPDATE;
 SELECT * INTO intent FROM erp_private.f07_attachment_intents WHERE upload_session_id=p_session FOR UPDATE;
 source:=erp_private.f07_attachment_source(p_session,p_document);
 IF intent.upload_session_id IS NULL OR intent.actor_id IS DISTINCT FROM actor OR intent.request IS DISTINCT FROM jsonb_build_object('documentId',p_document,'notes',p_notes,'label',p_label) OR intent.source IS DISTINCT FROM source THEN RAISE EXCEPTION 'Attachment request changed' USING ERRCODE='PT409';END IF;
 IF intent.receipt IS NOT NULL THEN RETURN intent.receipt||jsonb_build_object('replayed',true);END IF;
 IF ROW(d.current_version_id,d.updated_at) IS DISTINCT FROM ROW(intent.expected_current,intent.expected_updated) OR d.approval_status='pending_approval' THEN
  RAISE EXCEPTION 'Document changed during upload; retain the copy for reconciliation' USING ERRCODE='PT409';END IF;
 IF intent.object_id IS NULL THEN RAISE EXCEPTION 'No trusted copy verification' USING ERRCODE='42501';END IF;
 SELECT * INTO object FROM storage.objects WHERE bucket_id='dms-documents' AND name=intent.storage_path FOR SHARE;
 IF NOT FOUND OR ROW(object.id,object.version,object.updated_at) IS DISTINCT FROM ROW(intent.object_id,intent.object_version,intent.object_updated_at)
  OR (object.metadata->>'size')::bigint IS DISTINCT FROM intent.verified_size OR object.metadata->>'mimetype' IS DISTINCT FROM source->>'mime' THEN RAISE EXCEPTION 'Verified copy changed' USING ERRCODE='PT409';END IF;
 UPDATE public.dms_document_versions SET is_current=false WHERE document_id=d.id AND is_current;
 INSERT INTO public.dms_document_versions(document_id,version_number,version_label,change_notes,is_current,created_by,created_at)
  VALUES(d.id,intent.version_number,coalesce(p_label,'v'||intent.version_number),p_notes,true,actor,at_time) RETURNING id INTO version_id;
 INSERT INTO public.dms_document_files(document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,created_by,created_at)
  VALUES(d.id,version_id,'original','dms-documents',intent.storage_path,intent.file_name,source->>'mime',intent.verified_size,intent.verified_sha256,actor,at_time) RETURNING id INTO file_id;
 UPDATE public.dms_documents SET current_version_id=version_id,approval_status=NULL,status=CASE WHEN approval_status='approved' THEN 'draft' ELSE status END,updated_by=actor,updated_at=at_time WHERE id=d.id;
 UPDATE public.dms_upload_sessions SET document_id=d.id,status='completed',completed_at=at_time,updated_at=at_time WHERE id=p_session;
 result_receipt:=jsonb_build_object('documentId',d.id,'versionId',version_id,'fileId',file_id,'operationId',intent.operation_id,'uploadSessionId',p_session,'replayed',false);
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json) VALUES(d.id,'version_uploaded','Verified original attached atomically; prior history retained',actor,result_receipt||jsonb_build_object('previous_current_version_id',d.current_version_id));
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
  VALUES(actor,d.owning_company_id,d.owning_branch_id,'DMS','dms_documents',d.id,d.document_no,'update',result_receipt);
 UPDATE erp_private.f07_attachment_intents SET receipt=result_receipt WHERE upload_session_id=p_session;
 RETURN result_receipt;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_finish_attachment(bigint,bigint,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_finish_attachment(bigint,bigint,text,text) TO authenticated;
CREATE FUNCTION public.f07_finish_attachment(p_session bigint,p_document bigint,p_notes text DEFAULT NULL,p_label text DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_finish_attachment($1,$2,$3,$4); $$;
REVOKE ALL ON FUNCTION public.f07_finish_attachment(bigint,bigint,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f07_finish_attachment(bigint,bigint,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
