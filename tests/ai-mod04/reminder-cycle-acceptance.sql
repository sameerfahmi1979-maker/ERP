-- Post-cutover only. Existing source/schema drift remains an explicit hold.
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001001","role":"authenticated","session_id":"00000000-0000-4000-8000-000000002001"}',false);
SELECT pg_temp.ok((SELECT count(DISTINCT expiry_cycle_date) FROM public.dms_expiry_reminders WHERE document_id=1003)=2,'different accepted expiry cycles retain separate reminder identities');
SELECT pg_temp.ok((SELECT count(*) FROM public.dms_expiry_reminders WHERE document_id=1003 AND expiry_cycle_date='2028-12-31' AND status='cancelled')=5,'unsent obsolete cycle reminders are cancelled without deleting history');
SET ROLE authenticated;
SELECT pg_temp.ok(public.ai_mod04_schedule_reminders(1003,NULL)->>'state'='held_profile_schema','stale approved processing schema cannot generate a new reminder cycle');
RESET ROLE;
UPDATE public.dms_metadata_definitions SET field_label_en='Number' WHERE id=1001;
SET ROLE authenticated;
SELECT set_config('test.schedule',public.ai_mod04_schedule_reminders(1003,NULL)::text,false);
SELECT pg_temp.ok(current_setting('test.schedule')::jsonb->>'created'='0','repeat scheduling does not enqueue duplicate reminders');
SELECT pg_temp.ok((SELECT count(*) FROM public.dms_expiry_reminders WHERE document_id=1003)=10,'both cycles remain intact after response-loss retry');
SELECT pg_temp.error($q$SELECT public.ai_mod04_schedule_reminders(999999,NULL)$q$,'42501','scheduler rejects unavailable or forbidden documents');
RESET ROLE;
