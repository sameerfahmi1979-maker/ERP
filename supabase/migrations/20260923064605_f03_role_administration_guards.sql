BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE OR REPLACE FUNCTION erp_private.protect_administration()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE target_profile bigint; removes_admin boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('f03-admin-membership',0));
  IF TG_TABLE_NAME='roles' THEN
    IF OLD.role_code='system_admin' AND (TG_OP='DELETE' OR NEW.role_code IS DISTINCT FROM OLD.role_code OR NEW.is_active IS NOT TRUE OR NEW.is_assignable IS NOT TRUE) THEN
      RAISE EXCEPTION 'The system administrator role must remain active and assignable' USING ERRCODE='42501';
    END IF;
    IF OLD.is_system_role AND TG_OP='DELETE' THEN RAISE EXCEPTION 'System roles cannot be deleted' USING ERRCODE='42501'; END IF;
  ELSIF TG_TABLE_NAME='user_profiles' THEN
    target_profile := OLD.id;
    IF auth.role()='authenticated' THEN
      IF TG_OP='UPDATE' AND (NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id OR
        (to_jsonb(NEW)-ARRAY['full_name','display_name','phone','job_title','department','owner_company_id','branch_id','status','avatar_url','updated_at','employee_reference','manager_user_profile_id','preferred_language','timezone','last_admin_updated_at','notes']) IS DISTINCT FROM
        (to_jsonb(OLD)-ARRAY['full_name','display_name','phone','job_title','department','owner_company_id','branch_id','status','avatar_url','updated_at','employee_reference','manager_user_profile_id','preferred_language','timezone','last_admin_updated_at','notes'])) THEN
        RAISE EXCEPTION 'Security lifecycle changes require the trusted account-security action' USING ERRCODE='42501';
      END IF;
      IF NOT public.current_user_is_global_admin() AND EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id WHERE ur.user_profile_id=OLD.id AND ur.is_active AND ur.owner_company_id IS NULL AND ur.branch_id IS NULL AND r.role_code IN ('system_admin','group_admin')) THEN
        RAISE EXCEPTION 'Global administrator required for privileged target' USING ERRCODE='42501';
      END IF;
    END IF;
    removes_admin := TG_OP='DELETE' OR (OLD.status='active' AND NEW.status IS DISTINCT FROM 'active');
  ELSIF TG_TABLE_NAME='user_roles' THEN
    target_profile := OLD.user_profile_id;
    removes_admin := OLD.is_active AND OLD.owner_company_id IS NULL AND OLD.branch_id IS NULL
      AND EXISTS(SELECT 1 FROM public.roles r WHERE r.id=OLD.role_id AND r.role_code='system_admin' AND r.is_active)
      AND (TG_OP='DELETE' OR NEW.is_active IS NOT TRUE OR NEW.owner_company_id IS NOT NULL OR NEW.branch_id IS NOT NULL OR NEW.role_id<>OLD.role_id OR NEW.user_profile_id<>OLD.user_profile_id);
  END IF;
  IF removes_admin AND EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id JOIN public.user_profiles p ON p.id=ur.user_profile_id
    WHERE p.id=target_profile AND p.status='active' AND ur.is_active AND ur.owner_company_id IS NULL AND ur.branch_id IS NULL AND r.role_code='system_admin' AND r.is_active)
    AND NOT EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id JOIN public.user_profiles p ON p.id=ur.user_profile_id
    WHERE p.id<>target_profile AND p.status='active' AND ur.is_active AND ur.owner_company_id IS NULL AND ur.branch_id IS NULL AND r.role_code='system_admin' AND r.is_active) THEN
    RAISE EXCEPTION 'Cannot remove the last active system administrator' USING ERRCODE='42501';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.protect_administration() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f03_administration_guard BEFORE UPDATE OR DELETE ON public.user_profiles FOR EACH ROW EXECUTE FUNCTION erp_private.protect_administration();
CREATE TRIGGER f03_administration_guard BEFORE UPDATE OR DELETE ON public.user_roles FOR EACH ROW EXECUTE FUNCTION erp_private.protect_administration();
CREATE TRIGGER f03_administration_guard BEFORE UPDATE OR DELETE ON public.roles FOR EACH ROW EXECUTE FUNCTION erp_private.protect_administration();

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,is_active)
VALUES('users.roles.assign','Assign scoped user roles','users','assign',true) ON CONFLICT(permission_code) DO NOTHING;
-- No role is automatically granted this new capability. Global-admin behavior is unchanged.
CREATE OR REPLACE FUNCTION erp_private.may_assign_roles(company_id bigint, branch_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT public.current_user_is_global_admin() OR CASE WHEN $2 IS NOT NULL
    THEN public.current_user_has_permission_in_branch('users.roles.assign',$2)
    WHEN $1 IS NOT NULL THEN public.current_user_has_permission_in_company('users.roles.assign',$1)
    ELSE public.current_user_has_permission_globally('users.roles.assign') END;
$$;
REVOKE ALL ON FUNCTION erp_private.may_assign_roles(bigint,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_private.may_assign_roles(bigint,bigint) TO authenticated;
CREATE POLICY f03_role_assignment_capability ON public.user_roles AS RESTRICTIVE FOR ALL TO authenticated
USING(erp_private.may_assign_roles(owner_company_id,branch_id)) WITH CHECK(erp_private.may_assign_roles(owner_company_id,branch_id));
-- SELECT is exempt from the mutation-only assignment gate.
DROP POLICY f03_role_assignment_capability ON public.user_roles;
CREATE POLICY f03_role_assignment_insert ON public.user_roles AS RESTRICTIVE FOR INSERT TO authenticated WITH CHECK(erp_private.may_assign_roles(owner_company_id,branch_id));
CREATE POLICY f03_role_assignment_update ON public.user_roles AS RESTRICTIVE FOR UPDATE TO authenticated USING(erp_private.may_assign_roles(owner_company_id,branch_id)) WITH CHECK(erp_private.may_assign_roles(owner_company_id,branch_id));
CREATE POLICY f03_role_assignment_delete ON public.user_roles AS RESTRICTIVE FOR DELETE TO authenticated USING(erp_private.may_assign_roles(owner_company_id,branch_id));

CREATE OR REPLACE FUNCTION public.f03_apply_permission_batch(changes jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE c jsonb; r public.roles; p public.permissions; output jsonb := '[]'::jsonb; actor bigint := public.current_user_profile_id();
BEGIN
  IF NOT public.current_user_has_permission('roles.manage') OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
  IF jsonb_typeof(changes)<>'array' OR jsonb_array_length(changes)<1 OR jsonb_array_length(changes)>500 THEN RAISE EXCEPTION 'Invalid batch'; END IF;
  FOR c IN SELECT value FROM jsonb_array_elements(changes) LOOP
    IF c->>'action' NOT IN ('grant','revoke') OR c->>'action' IS NULL THEN RAISE EXCEPTION 'Invalid action'; END IF;
    SELECT * INTO STRICT r FROM public.roles WHERE id=(c->>'roleId')::bigint FOR UPDATE;
    SELECT * INTO STRICT p FROM public.permissions WHERE id=(c->>'permissionId')::bigint;
    IF r.is_system_role AND NOT public.current_user_is_global_admin() THEN RAISE EXCEPTION 'Global administrator required' USING ERRCODE='42501'; END IF;
    IF c->>'action'='grant' THEN
      IF NOT p.is_active THEN RAISE EXCEPTION 'Inactive permission'; END IF;
      INSERT INTO public.role_permissions(role_id,permission_id) VALUES(r.id,p.id) ON CONFLICT DO NOTHING;
    ELSE
      DELETE FROM public.role_permissions WHERE role_id=r.id AND permission_id=p.id;
    END IF;
    INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,entity_reference,action,new_values)
      VALUES(actor,'roles','role_permissions',r.id,r.role_code,'ROLE_PERMISSION_CHANGED',jsonb_build_object('permission_id',p.id,'permission_code',p.permission_code,'action',c->>'action'));
    output := output || jsonb_build_array(jsonb_build_object('roleId',r.id,'permissionId',p.id,'action',c->>'action','success',true));
  END LOOP;
  RETURN output;
END $$;
REVOKE ALL ON FUNCTION public.f03_apply_permission_batch(jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f03_apply_permission_batch(jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
