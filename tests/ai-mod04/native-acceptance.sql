-- Run only in the task-labelled disconnected schema rehearsal, never hosted.
BEGIN;
CREATE FUNCTION pg_temp.ok(p_ok boolean,p_label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF p_ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'ASSERTION FAILED: %',p_label; END IF; PERFORM set_config('test.assertions',(coalesce(nullif(current_setting('test.assertions',true),''),'0')::int+1)::text,false);END $$;
CREATE FUNCTION pg_temp.error(p_sql text,p_state text,p_label text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE caught text;
BEGIN BEGIN EXECUTE p_sql; EXCEPTION WHEN OTHERS THEN caught:=SQLSTATE; END; PERFORM pg_temp.ok(caught=p_state,p_label||' expected '||p_state||' actual '||coalesce(caught,'no error'));END $$;
-- Synthetic baseline only. Disable insert triggers while establishing the
-- pre-existing source fixture; all tested operations run with triggers/RLS on.
SET session_replication_role=replica;
INSERT INTO auth.users(id,email) VALUES
 ('00000000-0000-4000-8000-000000001001','ai-mod04-1@example.invalid'),('00000000-0000-4000-8000-000000001002','ai-mod04-2@example.invalid'),('00000000-0000-4000-8000-000000001003','ai-mod04-3@example.invalid');
INSERT INTO auth.sessions(id,user_id,created_at,updated_at) VALUES
 ('00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000001001',now(),now()),('00000000-0000-4000-8000-000000002002','00000000-0000-4000-8000-000000001002',now(),now()),('00000000-0000-4000-8000-000000002003','00000000-0000-4000-8000-000000001003',now(),now());
INSERT INTO public.user_profiles(id,auth_user_id,user_code,full_name,status,must_change_password) OVERRIDING SYSTEM VALUE VALUES
 (1001,'00000000-0000-4000-8000-000000001001','SYN-AI-1','SYNTHETIC submitter','active',false),(1002,'00000000-0000-4000-8000-000000001002','SYN-AI-2','SYNTHETIC reviewer two','active',false),(1003,'00000000-0000-4000-8000-000000001003','SYN-AI-3','SYNTHETIC reviewer three','active',false);
INSERT INTO public.roles(id,role_code,role_name,is_active) OVERRIDING SYSTEM VALUE VALUES(1001,'system_admin','SYNTHETIC global admin',true);
INSERT INTO public.user_roles(id,user_profile_id,role_id,is_active) OVERRIDING SYSTEM VALUE VALUES(1001,1001,1001,true),(1002,1002,1001,true),(1003,1003,1001,true);
INSERT INTO public.owner_companies(id,company_code,legal_name_en,status) OVERRIDING SYSTEM VALUE VALUES(1001,'SYN_AIM04_A','SYNTHETIC company A','active'),(1002,'SYN_AIM04_B','SYNTHETIC company B','active');
INSERT INTO public.branches(id,owner_company_id,branch_code,branch_name_en,status) OVERRIDING SYSTEM VALUE VALUES(1001,1001,'SYN_AIM04_A','SYNTHETIC branch A','active'),(1002,1002,'SYN_AIM04_B','SYNTHETIC branch B','active');
INSERT INTO public.dms_document_categories(id,category_code,name_en,is_active) OVERRIDING SYSTEM VALUE VALUES(1001,'SYN_AIM04','SYNTHETIC category',true);
INSERT INTO public.dms_document_types(id,type_code,name_en,category_id,is_active,requires_expiry_tracking) OVERRIDING SYSTEM VALUE VALUES(1001,'SYN_AIM04','SYNTHETIC identity document',1001,true,true);
INSERT INTO public.dms_metadata_definitions(id,document_type_id,field_code,field_label_en,field_type,is_active,is_required,is_ai_extractable) OVERRIDING SYSTEM VALUE VALUES(1001,1001,'number','SYNTHETIC number','text',true,false,true);
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status,approval_status,issue_date,expiry_date,created_by,updated_by) OVERRIDING SYSTEM VALUE VALUES
 (1001,'SYN-DOC-1001','SYNTHETIC accepted title',1001,1001,1001,1001,'internal','draft',NULL,'2026-01-01','2027-12-31',1001,1001),
 (1002,'SYN-DOC-1002','SYNTHETIC other company',1001,1001,1002,1002,'internal','draft',NULL,'2026-01-01','2027-12-31',1001,1001),
 (1003,'SYN-DOC-1003','SYNTHETIC unconfigured route',1001,1001,1001,1001,'internal','draft',NULL,NULL,NULL,1001,1001);
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE VALUES(1001,1001,1,true),(1002,1002,1,true),(1003,1003,1,true);
UPDATE public.dms_documents SET current_version_id=id WHERE id IN(1001,1002,1003);
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,ocr_text,ocr_status,integrity_status) OVERRIDING SYSTEM VALUE VALUES
 (1001,1001,1001,'original','dms','synthetic/one.pdf','SYNTHETIC-one.pdf','application/pdf',10,repeat('a',64),'Passport NEW رقم عربي','complete','verified'),
 (1002,1002,1002,'original','dms','synthetic/two.pdf','SYNTHETIC-two.pdf','application/pdf',10,repeat('b',64),'Other original','complete','verified'),
 (1003,1003,1003,'original','dms','synthetic/three.pdf','SYNTHETIC-three.pdf','application/pdf',10,repeat('c',64),'Original three','complete','verified');
INSERT INTO public.dms_document_metadata_values(document_id,definition_id,value_text,created_by,updated_by) OVERRIDING SYSTEM VALUE VALUES(1001,1001,'OLD',1001,1001);
INSERT INTO public.erp_ai_feature_flags(feature_code,feature_name,is_enabled) OVERRIDING SYSTEM VALUE VALUES('DMS_AI_APPLY_TO_ERP_DMS_METADATA','SYNTHETIC metadata apply',true) ON CONFLICT(feature_code) DO UPDATE SET is_enabled=true;
SET session_replication_role=origin;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001001","role":"authenticated","session_id":"00000000-0000-4000-8000-000000002001"}',false);
SET ROLE authenticated;
SELECT pg_temp.ok(public.f03_current_session_valid(),'actual F03 session is valid');
SELECT pg_temp.ok(public.current_user_is_global_admin(),'actual global-admin fixture admission');
SELECT pg_temp.ok(public.ai_mod04_duplicate_advisory(repeat('a',64),10)->>'status'='existing_document','early advisory finds only permitted existing document');
SELECT pg_temp.ok(public.ai_mod04_duplicate_advisory(repeat('f',64),10)->>'status'='no_visible_match','no visible match remains explicitly advisory');
SELECT pg_temp.error($q$SELECT public.ai_mod04_duplicate_advisory('bad',10)$q$,'22023','invalid hash rejected');
SELECT set_config('test.snapshot',public.ai_mod04_preparation('snapshot','{"documentId":1001}')->>'snapshot',false);
SELECT pg_temp.ok((public.ai_mod04_preparation('snapshot','{"documentId":1001}')->'files'->0->'path')='null'::jsonb,'interactive snapshot never exposes service storage path');
SELECT pg_temp.ok(public.ai_mod04_preparation('recover','{"documentId":1001}')->'recovery'='null'::jsonb,'no retained preparation is not invented');
SELECT set_config('test.start',jsonb_build_object('documentId',1001,'requestId','00000000-0000-4000-8000-000000003001','snapshot',current_setting('test.snapshot'),'mode','reuse_text','fileIds',jsonb_build_array(1001))::text,false);
SELECT set_config('test.job',(public.ai_mod04_preparation('start',current_setting('test.start')::jsonb)->>'jobId'),false);
SELECT pg_temp.ok((public.ai_mod04_preparation('start',current_setting('test.start')::jsonb)->>'jobId')=current_setting('test.job'),'lost start response replays same job');
SELECT pg_temp.error($q$SELECT public.ai_mod04_preparation('start',current_setting('test.start')::jsonb||'{"mode":"reread_files"}'::jsonb)$q$,'PT409','same request cannot change its paid mode');
SELECT pg_temp.error($q$SELECT public.ai_mod04_preparation('start',current_setting('test.start')::jsonb||'{"requestId":"00000000-0000-4000-8000-000000003002"}'::jsonb)$q$,'PT409','another request cannot bypass active recovery');
SELECT pg_temp.ok((public.ai_mod04_preparation('recover','{"documentId":1001}')->'recovery'->>'jobId')=current_setting('test.job'),'reload recovers original job');
SELECT pg_temp.ok((SELECT title FROM public.dms_documents WHERE id=1001)='SYNTHETIC accepted title','queued candidate leaves accepted header untouched');
SELECT pg_temp.error($q$SELECT public.ai_mod04_preparation_worker('context',jsonb_build_object('jobId',current_setting('test.job')::bigint,'token','00000000-0000-4000-8000-000000004001'))$q$,'42501','interactive caller cannot impersonate a worker');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);
SET ROLE service_role;
SELECT pg_temp.ok(public.f07_ai_worker('claim','{"workerId":"synthetic-legacy-worker","limit":1}')='[]'::jsonb,'deployed legacy worker cannot consume the new preparation job format');
SELECT set_config('test.claim',public.f07_ai_worker('claim','{"workerId":"ai-mod04-synthetic","limit":1,"preparationVersion":1}')::text,false);
SELECT set_config('test.token',(current_setting('test.claim')::jsonb->0->>'token'),false);
SELECT pg_temp.ok((current_setting('test.claim')::jsonb->0->'job'->>'id')=current_setting('test.job'),'actual F07 claim retains selected queue identity');
SELECT pg_temp.ok((public.ai_mod04_preparation_worker('context',jsonb_build_object('jobId',current_setting('test.job')::bigint,'token',current_setting('test.token')))->>'preparation')='true','worker reads native bound preparation');
SELECT pg_temp.ok(public.ai_mod04_preparation_worker('begin',jsonb_build_object('jobId',current_setting('test.job')::bigint,'token',current_setting('test.token'),'stage','analysis'))->>'state'='started','paid stage admitted once');
SELECT pg_temp.ok(public.ai_mod04_preparation_worker('begin',jsonb_build_object('jobId',current_setting('test.job')::bigint,'token',current_setting('test.token'),'stage','analysis'))->>'state'='uncertain','second begin cannot repeat paid work');
SELECT pg_temp.error($q$SELECT public.ai_mod04_preparation_worker('begin',jsonb_build_object('jobId',current_setting('test.job')::bigint,'token',current_setting('test.token'),'stage','ocr:9999'))$q$,'42501','unselected source cannot receive paid OCR');
SELECT public.ai_mod04_preparation_worker('complete',jsonb_build_object('jobId',current_setting('test.job')::bigint,'token',current_setting('test.token'),'stage','analysis','value',jsonb_build_object('synthetic',true)));
SELECT pg_temp.ok(public.ai_mod04_preparation_worker('begin',jsonb_build_object('jobId',current_setting('test.job')::bigint,'token',current_setting('test.token'),'stage','analysis'))->>'state'='completed','completed paid stage replays retained receipt');
SELECT set_config('test.candidate',jsonb_build_object('version',1,'sourceSnapshot',current_setting('test.snapshot'),'profileHash',encode(sha256(convert_to('null','UTF8')),'hex'),'values',jsonb_build_array(jsonb_build_object('key','title','label','Title','current','SYNTHETIC accepted title','proposed','SYNTHETIC reviewed title','evidence','[]'::jsonb,'confidence',NULL),jsonb_build_object('key','metadata:1001','label','Number','current','OLD','proposed','NEW','evidence','[]'::jsonb,'confidence',0.9)),'summary','SYNTHETIC review only','tagIds','[]'::jsonb,'linkCandidates','[]'::jsonb,'warnings','[]'::jsonb,'bundle','single','applicability','document','readiness',jsonb_build_object('review','required','links','verified_context_only','semantic','pending_accepted_review','reminders','pending_accepted_expiry','split','not_requested'))::text,false);
SELECT set_config('test.result',public.ai_mod04_preparation_worker('publish',jsonb_build_object('jobId',current_setting('test.job')::bigint,'token',current_setting('test.token'),'candidate',current_setting('test.candidate')::jsonb))::text,false);
SELECT pg_temp.ok((public.ai_mod04_preparation_worker('publish',jsonb_build_object('jobId',current_setting('test.job')::bigint,'token',current_setting('test.token'),'candidate',current_setting('test.candidate')::jsonb))->>'resultId')=current_setting('test.result')::jsonb->>'resultId','lost publication response reuses exact retained result');
SELECT public.f07_ai_worker('settle',jsonb_build_object('jobId',current_setting('test.job')::bigint,'token',current_setting('test.token'),'success',true));
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001001","role":"authenticated","session_id":"00000000-0000-4000-8000-000000002001"}',false);
SET ROLE authenticated;
SELECT pg_temp.ok(public.ai_mod04_preparation('status',jsonb_build_object('documentId',1001,'jobId',current_setting('test.job')::bigint))->>'state'='review_required','actual stored candidate becomes reviewable');
SELECT pg_temp.ok((SELECT value_text FROM public.dms_document_metadata_values WHERE document_id=1001 AND definition_id=1001)='OLD','candidate publication never overwrites accepted metadata');
SELECT set_config('test.apply',jsonb_build_object('documentId',1001,'jobId',current_setting('test.job')::bigint,'requestId','00000000-0000-4000-8000-000000005001','snapshot',current_setting('test.snapshot'),'selections',jsonb_build_array('title','metadata:1001'),'humanReviewConfirmed',true,'replaceExistingConfirmed',true)::text,false);
SELECT pg_temp.error($q$SELECT public.ai_mod04_apply_preparation(current_setting('test.apply')::jsonb||'{"replaceExistingConfirmed":false}'::jsonb)$q$,'22023','existing-value replacement requires explicit confirmation');
SELECT set_config('test.apply.receipt',public.ai_mod04_apply_preparation(current_setting('test.apply')::jsonb)::text,false);
SELECT pg_temp.ok(public.ai_mod04_apply_preparation(current_setting('test.apply')::jsonb)=current_setting('test.apply.receipt')::jsonb,'lost save response replays original committed receipt');
SELECT pg_temp.error($q$SELECT public.ai_mod04_apply_preparation(current_setting('test.apply')::jsonb||'{"edits":{"title":"Other"}}'::jsonb)$q$,'PT409','retained save cannot be reused with changed reviewed values');
SELECT pg_temp.ok((SELECT title FROM public.dms_documents WHERE id=1001)='SYNTHETIC reviewed title','selected reviewed header applied');
SELECT pg_temp.ok((SELECT value_text FROM public.dms_document_metadata_values WHERE document_id=1001 AND definition_id=1001)='NEW','typed owning metadata writer applied selected value');
SELECT pg_temp.ok((SELECT document_no FROM public.dms_documents WHERE id=1001)='SYN-DOC-1001' AND jsonb_array_length(public.ai_mod04_preparation('snapshot','{"documentId":1001}')->'files')=1,'re-review preserves document number and source-file count');
SELECT pg_temp.ok(public.ai_mod04_preparation('snapshot','{"documentId":1001}')->'files'->0->>'text'='Passport NEW رقم عربي','accepted OCR text unchanged while reviewing header/metadata');
SELECT pg_temp.error($q$SELECT public.f05_transition_document_approval(1003,NULL,'submit',NULL,NULL)$q$,'55000','unconfigured company/type route is held, not generic approval');
SELECT set_config('test.workflow',public.f05_save_dms_workflow(NULL,NULL,jsonb_build_object('workflow_code','SYN_AI04_A','name_en','SYNTHETIC assigned review','owner_company_id',1001,'branch_id',1001,'document_type_ids',jsonb_build_array(1001),'is_active',true,'steps',jsonb_build_array(jsonb_build_object('step_code','REVIEW','step_name','Independent review','is_initial',true,'is_final',true,'sort_order',0,'assignee_profile_ids',jsonb_build_array(1002,1003),'decision_rule','all_assigned'))))::text,false);
SELECT pg_temp.ok((current_setting('test.workflow')::jsonb->>'id')::bigint>0,'explicit company/type/assignees workflow saved');
SELECT pg_temp.error($q$SELECT public.f05_save_dms_workflow(NULL,NULL,jsonb_build_object('workflow_code','SYN_AI04_BAD','name_en','SYNTHETIC mismatch','owner_company_id',1001,'branch_id',1002,'document_type_ids',jsonb_build_array(1001),'is_active',true,'steps',jsonb_build_array(jsonb_build_object('step_code','REVIEW','step_name','Review','is_initial',true,'is_final',true,'sort_order',0,'assignee_profile_ids',jsonb_build_array(1002)))))$q$,'22023','workflow cannot mix company and foreign branch');
SELECT set_config('test.approval',public.f05_transition_document_approval(1001,NULL,'submit',NULL,NULL)->>'approvalId',false);
SELECT pg_temp.error($q$SELECT public.f05_transition_document_approval(1001,current_setting('test.approval')::bigint,'approve',NULL,NULL)$q$,'42501','global administrator cannot approve own submission');
SELECT pg_temp.error($q$SELECT public.f05_transition_document_approval(1001,current_setting('test.approval')::bigint,'reject',NULL,'A valid reason')$q$,'42501','global administrator cannot reject own submission');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',false);SET ROLE service_role;
SELECT pg_temp.ok(jsonb_array_length(public.ai_mod04_approval_recipients(current_setting('test.approval')::bigint,1001)->'profileIds')=2,'F10 sees precisely the two assigned independent recipients');
RESET ROLE;
SELECT set_config('test.notice.event',(SELECT id::text FROM erp_private.notification_events WHERE source_snapshot->'metadata_json'->>'approval_id'=current_setting('test.approval') AND event_type='approval_submitted' ORDER BY id DESC LIMIT 1),false);
SELECT set_config('test.notice.lease',gen_random_uuid()::text,false);
UPDATE erp_private.notification_events SET state='processing',lease_token=current_setting('test.notice.lease')::uuid,lease_expires_at=clock_timestamp()+interval '5 minutes' WHERE id=current_setting('test.notice.event')::bigint;
SET ROLE service_role;
SELECT public.f10_plan_notification_recipients(current_setting('test.notice.event')::bigint,current_setting('test.notice.lease')::uuid,ARRAY[1001,1002,1003]::bigint[]);
SELECT pg_temp.ok(public.f10_record_notification_recipient(current_setting('test.notice.event')::bigint,current_setting('test.notice.lease')::uuid,1001,true)->>'state'='held','native F10 publication rejects a legacy worker role-pool recipient who submitted the approval');
SELECT pg_temp.ok(public.f10_record_notification_recipient(current_setting('test.notice.event')::bigint,current_setting('test.notice.lease')::uuid,1002,true)->>'state'='created','native F10 publication admits a currently named independent reviewer');

RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001002","role":"authenticated","session_id":"00000000-0000-4000-8000-000000002002"}',false);SET ROLE authenticated;
SELECT set_config('test.routing',public.ai_mod04_approval_routing('read','{"documentId":1001}'::jsonb)::text,false);
SELECT pg_temp.ok(current_setting('test.routing')::jsonb->'canReassign'='true'::jsonb,'independent scoped administrator may review reassignment');
SELECT pg_temp.error($q$SELECT public.ai_mod04_approval_routing('delegate',jsonb_build_object('documentId',1001,'approvalId',current_setting('test.approval')::bigint,'snapshot',current_setting('test.routing')::jsonb->>'snapshot','requestId','00000000-0000-4000-8000-000000007001','profileIds',jsonb_build_array(1003),'reason','SYNTHETIC invalid existing delegate'))$q$,'22023','delegation cannot silently replace another already-assigned reviewer');
SELECT set_config('test.reassign',jsonb_build_object('documentId',1001,'approvalId',current_setting('test.approval')::bigint,'snapshot',current_setting('test.routing')::jsonb->>'snapshot','requestId','00000000-0000-4000-8000-000000007002','profileIds',jsonb_build_array(1002,1003),'reason','SYNTHETIC confirmed assigned reviewer review')::text,false);
SELECT set_config('test.reassign.receipt',public.ai_mod04_approval_routing('reassign',current_setting('test.reassign')::jsonb)::text,false);
SELECT pg_temp.ok(public.ai_mod04_approval_routing('reassign',current_setting('test.reassign')::jsonb)=current_setting('test.reassign.receipt')::jsonb,'lost reassignment response replays immutable original receipt');
SELECT pg_temp.error($q$SELECT public.ai_mod04_approval_routing('reassign',current_setting('test.reassign')::jsonb||'{"profileIds":[1001]}'::jsonb)$q$,'PT409','retained reassignment cannot change its reviewed payload');
SELECT pg_temp.error($q$SELECT public.ai_mod04_approval_routing('reassign',current_setting('test.reassign')::jsonb||jsonb_build_object('requestId','00000000-0000-4000-8000-000000007003','snapshot',current_setting('test.reassign.receipt')::jsonb->>'snapshot','profileIds',jsonb_build_array(1001)))$q$,'42501','routing cannot assign original submitter despite global administrator role');
SELECT pg_temp.ok((SELECT count(*) FROM public.dms_document_events WHERE document_id=1001 AND event_type='approval_assignment_changed')=1,'reassignment appends one immutable human audit event');
SELECT pg_temp.ok(public.f05_transition_document_approval(1001,current_setting('test.approval')::bigint,'approve',NULL,NULL)->>'approvalStatus'='pending_approval','all-assigned rule retains pending cycle after first independent vote');
SELECT pg_temp.error($q$SELECT public.f05_transition_document_approval(1001,current_setting('test.approval')::bigint,'approve',NULL,NULL)$q$,'42501','one reviewer cannot vote twice');
RESET ROLE;
SELECT set_config('request.jwt.claims','{"sub":"00000000-0000-4000-8000-000000001003","role":"authenticated","session_id":"00000000-0000-4000-8000-000000002003"}',false);SET ROLE authenticated;
SELECT pg_temp.ok(public.f05_transition_document_approval(1001,current_setting('test.approval')::bigint,'approve',NULL,NULL)->>'approvalStatus'='approved','last assigned independent vote completes cycle');
SELECT pg_temp.ok((SELECT count(*) FROM public.dms_document_approvals WHERE document_id=1001 AND action='approved')=2,'both independent votes retained in immutable existing history');
SELECT pg_temp.error($q$SELECT public.ai_mod04_preparation('status',jsonb_build_object('documentId',1001,'jobId',current_setting('test.job')::bigint))$q$,'42501','another administrator cannot recover a different actor preparation');
RESET ROLE;
SELECT jsonb_build_object('result','passed','assertions',current_setting('test.assertions')::int,'fixture','Schema-only hosted restore with actual F03/F07/F10 functions, native RLS, synthetic baseline, no browser, provider calls or production records');
ROLLBACK;
