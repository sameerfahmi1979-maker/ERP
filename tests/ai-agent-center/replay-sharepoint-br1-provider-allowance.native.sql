-- Run with psql -X -h 127.0.0.1 against a fresh disposable agent_center_controls_native database.
\set ON_ERROR_STOP on
\ir native-worker-commit/controls-fixture.native.sql
\ir ../../supabase/phase1-isolated/20261120161110_dms_agent_center_controls.sql
\ir native-worker-commit/sharepoint-binding-fixture.native.sql
\ir sharepoint-worker-commit-fixture.native.sql
\ir ../../supabase/migrations/20261017144319_f07_verified_temporary_uploads.sql
\ir ../../supabase/migrations/20261017183329_f07_stable_single_upload_admission.sql
\ir ../../supabase/migrations/20261025065803_dms_explicit_upload_company.sql
\ir native-worker-commit/20261118170900_agent_continuous_pdf_intake.sql
\ir native-worker-commit/20261119031500_agent_document_duplicate_review.sql
\ir ../../supabase/phase1-isolated/20261123100500_dms_agent_center_sharepoint_binding.sql
\ir sharepoint-worker-authority-fixture.native.sql
\ir ../../supabase/phase1-isolated/20261123101000_dms_sharepoint_intake_origin.sql
\ir ../../supabase/phase1-isolated/20261123102000_dms_sharepoint_intake_storage.sql
\ir ../../supabase/phase1-isolated/20261123103000_dms_sharepoint_intake_worker_commit.sql

-- Add columns consumed by the exact BR1 RPCs that are outside the smaller worker fixture.
ALTER TABLE public.owner_companies ADD COLUMN company_code text;
ALTER TABLE public.branches ADD COLUMN branch_code text;
ALTER TABLE public.dms_upload_sessions ADD COLUMN batch_id bigint, ADD COLUMN approve_run_id bigint,
  ADD COLUMN discarded_at timestamptz;
ALTER TABLE public.dms_ai_extraction_results ADD PRIMARY KEY (id);
ALTER TABLE erp_private.f07_intake_sources ADD COLUMN object_id uuid, ADD COLUMN object_version text,
  ADD COLUMN object_updated_at timestamptz, ADD COLUMN sha256 text, ADD COLUMN source jsonb;
CREATE TABLE erp_private.notification_events (id bigint PRIMARY KEY);
CREATE TABLE public.erp_ai_provider_configs (id bigint PRIMARY KEY, config_code text, provider_type text,
  model_id text, updated_at timestamptz, is_enabled boolean, is_active boolean, deleted_at timestamptz);

CREATE FUNCTION erp_private.f07_intake_source_row(s public.dms_upload_sessions) RETURNS jsonb
LANGUAGE sql IMMUTABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT jsonb_build_object('id',s.id,'name',s.original_filename,'mime',s.mime_type,'size',s.file_size_bytes,
    'sha256',s.sha256_hash,'path',s.temp_storage_path,'owner',s.uploaded_by,'company',s.owning_company_id,
    'branch',s.owning_branch_id,'expiry',s.expires_at)
$$;
CREATE FUNCTION erp_private.ai_mod04_profile_grant(p_profile bigint,p_code text,p_company bigint,p_branch bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles u JOIN public.role_permissions r ON r.role_id=u.role_id
    JOIN public.permissions p ON p.id=r.permission_id WHERE u.user_profile_id=p_profile AND u.is_active
      AND p.is_active AND p.permission_code=p_code AND u.owner_company_id=p_company AND u.branch_id=p_branch)
$$;
CREATE FUNCTION erp_private.ai_mod04_lock_profile_authority(p_profile bigint) RETURNS void
LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  PERFORM 1 FROM public.user_roles u WHERE u.user_profile_id=p_profile FOR SHARE;
END $$;

\ir ../../supabase/phase1-isolated/20261123124000_dms_sharepoint_br1_supervised_review.sql

-- Seed one processing claim and one historic publication before the new migration.
UPDATE public.owner_companies SET company_code='ALGT' WHERE id=1;
UPDATE public.branches SET branch_code='BR1' WHERE id=11;
UPDATE public.user_roles SET branch_id=11 WHERE user_profile_id=101;
INSERT INTO public.permissions VALUES (23,'notifications.view',true);
INSERT INTO public.role_permissions VALUES (33,10,23);
INSERT INTO public.user_roles VALUES (42,103,10,1,11,true);
INSERT INTO erp_private.dms_agent_center_controls (company_id,branch_id,agent_key,enabled,mode,worker_bound)
  VALUES (1,11,'dms.intake',true,'execute',true);
INSERT INTO erp_private.agent_pdf_policy (connection_id,company_id,actor_id,officer_id,from_time,enabled)
  SELECT id,1,101,103,now()-interval '1 day',true FROM erp_private.agent_connections;
INSERT INTO erp_private.dms_sharepoint_br1_review_scope
  SELECT id,1,11,101,103,'synthetic','version-1',repeat('a',64),now()+interval '1 hour' FROM erp_private.agent_connections;
INSERT INTO public.dms_upload_sessions(id,session_code,status,intake_status,original_filename,mime_type,file_size_bytes,
  sha256_hash,temp_storage_path,uploaded_by,owning_company_id,owning_branch_id,expires_at,updated_at) OVERRIDING SYSTEM VALUE
  SELECT s,'BR1 fixture','uploaded','ai_processing','synthetic.pdf','application/pdf',12,repeat('a',64),
    'sessions/fixture-'||s||'/synthetic.pdf',101,1,11,now()+interval '1 hour','2026-11-23Z' FROM generate_series(1,2) s;
INSERT INTO public.dms_ai_extraction_results(id,upload_session_id) VALUES (301,2);
INSERT INTO public.dms_review_queue(id,upload_session_id,ai_result_id) OVERRIDING SYSTEM VALUE VALUES (302,2,301);
INSERT INTO erp_private.notification_events VALUES (303);
INSERT INTO erp_private.agent_pdf_work(connection_id,item_id,version,operation_id,company_id,actor_id,sha256,lease_token,lease_until)
  SELECT i.connection_id,i.item_id,i.version,('30000000-0000-4000-8000-00000000000'||right(i.connection_id::text,1))::uuid,
    1,101,repeat('a',64),('40000000-0000-4000-8000-00000000000'||right(i.connection_id::text,1))::uuid,now()+interval '1 hour'
  FROM erp_private.agent_source_items i;
INSERT INTO storage.objects
  SELECT ('50000000-0000-4000-8000-00000000000'||s.id)::uuid,'verified-object',s.updated_at,
    '{"size":"12","mimetype":"application/pdf"}','dms-temp',s.temp_storage_path FROM public.dms_upload_sessions s;
INSERT INTO erp_private.f07_intake_sources
  SELECT s.id,o.id,o.version,o.updated_at,s.sha256_hash,erp_private.f07_intake_source_row(s)
  FROM public.dms_upload_sessions s JOIN storage.objects o ON o.name=s.temp_storage_path;
INSERT INTO erp_private.dms_sharepoint_intake_origins
  SELECT w.operation_id,s.id,w.connection_id,w.item_id,w.version,101,1,11,s.original_filename,s.sha256_hash,12,s.temp_storage_path
  FROM public.dms_upload_sessions s JOIN erp_private.agent_pdf_work w ON right(w.operation_id::text,1)=s.id::text;
INSERT INTO erp_private.dms_sharepoint_intake_authority
  SELECT operation_id,lease_token,'20000000-0000-4000-8000-000000000101' FROM erp_private.agent_pdf_work;
INSERT INTO erp_private.dms_sharepoint_br1_review_state(operation_id,upload_session_id,officer_id,object_id,
  object_version,object_updated_at,attempt_id,lease_token,processing_revision)
  SELECT w.operation_id,s.id,103,o.id,o.version,o.updated_at,('60000000-0000-4000-8000-00000000000'||s.id)::uuid,
    w.lease_token,s.updated_at
  FROM erp_private.agent_pdf_work w JOIN erp_private.dms_sharepoint_intake_origins i USING(operation_id)
  JOIN public.dms_upload_sessions s ON s.id=i.upload_session_id JOIN storage.objects o ON o.name=s.temp_storage_path;
UPDATE erp_private.dms_sharepoint_br1_review_state SET result_id=301,review_id=302,notification_event_id=303,
  output_sha256=encode(sha256(convert_to('{"job": {}, "result": {}}','UTF8')),'hex') WHERE upload_session_id=2;
UPDATE erp_private.agent_pdf_work SET status='review_pending',session_id=2,review_id=302,lease_token=NULL,lease_until=NULL
  WHERE operation_id='30000000-0000-4000-8000-000000000002';
INSERT INTO public.erp_ai_provider_configs VALUES (3,'DEFAULT_DMS_CLASSIFIER','openai','synthetic-model','2026-11-23Z',true,true,NULL);
INSERT INTO public.dms_document_types VALUES (16,'LABOUR_CARD',true,NULL);

\ir ../../supabase/phase1-isolated/20261124094500_dms_sharepoint_br1_provider_allowance.sql

CREATE FUNCTION pg_temp.expect_error(command text,expected text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  BEGIN EXECUTE command;
  EXCEPTION WHEN OTHERS THEN
    IF SQLSTATE=expected THEN RETURN; END IF;
    RAISE;
  END;
  RAISE EXCEPTION 'Expected SQLSTATE %',expected;
END $$;
CREATE FUNCTION pg_temp.reserve(p_lease uuid DEFAULT '40000000-0000-4000-8000-000000000001',
  p_attempt uuid DEFAULT '60000000-0000-4000-8000-000000000001',p_model text DEFAULT 'synthetic-model',
  p_prompt text DEFAULT 'v3.7-source-dates',p_actor bigint DEFAULT 101,
  p_session uuid DEFAULT '20000000-0000-4000-8000-000000000101',
  p_claim_at timestamptz DEFAULT '2026-11-23Z') RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.f07_reserve_sharepoint_worker_provider_attempt('30000000-0000-4000-8000-000000000001',1,
    p_lease,p_actor,p_session,p_attempt,p_claim_at,'openai',3,'2026-11-23Z',p_model,p_prompt)
$$;

SET request.jwt.claim.role='service_role';
SET ROLE service_role;
DO $$
DECLARE receipt jsonb;
BEGIN
  receipt:=public.f07_publish_sharepoint_worker_review('30000000-0000-4000-8000-000000000002',2,
    '40000000-0000-4000-8000-000000000002',101,'20000000-0000-4000-8000-000000000101',
    '60000000-0000-4000-8000-000000000002','2026-11-23Z','{"job":{},"result":{}}');
  IF NOT receipt @> '{"state":"review_pending","resultId":301,"reviewId":302,"notificationEventId":303}' THEN
    RAISE EXCEPTION 'Historical publication receipt changed';
  END IF;
  IF has_table_privilege('erp_private.dms_sharepoint_br1_provider_attempts','INSERT')
    OR has_table_privilege('erp_private.dms_sharepoint_br1_provider_allowances','UPDATE')
    OR has_function_privilege('erp_private.f07_publish_sharepoint_worker_review(uuid,bigint,uuid,bigint,uuid,uuid,timestamptz,jsonb)','EXECUTE') THEN
    RAISE EXCEPTION 'Runtime can bypass the provider allowance';
  END IF;
END $$;
SELECT pg_temp.expect_error('SELECT pg_temp.reserve()', '42501');
SELECT pg_temp.expect_error($$SELECT public.f07_publish_sharepoint_worker_review('30000000-0000-4000-8000-000000000001',1,
  '40000000-0000-4000-8000-000000000001',101,'20000000-0000-4000-8000-000000000101',
  '60000000-0000-4000-8000-000000000001','2026-11-23Z','{"job":{},"result":{}}')$$, 'PT409');
RESET ROLE;

INSERT INTO erp_private.dms_sharepoint_br1_provider_allowances
  VALUES ('30000000-0000-4000-8000-000000000001',3,'2026-11-23Z','synthetic-model','v3.7-source-dates',1,now()+interval '1 hour');
SET ROLE authenticated;
SELECT pg_temp.expect_error('SELECT pg_temp.reserve()', '42501');
RESET ROLE;
SET ROLE service_role;
SELECT pg_temp.expect_error($$SELECT pg_temp.reserve(p_model=>'other-model')$$, '42501');
SELECT pg_temp.expect_error($$SELECT pg_temp.reserve(p_prompt=>'wrong-prompt')$$, '42501');
SELECT pg_temp.expect_error($$SELECT pg_temp.reserve(p_actor=>102)$$, '42501');
SELECT pg_temp.expect_error($$SELECT pg_temp.reserve(p_session=>'20000000-0000-4000-8000-000000000102')$$, '42501');
RESET ROLE;
UPDATE public.erp_ai_provider_configs SET updated_at='2026-11-24Z' WHERE id=3;
SELECT pg_temp.expect_error('SELECT pg_temp.reserve()', '42501');
UPDATE public.erp_ai_provider_configs SET updated_at='2026-11-23Z' WHERE id=3;
UPDATE public.user_roles SET branch_id=12 WHERE user_profile_id=103;
SELECT pg_temp.expect_error('SELECT pg_temp.reserve()', '42501');
UPDATE public.user_roles SET branch_id=11 WHERE user_profile_id=103;
UPDATE erp_private.dms_sharepoint_br1_provider_allowances SET expires_at=now()-interval '1 hour';
SELECT pg_temp.expect_error('SELECT pg_temp.reserve()', '42501');
UPDATE erp_private.dms_sharepoint_br1_provider_allowances SET expires_at=now()+interval '1 hour';

-- This statement commits independently. Discard its response and retry the same claim.
SET ROLE service_role;
DO $$
BEGIN
  IF NOT pg_temp.reserve() @> '{"sessionId":1,"attemptId":"60000000-0000-4000-8000-000000000001"}' THEN
    RAISE EXCEPTION 'Provider reservation changed the claim';
  END IF;
END $$;
SELECT pg_temp.expect_error('SELECT pg_temp.reserve()', 'PT409');
SELECT pg_temp.expect_error($$SELECT public.f07_publish_sharepoint_worker_review('30000000-0000-4000-8000-000000000001',1,
  '40000000-0000-4000-8000-000000000001',101,'20000000-0000-4000-8000-000000000101',
  '60000000-0000-4000-8000-000000000001','2026-11-23Z',
  '{"job":{"model":"wrong-model","provider":"openai","providerConfigId":3,"promptVersion":"v3.7-source-dates"},"result":{}}')$$, 'PT409');
RESET ROLE;

CREATE FUNCTION pg_temp.publish_matching() RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.f07_publish_sharepoint_worker_review('30000000-0000-4000-8000-000000000001',1,
    '40000000-0000-4000-8000-000000000001',101,'20000000-0000-4000-8000-000000000101',
    '60000000-0000-4000-8000-000000000001','2026-11-23Z',
    '{"job":{"model":"synthetic-model","provider":"openai","providerConfigId":3,"promptVersion":"v3.7-source-dates"},"result":{}}')
$$;
-- The unchanged config reaches the existing output validator (invalid synthetic body).
SELECT pg_temp.expect_error('SELECT pg_temp.publish_matching()', '22023');
UPDATE public.erp_ai_provider_configs SET is_enabled=false WHERE id=3;
SELECT pg_temp.expect_error('SELECT pg_temp.publish_matching()', 'PT409');
UPDATE public.erp_ai_provider_configs SET is_enabled=true,updated_at='2026-11-24Z' WHERE id=3;
SELECT pg_temp.expect_error('SELECT pg_temp.publish_matching()', 'PT409');
UPDATE public.erp_ai_provider_configs SET updated_at='2026-11-23Z' WHERE id=3;

UPDATE erp_private.agent_pdf_work SET lease_token='40000000-0000-4000-8000-000000000003'
  WHERE operation_id='30000000-0000-4000-8000-000000000001';
UPDATE erp_private.dms_sharepoint_intake_authority SET lease_token='40000000-0000-4000-8000-000000000003'
  WHERE operation_id='30000000-0000-4000-8000-000000000001';
SET ROLE service_role;
SELECT pg_temp.expect_error('SELECT pg_temp.reserve()', '42501');
WITH claim AS MATERIALIZED (SELECT public.f07_claim_sharepoint_worker_review('30000000-0000-4000-8000-000000000001',1,
  '40000000-0000-4000-8000-000000000003',101,'20000000-0000-4000-8000-000000000101') receipt)
SELECT receipt->>'attemptId' AS new_attempt,receipt->>'processingRevision' AS new_revision FROM claim \gset
SELECT pg_temp.expect_error(format('SELECT pg_temp.reserve(%L,%L,p_claim_at=>%L)',
  '40000000-0000-4000-8000-000000000003',:'new_attempt',:'new_revision'), 'PT409');
RESET ROLE;
DO $$ BEGIN
  IF (SELECT count(*) FROM erp_private.dms_sharepoint_br1_provider_attempts)<>1 THEN
    RAISE EXCEPTION 'A denial or claim replay changed the durable provider attempt count';
  END IF;
END $$;
\echo BR1 native provider allowance assertions passed.
