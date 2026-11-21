BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE INDEX t14_fleet_work_subject_day
 ON erp_private.t08_fleet_work(employer_company_id,employer_branch_id,employee_id,day);
CREATE INDEX t14_trip_allowance_subject_day
 ON erp_private.t09_allowance_versions(employer_id,employer_branch_id,employee_id,work_day);
CREATE INDEX t14_trip_assignments_payroll_subject
 ON erp_private.fleet_operation_assignments(employer_company_id,employer_branch_id,worker_id,id);
CREATE INDEX t14_trip_actual_assignment
 ON erp_private.fleet_trip_leg_actuals(assignment_id,departed_at) WHERE load='loaded';
CREATE INDEX t14_workshop_candidate_subject_day
 ON erp_private.t12_payroll_candidates(company_id,branch_id,employee_id,day);

CREATE FUNCTION erp_private.t14_unclaimed_work(p_employee bigint,p_ranges tstzmultirange)
RETURNS tstzmultirange LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p_ranges-coalesce((
   SELECT range_agg(span) FROM erp_private.t08_payable_claims c
   CROSS JOIN LATERAL unnest(c.claimed) span
   WHERE c.employee_id=p_employee AND c.claimed&&p_ranges
 ),'{}'::tstzmultirange);
$$;

CREATE FUNCTION erp_private.t14_operational_subjects(p_company bigint,p_branch bigint,p_month date,p_cutoff timestamptz)
RETURNS TABLE(employee_id bigint) LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT c.employee_id FROM erp_private.t08_fleet_work w
 JOIN erp_private.t08_payable_candidates c ON c.work_id=w.id
 WHERE w.employer_company_id=p_company AND w.employer_branch_id=p_branch
   AND w.day<(p_month+interval '1 month')::date AND c.available_at<=p_cutoff
   AND NOT isempty(erp_private.t14_unclaimed_work(c.employee_id,c.eligible))
 UNION
 SELECT c.employee_id FROM erp_private.t12_payroll_candidates c
 WHERE c.company_id=p_company AND c.branch_id=p_branch
   AND c.day<(p_month+interval '1 month')::date AND c.available_at<=p_cutoff
   AND NOT isempty(erp_private.t14_unclaimed_work(c.employee_id,c.eligible))
 UNION
 SELECT v.employee_id FROM erp_private.t09_allowance_versions v
 WHERE v.employer_id=p_company AND v.employer_branch_id=p_branch
   AND v.work_day<(p_month+interval '1 month')::date AND v.accepted_at<=p_cutoff
   AND NOT EXISTS(SELECT 1 FROM erp_private.t09_allowance_claims claimed
     WHERE claimed.version_id=v.id OR (v.kind='base' AND claimed.kind='base' AND claimed.actual_id=v.actual_id))
   AND NOT EXISTS(SELECT 1 FROM erp_private.t09_adjustment_withdrawals withdrawn WHERE withdrawn.version_id=v.id)
 UNION
 SELECT c.employee_id FROM erp_private.t12_payroll_candidates c
 JOIN erp_private.t08_payable_claims prior ON prior.workshop_candidate_id=c.id
 JOIN erp_private.t12_payroll_corrections correction ON correction.claim_id=prior.id
 WHERE c.company_id=p_company AND c.branch_id=p_branch AND c.day<(p_month+interval '1 month')::date
   AND correction.approved_by IS NOT NULL AND correction.withdrawn_at IS NULL AND correction.available_at<=p_cutoff
   AND NOT EXISTS(SELECT 1 FROM erp_private.t12_correction_claims claimed WHERE claimed.correction_id=correction.id);
$$;

CREATE FUNCTION erp_private.t14_operational_line(
 p_key text,p_category text,p_signed_amount numeric,p_currency text,p_quantity numeric,p_unit text,
 p_rate numeric,p_original date,p_available timestamptz,p_source jsonb,p_reason text
)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' SET timezone='UTC' AS $$
 SELECT jsonb_build_object('key',p_key,'category',p_category,
  'kind',CASE WHEN p_signed_amount<0 THEN 'deduction' ELSE 'earning' END,
  'amount',abs(p_signed_amount)::text,'currency',p_currency,'quantity',p_quantity,'unit',p_unit,
  'rate',p_rate,'original_on',p_original,'available_at',p_available,'source',p_source,'reason',p_reason);
$$;

CREATE FUNCTION erp_private.t14_operational_exception(p_code text,p_reason text,p_source jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('code',p_code,'reason',p_reason,'source',p_source,'blocking',false);
$$;

-- Independent operational review owns approval of an earning. The payroll
-- draft reads the accepted basis at its cutoff and keeps the canonical claim
-- inputs for the later approval transaction without consuming them here.
CREATE FUNCTION erp_private.t14_operational_sources(
 p_employee bigint,p_company bigint,p_branch bigint,p_month date,p_cutoff timestamptz
)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' SET timezone='UTC' AS $$
DECLARE
 stop_day date;
 work erp_private.t08_fleet_work;
 fleet_candidate erp_private.t08_payable_candidates;
 workshop_candidate erp_private.t12_payroll_candidates;
 trip_candidate erp_private.t09_allowance_versions;
 watched record;
 basis jsonb;
 fact jsonb;
 state text;
 description text;
 kind text;
 identity text;
 alias_id bigint;
 remaining tstzmultirange;
 piece tstzrange;
 lines jsonb:='[]'::jsonb;
 exceptions jsonb:='[]'::jsonb;
BEGIN
 IF p_month IS NULL OR NOT isfinite(p_month) OR extract(day FROM p_month)<>1
    OR p_cutoff IS NULL OR NOT isfinite(p_cutoff) THEN
  RAISE EXCEPTION 'Select the payroll month and a finite cutoff' USING ERRCODE='22023';
 END IF;
 stop_day:=(p_month+interval '1 month')::date;

 FOR work IN
  SELECT w.* FROM erp_private.t08_fleet_work w
  JOIN erp_private.t03_employment_periods e ON e.id=w.employment_id AND e.employee_id=w.employee_id
    AND e.company_id=w.employer_company_id AND e.branch_id=w.employer_branch_id AND e.work_period @> w.day
  WHERE w.employee_id=p_employee AND w.employer_company_id=p_company AND w.employer_branch_id=p_branch AND w.day<stop_day
  ORDER BY w.day,w.id
 LOOP
  IF isempty(erp_private.t14_unclaimed_work(p_employee,tstzmultirange(work.work_period))) THEN CONTINUE; END IF;
  basis:=erp_private.t08_source_basis(work.id);
  state:=coalesce(basis->>'status','unavailable');
  IF state='no-eligible-time' THEN CONTINUE; END IF;
  fact:=jsonb_build_object('work',work.id,'work_day',work.day,'order',work.order_id,'assignment',work.assignment_id,
    'employment',work.employment_id,'host_company',work.host_company_id);
  SELECT * INTO fleet_candidate FROM erp_private.t08_payable_candidates c
  WHERE c.work_id=work.id AND c.employee_id=p_employee AND c.digest=erp_private.t02_digest(basis)
    AND state='ready';
  IF fleet_candidate.id IS NOT NULL THEN
   remaining:=erp_private.t14_unclaimed_work(p_employee,fleet_candidate.eligible);
   IF isempty(remaining) THEN CONTINUE; END IF;
   IF fleet_candidate.available_at>p_cutoff THEN
    exceptions:=exceptions||jsonb_build_array(erp_private.t14_operational_exception('fleet-after-cutoff',
      'Fleet overtime was accepted after this cutoff.',fact||jsonb_build_object('available_at',fleet_candidate.available_at)));
    CONTINUE;
   END IF;
   SELECT a.id INTO alias_id FROM erp_private.t08_payable_aliases a
   WHERE a.work_id=work.id AND a.kind='fleet' AND a.source_id=work.id AND a.source_fingerprint=fleet_candidate.digest
     AND remaining<@a.covered;
   IF alias_id IS NULL THEN
    exceptions:=exceptions||jsonb_build_array(erp_private.t14_operational_exception('fleet-claim-basis',
      'Fleet overtime needs its exact reviewed claim reference.',fact));
    CONTINUE;
   END IF;
   fact:=fact||jsonb_build_object('candidate',fleet_candidate.id,'alias',alias_id,'digest',fleet_candidate.digest,
     'review',fleet_candidate.time_review_id,'attendance_link',fleet_candidate.attendance_link_id,
     'rule',fleet_candidate.rule_id,'rule_digest',basis->'rule_digest');
   FOR piece IN SELECT item FROM unnest(remaining) item ORDER BY item LOOP
    lines:=lines||jsonb_build_array(erp_private.t14_operational_line(
     'fleet-overtime:'||work.id||':'||piece::text,'fleet-overtime',
     erp_private.t08_range_amount(fleet_candidate.eligible,tstzmultirange(piece),fleet_candidate.rate),
     fleet_candidate.currency,erp_private.t08_minutes(tstzmultirange(piece))/60,'hour',fleet_candidate.rate,
     work.day,fleet_candidate.available_at,fact||jsonb_build_object('interval',tstzmultirange(piece)::text),fleet_candidate.reason));
   END LOOP;
  ELSIF work.entered_at<=p_cutoff THEN
   description:=CASE state
     WHEN 'awaiting-operations' THEN 'Fleet work is awaiting signed time or an independent Operations review.'
     WHEN 'awaiting-attendance' THEN 'Fleet work is awaiting confirmed HR attendance.'
     WHEN 'legacy-overtime-review' THEN 'A legacy overtime record needs reconciliation before Fleet time can be included.'
     WHEN 'overlap-held' THEN 'Conflicting work intervals need review.'
     WHEN 'ready' THEN 'The current Fleet pay basis is awaiting Accounts review.'
     ELSE 'Fleet overtime needs a verified employment, salary, schedule or overtime rule.'
    END;
   exceptions:=exceptions||jsonb_build_array(erp_private.t14_operational_exception('fleet-'||state,description,fact));
  END IF;
 END LOOP;

 FOR watched IN
  SELECT DISTINCT ON(v.line_id) v.id,v.line_id,v.day,v.period,v.entered_at,a.employment_id,a.job_id
  FROM erp_private.t12_labour_versions v
  JOIN erp_private.t12_labour_assignments a ON a.id=v.assignment_id AND a.employee_id=v.employee_id
  JOIN erp_private.t03_employment_periods e ON e.id=a.employment_id AND e.employee_id=v.employee_id AND e.work_period @> v.day
  WHERE v.employee_id=p_employee AND e.company_id=p_company AND e.branch_id=p_branch AND v.day<stop_day
    AND v.decision IS DISTINCT FROM 'rejected'
  ORDER BY v.line_id,v.id DESC
 LOOP
  IF isempty(erp_private.t14_unclaimed_work(p_employee,tstzmultirange(watched.period))) THEN CONTINUE; END IF;
  basis:=erp_private.t12_pay_basis(watched.id);
  state:=coalesce(basis->>'status','unavailable');
  IF state IN('voided','no-eligible-time') THEN CONTINUE; END IF;
  fact:=jsonb_build_object('labour_line',watched.line_id,'version',watched.id,'employment',watched.employment_id,
    'job',watched.job_id,'work_day',watched.day);
  SELECT * INTO workshop_candidate FROM erp_private.t12_payroll_candidates c
  WHERE c.version_id=watched.id AND c.employee_id=p_employee AND c.company_id=p_company AND c.branch_id=p_branch
    AND c.digest=erp_private.t02_digest(basis) AND state='ready';
  IF workshop_candidate.id IS NOT NULL THEN
   remaining:=erp_private.t14_unclaimed_work(p_employee,workshop_candidate.eligible);
   IF isempty(remaining) THEN CONTINUE; END IF;
   IF workshop_candidate.available_at>p_cutoff THEN
    exceptions:=exceptions||jsonb_build_array(erp_private.t14_operational_exception('workshop-after-cutoff',
      'Workshop labour was confirmed for payroll after this cutoff.',
      fact||jsonb_build_object('available_at',workshop_candidate.available_at)));
    CONTINUE;
   END IF;
   fact:=fact||jsonb_build_object('candidate',workshop_candidate.id,'digest',workshop_candidate.digest,
     'rule',basis->'rule','rule_digest',basis->'rule_digest');
   FOR piece IN SELECT item FROM unnest(remaining) item ORDER BY item LOOP
    lines:=lines||jsonb_build_array(erp_private.t14_operational_line(
     'workshop-overtime:'||watched.line_id||':'||piece::text,'workshop-overtime',
     erp_private.t08_range_amount(workshop_candidate.eligible,tstzmultirange(piece),workshop_candidate.rate),
     workshop_candidate.currency,erp_private.t08_minutes(tstzmultirange(piece))/60,'hour',workshop_candidate.rate,
     watched.day,workshop_candidate.available_at,fact||jsonb_build_object('interval',tstzmultirange(piece)::text),workshop_candidate.reason));
   END LOOP;
  ELSIF watched.entered_at<=p_cutoff THEN
   description:=CASE state WHEN 'ready' THEN 'The current Workshop pay basis is awaiting HR confirmation.'
     WHEN 'overlap-held' THEN 'Conflicting Workshop or Fleet time needs review.'
     ELSE 'Workshop labour is awaiting current signed evidence, attendance or an approved overtime basis.' END;
   exceptions:=exceptions||jsonb_build_array(erp_private.t14_operational_exception('workshop-'||state,description,fact));
  END IF;
 END LOOP;

 FOR watched IN
  SELECT f.id,a.employment_id,a.order_id,a.host_company_id,(f.departed_at AT TIME ZONE 'Asia/Dubai')::date AS day
  FROM erp_private.fleet_operation_assignments a
  JOIN erp_private.fleet_trip_leg_actuals f ON f.assignment_id=a.id AND f.load='loaded'
  JOIN erp_private.t03_employment_periods e ON e.id=a.employment_id AND e.employee_id=a.worker_id
   AND e.company_id=a.employer_company_id AND e.branch_id=a.employer_branch_id
   AND e.work_period @> (f.departed_at AT TIME ZONE 'Asia/Dubai')::date
  WHERE a.worker_id=p_employee AND a.employer_company_id=p_company AND a.employer_branch_id=p_branch
    AND f.departed_at<(stop_day::timestamp AT TIME ZONE 'Asia/Dubai') AND f.arrived_at<=p_cutoff
    AND NOT EXISTS(SELECT 1 FROM erp_private.t09_allowance_claims c WHERE c.actual_id=f.id AND c.kind='base')
  ORDER BY f.departed_at,f.id
 LOOP
  SELECT * INTO trip_candidate FROM erp_private.t09_allowance_versions v WHERE v.actual_id=watched.id AND v.kind='base'
   AND v.employee_id=p_employee AND v.employer_id=p_company AND v.employer_branch_id=p_branch
   AND v.employment_id=watched.employment_id AND v.work_day=watched.day
   AND erp_private.t09_candidate_current(v)
   ORDER BY (v.accepted_at<=p_cutoff) DESC,v.id DESC LIMIT 1;
  fact:=jsonb_build_object('actual',watched.id,'order',watched.order_id,'work_day',watched.day,
    'employment',watched.employment_id,'host_company',watched.host_company_id);
  IF trip_candidate.id IS NOT NULL AND trip_candidate.accepted_at<=p_cutoff THEN
   fact:=fact||jsonb_build_object('version',trip_candidate.id,'digest',trip_candidate.digest,
    'rate_rule',trip_candidate.basis->'rate','direction',jsonb_build_array(trip_candidate.basis->'origin',trip_candidate.basis->'destination'));
   lines:=lines||jsonb_build_array(erp_private.t14_operational_line('trip-allowance:'||watched.id,'trip-allowance',
    trip_candidate.amount,trip_candidate.currency,1,'loaded-leg',trip_candidate.amount,watched.day,trip_candidate.accepted_at,
    fact,trip_candidate.reason));
  ELSE
   state:=CASE WHEN trip_candidate.id IS NOT NULL THEN 'after-cutoff'
      ELSE coalesce(erp_private.t09_allowance_basis(watched.id)->>'state','unavailable') END;
   description:=CASE state WHEN 'after-cutoff' THEN 'Loaded-leg allowance was accepted after this cutoff.'
     WHEN 'pod-review' THEN 'The loaded leg is awaiting verified delivery evidence.'
     WHEN 'ready' THEN 'The verified loaded leg is awaiting Accounts acceptance.'
     ELSE 'The loaded leg requires current assignment evidence or a verified directional rate.' END;
   exceptions:=exceptions||jsonb_build_array(erp_private.t14_operational_exception('trip-'||state,description,fact));
  END IF;
 END LOOP;

 FOR trip_candidate IN
  SELECT v.* FROM erp_private.t09_allowance_versions v
  WHERE v.kind='adjustment' AND v.employee_id=p_employee AND v.employer_id=p_company AND v.employer_branch_id=p_branch
    AND v.work_day<stop_day
    AND NOT EXISTS(SELECT 1 FROM erp_private.t09_allowance_claims c WHERE c.version_id=v.id)
    AND NOT EXISTS(SELECT 1 FROM erp_private.t09_adjustment_withdrawals w WHERE w.version_id=v.id)
  ORDER BY v.work_day,v.id
 LOOP
  fact:=jsonb_build_object('actual',trip_candidate.actual_id,'employment',trip_candidate.employment_id,
    'version',trip_candidate.id,'digest',trip_candidate.digest,'prior_version',trip_candidate.prior_version_id,
    'change',trip_candidate.change_id,'mode',trip_candidate.basis->'mode');
  IF trip_candidate.accepted_at>p_cutoff OR NOT coalesce(erp_private.t09_candidate_current(trip_candidate),false) THEN
   state:=CASE WHEN trip_candidate.accepted_at>p_cutoff THEN 'after-cutoff' ELSE 'basis-changed' END;
   exceptions:=exceptions||jsonb_build_array(erp_private.t14_operational_exception('trip-adjustment-'||state,
      'The linked trip allowance correction requires the next cutoff or current evidence.',fact));
   CONTINUE;
  END IF;
  lines:=lines||jsonb_build_array(erp_private.t14_operational_line(
   'trip-allowance-adjustment:'||trip_candidate.change_id,'trip-allowance-adjustment',
   trip_candidate.amount,trip_candidate.currency,1,'adjustment',abs(trip_candidate.amount),
   trip_candidate.work_day,trip_candidate.accepted_at,fact,trip_candidate.reason));
 END LOOP;

 FOR watched IN
  SELECT row.id,row.claim_id,row.new_version,row.portion,row.amount,row.available_at,row.reason,c.employment_id,c.day,
    c.currency,c.rate,c.id AS candidate,c.digest
  FROM erp_private.t12_payroll_corrections row
  JOIN erp_private.t08_payable_claims prior ON prior.id=row.claim_id
  JOIN erp_private.t12_payroll_candidates c ON c.id=prior.workshop_candidate_id
  WHERE c.employee_id=p_employee AND c.company_id=p_company AND c.branch_id=p_branch AND c.day<stop_day
    AND row.approved_by IS NOT NULL AND row.withdrawn_at IS NULL
    AND NOT EXISTS(SELECT 1 FROM erp_private.t12_correction_claims claimed WHERE claimed.correction_id=row.id)
  ORDER BY c.day,row.id
 LOOP
  fact:=jsonb_build_object('correction',watched.id,'prior_claim',watched.claim_id,'prior_candidate',watched.candidate,
    'prior_digest',watched.digest,'employment',watched.employment_id,'replacement_version',watched.new_version,
    'corrected_interval',watched.portion::text);
  IF watched.available_at>p_cutoff OR NOT erp_private.t12_correction_current(watched.claim_id,watched.new_version,watched.portion) THEN
   state:=CASE WHEN watched.available_at>p_cutoff THEN 'after-cutoff' ELSE 'basis-changed' END;
   exceptions:=exceptions||jsonb_build_array(erp_private.t14_operational_exception('workshop-correction-'||state,
    'The linked Workshop correction requires the next cutoff or current signed evidence.',fact));
   CONTINUE;
  END IF;
  fact:=fact||jsonb_build_object('digest',erp_private.t02_digest(fact||jsonb_build_object(
    'signed_amount',watched.amount,'available_at',watched.available_at)));
  lines:=lines||jsonb_build_array(erp_private.t14_operational_line('workshop-correction:'||watched.id,'workshop-correction',
   watched.amount,watched.currency,erp_private.t08_minutes(watched.portion)/60,'hour',watched.rate,watched.day,watched.available_at,
   fact,watched.reason));
 END LOOP;
 RETURN jsonb_build_object('lines',lines,'exceptions',exceptions);
END;
$$;

REVOKE ALL ON FUNCTION erp_private.t14_unclaimed_work(bigint,tstzmultirange),
 erp_private.t14_operational_subjects(bigint,bigint,date,timestamptz),
 erp_private.t14_operational_line(text,text,numeric,text,numeric,text,numeric,date,timestamptz,jsonb,text),
 erp_private.t14_operational_exception(text,text,jsonb),
 erp_private.t14_operational_sources(bigint,bigint,bigint,date,timestamptz)
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
