\set ON_ERROR_STOP on
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.mobile_hr_service_v5(jsonb)') IS NULL THEN RAISE EXCEPTION 'Typed service boundary missing'; END IF;
END $$;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.mobile_hr_service_v5('{"op":"serviceSubmit","employeeId":1,"operationId":"00000000-0000-4000-8000-000000000001","proposal":{"kind":"overtime","hours":1,"date":"2026-01-15","reason":"Synthetic shift","employeeRevision":"1","evidence":null}}');
  RAISE EXCEPTION 'Unauthenticated submission accepted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
ROLLBACK;
