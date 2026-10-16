-- Successor qualification for additive131 only. The historical selector catalog
-- asserted the old duplicated point predicate and remains immutable evidence.
-- This file is read-only. Run under reviewed postgres owner, ON_ERROR_STOP.
BEGIN READ ONLY;
SET LOCAL search_path=public,pg_catalog;
SET LOCAL statement_timeout='8s';
DO $template_set_catalog$
DECLARE actual_acl text[]; predicate text;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'FAIL: template set catalog owner'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid=p.prolang
   WHERE p.oid=to_regprocedure('erp_private.readable_report_template_branding_ids()')
   AND p.proowner='postgres'::regrole AND l.lanname='sql' AND p.provolatile='s' AND p.prosecdef
   AND p.proretset AND p.prorettype='bigint'::regtype AND p.pronargs=0 AND NOT p.proleakproof AND NOT p.proisstrict
   AND p.proconfig=ARRAY['search_path=""']
   AND regexp_replace(p.prosrc,'\s+','','g')=regexp_replace($expected$
    SELECT p.id FROM public.erp_report_branding_profiles p
    WHERE (SELECT auth.uid()) IS NOT NULL AND (SELECT erp_private.business_principal_is_active())
      AND erp_private.can_read_report_template_branding(p.id);
   $expected$,'\s+','','g')) THEN RAISE EXCEPTION 'FAIL: template set helper source/metadata'; END IF;
 SELECT array_agg(entry::text ORDER BY entry::text) INTO actual_acl
 FROM pg_proc p CROSS JOIN LATERAL unnest(p.proacl) entry
 WHERE p.oid='erp_private.readable_report_template_branding_ids()'::regprocedure;
 IF actual_acl IS DISTINCT FROM ARRAY['authenticated=X/postgres','postgres=X/postgres']
   OR has_function_privilege('anon','erp_private.readable_report_template_branding_ids()','EXECUTE')
   OR has_function_privilege('service_role','erp_private.readable_report_template_branding_ids()','EXECUTE')
   OR has_schema_privilege('authenticated','erp_private','CREATE') THEN
   RAISE EXCEPTION 'FAIL: template set private execution boundary'; END IF;
 IF (SELECT count(*) FROM pg_policy WHERE polrelid='public.erp_report_templates'::regclass)<>2
   OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.erp_report_templates'::regclass
     AND polname='rpt_templates_select' AND polcmd='r' AND polpermissive AND polroles=ARRAY['authenticated'::regrole::oid]
     AND polwithcheck IS NULL)
   OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.erp_report_templates'::regclass
     AND polname='f03_principal' AND polcmd='*' AND NOT polpermissive AND polroles=ARRAY['authenticated'::regrole::oid]
     AND regexp_replace(pg_get_expr(polqual,polrelid),'[\s()]','','g')='SELECTerp_private.business_principal_is_activeASbusiness_principal_is_active'
     AND pg_get_expr(polwithcheck,polrelid)=pg_get_expr(polqual,polrelid)) THEN
   RAISE EXCEPTION 'FAIL: template set exact policy boundary'; END IF;
 -- Parentheses are authority: preserve AND/OR grouping, not just token order.
 SELECT regexp_replace(pg_get_expr(polqual,polrelid),'\s+','','g') INTO predicate FROM pg_policy
 WHERE polrelid='public.erp_report_templates'::regclass AND polname='rpt_templates_select';
 IF predicate IS DISTINCT FROM
   '((deleted_atISNULL)AND(SELECTerp_private.business_principal_is_active()ASbusiness_principal_is_active)AND(((branding_profile_idISNULL)AND(SELECTerp_private.can_read_report_template_branding(NULL::bigint)AScan_read_report_template_branding))OR(branding_profile_idIN(SELECTallowed.idFROMerp_private.readable_report_template_branding_ids()allowed(id)))))' THEN
   RAISE EXCEPTION 'FAIL: template set exact statement-membership predicate'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.erp_report_templates'::regclass
      AND relowner='postgres'::regrole AND relrowsecurity AND relforcerowsecurity)
   OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.perf_report_template_selection'::regclass
      AND relowner='postgres'::regrole AND reloptions=ARRAY['security_invoker=true','security_barrier=true'])
   -- Derived from the accepted130 native deparse by removing precisely the
   -- redundant point conjunct. Pins joins, conditions, DTO and selectability.
   OR md5(pg_get_viewdef('public.perf_report_template_selection'::regclass,false))<>'9142719031a0fe4936bdd98f97684519'
   OR md5(pg_get_viewdef('public.erp_report_branding_profiles_safe'::regclass,false))<>'60797a9ca7484eba7ab103112c31aec8'
   OR md5((SELECT prosrc FROM pg_proc WHERE oid='erp_private.can_read_report_template_branding(bigint)'::regprocedure))<>'d8ab7c06726c22ed06abd7207d9b1965' THEN
   RAISE EXCEPTION 'FAIL: template set preserved projection/authority'; END IF;
 IF (SELECT array_agg(attname::text ORDER BY attnum) FROM pg_attribute
   WHERE attrelid='public.perf_report_template_selection'::regclass AND attnum>0 AND NOT attisdropped)
   IS DISTINCT FROM ARRAY['id','template_code','template_name','template_type','is_default','governance_status','visual_editor_engine',
     'branding_profile_id','branding_profile_name','branding_profile_type','company_name','logo_url','owner_company_id','selectable'] THEN
   RAISE EXCEPTION 'FAIL: template set minimal metadata columns'; END IF;
 IF NOT has_table_privilege('authenticated','public.perf_report_template_selection','SELECT')
   OR has_table_privilege('anon','public.perf_report_template_selection','SELECT')
   OR has_table_privilege('service_role','public.perf_report_template_selection','SELECT')
   OR has_table_privilege('authenticated','public.erp_report_branding_profiles','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
   OR has_any_column_privilege('authenticated','public.erp_report_branding_profiles','SELECT,INSERT,UPDATE,REFERENCES')
   OR has_any_column_privilege('anon','public.erp_report_branding_profiles','SELECT,INSERT,UPDATE,REFERENCES')
   OR has_any_column_privilege('authenticated','public.erp_report_templates','INSERT,UPDATE,REFERENCES')
   OR has_any_column_privilege('authenticated','public.perf_report_template_selection','INSERT,UPDATE,REFERENCES') THEN
   RAISE EXCEPTION 'FAIL: template set raw/write privacy boundary'; END IF;
END;
$template_set_catalog$;
SELECT 'PASS: template statement-set catalog/ACL/minimal-metadata invariants' AS result;
ROLLBACK;
