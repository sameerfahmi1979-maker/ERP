BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=pg_catalog;

-- These functions keep authenticated table grants and restrictive RLS. The
-- non-login role adds only INSERT on audit_logs and its ID sequence. API
-- roles have no membership in the writer role and cannot SET ROLE to it.
CREATE ROLE erp_transaction_audit_writer NOLOGIN INHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT authenticated TO erp_transaction_audit_writer;
GRANT erp_transaction_audit_writer TO postgres;
GRANT USAGE ON SCHEMA public,erp_private TO erp_transaction_audit_writer;
GRANT INSERT ON public.audit_logs TO erp_transaction_audit_writer;
GRANT USAGE ON SEQUENCE public.audit_logs_id_seq TO erp_transaction_audit_writer;
CREATE POLICY audit_logs_transaction_insert ON public.audit_logs FOR INSERT TO erp_transaction_audit_writer
  WITH CHECK (actor_user_profile_id=public.current_user_profile_id() AND erp_private.business_principal_is_active());

-- Each entry is an existing audited transaction with reviewed authorization.
-- Do not convert the owner-only allocation helpers or the two independently
-- session-checked service functions into authenticated RPCs.
DO $$
DECLARE routine record; actual record;
BEGIN
  FOR routine IN SELECT * FROM (VALUES
    ('erp_private.batch_create_audit()', '4ebdafc030369f28d81f43af9943911c'),
    ('erp_private.numbered_upload_plan(uuid,jsonb,boolean)', '83a7269656df36914f759ce56e093544'),
    ('public.convert_candidate_to_employee_atomic(bigint,uuid,bigint,jsonb)', '6e8dac10a2b3aae567e13547a23aeab8'),
    ('public.create_numbered_dms_batch_draft(uuid,jsonb)', '5d6f90d47fcf6f0cea9f6b56fcd49fec'),
    ('public.create_numbered_dms_document(uuid,jsonb)', '5db6191c6bc2550fb56440839d080261'),
    ('public.create_numbered_document_employee(uuid,jsonb,jsonb)', 'a547c886696d725716836f3126928d36'),
    ('public.create_numbered_job_requisition(uuid,jsonb)', 'ed8346ab945367f72fa760b6851e9d9c'),
    ('public.f03_apply_permission_batch(jsonb)', '48d353ca92fc6ce3b21d3b9c0d6420bf'),
    ('public.f03_clone_role(bigint,jsonb)', '16f4b9265b3ebfb8f5893202dce85a9e'),
    ('public.f09_remove_schedule(uuid,bigint,bigint)', 'd02d892c8a44c67ff01b5e39244b46f9'),
    ('public.f09_save_schedule(uuid,bigint,bigint,jsonb)', '133d50280a5f96f794d234ddd67975eb'),
    ('public.f11_save_dependent(uuid,bigint,bigint,bigint,text,jsonb,bigint[],bigint[])', 'dc01a225370b98d4bada46edde9e8ae7'),
    ('public.finish_numbered_ai_intake(uuid,jsonb,text)', '13a6525723aab3aa359befce5894550a'),
    ('public.finish_numbered_dms_upload(uuid,jsonb,text)', '1a028c7a45f57046262e4738d0471dd2'),
    ('public.reserve_numbered_ai_intake(uuid,jsonb)', '0fe2ae7b358bc0a7b41acddbc9fecef0'),
    ('public.save_workspace_record(text,uuid,bigint,bigint,jsonb)', '6f9be98adcdbca0e503684ef0b8c7c00')
  ) AS v(signature,body_hash) LOOP
    SELECT n.nspname,p.* INTO actual FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE p.oid=to_regprocedure(routine.signature) AND p.proowner='postgres'::regrole AND NOT p.prosecdef
        AND p.proconfig=ARRAY['search_path=""'] AND md5(replace(p.prosrc,E'\r\n',E'\n'))=routine.body_hash;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unexpected audit writer predecessor %',routine.signature; END IF;
    EXECUTE format('GRANT CREATE ON SCHEMA %I TO erp_transaction_audit_writer',actual.nspname);
    EXECUTE format('ALTER FUNCTION %s SECURITY DEFINER',routine.signature);
    EXECUTE format('ALTER FUNCTION %s OWNER TO erp_transaction_audit_writer',routine.signature);
    EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM erp_transaction_audit_writer',actual.nspname);
  END LOOP;
END $$;

-- Keep role-sensitive DMS triggers on their caller checks under the narrow
-- writer. The writer has the same business grants and RLS memberships.
DO $$
DECLARE routine record; definition text;
BEGIN
  FOR routine IN SELECT * FROM (VALUES
    ('erp_private.f05_guard_approval_fields()', 'c72a815ad7a74be046ddb4884f680469'),
    ('erp_private.f07_guard_archive_fields()', 'f363bbeec57c6bb9ee86636173a1abc6'),
    ('erp_private.f07_guard_delivery_event()', '50e7939e57a5f85e4923c1299fcc0f11')
  ) AS v(signature,body_hash) LOOP
    SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE oid=to_regprocedure(routine.signature)
      AND md5(replace(prosrc,E'\r\n',E'\n'))=routine.body_hash AND NOT prosecdef;
    IF NOT FOUND THEN RAISE EXCEPTION 'Unexpected audit caller guard predecessor %',routine.signature; END IF;
    definition:=replace(definition,$old$current_user IN ('authenticated',$old$,$new$current_user IN ('erp_transaction_audit_writer','authenticated',$new$);
    definition:=replace(definition,$old$current_user IN ('anon',$old$,$new$current_user IN ('erp_transaction_audit_writer','anon',$new$);
    IF position('erp_transaction_audit_writer' IN definition)=0 THEN RAISE EXCEPTION 'Audit role guard anchor missing'; END IF;
    EXECUTE definition;
  END LOOP;
END $$;

DROP POLICY audit_logs_insert ON public.audit_logs;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES ON public.audit_logs FROM PUBLIC,anon,authenticated;
REVOKE UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES ON public.audit_logs FROM service_role;

-- Record legacy server events under their authenticated, live ERP identity.
-- Calls are limited to the server credential. Business transaction writers
-- continue to emit their own events inside the transaction above.
CREATE FUNCTION public.append_erp_server_audit_event(p_actor bigint,p_session uuid,p_event jsonb)
RETURNS void LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE company bigint; branch bigint;
BEGIN
  IF current_user<>'service_role' OR jsonb_typeof(p_event) IS DISTINCT FROM 'object' OR octet_length(p_event::text)>262144
    OR p_event-ARRAY['module_code','entity_name','entity_id','entity_reference','action','old_values','new_values','owner_company_id','branch_id','ip_address','user_agent']<>'{}'::jsonb
    OR NOT erp_private.provider_actor_session_valid(p_actor,p_session)
    OR NOT EXISTS(SELECT 1 FROM public.user_profiles u WHERE u.id=p_actor AND u.status='active' AND NOT u.must_change_password) THEN
    RAISE EXCEPTION 'Audit event unavailable' USING ERRCODE='42501';
  END IF;
  company:=(p_event->>'owner_company_id')::bigint;
  branch:=(p_event->>'branch_id')::bigint;
  IF branch IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.branches b WHERE b.id=branch AND b.owner_company_id=company) THEN
    RAISE EXCEPTION 'Audit branch outside company' USING ERRCODE='42501';
  END IF;
  IF company IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
    WHERE ur.user_profile_id=p_actor AND ur.is_active AND r.is_active
    AND ((ur.owner_company_id IS NULL AND ur.branch_id IS NULL)
      OR (ur.owner_company_id=company AND (ur.branch_id IS NULL OR ur.branch_id=branch)))) THEN
    RAISE EXCEPTION 'Audit scope unavailable' USING ERRCODE='42501';
  END IF;
  INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,
    entity_reference,action,old_values,new_values,ip_address,user_agent)
  VALUES(p_actor,company,branch,p_event->>'module_code',p_event->>'entity_name',(p_event->>'entity_id')::bigint,
    p_event->>'entity_reference',p_event->>'action',nullif(p_event->'old_values','null'::jsonb),nullif(p_event->'new_values','null'::jsonb),
    p_event->>'ip_address',p_event->>'user_agent');
END $$;
REVOKE ALL ON FUNCTION public.append_erp_server_audit_event(bigint,uuid,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.append_erp_server_audit_event(bigint,uuid,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
