\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
 IF current_database() !~ '^(t00_clean|t19_[a-z0-9_]+)$'
  OR current_setting('cron.launch_active_jobs')<>'off'
  OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
   IS DISTINCT FROM 'Isolated HR T00 20261119'
 THEN RAISE EXCEPTION 'Isolated T00 database required'; END IF;
 IF to_regprocedure('erp_private.t19_collect_expiry_events(date,integer,text)') IS NULL THEN
  RAISE EXCEPTION 'T19 expiry producer is missing';
 END IF;
END;
$$;

INSERT INTO public.owner_companies(id,company_code,legal_name_en) OVERRIDING SYSTEM VALUE
VALUES (919001,'T19-A','Synthetic T19 Company A'),(919002,'T19-B','Synthetic T19 Company B');
INSERT INTO public.branches(id,owner_company_id,branch_code,branch_name_en) OVERRIDING SYSTEM VALUE
VALUES (919011,919001,'T19-A1','Synthetic T19 A1'),(919012,919001,'T19-A2','Synthetic T19 A2'),
 (919021,919002,'T19-B1','Synthetic T19 B1');
INSERT INTO public.hr_employee_categories(id,code,name_en) OVERRIDING SYSTEM VALUE
VALUES (919001,'T19STAFF','Synthetic T19 Staff');
INSERT INTO auth.users(id,email,aud,role,email_confirmed_at)
SELECT ('91900000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'t19-reminder-'||i||'@example.test','authenticated','authenticated',now()
FROM generate_series(1,7) i;
INSERT INTO auth.sessions(id,user_id,created_at,not_after)
SELECT replace(id::text,'-8000-','-8001-')::uuid,id,now(),now()+interval '1 day'
FROM auth.users WHERE email LIKE 't19-reminder-%@example.test';
INSERT INTO public.user_profiles(auth_user_id,full_name,status,must_change_password)
SELECT id,'Synthetic T19 actor','active',false FROM auth.users WHERE email LIKE 't19-reminder-%@example.test'
ON CONFLICT(auth_user_id) DO UPDATE SET status='active',must_change_password=false;

CREATE FUNCTION pg_temp.t19_profile(i int) RETURNS bigint LANGUAGE sql SECURITY DEFINER SET search_path='' AS $$
 SELECT id FROM public.user_profiles WHERE auth_user_id=('91900000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.t19_actor(i int) RETURNS text LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'sub','91900000-0000-4000-8000-'||lpad(i::text,12,'0'),
  'session_id','91900000-0000-4000-8001-'||lpad(i::text,12,'0'))::text,true);
$$;
INSERT INTO public.roles(role_code,role_name,is_system_role)
VALUES ('t19_reminder_operator','Synthetic T19 PRO',false),('t19_reminder_fleet','Synthetic T19 Fleet',false),
 ('t19_reminder_config','Synthetic T19 Global Notification Administrator',false);
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('notifications.view','Synthetic personal notifications','NOTIFICATIONS','view','branch'),
 ('notifications.admin','Synthetic notification administrator','NOTIFICATIONS','manage','global'),
 ('hr.employees.view','Synthetic employee read','HR','view','branch'),
 ('hr.compliance.view','Synthetic compliance read','HR','view','branch'),
 ('hr.medical.view','Synthetic medical read','HR','view','branch') ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t19_reminder_operator',ARRAY['notifications.view','hr.employees.view','hr.compliance.view']),
 ('t19_reminder_fleet',ARRAY['notifications.view','fleet.assets.view']),
 ('t19_reminder_config',ARRAY['notifications.admin'])
) a(code,caps) JOIN public.roles r ON r.role_code=a.code JOIN public.permissions p ON p.permission_code=ANY(a.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT pg_temp.t19_profile(a.i),r.id,a.company,a.branch,true FROM (VALUES
 (1,'t19_reminder_config',NULL::bigint,NULL::bigint),(2,'t19_reminder_operator',919001,919011),
 (3,'t19_reminder_operator',919001,919012),(4,'t19_reminder_operator',919002,919021),
 (5,'t19_reminder_operator',919001,919011),(6,'t19_reminder_fleet',919001,919011),
 (7,'t19_reminder_operator',919001,919011)
) a(i,role_code,company,branch) JOIN public.roles r ON r.role_code=a.role_code;
UPDATE public.user_profiles SET status='inactive' WHERE id=pg_temp.t19_profile(5);
INSERT INTO erp_private.t02_role_validity(assignment_id,valid_until)
SELECT id,now()-interval '1 day' FROM public.user_roles WHERE user_profile_id=pg_temp.t19_profile(7);

INSERT INTO public.employees(id,employee_code,full_name_en,gender,date_of_birth,mobile_number,owner_company_id,branch_id,joining_date,emergency_contact_name,emergency_contact_mobile,employee_category_id)
OVERRIDING SYSTEM VALUE VALUES
 (919101,'T19-E1','Synthetic T19 E1','male','1985-01-01','0500000011',919001,919011,'2020-01-01','Synthetic Emergency','0500000111',919001),
 (919102,'T19-E2','Synthetic T19 E2','male','1985-01-01','0500000012',919001,919012,'2020-01-01','Synthetic Emergency','0500000112',919001),
 (919103,'T19-E3','Synthetic T19 E3','male','1985-01-01','0500000013',919002,919021,'2020-01-01','Synthetic Emergency','0500000113',919001);
INSERT INTO public.hr_identity_document_types(code,name_en) VALUES ('T19_LICENSE','Synthetic T19 Licence');
INSERT INTO public.employee_identity_documents(id,employee_id,document_type_id,document_number,issue_date,expiry_date,status,verification_status)
OVERRIDING SYSTEM VALUE
SELECT i, employee_id,typ.id,'T19-DOC-'||i,'2026-01-01','2026-12-31','active','verified'
FROM (VALUES (919111,919101),(919112,919102),(919113,919103)) s(i,employee_id)
CROSS JOIN LATERAL (SELECT id FROM public.hr_identity_document_types WHERE code='T19_LICENSE') typ;

SELECT pg_temp.t19_profile(2) AS recipient, pg_temp.t19_profile(3) AS sibling_recipient,
 pg_temp.t19_profile(4) AS foreign_recipient,pg_temp.t19_profile(5) AS inactive_recipient,
 pg_temp.t19_profile(6) AS fleet_recipient,pg_temp.t19_profile(7) AS expired_recipient \gset
SET LOCAL ROLE authenticated;
SELECT pg_temp.t19_actor(2) AS claims \gset
DO $$
BEGIN
 BEGIN
  PERFORM public.t19_save_expiry_policy(919001,919011,'hr',0,ARRAY[pg_temp.t19_profile(2)],false,NULL);
  RAISE EXCEPTION 'Scoped recipient changed a policy without global notification authority';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END;
$$;

SELECT pg_temp.t19_actor(1) AS claims \gset
DO $$
DECLARE policy jsonb; catalog jsonb;
BEGIN
 policy:=public.t19_read_expiry_policy(919001,919011,'hr');
 IF policy->'preExpiryDays'<>'[90,60,30,15,7,1]' OR policy->>'active'<>'false'
 THEN RAISE EXCEPTION 'Unconfigured policy must display six default pre-expiry days and remain inactive: %',policy; END IF;
 policy:=public.t19_save_expiry_policy(919001,919011,'hr',0,ARRAY[pg_temp.t19_profile(2)],false,NULL);
 IF policy->>'revision'<>'1' OR policy->>'active'<>'false' THEN RAISE EXCEPTION 'A saved policy enabled itself'; END IF;
 policy:=public.t19_save_expiry_policy(919001,919011,'hr',1,ARRAY[pg_temp.t19_profile(2)],false,NULL);
 IF policy->>'revision'<>'2' OR policy->>'active'<>'false' THEN RAISE EXCEPTION 'An inactive edit enabled itself'; END IF;
 catalog:=public.t19_expiry_policy_catalog(919001,919011,'hr');
 IF NOT (catalog->'recipients' @> jsonb_build_array(jsonb_build_object('id',pg_temp.t19_profile(2))))
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(catalog->'recipients') v
             WHERE (v->>'id')::bigint IN (pg_temp.t19_profile(3),pg_temp.t19_profile(4),
              pg_temp.t19_profile(5),pg_temp.t19_profile(7))) THEN
  RAISE EXCEPTION 'Wrong-branch, inactive or expired accounts reached the policy editor';
 END IF;
END;
$$;
RESET ROLE;
DO $$
BEGIN
 IF erp_private.t19_collect_expiry_events('2026-10-02',100)<>0 THEN RAISE EXCEPTION 'Inactive policy collected a notice'; END IF;
END;
$$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.t19_actor(1) AS claims \gset
SELECT public.t19_set_expiry_policy_active(919001,919011,'hr',2,true);
RESET ROLE;

DO $$
DECLARE remaining integer; n bigint;
BEGIN
 FOR remaining IN SELECT generate_series(-8,91) LOOP
  n:=erp_private.t19_collect_expiry_events('2026-12-31'::date-remaining,100);
  IF n<>(CASE WHEN remaining=ANY(ARRAY[90,60,30,15,7,1]) THEN 1 ELSE 0 END)
  THEN RAISE EXCEPTION 'Default calendar at % day(s) collected %',remaining,n; END IF;
  IF erp_private.t19_collect_expiry_events('2026-12-31'::date-remaining,100)<>0
  THEN RAISE EXCEPTION 'Scanning the same day duplicated an event'; END IF;
 END LOOP;
 IF (SELECT array_agg((source_snapshot->>'days_remaining')::int ORDER BY (source_snapshot->>'days_remaining')::int DESC)
     FROM erp_private.notification_events WHERE source_table='employee_identity_documents' AND source_id=919111)
     IS DISTINCT FROM ARRAY[90,60,30,15,7,1]
 THEN RAISE EXCEPTION 'Collected event history differs from six default dates'; END IF;
END;
$$;

-- The current roster is nominated under exact scope; a saved policy cannot
-- be used to appoint inactive, expired, sibling or foreign accounts.
SET LOCAL ROLE authenticated;
SELECT pg_temp.t19_actor(1) AS claims \gset
DO $$
DECLARE i integer;
BEGIN
 FOREACH i IN ARRAY ARRAY[3,4,5,7] LOOP
  BEGIN
   PERFORM public.t19_save_expiry_policy(919001,919011,'hr',3,ARRAY[pg_temp.t19_profile(i)],false,NULL);
   RAISE EXCEPTION 'Ineligible recipient % was admitted',i;
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
 END LOOP;
 BEGIN
  PERFORM public.t19_save_expiry_policy(919001,919021,'hr',0,ARRAY[pg_temp.t19_profile(2)],false,NULL);
  RAISE EXCEPTION 'A foreign branch was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 IF (public.t19_save_expiry_policy(919001,919011,'hr',3,ARRAY[pg_temp.t19_profile(2)],true,4)->>'active')::boolean IS NOT true THEN
  RAISE EXCEPTION 'Editing the configured alerts changed the activation state';
 END IF;
 PERFORM public.t19_save_expiry_policy(919001,919011,'fleet',0,ARRAY[pg_temp.t19_profile(6)],false,NULL);
 PERFORM public.t19_set_expiry_policy_active(919001,919011,'fleet',1,true);
END;
$$;
RESET ROLE;

DO $$
BEGIN
 IF erp_private.t19_collect_expiry_events('2026-12-31',100)<>1
   OR erp_private.t19_collect_expiry_events('2027-01-01',100)<>0
   OR erp_private.t19_collect_expiry_events('2027-01-04',100)<>1
   OR erp_private.t19_collect_expiry_events('2027-01-05',100)<>0
 THEN RAISE EXCEPTION 'Day zero and day four did not preserve independent event identities'; END IF;
 IF (SELECT ARRAY(SELECT event_type FROM erp_private.notification_events WHERE source_id=919111
       AND (source_snapshot->>'days_remaining')::int<=0 ORDER BY id))
   IS DISTINCT FROM ARRAY['compliance_expiry_day','compliance_expiry_escalation']
 THEN RAISE EXCEPTION 'Optional alerts were classified as default notices'; END IF;
END;
$$;

-- Use the canonical Fleet document, version and original file relationship.
-- Seed verified fixtures as the local database owner, without storage or upload calls.
SET LOCAL session_replication_role=replica;
INSERT INTO public.dms_document_categories(id,category_code,name_en) OVERRIDING SYSTEM VALUE
VALUES(919201,'T19_FLEET','Synthetic T19 Fleet');
INSERT INTO public.dms_document_types(id,type_code,name_en,category_id) OVERRIDING SYSTEM VALUE
VALUES(919201,'T19_REG','Synthetic registration',919201);
INSERT INTO erp_private.fleet_assets(id,asset_no,owner_company_id,home_branch_id,category,name,status,created_by)
OVERRIDING SYSTEM VALUE VALUES
 (919201,'T19-FLT','919001','919011','truck','Synthetic T19 held asset','active',pg_temp.t19_profile(6));
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status,current_version_id,issue_date,expiry_date)
OVERRIDING SYSTEM VALUE VALUES
 (919211,'T19-V1','Synthetic Fleet Registration',919201,919201,919001,919011,'internal','active',919211,'2026-01-01','2026-12-31');
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current)
OVERRIDING SYSTEM VALUE VALUES (919211,919211,1,true);
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
OVERRIDING SYSTEM VALUE VALUES
 (919211,919211,919211,'original','dms-documents','t19-synthetic.pdf','t19-synthetic.pdf','application/pdf',100,repeat('a',64),'verified');
INSERT INTO erp_private.fleet_document_parents(document_id,asset_id) VALUES(919211,919201);
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES(919211,'fleet_asset',919201);
INSERT INTO erp_private.fleet_asset_evidence(id,asset_id,kind,document_id,version_id,file_id,effective_on,expires_on,facts,verified_by)
OVERRIDING SYSTEM VALUE VALUES
 (919211,919201,'registration',919211,919211,919211,'2026-01-01','2026-12-31','{}',pg_temp.t19_profile(6));
SET LOCAL session_replication_role=origin;
INSERT INTO erp_private.fleet_asset_holds(asset_id,kind,placed_at,placed_by,reason)
VALUES (919201,'hse',statement_timestamp(),pg_temp.t19_profile(6),'Synthetic independent hold');

SET LOCAL session_replication_role=replica;
INSERT INTO public.employee_medical_insurances(id,employee_id,insurance_provider,policy_number,expiry_date,status,owner_company_id)
OVERRIDING SYSTEM VALUE VALUES
 (919121,919101,'Synthetic insurer','T19-SYNTHETIC-CREDENTIAL','2026-12-31','active',919001);
SET LOCAL session_replication_role=origin;

DO $$
BEGIN
 IF erp_private.t19_collect_expiry_events('2026-12-16',100)<>2 THEN
  RAISE EXCEPTION 'Fleet or medical dated source did not enter the existing outbox';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM erp_private.fleet_asset_holds WHERE asset_id=919201 AND released_at IS NULL) THEN
  RAISE EXCEPTION 'Reminder collection released the owning HSE hold';
 END IF;
 PERFORM public.f10_claim_notification_events(100);
END;
$$;

-- Exercise the production queue and its real lease, qualification and receipt.
CREATE FUNCTION pg_temp.t19_record(kind text,leaf bigint,remaining integer,person bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e erp_private.notification_events; recorded jsonb;
BEGIN
 SELECT * INTO STRICT e FROM erp_private.notification_events
 WHERE source_table=kind AND source_id=leaf AND (source_snapshot->>'days_remaining')::int=remaining;
 PERFORM public.f10_plan_notification_recipients(e.id,e.lease_token,ARRAY[person]);
 recorded:=public.f10_record_notification_recipient(e.id,e.lease_token,person,true);
 IF recorded IS DISTINCT FROM public.f10_record_notification_recipient(e.id,e.lease_token,person,true) AND recorded->>'state'='created'
 THEN RAISE EXCEPTION 'Retry changed a confirmed receipt'; END IF;
 RETURN recorded;
END;
$$;

DO $$
DECLARE fleet jsonb; hr jsonb; inactive jsonb; e erp_private.notification_events;
BEGIN
 SELECT * INTO STRICT e FROM erp_private.notification_events
   WHERE source_table='fleet_asset_evidence' AND source_id=919211;
 IF public.t19_expiry_recipients(e.id,e.lease_token) IS DISTINCT FROM jsonb_build_array(pg_temp.t19_profile(6))
   OR public.t19_expiry_recipients(e.id,e.lease_token,pg_temp.t19_profile(6)) IS DISTINCT FROM jsonb_build_array(pg_temp.t19_profile(6))
   OR public.t19_expiry_recipients(e.id,e.lease_token,pg_temp.t19_profile(2)) IS DISTINCT FROM '[]'::jsonb
 THEN RAISE EXCEPTION 'Fleet routing escaped its frozen, qualified roster'; END IF;
 fleet:=pg_temp.t19_record('fleet_asset_evidence',919211,15,pg_temp.t19_profile(6));
 hr:=pg_temp.t19_record('employee_identity_documents',919111,15,pg_temp.t19_profile(2));
 IF fleet->>'state'<>'created' OR hr->>'state'<>'created' OR fleet->>'outcome'<>'in_app_only'
   OR hr->>'outcome'<>'in_app_only' OR fleet->>'emailQueueId' IS NOT NULL OR hr->>'emailQueueId' IS NOT NULL
 THEN RAISE EXCEPTION 'Authorized in-app notices unavailable or a channel leaked'; END IF;
 IF (SELECT count(*) FROM public.erp_notifications WHERE recipient_user_id IN (pg_temp.t19_profile(2),pg_temp.t19_profile(6)))<>2
  OR EXISTS(SELECT 1 FROM public.erp_email_queue WHERE notification_id IN ((fleet->>'notificationId')::bigint,(hr->>'notificationId')::bigint))
 THEN RAISE EXCEPTION 'A retry duplicated a notice or requested external email'; END IF;
 IF pg_temp.t19_record('employee_medical_insurances',919121,15,pg_temp.t19_profile(2))->>'state'<>'held' THEN
  RAISE EXCEPTION 'General compliance admission was used for medical coverage';
 END IF;
 IF pg_temp.t19_record('employee_identity_documents',919111,7,pg_temp.t19_profile(3))->>'state'<>'held' THEN
  RAISE EXCEPTION 'A recorder call admitted a different branch recipient';
 END IF;
 PERFORM set_config('erp.t19_hr_notice',hr->>'notificationId',true);
 PERFORM set_config('erp.t19_fleet_notice',fleet->>'notificationId',true);
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t19_actor(6) AS claims \gset
DO $$
DECLARE opened jsonb;
BEGIN
 opened:=public.f10_prepare_notification_open(current_setting('erp.t19_fleet_notice')::bigint);
 IF opened->>'path' IS DISTINCT FROM '/modules/fleet/919201'
  OR NOT public.f10_complete_notification_open((opened->>'token')::uuid,opened->>'path') THEN
   RAISE EXCEPTION 'Fleet notice did not open and confirm its authorised exact destination';
 END IF;
END;
$$;
RESET ROLE;

-- Pause after the source was captured and verify a pending reminder is held.
SET LOCAL ROLE authenticated;
SELECT pg_temp.t19_actor(1) AS claims \gset
SELECT public.t19_set_expiry_policy_active(919001,919011,'hr',4,false);
RESET ROLE;
DO $$
BEGIN
 IF pg_temp.t19_record('employee_identity_documents',919111,60,pg_temp.t19_profile(2))->>'state'<>'held' THEN
  RAISE EXCEPTION 'Paused configuration delivered a pending reminder';
 END IF;
END;
$$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.t19_actor(1) AS claims \gset
SELECT public.t19_set_expiry_policy_active(919001,919011,'hr',5,true);
RESET ROLE;

-- Deliver the full default cycle using F10 routing, including a lost response
-- after each confirmed write. Its owning source and due cycle are distinct.
SELECT set_config('request.jwt.claims','{}',true) AS cleared_claims \gset
INSERT INTO public.employee_identity_documents(id,employee_id,document_type_id,document_number,issue_date,expiry_date,status,verification_status)
OVERRIDING SYSTEM VALUE
SELECT 919114,919101,id,'T19-SIX-EVENTS','2026-01-01','2026-12-30','active','verified'
FROM public.hr_identity_document_types WHERE code='T19_LICENSE';
DO $$
DECLARE n integer; e erp_private.notification_events; target bigint:=pg_temp.t19_profile(2);
 outcome jsonb; retry jsonb;
BEGIN
 FOREACH n IN ARRAY ARRAY[90,60,30,15,7,1] LOOP
  PERFORM erp_private.t19_collect_expiry_events('2026-12-30'::date-n,100);
 END LOOP;
 PERFORM public.f10_claim_notification_events(100);
 FOR e IN SELECT * FROM erp_private.notification_events WHERE source_table='employee_identity_documents' AND source_id=919114 LOOP
  IF public.f10_notification_routing_work(e.id,e.lease_token)->>'phase'<>'discover'
    OR NOT public.f10_prepare_notification_routing(e.id,e.lease_token,
      ARRAY(SELECT jsonb_array_elements_text(public.t19_expiry_recipients(e.id,e.lease_token))::bigint))
    OR public.f10_notification_routing_work(e.id,e.lease_token)->>'phase'<>'qualify'
    OR NOT public.f10_qualify_notification_candidate(e.id,e.lease_token,target,
       public.t19_expiry_recipients(e.id,e.lease_token,target)=jsonb_build_array(target))
    OR public.f10_notification_routing_work(e.id,e.lease_token)->>'phase'<>'ready'
  THEN RAISE EXCEPTION 'Durable qualification did not converge'; END IF;
  outcome:=public.f10_record_notification_recipient(e.id,e.lease_token,target,true);
  retry:=public.f10_record_notification_recipient(e.id,e.lease_token,target,true);
  IF outcome->>'state'<>'created' OR outcome IS DISTINCT FROM retry
   OR NOT public.f10_finish_notification_event(e.id,e.lease_token,'complete')
  THEN RAISE EXCEPTION 'A lost response did not reconcile the original delivery'; END IF;
 END LOOP;
 IF (SELECT count(*) FROM public.erp_notifications WHERE source_entity_type='employee_identity_documents'
       AND source_entity_id=919114 AND recipient_user_id=target AND channel_in_app AND NOT channel_email)<>6
  OR EXISTS(SELECT 1 FROM public.erp_email_queue WHERE source_entity_type='employee_identity_documents' AND source_entity_id=919114)
 THEN RAISE EXCEPTION 'Expected exactly six delivered in-app notices and no email'; END IF;
END;
$$;

-- Renew in the owning source. The old event remains available for audit but
-- delivery uses the new cycle only and cannot alter the separate Fleet hold.
SET LOCAL session_replication_role=replica;
UPDATE public.employee_identity_documents SET expiry_date=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date+90 WHERE id=919111;
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status,current_version_id,issue_date,expiry_date)
OVERRIDING SYSTEM VALUE VALUES
 (919212,'T19-V2','Synthetic renewed Fleet Registration',919201,919201,919001,919011,'internal','active',919212,
  (statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date,(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date+90);
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current)
OVERRIDING SYSTEM VALUE VALUES (919212,919212,1,true);
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
OVERRIDING SYSTEM VALUE VALUES
 (919212,919212,919212,'original','dms-documents','t19-renewal.pdf','t19-renewal.pdf','application/pdf',100,repeat('b',64),'verified');
INSERT INTO erp_private.fleet_document_parents(document_id,asset_id) VALUES(919212,919201);
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES(919212,'fleet_asset',919201);
INSERT INTO erp_private.fleet_asset_evidence(id,asset_id,kind,document_id,version_id,file_id,effective_on,expires_on,facts,verified_by,replaces_id)
OVERRIDING SYSTEM VALUE
SELECT 919212,919201,'registration',id,id,id,issue_date,expiry_date,'{}',pg_temp.t19_profile(6),919211
FROM public.dms_documents WHERE id=919212;
SET LOCAL session_replication_role=origin;
DO $$
BEGIN
 IF pg_temp.t19_record('employee_identity_documents',919111,30,pg_temp.t19_profile(2))->>'state'<>'held' THEN
  RAISE EXCEPTION 'An old date survived renewal dispatch validation';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM erp_private.fleet_asset_holds WHERE asset_id=919201 AND released_at IS NULL)
  OR (SELECT enabled FROM erp_private.notification_dispatch_control WHERE id=1)
  OR erp_private.f10_dispatch_notification_tick() IS NOT NULL
 THEN RAISE EXCEPTION 'A notice changed a hold or enabled scheduled dispatch'; END IF;
END;
$$;

SET LOCAL ROLE service_role;
SELECT set_config('erp.t19_renewed_count',public.f10_collect_hr_expiry_events(100)::text,true) AS renewed_count \gset
RESET ROLE;
DO $$
BEGIN
 IF current_setting('erp.t19_renewed_count')::int<>1
  OR EXISTS(SELECT 1 FROM erp_private.notification_events WHERE source_table='fleet_asset_evidence' AND source_id=919212)
 THEN RAISE EXCEPTION 'The HR-only worker must collect just the new HR Dubai expiry cycle'; END IF;
 IF has_function_privilege('authenticated','public.t19_collect_fleet_expiry_events(integer)','EXECUTE') THEN
  RAISE EXCEPTION 'Unauthorised application users can collect Fleet expiry';
 END IF;
END;
$$;
SET LOCAL ROLE service_role;
SELECT set_config('erp.t19_fleet_renewed_count',public.t19_collect_fleet_expiry_events(100)::text,true) AS renewed_count \gset
RESET ROLE;
DO $$
BEGIN
 IF current_setting('erp.t19_fleet_renewed_count')::int<>1 OR NOT EXISTS(
  SELECT 1 FROM erp_private.notification_events WHERE source_table='fleet_asset_evidence'
   AND source_id=919212 AND (source_snapshot->>'days_remaining')::int=90
 ) THEN RAISE EXCEPTION 'Fleet collection missed the new verified expiry cycle'; END IF;
END;
$$;
SELECT 'T19 cadence, authorization, synthetic delivery, renewal and independent holds passed';
ROLLBACK;




