-- Rehearse only in a fresh disposable agent_center_controls_native database.
-- Pass -v install_extraction_control=true for the new migration or false for red.
-- Pass -v extraction_lock_fixture=true to stop with a reserved attempt for a
-- separate two-session lock rehearsal.
\set ON_ERROR_STOP on
\ir replay-sharepoint-br1-provider-allowance.native.sql
\if :install_extraction_control
\ir ../../supabase/phase1-isolated/20261124140300_dms_sharepoint_br1_extraction_control.sql
\endif

CREATE FUNCTION pg_temp.claim_extraction(p_lease uuid) RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.f07_claim_sharepoint_worker_review('30000000-0000-4000-8000-000000000001',1,
    p_lease,101,'20000000-0000-4000-8000-000000000101')
$$;
CREATE FUNCTION pg_temp.extraction_control(p_action text,p_revision bigint,p_request uuid) RETURNS jsonb
LANGUAGE sql AS $$
  SELECT public.dms_agent_center_control(1,11,'dms.extraction',p_action,p_revision,p_request,'Synthetic extraction control')
$$;
CREATE FUNCTION pg_temp.set_extraction_lease(p_lease uuid) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  UPDATE erp_private.agent_pdf_work SET lease_token=p_lease, lease_until=now()+interval '1 hour'
    WHERE operation_id='30000000-0000-4000-8000-000000000001';
  UPDATE erp_private.dms_sharepoint_intake_authority SET lease_token=p_lease
    WHERE operation_id='30000000-0000-4000-8000-000000000001';
END $$;

CREATE FUNCTION pg_temp.extraction_output() RETURNS jsonb LANGUAGE sql AS $$
  SELECT jsonb_build_object('job',jsonb_build_object('provider','openai','providerConfigId',3,
    'model','synthetic-model','promptVersion','v3.7-source-dates','inputTextHash',repeat('f',64),'durationMs',10),
    'result',jsonb_build_object('classificationConfidence','high','classificationScore',0.9,'title','Synthetic permit',
      'extractedFields','{}'::jsonb,'fieldConfidence','{}'::jsonb,'rawResponse',jsonb_build_object('preparation',
        jsonb_build_object('bundle','single','split','not_requested','sourceHash',repeat('a',64),'typeCode','LABOUR_CARD'))))
$$;
CREATE FUNCTION pg_temp.publish_extraction(p_lease uuid,p_attempt uuid,p_revision timestamptz,p_actor bigint DEFAULT 101)
RETURNS jsonb LANGUAGE sql AS $$
  SELECT public.f07_publish_sharepoint_worker_review('30000000-0000-4000-8000-000000000001',1,
    p_lease,p_actor,'20000000-0000-4000-8000-000000000101',p_attempt,p_revision,pg_temp.extraction_output())
$$;

DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM erp_private.dms_agent_center_controls WHERE agent_key='dms.extraction') THEN
    RAISE EXCEPTION 'Extraction control must not seed a binding';
  END IF;
END $$;
\if :install_extraction_control
DO $$ BEGIN
  IF has_function_privilege('service_role',
      'erp_private.dms_lock_sharepoint_br1_review(uuid,bigint,uuid,bigint,uuid,boolean)','EXECUTE')
    OR has_function_privilege('authenticated','erp_private.dms_sharepoint_br1_retire_extraction_lease()','EXECUTE')
    OR has_table_privilege('service_role','erp_private.dms_agent_center_controls','UPDATE') THEN
    RAISE EXCEPTION 'Runtime can bypass the scoped Extraction control';
  END IF;
END $$;
\endif
INSERT INTO erp_private.dms_agent_center_controls (company_id,branch_id,agent_key,enabled,mode,worker_bound)
  VALUES (1,11,'dms.extraction',true,'execute',true), (1,12,'dms.extraction',true,'execute',true);
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000002';
SET fixture.session_active='yes';
SET ROLE authenticated;
SELECT pg_temp.expect_error(
  $$SELECT pg_temp.extraction_control('pause',0,'90000000-0000-4000-8000-000000000010')$$,'42501');
RESET ROLE;
SET request.jwt.claim.sub='00000000-0000-4000-8000-000000000001';
SET fixture.session_active='yes';
SET ROLE authenticated;
SELECT pg_temp.extraction_control('pause',0,'90000000-0000-4000-8000-000000000001');
DO $$ BEGIN
  IF NOT public.dms_agent_center_control(1,11,'dms.extraction','inspect',NULL,NULL,NULL)
    @> '{"workerBound":true,"paused":true,"revision":1}' THEN
    RAISE EXCEPTION 'Scoped Agent Center could not inspect the paused Extraction control';
  END IF;
END $$;
RESET ROLE;

-- Simulate the newly claimed upload/ingress generation. This must remain
-- usable for exact Storage verification even while Extraction is paused.
\set lease '40000000-0000-4000-8000-000000000004'
SELECT pg_temp.set_extraction_lease(:'lease');
SET ROLE service_role;
SELECT pg_temp.expect_error(format('SELECT pg_temp.claim_extraction(%L)',:'lease'),'55000');
SELECT pg_temp.expect_error(format('SELECT pg_temp.reserve(%L)',:'lease'),'55000');
SELECT pg_temp.expect_error(format('SELECT pg_temp.publish_extraction(%L,%L,%L)',:'lease',
  '60000000-0000-4000-8000-000000000001','2026-11-23Z'),'55000');
DO $$ BEGIN
  IF NOT public.f07_accept_sharepoint_worker_pdf('30000000-0000-4000-8000-000000000001',1,
      '40000000-0000-4000-8000-000000000004',101,'20000000-0000-4000-8000-000000000101',
      '50000000-0000-4000-8000-000000000001','verified-object','2026-11-23Z') @> '{"sessionId":1}' THEN
    RAISE EXCEPTION 'Exact Storage read-back must remain available during extraction pause';
  END IF;
  IF NOT public.f07_publish_sharepoint_worker_review('30000000-0000-4000-8000-000000000002',2,
      '40000000-0000-4000-8000-000000000002',101,'20000000-0000-4000-8000-000000000101',
      '60000000-0000-4000-8000-000000000002','2026-11-23Z','{"job":{},"result":{}}')
      @> '{"state":"review_pending","resultId":301,"reviewId":302,"notificationEventId":303}' THEN
    RAISE EXCEPTION 'Exact historic completion must remain replayable during extraction pause';
  END IF;
END $$;
RESET ROLE;

DO $$ BEGIN
  IF (SELECT count(*) FROM erp_private.dms_sharepoint_br1_provider_attempts)<>1 THEN
    RAISE EXCEPTION 'Paused extraction consumed an attempt';
  END IF;
END $$;

UPDATE erp_private.dms_sharepoint_br1_provider_allowances SET max_attempts=3;
SET ROLE authenticated;
SELECT pg_temp.extraction_control('resume',1,'90000000-0000-4000-8000-000000000002');
RESET ROLE;
SET ROLE service_role;
SELECT receipt->>'attemptId' AS attempt,receipt->>'processingRevision' AS revision
FROM pg_temp.claim_extraction(:'lease') receipt \gset
SELECT pg_temp.reserve(:'lease',:'attempt',p_claim_at=>:'revision');
RESET ROLE;

\if :{?extraction_lock_fixture}
\if :extraction_lock_fixture
\echo BR1 extraction lock fixture ready.
\quit
\endif
\endif

-- A sibling branch's control cannot retire the lease or block this result.
UPDATE erp_private.dms_agent_center_controls SET paused=true,revision=revision+1
  WHERE company_id=1 AND branch_id=12 AND agent_key='dms.extraction';
SET ROLE service_role;
SELECT pg_temp.expect_error(format('SELECT pg_temp.reserve(%L,%L,p_claim_at=>%L)',
  :'lease',:'attempt',:'revision'),'PT409');
RESET ROLE;

SET ROLE authenticated;
SELECT pg_temp.extraction_control('pause',2,'90000000-0000-4000-8000-000000000003');
RESET ROLE;
SET ROLE service_role;
SELECT pg_temp.expect_error(format('SELECT pg_temp.publish_extraction(%L,%L,%L)',:'lease',:'attempt',:'revision'),'55000');
RESET ROLE;
SET ROLE authenticated;
SELECT pg_temp.extraction_control('resume',3,'90000000-0000-4000-8000-000000000004');
RESET ROLE;
SET ROLE service_role;
SELECT pg_temp.expect_error(format('SELECT pg_temp.claim_extraction(%L)',:'lease'),'42501');
SELECT pg_temp.expect_error(format('SELECT pg_temp.publish_extraction(%L,%L,%L)',:'lease',:'attempt',:'revision'),'42501');
RESET ROLE;

DO $$ BEGIN
  IF (SELECT count(*) FROM erp_private.dms_sharepoint_br1_provider_attempts)<>2
    OR EXISTS (SELECT 1 FROM public.dms_ai_extraction_results WHERE upload_session_id=1)
    OR EXISTS (SELECT 1 FROM public.dms_review_queue WHERE upload_session_id=1)
    OR (SELECT count(*) FROM erp_private.notification_events)<>1 THEN
    RAISE EXCEPTION 'A retired extraction attempted to publish or altered the reservation history';
  END IF;
END $$;

-- Extend the narrow historical replay fixture with the business row columns
-- the unchanged native publication path writes. The fixture trigger records
-- the notification event contract. External delivery is outside this test.
ALTER TABLE public.dms_upload_sessions ADD COLUMN review_status text;
ALTER TABLE public.dms_ai_extraction_jobs ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY,
  ADD COLUMN job_type text, ADD COLUMN provider text, ADD COLUMN model text, ADD COLUMN status text,
  ADD COLUMN run_source text, ADD COLUMN input_text_hash text, ADD COLUMN prompt_version text,
  ADD COLUMN provider_config_id bigint, ADD COLUMN created_by bigint, ADD COLUMN started_at timestamptz,
  ADD COLUMN completed_at timestamptz, ADD COLUMN duration_ms integer;
ALTER TABLE public.dms_ai_extraction_results ALTER COLUMN id ADD GENERATED ALWAYS AS IDENTITY,
  ADD COLUMN result_type text, ADD COLUMN classification_confidence text, ADD COLUMN classification_score numeric,
  ADD COLUMN classification_reason text, ADD COLUMN field_confidence_json jsonb, ADD COLUMN suggested_links_json jsonb,
  ADD COLUMN issue_date_suggestion date, ADD COLUMN expiry_date_suggestion date, ADD COLUMN suggested_title text,
  ADD COLUMN suggested_description text, ADD COLUMN raw_ocr_text text;
CREATE TABLE erp_private.dms_intake_publication_receipts (result_id bigint PRIMARY KEY,upload_session_id bigint,
  job_id bigint,actor_id bigint,claim_at timestamptz);
ALTER TABLE erp_private.notification_events ALTER COLUMN id ADD GENERATED BY DEFAULT AS IDENTITY,
  ADD COLUMN source_table text, ADD COLUMN source_id bigint, ADD COLUMN event_type text, ADD COLUMN actor_id bigint,
  ADD COLUMN source_snapshot jsonb;
CREATE FUNCTION pg_temp.fixture_publish_notice() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO erp_private.notification_events(source_table,source_id,event_type,actor_id,source_snapshot)
  VALUES ('dms_review_queue',NEW.id,'dms_review_queue_assigned',NEW.created_by,jsonb_build_object('assigned_to',NEW.assigned_to));
  RETURN NEW;
END $$;
CREATE TRIGGER fixture_publish_notice AFTER INSERT ON public.dms_review_queue
  FOR EACH ROW EXECUTE FUNCTION pg_temp.fixture_publish_notice();
CREATE FUNCTION public.f07_attest_intake_analysis(p_session bigint,p_actor bigint,p_auth_session uuid,
  p_result bigint,p_evidence jsonb,p_claim_at timestamptz) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.dms_upload_sessions s JOIN public.dms_ai_extraction_results r ON r.upload_session_id=s.id
    WHERE s.id=p_session AND s.uploaded_by=p_actor AND s.updated_at=p_claim_at AND r.id=p_result)
    OR NOT EXISTS (SELECT 1 FROM auth.sessions h JOIN public.user_profiles p ON h.user_id=p.auth_user_id
      WHERE p.id=p_actor AND h.id=p_auth_session) OR p_evidence->>'upload_session_id' IS DISTINCT FROM p_session::text THEN
    RAISE EXCEPTION 'Invalid synthetic attestation';
  END IF;
END $$;

\set lease '40000000-0000-4000-8000-000000000005'
SELECT pg_temp.set_extraction_lease(:'lease');
SET ROLE service_role;
SELECT receipt->>'attemptId' AS attempt,receipt->>'processingRevision' AS revision
  FROM pg_temp.claim_extraction(:'lease') receipt \gset
SELECT pg_temp.reserve(:'lease',:'attempt',p_claim_at=>:'revision');
SELECT pg_temp.publish_extraction(:'lease',:'attempt',:'revision') AS committed \gset
RESET ROLE;

SET ROLE authenticated;
SELECT pg_temp.extraction_control('pause',4,'90000000-0000-4000-8000-000000000005');
RESET ROLE;
SET ROLE service_role;
SELECT pg_temp.publish_extraction(:'lease',:'attempt',:'revision') AS replayed \gset
SELECT pg_temp.expect_error(format('SELECT pg_temp.publish_extraction(%L,%L,%L,102)',:'lease',:'attempt',:'revision'),'42501');
RESET ROLE;
SELECT set_config('fixture.extraction_committed',:'committed',false);
SELECT set_config('fixture.extraction_replayed',:'replayed',false);
DO $$ BEGIN
  IF current_setting('fixture.extraction_committed') IS DISTINCT FROM current_setting('fixture.extraction_replayed')
    OR (SELECT count(*) FROM erp_private.dms_sharepoint_br1_provider_attempts)<>3
    OR (SELECT count(*) FROM public.dms_ai_extraction_results WHERE upload_session_id=1)<>1
    OR (SELECT count(*) FROM public.dms_review_queue WHERE upload_session_id=1)<>1
    OR (SELECT count(*) FROM erp_private.notification_events WHERE source_table='dms_review_queue')<>1
    OR (SELECT count(*) FROM erp_private.dms_intake_publication_receipts WHERE upload_session_id=1)<>1 THEN
    RAISE EXCEPTION 'Expected exactly one current result, review, event and durable replay receipt';
  END IF;
END $$;
\echo BR1 native extraction control assertions passed.
