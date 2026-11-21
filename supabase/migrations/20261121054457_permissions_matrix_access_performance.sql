BEGIN;

SET LOCAL lock_timeout = '2s';
SET LOCAL statement_timeout = '15s';

-- These predicates depend on the current principal. Scalar subqueries let
-- PostgreSQL evaluate them once per statement.
ALTER POLICY permissions_select ON public.permissions
  USING ((SELECT public.current_user_has_permission_any_scope('permissions.view')));

ALTER POLICY permissions_manage ON public.permissions
  USING ((SELECT public.current_user_is_global_admin() OR public.current_user_has_permission('permissions.manage')));

ALTER POLICY role_permissions_select ON public.role_permissions
  USING ((SELECT public.current_user_has_permission_any_scope('roles.view')));

ALTER POLICY role_permissions_manage ON public.role_permissions
  USING ((SELECT public.current_user_is_global_admin() OR public.current_user_has_permission('roles.manage')));

COMMIT;

