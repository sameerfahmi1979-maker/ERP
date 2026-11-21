-- Run after the shared, transaction-wrapped T07 synthetic fixture.
DO $$ BEGIN
 IF to_regprocedure('public.t10_workshop_command(uuid,bigint,text,jsonb)') IS NULL
 OR to_regprocedure('public.t10_maintenance_command(uuid,bigint,text,jsonb)') IS NULL
 OR to_regprocedure('public.t10_workshop_workspace(bigint,bigint)') IS NULL
 THEN RAISE EXCEPTION 'T10 Workshop intake, job cycle and maintenance entry points are missing'; END IF;
END $$;

INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t06_custodian',ARRAY['fleet.inspections.report','fleet.maintenance.manage']),
 ('t06_workshop',ARRAY['workshop.assess','workshop.jobs.manage','workshop.jobs.release','dms.documents.view','dms.documents.preview']),
 ('t06_hse',ARRAY['workshop.jobs.release','dms.documents.view','dms.documents.preview']),
 ('t06_keeper',ARRAY['fleet.inspections.report','workshop.assess','hr.workshop.referrals.view']),
 ('t06_policy',ARRAY['hr.workshop.referrals.view'])
) g(role,codes) JOIN public.roles r ON r.role_code=g.role JOIN public.permissions p ON p.permission_code=ANY(g.codes);
INSERT INTO public.dms_document_types(id,type_code,name_en,category_id) OVERRIDING SYSTEM VALUE VALUES
 (997001,'FLEET_WORKSHOP_RETURN','Workshop return original',990001) ON CONFLICT(type_code) DO NOTHING;
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,
 confidentiality_level,status,current_version_id)
 OVERRIDING SYSTEM VALUE SELECT ids.id,'T10-QC-RETURN-'||ids.id,'Synthetic returned asset evidence',t.id,990001,920001,920011,
 'internal','active',NULL FROM public.dms_document_types t CROSS JOIN (VALUES (997011),(997012)) ids(id) WHERE t.type_code='FLEET_WORKSHOP_RETURN';
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE VALUES(997011,997011,1,true),(997012,997012,1,true);
UPDATE public.dms_documents SET current_version_id=id WHERE id IN(997011,997012);
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
 OVERRIDING SYSTEM VALUE VALUES(997011,997011,997011,'original','dms-documents','test/t10-return.pdf','return.pdf','application/pdf',100,repeat('a',64),'verified'),
 (997012,997012,997012,'original','dms-documents','test/t10-service.pdf','return.pdf','application/pdf',100,repeat('a',64),'verified');

CREATE FUNCTION pg_temp.t10_command(p_asset bigint,p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.t10_workshop_command(gen_random_uuid(),p_asset,p_action,p_data||'{"reason":"Synthetic Workshop action"}'::jsonb);
$$;
CREATE FUNCTION pg_temp.t10_maintenance(p_asset bigint,p_action text,p_data jsonb) RETURNS jsonb LANGUAGE sql AS $$
 SELECT public.t10_maintenance_command(gen_random_uuid(),p_asset,p_action,p_data||'{"reason":"Synthetic clock source"}'::jsonb);
$$;
CREATE FUNCTION pg_temp.t10_case(p_asset bigint,p_kind text) RETURNS jsonb LANGUAGE sql AS $$
 SELECT f FROM jsonb_array_elements(public.t10_workshop_workspace(p_asset)->'cases') f
 WHERE f->>'kind'=p_kind ORDER BY (f->>'id')::bigint DESC LIMIT 1;
$$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(1) AS claims \gset
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id)
 SELECT id,'fleet_asset',asset FROM t07_documents;
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES(997011,'fleet_asset',980102),(997012,'fleet_asset',980102);

DO $$
DECLARE trip bigint; assignment bigint; checkin bigint; case_id bigint; first_hold bigint; hse bigint; hazard bigint;
 response jsonb; attempt jsonb; task jsonb; job bigint; cycle2 bigint; revision integer; body jsonb; after_qc jsonb;
 report_id bigint; employee_scope integer; blockers jsonb; licence_policy bigint;
 request jsonb:='{"company":920001,"branch":920011,"site":980001,"kind":"trip","reference":"T10-PRETRIP","subject":"Synthetic inspection"}';
BEGIN
 trip:=(pg_temp.t07_command(NULL,'create',request)->>'id')::bigint;
 PERFORM pg_temp.t07_command(trip,'plan-leg','{"sequence":1,"origin":980001,"destination":990001,"load":"empty"}');
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t07_command(trip,'authorize','{"authorization":"T10-DO-1"}');
 PERFORM pg_temp.t06_actor(1);
 assignment:=(pg_temp.t07_command(trip,'assign',pg_temp.t07_move(980101,980001,-50,90))->>'event_id')::bigint;
 PERFORM pg_temp.t07_command(trip,'inspect',jsonb_build_object('assignment',assignment,'at',pg_temp.t06_when(-55),'passed',false,
  'evidence',pg_temp.t07_packet(990102,'T10-SIGNED-INSPECTION')));
 task:=pg_temp.t10_case(980101,'dispatch-inspection');
 IF task->>'proof' IS DISTINCT FROM '990102' OR task->>'blocking' IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Failed signed dispatch inspection did not open an exact Workshop case and hold';
 END IF;
 PERFORM pg_temp.t07_command(trip,'inspect',jsonb_build_object('assignment',assignment,'at',pg_temp.t06_when(-54),'passed',true,
  'evidence',pg_temp.t07_packet(990106,'T10-RECHECK')));
 IF pg_temp.t10_case(980101,'dispatch-inspection')->>'blocking' IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Passing recheck improperly released the independent Workshop hold'; END IF;

 response:=public.t06_fleet_command(pg_temp.t06_op(700),980102,'checkout',pg_temp.t06_trip(980002,980001,pg_temp.t06_when(-45),pg_temp.t06_when(60)));
 checkin:=(response->>'id')::bigint;
 body:=jsonb_build_object('commitment',checkin,'revision',(response->>'revision')::integer,'at',pg_temp.t06_when(-32),
   'reason','Signed dent and meter at return','snapshot','{"condition":"damaged","meter":21,"meter_unit":"km","document":990202,"version":990202,"file":990202}'::jsonb);
 response:=public.t06_fleet_command(pg_temp.t06_op(701),980102,'return',body);
 attempt:=public.t06_fleet_command(pg_temp.t06_op(701),980102,'return',body);
 IF attempt IS DISTINCT FROM response||'{"replayed":true}'::jsonb THEN RAISE EXCEPTION 'Custody retry changed the receipt'; END IF;
 task:=pg_temp.t10_case(980102,'custody-return');
 case_id:=(task->>'id')::bigint;
 IF case_id IS NULL OR task->>'proof' IS DISTINCT FROM '990202' OR task->>'blocking' IS DISTINCT FROM 'true'
  OR jsonb_array_length(public.t10_workshop_workspace(980102)->'cases')<>1
 THEN RAISE EXCEPTION 'Signed return must immediately produce one exact assessment and hold'; END IF;
 blockers:=public.t06_fleet_availability(980102,980002,980001,pg_temp.t06_when(1),pg_temp.t06_when(20))->'blockers';
 IF NOT (blockers?'workshop-hold') THEN RAISE EXCEPTION 'Damaged return is still dispatchable'; END IF;
 PERFORM pg_temp.t06_actor(6);
 IF public.t10_workshop_workspace(980102) IS NOT NULL THEN RAISE EXCEPTION 'Sibling branch can read Workshop detail'; END IF;
 BEGIN PERFORM pg_temp.t10_command(980102,'assess',jsonb_build_object('assessment',case_id,'outcome','usable-as-is'));
  RAISE EXCEPTION 'Sibling branch can assess'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t06_actor(8);
 IF public.t10_workshop_workspace(980102) IS NOT NULL THEN RAISE EXCEPTION 'Global admin inherited the held business grants'; END IF;

 PERFORM pg_temp.t06_actor(5);
 hse:=(public.t06_fleet_command(pg_temp.t06_op(702),980102,'place-hold','{"kind":"hse","reason":"Independent HSE clearance"}')->>'id')::bigint;
 RESET ROLE;
 SELECT first_hold_id INTO first_hold FROM erp_private.t10_assessments WHERE id=case_id;
 UPDATE erp_private.fleet_availability_policies p SET licence_type_id=(SELECT id FROM public.hr_identity_document_types WHERE code='DRIVING_LICENSE')
 WHERE p.company_id=920001 AND p.category='light_vehicle' AND p.valid_during @> (now() AT TIME ZONE 'Asia/Dubai')::date;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(4);
 BEGIN PERFORM public.t06_fleet_command(pg_temp.t06_op(703),980102,'release-hold',jsonb_build_object('hold',first_hold,'reason','Generic release'));
  RAISE EXCEPTION 'Generic custody release bypasses pending assessment'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 response:=pg_temp.t10_command(980102,'assess',jsonb_build_object('assessment',case_id,'outcome','usable-as-is',
     'responsibility','Signed custody damage warrants HR review'));
 IF response->>'state' IS DISTINCT FROM 'usable-as-is' OR pg_temp.t10_case(980102,'custody-return')->>'blocking' IS DISTINCT FROM 'false'
  OR public.t10_hr_workshop_referrals()<>'[]'::jsonb
 THEN RAISE EXCEPTION 'As-is release or confidential HR referral scope failed'; END IF;
 PERFORM pg_temp.t06_actor(7);
 IF public.t10_hr_workshop_referrals()->0->>'employee_id' IS DISTINCT FROM '980002'
  OR public.t10_hr_workshop_referrals()->0->>'proof' IS NULL
 THEN RAISE EXCEPTION 'Responsible evidence did not route to exact employing HR scope'; END IF;
 PERFORM pg_temp.t06_actor(1);
 blockers:=public.t06_fleet_availability(980102,980002,980001,pg_temp.t06_when(1),pg_temp.t06_when(20))->'blockers';
 IF NOT(blockers?'hse-hold' AND blockers?'licence-required') OR blockers?'workshop-hold' THEN RAISE EXCEPTION 'As-is release changed independent HSE restrictions'; END IF;

 body:=jsonb_build_object('kind','reported-failure','reference','T10-FAILURE-1','occurred',pg_temp.t06_when(-30),'reason','Synthetic hydraulic leak');
 response:=public.t10_workshop_command(pg_temp.t06_op(704),980102,'report',body);
 IF public.t10_workshop_command(pg_temp.t06_op(704),980102,'report',body) IS DISTINCT FROM response||'{"replayed":true}'::jsonb
 THEN RAISE EXCEPTION 'Exact failure-report retry lost its receipt'; END IF;
 report_id:=(response->>'assessment')::bigint;
 PERFORM pg_temp.t06_actor(4);
 BEGIN PERFORM pg_temp.t10_command(980102,'assess',jsonb_build_object('assessment',report_id,'outcome','repair','responsibility','Unsupported HR suspicion'));
  RAISE EXCEPTION 'HR referred without a verified commitment'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 response:=pg_temp.t10_command(980102,'assess',jsonb_build_object('assessment',report_id,'outcome','repair'));
 job:=(response->>'job')::bigint;
 BEGIN PERFORM pg_temp.t10_command(980102,'assess',jsonb_build_object('assessment',report_id,'outcome','repair'));
  RAISE EXCEPTION 'Second assessment created another job'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;

 body:=jsonb_build_object('assessment',report_id,'job',job,'revision',1,'worker',980002,
  'starts',pg_temp.t06_when(-27),'ends',pg_temp.t06_when(-12),'estimate',125.50);
 PERFORM pg_temp.t10_command(980102,'plan',body);
 PERFORM pg_temp.t10_command(980102,'start',jsonb_build_object('assessment',report_id,'job',job,'revision',2,'occurred',pg_temp.t06_when(-26)));
 PERFORM pg_temp.t10_command(980102,'submit-qc',jsonb_build_object('assessment',report_id,'job',job,'revision',3,
  'occurred',pg_temp.t06_when(-13),'actual_work','Replaced synthetic seal','cost',107.25,'warranty','SYN-WAR','warranty_until','2028-11-19'));
 BEGIN PERFORM pg_temp.t10_command(980102,'return-to-work',jsonb_build_object('assessment',report_id,'job',job,'revision',4));
  RAISE EXCEPTION 'Technician passed the independent QC actor guard'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(1);
 IF pg_temp.t10_case(980102,'reported-failure')->'jobs'->0->>'cost' IS NOT NULL THEN
  RAISE EXCEPTION 'Operations can see actual repair cost'; END IF;
 PERFORM pg_temp.t06_actor(5);
 PERFORM pg_temp.t10_command(980102,'return-to-work',jsonb_build_object('assessment',report_id,'job',job,'revision',4));
 PERFORM pg_temp.t06_actor(4);
 PERFORM pg_temp.t10_command(980102,'submit-qc',jsonb_build_object('assessment',report_id,'job',job,'revision',5,
  'occurred',pg_temp.t06_when(-9),'actual_work','Tested seal under operating load','cost',110.25,'warranty','SYN-WAR','warranty_until','2028-11-19'));
 PERFORM pg_temp.t06_actor(5);
 body:=jsonb_build_object('assessment',report_id,'job',job,'revision',6,'occurred',pg_temp.t06_when(-6),
  'return_reference','WO-'||report_id||'/1','evidence','{"document":997011,"version":997011,"file":997011}'::jsonb);
 BEGIN PERFORM pg_temp.t10_command(980102,'release',body-'evidence');
  RAISE EXCEPTION 'QC released without returned-equipment evidence'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t10_command(980102,'release',body);
 after_qc:=pg_temp.t10_case(980102,'reported-failure')->'jobs'->0;
 IF after_qc->>'state' IS DISTINCT FROM 'closed' OR after_qc->>'proof' IS DISTINCT FROM '997011'
  OR after_qc->>'cost' IS DISTINCT FROM '110.25' OR after_qc->>'held' IS DISTINCT FROM 'false' THEN
  RAISE EXCEPTION 'QC failed to close the job and retain exact cost and returned original: %',after_qc; END IF;
 PERFORM pg_temp.t06_actor(1);
 blockers:=public.t06_fleet_availability(980102,980002,980001,pg_temp.t06_when(1),pg_temp.t06_when(20))->'blockers';
 IF NOT(blockers?'hse-hold') OR NOT(blockers?'licence-required') OR blockers?'workshop-hold' THEN RAISE EXCEPTION 'QC changed the wrong hold'; END IF;
 PERFORM set_config('erp.t10_closed_job',job::text,true);
 RESET ROLE;
 BEGIN UPDATE public.dms_document_files SET integrity_status='pending' WHERE id=997011;
  RAISE EXCEPTION 'Retained Workshop original fingerprint or status could change'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 BEGIN UPDATE public.dms_document_versions SET unlinked_at=now() WHERE id=997011;
  RAISE EXCEPTION 'Retained Workshop original version could be unlinked'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 SET LOCAL ROLE authenticated;
END $$;

SELECT pg_temp.t06_actor(1) AS claims \gset
DO $$
DECLARE clock bigint; ver bigint; result jsonb; clock_status jsonb; payload jsonb; unit text; baseline numeric; measured numeric;
 actual_day date:=(now() AT TIME ZONE 'Asia/Dubai')::date; midnight timestamptz; observed timestamptz:=pg_temp.t06_when(-9); job bigint; service_case bigint; service_job bigint;
BEGIN
 payload:=jsonb_build_object('label','Calendar service','unit','days','baseline_day',actual_day-30,
  'interval',30,'tolerance',1,'notice',3,'max_age',7,'block',true);
 result:=pg_temp.t10_maintenance(980102,'create',payload);
 clock:=(result->>'clock')::bigint; ver:=(result->>'id')::bigint;
 IF jsonb_path_query_first(public.t10_workshop_workspace(980102)->'clocks','$[*] ? (@.unit == "days")')->'current'->>'status'<>'due'
 THEN RAISE EXCEPTION 'Inclusive calendar boundary failed'; END IF;
 midnight:=(actual_day+1)::timestamp AT TIME ZONE 'Asia/Dubai';
 IF NOT ((public.t06_fleet_availability(980102,980002,980001,midnight,midnight+interval '15 minutes')->'blockers')?'maintenance-overdue') THEN
  RAISE EXCEPTION 'Booking after the Dubai calendar boundary escaped maintenance enforcement'; END IF;
 payload:=(payload-ARRAY['label','unit','baseline_day'])||jsonb_build_object('clock',clock,'revision',ver,'interval',29);
 result:=pg_temp.t10_maintenance(980102,'edit',payload); ver:=(result->>'id')::bigint;
 clock_status:=jsonb_path_query_first(public.t10_workshop_workspace(980102)->'clocks','$[*] ? (@.unit == "days")')->'current';
 IF result->>'reminder_active' IS DISTINCT FROM 'false' OR clock_status->>'status' IS DISTINCT FROM 'overdue'
  OR clock_status->>'blocking' IS DISTINCT FROM 'true'
  OR NOT ((public.t06_fleet_availability(980102,980002,980001,pg_temp.t06_when(1),pg_temp.t06_when(20))->'blockers')?'maintenance-overdue')
 THEN RAISE EXCEPTION 'Saving a disabled reminder or applying overdue blocking failed'; END IF;
 PERFORM pg_temp.t06_actor(6);
 BEGIN PERFORM pg_temp.t10_maintenance(980102,'activate-reminder',jsonb_build_object('clock',clock,'revision',ver));
  RAISE EXCEPTION 'Unauthorized reminder activation'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t06_actor(1);
 result:=pg_temp.t10_maintenance(980102,'activate-reminder',jsonb_build_object('clock',clock,'revision',ver));
 IF result->>'reminder_active' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Explicit reminder activation failed'; END IF;
 job:=current_setting('erp.t10_closed_job')::bigint;
 ver:=(result->>'id')::bigint;
 BEGIN PERFORM pg_temp.t10_maintenance(980102,'record-service',jsonb_build_object('clock',clock,'revision',ver,'job',job));
  RAISE EXCEPTION 'Unrelated closed repair reset preventive clock'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 service_case:=(pg_temp.t10_command(980102,'report',jsonb_build_object('kind','planned-service','clock',clock,
  'reference','T10-CALENDAR-SERVICE','occurred',pg_temp.t06_when(-5)))->>'assessment')::bigint;
 result:=pg_temp.t10_maintenance(980102,'edit',payload||jsonb_build_object('revision',ver,'interval',35));
 ver:=(result->>'id')::bigint;
 BEGIN PERFORM pg_temp.t10_command(980102,'report',jsonb_build_object('kind','planned-service','clock',clock,
  'reference','T10-DUPLICATE-SERVICE','occurred',pg_temp.t06_when(-5)));
  RAISE EXCEPTION 'A schedule edit created a second work order on the same baseline'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t06_actor(4);
 service_job:=(pg_temp.t10_command(980102,'assess',jsonb_build_object('assessment',service_case,'outcome','repair'))->>'job')::bigint;
 PERFORM pg_temp.t10_command(980102,'plan',jsonb_build_object('assessment',service_case,'job',service_job,'revision',1,'worker',980002,
  'starts',pg_temp.t06_when(-4),'ends',pg_temp.t06_when(-2),'estimate',0));
 PERFORM pg_temp.t10_command(980102,'start',jsonb_build_object('assessment',service_case,'job',service_job,'revision',2,'occurred',pg_temp.t06_when(-4)));
 PERFORM pg_temp.t10_command(980102,'submit-qc',jsonb_build_object('assessment',service_case,'job',service_job,'revision',3,
  'occurred',pg_temp.t06_when(-3),'actual_work','Performed synthetic service','cost',0));
 PERFORM pg_temp.t06_actor(5);
 BEGIN PERFORM pg_temp.t10_command(980102,'release',jsonb_build_object('assessment',service_case,'job',service_job,'revision',4,
  'occurred',pg_temp.t06_when(-2),'return_reference','WO-'||service_case||'/1',
  'evidence','{"document":997011,"version":997011,"file":997011}'::jsonb));
  RAISE EXCEPTION 'Previous signed original reused for another exact release'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 PERFORM pg_temp.t10_command(980102,'release',jsonb_build_object('assessment',service_case,'job',service_job,'revision',4,
  'occurred',pg_temp.t06_when(-2),'return_reference','WO-'||service_case||'/1',
  'evidence','{"document":997012,"version":997012,"file":997012}'::jsonb));
 PERFORM pg_temp.t06_actor(1);
 result:=pg_temp.t10_maintenance(980102,'record-service',jsonb_build_object('clock',clock,'revision',ver,'job',service_job));
 clock_status:=jsonb_path_query_first(public.t10_workshop_workspace(980102)->'clocks','$[*] ? (@.unit == "days")');
 IF clock_status->'current'->>'status' IS DISTINCT FROM 'current'
  OR clock_status->'history'->0->'previous_service_status'->>'status' IS DISTINCT FROM 'overdue'
  OR clock_status->'history'->0->'previous_service_status'->>'compliance' IS DISTINCT FROM 'within-tolerance' THEN
  RAISE EXCEPTION 'Current status overwrote the compliance snapshot'; END IF;

 FOR unit,baseline,measured IN SELECT * FROM (VALUES ('km',21.000,31.125),('hours',100.000,110.125),
   ('cycles',10.000,20.000),('usage-hours',100.000,110.125)) examples(unit,b,m)
 LOOP
  result:=pg_temp.t10_maintenance(980102,'create',jsonb_build_object('label','Synthetic '||unit,'unit',unit,
   'baseline_day',actual_day-CASE WHEN unit='hours' THEN 10 ELSE 1 END,'baseline_value',baseline,'interval',10,'notice',1,'tolerance',CASE WHEN unit='cycles' THEN 0 ELSE 0.125 END,
   'max_age',3,'block',true));
  clock:=(result->>'clock')::bigint;
  IF unit='hours' THEN
   PERFORM pg_temp.t10_maintenance(980102,'reading',jsonb_build_object('unit',unit,'value',baseline,
    'observed',pg_temp.t06_when(-7200),'reference','Stale-'||unit));
  END IF;
  IF unit<>'km' THEN
   clock_status:=jsonb_path_query_first(public.t10_workshop_workspace(980102)->'clocks','$[*] ? (@.id == $clock)',jsonb_build_object('clock',clock))->'current';
   IF clock_status->>'status' IS DISTINCT FROM 'unavailable' OR
     (unit='hours' AND clock_status->>'unavailable' IS DISTINCT FROM 'reading-stale') THEN
    RAISE EXCEPTION 'Missing or stale % meter treated as zero',unit; END IF;
  END IF;
  PERFORM pg_temp.t10_maintenance(980102,'reading',jsonb_build_object('unit',unit,'value',measured,'observed',observed,'reference','T10-reading-'||unit));
  clock_status:=jsonb_path_query_first(public.t10_workshop_workspace(980102)->'clocks','$[*] ? (@.id == $clock)',jsonb_build_object('clock',clock))->'current';
  IF clock_status->>'status' IS DISTINCT FROM (CASE WHEN unit='cycles' THEN 'due' ELSE 'overdue' END)
   OR clock_status->>'blocking' IS DISTINCT FROM (CASE WHEN unit='cycles' THEN 'false' ELSE 'true' END)
  THEN RAISE EXCEPTION 'Live threshold failed for % with status %',unit,clock_status; END IF;
  BEGIN PERFORM pg_temp.t10_maintenance(980102,'reading',jsonb_build_object('unit',unit,'value',measured+0.0001,
   'observed',pg_temp.t06_when(-8),'reference','Invalid-precision'));
   RAISE EXCEPTION 'Excess decimal precision accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL; END;
  PERFORM pg_temp.t10_maintenance(980102,'reading',jsonb_build_object('unit',unit,'value',NULL,
   'observed',pg_temp.t06_when(-7),'reference','T10-unavailable-'||unit));
  clock_status:=jsonb_path_query_first(public.t10_workshop_workspace(980102)->'clocks','$[*] ? (@.id == $clock)',jsonb_build_object('clock',clock))->'current';
  IF clock_status->>'status' IS DISTINCT FROM 'unavailable'
   OR clock_status->>'blocking' IS DISTINCT FROM (CASE WHEN unit='cycles' THEN 'false' ELSE 'true' END) THEN
   RAISE EXCEPTION 'Unavailable reading incorrectly changed an existing overdue restriction for %',unit; END IF;
  BEGIN PERFORM pg_temp.t10_maintenance(980102,'reading',jsonb_build_object('unit',unit,'value',baseline,
    'observed',pg_temp.t06_when(-6),'reference','Rewind-'||unit));
   RAISE EXCEPTION 'Unavailable entry masked a known earlier % reading',unit; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 END LOOP;
END $$;

SELECT pg_temp.t06_actor(5) AS claims \gset
DO $$
DECLARE assessment jsonb:=pg_temp.t10_case(980102,'reported-failure'); closed jsonb; reopened jsonb; step jsonb;
BEGIN
 closed:=assessment->'jobs'->0;
 step:=jsonb_build_object('assessment',(assessment->>'id')::bigint,'job',(closed->>'id')::bigint,'revision',(closed->>'revision')::integer,
  'reason','Synthetic warranty failure');
 BEGIN
   RESET ROLE;
   INSERT INTO erp_private.fleet_asset_history(asset_id,kind,effective_on,company_id,branch_id,facts,reason,recorded_by)
   VALUES(980102,'operation',(now() AT TIME ZONE 'Asia/Dubai')::date,920002,920021,'{}','Synthetic company transfer',
    public.current_user_profile_id());
   SET LOCAL ROLE authenticated;
   BEGIN PERFORM public.t10_workshop_command(pg_temp.t06_op(705),980102,'reopen',step);
    RAISE EXCEPTION 'Historical branch placed a new hold after operating scope moved'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
   RAISE EXCEPTION USING ERRCODE='Z1010',MESSAGE='Rollback synthetic transfer';
 EXCEPTION WHEN SQLSTATE 'Z1010' THEN NULL; END;
 reopened:=public.t10_workshop_command(pg_temp.t06_op(705),980102,'reopen',step);
 IF public.t10_workshop_command(pg_temp.t06_op(705),980102,'reopen',step) IS DISTINCT FROM reopened||'{"replayed":true}'::jsonb THEN
  RAISE EXCEPTION 'Reopen created duplicate cycle on retry'; END IF;
 assessment:=pg_temp.t10_case(980102,'reported-failure');
 IF assessment->>'blocking' IS DISTINCT FROM 'true' OR assessment->'jobs'->0->>'held' IS DISTINCT FROM 'true' OR assessment->'jobs'->0->>'cycle' IS DISTINCT FROM '2'
  OR assessment->'jobs'->1 IS DISTINCT FROM closed THEN RAISE EXCEPTION 'New cycle altered previous QC, work, cost or evidence'; END IF;
END $$;
RESET ROLE;
SELECT 'PASS: T10 dispatch inspection, signed return, independent holds/HR referral, job cycles, service clocks and reminder preservation';
ROLLBACK;
