BEGIN;

CREATE TABLE erp_private.t12_payroll_candidates (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 version_id bigint NOT NULL REFERENCES erp_private.t12_labour_versions(id),
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 employment_id bigint NOT NULL REFERENCES erp_private.t03_employment_periods(id),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 day date NOT NULL,
 eligible tstzmultirange NOT NULL CHECK(NOT isempty(eligible)),
 rate numeric NOT NULL CHECK(rate>0),
 currency text NOT NULL CHECK(currency~'^[A-Z]{3}$'),
 facts jsonb NOT NULL,
 digest text NOT NULL,
 reviewed_by bigint NOT NULL REFERENCES public.user_profiles(id),
 available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 UNIQUE(version_id,digest)
);
CREATE INDEX t12_candidates_cutoff ON erp_private.t12_payroll_candidates(company_id,branch_id,day,available_at,id);
CREATE INDEX t12_candidates_head ON erp_private.t12_payroll_candidates(version_id,id DESC);

ALTER TABLE erp_private.t08_payable_claims
 ALTER COLUMN candidate_id DROP NOT NULL,
 ALTER COLUMN alias_id DROP NOT NULL,
 ADD COLUMN workshop_candidate_id bigint REFERENCES erp_private.t12_payroll_candidates(id),
 ADD CONSTRAINT t12_one_pay_source CHECK((workshop_candidate_id IS NULL AND candidate_id IS NOT NULL AND alias_id IS NOT NULL)
 OR (workshop_candidate_id IS NOT NULL AND candidate_id IS NULL AND alias_id IS NULL));

CREATE TABLE erp_private.t12_payroll_corrections (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 claim_id bigint NOT NULL REFERENCES erp_private.t08_payable_claims(id),
 new_version bigint NOT NULL REFERENCES erp_private.t12_labour_versions(id),
 portion tstzmultirange NOT NULL CHECK(NOT isempty(portion)),
 amount numeric(16,2) NOT NULL CHECK(amount<=0),
 proposed_by bigint NOT NULL REFERENCES public.user_profiles(id),
 proposed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 approved_by bigint REFERENCES public.user_profiles(id),
 available_at timestamptz,
 approval_reason text,
 withdrawn_by bigint REFERENCES public.user_profiles(id),
 withdrawn_at timestamptz,
 withdrawal_reason text,
 CHECK((withdrawn_by IS NULL)=(withdrawn_at IS NULL)),
 CHECK(approved_by IS NULL OR (approved_by<>proposed_by AND available_at IS NOT NULL)),
 EXCLUDE USING gist(claim_id WITH =,portion WITH &&) WHERE(approved_by IS NOT NULL AND withdrawn_at IS NULL)
);
CREATE INDEX t12_payroll_corrections_claim ON erp_private.t12_payroll_corrections(claim_id,id);

CREATE TABLE erp_private.t12_correction_claims (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 correction_id bigint NOT NULL UNIQUE REFERENCES erp_private.t12_payroll_corrections(id),
 consumer_key uuid NOT NULL UNIQUE,
 received_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE FUNCTION erp_private.t12_workshop_conflicts(p_employee bigint,p_day date,p_exclude_line bigint DEFAULT NULL)
RETURNS tstzmultirange LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(range_agg(v.period),'{}') FROM erp_private.t12_labour_versions v
 WHERE v.employee_id=p_employee AND v.day=p_day AND v.line_id IS DISTINCT FROM p_exclude_line
   AND ((v.decision='approved' AND NOT v.voids_line AND NOT EXISTS(
        SELECT 1 FROM erp_private.t12_labour_versions newer WHERE newer.line_id=v.line_id AND newer.id>v.id AND newer.decision='approved'))
    OR (v.decision IS NULL AND erp_private.t12_labour_original_current(v.id) AND NOT EXISTS(
        SELECT 1 FROM erp_private.t12_labour_versions newer WHERE newer.line_id=v.line_id AND newer.id>v.id
        AND newer.decision IS DISTINCT FROM 'rejected')));
$$;

CREATE FUNCTION erp_private.t12_pay_basis(p_version bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' SET timezone='UTC' AS $$
DECLARE v erp_private.t12_labour_versions; assignment erp_private.t12_labour_assignments; ep erp_private.t03_employment_periods;
 f erp_private.t10_assessments; rule erp_private.t02_work_rule_versions; row record; daily jsonb:='[]';
 cal jsonb; wage jsonb; result jsonb; attended tstzmultirange:='{}'; recurring tstzmultirange:='{}'; fragment tstzmultirange;
 expected tstzmultirange; conflicting tstzmultirange; overtime tstzmultirange; payable tstzmultirange; day_span tstzrange; rate numeric;
BEGIN
 SELECT * INTO v FROM erp_private.t12_labour_versions WHERE id=p_version;
 IF v.id IS NULL THEN RETURN jsonb_build_object('status','unavailable'); END IF;
 SELECT * INTO assignment FROM erp_private.t12_labour_assignments WHERE id=v.assignment_id;
 SELECT af.* INTO f FROM erp_private.t10_assessments af JOIN erp_private.t10_job_cycles j ON j.assessment_id=af.id WHERE j.id=assignment.job_id;
 expected:=tstzmultirange(v.period);
 conflicting:=erp_private.t12_workshop_conflicts(v.employee_id,v.day,v.line_id);
 SELECT conflicting+coalesce(range_agg(fleet.work_period),'{}') INTO conflicting FROM erp_private.t08_fleet_work fleet
  WHERE fleet.employee_id=v.employee_id AND fleet.day=v.day AND fleet.work_period&&v.period;
 conflicting:=conflicting*expected;
 result:=jsonb_build_object('status','awaiting-supervisor','version',v.id,'day',v.day,'factual',expected::text,
  'conflicts',conflicting::text,'conflicted_minutes',erp_private.t08_minutes(conflicting),'minutes',erp_private.t08_minutes(expected),
  'cost_status',CASE WHEN v.cost_rate_id IS NULL THEN 'rate-required' ELSE 'valued' END);
 IF v.decision IS DISTINCT FROM 'approved' THEN RETURN result; END IF;
 IF EXISTS(SELECT 1 FROM erp_private.t12_labour_versions replacement WHERE replacement.line_id=v.line_id AND replacement.id>v.id AND replacement.decision IS DISTINCT FROM 'rejected')
 OR NOT erp_private.t12_labour_original_current(v.id) THEN RETURN result||'{"status":"stale-evidence"}'::jsonb; END IF;
 IF v.voids_line THEN RETURN result||'{"status":"voided","eligible":"{}","eligible_minutes":0}'::jsonb; END IF;
 SELECT * INTO ep FROM erp_private.t03_employment_periods p WHERE p.id=assignment.employment_id AND p.employee_id=v.employee_id
  AND p.company_id=f.company_id AND p.branch_id=f.branch_id AND p.work_period @> v.day;
 IF ep.id IS NULL THEN RETURN result||'{"status":"employment-review"}'::jsonb; END IF;
 day_span:=tstzrange(v.day::timestamp AT TIME ZONE 'Asia/Dubai',(v.day+1)::timestamp AT TIME ZONE 'Asia/Dubai','[)');
 FOR row IN SELECT s.id,s.attendance_date,s.entered_intervals,s.approved_at,erp_private.t08_attendance_digest(s) AS digest
   FROM public.employee_attendance_daily_summary s WHERE s.employee_id=v.employee_id AND s.attendance_date IN(v.day-1,v.day)
    AND s.approval_status IN('approved','locked') AND s.approved_at IS NOT NULL
    AND s.approved_by<>v.entered_by AND ep.work_period @> s.attendance_date
   ORDER BY s.attendance_date,s.id
 LOOP
  fragment:=erp_private.t08_attended(row.entered_intervals)*tstzmultirange(day_span);
  IF NOT isempty(fragment) THEN
   recurring:=recurring+(attended*fragment);
   attended:=attended+fragment;
   daily:=daily||jsonb_build_array(jsonb_build_object('id',row.id,'digest',row.digest,'approved_at',row.approved_at));
  END IF;
 END LOOP;
 attended:=attended-recurring;
 result:=result||jsonb_build_object('attendance',daily,'unmatched_minutes',erp_private.t08_minutes(expected-attended),'unmatched',(expected-attended)::text);
 IF isempty(expected*attended) THEN RETURN result||'{"status":"awaiting-attendance"}'::jsonb; END IF;
 IF EXISTS(SELECT 1 FROM public.employee_overtime_records prior WHERE prior.employee_id=v.employee_id AND prior.overtime_date=v.day
  AND prior.deleted_at IS NULL AND prior.approval_status='approved') THEN
  RETURN result||'{"status":"legacy-overtime-review"}'::jsonb; END IF;
 cal:=erp_private.t08_calendar_basis(v.employee_id,ep.company_id,v.day,
  (lower(assignment.work_window) AT TIME ZONE 'Asia/Dubai')::date IS DISTINCT FROM
  ((upper(assignment.work_window)-interval '1 microsecond') AT TIME ZONE 'Asia/Dubai')::date);
 IF cal IS NULL THEN RETURN result||'{"status":"schedule-review"}'::jsonb; END IF;
 IF cal->>'ineligible'='true' THEN RETURN result||'{"status":"no-eligible-time"}'::jsonb; END IF;
 SELECT coalesce(range_agg(tstzrange(lower(span)+make_interval(secs=>greatest(0,(cal->>'regular_minutes')::int*60-before_seconds)),
  upper(span),'[)')),'{}') INTO overtime FROM (
  SELECT span,sum(extract(epoch FROM upper(span)-lower(span))) OVER(ORDER BY span)
    -extract(epoch FROM upper(span)-lower(span)) AS before_seconds FROM unnest(attended) span
 ) work WHERE before_seconds+extract(epoch FROM upper(span)-lower(span))>(cal->>'regular_minutes')::int*60;
 payable:=(expected*overtime)-conflicting;
 result:=result||jsonb_build_object('eligible',payable::text,'eligible_minutes',erp_private.t08_minutes(payable));
 IF isempty(payable) THEN
  RETURN result||jsonb_build_object('status',CASE WHEN isempty(expected*overtime*conflicting) THEN 'no-eligible-time' ELSE 'overlap-held' END);
 END IF;
 SELECT * INTO rule FROM erp_private.t02_work_rule_versions r
 WHERE r.company_id=ep.company_id AND r.phase='approved' AND r.category=cal->>'category' AND r.effective_period @> v.day
  AND (r.priority=0 OR (r.priority=2 AND r.employee_id=v.employee_id) OR (r.priority=1 AND r.employee_group_id=ep.employee_category_id))
 ORDER BY r.priority DESC LIMIT 1;
 IF rule.id IS NULL THEN RETURN result||'{"status":"rule-review"}'::jsonb; END IF;
 wage:=erp_private.t08_wage_basis(v.employee_id,v.day,rule.id);
 IF wage IS NULL THEN RETURN result||'{"status":"salary-review"}'::jsonb; END IF;
 rate:=(wage->>'basis')::numeric*(rule.facts->>'rate_multiplier')::numeric/(rule.facts->>'monthly_hours')::numeric;
 RETURN result||jsonb_build_object('status','ready','rate',rate,'wage',wage,'rule',rule.id,'rule_digest',rule.digest,'calendar',cal,
  'workshop_cost_rate',v.cost_rate_id,'employment',ep.id,'company',ep.company_id,'branch',ep.branch_id,'supervisor',v.decided_by,'proof',v.version_id,'file',v.file_id);
END $$;

CREATE FUNCTION erp_private.t12_lock_labour_basis(p_version bigint,p_employee bigint,p_day date) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM erp_private.t12_day_lock(p_employee,p_day);
 PERFORM 1 FROM public.employees WHERE id=p_employee FOR SHARE;
 PERFORM 1 FROM public.employee_attendance_daily_summary WHERE employee_id=p_employee AND attendance_date IN(p_day-1,p_day)
  ORDER BY attendance_date,id FOR SHARE;
 PERFORM erp_private.t12_lock_labour_original(p_version);
END $$;

CREATE FUNCTION public.t12_labour_hr(p_operation uuid,p_version bigint,p_digest text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v erp_private.t12_labour_versions; f erp_private.t10_assessments; candidate bigint; basis jsonb; receipt jsonb; hash text;
 actor bigint:=public.current_user_profile_id();
BEGIN
 SELECT * INTO v FROM erp_private.t12_labour_versions WHERE id=p_version;
 SELECT af.* INTO f FROM erp_private.t12_labour_assignments a JOIN erp_private.t10_job_cycles j ON j.id=a.job_id
 JOIN erp_private.t10_assessments af ON af.id=j.assessment_id WHERE a.id=v.assignment_id;
 PERFORM erp_private.t11_scope('hr.workshop.labour.review',f.company_id,f.branch_id);
 PERFORM erp_private.t11_scope('hr.attendance.view',f.company_id,f.branch_id);
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 500 OR p_digest IS NULL THEN
  RAISE EXCEPTION 'Confirm the reconciled Workshop time and reason' USING ERRCODE='22023'; END IF;
 IF actor=v.entered_by OR actor=v.decided_by OR erp_private.t12_is_subject(actor,v.employee_id) THEN
  RAISE EXCEPTION 'An independent HR reviewer must reconcile Workshop time' USING ERRCODE='42501'; END IF;
 PERFORM erp_private.t12_lock_labour_basis(v.id,v.employee_id,v.day);
 hash:=erp_private.t02_digest(jsonb_build_array(p_version,p_digest,p_reason));
 receipt:=erp_private.t02_replay('t12-hr',p_operation,hash);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;
 basis:=erp_private.t12_pay_basis(v.id);
 IF basis->>'status'<>'ready' OR erp_private.t02_digest(basis) IS DISTINCT FROM p_digest THEN
  RAISE EXCEPTION 'Review the current approved attendance, proof and undisputed overtime segments' USING ERRCODE='PT409'; END IF;
 INSERT INTO erp_private.t12_payroll_candidates(version_id,employee_id,employment_id,company_id,branch_id,day,eligible,rate,currency,
  facts,digest,reviewed_by,reason)
 VALUES(v.id,v.employee_id,(basis->>'employment')::bigint,f.company_id,f.branch_id,v.day,(basis->>'eligible')::tstzmultirange,
  (basis->>'rate')::numeric,basis#>>'{wage,currency}',basis,p_digest,actor,btrim(p_reason))
 ON CONFLICT(version_id,digest) DO NOTHING RETURNING id INTO candidate;
 IF candidate IS NULL THEN SELECT id INTO candidate FROM erp_private.t12_payroll_candidates WHERE version_id=v.id AND digest=p_digest; END IF;
 RETURN erp_private.t02_save_receipt('t12-hr',p_operation,hash,jsonb_build_object('id',candidate,'version',v.id,
  'day',v.day,'eligible_minutes',basis->'eligible_minutes'));
END $$;

CREATE FUNCTION erp_private.t12_claim_workshop(p_candidate bigint,p_consumer uuid,p_portion tstzmultirange)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c erp_private.t12_payroll_candidates; claim erp_private.t08_payable_claims; identity bigint;
BEGIN
 SELECT * INTO c FROM erp_private.t12_payroll_candidates WHERE id=p_candidate;
 IF c.id IS NULL OR p_consumer IS NULL OR NOT coalesce(NOT isempty(p_portion) AND p_portion<@c.eligible,false) THEN
  RAISE EXCEPTION 'Claim the exact eligible Workshop segments' USING ERRCODE='22023'; END IF;
 PERFORM erp_private.t12_lock_labour_basis(c.version_id,c.employee_id,c.day);
 PERFORM pg_advisory_xact_lock(hashtextextended('fleet-time-claim:'||p_consumer,0));
 SELECT * INTO claim FROM erp_private.t08_payable_claims WHERE consumer_key=p_consumer;
 IF claim.id IS NOT NULL THEN
  IF ROW(claim.workshop_candidate_id,claim.claimed) IS DISTINCT FROM ROW(c.id,p_portion) THEN
   RAISE EXCEPTION 'Claim identity changed' USING ERRCODE='PT409'; END IF;
  RETURN claim.id;
 END IF;
 IF c.digest IS DISTINCT FROM erp_private.t02_digest(erp_private.t12_pay_basis(c.version_id)) OR EXISTS(
  SELECT 1 FROM erp_private.t08_payable_claims other WHERE other.employee_id=c.employee_id AND other.claimed&&p_portion) THEN
  RAISE EXCEPTION 'Workshop evidence changed or these intervals have already been claimed' USING ERRCODE='PT409'; END IF;
 INSERT INTO erp_private.t08_payable_claims(workshop_candidate_id,employee_id,consumer_key,claimed,amount,currency)
 VALUES(c.id,c.employee_id,p_consumer,p_portion,erp_private.t08_range_amount(c.eligible,p_portion,c.rate),c.currency)
 RETURNING id INTO identity;
 RETURN identity;
END $$;

CREATE FUNCTION erp_private.t12_correction_current(p_claim bigint,p_replacement bigint,p_portion tstzmultirange)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM erp_private.t08_payable_claims claim
 JOIN erp_private.t12_payroll_candidates candidate ON candidate.id=claim.workshop_candidate_id
 JOIN erp_private.t12_labour_versions earlier ON earlier.id=candidate.version_id
 JOIN erp_private.t12_labour_versions revised ON revised.line_id=earlier.line_id AND revised.id=p_replacement
 CROSS JOIN LATERAL(SELECT erp_private.t12_pay_basis(revised.id) AS value) current_basis
 WHERE claim.id=p_claim AND revised.id>=earlier.id AND revised.decision='approved' AND erp_private.t12_labour_original_current(revised.id)
   AND NOT EXISTS(SELECT 1 FROM erp_private.t12_labour_versions newer WHERE newer.line_id=revised.line_id AND newer.id>revised.id AND newer.decision IS DISTINCT FROM 'rejected')
   AND p_portion<@claim.claimed AND NOT isempty(p_portion)
   AND (revised.voids_line OR NOT(tstzmultirange(revised.period)&&p_portion)
     OR (current_basis.value->>'status' IN('ready','no-eligible-time','overlap-held') AND current_basis.value?'eligible'
       AND NOT((current_basis.value->>'eligible')::tstzmultirange&&p_portion))));
$$;

CREATE FUNCTION public.t12_labour_correction(p_operation uuid,p_claim bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE claim erp_private.t08_payable_claims; c erp_private.t12_payroll_candidates; row_data erp_private.t12_payroll_corrections;
 actor bigint:=public.current_user_profile_id(); keys text[]; note text; hash text; receipt jsonb; replacement bigint; span tstzmultirange;
BEGIN
 keys:=CASE p_action WHEN 'propose' THEN ARRAY['replacement','from','until'] WHEN 'approve' THEN ARRAY['correction'] WHEN 'withdraw' THEN ARRAY['correction'] END;
 IF keys IS NULL OR NOT erp_private.t05_fields(p_data,keys||ARRAY['reason']) THEN
  RAISE EXCEPTION 'Choose a linked Workshop correction' USING ERRCODE='22023'; END IF;
 SELECT * INTO claim FROM erp_private.t08_payable_claims WHERE id=p_claim;
 SELECT * INTO c FROM erp_private.t12_payroll_candidates WHERE id=claim.workshop_candidate_id;
 IF p_action='propose' THEN
  PERFORM erp_private.t11_scope('hr.workshop.labour.review',c.company_id,c.branch_id);
  PERFORM erp_private.t11_scope('hr.attendance.view',c.company_id,c.branch_id);
  replacement:=(p_data->>'replacement')::bigint;
  span:=tstzmultirange(erp_private.t12_interval((p_data->>'from')::timestamptz,(p_data->>'until')::timestamptz));
 ELSE
  PERFORM erp_private.t11_scope('hr.payroll.workshop.review',c.company_id,c.branch_id);
  PERFORM erp_private.t11_scope('hr.payroll.view',c.company_id,c.branch_id);
 END IF;
 IF erp_private.t12_is_subject(actor,c.employee_id) THEN RAISE EXCEPTION 'An independent reviewer must decide the adjustment' USING ERRCODE='42501'; END IF;
 PERFORM erp_private.t12_day_lock(c.employee_id,c.day);
 note:=erp_private.t10_text(p_data,'reason',1000);
 hash:=erp_private.t02_digest(jsonb_build_array(p_claim,p_action,p_data));
 receipt:=erp_private.t02_replay('t12-correction',p_operation,hash);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;
 IF p_action IN('approve','withdraw') THEN
  SELECT * INTO row_data FROM erp_private.t12_payroll_corrections WHERE id=(p_data->>'correction')::bigint AND claim_id=p_claim FOR UPDATE;
  IF row_data.id IS NULL OR row_data.proposed_by=actor OR row_data.withdrawn_at IS NOT NULL
   OR (p_action='approve' AND row_data.approved_by IS NOT NULL) THEN
   RAISE EXCEPTION 'A current independent Accounts correction is required' USING ERRCODE='PT409'; END IF;
  replacement:=row_data.new_version; span:=row_data.portion;
 END IF;
 PERFORM erp_private.t12_lock_labour_original(replacement);
 IF p_action='withdraw' THEN
  IF EXISTS(SELECT 1 FROM erp_private.t12_correction_claims sent WHERE sent.correction_id=row_data.id)
   OR (row_data.approved_by IS NOT NULL AND erp_private.t12_correction_current(p_claim,replacement,span)) THEN
   RAISE EXCEPTION 'Only an unused stale or pending adjustment can be withdrawn' USING ERRCODE='PT409'; END IF;
  UPDATE erp_private.t12_payroll_corrections SET withdrawn_by=actor,withdrawn_at=clock_timestamp(),withdrawal_reason=note WHERE id=row_data.id;
  RETURN erp_private.t02_save_receipt('t12-correction',p_operation,hash,jsonb_build_object('id',row_data.id,'day',c.day));
 END IF;
 IF NOT erp_private.t12_correction_current(p_claim,replacement,span) OR EXISTS(
  SELECT 1 FROM erp_private.t12_payroll_corrections current_row WHERE current_row.claim_id=p_claim
   AND current_row.approved_by IS NOT NULL AND current_row.withdrawn_at IS NULL AND current_row.portion&&span) THEN
  RAISE EXCEPTION 'Correct only unadjusted claimed time removed by a current linked signed revision' USING ERRCODE='PT409'; END IF;
 IF p_action='propose' THEN
  INSERT INTO erp_private.t12_payroll_corrections(claim_id,new_version,portion,amount,proposed_by,reason)
  VALUES(p_claim,replacement,span,-erp_private.t08_range_amount(c.eligible,span,c.rate),actor,note) RETURNING * INTO row_data;
 ELSE
  UPDATE erp_private.t12_payroll_corrections SET approved_by=actor,available_at=clock_timestamp(),approval_reason=note WHERE id=row_data.id;
 END IF;
 RETURN erp_private.t02_save_receipt('t12-correction',p_operation,hash,jsonb_build_object('id',row_data.id,'day',c.day));
END $$;

CREATE FUNCTION erp_private.t12_claim_workshop_correction(p_correction bigint,p_consumer uuid)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE row_data erp_private.t12_payroll_corrections; c erp_private.t12_payroll_candidates; prior erp_private.t12_correction_claims; identity bigint;
BEGIN
 SELECT * INTO row_data FROM erp_private.t12_payroll_corrections WHERE id=p_correction AND approved_by IS NOT NULL AND withdrawn_at IS NULL;
 SELECT p.* INTO c FROM erp_private.t08_payable_claims claim JOIN erp_private.t12_payroll_candidates p ON p.id=claim.workshop_candidate_id
 WHERE claim.id=row_data.claim_id;
 IF c.id IS NULL OR p_consumer IS NULL THEN RAISE EXCEPTION 'Use an approved Workshop adjustment' USING ERRCODE='22023'; END IF;
 PERFORM erp_private.t12_day_lock(c.employee_id,c.day);
 SELECT * INTO prior FROM erp_private.t12_correction_claims WHERE correction_id=p_correction;
 IF prior.id IS NOT NULL THEN
  IF prior.consumer_key IS DISTINCT FROM p_consumer THEN RAISE EXCEPTION 'Adjustment already used' USING ERRCODE='PT409'; END IF;
  RETURN prior.id;
 END IF;
 PERFORM erp_private.t12_lock_labour_original(row_data.new_version);
 IF NOT erp_private.t12_correction_current(row_data.claim_id,row_data.new_version,row_data.portion) THEN
  RAISE EXCEPTION 'The approved correction evidence changed' USING ERRCODE='PT409'; END IF;
 INSERT INTO erp_private.t12_correction_claims(correction_id,consumer_key) VALUES(p_correction,p_consumer) RETURNING id INTO identity;
 RETURN identity;
END $$;

DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['t12_payroll_candidates','t12_payroll_corrections','t12_correction_claims'] LOOP
  EXECUTE format('ALTER TABLE erp_private.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('REVOKE ALL ON erp_private.%I FROM PUBLIC,anon,authenticated,service_role',name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION erp_private.t12_workshop_conflicts(bigint,date,bigint),erp_private.t12_pay_basis(bigint),
 erp_private.t12_lock_labour_basis(bigint,bigint,date),erp_private.t12_claim_workshop(bigint,uuid,tstzmultirange),
 erp_private.t12_correction_current(bigint,bigint,tstzmultirange),erp_private.t12_claim_workshop_correction(bigint,uuid),
 public.t12_labour_hr(uuid,bigint,text,text),public.t12_labour_correction(uuid,bigint,text,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t12_labour_hr(uuid,bigint,text,text),public.t12_labour_correction(uuid,bigint,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION erp_private.t08_source_basis(p_work bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' SET timezone='UTC' AS $$
DECLARE w erp_private.t08_fleet_work; review erp_private.t08_time_reviews; link erp_private.t08_attendance_links;
 rule erp_private.t02_work_rule_versions; row record; attendance_refs jsonb:='[]'; daily_inputs jsonb:='[]';
 cal jsonb; wage jsonb; eligible tstzmultirange; attended tstzmultirange:='{}'; disputed tstzmultirange:='{}';
 overtime tstzmultirange; matched tstzmultirange; accepted tstzmultirange:='{}'; part tstzmultirange; rate numeric; day_span tstzrange;
BEGIN
 SELECT * INTO w FROM erp_private.t08_fleet_work WHERE id=p_work;
 IF w.id IS NULL THEN RETURN jsonb_build_object('status','unavailable'); END IF;
 SELECT * INTO review FROM erp_private.t08_time_reviews WHERE work_id=w.id ORDER BY id DESC LIMIT 1;
 IF review.id IS NULL THEN RETURN jsonb_build_object('status','awaiting-operations'); END IF;
 matched:=erp_private.t08_current_match(w.id,review.id);
 IF isempty(matched)
 THEN RETURN jsonb_build_object('status','awaiting-operations'); END IF;
 SELECT * INTO link FROM erp_private.t08_attendance_links WHERE work_id=w.id ORDER BY id DESC LIMIT 1;
 FOR row IN SELECT l.id,l.accepted,l.attendance_id,l.attendance_digest,s.approved_at
    FROM erp_private.t08_attendance_links l JOIN public.employee_attendance_daily_summary s ON s.id=l.attendance_id
    WHERE l.decision_id=link.decision_id AND l.work_id=w.id AND s.approval_status IN('approved','locked')
      AND s.approved_at IS NOT NULL AND s.approved_by<>w.entered_by AND l.attendance_digest=erp_private.t08_attendance_digest(s)
    ORDER BY l.id
 LOOP
   accepted:=accepted+row.accepted;
   attendance_refs:=attendance_refs||jsonb_build_array(jsonb_build_object('id',row.id,'attendance',row.attendance_id,
      'digest',row.attendance_digest,'approved_at',row.approved_at));
 END LOOP;
 IF isempty(accepted) THEN RETURN jsonb_build_object('status','awaiting-attendance'); END IF;
 -- Legacy totals have no time range. Until an authoritative mapping resolves
 -- them, the affected employee/day needs review before another source can pay.
 IF EXISTS(SELECT 1 FROM public.employee_overtime_records prior WHERE prior.employee_id=w.employee_id AND prior.overtime_date=w.day
   AND prior.deleted_at IS NULL AND prior.approval_status='approved')
 THEN RETURN jsonb_build_object('status','legacy-overtime-review'); END IF;
 cal:=erp_private.t08_calendar_basis(w.employee_id,w.employer_company_id,w.day,w.overnight);
 IF cal IS NULL THEN RETURN jsonb_build_object('status','schedule-review'); END IF;
 IF cal->>'ineligible'='true' THEN RETURN jsonb_build_object('status','no-eligible-time'); END IF;
 SELECT r.* INTO rule FROM erp_private.t02_work_rule_versions r
 JOIN erp_private.t03_employment_periods ep ON ep.id=w.employment_id AND ep.work_period @> w.day
 WHERE r.company_id=w.employer_company_id AND r.phase='approved' AND r.category=cal->>'category' AND r.effective_period @> w.day
   AND (r.priority=0 OR (r.priority=2 AND r.employee_id=w.employee_id) OR (r.priority=1 AND r.employee_group_id=ep.employee_category_id))
 ORDER BY r.priority DESC LIMIT 1;
 IF rule.id IS NULL THEN RETURN jsonb_build_object('status','rule-review'); END IF;
 day_span:=tstzrange(w.day::timestamp AT TIME ZONE 'Asia/Dubai',(w.day+1)::timestamp AT TIME ZONE 'Asia/Dubai','[)');
 FOR row IN SELECT s.id,erp_private.t08_attendance_digest(s) digest,s.approved_at,s.entered_intervals
  FROM public.employee_attendance_daily_summary s WHERE s.employee_id=w.employee_id AND s.attendance_date IN(w.day-1,w.day)
    AND s.approval_status IN('approved','locked') AND s.approved_at IS NOT NULL AND s.approved_by<>w.entered_by
    AND EXISTS(SELECT 1 FROM erp_private.t03_employment_periods p WHERE p.id=w.employment_id AND p.work_period @> s.attendance_date)
    ORDER BY s.attendance_date
 LOOP
   part:=erp_private.t08_attended(row.entered_intervals)*tstzmultirange(day_span);
   IF NOT isempty(part) THEN
     disputed:=disputed+(attended*part);
     attended:=attended+part;
     daily_inputs:=daily_inputs||jsonb_build_array(jsonb_build_object('id',row.id,'digest',row.digest,'approved_at',row.approved_at));
   END IF;
 END LOOP;
 attended:=attended-disputed;
 SELECT coalesce(range_agg(tstzrange(lower(span)+make_interval(secs=>greatest(0,(cal->>'regular_minutes')::int*60-before_seconds)),
              upper(span),'[)')),'{}') INTO overtime FROM (
   SELECT span,sum(extract(epoch FROM upper(span)-lower(span))) OVER(ORDER BY span)-extract(epoch FROM upper(span)-lower(span)) AS before_seconds
   FROM unnest(attended) span
 ) spans WHERE before_seconds+extract(epoch FROM upper(span)-lower(span))>(cal->>'regular_minutes')::int*60;
 eligible:=(matched*accepted*overtime)-erp_private.t12_workshop_conflicts(w.employee_id,w.day);
 IF isempty(eligible) THEN RETURN jsonb_build_object('status','no-eligible-time'); END IF;
 wage:=erp_private.t08_wage_basis(w.employee_id,w.day,rule.id);
 IF wage IS NULL THEN RETURN jsonb_build_object('status','salary-review'); END IF;
 rate:=(wage->>'basis')::numeric*(rule.facts->>'rate_multiplier')::numeric/(rule.facts->>'monthly_hours')::numeric;
 RETURN jsonb_build_object('status','ready','eligible',eligible::text,'review',review.id,'attendance_link',link.id,
   'attendance_links',attendance_refs,'daily_attendance',daily_inputs,'employment',w.employment_id,'day',w.day,'calendar',cal,'rule',rule.id,
   'rule_revision',rule.revision,'rule_digest',rule.digest,'wage',wage,'rate',rate,
   'multiplier',rule.facts->'rate_multiplier','monthly_hours',rule.facts->'monthly_hours');
END;
$$;


COMMIT;

