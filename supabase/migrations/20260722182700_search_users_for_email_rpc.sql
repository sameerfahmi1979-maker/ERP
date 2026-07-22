-- RPC: search_users_for_email
-- Returns user_profile id, full_name, and auth email for recipient selection.
-- user_profiles does NOT have an email column — email lives in auth.users.
-- SECURITY DEFINER allows the function to cross the auth/public schema boundary.
-- Called by getUsersForEmailSelect server action (DMS expiry email dialog).

CREATE OR REPLACE FUNCTION public.search_users_for_email(p_search TEXT DEFAULT '')
RETURNS TABLE (
  id         BIGINT,
  full_name  TEXT,
  email      TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT
    up.id,
    COALESCE(up.full_name, up.display_name, up.user_code) AS full_name,
    au.email
  FROM public.user_profiles up
  JOIN auth.users au ON au.id = up.auth_user_id
  WHERE
    au.email IS NOT NULL
    AND (
      p_search = ''
      OR up.full_name    ILIKE '%' || p_search || '%'
      OR up.display_name ILIKE '%' || p_search || '%'
      OR au.email        ILIKE '%' || p_search || '%'
    )
  ORDER BY up.full_name NULLS LAST
  LIMIT 20;
$$;

-- Revoke direct public access; the server action calls this via service role
REVOKE EXECUTE ON FUNCTION public.search_users_for_email(TEXT) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.search_users_for_email(TEXT) TO service_role;
