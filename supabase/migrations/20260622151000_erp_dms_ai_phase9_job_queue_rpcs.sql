-- ============================================================================
-- ERP DMS AI Corrected Phase 9 — Job Queue Postgres RPCs
-- Migration: 20260622151000_erp_dms_ai_phase9_job_queue_rpcs.sql
--
-- Adds SECURITY DEFINER RPCs for safe, atomic job queue operations:
--   claim_dms_ai_jobs        — Claim N pending jobs (FOR UPDATE SKIP LOCKED)
--   complete_dms_ai_job      — Mark job completed, clear lock
--   fail_dms_ai_job          — Fail job: retry with backoff or permanently fail
--   recover_stale_dms_ai_jobs — Reset stale running jobs to retry_scheduled
--
-- All RPCs use SECURITY DEFINER so they can bypass RLS for atomic operations.
-- Workers call these through the admin client to avoid RLS layer for RPCs.
-- ============================================================================

-- ── 1. claim_dms_ai_jobs ─────────────────────────────────────────────────────
-- Atomically claim up to p_limit jobs that are ready to run.
-- Uses FOR UPDATE SKIP LOCKED to prevent double processing.

CREATE OR REPLACE FUNCTION public.claim_dms_ai_jobs(
  p_worker_id TEXT,
  p_limit     INT DEFAULT 5
)
RETURNS SETOF public.dms_ai_job_queue
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  UPDATE public.dms_ai_job_queue
  SET
    job_status = 'running',
    locked_by  = p_worker_id,
    locked_at  = NOW(),
    started_at = COALESCE(started_at, NOW()),
    updated_at = NOW()
  WHERE id IN (
    SELECT id
    FROM public.dms_ai_job_queue
    WHERE job_status IN ('queued', 'retry_scheduled')
      AND run_after <= NOW()
    ORDER BY priority ASC, run_after ASC
    LIMIT p_limit
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;

COMMENT ON FUNCTION public.claim_dms_ai_jobs IS
  'Atomically claims up to p_limit DMS AI jobs for a worker. Uses SKIP LOCKED to prevent double processing. Called by the worker route via admin client.';

-- ── 2. complete_dms_ai_job ───────────────────────────────────────────────────
-- Mark a running job as completed and clear the lock.

CREATE OR REPLACE FUNCTION public.complete_dms_ai_job(
  p_job_id BIGINT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.dms_ai_job_queue
  SET
    job_status   = 'completed',
    completed_at = NOW(),
    locked_by    = NULL,
    locked_at    = NULL,
    updated_at   = NOW()
  WHERE id = p_job_id;
END;
$$;

COMMENT ON FUNCTION public.complete_dms_ai_job IS
  'Marks a DMS AI job as completed and clears its lock. Idempotent.';

-- ── 3. fail_dms_ai_job ───────────────────────────────────────────────────────
-- Fail a job: if retryable and attempts remaining, schedule retry with
-- exponential backoff. Otherwise, mark permanently failed.

CREATE OR REPLACE FUNCTION public.fail_dms_ai_job(
  p_job_id          BIGINT,
  p_error_code      TEXT,
  p_error_message   TEXT,
  p_retry           BOOLEAN DEFAULT TRUE
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_attempt_count  INT;
  v_max_attempts   INT;
  v_backoff_minutes INT;
BEGIN
  SELECT attempt_count, max_attempts
  INTO v_attempt_count, v_max_attempts
  FROM public.dms_ai_job_queue
  WHERE id = p_job_id;

  IF NOT FOUND THEN
    RETURN; -- Job not found — no-op
  END IF;

  IF p_retry AND (v_attempt_count + 1) < v_max_attempts THEN
    -- Exponential backoff: attempt 1→ +1m, attempt 2→ +5m, attempt 3+→ +30m
    v_backoff_minutes := CASE v_attempt_count
      WHEN 0 THEN 1
      WHEN 1 THEN 5
      ELSE 30
    END;

    UPDATE public.dms_ai_job_queue
    SET
      job_status         = 'retry_scheduled',
      attempt_count      = attempt_count + 1,
      run_after          = NOW() + (v_backoff_minutes || ' minutes')::INTERVAL,
      last_error_code    = p_error_code,
      last_error_message = p_error_message,
      locked_by          = NULL,
      locked_at          = NULL,
      updated_at         = NOW()
    WHERE id = p_job_id;
  ELSE
    -- Max attempts exhausted or non-retryable error
    UPDATE public.dms_ai_job_queue
    SET
      job_status         = 'failed',
      attempt_count      = attempt_count + 1,
      failed_at          = NOW(),
      last_error_code    = p_error_code,
      last_error_message = p_error_message,
      locked_by          = NULL,
      locked_at          = NULL,
      updated_at         = NOW()
    WHERE id = p_job_id;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.fail_dms_ai_job IS
  'Fails a DMS AI job. Schedules retry with exponential backoff if retryable and attempts remain, otherwise marks permanently failed. Error message must be safe and sanitized.';

-- ── 4. recover_stale_dms_ai_jobs ─────────────────────────────────────────────
-- Reset jobs that have been locked for too long (worker crash recovery).
-- Returns the number of jobs recovered.

CREATE OR REPLACE FUNCTION public.recover_stale_dms_ai_jobs(
  p_stale_after_minutes INT DEFAULT 10
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  UPDATE public.dms_ai_job_queue
  SET
    job_status         = 'retry_scheduled',
    locked_by          = NULL,
    locked_at          = NULL,
    run_after          = NOW() + INTERVAL '1 minute',
    last_error_code    = 'stale_lock',
    last_error_message = 'Job lock expired — worker may have crashed. Scheduling retry.',
    updated_at         = NOW()
  WHERE
    job_status = 'running'
    AND locked_at < NOW() - (p_stale_after_minutes || ' minutes')::INTERVAL
    AND attempt_count < max_attempts;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.recover_stale_dms_ai_jobs IS
  'Recovers DMS AI jobs whose lock has expired (default 10 minutes). Returns count of recovered jobs. Call at the start of each worker run.';
