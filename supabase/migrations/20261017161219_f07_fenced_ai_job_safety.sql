-- F07 T07. Extend the existing DMS queue; do not activate or replay workers.
BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';
CREATE TABLE erp_private.f07_job_claims (
 job_id bigint PRIMARY KEY REFERENCES public.dms_ai_job_queue(id) ON DELETE CASCADE,
 source_hash text NOT NULL, actor_claims jsonb NOT NULL, content_hash text,
 step_receipts jsonb NOT NULL DEFAULT '{}',
 token uuid, expires_at timestamptz, settled_token uuid, receipt jsonb,
 suggestion_result_id bigint REFERENCES public.dms_ai_extraction_results(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE erp_private.f07_job_claims ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.f07_job_claims FROM PUBLIC,anon,authenticated,service_role;

-- Deliberately excludes derived OCR/content fields: the worker may update
-- them, but never rebind its input version, ownership, classification or bytes.
CREATE FUNCTION erp_private.f07_job_source(p_document bigint) RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT encode(extensions.digest(jsonb_build_object('document',
  (SELECT jsonb_build_array(d.id,d.current_version_id,d.document_type_id,d.owning_company_id,d.owning_branch_id,d.confidentiality_level,d.status,d.approval_status,d.deleted_at,d.is_archived,d.title,d.description,d.issue_date,d.expiry_date,d.document_no) FROM public.dms_documents d WHERE d.id=p_document),
  'files',(SELECT jsonb_agg(to_jsonb(f)-ARRAY['ocr_text','ocr_status','ocr_provider','ocr_model','ocr_completed_at','ocr_error_message','updated_at'] ORDER BY f.id) FROM public.dms_document_files f WHERE f.document_id=p_document AND f.deleted_at IS NULL),
  'metadata',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.id) FROM public.dms_document_metadata_values m WHERE m.document_id=p_document AND m.deleted_at IS NULL),
  'definitions',(SELECT jsonb_agg(to_jsonb(def) ORDER BY def.id) FROM public.dms_metadata_definitions def JOIN public.dms_documents d ON d.document_type_id=def.document_type_id WHERE d.id=p_document AND def.is_active AND def.deleted_at IS NULL),
  'links',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.dms_document_links l WHERE l.document_id=p_document AND l.deleted_at IS NULL))::text,'sha256'),'hex')
$$;

CREATE FUNCTION erp_private.f07_job_authority(p_document bigint,p_claims jsonb) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE old_claims text:=current_setting('request.jwt.claims',true); allowed boolean;
BEGIN
 PERFORM set_config('request.jwt.claims',p_claims::text,true);
 allowed:=erp_private.business_principal_is_active() AND erp_private.document_permission(p_document,'dms.documents.view')
  AND (erp_private.document_permission(p_document,'dms.documents.edit') OR erp_private.document_permission(p_document,'dms.admin'));
 PERFORM set_config('request.jwt.claims',coalesce(old_claims,''),true);
 IF NOT coalesce(allowed,false) THEN RAISE EXCEPTION 'AI job document authority unavailable' USING ERRCODE='42501'; END IF;
END $$;

CREATE FUNCTION erp_private.f07_assert_job(p_job bigint,p_token uuid,p_source boolean DEFAULT true) RETURNS public.dms_ai_job_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.dms_ai_job_queue; c erp_private.f07_job_claims;
BEGIN
 -- One canonical lock order: queue, claim, document. Never hold across AI calls.
 SELECT * INTO j FROM public.dms_ai_job_queue WHERE id=p_job FOR UPDATE;
 SELECT * INTO c FROM erp_private.f07_job_claims WHERE job_id=p_job FOR UPDATE;
 IF j.id IS NULL OR c.job_id IS NULL OR j.job_status<>'running' OR c.token IS DISTINCT FROM p_token OR p_token IS NULL OR c.expires_at IS NULL OR c.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'AI job claim is no longer current' USING ERRCODE='PT409'; END IF;
 IF p_source THEN
  PERFORM id FROM public.dms_documents WHERE id=j.related_document_id FOR UPDATE;
  PERFORM erp_private.f07_job_authority(j.related_document_id,c.actor_claims);
  IF erp_private.f07_job_source(j.related_document_id) IS DISTINCT FROM c.source_hash THEN RAISE EXCEPTION 'AI job source changed; review or enqueue a new operation' USING ERRCODE='PT409'; END IF;
  IF j.job_type IN ('ai_re_extraction','semantic_document_index') AND c.content_hash IS DISTINCT FROM
   (SELECT encode(extensions.digest(coalesce(content_text,''),'sha256'),'hex') FROM public.dms_document_content WHERE document_id=j.related_document_id) THEN RAISE EXCEPTION 'AI input text changed' USING ERRCODE='PT409'; END IF;
 END IF;
 RETURN j;
END $$;

CREATE FUNCTION erp_private.f07_job_failure_review(p_job bigint,p_code text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.dms_ai_job_queue;
BEGIN
 SELECT * INTO STRICT j FROM public.dms_ai_job_queue WHERE id=p_job;
 INSERT INTO public.dms_review_queue(idempotency_key,review_type,source_type,source_id,document_id,ai_job_id,reason_code,reason_message,priority,status,payload_json)
 SELECT 'f07_ai_job:'||j.id,'ai_job_failure_review','ai_job',j.id::text,j.related_document_id,j.id,p_code,'AI job stopped. Review the source, permissions and attempt history before a new operation.','normal','open',jsonb_build_object('job_id',j.id,'attempt_count',j.attempt_count)
 WHERE NOT EXISTS(SELECT 1 FROM public.dms_review_queue WHERE ai_job_id=j.id AND review_type='ai_job_failure_review' AND deleted_at IS NULL);
END $$;

CREATE FUNCTION erp_private.f07_ai_job_control(p_action text,p_data jsonb,p_actor_claims jsonb DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.dms_ai_job_queue; c erp_private.f07_job_claims; actor bigint; claims jsonb; d public.dms_documents;
 typ text; payload jsonb; key text; doc bigint; attempts int; result jsonb; session_id bigint; run_id bigint; ai_id bigint;
BEGIN
 IF p_actor_claims IS NOT NULL AND auth.jwt()->>'role' IS DISTINCT FROM 'service_role' THEN RAISE EXCEPTION 'Delegated job claims are internal only' USING ERRCODE='42501'; END IF;
 claims:=coalesce(p_actor_claims,auth.jwt());
 SELECT id INTO actor FROM public.user_profiles WHERE auth_user_id=(claims->>'sub')::uuid;
 IF actor IS NULL THEN RAISE EXCEPTION 'AI job caller unavailable' USING ERRCODE='42501'; END IF;
 IF p_action='enqueue' THEN
  typ:=p_data->>'jobType'; payload:=p_data->'payload'; key:=p_data->>'idempotencyKey'; doc:=(p_data->>'relatedDocumentId')::bigint;
  IF typ NOT IN ('post_approve_orchestration','ocr_backfill','semantic_document_index','generate_metadata_definition_suggestions','ai_re_extraction') OR typ IS NULL OR
   jsonb_typeof(payload) IS DISTINCT FROM 'object' OR octet_length(payload::text)>2048 OR doc IS NULL OR key IS NULL OR length(key) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Invalid AI job input' USING ERRCODE='22023'; END IF;
  PERFORM erp_private.f07_job_authority(doc,claims);
  SELECT * INTO d FROM public.dms_documents WHERE id=doc FOR SHARE;
  IF d.deleted_at IS NOT NULL OR d.is_archived OR d.status IN ('archived','deleted','superseded') THEN RAISE EXCEPTION 'AI job source unavailable' USING ERRCODE='PT409'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('documentId','fileId','documentTypeId','triggerDocumentId','sessionCode','uploadSessionId','approveRunId','source','forceRetry','forceRebuild')) THEN RAISE EXCEPTION 'Only IDs and control flags are allowed' USING ERRCODE='22023'; END IF;
  IF EXISTS(SELECT 1 FROM jsonb_each(payload) e WHERE
    (e.key IN ('documentId','fileId','documentTypeId','triggerDocumentId','uploadSessionId','approveRunId') AND (jsonb_typeof(e.value)<>'number' OR e.value::text !~ '^[1-9][0-9]*$')) OR
    (e.key IN ('forceRetry','forceRebuild') AND jsonb_typeof(e.value)<>'boolean') OR
    (e.key='sessionCode' AND (jsonb_typeof(e.value)<>'string' OR (payload->>'sessionCode') !~ '^[A-Za-z0-9_-]{1,128}$')) OR
    (e.key='source' AND jsonb_typeof(e.value)<>'string')) THEN RAISE EXCEPTION 'Invalid AI job control value' USING ERRCODE='22023'; END IF;
  IF (CASE typ
   WHEN 'ai_re_extraction' THEN coalesce(payload->>'source' NOT IN ('metadata_suggestions_approved','admin_manual_retry'),true) OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('documentId','source'))
   WHEN 'ocr_backfill' THEN coalesce(payload->>'source' NOT IN ('admin_backfill','manual_admin_retry'),true) OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('documentId','fileId','source','forceRetry'))
   WHEN 'semantic_document_index' THEN coalesce(payload->>'source' NOT IN ('post_approve_orchestration','admin_backfill','manual_rebuild','content_sync_trigger'),true) OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('documentId','source','forceRebuild'))
   WHEN 'generate_metadata_definition_suggestions' THEN coalesce(payload->>'source' NOT IN ('post_approve','admin_manual'),true) OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('documentTypeId','triggerDocumentId','source'))
   ELSE coalesce(payload->>'source' NOT IN ('single_file_approve','batch_finalize'),true) OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('sessionCode','documentId','uploadSessionId','approveRunId','source')) END) THEN RAISE EXCEPTION 'Invalid job-specific controls' USING ERRCODE='22023'; END IF;
  IF (typ='generate_metadata_definition_suggestions' AND ((payload->>'triggerDocumentId')::bigint IS DISTINCT FROM doc OR (payload->>'documentTypeId')::bigint IS DISTINCT FROM d.document_type_id)) OR
   (typ<>'generate_metadata_definition_suggestions' AND (payload->>'documentId')::bigint IS DISTINCT FROM doc) THEN RAISE EXCEPTION 'AI job source identity mismatch' USING ERRCODE='22023'; END IF;
  IF typ='ocr_backfill' AND NOT EXISTS(SELECT 1 FROM public.dms_document_files f WHERE f.id=(payload->>'fileId')::bigint AND f.document_id=doc AND f.version_id IS NOT DISTINCT FROM d.current_version_id AND f.deleted_at IS NULL) THEN RAISE EXCEPTION 'OCR file is not a current document source' USING ERRCODE='22023'; END IF;
  session_id:=(p_data->>'relatedUploadSessionId')::bigint;run_id:=(p_data->>'relatedApproveRunId')::bigint;ai_id:=(p_data->>'relatedAiResultId')::bigint;
  IF typ='post_approve_orchestration' AND (session_id IS DISTINCT FROM (payload->>'uploadSessionId')::bigint OR run_id IS DISTINCT FROM (payload->>'approveRunId')::bigint OR session_id IS NULL OR run_id IS NULL OR
   NOT EXISTS(SELECT 1 FROM public.dms_upload_sessions s WHERE s.id=session_id AND s.session_code=payload->>'sessionCode' AND s.deleted_at IS NULL) OR
   NOT EXISTS(SELECT 1 FROM public.dms_approve_runs r WHERE r.id=run_id AND r.upload_session_id=session_id AND r.document_id=doc)) THEN RAISE EXCEPTION 'Approval job identity mismatch' USING ERRCODE='22023'; END IF;
  IF typ<>'post_approve_orchestration' AND (session_id IS NOT NULL OR run_id IS NOT NULL) THEN RAISE EXCEPTION 'Unexpected AI job relation' USING ERRCODE='22023'; END IF;
  IF ai_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dms_ai_extraction_results WHERE id=ai_id AND document_id=doc) THEN RAISE EXCEPTION 'AI result identity mismatch' USING ERRCODE='22023'; END IF;
  attempts:=CASE typ WHEN 'generate_metadata_definition_suggestions' THEN 2 ELSE 3 END;
  IF p_data ? 'maxAttempts' THEN attempts:=least(attempts,(p_data->>'maxAttempts')::int); END IF;
  IF attempts<1 OR coalesce((p_data->>'priority')::int,100) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Invalid AI job limits' USING ERRCODE='22023'; END IF;
  -- Serialize admission even when there is no row yet. A terminal receipt is
  -- still the same operation, never implicitly a new provider invocation.
  PERFORM pg_advisory_xact_lock(hashtextextended('f07-ai-key:'||key,0));
  SELECT * INTO j FROM public.dms_ai_job_queue WHERE idempotency_key=key FOR UPDATE;
  IF FOUND THEN
   SELECT * INTO c FROM erp_private.f07_job_claims WHERE job_id=j.id;
   IF c.job_id IS NULL OR j.created_by IS DISTINCT FROM actor OR j.job_type<>typ OR j.payload_json<>payload OR j.related_document_id IS DISTINCT FROM doc OR
    j.related_upload_session_id IS DISTINCT FROM session_id OR j.related_approve_run_id IS DISTINCT FROM run_id OR j.related_ai_result_id IS DISTINCT FROM ai_id OR j.max_attempts<>attempts OR
    c.source_hash IS DISTINCT FROM erp_private.f07_job_source(doc) THEN RAISE EXCEPTION 'AI operation identity conflict; use a new reviewed operation' USING ERRCODE='PT409'; END IF;
   RETURN jsonb_build_object('success',true,'jobId',j.id,'skipped',true);
  END IF;
  INSERT INTO public.dms_ai_job_queue(job_type,payload_json,idempotency_key,related_document_id,related_upload_session_id,related_approve_run_id,related_ai_result_id,max_attempts,priority,run_after,created_by)
   VALUES(typ,payload,key,doc,session_id,run_id,ai_id,attempts,coalesce((p_data->>'priority')::int,100),coalesce((p_data->>'runAfter')::timestamptz,clock_timestamp()),actor) RETURNING * INTO j;
  INSERT INTO erp_private.f07_job_claims(job_id,source_hash,actor_claims,content_hash) VALUES(j.id,erp_private.f07_job_source(doc),claims,
   (SELECT encode(extensions.digest(coalesce(content_text,''),'sha256'),'hex') FROM public.dms_document_content WHERE document_id=doc));
  RETURN jsonb_build_object('success',true,'jobId',j.id,'skipped',false);
 END IF;
 SELECT * INTO j FROM public.dms_ai_job_queue WHERE id=(p_data->>'jobId')::bigint FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Job unavailable' USING ERRCODE='42501'; END IF;
 PERFORM erp_private.f07_job_authority(j.related_document_id,claims);
 IF p_action='cancel' AND j.job_status IN ('queued','running','retry_scheduled') THEN
  UPDATE public.dms_ai_job_attempts SET status='failed',completed_at=clock_timestamp(),error_code='cancelled',safe_error_message='Cancelled by an authorized user.' WHERE job_id=j.id AND status='running';
  UPDATE public.dms_ai_job_queue SET job_status='cancelled',locked_at=NULL,locked_by=NULL,updated_at=clock_timestamp() WHERE id=j.id;
  UPDATE erp_private.f07_job_claims SET token=NULL,expires_at=NULL WHERE job_id=j.id;
 ELSIF p_action='retry' AND j.job_status IN ('failed','cancelled') AND j.attempt_count<j.max_attempts THEN
  SELECT * INTO c FROM erp_private.f07_job_claims WHERE job_id=j.id;
  IF c.job_id IS NULL OR c.source_hash IS DISTINCT FROM erp_private.f07_job_source(j.related_document_id) THEN RAISE EXCEPTION 'Job source changed; create a new reviewed operation' USING ERRCODE='PT409'; END IF;
  UPDATE public.dms_ai_job_queue SET job_status='queued',run_after=clock_timestamp(),failed_at=NULL,locked_at=NULL,locked_by=NULL,updated_at=clock_timestamp() WHERE id=j.id;
  UPDATE erp_private.f07_job_claims SET actor_claims=claims,token=NULL,expires_at=NULL WHERE job_id=j.id;
 ELSE RAISE EXCEPTION 'Job transition unavailable or attempt budget exhausted' USING ERRCODE='PT409'; END IF;
 INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values) VALUES(actor,'DMS','dms_ai_job_queue',j.id,'ai_job_'||p_action,jsonb_build_object('jobId',j.id));
 RETURN jsonb_build_object('success',true,'jobId',j.id);
END $$;

CREATE FUNCTION public.f07_ai_job_control(p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_ai_job_control(p_action,p_data) $$;

CREATE FUNCTION erp_private.f07_ai_worker(p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
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
  FOR j IN SELECT q.* FROM public.dms_ai_job_queue q JOIN erp_private.f07_job_claims proof ON proof.job_id=q.id WHERE q.job_status IN ('queued','retry_scheduled') AND q.attempt_count<q.max_attempts AND q.run_after<=clock_timestamp() ORDER BY q.priority,q.created_at,q.id FOR UPDATE OF q SKIP LOCKED LIMIT n LOOP
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
END $$;
CREATE FUNCTION public.f07_ai_worker(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_ai_worker(p_action,p_data) $$;

-- Trigger fence checks the same transaction as the actual publication. It
-- therefore cannot be raced by reclaim/cancel while the write is committing.
CREATE FUNCTION erp_private.f07_job_output_guard() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE headers jsonb:=nullif(current_setting('request.headers',true),'')::jsonb;j public.dms_ai_job_queue;rowdata jsonb;delta jsonb;k text;doc bigint;
BEGIN
 IF headers->>'x-algt-ai-job' IS NULL AND headers->>'x-algt-ai-claim' IS NULL THEN IF TG_LEVEL='STATEMENT' THEN RETURN NULL;END IF;IF TG_OP='DELETE' THEN RETURN OLD; END IF;RETURN NEW;END IF;
 j:=erp_private.f07_assert_job((headers->>'x-algt-ai-job')::bigint,(headers->>'x-algt-ai-claim')::uuid);
 IF TG_LEVEL='STATEMENT' THEN RETURN NULL; END IF;
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'AI jobs cannot delete records' USING ERRCODE='42501'; END IF;
 rowdata:=to_jsonb(NEW);delta:=rowdata;
 IF TG_OP='UPDATE' THEN SELECT coalesce(jsonb_object_agg(e.key,e.value),'{}') INTO delta FROM jsonb_each(rowdata) e WHERE e.value IS DISTINCT FROM to_jsonb(OLD)->e.key; END IF;
 IF TG_TABLE_NAME='dms_documents' THEN
  IF TG_OP<>'UPDATE' OR NEW.id<>j.related_document_id OR EXISTS(SELECT 1 FROM jsonb_object_keys(delta) x WHERE x NOT IN ('updated_at','ocr_status','ocr_text_available','ocr_last_run_at','ai_summary','ai_summary_status','ai_summary_updated_at','ai_summary_model','ai_summary_error','ai_summary_input_char_count','ai_summary_input_truncated','completeness_score','missing_fields_json','ai_risk_score','ai_risk_level','ai_risk_reasons_json','ai_risk_updated_at','summary_embedding','summary_embedding_model','summary_embedding_status','summary_embedding_updated_at','summary_embedding_source','summary_embedding_error')) THEN RAISE EXCEPTION 'AI cannot change document authority' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='dms_upload_sessions' THEN
  IF TG_OP<>'UPDATE' OR NEW.id IS DISTINCT FROM j.related_upload_session_id OR EXISTS(SELECT 1 FROM jsonb_object_keys(delta) x WHERE x NOT IN ('updated_at','orchestration_status','orchestration_steps_json','orchestration_started_at','orchestration_completed_at')) THEN RAISE EXCEPTION 'AI cannot change intake authority' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='dms_document_types' THEN
  IF TG_OP<>'UPDATE' OR NEW.id<>(SELECT document_type_id FROM public.dms_documents WHERE id=j.related_document_id) OR EXISTS(SELECT 1 FROM jsonb_object_keys(delta) x WHERE x NOT IN ('updated_at','ai_suggestions_generated_at')) THEN RAISE EXCEPTION 'AI cannot change type definitions' USING ERRCODE='42501'; END IF;
 ELSIF TG_TABLE_NAME='erp_ai_usage_logs' THEN
  IF TG_OP<>'INSERT' THEN RAISE EXCEPTION 'AI usage logs are append-only' USING ERRCODE='42501'; END IF;
 ELSE
  doc:=(rowdata->>'document_id')::bigint;
  IF doc IS DISTINCT FROM j.related_document_id THEN RAISE EXCEPTION 'AI job publication document mismatch' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='dms_document_files' AND (TG_OP<>'UPDATE' OR EXISTS(SELECT 1 FROM jsonb_object_keys(delta) x WHERE x NOT IN ('updated_at','ocr_status','ocr_text','ocr_provider','ocr_model','ocr_completed_at','ocr_error_message'))) THEN RAISE EXCEPTION 'AI cannot replace file bytes' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME='dms_review_queue' AND (TG_OP<>'INSERT' OR rowdata->>'status'<>'open' OR rowdata->>'review_type' NOT IN ('metadata_definition_suggestions_review','ai_job_failure_review','semantic_index_review')) THEN RAISE EXCEPTION 'AI cannot resolve human review' USING ERRCODE='42501'; END IF;
  IF TG_TABLE_NAME IN ('dms_ai_tag_suggestions','dms_ai_link_suggestions') AND (rowdata->>'status' NOT IN ('pending','suggested','superseded') OR (TG_OP='UPDATE' AND EXISTS(SELECT 1 FROM jsonb_object_keys(delta) x WHERE x NOT IN ('status','updated_at')))) THEN RAISE EXCEPTION 'AI cannot accept suggestions' USING ERRCODE='42501'; END IF;
 END IF;
 -- Preserve useful diagnostics without persisting raw provider messages.
 FOREACH k IN ARRAY ARRAY['ai_summary_error','summary_embedding_error','ocr_error_message','embedding_error_message'] LOOP
  IF delta ? k AND rowdata->k<>'null'::jsonb THEN NEW:=jsonb_populate_record(NEW,jsonb_build_object(k,'AI job step did not complete. Consult the safe attempt code.')); END IF;
 END LOOP;
 IF TG_OP='INSERT' AND rowdata ? 'created_by' THEN NEW:=jsonb_populate_record(NEW,jsonb_build_object('created_by',j.created_by)); END IF;
 RETURN NEW;
END $$;
DO $$ DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['dms_documents','dms_document_files','dms_document_content','dms_document_content_chunks','dms_ai_tag_suggestions','dms_ai_link_suggestions','dms_upload_sessions','dms_document_types','dms_review_queue','erp_ai_usage_logs'] LOOP
  EXECUTE format('CREATE TRIGGER f07_job_output_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH ROW EXECUTE FUNCTION erp_private.f07_job_output_guard()',t);
  EXECUTE format('CREATE TRIGGER f07_job_statement_guard BEFORE INSERT OR UPDATE OR DELETE ON public.%I FOR EACH STATEMENT EXECUTE FUNCTION erp_private.f07_job_output_guard()',t);
 END LOOP;
END $$;

CREATE FUNCTION erp_private.f07_ai_metadata_suggestions(p_job bigint,p_token uuid,p_fields jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.dms_ai_job_queue;c erp_private.f07_job_claims;extraction bigint;result_id bigint;item record;
BEGIN
 j:=erp_private.f07_assert_job(p_job,p_token);
 IF j.job_type<>'ai_re_extraction' OR jsonb_typeof(p_fields) IS DISTINCT FROM 'object' OR octet_length(p_fields::text)>65536 THEN RAISE EXCEPTION 'Invalid metadata suggestion publication' USING ERRCODE='22023'; END IF;
 SELECT * INTO c FROM erp_private.f07_job_claims WHERE job_id=j.id;
 IF c.suggestion_result_id IS NOT NULL THEN RETURN jsonb_build_object('success',true,'resultId',c.suggestion_result_id,'replayed',true); END IF;
 FOR item IN SELECT * FROM jsonb_each(p_fields) LOOP
  IF NOT EXISTS(SELECT 1 FROM public.dms_metadata_definitions def JOIN public.dms_documents d ON d.document_type_id=def.document_type_id WHERE d.id=j.related_document_id AND def.field_code=item.key AND def.is_active AND def.deleted_at IS NULL AND def.is_ai_extractable) OR jsonb_typeof(item.value) NOT IN ('string','number','boolean') THEN RAISE EXCEPTION 'Unknown or invalid suggested field' USING ERRCODE='22023'; END IF;
 END LOOP;
 INSERT INTO public.dms_ai_extraction_jobs(document_id,job_type,status,input_text_hash,created_by,completed_at) VALUES(j.related_document_id,'extraction','completed',c.source_hash,j.created_by,clock_timestamp()) RETURNING id INTO extraction;
 INSERT INTO public.dms_ai_extraction_results(document_id,job_id,extracted_fields_json,ai_status) VALUES(j.related_document_id,extraction,p_fields,'pending_review') RETURNING id INTO result_id;
 UPDATE erp_private.f07_job_claims SET suggestion_result_id=result_id WHERE job_id=j.id;
 INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by) VALUES(j.related_document_id,'ai_metadata_suggestions_ready','AI suggestions require human selection and confirmation.',j.created_by);
 RETURN jsonb_build_object('success',true,'resultId',result_id,'replayed',false);
END $$;
CREATE FUNCTION public.f07_ai_metadata_suggestions(p_job bigint,p_token uuid,p_fields jsonb) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.f07_ai_metadata_suggestions(p_job,p_token,p_fields) $$;

-- Disable unfenced entry points, including old deployed worker binaries.
CREATE OR REPLACE FUNCTION public.claim_dms_ai_jobs(p_worker_id text,p_limit int DEFAULT 5) RETURNS SETOF public.dms_ai_job_queue LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Use the fenced F07 worker' USING ERRCODE='42501'; END $$;
CREATE OR REPLACE FUNCTION public.complete_dms_ai_job(p_job_id bigint) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'A current claim is required' USING ERRCODE='42501'; END $$;
CREATE OR REPLACE FUNCTION public.fail_dms_ai_job(p_job_id bigint,p_error_code text,p_error_message text,p_retry boolean DEFAULT true) RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'A current claim is required' USING ERRCODE='42501'; END $$;
CREATE OR REPLACE FUNCTION public.recover_stale_dms_ai_jobs(p_stale_after_minutes int DEFAULT 10) RETURNS int LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$ BEGIN RAISE EXCEPTION 'Use the bounded F07 recovery operation' USING ERRCODE='42501'; END $$;
REVOKE INSERT,UPDATE,DELETE ON public.dms_ai_job_queue,public.dms_ai_job_attempts FROM anon,authenticated,service_role;
REVOKE ALL ON FUNCTION erp_private.f07_job_source(bigint),erp_private.f07_job_authority(bigint,jsonb),erp_private.f07_assert_job(bigint,uuid,boolean),erp_private.f07_job_failure_review(bigint,text),erp_private.f07_job_output_guard(),erp_private.f07_ai_job_control(text,jsonb,jsonb),public.f07_ai_job_control(text,jsonb),erp_private.f07_ai_worker(text,jsonb),public.f07_ai_worker(text,jsonb),erp_private.f07_ai_metadata_suggestions(bigint,uuid,jsonb),public.f07_ai_metadata_suggestions(bigint,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f07_ai_job_control(text,jsonb,jsonb),public.f07_ai_job_control(text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION erp_private.f07_ai_worker(text,jsonb),public.f07_ai_worker(text,jsonb),erp_private.f07_ai_metadata_suggestions(bigint,uuid,jsonb),public.f07_ai_metadata_suggestions(bigint,uuid,jsonb) TO service_role;
COMMIT;
