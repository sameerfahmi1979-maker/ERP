-- Synthetic native acceptance for the held exact shared HR source review.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

DO $test$
DECLARE
  label text := 'HD' || upper(left(replace(gen_random_uuid()::text, '-', ''), 10));
  first_actor uuid := gen_random_uuid();
  second_actor uuid := gen_random_uuid();
  denied_actor uuid := gen_random_uuid();
  first_session uuid := gen_random_uuid();
  second_session uuid := gen_random_uuid();
  denied_session uuid := gen_random_uuid();
  first_profile bigint;
  second_profile bigint;
  denied_profile bigint;
  company bigint;
  other_company bigint;
  branch bigint;
  sibling bigint;
  full_role bigint;
  hr_role bigint;
  dms_role bigint;
  number_role bigint;
  category bigint;
  document_type bigint;
  document_id bigint;
  first_document bigint;
  second_document bigint;
  other_branch_document bigint;
  other_company_document bigint;
  unapproved_document bigint;
  original_id bigint;
  version_id bigint;
  source_hash text := repeat('a', 64);
  source_ids jsonb;
  proof jsonb;
  expected_originals jsonb := '[]';
  prepared jsonb;
  review jsonb;
  request_id uuid;
  function_name text;
  role_name text;
  first_claims text := jsonb_build_object('sub', first_actor, 'session_id', first_session, 'role', 'authenticated')::text;
  second_claims text := jsonb_build_object('sub', second_actor, 'session_id', second_session, 'role', 'authenticated')::text;
  denied_claims text := jsonb_build_object('sub', denied_actor, 'session_id', denied_session, 'role', 'authenticated')::text;
  employees_before bigint := (SELECT count(*) FROM public.employees);
  links_before bigint := (SELECT count(*) FROM public.dms_document_links);
BEGIN
  IF to_regprocedure('public.request_shared_hr_document_source_review(jsonb,jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Exact source review RPC is missing';
  END IF;
  FOREACH function_name IN ARRAY ARRAY[
    'public.request_shared_hr_document_source_review(jsonb,jsonb,jsonb)',
    'public.approve_shared_hr_document_source_review(uuid,jsonb,jsonb)',
    'erp_private.review_shared_hr_document_sources(uuid,jsonb,jsonb,jsonb)'
  ] LOOP
    IF NOT has_function_privilege('authenticated',function_name,'EXECUTE')
      OR has_function_privilege('anon',function_name,'EXECUTE')
      OR has_function_privilege('service_role',function_name,'EXECUTE') THEN
      RAISE EXCEPTION 'Source review function ACL is incorrect';
    END IF;
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY['authenticated','anon','service_role'] LOOP
    IF has_table_privilege(role_name,'erp_private.shared_hr_document_source_reviewers','SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege(role_name,'erp_private.shared_hr_document_source_reviews','SELECT,INSERT,UPDATE,DELETE') THEN
      RAISE EXCEPTION 'Private review storage escaped its RPC trust boundary';
    END IF;
  END LOOP;

  INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,is_active)
    SELECT code,code,'SYNTHETIC','test',true
    FROM unnest(ARRAY['hr.employees.create','dms.documents.view','dms.documents.preview',
      'dms.documents.edit','dms.documents.approve','numbering.rules.generate']) AS code
    ON CONFLICT(permission_code) DO NOTHING;
  INSERT INTO auth.users(id,email)
    VALUES (first_actor,label||'-first@example.invalid'), (second_actor,label||'-second@example.invalid'),
           (denied_actor,label||'-deny@example.invalid');
  INSERT INTO public.user_profiles(auth_user_id,status,must_change_password)
    VALUES(first_actor,'active',false),(second_actor,'active',false),(denied_actor,'active',false)
    ON CONFLICT(auth_user_id) DO UPDATE SET status='active',must_change_password=false;
  SELECT id INTO STRICT first_profile FROM public.user_profiles WHERE auth_user_id=first_actor;
  SELECT id INTO STRICT second_profile FROM public.user_profiles WHERE auth_user_id=second_actor;
  SELECT id INTO STRICT denied_profile FROM public.user_profiles WHERE auth_user_id=denied_actor;
  INSERT INTO auth.sessions(id,user_id) VALUES
    (first_session,first_actor),(second_session,second_actor),(denied_session,denied_actor);
  INSERT INTO public.owner_companies(company_code,legal_name_en,status)
    VALUES(label||'A','Synthetic company','active') RETURNING id INTO company;
  INSERT INTO public.owner_companies(company_code,legal_name_en,status)
    VALUES(label||'B','Synthetic other company','active') RETURNING id INTO other_company;
  INSERT INTO public.branches(owner_company_id,branch_code,branch_name_en,status)
    VALUES(company,label||'A','Synthetic branch','active') RETURNING id INTO branch;
  INSERT INTO public.branches(owner_company_id,branch_code,branch_name_en,status)
    VALUES(company,label||'B','Synthetic sibling','active') RETURNING id INTO sibling;
  INSERT INTO public.roles(role_code,role_name,is_active)
    VALUES(label||'F','Synthetic combined draft role',true) RETURNING id INTO full_role;
  INSERT INTO public.roles(role_code,role_name,is_active)
    VALUES(label||'H','Synthetic employee creation role',true) RETURNING id INTO hr_role;
  INSERT INTO public.roles(role_code,role_name,is_active)
    VALUES(label||'D','Synthetic DMS role',true) RETURNING id INTO dms_role;
  INSERT INTO public.roles(role_code,role_name,is_active)
    VALUES(label||'N','Synthetic numbering role',true) RETURNING id INTO number_role;
  INSERT INTO public.role_permissions(role_id,permission_id)
    SELECT full_role,id FROM public.permissions WHERE permission_code IN
      ('hr.employees.create','dms.documents.view','dms.documents.preview','dms.documents.edit')
    UNION ALL SELECT hr_role,id FROM public.permissions WHERE permission_code='hr.employees.create'
    UNION ALL SELECT dms_role,id FROM public.permissions WHERE permission_code IN
      ('dms.documents.view','dms.documents.preview','dms.documents.edit')
    UNION ALL SELECT number_role,id FROM public.permissions WHERE permission_code='numbering.rules.generate';
  INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
    VALUES(first_profile,full_role,company,branch,true);
  INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
    VALUES(second_profile,full_role,company,branch,true);
  INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
    VALUES(first_profile,full_role,company,sibling,true),(first_profile,full_role,other_company,NULL,true),
      (denied_profile,hr_role,company,sibling,true),(denied_profile,dms_role,company,branch,true),
      (first_profile,number_role,NULL,NULL,true),(second_profile,number_role,NULL,NULL,true),
      (denied_profile,number_role,NULL,NULL,true);
  INSERT INTO public.erp_ai_feature_flags(feature_code,feature_name,is_enabled)
    VALUES('ERP_AI_HR_DOCUMENT_TO_EMPLOYEE','Synthetic HR.14A',true)
    ON CONFLICT(feature_code) DO UPDATE SET is_enabled=true;
  INSERT INTO public.dms_document_categories(category_code,name_en,is_active,is_system)
    VALUES(label,'Synthetic category',true,false) RETURNING id INTO category;
  INSERT INTO public.dms_document_types(type_code,name_en,category_id,is_active,is_system)
    VALUES(label,'Synthetic source type',category,true,false) RETURNING id INTO document_type;
  INSERT INTO public.dms_documents(document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,status)
    VALUES(label||'1','Synthetic approved source',document_type,category,company,branch,'active') RETURNING id INTO first_document;
  INSERT INTO public.dms_documents(document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,status)
    VALUES(label||'2','Synthetic approved second source',document_type,category,company,branch,'active') RETURNING id INTO second_document;
  INSERT INTO public.dms_documents(document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,status)
    VALUES(label||'3','Synthetic sibling source',document_type,category,company,sibling,'active') RETURNING id INTO other_branch_document;
  INSERT INTO public.dms_documents(document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,status)
    VALUES(label||'4','Synthetic other company source',document_type,category,other_company,NULL,'active') RETURNING id INTO other_company_document;
  INSERT INTO public.dms_documents(document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,status)
    VALUES(label||'5','Synthetic unapproved source',document_type,category,company,branch,'active') RETURNING id INTO unapproved_document;
  FOREACH document_id IN ARRAY ARRAY[first_document,second_document,other_branch_document,other_company_document,unapproved_document] LOOP
    INSERT INTO public.dms_document_versions(document_id,version_number,is_current)
      VALUES(document_id,1,true) RETURNING id INTO version_id;
    INSERT INTO public.dms_document_files(document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash)
      VALUES(document_id,version_id,'original','dms-documents',label||'/'||document_id||'.pdf','synthetic.pdf','application/pdf',64,source_hash)
      RETURNING id INTO original_id;
    UPDATE public.dms_documents SET current_version_id=version_id WHERE id=document_id;
    IF document_id IN (first_document,second_document) THEN
      expected_originals := expected_originals || jsonb_build_array(jsonb_build_object(
        'documentId',document_id,'fileId',original_id,'versionId',version_id,'sha256',source_hash));
    END IF;
  END LOOP;
  source_ids := jsonb_build_array(first_document,second_document);
  PERFORM set_config('request.jwt.claims',first_claims,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  prepared := public.prepare_document_employee_sources(source_ids);
  SELECT jsonb_agg(jsonb_build_object('documentId',value->'documentId','fingerprint',value->'fingerprint') ORDER BY ordinality)
    INTO proof FROM jsonb_array_elements(prepared) WITH ORDINALITY;
  BEGIN
    PERFORM public.request_shared_hr_document_source_review(source_ids,proof,expected_originals);
    RAISE EXCEPTION 'Default-off gate admitted an exact review request';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  UPDATE erp_private.shared_hr_document_draft_control SET enabled=true;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.request_shared_hr_document_source_review(source_ids,proof,expected_originals);
    RAISE EXCEPTION 'Draft enablement bypassed the separate source-review hold';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  UPDATE erp_private.shared_hr_document_draft_control SET source_review_enabled=true;
  INSERT INTO public.role_permissions(role_id,permission_id)
    SELECT full_role,id FROM public.permissions WHERE permission_code='dms.documents.approve';
  INSERT INTO erp_private.shared_hr_document_source_reviewers(actor_id,owner_company_id,branch_id)
    VALUES (first_profile,company,branch), (second_profile,company,sibling);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.request_shared_hr_document_source_review(source_ids,proof,jsonb_set(expected_originals,'{0,fileId}','99999999'));
    RAISE EXCEPTION 'Request accepted a forged original file';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM public.request_shared_hr_document_source_review(
      jsonb_build_array(first_document,other_branch_document),proof,expected_originals
    );
    RAISE EXCEPTION 'Request accepted mixed sibling branches';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.request_shared_hr_document_source_review(
      jsonb_build_array(first_document,other_company_document),proof,expected_originals
    );
    RAISE EXCEPTION 'Request accepted mixed companies';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims',denied_claims,true);
  BEGIN
    PERFORM public.request_shared_hr_document_source_review(source_ids,proof,expected_originals);
    RAISE EXCEPTION 'Request mixed HR and DMS permissions across branches';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims',first_claims,true);
  review := public.request_shared_hr_document_source_review(
    jsonb_build_array(second_document,first_document),proof,expected_originals
  );
  request_id := (review->>'requestId')::uuid;
  IF request_id IS NULL OR review->>'state' IS DISTINCT FROM 'pending' THEN
    RAISE EXCEPTION 'The exact request was not recorded';
  END IF;
  IF public.request_shared_hr_document_source_review(source_ids,proof,expected_originals) IS DISTINCT FROM review THEN
    RAISE EXCEPTION 'An exact request retry changed its receipt';
  END IF;
  BEGIN
    PERFORM public.approve_shared_hr_document_source_review(request_id,proof,expected_originals);
    RAISE EXCEPTION 'The requester approved their own review';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims',second_claims,true);
  BEGIN
    PERFORM public.approve_shared_hr_document_source_review(request_id,proof,expected_originals);
    RAISE EXCEPTION 'A reviewer assigned to a sibling branch approved a review';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO erp_private.shared_hr_document_source_reviewers(actor_id,owner_company_id,branch_id)
    VALUES (second_profile,company,branch);
  BEGIN
    UPDATE public.dms_documents SET created_by=second_profile WHERE id=first_document;
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      PERFORM public.approve_shared_hr_document_source_review(request_id,proof,expected_originals);
      RAISE EXCEPTION 'A source creator approved the source review';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RAISE EXCEPTION 'Roll back synthetic source creator mutation' USING ERRCODE='P0004';
  EXCEPTION WHEN SQLSTATE 'P0004' THEN NULL;
  END;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.approve_shared_hr_document_source_review(request_id,proof,jsonb_set(expected_originals,'{0,sha256}',to_jsonb(repeat('b',64))));
    RAISE EXCEPTION 'An altered original witness was approved';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  BEGIN
    UPDATE public.dms_documents SET approval_status='pending_approval' WHERE id=first_document;
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      PERFORM public.approve_shared_hr_document_source_review(request_id,proof,expected_originals);
      RAISE EXCEPTION 'A pending DMS workflow was approved for shared HR';
    EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
    END;
    RAISE EXCEPTION 'Roll back synthetic workflow status mutation' USING ERRCODE='P0004';
  EXCEPTION WHEN SQLSTATE 'P0004' THEN NULL;
  END;
  EXECUTE 'SET LOCAL ROLE authenticated';
  review := public.approve_shared_hr_document_source_review(request_id,proof,expected_originals);
  IF review IS DISTINCT FROM jsonb_build_object('requestId',request_id,'state','approved') THEN
    RAISE EXCEPTION 'Independent exact-source approval did not return its receipt';
  END IF;
  IF public.approve_shared_hr_document_source_review(request_id,proof,expected_originals) IS DISTINCT FROM review THEN
    RAISE EXCEPTION 'An exact approval retry changed its receipt';
  END IF;
  BEGIN
    PERFORM public.open_shared_hr_document_draft(source_ids,proof);
    RAISE EXCEPTION 'Source review bypassed adult, sponsor, pre-hire and dependent gates';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  BEGIN
    UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second' WHERE id=second_session;
    EXECUTE 'SET LOCAL ROLE authenticated';
    BEGIN
      PERFORM public.approve_shared_hr_document_source_review(request_id,proof,expected_originals);
      RAISE EXCEPTION 'An expired session replayed a source review receipt';
    EXCEPTION WHEN insufficient_privilege THEN NULL;
    END;
    RAISE EXCEPTION 'Roll back synthetic session expiry' USING ERRCODE='P0004';
  EXCEPTION WHEN SQLSTATE 'P0004' THEN NULL;
  END;
  DELETE FROM erp_private.shared_hr_document_source_reviewers AS a
    WHERE a.actor_id=second_profile AND a.owner_company_id=company AND a.branch_id=branch;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.approve_shared_hr_document_source_review(request_id,proof,expected_originals);
    RAISE EXCEPTION 'A removed reviewer replayed a source review receipt';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  INSERT INTO erp_private.shared_hr_document_source_reviewers(actor_id,owner_company_id,branch_id)
    VALUES(second_profile,company,branch);
  UPDATE public.dms_document_files SET file_role='supporting' WHERE id=(expected_originals->0->>'fileId')::bigint;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.approve_shared_hr_document_source_review(request_id,proof,expected_originals);
    RAISE EXCEPTION 'A changed original role allowed an approved receipt replay';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  IF NOT EXISTS (
    SELECT 1 FROM erp_private.shared_hr_document_source_reviews AS r
    WHERE r.id=request_id AND r.requested_by=first_profile AND r.approved_by=second_profile
      AND r.source_document_ids=source_ids AND r.source_fingerprints=proof AND r.originals=expected_originals
  ) OR EXISTS (SELECT 1 FROM erp_private.shared_hr_document_draft_approvals)
    OR EXISTS (SELECT 1 FROM erp_private.shared_hr_document_drafts)
    OR (SELECT count(*) FROM public.employees) <> employees_before
    OR (SELECT count(*) FROM public.dms_document_links) <> links_before THEN
    RAISE EXCEPTION 'Exact evidence receipt or business write boundary changed';
  END IF;
  RAISE NOTICE 'Exact shared HR source review held acceptance passed';
END;
$test$;
ROLLBACK;
