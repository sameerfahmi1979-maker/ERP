\set ON_ERROR_STOP on
-- Run with the guarded p4-rental-b02.py runner,
-- which prepends the T07, T08, T14, T16 and T17 synthetic fixtures.
-- The predecessor setup opens the transaction. This scenario rolls it back.
DO $$
BEGIN
 IF current_database() <> 'p4_rental_b02_20261120'
    OR current_setting('cron.launch_active_jobs') <> 'off'
    OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
       IS DISTINCT FROM 'Isolated HR T00 20261119'
    OR NOT EXISTS (SELECT 1 FROM supabase_migrations.schema_migrations WHERE version='20261120194000') THEN
   RAISE EXCEPTION 'The isolated Package 4 rental clone requires the exact Package 3 predecessor';
 END IF;
END $$;

-- The replacement earns basic wages only in September. A later pay rise and
-- October rule intentionally make October's valuation different.
SET LOCAL session_replication_role=replica;
UPDATE public.employee_salary_components SET effective_from='2026-10-01'
 WHERE employee_id=980002 AND component_type_id=991901;
UPDATE public.employee_salary_revisions SET effective_date='2026-10-01' WHERE id=991903;
UPDATE public.employee_salary_revision_effects SET effective_date='2026-10-01' WHERE id=991903;
UPDATE erp_private.fleet_asset_plates SET valid_from='2026-09-01',plate_number='T20RENT' WHERE asset_id=980102;
UPDATE erp_private.t02_work_rule_versions SET effective_period='[2026-09-01,2026-10-01)'
 WHERE company_id=920001 AND category='overtime.standard' AND lower(effective_period)='2026-10-01'
   AND prepared_by='98000000-0000-4000-8000-000000000001';
UPDATE erp_private.t02_work_rule_versions SET effective_period='[2026-10-01,2026-12-01)'
 WHERE company_id=920001 AND category='overtime.standard'
   AND lower(effective_period)='2026-11-01'
   AND prepared_by='98000000-0000-4000-8000-000000000001';
UPDATE erp_private.t14_rules SET validity='[2026-09-01,2026-12-01)'
 WHERE company_id=920001 AND branch_id=920011 AND reason='Synthetic dated review';
SET LOCAL session_replication_role=origin;

INSERT INTO public.roles(role_code,role_name,is_system_role) VALUES
 ('t20_rental_submit','Synthetic Accounts payroll submission',false),
 ('t20_rental_gm','Synthetic independent GM payroll decision',false);
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t20_rental_submit',ARRAY['hr.payroll.run.submit','hr.payroll.view']),
 ('t20_rental_gm',ARRAY['hr.payroll.run.approve','hr.payroll.view'])
) g(role,caps) JOIN public.roles r ON r.role_code=g.role JOIN public.permissions p ON p.permission_code=ANY(g.caps);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT pg_temp.t08_profile(g.actor),r.id,920001,g.branch,true
FROM (VALUES (2,'t20_rental_submit',920011),(2,'t20_rental_gm',920011),
 (7,'t20_rental_gm',920011),(6,'t20_rental_gm',920012)) g(actor,role,branch)
JOIN public.roles r ON r.role_code=g.role;

CREATE FUNCTION pg_temp.t20_rental_approve(p_snapshot jsonb,p_step int) RETURNS jsonb
LANGUAGE plpgsql AS $$
DECLARE submitted jsonb; decision jsonb; approved jsonb; op uuid:=pg_temp.t06_op(p_step+1);
BEGIN
 PERFORM pg_temp.t06_actor(2);
 submitted:=public.t15_payroll_review_command(pg_temp.t06_op(p_step),920001,920011,'submit',
   jsonb_build_object('run',p_snapshot->'run','version',p_snapshot->'version','digest',p_snapshot->'digest',
    'acknowledge_exceptions',true,'reason','Accounts submitted the exact synthetic rental payroll'));
 decision:=jsonb_build_object('review',submitted->'review','version',p_snapshot->'version','digest',p_snapshot->'digest',
    'reason','Independent GM approved the exact synthetic rental payroll');
 BEGIN
   PERFORM public.t15_payroll_review_command(op,920001,920011,'approve',decision);
   RAISE EXCEPTION 'Accounts self-approved';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(6);
 BEGIN
   PERFORM public.t15_payroll_review_command(op,920001,920012,'approve',decision);
   RAISE EXCEPTION 'Sibling branch approved the pay';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(7);
 approved:=public.t15_payroll_review_command(op,920001,920011,'approve',decision);
 IF approved->>'state' IS DISTINCT FROM 'approved'
    OR public.t15_payroll_review_command(op,920001,920011,'approve',decision)
       IS DISTINCT FROM approved||'{"replayed":true}' THEN
   RAISE EXCEPTION 'Exact approval failed or did not replay: %',approved;
 END IF;
 RETURN approved;
END $$;

RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true) AS actor \gset
SELECT pg_temp.t16_configuration();
INSERT INTO public.employee_wps_profiles(employee_id,wps_applicable,wps_status,bank_id,iban,mohre_person_code,
 mohre_establishment_id,salary_effective_date)
VALUES (980001,true,'active',998601,'AE070331234567890123456','00112233445566',998601,'2026-01-01');
UPDATE public.employee_wps_profiles SET wps_applicable=false,wps_status='exempt',salary_payment_method='cheque'
 WHERE employee_id=980002;
INSERT INTO erp_private.t16_alternate_channels(company_id,branch_id,channel,effective_month,policy_file_id,policy_sha256)
VALUES (920001,920011,'cheque','2026-01-01',998614,lpad('998614',64,'0'));

CREATE FUNCTION pg_temp.t20_rental_payment(p_label text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
 scenario record; snapshot jsonb; review uuid; approved_version uuid; batch uuid; payment uuid; earning_lines jsonb;
 pay_input jsonb; allocation_input jsonb; paid jsonb; applied jsonb; status_after jsonb; exact_receipt jsonb;
BEGIN
 FOR scenario IN SELECT * FROM (VALUES
    ('sep',2040,998609,3000.00,'2026-10-01'::date),
    ('oct',2050,998603,4545.00,'2026-11-20'::date)
 ) v(label,step,evidence,net,paid_on) WHERE v.label=p_label LOOP
   snapshot:=current_setting('erp.t20_rental_'||scenario.label)::jsonb;
   review:=current_setting('erp.t20_rental_'||scenario.label||'_review')::uuid;
   approved_version:=(snapshot->>'version')::uuid;
   SELECT jsonb_agg(jsonb_build_object('line',l.id,'amount',l.amount::text) ORDER BY l.id)
    INTO earning_lines FROM erp_private.t14_lines l WHERE l.version_id=approved_version AND l.employee_id=980002 AND l.amount>0;
   SET LOCAL ROLE authenticated;
   PERFORM pg_temp.t06_actor(2);
   exact_receipt:=public.t16_wps_issue_command(pg_temp.t06_op(scenario.step),920001,920011,'issue',
      jsonb_build_object('review',review,'version',approved_version,'digest',snapshot->'digest'));
   batch:=(exact_receipt->>'batch')::uuid;
   PERFORM public.t16_wps_issue_command(pg_temp.t06_op(scenario.step+1),920001,920011,'authorize-cheque',
      jsonb_build_object('batch',batch,'reference','T20-AUTH-CHEQUE-'||scenario.label)||pg_temp.t16_proof(998602));
   pay_input:=jsonb_build_object('batch',batch,'employee',980002,'channel','cheque','reference','T20-EMPLOYEE-CHEQUE-'||scenario.label,
      'amount',scenario.net::text,'currency','AED','paid_on',scenario.paid_on,'outcome','paid')||pg_temp.t16_proof(scenario.evidence);
   BEGIN
     PERFORM public.t16_payroll_payment_command(pg_temp.t06_op(scenario.step+2),920001,920011,'receipt',pay_input);
     RAISE EXCEPTION 'Issue-only actor reconciled a rental payment';
   EXCEPTION WHEN insufficient_privilege THEN NULL;
   END;
   PERFORM pg_temp.t06_actor(3);
   paid:=public.t16_payroll_payment_command(pg_temp.t06_op(scenario.step+2),920001,920011,'receipt',pay_input);
   payment:=(paid->>'payment')::uuid;
   IF public.t16_payroll_payment_command(pg_temp.t06_op(scenario.step+2),920001,920011,'receipt',pay_input)
     IS DISTINCT FROM paid||'{"replayed":true}' THEN RAISE EXCEPTION 'Exact cash receipt replay failed'; END IF;
   allocation_input:=jsonb_build_object('batch',batch,'payment',payment,'revision',0,'lines',earning_lines,
      'reason','Verified synthetic cheque allocated to exact earned lines')||pg_temp.t16_proof(998604);
   applied:=public.t16_payroll_payment_command(pg_temp.t06_op(scenario.step+3),920001,920011,'allocate',allocation_input);
   IF public.t16_payroll_payment_command(pg_temp.t06_op(scenario.step+3),920001,920011,'allocate',allocation_input)
     IS DISTINCT FROM applied||'{"replayed":true}' THEN RAISE EXCEPTION 'Exact line allocation replay failed'; END IF;
   BEGIN
     PERFORM public.t16_payroll_payment_command(pg_temp.t06_op(scenario.step+4),920001,920011,'allocate',allocation_input);
     RAISE EXCEPTION 'Another operation reallocated the same pay';
   EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
   END;
   RESET ROLE;
   status_after:=erp_private.t16_result_status(batch,980002);
   IF status_after->>'status' IS DISTINCT FROM 'reconciled' OR (status_after->>'verified_cash')::numeric IS DISTINCT FROM scenario.net
      OR (status_after->>'remaining')::numeric IS DISTINCT FROM 0
      OR NOT EXISTS(SELECT 1 FROM erp_private.t16_batch_results WHERE batch_id=batch AND employee_id=980002 AND channel='cheque' AND file_id IS NULL)
   THEN RAISE EXCEPTION 'Approved synthetic employee cheque did not settle exact pay: %',status_after; END IF;
   PERFORM set_config('erp.t20_rental_'||scenario.label||'_batch',batch::text,true);
   RAISE NOTICE 'T20-RENTAL-PAYMENT %',jsonb_build_object('period',scenario.label,'employee',980002,'review',review,
      'batch',batch,'payment',paid,'allocation',applied,'status',status_after,'exact_lines',earning_lines);
 END LOOP;
END $$;

SET LOCAL ROLE authenticated;
SELECT pg_temp.t06_actor(1) AS actor \gset
INSERT INTO public.dms_document_links(document_id,entity_type,entity_id) SELECT id,'fleet_asset',asset FROM t07_documents;

DO $$
DECLARE
 rental bigint; original_assignment bigint; replacement bigint; old_work bigint; new_work bigint; attendance bigint;
 rental_view jsonb; work_input jsonb; work_receipt jsonb; draft jsonb;
 planned_return timestamptz:=statement_timestamp()+interval '1 day';
 swap_time constant timestamptz:='2026-09-17 08:00+04';
BEGIN
 rental:=(pg_temp.t07_command(NULL,'create','{"company":920001,"branch":920011,"site":980001,
   "kind":"rental","rental_mode":"wet","customer":990001,"reference":"T20-RENT-LATE","subject":"Synthetic dated rental"}')->>'id')::bigint;
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t07_command(rental,'authorize','{"authorization":"T20-AUTH-RENT-LATE"}');
 PERFORM pg_temp.t06_actor(1);
 original_assignment:=(pg_temp.t07_command(rental,'assign',jsonb_build_object('employee',980001,'asset',980102,'slot',1,
   'from','2026-09-03 08:00+04','until',planned_return))->>'event_id')::bigint;
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t07_command(rental,'approve-handover',jsonb_build_object('assignment',original_assignment));
 PERFORM pg_temp.t06_actor(1);
 PERFORM pg_temp.t07_command(rental,'start',jsonb_build_object('assignment',original_assignment,'at','2026-09-03 08:00+04',
   'snapshot',pg_temp.t06_facts(),'evidence',pg_temp.t07_packet(990201,'T20-HANDOVER-A')));
 old_work:=pg_temp.t08_work(rental,original_assignment,'2026-09-03 08:00+04','2026-09-03 16:00+04');
 replacement:=(pg_temp.t07_command(rental,'substitute',jsonb_build_object('assignment',original_assignment,
   'employee',980002,'asset',980102,'from',swap_time,'until',planned_return,
   'snapshot',pg_temp.t06_facts(),'evidence',pg_temp.t07_packet(990202,'T20-RETURN-A')))->>'event_id')::bigint;
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t07_command(rental,'approve-handover',jsonb_build_object('assignment',replacement));
 PERFORM pg_temp.t06_actor(1);
 PERFORM pg_temp.t07_command(rental,'start',jsonb_build_object('assignment',replacement,'at',swap_time,
   'snapshot',pg_temp.t06_facts(),'evidence',pg_temp.t07_packet(990214,'T20-HANDOVER-B')));
 work_input:=jsonb_build_object('assignment',replacement,'from',swap_time,'until','2026-09-17 18:00+04',
   'reason','Synthetic replacement operator daily record');
 work_receipt:=public.t08_fleet_time(pg_temp.t06_op(2001),rental,'record',work_input);
 new_work:=(work_receipt->>'id')::bigint;
 IF public.t08_fleet_time(pg_temp.t06_op(2001),rental,'record',work_input)
    IS DISTINCT FROM work_receipt||'{"replayed":true}' THEN RAISE EXCEPTION 'Daily work replay lost its exact receipt'; END IF;
 PERFORM pg_temp.t07_command(rental,'return',jsonb_build_object('assignment',replacement,'at','2026-09-17 18:00+04',
   'snapshot',pg_temp.t06_facts(),'evidence',pg_temp.t07_packet(990214,'T20-RETURN-B')));
 rental_view:=public.t07_fleet_operation_detail(rental);
 IF NOT rental_view->'assignments' @> jsonb_build_array(jsonb_build_object('id',original_assignment,'state','replaced','worker_id',980001),
        jsonb_build_object('id',replacement,'state','closed','worker_id',980002))
    OR NOT public.t08_fleet_order_time(rental)->'work' @> jsonb_build_array(
      jsonb_build_object('id',old_work,'assignment',original_assignment,'date','2026-09-03','minutes',480),
      jsonb_build_object('id',new_work,'assignment',replacement,'date','2026-09-17','minutes',600))
 THEN RAISE EXCEPTION 'Daily record or replacement attribution was lost: %',rental_view->'assignments'; END IF;
 PERFORM pg_temp.t06_actor(6);
 IF public.t08_fleet_order_time(rental) IS NOT NULL THEN RAISE EXCEPTION 'Sibling branch read the replacement worker record'; END IF;
 PERFORM pg_temp.t06_actor(4);
 draft:=public.t08_attendance_drafts('2026-09-17')->0;
 attendance:=(public.t08_review_attendance(pg_temp.t06_op(2002),980002,'2026-09-17','create-draft',draft->>'token',
     'HR linked the exact daily record of the replacement operator')->>'id')::bigint;
 PERFORM pg_temp.t06_actor(5);
 PERFORM public.f11_mutate_time_child('attendance-summary',980002,attendance,1,pg_temp.t06_op(2003),'approve','{}');
 PERFORM pg_temp.t06_actor(2);
 IF pg_temp.t08_queue('2026-09-17',new_work)->>'status' IS DISTINCT FROM 'awaiting-operations'
    OR public.t08_fleet_payroll_candidates(920001,'2026-09-30 23:59+04') IS DISTINCT FROM '[]'::jsonb THEN
   RAISE EXCEPTION 'Unsigned rental time crossed the September cutoff';
 END IF;
 PERFORM set_config('erp.t20_rental',rental::text,true);
 PERFORM set_config('erp.t20_rental_a',original_assignment::text,true);
 PERFORM set_config('erp.t20_rental_b',replacement::text,true);
 PERFORM set_config('erp.t20_rental_work',new_work::text,true);
 RAISE NOTICE 'T20-RENTAL-WORK %',jsonb_build_object('rental',rental,'operator_a_assignment',original_assignment,
   'operator_b_assignment',replacement,'work_a',old_work,'work_b',new_work,'attendance_b',attendance,'same_operation_replayed',true);
END $$;

-- Keep the owning-command work IDs and model the daily-entry clocks for
-- the prior cycle. The signed sheet keeps its actual receipt timestamp.
RESET ROLE;
SET LOCAL session_replication_role=replica;
UPDATE erp_private.t08_fleet_work SET entered_at=upper(work_period)+interval '5 minutes'
 WHERE order_id=current_setting('erp.t20_rental')::bigint;
SET LOCAL session_replication_role=origin;
SET LOCAL ROLE authenticated;

DO $$
DECLARE
 opening constant date:='2026-09-01'; snapshot jsonb; detail jsonb; approved jsonb;
BEGIN
 PERFORM pg_temp.t06_actor(2);
 snapshot:=public.t14_payroll_command(pg_temp.t06_op(2010),920001,920011,'calculate',
   jsonb_build_object('month',opening,'cutoff','2026-09-30T23:59:00+04:00','expected_version',NULL,'reason','Synthetic September cycle before sheet'));
 detail:=public.t14_payroll_workspace(920001,920011,opening,(snapshot->>'version')::uuid,980002)->'detail';
 IF jsonb_array_length(detail->'lines') IS DISTINCT FROM 1
    OR NOT detail->'lines' @> '[{"category":"basic","amount":"3000.00","currency":"AED"}]'::jsonb
    OR NOT detail->'exceptions' @> '[{"code":"fleet-awaiting-operations"}]'::jsonb THEN
   RAISE EXCEPTION 'September did not contain only the replacement basic wage: %',detail;
 END IF;
 approved:=pg_temp.t20_rental_approve(snapshot,2011);
 PERFORM set_config('erp.t20_rental_sep',snapshot::text,true);
 PERFORM set_config('erp.t20_rental_sep_review',approved->>'review',true);
 RAISE NOTICE 'T20-RENTAL-SEPTEMBER %',jsonb_build_object('employee',980002,'basic',3000,'fleet_overtime',0,
    'cutoff','2026-09-30 23:59+04','exact_snapshot',snapshot,'approval',approved);
END $$;

RESET ROLE;
SELECT pg_temp.t20_rental_payment('sep');
SET LOCAL ROLE authenticated;

DO $$
DECLARE rental bigint:=current_setting('erp.t20_rental')::bigint;
 assignment bigint:=current_setting('erp.t20_rental_b')::bigint; work bigint:=current_setting('erp.t20_rental_work')::bigint;
 sheet jsonb; old_view jsonb; current_view jsonb; queue jsonb; receipt jsonb; dispute bigint;
BEGIN
 PERFORM pg_temp.t06_actor(7);
 SELECT v INTO STRICT old_view FROM jsonb_array_elements(public.t08_fleet_order_time(rental)->'work') v WHERE v->>'id'=work::text;
 PERFORM pg_temp.t06_actor(1);
 sheet:=jsonb_build_object('assignment',assignment,'evidence',pg_temp.t07_packet(990203,'T20-LATE-SIGNED'),
   'revision',(public.t07_fleet_operation_detail(rental)->>'revision')::integer,'reason','Original signed customer sheet arrived after cutoff',
   'lines','[{"from":"2026-09-17 08:00+04","until":"2026-09-17 17:00+04","state":"signed"},
      {"from":"2026-09-17 17:00+04","until":"2026-09-17 18:00+04","state":"disputed","reason":"Supervisor daily record runs one hour later than customer record"}]'::jsonb);
 receipt:=public.t07_fleet_operation(pg_temp.t06_op(2020),rental,'record-sheet',sheet);
 IF public.t07_fleet_operation(pg_temp.t06_op(2020),rental,'record-sheet',sheet)
    IS DISTINCT FROM receipt||'{"replayed":true}' THEN RAISE EXCEPTION 'Sheet retry failed'; END IF;
 SELECT (v->>'id')::bigint INTO STRICT dispute FROM jsonb_array_elements(public.t07_fleet_operation_detail(rental)->'usage') v
 WHERE v->>'state'='disputed';
 PERFORM pg_temp.t06_actor(7);
 BEGIN
   PERFORM pg_temp.t08_call(rental,'verify',jsonb_build_object('work',work,'review',old_view->'review','source_digest',old_view->'source_digest'));
   RAISE EXCEPTION 'Stale view accepted after late evidence';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 PERFORM pg_temp.t08_review(rental,work);
 PERFORM pg_temp.t06_actor(2);
 queue:=pg_temp.t08_queue('2026-09-17',work);
 IF queue->>'status' IS DISTINCT FROM 'ready' OR (queue->>'amount')::numeric IS DISTINCT FROM 22.50
    OR (queue->>'minutes')::numeric IS DISTINCT FROM 60 THEN RAISE EXCEPTION 'Disputed minute exclusion failed: %',queue; END IF;
 PERFORM pg_temp.t06_actor(1);
 PERFORM pg_temp.t07_command(rental,'resolve-sheet',jsonb_build_object('assignment',assignment,'usage',dispute,
   'evidence',pg_temp.t07_packet(990216,'T20-CUSTOMER-RECONCILIATION')));
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t08_review(rental,work);
 SELECT v INTO STRICT current_view FROM jsonb_array_elements(public.t08_fleet_order_time(rental)->'work') v WHERE v->>'id'=work::text;
 PERFORM pg_temp.t06_actor(2);
 queue:=pg_temp.t08_queue('2026-09-17',work);
 IF queue->>'status' IS DISTINCT FROM 'ready' OR (queue->>'amount')::numeric IS DISTINCT FROM 45.00
    OR (queue->>'minutes')::numeric IS DISTINCT FROM 120 THEN RAISE EXCEPTION 'Reconciliation or original-work-date rate failed: %',queue; END IF;
 receipt:=public.t08_payroll_review(pg_temp.t06_op(2021),work,queue->>'digest','Accounts verified the dated overtime and resolved evidence');
 IF public.t08_payroll_review(pg_temp.t06_op(2021),work,queue->>'digest','Accounts verified the dated overtime and resolved evidence')
    IS DISTINCT FROM receipt||'{"replayed":true}' THEN RAISE EXCEPTION 'Candidate acceptance did not replay'; END IF;
 IF public.t08_fleet_payroll_candidates(920001,'2026-09-30 23:59+04') IS DISTINCT FROM '[]'::jsonb THEN
   RAISE EXCEPTION 'Accepted late candidate crossed cutoff';
 END IF;
 PERFORM set_config('erp.t20_rental_candidate',receipt->>'id',true);
 RAISE NOTICE 'T20-RENTAL-RECONCILED %',jsonb_build_object('daily_minutes',current_view->'minutes','original_signed_minutes',540,
   'initial_disputed_minutes',60,'eligible_after_reconciliation_minutes',queue->'minutes','dated_overtime',queue->'amount',
   'disputed_usage',dispute,'source_links',current_view->'sources','candidate_receipt',receipt);
END $$;

DO $$
DECLARE
 opening constant date:='2026-10-01'; snapshot jsonb; detail jsonb; approved jsonb; item jsonb; candidate jsonb;
 work bigint:=current_setting('erp.t20_rental_work')::bigint;
BEGIN
 PERFORM pg_temp.t06_actor(2);
 SELECT v INTO STRICT candidate FROM jsonb_array_elements(public.t08_fleet_payroll_candidates(920001,statement_timestamp())) v
 WHERE v->>'id'=current_setting('erp.t20_rental_candidate');
 IF candidate->>'date' IS DISTINCT FROM '2026-09-17' OR candidate->>'employer' IS DISTINCT FROM '920001'
    OR candidate->>'employee' IS DISTINCT FROM '980002' THEN
   RAISE EXCEPTION 'Candidate attribution did not match the original-date replacement: %',candidate;
 END IF;
 snapshot:=public.t14_payroll_command(pg_temp.t06_op(2030),920001,920011,'calculate',
   jsonb_build_object('month',opening,'cutoff',to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'Z',
    'expected_version',NULL,'reason','Synthetic October cycle after reconciliation'));
 detail:=public.t14_payroll_workspace(920001,920011,opening,(snapshot->>'version')::uuid,980002)->'detail';
 SELECT v INTO STRICT item FROM jsonb_array_elements(detail->'lines') v WHERE v->>'category'='fleet-overtime';
 IF item->>'original_on' IS DISTINCT FROM '2026-09-17' OR (item->>'amount')::numeric IS DISTINCT FROM 45.00
    OR (item->>'quantity')::numeric IS DISTINCT FROM 2 OR (item->>'rate')::numeric IS DISTINCT FROM 22.50
    OR item#>>'{source,work}' IS DISTINCT FROM work::text
    OR public.t14_payroll_workspace(920001,920011,opening,(snapshot->>'version')::uuid,980001)->'detail'->'lines'
       @> '[{"category":"fleet-overtime"}]'::jsonb THEN RAISE EXCEPTION 'Wrong worker, original date or exact rate on next draft: %',detail; END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(public.t08_fleet_payroll_candidates(920001,statement_timestamp())) c
   WHERE c->>'id'=current_setting('erp.t20_rental_candidate'))
   OR pg_temp.t08_queue('2026-09-17',work)->>'status' IS DISTINCT FROM 'held-by-draft' THEN
   RAISE EXCEPTION 'B02 live draft interval remains available or lacks its draft label';
 END IF;
 approved:=pg_temp.t20_rental_approve(snapshot,2031);
 PERFORM pg_temp.t06_actor(2);
 IF pg_temp.t08_queue('2026-09-17',work)->>'status' IS DISTINCT FROM 'held-by-approval' THEN
   RAISE EXCEPTION 'B02 approved but unpaid work must retain its approval hold';
 END IF;
 PERFORM set_config('erp.t20_rental_oct',snapshot::text,true);
 PERFORM set_config('erp.t20_rental_oct_review',approved->>'review',true);
 RAISE NOTICE 'T20-RENTAL-OCTOBER %',jsonb_build_object('employee',980002,'overtime_line',item,'exact_snapshot',snapshot,'approval',approved);
END $$;

RESET ROLE;
SELECT pg_temp.t20_rental_payment('oct');

SET LOCAL ROLE authenticated;
DO $$
DECLARE
 batch_id uuid:=current_setting('erp.t20_rental_oct_batch')::uuid; prepared jsonb; snapshot jsonb;
BEGIN
 PERFORM pg_temp.t06_actor(2);
 prepared:=public.t17_issue_prepare(pg_temp.t06_op(2056),batch_id,980002);
 snapshot:=prepared->'snapshot';
 IF prepared->>'id' IS NULL OR prepared->>'finalized' IS DISTINCT FROM 'false'
    OR snapshot->>'month' IS DISTINCT FROM '2026-10-01'
    OR jsonb_array_length(snapshot->'late_overtime') IS DISTINCT FROM 1
    OR snapshot#>>'{late_overtime,0,month}' IS DISTINCT FROM '2026-09-01'
    OR (snapshot#>>'{late_overtime,0,hours}')::numeric IS DISTINCT FROM 2
    OR (snapshot#>>'{late_overtime,0,amount}')::numeric IS DISTINCT FROM 45.00
    OR (snapshot->>'net')::numeric IS DISTINCT FROM 4545.00
 THEN RAISE EXCEPTION 'Prepared payslip did not preserve settled previous-period overtime: %',snapshot; END IF;
 RAISE NOTICE 'T20-RENTAL-PAYSLIP %',jsonb_build_object('id',prepared->'id','employee',980002,'pay_month',snapshot->'month',
   'late_overtime',snapshot->'late_overtime','net',snapshot->'net','state','prepared');
END $$;

DO $$
DECLARE rental bigint:=current_setting('erp.t20_rental')::bigint; work bigint:=current_setting('erp.t20_rental_work')::bigint;
 assignment bigint:=current_setting('erp.t20_rental_b')::bigint; previous_candidate bigint:=current_setting('erp.t20_rental_candidate')::bigint;
 original_usage bigint; queue jsonb; revised_candidate bigint; witness record; revision jsonb;
BEGIN
 PERFORM pg_temp.t06_actor(1);
 PERFORM public.f07_change_document_version(990203,990212,'promote',990203);
 SELECT (v->>'id')::bigint INTO STRICT original_usage FROM jsonb_array_elements(public.t07_fleet_operation_detail(rental)->'usage') v
 WHERE v->>'evidence_current'='false';
 PERFORM pg_temp.t07_command(rental,'resolve-sheet',jsonb_build_object('assignment',assignment,'usage',original_usage,
   'evidence','{"document":990203,"version":990212,"file":990212,"reference":"T20-LATE-SIGNED"}'::jsonb));
 PERFORM pg_temp.t06_actor(7);
 PERFORM pg_temp.t08_review(rental,work);
 PERFORM pg_temp.t06_actor(2);
 queue:=pg_temp.t08_queue('2026-09-17',work);
 revision:=public.t08_payroll_review(pg_temp.t06_op(2060),work,queue->>'digest','Revised evidence for the same already settled interval');
 revised_candidate:=(revision->>'id')::bigint;
 IF revised_candidate IS NULL OR revised_candidate=previous_candidate
 THEN RAISE EXCEPTION 'Evidence revision did not retain a distinct source record: %',revision; END IF;
 PERFORM set_config('erp.t20_rental_revised_candidate',revised_candidate::text,true);
 RESET ROLE;
 SELECT b.id AS approval_line,l.id AS payroll_line,b.span AS settled_span,
        (SELECT count(*) FROM erp_private.t16_payment_allocations WHERE line_id=l.id AND amount=45.00) AS allocations
 INTO STRICT witness
 FROM erp_private.t15_reserved_lines b JOIN erp_private.t14_lines l ON l.id=b.line_id
 WHERE b.employee_id=980002 AND b.released_at IS NULL AND b.category='fleet-overtime' AND l.source->>'work'=work::text;
 IF witness.allocations IS DISTINCT FROM 1::bigint
    OR witness.settled_span IS DISTINCT FROM '{["2026-09-17 16:00+04","2026-09-17 18:00+04")}'::tstzmultirange
    OR NOT EXISTS(SELECT 1 FROM erp_private.fleet_operation_assignments
       WHERE id=assignment AND supersedes_id=current_setting('erp.t20_rental_a')::bigint AND worker_id=980002)
    OR NOT EXISTS(SELECT 1 FROM erp_private.fleet_rental_usage u JOIN erp_private.fleet_operation_evidence e ON e.id=u.evidence_id
       JOIN public.dms_document_files f ON f.id=e.file_id
       WHERE u.id=original_usage AND u.assignment_id=assignment AND u.state='signed'
         AND e.document_id=990203 AND e.version_id=990203 AND e.file_id=990203 AND f.sha256_hash=repeat('a',64)
         AND e.recorded_at>'2026-09-30 23:59+04'::timestamptz)
    OR NOT EXISTS(SELECT 1 FROM erp_private.fleet_rental_usage
       WHERE assignment_id=assignment AND state='disputed' AND reason LIKE 'Supervisor daily record%')
    OR (SELECT count(*) FROM erp_private.fleet_rental_usage_resolutions x
         JOIN erp_private.fleet_rental_usage u ON u.id=x.usage_id WHERE u.assignment_id=assignment) IS DISTINCT FROM 2::bigint
 THEN RAISE EXCEPTION 'Stable paid identity, source or original dispute history was lost: %',witness; END IF;
 RAISE NOTICE 'T20-RENTAL-RETENTION %',jsonb_build_object('original_document',990203,'original_version',990203,'original_file',990203,
    'amended_version',990212,'retained_disputed_history',true,'original_candidate',previous_candidate,'later_candidate',revised_candidate,
    'exclusive_paid_line',to_jsonb(witness));
END $$;

DO $$
DECLARE
 work bigint:=current_setting('erp.t20_rental_work')::bigint;
 next_month constant date:='2026-11-01';
 fleet_projection jsonb; payroll jsonb; detail jsonb; next_approval jsonb;
 pay_amount numeric; paid_line_count bigint;
BEGIN
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(2);
 SELECT v INTO fleet_projection FROM jsonb_array_elements(public.t08_fleet_payroll_candidates(920001,statement_timestamp())) v
 WHERE v->>'id'=current_setting('erp.t20_rental_revised_candidate');
 IF fleet_projection IS NOT NULL OR pg_temp.t08_queue('2026-09-17',work)->>'status' IS DISTINCT FROM 'already-paid' THEN
   RAISE EXCEPTION 'B02 refiled settled work remains available or lacks its paid label: %',fleet_projection;
 END IF;
 payroll:=public.t14_payroll_command(pg_temp.t06_op(2070),920001,920011,'calculate',
   jsonb_build_object('month',next_month,'cutoff',to_char(statement_timestamp() AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US')||'Z',
    'expected_version',NULL,'reason','Synthetic next cycle after evidence revision'));
 detail:=public.t14_payroll_workspace(920001,920011,next_month,(payroll->>'version')::uuid,980002)->'detail';
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(detail->'lines') v WHERE v->>'category'='fleet-overtime') THEN
   RAISE EXCEPTION 'Revised evidence generated a second payroll earning: %',detail;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(detail->'exceptions') e
   WHERE e->>'code'='fleet-overtime-already-paid' AND e#>>'{source,work}'=work::text)
   OR EXISTS(SELECT 1 FROM jsonb_array_elements(detail->'exceptions') e
   WHERE e->>'code'='source-in-another-draft' AND e#>>'{source,work}'=work::text) THEN
   RAISE EXCEPTION 'B02 settled refile was mislabeled in the next payroll: %',detail->'exceptions';
 END IF;
 SELECT sum((v->>'amount')::numeric) INTO pay_amount FROM jsonb_array_elements(detail->'lines') v;
 IF pay_amount IS DISTINCT FROM 4500::numeric THEN RAISE EXCEPTION 'Next-month salary changed after revision: %',detail; END IF;
 next_approval:=pg_temp.t20_rental_approve(payroll,2071);
 RESET ROLE;
 SELECT count(*) INTO paid_line_count FROM erp_private.t15_reserved_lines r JOIN erp_private.t14_lines l ON l.id=r.line_id
 WHERE r.employee_id=980002 AND r.released_at IS NULL AND r.category='fleet-overtime' AND l.source->>'work'=work::text;
 IF paid_line_count IS DISTINCT FROM 1::bigint THEN
   RAISE EXCEPTION 'Later approval created a second reservation for the same rental work';
 END IF;
 RAISE NOTICE 'T20-RENTAL-REPLAY %',jsonb_build_object('work',work,'next_payroll_month',next_month,
    'next_payroll_approval',next_approval,'next_payroll_fleet_overtime',0,'original_overtime_approval_line_count',paid_line_count,
    'next_payroll_exceptions',detail->'exceptions',
    'fleet_candidate_projection',jsonb_build_object('visible',fleet_projection IS NOT NULL,'minutes',fleet_projection->'minutes',
       'amount',fleet_projection->'amount'));
END $$;

SELECT 'PASS: T20 rental settlement and next approved payroll exclusion after evidence revision';
ROLLBACK;
