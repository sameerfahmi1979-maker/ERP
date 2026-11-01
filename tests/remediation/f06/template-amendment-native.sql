\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='20s';
CREATE TEMP TABLE amendment_checks(name text PRIMARY KEY);
CREATE FUNCTION pg_temp.check_it(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label;END IF;INSERT INTO amendment_checks VALUES(label);END $$;
CREATE FUNCTION pg_temp.expect_error(sql text,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN EXECUTE sql;EXCEPTION WHEN OTHERS THEN
  IF SQLSTATE<>expected THEN RAISE EXCEPTION 'FAIL: % expected %, got %: %',label,expected,SQLSTATE,SQLERRM;END IF;
  INSERT INTO amendment_checks VALUES(label);RETURN;
 END;
 RAISE EXCEPTION 'FAIL: % unexpectedly succeeded',label;
END $$;

-- All identities, companies, permissions and content are synthetic fixtures.
INSERT INTO public.owner_companies(id,company_code,legal_name_en) VALUES(990030,'QA_AMEND_A','SYNTHETIC TEMPLATE A'),(990031,'QA_AMEND_B','SYNTHETIC TEMPLATE B');
INSERT INTO public.branches(id,owner_company_id,branch_code,branch_name_en) VALUES(990030,990030,'QA_AMEND_BRANCH','SYNTHETIC BRANCH');
INSERT INTO public.roles(id,role_code,role_name) VALUES
 (990030,'system_admin','Global System Administrator'),(990031,'group_admin','Legacy global'),
 (990032,'QA_TEMPLATE_REVIEWER','Synthetic template reviewer'),(990033,'company_admin','Company Administrator'),(990034,'branch_admin','Branch Administrator');
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code)
 VALUES('reports.view','Template view','reports','view'),('reports.manage','Template manage','reports','manage'),('reports.template.approve','Template approve','reports','approve'),('reports.publish','Template publish','reports','publish')
 ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
 SELECT r,p.id FROM unnest(ARRAY[990032]) r CROSS JOIN public.permissions p
 WHERE p.permission_code IN('reports.view','reports.manage','reports.template.approve','reports.publish');
INSERT INTO auth.users(id,email,raw_user_meta_data) SELECT ('aaaaaaaa-0030-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 'template-amend-'||n||'@example.invalid','{"full_name":"SYNTHETIC TEMPLATE TEST"}' FROM generate_series(1,8) n;
INSERT INTO auth.sessions(id,user_id) SELECT ('bbbbbbbb-0030-4000-8000-'||lpad(n::text,12,'0'))::uuid,
 ('aaaaaaaa-0030-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,8) n;
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id)
 SELECT u.id,CASE n WHEN 1 THEN 990030 WHEN 2 THEN 990032 WHEN 3 THEN 990031 WHEN 4 THEN 990033 WHEN 5 THEN 990032 WHEN 6 THEN 990032 ELSE 990030 END,
 CASE WHEN n IN(2,4,5) THEN 990030 WHEN n=6 THEN 990031 END,CASE WHEN n=5 THEN 990030 END
 FROM generate_series(1,8) n JOIN public.user_profiles u ON u.auth_user_id=('aaaaaaaa-0030-4000-8000-'||lpad(n::text,12,'0'))::uuid;
UPDATE public.user_profiles SET status='inactive' WHERE auth_user_id='aaaaaaaa-0030-4000-8000-000000000007';
UPDATE auth.sessions SET not_after=now()-interval '1 minute' WHERE id='bbbbbbbb-0030-4000-8000-000000000008';
INSERT INTO public.erp_report_branding_profiles(id,profile_code,profile_name,owner_company_id,is_active)
 OVERRIDING SYSTEM VALUE VALUES(990030,'QA_AMEND_PROFILE_A','SYNTHETIC A',990030,true),(990031,'QA_AMEND_PROFILE_B','SYNTHETIC B',990031,true);
INSERT INTO public.erp_report_templates(id,template_code,template_name,template_type,branding_profile_id,governance_status,security_review_status,body_html_en,visual_editor_engine)
 OVERRIDING SYSTEM VALUE VALUES(990030,'QA_SAME_ID','Original published template','letter',990030,'published','passed','<p>Original published wording</p>',NULL);
CREATE TEMP TABLE original_template AS SELECT to_jsonb(t) AS snapshot FROM public.erp_report_templates t WHERE id=990030;
CREATE FUNCTION pg_temp.amend(n integer,action text,revision bigint DEFAULT NULL,data jsonb DEFAULT NULL,operation uuid DEFAULT gen_random_uuid(),note text DEFAULT NULL,review jsonb DEFAULT NULL)
 RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.edit_report_template(u.id,('bbbbbbbb-0030-4000-8000-'||lpad(n::text,12,'0'))::uuid,990030,action,operation,revision,data,note,review)
 FROM public.user_profiles u WHERE u.auth_user_id=('aaaaaaaa-0030-4000-8000-'||lpad(n::text,12,'0'))::uuid;
$$;
SELECT pg_temp.check_it(NOT has_function_privilege('authenticated','public.edit_report_template(bigint,uuid,bigint,text,uuid,bigint,jsonb,text,jsonb)','execute'),'authenticated cannot forge scanner or actor');
SELECT pg_temp.check_it(has_function_privilege('service_role','public.edit_report_template(bigint,uuid,bigint,text,uuid,bigint,jsonb,text,jsonb)','execute') AND NOT has_function_privilege('anon','public.edit_report_template(bigint,uuid,bigint,text,uuid,bigint,jsonb,text,jsonb)','execute'),'only the service entry point can attest a review');
SELECT pg_temp.check_it(NOT has_table_privilege('service_role','erp_private.report_template_amendments','select'),'service has no raw draft-table access');
SELECT pg_temp.check_it(NOT has_table_privilege('authenticated','erp_private.report_template_amendment_history','update'),'snapshot history is protected');
SELECT pg_temp.check_it(pg_temp.amend(1,'read')->'amendment'='null','no draft initially');
SELECT pg_temp.expect_error('select pg_temp.amend(3,''save'',1,''{"template_name":"Denied edit"}'')','42501','legacy global cannot use system-only editor');
SELECT pg_temp.expect_error('select pg_temp.amend(4,''save'',1,''{"template_name":"Denied edit"}'')','42501','company administrator cannot use system-only editor');
SELECT pg_temp.expect_error('select pg_temp.amend(5,''read'')','42501','branch grant cannot read company-wide amendments');
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id)
 SELECT id,990032,990031 FROM public.user_profiles WHERE auth_user_id='aaaaaaaa-0030-4000-8000-000000000005';
SELECT pg_temp.expect_error('select pg_temp.amend(5,''read'')','42501','combined branch and foreign-company grants cannot widen scope');
SELECT pg_temp.expect_error('select pg_temp.amend(6,''read'')','42501','foreign company reviewer denied');
SELECT pg_temp.expect_error('select pg_temp.amend(7,''save'',1,''{"template_name":"Denied edit"}'')','42501','inactive system administrator denied');
SELECT pg_temp.expect_error('select pg_temp.amend(8,''read'')','42501','expired session denied');
SELECT pg_temp.expect_error('select pg_temp.amend(1,''save'',1,''{"governance_status":"published"}'')','22023','protected fields denied');
SELECT pg_temp.expect_error('select pg_temp.amend(1,''save'',1,''{"template_name":null}'')','22023','typed name required');
SELECT pg_temp.expect_error('select pg_temp.amend(1,''save'',1,''{"branding_profile_id":990031}'')','22023','company reassignment denied');
CREATE TEMP TABLE first_save AS SELECT pg_temp.amend(1,'save',1,'{"template_name":"Changed draft name","font_family":"Arial"}','cccccccc-0030-4000-8000-000000000001') result;
SELECT pg_temp.check_it((SELECT result->>'revision'='2' AND result->'template'->>'template_name'='Changed draft name' FROM first_save),'pending configuration returned to editor');
SELECT pg_temp.check_it((SELECT to_jsonb(t)=snapshot FROM public.erp_report_templates t CROSS JOIN original_template WHERE t.id=990030),'published row fully unchanged during editing');
SELECT pg_temp.check_it((SELECT count(*)=1 FROM public.erp_report_templates WHERE template_code LIKE 'QA_SAME_ID%'),'no duplicate catalogue row');
SELECT pg_temp.check_it(pg_temp.amend(2,'read')->'template'->>'template_name'='Changed draft name','authorized independent reviewer sees proposed settings');
SELECT pg_temp.check_it(pg_temp.amend(1,'save',1,'{"template_name":"Changed draft name","font_family":"Arial"}','cccccccc-0030-4000-8000-000000000001')->>'replayed'='true','response loss replays original save');
SELECT pg_temp.expect_error('select pg_temp.amend(1,''save'',1,''{"template_name":"Different payload"}'',''cccccccc-0030-4000-8000-000000000001'')','22023','operation cannot change payload');
SELECT pg_temp.expect_error('select pg_temp.amend(1,''save'',1,''{"template_name":"Stale edit"}'')','PT409','stale concurrent editor rejected');
SELECT pg_temp.expect_error('select pg_temp.amend(1,''submit'',2,NULL,gen_random_uuid(),NULL,''{"passed":false,"severity":"block","findings":[]}'')','22023','failed security review cannot submit');
SELECT pg_temp.expect_error('select pg_temp.amend(1,''submit'',2,NULL,gen_random_uuid(),NULL,''{"passed":true,"findings":[]}'')','22023','an incomplete security-review receipt cannot submit');
SELECT pg_temp.amend(1,'submit',2,NULL,'cccccccc-0030-4000-8000-000000000002',NULL,'{"passed":true,"severity":"none","findings":[]}');
SELECT pg_temp.expect_error('select pg_temp.amend(1,''approve'',3)','22023','editor cannot approve own changes');
SELECT pg_temp.expect_error('select pg_temp.amend(1,''save'',3,''{"template_name":"Review bypass"}'')','22023','in-review edits require withdrawal');
SELECT pg_temp.amend(2,'reject',3,NULL,gen_random_uuid(),'Synthetic rejection');
SELECT pg_temp.check_it(pg_temp.amend(1,'read')->'amendment'->>'status'='rejected','rejection retained without altering live content');
SELECT pg_temp.amend(1,'save',4,'{"template_name":"Corrected pending template"}');
SELECT pg_temp.check_it(pg_temp.amend(1,'read')->'amendment'->'review'='null','correction invalidates old review');
SELECT pg_temp.amend(1,'submit',5,NULL,gen_random_uuid(),NULL,'{"passed":true,"severity":"none","findings":[]}');
SELECT pg_temp.amend(2,'approve',6);
SELECT pg_temp.amend(1,'withdraw',7);
SELECT pg_temp.expect_error('select pg_temp.amend(1,''publish'',8)','22023','withdrawal invalidates prior approval');
SELECT pg_temp.amend(1,'submit',8,NULL,gen_random_uuid(),NULL,'{"passed":true,"severity":"none","findings":[]}');
SELECT pg_temp.amend(2,'approve',9);
UPDATE public.user_roles SET is_active=false WHERE role_id=990032 AND owner_company_id=990030;
SELECT pg_temp.expect_error('select pg_temp.amend(1,''publish'',10)','42501','revoked reviewer cannot lend approval to publication');
UPDATE public.user_roles SET is_active=true WHERE role_id=990032 AND owner_company_id=990030;
SELECT pg_temp.check_it((SELECT to_jsonb(t)=snapshot FROM public.erp_report_templates t CROSS JOIN original_template WHERE t.id=990030),'all review transitions preserved published settings');
SELECT pg_temp.amend(1,'publish',10,NULL,'cccccccc-0030-4000-8000-000000000003');
SELECT pg_temp.check_it((SELECT template_code='QA_SAME_ID' AND template_name='Corrected pending template' AND version_no=2 AND workspace_revision=2 AND governance_status='published' FROM public.erp_report_templates WHERE id=990030),'atomic publication keeps identity and increments version');
SELECT pg_temp.check_it((SELECT count(*)=1 FROM public.erp_report_templates WHERE template_code LIKE 'QA_SAME_ID%'),'publication makes no catalogue copies');
SELECT pg_temp.check_it((SELECT count(*)=2 FROM erp_private.template_configuration_history WHERE template_id=990030),'old and new published snapshots retained');
SELECT pg_temp.check_it((SELECT count(*)=10 FROM erp_private.report_template_amendment_history WHERE template_id=990030),'each successful edit and transition has an immutable snapshot');
SELECT pg_temp.check_it(pg_temp.amend(1,'publish',10,NULL,'cccccccc-0030-4000-8000-000000000003')->>'replayed'='true','lost publish response cannot publish twice');
SELECT pg_temp.check_it((SELECT version_no=2 FROM public.erp_report_templates WHERE id=990030),'replay preserves version count');
SELECT pg_temp.amend(1,'save',2,'{"template_name":"Second edit cycle"}');
SELECT pg_temp.check_it(pg_temp.amend(1,'read')->>'revision'='12','new cycle does not reuse internal revision');
UPDATE public.erp_report_templates SET template_name='External legitimate change' WHERE id=990030;
SELECT pg_temp.expect_error('select pg_temp.amend(1,''submit'',12,NULL,gen_random_uuid(),NULL,''{"passed":true,"severity":"none","findings":[]}'')','PT409','changed live source blocks publication workflow');
SELECT pg_temp.amend(1,'discard',12,NULL,gen_random_uuid(),'Discard stale pending edit');
SELECT pg_temp.check_it(pg_temp.amend(1,'read')->'template'->>'template_name'='External legitimate change','stale draft can be discarded without reverting live changes');
UPDATE public.user_roles SET is_active=false WHERE role_id=990030 AND user_profile_id=(SELECT id FROM public.user_profiles WHERE auth_user_id='aaaaaaaa-0030-4000-8000-000000000001');
SELECT pg_temp.expect_error('select pg_temp.amend(1,''save'',1,''{"template_name":"Changed draft name","font_family":"Arial"}'',''cccccccc-0030-4000-8000-000000000001'')','42501','revoked system authority cannot replay an earlier save');
UPDATE public.user_roles SET is_active=true WHERE role_id=990030 AND user_profile_id=(SELECT id FROM public.user_profiles WHERE auth_user_id='aaaaaaaa-0030-4000-8000-000000000001');
DELETE FROM auth.sessions WHERE id='bbbbbbbb-0030-4000-8000-000000000001';
SELECT pg_temp.expect_error('select pg_temp.amend(1,''read'')','42501','revoked Auth session cannot read staged content');
SELECT count(*) AS passed_native_checks FROM amendment_checks;
ROLLBACK;
