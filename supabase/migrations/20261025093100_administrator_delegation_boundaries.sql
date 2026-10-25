BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';

CREATE FUNCTION public.administrator_can_manage_identity(target_profile bigint,capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT capability IN('users.view','users.update','users.delete','users.security.manage')
 AND erp_private.business_principal_is_active() AND EXISTS(SELECT 1 FROM public.user_profiles target WHERE target.id=$1
  AND (public.current_user_is_global_admin() OR (
   target.owner_company_id IS NOT NULL
   AND erp_private.permission_in_scope($2,target.owner_company_id,target.branch_id)
   AND NOT EXISTS(SELECT 1 FROM public.user_roles a JOIN public.roles r ON r.id=a.role_id WHERE a.user_profile_id=target.id AND a.is_active AND r.is_active
    AND (a.owner_company_id IS NULL OR r.role_code IN('system_admin','group_admin')
     OR NOT erp_private.permission_in_scope($2,a.owner_company_id,a.branch_id)))
  )));
$$;
REVOKE ALL ON FUNCTION public.administrator_can_manage_identity(bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.administrator_can_manage_identity(bigint,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.current_user_can_manage_user_role_assignment(target_user_profile_id bigint,target_role_id bigint,target_owner_company_id bigint,target_branch_id bigint)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.user_profiles; role_record public.roles;
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN RETURN false;END IF;
 SELECT * INTO target FROM public.user_profiles WHERE id=$1;
 SELECT * INTO role_record FROM public.roles WHERE id=$2;
 IF target.id IS NULL OR role_record.id IS NULL
  OR NOT erp_private.administrator_assignment_shape(role_record.role_code,$3,$4) THEN RETURN false;END IF;
 IF $3 IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.owner_companies WHERE id=$3 AND status='active') THEN RETURN false;END IF;
 IF $4 IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches WHERE id=$4 AND owner_company_id=$3 AND status='active') THEN RETURN false;END IF;
 IF public.current_user_is_global_admin() THEN RETURN true;END IF;
 IF target.id=public.current_user_profile_id() OR role_record.role_code IN('system_admin','group_admin','company_admin') OR $3 IS NULL
  OR $3 IS DISTINCT FROM target.owner_company_id THEN RETURN false;END IF;
 IF $4 IS NOT NULL AND $4 IS DISTINCT FROM target.branch_id AND NOT erp_private.permission_in_scope('users.roles.assign',$3,NULL) THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM public.user_roles a JOIN public.roles r ON r.id=a.role_id WHERE a.user_profile_id=$1 AND a.is_active AND r.is_active
  AND (r.role_code IN('system_admin','group_admin') OR a.owner_company_id IS NULL)) THEN RETURN false;END IF;
 IF NOT erp_private.permission_in_scope('users.roles.assign',$3,$4) THEN RETURN false;END IF;
 IF role_record.role_code='branch_admin' AND NOT EXISTS(SELECT 1 FROM public.user_roles a JOIN public.roles r ON r.id=a.role_id
  WHERE a.user_profile_id=public.current_user_profile_id() AND a.is_active AND r.is_active AND r.is_system_role
   AND r.role_code='company_admin' AND a.owner_company_id=$3 AND a.branch_id IS NULL) THEN RETURN false;END IF;
 RETURN NOT EXISTS(SELECT 1 FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id WHERE rp.role_id=$2 AND p.is_active
  AND (p.administrator_scope IN('global','held') OR NOT erp_private.permission_in_scope(p.permission_code,$3,$4)));
END $$;

-- Role metadata is a shared administration reference; this grants no role edits.
CREATE POLICY administrator_role_choices ON public.roles FOR SELECT TO authenticated
 USING(erp_private.business_principal_is_active() AND public.current_user_has_permission_any_scope('users.roles.assign'));

CREATE FUNCTION erp_private.guard_administrator_identity_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.role()='authenticated' AND OLD.id IS DISTINCT FROM public.current_user_profile_id()
  AND NOT public.administrator_can_manage_identity(OLD.id,CASE WHEN TG_OP='DELETE' THEN 'users.delete' ELSE 'users.update' END) THEN
  RAISE EXCEPTION 'This account has authority outside your administrative scope' USING ERRCODE='42501';END IF;
 IF TG_OP='UPDATE' AND auth.role()='authenticated' AND NOT public.current_user_is_global_admin()
  AND (NEW.owner_company_id IS DISTINCT FROM OLD.owner_company_id OR NEW.branch_id IS DISTINCT FROM OLD.branch_id)
  AND NOT erp_private.permission_in_scope('users.update',NEW.owner_company_id,NEW.branch_id) THEN
  RAISE EXCEPTION 'Destination account scope is not authorized' USING ERRCODE='42501';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.guard_administrator_identity_change() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER administrator_identity_boundary BEFORE UPDATE OR DELETE ON public.user_profiles
 FOR EACH ROW EXECUTE FUNCTION erp_private.guard_administrator_identity_change();
NOTIFY pgrst,'reload schema';COMMIT;
