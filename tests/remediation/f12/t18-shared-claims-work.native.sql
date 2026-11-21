-- Run after the synthetic T14 calculations and before their T15 approval.
RESET ROLE;
DO $$
DECLARE
 worker bigint:=980001;
 exit_day date:='2026-11-05';
 cutoff timestamptz:='2026-11-20 19:00:00Z';
 v uuid:=gen_random_uuid();
 d text:=repeat('1',64);
 opener bigint:=pg_temp.t08_profile(1);
 gm bigint:=pg_temp.t08_profile(4);
 job erp_private.t03_employment_periods;
 line erp_private.t14_lines;
 exit_id bigint;
 line_id uuid;
 candidate bigint;
 alias_id bigint;
 span tstzmultirange;
 unaffected tstzmultirange:='{["2040-12-31 04:00:00+00","2040-12-31 05:00:00+00")}'::tstzmultirange;
BEGIN
 PERFORM set_config('request.jwt.claims','{}',true);
 SELECT * INTO STRICT job FROM erp_private.t03_employment_periods e
 WHERE e.employee_id=worker AND e.work_period@>exit_day;
 SELECT l.* INTO STRICT line
 FROM erp_private.t14_lines l JOIN erp_private.t14_versions v ON v.id=l.version_id
 JOIN erp_private.t14_runs r ON r.id=v.run_id AND r.company_id=job.company_id AND r.branch_id=job.branch_id
 WHERE l.employee_id=worker AND l.category='fleet-overtime' AND l.original_on<=exit_day
 AND (l.source->>'employment')::bigint=job.id AND l.amount>0 ORDER BY v.number DESC LIMIT 1;
 candidate:=(line.source->>'candidate')::bigint;
 alias_id:=(line.source->>'alias')::bigint;
 span:=(line.source->>'interval')::tstzmultirange;
 IF erp_private.t18_other_payroll_line(worker,to_jsonb(line))->>'state'<>'unclaimed' THEN
   RAISE EXCEPTION 'Synthetic Fleet work should be unreserved before its monthly review';
 END IF;
 -- Roll back this branch before the same verified input is used by the T15/T16 fixture.
 BEGIN
   INSERT INTO public.employee_eos_cases(employee_id,eos_type,employment_end_date,last_working_date,created_by,updated_by)
   VALUES(worker,'resignation',exit_day,exit_day,opener,opener) RETURNING id INTO exit_id;
   INSERT INTO erp_private.t18_cases(eos_id,employee_id,employment_id,company_id,branch_id,last_day,last_working_day,opened_by)
   VALUES(exit_id,worker,job.id,job.company_id,job.branch_id,exit_day,exit_day,opener);
   INSERT INTO erp_private.t18_versions(id,eos_id,number,cutoff,digest,facts,policy,gross,deductions,currency,calc_by,reason)
   VALUES(v,exit_id,1,cutoff,d,'{}','{}',line.amount,0,'AED',opener,'Synthetic payable Fleet source');
   INSERT INTO erp_private.t18_lines(version_id,key,category,kind,amount,currency,quantity,unit,rate,original_on,available_at,source,reason)
   VALUES(v,line.key,line.category,line.kind,line.amount,line.currency,line.quantity,line.unit,line.rate,
       line.original_on,line.available_at,line.source,line.reason) RETURNING id INTO line_id;
   INSERT INTO erp_private.t18_approvals(eos_id,version_id,digest,decided_by) VALUES(exit_id,v,d,gm);
   IF erp_private.t18_reserve(v)<>1 OR erp_private.t18_reserve(v)<>1 THEN
     RAISE EXCEPTION 'The Fleet source was not reserved exactly once';
   END IF;
   IF erp_private.t18_monthly_unclaimed_work(worker,span+unaffected) IS DISTINCT FROM unaffected
      OR erp_private.t18_monthly_unclaimed_work(980002,span+unaffected) IS DISTINCT FROM
        erp_private.t14_unclaimed_work(980002,span+unaffected)
      OR EXISTS(SELECT 1 FROM jsonb_array_elements(erp_private.t18_monthly_operational_sources(
           worker,job.company_id,job.branch_id,'2026-11-01',cutoff)->'lines') item
         WHERE item->>'key'=line.key)
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(erp_private.t18_monthly_operational_sources(
           980002,job.company_id,job.branch_id,'2026-11-01',cutoff)->'lines') item
         WHERE item->>'category'='fleet-overtime') THEN
     RAISE EXCEPTION 'Excluded payroll time leaked into the monthly reader or hid an unrelated employee or interval';
   END IF;
   IF erp_private.t18_exit_work_state(worker,to_jsonb(line))<>'exact'
     OR erp_private.t18_exit_work_state(worker,to_jsonb(line)||jsonb_build_object('amount',line.amount+.01))<>'overlap'
     OR erp_private.t18_exit_work_state(123456,to_jsonb(line))<>'free' THEN
     RAISE EXCEPTION 'Monthly exit work filter did not distinguish exact, altered and unclaimed sources';
   END IF;
   BEGIN
     INSERT INTO erp_private.t08_payable_claims(candidate_id,alias_id,employee_id,consumer_key,claimed,amount,currency)
     VALUES(candidate,alias_id,worker,gen_random_uuid(),span,line.amount,line.currency);
     RAISE EXCEPTION 'Alternate consumer duplicated a reserved Fleet work interval';
   EXCEPTION WHEN SQLSTATE 'PT409' THEN
     IF SQLERRM NOT LIKE 'This work interval is reserved for a different exact final settlement%' THEN RAISE; END IF;
   END;
   BEGIN
     INSERT INTO erp_private.t08_payable_claims(candidate_id,alias_id,employee_id,consumer_key,claimed,amount,currency)
     VALUES(candidate,alias_id,worker,line_id,span,line.amount+1,line.currency);
     RAISE EXCEPTION 'Exact owner accepted altered Fleet amount';
   EXCEPTION WHEN SQLSTATE 'PT409' THEN
     IF SQLERRM NOT LIKE 'This work interval is reserved for a different exact final settlement%' THEN RAISE; END IF;
   END;
   INSERT INTO erp_private.t08_payable_claims(candidate_id,alias_id,employee_id,consumer_key,claimed,amount,currency)
   VALUES(candidate,alias_id,worker,line_id,span,line.amount,line.currency);
   BEGIN
     PERFORM erp_private.t18_release(v,'Invalid release of canonically claimed Fleet time');
     RAISE EXCEPTION 'Canonical claims lost their protection after a release';
   EXCEPTION WHEN SQLSTATE 'PT409' THEN
     IF SQLERRM NOT LIKE 'Canonical final settlement claims already exist%' THEN RAISE; END IF;
   END;
   IF (SELECT count(*) FROM erp_private.t08_payable_claims WHERE consumer_key=line_id)<>1 THEN
     RAISE EXCEPTION 'Exact Fleet lineage was lost or duplicated';
   END IF;
   RAISE EXCEPTION 'Rollback isolated early exit scenario' USING ERRCODE='T1800';
 EXCEPTION WHEN SQLSTATE 'T1800' THEN NULL;
 END;
 RAISE NOTICE 'PASS: canonical verified Fleet time accepted only exact approved exit line; duplicates and post-claim release blocked, while the monthly reader retained unrelated time and workers.';
END $$;
