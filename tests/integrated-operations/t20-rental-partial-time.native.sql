-- Run immediately before the October calculation in the guarded rental fixture.
DO $partial_time$
DECLARE
 candidate erp_private.t08_payable_candidates;
 work_id bigint:=current_setting('erp.t20_rental_work')::bigint;
 held tstzmultirange:='{["2026-09-17 16:00+04","2026-09-17 17:00+04")}';
 residual tstzmultirange:='{["2026-09-17 17:00+04","2026-09-17 18:00+04")}';
 other_run uuid;
 other_version uuid;
 other_line uuid;
 fixture_key text:='P4-PARTIAL-DRAFT';
 display jsonb;
 calculated jsonb;
 detail jsonb;
BEGIN
 BEGIN
   RESET ROLE;
   SELECT * INTO STRICT candidate FROM erp_private.t08_payable_candidates WHERE id=current_setting('erp.t20_rental_candidate')::bigint;
   INSERT INTO erp_private.t14_runs(company_id,branch_id,month)
   VALUES(920001,920011,'2026-12-01') RETURNING id INTO other_run;
   INSERT INTO erp_private.t14_versions(run_id,number,cutoff,source_digest,rule_digest,digest,totals,exception_count,calculated_by,reason)
   VALUES(other_run,1,statement_timestamp(),repeat('a',64),repeat('b',64),repeat('c',64),'[]',0,pg_temp.t08_profile(2),fixture_key)
   RETURNING id INTO other_version;
   INSERT INTO erp_private.t14_results(version_id,employee_id,employee_name,employment_ids,currency,gross,deductions,state,policy_snapshots,exceptions)
   VALUES(other_version,980002,'Synthetic driver',ARRAY[(candidate.facts->>'employment')::bigint],'AED',22.50,0,'ready','[]','[]');
   INSERT INTO erp_private.t14_lines(version_id,employee_id,key,category,kind,amount,currency,quantity,unit,rate,original_on,available_at,source,reason)
   VALUES(other_version,980002,fixture_key,'fleet-overtime','earning',22.50,'AED',1,'hour',22.50,'2026-09-17',candidate.available_at,
     jsonb_build_object('work',work_id,'interval',held::text),fixture_key) RETURNING id INTO other_line;
   INSERT INTO erp_private.t14_draft_usage(key,run_id,line_id,employee_id,span)
   VALUES(fixture_key,other_run,other_line,980002,held);
   SET LOCAL ROLE authenticated;
   PERFORM pg_temp.t06_actor(2);
   SELECT row INTO STRICT display FROM jsonb_array_elements(public.t08_fleet_payroll_candidates(920001,statement_timestamp())) row
   WHERE (row->>'id')::bigint=candidate.id;
   IF (display->>'periods')::tstzmultirange IS DISTINCT FROM residual OR (display->>'amount')::numeric IS DISTINCT FROM 22.50
      OR (display->>'minutes')::numeric IS DISTINCT FROM 60 THEN
     RAISE EXCEPTION 'Fleet did not preserve the true unheld portion: %',display; END IF;
   calculated:=public.t14_payroll_command(pg_temp.t06_op(2210),920001,920011,'calculate',jsonb_build_object(
      'month','2026-10-01','cutoff',statement_timestamp(),'expected_version',NULL,'reason','Synthetic partial Fleet time hold'));
   detail:=public.t14_payroll_workspace(920001,920011,'2026-10-01',(calculated->>'version')::uuid,980002)->'detail';
   IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(detail->'lines') l WHERE l->>'category'='fleet-overtime'
        AND (l#>>'{source,interval}')::tstzmultirange=residual AND (l->>'amount')::numeric=22.50 AND (l->>'quantity')::numeric=1)
      OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(detail->'exceptions') e WHERE e->>'code'='source-in-another-draft'
        AND (e#>>'{source,interval}')::tstzmultirange=held AND (e#>>'{source,work}')::bigint=work_id)
      OR (SELECT count(*) FROM jsonb_array_elements(detail->'lines') l WHERE l->>'category'='fleet-overtime')<>1 THEN
     RAISE EXCEPTION 'Payroll did not retain exact available and live-draft split: %',detail; END IF;
   RAISE EXCEPTION 'Rollback partial-time overlay' USING ERRCODE='ZP401';
 EXCEPTION WHEN SQLSTATE 'ZP401' THEN
   RAISE NOTICE 'PASS: B02 partial interval paid at original rate, live draft hold reported separately';
 END;
END $partial_time$;

