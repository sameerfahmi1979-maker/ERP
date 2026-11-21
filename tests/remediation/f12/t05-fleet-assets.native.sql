\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
 IF current_database()<>'t00_clean' OR current_setting('cron.launch_active_jobs')<>'off'
   OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
      IS DISTINCT FROM 'Isolated HR T00 20261119' THEN RAISE EXCEPTION 'Isolated T00 database required'; END IF;
 IF to_regprocedure('public.t05_write_fleet_asset(uuid,bigint,text,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'T05 canonical Fleet write entry point is missing';
 END IF;
END;
$$;

INSERT INTO auth.users(id,email,aud,role,email_confirmed_at)
SELECT ('97000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,'t05-'||i||'@example.test','authenticated','authenticated',now()
FROM generate_series(1,7) i;
INSERT INTO auth.sessions(id,user_id,created_at,not_after)
SELECT ('97000000-0000-4000-8001-'||lpad(i::text,12,'0'))::uuid,
 ('97000000-0000-4000-8000-'||lpad(i::text,12,'0'))::uuid,now(),now()+interval '1 day' FROM generate_series(1,7) i;
INSERT INTO public.user_profiles(auth_user_id,status,must_change_password)
SELECT id,'active',false FROM auth.users WHERE email LIKE 't05-%@example.test' ON CONFLICT(auth_user_id) DO NOTHING;
UPDATE public.user_profiles SET status='active',must_change_password=false
WHERE auth_user_id IN(SELECT id FROM auth.users WHERE email LIKE 't05-%@example.test');

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope)
SELECT code,code,'DMS','test','held' FROM unnest(ARRAY['dms.documents.view','dms.documents.edit','dms.documents.preview','dms.documents.download','dms.documents.manage_security']) code
ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.roles(role_code,role_name,is_system_role)
SELECT 't05_'||name,name,false FROM unnest(ARRAY['manage','other','sibling','dms','fleet','metadata']) name;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t05_manage',ARRAY['fleet.assets.view','fleet.assets.manage','fleet.assets.documents','dms.documents.view','dms.documents.edit','dms.documents.preview','dms.documents.download','dms.documents.manage_security']),
 ('t05_other',ARRAY['fleet.assets.view','fleet.assets.manage','fleet.assets.documents','dms.documents.view','dms.documents.edit','dms.documents.preview','dms.documents.manage_security']),
 ('t05_sibling',ARRAY['fleet.assets.view','fleet.assets.manage','fleet.assets.documents','dms.documents.view']),
 ('t05_dms',ARRAY['dms.documents.view','dms.documents.edit','dms.documents.preview','dms.documents.download']),
 ('t05_fleet',ARRAY['fleet.assets.view']),
 ('t05_metadata',ARRAY['fleet.assets.view','dms.documents.view'])
) ap(role_code,caps) JOIN public.roles r ON r.role_code=ap.role_code JOIN public.permissions p ON p.permission_code=ANY(ap.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT u.id,r.id,a.company,a.branch,true FROM (VALUES (1,'t05_manage',920001,920011),
 (1,'t05_other',920002,920021),(2,'t05_other',920002,920021),(3,'t05_sibling',920001,920012),
 (4,'t05_dms',920001,920011),(5,'system_admin',NULL,NULL),(6,'t05_fleet',920001,920011),(7,'t05_metadata',920001,920011)
 ) a(i,role_code,company,branch)
JOIN public.user_profiles u ON u.auth_user_id=('97000000-0000-4000-8000-'||lpad(a.i::text,12,'0'))::uuid
JOIN public.roles r ON r.role_code=a.role_code;

CREATE FUNCTION pg_temp.t05_actor(i int) RETURNS text LANGUAGE sql AS $$
 SELECT set_config('request.jwt.claims',jsonb_build_object('role','authenticated',
  'sub','97000000-0000-4000-8000-'||lpad(i::text,12,'0'),
  'session_id','97000000-0000-4000-8001-'||lpad(i::text,12,'0'))::text,true);
$$;
CREATE FUNCTION pg_temp.t05_op(i int) RETURNS uuid LANGUAGE sql AS $$
 SELECT ('97000000-0000-4000-8002-'||lpad(i::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.t05_asset(i int) RETURNS bigint LANGUAGE sql AS $$
 SELECT current_setting('erp.t05_asset'||i)::bigint;
$$;

SET LOCAL session_replication_role=replica;
INSERT INTO public.dms_document_categories(id,category_code,name_en) OVERRIDING SYSTEM VALUE VALUES(970001,'T05_FLEET','Synthetic Fleet');
INSERT INTO public.dms_document_types(id,type_code,name_en,category_id) OVERRIDING SYSTEM VALUE VALUES
 (970001,'VEHICLE_REGISTRATION','Synthetic vehicle registration',970001),
 (970002,'VEHICLE_INSURANCE','Synthetic vehicle insurance',970001)
 ON CONFLICT(type_code) DO NOTHING;
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status,current_version_id,issue_date,expiry_date)
 OVERRIDING SYSTEM VALUE
 SELECT id,'T05-'||id,'T05 synthetic Fleet proof '||id,(SELECT t.id FROM public.dms_document_types t WHERE t.type_code=type),970001,company,branch,
  confidentiality,'active',id,issue_date,expires
 FROM (VALUES (970001,'VEHICLE_REGISTRATION',920001,920011,'internal','2025-01-01'::date,'2025-12-31'::date),
  (970002,'VEHICLE_REGISTRATION',920001,920011,'internal','2026-01-01','2026-12-31'),
  (970003,'VEHICLE_INSURANCE',920002,920021,'internal','2026-01-01','2026-12-31'),
  (970004,'VEHICLE_INSURANCE',920001,920011,'internal','2026-01-01','2026-12-31'),
  (970005,'VEHICLE_INSURANCE',920001,920011,'legal','2026-01-01','2026-12-31')
 ) sample(id,type,company,branch,confidentiality,issue_date,expires);
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current)
 OVERRIDING SYSTEM VALUE SELECT id,id,1,true FROM public.dms_documents WHERE id BETWEEN 970001 AND 970005;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status,ocr_text)
 OVERRIDING SYSTEM VALUE SELECT id,id,id,'original','dms-documents','test/t05-'||id||'.pdf','vehicle.pdf','application/pdf',100,repeat('a',64),'verified','Confidential synthetic proof text'
 FROM public.dms_documents WHERE id BETWEEN 970001 AND 970005;
SET LOCAL session_replication_role=origin;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t05_actor(1) AS claims \gset
DO $$
DECLARE cmd jsonb:='{"company":920001,"branch":920011,"name":"T05 Tractor","category":"truck","vin":"1m8 gdm9axkp042788","serial":"eng-100"}';
 first jsonb; repeated jsonb; next_asset jsonb; aid bigint; bid bigint; r jsonb; opening bigint;
BEGIN
 first:=public.t05_write_fleet_asset(pg_temp.t05_op(1),NULL,'create',cmd);
 repeated:=public.t05_write_fleet_asset(pg_temp.t05_op(1),NULL,'create',cmd);
 aid:=(first->>'id')::bigint;
 IF first->>'asset_no' !~ '^FLT-[0-9]{6}$' OR first->>'status'<>'draft'
   OR repeated-ARRAY['replayed']<>first-ARRAY['replayed'] OR NOT (repeated->>'replayed')::boolean
 THEN RAISE EXCEPTION 'Numbered draft replay was not exact'; END IF;
 PERFORM set_config('erp.t05_asset1',aid::text,true);
 BEGIN
   PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(1),NULL,'create',cmd||'{"name":"Changed"}');
   RAISE EXCEPTION 'Changed retry admitted';
 EXCEPTION WHEN SQLSTATE 'P0409' THEN NULL; END;
 BEGIN
   PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(2),NULL,'create',cmd||'{"company":920002,"branch":920021}');
   RAISE EXCEPTION 'Duplicate VIN admitted across companies';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
   PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(3),NULL,'create','{"company":920002,"branch":920021,"name":"Dup","category":"equipment","serial":"ENG100"}');
   RAISE EXCEPTION 'Duplicate serial admitted across companies';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 next_asset:=public.t05_write_fleet_asset(pg_temp.t05_op(4),NULL,'create','{"company":920002,"branch":920021,"name":"T05 Trailer","category":"trailer","serial":"T05-002"}');
 bid:=(next_asset->>'id')::bigint;
 PERFORM set_config('erp.t05_asset2',bid::text,true);
 IF next_asset->>'asset_no'=first->>'asset_no' OR public.t05_read_fleet_asset(aid)->'meters'<>'[]'
 THEN RAISE EXCEPTION 'Number reused or missing history fabricated'; END IF;
 BEGIN
   PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(5),aid,'lifecycle','{"revision":1,"date":"2025-01-01","reason":"test","status":"active"}');
   RAISE EXCEPTION 'Unverified identity/ownership released';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(6),aid,'identity',
  '{"revision":1,"date":"2025-01-01","reason":"VIN checked against chassis","vin":"1M8GDM9AXKP042789"}');
 IF NOT EXISTS(SELECT 1 FROM public.t05_search_fleet_assets('1M8GDM9AXKP042788') WHERE id=aid) THEN
   RAISE EXCEPTION 'Original VIN no longer resolved'; END IF;
 BEGIN
  PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(7),NULL,'create',
   '{"company":920002,"branch":920021,"name":"Old VIN","category":"light_vehicle","vin":"1M8GDM9AXKP042788"}');
  RAISE EXCEPTION 'Old VIN reused';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(8),aid,'ownership',
  '{"revision":2,"date":"2025-01-01","reason":"Ownership papers checked","mode":"owned","company":920001}');
 PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(9),aid,'operation',
  jsonb_build_object('revision',3,'date','2025-01-02','reason','Operating assignment','company',920002,'branch',920021,
   'role',((public.t05_fleet_asset_choices(920002,920021)->'roles'->0->>'id')::bigint)));
 PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(10),aid,'location',
  '{"revision":4,"date":"2025-01-03","reason":"Site report","company":920002,"branch":920021,"facts":{"label":"Yard"}}');
 PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(11),aid,'configuration','{"revision":5,"date":"2025-01-04","reason":"Verified geometry","facts":{
   "make":"Synthetic","gross_kg":26000,"axles":[
    {"key":"front","label":"Front","role":"steer","steering":true,"driven":false,"liftable":false,"left":1,"right":1},
    {"key":"rear1","label":"Drive 1","role":"drive","steering":false,"driven":true,"liftable":false,"left":2,"right":2},
    {"key":"rear2","label":"Drive 2","role":"drive","steering":false,"driven":true,"liftable":false,"left":2,"right":2}],"spares":0}}');
 r:=public.t05_read_fleet_asset(aid)->'history'->0->'facts';
 IF r->>'wheel_ends'<>'6' OR r->>'driven_ends'<>'4' OR r->>'tyre_positions'<>'10' OR r->'slots'->>2<>'rear1:left:outer'
 THEN RAISE EXCEPTION 'Incorrect axle geometry'; END IF;
 PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(12),aid,'plate',
  '{"revision":6,"date":"2025-01-01","reason":"Verified registration","plate":"123 45","plate_class":"C","jurisdiction":"AE-DU"}');
 BEGIN
  PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(13),bid,'plate',
   '{"revision":1,"date":"2025-12-31","reason":"Duplicate candidate","plate":"12345","plate_class":"C","jurisdiction":"AEDU"}');
  RAISE EXCEPTION 'Overlapping plate admitted';
 EXCEPTION WHEN exclusion_violation THEN NULL; END;
 PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(14),aid,'plate',
  '{"revision":7,"date":"2026-01-01","reason":"Replacement plate","plate":"54321","plate_class":"C","jurisdiction":"AEDU"}');
 PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(15),bid,'plate',
  '{"revision":1,"date":"2026-01-01","reason":"Later verified assignment","plate":"12345","plate_class":"C","jurisdiction":"AEDU"}');
 IF NOT EXISTS(SELECT 1 FROM public.t05_search_fleet_assets('12345') WHERE id=aid AND plate='54321') THEN
   RAISE EXCEPTION 'Historical plate search did not resolve canonical asset'; END IF;
 r:=public.t05_write_fleet_asset(pg_temp.t05_op(16),aid,'meter',
  '{"revision":8,"date":"2025-02-01","reason":"Meter photograph reviewed","unit":"km","value":12500,"source":"Photo REF-001"}');
 opening:=(r->>'event_id')::bigint;
 PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(17),aid,'meter',
  jsonb_build_object('revision',9,'date','2025-02-01','reason','Transcription correction','unit','km','value',12400,'source','Photo REF-001','replaces',opening));
 r:=public.t05_read_fleet_asset(aid)->'meters';
 IF jsonb_array_length(r)<>2 OR r->0->>'value'<>'12400.000' OR r->1->>'value'<>'12500.000'
 THEN RAISE EXCEPTION 'Meter change replaced original event'; END IF;
 PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(18),aid,'lifecycle',
  '{"revision":10,"date":"2025-02-01","reason":"Verified master released","status":"active"}');
 IF public.t05_read_fleet_asset(aid) ? 'dispatchable' THEN RAISE EXCEPTION 'Fleet master status cannot enable dispatch'; END IF;
END;
$$;

DO $$
DECLARE aid bigint:=pg_temp.t05_asset(1); r jsonb;
BEGIN
 BEGIN
   INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES(970003,'fleet_asset',aid);
   RAISE EXCEPTION 'Cross-company DMS link admitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
   INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES(970001,'vehicle',aid);
   RAISE EXCEPTION 'Legacy Fleet alias guessed';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES
   (970001,'fleet_asset',aid),(970002,'fleet_asset',aid),(970004,'fleet_asset',aid);
 IF (SELECT count(*) FROM public.read_dms_entity_document_links('fleet_asset',aid))<>3
   OR NOT public.f03_has_document_permission(970001,'dms.documents.preview')
   OR NOT public.f03_has_document_permission(970001,'dms.documents.download')
 THEN RAISE EXCEPTION 'Authorized DMS links, preview or download unavailable'; END IF;
 BEGIN
   PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(19),aid,'verify-document',
    '{"revision":11,"date":"2025-01-01","expires":"2025-12-31","reason":"Compared to original","kind":"registration","document":970001,"version":970001,"file":970002}');
   RAISE EXCEPTION 'Wrong proof original admitted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(20),aid,'verify-document',
  '{"revision":11,"date":"2025-01-01","expires":"2025-12-31","reason":"Reviewed registration","kind":"registration","document":970001,"version":970001,"file":970001,"facts":{"plate":"12345"}}');
 PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(21),aid,'verify-document',
  '{"revision":12,"date":"2026-01-01","expires":"2026-12-31","reason":"Reviewed renewal","kind":"registration","document":970002,"version":970002,"file":970002,"facts":{"plate":"54321"}}');
 r:=public.t05_read_fleet_asset(aid);
 IF jsonb_array_length(r->'evidence')<>2 OR r->'evidence'->0->>'replaces_id'<>r->'evidence'->1->>'id'
   OR r->'evidence'->1->>'version_id'<>'970001'
   OR (r->'evidence'->0->>'source_current') IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'Renewal did not retain exact dated original proof'; END IF;
 BEGIN
   UPDATE public.dms_documents SET owning_company_id=920002,owning_branch_id=920021 WHERE id=970001;
   RAISE EXCEPTION 'Fleet evidence ownership detached from the asset home';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
   UPDATE public.dms_document_links SET deleted_at=now() WHERE document_id=970001 AND entity_type='fleet_asset';
   RAISE EXCEPTION 'Verified original was unlinked';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 UPDATE public.dms_document_links SET deleted_at=now() WHERE document_id=970004 AND entity_type='fleet_asset';
 IF (SELECT count(*) FROM public.read_dms_entity_document_links('fleet_asset',aid) WHERE deleted_at IS NULL)<>2
 THEN RAISE EXCEPTION 'Active Fleet association count incorrect'; END IF;
END;
$$;

SELECT pg_temp.t05_actor(2) AS claims \gset
DO $$
DECLARE aid bigint:=pg_temp.t05_asset(1);
BEGIN
 IF public.t05_read_fleet_asset(aid) IS NULL OR public.t05_read_fleet_asset(aid)->'evidence'<>'[]'
   OR EXISTS(SELECT 1 FROM public.t05_fleet_document_context(aid))
   OR EXISTS(SELECT 1 FROM public.t05_search_fleet_assets('T05 Tractor',50,0,true))
 THEN RAISE EXCEPTION 'Operating assignment leaked asset owner proof or hid operational asset'; END IF;
 BEGIN
  PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(22),aid,'lifecycle',
   '{"revision":13,"date":"2026-01-01","reason":"Out of scope","status":"retired"}');
  RAISE EXCEPTION 'Borrowing company edited asset owner record';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
SELECT pg_temp.t05_actor(3) AS claims \gset
DO $$ BEGIN
 IF public.t05_read_fleet_asset(pg_temp.t05_asset(1)) IS NOT NULL OR EXISTS(SELECT 1 FROM public.t05_search_fleet_assets('12345'))
 THEN RAISE EXCEPTION 'Sibling branch has Fleet visibility'; END IF;
END $$;
SELECT pg_temp.t05_actor(4) AS claims \gset
DO $$
DECLARE aid bigint:=pg_temp.t05_asset(1);
BEGIN
 IF public.f03_has_document_permission(970001,'dms.documents.preview')
   OR public.f03_has_document_permission(970001,'dms.documents.download')
   OR EXISTS(SELECT 1 FROM public.dms_documents WHERE id IN (970001,970002,970004))
   OR EXISTS(SELECT 1 FROM public.dms_document_files WHERE document_id IN (970001,970002,970004))
   OR EXISTS(SELECT 1 FROM public.f03_read_document_files_for_document(970001))
   OR EXISTS(SELECT 1 FROM public.read_dms_entity_document_links('fleet_asset',aid))
 THEN RAISE EXCEPTION 'DMS-only scope exposed Fleet proof or counts'; END IF;
 BEGIN
   INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES(970004,'fleet_asset',aid);
   RAISE EXCEPTION 'DMS-only actor linked to Fleet';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END;
$$;
SELECT pg_temp.t05_actor(5) AS claims \gset
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.dms_documents WHERE id IN (970001,970002,970004))
   OR public.t05_read_fleet_asset(pg_temp.t05_asset(1)) IS NOT NULL
 THEN RAISE EXCEPTION 'Administrative role inherited Fleet business access'; END IF;
END $$;
SELECT pg_temp.t05_actor(6) AS claims \gset
DO $$ BEGIN
 IF public.t05_read_fleet_asset(pg_temp.t05_asset(1)) IS NULL OR public.t05_read_fleet_asset(pg_temp.t05_asset(1))->'evidence'<>'[]'
   OR EXISTS(SELECT 1 FROM public.dms_documents WHERE id IN (970001,970002))
 THEN RAISE EXCEPTION 'Fleet view inherited DMS access'; END IF;
END $$;
SELECT pg_temp.t05_actor(7) AS claims \gset
DO $$ BEGIN
 IF (SELECT count(*) FROM public.read_dms_entity_document_links('fleet_asset',pg_temp.t05_asset(1)) WHERE deleted_at IS NULL)<>2
   OR public.f03_has_document_permission(970001,'dms.documents.preview')
   OR NOT EXISTS(SELECT 1 FROM public.f03_read_document_files_for_document(970001) WHERE ocr_text IS NULL AND ocr_error_message IS NULL)
   OR public.t05_read_fleet_asset(pg_temp.t05_asset(1))->'evidence'<>'[]'
 THEN RAISE EXCEPTION 'Fleet metadata viewer received sensitive proof fields or incorrect counts'; END IF;
END $$;

SELECT pg_temp.t05_actor(1) AS claims \gset
DO $$
DECLARE aid bigint:=pg_temp.t05_asset(1); bid bigint:=pg_temp.t05_asset(2);
BEGIN
 PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(23),aid,'lifecycle',
  '{"revision":13,"date":"2026-02-01","reason":"Retired from use","status":"retired"}');
 IF NOT EXISTS(SELECT 1 FROM public.t05_search_fleet_assets('T05 Tractor') WHERE id=aid AND status='retired')
   OR EXISTS(SELECT 1 FROM public.t05_search_fleet_assets('T05 Tractor',50,0,true))
   OR (SELECT count(*) FROM public.t05_search_fleet_assets('T05',1,1))<>1
   OR EXISTS(SELECT 1 FROM public.t05_search_fleet_assets('T05',1,2))
   OR public.t05_read_fleet_asset(aid)->'evidence'='[]'
 THEN RAISE EXCEPTION 'Retired asset/history, link picker or Fleet paging incorrect'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.t05_search_fleet_assets('12345') WHERE id=bid)
 THEN RAISE EXCEPTION 'Legitimate later plate assignment lost'; END IF;
END;
$$;
RESET ROLE;
SET LOCAL session_replication_role=replica;
INSERT INTO public.work_sites(id,site_code,site_name,site_type,owner_company_id,branch_id,available_to_all_organizations)
 OVERRIDING SYSTEM VALUE VALUES(970001,'T05-YARD-A','Synthetic scoped yard','yard',920001,920011,false),
 (970002,'T05-YARD-B','Synthetic private sibling yard','yard',920001,920012,false),
 (970003,'T05-SHARED','Synthetic shared yard','yard',920002,920021,true);
INSERT INTO public.countries(id,country_code,iso3_code,name_en,nationality_en)
 OVERRIDING SYSTEM VALUE VALUES(970001,'ZZ','ZZZ','Synthetic fixture country','Synthetic fixture');
INSERT INTO public.party_natures(id,nature_code,name_en)
 OVERRIDING SYSTEM VALUE VALUES(970001,'T05_CORP','Synthetic company');
INSERT INTO public.party_statuses(id,status_code,name_en)
 OVERRIDING SYSTEM VALUE VALUES(970001,'T05_ACTIVE','Synthetic active');
INSERT INTO public.parties(id,party_code,display_name,legal_name_en,party_nature_id,country_id,party_status_id)
 OVERRIDING SYSTEM VALUE VALUES(970001,'T05-SUPPLIER','Synthetic rental owner','Synthetic rental owner',970001,970001,970001);
UPDATE public.dms_documents SET status='superseded' WHERE id=970002;
SET LOCAL session_replication_role=origin;
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope)
 VALUES('master_data.parties.view','Synthetic test grant','master_data','test','held') ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.role_permissions(role_id,permission_id)
 SELECT r.id,p.id FROM public.roles r CROSS JOIN public.permissions p WHERE r.role_code='t05_manage'
   AND p.permission_code='master_data.parties.view' ON CONFLICT DO NOTHING;
SET LOCAL ROLE authenticated;
SELECT pg_temp.t05_actor(1) AS claims \gset
DO $$
DECLARE id bigint; choices jsonb;
BEGIN
 choices:=public.t05_fleet_asset_choices(920001,920011)->'sites';
 IF NOT choices @> '[{"id":970001},{"id":970003}]' OR choices @> '[{"id":970002}]'
 THEN RAISE EXCEPTION 'Fleet site choices crossed a private branch or dropped a shared site'; END IF;
 IF (public.t05_read_fleet_asset(pg_temp.t05_asset(1))->'evidence'->0->>'source_current') IS DISTINCT FROM 'false'
 THEN RAISE EXCEPTION 'Superseded DMS proof still appeared current'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.t05_search_fleet_parties(920001,920011,'rental owner') AS p WHERE p.id=970001)
 THEN RAISE EXCEPTION 'Rental owner lookup lost the scoped Party Master grant'; END IF;
 id:=(public.t05_write_fleet_asset(pg_temp.t05_op(24),NULL,'create',
    '{"company":920001,"branch":920011,"name":"Rental equipment","category":"equipment","serial":"RENT-001"}')->>'id')::bigint;
 PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(25),id,'ownership',
    '{"revision":1,"date":"2026-01-01","reason":"Verified rental owner","mode":"rental","party":970001}');
 BEGIN
   PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(26),id,'location',
    '{"revision":2,"date":"2026-01-02","reason":"Wrong private yard","company":920001,"branch":920011,"site":970002}');
   RAISE EXCEPTION 'Private sibling site was accepted';
 EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
 PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(27),id,'location',
    '{"revision":2,"date":"2026-01-02","reason":"Verified shared yard","company":920001,"branch":920011,"site":970003}');
 IF public.t05_read_fleet_asset(id)->'history'->0->>'site_id'<>'970003'
    OR public.t05_read_fleet_asset(id)->'history'->1->>'party_id'<>'970001'
 THEN RAISE EXCEPTION 'Rental legal ownership and location did not retain their separate sources'; END IF;
 INSERT INTO public.dms_document_links(document_id,entity_type,entity_id)
   VALUES (970003,'fleet_asset',pg_temp.t05_asset(2));
 PERFORM public.t05_write_fleet_asset(pg_temp.t05_op(28),pg_temp.t05_asset(2),'verify-document',
    '{"revision":2,"date":"2026-01-01","expires":"2026-12-31","reason":"Compared insurance policy to the original","kind":"insurance","document":970003,"version":970003,"file":970003,"facts":{"insurer":"Synthetic insurer","policy_number":"T05-INS"}}');
 IF public.t05_read_fleet_asset(pg_temp.t05_asset(2))->'evidence'->0->'facts'->>'policy_number' IS DISTINCT FROM 'T05-INS'
 THEN RAISE EXCEPTION 'Insurance did not retain the independently verified policy facts'; END IF;
END;
$$;
RESET ROLE;
DO $$ BEGIN
 IF (SELECT count(*) FROM public.global_numbering_generated_references WHERE target_table_name='fleet_assets')<>3
 THEN RAISE EXCEPTION 'Failed or repeated request retained a duplicate numbering reference'; END IF;
END $$;
SELECT 'T05 verified numbered identity, plate periods, configuration, meters, scoped DMS proof, masking, renewals and retirement';
ROLLBACK;
