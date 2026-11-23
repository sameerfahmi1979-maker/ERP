BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $migration$
DECLARE
  definition text;
  name_anchor constant text := 'public.dms_upload_batch_eligibility(p_operation uuid)';
  hold_anchor constant text := $hold$RETURN jsonb_build_object('eligible',false,'positions','[]'::jsonb);$hold$;
  ready_anchor constant text := $ready$RETURN jsonb_build_object('eligible',true,'positions',positions);$ready$;
BEGIN
  SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc
  WHERE oid='public.dms_upload_batch_eligibility(uuid)'::regprocedure
    AND md5(prosrc)='785f18d607f2019dfb0331faa7ebc9d0'
    AND NOT prosecdef;
  IF definition IS NULL OR cardinality(string_to_array(definition,name_anchor))<>2
    OR cardinality(string_to_array(definition,hold_anchor))<>2
    OR cardinality(string_to_array(definition,ready_anchor))<>2 THEN
    RAISE EXCEPTION 'Unknown DMS batch eligibility predecessor';
  END IF;
  -- The ordinary caller still passes the existing admission read and eligibility predicates.
  -- Return their checked receipt together instead of asking for the same receipt twice.
  definition := replace(definition,name_anchor,'public.dms_upload_batch_readiness(p_operation uuid)');
  definition := replace(definition,hold_anchor,
    $hold$RETURN jsonb_build_object('receipt',receipt,'eligibility',jsonb_build_object('eligible',false,'positions','[]'::jsonb));$hold$);
  definition := replace(definition,ready_anchor,
    $ready$RETURN jsonb_build_object('receipt',receipt,'eligibility',jsonb_build_object('eligible',true,'positions',positions));$ready$);
  EXECUTE definition;
END $migration$;

REVOKE ALL ON FUNCTION public.dms_upload_batch_readiness(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.dms_upload_batch_readiness(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.dms_upload_batch_eligibility(p_operation uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$
  SELECT public.dms_upload_batch_readiness(p_operation)->'eligibility';
$$;

COMMIT;
