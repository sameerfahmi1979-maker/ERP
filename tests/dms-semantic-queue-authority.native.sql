-- Run in a disconnected schema-only rehearsal. All synthetic fixture writes roll back.
BEGIN;
CREATE FUNCTION pg_temp.expect(p_ok boolean,p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',p_label; END IF;
END $$;
CREATE FUNCTION pg_temp.expect_error(p_sql text,p_state text,p_label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE caught text;
BEGIN
 BEGIN EXECUTE p_sql; EXCEPTION WHEN OTHERS THEN caught:=SQLSTATE; END;
 PERFORM pg_temp.expect(caught=p_state,p_label||' expected '||p_state||' got '||coalesce(caught,'success'));
END $$;
CREATE FUNCTION pg_temp.job_input(p_document bigint,p_source text,p_key text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('jobType','semantic_document_index','relatedDocumentId',p_document,
  'payload',jsonb_build_object('documentId',p_document,'source',p_source,'forceRebuild',false),
  'idempotencyKey',p_key)
$$;
CREATE FUNCTION pg_temp.worker_input(p_parent bigint,p_token uuid,p_document bigint,p_source text,p_key text) RETURNS jsonb
LANGUAGE sql AS $$
 SELECT jsonb_build_object('parentId',p_parent,'parentToken',p_token,'input',pg_temp.job_input(p_document,p_source,p_key))
$$;
SET LOCAL session_replication_role=replica;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-000000024001','queue-editor@example.invalid'),
 ('00000000-0000-4000-8000-000000024002','queue-branch-admin@example.invalid'),
 ('00000000-0000-4000-8000-000000024003','queue-global-admin@example.invalid');
INSERT INTO auth.sessions(id,user_id,created_at,updated_at) VALUES
 ('00000000-0000-4000-8000-000000025001','00000000-0000-4000-8000-000000024001',now(),now()),
 ('00000000-0000-4000-8000-000000025002','00000000-0000-4000-8000-000000024002',now(),now()),
 ('00000000-0000-4000-8000-000000025003','00000000-0000-4000-8000-000000024003',now(),now());
INSERT INTO public.user_profiles(id,auth_user_id,user_code,full_name,status,must_change_password) OVERRIDING SYSTEM VALUE VALUES
 (24001,'00000000-0000-4000-8000-000000024001','SYN-QUEUE-EDITOR','Synthetic queue editor','active',false),
 (24002,'00000000-0000-4000-8000-000000024002','SYN-QUEUE-BRANCH','Synthetic queue branch administrator','active',false),
 (24003,'00000000-0000-4000-8000-000000024003','SYN-QUEUE-GLOBAL','Synthetic queue global administrator','active',false);
INSERT INTO public.roles(id,role_code,role_name,is_active) OVERRIDING SYSTEM VALUE VALUES
 (24001,'dms_manager','Synthetic queue editor and reviewer',true),
 (24002,'syn_queue_admin','Synthetic DMS administrator grant',true);
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code)
 SELECT code,code,'DMS','manage' FROM unnest(ARRAY['dms.documents.view','dms.documents.edit','dms.admin','dms.documents.preview','dms.documents.review_ai']) code
 ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
 SELECT 24001,id FROM public.permissions WHERE permission_code IN ('dms.documents.view','dms.documents.edit','dms.documents.preview','dms.documents.review_ai')
 UNION ALL SELECT 24002,id FROM public.permissions WHERE permission_code='dms.admin';
INSERT INTO public.owner_companies(id,company_code,legal_name_en,status) OVERRIDING SYSTEM VALUE VALUES
 (24001,'SYN_QUEUE_A','Synthetic queue company A','active'),
 (24002,'SYN_QUEUE_B','Synthetic queue company B','active');
INSERT INTO public.branches(id,owner_company_id,branch_code,branch_name_en,status) OVERRIDING SYSTEM VALUE VALUES
 (24001,24001,'SYN_Q_A1','Synthetic queue branch A1','active'),
 (24002,24001,'SYN_Q_A2','Synthetic queue branch A2','active'),
 (24003,24002,'SYN_Q_B1','Synthetic queue branch B1','active');
INSERT INTO public.user_roles(id,user_profile_id,role_id,owner_company_id,branch_id,is_active) OVERRIDING SYSTEM VALUE VALUES
 (24001,24001,24001,24001,24001,true),
 (24002,24002,24002,24001,24001,true),
 (24003,24003,24002,NULL,NULL,true);
INSERT INTO public.dms_document_categories(id,category_code,name_en,is_active) OVERRIDING SYSTEM VALUE VALUES
 (24001,'SYN_QUEUE','Synthetic queue category',true);
INSERT INTO public.dms_document_types(id,type_code,name_en,category_id,is_active) OVERRIDING SYSTEM VALUE VALUES
 (24001,'SYN_QUEUE','Synthetic queue type',24001,true);
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status) OVERRIDING SYSTEM VALUE VALUES
 (24001,'SYN-Q-A1','Synthetic queue document A1',24001,24001,24001,24001,'internal','draft'),
 (24002,'SYN-Q-A2','Synthetic queue document A2',24001,24001,24001,24002,'internal','draft'),
 (24003,'SYN-Q-B1','Synthetic queue document B1',24001,24001,24002,24003,'internal','draft'),
 (24004,'SYN-Q-A1-HR','Synthetic queue confidential document',24001,24001,24001,24001,'hr','draft'),
 (24005,'SYN-Q-REREVIEW','Synthetic queue re-review source',24001,24001,24001,24001,'internal','draft'),
 (24006,'SYN-Q-INTAKE','Synthetic queue saved-intake source',24001,24001,24001,24001,'internal','draft');
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE VALUES
 (24005,24005,1,true),(24006,24006,1,true);
UPDATE public.dms_documents SET current_version_id=id WHERE id IN (24005,24006);
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,ocr_text,ocr_status,integrity_status)
 OVERRIDING SYSTEM VALUE VALUES
 (24005,24005,24005,'original','dms-documents','synthetic/queue-rereview.pdf','Synthetic re-review.pdf','application/pdf',16,repeat('a',64),'Synthetic validated re-review text.','complete','verified'),
 (24006,24006,24006,'original','dms-documents','synthetic/queue-intake.pdf','Synthetic intake.pdf','application/pdf',16,repeat('b',64),'Synthetic validated saved intake text.','complete','verified');
INSERT INTO public.dms_document_content(document_id,content_text)
 VALUES(24001,'Synthetic indexed source.'),(24002,'Synthetic sibling branch source.'),
 (24005,'Synthetic retained older text.'),(24006,'Synthetic retained older text.');
INSERT INTO public.dms_document_content_chunks(document_id,content_id,chunk_index,chunk_text,chunk_hash,content_hash,char_count)
 SELECT document_id,id,0,content_text,encode(sha256(convert_to(content_text,'UTF8')),'hex'),
  encode(sha256(convert_to(content_text,'UTF8')),'hex'),length(content_text)
 FROM public.dms_document_content WHERE document_id IN (24005,24006);
INSERT INTO public.dms_upload_sessions(id,session_code,status,intake_status,original_filename,mime_type,file_size_bytes,document_id,approve_run_id,approve_status,reviewed_by)
 OVERRIDING SYSTEM VALUE VALUES
 (24001,'synthetic-queue-session','completed','approved','synthetic.pdf','application/pdf',16,24001,24001,'completed',24001),
 (24002,'synthetic-queue-batch','completed','approved','synthetic-batch.pdf','application/pdf',16,24002,24002,'completed',24003);
INSERT INTO public.dms_approve_runs(id,upload_session_id,document_id,run_key,status,started_by,completed_at)
 OVERRIDING SYSTEM VALUE VALUES
 (24001,24001,24001,'synthetic-queue-approve-run','completed',24001,clock_timestamp()),
 (24002,24002,24002,'synthetic-queue-batch-approve-run','completed',24003,clock_timestamp());
INSERT INTO public.erp_ai_feature_flags(feature_code,feature_name,is_enabled)
 SELECT code,code,true FROM unnest(ARRAY['DMS_AI_JOB_QUEUE','DMS_SEMANTIC_INDEX_QUEUE','DMS_SEMANTIC_CHUNKING']) code
 ON CONFLICT(feature_code) DO UPDATE SET is_enabled=true;
SET LOCAL session_replication_role=origin;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000024001","role":"authenticated","session_id":"00000000-0000-4000-8000-000000025001"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect(public.f03_current_session_valid() AND public.f03_has_document_permission(24001,'dms.documents.edit'),'editor has a current native session and scoped edit');
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_job_control('enqueue',pg_temp.job_input(24001,'manual_rebuild','synthetic-queue-editor-manual'))$q$,'42501','edit authority alone cannot enqueue a manual rebuild');
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_job_control('enqueue',pg_temp.job_input(24001,'admin_backfill','synthetic-queue-editor-backfill'))$q$,'42501','edit authority alone cannot enqueue a backfill');
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_job_control('enqueue',pg_temp.job_input(24001,'post_approve_orchestration','synthetic-queue-forged-parent'))$q$,'42501','authenticated caller cannot claim a trusted orchestration source');
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_job_control('enqueue',pg_temp.job_input(24001,'content_sync_trigger','synthetic-queue-forged-review'))$q$,'42501','authenticated caller cannot claim a trusted content-sync source');
SELECT set_config('test.queue.nonsemantic',public.f07_ai_job_control('enqueue','{"jobType":"ai_re_extraction","relatedDocumentId":24001,"payload":{"documentId":24001,"source":"admin_manual_retry"},"idempotencyKey":"synthetic-queue-legacy-type"}')->>'jobId',true);
SELECT pg_temp.expect(current_setting('test.queue.nonsemantic')::bigint>0,'existing edit-authorized non-semantic path remains callable');
SELECT set_config('test.queue.parent',public.f07_ai_job_control('enqueue',
 '{"jobType":"post_approve_orchestration","relatedDocumentId":24001,"relatedUploadSessionId":24001,"relatedApproveRunId":24001,"payload":{"documentId":24001,"source":"single_file_approve","uploadSessionId":24001,"approveRunId":24001,"sessionCode":"synthetic-queue-session"},"idempotencyKey":"post_approve_orchestration:24001:24001"}')->>'jobId',true);
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000024002","role":"authenticated","session_id":"00000000-0000-4000-8000-000000025002"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_job_control('enqueue',pg_temp.job_input(24002,'manual_rebuild','synthetic-queue-sibling'))$q$,'42501','branch administrator cannot rebuild for a sibling branch');
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_job_control('enqueue',pg_temp.job_input(24003,'manual_rebuild','synthetic-queue-other-company'))$q$,'42501','branch administrator cannot rebuild for a different company');
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_job_control('enqueue',pg_temp.job_input(24004,'manual_rebuild','synthetic-queue-confidential'))$q$,'42501','branch administrator cannot rebuild confidential source without clearance');
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_job_control('enqueue',pg_temp.job_input(24001,'admin_backfill','synthetic-queue-branch-backfill'))$q$,'42501','branch administrator cannot enqueue a global backfill');
SELECT set_config('test.queue.manual',(public.f07_ai_job_control('enqueue',pg_temp.job_input(24001,'manual_rebuild','synthetic-queue-admin-manual'))->>'jobId'),true);
SELECT pg_temp.expect((public.f07_ai_job_control('enqueue',pg_temp.job_input(24001,'manual_rebuild','synthetic-queue-admin-manual'))->>'jobId')=current_setting('test.queue.manual'),'same authorized manual admission replays the retained job');
RESET ROLE;

SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000024003","role":"authenticated","session_id":"00000000-0000-4000-8000-000000025003"}',true);
SET LOCAL ROLE authenticated;
SELECT set_config('test.queue.backfill',(public.f07_ai_job_control('enqueue',pg_temp.job_input(24001,'admin_backfill','synthetic-queue-global-backfill'))->>'jobId'),true);
RESET ROLE;
UPDATE public.dms_ai_job_queue SET job_status='failed' WHERE id=ANY(ARRAY[current_setting('test.queue.manual')::bigint,current_setting('test.queue.backfill')::bigint]);
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000024002","role":"authenticated","session_id":"00000000-0000-4000-8000-000000025002"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_job_control('retry',jsonb_build_object('jobId',current_setting('test.queue.backfill')::bigint))$q$,'42501','scoped administrator cannot retry an original global backfill');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000024001","role":"authenticated","session_id":"00000000-0000-4000-8000-000000025001"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_job_control('retry',jsonb_build_object('jobId',current_setting('test.queue.manual')::bigint))$q$,'42501','an editor cannot retry an administrator rebuild');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000024003","role":"authenticated","session_id":"00000000-0000-4000-8000-000000025003"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect((public.f07_ai_job_control('retry',jsonb_build_object('jobId',current_setting('test.queue.manual')::bigint))->>'success')::boolean,'a different currently authorized administrator can retry the same source');
RESET ROLE;

SELECT pg_temp.expect(NOT has_function_privilege('authenticated','erp_private.dms_semantic_job_enqueue(jsonb,jsonb,text,bigint)','EXECUTE')
 AND NOT has_function_privilege('service_role','erp_private.dms_semantic_job_enqueue(jsonb,jsonb,text,bigint)','EXECUTE')
 AND NOT has_function_privilege('authenticated','erp_private.dms_semantic_enqueue_reviewed_content(bigint)','EXECUTE')
 AND NOT has_function_privilege('service_role','erp_private.dms_semantic_enqueue_reviewed_content(bigint)','EXECUTE'),'trusted admission helpers are owner-only');
UPDATE public.dms_ai_job_queue SET job_status='running' WHERE id=ANY(ARRAY[
 current_setting('test.queue.manual')::bigint,current_setting('test.queue.parent')::bigint,current_setting('test.queue.nonsemantic')::bigint]);
UPDATE erp_private.f07_job_claims SET token='00000000-0000-4000-8000-000000026001',expires_at=clock_timestamp()+interval '5 minutes'
 WHERE job_id=ANY(ARRAY[current_setting('test.queue.manual')::bigint,current_setting('test.queue.parent')::bigint,current_setting('test.queue.nonsemantic')::bigint]);
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.expect((public.f07_ai_worker('assert',jsonb_build_object('jobId',current_setting('test.queue.manual')::bigint,
 'token','00000000-0000-4000-8000-000000026001'))->>'success')::boolean,'worker assertion uses the current authorized retry actor');
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_worker('enqueue_child',pg_temp.worker_input(current_setting('test.queue.nonsemantic')::bigint,
 '00000000-0000-4000-8000-000000026001',24001,'post_approve_orchestration','semantic_document_index:doc:24001'))$q$,'42501','a live unrelated job token cannot mint an orchestration child');
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_worker('enqueue_child',pg_temp.worker_input(current_setting('test.queue.parent')::bigint,
 '00000000-0000-4000-8000-000000026002',24001,'post_approve_orchestration','synthetic-queue-stale-parent'))$q$,'PT409','a stale token cannot mint an orchestration child');
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_worker('enqueue_child',pg_temp.worker_input(current_setting('test.queue.parent')::bigint,
 '00000000-0000-4000-8000-000000026001',24002,'post_approve_orchestration','synthetic-queue-foreign-child'))$q$,'42501','an approval parent cannot mint a child for another document');
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_worker('enqueue_child',pg_temp.worker_input(current_setting('test.queue.parent')::bigint,
 '00000000-0000-4000-8000-000000026001',24001,'post_approve_orchestration','semantic_document_index:doc:24001'))$q$,'42501','parent must retain proof of its content-sync step');
SELECT public.f07_ai_worker('step_save',jsonb_build_object('jobId',current_setting('test.queue.parent')::bigint,
 'token','00000000-0000-4000-8000-000000026001','step','content_sync','status','skipped'));
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_worker('enqueue_child',pg_temp.worker_input(current_setting('test.queue.parent')::bigint,
 '00000000-0000-4000-8000-000000026001',24001,'post_approve_orchestration','semantic_document_index:doc:24001'))$q$,'42501',
 'editor cannot mint a semantic child from editable approval rows and a live worker claim');
RESET ROLE;
INSERT INTO erp_private.ai_approval_plans(actor_id,operation_id,request_hash,request_json,upload_session_id,
 reference_id,document_id,document_no,approve_run_id,storage_path,result,completed_at)
 VALUES(24001,'00000000-0000-4000-8000-000000027003',repeat('a',64),'{}',24001,24001,24001,'SYN-Q-A1',24001,'synthetic/approval.pdf',
 '{"documentId":24001,"upload_session_id":24001,"approve_run_id":24001,"operation_id":"00000000-0000-4000-8000-000000027003","completed":true}',clock_timestamp());
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_worker('enqueue_child',pg_temp.worker_input(current_setting('test.queue.parent')::bigint,
 '00000000-0000-4000-8000-000000026001',24001,'manual_rebuild','semantic_document_index:doc:24001'))$q$,'42501','a worker parent cannot claim a manual source');
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_worker('enqueue_child',pg_temp.worker_input(current_setting('test.queue.parent')::bigint,
 '00000000-0000-4000-8000-000000026001',24001,'post_approve_orchestration','synthetic-duplicate-child-key'))$q$,'42501',
 'a proven worker cannot create repeat children by choosing a different operation key');
SELECT set_config('test.queue.child',public.f07_ai_worker('enqueue_child',pg_temp.worker_input(current_setting('test.queue.parent')::bigint,
 '00000000-0000-4000-8000-000000026001',24001,'post_approve_orchestration','semantic_document_index:doc:24001'))->>'jobId',true);
SELECT pg_temp.expect((public.f07_ai_worker('enqueue_child',pg_temp.worker_input(current_setting('test.queue.parent')::bigint,
 '00000000-0000-4000-8000-000000026001',24001,'post_approve_orchestration','semantic_document_index:doc:24001'))->>'jobId')=current_setting('test.queue.child'),
 'same approved parent replays its exact semantic child without claiming its queue row');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000024002","role":"authenticated","session_id":"00000000-0000-4000-8000-000000025002"}',true);
SET LOCAL ROLE authenticated;
SELECT set_config('test.queue.static.manual',public.f07_ai_job_control('enqueue',
 pg_temp.job_input(24001,'manual_rebuild','semantic_document_index:doc:24001'))->>'jobId',true);
SELECT pg_temp.expect(current_setting('test.queue.static.manual') IS DISTINCT FROM current_setting('test.queue.child'),
 'manual rebuild creates a distinct operation from its automatic predecessor with the same application key');
SELECT pg_temp.expect(public.f07_ai_job_control('enqueue',
 pg_temp.job_input(24001,'manual_rebuild','semantic_document_index:doc:24001'))->>'jobId'=current_setting('test.queue.static.manual'),
 'repeating exactly the same manual operation with the shared application key reuses its receipt');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000024003","role":"authenticated","session_id":"00000000-0000-4000-8000-000000025003"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect(public.f07_ai_job_control('enqueue',
 pg_temp.job_input(24001,'admin_backfill','semantic_document_index:doc:24001'))->>'jobId' NOT IN
 (current_setting('test.queue.child'),current_setting('test.queue.static.manual')),
 'global backfill can use the same application key for a distinct source and actor');
SELECT set_config('test.queue.before_revision',public.f07_ai_job_control('enqueue',
 pg_temp.job_input(24002,'manual_rebuild','semantic_document_index:doc:24002'))->>'jobId',true);
RESET ROLE;
UPDATE public.dms_document_content SET content_text='Synthetic sibling branch revised source.' WHERE document_id=24002;
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect(public.f07_ai_job_control('enqueue',
 pg_temp.job_input(24002,'manual_rebuild','semantic_document_index:doc:24002'))->>'jobId'<>current_setting('test.queue.before_revision'),
 'a changed exact content source gets a fresh operation with the same application key');
SELECT set_config('test.queue.batch_parent',public.f07_ai_job_control('enqueue',
 '{"jobType":"post_approve_orchestration","relatedDocumentId":24002,"relatedUploadSessionId":24002,"relatedApproveRunId":24002,"payload":{"documentId":24002,"source":"batch_finalize","uploadSessionId":24002,"approveRunId":24002,"sessionCode":"synthetic-queue-batch"},"idempotencyKey":"post_approve_orchestration:24002:24002"}')->>'jobId',true);
RESET ROLE;
INSERT INTO erp_private.f07_batch_finalizations(upload_session_id,operation_id,actor_id,request,payload,source,
 context_hash,targets_hash,review_fingerprint,review_override,approve_run_id,receipt,completed_at)
 VALUES(24002,'00000000-0000-4000-8000-000000027004',24003,'{}','{}','{}',repeat('c',64),repeat('d',64),repeat('e',64),false,24002,
 '{"documentId":24002,"approveRunId":24002,"operationId":"00000000-0000-4000-8000-000000027004","completed":true}',clock_timestamp());
UPDATE public.dms_ai_job_queue SET job_status='running' WHERE id=current_setting('test.queue.batch_parent')::bigint;
UPDATE erp_private.f07_job_claims SET token='00000000-0000-4000-8000-000000026004',expires_at=clock_timestamp()+interval '5 minutes',
 step_receipts='{"content_sync":{"step":"content_sync","status":"completed"}}' WHERE job_id=current_setting('test.queue.batch_parent')::bigint;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.expect((public.f07_ai_worker('enqueue_child',pg_temp.worker_input(current_setting('test.queue.batch_parent')::bigint,
 '00000000-0000-4000-8000-000000026004',24002,'post_approve_orchestration','semantic_document_index:doc:24002'))->>'success')::boolean,
 'worker admits the exact completed retained batch finalization for its original actor');
RESET ROLE;
UPDATE public.dms_ai_job_queue SET job_status='completed' WHERE id=current_setting('test.queue.parent')::bigint;
UPDATE public.dms_ai_job_queue SET job_status='running' WHERE id=current_setting('test.queue.child')::bigint;
UPDATE erp_private.f07_job_claims SET token='00000000-0000-4000-8000-000000026003',expires_at=clock_timestamp()+interval '5 minutes'
 WHERE job_id=current_setting('test.queue.child')::bigint;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.expect((public.f07_ai_worker('assert',jsonb_build_object('jobId',current_setting('test.queue.child')::bigint,
 'token','00000000-0000-4000-8000-000000026003'))->>'success')::boolean,'proven semantic child uses its editor authority after parent completion');
RESET ROLE;

-- Feed the real review entry points synthetic, already-produced candidates.
CREATE FUNCTION pg_temp.seed_review(p_document bigint) RETURNS jsonb LANGUAGE plpgsql AS $$
DECLARE snapshot text; preparation_job bigint; result_job bigint; result_id bigint;
BEGIN
 snapshot:=public.ai_mod04_preparation('snapshot',jsonb_build_object('documentId',p_document))->>'snapshot';
 preparation_job:=(public.f07_ai_job_control('enqueue',jsonb_build_object(
  'jobType','ai_re_extraction','relatedDocumentId',p_document,
  'payload',jsonb_build_object('documentId',p_document,'source','admin_manual_retry'),
  'idempotencyKey','synthetic-queue-review-'||p_document))->>'jobId')::bigint;
 INSERT INTO public.dms_ai_extraction_jobs(document_id,job_type,status,created_by)
 VALUES(p_document,'extraction','completed',24001) RETURNING id INTO result_job;
 INSERT INTO public.dms_ai_extraction_results(document_id,job_id,ai_status,raw_response_json)
 VALUES(p_document,result_job,'pending_review','{"preparation":{"version":1,"applicability":"document","values":[],"tagIds":[]}}') RETURNING id INTO result_id;
 UPDATE public.dms_ai_job_queue SET job_status='completed' WHERE id=preparation_job;
 UPDATE erp_private.f07_job_claims SET preparation_context=jsonb_build_object(
  'state','review_required','mode','reuse_text','actor',24001,'fileIds',jsonb_build_array(p_document),
  'snapshot',snapshot,'resultId',result_id) WHERE job_id=preparation_job;
 RETURN jsonb_build_object('documentId',p_document,'jobId',preparation_job,'snapshot',snapshot);
END $$;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000024001","role":"authenticated","session_id":"00000000-0000-4000-8000-000000025001"}',true);
SELECT set_config('test.queue.rereview',pg_temp.seed_review(24005)::text,true);
SELECT set_config('test.queue.intake',pg_temp.seed_review(24006)::text,true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.expect((public.ai_mod04_apply_preparation(current_setting('test.queue.rereview')::jsonb||
 '{"requestId":"00000000-0000-4000-8000-000000027001","selections":[],"humanReviewConfirmed":true,"refreshDerivedConfirmed":true}'::jsonb)
 ->'derivedReadiness'->>'semantic')='queued_existing_worker','confirmed preparation review reaches trusted content-sync admission');
SELECT pg_temp.expect(public.dms_saved_intake_review('apply',current_setting('test.queue.intake')::jsonb||
 jsonb_build_object('fileId',24006,'requestId','00000000-0000-4000-8000-000000027002',
  'schemaHash',public.dms_saved_intake_review('schema','{"documentId":24006,"documentTypeId":24001}')->>'schemaHash',
  'expectedRevision',0,'confirmed',true,'links','[]'::jsonb,
  'values','{"title":"Synthetic intake accepted title","standardFileName":"Synthetic intake accepted.pdf","documentTypeId":24001,"categoryId":24001,"confidentialityLevel":"internal","owningCompanyId":24001,"owningBranchId":24001,"metadataValues":{},"tagIds":[]}'::jsonb)
 )->>'state'='applied','saved intake review reaches trusted content-sync admission after final edits');
RESET ROLE;
SELECT pg_temp.expect((SELECT count(*) FROM public.dms_ai_job_queue j JOIN erp_private.f07_job_claims c ON c.job_id=j.id
 WHERE j.related_document_id IN (24005,24006) AND j.job_type='semantic_document_index'
  AND c.semantic_admission='reviewed_content_sync' AND c.semantic_parent_job_id IS NOT NULL
  AND c.source_hash=erp_private.f07_job_source(j.related_document_id))=2,
 'both review producers retain private provenance and final source fingerprints');
SELECT pg_temp.expect((SELECT count(*) FROM public.dms_document_content_chunks
 WHERE document_id IN (24005,24006) AND is_active AND chunk_text='Synthetic retained older text.')=2,
 'accepting new text preserves the old committed chunks pending atomic publication');

SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 minute' WHERE id='00000000-0000-4000-8000-000000025001';
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_worker('assert',jsonb_build_object('jobId',current_setting('test.queue.child')::bigint,
 'token','00000000-0000-4000-8000-000000026003'))$q$,'42501','an expired parent actor session blocks current child processing');
RESET ROLE;
UPDATE public.user_roles SET is_active=false WHERE id=24003;
SET LOCAL ROLE service_role;
SELECT pg_temp.expect_error($q$SELECT public.f07_ai_worker('assert',jsonb_build_object('jobId',current_setting('test.queue.manual')::bigint,
 'token','00000000-0000-4000-8000-000000026001'))$q$,'42501','revoking the retry actor grant blocks current manual processing');
RESET ROLE;

UPDATE public.dms_ai_job_queue SET job_status='queued',priority=1000,run_after=clock_timestamp()
 WHERE id=current_setting('test.queue.nonsemantic')::bigint;
UPDATE public.dms_ai_job_queue SET priority=1 WHERE id=current_setting('test.queue.static.manual')::bigint;
UPDATE public.erp_ai_feature_flags SET is_enabled=false WHERE feature_code='DMS_SEMANTIC_INDEX_QUEUE';
SET LOCAL ROLE service_role;
SELECT pg_temp.expect(public.f07_ai_worker('claim','{"workerId":"synthetic-queue-worker","limit":1}')
 ->0->'job'->>'id'=current_setting('test.queue.nonsemantic'),
 'with semantic disabled the worker still claims lower-priority unrelated work');
RESET ROLE;
SELECT pg_temp.expect((SELECT job_status='queued' AND attempt_count=0 FROM public.dms_ai_job_queue
 WHERE id=current_setting('test.queue.static.manual')::bigint),'disabled semantic work keeps status and attempt budget');

SELECT 'semantic queue authorization passed';
ROLLBACK;
