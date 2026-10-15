BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='8s';
-- Read-only set membership reuses the preceding reviewed recruitment scope
-- projections. No mutation policy, role assignment or grant is changed.
DO $preimage$
DECLARE expected record; actual record; acl text[];
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Reviewed migration owner required'; END IF;
 FOR expected IN SELECT * FROM (VALUES
 ('erp_private.onboarding_permission(bigint,bigint,text)','76dddd0f7bbfc2690370c8d4bc203c8a'),
 ('erp_private.read_hr_candidates()','20f3b50f8cb7f24451e8dabdccb3d7ca'),
 ('erp_private.read_hr_job_requisitions()','db304616db69807daff544fbb9c20ab3'),
 ('erp_private.recruitment_scope(bigint,bigint,text)','f4df364cdbc2dc54f06fa891e985c19f'),
 ('erp_private.readable_employee_ids()','bc725a99d93ad584f0397033eacbdfd1'),
 ('public.current_user_can_view_employee(bigint)','80500374fc013e8ba0f345cfd394f2e1')) t(signature,source_hash) LOOP
  SELECT * INTO STRICT actual FROM pg_proc WHERE oid=to_regprocedure(expected.signature);
  SELECT array_agg(entry::text ORDER BY entry::text) INTO acl FROM unnest(actual.proacl) entry;
  IF actual.prosecdef IS DISTINCT FROM (expected.signature<>'public.current_user_can_view_employee(bigint)')
   OR actual.proretset IS DISTINCT FROM (expected.signature IN ('erp_private.read_hr_candidates()','erp_private.read_hr_job_requisitions()','erp_private.readable_employee_ids()'))
   OR actual.prorettype<>(CASE expected.signature WHEN 'erp_private.read_hr_candidates()' THEN 'public.hr_candidates'::regtype WHEN 'erp_private.read_hr_job_requisitions()' THEN 'public.hr_job_requisitions'::regtype WHEN 'erp_private.readable_employee_ids()' THEN 'bigint'::regtype ELSE 'boolean'::regtype END)
   OR actual.prolang<>(SELECT oid FROM pg_language WHERE lanname='sql') OR actual.prokind<>'f' OR actual.proisstrict OR actual.proleakproof OR actual.proparallel<>'u'
   OR actual.prosqlbody IS NOT NULL OR actual.probin IS NOT NULL OR actual.prosupport<>0 OR actual.provariadic<>0
   OR acl IS DISTINCT FROM (SELECT array_agg(entry ORDER BY entry) FROM unnest(CASE WHEN expected.signature='public.current_user_can_view_employee(bigint)' THEN ARRAY['=X/postgres','postgres=X/postgres','anon=X/postgres','authenticated=X/postgres','service_role=X/postgres'] ELSE ARRAY['postgres=X/postgres','authenticated=X/postgres'] END)entry)
   OR md5(actual.prosrc)<>expected.source_hash OR pg_get_userbyid(actual.proowner)<>'postgres'
   OR actual.provolatile<>'s' OR actual.proconfig IS DISTINCT FROM ARRAY['search_path=""']::text[]
  THEN RAISE EXCEPTION 'Recruitment child authority prerequisite drift'; END IF;
 END LOOP;
 FOR expected IN SELECT * FROM (VALUES
 ('hr_interviews','hr_interviews_select', '(erp_private.candidate_permission(candidate_id, ''hr.recruitment.view''::text) AND ((requisition_id IS NULL) OR erp_private.requisition_permission(requisition_id, ''hr.recruitment.view''::text)))'),
 ('hr_onboarding_tasks','hr_onboarding_tasks_select','erp_private.onboarding_permission(candidate_id, employee_id, ''hr.recruitment.view''::text)')) t(table_name,policy_name,predicate) LOOP
  SELECT * INTO STRICT actual FROM pg_policies WHERE schemaname='public' AND tablename=expected.table_name AND policyname=expected.policy_name;
  IF actual.qual<>expected.predicate OR actual.permissive<>'PERMISSIVE' OR actual.cmd<>'SELECT' OR actual.roles<>ARRAY['authenticated']::name[] OR actual.with_check IS NOT NULL
  THEN RAISE EXCEPTION 'Recruitment child SELECT policy drift'; END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid=to_regclass('public.'||expected.table_name) AND c.relrowsecurity)
   OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=expected.table_name AND policyname='f03_principal' AND permissive='RESTRICTIVE' AND cmd='ALL' AND roles=ARRAY['authenticated']::name[] AND qual='( SELECT erp_private.business_principal_is_active() AS business_principal_is_active)')
  THEN RAISE EXCEPTION 'Recruitment child restrictive principal gate drift'; END IF;
 END LOOP;
END $preimage$;
ALTER POLICY hr_interviews_select ON public.hr_interviews USING (
 candidate_id IN (SELECT id FROM erp_private.read_hr_candidates())
 AND (requisition_id IS NULL OR requisition_id IN (SELECT id FROM erp_private.read_hr_job_requisitions()))
);
ALTER POLICY hr_onboarding_tasks_select ON public.hr_onboarding_tasks USING (
 (SELECT erp_private.business_principal_is_active()) AND
 CASE WHEN candidate_id IS NULL AND employee_id IS NULL THEN (SELECT erp_private.recruitment_scope(NULL,NULL,'hr.recruitment.view'))
 ELSE (candidate_id IS NULL OR candidate_id IN (SELECT id FROM erp_private.read_hr_candidates()))
 AND (employee_id IS NULL OR employee_id IN (
  WITH visible_employees AS MATERIALIZED (
   SELECT e.id,e.owner_company_id,e.branch_id FROM public.employees e
   WHERE e.deleted_at IS NULL AND e.id IN (SELECT erp_private.readable_employee_ids())
  ), pairs AS MATERIALIZED (SELECT DISTINCT owner_company_id,branch_id FROM visible_employees),
  allowed AS MATERIALIZED (
   SELECT owner_company_id,branch_id,erp_private.recruitment_scope(owner_company_id,branch_id,'hr.recruitment.view') AS can_view FROM pairs
  ) SELECT e.id FROM visible_employees e JOIN allowed a
   ON a.owner_company_id IS NOT DISTINCT FROM e.owner_company_id AND a.branch_id IS NOT DISTINCT FROM e.branch_id WHERE a.can_view
 )) END
);
COMMIT;
