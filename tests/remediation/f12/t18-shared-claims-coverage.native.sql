-- Source alongside the T16 synthetic rollback fixture. This helper can also
-- bracket individual receipts, allocations and reversals within that fixture.
CREATE FUNCTION pg_temp.t18_assert_monthly(p_employee bigint,p_state text,p_status text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
 version uuid:=current_setting('erp.t16_version')::uuid;
 employment bigint;
 result jsonb;
 prior jsonb;
 expected_coverage daterange;
 work_line erp_private.t14_lines;
BEGIN
 SELECT employment_ids[1] INTO STRICT employment FROM erp_private.t14_results r
 WHERE r.version_id=version AND r.employee_id=p_employee;
 result:=erp_private.t18_monthly_payroll_status(employment,p_employee,'2026-11-01');
 prior:=erp_private.t18_prior_payroll_holds(employment,p_employee,'2026-12-01');
 IF result->>'state' IS DISTINCT FROM p_state
    OR result#>>'{settlements,0,status}' IS DISTINCT FROM p_status
    OR (jsonb_array_length(prior)=0) IS DISTINCT FROM (p_state='settled') THEN
   RAISE EXCEPTION 'Unexpected T18 classification for employee %, expected %/%, found % with older holds %',
      p_employee,p_state,p_status,result,prior;
 END IF;
 SELECT e.work_period * daterange('2026-11-01','2026-12-01','[)') INTO STRICT expected_coverage
 FROM erp_private.t03_employment_periods e WHERE e.id=employment;
 IF p_state='settled' AND (result#>>'{settlements,0,coverage_from}' IS DISTINCT FROM lower(expected_coverage)::text
      OR result#>>'{settlements,0,coverage_until}' IS DISTINCT FROM upper(expected_coverage)::text) THEN
   RAISE EXCEPTION 'Reconciled payroll must report exact basic salary coverage: %',result;
 END IF;
 IF erp_private.t18_monthly_payroll_status(employment,123456,'2026-11-01')->>'state' IS DISTINCT FROM 'unclaimed' THEN
   RAISE EXCEPTION 'Other employee received the paid monthly coverage';
 END IF;
 SELECT l.* INTO STRICT work_line FROM erp_private.t14_lines l
 WHERE l.version_id=version AND l.employee_id=p_employee AND l.category='fleet-overtime' LIMIT 1;
 IF erp_private.t18_other_payroll_line(p_employee,to_jsonb(work_line))->>'state' IS DISTINCT FROM p_state
    OR erp_private.t18_other_payroll_line(p_employee,to_jsonb(work_line)||jsonb_build_object('amount',work_line.amount+.01))->>'state'<>'held'
    OR erp_private.t18_other_payroll_line(p_employee,to_jsonb(work_line)||jsonb_build_object('key','different-key-same-work')) ->>'state'<>'held'
    OR erp_private.t18_other_payroll_line(123456,to_jsonb(work_line))->>'state'<>'unclaimed' THEN
   RAISE EXCEPTION 'Monthly work classification lost exact line facts, interval or subject scope';
 END IF;
 RAISE NOTICE 'PASS: monthly employee % T18 state % (%).',p_employee,p_state,p_status;
END $$;
