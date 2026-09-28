BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION public.current_user_can_manage_user_role_assignment(target_user_profile_id bigint, target_role_id bigint, target_owner_company_id bigint, target_branch_id bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.user_profiles; code text;
BEGIN
  IF NOT erp_private.business_principal_is_active() THEN RETURN false; END IF;
  SELECT * INTO target FROM public.user_profiles WHERE id=$1;
  SELECT role_code INTO code FROM public.roles WHERE id=$2;
  IF target.id IS NULL OR code IS NULL THEN RETURN false; END IF;
  IF $4 IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches WHERE id=$4 AND owner_company_id=$3) THEN RETURN false; END IF;
  IF public.current_user_is_global_admin() THEN RETURN true; END IF;
  IF code IN ('system_admin','group_admin') OR $3 IS NULL OR $3 IS DISTINCT FROM target.owner_company_id THEN RETURN false; END IF;
  IF EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
    WHERE ur.user_profile_id=$1 AND ur.is_active AND r.is_active AND ur.owner_company_id IS NULL AND ur.branch_id IS NULL AND r.role_code IN ('system_admin','group_admin')) THEN RETURN false; END IF;
  IF NOT (public.current_user_has_permission_in_company('users.roles.assign',$3) OR
    ($4 IS NOT NULL AND $4=target.branch_id AND public.current_user_has_permission_in_branch('users.roles.assign',$4))) THEN RETURN false; END IF;
  -- Each delegated capability must be held at the same or a broader scope by this actor.
  RETURN NOT EXISTS(SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id
    WHERE rp.role_id=$2 AND p.is_active AND (
      p.permission_code IN ('erp.admin','roles.manage','permissions.manage') OR p.permission_code LIKE 'settings.%' OR p.permission_code LIKE 'numbering.rules.%'
      OR NOT CASE WHEN $4 IS NOT NULL THEN public.current_user_has_permission_in_branch(p.permission_code,$4)
        ELSE public.current_user_has_permission_in_company(p.permission_code,$3) END));
END $$;

CREATE OR REPLACE FUNCTION erp_private.may_edit_role(target_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT erp_private.business_principal_is_active() AND EXISTS(SELECT 1 FROM public.roles r WHERE r.id=$1
    AND (public.current_user_is_global_admin() OR (NOT r.is_system_role AND public.current_user_has_permission_globally('roles.manage'))));
$$;
REVOKE ALL ON FUNCTION erp_private.may_edit_role(bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_private.may_edit_role(bigint) TO authenticated;
CREATE POLICY f03_role_insert ON public.roles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(NOT is_system_role OR public.current_user_is_global_admin());
CREATE POLICY f03_role_update ON public.roles AS RESTRICTIVE FOR UPDATE TO authenticated USING(erp_private.may_edit_role(id)) WITH CHECK(NOT is_system_role OR public.current_user_is_global_admin());
CREATE POLICY f03_role_delete ON public.roles AS RESTRICTIVE FOR DELETE TO authenticated USING(erp_private.may_edit_role(id));
CREATE POLICY f03_permission_grant ON public.role_permissions AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(erp_private.may_edit_role(role_id));
CREATE POLICY f03_permission_edit ON public.role_permissions AS RESTRICTIVE FOR UPDATE TO authenticated USING(erp_private.may_edit_role(role_id)) WITH CHECK(erp_private.may_edit_role(role_id));
CREATE POLICY f03_permission_revoke ON public.role_permissions AS RESTRICTIVE FOR DELETE TO authenticated USING(erp_private.may_edit_role(role_id));

CREATE OR REPLACE FUNCTION public.f03_clone_role(source_id bigint, details jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE src public.roles; cloned public.roles; copied integer;
BEGIN
  IF NOT public.current_user_has_permission_globally('roles.manage') OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(details)<>'object' OR details->>'role_code' IS NULL OR details->>'role_code' !~ '^[a-z0-9_]{1,100}$'
    OR nullif(btrim(details->>'role_name'),'') IS NULL OR length(details->>'role_name')>255
    OR length(details->>'display_name')>255 OR length(details->>'description')>1000
    OR length(details->>'role_category')>100 OR length(details->>'role_level')>100 OR length(details->>'notes')>2000 THEN RAISE EXCEPTION 'Invalid role details'; END IF;
  SELECT * INTO STRICT src FROM public.roles WHERE id=source_id FOR SHARE;
  IF src.is_system_role AND NOT public.current_user_is_global_admin() THEN RAISE EXCEPTION 'Global administrator required to clone a system role' USING ERRCODE='42501'; END IF;
  INSERT INTO public.roles(role_code,role_name,display_name,description,role_category,role_level,notes,is_system_role,is_assignable,is_active)
    VALUES(details->>'role_code',details->>'role_name',nullif(details->>'display_name',''),nullif(details->>'description',''),nullif(details->>'role_category',''),nullif(details->>'role_level',''),nullif(details->>'notes',''),false,true,true)
    RETURNING * INTO cloned;
  INSERT INTO public.role_permissions(role_id,permission_id)
    SELECT cloned.id,p.id FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id WHERE rp.role_id=source_id AND p.is_active;
  GET DIAGNOSTICS copied=ROW_COUNT;
  INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
    VALUES(public.current_user_profile_id(),'roles','roles',cloned.id,cloned.role_code,'ROLE_CLONED',jsonb_build_object('source_role_id',source_id,'permissions_copied_count',copied));
  RETURN jsonb_build_object('id',cloned.id,'role_code',cloned.role_code,'permissions_copied_count',copied);
END $$;
REVOKE ALL ON FUNCTION public.f03_clone_role(bigint,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f03_clone_role(bigint,jsonb) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
