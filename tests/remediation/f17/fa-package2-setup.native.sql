\set ON_ERROR_STOP on
BEGIN;
DO $test$
DECLARE configured text[];
BEGIN
 IF current_database() !~ '^fa_package2_[a-z_]+$'
   OR current_setting('cron.launch_active_jobs')<>'off'
   OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
     IS DISTINCT FROM 'Isolated HR T00 20261119' THEN
  RAISE EXCEPTION 'Marked Package 2 rehearsal required';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.erp_app_branding_settings WHERE settings_code='DEFAULT_APP_BRANDING'
    AND app_name='ALGT ERP' AND app_short_name='ALGT' AND tagline='Alliance Gulf Transport ERP' AND is_active AND deleted_at IS NULL) THEN
  RAISE EXCEPTION 'Reviewed default app branding is missing';
 END IF;
 IF (SELECT count(*) FROM public.erp_ai_feature_flags WHERE feature_code IN ('ERP_AI_DAILY_DASHBOARD','DMS_AI_OBSERVABILITY') AND NOT is_enabled)<>2
  OR EXISTS(SELECT 1 FROM public.erp_ai_feature_flags WHERE is_enabled) THEN
  RAISE EXCEPTION 'Exactly two missing setup flags must be installed with AI disabled';
 END IF;
 SELECT array_agg(report_code ORDER BY report_code) INTO configured FROM public.erp_report_registry WHERE is_active AND deleted_at IS NULL;
 IF cardinality(configured)<>34
  OR NOT configured @> ARRAY['FIN_PAYROLL_RECONCILIATION','ADMIN_PERMISSION_MATRIX','HR_EMPLOYEE_LIST','HR_WPS_READINESS',
    'HR_ASSIGNMENT_BY_SITE','HR_PPE_ISSUE_REPORT','HR_ASSET_ISSUE_REPORT','HR_WARNING_LETTER','HR_LEAVE_CONFIRMATION']
  OR NOT EXISTS(SELECT 1 FROM public.erp_report_registry WHERE report_code='HR_EMPLOYEE_ID_CARD' AND NOT is_active) THEN
  RAISE EXCEPTION 'Expected reviewed report identities and the held badge';
 END IF;
 IF EXISTS(SELECT 1 FROM public.erp_report_registry WHERE supports_scheduling)
  OR NOT EXISTS(SELECT 1 FROM public.erp_report_registry WHERE report_code='FIN_PAYROLL_RECONCILIATION' AND default_output_formats=ARRAY['screen'])
  OR NOT EXISTS(SELECT 1 FROM public.erp_report_registry WHERE report_code='HR_NOC' AND approval_required_override)
  OR NOT EXISTS(SELECT 1 FROM public.erp_report_registry WHERE report_code='HR_WARNING_LETTER' AND document_class='A'
    AND qr_policy_override='none' AND required_permissions @> ARRAY['hr.confidential.view'])
  OR NOT EXISTS(SELECT 1 FROM public.erp_report_registry WHERE report_code='HR_PPE_ISSUE_FORM' AND required_permissions=ARRAY['hr.assignments.view'])
  OR NOT EXISTS(SELECT 1 FROM public.erp_report_registry WHERE report_code='HR_BANK_SALARY_TRANSFER' AND document_class='A'
    AND required_permissions @> ARRAY['hr.banking.view']) THEN
  RAISE EXCEPTION 'Report metadata lost a governing release or access requirement';
 END IF;
 IF has_function_privilege('anon','public.fa_read_ai_setup_feature(text)','EXECUTE')
  OR has_function_privilege('service_role','public.fa_read_ai_setup_feature(text)','EXECUTE') THEN
  RAISE EXCEPTION 'AI setup RPC exposure exceeded authenticated application readers';
 END IF;
END $test$;

INSERT INTO auth.users(id,email,aud,role,email_confirmed_at)
VALUES ('78020000-0000-4000-8000-000000000001','fa-package2-global@example.test','authenticated','authenticated',now()),
 ('78020000-0000-4000-8000-000000000002','fa-package2-branch@example.test','authenticated','authenticated',now());
INSERT INTO auth.sessions(id,user_id,created_at,not_after)
SELECT replace(id::text,'-8000-','-8001-')::uuid,id,now(),now()+interval '1 day'
FROM auth.users WHERE email IN ('fa-package2-global@example.test','fa-package2-branch@example.test');
INSERT INTO public.user_profiles(auth_user_id,full_name,status,must_change_password)
SELECT id,'Synthetic Package 2 actor','active',false FROM auth.users
WHERE email IN ('fa-package2-global@example.test','fa-package2-branch@example.test')
ON CONFLICT(auth_user_id) DO UPDATE SET status='active',must_change_password=false;

INSERT INTO public.roles(role_code,role_name,is_system_role)
VALUES ('fa_package2_setup_reader','Synthetic Package 2 setup reader',false);
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope)
VALUES ('ai.dashboard.view','Synthetic daily dashboard read','AI','view','global'),
 ('dms.ai_observability.view','Synthetic DMS observability read','DMS','view','global'),
 ('branding.app.view','Synthetic app branding read','BRANDING','view','global')
ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT role.id,permission.id FROM public.roles role CROSS JOIN public.permissions permission
WHERE role.role_code='fa_package2_setup_reader'
  AND permission.permission_code IN ('ai.dashboard.view','dms.ai_observability.view','branding.app.view');
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT profile.id,role.id,scope.company_id,scope.branch_id,true
FROM (VALUES
 ('78020000-0000-4000-8000-000000000001'::uuid,NULL::bigint,NULL::bigint),
 ('78020000-0000-4000-8000-000000000002'::uuid,920001,920011)
) scope(auth_id,company_id,branch_id)
JOIN public.user_profiles profile ON profile.auth_user_id=scope.auth_id
JOIN public.roles role ON role.role_code='fa_package2_setup_reader';

CREATE FUNCTION pg_temp.fa_setup_actor(p_actor text) RETURNS text
LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'sub','78020000-0000-4000-8000-00000000000'||p_actor,
  'session_id','78020000-0000-4000-8001-00000000000'||p_actor)::text,true);
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.fa_setup_actor('1') AS claims \gset
DO $test$
BEGIN
 IF public.fa_read_ai_setup_feature('ERP_AI_DAILY_DASHBOARD') IS DISTINCT FROM 'disabled'
  OR public.fa_read_ai_setup_feature('DMS_AI_OBSERVABILITY') IS DISTINCT FROM 'disabled' THEN
  RAISE EXCEPTION 'Global readers cannot see their verified disabled feature states';
 END IF;
 IF EXISTS(SELECT 1 FROM public.erp_ai_feature_flags) THEN
  RAISE EXCEPTION 'Narrow feature availability expanded the settings inventory';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.erp_app_branding_settings WHERE settings_code='DEFAULT_APP_BRANDING' AND is_active) THEN
  RAISE EXCEPTION 'The Global branding authority cannot read the installed default';
 END IF;
 BEGIN
  PERFORM public.fa_read_ai_setup_feature('AI_SEARCH');
  RAISE EXCEPTION 'Unrelated flag read accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
END $test$;

SELECT pg_temp.fa_setup_actor('2') AS claims \gset
DO $test$
DECLARE code text;
BEGIN
 FOREACH code IN ARRAY ARRAY['ERP_AI_DAILY_DASHBOARD','DMS_AI_OBSERVABILITY'] LOOP
  BEGIN
   PERFORM public.fa_read_ai_setup_feature(code);
   RAISE EXCEPTION 'Branch-only role obtained Global setup state';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
 END LOOP;
 IF EXISTS(SELECT 1 FROM public.erp_app_branding_settings WHERE settings_code='DEFAULT_APP_BRANDING') THEN
  RAISE EXCEPTION 'Branch-only role obtained Global app branding';
 END IF;
END $test$;
RESET ROLE;

DELETE FROM public.erp_ai_feature_flags WHERE feature_code='ERP_AI_DAILY_DASHBOARD';
SET LOCAL ROLE authenticated;
SELECT pg_temp.fa_setup_actor('1') AS claims \gset
DO $test$
BEGIN
 IF public.fa_read_ai_setup_feature('ERP_AI_DAILY_DASHBOARD') IS DISTINCT FROM 'setup_required'
   OR public.fa_read_ai_setup_feature('DMS_AI_OBSERVABILITY') IS DISTINCT FROM 'disabled' THEN
  RAISE EXCEPTION 'Missing and configured-disabled features were merged';
 END IF;
END $test$;
RESET ROLE;
UPDATE auth.sessions SET not_after=now()-interval '1 hour'
WHERE id='78020000-0000-4000-8001-000000000001';
SET LOCAL ROLE authenticated;
DO $test$
BEGIN
 BEGIN
  PERFORM public.fa_read_ai_setup_feature('DMS_AI_OBSERVABILITY');
  RAISE EXCEPTION 'Expired session retained feature setup access';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $test$;
RESET ROLE;

SELECT 'PASS setup defaults, catalogue gates, global-only narrow flag reads and missing versus disabled';
ROLLBACK;
