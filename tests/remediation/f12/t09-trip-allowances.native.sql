\set ON_ERROR_STOP on
-- Run after the shared T07 native fixture setup and before its authenticated scenarios.
DO $$
BEGIN
 IF current_setting('cron.launch_active_jobs')<>'off' OR
    (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
      IS DISTINCT FROM 'Isolated HR T00 20261119'
 THEN RAISE EXCEPTION 'Isolated T00 database required'; END IF;
 IF to_regprocedure('public.t09_trip_allowance(uuid,bigint,text,jsonb)') IS NULL OR
    to_regprocedure('public.t09_trip_allowance_order(bigint)') IS NULL OR
    to_regprocedure('public.t09_allowance_rates(bigint,bigint)') IS NULL
 THEN RAISE EXCEPTION 'The T09 directional rates and POD allowance workflows are unavailable'; END IF;
END;
$$;

CREATE FUNCTION pg_temp.t09_profile(actor int) RETURNS bigint LANGUAGE sql STABLE AS $$
 SELECT p.id FROM public.user_profiles p WHERE p.auth_user_id=('98000000-0000-4000-8000-'||lpad(actor::text,12,'0'))::uuid;
$$;
CREATE FUNCTION pg_temp.t09_day() RETURNS date LANGUAGE sql STABLE AS $$ SELECT (now() AT TIME ZONE 'Asia/Dubai')::date; $$;
INSERT INTO public.roles(role_code,role_name,is_system_role)
SELECT 't09_'||t,t,false FROM unnest(ARRAY['rate_prepare','rate_approve','operations','accounts','approver_no_docs','scope_probe']) t;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('rate_prepare',ARRAY['fleet.allowance.rates.prepare']),('rate_approve',ARRAY['fleet.allowance.rates.approve']),
 ('operations',ARRAY['fleet.allowance.submit','fleet.allowance.approve']),
 ('accounts',ARRAY['hr.payroll.view','hr.payroll.trip_allowance.review','dms.documents.view','dms.documents.preview','fleet.assets.view']),
 ('approver_no_docs',ARRAY['fleet.allowance.approve']),
 ('scope_probe',ARRAY['fleet.allowance.submit','fleet.allowance.approve','fleet.allowance.rates.approve','hr.payroll.view','hr.payroll.trip_allowance.review'])
) g(role,caps) JOIN public.roles r ON r.role_code='t09_'||g.role JOIN public.permissions p ON p.permission_code=ANY(g.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT pg_temp.t09_profile(g.actor),r.id,g.company,g.branch,true FROM (VALUES
 (1,'operations',920001,920011),(7,'operations',920001,920011),(5,'accounts',920001,920011),(4,'approver_no_docs',920001,920011),
 (2,'rate_prepare',920001,NULL::int),(3,'rate_approve',920001,NULL),(6,'scope_probe',920001,920012),(9,'scope_probe',920002,920021)
) g(actor,role,company,branch) JOIN public.roles r ON r.role_code='t09_'||g.role;

UPDATE erp_private.fleet_assets SET category='truck' WHERE id IN(980101,980102);
INSERT INTO erp_private.fleet_asset_history(asset_id,kind,effective_on,facts,reason,recorded_by)
VALUES(980101,'configuration',pg_temp.t09_day()-5,'{"body":"Flatbed"}','Synthetic configuration',pg_temp.t09_profile(1)),
 (980102,'configuration',pg_temp.t09_day()-5,'{"body":"Tipper"}','Synthetic configuration',pg_temp.t09_profile(1));
INSERT INTO erp_private.fleet_availability_policies(company_id,category,valid_during,routine_minutes,signed_handover,registration_required,
 insurance_required,tentative_allowed,prepared_by,approved_by,approved_at,reason)
VALUES(920001,'truck',daterange(pg_temp.t09_day()-10,pg_temp.t09_day()+10,'[)'),360,false,false,false,true,
 pg_temp.t09_profile(1),pg_temp.t09_profile(7),now(),'Synthetic operating policy');

SET LOCAL session_replication_role=replica;
INSERT INTO public.dms_document_types(id,type_code,name_en,category_id) OVERRIDING SYSTEM VALUE VALUES
 (991091,'FLEET_CUSTOMER_DELIVERY_CONFIRMATION','Synthetic customer confirmation',990001),
 (991092,'FLEET_DESTINATION_SITE_RECEIPT','Synthetic site receipt',990001) ON CONFLICT(type_code) DO NOTHING;
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status,
 current_version_id,party_id) OVERRIDING SYSTEM VALUE
SELECT d.id,'T09-PROOF-'||d.id,'Synthetic delivery evidence',t.id,990001,920001,920011,'internal','active',d.id,d.party
FROM (VALUES(991091,'FLEET_CUSTOMER_DELIVERY_CONFIRMATION',990001::bigint),(991092,'FLEET_DESTINATION_SITE_RECEIPT',NULL::bigint))
 d(id,kind,party) JOIN public.dms_document_types t ON t.type_code=d.kind;
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE
 VALUES(991091,991091,1,true),(991092,991092,1,true),(991093,991092,2,false);
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
 OVERRIDING SYSTEM VALUE SELECT v.id,v.document_id,v.id,'original','dms-documents','test/t09-'||v.id||'.pdf','delivery.pdf','application/pdf',100,
 repeat((v.id % 10)::text,64),'verified' FROM public.dms_document_versions v WHERE v.id BETWEEN 991091 AND 991093;
SET LOCAL session_replication_role=origin;

CREATE FUNCTION pg_temp.t09_rate(origin bigint,destination bigint,body text,day date,value numeric) RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE entry bigint;
BEGIN
 PERFORM pg_temp.t06_actor(2);
 entry:=(public.t09_save_allowance_rate(gen_random_uuid(),920001,'prepare',jsonb_build_object('origin',origin,'destination',destination,'truck_type',body,
  'from',day,'amount',value,'currency','AED','reason','Synthetic proposed directional rate'))->>'id')::bigint;
 PERFORM pg_temp.t06_actor(3);
 PERFORM public.t09_save_allowance_rate(gen_random_uuid(),920001,'approve',jsonb_build_object('id',entry,'reason','Independent synthetic price approval'));
 RETURN entry;
END;
$$;

CREATE FUNCTION pg_temp.t09_action(actual bigint,action text,data jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.t09_trip_allowance(gen_random_uuid(),actual,action,data||'{"reason":"Synthetic allowance review"}');
$$;
CREATE FUNCTION pg_temp.t09_leg(j bigint,f bigint) RETURNS jsonb LANGUAGE sql AS $$
 SELECT item FROM jsonb_array_elements(public.t09_trip_allowance_order(j)->'legs') item WHERE (item->>'id')::bigint=f;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(1) AS actor \gset
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) SELECT id,'fleet_asset',asset FROM t07_documents;
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES(991091,'fleet_asset',980101),(991092,'fleet_asset',980101);
DO $$
DECLARE trip bigint; pl1 bigint; pl2 bigint; pl3 bigint; pl4 bigint; abandoned bigint; active bigint; issue bigint; leg1 bigint; leg2 bigint; leg3 bigint; leg4 bigint;
 forward_rate bigint; reverse_rate bigint; new_rate bigint; entry bigint; pending bigint; observed jsonb; data jsonb; opening jsonb;
 op uuid:=gen_random_uuid(); result jsonb; signed_candidate bigint; exception_candidate bigint;
BEGIN
 forward_rate:=pg_temp.t09_rate(980001,990001,' Flatbed ',pg_temp.t09_day()-2,120);
 reverse_rate:=pg_temp.t09_rate(990001,980001,'FLATBED',pg_temp.t09_day()-2,85);
 PERFORM pg_temp.t09_rate(980001,990001,'tipper',pg_temp.t09_day()-2,155);
 PERFORM pg_temp.t06_actor(2);
 entry:=(public.t09_save_allowance_rate(gen_random_uuid(),920001,'prepare',jsonb_build_object('origin',980001,
  'destination',990001,'truck_type','flatbed','from',pg_temp.t09_day()-2,'amount',999,'currency','AED','reason','synthetic duplicate price'))->>'id')::bigint;
 PERFORM pg_temp.t06_actor(3);
 BEGIN
   PERFORM public.t09_save_allowance_rate(gen_random_uuid(),920001,'approve',jsonb_build_object('id',entry,'reason','Attempt duplicate'));
   RAISE EXCEPTION 'Ambiguous same-date rate was approved';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(1);
 trip:=(pg_temp.t07_command(NULL,'create','{"company":920001,"branch":920011,"site":980001,"customer":990001,
  "kind":"trip","reference":"T09-JOB","subject":"Synthetic T09 round trip"}')->>'id')::bigint;
 pl1:=(pg_temp.t07_command(trip,'plan-leg','{"sequence":1,"origin":980001,"destination":990001,"load":"loaded","cargo":"Test load"}')->>'event_id')::bigint;
 pl2:=(pg_temp.t07_command(trip,'plan-leg','{"sequence":2,"origin":990001,"destination":980001,"load":"loaded","cargo":"Return test load"}')->>'event_id')::bigint;
 pl3:=(pg_temp.t07_command(trip,'plan-leg','{"sequence":3,"origin":980001,"destination":990001,"load":"empty"}')->>'event_id')::bigint;
 pl4:=(pg_temp.t07_command(trip,'plan-leg','{"sequence":4,"origin":990001,"destination":980001,"load":"loaded","cargo":"Evidence test load"}')->>'event_id')::bigint;
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t07_command(trip,'authorize','{"authorization":"T09-APPROVED"}');
 PERFORM pg_temp.t06_actor(1);
 abandoned:=(pg_temp.t07_command(trip,'assign',pg_temp.t07_move(980102,980001,-60,55))->>'event_id')::bigint;
 active:=(pg_temp.t07_command(trip,'substitute',pg_temp.t07_move(980101,980002,-58,52)||jsonb_build_object('assignment',abandoned))->>'event_id')::bigint;
 -- The typed truck and rate at each assignment remain separately traceable.
 RESET ROLE;
 IF (SELECT rate_id FROM erp_private.t09_assignment_rates WHERE assignment_id=active AND leg_id=pl1) IS DISTINCT FROM forward_rate
  OR (SELECT rate_id FROM erp_private.t09_assignment_rates WHERE assignment_id=active AND leg_id=pl2) IS DISTINCT FROM reverse_rate
  OR (SELECT truck_type FROM erp_private.t09_assignment_rates WHERE assignment_id=abandoned AND leg_id=pl1) IS DISTINCT FROM 'tipper'
 THEN RAISE EXCEPTION 'Assignment quote did not pin direction, vehicle and version'; END IF;
 SET LOCAL ROLE authenticated;
 issue:=(pg_temp.t07_command(trip,'issue-paper','{}')->>'event_id')::bigint;
 PERFORM pg_temp.t07_publish_test_paper(trip,issue);
 PERFORM pg_temp.t07_command(trip,'inspect',jsonb_build_object('assignment',active,'at',pg_temp.t06_when(-65),'passed',true,
  'evidence',pg_temp.t07_packet(990102,'T09-INSPECTION')));
 PERFORM pg_temp.t07_command(trip,'start',jsonb_build_object('assignment',active,'at',pg_temp.t06_when(-55),'snapshot',pg_temp.t06_facts(),
  'issue',issue,'evidence',pg_temp.t07_packet(990101,public.t07_fleet_trip_order(trip,issue)->>'issue')));
 data:=jsonb_build_object('reason','First delivery','revision',(public.t07_fleet_operation_detail(trip)->>'revision')::integer,
  'assignment',active,'leg',pl1,'origin',980001,'destination',990001,'from',pg_temp.t06_when(-54),'until',pg_temp.t06_when(-43),
  'load','loaded','cargo','Test load','delivery','accepted','pod',pg_temp.t07_packet(990103,'T09-SIGNED-1'),
  'gross_kg',34000,'tare_kg',14000,'weigh',pg_temp.t07_packet(990104,'T09-WEIGHT-1'));
 result:=public.t07_fleet_operation(op,trip,'complete-leg',data);
 leg1:=(result->>'event_id')::bigint;
 IF public.t07_fleet_operation(op,trip,'complete-leg',data) IS DISTINCT FROM result||'{"replayed":true}'
 THEN RAISE EXCEPTION 'Duplicate completed-leg request did not return exact receipt'; END IF;
 leg2:=(pg_temp.t07_command(trip,'complete-leg',jsonb_build_object('assignment',active,'leg',pl2,'origin',990001,'destination',980001,
   'from',pg_temp.t06_when(-40),'until',pg_temp.t06_when(-30),'load','loaded','cargo','Return test load',
   'delivery','missing','discrepancy','Awaiting customer signature'))->>'event_id')::bigint;
 leg3:=(pg_temp.t07_command(trip,'complete-leg',jsonb_build_object('assignment',active,'leg',pl3,'origin',980001,'destination',990001,
   'from',pg_temp.t06_when(-20),'until',pg_temp.t06_when(-10),'load','empty','delivery','not-required'))->>'event_id')::bigint;
 leg4:=(pg_temp.t07_command(trip,'complete-leg',jsonb_build_object('assignment',active,'leg',pl4,'origin',990001,'destination',980001,
   'from',pg_temp.t06_when(-8),'until',pg_temp.t06_when(-5),'load','loaded','cargo','Evidence test load',
   'delivery','missing','discrepancy','Awaiting proof'))->>'event_id')::bigint;
 IF pg_temp.t09_leg(trip,leg1)->>'worker' IS DISTINCT FROM 'Synthetic T06 Custodian B'
   OR pg_temp.t09_leg(trip,leg2)->>'state' IS DISTINCT FROM 'pod-review'
   OR pg_temp.t09_leg(trip,leg3)->>'state' IS DISTINCT FROM 'empty'
   OR pg_temp.t09_leg(trip,leg1)->>'amount' IS NOT NULL
 THEN RAISE EXCEPTION 'Original driver, pending POD, empty leg, or Operations money boundary failed'; END IF;
 BEGIN
   PERFORM pg_temp.t07_command(trip,'complete-leg',data);
   RAISE EXCEPTION 'A second actual completion was created';
 EXCEPTION WHEN unique_violation THEN NULL; END;
 new_rate:=pg_temp.t09_rate(980001,990001,'flatbed',pg_temp.t09_day(),140);
 PERFORM pg_temp.t06_actor(7);
 opening:=pg_temp.t09_leg(trip,leg1);
 IF opening->>'state' IS DISTINCT FROM 'rate-review' THEN RAISE EXCEPTION 'Rate drift bypassed review'; END IF;
 PERFORM pg_temp.t09_action(leg1,'review-rate',jsonb_build_object('digest',opening->'route_digest'));
 PERFORM pg_temp.t06_actor(1);
 observed:=jsonb_build_object('trip',public.t09_trip_allowance_order(trip)->>'number','sequence',2,'asset','T06-TEST-980101',
   'origin',990001,'destination',980001,'delivered',pg_temp.t06_when(-29),'issuer',990001);
 BEGIN
   PERFORM pg_temp.t09_action(leg2,'submit-exception',jsonb_build_object('kind','customer-confirmation','observed',observed||'{"destination":990001}',
     'evidence',pg_temp.t07_packet(991091,'T09-CUSTOMER')));
   RAISE EXCEPTION 'Wrong destination witness admitted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN
   PERFORM pg_temp.t09_action(leg2,'submit-exception',jsonb_build_object('kind','destination-weighbridge','observed',observed,
     'evidence',pg_temp.t07_packet(990104,'T09-XWEIGH')));
   RAISE EXCEPTION 'Weigh ticket already bound to another leg was admitted despite copied observations';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 pending:=(pg_temp.t09_action(leg2,'submit-exception',jsonb_build_object('kind','site-receipt','observed',observed,
     'evidence',pg_temp.t07_packet(991092,'T09-SITE')))->>'id')::bigint;
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t09_action(leg2,'reject-exception',jsonb_build_object('id',pending));
 PERFORM pg_temp.t06_actor(1);
 pending:=(pg_temp.t09_action(leg4,'submit-exception',jsonb_build_object('kind','site-receipt',
     'observed',observed||jsonb_build_object('sequence',4,'delivered',pg_temp.t06_when(-4)),
     'evidence',pg_temp.t07_packet(991092,'T09-SITE')))->>'id')::bigint;
 IF pending IS NULL THEN RAISE EXCEPTION 'Rejected witness could not be reassigned to its proper loaded leg'; END IF;
 PERFORM public.f07_change_document_version(991092,991093,'promote',991092);
 PERFORM pg_temp.t06_actor(7);
 BEGIN
   PERFORM pg_temp.t09_action(leg4,'approve-exception',jsonb_build_object('id',pending));
   RAISE EXCEPTION 'Stale site receipt approved';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t09_action(leg4,'reject-exception',jsonb_build_object('id',pending));
 PERFORM pg_temp.t06_actor(1);
 pending:=(pg_temp.t09_action(leg2,'submit-exception',jsonb_build_object('kind','customer-confirmation','observed',observed,
    'evidence',pg_temp.t07_packet(991091,'T09-CUSTOMER')))->>'id')::bigint;
 BEGIN
   PERFORM pg_temp.t09_action(leg2,'approve-exception',jsonb_build_object('id',pending));
   RAISE EXCEPTION 'The trip entrant approved their exception';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t06_actor(4);
 BEGIN
   PERFORM pg_temp.t09_action(leg2,'approve-exception',jsonb_build_object('id',pending));
   RAISE EXCEPTION 'Manager without DMS access approved the proof';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t09_action(leg2,'approve-exception',jsonb_build_object('id',pending));
 IF pg_temp.t09_leg(trip,leg2)->>'has_signed_pod' IS DISTINCT FROM 'false'
   OR pg_temp.t09_leg(trip,leg2)->>'proof_available' IS DISTINCT FROM 'true'
   OR (public.t07_fleet_operation_detail(trip)->'legs'->1->>'delivery') IS DISTINCT FROM 'missing'
 THEN RAISE EXCEPTION 'Payroll exception incorrectly altered billing or signed POD readiness'; END IF;
 PERFORM pg_temp.t06_actor(6);
 IF public.t09_trip_allowance_order(trip) IS NOT NULL OR public.t09_allowance_rates(920001) IS NOT NULL
 THEN RAISE EXCEPTION 'Sibling branch inherited trip or rate authority'; END IF;
 PERFORM pg_temp.t06_actor(8);
 IF public.t09_trip_allowance_order(trip) IS NOT NULL THEN RAISE EXCEPTION 'Reserved administrator inherited business authority'; END IF;
 PERFORM pg_temp.t06_actor(5);
 opening:=pg_temp.t09_leg(trip,leg1);
 IF opening->>'amount' IS DISTINCT FROM '140.00' THEN RAISE EXCEPTION 'Forward trip used wrong amount: %',opening; END IF;
 signed_candidate:=(pg_temp.t09_action(leg1,'accept',jsonb_build_object('digest',opening->'digest'))->>'id')::bigint;
 opening:=pg_temp.t09_leg(trip,leg2);
 IF opening->>'amount' IS DISTINCT FROM '85.00' THEN RAISE EXCEPTION 'Reverse trip used wrong amount: %',opening; END IF;
 exception_candidate:=(pg_temp.t09_action(leg2,'accept',jsonb_build_object('digest',opening->'digest'))->>'id')::bigint;
 IF (pg_temp.t09_action(leg2,'accept',jsonb_build_object('digest',opening->'digest'))->>'id')::bigint IS DISTINCT FROM exception_candidate
 THEN RAISE EXCEPTION 'Repeated allowance acceptance created another version'; END IF;
 PERFORM pg_temp.t06_actor(1);
 PERFORM pg_temp.t07_command(trip,'resolve-pod',jsonb_build_object('leg',pl2,'pod',pg_temp.t07_packet(990107,'T09-SIGNED-2')));
 PERFORM set_config('erp.t09_trip',trip::text,true);
 PERFORM set_config('erp.t09_reverse',leg2::text,true);
 PERFORM set_config('erp.t09_forward_candidate',signed_candidate::text,true);
 PERFORM set_config('erp.t09_reverse_candidate',exception_candidate::text,true);
END;
$$;

SELECT pg_temp.t06_actor(5) AS actor \gset
DO $$
DECLARE pool jsonb:=public.t09_payroll_candidates(920001,statement_timestamp()); n bigint; claim bigint; op uuid:=gen_random_uuid();
 original bigint:=current_setting('erp.t09_reverse_candidate')::bigint; f bigint:=current_setting('erp.t09_reverse')::bigint; proposed bigint; adjusted bigint;
 trip bigint:=current_setting('erp.t09_trip')::bigint; opening jsonb; obsolete bigint;
BEGIN
 IF jsonb_array_length(pool) IS DISTINCT FROM 2 OR NOT pool @> jsonb_build_array(jsonb_build_object('id',original))
 THEN RAISE EXCEPTION 'Two loaded legs or late signed-proof upgrade lost a candidate: %',pool; END IF;
 IF public.t09_payroll_candidates(920001,now()-interval '1 day')<>'[]'::jsonb
 THEN RAISE EXCEPTION 'Allowance appeared before its cutoff'; END IF;
 RESET ROLE;
 claim:=erp_private.t09_claim_allowance(original,op);
 IF erp_private.t09_claim_allowance(original,op) IS DISTINCT FROM claim THEN RAISE EXCEPTION 'Payroll claim retry failed'; END IF;
 BEGIN
   PERFORM erp_private.t09_claim_allowance(original,gen_random_uuid());
   RAISE EXCEPTION 'Second payroll consumer claimed the same leg';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(1);
 BEGIN
   PERFORM pg_temp.t09_action(f,'propose-adjustment','{"mode":"void"}');
   RAISE EXCEPTION 'Unsettled allowance accepted a correction';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 RESET ROLE;
 n:=erp_private.t09_record_allowance_settlement(claim,gen_random_uuid());
 IF n IS DISTINCT FROM claim THEN RAISE EXCEPTION 'Exact settlement reference not retained'; END IF;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t09_rate(990001,980001,'flatbed',pg_temp.t09_day()-1,95);
 PERFORM pg_temp.t06_actor(7);
 opening:=pg_temp.t09_leg(trip,f);
 IF opening->>'state' IS DISTINCT FROM 'claimed' OR opening->>'rate_needs_review' IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'Claimed trip hid the rate recheck'; END IF;
 PERFORM pg_temp.t09_action(f,'review-rate',jsonb_build_object('digest',opening->'route_digest'));
 PERFORM pg_temp.t06_actor(1);
 proposed:=(pg_temp.t09_action(f,'propose-adjustment','{"mode":"reprice"}')->>'id')::bigint;
 PERFORM pg_temp.t09_rate(990001,980001,'flatbed',pg_temp.t09_day(),99);
 PERFORM pg_temp.t06_actor(5);
 BEGIN
   PERFORM pg_temp.t09_action(f,'accept-adjustment',jsonb_build_object('id',proposed));
   RAISE EXCEPTION 'Stale reprice proposal accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t09_action(f,'reject-adjustment',jsonb_build_object('id',proposed));
 PERFORM pg_temp.t06_actor(7);
 opening:=pg_temp.t09_leg(trip,f);
 PERFORM pg_temp.t09_action(f,'review-rate',jsonb_build_object('digest',opening->'route_digest'));
 PERFORM pg_temp.t06_actor(1);
 proposed:=(pg_temp.t09_action(f,'propose-adjustment','{"mode":"reprice"}')->>'id')::bigint;
 PERFORM pg_temp.t06_actor(5);
 obsolete:=(pg_temp.t09_action(f,'accept-adjustment',jsonb_build_object('id',proposed))->>'id')::bigint;
 RESET ROLE;
 IF (SELECT amount FROM erp_private.t09_allowance_versions WHERE id=obsolete) IS DISTINCT FROM 14
 THEN RAISE EXCEPTION 'Settled reprice did not append the exact positive delta'; END IF;
 UPDATE public.dms_documents SET is_archived=true WHERE id=990107;
 BEGIN
   PERFORM erp_private.t09_claim_allowance(obsolete,gen_random_uuid());
   RAISE EXCEPTION 'A reprice with stale supporting proof was claimed';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t09_action(f,'withdraw-adjustment',jsonb_build_object('id',obsolete));
 PERFORM pg_temp.t06_actor(1);
 proposed:=(pg_temp.t09_action(f,'propose-adjustment','{"mode":"void"}')->>'id')::bigint;
 PERFORM pg_temp.t06_actor(5);
 adjusted:=(pg_temp.t09_action(f,'accept-adjustment',jsonb_build_object('id',proposed))->>'id')::bigint;
 RESET ROLE;
 IF (SELECT amount FROM erp_private.t09_allowance_versions WHERE id=adjusted AND prior_version_id=original) IS DISTINCT FROM -85
   OR (SELECT amount FROM erp_private.t09_allowance_versions WHERE id=original) IS DISTINCT FROM 85
 THEN RAISE EXCEPTION 'Reversal did not preserve the settled original and linked amount'; END IF;
 SET LOCAL ROLE authenticated;
END;
$$;
SELECT 'PASS: T09 directional snapshots, substitution, current POD and independent exceptions, two loaded legs, cutoff, unique claims and linked settled reversal';
ROLLBACK;
