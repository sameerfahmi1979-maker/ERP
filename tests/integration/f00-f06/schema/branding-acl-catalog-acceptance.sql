-- Additional final130 check. Original selector and lineage assertions still run.
BEGIN READ ONLY;
SET LOCAL search_path=pg_catalog;
DO $branding_acl_catalog$
DECLARE v_role text; v_relation record; v_acl text[]; v_oid oid; v_has_maintain boolean;
BEGIN
 SELECT * INTO STRICT v_relation FROM pg_class WHERE oid='public.erp_report_branding_profiles'::regclass;
 IF v_relation.relowner<>'postgres'::regrole OR NOT v_relation.relrowsecurity OR NOT v_relation.relforcerowsecurity
 THEN RAISE EXCEPTION 'Final branding raw ownership or RLS changed'; END IF;
 SELECT array_agg(a::text ORDER BY a::text) INTO v_acl FROM unnest(v_relation.relacl) a;
 IF current_setting('server_version_num')::integer<170000 OR current_setting('server_version_num')::integer>=180000
  OR v_acl IS DISTINCT FROM ARRAY['postgres=arwdDxtm/postgres','service_role=arwdDxtm/postgres']::text[]
 THEN RAISE EXCEPTION 'Final branding protected grants differ'; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=v_relation.oid AND attacl IS NOT NULL)
 THEN RAISE EXCEPTION 'Final branding unexpected column grants'; END IF;
 FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_table_privilege(v_role,v_relation.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   OR has_any_column_privilege(v_role,v_relation.oid,'SELECT,INSERT,UPDATE,REFERENCES')
   OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE c.oid IN ('public.erp_report_branding_profiles'::regclass,'public.erp_report_templates'::regclass,
      'public.erp_report_branding_profiles_safe'::regclass,'public.perf_report_template_selection'::regclass)
     AND a.privilege_type='MAINTAIN' AND (CASE WHEN a.grantee=0 THEN true
      ELSE pg_has_role(v_role,a.grantee,'USAGE') END))
  THEN RAISE EXCEPTION 'Final branding browser direct or maintenance authority remains'; END IF;
  FOREACH v_oid IN ARRAY ARRAY['public.erp_report_branding_profiles'::regclass::oid,
   'public.erp_report_templates'::regclass::oid,'public.erp_report_branding_profiles_safe'::regclass::oid,
   'public.perf_report_template_selection'::regclass::oid] LOOP
   EXECUTE 'SELECT pg_catalog.has_table_privilege($1,$2,''MAINTAIN'')'
    INTO v_has_maintain USING v_role,v_oid;
   IF v_has_maintain IS DISTINCT FROM false
   THEN RAISE EXCEPTION 'Final branding effective maintenance authority remains'; END IF;
  END LOOP;
 END LOOP;
END $branding_acl_catalog$;
SELECT 'PASS: branding ACL catalog (not application acceptance)' AS result;
ROLLBACK;
