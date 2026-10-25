BEGIN;
SET LOCAL lock_timeout='5s';SET LOCAL statement_timeout='60s';

-- Linking an identity can change self/direct-report authority. The target's
-- home company alone is insufficient when it also holds other active scopes.
CREATE OR REPLACE FUNCTION public.administrator_can_manage_identity(target_profile bigint,capability text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT capability IN('users.view','users.update','users.delete','users.security.manage','users.employee_link.manage')
 AND erp_private.business_principal_is_active() AND EXISTS(SELECT 1 FROM public.user_profiles target WHERE target.id=$1
  AND (public.current_user_is_global_admin() OR (
   target.owner_company_id IS NOT NULL
   AND erp_private.permission_in_scope($2,target.owner_company_id,target.branch_id)
   AND NOT EXISTS(SELECT 1 FROM public.user_roles a JOIN public.roles r ON r.id=a.role_id WHERE a.user_profile_id=target.id AND a.is_active AND r.is_active
    AND (a.owner_company_id IS NULL OR r.role_code IN('system_admin','group_admin')
     OR NOT erp_private.permission_in_scope($2,a.owner_company_id,a.branch_id)))
  )));
$$;

CREATE OR REPLACE FUNCTION erp_private.set_employee_link(profile_id bigint,employee_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.user_profiles; emp public.employees; old_employee bigint;
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501';END IF;
 SELECT * INTO STRICT target FROM public.user_profiles WHERE id=$1 FOR UPDATE;
 IF NOT public.administrator_can_manage_identity($1,'users.employee_link.manage') THEN
  RAISE EXCEPTION 'Account unavailable or outside your administrative scope' USING ERRCODE='42501';END IF;
 SELECT l.employee_id INTO old_employee FROM public.erp_user_employee_links l WHERE l.user_profile_id=$1;
 IF $2 IS NULL THEN DELETE FROM public.erp_user_employee_links WHERE user_profile_id=$1;
 ELSE
  SELECT * INTO STRICT emp FROM public.employees WHERE id=$2 AND deleted_at IS NULL FOR SHARE;
  IF NOT erp_private.permission_in_scope('users.employee_link.manage',emp.owner_company_id,emp.branch_id)
   OR target.owner_company_id IS DISTINCT FROM emp.owner_company_id OR target.branch_id IS DISTINCT FROM emp.branch_id THEN
   RAISE EXCEPTION 'Profile and employee scope must match' USING ERRCODE='42501';END IF;
  INSERT INTO public.erp_user_employee_links(user_profile_id,employee_id,linked_by) VALUES($1,$2,public.current_user_profile_id())
   ON CONFLICT(user_profile_id) DO UPDATE SET employee_id=EXCLUDED.employee_id,linked_by=EXCLUDED.linked_by,linked_at=now();
 END IF;
 INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,old_values,new_values,owner_company_id,branch_id)
 VALUES(public.current_user_profile_id(),'users','erp_user_employee_links',$1,'EMPLOYEE_IDENTITY_LINK_CHANGED',jsonb_build_object('employee_id',old_employee),jsonb_build_object('employee_id',$2),target.owner_company_id,target.branch_id);
END $$;
-- Existing explicit grants are retained. No real identity link is modified.
NOTIFY pgrst,'reload schema';COMMIT;
