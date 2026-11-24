-- Synthetic native acceptance. Run only on an isolated PostgreSQL database
-- with the HR.14A and F03 prerequisites, F07 session locking (20261123112314
-- and 20261123113514) and the held migration applied.
\set ON_ERROR_STOP on
BEGIN;
SET LOCAL lock_timeout = '3s';
SET LOCAL statement_timeout = '20s';

DO $test$
DECLARE
  label text := 'HD' || left(replace(gen_random_uuid()::text, '-', ''), 10);
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
  first_create bigint;
  second_create bigint;
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
  originals jsonb := '[]';
  prepared jsonb;
  draft jsonb;
  draft_id uuid;
  function_name text;
  role_name text;
  payload jsonb := '{"full_name_en":"Synthetic test subject","nationality_id":null}';
  first_claims text := jsonb_build_object('sub', first_actor, 'session_id', first_session, 'role', 'authenticated')::text;
  second_claims text := jsonb_build_object('sub', second_actor, 'session_id', second_session, 'role', 'authenticated')::text;
  denied_claims text := jsonb_build_object('sub', denied_actor, 'session_id', denied_session, 'role', 'authenticated')::text;
  employees_before bigint := (SELECT count(*) FROM public.employees);
  links_before bigint := (SELECT count(*) FROM public.dms_document_links);
BEGIN
  IF to_regprocedure('public.open_shared_hr_document_draft(jsonb,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'Shared draft RPC is missing';
  END IF;
  FOREACH function_name IN ARRAY ARRAY['public.open_shared_hr_document_draft(jsonb,jsonb)',
    'public.read_shared_hr_document_draft(uuid)','public.save_shared_hr_document_draft(uuid,integer,jsonb)',
    'erp_private.shared_hr_document_draft(text,uuid,jsonb,jsonb,integer,jsonb)'] LOOP
    IF NOT has_function_privilege('authenticated',function_name,'EXECUTE')
      OR has_function_privilege('anon',function_name,'EXECUTE')
      OR has_function_privilege('service_role',function_name,'EXECUTE') THEN
      RAISE EXCEPTION 'Shared draft function ACL is incorrect';
    END IF;
  END LOOP;
  FOREACH role_name IN ARRAY ARRAY['authenticated','anon','service_role'] LOOP
    IF has_table_privilege(role_name,'erp_private.shared_hr_document_drafts','SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege(role_name,'erp_private.shared_hr_document_draft_approvals','SELECT,INSERT,UPDATE,DELETE')
      OR has_table_privilege(role_name,'erp_private.shared_hr_document_draft_control','SELECT,INSERT,UPDATE,DELETE')
      OR has_function_privilege(role_name,'erp_private.validate_shared_hr_document_draft_payload(jsonb)','EXECUTE') THEN
      RAISE EXCEPTION 'Draft or approval storage escaped its RPC trust boundary';
    END IF;
  END LOOP;
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
    VALUES(first_profile,full_role,company,branch,true) RETURNING id INTO first_create;
  INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
    VALUES(second_profile,full_role,company,branch,true) RETURNING id INTO second_create;
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
      originals := originals || jsonb_build_array(jsonb_build_object(
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
    PERFORM public.open_shared_hr_document_draft(source_ids,proof);
    RAISE EXCEPTION 'Unapproved selection created a draft';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  -- Only the test owner supplies the trusted exact approval. No caller or
  -- service role receives an admission privilege.
  INSERT INTO erp_private.shared_hr_document_draft_approvals(source_document_ids,source_fingerprints,approved_originals,approved_by)
    VALUES(source_ids,proof,originals,denied_profile);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.open_shared_hr_document_draft(source_ids,proof);
    RAISE EXCEPTION 'Default-off native control admitted a fully approved selection';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  UPDATE erp_private.shared_hr_document_draft_control SET enabled=true;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.open_shared_hr_document_draft(source_ids,jsonb_set(proof,'{0,fingerprint}',to_jsonb(repeat('b',64))));
    RAISE EXCEPTION 'Stale reviewed fingerprint created a draft';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM public.open_shared_hr_document_draft(jsonb_build_array(first_document,other_branch_document),proof);
    RAISE EXCEPTION 'Mixed sibling branches created a draft even with both assignments';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.open_shared_hr_document_draft(jsonb_build_array(first_document,other_company_document),proof);
    RAISE EXCEPTION 'Mixed companies created a draft even with both assignments';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.open_shared_hr_document_draft(jsonb_build_array(first_document),jsonb_build_array(proof->0));
    RAISE EXCEPTION 'A subset of an approved selection created a draft';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  draft := public.open_shared_hr_document_draft(jsonb_build_array(second_document,first_document),proof);
  draft_id := (draft->>'draftId')::uuid;
  IF draft_id IS NULL OR draft->'revision' IS DISTINCT FROM '0'::jsonb
    OR draft->'ownerCompanyId' IS DISTINCT FROM to_jsonb(company)
    OR draft->'branchId' IS DISTINCT FROM to_jsonb(branch)
    OR draft->'sourceFingerprints' IS DISTINCT FROM proof OR draft->'payload' IS DISTINCT FROM '{}'::jsonb THEN
    RAISE EXCEPTION 'Open did not return exact scope and empty revision zero';
  END IF;
  BEGIN
    PERFORM public.save_shared_hr_document_draft(draft_id,0,'{"owner_company_id":1}');
    RAISE EXCEPTION 'Save accepted a caller-chosen target scope';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.save_shared_hr_document_draft(draft_id,0,'{"complianceRecords":[]}');
    RAISE EXCEPTION 'Save accepted compliance data';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  draft := public.save_shared_hr_document_draft(draft_id,0,payload);
  IF draft->'revision' IS DISTINCT FROM '1'::jsonb OR draft->'payload' IS DISTINCT FROM payload THEN
    RAISE EXCEPTION 'Save did not retain the wizard fields at next revision';
  END IF;
  PERFORM set_config('request.jwt.claims',second_claims,true);
  IF public.read_shared_hr_document_draft(draft_id) IS DISTINCT FROM draft
    OR public.open_shared_hr_document_draft(source_ids,proof) IS DISTINCT FROM draft THEN
    RAISE EXCEPTION 'The other authorized actor could not reopen the same draft';
  END IF;
  BEGIN
    PERFORM public.save_shared_hr_document_draft(draft_id,0,'{"full_name_en":"Other editor"}');
    RAISE EXCEPTION 'Stale editor overwrote the newer revision';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  PERFORM set_config('request.jwt.claims',denied_claims,true);
  BEGIN
    PERFORM public.read_shared_hr_document_draft(draft_id);
    RAISE EXCEPTION 'A sibling HR grant mixed with the source DMS grant';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  UPDATE erp_private.shared_hr_document_draft_control SET enabled=false;
  PERFORM set_config('request.jwt.claims',first_claims,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.read_shared_hr_document_draft(draft_id);
    RAISE EXCEPTION 'Disabled native control exposed a retained draft';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.save_shared_hr_document_draft(draft_id,1,payload);
    RAISE EXCEPTION 'Disabled native control allowed saving a retained draft';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  UPDATE erp_private.shared_hr_document_draft_control SET enabled=true;
  UPDATE public.user_roles SET is_active=false WHERE id=second_create;
  PERFORM set_config('request.jwt.claims',second_claims,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.read_shared_hr_document_draft(draft_id);
    RAISE EXCEPTION 'Revoked exact grant exposed the draft';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  UPDATE public.user_roles SET is_active=true WHERE id=second_create;
  UPDATE auth.sessions SET not_after=clock_timestamp() - interval '1 second' WHERE id=second_session;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.read_shared_hr_document_draft(draft_id);
    RAISE EXCEPTION 'An expired session reopened a draft';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  DELETE FROM auth.sessions WHERE id=second_session;
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.save_shared_hr_document_draft(draft_id,1,'{"full_name_en":"Revoked session"}');
    RAISE EXCEPTION 'A revoked session saved a draft';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  UPDATE erp_private.shared_hr_document_draft_approvals SET revoked_at=clock_timestamp() WHERE source_document_ids=source_ids;
  PERFORM set_config('request.jwt.claims',first_claims,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.read_shared_hr_document_draft(draft_id);
    RAISE EXCEPTION 'A revoked approval reopened a draft';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  UPDATE erp_private.shared_hr_document_draft_approvals SET revoked_at=NULL WHERE source_document_ids=source_ids;
  PERFORM set_config('request.jwt.claims','{}',true);
  UPDATE public.dms_documents SET confidentiality_level='hr' WHERE id=second_document;
  PERFORM set_config('request.jwt.claims',first_claims,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.read_shared_hr_document_draft(draft_id);
    RAISE EXCEPTION 'Inaccessible confidential source reopened a draft';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims','{}',true);
  UPDATE public.dms_documents SET confidentiality_level='internal' WHERE id=second_document;
  UPDATE public.dms_document_files AS f SET file_role='preview' WHERE f.document_id=second_document;
  PERFORM set_config('request.jwt.claims',first_claims,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.read_shared_hr_document_draft(draft_id);
    RAISE EXCEPTION 'Loss of original role did not invalidate its approval';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims','{}',true);
  UPDATE public.dms_document_files AS f SET file_role='original' WHERE f.document_id=second_document;
  UPDATE public.dms_document_files AS f SET sha256_hash=repeat('c',64) WHERE f.document_id=second_document;
  PERFORM set_config('request.jwt.claims',first_claims,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.read_shared_hr_document_draft(draft_id);
    RAISE EXCEPTION 'Changed original SHA-256 reopened a draft';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims','{}',true);
  UPDATE public.dms_document_files AS f SET sha256_hash=source_hash WHERE f.document_id=second_document;
  UPDATE public.dms_documents SET title='Changed synthetic source' WHERE id=first_document;
  PERFORM set_config('request.jwt.claims',first_claims,true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.save_shared_hr_document_draft(draft_id,1,payload);
    RAISE EXCEPTION 'A changed prepared source allowed a save';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  IF (SELECT count(*) FROM erp_private.shared_hr_document_drafts WHERE source_document_ids=source_ids) <> 1
    OR (SELECT revision FROM erp_private.shared_hr_document_drafts WHERE id=draft_id) <> 1
    OR (SELECT count(*) FROM public.employees) <> employees_before
    OR (SELECT count(*) FROM public.dms_document_links) <> links_before THEN
    RAISE EXCEPTION 'Unexpected drafts, revisions, employee masters or DMS links';
  END IF;
  RAISE NOTICE 'Shared HR draft passed exact selection, source originals, shared reopen, revision, access and lifecycle fencing';
END $test$;
ROLLBACK;
