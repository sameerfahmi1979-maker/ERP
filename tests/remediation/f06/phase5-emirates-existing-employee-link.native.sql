-- Synthetic acceptance for the held exact Emirates ID to existing employee operation.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL statement_timeout = '20s';

CREATE FUNCTION pg_temp.reject_phase5_receipt() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF current_setting('test.reject_phase5_receipt',true) = 'on' AND NEW.link_id IS NOT NULL THEN
    RAISE EXCEPTION 'Synthetic last-step receipt failure' USING ERRCODE='P0002';
  END IF;
  RETURN NEW;
END;
$$;

DO $test$
DECLARE
  code text := 'EL' || upper(left(replace(gen_random_uuid()::text,'-',''),9));
  requester_user uuid := gen_random_uuid();
  reviewer_user uuid := gen_random_uuid();
  requester_session uuid := gen_random_uuid();
  reviewer_session uuid := gen_random_uuid();
  requester bigint;
  reviewer bigint;
  filing_officer bigint;
  scope_company bigint;
  scope_branch bigint;
  sibling_branch bigint;
  pilot_role bigint;
  reviewer_assignment bigint;
  requester_assignment bigint;
  category bigint;
  dms_type bigint;
  hr_type bigint;
  hr_category bigint;
  document bigint;
  original bigint;
  stored_object uuid;
  stored_updated_at timestamptz;
  current_version bigint;
  employee bigint;
  competing_employee bigint;
  upload bigint;
  ai_job bigint;
  ai_result bigint;
  filing_run bigint;
  filing_operation uuid := gen_random_uuid();
  link_operation uuid := gen_random_uuid();
  expected_sha text := repeat('a',64);
  document_number text := '784-1980-0000001-1';
  birth date := date '1980-01-01';
  expires date := current_date + 180;
  filed_fields jsonb;
  requested jsonb;
  accepted jsonb;
  statement text;
BEGIN
  IF to_regprocedure('public.phase5_link_emirates_employee(uuid,bigint,bigint,bigint,text,bigint,boolean)') IS NULL THEN
    RAISE EXCEPTION 'Exact native Phase 5 link RPC is missing';
  END IF;
  IF has_function_privilege('anon','public.phase5_link_emirates_employee(uuid,bigint,bigint,bigint,text,bigint,boolean)','EXECUTE')
    OR has_function_privilege('service_role','public.phase5_link_emirates_employee(uuid,bigint,bigint,bigint,text,bigint,boolean)','EXECUTE')
    OR has_table_privilege('authenticated','erp_private.phase5_emirates_link_permits','SELECT,INSERT,UPDATE,DELETE')
    OR has_table_privilege('service_role','erp_private.phase5_emirates_link_permits','SELECT,INSERT,UPDATE,DELETE')
    OR EXISTS (SELECT 1 FROM erp_private.phase5_emirates_link_permits) THEN
    RAISE EXCEPTION 'The held pilot was seeded or its ACL escaped';
  END IF;
  CREATE TRIGGER reject_phase5_receipt BEFORE UPDATE ON erp_private.phase5_emirates_link_permits
    FOR EACH ROW EXECUTE FUNCTION pg_temp.reject_phase5_receipt();

  INSERT INTO auth.users(id,email) VALUES(requester_user,code||'-request@example.invalid'),
    (reviewer_user,code||'-review@example.invalid'),(gen_random_uuid(),code||'-file@example.invalid');
  INSERT INTO public.user_profiles(auth_user_id,status,must_change_password)
    SELECT u.id,'active',false FROM auth.users u WHERE u.email LIKE code||'-%'
    ON CONFLICT(auth_user_id) DO UPDATE SET status='active',must_change_password=false;
  SELECT id INTO STRICT requester FROM public.user_profiles WHERE auth_user_id=requester_user;
  SELECT id INTO STRICT reviewer FROM public.user_profiles WHERE auth_user_id=reviewer_user;
  SELECT p.id INTO STRICT filing_officer FROM public.user_profiles p JOIN auth.users u ON u.id=p.auth_user_id
    WHERE u.email=code||'-file@example.invalid';
  INSERT INTO auth.sessions(id,user_id) VALUES(requester_session,requester_user),(reviewer_session,reviewer_user);
  INSERT INTO public.owner_companies(company_code,legal_name_en,status)
    VALUES(code,'Synthetic company','active') RETURNING id INTO scope_company;
  INSERT INTO public.branches(owner_company_id,branch_code,branch_name_en,status)
    VALUES(scope_company,code||'A','Synthetic pilot branch','active') RETURNING id INTO scope_branch;
  INSERT INTO public.branches(owner_company_id,branch_code,branch_name_en,status)
    VALUES(scope_company,code||'B','Synthetic sibling','active') RETURNING id INTO sibling_branch;
  INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,is_active)
    SELECT p,p,'SYNTHETIC','test',true FROM unnest(ARRAY['dms.documents.view','dms.documents.preview',
      'dms.documents.approve','dms.documents.edit','dms.documents.upload','hr.employees.view','hr.compliance.manage']) p
    ON CONFLICT(permission_code) DO NOTHING;
  INSERT INTO public.roles(role_code,role_name,is_active) VALUES(code,'Synthetic exact actor',true) RETURNING id INTO pilot_role;
  INSERT INTO public.role_permissions(role_id,permission_id)
    SELECT pilot_role,id FROM public.permissions WHERE permission_code IN ('dms.documents.view','dms.documents.preview',
      'dms.documents.approve','dms.documents.edit','dms.documents.upload','hr.employees.view','hr.compliance.manage');
  INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
    VALUES(requester,pilot_role,scope_company,scope_branch,true) RETURNING id INTO requester_assignment;
  INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
    VALUES(reviewer,pilot_role,scope_company,sibling_branch,true) RETURNING id INTO reviewer_assignment;

  INSERT INTO public.dms_document_categories(category_code,name_en,is_active,is_system)
    VALUES(code,'Synthetic identity category',true,false) RETURNING id INTO category;
  INSERT INTO public.dms_document_types(type_code,name_en,category_id,allowed_entity_types,is_active,is_system)
    VALUES('EMIRATES_ID','Synthetic Emirates ID',category,'{employee}',true,false) RETURNING id INTO dms_type;
  INSERT INTO public.hr_identity_document_types(code,name_en,is_active)
    VALUES('EMIRATES_ID','Synthetic Emirates ID',true) RETURNING id INTO hr_type;
  INSERT INTO public.hr_employee_categories(code,name_en) VALUES(code,'Synthetic category') RETURNING id INTO hr_category;
  INSERT INTO public.employees(employee_code,full_name_en,gender,date_of_birth,owner_company_id,branch_id,joining_date,
      employee_category_id,mobile_number,emergency_contact_name,emergency_contact_mobile)
    VALUES(code||'A','Synthetic employee','male',birth,scope_company,scope_branch,birth+9000,
      hr_category,'0500000010','Synthetic','0500000011') RETURNING id INTO employee;
  INSERT INTO public.employees(employee_code,full_name_en,gender,date_of_birth,owner_company_id,branch_id,joining_date,
      employee_category_id,mobile_number,emergency_contact_name,emergency_contact_mobile)
    VALUES(code||'B','Synthetic employee','male',birth,scope_company,sibling_branch,birth+9000,
      hr_category,'0500000012','Synthetic','0500000013') RETURNING id INTO competing_employee;
  INSERT INTO public.employee_identity_documents(employee_id,document_type_id,document_number,expiry_date,status)
    VALUES(employee,hr_type,regexp_replace(document_number,'-','','g'),expires,'active');
  INSERT INTO public.dms_documents(document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,status,expiry_date)
    VALUES(code,'Synthetic exact source',dms_type,category,scope_company,scope_branch,'active',expires) RETURNING id INTO document;
  INSERT INTO public.dms_document_versions(document_id,version_number,is_current)
    VALUES(document,1,true) RETURNING id INTO current_version;
  INSERT INTO public.dms_document_files(document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash)
    VALUES(document,current_version,'original','dms-documents',code||'.pdf','synthetic.pdf','application/pdf',64,expected_sha)
    RETURNING id INTO original;
  INSERT INTO storage.buckets(id,name,public) VALUES('dms-documents','dms-documents',false) ON CONFLICT(id) DO NOTHING;
  INSERT INTO storage.objects(bucket_id,name,version,metadata)
    VALUES('dms-documents',code||'.pdf','synthetic-version',jsonb_build_object('size',64,'mimetype','application/pdf'))
    RETURNING id,updated_at INTO stored_object,stored_updated_at;
  UPDATE public.dms_documents SET current_version_id=current_version WHERE id=document;
  INSERT INTO public.dms_metadata_definitions(document_type_id,field_code,field_label_en,field_type,is_active)
    VALUES(dms_type,'emirates_id_number','ID','text',true),(dms_type,'date_of_birth','DOB','date',true),
      (dms_type,'expiry_date','Expiry','date',true);
  INSERT INTO public.dms_document_metadata_values(document_id,definition_id,value_text,value_date)
    SELECT document,d.id,CASE WHEN field_code='emirates_id_number' THEN document_number END,
      CASE field_code WHEN 'date_of_birth' THEN birth WHEN 'expiry_date' THEN expires END
    FROM public.dms_metadata_definitions d WHERE d.document_type_id=dms_type;
  SELECT jsonb_agg(jsonb_build_object('definitionId',d.id,'fieldType',d.field_type,'rawValue',coalesce(v.value_date::text,v.value_text)))
    INTO filed_fields FROM public.dms_document_metadata_values v JOIN public.dms_metadata_definitions d ON d.id=v.definition_id
    WHERE v.document_id=document;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',requester_user,'session_id',requester_session,'role','authenticated')::text,true);
  INSERT INTO public.dms_upload_sessions(session_code,original_filename,mime_type,file_size_bytes,sha256_hash,uploaded_by,
    owning_company_id,owning_branch_id,document_id,status,intake_status,review_status,approve_status,reviewed_by,approved_at)
    VALUES(code,'synthetic.pdf','application/pdf',64,expected_sha,requester,scope_company,scope_branch,document,
    'completed','approved','approved','completed',filing_officer,clock_timestamp()) RETURNING id INTO upload;
  INSERT INTO public.dms_ai_extraction_jobs(job_type) VALUES('extract') RETURNING id INTO ai_job;
  INSERT INTO public.dms_ai_extraction_results(job_id) VALUES(ai_job) RETURNING id INTO ai_result;
  INSERT INTO erp_private.f07_intake_analyses(result_id,upload_session_id,job_id,analysis_digest,source_sha256,object_id,
    object_version,object_updated_at,actor_id)
    VALUES(ai_result,upload,ai_job,expected_sha,expected_sha,gen_random_uuid(),'synthetic',clock_timestamp(),requester);
  INSERT INTO public.dms_approve_runs(upload_session_id,document_id,ai_result_id,run_key,status,stage,
    started_by,completed_at,metadata_json)
    VALUES(upload,document,ai_result,code,'completed','approve_save_completed',filing_officer,clock_timestamp(),
      jsonb_build_object('mode','single_file_new_document','file_id',original)) RETURNING id INTO filing_run;
  UPDATE public.dms_upload_sessions SET ai_result_id=ai_result,approve_run_id=filing_run WHERE id=upload;
  INSERT INTO erp_private.ai_approval_plans(actor_id,operation_id,request_hash,request_json,upload_session_id,reference_id,
    document_id,document_no,approve_run_id,storage_path,result,completed_at)
    VALUES(filing_officer,filing_operation,expected_sha,
      jsonb_build_object('documentTypeId',dms_type,'owningCompanyId',scope_company,'owningBranchId',scope_branch,
        'metadataValues',filed_fields,'prepared',jsonb_build_object('content_sha256',expected_sha,'analysis_result_id',ai_result)),
      upload,document,document,code,filing_run,code||'.pdf',
      jsonb_build_object('completed',true,'documentId',document,'file_id',original,'upload_session_id',upload,
        'approve_run_id',filing_run,'operation_id',filing_operation),clock_timestamp());
  INSERT INTO erp_private.ai_approval_verified_copies(actor_id,operation_id,verified_session_id,request_hash,object_id,
    object_version,object_updated_at,content_sha256,file_size_bytes,file_name)
    VALUES(filing_officer,filing_operation,gen_random_uuid(),expected_sha,stored_object,'synthetic-version',stored_updated_at,
      expected_sha,64,'synthetic.pdf');

  statement := format('select public.phase5_link_emirates_employee(%L,%L,%L,%L,%L,%L,$1)',
    link_operation,document,current_version,original,expected_sha,employee);
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',requester_user,'session_id',requester_session,'role','authenticated')::text,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE statement USING false;
    RAISE EXCEPTION 'Empty pilot admitted a link request';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO erp_private.phase5_emirates_link_permits(operation_id,document_id,version_id,file_id,sha256,
    employee_id,owner_company_id,branch_id,requested_actor_id,reviewer_actor_id,expires_at)
    VALUES(link_operation,document,current_version,original,expected_sha,employee,scope_company,scope_branch,
      requester,reviewer,clock_timestamp()+interval '20 minutes');
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE statement USING false;
    RAISE EXCEPTION 'Default-off configured case admitted a request';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  UPDATE erp_private.phase5_emirates_link_permits SET enabled=true WHERE operation_id=link_operation;
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE statement INTO requested USING false;
  IF requested IS DISTINCT FROM jsonb_build_object('operationId',link_operation,'state','pending') THEN
    RAISE EXCEPTION 'Exact request did not preserve its operation ID';
  END IF;
  BEGIN
    EXECUTE statement USING true;
    RAISE EXCEPTION 'The requester committed their own case';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',reviewer_user,'session_id',reviewer_session,'role','authenticated')::text,true);
  BEGIN
    EXECUTE statement USING true;
    RAISE EXCEPTION 'Sibling branch authorization leaked';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  UPDATE public.user_roles SET branch_id=scope_branch WHERE id=reviewer_assignment;
  BEGIN
    UPDATE public.user_roles SET is_active=false WHERE id=requester_assignment;
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      EXECUTE statement USING true;
      RAISE EXCEPTION 'A revoked requester remained eligible for linking';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RAISE EXCEPTION 'Roll back requester revocation' USING ERRCODE='P0004';
  EXCEPTION WHEN SQLSTATE 'P0004' THEN NULL;
  END;
  BEGIN
    UPDATE storage.objects SET version='replacement-version' WHERE id=stored_object;
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      EXECUTE statement USING true;
      RAISE EXCEPTION 'Replacement Storage object linked using stale filed evidence';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;
    RAISE EXCEPTION 'Roll back Storage replacement' USING ERRCODE='P0004';
  EXCEPTION WHEN SQLSTATE 'P0004' THEN NULL;
  END;
  BEGIN
    UPDATE public.dms_document_metadata_values SET value_date=expires+1 WHERE document_id=document AND value_date=expires;
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      EXECUTE statement USING true;
      RAISE EXCEPTION 'A modified approved fact linked';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;
    RAISE EXCEPTION 'Roll back changed field' USING ERRCODE='P0004';
  EXCEPTION WHEN SQLSTATE 'P0004' THEN NULL;
  END;
  BEGIN
    PERFORM set_config('request.jwt.claims','{}',true);
    INSERT INTO public.employee_identity_documents(employee_id,document_type_id,document_number,expiry_date,status)
      VALUES(competing_employee,hr_type,document_number,expires,'active');
    PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',reviewer_user,'session_id',reviewer_session,'role','authenticated')::text,true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      EXECUTE statement USING true;
      RAISE EXCEPTION 'A hidden competing identity linked';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;
    RAISE EXCEPTION 'Roll back competing identity' USING ERRCODE='P0004';
  EXCEPTION WHEN SQLSTATE 'P0004' THEN NULL;
  END;
  PERFORM set_config('test.reject_phase5_receipt','on',true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE statement USING true;
    RAISE EXCEPTION 'Injected receipt failure did not interrupt commit';
  EXCEPTION WHEN no_data_found THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('test.reject_phase5_receipt','off',true);
  IF EXISTS (SELECT 1 FROM public.dms_document_links WHERE document_id=document)
    OR EXISTS (SELECT 1 FROM public.dms_document_events WHERE metadata_json->>'operation_id'=link_operation::text)
    OR EXISTS (SELECT 1 FROM public.audit_logs WHERE new_values->>'operation_id'=link_operation::text) THEN
    RAISE EXCEPTION 'Failed receipt left a partial link, event or audit';
  END IF;
  EXECUTE 'SET LOCAL ROLE authenticated';
  EXECUTE statement INTO accepted USING true;
  IF accepted->>'state' IS DISTINCT FROM 'linked' OR accepted->>'operationId' IS DISTINCT FROM link_operation::text THEN
    RAISE EXCEPTION 'Exact native link did not return its receipt';
  END IF;
  EXECUTE statement INTO requested USING true;
  IF accepted IS DISTINCT FROM requested THEN
    RAISE EXCEPTION 'A same-operation retry changed the committed receipt';
  END IF;
  BEGIN
    PERFORM public.phase5_link_emirates_employee(link_operation,document,current_version,original,repeat('b',64),employee,true);
    RAISE EXCEPTION 'A changed witness recovered a link receipt';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  IF (SELECT count(*) FROM public.dms_document_links WHERE document_id=document AND entity_id=employee AND entity_type='employee') <> 1
    OR (SELECT count(*) FROM public.dms_document_events WHERE document_id=document AND metadata_json->>'operation_id'=link_operation::text) <> 1
    OR (SELECT count(*) FROM public.audit_logs WHERE new_values->>'operation_id'=link_operation::text) <> 1
    OR (SELECT count(*) FROM public.employees WHERE owner_company_id=scope_company) <> 2 THEN
    RAISE EXCEPTION 'Exact receipt retry duplicated the link, event, audit, or employee';
  END IF;
  UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=reviewer_session;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    EXECUTE statement USING true;
    RAISE EXCEPTION 'Revoked session recovered the link';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'Exact default-off Emirates ID link passed';
END;
$test$;
ROLLBACK;
