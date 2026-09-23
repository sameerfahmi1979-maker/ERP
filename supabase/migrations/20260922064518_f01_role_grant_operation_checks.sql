-- F01 follow-up: grants must be active/assignable; revocation must remain possible.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE OR REPLACE FUNCTION public.current_user_can_manage_user_role_assignment(target_user_profile_id bigint, target_role_id bigint, target_owner_company_id bigint, target_branch_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO pg_catalog, public, pg_temp
AS $function$
declare
  v_is_global_admin boolean;
  v_current_profile_id bigint;
  v_target_user_company_id bigint;
  v_target_user_branch_id bigint;
  v_target_role_code text;
  v_current_user_has_company_admin boolean;
  v_current_user_has_branch_admin boolean;
begin
  -- Get current user's profile
  v_current_profile_id := public.current_user_profile_id();
  if v_current_profile_id is null then
    return false;
  end if;

  -- Authority applies to revocation too; active/assignable requirements live in write checks.
  if not exists(select 1 from public.roles where id = target_role_id)
     or not exists(select 1 from public.user_profiles where id = target_user_profile_id) then
    return false;
  end if;
  -- Check if current user is true global admin
  v_is_global_admin := public.current_user_is_global_admin();

  -- Global admins can manage any role assignment
  if v_is_global_admin then
    return true;
  end if;

  -- Get target role code
  select role_code into v_target_role_code
  from public.roles
  where id = target_role_id;

  if v_target_role_code is null then
    return false;
  end if;

  -- Non-global admins cannot assign system_admin or group_admin
  if v_target_role_code in ('system_admin', 'group_admin') then
    return false;
  end if;

  -- Non-global admins cannot create global-null assignments
  if target_owner_company_id is null and target_branch_id is null then
    return false;
  end if;

  -- A scoped administrator cannot delegate a capability they do not possess.
  if exists (
    select 1 from public.role_permissions rp join public.permissions p on p.id = rp.permission_id
    where rp.role_id = target_role_id and p.is_active and (
      p.permission_code in ('erp.admin', 'roles.manage', 'permissions.manage')
      or p.permission_code like 'settings.%' or p.permission_code like 'numbering.rules.%'
      or not case when target_branch_id is not null
        then public.current_user_has_permission_in_branch(p.permission_code, target_branch_id)
        else public.current_user_has_permission_in_company(p.permission_code, target_owner_company_id) end
    )
  ) then return false; end if;

  -- Get target user's company and branch
  select owner_company_id, branch_id
  into v_target_user_company_id, v_target_user_branch_id
  from public.user_profiles
  where id = target_user_profile_id;

  if v_target_user_company_id is null then
    return false;  -- Target user must belong to a company for scoped admin management
  end if;

  -- Check if current user has company-level admin permission in target company
  v_current_user_has_company_admin := public.current_user_has_permission_in_company(
    'users.update',
    v_target_user_company_id
  );

  if v_current_user_has_company_admin then
    -- Company admin can assign roles within their company
    -- But the assignment scope must match
    if target_owner_company_id = v_target_user_company_id then
      -- If assigning branch-scoped role, branch must belong to the company
      if target_branch_id is not null then
        return exists (
          select 1
          from public.branches
          where id = target_branch_id
            and owner_company_id = target_owner_company_id
        );
      end if;
      return true;
    end if;
    return false;
  end if;

  -- Check if current user has branch-level admin permission
  if v_target_user_branch_id is not null then
    v_current_user_has_branch_admin := public.current_user_has_permission_in_branch(
      'users.update',
      v_target_user_branch_id
    );

    if v_current_user_has_branch_admin then
      -- Branch admin can only assign branch-scoped roles within their branch
      return target_owner_company_id = v_target_user_company_id
        and target_branch_id = v_target_user_branch_id;
    end if;
  end if;

  return false;
end;
$function$;

CREATE OR REPLACE FUNCTION public.role_assignment_target_is_assignable(target_user_profile_id bigint, target_role_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO pg_catalog, public, pg_temp
AS $function$
 SELECT public.current_user_profile_id() IS NOT NULL
 AND EXISTS (SELECT 1 FROM public.roles WHERE id=$2 AND is_active AND is_assignable)
 AND EXISTS (SELECT 1 FROM public.user_profiles WHERE id=$1 AND status='active');
$function$;
REVOKE ALL ON FUNCTION public.role_assignment_target_is_assignable(bigint,bigint) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.role_assignment_target_is_assignable(bigint,bigint) TO authenticated, service_role;

DROP POLICY user_roles_manage_scoped ON public.user_roles;
CREATE POLICY f01_user_roles_insert ON public.user_roles FOR INSERT TO authenticated
WITH CHECK (public.current_user_can_manage_user_role_assignment(user_profile_id,role_id,owner_company_id,branch_id)
 AND public.role_assignment_target_is_assignable(user_profile_id,role_id));
CREATE POLICY f01_user_roles_update ON public.user_roles FOR UPDATE TO authenticated
USING (public.current_user_can_manage_user_role_assignment(user_profile_id,role_id,owner_company_id,branch_id))
WITH CHECK (public.current_user_can_manage_user_role_assignment(user_profile_id,role_id,owner_company_id,branch_id)
 AND (NOT is_active OR public.role_assignment_target_is_assignable(user_profile_id,role_id)));
CREATE POLICY f01_user_roles_delete ON public.user_roles FOR DELETE TO authenticated
USING (public.current_user_can_manage_user_role_assignment(user_profile_id,role_id,owner_company_id,branch_id));
NOTIFY pgrst, 'reload schema';
COMMIT;
