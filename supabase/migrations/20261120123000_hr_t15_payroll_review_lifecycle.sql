
BEGIN;

CREATE FUNCTION erp_private.t15_independent(p_version uuid,p_actor bigint,p_submitter bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p_actor IS NOT NULL AND p_actor IS DISTINCT FROM p_submitter
   AND EXISTS(SELECT 1 FROM erp_private.t14_versions v WHERE v.id=p_version AND v.calculated_by<>p_actor)
   AND NOT EXISTS(SELECT 1 FROM erp_private.t14_results e WHERE e.version_id=p_version
     AND erp_private.t12_is_subject(p_actor,e.employee_id))
   AND NOT EXISTS(SELECT 1 FROM erp_private.t14_lines l JOIN erp_private.t14_adjustments a
     ON l.category='adjustment' AND a.id=(l.source->>'adjustment')::bigint
     WHERE l.version_id=p_version AND p_actor IN(a.proposed_by,a.decided_by))
   AND NOT EXISTS(SELECT 1 FROM erp_private.t14_lines l JOIN erp_private.t13_schedules s
     ON l.category IN('recovery','recovery-refund') AND s.id=(l.source->>'schedule')::bigint
     LEFT JOIN erp_private.t13_refunds f ON l.category='recovery-refund' AND f.id=(l.source->>'upstream_id')::bigint
     WHERE l.version_id=p_version AND (s.prepared_by=p_actor OR f.prepared_by=p_actor));
$$;

CREATE FUNCTION erp_private.t15_lock_sources(p_version uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE worker_ids bigint[]; case_id_input bigint; assessment bigint;
BEGIN
 IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('f06-geography-relations',0)) THEN
   RAISE EXCEPTION 'Employment is being updated. Retry the same review when the change completes.' USING ERRCODE='40001';
 END IF;
 SELECT ARRAY(SELECT employee_id FROM erp_private.t14_results WHERE version_id=p_version ORDER BY employee_id) INTO worker_ids;
 PERFORM 1 FROM public.employees WHERE id=ANY(worker_ids) ORDER BY id FOR UPDATE NOWAIT;
 PERFORM 1 FROM erp_private.t03_employment_periods WHERE employee_id=ANY(worker_ids) ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.employee_payroll_profiles WHERE employee_id=ANY(worker_ids) ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.employee_salary_components WHERE employee_id=ANY(worker_ids) ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.employee_salary_revision_effects WHERE employee_id=ANY(worker_ids) ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.employee_payroll_holds WHERE employee_id=ANY(worker_ids) ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.employee_attendance_daily_summary WHERE employee_id=ANY(worker_ids) ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM erp_private.t04_cases WHERE employee_id=ANY(worker_ids) ORDER BY id FOR SHARE NOWAIT;
 FOR case_id_input IN SELECT DISTINCT (source->>'case')::bigint
    FROM erp_private.t14_lines WHERE version_id=p_version AND category IN('recovery','recovery-refund') ORDER BY 1
 LOOP
   -- The driver verifier holds the recovery case before locking employment.
   -- Prelock its case and Workshop rows without waiting while we own payroll inputs.
   SELECT assessment_id INTO assessment FROM erp_private.t13_cases WHERE id=case_id_input FOR UPDATE NOWAIT;
   IF assessment IS NOT NULL THEN
     PERFORM 1 FROM erp_private.t10_assessments WHERE id=assessment FOR UPDATE NOWAIT;
     PERFORM 1 FROM erp_private.t10_job_cycles WHERE assessment_id=assessment ORDER BY id FOR SHARE NOWAIT;
   END IF;
   PERFORM erp_private.t13_lock_settlement(case_id_input);
 END LOOP;
EXCEPTION WHEN lock_not_available THEN
 RAISE EXCEPTION 'Payroll sources are being updated. Retry the same review when the change completes.' USING ERRCODE='40001';
END $$;

CREATE FUNCTION erp_private.t15_assert_current(p_run uuid,p_version uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SET search_path='' SET timezone='UTC' AS $$
DECLARE anchor erp_private.t14_runs; wanted erp_private.t14_versions; snapshot jsonb; current_rules text;
BEGIN
 SELECT * INTO anchor FROM erp_private.t14_runs WHERE id=p_run;
 SELECT * INTO wanted FROM erp_private.t14_versions WHERE run_id=anchor.id ORDER BY number DESC LIMIT 1;
 IF wanted.id IS DISTINCT FROM p_version THEN
   RAISE EXCEPTION 'Only the latest exact calculation version is eligible' USING ERRCODE='PT409';
 END IF;
 PERFORM erp_private.t15_lock_sources(p_version);
 WITH subjects AS (
   SELECT h.employee_id FROM erp_private.t03_employment_periods h
     WHERE h.company_id=anchor.company_id AND h.branch_id=anchor.branch_id
       AND h.work_period && daterange(anchor.month,(anchor.month+interval '1 month')::date,'[)')
   UNION
   SELECT employee_id FROM erp_private.t14_operational_subjects(anchor.company_id,anchor.branch_id,anchor.month,wanted.cutoff)
   UNION
   SELECT c.employee_id FROM erp_private.t13_cases c
     WHERE c.employer_company_id=anchor.company_id AND c.employer_branch_id=anchor.branch_id
       AND c.subject_status='verified' AND c.occurred_at<=wanted.cutoff AND c.reported_at<=wanted.cutoff
 ), calculated AS MATERIALIZED (
   SELECT b.employee_id,erp_private.t14_employee_basis(anchor.id,b.employee_id,anchor.company_id,anchor.branch_id,anchor.month,wanted.cutoff) AS facts
   FROM subjects b
 )
 SELECT coalesce(jsonb_agg(facts ORDER BY employee_id) FILTER(WHERE facts IS NOT NULL),'[]'),
    erp_private.t02_digest(jsonb_agg(jsonb_build_array(facts->'id',facts->'rules') ORDER BY employee_id) FILTER(WHERE facts IS NOT NULL))
 INTO snapshot,current_rules FROM calculated;
 IF wanted.source_digest IS DISTINCT FROM erp_private.t02_digest(snapshot)
    OR wanted.rule_digest IS DISTINCT FROM current_rules THEN
   RAISE EXCEPTION 'Payroll facts changed. Return this submission to Accounts for an exact recalculation.' USING ERRCODE='PT409';
 END IF;
END $$;

-- T16's trusted caller must hold its own applicable authority before invoking
-- this private seal. Before an external handoff, its caller must durably
-- register a non-replaceable transfer state while holding this same run lock.
CREATE FUNCTION erp_private.t15_sealed_version(p_review uuid,p_version uuid,p_digest text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE review erp_private.t15_reviews; anchor erp_private.t14_runs; v erp_private.t14_versions; company bigint; bank_state text;
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
 PERFORM erp_private.t15_assert_reservations(p_review,p_version);
 RETURN jsonb_build_object('run',anchor.id,'version',v.id,'review',review.id,'gm_actor',review.decided_by,
   'company',anchor.company_id,'branch',anchor.branch_id,'month',anchor.month,'digest',v.digest,
   'source_digest',v.source_digest,'rule_digest',v.rule_digest,'totals',v.totals,'bank_state',bank_state);
END $$;

CREATE FUNCTION erp_private.t15_record_bank_event(p_operation uuid,p_review uuid,p_version uuid,p_digest text,p_kind text,
 p_evidence uuid,p_reason text)
RETURNS bigint LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 review erp_private.t15_reviews; saved erp_private.t15_bank_events; company bigint; old_state text;
 identity bigint; note text:=btrim(p_reason);
BEGIN
 IF p_operation IS NULL OR p_review IS NULL OR p_version IS NULL OR p_evidence IS NULL OR p_kind IS NULL
    OR NOT coalesce(length(note) BETWEEN 1 AND 2000,false) THEN
   RAISE EXCEPTION 'A verified exact payroll lifecycle reference is required' USING ERRCODE='22023';
 END IF;
 SELECT r.company_id INTO company FROM erp_private.t15_reviews h JOIN erp_private.t14_runs r ON r.id=h.run_id WHERE h.id=p_review;
 IF company IS NULL THEN RAISE EXCEPTION 'Approved payroll seal unavailable' USING ERRCODE='PT409'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('t14-payroll:'||company,0));
 PERFORM 1 FROM erp_private.t14_runs r JOIN erp_private.t15_reviews h ON h.run_id=r.id WHERE h.id=p_review FOR UPDATE OF r;
 SELECT * INTO review FROM erp_private.t15_reviews WHERE id=p_review FOR UPDATE;
 IF review.version_id IS DISTINCT FROM p_version OR review.digest IS DISTINCT FROM p_digest THEN
   RAISE EXCEPTION 'A bank lifecycle event must match the exact approved version' USING ERRCODE='PT409';
 END IF;
 SELECT * INTO saved FROM erp_private.t15_bank_events WHERE operation_id=p_operation;
 IF saved.id IS NOT NULL THEN
   IF ROW(saved.review_id,saved.version_id,saved.kind,saved.evidence_id,saved.reason)
     IS DISTINCT FROM ROW(p_review,p_version,p_kind,p_evidence,note) THEN
     RAISE EXCEPTION 'The lifecycle receipt already belongs to another event' USING ERRCODE='PT409';
   END IF;
   RETURN saved.id;
 END IF;
 IF review.state<>'approved' THEN RAISE EXCEPTION 'A current payroll approval is required' USING ERRCODE='PT409'; END IF;
 old_state:=erp_private.t15_bank_state(p_review);
 IF NOT (CASE old_state
   WHEN 'not-issued' THEN p_kind='prepared'
   WHEN 'prepared' THEN p_kind IN('submitted','unknown','cancelled')
   WHEN 'submitted' THEN p_kind IN('unknown','rejected','cancelled','partially-settled','settled')
   WHEN 'unknown' THEN p_kind IN('submitted','rejected','cancelled','partially-settled','settled')
   WHEN 'partially-settled' THEN p_kind IN('settled','reversed')
   WHEN 'settled' THEN p_kind='reversed'
   ELSE false END) THEN
   RAISE EXCEPTION 'The verified event does not follow the retained payroll lifecycle' USING ERRCODE='PT409';
 END IF;
 IF p_kind IN('prepared','submitted') AND old_state IN('not-issued','prepared') THEN
   PERFORM erp_private.t15_sealed_version(p_review,p_version,p_digest);
 END IF;
 INSERT INTO erp_private.t15_bank_events(review_id,version_id,operation_id,kind,evidence_id,reason)
 VALUES(p_review,p_version,p_operation,p_kind,p_evidence,note) RETURNING id INTO identity;
 RETURN identity;
END $$;

CREATE FUNCTION public.t15_payroll_review_command(p_operation uuid,p_company bigint,p_branch bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE
 actor bigint:=public.current_user_profile_id(); mode text; note text:=btrim(p_data->>'reason'); hash text;
 anchor erp_private.t14_runs; v erp_private.t14_versions; review erp_private.t15_reviews;
 review_id_input uuid; requested_version uuid; requested_digest text:=p_data->>'digest';
 result jsonb; receipt jsonb; event_kind text; event_facts jsonb:='{}';
 count_claims int; release_count int;
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
       count_claims:=erp_private.t15_reserve_approval(review.id,review.version_id);
       DELETE FROM erp_private.t14_draft_usage WHERE run_id=anchor.id;
       event_facts:=jsonb_build_object('claim_count',count_claims);
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

REVOKE ALL ON FUNCTION erp_private.t15_independent(uuid,bigint,bigint),erp_private.t15_lock_sources(uuid),erp_private.t15_assert_current(uuid,uuid),
 erp_private.t15_sealed_version(uuid,uuid,text),erp_private.t15_record_bank_event(uuid,uuid,uuid,text,text,uuid,text)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.t15_payroll_review_command(uuid,bigint,bigint,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t15_payroll_review_command(uuid,bigint,bigint,text,jsonb) TO authenticated;

COMMIT;
