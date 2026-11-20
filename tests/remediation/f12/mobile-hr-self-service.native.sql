\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='30s';
CREATE FUNCTION pg_temp.check_it(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF; RAISE NOTICE 'PASS: %',label; END $$;
CREATE FUNCTION pg_temp.actor(n int) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('sub','cccccccc-1111-4000-8000-'||lpad(n::text,12,'0'),'session_id','dddddddd-1111-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true)::text;
$$;
CREATE FUNCTION pg_temp.deny_staff_leave(p_id bigint,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN PERFORM public.f11_mutate_time_child('leave-request',998810,p_id,1,gen_random_uuid(),'approve','{}');
 EXCEPTION WHEN OTHERS THEN IF SQLSTATE=expected THEN RAISE NOTICE 'PASS: %',label; RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'FAIL: % unexpectedly allowed',label;
END $$;
CREATE FUNCTION pg_temp.deny_finish(d jsonb) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN PERFORM erp_private.mobile_hr_command('attendance.approve',d,true);
 EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS: prior ERP receipt without this transaction admission cannot be finalized'; RETURN; END;
 RAISE EXCEPTION 'FAIL: unrelated native receipt attributed to mobile';
END $$;
CREATE FUNCTION pg_temp.deny(action text,p jsonb,expected text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN PERFORM public.mobile_hr_command_v1(action,p);
 EXCEPTION WHEN OTHERS THEN IF SQLSTATE=expected THEN RAISE NOTICE 'PASS: %',label; RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'FAIL: % unexpectedly allowed',label;
END $$;
-- Records and identities are local synthetic fixtures. No real employee rows used.
SELECT pg_temp.check_it(to_regprocedure('public.mobile_hr_command_v1(text,jsonb)') IS NOT NULL,'versioned HR command installed');
SELECT pg_temp.check_it((SELECT array_agg(r.role_code ORDER BY r.role_code)=ARRAY['branch_admin','company_admin','employee_self_service']::text[]
 FROM public.role_permissions rp JOIN public.permissions p ON p.id=rp.permission_id JOIN public.roles r ON r.id=rp.role_id
 WHERE p.permission_code='hr.requests.submit.self' AND p.administrator_scope='branch'),'only derived administrators and intended self role receive branch-classified permission');
SELECT pg_temp.check_it(NOT has_function_privilege('anon','public.mobile_hr_command_v1(text,jsonb)','execute') AND NOT has_function_privilege('service_role','public.mobile_hr_command_v1(text,jsonb)','execute'),'anonymous and service role cannot call command');
INSERT INTO public.owner_companies(id,company_code,legal_name_en) VALUES(998810,'MHR_A','Synthetic A'),(998811,'MHR_B','Synthetic B');
INSERT INTO public.branches(id,owner_company_id,branch_code,branch_name_en) VALUES(998810,998810,'MHR_A','A'),(998811,998810,'MHR_C','Sibling'),(998812,998811,'MHR_B','Other');
INSERT INTO public.roles(id,role_code,role_name) VALUES(998810,'QA_MHR_REVIEW','Synthetic HR reviewer');
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code)
SELECT code,code,'hr','manage' FROM unnest(ARRAY['hr.actions.view','hr.actions.manage','hr.employees.view','hr.employees.update','hr.attendance.view','hr.attendance.manage','hr.leave.view','hr.leave.manage','hr.compliance.view','hr.compliance.manage'])code ON CONFLICT(permission_code)DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id) SELECT 998810,id FROM public.permissions WHERE permission_code IN('hr.actions.view','hr.actions.manage','hr.employees.view','hr.employees.update','hr.attendance.view','hr.attendance.manage','hr.leave.view','hr.leave.manage','hr.compliance.view','hr.compliance.manage','hr.medical.view','dms.documents.view','dms.documents.preview');
INSERT INTO auth.users(id,email,raw_user_meta_data) SELECT ('cccccccc-1111-4000-8000-'||lpad(n::text,12,'0'))::uuid,'mhr-'||n||'@example.invalid','{"full_name":"Synthetic Reviewer"}' FROM generate_series(1,4)n;
INSERT INTO auth.sessions(id,user_id) SELECT ('dddddddd-1111-4000-8000-'||lpad(n::text,12,'0'))::uuid,('cccccccc-1111-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,4)n;
UPDATE public.user_profiles SET status='active',must_change_password=false,owner_company_id=998810,branch_id=998810 WHERE auth_user_id::text LIKE 'cccccccc-1111-%';
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id)
SELECT p.id,r.id,998810,998810 FROM public.user_profiles p JOIN public.roles r ON (r.role_code='employee_self_service' AND right(p.auth_user_id::text,1)='1' OR r.id=998810 AND right(p.auth_user_id::text,1) IN('1','2'))
WHERE p.auth_user_id::text LIKE 'cccccccc-1111-%';
INSERT INTO public.roles(id,role_code,role_name) VALUES(998811,'QA_MHR_TEAM','Synthetic line manager');
INSERT INTO public.role_permissions(role_id,permission_id) SELECT 998811,id FROM public.permissions WHERE permission_code IN ('hr.actions.view.team','hr.employees.view.team','hr.attendance.view.team','hr.compliance.view.team');
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id) SELECT id,998811,998810,998810 FROM public.user_profiles WHERE auth_user_id='cccccccc-1111-4000-8000-000000000003';
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id)
 SELECT id,998810,CASE right(auth_user_id::text,1) WHEN '3' THEN 998810 ELSE 998811 END,CASE right(auth_user_id::text,1) WHEN '3' THEN 998811 ELSE 998812 END
 FROM public.user_profiles WHERE auth_user_id IN ('cccccccc-1111-4000-8000-000000000003','cccccccc-1111-4000-8000-000000000004');
INSERT INTO public.hr_employee_categories(id,code,name_en) OVERRIDING SYSTEM VALUE VALUES(998810,'MHR','Synthetic');
INSERT INTO public.employees(id,employee_code,full_name_en,gender,date_of_birth,mobile_number,owner_company_id,branch_id,joining_date,emergency_contact_name,emergency_contact_mobile,employee_category_id)
OVERRIDING SYSTEM VALUE SELECT 998809+n,'MHR-'||n,'Synthetic Employee '||n,'male','1992-03-01','0000000000',CASE n WHEN 4 THEN 998811 ELSE 998810 END,CASE n WHEN 3 THEN 998811 WHEN 4 THEN 998812 ELSE 998810 END,'2020-01-01','Synthetic','0000000000',998810 FROM generate_series(1,5)n;
INSERT INTO public.erp_user_employee_links(user_profile_id,employee_id) SELECT id,998810 FROM public.user_profiles WHERE auth_user_id='cccccccc-1111-4000-8000-000000000001';
INSERT INTO public.erp_user_employee_links(user_profile_id,employee_id) SELECT id,998814 FROM public.user_profiles WHERE auth_user_id='cccccccc-1111-4000-8000-000000000003';
INSERT INTO public.hr_leave_types(id,code,name_en,reset_basis,requires_document) OVERRIDING SYSTEM VALUE VALUES(998810,'MHR_TEST','QA calendar','calendar_year',false),(998811,'MHR_MANUAL','QA manual','manual',false);
INSERT INTO public.employee_leave_balances(employee_id,leave_type_id,leave_year,entitled_days,used_days,carry_forward,period_start,period_end,period_basis) VALUES(998810,998810,2026,20,0,0,'2026-01-01','2026-12-31','calendar_year'),(998810,998810,2027,20,0,0,'2027-01-01','2027-12-31','calendar_year');
INSERT INTO public.hr_access_card_types(id,code,name_en,requires_client_authority) OVERRIDING SYSTEM VALUE VALUES(998810,'MHR_CARD','Synthetic card',false);
-- Pre-existing evidence fixtures only. Every command below runs with all triggers enabled.
SET LOCAL session_replication_role=replica;
UPDATE public.employees SET reporting_manager_id=998814 WHERE id=998810;
INSERT INTO public.dms_document_categories(id,category_code,name_en) OVERRIDING SYSTEM VALUE VALUES(998810,'QA_MHR','Synthetic evidence');
INSERT INTO public.dms_document_types(id,type_code,name_en,category_id) OVERRIDING SYSTEM VALUE VALUES(998810,'QA_MHR','Synthetic card',998810);
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status,is_archived,current_version_id)
OVERRIDING SYSTEM VALUE SELECT 998810+n,'MHR-DOC-'||n,'Synthetic card '||n,998810,998810,998810,998810,CASE n WHEN 2 THEN 'legal' ELSE 'internal' END,'active',false,998810+n FROM generate_series(0,2)n;
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE SELECT id,id,1,true FROM public.dms_documents WHERE document_no LIKE 'MHR-DOC-%';
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status) OVERRIDING SYSTEM VALUE
 SELECT id,id,id,'original','qa-only','qa/'||document_no,'fixture.pdf','application/pdf',12,repeat('a',64),'pending' FROM public.dms_documents WHERE document_no LIKE 'MHR-DOC-%';
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) SELECT id,'employee',998810 FROM public.dms_documents WHERE document_no LIKE 'MHR-DOC-%';
INSERT INTO public.employee_approval_requests(id,employee_id,approval_type,request_title,request_status,requested_by,created_by,updated_by) OVERRIDING SYSTEM VALUE
 SELECT 998810+n,998810,CASE WHEN n=0 THEN 'disciplinary' ELSE 'other' END,'Synthetic request','pending',p.id,p.id,p.id FROM public.user_profiles p CROSS JOIN generate_series(0,1)n WHERE p.auth_user_id='cccccccc-1111-4000-8000-000000000001';
INSERT INTO public.employee_attendance_daily_summary(id,employee_id,attendance_date,attendance_type,approval_status,created_by,updated_by) OVERRIDING SYSTEM VALUE
 SELECT 998810+n,998811,'2026-10-01'::date+n,'office','pending',p.id,CASE WHEN n=0 THEN q.id ELSE p.id END FROM public.user_profiles p CROSS JOIN public.user_profiles q CROSS JOIN generate_series(0,2)n WHERE p.auth_user_id='cccccccc-1111-4000-8000-000000000001' AND q.auth_user_id='cccccccc-1111-4000-8000-000000000002';
SET LOCAL session_replication_role=origin;
INSERT INTO public.employee_access_cards(id,employee_id,access_type_id,card_number,expiry_date,dms_document_id) OVERRIDING SYSTEM VALUE VALUES(998810,998810,998810,'QA123','2026-12-31',998810);
CREATE TEMP TABLE mobile_case(k text PRIMARY KEY,v jsonb);
GRANT ALL ON mobile_case TO authenticated;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
INSERT INTO mobile_case VALUES('profile',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'kind','profile-correction','proposal','{"sourceRevision":1,"changes":{"personal_email":"mhr@example.invalid"}}'::jsonb)),
 ('leave',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'leaveTypeId',998810,'startDate','2026-11-01','endDate','2026-11-03','reason','QA vacation')),
 ('attendance',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'kind','attendance-correction','proposal','{"date":"2026-11-02","reason":"Please review missing shift."}'::jsonb));
SELECT pg_temp.deny('request.submit',v||'{"employeeId":998811}','42501','same-branch peer cannot use self writer') FROM mobile_case WHERE k='profile';
SELECT pg_temp.deny('request.submit',v||'{"employeeId":998812}','42501','sibling branch blocked') FROM mobile_case WHERE k='profile';
SELECT pg_temp.deny('request.submit',v||'{"employeeId":998813}','42501','cross-company blocked') FROM mobile_case WHERE k='profile';
SELECT pg_temp.deny('request.submit',jsonb_set(v,'{proposal,changes}','{"owner_company_id":998811}'),'22023','protected employee field rejected') FROM mobile_case WHERE k='profile';
SELECT pg_temp.deny('leave.submit',v||'{"documentId":991,"documentVersionId":92}','42501','forged attachment rejected') FROM mobile_case WHERE k='leave';
SELECT pg_temp.deny('leave.submit',v||'{"leaveTypeId":998811}','23514','manual leave held') FROM mobile_case WHERE k='leave';
-- The persisted contact value must be nonblank after full whitespace handling, and length-safe as stored.
SELECT pg_temp.deny('request.submit',jsonb_set(v,'{proposal,changes}',jsonb_build_object('emergency_contact_name',E'\t\n  ')),'22023','blank control whitespace contact rejected') FROM mobile_case WHERE k='profile';
SELECT pg_temp.deny('request.submit',jsonb_set(v,'{proposal,changes}',jsonb_build_object('emergency_contact_name','  '||repeat('a',160)||'  ')),'22023','padded contact is rejected instead of persisting excess length') FROM mobile_case WHERE k='profile';
SELECT pg_temp.deny('request.submit',jsonb_set(v,'{proposal,date}','"-infinity"'),'22023','attendance correction requires finite ISO date') FROM mobile_case WHERE k='attendance';
INSERT INTO mobile_case SELECT 'profile-result',public.mobile_hr_command_v1('request.submit',v) FROM mobile_case WHERE k='profile';
SELECT pg_temp.check_it((public.mobile_hr_command_v1('request.submit',v)->>'replayed')::boolean,'same operation replay returns original receipt') FROM mobile_case WHERE k='profile';
SELECT pg_temp.deny('request.submit',jsonb_set(v,'{proposal,changes,personal_email}','"other@example.invalid"'),'PT409','same operation different payload rejected') FROM mobile_case WHERE k='profile';
SELECT pg_temp.check_it(public.mobile_hr_command_v1('receipt',jsonb_build_object('operationId',v->'operationId'))->>'status'='pending','uncertain submission reconciled') FROM mobile_case WHERE k='profile';
SELECT pg_temp.deny('request.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',v->'id','revision',1,'decision','approve'),'42501','reviewer cannot approve own proposal') FROM mobile_case WHERE k='profile-result';
SELECT pg_temp.deny('leave.submit',v||jsonb_build_object('employeeId',998811),'42501','self leave cannot be filed for peer') FROM mobile_case WHERE k='leave';
SELECT pg_temp.deny('request.submit',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'kind','compliance-renewal','proposal','{"sourceKind":"access-card","sourceId":998810,"sourceRevision":2,"reason":"renew"}'::jsonb),'PT409','stale renewal source rejected');
SELECT pg_temp.deny('request.submit',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'kind','compliance-renewal','proposal','{"sourceKind":"access-card","sourceId":998810,"sourceRevision":1,"documentId":998810}'::jsonb),'22023','renewal cannot omit selected document version');
INSERT INTO mobile_case SELECT 'renewal-result',public.mobile_hr_command_v1('request.submit',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'kind','compliance-renewal','proposal','{"sourceKind":"access-card","sourceId":998810,"sourceRevision":1,"reason":"Expiry next month; officer review needed"}'::jsonb));
INSERT INTO mobile_case SELECT 'evidence-proposal',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'kind','compliance-renewal','proposal','{"sourceKind":"access-card","sourceId":998810,"sourceRevision":1,"documentId":998811,"documentVersionId":998811}'::jsonb);
SELECT pg_temp.deny('request.submit',jsonb_set(v,'{proposal,documentVersionId}','998810'),'42501','renewal evidence version mismatch denied') FROM mobile_case WHERE k='evidence-proposal';
SELECT pg_temp.deny('request.submit',v||jsonb_build_object('proposal',(v->'proposal')||'{"documentId":998812,"documentVersionId":998812}'),'42501','existing confidential employee document denied') FROM mobile_case WHERE k='evidence-proposal';
SELECT pg_temp.check_it(public.mobile_hr_command_v1('request.submit',v)->>'status'='pending','exact current linked evidence accepted by authorized employee') FROM mobile_case WHERE k='evidence-proposal';
SELECT pg_temp.check_it(v->>'status'='pending','evidence-free renewal sent for source-specific officer follow-up') FROM mobile_case WHERE k='renewal-result';
SELECT pg_temp.check_it(jsonb_array_length(public.mobile_hr_command_v1('request.list','{"mode":"mine","limit":1}')->'items')=1 AND (public.mobile_hr_command_v1('request.list','{"mode":"mine","limit":1}')->>'nextAfterId') IS NOT NULL,'bounded own proposal page');
SELECT pg_temp.check_it(jsonb_array_length(public.mobile_hr_command_v1('request.list','{"mode":"review"}')->'items')=0,'self requester excluded from approvals queue');
INSERT INTO mobile_case SELECT 'attendance-result',public.mobile_hr_command_v1('request.submit',v) FROM mobile_case WHERE k='attendance';
INSERT INTO mobile_case SELECT 'leave-result',public.mobile_hr_command_v1('leave.submit',v) FROM mobile_case WHERE k='leave';
SELECT pg_temp.deny('leave.submit',v||jsonb_build_object('operationId',gen_random_uuid()),'23514','overlapping pending leave denied') FROM mobile_case WHERE k='leave';
SELECT pg_temp.deny('leave.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',v->'id','revision',1,'decision','approve'),'42501','leave requester cannot approve own leave') FROM mobile_case WHERE k='leave-result';
SELECT pg_temp.actor(3);
SELECT pg_temp.check_it(jsonb_array_length(public.mobile_hr_command_v1('request.list','{"mode":"team"}')->'items')>0,'verified direct-report manager sees scoped history');
SELECT pg_temp.check_it(public.mobile_hr_command_v1('request.open',jsonb_build_object('id',v->'id'))->'proposal'='{}','team-only history omits private contact proposals') FROM mobile_case WHERE k='profile-result';
SELECT pg_temp.deny('request.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',v->'id','revision',1,'decision','approve'),'42501','team visibility confers no reviewer authority') FROM mobile_case WHERE k='profile-result';
SELECT pg_temp.actor(4);
SELECT pg_temp.deny('request.open',jsonb_build_object('id',v->'id'),'42501','officer in another company cannot open original') FROM mobile_case WHERE k='profile-result';
SELECT pg_temp.deny('request.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',v->'id','revision',1,'decision','approve'),'42501','other-company management role cannot decide') FROM mobile_case WHERE k='profile-result';
SELECT pg_temp.check_it(jsonb_array_length(public.mobile_hr_command_v1('request.list','{"mode":"team"}')->'items')=0,'unlinked viewer has no team history');
SELECT pg_temp.actor(2);
SELECT pg_temp.deny('approval.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',998810,'revision',1,'decision','approve'),'42501','withheld disciplinary decision denied by RPC');
SELECT pg_temp.check_it(public.mobile_hr_command_v1('approval.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',998811,'revision',1,'decision','approve'))->>'status'='approved','independent staff approval uses ERP action');
INSERT INTO mobile_case VALUES('erp-approval',jsonb_build_object('employeeId',998811,'operationId',gen_random_uuid(),'id',998812,'revision',1));
SELECT pg_temp.check_it(public.f11_mutate_time_child('attendance-summary',998811,998812,1,(v->>'operationId')::uuid,'approve','{}')->>'id'='998812','existing ERP staff approval produces its own F11 receipt') FROM mobile_case WHERE k='erp-approval';
SELECT pg_temp.deny_finish(v) FROM mobile_case WHERE k='erp-approval';
SELECT pg_temp.check_it(public.mobile_hr_command_v1('receipt',jsonb_build_object('operationId',v->'operationId')) IS NULL,'receipt remains absent for a non-mobile ERP action') FROM mobile_case WHERE k='erp-approval';
SELECT pg_temp.deny('attendance.approve',jsonb_build_object('employeeId',998811,'operationId',gen_random_uuid(),'id',998810,'revision',1),'42501','timesheet last editor cannot approve');
SELECT pg_temp.check_it(public.mobile_hr_command_v1('attendance.approve',jsonb_build_object('employeeId',998811,'operationId',gen_random_uuid(),'id',998811,'revision',1))->>'status'='approved','independent timesheet approval uses ERP action');
SELECT pg_temp.check_it(jsonb_array_length(public.mobile_hr_command_v1('request.list','{"mode":"review"}')->'items')>0,'independent officer sees pending queue');
SELECT pg_temp.check_it(public.mobile_hr_command_v1('request.open',jsonb_build_object('id',v->'id'))->>'kind'='profile-correction','current authorized officer can open original') FROM mobile_case WHERE k='profile-result';
SELECT pg_temp.deny('request.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',v->'id','revision',2,'decision','approve'),'PT409','stale proposal decision rejected') FROM mobile_case WHERE k='profile-result';
SELECT pg_temp.check_it(public.mobile_hr_command_v1('request.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',v->'id','revision',1,'decision','approve'))->>'status'='approved','independent profile decision saved') FROM mobile_case WHERE k='profile-result';
SELECT pg_temp.check_it(public.mobile_hr_command_v1('request.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',v->'id','revision',1,'decision','approve'))->>'status'='approved','officer accepts renewal follow-up without editing expiry') FROM mobile_case WHERE k='renewal-result';
SELECT pg_temp.check_it(public.mobile_hr_command_v1('request.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',v->'id','revision',1,'decision','approve'))->>'status'='approved','officer accepts attendance follow-up without inserting summary') FROM mobile_case WHERE k='attendance-result';
SELECT pg_temp.check_it(public.mobile_hr_command_v1('leave.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',v->'id','revision',1,'decision','approve'))->>'status'='approved','officer approval uses F12 allocation') FROM mobile_case WHERE k='leave-result';
SELECT pg_temp.actor(1);
SELECT pg_temp.deny('leave.cancel',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',v->'id','revision',2,'reason','QA cancel'),'23514','self cannot cancel approved leave') FROM mobile_case WHERE k='leave-result';
RESET ROLE;
SELECT pg_temp.check_it((SELECT expiry_date='2026-12-31'::date AND dms_document_id=998810 FROM public.employee_access_cards WHERE id=998810),'renewal proposal preserves authoritative expiry and current document');
SELECT pg_temp.check_it((SELECT used_days=3 FROM public.employee_leave_balances WHERE employee_id=998810 AND leave_year=2026),'three inclusive days debited');
SELECT pg_temp.check_it((SELECT count(*)=1 AND sum(days)=3 FROM erp_private.f12_leave_movements WHERE employee_id=998810 AND effect='consume'),'single immutable F12 consumption movement');
SELECT pg_temp.check_it(NOT EXISTS(SELECT FROM erp_private.hr_self_leave_admissions),'self leave admissions consumed in original transaction');
SELECT pg_temp.check_it((SELECT personal_email='mhr@example.invalid' FROM public.employees WHERE id=998810),'only requested contact value applied');
SELECT pg_temp.check_it(NOT EXISTS(SELECT 1 FROM public.employee_attendance_daily_summary WHERE employee_id=998810),'attendance request creates no summary');
SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
INSERT INTO mobile_case SELECT 'cross-period',public.mobile_hr_command_v1('leave.submit',v||jsonb_build_object('operationId',gen_random_uuid(),'startDate','2026-12-31','endDate','2027-01-02')) FROM mobile_case WHERE k='leave';
SELECT pg_temp.actor(2);
SELECT pg_temp.check_it(public.mobile_hr_command_v1('leave.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',v->'id','revision',1,'decision','approve'))->>'status'='approved','independent officer approves a cross-period leave') FROM mobile_case WHERE k='cross-period';
RESET ROLE;
SELECT pg_temp.check_it((SELECT array_agg(m.days ORDER BY m.period_start)=ARRAY[1,2]::numeric[] FROM erp_private.f12_leave_movements m JOIN mobile_case c ON m.request_id=(c.v->>'id')::bigint AND c.k='cross-period' WHERE m.effect='consume'),'immutable movements split one and two calendar days');
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_it((public.f11_mutate_time_child('leave-request',998810,(v->>'id')::bigint,2,gen_random_uuid(),'cancel','{"reason":"Synthetic officer reversal"}')->>'revision')::int=3,'existing staff cancellation reverses approved mobile leave') FROM mobile_case WHERE k='cross-period';
RESET ROLE;
SELECT pg_temp.check_it((SELECT array_agg(m.days ORDER BY m.period_start)=ARRAY[-1,-2]::numeric[] FROM erp_private.f12_leave_movements m JOIN mobile_case c ON m.request_id=(c.v->>'id')::bigint AND c.k='cross-period' WHERE m.effect='reverse'),'reversal retains original period allocations and provenance');
SELECT set_config('request.jwt.claims','{}',true);
-- New type requirement after original filing: test both mobile and original staff entry.
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
INSERT INTO mobile_case SELECT 'policy-change',public.mobile_hr_command_v1('leave.submit',v||jsonb_build_object('operationId',gen_random_uuid(),'startDate','2026-11-17','endDate','2026-11-17')) FROM mobile_case WHERE k='leave';
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
UPDATE public.hr_leave_types SET requires_document=true WHERE id=998810;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(2);
SELECT pg_temp.deny('leave.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',v->'id','revision',1,'decision','approve'),'23514','mobile approval rechecks newly required certificate') FROM mobile_case WHERE k='policy-change';
SELECT pg_temp.deny_staff_leave((v->>'id')::bigint,'23514','canonical staff approval rechecks newly required certificate') FROM mobile_case WHERE k='policy-change';
SELECT pg_temp.actor(1);
INSERT INTO mobile_case SELECT 'pinned-cert',public.mobile_hr_command_v1('leave.submit',v||jsonb_build_object('operationId',gen_random_uuid(),'startDate','2026-11-18','endDate','2026-11-18','documentId',998811,'documentVersionId',998811)) FROM mobile_case WHERE k='leave';
SELECT pg_temp.actor(2);
SELECT pg_temp.deny('leave.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',v->'id','revision',1,'decision','approve'),'42501','pending original cannot approve required leave') FROM mobile_case WHERE k='pinned-cert';
SELECT pg_temp.deny_staff_leave((v->>'id')::bigint,'42501','staff cannot accept pending certificate') FROM mobile_case WHERE k='pinned-cert';
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
UPDATE public.dms_document_files SET integrity_status='failed' WHERE id=998811;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
SELECT pg_temp.deny('leave.submit',v||jsonb_build_object('operationId',gen_random_uuid(),'startDate','2026-11-19','endDate','2026-11-19','documentId',998811,'documentVersionId',998811),'42501','known failed leave evidence rejected at filing') FROM mobile_case WHERE k='leave';
SELECT pg_temp.deny('request.submit',v||jsonb_build_object('operationId',gen_random_uuid()),'42501','known failed renewal evidence rejected at filing') FROM mobile_case WHERE k='evidence-proposal';
SELECT pg_temp.actor(2);
SELECT pg_temp.deny_staff_leave((v->>'id')::bigint,'42501','staff cannot accept integrity downgrade') FROM mobile_case WHERE k='pinned-cert';
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
UPDATE public.dms_document_files SET integrity_status='verified',sha256_hash=repeat('b',64) WHERE id=998811;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(2);
SELECT pg_temp.deny('leave.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',v->'id','revision',1,'decision','approve'),'42501','verified same-version file with changed SHA rejected') FROM mobile_case WHERE k='pinned-cert';
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
UPDATE public.dms_document_files SET sha256_hash=repeat('a',64),file_size_bytes=file_size_bytes+1 WHERE id=998811;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(2);
SELECT pg_temp.deny_staff_leave((v->>'id')::bigint,'42501','staff rejects changed certificate size') FROM mobile_case WHERE k='pinned-cert';
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
UPDATE public.dms_document_files SET file_size_bytes=file_size_bytes-1,deleted_at=now() WHERE id=998811;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
 OVERRIDING SYSTEM VALUE SELECT 998819,document_id,version_id,file_role,storage_bucket,storage_path||'-rebound',file_name,mime_type,file_size_bytes,sha256_hash,'verified'
 FROM public.dms_document_files WHERE id=998811;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(2);
SELECT pg_temp.deny('leave.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',v->'id','revision',1,'decision','approve'),'42501','matching bytes and hash on a rebound original file ID rejected') FROM mobile_case WHERE k='pinned-cert';
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
UPDATE public.dms_document_files SET deleted_at=now() WHERE id=998819;
UPDATE public.dms_document_files SET deleted_at=NULL WHERE id=998811;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(2);
SELECT pg_temp.check_it(public.mobile_hr_command_v1('leave.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',v->'id','revision',1,'decision','approve'))->>'status'='approved','verified original certificate advances document-required leave') FROM mobile_case WHERE k='pinned-cert';
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
SELECT pg_temp.check_it(NOT EXISTS(SELECT FROM erp_private.hr_mobile_staff_admissions),'all checked staff admissions consumed');
UPDATE public.hr_leave_types SET requires_document=false WHERE id=998810;
DELETE FROM public.user_roles WHERE role_id=998810 AND user_profile_id=(SELECT id FROM public.user_profiles WHERE auth_user_id='cccccccc-1111-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
SELECT pg_temp.check_it(NOT erp_private.employee_permission(998810,'hr.leave.manage'),'employee role has no leave management');
INSERT INTO mobile_case SELECT 'pure-self',public.mobile_hr_command_v1('leave.submit',v||jsonb_build_object('operationId',gen_random_uuid(),'startDate','2026-11-14','endDate','2026-11-14')) FROM mobile_case WHERE k='leave';
SELECT pg_temp.check_it(v->>'status'='pending','employee role alone submits pending leave') FROM mobile_case WHERE k='pure-self';
SELECT pg_temp.check_it(public.mobile_hr_command_v1('leave.cancel',jsonb_build_object('employeeId',998810,'id',v->'id','revision',1,'operationId',gen_random_uuid(),'reason','Dates changed'))->>'status'='cancelled','employee role alone cancels own pending leave') FROM mobile_case WHERE k='pure-self';
SELECT pg_temp.check_it(NOT has_table_privilege('authenticated','erp_private.hr_self_leave_admissions','insert') AND NOT has_table_privilege('authenticated','erp_private.hr_self_service_requests','update'),'authenticated has no direct admissions/proposal writes');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
-- Same auth UUID, corrected link: it now relates as the manager only.
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id) SELECT id,998811,998810,998810 FROM public.user_profiles WHERE auth_user_id='cccccccc-1111-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
INSERT INTO mobile_case SELECT 'reassigned',public.mobile_hr_command_v1('request.submit',v||jsonb_build_object('operationId',gen_random_uuid(),'proposal','{"sourceRevision":2,"changes":{"emergency_contact_name":"Private correction"}}'::jsonb)) FROM mobile_case WHERE k='profile';
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
DELETE FROM public.erp_user_employee_links WHERE employee_id=998814;
UPDATE public.erp_user_employee_links SET employee_id=998814 WHERE employee_id=998810;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(2);
SELECT pg_temp.check_it(public.mobile_hr_command_v1('request.decide',jsonb_build_object('employeeId',998810,'operationId',gen_random_uuid(),'id',v->'id','revision',1,'decision','reject','reason','Private officer decision'))->>'status'='rejected','officer records private reason after requester link changes') FROM mobile_case WHERE k='reassigned';
SELECT pg_temp.actor(1);
SELECT pg_temp.check_it(i->'proposal'='{}' AND i->'decisionReason'='null','former requester has only team-safe fields on open') FROM mobile_case CROSS JOIN LATERAL (SELECT public.mobile_hr_command_v1('request.open',jsonb_build_object('id',v->'id')) i)s WHERE k='reassigned';
SELECT pg_temp.check_it(EXISTS(SELECT FROM jsonb_array_elements(public.mobile_hr_command_v1('request.list','{"mode":"team"}')->'items') item WHERE item->'id'=v->'id' AND item->'proposal'='{}' AND item->'decisionReason'='null'),'former requester has only team-safe fields on list') FROM mobile_case WHERE k='reassigned';
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
UPDATE public.erp_user_employee_links SET employee_id=998810 WHERE employee_id=998814;
INSERT INTO public.employee_access_cards(id,employee_id,access_type_id,card_number,expiry_date) OVERRIDING SYSTEM VALUE VALUES(998811,998811,998810,'QA-DOMAIN','2026-12-31');
INSERT INTO public.roles(id,role_code,role_name) VALUES(998812,'QA_MHR_DOMAIN_ONLY','Synthetic domain-only user');
INSERT INTO public.role_permissions(role_id,permission_id) SELECT 998812,id FROM public.permissions WHERE permission_code IN ('hr.requests.submit.self','hr.leave.view.self','hr.attendance.view.self','hr.compliance.view.self');
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id) SELECT id,998812,998810,998810 FROM public.user_profiles WHERE auth_user_id='cccccccc-1111-4000-8000-000000000004';
INSERT INTO public.erp_user_employee_links(user_profile_id,employee_id) SELECT id,998811 FROM public.user_profiles WHERE auth_user_id='cccccccc-1111-4000-8000-000000000004';
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(4);
SELECT pg_temp.check_it(NOT public.current_user_can_view_employee(998811),'domain-only user lacks employee profile access');
SELECT pg_temp.deny('request.submit',v||jsonb_build_object('operationId',gen_random_uuid(),'employeeId',998811),'42501','domain-only user cannot file contact correction') FROM mobile_case WHERE k='profile';
SELECT pg_temp.deny('request.submit',v||jsonb_build_object('operationId',gen_random_uuid()),'42501','domain-only user cannot submit attendance for peer') FROM mobile_case WHERE k='attendance';
INSERT INTO mobile_case SELECT 'domain-attendance',public.mobile_hr_command_v1('request.submit',v||jsonb_build_object('operationId',gen_random_uuid(),'employeeId',998811)) FROM mobile_case WHERE k='attendance';
SELECT pg_temp.check_it(public.mobile_hr_command_v1('request.open',jsonb_build_object('id',v->'id'))->'proposal'?'reason','domain-only user can open own submitted attendance proposal') FROM mobile_case WHERE k='domain-attendance';
SELECT pg_temp.check_it(public.mobile_hr_command_v1('leave.submit',v||jsonb_build_object('operationId',gen_random_uuid(),'employeeId',998811))->>'status'='pending','domain-only user can submit own leave') FROM mobile_case WHERE k='leave';
SELECT pg_temp.check_it(public.mobile_hr_command_v1('request.submit',jsonb_build_object('employeeId',998811,'operationId',gen_random_uuid(),'kind','compliance-renewal','proposal','{"sourceKind":"access-card","sourceId":998811,"sourceRevision":1,"reason":"Synthetic officer follow-up"}'::jsonb))->>'status'='pending','verified own-domain user submits nonmedical renewal without profile access');
SELECT pg_temp.deny('request.submit',jsonb_build_object('employeeId',998811,'operationId',gen_random_uuid(),'kind','compliance-renewal','proposal','{"sourceKind":"medical-insurance","sourceId":998810,"sourceRevision":1,"reason":"Synthetic"}'::jsonb),'42501','domain-only compliance cannot access medical insurance');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
DELETE FROM public.role_permissions WHERE role_id=998812 AND permission_id=(SELECT id FROM public.permissions WHERE permission_code='hr.requests.submit.self');
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(4);
SELECT pg_temp.deny('request.open',jsonb_build_object('id',v->'id'),'42501','domain-only history revokes with submit authority') FROM mobile_case WHERE k='domain-attendance';
SELECT pg_temp.deny('leave.submit',v||jsonb_build_object('operationId',gen_random_uuid(),'employeeId',998811),'42501','domain view alone cannot submit') FROM mobile_case WHERE k='leave';
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
UPDATE public.user_profiles SET must_change_password=true WHERE auth_user_id='cccccccc-1111-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
SELECT pg_temp.deny('request.list','{"mode":"mine"}','42501','password change required denies access');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
UPDATE public.user_profiles SET must_change_password=false WHERE auth_user_id='cccccccc-1111-4000-8000-000000000001';
UPDATE public.user_roles SET is_active=false WHERE role_id=(SELECT id FROM public.roles WHERE role_code='employee_self_service') AND user_profile_id=(SELECT id FROM public.user_profiles WHERE auth_user_id='cccccccc-1111-4000-8000-000000000001');
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
SELECT pg_temp.deny('receipt',jsonb_build_object('operationId',v->'operationId'),'42501','revoked self role denies prior receipt') FROM mobile_case WHERE k='profile';
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
UPDATE public.user_roles SET is_active=true WHERE role_id=(SELECT id FROM public.roles WHERE role_code='employee_self_service') AND user_profile_id=(SELECT id FROM public.user_profiles WHERE auth_user_id='cccccccc-1111-4000-8000-000000000001');
DELETE FROM public.erp_user_employee_links WHERE employee_id=998810;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
SELECT pg_temp.deny('request.submit',v,'42501','unlinked account denied even on replay') FROM mobile_case WHERE k='profile';
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
DELETE FROM auth.sessions WHERE id='dddddddd-1111-4000-8000-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
SELECT pg_temp.deny('request.list','{"mode":"mine"}','42501','revoked session denied');
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
