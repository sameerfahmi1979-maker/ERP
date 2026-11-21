\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
 IF current_database()<>'t00_clean' OR current_setting('cron.launch_active_jobs')<>'off'
   OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
      IS DISTINCT FROM 'Isolated HR T00 20261119' THEN RAISE EXCEPTION 'Isolated T00 database required'; END IF;
 IF to_regprocedure('public.t06_fleet_command(uuid,bigint,text,jsonb)') IS NULL
   OR to_regprocedure('public.t06_fleet_availability(bigint,bigint,bigint,timestamptz,timestamptz)') IS NULL
 THEN RAISE EXCEPTION 'T06 controlled custody and availability entry points are missing'; END IF;
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

SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(1) AS claims \gset
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES(980101,'fleet_asset',980101),(980102,'fleet_asset',980103);
SELECT pg_temp.t06_set('policy',public.t06_fleet_policy(pg_temp.t06_op(1),920001,'prepare',
 '{"category":"light_vehicle","from":"2025-01-01","until":"2028-12-31","routine_minutes":360,"signed_handover":false,
   "registration_required":false,"insurance_required":false,"tentative_allowed":true,"reason":"Synthetic reviewed pool car policy"}'));
SELECT pg_temp.t06_set('equipment_policy',public.t06_fleet_policy(pg_temp.t06_op(2),920001,'prepare',
 jsonb_build_object('category','equipment','from','2025-01-01','until','2028-12-31','routine_minutes',360,'signed_handover',false,
 'registration_required',true,'insurance_required',false,'tentative_allowed',false,
 'licence_type',980101,'reason','Synthetic operating licence and registration policy')));
DO $$ BEGIN
 BEGIN
  PERFORM public.t06_fleet_policy(pg_temp.t06_op(3),920001,'approve',jsonb_build_object('id',pg_temp.t06_var('policy'),'reason','Independent signoff'));
  RAISE EXCEPTION 'Policy author approved own policy';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.t06_actor(7) AS claims \gset
SELECT public.t06_fleet_policy(pg_temp.t06_op(4),920001,'approve',jsonb_build_object('id',pg_temp.t06_var('policy'),'reason','Approved synthetic policy'));
SELECT public.t06_fleet_policy(pg_temp.t06_op(5),920001,'approve',jsonb_build_object('id',pg_temp.t06_var('equipment_policy'),'reason','Approved synthetic policy'));
SELECT pg_temp.t06_actor(1) AS claims \gset
DO $$
DECLARE cart bigint:=980101; active_id bigint; payload jsonb; proof jsonb;
BEGIN
 payload:=pg_temp.t06_trip(980001,980001,'2026-11-18 09:00+04','2026-11-18 11:00+04');
 proof:=public.t06_fleet_command(pg_temp.t06_op(6),cart,'checkout',payload);
 active_id:=(proof->>'id')::bigint;
 IF public.t06_fleet_command(pg_temp.t06_op(6),cart,'checkout',payload) IS DISTINCT FROM (proof||'{"replayed":true}')
 THEN RAISE EXCEPTION 'Checkout retry changed the receipt'; END IF;
 BEGIN
  PERFORM public.t06_fleet_command(pg_temp.t06_op(7),cart,'checkout',pg_temp.t06_trip(980002,980001,'2026-11-18 10:00+04','2026-11-18 12:00+04'));
  RAISE EXCEPTION 'Asset overlap entered hard commitments';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
  PERFORM public.t06_fleet_command(pg_temp.t06_op(8),980102,'checkout',pg_temp.t06_trip(980001,980001,'2026-11-18 10:00+04','2026-11-18 12:00+04'));
  RAISE EXCEPTION 'Employee overlap entered a different asset';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM public.t06_fleet_command(pg_temp.t06_op(9),cart,'return',jsonb_build_object('commitment',active_id,'revision',1,
  'at','2026-11-18 11:00+04','reason','Synthetic return','snapshot',pg_temp.t06_facts()));
 proof:=public.t06_fleet_custody_at('2026-11-18 10:15+04',NULL,'AE-DU','C','T06-PLATE');
 IF proof->>'status'<>'custody-candidate' OR proof->>'custody_candidate'<>'980001' OR proof->>'verified_driver' IS NOT NULL
   OR public.t06_fleet_custody_at('2026-11-18 11:00+04',cart)->>'status'<>'no-record'
 THEN RAISE EXCEPTION 'Occurrence-time plate or exact return boundary is incorrect'; END IF;
 proof:=public.t06_fleet_command(pg_temp.t06_op(10),cart,'checkout',pg_temp.t06_trip(980002,980001,'2026-11-18 11:30+04','2026-11-18 13:30+04'));
 active_id:=(proof->>'id')::bigint;
 PERFORM public.t06_fleet_command(pg_temp.t06_op(11),cart,'return',jsonb_build_object('commitment',active_id,'revision',1,
  'at','2026-11-18 13:30+04','reason','Synthetic return','snapshot',pg_temp.t06_facts()));
 IF public.t06_fleet_custody_at('2026-11-18 11:45+04',cart)->>'custody_candidate'<>'980002'
   OR public.t06_fleet_custody_at(now()-interval '1 minute',NULL,'AEDU','C','T06PLATE')->>'asset_id'<>'980102'
 THEN RAISE EXCEPTION 'Reissued plate or second same-day custodian was not resolved'; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.t06_fleet_custody_workspace(cart)->'commitments') r
    WHERE r->>'from' IS NULL OR r->>'actual_return' IS NULL)
 THEN RAISE EXCEPTION 'Read loses separate actual handover and return'; END IF;
END;
$$;

DO $$
DECLARE loan_id bigint; active_id bigint; act jsonb; ending timestamptz:=((now() AT TIME ZONE 'Asia/Dubai')::date+1+time '07:00') AT TIME ZONE 'Asia/Dubai';
BEGIN
 act:=pg_temp.t06_trip(980001,980001,pg_temp.t06_when(-18),ending);
 BEGIN
  PERFORM public.t06_fleet_command(pg_temp.t06_op(12),980102,'checkout',act);
  RAISE EXCEPTION 'Overnight checkout admitted without approval';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 loan_id:=(public.t06_fleet_command(pg_temp.t06_op(13),980102,'request-loan',act)->>'id')::bigint;
 PERFORM public.t06_fleet_command(pg_temp.t06_op(14),980102,'approve-loan',jsonb_build_object('approval',loan_id,'reason','Authorized overnight custodian'));
 active_id:=(public.t06_fleet_command(pg_temp.t06_op(15),980102,'checkout',jsonb_build_object('approval',loan_id,'at',pg_temp.t06_when(-17),
   'reason','Actual approved overnight handover','snapshot',pg_temp.t06_facts()))->>'id')::bigint;
 IF (public.t06_fleet_custody_workspace(980102)->'commitments'->0->>'planned_return')::timestamptz<>ending
 THEN RAISE EXCEPTION 'Actual handover overwrote overnight planned return'; END IF;
 PERFORM public.t06_fleet_command(pg_temp.t06_op(16),980102,'return',jsonb_build_object('commitment',active_id,'revision',1,'at',pg_temp.t06_when(-15),
    'reason','Returned before the planned deadline','snapshot',pg_temp.t06_facts()));
END;
$$;

SELECT pg_temp.t06_set('workshop',public.t06_fleet_command(pg_temp.t06_op(17),980103,'place-hold','{"kind":"workshop","reason":"Synthetic inspection"}'))
FROM pg_temp.t06_actor(4);
SELECT pg_temp.t06_set('hse',public.t06_fleet_command(pg_temp.t06_op(18),980103,'place-hold','{"kind":"hse","reason":"Synthetic HSE hold"}'))
FROM pg_temp.t06_actor(5);
SELECT pg_temp.t06_actor(1) AS claims \gset
DO $$
DECLARE states jsonb;
BEGIN
 states:=public.t06_fleet_availability(980103,980001,980001,pg_temp.t06_when(5),pg_temp.t06_when(30))->'blockers';
 IF NOT states @> '["licence-required","registration-required","workshop-hold","hse-hold"]'
 THEN RAISE EXCEPTION 'Independent readiness checks missing: %',states; END IF;
 IF NOT (public.t06_fleet_availability(980104,980001,980001,pg_temp.t06_when(5),pg_temp.t06_when(30))->'blockers') @> '["asset-unverified"]'
 THEN RAISE EXCEPTION 'Draft asset became ready'; END IF;
END;
$$;

RESET ROLE;
SELECT pg_temp.t06_actor(8) AS claims \gset
INSERT INTO erp_private.f12_evidence_verifications(employee_id,source_kind,source_id,source_hash,document_id,version_id,actor,operation_id,reason)
 SELECT 980001,'identity-document',980101,erp_private.t02_digest(erp_private.f12_workforce_source('identity-document',980001,980101,980103,NULL)),
  980103,980103,'98000000-0000-4000-8000-000000000008',pg_temp.t06_op(19),'Verified synthetic HR renewal';
INSERT INTO erp_private.fleet_asset_evidence(asset_id,kind,document_id,version_id,file_id,effective_on,expires_on,facts,verified_by)
 SELECT 980103,'registration',980102,980102,980102,'2025-01-01','2025-12-31','{}',created_by FROM erp_private.fleet_assets WHERE id=980103;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(4) AS claims \gset
DO $$ BEGIN
 BEGIN
  PERFORM public.t06_fleet_command(pg_temp.t06_op(20),980103,'release-hold',jsonb_build_object('hold',pg_temp.t06_var('hse'),'reason','Wrong authority'));
  RAISE EXCEPTION 'Workshop released an HSE hold';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM public.t06_fleet_command(pg_temp.t06_op(21),980103,'release-hold',jsonb_build_object('hold',pg_temp.t06_var('workshop'),'reason','Verified independent inspection'));
END $$;
SELECT pg_temp.t06_actor(1) AS claims \gset
DO $$
DECLARE states jsonb;
BEGIN
 states:=public.t06_fleet_availability(980103,980001,980001,pg_temp.t06_when(5),pg_temp.t06_when(30))->'blockers';
 IF states IS DISTINCT FROM '["hse-hold","registration-required"]'::jsonb THEN
  RAISE EXCEPTION 'HR renewal or Workshop release touched unrelated holds: %',states; END IF;
 IF public.t06_fleet_availability(980103,980003,980001,pg_temp.t06_when(5),pg_temp.t06_when(30))->'blockers'<> '["employee-scope"]'
 THEN RAISE EXCEPTION 'Projection exposed out of scope credential facts'; END IF;
END;
$$;

DO $$
DECLARE cart bigint:=980101; booking bigint; successor bigint; current_item bigint; workshop_hold bigint; r jsonb;
BEGIN
 booking:=(public.t06_fleet_command(pg_temp.t06_op(22),cart,'tentative',pg_temp.t06_trip(980001,980001,pg_temp.t06_when(-3),pg_temp.t06_when(30)))->>'id')::bigint;
 successor:=(public.t06_fleet_command(pg_temp.t06_op(23),cart,'tentative',pg_temp.t06_trip(980002,980001,pg_temp.t06_when(-2),pg_temp.t06_when(35)))->>'id')::bigint;
 PERFORM public.t06_fleet_command(pg_temp.t06_op(24),cart,'confirm',jsonb_build_object('commitment',booking,'revision',1,'reason','Confirm first booking'));
 BEGIN
   PERFORM public.t06_fleet_command(pg_temp.t06_op(25),cart,'confirm',jsonb_build_object('commitment',successor,'revision',1,'reason','Confirm conflicting booking'));
   RAISE EXCEPTION 'Second tentative reservation simultaneously confirmed';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(4);
 workshop_hold:=(public.t06_fleet_command(pg_temp.t06_op(26),cart,'place-hold','{"kind":"workshop","reason":"Late independent safety hold"}')->>'id')::bigint;
 PERFORM pg_temp.t06_actor(1);
 BEGIN
   PERFORM public.t06_fleet_command(pg_temp.t06_op(27),cart,'dispatch',jsonb_build_object('commitment',booking,'revision',2,
    'reason','Held before dispatch','snapshot',pg_temp.t06_facts()));
   RAISE EXCEPTION 'Dispatch ignored a late Workshop hold';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(4);
 PERFORM public.t06_fleet_command(pg_temp.t06_op(28),cart,'release-hold',jsonb_build_object('hold',workshop_hold,'reason','Cleared after inspection'));
 PERFORM pg_temp.t06_actor(1);
 current_item:=(public.t06_fleet_command(pg_temp.t06_op(29),cart,'dispatch',jsonb_build_object('commitment',booking,'revision',2,
    'reason','Reviewed driver assignment','snapshot',pg_temp.t06_facts()))->>'id')::bigint;
 r:=public.t06_fleet_custody_at(pg_temp.t06_when(-1),cart);
 IF r->>'verified_driver'<>'980001' OR r->>'custody_candidate' IS NOT NULL THEN RAISE EXCEPTION 'Dispatch inferred a custody driver'; END IF;
 BEGIN
   PERFORM public.t06_fleet_command(pg_temp.t06_op(30),cart,'return',jsonb_build_object('commitment',current_item,'revision',1,'at',pg_temp.t06_when(0),
     'reason','Damage without signed evidence','snapshot',pg_temp.t06_facts()||'{"condition":"damaged"}'));
   RAISE EXCEPTION 'Damaged return saved without signed evidence';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM public.t06_fleet_command(pg_temp.t06_op(31),cart,'return',jsonb_build_object('commitment',current_item,'revision',1,'at',pg_temp.t06_when(0),
    'reason','Returned with signed damaged condition','snapshot',pg_temp.t06_signed()));
 IF NOT (public.t06_fleet_availability(cart,980002,980001,pg_temp.t06_when(8),pg_temp.t06_when(20))->'blockers') @> '["workshop-hold"]'
 THEN RAISE EXCEPTION 'Damaged returned vehicle became available'; END IF;
 BEGIN
   UPDATE public.dms_document_links SET deleted_at=now() WHERE document_id=980101 AND entity_type='fleet_asset';
   RAISE EXCEPTION 'Signed custody acknowledgement was unlinked';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END;
$$;

SELECT pg_temp.t06_actor(1) AS claims \gset
SELECT pg_temp.t06_set('local_open',public.t06_fleet_command(pg_temp.t06_op(32),980102,'checkout',
 pg_temp.t06_trip(980002,980001,pg_temp.t06_when(-11),pg_temp.t06_when(15))));
SELECT pg_temp.t06_set('cross',public.t06_fleet_command(pg_temp.t06_op(33),980102,'request-loan',
 pg_temp.t06_trip(980003,980002,pg_temp.t06_when(-8),pg_temp.t06_when(40))||jsonb_build_object('commitment',pg_temp.t06_var('local_open'),'revision',1)));
SELECT pg_temp.t06_actor(3) AS claims \gset
DO $$ BEGIN
 BEGIN
  PERFORM public.t06_fleet_command(pg_temp.t06_op(34),980102,'approve-loan',jsonb_build_object('approval',pg_temp.t06_var('cross'),'reason','Branch only in receiving company'));
  RAISE EXCEPTION 'Branch-only receiving assignment granted all-company Operations approval';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.t06_actor(2) AS claims \gset
SELECT public.t06_fleet_command(pg_temp.t06_op(35),980102,'approve-loan',jsonb_build_object('approval',pg_temp.t06_var('cross'),'reason','All-company Operations approval'));
RESET ROLE;
UPDATE public.user_roles SET is_active=false WHERE owner_company_id=920002 AND user_profile_id=
 (SELECT id FROM public.user_profiles WHERE auth_user_id='98000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(1) AS claims \gset
DO $$ BEGIN
 BEGIN
  PERFORM public.t06_fleet_command(pg_temp.t06_op(36),980102,'transfer',jsonb_build_object(
   'commitment',pg_temp.t06_var('local_open'),'revision',1,'approval',pg_temp.t06_var('cross'),'reason','Revoked manager loan',
   'snapshot',pg_temp.t06_facts(),'handover',pg_temp.t06_facts()));
  RAISE EXCEPTION 'Revoked manager approval remained consumable';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $$;
RESET ROLE;
UPDATE public.user_roles SET is_active=true WHERE owner_company_id=920002 AND user_profile_id=
 (SELECT id FROM public.user_profiles WHERE auth_user_id='98000000-0000-4000-8000-000000000002');
SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(1) AS claims \gset
DO $$
DECLARE new_id bigint; result jsonb;
BEGIN
 result:=public.t06_fleet_command(pg_temp.t06_op(37),980102,'transfer',jsonb_build_object(
   'commitment',pg_temp.t06_var('local_open'),'revision',1,'approval',pg_temp.t06_var('cross'),'reason','Signed physical transfer',
   'snapshot',pg_temp.t06_facts(),'handover',pg_temp.t06_facts()));
 new_id:=(result->>'id')::bigint;
 IF public.t06_fleet_custody_at(pg_temp.t06_when(-8),980102)->>'custody_candidate'<>'980003'
   OR public.t06_fleet_custody_at(pg_temp.t06_when(-9),980102)->>'custody_candidate'<>'980002'
 THEN RAISE EXCEPTION 'Atomic transfer did not transition at its exact occurrence'; END IF;
 PERFORM pg_temp.t06_actor(9);
 IF public.t05_read_fleet_asset(980102) IS NOT NULL OR public.t06_fleet_custody_workspace(980102) IS NULL
   OR NOT EXISTS(SELECT 1 FROM public.t06_fleet_host_assets('980102') WHERE id=980102)
 THEN RAISE EXCEPTION 'Receiving custodian cannot reach the loan without exposing Fleet home data'; END IF;
 PERFORM public.t06_fleet_command(pg_temp.t06_op(38),980102,'return',jsonb_build_object('commitment',new_id,'revision',1,'at',pg_temp.t06_when(-2),
  'reason','Receiving custodian return','snapshot',pg_temp.t06_facts()));
END;
$$;
SELECT pg_temp.t06_actor(6) AS claims \gset
DO $$ BEGIN
 IF public.t06_fleet_custody_workspace(980102) IS NOT NULL OR public.t06_fleet_custody_at(pg_temp.t06_when(-8),980102)->>'status'<>'unavailable'
 THEN RAISE EXCEPTION 'Sibling branch saw Fleet custody history'; END IF;
END $$;
SELECT pg_temp.t06_actor(8) AS claims \gset
DO $$ BEGIN
 IF public.t06_fleet_custody_workspace(980102) IS NOT NULL THEN RAISE EXCEPTION 'Administrator inherited ordinary custody access'; END IF;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM erp_private.fleet_custody_events WHERE kind='transfer-out')<>1
 OR (SELECT count(*) FROM erp_private.fleet_custody_events WHERE kind='transfer-in')<>1
 THEN RAISE EXCEPTION 'Transfer included duplicate or partial custody events'; END IF;
END $$;
SELECT 'T06 native custody, exact occurrence, approvals, holds, renewals, proof masking and overlap passed';
ROLLBACK;
