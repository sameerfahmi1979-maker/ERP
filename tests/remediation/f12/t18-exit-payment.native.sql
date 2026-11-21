BEGIN;

DO $test$
BEGIN
 IF to_regprocedure('public.t18_exit_payment(uuid,bigint,text,jsonb)') IS NULL THEN
   RAISE EXCEPTION 'T18 exact exit payment boundary is unavailable';
 END IF;
 IF NOT has_function_privilege('authenticated','public.t18_exit_payment(uuid,bigint,text,jsonb)','EXECUTE')
    OR has_function_privilege('anon','public.t18_exit_payment(uuid,bigint,text,jsonb)','EXECUTE')
    OR has_function_privilege('service_role','public.t18_exit_payment(uuid,bigint,text,jsonb)','EXECUTE') THEN
   RAISE EXCEPTION 'T18 exit payment RPC has unexpected grants';
 END IF;
END;
$test$;

ROLLBACK;
