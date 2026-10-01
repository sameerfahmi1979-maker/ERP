-- F09 release inventory: read-only, aggregate-only. No mutation or activation.
-- Operator must independently verify the authorized ERP project before use.
-- Do not publish output. Never query raw provider secrets, auth tokens, cron
-- command bodies, vault plaintext or message contents.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT status,source_module,count(*) AS items,min(scheduled_for) AS oldest_scheduled
 FROM public.erp_email_queue WHERE deleted_at IS NULL GROUP BY status,source_module;
SELECT is_active,frequency,timezone,count(*) AS schedules,
 count(*) FILTER(WHERE next_run_at<=now()) AS overdue
 FROM public.erp_report_schedules WHERE deleted_at IS NULL GROUP BY is_active,frequency,timezone;
SELECT status,count(*) AS runs FROM public.erp_report_schedule_runs GROUP BY status;
SELECT id,provider_type,is_active,is_enabled,is_default,throttle_per_minute,daily_send_limit,
 (secret_ref IS NOT NULL) AS secret_reference_present
 FROM public.erp_email_provider_configs WHERE deleted_at IS NULL;
SELECT to_regclass('cron.job') IS NOT NULL AS has_cron_catalog;
ROLLBACK;

-- AFTER all F09 migrations only. Run separately, still read-only.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT status,delivery_state,(paused_at IS NOT NULL) AS paused,
 (dispatch_started_at IS NOT NULL) AS has_dispatch_marker,count(*) AS items
 FROM public.erp_email_queue WHERE deleted_at IS NULL GROUP BY 1,2,3,4;
SELECT delivery_engine,status,count(*) FROM public.erp_report_schedule_runs GROUP BY 1,2;
SELECT provider_id,count(*) FILTER(WHERE admitted_at>now()-interval '60 seconds') AS minute_attempts,
 count(*) FILTER(WHERE admitted_at>now()-interval '24 hours') AS rolling_day_attempts
 FROM public.erp_email_provider_dispatches GROUP BY provider_id;
SELECT provider_id,retry_at FROM public.erp_email_provider_cooldowns WHERE retry_at>now();
SELECT p.proname,has_function_privilege('anon',p.oid,'execute') AS anon_execute,
 has_function_privilege('authenticated',p.oid,'execute') AS browser_execute
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname LIKE 'f09_%';
SELECT policyname,cmd FROM pg_policies WHERE schemaname='public' AND tablename='erp_report_schedules';
ROLLBACK;
-- If cron.job exists, an authorized operator can inspect jobid/schedule/active
-- privately. Never print command or headers; they may contain machine secrets.
