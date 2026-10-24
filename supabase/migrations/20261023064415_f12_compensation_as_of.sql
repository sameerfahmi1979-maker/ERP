BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Read-only facts, not a bank/WPS payment certification or statutory engine.
-- Existing payroll RLS/column grants and actor/session authority remain intact.
CREATE FUNCTION public.f12_salary_as_of(
  p_employee bigint,
  p_as_of date DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Dubai')::date
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $$
DECLARE
  profile public.employee_payroll_profiles%ROWTYPE;
  component record;
  types bigint[] := ARRAY[]::bigint[];
  gross numeric := 0;
  basic numeric := 0;
  deductions numeric := 0;
  item_count integer := 0;
  sources jsonb := '[]'::jsonb;
BEGIN
  IF p_employee IS NULL OR p_employee <= 0 OR p_as_of IS NULL
    OR auth.uid() IS NULL OR NOT erp_private.business_principal_is_active()
    OR NOT public.f03_has_employee_permission(p_employee, 'hr.payroll.view')
    OR NOT EXISTS (SELECT 1 FROM public.employees WHERE id = p_employee AND deleted_at IS NULL)
  THEN RAISE EXCEPTION 'Current payroll subject access required' USING ERRCODE = '42501'; END IF;

  SELECT * INTO profile FROM public.employee_payroll_profiles
  WHERE employee_id = p_employee AND deleted_at IS NULL;
  IF NOT FOUND OR profile.currency !~ '^[A-Z]{3}$' THEN
    RAISE EXCEPTION 'Salary profile/currency not configured' USING ERRCODE = '23514';
  END IF;
  IF profile.effective_date > p_as_of THEN
    RAISE EXCEPTION 'Historical salary currency needs review' USING ERRCODE = '23514';
  END IF;

  FOR component IN
    SELECT c.id, c.component_type_id, c.amount, c.effective_from,
      c.effective_to, c.is_active, c.workspace_revision,
      t.component_kind, t.is_basic
    FROM public.employee_salary_components c
    LEFT JOIN public.hr_salary_component_types t ON t.id = c.component_type_id
    WHERE c.employee_id = p_employee AND c.deleted_at IS NULL
    ORDER BY c.id
  LOOP
    IF component.effective_to < component.effective_from THEN
      RAISE EXCEPTION 'Invalid salary interval' USING ERRCODE = '23514';
    END IF;
    IF component.effective_from > p_as_of
      OR component.effective_to < p_as_of
      OR (NOT component.is_active AND component.effective_to IS NULL)
    THEN CONTINUE; END IF;
    -- Never infer approved history merely from a legacy inactive row's end date.
    IF NOT component.is_active THEN
      RAISE EXCEPTION 'Historical salary provenance needs review' USING ERRCODE = '23514';
    END IF;
    IF component.component_type_id = ANY(types) THEN
      RAISE EXCEPTION 'Overlapping salary components' USING ERRCODE = '23514';
    END IF;
    types := array_append(types, component.component_type_id);
    IF component.amount IS NULL OR component.amount < 0
      OR component.component_kind IS NULL
      OR component.component_kind NOT IN ('earning', 'deduction')
      OR component.is_basic IS NULL
      OR (component.is_basic AND component.component_kind <> 'earning')
    THEN RAISE EXCEPTION 'Salary component meaning unavailable' USING ERRCODE = '23514'; END IF;
    IF component.component_kind = 'earning' THEN gross := gross + component.amount;
    ELSE deductions := deductions + component.amount; END IF;
    IF component.is_basic THEN basic := basic + component.amount; END IF;
    item_count := item_count + 1;
    sources := sources || jsonb_build_array(to_jsonb(component));
  END LOOP;
  IF deductions > gross THEN
    RAISE EXCEPTION 'Salary deductions exceed earnings' USING ERRCODE = '23514';
  END IF;
  RETURN jsonb_build_object(
    'asOf', p_as_of, 'currency', profile.currency, 'precision', 2,
    'basic', round(basic, 2)::text, 'gross', round(gross, 2)::text,
    'deductions', round(deductions, 2)::text, 'net', round(gross - deductions, 2)::text,
    'activeCount', item_count, 'payrollStatus', profile.payroll_status,
    'sourceFingerprint', encode(sha256(convert_to(
      jsonb_build_object('profile', to_jsonb(profile), 'components', sources, 'asOf', p_as_of)::text,
      'UTF8')), 'hex'));
END;
$$;
REVOKE ALL ON FUNCTION public.f12_salary_as_of(bigint, date) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.f12_salary_as_of(bigint, date) TO authenticated;
COMMENT ON FUNCTION public.f12_salary_as_of(bigint, date) IS
  'F12-04 exact two-decimal source facts under current payroll scope. Not approval, payment, bank acceptance or statutory calculation.';
NOTIFY pgrst, 'reload schema';
COMMIT;
