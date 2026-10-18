-- REVIEWED RELEASE STEP ONLY. Not an automatic migration/startup hook.
-- Run only in ERP project mmiefuieduzdiiwnqpie after backup/history preflight.
-- No secret is returned, no request is sent, no existing job is modified.
BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='30s';
DO $$BEGIN
 IF to_regprocedure('erp_private.f10_dispatch_notification_tick()') IS NULL THEN RAISE EXCEPTION 'Matching F10 schema required';END IF;
 IF EXISTS(SELECT 1 FROM erp_private.notification_dispatch_control WHERE enabled) THEN RAISE EXCEPTION 'Expected paused F10 control';END IF;
 IF EXISTS(SELECT 1 FROM cron.job WHERE jobname='algt-f10-personal-notification-worker') THEN RAISE EXCEPTION 'Existing F10 job requires reconciliation, not replacement';END IF;
END $$;
DO $$DECLARE worker bigint;BEGIN
 worker:=cron.schedule('algt-f10-personal-notification-worker','* * * * *','SELECT erp_private.f10_dispatch_notification_tick();');
 PERFORM cron.alter_job(worker,active:=false);
 IF NOT EXISTS(SELECT 1 FROM cron.job WHERE jobid=worker AND NOT active) THEN RAISE EXCEPTION 'Paused installation unconfirmed';END IF;
END $$;
COMMIT;
