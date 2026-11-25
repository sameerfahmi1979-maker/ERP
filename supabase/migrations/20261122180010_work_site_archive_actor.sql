BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $guard$
BEGIN
  IF current_user <> 'postgres' OR NOT EXISTS (
    SELECT FROM pg_proc f
    WHERE f.oid = 'public.phase3_save_work_site(bigint,bigint,uuid,jsonb,boolean)'::regprocedure
      AND f.proowner = 'postgres'::regrole
      AND f.prosecdef
      AND f.provolatile = 'v'
      AND f.proconfig = ARRAY['search_path=""']
      AND md5(replace(f.prosrc, E'\r', '')) = '63b6de211ab859a418b9e38c925e4690'
      AND ARRAY(SELECT acl::text FROM unnest(f.proacl) AS acl ORDER BY acl::text)
        = ARRAY['authenticated=X/postgres', 'postgres=X/postgres']
  ) THEN RAISE EXCEPTION 'Reviewed work site archive routine drift'; END IF;
END $guard$;

-- The existing archive command records its actor in this field along with
-- the audit entry and replay receipt. Historical rows have no backfill.
ALTER TABLE public.work_sites
  ADD COLUMN deleted_by bigint REFERENCES public.user_profiles(id) ON DELETE SET NULL;

NOTIFY pgrst, 'reload schema';
COMMIT;
