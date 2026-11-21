
BEGIN;

CREATE FUNCTION erp_private.t13_payroll_proposal(p_case bigint,p_month date,p_kind text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
 c erp_private.t13_cases; totals jsonb; policy erp_private.t13_policies; schedule erp_private.t13_schedules;
 refund erp_private.t13_refunds; source bigint; amount numeric:=0; planned numeric:=0; already numeric:=0;
 state text:='held'; facts jsonb;
BEGIN
 IF p_month IS NULL OR p_month<>date_trunc('month',p_month::timestamp)::date OR p_kind NOT IN('deduction','refund') THEN
   RAISE EXCEPTION 'Use the exact payroll month and recovery line kind' USING ERRCODE='22023';
 END IF;
 SELECT * INTO c FROM erp_private.t13_cases WHERE id=p_case;
 IF c.id IS NULL OR c.employee_id IS NULL THEN RETURN jsonb_build_object('status','held'); END IF;
 totals:=erp_private.t13_financial_summary(c.id);
 SELECT * INTO policy FROM erp_private.t13_policies WHERE id=(totals->>'policy_id')::bigint;
 IF p_kind='deduction' THEN
   SELECT * INTO schedule FROM erp_private.t13_schedules WHERE case_id=c.id ORDER BY id DESC LIMIT 1;
   source:=schedule.id;
   SELECT coalesce(sum(i.amount),0) INTO planned FROM erp_private.t13_instalments i
      WHERE i.schedule_id=schedule.id AND i.due_month<=p_month;
   SELECT coalesce(sum(a.amount*CASE WHEN a.reverses_allocation_id IS NULL THEN 1 ELSE -1 END),0) INTO already
   FROM erp_private.t13_payroll_pins p JOIN erp_private.t13_allocations a ON a.pin_id=p.id
   WHERE p.schedule_id=schedule.id AND p.kind='deduction';
   IF schedule.id IS NOT NULL AND schedule.hr_review_id=(totals->>'hr_review_id')::bigint
      AND schedule.reconciliation_id=(totals->>'reconciliation_id')::bigint
      AND NOT (totals->>'unallocated')::boolean AND NOT (totals->>'has_open_deduction')::boolean AND NOT (totals->>'has_open_refund')::boolean
      AND NOT EXISTS (SELECT 1 FROM erp_private.t13_payroll_pins p
        WHERE p.case_id=c.id AND p.kind='deduction' AND p.payroll_month>=p_month) THEN
     amount:=greatest(0,least(planned-already,(totals->>'remaining')::numeric,policy.period_limit));
   END IF;
 ELSE
   SELECT f.* INTO refund FROM erp_private.t13_refunds f
   WHERE f.case_id=c.id AND f.first_month<=p_month
     AND NOT EXISTS(SELECT 1 FROM erp_private.t13_refund_withdrawals w WHERE w.refund_id=f.id)
     AND f.amount>(SELECT coalesce(sum(a.amount*CASE WHEN a.reverses_allocation_id IS NULL THEN 1 ELSE -1 END),0)
          FROM erp_private.t13_payroll_pins p JOIN erp_private.t13_allocations a ON a.pin_id=p.id WHERE p.refund_id=f.id)
   ORDER BY f.first_month,f.id LIMIT 1;
   source:=refund.id;
   SELECT * INTO schedule FROM erp_private.t13_schedules WHERE id=refund.schedule_id;
   IF refund.id IS NOT NULL AND (totals->>'current_finance')::boolean
      AND (totals->>'unallocated_refund')::numeric=0
      AND NOT (totals->>'has_open_refund')::boolean AND NOT (totals->>'has_open_deduction')::boolean
      AND NOT EXISTS (SELECT 1 FROM erp_private.t13_payroll_pins p
        WHERE p.case_id=c.id AND p.kind='refund' AND p.payroll_month>=p_month) THEN
     SELECT coalesce(sum(a.amount*CASE WHEN a.reverses_allocation_id IS NULL THEN 1 ELSE -1 END),0) INTO already
       FROM erp_private.t13_payroll_pins p JOIN erp_private.t13_allocations a ON a.pin_id=p.id WHERE p.refund_id=refund.id;
     amount:=greatest(0,least(refund.amount-already,(totals->>'refund_due')::numeric));
   END IF;
 END IF;
 IF amount>0 THEN state:='ready'; END IF;
 facts:=jsonb_build_object('case_id',c.id,'source_id',source,'schedule_id',schedule.id,'kind',p_kind,'status',state,
      'employee_id',c.employee_id,'employment_id',c.employment_id,'company_id',c.employer_company_id,
      'branch_id',c.employer_branch_id,'amount',amount,'currency',c.currency,'month',p_month,
      'planned_to_date',planned,'applied_to_schedule',already,'hr_review_id',totals->'hr_review_id',
      'reconciliation_id',totals->'reconciliation_id','policy_id',policy.id,'priority',policy.priority,
      'wage_basis',policy.wage_basis,'wage_factor',policy.wage_factor,'period_limit',policy.period_limit,
      'open_balance',totals->'outstanding','open_due',greatest(0,planned-already),'source_digest',totals->'source_digest',
      'original_allocation',refund.original_allocation_id);
 RETURN facts||jsonb_build_object('digest',erp_private.t02_digest(facts||jsonb_build_object('balance',totals,
    'last_dispute',(SELECT max(id) FROM erp_private.t13_disputes WHERE case_id=c.id),
    'last_money_event',(SELECT max(id) FROM erp_private.t13_money_events WHERE case_id=c.id))));
END $$;

CREATE FUNCTION erp_private.t13_accounts_command(p_action text,p_case bigint,p_data jsonb,p_actor bigint,p_note text)
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

CREATE FUNCTION erp_private.t13_review_token(p_case bigint,p_accounts boolean)
RETURNS text LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE facts jsonb;
BEGIN
 facts:=jsonb_build_array(erp_private.t13_source_digest(p_case),
   (SELECT max(id) FROM erp_private.t13_hr_reviews WHERE case_id=p_case),
   (SELECT max(id) FROM erp_private.t13_disputes WHERE case_id=p_case));
 IF p_accounts THEN
   facts:=facts||jsonb_build_array(erp_private.t13_financial_summary(p_case),
     (SELECT max(id) FROM erp_private.t13_money_events WHERE case_id=p_case),
     (SELECT max(id) FROM erp_private.t13_schedules WHERE case_id=p_case),
     (SELECT max(id) FROM erp_private.t13_refunds WHERE case_id=p_case),
     (SELECT jsonb_agg(w.refund_id ORDER BY w.refund_id) FROM erp_private.t13_refund_withdrawals w JOIN erp_private.t13_refunds f ON f.id=w.refund_id
       WHERE f.case_id=p_case));
 END IF;
 RETURN erp_private.t02_digest(facts);
END $$;

CREATE FUNCTION public.t13_recovery_command(p_operation uuid,p_target bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
 actor bigint:=public.current_user_profile_id(); company bigint; branch bigint; c erp_private.t13_cases;
 capability text; note text; hash text; prior jsonb; result bigint;
BEGIN
 capability:=CASE
   WHEN p_action IN('prepare-policy','approve-policy') THEN 'hr.recovery.policy'
   WHEN p_action IN('review','open-dispute','resolve-dispute') THEN 'hr.recovery.review'
   WHEN p_action IN('reconcile','record-money','reverse-money','propose-schedule','propose-refund','withdraw-refund') THEN 'hr.recovery.accounts'
 END;
 note:=btrim(p_data->>'reason');
 IF actor IS NULL OR p_operation IS NULL OR p_target IS NULL OR p_target<=0 OR capability IS NULL
     OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR NOT coalesce(length(note) BETWEEN 1 AND 2000,false) THEN
   RAISE EXCEPTION 'A recovery command requires an authenticated actor, declared action and reason' USING ERRCODE='22023';
 END IF;
 IF capability='hr.recovery.policy' THEN
   SELECT id,owner_company_id INTO branch,company FROM public.branches WHERE id=p_target;
 ELSE
   SELECT * INTO c FROM erp_private.t13_cases WHERE id=p_target;
   company:=coalesce(c.employer_company_id,c.company_id); branch:=coalesce(c.employer_branch_id,c.branch_id);
 END IF;
 IF NOT erp_private.t02_has_scope(capability,company,branch)
    OR (capability='hr.recovery.accounts' AND NOT erp_private.t02_has_scope('hr.payroll.view',company,branch))
    OR (c.id IS NOT NULL AND (actor=c.reported_by OR erp_private.t12_is_subject(actor,c.employee_id))) THEN
   RAISE EXCEPTION 'This case requires an independently authorised actor in the historical scope' USING ERRCODE='42501';
 END IF;
 IF c.id IS NOT NULL THEN
   PERFORM erp_private.t13_lock_settlement(c.id);
   SELECT * INTO c FROM erp_private.t13_cases WHERE id=p_target;
   IF capability='hr.recovery.accounts' AND NOT EXISTS(SELECT 1 FROM public.currencies
        WHERE currency_code=c.currency AND is_active AND decimal_places=2 FOR SHARE) THEN
     RAISE EXCEPTION 'This currency requires separate financial review' USING ERRCODE='55000';
   END IF;
   IF ROW(coalesce(c.employer_company_id,c.company_id),coalesce(c.employer_branch_id,c.branch_id)) IS DISTINCT FROM ROW(company,branch)
      OR erp_private.t12_is_subject(actor,c.employee_id) THEN
     RAISE EXCEPTION 'Case responsibility changed during admission' USING ERRCODE='42501';
   END IF;
   IF capability='hr.recovery.accounts' AND (
       EXISTS(SELECT 1 FROM erp_private.t13_hr_reviews WHERE case_id=c.id AND reviewed_by=actor)
       OR EXISTS(SELECT 1 FROM erp_private.t13_disputes WHERE case_id=c.id AND actor_id=actor)) THEN
     RAISE EXCEPTION 'Accounts review must be independent of HR' USING ERRCODE='42501';
   END IF;
   IF capability='hr.recovery.review' AND (
       EXISTS(SELECT 1 FROM erp_private.t13_reconciliations WHERE case_id=c.id AND checked_by=actor)
       OR EXISTS(SELECT 1 FROM erp_private.t13_money_events WHERE case_id=c.id AND actor_id=actor)
       OR EXISTS(SELECT 1 FROM erp_private.t13_schedules WHERE case_id=c.id AND prepared_by=actor)
       OR EXISTS(SELECT 1 FROM erp_private.t13_refunds WHERE case_id=c.id AND prepared_by=actor)) THEN
     RAISE EXCEPTION 'HR review must be independent of Accounts' USING ERRCODE='42501';
   END IF;
 END IF;
 hash:=erp_private.t02_digest(jsonb_build_array(p_target,p_action,p_data));
 prior:=erp_private.t02_replay('t13-recovery',p_operation,hash);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 IF c.id IS NOT NULL AND (p_data->>'basis') IS DISTINCT FROM erp_private.t13_review_token(c.id,capability='hr.recovery.accounts') THEN
   RAISE EXCEPTION 'Recovery facts have changed. Reload the case before making a new decision.' USING ERRCODE='PT409';
 END IF;
 result:=CASE capability
   WHEN 'hr.recovery.policy' THEN erp_private.t13_policy_command(p_action,p_target,p_data,actor,note)
   WHEN 'hr.recovery.review' THEN erp_private.t13_hr_command(p_action,p_target,p_data,actor,note)
   ELSE CASE WHEN p_action IN('record-money','reverse-money') THEN erp_private.t13_money_command(p_action,p_target,p_data,actor,note)
        ELSE erp_private.t13_accounts_command(p_action,p_target,p_data,actor,note) END
 END;
 RETURN erp_private.t02_save_receipt('t13-recovery',p_operation,hash,jsonb_build_object('id',result,'target',p_target,'action',p_action));
END $$;

CREATE FUNCTION public.t13_recovery_workspace(p_branch bigint,p_month date,p_case bigint DEFAULT NULL,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 company bigint; hr boolean; accounts boolean; policy boolean; c erp_private.t13_cases;
 result jsonb; detail jsonb; case_list jsonb; rule_list jsonb; evidence jsonb; operating_preview boolean;
BEGIN
 SELECT owner_company_id INTO company FROM public.branches WHERE id=p_branch;
 hr:=erp_private.t02_has_scope('hr.recovery.review',company,p_branch);
 accounts:=erp_private.t02_has_scope('hr.recovery.accounts',company,p_branch)
      AND erp_private.t02_has_scope('hr.payroll.view',company,p_branch);
 policy:=erp_private.t02_has_scope('hr.recovery.policy',company,p_branch);
 IF NOT (hr OR accounts OR policy) THEN RAISE EXCEPTION 'Recovery scope unavailable' USING ERRCODE='42501'; END IF;
 IF hr OR accounts THEN
   SELECT coalesce(jsonb_agg(to_jsonb(times) ORDER BY times.id DESC),'[]'::jsonb) INTO case_list
   FROM (SELECT id,source_kind,source_revision,source_status,subject_status,occurred_at,currency,asset_id,employee_id,incident_id
       FROM erp_private.t13_cases listed
       WHERE (p_before IS NULL OR id<p_before)
          AND coalesce(employer_company_id,company_id)=company AND coalesce(employer_branch_id,branch_id)=p_branch
          AND NOT erp_private.t12_is_subject(public.current_user_profile_id(),employee_id)
       ORDER BY id DESC LIMIT 100) times;
 END IF;
 IF p_case IS NOT NULL AND (hr OR accounts) THEN
   SELECT * INTO c FROM erp_private.t13_cases t WHERE t.id=p_case
      AND coalesce(t.employer_company_id,t.company_id)=company AND coalesce(t.employer_branch_id,t.branch_id)=p_branch
      AND NOT erp_private.t12_is_subject(public.current_user_profile_id(),t.employee_id);
   IF c.id IS NULL THEN RAISE EXCEPTION 'Recovery case unavailable' USING ERRCODE='42501'; END IF;
   detail:=jsonb_build_object('id',c.id,'source_kind',c.source_kind,'source_status',c.source_status,
         'occurred_at',c.occurred_at,'source_amount',c.source_amount,'currency',c.currency,'employee_id',c.employee_id,
         'empl_company_id',c.employer_company_id,'incident_id',c.incident_id,'subject_status',c.subject_status,
         'operating_branch',c.branch_id,
         'hr_basis',CASE WHEN hr THEN erp_private.t13_review_token(c.id,false) END,
         'accounts_basis',CASE WHEN accounts THEN erp_private.t13_review_token(c.id,true) END,
         'reviews',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'decision',h.decision,'ceiling',h.ceiling,
             'notified_on',h.notified_on,'reason',CASE WHEN hr THEN h.reason END,
             'response',CASE WHEN hr THEN h.response END,'response_note',CASE WHEN hr THEN h.response_note END)
              ORDER BY h.id DESC),'[]'::jsonb) FROM erp_private.t13_hr_reviews h WHERE case_id=c.id),
         'disputes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'resolves_id',d.resolves_id,
             'amount',d.amount,'upheld',d.upheld,'route',d.route,'reason',CASE WHEN hr THEN d.reason END)
              ORDER BY d.id DESC),'[]'::jsonb) FROM erp_private.t13_disputes d WHERE case_id=c.id));
   IF accounts THEN
     operating_preview:=erp_private.t02_has_scope('hr.recovery.accounts',c.company_id,c.branch_id);
     detail:=detail||jsonb_build_object('totals',erp_private.t13_financial_summary(c.id),
       'deduction',erp_private.t13_payroll_proposal(c.id,p_month,'deduction'),
       'refund',erp_private.t13_payroll_proposal(c.id,p_month,'refund'),
       'schedules',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'mode',s.mode,'principal',s.principal,
         'instalments',(SELECT jsonb_agg(jsonb_build_object('month',i.due_month,'amount',i.amount) ORDER BY i.due_month)
                        FROM erp_private.t13_instalments i WHERE i.schedule_id=s.id)) ORDER BY s.id DESC),'[]'::jsonb)
                   FROM erp_private.t13_schedules s WHERE s.case_id=c.id),
       'money',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'kind',m.kind,'amount',m.amount,
         'date',m.value_date,'reference',m.reference,'parent_id',m.parent_id,'reverses_id',m.reverses_id) ORDER BY m.id DESC),'[]'::jsonb)
                   FROM erp_private.t13_money_events m WHERE m.case_id=c.id),
       'receipts',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'pin',r.pin_id,'amount',r.actual_amount,
        'final',r.final,'schedule',p.schedule_id,'month',p.payroll_month,'line',p.payroll_line_id,'approved',p.approved_amount) ORDER BY r.id DESC),'[]'::jsonb)
                   FROM erp_private.t13_receipts r JOIN erp_private.t13_payroll_pins p ON p.id=r.pin_id WHERE r.case_id=c.id),
       'refunds',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'amount',f.amount,'month',f.first_month,
         'allocation',f.original_allocation_id,'withdrawn',w.refund_id IS NOT NULL,'open_attempt',
          EXISTS(SELECT 1 FROM erp_private.t13_payroll_pins p WHERE p.refund_id=f.id AND NOT EXISTS(
           SELECT 1 FROM erp_private.t13_receipts r WHERE r.pin_id=p.id AND r.final))) ORDER BY f.id DESC),'[]'::jsonb)
          FROM erp_private.t13_refunds f LEFT JOIN erp_private.t13_refund_withdrawals w ON w.refund_id=f.id WHERE f.case_id=c.id),
       'allocations',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'pin',a.pin_id,'receipt',a.receipt_id,
        'amount',a.amount,'reverses',a.reverses_allocation_id) ORDER BY a.id DESC),'[]'::jsonb)
                   FROM erp_private.t13_allocations a WHERE a.case_id=c.id));
   END IF;
   SELECT coalesce(jsonb_agg(candidate.item ORDER BY candidate.document_id DESC),'[]'::jsonb) INTO evidence
   FROM (
     SELECT d.id AS document_id,jsonb_build_object('document',d.id,'version',v.id,'file',first_file.id,
        'label',d.document_no||' · '||d.title,'type',t.type_code,'branch',d.owning_branch_id) AS item
     FROM public.dms_documents d JOIN public.dms_document_types t ON t.id=d.document_type_id
     JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
     JOIN LATERAL (SELECT f.id FROM public.dms_document_files f WHERE f.document_id=d.id AND f.version_id=v.id
       AND f.file_role='original' AND f.deleted_at IS NULL AND f.integrity_status='verified'
       AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$' ORDER BY f.id LIMIT 1) first_file ON true
     WHERE (
       (d.owning_company_id=company AND d.owning_branch_id=p_branch
        AND ((hr AND t.type_code IN ('T13_RECOVERY_EMPLOYEE_NOTICE','T13_RECOVERY_EMPLOYEE_RESPONSE'))
          OR (accounts AND t.type_code IN ('T13_RECOVERY_FINANCIAL_PROOF','T13_RECOVERY_CASH_RECEIPT','T13_RECOVERY_FINANCIAL_CORRECTION'))))
       OR (operating_preview AND d.owning_company_id=c.company_id AND d.owning_branch_id=c.branch_id
            AND t.type_code IN ('T13_RECOVERY_FINANCIAL_PROOF','T13_RECOVERY_FINANCIAL_CORRECTION')))
       AND (t.type_code NOT IN('T13_RECOVERY_EMPLOYEE_NOTICE','T13_RECOVERY_EMPLOYEE_RESPONSE') OR NOT EXISTS(
         SELECT 1 FROM erp_private.t13_recovery_proofs e WHERE e.document_id=d.id AND e.case_id<>c.id))
       AND erp_private.t13_original(d.owning_company_id,d.owning_branch_id,
         jsonb_build_object('document',d.id,'version',v.id,'file',first_file.id),ARRAY[t.type_code])
     ORDER BY d.id DESC LIMIT 150
   ) candidate;
   detail:=detail||jsonb_build_object('evidence',evidence);
 END IF;
 IF policy THEN
   SELECT coalesce(jsonb_agg(to_jsonb(p) ORDER BY p.id DESC),'[]'::jsonb) INTO rule_list
   FROM erp_private.t13_policies p WHERE p.company_id=company AND p.branch_id=p_branch;
 END IF;
 result:=jsonb_build_object('cases',coalesce(case_list,'[]'::jsonb),'case',detail,'policies',coalesce(rule_list,'[]'::jsonb),
    'can_review',hr,'can_reconcile',accounts,'can_manage_policy',policy);
 RETURN result;
END $$;

CREATE FUNCTION public.t13_recovery_scopes() RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'branch',b.branch_name_en,'company',c.legal_name_en)
            ORDER BY c.legal_name_en,b.branch_name_en,b.id),'[]'::jsonb)
 FROM public.branches b JOIN public.owner_companies c ON c.id=b.owner_company_id
 WHERE erp_private.t02_has_scope('hr.recovery.review',c.id,b.id)
    OR erp_private.t02_has_scope('hr.recovery.policy',c.id,b.id)
    OR (erp_private.t02_has_scope('hr.recovery.accounts',c.id,b.id) AND erp_private.t02_has_scope('hr.payroll.view',c.id,b.id));
$$;

REVOKE ALL ON FUNCTION erp_private.t13_payroll_proposal(bigint,date,text),erp_private.t13_accounts_command(text,bigint,jsonb,bigint,text),
 erp_private.t13_review_token(bigint,boolean)
 FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.t13_recovery_command(uuid,bigint,text,jsonb),public.t13_recovery_workspace(bigint,date,bigint,bigint),public.t13_recovery_scopes()
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t13_recovery_command(uuid,bigint,text,jsonb),public.t13_recovery_workspace(bigint,date,bigint,bigint),public.t13_recovery_scopes()
 TO authenticated;
NOTIFY pgrst,'reload schema';

COMMIT;
