BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
-- AI04 contracts are prerequisites. Held with them for the matching application release.
DO $$ BEGIN IF to_regprocedure('public.ai_mod04_preparation(text,jsonb)') IS NULL THEN RAISE EXCEPTION 'AI04 prerequisite missing';END IF;END $$;

-- These ledgers implement feedback/evaluation and admission policy, not a second
-- usage/observability database. Existing usage, queue, claim and profile data stay authoritative.
CREATE TABLE erp_private.ai_mod05_feedback(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actor bigint NOT NULL REFERENCES public.user_profiles(id),request_id uuid NOT NULL,
 source_kind text NOT NULL CHECK(source_kind IN('assistant','intake','preparation','extraction')),source_id bigint NOT NULL,document_id bigint,
 snapshot jsonb NOT NULL,category text NOT NULL CHECK(category IN('wrong_person','wrong_document','incorrect_value','unsupported_answer','missing_result')),
 correction text NOT NULL CHECK(length(correction) BETWEEN 1 AND 1000),shared boolean NOT NULL DEFAULT false,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','accepted','disagreed','rejected')),
 reviewer bigint REFERENCES public.user_profiles(id),review_note text,review_request uuid,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),reviewed_at timestamptz,
 UNIQUE(actor,request_id),CHECK((state='pending')=(reviewer IS NULL AND reviewed_at IS NULL)),CHECK(reviewer IS NULL OR reviewer<>actor));
CREATE UNIQUE INDEX ai_mod05_feedback_original ON erp_private.ai_mod05_feedback(actor,source_kind,source_id,category,(snapshot->>'fingerprint'),(snapshot->>'authorityHash'));
CREATE INDEX ai_mod05_feedback_pending ON erp_private.ai_mod05_feedback(state,id DESC);
ALTER TABLE erp_private.ai_mod05_feedback ENABLE ROW LEVEL SECURITY;

CREATE FUNCTION erp_private.ai_mod05_authority()RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN erp_private.business_principal_is_active()THEN encode(sha256(convert_to(coalesce((SELECT jsonb_agg(jsonb_build_object('assignment',to_jsonb(u),'role',to_jsonb(r),'grants',(SELECT jsonb_agg(jsonb_build_object('grant',to_jsonb(g),'permission',to_jsonb(p))ORDER BY g.id)FROM public.role_permissions g JOIN public.permissions p ON p.id=g.permission_id WHERE g.role_id=r.id))ORDER BY u.id)::text FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id WHERE u.user_profile_id=public.current_user_profile_id()),'[]'),'UTF8')),'hex')END;
$$;
REVOKE ALL ON FUNCTION erp_private.ai_mod05_authority()FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod05_authority()TO authenticated;
CREATE FUNCTION erp_private.ai_mod05_lock_actor()RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT erp_private.business_principal_is_active()THEN RAISE EXCEPTION 'Current actor required' USING ERRCODE='42501';END IF;
 PERFORM erp_private.ai_mod04_lock_profile_authority(public.current_user_profile_id());
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod05_lock_actor()FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod05_lock_actor()TO authenticated;
CREATE FUNCTION erp_private.ai_mod05_document_allowed(p_document bigint)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.business_principal_is_active()AND erp_private.document_permission(p_document,'dms.documents.view')AND erp_private.document_permission(p_document,'dms.documents.preview')AND erp_private.ai_mod04_subjects_allowed(p_document);
$$;
CREATE FUNCTION erp_private.ai_mod05_review_sensitivity(p_sources jsonb)RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;e bigint;cap text;
BEGIN
 FOR s IN SELECT value FROM jsonb_array_elements(p_sources)LOOP
  e:=NULL;
  IF s->'reference'->>'entityType'='employee'THEN e:=(s->'reference'->>'entityId')::bigint;
  ELSIF s->'reference'->>'entityType'='dependent'THEN SELECT employee_id INTO e FROM public.employee_dependents WHERE id=(s->'reference'->>'entityId')::bigint AND deleted_at IS NULL;IF e IS NULL THEN RETURN false;END IF;END IF;
  IF e IS NOT NULL THEN
   -- Older answer bindings did not classify individual HR fields. Do not give
   -- a metadata-only reviewer an unclassified HR correction. Owner reads still
   -- require their unchanged complete authority hash; DMS uses its own resolver.
   FOREACH cap IN ARRAY ARRAY['hr.payroll.view','hr.banking.view','hr.confidential.view','hr.medical.view','hr.compliance.view']LOOP IF NOT erp_private.employee_permission(e,cap)THEN RETURN false;END IF;END LOOP;
  END IF;
 END LOOP;RETURN true;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod05_document_allowed(bigint),erp_private.ai_mod05_review_sensitivity(jsonb)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod05_document_allowed(bigint),erp_private.ai_mod05_review_sensitivity(jsonb)TO authenticated;

CREATE FUNCTION erp_private.ai_mod05_sources_current(p_sources jsonb)RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE s jsonb;v timestamptz;k text;i bigint;u jsonb;result_id bigint;
BEGIN
 IF NOT erp_private.business_principal_is_active() OR jsonb_typeof(p_sources) IS DISTINCT FROM 'array' OR jsonb_array_length(p_sources)>10 THEN RETURN false;END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(p_sources)LOOP
  i:=(s->'reference'->>'entityId')::bigint;k:=s->'reference'->>'entityType';v:=NULL;
  IF k='upload_session'THEN
   BEGIN u:=public.f07_prepare_intake_source(i);SELECT ai_result_id INTO result_id FROM public.dms_upload_sessions WHERE id=i;
    IF encode(sha256(convert_to((u||jsonb_build_object('resultId',result_id))::text,'UTF8')),'hex')IS DISTINCT FROM s->>'sourceVersion'THEN RETURN false;END IF;
   EXCEPTION WHEN OTHERS THEN RETURN false;END;CONTINUE;
  END IF;
  IF k='dms_document' AND erp_private.ai_mod05_document_allowed(i)THEN SELECT updated_at INTO v FROM public.dms_documents WHERE id=i AND deleted_at IS NULL;
  ELSIF k='employee' AND public.current_user_has_permission_any_scope('hr.employees.view')THEN SELECT updated_at INTO v FROM public.employees WHERE id=i AND deleted_at IS NULL;
  ELSIF k='dependent' AND public.current_user_has_permission_any_scope('hr.employees.view')THEN SELECT updated_at INTO v FROM public.employee_dependents WHERE id=i AND deleted_at IS NULL;
  ELSIF k='company' AND public.current_user_has_permission_any_scope('organizations.view')THEN SELECT updated_at INTO v FROM public.owner_companies WHERE id=i;
  ELSIF k='branch' AND public.current_user_has_permission_any_scope('branches.view')THEN SELECT updated_at INTO v FROM public.branches WHERE id=i;
  ELSIF k='site' AND(public.current_user_has_permission_any_scope('common_md.view')OR public.current_user_has_permission_any_scope('common_md.work_sites.view'))THEN SELECT updated_at INTO v FROM public.work_sites WHERE id=i AND deleted_at IS NULL;
  ELSIF k='party' AND(public.current_user_has_permission_any_scope('master_data.parties.view')OR public.current_user_has_permission_any_scope('master_data.party_master.view'))THEN SELECT updated_at INTO v FROM public.parties WHERE id=i AND is_active;
  END IF;
  IF v IS NULL OR v IS DISTINCT FROM(s->>'sourceVersion')::timestamptz THEN RETURN false;END IF;
 END LOOP;RETURN true;
EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format THEN RETURN false;
END $$;

-- Lock only already-authorized, version-bound parents for feedback writes.
-- No contents or additional read capability are returned by this helper.
CREATE FUNCTION erp_private.ai_mod05_lock_feedback_sources(p_sources jsonb)RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;k text;i bigint;
BEGIN
 IF NOT erp_private.ai_mod05_sources_current(p_sources)THEN RAISE EXCEPTION 'Feedback source changed' USING ERRCODE='42501';END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(p_sources)ORDER BY value->'reference'->>'entityType',value->'reference'->>'entityId'LOOP
  k:=s->'reference'->>'entityType';i:=(s->'reference'->>'entityId')::bigint;
  IF k='dms_document'THEN IF NOT erp_private.ai_mod05_document_allowed(i)THEN RAISE EXCEPTION 'Source denied' USING ERRCODE='42501';END IF;PERFORM id FROM public.dms_documents WHERE id=i FOR SHARE NOWAIT;PERFORM erp_private.ai_mod04_lock_source(i);
  ELSIF k='employee'THEN IF NOT erp_private.employee_permission(i,'hr.employees.view')THEN RAISE EXCEPTION 'Source denied' USING ERRCODE='42501';END IF;PERFORM id FROM public.employees WHERE id=i FOR SHARE NOWAIT;
  ELSIF k='dependent'THEN PERFORM id FROM public.employee_dependents WHERE id=i AND erp_private.employee_permission(employee_id,'hr.employees.view')FOR SHARE NOWAIT;IF NOT FOUND THEN RAISE EXCEPTION 'Source denied' USING ERRCODE='42501';END IF;
  ELSIF k='company'THEN IF NOT public.current_user_has_permission_in_company('organizations.view',i)THEN RAISE EXCEPTION 'Source denied' USING ERRCODE='42501';END IF;PERFORM id FROM public.owner_companies WHERE id=i FOR SHARE NOWAIT;
  ELSIF k='branch'THEN IF NOT public.current_user_has_permission_in_branch('branches.view',i)THEN RAISE EXCEPTION 'Source denied' USING ERRCODE='42501';END IF;PERFORM id FROM public.branches WHERE id=i FOR SHARE NOWAIT;
  ELSIF k='site'THEN PERFORM id FROM public.work_sites WHERE id=i AND erp_private.administrator_work_site_permission('view',owner_company_id,branch_id)FOR SHARE NOWAIT;IF NOT FOUND THEN RAISE EXCEPTION 'Source denied' USING ERRCODE='42501';END IF;
  ELSIF k='upload_session'THEN PERFORM public.f07_prepare_intake_source(i);PERFORM id FROM public.dms_upload_sessions WHERE id=i FOR SHARE NOWAIT;
  ELSE RAISE EXCEPTION 'Unsupported feedback source' USING ERRCODE='22023';END IF;
 END LOOP;
 IF NOT erp_private.ai_mod05_sources_current(p_sources)THEN RAISE EXCEPTION 'Feedback source changed' USING ERRCODE='42501';END IF;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod05_lock_feedback_sources(jsonb)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod05_lock_feedback_sources(jsonb)TO authenticated;

CREATE FUNCTION erp_private.ai_mod05_source(p_kind text,p_id bigint,p_document bigint)RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path='' AS $$
DECLARE m public.erp_ai_assistant_messages;s public.erp_ai_assistant_sessions;j public.dms_ai_extraction_jobs;d public.dms_documents;r jsonb;binding jsonb;sources jsonb;provenance jsonb;u jsonb;result_row public.dms_ai_extraction_results;current_result bigint;
BEGIN
 IF NOT erp_private.business_principal_is_active()THEN RAISE EXCEPTION 'Current access required' USING ERRCODE='42501';END IF;
 IF p_kind='assistant' AND p_document IS NULL THEN
  IF NOT(public.current_user_has_permission_any_scope('ai.assistant.use')OR public.current_user_has_permission_any_scope('ai.assistant.view')OR public.current_user_has_permission_any_scope('ai.assistant.admin'))THEN RAISE EXCEPTION 'Assistant access required' USING ERRCODE='42501';END IF;
  SELECT *INTO m FROM public.erp_ai_assistant_messages WHERE id=p_id AND role='assistant';
  SELECT *INTO s FROM public.erp_ai_assistant_sessions WHERE id=m.session_id AND owner_user_profile_id=public.current_user_profile_id();
  binding:=m.safe_metadata_json->'ai_mod01_binding';sources:=binding->'sources';
  IF s.id IS NULL OR binding->>'version' IS DISTINCT FROM'1'OR binding->>'ownerProfileId' IS DISTINCT FROM s.owner_user_profile_id::text OR binding->>'sessionId' IS DISTINCT FROM s.id::text OR m.safe_metadata_json->>'ai_mod05_authority'IS DISTINCT FROM erp_private.ai_mod05_authority()OR NOT erp_private.ai_mod05_sources_current(sources)THEN RAISE EXCEPTION 'Original answer access unavailable' USING ERRCODE='42501';END IF;
  provenance:=jsonb_build_object('contract',coalesce(m.safe_metadata_json#>>'{ai_mod05_versions,contract}','unknown'),'model',m.safe_metadata_json#>>'{ai_mod05_versions,model}','prompt',m.safe_metadata_json#>>'{ai_mod05_versions,prompt}','rules',m.safe_metadata_json#>>'{ai_mod05_versions,rules}');
  r:=jsonb_build_object('message',to_jsonb(m),'binding',binding);
 ELSIF p_kind='intake'AND p_document IS NULL THEN
  SELECT id,upload_session_id,job_id,ai_status,extracted_fields_json,field_confidence_json,issue_date_suggestion,expiry_date_suggestion,suggested_title,suggested_description INTO result_row.id,result_row.upload_session_id,result_row.job_id,result_row.ai_status,result_row.extracted_fields_json,result_row.field_confidence_json,result_row.issue_date_suggestion,result_row.expiry_date_suggestion,result_row.suggested_title,result_row.suggested_description FROM public.dms_ai_extraction_results WHERE id=p_id;
  IF result_row.upload_session_id IS NULL THEN RAISE EXCEPTION 'Retained intake result unavailable' USING ERRCODE='42501';END IF;
  u:=public.f07_prepare_intake_source(result_row.upload_session_id);SELECT ai_result_id INTO current_result FROM public.dms_upload_sessions WHERE id=result_row.upload_session_id;
  IF current_result IS DISTINCT FROM p_id THEN RAISE EXCEPTION 'Displayed intake result changed; refresh it' USING ERRCODE='PT409';END IF;
  SELECT id,model,prompt_version,input_text_hash INTO j.id,j.model,j.prompt_version,j.input_text_hash FROM public.dms_ai_extraction_jobs WHERE id=result_row.job_id;
  sources:=jsonb_build_array(jsonb_build_object('reference',jsonb_build_object('entityType','upload_session','entityId',result_row.upload_session_id),'sourceVersion',encode(sha256(convert_to((u||jsonb_build_object('resultId',p_id))::text,'UTF8')),'hex')));
  r:=to_jsonb(result_row);provenance:=jsonb_build_object('model',j.model,'prompt',j.prompt_version,'inputHash',j.input_text_hash,'sourceVersion',p_id);
 ELSIF p_kind IN('preparation','extraction')AND p_document IS NOT NULL THEN
  IF NOT erp_private.ai_mod05_document_allowed(p_document)THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501';END IF;
  SELECT id,updated_at,current_version_id INTO d.id,d.updated_at,d.current_version_id FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501';END IF;
  sources:=jsonb_build_array(jsonb_build_object('reference',jsonb_build_object('entityType','dms_document','entityId',d.id),'sourceVersion',d.updated_at));
  IF p_kind='preparation' THEN
   r:=public.ai_mod04_preparation('status',jsonb_build_object('documentId',d.id,'jobId',p_id));
   IF r->'candidate' IS NULL OR r->'candidate'='null'::jsonb OR r->'sourceCurrent'IS DISTINCT FROM'true'::jsonb THEN RAISE EXCEPTION 'A current retained result is required' USING ERRCODE='23514';END IF;
   SELECT job_id INTO result_row.job_id FROM public.dms_ai_extraction_results WHERE id=(r->>'resultId')::bigint;
   SELECT id,model,prompt_version,input_text_hash INTO j.id,j.model,j.prompt_version,j.input_text_hash FROM public.dms_ai_extraction_jobs WHERE id=result_row.job_id;
   provenance:=jsonb_build_object('sourceVersion',d.current_version_id,'profile',r->'candidate'->>'profileHash','rules','dms-preparation/1','model',j.model,'prompt',j.prompt_version,'inputHash',j.input_text_hash);
  ELSE
   SELECT id,document_id,model,prompt_version,input_text_hash,updated_at,status,provider INTO j.id,j.document_id,j.model,j.prompt_version,j.input_text_hash,j.updated_at,j.status,j.provider FROM public.dms_ai_extraction_jobs WHERE id=p_id AND document_id=d.id AND status IN('completed','complete','success');
   IF j.id IS NULL THEN RAISE EXCEPTION 'Retained run unavailable' USING ERRCODE='42501';END IF;
   r:=to_jsonb(j);provenance:=jsonb_build_object('model',j.model,'prompt',j.prompt_version,'inputHash',j.input_text_hash,'sourceVersion','legacy version provenance may be incomplete');
  END IF;
 ELSE RAISE EXCEPTION 'Unsupported source' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('sources',sources,'provenance',provenance,'authorityHash',erp_private.ai_mod05_authority(),'fingerprint',encode(sha256(convert_to(r::text,'UTF8')),'hex'));
END $$;

CREATE FUNCTION erp_private.ai_mod05_feedback_visible(p_actor bigint,p_shared boolean,p_snapshot jsonb)RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT erp_private.business_principal_is_active()AND erp_private.ai_mod05_sources_current(p_snapshot->'sources')AND((p_actor=public.current_user_profile_id()AND p_snapshot->>'authorityHash'=erp_private.ai_mod05_authority())OR(p_shared AND public.current_user_has_permission_any_scope('ai.data_quality.review')AND erp_private.ai_mod05_review_sensitivity(p_snapshot->'sources')AND(jsonb_array_length(p_snapshot->'sources')>0 OR public.current_user_has_permission('settings.ai.manage'))));
$$;
CREATE POLICY ai_mod05_feedback_read ON erp_private.ai_mod05_feedback FOR SELECT TO authenticated USING(erp_private.ai_mod05_feedback_visible(actor,shared,snapshot));
CREATE POLICY ai_mod05_feedback_insert ON erp_private.ai_mod05_feedback FOR INSERT TO authenticated WITH CHECK(actor=public.current_user_profile_id()AND state='pending'AND reviewer IS NULL AND snapshot=erp_private.ai_mod05_source(source_kind,source_id,document_id));
CREATE POLICY ai_mod05_feedback_review ON erp_private.ai_mod05_feedback FOR UPDATE TO authenticated USING(shared AND actor<>public.current_user_profile_id()AND public.current_user_has_permission_any_scope('ai.data_quality.review')AND erp_private.ai_mod05_feedback_visible(actor,shared,snapshot))WITH CHECK(reviewer=public.current_user_profile_id()AND state<>'pending');

CREATE FUNCTION erp_private.ai_mod05_feedback_immutable()RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE'THEN RAISE EXCEPTION 'Retain feedback history' USING ERRCODE='42501';END IF;
 IF NEW.correction~'[[:cntrl:]]'OR NEW.correction~'(sk-(proj-)?|gh[pousr]_)[A-Za-z0-9_-]{15,}|https?://|-----BEGIN'OR coalesce(NEW.review_note,'')~'(sk-(proj-)?|gh[pousr]_)[A-Za-z0-9_-]{15,}|https?://|-----BEGIN'THEN RAISE EXCEPTION 'Remove confidential credentials and links from feedback' USING ERRCODE='22023';END IF;
 IF TG_OP='INSERT'THEN NEW.created_at:=clock_timestamp();NEW.review_note:=NULL;NEW.review_request:=NULL;NEW.reviewed_at:=NULL;RETURN NEW;END IF;
 IF (to_jsonb(NEW)-ARRAY['state','reviewer','review_note','review_request','reviewed_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','reviewer','review_note','review_request','reviewed_at'])OR OLD.state<>'pending'OR NEW.state='pending'OR NEW.reviewer=OLD.actor OR NEW.reviewer IS DISTINCT FROM public.current_user_profile_id() OR length(coalesce(NEW.review_note,''))NOT BETWEEN 1 AND 200 OR NEW.review_request IS NULL THEN RAISE EXCEPTION 'Original feedback and review are immutable' USING ERRCODE='42501';END IF;
 NEW.reviewed_at:=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER ai_mod05_feedback_history BEFORE INSERT OR UPDATE OR DELETE ON erp_private.ai_mod05_feedback FOR EACH ROW EXECUTE FUNCTION erp_private.ai_mod05_feedback_immutable();

CREATE FUNCTION public.ai_mod05_feedback(p_action text,p_data jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v_actor bigint:=public.current_user_profile_id();r erp_private.ai_mod05_feedback;v_snapshot jsonb;kind text;source bigint;doc bigint;key uuid;
BEGIN
 IF NOT erp_private.business_principal_is_active()THEN RAISE EXCEPTION 'Current access required' USING ERRCODE='42501';END IF;
 PERFORM erp_private.ai_mod05_lock_actor();
 IF p_action='source'THEN RETURN erp_private.ai_mod05_source(p_data->'source'->>'kind',(p_data->'source'->>'id')::bigint,(p_data->'source'->>'documentId')::bigint);END IF;
 IF p_action='submit'THEN
  IF jsonb_typeof(p_data)IS DISTINCT FROM'object'OR octet_length(p_data::text)>8192 OR p_data->>'category'NOT IN('wrong_person','wrong_document','incorrect_value','unsupported_answer','missing_result')OR length(coalesce(p_data->>'correction',''))NOT BETWEEN 1 AND 1000 OR jsonb_typeof(p_data->'shareForReview')IS DISTINCT FROM'boolean'THEN RAISE EXCEPTION 'Invalid feedback' USING ERRCODE='22023';END IF;
  kind:=p_data->'source'->>'kind';source:=(p_data->'source'->>'id')::bigint;doc:=(p_data->'source'->>'documentId')::bigint;key:=(p_data->>'requestId')::uuid;
  IF key IS NULL THEN RAISE EXCEPTION 'Original request required' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ai05-feedback:'||v_actor||':'||key,0));
  v_snapshot:=erp_private.ai_mod05_source(kind,source,doc);
  PERFORM erp_private.ai_mod05_lock_feedback_sources(v_snapshot->'sources');
  SELECT *INTO r FROM erp_private.ai_mod05_feedback f WHERE f.actor=v_actor AND request_id=key;
  IF FOUND THEN IF r.source_kind IS DISTINCT FROM kind OR r.source_id<>source OR r.document_id IS DISTINCT FROM doc OR r.category IS DISTINCT FROM p_data->>'category'OR r.correction IS DISTINCT FROM p_data->>'correction'OR r.shared IS DISTINCT FROM(p_data->>'shareForReview')::boolean THEN RAISE EXCEPTION 'Original feedback values changed' USING ERRCODE='PT409';END IF;RETURN jsonb_build_object('id',r.id,'replayed',true);END IF;
  INSERT INTO erp_private.ai_mod05_feedback(actor,request_id,source_kind,source_id,document_id,snapshot,category,correction,shared)VALUES(v_actor,key,kind,source,doc,v_snapshot,p_data->>'category',p_data->>'correction',(p_data->>'shareForReview')::boolean)ON CONFLICT DO NOTHING RETURNING *INTO r;
  IF r.id IS NULL THEN SELECT *INTO r FROM erp_private.ai_mod05_feedback f WHERE f.actor=v_actor AND f.source_kind=kind AND f.source_id=source AND f.category=p_data->>'category'AND f.snapshot->>'fingerprint'=v_snapshot->>'fingerprint'AND f.snapshot->>'authorityHash'=v_snapshot->>'authorityHash';IF r.id IS NULL OR r.correction IS DISTINCT FROM p_data->>'correction'OR r.shared IS DISTINCT FROM(p_data->>'shareForReview')::boolean THEN RAISE EXCEPTION 'Feedback already retained or original authority changed; reconcile it' USING ERRCODE='PT409';END IF;END IF;
  RETURN jsonb_build_object('id',r.id,'replayed',r.request_id<>key);
 ELSIF p_action='review'THEN
  SELECT *INTO r FROM erp_private.ai_mod05_feedback WHERE id=(p_data->>'id')::bigint FOR UPDATE;
  IF r.id IS NULL OR r.actor=v_actor THEN RAISE EXCEPTION 'Different authorised reviewer required' USING ERRCODE='42501';END IF;
  PERFORM erp_private.ai_mod05_lock_feedback_sources(r.snapshot->'sources');
  IF r.state<>'pending'THEN IF r.reviewer=v_actor AND r.review_request=(p_data->>'requestId')::uuid AND r.state=p_data->>'decision'AND r.review_note=p_data->>'note'THEN RETURN jsonb_build_object('id',r.id,'replayed',true);END IF;RAISE EXCEPTION 'Review already decided' USING ERRCODE='PT409';END IF;
  UPDATE erp_private.ai_mod05_feedback SET state=p_data->>'decision',reviewer=v_actor,review_note=p_data->>'note',review_request=(p_data->>'requestId')::uuid WHERE id=r.id;
  RETURN jsonb_build_object('id',r.id,'replayed',false);
 END IF;RAISE EXCEPTION 'Unsupported action' USING ERRCODE='22023';
END $$;

REVOKE ALL ON erp_private.ai_mod05_feedback FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA erp_private TO authenticated;
GRANT SELECT,INSERT,UPDATE ON erp_private.ai_mod05_feedback TO authenticated;
GRANT USAGE,SELECT ON SEQUENCE erp_private.ai_mod05_feedback_id_seq TO authenticated;
REVOKE ALL ON FUNCTION erp_private.ai_mod05_sources_current(jsonb),erp_private.ai_mod05_source(text,bigint,bigint),erp_private.ai_mod05_feedback_visible(bigint,boolean,jsonb),erp_private.ai_mod05_feedback_immutable(),public.ai_mod05_feedback(text,jsonb)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod05_sources_current(jsonb),erp_private.ai_mod05_source(text,bigint,bigint),erp_private.ai_mod05_feedback_visible(bigint,boolean,jsonb),public.ai_mod05_feedback(text,jsonb)TO authenticated;
CREATE TABLE erp_private.ai_mod05_datasets(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,code text NOT NULL,revision integer NOT NULL CHECK(revision>0),definition jsonb NOT NULL,sha256 text NOT NULL,
 actor bigint NOT NULL REFERENCES public.user_profiles(id),state text NOT NULL DEFAULT'draft'CHECK(state IN('draft','approved')),
 reviewer bigint REFERENCES public.user_profiles(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),reviewed_at timestamptz,
 UNIQUE(code,revision),CHECK(reviewer IS NULL OR reviewer<>actor));
CREATE TABLE erp_private.ai_mod05_evaluations(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,dataset_id bigint NOT NULL REFERENCES erp_private.ai_mod05_datasets(id),baseline_id bigint REFERENCES erp_private.ai_mod05_evaluations(id),
 actor bigint NOT NULL REFERENCES public.user_profiles(id),request_id uuid NOT NULL,candidate jsonb NOT NULL,observations jsonb NOT NULL,result jsonb NOT NULL,
 state text NOT NULL DEFAULT'draft'CHECK(state IN('draft','approved')),reviewer bigint REFERENCES public.user_profiles(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),reviewed_at timestamptz,
 UNIQUE(actor,request_id),CHECK(reviewer IS NULL OR reviewer<>actor));
ALTER TABLE erp_private.ai_mod05_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.ai_mod05_evaluations ENABLE ROW LEVEL SECURITY;
CREATE UNIQUE INDEX ai_mod05_evaluation_original ON erp_private.ai_mod05_evaluations(actor,dataset_id,coalesce(baseline_id,0),(md5(candidate::text)),(md5(observations::text)));

CREATE FUNCTION erp_private.ai_mod05_dataset_allowed(p_definition jsonb)RETURNS boolean LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE f text;
BEGIN
 IF NOT erp_private.business_principal_is_active()OR NOT public.current_user_has_permission('settings.ai.manage')THEN RETURN false;END IF;
 FOR f IN SELECT value FROM jsonb_array_elements_text(p_definition->'feedbackIds')LOOP
  IF NOT EXISTS(SELECT 1 FROM erp_private.ai_mod05_feedback WHERE id=f::bigint AND shared AND state='accepted')THEN RETURN false;END IF;
 END LOOP;RETURN true;
END $$;
CREATE POLICY ai_mod05_dataset_read ON erp_private.ai_mod05_datasets FOR SELECT TO authenticated USING(erp_private.ai_mod05_dataset_allowed(definition));
CREATE POLICY ai_mod05_dataset_insert ON erp_private.ai_mod05_datasets FOR INSERT TO authenticated WITH CHECK(actor=public.current_user_profile_id()AND state='draft'AND reviewer IS NULL AND erp_private.ai_mod05_dataset_allowed(definition));
CREATE POLICY ai_mod05_dataset_review ON erp_private.ai_mod05_datasets FOR UPDATE TO authenticated USING(actor<>public.current_user_profile_id()AND erp_private.ai_mod05_dataset_allowed(definition))WITH CHECK(state='approved'AND reviewer=public.current_user_profile_id());
CREATE POLICY ai_mod05_evaluation_read ON erp_private.ai_mod05_evaluations FOR SELECT TO authenticated USING(EXISTS(SELECT 1 FROM erp_private.ai_mod05_datasets WHERE id=dataset_id));
CREATE POLICY ai_mod05_evaluation_insert ON erp_private.ai_mod05_evaluations FOR INSERT TO authenticated WITH CHECK(actor=public.current_user_profile_id()AND state='draft'AND reviewer IS NULL AND EXISTS(SELECT 1 FROM erp_private.ai_mod05_datasets WHERE id=dataset_id AND state='approved'));
CREATE POLICY ai_mod05_evaluation_review ON erp_private.ai_mod05_evaluations FOR UPDATE TO authenticated USING(actor<>public.current_user_profile_id()AND EXISTS(SELECT 1 FROM erp_private.ai_mod05_datasets WHERE id=dataset_id AND state='approved'))WITH CHECK(state='approved'AND reviewer=public.current_user_profile_id()AND result->'eligible'='true'::jsonb);

CREATE FUNCTION erp_private.ai_mod05_score(p_definition jsonb,p_candidate jsonb,p_observations jsonb,p_baseline jsonb DEFAULT NULL)RETURNS jsonb LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE c jsonb;o jsonb;cases jsonb:='[]';regressions jsonb:='[]';n int:=0;passed int:=0;critical int:=0;good boolean;
BEGIN
 IF jsonb_typeof(p_candidate)IS DISTINCT FROM'object'OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_candidate)k WHERE k<>ALL(ARRAY['mode','model','promptVersion','rulesVersion','documentTypeId','profileRulesHash','schemaHash','approvalReference']))OR p_candidate::text~'(sk-(proj-)?|gh[pousr]_)[A-Za-z0-9_-]{15,}|https?://|-----BEGIN'OR p_observations::text~'(sk-(proj-)?|gh[pousr]_)[A-Za-z0-9_-]{15,}|https?://|-----BEGIN'THEN RAISE EXCEPTION 'Minimized bounded version evidence required' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM unnest(ARRAY['mode','promptVersion','rulesVersion'])k WHERE jsonb_typeof(p_candidate->k)IS DISTINCT FROM'string'OR p_candidate->>k~'[[:cntrl:]]')OR EXISTS(SELECT 1 FROM unnest(ARRAY['model','approvalReference'])k WHERE jsonb_typeof(p_candidate->k)NOT IN('null','string')OR(p_candidate->>k IS NOT NULL AND(length(p_candidate->>k)NOT BETWEEN 1 AND 200 OR p_candidate->>k~'[[:cntrl:]]')))OR EXISTS(SELECT 1 FROM unnest(ARRAY['profileRulesHash','schemaHash'])k WHERE jsonb_typeof(p_candidate->k)NOT IN('null','string')OR(p_candidate->>k IS NOT NULL AND p_candidate->>k!~'^[a-f0-9]{64}$'))OR jsonb_typeof(p_candidate->'documentTypeId')NOT IN('null','number')THEN RAISE EXCEPTION 'Typed version evidence required' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(p_definition->'cases')IS DISTINCT FROM'array'OR jsonb_array_length(p_definition->'cases')NOT BETWEEN 1 AND 100 OR jsonb_typeof(p_observations)IS DISTINCT FROM'array'OR jsonb_array_length(p_observations)<>jsonb_array_length(p_definition->'cases')OR(SELECT count(DISTINCT x->>'caseId')FROM jsonb_array_elements(p_observations)x)<>jsonb_array_length(p_observations)THEN RAISE EXCEPTION 'Complete unique reference cases required' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(p_candidate)IS DISTINCT FROM'object'OR NOT p_candidate?&ARRAY['mode','model','promptVersion','rulesVersion','documentTypeId','profileRulesHash','schemaHash','approvalReference']OR octet_length(p_candidate::text)>8192 OR coalesce(p_candidate->>'mode','')NOT IN('synthetic_contract','reviewed_provider_results')OR length(coalesce(p_candidate->>'promptVersion',''))NOT BETWEEN 1 AND 200 OR length(coalesce(p_candidate->>'rulesVersion',''))NOT BETWEEN 1 AND 200 OR(p_candidate->>'mode'='reviewed_provider_results'AND(length(coalesce(p_candidate->>'model',''))NOT BETWEEN 1 AND 200 OR length(coalesce(p_candidate->>'approvalReference',''))NOT BETWEEN 1 AND 200))THEN RAISE EXCEPTION 'Candidate version and evidence provenance required' USING ERRCODE='22023';END IF;
 IF(p_candidate->>'documentTypeId'IS NOT NULL AND(p_candidate->>'documentTypeId'!~'^[1-9][0-9]{0,15}$'OR coalesce(p_candidate->>'profileRulesHash','')!~'^[a-f0-9]{64}$'OR coalesce(p_candidate->>'schemaHash','')!~'^[a-f0-9]{64}$'))THEN RAISE EXCEPTION 'Exact profile binding required' USING ERRCODE='22023';END IF;
 FOR c IN SELECT value FROM jsonb_array_elements(p_definition->'cases')LOOP
  SELECT value INTO o FROM jsonb_array_elements(p_observations)WHERE value->>'caseId'=c->>'caseId';
  IF o IS NULL OR jsonb_typeof(o)IS DISTINCT FROM'object'OR EXISTS(SELECT 1 FROM jsonb_object_keys(o)k WHERE k<>ALL(ARRAY['caseId','actual','evidence']))OR jsonb_typeof(o->'caseId')IS DISTINCT FROM'string'OR o->>'actual'~'[[:cntrl:]]'OR jsonb_typeof(o->'actual')IS DISTINCT FROM'string'OR length(coalesce(o->>'actual',''))NOT BETWEEN 1 AND 200 OR jsonb_typeof(o->'evidence')IS DISTINCT FROM'array'OR jsonb_array_length(o->'evidence')>20 OR EXISTS(SELECT 1 FROM jsonb_array_elements(o->'evidence')x WHERE jsonb_typeof(x)<>'string'OR length(x#>>'{}')NOT BETWEEN 1 AND 200)THEN RAISE EXCEPTION 'Original case and bounded observations required' USING ERRCODE='22023';END IF;
  good:=o->'actual'=c->'expected'AND(SELECT coalesce(jsonb_agg(x ORDER BY x),'[]')FROM(SELECT DISTINCT value x FROM jsonb_array_elements(o->'evidence'))q)=(SELECT coalesce(jsonb_agg(x ORDER BY x),'[]')FROM(SELECT DISTINCT value x FROM jsonb_array_elements(c->'evidence'))q);
  n:=n+1;IF good THEN passed:=passed+1;ELSIF c->'critical'='true'::jsonb THEN critical:=critical+1;END IF;
  IF NOT good AND EXISTS(SELECT 1 FROM jsonb_array_elements(p_baseline->'cases')v WHERE v->>'caseId'=c->>'caseId'AND v->'passed'='true'::jsonb)THEN regressions:=regressions||to_jsonb(c->>'caseId');END IF;
  cases:=cases||jsonb_build_array(jsonb_build_object('caseId',c->>'caseId','passed',good));
 END LOOP;
 RETURN jsonb_build_object('total',n,'passed',passed,'criticalFailures',critical,'regressions',regressions,'cases',cases,'eligible',passed=n AND jsonb_array_length(regressions)=0,'measurement',p_candidate->>'mode');
END $$;

CREATE FUNCTION erp_private.ai_mod05_quality_immutable()RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c jsonb;d erp_private.ai_mod05_datasets;b erp_private.ai_mod05_evaluations;
BEGIN
 IF TG_OP='DELETE'THEN RAISE EXCEPTION 'Retain evaluation history' USING ERRCODE='42501';END IF;
 IF TG_OP='INSERT'THEN
  NEW.actor:=public.current_user_profile_id();NEW.state:='draft';NEW.reviewer:=NULL;NEW.reviewed_at:=NULL;NEW.created_at:=clock_timestamp();
  IF TG_TABLE_NAME='ai_mod05_datasets'THEN
   IF jsonb_typeof(NEW.definition)IS DISTINCT FROM'object'OR NOT NEW.definition?&ARRAY['code','revision','title','cases','feedbackIds','minimized']OR EXISTS(SELECT 1 FROM jsonb_object_keys(NEW.definition)k WHERE k<>ALL(ARRAY['code','revision','title','cases','feedbackIds','minimized']))OR jsonb_typeof(NEW.definition->'title')IS DISTINCT FROM'string'OR length(coalesce(NEW.definition->>'title',''))NOT BETWEEN 1 AND 200 OR NEW.definition->>'title'~'[[:cntrl:]]'OR NEW.code!~'^[A-Z][A-Z0-9_-]{2,59}$'OR NEW.definition->'minimized'IS DISTINCT FROM'true'::jsonb OR NEW.definition->>'code'IS DISTINCT FROM NEW.code OR NEW.definition->'revision'IS DISTINCT FROM to_jsonb(NEW.revision)OR octet_length(NEW.definition::text)>131072 OR NEW.definition::text~'(sk-(proj-)?|gh[pousr]_)[A-Za-z0-9_-]{15,}|https?://|-----BEGIN'OR jsonb_typeof(NEW.definition->'feedbackIds')IS DISTINCT FROM'array'OR jsonb_array_length(NEW.definition->'feedbackIds')>20 OR jsonb_typeof(NEW.definition->'cases')IS DISTINCT FROM'array'OR jsonb_array_length(NEW.definition->'cases')NOT BETWEEN 1 AND 100 OR(SELECT count(DISTINCT x->>'caseId')FROM jsonb_array_elements(NEW.definition->'cases')x)<>jsonb_array_length(NEW.definition->'cases')THEN RAISE EXCEPTION 'Invalid minimized dataset' USING ERRCODE='22023';END IF;
   IF (SELECT count(DISTINCT x)FROM jsonb_array_elements(NEW.definition->'feedbackIds')x)<>jsonb_array_length(NEW.definition->'feedbackIds')OR EXISTS(SELECT 1 FROM jsonb_array_elements(NEW.definition->'feedbackIds')x WHERE jsonb_typeof(x)IS DISTINCT FROM'number'OR x::text!~'^[1-9][0-9]{0,15}$')THEN RAISE EXCEPTION 'Unique numeric feedback references required' USING ERRCODE='22023';END IF;
   FOR c IN SELECT value FROM jsonb_array_elements(NEW.definition->'cases')LOOP
    IF jsonb_typeof(c)IS DISTINCT FROM'object'OR NOT c?&ARRAY['caseId','language','category','expected','evidence','critical']OR EXISTS(SELECT 1 FROM jsonb_object_keys(c)k WHERE k<>ALL(ARRAY['caseId','language','category','expected','evidence','critical']))OR jsonb_typeof(c->'caseId')IS DISTINCT FROM'string'OR jsonb_typeof(c->'expected')IS DISTINCT FROM'string'OR c->>'caseId'~'[[:cntrl:]]'OR c->>'expected'~'[[:cntrl:]]'OR coalesce(c->>'category','')NOT IN('wrong_person','wrong_document','incorrect_value','unsupported_answer','missing_result')OR EXISTS(SELECT 1 FROM jsonb_array_elements(c->'evidence')x WHERE jsonb_typeof(x)IS DISTINCT FROM'string'OR length(x#>>'{}')NOT BETWEEN 1 AND 200 OR x#>>'{}'~'[[:cntrl:]]')OR length(coalesce(c->>'caseId',''))NOT BETWEEN 1 AND 200 OR length(coalesce(c->>'expected',''))NOT BETWEEN 1 AND 200 OR coalesce(c->>'language','')NOT IN('en','ar','bilingual')OR jsonb_typeof(c->'critical')IS DISTINCT FROM'boolean'OR jsonb_typeof(c->'evidence')IS DISTINCT FROM'array'OR jsonb_array_length(c->'evidence')>20 THEN RAISE EXCEPTION 'Invalid reference case' USING ERRCODE='22023';END IF;
   END LOOP;
   NEW.sha256:=encode(sha256(convert_to(NEW.definition::text,'UTF8')),'hex');
  ELSE
   SELECT *INTO d FROM erp_private.ai_mod05_datasets WHERE id=NEW.dataset_id AND state='approved';IF d.id IS NULL THEN RAISE EXCEPTION 'Approved dataset required' USING ERRCODE='42501';END IF;
   IF NEW.baseline_id IS NOT NULL THEN SELECT *INTO b FROM erp_private.ai_mod05_evaluations WHERE id=NEW.baseline_id AND dataset_id=NEW.dataset_id AND state='approved';IF b.id IS NULL THEN RAISE EXCEPTION 'Approved baseline on same dataset required' USING ERRCODE='42501';END IF;END IF;
   NEW.result:=erp_private.ai_mod05_score(d.definition,NEW.candidate,NEW.observations,b.result);
  END IF;RETURN NEW;
 END IF;
 IF (to_jsonb(NEW)-ARRAY['state','reviewer','reviewed_at'])IS DISTINCT FROM(to_jsonb(OLD)-ARRAY['state','reviewer','reviewed_at'])OR OLD.state<>'draft'OR NEW.state<>'approved'OR OLD.actor=public.current_user_profile_id()OR NEW.reviewer IS DISTINCT FROM public.current_user_profile_id()THEN RAISE EXCEPTION 'Independent review of immutable version required' USING ERRCODE='42501';END IF;
 IF TG_TABLE_NAME='ai_mod05_evaluations'THEN IF NEW.result->'eligible'IS DISTINCT FROM'true'::jsonb THEN RAISE EXCEPTION 'Quality regression held' USING ERRCODE='23514';END IF;END IF;
 NEW.reviewed_at:=clock_timestamp();RETURN NEW;
END $$;
CREATE TRIGGER ai_mod05_dataset_history BEFORE INSERT OR UPDATE OR DELETE ON erp_private.ai_mod05_datasets FOR EACH ROW EXECUTE FUNCTION erp_private.ai_mod05_quality_immutable();
CREATE TRIGGER ai_mod05_evaluation_history BEFORE INSERT OR UPDATE OR DELETE ON erp_private.ai_mod05_evaluations FOR EACH ROW EXECUTE FUNCTION erp_private.ai_mod05_quality_immutable();

CREATE FUNCTION public.ai_mod05_evaluate(p_action text,p_data jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE d erp_private.ai_mod05_datasets;e erp_private.ai_mod05_evaluations;key uuid;
BEGIN
 IF NOT erp_private.business_principal_is_active()OR NOT public.current_user_has_permission('settings.ai.manage')OR jsonb_typeof(p_data)IS DISTINCT FROM'object'OR octet_length(p_data::text)>262144 THEN RAISE EXCEPTION 'Evaluation administration required' USING ERRCODE='42501';END IF;
 PERFORM erp_private.ai_mod05_lock_actor();
 IF p_action='dataset'THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('ai05-dataset:'||(p_data->'definition'->>'code'),0));
  SELECT *INTO d FROM erp_private.ai_mod05_datasets WHERE code=p_data->'definition'->>'code'AND revision=(p_data->'definition'->>'revision')::int;
  IF FOUND THEN IF d.actor<>public.current_user_profile_id()OR d.definition IS DISTINCT FROM p_data->'definition'THEN RAISE EXCEPTION 'Dataset revision exists' USING ERRCODE='PT409';END IF;RETURN jsonb_build_object('id',d.id,'replayed',true);END IF;
  INSERT INTO erp_private.ai_mod05_datasets(code,revision,definition,sha256,actor)VALUES(p_data->'definition'->>'code',(p_data->'definition'->>'revision')::int,p_data->'definition','pending',public.current_user_profile_id())RETURNING id INTO d.id;
  RETURN jsonb_build_object('id',d.id,'replayed',false);
 ELSIF p_action='run'THEN
  key:=(p_data->>'requestId')::uuid;IF key IS NULL THEN RAISE EXCEPTION 'Request identity required' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ai05-eval:'||public.current_user_profile_id()||':'||key,0));
  SELECT *INTO e FROM erp_private.ai_mod05_evaluations WHERE actor=public.current_user_profile_id()AND request_id=key;
  IF FOUND THEN IF e.dataset_id IS DISTINCT FROM(p_data->>'datasetId')::bigint OR e.baseline_id IS DISTINCT FROM(p_data->>'baselineId')::bigint OR e.candidate IS DISTINCT FROM p_data->'candidate'OR e.observations IS DISTINCT FROM p_data->'observations'THEN RAISE EXCEPTION 'Original evaluation differs' USING ERRCODE='PT409';END IF;RETURN jsonb_build_object('id',e.id,'replayed',true);END IF;
  INSERT INTO erp_private.ai_mod05_evaluations(dataset_id,baseline_id,actor,request_id,candidate,observations,result)VALUES((p_data->>'datasetId')::bigint,(p_data->>'baselineId')::bigint,public.current_user_profile_id(),key,p_data->'candidate',p_data->'observations','{}')ON CONFLICT DO NOTHING RETURNING *INTO e;
  IF e.id IS NULL THEN SELECT *INTO e FROM erp_private.ai_mod05_evaluations WHERE actor=public.current_user_profile_id()AND dataset_id=(p_data->>'datasetId')::bigint AND baseline_id IS NOT DISTINCT FROM(p_data->>'baselineId')::bigint AND candidate=p_data->'candidate'AND observations=p_data->'observations';IF e.id IS NULL THEN RAISE EXCEPTION 'Original evaluation authority changed' USING ERRCODE='PT409';END IF;END IF;
  RETURN jsonb_build_object('id',e.id,'replayed',e.request_id<>key);
 ELSIF p_action IN('approve_dataset','approve_run')THEN
  IF p_action='approve_dataset'THEN
   SELECT *INTO d FROM erp_private.ai_mod05_datasets WHERE id=(p_data->>'id')::bigint FOR UPDATE;
   IF d.state='approved'AND d.reviewer=public.current_user_profile_id()THEN RETURN jsonb_build_object('id',d.id,'replayed',true);END IF;
   UPDATE erp_private.ai_mod05_datasets SET state='approved',reviewer=public.current_user_profile_id()WHERE id=d.id RETURNING id INTO d.id;
   IF d.id IS NULL THEN RAISE EXCEPTION 'Different authorised reviewer required' USING ERRCODE='42501';END IF;RETURN jsonb_build_object('id',d.id,'replayed',false);
  ELSE
   SELECT *INTO e FROM erp_private.ai_mod05_evaluations WHERE id=(p_data->>'id')::bigint FOR UPDATE;
   IF e.state='approved'AND e.reviewer=public.current_user_profile_id()THEN RETURN jsonb_build_object('id',e.id,'replayed',true);END IF;
   UPDATE erp_private.ai_mod05_evaluations SET state='approved',reviewer=public.current_user_profile_id()WHERE id=e.id RETURNING id INTO e.id;
   IF e.id IS NULL THEN RAISE EXCEPTION 'Different authorised reviewer required' USING ERRCODE='42501';END IF;RETURN jsonb_build_object('id',e.id,'replayed',false);
  END IF;
 END IF;RAISE EXCEPTION 'Unsupported evaluation action' USING ERRCODE='22023';
END $$;
REVOKE ALL ON erp_private.ai_mod05_datasets,erp_private.ai_mod05_evaluations FROM PUBLIC,anon,authenticated,service_role;
GRANT SELECT,INSERT,UPDATE ON erp_private.ai_mod05_datasets,erp_private.ai_mod05_evaluations TO authenticated;
GRANT USAGE,SELECT ON SEQUENCE erp_private.ai_mod05_datasets_id_seq,erp_private.ai_mod05_evaluations_id_seq TO authenticated;
REVOKE ALL ON FUNCTION erp_private.ai_mod05_dataset_allowed(jsonb),erp_private.ai_mod05_score(jsonb,jsonb,jsonb,jsonb),erp_private.ai_mod05_quality_immutable(),public.ai_mod05_evaluate(text,jsonb)FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod05_dataset_allowed(jsonb),erp_private.ai_mod05_score(jsonb,jsonb,jsonb,jsonb),public.ai_mod05_evaluate(text,jsonb)TO authenticated;
CREATE TABLE erp_private.ai_mod05_controls(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,feature text NOT NULL CHECK(feature IN('assistant','dms_jobs')),company_id bigint REFERENCES public.owner_companies(id),revision integer NOT NULL CHECK(revision>0),
 paused boolean NOT NULL,daily_limit integer CHECK(daily_limit BETWEEN 1 AND 10000),daily_usd numeric(16,6)CHECK(daily_usd>0),reason text NOT NULL CHECK(length(reason)BETWEEN 1 AND 200),actor bigint NOT NULL REFERENCES public.user_profiles(id),request_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK(feature<>'assistant'OR(company_id IS NULL AND daily_usd IS NULL)),UNIQUE(actor,request_id));
CREATE UNIQUE INDEX ai_mod05_control_revision ON erp_private.ai_mod05_controls(feature,coalesce(company_id,0),revision);
ALTER TABLE erp_private.ai_mod05_controls ENABLE ROW LEVEL SECURITY;
CREATE TABLE erp_private.ai_mod05_turn_admissions(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,session_id bigint NOT NULL REFERENCES public.erp_ai_assistant_sessions(id),actor bigint NOT NULL REFERENCES public.user_profiles(id),request_id uuid NOT NULL,input_hash text NOT NULL,
 state text NOT NULL DEFAULT'started'CHECK(state IN('started','complete','held')),created_at timestamptz NOT NULL DEFAULT clock_timestamp(),completed_at timestamptz,held_by bigint REFERENCES public.user_profiles(id),held_at timestamptz,
 UNIQUE(actor,request_id));
ALTER TABLE erp_private.ai_mod05_turn_admissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX ai_mod05_turn_rolling ON erp_private.ai_mod05_turn_admissions(created_at);
CREATE INDEX ai_mod05_turn_unresolved ON erp_private.ai_mod05_turn_admissions(session_id,actor,input_hash)WHERE state IN('started','held');
CREATE INDEX ai_mod05_feedback_worklist ON erp_private.ai_mod05_feedback(actor,id DESC);
CREATE INDEX ai_mod05_shared_worklist ON erp_private.ai_mod05_feedback(id DESC)WHERE shared;
CREATE INDEX ai_mod05_evaluation_dataset ON erp_private.ai_mod05_evaluations(dataset_id,id DESC);
REVOKE ALL ON erp_private.ai_mod05_controls,erp_private.ai_mod05_turn_admissions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.ai_mod05_operate()RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.business_principal_is_active()AND(public.current_user_has_permission('settings.ai.manage')OR public.current_user_has_permission('dms.ai_observability.admin'));
$$;
CREATE FUNCTION erp_private.ai_mod05_job_allowed(p_company bigint)RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE c erp_private.ai_mod05_controls;used bigint;
BEGIN
 FOR c IN SELECT DISTINCT ON(company_id) *FROM erp_private.ai_mod05_controls WHERE feature='dms_jobs'AND(company_id IS NULL OR company_id=p_company)ORDER BY company_id,revision DESC LOOP
  IF c.paused THEN RETURN false;END IF;
  IF c.daily_limit IS NOT NULL THEN
   SELECT count(*)INTO used FROM public.dms_ai_job_attempts a JOIN public.dms_ai_job_queue j ON j.id=a.job_id LEFT JOIN public.dms_documents d ON d.id=j.related_document_id WHERE a.started_at>clock_timestamp()-interval'24 hours'AND(c.company_id IS NULL OR d.owning_company_id=c.company_id);
   IF used>=c.daily_limit THEN RETURN false;END IF;
  END IF;
 END LOOP;RETURN true;
END $$;
CREATE FUNCTION erp_private.ai_mod05_work_open(p_company bigint,p_preparation boolean)RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT NOT EXISTS(SELECT 1 FROM(SELECT DISTINCT ON(company_id)*FROM erp_private.ai_mod05_controls WHERE feature='dms_jobs'AND(company_id IS NULL OR company_id=p_company)ORDER BY company_id,revision DESC)c WHERE c.paused OR(c.daily_usd IS NOT NULL AND NOT p_preparation));
$$;
REVOKE ALL ON FUNCTION erp_private.ai_mod05_work_open(bigint,boolean)FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.ai_mod05_control(p_data jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c erp_private.ai_mod05_controls;v_revision int;company bigint:=(p_data->>'companyId')::bigint;v_feature text:=p_data->>'feature';
BEGIN
 IF NOT erp_private.ai_mod05_operate()THEN RAISE EXCEPTION 'Global operations permission required' USING ERRCODE='42501';END IF;
 PERFORM erp_private.ai_mod05_lock_actor();
 IF v_feature NOT IN('assistant','dms_jobs')OR(v_feature='assistant'AND(company IS NOT NULL OR p_data->>'dailyUsd'IS NOT NULL))OR jsonb_typeof(p_data->'paused')IS DISTINCT FROM'boolean'OR length(coalesce(p_data->>'reason',''))NOT BETWEEN 1 AND 200 OR(p_data->>'dailyLimit'IS NOT NULL AND(p_data->>'dailyLimit')::int NOT BETWEEN 1 AND 10000)OR(p_data->>'dailyUsd'IS NOT NULL AND(p_data->>'dailyUsd')::numeric NOT BETWEEN 0.000001 AND 1000000)OR p_data->>'requestId'IS NULL THEN RAISE EXCEPTION 'Invalid operation control' USING ERRCODE='22023';END IF;
 IF company IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.owner_companies WHERE id=company AND status='active')THEN RAISE EXCEPTION 'Select active company' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('ai05-control:'||v_feature,0));
 SELECT *INTO c FROM erp_private.ai_mod05_controls WHERE actor=public.current_user_profile_id()AND request_id=(p_data->>'requestId')::uuid;
 IF FOUND THEN IF c.feature<>v_feature OR c.company_id IS DISTINCT FROM company OR c.revision<>(p_data->>'expectedRevision')::int+1 OR c.paused IS DISTINCT FROM(p_data->>'paused')::boolean OR c.daily_limit IS DISTINCT FROM(p_data->>'dailyLimit')::int OR c.daily_usd IS DISTINCT FROM(p_data->>'dailyUsd')::numeric OR c.reason IS DISTINCT FROM p_data->>'reason'THEN RAISE EXCEPTION 'Original control request changed' USING ERRCODE='PT409';END IF;RETURN jsonb_build_object('id',c.id,'replayed',true);END IF;
 SELECT coalesce(max(revision),0)INTO v_revision FROM erp_private.ai_mod05_controls c0 WHERE c0.feature=v_feature AND company_id IS NOT DISTINCT FROM company;
 IF v_revision IS DISTINCT FROM(p_data->>'expectedRevision')::int THEN RAISE EXCEPTION 'Control revision changed' USING ERRCODE='PT409';END IF;
 INSERT INTO erp_private.ai_mod05_controls(feature,company_id,revision,paused,daily_limit,daily_usd,reason,actor,request_id)VALUES(v_feature,company,v_revision+1,(p_data->>'paused')::boolean,(p_data->>'dailyLimit')::int,(p_data->>'dailyUsd')::numeric,p_data->>'reason',public.current_user_profile_id(),(p_data->>'requestId')::uuid)RETURNING id INTO c.id;
 RETURN jsonb_build_object('id',c.id,'replayed',false);
END $$;

CREATE FUNCTION public.ai_mod05_turn(p_action text,p_session bigint,p_request uuid,p_hash text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r erp_private.ai_mod05_turn_admissions;c erp_private.ai_mod05_controls;v_actor bigint:=public.current_user_profile_id();
BEGIN
 IF NOT erp_private.business_principal_is_active()OR NOT public.current_user_has_permission_any_scope('ai.assistant.use')OR NOT EXISTS(SELECT 1 FROM public.erp_ai_assistant_sessions WHERE id=p_session AND owner_user_profile_id=v_actor AND status='active')OR p_request IS NULL OR p_hash!~'^[a-f0-9]{64}$'THEN RAISE EXCEPTION 'Original turn unavailable' USING ERRCODE='42501';END IF;
 PERFORM erp_private.ai_mod05_lock_actor();
 PERFORM pg_advisory_xact_lock(hashtextextended('ai05-control:assistant',0));
 SELECT *INTO r FROM erp_private.ai_mod05_turn_admissions t0 WHERE t0.actor=v_actor AND request_id=p_request FOR UPDATE;
 IF FOUND THEN
  IF r.session_id<>p_session OR r.input_hash<>p_hash THEN RAISE EXCEPTION 'Original turn differs' USING ERRCODE='PT409';END IF;
  IF p_action='finish'THEN
   IF r.state='held'OR NOT EXISTS(SELECT 1 FROM public.erp_ai_assistant_messages m WHERE m.session_id=p_session AND m.role='assistant'AND m.safe_metadata_json->>'ai_mod05_turn_request'=p_request::text AND m.safe_metadata_json->>'ai_mod05_authority'=erp_private.ai_mod05_authority())THEN RAISE EXCEPTION 'Matching saved answer required' USING ERRCODE='42501';END IF;
   UPDATE erp_private.ai_mod05_turn_admissions SET state='complete',completed_at=coalesce(completed_at,clock_timestamp())WHERE id=r.id;RETURN jsonb_build_object('state','complete','replayed',true);END IF;
  RETURN jsonb_build_object('state',r.state,'replayed',true);
 END IF;
 IF p_action<>'begin'THEN RAISE EXCEPTION 'Turn admission missing' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM erp_private.ai_mod05_turn_admissions t0 WHERE session_id=p_session AND t0.actor=v_actor AND(state='started'OR(state='held'AND input_hash=p_hash)))THEN RAISE EXCEPTION 'Retained turn needs reconciliation; do not repeat paid work' USING ERRCODE='55000';END IF;
 SELECT *INTO c FROM erp_private.ai_mod05_controls WHERE feature='assistant'ORDER BY revision DESC LIMIT 1;
 IF c.paused OR(c.daily_limit IS NOT NULL AND(SELECT count(*)FROM erp_private.ai_mod05_turn_admissions WHERE created_at>clock_timestamp()-interval'24 hours')>=c.daily_limit)THEN RAISE EXCEPTION 'Assistant admission paused or limit reached' USING ERRCODE='55000';END IF;
 INSERT INTO erp_private.ai_mod05_turn_admissions(session_id,actor,request_id,input_hash)VALUES(p_session,v_actor,p_request,p_hash);
 RETURN jsonb_build_object('state','started','replayed',false,'authorityHash',erp_private.ai_mod05_authority());
END $$;

-- Fence queue admission at the existing native owner. Keep cancelled/settled
-- history and expired-lease recovery available while paused; never reset work.
DO $$ DECLARE body text;needle text:='AND q.attempt_count<q.max_attempts';BEGIN
 body:=pg_get_functiondef('erp_private.f07_ai_worker(text,jsonb)'::regprocedure);
 IF position(needle IN body)=0 OR position('IF p_action=''claim'' THEN' IN body)=0 OR position('IF p_action=''assert'' THEN RETURN' IN body)=0 OR position('IF p_action=''step_save'' THEN' IN body)=0 THEN RAISE EXCEPTION 'Unexpected worker claim contract';END IF;
 body:=replace(body,needle,'AND erp_private.ai_mod05_job_allowed((SELECT owning_company_id FROM public.dms_documents WHERE id=q.related_document_id)) AND erp_private.ai_mod05_work_open((SELECT owning_company_id FROM public.dms_documents WHERE id=q.related_document_id),proof.preparation_context IS NOT NULL) '||needle);
 body:=replace(body,'IF p_action=''claim'' THEN','IF p_action=''claim'' THEN PERFORM pg_advisory_xact_lock(hashtextextended(''ai05-control:dms_jobs'',0));');
 body:=replace(body,'IF p_action=''assert'' THEN RETURN','IF p_action=''assert'' THEN IF NOT erp_private.ai_mod05_work_open((SELECT owning_company_id FROM public.dms_documents WHERE id=j.related_document_id),c.preparation_context IS NOT NULL) THEN RAISE EXCEPTION ''Processing paused; retained work preserved'' USING ERRCODE=''55000''; END IF; RETURN');
 body:=replace(body,'IF p_action=''step_save'' THEN','IF p_action=''step_read'' AND c.step_receipts->(p_data->>''step'') IS NULL AND NOT erp_private.ai_mod05_work_open((SELECT owning_company_id FROM public.dms_documents WHERE id=j.related_document_id),false) THEN RAISE EXCEPTION ''New processing step paused; retain work'' USING ERRCODE=''55000''; END IF; IF p_action=''step_save'' THEN');
 EXECUTE body;
END $$;
CREATE FUNCTION erp_private.ai_mod05_price(p_provider text,p_model text,p_input bigint,p_output bigint,p_as_of timestamptz DEFAULT clock_timestamp())RETURNS numeric LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE r public.erp_ai_model_cost_rates;day date:=(p_as_of AT TIME ZONE'Asia/Dubai')::date;
BEGIN
 SELECT *INTO r FROM public.erp_ai_model_cost_rates WHERE provider_type=p_provider AND model_id=p_model AND is_active AND effective_from<=day AND(effective_to IS NULL OR effective_to>=day)ORDER BY effective_from DESC,id DESC LIMIT 1;
 IF r.id IS NULL OR r.requires_confirmation OR r.currency_code<>'USD'THEN RETURN NULL;END IF;
 IF r.rate_type='zero'THEN RETURN 0;END IF;
 IF r.rate_type<>'token'OR p_input IS NULL OR p_output IS NULL OR p_input<0 OR p_output<0 OR r.input_cost_per_1m_tokens IS NULL OR r.output_cost_per_1m_tokens IS NULL OR r.input_cost_per_1m_tokens<0 OR r.output_cost_per_1m_tokens<0 THEN RETURN NULL;END IF;
 RETURN(p_input*r.input_cost_per_1m_tokens+p_output*r.output_cost_per_1m_tokens)/1000000;
END $$;
CREATE UNIQUE INDEX ai_mod05_stage_usage_once ON public.erp_ai_usage_logs((metadata_json->>'ai_mod05_stage_key'))WHERE metadata_json?'ai_mod05_stage_key';
CREATE FUNCTION erp_private.ai_mod05_reserve(p_job bigint,p_quote jsonb,p_portrait boolean)RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE cfg public.erp_ai_provider_configs;c erp_private.ai_mod05_controls;company bigint;ceiling numeric;used numeric;reserved numeric;unknowns bigint;
BEGIN
 SELECT d.owning_company_id INTO company FROM public.dms_ai_job_queue q JOIN public.dms_documents d ON d.id=q.related_document_id WHERE q.id=p_job;
 IF p_portrait THEN ceiling:=0;
 ELSIF p_quote IS NOT NULL THEN
  IF jsonb_typeof(p_quote)IS DISTINCT FROM'object'OR(p_quote->>'inputByteCeiling')::bigint NOT BETWEEN 1 AND 2097152 OR(p_quote->>'outputTokenCeiling')::int NOT BETWEEN 1 AND 16000 THEN RAISE EXCEPTION 'Invalid bounded cost quote' USING ERRCODE='22023';END IF;
  SELECT *INTO cfg FROM public.erp_ai_provider_configs WHERE id=(p_quote->>'configId')::bigint AND is_active AND is_enabled AND deleted_at IS NULL AND model_id=p_quote->>'model';
  IF cfg.id IS NULL THEN RAISE EXCEPTION 'Current cost configuration changed' USING ERRCODE='55000';END IF;
  ceiling:=ceil(erp_private.ai_mod05_price(cfg.provider_type,cfg.model_id,(p_quote->>'inputByteCeiling')::bigint+4096,(p_quote->>'outputTokenCeiling')::bigint)*1000000)/1000000;
 END IF;
 FOR c IN SELECT DISTINCT ON(company_id)*FROM erp_private.ai_mod05_controls WHERE feature='dms_jobs'AND(company_id IS NULL OR company_id=company)ORDER BY company_id,revision DESC LOOP
  IF c.paused THEN RAISE EXCEPTION 'Processing paused; retain work' USING ERRCODE='55000';END IF;
  IF c.daily_usd IS NOT NULL THEN
   IF ceiling IS NULL THEN RAISE EXCEPTION 'Finite estimated budget requires confirmed bounded pricing; unpriced OCR is held' USING ERRCODE='55000';END IF;
   SELECT coalesce(sum(l.estimated_cost),0),count(*)FILTER(WHERE l.estimated_cost IS NULL OR l.metadata_json->>'cost_currency'IS DISTINCT FROM'USD')INTO used,unknowns FROM public.erp_ai_usage_logs l JOIN public.dms_ai_job_queue j ON j.id=l.ai_job_id LEFT JOIN public.dms_documents d ON d.id=j.related_document_id WHERE l.created_at>clock_timestamp()-interval'24 hours'AND(c.company_id IS NULL OR d.owning_company_id=c.company_id);
   IF unknowns>0 THEN RAISE EXCEPTION 'Unknown queue costs need reconciliation before new paid admission' USING ERRCODE='55000';END IF;
   SELECT coalesce(sum((v.value->>'costReservation')::numeric),0),count(*)FILTER(WHERE v.value->>'costReservation'IS NULL)INTO reserved,unknowns FROM erp_private.f07_job_claims proof JOIN public.dms_ai_job_queue j ON j.id=proof.job_id LEFT JOIN public.dms_documents d ON d.id=j.related_document_id CROSS JOIN LATERAL jsonb_each(proof.preparation_stages)v WHERE(v.value->>'startedAt')::timestamptz>clock_timestamp()-interval'24 hours'AND(c.company_id IS NULL OR d.owning_company_id=c.company_id)AND NOT EXISTS(SELECT 1 FROM public.erp_ai_usage_logs l WHERE l.metadata_json->>'ai_mod05_stage_key'=proof.job_id||':'||v.key);
   IF unknowns>0 OR used+reserved+ceiling>c.daily_usd THEN RAISE EXCEPTION 'Estimated budget reserved or uncertain; retain the original work' USING ERRCODE='55000';END IF;
  END IF;
 END LOOP;RETURN ceiling;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod05_price(text,text,bigint,bigint,timestamptz),erp_private.ai_mod05_reserve(bigint,jsonb,boolean)FROM PUBLIC,anon,authenticated,service_role;
ALTER FUNCTION erp_private.ai_mod04_preparation_worker(text,jsonb)RENAME TO ai_mod05_preparation_worker_base;
CREATE FUNCTION erp_private.ai_mod04_preparation_worker(p_action text,p_data jsonb)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.dms_ai_job_queue;stages jsonb;r jsonb;reservation numeric;portrait boolean;v jsonb;cfg public.erp_ai_provider_configs;cost numeric;
BEGIN
 IF current_setting('request.jwt.claims',true)::jsonb->>'role'IS DISTINCT FROM'service_role'THEN RAISE EXCEPTION 'Worker only' USING ERRCODE='42501';END IF;
 IF p_action IN('begin','complete')THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('ai05-control:dms_jobs',0));
  j:=erp_private.f07_assert_job((p_data->>'jobId')::bigint,(p_data->>'token')::uuid);
  SELECT preparation_stages INTO stages FROM erp_private.f07_job_claims WHERE job_id=j.id;
  portrait:=EXISTS(SELECT 1 FROM public.dms_documents d JOIN public.dms_document_types t ON t.id=d.document_type_id WHERE d.id=j.related_document_id AND(t.type_code IN('EMPLOYEE_PHOTO','DEPENDENT_PHOTO')OR erp_private.ai_mod04_profile(t.id,true)->>'applicability'='portrait'));
  IF p_action='begin'AND stages->(p_data->>'stage')IS NULL THEN reservation:=erp_private.ai_mod05_reserve(j.id,p_data->'costQuote',portrait);END IF;
 END IF;
 r:=erp_private.ai_mod05_preparation_worker_base(p_action,p_data);
 IF p_action='begin'AND r->>'state'='started'THEN UPDATE erp_private.f07_job_claims SET preparation_stages=jsonb_set(preparation_stages,ARRAY[p_data->>'stage','costReservation'],coalesce(to_jsonb(reservation),'null'))WHERE job_id=j.id;END IF;
 IF p_action='complete'AND stages->(p_data->>'stage')->>'state'='started'THEN
  v:=p_data->'value';SELECT *INTO cfg FROM public.erp_ai_provider_configs WHERE id=(v->>'configId')::bigint;
  cost:=CASE WHEN portrait THEN 0 ELSE erp_private.ai_mod05_price(cfg.provider_type,v->>'model',(v->>'promptTokens')::bigint,(v->>'completionTokens')::bigint,(stages->(p_data->>'stage')->>'startedAt')::timestamptz)END;
  INSERT INTO public.erp_ai_usage_logs(provider_config_id,feature_area,operation_type,model_id,status,input_token_count,output_token_count,estimated_cost,duration_ms,metadata_json,created_by,document_id,ai_job_id)
   VALUES(cfg.id,'dms','preparation_stage',v->>'model','success',(v->>'promptTokens')::integer,(v->>'completionTokens')::integer,cost,(v->>'durationMs')::integer,jsonb_build_object('ai_mod05_stage_key',j.id||':'||(p_data->>'stage'),'cost_currency',CASE WHEN cost IS NOT NULL THEN'USD'END,'prompt_version',v->>'promptVersion'),j.created_by,j.related_document_id,j.id)ON CONFLICT DO NOTHING;
 END IF;RETURN r;
END $$;

CREATE FUNCTION public.ai_mod05_operations()RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT erp_private.business_principal_is_active()OR NOT(public.current_user_has_permission('settings.ai.usage.view')OR public.current_user_has_permission('settings.ai.view')OR public.current_user_has_permission('settings.ai.manage')OR public.current_user_has_permission('dms.ai_observability.view')OR public.current_user_has_permission('dms.ai_observability.admin'))THEN RAISE EXCEPTION 'Global monitoring required' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('asOf',clock_timestamp(),'controls',(SELECT coalesce(jsonb_agg(jsonb_build_object('feature',x.feature,'companyId',x.company_id,'companyName',c.legal_name_en,'revision',x.revision,'paused',x.paused,'dailyLimit',x.daily_limit,'dailyUsd',x.daily_usd)),'[]')FROM(SELECT DISTINCT ON(feature,company_id)*FROM erp_private.ai_mod05_controls ORDER BY feature,company_id,revision DESC)x LEFT JOIN public.owner_companies c ON c.id=x.company_id),
 'versions',jsonb_build_object('contract','erp-ai/1','preparation','dms-preparation/1'),
 'queue',(SELECT coalesce(jsonb_object_agg(job_status,n),'{}')FROM(SELECT job_status,count(*)n FROM public.dms_ai_job_queue GROUP BY job_status)x),
 'usage',(SELECT jsonb_build_object('calls',count(*),'knownCostUsd',coalesce(sum(estimated_cost)FILTER(WHERE estimated_cost IS NOT NULL AND metadata_json->>'cost_currency'='USD'),0),'unknownCostCalls',count(*)FILTER(WHERE estimated_cost IS NULL OR metadata_json->>'cost_currency'IS DISTINCT FROM'USD'),'inputTokens',sum(input_token_count),'outputTokens',sum(output_token_count),'unknownTokenCalls',count(*)FILTER(WHERE input_token_count IS NULL OR output_token_count IS NULL),'latencySample',count(duration_ms),'averageLatencyMs',avg(duration_ms))FROM public.erp_ai_usage_logs WHERE created_at>clock_timestamp()-interval'24 hours'),
 'profiles',(SELECT jsonb_build_object('active',count(*)FILTER(WHERE ai_active_preparation_profile IS NOT NULL),'draft',count(*)FILTER(WHERE ai_preparation_profile->>'status'='draft'),'stale',count(*)FILTER(WHERE NOT erp_private.ai_mod04_profile_current(id)))FROM public.dms_document_types WHERE deleted_at IS NULL),
 'companies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',legal_name_en)ORDER BY legal_name_en),'[]')FROM public.owner_companies WHERE status='active'),
 'models',(SELECT coalesce(jsonb_agg(jsonb_build_object('code',config_code,'model',model_id,'enabled',is_enabled,'purpose',purpose)ORDER BY config_code),'[]')FROM public.erp_ai_provider_configs WHERE is_active AND deleted_at IS NULL),
 'freshness',jsonb_build_object('lastIndexUpdate',(SELECT max(updated_at)FROM public.dms_document_content_chunks WHERE is_active AND deleted_at IS NULL),'pendingChunks',(SELECT count(*)FROM public.dms_document_content_chunks WHERE is_active AND deleted_at IS NULL AND embedding_status='pending'),'failedChunks',(SELECT count(*)FROM public.dms_document_content_chunks WHERE is_active AND deleted_at IS NULL AND embedding_status='failed'),'pendingReviews',(SELECT count(*)FROM public.dms_review_queue WHERE status='open'AND deleted_at IS NULL)),
 'heldTurns',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'reference','AI-TURN-'||lpad(id::text,6,'0'),'state',state,'createdAt',created_at)ORDER BY id DESC),'[]')FROM(SELECT id,state,created_at FROM erp_private.ai_mod05_turn_admissions WHERE state IN('started','held')ORDER BY id DESC LIMIT 25)x));
END $$;

CREATE FUNCTION public.ai_mod05_snapshot(p_filters jsonb DEFAULT'{}')RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE f jsonb;d jsonb;e jsonb;
BEGIN
 IF NOT erp_private.business_principal_is_active()OR jsonb_typeof(p_filters)IS DISTINCT FROM'object'OR octet_length(p_filters::text)>2048 THEN RAISE EXCEPTION 'Current access required' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_filters)k WHERE k<>ALL(ARRAY['feedbackBefore','datasetBefore','evaluationBefore','state','source','model','profile','dateFrom']))OR EXISTS(SELECT 1 FROM unnest(ARRAY['feedbackBefore','datasetBefore','evaluationBefore'])k WHERE p_filters?k AND(jsonb_typeof(p_filters->k)IS DISTINCT FROM'number'OR p_filters->>k!~'^[1-9][0-9]{0,15}$'))OR EXISTS(SELECT 1 FROM unnest(ARRAY['state','source','model','profile','dateFrom'])k WHERE p_filters?k AND(jsonb_typeof(p_filters->k)IS DISTINCT FROM'string'OR length(p_filters->>k)NOT BETWEEN 1 AND 200))OR(p_filters?'state'AND p_filters->>'state'NOT IN('pending','accepted','disagreed','rejected'))OR(p_filters?'source'AND p_filters->>'source'NOT IN('assistant','intake','preparation','extraction'))THEN RAISE EXCEPTION 'Invalid quality filters' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(x.row ORDER BY x.id DESC),'[]')INTO f FROM(SELECT id,jsonb_build_object('id',id,'reference','AI-FB-'||lpad(id::text,6,'0'),'source',jsonb_build_object('kind',source_kind,'id',source_id,'documentId',document_id),'category',category,'correction',correction,'state',state,'createdAt',created_at,'canReview',shared AND state='pending'AND actor<>public.current_user_profile_id()AND public.current_user_has_permission_any_scope('ai.data_quality.review'),'provenance',snapshot->'provenance')row FROM erp_private.ai_mod05_feedback WHERE(id<coalesce((p_filters->>'feedbackBefore')::bigint,9223372036854775807))AND(p_filters->>'state'IS NULL OR state=p_filters->>'state')AND(p_filters->>'source'IS NULL OR source_kind=p_filters->>'source')AND(p_filters->>'model'IS NULL OR snapshot#>>'{provenance,model}'=p_filters->>'model')AND(p_filters->>'profile'IS NULL OR snapshot#>>'{provenance,profile}'=p_filters->>'profile')AND(p_filters->>'dateFrom'IS NULL OR created_at>=(p_filters->>'dateFrom')::timestamptz)ORDER BY id DESC LIMIT 26)x;
 SELECT coalesce(jsonb_agg(x.row ORDER BY x.id DESC),'[]')INTO d FROM(SELECT id,jsonb_build_object('id',id,'reference','AI-DS-'||lpad(id::text,6,'0'),'definition',definition,'sha256',sha256,'state',state,'canApprove',state='draft'AND actor<>public.current_user_profile_id())row FROM erp_private.ai_mod05_datasets WHERE id<coalesce((p_filters->>'datasetBefore')::bigint,9223372036854775807)ORDER BY id DESC LIMIT 26)x;
 SELECT coalesce(jsonb_agg(x.row ORDER BY x.id DESC),'[]')INTO e FROM(SELECT id,jsonb_build_object('id',id,'reference','AI-EV-'||lpad(id::text,6,'0'),'datasetId',dataset_id,'candidate',candidate,'result',result,'state',state,'createdAt',created_at,'reviewedAt',reviewed_at,'canApprove',state='draft'AND actor<>public.current_user_profile_id()AND result->'eligible'='true'::jsonb)row FROM erp_private.ai_mod05_evaluations WHERE id<coalesce((p_filters->>'evaluationBefore')::bigint,9223372036854775807)ORDER BY id DESC LIMIT 26)x;
 RETURN jsonb_build_object('feedback',f,'datasets',d,'evaluations',e,'canOperate',erp_private.ai_mod05_operate(),'canEvaluate',public.current_user_has_permission('settings.ai.manage'));
END $$;
CREATE FUNCTION public.ai_mod05_version()RETURNS integer LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT CASE WHEN erp_private.business_principal_is_active()THEN 1 END;$$;
CREATE FUNCTION erp_private.ai_mod05_profile_guard()RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE config jsonb;e erp_private.ai_mod05_evaluations;ref text;
BEGIN
 IF NEW.ai_preparation_profile IS NOT DISTINCT FROM OLD.ai_preparation_profile OR NEW.ai_preparation_profile->>'status'NOT IN('evaluated','approved','active')THEN RETURN NEW;END IF;
 SELECT configuration INTO config FROM erp_private.ai_mod04_profile_revisions WHERE document_type_id=NEW.id AND revision=(NEW.ai_preparation_profile->>'revision')::int;
 ref:=config->>'evaluationReference';IF ref IS NULL OR ref!~'^AI-EV-[0-9]{1,16}$'THEN RAISE EXCEPTION 'Select a governed approved evaluation reference' USING ERRCODE='23514';END IF;
 SELECT *INTO e FROM erp_private.ai_mod05_evaluations WHERE id=substring(ref FROM 7)::bigint AND state='approved';
 IF e.id IS NULL OR e.result->'eligible'IS DISTINCT FROM'true'::jsonb OR e.candidate->>'mode'IS DISTINCT FROM'reviewed_provider_results'OR e.candidate->>'documentTypeId'IS DISTINCT FROM NEW.id::text OR e.candidate->>'schemaHash'IS DISTINCT FROM erp_private.ai_mod04_type_schema_hash(NEW.id)OR e.candidate->>'promptVersion'IS DISTINCT FROM config->>'promptVersion'OR e.candidate->>'profileRulesHash'IS DISTINCT FROM encode(sha256(convert_to((config-ARRAY['status','revision','approvedBy','approvedAt','evaluationReference'])::text,'UTF8')),'hex')THEN RAISE EXCEPTION 'Exact profile/schema/provider evaluation required; synthetic checks do not activate AI' USING ERRCODE='23514';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER ai_mod05_profile_quality BEFORE UPDATE ON public.dms_document_types FOR EACH ROW EXECUTE FUNCTION erp_private.ai_mod05_profile_guard();
CREATE FUNCTION public.ai_mod05_profile_context(p_type bigint)RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE config jsonb;
BEGIN
 IF NOT erp_private.business_principal_is_active()OR NOT(public.current_user_has_permission('dms.admin')OR public.current_user_has_permission('dms.documents.manage_types'))THEN RAISE EXCEPTION 'Type configuration required' USING ERRCODE='42501';END IF;
 config:=erp_private.ai_mod04_profile(p_type,false);IF config IS NULL THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('documentTypeId',p_type,'profileRulesHash',encode(sha256(convert_to((config-ARRAY['status','revision','approvedBy','approvedAt','evaluationReference'])::text,'UTF8')),'hex'),'schemaHash',erp_private.ai_mod04_type_schema_hash(p_type),'promptVersion',config->>'promptVersion');
END $$;
CREATE FUNCTION public.ai_mod05_model_gate(p_job bigint,p_token uuid,p_model text,p_prompt text)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.dms_ai_job_queue;c jsonb;profile jsonb;e erp_private.ai_mod05_evaluations;
BEGIN
 IF current_setting('request.jwt.claims',true)::jsonb->>'role'IS DISTINCT FROM'service_role'THEN RAISE EXCEPTION 'Worker only' USING ERRCODE='42501';END IF;
 j:=erp_private.f07_assert_job(p_job,p_token);SELECT preparation_context INTO c FROM erp_private.f07_job_claims WHERE job_id=j.id;
 profile:=erp_private.ai_mod04_profile(coalesce((c->'target'->>'documentTypeId')::bigint,(c->>'documentTypeId')::bigint,(SELECT document_type_id FROM public.dms_documents WHERE id=j.related_document_id)),true);
 IF profile IS NULL THEN RETURN jsonb_build_object('success',true,'quality','unconfigured_profile_human_review');END IF;
 SELECT *INTO e FROM erp_private.ai_mod05_evaluations WHERE id=substring(profile->>'evaluationReference' FROM 7)::bigint AND state='approved';
 IF e.id IS NULL OR e.candidate->>'model'IS DISTINCT FROM p_model OR e.candidate->>'promptVersion'IS DISTINCT FROM p_prompt OR e.result->'eligible'IS DISTINCT FROM'true'::jsonb THEN RAISE EXCEPTION 'Actual provider or prompt differs from approved quality evidence' USING ERRCODE='55000';END IF;
 RETURN jsonb_build_object('success',true,'quality','reviewed_provider_results');
END $$;
CREATE FUNCTION public.ai_mod05_hold_turn(p_id bigint)RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r erp_private.ai_mod05_turn_admissions;
BEGIN
 IF NOT erp_private.business_principal_is_active()THEN RAISE EXCEPTION 'Current actor required' USING ERRCODE='42501';END IF;
 PERFORM erp_private.ai_mod05_lock_actor();
 SELECT *INTO r FROM erp_private.ai_mod05_turn_admissions WHERE id=p_id FOR UPDATE;
 IF r.id IS NULL OR(r.actor<>public.current_user_profile_id()AND NOT erp_private.ai_mod05_operate())THEN RAISE EXCEPTION 'Own admission or operations authority required' USING ERRCODE='42501';END IF;
 IF r.state='complete'THEN RAISE EXCEPTION 'Completed turn is retained as complete' USING ERRCODE='23514';END IF;
 UPDATE erp_private.ai_mod05_turn_admissions SET state='held',held_by=coalesce(held_by,public.current_user_profile_id()),held_at=coalesce(held_at,clock_timestamp())WHERE id=r.id;
 RETURN jsonb_build_object('id',r.id,'replayed',r.state='held');
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod05_profile_guard(),public.ai_mod05_profile_context(bigint),public.ai_mod05_model_gate(bigint,uuid,text,text),public.ai_mod05_hold_turn(bigint)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.ai_mod05_profile_context(bigint),public.ai_mod05_hold_turn(bigint)TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_mod05_model_gate(bigint,uuid,text,text)TO service_role;
REVOKE ALL ON FUNCTION erp_private.ai_mod05_operate(),erp_private.ai_mod05_job_allowed(bigint),erp_private.ai_mod05_preparation_worker_base(text,jsonb),erp_private.ai_mod04_preparation_worker(text,jsonb),public.ai_mod05_control(jsonb),public.ai_mod05_turn(text,bigint,uuid,text),public.ai_mod05_operations(),public.ai_mod05_snapshot(jsonb),public.ai_mod05_version()FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod05_operate(),public.ai_mod05_control(jsonb),public.ai_mod05_turn(text,bigint,uuid,text),public.ai_mod05_operations(),public.ai_mod05_snapshot(jsonb),public.ai_mod05_version()TO authenticated;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod04_preparation_worker(text,jsonb)TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
