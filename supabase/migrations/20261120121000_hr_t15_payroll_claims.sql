
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- All acquired pay sources share this transaction fence with the existing
-- claim/pin writers. NOWAIT also protects the inherited source lock orders.
CREATE TABLE erp_private.t15_claim_fence (
 singleton boolean PRIMARY KEY CHECK(singleton),
 generation bigint NOT NULL DEFAULT 0
);
INSERT INTO erp_private.t15_claim_fence(singleton) VALUES(true);

CREATE TABLE erp_private.t15_claim_reservations (
 review_id uuid PRIMARY KEY,
 version_id uuid NOT NULL REFERENCES erp_private.t14_versions,
 run_id uuid NOT NULL REFERENCES erp_private.t14_runs,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 released_at timestamptz,
 release_reason text,
 CHECK((released_at IS NULL)=(release_reason IS NULL)),
 UNIQUE(review_id,version_id)
);
CREATE UNIQUE INDEX t15_one_active_approval_reservation ON erp_private.t15_claim_reservations(run_id)
 WHERE released_at IS NULL;

CREATE TABLE erp_private.t15_reserved_lines (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 review_id uuid NOT NULL,
 version_id uuid NOT NULL,
 run_id uuid NOT NULL REFERENCES erp_private.t14_runs,
 line_id uuid REFERENCES erp_private.t14_lines,
 employee_id bigint NOT NULL REFERENCES public.employees,
 month date NOT NULL,
 category text NOT NULL,
 source_key text NOT NULL,
 line_key text,
 span tstzmultirange,
 recovery_case_id bigint REFERENCES erp_private.t13_cases,
 released_at timestamptz,
 FOREIGN KEY(review_id,version_id) REFERENCES erp_private.t15_claim_reservations(review_id,version_id),
 CHECK((category='employment')=(line_id IS NULL)),
 CHECK((line_id IS NULL)=(line_key IS NULL)),
 CHECK(span IS NULL OR NOT isempty(span)),
 UNIQUE(review_id,source_key)
);
CREATE UNIQUE INDEX t15_one_active_claim_source ON erp_private.t15_reserved_lines(source_key)
 WHERE released_at IS NULL;
CREATE UNIQUE INDEX t15_one_active_claim_line ON erp_private.t15_reserved_lines(line_id)
 WHERE released_at IS NULL AND line_id IS NOT NULL;
CREATE INDEX t15_active_line_keys ON erp_private.t15_reserved_lines(line_key,run_id) WHERE released_at IS NULL;
CREATE INDEX t15_active_recovery_order ON erp_private.t15_reserved_lines(recovery_case_id,month)
 WHERE released_at IS NULL AND recovery_case_id IS NOT NULL;
ALTER TABLE erp_private.t15_reserved_lines ADD CONSTRAINT t15_one_active_work_interval
 EXCLUDE USING gist(employee_id WITH =,span WITH &&) WHERE(span IS NOT NULL AND released_at IS NULL);

ALTER TABLE erp_private.t15_claim_fence ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t15_claim_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t15_reserved_lines ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t15_claim_fence,erp_private.t15_claim_reservations,erp_private.t15_reserved_lines
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.t15_claim_lock() RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM erp_private.t15_claim_fence WHERE singleton FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'Payroll claim fence is unavailable' USING ERRCODE='55000'; END IF;
 UPDATE erp_private.t15_claim_fence SET generation=generation+1 WHERE singleton;
EXCEPTION WHEN lock_not_available THEN
 RAISE EXCEPTION 'Another payroll claim is changing. Retry the same request.' USING ERRCODE='40001';
END $$;

CREATE FUNCTION erp_private.t15_preserve_claim_history() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' THEN
   RAISE EXCEPTION 'Payroll claim reservations are retained' USING ERRCODE='55000';
 END IF;
 IF OLD.released_at IS NOT NULL OR NEW.released_at IS NULL OR
    to_jsonb(NEW)-ARRAY['released_at','release_reason'] IS DISTINCT FROM
    to_jsonb(OLD)-ARRAY['released_at','release_reason'] THEN
   RAISE EXCEPTION 'Only the first authorised claim release can modify a reservation' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER t15_keep_reservation_history BEFORE UPDATE OR DELETE ON erp_private.t15_claim_reservations
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_preserve_claim_history();
CREATE TRIGGER t15_keep_line_reservation_history BEFORE UPDATE OR DELETE ON erp_private.t15_reserved_lines
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_preserve_claim_history();

-- Only the exact older pin and final receipt with fully allocated, verified
-- cash can open the next instalment. A final zero receipt is a valid close.
CREATE FUNCTION erp_private.t15_recovery_closed(p_line uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(
   SELECT 1 FROM erp_private.t15_reserved_lines reserve
   JOIN erp_private.t13_payroll_pins pin ON pin.payroll_line_id=reserve.line_id
     AND pin.gm_approval_id=reserve.review_id AND pin.payroll_run_id=reserve.version_id
     AND pin.case_id=reserve.recovery_case_id AND pin.payroll_month=reserve.month
   WHERE reserve.line_id=p_line
     AND EXISTS(SELECT 1 FROM erp_private.t13_receipts r WHERE r.pin_id=pin.id AND r.final)
     AND NOT EXISTS (
       SELECT 1 FROM erp_private.t13_receipts r WHERE r.pin_id=pin.id
       AND r.actual_amount IS DISTINCT FROM (SELECT coalesce(sum(CASE WHEN a.reverses_allocation_id IS NULL
         THEN a.amount ELSE -a.amount END),0) FROM erp_private.t13_allocations a
         WHERE a.receipt_id=r.id AND a.pin_id=pin.id AND a.case_id=pin.case_id)
     )
 );
$$;

CREATE FUNCTION erp_private.t15_recovery_conflict(p_case bigint,p_month date,p_line uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(
   SELECT 1 FROM erp_private.t15_reserved_lines reserved
   WHERE reserved.recovery_case_id=p_case AND reserved.released_at IS NULL
     AND reserved.line_id IS DISTINCT FROM p_line
     AND (p_month IS NULL OR reserved.month>=p_month OR NOT erp_private.t15_recovery_closed(reserved.line_id))
 );
$$;

CREATE FUNCTION erp_private.t15_other_approval(p_run uuid,p_employee bigint,p_line jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(
   SELECT 1 FROM erp_private.t15_reserved_lines reserved
   LEFT JOIN erp_private.t14_runs draft ON draft.id=p_run
   WHERE reserved.released_at IS NULL AND reserved.run_id IS DISTINCT FROM p_run AND (
     (reserved.recovery_case_id IS NULL AND reserved.line_key=p_line->>'key')
     OR (reserved.recovery_case_id=CASE WHEN p_line->>'key'~'^recovery:(deduction|refund):[0-9]+$'
           THEN split_part(p_line->>'key',':',3)::bigint END
       AND (draft.month IS NULL OR reserved.month>=draft.month OR NOT erp_private.t15_recovery_closed(reserved.line_id)))
     OR (reserved.employee_id=p_employee AND reserved.span IS NOT NULL
       AND reserved.span&&(p_line->'source'->>'interval')::tstzmultirange)
   )
 );
$$;

-- Stable employee/month coverage is shared with a future final settlement
-- consumer. The caller holds this lock until storing its protected claim.
CREATE FUNCTION erp_private.t15_assert_employment_available(p_employment bigint,p_month date)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF p_employment IS NULL OR p_month IS NULL OR extract(day FROM p_month)<>1 THEN
   RAISE EXCEPTION 'Provide an exact employment and payroll month' USING ERRCODE='22023';
 END IF;
 PERFORM erp_private.t15_claim_lock();
 IF EXISTS(SELECT 1 FROM erp_private.t15_reserved_lines
   WHERE source_key='employment:'||p_employment||':'||p_month AND released_at IS NULL) THEN
   RAISE EXCEPTION 'An approved payroll version already holds this employment period' USING ERRCODE='PT409';
 END IF;
END $$;

-- Rebuild each identity from the saved line and the owning module. This also
-- rechecks payable evidence and canonical consumption just before issuance.
CREATE FUNCTION erp_private.t15_line_binding(
 p_line erp_private.t14_lines,p_run erp_private.t14_runs,p_cutoff timestamptz
)
RETURNS TABLE(source_key text,span tstzmultirange,recovery_case_id bigint)
LANGUAGE plpgsql STABLE SET search_path='' SET timezone='UTC' AS $$
DECLARE
 line_source jsonb:=p_line.source;
 fleet erp_private.t08_payable_candidates;
 w erp_private.t08_fleet_work;
 alias erp_private.t08_payable_aliases;
 workshop erp_private.t12_payroll_candidates;
 trip erp_private.t09_allowance_versions;
 correction erp_private.t12_payroll_corrections;
 prior erp_private.t08_payable_claims;
 adjustment erp_private.t14_adjustments;
 proposal jsonb;
 expected_kind text;
 expected_id bigint;
 expected_span tstzmultirange;
 employment bigint;
BEGIN
 IF p_line.amount<=0 OR p_line.available_at IS NULL
    OR (p_line.category<>'adjustment' AND p_line.available_at>p_cutoff) THEN
   RAISE EXCEPTION 'Line is unavailable at the approved payroll cutoff' USING ERRCODE='PT409';
 END IF;
 CASE p_line.category
 WHEN 'fleet-overtime' THEN
   SELECT * INTO fleet FROM erp_private.t08_payable_candidates WHERE id=(line_source->>'candidate')::bigint;
   SELECT * INTO w FROM erp_private.t08_fleet_work WHERE id=fleet.work_id;
   SELECT * INTO alias FROM erp_private.t08_payable_aliases WHERE id=(line_source->>'alias')::bigint;
   expected_span:=(line_source->>'interval')::tstzmultirange;
   IF NOT coalesce(fleet.employee_id=p_line.employee_id AND p_line.kind='earning'
      AND w.id=(line_source->>'work')::bigint AND w.employer_company_id=p_run.company_id AND w.employer_branch_id=p_run.branch_id
      AND w.day=p_line.original_on AND w.employment_id=(line_source->>'employment')::bigint
      AND fleet.currency=p_line.currency AND fleet.available_at=p_line.available_at
      AND fleet.digest=line_source->>'digest' AND fleet.digest=erp_private.t02_digest(erp_private.t08_source_basis(w.id))
      AND alias.work_id=w.id AND alias.kind='fleet' AND alias.source_id=w.id AND alias.source_fingerprint=fleet.digest
      AND NOT isempty(expected_span) AND expected_span<@fleet.eligible AND expected_span<@alias.covered
      AND p_line.amount=erp_private.t08_range_amount(fleet.eligible,expected_span,fleet.rate),false) THEN
     RAISE EXCEPTION 'Fleet time or its pay basis changed. Recalculate the payroll version.' USING ERRCODE='PT409';
   END IF;
   source_key:='fleet-work:'||w.id||':'||expected_span::text;
   span:=expected_span;
 WHEN 'workshop-overtime' THEN
   SELECT * INTO workshop FROM erp_private.t12_payroll_candidates WHERE id=(line_source->>'candidate')::bigint;
   expected_span:=(line_source->>'interval')::tstzmultirange;
   IF NOT coalesce(workshop.employee_id=p_line.employee_id AND p_line.kind='earning'
      AND workshop.company_id=p_run.company_id AND workshop.branch_id=p_run.branch_id
      AND workshop.day=p_line.original_on AND workshop.employment_id=(line_source->>'employment')::bigint
      AND workshop.currency=p_line.currency AND workshop.available_at=p_line.available_at
      AND workshop.version_id=(line_source->>'version')::bigint AND workshop.digest=line_source->>'digest'
      AND workshop.digest=erp_private.t02_digest(erp_private.t12_pay_basis(workshop.version_id))
      AND NOT isempty(expected_span) AND expected_span<@workshop.eligible
      AND p_line.amount=erp_private.t08_range_amount(workshop.eligible,expected_span,workshop.rate),false) THEN
     RAISE EXCEPTION 'Workshop time or its pay basis changed. Recalculate the payroll version.' USING ERRCODE='PT409';
   END IF;
   source_key:='workshop-work:'||(line_source->>'labour_line')||':'||expected_span::text;
   span:=expected_span;
 WHEN 'trip-allowance','trip-allowance-adjustment' THEN
   SELECT * INTO trip FROM erp_private.t09_allowance_versions WHERE id=(line_source->>'version')::bigint;
   expected_kind:=CASE WHEN p_line.category='trip-allowance' THEN 'base' ELSE 'adjustment' END;
   IF NOT coalesce(trip.employee_id=p_line.employee_id AND trip.employer_id=p_run.company_id
      AND trip.employer_branch_id=p_run.branch_id AND trip.employment_id=(line_source->>'employment')::bigint
      AND trip.kind=expected_kind AND trip.actual_id=(line_source->>'actual')::bigint
      AND (expected_kind='base' OR trip.change_id=(line_source->>'change')::bigint)
      AND trip.work_day=p_line.original_on AND trip.currency=p_line.currency AND trip.accepted_at=p_line.available_at
      AND trip.digest=line_source->>'digest' AND abs(trip.amount)=p_line.amount
      AND p_line.kind=CASE WHEN trip.amount>0 THEN 'earning' ELSE 'deduction' END
      AND erp_private.t09_candidate_current(trip),false) THEN
     RAISE EXCEPTION 'Trip allowance evidence changed. Recalculate the payroll version.' USING ERRCODE='PT409';
   END IF;
   IF EXISTS(SELECT 1 FROM erp_private.t09_allowance_claims c WHERE c.version_id=trip.id
        OR (trip.kind='base' AND c.kind='base' AND c.actual_id=trip.actual_id)) THEN
     RAISE EXCEPTION 'This trip allowance already has a payroll claim' USING ERRCODE='PT409';
   END IF;
   source_key:=CASE WHEN trip.kind='base' THEN 'trip-base:'||trip.actual_id ELSE 'trip-adjustment:'||trip.change_id END;
 WHEN 'workshop-correction' THEN
   SELECT * INTO correction FROM erp_private.t12_payroll_corrections WHERE id=(line_source->>'correction')::bigint;
   SELECT * INTO prior FROM erp_private.t08_payable_claims WHERE id=correction.claim_id;
   SELECT * INTO workshop FROM erp_private.t12_payroll_candidates WHERE id=prior.workshop_candidate_id;
   IF NOT coalesce(correction.approved_by IS NOT NULL AND correction.withdrawn_at IS NULL
      AND workshop.employee_id=p_line.employee_id AND workshop.company_id=p_run.company_id AND workshop.branch_id=p_run.branch_id
      AND workshop.employment_id=(line_source->>'employment')::bigint AND workshop.day=p_line.original_on
      AND workshop.currency=p_line.currency AND correction.available_at=p_line.available_at AND abs(correction.amount)=p_line.amount
      AND p_line.kind=CASE WHEN correction.amount<0 THEN 'deduction' ELSE 'earning' END
      AND correction.claim_id=(line_source->>'prior_claim')::bigint AND workshop.id=(line_source->>'prior_candidate')::bigint
      AND workshop.digest=line_source->>'prior_digest' AND correction.new_version=(line_source->>'replacement_version')::bigint
      AND correction.portion=(line_source->>'corrected_interval')::tstzmultirange
      AND erp_private.t12_correction_current(correction.claim_id,correction.new_version,correction.portion),false) THEN
     RAISE EXCEPTION 'Workshop correction is no longer eligible for this version' USING ERRCODE='PT409';
   END IF;
   IF EXISTS(SELECT 1 FROM erp_private.t12_correction_claims c WHERE c.correction_id=correction.id) THEN
     RAISE EXCEPTION 'This Workshop correction already has a payroll claim' USING ERRCODE='PT409';
   END IF;
   source_key:='workshop-correction:'||correction.id;
 WHEN 'recovery','recovery-refund' THEN
   recovery_case_id:=(line_source->>'case')::bigint;
   expected_kind:=CASE WHEN p_line.category='recovery' THEN 'deduction' ELSE 'refund' END;
   proposal:=erp_private.t13_payroll_proposal(recovery_case_id,p_run.month,expected_kind);
   IF NOT coalesce(expected_kind=line_source->>'recovery_kind' AND (line_source->>'month')::date=p_run.month
      AND p_line.kind=CASE WHEN expected_kind='deduction' THEN 'deduction' ELSE 'earning' END
      AND (proposal->>'case_id')::bigint=recovery_case_id AND (proposal->>'employee_id')::bigint=p_line.employee_id
      AND (proposal->>'company_id')::bigint=p_run.company_id AND (proposal->>'branch_id')::bigint=p_run.branch_id
      AND proposal->>'currency'=p_line.currency AND proposal->>'status'='ready' AND proposal->>'kind'=expected_kind
      AND proposal->>'digest'=line_source->>'fingerprint' AND proposal->>'source_id'=line_source->>'upstream_id'
      AND proposal->>'schedule_id'=line_source->>'schedule' AND p_line.amount<=(proposal->>'amount')::numeric
      AND (expected_kind='refund' OR (p_line.amount<=(line_source->>'wage_cap')::numeric
                                     AND p_line.amount<=(line_source->>'group_headroom')::numeric)),false) THEN
     RAISE EXCEPTION 'The recovery schedule or its evidence changed. Recalculate this version.' USING ERRCODE='PT409';
   END IF;
   IF erp_private.t15_recovery_conflict(recovery_case_id,p_run.month,p_line.id) THEN
     RAISE EXCEPTION 'This recovery still has an earlier or competing payroll reservation' USING ERRCODE='PT409';
   END IF;
   source_key:='recovery:'||recovery_case_id||':'||expected_kind||':'||p_run.month;
 WHEN 'adjustment' THEN
   SELECT * INTO adjustment FROM erp_private.t14_adjustments WHERE id=(line_source->>'adjustment')::bigint;
   IF NOT coalesce(adjustment.run_id=p_run.id AND adjustment.employee_id=p_line.employee_id
      AND adjustment.decision='verified' AND adjustment.amount=p_line.amount AND adjustment.currency=p_line.currency
      AND adjustment.kind=p_line.kind AND adjustment.decided_at=p_line.available_at
      AND adjustment.original_line_id=(line_source->>'original_line')::uuid
      AND adjustment.version_id=(line_source->>'evidence_version')::bigint,false) THEN
     RAISE EXCEPTION 'The reviewed payroll adjustment is no longer available' USING ERRCODE='PT409';
   END IF;
   source_key:='adjustment:'||adjustment.id;
 WHEN 'basic','salary-component','salary-deduction','sick-leave','annual-leave','unpaid-leave','absence' THEN
   employment:=(line_source->>'employment_id')::bigint;
   IF NOT EXISTS(SELECT 1 FROM erp_private.t03_employment_periods e
      WHERE e.id=employment AND e.employee_id=p_line.employee_id AND e.company_id=p_run.company_id
      AND e.branch_id=p_run.branch_id AND e.work_period@>p_line.original_on
      AND p_line.original_on<@(daterange(p_run.month,(p_run.month+interval '1 month')::date,'[)'))) THEN
     RAISE EXCEPTION 'Historical employment changed. Recalculate the payroll version.' USING ERRCODE='PT409';
   END IF;
   source_key:='payroll-line:'||p_run.company_id||':'||p_line.key;
 ELSE
   RAISE EXCEPTION 'Unsupported approved payroll source type' USING ERRCODE='PT409';
 END CASE;
 IF span IS NOT NULL AND EXISTS(SELECT 1 FROM erp_private.t08_payable_claims c
    WHERE c.employee_id=p_line.employee_id AND c.claimed&&span) THEN
   RAISE EXCEPTION 'Some of the approved work already has a payroll claim' USING ERRCODE='PT409';
 END IF;
 RETURN NEXT;
END $$;

CREATE FUNCTION erp_private.t15_assert_reservations(p_review uuid,p_version uuid)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 reservation erp_private.t15_claim_reservations;
 version erp_private.t14_versions;
 run erp_private.t14_runs;
 item erp_private.t14_lines;
 expected record;
 witness_count integer;
BEGIN
 PERFORM erp_private.t15_claim_lock();
 SELECT * INTO reservation FROM erp_private.t15_claim_reservations
 WHERE review_id=p_review AND version_id=p_version AND released_at IS NULL;
 IF reservation.review_id IS NULL THEN RAISE EXCEPTION 'Approval has no active exact reservations' USING ERRCODE='PT409'; END IF;
 SELECT * INTO STRICT version FROM erp_private.t14_versions WHERE id=p_version;
 SELECT * INTO STRICT run FROM erp_private.t14_runs WHERE id=version.run_id;
 witness_count:=0;
 FOR item IN SELECT * FROM erp_private.t14_lines WHERE version_id=p_version AND amount>0 ORDER BY employee_id,key LOOP
   SELECT * INTO STRICT expected FROM erp_private.t15_line_binding(item,run,version.cutoff);
   IF NOT EXISTS(SELECT 1 FROM erp_private.t15_reserved_lines l WHERE l.review_id=p_review
     AND l.line_id=item.id AND l.category=item.category AND l.employee_id=item.employee_id AND l.month=run.month
     AND l.source_key=expected.source_key AND l.span IS NOT DISTINCT FROM expected.span
     AND l.recovery_case_id IS NOT DISTINCT FROM expected.recovery_case_id AND l.released_at IS NULL) THEN
     RAISE EXCEPTION 'Approval lost an exact source reservation' USING ERRCODE='PT409';
   END IF;
   witness_count:=witness_count+1;
 END LOOP;
 IF witness_count<>(SELECT count(*) FROM erp_private.t15_reserved_lines WHERE review_id=p_review AND line_id IS NOT NULL
                    AND released_at IS NULL) OR EXISTS(
   SELECT 1 FROM erp_private.t14_results result
   CROSS JOIN LATERAL unnest(result.employment_ids) e(id)
   JOIN erp_private.t03_employment_periods p USING(id)
   WHERE result.version_id=p_version AND p.work_period&&daterange(run.month,(run.month+interval '1 month')::date,'[)')
     AND NOT EXISTS(SELECT 1 FROM erp_private.t15_reserved_lines l WHERE l.review_id=p_review
       AND l.employee_id=result.employee_id AND l.source_key='employment:'||p.id||':'||run.month
       AND l.released_at IS NULL)
 ) THEN
   RAISE EXCEPTION 'Approval contains incomplete source or employment reservations' USING ERRCODE='PT409';
 END IF;
END $$;

CREATE FUNCTION erp_private.t15_reserve_approval(p_review uuid,p_version uuid)
RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 version erp_private.t14_versions;
 run erp_private.t14_runs;
 item erp_private.t14_lines;
 expected record;
 reservation erp_private.t15_claim_reservations;
 affected integer:=0;
BEGIN
 IF p_review IS NULL OR p_version IS NULL THEN RAISE EXCEPTION 'Provide one exact payroll approval' USING ERRCODE='22023'; END IF;
 PERFORM erp_private.t15_claim_lock();
 SELECT * INTO reservation FROM erp_private.t15_claim_reservations WHERE review_id=p_review;
 IF FOUND THEN
   IF reservation.version_id IS DISTINCT FROM p_version OR reservation.released_at IS NOT NULL THEN
     RAISE EXCEPTION 'The original approval reservation is already retained' USING ERRCODE='PT409';
   END IF;
   PERFORM erp_private.t15_assert_reservations(p_review,p_version);
   RETURN (SELECT count(*)::integer FROM erp_private.t15_reserved_lines l WHERE l.review_id=p_review AND l.line_id IS NOT NULL);
 END IF;
 SELECT * INTO version FROM erp_private.t14_versions WHERE id=p_version;
 SELECT * INTO run FROM erp_private.t14_runs WHERE id=version.run_id;
 IF run.id IS NULL OR NOT EXISTS(SELECT 1 FROM erp_private.t14_results r WHERE r.version_id=p_version)
    OR EXISTS(SELECT 1 FROM erp_private.t14_results r WHERE r.version_id=p_version AND r.state<>'ready') THEN
   RAISE EXCEPTION 'Payroll version contains unpayable results or has no results' USING ERRCODE='PT409';
 END IF;
 INSERT INTO erp_private.t15_claim_reservations(review_id,version_id,run_id) VALUES(p_review,version.id,run.id);
 INSERT INTO erp_private.t15_reserved_lines(review_id,version_id,run_id,employee_id,month,category,source_key)
 SELECT DISTINCT p_review,version.id,run.id,result.employee_id,run.month,'employment','employment:'||p.id||':'||run.month
 FROM erp_private.t14_results result
 CROSS JOIN LATERAL unnest(result.employment_ids) e(id)
 JOIN erp_private.t03_employment_periods p USING(id)
 WHERE result.version_id=p_version AND p.employee_id=result.employee_id AND p.company_id=run.company_id
   AND p.branch_id=run.branch_id AND p.work_period&&daterange(run.month,(run.month+interval '1 month')::date,'[)');
 FOR item IN SELECT * FROM erp_private.t14_lines WHERE version_id=p_version AND amount>0 ORDER BY employee_id,key LOOP
   SELECT * INTO STRICT expected FROM erp_private.t15_line_binding(item,run,version.cutoff);
   INSERT INTO erp_private.t15_reserved_lines(review_id,version_id,run_id,line_id,employee_id,month,category,
      source_key,line_key,span,recovery_case_id)
   VALUES(p_review,version.id,run.id,item.id,item.employee_id,run.month,item.category,
      expected.source_key,item.key,expected.span,expected.recovery_case_id);
   affected:=affected+1;
 END LOOP;
 RETURN affected;
EXCEPTION WHEN unique_violation OR exclusion_violation THEN
 RAISE EXCEPTION 'An existing payroll approval already holds a source in this version' USING ERRCODE='PT409';
END $$;

CREATE FUNCTION erp_private.t15_release_approval(p_review uuid,p_version uuid,p_reason text)
RETURNS integer LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 r erp_private.t15_claim_reservations;
 effective_reason text:=btrim(p_reason);
 released timestamptz:=clock_timestamp();
 affected integer;
BEGIN
 IF NOT coalesce(length(effective_reason) BETWEEN 1 AND 1000,false) THEN
   RAISE EXCEPTION 'Give a verified reason for releasing these payroll claims' USING ERRCODE='22023';
 END IF;
 PERFORM erp_private.t15_claim_lock();
 SELECT * INTO r FROM erp_private.t15_claim_reservations WHERE review_id=p_review AND version_id=p_version;
 IF r.review_id IS NULL THEN RAISE EXCEPTION 'Approval has no matching reservation' USING ERRCODE='PT409'; END IF;
 IF r.released_at IS NOT NULL THEN
   IF r.release_reason IS DISTINCT FROM effective_reason THEN
     RAISE EXCEPTION 'An earlier release reason is retained' USING ERRCODE='PT409';
   END IF;
   RETURN (SELECT count(*)::integer FROM erp_private.t15_reserved_lines l WHERE l.review_id=p_review AND l.line_id IS NOT NULL);
 END IF;
 IF EXISTS(SELECT 1 FROM erp_private.t15_reserved_lines l WHERE l.review_id=p_review AND l.line_id IS NOT NULL AND (
   EXISTS(SELECT 1 FROM erp_private.t08_payable_claims c WHERE c.consumer_key=l.line_id)
   OR EXISTS(SELECT 1 FROM erp_private.t09_allowance_claims c WHERE c.consumer_key=l.line_id)
   OR EXISTS(SELECT 1 FROM erp_private.t12_correction_claims c WHERE c.consumer_key=l.line_id)
   OR EXISTS(SELECT 1 FROM erp_private.t13_payroll_pins c WHERE c.payroll_line_id=l.line_id))) THEN
   RAISE EXCEPTION 'Canonical claims already exist. Preserve the approval and reconcile the outcome.' USING ERRCODE='PT409';
 END IF;
 UPDATE erp_private.t15_claim_reservations SET released_at=released,release_reason=effective_reason WHERE review_id=p_review;
 UPDATE erp_private.t15_reserved_lines SET released_at=released WHERE review_id=p_review AND released_at IS NULL;
 SELECT count(*) INTO affected FROM erp_private.t15_reserved_lines l WHERE l.review_id=p_review AND l.line_id IS NOT NULL;
 RETURN affected;
END $$;

-- The existing owner claims retain their original business rules. The shared
-- trigger serializes their insert against both approved payroll and exit work.
CREATE FUNCTION erp_private.t15_guard_canonical_claim() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 consumer uuid;
 reservations erp_private.t15_reserved_lines;
 item erp_private.t14_lines;
 wanted_key text;
 trip erp_private.t09_allowance_versions;
 recovery_ceiling numeric;
BEGIN
 PERFORM erp_private.t15_claim_lock();
 IF TG_TABLE_NAME='t13_payroll_pins' THEN consumer:=NEW.payroll_line_id;
 ELSE consumer:=NEW.consumer_key; END IF;
 SELECT * INTO reservations FROM erp_private.t15_reserved_lines r WHERE r.line_id=consumer AND r.released_at IS NULL;
 IF reservations.id IS NULL AND EXISTS(SELECT 1 FROM erp_private.t14_lines WHERE id=consumer) THEN
   RAISE EXCEPTION 'This monthly payroll line has no active GM approval reservation' USING ERRCODE='PT409';
 END IF;
 IF reservations.id IS NOT NULL THEN
   SELECT * INTO STRICT item FROM erp_private.t14_lines WHERE id=consumer;
 END IF;

 CASE TG_TABLE_NAME
 WHEN 't08_payable_claims' THEN
   IF EXISTS(SELECT 1 FROM erp_private.t15_reserved_lines r WHERE r.employee_id=NEW.employee_id
       AND r.released_at IS NULL AND r.span&&NEW.claimed AND r.line_id IS DISTINCT FROM consumer)
      OR (item.id IS NOT NULL AND NOT coalesce(
        item.employee_id=NEW.employee_id AND item.amount=NEW.amount AND item.currency=NEW.currency
        AND reservations.span=NEW.claimed AND (
          (item.category='fleet-overtime' AND NEW.candidate_id=(item.source->>'candidate')::bigint
           AND NEW.alias_id=(item.source->>'alias')::bigint AND NEW.workshop_candidate_id IS NULL)
          OR (item.category='workshop-overtime' AND NEW.workshop_candidate_id=(item.source->>'candidate')::bigint
           AND NEW.candidate_id IS NULL AND NEW.alias_id IS NULL)),false)) THEN
     RAISE EXCEPTION 'This work interval is reserved for a different exact payroll line' USING ERRCODE='PT409';
   END IF;
 WHEN 't09_allowance_claims' THEN
   SELECT * INTO trip FROM erp_private.t09_allowance_versions WHERE id=NEW.version_id;
   wanted_key:=CASE WHEN trip.kind='base' THEN 'trip-base:'||trip.actual_id
                    WHEN trip.kind='adjustment' THEN 'trip-adjustment:'||trip.change_id END;
   IF trip.id IS NULL OR ROW(trip.actual_id,trip.kind) IS DISTINCT FROM ROW(NEW.actual_id,NEW.kind)
      OR EXISTS(SELECT 1 FROM erp_private.t15_reserved_lines r WHERE r.source_key=wanted_key
                 AND r.released_at IS NULL AND r.line_id IS DISTINCT FROM consumer)
      OR (item.id IS NOT NULL AND (reservations.source_key IS DISTINCT FROM wanted_key
          OR (item.source->>'version')::bigint IS DISTINCT FROM trip.id)) THEN
     RAISE EXCEPTION 'This allowance is reserved for a different exact payroll line' USING ERRCODE='PT409';
   END IF;
 WHEN 't12_correction_claims' THEN
   wanted_key:='workshop-correction:'||NEW.correction_id;
   IF EXISTS(SELECT 1 FROM erp_private.t15_reserved_lines r WHERE r.source_key=wanted_key
                 AND r.released_at IS NULL AND r.line_id IS DISTINCT FROM consumer)
      OR (item.id IS NOT NULL AND reservations.source_key IS DISTINCT FROM wanted_key) THEN
     RAISE EXCEPTION 'This correction is reserved for a different exact payroll line' USING ERRCODE='PT409';
   END IF;
 WHEN 't13_payroll_pins' THEN
   IF erp_private.t15_recovery_conflict(NEW.case_id,NEW.payroll_month,consumer) THEN
     RAISE EXCEPTION 'This recovery has unsettled or competing approval reservations' USING ERRCODE='PT409';
   END IF;
   IF item.id IS NOT NULL THEN
     recovery_ceiling:=least((item.source->>'proposal_amount')::numeric,(item.source->>'wage_cap')::numeric,
                             (item.source->>'group_headroom')::numeric);
     IF NOT coalesce(reservations.recovery_case_id=NEW.case_id AND reservations.month=NEW.payroll_month
        AND reservations.review_id=NEW.gm_approval_id AND reservations.version_id=NEW.payroll_run_id
        AND item.employee_id=NEW.employee_id AND item.currency=NEW.currency AND item.amount=NEW.approved_amount
        AND NEW.kind=item.source->>'recovery_kind' AND NEW.source_id=(item.source->>'upstream_id')::bigint
        AND NEW.schedule_id=(item.source->>'schedule')::bigint AND NEW.proposal_digest=item.source->>'fingerprint'
        AND NEW.headroom<=recovery_ceiling,false) THEN
       RAISE EXCEPTION 'Recovery pin does not match the protected GM approval and payroll line' USING ERRCODE='PT409';
     END IF;
   END IF;
 ELSE
   RAISE EXCEPTION 'Unsupported canonical payroll claim table' USING ERRCODE='55000';
 END CASE;
 RETURN NEW;
END $$;

CREATE TRIGGER t15_respect_approved_work_reservation BEFORE INSERT ON erp_private.t08_payable_claims
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_guard_canonical_claim();
CREATE TRIGGER t15_respect_approved_trip_reservation BEFORE INSERT ON erp_private.t09_allowance_claims
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_guard_canonical_claim();
CREATE TRIGGER t15_respect_approved_correction_reservation BEFORE INSERT ON erp_private.t12_correction_claims
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_guard_canonical_claim();
CREATE TRIGGER t15_respect_approved_recovery_reservation BEFORE INSERT ON erp_private.t13_payroll_pins
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_guard_canonical_claim();

REVOKE ALL ON FUNCTION erp_private.t15_claim_lock(),erp_private.t15_preserve_claim_history(),
 erp_private.t15_recovery_closed(uuid),erp_private.t15_recovery_conflict(bigint,date,uuid),
 erp_private.t15_other_approval(uuid,bigint,jsonb),erp_private.t15_assert_employment_available(bigint,date),
 erp_private.t15_line_binding(erp_private.t14_lines,erp_private.t14_runs,timestamptz),
 erp_private.t15_assert_reservations(uuid,uuid),erp_private.t15_reserve_approval(uuid,uuid),
 erp_private.t15_release_approval(uuid,uuid,text),erp_private.t15_guard_canonical_claim()
 FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
