-- Run on an isolated database with the shared availability migration applied.
BEGIN;
DO $test$
DECLARE
 owner_a bigint; owner_b bigint; branch_a bigint; dept bigint; private_dept bigint; site bigint; private_site bigint; own_site bigint;
 emp_a bigint; emp_b bigint; admin_uid uuid:=gen_random_uuid(); scoped_uid uuid:=gen_random_uuid();
 admin_sid uuid:=gen_random_uuid(); scoped_sid uuid:=gen_random_uuid(); scope_role bigint; revision bigint;
 admin_claims text; scoped_claims text; choice jsonb; receipt jsonb; origin record; operation uuid:=gen_random_uuid();
 suffix text:=upper(substring(replace(gen_random_uuid()::text,'-',''),1,10));
BEGIN
 SELECT id INTO STRICT owner_a FROM public.owner_companies WHERE status='active' ORDER BY id LIMIT 1;
 SELECT id INTO STRICT owner_b FROM public.owner_companies WHERE status='active' AND id<>owner_a ORDER BY id LIMIT 1;
 INSERT INTO public.branches(owner_company_id,branch_code,branch_name_en,status)
  VALUES(owner_a,'SH'||suffix,'Synthetic retained branch','active') RETURNING id INTO branch_a;
 INSERT INTO auth.users(id,email)
  VALUES(admin_uid,'shared-admin-'||suffix||'@example.invalid'),(scoped_uid,'shared-scoped-'||suffix||'@example.invalid');
 INSERT INTO public.user_profiles(auth_user_id,status,must_change_password)
  VALUES(admin_uid,'active',false),(scoped_uid,'active',false)
  ON CONFLICT(auth_user_id) DO UPDATE SET status='active',must_change_password=false;
 INSERT INTO auth.sessions(id,user_id) VALUES(admin_sid,admin_uid),(scoped_sid,scoped_uid);
 INSERT INTO public.roles(role_code,role_name,is_active)
  VALUES('SH'||suffix,'Synthetic company permissions',true) RETURNING id INTO scope_role;
 INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,is_active)
  VALUES('common_md.work_sites.view','View Work Sites','COMMON_MD','view',true),
   ('common_md.work_sites.manage','Manage Work Sites','COMMON_MD','manage',true),
   ('hr.attendance.view','HR - Attendance View','HR','view',true),
   ('hr.attendance.manage','HR - Attendance Manage','HR','manage',true),
   ('hr.assignments.view','HR - Assignments View','HR','view',true),
   ('hr.assignments.manage','HR - Assignments Manage','HR','manage',true)
  ON CONFLICT (permission_code) DO NOTHING;
 INSERT INTO public.role_permissions(role_id,permission_id)
  SELECT scope_role,id FROM public.permissions WHERE permission_code IN
   ('common_md.departments.view','common_md.work_sites.view','common_md.work_sites.manage',
    'hr.employees.view','hr.attendance.view','hr.attendance.manage','hr.assignments.view','hr.assignments.manage','dms.documents.upload');
 INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
  SELECT p.id,r.id,NULL::bigint,NULL::bigint,true FROM public.user_profiles p CROSS JOIN public.roles r
  WHERE p.auth_user_id=admin_uid AND r.role_code='system_admin'
  UNION ALL
  SELECT p.id,scope_role,owner_b,NULL,true FROM public.user_profiles p WHERE p.auth_user_id=scoped_uid;
 INSERT INTO public.departments(department_code,department_name_en,owner_company_id,branch_id)
  VALUES('SD'||suffix,'Synthetic shareable department',owner_a,branch_a) RETURNING id,workspace_revision INTO dept,revision;
 INSERT INTO public.departments(department_code,department_name_en,owner_company_id,branch_id)
  VALUES('PD'||suffix,'Synthetic private department',owner_a,branch_a) RETURNING id INTO private_dept;
 INSERT INTO public.work_sites(site_code,site_name,site_type,owner_company_id,branch_id,address_line_1)
  VALUES('SS'||suffix,'Synthetic shareable site','yard',owner_a,branch_a,'Private site address') RETURNING id INTO site;
 INSERT INTO public.work_sites(site_code,site_name,site_type,owner_company_id,branch_id)
  VALUES('PS'||suffix,'Synthetic private site','yard',owner_a,branch_a) RETURNING id INTO private_site;
 INSERT INTO public.work_sites(site_code,site_name,site_type,owner_company_id)
  VALUES('OS'||suffix,'Synthetic company B site','yard',owner_b) RETURNING id INTO own_site;
 INSERT INTO public.employees(employee_code,full_name_en,owner_company_id,branch_id,department_id,primary_work_site_id,
  joining_date,date_of_birth,gender,mobile_number,emergency_contact_name,emergency_contact_mobile)
  VALUES('EA'||suffix,'Synthetic existing assignment',owner_a,branch_a,dept,site,'2020-01-01','1990-01-01','male','0500000010','Synthetic','0500000011') RETURNING id INTO emp_a;
 INSERT INTO public.employees(employee_code,full_name_en,owner_company_id,joining_date,date_of_birth,gender,mobile_number,emergency_contact_name,emergency_contact_mobile)
  VALUES('EB'||suffix,'Synthetic new assignment',owner_b,'2020-01-01','1990-01-01','male','0500000012','Synthetic','0500000013') RETURNING id INTO emp_b;

 admin_claims:=jsonb_build_object('sub',admin_uid,'session_id',admin_sid,'role','authenticated')::text;
 scoped_claims:=jsonb_build_object('sub',scoped_uid,'session_id',scoped_sid,'role','authenticated')::text;
 PERFORM set_config('request.jwt.claims',admin_claims,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 receipt:=public.save_department_record(operation,dept,revision,'{"available_to_all_organizations":true}');
 IF receipt->'available_to_all_organizations' IS DISTINCT FROM 'true'::jsonb
  OR (receipt->>'owner_company_id')::bigint IS DISTINCT FROM owner_a
  OR (receipt->>'branch_id')::bigint IS DISTINCT FROM branch_a THEN RAISE EXCEPTION 'Department share lost original ownership'; END IF;
 IF public.save_department_record(operation,dept,revision,'{"available_to_all_organizations":true}')->'replayed' IS DISTINCT FROM 'true'::jsonb
 THEN RAISE EXCEPTION 'Department sharing replay failed'; END IF;
 UPDATE public.work_sites SET available_to_all_organizations=true WHERE id=site;
 IF NOT FOUND THEN RAISE EXCEPTION 'Work site sharing failed'; END IF;
 BEGIN
  UPDATE public.work_sites SET owner_company_id=owner_b WHERE id=site;
  RAISE EXCEPTION 'Shared work site changed ownership';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  PERFORM public.save_department_record(gen_random_uuid(),dept,(receipt->>'revision')::bigint,'{"available_to_all_organizations":false}');
  RAISE EXCEPTION 'Shared department became private';
 EXCEPTION WHEN check_violation THEN NULL; END;

 PERFORM set_config('request.jwt.claims',scoped_claims,true);
 IF NOT erp_private.business_principal_is_active() OR public.current_user_has_role('system_admin') THEN
  RAISE EXCEPTION 'Scoped principal fixture is invalid';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.work_sites WHERE id=own_site) THEN
  RAISE EXCEPTION 'Scoped Work Site read fixture is invalid';
 END IF;
 BEGIN
  UPDATE public.work_sites SET available_to_all_organizations=true WHERE id=own_site;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scoped Work Site edit fixture is invalid'; END IF;
  RAISE EXCEPTION 'Scoped manager published a site';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF EXISTS(SELECT 1 FROM public.work_sites WHERE id=site)
  OR EXISTS(SELECT 1 FROM public.departments WHERE id=dept)
 THEN RAISE EXCEPTION 'Sharing widened master record visibility'; END IF;
 choice:=public.shared_employee_assignment_choices('departments',owner_b,NULL,NULL);
 IF NOT choice @> jsonb_build_array(jsonb_build_object('id',dept))
  OR choice @> jsonb_build_array(jsonb_build_object('id',private_dept))
 THEN RAISE EXCEPTION 'Department choices missing or leaked'; END IF;
 choice:=public.shared_employee_assignment_choices('sites',owner_b,NULL,NULL);
 IF NOT choice @> jsonb_build_array(jsonb_build_object('id',site))
  OR choice @> jsonb_build_array(jsonb_build_object('id',private_site))
  OR choice::text LIKE '%Private site address%' THEN RAISE EXCEPTION 'Site choices missing or leaked'; END IF;
 IF public.shared_employee_assignment_choices('sites',owner_a,NULL,NULL)<>'[]'::jsonb
 THEN RAISE EXCEPTION 'Unrelated assignment scope accepted'; END IF;
 choice:=public.timesheet_site_choices(owner_b,current_date,'SS'||suffix,0);
 IF NOT choice @> jsonb_build_array(jsonb_build_object('id',site))
  OR choice::text LIKE '%Private site address%' THEN RAISE EXCEPTION 'Timesheet shared site missing or leaked its address'; END IF;
 choice:=public.f12_editor_choices(emp_b,'assignment','work_site_id',p_search=>'SS'||suffix);
 IF NOT choice @> jsonb_build_array(jsonb_build_object('id',site))
  OR public.f12_editor_choices(emp_b,'assignment','work_site_id',p_search=>'PS'||suffix)<>'[]'::jsonb
 THEN RAISE EXCEPTION 'Operational assignment choices missed the shared site or leaked a private site'; END IF;

 EXECUTE 'RESET ROLE';
 PERFORM erp_private.timesheet_validate_site(emp_b,current_date,jsonb_build_object('work_site_id',site),'yard');
 BEGIN
  PERFORM erp_private.timesheet_validate_site(emp_b,current_date,jsonb_build_object('work_site_id',private_site),'yard');
  RAISE EXCEPTION 'Unshared site accepted by timesheet';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM * FROM erp_private.f07_upload_origin_scope('site',site);
  RAISE EXCEPTION 'Foreign organization acquired document upload authority';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM set_config('request.jwt.claims',admin_claims,true);
 SELECT * INTO STRICT origin FROM erp_private.f07_upload_origin_scope('site',site);
 IF origin.company IS DISTINCT FROM owner_a OR origin.branch IS DISTINCT FROM branch_a
 THEN RAISE EXCEPTION 'Document ownership changed'; END IF;
 UPDATE public.employees SET department_id=dept,primary_work_site_id=site WHERE id=emp_b;
 BEGIN
  UPDATE public.employees SET department_id=private_dept WHERE id=emp_b;
  RAISE EXCEPTION 'Private department accepted across organizations';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  UPDATE public.employees SET primary_work_site_id=private_site WHERE id=emp_b;
  RAISE EXCEPTION 'Private site accepted across organizations';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM public.employees WHERE id=emp_a AND owner_company_id=owner_a AND branch_id=branch_a AND department_id=dept AND primary_work_site_id=site)
  OR NOT EXISTS(SELECT 1 FROM public.employees WHERE id=emp_b AND owner_company_id=owner_b AND department_id=dept AND primary_work_site_id=site)
 THEN RAISE EXCEPTION 'An employee assignment was lost or changed incorrectly'; END IF;
 PERFORM set_config('request.jwt.claims',scoped_claims,true);
 EXECUTE 'SET LOCAL ROLE authenticated';
 choice:=public.f12_attendance_choices('site',owner_b,current_date);
 IF NOT choice @> jsonb_build_array(jsonb_build_object('id',site))
  OR public.f12_attendance_choices('site',owner_a,current_date)<>'[]'::jsonb
  OR EXISTS(SELECT 1 FROM erp_private.shared_attendance_primary_site(emp_a))
 THEN RAISE EXCEPTION 'Attendance filter missed the shared site or widened employee access'; END IF;
 EXECUTE 'RESET ROLE';
 PERFORM set_config('request.jwt.claims',admin_claims,true);
 UPDATE public.work_sites SET is_restricted_area=true WHERE id=site;
 PERFORM set_config('request.jwt.claims',scoped_claims,true);
 BEGIN
  PERFORM erp_private.timesheet_validate_site(emp_b,current_date,jsonb_build_object('work_site_id',site),'yard');
  RAISE EXCEPTION 'Shared availability bypassed required restricted-site review';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE NOTICE 'Shared availability, cross-company assignments, attendance filters, site restrictions, document permissions and Department replay passed';
END $test$;
ROLLBACK;
