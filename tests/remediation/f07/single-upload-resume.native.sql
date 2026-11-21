BEGIN;
SET LOCAL statement_timeout = '30s';
DO $test$
DECLARE
  company bigint;
  branch_a bigint;
  branch_b bigint;
  role_id bigint;
  v_actor_id bigint;
  other_actor_id bigint;
  actor_uid uuid := gen_random_uuid();
  other_uid uuid := gen_random_uuid();
  actor_session uuid := gen_random_uuid();
  other_session uuid := gen_random_uuid();
  suffix text := upper(left(replace(gen_random_uuid()::text, '-', ''), 10));
  fingerprint text := repeat('e', 64);
  original jsonb;
  fresh jsonb;
  receipt jsonb;
  session_id bigint;
  session_code text;
  scoped_claims text;
BEGIN
  IF current_database() <> 'package3_dms_resume_20261120' OR current_setting('cron.launch_active_jobs') <> 'off'
    OR (SELECT shobj_description(oid, 'pg_database') FROM pg_database WHERE datname = current_database()) IS DISTINCT FROM 'Isolated HR T00 20261119' THEN
    RAISE EXCEPTION 'Isolated recovery test database required';
  END IF;

  SELECT id INTO STRICT company FROM public.owner_companies WHERE status = 'active' ORDER BY id LIMIT 1;
  INSERT INTO public.branches(owner_company_id, branch_code, branch_name_en, status)
    VALUES (company, 'RECA' || suffix, 'Synthetic recovery branch', 'active') RETURNING id INTO branch_a;
  INSERT INTO public.branches(owner_company_id, branch_code, branch_name_en, status)
    VALUES (company, 'RECB' || suffix, 'Synthetic alternate branch', 'active') RETURNING id INTO branch_b;
  INSERT INTO auth.users(id, email) VALUES
    (actor_uid, 'resume-' || suffix || '@example.invalid'), (other_uid, 'resume-other-' || suffix || '@example.invalid');
  INSERT INTO public.user_profiles(auth_user_id, status, must_change_password) VALUES
    (actor_uid, 'active', false), (other_uid, 'active', false)
    ON CONFLICT (auth_user_id) DO UPDATE SET status = 'active', must_change_password = false;
  SELECT id INTO STRICT v_actor_id FROM public.user_profiles WHERE auth_user_id = actor_uid;
  SELECT id INTO STRICT other_actor_id FROM public.user_profiles WHERE auth_user_id = other_uid;
  INSERT INTO auth.sessions(id, user_id) VALUES (actor_session, actor_uid), (other_session, other_uid);
  INSERT INTO public.roles(role_code, role_name, is_active)
    VALUES ('RECU' || suffix, 'Synthetic scoped uploader', true) RETURNING id INTO role_id;
  INSERT INTO public.role_permissions(role_id, permission_id)
    SELECT role_id, id FROM public.permissions WHERE permission_code = 'dms.documents.upload';
  INSERT INTO public.user_roles(user_profile_id, role_id, owner_company_id, branch_id, is_active) VALUES
    (v_actor_id, role_id, company, branch_a, true), (v_actor_id, role_id, company, branch_b, true),
    (other_actor_id, role_id, company, branch_a, true);

  scoped_claims := jsonb_build_object('sub', actor_uid, 'session_id', actor_session, 'role', 'authenticated')::text;
  PERFORM set_config('request.jwt.claims', scoped_claims, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  original := jsonb_build_object('version', 1, 'authUserId', actor_uid, 'operationId', gen_random_uuid(), 'context', null,
    'metadata', jsonb_build_object('original_filename', 'synthetic-recovery.pdf', 'mime_type', 'application/pdf',
      'file_size_bytes', 10, 'sha256_hash', fingerprint), 'scope', jsonb_build_object('companyId', company, 'branchId', branch_a));
  fresh := jsonb_set(original, '{operationId}', to_jsonb(gen_random_uuid()));
  receipt := public.f07_admit_single_upload(original);
  session_id := (receipt#>>'{session,id}')::bigint;
  session_code := receipt#>>'{session,session_code}';
  IF session_code IS NULL OR receipt#>>'{session,status}' <> 'uploading' THEN
    RAISE EXCEPTION 'Initial upload fixture did not create an unverified intake';
  END IF;
  IF public.ai_mod04_duplicate_advisory(fingerprint, 10) IS DISTINCT FROM jsonb_build_object(
    'status', 'transfer_pending', 'sessionCode', session_code, 'authoritative', false, 'resumable', true) THEN
    RAISE EXCEPTION 'Unverified intake did not get pending recovery guidance';
  END IF;
  IF public.f07_resume_single_upload(fresh, session_code) IS DISTINCT FROM jsonb_build_object('recovery', original) THEN
    RAISE EXCEPTION 'Fresh origin did not recover the same retained operation';
  END IF;
  IF public.f07_resume_single_upload(original, session_code) IS DISTINCT FROM (receipt || '{"replayed":true}'::jsonb) THEN
    RAISE EXCEPTION 'Retained context did not replay the same full receipt';
  END IF;
  IF public.f07_resume_single_upload(fresh, session_code) IS DISTINCT FROM jsonb_build_object('recovery', original) THEN
    RAISE EXCEPTION 'Repeating a fresh recovery changed the retained operation';
  END IF;
  BEGIN
    PERFORM public.f07_resume_single_upload(jsonb_set(fresh, '{scope,branchId}', to_jsonb(branch_b)), session_code);
    RAISE EXCEPTION 'An alternate branch changed the original upload';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM public.f07_resume_single_upload(jsonb_set(fresh, '{metadata,original_filename}', '"different.pdf"'), session_code);
    RAISE EXCEPTION 'Different filename changed the original upload';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM public.f07_resume_single_upload(jsonb_set(fresh - 'scope', '{context}', jsonb_build_object('entityType', 'branch', 'entityId', branch_a)), session_code);
    RAISE EXCEPTION 'Different subject changed the original upload';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM public.f07_acknowledge_single_upload(original, session_id);
    RAISE EXCEPTION 'The resume request supplied byte verification';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('request.jwt.claims', jsonb_build_object('sub', other_uid, 'session_id', other_session, 'role', 'authenticated')::text, true);
  IF public.ai_mod04_duplicate_advisory(fingerprint, 10)->>'status' <> 'no_visible_match' THEN
    RAISE EXCEPTION 'A different uploader discovered the original intake';
  END IF;
  BEGIN
    PERFORM public.f07_resume_single_upload(jsonb_set(fresh, '{authUserId}', to_jsonb(other_uid)), session_code);
    RAISE EXCEPTION 'Different uploader recovered a private intake';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  IF (SELECT count(*) FROM erp_private.f07_single_upload_admissions a WHERE a.actor_id = v_actor_id) <> 1
    OR (SELECT count(*) FROM public.dms_upload_sessions s WHERE s.uploaded_by = v_actor_id) <> 1
    OR EXISTS (SELECT 1 FROM storage.objects o WHERE o.bucket_id = 'dms-temp' AND o.name = receipt#>>'{session,temp_storage_path}') THEN
    RAISE EXCEPTION 'Recovery created duplicate admissions, sessions or stored objects';
  END IF;
  IF has_function_privilege('anon', 'public.f07_resume_single_upload(jsonb,text)', 'EXECUTE')
    OR has_function_privilege('service_role', 'public.f07_resume_single_upload(jsonb,text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Resume execution was granted beyond the original business principal';
  END IF;

  UPDATE public.user_roles r SET is_active = false WHERE r.user_profile_id = v_actor_id AND r.branch_id = branch_a;
  PERFORM set_config('request.jwt.claims', scoped_claims, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN
    PERFORM public.f07_resume_single_upload(fresh, session_code);
    RAISE EXCEPTION 'Recovery accepted an uploader after its branch assignment was removed';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  EXECUTE 'RESET ROLE';
  RAISE NOTICE 'FA-20 native recovery checks passed';
END $test$;
ROLLBACK;
