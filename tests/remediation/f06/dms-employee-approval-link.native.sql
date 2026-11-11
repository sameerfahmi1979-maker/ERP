-- Isolated only. The caller applies the exact migration in the same transaction.
DO $test$
DECLARE company_a bigint; company_b bigint; branch_a bigint; sibling bigint;
 employee_a bigint; employee_sibling bigint; employee_b bigint;
 manager uuid:=gen_random_uuid(); reader uuid:=gen_random_uuid();
 manager_session uuid:=gen_random_uuid(); reader_session uuid:=gen_random_uuid();
 manager_role bigint; reader_role bigint; before jsonb; changed jsonb; alias_proof jsonb;
 suffix text:=upper(substring(replace(gen_random_uuid()::text,'-',''),1,10));
BEGIN
 SELECT id INTO STRICT company_a FROM public.owner_companies WHERE status='active' ORDER BY id LIMIT 1;
 SELECT id INTO STRICT company_b FROM public.owner_companies WHERE status='active' AND id<>company_a ORDER BY id LIMIT 1;
 INSERT INTO public.branches(owner_company_id,branch_code,branch_name_en,status)
 VALUES(company_a,'EL'||suffix,'Synthetic branch','active') RETURNING id INTO branch_a;
 INSERT INTO public.branches(owner_company_id,branch_code,branch_name_en,status)
 VALUES(company_a,'ES'||suffix,'Synthetic sibling branch','active') RETURNING id INTO sibling;
 INSERT INTO auth.users(id,email) VALUES(manager,'link-manager-'||suffix||'@example.invalid'),(reader,'link-reader-'||suffix||'@example.invalid');
 INSERT INTO public.user_profiles(auth_user_id,status,must_change_password) VALUES(manager,'active',false),(reader,'active',false)
 ON CONFLICT(auth_user_id) DO UPDATE SET status='active',must_change_password=false;
 INSERT INTO auth.sessions(id,user_id) VALUES(manager_session,manager),(reader_session,reader);
 INSERT INTO public.roles(role_code,role_name,is_active) VALUES('EM'||suffix,'Synthetic branch HR editor',true) RETURNING id INTO manager_role;
 INSERT INTO public.roles(role_code,role_name,is_active) VALUES('ER'||suffix,'Synthetic HR reader',true) RETURNING id INTO reader_role;
 INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,is_active)
 VALUES('hr.employees.view','HR Employee View','HR','view',true),('hr.employees.update','HR Employee Update','HR','update',true)
 ON CONFLICT(permission_code) DO UPDATE SET is_active=true;
 INSERT INTO public.role_permissions(role_id,permission_id)
 SELECT manager_role,id FROM public.permissions WHERE permission_code IN('hr.employees.view','hr.employees.update')
 UNION ALL SELECT reader_role,id FROM public.permissions WHERE permission_code='hr.employees.view';
 INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
 SELECT p.id,CASE WHEN p.auth_user_id=manager THEN manager_role ELSE reader_role END,company_a,branch_a,true
 FROM public.user_profiles p WHERE p.auth_user_id IN(manager,reader);
 INSERT INTO public.employees(employee_code,full_name_en,owner_company_id,branch_id,joining_date,date_of_birth,gender,mobile_number,emergency_contact_name,emergency_contact_mobile)
 VALUES('EA'||suffix,'Synthetic employee',company_a,branch_a,'2020-01-01','1990-01-01','male','0500000010','Synthetic','0500000011') RETURNING id INTO employee_a;
 INSERT INTO public.employees(employee_code,full_name_en,owner_company_id,branch_id,joining_date,date_of_birth,gender,mobile_number,emergency_contact_name,emergency_contact_mobile)
 VALUES('ES'||suffix,'Synthetic sibling employee',company_a,sibling,'2020-01-01','1990-01-01','male','0500000012','Synthetic','0500000013') RETURNING id INTO employee_sibling;
 INSERT INTO public.employees(employee_code,full_name_en,owner_company_id,joining_date,date_of_birth,gender,mobile_number,emergency_contact_name,emergency_contact_mobile)
 VALUES('EB'||suffix,'Synthetic other company employee',company_b,'2020-01-01','1990-01-01','male','0500000014','Synthetic','0500000015') RETURNING id INTO employee_b;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager,'session_id',manager_session,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 IF has_column_privilege(current_user,'public.employees','blood_group','SELECT') THEN RAISE EXCEPTION 'Protected HR column is exposed'; END IF;
 IF NOT public.current_user_can_manage_employee(employee_a) THEN RAISE EXCEPTION 'Manager fixture lacks scoped authority'; END IF;
 before:=erp_private.ai_approval_link_target('employee',employee_a);
 alias_proof:=erp_private.ai_approval_link_target('employee_contract',employee_a);
 IF before->>'fingerprint' IS DISTINCT FROM alias_proof->>'fingerprint' OR before->>'type'<>'employee'
  OR before->>'id'<>employee_a::text OR length(before->>'fingerprint')<>64 THEN RAISE EXCEPTION 'Invalid link proof'; END IF;
 IF before IS DISTINCT FROM erp_private.ai_approval_link_target('employee',employee_a) THEN RAISE EXCEPTION 'Identical retry changed link proof'; END IF;
 BEGIN
  PERFORM erp_private.ai_approval_link_target('employee',employee_sibling);
  RAISE EXCEPTION 'Sibling branch employee was readable';
 EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM erp_private.ai_approval_link_target('employee',employee_b);
  RAISE EXCEPTION 'Foreign company employee was readable';
 EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',reader,'session_id',reader_session,'role','authenticated')::text,true);
 IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id=employee_a) THEN RAISE EXCEPTION 'Read-only HR fixture lacks visibility'; END IF;
 BEGIN
  PERFORM erp_private.ai_approval_link_target('employee',employee_a);
  RAISE EXCEPTION 'View-only role admitted an employee link';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 EXECUTE 'RESET ROLE';
 UPDATE public.employees SET full_name_en='Synthetic employee revised' WHERE id=employee_a;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager,'session_id',manager_session,'role','authenticated')::text,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 changed:=erp_private.ai_approval_link_target('employee',employee_a);
 IF before->>'fingerprint' IS NOT DISTINCT FROM changed->>'fingerprint' THEN RAISE EXCEPTION 'Changed employee revision was not detected'; END IF;
 PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',manager,'session_id',gen_random_uuid(),'role','authenticated')::text,true);
 BEGIN
  PERFORM erp_private.ai_approval_link_target('employee',employee_a);
  RAISE EXCEPTION 'Invalid session admitted an employee link';
 EXCEPTION WHEN foreign_key_violation OR insufficient_privilege THEN NULL; END;
 EXECUTE 'RESET ROLE';
 RAISE NOTICE 'Passed scoped employee link proof, revision and replay, view-only and cross-scope denial, invalid session, protected HR column';
END $test$;
ROLLBACK;
