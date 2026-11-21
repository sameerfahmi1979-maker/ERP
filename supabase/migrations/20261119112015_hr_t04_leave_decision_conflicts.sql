BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

DO $$
DECLARE routine regprocedure;
DECLARE definition text;
DECLARE patched text;
BEGIN
 definition:=pg_get_functiondef('public.t04_leave_command(bigint,bigint,text,jsonb,uuid)'::regprocedure);
 patched:=replace(definition,$old$    IF EXISTS(SELECT 1 FROM erp_private.t04_days x JOIN erp_private.t04_policies p ON p.id=x.policy_id$old$,
  $new$    IF erp_private.t04_current_evidence(request.id,p_employee) THEN
     RAISE EXCEPTION 'Current verified evidence must use routine HR review' USING ERRCODE='23514';
    END IF;
    IF EXISTS(SELECT 1 FROM erp_private.t04_days x JOIN erp_private.t04_policies p ON p.id=x.policy_id$new$);
 IF definition=patched THEN RAISE EXCEPTION 'Unknown T04 routine evidence predecessor'; END IF;
 EXECUTE patched;

 -- The shared receipt layer reports a stale or changed operation as P0409.
 -- Map that outcome to a real HTTP conflict at the T04 PostgREST boundaries.
 FOREACH routine IN ARRAY ARRAY[
  'public.t04_prepare_leave_setup(text,bigint,bigint,jsonb,uuid)'::regprocedure,
  'public.t04_approve_leave_setup(bigint,text,uuid)'::regprocedure,
  'public.t04_leave_command(bigint,bigint,text,jsonb,uuid)'::regprocedure,
  'public.t04_verify_sick_evidence(bigint,bigint,bigint,bigint,bigint,uuid)'::regprocedure
 ] LOOP
  definition:=pg_get_functiondef(routine);
  patched:=replace(definition,E'END;\n$function$',E'EXCEPTION WHEN SQLSTATE ''P0409'' THEN\n RAISE SQLSTATE ''PT409'' USING MESSAGE=SQLERRM;\nEND;\n$function$');
  IF definition=patched THEN RAISE EXCEPTION 'Unknown T04 conflict predecessor'; END IF;
  EXECUTE patched;
 END LOOP;
END;
$$;
NOTIFY pgrst,'reload schema';
COMMIT;
