-- Preserve the schedule and exact candidate predicate of the reviewed 20260803073844 job.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE TABLE erp_private.dms_auto_expiry_failures (
  document_id bigint PRIMARY KEY,
  first_failed_at timestamptz NOT NULL,
  last_failed_at timestamptz NOT NULL,
  attempt_count bigint NOT NULL CHECK (attempt_count > 0),
  resolved_at timestamptz
);

ALTER TABLE erp_private.dms_auto_expiry_failures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE erp_private.dms_auto_expiry_failures FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION erp_private.dms_run_auto_expiry() RETURNS void
LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  candidate_id bigint;
  error_context text;
BEGIN
  -- Check the reviewed status transition inside each record's subtransaction.
  -- The original deferred guard still applies outside this scheduled command.
  SET CONSTRAINTS public.f07_document_completion_update IMMEDIATE;
  FOR candidate_id IN
    SELECT d.id
    FROM public.dms_documents AS d
    WHERE d.deleted_at IS NULL
      AND d.expiry_date IS NOT NULL
      AND d.expiry_date < CURRENT_DATE
      AND d.status NOT IN ('archived','superseded','expired','rejected','deleted')
    ORDER BY d.id
    FOR UPDATE
  LOOP
    BEGIN
      UPDATE public.dms_documents
      SET status = 'expired', updated_at = now()
      WHERE id = candidate_id;

      UPDATE erp_private.dms_auto_expiry_failures
      SET resolved_at = now()
      WHERE document_id = candidate_id AND resolved_at IS NULL;
    EXCEPTION WHEN invalid_parameter_value THEN
      GET STACKED DIAGNOSTICS error_context = PG_EXCEPTION_CONTEXT;
      IF strpos(error_context, 'erp_private.f07_assert_document_completion(') = 0 THEN
        RAISE;
      END IF;

      INSERT INTO erp_private.dms_auto_expiry_failures AS failures
        (document_id, first_failed_at, last_failed_at, attempt_count)
      VALUES (candidate_id, now(), now(), 1)
      ON CONFLICT (document_id) DO UPDATE
      SET last_failed_at = EXCLUDED.last_failed_at,
          attempt_count = failures.attempt_count + 1,
          resolved_at = NULL;
    END;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION erp_private.dms_run_auto_expiry() FROM PUBLIC, anon, authenticated, service_role;

DO $job$
DECLARE
  existing cron.job%ROWTYPE;
  runner_command constant text := 'SELECT erp_private.dms_run_auto_expiry();';
BEGIN
  SELECT * INTO STRICT existing
  FROM cron.job
  WHERE jobname = 'dms-auto-expire';

  IF existing.username <> current_user OR existing.database <> current_database()
    OR existing.schedule <> '0 1 * * *'
    OR md5(existing.command) <> '45ab332e26b9de367c6c89af37a36cd9'
  THEN
    RAISE EXCEPTION 'Reviewed DMS auto-expiry job required';
  END IF;

  -- Managed pg_cron grants the job owner read access and the alteration API.
  PERFORM cron.alter_job(existing.jobid, command => runner_command);

  IF NOT EXISTS (
    SELECT 1 FROM cron.job AS job
    WHERE job.jobid = existing.jobid
      AND job.command = runner_command
      AND to_jsonb(job) - 'command' = to_jsonb(existing) - 'command'
  ) THEN
    RAISE EXCEPTION 'DMS auto-expiry job configuration changed during migration';
  END IF;
END
$job$;

COMMIT;
