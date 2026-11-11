\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '30s';

CREATE FUNCTION pg_temp.check_it(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', label; END IF;
RAISE NOTICE 'PASS: %', label; END;
$$;
CREATE FUNCTION pg_temp.actor(n integer) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', jsonb_build_object(
    'sub', 'aaaaaaaa-1111-4000-8000-' || lpad(n::text,12,'0'),
    'session_id', 'bbbbbbbb-1111-4000-8000-' || lpad(n::text,12,'0'), 'role','authenticated')::text, true);
END;
$$;

INSERT INTO public.owner_companies(id,company_code,legal_name_en) VALUES
  (997610,'QA_RENEWAL_A','Synthetic Renewal Company'),(997611,'QA_RENEWAL_B','Synthetic Other Company');
INSERT INTO public.branches(id,owner_company_id,branch_code,branch_name_en) VALUES
  (997610,997610,'QA_RENEWAL_A','Synthetic Branch A'),(997611,997610,'QA_RENEWAL_B','Synthetic Branch B');
INSERT INTO public.roles(id,role_code,role_name) VALUES
  (997610,'QA_RENEWAL_FULL','Synthetic renewal reviewer'),(997611,'QA_RENEWAL_HR','Synthetic nonmedical reviewer'),
  (997612,'QA_RENEWAL_VIEW','Synthetic read-only renewal viewer');
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code)
SELECT code,code,'hr',split_part(code,'.',3) FROM unnest(ARRAY['hr.medical.view','hr.medical.manage','hr.settings.view']) code
ON CONFLICT (permission_code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT role_id, id
FROM public.permissions CROSS JOIN (VALUES (997610),(997611),(997612)) roles(role_id)
WHERE permission_code IN ('hr.employees.view','hr.compliance.view','dms.documents.view','dms.documents.preview','dms.renewals.view')
   OR (role_id<>997612 AND permission_code IN ('hr.employees.update','hr.compliance.manage','hr.settings.view','dms.documents.edit'))
   OR (role_id=997610 AND permission_code IN ('hr.medical.view','hr.medical.manage'));
INSERT INTO auth.users(id,email,raw_user_meta_data)
SELECT ('aaaaaaaa-1111-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  'hr-renewal-'||n||'@example.invalid','{"full_name":"Synthetic HR Renewal Reviewer"}'
FROM generate_series(1,5) n;
INSERT INTO auth.sessions(id,user_id)
SELECT ('bbbbbbbb-1111-4000-8000-'||lpad(n::text,12,'0'))::uuid,
  ('aaaaaaaa-1111-4000-8000-'||lpad(n::text,12,'0'))::uuid FROM generate_series(1,5) n;
UPDATE public.user_profiles SET status='active',must_change_password=false WHERE auth_user_id::text LIKE 'aaaaaaaa-1111-%';
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id)
SELECT p.id,CASE n WHEN 4 THEN 997611 WHEN 5 THEN 997612 ELSE 997610 END,CASE WHEN n=2 THEN 997611 ELSE 997610 END,
  CASE WHEN n=2 THEN NULL WHEN n=3 THEN 997611 ELSE 997610 END
FROM generate_series(1,5) n JOIN public.user_profiles p ON p.auth_user_id=('aaaaaaaa-1111-4000-8000-'||lpad(n::text,12,'0'))::uuid;
INSERT INTO public.hr_employee_categories(id,code,name_en) OVERRIDING SYSTEM VALUE VALUES (997610,'QA_RENEWAL','Synthetic renewal category');
INSERT INTO public.employees(id,employee_code,full_name_en,gender,date_of_birth,mobile_number,owner_company_id,branch_id,joining_date,emergency_contact_name,emergency_contact_mobile,employee_category_id)
OVERRIDING SYSTEM VALUE VALUES (997610,'QA-EMP-RENEWAL','Synthetic renewal employee','male','1990-01-01','0000000000',997610,997610,'2020-01-01','Synthetic','0000000000',997610);

CREATE TEMP TABLE fixture(position integer PRIMARY KEY, kind text, type_code text, fields jsonb);
INSERT INTO fixture VALUES
  (1,'access-card','QA_HR_RENEWAL_CARD','{"card_number":"QA-NEW-CARD","client_authority":"Synthetic authority","expiry_date":"2027-02-25"}'),
  (2,'identity-document','QA_HR_RENEWAL_ID','{"document_number":"QA-NEW-ID","expiry_date":"2027-02-25"}'),
  (3,'medical-insurance','QA_HR_RENEWAL_INS','{"insurance_provider":"Synthetic insurer","policy_number":"QA-NEW-INS","expiry_date":"2027-02-25","employee_covered":true,"dependent_coverage_included":false}'),
  (4,'training-certificate','QA_HR_RENEWAL_TRAIN','{"provider":"Synthetic provider","certificate_number":"QA-NEW-TRAIN","completion_date":"2026-09-24","expiry_date":"2027-02-25"}'),
  (5,'medical-record','QA_HR_RENEWAL_MED','{"examination_date":"2026-09-24","next_examination_date":"2027-02-25","report_number":"QA-NEW-MED"}'),
  (6,'dependent','PASSPORT_COPY','{"passport_number":"QA-NEW-DEP","passport_expiry":"2027-02-25"}'),
  (7,'dependent','EMIRATES_ID','{"emirates_id_number":"QA-NEW-EID","emirates_id_expiry":"2027-02-25"}'),
  (8,'dependent','RESIDENCE_VISA','{"residence_visa_number":"QA-NEW-VISA","residence_visa_expiry":"2027-02-25"}'),
  (9,'dependent','MEDICAL_INSURANCE','{"medical_insurance_provider":"Synthetic insurer","medical_insurance_policy":"QA-NEW-DEP-INS","medical_insurance_expiry":"2027-02-25"}');
GRANT SELECT ON fixture TO authenticated;

-- Pre-existing renewal and HR data fixtures only. Test operations below run
-- as ordinary authenticated users with every actual trigger enabled.
SET LOCAL session_replication_role = replica;
INSERT INTO public.hr_access_card_types(id,code,name_en,requires_client_authority) OVERRIDING SYSTEM VALUE
  VALUES(997610,'QA_RENEWAL','Synthetic access type',true);
INSERT INTO public.hr_identity_document_types(id,code,name_en,requires_issue_date) OVERRIDING SYSTEM VALUE
  VALUES(997610,'QA_RENEWAL','Synthetic identity type',false);
INSERT INTO public.hr_training_categories(id,code,name_en) OVERRIDING SYSTEM VALUE
  VALUES(997610,'QA_RENEWAL','Synthetic training category');
INSERT INTO public.hr_training_types(id,code,name_en,training_category_id) OVERRIDING SYSTEM VALUE
  VALUES(997610,'QA_RENEWAL','Synthetic training type',997610);
INSERT INTO public.hr_medical_record_types(id,code,name_en) OVERRIDING SYSTEM VALUE
  VALUES(997610,'QA_RENEWAL','Synthetic medical type');
INSERT INTO public.hr_relationship_types(id,code,name_en) OVERRIDING SYSTEM VALUE
  VALUES(997610,'QA_RENEWAL','Synthetic relationship');
INSERT INTO public.dms_document_categories(id,category_code,name_en) OVERRIDING SYSTEM VALUE VALUES(997610,'QA_HR_RENEWAL','Synthetic evidence');
INSERT INTO public.dms_document_types(id,type_code,name_en,category_id,requires_expiry_tracking) OVERRIDING SYSTEM VALUE
SELECT 997610+position,type_code,'Synthetic evidence '||position,997610,position<>5 FROM fixture
WHERE NOT EXISTS (SELECT 1 FROM public.dms_document_types t WHERE t.type_code=fixture.type_code);
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,
  confidentiality_level,status,is_archived,archived_at,expiry_date,current_version_id,superseded_by_document_id)
OVERRIDING SYSTEM VALUE
SELECT 997620+2*position+v, 'QA-RENEWAL-'||position||'-'||v, 'Synthetic HR renewal '||position||'-'||v,
  t.id,t.category_id,997610,997610,'internal',CASE WHEN v=0 THEN 'superseded' ELSE 'active' END,
  v=0,CASE WHEN v=0 THEN now() END,CASE WHEN v=0 THEN date '2026-09-24' ELSE date '2027-02-25' END,
  997620+2*position+v,CASE WHEN v=0 THEN 997621+2*position END
FROM fixture JOIN public.dms_document_types t USING(type_code) CROSS JOIN generate_series(0,1) v;
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE
SELECT id,id,1,true FROM public.dms_documents WHERE document_no LIKE 'QA-RENEWAL-%';
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
OVERRIDING SYSTEM VALUE
SELECT id,id,id,'original','qa-only','qa/'||document_no||'.pdf','synthetic.pdf','application/pdf',100,repeat('a',64),'pending'
FROM public.dms_documents WHERE document_no LIKE 'QA-RENEWAL-%';
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id)
SELECT 997620+2*position+v,CASE WHEN position>=6 THEN 'employee_dependent' ELSE 'employee' END,997610
FROM fixture CROSS JOIN generate_series(0,1) v;
INSERT INTO public.dms_renewal_requests(id,document_id,renewal_no,status,replacement_document_id,old_expiry_date,new_expiry_date,completed_at)
OVERRIDING SYSTEM VALUE
SELECT 997620+position,997620+2*position,'QA-RNW-'||position,'renewed',997621+2*position,'2026-09-24','2027-02-25',now() FROM fixture;
INSERT INTO public.employee_access_cards(id,employee_id,access_type_id,card_number,expiry_date,status,dms_document_id)
OVERRIDING SYSTEM VALUE VALUES(997610,997610,997610,'QA-OLD-CARD','2026-09-24','active',997622);
INSERT INTO public.employee_identity_documents(id,employee_id,document_type_id,document_number,expiry_date,status,dms_document_id)
OVERRIDING SYSTEM VALUE VALUES(997610,997610,997610,'QA-OLD-ID','2026-09-24','active',997624);
INSERT INTO public.employee_medical_insurances(id,employee_id,insurance_provider,policy_number,expiry_date,status,dms_document_id,owner_company_id)
OVERRIDING SYSTEM VALUE VALUES(997610,997610,'Synthetic insurer','QA-OLD-INS','2026-09-24','active',997626,997610);
INSERT INTO public.employee_training_certificates(id,employee_id,training_type_id,training_category_id,certificate_number,expiry_date,dms_document_id)
OVERRIDING SYSTEM VALUE VALUES(997610,997610,997610,997610,'QA-OLD-TRAIN','2026-09-24',997628);
INSERT INTO public.employee_medical_records(id,employee_id,medical_record_type_id,report_number,examination_date,result,work_restrictions,restriction_details,dms_document_id)
OVERRIDING SYSTEM VALUE VALUES(997610,997610,997610,'QA-OLD-MED','2026-09-24','under_review',true,'Synthetic restriction',997630);
INSERT INTO public.employee_dependents(id,employee_id,dependent_name_en,relationship_type_id,passport_number,passport_expiry,emirates_id_number,
  emirates_id_expiry,residence_visa_number,residence_visa_expiry,medical_insurance_provider,medical_insurance_policy,medical_insurance_expiry,dms_document_id)
OVERRIDING SYSTEM VALUE VALUES(997610,997610,'Synthetic dependent',997610,'QA-OLD-DEP','2026-09-24','QA-OLD-EID',
  '2026-09-24','QA-OLD-VISA','2026-09-24','Synthetic insurer','QA-OLD-DEP-INS','2026-09-24',997632);
SET LOCAL session_replication_role = origin;

SELECT pg_temp.check_it(NOT has_function_privilege('anon','public.hr_compliance_renewal_reviews(bigint)','EXECUTE'),'anonymous discovery denied');
SELECT pg_temp.check_it(NOT has_function_privilege('service_role','public.hr_confirm_compliance_renewal(bigint,text,bigint,bigint,uuid,text,jsonb)','EXECUTE'),'service role cannot confirm through RPC');
SELECT pg_temp.check_it(NOT has_table_privilege('authenticated','erp_private.hr_compliance_renewal_confirmations','UPDATE'),'confirmation history cannot be rewritten');
SELECT pg_temp.check_it(NOT has_function_privilege('anon','public.hr_compliance_current_dms_renewals(bigint)','EXECUTE'),'anonymous automatic read denied');

SET LOCAL ROLE authenticated;
SELECT pg_temp.actor(2);
SELECT pg_temp.check_it(public.hr_compliance_renewal_reviews(997610)='[]','other company sees no records');
SELECT pg_temp.check_it(public.hr_compliance_current_dms_renewals(997610)='[]','automatic read excludes other company');
SELECT pg_temp.actor(3);
SELECT pg_temp.check_it(public.hr_compliance_renewal_reviews(997610)='[]','other branch sees no records');
SELECT pg_temp.check_it(public.hr_compliance_current_dms_renewals(997610)='[]','automatic read excludes other branch');
SELECT pg_temp.actor(4);
SELECT pg_temp.check_it(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.hr_compliance_renewal_reviews(997610)) r
  WHERE r->>'category' IN ('medical-insurance','medical-record','dependent-insurance')),'medical review is separately scoped');
SELECT pg_temp.check_it(jsonb_array_length(public.hr_compliance_current_dms_renewals(997610))=6,'automatic read excludes medical evidence without medical permission');
SELECT pg_temp.actor(5);
SELECT pg_temp.check_it(public.hr_compliance_renewal_reviews(997610)='[]' AND jsonb_array_length(public.hr_compliance_current_dms_renewals(997610))=6,
  'read-only HR users see permitted replacements without confirmation authority');
SELECT pg_temp.actor(1);
SELECT pg_temp.check_it(jsonb_array_length(public.hr_compliance_current_dms_renewals(997610))=9,'all nine replacements appear before any HR confirmation');
SELECT pg_temp.check_it(EXISTS(SELECT 1 FROM public.employee_access_cards WHERE id=997610 AND dms_document_id=997622 AND expiry_date='2026-09-24'),
  'automatic display leaves the original HR record and expiry intact');

SAVEPOINT projection_variants;
RESET ROLE;
SET LOCAL session_replication_role = replica;
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,
  confidentiality_level,status,expiry_date,current_version_id) OVERRIDING SYSTEM VALUE
SELECT 997650,'QA-RENEWAL-LATEST','Synthetic latest replacement',document_type_id,category_id,owning_company_id,owning_branch_id,
  confidentiality_level,'active','2028-02-25',997650 FROM public.dms_documents WHERE id=997623;
UPDATE public.dms_documents SET status='superseded',is_archived=true,archived_at=now(),superseded_by_document_id=997650 WHERE id=997623;
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE VALUES(997650,997650,1,true);
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
OVERRIDING SYSTEM VALUE VALUES(997650,997650,997650,'original','qa-only','qa/latest.pdf','synthetic.pdf','application/pdf',100,repeat('b',64),'pending');
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES (997650,'employee',997610);
INSERT INTO public.dms_renewal_requests(id,document_id,renewal_no,status,replacement_document_id,replacement_version_id,old_expiry_date,new_expiry_date,completed_at)
OVERRIDING SYSTEM VALUE VALUES(997650,997623,'QA-RNW-LATEST','renewed',997650,997650,'2027-02-25','2028-02-25',now());
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_it(EXISTS(SELECT 1 FROM jsonb_array_elements(public.hr_compliance_current_dms_renewals(997610)) r
  WHERE r->>'originalNo'='QA-RENEWAL-1-0' AND r->>'replacementNo'='QA-RENEWAL-LATEST' AND r->>'replacementExpiry'='2028-02-25'),
  'automatic display follows consecutive completed renewals to the current replacement');
RESET ROLE;
SET LOCAL session_replication_role = replica;
UPDATE public.dms_renewal_requests SET replacement_version_id=997623 WHERE id=997650;
SET LOCAL session_replication_role = origin;
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_it(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.hr_compliance_current_dms_renewals(997610)) r WHERE r->>'kind'='access-card'),
  'automatic display rejects a changed replacement version');
ROLLBACK TO projection_variants;

CREATE TEMP TABLE reviews AS SELECT value AS opening FROM jsonb_array_elements(public.hr_compliance_renewal_reviews(997610));
SELECT opening->>'category' AS category, opening->>'hold' AS hold FROM reviews;
SELECT pg_temp.check_it((SELECT count(*)=9 FROM reviews WHERE opening->>'hold' IS NULL),'all nine pre-existing renewal categories are discoverable and reviewable');
SELECT pg_temp.check_it((SELECT opening->'requiredFields' ? 'client_authority' FROM reviews WHERE opening->>'kind'='access-card'),'access pass uses current issuing authority requirement');

CREATE FUNCTION pg_temp.check_confirmation(p_position integer) RETURNS void LANGUAGE plpgsql AS $$
DECLARE f record; item jsonb; operation uuid; result jsonb;
BEGIN
    SELECT * INTO STRICT f FROM fixture WHERE position=p_position;
    SELECT opening INTO item FROM jsonb_array_elements(public.hr_compliance_renewal_reviews(997610)) opening
    WHERE (opening->>'renewalId')::bigint=997620+f.position;
    operation := md5('synthetic-hr-renewal-'||f.position)::uuid;
    BEGIN
      PERFORM public.hr_confirm_compliance_renewal(997610,f.kind,997610,997620+f.position,operation,repeat('f',64),f.fields);
      RAISE EXCEPTION 'Unexpected stale success';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;
    IF f.position=1 THEN
      BEGIN
        PERFORM public.hr_confirm_compliance_renewal(997610,f.kind,997610,997621,operation,item->>'fingerprint',f.fields-'client_authority');
        RAISE EXCEPTION 'Unexpected missing authority success';
      EXCEPTION WHEN check_violation THEN NULL;
      END;
      PERFORM pg_temp.check_it(EXISTS(SELECT 1 FROM public.employee_access_cards WHERE id=997610 AND deleted_at IS NULL),'missing authority retains the old pass');
    END IF;
    result := public.hr_confirm_compliance_renewal(997610,f.kind,997610,997620+f.position,operation,item->>'fingerprint',f.fields);
    PERFORM pg_temp.check_it(result->>'replayed'='false',(item->>'category')||' confirmation committed');
    result := public.hr_confirm_compliance_renewal(997610,f.kind,997610,997620+f.position,operation,item->>'fingerprint',f.fields);
    PERFORM pg_temp.check_it(result->>'replayed'='true',(item->>'category')||' retry returns the same confirmation');
    IF f.position=6 THEN
      PERFORM pg_temp.check_it(EXISTS(SELECT 1 FROM public.employee_dependents WHERE id=997610 AND emirates_id_number='QA-OLD-EID'
        AND residence_visa_number='QA-OLD-VISA' AND dms_document_id=997633),'passport confirmation preserves unrelated credentials');
    END IF;
END;
$$;
SELECT format('SELECT pg_temp.check_confirmation(%s);',position) FROM fixture ORDER BY position \gexec
SELECT pg_temp.check_it(public.hr_compliance_renewal_reviews(997610)='[]','confirmed renewals leave the review list');
RESET ROLE;
SELECT pg_temp.check_it((SELECT count(*)=9 FROM erp_private.hr_compliance_renewal_confirmations WHERE employee_id=997610),'one confirmation per operation');
SELECT pg_temp.check_it(EXISTS(SELECT 1 FROM public.employee_access_cards WHERE employee_id=997610 AND card_number='QA-NEW-CARD'
  AND dms_document_id=997623 AND expiry_date='2027-02-25' AND deleted_at IS NULL),'current access pass uses exact replacement and expiry');
SELECT pg_temp.check_it(EXISTS(SELECT 1 FROM public.employee_access_cards WHERE id=997610 AND card_number='QA-OLD-CARD'
  AND dms_document_id=997622 AND deleted_at IS NOT NULL),'original HR entry retained as history');
SELECT pg_temp.check_it(EXISTS(SELECT 1 FROM public.dms_documents WHERE id=997622 AND is_archived AND superseded_by_document_id=997623),'DMS archive relationship preserved');
SELECT pg_temp.check_it(EXISTS(SELECT 1 FROM public.employee_medical_records WHERE employee_id=997610 AND dms_document_id=997631
  AND result='under_review' AND NOT fit_for_work AND work_restrictions AND deleted_at IS NULL),'medical confirmation retains restrictions without granting fitness');
SELECT pg_temp.check_it(EXISTS(SELECT 1 FROM public.employee_dependents WHERE id=997610 AND passport_number='QA-NEW-DEP'
  AND passport_expiry='2027-02-25' AND emirates_id_number='QA-NEW-EID' AND residence_visa_number='QA-NEW-VISA'
  AND medical_insurance_policy='QA-NEW-DEP-INS' AND dms_document_id=997633),'all dependent credentials updated without replacing the unrelated primary pointer');
SET CONSTRAINTS ALL IMMEDIATE;
ROLLBACK;
