-- ============================================================================
-- OUTPUT.7 (WP11) — Schedules worker: per-run job records with lease/lock,
-- idempotency, bounded retries, and delivery references.
--
-- erp_report_schedule_runs is the worker's unit of work. One row per
-- (schedule, due slot): the UNIQUE run_key guarantees a due schedule is
-- processed at most once per slot even under concurrent worker invocations.
-- Existing erp_report_delivery_logs history is preserved untouched.
-- ============================================================================

CREATE TABLE IF NOT EXISTS erp_report_schedule_runs (
  id                     bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  schedule_id            bigint NOT NULL REFERENCES erp_report_schedules(id) ON DELETE CASCADE,
  -- The due slot this run covers (the schedule's next_run_at at claim time).
  scheduled_for          timestamptz NOT NULL,
  -- Idempotency key: sched-{schedule_id}-{scheduled_for epoch}. UNIQUE = run-once.
  run_key                text NOT NULL UNIQUE,
  status                 text NOT NULL DEFAULT 'leased'
    CONSTRAINT chk_schedule_run_status CHECK (
      status IN ('leased', 'running', 'succeeded', 'skipped',
                 'failed_retryable', 'failed_terminal')
    ),
  attempt_count          integer NOT NULL DEFAULT 0,
  max_attempts           integer NOT NULL DEFAULT 3,
  -- Lease/lock: a claimed run is invisible to other workers until this expires.
  leased_by              text,
  leased_until           timestamptz,
  -- Bounded retry scheduling.
  next_attempt_at        timestamptz,
  -- Outcome references (metadata only; content stays behind report permissions).
  report_run_id          bigint,
  delivery_log_id        bigint,
  attachment_filename    text,
  attachment_size_bytes  integer,
  recipient_count        integer,
  -- Safe failure reason (no secrets, no recipient content).
  failure_reason         text,
  started_at             timestamptz,
  finished_at            timestamptz,
  created_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_schedule_runs_schedule
  ON erp_report_schedule_runs (schedule_id, created_at DESC);

-- Worker pickup path: retryable runs whose next attempt is due.
CREATE INDEX IF NOT EXISTS idx_schedule_runs_retryable
  ON erp_report_schedule_runs (next_attempt_at)
  WHERE status = 'failed_retryable';

-- Service-role only: no anon/authenticated policies. The app reads run history
-- through permission-guarded server actions using the admin client.
ALTER TABLE erp_report_schedule_runs ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE erp_report_schedule_runs IS
  'OUTPUT.7 schedules worker job records: lease/lock, idempotent run-once per due slot, bounded retries, delivery references. Service-role access only.';
