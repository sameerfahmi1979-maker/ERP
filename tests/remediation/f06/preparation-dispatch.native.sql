-- Append to the synthetic AI04 setup only. No provider calls or external connections.
SET session_replication_role=replica;
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status,created_by,updated_by)
 OVERRIDING SYSTEM VALUE SELECT x,'SYN-DOC-'||x,'SYNTHETIC parallel document',1001,1001,1001,1001,'internal','draft',1001,1001 FROM generate_series(1004,1006)x;
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE SELECT x,x,1,true FROM generate_series(1004,1006)x;
UPDATE public.dms_documents SET current_version_id=id WHERE id BETWEEN 1004 AND 1006;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,ocr_text,ocr_status,integrity_status)
 OVERRIDING SYSTEM VALUE SELECT x,x,x,'original','dms','synthetic/'||x||'.pdf','SYNTHETIC-'||x||'.pdf','application/pdf',10,repeat('a',64),'SYNTHETIC text','complete','verified' FROM generate_series(1004,1006)x;
INSERT INTO public.erp_ai_feature_flags(feature_code,feature_name,is_enabled) VALUES('DMS_AI_JOB_QUEUE_WORKER_ENABLED','SYNTHETIC worker',true) ON CONFLICT(feature_code) DO UPDATE SET is_enabled=true;
SET session_replication_role=origin;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001001","role":"authenticated","session_id":"00000000-0000-4000-8000-000000002001"}',false);
SET ROLE authenticated;
DO $$DECLARE doc bigint; snap text; result jsonb; BEGIN
 FOR doc IN SELECT unnest(ARRAY[1001,1002,1003,1004,1005,1006]) LOOP
  snap:=public.ai_mod04_preparation('snapshot',jsonb_build_object('documentId',doc))->>'snapshot';
  result:=public.ai_mod04_preparation('start',jsonb_build_object('documentId',doc,'requestId',gen_random_uuid(),'snapshot',snap,'mode','reuse_text','fileIds',jsonb_build_array(doc)));
  PERFORM pg_temp.ok((result->>'jobId')::bigint>0,'synthetic preparation admitted');
 END LOOP;
END $$;
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=6 FROM erp_private.dms_preparation_dispatch),'new requests admitted automatically');
-- Represent a pre-migration retained request. It must not be drained automatically.
DELETE FROM erp_private.dms_preparation_dispatch WHERE job_id=(SELECT id FROM public.dms_ai_job_queue WHERE related_document_id=1006);
SET ROLE authenticated;
SELECT pg_temp.ok(public.dms_preparation_progress(1006,(SELECT id FROM public.dms_ai_job_queue WHERE related_document_id=1006),false)->'progress'->>'admitted'='false','old request remains unscheduled');
SELECT pg_temp.error($q$SELECT public.dms_preparation_dispatch_worker('claim','{}')$q$,'42501','user cannot invoke worker');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);SET ROLE service_role;
SELECT pg_temp.ok(public.dms_preparation_dispatch_worker('heartbeat')->>'version'='1','worker heartbeat verifies schema');
SELECT set_config('test.claim1',public.dms_preparation_dispatch_worker('claim','{"workerId":"SYN-1"}')::text,false);
SELECT set_config('test.claim2',public.dms_preparation_dispatch_worker('claim','{"workerId":"SYN-2"}')::text,false);
SELECT set_config('test.claim3',public.dms_preparation_dispatch_worker('claim','{"workerId":"SYN-3"}')::text,false);
SELECT pg_temp.ok(jsonb_array_length(current_setting('test.claim1')::jsonb)=1 AND jsonb_array_length(current_setting('test.claim2')::jsonb)=1 AND jsonb_array_length(current_setting('test.claim3')::jsonb)=1,'three independent jobs claimed');
SELECT pg_temp.ok(public.dms_preparation_dispatch_worker('claim','{"workerId":"SYN-4"}')='[]'::jsonb,'fourth slot held globally');
SELECT pg_temp.ok(public.f07_ai_worker('claim','{"workerId":"SYN-other","limit":50,"preparationVersion":1}')='[]'::jsonb,'other worker route cannot bypass preparation capacity');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=3 AND count(DISTINCT related_document_id)=3 FROM public.dms_ai_job_queue WHERE job_status='running'),'three unique documents running');
SELECT pg_temp.ok((SELECT attempt_count=0 FROM public.dms_ai_job_queue WHERE related_document_id=1006),'historical job untouched');
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001001","role":"authenticated","session_id":"00000000-0000-4000-8000-000000002001"}',false);SET ROLE authenticated;
SELECT pg_temp.ok(public.dms_preparation_progress(1001,(current_setting('test.claim1')::jsonb->0->'job'->>'id')::bigint)->'progress'->>'stage'='reading','running shown as reading, not queued');
SELECT pg_temp.ok(public.dms_preparation_progress(1006,(SELECT id FROM public.dms_ai_job_queue WHERE related_document_id=1006),true)->'progress'->>'admitted'='true','explicit resume schedules same old request');
RESET ROLE;
SELECT pg_temp.ok((SELECT count(*)=6 FROM public.dms_ai_job_queue),'resume creates no duplicate job');
UPDATE public.dms_ai_job_queue SET job_status='completed' WHERE id=(current_setting('test.claim1')::jsonb->0->'job'->>'id')::bigint;
UPDATE public.dms_ai_job_queue SET job_status='completed' WHERE id=(current_setting('test.claim1')::jsonb->0->'job'->>'id')::bigint;
SELECT pg_temp.ok((SELECT count(*)=1 FROM public.erp_notifications WHERE notification_code LIKE 'DMS_PREPARATION_%'),'completion notification exactly once');
SELECT pg_temp.ok((SELECT bool_and(channel_in_app AND NOT channel_email AND source_entity_type='dms_documents' AND recipient_user_id=1001) FROM public.erp_notifications WHERE notification_code LIKE 'DMS_PREPARATION_%'),'notification is personal scoped in-app only');
UPDATE erp_private.f07_job_claims SET expires_at=clock_timestamp()-interval '1 second' WHERE job_id=(current_setting('test.claim2')::jsonb->0->'job'->>'id')::bigint;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);SET ROLE service_role;
SELECT public.dms_preparation_dispatch_worker('recover');
RESET ROLE;
SELECT pg_temp.ok((SELECT job_status='retry_scheduled' FROM public.dms_ai_job_queue WHERE id=(current_setting('test.claim2')::jsonb->0->'job'->>'id')::bigint),'expired claim safely retained for scheduled recovery');
SELECT jsonb_build_object('result','passed','assertions',current_setting('test.assertions')::int);
ROLLBACK;
