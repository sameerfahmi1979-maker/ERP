-- Run after the T04 integrated fixtures and before their final ROLLBACK.
SELECT set_config('request.jwt.claims','{}',true);
UPDATE public.user_profiles SET owner_company_id=920001,branch_id=920011
 WHERE auth_user_id='96000000-0000-4000-8000-000000000006';
INSERT INTO public.erp_user_employee_links(user_profile_id,employee_id)
 SELECT id,920001 FROM public.user_profiles WHERE auth_user_id='96000000-0000-4000-8000-000000000006';
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id)
 SELECT u.id,r.id,920001,920011 FROM public.user_profiles u CROSS JOIN public.roles r
 WHERE r.role_code='employee_self_service' AND u.auth_user_id='96000000-0000-4000-8000-000000000006';
CREATE TEMP TABLE mobile_t04_test (name text PRIMARY KEY, data jsonb NOT NULL);
GRANT SELECT, INSERT ON mobile_t04_test TO authenticated;

CREATE FUNCTION pg_temp.mobile_leave_request(p_days integer,p_op integer) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('employeeId',920001,'operationId',pg_temp.t04_op(p_op),'leaveTypeId',960001,
   'startDate',pg_temp.t04_day(p_days),'endDate',pg_temp.t04_day(p_days),'reason','Synthetic leave reason');
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t04_actor(6) AS mobile_claims \gset
DO $$
DECLARE opening jsonb := pg_temp.mobile_leave_request(70,900);
DECLARE request jsonb;
DECLARE cancel jsonb;
DECLARE staff_case jsonb;
BEGIN
 request:=public.mobile_hr_command_v1('leave.submit',opening);
 IF request->>'status'<>'pending' OR request->>'replayed'<>'false' THEN RAISE EXCEPTION 'Expected a new pending Mobile HR request'; END IF;
 IF public.mobile_hr_command_v1('leave.submit',opening) IS DISTINCT FROM request||'{"replayed":true}' THEN
  RAISE EXCEPTION 'Mobile submission lost its original operation receipt'; END IF;
 IF public.mobile_hr_command_v1('receipt',jsonb_build_object('operationId',opening->'operationId')) IS DISTINCT FROM request||'{"replayed":true}' THEN
  RAISE EXCEPTION 'Receipt lookup failed'; END IF;
 BEGIN
  PERFORM public.mobile_hr_command_v1('leave.submit',opening||jsonb_build_object('operationId',pg_temp.t04_op(908)));
  RAISE EXCEPTION 'Different operation created overlapping managed leave';
 EXCEPTION WHEN check_violation THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.mobile_hr_leave_read(920001,'requests',1)) r
   WHERE r->'id'=request->'id' AND r->>'revision'=request->>'revision' AND (r->>'canCancel')::boolean) THEN
  RAISE EXCEPTION 'Managed request missing from Mobile HR history'; END IF;
 BEGIN
  PERFORM public.mobile_hr_command_v1('leave.submit',opening||'{"reason":"changed"}');
  RAISE EXCEPTION 'Changed submission reused the original operation ID';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
  PERFORM public.mobile_hr_command_v1('leave.submit',opening||jsonb_build_object('employeeId',920002,'operationId',pg_temp.t04_op(901)));
  RAISE EXCEPTION 'Mobile user submitted leave for a different employee';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 cancel:=jsonb_build_object('employeeId',920001,'operationId',pg_temp.t04_op(902),
   'id',request->'id','revision',request->'revision','reason','Synthetic cancellation');
 PERFORM pg_temp.t04_actor(5);
 BEGIN
  PERFORM public.mobile_hr_command_v1('leave.cancel',cancel);
  RAISE EXCEPTION 'A sibling branch cancelled the request';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t04_actor(6);
 BEGIN
  PERFORM public.mobile_hr_command_v1('leave.cancel',cancel||'{"revision":99}');
  RAISE EXCEPTION 'Stale Mobile HR cancellation succeeded';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t04_actor(1);
 SELECT r INTO staff_case FROM jsonb_array_elements(public.t04_list_leave_requests(920001)) r
  WHERE r->>'from'=pg_temp.t04_day(70)::text AND r->>'status'='pending';
 IF staff_case IS NULL THEN RAISE EXCEPTION 'PRO could not open the canonical T04 case'; END IF;
 IF public.t04_read_leave_request(920001,(staff_case->>'id')::bigint)->>'employee_reason' IS NOT NULL THEN
  RAISE EXCEPTION 'PRO saw a confidential leave reason without medical access'; END IF;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims','{}',true);
 INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id)
  SELECT u.id,r.id,920001,920011 FROM public.user_profiles u CROSS JOIN public.roles r
  WHERE r.role_code='t04_pro' AND u.auth_user_id='96000000-0000-4000-8000-000000000006';
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t04_actor(6);
 BEGIN
  PERFORM public.t04_leave_command(920001,(staff_case->>'id')::bigint,'review','{"revision":1}',pg_temp.t04_op(903));
  RAISE EXCEPTION 'Applicant reviewed their own request using a PRO role';
 EXCEPTION WHEN insufficient_privilege THEN IF SQLERRM<>'Independent PRO review required' THEN RAISE; END IF; END;
 PERFORM pg_temp.t04_actor(1);
 staff_case:=public.t04_leave_command(920001,(staff_case->>'id')::bigint,'review','{"revision":1}',pg_temp.t04_op(903));
 cancel:=cancel||jsonb_build_object('revision',staff_case->'revision');
 PERFORM pg_temp.t04_actor(6);
 request:=public.mobile_hr_command_v1('leave.cancel',cancel);
 IF request->>'status'<>'cancelled' OR public.mobile_hr_command_v1('leave.cancel',cancel) IS DISTINCT FROM request||'{"replayed":true}' THEN
  RAISE EXCEPTION 'Managed cancellation did not have one replayable result'; END IF;
 INSERT INTO mobile_t04_test VALUES ('withdrawn',jsonb_build_object('id',staff_case->'id'));
 request:=public.mobile_hr_command_v1('leave.submit',pg_temp.mobile_leave_request(71,904));
 INSERT INTO mobile_t04_test VALUES ('annual-mobile',request);
 PERFORM pg_temp.t04_actor(1);
 SELECT r INTO staff_case FROM jsonb_array_elements(public.t04_list_leave_requests(920001)) r
  WHERE r->>'from'=pg_temp.t04_day(71)::text AND r->>'status'='pending';
 IF staff_case IS NULL THEN RAISE EXCEPTION 'Second canonical T04 case not found'; END IF;
 staff_case:=public.t04_leave_command(920001,(staff_case->>'id')::bigint,'review','{"revision":1}',pg_temp.t04_op(905));
 PERFORM pg_temp.t04_actor(2);
 staff_case:=public.t04_leave_command(920001,(staff_case->>'id')::bigint,'approve','{"revision":2}',pg_temp.t04_op(906));
 IF public.t04_leave_command(920001,(staff_case->>'id')::bigint,'approve','{"revision":2}',pg_temp.t04_op(906))
   IS DISTINCT FROM staff_case||'{"replayed":true}' THEN RAISE EXCEPTION 'GM approval retry changed the receipt'; END IF;
 INSERT INTO mobile_t04_test VALUES ('approved',staff_case);
 PERFORM pg_temp.t04_actor(6);
 BEGIN
  PERFORM public.mobile_hr_command_v1('leave.cancel',cancel||jsonb_build_object('id',request->'id',
     'revision',staff_case->'revision','operationId',pg_temp.t04_op(907)));
  RAISE EXCEPTION 'Self-service reversed approved leave';
 EXCEPTION WHEN check_violation THEN NULL; END;
END;
$$;
RESET ROLE;
DO $$
BEGIN
 IF (SELECT count(*) FROM erp_private.t04_days d WHERE d.case_id=(SELECT (data->>'id')::bigint FROM mobile_t04_test WHERE name='withdrawn') AND d.state='released')<>1
 OR (SELECT count(*) FROM erp_private.t04_days d JOIN erp_private.f12_leave_movements m ON m.allocation_id=d.id
   WHERE d.case_id=(SELECT (data->>'id')::bigint FROM mobile_t04_test WHERE name='approved') AND m.effect='consume' AND m.days=-1)<>1
 OR EXISTS(SELECT 1 FROM public.employee_leave_requests WHERE id=(SELECT (data->>'id')::bigint FROM mobile_t04_test WHERE name='annual-mobile')) THEN
  RAISE EXCEPTION 'Mobile HR duplicated a case, reservation, ledger posting or legacy request';
 END IF;
 RAISE NOTICE 'PASS: Mobile HR managed leave submission, history, ownership, cancellation, PRO/GM and exact retries';
END;
$$;

SELECT set_config('request.jwt.claims','{}',true);
-- Prepare three synthetic originals, including one for a sibling branch.
SET LOCAL session_replication_role=replica;
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,
 confidentiality_level,status,current_version_id) OVERRIDING SYSTEM VALUE
 SELECT id,'MHR-CERT-'||id,'Synthetic Mobile certificate',960001,960001,920001,CASE id WHEN 960011 THEN 920012 ELSE 920011 END,
 'internal','active',id FROM generate_series(960010,960012) id;
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE
 SELECT id,id,1,true FROM generate_series(960010,960012) id;
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE VALUES(960013,960010,2,false);
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,
 file_size_bytes,sha256_hash,integrity_status) OVERRIDING SYSTEM VALUE
 SELECT id,CASE id WHEN 960013 THEN 960010 ELSE id END,id,'original','dms-documents','test/mhr-cert-'||id||'.pdf',
 'synthetic.pdf','application/pdf',100,repeat('c',64),'verified' FROM generate_series(960010,960013) id;
INSERT INTO storage.objects(bucket_id,name)
 SELECT 'dms-documents','test/mhr-cert-'||id||'.pdf' FROM generate_series(960010,960013) id;
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id)
 SELECT id,'employee',CASE id WHEN 960011 THEN 920002 ELSE 920001 END FROM generate_series(960010,960012) id;
INSERT INTO public.employee_medical_records(id,employee_id,medical_record_type_id,examination_date,result,dms_document_id)
 OVERRIDING SYSTEM VALUE
 SELECT id,CASE id WHEN 960011 THEN 920002 ELSE 920001 END,960001,pg_temp.t04_day(75),'fit',id
 FROM generate_series(960010,960012) id;
INSERT INTO public.employee_leave_balances(employee_id,leave_type_id,leave_year,entitled_days,used_days,carry_forward,period_start,period_end,period_basis)
 VALUES(920001,960002,2024,20,0,0,'2024-01-01','2024-12-31','calendar_year');
SET LOCAL session_replication_role=origin;

SELECT pg_temp.t04_actor(3) AS mobile_evidence_actor \gset
INSERT INTO erp_private.f12_evidence_verifications(employee_id,source_kind,source_id,source_hash,document_id,version_id,actor,operation_id,reason)
 SELECT 920001,'medical-record',id,encode(sha256(convert_to(erp_private.f12_workforce_source('medical-record',920001,id,id,NULL)::text,'UTF8')),'hex'),
 id,id,auth.uid(),pg_temp.t04_op(id-959080),'Synthetic Mobile certificate verification' FROM unnest(ARRAY[960010,960012]) id;

CREATE FUNCTION pg_temp.mobile_sick_request(p_day date,p_operation integer,p_document bigint DEFAULT 960010,p_version bigint DEFAULT 960010)
RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('employeeId',920001,'operationId',pg_temp.t04_op(p_operation),'leaveTypeId',960002,
   'startDate',p_day,'endDate',p_day,'reason','Synthetic sick leave','documentId',p_document,'documentVersionId',p_version);
$$;
CREATE FUNCTION pg_temp.expect_leave_error(p_action text,p_data jsonb,p_state text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 BEGIN PERFORM public.mobile_hr_command_v1(p_action,p_data);
 EXCEPTION WHEN OTHERS THEN IF SQLSTATE=p_state THEN RETURN; END IF; RAISE; END;
 RAISE EXCEPTION 'Mobile leave command accepted ineligible input for %',p_action;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t04_actor(6) AS mobile_claims \gset
SELECT pg_temp.expect_leave_error('leave.submit',pg_temp.mobile_sick_request(pg_temp.t04_day(75),910),'42501');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
 WHERE r.role_code='t04_roster' AND p.permission_code='hr.medical.view' ON CONFLICT DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT pg_temp.t04_actor(6) AS mobile_claims \gset
SELECT pg_temp.expect_leave_error('leave.submit',pg_temp.mobile_sick_request(pg_temp.t04_day(75),910),'42501');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
 WHERE (r.role_code='t04_roster' AND p.permission_code IN ('dms.documents.view','dms.documents.preview'))
   OR (r.role_code='t04_medical' AND p.permission_code IN ('hr.leave.view','hr.leave.manage','hr.employees.update'))
 ON CONFLICT DO NOTHING;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t04_actor(6) AS mobile_claims \gset
SELECT pg_temp.expect_leave_error('leave.submit',pg_temp.mobile_sick_request(pg_temp.t04_day(75),910)-'documentId'-'documentVersionId','23514');
SELECT pg_temp.expect_leave_error('leave.submit',pg_temp.mobile_sick_request(pg_temp.t04_day(75),910,960011,960011),'42501');
SELECT pg_temp.expect_leave_error('leave.submit',pg_temp.mobile_sick_request(pg_temp.t04_day(75),910,960010,960013),'42501');
INSERT INTO mobile_t04_test VALUES ('sick-mobile',public.mobile_hr_command_v1('leave.submit',pg_temp.mobile_sick_request(pg_temp.t04_day(75),910)));
INSERT INTO mobile_t04_test VALUES ('sick-legacy',public.mobile_hr_command_v1('leave.submit',pg_temp.mobile_sick_request('2024-02-01',911,960012,960012)));

DO $$
DECLARE sick_case bigint;
DECLARE legacy_open jsonb;
DECLARE saved jsonb;
BEGIN
 PERFORM pg_temp.t04_actor(1);
 SELECT (r->>'id')::bigint INTO STRICT sick_case FROM jsonb_array_elements(public.t04_list_leave_requests(920001)) r
  WHERE r->>'from'=pg_temp.t04_day(75)::text AND r->>'category'='sick';
 INSERT INTO mobile_t04_test VALUES ('sick-canonical',jsonb_build_object('id',sick_case));
 PERFORM public.t04_leave_command(920001,sick_case,'review','{"revision":1}',pg_temp.t04_op(912));
 BEGIN PERFORM public.t04_verify_sick_evidence(920001,sick_case,2,960010,960010,pg_temp.t04_op(913));
  RAISE EXCEPTION 'PRO accepted confidential evidence'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t04_actor(5);
 BEGIN PERFORM public.t04_verify_sick_evidence(920001,sick_case,2,960010,960010,pg_temp.t04_op(913));
  RAISE EXCEPTION 'Sibling branch accepted confidential evidence'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t04_actor(3);
 IF public.t04_read_leave_request(920001,sick_case)->>'employee_reason' IS DISTINCT FROM 'Synthetic sick leave' THEN
  RAISE EXCEPTION 'The scoped medical reviewer did not receive the employee reason'; END IF;
 BEGIN PERFORM public.t04_leave_command(920001,sick_case,'approve','{"revision":2}',pg_temp.t04_op(914));
  RAISE EXCEPTION 'T04 sick leave approved without evidence'; EXCEPTION WHEN check_violation THEN NULL; END;
 IF jsonb_array_length(public.t04_leave_certificate_choices(920001,sick_case))<>1 THEN
  RAISE EXCEPTION 'T04 presented a certificate other than the submitted original'; END IF;
 BEGIN PERFORM public.t04_verify_sick_evidence(920001,sick_case,2,960012,960012,pg_temp.t04_op(915));
  RAISE EXCEPTION 'Different valid certificate silently substituted'; EXCEPTION WHEN check_violation THEN NULL; END;
 saved:=public.t04_verify_sick_evidence(920001,sick_case,2,960010,960010,pg_temp.t04_op(915));
 IF public.t04_verify_sick_evidence(920001,sick_case,2,960010,960010,pg_temp.t04_op(915)) IS DISTINCT FROM saved||'{"replayed":true}' THEN
  RAISE EXCEPTION 'T04 certificate retry changed its exact receipt'; END IF;
 SELECT jsonb_build_object('employeeId',920001,'id',data->'id','revision',data->'revision','operationId',pg_temp.t04_op(916),'decision','approve')
  INTO legacy_open FROM mobile_t04_test WHERE name='sick-legacy';
 PERFORM pg_temp.t04_actor(1);
 PERFORM pg_temp.expect_leave_error('leave.decide',legacy_open,'42501');
 PERFORM pg_temp.t04_actor(3);
 saved:=public.mobile_hr_command_v1('leave.decide',legacy_open);
 IF saved->>'status'<>'approved' OR public.mobile_hr_command_v1('leave.decide',legacy_open) IS DISTINCT FROM saved||'{"replayed":true}' THEN
  RAISE EXCEPTION 'Legacy Mobile sick approval did not retain one T01 receipt'; END IF;
END;
$$;
RESET ROLE;

DO $$
DECLARE sick_case bigint := (SELECT (data->>'id')::bigint FROM mobile_t04_test WHERE name='sick-canonical');
DECLARE approval jsonb;
BEGIN
 -- Alter the fixtures as a different transaction participant would before approval.
 UPDATE public.dms_documents SET current_version_id=960013 WHERE id=960010;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t04_actor(3);
 BEGIN PERFORM public.t04_leave_command(920001,sick_case,'approve','{"revision":2}',pg_temp.t04_op(914));
  RAISE EXCEPTION 'T04 approved after replacement'; EXCEPTION WHEN check_violation THEN NULL; END;
 RESET ROLE;
 UPDATE public.dms_documents SET current_version_id=960010 WHERE id=960010;
 UPDATE public.dms_document_files SET integrity_status='failed' WHERE id=960010;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t04_actor(3);
 BEGIN PERFORM public.t04_leave_command(920001,sick_case,'approve','{"revision":2}',pg_temp.t04_op(914));
  RAISE EXCEPTION 'T04 approved failed certificate bytes'; EXCEPTION WHEN check_violation THEN NULL; END;
 RESET ROLE;
 UPDATE public.dms_document_files SET integrity_status='verified' WHERE id=960010;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t04_actor(3);
 approval:=public.t04_leave_command(920001,sick_case,'approve','{"revision":2}',pg_temp.t04_op(914));
 IF approval->>'status'<>'approved' OR public.t04_leave_command(920001,sick_case,'approve','{"revision":2}',pg_temp.t04_op(914))
   IS DISTINCT FROM approval||'{"replayed":true}' THEN RAISE EXCEPTION 'T04 sick approval retry changed its exact receipt'; END IF;
 RESET ROLE;
 IF (SELECT count(*) FROM erp_private.t04_sick_evidence WHERE case_id=sick_case AND version_id=960010)<>1
 OR (SELECT count(*) FROM erp_private.t04_days WHERE case_id=sick_case AND state='posted')<>1
 OR (SELECT count(*) FROM erp_private.t01_leave_certificate_approvals WHERE operation_id=pg_temp.t04_op(916) AND version_id=960012)<>1
 OR (SELECT count(*) FROM erp_private.f12_leave_movements WHERE source_operation=pg_temp.t04_op(916) AND effect='consume')<>1
 OR has_table_privilege('authenticated','erp_private.hr_mobile_managed_leave','SELECT')
 OR has_function_privilege('authenticated','erp_private.t04_execute_leave_command(bigint,bigint,text,jsonb,uuid,boolean)','EXECUTE') THEN
  RAISE EXCEPTION 'Sick evidence, approval or private access checks failed'; END IF;
 RAISE NOTICE 'PASS: T04 and T01 Mobile sick evidence, exact versions, private scope, replacement, integrity and retries';
END;
$$;
