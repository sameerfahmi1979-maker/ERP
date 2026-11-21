\set ON_ERROR_STOP on
BEGIN;
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF to_regprocedure('public.mobile_hr_v5_calendar(date,date,integer,bigint,bigint,bigint,text)') IS NULL THEN
    RAISE EXCEPTION 'Calendar native boundary is missing';
  END IF;
  BEGIN
    PERFORM public.mobile_hr_v5_calendar('2026-11-01','2026-11-30',1,NULL,NULL,NULL,'');
    RAISE EXCEPTION 'Missing session received calendar data';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $$;
ROLLBACK;
