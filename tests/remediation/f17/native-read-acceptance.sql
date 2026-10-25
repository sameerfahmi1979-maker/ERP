-- Isolated F17 database only. No worker/provider is called. All fixtures roll back.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '20s';
SET LOCAL lock_timeout = '2s';
DO $$ BEGIN
  IF current_database() !~ '^algt_f17_[0-9]+$' THEN RAISE EXCEPTION 'Isolated F17 database required'; END IF;
END $$;
INSERT INTO public.erp_ai_usage_logs(feature_area,operation_type,model_id,status,input_token_count,output_token_count,estimated_cost,duration_ms,metadata_json,created_at)
SELECT 'F17_SYNTHETIC','read_acceptance','synthetic-model',CASE WHEN n%3=0 THEN 'failed' ELSE 'success' END,
  10,2,0.01,20,jsonb_build_object('cost_currency','USD','entity_type','employee','entity_id',900001),
  '2026-10-26 12:00:00+04'::timestamptz
FROM generate_series(1,12501) n;
INSERT INTO public.erp_ai_usage_logs(feature_area,operation_type,model_id,status,metadata_json,created_at)
VALUES ('F17_BOUNDARY','read_acceptance','synthetic-model','success','{}','2026-10-26 00:00:00+04'),
       ('F17_BOUNDARY','read_acceptance','synthetic-model','success','{}','2026-10-27 00:00:00+04');
CREATE TEMP TABLE f17_measurements (sample integer, ms double precision, records bigint, bytes bigint);
DO $$ DECLARE n bigint; started timestamptz; amount bigint; size bigint; BEGIN
  SELECT count(*) INTO n FROM public.erp_ai_usage_logs WHERE feature_area='F17_SYNTHETIC';
  IF n<>12501 THEN RAISE EXCEPTION 'Complete aggregate mismatch'; END IF;
  SELECT count(*) INTO n FROM public.erp_ai_usage_logs WHERE feature_area='F17_SYNTHETIC' AND status IN ('failed','failure','error');
  IF n<>4167 THEN RAISE EXCEPTION 'Failure aggregate mismatch'; END IF;
  SELECT count(*) INTO n FROM public.erp_ai_usage_logs WHERE feature_area='F17_BOUNDARY' AND created_at>='2026-10-25T20:00:00Z' AND created_at<'2026-10-26T20:00:00Z';
  IF n<>1 THEN RAISE EXCEPTION 'Dubai date boundary mismatch'; END IF;
  SELECT count(*) INTO n FROM public.erp_ai_usage_logs WHERE feature_area='F17_SYNTHETIC' AND metadata_json->>'entity_type'='employee' AND metadata_json->>'entity_id'='900001';
  IF n<>12501 THEN RAISE EXCEPTION 'Canonical HR subject predicate mismatch'; END IF;
  SELECT sum(input_token_count) INTO n FROM public.erp_ai_usage_logs WHERE feature_area='F17_SYNTHETIC';
  IF n<>125010 THEN RAISE EXCEPTION 'Token total mismatch'; END IF;
  FOR i IN 0..30 LOOP
    started:=clock_timestamp();
    SELECT count(*),coalesce(sum(pg_column_size(q)),0) INTO amount,size FROM (
      SELECT id,feature_area,operation_type,model_id,provider_config_id,status,input_token_count,output_token_count,estimated_cost,duration_ms,document_id,created_at,error_message,metadata_json->>'cost_currency' AS cost_currency
      FROM public.erp_ai_usage_logs WHERE feature_area='F17_SYNTHETIC' AND operation_type='read_acceptance' AND model_id='synthetic-model'
      AND created_at>='2026-10-25T20:00:00Z' AND created_at<'2026-10-26T20:00:00Z' ORDER BY id LIMIT 500
    ) q;
    IF amount<>500 THEN RAISE EXCEPTION 'Bounded page mismatch'; END IF;
    INSERT INTO f17_measurements VALUES (i,extract(epoch FROM clock_timestamp()-started)*1000,amount,size);
  END LOOP;
END $$;
SELECT json_build_object('checks',6,'rows',12501,'pageSize',500,'firstReadMs',(SELECT ms FROM f17_measurements WHERE sample=0),
  'warmSamples',30,'warmP50Ms',percentile_cont(.5)WITHIN GROUP(ORDER BY ms),'warmP95Ms',percentile_cont(.95)WITHIN GROUP(ORDER BY ms),
  'pageStorageBytes',max(bytes),'scope','synthetic SQL reads; first read is not a cold disk-cache test; no browser or production SLA')
FROM f17_measurements WHERE sample>0;
EXPLAIN (ANALYZE,BUFFERS,FORMAT JSON)
SELECT id,feature_area,operation_type,status,metadata_json->>'cost_currency' AS cost_currency
FROM public.erp_ai_usage_logs WHERE feature_area='F17_SYNTHETIC' AND status='failed' ORDER BY id LIMIT 500;
-- Query every changed health source using the actual catalog; errors must fail the test.
SELECT count(*) FROM public.dms_ai_job_queue WHERE job_status='queued';
SELECT count(*) FROM public.dms_documents WHERE deleted_at IS NULL AND ai_status='failed';
SELECT count(*) FROM public.dms_document_content_chunks WHERE deleted_at IS NULL AND is_active AND embedding_status='failed';
SELECT count(*) FROM public.dms_review_queue WHERE deleted_at IS NULL AND status='open' AND priority='high';
SELECT count(*) FROM public.dms_ai_validation_findings WHERE deleted_at IS NULL AND status='open';
SELECT count(*) FROM public.dms_ai_entity_match_candidates WHERE deleted_at IS NULL AND status='pending';
-- No signed-in profile: ordinary caller must not gain the global usage monitor's service-role read.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"00000000-0000-4000-8000-000000000017"}',true);
DO $$ BEGIN
  IF EXISTS(SELECT 1 FROM public.erp_ai_usage_logs WHERE feature_area='F17_SYNTHETIC') THEN RAISE EXCEPTION 'Unmapped caller saw global usage'; END IF;
END $$;
RESET ROLE;
ROLLBACK;
SELECT json_build_object('retainedSyntheticRows',count(*)) FROM public.erp_ai_usage_logs WHERE feature_area IN ('F17_SYNTHETIC','F17_BOUNDARY');
