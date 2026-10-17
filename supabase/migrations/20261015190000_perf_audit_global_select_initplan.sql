BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='8s';
-- Cache only the row-independent global-admin check for this statement.
-- Company and branch predicates retain their original row arguments/evaluation.
DO $preimage$
DECLARE policy record; helper pg_proc;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed migration owner required'; END IF;
 SELECT * INTO STRICT policy FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND policyname='audit_logs_select';
 SELECT * INTO STRICT helper FROM pg_proc WHERE oid='public.current_user_is_global_admin()'::regprocedure;
 IF helper.provolatile<>'s' OR helper.prorettype<>'boolean'::regtype OR helper.proretset OR helper.pronargs<>0 THEN RAISE EXCEPTION 'Statement-stable global predicate required'; END IF;
 IF policy.cmd<>'SELECT' OR policy.permissive<>'PERMISSIVE' OR policy.roles<>ARRAY['authenticated']::name[] OR policy.with_check IS NOT NULL
  OR replace(policy.qual,'public.','')<>$predicate$(current_user_is_global_admin() OR current_user_has_permission_in_company('audit.view'::text, owner_company_id) OR ((branch_id IS NOT NULL) AND current_user_has_permission_in_branch('audit.view'::text, branch_id)))$predicate$
  OR (SELECT count(*)FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs')<>3
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.audit_logs'::regclass AND relrowsecurity AND relowner='postgres'::regrole)
  OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND policyname='f03_principal' AND cmd='ALL' AND permissive='RESTRICTIVE' AND roles=ARRAY['authenticated']::name[] AND qual='( SELECT erp_private.business_principal_is_active() AS business_principal_is_active)' AND with_check=qual)
 THEN RAISE EXCEPTION 'Audit SELECT authority preimage changed'; END IF;
 PERFORM set_config('perf_audit_select.preimage',jsonb_build_object(
  'policies',(SELECT jsonb_agg(CASE WHEN policyname='audit_logs_select' THEN to_jsonb(p)-'qual' ELSE to_jsonb(p) END ORDER BY policyname)FROM pg_policies p WHERE schemaname='public' AND tablename='audit_logs'),
  'table',(SELECT jsonb_build_array(relowner,relacl::text,relrowsecurity,relforcerowsecurity)FROM pg_class WHERE oid='public.audit_logs'::regclass),
  'functions',(SELECT jsonb_agg(to_jsonb(p)ORDER BY oid)FROM pg_proc p WHERE oid IN('public.current_user_is_global_admin()'::regprocedure,'public.current_user_has_permission_in_company(text,bigint)'::regprocedure,'public.current_user_has_permission_in_branch(text,bigint)'::regprocedure,'erp_private.business_principal_is_active()'::regprocedure))
 )::text,true);
END $preimage$;
ALTER POLICY audit_logs_select ON public.audit_logs USING (
 (SELECT public.current_user_is_global_admin())
 OR public.current_user_has_permission_in_company('audit.view',owner_company_id)
 OR (branch_id IS NOT NULL AND public.current_user_has_permission_in_branch('audit.view',branch_id))
);
DO $postimage$
BEGIN
 IF jsonb_build_object(
  'policies',(SELECT jsonb_agg(CASE WHEN policyname='audit_logs_select' THEN to_jsonb(p)-'qual' ELSE to_jsonb(p) END ORDER BY policyname)FROM pg_policies p WHERE schemaname='public' AND tablename='audit_logs'),
  'table',(SELECT jsonb_build_array(relowner,relacl::text,relrowsecurity,relforcerowsecurity)FROM pg_class WHERE oid='public.audit_logs'::regclass),
  'functions',(SELECT jsonb_agg(to_jsonb(p)ORDER BY oid)FROM pg_proc p WHERE oid IN('public.current_user_is_global_admin()'::regprocedure,'public.current_user_has_permission_in_company(text,bigint)'::regprocedure,'public.current_user_has_permission_in_branch(text,bigint)'::regprocedure,'erp_private.business_principal_is_active()'::regprocedure))
 ) IS DISTINCT FROM current_setting('perf_audit_select.preimage')::jsonb THEN RAISE EXCEPTION 'Audit authority changed beyond SELECT evaluation shape'; END IF;
END $postimage$;
COMMIT;
