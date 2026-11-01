\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout='20s';
CREATE TEMP TABLE letter_checks(name text PRIMARY KEY);
CREATE FUNCTION pg_temp.check_it(ok boolean,label text)RETURNS void LANGUAGE plpgsql AS $$BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label;END IF;INSERT INTO letter_checks VALUES(label);END$$;
CREATE FUNCTION pg_temp.expect_error(sql text,expected text,label text)RETURNS void LANGUAGE plpgsql AS $$BEGIN BEGIN EXECUTE sql;EXCEPTION WHEN OTHERS THEN IF SQLSTATE<>expected THEN RAISE EXCEPTION 'FAIL: % expected %, got %: %',label,expected,SQLSTATE,SQLERRM;END IF;INSERT INTO letter_checks VALUES(label);RETURN;END;RAISE EXCEPTION 'FAIL: % unexpectedly succeeded',label;END$$;

INSERT INTO public.owner_companies(id,company_code,legal_name_en)VALUES(996310,'QA_LETTER_A','SYNTHETIC LETTER COMPANY'),(996311,'QA_LETTER_B','SYNTHETIC OTHER COMPANY');
INSERT INTO public.branches(id,owner_company_id,branch_code,branch_name_en)VALUES(996310,996310,'QA_LETTER_BRANCH_A','SYNTHETIC BRANCH A'),(996311,996310,'QA_LETTER_BRANCH_B','SYNTHETIC BRANCH B');
INSERT INTO public.roles(id,role_code,role_name)VALUES(996310,'QA_LETTER_REVIEW','Synthetic letter review');
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code)
 SELECT c,c,'reports','view'FROM unnest(ARRAY['hr.employees.view','hr.eos.view','hr.eos.manage','hr.payroll.view','hr.actions.view','hr.actions.manage','hr.confidential.view','hr.confidential.manage','hr.assignments.view','hr.assignments.manage','reports.run','reports.pdf.generate','reports.pdf.approve','dms.documents.view','dms.documents.preview'])c ON CONFLICT(permission_code)DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)SELECT 996310,id FROM public.permissions WHERE permission_code=ANY(ARRAY['hr.employees.view','hr.eos.view','hr.eos.manage','hr.payroll.view','hr.actions.view','hr.actions.manage','hr.confidential.view','hr.confidential.manage','hr.assignments.view','hr.assignments.manage','reports.run','reports.pdf.generate','reports.pdf.approve','dms.documents.view','dms.documents.preview']);
INSERT INTO auth.users(id,email,raw_user_meta_data)SELECT('aaaaaaaa-1031-4000-8000-'||lpad(n::text,12,'0'))::uuid,'letter-review-'||n||'@example.invalid','{"full_name":"SYNTHETIC LETTER REVIEW"}'FROM generate_series(1,4)n;
INSERT INTO auth.sessions(id,user_id)SELECT('bbbbbbbb-1031-4000-8000-'||lpad(n::text,12,'0'))::uuid,('aaaaaaaa-1031-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,4)n;
UPDATE public.user_profiles SET status='active',must_change_password=false WHERE auth_user_id::text LIKE'aaaaaaaa-1031-%';
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id)SELECT u.id,996310,CASE WHEN n=3 THEN 996311 ELSE 996310 END,CASE WHEN n=4 THEN 996311 WHEN n IN(1,2)THEN 996310 END FROM generate_series(1,4)n JOIN public.user_profiles u ON u.auth_user_id=('aaaaaaaa-1031-4000-8000-'||lpad(n::text,12,'0'))::uuid;
INSERT INTO public.hr_employee_categories(id,code,name_en)OVERRIDING SYSTEM VALUE VALUES(996310,'QA_LETTER','SYNTHETIC LETTER CATEGORY');
INSERT INTO public.employees(id,employee_code,full_name_en,full_name_ar,gender,date_of_birth,mobile_number,owner_company_id,branch_id,joining_date,emergency_contact_name,emergency_contact_mobile,employee_category_id)
 OVERRIDING SYSTEM VALUE VALUES(996310,'QA-EMP-LETTER-A','SYNTHETIC GIVER','موظف تجريبي','male','1990-01-01','0000000000',996310,996310,'2020-01-01','SYNTHETIC','0000000000',996310),(996311,'QA-EMP-LETTER-B','SYNTHETIC RECEIVER','مستلم تجريبي','male','1990-01-01','0000000001',996310,996310,'2020-01-01','SYNTHETIC','0000000000',996310);
INSERT INTO public.employee_eos_cases(id,employee_id,eos_type,case_status,last_working_date,employment_end_date,reason)OVERRIDING SYSTEM VALUE VALUES(996310,996310,'contract_end','closed','2025-12-30','2025-12-31','SYNTHETIC recorded contract end');
INSERT INTO public.employee_disciplinary_records(id,employee_id,disciplinary_type,incident_date,record_date,subject,description,action_taken,status)OVERRIDING SYSTEM VALUE VALUES(996310,996310,'written_warning','2026-10-01','2026-10-02','SYNTHETIC decision','SYNTHETIC reviewed conduct','SYNTHETIC recorded correction','closed');
INSERT INTO public.employee_ppe_issues(id,employee_id,ppe_item,quantity,issued_date,status,issued_by)OVERRIDING SYSTEM VALUE VALUES(996310,996310,'SYNTHETIC helmet',1,'2026-10-01','issued',(SELECT id FROM public.user_profiles WHERE auth_user_id='aaaaaaaa-1031-4000-8000-000000000001'));
INSERT INTO public.dms_document_categories(id,category_code,name_en)OVERRIDING SYSTEM VALUE VALUES(996310,'QA_LETTER','SYNTHETIC EVIDENCE');
INSERT INTO public.dms_document_types(id,type_code,name_en,category_id)OVERRIDING SYSTEM VALUE VALUES(996310,'QA_LETTER','SYNTHETIC EVIDENCE',996310);
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,status)OVERRIDING SYSTEM VALUE VALUES(996310,'QA-DMS-LETTER-001','SYNTHETIC EVIDENCE',996310,996310,996310,996310,'active');
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current)OVERRIDING SYSTEM VALUE VALUES(996310,996310,1,true);
UPDATE public.dms_documents SET current_version_id=996310 WHERE id=996310;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)OVERRIDING SYSTEM VALUE VALUES(996310,996310,996310,'original','qa-letter-only','qa-letter/no-object-created.pdf','synthetic.pdf','application/pdf',100,repeat('a',64),'verified');
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id)VALUES(996310,'employee',996310),(996310,'employee',996311);

CREATE FUNCTION pg_temp.actor(n int)RETURNS void LANGUAGE plpgsql AS $$BEGIN PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',('aaaaaaaa-1031-4000-8000-'||lpad(n::text,12,'0')),'session_id',('bbbbbbbb-1031-4000-8000-'||lpad(n::text,12,'0')),'role','authenticated')::text,true);END$$;
CREATE FUNCTION pg_temp.review(action text,review_id bigint DEFAULT NULL,operation uuid DEFAULT 'cccccccc-1031-4000-8000-000000000001',data jsonb DEFAULT '{"source_id":996310,"receiver_id":null,"document_id":996310,"version_id":996310,"facts":{"condition":"Good — synthetic","condition_ar":"جيد — تجريبي","ppe_item_ar":"خوذة تجريبية"}}')RETURNS jsonb LANGUAGE sql AS $$SELECT public.hr_letter_source_review(996310,'HR_PPE_ISSUE_FORM',action,review_id,operation,data)$$;
SELECT pg_temp.check_it(NOT has_table_privilege('authenticated','erp_private.hr_letter_source_reviews','SELECT'),'no direct private-table read');
SELECT pg_temp.check_it(NOT has_table_privilege('service_role','erp_private.hr_letter_source_reviews','UPDATE'),'no service-role direct source rewrite');
SELECT pg_temp.check_it(NOT has_function_privilege('anon','public.hr_letter_source_review(bigint,text,text,bigint,uuid,jsonb,bigint)','execute'),'no anonymous source RPC');
SELECT pg_temp.actor(1);
CREATE TEMP TABLE receipt AS SELECT pg_temp.review('submit')AS r;
SELECT pg_temp.check_it((SELECT r->>'status'='pending'FROM receipt),'source review starts pending');
SELECT pg_temp.check_it(pg_temp.review('submit')->>'replayed'='true','lost-response retry uses original review');
SELECT pg_temp.check_it(pg_temp.review('submit',null,'cccccccc-1031-4000-8000-000000000002')->>'id'=(SELECT r->>'id'FROM receipt),'reload duplicate returns same original review');
SELECT pg_temp.expect_error('select pg_temp.review(''submit'',null,''cccccccc-1031-4000-8000-000000000001'',''{"source_id":996310,"document_id":996310,"version_id":996310,"facts":{"condition":"changed","condition_ar":"جيد","ppe_item_ar":"خوذة"}}'')','22023','changed retry rejected');
SELECT pg_temp.expect_error('select pg_temp.review(''approve'',(select(r->>''id'')::bigint from receipt))','42501','self approval rejected');
SELECT pg_temp.expect_error('select pg_temp.review(''read'',(select(r->>''id'')::bigint from receipt))','23514','pending facts cannot issue');
SELECT pg_temp.actor(3);
SELECT pg_temp.expect_error('select pg_temp.review(''list'')','42501','other company rejected');
SELECT pg_temp.actor(4);
SELECT pg_temp.expect_error('select pg_temp.review(''list'')','42501','other branch rejected');
SELECT pg_temp.actor(2);
SELECT pg_temp.check_it(pg_temp.review('approve',(SELECT(r->>'id')::bigint FROM receipt))->>'status'='approved','different scoped reviewer approves');
SELECT pg_temp.check_it(pg_temp.review('approve',(SELECT(r->>'id')::bigint FROM receipt))->>'replayed'='true','duplicate approval replays');
SELECT pg_temp.actor(1);
SELECT pg_temp.check_it(pg_temp.review('read',(SELECT(r->>'id')::bigint FROM receipt))->>'status'='approved','approved source read succeeds');

SELECT pg_temp.check_it(public.hr_letter_integration_version()=1,'installed integration version is authenticated');
SELECT pg_temp.check_it(jsonb_array_length(public.hr_letter_source_review(996310,'HR_PPE_ISSUE_FORM','options',p_data:='{"kind":"evidence"}'))=1,'evidence options retain permitted document only');
SELECT pg_temp.check_it(jsonb_array_length(public.hr_letter_source_review(996310,'HR_HANDOVER_FORM','options',p_data:='{"kind":"receiver"}'))=1,'receiver options exclude the giver');
SELECT pg_temp.expect_error('update erp_private.hr_letter_source_reviews set facts=''{}''where id=(select(r->>''id'')::bigint from receipt)','42501','reviewed facts immutable');
SELECT pg_temp.expect_error('delete from erp_private.hr_letter_source_reviews where id=(select(r->>''id'')::bigint from receipt)','42501','review history retained');
CREATE TEMP TABLE native_outputs AS SELECT lifecycle_state,output_code,source_record_id,data_snapshot_json FROM public.erp_generated_pdf_documents WHERE false;
CREATE TRIGGER native_letter_guard BEFORE UPDATE OF lifecycle_state ON native_outputs FOR EACH ROW EXECUTE FUNCTION erp_private.hr_letter_issue_guard();
INSERT INTO native_outputs VALUES('pending','HR_PPE_ISSUE_FORM',996310,jsonb_build_object('row',jsonb_build_object('source_review_id',(SELECT r->>'id'FROM receipt),'source_review_fingerprint',(SELECT r->>'fingerprint'FROM receipt))));
UPDATE native_outputs SET lifecycle_state='issued';
SELECT pg_temp.check_it((SELECT lifecycle_state='issued'FROM native_outputs),'final issuance guard accepts exact approved source');
UPDATE native_outputs SET lifecycle_state='pending';
UPDATE native_outputs SET data_snapshot_json=jsonb_set(data_snapshot_json,'{row,source_review_fingerprint}',to_jsonb(repeat('f',64)));
SELECT pg_temp.expect_error('update native_outputs set lifecycle_state=''issued''','PT409','final issuance guard rejects different snapshot');
DO $$DECLARE code text;facts jsonb;r jsonb;BEGIN
 FOREACH code IN ARRAY ARRAY['HR_EXPERIENCE_LETTER','HR_WARNING_LETTER','HR_HANDOVER_FORM']LOOP
  PERFORM pg_temp.actor(1);
  facts:=CASE code WHEN'HR_EXPERIENCE_LETTER'THEN'{"designation_en":"Synthetic former role","designation_ar":"وظيفة تجريبية","termination_reason_ar":"سبب موثق"}'::jsonb
  WHEN'HR_WARNING_LETTER'THEN'{"warning_subject_ar":"إنذار تجريبي","verified_conduct_description_ar":"واقعة موثقة","policy_reference_en":"Policy A","policy_reference_ar":"السياسة أ","specific_corrective_action_ar":"إجراء موثق","corrective_deadline":"2026-12-01","response_channel_en":"Verified HR channel","response_channel_ar":"قناة موثقة","response_period":"Recorded period","response_period_ar":"فترة موثقة"}'::jsonb
  ELSE'{"handover_date":"2026-10-01","description_en":"Synthetic item","description_ar":"بند تجريبي","reference":"QA-ITEM-1","owner_name":"Synthetic owner","status_en":"Accepted as recorded","status_ar":"استلم حسب السجل"}'::jsonb END;
  r:=public.hr_letter_source_review(996310,code,'submit',p_operation:=gen_random_uuid(),p_data:=jsonb_build_object('source_id',996310,'receiver_id',CASE WHEN code='HR_HANDOVER_FORM'THEN 996311 END,'document_id',996310,'version_id',996310,'facts',facts));
  PERFORM pg_temp.actor(2);
  PERFORM pg_temp.check_it(public.hr_letter_source_review(996310,code,'approve',(r->>'id')::bigint)->>'status'='approved',code||' original evidence and independent decision');
  PERFORM pg_temp.actor(1);
  PERFORM pg_temp.check_it(public.hr_letter_source_review(996310,code,'read',(r->>'id')::bigint)->>'status'='approved',code||' verified source read');
 END LOOP;
END$$;
SELECT set_config('request.jwt.claims','{}',true);
SELECT pg_temp.expect_error('select pg_temp.review(''list'')','42501','missing session cannot list');
SELECT pg_temp.actor(1);
UPDATE public.user_roles SET is_active=false WHERE role_id=996310 AND user_profile_id=public.current_user_profile_id();
SELECT pg_temp.expect_error('select pg_temp.review(''read'',(select(r->>''id'')::bigint from receipt))','42501','revoked scope cannot reuse approved review');
UPDATE public.user_roles SET is_active=true WHERE role_id=996310;
SELECT pg_temp.actor(1);

-- Fixture-only admin mutation simulates an intervening authorised source edit.
SELECT set_config('request.jwt.claims','{}',true);
UPDATE public.employee_ppe_issues SET quantity=2 WHERE id=996310;
SELECT pg_temp.actor(1);
SELECT pg_temp.expect_error('select pg_temp.review(''read'',(select(r->>''id'')::bigint from receipt))','PT409','edited source invalidates original review');
CREATE TEMP TABLE test_registry(report_code text,required_permissions text[]);
CREATE TRIGGER enforce_caps BEFORE INSERT OR UPDATE ON test_registry FOR EACH ROW EXECUTE FUNCTION erp_private.hr_letter_registry_guard();
INSERT INTO test_registry VALUES('HR_WARNING_LETTER',ARRAY['reports.run']);
UPDATE test_registry SET required_permissions=ARRAY[]::text[];
SELECT pg_temp.check_it((SELECT required_permissions@>ARRAY['hr.actions.view','hr.confidential.view']FROM test_registry),'registry cannot drop sensitive source permissions');
SELECT count(*)AS passed FROM letter_checks;
ROLLBACK;
