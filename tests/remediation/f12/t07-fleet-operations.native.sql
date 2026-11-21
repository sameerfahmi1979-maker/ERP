\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
 IF current_database()<>'t00_clean' OR current_setting('cron.launch_active_jobs')<>'off'
   OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
      IS DISTINCT FROM 'Isolated HR T00 20261119' THEN RAISE EXCEPTION 'Isolated T00 database required'; END IF;
 IF to_regprocedure('public.t07_fleet_operation(uuid,bigint,text,jsonb)') IS NULL
   OR to_regprocedure('public.t07_fleet_operation_detail(bigint)') IS NULL
 THEN RAISE EXCEPTION 'T07 scoped Fleet operation commands and reads are missing'; END IF;
END;
$$;
INSERT INTO auth.users(id,email,aud,role,email_confirmed_at)
SELECT ('98000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'t06-'||i||'@example.test','authenticated','authenticated',now()
FROM generate_series(1,9) i;
INSERT INTO auth.sessions(id,user_id,created_at,not_after)
SELECT replace(id::text,'-8000-','-8001-')::uuid,id,now(),now()+interval '1 day'
FROM auth.users WHERE email LIKE 't06-%@example.test';
INSERT INTO public.user_profiles(auth_user_id,full_name,status,must_change_password)
SELECT id,'Synthetic T06 actor','active',false FROM auth.users WHERE email LIKE 't06-%@example.test' ON CONFLICT(auth_user_id) DO NOTHING;
UPDATE public.user_profiles SET status='active',must_change_password=false WHERE auth_user_id IN(SELECT id FROM auth.users WHERE email LIKE 't06-%@example.test');

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope)
SELECT code,code,'DMS','test','held' FROM unnest(ARRAY['dms.documents.view','dms.documents.edit','dms.documents.preview']) code
ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.roles(role_code,role_name,is_system_role)
SELECT 't06_'||r,r,false FROM unnest(ARRAY['custodian','keeper','manager','workshop','hse','policy']) r;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t06_custodian',ARRAY['fleet.assets.view','fleet.assets.manage','fleet.assets.documents','fleet.custody.manage','fleet.custody.approve','fleet.availability.plan',
   'dms.documents.view','dms.documents.edit','dms.documents.preview']),
 ('t06_keeper',ARRAY['fleet.assets.view','fleet.custody.manage','fleet.availability.plan']),
 ('t06_manager',ARRAY['fleet.assets.view','integrated.custody.transfer']),
 ('t06_workshop',ARRAY['fleet.assets.view','fleet.holds.workshop']),
 ('t06_hse',ARRAY['fleet.assets.view','fleet.holds.hse']),
 ('t06_policy',ARRAY['fleet.assets.view','fleet.availability.policy'])
) grants(code,caps) JOIN public.roles r ON r.role_code=grants.code JOIN public.permissions p ON p.permission_code=ANY(grants.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT u.id,r.id,a.company,a.branch,true FROM (VALUES
 (1,'t06_custodian',920001,920011),(1,'t06_keeper',920002,920021),(1,'t06_policy',920001,NULL),
 (2,'t06_manager',920001,NULL),(2,'t06_manager',920002,NULL),
 (3,'t06_manager',920001,NULL),(3,'t06_manager',920002,920021),
 (4,'t06_workshop',920001,920011),(5,'t06_hse',920001,920011),
 (6,'t06_keeper',920001,920012),(7,'t06_policy',920001,NULL),(8,'system_admin',NULL,NULL),(9,'t06_keeper',920002,920021)
) a(i,role_code,company,branch)
JOIN public.user_profiles u ON u.auth_user_id=('98000000-0000-4000-8000-'||lpad(a.i::text,12,'0'))::uuid
JOIN public.roles r ON r.role_code=a.role_code;

CREATE FUNCTION pg_temp.t06_actor(i int) RETURNS text LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'sub','98000000-0000-4000-8000-'||lpad(i::text,12,'0'),
  'session_id','98000000-0000-4000-8001-'||lpad(i::text,12,'0'))::text,true);
$$;
CREATE FUNCTION pg_temp.t06_op(i int) RETURNS uuid LANGUAGE sql AS $$
 SELECT ('98000000-0000-4000-8002-'||lpad(i::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.t06_var(k text) RETURNS bigint LANGUAGE sql AS $$ SELECT current_setting('erp.t06_'||k)::bigint; $$;
CREATE FUNCTION pg_temp.t06_set(k text,v jsonb) RETURNS void LANGUAGE sql AS $$ SELECT set_config('erp.t06_'||k,v->>'id',true); $$;
CREATE FUNCTION pg_temp.t06_when(n int) RETURNS timestamptz LANGUAGE sql STABLE AS $$ SELECT now()+make_interval(mins=>n); $$;
CREATE FUNCTION pg_temp.t06_facts() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT '{"condition":"good","meter":20,"meter_unit":"km"}'::jsonb; $$;
CREATE FUNCTION pg_temp.t06_signed() RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT '{"condition":"damaged","meter":21,"meter_unit":"km","document":980101,"version":980101,"file":980101}'::jsonb;
$$;
CREATE FUNCTION pg_temp.t06_trip(worker bigint,site bigint,t1 timestamptz,t2 timestamptz) RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('employee',worker,'site',site,'from',t1,'until',t2,'reason','Synthetic Fleet movement','snapshot',pg_temp.t06_facts());
$$;

SET LOCAL session_replication_role=replica;
INSERT INTO public.employees(id,employee_code,full_name_en,gender,date_of_birth,joining_date,actual_joining_date,
 owner_company_id,branch_id,employee_status,employee_category_id)
 OVERRIDING SYSTEM VALUE VALUES
 (980001,'T06-A1','Synthetic T06 Custodian A','male','1992-01-01','2024-01-01','2024-01-01',920001,920011,'active',920001),
 (980002,'T06-A2','Synthetic T06 Custodian B','male','1992-01-01','2024-01-01','2024-01-01',920001,920011,'active',920001),
 (980003,'T06-B1','Synthetic T06 Receiving Employee','male','1992-01-01','2024-01-01','2024-01-01',920002,920021,'active',920001);
INSERT INTO public.work_sites(id,site_code,site_name,site_type,owner_company_id,branch_id) OVERRIDING SYSTEM VALUE VALUES
 (980001,'T06-YARD-A','Synthetic custody yard A','yard',920001,920011),
 (980002,'T06-YARD-B','Synthetic custody yard B','yard',920002,920021);
INSERT INTO public.dms_document_categories(id,category_code,name_en) OVERRIDING SYSTEM VALUE VALUES(980101,'T06_EVIDENCE','Synthetic custody evidence');
INSERT INTO public.dms_document_types(id,type_code,name_en,category_id) OVERRIDING SYSTEM VALUE VALUES
 (980101,'FLEET_CUSTODY_ACK','Synthetic signed custody acknowledgement',980101),
 (980102,'VEHICLE_REGISTRATION','Synthetic vehicle registration',980101),
 (980103,'DRIVING_LICENSE','Synthetic HR driving licence',980101) ON CONFLICT(type_code) DO NOTHING;
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status,current_version_id,issue_date,expiry_date)
 OVERRIDING SYSTEM VALUE
 SELECT id,'T06-PROOF-'||id,doc_name,(SELECT t.id FROM public.dms_document_types t WHERE t.type_code=type),980101,920001,920011,
  'internal','active',id,issued,expires
 FROM (VALUES (980101,'FLEET_CUSTODY_ACK','Synthetic signed return',NULL::date,NULL::date),
  (980102,'VEHICLE_REGISTRATION','Synthetic expired registration','2025-01-01','2025-12-31'),
  (980103,'DRIVING_LICENSE','Synthetic HR licence','2026-01-01','2027-12-31')) sample(id,type,doc_name,issued,expires);
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current)
 OVERRIDING SYSTEM VALUE SELECT id,id,1,true FROM public.dms_documents WHERE id BETWEEN 980101 AND 980103;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
 OVERRIDING SYSTEM VALUE SELECT id,id,id,'original','dms-documents','test/t06-'||id||'.pdf','evidence.pdf','application/pdf',100,repeat('a',64),'verified'
 FROM public.dms_documents WHERE id BETWEEN 980101 AND 980103;
INSERT INTO public.hr_identity_document_types(id,code,name_en) OVERRIDING SYSTEM VALUE VALUES(980101,'DRIVING_LICENSE','Synthetic verified driver licence')
 ON CONFLICT(code) DO NOTHING;
INSERT INTO public.employee_identity_documents(id,employee_id,document_type_id,document_number,issue_date,expiry_date,status,verification_status,dms_document_id)
 OVERRIDING SYSTEM VALUE SELECT 980101,980001,t.id,'SYNTHETIC-HR-NUMBER','2026-01-01','2027-12-31','active','verified',980103
 FROM public.hr_identity_document_types t WHERE t.code='DRIVING_LICENSE';
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES(980103,'employee',980001);
SET LOCAL session_replication_role=origin;

WITH sources AS (
 INSERT INTO erp_private.t03_employment_changes(employee_id,source_revision,kind,effective_on,source_company,source_branch,
  destination_company,destination_branch,reason,digest,proposed_by,applied_by,applied_at)
 SELECT e.id,e.workspace_revision,'confirm','2024-01-01',e.owner_company_id,e.branch_id,e.owner_company_id,e.branch_id,
  'Synthetic verified employment',repeat('f',64),'98000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000007',now()
  FROM public.employees e WHERE e.id BETWEEN 980001 AND 980003 RETURNING *
)
INSERT INTO erp_private.t03_employment_periods(employee_id,company_id,branch_id,employee_category_id,work_period,
 contractual_start,actual_start,source_revision,change_id)
SELECT employee_id,source_company,source_branch,920001,daterange('2024-01-01',NULL,'[)'),'2024-01-01','2024-01-01',source_revision,id FROM sources;

INSERT INTO erp_private.fleet_assets(id,asset_no,owner_company_id,home_branch_id,category,name,status,created_by)
 OVERRIDING SYSTEM VALUE
SELECT sample.id,'T06-TEST-'||sample.id,920001,920011,sample.category,'Synthetic T06 asset '||sample.id,sample.status,p.id
FROM (VALUES (980101,'light_vehicle','active'),(980102,'light_vehicle','active'),
 (980103,'equipment','active'),(980104,'light_vehicle','draft')) sample(id,category,status)
CROSS JOIN public.user_profiles p WHERE p.auth_user_id='98000000-0000-4000-8000-000000000001';
INSERT INTO erp_private.fleet_asset_history(asset_id,kind,effective_on,facts,reason,recorded_by)
SELECT id,'lifecycle','2025-01-01','{"status":"active"}','Synthetic verified asset',created_by
FROM erp_private.fleet_assets WHERE id BETWEEN 980101 AND 980103;
INSERT INTO erp_private.fleet_asset_plates(asset_id,jurisdiction,plate_class,plate_number,valid_from,valid_until,reason,recorded_by)
SELECT id,'AEDU','C','T06PLATE',lower_day,upper_day,'Synthetic verified plate',created_by
FROM erp_private.fleet_assets a JOIN (VALUES (980101,'2025-01-01'::date,'2026-11-19'::date),
 (980102,'2026-11-19',NULL)) period(asset,lower_day,upper_day) ON period.asset=a.id;


INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope)
 VALUES('master_data.parties.view','Synthetic scoped Party Master','master_data','test','held') ON CONFLICT(permission_code) DO NOTHING;
CREATE TEMP TABLE t07_caps(role_code text,codes text[]);
INSERT INTO t07_caps VALUES
 ('t06_custodian',ARRAY['fleet.operations.view','fleet.operations.manage','fleet.operations.commercial','master_data.parties.view']),
 ('t06_policy',ARRAY['fleet.operations.view','fleet.operations.approve','fleet.operations.commercial','fleet.custody.approve','fleet.availability.plan','dms.documents.view','dms.documents.preview']),
 ('t06_keeper',ARRAY['fleet.operations.view']),
 ('t06_workshop',ARRAY['fleet.operations.view']);
INSERT INTO public.role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM t07_caps x JOIN public.roles r ON r.role_code=x.role_code JOIN public.permissions p ON p.permission_code=ANY(x.codes)
 ON CONFLICT DO NOTHING;
INSERT INTO erp_private.fleet_availability_policies(company_id,category,valid_during,routine_minutes,signed_handover,registration_required,
 insurance_required,tentative_allowed,prepared_by,approved_by,approved_at,reason)
VALUES(920001,'light_vehicle',daterange('2025-01-01','2029-01-01','[)'),360,false,false,false,true,
 (SELECT p.id FROM public.user_profiles p WHERE p.auth_user_id='98000000-0000-4000-8000-000000000001'),
 (SELECT p.id FROM public.user_profiles p WHERE p.auth_user_id='98000000-0000-4000-8000-000000000007'),
 now(),'Synthetic approved Fleet operating policy');

SET LOCAL session_replication_role=replica;
INSERT INTO public.work_sites(id,site_code,site_name,site_type,owner_company_id,branch_id,site_contact_name,site_contact_phone)
 OVERRIDING SYSTEM VALUE VALUES (990001,'T07-POD','Synthetic delivery site','client_site',920001,920011,'Synthetic contact','0500000001');
INSERT INTO public.countries(id,country_code,iso3_code,name_en,nationality_en)
 OVERRIDING SYSTEM VALUE VALUES(990001,'ZZ','ZZZ','Synthetic country','Synthetic origin') ON CONFLICT(country_code) DO NOTHING;
INSERT INTO public.party_natures(id,nature_code,name_en) OVERRIDING SYSTEM VALUE VALUES(990001,'T07_CORP','Synthetic corporate party');
INSERT INTO public.party_statuses(id,status_code,name_en) OVERRIDING SYSTEM VALUE VALUES(990001,'T07_CURRENT','Synthetic active');
INSERT INTO public.parties(id,party_code,display_name,legal_name_en,party_nature_id,country_id,party_status_id)
 OVERRIDING SYSTEM VALUE
 SELECT sample.id,code,party_name,party_name,990001,c.id,990001 FROM (VALUES
  (990001,'T07-CUSTOMER','Synthetic Fleet customer'),(990002,'T07-SUPPLIER','Synthetic Fleet supplier')) sample(id,code,party_name)
 JOIN public.countries c ON c.country_code='ZZ';
INSERT INTO public.currencies(id,currency_code,currency_name_en,decimal_places) OVERRIDING SYSTEM VALUE
 VALUES(990001,'AED','Synthetic dirham',2) ON CONFLICT(currency_code) DO NOTHING;
INSERT INTO public.dms_document_categories(id,category_code,name_en) OVERRIDING SYSTEM VALUE VALUES(990001,'T07_OPS','Synthetic Fleet proof');
INSERT INTO public.dms_document_types(id,type_code,name_en,category_id) OVERRIDING SYSTEM VALUE VALUES
 (990001,'FLEET_TRIP_ORDER','Signed Trip Order',990001),(990002,'FLEET_PRE_TRIP_INSPECTION','Pre-trip inspection',990001),
 (990003,'FLEET_SIGNED_POD','Signed delivery',990001),(990004,'FLEET_WEIGH_TICKET','Weigh ticket',990001),
 (990005,'FLEET_SIGNED_RENTAL_SHEET','Signed rental sheet',990001),(990006,'FLEET_RENTAL_NOTICE','Rental milestone',990001),
 (990007,'FLEET_RENTAL_AGREEMENT','Signed rental agreement',990001)
 ON CONFLICT(type_code) DO NOTHING;
CREATE TEMP TABLE t07_documents(id bigint,code text,asset bigint);
INSERT INTO t07_documents VALUES
 (990101,'FLEET_TRIP_ORDER',980101),(990102,'FLEET_PRE_TRIP_INSPECTION',980101),(990103,'FLEET_SIGNED_POD',980101),
 (990104,'FLEET_WEIGH_TICKET',980101),(990105,'FLEET_TRIP_ORDER',980101),(990106,'FLEET_PRE_TRIP_INSPECTION',980101),
 (990107,'FLEET_SIGNED_POD',980101),
 (990201,'FLEET_CUSTODY_ACK',980102),(990202,'FLEET_CUSTODY_ACK',980102),(990203,'FLEET_SIGNED_RENTAL_SHEET',980102),
 (990204,'FLEET_RENTAL_NOTICE',980102),(990205,'FLEET_RENTAL_NOTICE',980102),(990206,'FLEET_RENTAL_NOTICE',980102),
 (990207,'FLEET_RENTAL_NOTICE',980102),(990208,'FLEET_RENTAL_NOTICE',980102),(990209,'FLEET_RENTAL_NOTICE',980102),
 (990210,'FLEET_RENTAL_AGREEMENT',980102),(990211,'FLEET_RENTAL_NOTICE',980102),
 (990213,'FLEET_CUSTODY_ACK',980101),(990214,'FLEET_CUSTODY_ACK',980102),(990215,'FLEET_SIGNED_RENTAL_SHEET',980101),
 (990216,'FLEET_SIGNED_RENTAL_SHEET',980102);
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,
 confidentiality_level,status,current_version_id)
 OVERRIDING SYSTEM VALUE SELECT fixture.id,'T07-PROOF-'||fixture.id,'Synthetic '||fixture.code,t.id,990001,920001,920011,
  'internal','active',fixture.id FROM t07_documents fixture JOIN public.dms_document_types t ON t.type_code=fixture.code;
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current)
 OVERRIDING SYSTEM VALUE SELECT id,id,1,true FROM t07_documents;
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current)
 OVERRIDING SYSTEM VALUE VALUES(990212,990203,2,false);
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
 OVERRIDING SYSTEM VALUE SELECT id,id,id,'original','dms-documents','test/t07-'||id||'.pdf','evidence.pdf','application/pdf',100,repeat('a',64),'verified'
 FROM t07_documents;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
 OVERRIDING SYSTEM VALUE VALUES(990212,990203,990212,'original','dms-documents','test/t07-990212.pdf','revision.pdf','application/pdf',100,repeat('2',64),'verified');
SET LOCAL session_replication_role=origin;
GRANT SELECT ON t07_documents TO authenticated;

CREATE FUNCTION pg_temp.t07_command(p_order bigint,p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.t07_fleet_operation(gen_random_uuid(),p_order,p_action,p_data||jsonb_build_object('reason','Synthetic T07 operation',
   'revision',(public.t07_fleet_operation_detail(p_order)->>'revision')::integer));
$$;
CREATE FUNCTION pg_temp.t07_packet(p_subject bigint,p_reference text)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
 SELECT jsonb_build_object('document',p_subject,'version',p_subject,'file',p_subject,'reference',p_reference);
$$;
CREATE FUNCTION pg_temp.t07_move(p_asset bigint,p_employee bigint,p_start int,p_return int)
RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('asset',p_asset,'employee',p_employee,'slot',1,'from',pg_temp.t06_when(p_start),'until',pg_temp.t06_when(p_return));
$$;

CREATE FUNCTION pg_temp.t07_publish_test_paper(p_order bigint,p_issue bigint) RETURNS void LANGUAGE plpgsql AS $$
DECLARE claims jsonb:=auth.jwt(); wrong_actor jsonb:=pg_temp.t06_actor(7)::jsonb;
 fixture text:=encode(convert_to('%PDF-1.4'||repeat(' ',102)||'%%EOF','UTF8'),'base64');
BEGIN
 RESET ROLE;
 SET LOCAL ROLE service_role;
 PERFORM set_config('request.jwt.claims','{"role":"service_role"}',true);
 IF public.t07_publish_trip_order(p_order,p_issue,wrong_actor,fixture) THEN RAISE EXCEPTION 'Wrong issuer finalized the PDF'; END IF;
 IF NOT public.t07_publish_trip_order(p_order,p_issue,claims,fixture) THEN RAISE EXCEPTION 'Pending issue did not retain the bytes'; END IF;
 IF NOT public.t07_publish_trip_order(p_order,p_issue,claims,encode(convert_to('%PDF-1.5'||repeat(' ',102)||'%%EOF','UTF8'),'base64'))
 THEN RAISE EXCEPTION 'Retry did not return retained publication'; END IF;
 SET LOCAL ROLE authenticated;
 PERFORM set_config('request.jwt.claims',claims::text,true);
 IF public.t07_fleet_trip_order_pdf(p_order,p_issue)->>'sha256' IS DISTINCT FROM encode(extensions.digest(decode(fixture,'base64'),'sha256'),'hex')
 THEN RAISE EXCEPTION 'Original PDF was not retained on retry'; END IF;
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(1) AS claims \gset
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id)
 SELECT id,'fleet_asset',asset FROM t07_documents;

DO $$
DECLARE job bigint; second_job bigint; moved bigint; first bigint; current_paper bigint; old_paper bigint; snapshot jsonb;
 hold_id bigint; booked bigint; signed_packet jsonb; job_ref text; step jsonb; seq bigint; first_receipt jsonb;
 request jsonb:='{"company":920001,"branch":920011,"site":980001,"kind":"trip","reference":"T07-Job-001","subject":"Synthetic first trip","reason":"Create scoped request"}';
 paper_nonce uuid:=pg_temp.t06_op(90);
BEGIN
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.t07_fleet_operation_choices(920001,920011,'Fleet customer')->'parties') p
   WHERE p->>'id'='990001') THEN RAISE EXCEPTION 'Scoped Party Master choices unavailable'; END IF;
 first_receipt:=public.t07_fleet_operation(paper_nonce,NULL,'create',request);
 job:=(first_receipt->>'id')::bigint;
 IF first_receipt->>'order_no'!~'^FOP-[0-9]{6}$'
 OR public.t07_fleet_operation(paper_nonce,NULL,'create',request) IS DISTINCT FROM first_receipt||'{"replayed":true}'::jsonb
 THEN RAISE EXCEPTION 'Operation reference or exact create retry invalid'; END IF;
 first:=(pg_temp.t07_command(job,'plan-leg','{"sequence":1,"origin":980001,"destination":990001,"load":"loaded","cargo":"Synthetic steel",
   "instructions":"Use loading gate A","pickup_phone":"0500000002"}')->>'event_id')::bigint;
 seq:=(pg_temp.t07_command(job,'plan-leg','{"sequence":2,"origin":990001,"destination":980001,"load":"empty"}')->>'event_id')::bigint;
 IF (pg_temp.t07_command(job,'plan-leg',jsonb_build_object('leg',first,'origin',980001,'destination',990001,
   'load','loaded','cargo','Synthetic steel','pickup_phone','0500000002','instructions','Use approved gate B'))->>'event_id')::bigint<>first
 THEN RAISE EXCEPTION 'Draft leg edit lost identity'; END IF;
 BEGIN
   PERFORM pg_temp.t07_command(job,'authorize','{"authorization":"SELF"}');
   RAISE EXCEPTION 'Requester authorized own trip';
 EXCEPTION WHEN insufficient_privilege OR SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t07_command(job,'authorize','{"authorization":"APPROVED-DO-001"}');
 PERFORM pg_temp.t06_actor(1);
 moved:=(pg_temp.t07_command(job,'assign',pg_temp.t07_move(980102,980002,-30,50))->>'event_id')::bigint;
 old_paper:=(pg_temp.t07_command(job,'issue-paper','{}')->>'event_id')::bigint;
 IF public.t07_fleet_trip_order_pdf(job,old_paper) IS NOT NULL THEN RAISE EXCEPTION 'Pending PDF was visible as issued'; END IF;
 PERFORM pg_temp.t07_publish_test_paper(job,old_paper);

 second_job:=(pg_temp.t07_command(NULL,'create',request||'{"subject":"Synthetic competing trip","reference":"T07-Job-002"}')->>'id')::bigint;
 PERFORM pg_temp.t07_command(second_job,'plan-leg','{"sequence":1,"origin":980001,"destination":990001,"load":"empty"}');
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t07_command(second_job,'authorize','{"authorization":"APPROVED-DO-002"}');
 PERFORM pg_temp.t06_actor(1);
 BEGIN
   PERFORM pg_temp.t07_command(second_job,'assign',pg_temp.t07_move(980102,980001,-25,40));
   RAISE EXCEPTION 'Conflicting T07 reservation admitted';
 EXCEPTION WHEN SQLSTATE 'PT409' OR exclusion_violation THEN NULL; END;

 moved:=(pg_temp.t07_command(job,'substitute',pg_temp.t07_move(980101,980001,-29,50)||jsonb_build_object('assignment',moved))->>'event_id')::bigint;
 current_paper:=(pg_temp.t07_command(job,'issue-paper','{}')->>'event_id')::bigint;
 PERFORM pg_temp.t07_publish_test_paper(job,current_paper);
 IF NOT (public.t07_fleet_trip_order(job,old_paper)->'snapshot'->'assignments'->0->>'asset_no' ILIKE '%980102')
  OR NOT (public.t07_fleet_trip_order(job,current_paper)->'snapshot'->'assignments'->0->>'asset_no' ILIKE '%980101')
  OR public.t07_fleet_trip_order(job,current_paper)->'snapshot'->'legs'->0->>'delivery_phone'<>'0500000001'
  OR public.t07_fleet_trip_order(job,current_paper)->'snapshot'->'legs'->0->>'instructions'<>'Use approved gate B'
 THEN RAISE EXCEPTION 'Issued history, replacement or site contact was overwritten'; END IF;
 job_ref:=public.t07_fleet_trip_order(job,current_paper)->>'issue';
 snapshot:=pg_temp.t06_facts();
 signed_packet:=pg_temp.t07_packet(990101,'Paper-Outage-778');
 PERFORM pg_temp.t07_command(job,'inspect',jsonb_build_object('assignment',moved,'at',pg_temp.t06_when(-35),'passed',true,
     'evidence',pg_temp.t07_packet(990102,'PRE-TRIP-001')));
 step:=jsonb_build_object('assignment',moved,'at',pg_temp.t06_when(-28),'snapshot',snapshot,'issue',old_paper,
  'evidence',signed_packet,'offline',true);
 BEGIN
  PERFORM pg_temp.t07_command(job,'start',step);
  RAISE EXCEPTION 'Superseded paper authorized dispatch';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 step:=step||jsonb_build_object('issue',current_paper);
 PERFORM pg_temp.t06_actor(4);
 hold_id:=(public.t06_fleet_command(pg_temp.t06_op(91),980101,'place-hold','{"kind":"workshop","reason":"Synthetic safety hold"}')->>'id')::bigint;
 PERFORM pg_temp.t06_actor(1);
 IF (public.t07_fleet_operations('T07-Job-001','trip',NULL)->0->>'next_action') IS DISTINCT FROM 'resolve-hold'
 THEN RAISE EXCEPTION 'Held trip not searchable with next action'; END IF;
 BEGIN
  PERFORM pg_temp.t07_command(job,'start',step);
  RAISE EXCEPTION 'Workshop hold passed dispatch';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(4);
 PERFORM public.t06_fleet_command(pg_temp.t06_op(92),980101,'release-hold',jsonb_build_object('hold',hold_id,'reason','Workshop cleared'));
 PERFORM pg_temp.t06_actor(1);
 PERFORM pg_temp.t07_command(job,'start',step);
 PERFORM pg_temp.t07_command(job,'complete-leg',jsonb_build_object('assignment',moved,'leg',first,'origin',980001,'destination',990001,
  'from',pg_temp.t06_when(-27),'until',pg_temp.t06_when(-25),'load','loaded','cargo','Synthetic steel',
  'delivery','missing','discrepancy','Paper POD still due','gross_kg',34000,'tare_kg',14000,'weigh',pg_temp.t07_packet(990104,'WEIGH-001')));
 PERFORM pg_temp.t07_command(job,'complete-leg',jsonb_build_object('assignment',moved,'leg',seq,'origin',990001,'destination',980001,
  'from',pg_temp.t06_when(-24),'until',pg_temp.t06_when(-22),'load','empty','delivery','not-required'));
 step:=public.t07_fleet_operation_detail(job);
 IF step->>'status'<>'review' OR step->'legs'->0->>'delivery'<>'missing' OR (step->'legs'->0->>'net_kg')::numeric<>20000
   OR step->'legs'->1->>'delivery'<>'not-required' THEN RAISE EXCEPTION 'Phased leg and weighed/POD states were conflated'; END IF;
 PERFORM pg_temp.t07_command(job,'return',jsonb_build_object('assignment',moved,'at',pg_temp.t06_when(-21),'snapshot',snapshot));
 IF pg_temp.t07_command(job,'complete','{}')->>'status'<>'review' THEN RAISE EXCEPTION 'Missing POD closed trip'; END IF;
 PERFORM pg_temp.t07_command(job,'resolve-pod',jsonb_build_object('leg',first,'pod',pg_temp.t07_packet(990103,'POD-001')));
 BEGIN
   PERFORM public.f07_change_document_version(990103,990103,'unlink',990103);
   RAISE EXCEPTION 'DMS detached an accepted signed original';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 RESET ROLE;
 UPDATE public.dms_documents SET is_archived=true WHERE id=990103;
 SET LOCAL ROLE authenticated;
 IF public.t07_fleet_operation_detail(job)#>>'{legs,0,pod_current}'<>'false'
    OR pg_temp.t07_command(job,'complete','{}')->>'status'<>'review'
 THEN RAISE EXCEPTION 'Stale accepted POD was hidden from repair'; END IF;
 PERFORM pg_temp.t07_command(job,'resolve-pod',jsonb_build_object('leg',first,'pod',pg_temp.t07_packet(990107,'POD-002')));
 IF pg_temp.t07_command(job,'complete','{}')->>'status'<>'completed' THEN RAISE EXCEPTION 'Signed POD did not release trip review'; END IF;
 BEGIN
  PERFORM pg_temp.t07_command(job,'reopen','{}');
  RAISE EXCEPTION 'Unauthorized reopening';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;

 moved:=(pg_temp.t07_command(second_job,'assign',pg_temp.t07_move(980101,980001,-19,40))->>'event_id')::bigint;
 current_paper:=(pg_temp.t07_command(second_job,'issue-paper','{}')->>'event_id')::bigint;
 PERFORM pg_temp.t07_publish_test_paper(second_job,current_paper);
 PERFORM pg_temp.t07_command(second_job,'inspect',jsonb_build_object('assignment',moved,'at',pg_temp.t06_when(-23),'passed',true,
     'evidence',pg_temp.t07_packet(990106,'PRE-TRIP-002')));
 BEGIN
   PERFORM pg_temp.t07_command(second_job,'start',jsonb_build_object('assignment',moved,'at',pg_temp.t06_when(-18),'snapshot',snapshot,
     'issue',current_paper,'evidence',pg_temp.t07_packet(990105,'paper outage 778'),'offline',true));
   RAISE EXCEPTION 'Duplicate normalized outage paper was accepted';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 PERFORM pg_temp.t07_command(second_job,'cancel-assignment',jsonb_build_object('assignment',moved));
 PERFORM pg_temp.t07_command(second_job,'cancel','{}');
 PERFORM set_config('erp.t07_trip',job::text,true);
END;
$$;

DO $$
DECLARE o bigint; a bigint; reviewed bigint; s1 bigint; s2 bigint; s3 bigint; s4 bigint; grant_id bigint;
 result jsonb; rows jsonb; usage_a bigint; usage_b bigint; old_commitment bigint; rental_end timestamptz:=pg_temp.t06_when(1440);
 packet jsonb; denied_cap bigint; row_id bigint; source_version bigint;
BEGIN
 o:=(pg_temp.t07_command(NULL,'create','{"company":920001,"branch":920011,"site":980001,
  "kind":"rental","rental_mode":"wet","customer":990001,"supplier":990002,"reference":"T07-RENT-01","subject":"Synthetic wet cross-hire"}')->>'id')::bigint;
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t07_command(o,'authorize','{"authorization":"APPROVED-RENTAL"}');
 PERFORM pg_temp.t06_actor(1);
 a:=(pg_temp.t07_command(o,'assign',pg_temp.t07_move(980102,980002,-13,45)||jsonb_build_object('until',rental_end))->>'event_id')::bigint;
 -- A protected reservation cannot be cancelled from the inherited T06 screen.
 RESET ROLE;
 SELECT item.reservation_id INTO old_commitment FROM erp_private.fleet_operation_assignments item WHERE item.id=a;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(1);
 BEGIN
  PERFORM public.t06_fleet_command(pg_temp.t06_op(93),980102,'cancel',jsonb_build_object('commitment',old_commitment,'revision',1,'reason','Attempt to cancel outside owner'));
  RAISE EXCEPTION 'Legacy custody bypassed T07 order';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 packet:=jsonb_build_object('assignment',a,'at',pg_temp.t06_when(-12),'snapshot',pg_temp.t06_facts(),
   'evidence',pg_temp.t07_packet(990201,'HANDOVER-001'));
 BEGIN
   PERFORM pg_temp.t07_command(o,'start',packet);
   RAISE EXCEPTION 'Generic rental approval allowed extended named handover';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t07_command(o,'approve-handover',jsonb_build_object('assignment',a));
 PERFORM pg_temp.t06_actor(1);
 PERFORM pg_temp.t07_command(o,'start',packet);
 PERFORM pg_temp.t07_command(o,'record-sheet',jsonb_build_object('assignment',a,'evidence',pg_temp.t07_packet(990203,'SHEET-01'),
   'lines',jsonb_build_array(
      jsonb_build_object('from',pg_temp.t06_when(-11),'until',pg_temp.t06_when(-8),'state','signed'),
      jsonb_build_object('from',pg_temp.t06_when(-8),'until',pg_temp.t06_when(-6),'state','signed'),
      jsonb_build_object('from',pg_temp.t06_when(-6),'until',pg_temp.t06_when(-5),'state','disputed','reason','Customer discrepancy'),
      jsonb_build_object('from',pg_temp.t06_when(-5),'until',pg_temp.t06_when(-3),'state','missing','reason','Unsigned portion'))));
 rows:=public.t07_fleet_operation_detail(o)->'usage';
 IF jsonb_array_length(rows)<>4 OR rows->2->>'state'<>'disputed' OR rows->3->>'state'<>'missing'
 THEN RAISE EXCEPTION 'Partial signed sheet lost original interval states'; END IF;
 usage_a:=(rows->0->>'id')::bigint; usage_b:=(rows->1->>'id')::bigint;
 PERFORM pg_temp.t07_command(o,'rental-event',jsonb_build_object('assignment',a,'kind','customer-start','at',pg_temp.t06_when(-11),
   'evidence',pg_temp.t07_packet(990204,'CUSTOMER-START')));
 PERFORM pg_temp.t07_command(o,'rental-event',jsonb_build_object('assignment',a,'kind','supplier-start','at',pg_temp.t06_when(-10),
   'evidence',pg_temp.t07_packet(990205,'SUPPLIER-START')));
 PERFORM pg_temp.t07_command(o,'rental-event',jsonb_build_object('assignment',a,'kind','off-hire','at',pg_temp.t06_when(-5),
   'evidence',pg_temp.t07_packet(990206,'OFF-HIRE')));
 PERFORM pg_temp.t07_command(o,'rental-event',jsonb_build_object('assignment',a,'kind','customer-stop','at',pg_temp.t06_when(-4),
   'evidence',pg_temp.t07_packet(990207,'CUSTOMER-STOP')));
 result:=public.t07_fleet_operation_detail(o);
 IF result->'assignments'->0->>'state'<>'active' OR (result->'rental_events') @> '[{"kind":"supplier-stop"}]'
 THEN RAISE EXCEPTION 'Off-hire or customer clock stopped supplier or physical custody'; END IF;
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t07_command(o,'extend-rental',jsonb_build_object('assignment',a,'until',rental_end+interval '1 hour',
    'evidence',pg_temp.t07_packet(990208,'EXTENSION-01')));
 result:=public.t07_fleet_operation_detail(o)->'assignments'->0;
 IF (result->>'until')::timestamptz<>rental_end OR (result->>'planned_return')::timestamptz<>rental_end+interval '1 hour'
 THEN RAISE EXCEPTION 'Extension overwrote the original assignment window'; END IF;
 PERFORM pg_temp.t06_actor(1);

 RESET ROLE;
 SELECT id INTO grant_id FROM public.currencies WHERE currency_code='AED';
 SET LOCAL ROLE authenticated;
 reviewed:=(public.t07_review_rental(gen_random_uuid(),o,'prepare-terms',jsonb_build_object('reason','Approved paper package',
   'assignment',a,'evidence',pg_temp.t07_packet(990210,'AGREEMENT-01'),'quote','Q-01','lpo','LPO-001','currency',grant_id,
   'rate',1000,'ceiling',40,'unit','hour','from','2026-01-01','until','2027-01-01'))->>'event_id')::bigint;
 PERFORM pg_temp.t06_actor(7);
 PERFORM public.t07_review_rental(gen_random_uuid(),o,'approve-terms',jsonb_build_object('id',reviewed,'reason','Independent review'));
 PERFORM pg_temp.t06_actor(1);
 s1:=(public.t07_review_rental(gen_random_uuid(),o,'prepare-statement',jsonb_build_object('terms',reviewed,'quantity',0.02,
    'usage',jsonb_build_array(usage_a),'reason','Verified billable hours'))->>'event_id')::bigint;
 RESET ROLE;
 DELETE FROM public.role_permissions rp USING public.roles r, public.permissions p
 WHERE rp.role_id=r.id AND rp.permission_id=p.id AND r.role_code='t06_policy' AND p.permission_code='dms.documents.preview'
 RETURNING rp.permission_id INTO denied_cap;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(7);
 BEGIN
   PERFORM public.t07_review_rental(gen_random_uuid(),o,'approve-statement',jsonb_build_object('id',s1,'reason','Reviewer without DMS preview'));
   RAISE EXCEPTION 'Statement approved without access to signed evidence';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 RESET ROLE;
 INSERT INTO public.role_permissions(role_id,permission_id) SELECT id,denied_cap FROM public.roles WHERE role_code='t06_policy';
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(7);
 PERFORM public.t07_review_rental(gen_random_uuid(),o,'approve-statement',jsonb_build_object('id',s1,'reason','Independent approval'));
 PERFORM pg_temp.t06_actor(1);
 s2:=(public.t07_review_rental(gen_random_uuid(),o,'prepare-statement',jsonb_build_object('terms',reviewed,'quantity',0.01,
    'usage',jsonb_build_array(usage_a),'reason','Duplicate review candidate'))->>'event_id')::bigint;
 s3:=(public.t07_review_rental(gen_random_uuid(),o,'prepare-statement',jsonb_build_object('terms',reviewed,'quantity',0.03,'supersedes',s1,
    'usage',jsonb_build_array(usage_a),'reason','Amended quantities'))->>'event_id')::bigint;
 s4:=(public.t07_review_rental(gen_random_uuid(),o,'prepare-statement',jsonb_build_object('terms',reviewed,'quantity',0.02,
    'usage',jsonb_build_array(usage_b),'reason','Ceiling review'))->>'event_id')::bigint;
 PERFORM pg_temp.t06_actor(7);
 BEGIN
   PERFORM public.t07_review_rental(gen_random_uuid(),o,'approve-statement',jsonb_build_object('id',s2,'reason','Duplicate quantity'));
   RAISE EXCEPTION 'A signed interval was counted twice';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 PERFORM public.t07_review_rental(gen_random_uuid(),o,'approve-statement',jsonb_build_object('id',s3,'reason','Independent amendment'));
 BEGIN
   PERFORM public.t07_review_rental(gen_random_uuid(),o,'approve-statement',jsonb_build_object('id',s4,'reason','Beyond the LPO cap'));
   RAISE EXCEPTION 'LPO ceiling exceeded';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(1);
 PERFORM pg_temp.t07_command(o,'return',jsonb_build_object('assignment',a,'at',pg_temp.t06_when(-2),
    'snapshot',pg_temp.t06_facts(),'evidence',pg_temp.t07_packet(990202,'RETURN-001')));
 PERFORM pg_temp.t07_command(o,'rental-event',jsonb_build_object('assignment',a,'kind','supplier-stop','at',pg_temp.t06_when(-1),
   'evidence',pg_temp.t07_packet(990209,'SUPPLIER-STOP')));
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t07_command(o,'rental-event',jsonb_build_object('assignment',a,'kind','technical-clearance','at',pg_temp.t06_when(0),
   'evidence',pg_temp.t07_packet(990211,'RETURN-CLEARANCE')));
 PERFORM pg_temp.t06_actor(1);
 IF pg_temp.t07_command(o,'complete','{}')->>'status'<>'review' THEN RAISE EXCEPTION 'Unresolved rental sheet closed the operation'; END IF;
 PERFORM public.f07_change_document_version(990203,990212,'promote',990203);
 BEGIN
   PERFORM pg_temp.t07_command(o,'resolve-sheet',jsonb_build_object('assignment',a,'usage',(rows->3->>'id')::bigint,
     'evidence',pg_temp.t07_packet(990216,'sheet 01')));
   RAISE EXCEPTION 'Unrelated sheet reused the paper identity';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 FOR row_id IN SELECT (value->>'id')::bigint FROM jsonb_array_elements(rows) LOOP
   PERFORM pg_temp.t07_command(o,'resolve-sheet',jsonb_build_object('assignment',a,'usage',row_id,
     'evidence',jsonb_build_object('document',990203,'version',990212,'file',990212,'reference','SHEET-01')));
 END LOOP;
 SELECT (statement->'usage'->0->>'version')::bigint INTO source_version
 FROM jsonb_array_elements(public.t07_fleet_operation_detail(o)->'statements') statement WHERE (statement->>'id')::bigint=s3;
 IF source_version IS DISTINCT FROM 990203 THEN RAISE EXCEPTION 'Historical statement lost the exact approved sheet version'; END IF;
 PERFORM pg_temp.t06_actor(7);
 BEGIN
   PERFORM public.t07_review_rental(gen_random_uuid(),o,'approve-statement',jsonb_build_object('id',s2,'reason','Stale draft review'));
   RAISE EXCEPTION 'Approval accepted a changed sheet after preparation';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(1);
 BEGIN
   PERFORM public.t07_review_rental(gen_random_uuid(),o,'prepare-statement',jsonb_build_object('terms',reviewed,'quantity',0.02,
      'usage',jsonb_build_array((rows->3->>'id')::bigint),'reason','Attempt to include work after charging stopped'));
   RAISE EXCEPTION 'Signed work after customer charging stop was included in the billing ceiling';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM public.t07_review_rental(gen_random_uuid(),o,'prepare-statement',jsonb_build_object('terms',reviewed,'quantity',0.01,
      'usage',jsonb_build_array((rows->3->>'id')::bigint),'reason','Chargeable portion before stop'));
 IF pg_temp.t07_command(o,'complete','{}')->>'status'<>'completed' THEN RAISE EXCEPTION 'Signed corrections did not release review'; END IF;
 PERFORM set_config('erp.t07_rental',o::text,true);
END;
$$;
SELECT pg_temp.t06_actor(4) AS claims \gset
DO $$ BEGIN
 IF public.t07_fleet_operation_detail(current_setting('erp.t07_rental')::bigint)->'terms'<>'[]'::jsonb
 THEN RAISE EXCEPTION 'Operations reader received confidential commercial rates'; END IF;
END $$;
SELECT pg_temp.t06_actor(1) AS claims \gset
DO $$
DECLARE dry_order bigint; first_slot bigint; second_slot bigint; detail jsonb;
BEGIN
 dry_order:=(pg_temp.t07_command(NULL,'create','{"company":920001,"branch":920011,"site":980001,
  "kind":"rental","rental_mode":"dry","customer":990001,"reference":"T07-DRY-01","subject":"Synthetic dry multi-asset rental"}')->>'id')::bigint;
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t07_command(dry_order,'authorize','{"authorization":"DRY-APPROVED"}');
 PERFORM pg_temp.t06_actor(1);
 first_slot:=(pg_temp.t07_command(dry_order,'assign',pg_temp.t07_move(980101,980001,-1,45))->>'event_id')::bigint;
 second_slot:=(pg_temp.t07_command(dry_order,'assign',pg_temp.t07_move(980102,980002,-1,45)||'{"slot":2}')->>'event_id')::bigint;
 PERFORM pg_temp.t07_command(dry_order,'start',jsonb_build_object('assignment',first_slot,'at',pg_temp.t06_when(-1),
  'snapshot',pg_temp.t06_facts(),'evidence',pg_temp.t07_packet(990213,'DRY-HANDOVER-01')));
 PERFORM pg_temp.t07_command(dry_order,'start',jsonb_build_object('assignment',second_slot,'at',pg_temp.t06_when(-1),
  'snapshot',pg_temp.t06_facts(),'evidence',pg_temp.t07_packet(990214,'DRY-HANDOVER-02')));
 PERFORM pg_temp.t07_command(dry_order,'record-sheet',jsonb_build_object('assignment',first_slot,
  'evidence',pg_temp.t07_packet(990215,'DRY-SHARED-SHEET'), 'lines',jsonb_build_array(
    jsonb_build_object('assignment',first_slot,'from',pg_temp.t06_when(-1),'until',pg_temp.t06_when(0),'state','signed'),
    jsonb_build_object('assignment',second_slot,'from',pg_temp.t06_when(-1),'until',pg_temp.t06_when(0),'state','signed'))));
 detail:=public.t07_fleet_operation_detail(dry_order);
 IF detail->>'rental_mode'<>'dry' OR jsonb_array_length(detail->'assignments')<>2
    OR detail->'assignments'->0->>'worker_id'<>'980001' OR detail->'assignments'->1->>'worker_id'<>'980002'
    OR jsonb_array_length(detail->'usage')<>2
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.t06_fleet_custody_workspace(980101)->'commitments') record
                  WHERE (record->>'owning_operation')::bigint=dry_order AND record->>'managed_by_operation'='true')
 THEN RAISE EXCEPTION 'Dry resource slots or custody ownership did not remain independent'; END IF;
END $$;
SELECT pg_temp.t06_actor(6) AS claims \gset
DO $$ BEGIN
 IF public.t07_fleet_operations('T07','trip',NULL)<>'[]'::jsonb OR public.t07_fleet_operation_detail(current_setting('erp.t07_trip')::bigint) IS NOT NULL
 THEN RAISE EXCEPTION 'Sibling branch read protected Fleet work'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM erp_private.fleet_ops_transition) THEN RAISE EXCEPTION 'Stale private transition authority'; END IF;
 IF (SELECT count(*) FROM erp_private.fleet_trip_delivery_facts WHERE state='missing')<>1
 THEN RAISE EXCEPTION 'Original missing POD record was replaced'; END IF;
END $$;
SELECT 'T07 native dispatch, Trip Order, loaded/empty leg, rental clocks, signed quantities and commercial boundaries passed';
ROLLBACK;
