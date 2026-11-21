-- Starts after the v4 synthetic identity/data setup, in its own disposable database.
DO $$ BEGIN IF current_database() NOT LIKE 'mobile5_hr_%' THEN RAISE EXCEPTION 'Synthetic database required'; END IF; END $$;
SET LOCAL session_replication_role=replica;
UPDATE public.dms_document_files SET integrity_status='verified' WHERE id=998810;
SET LOCAL session_replication_role=origin;
INSERT INTO public.role_permissions(role_id,permission_id)
 SELECT 998810,id FROM public.permissions WHERE permission_code IN ('reports.run','reports.pdf.generate','reports.pdf.approve','reports.export','reports.view') ON CONFLICT DO NOTHING;
INSERT INTO public.erp_report_registry(report_code,report_name_en,module_code,report_category,document_class,is_active,required_permissions)
 VALUES('HR_EMBASSY_LETTER','Synthetic evidence wait','HR','letter','A',true,ARRAY['hr.employees.view']) ON CONFLICT DO NOTHING;
INSERT INTO public.erp_output_class_policies(document_class,class_name) VALUES('A','Synthetic output') ON CONFLICT DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
SELECT public.mobile_hr_service_v5(jsonb_build_object('op','serviceSubmit','operationId',gen_random_uuid(),'employeeId',998810,'proposal',jsonb_build_object(
 'kind','overtime','employeeRevision',(SELECT workspace_revision::text FROM public.employees WHERE id=998810),'date','2026-10-16','hours',1,'reason','Synthetic evidence review','evidence','{"documentId":998810,"documentVersionId":998810}'::jsonb))) ->>'id' AS req \gset
SELECT public.mobile_hr_service_v5(jsonb_build_object('op','serviceSubmit','operationId',gen_random_uuid(),'employeeId',998810,'proposal',jsonb_build_object('kind','letter','employeeRevision',(SELECT workspace_revision::text FROM public.employees WHERE id=998810),'outputCode','HR_EMBASSY_LETTER','language','en','recipient','Synthetic office','purpose','Synthetic travel','evidence','{"documentId":998810,"documentVersionId":998810}'::jsonb,'neededBy',NULL)))->>'id' AS letter_req \gset
SELECT pg_temp.actor(2);
SELECT public.mobile_hr_service_v5(jsonb_build_object('op','serviceDecision','id',:letter_req,'employeeId',998810,'revision','1','operationId',gen_random_uuid(),'decision','approve','reason',''));
COMMIT;
CREATE EXTENSION IF NOT EXISTS dblink;
SELECT dblink_connect('evidence_officer',format('dbname=%s user=postgres application_name=mobile5_hr_evidence_officer',current_database()));
SELECT dblink_exec('evidence_officer','SET ROLE authenticated');
SELECT dblink_exec('evidence_officer',$q$SET request.jwt.claims='{"sub":"cccccccc-1111-4000-8000-000000000002","session_id":"dddddddd-1111-4000-8000-000000000002","role":"authenticated"}'$q$);
BEGIN;
SET LOCAL session_replication_role=replica;
UPDATE public.dms_document_files SET sha256_hash=repeat('c',64) WHERE id=998810;
SELECT dblink_send_query('evidence_officer',format('select public.mobile_hr_service_v5(%L::jsonb)',jsonb_build_object('op','serviceDecision','employeeId',998810,'id',:req,'revision','1','operationId',gen_random_uuid(),'decision','approve','reason','')));
DO $$ BEGIN
 FOR i IN 1..200 LOOP
  IF EXISTS(SELECT FROM pg_stat_activity a WHERE a.application_name='mobile5_hr_evidence_officer' AND pg_backend_pid()=ANY(pg_blocking_pids(a.pid))) THEN RETURN; END IF;
  PERFORM pg_sleep(0.025);
 END LOOP;
 RAISE EXCEPTION 'Decision did not wait for synthetic evidence update';
END $$;
COMMIT;
SELECT * FROM dblink_get_result('evidence_officer',false) AS result(v jsonb);
SELECT pg_temp.check_it(dblink_error_message('evidence_officer') LIKE '%Original evidence or authority changed%'
 AND EXISTS(SELECT FROM erp_private.hr_self_service_requests WHERE id=:req AND status='pending' AND revision=1),
 'waiting independent reviewer rechecked original evidence under lock; request remains pending');
SELECT * FROM dblink_get_result('evidence_officer',false) AS drained(v jsonb);
BEGIN;
SET LOCAL session_replication_role=replica;
UPDATE public.dms_document_files SET sha256_hash=repeat('a',64) WHERE id=998810;
COMMIT;
BEGIN;
SET LOCAL session_replication_role=replica;
UPDATE public.dms_document_files SET sha256_hash=repeat('d',64) WHERE id=998810;
SELECT dblink_send_query('evidence_officer',format('select public.mobile_hr_service_v5(%L::jsonb)',jsonb_build_object('op','serviceFulfil','employeeId',998810,'id',:letter_req,'revision','2','operationId',gen_random_uuid(),'command','{"kind":"issue-letter","outputCode":"HR_EMBASSY_LETTER","language":"en","sourceId":null,"sourceReviewId":null,"templateId":null}'::jsonb)));
DO $$ BEGIN
 FOR i IN 1..200 LOOP
  IF EXISTS(SELECT FROM pg_stat_activity a WHERE a.application_name='mobile5_hr_evidence_officer' AND pg_backend_pid()=ANY(pg_blocking_pids(a.pid))) THEN RETURN; END IF;
  PERFORM pg_sleep(0.025);
 END LOOP;
 RAISE EXCEPTION 'Decision did not wait for synthetic evidence update';
END $$;
COMMIT;
SELECT * FROM dblink_get_result('evidence_officer',false) AS result(v jsonb);
SELECT pg_temp.check_it(dblink_error_message('evidence_officer') LIKE '%Original evidence or authority changed%'
 AND NOT EXISTS(SELECT FROM erp_private.mobile_hr_service_attempts WHERE request_id=:letter_req),
 'waiting letter reservation rechecked original evidence under lock; no attempt dispatched');
SELECT dblink_disconnect('evidence_officer');
