BEGIN;

-- Freeze the complete repayment terms in the immutable submission event.
-- The monthly line amount can differ from the contractual instalment after partial collection.
CREATE FUNCTION erp_private.t15_recovery_schedule_snapshot(p_version uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE schedules jsonb; payroll_digest text; expected_count bigint; captured_count bigint;
BEGIN
 SELECT count(*) INTO expected_count FROM erp_private.t14_lines l
 WHERE l.version_id=p_version AND l.category='recovery' AND l.kind='deduction' AND l.amount>0;
 IF expected_count=0 THEN RETURN NULL; END IF;

 SELECT v.digest INTO STRICT payroll_digest FROM erp_private.t14_versions v WHERE v.id=p_version;
 SELECT count(*),jsonb_agg(jsonb_build_object(
   'case',s.case_id::text,'schedule',s.id::text,'employee',l.employee_id::text,'line',l.id,
   'mode',s.mode,'currency',l.currency,'principal',s.principal::text,'period_deduction',l.amount::text,
   'instalments',terms.items
 ) ORDER BY l.employee_id,l.id)
 INTO captured_count,schedules
 FROM erp_private.t14_lines l
 JOIN erp_private.t13_schedules s ON s.id=(l.source->>'schedule')::bigint AND s.case_id=(l.source->>'case')::bigint
 CROSS JOIN LATERAL (
   SELECT count(*) AS count,sum(i.amount) AS principal,
     jsonb_agg(jsonb_build_object('month',i.due_month,'amount',i.amount::text) ORDER BY i.due_month) AS items
   FROM erp_private.t13_instalments i WHERE i.schedule_id=s.id
 ) terms
 WHERE l.version_id=p_version AND l.category='recovery' AND l.kind='deduction' AND l.amount>0
   AND terms.count>0 AND terms.principal=s.principal;
 IF captured_count<>expected_count THEN
   RAISE EXCEPTION 'The complete recovery schedule is unavailable for this payroll version' USING ERRCODE='PT409';
 END IF;
 RETURN jsonb_build_object('schedules',schedules,
   'digest',erp_private.t02_digest(jsonb_build_array('t15-recovery-schedule-v1',p_version,payroll_digest,schedules)));
END $$;

CREATE FUNCTION erp_private.t15_retained_recovery_schedule(p_review uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT e.facts->'recovery_schedule_snapshot' FROM erp_private.t15_review_events e
 WHERE e.review_id=p_review AND e.kind='submitted' ORDER BY e.id LIMIT 1;
$$;

REVOKE ALL ON FUNCTION erp_private.t15_recovery_schedule_snapshot(uuid),erp_private.t15_retained_recovery_schedule(uuid)
 FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.t15_payroll_review_command(p_operation uuid,p_company bigint,p_branch bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE
 actor bigint:=public.current_user_profile_id(); mode text; note text:=btrim(p_data->>'reason'); hash text;
 anchor erp_private.t14_runs; v erp_private.t14_versions; review erp_private.t15_reviews;
 review_id_input uuid; requested_version uuid; requested_digest text:=p_data->>'digest';
 result jsonb; receipt jsonb; event_kind text; event_facts jsonb:='{}';
 count_claims int; release_count int; recovery_snapshot jsonb; current_recovery_snapshot jsonb;
BEGIN
 mode:=CASE WHEN p_action IN('submit','withdraw','request-release') THEN 'submit'
            WHEN p_action IN('approve','reject','release','decline-release') THEN 'approve' END;
 IF actor IS NULL OR p_operation IS NULL OR mode IS NULL OR p_company IS NULL OR p_branch IS NULL
    OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR NOT coalesce(length(note) BETWEEN 1 AND 2000,false)
    OR NOT coalesce(requested_digest~'^[a-f0-9]{64}$',false) THEN
   RAISE EXCEPTION 'Provide the exact payroll version, decision and reason' USING ERRCODE='22023';
 END IF;
 IF NOT erp_private.t15_review_permissions(p_company,p_branch,mode) THEN
   RAISE EXCEPTION 'Scoped payroll review authority is unavailable' USING ERRCODE='42501';
 END IF;
 requested_version:=(p_data->>'version')::uuid;
 IF requested_version IS NULL THEN RAISE EXCEPTION 'Exact payroll version required' USING ERRCODE='22023'; END IF;
 IF p_action='submit' THEN
   SELECT * INTO anchor FROM erp_private.t14_runs WHERE id=(p_data->>'run')::uuid AND company_id=p_company AND branch_id=p_branch;
 ELSE
   review_id_input:=(p_data->>'review')::uuid;
   SELECT r.* INTO anchor FROM erp_private.t14_runs r JOIN erp_private.t15_reviews h ON h.run_id=r.id
    WHERE h.id=review_id_input AND r.company_id=p_company AND r.branch_id=p_branch;
 END IF;
 IF anchor.id IS NULL THEN RAISE EXCEPTION 'Payroll review unavailable for this scope' USING ERRCODE='42501'; END IF;
 hash:=erp_private.t02_digest(jsonb_build_array(p_company,p_branch,p_action,p_data));
 receipt:=erp_private.t02_replay('t15-payroll-review',p_operation,hash);
 IF receipt IS NOT NULL THEN
   IF NOT erp_private.t15_review_permissions(p_company,p_branch,mode) THEN
     RAISE EXCEPTION 'Payroll review authority expired before this retry' USING ERRCODE='42501';
   END IF;
   RETURN receipt;
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('t14-payroll:'||p_company,0));
 PERFORM 1 FROM erp_private.t14_runs WHERE id=anchor.id FOR UPDATE;
 IF p_action='submit' THEN
   SELECT * INTO v FROM erp_private.t14_versions WHERE run_id=anchor.id ORDER BY number DESC LIMIT 1;
   IF v.id IS DISTINCT FROM requested_version OR v.digest IS DISTINCT FROM requested_digest OR EXISTS(
        SELECT 1 FROM erp_private.t15_reviews h WHERE h.run_id=anchor.id AND (h.version_id=v.id OR h.state IN('submitted','approved'))) THEN
     RAISE EXCEPTION 'Start from the latest unused payroll calculation' USING ERRCODE='PT409';
   END IF;
   IF EXISTS(SELECT 1 FROM erp_private.t14_results e WHERE e.version_id=v.id AND e.state<>'ready')
     OR (v.exception_count>0 AND (p_data->'acknowledge_exceptions') IS DISTINCT FROM 'true'::jsonb) THEN
     RAISE EXCEPTION 'Resolve payroll holds and acknowledge the reviewed exceptions first' USING ERRCODE='PT409';
   END IF;
   PERFORM erp_private.t15_assert_current(anchor.id,v.id);
   INSERT INTO erp_private.t15_reviews(run_id,version_id,digest,submitted_by,acknowledged_count)
   VALUES(anchor.id,v.id,v.digest,actor,v.exception_count) RETURNING * INTO review;
   event_kind:='submitted';
   event_facts:=jsonb_build_object('exception_count',v.exception_count,'source_digest',v.source_digest,'rule_digest',v.rule_digest);
   recovery_snapshot:=erp_private.t15_recovery_schedule_snapshot(v.id);
   IF recovery_snapshot IS NOT NULL THEN
     event_facts:=event_facts||jsonb_build_object('recovery_schedule_snapshot',recovery_snapshot);
   END IF;
 ELSE
   SELECT * INTO review FROM erp_private.t15_reviews WHERE id=review_id_input AND run_id=anchor.id FOR UPDATE;
   IF review.version_id IS DISTINCT FROM requested_version OR review.digest IS DISTINCT FROM requested_digest THEN
     RAISE EXCEPTION 'The requested action does not match the retained payroll review' USING ERRCODE='PT409';
   END IF;
   IF p_action IN('approve','reject') THEN
     IF review.state<>'submitted' THEN RAISE EXCEPTION 'This submission already has a decision' USING ERRCODE='PT409'; END IF;
     IF NOT erp_private.t15_independent(review.version_id,actor,review.submitted_by) THEN
       RAISE EXCEPTION 'An independent GM decision is required for this payroll' USING ERRCODE='42501';
     END IF;
     IF p_action='approve' THEN
       PERFORM erp_private.t15_assert_current(anchor.id,review.version_id);
       recovery_snapshot:=erp_private.t15_retained_recovery_schedule(review.id);
       current_recovery_snapshot:=erp_private.t15_recovery_schedule_snapshot(review.version_id);
       IF recovery_snapshot IS NULL AND current_recovery_snapshot IS NOT NULL THEN
         RAISE EXCEPTION 'Withdraw and recalculate this submission to retain the exact recovery schedule' USING ERRCODE='PT409';
       END IF;
       IF recovery_snapshot IS DISTINCT FROM current_recovery_snapshot
          OR (p_data->>'recovery_schedule_digest') IS DISTINCT FROM (recovery_snapshot->>'digest') THEN
         RAISE EXCEPTION 'Review and confirm the complete retained recovery schedule on this exact payroll version' USING ERRCODE='PT409';
       END IF;
       count_claims:=erp_private.t15_reserve_approval(review.id,review.version_id);
       DELETE FROM erp_private.t14_draft_usage WHERE run_id=anchor.id;
       event_facts:=jsonb_build_object('claim_count',count_claims);
       IF recovery_snapshot IS NOT NULL THEN
         event_facts:=event_facts||jsonb_build_object('recovery_schedule_digest',recovery_snapshot->>'digest');
       END IF;
     END IF;
     event_kind:=CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END;
     UPDATE erp_private.t15_reviews SET state=event_kind,decided_by=actor,decided_at=clock_timestamp(),
        claim_count=coalesce(count_claims,0) WHERE id=review.id RETURNING * INTO review;
   ELSIF p_action='withdraw' THEN
     IF review.state<>'submitted' THEN RAISE EXCEPTION 'Only an undecided submission can be withdrawn' USING ERRCODE='PT409'; END IF;
     UPDATE erp_private.t15_reviews SET state='withdrawn' WHERE id=review.id RETURNING * INTO review;
     event_kind:='withdrawn';
   ELSIF p_action='request-release' THEN
     IF review.state<>'approved' OR review.replacement_requested_by IS NOT NULL
        OR NOT erp_private.t15_replacement_eligible(review.id) THEN
       RAISE EXCEPTION 'The current issuance or settlement state prevents replacement' USING ERRCODE='PT409';
     END IF;
     UPDATE erp_private.t15_reviews SET replacement_requested_by=actor WHERE id=review.id RETURNING * INTO review;
     event_kind:='replacement-requested';
     event_facts:=jsonb_build_object('bank_state',erp_private.t15_bank_state(review.id));
   ELSE
     IF review.state<>'approved' OR review.replacement_requested_by IS NULL THEN
       RAISE EXCEPTION 'The approved version needs an explicit Accounts replacement request' USING ERRCODE='PT409';
     END IF;
     IF actor=review.replacement_requested_by OR NOT erp_private.t15_independent(review.version_id,actor,review.submitted_by) THEN
       RAISE EXCEPTION 'An independent replacement decision is required' USING ERRCODE='42501';
     END IF;
     IF p_action='release' THEN
       IF NOT erp_private.t15_replacement_eligible(review.id) THEN
         RAISE EXCEPTION 'Uncertain submission or settled pay must retain the original claims' USING ERRCODE='PT409';
       END IF;
       release_count:=erp_private.t15_release_approval(review.id,review.version_id,note);
       UPDATE erp_private.t15_reviews SET state='superseded',replacement_requested_by=NULL WHERE id=review.id RETURNING * INTO review;
       event_kind:='superseded';
       event_facts:=jsonb_build_object('released_claims',release_count,'bank_state',erp_private.t15_bank_state(review.id));
     ELSE
       UPDATE erp_private.t15_reviews SET replacement_requested_by=NULL WHERE id=review.id RETURNING * INTO review;
       event_kind:='replacement-declined';
     END IF;
   END IF;
 END IF;
 IF NOT erp_private.t15_review_permissions(p_company,p_branch,mode) THEN
   RAISE EXCEPTION 'Payroll review authority expired before this decision' USING ERRCODE='42501';
 END IF;
 INSERT INTO erp_private.t15_review_events(review_id,kind,actor_id,reason,facts) VALUES(review.id,event_kind,actor,note,event_facts);
 result:=jsonb_build_object('review',review.id,'run',review.run_id,'version',review.version_id,'digest',review.digest,
   'state',review.state,'claims_count',review.claim_count,'action',p_action);
 RETURN erp_private.t02_save_receipt('t15-payroll-review',p_operation,hash,result);
END $$;

CREATE OR REPLACE FUNCTION erp_private.t15_sealed_version(p_review uuid,p_version uuid,p_digest text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE review erp_private.t15_reviews; anchor erp_private.t14_runs; v erp_private.t14_versions; company bigint; bank_state text;
 recovery_snapshot jsonb;
BEGIN
 SELECT r.company_id INTO company FROM erp_private.t15_reviews h JOIN erp_private.t14_runs r ON r.id=h.run_id WHERE h.id=p_review;
 IF company IS NULL THEN RAISE EXCEPTION 'Approved payroll seal unavailable' USING ERRCODE='PT409'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('t14-payroll:'||company,0));
 SELECT r.* INTO anchor FROM erp_private.t15_reviews h JOIN erp_private.t14_runs r ON r.id=h.run_id WHERE h.id=p_review FOR UPDATE OF r;
 SELECT * INTO review FROM erp_private.t15_reviews WHERE id=p_review FOR UPDATE;
 SELECT * INTO v FROM erp_private.t14_versions WHERE id=p_version AND run_id=anchor.id;
 bank_state:=erp_private.t15_bank_state(p_review);
 IF review.state<>'approved' OR review.version_id IS DISTINCT FROM p_version OR
   review.digest IS DISTINCT FROM p_digest OR v.digest IS DISTINCT FROM p_digest OR review.replacement_requested_by IS NOT NULL
   OR bank_state NOT IN('not-issued','prepared') THEN
   RAISE EXCEPTION 'The exact approval is unavailable for a regular issue' USING ERRCODE='PT409';
 END IF;
 PERFORM erp_private.t15_assert_current(anchor.id,p_version);
 recovery_snapshot:=erp_private.t15_retained_recovery_schedule(p_review);
 IF recovery_snapshot IS NOT NULL AND (
   recovery_snapshot IS DISTINCT FROM erp_private.t15_recovery_schedule_snapshot(p_version)
   OR NOT EXISTS(SELECT 1 FROM erp_private.t15_review_events e WHERE e.review_id=p_review AND e.kind='approved'
     AND e.actor_id=review.decided_by AND e.facts->>'recovery_schedule_digest'=recovery_snapshot->>'digest')
 ) THEN
   RAISE EXCEPTION 'The complete approved recovery schedule is unavailable for a regular issue' USING ERRCODE='PT409';
 END IF;
 PERFORM erp_private.t15_assert_reservations(p_review,p_version);
 RETURN jsonb_build_object('run',anchor.id,'version',v.id,'review',review.id,'gm_actor',review.decided_by,
   'company',anchor.company_id,'branch',anchor.branch_id,'month',anchor.month,'digest',v.digest,
   'source_digest',v.source_digest,'rule_digest',v.rule_digest,'totals',v.totals,'bank_state',bank_state);
END $$;

CREATE OR REPLACE FUNCTION public.t15_payroll_review_workspace(p_company bigint,p_branch bigint,p_month date,p_review uuid DEFAULT NULL,
 p_employee bigint DEFAULT NULL,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE
 can_submit boolean; can_approve boolean; candidate_available boolean; independent boolean; allow_replacement boolean;
 anchor erp_private.t14_runs; latest erp_private.t14_versions; selected erp_private.t14_versions;
 current_review erp_private.t15_reviews; person erp_private.t14_results; actor bigint:=public.current_user_profile_id();
 draft jsonb; item jsonb; detail jsonb; held_count int; cursor_id bigint;
 recovery_snapshot jsonb; recovery_required boolean;
 reviews jsonb:='[]'; employees jsonb:='[]'; events jsonb:='[]'; actions text[]:=ARRAY[]::text[];
BEGIN
 can_submit:=erp_private.t15_review_permissions(p_company,p_branch,'submit');
 can_approve:=erp_private.t15_review_permissions(p_company,p_branch,'approve');
 IF NOT(can_submit OR can_approve) THEN RAISE EXCEPTION 'Payroll review workspace unavailable for this scope' USING ERRCODE='42501'; END IF;
 IF p_month IS NULL OR NOT isfinite(p_month) OR p_month<>date_trunc('month',p_month::timestamp)::date
    OR p_before<=0 OR p_employee<=0 THEN
   RAISE EXCEPTION 'Use an exact monthly payroll scope and valid employee selection' USING ERRCODE='22023';
 END IF;
 SELECT * INTO anchor FROM erp_private.t14_runs WHERE company_id=p_company AND branch_id=p_branch AND month=p_month;
 SELECT * INTO latest FROM erp_private.t14_versions WHERE run_id=anchor.id ORDER BY number DESC LIMIT 1;
 IF latest.id IS NOT NULL THEN
   SELECT count(*) INTO held_count FROM erp_private.t14_results WHERE version_id=latest.id AND state<>'ready';
   candidate_available:=can_submit AND held_count=0 AND NOT EXISTS(
     SELECT 1 FROM erp_private.t15_reviews r WHERE r.run_id=anchor.id AND (r.version_id=latest.id OR r.state IN('submitted','approved'))
   );
   draft:=jsonb_build_object('run',anchor.id,'version',latest.id,'number',latest.number,'month',anchor.month,'cutoff',latest.cutoff,
     'digest',latest.digest,'source_digest',latest.source_digest,'rule_digest',latest.rule_digest,'totals',latest.totals,
     'exception_count',latest.exception_count,'blocking_count',held_count,'can_submit',candidate_available);
 END IF;
 SELECT coalesce(jsonb_agg(erp_private.t15_review_summary(chosen,v,anchor.month)
    ORDER BY v.number DESC),'[]') INTO reviews
 FROM (SELECT r.* FROM erp_private.t15_reviews r WHERE r.run_id=anchor.id ORDER BY r.submitted_at DESC LIMIT 100) chosen
 JOIN erp_private.t14_versions v ON v.id=chosen.version_id;
 IF p_review IS NOT NULL THEN
   SELECT * INTO current_review FROM erp_private.t15_reviews WHERE id=p_review AND run_id=anchor.id;
   IF current_review.id IS NULL THEN RAISE EXCEPTION 'Payroll review unavailable for this scope' USING ERRCODE='42501'; END IF;
   SELECT * INTO selected FROM erp_private.t14_versions WHERE id=current_review.version_id;
   recovery_snapshot:=erp_private.t15_retained_recovery_schedule(current_review.id);
   recovery_required:=EXISTS(SELECT 1 FROM erp_private.t14_lines l WHERE l.version_id=selected.id
     AND l.category='recovery' AND l.kind='deduction' AND l.amount>0);
   independent:=can_approve AND erp_private.t15_independent(selected.id,actor,current_review.submitted_by);
   allow_replacement:=erp_private.t15_replacement_eligible(current_review.id);
   IF current_review.state='submitted' THEN
     IF can_submit THEN actions:=array_append(actions,'withdraw'); END IF;
     IF independent THEN
       IF NOT recovery_required OR recovery_snapshot IS NOT NULL THEN actions:=array_append(actions,'approve'); END IF;
       actions:=array_append(actions,'reject');
     END IF;
   ELSIF current_review.state='approved' THEN
     IF can_submit AND allow_replacement AND current_review.replacement_requested_by IS NULL THEN
       actions:=array_append(actions,'request-release');
     END IF;
     IF independent AND current_review.replacement_requested_by IS NOT NULL AND actor<>current_review.replacement_requested_by THEN
       IF allow_replacement THEN actions:=array_append(actions,'release'); END IF;
       actions:=array_append(actions,'decline-release');
     END IF;
   END IF;
   SELECT coalesce(jsonb_agg(jsonb_build_object('kind',x.kind,'date',x.recorded_at,'reason',x.reason)
      ORDER BY x.recorded_at,x.id),'[]') INTO events
   FROM (
     SELECT e.kind,e.recorded_at,e.reason,e.id FROM erp_private.t15_review_events e WHERE e.review_id=p_review
     UNION ALL
     SELECT 'bank-'||b.kind,b.recorded_at,'Verified payroll transfer status',b.id
       FROM erp_private.t15_bank_events b WHERE b.review_id=p_review
   ) x;
   SELECT count(*) INTO held_count FROM erp_private.t14_results WHERE version_id=selected.id AND state<>'ready';
   item:=erp_private.t15_review_summary(current_review,selected,anchor.month)
     ||jsonb_build_object('totals',selected.totals,'exception_count',selected.exception_count,'blocking_count',held_count,
       'source_digest',selected.source_digest,'rule_digest',selected.rule_digest,'actions',actions,'events',events,
       'claims_count',current_review.claim_count,'recovery_schedule_required',recovery_required,
       'recovery_schedule_snapshot',recovery_snapshot,
       'submitter_label',(SELECT full_name FROM public.user_profiles WHERE id=current_review.submitted_by),
       'approver_label',(SELECT full_name FROM public.user_profiles WHERE id=current_review.decided_by));
 ELSE
   selected:=latest;
 END IF;
 IF selected.id IS NOT NULL THEN
   WITH page AS(
     SELECT e.*,row_number() OVER(ORDER BY e.employee_id) AS position
     FROM erp_private.t14_results e WHERE e.version_id=selected.id AND (p_before IS NULL OR e.employee_id>p_before)
     ORDER BY e.employee_id LIMIT 51
   )
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.employee_id,'name',e.employee_name,'employment_ids',e.employment_ids,
       'currency',e.currency,'gross',e.gross::text,'deductions',e.deductions::text,'net',e.net::text,
       'state',e.state,'exception_count',jsonb_array_length(e.exceptions)) ORDER BY e.employee_id) FILTER(WHERE e.position<=50),'[]'),
     CASE WHEN count(*)>50 THEN max(e.employee_id) FILTER(WHERE e.position<=50) END
   INTO employees,cursor_id FROM page e;
 END IF;
 IF p_employee IS NOT NULL THEN
   SELECT * INTO person FROM erp_private.t14_results e WHERE e.version_id=selected.id AND e.employee_id=p_employee;
   IF person.employee_id IS NULL THEN RAISE EXCEPTION 'Employee payroll detail unavailable for this scope' USING ERRCODE='42501'; END IF;
   detail:=jsonb_build_object('id',p_employee,'name',person.employee_name,'policies',person.policy_snapshots,
     'exceptions',(SELECT coalesce(jsonb_agg(CASE WHEN jsonb_typeof(x.value->'source')='object'
         THEN jsonb_set(x.value,'{source}',(x.value->'source')-'evidence_version') ELSE x.value END ORDER BY x.ordinal),'[]')
       FROM jsonb_array_elements(person.exceptions) WITH ORDINALITY x(value,ordinal)),
     'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'key',l.key,'category',l.category,'kind',l.kind,
          'amount',l.amount::text,'currency',l.currency,'quantity',l.quantity::text,'unit',l.unit,'rate',l.rate::text,
          'original_on',l.original_on,'available_at',l.available_at,'source',l.source-'evidence_version','reason',l.reason)
          ORDER BY l.original_on,l.category,l.key),'[]')
       FROM erp_private.t14_lines l WHERE l.version_id=selected.id AND l.employee_id=p_employee));
 END IF;
 RETURN jsonb_build_object('can_submit',can_submit,'can_approve',can_approve,'draft',draft,'reviews',reviews,'review',item,
  'employees',employees,'detail',detail,'next_before',cursor_id);
END $$;

CREATE OR REPLACE FUNCTION erp_private.t13_accounts_command(p_action text,p_case bigint,p_data jsonb,p_actor bigint,p_note text)
RETURNS bigint LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 c erp_private.t13_cases; h erp_private.t13_hr_reviews; policy_row erp_private.t13_policies;
 totals jsonb; e bigint; d date; first_allowed date; previous_month date; i jsonb; item_amount numeric; sum_amount numeric:=0;
 result bigint; quantity numeric; mode text; original erp_private.t13_allocations; pin erp_private.t13_payroll_pins;
 reserved numeric;
BEGIN
 SELECT * INTO STRICT c FROM erp_private.t13_cases WHERE id=p_case;
 SELECT * INTO h FROM erp_private.t13_hr_reviews WHERE case_id=p_case ORDER BY id DESC LIMIT 1;
 totals:=erp_private.t13_financial_summary(c.id);
 IF p_action='reconcile' THEN
   quantity:=erp_private.t13_amount(p_data,'actual_cost',true);
   IF (c.source_status<>'cancelled' AND NOT (totals->>'current_review')::boolean) OR quantity>c.source_amount THEN
     RAISE EXCEPTION 'Reconciliation requires the current supported case and amount' USING ERRCODE='55000';
   END IF;
   e:=erp_private.t13_proof(c.id,coalesce(c.employer_company_id,c.company_id),coalesce(c.employer_branch_id,c.branch_id),
      p_data->'evidence','T13_RECOVERY_FINANCIAL_PROOF');
   INSERT INTO erp_private.t13_reconciliations(case_id,hr_review_id,source_digest,actual_cost,evidence_id,checked_by,reason)
    VALUES(c.id,h.id,totals->>'source_digest',quantity,e,p_actor,p_note) RETURNING id INTO result;
 ELSIF p_action='propose-schedule' THEN
   -- The caller holds the same recovery case lock as T15 approval and settlement.
   -- A retained, fully disposed line must not block the next schedule revision.
   IF EXISTS(SELECT 1 FROM erp_private.t15_reserved_lines r WHERE r.recovery_case_id=c.id
       AND r.released_at IS NULL AND NOT erp_private.t15_recovery_closed(r.line_id)) THEN
     RAISE EXCEPTION 'Resolve the open GM-approved payroll recovery before proposing replacement terms' USING ERRCODE='PT409';
   END IF;
   mode:=p_data->>'mode';
   IF (totals->>'remaining')::numeric<=0 OR (totals->>'unallocated')::boolean OR (totals->>'has_open_deduction')::boolean
      OR jsonb_typeof(p_data->'instalments') IS DISTINCT FROM 'array' THEN
     RAISE EXCEPTION 'Review eligible amounts and settle open receipts before proposing repayment' USING ERRCODE='55000';
   END IF;
   IF mode NOT IN('one-time','instalments') OR jsonb_array_length(p_data->'instalments') NOT BETWEEN 1 AND 120
      OR (mode='one-time')<>(jsonb_array_length(p_data->'instalments')=1) THEN
     RAISE EXCEPTION 'Choose one payment or enter the complete instalment schedule' USING ERRCODE='22023';
   END IF;
   SELECT * INTO policy_row FROM erp_private.t13_policies WHERE id=(totals->>'policy_id')::bigint;
   SELECT greatest(date_trunc('month',c.occurred_at AT TIME ZONE 'Asia/Dubai')::date,
          (max(payroll_month)+interval '1 month')::date) INTO first_allowed
    FROM erp_private.t13_payroll_pins WHERE case_id=c.id AND kind='deduction';
   FOR i IN SELECT value FROM jsonb_array_elements(p_data->'instalments') LOOP
     d:=(i->>'month')::date;
     item_amount:=erp_private.t13_amount(i,'amount');
     IF d IS NULL OR NOT isfinite(d) OR d<>date_trunc('month',d::timestamp)::date OR d<first_allowed
        OR (previous_month IS NOT NULL AND d<=previous_month) OR item_amount>policy_row.period_limit THEN
       RAISE EXCEPTION 'Each instalment needs an increasing eligible month and an amount within policy' USING ERRCODE='22023';
     END IF;
     sum_amount:=sum_amount+item_amount;
     previous_month:=d;
   END LOOP;
   IF sum_amount IS DISTINCT FROM (totals->>'outstanding')::numeric THEN
     RAISE EXCEPTION 'Instalments must reconcile to the outstanding supported principal' USING ERRCODE='55000';
   END IF;
   INSERT INTO erp_private.t13_schedules(case_id,hr_review_id,reconciliation_id,mode,principal,prepared_by,reason)
     VALUES(c.id,h.id,(totals->>'reconciliation_id')::bigint,mode,sum_amount,p_actor,p_note) RETURNING id INTO result;
   INSERT INTO erp_private.t13_instalments(schedule_id,due_month,amount)
     SELECT result,(value->>'month')::date,(value->>'amount')::numeric FROM jsonb_array_elements(p_data->'instalments');
 ELSIF p_action='withdraw-refund' THEN
   SELECT f.id INTO result FROM erp_private.t13_refunds f
   WHERE f.id=(p_data->>'refund')::bigint AND f.case_id=c.id
      AND NOT (totals->>'has_open_refund')::boolean AND (totals->>'unallocated_refund')::numeric=0;
   IF result IS NULL THEN RAISE EXCEPTION 'Settle any open refund payment before withdrawing the remaining proposal' USING ERRCODE='55000'; END IF;
   INSERT INTO erp_private.t13_refund_withdrawals(refund_id,withdrawn_by,reason) VALUES(result,p_actor,p_note);
 ELSE
   quantity:=erp_private.t13_amount(p_data,'amount');
   d:=(p_data->>'month')::date;
   SELECT * INTO original FROM erp_private.t13_allocations WHERE id=(p_data->>'allocation')::bigint AND case_id=c.id
      AND reverses_allocation_id IS NULL;
   SELECT * INTO pin FROM erp_private.t13_payroll_pins WHERE id=original.pin_id AND kind='deduction';
   SELECT coalesce(sum(greatest(0,f.amount-paid.allocated)),0) INTO reserved
   FROM erp_private.t13_refunds f CROSS JOIN LATERAL (
     SELECT coalesce(sum(a.amount*CASE WHEN a.reverses_allocation_id IS NULL THEN 1 ELSE -1 END),0) allocated
     FROM erp_private.t13_payroll_pins p JOIN erp_private.t13_allocations a ON a.pin_id=p.id WHERE p.refund_id=f.id
   ) paid WHERE f.case_id=c.id
      AND NOT EXISTS(SELECT 1 FROM erp_private.t13_refund_withdrawals w WHERE w.refund_id=f.id);
   IF pin.id IS NULL OR d IS NULL OR NOT isfinite(d) OR d<>(date_trunc('month',d::timestamp))::date
      OR d<=pin.payroll_month OR NOT (totals->>'current_finance')::boolean
      OR (totals->>'unallocated_refund')::numeric>0 OR (totals->>'has_open_refund')::boolean OR (totals->>'has_open_deduction')::boolean
      OR quantity>least(erp_private.t13_refund_capacity(original.id),(totals->>'refund_due')::numeric-reserved) THEN
     RAISE EXCEPTION 'Review the verified correction and link the refund to the original collection' USING ERRCODE='55000';
   END IF;
   INSERT INTO erp_private.t13_refunds(case_id,schedule_id,original_allocation_id,reconciliation_id,amount,first_month,prepared_by,reason)
     VALUES(c.id,pin.schedule_id,original.id,(totals->>'reconciliation_id')::bigint,quantity,d,p_actor,p_note) RETURNING id INTO result;
 END IF;
 RETURN result;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;
