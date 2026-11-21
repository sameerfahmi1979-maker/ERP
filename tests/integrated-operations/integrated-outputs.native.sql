\set ON_ERROR_STOP on
-- Run after T07 synthetic setup through its fixture helpers, before its first
-- top-level authenticated command. The surrounding transaction is rolled back.
DO $$
BEGIN
 IF current_setting('cron.launch_active_jobs')<>'off'
   OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
        IS DISTINCT FROM 'Isolated HR T00 20261119'
 THEN RAISE EXCEPTION 'Isolated T00 database required'; END IF;
 IF to_regprocedure('public.t19_operational_output(text,bigint)') IS NULL
 OR to_regprocedure('public.t19_file_internal_sheet(uuid,bigint,jsonb)') IS NULL THEN
   RAISE EXCEPTION 'Scoped operational print or signed internal paper adapter is missing';
 END IF;
 IF has_function_privilege('anon','public.t19_operational_output(text,bigint)','EXECUTE')
   OR has_function_privilege('service_role','public.t19_operational_output(text,bigint)','EXECUTE')
 THEN RAISE EXCEPTION 'Only the authenticated caller may request operational output'; END IF;
END
$$;

CREATE FUNCTION pg_temp.t19_profile(p_actor integer) RETURNS bigint LANGUAGE sql STABLE AS $$
 SELECT id FROM public.user_profiles WHERE auth_user_id=('98000000-0000-4000-8000-'||lpad(p_actor::text,12,'0'))::uuid;
$$;
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope)
VALUES('reports.pdf.generate','Synthetic scoped PDF permission','REPORTS','generate','branch'),
 ('hr.payroll.view','Synthetic scoped payroll view','HR','view','branch') ON CONFLICT(permission_code) DO NOTHING;
INSERT INTO public.roles(role_code,role_name,is_system_role)
SELECT 't19_'||role_name,role_name,false FROM unnest(ARRAY['renderer','hr','accounts','alternate','time_origin','time_verify']) role_name;
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t19_renderer',ARRAY['reports.pdf.generate','fleet.fines.view','fleet.inspections.report']),
 ('t19_hr',ARRAY['reports.pdf.generate','hr.recovery.review']),
 ('t19_accounts',ARRAY['reports.pdf.generate','hr.recovery.accounts','hr.payroll.view']),
 ('t19_alternate',ARRAY['reports.pdf.generate','fleet.fines.view','fleet.inspections.report']),
 ('t19_time_origin',ARRAY['fleet.time.enter']),
 ('t19_time_verify',ARRAY['fleet.time.verify','dms.documents.view','dms.documents.preview']),
 ('t06_workshop',ARRAY['workshop.assess','workshop.jobs.manage','reports.pdf.generate'])
) caps(role_code,codes) JOIN public.roles r USING(role_code) JOIN public.permissions p ON p.permission_code=ANY(caps.codes);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT pg_temp.t19_profile(actor),r.id,company,branch,true FROM (VALUES
 (1,'t19_renderer',920001,920011),(1,'t19_renderer',920002,920021),(1,'t19_time_origin',920001,920011),
 (7,'t19_time_verify',920001,920011),(7,'t19_time_verify',920002,920021),(9,'t19_time_verify',920002,920021),
 (3,'t19_hr',920001,920011),(2,'t19_accounts',920001,920011),
 (6,'t19_alternate',920001,920012),(9,'t19_alternate',920002,920021)
) assignments(actor,role_code,company,branch) JOIN public.roles r USING(role_code);

UPDATE public.work_sites SET address_line_1='Synthetic gate 19' WHERE id=990001;
INSERT INTO public.dms_documents(id,document_no,title,document_type_id,category_id,owning_company_id,owning_branch_id,confidentiality_level,status)
 OVERRIDING SYSTEM VALUE SELECT 999193,'T19-INTERNAL-SHEET','Synthetic signed internal original',t.id,t.category_id,920001,920011,
 'internal','active' FROM public.dms_document_types t WHERE t.type_code='FLEET_SIGNED_INTERNAL_SHEET';
INSERT INTO public.dms_document_versions(id,document_id,version_number,is_current) OVERRIDING SYSTEM VALUE VALUES(999193,999193,1,true);
UPDATE public.dms_documents SET current_version_id=999193 WHERE id=999193;
INSERT INTO public.dms_document_files(id,document_id,version_id,file_role,storage_bucket,storage_path,file_name,mime_type,file_size_bytes,sha256_hash,integrity_status)
 OVERRIDING SYSTEM VALUE VALUES(999193,999193,999193,'original','dms-documents','test/t19-internal.pdf','internal.pdf',
 'application/pdf',100,repeat('c',64),'verified');

SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(1) AS claims \gset
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id)
SELECT id,'fleet_asset',asset FROM t07_documents;
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) VALUES(999193,'fleet_asset',980102);
DO $$
DECLARE trip bigint; paper bigint; snapshot jsonb;
BEGIN
 trip:=(pg_temp.t07_command(NULL,'create','{"company":920001,"branch":920011,"site":980001,"kind":"trip","reference":"T19-TRIP","subject":"Synthetic output trip"}')->>'id')::bigint;
 PERFORM pg_temp.t07_command(trip,'plan-leg','{"sequence":1,"origin":980001,"destination":990001,"load":"empty"}');
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t07_command(trip,'authorize','{"authorization":"T19-DO-1"}');
 PERFORM pg_temp.t06_actor(1);
 PERFORM pg_temp.t07_command(trip,'assign',pg_temp.t07_move(980101,980001,-30,50));
 paper:=(pg_temp.t07_command(trip,'issue-paper','{}')->>'event_id')::bigint;
 snapshot:=public.t07_fleet_trip_order(trip,paper)->'snapshot';
 IF snapshot->>'employer_ar' IS DISTINCT FROM 'شركة تجريبية'
    OR snapshot->'legs'->0->>'delivery_address' IS DISTINCT FROM 'Synthetic gate 19'
 THEN RAISE EXCEPTION 'Issue snapshot lacks protected legal identity or dispatch address'; END IF;
 PERFORM pg_temp.t07_publish_test_paper(trip,paper);
 PERFORM pg_temp.t06_actor(6);
 IF public.t07_fleet_trip_order_pdf(trip,paper) IS NOT NULL THEN RAISE EXCEPTION 'Trip PDF crossed sibling branch'; END IF;
END
$$;
RESET ROLE;

INSERT INTO erp_private.fleet_operation_orders(id,order_no,kind,company_id,branch_id,site_id,customer_id,rental_mode,request_reference,subject,
  status,raised_by,authorized_by,authorized_at,authorization_reference) OVERRIDING SYSTEM VALUE
VALUES(999191,'T19-RENTAL','rental',920001,920011,980001,990001,'wet','T19-LPO','Synthetic equipment rental',
 'active',pg_temp.t19_profile(1),pg_temp.t19_profile(7),'2026-10-01','Synthetic order authorization');
INSERT INTO erp_private.fleet_commitments(id,asset_id,employee_id,employment_period_id,company_id,branch_id,site_id,kind,status,committed_during,
 planned_return,policy_id,created_by) OVERRIDING SYSTEM VALUE
SELECT seed.id,980102,980002,period.id,920001,920011,980001,seed.kind,seed.status,'[2026-10-08 08:00+04,2026-10-08 18:00+04)'::tstzrange,
 '2026-10-08 18:00+04',policy.id,pg_temp.t19_profile(1)
FROM (VALUES(999191::bigint,'reservation','cancelled'),(999192::bigint,'custody','closed')) seed(id,kind,status)
JOIN erp_private.t03_employment_periods period ON period.employee_id=980002
JOIN erp_private.fleet_availability_policies policy ON policy.company_id=920001 AND policy.category='light_vehicle';
INSERT INTO erp_private.fleet_custody_events(commitment_id,kind,occurred_at,actor_id,reason,meter,meter_unit,condition,evidence_document_id,evidence_version_id,evidence_file_id)
VALUES (999192,'return','2026-10-08 18:00+04',pg_temp.t19_profile(1),'Synthetic signed return',0,'km','good',990202,990202,990202);
INSERT INTO erp_private.fleet_operation_assignments(id,order_id,slot,reservation_id,actual_commitment_id,asset_id,worker_id,employment_id,
 employer_company_id,employer_branch_id,host_company_id,host_branch_id,site_id,planned_period,state,planned_by,reason) OVERRIDING SYSTEM VALUE
SELECT 999191,999191,1,999191,c.id,c.asset_id,c.employee_id,c.employment_period_id,920001,920011,920001,920011,980001,
 c.committed_during,'closed',pg_temp.t19_profile(1),'Synthetic recorded work' FROM erp_private.fleet_commitments c WHERE id=999192;
INSERT INTO erp_private.t08_fleet_work(id,order_id,assignment_id,commitment_id,employee_id,employment_id,employer_company_id,employer_branch_id,
 host_company_id,host_branch_id,site_id,day,work_period,overnight,activity,entered_by,reason) OVERRIDING SYSTEM VALUE
SELECT seed.id,999191,999191,c.id,c.employee_id,c.employment_period_id,920001,920011,seed.host_company,seed.host_branch,seed.site,'2026-10-08',
 seed.work_period::tstzrange,false,seed.activity,pg_temp.t19_profile(1),'Synthetic activity'
FROM erp_private.fleet_commitments c CROSS JOIN (VALUES
 (999191::bigint,'[2026-10-08 08:00+04,2026-10-08 13:00+04)','customer-rental',920001,920011,980001),
 (999192::bigint,'[2026-10-08 14:00+04,2026-10-08 18:00+04)','internal',920002,920021,980002))
 seed(id,work_period,activity,host_company,host_branch,site) WHERE c.id=999192;
INSERT INTO erp_private.fleet_operation_evidence(id,order_id,assignment_id,purpose,company_id,paper_reference,document_id,version_id,file_id,recorded_by)
 OVERRIDING SYSTEM VALUE VALUES(999191,999191,999191,'rental-sheet',920001,'T19SHEET',990203,990212,990212,pg_temp.t19_profile(1));
INSERT INTO erp_private.fleet_rental_usage(id,order_id,assignment_id,evidence_id,work_period,state)
 OVERRIDING SYSTEM VALUE VALUES(999191,999191,999191,999191,'[2026-10-08 08:00+04,2026-10-08 13:00+04)','signed');
INSERT INTO erp_private.t08_time_reviews(work_id,matched,sources,reviewed_by,reason)
VALUES(999191,'{[2026-10-08 08:00+04,2026-10-08 13:00+04)}',erp_private.t08_sheet_sources(999191),pg_temp.t19_profile(7),'Synthetic signed review');

INSERT INTO erp_private.fleet_asset_holds(id,asset_id,kind,placed_at,placed_by,reason) OVERRIDING SYSTEM VALUE VALUES
 (999191,980102,'workshop','2026-10-09',pg_temp.t19_profile(1),'Synthetic assessment hold'),
 (999192,980102,'workshop','2026-10-10',pg_temp.t19_profile(4),'Synthetic job hold');
INSERT INTO erp_private.t10_assessments(id,asset_id,company_id,branch_id,source_kind,source_ref,occurred_at,reported_by,
 finding,first_hold_id,outcome,assessed_by,assessed_at,diagnosis)
 OVERRIDING SYSTEM VALUE VALUES(999191,980102,920001,920011,'inspection','T19-INSP','2026-10-09',pg_temp.t19_profile(1),
 'Synthetic Workshop finding',999191,'repair',pg_temp.t19_profile(4),'2026-10-10','Synthetic diagnosis');
INSERT INTO erp_private.t10_job_cycles(id,assessment_id,cycle,hold_id,state,opened_by,scope_of_work,assigned_employee_id,estimate_aed)
 OVERRIDING SYSTEM VALUE VALUES(999191,999191,1,999192,'planned',pg_temp.t19_profile(4),'Synthetic Workshop scope',980002,145.50);
INSERT INTO erp_private.t13_cases(id,source_kind,company_id,branch_id,asset_id,occurred_at,source_amount,currency,
 source_status,subject_status,authority_key,reference_key,source_facts,reported_by)
 OVERRIDING SYSTEM VALUE VALUES(999191,'fine',920001,920011,980102,'2026-10-09 09:15+04',205,'AED','reported','unresolved',
 'synthetic','t19-fine','{"authority":"Synthetic Authority","reference":"T19-FINE","payment_deadline":"2026-12-01"}',pg_temp.t19_profile(1));
INSERT INTO erp_private.t13_hr_reviews(case_id,source_digest,decision,ceiling,reviewed_by,reason)
VALUES(999191,erp_private.t13_source_digest(999191),'unresolved',0,pg_temp.t19_profile(3),'Private synthetic HR response');

SET LOCAL ROLE authenticated;
DO $$
DECLARE packet jsonb; proof jsonb:='{"document":999193,"version":999193,"file":999193}'; receipt jsonb;
  operation uuid:=gen_random_uuid();
BEGIN
 PERFORM pg_temp.t06_actor(1);
 packet:=public.t19_operational_output('custody',999192);
 IF packet->'evidence'->0->>'file' IS DISTINCT FROM '990202'
    OR packet->>'company_ar' IS DISTINCT FROM 'شركة تجريبية'
    OR NOT packet->'rows' @> '[["Actual return","2026-10-08 18:00"]]'
 THEN RAISE EXCEPTION 'Custody original, issue identity or time was lost: %',packet; END IF;
 IF public.t19_operational_output('custody',999191) IS NOT NULL THEN RAISE EXCEPTION 'Reservation became a custody acknowledgement'; END IF;
 packet:=public.t19_operational_output('timesheet',999191);
 IF packet->'evidence'->0->>'file' IS DISTINCT FROM '990212'
    OR packet->'evidence'->0->>'current' IS DISTINCT FROM 'false'
    OR packet->>'source_checksum' IS DISTINCT FROM public.t19_operational_output('timesheet',999191)->>'source_checksum'
    OR NOT packet->'rows' @> '[["Recorded minutes","300"]]'
 THEN RAISE EXCEPTION 'Historical exact customer original or digest unavailable: %',packet; END IF;
 packet:=public.t19_operational_output('timesheet',999192);
 IF packet->>'title' IS DISTINCT FROM 'Internal work timesheet'
    OR packet->>'company' IS DISTINCT FROM 'Synthetic Employer B'
    OR packet->'evidence' IS DISTINCT FROM '[]'::jsonb
    OR NOT packet->'rows' @> '[["Matched minutes",null]]'
 THEN RAISE EXCEPTION 'Internal time misrepresented as signed or zero verified: %',packet; END IF;
 packet:=public.t19_operational_output('assessment',999191);
 IF NOT packet->'rows' @> '[["Diagnosis","Synthetic diagnosis"]]' THEN RAISE EXCEPTION 'Assessment evidence unavailable'; END IF;
 packet:=public.t19_operational_output('job-card',999191);
 IF packet IS NULL OR packet::text LIKE '%145.50%' OR packet::text LIKE '%Technician%' THEN RAISE EXCEPTION 'Inspector print bypassed job masks'; END IF;
 packet:=public.t19_operational_output('fine',999191);
 IF NOT packet->'rows' @> '[["Payment deadline","2026-12-01"]]' OR packet::text LIKE '%Private synthetic HR%' THEN
  RAISE EXCEPTION 'Fleet case deadlines missing or HR decision notes exposed'; END IF;
 IF public.t19_operational_output('recovery',999191) IS NOT NULL THEN RAISE EXCEPTION 'Fleet actor accessed restricted recovery'; END IF;
 BEGIN
   PERFORM public.t19_file_internal_sheet(operation,999192,proof);
   RAISE EXCEPTION 'Time entrant filed their own internal proof';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t06_actor(9);
 IF public.t19_internal_sheet_choices(999192) IS DISTINCT FROM '[]'::jsonb THEN
   RAISE EXCEPTION 'Receiving verifier without home DMS scope saw the signed original';
 END IF;
 BEGIN
   PERFORM public.t19_file_internal_sheet(operation,999192,proof);
   RAISE EXCEPTION 'Receiving verifier filed an original outside its DMS authority';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 PERFORM pg_temp.t06_actor(7);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.t19_work_queue(920002,920021,'discrepancy','',1,50)->'rows') row
   WHERE row->>'source_id'='999192' AND row->>'evidence'='missing')
 THEN RAISE EXCEPTION 'Discrepancy queue did not identify missing internal paper'; END IF;
 IF public.t19_internal_sheet_choices(999192)->0->>'file' IS DISTINCT FROM '999193' THEN
   RAISE EXCEPTION 'Independent verifier could not select exact internal original';
 END IF;
 receipt:=public.t19_file_internal_sheet(operation,999192,proof);
 IF public.t19_file_internal_sheet(operation,999192,proof) IS DISTINCT FROM receipt||'{"replayed":true}'::jsonb THEN
   RAISE EXCEPTION 'Same internal sheet filing produced a different receipt';
 END IF;
 BEGIN
   PERFORM public.t19_file_internal_sheet(gen_random_uuid(),999192,proof);
   RAISE EXCEPTION 'Duplicate filing with a new request consumed the same original twice';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL; END;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.t08_fleet_order_time(999191)->'work') row
   WHERE (row->>'id')::bigint=999192 AND row->'internal_sheets'->0->>'file'='999193'
      AND row->>'review' IS NULL AND (row->>'matched_minutes')::int=0)
 THEN RAISE EXCEPTION 'Filed internal original missing or filing changed time review'; END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.t19_work_queue(920002,920021,'discrepancy','',1,50)->'rows') row
   WHERE row->>'source_id'='999192' AND row->>'evidence'='available' AND row->>'state'='awaiting-verification')
 THEN RAISE EXCEPTION 'Discrepancy queue failed to reflect late internal paper without approving time'; END IF;
 PERFORM pg_temp.t06_actor(9);
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(public.t19_work_queue(920002,920021,'discrepancy','',1,50)->'rows') row
  WHERE row->>'source_id'='999192' AND row->>'evidence'='restricted')
  OR public.t19_operational_output('timesheet',999192)->'evidence' IS DISTINCT FROM '[]'::jsonb
 THEN RAISE EXCEPTION 'Receiving queue or print crossed the canonical asset DMS boundary'; END IF;
 PERFORM pg_temp.t06_actor(1);
 packet:=public.t19_operational_output('timesheet',999192);
 IF packet->'evidence'->0->>'file' IS DISTINCT FROM '999193'
    OR NOT packet->'rows' @> '[["Matched minutes",null]]' THEN
   RAISE EXCEPTION 'Exact internal original missing or filing altered the verified hours: %',packet;
 END IF;

 PERFORM pg_temp.t06_actor(4);
 packet:=public.t19_operational_output('job-card',999191);
 IF NOT packet->'rows' @> '[["Work estimate (AED)","145.50"]]' THEN RAISE EXCEPTION 'Workshop reviewer lost job estimate: %',packet; END IF;
 PERFORM pg_temp.t06_actor(3);
 packet:=public.t19_operational_output('recovery',999191);
 IF packet IS NULL OR packet::text NOT LIKE '%Private synthetic HR%' OR packet::text LIKE '%Reconciled cost%' THEN
  RAISE EXCEPTION 'Restricted HR recovery facts misclassified: %',packet; END IF;
 PERFORM pg_temp.t06_actor(2);
 packet:=public.t19_operational_output('recovery',999191);
 IF packet IS NULL OR packet::text LIKE '%Private synthetic HR%' OR NOT packet->'rows' @> '[["Recovery collected","0"]]' THEN
    RAISE EXCEPTION 'Accounts mask or actual zero is lost: %',packet; END IF;
 FOR actor IN 6..9 LOOP
  PERFORM pg_temp.t06_actor(actor);
  IF actor<>7 AND EXISTS(SELECT 1 FROM unnest(ARRAY['custody','timesheet','assessment','job-card','fine','recovery']) kind
    WHERE public.t19_operational_output(kind,CASE kind WHEN 'custody' THEN 999192 ELSE 999191 END) IS NOT NULL)
  THEN RAISE EXCEPTION 'Sibling branch, foreign company or admin scope accessed an output: %',actor; END IF;
 END LOOP;
END
$$;
RESET ROLE;

UPDATE auth.sessions SET not_after=clock_timestamp()-interval '1 second'
WHERE id='98000000-0000-4000-8001-000000000001';
SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(1) AS claims \gset
DO $$ BEGIN
 IF public.t19_operational_output('timesheet',999191) IS NOT NULL THEN RAISE EXCEPTION 'Expired session retained print access'; END IF;
END $$;
ROLLBACK;
\echo integrated-outputs.native.sql PASS
