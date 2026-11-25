BEGIN;
-- Report worker inventory shares a snapshot only between the due check and
-- recovery when no due slots need to be reserved. The worker refreshes recovery
-- after attempting any due slots so newly reserved runs enter the same queue.
SET LOCAL lock_timeout = '5s';

CREATE FUNCTION public.f09_schedule_worker_inventory(p_limit integer, p_due_at timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = ''
AS $$
DECLARE
  due jsonb;
  reserved jsonb := '[]'::jsonb;
BEGIN
  IF p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 25 OR p_due_at IS NULL OR NOT isfinite(p_due_at) THEN
    RAISE EXCEPTION 'Invalid schedule inventory input' USING ERRCODE = '22023';
  END IF;

  SELECT coalesce(jsonb_agg(to_jsonb(schedule) ORDER BY schedule.next_run_at, schedule.id), '[]'::jsonb)
    INTO due
    FROM (
      SELECT id, frequency, day_of_week, day_of_month, time_of_day, timezone, next_run_at, updated_at
      FROM public.erp_report_schedules
      WHERE is_active AND deleted_at IS NULL AND next_run_at <= p_due_at
      ORDER BY next_run_at, id
      LIMIT p_limit
    ) schedule;

  IF jsonb_array_length(due) = 0 THEN
    SELECT coalesce(jsonb_agg(to_jsonb(run) ORDER BY run.id), '[]'::jsonb)
      INTO reserved
      FROM (
        SELECT id
        FROM public.erp_report_schedule_runs
        WHERE delivery_engine = 'f09' AND status = 'failed_retryable' AND attempt_count = 0
        ORDER BY id
        LIMIT p_limit
      ) run;
  END IF;

  RETURN jsonb_build_object('due', due, 'reserved', reserved);
END;
$$;

REVOKE ALL ON FUNCTION public.f09_schedule_worker_inventory(integer, timestamptz) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.f09_schedule_worker_inventory(integer, timestamptz) TO service_role;
NOTIFY pgrst, 'reload schema';

COMMIT;
