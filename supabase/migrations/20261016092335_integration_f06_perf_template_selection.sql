BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- F06/PERF composition only. The source template RLS, private authority helpers,
-- safe branding view and all write/issuance boundaries remain unchanged.
-- A reapplication or a different authority preimage must fail, not replace it.
DO $selection_preconditions$
DECLARE helper record;
BEGIN
  IF current_user <> 'postgres' OR current_setting('server_version_num')::integer < 150000 THEN
    RAISE EXCEPTION 'Template selection requires the reviewed PostgreSQL migration owner and invoker-view support';
  END IF;
  IF to_regclass('public.perf_report_template_selection') IS NOT NULL THEN
    RAISE EXCEPTION 'Template selection already exists; reconcile migration history instead of replacing it';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.erp_report_templates')
      AND relkind = 'r' AND relrowsecurity AND relowner = 'postgres'::regrole)
    OR NOT EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass('public.erp_report_branding_profiles_safe')
      AND relkind = 'v' AND relowner = 'postgres'::regrole
      AND reloptions @> ARRAY['security_barrier=true']
      AND NOT reloptions @> ARRAY['security_invoker=true']) THEN
    RAISE EXCEPTION 'Reviewed F06 template RLS or safe branding view is missing or changed';
  END IF;
  IF NOT has_table_privilege('authenticated', 'public.erp_report_templates', 'SELECT')
    OR NOT has_table_privilege('authenticated', 'public.erp_report_branding_profiles_safe', 'SELECT')
    OR has_table_privilege('anon', 'public.erp_report_templates', 'SELECT')
    OR has_table_privilege('anon', 'public.erp_report_branding_profiles_safe', 'SELECT')
    OR has_table_privilege('authenticated', 'public.erp_report_templates', 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
    OR has_table_privilege('authenticated', 'public.erp_report_branding_profiles', 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') THEN
    RAISE EXCEPTION 'Reviewed F06 read-only template and redacted branding privileges changed';
  END IF;
  -- Compare the reviewed helper bodies as well as executable metadata. No
  -- replacement helper or service-role fallback is created by this migration.
  FOR helper IN SELECT * FROM (VALUES
    ('erp_private.can_read_report_template_branding(bigint)', true,
      $expected$select erp_private.business_principal_is_active() and case when $1 is null
        then erp_private.can_read_report_branding(null)
        else exists(select 1 from public.erp_report_branding_profiles p
          where p.id=$1 and p.deleted_at is null
          and erp_private.can_read_report_branding(p.owner_company_id)
          and (p.owner_company_id is null or exists(select 1 from public.owner_companies c
            where c.id=p.owner_company_id and c.status='active'))) end;$expected$),
    ('erp_private.can_read_report_branding(bigint)', false,
      $expected$select erp_private.report_branding_permission('view',$1) or erp_private.report_branding_permission('manage',$1);$expected$),
    ('erp_private.report_branding_permission(text,bigint)', false,
      $expected$select $1 in ('view','manage','sign','upload') and
        erp_private.permission_in_scope(case $1 when 'upload' then 'branding.assets.upload' else 'reports.'||$1 end,$2,null);$expected$)
  ) AS expected(signature, definer, body)
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_language l ON l.oid = p.prolang
      WHERE p.oid = to_regprocedure(helper.signature) AND p.proowner = 'postgres'::regrole
        AND l.lanname = 'sql' AND p.prorettype = 'boolean'::regtype
        AND p.prosecdef = helper.definer AND p.provolatile = 's'
        AND p.proconfig = ARRAY['search_path=""']
        AND regexp_replace(p.prosrc, '\s+', '', 'g') = regexp_replace(helper.body, '\s+', '', 'g')
        AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
        AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')) THEN
      RAISE EXCEPTION 'Reviewed F06 template authority helper changed: %', helper.signature;
    END IF;
  END LOOP;
  IF (SELECT count(*) FROM pg_policy WHERE polrelid = 'public.erp_report_templates'::regclass
      AND polpermissive AND polcmd IN ('r','*')) <> 1
    OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.erp_report_templates'::regclass
      AND polname = 'rpt_templates_select' AND polcmd = 'r' AND polpermissive
      AND polroles = ARRAY['authenticated'::regrole::oid]
      AND regexp_replace(pg_get_expr(polqual, polrelid), '[\s()]', '', 'g') =
        'deleted_atISNULLANDerp_private.can_read_report_template_brandingbranding_profile_id') THEN
    RAISE EXCEPTION 'Reviewed F06 template SELECT policy changed';
  END IF;
END;
$selection_preconditions$;

-- Let PostgreSQL normalize both definitions, rather than accepting a text
-- substring that could hide an OR-true authority regression. Temporary only;
-- the original view is neither replaced nor granted additional privileges.
CREATE TEMP VIEW perf_expected_safe_branding AS
SELECT p.id,p.profile_code,p.profile_name,p.profile_type,p.owner_company_id,p.logo_url,p.small_logo_url,
  CASE WHEN erp_private.report_branding_permission('sign',p.owner_company_id) THEN p.stamp_url ELSE NULL::text END AS stamp_url,
  CASE WHEN erp_private.report_branding_permission('sign',p.owner_company_id) THEN p.signature_url ELSE NULL::text END AS signature_url,
  p.watermark_url,p.watermark_text,p.theme_primary_color,p.theme_secondary_color,p.theme_header_bg_color,p.theme_header_text_color,
  p.legal_name_en,p.legal_name_ar,p.trade_name_en,p.trade_name_ar,p.address_block_en,p.address_block_ar,
  p.phone,p.email,p.website,p.po_box,p.trn,p.trade_license_no,p.footer_text_en,p.footer_text_ar,
  p.signatory_name,p.signatory_title_en,p.signatory_title_ar,p.is_default_for_company,p.is_group_profile,p.is_neutral_profile,
  p.is_active,p.created_at,p.updated_at,p.created_by,p.updated_by,p.deleted_at,p.deleted_by,p.workspace_revision
FROM public.erp_report_branding_profiles p
WHERE p.deleted_at IS NULL AND erp_private.can_read_report_branding(p.owner_company_id);
DO $selection_view_preimage$
BEGIN
  IF pg_get_viewdef('public.erp_report_branding_profiles_safe'::regclass, false)
    IS DISTINCT FROM pg_get_viewdef('pg_temp.perf_expected_safe_branding'::regclass, false) THEN
    RAISE EXCEPTION 'Reviewed F06 safe branding projection changed';
  END IF;
END;
$selection_view_preimage$;
DROP VIEW pg_temp.perf_expected_safe_branding;

CREATE VIEW public.perf_report_template_selection (
  id, template_code, template_name, template_type, is_default,
  governance_status, visual_editor_engine, branding_profile_id,
  branding_profile_name, branding_profile_type, company_name,
  logo_url, owner_company_id, selectable
)
WITH (security_invoker = true, security_barrier = true)
AS SELECT
  t.id, t.template_code, t.template_name, t.template_type,
  COALESCE(t.is_default, false), t.governance_status, t.visual_editor_engine,
  t.branding_profile_id, p.profile_name, p.profile_type,
  CASE WHEN p.owner_company_id IS NOT NULL
    THEN COALESCE(p.legal_name_en, p.trade_name_en, p.profile_name)
    ELSE NULL::text END,
  p.logo_url, p.owner_company_id,
  COALESCE(t.is_active, false)
    AND (t.branding_profile_id IS NULL OR COALESCE(p.is_active, false))
FROM public.erp_report_templates t
LEFT JOIN public.erp_report_branding_profiles_safe p ON p.id = t.branding_profile_id
WHERE t.deleted_at IS NULL
  AND (SELECT erp_private.business_principal_is_active())
  AND erp_private.can_read_report_template_branding(t.branding_profile_id)
  AND (t.branding_profile_id IS NULL OR p.id IS NOT NULL);

ALTER VIEW public.perf_report_template_selection OWNER TO postgres;
REVOKE ALL ON public.perf_report_template_selection FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.perf_report_template_selection TO authenticated;
COMMENT ON VIEW public.perf_report_template_selection IS
  'F06/PERF-P04 metadata-only selection; caller template RLS and unchanged F06 branding authority. Historical metadata is not issuance permission.';
NOTIFY pgrst, 'reload schema';
COMMIT;
