DO $$ BEGIN
 IF current_database() NOT IN ('t18_calc_work','t18_native_work','t18_exact_replay','t00_clean')
    OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
       IS DISTINCT FROM 'Isolated HR T00 20261119'
    OR current_setting('cron.launch_active_jobs') IS DISTINCT FROM 'off' THEN
  RAISE EXCEPTION 'Marked isolated T18 database required';
 END IF;
 IF to_regprocedure('public.t18_settlement_policy(uuid,bigint,bigint,text,jsonb)') IS NULL THEN
  RAISE EXCEPTION 'T18 calculation boundary is unavailable';
 END IF;
END $$;

-- Append in the guarded T07/T08/T14/T16 synthetic transaction before monthly approval.
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
INSERT INTO public.roles(role_code,role_name,is_system_role) VALUES
 ('t18_calc_accounts','Synthetic final settlement Accounts',false),
 ('t18_calc_hr','Synthetic final settlement HR',false),
 ('t18_calc_gm','Synthetic final settlement GM',false);
INSERT INTO public.role_permissions(role_id,permission_id)
SELECT r.id,p.id FROM (VALUES
 ('t18_calc_accounts','hr.exit.settlement.accounts'),
 ('t18_calc_hr','hr.exit.settlement.hr'),
 ('t18_calc_gm','hr.exit.settlement.approve')) authority(role,cap)
 JOIN public.roles r ON r.role_code=authority.role
 JOIN public.permissions p ON p.permission_code=ANY(ARRAY[authority.cap,'hr.exit.settlement.view','hr.payroll.view',
   'hr.eos.view','dms.documents.view','dms.documents.preview','dms.documents.view.finance']);
INSERT INTO public.user_roles(user_profile_id,role_id,owner_company_id,branch_id,is_active)
SELECT pg_temp.t08_profile(a.actor),r.id,a.company,a.branch,true
FROM (VALUES (2,'t18_calc_accounts',920001,920011),(2,'t18_calc_gm',920001,920011),(2,'t18_calc_hr',920001,920011),
 (4,'t18_calc_hr',920001,920011),(7,'t18_calc_gm',920001,920011),(6,'t18_calc_accounts',920001,920012)
) a(actor,role,company,branch) JOIN public.roles r ON r.role_code=a.role;

INSERT INTO public.employee_eos_cases(id,employee_id,eos_type,case_status,last_working_date,reason)
 OVERRIDING SYSTEM VALUE VALUES(997180,980001,'termination','clearance_in_progress','2026-11-05','Synthetic calculation verification');
INSERT INTO erp_private.t18_cases(eos_id,employee_id,employment_id,company_id,branch_id,last_day,last_working_day,opened_by)
 SELECT 997180,e.employee_id,e.id,e.company_id,e.branch_id,'2026-11-05','2026-11-05',pg_temp.t08_profile(4)
 FROM erp_private.t03_employment_periods e WHERE e.employee_id=980001 AND e.work_period @> '2026-11-05'::date;

DO $$
DECLARE exit_case erp_private.t18_cases; first_setup bigint; opening_setup bigint; leave_period bigint;
 valid_fund bigint; expired_fund bigint; reserve bigint; paid_work bigint:=current_setting('erp.t08_work')::bigint;
 policy_result jsonb; adjustment jsonb; receipt jsonb; basis jsonb; expected_service_days int;
 operation uuid:=gen_random_uuid(); approval_op uuid:=gen_random_uuid(); adjustment_op uuid:=gen_random_uuid();
 policy_request jsonb:='{"from":"2026-10-01","until":"2026-12-01","reason":"Synthetic exit company decision","facts":{
   "proration":"calendar-days","absence":"unpaid-only","leave_wage_basis":"basic","leave_cashout":"current-and-approved-carry",
   "leave_cashout_divisor":30,"daily_recovery_basis":"basic","recovery_fraction":0.2,"net_floor":0,
   "payment_channels":["exit-cheque","exit-bank-transfer"],"benefit":{"mode":"tiered-basic","service":"current-period",
    "exit_types":["termination"],"minimum_days":100,"first_band_years":1,"first_days_per_year":10,"later_days_per_year":12,
    "day_divisor":30,"year_divisor":365,"cap_days":30,"exclude_unpaid":true}}}';
 adjustment_request jsonb:='{"kind":"earning","amount":15.25,"currency":"AED","document":995143,"version":995143,"file":995143,
    "reason":"Documented verified synthetic adjustment"}';
 approval_request jsonb;
BEGIN
 SELECT * INTO STRICT exit_case FROM erp_private.t18_cases WHERE eos_id=997180;
 expected_service_days:='2026-11-06'::date-'2024-01-01'::date;
 IF has_function_privilege('anon','public.t18_settlement_policy(uuid,bigint,bigint,text,jsonb)','EXECUTE')
    OR has_function_privilege('authenticated','erp_private.t18_pay_basis(erp_private.t18_cases,timestamptz)','EXECUTE')
    OR has_table_privilege('authenticated','erp_private.t18_exit_adjustments','SELECT') THEN
  RAISE EXCEPTION 'Private final settlement values or policy commands are exposed';
 END IF;
 basis:=erp_private.t18_pay_basis(exit_case,clock_timestamp());
 IF basis#>>'{issues,0,code}' IS DISTINCT FROM 'exit-policy-missing' THEN
  RAISE EXCEPTION 'No employer settlement policy was required: %',basis;
 END IF;
 INSERT INTO erp_private.t04_setup(kind,company_id,employee_id,facts,digest,proposed_by,approved_by,approved_at)
  VALUES('policy',920001,NULL,'{}',repeat('a',64),'98000000-0000-4000-8000-000000000002',
    '98000000-0000-4000-8000-000000000007','2026-01-01') RETURNING id INTO first_setup;
 INSERT INTO erp_private.t04_policies(id,company_id,effective,facts)
  VALUES(first_setup,920001,'[2026-01-01,2027-01-01)','{"service_basis":"actual","accrual":"daily"}');
 INSERT INTO erp_private.t04_setup(kind,company_id,employee_id,facts,digest,proposed_by,approved_by,approved_at)
  VALUES('opening',920001,980001,'{}',repeat('b',64),'98000000-0000-4000-8000-000000000002',
    '98000000-0000-4000-8000-000000000007','2026-11-05') RETURNING id INTO opening_setup;
 INSERT INTO erp_private.t04_periods(setup_id,employee_id,company_id,service_start,coverage,policy_id,cutoff,
    full_entitlement,opening_earned,opening_used,opening_sick)
  VALUES(opening_setup,980001,920001,'2024-01-01','[2026-01-01,2027-01-01)',first_setup,'2026-11-05',30,8,3,0)
  RETURNING id INTO leave_period;
 INSERT INTO erp_private.f12_leave_movements(employee_id,period_start,period_end,days,effect,source_operation,actor,
      event_key,movement_version,entitlement_id,expires_before,created_at)
  VALUES(980001,'2026-01-01','2026-12-31',2,'carry-in',gen_random_uuid(),'98000000-0000-4000-8000-000000000002',
    't18-test-carry-valid',2,leave_period,'2026-11-06','2026-11-05') RETURNING id INTO valid_fund;
 INSERT INTO erp_private.f12_leave_movements(employee_id,period_start,period_end,days,effect,source_operation,actor,
      event_key,movement_version,entitlement_id,expires_before,created_at)
  VALUES(980001,'2026-01-01','2026-12-31',1,'carry-in',gen_random_uuid(),'98000000-0000-4000-8000-000000000002',
    't18-test-carry-expired',2,leave_period,'2026-11-05','2026-11-05') RETURNING id INTO expired_fund;

 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t06_actor(8);
 BEGIN
  PERFORM public.t18_settlement_policy(operation,920001,920011,'propose',policy_request);
  RAISE EXCEPTION 'Global system role acquired exit policy authority'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(6);
 BEGIN
  PERFORM public.t18_settlement_policy(operation,920001,920011,'propose',policy_request);
  RAISE EXCEPTION 'Sibling branch acquired exit policy authority'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(2);
 BEGIN
  PERFORM public.t18_settlement_policy(operation,920001,920011,'propose',
    jsonb_set(policy_request,'{facts,payment_channels}','["cash"]'));
  RAISE EXCEPTION 'Unapproved payment channel accepted'; EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 policy_result:=public.t18_settlement_policy(operation,920001,920011,'propose',policy_request);
 IF public.t18_settlement_policy(operation,920001,920011,'propose',policy_request) IS DISTINCT FROM policy_result||'{"replayed":true}' THEN
  RAISE EXCEPTION 'Policy proposal retry changed the result';
 END IF;
 BEGIN
  PERFORM public.t18_settlement_policy(operation,920001,920011,'propose',policy_request||'{"reason":"Changed retry"}');
  RAISE EXCEPTION 'Changed policy retry accepted'; EXCEPTION WHEN SQLSTATE 'P0409' THEN NULL;
 END;
 approval_request:=jsonb_build_object('policy',policy_result->'id','digest',policy_result->'digest','reason','Synthetic policy approved');
 BEGIN
  PERFORM public.t18_settlement_policy(approval_op,920001,920011,'approve',approval_request);
  RAISE EXCEPTION 'Proposer approved own exit policy'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(7);
 BEGIN
  PERFORM public.t18_settlement_policy(approval_op,920001,920011,'approve',approval_request||jsonb_build_object('digest',repeat('0',64)));
  RAISE EXCEPTION 'Changed policy digest approved'; EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 receipt:=public.t18_settlement_policy(approval_op,920001,920011,'approve',approval_request);
 IF receipt->>'status'<>'approved' OR public.t18_settlement_policy(approval_op,920001,920011,'approve',approval_request)
   IS DISTINCT FROM receipt||'{"replayed":true}' THEN
  RAISE EXCEPTION 'Independent exact exit policy approval or retry failed';
 END IF;

 PERFORM pg_temp.t06_actor(2);
 BEGIN
  PERFORM public.t18_exit_adjustment(adjustment_op,997180,'propose',
    adjustment_request||'{"document":995142,"version":995142,"file":995142}');
  RAISE EXCEPTION 'Sibling adjustment evidence accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 adjustment:=public.t18_exit_adjustment(adjustment_op,997180,'propose',adjustment_request);
 IF public.t18_exit_adjustment(adjustment_op,997180,'propose',adjustment_request) IS DISTINCT FROM adjustment||'{"replayed":true}' THEN
  RAISE EXCEPTION 'Adjustment retry changed the result';
 END IF;
 approval_request:=jsonb_build_object('adjustment',adjustment->'id','digest',adjustment->'digest','reason','Synthetic evidence verified');
 BEGIN
  PERFORM public.t18_exit_adjustment(gen_random_uuid(),997180,'verify',approval_request);
  RAISE EXCEPTION 'Proposer verified own adjustment'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 PERFORM pg_temp.t06_actor(4);
 receipt:=public.t18_exit_adjustment(gen_random_uuid(),997180,'verify',approval_request);
 IF receipt->>'status' IS DISTINCT FROM 'verified' THEN RAISE EXCEPTION 'Independent adjustment verification failed'; END IF;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims','{}',true);

 basis:=erp_private.t18_pay_basis(exit_case,clock_timestamp());
 IF basis->>'currency' IS DISTINCT FROM 'AED'
    OR basis->'salary_claim_months' IS DISTINCT FROM '["2026-11-01"]'
    OR basis#>>'{policy,id}' IS DISTINCT FROM policy_result->>'id'
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(basis->'lines') l WHERE l->>'category'='basic'
      AND l->'source'->>'until'='2026-11-06' AND (l->>'amount')::numeric=666.67)
    OR (SELECT sum((l->>'amount')::numeric) FROM jsonb_array_elements(basis->'lines') l WHERE l->>'category'='leave-cashout') IS DISTINCT FROM 933.34
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(basis->'lines') l WHERE l->>'key'='exit-leave:'||leave_period||':'||expired_fund)
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(basis->'lines') l WHERE l->>'key'='exit-leave:'||leave_period||':'||valid_fund
      AND (l->'source'->>'eligible_days')::numeric=2)
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(basis->'lines') l WHERE l->>'category'='termination-benefit'
      AND (l->'source'->>'verified_service_days')::int=expected_service_days)
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(basis->'lines') l WHERE l->>'key' LIKE ('fleet-overtime:'||paid_work||':%')
      AND l->>'original_on'='2026-10-03' AND (l->>'amount')::numeric=30)
    OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(basis->'lines') l WHERE l->>'category'='exit-adjustment'
      AND l->'source'->>'checksum'=repeat('a',64) AND (l->>'amount')::numeric=15.25) THEN
   RAISE EXCEPTION 'Final salary, leave, benefit, late work or adjustment calculation differed: %',basis;
 END IF;
 INSERT INTO erp_private.t04_cases(employee_id,company_id,branch_id,employment_id,category,dates,revision,fingerprint,submitted_by)
  VALUES(980001,920001,920011,exit_case.employment_id,'annual','[2026-11-02,2026-11-03)',1,repeat('f',64),
   '98000000-0000-4000-8000-000000000004') RETURNING id INTO reserve;
 INSERT INTO erp_private.t04_days(case_id,employee_id,request_revision,day,policy_id,period_id,rate)
  VALUES(reserve,980001,1,'2026-11-02',first_setup,leave_period,1);
 basis:=erp_private.t18_pay_basis(exit_case,clock_timestamp());
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(basis->'issues') i WHERE i->>'code'='exit-leave-review-required' AND (i->>'blocking')::boolean)
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(basis->'lines') l WHERE l->>'category'='leave-cashout') THEN
  RAISE EXCEPTION 'Pending leave was valued for cashout: %',basis;
 END IF;
 DELETE FROM erp_private.t04_days WHERE case_id=reserve;
 DELETE FROM erp_private.t04_cases WHERE id=reserve;
 -- The following T16 fixture tests this reviewer without a finance document grant.
 DELETE FROM public.user_roles ur USING public.roles r
  WHERE r.id=ur.role_id AND r.role_code='t18_calc_hr' AND ur.user_profile_id=pg_temp.t08_profile(4);
 RAISE NOTICE 'T18 dated exit policy, scoped approvals, retries, prorated pay, funds, benefit, late earnings and retained adjustments passed';
END $$;
