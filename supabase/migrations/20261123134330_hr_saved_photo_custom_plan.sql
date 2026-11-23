BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid = to_regprocedure('public.hr_subject_photo_state(bigint,bigint)')
      AND md5(replace(p.prosrc, E'\r\n', E'\n')) = 'c9454c45a7dd998da15559bd39c8a970'
      AND NOT p.prosecdef AND p.provolatile = 's' AND p.prorettype = 'jsonb'::regtype
      AND p.proconfig = ARRAY['search_path=""']::text[]
  ) THEN
    RAISE EXCEPTION 'HR saved photo state predecessor requires review';
  END IF;
END
$guard$;

-- Point reads back through the authorized picker with the current document ID.
-- Plan this lookup for that ID. PostgreSQL restores the caller's setting when
-- the function returns, so the ordinary picker keeps the caller's plan mode.
ALTER FUNCTION public.hr_subject_photo_state(bigint,bigint)
  SET plan_cache_mode TO force_custom_plan;

COMMIT;
