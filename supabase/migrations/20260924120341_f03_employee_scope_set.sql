BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Statement-local set, not a session/cache grant. Same subject semantics as
-- employee_permission, without resolving the actor and roles per employee row.
CREATE OR REPLACE FUNCTION erp_private.readable_employee_ids()
RETURNS SETOF bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 WITH actor AS MATERIALIZED (
  SELECT p.id,p.owner_company_id,p.branch_id FROM public.user_profiles p
  WHERE p.auth_user_id=(SELECT auth.uid()) AND (SELECT erp_private.business_principal_is_active())
 ), identity_link AS MATERIALIZED (
  SELECT l.employee_id FROM public.erp_user_employee_links l JOIN actor a ON a.id=l.user_profile_id
  JOIN public.employees e ON e.id=l.employee_id AND e.deleted_at IS NULL
   AND e.owner_company_id=a.owner_company_id AND e.branch_id IS NOT DISTINCT FROM a.branch_id
 ), grants AS MATERIALIZED (
  SELECT ur.owner_company_id,ur.branch_id,p.permission_code FROM public.user_roles ur
  JOIN actor a ON a.id=ur.user_profile_id JOIN public.roles r ON r.id=ur.role_id AND r.is_active
  JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions p ON p.id=rp.permission_id AND p.is_active
  WHERE ur.is_active AND p.permission_code IN ('hr.employees.view','hr.employees.view.self','hr.employees.view.team',
   'hr.employee_profile.view','hr.employee_profile.view.self','hr.employee_profile.view.team')
 )
 SELECT e.id FROM public.employees e WHERE e.deleted_at IS NULL AND EXISTS(SELECT 1 FROM actor)
  AND ((SELECT public.current_user_is_global_admin()) OR EXISTS(
   SELECT 1 FROM grants g WHERE ((g.owner_company_id IS NULL AND g.branch_id IS NULL)
    OR (g.owner_company_id=e.owner_company_id AND (g.branch_id IS NULL OR g.branch_id=e.branch_id)))
    AND (g.permission_code IN ('hr.employees.view','hr.employee_profile.view')
     OR (g.permission_code IN ('hr.employees.view.self','hr.employee_profile.view.self') AND e.id IN (SELECT employee_id FROM identity_link))
     OR (g.permission_code IN ('hr.employees.view.team','hr.employee_profile.view.team')
       AND e.reporting_manager_id IN (SELECT employee_id FROM identity_link) AND e.id<>e.reporting_manager_id))));
$$;
REVOKE ALL ON FUNCTION erp_private.readable_employee_ids() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.readable_employee_ids() TO authenticated;
ALTER POLICY employees_select ON public.employees USING (id IN (SELECT erp_private.readable_employee_ids()));

-- Keep the intake UPDATE policy independently explicit as well as protected by
-- f03_upload_subject. Do not leave an always-true write policy for later changes
-- to accidentally expose if a restrictive policy is removed.
ALTER POLICY f03_upload_update ON public.dms_upload_sessions
 USING (erp_private.upload_row_allowed(uploaded_by,owning_company_id,owning_branch_id,document_id))
 WITH CHECK (erp_private.upload_row_allowed(uploaded_by,owning_company_id,owning_branch_id,document_id));
NOTIFY pgrst,'reload schema';
COMMIT;
