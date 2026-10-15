BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='8s';
-- PERF-P04 compliance reads: exact F03 employee/capability sets, evaluated
-- once per statement. Original write gates and medical field masking remain.
DO $authority_contract$
DECLARE expected record; actual pg_catalog.pg_proc; acl text[];
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Reviewed compliance migration owner required'; END IF;
 FOR expected IN SELECT * FROM (VALUES
 ('erp_private.business_principal_is_active()','13bc54e6c909a2635599b2f45fc5eda6',true,false,'search_path=""',ARRAY['postgres=X/postgres','authenticated=X/postgres','service_role=X/postgres']),
 ('erp_private.employee_permission(bigint,text)','085fd40f2b0b84e88328b3a824fd5390',true,false,'search_path=""',ARRAY['postgres=X/postgres','authenticated=X/postgres']),
 ('erp_private.readable_employee_ids()','bc725a99d93ad584f0397033eacbdfd1',true,true,'search_path=""',ARRAY['postgres=X/postgres','authenticated=X/postgres']),
 ('public.current_user_can_view_employee(bigint)','80500374fc013e8ba0f345cfd394f2e1',false,false,'search_path=""',ARRAY['=X/postgres','postgres=X/postgres','anon=X/postgres','authenticated=X/postgres','service_role=X/postgres']),
 ('public.current_user_can_view_employee_payroll(bigint)','7db55ab7bd543a676e84be604faf676c',false,false,'search_path=""',ARRAY['=X/postgres','postgres=X/postgres','anon=X/postgres','authenticated=X/postgres','service_role=X/postgres']),
 ('public.current_user_has_permission_any_scope(text)','4e7bd1d214481464f237f8e57cdf09c3',true,false,'search_path=pg_catalog, public, pg_temp',ARRAY['postgres=X/postgres','anon=X/postgres','authenticated=X/postgres','service_role=X/postgres']),
 ('public.current_user_is_global_admin()','5375091be37487c37872452fa3837466',true,false,'search_path=pg_catalog, public, pg_temp',ARRAY['postgres=X/postgres','anon=X/postgres','authenticated=X/postgres','service_role=X/postgres']),
 ('public.current_user_profile_id()','3ae97eed6dcb16e61291a1b8a5998b21',true,false,'search_path=""',ARRAY['postgres=X/postgres','anon=X/postgres','authenticated=X/postgres','service_role=X/postgres']),
 ('public.f03_current_session_valid()','6e43c86c180b25b6cca9369a90e72ecd',false,false,'search_path=""',ARRAY['postgres=X/postgres','authenticated=X/postgres','service_role=X/postgres']),
 ('public.f03_has_employee_permission(bigint,text)','c66dc2fbf6df571bbf53aef0df23d5e9',false,false,'search_path=""',ARRAY['postgres=X/postgres','authenticated=X/postgres'])
 ) e(signature,source_hash,definer,returns_set,configuration,privileges) LOOP
  SELECT * INTO STRICT actual FROM pg_catalog.pg_proc WHERE oid=pg_catalog.to_regprocedure(expected.signature);
  SELECT array_agg(entry::text ORDER BY entry::text) INTO acl FROM unnest(actual.proacl) entry;
  IF md5(actual.prosrc)<>expected.source_hash OR pg_catalog.pg_get_userbyid(actual.proowner)<>'postgres'
   OR actual.prosecdef<>expected.definer OR actual.proretset<>expected.returns_set OR actual.provolatile<>'s'
   OR actual.proconfig IS DISTINCT FROM ARRAY[expected.configuration]::text[]
   OR actual.prorettype<>(CASE WHEN expected.signature IN ('erp_private.readable_employee_ids()','public.current_user_profile_id()') THEN 'bigint'::regtype ELSE 'boolean'::regtype END)
   OR actual.prolang<>(SELECT oid FROM pg_catalog.pg_language WHERE lanname='sql')
   OR actual.prokind<>'f' OR actual.proisstrict OR actual.proleakproof OR actual.proparallel<>'u'
   OR actual.prosqlbody IS NOT NULL OR actual.probin IS NOT NULL OR actual.prosupport<>0 OR actual.provariadic<>0
   OR acl IS DISTINCT FROM (SELECT array_agg(entry ORDER BY entry) FROM unnest(expected.privileges) entry)
  THEN RAISE EXCEPTION 'Compliance authority metadata differs: %',expected.signature; END IF;
 END LOOP;
END $authority_contract$;
DO $compliance_preimage$
DECLARE p record; actual record;
BEGIN
 IF to_regprocedure('erp_private.compliance_subject_ids(text)') IS NOT NULL THEN RAISE EXCEPTION 'Compliance read helper already exists'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='erp_private.read_employee_dependents()'::regprocedure
  AND proretset AND prorettype='public.employee_dependents'::regtype AND prolang=(SELECT oid FROM pg_language WHERE lanname='sql')
  AND prokind='f' AND NOT proisstrict AND NOT proleakproof AND proparallel='u' AND prosqlbody IS NULL AND probin IS NULL AND prosupport=0 AND provariadic=0
  AND md5(prosrc)='894787224b2c0d3b163c367bb19fc290' AND prosecdef AND provolatile='s'
  AND pg_get_userbyid(proowner)='postgres' AND proconfig=ARRAY['search_path=""']::text[]
  AND proacl=ARRAY['postgres=X/postgres','authenticated=X/postgres']::aclitem[])
 OR NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid='public.current_user_can_view_employee_medical(bigint)'::regprocedure
  AND NOT proretset AND prorettype='boolean'::regtype AND prolang=(SELECT oid FROM pg_language WHERE lanname='sql')
  AND prokind='f' AND NOT proisstrict AND NOT proleakproof AND proparallel='u' AND prosqlbody IS NULL AND probin IS NULL AND prosupport=0 AND provariadic=0
  AND md5(prosrc)='ec518513e6b9594c908a77caf204554f' AND NOT prosecdef AND provolatile='s'
  AND pg_get_userbyid(proowner)='postgres' AND proconfig=ARRAY['search_path=""']::text[])
 THEN RAISE EXCEPTION 'Compliance projection authority drift'; END IF;
 FOR p IN SELECT * FROM (VALUES
 ('employee_identity_documents','emp_id_doc_select',false),
 ('employee_access_cards','emp_ac_select',false),
 ('employee_dependents','emp_dep_select',false),
 ('employee_training_certificates','emp_tc_select',false),
 ('employee_medical_insurances','emp_ins_select',true),
 ('employee_medical_records','emp_med_select',true)) t(table_name,policy_name,medical) LOOP
  SELECT * INTO STRICT actual FROM pg_policies WHERE schemaname='public' AND tablename=p.table_name AND policyname=p.policy_name;
  IF actual.cmd<>'SELECT' OR actual.permissive<>'PERMISSIVE' OR actual.roles<>ARRAY['authenticated']::name[] OR actual.with_check IS NOT NULL
   OR actual.qual<>(CASE WHEN p.medical THEN 'public.current_user_can_view_employee_medical(employee_id)'
    ELSE '(public.current_user_can_view_employee(employee_id) AND erp_private.employee_permission(employee_id, ''hr.compliance.view''::text))' END)
   OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||p.table_name) AND relrowsecurity AND relforcerowsecurity)
  THEN RAISE EXCEPTION 'Compliance SELECT or RLS preimage drift'; END IF;
 END LOOP;
END $compliance_preimage$;
CREATE FUNCTION erp_private.compliance_subject_ids(capability text)
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH actor AS MATERIALIZED (
  SELECT p.id,p.owner_company_id,p.branch_id FROM public.user_profiles p
  WHERE p.auth_user_id=(SELECT auth.uid()) AND (SELECT erp_private.business_principal_is_active())
   AND $1 IN ('hr.compliance.view','hr.medical.view')
 ), identity_link AS MATERIALIZED (
  SELECT l.employee_id FROM public.erp_user_employee_links l JOIN actor a ON a.id=l.user_profile_id
  JOIN public.employees e ON e.id=l.employee_id AND e.deleted_at IS NULL
   AND e.owner_company_id=a.owner_company_id AND e.branch_id IS NOT DISTINCT FROM a.branch_id
 ), grants AS MATERIALIZED (
  SELECT ur.owner_company_id,ur.branch_id,p.permission_code FROM public.user_roles ur
  JOIN actor a ON a.id=ur.user_profile_id JOIN public.roles r ON r.id=ur.role_id AND r.is_active
  JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions p ON p.id=rp.permission_id AND p.is_active
  WHERE ur.is_active AND p.permission_code IN ($1,$1||'.self',$1||'.team')
 )
 SELECT e.id FROM public.employees e WHERE e.deleted_at IS NULL AND EXISTS(SELECT 1 FROM actor)
  AND ((SELECT public.current_user_is_global_admin()) OR EXISTS(
   SELECT 1 FROM grants g WHERE ((g.owner_company_id IS NULL AND g.branch_id IS NULL)
    OR (g.owner_company_id=e.owner_company_id AND (g.branch_id IS NULL OR g.branch_id=e.branch_id)))
    AND (g.permission_code=$1 OR (g.permission_code=$1||'.self' AND e.id IN(SELECT employee_id FROM identity_link))
     OR (g.permission_code=$1||'.team' AND e.reporting_manager_id IN(SELECT employee_id FROM identity_link) AND e.id<>e.reporting_manager_id))));
$$;
REVOKE ALL ON FUNCTION erp_private.compliance_subject_ids(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.compliance_subject_ids(text) TO authenticated;

ALTER POLICY emp_id_doc_select ON public.employee_identity_documents USING(employee_id IN(SELECT erp_private.readable_employee_ids()) AND employee_id IN(SELECT erp_private.compliance_subject_ids('hr.compliance.view')));
ALTER POLICY emp_ac_select ON public.employee_access_cards USING(employee_id IN(SELECT erp_private.readable_employee_ids()) AND employee_id IN(SELECT erp_private.compliance_subject_ids('hr.compliance.view')));
ALTER POLICY emp_dep_select ON public.employee_dependents USING(employee_id IN(SELECT erp_private.readable_employee_ids()) AND employee_id IN(SELECT erp_private.compliance_subject_ids('hr.compliance.view')));
ALTER POLICY emp_tc_select ON public.employee_training_certificates USING(employee_id IN(SELECT erp_private.readable_employee_ids()) AND employee_id IN(SELECT erp_private.compliance_subject_ids('hr.compliance.view')));
ALTER POLICY emp_ins_select ON public.employee_medical_insurances USING(employee_id IN(SELECT erp_private.readable_employee_ids()) AND employee_id IN(SELECT erp_private.compliance_subject_ids('hr.medical.view')));
ALTER POLICY emp_med_select ON public.employee_medical_records USING(employee_id IN(SELECT erp_private.readable_employee_ids()) AND employee_id IN(SELECT erp_private.compliance_subject_ids('hr.medical.view')));
CREATE OR REPLACE FUNCTION erp_private.read_employee_dependents()
RETURNS SETOF public.employee_dependents LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $dependent$
 WITH visible AS MATERIALIZED (SELECT erp_private.readable_employee_ids() AS id),
 compliance AS MATERIALIZED (SELECT erp_private.compliance_subject_ids('hr.compliance.view') AS id),
 medical AS MATERIALIZED (SELECT erp_private.compliance_subject_ids('hr.medical.view') AS id)
 SELECT projected.* FROM public.employee_dependents d
 CROSS JOIN LATERAL jsonb_populate_record(NULL::public.employee_dependents,
  CASE WHEN d.employee_id IN(SELECT id FROM medical) THEN to_jsonb(d)
  ELSE to_jsonb(d)-ARRAY['medical_insurance_provider','medical_insurance_policy','medical_insurance_card','medical_insurance_expiry'] END) AS projected
 WHERE (SELECT auth.uid()) IS NOT NULL AND (SELECT erp_private.business_principal_is_active())
 AND d.deleted_at IS NULL AND d.employee_id IN(SELECT id FROM visible) AND d.employee_id IN(SELECT id FROM compliance);
$dependent$;
COMMIT;
