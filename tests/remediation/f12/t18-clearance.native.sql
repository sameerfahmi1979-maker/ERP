\set ON_ERROR_STOP on
DO $test$
BEGIN
  IF current_database() !~ '^(t00_clean|t18_[a-z0-9_]+)$' OR current_setting('cron.launch_active_jobs')<>'off'
    OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
        IS DISTINCT FROM 'Isolated HR T00 20261119' THEN
    RAISE EXCEPTION 'Isolated T00 database required';
  END IF;
  IF to_regprocedure('erp_private.t18_clearance_facts(bigint,bigint,bigint,bigint,bigint)') IS NULL
     OR to_regprocedure('public.t18_fleet_exit_tasks(bigint,bigint)') IS NULL
     OR to_regprocedure('public.t18_fleet_exit_scopes()') IS NULL THEN
    RAISE EXCEPTION 'T18 exit clearance is not installed';
  END IF;
END
$test$;
BEGIN;

INSERT INTO public.owner_companies(id,company_code,legal_name_en) OVERRIDING SYSTEM VALUE
VALUES (920001,'T00A','Synthetic Employer A'),(920002,'T00B','Synthetic Employer B') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.branches(id,owner_company_id,branch_code,branch_name_en) OVERRIDING SYSTEM VALUE
VALUES (920011,920001,'T00A-HO','Synthetic A Head Office'),(920012,920001,'T00A-OPS','Synthetic A Operations'),
 (920021,920002,'T00B-HO','Synthetic B Head Office') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.hr_employee_categories(id,code,name_en) OVERRIDING SYSTEM VALUE
VALUES (920001,'T00STAFF','Synthetic Staff') ON CONFLICT(id) DO NOTHING;

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
 (980103,'DRIVING_LICENSE','Synthetic HR driving licence',980101),
 (980104,'T18_CLEARANCE_PROOF','Synthetic store clearance evidence',980101) ON CONFLICT(type_code) DO NOTHING;
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status,current_version_id,issue_date,expiry_date)
 OVERRIDING SYSTEM VALUE
 SELECT id,'T06-PROOF-'||id,doc_name,(SELECT t.id FROM public.dms_document_types t WHERE t.type_code=type),980101,920001,920011,
  'internal','active',id,issued,expires
 FROM (VALUES (980101,'FLEET_CUSTODY_ACK','Synthetic signed return',NULL::date,NULL::date),
  (980102,'VEHICLE_REGISTRATION','Synthetic expired registration','2025-01-01','2025-12-31'),
  (980103,'DRIVING_LICENSE','Synthetic HR licence','2026-01-01','2027-12-31'),
  (980104,'T18_CLEARANCE_PROOF','Synthetic store acknowledgement',NULL,NULL)) sample(id,type,doc_name,issued,expires);
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current)
 OVERRIDING SYSTEM VALUE SELECT id,id,1,true FROM public.dms_documents WHERE id BETWEEN 980101 AND 980104;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
 OVERRIDING SYSTEM VALUE SELECT id,id,id,'original','dms-documents','test/t06-'||id||'.pdf','evidence.pdf','application/pdf',100,repeat('a',64),'verified'
 FROM public.dms_documents WHERE id BETWEEN 980101 AND 980104;
INSERT INTO public.hr_identity_document_types(id,code,name_en) OVERRIDING SYSTEM VALUE VALUES(980101,'DRIVING_LICENSE','Synthetic verified driver licence')
 ON CONFLICT(code) DO NOTHING;
INSERT INTO public.employee_identity_documents(id,employee_id,document_type_id,document_number,issue_date,expiry_date,status,verification_status,dms_document_id)
 OVERRIDING SYSTEM VALUE SELECT 980101,980001,t.id,'SYNTHETIC-HR-NUMBER','2026-01-01','2027-12-31','active','verified',980103
 FROM public.hr_identity_document_types t WHERE t.code='DRIVING_LICENSE';
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES(980103,'employee',980001),(980104,'employee',980001);
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
FROM erp_private.fleet_assets WHERE id BETWEEN 980101 AND 980104;
INSERT INTO erp_private.fleet_asset_plates(asset_id,jurisdiction,plate_class,plate_number,valid_from,valid_until,reason,recorded_by)
SELECT id,'AEDU','C','T06PLATE',lower_day,upper_day,'Synthetic verified plate',created_by
FROM erp_private.fleet_assets a JOIN (VALUES (980101,'2025-01-01'::date,'2026-11-19'::date),
 (980102,'2026-11-19',NULL)) period(asset,lower_day,upper_day) ON period.asset=a.id;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code)
SELECT code,code,'HR','test' FROM unnest(ARRAY['hr.employees.view','hr.employees.update','hr.employee_profile.view','hr.actions.view','hr.actions.manage',
 'hr.eos.view','hr.eos.manage','hr.assignments.view','hr.assignments.manage']) code
ON CONFLICT(permission_code) DO NOTHING;

INSERT INTO public.roles(role_code,role_name,is_system_role)
VALUES('t18_clearance_hr','Synthetic T18 Clearance HR',false);
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p WHERE r.role_code='t18_clearance_hr'
 AND p.permission_code IN('hr.employees.view','hr.employees.update','hr.employee_profile.view','hr.actions.view','hr.actions.manage','hr.eos.view','hr.eos.manage',
  'hr.assignments.view','hr.assignments.manage','dms.documents.view','dms.documents.preview');
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT p.id,r.id,920001,920011,true FROM public.user_profiles p CROSS JOIN public.roles r
WHERE p.auth_user_id='98000000-0000-4000-8000-000000000009' AND r.role_code='t18_clearance_hr';

SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(1) AS claims \gset
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES(980101,'fleet_asset',980101);
SELECT pg_temp.t06_set('policy',public.t06_fleet_policy(pg_temp.t06_op(501),920001,'prepare',
 '{"category":"light_vehicle","from":"2025-01-01","until":"2028-12-31","routine_minutes":360,"signed_handover":true,
   "registration_required":false,"insurance_required":false,"tentative_allowed":true,"reason":"Require signed exit returns"}'));
SELECT pg_temp.t06_actor(7) AS claims \gset
SELECT public.t06_fleet_policy(pg_temp.t06_op(502),920001,'approve',jsonb_build_object('id',pg_temp.t06_var('policy'),'reason','Approved synthetic policy'));
SELECT pg_temp.t06_actor(1) AS claims \gset
SELECT pg_temp.t06_set('checkout',public.t06_fleet_command(pg_temp.t06_op(503),980101,'checkout',
 pg_temp.t06_trip(980001,980001,'2026-11-18 09:00+04','2026-11-18 11:00+04')
 || jsonb_build_object('snapshot',pg_temp.t06_signed()||'{"condition":"good"}')));

SELECT pg_temp.t06_actor(9) AS claims \gset
SELECT pg_temp.t06_set('eos',public.f11_mutate_eos_case('eos-case',980001,NULL,NULL,pg_temp.t06_op(504),'create',
 '{"eos_type":"resignation","case_status":"clearance_in_progress","last_working_date":"2026-11-20"}'));
SELECT pg_temp.t06_set('eos_b',public.f11_mutate_eos_case('eos-case',980002,NULL,NULL,pg_temp.t06_op(505),'create',
 '{"eos_type":"resignation","case_status":"clearance_in_progress","last_working_date":"2026-11-20"}'));
SELECT pg_temp.t06_set('manual',public.f11_mutate_clearance('clearance',980001,NULL,NULL,pg_temp.t06_op(506),'create',
 jsonb_build_object('eos_case_id',pg_temp.t06_var('eos'),'clearance_area','hr','item_title','Check employee documents',
  'evidence_document_id',980104,'evidence_version_id',980104)));
SELECT pg_temp.t06_set('property',public.f11_mutate_operation_item('asset',980001,NULL,NULL,pg_temp.t06_op(507),'create',
 '{"asset_type":"laptop","asset_description":"Return a synthetic laptop","issued_date":"2026-11-15",
  "asset_reference":null,"return_due_date":null,"condition_on_issue":null,"notes":null}'));
SELECT pg_temp.t06_set('manual',public.f11_mutate_clearance('clearance',980001,pg_temp.t06_var('manual'),1,pg_temp.t06_op(508),'clear',
 jsonb_build_object('eos_case_id',pg_temp.t06_var('eos'))));
DO $$
DECLARE store_item bigint;
BEGIN
 BEGIN
  PERFORM public.f11_mutate_eos_case('eos-case',980001,pg_temp.t06_var('eos'),1,pg_temp.t06_op(542),'set-status',
   '{"case_status":"closed"}');
  RAISE EXCEPTION 'Legacy EOS closure bypassed the active Fleet return';
 EXCEPTION WHEN check_violation OR SQLSTATE 'PT409' OR insufficient_privilege THEN NULL; END;
 BEGIN
  store_item:=(public.f11_mutate_clearance('clearance',980001,NULL,NULL,pg_temp.t06_op(540),'create',
   jsonb_build_object('eos_case_id',pg_temp.t06_var('eos'),'clearance_area','store','item_title','Department keys'))->>'id')::bigint;
  PERFORM public.f11_mutate_clearance('clearance',980001,store_item,1,pg_temp.t06_op(541),'update',
   jsonb_build_object('eos_case_id',pg_temp.t06_var('eos'),'item_status','not_applicable',
    'evidence_document_id',980104,'evidence_version_id',980104));
  RAISE EXCEPTION 'HR certified an unverified department item';
 EXCEPTION WHEN check_violation THEN NULL; END;
 BEGIN
  PERFORM public.t18_fleet_exit_tasks(920001,920011);
  RAISE EXCEPTION 'HR without Fleet custody access could read the Fleet return queue';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE erp_private.fleet_commitments SET status='closed' WHERE id=pg_temp.t06_var('checkout');
  RAISE EXCEPTION 'HR changed canonical Fleet custody directly';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM erp_private.t18_clearance_facts(pg_temp.t06_var('eos'),980001,1,920001,920011);
  RAISE EXCEPTION 'A user called the raw clearance projection';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;

CREATE FUNCTION pg_temp.t18_case_facts(case_id bigint,employee_id bigint) RETURNS jsonb LANGUAGE sql STABLE AS $$
 SELECT erp_private.t18_clearance_facts(case_id,employee_id,p.id,920001,920011)
 FROM erp_private.t03_employment_periods p WHERE p.employee_id=$2 AND p.work_period @> '2026-11-20'::date;
$$;
DO $$
DECLARE facts jsonb:=pg_temp.t18_case_facts(pg_temp.t06_var('eos'),980001); period bigint;
BEGIN
 IF (facts->>'blocking_count')::integer<>2 OR jsonb_array_length(facts->'items')<>3
   OR NOT facts->'items' @> jsonb_build_array(jsonb_build_object('origin','fleet','source_id',pg_temp.t06_var('checkout'),
    'owner','fleet','status','pending','asset_id',980101))
   OR NOT facts->'items' @> '[{"origin":"asset","owner":"it","status":"pending"}]'
   OR NOT facts->'items' @> '[{"origin":"manual","owner":"hr","status":"cleared","evidence_attached":true}]'
 THEN RAISE EXCEPTION 'Existing open Fleet and late departmental sources were not linked: %',facts; END IF;
 SELECT p.id INTO period FROM erp_private.t03_employment_periods p WHERE p.employee_id=980001;
 PERFORM erp_private.t18_sync_clearance(pg_temp.t06_var('eos'),980001,period,920001,920011);
 PERFORM erp_private.t18_sync_clearance(pg_temp.t06_var('eos'),980001,period,920001,920011);
 IF (SELECT count(*) FROM erp_private.t18_clearance_origins WHERE eos_id=pg_temp.t06_var('eos'))<>2 THEN
  RAISE EXCEPTION 'Repeated discovery duplicated automatic origins';
 END IF;
 BEGIN
  UPDATE erp_private.fleet_commitments
  SET status='closed', committed_during=tstzrange(lower(committed_during),'2026-11-18 11:00+04','[)'),revision=revision+1
  WHERE id=pg_temp.t06_var('checkout');
  facts:=pg_temp.t18_case_facts(pg_temp.t06_var('eos'),980001);
  IF NOT facts->'items' @> '[{"origin":"fleet","status":"blocked"}]' THEN
   RAISE EXCEPTION 'An unsupported Fleet state cleared an exit task';
  END IF;
  RAISE EXCEPTION 'Rollback malformed synthetic state' USING ERRCODE='Z9999';
 EXCEPTION WHEN SQLSTATE 'Z9999' THEN NULL; END;
END $$;
SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(6) AS claims \gset
DO $$ BEGIN
 IF jsonb_array_length(public.t18_fleet_exit_scopes())<>1
   OR (public.t18_fleet_exit_scopes()->0->>'branch')::bigint IS DISTINCT FROM 920012 THEN
  RAISE EXCEPTION 'Fleet branch selector disclosed another operating branch';
 END IF;
 IF public.t18_fleet_exit_tasks(920001,920012) IS DISTINCT FROM '[]'::jsonb THEN
  RAISE EXCEPTION 'Sibling branch Fleet return tasks leaked';
 END IF;
 BEGIN
  PERFORM public.t18_fleet_exit_tasks(920001,920011);
  RAISE EXCEPTION 'Sibling branch user could read exit checks';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
SELECT pg_temp.t06_actor(1) AS claims \gset
DO $$
DECLARE queue jsonb:=public.t18_fleet_exit_tasks(920001,920011); payload jsonb; receipt jsonb;
BEGIN
 IF jsonb_array_length(queue)<>1 OR queue->0->>'employee_id'<>'980001'
  OR (queue->0->>'commitment_id')::bigint<>pg_temp.t06_var('checkout')
  OR queue->0 ?| ARRAY['lines','salary','case_reason','employee_name','evidence_document_id']
 THEN RAISE EXCEPTION 'Fleet exit checks have incorrect scope or disclose other data: %',queue; END IF;
 payload:=jsonb_build_object('commitment',pg_temp.t06_var('checkout'),'revision',1,
   'at','2026-11-18 11:00+04','reason','Receive a signed synthetic exit return');
 BEGIN
  PERFORM public.t06_fleet_command(pg_temp.t06_op(509),980101,'return',payload||jsonb_build_object('snapshot',pg_temp.t06_facts()));
  RAISE EXCEPTION 'Fleet closed a signature-required check without signed evidence';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 payload:=payload||jsonb_build_object('snapshot',pg_temp.t06_signed()||'{"condition":"good"}');
 receipt:=public.t06_fleet_command(pg_temp.t06_op(510),980101,'return',payload);
 IF public.t06_fleet_command(pg_temp.t06_op(510),980101,'return',payload) IS DISTINCT FROM (receipt||'{"replayed":true}')
  OR public.t18_fleet_exit_tasks(920001,920011) IS DISTINCT FROM '[]'::jsonb
 THEN RAISE EXCEPTION 'Signed Fleet return retry, or pending queue, changed incorrectly'; END IF;
END $$;
SELECT pg_temp.t06_set('late',public.t06_fleet_command(pg_temp.t06_op(511),980101,'checkout',
 pg_temp.t06_trip(980002,980001,'2026-11-18 11:30+04','2026-11-18 13:30+04')
 || jsonb_build_object('snapshot',pg_temp.t06_signed()||'{"condition":"good"}')));
SELECT pg_temp.t06_actor(9) AS claims \gset
SELECT public.f11_mutate_operation_item('asset',980001,pg_temp.t06_var('property'),1,pg_temp.t06_op(512),'return',
 '{"returned_date":"2026-11-20","condition_on_return":"Accepted by IT"}');
RESET ROLE;
DO $$
DECLARE facts jsonb:=pg_temp.t18_case_facts(pg_temp.t06_var('eos'),980001);
        late_facts jsonb:=pg_temp.t18_case_facts(pg_temp.t06_var('eos_b'),980002);
BEGIN
 IF (facts->>'blocking_count')::integer<>0 OR jsonb_array_length(facts->'items')<>3
  OR NOT facts->'items' @> '[{"origin":"fleet","owner":"fleet","status":"cleared","evidence_attached":true}]'
  OR NOT facts->'items' @> '[{"origin":"asset","status":"cleared"}]'
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(facts->'items') i WHERE i ?| ARRAY['evidence_document_id','evidence_version_id','evidence_file_id'])
 THEN RAISE EXCEPTION 'Fleet or departmental return failed to clear, or exposed proof IDs: %',facts; END IF;
 IF (late_facts->>'blocking_count')::integer<>1
  OR NOT late_facts->'items' @> jsonb_build_array(jsonb_build_object('origin','fleet','status','pending','source_id',pg_temp.t06_var('late')))
 THEN RAISE EXCEPTION 'Checkout after exit opening did not create a return check: %',late_facts; END IF;
 IF (SELECT count(*) FROM erp_private.t18_clearance_fleet_receipts
  WHERE eos_id=pg_temp.t06_var('eos') AND commitment_id=pg_temp.t06_var('checkout')
    AND evidence_document_id=980101 AND evidence_version_id=980101 AND evidence_file_id=980101)<>1
 THEN RAISE EXCEPTION 'Exact proof is missing, or retry duplicated the receipt'; END IF;
 BEGIN
  DELETE FROM erp_private.t18_clearance_fleet_receipts WHERE eos_id=pg_temp.t06_var('eos');
  RAISE EXCEPTION 'Fleet return evidence history is mutable';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  UPDATE erp_private.t18_clearance_origins SET title='Tampered' WHERE eos_id=pg_temp.t06_var('eos');
  RAISE EXCEPTION 'Origin history is mutable';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(1) AS claims \gset
SELECT pg_temp.t06_set('transfer',public.t06_fleet_command(pg_temp.t06_op(513),980101,'transfer',
 pg_temp.t06_trip(980001,980001,'2026-11-18 12:00+04','2026-11-18 14:00+04')
 || jsonb_build_object('commitment',pg_temp.t06_var('late'),'revision',1,
   'snapshot',pg_temp.t06_signed()||'{"condition":"good"}','handover',pg_temp.t06_signed()||'{"condition":"good"}')));
RESET ROLE;
DO $$
DECLARE old_facts jsonb:=pg_temp.t18_case_facts(pg_temp.t06_var('eos_b'),980002);
        new_facts jsonb:=pg_temp.t18_case_facts(pg_temp.t06_var('eos'),980001);
BEGIN
 IF (old_facts->>'blocking_count')::integer<>0 OR NOT (old_facts->'items') @>
  jsonb_build_array(jsonb_build_object('origin','fleet','source_id',pg_temp.t06_var('late'),'status','cleared'))
  OR (new_facts->>'blocking_count')::integer<>1 OR NOT (new_facts->'items') @>
  jsonb_build_array(jsonb_build_object('origin','fleet','source_id',pg_temp.t06_var('transfer'),'status','pending'))
 THEN RAISE EXCEPTION 'Signed transfer did not clear only the outgoing owner check: %; %',old_facts,new_facts; END IF;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(9) AS claims \gset
SELECT pg_temp.t06_set('before_anchor',public.f11_mutate_clearance('clearance',980001,NULL,NULL,pg_temp.t06_op(550),'create',
 jsonb_build_object('eos_case_id',pg_temp.t06_var('eos'),'clearance_area','store','item_title','Duplicated form before intake')));
SELECT public.f11_mutate_clearance('clearance',980001,pg_temp.t06_var('before_anchor'),1,pg_temp.t06_op(551),'archive',
 jsonb_build_object('eos_case_id',pg_temp.t06_var('eos')));
SELECT pg_temp.t06_set('after_anchor',public.f11_mutate_clearance('clearance',980001,NULL,NULL,pg_temp.t06_op(552),'create',
 jsonb_build_object('eos_case_id',pg_temp.t06_var('eos'),'clearance_area','store','item_title','Pending Stock custody')));
RESET ROLE;
INSERT INTO erp_private.t18_cases(eos_id,employee_id,employment_id,company_id,branch_id,last_day,last_working_day,opened_by)
SELECT pg_temp.t06_var('eos'),p.employee_id,p.id,p.company_id,p.branch_id,'2026-11-20','2026-11-20',public.current_user_profile_id()
FROM erp_private.t03_employment_periods p WHERE p.employee_id=980001;
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN
  PERFORM public.f11_mutate_clearance('clearance',980001,pg_temp.t06_var('after_anchor'),1,pg_temp.t06_op(553),'archive',
   jsonb_build_object('eos_case_id',pg_temp.t06_var('eos')));
  RAISE EXCEPTION 'Legacy archive suppressed an approved-intake department check';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
END $$;
RESET ROLE;
DO $$ BEGIN
 IF NOT pg_temp.t18_case_facts(pg_temp.t06_var('eos'),980001)->'items' @>
   jsonb_build_array(jsonb_build_object('origin','manual','source_id',pg_temp.t06_var('after_anchor'),'status','pending'))
   OR NOT EXISTS(SELECT 1 FROM erp_private.f12_clearance_history
      WHERE item_id=pg_temp.t06_var('before_anchor') AND action='archive')
   OR NOT EXISTS(SELECT 1 FROM erp_private.f12_clearance_history
      WHERE item_id=pg_temp.t06_var('manual') AND action='clear' AND after_state->>'evidence_fingerprint' IS NOT NULL)
 THEN RAISE EXCEPTION 'The anchored department blocker or pre-intake and signed HR history was lost'; END IF;
END $$;

\echo T18 Fleet and department exit clearance permissions, signed return and transfer, legacy closure, late sources and retries passed
ROLLBACK;
