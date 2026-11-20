\set ON_ERROR_STOP on
-- Included by mobile-hr-reads.native.sql only on a fresh, disposable synthetic DB.
CREATE EXTENSION IF NOT EXISTS dblink;
INSERT INTO public.roles(id,role_code,role_name) VALUES(998819,'QA_MHR_RACE_READ','Synthetic transfer reader');
INSERT INTO public.role_permissions(role_id,permission_id) SELECT 998819,id FROM public.permissions WHERE permission_code='hr.employees.view';
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id) SELECT id,998819,998810,998811
 FROM public.user_profiles WHERE auth_user_id='cccccccc-1111-4000-8000-000000000002';
SELECT dblink_connect('projection',format('dbname=%s user=postgres application_name=mobile_hr_profile_race',current_database()));
SELECT dblink_exec('projection','SET ROLE authenticated');
SELECT dblink_exec('projection',$q$SET request.jwt.claims='{"sub":"cccccccc-1111-4000-8000-000000000002","session_id":"dddddddd-1111-4000-8000-000000000002","role":"authenticated"}'$q$);
CREATE FUNCTION pg_temp.start_projection() RETURNS void LANGUAGE plpgsql AS $$
DECLARE waited integer:=0;
BEGIN
  PERFORM pg_advisory_lock(962017,998816);
  PERFORM dblink_send_query('projection','SELECT public.mobile_hr_profile(998816) FROM (SELECT pg_advisory_xact_lock(962017,998816)) gate');
  LOOP
    EXIT WHEN EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory' AND classid=962017 AND objid=998816 AND NOT granted);
    IF waited>=200 THEN RAISE EXCEPTION 'Reader did not reach barrier'; END IF;
    PERFORM pg_sleep(0.01);
    waited:=waited+1;
  END LOOP;
END $$;
CREATE FUNCTION pg_temp.finish_projection(before_phone text,case_label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE old_row jsonb; next_row jsonb;
BEGIN
  PERFORM pg_advisory_unlock(962017,998816);
  SELECT v INTO old_row FROM dblink_get_result('projection') AS t(v jsonb);
  PERFORM v FROM dblink_get_result('projection') AS t(v jsonb);
  SELECT v INTO next_row FROM dblink('projection','SELECT public.mobile_hr_profile(998816)') AS t(v jsonb);
  PERFORM pg_temp.expect(old_row#>>'{contacts,mobile_number}'=before_phone,case_label||' overlapping read contains only the pre-change snapshot');
  PERFORM pg_temp.expect(next_row->>'id'='998816' AND next_row->'contacts'='null',case_label||' subsequent profile retains basic fields and withholds all contacts');
END $$;
-- The fixture writer changes synthetic lifecycle fields directly; the reader remains authenticated under its ordinary RLS.
SET session_replication_role=replica;
SELECT pg_temp.start_projection();
UPDATE public.employees SET branch_id=998811,mobile_number='0111111111' WHERE id=998816;
SELECT pg_temp.finish_projection('0000000000','concurrent branch transfer');
UPDATE public.employees SET branch_id=998810 WHERE id=998816;
SELECT pg_temp.start_projection();
BEGIN;
DELETE FROM public.role_permissions WHERE role_id=998810 AND permission_id=(SELECT id FROM public.permissions WHERE permission_code='hr.employees.update');
UPDATE public.employees SET mobile_number='0222222222',personal_email='private@example.invalid' WHERE id=998816;
COMMIT;
SELECT pg_temp.finish_projection('0111111111','concurrent contact grant revocation');
RESET session_replication_role;
SELECT dblink_disconnect('projection');
