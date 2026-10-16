-- Historical PG17 baseline grants browser roles MAINTAIN on raw branding.
-- F06 removed CRUD but not MAINTAIN. Dxt observed in the failed replay was a
-- restoration artifact: this migration deliberately REJECTS that preimage.
-- Apply after the exact reviewed predecessor set, before template selection.
BEGIN;
SET LOCAL search_path=pg_catalog;
SET LOCAL lock_timeout='3s';
SET LOCAL statement_timeout='30s';
DO $branding_acl$
DECLARE
 v_relation record;
 v_acl text[];
 v_role text;
 v_oid oid;
 v_has_maintain boolean;
 v_before jsonb;
 v_after jsonb;
 v_snapshot_sql constant text := $snapshot$
  SELECT jsonb_build_object(
   'rawRelation',(SELECT to_jsonb(c)-'relacl' FROM pg_class c WHERE c.oid='public.erp_report_branding_profiles'::regclass),
   'columns',(SELECT jsonb_agg(to_jsonb(a) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a WHERE a.attrelid IN
    ('public.erp_report_branding_profiles'::regclass,'public.erp_report_templates'::regclass,'public.erp_report_branding_profiles_safe'::regclass)),
   'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_policy p WHERE p.polrelid IN
    ('public.erp_report_branding_profiles'::regclass,'public.erp_report_templates'::regclass)),
   'readRelations',(SELECT jsonb_agg(to_jsonb(c) ORDER BY c.oid) FROM pg_class c WHERE c.oid IN
    ('public.erp_report_templates'::regclass,'public.erp_report_branding_profiles_safe'::regclass)),
   'safeProjection',pg_get_viewdef('public.erp_report_branding_profiles_safe'::regclass,false),
   'authority',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.oid IN
    ('erp_private.report_branding_permission(text,bigint)'::regprocedure,
     'erp_private.can_read_report_branding(bigint)'::regprocedure,
     'erp_private.can_read_report_template_branding(bigint)'::regprocedure)),
   'defaults',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_default_acl d),
   'roles',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.oid) FROM pg_roles r),
   'memberships',(SELECT jsonb_agg(to_jsonb(m) ORDER BY m.roleid,m.member) FROM pg_auth_members m));
 $snapshot$;
BEGIN
 IF current_user<>'postgres' THEN RAISE EXCEPTION 'Branding ACL requires reviewed postgres owner'; END IF;
 -- No MAINTAIN keyword is parsed on older engines. Only the observed PG17
 -- preimage is admitted; a different major/version needs its own native review.
 IF current_setting('server_version_num')::integer<170000
  OR current_setting('server_version_num')::integer>=180000
 THEN RAISE EXCEPTION 'Branding ACL requires reviewed PostgreSQL 17 preimage'; END IF;
 IF to_regclass('public.perf_report_template_selection') IS NOT NULL
 THEN RAISE EXCEPTION 'Branding ACL must precede template selection'; END IF;
 SELECT * INTO v_relation FROM pg_class WHERE oid=to_regclass('public.erp_report_branding_profiles');
 IF v_relation.oid IS NULL OR v_relation.relkind<>'r' OR v_relation.relowner<>'postgres'::regrole
  OR NOT v_relation.relrowsecurity OR NOT v_relation.relforcerowsecurity
 THEN RAISE EXCEPTION 'Branding ACL raw relation boundary changed'; END IF;
 SELECT array_agg(a::text ORDER BY a::text) INTO v_acl FROM unnest(v_relation.relacl) a;
 IF v_acl IS DISTINCT FROM ARRAY['anon=m/postgres','authenticated=m/postgres',
   'postgres=arwdDxtm/postgres','service_role=arwdDxtm/postgres']::text[]
 THEN RAISE EXCEPTION 'Branding ACL requires exact historical MAINTAIN-only browser grants'; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid=v_relation.oid AND attacl IS NOT NULL)
 THEN RAISE EXCEPTION 'Branding ACL unexpected column grant'; END IF;
 FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_table_privilege(v_role,v_relation.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   OR has_any_column_privilege(v_role,v_relation.oid,'SELECT,INSERT,UPDATE,REFERENCES')
  THEN RAISE EXCEPTION 'Branding ACL unexpected effective browser privilege'; END IF;
 END LOOP;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.erp_report_templates')
   AND relkind='r' AND relowner='postgres'::regrole AND relrowsecurity)
  OR NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('public.erp_report_branding_profiles_safe')
   AND relkind='v' AND relowner='postgres'::regrole AND reloptions @> ARRAY['security_barrier=true']
   AND NOT reloptions @> ARRAY['security_invoker=true'])
 THEN RAISE EXCEPTION 'Branding ACL protected read boundary changed'; END IF;
 EXECUTE v_snapshot_sql INTO v_before;
 -- ALL includes PG17 MAINTAIN. No explicit column grants are admitted above.
 -- Only the two m grants may be removed; no CASCADE or other object changes.
 EXECUTE 'REVOKE ALL ON TABLE public.erp_report_branding_profiles FROM PUBLIC, anon, authenticated RESTRICT';
 SELECT array_agg(a::text ORDER BY a::text) INTO v_acl
 FROM pg_class c CROSS JOIN LATERAL unnest(c.relacl) a WHERE c.oid=v_relation.oid;
 IF v_acl IS DISTINCT FROM ARRAY['postgres=arwdDxtm/postgres','service_role=arwdDxtm/postgres']::text[]
 THEN RAISE EXCEPTION 'Branding ACL protected owner or service grants changed'; END IF;
 FOREACH v_role IN ARRAY ARRAY['anon','authenticated'] LOOP
  IF has_table_privilege(v_role,v_relation.oid,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
   OR has_any_column_privilege(v_role,v_relation.oid,'SELECT,INSERT,UPDATE,REFERENCES')
   OR EXISTS(SELECT 1 FROM pg_class c CROSS JOIN LATERAL aclexplode(c.relacl) a
    WHERE c.oid IN ('public.erp_report_branding_profiles'::regclass,'public.erp_report_templates'::regclass,
      'public.erp_report_branding_profiles_safe'::regclass)
     AND a.privilege_type='MAINTAIN' AND (CASE WHEN a.grantee=0 THEN true
      ELSE pg_has_role(v_role,a.grantee,'USAGE') END))
  THEN RAISE EXCEPTION 'Branding ACL browser privilege remains'; END IF;
  -- pg_maintain grants authority without a relation ACL entry. Resolve the
  -- effective privilege only after the PG17 guard, including inherited roles.
  FOREACH v_oid IN ARRAY ARRAY['public.erp_report_branding_profiles'::regclass::oid,
   'public.erp_report_templates'::regclass::oid,'public.erp_report_branding_profiles_safe'::regclass::oid] LOOP
   EXECUTE 'SELECT pg_catalog.has_table_privilege($1,$2,''MAINTAIN'')'
    INTO v_has_maintain USING v_role,v_oid;
   IF v_has_maintain IS DISTINCT FROM false
   THEN RAISE EXCEPTION 'Branding ACL effective maintenance authority remains'; END IF;
  END LOOP;
 END LOOP;
 EXECUTE v_snapshot_sql INTO v_after;
 IF v_after IS DISTINCT FROM v_before
 THEN RAISE EXCEPTION 'Branding ACL changed protected schema or authority'; END IF;
END $branding_acl$;
COMMIT;
