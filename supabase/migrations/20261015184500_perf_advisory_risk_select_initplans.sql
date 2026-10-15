BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='8s';
-- Statement-local evaluation of three STABLE, row-independent predicates.
-- No function body, subject rule, role assignment, write policy or ACL changes.
DO $preimage$
DECLARE policy record; helper record;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed migration owner required'; END IF;
 SELECT * INTO STRICT policy FROM pg_policies WHERE schemaname='public' AND tablename='erp_ai_risk_scores' AND policyname='erp_ai_risk_scores_select';
 IF policy.cmd<>'SELECT' OR policy.permissive<>'PERMISSIVE' OR policy.roles<>ARRAY['public']::name[] OR policy.with_check IS NOT NULL
  OR replace(policy.qual,'public.','')<>$predicate$((deleted_at IS NULL) AND (current_user_has_permission('ai.risk.view'::text) OR current_user_has_permission('ai.common.admin'::text) OR current_user_has_role('system_admin'::text)))$predicate$
  OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='erp_ai_risk_scores')<>4
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.erp_ai_risk_scores'::regclass AND relrowsecurity AND relowner='postgres'::regrole)
  OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='erp_ai_risk_scores' AND policyname='f03_principal' AND cmd='ALL' AND permissive='RESTRICTIVE' AND roles=ARRAY['authenticated']::name[] AND qual='( SELECT erp_private.business_principal_is_active() AS business_principal_is_active)' AND with_check=qual)
 THEN RAISE EXCEPTION 'Risk SELECT authority preimage changed'; END IF;
 FOR helper IN SELECT p.* FROM pg_proc p WHERE p.oid IN('public.current_user_has_permission(text)'::regprocedure,'public.current_user_has_role(text)'::regprocedure) LOOP
  IF helper.provolatile<>'s' OR helper.prorettype<>'boolean'::regtype OR helper.proretset OR helper.pronargs<>1 THEN RAISE EXCEPTION 'Statement-stable boolean permission predicates required'; END IF;
 END LOOP;
 PERFORM set_config('perf_risk_select.preimage',jsonb_build_object(
  'policies',(SELECT jsonb_agg(CASE WHEN policyname='erp_ai_risk_scores_select' THEN to_jsonb(p)-'qual' ELSE to_jsonb(p) END ORDER BY policyname)FROM pg_policies p WHERE schemaname='public' AND tablename='erp_ai_risk_scores'),
  'table',(SELECT jsonb_build_array(relowner,relacl::text,relrowsecurity,relforcerowsecurity)FROM pg_class WHERE oid='public.erp_ai_risk_scores'::regclass),
  'functions',(SELECT jsonb_agg(to_jsonb(p)ORDER BY oid)FROM pg_proc p WHERE oid IN('public.current_user_has_permission(text)'::regprocedure,'public.current_user_has_role(text)'::regprocedure,'erp_private.business_principal_is_active()'::regprocedure))
 )::text,true);
END $preimage$;
ALTER POLICY erp_ai_risk_scores_select ON public.erp_ai_risk_scores USING (
 deleted_at IS NULL AND (
  (SELECT public.current_user_has_permission('ai.risk.view'))
  OR (SELECT public.current_user_has_permission('ai.common.admin'))
  OR (SELECT public.current_user_has_role('system_admin'))
 )
);
DO $postimage$
BEGIN
 IF jsonb_build_object(
  'policies',(SELECT jsonb_agg(CASE WHEN policyname='erp_ai_risk_scores_select' THEN to_jsonb(p)-'qual' ELSE to_jsonb(p) END ORDER BY policyname)FROM pg_policies p WHERE schemaname='public' AND tablename='erp_ai_risk_scores'),
  'table',(SELECT jsonb_build_array(relowner,relacl::text,relrowsecurity,relforcerowsecurity)FROM pg_class WHERE oid='public.erp_ai_risk_scores'::regclass),
  'functions',(SELECT jsonb_agg(to_jsonb(p)ORDER BY oid)FROM pg_proc p WHERE oid IN('public.current_user_has_permission(text)'::regprocedure,'public.current_user_has_role(text)'::regprocedure,'erp_private.business_principal_is_active()'::regprocedure))
 ) IS DISTINCT FROM current_setting('perf_risk_select.preimage')::jsonb THEN RAISE EXCEPTION 'Risk authority changed beyond SELECT evaluation shape'; END IF;
END $postimage$;
COMMIT;
