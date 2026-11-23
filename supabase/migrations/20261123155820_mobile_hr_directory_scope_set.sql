-- Batch the existing employee read authorization inside the directory statement.
BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $directory_scope$
DECLARE
  directory_oid oid := 'public.mobile_hr_v5_directory_details(bigint[])'::regprocedure;
  previous_predicate CONSTANT text := 'e.deleted_at IS NULL AND public.current_user_can_view_employee(e.id)';
  next_predicate CONSTANT text := 'e.deleted_at IS NULL AND e.id IN (SELECT erp_private.readable_employee_ids())';
  definition text;
  original_metadata jsonb;
BEGIN
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION 'Reviewed Mobile HR directory owner required';
  END IF;

  SELECT to_jsonb(p) - 'prosrc', pg_get_functiondef(p.oid)
  INTO original_metadata, definition
  FROM pg_proc p
  WHERE p.oid = directory_oid
    AND p.proowner = 'postgres'::regrole
    AND NOT p.prosecdef AND NOT p.proisstrict AND NOT p.proretset
    AND p.provolatile = 's' AND p.prorettype = 'jsonb'::regtype
    AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql')
    AND p.proconfig = ARRAY['search_path=""', 'jit=off']
    AND p.proargnames = ARRAY['p_employees']
    AND ARRAY(SELECT a::text FROM unnest(p.proacl) a ORDER BY a::text)
      = ARRAY['authenticated=X/postgres', 'postgres=X/postgres']
    AND md5(replace(p.prosrc, E'\r\n', E'\n')) = 'f3e7aeb7a92d46caa1f532d613817e8f';

  IF NOT FOUND OR (length(definition) - length(replace(definition, previous_predicate, '')))
      <> length(previous_predicate) THEN
    RAISE EXCEPTION 'Reviewed Mobile HR directory preimage changed';
  END IF;

  -- The set and point functions must still implement the reviewed read scope.
  IF EXISTS (
    SELECT FROM (VALUES
      ('erp_private.readable_employee_ids()'::regprocedure, true, true, 'bc725a99d93ad584f0397033eacbdfd1'),
      ('erp_private.employee_permission(bigint,text)'::regprocedure, true, false, '085fd40f2b0b84e88328b3a824fd5390'),
      ('public.current_user_can_view_employee(bigint)'::regprocedure, false, false, '80500374fc013e8ba0f345cfd394f2e1')
    ) AS expected(routine, definer, returns_set, body_hash)
    WHERE NOT EXISTS (
      SELECT FROM pg_proc p
      WHERE p.oid = expected.routine
        AND p.proowner = 'postgres'::regrole
        AND p.prosecdef = expected.definer
        AND p.proretset = expected.returns_set
        AND p.provolatile = 's'
        AND p.proconfig = ARRAY['search_path=""']
        AND md5(replace(p.prosrc, E'\r\n', E'\n')) = expected.body_hash
    )
  ) THEN
    RAISE EXCEPTION 'Reviewed Mobile HR employee read authority changed';
  END IF;

  -- Retain invoker RLS, label joins, the independent phone checks and ordering.
  EXECUTE replace(definition, previous_predicate, next_predicate);

  IF NOT EXISTS (
    SELECT FROM pg_proc p WHERE p.oid = directory_oid
      AND (to_jsonb(p) - 'prosrc') = original_metadata
      AND md5(replace(p.prosrc, E'\r\n', E'\n')) = '22c43888273a51ac6ff35625d07d7e29'
  ) THEN
    RAISE EXCEPTION 'Mobile HR directory metadata or postimage changed';
  END IF;
END $directory_scope$;

COMMIT;
