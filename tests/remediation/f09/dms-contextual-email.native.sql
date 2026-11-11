\set ON_ERROR_STOP on
BEGIN;

CREATE FUNCTION pg_temp.check_it(ok boolean, label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',label; END IF;
RAISE NOTICE 'PASS: %',label; END;
$$;

-- Isolated baseline predates AI04. The dependency is simulated only if absent.
DO $$ BEGIN
  IF to_regprocedure('public.ai_mod04_approval_recipients(bigint,bigint)') IS NULL THEN
    EXECUTE $definition$
      CREATE FUNCTION public.ai_mod04_approval_recipients(p_approval bigint,p_document bigint) RETURNS jsonb
      LANGUAGE sql STABLE AS $body$
        SELECT jsonb_build_object('state','assigned','profileIds',jsonb_build_array(current_setting('erp.qa_approval_recipient')::bigint))
        WHERE p_approval IN (998704,998706) AND p_document IN (998704,998706)
      $body$
    $definition$;
  ELSE RAISE EXCEPTION 'Use the pre-AI04 synthetic snapshot for this focused fixture'; END IF;
END $$;

SET LOCAL session_replication_role = replica;
INSERT INTO auth.users(id,email,raw_user_meta_data) VALUES
  ('1aa99870-0000-4000-8000-000000000001','dms-email-a@example.invalid','{"full_name":"Synthetic Recipient"}'),
  ('1aa99870-0000-4000-8000-000000000002','dms-email-b@example.invalid','{"full_name":"Synthetic Submitter"}');
SET LOCAL session_replication_role = origin;
-- Create explicit test identities without signup side effects.
INSERT INTO public.user_profiles(id,auth_user_id,display_name,status) OVERRIDING SYSTEM VALUE VALUES
  (998701,'1aa99870-0000-4000-8000-000000000001','Synthetic Recipient','active'),
  (998702,'1aa99870-0000-4000-8000-000000000002','Synthetic Submitter','active');

SET LOCAL session_replication_role = replica;
INSERT INTO public.owner_companies(id,company_code,legal_name_en) VALUES(998701,'QA_DMS_EMAIL','Synthetic Company');
INSERT INTO auth.sessions(id,user_id) VALUES
 ('1bb99870-0000-4000-8000-000000000001','1aa99870-0000-4000-8000-000000000001'),
 ('1bb99870-0000-4000-8000-000000000002','1aa99870-0000-4000-8000-000000000002');
UPDATE public.user_profiles SET must_change_password=false WHERE id IN(998701,998702);
INSERT INTO public.roles(id,role_code,role_name) VALUES(998701,'QA_DMS_EMAIL_READER','Synthetic DMS email reader');
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code)
VALUES('notifications.view','View notifications','notifications','view') ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT 998701,id FROM public.permissions WHERE permission_code IN('notifications.view','dms.documents.view');
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id)
VALUES(998701,998701,998701),(998702,998701,998701);
INSERT INTO public.dms_document_categories(id,category_code,name_en) OVERRIDING SYSTEM VALUE VALUES(998701,'QA_EMAIL','Synthetic category');
INSERT INTO public.dms_document_types(id,type_code,name_en,category_id) OVERRIDING SYSTEM VALUE
VALUES(998701,'QA_DMS_EMAIL','Synthetic type',998701);
INSERT INTO public.erp_email_feature_flags(feature_code,feature_name,is_enabled)
VALUES('DMS_EXPIRY_EMAILS','DMS Expiry',true) ON CONFLICT(feature_code) DO UPDATE SET is_enabled=true;

INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,
  confidentiality_level,status,approval_status,expiry_date,expiry_tracking_override)
OVERRIDING SYSTEM VALUE
SELECT 998700+n,'DMS-2099-99870'||n,'Synthetic title',998701,998701,998701,
  CASE WHEN n=3 THEN 'hr' ELSE 'internal' END,
  CASE WHEN n IN(4,6) THEN 'pending_review' ELSE 'active' END,
  CASE WHEN n IN(4,6) THEN 'pending_approval' WHEN n=5 THEN 'approved' ELSE NULL END,
  (statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date + CASE WHEN n=2 THEN -1 ELSE 10 END,
  CASE WHEN n IN(4,5,6) THEN 'ignored' ELSE NULL END
FROM generate_series(1,6) n;

INSERT INTO public.erp_notifications(id,notification_code,source_module,source_entity_type,source_entity_id,notification_type,
  title,message,recipient_user_id,channel_email,metadata_json)
OVERRIDING SYSTEM VALUE
SELECT 998700+n,'QA-DMS-EMAIL-'||n,'DMS','dms_documents',998700+n,
  CASE n WHEN 2 THEN 'document_expired' WHEN 4 THEN 'approval_submitted' WHEN 5 THEN 'approval_approved' WHEN 6 THEN 'approval_approved' ELSE 'expiry_reminder' END,
  'Synthetic title','Synthetic message',998701,true,CASE WHEN n>=4 THEN jsonb_build_object('f10_event_id',998700+n) END
FROM generate_series(1,6) n;
UPDATE public.erp_notifications SET channel_in_app=false WHERE id=998701;
INSERT INTO public.dms_expiry_reminders(id,document_id,reminder_days_before,reminder_date,status) OVERRIDING SYSTEM VALUE
SELECT id,id,CASE WHEN id=998702 THEN 0 ELSE 10 END,expiry_date-CASE WHEN id=998702 THEN 0 ELSE 10 END,'pending'
FROM public.dms_documents WHERE id BETWEEN 998701 AND 998703;
INSERT INTO public.dms_notification_queue(id,document_id,reminder_id,notification_type,channel,status,recipient_user_id,subject,message,scheduled_for,global_notification_id)
OVERRIDING SYSTEM VALUE
SELECT id,source_entity_id,id,notification_type,'in_app','pending',recipient_user_id,'Synthetic subject','Synthetic message',now(),id
FROM public.erp_notifications WHERE id BETWEEN 998701 AND 998703;

INSERT INTO public.dms_document_approvals(id,document_id,action,submitted_by,actioned_by,is_current) OVERRIDING SYSTEM VALUE VALUES
  (998704,998704,'submitted',998702,998702,true),(998705,998705,'approved',998701,998702,false),(998706,998706,'submitted',998702,998702,true);
INSERT INTO public.dms_document_events(id,document_id,event_type,description,performed_by) OVERRIDING SYSTEM VALUE
SELECT id,id,notification_type,'Synthetic event',998702 FROM public.erp_notifications WHERE id BETWEEN 998704 AND 998706;
INSERT INTO erp_private.notification_events(id,event_key,source_table,source_id,event_type,actor_id,source_snapshot) OVERRIDING SYSTEM VALUE
SELECT id,'qa-email:'||id,'dms_document_events',id,notification_type,998702,
  jsonb_build_object('document_id',id,'metadata_json',jsonb_build_object('approval_id',id,'approval_status',CASE WHEN id=998705 THEN 'approved' ELSE 'pending_approval' END))
FROM public.erp_notifications WHERE id BETWEEN 998704 AND 998706;
SET LOCAL session_replication_role = origin;

SELECT pg_temp.check_it(NOT has_function_privilege('anon','public.dms_contextual_email_event(bigint)','EXECUTE')
  AND NOT has_function_privilege('authenticated','public.dms_contextual_email_event(bigint)','EXECUTE'),'email context unavailable to anonymous or signed-in browser roles');
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SELECT set_config('erp.qa_approval_recipient','998701',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.check_it(public.dms_contextual_email_event(998701)->>'event'='expiry','due expiry uses the current record and cycle');
SELECT pg_temp.check_it(public.dms_contextual_email_event(998702)->>'event'='overdue','past expiry uses the overdue event');
SELECT pg_temp.check_it(public.dms_contextual_email_event(998703)->>'event'='expiry'
  AND public.dms_contextual_email_event(998703)->>'typeCode' IS NULL AND public.dms_contextual_email_event(998703)->>'expiry' IS NULL,'confidential email context omits metadata');
SELECT pg_temp.check_it(public.dms_contextual_email_event(998704)->>'event'='approval-request','assigned approval works with expiry tracking ignored');
SELECT pg_temp.check_it(public.dms_contextual_email_event(998705)->>'event'='approved','current final decision routes to the submitter');
SELECT pg_temp.check_it(public.dms_contextual_email_event(998706)->>'event'='approval-request','next approval step is a request rather than a final outcome');
SELECT set_config('erp.qa_approval_recipient','998702',true);
SELECT pg_temp.check_it(public.dms_contextual_email_event(998704) IS NULL,'reassigned approval suppresses the prior recipient');
SELECT set_config('erp.qa_approval_recipient','998701',true);
RESET ROLE;

SELECT pg_temp.check_it(NOT has_function_privilege('anon','public.dms_email_link_type(bigint,bigint)','EXECUTE'),'anonymous link lookup denied');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"1aa99870-0000-4000-8000-000000000001","session_id":"1bb99870-0000-4000-8000-000000000001"}',true);
SET LOCAL ROLE authenticated;
SELECT pg_temp.check_it(NOT EXISTS(SELECT 1 FROM public.erp_notifications WHERE id=998701),'email-only alert stays outside the in-app list');
SELECT pg_temp.check_it(public.dms_email_link_type(998701,998701)='expiry_reminder','email-only recipient can open the exact linked record');
SELECT pg_temp.check_it(public.dms_email_link_type(998701,998702) IS NULL,'changed document in email link denied');
SELECT set_config('request.jwt.claims','{"role":"authenticated","sub":"1aa99870-0000-4000-8000-000000000002","session_id":"1bb99870-0000-4000-8000-000000000002"}',true);
SELECT pg_temp.check_it(public.f10_notification_target('dms_documents',998701) IS NOT NULL AND public.dms_email_link_type(998701,998701) IS NULL,
  'forwarded link denied even to a different reader of the document');
RESET ROLE;
SELECT pg_temp.check_it((SELECT status='unread' AND read_at IS NULL FROM public.erp_notifications WHERE id=998701),'email link resolution does not mark an alert read');

SET LOCAL session_replication_role = replica;
UPDATE public.dms_documents SET expiry_date=expiry_date+20 WHERE id=998701;
UPDATE public.dms_documents SET status='superseded',is_archived=true WHERE id=998702;
UPDATE public.dms_document_approvals SET is_current=false WHERE id=998704;
UPDATE public.dms_documents SET approval_status='pending_approval' WHERE id=998705;
UPDATE public.erp_notifications SET scheduled_for=now()+interval '1 day' WHERE id=998706;
SET LOCAL session_replication_role = origin;
SELECT set_config('request.jwt.claims','{"role":"service_role"}',true);
SET LOCAL ROLE service_role;
SELECT pg_temp.check_it(public.dms_contextual_email_event(998701) IS NULL,'changed expiry cancels an old reminder');
SELECT pg_temp.check_it(public.dms_contextual_email_event(998702) IS NULL,'superseded document cancels an overdue notice');
SELECT pg_temp.check_it(public.dms_contextual_email_event(998704) IS NULL,'decided or withdrawn approval cancels the prior request');
SELECT pg_temp.check_it(public.dms_contextual_email_event(998705) IS NULL,'new approval cycle cancels a stale outcome');
SELECT pg_temp.check_it(public.dms_contextual_email_event(998706) IS NULL,'future notification cannot send');
ROLLBACK;
