\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
 IF current_database()<>'t00_clean' OR current_setting('cron.launch_active_jobs')<>'off'
   OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
      IS DISTINCT FROM 'Isolated HR T00 20261119' THEN RAISE EXCEPTION 'Isolated T00 database required'; END IF;
 IF to_regprocedure('public.t04_leave_preview(bigint,text,date,date)') IS NULL THEN
  RAISE EXCEPTION 'Verified paid/unpaid leave preview is missing';
 END IF;
END;
$$;
INSERT INTO auth.users(id,email,aud,role,email_confirmed_at)
SELECT ('96000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'t04-'||i||'@example.test','authenticated','authenticated',now()
FROM generate_series(1,6) i;
INSERT INTO auth.sessions(id,user_id,created_at,not_after)
SELECT ('96000000-0000-4000-8001-'||lpad(i::text,12,'0'))::uuid,
 ('96000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,now(),now()+interval '1 day' FROM generate_series(1,6) i;
INSERT INTO public.user_profiles(auth_user_id,status,must_change_password)
SELECT id,'active',false FROM auth.users WHERE email LIKE 't04-%@example.test' ON CONFLICT(auth_user_id) DO NOTHING;
UPDATE public.user_profiles SET status='active',must_change_password=false
WHERE auth_user_id IN(SELECT id FROM auth.users WHERE email LIKE 't04-%@example.test');
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope)
SELECT code,code,'HR','test','held'
FROM unnest(ARRAY['hr.medical.manage','hr.medical.view','dms.documents.view','dms.documents.preview','hr.employees.view','hr.leave.manage','hr.leave.view','hr.attendance.view']) code
ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.roles(role_code,role_name,is_system_role)
SELECT 't04_'||r,r,false FROM unnest(ARRAY['pro','gm','medical','payroll','sibling','roster']) r;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t04_pro',ARRAY['hr.leave.assist','hr.leave.approve','hr.leave.policy.prepare','hr.employees.view','hr.employees.update','hr.leave.view','hr.leave.manage']),
 ('t04_gm',ARRAY['hr.leave.approve','hr.leave.sick.exception']),
 ('t04_medical',ARRAY['hr.leave.sick.review','hr.medical.view','hr.medical.manage','dms.documents.view','dms.documents.preview','hr.employees.view']),
 ('t04_payroll',ARRAY['hr.leave.payroll.read']),
 ('t04_sibling',ARRAY['hr.leave.assist','hr.employees.view']),('t04_roster',ARRAY['hr.attendance.view','hr.employees.view'])
) use_case(code,caps) JOIN public.roles r ON r.role_code=use_case.code JOIN public.permissions p ON p.permission_code=ANY(use_case.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT u.id,r.id,920001,a.branch,true FROM (VALUES (1,'t04_pro',NULL::bigint),(2,'t04_gm',NULL),
 (3,'t04_medical',920011),(4,'t04_payroll',920011),(5,'t04_sibling',920012),(6,'t04_roster',920011)) a(i,role_code,branch)
JOIN public.user_profiles u ON u.auth_user_id=('96000000-0000-4000-8000-'||lpad(a.i::text,12,'0'))::uuid
JOIN public.roles r ON r.role_code=a.role_code;

CREATE FUNCTION pg_temp.t04_actor(i int) RETURNS text LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'sub','96000000-0000-4000-8000-'||lpad(i::text,12,'0'),
  'session_id','96000000-0000-4000-8001-'||lpad(i::text,12,'0'))::text,true);
$$;
CREATE FUNCTION pg_temp.t04_op(i int) RETURNS uuid LANGUAGE sql AS $$
 SELECT ('96000000-0000-4000-8002-'||lpad(i::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.t04_day(delta int) RETURNS date LANGUAGE sql STABLE AS $$
 SELECT (now() AT TIME ZONE 'Asia/Dubai')::date+delta;
$$;

SET LOCAL session_replication_role=replica;
INSERT INTO public.hr_leave_types(id,code,name_en,requires_document,reset_basis)
 OVERRIDING SYSTEM VALUE VALUES(960001,'ANNUAL','Synthetic annual',false,'joining_anniversary'),
 (960002,'SICK','Synthetic sick',true,'calendar_year');
INSERT INTO public.hr_medical_record_types(id,code,name_en) OVERRIDING SYSTEM VALUE VALUES(960001,'T04_MED','Synthetic sick evidence');
INSERT INTO public.dms_document_categories(id,category_code,name_en) OVERRIDING SYSTEM VALUE VALUES(960001,'T04_MED','Synthetic certificate category');
INSERT INTO public.dms_document_types(id,type_code,name_en,category_id) OVERRIDING SYSTEM VALUE VALUES(960001,'T04_MED','Synthetic certificate',960001);
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status,current_version_id)
 OVERRIDING SYSTEM VALUE VALUES(960001,'T04-CERT','Synthetic certificate',960001,960001,920001,920011,'internal','active',960001);
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current)
 OVERRIDING SYSTEM VALUE VALUES(960001,960001,1,true),(960002,960001,2,false);
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
 OVERRIDING SYSTEM VALUE VALUES(960001,960001,960001,'original','dms-documents','test/t04-cert.pdf','t04-cert.pdf','application/pdf',100,repeat('b',64),'verified');
INSERT INTO storage.objects(bucket_id,name) VALUES('dms-documents','test/t04-cert.pdf');
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES(960001,'employee',920001);
INSERT INTO public.employee_medical_records(id,employee_id,medical_record_type_id,examination_date,result,dms_document_id)
 OVERRIDING SYSTEM VALUE VALUES(960001,920001,960001,pg_temp.t04_day(0),'fit',960001);

INSERT INTO public.employee_leave_balances(id,employee_id,leave_type_id,leave_year,entitled_days,used_days,carry_forward,period_start,period_end,period_basis)
 OVERRIDING SYSTEM VALUE VALUES(960001,920002,960001,2026,30,0,2,'2026-02-28','2027-02-27','joining_anniversary');
SET LOCAL session_replication_role=origin;

WITH sources AS(
 INSERT INTO erp_private.t03_employment_changes(employee_id,source_revision,kind,effective_on,source_company,source_branch,
  destination_company,destination_branch,reason,digest,proposed_by,applied_by,applied_at)
 SELECT e.id,e.workspace_revision,'confirm','2024-02-29',e.owner_company_id,e.branch_id,e.owner_company_id,e.branch_id,
  'Synthetic prior verified employment',repeat('f',64),'96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002',now()
 FROM public.employees e WHERE e.id IN(920001,920002) RETURNING *
)
INSERT INTO erp_private.t03_employment_periods(employee_id,company_id,branch_id,employee_category_id,work_period,contractual_start,actual_start,source_revision,change_id)
SELECT employee_id,source_company,source_branch,920001,daterange('2024-02-29',NULL,'[)'),'2024-02-29','2024-02-29',source_revision,id FROM sources;

SELECT pg_temp.t04_actor(3) AS evidence_claims \gset
INSERT INTO erp_private.f12_evidence_verifications(employee_id,source_kind,source_id,source_hash,document_id,version_id,actor,operation_id,reason)
SELECT 920001,'medical-record',960001,encode(sha256(convert_to(erp_private.f12_workforce_source('medical-record',920001,960001,960001,NULL)::text,'UTF8')),'hex'),
 960001,960001,auth.uid(),pg_temp.t04_op(90),'Synthetic F12 verification';

CREATE FUNCTION pg_temp.t04_setup(p_kind text,p_employee bigint,p_facts jsonb,p_op int) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE prepared jsonb;
BEGIN
 PERFORM pg_temp.t04_actor(1);
 prepared:=public.t04_prepare_leave_setup(p_kind,920001,p_employee,p_facts,pg_temp.t04_op(p_op));
 PERFORM pg_temp.t04_actor(2);
 RETURN public.t04_approve_leave_setup((prepared->>'id')::bigint,prepared->>'digest',pg_temp.t04_op(p_op+1));
END;
$$;

SET LOCAL ROLE authenticated;
DO $$
DECLARE p jsonb;
DECLARE active_id bigint;
DECLARE previous_id bigint;
DECLARE cert jsonb;
BEGIN
 p:=pg_temp.t04_setup('policy',NULL,'{"from":"2024-02-29","until":"2030-01-01","service_basis":"actual","accrual":"daily",
  "first_year_days":30,"annual_days":30,"carry_limit":10,"carry_valid_days":360,"sick_full_days":2,
  "sick_partial_days":2,"sick_partial_rate":0.5,"sick_wait_months":0,"annual_wait_months":0,"sick_exception":false,"excluded_dates":[]}',1);
 PERFORM pg_temp.t04_actor(1);
 cert:=public.t04_leave_preview(920001,'annual',pg_temp.t04_day(1),pg_temp.t04_day(2));
 IF cert->>'status' IS DISTINCT FROM 'review-required' THEN RAISE EXCEPTION 'Unknown balance treated as zero'; END IF;
 BEGIN
  PERFORM pg_temp.t04_setup('opening',920002,'{"cutoff":"2026-02-28","earned":5,"annual_used":0,"sick_used":0,"evidence_reference":"Legacy carry must be resolved"}',20);
  RAISE EXCEPTION 'Unverified legacy carry was accepted';
 EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE '%Legacy balances%' THEN RAISE; END IF;
 END;
 p:=pg_temp.t04_setup('opening',920001,jsonb_build_object('cutoff',pg_temp.t04_day(0),'earned',20,'annual_used',0,
  'sick_used',1,'evidence_reference','Synthetic reviewed earned opening'),3);
 active_id:=(p->>'period_id')::bigint;
 p:=pg_temp.t04_setup('opening',920001,'{"cutoff":"2026-02-27","earned":5,"annual_used":0,"sick_used":0,"evidence_reference":"Synthetic previous period"}',5);
 previous_id:=(p->>'period_id')::bigint;
 PERFORM set_config('t04.active',active_id::text,true);
 PERFORM set_config('t04.previous',previous_id::text,true);
 PERFORM pg_temp.t04_actor(1);
 BEGIN
  PERFORM public.f11_mutate_time_child('leave-request',920001,NULL,NULL,pg_temp.t04_op(22),'create',jsonb_build_object(
    'leave_type_id',960001,'start_date',pg_temp.t04_day(1),'end_date',pg_temp.t04_day(1),'reason',NULL,'notes',NULL));
  RAISE EXCEPTION 'Managed leave could still be created through the legacy path';
 EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE '%reviewed assisted leave%' THEN RAISE; END IF;
 END;
 cert:=public.t04_leave_balance(920001,pg_temp.t04_day(0));
 IF cert->>'period_start' IS DISTINCT FROM '2026-02-28' OR cert->>'period_end' IS DISTINCT FROM '2027-02-27'
  OR (cert->>'earned')::numeric IS DISTINCT FROM 20 OR (cert->>'full_entitlement')::numeric IS DISTINCT FROM 30 THEN
  RAISE EXCEPTION 'Leap-day anniversary or verified opening mismatch'; END IF;
 PERFORM pg_temp.t04_actor(5);
 BEGIN
  PERFORM public.t04_leave_preview(920001,'annual',pg_temp.t04_day(1),pg_temp.t04_day(2));
  RAISE EXCEPTION 'Sibling branch saw leave details';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;
$$;
DO $$
DECLARE q jsonb;
DECLARE request jsonb;
DECLARE receipt jsonb;
DECLARE input jsonb;
DECLARE id bigint;
DECLARE n integer;
BEGIN
 PERFORM pg_temp.t04_actor(1);
 q:=public.t04_leave_preview(920001,'annual',pg_temp.t04_day(1),pg_temp.t04_day(25));
 IF (q->>'paid_days')::int IS DISTINCT FROM 20 OR (q->>'unpaid_days')::int IS DISTINCT FROM 5 THEN
  RAISE EXCEPTION 'Expected 20 paid + 5 unpaid, observed %',q; END IF;
 input:=jsonb_build_object('category','annual','from',pg_temp.t04_day(1),'to',pg_temp.t04_day(25),'fingerprint',q->>'fingerprint');
 request:=public.t04_leave_command(920001,NULL,'submit',input,pg_temp.t04_op(30));
 id:=(request->>'id')::bigint;
 IF public.t04_leave_command(920001,NULL,'submit',input,pg_temp.t04_op(30)) IS DISTINCT FROM (request||'{"replayed":true}'::jsonb) THEN
  RAISE EXCEPTION 'Submission failed exact replay'; END IF;
 IF (public.t04_leave_balance(920001,pg_temp.t04_day(0))->>'reserved')::int IS DISTINCT FROM 20 THEN RAISE EXCEPTION 'Reservation count mismatch'; END IF;
 request:=public.t04_leave_command(920001,id,'review','{"revision":1}',pg_temp.t04_op(31));
 BEGIN
  PERFORM public.t04_leave_command(920001,id,'approve','{"revision":2}',pg_temp.t04_op(32));
  RAISE EXCEPTION 'PRO approved own request';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t04_actor(2);
 request:=public.t04_leave_command(920001,id,'approve','{"revision":2}',pg_temp.t04_op(33));
 IF (public.t04_leave_balance(920001,pg_temp.t04_day(0))->>'approved_usage')::numeric IS DISTINCT FROM 20 THEN RAISE EXCEPTION 'Approved debit mismatch'; END IF;
 FOR n IN 1..2 LOOP
  input:=jsonb_build_object('revision',request->'revision','from',pg_temp.t04_day(21-n*3),'reason','Reviewed actual early return');
  request:=public.t04_leave_command(920001,id,'return',input,pg_temp.t04_op(33+n));
  receipt:=public.t04_leave_command(920001,id,'return',input,pg_temp.t04_op(33+n));
  IF receipt IS DISTINCT FROM (request||'{"replayed":true}'::jsonb) OR
   (public.t04_leave_balance(920001,pg_temp.t04_day(0))->>'approved_usage')::numeric IS DISTINCT FROM (20-3*n)::numeric THEN
   RAISE EXCEPTION 'Partial return lost original movements or replayed a second debit'; END IF;
 END LOOP;
 input:=jsonb_build_object('revision',request->'revision','reason','Release remaining dates');
 request:=public.t04_leave_command(920001,id,'cancel',input,pg_temp.t04_op(36));
 receipt:=public.t04_leave_command(920001,id,'cancel',input,pg_temp.t04_op(36));
 IF receipt IS DISTINCT FROM (request||'{"replayed":true}'::jsonb) OR request->>'status' IS DISTINCT FROM 'cancelled'
  OR (public.t04_leave_balance(920001,pg_temp.t04_day(0))->>'available')::numeric IS DISTINCT FROM 20 THEN
  RAISE EXCEPTION 'Cancellation or its exact retry did not restore all 20 days once'; END IF;
 PERFORM set_config('t04.annual',id::text,true);
END;
$$;
DO $$
DECLARE q jsonb;
DECLARE request jsonb;
DECLARE input jsonb;
DECLARE id bigint;
DECLARE reversal integer;
BEGIN
 PERFORM pg_temp.t04_setup('carry',920001,jsonb_build_object('source',current_setting('t04.previous')::bigint,
  'destination',current_setting('t04.active')::bigint,'days',3,'evidence_reference','Synthetic PRO verified remaining days'),40);
 PERFORM pg_temp.t04_actor(1);
 q:=public.t04_leave_preview(920001,'annual',pg_temp.t04_day(1),pg_temp.t04_day(4));
 IF (q->>'paid_days')::int IS DISTINCT FROM 4 OR q#>>'{days,0,fund_id}' IS NULL
  OR q#>>'{days,1,fund_id}' IS DISTINCT FROM q#>>'{days,0,fund_id}'
  OR q#>>'{days,2,fund_id}' IS DISTINCT FROM q#>>'{days,0,fund_id}' OR q#>>'{days,3,fund_id}' IS NOT NULL
  OR (public.t04_leave_balance(920001,pg_temp.t04_day(0))->>'available')::numeric IS DISTINCT FROM 23 THEN
   RAISE EXCEPTION 'Carry was not limited to stable oldest funding'; END IF;
 request:=public.t04_leave_command(920001,NULL,'submit',jsonb_build_object('category','annual','from',pg_temp.t04_day(1),
  'to',pg_temp.t04_day(4),'fingerprint',q->>'fingerprint'),pg_temp.t04_op(42));
 id:=(request->>'id')::bigint;
 PERFORM public.t04_leave_command(920001,id,'review','{"revision":1}',pg_temp.t04_op(43));
 PERFORM pg_temp.t04_actor(2);
 request:=public.t04_leave_command(920001,id,'approve','{"revision":2}',pg_temp.t04_op(44));
 FOR reversal IN 1..2 LOOP
  input:=jsonb_build_object('revision',request->'revision','from',pg_temp.t04_day(5-reversal),'reason','Synthetic partial return');
  request:=public.t04_leave_command(920001,id,'return',input,pg_temp.t04_op(44+reversal));
  IF public.t04_leave_command(920001,id,'return',input,pg_temp.t04_op(44+reversal))
    IS DISTINCT FROM request||'{"replayed":true}'::jsonb THEN RAISE EXCEPTION 'Mixed-funding return retry changed its receipt'; END IF;
 END LOOP;
 input:=jsonb_build_object('revision',request->'revision','reason','Synthetic cancellation of remaining dates');
 request:=public.t04_leave_command(920001,id,'cancel',input,pg_temp.t04_op(47));
 IF public.t04_leave_command(920001,id,'cancel',input,pg_temp.t04_op(47)) IS DISTINCT FROM request||'{"replayed":true}'::jsonb
  OR (public.t04_leave_balance(920001,pg_temp.t04_day(0))->>'available')::numeric IS DISTINCT FROM 23 THEN
  RAISE EXCEPTION 'Mixed-funding cancellation did not restore the full balance once'; END IF;
 PERFORM set_config('t04.mixed',id::text,true);
END;
$$;
DO $$
DECLARE q jsonb;
DECLARE request jsonb;
DECLARE pay jsonb;
DECLARE id bigint;
BEGIN
 PERFORM pg_temp.t04_actor(1);
 q:=public.t04_leave_preview(920001,'sick',pg_temp.t04_day(0),pg_temp.t04_day(4));
 IF (q->>'paid_days')::int IS DISTINCT FROM 1 OR (q->>'partial_days')::int IS DISTINCT FROM 2 OR (q->>'unpaid_days')::int IS DISTINCT FROM 2 THEN
  RAISE EXCEPTION 'Sick prior use did not cross full/partial/unpaid tiers'; END IF;
 request:=public.t04_leave_command(920001,NULL,'submit',jsonb_build_object('category','sick','from',pg_temp.t04_day(0),
  'to',pg_temp.t04_day(4),'fingerprint',q->>'fingerprint'),pg_temp.t04_op(50));
 id:=(request->>'id')::bigint;
 request:=public.t04_leave_command(920001,id,'review','{"revision":1}',pg_temp.t04_op(51));
 IF public.t04_read_leave_request(920001,id)->>'evidence_status' IS DISTINCT FROM 'pending'
  OR public.f03_has_document_permission(960001,'dms.documents.preview') OR EXISTS(
     SELECT 1 FROM storage.objects WHERE bucket_id='dms-documents' AND name='test/t04-cert.pdf') THEN
  RAISE EXCEPTION 'Assisted actor obtained private certificate or evidence state was lost'; END IF;
 BEGIN
  PERFORM public.t04_verify_sick_evidence(920001,id,2,960001,960001,pg_temp.t04_op(52));
  RAISE EXCEPTION 'PRO verified medical evidence without the medical role';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.t04_leave_certificate_choices(920001,id);
  RAISE EXCEPTION 'PRO obtained certificate choices';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t04_actor(3);
 BEGIN
  PERFORM public.t04_leave_command(920001,id,'approve','{"revision":2}',pg_temp.t04_op(54));
  RAISE EXCEPTION 'Sick leave approved before verifying evidence';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 BEGIN
  PERFORM public.t04_verify_sick_evidence(920001,id,2,960001,960002,pg_temp.t04_op(55));
  RAISE EXCEPTION 'Stale version was accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 PERFORM public.t04_verify_sick_evidence(920001,id,2,960001,960001,pg_temp.t04_op(56));
 RESET ROLE;
 SET LOCAL session_replication_role=replica;
 UPDATE public.dms_documents SET current_version_id=960002 WHERE dms_documents.id=960001;
 SET LOCAL session_replication_role=origin;
 SET LOCAL ROLE authenticated;
 BEGIN
  PERFORM public.t04_leave_command(920001,id,'approve','{"revision":2}',pg_temp.t04_op(59));
  RAISE EXCEPTION 'Approval accepted superseded evidence';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
 RESET ROLE;
 SET LOCAL session_replication_role=replica;
 UPDATE public.dms_documents SET current_version_id=960001 WHERE dms_documents.id=960001;
 SET LOCAL session_replication_role=origin;
 SET LOCAL ROLE authenticated;
 PERFORM public.t04_leave_command(920001,id,'approve','{"revision":2}',pg_temp.t04_op(57));
 PERFORM pg_temp.t04_actor(4);
 pay:=public.t04_pay_leave(920001,pg_temp.t04_day(0),pg_temp.t04_day(4));
 IF jsonb_array_length(pay)<>5 OR (pay#>>'{0,rate}')::numeric IS DISTINCT FROM 1 OR (pay#>>'{1,rate}')::numeric IS DISTINCT FROM 0.5
  OR (pay#>>'{4,rate}')::numeric IS DISTINCT FROM 0 OR pay::text~'certificate|version_id|medical_id|digest|document_id|storage' THEN
  RAISE EXCEPTION 'Accounts projection lost pay bands or disclosed sick evidence'; END IF;
 PERFORM pg_temp.t04_actor(6);
 IF NOT erp_private.t04_approved_leave_day(920001,pg_temp.t04_day(0)) THEN
  RAISE EXCEPTION 'Attendance did not receive the safe approved-day flag'; END IF;
 RESET ROLE;
 UPDATE erp_private.t03_employment_periods SET work_period=daterange(lower(work_period),pg_temp.t04_day(2),'[)')
  WHERE employee_id=920001 AND upper_inf(work_period);
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t04_actor(4);
 BEGIN
  PERFORM public.t04_pay_leave(920001,pg_temp.t04_day(0),pg_temp.t04_day(4));
  RAISE EXCEPTION 'Payroll received leave after its employment scope ended';
 EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE '%employment scope changed%' THEN RAISE; END IF;
 END;
 RESET ROLE;
 UPDATE erp_private.t03_employment_periods SET work_period=daterange(lower(work_period),NULL,'[)') WHERE employee_id=920001;
 SET LOCAL ROLE authenticated;
END;
$$;
RESET ROLE;
SET LOCAL session_replication_role=replica;
DELETE FROM public.employee_leave_balances WHERE id=960001 AND employee_id=920002;
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;
DO $$
DECLARE q jsonb;
DECLARE revised jsonb;
DECLARE request jsonb;
DECLARE id bigint;
DECLARE first_period bigint;
DECLARE second_period bigint;
BEGIN
 PERFORM pg_temp.t04_setup('policy',920002,'{"from":"2024-02-29","until":"2030-01-01","service_basis":"actual","accrual":"monthly",
  "first_year_days":30,"annual_days":30,"carry_limit":10,"carry_valid_days":1,"sick_full_days":2,
  "sick_partial_days":2,"sick_partial_rate":0.5,"sick_wait_months":0,"annual_wait_months":0,"sick_exception":true,"sick_cutoff_day":10,
  "excluded_dates":["2026-03-02"]}',100);
 first_period:=(pg_temp.t04_setup('opening',920002,'{"cutoff":"2026-02-27","earned":2,"annual_used":0,"sick_used":0,"evidence_reference":"Verified previous period"}',102)->>'period_id')::bigint;
 second_period:=(pg_temp.t04_setup('opening',920002,'{"cutoff":"2026-02-28","earned":2,"annual_used":0,"sick_used":0,"evidence_reference":"Verified current period"}',104)->>'period_id')::bigint;
 BEGIN
  PERFORM pg_temp.t04_setup('carry',920002,jsonb_build_object('source',first_period,'destination',second_period,'days',1,'evidence_reference','Expired window'),119);
  RAISE EXCEPTION 'Expired carry became available';
 EXCEPTION WHEN check_violation THEN IF SQLERRM NOT LIKE '%expired%' THEN RAISE; END IF;
 END;
 PERFORM pg_temp.t04_actor(1);
 q:=public.t04_leave_preview(920002,'annual','2026-02-27','2026-02-28');
 IF q->>'paid_days' IS DISTINCT FROM '2' OR q#>>'{days,0,period_id}' IS NULL
  OR q#>>'{days,0,period_id}' IS NOT DISTINCT FROM q#>>'{days,1,period_id}' THEN
  RAISE EXCEPTION 'Cross-anniversary preview charged the wrong entitlement periods'; END IF;
 request:=public.t04_leave_command(920002,NULL,'submit',jsonb_build_object('category','annual','from','2026-02-27','to','2026-02-28','fingerprint',q->>'fingerprint'),pg_temp.t04_op(106));
 id:=(request->>'id')::bigint;
 revised:=public.t04_preview_leave_revision(920002,id,'2026-02-27','2026-03-03');
 IF jsonb_array_length(revised->'days')<>4 OR revised->'days' @> '[{"day":"2026-03-02"}]'::jsonb THEN
  RAISE EXCEPTION 'Revision forgot the approved favorable calendar date'; END IF;
 request:=public.t04_leave_command(920002,id,'revise',jsonb_build_object('from','2026-02-27','to','2026-03-03','fingerprint',revised->>'fingerprint','revision',1),pg_temp.t04_op(107));
 request:=public.t04_leave_command(920002,id,'review',jsonb_build_object('revision',request->'revision'),pg_temp.t04_op(108));
 PERFORM pg_temp.t04_actor(2);
 request:=public.t04_leave_command(920002,id,'approve',jsonb_build_object('revision',request->'revision'),pg_temp.t04_op(109));
 PERFORM public.t04_leave_command(920002,id,'cancel',jsonb_build_object('revision',request->'revision','reason','Reviewed cross-period return'),pg_temp.t04_op(110));
 PERFORM set_config('t04.cross',id::text,true);

 PERFORM pg_temp.t04_actor(1);
 q:=public.t04_leave_preview(920002,'sick','2026-03-04','2026-03-04');
 request:=public.t04_leave_command(920002,NULL,'submit',jsonb_build_object('category','sick','from','2026-03-04','to','2026-03-04','fingerprint',q->>'fingerprint'),pg_temp.t04_op(111));
 id:=(request->>'id')::bigint;
 PERFORM public.t04_leave_command(920002,id,'review','{"revision":1}',pg_temp.t04_op(112));
 PERFORM pg_temp.t04_actor(2);
 IF public.t04_read_leave_request(920002,id)->>'cutoff_due' IS DISTINCT FROM '2026-03-10' THEN
  RAISE EXCEPTION 'Monthly sick cutoff date not applied'; END IF;
 PERFORM public.t04_leave_command(920002,id,'approve-exception','{"revision":2,"reason":"Independent synthetic cutoff review"}',pg_temp.t04_op(113));
 IF public.t04_read_leave_request(920002,id)->>'evidence_status' IS DISTINCT FROM 'exception' THEN
  RAISE EXCEPTION 'Cutoff decision was not retained'; END IF;
END;
$$;
RESET ROLE;
DO $$
BEGIN
 IF EXISTS(
   SELECT 1 FROM erp_private.t04_days d
   LEFT JOIN erp_private.f12_leave_movements debit ON debit.allocation_id=d.id AND debit.effect='consume'
   LEFT JOIN erp_private.f12_leave_movements credit ON credit.reverses_movement_id=debit.id
   WHERE d.case_id=current_setting('t04.mixed')::bigint
   GROUP BY d.id,d.day,d.fund_id,d.period_id
   HAVING count(debit.id)<>1 OR count(credit.id)<>1 OR NOT bool_and(
    debit.days=-1 AND credit.days=1 AND credit.effect='reverse' AND credit.allocation_id=d.id
    AND debit.entitlement_id=d.period_id AND credit.entitlement_id=d.period_id
    AND debit.fund_id IS NOT DISTINCT FROM d.fund_id AND credit.fund_id IS NOT DISTINCT FROM d.fund_id
    AND credit.source_operation=pg_temp.t04_op(CASE d.day-pg_temp.t04_day(0) WHEN 4 THEN 45 WHEN 3 THEN 46 ELSE 47 END))
 ) OR (SELECT count(*) FROM erp_private.t04_case_events WHERE case_id=current_setting('t04.mixed')::bigint
     AND action IN('return','cancel'))<>3 THEN
  RAISE EXCEPTION 'Two mixed-funding returns and cancellation did not match each original bucket and audit once'; END IF;
 IF (SELECT count(*) FROM erp_private.f12_leave_movements m JOIN erp_private.t04_days d ON d.id=m.allocation_id
     WHERE d.case_id=current_setting('t04.annual')::bigint AND m.effect='consume')<>20
  OR (SELECT count(*) FROM erp_private.f12_leave_movements m JOIN erp_private.t04_days d ON d.id=m.allocation_id
     WHERE d.case_id=current_setting('t04.annual')::bigint AND m.effect='reverse' AND m.reverses_movement_id IS NOT NULL)<>20
  OR (SELECT count(*) FROM erp_private.f12_leave_movements c JOIN erp_private.f12_leave_movements d ON d.id=c.paired_movement_id
     WHERE c.effect='carry-in' AND d.effect='carry-out' AND c.days+d.days=0)<>1
  OR (SELECT count(DISTINCT m.entitlement_id) FROM erp_private.f12_leave_movements m JOIN erp_private.t04_days d ON d.id=m.allocation_id
     WHERE d.case_id=current_setting('t04.cross')::bigint AND m.effect='reverse')<>2
  OR EXISTS(SELECT 1 FROM erp_private.t04_case_events WHERE operation_id IN(pg_temp.t04_op(32),pg_temp.t04_op(54),pg_temp.t04_op(59)))
  OR has_table_privilege('authenticated','erp_private.t04_sick_evidence','SELECT')
  OR has_function_privilege('anon','public.t04_pay_leave(bigint,date,date)','EXECUTE') THEN
  RAISE EXCEPTION 'Durable movement or evidence boundaries failed'; END IF;
END;
$$;
SELECT 'PASS: reviewed openings, leap/cross anniversary, 20+5 split, PRO/GM, pending revision, exact reversals, FIFO carry, sick evidence/tier/cutoff and roster';
ROLLBACK;
