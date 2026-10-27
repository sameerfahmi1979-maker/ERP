-- F19 / H07 / CF-04: optional report history must reference a retained run.
-- Approved 2026-10-27: preserve referenced history; never infer, erase or
-- null-out orphaned references. Apply only through a reviewed release manifest.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.erp_report_schedule_runs AS scheduled
    LEFT JOIN public.erp_report_runs AS report ON report.id = scheduled.report_run_id
    WHERE scheduled.report_run_id IS NOT NULL AND report.id IS NULL
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23503',
      MESSAGE = 'F19 report-history validation failed: unresolved report-run references exist. No history was changed.';
  END IF;
END
$preflight$;

-- The partial index supports reference checks without indexing pre-render/null
-- entries. Neither the index nor the FK changes permissions or grants.
CREATE INDEX f19_schedule_runs_report_run_idx
  ON public.erp_report_schedule_runs (report_run_id)
  WHERE report_run_id IS NOT NULL;

ALTER TABLE public.erp_report_schedule_runs
  ADD CONSTRAINT f19_schedule_runs_report_run_fk
  FOREIGN KEY (report_run_id) REFERENCES public.erp_report_runs (id)
  ON UPDATE RESTRICT ON DELETE RESTRICT
  NOT DEFERRABLE NOT VALID;

-- Validation and installation are one transaction. Concurrent changes cannot
-- turn a successful preflight into an accepted orphan. Any failure rolls back
-- this migration; an unvalidated constraint is never left as completed work.
ALTER TABLE public.erp_report_schedule_runs
  VALIDATE CONSTRAINT f19_schedule_runs_report_run_fk;
COMMIT;
