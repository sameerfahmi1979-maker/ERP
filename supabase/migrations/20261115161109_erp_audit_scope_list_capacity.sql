BEGIN;
SET LOCAL search_path = pg_catalog;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Each non-null audit scope references the catalogue. Keep the existing
-- permission helpers and resolve them once per scope rather than per log row.
DO $guard$
BEGIN
  IF current_user <> 'postgres'
    OR NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.audit_logs'::regclass
      AND polname = 'audit_logs_select' AND polcmd = 'r' AND polpermissive
      AND md5(pg_get_expr(polqual, polrelid)) = '35ca72be6eda2c6c58e7bb270a41470e')
    OR (SELECT count(*) FROM pg_constraint WHERE conrelid = 'public.audit_logs'::regclass
      AND convalidated AND contype = 'f' AND (
        (conname = 'audit_logs_owner_company_id_fkey' AND confrelid = 'public.owner_companies'::regclass)
        OR (conname = 'audit_logs_branch_id_fkey' AND confrelid = 'public.branches'::regclass))) <> 2 THEN
    RAISE EXCEPTION 'Audit scope prerequisites changed';
  END IF;
END $guard$;

CREATE FUNCTION erp_private.audit_readable_scope_ids(scope_kind text)
RETURNS SETOF bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $scopes$
  SELECT company.id FROM public.owner_companies company
  WHERE scope_kind = 'company' AND public.current_user_has_permission_in_company('audit.view', company.id)
  UNION ALL
  SELECT branch.id FROM public.branches branch
  WHERE scope_kind = 'branch' AND public.current_user_has_permission_in_branch('audit.view', branch.id);
$scopes$;
REVOKE ALL ON FUNCTION erp_private.audit_readable_scope_ids(text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.audit_readable_scope_ids(text) TO authenticated;

ALTER POLICY audit_logs_select ON public.audit_logs USING (
  (SELECT public.current_user_is_global_admin())
  OR owner_company_id IN (SELECT erp_private.audit_readable_scope_ids('company'))
  OR branch_id IN (SELECT erp_private.audit_readable_scope_ids('branch'))
);

COMMIT;
