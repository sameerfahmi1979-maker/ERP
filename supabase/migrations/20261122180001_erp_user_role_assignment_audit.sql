BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- The non-login transaction audit writer inherits the caller table grants and RLS.
-- Its additional audit INSERT is used only after a witnessed role change.
CREATE FUNCTION public.erp_assign_user_role(
  target_profile_id bigint, target_role_id bigint, company_id bigint, branch_id bigint, assignment_active boolean
)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor bigint := public.current_user_profile_id();
  target_code text;
  role_code text;
  role_name text;
  new_id bigint;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Role assignment unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT p.user_code INTO target_code FROM public.user_profiles p WHERE p.id = target_profile_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role assignment unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT r.role_code, r.role_name INTO role_code, role_name FROM public.roles r WHERE r.id = target_role_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role assignment unavailable' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.user_roles (user_profile_id, role_id, owner_company_id, branch_id, is_active, assigned_by)
  VALUES (target_profile_id, target_role_id, company_id, branch_id, assignment_active, actor)
  RETURNING id INTO STRICT new_id;

  INSERT INTO public.audit_logs (
    actor_user_profile_id, owner_company_id, branch_id, module_code, entity_name,
    entity_id, entity_reference, action, new_values
  )
  VALUES (
    actor, company_id, branch_id, 'users', 'user_roles', new_id,
    coalesce(nullif(target_code, ''), 'user-' || target_profile_id) || ' → ' || role_code,
    'USER_ROLE_ASSIGNED',
    pg_catalog.jsonb_build_object(
      'user_profile_id', target_profile_id, 'role', role_name,
      'scope', CASE WHEN branch_id IS NOT NULL THEN 'branch' WHEN company_id IS NOT NULL THEN 'company' ELSE 'global' END
    )
  );
  IF NOT FOUND THEN RAISE EXCEPTION 'Role audit receipt unavailable'; END IF;
  RETURN new_id;
END;
$$;

CREATE FUNCTION public.erp_remove_user_role(assignment_id bigint)
RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  actor bigint := public.current_user_profile_id();
  observed record;
  removed public.user_roles;
BEGIN
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Role removal unavailable' USING ERRCODE = '42501';
  END IF;

  -- The removal itself may withdraw the actor's permission to read role labels.
  SELECT a.user_profile_id, a.role_id, a.owner_company_id, a.branch_id,
         p.user_code, r.role_code, r.role_name INTO observed
  FROM public.user_roles a
  JOIN public.user_profiles p ON p.id = a.user_profile_id
  JOIN public.roles r ON r.id = a.role_id
  WHERE a.id = assignment_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role assignment unavailable' USING ERRCODE = '42501';
  END IF;

  -- Match the captured assignment binding so a concurrent scope change fails safely.
  DELETE FROM public.user_roles a
  WHERE a.id = assignment_id
    AND a.user_profile_id = observed.user_profile_id
    AND a.role_id = observed.role_id
    AND a.owner_company_id IS NOT DISTINCT FROM observed.owner_company_id
    AND a.branch_id IS NOT DISTINCT FROM observed.branch_id
  RETURNING a.* INTO removed;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Role assignment unavailable' USING ERRCODE = '42501';
  END IF;

  INSERT INTO public.audit_logs (
    actor_user_profile_id, owner_company_id, branch_id, module_code, entity_name,
    entity_id, entity_reference, action, old_values
  )
  VALUES (
    actor, removed.owner_company_id, removed.branch_id, 'users', 'user_roles', removed.id,
    coalesce(nullif(observed.user_code, ''), 'user-' || removed.user_profile_id) || ' → ' || observed.role_code,
    'USER_ROLE_REMOVED',
    pg_catalog.jsonb_build_object(
      'user_profile_id', removed.user_profile_id, 'role', observed.role_name,
      'scope', CASE WHEN removed.branch_id IS NOT NULL THEN 'branch' WHEN removed.owner_company_id IS NOT NULL THEN 'company' ELSE 'global' END
    )
  );
  IF NOT FOUND THEN RAISE EXCEPTION 'Role audit receipt unavailable'; END IF;
  RETURN removed.id;
END;
$$;

REVOKE ALL ON FUNCTION public.erp_assign_user_role(bigint,bigint,bigint,bigint,boolean) FROM PUBLIC, anon, service_role;
REVOKE ALL ON FUNCTION public.erp_remove_user_role(bigint) FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.erp_assign_user_role(bigint,bigint,bigint,bigint,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.erp_remove_user_role(bigint) TO authenticated;

GRANT CREATE ON SCHEMA public TO erp_transaction_audit_writer;
ALTER FUNCTION public.erp_assign_user_role(bigint,bigint,bigint,bigint,boolean) OWNER TO erp_transaction_audit_writer;
ALTER FUNCTION public.erp_remove_user_role(bigint) OWNER TO erp_transaction_audit_writer;
REVOKE CREATE ON SCHEMA public FROM erp_transaction_audit_writer;

NOTIFY pgrst, 'reload schema';
COMMIT;


