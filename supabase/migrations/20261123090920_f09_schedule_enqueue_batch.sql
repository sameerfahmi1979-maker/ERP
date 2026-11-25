BEGIN;
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION public.f09_enqueue_schedule_run_batch(p_run_ids bigint[])
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  run_id bigint;
  previous_id bigint := 0;
  queued integer := 0;
  skipped integer := 0;
  failed integer := 0;
BEGIN
  IF p_run_ids IS NULL OR cardinality(p_run_ids) NOT BETWEEN 1 AND 25
      OR array_ndims(p_run_ids) IS DISTINCT FROM 1 THEN
    RAISE EXCEPTION 'Invalid reserved schedule runs' USING ERRCODE = '22023';
  END IF;

  -- All callers acquire run locks in the same order. A malformed request
  -- aborts the transaction, including work on earlier IDs.
  FOREACH run_id IN ARRAY p_run_ids LOOP
    IF run_id IS NULL OR run_id <= previous_id THEN
      RAISE EXCEPTION 'Expected increasing positive reserved run IDs' USING ERRCODE = '22023';
    END IF;
    previous_id := run_id;
    BEGIN
      IF public.f09_enqueue_schedule_run(run_id) IS NULL THEN
        skipped := skipped + 1;
      ELSE
        queued := queued + 1;
      END IF;
    EXCEPTION WHEN integrity_constraint_violation OR data_exception OR raise_exception THEN
      -- The point call rolled back this run. Preserve progress on other runs.
      failed := failed + 1;
    END;
  END LOOP;
  RETURN jsonb_build_object('queued', queued, 'skipped', skipped, 'failed', failed);
END;
$$;

REVOKE ALL ON FUNCTION public.f09_enqueue_schedule_run_batch(bigint[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.f09_enqueue_schedule_run_batch(bigint[]) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
