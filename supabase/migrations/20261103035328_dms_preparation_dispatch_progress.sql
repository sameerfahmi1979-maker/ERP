BEGIN;
-- Explicit dispatch admission: never backfill the historical queue.
CREATE TABLE erp_private.dms_preparation_dispatch (
 job_id bigint PRIMARY KEY REFERENCES public.dms_ai_job_queue(id) ON DELETE RESTRICT,
 admitted_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE erp_private.dms_preparation_dispatch ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.dms_preparation_dispatch FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE erp_private.dms_preparation_worker_health (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton), last_seen timestamptz NOT NULL
);
ALTER TABLE erp_private.dms_preparation_worker_health ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.dms_preparation_worker_health FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.dms_preparation_admit_new() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.preparation_context IS NULL AND NEW.preparation_context->>'state'='queued'
 AND NEW.preparation_context->>'version'='1' THEN
  INSERT INTO erp_private.dms_preparation_dispatch(job_id) VALUES(NEW.job_id) ON CONFLICT DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.dms_preparation_admit_new() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER dms_preparation_admit_new AFTER UPDATE OF preparation_context ON erp_private.f07_job_claims
FOR EACH ROW EXECUTE FUNCTION erp_private.dms_preparation_admit_new();

-- Preserve the deployed F07/AI05 authority, budget, pause, leases and settlement logic.
DO $patch$
DECLARE body text; anchor text;
BEGIN
 body:=pg_get_functiondef('erp_private.f07_ai_worker(text,jsonb)'::regprocedure);
 anchor:='worker:=p_data->>''workerId'';n:=(p_data->>''limit'')::int;';
 IF position(anchor IN body)=0 OR position('dms-preparation-dispatch-v1' IN body)>0 THEN RAISE EXCEPTION 'Worker source changed'; END IF;
 body:=replace(body,anchor, E'-- dms-preparation-dispatch-v1\n  PERFORM pg_advisory_xact_lock(hashtextextended(''dms-preparation-dispatch-v1'',0));\n  '||anchor);
 anchor:='WHERE q.job_status IN (''queued'',''retry_scheduled'') AND';
 IF position(anchor IN body)=0 THEN RAISE EXCEPTION 'Claim predicate changed'; END IF;
 body:=replace(body,anchor,anchor||E'\n (proof.preparation_context IS NULL OR EXISTS(SELECT 1 FROM erp_private.dms_preparation_dispatch admission WHERE admission.job_id=q.id)) AND\n (coalesce((p_data->>''preparationOnly'')::boolean,false)=false OR (proof.preparation_context IS NOT NULL AND EXISTS(SELECT 1 FROM erp_private.dms_preparation_dispatch admission WHERE admission.job_id=q.id))) AND\n');
 anchor:='claim_token:=gen_random_uuid();';
 IF position(anchor IN body)=0 THEN RAISE EXCEPTION 'Claim boundary changed'; END IF;
 body:=replace(body,anchor,E'IF EXISTS(SELECT 1 FROM erp_private.f07_job_claims WHERE job_id=j.id AND preparation_context IS NOT NULL) THEN\n    IF (SELECT count(*) FROM public.dms_ai_job_queue running JOIN erp_private.f07_job_claims rc ON rc.job_id=running.id WHERE running.job_status=''running'' AND rc.preparation_context IS NOT NULL)>=3\n     OR EXISTS(SELECT 1 FROM public.dms_ai_job_queue running WHERE running.related_document_id=j.related_document_id AND running.job_status=''running'') THEN CONTINUE; END IF;\n   END IF;\n   '||anchor);
 -- Targeted recovery must not alter unrelated old queue entries.
 anchor:='WHERE q.job_status=''running'' AND proof.expires_at<=';
 IF position(anchor IN body)=0 THEN RAISE EXCEPTION 'Recovery predicate changed'; END IF;
 body:=replace(body,anchor,'WHERE q.job_status=''running'' AND (coalesce((p_data->>''preparationOnly'')::boolean,false)=false OR EXISTS(SELECT 1 FROM erp_private.dms_preparation_dispatch admission WHERE admission.job_id=q.id)) AND proof.expires_at<=');
 EXECUTE body;
END $patch$;

CREATE FUNCTION erp_private.dms_preparation_dispatch_worker(p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_AI_JOB_QUEUE_WORKER_ENABLED' AND is_enabled) THEN
  RETURN jsonb_build_object('success',false,'reason','worker_disabled');
 END IF;
 INSERT INTO erp_private.dms_preparation_worker_health(singleton,last_seen) VALUES(true,clock_timestamp())
 ON CONFLICT(singleton) DO UPDATE SET last_seen=EXCLUDED.last_seen;
 IF p_action='heartbeat' THEN RETURN jsonb_build_object('success',true,'version',1); END IF;
 IF p_action NOT IN ('claim','recover') THEN RAISE EXCEPTION 'Unsupported dispatch action' USING ERRCODE='22023'; END IF;
 RETURN erp_private.f07_ai_worker(p_action,p_data||jsonb_build_object('preparationVersion',1,'preparationOnly',true,'limit',1));
END $$;
CREATE FUNCTION public.dms_preparation_dispatch_worker(p_action text,p_data jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.dms_preparation_dispatch_worker(p_action,p_data)$$;
REVOKE ALL ON FUNCTION erp_private.dms_preparation_dispatch_worker(text,jsonb),public.dms_preparation_dispatch_worker(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION erp_private.dms_preparation_dispatch_worker(text,jsonb),public.dms_preparation_dispatch_worker(text,jsonb) TO service_role;

CREATE FUNCTION erp_private.dms_preparation_progress(p_document bigint,p_job bigint,p_resume boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb; q public.dms_ai_job_queue; stages jsonb; stage text; admitted boolean; healthy boolean; hold_reason text; company bigint;
BEGIN
 -- Existing RPC enforces current session, actor ownership, source scope and sensitivity.
 result:=erp_private.ai_mod04_preparation('status',jsonb_build_object('documentId',p_document,'jobId',p_job));
 SELECT * INTO q FROM public.dms_ai_job_queue WHERE id=p_job;
 IF p_resume THEN
  IF NOT erp_private.dms_file_pipeline_manager(p_document) OR result->>'sourceCurrent'<>'true'
   OR result->>'state'<>'queued' OR q.job_status NOT IN ('queued','retry_scheduled') THEN
   RAISE EXCEPTION 'Request cannot be resumed; review its current source and outcome' USING ERRCODE='42501';
  END IF;
  INSERT INTO erp_private.dms_preparation_dispatch(job_id) VALUES(p_job) ON CONFLICT DO NOTHING;
  -- Explicit resume rebinds only this owner's unchanged request to their verified current session.
  UPDATE erp_private.f07_job_claims SET actor_claims=current_setting('request.jwt.claims',true)::jsonb WHERE job_id=p_job;
 END IF;
 SELECT preparation_stages INTO stages FROM erp_private.f07_job_claims WHERE job_id=p_job;
 SELECT EXISTS(SELECT 1 FROM erp_private.dms_preparation_dispatch WHERE job_id=p_job) INTO admitted;
 SELECT EXISTS(SELECT 1 FROM erp_private.dms_preparation_worker_health WHERE last_seen>clock_timestamp()-interval '45 seconds')
  AND EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_AI_JOB_QUEUE_WORKER_ENABLED' AND is_enabled) INTO healthy;
 stage:=CASE WHEN result->>'state'='review_required' THEN 'ready'
  WHEN result->>'state' IN ('applied','cancelled') THEN result->>'state'
  WHEN q.job_status='failed' THEN 'held'
  WHEN q.job_status='retry_scheduled' THEN 'retry_wait'
  WHEN q.job_status='running' AND EXISTS(SELECT 1 FROM jsonb_each(coalesce(stages,'{}')) e WHERE e.key LIKE 'analysis%' AND e.value->>'state'='started') THEN 'analysing'
  WHEN q.job_status='running' THEN 'reading' ELSE 'waiting' END;
 IF stage IN ('waiting','retry_wait') AND to_regprocedure('erp_private.ai_mod05_work_open(bigint,boolean)') IS NOT NULL THEN
  SELECT owning_company_id INTO company FROM public.dms_documents WHERE id=p_document;
  IF NOT erp_private.ai_mod05_work_open(company,true) THEN hold_reason:='paused';
  ELSIF NOT erp_private.ai_mod05_job_allowed(company) THEN hold_reason:='daily_limit'; END IF;
 END IF;
 RETURN result||jsonb_build_object('progress',jsonb_build_object('stage',stage,'admitted',admitted,'workerHealthy',healthy,
  'createdAt',q.created_at,'startedAt',q.started_at,'updatedAt',q.updated_at,'errorCode',q.last_error_code,'holdReason',hold_reason));
END $$;
CREATE FUNCTION public.dms_preparation_progress(p_document bigint,p_job bigint,p_resume boolean DEFAULT false) RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.dms_preparation_progress(p_document,p_job,p_resume)$$;
REVOKE ALL ON FUNCTION erp_private.dms_preparation_progress(bigint,bigint,boolean),public.dms_preparation_progress(bigint,bigint,boolean) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.dms_preparation_progress(bigint,bigint,boolean),public.dms_preparation_progress(bigint,bigint,boolean) TO authenticated;

CREATE FUNCTION erp_private.dms_preparation_notify() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.job_status IS DISTINCT FROM OLD.job_status AND NEW.job_status IN ('completed','failed')
 AND EXISTS(SELECT 1 FROM erp_private.dms_preparation_dispatch WHERE job_id=NEW.id) THEN
  INSERT INTO public.erp_notifications(notification_code,source_module,source_entity_type,source_entity_id,notification_type,
   severity,title,message,recipient_user_id,channel_in_app,channel_email,action_url,action_label,metadata_json,created_by)
  VALUES('DMS_PREPARATION_'||NEW.id||'_'||NEW.job_status,'DMS','dms_documents',NEW.related_document_id,'ai_preparation',
   'info',CASE WHEN NEW.job_status='completed' THEN 'AI review is ready' ELSE 'AI processing needs attention' END,
   'Open the document to review the current result. Accepted information has not been changed.',NEW.created_by,true,false,
   '/dms/documents/record/'||NEW.related_document_id,'Open document',jsonb_build_object('preparation_job_id',NEW.id),NEW.created_by)
  ON CONFLICT(notification_code) DO NOTHING;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.dms_preparation_notify() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER dms_preparation_notify AFTER UPDATE OF job_status ON public.dms_ai_job_queue
FOR EACH ROW EXECUTE FUNCTION erp_private.dms_preparation_notify();
NOTIFY pgrst,'reload schema';
COMMIT;
