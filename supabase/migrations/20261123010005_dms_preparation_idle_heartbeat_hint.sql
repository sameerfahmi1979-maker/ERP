BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  definition text;
  old_statement constant text := $old$RETURN jsonb_build_object('success',true,'version',2);$old$;
  new_statement constant text := $new$
  -- A false result is an idle hint only. Claims and lease recovery retain their own fences.
  RETURN jsonb_build_object('success',true,'version',2,'hasWork',EXISTS (
    SELECT 1 FROM public.dms_ai_job_queue q
    JOIN erp_private.dms_preparation_dispatch admitted ON admitted.job_id=q.id
    WHERE q.job_status IN ('queued','retry_scheduled')
    UNION ALL
    SELECT 1 FROM public.dms_ai_job_queue q
    JOIN erp_private.dms_preparation_dispatch admitted ON admitted.job_id=q.id
    WHERE q.job_status='running'
  ));$new$;
BEGIN
  SELECT pg_get_functiondef(oid) INTO definition
  FROM pg_proc
  WHERE oid='erp_private.dms_preparation_dispatch_worker(text,jsonb)'::regprocedure
    AND md5(prosrc)='86c6ab096c24879bb1682a1a9c96bca6';
  IF definition IS NULL OR cardinality(string_to_array(definition, old_statement)) <> 2 THEN
    RAISE EXCEPTION 'Unknown DMS preparation dispatcher predecessor';
  END IF;
  EXECUTE replace(definition, old_statement, new_statement);
END $migration$;

COMMIT;
