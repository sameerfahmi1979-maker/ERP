BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_catalog.pg_proc p
    WHERE p.oid = to_regprocedure('public.mobile_hr_v5_directory_details(bigint[])')
      AND p.proowner = 'postgres'::regrole
      AND p.prolang = (SELECT oid FROM pg_catalog.pg_language WHERE lanname = 'plpgsql')
      AND md5(replace(p.prosrc, E'\r\n', E'\n')) = 'f3e7aeb7a92d46caa1f532d613817e8f'
      AND NOT p.prosecdef
      AND p.provolatile = 's'
      AND NOT p.proretset
      AND p.prorettype = 'jsonb'::regtype
      AND p.proconfig = ARRAY['search_path=""','jit=off']::text[]
      AND ARRAY(SELECT grant_item::text FROM unnest(p.proacl) AS grant_item ORDER BY grant_item::text)
        = ARRAY['authenticated=X/postgres','postgres=X/postgres']::text[]
  ) THEN
    RAISE EXCEPTION 'Mobile HR directory predecessor requires review';
  END IF;
END
$guard$;

-- Plan the authorized page details for the caller's exact employee ID array.
-- PostgreSQL restores the caller's plan setting when the function returns.
ALTER FUNCTION public.mobile_hr_v5_directory_details(bigint[])
  SET plan_cache_mode TO force_custom_plan;

COMMIT;
