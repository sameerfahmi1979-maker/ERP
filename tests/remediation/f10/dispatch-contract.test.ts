import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const migration=readFileSync('supabase/migrations/20261018154433_f10_independent_notification_dispatch.sql','utf8');
const install=readFileSync('tooling/release/f10-install-paused-worker.sql','utf8');
it('installation has an independent default-off control and never schedules a live job through schema replay',()=>{
 expect(migration).toContain('enabled boolean NOT NULL DEFAULT false');expect(migration).not.toContain('cron.schedule(');
 expect(install).toContain('BEGIN;');expect(install).toContain('COMMIT;');expect(install).toContain('cron.alter_job(worker,active:=false)');
 expect(install).toContain('Existing F10 job requires reconciliation, not replacement');
});
it('worker targets only the admission route, with bounded empty input and existing private credential',()=>{
 expect(migration).toContain("url:='https://erp.algt.net/api/internal/process-notification-events'");
 expect(migration).toContain("body:='{}'::jsonb,timeout_milliseconds:=30000");
 expect(migration).toContain("s.name='algt_internal_api_secret'");expect(migration).toContain('matching<>1');
 expect(migration).not.toContain('/process-email-queue');expect(migration).not.toContain('/send-email');
});
it('observations never expose response bodies, credentials or false delivery confirmation',()=>{
 const inspect=migration.slice(migration.indexOf('CREATE FUNCTION public.f10_inspect_notification_dispatch'));
 expect(inspect).not.toContain('h.content');expect(inspect).not.toContain('h.headers');expect(inspect).not.toContain('decrypted_secret');
 expect(inspect).toContain("'delivery_confirmed',false");expect(inspect).toContain('LIMIT 20');
 expect(inspect).toContain('http_accepted_event_outcomes_separate');expect(inspect).toContain('Global notification operations access required');
});
it('dispatch cannot be activated by an ordinary account or service API grant',()=>{
 expect(migration).toContain('REVOKE ALL ON FUNCTION erp_private.f10_dispatch_notification_tick() FROM PUBLIC,anon,authenticated,service_role');
 expect(migration).toContain('FORCE ROW LEVEL SECURITY');expect(migration).toContain('pg_try_advisory_xact_lock');
});
