BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

CREATE TABLE erp_private.dms_preparation_runtimes (
 runtime_id text PRIMARY KEY CHECK(runtime_id ~ '^[a-z0-9][a-z0-9-]{0,47}$'),
 secret_sha256 text NOT NULL CHECK(secret_sha256 ~ '^[0-9a-f]{64}$'),
 enabled boolean NOT NULL DEFAULT false,
 last_seen timestamptz
);
ALTER TABLE erp_private.dms_preparation_runtimes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.dms_preparation_runtimes FROM PUBLIC,anon,authenticated,service_role;

DO $$
DECLARE body text; anchor text;
BEGIN
 SELECT pg_get_functiondef(oid) INTO body FROM pg_proc
 WHERE oid='erp_private.f07_ai_worker(text,jsonb)'::regprocedure AND md5(prosrc)='5900823d36889959c49e3a15f2d3e60a';
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown AI worker predecessor'; END IF;
 anchor:=$old$WHERE q.job_status IN ('queued','retry_scheduled') AND$old$;
 body:=replace(body,anchor,anchor||$predicate$
 (proof.preparation_context IS NULL OR (p_data->'preparationOnly'='true'::jsonb
   AND NOT EXISTS (SELECT 1 FROM public.dms_ai_job_queue running WHERE running.related_document_id=q.related_document_id AND running.job_status='running'))) AND
 (proof.preparation_context IS NOT NULL OR NOT EXISTS (
   SELECT 1 FROM public.dms_ai_job_queue running JOIN erp_private.f07_job_claims rc ON rc.job_id=running.id
   WHERE running.related_document_id=q.related_document_id AND running.job_status='running' AND rc.preparation_context IS NOT NULL)) AND
 $predicate$);
 -- Only the dedicated entry point may pass preparationOnly to the worker.
 anchor:=$old$WHERE q.job_status='running' AND (coalesce$old$;
 body:=replace(body,anchor,$new$WHERE q.job_status='running' AND (proof.preparation_context IS NULL OR p_data->'preparationOnly'='true'::jsonb) AND (coalesce$new$);
 EXECUTE body;
END $$;

CREATE OR REPLACE FUNCTION public.f07_ai_worker(p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.f07_ai_worker(p_action,p_data-'preparationOnly');
$$;
-- The previous invoker wrapper uses the private routine under service_role.
-- Block direct access via that role and route legacy operations through a
-- fixed public wrapper which cannot opt into the preparation lane.
REVOKE ALL ON FUNCTION erp_private.f07_ai_worker(text,jsonb),public.f07_ai_worker(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.f07_ai_worker(text,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION erp_private.dms_preparation_dispatch_worker(p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE runtime text:=p_data->>'runtimeId'; secret text:=p_data->>'runtimeSecret';
BEGIN
 IF p_action NOT IN ('heartbeat','claim','recover') THEN RAISE EXCEPTION 'Unsupported dispatch action' USING ERRCODE='22023'; END IF;
 IF coalesce(length(secret),0) NOT BETWEEN 32 AND 256 THEN
  RETURN jsonb_build_object('success',false,'reason','worker_unavailable');
 END IF;
 IF p_action='heartbeat' THEN
  UPDATE erp_private.dms_preparation_runtimes SET last_seen=clock_timestamp()
   WHERE runtime_id=runtime AND enabled AND secret_sha256=encode(sha256(convert_to(secret,'UTF8')),'hex')
    AND EXISTS (SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_AI_JOB_QUEUE_WORKER_ENABLED' AND is_enabled);
  IF NOT FOUND THEN RETURN jsonb_build_object('success',false,'reason','worker_unavailable'); END IF;
  RETURN jsonb_build_object('success',true,'version',2);
 END IF;
 IF NOT EXISTS (
  SELECT 1 FROM erp_private.dms_preparation_runtimes r WHERE r.runtime_id=runtime AND r.enabled
   AND r.secret_sha256=encode(sha256(convert_to(secret,'UTF8')),'hex') FOR SHARE) THEN
  RETURN jsonb_build_object('success',false,'reason','worker_unavailable');
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE feature_code='DMS_AI_JOB_QUEUE_WORKER_ENABLED' AND is_enabled FOR SHARE) THEN
  RETURN jsonb_build_object('success',false,'reason','worker_disabled');
 END IF;
 RETURN erp_private.f07_ai_worker(p_action,jsonb_build_object('workerId',runtime,'preparationVersion',1,'preparationOnly',true,'limit',1));
END $$;

DO $$
DECLARE body text;
BEGIN
 SELECT pg_get_functiondef(oid) INTO body FROM pg_proc
 WHERE oid='erp_private.dms_preparation_progress(bigint,bigint,boolean)'::regprocedure AND md5(prosrc)='3becd73a10d90601e848b381b2bac23d';
 IF NOT FOUND THEN RAISE EXCEPTION 'Unknown DMS preparation progress predecessor'; END IF;
 body:=replace(body,'erp_private.dms_preparation_worker_health WHERE last_seen','erp_private.dms_preparation_runtimes WHERE enabled AND last_seen');
 body:=replace(body,$old$'createdAt',q.created_at,'startedAt',q.started_at,'updatedAt',q.updated_at,$old$,
  $new$'createdAt',q.created_at,'startedAt',q.started_at,'updatedAt',q.updated_at,
  'publishedAt',CASE WHEN stage='ready' THEN (SELECT r.created_at FROM public.dms_ai_extraction_results r WHERE r.id=(result->>'resultId')::bigint) END,$new$);
 IF position('publishedAt' IN body)=0 THEN RAISE EXCEPTION 'Unknown progress result projection'; END IF;
 EXECUTE body;
END $$;
COMMIT;
