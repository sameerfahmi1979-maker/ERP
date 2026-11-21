\set ON_ERROR_STOP on
-- Run after the v4 profile-race fixture in a dedicated mobile5_hr_* synthetic database.
DO $$ BEGIN
 IF current_database() NOT LIKE 'mobile5_hr_%' OR NOT EXISTS(SELECT FROM public.roles WHERE id=998811 AND role_code='QA_HR_READ_SELF')
 THEN RAISE EXCEPTION 'Use the isolated synthetic read-race fixture'; END IF;
END $$;
CREATE EXTENSION IF NOT EXISTS dblink;
INSERT INTO public.role_permissions(role_id,permission_id)
 SELECT 998811,id FROM public.permissions WHERE permission_code='hr.requests.submit.self' ON CONFLICT DO NOTHING;
SELECT dblink_connect('service_writer',format('dbname=%s user=postgres application_name=mobile5_hr_race_writer',current_database()));
SELECT dblink_exec('service_writer','SET ROLE authenticated');
SELECT dblink_exec('service_writer',$q$SET request.jwt.claims='{"sub":"cccccccc-1111-4000-8000-000000000001","session_id":"dddddddd-1111-4000-8000-000000000001","role":"authenticated"}'$q$);
BEGIN;
DELETE FROM public.role_permissions WHERE role_id=998811 AND permission_id=(SELECT id FROM public.permissions WHERE permission_code='hr.requests.submit.self');
SELECT dblink_send_query('service_writer',$q$SELECT public.mobile_hr_service_v5('{"op":"serviceSubmit","employeeId":998810,"operationId":"4121a192-1111-4111-8111-121212121212","proposal":{"kind":"overtime","employeeRevision":"1","date":"2026-11-12","hours":1,"reason":"Synthetic lock race","evidence":null}}')$q$);
DO $$ BEGIN
 FOR attempt IN 1..200 LOOP
  IF EXISTS(SELECT FROM pg_stat_activity w WHERE w.application_name='mobile5_hr_race_writer' AND pg_backend_pid()=ANY(pg_blocking_pids(w.pid))) THEN RETURN; END IF;
  PERFORM pg_sleep(0.025);
 END LOOP;
 RAISE EXCEPTION 'Synthetic writer did not wait for the revocation';
END $$;
COMMIT;
SELECT * FROM dblink_get_result('service_writer',false) AS result(v jsonb);
DO $$ BEGIN
 IF dblink_error_message('service_writer') NOT LIKE '%Current own subject required%' AND dblink_error_message('service_writer') NOT LIKE '%Current service authority required%' THEN RAISE EXCEPTION 'Unexpected race outcome: %',dblink_error_message('service_writer'); END IF;
 IF EXISTS(SELECT FROM erp_private.hr_self_operation_receipts WHERE operation_id='4121a192-1111-4111-8111-121212121212') THEN RAISE EXCEPTION 'Revoked writer obtained a receipt'; END IF;
 RAISE NOTICE 'PASS: waiting service writer rechecked committed role revocation and had no effect';
END $$;
SELECT dblink_disconnect('service_writer');
