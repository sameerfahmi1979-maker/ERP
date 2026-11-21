
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF current_database() <> 't00_clean' OR current_setting('cron.launch_active_jobs') <> 'off'
     OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
       IS DISTINCT FROM 'Isolated HR T00 20261119' THEN
    RAISE EXCEPTION 'Run only in isolated T00 database';
  END IF;
  IF has_column_privilege('authenticated','public.employee_wps_profiles','iban','SELECT')
     OR has_column_privilege('authenticated','public.employee_wps_profiles','account_number','SELECT')
     OR has_column_privilege('authenticated','public.employee_leave_requests','reason','SELECT')
     OR has_column_privilege('authenticated','public.employee_leave_requests','notes','SELECT')
     OR has_column_privilege('authenticated','public.employee_leave_requests','sick_cert_dms_id','SELECT') THEN
    RAISE EXCEPTION 'Sensitive column privilege remains';
  END IF;
  IF has_function_privilege('anon','public.t01_leave_medical_detail(bigint,bigint)','EXECUTE')
     OR has_function_privilege('anon','public.t01_leave_approval_opening(bigint,bigint)','EXECUTE') THEN
    RAISE EXCEPTION 'Anonymous evidence resolver execution';
  END IF;
END;
$$;

SET LOCAL session_replication_role = replica;
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code)
SELECT code,code,'HR','test' FROM unnest(ARRAY['hr.payroll.manage','hr.banking.manage',
 'hr.medical.view','hr.medical.manage','dms.documents.view','dms.documents.preview']) code
ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p WHERE r.role_code='system_admin'
 AND p.permission_code IN ('hr.payroll.manage','hr.banking.manage','hr.medical.view','hr.medical.manage','dms.documents.view','dms.documents.preview')
ON CONFLICT DO NOTHING;

-- An exact branch reader has ordinary WPS and leave scope without medical authority.
INSERT INTO auth.users(id,email,aud,role,email_confirmed_at)
VALUES ('92000000-0000-4000-8000-000000000001','t01-reader@example.test','authenticated','authenticated',now());
INSERT INTO auth.sessions(id,user_id,created_at,not_after)
VALUES ('92000000-0000-4000-8000-000000000002','92000000-0000-4000-8000-000000000001',now(),now()+interval '1 day');
INSERT INTO public.user_profiles(auth_user_id,status,owner_company_id,branch_id)
VALUES ('92000000-0000-4000-8000-000000000001','active',920001,920011);
INSERT INTO public.roles(role_code,role_name,is_system_role) VALUES ('t01_native_scope','Synthetic branch reader',false);
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.role_code='t01_native_scope' AND p.permission_code IN ('hr.employees.view','hr.leave.view','hr.payroll.view',
 'hr.banking.view','dms.documents.view','dms.documents.preview','dms.documents.download');
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id)
SELECT p.id,r.id,920001,920011 FROM public.user_profiles p CROSS JOIN public.roles r
WHERE p.auth_user_id='92000000-0000-4000-8000-000000000001' AND r.role_code='t01_native_scope';

INSERT INTO public.hr_leave_types(id,code,name_en,requires_document,reset_basis)
OVERRIDING SYSTEM VALUE VALUES (930101,'SICK','Synthetic certificate-required sick leave',true,'calendar_year'),
 (930102,'MATERNITY','Synthetic other document-required leave',true,'calendar_year');
INSERT INTO public.hr_medical_record_types(id,code,name_en)
OVERRIDING SYSTEM VALUE VALUES (930101,'T01_MED','Synthetic medical evidence');
INSERT INTO public.dms_document_categories(id,category_code,name_en)
OVERRIDING SYSTEM VALUE VALUES (930101,'T01_MED','Synthetic medical');
INSERT INTO public.dms_document_types(id,type_code,name_en,category_id)
OVERRIDING SYSTEM VALUE VALUES (930101,'T01_MED','Synthetic certificate',930101);
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,
  confidentiality_level,status,current_version_id)
OVERRIDING SYSTEM VALUE VALUES (930101,'T01-CERT','Synthetic certificate',930101,930101,920001,920011,'internal','active',930101);
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current)
OVERRIDING SYSTEM VALUE VALUES (930101,930101,1,true);
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
OVERRIDING SYSTEM VALUE VALUES (930101,930101,930101,'original','dms-documents','test/t01-cert.pdf','t01-cert.pdf','application/pdf',100,repeat('a',64),'verified');
INSERT INTO storage.objects(bucket_id,name) VALUES ('dms-documents','test/t01-cert.pdf');
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES (930101,'employee',920001);
INSERT INTO public.employee_medical_records(id,employee_id,medical_record_type_id,examination_date,result,dms_document_id)
OVERRIDING SYSTEM VALUE VALUES (930101,920001,930101,'2026-11-19','fit',930101);

INSERT INTO public.employee_leave_balances(id,employee_id,leave_type_id,leave_year,entitled_days,used_days,carry_forward,period_start,period_end,period_basis)
OVERRIDING SYSTEM VALUE VALUES (930101,920001,930101,2026,10,0,0,'2026-01-01','2026-12-31','calendar_year'),
 (930102,920001,930102,2026,10,0,0,'2026-01-01','2026-12-31','calendar_year');
INSERT INTO public.employee_leave_requests(id,employee_id,leave_type_id,start_date,end_date,total_days,reason,notes,sick_cert_dms_id,f12_ledger_version,f12_policy)
OVERRIDING SYSTEM VALUE VALUES (930101,920001,930101,'2026-11-19','2026-11-19',1,'Synthetic confidential detail','Synthetic confidential note',930101,1,'{"reset_basis":"calendar_year","joining_date":"2023-06-15"}'),
 (930102,920001,930102,'2026-11-20','2026-11-20',1,NULL,NULL,NULL,1,'{"reset_basis":"calendar_year","joining_date":"2023-06-15"}');
-- Temporarily replace the optional preview row. ROLLBACK restores it after the test.
DELETE FROM public.employee_wps_profiles WHERE employee_id=920001 AND account_number='T01-TEST-9001';
INSERT INTO public.employee_wps_profiles(id,employee_id,iban,account_number,deleted_at)
OVERRIDING SYSTEM VALUE VALUES
 (930101,920001,'AE070331234567890123456','1234567890',NULL),
 (930102,920002,'AE070331234567890123456','1234567890',now()),
 (930103,920003,'AE070331234567890123456','1234567890',NULL);
SET LOCAL session_replication_role = origin;

SELECT set_config('request.jwt.claims',jsonb_build_object('sub','92000000-0000-4000-8000-000000000001','role','authenticated',
 'session_id','92000000-0000-4000-8000-000000000002')::text,true) AS scoped_claims \gset
SET LOCAL ROLE authenticated;
DO $$
BEGIN
  IF NOT public.f03_current_session_valid() THEN RAISE EXCEPTION 'Synthetic scoped session not active'; END IF;
  IF (SELECT array_agg(employee_id ORDER BY employee_id) FROM public.employee_wps_profiles) IS DISTINCT FROM ARRAY[920001::bigint] THEN
    RAISE EXCEPTION 'Scoped WPS rows incorrect';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employee_wps_profiles WHERE employee_id=920001 AND iban_state='valid'
      AND iban_masked LIKE 'AE%3456' AND account_number_masked='******7890') THEN
    RAISE EXCEPTION 'Masked WPS projection missing';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.employee_leave_requests WHERE id=930101)
      OR public.t01_leave_medical_detail(920001,930101) IS NOT NULL THEN
    RAISE EXCEPTION 'Operational leave row unavailable or private medical wording disclosed';
  END IF;
  IF public.f03_has_document_permission(930101,'dms.documents.preview')
     OR public.f03_has_document_permission(930101,'dms.documents.download')
     OR EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='dms-documents' AND name='test/t01-cert.pdf') THEN
    RAISE EXCEPTION 'Medical certificate content accessible without medical authority';
  END IF;
END;
$$;
RESET ROLE;

SELECT set_config('request.jwt.claims',(SELECT jsonb_build_object('sub',u.id,'role','authenticated','session_id',s.id)::text
  FROM auth.users u JOIN auth.sessions s ON s.user_id=u.id WHERE u.email='hr-t00@example.test' ORDER BY s.created_at DESC LIMIT 1),true) AS reviewer_claims \gset

-- The existing medical verification record is the authority for the exact file and version.
INSERT INTO erp_private.f12_evidence_verifications(employee_id,source_kind,source_id,source_hash,document_id,version_id,actor,operation_id,reason)
SELECT 920001,'medical-record',930101,encode(sha256(convert_to(erp_private.f12_workforce_source('medical-record',920001,930101,930101,NULL)::text,'UTF8')),'hex'),
930101,930101,auth.uid(),'93010000-0000-4000-8000-000000000001','Synthetic prior medical verification';
SET LOCAL ROLE authenticated;

DO $$
DECLARE
  decision jsonb;
  edit jsonb;
  opening jsonb;
  payload jsonb := '{"wps_applicable":true,"wps_status":"active","bank_id":null,"account_holder_name":"Synthetic replacement name","exchange_house":null,"salary_payment_method":"bank_transfer","labour_card_number":null,"mohre_person_code":null,"mohre_establishment_id":null,"salary_effective_date":null}';
BEGIN
  IF EXISTS (SELECT 1 FROM public.employee_wps_profiles WHERE id=930102) THEN RAISE EXCEPTION 'Archived bank row visible'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.f12_payroll_readiness_facts(ARRAY[920001::bigint], '2026-11-19') WHERE NOT missing_iban) THEN
    RAISE EXCEPTION 'Readiness failed to read safe verification fact';
  END IF;
  edit:=public.f11_mutate_payroll_child('wps-profile',920001,930101,1,'93010000-0000-4000-8000-000000000005','update',payload);
  IF edit->>'revision'<>'2' OR NOT EXISTS (SELECT 1 FROM public.employee_wps_profiles WHERE id=930101
      AND account_number_masked='******7890' AND iban_state='valid' AND account_holder_name='Synthetic replacement name') THEN
    RAISE EXCEPTION 'Bank editing broke or erased omitted secret';
  END IF;
  edit:=public.f11_mutate_payroll_child('wps-profile',920001,930101,2,'93010000-0000-4000-8000-000000000006','archive','{}');
  IF edit->>'revision'<>'3' OR EXISTS (SELECT 1 FROM public.employee_wps_profiles WHERE id=930101) THEN
    RAISE EXCEPTION 'Archiving failed or remained visible';
  END IF;
  IF public.t01_leave_medical_detail(920001,930101)->>'reason' IS DISTINCT FROM 'Synthetic confidential detail'
     OR public.t01_leave_medical_detail(920002,930101) IS NOT NULL THEN
    RAISE EXCEPTION 'Scoped medical detail unavailable or incorrect subject';
  END IF;
  opening:=public.t01_leave_approval_opening(920001,930101);
  IF opening->>'required'<>'true' OR opening#>>'{choices,0,version_id}'<>'930101' THEN
    RAISE EXCEPTION 'Current verified version unavailable';
  END IF;
  BEGIN
    PERFORM public.f11_mutate_time_child('leave-request',920001,930101,1,'93010000-0000-4000-8000-000000000002','approve','{}');
    RAISE EXCEPTION 'Missing required evidence permitted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%required sick certificate%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.f11_mutate_time_child('leave-request',920001,930101,1,'93010000-0000-4000-8000-000000000003','approve','{"medical_record_id":930101,"version_id":930102}');
    RAISE EXCEPTION 'Mismatched version permitted';
  EXCEPTION WHEN check_violation THEN
    IF SQLERRM NOT LIKE '%current verified certificate%' THEN RAISE; END IF;
  END;
  IF (SELECT used_days FROM public.employee_leave_balances WHERE id=930101)<>0 THEN RAISE EXCEPTION 'Denied approval changed balance'; END IF;

  decision:=public.f11_mutate_time_child('leave-request',920001,930101,1,'93010000-0000-4000-8000-000000000004','approve','{"medical_record_id":930101,"version_id":930101}');
  IF decision->>'revision'<>'2' OR (SELECT approval_status FROM public.employee_leave_requests WHERE id=930101)<>'approved' THEN
    RAISE EXCEPTION 'Verified approval failed';
  END IF;
  decision:=public.f11_mutate_time_child('leave-request',920001,930101,1,'93010000-0000-4000-8000-000000000004','approve','{"medical_record_id":930101,"version_id":930101}');
  IF decision->>'replayed'<>'true' OR (SELECT used_days FROM public.employee_leave_balances WHERE id=930101)<>1 THEN
    RAISE EXCEPTION 'Same approved decision duplicated usage';
  END IF;
  IF public.t01_leave_approval_opening(920001,930102)->>'required'<>'false' THEN
    RAISE EXCEPTION 'Non-sick leave incorrectly requires a sick certificate';
  END IF;
  decision:=public.f11_mutate_time_child('leave-request',920001,930102,1,'93010000-0000-4000-8000-000000000007','approve','{}');
  IF decision->>'revision'<>'2' OR (SELECT used_days FROM public.employee_leave_balances WHERE id=930102)<>1 THEN
    RAISE EXCEPTION 'Existing non-sick approval changed';
  END IF;
END;
$$;
RESET ROLE;
DO $$
BEGIN
 IF (SELECT count(*) FROM erp_private.t01_leave_certificate_approvals
      WHERE request_id=930101 AND employee_id=920001 AND document_id=930101 AND version_id=930101)<>1 THEN
   RAISE EXCEPTION 'Exact certificate audit missing or duplicated';
 END IF;
END;
$$;
-- A previously scoped reader loses banking and leave visibility on revocation.
UPDATE public.user_roles SET is_active=false
WHERE user_profile_id=(SELECT id FROM public.user_profiles WHERE auth_user_id='92000000-0000-4000-8000-000000000001');
SELECT set_config('request.jwt.claims',:'scoped_claims',true) AS revoked_claims \gset
SET LOCAL ROLE authenticated;
DO $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.employee_wps_profiles WHERE employee_id=920001)
    OR public.f03_has_document_permission(930101,'dms.documents.preview')
    OR public.f03_has_document_permission(930101,'dms.documents.download')
    OR public.t01_leave_medical_detail(920001,930101) IS NOT NULL THEN
   RAISE EXCEPTION 'Revoked access returned protected data';
 END IF;
END;
$$;
RESET ROLE;
SELECT 'PASS: masked/scoped banking, edit/archive, confidential leave and DMS/storage checks, required evidence and exact approval replay';
ROLLBACK;
