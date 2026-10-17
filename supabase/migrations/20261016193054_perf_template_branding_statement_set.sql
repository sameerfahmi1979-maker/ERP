-- Additive successor to the reviewed 130-entry F00-F06 composition.
-- No permission truth, historical migration, protected projection or write rule
-- is replaced. The unchanged F06 point gate is evaluated per branding profile,
-- not per template. Native plans/actor differentials are separate release gates.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, pg_catalog;

DO $template_set_preimage$
DECLARE expected record; actual record; actual_acl text[];
BEGIN
  IF current_user <> 'postgres' OR current_setting('server_version_num')::integer < 170000 THEN
    RAISE EXCEPTION 'Template branding set requires reviewed postgres/PG17 context';
  END IF;
  IF to_regprocedure('erp_private.readable_report_template_branding_ids()') IS NOT NULL THEN
    RAISE EXCEPTION 'Template branding set already exists; reconcile migration history';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE oid='erp_private'::regnamespace
      AND nspowner='postgres'::regrole)
    OR has_schema_privilege('authenticated','erp_private','CREATE')
    OR has_schema_privilege('anon','erp_private','CREATE') THEN
    RAISE EXCEPTION 'Template branding private schema boundary changed';
  END IF;
  -- Exact accepted native preimage. Fixed search_path above makes view deparsing
  -- reproducible; hashes are of source, never of runtime identity or data.
  FOR expected IN SELECT * FROM (VALUES
    ('erp_report_templates','r',true,true,NULL::text[],NULL::text,
      ARRAY['authenticated=r/postgres','postgres=arwdDxtm/postgres','service_role=arwdDxtm/postgres']),
    ('erp_report_branding_profiles','r',true,true,NULL::text[],NULL::text,
      ARRAY['postgres=arwdDxtm/postgres','service_role=arwdDxtm/postgres']),
    ('erp_report_branding_profiles_safe','v',false,false,ARRAY['security_barrier=true'],
      '60797a9ca7484eba7ab103112c31aec8',
      ARRAY['authenticated=r/postgres','postgres=arwdDxtm/postgres','service_role=arwdDxtm/postgres']),
    ('perf_report_template_selection','v',false,false,ARRAY['security_invoker=true','security_barrier=true'],
      '84f50221959f829793bd403d1959048e',
      ARRAY['authenticated=r/postgres','postgres=arwdDxtm/postgres'])
  ) AS v(name,kind,rls,force_rls,options,view_hash,acl)
  LOOP
    SELECT c.* INTO actual FROM pg_class c WHERE c.oid=to_regclass('public.'||expected.name);
    SELECT array_agg(entry::text ORDER BY entry::text) INTO actual_acl FROM unnest(actual.relacl) entry;
    IF actual.oid IS NULL OR actual.relowner<>'postgres'::regrole
      OR actual.relkind::text<>expected.kind OR actual.relrowsecurity<>expected.rls
      OR actual.relforcerowsecurity<>expected.force_rls
      OR actual.reloptions IS DISTINCT FROM expected.options
      OR actual_acl IS DISTINCT FROM expected.acl
      OR (expected.view_hash IS NOT NULL AND md5(pg_get_viewdef(actual.oid,false))<>expected.view_hash)
      OR EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=actual.oid AND a.attacl IS NOT NULL) THEN
      RAISE EXCEPTION 'Template branding relation preimage changed: %',expected.name;
    END IF;
  END LOOP;
  IF has_table_privilege('authenticated','public.erp_report_branding_profiles','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR has_table_privilege('anon','public.erp_report_branding_profiles','SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR has_table_privilege('authenticated','public.erp_report_templates','INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN')
    OR has_table_privilege('anon','public.perf_report_template_selection','SELECT')
    OR has_table_privilege('service_role','public.perf_report_template_selection','SELECT') THEN
    RAISE EXCEPTION 'Template branding effective privilege boundary changed';
  END IF;
  -- Do not replace, inline or reinterpret these live-session/same-assignment
  -- authority functions. Pin their executable metadata and exact native bodies.
  FOR expected IN SELECT * FROM (VALUES
    ('erp_private.business_principal_is_active()','13bc54e6c909a2635599b2f45fc5eda6',true,'boolean',ARRAY['search_path=""'],ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']),
    ('erp_private.session_is_valid()','2f7967c0b825bdf25349226744f74d3a',true,'boolean',ARRAY['search_path=""'],ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']),
    ('erp_private.can_read_report_template_branding(bigint)','d8ab7c06726c22ed06abd7207d9b1965',true,'boolean',ARRAY['search_path=""'],ARRAY['authenticated=X/postgres','postgres=X/postgres']),
    ('erp_private.can_read_report_branding(bigint)','3910d4492dcf5fb725a66240a0477e27',false,'boolean',ARRAY['search_path=""'],ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']),
    ('erp_private.report_branding_permission(text,bigint)','40fc90233dbabd1e5de94c47b28f8a5b',false,'boolean',ARRAY['search_path=""'],ARRAY['authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']),
    ('erp_private.permission_in_scope(text,bigint,bigint)','ce520fb29b4a68564fcbf9285a4a741e',true,'boolean',ARRAY['search_path=""'],ARRAY['authenticated=X/postgres','postgres=X/postgres']),
    ('public.current_user_profile_id()','3ae97eed6dcb16e61291a1b8a5998b21',true,'bigint',ARRAY['search_path=""'],ARRAY['anon=X/postgres','authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres']),
    ('public.current_user_is_global_admin()','5375091be37487c37872452fa3837466',true,'boolean',ARRAY['search_path=pg_catalog, public, pg_temp'],ARRAY['anon=X/postgres','authenticated=X/postgres','postgres=X/postgres','service_role=X/postgres'])
  ) AS v(signature,body_hash,definer,result_type,config,acl)
  LOOP
    SELECT p.* INTO actual FROM pg_proc p WHERE p.oid=to_regprocedure(expected.signature);
    SELECT array_agg(entry::text ORDER BY entry::text) INTO actual_acl FROM unnest(actual.proacl) entry;
    IF actual.oid IS NULL OR actual.proowner<>'postgres'::regrole
      OR actual.prolang<>(SELECT oid FROM pg_language WHERE lanname='sql')
      OR actual.provolatile<>'s' OR actual.prosecdef<>expected.definer
      OR actual.prorettype<>expected.result_type::regtype OR actual.proretset OR actual.proisstrict OR actual.proleakproof
      OR actual.proconfig IS DISTINCT FROM expected.config OR actual_acl IS DISTINCT FROM expected.acl
      OR md5(actual.prosrc)<>expected.body_hash THEN
      RAISE EXCEPTION 'Template branding authority preimage changed: %',expected.signature;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid='public.erp_report_templates'::regclass)<>2
    OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.erp_report_templates'::regclass
      AND polname='rpt_templates_select' AND polcmd='r' AND polpermissive
      AND polroles=ARRAY['authenticated'::regrole::oid] AND polwithcheck IS NULL
      AND regexp_replace(pg_get_expr(polqual,polrelid),'[\s()]','','g')=
        'deleted_atISNULLANDerp_private.can_read_report_template_brandingbranding_profile_id')
    OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.erp_report_templates'::regclass
      AND polname='f03_principal' AND polcmd='*' AND NOT polpermissive
      AND polroles=ARRAY['authenticated'::regrole::oid]
      AND regexp_replace(pg_get_expr(polqual,polrelid),'[\s()]','','g')=
        'SELECTerp_private.business_principal_is_activeASbusiness_principal_is_active'
      AND pg_get_expr(polwithcheck,polrelid)=pg_get_expr(polqual,polrelid)) THEN
    RAISE EXCEPTION 'Template branding exact template policy preimage changed';
  END IF;
END;
$template_set_preimage$;

-- Snapshot the preserved authority and safe projection to reject accidental
-- changes within this transaction. This temporary object never reaches clients.
CREATE TEMP TABLE perf_template_set_preserved ON COMMIT DROP AS
SELECT
  (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p WHERE p.pronamespace='erp_private'::regnamespace
    OR p.oid IN('public.current_user_profile_id()'::regprocedure,'public.current_user_is_global_admin()'::regprocedure)) AS functions,
  pg_get_viewdef('public.erp_report_branding_profiles_safe'::regclass,false) AS safe_view,
  (SELECT to_jsonb(p) FROM pg_policy p WHERE p.polrelid='public.erp_report_templates'::regclass AND p.polname='f03_principal') AS principal_policy;

CREATE FUNCTION erp_private.readable_report_template_branding_ids()
RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $function$
  SELECT p.id
  FROM public.erp_report_branding_profiles p
  WHERE (SELECT auth.uid()) IS NOT NULL
    AND (SELECT erp_private.business_principal_is_active())
    AND erp_private.can_read_report_template_branding(p.id);
$function$;
ALTER FUNCTION erp_private.readable_report_template_branding_ids() OWNER TO postgres;
REVOKE ALL ON FUNCTION erp_private.readable_report_template_branding_ids() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.readable_report_template_branding_ids() TO authenticated;
COMMENT ON FUNCTION erp_private.readable_report_template_branding_ids() IS
  'Private statement-local authorized branding IDs; unchanged F06 point authority, no persistent cache and no metadata/signing output.';

ALTER POLICY rpt_templates_select ON public.erp_report_templates
USING (
  deleted_at IS NULL
  AND (SELECT erp_private.business_principal_is_active())
  AND (
    (branding_profile_id IS NULL AND (SELECT erp_private.can_read_report_template_branding(NULL::bigint)))
    OR branding_profile_id IN (SELECT allowed.id FROM erp_private.readable_report_template_branding_ids() AS allowed(id))
  )
);

-- The exact sole permissive SELECT policy above supplies the point-equivalent
-- check for ordinary authenticated callers. Do not also call it per template
-- here. Invoker RLS, the restrictive principal policy and safe join all remain.
CREATE OR REPLACE VIEW public.perf_report_template_selection (
  id,template_code,template_name,template_type,is_default,governance_status,visual_editor_engine,
  branding_profile_id,branding_profile_name,branding_profile_type,company_name,logo_url,owner_company_id,selectable
)
WITH (security_invoker=true,security_barrier=true) AS
SELECT t.id,t.template_code,t.template_name,t.template_type,COALESCE(t.is_default,false),
  t.governance_status,t.visual_editor_engine,t.branding_profile_id,p.profile_name,p.profile_type,
  CASE WHEN p.owner_company_id IS NOT NULL THEN COALESCE(p.legal_name_en,p.trade_name_en,p.profile_name) ELSE NULL::text END,
  p.logo_url,p.owner_company_id,
  COALESCE(t.is_active,false) AND (t.branding_profile_id IS NULL OR COALESCE(p.is_active,false))
FROM public.erp_report_templates t
LEFT JOIN public.erp_report_branding_profiles_safe p ON p.id=t.branding_profile_id
WHERE t.deleted_at IS NULL AND (SELECT erp_private.business_principal_is_active())
  AND (t.branding_profile_id IS NULL OR p.id IS NOT NULL);

DO $template_set_postimage$
DECLARE actual_acl text[];
BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.perf_report_template_selection'::regclass
      AND relowner='postgres'::regrole AND reloptions=ARRAY['security_invoker=true','security_barrier=true'])
    OR (SELECT array_agg(a.attname::text ORDER BY a.attnum) FROM pg_attribute a
      WHERE a.attrelid='public.perf_report_template_selection'::regclass AND a.attnum>0 AND NOT a.attisdropped)
      IS DISTINCT FROM ARRAY['id','template_code','template_name','template_type','is_default','governance_status','visual_editor_engine',
        'branding_profile_id','branding_profile_name','branding_profile_type','company_name','logo_url','owner_company_id','selectable'] THEN
    RAISE EXCEPTION 'Template branding selector metadata contract changed';
  END IF;
  SELECT array_agg(entry::text ORDER BY entry::text) INTO actual_acl
    FROM pg_class c CROSS JOIN LATERAL unnest(c.relacl) entry WHERE c.oid='public.perf_report_template_selection'::regclass;
  IF actual_acl IS DISTINCT FROM ARRAY['authenticated=r/postgres','postgres=arwdDxtm/postgres'] THEN
    RAISE EXCEPTION 'Template branding selector ACL changed';
  END IF;
  SELECT array_agg(entry::text ORDER BY entry::text) INTO actual_acl
    FROM pg_proc p CROSS JOIN LATERAL unnest(p.proacl) entry WHERE p.oid='erp_private.readable_report_template_branding_ids()'::regprocedure;
  IF actual_acl IS DISTINCT FROM ARRAY['authenticated=X/postgres','postgres=X/postgres']
    OR has_function_privilege('anon','erp_private.readable_report_template_branding_ids()','EXECUTE')
    OR has_function_privilege('service_role','erp_private.readable_report_template_branding_ids()','EXECUTE') THEN
    RAISE EXCEPTION 'Template branding set execution boundary changed';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_temp.perf_template_set_preserved saved WHERE
      saved.functions IS NOT DISTINCT FROM (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.oid) FROM pg_proc p
        WHERE (p.pronamespace='erp_private'::regnamespace AND p.oid<>'erp_private.readable_report_template_branding_ids()'::regprocedure)
          OR p.oid IN('public.current_user_profile_id()'::regprocedure,'public.current_user_is_global_admin()'::regprocedure))
      AND saved.safe_view=pg_get_viewdef('public.erp_report_branding_profiles_safe'::regclass,false)
      AND saved.principal_policy IS NOT DISTINCT FROM (SELECT to_jsonb(p) FROM pg_policy p
        WHERE p.polrelid='public.erp_report_templates'::regclass AND p.polname='f03_principal')) THEN
    RAISE EXCEPTION 'Template branding preserved authority changed';
  END IF;
END;
$template_set_postimage$;
NOTIFY pgrst,'reload schema';
COMMIT;
