-- Run after the synthetic worker claim/stage fixture, only in a disconnected database.
RESET ROLE;
SELECT pg_temp.ok((SELECT preparation_stages->'analysis'->'value'->>'rawJson'='{"fields":"invalid"}' FROM erp_private.f07_job_claims WHERE job_id=current_setting('test.job')::bigint),'malformed provider result retained without publication');
DO $test$
DECLARE code text; actual text; claim_token text:=current_setting('test.token');
BEGIN
 FOR code IN SELECT unnest(ARRAY['provider_output_invalid','provider_output_incomplete','provider_refusal','provider_authentication','provider_request_rejected','quality_evaluation_held','preparation_outcome_unconfirmed','source_changed','provider_timeout','provider_rate_limit','network_error','database_error','unexpected']) LOOP
  BEGIN
   PERFORM public.f07_ai_worker('settle',jsonb_build_object('jobId',current_setting('test.job')::bigint,'token',claim_token,'success',false,'retryable',false,'errorCode',code,'safeMessage','PRIVATE EXTERNAL TEXT'));
   SELECT last_error_code INTO actual FROM public.dms_ai_job_queue WHERE id=current_setting('test.job')::bigint;
   IF actual IS DISTINCT FROM code THEN RAISE EXCEPTION 'Wrong persisted safe code: % / %',actual,code; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.dms_ai_job_attempts WHERE job_id=current_setting('test.job')::bigint AND error_code=code AND status='failed') THEN RAISE EXCEPTION 'Attempt lost diagnostic';END IF;
   IF EXISTS(SELECT 1 FROM public.dms_ai_job_queue WHERE id=current_setting('test.job')::bigint AND (job_status<>'failed' OR last_error_message LIKE '%PRIVATE%')) THEN RAISE EXCEPTION 'Retry policy or privacy regression';END IF;
   RAISE EXCEPTION 'rollback synthetic settle' USING ERRCODE='ZX001';
  EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL; END;
 END LOOP;
END $test$;
SELECT pg_temp.ok((SELECT job_status='running' FROM public.dms_ai_job_queue WHERE id=current_setting('test.job')::bigint),'diagnostic exercises rollback their synthetic settlements');
SET ROLE service_role;
SELECT pg_temp.error($q$SELECT public.f07_ai_worker('settle',jsonb_build_object('jobId',current_setting('test.job')::bigint,'token','00000000-0000-4000-8000-000000009999','success',false,'errorCode','provider_output_invalid'))$q$,'PT409','wrong worker claim cannot settle');
SELECT public.f07_ai_worker('settle',jsonb_build_object('jobId',current_setting('test.job')::bigint,'token',current_setting('test.token'),'success',false,'retryable',false,'errorCode','UNTRUSTED PRIVATE ERROR'));
RESET ROLE;
SELECT pg_temp.ok((SELECT last_error_code='unexpected' AND last_error_message NOT LIKE '%PRIVATE%' FROM public.dms_ai_job_queue WHERE id=current_setting('test.job')::bigint),'untrusted error text remains excluded');
SELECT pg_temp.ok((SELECT title='SYNTHETIC accepted title' FROM public.dms_documents WHERE id=1001),'accepted document unchanged');
SELECT pg_temp.ok((SELECT preparation_context->>'resultId' IS NULL FROM erp_private.f07_job_claims WHERE job_id=current_setting('test.job')::bigint),'invalid result not published as a candidate');
SELECT 'SAFE_FAILURE_PASS categories=13 assertions='||current_setting('test.assertions');
ROLLBACK;
