-- F03 T01/T02: additive auth lifecycle. Local verification is required before release.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
CREATE SCHEMA IF NOT EXISTS erp_private;
REVOKE ALL ON SCHEMA erp_private FROM PUBLIC, anon;
GRANT USAGE ON SCHEMA erp_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION erp_private.session_is_valid()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT auth.uid() IS NOT NULL AND EXISTS (
    SELECT 1 FROM auth.sessions s JOIN auth.users u ON u.id = s.user_id
    WHERE s.user_id = auth.uid() AND s.id::text = (auth.jwt()->>'session_id')
      AND (s.not_after IS NULL OR s.not_after > now())
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until < now())
  );
$$;
REVOKE ALL ON FUNCTION erp_private.session_is_valid() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION erp_private.session_is_valid() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.f03_current_session_valid()
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT erp_private.session_is_valid();
$$;
REVOKE ALL ON FUNCTION public.f03_current_session_valid() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.f03_current_session_valid() TO authenticated;

CREATE OR REPLACE FUNCTION erp_private.business_principal_is_active()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT erp_private.session_is_valid() AND EXISTS (
    SELECT 1 FROM public.user_profiles p WHERE p.auth_user_id = auth.uid()
      AND p.status = 'active' AND p.must_change_password IS FALSE
  );
$$;
REVOKE ALL ON FUNCTION erp_private.business_principal_is_active() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION erp_private.business_principal_is_active() TO authenticated, service_role;

-- Restrictive guards compose with (never replace) existing row/operation policies.
-- D04: this Supabase project also hosts another active application. Only ERP
-- relations (ERP namespace or existing ERP authorization policy) are eligible.
-- Own-profile SELECT remains available for disabled/required-change guidance.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT n.nspname, c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE c.relkind='r' AND c.relrowsecurity
      AND n.nspname='public'
      AND (c.relname ~ '^(erp_|hr_|dms_|employee_)'
        OR c.relname IN ('global_lookup_categories','global_lookup_values')
        OR EXISTS(SELECT 1 FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname
          AND p.policyname NOT LIKE 'f03_%' AND concat(p.qual,p.with_check) ~ 'current_user_'))
  LOOP
    IF r.nspname='public' AND r.relname='user_profiles' THEN
      EXECUTE 'CREATE POLICY f03_principal_select ON public.user_profiles AS RESTRICTIVE FOR SELECT TO authenticated USING ((select erp_private.session_is_valid()))';
      EXECUTE 'CREATE POLICY f03_principal_insert ON public.user_profiles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK ((select erp_private.business_principal_is_active()))';
      EXECUTE 'CREATE POLICY f03_principal_update ON public.user_profiles AS RESTRICTIVE FOR UPDATE TO authenticated USING ((select erp_private.business_principal_is_active())) WITH CHECK ((select erp_private.business_principal_is_active()))';
      EXECUTE 'CREATE POLICY f03_principal_delete ON public.user_profiles AS RESTRICTIVE FOR DELETE TO authenticated USING ((select erp_private.business_principal_is_active()))';
    ELSE
      EXECUTE format('CREATE POLICY f03_principal ON %I.%I AS RESTRICTIVE FOR ALL TO authenticated USING ((select erp_private.business_principal_is_active())) WITH CHECK ((select erp_private.business_principal_is_active()))', r.nspname, r.relname);
    END IF;
  END LOOP;
END $$;

-- Storage is shared too. Other applications' buckets retain their existing
-- policies; the extra active-ERP gate applies only to these ERP-owned buckets.
CREATE POLICY f03_principal ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
 USING (bucket_id NOT IN ('dms-documents','dms-temp','erp-branding-assets','erp-generated-pdfs') OR (SELECT erp_private.business_principal_is_active()))
 WITH CHECK (bucket_id NOT IN ('dms-documents','dms-temp','erp-branding-assets','erp-generated-pdfs') OR (SELECT erp_private.business_principal_is_active()));

-- Existing definer authorization helpers bypass table policies: guard their SQL
-- predicate as well. Retain the exact existing predicate and signature, adding
-- one conjunct. Only the named boolean helpers are eligible; unexpected kinds fail.
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid, p.proname, pg_get_function_arguments(p.oid) args, p.prosrc, l.lanname, p.prorettype
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang
    WHERE n.nspname='public' AND p.proname IN (
      'current_user_is_global_admin','current_user_has_role','current_user_has_role_in_company','current_user_has_role_in_branch',
      'current_user_has_permission','current_user_has_permission_globally','current_user_has_permission_any_scope',
      'current_user_has_permission_in_company','current_user_has_permission_in_branch')
  LOOP
    IF r.lanname <> 'sql' OR r.prorettype <> 'boolean'::regtype THEN RAISE EXCEPTION 'Unexpected auth helper %', r.proname; END IF;
    EXECUTE format('CREATE OR REPLACE FUNCTION public.%I(%s) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public, pg_temp AS %L',
      r.proname, r.args, 'SELECT erp_private.business_principal_is_active() AND (' || regexp_replace(btrim(r.prosrc), ';\s*$', '') || ');');
  END LOOP;
END $$;

CREATE TABLE public.erp_auth_flow_grants (
  token_hash text PRIMARY KEY CHECK (length(token_hash)=64),
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,
  flow_type text NOT NULL CHECK(flow_type IN ('invite','recovery')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 minutes'),
  consumed_at timestamptz
);
ALTER TABLE public.erp_auth_flow_grants ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_auth_flow_grants FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.erp_auth_flow_grants TO service_role;
CREATE INDEX erp_auth_flow_grants_expiry_idx ON public.erp_auth_flow_grants(expires_at);

-- No password, recovery URL, JWT or provider secret is retained in this journal.
CREATE TABLE public.erp_auth_password_operations (
  id uuid PRIMARY KEY,
  auth_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES auth.sessions(id) ON DELETE CASCADE,
  profile_id bigint NOT NULL REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  mode text NOT NULL CHECK(mode IN ('self','required','recovery')),
  stage text NOT NULL CHECK(stage IN ('started','provider_completed','completed','failed','needs_reconciliation')),
  security_version timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  provider_completed_at timestamptz,
  completed_at timestamptz,
  UNIQUE(auth_user_id,id)
);
ALTER TABLE public.erp_auth_password_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_auth_password_operations FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.erp_auth_password_operations TO service_role;
CREATE UNIQUE INDEX erp_auth_password_one_inflight ON public.erp_auth_password_operations(auth_user_id) WHERE stage IN ('started','provider_completed','needs_reconciliation');

NOTIFY pgrst, 'reload schema';
COMMIT;
