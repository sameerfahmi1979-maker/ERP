-- Bind semantic job authority to the reviewed source that admitted the work.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

ALTER TABLE erp_private.f07_job_claims
 ADD COLUMN semantic_admission text,
 ADD COLUMN semantic_parent_job_id bigint,
 ADD CONSTRAINT f07_semantic_admission_shape CHECK (
  (semantic_admission IS NULL AND semantic_parent_job_id IS NULL)
  OR (semantic_admission IS NOT NULL AND (
   (semantic_admission='manual' AND semantic_parent_job_id IS NULL)
   OR (semantic_admission IN ('post_approve','reviewed_content_sync') AND semantic_parent_job_id IS NOT NULL)
   OR semantic_admission='manual_retry'
  )));

CREATE FUNCTION erp_private.dms_semantic_queue_is_enabled() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT count(*)=2 FROM public.erp_ai_feature_flags
 WHERE feature_code IN ('DMS_AI_JOB_QUEUE','DMS_SEMANTIC_INDEX_QUEUE') AND is_enabled;
$$;

CREATE FUNCTION erp_private.dms_semantic_job_authority(
 p_document bigint,p_source text,p_admission text,p_parent_job bigint,p_claims jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE previous_claims text:=current_setting('request.jwt.claims',true); allowed boolean;
BEGIN
 PERFORM set_config('request.jwt.claims',p_claims::text,true);
 allowed:=erp_private.business_principal_is_active()
  AND erp_private.document_permission(p_document,'dms.documents.view')
  AND CASE
   WHEN p_admission='manual_retry'
     AND (p_source IN ('manual_rebuild','admin_backfill')
          OR (p_source IN ('post_approve_orchestration','content_sync_trigger') AND p_parent_job IS NOT NULL))
    THEN erp_private.document_permission(p_document,'dms.admin')
     AND (p_source<>'admin_backfill' OR public.current_user_is_global_admin()
      OR public.current_user_has_permission_globally('dms.admin'))
   WHEN (p_admission='manual' OR p_admission IS NULL) AND p_source='manual_rebuild'
    THEN erp_private.document_permission(p_document,'dms.admin')
   WHEN (p_admission='manual' OR p_admission IS NULL) AND p_source='admin_backfill'
    THEN erp_private.document_permission(p_document,'dms.admin')
     AND (public.current_user_is_global_admin() OR public.current_user_has_permission_globally('dms.admin'))
   WHEN p_admission='post_approve' AND p_source='post_approve_orchestration' AND p_parent_job IS NOT NULL
    THEN erp_private.document_permission(p_document,'dms.documents.edit')
     OR erp_private.document_permission(p_document,'dms.admin')
   WHEN p_admission='reviewed_content_sync' AND p_source='content_sync_trigger' AND p_parent_job IS NOT NULL
    THEN erp_private.ai_mod04_subjects_allowed(p_document)
     AND erp_private.document_permission(p_document,'dms.documents.preview')
     AND (erp_private.document_permission(p_document,'dms.documents.review_ai')
      OR erp_private.document_permission(p_document,'dms.admin'))
     AND (erp_private.document_permission(p_document,'dms.documents.edit')
      OR erp_private.document_permission(p_document,'dms.admin'))
   ELSE false
  END;
 PERFORM set_config('request.jwt.claims',coalesce(previous_claims,''),true);
 IF NOT coalesce(allowed,false) THEN
  RAISE EXCEPTION 'Semantic job source authority unavailable' USING ERRCODE='42501';
 END IF;
END $$;

-- The caller owns the document lock. Hold current text stable through
-- admission, retry, or worker assertion.
CREATE FUNCTION erp_private.dms_semantic_job_content_hash(p_document bigint) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT encode(extensions.digest(coalesce(content_text,''),'sha256'),'hex')
 FROM public.dms_document_content WHERE document_id=p_document FOR SHARE;
$$;

CREATE FUNCTION erp_private.dms_semantic_job_enqueue(
 p_data jsonb,p_claims jsonb,p_admission text,p_parent_job bigint
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 j public.dms_ai_job_queue; c erp_private.f07_job_claims; d public.dms_documents;
 payload jsonb:=p_data->'payload'; source text:=payload->>'source';
 key text:=p_data->>'idempotencyKey'; doc bigint:=(p_data->>'relatedDocumentId')::bigint;
 actor bigint; ai_id bigint:=(p_data->>'relatedAiResultId')::bigint; legacy_job bigint;
 attempts int:=least(3,coalesce((p_data->>'maxAttempts')::int,3));
 priority int:=coalesce((p_data->>'priority')::int,100);
 admission text:=coalesce(p_admission,'manual'); bound_content_hash text; bound_source_hash text;
BEGIN
 IF p_data->>'jobType' IS DISTINCT FROM 'semantic_document_index'
  OR jsonb_typeof(payload) IS DISTINCT FROM 'object' OR octet_length(payload::text)>2048
  OR doc IS NULL OR key IS NULL OR length(key) NOT BETWEEN 1 AND 200
  OR key LIKE 'semantic_document_index:v2:%'
  OR attempts<1 OR priority NOT BETWEEN 1 AND 1000
  OR (p_data->>'relatedUploadSessionId') IS NOT NULL OR (p_data->>'relatedApproveRunId') IS NOT NULL
  OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('documentId','source','forceRebuild'))
  OR jsonb_typeof(payload->'documentId') IS DISTINCT FROM 'number'
  OR coalesce(payload->>'documentId','') !~ '^[1-9][0-9]*$'
  OR (payload->>'documentId')::bigint IS DISTINCT FROM doc
  OR (payload ? 'forceRebuild' AND jsonb_typeof(payload->'forceRebuild') IS DISTINCT FROM 'boolean')
  OR coalesce(source,'') NOT IN ('post_approve_orchestration','admin_backfill','manual_rebuild','content_sync_trigger')
  OR (p_admission IS NOT NULL AND payload->'forceRebuild'='true'::jsonb) THEN
  RAISE EXCEPTION 'Invalid semantic job input' USING ERRCODE='22023';
 END IF;
 SELECT id INTO actor FROM public.user_profiles WHERE auth_user_id=(p_claims->>'sub')::uuid;
 IF actor IS NULL THEN RAISE EXCEPTION 'Semantic job caller unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO d FROM public.dms_documents WHERE id=doc FOR SHARE;
 PERFORM erp_private.dms_semantic_job_authority(doc,source,admission,p_parent_job,p_claims);
 IF d.id IS NULL OR d.deleted_at IS NOT NULL OR d.is_archived OR d.status IN ('archived','deleted','superseded') THEN
  RAISE EXCEPTION 'Semantic job source unavailable' USING ERRCODE='PT409';
 END IF;
 IF NOT erp_private.dms_semantic_queue_is_enabled() THEN
  RAISE EXCEPTION 'Semantic job admission disabled' USING ERRCODE='55000';
 END IF;
 IF ai_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.dms_ai_extraction_results
  WHERE id=ai_id AND document_id=doc) THEN
  RAISE EXCEPTION 'AI result identity mismatch' USING ERRCODE='22023';
 END IF;
 bound_content_hash:=erp_private.dms_semantic_job_content_hash(doc);
 bound_source_hash:=erp_private.f07_job_source(doc);

 -- The application historically uses one key per document for all sources.
 -- Retain an exact legacy manual receipt and bind new work to its full source.
 IF key='semantic_document_index:doc:'||doc THEN
  payload:=payload||jsonb_build_object('forceRebuild',coalesce(payload->'forceRebuild','false'::jsonb));
  IF admission='manual' THEN
   SELECT q.id INTO legacy_job
   FROM public.dms_ai_job_queue q JOIN erp_private.f07_job_claims proof ON proof.job_id=q.id
   WHERE q.idempotency_key=key AND q.job_type='semantic_document_index' AND q.related_document_id=doc
    AND q.created_by=actor AND q.related_ai_result_id IS NOT DISTINCT FROM ai_id AND q.max_attempts=attempts
    AND q.related_upload_session_id IS NULL AND q.related_approve_run_id IS NULL
    AND (q.payload_json||jsonb_build_object('forceRebuild',coalesce(q.payload_json->'forceRebuild','false'::jsonb)))=payload
    AND proof.source_hash=bound_source_hash AND proof.content_hash IS NOT DISTINCT FROM bound_content_hash
    AND proof.semantic_parent_job_id IS NULL;
   IF legacy_job IS NOT NULL THEN
    RETURN jsonb_build_object('success',true,'jobId',legacy_job,'skipped',true);
   END IF;
  END IF;
  key:='semantic_document_index:v2:'||encode(sha256(convert_to(jsonb_build_array(
   key,doc,bound_source_hash,bound_content_hash,actor,admission,p_parent_job,payload,ai_id,attempts)::text,'UTF8')),'hex');
 END IF;

 -- Producers can already hold document/content locks. A replay only reads
 -- immutable queue identity and cannot wait for a worker holding that queue
 -- row. A contested advisory key fails quickly so it cannot invert lock order.
 IF NOT pg_try_advisory_xact_lock(hashtextextended('f07-ai-key:'||key,0)) THEN
  RAISE EXCEPTION 'Semantic job admission is busy' USING ERRCODE='55P03';
 END IF;
 SELECT * INTO j FROM public.dms_ai_job_queue WHERE idempotency_key=key;
 IF FOUND THEN
  SELECT * INTO c FROM erp_private.f07_job_claims WHERE job_id=j.id;
  IF c.job_id IS NULL OR j.created_by IS DISTINCT FROM actor OR j.job_type<>'semantic_document_index'
   OR j.payload_json IS DISTINCT FROM payload OR j.related_document_id IS DISTINCT FROM doc
   OR j.related_upload_session_id IS NOT NULL OR j.related_approve_run_id IS NOT NULL
   OR j.related_ai_result_id IS DISTINCT FROM ai_id OR j.max_attempts<>attempts
   OR c.source_hash IS DISTINCT FROM bound_source_hash OR c.content_hash IS DISTINCT FROM bound_content_hash
   OR c.semantic_parent_job_id IS DISTINCT FROM p_parent_job THEN
   RAISE EXCEPTION 'Semantic operation identity conflict; use a new reviewed operation' USING ERRCODE='PT409';
  END IF;
  RETURN jsonb_build_object('success',true,'jobId',j.id,'skipped',true);
 END IF;
 INSERT INTO public.dms_ai_job_queue(
  job_type,payload_json,idempotency_key,related_document_id,related_ai_result_id,max_attempts,priority,run_after,created_by
 ) VALUES('semantic_document_index',payload,key,doc,ai_id,attempts,priority,
  coalesce((p_data->>'runAfter')::timestamptz,clock_timestamp()),actor) RETURNING * INTO j;
 INSERT INTO erp_private.f07_job_claims(job_id,source_hash,actor_claims,content_hash,semantic_admission,semantic_parent_job_id)
 VALUES(j.id,bound_source_hash,p_claims,bound_content_hash,admission,p_parent_job);
 RETURN jsonb_build_object('success',true,'jobId',j.id,'skipped',false);
END $$;

CREATE OR REPLACE FUNCTION erp_private.f07_assert_job(p_job bigint,p_token uuid,p_source boolean DEFAULT true)
RETURNS public.dms_ai_job_queue
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE j public.dms_ai_job_queue; c erp_private.f07_job_claims; d public.dms_documents;
BEGIN
 -- Queue, claim, document, then source content. The transaction ends before provider work.
 SELECT * INTO j FROM public.dms_ai_job_queue WHERE id=p_job FOR UPDATE;
 SELECT * INTO c FROM erp_private.f07_job_claims WHERE job_id=p_job FOR UPDATE;
 IF j.id IS NULL OR c.job_id IS NULL OR j.job_status<>'running' OR c.token IS DISTINCT FROM p_token
  OR p_token IS NULL OR c.expires_at IS NULL OR c.expires_at<=clock_timestamp() THEN
  RAISE EXCEPTION 'AI job claim is no longer current' USING ERRCODE='PT409';
 END IF;
 IF p_source THEN
  SELECT * INTO d FROM public.dms_documents WHERE id=j.related_document_id FOR UPDATE;
  IF j.job_type='semantic_document_index' THEN
   PERFORM erp_private.dms_semantic_job_authority(j.related_document_id,j.payload_json->>'source',
    c.semantic_admission,c.semantic_parent_job_id,c.actor_claims);
   IF NOT erp_private.dms_semantic_queue_is_enabled() THEN
    RAISE EXCEPTION 'Semantic job processing disabled' USING ERRCODE='55000';
   END IF;
   IF d.id IS NULL OR d.deleted_at IS NOT NULL OR d.is_archived OR d.status IN ('archived','deleted','superseded') THEN
    RAISE EXCEPTION 'Semantic job source changed' USING ERRCODE='PT409';
   END IF;
  ELSE
   PERFORM erp_private.f07_job_authority(j.related_document_id,c.actor_claims);
  END IF;
  IF erp_private.f07_job_source(j.related_document_id) IS DISTINCT FROM c.source_hash THEN
   RAISE EXCEPTION 'AI job source changed; review or enqueue a new operation' USING ERRCODE='PT409';
  END IF;
  IF (j.job_type='semantic_document_index' AND
      c.content_hash IS DISTINCT FROM erp_private.dms_semantic_job_content_hash(j.related_document_id))
   OR (j.job_type='ai_re_extraction' AND c.content_hash IS DISTINCT FROM
      (SELECT encode(extensions.digest(coalesce(content_text,''),'sha256'),'hex')
       FROM public.dms_document_content WHERE document_id=j.related_document_id)) THEN
   RAISE EXCEPTION 'AI input text changed' USING ERRCODE='PT409';
  END IF;
 END IF;
 RETURN j;
END $$;

CREATE FUNCTION erp_private.dms_semantic_enqueue_reviewed_content(p_job bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE document_id bigint; receipt jsonb;
BEGIN
 IF NOT erp_private.dms_semantic_queue_is_enabled() THEN
  RETURN jsonb_build_object('semantic','held_feature_disabled','indexJobId',NULL);
 END IF;
 -- The private review callers have already bound the selected original and
 -- locked the preparation queue/claim and document in that order.
 SELECT j.related_document_id INTO document_id
 FROM public.dms_ai_job_queue j JOIN erp_private.f07_job_claims c ON c.job_id=j.id
 JOIN public.dms_ai_extraction_results r ON r.id=(c.preparation_context->>'resultId')::bigint
  AND r.document_id=j.related_document_id AND r.ai_status='pending_review'
 WHERE j.id=p_job AND j.job_type='ai_re_extraction' AND j.job_status IN ('running','completed')
  AND j.created_by=public.current_user_profile_id() AND c.preparation_context->>'state'='review_required'
  AND r.raw_response_json->'preparation'->'version'='1'::jsonb;
 IF document_id IS NULL THEN
  RETURN jsonb_build_object('semantic','held_source_unavailable','indexJobId',NULL);
 END IF;
 BEGIN
  receipt:=erp_private.dms_semantic_job_enqueue(jsonb_build_object(
   'jobType','semantic_document_index','relatedDocumentId',document_id,
   'payload',jsonb_build_object('documentId',document_id,'source','content_sync_trigger','forceRebuild',false),
   'idempotencyKey','ai-mod04-index:'||p_job),auth.jwt(),'reviewed_content_sync',p_job);
 EXCEPTION
  WHEN lock_not_available THEN RETURN jsonb_build_object('semantic','held_queue_busy','indexJobId',NULL);
  WHEN insufficient_privilege THEN RETURN jsonb_build_object('semantic','held_authority','indexJobId',NULL);
 END;
 RETURN jsonb_build_object('semantic','queued_existing_worker','indexJobId',receipt->'jobId');
END $$;

CREATE FUNCTION erp_private.dms_semantic_post_approve_parent(p_job public.dms_ai_job_queue,p_claims jsonb)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.dms_approve_runs r
  JOIN public.dms_upload_sessions s ON s.id=r.upload_session_id
  JOIN public.user_profiles actor ON actor.id=p_job.created_by AND actor.auth_user_id=(p_claims->>'sub')::uuid
  WHERE r.id=p_job.related_approve_run_id AND r.upload_session_id=p_job.related_upload_session_id
   AND p_job.idempotency_key='post_approve_orchestration:'||s.id||':'||r.id
   AND r.document_id=p_job.related_document_id AND r.status='completed' AND r.completed_at IS NOT NULL
   AND r.started_by=actor.id AND s.reviewed_by=actor.id AND s.document_id=p_job.related_document_id
   AND s.deleted_at IS NULL AND s.intake_status='approved' AND s.status='completed'
   AND s.approve_run_id=r.id AND s.approve_status='completed'
   AND CASE p_job.payload_json->>'source'
    WHEN 'single_file_approve' THEN EXISTS(
     SELECT 1 FROM erp_private.ai_approval_plans proof
     WHERE proof.actor_id=actor.id AND proof.upload_session_id=s.id AND proof.approve_run_id=r.id
      AND proof.document_id=r.document_id AND proof.completed_at IS NOT NULL
      AND proof.result @> jsonb_build_object('documentId',r.document_id,'upload_session_id',s.id,
       'approve_run_id',r.id,'operation_id',proof.operation_id,'completed',true))
    WHEN 'batch_finalize' THEN EXISTS(
     SELECT 1 FROM erp_private.f07_batch_finalizations proof
     WHERE proof.actor_id=actor.id AND proof.upload_session_id=s.id AND proof.approve_run_id=r.id
      AND proof.completed_at IS NOT NULL
      AND proof.receipt @> jsonb_build_object('documentId',r.document_id,'approveRunId',r.id,
       'operationId',proof.operation_id,'completed',true))
    ELSE false
   END
 );
$$;

REVOKE ALL ON FUNCTION erp_private.dms_semantic_queue_is_enabled(),
 erp_private.dms_semantic_job_authority(bigint,text,text,bigint,jsonb),
 erp_private.dms_semantic_job_content_hash(bigint),
 erp_private.dms_semantic_job_enqueue(jsonb,jsonb,text,bigint),
 erp_private.dms_semantic_enqueue_reviewed_content(bigint),
 erp_private.dms_semantic_post_approve_parent(public.dms_ai_job_queue,jsonb),
 erp_private.f07_assert_job(bigint,uuid,boolean)
FROM PUBLIC,anon,authenticated,service_role;

-- Patch only the reviewed admission and retry sites. Keep unrelated queue
-- actions, settlement, and the currently deployed worker compatibility paths.
DO $queue$
DECLARE body text;
BEGIN
 SELECT pg_get_functiondef(oid) INTO body FROM pg_proc
 WHERE oid='erp_private.f07_ai_job_control(text,jsonb,jsonb)'::regprocedure
  AND md5(prosrc)='a45218788b9f87f29e021e86883faf33';
 IF body IS NULL THEN RAISE EXCEPTION 'Unverified F07 queue control predecessor'; END IF;
 body:=replace(body,$old$ IF p_action='enqueue' THEN
  typ:=$old$,$new$ IF p_action='enqueue' AND p_data->>'jobType'='semantic_document_index' THEN
  RETURN erp_private.dms_semantic_job_enqueue(p_data,claims,NULL,NULL);
 END IF;
 IF p_action='enqueue' THEN
  typ:=$new$);
 body:=replace(body,$old$'ocr_backfill','semantic_document_index','generate_metadata_definition_suggestions'$old$,
                    $new$'ocr_backfill','generate_metadata_definition_suggestions'$new$);
 body:=replace(body,$old$OR key IS NULL OR length(key) NOT BETWEEN 1 AND 200 THEN$old$,
                    $new$OR key IS NULL OR length(key) NOT BETWEEN 1 AND 200 OR key LIKE 'semantic_document_index:v2:%' THEN$new$);
 body:=replace(body,$old$   WHEN 'semantic_document_index' THEN coalesce(payload->>'source' NOT IN ('post_approve_orchestration','admin_backfill','manual_rebuild','content_sync_trigger'),true) OR EXISTS(SELECT 1 FROM jsonb_object_keys(payload) k WHERE k NOT IN ('documentId','source','forceRebuild'))
$old$,'');
 body:=replace(body,$old$ PERFORM erp_private.f07_job_authority(j.related_document_id,claims);
 IF p_action='cancel'$old$,$new$ IF j.job_type='semantic_document_index' AND p_action='retry' THEN
  SELECT * INTO c FROM erp_private.f07_job_claims WHERE job_id=j.id FOR UPDATE;
  PERFORM id FROM public.dms_documents WHERE id=j.related_document_id FOR SHARE;
  PERFORM erp_private.dms_semantic_job_authority(j.related_document_id,j.payload_json->>'source',
   'manual_retry',c.semantic_parent_job_id,claims);
  IF NOT erp_private.dms_semantic_queue_is_enabled() THEN
   RAISE EXCEPTION 'Semantic job admission disabled' USING ERRCODE='55000';
  END IF;
  IF c.job_id IS NULL OR c.content_hash IS DISTINCT FROM erp_private.dms_semantic_job_content_hash(j.related_document_id)
   OR NOT EXISTS(SELECT 1 FROM public.dms_documents src WHERE src.id=j.related_document_id
    AND src.deleted_at IS NULL AND NOT src.is_archived AND src.status NOT IN ('archived','deleted','superseded')) THEN
   RAISE EXCEPTION 'Semantic job source changed; create a new reviewed operation' USING ERRCODE='PT409';
  END IF;
 ELSE
  PERFORM erp_private.f07_job_authority(j.related_document_id,claims);
 END IF;
 IF p_action='cancel'$new$);
 body:=replace(body,$old$  UPDATE erp_private.f07_job_claims SET actor_claims=claims,token=NULL,expires_at=NULL WHERE job_id=j.id;$old$,
  $new$  UPDATE erp_private.f07_job_claims SET actor_claims=claims,token=NULL,expires_at=NULL,
   semantic_admission=CASE WHEN j.job_type='semantic_document_index' THEN 'manual_retry' ELSE semantic_admission END
   WHERE job_id=j.id;$new$);
 EXECUTE body;

 SELECT pg_get_functiondef(oid) INTO body FROM pg_proc
 WHERE oid='erp_private.f07_ai_worker(text,jsonb)'::regprocedure AND md5(prosrc)='7e4eef55fd50caf881b650efaee80f68';
 IF body IS NULL THEN RAISE EXCEPTION 'Unverified F07 worker predecessor'; END IF;
 body:=replace(body,$old$AND q.attempt_count<q.max_attempts$old$,
  $new$AND (q.job_type<>'semantic_document_index' OR (
   erp_private.dms_semantic_queue_is_enabled() AND (
    q.payload_json->>'source' IN ('manual_rebuild','admin_backfill')
    OR (q.payload_json->>'source' IN ('post_approve_orchestration','content_sync_trigger') AND proof.semantic_parent_job_id IS NOT NULL)
   )
  )) AND q.attempt_count<q.max_attempts$new$);
 body:=replace(body,$old$  RETURN erp_private.f07_ai_job_control('enqueue',p_data->'input',c.actor_claims);$old$,$new$  IF p_data->'input'->>'jobType'='semantic_document_index' THEN
   IF j.job_type<>'post_approve_orchestration'
    OR p_data->'input'->'payload'->>'source' IS DISTINCT FROM 'post_approve_orchestration'
    OR p_data->'input'->>'idempotencyKey' IS DISTINCT FROM 'semantic_document_index:doc:'||j.related_document_id
    OR coalesce(c.step_receipts->'content_sync'->>'status','') NOT IN ('completed','skipped')
    OR NOT EXISTS(SELECT 1 FROM public.dms_document_content WHERE document_id=j.related_document_id
     AND nullif(btrim(content_text),'') IS NOT NULL)
    OR NOT erp_private.dms_semantic_post_approve_parent(j,c.actor_claims) THEN
    RAISE EXCEPTION 'Current approved content-sync parent required' USING ERRCODE='42501';
   END IF;
   RETURN erp_private.dms_semantic_job_enqueue(p_data->'input',c.actor_claims,'post_approve',j.id);
  END IF;
  RETURN erp_private.f07_ai_job_control('enqueue',p_data->'input',c.actor_claims);$new$);
 EXECUTE body;
END $queue$;

-- Preserve the prior committed chunks. Full intake must wait until the final
-- document/file/link edits before the new queue claim captures its source.
DO $review$
DECLARE body text;
 old_deactivation constant text:=$old$  -- Retain old chunks for provenance while excluding their obsolete embeddings from search.
  UPDATE public.dms_document_content_chunks SET is_active=false,updated_at=clock_timestamp(),updated_by=public.current_user_profile_id() WHERE document_id=d.id AND is_active;
$old$;
 old_enqueue constant text:=$old$  semantic_state:='held_feature_disabled';
  IF EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_AI_JOB_QUEUE' AND is_enabled) AND EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_SEMANTIC_INDEX_QUEUE' AND is_enabled) THEN
   index_receipt:=erp_private.f07_ai_job_control('enqueue',jsonb_build_object('jobType','semantic_document_index','relatedDocumentId',d.id,'payload',jsonb_build_object('documentId',d.id,'source','content_sync_trigger','forceRebuild',false),'idempotencyKey','ai-mod04-index:'||p_job));
   semantic_state:='queued_existing_worker';
  END IF;
$old$;
BEGIN
 SELECT pg_get_functiondef(oid) INTO body FROM pg_proc WHERE oid='erp_private.ai_mod04_refresh_derived(bigint)'::regprocedure
  AND md5(prosrc)='e796bc6e4b4a8cbe849444599b30f9dd';
 IF body IS NULL THEN RAISE EXCEPTION 'Unverified AI MOD04 derived predecessor'; END IF;
 body:=replace(body,old_deactivation,'');
 body:=replace(body,old_enqueue,$new$  index_receipt:=erp_private.dms_semantic_enqueue_reviewed_content(p_job);
  semantic_state:=index_receipt->>'semantic';
$new$);
 body:=replace(body,$old$index_receipt->'jobId'$old$,$new$index_receipt->'indexJobId'$new$);
 EXECUTE body;

 SELECT pg_get_functiondef(oid) INTO body FROM pg_proc WHERE oid='erp_private.dms_full_intake_refresh(bigint,jsonb)'::regprocedure
  AND md5(prosrc)='97f3022a41588f6d73b16c3c32d75677';
 IF body IS NULL THEN RAISE EXCEPTION 'Unverified full-intake derived predecessor'; END IF;
 body:=replace(body,old_deactivation,'');
 body:=replace(body,old_enqueue,$new$  semantic_state:='pending_final_source';
$new$);
 EXECUTE body;

 SELECT pg_get_functiondef(oid) INTO body FROM pg_proc WHERE oid='erp_private.dms_saved_intake_review(text,jsonb)'::regprocedure
  AND md5(prosrc)='b601a61b1b5a3816f09463aa8cdbb0e6';
 IF body IS NULL THEN RAISE EXCEPTION 'Unverified full-intake review predecessor'; END IF;
 body:=replace(body,$old$  INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by) VALUES(doc,'document_updated','Full saved-file intake reviewed and updated',actor);$old$,
 $new$  IF derived->>'semantic'='pending_final_source' THEN
   derived:=derived||erp_private.dms_semantic_enqueue_reviewed_content(job);
  END IF;
  INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by) VALUES(doc,'document_updated','Full saved-file intake reviewed and updated',actor);$new$);
 EXECUTE body;
END $review$;
COMMIT;
