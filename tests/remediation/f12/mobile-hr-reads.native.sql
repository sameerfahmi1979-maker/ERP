\set ON_ERROR_STOP on
BEGIN;
CREATE FUNCTION pg_temp.expect(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL %',label; END IF; RAISE NOTICE 'PASS %',label; END $$;
CREATE FUNCTION pg_temp.actor(n int) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('sub','cccccccc-1111-4000-8000-'||lpad(n::text,12,'0'),'session_id','dddddddd-1111-4000-8000-'||lpad(n::text,12,'0'),'role','authenticated')::text,true)::text;
$$;
CREATE FUNCTION pg_temp.deny(stmt text,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN BEGIN EXECUTE stmt; EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'PASS %',label; RETURN; END;
RAISE EXCEPTION 'FAIL allowed %',label; END $$;
INSERT INTO public.owner_companies(id,company_code,legal_name_en) VALUES(998810,'MHR_A','Synthetic A'),(998811,'MHR_B','Synthetic B');
INSERT INTO public.branches(id,owner_company_id,branch_code,branch_name_en) VALUES(998810,998810,'MHR_A','A'),(998811,998810,'MHR_C','Sibling'),(998812,998811,'MHR_B','Other');
INSERT INTO public.roles(id,role_code,role_name) VALUES(998810,'QA_MHR_REVIEW','Synthetic HR reviewer');
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code)
SELECT code,code,'hr','manage' FROM unnest(ARRAY['hr.actions.view','hr.actions.manage','hr.employees.view','hr.employees.update','hr.attendance.view','hr.attendance.manage','hr.leave.view','hr.leave.manage','hr.compliance.view','hr.compliance.manage'])code ON CONFLICT(permission_code)DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id) SELECT 998810,id FROM public.permissions WHERE permission_code IN('hr.actions.view','hr.actions.manage','hr.employees.view','hr.employees.update','hr.attendance.view','hr.attendance.manage','hr.leave.view','hr.leave.manage','hr.compliance.view','hr.compliance.manage');
INSERT INTO auth.users(id,email,raw_user_meta_data) SELECT ('cccccccc-1111-4000-8000-'||lpad(n::text,12,'0'))::uuid,'mhr-'||n||'@example.invalid','{"full_name":"Synthetic Reviewer"}' FROM generate_series(1,4)n;
INSERT INTO auth.sessions(id,user_id) SELECT ('dddddddd-1111-4000-8000-'||lpad(n::text,12,'0'))::uuid,('cccccccc-1111-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,4)n;
UPDATE public.user_profiles SET status='active',must_change_password=false,owner_company_id=998810,branch_id=998810 WHERE auth_user_id::text LIKE 'cccccccc-1111-%';
INSERT INTO public.roles(id,role_code,role_name) VALUES(998811,'QA_HR_READ_SELF','Synthetic self reader');
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code)
SELECT code,code,'hr','view' FROM unnest(ARRAY['hr.employees.view.self','hr.leave.view.self','dms.documents.view','dms.documents.preview']) code ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id) SELECT 998811,id FROM public.permissions WHERE permission_code IN('hr.employees.view.self','hr.leave.view.self');
INSERT INTO public.role_permissions(role_id,permission_id) SELECT 998810,id FROM public.permissions WHERE permission_code IN('dms.documents.view','dms.documents.preview');
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id)
SELECT id,CASE WHEN right(auth_user_id::text,1)='1' THEN 998811 ELSE 998810 END,998810,998810
FROM public.user_profiles WHERE auth_user_id::text LIKE 'cccccccc-1111-%' AND right(auth_user_id::text,1) IN ('1','2');
INSERT INTO public.hr_employee_categories(id,code,name_en) OVERRIDING SYSTEM VALUE VALUES(998810,'MHR','Synthetic');
INSERT INTO public.employees(id,employee_code,full_name_en,gender,date_of_birth,mobile_number,owner_company_id,branch_id,joining_date,emergency_contact_name,emergency_contact_mobile,employee_category_id)
OVERRIDING SYSTEM VALUE SELECT 998809+n,'MHR-'||n,'Synthetic Employee '||n,'male','1992-03-01','0000000000',CASE n WHEN 4 THEN 998811 ELSE 998810 END,CASE n WHEN 3 THEN 998811 WHEN 4 THEN 998812 ELSE 998810 END,'2020-01-01','Synthetic','0000000000',998810 FROM generate_series(1,4)n;
INSERT INTO public.erp_user_employee_links(user_profile_id,employee_id) SELECT id,998810 FROM public.user_profiles WHERE auth_user_id='cccccccc-1111-4000-8000-000000000001';
INSERT INTO public.hr_leave_types(id,code,name_en,reset_basis,requires_document) OVERRIDING SYSTEM VALUE VALUES(998810,'MHR_TEST','QA calendar','calendar_year',false),(998811,'MHR_MANUAL','QA manual','manual',false);
INSERT INTO public.employee_leave_balances(employee_id,leave_type_id,leave_year,entitled_days,used_days,carry_forward,period_start,period_end,period_basis) VALUES(998810,998810,2026,20,0,0,'2026-01-01','2026-12-31','calendar_year');
INSERT INTO public.hr_access_card_types(id,code,name_en,requires_client_authority) OVERRIDING SYSTEM VALUE VALUES(998810,'MHR_CARD','Synthetic card',false);
INSERT INTO public.employee_access_cards(id,employee_id,access_type_id,card_number,expiry_date) OVERRIDING SYSTEM VALUE VALUES(998810,998810,998810,'QA123','2026-12-31');
-- Only fixture construction bypasses unrelated document numbering and draft write triggers.
SET LOCAL session_replication_role=replica;
INSERT INTO public.dms_document_categories(id,category_code,name_en) OVERRIDING SYSTEM VALUE VALUES(998810,'MHR','Synthetic evidence');
INSERT INTO public.dms_document_types(id,type_code,name_en,category_id) OVERRIDING SYSTEM VALUE VALUES(998810,'MHR','Synthetic file',998810);
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status,is_archived,current_version_id)
OVERRIDING SYSTEM VALUE SELECT x,'READ-'||x,'Synthetic file',998810,998810,998810,998810,'internal','active',false,x FROM generate_series(998810,998814)x;
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE SELECT x,x,1,true FROM generate_series(998810,998814)x;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
OVERRIDING SYSTEM VALUE SELECT x,x,x,'original','qa','qa/'||x,'synthetic.pdf','application/pdf',100,CASE WHEN x<>998814 THEN repeat('a',64) END,CASE WHEN x=998812 THEN 'failed' ELSE 'pending' END FROM generate_series(998810,998814)x;
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES (998810,'employee',998810),(998811,'employee',998810),(998811,'employee',998812),(998812,'employee',998810),(998813,'employee',998810),(998814,'employee',998810);
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
OVERRIDING SYSTEM VALUE VALUES(998899,998813,998813,'original','qa','qa/ambiguous','second.pdf','application/pdf',100,repeat('a',64),'pending');
INSERT INTO public.employee_approval_requests(employee_id,approval_type,request_title,request_status,requested_by,created_by)
SELECT x,'other','Synthetic request','pending',p.id,p.id FROM public.user_profiles p CROSS JOIN generate_series(998810,998813)x WHERE right(p.auth_user_id::text,1)='1';
INSERT INTO public.employee_approval_requests(employee_id,approval_type,request_title,request_status,requested_by,created_by)
SELECT 998810,'disciplinary','Withheld confidential title','pending',id,id FROM public.user_profiles WHERE right(auth_user_id::text,1)='1';
INSERT INTO public.employee_approval_requests(employee_id,approval_type,request_title,request_status,requested_by,created_by,approval_role_id)
SELECT 998810,'other','Mapped role request','pending',id,id,998810 FROM public.user_profiles WHERE right(auth_user_id::text,1)='1';
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
SELECT pg_temp.expect(public.mobile_hr_staff_capabilities() = '{"roster":false,"requestsTeam":false,"approvalsGeneral":false,"approvalsLeave":false,"approvalsProposal":false}'::jsonb,'self menu has no staff authority');
SELECT pg_temp.expect(jsonb_array_length(public.mobile_hr_leave_read(998810,'options',1))=2,'self reads only active leave choices');
SELECT pg_temp.expect(public.mobile_hr_leave_read(998810,'requests',1)='[]','known empty leave history');
SELECT pg_temp.expect(public.mobile_hr_leave_read(998810,'options',1)->0 ? 'requiresDocument','certificate requirement included');
SELECT pg_temp.expect(public.mobile_hr_leave_read(998810,'balances',0)->0->>'known'='true','verified employee period with known balance');
SELECT pg_temp.deny($q$select public.mobile_hr_leave_read(998811,'options',1)$q$,'self cannot open coworker');
SELECT pg_temp.deny($q$select public.mobile_hr_evidence(998810,1)$q$,'self needs independent DMS grants');
SELECT pg_temp.deny($q$select public.mobile_hr_staff_inbox('approval',0)$q$,'self cannot open management queue');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
DELETE FROM public.role_permissions WHERE role_id=998811 AND permission_id=(SELECT id FROM public.permissions WHERE permission_code='hr.employees.view.self');
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
SELECT pg_temp.expect(NOT EXISTS(SELECT 1 FROM public.employees WHERE id=998810),'leave-only cannot read employee profile or contacts');
SELECT pg_temp.expect(public.mobile_hr_own_access() @> '{"employeeId":998810,"profile":false,"leave":true,"attendance":false,"medical":false,"compliance":false}'::jsonb,'home offers only authorized linked domains');
SELECT pg_temp.expect(NOT(public.mobile_hr_own_access() ?| ARRAY['name','email','mobile_number','branch','employee_code']),'home identity discovery discloses no personal fields');
SELECT pg_temp.expect(jsonb_array_length(public.mobile_hr_leave_read(998810,'options',1))=2,'single domain permission enables own leave reader');
SELECT pg_temp.expect((public.mobile_hr_leave_read(998810,'balances',0)->0) @> '{"known":true,"entitled_days":20,"used_days":0,"reserved_days":0}'::jsonb,'domain-only verified F12 balance matches fully permitted reader');
SELECT pg_temp.deny($q$select public.mobile_hr_leave_read(998811,'balances',0)$q$,'single own leave grant cannot open another balance');
SELECT pg_temp.deny($q$select public.mobile_hr_own_records(998810,'punch',1)$q$,'own leave grant cannot read attendance history');
SELECT pg_temp.deny($q$select public.mobile_hr_own_records(998810,'medical-insurance',1)$q$,'own leave grant cannot read insurance');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code)
  SELECT code,code,'hr','view' FROM unnest(ARRAY['hr.attendance.view.self','hr.compliance.view.self'])code ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id) SELECT 998811,id FROM public.permissions WHERE permission_code IN('hr.attendance.view.self','hr.compliance.view.self');
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
SELECT pg_temp.expect(public.mobile_hr_own_records(998810,'punch',1)='[]' AND public.mobile_hr_own_records(998810,'shift',1)='[]','verified own attendance history and shifts without profile grant');
SELECT pg_temp.expect(public.mobile_hr_own_records(998810,'access-card',1)='[{"id":998810,"label":"Synthetic card","revision":"1","expiryDate":"2026-12-31"}]'::jsonb,'own compliance reader without profile grant');
SELECT pg_temp.deny($q$select public.mobile_hr_own_records(998811,'attendance',1)$q$,'cross-subject time denied even with known id');
SELECT pg_temp.actor(2);
SELECT pg_temp.expect(public.mobile_hr_staff_capabilities() @> '{"roster":true,"approvalsGeneral":true,"approvalsLeave":true,"approvalsProposal":true}'::jsonb,'officer has authority on real branch subjects');
SELECT pg_temp.expect(public.mobile_hr_roster_scopes(NULL,false,0,'')='[{"id":998810,"label":"Synthetic A"}]','one authorized company');
SELECT pg_temp.expect(public.mobile_hr_roster_scopes(998810,true,0,'')='[{"id":998810,"label":"A"}]','no sibling branch');
SELECT pg_temp.deny($q$select public.mobile_hr_leave_read(998812,'options',1)$q$,'sibling subject denied');
SELECT pg_temp.deny($q$select public.mobile_hr_leave_read(998813,'options',1)$q$,'other company denied');
SELECT pg_temp.expect(jsonb_array_length(public.mobile_hr_staff_inbox('approval',0))=2,'only actionable exact branch approvals');
SELECT pg_temp.expect(public.mobile_hr_staff_inbox('approval',0)->0->>'employeeLabel' LIKE 'MHR-%Synthetic Employee%','actionable staff subject is identified by code and name');
SELECT pg_temp.expect(public.mobile_hr_staff_inbox('leave',0)='[]','verified empty leave queue');
SELECT pg_temp.expect(jsonb_array_length(public.mobile_hr_evidence(998810,1))=2 AND public.mobile_hr_evidence(998810,1)->0->>'versionId'='998814','unverified positive-sized unique original eligible for renewal only');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL session_replication_role=replica;
INSERT INTO public.employee_leave_requests(id,employee_id,leave_type_id,start_date,end_date,total_days,created_by,sick_cert_dms_id)
 OVERRIDING SYSTEM VALUE SELECT 998820,998810,998810,'2026-11-21','2026-11-22',2,id,998810 FROM public.user_profiles WHERE auth_user_id='cccccccc-1111-4000-8000-000000000001';
INSERT INTO public.employee_leave_requests(id,employee_id,leave_type_id,start_date,end_date,total_days,created_by)
 OVERRIDING SYSTEM VALUE SELECT 998821,998810,998811,'2026-12-01','2026-12-05',5,id FROM public.user_profiles WHERE auth_user_id='cccccccc-1111-4000-8000-000000000001';
INSERT INTO erp_private.hr_self_leave_evidence(leave_id,document_id,version_id,original_file_id,original_sha256,original_bytes)
 VALUES(998820,998810,998810,998810,repeat('a',64),100);
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(2);
SELECT pg_temp.expect(public.mobile_hr_staff_inbox('leave',0,998810,998820)->0 @> '{"leaveType":"QA calendar","totalDays":2,"certificateStatus":null,"certificateReference":null}',
 'exact leave opening includes entitlement and charge but withholds certificate without medical view');
SELECT pg_temp.expect(public.mobile_hr_staff_inbox('leave',0,998810,998821)->0 @> '{"leaveType":"QA manual","totalDays":5}',
 'a distinct leave type has its actual charged duration in the exact opening');
SELECT pg_temp.expect(public.mobile_hr_staff_inbox('leave',0,998812,998820)='[]','leave context cannot be paired with another employee');
SELECT pg_temp.expect(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.mobile_hr_evidence(998810,1)) x WHERE (x->>'id')::bigint=998812),'failed original omitted from evidence picker');
SELECT pg_temp.expect(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.mobile_hr_evidence(998810,1)) x WHERE (x->>'id')::bigint=998813),'ambiguous original omitted from evidence picker');
SELECT pg_temp.deny($q$select public.mobile_hr_evidence(998810,1,'leave')$q$,'selecting leave certificate requires scoped medical view');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code) VALUES('hr.medical.view','Synthetic medical','hr','view') ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id) SELECT 998810,id FROM public.permissions WHERE permission_code='hr.medical.view' ON CONFLICT DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(2);
SELECT pg_temp.expect(jsonb_array_length(public.mobile_hr_evidence(998810,1,'leave'))=1 AND public.mobile_hr_evidence(998810,1,'leave')->0->>'versionId'='998810','certificate filing eligibility requires an exact SHA-backed original');
SELECT pg_temp.expect(public.mobile_hr_staff_inbox('leave',0,998810,998820)->0 @> '{"certificateStatus":"Pending integrity verification","certificateReference":"DMS #998810 / version #998810"}',
 'authorized opening shows pinned certificate as pending rather than reviewed');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL session_replication_role=replica;
UPDATE public.dms_document_files SET integrity_status='verified' WHERE id=998810;
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(2);
SELECT pg_temp.expect(public.mobile_hr_staff_inbox('leave',0,998810,998820)->0->>'certificateStatus'='Original integrity verified','unchanged verified certificate is identified precisely');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
DELETE FROM public.role_permissions WHERE role_id=998810 AND permission_id=(SELECT id FROM public.permissions WHERE permission_code='dms.documents.preview');
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(2);
SELECT pg_temp.expect(public.mobile_hr_staff_inbox('leave',0,998810,998820)->0 @> '{"certificateStatus":null,"certificateReference":null}',
 'revoked DMS preview immediately withholds certificate review status and reference');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.role_permissions(role_id,permission_id) SELECT 998810,id FROM public.permissions WHERE permission_code='dms.documents.preview';
SET LOCAL session_replication_role=replica;
UPDATE public.dms_document_files SET sha256_hash=repeat('b',64) WHERE id=998810;
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(2);
SELECT pg_temp.expect(public.mobile_hr_staff_inbox('leave',0,998810,998820)->0 @> '{"certificateStatus":"Unavailable or changed","certificateReference":null}',
 'a changed pinned original cannot be represented as verified');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
DELETE FROM public.role_permissions WHERE role_id=998810 AND permission_id=(SELECT id FROM public.permissions WHERE permission_code='hr.employees.view');
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(2);
SELECT pg_temp.expect(NOT public.current_user_can_view_employee(998810) AND erp_private.f11_child_authorized('leave-request',998810),
 'profile revocation retains the separate scoped leave read and manage grants');
SELECT pg_temp.deny($q$select erp_private.mobile_hr_leave_context(998820,998810)$q$,
 'leave-only officer cannot directly call definer leave opening after profile revocation');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.role_permissions(role_id,permission_id) SELECT 998810,id FROM public.permissions WHERE permission_code='hr.employees.view';
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(2);
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id) SELECT id,998810,998811,998812 FROM public.user_profiles WHERE right(auth_user_id::text,1)='2';
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(2);
SELECT pg_temp.expect(jsonb_array_length(public.mobile_hr_roster_scopes(NULL,false,0,''))=2,'exact union of two assigned companies');
SELECT pg_temp.deny($q$select public.mobile_hr_leave_read(998812,'options',1)$q$,'sibling still denied after additional assignment');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
UPDATE public.user_profiles SET branch_id=998811 WHERE auth_user_id='cccccccc-1111-4000-8000-000000000002';
INSERT INTO public.erp_user_employee_links(user_profile_id,employee_id) SELECT id,998812 FROM public.user_profiles WHERE auth_user_id='cccccccc-1111-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(2);
SELECT pg_temp.expect(public.mobile_hr_own_access() @> '{"employeeId":998812,"profile":false}' AND public.mobile_hr_staff_capabilities() @> '{"roster":true,"approvalsGeneral":true}', 'independent branch officer retains staff options while own profile is restricted');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);

-- Role and DTO regressions through the same public procedures used by the mobile handler.
SET LOCAL session_replication_role=replica;
INSERT INTO public.roles(id,role_code,role_name) VALUES(998812,'QA_MHR_TEAM','Team only'),(998813,'QA_MHR_INSURANCE','Insurance reviewer');
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code)
 SELECT code,code,'hr','view' FROM unnest(ARRAY['hr.employee_profile.view.team','hr.actions.view.team','hr.attendance.view.team','hr.medical.manage']) code ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
 SELECT 998812,id FROM public.permissions WHERE permission_code IN ('hr.employee_profile.view.team','hr.attendance.view.team','hr.actions.view.team','hr.attendance.manage');
INSERT INTO public.role_permissions(role_id,permission_id)
 SELECT 998813,id FROM public.permissions WHERE permission_code IN ('hr.employees.view','hr.actions.view','hr.actions.manage','hr.compliance.view','hr.medical.view','hr.medical.manage');
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id)
 SELECT id,CASE right(auth_user_id::text,1) WHEN '3' THEN 998812 ELSE 998813 END,998810,998810
 FROM public.user_profiles WHERE auth_user_id::text LIKE 'cccccccc-1111-%' AND right(auth_user_id::text,1) IN ('3','4');
INSERT INTO public.erp_user_employee_links(user_profile_id,employee_id) SELECT id,998811 FROM public.user_profiles WHERE auth_user_id='cccccccc-1111-4000-8000-000000000003';
INSERT INTO public.employees(id,employee_code,full_name_en,gender,date_of_birth,mobile_number,owner_company_id,branch_id,joining_date,emergency_contact_name,emergency_contact_mobile,employee_category_id)
 OVERRIDING SYSTEM VALUE SELECT n,'MHR-'||n,'Synthetic roster '||n,'male','1992-03-01','0000000000',998810,998810,'2020-01-01','Synthetic','0000000000',998810 FROM generate_series(998815,998816)n;
UPDATE public.employees SET reporting_manager_id=998811 WHERE id IN(998810,998812,998813,998815);
INSERT INTO public.work_sites(id,site_code,site_name,site_type,owner_company_id,branch_id) OVERRIDING SYSTEM VALUE
 VALUES(998810,'QA-PRI','Primary only','office',998810,998810),(998811,'QA-SITE','Recorded work site','project_site',998810,998810);
UPDATE public.employees SET primary_work_site_id=998810 WHERE id IN(998810,998815);
INSERT INTO public.employee_attendance_daily_summary(id,employee_id,attendance_date,attendance_type,work_site_id)
 OVERRIDING SYSTEM VALUE VALUES(998810,998810,'2026-11-10','site',998811);
INSERT INTO public.employee_attendance_punches(id,employee_id,punch_datetime,punch_type)
 OVERRIDING SYSTEM VALUE SELECT n,998810,'2026-11-10T08:00:00+04','in' FROM generate_series(998810,998835)n;
INSERT INTO public.employee_overtime_records(id,employee_id,overtime_date,hours)
 OVERRIDING SYSTEM VALUE SELECT n,998810,'2026-11-10',1 FROM generate_series(998810,998835)n;
INSERT INTO erp_private.hr_self_service_requests(employee_id,company_id,branch_id,requester,kind,proposal)
 VALUES(998810,998810,998810,'cccccccc-1111-4000-8000-000000000001','attendance-correction','{"reason":"Review hours"}'),
 (998810,998810,998810,'cccccccc-1111-4000-8000-000000000001','compliance-renewal','{"sourceKind":"medical-insurance","reason":"Renewal needed"}');
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(3);
SELECT pg_temp.expect(public.mobile_hr_profile(998811) IS NULL AND public.mobile_hr_own_access()->>'employeeId'='998811','team manager has verified link and hidden own profile');
SELECT pg_temp.expect(public.mobile_hr_profile(998810)->>'employee_code'='MHR-1' AND public.mobile_hr_profile(998810)->'contacts'='null','direct report opens with all contacts withheld');
SELECT pg_temp.expect(public.mobile_hr_profile(998816) IS NULL AND public.mobile_hr_profile(998812) IS NULL AND public.mobile_hr_profile(998813) IS NULL,'same-branch nonreport, sibling report and other-company report stay hidden');
SELECT pg_temp.expect(public.mobile_hr_staff_capabilities() @> '{"requestsTeam":true,"roster":true}' AND public.mobile_hr_own_access()->>'mine'='false','team-only history and roster offered independently of own history');
SELECT pg_temp.expect(jsonb_array_length(public.mobile_hr_command_v1('request.list','{"mode":"team"}')->'items')=1,'team manager sees only own report and authorized domain request');
SELECT pg_temp.expect(public.mobile_hr_roster_scopes(998810,true,0,'')='[{"id":998810,"label":"A"}]','team supervisor branch selector resolves only a direct report scope');
SELECT pg_temp.expect(public.mobile_hr_roster_groups(998810,998810,'2026-11-10','team',0,'')='[{"id":998811,"label":"My direct reports"}]','manager team picker works without revealing hidden manager profile');
SELECT pg_temp.expect(public.f12_attendance_roster('2026-11-10',998810)->>'total'='2','unfiltered roster includes unentered report, excludes nonreports and sibling');
SELECT pg_temp.expect(public.mobile_hr_roster_sites(998810,998810,'2026-11-10','site',0,'')='[{"id":998811,"label":"QA-SITE — Recorded work site"}]','site picker uses recorded site, excludes unentered primary site');
SELECT pg_temp.expect(public.f12_attendance_roster('2026-11-10',998810,998810,998811)->'rows'->0->>'employee_id'='998810','selected temporary site resolves recorded attendance');
SELECT pg_temp.expect(public.mobile_hr_roster_sites(998810,998810,'2026-11-11','site',0,'')='[]','recorded-site filter is date specific');
SELECT pg_temp.expect(jsonb_array_length(public.mobile_hr_roster_sites(998810,998810,'2026-11-10','workSite',0,''))=2,'entry work-site picker includes eligible unrecorded sites');
-- The team assignment in A and a manage-only assignment in B are deliberately unequal.
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.roles(id,role_code,role_name) VALUES(998817,'QA_MHR_MANAGE_ONLY','Synthetic attendance manager');
INSERT INTO public.role_permissions(role_id,permission_id) SELECT 998817,id FROM public.permissions WHERE permission_code='hr.attendance.manage';
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id)
 SELECT id,998817,998810,998811 FROM public.user_profiles WHERE auth_user_id='cccccccc-1111-4000-8000-000000000003';
SET LOCAL session_replication_role=replica;
INSERT INTO public.work_sites(id,site_code,site_name,site_type,owner_company_id,branch_id,address_line_1,available_to_all_organizations)
 OVERRIDING SYSTEM VALUE VALUES
 (998817,'QA-MIX','Sibling private','office',998810,998811,'Withheld sibling address',false),
 (998818,'QA-SHARE','Sibling shared','yard',998810,998811,'Withheld shared address',true),
 (998819,'QA-OTHER','Other shared','yard',998811,998812,'Withheld other address',true);
UPDATE public.work_sites SET address_line_1='Authorized team address' WHERE id=998811;
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(3);
SELECT pg_temp.expect(public.mobile_hr_roster_sites(998810,998810,'2026-11-10','workSite',0,'Sibling private')='[]',
 'separate sibling manage grant cannot reveal a local site without sibling read');
SELECT pg_temp.expect(public.mobile_hr_roster_sites(998810,NULL,'2026-11-10','workSite',0,'QA-MIX')='[]',
 'company-wide selector cannot combine different branches for site labels');
SELECT pg_temp.expect(public.mobile_hr_roster_sites(998810,998810,'2026-11-10','workSite',0,'QA-SHARE')='[{"id":998818,"label":"QA-SHARE — Sibling shared"}]',
 'shared sibling site exposes only code and name despite local manage-only assignment');
SELECT pg_temp.expect(public.mobile_hr_roster_sites(998810,998810,'2026-11-10','workSite',0,'QA-OTHER')='[{"id":998819,"label":"QA-OTHER — Other shared"}]'
 AND public.mobile_hr_roster_sites(998810,998810,'2026-11-10','workSite',0,'Withheld')='[]','shared-site addresses in other scopes are absent from labels and search');
SELECT pg_temp.expect(public.mobile_hr_roster_sites(998810,998810,'2026-11-10','workSite',0,'Authorized team address')='[{"id":998811,"label":"QA-SITE — Recorded work site — Authorized team address"}]'
 AND public.mobile_hr_profile(998811) IS NULL,'team-only manager with an authorized matching-branch direct report can select that local site');
SELECT pg_temp.expect(public.f12_attendance_entry_opening(998810,998810)->'row'->>'id'='998810','team supervisor opens original summary');
SELECT pg_temp.deny('select public.f12_attendance_entry_opening(998816,null)','nonreport opening denied');
SELECT pg_temp.deny('select public.f12_attendance_entry_opening(998812,null)','sibling report opening denied');
SELECT pg_temp.deny('select public.f12_attendance_entry_opening(998813,null)','other company report opening denied');
SELECT pg_temp.expect(jsonb_array_length(public.mobile_hr_time_history(998810,k,1))=26 AND public.mobile_hr_time_history(998810,k,1)->0->>'id'='998835'
 AND public.mobile_hr_time_history(998810,k,1)->24->>'id'='998811' AND public.mobile_hr_time_history(998810,k,2)->0->>'id'='998810'
 AND jsonb_array_length(public.mobile_hr_time_history(998810,k,2))=1,'26 tied '||k||' records use ID order and lookahead without count') FROM unnest(ARRAY['punch','overtime'])k;
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
SET LOCAL session_replication_role=replica;
INSERT INTO public.employee_attendance_punches(id,employee_id,punch_datetime,punch_type) OVERRIDING SYSTEM VALUE
 VALUES(998840,998810,'2026-11-20T00:30:00+04','in'),(998841,998810,'2026-11-21T01:15:00+04','out');
UPDATE public.employee_attendance_daily_summary SET first_in_at='2026-11-20T00:30:00+04',last_out_at='2026-11-21T01:15:00+04' WHERE id=998810;
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
SELECT pg_temp.expect(public.mobile_hr_own_records(998810,'punch',1)->0->>'date'='2026-11-21 01:15 +04:00'
 AND public.mobile_hr_own_records(998810,'punch',1)->1->>'date'='2026-11-20 00:30 +04:00','domain-only midnight and overnight punches display Dubai date without changing order');
SELECT pg_temp.expect(public.mobile_hr_own_records(998810,'attendance',1)->0->>'date'='2026-11-10'
 AND public.mobile_hr_own_records(998810,'attendance',1)->0->>'detail' LIKE 'In 2026-11-20 00:30 +04:00 · Out 2026-11-21 01:15 +04:00%',
 'domain-only daily date unchanged and in/out show Dubai midnight and overnight dates');
SELECT pg_temp.actor(3);
SELECT pg_temp.expect(public.mobile_hr_time_history(998810,'punch',1)->0->>'date'='2026-11-21 01:15 +04:00'
 AND public.mobile_hr_time_history(998810,'punch',1)->1->>'date'='2026-11-20 00:30 +04:00','full-profile midnight and overnight punches use the same Dubai display');
CREATE FUNCTION pg_temp.day_entry(subject bigint) RETURNS jsonb LANGUAGE sql STABLE AS $$
  WITH opening AS (SELECT public.f12_attendance_entry_opening(subject,NULL) AS data)
  SELECT jsonb_build_object('employeeId',subject,'date',data->>'date','id',NULL,'revision',NULL,'fingerprint',data->'row'->>'fingerprint',
    'operation','68c78070-5e92-4d23-b207-000000000001','reason','Synthetic roster',
    'values',jsonb_build_object('attendance_type','office','work_site_id',998811,'intervals',jsonb_build_array(jsonb_build_object(
      'start',(data->>'date')||'T08:00:00+04:00','end',(data->>'date')||'T09:00:00+04:00','breaks','[]'::jsonb)))) FROM opening;
$$;
SELECT pg_temp.deny('select public.f12_save_attendance(pg_temp.day_entry(998815))','minimal viewer cannot bypass native employee-write scope');
SELECT pg_temp.expect(NOT public.current_user_can_manage_employee(998815),'minimal roster viewer has no employee-write authority');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code) VALUES('hr.employee_profile.manage.team','Synthetic team writer','hr','manage') ON CONFLICT DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id) SELECT 998812,id FROM public.permissions WHERE permission_code='hr.employee_profile.manage.team';
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(3);
SELECT pg_temp.expect(public.f12_save_attendance(pg_temp.day_entry(998815))->>'employee_id'='998815','team supervisor with scoped write authority saves original F12 attendance');
SELECT pg_temp.expect(public.f12_reconcile_attendance('68c78070-5e92-4d23-b207-000000000001')->>'employee_id'='998815','team-only manager reconciles original F12 operation');
SELECT pg_temp.actor(4);
SELECT pg_temp.expect(public.mobile_hr_staff_capabilities()->>'approvalsProposal'='true' AND jsonb_array_length(public.mobile_hr_command_v1('request.list','{"mode":"review"}')->'items')=1,'insurance-only officer gets actionable insurance proposal');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
DELETE FROM public.role_permissions WHERE role_id=998813 AND permission_id=(SELECT id FROM public.permissions WHERE permission_code='hr.medical.manage');
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(4);
SELECT pg_temp.expect(public.mobile_hr_staff_capabilities()->>'approvalsProposal'='false' AND public.mobile_hr_command_v1('request.list','{"mode":"review"}')->'items'='[]','removal of medical management removes the insurance inbox');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.role_permissions(role_id,permission_id) SELECT 998811,id FROM public.permissions WHERE permission_code='hr.requests.submit.self';
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
SELECT pg_temp.expect(public.mobile_hr_own_access()->>'mine'='true' AND jsonb_array_length(public.mobile_hr_command_v1('request.list','{"mode":"mine"}')->'items')=1,'linked attendance submitter has own history');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
DELETE FROM public.role_permissions WHERE role_id=998811 AND permission_id=(SELECT id FROM public.permissions WHERE permission_code='hr.requests.submit.self');
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(1);
SELECT pg_temp.expect(public.mobile_hr_own_access()->>'mine'='false','submit revocation closes own history even with prior requests');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);

\if :{?profile_race}
-- Only the disposable two-session harness may persist its synthetic fixture.
DO $$ BEGIN IF current_database() NOT LIKE 'mobile_hr_api_race_%' THEN RAISE EXCEPTION 'Use a disposable race database'; END IF; END $$;
COMMIT;
\ir mobile-hr-profile-race.native.sql
\else
DELETE FROM auth.sessions WHERE id='dddddddd-1111-4000-8000-000000000002';
SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(2);
SELECT pg_temp.deny($q$select public.mobile_hr_leave_read(998810,'options',1)$q$,'revoked session inaccessible');
ROLLBACK;
\endif
