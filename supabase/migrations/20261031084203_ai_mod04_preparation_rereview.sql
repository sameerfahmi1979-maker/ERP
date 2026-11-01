-- AI-MOD-04: compatible, additive preparation candidates. No provider/worker,
-- workflow, reminder policy, business-record backfill or historical reprocessing activation.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '45s';

ALTER TABLE public.dms_document_types ADD COLUMN IF NOT EXISTS ai_preparation_profile jsonb;
ALTER TABLE public.dms_document_types ADD COLUMN IF NOT EXISTS ai_active_preparation_profile jsonb;
ALTER TABLE erp_private.f07_job_claims ADD COLUMN IF NOT EXISTS preparation_context jsonb;
ALTER TABLE erp_private.f07_job_claims ADD COLUMN IF NOT EXISTS preparation_stages jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.ai_mod04_duplicate_advisory(p_sha256 text, p_size bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE found_document record; own_session text;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF p_sha256 IS NULL OR p_sha256 !~ '^[a-f0-9]{64}$' OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 52428800 THEN RAISE EXCEPTION 'Invalid file fingerprint' USING ERRCODE='22023'; END IF;
 -- Ordinary RLS and an explicit document read guard. A hidden collision produces
 -- precisely the same advisory as no visible match; authoritative admission follows.
 SELECT d.id,d.document_no,d.title INTO found_document
 FROM public.dms_document_files f JOIN public.dms_documents d ON d.id=f.document_id
 WHERE f.sha256_hash=p_sha256 AND f.file_size_bytes=p_size AND f.deleted_at IS NULL
 AND d.deleted_at IS NULL AND erp_private.document_permission(d.id,'dms.documents.view')
 ORDER BY d.id LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('status','existing_document','authoritative',false,'documentId',found_document.id,'documentNo',found_document.document_no,'title',found_document.title); END IF;
 SELECT s.session_code INTO own_session FROM public.dms_upload_sessions s
 WHERE s.uploaded_by=public.current_user_profile_id() AND s.sha256_hash=p_sha256 AND s.file_size_bytes=p_size
 AND s.deleted_at IS NULL AND s.document_id IS NULL AND s.expires_at>clock_timestamp()
 AND s.status NOT IN ('discarded','failed','completed') ORDER BY s.id LIMIT 1;
 IF FOUND THEN RETURN jsonb_build_object('status','retained_upload','authoritative',false,'sessionCode',own_session); END IF;
 RETURN jsonb_build_object('status','no_visible_match','authoritative',false);
END $$;
REVOKE ALL ON FUNCTION public.ai_mod04_duplicate_advisory(text,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ai_mod04_duplicate_advisory(text,bigint) TO authenticated;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_type_schema_hash(p_type bigint)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT encode(sha256(convert_to(jsonb_build_object('type',jsonb_build_object('id',t.id,'code',t.type_code,'name',t.name_en,'category',t.category_id,'confidentiality',t.default_confidentiality,'expiry',t.requires_expiry_tracking),'definitions',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]'::jsonb) FROM public.dms_metadata_definitions m WHERE m.document_type_id=t.id AND m.is_active AND m.deleted_at IS NULL))::text,'UTF8')),'hex') FROM public.dms_document_types t WHERE id=p_type;
$$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_type_schema_hash(bigint) FROM PUBLIC,anon,authenticated,service_role;
-- Public type rows store only revision/status/hash pointers. Full scoped rules stay private.
CREATE OR REPLACE FUNCTION erp_private.ai_mod04_profile(p_type bigint,p_active boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE pointer jsonb; result jsonb;
BEGIN
 SELECT CASE WHEN p_active THEN coalesce(t.ai_active_preparation_profile,t.ai_preparation_profile) ELSE t.ai_preparation_profile END INTO pointer FROM public.dms_document_types t WHERE t.id=p_type;
 IF pointer IS NULL THEN RETURN NULL; END IF;
 SELECT r.configuration INTO result FROM erp_private.ai_mod04_profile_revisions r WHERE r.document_type_id=p_type AND r.revision=(pointer->>'revision')::integer AND r.profile_hash=pointer->>'hash' AND r.configuration->>'status'=pointer->>'status';
 IF result IS NULL THEN RAISE EXCEPTION 'Profile revision proof unavailable' USING ERRCODE='55000'; END IF;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_profile(bigint,boolean) FROM PUBLIC,anon,authenticated,service_role;

-- Short source locks protect a transaction's exact reviewed snapshot. They are
-- released before every provider/network call; NOWAIT reports a safe retry.
CREATE OR REPLACE FUNCTION erp_private.ai_mod04_lock_source(p_document bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM t.id FROM public.dms_document_types t JOIN public.dms_documents d ON d.document_type_id=t.id WHERE d.id=p_document FOR SHARE OF t NOWAIT;
 PERFORM m.id FROM public.dms_metadata_definitions m JOIN public.dms_documents d ON d.document_type_id=m.document_type_id WHERE d.id=p_document ORDER BY m.id FOR SHARE OF m NOWAIT;
 PERFORM f.id FROM public.dms_document_files f WHERE f.document_id=p_document ORDER BY f.id FOR SHARE NOWAIT;
 PERFORM v.id FROM public.dms_document_metadata_values v WHERE v.document_id=p_document ORDER BY v.id FOR SHARE NOWAIT;
 PERFORM l.id FROM public.dms_document_links l WHERE l.document_id=p_document ORDER BY l.id FOR SHARE NOWAIT;
 PERFORM e.id FROM public.employees e JOIN public.dms_document_links l ON l.entity_type='employee' AND l.entity_id=e.id AND l.deleted_at IS NULL WHERE l.document_id=p_document ORDER BY e.id FOR SHARE OF e NOWAIT;
 PERFORM e.id FROM public.employee_dependents e JOIN public.dms_document_links l ON l.entity_type='employee_dependent' AND l.entity_id=e.id AND l.deleted_at IS NULL WHERE l.document_id=p_document ORDER BY e.id FOR SHARE OF e NOWAIT;
 PERFORM i.id FROM public.employee_identity_documents i JOIN public.dms_document_links l ON l.entity_type='employee' AND l.entity_id=i.employee_id AND l.deleted_at IS NULL WHERE l.document_id=p_document ORDER BY i.id FOR SHARE OF i NOWAIT;
 PERFORM c.id FROM public.owner_companies c JOIN public.dms_document_links l ON l.entity_type='company' AND l.entity_id=c.id AND l.deleted_at IS NULL WHERE l.document_id=p_document ORDER BY c.id FOR SHARE OF c NOWAIT;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_lock_source(bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_lock_definition_parent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM t.id FROM public.dms_document_types t WHERE t.id=CASE WHEN TG_OP='DELETE' THEN OLD.document_type_id ELSE NEW.document_type_id END OR (TG_OP='UPDATE' AND t.id=OLD.document_type_id) ORDER BY t.id FOR UPDATE NOWAIT;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_lock_definition_parent() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ai_mod04_lock_definition_parent BEFORE INSERT OR UPDATE OR DELETE ON public.dms_metadata_definitions FOR EACH ROW EXECUTE FUNCTION erp_private.ai_mod04_lock_definition_parent();

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_source(p_document bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT jsonb_build_object('documentId',d.id,'documentNo',d.document_no,'documentTypeId',d.document_type_id,'categoryId',d.category_id,
 'snapshot',encode(sha256(convert_to(jsonb_build_object('review',erp_private.f07_review_fingerprint(d.id),'typeSchema',erp_private.ai_mod04_type_schema_hash(t.id),'companies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'name',c.legal_name_en,'revision',c.updated_at,'status',c.status) ORDER BY c.id),'[]'::jsonb) FROM public.dms_document_links l JOIN public.owner_companies c ON c.id=l.entity_id WHERE l.document_id=d.id AND l.entity_type='company' AND l.deleted_at IS NULL),
   'subjectVersions',(SELECT coalesce(jsonb_agg(x.subject ORDER BY x.subject::text),'[]'::jsonb) FROM (SELECT jsonb_build_object('kind','employee','id',e.id,'name',e.full_name_en,'revision',e.workspace_revision,'identityVersions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'hash',encode(sha256(convert_to(to_jsonb(i)::text,'UTF8')),'hex')) ORDER BY i.id),'[]'::jsonb) FROM public.employee_identity_documents i WHERE i.employee_id=e.id)) subject FROM public.dms_document_links l JOIN public.employees e ON e.id=l.entity_id WHERE l.document_id=d.id AND l.entity_type='employee' AND l.deleted_at IS NULL UNION ALL SELECT jsonb_build_object('kind','employee_dependent','id',e.id,'name',e.dependent_name_en,'revision',e.workspace_revision) FROM public.dms_document_links l JOIN public.employee_dependents e ON e.id=l.entity_id WHERE l.document_id=d.id AND l.entity_type='employee_dependent' AND l.deleted_at IS NULL)x),'profile',erp_private.ai_mod04_profile(t.id,true),'definitions',(SELECT coalesce(jsonb_agg(to_jsonb(m) ORDER BY m.id),'[]'::jsonb) FROM public.dms_metadata_definitions m WHERE m.document_type_id=t.id AND m.is_active AND m.deleted_at IS NULL),
   'text',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'textHash',encode(sha256(convert_to(coalesce(f.ocr_text,''),'UTF8')),'hex')) ORDER BY f.id),'[]'::jsonb) FROM public.dms_document_files f WHERE f.document_id=d.id AND f.version_id=d.current_version_id AND f.deleted_at IS NULL))::text,'UTF8')),'hex'),
 'current',jsonb_build_object('title',d.title,'description',d.description,'issue_date',d.issue_date,'expiry_date',d.expiry_date),
 'profile',erp_private.ai_mod04_profile(t.id,true),'profileHash',encode(sha256(convert_to(coalesce(erp_private.ai_mod04_profile(t.id,true),'null'::jsonb)::text,'UTF8')),'hex'),
 'subject',(SELECT CASE WHEN count(*)=1 THEN (jsonb_agg(x.subject)->0) ELSE NULL END FROM (
   SELECT jsonb_build_object('kind','employee','id',e.id,'name',e.full_name_en) subject FROM public.dms_document_links l JOIN public.employees e ON e.id=l.entity_id WHERE l.document_id=d.id AND l.entity_type='employee' AND l.deleted_at IS NULL AND e.deleted_at IS NULL
   UNION SELECT jsonb_build_object('kind','employee_dependent','id',e.id,'name',e.dependent_name_en) FROM public.dms_document_links l JOIN public.employee_dependents e ON e.id=l.entity_id WHERE l.document_id=d.id AND l.entity_type='employee_dependent' AND l.deleted_at IS NULL AND e.deleted_at IS NULL
   UNION SELECT jsonb_build_object('kind','company','id',company.id,'name',company.legal_name_en) FROM public.dms_document_links l JOIN public.owner_companies company ON company.id=l.entity_id WHERE l.document_id=d.id AND l.entity_type='company' AND l.deleted_at IS NULL AND company.status='active' AND NOT EXISTS(SELECT 1 FROM public.dms_document_links person WHERE person.document_id=d.id AND person.deleted_at IS NULL AND person.entity_type IN ('employee','employee_dependent'))
  )x),'typeName',t.name_en,'typeCode',t.type_code,
 'fields',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.id,'code',m.field_code,'label',m.field_label_en,'type',m.field_type,'required',(coalesce(m.is_required,false) OR coalesce(erp_private.ai_mod04_profile(t.id,true)->'requiredFields' ? m.field_code,false)),'aiExtractable',coalesce(m.is_ai_extractable,false),
    'current',coalesce(v.value_text,v.value_number::text,v.value_date::text,v.value_datetime::text,v.value_boolean::text,v.value_json::text)) ORDER BY m.id)
  FROM public.dms_metadata_definitions m LEFT JOIN public.dms_document_metadata_values v ON v.definition_id=m.id AND v.document_id=d.id AND v.deleted_at IS NULL
  WHERE m.document_type_id=t.id AND m.is_active AND m.deleted_at IS NULL),'[]'::jsonb),
 'files',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'versionId',f.version_id,'sha256',f.sha256_hash,'name',f.file_name,'mime',f.mime_type,
   'size',f.file_size_bytes,'text',left(f.ocr_text,100000),'bucket',f.storage_bucket,'path',f.storage_path) ORDER BY f.id)
 FROM public.dms_document_files f WHERE f.document_id=d.id AND f.version_id=d.current_version_id AND f.deleted_at IS NULL AND f.file_role='original'),'[]'::jsonb),
 'existingTags',coalesce((SELECT jsonb_agg(jsonb_build_object('id',tag.id,'name',tag.tag_name) ORDER BY tag.id) FROM (SELECT id,tag_name FROM public.dms_tags WHERE is_active AND deleted_at IS NULL ORDER BY id LIMIT 1000) tag),'[]'::jsonb))
 FROM public.dms_documents d LEFT JOIN public.dms_document_types t ON t.id=d.document_type_id
 WHERE d.id=p_document AND d.deleted_at IS NULL;
$$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_source(bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_preparation(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor bigint:=public.current_user_profile_id(); doc bigint; s jsonb; context jsonb; key uuid; job bigint; r jsonb; j public.dms_ai_job_queue;
 ids bigint[]; n integer; digest text;
BEGIN
 IF auth.uid() IS NULL OR actor IS NULL OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF p_action IS NULL OR p_action NOT IN ('snapshot','start','status','cancel','recover') OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>32768 THEN RAISE EXCEPTION 'Invalid preparation request' USING ERRCODE='22023'; END IF;
 doc:=(p_data->>'documentId')::bigint;
 IF NOT erp_private.document_permission(doc,'dms.documents.view') OR NOT erp_private.document_permission(doc,'dms.documents.preview')
  OR NOT (erp_private.document_permission(doc,'dms.documents.edit') OR erp_private.document_permission(doc,'dms.admin')) THEN RAISE EXCEPTION 'Preparation access unavailable' USING ERRCODE='42501'; END IF;
 IF NOT erp_private.ai_mod04_subjects_allowed(doc) THEN RAISE EXCEPTION 'Linked subject access unavailable' USING ERRCODE='42501'; END IF;
 IF p_action IN ('status','cancel') THEN
  PERFORM q.id FROM public.dms_ai_job_queue q WHERE q.id=(p_data->>'jobId')::bigint AND q.related_document_id=doc AND q.created_by=actor FOR UPDATE;
  PERFORM c.job_id FROM erp_private.f07_job_claims c WHERE c.job_id=(p_data->>'jobId')::bigint FOR UPDATE;
 END IF;
 PERFORM 1 FROM public.dms_documents WHERE id=doc AND deleted_at IS NULL AND NOT is_archived AND status NOT IN ('archived','superseded','deleted') FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Document unavailable' USING ERRCODE='42501'; END IF;
 PERFORM erp_private.ai_mod04_lock_source(doc);
 s:=erp_private.ai_mod04_source(doc);
 IF p_action='recover' THEN
  SELECT q.* INTO j FROM public.dms_ai_job_queue q JOIN erp_private.f07_job_claims src ON src.job_id=q.id WHERE q.related_document_id=doc AND q.created_by=actor AND src.preparation_context IS NOT NULL ORDER BY q.id DESC LIMIT 1;
  IF j.id IS NULL THEN RETURN jsonb_build_object('recovery',NULL); END IF;
  SELECT preparation_context INTO context FROM erp_private.f07_job_claims WHERE job_id=j.id;
  RETURN jsonb_build_object('recovery',jsonb_build_object('jobId',j.id,'requestId',context->>'requestId','snapshot',context->>'snapshot','mode',context->>'mode','fileIds',context->'fileIds','state',context->>'state'));
 END IF;
 IF p_action='snapshot' THEN
  -- Storage locations are service-only; interactive previews use the existing authorized file API.
  RETURN s||jsonb_build_object('profile',NULL,'profileState',CASE WHEN NOT erp_private.ai_mod04_profile_current((s->>'documentTypeId')::bigint) THEN 'schema_review_required' ELSE coalesce(s->'profile'->>'status','not_configured') END,'files',(SELECT coalesce(jsonb_agg(x||jsonb_build_object('bucket',NULL,'path',NULL)),'[]'::jsonb) FROM jsonb_array_elements(s->'files') x));
 END IF;
 IF p_action='start' THEN
  PERFORM erp_private.ai_mod04_lock_profile_authority(actor);
  IF NOT (erp_private.document_permission(doc,'dms.documents.ai.run') OR erp_private.document_permission(doc,'dms.documents.review_ai') OR erp_private.document_permission(doc,'dms.admin')) THEN RAISE EXCEPTION 'AI preparation permission unavailable' USING ERRCODE='42501'; END IF;
  key:=(p_data->>'requestId')::uuid;
  IF key IS NULL OR p_data->>'mode' NOT IN ('reuse_text','reread_files') OR jsonb_typeof(p_data->'fileIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Retain request identity and selected sources' USING ERRCODE='22023'; END IF;
  SELECT array_agg(x::bigint ORDER BY x::bigint),count(*) INTO ids,n FROM jsonb_array_elements_text(p_data->'fileIds') x;
  IF n NOT BETWEEN 1 AND 10 OR cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids) x) THEN RAISE EXCEPTION 'Invalid file selection' USING ERRCODE='22023'; END IF;
  digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
  -- Same durable queue and original request; an uncertain response cannot create another paid job.
  PERFORM pg_advisory_xact_lock(hashtextextended('ai-mod04-active:'||actor||':'||doc,0));
  PERFORM pg_advisory_xact_lock(hashtextextended('ai-mod04:'||actor||':'||key,0));
  SELECT q.* INTO j FROM public.dms_ai_job_queue q WHERE q.idempotency_key='ai-mod04:'||actor||':'||key;
  IF FOUND THEN
   SELECT preparation_context INTO context FROM erp_private.f07_job_claims WHERE job_id=j.id;
   IF j.created_by<>actor OR j.related_document_id<>doc OR context->>'requestHash' IS DISTINCT FROM digest THEN RAISE EXCEPTION 'Retained request differs' USING ERRCODE='PT409'; END IF;
   RETURN jsonb_build_object('documentId',doc,'requestId',key,'jobId',j.id,'status',j.job_status,'replayed',true);
  END IF;
  IF s->>'snapshot' IS DISTINCT FROM p_data->>'snapshot' THEN RAISE EXCEPTION 'Reviewed source changed' USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM public.dms_ai_job_queue q JOIN erp_private.f07_job_claims src ON src.job_id=q.id WHERE q.related_document_id=doc AND q.created_by=actor AND src.preparation_context->>'state' IN ('queued','review_required')) THEN RAISE EXCEPTION 'Recover the existing preparation before another request' USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM unnest(ids) x WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(s->'files') f WHERE (f->>'id')::bigint=x)) THEN RAISE EXCEPTION 'Selected source unavailable' USING ERRCODE='42501'; END IF;
  IF s->'profile' IS NOT NULL AND s->'profile'<>'null'::jsonb AND s->'profile'->>'status'<>'active' THEN RAISE EXCEPTION 'Processing profile awaits approval' USING ERRCODE='55000'; END IF;
  IF NOT erp_private.ai_mod04_profile_current((s->>'documentTypeId')::bigint) THEN RAISE EXCEPTION 'Processing profile and registered schema require reevaluation' USING ERRCODE='55000'; END IF;
  IF s->'profile'->>'applicability'='mixed_bundle' THEN RAISE EXCEPTION 'Bundle boundaries require review; original retained' USING ERRCODE='55000'; END IF;
  r:=erp_private.f07_ai_job_control('enqueue',jsonb_build_object('jobType','ai_re_extraction','relatedDocumentId',doc,'payload',jsonb_build_object('documentId',doc,'source','admin_manual_retry'),'idempotencyKey','ai-mod04:'||actor||':'||key));
  job:=(r->>'jobId')::bigint;
  IF job IS NULL THEN RAISE EXCEPTION 'Queue receipt unavailable' USING ERRCODE='PT409'; END IF;
  context:=jsonb_build_object('version',1,'actor',actor,'requestId',key,'requestHash',digest,'mode',p_data->>'mode','fileIds',to_jsonb(ids),'source',s,'snapshot',s->>'snapshot','state','queued','resultId',NULL);
  UPDATE erp_private.f07_job_claims SET preparation_context=context WHERE job_id=job;
  IF NOT FOUND THEN RAISE EXCEPTION 'Queue source binding unavailable' USING ERRCODE='PT409'; END IF;
  INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json) VALUES(doc,'ai_preparation_requested','Selected sources retained for AI review; accepted values unchanged.',actor,jsonb_build_object('jobId',job,'requestId',key,'mode',p_data->>'mode'));
  RETURN jsonb_build_object('documentId',doc,'requestId',key,'jobId',job,'status','queued','replayed',false);
 END IF;
 SELECT * INTO j FROM public.dms_ai_job_queue WHERE id=(p_data->>'jobId')::bigint AND related_document_id=doc AND created_by=actor;
 IF NOT FOUND THEN RAISE EXCEPTION 'Preparation unavailable' USING ERRCODE='42501'; END IF;
 SELECT preparation_context INTO context FROM erp_private.f07_job_claims WHERE job_id=j.id FOR UPDATE;
 IF context IS NULL THEN RAISE EXCEPTION 'Preparation unavailable' USING ERRCODE='42501'; END IF;
 IF p_action='cancel' THEN
  IF EXISTS(SELECT 1 FROM erp_private.f07_job_claims proof CROSS JOIN LATERAL jsonb_each(proof.preparation_stages) stage WHERE proof.job_id=j.id AND stage.value->>'state'='started') THEN RAISE EXCEPTION 'Uncertain provider work requires reconciliation before cancellation or a new analysis' USING ERRCODE='55000'; END IF;
  IF context->>'state'='applied' THEN RAISE EXCEPTION 'Accepted review cannot be cancelled' USING ERRCODE='PT409'; END IF;
  IF j.job_status NOT IN ('completed','failed','cancelled') THEN r:=erp_private.f07_ai_job_control('cancel',jsonb_build_object('jobId',j.id)); END IF;
  UPDATE erp_private.f07_job_claims SET preparation_context=preparation_context||jsonb_build_object('state','cancelled') WHERE job_id=j.id;
  IF context->>'state'<>'cancelled' THEN
   UPDATE public.dms_ai_extraction_results SET ai_status='rejected',reviewed_by=actor,reviewed_at=clock_timestamp(),review_action='rejected' WHERE id=(context->>'resultId')::bigint AND ai_status='pending_review';
   INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json) VALUES(doc,'ai_preparation_cancelled','Pending preparation cancelled; accepted values and original paid-job history retained.',actor,jsonb_build_object('jobId',j.id));
  END IF;
  RETURN jsonb_build_object('documentId',doc,'jobId',j.id,'state','cancelled');
 END IF;
 RETURN jsonb_build_object('documentId',doc,'jobId',j.id,'state',context->>'state','queueStatus',j.job_status,'sourceCurrent',context->>'snapshot'=s->>'snapshot',
  'preparedText',(SELECT coalesce(jsonb_agg(jsonb_build_object('fileId',(f->>'id')::bigint,'name',f->>'name','text',left(coalesce(st.preparation_stages->('ocr:'||(f->>'id'))->'value'->>'text',f->>'text'),30000),'truncated',length(coalesce(st.preparation_stages->('ocr:'||(f->>'id'))->'value'->>'text',f->>'text'))>30000) ORDER BY (f->>'id')::bigint),'[]'::jsonb) FROM erp_private.f07_job_claims st CROSS JOIN LATERAL jsonb_array_elements(context->'source'->'files') f WHERE st.job_id=j.id AND (f->>'id')::bigint IN(SELECT value::bigint FROM jsonb_array_elements_text(context->'fileIds'))),'resultId',context->'resultId','candidate',(SELECT raw_response_json->'preparation' FROM public.dms_ai_extraction_results WHERE id=(context->>'resultId')::bigint),'snapshot',context->>'snapshot');
END $$;
CREATE OR REPLACE FUNCTION public.ai_mod04_preparation(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT erp_private.ai_mod04_preparation(p_action,p_data) $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_preparation(text,jsonb),public.ai_mod04_preparation(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod04_preparation(text,jsonb),public.ai_mod04_preparation(text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_preparation_worker(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE j public.dms_ai_job_queue; c jsonb; stages jsonb; stage text; item jsonb; extraction bigint; result_id bigint; fields jsonb; actual jsonb; target jsonb;
BEGIN
 IF current_setting('request.jwt.claims',true)::jsonb->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Worker only' USING ERRCODE='42501'; END IF;
 j:=erp_private.f07_assert_job((p_data->>'jobId')::bigint,(p_data->>'token')::uuid);
 IF j.job_type<>'ai_re_extraction' THEN RAISE EXCEPTION 'Wrong job type' USING ERRCODE='42501'; END IF;
 SELECT preparation_context,preparation_stages INTO c,stages FROM erp_private.f07_job_claims WHERE job_id=j.id FOR UPDATE;
 IF p_action='context' AND c IS NULL THEN RETURN jsonb_build_object('success',true,'preparation',false); END IF;
 IF c IS NULL OR c->>'state' IN ('cancelled','applied') OR (c->>'actor')::bigint<>j.created_by THEN RAISE EXCEPTION 'Preparation unavailable' USING ERRCODE='42501'; END IF;
 PERFORM erp_private.ai_mod04_job_authority(j.id);
 PERFORM erp_private.ai_mod04_lock_source(j.related_document_id);
 actual:=erp_private.ai_mod04_source(j.related_document_id);
 IF actual->>'snapshot' IS DISTINCT FROM c->>'snapshot' THEN RAISE EXCEPTION 'Source changed; review a new operation' USING ERRCODE='PT409'; END IF;
 IF c->'target' IS NOT NULL THEN
  target:=erp_private.ai_mod04_target_type(j.related_document_id,c->'target'->>'typeCode');
  IF target->>'schemaHash' IS DISTINCT FROM c->'target'->>'schemaHash' OR target->>'profileHash' IS DISTINCT FROM c->'target'->>'profileHash' OR target->'categoryId' IS DISTINCT FROM c->'target'->'categoryId' OR target->'canApply' IS DISTINCT FROM c->'target'->'canApply' THEN RAISE EXCEPTION 'Proposed type or profile changed' USING ERRCODE='PT409'; END IF;
 END IF;
 IF p_action='context' THEN RETURN jsonb_build_object('success',true,'preparation',true,'context',c); END IF;
 IF p_action='bind_type' THEN
  IF c->'target' IS NOT NULL THEN
   IF c->'target'->>'typeCode' IS DISTINCT FROM p_data->>'typeCode' THEN RAISE EXCEPTION 'Proposed type changed within the retained operation' USING ERRCODE='PT409'; END IF;
   RETURN c->'target';
  END IF;
  target:=erp_private.ai_mod04_target_type(j.related_document_id,p_data->>'typeCode');
  UPDATE erp_private.f07_job_claims SET preparation_context=c||jsonb_build_object('target',target) WHERE job_id=j.id;
  RETURN target;
 END IF;
 stage:=p_data->>'stage';
 IF p_action IN ('begin','complete') THEN
  IF stage IS NULL OR stage !~ '^(analysis|analysis:[1-9][0-9]*|ocr:[1-9][0-9]*)$' OR octet_length(p_data::text)>1572864 THEN RAISE EXCEPTION 'Invalid stage' USING ERRCODE='22023'; END IF;
  IF stage LIKE 'analysis:%' AND (c->'target'->>'documentTypeId' IS DISTINCT FROM split_part(stage,':',2) OR c->'target'->'canApply' IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'Target extraction not admitted' USING ERRCODE='42501'; END IF;
  IF stage LIKE 'ocr:%' AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements_text(c->'fileIds') x WHERE x=split_part(stage,':',2)) THEN RAISE EXCEPTION 'Source not selected' USING ERRCODE='42501'; END IF;
  item:=stages->stage;
  IF p_action='begin' THEN
   IF item->>'state'='completed' THEN RETURN jsonb_build_object('success',true,'state','completed','value',item->'value'); END IF;
   IF item IS NOT NULL THEN RETURN jsonb_build_object('success',true,'state','uncertain','value',NULL); END IF;
   UPDATE erp_private.f07_job_claims SET preparation_stages=jsonb_set(preparation_stages,ARRAY[stage],jsonb_build_object('state','started','claim',p_data->>'token','startedAt',clock_timestamp())) WHERE job_id=j.id;
   RETURN jsonb_build_object('success',true,'state','started','value',NULL);
  END IF;
  IF item->>'state'='completed' THEN
   IF item->'value' IS DISTINCT FROM p_data->'value' THEN RAISE EXCEPTION 'Completed stage differs' USING ERRCODE='PT409'; END IF;
   RETURN jsonb_build_object('success',true,'state','completed','value',item->'value');
  END IF;
  IF item->>'state'<>'started' OR item->>'claim' IS DISTINCT FROM p_data->>'token' OR p_data->'value' IS NULL THEN RAISE EXCEPTION 'Retained stage unavailable' USING ERRCODE='PT409'; END IF;
  UPDATE erp_private.f07_job_claims SET preparation_stages=jsonb_set(preparation_stages,ARRAY[stage],item||jsonb_build_object('state','completed','value',p_data->'value','completedAt',clock_timestamp())) WHERE job_id=j.id;
  RETURN jsonb_build_object('success',true,'state','completed','value',p_data->'value');
 END IF;
 IF p_action<>'publish' OR jsonb_typeof(p_data->'candidate') IS DISTINCT FROM 'object' OR octet_length(p_data::text)>1572864 THEN RAISE EXCEPTION 'Invalid candidate publication' USING ERRCODE='22023'; END IF;
 IF (c->>'resultId') IS NOT NULL THEN RETURN jsonb_build_object('success',true,'resultId',(c->>'resultId')::bigint,'replayed',true); END IF;
 IF stages->'analysis'->>'state' IS DISTINCT FROM 'completed' OR p_data->'candidate'->>'sourceSnapshot' IS DISTINCT FROM c->>'snapshot' OR p_data->'candidate'->>'profileHash' IS DISTINCT FROM actual->>'profileHash' THEN RAISE EXCEPTION 'Candidate source or completed analysis unavailable' USING ERRCODE='PT409'; END IF;
 IF c->'target' IS NOT NULL THEN
  IF ((c->'target')-ARRAY['fields','profile']) IS DISTINCT FROM p_data->'candidate'->'proposedType' OR (c->'target'->'canApply'='true'::jsonb AND stages->('analysis:'||(c->'target'->>'documentTypeId'))->>'state' IS DISTINCT FROM 'completed') THEN RAISE EXCEPTION 'Type candidate lacks its retained extraction and schema' USING ERRCODE='PT409'; END IF;
 END IF;
 -- Validate each selected candidate against the registered schema/current value.
 fields:='{}'::jsonb;
 FOR item IN SELECT x FROM jsonb_array_elements(p_data->'candidate'->'values') x LOOP
  IF item->>'key' !~ '^(title|description|issue_date|expiry_date|document_type_id|metadata:[1-9][0-9]*)$' OR jsonb_typeof(item->'proposed') IS DISTINCT FROM 'string' OR length(item->>'proposed')>16000 OR (length(item->>'proposed')=0 AND item->>'key' NOT LIKE 'metadata:%') THEN RAISE EXCEPTION 'Unsupported candidate' USING ERRCODE='22023'; END IF;
  IF item->>'key' LIKE 'metadata:%' THEN
   SELECT x INTO actual FROM jsonb_array_elements(CASE WHEN c->'target'->'canApply'='true'::jsonb THEN c->'target'->'fields' ELSE c->'source'->'fields' END) x WHERE x->>'id'=split_part(item->>'key',':',2);
   IF actual IS NULL OR actual->'current' IS DISTINCT FROM item->'current' THEN RAISE EXCEPTION 'Candidate schema/current value differs' USING ERRCODE='PT409'; END IF;
   IF nullif(btrim(item->>'proposed'),'') IS NOT NULL THEN fields:=fields||jsonb_build_object(actual->>'code',item->>'proposed'); END IF;
  ELSIF item->>'key'='document_type_id' THEN
   IF item->>'current' IS DISTINCT FROM c->'source'->>'documentTypeId' OR item->>'proposed' IS DISTINCT FROM c->'target'->>'documentTypeId' OR c->'target'->'canApply' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Type proposal is not bound to this review' USING ERRCODE='PT409'; END IF;
  ELSIF c->'source'->'current'->(item->>'key') IS DISTINCT FROM item->'current' THEN RAISE EXCEPTION 'Candidate current value differs' USING ERRCODE='PT409'; END IF;
 END LOOP;
 INSERT INTO public.dms_ai_extraction_jobs(document_id,job_type,status,input_text_hash,prompt_version,provider,model,duration_ms,created_by,completed_at)
 VALUES(j.related_document_id,'extraction','completed',(SELECT source_hash FROM erp_private.f07_job_claims WHERE job_id=j.id),'dms-preparation/1',p_data->'provenance'->>'provider',p_data->'provenance'->>'model',(p_data->'provenance'->>'durationMs')::integer,j.created_by,clock_timestamp()) RETURNING id INTO extraction;
 INSERT INTO public.dms_ai_extraction_results(document_id,job_id,result_type,ai_status,extracted_fields_json,raw_ocr_text,raw_response_json)
 VALUES(j.related_document_id,extraction,'preparation','pending_review',fields,left(p_data->>'candidateText',100000),jsonb_build_object('preparation',p_data->'candidate','processing',p_data->'provenance','queueJobId',j.id,'sourceSnapshot',c->>'snapshot')) RETURNING id INTO result_id;
 UPDATE erp_private.f07_job_claims SET preparation_context=c||jsonb_build_object('state','review_required','resultId',result_id) WHERE job_id=j.id;
 UPDATE erp_private.f07_job_claims SET suggestion_result_id=result_id WHERE job_id=j.id;
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json) VALUES(j.related_document_id,'ai_preparation_ready','Preparation candidates retained for explicit review; accepted data unchanged.',j.created_by,jsonb_build_object('jobId',j.id,'resultId',result_id));
 RETURN jsonb_build_object('success',true,'resultId',result_id,'replayed',false);
END $$;
CREATE OR REPLACE FUNCTION public.ai_mod04_preparation_worker(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT erp_private.ai_mod04_preparation_worker(p_action,p_data) $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_preparation_worker(text,jsonb),public.ai_mod04_preparation_worker(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod04_preparation_worker(text,jsonb),public.ai_mod04_preparation_worker(text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_apply_preparation(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor bigint:=public.current_user_profile_id(); j public.dms_ai_job_queue; c jsonb; source jsonb; candidate jsonb; item jsonb; selections text[];
 d public.dms_documents; def public.dms_metadata_definitions; values_to_save jsonb:='[]'::jsonb; row_value jsonb; value jsonb; col text; key uuid; digest text; apply_receipt jsonb; target jsonb; prior_derived jsonb; derived jsonb:='{"state":"not_selected"}'::jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>65536 THEN RAISE EXCEPTION 'Invalid reviewed preparation' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_object_keys(p_data) x WHERE x NOT IN ('documentId','jobId','requestId','snapshot','selections','edits','humanReviewConfirmed','replaceExistingConfirmed','refreshDerivedConfirmed')) THEN RAISE EXCEPTION 'Unknown review property' USING ERRCODE='22023'; END IF;
 key:=(p_data->>'requestId')::uuid; digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 IF key IS NULL OR p_data->'humanReviewConfirmed' IS DISTINCT FROM 'true'::jsonb OR jsonb_typeof(p_data->'selections') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Explicit review and retained request required' USING ERRCODE='22023'; END IF;
 SELECT coalesce(array_agg(x ORDER BY x),'{}'::text[]) INTO selections FROM jsonb_array_elements_text(p_data->'selections') x;
 IF cardinality(selections) NOT BETWEEN 0 AND 50 OR (cardinality(selections)=0 AND p_data->'refreshDerivedConfirmed' IS DISTINCT FROM 'true'::jsonb) OR cardinality(selections)<>(SELECT count(DISTINCT x) FROM unnest(selections) x) OR EXISTS(SELECT 1 FROM unnest(selections) x WHERE x !~ '^(title|description|issue_date|expiry_date|document_type_id|metadata:[1-9][0-9]*)$') THEN RAISE EXCEPTION 'Invalid selected fields' USING ERRCODE='22023'; END IF;
 IF p_data?'edits' AND (jsonb_typeof(p_data->'edits') IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_each(p_data->'edits') edit WHERE NOT edit.key=ANY(selections) OR jsonb_typeof(edit.value)<>'string' OR length(btrim(edit.value#>>'{}')) NOT BETWEEN 1 AND 16000)) THEN RAISE EXCEPTION 'Invalid reviewed edit' USING ERRCODE='22023'; END IF;
 -- Same lock order as worker: queue, claim, document, source extension.
 SELECT * INTO j FROM public.dms_ai_job_queue WHERE id=(p_data->>'jobId')::bigint FOR UPDATE;
 IF NOT FOUND OR j.created_by IS DISTINCT FROM actor OR j.related_document_id IS DISTINCT FROM (p_data->>'documentId')::bigint THEN RAISE EXCEPTION 'Preparation unavailable' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM erp_private.f07_job_claims WHERE job_id=j.id FOR UPDATE;
 IF NOT erp_private.ai_mod04_subjects_allowed(j.related_document_id) THEN RAISE EXCEPTION 'Linked subject access unavailable' USING ERRCODE='42501'; END IF;
 d:=erp_private.f07_metadata_authority(j.related_document_id,false);
 IF NOT erp_private.document_permission(d.id,'dms.documents.preview') OR NOT (erp_private.document_permission(d.id,'dms.documents.edit') OR erp_private.document_permission(d.id,'dms.admin')) THEN RAISE EXCEPTION 'Preparation access revoked' USING ERRCODE='42501'; END IF;
 SELECT preparation_context INTO c FROM erp_private.f07_job_claims WHERE job_id=j.id FOR UPDATE;
 IF c IS NULL THEN RAISE EXCEPTION 'Preparation unavailable' USING ERRCODE='42501'; END IF;
 IF c->'applyReceipt' IS NOT NULL THEN
  IF c->>'applyHash' IS DISTINCT FROM digest THEN RAISE EXCEPTION 'Original committed selection differs' USING ERRCODE='PT409'; END IF;
  RETURN c->'applyReceipt';
 END IF;
 d:=erp_private.f07_metadata_authority(d.id,true);
 prior_derived:=jsonb_build_object('summary',d.ai_summary,'model',d.ai_summary_model,'summaryUpdatedAt',d.ai_summary_updated_at,'summaryEmbedding',d.summary_embedding);
 PERFORM erp_private.ai_mod04_lock_profile_authority(actor);
 PERFORM type.id FROM public.dms_document_types type WHERE type.id=d.document_type_id ORDER BY type.id FOR SHARE;
 PERFORM erp_private.ai_mod04_lock_source(d.id);
 source:=erp_private.ai_mod04_source(d.id);
 IF c->>'state'<>'review_required' OR c->>'snapshot' IS DISTINCT FROM p_data->>'snapshot' OR c->>'snapshot' IS DISTINCT FROM source->>'snapshot' THEN RAISE EXCEPTION 'Source, profile or current values changed' USING ERRCODE='PT409'; END IF;
 SELECT raw_response_json->'preparation' INTO candidate FROM public.dms_ai_extraction_results WHERE id=(c->>'resultId')::bigint AND document_id=d.id AND ai_status='pending_review' FOR UPDATE;
 IF candidate IS NULL OR EXISTS(SELECT 1 FROM unnest(selections) x WHERE (SELECT count(*) FROM jsonb_array_elements(candidate->'values') v WHERE v->>'key'=x)<>1) THEN RAISE EXCEPTION 'Selected candidate unavailable' USING ERRCODE='PT409'; END IF;
 IF p_data?'edits' THEN candidate:=jsonb_set(candidate,'{values}',(SELECT coalesce(jsonb_agg(CASE WHEN p_data->'edits'?(x->>'key') THEN x||jsonb_build_object('proposed',p_data->'edits'->>(x->>'key'),'reviewedEdit',true) ELSE x END),'[]'::jsonb) FROM jsonb_array_elements(candidate->'values') x)); END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(candidate->'values') x WHERE x->>'key'=ANY(selections) AND nullif(btrim(x->>'proposed'),'') IS NULL) OR p_data->'edits'?'document_type_id' THEN RAISE EXCEPTION 'Unknown values cannot erase accepted data or override the proposed type' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(candidate->'values') x WHERE x->>'key'=ANY(selections) AND nullif(x->>'current','') IS NOT NULL) AND p_data->'replaceExistingConfirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Replacement requires explicit confirmation' USING ERRCODE='22023'; END IF;
 IF 'document_type_id'=ANY(selections) THEN
  IF c->'target' IS NULL OR c->'target'->'canApply' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Type change requires its owning review' USING ERRCODE='42501'; END IF;
  PERFORM type.id FROM public.dms_document_types type WHERE type.id=(c->'target'->>'documentTypeId')::bigint FOR SHARE;
  target:=erp_private.ai_mod04_target_type(d.id,c->'target'->>'typeCode');
  IF target->>'schemaHash' IS DISTINCT FROM c->'target'->>'schemaHash' OR target->>'profileHash' IS DISTINCT FROM c->'target'->>'profileHash' OR target->'categoryId' IS DISTINCT FROM c->'target'->'categoryId' OR target->'canApply' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'The selected type/profile changed' USING ERRCODE='PT409'; END IF;
  UPDATE public.dms_documents SET document_type_id=(target->>'documentTypeId')::bigint,category_id=(target->>'categoryId')::bigint,updated_by=actor,updated_at=clock_timestamp() WHERE id=d.id RETURNING * INTO d;
 ELSIF c->'target'->'canApply'='true'::jsonb AND EXISTS(SELECT 1 FROM unnest(selections)x WHERE x LIKE 'metadata:%') THEN RAISE EXCEPTION 'Accept the schema change before applying its metadata' USING ERRCODE='22023'; END IF;
 -- Typed metadata goes through its owning validator/writer, including uniqueness,
 -- required fields, configured options and date/number conversion.
 FOR item IN SELECT x FROM jsonb_array_elements(candidate->'values') x WHERE x->>'key'=ANY(selections) AND x->>'key' LIKE 'metadata:%' ORDER BY x->>'key' LOOP
  SELECT * INTO def FROM public.dms_metadata_definitions WHERE id=split_part(item->>'key',':',2)::bigint AND document_type_id=d.document_type_id AND is_active AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Metadata schema changed' USING ERRCODE='PT409'; END IF;
  col:=erp_private.f07_metadata_column(def.field_type);
  value:=to_jsonb(item->>'proposed');
  IF col='value_number' THEN value:=to_jsonb((item->>'proposed')::numeric);
  ELSIF col='value_boolean' THEN IF item->>'proposed' NOT IN ('true','false') THEN RAISE EXCEPTION 'Invalid boolean' USING ERRCODE='22023'; END IF; value:=to_jsonb((item->>'proposed')::boolean);
  ELSIF col='value_json' THEN value:=(item->>'proposed')::jsonb;
  END IF;
  row_value:=jsonb_build_object('definition_id',def.id,col,value); values_to_save:=values_to_save||jsonb_build_array(row_value);
 END LOOP;
 IF jsonb_array_length(values_to_save)>0 OR 'document_type_id'=ANY(selections) THEN
  PERFORM erp_private.f07_metadata_operation('save',jsonb_build_object('documentId',d.id,'snapshot',erp_private.f07_metadata_snapshot(d.id),'requestId',key,'values',values_to_save));
 END IF;
 -- Existing reviewed header writer has a strict allowlist and feature gates.
 -- Apply expiry first when extending past the previous expiry, otherwise issue first.
 FOR item IN SELECT x FROM jsonb_array_elements(candidate->'values') x WHERE x->>'key'=ANY(selections) AND x->>'key' NOT LIKE 'metadata:%' AND x->>'key'<>'document_type_id'
  ORDER BY CASE WHEN x->>'key'='expiry_date' AND EXISTS(SELECT 1 FROM jsonb_array_elements(candidate->'values') i WHERE i->>'key'='issue_date' AND i->>'key'=ANY(selections) AND (i->>'proposed')::date>d.expiry_date) THEN 0 ELSE 1 END,x->>'key' LOOP
  PERFORM erp_private.f07_write_target(d.id,'dms_documents',item->>'key',d.id,to_jsonb(item->>'proposed'),actor);
 END LOOP;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(erp_private.ai_mod04_source(d.id)->'fields') f WHERE ((f->'required'='true'::jsonb) OR coalesce((erp_private.ai_mod04_source(d.id)->'profile'->'requiredFields') ? (f->>'code'),false)) AND nullif(btrim(f->>'current'),'') IS NULL) THEN RAISE EXCEPTION 'Complete the registered required review fields' USING ERRCODE='22023'; END IF;
 PERFORM erp_private.ai_mod04_assert_review_complete(d.id);
 IF cardinality(selections)>0 THEN
  UPDATE public.dms_documents SET ai_summary=NULL,ai_summary_model=NULL,ai_summary_status='pending',ai_summary_updated_at=clock_timestamp(),summary_embedding=NULL,summary_embedding_status='pending',summary_embedding_updated_at=clock_timestamp() WHERE id=d.id;
  derived:=jsonb_build_object('state','pending_review_after_source_change');
 END IF;
 IF p_data->'refreshDerivedConfirmed'='true'::jsonb THEN derived:=erp_private.ai_mod04_refresh_derived(j.id); END IF;
 apply_receipt:=jsonb_build_object('documentId',d.id,'jobId',j.id,'requestId',key,'appliedCount',cardinality(selections),'state','applied','derivedReadiness',derived-ARRAY['priorDerived']);
 UPDATE erp_private.f07_job_claims SET preparation_context=c||jsonb_build_object('state','applied','applyHash',digest,'applyReceipt',apply_receipt,'selection',p_data->'selections','appliedBy',actor,'appliedAt',clock_timestamp(),'derivedReadiness',derived,'priorDerived',prior_derived) WHERE job_id=j.id;
 UPDATE public.dms_ai_extraction_results SET ai_status=CASE WHEN cardinality(selections)=jsonb_array_length(candidate->'values') THEN 'accepted' ELSE 'partially_accepted' END,reviewed_by=actor,reviewed_at=clock_timestamp(),review_action='accepted' WHERE id=(c->>'resultId')::bigint;
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json) VALUES(d.id,'ai_preparation_applied','Selected AI review values committed; source files, document number and HR records unchanged.',actor,jsonb_build_object('requestId',key,'resultId',c->'resultId','fields',p_data->'selections','snapshot',c->>'snapshot','derivedReadiness',derived-ARRAY['priorDerived']));
 RETURN apply_receipt;
END $$;
CREATE OR REPLACE FUNCTION public.ai_mod04_apply_preparation(p_data jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT erp_private.ai_mod04_apply_preparation(p_data) $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_apply_preparation(jsonb),public.ai_mod04_apply_preparation(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod04_apply_preparation(jsonb),public.ai_mod04_apply_preparation(jsonb) TO authenticated;

ALTER TABLE public.dms_document_workflows ADD COLUMN IF NOT EXISTS owner_company_id bigint REFERENCES public.owner_companies(id);
ALTER TABLE public.dms_document_workflows ADD COLUMN IF NOT EXISTS branch_id bigint REFERENCES public.branches(id);
ALTER TABLE public.dms_document_workflows ADD COLUMN IF NOT EXISTS configuration_version integer NOT NULL DEFAULT 1;
ALTER TABLE public.dms_document_workflow_steps ADD COLUMN IF NOT EXISTS assignee_profile_ids bigint[] NOT NULL DEFAULT '{}';
ALTER TABLE public.dms_document_workflow_steps ADD COLUMN IF NOT EXISTS decision_rule text NOT NULL DEFAULT 'one_assigned' CHECK (decision_rule IN ('one_assigned','all_assigned'));
CREATE INDEX IF NOT EXISTS ai_mod04_workflow_scope ON public.dms_document_workflows(owner_company_id,branch_id) WHERE deleted_at IS NULL AND is_active;
CREATE TABLE IF NOT EXISTS erp_private.ai_mod04_approval_assignments(
 approval_id bigint PRIMARY KEY REFERENCES public.dms_document_approvals(id) ON DELETE RESTRICT,
 document_id bigint NOT NULL REFERENCES public.dms_documents(id) ON DELETE RESTRICT,
 workflow_id bigint NOT NULL REFERENCES public.dms_document_workflows(id) ON DELETE RESTRICT,
 step_id bigint NOT NULL REFERENCES public.dms_document_workflow_steps(id) ON DELETE RESTRICT,
 original_submitter bigint NOT NULL REFERENCES public.user_profiles(id) ON DELETE RESTRICT,
 profile_ids bigint[] NOT NULL CHECK(cardinality(profile_ids) BETWEEN 1 AND 50),
 decision_rule text NOT NULL CHECK(decision_rule IN ('one_assigned','all_assigned')),
 configuration_version integer NOT NULL, source_fingerprint text NOT NULL, workflow_fingerprint text NOT NULL,
 assigned_by bigint NOT NULL REFERENCES public.user_profiles(id),created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX IF NOT EXISTS ai_mod04_assignments_document ON erp_private.ai_mod04_approval_assignments(document_id,approval_id);
CREATE INDEX IF NOT EXISTS ai_mod04_assignments_workflow ON erp_private.ai_mod04_approval_assignments(workflow_id,step_id);
ALTER TABLE erp_private.ai_mod04_approval_assignments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.ai_mod04_approval_assignments FROM PUBLIC,anon,authenticated,service_role;

-- Nominated-account admission is deliberately narrower than a real decision.
-- It proves stored grants, never impersonates a user's JWT or grants permission.
-- The decision still evaluates the actual current session and all F03 subject RLS.
CREATE OR REPLACE FUNCTION erp_private.ai_mod04_profile_grant(p_profile bigint,p_code text,p_company bigint,p_branch bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT EXISTS(SELECT 1 FROM public.user_profiles up JOIN auth.users account ON account.id=up.auth_user_id WHERE up.id=p_profile AND up.status='active' AND NOT coalesce(up.must_change_password,false) AND account.deleted_at IS NULL AND (account.banned_until IS NULL OR account.banned_until<now())) AND EXISTS(
 SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id LEFT JOIN public.role_permissions rp ON rp.role_id=r.id LEFT JOIN public.permissions p ON p.id=rp.permission_id AND p.is_active
 WHERE ur.user_profile_id=p_profile AND ur.is_active AND r.is_active AND (
  (r.role_code IN ('system_admin','group_admin') AND ur.owner_company_id IS NULL AND ur.branch_id IS NULL) OR
  (p.permission_code=p_code AND ((ur.owner_company_id IS NULL AND ur.branch_id IS NULL) OR (ur.owner_company_id=p_company AND (ur.branch_id IS NULL OR ur.branch_id=p_branch))))));
$$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_profile_grant(bigint,text,bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_reviewer_eligible(p_profile bigint,p_document bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE d public.dms_documents; global_reviewer boolean; link record;
BEGIN
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL;
 IF NOT FOUND OR d.owning_company_id IS NULL OR d.is_archived OR d.status IN ('archived','superseded','deleted') THEN RETURN false; END IF;
 IF NOT erp_private.ai_mod04_profile_grant(p_profile,'notifications.view',d.owning_company_id,d.owning_branch_id)
  OR NOT erp_private.ai_mod04_profile_grant(p_profile,'dms.documents.view',d.owning_company_id,d.owning_branch_id)
  OR NOT erp_private.ai_mod04_profile_grant(p_profile,'dms.documents.preview',d.owning_company_id,d.owning_branch_id)
  OR NOT (erp_private.ai_mod04_profile_grant(p_profile,'dms.approvals.act',d.owning_company_id,d.owning_branch_id) OR erp_private.ai_mod04_profile_grant(p_profile,'dms.documents.approve',d.owning_company_id,d.owning_branch_id) OR erp_private.ai_mod04_profile_grant(p_profile,'dms.admin',d.owning_company_id,d.owning_branch_id)) THEN RETURN false; END IF;
 global_reviewer:=EXISTS(SELECT 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id WHERE u.user_profile_id=p_profile AND u.is_active AND r.is_active AND r.role_code IN ('system_admin','group_admin') AND u.owner_company_id IS NULL AND u.branch_id IS NULL);
 IF global_reviewer THEN RETURN true; END IF;
 IF d.confidentiality_level NOT IN ('internal','company','hr','finance','legal','executive') THEN RETURN false; END IF;
 IF d.confidentiality_level NOT IN ('internal','company') AND NOT erp_private.ai_mod04_profile_grant(p_profile,'dms.documents.view.'||d.confidentiality_level,d.owning_company_id,d.owning_branch_id) THEN RETURN false; END IF;
 FOR link IN SELECT e.owner_company_id,e.branch_id FROM public.dms_document_links l JOIN public.employees e ON e.id=l.entity_id WHERE l.document_id=d.id AND l.deleted_at IS NULL AND l.entity_type='employee' LOOP
  IF NOT erp_private.ai_mod04_profile_grant(p_profile,'hr.employees.view',link.owner_company_id,link.branch_id) THEN RETURN false; END IF;
 END LOOP;
 RETURN erp_private.ai_mod04_profile_hr_allowed(p_profile,p_document) AND erp_private.ai_mod04_profile_recruitment_allowed(p_profile,p_document)
  AND NOT EXISTS(SELECT 1 FROM public.dms_document_links l LEFT JOIN public.employee_dependents child ON child.id=l.entity_id AND child.deleted_at IS NULL WHERE l.document_id=d.id AND l.deleted_at IS NULL AND l.entity_type='employee_dependent' AND (child.id IS NULL OR NOT erp_private.ai_mod04_profile_employee_capability(p_profile,child.employee_id,'hr.compliance.view')));
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_reviewer_eligible(bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_step_reviewer(p_profile bigint,p_document bigint,p_step bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT erp_private.ai_mod04_reviewer_eligible(p_profile,p_document) AND EXISTS(
  SELECT 1 FROM public.dms_document_workflow_steps s JOIN public.dms_documents d ON d.id=p_document WHERE s.id=p_step AND s.is_active AND
   (s.requires_role IS NULL OR EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_profile_id=p_profile AND ur.is_active AND r.is_active AND r.role_code=s.requires_role AND ((ur.owner_company_id IS NULL AND ur.branch_id IS NULL) OR (ur.owner_company_id=d.owning_company_id AND (ur.branch_id IS NULL OR ur.branch_id=d.owning_branch_id))))));
$$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_step_reviewer(bigint,bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_bind_approval()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d public.dms_documents; w public.dms_document_workflows; s public.dms_document_workflow_steps; person bigint;
BEGIN
 IF NEW.action<>'submitted' OR NOT NEW.is_current THEN RETURN NEW; END IF;
 SELECT * INTO d FROM public.dms_documents WHERE id=NEW.document_id;
 SELECT * INTO w FROM public.dms_document_workflows WHERE id=NEW.workflow_id AND is_active AND deleted_at IS NULL FOR SHARE;
 SELECT * INTO s FROM public.dms_document_workflow_steps WHERE id=NEW.step_id AND workflow_id=w.id AND is_active FOR SHARE;
 IF w.id IS NULL OR s.id IS NULL OR w.owner_company_id IS DISTINCT FROM d.owning_company_id OR (w.branch_id IS NOT NULL AND w.branch_id IS DISTINCT FROM d.owning_branch_id) OR cardinality(s.assignee_profile_ids)=0 OR cardinality(s.assignee_profile_ids)>50 OR cardinality(s.assignee_profile_ids)<>(SELECT count(DISTINCT x) FROM unnest(s.assignee_profile_ids) x) THEN RAISE EXCEPTION 'Approval route or explicit assignees require review' USING ERRCODE='55000'; END IF;
 FOREACH person IN ARRAY s.assignee_profile_ids LOOP
  IF person IS NULL OR person=NEW.submitted_by OR NOT erp_private.ai_mod04_step_reviewer(person,d.id,s.id) THEN RAISE EXCEPTION 'Independent assignee authority or notification readiness unavailable' USING ERRCODE='55000'; END IF;
 END LOOP;
 INSERT INTO erp_private.ai_mod04_approval_assignments(approval_id,document_id,workflow_id,step_id,original_submitter,profile_ids,decision_rule,configuration_version,source_fingerprint,workflow_fingerprint,assigned_by)
 VALUES(NEW.id,d.id,w.id,s.id,NEW.submitted_by,s.assignee_profile_ids,s.decision_rule,w.configuration_version,erp_private.f07_review_fingerprint(d.id),erp_private.f07_workflow_fingerprint(w.id,d.id),public.current_user_profile_id());
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_bind_approval() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ai_mod04_bind_approval AFTER INSERT ON public.dms_document_approvals FOR EACH ROW EXECUTE FUNCTION erp_private.ai_mod04_bind_approval();

CREATE OR REPLACE FUNCTION erp_private.f05_approval_actor(document_id bigint,step_id bigint DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE actor bigint:=public.current_user_profile_id(); a public.dms_document_approvals; assignment erp_private.ai_mod04_approval_assignments;
BEGIN
 IF actor IS NULL OR NOT erp_private.business_principal_is_active() OR NOT erp_private.document_permission($1,'dms.documents.view') OR NOT erp_private.document_permission($1,'dms.documents.preview') OR NOT erp_private.ai_mod04_subjects_allowed($1) THEN RETURN false; END IF;
 SELECT * INTO a FROM public.dms_document_approvals x WHERE x.document_id=$1 AND x.is_current AND x.action='submitted' AND x.step_id IS NOT DISTINCT FROM $2;
 IF a.id IS NULL OR a.submitted_by=actor OR (SELECT submitted_by FROM public.dms_documents WHERE id=$1)=actor THEN RETURN false; END IF;
 SELECT * INTO assignment FROM erp_private.ai_mod04_approval_assignments WHERE approval_id=a.id;
 IF assignment.approval_id IS NULL OR assignment.original_submitter=actor OR NOT actor=ANY(assignment.profile_ids) OR NOT erp_private.ai_mod04_step_reviewer(actor,$1,$2) THEN RETURN false; END IF;
 IF EXISTS(SELECT 1 FROM unnest(assignment.profile_ids) x WHERE NOT erp_private.ai_mod04_step_reviewer(x,$1,$2)) OR EXISTS(SELECT 1 FROM public.dms_document_approvals vote WHERE vote.responds_to_approval_id=a.id AND vote.action='approved' AND vote.actioned_by=actor) THEN RETURN false; END IF;
 RETURN erp_private.document_permission($1,'dms.approvals.act') OR erp_private.document_permission($1,'dms.documents.approve') OR erp_private.document_permission($1,'dms.admin') OR erp_private.document_permission($1,'dms.approvals.admin');
END $$;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_approval_recipients(p_approval bigint,p_document bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE a public.dms_document_approvals; assignment erp_private.ai_mod04_approval_assignments;
BEGIN
 IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Internal routing only' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.dms_document_approvals WHERE id=p_approval AND document_id=p_document AND is_current AND action='submitted';
 IF a.id IS NULL THEN RETURN jsonb_build_object('state','stale','profileIds','[]'::jsonb); END IF;
 SELECT * INTO assignment FROM erp_private.ai_mod04_approval_assignments WHERE approval_id=a.id;
 IF assignment.approval_id IS NULL OR assignment.source_fingerprint IS DISTINCT FROM erp_private.f07_review_fingerprint(p_document) OR assignment.workflow_fingerprint IS DISTINCT FROM erp_private.f07_workflow_fingerprint(a.workflow_id,p_document) OR EXISTS(SELECT 1 FROM unnest(assignment.profile_ids) person WHERE person=a.submitted_by OR NOT erp_private.ai_mod04_step_reviewer(person,p_document,a.step_id)) THEN RETURN jsonb_build_object('state','held','profileIds','[]'::jsonb); END IF;
 RETURN jsonb_build_object('state','assigned','profileIds',(SELECT coalesce(jsonb_agg(person ORDER BY person),'[]'::jsonb) FROM unnest(assignment.profile_ids) person WHERE NOT EXISTS(SELECT 1 FROM public.dms_document_approvals vote WHERE vote.responds_to_approval_id=a.id AND vote.action='approved' AND vote.actioned_by=person)));
END $$;
CREATE OR REPLACE FUNCTION public.ai_mod04_approval_recipients(p_approval bigint,p_document bigint)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT erp_private.ai_mod04_approval_recipients(p_approval,p_document) $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_approval_recipients(bigint,bigint),public.ai_mod04_approval_recipients(bigint,bigint) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod04_approval_recipients(bigint,bigint),public.ai_mod04_approval_recipients(bigint,bigint) TO service_role;


-- BEGIN AI-MOD-04 additional contracts
CREATE POLICY ai_mod04_workflow_scoped_admin ON public.dms_document_workflows FOR ALL TO authenticated
 USING (erp_private.permission_in_scope('dms.admin',owner_company_id,branch_id) OR erp_private.permission_in_scope('dms.approvals.admin',owner_company_id,branch_id))
 WITH CHECK (erp_private.permission_in_scope('dms.admin',owner_company_id,branch_id) OR erp_private.permission_in_scope('dms.approvals.admin',owner_company_id,branch_id));
CREATE POLICY ai_mod04_workflow_steps_scoped_admin ON public.dms_document_workflow_steps FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.dms_document_workflows w WHERE w.id=workflow_id AND (erp_private.permission_in_scope('dms.admin',w.owner_company_id,w.branch_id) OR erp_private.permission_in_scope('dms.approvals.admin',w.owner_company_id,w.branch_id))))
 WITH CHECK(EXISTS(SELECT 1 FROM public.dms_document_workflows w WHERE w.id=workflow_id AND (erp_private.permission_in_scope('dms.admin',w.owner_company_id,w.branch_id) OR erp_private.permission_in_scope('dms.approvals.admin',w.owner_company_id,w.branch_id))));
CREATE POLICY ai_mod04_workflow_types_scoped_admin ON public.dms_workflow_document_types FOR ALL TO authenticated
 USING(EXISTS(SELECT 1 FROM public.dms_document_workflows w WHERE w.id=workflow_id AND (erp_private.permission_in_scope('dms.admin',w.owner_company_id,w.branch_id) OR erp_private.permission_in_scope('dms.approvals.admin',w.owner_company_id,w.branch_id))))
 WITH CHECK(EXISTS(SELECT 1 FROM public.dms_document_workflows w WHERE w.id=workflow_id AND (erp_private.permission_in_scope('dms.admin',w.owner_company_id,w.branch_id) OR erp_private.permission_in_scope('dms.approvals.admin',w.owner_company_id,w.branch_id))));

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_workflow_scope_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF NEW.branch_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=NEW.branch_id AND b.owner_company_id=NEW.owner_company_id AND b.status='active') THEN RAISE EXCEPTION 'Workflow branch/company mismatch' USING ERRCODE='22023'; END IF;
 IF NEW.is_active AND NEW.owner_company_id IS NULL THEN RAISE EXCEPTION 'Active workflow requires a company' USING ERRCODE='22023'; END IF;
 IF TG_OP='UPDATE' THEN NEW.configuration_version:=OLD.configuration_version+1;
 ELSE NEW.configuration_version:=1; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_workflow_scope_guard() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ai_mod04_workflow_scope_guard BEFORE INSERT OR UPDATE ON public.dms_document_workflows FOR EACH ROW EXECUTE FUNCTION erp_private.ai_mod04_workflow_scope_guard();

CREATE TABLE erp_private.ai_mod04_profile_revisions(
 document_type_id bigint NOT NULL REFERENCES public.dms_document_types(id) ON DELETE RESTRICT,
 revision integer NOT NULL CHECK(revision>0),schema_hash text NOT NULL,profile_hash text NOT NULL,parent_hash text NOT NULL,input_hash text NOT NULL,configuration jsonb NOT NULL,
 recorded_by bigint NOT NULL REFERENCES public.user_profiles(id),recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(document_type_id,revision)
);
ALTER TABLE erp_private.ai_mod04_profile_revisions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.ai_mod04_profile_revisions FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_profile_current(p_type bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT CASE WHEN erp_private.ai_mod04_profile(t.id,true) IS NULL THEN true ELSE EXISTS(SELECT 1 FROM erp_private.ai_mod04_profile_revisions r WHERE r.document_type_id=t.id AND r.revision=(erp_private.ai_mod04_profile(t.id,true)->>'revision')::integer AND r.configuration->>'status'='active' AND r.profile_hash=encode(sha256(convert_to(erp_private.ai_mod04_profile(t.id,true)::text,'UTF8')),'hex') AND r.schema_hash=erp_private.ai_mod04_type_schema_hash(t.id)) END FROM public.dms_document_types t WHERE t.id=p_type;
$$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_profile_current(bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_guard_profile()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
 IF TG_OP='INSERT' THEN
  IF NEW.ai_preparation_profile IS NOT NULL OR NEW.ai_active_preparation_profile IS NOT NULL THEN RAISE EXCEPTION 'Create the type, then use profile review' USING ERRCODE='42501'; END IF;
  RETURN NEW;
 END IF;
 IF NEW.ai_active_preparation_profile IS DISTINCT FROM OLD.ai_active_preparation_profile AND NOT (
  (NEW.ai_preparation_profile->>'status'='active' AND NEW.ai_active_preparation_profile=NEW.ai_preparation_profile AND EXISTS(SELECT 1 FROM erp_private.ai_mod04_profile_revisions r WHERE r.document_type_id=NEW.id AND r.revision=(NEW.ai_preparation_profile->>'revision')::integer AND r.profile_hash=NEW.ai_preparation_profile->>'hash' AND r.recorded_by=public.current_user_profile_id())) OR
  (NEW.ai_preparation_profile->>'status'='retired' AND NEW.ai_active_preparation_profile IS NULL AND EXISTS(SELECT 1 FROM erp_private.ai_mod04_profile_revisions r WHERE r.document_type_id=NEW.id AND r.revision=(NEW.ai_preparation_profile->>'revision')::integer AND r.profile_hash=NEW.ai_preparation_profile->>'hash' AND r.recorded_by=public.current_user_profile_id()))
 ) THEN RAISE EXCEPTION 'Use reviewed profile activation or retirement' USING ERRCODE='42501'; END IF;
 IF NEW.ai_preparation_profile IS NOT DISTINCT FROM OLD.ai_preparation_profile THEN RETURN NEW; END IF;
 IF NEW.ai_preparation_profile IS NULL OR coalesce((NEW.ai_preparation_profile->>'revision')::integer,0)<=coalesce((OLD.ai_preparation_profile->>'revision')::integer,0)
 OR NOT EXISTS(SELECT 1 FROM erp_private.ai_mod04_profile_revisions r WHERE r.document_type_id=NEW.id AND r.revision=(NEW.ai_preparation_profile->>'revision')::integer AND r.profile_hash=NEW.ai_preparation_profile->>'hash' AND r.recorded_by=public.current_user_profile_id()) THEN RAISE EXCEPTION 'Use the versioned profile review operation' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_guard_profile() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ai_mod04_guard_profile BEFORE INSERT OR UPDATE ON public.dms_document_types FOR EACH ROW EXECUTE FUNCTION erp_private.ai_mod04_guard_profile();

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_save_profile(p_type bigint,p_expected_hash text,p_profile jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE t public.dms_document_types; p jsonb:=p_profile; h text; revision integer; field text; policy jsonb; old_rules jsonb; new_rules jsonb; retained erp_private.ai_mod04_profile_revisions;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR NOT (public.current_user_is_global_admin() OR public.current_user_has_permission('dms.admin') OR public.current_user_has_permission('dms.documents.manage_types')) THEN RAISE EXCEPTION 'Global type configuration permission required' USING ERRCODE='42501'; END IF;
 SELECT * INTO retained FROM erp_private.ai_mod04_profile_revisions WHERE document_type_id=p_type AND ai_mod04_profile_revisions.revision=(p->>'revision')::integer;
 IF FOUND THEN
  IF retained.recorded_by<>public.current_user_profile_id() OR retained.parent_hash IS DISTINCT FROM p_expected_hash OR retained.input_hash IS DISTINCT FROM encode(sha256(convert_to(p_profile::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'Profile revision request differs' USING ERRCODE='PT409'; END IF;
  RETURN jsonb_build_object('documentTypeId',p_type,'profile',retained.configuration,'profileHash',retained.profile_hash);
 END IF;
 SELECT * INTO t FROM public.dms_document_types WHERE id=p_type AND is_active AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR p_expected_hash IS DISTINCT FROM encode(sha256(convert_to(coalesce(erp_private.ai_mod04_profile(t.id,false),'null'::jsonb)::text,'UTF8')),'hex') THEN RAISE EXCEPTION 'Profile changed' USING ERRCODE='PT409'; END IF;
 IF jsonb_typeof(p) IS DISTINCT FROM 'object' OR octet_length(p::text)>32768 OR EXISTS(SELECT 1 FROM jsonb_object_keys(p) x WHERE x NOT IN ('version','revision','status','applicability','parser','promptVersion','schemaVersion','requiredFields','criticalFields','titlePattern','reminders','evaluationReference','approvedBy','approvedAt')) OR p->'version' IS DISTINCT FROM '1'::jsonb OR p->>'parser' IS DISTINCT FROM 'existing_ocr_router' OR p->>'promptVersion' IS DISTINCT FROM 'dms-preparation/1' OR p->>'schemaVersion' IS DISTINCT FROM 'dms-preparation/1' OR coalesce(p->>'status','') NOT IN ('draft','evaluated','approved','active','retired') OR coalesce(p->>'applicability','') NOT IN ('document','portrait','mixed_bundle') OR coalesce(p->>'titlePattern','') NOT IN ('type_subject','suggested') THEN RAISE EXCEPTION 'Unsupported processing profile' USING ERRCODE='22023'; END IF;
 revision:=coalesce((erp_private.ai_mod04_profile(t.id,false)->>'revision')::integer,0)+1;
 IF NOT p?&ARRAY['version','revision','status','applicability','parser','promptVersion','schemaVersion','requiredFields','criticalFields','titlePattern','reminders','evaluationReference','approvedBy','approvedAt'] THEN RAISE EXCEPTION 'Incomplete profile' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(p->'revision') IS DISTINCT FROM 'number' OR p->>'revision' !~ '^[1-9][0-9]*$' OR (p->'evaluationReference'<>'null'::jsonb AND (jsonb_typeof(p->'evaluationReference') IS DISTINCT FROM 'string' OR length(btrim(p->>'evaluationReference')) NOT BETWEEN 1 AND 200)) THEN RAISE EXCEPTION 'Invalid typed profile properties' USING ERRCODE='22023'; END IF;
 IF (p->>'revision')::integer IS DISTINCT FROM revision THEN RAISE EXCEPTION 'Profile revision differs' USING ERRCODE='PT409'; END IF;
 IF jsonb_typeof(p->'requiredFields') IS DISTINCT FROM 'array' OR jsonb_typeof(p->'criticalFields') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'requiredFields')>100 OR jsonb_array_length(p->'criticalFields')>100 THEN RAISE EXCEPTION 'Invalid profile fields' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p->'requiredFields')<>(SELECT count(DISTINCT x) FROM jsonb_array_elements_text(p->'requiredFields') x) OR jsonb_array_length(p->'criticalFields')<>(SELECT count(DISTINCT x) FROM jsonb_array_elements_text(p->'criticalFields') x) THEN RAISE EXCEPTION 'Duplicate profile fields' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements((p->'requiredFields')||(p->'criticalFields')) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'string' OR x#>>'{}' !~ '^[A-Za-z][A-Za-z0-9_]{0,99}$') THEN RAISE EXCEPTION 'Registered field codes must be strings' USING ERRCODE='22023'; END IF;
 FOR field IN SELECT value FROM jsonb_array_elements_text((p->'requiredFields')||(p->'criticalFields')) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.dms_metadata_definitions m WHERE m.document_type_id=p_type AND m.field_code=field AND m.is_active AND m.deleted_at IS NULL) THEN RAISE EXCEPTION 'Profile field is not registered for this type' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF p->>'applicability'='portrait' AND (p->>'reminders'<>'not_applicable' OR t.type_code NOT IN ('EMPLOYEE_PHOTO','DEPENDENT_PHOTO')) THEN RAISE EXCEPTION 'Portrait rules require a registered portrait type without expiry' USING ERRCODE='22023'; END IF;
 IF p->'reminders' IS NULL OR p->'reminders'='null'::jsonb THEN RAISE EXCEPTION 'Declare reminder applicability' USING ERRCODE='22023'; END IF;
 IF p->>'reminders'<>'not_applicable' THEN
  IF jsonb_typeof(p->'reminders') IS DISTINCT FROM 'object' OR jsonb_typeof(p->'reminders'->'policies') IS DISTINCT FROM 'array' OR jsonb_array_length(p->'reminders'->'policies') NOT BETWEEN 1 AND 100 OR NOT t.requires_expiry_tracking THEN RAISE EXCEPTION 'Invalid scoped reminder policies' USING ERRCODE='22023'; END IF;
  IF jsonb_array_length(p->'reminders'->'policies')<>(SELECT count(DISTINCT (x->>'companyId',x->>'branchId')) FROM jsonb_array_elements(p->'reminders'->'policies')x) THEN RAISE EXCEPTION 'Duplicate reminder scope' USING ERRCODE='22023'; END IF;
  FOR policy IN SELECT value FROM jsonb_array_elements(p->'reminders'->'policies') LOOP
   IF jsonb_typeof(policy) IS DISTINCT FROM 'object' OR NOT policy?&ARRAY['companyId','branchId','days'] OR EXISTS(SELECT 1 FROM jsonb_object_keys(policy) k WHERE k NOT IN ('companyId','branchId','days')) OR (policy->'companyId'<>'null'::jsonb AND (jsonb_typeof(policy->'companyId') IS DISTINCT FROM 'number' OR policy->>'companyId' !~ '^[1-9][0-9]*$')) OR (policy->'branchId'<>'null'::jsonb AND (jsonb_typeof(policy->'branchId') IS DISTINCT FROM 'number' OR policy->>'branchId' !~ '^[1-9][0-9]*$')) OR jsonb_typeof(policy->'days') IS DISTINCT FROM 'array' OR jsonb_array_length(policy->'days') NOT BETWEEN 1 AND 20 OR jsonb_array_length(policy->'days')<>(SELECT count(DISTINCT x) FROM jsonb_array_elements_text(policy->'days')x)
    OR ((policy->>'companyId') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.owner_companies company WHERE company.id=(policy->>'companyId')::bigint AND company.status='active')) OR ((policy->>'branchId') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=(policy->>'branchId')::bigint AND b.owner_company_id=(policy->>'companyId')::bigint AND b.status='active')) OR (policy->>'companyId' IS NULL AND policy->>'branchId' IS NOT NULL) OR EXISTS(SELECT 1 FROM jsonb_array_elements(policy->'days') day WHERE jsonb_typeof(day)<>'number' OR day::text !~ '^[0-9]+$' OR day::text::integer>730) THEN RAISE EXCEPTION 'Invalid scoped reminder policy' USING ERRCODE='22023'; END IF;
  END LOOP;
 ELSIF t.requires_expiry_tracking AND p->>'status'='active' AND p->>'applicability'<>'portrait' THEN RAISE EXCEPTION 'This expiry-tracked type needs an approved reminder policy' USING ERRCODE='22023'; END IF;
 old_rules:=erp_private.ai_mod04_profile(t.id,false)-ARRAY['status','revision','approvedBy','approvedAt'];new_rules:=p-ARRAY['status','revision','approvedBy','approvedAt'];
 IF p->>'status'='evaluated' AND (erp_private.ai_mod04_profile(t.id,false)->>'status' IS DISTINCT FROM 'draft' OR length(coalesce(p->>'evaluationReference','')) NOT BETWEEN 1 AND 200) THEN RAISE EXCEPTION 'A recorded draft evaluation is required' USING ERRCODE='22023'; END IF;
 IF p->>'status'='approved' THEN
  IF erp_private.ai_mod04_profile(t.id,false)->>'status' IS DISTINCT FROM 'evaluated' OR old_rules IS DISTINCT FROM new_rules OR NOT EXISTS(SELECT 1 FROM erp_private.ai_mod04_profile_revisions r WHERE r.document_type_id=t.id AND r.revision=(erp_private.ai_mod04_profile(t.id,false)->>'revision')::integer AND r.schema_hash=erp_private.ai_mod04_type_schema_hash(t.id)) THEN RAISE EXCEPTION 'Evaluate these exact rules before approval' USING ERRCODE='22023'; END IF;
  p:=p||jsonb_build_object('approvedBy',public.current_user_profile_id(),'approvedAt',clock_timestamp());
 ELSIF p->>'status'='active' THEN
  IF erp_private.ai_mod04_profile(t.id,false)->>'status' IS DISTINCT FROM 'approved' OR old_rules IS DISTINCT FROM new_rules THEN RAISE EXCEPTION 'Approve these exact rules before activation' USING ERRCODE='22023'; END IF;
  p:=p||jsonb_build_object('approvedBy',erp_private.ai_mod04_profile(t.id,false)->'approvedBy','approvedAt',erp_private.ai_mod04_profile(t.id,false)->'approvedAt');
 ELSE p:=p||jsonb_build_object('approvedBy',NULL,'approvedAt',NULL); END IF;
 h:=encode(sha256(convert_to(p::text,'UTF8')),'hex');
 INSERT INTO erp_private.ai_mod04_profile_revisions(document_type_id,revision,profile_hash,parent_hash,input_hash,configuration,recorded_by,schema_hash) VALUES(p_type,revision,h,p_expected_hash,encode(sha256(convert_to(p_profile::text,'UTF8')),'hex'),p,public.current_user_profile_id(),erp_private.ai_mod04_type_schema_hash(t.id));
 UPDATE public.dms_document_types SET ai_preparation_profile=jsonb_build_object('version',1,'revision',revision,'status',p->>'status','hash',h),ai_active_preparation_profile=CASE WHEN p->>'status'='active' THEN jsonb_build_object('version',1,'revision',revision,'status','active','hash',h) WHEN p->>'status'='retired' THEN NULL ELSE ai_active_preparation_profile END,updated_by=public.current_user_profile_id(),updated_at=clock_timestamp() WHERE id=p_type;
 RETURN jsonb_build_object('documentTypeId',p_type,'profile',p,'profileHash',h);
END $$;
CREATE OR REPLACE FUNCTION public.ai_mod04_save_profile(p_type bigint,p_expected_hash text,p_profile jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$ SELECT erp_private.ai_mod04_save_profile(p_type,p_expected_hash,p_profile) $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_save_profile(bigint,text,jsonb),public.ai_mod04_save_profile(bigint,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod04_save_profile(bigint,text,jsonb),public.ai_mod04_save_profile(bigint,text,jsonb) TO authenticated;

-- Compatible with the deployed (document,days) reminder uniqueness contract.
-- Never recycle a historical reminder ID for a different expiry cycle.
CREATE OR REPLACE FUNCTION erp_private.ai_mod04_reconcile_reminders(p_document bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE d public.dms_documents; t public.dms_document_types; policy jsonb; day_value integer; existing public.dms_expiry_reminders; due date; inserted integer:=0; held integer:=0;
BEGIN
 IF NOT erp_private.business_principal_is_active() OR NOT(erp_private.document_permission(p_document,'dms.documents.edit') OR erp_private.document_permission(p_document,'dms.expiry.manage') OR erp_private.document_permission(p_document,'dms.admin')) THEN RAISE EXCEPTION 'Reminder review denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document FOR UPDATE;
 SELECT * INTO t FROM public.dms_document_types WHERE id=d.document_type_id;
 IF d.expiry_date IS NULL OR NOT t.requires_expiry_tracking OR t.type_code IN ('EMPLOYEE_PHOTO','DEPENDENT_PHOTO') THEN RETURN jsonb_build_object('state','not_applicable','created',0); END IF;
 IF NOT erp_private.ai_mod04_profile_current(t.id) THEN RETURN jsonb_build_object('state','held_profile_schema','created',0); END IF;
 IF d.reminder_policy_id IS NOT NULL THEN RETURN jsonb_build_object('state','held_document_override_requires_review','created',0); END IF;
 SELECT p INTO policy FROM jsonb_array_elements(coalesce(erp_private.ai_mod04_profile(t.id,true)->'reminders'->'policies','[]'::jsonb))p
  WHERE (p->>'companyId' IS NULL OR (p->>'companyId')::bigint=d.owning_company_id) AND (p->>'branchId' IS NULL OR (p->>'branchId')::bigint=d.owning_branch_id)
  ORDER BY CASE WHEN p->>'branchId' IS NOT NULL THEN 0 WHEN p->>'companyId' IS NOT NULL THEN 1 ELSE 2 END LIMIT 1;
 IF erp_private.ai_mod04_profile(t.id,true)->>'status' IS DISTINCT FROM 'active' OR policy IS NULL THEN RETURN jsonb_build_object('state','held_policy_approval_or_scope','created',0); END IF;
 FOR day_value IN SELECT DISTINCT value::integer FROM jsonb_array_elements_text(policy->'days') ORDER BY 1 DESC LOOP
  due:=d.expiry_date-day_value;
  IF due<(clock_timestamp() AT TIME ZONE 'Asia/Dubai')::date THEN CONTINUE; END IF;
  SELECT * INTO existing FROM public.dms_expiry_reminders WHERE document_id=d.id AND reminder_days_before=day_value FOR UPDATE;
  IF FOUND THEN
   IF existing.reminder_date+day_value IS DISTINCT FROM d.expiry_date THEN held:=held+1; END IF;
   CONTINUE;
  END IF;
  INSERT INTO public.dms_expiry_reminders(document_id,reminder_days_before,reminder_date,status) VALUES(d.id,day_value,due,'pending');inserted:=inserted+1;
 END LOOP;
 RETURN jsonb_build_object('state',CASE WHEN held>0 THEN 'held_historical_cycle_collision' ELSE 'reconciled' END,'created',inserted,'historicalHolds',held,'policyRevision',erp_private.ai_mod04_profile(t.id,true)->'revision');
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_reconcile_reminders(bigint) FROM PUBLIC,anon,authenticated,service_role;

-- Before the coordinated cycle-key cutover, the local caller can use the same
-- RPC while the deployed two-column writer remains valid. Colliding historical
-- cycles are explicitly held; no reminder or notification identity is recycled.
CREATE OR REPLACE FUNCTION public.ai_mod04_schedule_reminders(p_document bigint,p_days integer[] DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.dms_documents; days integer[]:=coalesce(p_days,ARRAY[90,60,30,14,7,3,1,0]); day_value integer;
 existing public.dms_expiry_reminders; created_count integer:=0; skipped_count integer:=0; held_count integer:=0; added integer; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR NOT(erp_private.document_permission(p_document,'dms.expiry.manage') OR erp_private.document_permission(p_document,'dms.admin')) THEN RAISE EXCEPTION 'Scoped expiry management permission required' USING ERRCODE='42501'; END IF;
 PERFORM erp_private.ai_mod04_lock_profile_authority(public.current_user_profile_id());
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR d.expiry_date IS NULL OR d.expiry_tracking_override='ignored' OR d.is_archived OR d.status IN('archived','superseded','deleted') THEN RAISE EXCEPTION 'Current expiry scheduling unavailable' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM public.dms_document_types WHERE id=d.document_type_id AND (NOT requires_expiry_tracking OR type_code IN('EMPLOYEE_PHOTO','DEPENDENT_PHOTO'))) THEN RETURN jsonb_build_object('state','not_applicable','created',0,'skipped',0,'cancelled',0); END IF;
 IF erp_private.ai_mod04_profile(d.document_type_id,true) IS NOT NULL THEN
  result:=erp_private.ai_mod04_reconcile_reminders(d.id);
  result:=jsonb_build_object('created',0,'skipped',0,'cancelled',0)||result;
 ELSE
 IF cardinality(days) NOT BETWEEN 1 AND 50 OR array_position(days,NULL) IS NOT NULL OR cardinality(days)<>(SELECT count(DISTINCT x)FROM unnest(days)x) OR EXISTS(SELECT 1 FROM unnest(days)x WHERE x<0 OR x>365) THEN RAISE EXCEPTION 'Invalid existing reminder schedule' USING ERRCODE='22023'; END IF;
 FOREACH day_value IN ARRAY days LOOP
  IF d.expiry_date-day_value<(clock_timestamp() AT TIME ZONE 'Asia/Dubai')::date THEN skipped_count:=skipped_count+1; CONTINUE; END IF;
  INSERT INTO public.dms_expiry_reminders(document_id,reminder_days_before,reminder_date,status) VALUES(d.id,day_value,d.expiry_date-day_value,'pending') ON CONFLICT(document_id,reminder_days_before)DO NOTHING;
  GET DIAGNOSTICS added=ROW_COUNT; created_count:=created_count+added; skipped_count:=skipped_count+1-added;
  SELECT * INTO existing FROM public.dms_expiry_reminders WHERE document_id=d.id AND reminder_days_before=day_value FOR UPDATE;
  IF existing.reminder_date+day_value IS DISTINCT FROM d.expiry_date THEN held_count:=held_count+1; END IF;
 END LOOP;
 result:=jsonb_build_object('state',CASE WHEN held_count>0 THEN 'held_historical_cycle_collision' ELSE 'reconciled' END,'created',created_count,'skipped',skipped_count,'cancelled',0,'historicalHolds',held_count,'expiryCycle',d.expiry_date);
 END IF;
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json) VALUES(d.id,'expiry_schedule_reconciled','Expiry scheduling checked without reusing historical reminder identities.',public.current_user_profile_id(),result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.ai_mod04_schedule_reminders(bigint,integer[]) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.ai_mod04_schedule_reminders(bigint,integer[]) TO authenticated;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_profile_recruitment_allowed(p_profile bigint,p_document bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE source record; person public.hr_candidates;
BEGIN
 FOR source IN
  SELECT c.candidate_id,NULL::bigint employee_id,false payroll FROM public.hr_candidate_documents c WHERE c.dms_document_id=p_document AND c.deleted_at IS NULL
  UNION ALL SELECT o.candidate_id,NULL::bigint,true FROM public.hr_offers o WHERE o.offer_document_id=p_document AND o.deleted_at IS NULL
  UNION ALL SELECT t.candidate_id,t.employee_id,false FROM public.hr_onboarding_tasks t WHERE t.dms_document_id=p_document AND t.deleted_at IS NULL
 LOOP
  IF source.candidate_id IS NOT NULL THEN
   SELECT * INTO person FROM public.hr_candidates WHERE id=source.candidate_id AND deleted_at IS NULL;
   IF NOT FOUND OR NOT erp_private.ai_mod04_profile_grant(p_profile,'hr.recruitment.view',person.owner_company_id,person.branch_id) OR (source.payroll AND NOT erp_private.ai_mod04_profile_grant(p_profile,'hr.payroll.view',person.owner_company_id,person.branch_id)) THEN RETURN false; END IF;
  ELSIF source.employee_id IS NULL THEN RETURN false; END IF;
  IF source.employee_id IS NOT NULL AND NOT erp_private.ai_mod04_profile_employee_capability(p_profile,source.employee_id,'hr.recruitment.view') THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_profile_recruitment_allowed(bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_subjects_allowed(p_document bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.hr_document_evidence_allowed(p_document) AND erp_private.recruitment_document_evidence_allowed(p_document) AND NOT EXISTS(
  SELECT 1 FROM public.dms_document_links l LEFT JOIN public.employee_dependents child ON child.id=l.entity_id AND child.deleted_at IS NULL
  WHERE l.document_id=p_document AND l.deleted_at IS NULL AND l.entity_type='employee_dependent' AND
  (child.id IS NULL OR NOT public.current_user_can_view_employee(child.employee_id) OR NOT erp_private.employee_permission(child.employee_id,'hr.compliance.view')));
$$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_subjects_allowed(bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_job_authority(p_job bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE claims jsonb; saved text:=current_setting('request.jwt.claims',true); document bigint; allowed boolean;
BEGIN
 SELECT c.actor_claims,q.related_document_id INTO claims,document FROM erp_private.f07_job_claims c JOIN public.dms_ai_job_queue q ON q.id=c.job_id WHERE q.id=p_job;
 IF claims IS NULL THEN RAISE EXCEPTION 'Original actor unavailable' USING ERRCODE='42501'; END IF;
 PERFORM set_config('request.jwt.claims',claims::text,true);
 allowed:=erp_private.document_permission(document,'dms.documents.preview') AND erp_private.ai_mod04_subjects_allowed(document) AND
  (erp_private.document_permission(document,'dms.documents.ai.run') OR erp_private.document_permission(document,'dms.documents.review_ai') OR erp_private.document_permission(document,'dms.admin'));
 PERFORM set_config('request.jwt.claims',coalesce(saved,''),true);
 IF allowed IS DISTINCT FROM true THEN RAISE EXCEPTION 'Original preparation authority revoked' USING ERRCODE='42501'; END IF;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_job_authority(bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.ai_mod04_profile_snapshot(p_type bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.dms_document_types;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR NOT (public.current_user_is_global_admin() OR public.current_user_has_permission('dms.admin') OR public.current_user_has_permission('dms.documents.manage_types')) THEN RAISE EXCEPTION 'Global type configuration denied' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.dms_document_types WHERE id=p_type AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Type unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('documentTypeId',t.id,'typeCode',t.type_code,'name',t.name_en,'requiresExpiry',t.requires_expiry_tracking,'profile',erp_private.ai_mod04_profile(t.id,false),'activeProfile',CASE WHEN t.ai_active_preparation_profile IS NOT NULL THEN erp_private.ai_mod04_profile(t.id,true) ELSE NULL END,'profileHash',encode(sha256(convert_to(coalesce(erp_private.ai_mod04_profile(t.id,false),'null'::jsonb)::text,'UTF8')),'hex'),'companies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'name',legal_name_en) ORDER BY id),'[]'::jsonb) FROM public.owner_companies WHERE status='active'),'branches',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',id,'companyId',owner_company_id,'name',branch_name_en) ORDER BY id),'[]'::jsonb) FROM public.branches WHERE status='active'),'fields',(SELECT coalesce(jsonb_agg(jsonb_build_object('code',field_code,'label',field_label_en) ORDER BY id),'[]'::jsonb) FROM public.dms_metadata_definitions WHERE document_type_id=t.id AND is_active AND deleted_at IS NULL));
END $$;
REVOKE ALL ON FUNCTION public.ai_mod04_profile_snapshot(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ai_mod04_profile_snapshot(bigint) TO authenticated;

-- BEGIN nominated-account owning HR authority projection

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_profile_employee_capability(p_profile bigint,p_employee bigint,p_capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.employees e WHERE e.id=p_employee AND e.deleted_at IS NULL AND erp_private.ai_mod04_profile_grant(p_profile,'hr.employees.view',e.owner_company_id,e.branch_id) AND erp_private.ai_mod04_profile_grant(p_profile,p_capability,e.owner_company_id,e.branch_id));
$$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_profile_employee_capability(bigint,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION erp_private.ai_mod04_profile_hr_allowed(p_profile bigint,p_document bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 WITH linked AS MATERIALIZED (SELECT DISTINCT employee_id,caps FROM (
   SELECT employee_id,ARRAY['hr.compliance.view'] caps FROM public.employee_access_cards WHERE dms_document_id=$2 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.assignments.view'] FROM public.employee_assets WHERE dms_document_id=$2 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.actions.view','hr.confidential.view'] FROM public.employee_disciplinary_records WHERE dms_document_id=$2 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.eos.view'] FROM public.employee_eos_cases WHERE dms_document_id=$2 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.actions.view'] FROM public.employee_hr_actions WHERE dms_document_id=$2 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.compliance.view'] FROM public.employee_identity_documents WHERE dms_document_id=$2 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.medical.view'] FROM public.employee_medical_insurances WHERE dms_document_id=$2 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.medical.view'] FROM public.employee_medical_records WHERE dms_document_id=$2 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.actions.view','hr.confidential.view'] FROM public.employee_performance_records WHERE dms_document_id=$2 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.assignments.view'] FROM public.employee_ppe_issues WHERE dms_document_id=$2 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.actions.view'] FROM public.employee_pro_processes WHERE related_document_id=$2 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.compliance.view'] FROM public.employee_training_certificates WHERE dms_document_id=$2 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.compliance.view'] FROM public.employee_dependents WHERE dms_document_id=$2 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,ARRAY['hr.medical.view'] FROM public.employee_leave_requests WHERE sick_cert_dms_id=$2 AND deleted_at IS NULL
   UNION ALL SELECT id,ARRAY[]::text[] FROM public.employees WHERE photo_dms_document_id=$2 AND deleted_at IS NULL
   UNION ALL SELECT employee_id,CASE WHEN related_record_type IN ('medical_record','medical_insurance') THEN ARRAY['hr.medical.view'] ELSE ARRAY[]::text[] END
    FROM public.employee_document_links WHERE dms_document_id=$2 AND deleted_at IS NULL
  ) raw_links) SELECT EXISTS(SELECT 1 FROM public.user_profiles profile WHERE profile.id=$1 AND profile.status='active' AND NOT profile.must_change_password) AND NOT EXISTS (SELECT 1 FROM linked WHERE NOT erp_private.ai_mod04_profile_employee_capability($1,linked.employee_id,'hr.employees.view')
   OR EXISTS(SELECT 1 FROM unnest(linked.caps) c WHERE NOT erp_private.ai_mod04_profile_employee_capability($1,linked.employee_id,c))
 );
$function$
;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_profile_hr_allowed(bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_lock_identity_parent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM e.id FROM public.employees e WHERE e.id=CASE WHEN TG_OP='DELETE' THEN OLD.employee_id ELSE NEW.employee_id END OR(TG_OP='UPDATE' AND e.id=OLD.employee_id) ORDER BY e.id FOR UPDATE NOWAIT;
 IF TG_OP='DELETE' THEN RETURN OLD;ELSE RETURN NEW;END IF;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_lock_identity_parent() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER ai_mod04_lock_identity_parent BEFORE INSERT OR UPDATE OR DELETE ON public.employee_identity_documents FOR EACH ROW EXECUTE FUNCTION erp_private.ai_mod04_lock_identity_parent();

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_fact_kind(p_code text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE lower(p_code) WHEN 'date_of_birth' THEN 'person_birth_date' WHEN 'dob' THEN 'person_birth_date' WHEN 'birth_date' THEN 'person_birth_date' WHEN 'emirates_id_number' THEN 'person_emirates_id' WHEN 'passport_number' THEN 'person_passport' WHEN 'full_name_en' THEN 'person_name_en' WHEN 'holder_name_en' THEN 'person_name_en' WHEN 'employee_name_en' THEN 'person_name_en' WHEN 'dependent_name_en' THEN 'person_name_en' WHEN 'full_name_ar' THEN 'person_name_ar' WHEN 'dependent_name_ar' THEN 'person_name_ar' WHEN 'company_legal_name_en' THEN 'company_name_en' ELSE NULL END;
$$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_fact_kind(text) FROM PUBLIC,anon,authenticated,service_role;
CREATE OR REPLACE FUNCTION erp_private.ai_mod04_fact_normal(p_kind text,p_value text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE WHEN p_kind='person_emirates_id' THEN regexp_replace(translate(p_value,'٠١٢٣٤٥٦٧٨٩','0123456789'),'[^0-9]','','g') ELSE lower(regexp_replace(btrim(normalize(p_value,NFKC)),'\s+',' ','g')) END;
$$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_fact_normal(text,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_authority_facts(p_document bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;e public.employees;c public.employee_dependents;facts jsonb;identifier record;
BEGIN
 IF NOT erp_private.document_permission(p_document,'dms.documents.preview') OR NOT erp_private.ai_mod04_subjects_allowed(p_document) THEN RAISE EXCEPTION 'Authority source unavailable' USING ERRCODE='42501';END IF;
 s:=erp_private.ai_mod04_source(p_document)->'subject';
 IF s->>'kind'='company' THEN RETURN jsonb_build_object('state','verified_link','fields',jsonb_build_object('company_name_en',s->>'name'),'proof',s-ARRAY['name']);END IF;
 IF s->>'kind'='employee' THEN
  IF NOT public.current_user_can_view_employee((s->>'id')::bigint) OR NOT erp_private.employee_permission((s->>'id')::bigint,'hr.compliance.view') THEN RETURN jsonb_build_object('state','held_authority_permission','fields','{}'::jsonb);END IF;
  SELECT * INTO e FROM public.employees WHERE id=(s->>'id')::bigint AND deleted_at IS NULL FOR SHARE;
  facts:=jsonb_build_object('person_name_en',e.full_name_en,'person_name_ar',e.full_name_ar,'person_birth_date',e.date_of_birth);
  -- A unique, active, verified record is evidence; an arbitrary latest row is not.
  FOR identifier IN SELECT t.code,min(i.document_number) number,count(DISTINCT i.document_number) n FROM public.employee_identity_documents i JOIN public.hr_identity_document_types t ON t.id=i.document_type_id WHERE i.employee_id=e.id AND i.deleted_at IS NULL AND i.status='active' AND i.verification_status='verified' AND t.is_active AND t.code IN('EMIRATES_ID','PASSPORT') GROUP BY t.code LOOP
   IF identifier.n=1 THEN facts:=facts||jsonb_build_object(CASE identifier.code WHEN 'EMIRATES_ID' THEN 'person_emirates_id' ELSE 'person_passport' END,identifier.number);END IF;
  END LOOP;
  RETURN jsonb_build_object('state','verified_record','fields',facts,'proof',jsonb_build_object('table','employees','id',e.id,'revision',e.workspace_revision));
 ELSIF s->>'kind'='employee_dependent' THEN
  SELECT * INTO c FROM public.employee_dependents WHERE id=(s->>'id')::bigint AND deleted_at IS NULL FOR SHARE;
  IF c.id IS NULL OR NOT public.current_user_can_view_employee(c.employee_id) OR NOT erp_private.employee_permission(c.employee_id,'hr.compliance.view') THEN RETURN jsonb_build_object('state','held_authority_permission','fields','{}'::jsonb);END IF;
  RETURN jsonb_build_object('state','verified_record','fields',jsonb_build_object('person_name_en',c.dependent_name_en,'person_name_ar',c.dependent_name_ar,'person_birth_date',c.date_of_birth,'person_emirates_id',c.emirates_id_number,'person_passport',c.passport_number),'proof',jsonb_build_object('table','employee_dependents','id',c.id,'revision',c.workspace_revision));
 END IF;
 RETURN jsonb_build_object('state','held_verified_subject_unresolved','fields','{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_authority_facts(bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_record_finding(p_document bigint,p_field text,p_rule text,p_subject text,p_pair jsonb,p_authority jsonb DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE key text;found_id bigint;
BEGIN
 key:='ai-mod04:'||encode(sha256(convert_to(jsonb_build_object('version',1,'rule',p_rule,'field',p_field,'subject',p_subject,'sources',p_pair,'authority',p_authority)::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended(key,0));
 SELECT id INTO found_id FROM public.dms_ai_validation_findings WHERE finding_key=key ORDER BY id LIMIT 1;
 IF found_id IS NULL THEN
  INSERT INTO public.dms_ai_validation_findings(finding_key,document_id,field_code,finding_type,severity,status,source_module,rule_code,rule_label,rule_version,ai_generated,current_value_summary,expected_value_summary,reason_message,evidence_json,created_by)
  VALUES(key,p_document,p_field,'document_inconsistency','warning','open','DMS',p_rule,'Review supported recorded facts','1',false,'Open the permitted source to review.','A configured source or verified ERP field differs; no values were changed.','Review the linked sources. This is not identity merging, authenticity, legal or medical advice.',jsonb_build_object('subjectKey',p_subject,'sources',p_pair,'authority',p_authority,'canonical',p_rule),public.current_user_profile_id()) RETURNING id INTO found_id;
 END IF;
 RETURN found_id;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_record_finding(bigint,text,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_finding_visible(p_evidence jsonb)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE s jsonb;
BEGIN
 IF NOT erp_private.business_principal_is_active() OR jsonb_typeof(p_evidence->'sources') IS DISTINCT FROM 'array' OR jsonb_array_length(p_evidence->'sources') NOT BETWEEN 1 AND 10 THEN RETURN false;END IF;
 FOR s IN SELECT value FROM jsonb_array_elements(p_evidence->'sources') LOOP
  IF coalesce(s->>'documentId','') !~ '^[1-9][0-9]{0,15}$' OR NOT erp_private.document_permission((s->>'documentId')::bigint,'dms.documents.view') OR NOT erp_private.document_permission((s->>'documentId')::bigint,'dms.documents.preview') OR NOT erp_private.ai_mod04_subjects_allowed((s->>'documentId')::bigint) THEN RETURN false;END IF;
 END LOOP;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_finding_visible(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod04_finding_visible(jsonb) TO authenticated;
CREATE POLICY ai_mod04_finding_sources ON public.dms_ai_validation_findings AS RESTRICTIVE FOR SELECT TO authenticated USING(coalesce(finding_key,'') NOT LIKE 'ai-mod04:%' OR erp_private.ai_mod04_finding_visible(evidence_json));

-- Selected-source comparison extends the existing validation finding store.
CREATE OR REPLACE FUNCTION erp_private.ai_mod04_compare(p_selections jsonb,p_record_findings boolean DEFAULT false,p_expected_hashes jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<comparison>>
DECLARE choice jsonb; d public.dms_documents; version public.dms_document_versions; source jsonb; facts jsonb; passages jsonb; sources jsonb:='[]'; findings jsonb:='[]';
 material jsonb; snapshot text; complete boolean; pair jsonb; left_source jsonb; right_source jsonb; fact jsonb; other_fact jsonb; finding_key text; finding_id bigint; old_finding bigint; rule text; canonical text; authority jsonb; expected text; authority_partial boolean:=false;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(p_selections) IS DISTINCT FROM 'array' OR jsonb_array_length(p_selections) NOT BETWEEN 2 AND 10 OR octet_length(p_selections::text)>8192 OR jsonb_array_length(p_selections)<>(SELECT count(DISTINCT (x->>'documentId',x->>'versionId')) FROM jsonb_array_elements(p_selections) x) THEN RAISE EXCEPTION 'Select two to ten distinct retained sources' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_selections) x WHERE jsonb_typeof(x) IS DISTINCT FROM 'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(x) k WHERE k NOT IN ('documentId','versionId')) OR coalesce(x->>'documentId','') !~ '^[1-9][0-9]*$' OR (x?'versionId' AND coalesce(x->>'versionId','') !~ '^[1-9][0-9]*$')) THEN RAISE EXCEPTION 'Invalid source selection' USING ERRCODE='22023'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_selections)x WHERE NOT erp_private.document_permission((x->>'documentId')::bigint,'dms.documents.view') OR NOT erp_private.document_permission((x->>'documentId')::bigint,'dms.documents.preview')) THEN RAISE EXCEPTION 'Selected source access unavailable' USING ERRCODE='42501'; END IF;
 PERFORM doc.id FROM public.dms_documents doc WHERE doc.id IN(SELECT (x->>'documentId')::bigint FROM jsonb_array_elements(p_selections) x) ORDER BY doc.id FOR SHARE;
 FOR choice IN SELECT x FROM jsonb_array_elements(p_selections) x LOOP
  SELECT * INTO d FROM public.dms_documents WHERE id=(choice->>'documentId')::bigint AND deleted_at IS NULL;
  IF NOT FOUND OR NOT erp_private.document_permission(d.id,'dms.documents.view') OR NOT erp_private.document_permission(d.id,'dms.documents.preview') OR NOT erp_private.ai_mod04_subjects_allowed(d.id) THEN RAISE EXCEPTION 'Selected source access unavailable' USING ERRCODE='42501'; END IF;
  SELECT * INTO version FROM public.dms_document_versions WHERE id=coalesce((choice->>'versionId')::bigint,d.current_version_id) AND document_id=d.id AND unlinked_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Selected retained version unavailable' USING ERRCODE='42501'; END IF;
  PERFORM erp_private.ai_mod04_lock_source(d.id);
  source:=erp_private.ai_mod04_source(d.id);
  SELECT coalesce(jsonb_agg(jsonb_build_object('fileId',f.id,'versionId',f.version_id,'sha256',f.sha256_hash,'name',f.file_name,'text',left(f.ocr_text,5000),'page',NULL,'locationPrecision','snippet') ORDER BY f.id),'[]'::jsonb),
   coalesce(bool_and(nullif(btrim(f.ocr_text),'') IS NOT NULL AND length(f.ocr_text)<=5000),false) AND count(*) BETWEEN 1 AND 10
   INTO passages,complete FROM public.dms_document_files f WHERE f.document_id=d.id AND f.version_id=version.id AND f.deleted_at IS NULL AND f.file_role='original';
  IF jsonb_array_length(passages)>10 THEN RAISE EXCEPTION 'Selected version exceeds bounded comparison; narrow the selection' USING ERRCODE='54000'; END IF;
  -- Current accepted metadata must never be relabelled as historical metadata.
  facts:='[]'::jsonb;
  IF version.id=d.current_version_id THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('key',field->>'code','value',field->'current','kind',CASE WHEN field->>'type' IN('number','decimal') THEN 'quantity' WHEN field->>'type'='date' THEN 'date' ELSE 'text' END,'unit',NULL,'currency',NULL,'evidence','[]'::jsonb) ORDER BY field->>'code'),'[]'::jsonb) INTO facts FROM jsonb_array_elements(source->'fields') field;
   facts:=facts||jsonb_build_array(
    jsonb_build_object('key','document.title','value',d.title,'kind','text','unit',NULL,'currency',NULL,'evidence','[]'::jsonb),
    jsonb_build_object('key','document.issue_date','value',d.issue_date,'kind','date','unit',NULL,'currency',NULL,'evidence','[]'::jsonb),
    jsonb_build_object('key','document.expiry_date','value',d.expiry_date,'kind','date','unit',NULL,'currency',NULL,'evidence','[]'::jsonb));
   IF jsonb_array_length(facts)>250 THEN RAISE EXCEPTION 'Too many registered comparison fields; narrow the selection' USING ERRCODE='54000';END IF;
  ELSE complete:=false; END IF;
  material:=jsonb_build_object('documentId',d.id,'versionId',version.id,'source',CASE WHEN version.id=d.current_version_id THEN source->>'snapshot' ELSE NULL END,'passages',passages);
  snapshot:=encode(sha256(convert_to(material::text,'UTF8')),'hex');
  sources:=sources||jsonb_build_array(jsonb_build_object('documentId',d.id,'documentNo',d.document_no,'versionId',version.id,'sourceHash',snapshot,'subjectKey',CASE WHEN version.id=d.current_version_id AND source->'subject' IS NOT NULL AND source->'subject'<>'null'::jsonb THEN (source->'subject'->>'kind')||':'||(source->'subject'->>'id') ELSE NULL END,'facts',facts,'complete',complete,'passages',passages,'profile',CASE WHEN version.id=d.current_version_id AND source->'profile'<>'null'::jsonb THEN jsonb_build_object('revision',source->'profile'->'revision','status',source->'profile'->'status','criticalFields',source->'profile'->'criticalFields') ELSE NULL END));
 END LOOP;
 IF jsonb_array_length(sources)<>(SELECT count(DISTINCT (x->>'documentId',x->>'versionId')) FROM jsonb_array_elements(sources)x) THEN RAISE EXCEPTION 'Select distinct resolved sources' USING ERRCODE='22023'; END IF;
 IF octet_length(sources::text)>1048576 THEN RAISE EXCEPTION 'Comparison exceeds bounded output; narrow the selection' USING ERRCODE='54000'; END IF;
 IF p_record_findings THEN
  PERFORM erp_private.ai_mod04_lock_profile_authority(public.current_user_profile_id());
  IF jsonb_array_length(sources)<>2 THEN RAISE EXCEPTION 'Record consistency findings for one explicit pair at a time' USING ERRCODE='22023';END IF;
  left_source:=sources->0;right_source:=sources->1;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(sources)x WHERE NOT erp_private.document_permission((x->>'documentId')::bigint,'dms.documents.edit') OR NOT(erp_private.document_permission((x->>'documentId')::bigint,'dms.documents.review_ai') OR erp_private.document_permission((x->>'documentId')::bigint,'dms.admin'))) THEN RAISE EXCEPTION 'Finding review permission unavailable' USING ERRCODE='42501';END IF;
  IF p_expected_hashes IS DISTINCT FROM(SELECT jsonb_agg(x->'sourceHash') FROM jsonb_array_elements(sources)x) THEN RAISE EXCEPTION 'Compared sources changed; review again' USING ERRCODE='PT409';END IF;
  IF NOT EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_AI_VALIDATION' AND is_enabled) THEN RETURN jsonb_build_object('sources',sources,'findings',findings,'findingScope','held_feature_disabled');END IF;
  IF coalesce(left_source->>'subjectKey','') !~ '^(employee|employee_dependent|company):[1-9][0-9]*$' OR left_source->>'subjectKey' IS DISTINCT FROM right_source->>'subjectKey' THEN RETURN jsonb_build_object('sources',sources,'findings',findings,'findingScope','held_verified_subject_unresolved');END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(sources)x JOIN public.dms_documents doc ON doc.id=(x->>'documentId')::bigint WHERE NOT erp_private.ai_mod04_profile_current(doc.document_type_id)) THEN RETURN jsonb_build_object('sources',sources,'findings',findings,'findingScope','held_profile_schema');END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(sources)x WHERE x->'profile'->>'status' IS DISTINCT FROM 'active') THEN RETURN jsonb_build_object('sources',sources,'findings',findings,'findingScope','held_profile_approval');END IF;
  pair:=(SELECT jsonb_agg(jsonb_build_object('documentId',x->'documentId','versionId',x->'versionId','sourceHash',x->'sourceHash') ORDER BY (x->>'documentId')::bigint,(x->>'versionId')::bigint) FROM jsonb_array_elements(sources)x);
  -- Retire source-bound open findings even when the changed evidence now agrees.
  FOR old_finding IN SELECT f.id FROM public.dms_ai_validation_findings f WHERE f.finding_key LIKE 'ai-mod04:%' AND f.status='open' AND f.deleted_at IS NULL AND f.evidence_json->>'subjectKey'=left_source->>'subjectKey' AND f.evidence_json->'sources' IS DISTINCT FROM pair AND (SELECT jsonb_agg(x->'documentId' ORDER BY (x->>'documentId')::bigint) FROM jsonb_array_elements(f.evidence_json->'sources')x)=(SELECT jsonb_agg(x->'documentId' ORDER BY (x->>'documentId')::bigint) FROM jsonb_array_elements(pair)x) LOOP
   UPDATE public.dms_ai_validation_findings SET status='superseded',updated_at=clock_timestamp() WHERE id=old_finding;
   INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json) VALUES((left_source->>'documentId')::bigint,'ai_consistency_source_superseded','Prior finding retained; its selected source changed.',public.current_user_profile_id(),jsonb_build_object('previousFindingId',old_finding));
  END LOOP;
  FOR fact IN SELECT DISTINCT ON(erp_private.ai_mod04_fact_kind(x->>'key'))x FROM jsonb_array_elements(left_source->'facts')x WHERE nullif(btrim(x->>'value'),'') IS NOT NULL AND erp_private.ai_mod04_fact_kind(x->>'key') IS NOT NULL AND left_source->'profile'->'criticalFields' ? (x->>'key') ORDER BY erp_private.ai_mod04_fact_kind(x->>'key'),x->>'key' LOOP
   canonical:=erp_private.ai_mod04_fact_kind(fact->>'key');
   IF (canonical LIKE 'company_%') IS DISTINCT FROM(left_source->>'subjectKey' LIKE 'company:%') THEN CONTINUE;END IF;
   IF (SELECT count(DISTINCT erp_private.ai_mod04_fact_normal(canonical,x->>'value')) FROM jsonb_array_elements(left_source->'facts')x WHERE erp_private.ai_mod04_fact_kind(x->>'key')=canonical AND left_source->'profile'->'criticalFields' ? (x->>'key'))<>1 OR (SELECT count(DISTINCT erp_private.ai_mod04_fact_normal(canonical,x->>'value')) FROM jsonb_array_elements(right_source->'facts')x WHERE nullif(btrim(x->>'value'),'') IS NOT NULL AND erp_private.ai_mod04_fact_kind(x->>'key')=canonical AND right_source->'profile'->'criticalFields' ? (x->>'key'))<>1 THEN CONTINUE;END IF;
   SELECT x INTO other_fact FROM jsonb_array_elements(right_source->'facts')x WHERE nullif(btrim(x->>'value'),'') IS NOT NULL AND erp_private.ai_mod04_fact_kind(x->>'key')=canonical AND right_source->'profile'->'criticalFields' ? (x->>'key') ORDER BY x->>'key' LIMIT 1;
   IF nullif(btrim(fact->>'value'),'') IS NULL OR nullif(btrim(other_fact->>'value'),'') IS NULL THEN CONTINUE;END IF;
   IF canonical='person_emirates_id' AND(length(erp_private.ai_mod04_fact_normal(canonical,fact->>'value'))<>15 OR length(erp_private.ai_mod04_fact_normal(canonical,other_fact->>'value'))<>15) THEN CONTINUE;END IF;
   IF erp_private.ai_mod04_fact_normal(canonical,fact->>'value')=erp_private.ai_mod04_fact_normal(canonical,other_fact->>'value') THEN CONTINUE;END IF;
   rule:='AI_MOD04_'||upper(canonical);finding_id:=erp_private.ai_mod04_record_finding((left_source->>'documentId')::bigint,fact->>'key',rule,left_source->>'subjectKey',pair,NULL);
   findings:=findings||jsonb_build_array(jsonb_build_object('id',finding_id,'rule',rule,'field',fact->>'key'));
  END LOOP;
  FOR source IN SELECT value FROM jsonb_array_elements(sources) LOOP
   authority:=erp_private.ai_mod04_authority_facts((source->>'documentId')::bigint);
   IF authority->>'state' LIKE 'held_%' THEN authority_partial:=true;CONTINUE;END IF;
   FOR fact IN SELECT DISTINCT ON(erp_private.ai_mod04_fact_kind(x->>'key'))x FROM jsonb_array_elements(source->'facts')x WHERE nullif(btrim(x->>'value'),'') IS NOT NULL AND erp_private.ai_mod04_fact_kind(x->>'key') IS NOT NULL AND source->'profile'->'criticalFields' ? (x->>'key') ORDER BY erp_private.ai_mod04_fact_kind(x->>'key'),x->>'key' LOOP
    canonical:=erp_private.ai_mod04_fact_kind(fact->>'key');expected:=authority->'fields'->>canonical;
    IF nullif(btrim(expected),'') IS NULL THEN authority_partial:=true;CONTINUE;END IF;
    IF nullif(btrim(fact->>'value'),'') IS NULL THEN CONTINUE;END IF;
    IF canonical='person_emirates_id' AND(length(erp_private.ai_mod04_fact_normal(canonical,fact->>'value'))<>15 OR length(erp_private.ai_mod04_fact_normal(canonical,expected))<>15) THEN authority_partial:=true;CONTINUE;END IF;
    IF erp_private.ai_mod04_fact_normal(canonical,fact->>'value')=erp_private.ai_mod04_fact_normal(canonical,expected) THEN CONTINUE;END IF;
    rule:='AI_MOD04_ERP_'||upper(canonical);finding_id:=erp_private.ai_mod04_record_finding((source->>'documentId')::bigint,fact->>'key',rule,source->>'subjectKey',pair,authority->'proof');
    findings:=findings||jsonb_build_array(jsonb_build_object('id',finding_id,'rule',rule,'field',fact->>'key'));
   END LOOP;
  END LOOP;
 END IF;
 RETURN jsonb_build_object('sources',sources,'findings',findings,'findingScope',CASE WHEN NOT p_record_findings THEN 'not_requested' WHEN authority_partial THEN 'supported_critical_facts_only_partial_erp_authority' ELSE 'supported_critical_and_authorized_erp_facts' END);

END $$;
CREATE OR REPLACE FUNCTION public.ai_mod04_compare(p_selections jsonb,p_record_findings boolean DEFAULT false,p_expected_hashes jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.ai_mod04_compare(p_selections,p_record_findings,p_expected_hashes)$$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_compare(jsonb,boolean,jsonb),public.ai_mod04_compare(jsonb,boolean,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod04_compare(jsonb,boolean,jsonb),public.ai_mod04_compare(jsonb,boolean,jsonb) TO authenticated;


CREATE OR REPLACE FUNCTION erp_private.ai_mod04_target_type(p_document bigint,p_code text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE t public.dms_document_types; d public.dms_documents; fields jsonb; schema_hash text; hold text;
BEGIN
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL;
 SELECT * INTO t FROM public.dms_document_types WHERE type_code=p_code AND is_active AND deleted_at IS NULL;
 IF d.id IS NULL OR t.id IS NULL THEN RAISE EXCEPTION 'Registered type unavailable' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'code',m.field_code,'label',m.field_label_en,'type',m.field_type,'required',(coalesce(m.is_required,false) OR coalesce(erp_private.ai_mod04_profile(t.id,true)->'requiredFields' ? m.field_code,false)),'aiExtractable',coalesce(m.is_ai_extractable,false),
   'current',coalesce(v.value_text,v.value_number::text,v.value_date::text,v.value_datetime::text,v.value_boolean::text,v.value_json::text)) ORDER BY m.id),'[]'::jsonb),
   erp_private.ai_mod04_type_schema_hash(t.id) INTO fields,schema_hash
 FROM public.dms_metadata_definitions m LEFT JOIN public.dms_document_metadata_values v ON v.definition_id=m.id AND v.document_id=d.id AND v.deleted_at IS NULL
 WHERE m.document_type_id=t.id AND m.is_active AND m.deleted_at IS NULL;
 IF erp_private.ai_mod04_profile(t.id,true) IS NOT NULL AND erp_private.ai_mod04_profile(t.id,true)->>'status'<>'active' THEN hold:='The target processing profile requires approval.'; END IF;
 IF NOT erp_private.ai_mod04_profile_current(t.id) THEN hold:='The target processing profile and schema need reevaluation.'; END IF;
 IF t.default_confidentiality NOT IN ('internal','company') AND t.default_confidentiality IS DISTINCT FROM d.confidentiality_level THEN hold:='Review the required confidentiality in the existing record editor before changing this type.'; END IF;
 IF t.id<>d.document_type_id AND (t.type_code IN ('EMPLOYEE_PHOTO','DEPENDENT_PHOTO') OR EXISTS(SELECT 1 FROM public.employees e WHERE e.photo_dms_document_id=d.id AND e.deleted_at IS NULL) OR EXISTS(SELECT 1 FROM public.employee_dependents child WHERE child.photo_dms_document_id=d.id AND child.deleted_at IS NULL) OR EXISTS(SELECT 1 FROM public.employee_medical_records m WHERE m.dms_document_id=d.id AND m.deleted_at IS NULL) OR EXISTS(SELECT 1 FROM public.employee_medical_insurances m WHERE m.dms_document_id=d.id AND m.deleted_at IS NULL)) THEN hold:='A protected photo or clinical source needs its owning workflow review before a type change.'; END IF;
 RETURN jsonb_build_object('documentTypeId',t.id,'typeCode',t.type_code,'typeName',t.name_en,'categoryId',t.category_id,'categoryName',(SELECT c.name_en FROM public.dms_document_categories c WHERE c.id=t.category_id),
  'profile',erp_private.ai_mod04_profile(t.id,true),'profileHash',encode(sha256(convert_to(coalesce(erp_private.ai_mod04_profile(t.id,true),'null'::jsonb)::text,'UTF8')),'hex'),'schemaHash',schema_hash,'fields',fields,'canApply',hold IS NULL,'holdReason',hold);
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_target_type(bigint,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE TABLE erp_private.ai_mod04_intake_draft_receipts(
 actor bigint NOT NULL REFERENCES public.user_profiles(id),request_id uuid NOT NULL,upload_session_id bigint NOT NULL REFERENCES public.dms_upload_sessions(id) ON DELETE RESTRICT,
 input_hash text NOT NULL,receipt jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor,request_id)
);
ALTER TABLE erp_private.ai_mod04_intake_draft_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.ai_mod04_intake_draft_receipts FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX ai_mod04_intake_draft_session ON erp_private.ai_mod04_intake_draft_receipts(upload_session_id);
CREATE OR REPLACE FUNCTION erp_private.ai_mod04_intake_draft(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<draft>>
DECLARE actor bigint:=public.current_user_profile_id(); session_id bigint; s public.dms_upload_sessions; source jsonb; saved erp_private.ai_mod04_intake_draft_receipts;
 target_draft_id bigint; snapshot text; rows jsonb; key uuid; digest text; item jsonb; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR actor IS NULL OR NOT erp_private.business_principal_is_active() OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>1572864 OR p_action NOT IN ('read','save','recover') OR p_action IS NULL THEN RAISE EXCEPTION 'Invalid draft access' USING ERRCODE='42501'; END IF;
 session_id:=(p_data->>'uploadSessionId')::bigint;
 IF NOT erp_private.upload_session_permission(session_id,'dms.documents.preview') THEN RAISE EXCEPTION 'Draft source access unavailable' USING ERRCODE='42501'; END IF;
 IF p_action='recover' THEN
  SELECT * INTO saved FROM erp_private.ai_mod04_intake_draft_receipts r WHERE r.actor=draft.actor AND r.request_id=(p_data->>'requestId')::uuid AND r.upload_session_id=session_id;
  RETURN jsonb_build_object('receipt',saved.receipt);
 END IF;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=session_id FOR UPDATE;
 IF NOT erp_private.f07_upload_subject_allowed(session_id) THEN RAISE EXCEPTION 'Original draft subject access denied' USING ERRCODE='42501'; END IF;
 IF p_action='save' THEN source:=erp_private.f07_intake_source(session_id);
 ELSE source:=erp_private.f07_intake_source_row(s); END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.field_scope,v.field_code,v.updated_at,v.id),'[]'::jsonb) INTO rows FROM public.dms_intake_review_values v WHERE v.upload_session_id=session_id;
 IF jsonb_array_length(rows)>300 THEN RAISE EXCEPTION 'Draft exceeds bounded review' USING ERRCODE='54000'; END IF;
 snapshot:=encode(sha256(convert_to(jsonb_build_object('source',source,'analysis',s.ai_result_id,'draft',rows)::text,'UTF8')),'hex');
 IF p_action='read' THEN RETURN jsonb_build_object('uploadSessionId',session_id,'analysisResultId',s.ai_result_id,'snapshot',snapshot,'values',rows); END IF;
 key:=(p_data->>'requestId')::uuid;digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 IF key IS NULL OR p_data->>'snapshot' IS NULL THEN RAISE EXCEPTION 'Retain the reviewed draft request' USING ERRCODE='22023'; END IF;
 SELECT * INTO saved FROM erp_private.ai_mod04_intake_draft_receipts r WHERE r.actor=draft.actor AND r.request_id=key;
 IF FOUND THEN IF saved.upload_session_id<>session_id OR saved.input_hash<>digest THEN RAISE EXCEPTION 'Original draft request differs' USING ERRCODE='PT409'; END IF; RETURN saved.receipt; END IF;
 IF snapshot IS DISTINCT FROM p_data->>'snapshot' THEN RAISE EXCEPTION 'Draft or analysis changed; compare current values' USING ERRCODE='PT409'; END IF;
 IF jsonb_typeof(p_data->'values') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'values')>300 OR jsonb_array_length(p_data->'values')<>(SELECT count(DISTINCT (v->>'fieldScope',v->>'fieldCode')) FROM jsonb_array_elements(p_data->'values')v) THEN RAISE EXCEPTION 'Invalid draft values' USING ERRCODE='22023'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_data->'values') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR coalesce(item->>'fieldScope','') NOT IN ('document','metadata') OR coalesce(item->>'fieldCode','') !~ '^[A-Za-z0-9_:-]{1,100}$' OR NOT item?'reviewedValueJson' OR octet_length((item->'reviewedValueJson')::text)>32768 OR length(coalesce(item->>'sourceSnippet',''))>2000 THEN RAISE EXCEPTION 'Unsupported draft field' USING ERRCODE='22023'; END IF;
  -- The deployed table has no natural-key UNIQUE constraint. Serialize on
  -- its already-locked parent and preserve any historical duplicate rows.
  SELECT v.id INTO target_draft_id FROM public.dms_intake_review_values v WHERE v.upload_session_id=session_id AND v.field_scope=item->>'fieldScope' AND v.field_code=item->>'fieldCode' ORDER BY v.updated_at DESC,v.id DESC LIMIT 1 FOR UPDATE;
  IF target_draft_id IS NULL THEN
   INSERT INTO public.dms_intake_review_values(upload_session_id,field_scope,field_code,field_label,field_type,suggested_value_json,reviewed_value_json,confidence_score,confidence_label,source_snippet,review_status,updated_at)
   VALUES(session_id,item->>'fieldScope',item->>'fieldCode',item->>'fieldLabel',item->>'fieldType',item->'suggestedValueJson',item->'reviewedValueJson',(item->>'confidenceScore')::numeric,item->>'confidenceLabel',item->>'sourceSnippet','edited',clock_timestamp());
  ELSE
   UPDATE public.dms_intake_review_values SET field_label=item->>'fieldLabel',field_type=item->>'fieldType',suggested_value_json=item->'suggestedValueJson',reviewed_value_json=item->'reviewedValueJson',confidence_score=(item->>'confidenceScore')::numeric,confidence_label=item->>'confidenceLabel',source_snippet=item->>'sourceSnippet',review_status='edited',updated_at=clock_timestamp() WHERE id=target_draft_id;
  END IF;
 END LOOP;
 UPDATE public.dms_upload_sessions SET review_status='in_review',updated_at=clock_timestamp() WHERE id=session_id;
 SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.field_scope,v.field_code,v.updated_at,v.id),'[]'::jsonb) INTO rows FROM public.dms_intake_review_values v WHERE v.upload_session_id=session_id;
 snapshot:=encode(sha256(convert_to(jsonb_build_object('source',source,'analysis',s.ai_result_id,'draft',rows)::text,'UTF8')),'hex');
 result:=jsonb_build_object('uploadSessionId',session_id,'requestId',key,'savedCount',jsonb_array_length(p_data->'values'),'snapshot',snapshot);
 INSERT INTO erp_private.ai_mod04_intake_draft_receipts(actor,request_id,upload_session_id,input_hash,receipt) VALUES(actor,key,session_id,digest,result);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.ai_mod04_intake_draft(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.ai_mod04_intake_draft(p_action,p_data)$$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_intake_draft(text,jsonb),public.ai_mod04_intake_draft(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod04_intake_draft(text,jsonb),public.ai_mod04_intake_draft(text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION erp_private.f07_ai_metadata_apply(p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
<<ai>>
DECLARE d public.dms_documents; actor bigint; key uuid; h text; saved erp_private.f07_metadata_receipts; a public.dms_ai_extraction_results;
 def public.dms_metadata_definitions; selection jsonb; val jsonb; currentval jsonb; col text; values jsonb:='[]'; fields jsonb:='[]'; source_hash text;
 r jsonb; runid bigint; n integer; confidence numeric; threshold numeric; history jsonb:='[]'; entry jsonb;
BEGIN
 IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>1048576 THEN RAISE EXCEPTION 'Invalid metadata review' USING ERRCODE='22023'; END IF;
 d:=erp_private.f07_metadata_authority((p_data->>'documentId')::bigint,false);actor:=public.current_user_profile_id();
 IF NOT (erp_private.document_permission(d.id,'dms.documents.edit') OR erp_private.document_permission(d.id,'dms.admin')) THEN RAISE EXCEPTION 'Edit permission required' USING ERRCODE='42501'; END IF;
 key:=(p_data->>'requestId')::uuid;h:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
 IF key IS NULL THEN RAISE EXCEPTION 'Retain metadata review identity' USING ERRCODE='22023'; END IF;
 SELECT * INTO saved FROM erp_private.f07_metadata_receipts WHERE f07_metadata_receipts.actor=ai.actor AND request_id=key;
 IF FOUND THEN IF saved.payload_hash<>h OR saved.document_id<>d.id THEN RAISE EXCEPTION 'Metadata request reused' USING ERRCODE='PT409'; END IF;RETURN saved.receipt; END IF;
 d:=erp_private.f07_metadata_authority(d.id,true);
 IF p_data->>'snapshot' IS DISTINCT FROM erp_private.f07_metadata_snapshot(d.id) THEN RAISE EXCEPTION 'Reviewed metadata or schema changed' USING ERRCODE='PT409'; END IF;
 SELECT * INTO a FROM public.dms_ai_extraction_results WHERE id=(p_data->>'aiResultId')::bigint AND document_id=d.id FOR UPDATE;
 IF a.result_type='preparation' THEN RAISE EXCEPTION 'Use the consolidated preparation review' USING ERRCODE='42501'; END IF;
 IF NOT FOUND OR a.ai_status NOT IN ('pending_review','accepted','partially_accepted') OR coalesce(a.review_action,'') IN ('rejected','dismissed') THEN RAISE EXCEPTION 'AI suggestion unavailable' USING ERRCODE='42501'; END IF;
 PERFORM erp_private.f07_check_ai_source(a.id,d.id);
 source_hash:=encode(sha256(convert_to(to_jsonb(a)::text,'UTF8')),'hex');
 IF p_data->>'sourceSnapshot' IS DISTINCT FROM source_hash THEN RAISE EXCEPTION 'AI suggestion changed since review' USING ERRCODE='PT409'; END IF;
 IF a.file_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dms_document_files f JOIN public.dms_documents doc ON doc.current_version_id=f.version_id WHERE f.id=a.file_id AND f.document_id=d.id AND doc.id=d.id AND f.deleted_at IS NULL) THEN RAISE EXCEPTION 'AI source file was replaced' USING ERRCODE='PT409'; END IF;
 IF jsonb_typeof(p_data->'selections') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'selections') NOT BETWEEN 1 AND 50 OR
  (SELECT count(*) FROM jsonb_array_elements(p_data->'selections'))<>(SELECT count(DISTINCT x->>'definitionId') FROM jsonb_array_elements(p_data->'selections') x) THEN RAISE EXCEPTION 'Invalid or duplicate selected fields' USING ERRCODE='22023'; END IF;
 FOR selection IN SELECT x FROM jsonb_array_elements(p_data->'selections') x ORDER BY (x->>'definitionId')::bigint LOOP
  SELECT * INTO def FROM public.dms_metadata_definitions WHERE id=(selection->>'definitionId')::bigint AND document_type_id=d.document_type_id AND is_active AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND OR NOT def.is_ai_extractable OR def.field_code IS DISTINCT FROM selection->>'fieldCode' THEN RAISE EXCEPTION 'AI field definition changed or not extractable' USING ERRCODE='22023'; END IF;
  col:=erp_private.f07_metadata_column(def.field_type);val:=a.extracted_fields_json->def.field_code;
  -- Only exact known types are coerced. Never parse a numeric prefix or invent a calendar date.
  IF jsonb_typeof(val)='string' THEN
   IF col='value_number' THEN IF val#>>'{}' !~ '^-?[0-9]+(\.[0-9]+)?$' THEN RAISE EXCEPTION 'Invalid AI number' USING ERRCODE='22023'; END IF;val:=to_jsonb((val#>>'{}')::numeric);
   ELSIF col='value_boolean' THEN IF lower(val#>>'{}') NOT IN ('true','false','yes','no','1','0') THEN RAISE EXCEPTION 'Invalid AI boolean' USING ERRCODE='22023'; END IF;val:=to_jsonb(lower(val#>>'{}') IN ('true','yes','1'));
   ELSIF col='value_json' THEN val:=(val#>>'{}')::jsonb; END IF;
  END IF;
  PERFORM erp_private.f07_validate_metadata_value(def.id,jsonb_build_object(col,val));
  IF val IS NULL OR val='null'::jsonb THEN RAISE EXCEPTION 'No AI value to apply' USING ERRCODE='22023'; END IF;
  SELECT to_jsonb(m)->col INTO currentval FROM public.dms_document_metadata_values m WHERE document_id=d.id AND definition_id=def.id AND deleted_at IS NULL;
  IF selection->>'applyMode' NOT IN ('fill_missing_only','replace_selected') OR selection->>'applyMode' IS NULL THEN RAISE EXCEPTION 'Invalid apply mode' USING ERRCODE='22023'; END IF;
  IF currentval IS NOT NULL AND currentval<>'null'::jsonb AND currentval<>val AND (selection->>'applyMode'='fill_missing_only' OR p_data->'confirmation'->'replaceExistingConfirmed' IS DISTINCT FROM 'true'::jsonb) THEN RAISE EXCEPTION 'Explicit replacement confirmation required' USING ERRCODE='22023'; END IF;
  confidence:=nullif(a.field_confidence_json->def.field_code->>'score','')::numeric;threshold:=coalesce(def.ai_confidence_threshold,0.8);
  IF (confidence IS NULL OR confidence<threshold OR def.review_required_if_low_confidence) AND p_data->'confirmation'->'lowConfidenceConfirmed' IS DISTINCT FROM 'true'::jsonb THEN RAISE EXCEPTION 'Low-confidence review confirmation required' USING ERRCODE='22023'; END IF;
  values:=values||jsonb_build_array(jsonb_build_object('definition_id',def.id,col,val));fields:=fields||jsonb_build_array(def.field_code);
  history:=history||jsonb_build_array(jsonb_build_object('definitionId',def.id,'fieldCode',def.field_code,'old',left(currentval#>>'{}',100),'new',left(val#>>'{}',100),'confidence',confidence,'label',a.field_confidence_json->def.field_code->>'label','mode',selection->>'applyMode'));
 END LOOP;
 n:=erp_private.f07_write_metadata(d.id,values,actor);
 INSERT INTO public.dms_ai_metadata_apply_runs(document_id,ai_result_id,applied_by,apply_status,selected_count,applied_count,skipped_count,replace_confirmed,low_confidence_confirmed,completed_at)
 VALUES(d.id,a.id,actor,'completed',n,n,0,coalesce((p_data->'confirmation'->>'replaceExistingConfirmed')::boolean,false),coalesce((p_data->'confirmation'->>'lowConfidenceConfirmed')::boolean,false),clock_timestamp()) RETURNING id INTO runid;
 FOR entry IN SELECT x FROM jsonb_array_elements(history) x LOOP
  INSERT INTO public.dms_ai_metadata_apply_items(apply_run_id,document_id,definition_id,field_code,old_value_summary,new_value_summary,confidence_score,confidence_label,apply_mode,item_status)
  VALUES(runid,d.id,(entry->>'definitionId')::bigint,entry->>'fieldCode',entry->>'old',entry->>'new',(entry->>'confidence')::numeric,entry->>'label',entry->>'mode','applied');
 END LOOP;
 UPDATE public.dms_ai_extraction_results SET ai_status='partially_accepted',reviewed_by=actor,reviewed_at=clock_timestamp(),review_action='metadata_selected_fields_applied' WHERE id=a.id;
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by) VALUES(d.id,'ai_metadata_applied',n||' human-reviewed AI fields applied',actor);
 INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values) VALUES(actor,'DMS','dms_ai_metadata_apply_runs',runid,'ai_metadata_applied',jsonb_build_object('documentId',d.id,'count',n,'requestId',key));
 r:=jsonb_build_object('documentId',d.id,'requestId',key,'appliedCount',n,'skippedCount',0,'appliedFields',fields,'skippedFields','[]'::jsonb,'aiResultStatus','partially_accepted');
 INSERT INTO erp_private.f07_metadata_receipts(actor,request_id,document_id,payload_hash,receipt) VALUES(actor,key,d.id,h,r);RETURN r;
END $function$
;

-- Derived output is promoted only with explicit review, in the same save transaction.
CREATE OR REPLACE FUNCTION erp_private.ai_mod04_refresh_derived(p_job bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.dms_ai_job_queue;c jsonb;stages jsonb;a public.dms_ai_extraction_results;d public.dms_documents;candidate jsonb;f jsonb;stage jsonb;
 before jsonb;content text;index_receipt jsonb;semantic_state text:='not_applicable';summary_state text:='not_prepared';tags_state text:='not_prepared';
BEGIN
 SELECT * INTO j FROM public.dms_ai_job_queue WHERE id=p_job;
 SELECT preparation_context,preparation_stages INTO c,stages FROM erp_private.f07_job_claims WHERE job_id=j.id;
 SELECT * INTO d FROM public.dms_documents WHERE id=j.related_document_id FOR UPDATE;
 IF j.created_by IS DISTINCT FROM public.current_user_profile_id() OR NOT erp_private.ai_mod04_subjects_allowed(d.id) OR NOT erp_private.document_permission(d.id,'dms.documents.preview') OR NOT(erp_private.document_permission(d.id,'dms.documents.review_ai') OR erp_private.document_permission(d.id,'dms.admin')) THEN RAISE EXCEPTION 'Derived review permission unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.dms_ai_extraction_results WHERE id=(c->>'resultId')::bigint AND document_id=d.id AND ai_status='pending_review';
 IF NOT FOUND THEN RAISE EXCEPTION 'Reviewed preparation unavailable' USING ERRCODE='PT409'; END IF;
 candidate:=a.raw_response_json->'preparation';
 IF candidate->>'applicability'='portrait' THEN RETURN jsonb_build_object('state','not_applicable_portrait'); END IF;
 before:=jsonb_build_object('summary',d.ai_summary,'summaryModel',d.ai_summary_model,'files',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',file.id,'text',file.ocr_text,'provider',file.ocr_provider,'model',file.ocr_model) ORDER BY file.id),'[]'::jsonb) FROM public.dms_document_files file WHERE file.document_id=d.id AND file.version_id=d.current_version_id AND file.deleted_at IS NULL));
 IF c->>'mode'='reread_files' THEN
  FOR f IN SELECT value FROM jsonb_array_elements(c->'source'->'files') WHERE (value->>'id')::bigint IN(SELECT value::bigint FROM jsonb_array_elements_text(c->'fileIds')) LOOP
   stage:=stages->('ocr:'||(f->>'id'));
   IF stage->>'state' IS DISTINCT FROM 'completed' OR stage->'value'->>'sha256' IS DISTINCT FROM f->>'sha256' OR nullif(btrim(stage->'value'->>'text'),'') IS NULL THEN RAISE EXCEPTION 'Completed original extraction is unavailable' USING ERRCODE='PT409'; END IF;
   UPDATE public.dms_document_files SET ocr_text=stage->'value'->>'text',ocr_provider=stage->'value'->>'provider',ocr_model=stage->'value'->>'model',ocr_status='complete',ocr_completed_at=clock_timestamp(),ocr_error_message=NULL,updated_at=clock_timestamp()
    WHERE id=(f->>'id')::bigint AND document_id=d.id AND version_id=d.current_version_id AND sha256_hash=f->>'sha256' AND deleted_at IS NULL;
   IF NOT FOUND THEN RAISE EXCEPTION 'Original changed during extraction review' USING ERRCODE='PT409'; END IF;
  END LOOP;
 END IF;
 -- Include every current original, not just the selected excerpts. Preserve unrelated accepted OCR.
 SELECT left(string_agg(file.ocr_text,E'\n\n' ORDER BY file.id),500000) INTO content FROM public.dms_document_files file WHERE file.document_id=d.id AND file.version_id=d.current_version_id AND file.deleted_at IS NULL AND file.file_role='original';
 IF nullif(btrim(content),'') IS NOT NULL THEN
  INSERT INTO public.dms_document_content(document_id,content_text,content_text_updated_at,content_text_source,content_text_sha256,content_text_char_count,is_truncated,updated_at)
   VALUES(d.id,content,clock_timestamp(),'system_resync',encode(sha256(convert_to(content,'UTF8')),'hex'),length(content),length(content)>=500000,clock_timestamp())
   ON CONFLICT(document_id) DO UPDATE SET content_text=excluded.content_text,content_text_updated_at=excluded.content_text_updated_at,content_text_source=excluded.content_text_source,content_text_sha256=excluded.content_text_sha256,content_text_char_count=excluded.content_text_char_count,is_truncated=excluded.is_truncated,updated_at=excluded.updated_at;
  -- Retain old chunks for provenance while excluding their obsolete embeddings from search.
  UPDATE public.dms_document_content_chunks SET is_active=false,updated_at=clock_timestamp(),updated_by=public.current_user_profile_id() WHERE document_id=d.id AND is_active;
  semantic_state:='held_feature_disabled';
  IF EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_AI_JOB_QUEUE' AND is_enabled) AND EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_SEMANTIC_INDEX_QUEUE' AND is_enabled) THEN
   index_receipt:=erp_private.f07_ai_job_control('enqueue',jsonb_build_object('jobType','semantic_document_index','relatedDocumentId',d.id,'payload',jsonb_build_object('documentId',d.id,'source','content_sync_trigger','forceRebuild',false),'idempotencyKey','ai-mod04-index:'||p_job));
   semantic_state:='queued_existing_worker';
  END IF;
 END IF;
 IF nullif(candidate->>'summary','') IS NOT NULL THEN
  UPDATE public.dms_documents SET ai_summary=candidate->>'summary',ai_summary_model=a.raw_response_json->'processing'->>'model',ai_summary_status='complete',ai_summary_error=NULL,ai_summary_updated_at=clock_timestamp(),ai_summary_input_char_count=length(coalesce(a.raw_ocr_text,'')),ai_summary_input_truncated=true,updated_at=clock_timestamp() WHERE id=d.id;
  summary_state:='reviewed';
 END IF;
 IF jsonb_array_length(coalesce(candidate->'tagIds','[]'::jsonb))>0 THEN
  IF EXISTS(SELECT 1 FROM jsonb_array_elements_text(candidate->'tagIds') id WHERE NOT EXISTS(SELECT 1 FROM public.dms_tags tag WHERE tag.id=id::bigint AND tag.is_active AND tag.deleted_at IS NULL)) THEN RAISE EXCEPTION 'Prepared tags changed' USING ERRCODE='PT409'; END IF;
  INSERT INTO public.dms_document_tags(document_id,tag_id,created_by) SELECT d.id,id::bigint,public.current_user_profile_id() FROM jsonb_array_elements_text(candidate->'tagIds') id ON CONFLICT DO NOTHING;
  tags_state:='reviewed_existing_tags';
 END IF;
 UPDATE public.dms_documents SET ocr_text_available=nullif(btrim(content),'') IS NOT NULL,summary_embedding=NULL,summary_embedding_status='pending',summary_embedding_updated_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=d.id;
 RETURN jsonb_build_object('state','reviewed','summary',summary_state,'tags',tags_state,'semantic',semantic_state,'indexJobId',index_receipt->'jobId','priorDerived',before);
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_refresh_derived(bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_reminder_source_changed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT erp_private.business_principal_is_active() OR NOT(erp_private.document_permission(NEW.id,'dms.documents.edit') OR erp_private.document_permission(NEW.id,'dms.admin')) THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND NEW.expiry_date IS NOT DISTINCT FROM OLD.expiry_date AND NEW.document_type_id IS NOT DISTINCT FROM OLD.document_type_id AND NEW.owning_company_id IS NOT DISTINCT FROM OLD.owning_company_id AND NEW.owning_branch_id IS NOT DISTINCT FROM OLD.owning_branch_id THEN RETURN NEW; END IF;
 result:=erp_private.ai_mod04_reconcile_reminders(NEW.id);
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json) VALUES(NEW.id,'ai_preparation_reminder_policy','Current approved reminder policy evaluated; history and recipient authority retained.',public.current_user_profile_id(),result);
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_reminder_source_changed() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER ai_mod04_reminder_source_changed AFTER INSERT OR UPDATE ON public.dms_documents DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.ai_mod04_reminder_source_changed();

CREATE TABLE erp_private.ai_mod04_assignment_history(
 actor bigint NOT NULL REFERENCES public.user_profiles(id),request_id uuid NOT NULL,approval_id bigint NOT NULL REFERENCES public.dms_document_approvals(id) ON DELETE RESTRICT,
 request_hash text NOT NULL,prior_assignment jsonb NOT NULL,new_assignment jsonb NOT NULL,reason text NOT NULL,receipt jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),PRIMARY KEY(actor,request_id)
);
ALTER TABLE erp_private.ai_mod04_assignment_history ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.ai_mod04_assignment_history FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX ai_mod04_assignment_history_approval ON erp_private.ai_mod04_assignment_history(approval_id);
CREATE OR REPLACE FUNCTION erp_private.ai_mod04_approval_routing(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<routing>>
DECLARE actor bigint:=public.current_user_profile_id();d public.dms_documents;a public.dms_document_approvals;assignment erp_private.ai_mod04_approval_assignments;
 source_hash text;can_admin boolean;can_delegate boolean;ids bigint[];person bigint;old_assignment jsonb;key uuid;digest text;result jsonb;saved erp_private.ai_mod04_assignment_history;options jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR p_action IS NULL OR p_action NOT IN ('read','reassign','delegate') OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>16384 THEN RAISE EXCEPTION 'Invalid routing request' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.dms_documents WHERE id=(p_data->>'documentId')::bigint AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT erp_private.document_permission(d.id,'dms.documents.view') OR NOT erp_private.document_permission(d.id,'dms.documents.preview') OR NOT erp_private.ai_mod04_subjects_allowed(d.id) THEN RAISE EXCEPTION 'Routing access unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO a FROM public.dms_document_approvals WHERE document_id=d.id AND is_current AND action='submitted' FOR UPDATE;
 can_admin:=erp_private.document_permission(d.id,'dms.approvals.admin') OR erp_private.document_permission(d.id,'dms.admin');
 IF p_action<>'read' THEN
  key:=(p_data->>'requestId')::uuid;digest:=encode(sha256(convert_to(p_data::text,'UTF8')),'hex');
  SELECT * INTO saved FROM erp_private.ai_mod04_assignment_history h WHERE h.actor=routing.actor AND h.request_id=key;
  IF FOUND THEN IF saved.request_hash IS DISTINCT FROM digest OR saved.receipt->>'documentId' IS DISTINCT FROM d.id::text THEN RAISE EXCEPTION 'Original routing request differs' USING ERRCODE='PT409'; END IF;RETURN saved.receipt; END IF;
 END IF;
 IF a.id IS NULL THEN
  IF p_action<>'read' THEN RAISE EXCEPTION 'Approval is no longer pending' USING ERRCODE='PT409'; END IF;
  RETURN jsonb_build_object('state','not_pending','approvalId',NULL,'snapshot',NULL,'assignees','[]'::jsonb,'options','[]'::jsonb,'canReassign',false,'canDelegate',false,'decisionRule',NULL,'notificationReadiness','not_pending');
 END IF;
 SELECT * INTO assignment FROM erp_private.ai_mod04_approval_assignments WHERE approval_id=a.id FOR UPDATE;
 IF assignment.approval_id IS NULL OR assignment.source_fingerprint IS DISTINCT FROM erp_private.f07_review_fingerprint(d.id) OR assignment.workflow_fingerprint IS DISTINCT FROM erp_private.f07_workflow_fingerprint(a.workflow_id,d.id) THEN
  IF p_action<>'read' THEN RAISE EXCEPTION 'Approval route requires withdrawal and resubmission' USING ERRCODE='PT409'; END IF;
  RETURN jsonb_build_object('state','held_source_or_mapping','approvalId',a.id,'snapshot',NULL,'assignees','[]'::jsonb,'options','[]'::jsonb,'canReassign',false,'canDelegate',false,'decisionRule',NULL,'notificationReadiness','held');
 END IF;
 source_hash:=encode(sha256(convert_to(to_jsonb(assignment)::text,'UTF8')),'hex');
 can_delegate:=actor<>assignment.original_submitter AND actor=ANY(assignment.profile_ids) AND erp_private.ai_mod04_step_reviewer(actor,d.id,a.step_id) AND NOT EXISTS(SELECT 1 FROM public.dms_document_approvals v WHERE v.responds_to_approval_id=a.id AND v.actioned_by=actor AND v.action='approved');
 can_admin:=can_admin AND actor<>assignment.original_submitter;
 IF p_action='read' THEN
  options:='[]'::jsonb;
  IF can_admin OR can_delegate THEN
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'label',coalesce(p.user_code,'User')||' — '||coalesce(p.display_name,p.full_name,'Assigned reviewer')) ORDER BY p.id),'[]'::jsonb) INTO options FROM public.user_profiles p WHERE p.id<>assignment.original_submitter AND p.status='active' AND erp_private.ai_mod04_step_reviewer(p.id,d.id,a.step_id);
   IF jsonb_array_length(options)>500 THEN RAISE EXCEPTION 'Narrow reviewer configuration before reassignment' USING ERRCODE='54000'; END IF;
  END IF;
  RETURN jsonb_build_object('state','assigned','approvalId',a.id,'snapshot',source_hash,'assignees',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'label',coalesce(p.user_code,'User')||' — '||coalesce(p.display_name,p.full_name,'Assigned reviewer'),'eligible',erp_private.ai_mod04_step_reviewer(p.id,d.id,a.step_id)) ORDER BY p.id),'[]'::jsonb) FROM public.user_profiles p WHERE p.id=ANY(assignment.profile_ids)),'options',options,'canReassign',can_admin,'canDelegate',can_delegate,'decisionRule',assignment.decision_rule,'notificationReadiness',CASE WHEN EXISTS(SELECT 1 FROM unnest(assignment.profile_ids)x WHERE NOT erp_private.ai_mod04_step_reviewer(x,d.id,a.step_id)) THEN 'held_authority' ELSE 'current_assignees_only_receipt_unconfirmed' END);
 END IF;
 IF key IS NULL OR p_data->>'snapshot' IS DISTINCT FROM source_hash OR (p_data->>'approvalId')::bigint IS DISTINCT FROM a.id OR length(btrim(coalesce(p_data->>'reason',''))) NOT BETWEEN 5 AND 1000 OR jsonb_typeof(p_data->'profileIds') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Review current assignment and retain the original request' USING ERRCODE='PT409'; END IF;
 IF (p_action='reassign' AND NOT can_admin) OR (p_action='delegate' AND NOT can_delegate) THEN RAISE EXCEPTION 'Independent scoped routing authority unavailable' USING ERRCODE='42501'; END IF;
 SELECT array_agg(x::bigint ORDER BY x::bigint) INTO ids FROM jsonb_array_elements_text(p_data->'profileIds')x;
 IF coalesce(cardinality(ids),0) NOT BETWEEN 1 AND 50 OR cardinality(ids)<>(SELECT count(DISTINCT x) FROM unnest(ids)x) OR EXISTS(SELECT 1 FROM unnest(ids)x WHERE x IS NULL OR x=assignment.original_submitter OR NOT erp_private.ai_mod04_step_reviewer(x,d.id,a.step_id)) THEN RAISE EXCEPTION 'Independent eligible named reviewers required' USING ERRCODE='42501'; END IF;
 IF p_action='delegate' THEN
  IF cardinality(ids)<>1 OR ids[1]=actor OR ids[1]=ANY(assignment.profile_ids) THEN RAISE EXCEPTION 'Select one different eligible delegate' USING ERRCODE='22023'; END IF;
  ids:=array_remove(assignment.profile_ids,actor)||ids;
 END IF;
 IF EXISTS(SELECT 1 FROM public.dms_document_approvals vote WHERE vote.responds_to_approval_id=a.id AND vote.action='approved' AND NOT vote.actioned_by=ANY(ids)) THEN RAISE EXCEPTION 'Preserve already-recorded votes and reviewers' USING ERRCODE='PT409'; END IF;
 FOR person IN SELECT DISTINCT x FROM unnest(ids||ARRAY[actor])x ORDER BY x LOOP PERFORM erp_private.ai_mod04_lock_profile_authority(person); END LOOP;
 IF EXISTS(SELECT 1 FROM unnest(ids)x WHERE NOT erp_private.ai_mod04_step_reviewer(x,d.id,a.step_id)) THEN RAISE EXCEPTION 'Reviewer authority changed' USING ERRCODE='42501'; END IF;
 old_assignment:=to_jsonb(assignment);
 UPDATE erp_private.ai_mod04_approval_assignments SET profile_ids=ids,assigned_by=actor,created_at=clock_timestamp() WHERE approval_id=a.id RETURNING * INTO assignment;
 result:=jsonb_build_object('documentId',d.id,'approvalId',a.id,'requestId',key,'state','assigned','snapshot',encode(sha256(convert_to(to_jsonb(assignment)::text,'UTF8')),'hex'));
 INSERT INTO erp_private.ai_mod04_assignment_history(actor,request_id,approval_id,request_hash,prior_assignment,new_assignment,reason,receipt) VALUES(actor,key,a.id,digest,old_assignment,to_jsonb(assignment),btrim(p_data->>'reason'),result);
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json) VALUES(d.id,'approval_assignment_changed','Independent reviewer assignment changed; original submitter, source, votes and workflow retained.',actor,jsonb_build_object('approval_id',a.id,'action',p_action,'requestId',key,'previousProfileIds',old_assignment->'profile_ids','profileIds',to_jsonb(ids),'reason',btrim(p_data->>'reason')));
 -- The existing F10 outbox resolves current named assignees again at dispatch.
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json) VALUES(d.id,'approval_submitted','Approval assigned to currently authorized named reviewers.',actor,jsonb_build_object('approval_id',a.id,'workflow_id',a.workflow_id,'step_id',a.step_id,'approval_status','pending_approval'));
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.ai_mod04_approval_routing(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.ai_mod04_approval_routing(p_action,p_data)$$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_approval_routing(text,jsonb),public.ai_mod04_approval_routing(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod04_approval_routing(text,jsonb),public.ai_mod04_approval_routing(text,jsonb) TO authenticated;

-- Short transaction locks serialize accepted writes against membership revocation.
-- They are never held across OCR/model/network work.
CREATE OR REPLACE FUNCTION erp_private.ai_mod04_lock_profile_authority(p_profile bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE auth_user uuid;
BEGIN
 SELECT p.auth_user_id INTO auth_user FROM public.user_profiles p WHERE p.id=p_profile FOR SHARE NOWAIT;
 PERFORM u.id FROM auth.users u WHERE u.id=auth_user FOR SHARE NOWAIT;
 IF public.current_user_profile_id()=p_profile THEN
  PERFORM s.id FROM auth.sessions s WHERE s.user_id=auth_user AND s.id=(auth.jwt()->>'session_id')::uuid FOR SHARE NOWAIT;
 END IF;
 PERFORM u.id FROM public.user_roles u WHERE u.user_profile_id=p_profile ORDER BY u.id FOR SHARE NOWAIT;
 PERFORM r.id FROM public.roles r WHERE r.id IN(SELECT role_id FROM public.user_roles WHERE user_profile_id=p_profile) ORDER BY r.id FOR SHARE NOWAIT;
 PERFORM p.id FROM public.role_permissions p WHERE p.role_id IN(SELECT role_id FROM public.user_roles WHERE user_profile_id=p_profile) ORDER BY p.id FOR SHARE NOWAIT;
 PERFORM p.id FROM public.permissions p WHERE p.id IN(SELECT permission_id FROM public.role_permissions WHERE role_id IN(SELECT role_id FROM public.user_roles WHERE user_profile_id=p_profile)) ORDER BY p.id FOR SHARE NOWAIT;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_lock_profile_authority(bigint) FROM PUBLIC,anon,authenticated,service_role;

-- Reuse the same retained intake review when its registered schema changes.
CREATE TABLE erp_private.ai_mod04_intake_stages(
 actor bigint NOT NULL REFERENCES public.user_profiles(id),upload_session_id bigint NOT NULL REFERENCES public.dms_upload_sessions(id) ON DELETE RESTRICT,
 document_type_id bigint NOT NULL REFERENCES public.dms_document_types(id),merge_mode text NOT NULL CHECK(merge_mode IN ('fill_missing_only','replace_ai_values')),
 source_hash text NOT NULL,source jsonb NOT NULL,schema_hash text NOT NULL,actor_claims jsonb NOT NULL,token uuid NOT NULL DEFAULT gen_random_uuid(),
 state text NOT NULL DEFAULT 'started' CHECK(state IN ('started','completed')),receipt jsonb,created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(actor,upload_session_id,source_hash),UNIQUE(token)
);
ALTER TABLE erp_private.ai_mod04_intake_stages ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.ai_mod04_intake_stages FROM PUBLIC,anon,authenticated,service_role;
CREATE INDEX ai_mod04_intake_stages_recovery ON erp_private.ai_mod04_intake_stages(actor,upload_session_id,document_type_id,created_at DESC);
CREATE OR REPLACE FUNCTION erp_private.ai_mod04_intake_stage(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
<<stage>>
DECLARE actor bigint;session_id bigint;target_id bigint;mode text;s public.dms_upload_sessions;t public.dms_document_types;a public.dms_ai_extraction_results;
 bound erp_private.ai_mod04_intake_stages;source jsonb;schema_hash text;source_hash text;fields jsonb;confidences jsonb;item record;result jsonb;
 old_claims text:=current_setting('request.jwt.claims',true);new_job bigint;new_result bigint;draft jsonb;
BEGIN
 IF p_action IS NULL OR p_action NOT IN ('read','begin','complete') OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>1572864 THEN RAISE EXCEPTION 'Invalid retained extraction' USING ERRCODE='22023'; END IF;
 IF p_action='complete' THEN
  IF auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Trusted extraction publisher required' USING ERRCODE='42501'; END IF;
  SELECT * INTO bound FROM erp_private.ai_mod04_intake_stages WHERE token=(p_data->>'token')::uuid;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original extraction unavailable' USING ERRCODE='42501'; END IF;
  PERFORM set_config('request.jwt.claims',bound.actor_claims::text,true);
  actor:=bound.actor;session_id:=bound.upload_session_id;target_id:=bound.document_type_id;mode:=bound.merge_mode;
 ELSE
  actor:=public.current_user_profile_id();session_id:=(p_data->>'uploadSessionId')::bigint;target_id:=(p_data->>'documentTypeId')::bigint;mode:=p_data->>'mergeMode';
 END IF;
 IF auth.uid() IS NULL OR actor IS NULL OR NOT erp_private.business_principal_is_active() OR mode NOT IN ('fill_missing_only','replace_ai_values') THEN RAISE EXCEPTION 'Current extraction authority required' USING ERRCODE='42501'; END IF;
 SELECT * INTO s FROM public.dms_upload_sessions WHERE id=session_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Original upload unavailable' USING ERRCODE='42501'; END IF;
 PERFORM erp_private.ai_mod04_lock_profile_authority(actor);
 source:=erp_private.f07_intake_source(session_id);
 SELECT * INTO t FROM public.dms_document_types WHERE id=target_id AND is_active AND deleted_at IS NULL FOR SHARE;
 IF NOT FOUND OR (erp_private.ai_mod04_profile(t.id,true) IS NOT NULL AND erp_private.ai_mod04_profile(t.id,true)->>'status' IS DISTINCT FROM 'active') THEN RAISE EXCEPTION 'Selected processing schema awaits approval' USING ERRCODE='55000'; END IF;
 IF NOT erp_private.ai_mod04_profile_current(t.id) THEN RAISE EXCEPTION 'Selected processing schema needs reevaluation' USING ERRCODE='55000'; END IF;
 SELECT * INTO a FROM public.dms_ai_extraction_results WHERE id=s.ai_result_id AND upload_session_id=s.id;
 IF NOT FOUND OR a.review_action='accepted' THEN RAISE EXCEPTION 'Unaccepted source analysis required' USING ERRCODE='PT409'; END IF;
 schema_hash:=encode(sha256(convert_to(jsonb_build_object('schema',erp_private.ai_mod04_type_schema_hash(t.id),'profile',erp_private.ai_mod04_profile(t.id,true))::text,'UTF8')),'hex');
 source:=jsonb_build_object('file',source,'schemaHash',schema_hash,'analysisId',a.id,'analysisHash',encode(sha256(convert_to(to_jsonb(a)::text,'UTF8')),'hex'),'targetType',target_id,'mergeMode',mode);
 source_hash:=encode(sha256(convert_to(source::text,'UTF8')),'hex');
 IF p_action<>'complete' THEN
  SELECT * INTO bound FROM erp_private.ai_mod04_intake_stages x WHERE x.actor=stage.actor AND x.upload_session_id=session_id AND x.document_type_id=target_id AND x.merge_mode=mode AND
   (x.source_hash=stage.source_hash OR (x.schema_hash=stage.schema_hash AND x.source->'file'=stage.source->'file' AND x.receipt->>'resultId'=a.id::text)) ORDER BY x.created_at DESC LIMIT 1 FOR UPDATE;
  IF FOUND THEN RETURN jsonb_build_object('state',CASE WHEN bound.state='completed' THEN 'completed' ELSE 'uncertain' END,'receipt',bound.receipt,'token',NULL,'source',NULL); END IF;
  IF p_action='read' THEN RETURN jsonb_build_object('state','ready','receipt',NULL,'token',NULL,'source',jsonb_build_object('resultId',a.id,'text',a.raw_ocr_text,'existingFields',a.extracted_fields_json,'existingConfidence',a.field_confidence_json,'typeCode',t.type_code,'typeName',t.name_en,'filename',s.original_filename,'sourceHash',s.sha256_hash,'stageHash',source_hash)); END IF;
  IF p_data?'expectedStageHash' AND p_data->>'expectedStageHash' IS DISTINCT FROM source_hash THEN RAISE EXCEPTION 'Reviewed extraction source changed' USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM erp_private.ai_mod04_intake_stages x WHERE x.upload_session_id=session_id AND x.state='started') THEN RAISE EXCEPTION 'Reconcile the retained extraction before another paid request' USING ERRCODE='55000'; END IF;
  INSERT INTO erp_private.ai_mod04_intake_stages(actor,upload_session_id,document_type_id,merge_mode,source_hash,source,schema_hash,actor_claims) VALUES(actor,session_id,target_id,mode,source_hash,source,schema_hash,auth.jwt()) RETURNING * INTO bound;
  RETURN jsonb_build_object('state','started','token',bound.token,'receipt',NULL,'source',jsonb_build_object('resultId',a.id,'text',a.raw_ocr_text,'existingFields',a.extracted_fields_json,'existingConfidence',a.field_confidence_json,'typeCode',t.type_code,'typeName',t.name_en,'filename',s.original_filename,'sourceHash',s.sha256_hash,'stageHash',source_hash));
 END IF;
 SELECT * INTO bound FROM erp_private.ai_mod04_intake_stages x WHERE x.token=(p_data->>'token')::uuid FOR UPDATE;
 IF bound.state='completed' THEN result:=jsonb_build_object('state','completed','receipt',bound.receipt);PERFORM set_config('request.jwt.claims',old_claims,true);RETURN result; END IF;
 IF bound.source_hash IS DISTINCT FROM source_hash OR jsonb_typeof(p_data->'fields') IS DISTINCT FROM 'object' OR jsonb_typeof(p_data->'confidence') IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Retained source or schema changed' USING ERRCODE='PT409'; END IF;
 fields:=coalesce(a.extracted_fields_json,'{}'::jsonb);confidences:=coalesce(a.field_confidence_json,'{}'::jsonb);
 FOR item IN SELECT * FROM jsonb_each(p_data->'fields') LOOP
  IF NOT EXISTS(SELECT 1 FROM public.dms_metadata_definitions m WHERE m.document_type_id=t.id AND m.field_code=item.key AND m.is_active AND m.is_ai_extractable AND m.deleted_at IS NULL) OR length(item.value::text)>16000 THEN RAISE EXCEPTION 'Unregistered extracted field' USING ERRCODE='22023'; END IF;
  IF mode='fill_missing_only' AND nullif(btrim(fields->>item.key),'') IS NOT NULL THEN CONTINUE; END IF;
  IF item.value<>'null'::jsonb AND nullif(btrim(item.value#>>'{}'),'') IS NOT NULL THEN fields:=jsonb_set(fields,ARRAY[item.key],item.value);confidences:=jsonb_set(confidences,ARRAY[item.key],coalesce(p_data->'confidence'->item.key,'null'::jsonb)); END IF;
 END LOOP;
 INSERT INTO public.dms_ai_extraction_jobs(upload_session_id,document_id,job_type,status,input_text_hash,prompt_version,provider,model,duration_ms,created_by,completed_at,run_source)
 VALUES(s.id,s.document_id,'classify_extract','completed',source_hash,p_data->'provenance'->>'promptVersion',p_data->'provenance'->>'provider',p_data->'provenance'->>'model',(p_data->'provenance'->>'durationMs')::integer,actor,clock_timestamp(),'ai_intake') RETURNING id INTO new_job;
 INSERT INTO public.dms_ai_extraction_results(upload_session_id,document_id,job_id,result_type,ai_status,suggested_document_type_id,extracted_fields_json,field_confidence_json,raw_ocr_text,suggested_title,suggested_description,issue_date_suggestion,expiry_date_suggestion,raw_response_json)
 VALUES(s.id,s.document_id,new_job,'combined','pending_review',t.id,fields,confidences,a.raw_ocr_text,a.suggested_title,a.suggested_description,a.issue_date_suggestion,a.expiry_date_suggestion,coalesce(a.raw_response_json,'{}'::jsonb)||jsonb_build_object('preparation',p_data->'preparation','processing',p_data->'provenance','supersedesResultId',a.id,'retainedTypeReview',true)) RETURNING id INTO new_result;
 UPDATE public.dms_upload_sessions SET ai_result_id=new_result,review_status='in_review',updated_at=clock_timestamp() WHERE id=s.id;
 draft:=erp_private.ai_mod04_intake_draft('read',jsonb_build_object('uploadSessionId',s.id));
 result:=jsonb_build_object('resultId',new_result,'extractedFieldsJson',fields,'fieldConfidenceJson',confidences,'preparation',p_data->'preparation','draftSnapshot',draft->>'snapshot','skipped',false);
 UPDATE erp_private.ai_mod04_intake_stages SET state='completed',receipt=result WHERE token=bound.token;
 PERFORM set_config('request.jwt.claims',old_claims,true);
 RETURN jsonb_build_object('state','completed','receipt',result);
EXCEPTION WHEN OTHERS THEN
 PERFORM set_config('request.jwt.claims',old_claims,true);RAISE;
END $$;
CREATE OR REPLACE FUNCTION public.ai_mod04_intake_stage(p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.ai_mod04_intake_stage(p_action,p_data)$$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_intake_stage(text,jsonb),public.ai_mod04_intake_stage(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod04_intake_stage(text,jsonb),public.ai_mod04_intake_stage(text,jsonb) TO authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.f07_ai_worker(p_action text, p_data jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE j public.dms_ai_job_queue; c erp_private.f07_job_claims; claim_token uuid; rows jsonb:='[]'; v_status text; code text; worker text; n int; r jsonb;
BEGIN
 IF p_action='enqueue_child' THEN
  j:=erp_private.f07_assert_job((p_data->>'parentId')::bigint,(p_data->>'parentToken')::uuid);
  IF (p_data->'input'->>'relatedDocumentId')::bigint IS DISTINCT FROM j.related_document_id THEN RAISE EXCEPTION 'Child job source mismatch' USING ERRCODE='42501'; END IF;
  SELECT * INTO c FROM erp_private.f07_job_claims WHERE job_id=j.id;
  RETURN erp_private.f07_ai_job_control('enqueue',p_data->'input',c.actor_claims);
 END IF;
 IF p_action='recover' THEN
  FOR j IN SELECT q.* FROM public.dms_ai_job_queue q JOIN erp_private.f07_job_claims proof ON proof.job_id=q.id WHERE q.job_status='running' AND proof.expires_at<=clock_timestamp() ORDER BY q.id FOR UPDATE OF q SKIP LOCKED LIMIT 100 LOOP
   UPDATE public.dms_ai_job_attempts SET status='timed_out',completed_at=clock_timestamp(),error_code='stale_lock',safe_error_message='Worker lease expired.' WHERE job_id=j.id AND status='running';
   v_status:=CASE WHEN j.attempt_count>=j.max_attempts THEN 'failed' ELSE 'retry_scheduled' END;
   UPDATE public.dms_ai_job_queue SET job_status=v_status,run_after=clock_timestamp()+interval '1 minute',locked_at=NULL,locked_by=NULL,failed_at=CASE WHEN v_status='failed' THEN clock_timestamp() END,last_error_code='stale_lock',last_error_message='Worker lease expired.',updated_at=clock_timestamp() WHERE id=j.id;
   UPDATE erp_private.f07_job_claims SET token=NULL,expires_at=NULL WHERE job_id=j.id;
   IF v_status='failed' THEN PERFORM erp_private.f07_job_failure_review(j.id,'attempts_exhausted'); END IF;
  END LOOP;
  RETURN jsonb_build_object('success',true);
 END IF;
 IF p_action='claim' THEN
  worker:=p_data->>'workerId';n:=(p_data->>'limit')::int;
  IF worker IS NULL OR length(worker) NOT BETWEEN 1 AND 64 OR n IS NULL OR n NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'Invalid worker limits' USING ERRCODE='22023'; END IF;
  FOR j IN SELECT q.* FROM public.dms_ai_job_queue q JOIN erp_private.f07_job_claims proof ON proof.job_id=q.id WHERE q.job_status IN ('queued','retry_scheduled') AND q.attempt_count<q.max_attempts AND q.run_after<=clock_timestamp() AND (p_data->'preparationVersion'='1'::jsonb OR (proof.preparation_context IS NULL AND NOT (q.job_type='post_approve_orchestration' AND EXISTS(SELECT 1 FROM public.dms_ai_extraction_results prepared WHERE prepared.id=coalesce(q.related_ai_result_id,(SELECT u.ai_result_id FROM public.dms_upload_sessions u WHERE u.id=q.related_upload_session_id)) AND prepared.raw_response_json->'preparation'->'version'='1'::jsonb)))) ORDER BY q.priority,q.created_at,q.id FOR UPDATE OF q SKIP LOCKED LIMIT n LOOP
   claim_token:=gen_random_uuid();
   UPDATE public.dms_ai_job_queue SET job_status='running',attempt_count=attempt_count+1,locked_by=worker,locked_at=clock_timestamp(),started_at=clock_timestamp(),updated_at=clock_timestamp() WHERE id=j.id RETURNING * INTO j;
   UPDATE erp_private.f07_job_claims SET token=claim_token,expires_at=clock_timestamp()+interval '10 minutes',settled_token=NULL,receipt=NULL WHERE job_id=j.id;
   INSERT INTO public.dms_ai_job_attempts(job_id,attempt_number,status,worker_id) VALUES(j.id,j.attempt_count,'running',worker);
   rows:=rows||jsonb_build_array(jsonb_build_object('job',to_jsonb(j),'token',claim_token));
  END LOOP;
  RETURN rows;
 END IF;
 SELECT * INTO j FROM public.dms_ai_job_queue WHERE id=(p_data->>'jobId')::bigint FOR UPDATE;
 SELECT * INTO c FROM erp_private.f07_job_claims WHERE job_id=j.id FOR UPDATE;
 claim_token:=(p_data->>'token')::uuid;
 IF p_action='settle' AND claim_token IS NOT NULL AND c.settled_token=claim_token THEN RETURN c.receipt; END IF;
 j:=erp_private.f07_assert_job(j.id,claim_token,p_action<>'settle' OR coalesce((p_data->>'success')::boolean,false));
 IF p_action='assert' THEN RETURN jsonb_build_object('success',true); END IF;
 IF p_action='suggestion_read' AND j.job_type='ai_re_extraction' THEN RETURN jsonb_build_object('success',true,'resultId',c.suggestion_result_id); END IF;
 IF p_action IN ('step_read','step_save') THEN
  IF j.job_type<>'post_approve_orchestration' OR p_data->>'step' NOT IN ('content_sync','ai_summary','intelligence','embedding','tag_suggestions','link_suggestions') THEN RAISE EXCEPTION 'Invalid job step' USING ERRCODE='22023'; END IF;
  IF p_action='step_save' THEN
   IF p_data->>'status' NOT IN ('completed','skipped') THEN RAISE EXCEPTION 'Only successful steps have receipts' USING ERRCODE='22023'; END IF;
   UPDATE erp_private.f07_job_claims SET step_receipts=jsonb_set(step_receipts,ARRAY[p_data->>'step'],jsonb_build_object('step',p_data->>'step','status',p_data->>'status')) WHERE job_id=j.id RETURNING * INTO c;
  END IF;
  RETURN jsonb_build_object('success',true,'step',c.step_receipts->(p_data->>'step'));
 END IF;
 IF p_action<>'settle' OR jsonb_typeof(p_data->'success') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Unknown worker action' USING ERRCODE='22023'; END IF;
 code:=CASE WHEN p_data->>'errorCode' IN ('provider_timeout','provider_rate_limit','provider_unavailable','network_error','database_error','stale_lock','unexpected','validation_error','provider_not_configured','handler_not_found','publication_rejected') THEN p_data->>'errorCode' ELSE 'unexpected' END;
 v_status:=CASE WHEN (p_data->>'success')::boolean THEN 'completed' WHEN coalesce((p_data->>'retryable')::boolean,false) AND j.attempt_count<j.max_attempts THEN 'retry_scheduled' ELSE 'failed' END;
 UPDATE public.dms_ai_job_attempts SET status=CASE WHEN v_status='completed' THEN 'completed' ELSE 'failed' END,completed_at=clock_timestamp(),duration_ms=least(2147483647,greatest(0,extract(epoch FROM clock_timestamp()-started_at)*1000))::int,error_code=CASE WHEN v_status='completed' THEN NULL ELSE code END,safe_error_message=CASE WHEN v_status='completed' THEN NULL ELSE 'AI job did not complete. Inspect the safe attempt code.' END WHERE job_id=j.id AND attempt_number=j.attempt_count AND status='running';
 UPDATE public.dms_ai_job_queue SET job_status=v_status,locked_by=NULL,locked_at=NULL,completed_at=CASE WHEN v_status='completed' THEN clock_timestamp() END,failed_at=CASE WHEN v_status='failed' THEN clock_timestamp() END,run_after=clock_timestamp()+make_interval(secs=>least(3600,30*power(2,j.attempt_count-1)::int)),last_error_code=CASE WHEN v_status='completed' THEN NULL ELSE code END,last_error_message=CASE WHEN v_status='completed' THEN NULL ELSE 'AI job did not complete. Inspect the safe attempt code.' END,updated_at=clock_timestamp() WHERE id=j.id;
 IF v_status='failed' THEN PERFORM erp_private.f07_job_failure_review(j.id,code); END IF;
 r:=jsonb_build_object('success',true,'jobId',j.id,'status',v_status,'attemptNumber',j.attempt_count);
 UPDATE erp_private.f07_job_claims SET settled_token=claim_token,token=NULL,expires_at=NULL,receipt=r WHERE job_id=j.id;
 RETURN r;
END $function$
;

-- Also protects older deployed notification workers during local-only rollout.
CREATE OR REPLACE FUNCTION erp_private.ai_mod04_notification_recipient(p_event bigint,p_profile bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM erp_private.notification_events e WHERE e.id=p_event AND
  (e.source_table<>'dms_document_events' OR e.event_type<>'approval_submitted' OR EXISTS(
   SELECT 1 FROM erp_private.ai_mod04_approval_assignments assignment JOIN public.dms_document_approvals a ON a.id=assignment.approval_id
   WHERE a.id=(e.source_snapshot->'metadata_json'->>'approval_id')::bigint AND a.document_id=(e.source_snapshot->>'document_id')::bigint AND a.is_current AND a.action='submitted'
    AND p_profile=ANY(assignment.profile_ids) AND p_profile<>assignment.original_submitter
    AND assignment.source_fingerprint=erp_private.f07_review_fingerprint(a.document_id) AND assignment.workflow_fingerprint=erp_private.f07_workflow_fingerprint(a.workflow_id,a.document_id)
    AND erp_private.ai_mod04_step_reviewer(p_profile,a.document_id,a.step_id)
    AND NOT EXISTS(SELECT 1 FROM public.dms_document_approvals vote WHERE vote.responds_to_approval_id=a.id AND vote.actioned_by=p_profile AND vote.action='approved')
  )));
$$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_notification_recipient(bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION "public"."f10_record_notification_recipient"("event_id" bigint, "lease" "uuid", "profile_id" bigint, "recipient_allowed" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE e erp_private.notification_events; r erp_private.notification_event_recipients; nid bigint; qid bigint;
 doc_id bigint; source_type text; source_id bigint; module text; path text; wants_email boolean:=false; email text;
 in_app boolean:=true; code text; reminder_source public.dms_notification_queue; settings public.dms_notification_settings;
BEGIN
 SELECT * INTO e FROM erp_private.notification_events WHERE id=$1 AND state='processing' AND lease_token=$2
 AND lease_expires_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lease unavailable' USING ERRCODE='PT409'; END IF;
 SELECT * INTO r FROM erp_private.notification_event_recipients planned WHERE planned.event_id=e.id AND planned.profile_id=$3 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recipient not planned' USING ERRCODE='22023'; END IF;
 IF r.state='created' THEN RETURN jsonb_build_object('state',r.state,'notificationId',r.notification_id,'emailQueueId',r.email_queue_id,'outcome',r.outcome); END IF;
 IF NOT erp_private.ai_mod04_notification_recipient(e.id,$3) THEN $4:=false; END IF;
 IF $4 IS DISTINCT FROM true OR NOT EXISTS(SELECT 1 FROM public.user_profiles p JOIN auth.users u ON u.id=p.auth_user_id
  WHERE p.id=$3 AND p.status='active' AND NOT p.must_change_password AND u.deleted_at IS NULL
   AND (u.banned_until IS NULL OR u.banned_until<=statement_timestamp())) THEN
  UPDATE erp_private.notification_event_recipients planned SET state='held',outcome='recipient_not_currently_authorized' WHERE planned.event_id=e.id AND planned.profile_id=$3;
  RETURN jsonb_build_object('state','held');
 END IF;
 IF e.source_table='dms_notification_queue' THEN
  SELECT * INTO reminder_source FROM public.dms_notification_queue WHERE id=e.source_id FOR UPDATE;
  SELECT * INTO settings FROM public.dms_notification_settings WHERE id=1;
  in_app:=coalesce((e.source_snapshot->>'channel_in_app')::boolean,false);
  wants_email:=coalesce((e.source_snapshot->>'channel_email')::boolean,false);
  IF reminder_source.id IS NULL OR reminder_source.recipient_user_id IS DISTINCT FROM $3
   OR reminder_source.document_id IS DISTINCT FROM (e.source_snapshot->>'document_id')::bigint
   OR reminder_source.status<>'pending' OR reminder_source.scheduled_for>statement_timestamp()
   OR NOT EXISTS(SELECT 1 FROM public.dms_expiry_reminders rem WHERE rem.id=reminder_source.reminder_id AND rem.document_id=reminder_source.document_id AND rem.status='pending' AND rem.reminder_date<=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date)
   OR NOT coalesce((e.source_snapshot->>'channels_resolved')::boolean,false)
   OR NOT (in_app OR wants_email) OR NOT coalesce(settings.is_enabled,false)
   OR (in_app AND NOT coalesce(settings.in_app_enabled,false)) OR (wants_email AND NOT coalesce(settings.email_enabled,false)) THEN
   UPDATE erp_private.notification_event_recipients planned SET state='held',outcome='reminder_source_or_channel_not_currently_eligible' WHERE planned.event_id=e.id AND planned.profile_id=$3;
   RETURN jsonb_build_object('state','held');
  END IF;
  IF wants_email AND NOT EXISTS(SELECT 1 FROM public.erp_email_feature_flags f WHERE f.feature_code='DMS_EXPIRY_EMAILS' AND f.is_enabled) THEN
   UPDATE erp_private.notification_event_recipients planned SET state='held',outcome='email_channel_withdrawn_after_capture' WHERE planned.event_id=e.id AND planned.profile_id=$3;
   RETURN jsonb_build_object('state','held');
  END IF;
  code:='DMS_BRIDGE_'||e.source_id;
  -- Never reinterpret or resend a legacy intent during cutover. Review its
  -- original channel/recipient receipts instead of manufacturing a new code.
  IF EXISTS(SELECT 1 FROM public.erp_notifications n WHERE n.notification_code=code) THEN
   UPDATE erp_private.notification_event_recipients planned SET state='held',outcome='legacy_notification_requires_reconciliation' WHERE planned.event_id=e.id AND planned.profile_id=$3;
   RETURN jsonb_build_object('state','held');
  END IF;
  doc_id:=reminder_source.document_id;source_type:='dms_documents';source_id:=doc_id;module:='DMS';path:='/dms/documents/record/'||doc_id;
 ELSIF e.source_table='dms_document_events' THEN
  doc_id:=(e.source_snapshot->>'document_id')::bigint;
  source_type:='dms_documents';source_id:=doc_id;module:='DMS';path:='/dms/documents/record/'||doc_id;
  wants_email:=e.event_type<>'approval_withdrawn';
 ELSIF e.source_table='dms_review_queue' THEN
  source_type:='dms_review_queue';source_id:=e.source_id;module:='DMS';
  doc_id:=(e.source_snapshot->>'document_id')::bigint;
  path:=CASE WHEN doc_id IS NOT NULL THEN '/dms/documents/record/'||doc_id ELSE '/dms/review-queue' END;
 ELSIF e.source_table='erp_report_template_events' THEN
  source_type:='erp_report_templates';source_id:=(e.source_snapshot->>'template_id')::bigint;module:='REPORTS';
  path:='/admin/reports/templates/governance?template_id='||source_id;
 ELSIF e.source_table IN ('employee_leave_requests','employee_attendance_corrections','employee_salary_revisions',
  'employee_payroll_holds','employee_approval_requests','employee_identity_documents','employee_medical_insurances',
  'hr_interviews','hr_offers','hr_onboarding_tasks','hr_candidates','employee_pro_processes','employee_assignments') THEN
  source_type:=e.source_table;source_id:=e.source_id;module:='HR';
  IF (e.source_snapshot->>'employee_id') IS NOT NULL THEN
   path:='/admin/hr/employees/record/'||(e.source_snapshot->>'employee_id');
  ELSIF (e.source_snapshot->>'candidate_id') IS NOT NULL THEN
   path:='/admin/hr/recruitment/candidates/record/'||(e.source_snapshot->>'candidate_id');
  ELSE RAISE EXCEPTION 'HR destination unresolved' USING ERRCODE='22023'; END IF;
 ELSE RAISE EXCEPTION 'Source adapter unavailable' USING ERRCODE='22023'; END IF;
 -- Never copy source titles, medical data, salary, reasons or raw metadata into
 -- previews. Current destination authorization remains mandatory.
 INSERT INTO public.erp_notifications(notification_code,source_module,source_entity_type,source_entity_id,notification_type,
  severity,title,message,recipient_user_id,channel_in_app,channel_email,action_url,action_label,metadata_json,created_by)
 VALUES(coalesce(code,'F10_EVENT_'||e.id||'_USER_'||$3),module,source_type,source_id,e.event_type,'info','ERP task updated',
  'A task may need your attention. Open the ERP to review its current state and permitted actions.',
  $3,in_app,wants_email,path,'Open task',jsonb_build_object('f10_event_id',e.id),e.actor_id) RETURNING id INTO nid;
 IF reminder_source.id IS NOT NULL THEN
  UPDATE public.dms_notification_queue SET global_notification_id=nid,bridge_status='bridged',bridged_at=statement_timestamp(),updated_at=statement_timestamp()
   WHERE id=reminder_source.id;
 END IF;
 IF wants_email THEN
  SELECT u.email INTO email FROM public.user_profiles p JOIN auth.users u ON u.id=p.auth_user_id
   WHERE p.id=$3 AND u.email_confirmed_at IS NOT NULL AND u.deleted_at IS NULL
    AND u.email IS NOT NULL AND length(btrim(u.email))>0
    AND (u.banned_until IS NULL OR u.banned_until<=statement_timestamp());
  -- Intent remains distinct from processing. Missing mailbox/configuration is
  -- recorded for review, not called sent or silently promoted to another user.
  IF email IS NOT NULL THEN
   INSERT INTO public.erp_email_queue(notification_id,source_module,source_entity_type,source_entity_id,to_emails,
    subject,text_body,created_by)
   VALUES(nid,'DMS','dms_documents',doc_id,ARRAY[email],'ALGT ERP notification',
    'Your ERP notifications are available. Sign in to ALGT ERP to review your notifications. Access to each record is checked in the application.',NULL)
   RETURNING id INTO qid;
   IF reminder_source.id IS NOT NULL THEN
    UPDATE public.dms_notification_queue SET global_email_queue_id=qid,bridge_status='email_queued',email_delivery_status='queued',updated_at=statement_timestamp() WHERE id=reminder_source.id;
   END IF;
  END IF;
 END IF;
 UPDATE erp_private.notification_event_recipients planned SET state='created',notification_id=nid,email_queue_id=qid,
  outcome=CASE WHEN wants_email AND qid IS NULL THEN CASE WHEN in_app THEN 'in_app_created_email_held_no_verified_mailbox' ELSE 'email_only_held_no_verified_mailbox' END
   WHEN qid IS NOT NULL THEN CASE WHEN in_app THEN 'in_app_created_email_queued_not_delivered' ELSE 'email_only_queued_not_delivered' END ELSE 'in_app_only' END
 WHERE planned.event_id=e.id AND planned.profile_id=$3;
 RETURN jsonb_build_object('state','created','notificationId',nid,'emailQueueId',qid,'outcome',
  CASE WHEN wants_email AND qid IS NULL THEN CASE WHEN in_app THEN 'in_app_created_email_held_no_verified_mailbox' ELSE 'email_only_held_no_verified_mailbox' END
   WHEN qid IS NOT NULL THEN CASE WHEN in_app THEN 'in_app_created_email_queued_not_delivered' ELSE 'email_only_queued_not_delivered' END ELSE 'in_app_only' END);
END $_$;
CREATE OR REPLACE FUNCTION "public"."f10_resume_notification_channel"("event_id" bigint, "lease" "uuid", "profile_id" bigint, "recipient_allowed" boolean) RETURNS "jsonb"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
    AS $_$
DECLARE e erp_private.notification_events;r erp_private.notification_event_recipients;n public.erp_notifications;mailbox text;qid bigint;doc bigint;
BEGIN
 SELECT * INTO e FROM erp_private.notification_events x WHERE x.id=$1 AND x.state='processing' AND x.lease_token=$2 AND x.lease_expires_at>statement_timestamp() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Lease unavailable' USING ERRCODE='PT409'; END IF;
 SELECT * INTO r FROM erp_private.notification_event_recipients x WHERE x.event_id=$1 AND x.profile_id=$3 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Recipient not planned' USING ERRCODE='22023'; END IF;
 IF r.state<>'created' OR r.outcome NOT IN ('in_app_created_email_held_no_verified_mailbox','email_only_held_no_verified_mailbox') OR r.email_queue_id IS NOT NULL THEN
  RETURN jsonb_build_object('state',r.state,'outcome',r.outcome);END IF;
 SELECT * INTO n FROM public.erp_notifications WHERE id=r.notification_id FOR UPDATE;
 IF NOT erp_private.ai_mod04_notification_recipient(e.id,$3) THEN $4:=false; END IF;
 IF $4 IS DISTINCT FROM true OR n.id IS NULL OR n.deleted_at IS NOT NULL OR n.recipient_user_id IS DISTINCT FROM $3 OR NOT n.channel_email
  OR n.source_entity_type<>'dms_documents' OR n.metadata_json->>'f10_event_id' IS DISTINCT FROM $1::text THEN
  RETURN jsonb_build_object('state','held','outcome','original_channel_not_currently_authorized');END IF;
 IF e.source_table NOT IN ('dms_document_events','dms_notification_queue') THEN RAISE EXCEPTION 'Unsupported email source' USING ERRCODE='22023';END IF;
 doc:=(e.source_snapshot->>'document_id')::bigint;
 IF n.source_entity_id IS DISTINCT FROM doc OR NOT public.f10_dms_notification_delivery_eligible(n.id)
  OR NOT EXISTS(SELECT 1 FROM public.dms_documents d WHERE d.id=doc AND d.deleted_at IS NULL AND NOT d.is_archived AND d.status NOT IN ('archived','superseded','deleted')) THEN
  RETURN jsonb_build_object('state','held','outcome','original_source_not_currently_eligible');END IF;
 -- A matching existing intent is reconciled, never requeued or altered.
 SELECT id INTO qid FROM public.erp_email_queue q WHERE q.notification_id=n.id;
 IF qid IS NOT NULL THEN RETURN jsonb_build_object('state','held','outcome','existing_email_requires_reconciliation');END IF;
 SELECT u.email INTO mailbox FROM public.user_profiles p JOIN auth.users u ON u.id=p.auth_user_id WHERE p.id=$3
  AND p.status='active' AND NOT p.must_change_password AND u.deleted_at IS NULL AND u.email_confirmed_at IS NOT NULL
  AND (u.banned_until IS NULL OR u.banned_until<=statement_timestamp()) AND nullif(btrim(u.email),'') IS NOT NULL;
 IF mailbox IS NULL THEN RETURN jsonb_build_object('state',r.state,'outcome',r.outcome);END IF;
 INSERT INTO public.erp_email_queue(notification_id,source_module,source_entity_type,source_entity_id,to_emails,subject,text_body,created_by)
 VALUES(n.id,'DMS','dms_documents',doc,ARRAY[mailbox],'ALGT ERP notification',
 'Your ERP notifications are available. Sign in to ALGT ERP to review your notifications. Access to each record is checked in the application.',NULL) RETURNING id INTO qid;
 UPDATE erp_private.notification_event_recipients x SET email_queue_id=qid,outcome=CASE WHEN n.channel_in_app THEN 'in_app_created_email_queued_not_delivered' ELSE 'email_only_queued_not_delivered' END WHERE x.event_id=$1 AND x.profile_id=$3;
 IF e.source_table='dms_notification_queue' THEN
  UPDATE public.dms_notification_queue SET global_email_queue_id=qid,bridge_status='email_queued',email_delivery_status='queued',updated_at=statement_timestamp()
   WHERE id=e.source_id AND global_notification_id=n.id AND global_email_queue_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Original reminder channel changed' USING ERRCODE='PT409';END IF;
 END IF;
 RETURN jsonb_build_object('state','created','outcome',CASE WHEN n.channel_in_app THEN 'in_app_created_email_queued_not_delivered' ELSE 'email_only_queued_not_delivered' END);
END $_$;
CREATE OR REPLACE FUNCTION public.f10_dms_notification_delivery_eligible(notification_id bigint)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 SELECT NOT EXISTS(SELECT 1 FROM public.erp_notifications notification WHERE notification.id=$1 AND notification.metadata_json->>'f10_event_id' ~ '^[1-9][0-9]*$' AND NOT erp_private.ai_mod04_notification_recipient((notification.metadata_json->>'f10_event_id')::bigint,notification.recipient_user_id)) AND NOT EXISTS(
  SELECT 1 FROM public.dms_notification_queue q
  LEFT JOIN public.dms_expiry_reminders r ON r.id=q.reminder_id AND r.document_id=q.document_id
  LEFT JOIN public.dms_documents d ON d.id=q.document_id
  WHERE q.global_notification_id=$1 AND (
   q.status NOT IN ('pending','read','dismissed') OR q.scheduled_for>statement_timestamp()
   OR (q.reminder_id IS NOT NULL AND (r.id IS NULL OR r.status<>'pending' OR r.reminder_date+r.reminder_days_before IS DISTINCT FROM d.expiry_date OR r.reminder_date>(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date))
   OR d.id IS NULL OR d.deleted_at IS NOT NULL OR d.is_archived OR d.status IN ('archived','superseded','deleted')
   OR d.expiry_tracking_override='ignored'
   OR (q.metadata_json->>'expiry_date' IS NOT NULL AND (q.metadata_json->>'expiry_date') IS DISTINCT FROM d.expiry_date::text)
  ));
$function$;

-- A bounded nomination proof; actual document/HR/sensitivity/session checks run again on submission and decision.
CREATE OR REPLACE FUNCTION erp_private.ai_mod04_workflow_nominee(p_profile bigint,p_company bigint,p_branch bigint,p_role text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.business_principal_is_active()
  AND (erp_private.permission_in_scope('dms.admin',p_company,p_branch) OR erp_private.permission_in_scope('dms.approvals.admin',p_company,p_branch))
  AND erp_private.ai_mod04_profile_grant(p_profile,'dms.documents.view',p_company,p_branch)
  AND erp_private.ai_mod04_profile_grant(p_profile,'dms.documents.preview',p_company,p_branch)
  AND erp_private.ai_mod04_profile_grant(p_profile,'notifications.view',p_company,p_branch)
  AND (erp_private.ai_mod04_profile_grant(p_profile,'dms.approvals.act',p_company,p_branch) OR erp_private.ai_mod04_profile_grant(p_profile,'dms.documents.approve',p_company,p_branch) OR erp_private.ai_mod04_profile_grant(p_profile,'dms.approvals.admin',p_company,p_branch) OR erp_private.ai_mod04_profile_grant(p_profile,'dms.admin',p_company,p_branch))
  AND (nullif(btrim(p_role),'') IS NULL OR EXISTS(SELECT 1 FROM public.user_roles u JOIN public.roles r ON r.id=u.role_id WHERE u.user_profile_id=p_profile AND u.is_active AND r.is_active AND r.role_code=p_role AND ((u.owner_company_id IS NULL AND u.branch_id IS NULL) OR (u.owner_company_id=p_company AND (u.branch_id IS NULL OR u.branch_id=p_branch)))));
$$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_workflow_nominee(bigint,bigint,bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_private.ai_mod04_workflow_nominee(bigint,bigint,bigint,text) TO authenticated;

-- Validate final rows at transaction completion, after the owning atomic intake writer.
CREATE OR REPLACE FUNCTION erp_private.ai_mod04_assert_review_complete(p_document bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE d public.dms_documents; p jsonb; code text;
BEGIN
 SELECT * INTO d FROM public.dms_documents WHERE id=p_document AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Final document unavailable' USING ERRCODE='PT409'; END IF;
 p:=erp_private.ai_mod04_profile(d.document_type_id,true);
 IF p IS NULL THEN RETURN; END IF;
 IF NOT erp_private.ai_mod04_profile_current(d.document_type_id) THEN RAISE EXCEPTION 'Processing rules require current approval' USING ERRCODE='55000'; END IF;
 FOR code IN SELECT value FROM jsonb_array_elements_text(p->'requiredFields') UNION SELECT field_code FROM public.dms_metadata_definitions WHERE document_type_id=d.document_type_id AND is_active AND deleted_at IS NULL AND is_required LOOP
  IF NOT EXISTS(SELECT 1 FROM public.dms_metadata_definitions m JOIN public.dms_document_metadata_values v ON v.definition_id=m.id AND v.document_id=d.id AND v.deleted_at IS NULL WHERE m.document_type_id=d.document_type_id AND m.is_active AND m.deleted_at IS NULL AND m.field_code=code AND nullif(btrim(coalesce(v.value_text,v.value_number::text,v.value_date::text,v.value_datetime::text,v.value_boolean::text,nullif(v.value_json,'null'::jsonb)::text)),'') IS NOT NULL) THEN RAISE EXCEPTION 'Complete required review field: %',code USING ERRCODE='22023'; END IF;
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_assert_review_complete(bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.ai_mod04_intake_final_review()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE doc bigint;
BEGIN
 SELECT document_id INTO doc FROM public.dms_upload_sessions WHERE id=NEW.id AND intake_status='approved';
 IF doc IS NOT NULL THEN PERFORM erp_private.ai_mod04_assert_review_complete(doc); END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION erp_private.ai_mod04_intake_final_review() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER ai_mod04_intake_final_review AFTER UPDATE ON public.dms_upload_sessions DEFERRABLE INITIALLY DEFERRED FOR EACH ROW WHEN(NEW.intake_status='approved' AND OLD.intake_status IS DISTINCT FROM 'approved') EXECUTE FUNCTION erp_private.ai_mod04_intake_final_review();

CREATE OR REPLACE FUNCTION public.ai_mod04_review_rules(p_type bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE p jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active() OR NOT(public.current_user_has_permission_any_scope('dms.documents.view') OR public.current_user_has_permission_any_scope('dms.admin')) OR NOT EXISTS(SELECT 1 FROM public.dms_document_types WHERE id=p_type AND is_active AND deleted_at IS NULL) THEN RAISE EXCEPTION 'Current review access required' USING ERRCODE='42501'; END IF;
 p:=erp_private.ai_mod04_profile(p_type,true);
 RETURN jsonb_build_object('requiredFields',coalesce(p->'requiredFields','[]'::jsonb),'ready',erp_private.ai_mod04_profile_current(p_type));
END $$;
REVOKE ALL ON FUNCTION public.ai_mod04_review_rules(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.ai_mod04_review_rules(bigint) TO authenticated;


-- BEGIN AI-MOD-04 scoped approval definitions
CREATE OR REPLACE FUNCTION public.f05_save_dms_workflow(p_id bigint, p_expected_updated_at timestamp with time zone, p_input jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE
  v_id bigint; v_actor bigint; v_old public.dms_document_workflows;
  v_step jsonb; v_steps jsonb; v_code text; v_type bigint;
  v_step_count integer; v_initial integer; v_final integer;
BEGIN
  IF auth.uid() IS NULL OR NOT erp_private.business_principal_is_active()
     OR NOT (public.current_user_is_global_admin()
       OR erp_private.permission_in_scope('dms.admin',coalesce((p_input->>'owner_company_id')::bigint,(SELECT owner_company_id FROM public.dms_document_workflows WHERE id=p_id)),coalesce((p_input->>'branch_id')::bigint,(SELECT branch_id FROM public.dms_document_workflows WHERE id=p_id)))
       OR erp_private.permission_in_scope('dms.approvals.admin',coalesce((p_input->>'owner_company_id')::bigint,(SELECT owner_company_id FROM public.dms_document_workflows WHERE id=p_id)),coalesce((p_input->>'branch_id')::bigint,(SELECT branch_id FROM public.dms_document_workflows WHERE id=p_id)))) THEN
    RAISE EXCEPTION 'Permission denied' USING ERRCODE = '42501';
  END IF;
  v_actor := public.current_user_profile_id();
  IF jsonb_typeof(p_input) IS DISTINCT FROM 'object' OR octet_length(p_input::text) > 100000 THEN
    RAISE EXCEPTION 'Invalid workflow input' USING ERRCODE = '22023';
  END IF;
  IF p_id IS NOT NULL THEN
    SELECT * INTO v_old FROM public.dms_document_workflows WHERE id = p_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Workflow unavailable' USING ERRCODE = 'P0002'; END IF;
    IF p_expected_updated_at IS NULL OR v_old.updated_at IS DISTINCT FROM p_expected_updated_at THEN
      RAISE EXCEPTION 'Workflow changed; refresh before saving' USING ERRCODE = 'PT409';
    END IF;
    -- A pending approval may still rely on the current definition. Do not
    -- silently change its route/role/step mapping while it is being reviewed.
    IF p_input ?| ARRAY['steps','document_type_ids','is_active','owner_company_id','branch_id'] AND EXISTS (
      SELECT 1 FROM public.dms_document_approvals WHERE workflow_id=p_id AND is_current
    ) THEN RAISE EXCEPTION 'Workflow is in use by a pending approval' USING ERRCODE='55000'; END IF;
    v_id := p_id;
  END IF;
  IF (p_input ? 'name_en' OR p_id IS NULL) AND (length(btrim(p_input->>'name_en')) NOT BETWEEN 1 AND 200 OR p_input->>'name_en' IS NULL) THEN
    RAISE EXCEPTION 'Workflow name is required' USING ERRCODE='22023';
  END IF;
  IF p_id IS NULL AND (p_input->>'workflow_code' IS NULL OR p_input->>'workflow_code' !~ '^[A-Z0-9_]{1,100}$') THEN
    RAISE EXCEPTION 'Invalid workflow code' USING ERRCODE='22023';
  END IF;
  IF length(coalesce(p_input->>'name_ar','')) > 200 OR length(coalesce(p_input->>'description','')) > 1000 THEN
    RAISE EXCEPTION 'Workflow text is too long' USING ERRCODE='22023';
  END IF;
  IF p_input ? 'steps' OR p_id IS NULL THEN
    v_steps := p_input->'steps';
    IF jsonb_typeof(v_steps) IS DISTINCT FROM 'array' OR jsonb_array_length(v_steps) NOT BETWEEN 1 AND 50 THEN
      RAISE EXCEPTION 'Provide between one and fifty active steps' USING ERRCODE='22023';
    END IF;
    SELECT count(*),count(*) FILTER(WHERE (s->>'is_initial')::boolean),count(*) FILTER(WHERE (s->>'is_final')::boolean)
      INTO v_step_count,v_initial,v_final FROM jsonb_array_elements(v_steps) s;
    IF v_initial<>1 OR v_final<>1 OR NOT coalesce((v_steps->0->>'is_initial')::boolean,false)
      OR NOT coalesce((v_steps->(v_step_count-1)->>'is_final')::boolean,false) THEN
      RAISE EXCEPTION 'First step must be initial and last step must be final' USING ERRCODE='22023';
    END IF;
    IF (SELECT count(DISTINCT lower(btrim(s->>'step_code'))) FROM jsonb_array_elements(v_steps) s) <> v_step_count THEN
      RAISE EXCEPTION 'Step codes must be unique' USING ERRCODE='23505';
    END IF;
    FOR v_step IN SELECT value FROM jsonb_array_elements(v_steps) LOOP
      IF v_step->>'step_code' IS NULL OR length(btrim(v_step->>'step_code')) NOT BETWEEN 1 AND 100
        OR v_step->>'step_name' IS NULL OR length(btrim(v_step->>'step_name')) NOT BETWEEN 1 AND 200
        OR length(coalesce(v_step->>'requires_role',''))>100 THEN
        RAISE EXCEPTION 'Invalid approval step' USING ERRCODE='22023';
      END IF;
      IF nullif(btrim(v_step->>'requires_role'),'') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.roles WHERE role_code=btrim(v_step->>'requires_role') AND is_active
      ) THEN RAISE EXCEPTION 'Required role is unavailable' USING ERRCODE='22023'; END IF;
    END LOOP;
  END IF;
  IF p_input ? 'document_type_ids' THEN
    IF jsonb_typeof(p_input->'document_type_ids') IS DISTINCT FROM 'array' OR jsonb_array_length(p_input->'document_type_ids')>200 THEN
      RAISE EXCEPTION 'Invalid document type selection' USING ERRCODE='22023';
    END IF;
    -- The type lock serializes concurrent assignments through this endpoint.
    FOR v_type IN SELECT DISTINCT value::text::bigint FROM jsonb_array_elements(p_input->'document_type_ids') ORDER BY 1 LOOP
      PERFORM id FROM public.dms_document_types WHERE id=v_type AND deleted_at IS NULL AND is_active FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Document type is unavailable' USING ERRCODE='22023'; END IF;
      IF EXISTS(SELECT 1 FROM public.dms_workflow_document_types m JOIN public.dms_document_workflows w ON w.id=m.workflow_id
        WHERE m.document_type_id=v_type AND w.id IS DISTINCT FROM p_id AND w.is_active AND w.deleted_at IS NULL AND w.owner_company_id=coalesce((p_input->>'owner_company_id')::bigint,v_old.owner_company_id) AND (w.branch_id IS NULL OR (CASE WHEN p_input?'branch_id' THEN (p_input->>'branch_id')::bigint ELSE v_old.branch_id END) IS NULL OR w.branch_id=(CASE WHEN p_input?'branch_id' THEN (p_input->>'branch_id')::bigint ELSE v_old.branch_id END)))
        AND coalesce((p_input->>'is_active')::boolean,v_old.is_active,true) THEN
        RAISE EXCEPTION 'Document type already has an active workflow' USING ERRCODE='23505';
      END IF;
    END LOOP;
  ELSIF p_id IS NOT NULL AND coalesce((p_input->>'is_active')::boolean,false) THEN
    FOR v_type IN SELECT document_type_id FROM public.dms_workflow_document_types WHERE workflow_id=p_id ORDER BY document_type_id LOOP
      PERFORM id FROM public.dms_document_types WHERE id=v_type FOR UPDATE;
      IF EXISTS(SELECT 1 FROM public.dms_workflow_document_types m JOIN public.dms_document_workflows w ON w.id=m.workflow_id
        WHERE m.document_type_id=v_type AND w.id<>p_id AND w.is_active AND w.deleted_at IS NULL AND w.owner_company_id=coalesce((p_input->>'owner_company_id')::bigint,v_old.owner_company_id) AND (w.branch_id IS NULL OR (CASE WHEN p_input?'branch_id' THEN (p_input->>'branch_id')::bigint ELSE v_old.branch_id END) IS NULL OR w.branch_id=(CASE WHEN p_input?'branch_id' THEN (p_input->>'branch_id')::bigint ELSE v_old.branch_id END))) THEN
        RAISE EXCEPTION 'Document type already has an active workflow' USING ERRCODE='23505';
      END IF;
    END LOOP;
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.dms_document_workflows(workflow_code,name_en,name_ar,description,is_active,created_by,updated_by,owner_company_id,branch_id)
    VALUES(p_input->>'workflow_code',btrim(p_input->>'name_en'),nullif(p_input->>'name_ar',''),nullif(p_input->>'description',''),coalesce((p_input->>'is_active')::boolean,false),v_actor,v_actor,(p_input->>'owner_company_id')::bigint,(p_input->>'branch_id')::bigint)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.dms_document_workflows SET
      owner_company_id=CASE WHEN p_input?'owner_company_id' THEN (p_input->>'owner_company_id')::bigint ELSE owner_company_id END,branch_id=CASE WHEN p_input?'branch_id' THEN (p_input->>'branch_id')::bigint ELSE branch_id END,
      name_en=CASE WHEN p_input?'name_en' THEN btrim(p_input->>'name_en') ELSE name_en END,
      name_ar=CASE WHEN p_input?'name_ar' THEN nullif(p_input->>'name_ar','') ELSE name_ar END,
      description=CASE WHEN p_input?'description' THEN nullif(p_input->>'description','') ELSE description END,
      is_active=coalesce((p_input->>'is_active')::boolean,is_active),updated_by=v_actor,updated_at=clock_timestamp()
    WHERE id=v_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'Workflow unavailable' USING ERRCODE='42501'; END IF;
  END IF;
  IF p_input ? 'document_type_ids' THEN
    DELETE FROM public.dms_workflow_document_types WHERE workflow_id=v_id;
    INSERT INTO public.dms_workflow_document_types(workflow_id,document_type_id)
      SELECT v_id,value::text::bigint FROM jsonb_array_elements(p_input->'document_type_ids');
  END IF;
  IF v_steps IS NOT NULL THEN
    UPDATE public.dms_document_workflow_steps SET is_active=false WHERE workflow_id=v_id;
    FOR v_step IN SELECT value FROM jsonb_array_elements(v_steps) LOOP
      v_code:=btrim(v_step->>'step_code');
      INSERT INTO public.dms_document_workflow_steps(workflow_id,step_code,step_name,is_initial,is_final,requires_role,sort_order,is_active)
      VALUES(v_id,v_code,btrim(v_step->>'step_name'),(v_step->>'is_initial')::boolean,(v_step->>'is_final')::boolean,
        nullif(btrim(v_step->>'requires_role'),''),(SELECT ordinality-1 FROM jsonb_array_elements(v_steps) WITH ORDINALITY s WHERE s.value=v_step),true)
      ON CONFLICT(workflow_id,step_code) DO UPDATE SET step_name=excluded.step_name,is_initial=excluded.is_initial,
        is_final=excluded.is_final,requires_role=excluded.requires_role,sort_order=excluded.sort_order,is_active=true;
    END LOOP;
  END IF;
  
  PERFORM t.id FROM public.dms_document_types t JOIN public.dms_workflow_document_types m ON m.document_type_id=t.id WHERE m.workflow_id=v_id ORDER BY t.id FOR UPDATE OF t;
  IF EXISTS(SELECT 1 FROM public.dms_document_workflows current_route JOIN public.dms_workflow_document_types current_type ON current_type.workflow_id=current_route.id JOIN public.dms_workflow_document_types other_type ON other_type.document_type_id=current_type.document_type_id JOIN public.dms_document_workflows other_route ON other_route.id=other_type.workflow_id WHERE current_route.id=v_id AND current_route.is_active AND other_route.id<>v_id AND other_route.is_active AND other_route.deleted_at IS NULL AND other_route.owner_company_id=current_route.owner_company_id AND (other_route.branch_id IS NULL OR current_route.branch_id IS NULL OR other_route.branch_id=current_route.branch_id)) THEN RAISE EXCEPTION 'Overlapping company/type/branch workflows' USING ERRCODE='23505'; END IF;
  IF v_steps IS NOT NULL THEN
   FOR v_step IN SELECT value FROM jsonb_array_elements(v_steps) LOOP
    IF v_step ? 'decision_rule' AND (jsonb_typeof(v_step->'decision_rule') IS DISTINCT FROM 'string' OR v_step->>'decision_rule' NOT IN ('one_assigned','all_assigned')) THEN RAISE EXCEPTION 'Invalid explicit approver configuration' USING ERRCODE='22023'; END IF;
    IF v_step ? 'assignee_profile_ids' THEN
     IF jsonb_typeof(v_step->'assignee_profile_ids') IS DISTINCT FROM 'array' THEN RAISE EXCEPTION 'Invalid explicit approver configuration' USING ERRCODE='22023'; END IF;
     IF jsonb_array_length(v_step->'assignee_profile_ids')>50 THEN RAISE EXCEPTION 'Invalid explicit approver configuration' USING ERRCODE='22023'; END IF;
    END IF;
    -- Older forms do not know these fields. Omission preserves an existing
    -- reviewed assignment/rule; an explicit empty selection is still empty
    -- and must pass the same final active-route validation below.
    UPDATE public.dms_document_workflow_steps SET
     decision_rule=CASE WHEN v_step ? 'decision_rule' THEN v_step->>'decision_rule' ELSE decision_rule END,
     assignee_profile_ids=CASE WHEN v_step ? 'assignee_profile_ids' THEN ARRAY(SELECT value::text::bigint FROM jsonb_array_elements(v_step->'assignee_profile_ids') ORDER BY value::text::bigint) ELSE assignee_profile_ids END
     WHERE workflow_id=v_id AND step_code=btrim(v_step->>'step_code');
   END LOOP;
  END IF;
  IF EXISTS(SELECT 1 FROM public.dms_document_workflows w JOIN public.dms_document_workflow_steps step ON step.workflow_id=w.id WHERE w.id=v_id AND w.is_active AND step.is_active AND (cardinality(step.assignee_profile_ids)<>(SELECT count(DISTINCT x) FROM unnest(step.assignee_profile_ids)x) OR array_position(step.assignee_profile_ids,NULL) IS NOT NULL OR EXISTS(SELECT 1 FROM unnest(step.assignee_profile_ids)person WHERE NOT erp_private.ai_mod04_workflow_nominee(person,w.owner_company_id,w.branch_id,step.requires_role)))) THEN RAISE EXCEPTION 'Active routes require currently eligible named reviewers in their exact scope' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM public.dms_document_workflows w WHERE w.id=v_id AND w.is_active) AND (EXISTS(SELECT 1 FROM public.dms_document_workflows w WHERE w.id=v_id AND w.owner_company_id IS NULL) OR NOT EXISTS(SELECT 1 FROM public.dms_workflow_document_types WHERE workflow_id=v_id) OR EXISTS(SELECT 1 FROM public.dms_document_workflow_steps WHERE workflow_id=v_id AND is_active AND cardinality(assignee_profile_ids)=0)) THEN RAISE EXCEPTION 'Active workflows require a company, document types and explicit assignees for every step' USING ERRCODE='22023'; END IF;
RETURN jsonb_build_object('id',v_id);
END $function$
;
CREATE OR REPLACE FUNCTION erp_private.f05_transition_approval(document_id bigint, approval_id bigint, operation text, comment_text text, reason_text text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE d public.dms_documents; a public.dms_document_approvals; s public.dms_document_workflow_steps;
 next_step public.dms_document_workflow_steps; wf public.dms_document_workflows;
 actor bigint; next_id bigint; candidates integer; now_at timestamptz:=clock_timestamp(); state text; event text;
BEGIN
 IF auth.uid() IS NULL OR NOT erp_private.document_permission($1,'dms.documents.view') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF $3 IS NULL OR $3 NOT IN ('submit','approve','reject','withdraw') OR length(coalesce($4,''))>2000 OR length(coalesce($5,''))>2000 THEN RAISE EXCEPTION 'Invalid action' USING ERRCODE='22023'; END IF;
 actor:=public.current_user_profile_id();
 SELECT * INTO d FROM public.dms_documents WHERE id=$1 AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR (d.is_archived OR d.status IN ('archived','superseded','deleted')) THEN RAISE EXCEPTION 'Document unavailable' USING ERRCODE='42501'; END IF;
 PERFORM erp_private.ai_mod04_lock_profile_authority(actor);
 IF NOT erp_private.ai_mod04_subjects_allowed($1) OR NOT erp_private.document_permission($1,'dms.documents.view') THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
 IF $3<>'withdraw' AND d.current_version_id IS NOT NULL AND NOT erp_private.document_permission(d.id,'dms.documents.preview') THEN
  RAISE EXCEPTION 'Reviewed original requires scoped preview permission' USING ERRCODE='42501';END IF;
 IF $3='submit' THEN
  IF NOT (erp_private.document_permission($1,'dms.approvals.submit') OR erp_private.document_permission($1,'dms.documents.edit') OR erp_private.document_permission($1,'dms.admin')) THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
  IF coalesce(d.approval_status,'draft') NOT IN ('draft','rejected','withdrawn') OR EXISTS(SELECT 1 FROM public.dms_document_approvals approval WHERE approval.document_id=$1 AND approval.is_current) THEN RAISE EXCEPTION 'Approval state changed; refresh' USING ERRCODE='PT409'; END IF;
  IF d.document_type_id IS NOT NULL THEN
   SELECT count(*) INTO candidates FROM public.dms_workflow_document_types m JOIN public.dms_document_workflows w ON w.id=m.workflow_id WHERE m.document_type_id=d.document_type_id AND w.is_active AND w.deleted_at IS NULL AND w.owner_company_id=d.owning_company_id AND (w.branch_id IS NULL OR w.branch_id=d.owning_branch_id);
   IF candidates>1 THEN RAISE EXCEPTION 'Document type has conflicting workflows' USING ERRCODE='55000'; END IF;
   IF candidates=1 THEN
    SELECT w.* INTO wf FROM public.dms_document_workflows w JOIN public.dms_workflow_document_types m ON m.workflow_id=w.id WHERE m.document_type_id=d.document_type_id AND w.is_active AND w.deleted_at IS NULL AND w.owner_company_id=d.owning_company_id AND (w.branch_id IS NULL OR w.branch_id=d.owning_branch_id) FOR SHARE OF w;
    SELECT * INTO s FROM public.dms_document_workflow_steps WHERE workflow_id=wf.id AND is_active ORDER BY sort_order,id LIMIT 1;
    IF s.id IS NULL OR NOT s.is_initial OR (SELECT count(*) FROM public.dms_document_workflow_steps WHERE workflow_id=wf.id AND is_active AND is_initial)<>1
      OR (SELECT count(*) FROM public.dms_document_workflow_steps WHERE workflow_id=wf.id AND is_active AND is_final)<>1
      OR NOT (SELECT is_final FROM public.dms_document_workflow_steps WHERE workflow_id=wf.id AND is_active ORDER BY sort_order DESC,id DESC LIMIT 1) THEN RAISE EXCEPTION 'Workflow needs valid initial and final steps' USING ERRCODE='55000'; END IF;
   END IF;
  END IF;
  INSERT INTO public.dms_document_approvals(document_id,workflow_id,step_id,action,submitted_by,submitted_at,actioned_by,actioned_at,comments,is_current,updated_by)
   VALUES(d.id,wf.id,s.id,'submitted',actor,now_at,actor,now_at,nullif($4,''),true,actor) RETURNING id INTO next_id;
  state:='pending_approval'; event:='approval_submitted';
  UPDATE public.dms_documents SET approval_status=state,status='pending_review',submitted_by=actor,submitted_at=now_at,updated_by=actor,updated_at=now_at WHERE id=d.id;
 ELSE
  SELECT * INTO a FROM public.dms_document_approvals approval WHERE approval.id=$2 AND approval.document_id=d.id AND approval.is_current AND approval.action='submitted' FOR UPDATE;
  IF NOT FOUND OR d.approval_status IS DISTINCT FROM 'pending_approval' THEN RAISE EXCEPTION 'Approval state changed; refresh' USING ERRCODE='PT409'; END IF;
  IF $3<>'withdraw' AND (a.reviewed_fingerprint IS NULL OR a.reviewed_fingerprint IS DISTINCT FROM erp_private.f07_review_fingerprint(d.id) OR a.workflow_fingerprint IS DISTINCT FROM erp_private.f07_workflow_fingerprint(a.workflow_id,d.id)) THEN RAISE EXCEPTION 'Reviewed content or workflow changed; withdraw and resubmit' USING ERRCODE='PT409';END IF;
  IF $3='withdraw' THEN
   IF d.submitted_by IS DISTINCT FROM actor AND NOT (erp_private.document_permission($1,'dms.approvals.withdraw') OR erp_private.document_permission($1,'dms.admin')) THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501'; END IF;
  ELSIF NOT erp_private.f05_approval_actor(d.id,a.step_id) THEN RAISE EXCEPTION 'Not eligible for this approval step' USING ERRCODE='42501'; END IF;
  IF $3='reject' AND length(btrim(coalesce($5,'')))<5 THEN RAISE EXCEPTION 'A rejection reason is required' USING ERRCODE='22023'; END IF;
  IF a.workflow_id IS NULL AND $3<>'withdraw' AND EXISTS(SELECT 1 FROM public.dms_workflow_document_types m JOIN public.dms_document_workflows w ON w.id=m.workflow_id WHERE m.document_type_id=d.document_type_id AND w.is_active AND w.deleted_at IS NULL AND w.owner_company_id=d.owning_company_id AND (w.branch_id IS NULL OR w.branch_id=d.owning_branch_id)) THEN
   RAISE EXCEPTION 'Legacy request has no workflow; withdraw and resubmit' USING ERRCODE='55000';
  END IF;
  IF a.workflow_id IS NOT NULL THEN
   SELECT * INTO wf FROM public.dms_document_workflows WHERE id=a.workflow_id AND is_active AND deleted_at IS NULL FOR SHARE;
   SELECT * INTO s FROM public.dms_document_workflow_steps WHERE id=a.step_id AND workflow_id=a.workflow_id AND is_active;
   IF (wf.id IS NULL OR s.id IS NULL) AND $3<>'withdraw' THEN RAISE EXCEPTION 'Workflow unavailable; request withdrawal or administrator review' USING ERRCODE='55000'; END IF;
  END IF;
  state:=CASE $3 WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'withdrawn' END;
  IF $3='approve' AND a.workflow_id IS NOT NULL AND NOT s.is_final THEN
   SELECT * INTO next_step FROM public.dms_document_workflow_steps WHERE workflow_id=a.workflow_id AND is_active AND (sort_order,id)>(s.sort_order,s.id) ORDER BY sort_order,id LIMIT 1;
   IF next_step.id IS NULL THEN RAISE EXCEPTION 'Workflow has no next step' USING ERRCODE='55000'; END IF;
   state:='pending_approval';
  END IF;

  IF $3='approve' AND EXISTS(SELECT 1 FROM erp_private.ai_mod04_approval_assignments x WHERE x.approval_id=a.id AND x.decision_rule='all_assigned' AND EXISTS(SELECT 1 FROM unnest(x.profile_ids) person WHERE person<>actor AND NOT EXISTS(SELECT 1 FROM public.dms_document_approvals vote WHERE vote.responds_to_approval_id=a.id AND vote.action='approved' AND vote.actioned_by=person))) THEN
   INSERT INTO public.dms_document_approvals(document_id,workflow_id,step_id,action,submitted_by,submitted_at,actioned_by,actioned_at,comments,is_current,updated_by,responds_to_approval_id) VALUES(d.id,a.workflow_id,a.step_id,'approved',a.submitted_by,a.submitted_at,actor,now_at,nullif($4,''),false,actor,a.id) RETURNING id INTO next_id;
   INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json) VALUES(d.id,'approval_vote_recorded','Independent approval recorded; other assigned decisions remain pending.',actor,jsonb_build_object('approval_id',a.id,'decision_id',next_id));
   RETURN jsonb_build_object('approvalId',a.id,'approvalStatus','pending_approval','pending',true,'requiresRole',s.requires_role);
  END IF;
  UPDATE public.dms_document_approvals SET is_current=false,updated_by=actor,updated_at=now_at WHERE id=a.id;
  INSERT INTO public.dms_document_approvals(document_id,workflow_id,step_id,action,submitted_by,submitted_at,actioned_by,actioned_at,comments,reason,is_current,updated_by,responds_to_approval_id)
   VALUES(d.id,a.workflow_id,a.step_id,CASE $3 WHEN 'approve' THEN 'approved' WHEN 'reject' THEN 'rejected' ELSE 'withdrawn' END,a.submitted_by,a.submitted_at,actor,now_at,nullif($4,''),nullif($5,''),false,actor,a.id) RETURNING id INTO next_id;
  IF next_step.id IS NOT NULL THEN
   INSERT INTO public.dms_document_approvals(document_id,workflow_id,step_id,action,submitted_by,submitted_at,actioned_by,actioned_at,is_current,updated_by)
    VALUES(d.id,a.workflow_id,next_step.id,'submitted',a.submitted_by,a.submitted_at,actor,now_at,true,actor) RETURNING id INTO next_id;
  END IF;
  UPDATE public.dms_documents SET approval_status=state,status=CASE state WHEN 'pending_approval' THEN 'pending_review' WHEN 'withdrawn' THEN 'draft' ELSE state END,updated_by=actor,updated_at=now_at WHERE id=d.id;
  event:=CASE $3 WHEN 'approve' THEN 'approval_approved' WHEN 'reject' THEN 'approval_rejected' ELSE 'approval_withdrawn' END;
 END IF;
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json)
 VALUES(d.id,event,CASE WHEN state='pending_approval' AND $3='approve' THEN 'Approval step completed; awaiting the next step' ELSE 'Document approval '||$3 END,actor,
  jsonb_build_object('approval_id',next_id,'previous_approval_id',a.id,'workflow_id',coalesce(a.workflow_id,wf.id),'step_id',coalesce(next_step.id,s.id),'approval_status',state));
 RETURN jsonb_build_object('approvalId',next_id,'approvalStatus',state,'pending',state='pending_approval','requiresRole',coalesce(next_step.requires_role,s.requires_role));
END $function$
;
-- END AI-MOD-04 scoped approval definitions
COMMIT;
