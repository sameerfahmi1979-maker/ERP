BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Server bootstrap after GoTrue and f03_current_session_valid. This function
-- transports the current principal graph only; record reads still use caller RLS.
CREATE FUNCTION public.erp_current_auth_graph(p_auth_user_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = ''
AS $$
  WITH profile AS (
    SELECT p.*
    FROM public.user_profiles p
    WHERE p.auth_user_id = p_auth_user_id
  ), assignments AS (
    SELECT ur.role_id, ur.owner_company_id, ur.branch_id
    FROM profile p
    JOIN public.user_roles ur ON ur.user_profile_id = p.id
    WHERE p.status = 'active' AND p.must_change_password IS NOT TRUE AND ur.is_active
  ), active_roles AS (
    SELECT r.id, r.role_code
    FROM public.roles r
    WHERE r.is_active AND EXISTS (SELECT FROM assignments a WHERE a.role_id = r.id)
  ), links AS (
    SELECT rp.role_id, rp.permission_id
    FROM active_roles r
    JOIN public.role_permissions rp ON rp.role_id = r.id
  ), active_permissions AS (
    SELECT p.id, p.permission_code
    FROM public.permissions p
    WHERE p.is_active AND EXISTS (SELECT FROM links l WHERE l.permission_id = p.id)
  )
  SELECT jsonb_build_object(
    'profile', to_jsonb(p),
    'assignments', COALESCE((SELECT jsonb_agg(a ORDER BY a.role_id, a.owner_company_id, a.branch_id) FROM assignments a), '[]'::jsonb),
    'roles', COALESCE((SELECT jsonb_agg(r ORDER BY r.id) FROM active_roles r), '[]'::jsonb),
    'links', COALESCE((SELECT jsonb_agg(l ORDER BY l.role_id, l.permission_id) FROM links l), '[]'::jsonb),
    'permissions', COALESCE((SELECT jsonb_agg(ap ORDER BY ap.id) FROM active_permissions ap), '[]'::jsonb)
  )
  FROM profile p;
$$;

REVOKE ALL ON FUNCTION public.erp_current_auth_graph(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.erp_current_auth_graph(uuid) TO service_role;
NOTIFY pgrst, 'reload schema';
COMMIT;
