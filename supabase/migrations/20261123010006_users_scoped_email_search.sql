BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Match the Users list's profile and active-role visibility in the authenticated
-- caller's scope. Access to auth.users is confined to this search and no Auth
-- columns or unbounded matching-ID list cross the function boundary.
CREATE FUNCTION public.erp_users_search_email_page(
  p_search text,
  p_status text,
  p_company_id bigint,
  p_branch_id bigint,
  p_role_id bigint,
  p_require_password_change boolean,
  p_offset bigint,
  p_limit integer
)
RETURNS TABLE (total_count bigint, profile_ids bigint[])
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  search_term text := pg_catalog.lower(pg_catalog.btrim(p_search));
BEGIN
  IF NOT erp_private.business_principal_is_active()
     OR NOT public.current_user_has_permission_any_scope('users.view') THEN
    RAISE EXCEPTION 'Users search denied' USING ERRCODE = '42501';
  END IF;
  IF search_term IS NULL OR pg_catalog.strpos(search_term, '@') = 0
     OR p_offset IS NULL OR p_offset < 0 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'Invalid Users email search' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  WITH companies AS MATERIALIZED (
    SELECT id FROM public.owner_companies
    WHERE public.current_user_has_permission_in_company('users.view', id)
  ),
  branches AS MATERIALIZED (
    SELECT id FROM public.branches
    WHERE public.current_user_has_permission_in_branch('users.view', id)
  ),
  matching AS MATERIALIZED (
    SELECT profile.id
    FROM public.user_profiles AS profile
    JOIN auth.users AS account ON account.id = profile.auth_user_id
    WHERE (
      profile.auth_user_id = auth.uid()
      OR (SELECT public.current_user_is_global_admin())
      OR profile.owner_company_id IN (SELECT id FROM companies)
      OR profile.branch_id IN (SELECT id FROM branches)
    )
    AND account.deleted_at IS NULL
    AND pg_catalog.strpos(pg_catalog.lower(account.email), search_term) > 0
    AND (p_status IS NULL OR profile.status = p_status)
    AND (p_company_id IS NULL OR profile.owner_company_id = p_company_id)
    AND (p_branch_id IS NULL OR profile.branch_id = p_branch_id)
    AND (p_require_password_change IS NOT TRUE OR profile.must_change_password)
    AND (
      p_role_id IS NULL OR EXISTS (
        SELECT 1
        FROM public.user_roles AS assignment
        WHERE assignment.user_profile_id = profile.id
          AND assignment.role_id = p_role_id
          AND assignment.is_active
      )
    )
  ),
  page AS (
    SELECT id FROM matching ORDER BY id OFFSET p_offset LIMIT p_limit
  )
  SELECT (SELECT pg_catalog.count(*) FROM matching),
    coalesce((SELECT pg_catalog.array_agg(id ORDER BY id) FROM page), ARRAY[]::bigint[]);
END;
$function$;

REVOKE ALL ON FUNCTION public.erp_users_search_email_page(text, text, bigint, bigint, bigint, boolean, bigint, integer)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.erp_users_search_email_page(text, text, bigint, bigint, bigint, boolean, bigint, integer)
  TO authenticated;

COMMIT;
