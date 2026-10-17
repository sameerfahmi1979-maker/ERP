-- Stable caller operation for single uploads. No Storage, numbering, provider or
-- historical-data operation occurs inside this transaction.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s';
CREATE TABLE erp_private.f07_single_upload_admissions(
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 operation_id uuid NOT NULL,
 request jsonb NOT NULL,
 upload_session_id bigint NOT NULL UNIQUE REFERENCES public.dms_upload_sessions(id),
 acknowledged_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor_id,operation_id)
);
ALTER TABLE erp_private.f07_single_upload_admissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f07_single_upload_admissions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.f07_protect_single_upload_binding() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM erp_private.f07_single_upload_admissions WHERE upload_session_id=OLD.id) AND
  (ROW(NEW.uploaded_by,NEW.owning_company_id,NEW.owning_branch_id,NEW.session_code,NEW.temp_storage_path,
   NEW.original_filename,NEW.mime_type,NEW.file_size_bytes,NEW.sha256_hash,NEW.origin_entity_type,NEW.origin_entity_id)
   IS DISTINCT FROM ROW(OLD.uploaded_by,OLD.owning_company_id,OLD.owning_branch_id,OLD.session_code,OLD.temp_storage_path,
   OLD.original_filename,OLD.mime_type,OLD.file_size_bytes,OLD.sha256_hash,OLD.origin_entity_type,OLD.origin_entity_id)
   OR NEW.expires_at IS NULL OR NEW.expires_at>OLD.expires_at) THEN
  RAISE EXCEPTION 'Retained admission source is immutable' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_protect_single_upload_binding() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f07_protect_single_upload_binding BEFORE UPDATE ON public.dms_upload_sessions
 FOR EACH ROW EXECUTE FUNCTION erp_private.f07_protect_single_upload_binding();

CREATE OR REPLACE FUNCTION erp_private.f07_admit_single_upload(p_request jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id(); operation uuid; old erp_private.f07_single_upload_admissions;
 s public.dms_upload_sessions; company bigint; branch bigint; metadata jsonb; context jsonb;
 filename text; mime text; hash text; bytes bigint; leaf text; code text; expected_mime text;
BEGIN
 IF auth.uid() IS NULL OR actor IS NULL OR NOT erp_private.business_principal_is_active() THEN
  RAISE EXCEPTION 'Upload access unavailable' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_request) IS DISTINCT FROM 'object' OR
  p_request-ARRAY['version','operationId','authUserId','metadata','context']::text[]<>'{}'::jsonb OR
  p_request->'version' IS DISTINCT FROM '1'::jsonb OR
  p_request->>'authUserId' IS DISTINCT FROM auth.uid()::text OR
  coalesce(p_request->>'operationId','')!~'^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' THEN
  RAISE EXCEPTION 'Invalid retained upload request' USING ERRCODE='22023'; END IF;
 operation:=(p_request->>'operationId')::uuid; metadata:=p_request->'metadata'; context:=p_request->'context';
 IF jsonb_typeof(metadata) IS DISTINCT FROM 'object' OR
  metadata-ARRAY['original_filename','mime_type','file_size_bytes','sha256_hash']::text[]<>'{}'::jsonb OR
  jsonb_typeof(metadata->'original_filename') IS DISTINCT FROM 'string' OR
  jsonb_typeof(metadata->'mime_type') IS DISTINCT FROM 'string' OR
  jsonb_typeof(metadata->'sha256_hash') IS DISTINCT FROM 'string' OR
  jsonb_typeof(metadata->'file_size_bytes') IS DISTINCT FROM 'number' OR
  coalesce(metadata->>'file_size_bytes','')!~'^[0-9]{1,8}$' THEN
  RAISE EXCEPTION 'Invalid file metadata' USING ERRCODE='22023'; END IF;
 filename:=metadata->>'original_filename'; mime:=metadata->>'mime_type'; hash:=metadata->>'sha256_hash'; bytes:=(metadata->>'file_size_bytes')::bigint;
 expected_mime:=CASE lower(substring(filename FROM '\.([^.]+)$'))
  WHEN 'pdf' THEN 'application/pdf' WHEN 'jpg' THEN 'image/jpeg' WHEN 'jpeg' THEN 'image/jpeg'
  WHEN 'png' THEN 'image/png' WHEN 'tif' THEN 'image/tiff' WHEN 'tiff' THEN 'image/tiff' WHEN 'webp' THEN 'image/webp'
  WHEN 'doc' THEN 'application/msword' WHEN 'xls' THEN 'application/vnd.ms-excel'
  WHEN 'docx' THEN 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  WHEN 'xlsx' THEN 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' END;
 IF length(filename) NOT BETWEEN 1 AND 500 OR filename~'[[:cntrl:]]' OR bytes NOT BETWEEN 1 AND 52428800 OR
  hash!~'^[0-9a-f]{64}$' OR expected_mime IS NULL OR mime IS DISTINCT FROM expected_mime THEN
  RAISE EXCEPTION 'Invalid file metadata' USING ERRCODE='22023'; END IF;
 IF context IS NOT DISTINCT FROM 'null'::jsonb THEN
  SELECT owner_company_id,branch_id INTO company,branch FROM public.user_profiles WHERE id=actor AND status='active' FOR SHARE NOWAIT;
 ELSE
  IF jsonb_typeof(context) IS DISTINCT FROM 'object' OR context-ARRAY['entityType','entityId']::text[]<>'{}'::jsonb OR
   jsonb_typeof(context->'entityId') IS DISTINCT FROM 'number' OR coalesce(context->>'entityId','')!~'^[0-9]{1,16}$' OR
   (context->>'entityId')::numeric NOT BETWEEN 1 AND 9007199254740991 THEN
   RAISE EXCEPTION 'Invalid upload subject' USING ERRCODE='22023'; END IF;
  SELECT o.company,o.branch INTO company,branch FROM erp_private.f07_upload_origin_scope(context->>'entityType',(context->>'entityId')::bigint) o;
 END IF;
 IF company IS NULL OR NOT (erp_private.permission_in_scope('dms.documents.upload',company,branch) OR erp_private.permission_in_scope('dms.admin',company,branch)) THEN
  RAISE EXCEPTION 'Upload scope unavailable' USING ERRCODE='42501'; END IF;
 IF NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('f07-single-source:'||actor::text||':'||(metadata::text)||':'||(context::text),0)) OR
  NOT pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtextextended('f07-single:'||actor::text||':'||operation::text,0)) THEN
  RAISE EXCEPTION 'Admission in progress; retry the same request' USING ERRCODE='55P03'; END IF;
 SELECT * INTO old FROM erp_private.f07_single_upload_admissions WHERE actor_id=actor AND operation_id=operation;
 IF FOUND THEN
  IF old.request IS DISTINCT FROM p_request THEN RAISE EXCEPTION 'Retained upload request differs' USING ERRCODE='PT409'; END IF;
  SELECT * INTO s FROM public.dms_upload_sessions WHERE id=old.upload_session_id FOR SHARE NOWAIT;
  IF s.deleted_at IS NULL AND s.uploaded_by=actor AND s.status='cancelled' AND s.intake_status='discarded' AND
   EXISTS(SELECT 1 FROM erp_private.f07_intake_discard_receipts r WHERE r.upload_session_id=s.id AND r.actor_id=actor AND r.document_id IS NOT DISTINCT FROM s.document_id) AND
   (erp_private.upload_session_permission(s.id,'dms.documents.upload') OR erp_private.upload_session_permission(s.id,'dms.admin')) THEN
   RETURN jsonb_build_object('cancelled',jsonb_build_object('operationId',operation,'sessionId',s.id,'retained',true));
  END IF;
  IF s.id IS NULL OR s.deleted_at IS NOT NULL OR s.expires_at<=clock_timestamp() OR s.expires_at IS NULL OR
   s.status='cancelled' OR s.intake_status='discarded' OR s.uploaded_by IS DISTINCT FROM actor OR
   ROW(s.owning_company_id,s.owning_branch_id) IS DISTINCT FROM ROW(company,branch) OR
   ROW(s.original_filename,s.mime_type,s.file_size_bytes,s.sha256_hash) IS DISTINCT FROM ROW(filename,mime,bytes,hash) OR
   NOT (erp_private.upload_session_permission(s.id,'dms.documents.upload') OR erp_private.upload_session_permission(s.id,'dms.admin')) THEN
   RAISE EXCEPTION 'Retained upload unavailable; do not create a replacement' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('operationId',operation,'authUserId',auth.uid(),'session',to_jsonb(s),'replayed',true);
 END IF;
 -- A reload destroys in-memory drafts by design. Recover an unacknowledged
 -- exact original admission instead of allocating another unknown upload.
 SELECT a.* INTO old FROM erp_private.f07_single_upload_admissions a JOIN public.dms_upload_sessions u ON u.id=a.upload_session_id
  WHERE a.actor_id=actor AND a.acknowledged_at IS NULL AND a.request->'metadata'=metadata AND a.request->'context'=context
   AND u.deleted_at IS NULL AND u.expires_at>clock_timestamp() AND u.status<>'cancelled' AND u.intake_status<>'discarded'
  ORDER BY a.created_at LIMIT 1;
 IF FOUND THEN
  IF NOT (erp_private.upload_session_permission(old.upload_session_id,'dms.documents.upload') OR erp_private.upload_session_permission(old.upload_session_id,'dms.admin')) THEN
   RAISE EXCEPTION 'Original upload access unavailable' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('recovery',old.request);
 END IF;
 code:=upper(replace(pg_catalog.gen_random_uuid()::text,'-',''));
 leaf:=left(regexp_replace(regexp_replace(filename,'[^a-zA-Z0-9._-]','_','g'),'_{2,}','_','g'),200);
 INSERT INTO public.dms_upload_sessions(session_code,status,original_filename,mime_type,file_size_bytes,sha256_hash,temp_storage_path,
  uploaded_by,uploaded_at,expires_at,origin_entity_type,origin_entity_id)
 VALUES(code,'uploading',filename,mime,bytes,hash,'sessions/'||code||'/'||leaf,actor,clock_timestamp(),clock_timestamp()+interval '14 days',
  context->>'entityType',(context->>'entityId')::bigint) RETURNING * INTO s;
 INSERT INTO erp_private.f07_single_upload_admissions(actor_id,operation_id,request,upload_session_id) VALUES(actor,operation,p_request,s.id);
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
  VALUES(actor,company,branch,'DMS','dms_upload_sessions',s.id,s.session_code,'create',jsonb_build_object('operationId',operation,'retained',true));
 IF NOT erp_private.business_principal_is_active() OR public.current_user_profile_id() IS DISTINCT FROM actor OR
  NOT (erp_private.upload_session_permission(s.id,'dms.documents.upload') OR erp_private.upload_session_permission(s.id,'dms.admin')) THEN
  RAISE EXCEPTION 'Upload authority changed' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('operationId',operation,'authUserId',auth.uid(),'session',to_jsonb(s),'replayed',false);
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_admit_single_upload(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_admit_single_upload(jsonb) TO authenticated;
CREATE FUNCTION public.f07_admit_single_upload(p_request jsonb) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_admit_single_upload($1); $$;
REVOKE ALL ON FUNCTION public.f07_admit_single_upload(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f07_admit_single_upload(jsonb) TO authenticated;

CREATE FUNCTION erp_private.f07_acknowledge_single_upload(p_request jsonb,p_session bigint) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE original erp_private.f07_single_upload_admissions; actor bigint:=public.current_user_profile_id();
BEGIN
 IF auth.uid() IS NULL OR actor IS NULL OR NOT erp_private.business_principal_is_active() OR
  p_request->>'authUserId' IS DISTINCT FROM auth.uid()::text THEN RAISE EXCEPTION 'Upload owner unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO original FROM erp_private.f07_single_upload_admissions
  WHERE actor_id=actor AND operation_id=(p_request->>'operationId')::uuid FOR UPDATE NOWAIT;
 IF NOT FOUND OR original.request IS DISTINCT FROM p_request OR original.upload_session_id IS DISTINCT FROM p_session THEN
  RAISE EXCEPTION 'Upload acknowledgment differs' USING ERRCODE='PT409'; END IF;
 -- Original caller, exact source and current actual Storage proof are rechecked
 -- by the existing completion transaction; this does not invent a byte marker.
 PERFORM erp_private.f07_complete_temp_upload(p_session);
 UPDATE erp_private.f07_single_upload_admissions SET acknowledged_at=coalesce(acknowledged_at,clock_timestamp())
  WHERE actor_id=actor AND operation_id=original.operation_id;
 RETURN jsonb_build_object('operationId',original.operation_id,'sessionId',p_session,'acknowledged',true);
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_acknowledge_single_upload(jsonb,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_acknowledge_single_upload(jsonb,bigint) TO authenticated;
CREATE FUNCTION public.f07_acknowledge_single_upload(p_request jsonb,p_session bigint) RETURNS jsonb
 LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_acknowledge_single_upload($1,$2); $$;
REVOKE ALL ON FUNCTION public.f07_acknowledge_single_upload(jsonb,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f07_acknowledge_single_upload(jsonb,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
