BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
-- Receipt-only reconciliation is intentionally separate from replay. No old
-- private payload or hash is exposed, and no mutation is attempted.
CREATE FUNCTION erp_private.f11_reconcile_employee(p_operation uuid)RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE receipt jsonb; employee record;
BEGIN
 IF auth.uid()IS NULL OR NOT erp_private.business_principal_is_active()THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 IF p_operation IS NULL THEN RAISE EXCEPTION 'Invalid operation' USING ERRCODE='22023';END IF;
 receipt:=erp_private.workspace_receipt_read(p_operation);
 IF receipt IS NULL OR receipt->>'entity'<>'employees'THEN RETURN NULL;END IF;
 SELECT id,owner_company_id,branch_id,deleted_at INTO employee FROM public.employees WHERE id=(receipt->>'id')::bigint;
 IF NOT FOUND THEN RETURN NULL;END IF;
 IF employee.deleted_at IS NULL THEN
  IF NOT(erp_private.employee_permission(employee.id,'hr.employees.view')OR erp_private.employee_permission(employee.id,'hr.employee_profile.view'))THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 ELSE
  IF NOT erp_private.permission_in_scope('hr.employees.archive',employee.owner_company_id,employee.branch_id) OR NOT(erp_private.permission_in_scope('hr.employees.update',employee.owner_company_id,employee.branch_id)OR erp_private.permission_in_scope('hr.employee_profile.manage',employee.owner_company_id,employee.branch_id))THEN RAISE EXCEPTION 'Permission denied' USING ERRCODE='42501';END IF;
 END IF;
 RETURN jsonb_build_object('id',employee.id,'revision',receipt->>'revision','replayed',true);
END $$;
CREATE FUNCTION public.f11_reconcile_employee(p_operation uuid)RETURNS jsonb
LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.f11_reconcile_employee(p_operation)$$;
REVOKE ALL ON FUNCTION erp_private.f11_reconcile_employee(uuid),public.f11_reconcile_employee(uuid)FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f11_reconcile_employee(uuid),public.f11_reconcile_employee(uuid)TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
