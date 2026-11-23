BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION public.mobile_hr_v5_directory_details(p_employees bigint[]) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' SET jit = off AS $$
DECLARE
  directory_rows jsonb;
BEGIN
  IF cardinality(p_employees) IS NULL OR cardinality(p_employees) NOT BETWEEN 1 AND 25
    OR array_ndims(p_employees) <> 1
    OR EXISTS (SELECT FROM unnest(p_employees) AS ids(id) WHERE id IS NULL OR id <= 0)
    OR cardinality(p_employees) <> (SELECT count(DISTINCT id) FROM unnest(p_employees) AS ids(id)) THEN
    RAISE EXCEPTION 'Invalid directory subjects' USING ERRCODE = '22023';
  END IF;

  IF NOT erp_private.business_principal_is_active() THEN
    RAISE EXCEPTION 'Current employee access is required' USING ERRCODE = '42501';
  END IF;

  -- Fixed projection of the mobile_hr_profile subject and contact policy.
  -- All tables retain invoker RLS, including independently protected labels.
  WITH own AS MATERIALIZED (SELECT (public.mobile_hr_own_access()->>'employeeId')::bigint AS id)
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'employeeId', e.id, 'employeeCode', e.employee_code, 'name', e.full_name_en,
    'company', c.legal_name_en, 'branch', b.branch_name_en, 'department', g.department_name_en,
    'designation', d.designation_name_en, 'site', w.site_name, 'status', e.employee_status,
    'phone', CASE WHEN own.id=e.id OR erp_private.employee_permission(e.id,'hr.employees.update')
      OR erp_private.employee_permission(e.id,'hr.employee_profile.manage') THEN e.mobile_number END
  ) ORDER BY selected.position), '[]'::jsonb)
  INTO directory_rows
  FROM unnest(p_employees) WITH ORDINALITY AS selected(id, position)
  JOIN public.employees e ON e.id=selected.id
  CROSS JOIN own
  LEFT JOIN public.owner_companies c ON c.id=e.owner_company_id
  LEFT JOIN public.branches b ON b.id=e.branch_id
  LEFT JOIN public.departments g ON g.id=e.department_id
  LEFT JOIN public.designations d ON d.id=e.designation_id
  LEFT JOIN public.work_sites w ON w.id=e.primary_work_site_id
  WHERE e.deleted_at IS NULL AND public.current_user_can_view_employee(e.id);

  IF jsonb_array_length(directory_rows) <> cardinality(p_employees) THEN
    RAISE EXCEPTION 'Current employee access is required' USING ERRCODE = '42501';
  END IF;
  RETURN directory_rows;
END;
$$;

REVOKE ALL ON FUNCTION public.mobile_hr_v5_directory_details(bigint[]) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.mobile_hr_v5_directory_details(bigint[]) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
