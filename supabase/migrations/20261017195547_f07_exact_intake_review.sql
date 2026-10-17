BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE TABLE erp_private.f07_intake_sources(
 upload_session_id bigint PRIMARY KEY REFERENCES public.dms_upload_sessions(id),source jsonb NOT NULL,
 object_id uuid NOT NULL,object_version text NOT NULL,object_updated_at timestamptz NOT NULL,
 sha256 text NOT NULL CHECK(sha256~'^[a-f0-9]{64}$'),actor_id bigint NOT NULL,auth_session_id uuid NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE erp_private.f07_intake_analyses(
 result_id bigint PRIMARY KEY REFERENCES public.dms_ai_extraction_results(id),upload_session_id bigint NOT NULL,
 job_id bigint NOT NULL,analysis_digest text NOT NULL,source_sha256 text NOT NULL,
 object_id uuid NOT NULL,object_version text NOT NULL,object_updated_at timestamptz NOT NULL,
 actor_id bigint NOT NULL,attested_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE TABLE erp_private.f07_intake_reviews(
 upload_session_id bigint NOT NULL,actor_id bigint NOT NULL,review_hash text NOT NULL,fingerprint text NOT NULL,
 document_type_id bigint NOT NULL,expiry_date date,review_mode text NOT NULL CHECK(review_mode IN ('verified','manual_override')),
 reason text,analysis_result_id bigint,source_sha256 text NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(upload_session_id,actor_id,review_hash)
);
ALTER TABLE erp_private.f07_intake_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.f07_intake_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.f07_intake_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f07_intake_sources,erp_private.f07_intake_analyses,erp_private.f07_intake_reviews FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.f07_intake_source_row(s public.dms_upload_sessions) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('id',s.id,'name',s.original_filename,'mime',s.mime_type,'size',s.file_size_bytes,'sha256',s.sha256_hash,
  'path',s.temp_storage_path,'owner',s.uploaded_by,'company',s.owning_company_id,'branch',s.owning_branch_id,'expiry',s.expires_at)
$$;
CREATE FUNCTION erp_private.f07_intake_source(p_session bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.dms_upload_sessions;b public.dms_upload_batches;subject_type text;subject_id bigint;subject_scope record;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR NOT erp_private.upload_session_permission(p_session,'dms.documents.upload') THEN
  RAISE EXCEPTION 'Upload access denied' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session AND deleted_at IS NULL;
 IF NOT (erp_private.permission_in_scope('dms.documents.review_ai',s.owning_company_id,s.owning_branch_id) OR erp_private.permission_in_scope('dms.admin',s.owning_company_id,s.owning_branch_id)) OR
  NOT (erp_private.permission_in_scope('dms.documents.preview',s.owning_company_id,s.owning_branch_id) OR erp_private.permission_in_scope('dms.admin',s.owning_company_id,s.owning_branch_id)) THEN
  RAISE EXCEPTION 'Scoped upload, preview and AI review are required' USING ERRCODE='42501';END IF;
 IF NOT FOUND OR (s.uploaded_by IS DISTINCT FROM public.current_user_profile_id() AND NOT
  (erp_private.permission_in_scope('dms.admin',s.owning_company_id,s.owning_branch_id) OR erp_private.permission_in_scope('dms.documents.review_ai',s.owning_company_id,s.owning_branch_id))) THEN
  RAISE EXCEPTION 'Upload owner unavailable' USING ERRCODE='42501';END IF;
 IF s.expires_at<=clock_timestamp() OR s.temp_cleaned_at IS NOT NULL OR s.status IN ('completed','cancelled','expired') OR
  s.intake_status IN ('approved','discarded','cancelled','expired') THEN RAISE EXCEPTION 'Intake is closed or expired' USING ERRCODE='PT409';END IF;
 IF s.file_size_bytes NOT BETWEEN 1 AND 52428800 OR nullif(s.temp_storage_path,'') IS NULL THEN RAISE EXCEPTION 'Invalid upload source' USING ERRCODE='22023';END IF;
 subject_type:=s.origin_entity_type;subject_id:=s.origin_entity_id;
 IF subject_type IS NULL AND s.batch_id IS NOT NULL THEN
  SELECT * INTO b FROM public.dms_upload_batches WHERE id=s.batch_id AND deleted_at IS NULL;
  IF NOT FOUND OR ROW(b.owning_company_id,b.owning_branch_id) IS DISTINCT FROM ROW(s.owning_company_id,s.owning_branch_id) THEN
   RAISE EXCEPTION 'Original batch scope unavailable' USING ERRCODE='42501';END IF;
  subject_type:=b.entity_type;subject_id:=b.entity_id;
 END IF;
 IF subject_type='party' AND s.origin_entity_type IS NULL THEN
  -- F06 Party batches intentionally pin a null branch; never replace their
  -- original scope with the reviewer's current profile-company fallback.
  IF NOT (public.current_user_has_permission('master_data.parties.view') OR public.current_user_has_permission('master_data.party_master.view') OR public.current_user_is_global_admin()) THEN
   RAISE EXCEPTION 'Original Party subject permission required' USING ERRCODE='42501';END IF;
  PERFORM id FROM public.parties WHERE id=subject_id AND is_active AND NOT is_locked FOR SHARE NOWAIT;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original Party subject unavailable' USING ERRCODE='42501';END IF;
 ELSIF subject_type IS NOT NULL THEN
  SELECT * INTO subject_scope FROM erp_private.f07_upload_origin_scope(subject_type,subject_id);
  IF ROW(subject_scope.company,subject_scope.branch) IS DISTINCT FROM ROW(s.owning_company_id,s.owning_branch_id) THEN
   RAISE EXCEPTION 'Original subject moved; retain the intake for reconciliation' USING ERRCODE='PT409';END IF;
 END IF;
 RETURN erp_private.f07_intake_source_row(s);
END $$;
CREATE FUNCTION public.f07_prepare_intake_source(p_session bigint) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
 SELECT jsonb_build_object('source',erp_private.f07_intake_source(p_session),'actorId',public.current_user_profile_id(),'authSessionId',auth.jwt()->>'session_id')
$$;
CREATE FUNCTION public.f07_attest_intake_source(p_session bigint,p_actor bigint,p_auth_session uuid,p_source jsonb,
 p_object uuid,p_version text,p_updated timestamptz,p_sha256 text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.dms_upload_sessions; o storage.objects; proof erp_private.f07_intake_sources;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' OR NOT erp_private.provider_actor_session_valid(p_actor,p_auth_session) OR
  NOT EXISTS(SELECT 1 FROM public.user_profiles WHERE id=p_actor AND status='active' AND NOT must_change_password) THEN
  RAISE EXCEPTION 'Verification session unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR erp_private.f07_intake_source_row(s) IS DISTINCT FROM p_source OR s.expires_at<=clock_timestamp() OR s.temp_cleaned_at IS NOT NULL OR
  s.status IN ('completed','cancelled','expired') OR s.intake_status IN ('approved','discarded','cancelled','expired') OR
  p_sha256 IS NULL OR p_sha256!~'^[a-f0-9]{64}$' OR (s.sha256_hash IS NOT NULL AND lower(s.sha256_hash)<>p_sha256) THEN
  RAISE EXCEPTION 'Verified source mismatch' USING ERRCODE='PT409';END IF;
 SELECT * INTO o FROM storage.objects WHERE bucket_id='dms-temp' AND name=s.temp_storage_path FOR SHARE;
 IF NOT FOUND OR ROW(o.id,o.version,date_trunc('milliseconds',o.updated_at)) IS DISTINCT FROM ROW(p_object,p_version,p_updated) OR
  o.version IS NULL OR (o.metadata->>'size')::bigint IS DISTINCT FROM s.file_size_bytes OR o.metadata->>'mimetype' IS DISTINCT FROM s.mime_type THEN
  RAISE EXCEPTION 'Verified object changed' USING ERRCODE='PT409';END IF;
 SELECT * INTO proof FROM erp_private.f07_intake_sources WHERE upload_session_id=s.id;
 IF FOUND THEN
  IF ROW(proof.source,proof.object_id,proof.object_version,proof.object_updated_at,proof.sha256) IS DISTINCT FROM ROW(p_source,p_object,p_version,o.updated_at,p_sha256) THEN
   RAISE EXCEPTION 'Verified intake source cannot be rewritten; retain the original upload' USING ERRCODE='PT409';END IF;
 ELSE
  INSERT INTO erp_private.f07_intake_sources(upload_session_id,source,object_id,object_version,object_updated_at,sha256,actor_id,auth_session_id)
   VALUES(s.id,p_source,p_object,p_version,o.updated_at,p_sha256,p_actor,p_auth_session);
 END IF;
END $$;

CREATE FUNCTION erp_private.f07_intake_analysis_digest(a public.dms_ai_extraction_results) RETURNS text
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT encode(sha256(convert_to((to_jsonb(a)-ARRAY['created_at','updated_at','document_id','ai_status','review_action','reviewed_by','reviewed_at'])::text,'UTF8')),'hex')
$$;
CREATE FUNCTION public.f07_attest_intake_analysis(p_session bigint,p_actor bigint,p_auth_session uuid,p_result bigint,p_expected jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s public.dms_upload_sessions; a public.dms_ai_extraction_results;j public.dms_ai_extraction_jobs;
 proof erp_private.f07_intake_sources;o storage.objects;old erp_private.f07_intake_analyses;h text;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' OR NOT erp_private.provider_actor_session_valid(p_actor,p_auth_session) THEN RAISE EXCEPTION 'Analysis session unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session AND deleted_at IS NULL FOR UPDATE;
 SELECT * INTO proof FROM erp_private.f07_intake_sources WHERE upload_session_id=p_session;
 IF s.id IS NULL OR proof.upload_session_id IS NULL OR proof.source IS DISTINCT FROM erp_private.f07_intake_source_row(s) OR
  s.expires_at<=clock_timestamp() OR s.temp_cleaned_at IS NOT NULL OR s.status IN ('completed','cancelled','expired') THEN RAISE EXCEPTION 'Verified analysis source unavailable' USING ERRCODE='PT409';END IF;
 SELECT * INTO o FROM storage.objects WHERE bucket_id='dms-temp' AND name=s.temp_storage_path FOR SHARE;
 IF o.id IS NULL OR ROW(o.id,o.version,o.updated_at) IS DISTINCT FROM ROW(proof.object_id,proof.object_version,proof.object_updated_at) THEN RAISE EXCEPTION 'Analysis file changed' USING ERRCODE='PT409';END IF;
 SELECT * INTO a FROM public.dms_ai_extraction_results WHERE id=p_result AND upload_session_id=s.id FOR SHARE;
 SELECT * INTO j FROM public.dms_ai_extraction_jobs WHERE id=a.job_id AND upload_session_id=s.id FOR SHARE;
 IF a.id IS NULL OR j.id IS NULL OR j.created_by IS DISTINCT FROM p_actor OR j.status<>'complete' OR a.ai_status<>'pending_review' OR
  jsonb_typeof(p_expected) IS DISTINCT FROM 'object' OR NOT p_expected ?& ARRAY['job_id','upload_session_id','result_type','suggested_document_type_id',
   'classification_confidence','classification_score','classification_reason','extracted_fields_json','field_confidence_json','suggested_links_json',
   'issue_date_suggestion','expiry_date_suggestion','suggested_title','suggested_description','raw_response_json','raw_ocr_text'] OR
  NOT to_jsonb(a) @> p_expected THEN RAISE EXCEPTION 'Trusted provider result does not match the stored analysis' USING ERRCODE='PT409';END IF;
 h:=erp_private.f07_intake_analysis_digest(a);
 SELECT * INTO old FROM erp_private.f07_intake_analyses WHERE result_id=a.id;
 IF FOUND THEN
  IF ROW(old.upload_session_id,old.job_id,old.analysis_digest,old.source_sha256,old.object_id,old.object_version,old.object_updated_at) IS DISTINCT FROM
   ROW(s.id,j.id,h,proof.sha256,proof.object_id,proof.object_version,proof.object_updated_at) THEN RAISE EXCEPTION 'Analysis proof cannot be rewritten' USING ERRCODE='PT409';END IF;
 ELSE
  INSERT INTO erp_private.f07_intake_analyses(result_id,upload_session_id,job_id,analysis_digest,source_sha256,object_id,object_version,object_updated_at,actor_id)
   VALUES(a.id,s.id,j.id,h,proof.sha256,proof.object_id,proof.object_version,proof.object_updated_at,p_actor);
 END IF;
END $$;

-- Capture complete grant edges before waits; never borrow a newly attached
-- permission from a different/uncaptured assignment after a revocation race.
CREATE FUNCTION erp_private.f07_lock_intake_review_authority(p_session bigint) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id();witnesses jsonb;row_id record;s public.dms_upload_sessions;
 upload_allowed boolean;review_allowed boolean;preview_allowed boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Review principal unavailable' USING ERRCODE='42501';END IF;
 PERFORM id FROM public.user_profiles WHERE id=actor FOR SHARE;
 SELECT coalesce(jsonb_agg(to_jsonb(w)),'[]'::jsonb) INTO witnesses FROM (
  SELECT ur.id assignment,r.id role,rp.id pair,p.id permission FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
  LEFT JOIN public.role_permissions rp ON rp.role_id=r.id LEFT JOIN public.permissions p ON p.id=rp.permission_id WHERE ur.user_profile_id=actor
 ) w;
 FOR row_id IN SELECT DISTINCT (value->>'assignment')::bigint id FROM jsonb_array_elements(witnesses) ORDER BY id LOOP PERFORM 1 FROM public.user_roles WHERE id=row_id.id FOR SHARE;END LOOP;
 FOR row_id IN SELECT DISTINCT (value->>'role')::bigint id FROM jsonb_array_elements(witnesses) ORDER BY id LOOP PERFORM 1 FROM public.roles WHERE id=row_id.id FOR SHARE;END LOOP;
 FOR row_id IN SELECT DISTINCT (value->>'pair')::bigint id FROM jsonb_array_elements(witnesses) WHERE value->>'pair' IS NOT NULL ORDER BY id LOOP PERFORM 1 FROM public.role_permissions WHERE id=row_id.id FOR SHARE;END LOOP;
 FOR row_id IN SELECT DISTINCT (value->>'permission')::bigint id FROM jsonb_array_elements(witnesses) WHERE value->>'permission' IS NOT NULL ORDER BY id LOOP PERFORM 1 FROM public.permissions WHERE id=row_id.id FOR SHARE;END LOOP;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session AND deleted_at IS NULL;
 IF s.id IS NULL OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Review source unavailable' USING ERRCODE='42501';END IF;
 SELECT coalesce(bool_or(global_admin OR scoped AND p.permission_code IN ('dms.documents.upload','dms.admin')),false),
  coalesce(bool_or(global_admin OR scoped AND p.permission_code IN ('dms.documents.review_ai','dms.admin')),false),
  coalesce(bool_or(global_admin OR scoped AND p.permission_code IN ('dms.documents.preview','dms.admin')),false)
 INTO upload_allowed,review_allowed,preview_allowed
 FROM jsonb_array_elements(witnesses) w
 JOIN public.user_roles ur ON ur.id=(w.value->>'assignment')::bigint AND ur.user_profile_id=actor AND ur.is_active
 JOIN public.roles r ON r.id=(w.value->>'role')::bigint AND r.id=ur.role_id AND r.is_active
 LEFT JOIN public.role_permissions rp ON rp.id=(w.value->>'pair')::bigint AND rp.role_id=r.id
 LEFT JOIN public.permissions p ON p.id=(w.value->>'permission')::bigint AND p.id=rp.permission_id AND p.is_active
 CROSS JOIN LATERAL(SELECT r.role_code IN ('system_admin','group_admin') AND ur.owner_company_id IS NULL AND ur.branch_id IS NULL AS global_admin,
  (ur.owner_company_id IS NULL AND ur.branch_id IS NULL OR ur.owner_company_id=s.owning_company_id AND (ur.branch_id IS NULL OR ur.branch_id=s.owning_branch_id)) AS scoped) scope;
 IF NOT upload_allowed OR NOT review_allowed OR NOT preview_allowed THEN RAISE EXCEPTION 'Current scoped upload, preview and review grants are required' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION erp_private.f07_lock_intake_review_authority(bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.f07_intake_review_snapshot(p_session bigint,p_type bigint,p_expiry date) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE source jsonb;s public.dms_upload_sessions;proof erp_private.f07_intake_sources;o storage.objects;
 a public.dms_ai_extraction_results;ev erp_private.f07_intake_analyses;trusted boolean:=false;h text;reason text;token text;
BEGIN
 PERFORM erp_private.f07_lock_intake_review_authority(p_session);
 source:=erp_private.f07_intake_source(p_session);
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session FOR UPDATE;
 source:=erp_private.f07_intake_source(p_session);
 IF NOT (erp_private.permission_in_scope('dms.documents.review_ai',s.owning_company_id,s.owning_branch_id) OR erp_private.permission_in_scope('dms.admin',s.owning_company_id,s.owning_branch_id)) THEN RAISE EXCEPTION 'Scoped review permission required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dms_document_types WHERE id=p_type AND is_active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Review type unavailable' USING ERRCODE='22023';END IF;
 SELECT * INTO proof FROM erp_private.f07_intake_sources WHERE upload_session_id=s.id;
 SELECT * INTO o FROM storage.objects WHERE bucket_id='dms-temp' AND name=s.temp_storage_path FOR SHARE;
 IF proof.upload_session_id IS NULL OR proof.source IS DISTINCT FROM source OR o.id IS NULL OR ROW(o.id,o.version,o.updated_at) IS DISTINCT FROM ROW(proof.object_id,proof.object_version,proof.object_updated_at)
  OR (o.metadata->>'size')::bigint IS DISTINCT FROM s.file_size_bytes OR o.metadata->>'mimetype' IS DISTINCT FROM s.mime_type THEN RAISE EXCEPTION 'Verify the exact original bytes before review' USING ERRCODE='PT409';END IF;
 SELECT * INTO a FROM public.dms_ai_extraction_results WHERE id=s.ai_result_id AND upload_session_id=s.id FOR SHARE;
 SELECT * INTO ev FROM erp_private.f07_intake_analyses WHERE result_id=a.id;
 IF a.id IS NOT NULL THEN h:=erp_private.f07_intake_analysis_digest(a);END IF;
 trusted:=a.id IS NOT NULL AND ev.result_id IS NOT NULL AND a.ai_status IN ('pending_review','approved') AND
  ev.analysis_digest=h AND ROW(ev.source_sha256,ev.object_id,ev.object_version,ev.object_updated_at) IS NOT DISTINCT FROM
   ROW(proof.sha256,proof.object_id,proof.object_version,proof.object_updated_at) AND EXISTS(SELECT 1 FROM public.dms_ai_extraction_jobs j WHERE j.id=a.job_id AND j.upload_session_id=s.id AND j.status='complete');
 reason:=CASE WHEN NOT trusted THEN 'The AI result is missing or is not bound to these exact verified bytes.'
  WHEN a.suggested_document_type_id IS DISTINCT FROM p_type THEN 'The selected type differs from the verified AI classification.'
  WHEN a.expiry_date_suggestion<current_date OR p_expiry<current_date THEN 'The reviewed file has an expired date; retain its actual date and explain any override.' END;
 token:=encode(sha256(convert_to(jsonb_build_object('source',source,'object',jsonb_build_array(o.id,o.version,o.updated_at),'sha256',proof.sha256,
  'result',a.id,'analysis',h,'trusted',trusted,'type',p_type,'expiry',p_expiry,'requiresOverride',reason IS NOT NULL)::text,'UTF8')),'hex');
 RETURN jsonb_build_object('fingerprint',token,'requiresOverride',reason IS NOT NULL,'reason',reason,'canOverride',erp_private.permission_in_scope('dms.admin',s.owning_company_id,s.owning_branch_id),
  'analysisResultId',a.id,'sha256',proof.sha256);
END $$;
CREATE FUNCTION public.f07_prepare_intake_review(p_session bigint,p_type bigint,p_expiry date) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_intake_review_snapshot($1,$2,$3) $$;
CREATE FUNCTION erp_private.f07_confirm_intake_review(p_session bigint,p_type bigint,p_expiry date,p_fingerprint text,p_confirmed boolean,p_override boolean,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current jsonb;actor bigint:=public.current_user_profile_id();s public.dms_upload_sessions;h text;mode text;
BEGIN
 current:=erp_private.f07_intake_review_snapshot(p_session,p_type,p_expiry);
 IF p_confirmed IS DISTINCT FROM true OR p_fingerprint IS DISTINCT FROM current->>'fingerprint' THEN RAISE EXCEPTION 'Review the current original file, type and expiry explicitly' USING ERRCODE='PT409';END IF;
 IF p_override IS NULL OR p_override AND (NOT (current->>'canOverride')::boolean OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 20 AND 1000) OR
  (current->>'requiresOverride')::boolean AND NOT p_override THEN RAISE EXCEPTION 'A scoped administrator must explicitly justify this manual override' USING ERRCODE='42501';END IF;
 IF NOT p_override AND nullif(btrim(p_reason),'') IS NOT NULL THEN RAISE EXCEPTION 'Unexpected override reason' USING ERRCODE='22023';END IF;
 mode:=CASE WHEN p_override THEN 'manual_override' ELSE 'verified' END;
 h:=encode(sha256(convert_to(jsonb_build_array(p_fingerprint,mode,CASE WHEN p_override THEN btrim(p_reason) END)::text,'UTF8')),'hex');
 IF NOT EXISTS(SELECT 1 FROM erp_private.f07_intake_reviews WHERE upload_session_id=p_session AND actor_id=actor AND review_hash=h) THEN
  INSERT INTO erp_private.f07_intake_reviews(upload_session_id,actor_id,review_hash,fingerprint,document_type_id,expiry_date,review_mode,reason,analysis_result_id,source_sha256)
   VALUES(p_session,actor,h,p_fingerprint,p_type,p_expiry,mode,CASE WHEN p_override THEN btrim(p_reason) END,(current->>'analysisResultId')::bigint,current->>'sha256');
  SELECT * INTO s FROM public.dms_upload_sessions WHERE id=p_session;
  INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values)
   VALUES(actor,'DMS','dms_upload_sessions',p_session,'update',jsonb_build_object('event','exact_file_human_review','mode',mode,'reason',CASE WHEN p_override THEN btrim(p_reason) END,
    'documentTypeId',p_type,'expiryDate',p_expiry,'sourceSha256',current->>'sha256','analysisResultId',current->'analysisResultId','fingerprint',p_fingerprint));
  IF s.document_id IS NOT NULL THEN INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json)
   VALUES(s.document_id,'intake_review_confirmed','Exact original file reviewed before finalization',actor,jsonb_build_object('uploadSessionId',s.id,'mode',mode,'fingerprint',p_fingerprint));END IF;
 END IF;
 RETURN jsonb_build_object('confirmed',true,'fingerprint',p_fingerprint,'mode',mode);
END $$;
CREATE FUNCTION public.f07_confirm_intake_review(p_session bigint,p_type bigint,p_expiry date,p_fingerprint text,p_confirmed boolean,p_override boolean,p_reason text)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_confirm_intake_review($1,$2,$3,$4,$5,$6,$7) $$;
CREATE FUNCTION erp_private.f07_assert_intake_review(p_session bigint,p_type bigint,p_expiry date) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE current jsonb;
BEGIN
 current:=erp_private.f07_intake_review_snapshot(p_session,p_type,p_expiry);
 IF NOT EXISTS(SELECT 1 FROM erp_private.f07_intake_reviews r WHERE r.upload_session_id=p_session AND r.actor_id=public.current_user_profile_id() AND
  r.document_type_id=p_type AND r.expiry_date IS NOT DISTINCT FROM p_expiry AND r.fingerprint=current->>'fingerprint' AND
  (NOT (current->>'requiresOverride')::boolean OR r.review_mode='manual_override' AND (current->>'canOverride')::boolean)) THEN
  RAISE EXCEPTION 'Explicit review of these exact bytes, type and expiry is required' USING ERRCODE='PT409';END IF;
END $$;

REVOKE ALL ON FUNCTION erp_private.f07_intake_source_row(public.dms_upload_sessions),erp_private.f07_intake_analysis_digest(public.dms_ai_extraction_results) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.f07_intake_source(bigint),public.f07_prepare_intake_source(bigint),erp_private.f07_intake_review_snapshot(bigint,bigint,date),
 public.f07_prepare_intake_review(bigint,bigint,date),erp_private.f07_confirm_intake_review(bigint,bigint,date,text,boolean,boolean,text),
 public.f07_confirm_intake_review(bigint,bigint,date,text,boolean,boolean,text),erp_private.f07_assert_intake_review(bigint,bigint,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_intake_source(bigint),public.f07_prepare_intake_source(bigint),erp_private.f07_intake_review_snapshot(bigint,bigint,date),
 public.f07_prepare_intake_review(bigint,bigint,date),erp_private.f07_confirm_intake_review(bigint,bigint,date,text,boolean,boolean,text),
 public.f07_confirm_intake_review(bigint,bigint,date,text,boolean,boolean,text),erp_private.f07_assert_intake_review(bigint,bigint,date) TO authenticated;
REVOKE ALL ON FUNCTION public.f07_attest_intake_source(bigint,bigint,uuid,jsonb,uuid,text,timestamptz,text),
 public.f07_attest_intake_analysis(bigint,bigint,uuid,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.f07_attest_intake_source(bigint,bigint,uuid,jsonb,uuid,text,timestamptz,text),
 public.f07_attest_intake_analysis(bigint,bigint,uuid,bigint,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
