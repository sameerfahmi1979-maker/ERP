RESET ROLE;SET session_replication_role=replica;
INSERT INTO public.employees(id,employee_code,full_name_en,gender,date_of_birth,owner_company_id,branch_id,joining_date)OVERRIDING SYSTEM VALUE VALUES(2501,'SYN-AI05-EMP','SYNTHETIC protected employee','male','1990-01-01',1001,1001,'2026-01-01');
UPDATE public.user_roles SET is_active=true WHERE user_profile_id=1004;
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,is_active,administrator_scope)SELECT code,'SYNTHETIC '||code,'HR','view',true,'branch'FROM unnest(ARRAY['hr.employees.view','hr.compliance.view'])code ON CONFLICT(permission_code)DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)SELECT 1004,id FROM public.permissions WHERE permission_code IN('hr.employees.view','hr.compliance.view')ON CONFLICT DO NOTHING;
SET session_replication_role=origin;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001001","role":"authenticated","session_id":"00000000-0000-4000-8000-000000002001"}',false);SET ROLE authenticated;
INSERT INTO public.erp_ai_assistant_messages(id,session_id,role,message_text,safe_metadata_json)OVERRIDING SYSTEM VALUE VALUES(2501,2101,'assistant','SYNTHETIC protected answer',jsonb_build_object('ai_mod01_binding',jsonb_build_object('version',1,'ownerProfileId',1001,'sessionId',2101,'sources',jsonb_build_array(jsonb_build_object('reference',jsonb_build_object('entityType','employee','entityId',2501),'sourceVersion',(SELECT updated_at FROM public.employees WHERE id=2501)))),'ai_mod05_authority',erp_private.ai_mod05_authority()));
SELECT set_config('test.protected.feedback',public.ai_mod05_feedback('submit','{"source":{"kind":"assistant","id":2501,"documentId":null},"requestId":"00000000-0000-4000-8000-000000004201","category":"incorrect_value","correction":"SYNTHETIC protected correction","shareForReview":true}')::text,false);
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM erp_private.ai_mod05_feedback WHERE id=(current_setting('test.protected.feedback')::jsonb->>'id')::bigint),'original authorised owner can read their protected correction');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001004","role":"authenticated","session_id":"00000000-0000-4000-8000-000000002004"}',false);
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM public.employees WHERE id=2501),'ordinary scoped reviewer has base employee access in the fixture');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM erp_private.ai_mod05_feedback WHERE id=(current_setting('test.protected.feedback')::jsonb->>'id')::bigint),'base HR access cannot reveal an unclassified salary/banking/medical correction');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001002","role":"authenticated","session_id":"00000000-0000-4000-8000-000000002002"}',false);
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM erp_private.ai_mod05_feedback WHERE id=(current_setting('test.protected.feedback')::jsonb->>'id')::bigint),'independent reviewer with current sensitive authority can review a consented correction');
-- Emulate the timestamp produced by a later committed edit. now() would keep
-- this entire rolled-back fixture's transaction-start timestamp unchanged.
RESET ROLE;SET session_replication_role=replica;UPDATE public.employees SET full_name_en='SYNTHETIC source revision',updated_at=clock_timestamp()WHERE id=2501;SET session_replication_role=origin;
SET ROLE authenticated;
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM erp_private.ai_mod05_feedback WHERE id=(current_setting('test.protected.feedback')::jsonb->>'id')::bigint),'source-version changes retire old sensitive feedback delivery without deleting audit');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001001","role":"authenticated","session_id":"00000000-0000-4000-8000-000000002001"}',false);
-- Laboratory only: populated actual-RLS native worklist; not browser timing or
-- a guarantee about production history volumes. The JSON plan retains time/buffers.
EXPLAIN(ANALYZE,BUFFERS,FORMAT JSON)SELECT public.ai_mod05_snapshot('{"model":"SYN-PAGE-MODEL"}');
RESET ROLE;
