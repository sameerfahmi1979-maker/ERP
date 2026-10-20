BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';
CREATE FUNCTION erp_private.f11_dependent_medical(p_employee bigint,p_dependent bigint,p_revision bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',d.id,'employee_id',d.employee_id,'revision',d.workspace_revision,
 'medical_insurance_provider',d.medical_insurance_provider,'medical_insurance_policy',d.medical_insurance_policy,
 'medical_insurance_card',d.medical_insurance_card,'medical_insurance_expiry',d.medical_insurance_expiry)
 FROM public.employee_dependents d WHERE d.id=p_dependent AND d.employee_id=p_employee AND d.workspace_revision=p_revision AND d.deleted_at IS NULL
 AND (SELECT auth.uid()) IS NOT NULL AND (SELECT erp_private.business_principal_is_active())
 AND public.current_user_can_view_employee(p_employee) AND erp_private.employee_permission(p_employee,'hr.compliance.view')
 AND erp_private.employee_permission(p_employee,'hr.medical.view');
$$;
CREATE FUNCTION public.f11_dependent_medical(p_employee bigint,p_dependent bigint,p_revision bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$SELECT erp_private.f11_dependent_medical(p_employee,p_dependent,p_revision)$$;
-- Identifier-only reconciliation of an actor's own committed operation. No raw
-- form/evidence payload is retained or returned after a privacy retirement.
CREATE FUNCTION public.f11_reconcile_dependent(p_operation uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT (erp_private.f11_dependent_receipt_read(p_operation)-'hash'-'kind')||jsonb_build_object('operation_id',p_operation,'replayed',true);
$$;
REVOKE ALL ON FUNCTION erp_private.f11_dependent_medical(bigint,bigint,bigint),public.f11_dependent_medical(bigint,bigint,bigint),public.f11_reconcile_dependent(uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.f11_dependent_medical(bigint,bigint,bigint),public.f11_dependent_medical(bigint,bigint,bigint),public.f11_reconcile_dependent(uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
