-- Source after the T16 signed settlement fixture in the marked clone.
SELECT pg_temp.t18_assert_monthly(980001,'settled','reconciled');
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);
DO $$
DECLARE
 employee bigint:=980001;
 first_day date:='2026-10-01';
 last_day date:='2026-10-31';
 inactive_month date:='2026-11-01';
 op_cutoff timestamptz:='2026-11-20 19:00:00+00';
 version uuid:='00000000-0018-4000-8000-000000000001';
 monthly_review uuid:='00000000-0018-4000-8000-000000000002';
 approval uuid:='00000000-0018-4000-8000-000000000003';
 duplicate_version uuid:=gen_random_uuid();
 digest text:=repeat('3',64);
 job erp_private.t03_employment_periods;
 prior_monthly uuid;
 monthly_basic erp_private.t14_lines;
 pending_eos bigint;
 case_id bigint;
 leave_policy bigint;
 opening bigint;
 leave_period bigint;
 request bigint;
 actor bigint:=pg_temp.t08_profile(1);
 gm bigint:=pg_temp.t08_profile(4);
 retries integer;
 released_count integer;
 fresh jsonb;
 receipt jsonb;
 submit_inputs jsonb;
 fresh_version uuid;
 fresh_review uuid;
 work_run uuid;
 proof jsonb;
 adjustments jsonb;
BEGIN
 SELECT * INTO STRICT job FROM erp_private.t03_employment_periods e WHERE e.employee_id=employee AND e.work_period@>last_day;
 SELECT v.id INTO STRICT prior_monthly FROM erp_private.t14_runs r JOIN erp_private.t14_versions v ON v.run_id=r.id
 WHERE r.company_id=job.company_id AND r.branch_id=job.branch_id AND r.month=first_day
 ORDER BY v.number DESC LIMIT 1;
 SELECT * INTO STRICT monthly_basic FROM erp_private.t14_lines l
 WHERE l.version_id=prior_monthly AND l.employee_id=employee AND l.category='basic' AND l.amount>0 LIMIT 1;

 INSERT INTO public.employee_eos_cases(employee_id,eos_type,employment_end_date,last_working_date,created_by,updated_by)
 VALUES(employee,'resignation','2026-11-05','2026-11-05',actor,actor) RETURNING id INTO pending_eos;
 INSERT INTO erp_private.t18_cases(eos_id,employee_id,employment_id,company_id,branch_id,last_day,last_working_day,opened_by)
 VALUES(pending_eos,employee,job.id,job.company_id,job.branch_id,'2026-11-05','2026-11-05',actor);
 INSERT INTO erp_private.t18_versions(id,eos_id,number,cutoff,digest,facts,policy,salary_claim_months,gross,deductions,currency,calc_by,reason)
 VALUES(duplicate_version,pending_eos,1,op_cutoff,digest,'{}','{}',ARRAY[inactive_month],0,0,'AED',actor,'Duplicate paid salary');
 BEGIN
   PERFORM erp_private.t18_reserve(duplicate_version);
   RAISE EXCEPTION 'Approval reserved salary already settled by WPS';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN
   IF SQLERRM NOT LIKE 'Final-month salary already has%' THEN RAISE; END IF;
 END;

 INSERT INTO public.employee_eos_cases(employee_id,eos_type,employment_end_date,last_working_date,created_by,updated_by)
 VALUES(employee,'resignation',last_day,last_day,actor,actor) RETURNING id INTO case_id;
 INSERT INTO erp_private.t18_cases(eos_id,employee_id,employment_id,company_id,branch_id,last_day,last_working_day,opened_by)
 VALUES(case_id,employee,job.id,job.company_id,job.branch_id,last_day,last_day,actor);
 INSERT INTO erp_private.t04_setup(kind,company_id,employee_id,facts,digest,proposed_by)
 VALUES('policy',job.company_id,employee,'{"accrual":"daily"}',digest,gen_random_uuid()) RETURNING id INTO leave_policy;
 INSERT INTO erp_private.t04_policies(id,company_id,employee_id,effective,facts)
 VALUES(leave_policy,job.company_id,employee,daterange('2026-01-01','2027-01-01','[)'), '{"accrual":"daily"}');
 INSERT INTO erp_private.t04_setup(kind,company_id,employee_id,facts,digest,proposed_by)
 VALUES('opening',job.company_id,employee,'{}',digest,gen_random_uuid()) RETURNING id INTO opening;
 INSERT INTO erp_private.t04_periods(setup_id,employee_id,company_id,service_start,coverage,policy_id,cutoff,
      full_entitlement,opening_earned,opening_used,opening_sick)
 VALUES(opening,employee,job.company_id,'2026-01-01',daterange('2026-01-01','2027-01-01','[)'),leave_policy,last_day,30,10,0,0)
 RETURNING id INTO leave_period;
 INSERT INTO erp_private.t04_cases(employee_id,company_id,branch_id,employment_id,category,dates,fingerprint,submitted_by)
 VALUES(employee,job.company_id,job.branch_id,job.id,'annual',daterange('2026-10-28','2026-10-29','[)'),digest,gen_random_uuid())
 RETURNING id INTO request;
 INSERT INTO erp_private.t18_versions(id,eos_id,number,cutoff,digest,facts,policy,salary_claim_months,gross,deductions,currency,calc_by,reason)
 VALUES(version,case_id,1,op_cutoff,digest,'{}','{}',ARRAY[first_day],
       monthly_basic.amount+100,0,'AED',actor,'Synthetic final payroll claims');
 INSERT INTO erp_private.t18_lines(version_id,key,category,kind,amount,currency,quantity,unit,rate,original_on,available_at,source,reason)
 SELECT version,l.key,l.category,l.kind,l.amount,l.currency,l.quantity,l.unit,l.rate,l.original_on,l.available_at,l.source,l.reason
 FROM erp_private.t14_lines l WHERE l.id=monthly_basic.id;
 INSERT INTO erp_private.t18_lines(version_id,key,category,kind,amount,currency,quantity,unit,rate,original_on,available_at,source,reason)
 VALUES(version,'exit-leave:'||leave_period||':0','leave-cashout','earning',100,'AED',10,'day',10,
        last_day,op_cutoff,jsonb_build_object('period_id',leave_period,'fund_id',null,'employment',job.id,'eligible_days',10),
        'Synthetic exact fund cash-out');
 INSERT INTO erp_private.t18_approvals(id,eos_id,version_id,digest,decided_by)
 VALUES(approval,case_id,version,digest,gm);

 IF current_setting('erp.t18_claim_setup_only',true)='on' THEN
   RAISE NOTICE 'Fixture exit % and monthly % are ready for concurrent reservation.',version,prior_monthly;
   RETURN;
 END IF;
 retries:=erp_private.t18_reserve(version);
 IF retries<>2
    OR erp_private.t18_reserve(version)<>retries
    OR (SELECT count(*) FROM erp_private.t18_claim_reservations WHERE version_id=version AND released_at IS NULL)<>1
    OR (SELECT count(*) FROM erp_private.t18_reserved_sources WHERE version_id=version AND released_at IS NULL)<>retries+1 THEN
   RAISE EXCEPTION 'Exact final settlement retry duplicated or lost its line or employment reservations';
 END IF;
 PERFORM set_config('TimeZone','Asia/Dubai',true);
 PERFORM erp_private.t18_assert_monthly_coverage(version);
 PERFORM set_config('TimeZone','UTC',true);
 BEGIN
   PERFORM erp_private.t15_reserve_approval(monthly_review,prior_monthly);
   RAISE EXCEPTION 'Monthly approved the salary after an exit reserved it';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN
   IF SQLERRM NOT LIKE 'This source is reserved by an approved final settlement%' THEN RAISE; END IF;
 END;

 -- The regular public workflows must still approve payroll for the other
 -- worker in the branch after the exit claims the first worker's exact salary.
 BEGIN
   SELECT run_id INTO STRICT work_run FROM erp_private.t14_versions WHERE id=prior_monthly;
   proof:=pg_temp.t16_proof(998603);
   INSERT INTO erp_private.t14_adjustments(run_id,employee_id,original_line_id,source_key,kind,amount,currency,
       document_id,version_id,file_id,proposed_by,reason,decision,decided_by,decided_at,decision_reason)
   VALUES(work_run,employee,monthly_basic.id,monthly_basic.key,'earning',10,'AED',
     (proof->>'document')::bigint,(proof->>'version')::bigint,(proof->>'file')::bigint,
     actor,'A predecessor draft correction','verified',gm,op_cutoff,'Approved original correction');
   adjustments:=erp_private.t14_adjustment_basis(work_run,employee,'[]',op_cutoff);
   IF adjustments->'lines'<>'[]' OR adjustments#>>'{exceptions,0,code}'<>'adjustment-source-in-exit'
      OR adjustments#>>'{exceptions,0,blocking}'<>'false' THEN
     RAISE EXCEPTION 'The regular monthly drafts did not preserve separate review of a correction linked to the moved salary';
   END IF;
   SET LOCAL ROLE authenticated;
   PERFORM pg_temp.t06_actor(2);
   fresh:=public.t14_payroll_command(gen_random_uuid(),job.company_id,job.branch_id,'calculate',
       jsonb_build_object('month',first_day,'expected_version',prior_monthly,'cutoff',
          '2026-10-31T23:59:00+04:00','reason','Recalculate monthly payroll after approved exit'));
   fresh_version:=(fresh->>'version')::uuid;
   submit_inputs:=jsonb_build_object('run',fresh->>'run','version',fresh->>'version','digest',fresh->>'digest',
       'reason','Approve monthly payroll for remaining employees','acknowledge_exceptions',true);
   receipt:=public.t15_payroll_review_command(gen_random_uuid(),job.company_id,job.branch_id,'submit',submit_inputs);
   fresh_review:=(receipt->>'review')::uuid;
   PERFORM pg_temp.t06_actor(7);
   receipt:=public.t15_payroll_review_command(gen_random_uuid(),job.company_id,job.branch_id,'approve',
       jsonb_build_object('review',fresh_review,'version',fresh_version,'digest',fresh->>'digest',
          'reason','Independent monthly GM approval for remaining employees'));
   RESET ROLE;
   IF receipt->>'state'<>'approved'
      OR EXISTS(SELECT 1 FROM erp_private.t14_lines l WHERE l.version_id=fresh_version AND l.employee_id=employee AND l.amount>0)
      OR NOT EXISTS(SELECT 1 FROM erp_private.t14_lines l WHERE l.version_id=fresh_version AND l.employee_id=980002 AND l.amount>0)
      OR EXISTS(SELECT 1 FROM erp_private.t15_reserved_lines l WHERE l.review_id=fresh_review AND l.source_key='employment:'||job.id||':'||first_day)
      OR NOT EXISTS(SELECT 1 FROM erp_private.t15_reserved_lines l WHERE l.review_id=fresh_review AND l.employee_id=980002 AND l.category='employment') THEN
     RAISE EXCEPTION 'New monthly calculation did not omit only the protected exit salary';
   END IF;
   PERFORM erp_private.t15_assert_reservations(fresh_review,fresh_version);
   RAISE EXCEPTION 'Rollback independent monthly compatibility scenario' USING ERRCODE='T1801';
 EXCEPTION WHEN SQLSTATE 'T1801' THEN NULL;
 END;
 RAISE NOTICE 'PASS: public T14 and T15 recalculate and approve the rest of the branch after an exit reserves salary.';

 BEGIN
   INSERT INTO erp_private.t04_days(case_id,employee_id,request_revision,day,policy_id,period_id,rate)
   VALUES(request,employee,1,'2026-10-28',leave_policy,leave_period,1);
   RAISE EXCEPTION 'Reserved leave could be spent on a newly requested vacation';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN
   IF SQLERRM NOT LIKE 'Annual leave fund is reserved%' THEN RAISE; END IF;
 END;
 BEGIN
   INSERT INTO erp_private.f12_leave_movements(employee_id,period_start,period_end,days,effect,source_operation,actor,
       event_key,movement_version,entitlement_id)
   VALUES(employee,'2026-01-01','2026-12-31',-1,'adjustment',gen_random_uuid(),gen_random_uuid(),
       't18-protected-leave-debit',2,leave_period);
   RAISE EXCEPTION 'An ordinary T04 fund adjustment spent a reserved cash-out fund';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN
   IF SQLERRM NOT LIKE 'Annual leave fund is reserved%' THEN RAISE; END IF;
 END;
 released_count:=erp_private.t18_release(version,'Independent revocation test');
 IF released_count<>retries
    OR erp_private.t18_release(version,'Independent revocation test')<>retries
    OR EXISTS(SELECT 1 FROM erp_private.t18_reserved_sources WHERE version_id=version AND released_at IS NULL) THEN
   RAISE EXCEPTION 'Release lost history or consumed duplicate reservations';
 END IF;
 BEGIN
   PERFORM erp_private.t18_assert_claims(version);
   RAISE EXCEPTION 'A revoked version retained payment authority';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 BEGIN
   PERFORM erp_private.t18_release(version,'Altered duplicate note');
   RAISE EXCEPTION 'A changed retry rewrote first release evidence';
 EXCEPTION WHEN SQLSTATE 'PT409' THEN NULL;
 END;
 INSERT INTO erp_private.t04_days(case_id,employee_id,request_revision,day,policy_id,period_id,rate)
 VALUES(request,employee,1,'2026-10-28',leave_policy,leave_period,1);
 IF erp_private.t15_reserve_approval(monthly_review,prior_monthly)<1 THEN
   RAISE EXCEPTION 'A retained but released exit claim blocked normal monthly payroll';
 END IF;
 RAISE NOTICE 'PASS: exit and monthly payroll conflict both ways, exact claim retries, annual fund protection, retained releases.';
END $$;
