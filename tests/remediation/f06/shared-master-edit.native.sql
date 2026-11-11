-- Run only on an isolated database after the calendar-sharing migration.
begin;
do $test$
declare
 company bigint; admin_user uuid; legacy_user uuid; admin_session uuid:=gen_random_uuid(); legacy_session uuid:=gen_random_uuid();
 employee bigint; assignment bigint; calendar bigint; dep bigint; site bigint; designation bigint; approval bigint; rule bigint;
 receipt jsonb; replay jsonb; operation uuid:=gen_random_uuid(); changed integer; saved_revision bigint;
 suffix text:=substring(replace(gen_random_uuid()::text,'-',''),1,12);
begin
 select id into strict company from public.owner_companies where status='active' order by id limit 1;
 admin_user:=gen_random_uuid();legacy_user:=gen_random_uuid();
 insert into auth.users(id,email) values(admin_user,'mde-admin-'||suffix||'@example.invalid'),(legacy_user,'mde-legacy-'||suffix||'@example.invalid');
 insert into public.user_profiles(auth_user_id,status,must_change_password)
  values(admin_user,'active',false),(legacy_user,'active',false)
  on conflict(auth_user_id) do update set status='active',must_change_password=false;
 update public.roles set is_active=true where role_code in ('system_admin','group_admin');
 insert into public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
 select p.id,r.id,null,null,true from public.user_profiles p join public.roles r on r.role_code=case when p.auth_user_id=admin_user then 'system_admin' else 'group_admin' end
 where p.auth_user_id in(admin_user,legacy_user);
 insert into auth.sessions(id,user_id) values(admin_session,admin_user),(legacy_session,legacy_user);
 insert into public.work_calendars(calendar_code,calendar_name,calendar_type,owner_company_id) values('MDE'||suffix,'Synthetic calendar','standard',company) returning id,workspace_revision into calendar,saved_revision;
 insert into public.employees(employee_code,full_name_en,owner_company_id,joining_date,date_of_birth,gender,mobile_number,emergency_contact_name,emergency_contact_mobile)
 values('MDE'||suffix,'Synthetic employee',company,'2020-01-01','1990-01-01','male','0500000010','Synthetic contact','0500000011') returning id into employee;
 insert into public.employee_shift_assignments(employee_id,work_calendar_id,effective_from)
 values(employee,calendar,'2020-01-01') returning id into assignment;
 insert into public.departments(department_code,department_name_en,owner_company_id) values('MDE'||suffix,'Synthetic department',company) returning id,workspace_revision into dep,changed;
 insert into public.work_sites(site_code,site_name,site_type,owner_company_id) values('MDE'||suffix,'Synthetic site','yard',company) returning id into site;
 insert into public.designations(designation_code,designation_name_en,owner_company_id) values('MDE'||suffix,'Synthetic designation',company) returning id into designation;
 insert into public.approval_roles(role_code,role_name,level_number,owner_company_id) values('MDE'||suffix,'Synthetic approval role',1,company) returning id into approval;
 insert into public.dms_required_document_rules(rule_code,rule_name,entity_type,owner_company_id) values('MDE'||suffix,'Synthetic document rule','company',company) returning id into rule;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',legacy_user,'session_id',legacy_session,'role','authenticated')::text,true);
 execute 'set local role authenticated';
 if not public.current_user_is_global_admin() or public.current_user_has_role('system_admin') or not erp_private.business_principal_is_active() then raise exception 'Legacy administrator fixture invalid: %, %, %',public.current_user_is_global_admin(), public.current_user_has_role('system_admin'), erp_private.business_principal_is_active(); end if;
 begin
  perform public.save_master_record('work_calendars',gen_random_uuid(),calendar,saved_revision,'{"owner_company_id":null}');
  raise exception 'Legacy admin unexpectedly shared the calendar';
 exception when sqlstate '22023' then null; end;
 begin
  update public.work_calendars set owner_company_id=null where id=calendar;
  raise exception 'Direct legacy admin update unexpectedly shared the calendar';
 exception when sqlstate '22023' then null; end;
 perform set_config('request.jwt.claims',jsonb_build_object('sub',admin_user,'session_id',admin_session,'role','authenticated')::text,true);
 if not public.current_user_has_role('system_admin') or not erp_private.business_principal_is_active() then raise exception 'System administrator fixture invalid'; end if;
 receipt:=public.save_master_record('work_calendars',operation,calendar,saved_revision,'{"owner_company_id":null}');
 replay:=public.save_master_record('work_calendars',operation,calendar,saved_revision,'{"owner_company_id":null}');
 if (receipt->>'id')::bigint<>calendar or receipt->'owner_company_id'<>'null'::jsonb or replay->>'replayed'<>'true' then raise exception 'Invalid share or replay receipt'; end if;
 begin
  perform public.save_master_record('work_calendars',gen_random_uuid(),calendar,(receipt->>'revision')::bigint,'{"calendar_type":"custom"}');
  raise exception 'An assigned calendar schedule changed unexpectedly';
 exception when sqlstate 'P0601' then null; end;
 if not exists(select 1 from public.work_calendars where id=calendar and owner_company_id is null) then raise exception 'Calendar remained scoped'; end if;
 begin
  perform public.save_master_record('work_calendars',gen_random_uuid(),calendar,(receipt->>'revision')::bigint,jsonb_build_object('owner_company_id',company));
  raise exception 'Narrowing unexpectedly succeeded';
 exception when sqlstate '22023' then null; end;
 receipt:=public.save_department_record(gen_random_uuid(),dep,changed,'{"department_name_en":"Synthetic department edited"}');
 if (receipt->>'id')::bigint<>dep or not exists(select 1 from public.departments where id=dep and department_name_en='Synthetic department edited') then raise exception 'Department edit failed'; end if;
 update public.work_sites set site_name='Synthetic site edited' where id=site returning id into changed;
 if changed is distinct from site then raise exception 'Work site edit failed'; end if;
 update public.designations set owner_company_id=null,is_active=false where id=designation returning id into changed;
 if changed is distinct from designation then raise exception 'Designation update failed'; end if;
 update public.approval_roles set owner_company_id=null,can_approve=false,can_reject=false where id=approval returning id into changed;
 if changed is distinct from approval then raise exception 'Approval role update failed'; end if;
 update public.dms_required_document_rules set owner_company_id=null,is_required=false where id=rule returning id into changed;
 if changed is distinct from rule then raise exception 'Required document rule update failed'; end if;
 execute 'reset role';
 if not exists(select 1 from public.employee_shift_assignments where id=assignment and work_calendar_id=calendar) then raise exception 'Calendar assignment changed'; end if;
 raise notice 'Passed history protection and native updates on six master-data tables, global calendar sharing, replay, narrowing rejection and legacy-admin rejection';
end $test$;
rollback;
