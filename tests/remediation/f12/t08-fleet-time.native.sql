\set ON_ERROR_STOP on
-- Prepend the T07 native setup through its fixture helpers, before the first
-- top-level SET LOCAL ROLE authenticated. The shared fixture opens the transaction.
DO $$
BEGIN
 IF current_setting('cron.launch_active_jobs')<>'off'
   OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
        IS DISTINCT FROM 'Isolated HR T00 20261119'
 THEN RAISE EXCEPTION 'Isolated T00 database required'; END IF;
 IF to_regprocedure('public.t08_fleet_time(uuid,bigint,text,jsonb)') IS NULL
   OR to_regprocedure('public.t08_review_attendance(uuid,bigint,date,text,text,text)') IS NULL
   OR to_regprocedure('public.t08_fleet_payroll_candidates(bigint,timestamptz,bigint)') IS NULL
 THEN RAISE EXCEPTION 'T08 Fleet time, attendance handoff and payroll candidates are unavailable';
 END IF;
END;
$$;

CREATE TEMP TABLE t08_fixture (id bigint PRIMARY KEY, order_id bigint, asset bigint, worker bigint, begins timestamptz, ends timestamptz, kind text, slot int);
INSERT INTO t08_fixture VALUES
 (991001,991001,980102,980001,'2026-10-03 08:00+04','2026-10-03 18:00+04','rental',1),
 (991002,991001,980102,980002,'2026-10-17 08:00+04','2026-10-17 18:00+04','rental',1),
 (991003,991002,980101,980002,'2026-11-02 08:00+04','2026-11-02 18:00+04','trip',1),
 (991004,991003,980101,980001,'2026-11-04 22:00+04','2026-11-05 05:00+04','trip',1);
CREATE FUNCTION pg_temp.t08_profile(actor int) RETURNS bigint LANGUAGE sql STABLE AS $$
 SELECT p.id FROM public.user_profiles p WHERE p.auth_user_id=('98000000-0000-4000-8000-'||lpad(actor::text,12,'0'))::uuid;
$$;
INSERT INTO public.roles(role_code,role_name,is_system_role)
SELECT 't08_'||t,t,false FROM unnest(ARRAY['origin','verify','hr','accounts','receiver','received_verify','policy_prepare','policy_review','policy_approve']) t;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('origin',ARRAY['fleet.time.enter','fleet.time.host']),
 ('verify',ARRAY['fleet.time.verify']),
 ('hr',ARRAY['hr.employees.view','hr.employees.update','hr.attendance.view','hr.attendance.manage']),
 ('accounts',ARRAY['hr.payroll.view','hr.payroll.fleet_time.review']),
 ('receiver',ARRAY['fleet.time.enter','fleet.time.host']),
 ('received_verify',ARRAY['fleet.time.verify']),
 ('policy_prepare',ARRAY['integrated.policy.prepare']),
 ('policy_review',ARRAY['integrated.policy.review']),
 ('policy_approve',ARRAY['integrated.policy.approve'])
) g(role,caps) JOIN public.roles r ON r.role_code='t08_'||g.role JOIN public.permissions p ON p.permission_code=ANY(g.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT pg_temp.t08_profile(g.actor),r.id,g.company,g.branch,true FROM (VALUES
 (1,'origin',920001,920011),(7,'verify',920001,920011),(4,'hr',920001,920011),(5,'hr',920001,920011),
 (2,'accounts',920001,920011),(9,'receiver',920002,920021),(3,'received_verify',920002,920021),
 (1,'policy_prepare',920001,NULL::int),(4,'policy_review',920001,NULL),(7,'policy_approve',920001,NULL)
) g(actor,role,company,branch) JOIN public.roles r ON r.role_code='t08_'||g.role;

INSERT INTO erp_private.fleet_operation_orders(id,order_no,kind,company_id,branch_id,site_id,customer_id,rental_mode,request_reference,subject,
  status,raised_by,authorized_by,authorized_at,authorization_reference) OVERRIDING SYSTEM VALUE
SELECT DISTINCT ON(f.order_id) f.order_id,'T08-FIXTURE-'||f.order_id,kind,920001,920011,980001,CASE WHEN kind='rental' THEN 990001 END,
 CASE WHEN kind='rental' THEN 'wet' END,'T08 synthetic source','T08 synthetic Fleet time','active',
 pg_temp.t08_profile(1),pg_temp.t08_profile(7),f.begins-interval '1 day','T08-FIXTURE' FROM t08_fixture f ORDER BY f.order_id,f.id;
INSERT INTO erp_private.fleet_commitments(id,asset_id,employee_id,employment_period_id,company_id,branch_id,site_id,kind,status,committed_during,
 planned_return,verified_driver_id,policy_id,created_by) OVERRIDING SYSTEM VALUE
SELECT f.id*10+exp.part,f.asset,f.worker,ep.id,920001,920011,980001,
 CASE WHEN exp.part=0 THEN 'reservation' WHEN f.kind='rental' THEN 'custody' ELSE 'dispatch' END,
 CASE WHEN exp.part=0 THEN 'cancelled' ELSE 'closed' END,tstzrange(begins,ends,'[)'),ends,
 CASE WHEN exp.part=1 AND f.kind='trip' THEN f.worker END,policy.id,pg_temp.t08_profile(1)
FROM t08_fixture f JOIN erp_private.t03_employment_periods ep ON ep.employee_id=f.worker
CROSS JOIN (VALUES(0),(1)) exp(part)
CROSS JOIN LATERAL(SELECT id FROM erp_private.fleet_availability_policies WHERE company_id=920001 AND category='light_vehicle') policy;
INSERT INTO erp_private.fleet_operation_assignments(id,order_id,slot,supersedes_id,reservation_id,actual_commitment_id,asset_id,worker_id,employment_id,
 employer_company_id,employer_branch_id,host_company_id,host_branch_id,site_id,planned_period,state,planned_by,reason) OVERRIDING SYSTEM VALUE
SELECT f.id,f.order_id,f.slot,CASE WHEN f.id=991002 THEN 991001 END,f.id*10,f.id*10+1,f.asset,f.worker,ep.id,
  920001,920011,920001,920011,980001,tstzrange(begins,ends,'[)'),CASE WHEN f.id=991001 THEN 'replaced' ELSE 'closed' END,
  pg_temp.t08_profile(1),'Synthetic historical handover' FROM t08_fixture f JOIN erp_private.t03_employment_periods ep ON ep.employee_id=f.worker
ORDER BY f.id;

SET LOCAL session_replication_role=replica;
INSERT INTO public.hr_salary_component_types(id,code,name_en,component_kind,is_basic,is_active) OVERRIDING SYSTEM VALUE
 VALUES(991900,'T08_BASIC','Synthetic basic','earning',true,true),(991901,'T08_FIXED','Synthetic fixed pay','earning',false,true);
INSERT INTO public.employee_payroll_profiles(employee_id,effective_date,currency,payroll_status) VALUES
 (980001,'2024-01-01','AED','active'),(980002,'2024-01-01','AED','active');
INSERT INTO public.employee_salary_components(employee_id,component_type_id,amount,effective_from,is_active) VALUES
 (980001,991900,4000,'2024-01-01',true),(980002,991900,3000,'2024-01-01',true),(980002,991901,1000,'2024-01-01',true);
INSERT INTO public.employee_salary_revisions(id,employee_id,effective_date,old_gross,new_gross,created_by,approved_by) OVERRIDING SYSTEM VALUE
 VALUES(991903,980002,'2026-10-25',3000,3500,pg_temp.t08_profile(1),pg_temp.t08_profile(7));
INSERT INTO public.employee_salary_revision_reviews(revision_id,employee_id,status,source_fingerprint,apply_requested,currency,
 requested_by,approved_by,approved_at,applied_by,applied_at)
 VALUES(991903,980002,'applied',repeat('c',64),true,'AED',pg_temp.t08_profile(1),pg_temp.t08_profile(7),'2026-10-24',pg_temp.t08_profile(2),'2026-10-24');
INSERT INTO public.employee_salary_revision_effects(id,revision_id,employee_id,effective_date,new_basic,currency,approved_by,applied_by,applied_at,
 source_fingerprint) OVERRIDING SYSTEM VALUE
 VALUES(991903,991903,980002,'2026-10-25',3500,'AED',pg_temp.t08_profile(7),pg_temp.t08_profile(2),'2026-10-24',repeat('c',64));
INSERT INTO public.work_calendars(id,calendar_code,calendar_name,owner_company_id,working_days,weekend_days) OVERRIDING SYSTEM VALUE
 VALUES (991904,'T08-STD','Synthetic standard',920001,ARRAY['mon','tue','wed','thu','fri','sat'],ARRAY['sun']);
INSERT INTO public.work_shifts(id,shift_code,shift_name,calendar_id,shift_start_time,shift_end_time,total_hours,is_overnight) OVERRIDING SYSTEM VALUE
 VALUES (991905,'T08-DAY','Synthetic ordinary shift',991904,'08:00','16:00',8,false);
INSERT INTO public.employee_shift_assignments(id,employee_id,work_calendar_id,work_shift_id,weekly_off_day,overtime_eligible,effective_from) OVERRIDING SYSTEM VALUE
 VALUES (991906,980001,991904,991905,'fri',true,'2024-01-01'),(991907,980002,991904,991905,'fri',true,'2024-01-01'),
 (991908,980003,991904,991905,NULL,false,'2024-01-01');
SET LOCAL session_replication_role=origin;

INSERT INTO erp_private.t02_work_rule_versions(company_id,employee_group_id,employee_id,category,effective_period,
 facts,digest,phase,prepared_by,reviewed_by,approved_by,approved_at)
SELECT 920001,g,employee,category,daterange(begins,ends,'[)'),facts,erp_private.t02_digest(facts),'approved',
 '98000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000004','98000000-0000-4000-8000-000000000007','2026-09-01'
FROM (VALUES
 (NULL::bigint,NULL::bigint,'overtime.standard','2026-10-01'::date,'2026-11-01'::date,'{"salary_basis":"basic","component_type_ids":[],"rate_multiplier":1.25,"monthly_hours":200}'::jsonb),
 (920001,NULL,'overtime.standard','2026-10-01','2026-11-01','{"salary_basis":"basic","component_type_ids":[],"rate_multiplier":1.5,"monthly_hours":200}'),
 (NULL,980001,'overtime.standard','2026-10-01','2026-11-01','{"salary_basis":"basic","component_type_ids":[],"rate_multiplier":2,"monthly_hours":200,"exception_reason":"Synthetic agreed terms"}'),
 (NULL,NULL,'overtime.standard','2026-11-01','2026-12-01','{"salary_basis":"basic","component_type_ids":[],"rate_multiplier":3,"monthly_hours":200}'),
 (NULL,NULL,'overtime.public_holiday','2026-11-01','2026-12-01','{"salary_basis":"approved_components","component_type_ids":[991900,991901],"rate_multiplier":2,"monthly_hours":200}'),
 (NULL,NULL,'overtime.overnight','2026-11-01','2026-12-01','{"salary_basis":"basic","component_type_ids":[],"rate_multiplier":1.5,"monthly_hours":200}')
) v(g,employee,category,begins,ends,facts);

CREATE FUNCTION pg_temp.t08_call(p_order bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.t08_fleet_time(gen_random_uuid(),p_order,p_action,p_data||'{"reason":"Synthetic review"}');
$$;
CREATE FUNCTION pg_temp.t08_work(p_order bigint,p_assignment bigint,p_from text,p_until text,p_host bigint DEFAULT NULL)
RETURNS bigint LANGUAGE sql AS $$
 SELECT (pg_temp.t08_call(p_order,'record',jsonb_build_object('assignment',p_assignment,'from',p_from,'until',p_until,'host',p_host))->>'id')::bigint;
$$;
CREATE FUNCTION pg_temp.t08_review(p_order bigint,p_work bigint) RETURNS jsonb LANGUAGE sql AS $$
 SELECT pg_temp.t08_call(p_order,'verify',jsonb_build_object('work',p_work,'source_digest',w->>'source_digest','review',w->'review'))
 FROM jsonb_array_elements(public.t08_fleet_order_time(p_order)->'work') w WHERE (w->>'id')::bigint=p_work;
$$;
CREATE FUNCTION pg_temp.t08_queue(p_day date,p_work bigint) RETURNS jsonb LANGUAGE sql AS $$
 SELECT w FROM jsonb_array_elements(public.t08_payroll_queue(920001,p_day)) w WHERE (w->>'work')::bigint=p_work;
$$;
CREATE FUNCTION pg_temp.t08_calendar(p_day date,p_category text,p_minutes int) RETURNS void LANGUAGE plpgsql AS $$
DECLARE item bigint;
BEGIN
 PERFORM pg_temp.t06_actor(1);
 item:=(public.t08_calendar_day(gen_random_uuid(),920001,'prepare',jsonb_build_object('day',p_day,'category',p_category,
    'regular_minutes',p_minutes,'reason','Synthetic dated policy')))->>'id';
 PERFORM pg_temp.t06_actor(4);
 PERFORM public.t08_calendar_day(gen_random_uuid(),920001,'review',jsonb_build_object('id',item,'reason','HR reviewed exact day'));
 PERFORM pg_temp.t06_actor(7);
 PERFORM public.t08_calendar_day(gen_random_uuid(),920001,'approve',jsonb_build_object('id',item,'reason','GM approved exact day'));
END;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(1) AS actor \gset
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) SELECT id,'fleet_asset',asset FROM t07_documents;
SELECT pg_temp.t08_calendar('2026-10-03','overtime.standard',480);
SELECT pg_temp.t08_calendar('2026-11-02','overtime.public_holiday',0);
SELECT pg_temp.t08_calendar('2026-11-04','overtime.overnight',120);
SELECT pg_temp.t08_calendar('2026-11-05','overtime.overnight',60);
SELECT pg_temp.t08_calendar('2026-10-22','overtime.ramadan',360);

RESET ROLE;
DO $$
DECLARE full_span tstzmultirange:=tstzmultirange(tstzrange('2026-10-03 17:00+04','2026-10-03 17:03+04','[)'));
 allocated numeric;
BEGIN
 IF erp_private.t08_calendar_basis(980001,920001,'2026-10-23',false)->>'category' IS DISTINCT FROM 'overtime.rest_day'
   OR erp_private.t08_calendar_basis(980001,920001,'2026-10-22',false)->>'category' IS DISTINCT FROM 'overtime.ramadan'
   OR (erp_private.t08_calendar_basis(980001,920001,'2026-10-22',false)->>'regular_minutes')::int IS DISTINCT FROM 360
   OR (erp_private.t08_calendar_basis(980002,920001,'2026-10-17',false)->>'regular_minutes')::int IS DISTINCT FROM 480
   OR erp_private.t08_calendar_basis(980003,920001,'2026-10-22',false)->>'ineligible' IS DISTINCT FROM 'true'
 THEN RAISE EXCEPTION 'Dated F12 eligibility, individual off day, standard or Ramadan schedule failed'; END IF;
 SELECT sum(erp_private.t08_range_amount(full_span,tstzmultirange(tstzrange(i,i+interval '1 minute','[)')),10))
   INTO allocated FROM generate_series('2026-10-03 17:00+04'::timestamptz,'2026-10-03 17:02+04',interval '1 minute') i;
 IF allocated IS DISTINCT FROM 0.50 THEN RAISE EXCEPTION 'Partial claims minted or lost cents: %',allocated; END IF;
END;
$$;
SET LOCAL ROLE authenticated;

DO $$
DECLARE a bigint; b bigint; replacement bigint; att bigint; draft jsonb; review_token jsonb; from_cutoff timestamptz; queue jsonb;
 result jsonb; candidate bigint; alias_hr bigint; alias_ws bigint; alias_fleet bigint; receipt bigint; op uuid:=gen_random_uuid();
 part tstzmultirange:=tstzmultirange(tstzrange('2026-10-03 17:00+04','2026-10-03 17:15+04','[)'));
BEGIN
 PERFORM pg_temp.t06_actor(1);
 a:=pg_temp.t08_work(991001,991001,'2026-10-03 08:00+04','2026-10-03 12:00+04');
 b:=(public.t08_fleet_time(op,991001,'record','{"assignment":991001,"from":"2026-10-03 13:00+04","until":"2026-10-03 18:00+04","reason":"Fleet actual"}')->>'id')::bigint;
 IF (public.t08_fleet_time(op,991001,'record','{"assignment":991001,"from":"2026-10-03 13:00+04","until":"2026-10-03 18:00+04","reason":"Fleet actual"}')->>'replayed')::boolean IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Fleet intake retry duplicated the work'; END IF;
 BEGIN
   PERFORM pg_temp.t08_work(991001,991001,'2026-10-03 17:00+04','2026-10-03 18:00+04');
   RAISE EXCEPTION 'Overlapping work was duplicated';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 replacement:=pg_temp.t08_work(991001,991002,'2026-10-17 08:00+04','2026-10-17 18:00+04');
 IF (SELECT w->>'employee' FROM jsonb_array_elements(public.t08_fleet_order_time(991001)->'work') w WHERE (w->>'id')::bigint=replacement)
   IS DISTINCT FROM 'Synthetic T06 Custodian B' THEN RAISE EXCEPTION 'Replacement worker attribution failed'; END IF;
 IF public.t08_payroll_queue(920001,'2026-10-03')<>'[]'::jsonb THEN RAISE EXCEPTION 'Operations received payroll facts'; END IF;
 PERFORM pg_temp.t06_actor(6);
 IF public.t08_fleet_order_time(991001) IS NOT NULL THEN RAISE EXCEPTION 'Sibling branch received Fleet time'; END IF;
 PERFORM pg_temp.t06_actor(8);
 IF public.t08_fleet_order_time(991001) IS NOT NULL OR public.t08_attendance_drafts('2026-10-03')<>'[]'::jsonb
 THEN RAISE EXCEPTION 'Reserved administrator inherited business scopes'; END IF;
 PERFORM pg_temp.t06_actor(4);
 draft:=public.t08_attendance_drafts('2026-10-03')->0;
 IF jsonb_array_length(draft->'works')<>2 OR draft->>'attendance' IS NOT NULL THEN RAISE EXCEPTION 'Draft did not preserve the split source'; END IF;
 result:=public.t08_review_attendance(gen_random_uuid(),980001,'2026-10-03','create-draft',draft->>'token','Review split draft');
 att:=(result->>'id')::bigint;
 IF (SELECT worked_minutes FROM public.employee_attendance_daily_summary WHERE id=att)<>540 THEN RAISE EXCEPTION 'Wrong F12 draft minutes'; END IF;
 PERFORM pg_temp.t06_actor(5);
 PERFORM public.f11_mutate_time_child('attendance-summary',980001,att,1,gen_random_uuid(),'approve','{}');
 PERFORM pg_temp.t06_actor(2);
 IF pg_temp.t08_queue('2026-10-03',b)->>'status'<>'awaiting-operations'
   OR public.t08_fleet_payroll_candidates(920001,'2026-10-31 23:59+04')<>'[]'::jsonb
 THEN RAISE EXCEPTION 'Unsigned cut-off incorrectly created overtime'; END IF;
 PERFORM pg_temp.t06_actor(7);
 review_token:=public.t08_fleet_order_time(991001);
 PERFORM pg_temp.t06_actor(1);
 PERFORM pg_temp.t07_command(991001,'record-sheet',jsonb_build_object('assignment',991001,'evidence',pg_temp.t07_packet(990203,'T08-SHEET'),
  'lines','[{"from":"2026-10-03 08:00+04","until":"2026-10-03 12:00+04","state":"signed"},
   {"from":"2026-10-03 13:00+04","until":"2026-10-03 17:00+04","state":"signed"},
   {"from":"2026-10-03 17:15+04","until":"2026-10-03 17:30+04","state":"signed"},
   {"from":"2026-10-03 17:30+04","until":"2026-10-03 18:00+04","state":"disputed","reason":"Customer discrepancy"}]'::jsonb));
 PERFORM pg_temp.t07_command(991001,'record-sheet',jsonb_build_object('assignment',991001,'evidence',pg_temp.t07_packet(990216,'T08-INDEPENDENT'),
  'lines','[{"from":"2026-10-03 17:00+04","until":"2026-10-03 17:15+04","state":"signed"}]'::jsonb));
 PERFORM pg_temp.t06_actor(7);
 BEGIN
   PERFORM pg_temp.t08_call(991001,'verify',jsonb_build_object('work',b,'source_digest',review_token#>>'{work,1,source_digest}'));
   RAISE EXCEPTION 'A stale signed-sheet opening was accepted';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t08_review(991001,a);
 PERFORM pg_temp.t08_review(991001,b);
 PERFORM pg_temp.t06_actor(2);
 queue:=pg_temp.t08_queue('2026-10-03',b);
 IF queue->>'status' IS DISTINCT FROM 'ready' OR (queue->>'minutes')::numeric IS DISTINCT FROM 30 OR queue->>'amount' IS DISTINCT FROM '20.00'
   OR pg_temp.t08_queue('2026-10-03',a)->>'status' IS DISTINCT FROM 'no-eligible-time'
 THEN RAISE EXCEPTION 'Original rule, regular minutes, partial signed time or amount failed: %',queue; END IF;
 from_cutoff:=clock_timestamp();
 candidate:=(public.t08_payroll_review(gen_random_uuid(),b,queue->>'digest','Accounts accepted eligible portion')->>'id')::bigint;
 IF public.t08_fleet_payroll_candidates(920001,from_cutoff)<>'[]'::jsonb
 THEN RAISE EXCEPTION 'Late time was available before Accounts acceptance'; END IF;
 RESET ROLE;
 SELECT id INTO alias_hr FROM erp_private.t08_payable_aliases WHERE kind='attendance' AND work_id=b;
 SELECT id INTO alias_fleet FROM erp_private.t08_payable_aliases WHERE kind='fleet' AND work_id=b;
 alias_ws:=erp_private.t08_register_workshop_alias(b,991995,980001,tstzmultirange(tstzrange('2026-10-03 17:00+04','2026-10-03 17:30+04','[)')),repeat('a',64));
 op:=gen_random_uuid();
 receipt:=erp_private.t08_claim_work(candidate,alias_hr,op,part);
 IF erp_private.t08_claim_work(candidate,alias_hr,op,part)<>receipt THEN RAISE EXCEPTION 'Same claim did not replay'; END IF;
 BEGIN
   PERFORM erp_private.t08_claim_work(candidate,alias_ws,gen_random_uuid(),part);
   RAISE EXCEPTION 'Same work paid through another source alias';
 EXCEPTION WHEN exclusion_violation THEN NULL; END;
 SET LOCAL ROLE authenticated;
 PERFORM set_config('erp.t08_work',b::text,true);
 PERFORM set_config('erp.t08_candidate',candidate::text,true);
END;
$$;
DO $$
DECLARE row jsonb:=public.t08_fleet_payroll_candidates(920001,statement_timestamp())->0;
BEGIN
 IF row->>'date' IS DISTINCT FROM '2026-10-03' OR (row->>'minutes')::numeric IS DISTINCT FROM 15
    OR row->>'amount' IS DISTINCT FROM '10.00'
 THEN RAISE EXCEPTION 'Original date, late cutoff, or unclaimed balance failed: %',row; END IF;
END;
$$;

DO $$
DECLARE host bigint; work bigint; draft jsonb; initial_summ jsonb; att bigint; queue jsonb; id_result bigint; linked_token text;
BEGIN
 PERFORM pg_temp.t06_actor(1);
 host:=(pg_temp.t08_call(991002,'propose-host','{"assignment":991003,"company":920002,"branch":920021,"site":980002,
   "from":"2026-11-02 08:00+04","until":"2026-11-02 18:00+04"}')->>'id')::bigint;
 BEGIN
   PERFORM pg_temp.t08_call(991002,'accept-host',jsonb_build_object('host',host));
   RAISE EXCEPTION 'Origin accepted the receiving branch';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t06_actor(9);
 IF public.t08_fleet_order_time(991002)->'hosts'->0->>'can_accept' IS DISTINCT FROM 'true'
    OR public.t08_receiving_orders()->0->>'id' IS DISTINCT FROM '991002'
 THEN RAISE EXCEPTION 'Receiver could not find and open the assigned request'; END IF;
 PERFORM pg_temp.t08_call(991002,'accept-host',jsonb_build_object('host',host));
 work:=pg_temp.t08_work(991002,991003,'2026-11-02 08:00+04','2026-11-02 18:00+04',host);
 PERFORM pg_temp.t06_actor(7);
 BEGIN
   PERFORM pg_temp.t08_review(991002,work);
   RAISE EXCEPTION 'Origin supervisor verified work held by the receiver';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t06_actor(2);
 IF pg_temp.t08_queue('2026-11-02',work)->>'status'<>'awaiting-operations'
 THEN RAISE EXCEPTION 'Internal work was released without supervisor review'; END IF;
 PERFORM pg_temp.t06_actor(3);
 PERFORM pg_temp.t08_review(991002,work);
 IF public.t08_payroll_queue(920001,'2026-11-02')<>'[]'::jsonb OR public.t08_payroll_queue(920002,'2026-11-02')<>'[]'::jsonb
 THEN RAISE EXCEPTION 'Receiving supervisor received employer wage data'; END IF;
 PERFORM pg_temp.t06_actor(4);
 draft:=public.t08_attendance_drafts('2026-11-02')->0;
 IF draft->>'can_create'<>'false' OR draft->'works'->0->>'site'<>'Synthetic custody yard B'
 THEN RAISE EXCEPTION 'Receiving site facts were not carried to HR review'; END IF;
 initial_summ:=public.f12_save_attendance(jsonb_build_object('operation',gen_random_uuid(),'employeeId',980002,'date','2026-11-02',
    'id',NULL,'revision',NULL,'fingerprint',erp_private.f12_attendance_context(980002,'2026-11-02')->>'fingerprint','reason','Known HR actual',
    'values','{"attendance_type":"site","work_site_id":980001,"intervals":[{"start":"2026-11-02T08:00:00+04:00",
    "end":"2026-11-02T16:00:00+04:00","breaks":[]}]}'::jsonb));
 att:=(initial_summ->>'id')::bigint;
 BEGIN
   PERFORM public.t08_review_attendance(gen_random_uuid(),980002,'2026-11-02','create-draft',draft->>'token','Original stale opening');
   RAISE EXCEPTION 'A stale draft overwrote newly entered attendance';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 draft:=public.t08_attendance_drafts('2026-11-02')->0;
 PERFORM public.t08_review_attendance(gen_random_uuid(),980002,'2026-11-02','link-existing',draft->>'token','Accept intersection, retain difference');
 linked_token:=public.t08_attendance_drafts('2026-11-02')->0->>'token';
 BEGIN
   PERFORM public.t08_review_attendance(gen_random_uuid(),980002,'2026-11-02','link-existing',draft->>'token','Same old review opening');
   RAISE EXCEPTION 'Concurrent old attendance opening could still replace the first decision';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM public.t08_review_attendance(gen_random_uuid(),980002,'2026-11-02','link-existing',linked_token,'Review identical facts');
 IF public.t08_attendance_drafts('2026-11-02')->0->>'token' IS DISTINCT FROM linked_token
 THEN RAISE EXCEPTION 'An identical decision manufactured a new evidence version'; END IF;
 IF (SELECT worked_minutes FROM public.employee_attendance_daily_summary WHERE id=att)<>480
    OR (public.t08_attendance_drafts('2026-11-02')#>>'{0,works,0,linked_minutes}')::numeric<>480
 THEN RAISE EXCEPTION 'Existing hours or accepted intersection changed'; END IF;
 PERFORM pg_temp.t06_actor(5);
 PERFORM public.f11_mutate_time_child('attendance-summary',980002,att,1,gen_random_uuid(),'approve','{}');
 PERFORM pg_temp.t06_actor(2);
 queue:=pg_temp.t08_queue('2026-11-02',work);
 IF queue->>'status' IS DISTINCT FROM 'ready' OR (queue->>'minutes')::numeric IS DISTINCT FROM 480 OR queue->>'amount' IS DISTINCT FROM '360.00'
 THEN RAISE EXCEPTION 'Internal approved holiday, approved components, or receiving attendance mismatch: %',queue; END IF;
 id_result:=(public.t08_payroll_review(gen_random_uuid(),work,queue->>'digest','Employer approved verified holiday portion')->>'id')::bigint;
 PERFORM set_config('erp.t08_cross_candidate',id_result::text,true);
END;
$$;

DO $$
DECLARE work_a bigint; work_b bigint; rows jsonb; att bigint; second_att bigint; draft jsonb; queue jsonb;
BEGIN
 PERFORM pg_temp.t06_actor(1);
 rows:=pg_temp.t08_call(991003,'record','{"assignment":991004,"from":"2026-11-04 22:00+04","until":"2026-11-05 05:00+04"}')->'work_ids';
 work_a:=(rows->>0)::bigint; work_b:=(rows->>1)::bigint;
 IF jsonb_array_length(rows)<>2 THEN RAISE EXCEPTION 'Overnight work was not split by Dubai work date'; END IF;
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t08_review(991003,work_a);
 PERFORM pg_temp.t08_review(991003,work_b);
 PERFORM pg_temp.t06_actor(4);
 att:=(public.f12_save_attendance(jsonb_build_object('operation',gen_random_uuid(),'employeeId',980001,'date','2026-11-04',
    'id',NULL,'revision',NULL,'fingerprint',erp_private.f12_attendance_context(980001,'2026-11-04')->>'fingerprint','reason','One native overnight record',
    'values','{"attendance_type":"site","work_site_id":980001,"intervals":[{"start":"2026-11-04T22:00:00+04:00",
    "end":"2026-11-05T02:00:00+04:00","breaks":[]}]}'::jsonb))->>'id')::bigint;
 draft:=public.t08_attendance_drafts('2026-11-04')->0;
 PERFORM public.t08_review_attendance(gen_random_uuid(),980001,'2026-11-04','link-existing',draft->>'token','Link first side of midnight');
 draft:=public.t08_attendance_drafts('2026-11-05')->0;
 IF (draft->>'attendance')::bigint<>att OR draft->>'can_create'<>'false'
 THEN RAISE EXCEPTION 'Existing overnight attendance was not detected'; END IF;
 BEGIN
   PERFORM public.t08_review_attendance(gen_random_uuid(),980001,'2026-11-05','create-draft',draft->>'token','Cannot post duplicate after midnight');
   RAISE EXCEPTION 'Existing overnight work duplicated into another attendance record';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 second_att:=(public.f12_save_attendance(jsonb_build_object('operation',gen_random_uuid(),'employeeId',980001,'date','2026-11-05',
    'id',NULL,'revision',NULL,'fingerprint',erp_private.f12_attendance_context(980001,'2026-11-05')->>'fingerprint','reason','Later work on same day',
    'values','{"attendance_type":"site","work_site_id":980001,"intervals":[{"start":"2026-11-05T02:00:00+04:00",
    "end":"2026-11-05T05:00:00+04:00","breaks":[]}]}'::jsonb))->>'id')::bigint;
 draft:=public.t08_attendance_drafts('2026-11-05')->0;
 PERFORM public.t08_review_attendance(gen_random_uuid(),980001,'2026-11-05','link-existing',draft->>'token','Link second side of midnight');
 PERFORM pg_temp.t06_actor(5);
 PERFORM public.f11_mutate_time_child('attendance-summary',980001,att,1,gen_random_uuid(),'approve','{}');
 PERFORM public.f11_mutate_time_child('attendance-summary',980001,second_att,1,gen_random_uuid(),'approve','{}');
 PERFORM pg_temp.t06_actor(2);
 queue:=pg_temp.t08_queue('2026-11-05',work_b);
 IF queue->>'status' IS DISTINCT FROM 'ready' OR (queue->>'minutes')::numeric IS DISTINCT FROM 240 OR queue->>'amount' IS DISTINCT FROM '120.00'
    OR pg_temp.t08_queue('2026-11-04',work_a)->>'status' IS DISTINCT FROM 'no-eligible-time'
 THEN RAISE EXCEPTION 'Overnight threshold or original work date was miscalculated: %',queue; END IF;
END;
$$;

DO $$
DECLARE work bigint:=current_setting('erp.t08_work')::bigint; old_view jsonb; evidence_row jsonb; queue jsonb;
        old_candidate bigint:=current_setting('erp.t08_candidate')::bigint; review_id bigint;
BEGIN
 PERFORM pg_temp.t06_actor(7);
 SELECT w INTO old_view FROM jsonb_array_elements(public.t08_fleet_order_time(991001)->'work') w WHERE (w->>'id')::bigint=work;
 PERFORM pg_temp.t06_actor(1);
 PERFORM public.f07_change_document_version(990203,990212,'promote',990203);
 FOR evidence_row IN SELECT value FROM jsonb_array_elements(public.t07_fleet_operation_detail(991001)->'usage')
   WHERE value->>'evidence_current'='false' LOOP
   PERFORM pg_temp.t07_command(991001,'resolve-sheet',jsonb_build_object('assignment',991001,'usage',evidence_row->'id',
      'evidence','{"document":990203,"version":990212,"file":990212,"reference":"T08-SHEET"}'::jsonb));
 END LOOP;
 PERFORM pg_temp.t06_actor(7);
 BEGIN
   PERFORM pg_temp.t08_call(991001,'verify',jsonb_build_object('work',work,'source_digest',old_view->'source_digest','review',old_view->'review'));
   RAISE EXCEPTION 'Stale evidence review succeeded after simultaneous source revision';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(2);
 IF (pg_temp.t08_queue('2026-10-03',work)->>'minutes')::numeric IS DISTINCT FROM 15
 THEN RAISE EXCEPTION 'Revision held a separately verified portion or kept an obsolete proof'; END IF;
 PERFORM pg_temp.t06_actor(7);
 review_id:=(pg_temp.t08_review(991001,work)->>'id')::bigint;
 PERFORM pg_temp.t06_actor(2);
 queue:=pg_temp.t08_queue('2026-10-03',work);
 IF (queue->>'minutes')::numeric IS DISTINCT FROM 60 OR queue->>'amount' IS DISTINCT FROM '40.00'
 THEN RAISE EXCEPTION 'Corrected signed time did not retain the dated valuation: %',queue; END IF;
 IF (public.t08_payroll_review(gen_random_uuid(),work,queue->>'digest','Accept corrected evidence')->>'id')::bigint=old_candidate
 THEN RAISE EXCEPTION 'Corrected valuation overwrote previous history'; END IF;
 PERFORM set_config('erp.t08_new_review',review_id::text,true);
END;
$$;

-- Retain dated employment facts after a verified employee transfer.
RESET ROLE;
WITH change_row AS (
 INSERT INTO erp_private.t03_employment_changes(employee_id,source_revision,kind,effective_on,source_company,source_branch,
   destination_company,destination_branch,reason,digest,proposed_by,applied_by,applied_at)
 SELECT id,workspace_revision,'transfer','2026-11-06',920001,920011,920002,920021,'Synthetic later transfer',repeat('b',64),
   '98000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000007',clock_timestamp() FROM public.employees WHERE id=980001
 RETURNING *
), ended AS (
 UPDATE erp_private.t03_employment_periods p SET work_period=daterange(lower(p.work_period),c.effective_on,'[)'),closed_by_change_id=c.id
 FROM change_row c WHERE p.employee_id=c.employee_id RETURNING p.*
)
INSERT INTO erp_private.t03_employment_periods(employee_id,company_id,branch_id,employee_category_id,work_period,contractual_start,actual_start,source_revision,change_id)
SELECT c.employee_id,c.destination_company,c.destination_branch,p.employee_category_id,daterange(c.effective_on,NULL,'[)'),p.contractual_start,p.actual_start,c.source_revision,c.id
 FROM change_row c JOIN ended p ON p.employee_id=c.employee_id;
SET LOCAL session_replication_role=replica;
UPDATE public.employees SET owner_company_id=920002,branch_id=920021 WHERE id=980001;
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;
DO $$
DECLARE historical bigint; draft jsonb;
BEGIN
 PERFORM pg_temp.t06_actor(1);
 historical:=pg_temp.t08_work(991001,991001,'2026-10-03 12:00+04','2026-10-03 12:30+04');
 PERFORM pg_temp.t06_actor(4);
 draft:=public.t08_attendance_drafts('2026-10-03')->0;
 IF draft->>'attendance' IS NULL OR draft->>'eligible' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'Prior employer could not review the existing day'; END IF;
 PERFORM public.t08_review_attendance(gen_random_uuid(),980001,'2026-10-03','link-existing',draft->>'token','Compare late original employer work');
 IF NOT public.t08_attendance_drafts('2026-10-03')->0->'works' @>
      jsonb_build_array(jsonb_build_object('id',historical,'linked_minutes',0,'reviewed',true))
 THEN RAISE EXCEPTION 'Late prior-employer work did not reconcile to the original attendance'; END IF;
END;
$$;
SELECT pg_temp.t06_actor(2) AS actor \gset
DO $$
DECLARE old_work bigint:=current_setting('erp.t08_work')::bigint; row jsonb; external_row jsonb;
BEGIN
 SELECT w INTO row FROM jsonb_array_elements(public.t08_fleet_payroll_candidates(920001,statement_timestamp())) w
   WHERE (w->>'work')::bigint=old_work;
 IF (row->>'minutes')::numeric IS DISTINCT FROM 45 OR row->>'amount' IS DISTINCT FROM '30.00'
   OR row->>'employer' IS DISTINCT FROM '920001' OR row->>'date' IS DISTINCT FROM '2026-10-03'
 THEN RAISE EXCEPTION 'Revised work double paid or moved to the new employer: %',row; END IF;
 SELECT w INTO external_row FROM jsonb_array_elements(public.t08_fleet_payroll_candidates(920001,statement_timestamp())) w
   WHERE (w->>'id')::bigint=current_setting('erp.t08_cross_candidate')::bigint;
 IF external_row->>'host' IS DISTINCT FROM '920002' OR external_row->>'employer' IS DISTINCT FROM '920001'
 THEN RAISE EXCEPTION 'Receiving activity did not route to the original employer'; END IF;
 IF public.t08_fleet_payroll_candidates(920002,statement_timestamp())<>'[]'::jsonb
 THEN RAISE EXCEPTION 'New or receiving company obtained other employer wages'; END IF;
END;
$$;
SELECT 'PASS: T08 split work, signed reconciliation and revisions, F12 attendance, receiving scope, dated valuation, cutoff and underlying claim exclusion';
ROLLBACK;
