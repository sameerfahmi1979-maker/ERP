-- Execute after the checked-in employer routing migration.
\set ON_ERROR_STOP on
DO $$
BEGIN
  IF current_database()<>'agent_center_controls_native' OR inet_server_addr() IS DISTINCT FROM '127.0.0.1'::inet THEN
    RAISE EXCEPTION 'Disposable Agent Center database required';
  END IF;
END $$;
BEGIN;
INSERT INTO erp_private.agent_pdf_policy (connection_id,company_id,actor_id,officer_id,from_time,enabled,employer_company_ids)
  VALUES ('10000000-0000-4000-8000-000000000001',1,101,103,now(),true,ARRAY[2]::bigint[]);
INSERT INTO erp_private.agent_pdf_work (connection_id,item_id,version,operation_id,lease_token,lease_until,company_id,actor_id)
  VALUES ('10000000-0000-4000-8000-000000000001','synthetic','version-1',
    'aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001',now()+interval '10 minutes',1,101);

DO $$
DECLARE
  operation constant uuid := 'aaaaaaaa-0000-4000-8000-000000000001';
  lease constant uuid := 'bbbbbbbb-0000-4000-8000-000000000001';
  actor constant uuid := '00000000-0000-4000-8000-000000000101';
  fingerprint constant text := repeat('a',64);
BEGIN
  ASSERT NOT has_function_privilege('authenticated','public.dms_route_sharepoint_employer(uuid,uuid,uuid,text,bigint,text,text)','execute');
  ASSERT NOT has_function_privilege('erp_agent_discovery_runtime','public.dms_route_sharepoint_employer(uuid,uuid,uuid,text,bigint,text,text)','execute');
  ASSERT has_function_privilege('service_role','public.dms_route_sharepoint_employer(uuid,uuid,uuid,text,bigint,text,text)','execute');
  BEGIN
    PERFORM public.dms_route_sharepoint_employer(operation,gen_random_uuid(),actor,fingerprint,12,'inspect',NULL);
    RAISE EXCEPTION 'A stale lease gained access';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  BEGIN
    PERFORM public.dms_route_sharepoint_employer(operation,lease,gen_random_uuid(),fingerprint,12,'inspect',NULL);
    RAISE EXCEPTION 'Another user gained access';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    PERFORM public.dms_route_sharepoint_employer(operation,lease,actor,fingerprint,13,'inspect',NULL);
    RAISE EXCEPTION 'Wrong source length gained access';
  EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
  END;
  ASSERT public.dms_route_sharepoint_employer(operation,lease,actor,fingerprint,12,'inspect',NULL)
    = '{"status":"inspect"}'::jsonb;
  ASSERT public.dms_route_sharepoint_employer(operation,lease,actor,fingerprint,12,'employer','7 ORYX GENERAL TRANSPORT L L C')
    = '{"status":"bound","companyId":2}'::jsonb;
  ASSERT public.dms_route_sharepoint_employer(operation,lease,actor,fingerprint,12,'employer','Test Source LLC')
    = '{"status":"bound","companyId":2}'::jsonb;
  ASSERT (SELECT (company_id, employer_company_id, sha256)=(1::bigint,2::bigint,fingerprint)
    FROM erp_private.agent_pdf_work WHERE operation_id=operation);
  UPDATE public.user_roles SET is_active=false WHERE user_profile_id=101 AND owner_company_id=2;
  BEGIN
    PERFORM public.dms_route_sharepoint_employer(operation,lease,actor,fingerprint,12,'inspect',NULL);
    RAISE EXCEPTION 'A revoked assignment was reused';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  UPDATE public.user_roles SET is_active=true WHERE user_profile_id=101 AND owner_company_id=2;
END $$;

-- The same original already exists in the source company only.
INSERT INTO public.dms_documents (id,owning_company_id) VALUES (701,1);
INSERT INTO public.dms_document_files (document_id,sha256_hash,file_role) VALUES (701,repeat('a',64),'original');
SET SESSION AUTHORIZATION erp_agent_discovery_runtime;
SELECT erp_private.advance_agent_pdf('10000000-0000-4000-8000-000000000001',
  'aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','prepare',repeat('a',64))
  = 'ready' AS target_duplicate_scope \gset
\if :target_duplicate_scope
\else
  \quit 11
\endif
RESET SESSION AUTHORIZATION;

INSERT INTO public.dms_upload_sessions (status,intake_status,uploaded_by,owning_company_id,sha256_hash,ai_result_id)
  VALUES ('uploaded','review_pending',101,2,repeat('a',64),881) RETURNING id AS session_id \gset
INSERT INTO public.dms_ai_extraction_results (id,upload_session_id,ai_status,suggested_document_type_id)
  VALUES (881,:session_id,'pending_review',67);
INSERT INTO erp_private.f07_single_upload_admissions VALUES (101,'aaaaaaaa-0000-4000-8000-000000000001',:session_id);
SET SESSION AUTHORIZATION erp_agent_discovery_runtime;
SELECT erp_private.advance_agent_pdf('10000000-0000-4000-8000-000000000001',
  'aaaaaaaa-0000-4000-8000-000000000001','bbbbbbbb-0000-4000-8000-000000000001','inspect',NULL)
  = 'review_pending' AS queued \gset
\if :queued
\else
  \quit 12
\endif
RESET SESSION AUTHORIZATION;
DO $$
BEGIN
  ASSERT (SELECT count(*)=1 FROM public.dms_review_queue WHERE assigned_to=103 AND status='assigned');
  ASSERT (SELECT count(*)=1 FROM public.dms_upload_sessions
    WHERE owning_company_id=2 AND intake_status='review_pending' AND document_id IS NULL);
END $$;

-- An unregistered or ambiguous match produces a recorded hold before native upload.
INSERT INTO erp_private.agent_source_versions (connection_id,item_id,version,mime,size_bytes) VALUES
  ('10000000-0000-4000-8000-000000000001','ambiguous','version-1','application/pdf',12);
INSERT INTO erp_private.agent_source_items VALUES
  ('10000000-0000-4000-8000-000000000001','ambiguous','version-1','synthetic.pdf',true);
INSERT INTO erp_private.agent_pdf_work (connection_id,item_id,version,operation_id,lease_token,lease_until,company_id,actor_id)
  VALUES ('10000000-0000-4000-8000-000000000001','ambiguous','version-1',
    'aaaaaaaa-0000-4000-8000-000000000002','bbbbbbbb-0000-4000-8000-000000000002',now()+interval '10 minutes',1,101);
UPDATE public.owner_companies SET status='active',legal_name_en='7 ORYX GENERAL TRANSPORT L L C' WHERE id=3;
DO $$
BEGIN
  ASSERT public.dms_route_sharepoint_employer('aaaaaaaa-0000-4000-8000-000000000002',
    'bbbbbbbb-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000101',
    repeat('b',64),12,'employer','7 ORYX GENERAL TRANSPORT LLC') = '{"status":"held"}'::jsonb;
  ASSERT (SELECT reason='employment_employer_missing_or_ambiguous' AND session_id IS NULL
    FROM erp_private.agent_pdf_work WHERE item_id='ambiguous');
END $$;
ROLLBACK;
\echo Passed exact employer, source/target grants, replay, target-company duplicate scope, and officer review.
