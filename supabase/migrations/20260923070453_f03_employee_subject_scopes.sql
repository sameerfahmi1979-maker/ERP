BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Trusted identity relationship. No backfill from editable names, email or employee_reference.
CREATE TABLE public.erp_user_employee_links (
  user_profile_id bigint PRIMARY KEY REFERENCES public.user_profiles(id) ON DELETE CASCADE,
  employee_id bigint NOT NULL UNIQUE REFERENCES public.employees(id),
  linked_by bigint REFERENCES public.user_profiles(id),
  linked_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.erp_user_employee_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.erp_user_employee_links FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.erp_user_employee_links TO authenticated;
GRANT ALL ON public.erp_user_employee_links TO service_role;
CREATE POLICY f03_employee_link_read ON public.erp_user_employee_links FOR SELECT TO authenticated
USING(erp_private.business_principal_is_active() AND (user_profile_id=public.current_user_profile_id() OR public.current_user_is_global_admin()));

-- A valid principal is required even by SECURITY DEFINER business routines using these helpers.
CREATE OR REPLACE FUNCTION public.current_user_profile_id()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT id FROM public.user_profiles WHERE auth_user_id=auth.uid() AND erp_private.business_principal_is_active() LIMIT 1;
$$;
CREATE OR REPLACE FUNCTION public.current_user_branch_id()
RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT branch_id FROM public.user_profiles WHERE auth_user_id=auth.uid() AND erp_private.business_principal_is_active() LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION erp_private.permission_in_scope(code text, company_id bigint, branch_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.business_principal_is_active() AND (public.current_user_is_global_admin() OR EXISTS(
   SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
   JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions p ON p.id=rp.permission_id
   WHERE ur.user_profile_id=public.current_user_profile_id() AND ur.is_active AND r.is_active AND p.is_active AND p.permission_code=$1
   AND ((ur.owner_company_id IS NULL AND ur.branch_id IS NULL) OR (ur.owner_company_id=$2 AND (ur.branch_id IS NULL OR ur.branch_id=$3)))));
$$;
REVOKE ALL ON FUNCTION erp_private.permission_in_scope(text,bigint,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_private.permission_in_scope(text,bigint,bigint) TO authenticated;

CREATE OR REPLACE FUNCTION erp_private.employee_permission(employee_id bigint, code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.business_principal_is_active() AND EXISTS(SELECT 1 FROM public.employees e WHERE e.id=$1 AND e.deleted_at IS NULL
   AND (public.current_user_is_global_admin() OR EXISTS(
     SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
     JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions p ON p.id=rp.permission_id
     LEFT JOIN public.erp_user_employee_links l ON l.user_profile_id=ur.user_profile_id
     WHERE ur.user_profile_id=public.current_user_profile_id() AND ur.is_active AND r.is_active AND p.is_active
     AND ((ur.owner_company_id IS NULL AND ur.branch_id IS NULL) OR (ur.owner_company_id=e.owner_company_id AND (ur.branch_id IS NULL OR ur.branch_id=e.branch_id)))
     AND (p.permission_code=$2 OR (p.permission_code=$2||'.self' AND l.employee_id=e.id)
       OR (p.permission_code=$2||'.team' AND l.employee_id=e.reporting_manager_id AND l.employee_id<>e.id))
   )));
$$;
REVOKE ALL ON FUNCTION erp_private.employee_permission(bigint,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_private.employee_permission(bigint,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.f03_has_employee_permission(employee_id bigint, permission_code text)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT erp_private.employee_permission($1,$2);
$$;
REVOKE ALL ON FUNCTION public.f03_has_employee_permission(bigint,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f03_has_employee_permission(bigint,text) TO authenticated;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,is_active)
SELECT code,replace(code,'.',' '),'hr','view',true FROM unnest(ARRAY[
 'hr.employees.view.self','hr.employees.view.team','hr.compliance.view.self','hr.compliance.view.team',
 'hr.attendance.view.self','hr.attendance.view.team','hr.leave.view.self','hr.leave.view.team',
 'hr.assignments.view.self','hr.assignments.view.team','hr.actions.view.self','hr.actions.view.team',
 'hr.payroll.view.self','hr.payroll.view.team','hr.medical.view.self','hr.medical.view.team',
 'hr.banking.view','hr.banking.manage','hr.banking.view.self','hr.banking.view.team',
 'hr.confidential.view','hr.confidential.manage','hr.confidential.view.self','hr.confidential.view.team',
 'users.employee_link.manage']) code ON CONFLICT(permission_code) DO NOTHING;
-- New sensitive/relationship capabilities are NOT silently added to existing roles.

CREATE OR REPLACE FUNCTION public.current_user_can_view_employee(p_employee_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT erp_private.employee_permission($1,'hr.employees.view') OR erp_private.employee_permission($1,'hr.employee_profile.view');
$$;
CREATE OR REPLACE FUNCTION public.current_user_can_manage_employee(p_employee_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT erp_private.employee_permission($1,'hr.employees.update') OR erp_private.employee_permission($1,'hr.employee_profile.manage');
$$;
CREATE OR REPLACE FUNCTION public.current_user_can_view_employee_medical(p_employee_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.current_user_can_view_employee($1) AND erp_private.employee_permission($1,'hr.medical.view');
$$;
CREATE OR REPLACE FUNCTION public.current_user_can_manage_employee_medical(p_employee_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.current_user_can_view_employee($1) AND erp_private.employee_permission($1,'hr.medical.manage');
$$;
CREATE OR REPLACE FUNCTION public.current_user_can_view_employee_payroll(p_employee_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.current_user_can_view_employee($1) AND erp_private.employee_permission($1,'hr.payroll.view');
$$;
CREATE OR REPLACE FUNCTION public.current_user_can_manage_employee_payroll(p_employee_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.current_user_can_view_employee($1) AND erp_private.employee_permission($1,'hr.payroll.manage');
$$;
CREATE OR REPLACE FUNCTION public.current_user_can_view_employee_operations(p_employee_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.current_user_can_view_employee($1) AND erp_private.employee_permission($1,'hr.assignments.view');
$$;
CREATE OR REPLACE FUNCTION public.current_user_can_manage_employee_operations(p_employee_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.current_user_can_view_employee($1) AND erp_private.employee_permission($1,'hr.assignments.manage');
$$;
CREATE OR REPLACE FUNCTION public.current_user_can_view_employee_hr_actions(p_employee_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.current_user_can_view_employee($1) AND erp_private.employee_permission($1,'hr.actions.view');
$$;
CREATE OR REPLACE FUNCTION public.current_user_can_manage_employee_hr_actions(p_employee_id bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT public.current_user_can_view_employee($1) AND erp_private.employee_permission($1,'hr.actions.manage');
$$;

-- Replace the reviewed employee policies, preserving which operations exist.
-- This makes branch grants work and binds each child capability to its own subject scope.
DO $$
DECLARE pol record; u text; c text; extra text; v text;
BEGIN
 FOR pol IN SELECT * FROM pg_policies WHERE schemaname='public' AND permissive='PERMISSIVE' AND tablename IN (
  'employees','employee_access_cards','employee_accommodation_records','employee_approval_requests','employee_assets','employee_assignments',
  'employee_attendance_corrections','employee_attendance_daily_summary','employee_attendance_punches','employee_clearance_items','employee_dependents',
  'employee_disciplinary_records','employee_document_links','employee_eos_cases','employee_hr_actions','employee_hr_notes','employee_identity_documents',
  'employee_leave_balances','employee_leave_requests','employee_medical_insurances','employee_medical_records','employee_operational_blocks','employee_overtime_records',
  'employee_payroll_holds','employee_payroll_profiles','employee_performance_records','employee_ppe_issues','employee_pro_processes','employee_recruitment_links',
  'employee_role_requirements','employee_salary_components','employee_salary_revisions','employee_shift_assignments','employee_site_readiness','employee_status_events',
  'employee_training_certificates','employee_wps_profiles') LOOP
   u:=pol.qual; c:=pol.with_check;
   IF pol.tablename='employees' THEN
     IF pol.cmd='SELECT' THEN u:='public.current_user_can_view_employee(id)';
     ELSIF pol.cmd='INSERT' THEN c:='erp_private.permission_in_scope(''hr.employees.create'',owner_company_id,branch_id)';
     ELSIF pol.cmd='UPDATE' THEN u:='public.current_user_can_manage_employee(id)'; c:='erp_private.permission_in_scope(''hr.employees.update'',owner_company_id,branch_id) OR erp_private.permission_in_scope(''hr.employee_profile.manage'',owner_company_id,branch_id)';
     ELSE RAISE EXCEPTION 'Unreviewed employees policy %',pol.policyname; END IF;
   ELSE
     -- All general capability terms are evaluated for this specific employee, not globally.
     u:=regexp_replace(u,'current_user_has_permission\(''([^'']+)''::text\)','erp_private.employee_permission(employee_id,''\1'')','g');
     c:=regexp_replace(c,'current_user_has_permission\(''([^'']+)''::text\)','erp_private.employee_permission(employee_id,''\1'')','g');
     IF pol.tablename='employee_recruitment_links' THEN
       IF pol.cmd='SELECT' THEN u:='public.current_user_can_view_employee(employee_id) AND erp_private.employee_permission(employee_id,''hr.recruitment.view'')';
       ELSE u:='public.current_user_can_manage_employee(employee_id) AND erp_private.employee_permission(employee_id,''hr.recruitment.manage'')'; c:=u; END IF;
     END IF;
     extra:=NULL;
     IF pol.tablename='employee_wps_profiles' THEN extra:='hr.banking.';
     ELSIF pol.tablename IN ('employee_hr_notes','employee_disciplinary_records','employee_performance_records') THEN extra:='hr.confidential.'; END IF;
     IF extra IS NOT NULL THEN
       v:=format('erp_private.employee_permission(employee_id,%L)',extra||CASE WHEN pol.cmd='SELECT' THEN 'view' ELSE 'manage' END);
       IF u IS NOT NULL THEN u:='('||u||') AND '||v; END IF;
       IF c IS NOT NULL THEN c:='('||c||') AND '||v; END IF;
     END IF;
     IF pol.cmd='UPDATE' AND c IS NULL THEN c:=u; END IF;
   END IF;
   EXECUTE format('DROP POLICY %I ON public.%I',pol.policyname,pol.tablename);
   EXECUTE format('CREATE POLICY %I ON public.%I FOR %s TO authenticated%s%s',pol.policyname,pol.tablename,pol.cmd,
     CASE WHEN u IS NULL OR pol.cmd='INSERT' THEN '' ELSE ' USING ('||u||')' END,
     CASE WHEN c IS NULL OR pol.cmd IN ('SELECT','DELETE') THEN '' ELSE ' WITH CHECK ('||c||')' END);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION erp_private.set_employee_link(profile_id bigint, employee_id bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE target public.user_profiles; emp public.employees; old_employee bigint;
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT * INTO STRICT target FROM public.user_profiles WHERE id=$1 FOR UPDATE;
 IF NOT erp_private.permission_in_scope('users.employee_link.manage',target.owner_company_id,target.branch_id) THEN RAISE EXCEPTION 'Not authorized' USING ERRCODE='42501'; END IF;
 SELECT l.employee_id INTO old_employee FROM public.erp_user_employee_links l WHERE l.user_profile_id=$1;
 IF $2 IS NULL THEN DELETE FROM public.erp_user_employee_links WHERE user_profile_id=$1;
 ELSE
   SELECT * INTO STRICT emp FROM public.employees WHERE id=$2 AND deleted_at IS NULL FOR SHARE;
   IF NOT erp_private.permission_in_scope('users.employee_link.manage',emp.owner_company_id,emp.branch_id)
     OR target.owner_company_id IS DISTINCT FROM emp.owner_company_id OR target.branch_id IS DISTINCT FROM emp.branch_id THEN RAISE EXCEPTION 'Profile and employee scope must match' USING ERRCODE='42501'; END IF;
   INSERT INTO public.erp_user_employee_links(user_profile_id,employee_id,linked_by) VALUES($1,$2,public.current_user_profile_id())
   ON CONFLICT(user_profile_id) DO UPDATE SET employee_id=EXCLUDED.employee_id,linked_by=EXCLUDED.linked_by,linked_at=now();
 END IF;
 INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,old_values,new_values,owner_company_id,branch_id)
 VALUES(public.current_user_profile_id(),'users','erp_user_employee_links',$1,'EMPLOYEE_IDENTITY_LINK_CHANGED',jsonb_build_object('employee_id',old_employee),jsonb_build_object('employee_id',$2),target.owner_company_id,target.branch_id);
END $$;
REVOKE ALL ON FUNCTION erp_private.set_employee_link(bigint,bigint) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION erp_private.set_employee_link(bigint,bigint) TO authenticated;
CREATE OR REPLACE FUNCTION public.f03_set_employee_link(profile_id bigint, employee_id bigint)
RETURNS void LANGUAGE sql SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.set_employee_link($1,$2); $$;
REVOKE ALL ON FUNCTION public.f03_set_employee_link(bigint,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.f03_set_employee_link(bigint,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
