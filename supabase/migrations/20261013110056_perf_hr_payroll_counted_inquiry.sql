BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
-- PERF-P04 item 3. New invoker-only read API, not a payroll business-rule change.
-- Only the five payroll SELECT predicates are made statement-local. Existing
-- restrictive guards, write policies/functions and table privileges are intact.
-- Refuse unexpected authority/uniqueness contracts before creating the API.
DO $preconditions$
DECLARE resource text; relation regclass; helper text; policy record;
BEGIN
  IF to_regprocedure('erp_private.payroll_subject_ids(text)') IS NOT NULL
    OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='erp_private.employee_permission(bigint,text)'::regprocedure) IS DISTINCT FROM '085fd40f2b0b84e88328b3a824fd5390'
    OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='erp_private.readable_employee_ids()'::regprocedure) IS DISTINCT FROM 'bc725a99d93ad584f0397033eacbdfd1'
    OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.current_user_can_view_employee_payroll(bigint)'::regprocedure) IS DISTINCT FROM '7db55ab7bd543a676e84be604faf676c'
    OR (SELECT md5(prosrc) FROM pg_proc WHERE oid='public.f03_has_employee_permission(bigint,text)'::regprocedure) IS DISTINCT FROM 'c66dc2fbf6df571bbf53aef0df23d5e9'
  THEN RAISE EXCEPTION 'Unreviewed F03 payroll authority; reconcile before migration'; END IF;
  FOR policy IN SELECT * FROM (VALUES
    ('employee_payroll_profiles','emp_payroll_profile_select'),('employee_salary_components','emp_salary_comp_select'),
    ('employee_salary_revisions','emp_salary_rev_select'),('employee_payroll_holds','emp_payroll_hold_select'),('employee_wps_profiles','emp_wps_profile_select')
  ) p(table_name,policy_name) LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=policy.table_name AND policyname=policy.policy_name
      AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['authenticated']::name[] AND with_check IS NULL
      AND qual=CASE WHEN policy.table_name='employee_wps_profiles' THEN '(current_user_can_view_employee_payroll(employee_id) AND erp_private.employee_permission(employee_id, ''hr.banking.view''::text))'
       ELSE 'current_user_can_view_employee_payroll(employee_id)' END)
    THEN RAISE EXCEPTION 'Unreviewed payroll SELECT policy: %',policy.table_name; END IF;
  END LOOP;
  IF EXISTS (SELECT 1 FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='perf_hr_payroll_inquiry') THEN
    RAISE EXCEPTION 'Payroll inquiry already exists; review schema history before applying';
  END IF;
  FOREACH resource IN ARRAY ARRAY['employees','employee_payroll_profiles','employee_salary_components','employee_salary_revisions','employee_wps_profiles','employee_payroll_holds','hr_salary_component_types','hr_payroll_groups'] LOOP
    relation := pg_catalog.to_regclass('public.'||resource);
    IF relation IS NULL OR NOT EXISTS(SELECT 1 FROM pg_catalog.pg_class WHERE oid=relation AND relkind='r' AND relrowsecurity AND relforcerowsecurity) THEN
      RAISE EXCEPTION 'Required payroll relation/RLS contract missing: %',resource;
    END IF;
  END LOOP;
  FOREACH resource IN ARRAY ARRAY['employee_payroll_profiles','employee_wps_profiles'] LOOP
    relation := pg_catalog.to_regclass('public.'||resource);
    IF NOT EXISTS(SELECT 1 FROM pg_catalog.pg_constraint c JOIN pg_catalog.pg_attribute a ON a.attrelid=relation AND a.attname='employee_id'
      WHERE c.conrelid=relation AND c.contype='u' AND c.convalidated AND NOT c.condeferrable AND c.conkey=ARRAY[a.attnum]) THEN
      RAISE EXCEPTION 'Payroll one-profile-per-employee contract missing: %',resource;
    END IF;
  END LOOP;
  FOREACH helper IN ARRAY ARRAY['public.current_user_profile_id()','public.current_user_has_permission_any_scope(text)','public.f03_current_session_valid()','public.f03_has_employee_permission(bigint,text)'] LOOP
    IF pg_catalog.to_regprocedure(helper) IS NULL THEN RAISE EXCEPTION 'Required F03 authority missing: %',helper; END IF;
  END LOOP;
END
$preconditions$;
-- Bind the optimization to reviewed authority metadata, not source text alone.
DO $authority_contract$
DECLARE expected record; actual pg_catalog.pg_proc; acl text[];
BEGIN
 IF current_user <> 'postgres' THEN RAISE EXCEPTION 'Reviewed payroll migration owner required'; END IF;
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
  THEN RAISE EXCEPTION 'Payroll authority metadata differs: %',expected.signature; END IF;
 END LOOP;
END $authority_contract$;
-- Same F03 employee_permission predicates, with actor, linked identity and
-- individual assignment scopes resolved once per statement. Never a cached
-- session grant. This private helper returns only IDs, not employee/bank data.
CREATE FUNCTION erp_private.payroll_subject_ids(capability text)
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH actor AS MATERIALIZED (
  SELECT p.id,p.owner_company_id,p.branch_id FROM public.user_profiles p
  WHERE p.auth_user_id=(SELECT auth.uid()) AND (SELECT erp_private.business_principal_is_active())
   AND $1 IN ('hr.payroll.view','hr.banking.view')
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
REVOKE ALL ON FUNCTION erp_private.payroll_subject_ids(text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.payroll_subject_ids(text) TO authenticated;
ALTER POLICY emp_payroll_profile_select ON public.employee_payroll_profiles USING(employee_id IN(SELECT erp_private.readable_employee_ids()) AND employee_id IN(SELECT erp_private.payroll_subject_ids('hr.payroll.view')));
ALTER POLICY emp_salary_comp_select ON public.employee_salary_components USING(employee_id IN(SELECT erp_private.readable_employee_ids()) AND employee_id IN(SELECT erp_private.payroll_subject_ids('hr.payroll.view')));
ALTER POLICY emp_salary_rev_select ON public.employee_salary_revisions USING(employee_id IN(SELECT erp_private.readable_employee_ids()) AND employee_id IN(SELECT erp_private.payroll_subject_ids('hr.payroll.view')));
ALTER POLICY emp_payroll_hold_select ON public.employee_payroll_holds USING(employee_id IN(SELECT erp_private.readable_employee_ids()) AND employee_id IN(SELECT erp_private.payroll_subject_ids('hr.payroll.view')));
ALTER POLICY emp_wps_profile_select ON public.employee_wps_profiles USING(employee_id IN(SELECT erp_private.readable_employee_ids()) AND employee_id IN(SELECT erp_private.payroll_subject_ids('hr.payroll.view')) AND employee_id IN(SELECT erp_private.payroll_subject_ids('hr.banking.view')));
CREATE FUNCTION public.perf_hr_payroll_inquiry(
  p_kind text,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 25,
  p_search text DEFAULT '',
  p_employee_search text DEFAULT '',
  p_owner_company_id bigint DEFAULT NULL,
  p_branch_id bigint DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_active_hold_only boolean DEFAULT false,
  p_column_filters jsonb DEFAULT '{}'::jsonb,
  p_sorting jsonb DEFAULT '[{"id":"full_name_en","desc":false}]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = ''
SET row_security = on
AS $prototype$
DECLARE
  v_keys text[];
  v_key text;
  v_value jsonb;
  v_text text;
  v_search text;
  v_employee_search text;
  v_patterns jsonb := '{}'::jsonb;
  v_offset bigint;
  v_result jsonb;
  v_sorting jsonb;
  v_sort jsonb;
  v_seen text[] := ARRAY[]::text[];
  -- ECMAScript String.trim whitespace and line terminators. PostgreSQL's
  -- default btrim removes only spaces and would not preserve WPS semantics.
  v_trim_chars text := U&'\0009\000A\000B\000C\000D\0020\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF';
BEGIN
  -- Direct native calls require exactly the supported authenticated caller.
  -- row_security=on does NOT constrain a superuser or BYPASSRLS role by itself.
  IF current_user <> 'authenticated'
     OR public.current_user_profile_id() IS NULL
     OR public.f03_current_session_valid() IS NOT TRUE THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_kind IS NULL OR p_kind NOT IN ('salary','wps')
     OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000
     OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100
     OR p_search IS NULL OR pg_catalog.char_length(p_search) > 200
     OR p_employee_search IS NULL OR pg_catalog.char_length(p_employee_search) > 200
     OR p_active_hold_only IS NULL
     OR (p_owner_company_id IS NOT NULL AND p_owner_company_id NOT BETWEEN 1 AND 9007199254740991)
     OR (p_branch_id IS NOT NULL AND p_branch_id NOT BETWEEN 1 AND 9007199254740991)
     OR p_column_filters IS NULL OR pg_catalog.jsonb_typeof(p_column_filters) <> 'object'
  THEN
    RAISE EXCEPTION 'Invalid inquiry criteria' USING ERRCODE = '22023';
  END IF;

  -- Coarse capability checks only distinguish forbidden from a legitimately
  -- empty authorized set. They NEVER define the subject set below.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(ARRAY[
      'hr.payroll.view','hr.payroll.view.self','hr.payroll.view.team'
    ]::text[]) AS capability(code)
    WHERE public.current_user_has_permission_any_scope(capability.code)
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'wps' AND NOT EXISTS (
    SELECT 1
    FROM pg_catalog.unnest(ARRAY[
      'hr.banking.view','hr.banking.view.self','hr.banking.view.team'
    ]::text[]) AS capability(code)
    WHERE public.current_user_has_permission_any_scope(capability.code)
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  v_keys := CASE p_kind
    WHEN 'salary' THEN ARRAY[
      'full_name_en','payroll_group_name',
      'payroll_status','gross_salary','currency'
    ]::text[]
    ELSE ARRAY[
      'full_name_en','wps_status','salary_payment_method',
      'has_active_hold','readiness_status'
    ]::text[]
  END;
  IF (p_kind = 'salary' AND p_active_hold_only)
     OR (p_status IS NOT NULL AND NOT p_status = ANY(
       CASE p_kind
         WHEN 'salary' THEN ARRAY['active','hold','inactive','not_configured']::text[]
         ELSE ARRAY['active','hold','exempt','not_enrolled']::text[]
       END
     ))
  THEN
    RAISE EXCEPTION 'Invalid inquiry criteria' USING ERRCODE = '22023';
  END IF;

  -- Validate the whole ordered array, not just the first criterion. Explicit
  -- guards precede array/object operations and casts. Caller text is never SQL.
  IF p_sorting IS NULL OR pg_catalog.jsonb_typeof(p_sorting) <> 'array' THEN
    RAISE EXCEPTION 'Invalid inquiry sorting' USING ERRCODE = '22023';
  END IF;
  IF pg_catalog.jsonb_array_length(p_sorting) > 5 THEN
    RAISE EXCEPTION 'Invalid inquiry sorting' USING ERRCODE = '22023';
  END IF;
  FOR v_sort IN SELECT item.value FROM pg_catalog.jsonb_array_elements(p_sorting) AS item
  LOOP
    IF pg_catalog.jsonb_typeof(v_sort) <> 'object' THEN
      RAISE EXCEPTION 'Invalid inquiry sorting' USING ERRCODE = '22023';
    END IF;
    IF pg_catalog.jsonb_typeof(v_sort->'id') IS DISTINCT FROM 'string'
       OR pg_catalog.jsonb_typeof(v_sort->'desc') IS DISTINCT FROM 'boolean'
       OR v_sort - 'id' - 'desc' <> '{}'::jsonb THEN
      RAISE EXCEPTION 'Invalid inquiry sorting' USING ERRCODE = '22023';
    END IF;
    v_key := v_sort->>'id';
    IF NOT v_key = ANY(v_keys) OR v_key = ANY(v_seen) THEN
      RAISE EXCEPTION 'Invalid inquiry sorting' USING ERRCODE = '22023';
    END IF;
    v_seen := pg_catalog.array_append(v_seen, v_key);
  END LOOP;
  v_sorting := CASE WHEN pg_catalog.jsonb_array_length(p_sorting) = 0
    THEN '[{"id":"full_name_en","desc":false}]'::jsonb ELSE p_sorting END;

  FOR v_key, v_value IN
    SELECT item.key, item.value FROM pg_catalog.jsonb_each(p_column_filters) AS item
  LOOP
    IF NOT v_key = ANY(v_keys) OR pg_catalog.jsonb_typeof(v_value) <> 'string'
       OR pg_catalog.char_length(v_value #>> '{}') > 200 THEN
      RAISE EXCEPTION 'Invalid inquiry criteria' USING ERRCODE = '22023';
    END IF;
    v_text := v_value #>> '{}';
    IF v_text <> '' THEN
      -- Static literal escaping, not SQL construction or caller regex.
      v_patterns := v_patterns || pg_catalog.jsonb_build_object(v_key,
        '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
          v_text, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%');
    END IF;
  END LOOP;
  v_search := '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
    p_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  v_employee_search := '%' || pg_catalog.replace(pg_catalog.replace(pg_catalog.replace(
    p_employee_search, E'\\', E'\\\\'), '%', E'\\%'), '_', E'\\_') || '%';
  v_offset := (p_page::bigint - 1) * p_page_size;

  IF p_kind = 'salary' THEN
    -- This branch does not query a WPS/bank relation or banking permission.
    WITH eligible AS MATERIALIZED (
      SELECT e.id, e.employee_code, e.full_name_en, e.full_name_ar
      FROM public.employees AS e
      WHERE e.deleted_at IS NULL
        -- Employee RLS is evaluated independently of this payroll subject grant.
        AND e.id IN(SELECT erp_private.payroll_subject_ids('hr.payroll.view'))
        AND (p_owner_company_id IS NULL OR e.owner_company_id = p_owner_company_id)
        AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
        AND (
          e.employee_code ILIKE v_employee_search ESCAPE E'\\'
          OR e.full_name_en ILIKE v_employee_search ESCAPE E'\\'
          OR COALESCE(e.full_name_ar,'') ILIKE v_employee_search ESCAPE E'\\'
        )
    ),
    component_totals AS MATERIALIZED (
      SELECT c.employee_id,
        COALESCE(SUM(COALESCE(c.amount,0))
          FILTER (WHERE COALESCE(t.component_kind,'earning') = 'earning'),0) AS gross_salary,
        BOOL_OR(c.amount::text IN ('NaN','Infinity','-Infinity')) AS invalid_amount,
        COUNT(*) AS active_component_count
      FROM public.employee_salary_components AS c
      JOIN eligible AS e ON e.id = c.employee_id
      LEFT JOIN public.hr_salary_component_types AS t ON t.id = c.component_type_id
      WHERE c.deleted_at IS NULL AND c.is_active
      -- No date applicability or lookup active/deleted predicate is invented.
      -- Lookup row RLS remains in force, including null-type earning fallback.
      GROUP BY c.employee_id
    ),
    derived AS MATERIALIZED (
      SELECT e.id AS employee_id, e.employee_code, e.full_name_en, e.full_name_ar,
        p.payroll_status, g.name_en AS payroll_group_name, p.currency,
        COALESCE(c.gross_salary,0::numeric) AS gross_salary
      FROM eligible AS e
      LEFT JOIN public.employee_payroll_profiles AS p
        ON p.employee_id = e.id
      LEFT JOIN public.hr_payroll_groups AS g ON g.id = p.payroll_group_id
      LEFT JOIN component_totals AS c ON c.employee_id = e.id
      -- Requires verified native uniqueness of payroll_profiles.employee_id.
      -- Do not LIMIT 1 to conceal an unexpected duplicate/schema change.
    ),
    filtered AS MATERIALIZED (
      SELECT d.*
      FROM derived AS d
      WHERE (p_status IS NULL OR COALESCE(d.payroll_status,'not_configured') = p_status)
        AND (
          d.employee_code ILIKE v_search ESCAPE E'\\'
          OR d.full_name_en ILIKE v_search ESCAPE E'\\'
          OR COALESCE(d.full_name_ar,'') ILIKE v_search ESCAPE E'\\'
          OR COALESCE(d.payroll_group_name,'') ILIKE v_search ESCAPE E'\\'
          OR COALESCE(d.payroll_status,'') ILIKE v_search ESCAPE E'\\'
          OR pg_catalog.trim_scale(d.gross_salary)::text ILIKE v_search ESCAPE E'\\'
          OR COALESCE(d.currency,'') ILIKE v_search ESCAPE E'\\'
        )
        AND (NOT v_patterns ? 'full_name_en' OR d.full_name_en ILIKE (v_patterns->>'full_name_en') ESCAPE E'\\')
        AND (NOT v_patterns ? 'payroll_group_name' OR COALESCE(d.payroll_group_name,'') ILIKE (v_patterns->>'payroll_group_name') ESCAPE E'\\')
        AND (NOT v_patterns ? 'payroll_status' OR COALESCE(d.payroll_status,'') ILIKE (v_patterns->>'payroll_status') ESCAPE E'\\')
        AND (NOT v_patterns ? 'gross_salary' OR pg_catalog.trim_scale(d.gross_salary)::text ILIKE (v_patterns->>'gross_salary') ESCAPE E'\\')
        AND (NOT v_patterns ? 'currency' OR COALESCE(d.currency,'') ILIKE (v_patterns->>'currency') ESCAPE E'\\')
    ),
    ranked AS (
      SELECT f.*, pg_catalog.row_number() OVER (ORDER BY
        CASE WHEN (v_sorting->0->>'desc')::boolean IS FALSE THEN CASE v_sorting->0->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'payroll_group_name' THEN f.payroll_group_name WHEN 'payroll_status' THEN f.payroll_status WHEN 'currency' THEN f.currency END END ASC NULLS LAST,
        CASE WHEN (v_sorting->0->>'desc')::boolean IS TRUE THEN CASE v_sorting->0->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'payroll_group_name' THEN f.payroll_group_name WHEN 'payroll_status' THEN f.payroll_status WHEN 'currency' THEN f.currency END END DESC NULLS LAST,
        CASE WHEN v_sorting->0->>'id'='gross_salary' AND (v_sorting->0->>'desc')::boolean IS FALSE THEN f.gross_salary END ASC NULLS LAST,
        CASE WHEN v_sorting->0->>'id'='gross_salary' AND (v_sorting->0->>'desc')::boolean IS TRUE THEN f.gross_salary END DESC NULLS LAST,
        CASE WHEN (v_sorting->1->>'desc')::boolean IS FALSE THEN CASE v_sorting->1->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'payroll_group_name' THEN f.payroll_group_name WHEN 'payroll_status' THEN f.payroll_status WHEN 'currency' THEN f.currency END END ASC NULLS LAST,
        CASE WHEN (v_sorting->1->>'desc')::boolean IS TRUE THEN CASE v_sorting->1->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'payroll_group_name' THEN f.payroll_group_name WHEN 'payroll_status' THEN f.payroll_status WHEN 'currency' THEN f.currency END END DESC NULLS LAST,
        CASE WHEN v_sorting->1->>'id'='gross_salary' AND (v_sorting->1->>'desc')::boolean IS FALSE THEN f.gross_salary END ASC NULLS LAST,
        CASE WHEN v_sorting->1->>'id'='gross_salary' AND (v_sorting->1->>'desc')::boolean IS TRUE THEN f.gross_salary END DESC NULLS LAST,
        CASE WHEN (v_sorting->2->>'desc')::boolean IS FALSE THEN CASE v_sorting->2->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'payroll_group_name' THEN f.payroll_group_name WHEN 'payroll_status' THEN f.payroll_status WHEN 'currency' THEN f.currency END END ASC NULLS LAST,
        CASE WHEN (v_sorting->2->>'desc')::boolean IS TRUE THEN CASE v_sorting->2->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'payroll_group_name' THEN f.payroll_group_name WHEN 'payroll_status' THEN f.payroll_status WHEN 'currency' THEN f.currency END END DESC NULLS LAST,
        CASE WHEN v_sorting->2->>'id'='gross_salary' AND (v_sorting->2->>'desc')::boolean IS FALSE THEN f.gross_salary END ASC NULLS LAST,
        CASE WHEN v_sorting->2->>'id'='gross_salary' AND (v_sorting->2->>'desc')::boolean IS TRUE THEN f.gross_salary END DESC NULLS LAST,
        CASE WHEN (v_sorting->3->>'desc')::boolean IS FALSE THEN CASE v_sorting->3->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'payroll_group_name' THEN f.payroll_group_name WHEN 'payroll_status' THEN f.payroll_status WHEN 'currency' THEN f.currency END END ASC NULLS LAST,
        CASE WHEN (v_sorting->3->>'desc')::boolean IS TRUE THEN CASE v_sorting->3->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'payroll_group_name' THEN f.payroll_group_name WHEN 'payroll_status' THEN f.payroll_status WHEN 'currency' THEN f.currency END END DESC NULLS LAST,
        CASE WHEN v_sorting->3->>'id'='gross_salary' AND (v_sorting->3->>'desc')::boolean IS FALSE THEN f.gross_salary END ASC NULLS LAST,
        CASE WHEN v_sorting->3->>'id'='gross_salary' AND (v_sorting->3->>'desc')::boolean IS TRUE THEN f.gross_salary END DESC NULLS LAST,
        CASE WHEN (v_sorting->4->>'desc')::boolean IS FALSE THEN CASE v_sorting->4->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'payroll_group_name' THEN f.payroll_group_name WHEN 'payroll_status' THEN f.payroll_status WHEN 'currency' THEN f.currency END END ASC NULLS LAST,
        CASE WHEN (v_sorting->4->>'desc')::boolean IS TRUE THEN CASE v_sorting->4->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'payroll_group_name' THEN f.payroll_group_name WHEN 'payroll_status' THEN f.payroll_status WHEN 'currency' THEN f.currency END END DESC NULLS LAST,
        CASE WHEN v_sorting->4->>'id'='gross_salary' AND (v_sorting->4->>'desc')::boolean IS FALSE THEN f.gross_salary END ASC NULLS LAST,
        CASE WHEN v_sorting->4->>'id'='gross_salary' AND (v_sorting->4->>'desc')::boolean IS TRUE THEN f.gross_salary END DESC NULLS LAST,
        f.employee_id ASC
      ) AS ordinal
      FROM filtered AS f
    ),
    paged AS (
      SELECT r.* FROM ranked AS r ORDER BY r.ordinal LIMIT p_page_size OFFSET v_offset
    )
    SELECT pg_catalog.jsonb_build_object(
      'contractVersion',1, 'kind','salary', 'page',p_page, 'pageSize',p_page_size,
      'totalCount',(SELECT COUNT(*) FROM filtered),
      '_invalidAmount',EXISTS(SELECT 1 FROM component_totals WHERE invalid_amount OR pg_catalog.abs(gross_salary) > 35184372088831),
      'rows',COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'employee_id',p.employee_id,'employee_code',p.employee_code,'full_name_en',p.full_name_en,
          'payroll_status',p.payroll_status,'payroll_group_name',p.payroll_group_name,
          'gross_salary',p.gross_salary,'currency',p.currency
        ) ORDER BY p.ordinal)
        FROM paged AS p
      ),'[]'::jsonb)
    ) INTO v_result;
  ELSE
    WITH eligible AS MATERIALIZED (
      SELECT e.id, e.employee_code, e.full_name_en, e.full_name_ar
      FROM public.employees AS e
      WHERE e.deleted_at IS NULL
        AND e.id IN(SELECT erp_private.payroll_subject_ids('hr.payroll.view'))
        AND e.id IN(SELECT erp_private.payroll_subject_ids('hr.banking.view'))
        AND (p_owner_company_id IS NULL OR e.owner_company_id = p_owner_company_id)
        AND (p_branch_id IS NULL OR e.branch_id = p_branch_id)
        AND (
          e.employee_code ILIKE v_employee_search ESCAPE E'\\'
          OR e.full_name_en ILIKE v_employee_search ESCAPE E'\\'
          OR COALESCE(e.full_name_ar,'') ILIKE v_employee_search ESCAPE E'\\'
        )
    ),
    component_totals AS MATERIALIZED (
      SELECT c.employee_id,
        COALESCE(SUM(COALESCE(c.amount,0))
          FILTER (WHERE COALESCE(t.component_kind,'earning')='earning'),0) AS gross_salary,
        BOOL_OR(c.amount::text IN ('NaN','Infinity','-Infinity')) AS invalid_amount,
        COUNT(*) AS active_component_count
      FROM public.employee_salary_components AS c
      JOIN eligible AS e ON e.id = c.employee_id
      LEFT JOIN public.hr_salary_component_types AS t ON t.id = c.component_type_id
      WHERE c.deleted_at IS NULL AND c.is_active
      GROUP BY c.employee_id
    ),
    active_holds AS MATERIALIZED (
      SELECT h.employee_id, COUNT(*) AS active_hold_count
      FROM public.employee_payroll_holds AS h
      JOIN eligible AS e ON e.id = h.employee_id
      WHERE h.deleted_at IS NULL AND h.is_active
      GROUP BY h.employee_id
    ),
    wps_facts AS MATERIALIZED (
      SELECT w.employee_id, w.id AS profile_id, w.wps_applicable, w.wps_status,
        w.salary_payment_method,
        COALESCE(w.bank_id <> 0,false) AS has_bank,
        COALESCE(pg_catalog.btrim(w.iban,v_trim_chars) <> '',false) AS has_iban,
        COALESCE(pg_catalog.btrim(w.exchange_house,v_trim_chars) <> '',false) AS has_exchange_house,
        COALESCE(pg_catalog.btrim(w.labour_card_number,v_trim_chars) <> '',false) AS has_labour_card
      FROM public.employee_wps_profiles AS w
      JOIN eligible AS e ON e.id = w.employee_id
      -- Archived profiles remain ordinary-RLS-visible, matching the legacy global inquiry.
      -- No raw banking/identity strings leave these protected SQL expressions.
      -- No account-number/MOHRE-person-code readiness requirement is invented.
    ),
    derived AS MATERIALIZED (
      SELECT e.id AS employee_id, e.employee_code, e.full_name_en, e.full_name_ar,
        w.wps_status, w.salary_payment_method,
        COALESCE(h.active_hold_count,0) > 0 AS has_active_hold,
        CASE
          WHEN w.profile_id IS NULL THEN 'not_enrolled'
          WHEN NOT w.wps_applicable THEN 'exempt'
          WHEN w.wps_status='exempt' THEN 'exempt'
          WHEN w.wps_status='not_enrolled' THEN 'not_enrolled'
          WHEN COALESCE(h.active_hold_count,0)>0 THEN 'on_hold'
          WHEN w.wps_status='hold' THEN 'on_hold'
          WHEN (
            (w.salary_payment_method='bank_transfer' AND (NOT w.has_bank OR NOT w.has_iban))
            OR (w.salary_payment_method='exchange_house' AND NOT w.has_exchange_house)
            OR NOT w.has_labour_card
            OR COALESCE(c.active_component_count,0)=0
            OR COALESCE(c.gross_salary,0)<=0
          ) THEN 'incomplete'
          ELSE 'ready'
        END AS readiness_status
      FROM eligible AS e
      LEFT JOIN wps_facts AS w ON w.employee_id = e.id
      LEFT JOIN component_totals AS c ON c.employee_id = e.id
      LEFT JOIN active_holds AS h ON h.employee_id = e.id
    ),
    filtered AS MATERIALIZED (
      SELECT d.* FROM derived AS d
      WHERE (p_status IS NULL OR d.wps_status = p_status)
        AND (NOT p_active_hold_only OR d.has_active_hold)
        AND (
          d.employee_code ILIKE v_search ESCAPE E'\\'
          OR d.full_name_en ILIKE v_search ESCAPE E'\\'
          OR COALESCE(d.full_name_ar,'') ILIKE v_search ESCAPE E'\\'
          OR COALESCE(d.wps_status,'') ILIKE v_search ESCAPE E'\\'
          OR COALESCE(d.salary_payment_method,'') ILIKE v_search ESCAPE E'\\'
          OR d.has_active_hold::text ILIKE v_search ESCAPE E'\\'
          OR d.readiness_status ILIKE v_search ESCAPE E'\\'
        )
        AND (NOT v_patterns ? 'full_name_en' OR d.full_name_en ILIKE (v_patterns->>'full_name_en') ESCAPE E'\\')
        AND (NOT v_patterns ? 'wps_status' OR COALESCE(d.wps_status,'') ILIKE (v_patterns->>'wps_status') ESCAPE E'\\')
        AND (NOT v_patterns ? 'salary_payment_method' OR COALESCE(d.salary_payment_method,'') ILIKE (v_patterns->>'salary_payment_method') ESCAPE E'\\')
        AND (NOT v_patterns ? 'has_active_hold' OR d.has_active_hold::text ILIKE (v_patterns->>'has_active_hold') ESCAPE E'\\')
        AND (NOT v_patterns ? 'readiness_status' OR d.readiness_status ILIKE (v_patterns->>'readiness_status') ESCAPE E'\\')
    ),
    ranked AS (
      SELECT f.*, pg_catalog.row_number() OVER (ORDER BY
        CASE WHEN (v_sorting->0->>'desc')::boolean IS FALSE THEN CASE v_sorting->0->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'wps_status' THEN f.wps_status WHEN 'salary_payment_method' THEN f.salary_payment_method WHEN 'readiness_status' THEN f.readiness_status END END ASC NULLS LAST,
        CASE WHEN (v_sorting->0->>'desc')::boolean IS TRUE THEN CASE v_sorting->0->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'wps_status' THEN f.wps_status WHEN 'salary_payment_method' THEN f.salary_payment_method WHEN 'readiness_status' THEN f.readiness_status END END DESC NULLS LAST,
        CASE WHEN v_sorting->0->>'id'='has_active_hold' AND (v_sorting->0->>'desc')::boolean IS FALSE THEN f.has_active_hold END ASC NULLS LAST,
        CASE WHEN v_sorting->0->>'id'='has_active_hold' AND (v_sorting->0->>'desc')::boolean IS TRUE THEN f.has_active_hold END DESC NULLS LAST,
        CASE WHEN (v_sorting->1->>'desc')::boolean IS FALSE THEN CASE v_sorting->1->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'wps_status' THEN f.wps_status WHEN 'salary_payment_method' THEN f.salary_payment_method WHEN 'readiness_status' THEN f.readiness_status END END ASC NULLS LAST,
        CASE WHEN (v_sorting->1->>'desc')::boolean IS TRUE THEN CASE v_sorting->1->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'wps_status' THEN f.wps_status WHEN 'salary_payment_method' THEN f.salary_payment_method WHEN 'readiness_status' THEN f.readiness_status END END DESC NULLS LAST,
        CASE WHEN v_sorting->1->>'id'='has_active_hold' AND (v_sorting->1->>'desc')::boolean IS FALSE THEN f.has_active_hold END ASC NULLS LAST,
        CASE WHEN v_sorting->1->>'id'='has_active_hold' AND (v_sorting->1->>'desc')::boolean IS TRUE THEN f.has_active_hold END DESC NULLS LAST,
        CASE WHEN (v_sorting->2->>'desc')::boolean IS FALSE THEN CASE v_sorting->2->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'wps_status' THEN f.wps_status WHEN 'salary_payment_method' THEN f.salary_payment_method WHEN 'readiness_status' THEN f.readiness_status END END ASC NULLS LAST,
        CASE WHEN (v_sorting->2->>'desc')::boolean IS TRUE THEN CASE v_sorting->2->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'wps_status' THEN f.wps_status WHEN 'salary_payment_method' THEN f.salary_payment_method WHEN 'readiness_status' THEN f.readiness_status END END DESC NULLS LAST,
        CASE WHEN v_sorting->2->>'id'='has_active_hold' AND (v_sorting->2->>'desc')::boolean IS FALSE THEN f.has_active_hold END ASC NULLS LAST,
        CASE WHEN v_sorting->2->>'id'='has_active_hold' AND (v_sorting->2->>'desc')::boolean IS TRUE THEN f.has_active_hold END DESC NULLS LAST,
        CASE WHEN (v_sorting->3->>'desc')::boolean IS FALSE THEN CASE v_sorting->3->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'wps_status' THEN f.wps_status WHEN 'salary_payment_method' THEN f.salary_payment_method WHEN 'readiness_status' THEN f.readiness_status END END ASC NULLS LAST,
        CASE WHEN (v_sorting->3->>'desc')::boolean IS TRUE THEN CASE v_sorting->3->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'wps_status' THEN f.wps_status WHEN 'salary_payment_method' THEN f.salary_payment_method WHEN 'readiness_status' THEN f.readiness_status END END DESC NULLS LAST,
        CASE WHEN v_sorting->3->>'id'='has_active_hold' AND (v_sorting->3->>'desc')::boolean IS FALSE THEN f.has_active_hold END ASC NULLS LAST,
        CASE WHEN v_sorting->3->>'id'='has_active_hold' AND (v_sorting->3->>'desc')::boolean IS TRUE THEN f.has_active_hold END DESC NULLS LAST,
        CASE WHEN (v_sorting->4->>'desc')::boolean IS FALSE THEN CASE v_sorting->4->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'wps_status' THEN f.wps_status WHEN 'salary_payment_method' THEN f.salary_payment_method WHEN 'readiness_status' THEN f.readiness_status END END ASC NULLS LAST,
        CASE WHEN (v_sorting->4->>'desc')::boolean IS TRUE THEN CASE v_sorting->4->>'id' WHEN 'full_name_en' THEN f.full_name_en WHEN 'wps_status' THEN f.wps_status WHEN 'salary_payment_method' THEN f.salary_payment_method WHEN 'readiness_status' THEN f.readiness_status END END DESC NULLS LAST,
        CASE WHEN v_sorting->4->>'id'='has_active_hold' AND (v_sorting->4->>'desc')::boolean IS FALSE THEN f.has_active_hold END ASC NULLS LAST,
        CASE WHEN v_sorting->4->>'id'='has_active_hold' AND (v_sorting->4->>'desc')::boolean IS TRUE THEN f.has_active_hold END DESC NULLS LAST,
        f.employee_id ASC
      ) AS ordinal
      FROM filtered AS f
    ),
    paged AS (
      SELECT r.* FROM ranked AS r ORDER BY r.ordinal LIMIT p_page_size OFFSET v_offset
    )
    SELECT pg_catalog.jsonb_build_object(
      'contractVersion',1, 'kind','wps', 'page',p_page, 'pageSize',p_page_size,
      'totalCount',(SELECT COUNT(*) FROM filtered),
      '_invalidAmount',EXISTS(SELECT 1 FROM component_totals WHERE invalid_amount OR pg_catalog.abs(gross_salary) > 35184372088831),
      'rows',COALESCE((
        SELECT pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
          'employee_id',p.employee_id,'employee_code',p.employee_code,'full_name_en',p.full_name_en,
          'wps_status',p.wps_status,'salary_payment_method',p.salary_payment_method,
          'has_active_hold',p.has_active_hold,'readiness_status',p.readiness_status
        ) ORDER BY p.ordinal)
        FROM paged AS p
      ),'[]'::jsonb)
    ) INTO v_result;
  END IF;

  -- Exact count survives an empty/out-of-range page. A 0-row page is not proof
  -- of a 0 matching total. Money/ID DTO validation is also required in the app.
  IF (v_result->>'_invalidAmount')::boolean
     OR (v_result->>'totalCount')::numeric > 9007199254740991
     OR EXISTS (
       SELECT 1 FROM pg_catalog.jsonb_array_elements(v_result->'rows') AS item(value)
       WHERE (item.value->>'employee_id')::numeric NOT BETWEEN 1 AND 9007199254740991
     )
  THEN
    RAISE EXCEPTION 'Inquiry result unavailable' USING ERRCODE = '22003';
  END IF;
  RETURN v_result - '_invalidAmount';
END
$prototype$;

-- Exact function ACL only. No global ALTER DEFAULT PRIVILEGES or table grants.
REVOKE ALL ON FUNCTION public.perf_hr_payroll_inquiry(
  text,integer,integer,text,text,bigint,bigint,text,boolean,jsonb,jsonb
) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.perf_hr_payroll_inquiry(
  text,integer,integer,text,text,bigint,bigint,text,boolean,jsonb,jsonb
) TO authenticated;


COMMIT;
