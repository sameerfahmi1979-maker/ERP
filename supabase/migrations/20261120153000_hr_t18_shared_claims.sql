-- T18 final settlement shares the T15 payroll source fence and retained claims.
BEGIN;

CREATE TABLE erp_private.t18_claim_reservations (
 version_id uuid PRIMARY KEY REFERENCES erp_private.t18_versions,
 eos_id bigint NOT NULL REFERENCES erp_private.t18_cases,
 employment_id bigint NOT NULL REFERENCES erp_private.t03_employment_periods,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 released_at timestamptz,
 release_reason text,
 CHECK((released_at IS NULL)=(release_reason IS NULL))
);
CREATE UNIQUE INDEX t18_one_active_employment_exit_claim ON erp_private.t18_claim_reservations(employment_id)
 WHERE released_at IS NULL;
CREATE TABLE erp_private.t18_reserved_sources (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 version_id uuid NOT NULL REFERENCES erp_private.t18_claim_reservations,
 line_id uuid REFERENCES erp_private.t18_lines,
 employee_id bigint NOT NULL REFERENCES public.employees,
 month date NOT NULL CHECK(isfinite(month) AND extract(day FROM month)=1),
 category text NOT NULL,
 source_key text NOT NULL,
 span tstzmultirange CHECK(span IS NULL OR NOT isempty(span)),
 recovery_case_id bigint REFERENCES erp_private.t13_cases,
 leave_period_id bigint REFERENCES erp_private.t04_periods,
 leave_fund_id bigint REFERENCES erp_private.f12_leave_movements,
 line_fingerprint text CHECK(line_fingerprint~'^[0-9a-f]{64}$'),
 released_at timestamptz,
 CHECK((category='employment')=(line_id IS NULL)),
 CHECK((line_id IS NULL)=(line_fingerprint IS NULL)),
 CHECK((category='leave-cashout')=(leave_period_id IS NOT NULL)),
 CHECK(leave_fund_id IS NULL OR leave_period_id IS NOT NULL),
 UNIQUE(version_id,source_key),
 UNIQUE(version_id,line_id),
 EXCLUDE USING gist(employee_id WITH =,span WITH &&) WHERE(span IS NOT NULL AND released_at IS NULL)
);
CREATE UNIQUE INDEX t18_one_active_source ON erp_private.t18_reserved_sources(source_key) WHERE released_at IS NULL;
CREATE INDEX t18_active_recovery ON erp_private.t18_reserved_sources(recovery_case_id)
 WHERE released_at IS NULL AND recovery_case_id IS NOT NULL;
CREATE INDEX t18_active_leave_fund ON erp_private.t18_reserved_sources(leave_period_id,leave_fund_id)
 WHERE released_at IS NULL AND leave_period_id IS NOT NULL;
ALTER TABLE erp_private.t18_claim_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t18_reserved_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t18_claim_reservations,erp_private.t18_reserved_sources FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER t18_keep_claim_reservation BEFORE UPDATE OR DELETE ON erp_private.t18_claim_reservations
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_preserve_claim_history();
CREATE TRIGGER t18_keep_reserved_source BEFORE UPDATE OR DELETE ON erp_private.t18_reserved_sources
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_preserve_claim_history();

-- Require both exact employee-level reconciliation and a current payment channel.
CREATE FUNCTION erp_private.t18_monthly_result(p_review uuid,p_version uuid,p_employee bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('review',p_review,'version',p_version,'batch',b.id,
   'status',coalesce(cash.facts->>'status','unpaid'),'net',r.net,
   'cash',coalesce((cash.facts->>'verified_cash')::numeric,0),
   'settled',coalesce(cash.facts->>'status'='reconciled' AND erp_private.t16_channel_ready(b.id,p_employee),false))
 FROM erp_private.t14_results r LEFT JOIN erp_private.t16_batches b
 ON b.review_id=p_review AND b.version_id=r.version_id
 LEFT JOIN LATERAL (SELECT erp_private.t16_result_status(b.id,p_employee) AS facts) cash ON b.id IS NOT NULL
 WHERE r.version_id=p_version AND r.employee_id=p_employee;
$$;

CREATE FUNCTION erp_private.t18_monthly_payroll_status(p_employment bigint,p_employee bigint,p_month date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH states AS (
   SELECT result.status||jsonb_build_object('coverage_from',lower(coverage.days),
       'coverage_until',upper(coverage.days),
       'settled',coalesce((result.status->>'settled')::boolean AND reservation.review_id IS NOT NULL AND coverage.days IS NOT NULL
         AND coverage.days=datemultirange(daterange(lower(coverage.days),upper(coverage.days),'[)')),false)) AS facts
   FROM erp_private.t03_employment_periods e JOIN erp_private.t14_runs run
     ON run.company_id=e.company_id AND run.branch_id=e.branch_id AND run.month=p_month
   JOIN erp_private.t15_reviews review ON review.run_id=run.id AND review.state='approved'
   LEFT JOIN erp_private.t15_claim_reservations reservation ON reservation.review_id=review.id
      AND reservation.version_id=review.version_id AND reservation.released_at IS NULL
   JOIN erp_private.t14_results r ON r.version_id=review.version_id AND r.employee_id=p_employee
     AND r.employment_ids @> ARRAY[p_employment]
   LEFT JOIN LATERAL (
      SELECT range_agg(daterange((l.source->>'from')::date,(l.source->>'until')::date,'[)')) AS days
      FROM erp_private.t14_lines l WHERE l.version_id=r.version_id AND l.employee_id=r.employee_id
        AND l.category='basic' AND l.kind='earning' AND l.amount>0
        AND (l.source->>'employment_id')::bigint=p_employment
        AND l.source ? 'from' AND l.source ? 'until'
   ) coverage ON true
   CROSS JOIN LATERAL (SELECT erp_private.t18_monthly_result(review.id,r.version_id,p_employee) AS status) result
   WHERE e.id=p_employment AND e.employee_id=p_employee
     AND (coverage.days IS NOT NULL OR EXISTS(SELECT 1 FROM erp_private.t15_reserved_lines s
       WHERE s.review_id=review.id AND s.source_key='employment:'||p_employment||':'||p_month AND s.released_at IS NULL))
 )
 SELECT jsonb_build_object('state',CASE WHEN count(*)=0 THEN 'unclaimed'
   WHEN bool_and((facts->>'settled')::boolean) THEN 'settled' ELSE 'held' END,
   'settlements',coalesce(jsonb_agg(facts ORDER BY facts->>'version'),'[]'::jsonb))
 FROM states;
$$;

CREATE FUNCTION erp_private.t18_prior_payroll_holds(p_employment bigint,p_employee bigint,p_month date)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH results AS (
   SELECT run.month,erp_private.t18_monthly_result(review.id,result.version_id,p_employee)
      ||jsonb_build_object('protected',reservation.review_id IS NOT NULL) AS facts
   FROM erp_private.t03_employment_periods e JOIN erp_private.t14_runs run
     ON e.company_id=run.company_id AND e.branch_id=run.branch_id AND run.month<p_month
   JOIN erp_private.t15_reviews review ON review.run_id=run.id AND review.state='approved'
   LEFT JOIN erp_private.t15_claim_reservations reservation ON reservation.review_id=review.id
      AND reservation.version_id=review.version_id AND reservation.released_at IS NULL
   JOIN erp_private.t14_results result ON result.version_id=review.version_id AND result.employee_id=p_employee
     AND result.employment_ids @> ARRAY[p_employment]
   WHERE e.id=p_employment AND e.employee_id=p_employee
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('month',month)||facts ORDER BY month,facts->>'version'),'[]'::jsonb)
 FROM results WHERE NOT coalesce((facts->>'settled')::boolean AND (facts->>'protected')::boolean,false);
$$;

CREATE FUNCTION erp_private.t18_other_payroll_line(p_employee bigint,p_line jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH pins AS (
   SELECT erp_private.t18_monthly_result(r.review_id,r.version_id,p_employee) AS result,
     r.line_key=p_line->>'key' AND l.category=p_line->>'category' AND l.kind=p_line->>'kind'
       AND l.amount=(p_line->>'amount')::numeric AND l.currency=p_line->>'currency'
       AND l.source=p_line->'source' AS exact
   FROM erp_private.t15_reserved_lines r JOIN erp_private.t14_lines l ON l.id=r.line_id
   WHERE r.employee_id=p_employee AND r.released_at IS NULL AND (r.line_key=p_line->>'key'
     OR r.span&&(p_line#>>'{source,interval}')::tstzmultirange)
 )
 SELECT jsonb_build_object('state',CASE WHEN count(*)=0 THEN 'unclaimed'
   WHEN bool_and(coalesce(exact AND (result->>'settled')::boolean,false)) THEN 'settled' ELSE 'held' END,
   'settlements',coalesce(jsonb_agg(result||jsonb_build_object('exact',exact) ORDER BY result->>'version'),'[]'::jsonb))
 FROM pins;
$$;

CREATE FUNCTION erp_private.t18_guard_monthly_reservation() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 -- t15_reserve_approval already holds t15_claim_lock when adding each row.
 IF EXISTS(SELECT 1 FROM erp_private.t18_reserved_sources r WHERE r.released_at IS NULL
     AND (r.source_key=NEW.source_key OR (r.employee_id=NEW.employee_id AND r.span&&NEW.span)
          )) OR erp_private.t18_recovery_conflict(NEW.recovery_case_id,NEW.month,NEW.line_id) THEN
   RAISE EXCEPTION 'This source is reserved by an approved final settlement' USING ERRCODE='PT409';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER t18_protect_final_settlement_source BEFORE INSERT ON erp_private.t15_reserved_lines
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_guard_monthly_reservation();

CREATE FUNCTION erp_private.t18_leave_fund_is_claimed(p_period bigint,p_fund bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM erp_private.t18_reserved_sources s WHERE s.released_at IS NULL
   AND s.leave_period_id=p_period AND s.leave_fund_id IS NOT DISTINCT FROM p_fund);
$$;

-- A fund belongs to its entitlement period/company, even if a later same-company
-- employment or transfer presents that period. Do not scope only by employee.
CREATE FUNCTION erp_private.t18_guard_leave_source() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='t04_days' THEN
   IF NEW.period_id IS NULL OR NEW.rate<>1 OR NEW.state='released'
      OR NOT EXISTS(SELECT 1 FROM erp_private.t04_cases c WHERE c.id=NEW.case_id AND c.category='annual') THEN
     RETURN NEW;
   END IF;
   IF TG_OP='UPDATE' AND OLD.state IN('reserved','posted')
       AND ROW(OLD.period_id,OLD.fund_id,OLD.rate,OLD.case_id) IS NOT DISTINCT FROM
           ROW(NEW.period_id,NEW.fund_id,NEW.rate,NEW.case_id) THEN
     RETURN NEW;
   END IF;
   PERFORM erp_private.t15_claim_lock();
   IF erp_private.t18_leave_fund_is_claimed(NEW.period_id,NEW.fund_id) THEN
     RAISE EXCEPTION 'Annual leave fund is reserved for final settlement' USING ERRCODE='PT409';
   END IF;
 ELSE
   IF NEW.movement_version<>2 OR NEW.entitlement_id IS NULL OR NEW.days>=0
     OR (NEW.effect='consume' AND EXISTS(
       SELECT 1 FROM erp_private.t04_days d WHERE d.id=NEW.allocation_id AND d.state='reserved'
       AND d.period_id=NEW.entitlement_id AND d.fund_id IS NOT DISTINCT FROM NEW.fund_id)) THEN
     RETURN NEW;
   END IF;
   PERFORM erp_private.t15_claim_lock();
   IF erp_private.t18_leave_fund_is_claimed(NEW.entitlement_id,NEW.fund_id) THEN
     RAISE EXCEPTION 'Annual leave fund is reserved for final settlement' USING ERRCODE='PT409';
   END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER t18_protect_annual_leave_allocation BEFORE INSERT OR UPDATE OF period_id,fund_id,state,rate,case_id
 ON erp_private.t04_days FOR EACH ROW EXECUTE FUNCTION erp_private.t18_guard_leave_source();
CREATE TRIGGER t18_protect_annual_leave_movement BEFORE INSERT ON erp_private.f12_leave_movements
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_guard_leave_source();
CREATE FUNCTION erp_private.t18_reserve(p_version uuid) RETURNS integer
LANGUAGE plpgsql SET search_path='' SET timezone='UTC' AS $$
DECLARE
 v erp_private.t18_versions;
 exit_case erp_private.t18_cases;
 monthly_run erp_private.t14_runs;
 monthly_line erp_private.t14_lines;
 item erp_private.t18_lines;
 binding record;
 bound_period_id bigint;
 bound_fund_id bigint;
 bound_key text;
 source_span tstzmultirange;
 bound_case_id bigint;
 claim_month date;
 exit_month date;
 affected integer:=0;
BEGIN
 SELECT * INTO STRICT v FROM erp_private.t18_versions WHERE id=p_version;
 SELECT * INTO STRICT exit_case FROM erp_private.t18_cases WHERE eos_id=v.eos_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('t14-payroll:'||exit_case.company_id,0));
 PERFORM erp_private.t15_claim_lock();
 IF EXISTS(SELECT 1 FROM erp_private.t18_claim_reservations WHERE version_id=p_version) THEN
   IF EXISTS(SELECT 1 FROM erp_private.t18_claim_reservations WHERE version_id=p_version AND released_at IS NOT NULL) THEN
     RAISE EXCEPTION 'The original final settlement reservation has been released' USING ERRCODE='PT409';
   END IF;
   RETURN (SELECT count(*)::integer FROM erp_private.t18_reserved_sources WHERE version_id=p_version AND line_id IS NOT NULL);
 END IF;
 exit_month:=date_trunc('month',exit_case.last_day::timestamp)::date;
 IF jsonb_array_length(erp_private.t18_prior_payroll_holds(exit_case.employment_id,exit_case.employee_id,exit_month))>0
    OR erp_private.t18_monthly_payroll_status(exit_case.employment_id,exit_case.employee_id,exit_month)->>'state'='held' THEN
   RAISE EXCEPTION 'An earlier or current employee payroll result needs reconciliation' USING ERRCODE='PT409';
 END IF;
 INSERT INTO erp_private.t18_claim_reservations(version_id,eos_id,employment_id)
 VALUES(v.id,v.eos_id,exit_case.employment_id);
 FOREACH claim_month IN ARRAY v.salary_claim_months LOOP
   IF claim_month IS DISTINCT FROM exit_month OR
      erp_private.t18_monthly_payroll_status(exit_case.employment_id,exit_case.employee_id,claim_month)->>'state'<>'unclaimed'
      OR EXISTS(SELECT 1 FROM erp_private.t15_reserved_lines r WHERE
          r.source_key='employment:'||exit_case.employment_id||':'||claim_month AND r.released_at IS NULL) THEN
     RAISE EXCEPTION 'Final-month salary already has an exact monthly payroll result' USING ERRCODE='PT409';
   END IF;
   INSERT INTO erp_private.t18_reserved_sources(version_id,employee_id,month,category,source_key)
   VALUES(v.id,exit_case.employee_id,claim_month,'employment','employment:'||exit_case.employment_id||':'||claim_month);
 END LOOP;

 monthly_run.company_id:=exit_case.company_id;
 monthly_run.branch_id:=exit_case.branch_id;
 monthly_run.month:=exit_month;
 FOR item IN SELECT * FROM erp_private.t18_lines WHERE version_id=p_version AND amount>0 ORDER BY key LOOP
   bound_period_id:=NULL;
   bound_fund_id:=NULL;
   source_span:=NULL;
   bound_case_id:=NULL;
   IF item.available_at>v.cutoff OR item.currency IS DISTINCT FROM v.currency OR item.original_on>exit_case.last_day THEN
     RAISE EXCEPTION 'Final settlement line is outside the approved cutoff or currency' USING ERRCODE='PT409';
   END IF;
   CASE item.category
   WHEN 'leave-cashout' THEN
     bound_period_id:=(item.source->>'period_id')::bigint;
     bound_fund_id:=(item.source->>'fund_id')::bigint;
     IF NOT coalesce(item.kind='earning' AND (item.source->>'employment')::bigint=exit_case.employment_id
         AND EXISTS(SELECT 1 FROM erp_private.t04_periods p WHERE p.id=bound_period_id AND
           p.employee_id=exit_case.employee_id AND p.company_id=exit_case.company_id),false) THEN
       RAISE EXCEPTION 'Final settlement leave has the wrong employee or employing company' USING ERRCODE='PT409';
     END IF;
     IF (bound_fund_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp_private.f12_leave_movements f WHERE f.id=bound_fund_id
          AND f.entitlement_id=bound_period_id AND f.movement_version=2 AND f.effect='carry-in'
          AND (f.expires_before IS NULL OR f.expires_before>exit_case.last_day)))
         OR erp_private.t04_funds_remaining(bound_period_id,bound_fund_id,exit_case.last_day,NULL) IS DISTINCT FROM
             (item.source->>'eligible_days')::numeric
         OR item.quantity IS DISTINCT FROM (item.source->>'eligible_days')::numeric THEN
       RAISE EXCEPTION 'Annual leave changed. Recalculate the final settlement.' USING ERRCODE='PT409';
     END IF;
     bound_key:='exit-leave:'||bound_period_id||':'||coalesce(bound_fund_id,0);
   WHEN 'termination-benefit' THEN
     IF item.kind<>'earning' OR (item.source->>'employment')::bigint IS DISTINCT FROM exit_case.employment_id THEN
       RAISE EXCEPTION 'Termination benefit is outside this exact employment' USING ERRCODE='PT409';
     END IF;
     bound_key:='exit-benefit:'||exit_case.employment_id;
   WHEN 'exit-adjustment' THEN
     IF (item.source->>'employment')::bigint IS DISTINCT FROM exit_case.employment_id
        OR nullif(item.source->>'adjustment','') IS NULL THEN
       RAISE EXCEPTION 'Final settlement adjustment has no exact reviewed source' USING ERRCODE='PT409';
     END IF;
     bound_key:='exit-adjustment:'||(item.source->>'adjustment');
   ELSE
     IF item.category IN ('basic','salary-component','salary-deduction','sick-leave','annual-leave','unpaid-leave','absence')
         AND (NOT (exit_month=ANY(v.salary_claim_months)) OR
              (item.source->>'employment_id')::bigint IS DISTINCT FROM exit_case.employment_id) THEN
       RAISE EXCEPTION 'Final-month salary is missing its exact employment month claim' USING ERRCODE='PT409';
     END IF;
     IF item.category IN ('fleet-overtime','workshop-overtime','trip-allowance','trip-allowance-adjustment','workshop-correction')
         AND (item.source->>'employment')::bigint IS DISTINCT FROM exit_case.employment_id THEN
       RAISE EXCEPTION 'Operational pay is outside this exact employment' USING ERRCODE='PT409';
     END IF;
     monthly_line:=jsonb_populate_record(NULL::erp_private.t14_lines,
        to_jsonb(item)||jsonb_build_object('employee_id',exit_case.employee_id));
     SELECT * INTO STRICT binding FROM erp_private.t15_line_binding(monthly_line,monthly_run,v.cutoff);
     bound_key:=binding.source_key;
     source_span:=binding.span;
     bound_case_id:=binding.recovery_case_id;
   END CASE;
   IF EXISTS(SELECT 1 FROM erp_private.t15_reserved_lines r WHERE r.released_at IS NULL
      AND (r.source_key=bound_key OR (r.employee_id=exit_case.employee_id AND r.span&&source_span))) THEN
     RAISE EXCEPTION 'Another approved payroll already reserves this source' USING ERRCODE='PT409';
   END IF;
   INSERT INTO erp_private.t18_reserved_sources(version_id,line_id,employee_id,month,category,source_key,
       span,recovery_case_id,leave_period_id,leave_fund_id,line_fingerprint)
   VALUES(v.id,item.id,exit_case.employee_id,exit_month,item.category,bound_key,source_span,
       bound_case_id,bound_period_id,bound_fund_id,erp_private.t02_digest(to_jsonb(item)));
   affected:=affected+1;
 END LOOP;
 RETURN affected;
EXCEPTION WHEN unique_violation OR exclusion_violation THEN
 RAISE EXCEPTION 'Another final settlement holds this employment or source' USING ERRCODE='PT409';
END $$;

CREATE FUNCTION erp_private.t18_assert_claims(p_version uuid) RETURNS void
LANGUAGE plpgsql SET search_path='' SET timezone='UTC' AS $$
DECLARE
 v erp_private.t18_versions;
 exit_case erp_private.t18_cases;
BEGIN
 SELECT * INTO STRICT v FROM erp_private.t18_versions WHERE id=p_version;
 SELECT * INTO STRICT exit_case FROM erp_private.t18_cases WHERE eos_id=v.eos_id;
 PERFORM pg_advisory_xact_lock(hashtextextended('t14-payroll:'||exit_case.company_id,0));
 PERFORM erp_private.t15_claim_lock();
 IF NOT EXISTS(SELECT 1 FROM erp_private.t18_claim_reservations r JOIN erp_private.t18_approvals a
      ON a.eos_id=r.eos_id AND a.version_id=r.version_id AND a.state='approved' AND a.digest=v.digest
      WHERE r.version_id=p_version AND r.eos_id=exit_case.eos_id AND r.employment_id=exit_case.employment_id AND r.released_at IS NULL)
    OR EXISTS(SELECT 1 FROM erp_private.t18_lines l WHERE l.version_id=p_version AND l.amount>0
       AND NOT EXISTS(SELECT 1 FROM erp_private.t18_reserved_sources r WHERE r.version_id=l.version_id AND r.line_id=l.id
           AND r.employee_id=exit_case.employee_id AND r.released_at IS NULL
           AND r.line_fingerprint=erp_private.t02_digest(to_jsonb(l))))
    OR EXISTS(SELECT 1 FROM unnest(v.salary_claim_months) m(month)
       WHERE NOT EXISTS(SELECT 1 FROM erp_private.t18_reserved_sources r WHERE r.version_id=p_version
           AND r.released_at IS NULL AND r.employee_id=exit_case.employee_id
           AND r.category='employment' AND r.source_key='employment:'||exit_case.employment_id||':'||m.month)) THEN
   RAISE EXCEPTION 'Final settlement has no exact protected GM-approved reservation' USING ERRCODE='PT409';
 END IF;
END $$;

-- A new cash handoff rechecks live coverage after taking the same company and
-- source locks. Outcome recording and corrective reversals use the exact pin.
CREATE FUNCTION erp_private.t18_assert_monthly_coverage(p_version uuid) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 v erp_private.t18_versions;
 exit_case erp_private.t18_cases;
 exit_month date;
 monthly_state text;
BEGIN
 PERFORM erp_private.t18_assert_claims(p_version);
 SELECT * INTO STRICT v FROM erp_private.t18_versions WHERE id=p_version;
 SELECT * INTO STRICT exit_case FROM erp_private.t18_cases WHERE eos_id=v.eos_id;
 exit_month:=date_trunc('month',exit_case.last_day::timestamp)::date;
 monthly_state:=erp_private.t18_monthly_payroll_status(exit_case.employment_id,exit_case.employee_id,exit_month)->>'state';
 IF jsonb_array_length(erp_private.t18_prior_payroll_holds(exit_case.employment_id,exit_case.employee_id,exit_month))>0
   OR monthly_state='held' OR (cardinality(v.salary_claim_months)>0 AND monthly_state<>'unclaimed') THEN
   RAISE EXCEPTION 'An earlier or current employee payroll result needs reconciliation' USING ERRCODE='PT409';
 END IF;
END $$;

CREATE FUNCTION erp_private.t18_release(p_version uuid,p_reason text) RETURNS integer
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 r erp_private.t18_claim_reservations;
 release_time timestamptz:=clock_timestamp();
 note text:=btrim(p_reason);
BEGIN
 IF NOT coalesce(length(note) BETWEEN 1 AND 1000,false) THEN
   RAISE EXCEPTION 'Give a verified reason for releasing these final settlement claims' USING ERRCODE='22023';
 END IF;
 PERFORM erp_private.t15_claim_lock();
 SELECT * INTO r FROM erp_private.t18_claim_reservations WHERE version_id=p_version;
 IF r.version_id IS NULL OR (r.released_at IS NOT NULL AND r.release_reason IS DISTINCT FROM note) THEN
   RAISE EXCEPTION 'The original final settlement claim release is retained' USING ERRCODE='PT409';
 END IF;
 IF r.released_at IS NULL THEN
   IF EXISTS(SELECT 1 FROM erp_private.t18_reserved_sources s WHERE s.version_id=p_version AND (
      EXISTS(SELECT 1 FROM erp_private.t08_payable_claims c WHERE c.consumer_key=s.line_id)
      OR EXISTS(SELECT 1 FROM erp_private.t09_allowance_claims c WHERE c.consumer_key=s.line_id)
      OR EXISTS(SELECT 1 FROM erp_private.t12_correction_claims c WHERE c.consumer_key=s.line_id)
      OR EXISTS(SELECT 1 FROM erp_private.t13_payroll_pins c WHERE c.payroll_line_id=s.line_id))) THEN
     RAISE EXCEPTION 'Canonical final settlement claims already exist. Reconcile the outcome.' USING ERRCODE='PT409';
   END IF;
   UPDATE erp_private.t18_claim_reservations SET released_at=release_time,release_reason=note WHERE version_id=p_version;
   UPDATE erp_private.t18_reserved_sources SET released_at=release_time WHERE version_id=p_version AND released_at IS NULL;
 END IF;
 RETURN (SELECT count(*)::integer FROM erp_private.t18_reserved_sources WHERE version_id=p_version AND line_id IS NOT NULL);
END $$;

-- The T15 canonical trigger runs first and has acquired the common claim fence.
CREATE FUNCTION erp_private.t18_guard_canonical_claim() RETURNS trigger
LANGUAGE plpgsql SET search_path='' SET timezone='UTC' AS $$
DECLARE
 consumer uuid;
 wanted_key text;
 item erp_private.t18_lines;
 claim erp_private.t18_reserved_sources;
 trip erp_private.t09_allowance_versions;
 approval erp_private.t18_approvals;
 exit_case erp_private.t18_cases;
 recovery_ceiling numeric;
BEGIN
 IF TG_TABLE_NAME='t13_payroll_pins' THEN consumer:=NEW.payroll_line_id;
 ELSE consumer:=NEW.consumer_key; END IF;
 SELECT * INTO item FROM erp_private.t18_lines WHERE id=consumer;
 IF item.id IS NOT NULL THEN
   SELECT * INTO claim FROM erp_private.t18_reserved_sources WHERE line_id=consumer AND released_at IS NULL;
   SELECT a.* INTO approval FROM erp_private.t18_approvals a JOIN erp_private.t18_versions v ON v.id=a.version_id AND v.digest=a.digest
   WHERE a.version_id=item.version_id AND a.state='approved';
   IF claim.id IS NULL OR approval.id IS NULL OR claim.version_id<>approval.version_id
       OR claim.line_fingerprint IS DISTINCT FROM erp_private.t02_digest(to_jsonb(item)) THEN
     RAISE EXCEPTION 'This final settlement line has no active exact GM reservation' USING ERRCODE='PT409';
   END IF;
 END IF;

 CASE TG_TABLE_NAME
 WHEN 't08_payable_claims' THEN
   IF EXISTS(SELECT 1 FROM erp_private.t18_reserved_sources r WHERE r.employee_id=NEW.employee_id
       AND r.released_at IS NULL AND r.span&&NEW.claimed AND r.line_id IS DISTINCT FROM consumer)
      OR (item.id IS NOT NULL AND NOT coalesce(
        claim.employee_id=NEW.employee_id AND item.amount=NEW.amount AND item.currency=NEW.currency AND claim.span=NEW.claimed AND (
          (item.category='fleet-overtime' AND NEW.candidate_id=(item.source->>'candidate')::bigint
           AND NEW.alias_id=(item.source->>'alias')::bigint AND NEW.workshop_candidate_id IS NULL)
          OR (item.category='workshop-overtime' AND NEW.workshop_candidate_id=(item.source->>'candidate')::bigint
           AND NEW.candidate_id IS NULL AND NEW.alias_id IS NULL)),false)) THEN
     RAISE EXCEPTION 'This work interval is reserved for a different exact final settlement line' USING ERRCODE='PT409';
   END IF;
 WHEN 't09_allowance_claims' THEN
   SELECT * INTO trip FROM erp_private.t09_allowance_versions WHERE id=NEW.version_id;
   wanted_key:=CASE WHEN trip.kind='base' THEN 'trip-base:'||trip.actual_id
                    WHEN trip.kind='adjustment' THEN 'trip-adjustment:'||trip.change_id END;
   IF EXISTS(SELECT 1 FROM erp_private.t18_reserved_sources r WHERE r.source_key=wanted_key
          AND r.released_at IS NULL AND r.line_id IS DISTINCT FROM consumer)
      OR (item.id IS NOT NULL AND (claim.source_key IS DISTINCT FROM wanted_key
          OR (item.source->>'version')::bigint IS DISTINCT FROM trip.id)) THEN
     RAISE EXCEPTION 'This allowance is reserved for a different exact final settlement line' USING ERRCODE='PT409';
   END IF;
 WHEN 't12_correction_claims' THEN
   wanted_key:='workshop-correction:'||NEW.correction_id;
   IF EXISTS(SELECT 1 FROM erp_private.t18_reserved_sources r WHERE r.source_key=wanted_key
                 AND r.released_at IS NULL AND r.line_id IS DISTINCT FROM consumer)
      OR (item.id IS NOT NULL AND claim.source_key IS DISTINCT FROM wanted_key) THEN
     RAISE EXCEPTION 'This correction is reserved for a different exact final settlement line' USING ERRCODE='PT409';
   END IF;
 WHEN 't13_payroll_pins' THEN
   IF erp_private.t18_recovery_conflict(NEW.case_id,NEW.payroll_month,consumer) THEN
     RAISE EXCEPTION 'This recovery is reserved for a different approved final settlement' USING ERRCODE='PT409';
   END IF;
   IF item.id IS NOT NULL THEN
     SELECT * INTO exit_case FROM erp_private.t18_cases WHERE eos_id=approval.eos_id;
     recovery_ceiling:=CASE WHEN NEW.kind='refund' THEN (item.source->>'proposal_amount')::numeric
       ELSE least((item.source->>'proposal_amount')::numeric,(item.source->>'wage_cap')::numeric,
                  (item.source->>'group_headroom')::numeric) END;
     IF NOT coalesce(item.category IN('recovery','recovery-refund') AND claim.recovery_case_id=NEW.case_id
        AND claim.month=NEW.payroll_month AND approval.id=NEW.gm_approval_id AND approval.decided_by=NEW.gm_approver_id
        AND approval.version_id=NEW.payroll_run_id AND exit_case.company_id=NEW.employer_company_id
        AND exit_case.branch_id=NEW.employer_branch_id AND claim.employee_id=NEW.employee_id
        AND item.currency=NEW.currency AND item.amount=NEW.approved_amount AND NEW.kind=item.source->>'recovery_kind'
        AND NEW.source_id=(item.source->>'upstream_id')::bigint AND NEW.schedule_id=(item.source->>'schedule')::bigint
        AND NEW.proposal_digest=item.source->>'fingerprint' AND NEW.headroom<=recovery_ceiling,false) THEN
       RAISE EXCEPTION 'Recovery pin does not match the exact GM-approved final settlement line' USING ERRCODE='PT409';
     END IF;
   END IF;
 ELSE
   RAISE EXCEPTION 'Unsupported canonical final settlement claim table' USING ERRCODE='55000';
 END CASE;
 RETURN NEW;
END $$;
CREATE TRIGGER t18_respect_approved_work_reservation BEFORE INSERT ON erp_private.t08_payable_claims
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_guard_canonical_claim();
CREATE TRIGGER t18_respect_approved_trip_reservation BEFORE INSERT ON erp_private.t09_allowance_claims
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_guard_canonical_claim();
CREATE TRIGGER t18_respect_approved_correction_reservation BEFORE INSERT ON erp_private.t12_correction_claims
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_guard_canonical_claim();
CREATE TRIGGER t18_respect_approved_recovery_reservation BEFORE INSERT ON erp_private.t13_payroll_pins
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_guard_canonical_claim();

REVOKE ALL ON FUNCTION erp_private.t18_monthly_result(uuid,uuid,bigint),
 erp_private.t18_monthly_payroll_status(bigint,bigint,date),erp_private.t18_prior_payroll_holds(bigint,bigint,date),
 erp_private.t18_other_payroll_line(bigint,jsonb),erp_private.t18_leave_fund_is_claimed(bigint,bigint),
 erp_private.t18_guard_monthly_reservation(),erp_private.t18_guard_leave_source(),erp_private.t18_guard_canonical_claim(),
 erp_private.t18_reserve(uuid),erp_private.t18_assert_claims(uuid),erp_private.t18_assert_monthly_coverage(uuid),erp_private.t18_release(uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;

-- Monthly payroll can proceed for the rest of a branch after an exact exit
-- approval. Its sign-off still rejects a stale draft that carries either share.
CREATE FUNCTION erp_private.t18_exit_salary_reserved(p_employment bigint,p_month date)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM erp_private.t18_reserved_sources s
   WHERE s.released_at IS NULL AND s.category='employment'
   AND s.source_key='employment:'||p_employment||':'||p_month);
$$;

CREATE FUNCTION erp_private.t18_exit_salary_reserved_at(p_employment bigint,p_month date,p_at timestamptz)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM erp_private.t18_reserved_sources s JOIN erp_private.t18_claim_reservations r USING(version_id)
   WHERE r.created_at<=p_at AND (s.released_at IS NULL OR s.released_at>p_at) AND s.category='employment'
   AND s.source_key='employment:'||p_employment||':'||p_month);
$$;

CREATE FUNCTION erp_private.t18_monthly_unclaimed_work(p_employee bigint,p_work tstzmultirange)
RETURNS tstzmultirange LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_private.t14_unclaimed_work(p_employee,p_work)-coalesce(
   (SELECT range_agg(s.span) FROM erp_private.t18_reserved_sources s
     WHERE s.employee_id=p_employee AND s.released_at IS NULL AND s.span&&p_work),'{}'::tstzmultirange);
$$;

CREATE FUNCTION erp_private.t18_exit_work_state(p_employee bigint,p_line jsonb)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 WITH matches AS (
   SELECT l.category=p_line->>'category' AND l.kind=p_line->>'kind' AND l.amount=(p_line->>'amount')::numeric
       AND l.currency=p_line->>'currency' AND l.source=p_line->'source' AS exact
   FROM erp_private.t18_reserved_sources s JOIN erp_private.t18_lines l ON l.id=s.line_id
   WHERE s.employee_id=p_employee AND s.released_at IS NULL
     AND s.category IN('fleet-overtime','workshop-overtime','trip-allowance','trip-allowance-adjustment','workshop-correction')
     AND (l.key=p_line->>'key' OR s.span&&(p_line#>>'{source,interval}')::tstzmultirange)
 )
 SELECT CASE WHEN count(*)=0 THEN 'free' WHEN bool_and(coalesce(exact,false)) THEN 'exact' ELSE 'overlap' END FROM matches;
$$;

-- A later ordered instalment may continue after the exact exit recovery was
-- pinned, evidenced, fully allocated and never reversed in the canonical T13 ledger.
CREATE FUNCTION erp_private.t18_recovery_conflict(p_case bigint,p_month date,p_line uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(
   SELECT 1 FROM erp_private.t18_reserved_sources s
   WHERE s.recovery_case_id=p_case AND s.released_at IS NULL AND s.line_id IS DISTINCT FROM p_line
     AND (p_month IS NULL OR s.month>=p_month OR NOT EXISTS(
       SELECT 1 FROM erp_private.t13_payroll_pins p
       JOIN erp_private.t18_approvals a ON a.id=p.gm_approval_id AND a.version_id=p.payroll_run_id AND a.state='approved'
       WHERE p.payroll_line_id=s.line_id AND p.payroll_run_id=s.version_id AND p.case_id=s.recovery_case_id
         AND p.payroll_month=s.month
         AND EXISTS(SELECT 1 FROM erp_private.t13_receipts r WHERE r.pin_id=p.id AND r.final)
         AND NOT EXISTS(SELECT 1 FROM erp_private.t13_receipts r WHERE r.pin_id=p.id
           AND r.actual_amount IS DISTINCT FROM (SELECT coalesce(sum(
             CASE WHEN x.reverses_allocation_id IS NULL THEN x.amount ELSE -x.amount END),0)
             FROM erp_private.t13_allocations x WHERE x.receipt_id=r.id AND x.pin_id=p.id AND x.case_id=p.case_id))
     ))
 );
$$;

DO $adopt$
DECLARE target regprocedure; body text; definition text; adopted text;
BEGIN
 target:='erp_private.t14_operational_sources(bigint,bigint,bigint,date,timestamp with time zone)'::regprocedure;
 SELECT prosrc,pg_get_functiondef(oid) INTO STRICT body,definition FROM pg_proc WHERE oid=target;
 adopted:=replace(body,'erp_private.t14_unclaimed_work(','erp_private.t18_monthly_unclaimed_work(');
 IF adopted=body THEN RAISE EXCEPTION 'T18 expected T14 payable interval subtraction'; END IF;
 EXECUTE replace(replace(definition,body,adopted),
   'FUNCTION erp_private.t14_operational_sources(','FUNCTION erp_private.t18_monthly_operational_sources(');

 target:='erp_private.t14_employee_basis(uuid,bigint,bigint,bigint,date,timestamp with time zone)'::regprocedure;
 SELECT prosrc,pg_get_functiondef(oid) INTO STRICT body,definition FROM pg_proc WHERE oid=target;
 adopted:=replace(body,$old$ rules jsonb:='[]';$old$,
   $new$ rules jsonb:='[]'; exit_salary_covered boolean:=false; exit_work_state text;$new$);
 IF adopted=body THEN RAISE EXCEPTION 'T18 expected T14 employee declarations'; END IF;
 body:=adopted;
 adopted:=replace(body,$old$   linked_periods:=array_append(linked_periods,employment.id);$old$,
   $new$   IF erp_private.t18_exit_salary_reserved(employment.id,p_month) THEN
     exit_salary_covered:=true;
     CONTINUE;
   END IF;
   linked_periods:=array_append(linked_periods,employment.id);$new$);
 IF adopted=body THEN RAISE EXCEPTION 'T18 expected exact T14 employment loop'; END IF;
 body:=adopted;
 adopted:=replace(body,'erp_private.t14_operational_sources(','erp_private.t18_monthly_operational_sources(');
 IF adopted=body THEN RAISE EXCEPTION 'T18 expected T14 operational comparison'; END IF;
 body:=adopted;
 adopted:=replace(body,$old$   IF entry->>'key'=ANY(seen) THEN$old$,
   $new$   exit_work_state:=erp_private.t18_exit_work_state(p_employee,entry);
   IF exit_work_state IN('exact','overlap') THEN
     issues:=issues||erp_private.t14_issue(
       CASE exit_work_state WHEN 'exact' THEN 'source-in-exit-settlement' ELSE 'source-overlaps-exit-settlement' END,
       CASE exit_work_state WHEN 'exact' THEN 'This payable source belongs to an approved exit settlement.'
         ELSE 'An amended source overlaps approved exit time. Review the unclaimed portion independently.' END,
       false,entry->'source');
   ELSIF entry->>'key'=ANY(seen) THEN$new$);
 IF adopted=body THEN RAISE EXCEPTION 'T18 expected T14 exact source evaluation'; END IF;
 body:=adopted;
 adopted:=replace(body,$old$ IF currency IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(issues) i WHERE (i->>'blocking')::boolean) THEN total_state:='held'; END IF;$old$,
   $new$ IF exit_salary_covered AND NOT EXISTS(
       SELECT 1 FROM unnest(linked_periods) e(id) WHERE NOT erp_private.t18_exit_salary_reserved(e.id,p_month))
     AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lines) l WHERE (l->>'amount')::numeric>0)
     AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(issues) i WHERE (i->>'blocking')::boolean) THEN
     RETURN NULL;
   END IF;
   IF currency IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(issues) i WHERE (i->>'blocking')::boolean) THEN total_state:='held'; END IF;$new$);
 IF adopted=body THEN RAISE EXCEPTION 'T18 expected T14 employee result decision'; END IF;
 EXECUTE replace(definition,(SELECT prosrc FROM pg_proc WHERE oid=target),adopted);

 target:='erp_private.t14_adjustment_basis(uuid,bigint,jsonb,timestamp with time zone)'::regprocedure;
 SELECT prosrc,pg_get_functiondef(oid) INTO STRICT body,definition FROM pg_proc WHERE oid=target;
 adopted:=replace(body,$old$   IF a.decision IS NULL THEN$old$,
   $new$   IF EXISTS(SELECT 1 FROM erp_private.t14_runs run WHERE run.id=p_run
         AND erp_private.t18_exit_salary_reserved((a.original_source->>'employment_id')::bigint,run.month))
      OR erp_private.t18_exit_work_state(p_employee,jsonb_build_object('key',a.original_key,
          'source',a.original_source,'amount',a.original_amount))<>'free' THEN
     issues:=issues||erp_private.t14_issue('adjustment-source-in-exit','Review this documented adjustment in the exit settlement.',false,source_facts);
     CONTINUE;
   END IF;
   IF a.decision IS NULL THEN$new$);
 IF adopted=body THEN RAISE EXCEPTION 'T18 expected T14 adjustment source evaluation'; END IF;
 EXECUTE replace(definition,body,adopted);

 target:='erp_private.t14_recovery_basis(uuid,bigint,bigint,bigint,date,timestamp with time zone,jsonb,text,numeric,numeric,numeric,numeric)'::regprocedure;
 SELECT prosrc,pg_get_functiondef(oid) INTO STRICT body,definition FROM pg_proc WHERE oid=target;
 adopted:=replace(body,$old$   entry:=item.version;$old$,
   $new$   IF erp_private.t18_recovery_conflict(item.id,p_month,NULL) THEN
     issues:=issues||erp_private.t14_issue('recovery-in-exit-settlement','Review this recovery against its approved exit settlement.',false,
       jsonb_build_object('case',item.id));
     CONTINUE;
   END IF;
   entry:=item.version;$new$);
 IF adopted=body THEN RAISE EXCEPTION 'T18 expected T14 recovery source evaluation'; END IF;
 EXECUTE replace(definition,body,adopted);

 target:='erp_private.t15_reserve_approval(uuid,uuid)'::regprocedure;
 SELECT prosrc,pg_get_functiondef(oid) INTO STRICT body,definition FROM pg_proc WHERE oid=target;
 adopted:=replace(body,$old$AND p.branch_id=run.branch_id AND p.work_period&&daterange(run.month,(run.month+interval '1 month')::date,'[)');$old$,
   $new$AND p.branch_id=run.branch_id AND p.work_period&&daterange(run.month,(run.month+interval '1 month')::date,'[)')
   AND (NOT erp_private.t18_exit_salary_reserved(p.id,run.month) OR EXISTS(
     SELECT 1 FROM erp_private.t14_lines recurring WHERE recurring.version_id=version.id
       AND recurring.employee_id=result.employee_id AND recurring.amount>0
       AND recurring.category IN('basic','salary-component','salary-deduction','sick-leave','annual-leave','unpaid-leave','absence')
       AND (recurring.source->>'employment_id')::bigint=p.id));$new$);
 IF adopted=body THEN RAISE EXCEPTION 'T18 expected T15 exact employment reservation filter'; END IF;
 EXECUTE replace(definition,body,adopted);

 target:='erp_private.t15_assert_reservations(uuid,uuid)'::regprocedure;
 SELECT prosrc,pg_get_functiondef(oid) INTO STRICT body,definition FROM pg_proc WHERE oid=target;
 adopted:=replace(body,$old$AND p.work_period&&daterange(run.month,(run.month+interval '1 month')::date,'[)')$old$,
   $new$AND p.work_period&&daterange(run.month,(run.month+interval '1 month')::date,'[)')
       AND (NOT erp_private.t18_exit_salary_reserved_at(p.id,run.month,reservation.created_at) OR EXISTS(
         SELECT 1 FROM erp_private.t14_lines recurring WHERE recurring.version_id=version.id
           AND recurring.employee_id=result.employee_id AND recurring.amount>0
           AND recurring.category IN('basic','salary-component','salary-deduction','sick-leave','annual-leave','unpaid-leave','absence')
           AND (recurring.source->>'employment_id')::bigint=p.id))$new$);
 IF adopted=body THEN RAISE EXCEPTION 'T18 expected T15 exact employment reservation assertion'; END IF;
 EXECUTE replace(definition,body,adopted);
END $adopt$;

REVOKE ALL ON FUNCTION erp_private.t18_exit_salary_reserved(bigint,date),
 erp_private.t18_monthly_unclaimed_work(bigint,tstzmultirange),
 erp_private.t18_monthly_operational_sources(bigint,bigint,bigint,date,timestamptz),
 erp_private.t18_exit_salary_reserved_at(bigint,date,timestamptz),
 erp_private.t18_exit_work_state(bigint,jsonb),erp_private.t18_recovery_conflict(bigint,date,uuid)
 FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
