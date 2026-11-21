
BEGIN;

CREATE FUNCTION erp_private.t13_financial_summary(p_case bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
 c erp_private.t13_cases; h erp_private.t13_hr_reviews; a erp_private.t13_reconciliations;
 p erp_private.t13_policies; m record; settlement jsonb; current_source text;
 principal numeric:=0; recovery numeric:=0; enforceable numeric:=0; disputed numeric:=0; approved_ceiling numeric;
 current_review boolean; current_cost boolean; financial_hold boolean;
BEGIN
 SELECT * INTO STRICT c FROM erp_private.t13_cases WHERE id=p_case;
 SELECT * INTO h FROM erp_private.t13_hr_reviews WHERE case_id=p_case ORDER BY id DESC LIMIT 1;
 SELECT * INTO a FROM erp_private.t13_reconciliations WHERE case_id=p_case ORDER BY id DESC LIMIT 1;
 SELECT * INTO p FROM erp_private.t13_policies WHERE id=h.policy_id;
 current_source:=erp_private.t13_source_digest(p_case);
 current_review:=coalesce(h.source_digest=current_source,false);
 current_cost:=coalesce(a.source_digest=current_source AND a.hr_review_id=h.id,false);
 SELECT coalesce(sum(net) FILTER(WHERE kind='authority-paid'),0) authority_paid,
        coalesce(sum(net) FILTER(WHERE kind='employee-direct'),0) employee_direct,
        coalesce(sum(net) FILTER(WHERE kind IN('insurer-offset','third-party-offset')),0) offsets,
        coalesce(sum(net) FILTER(WHERE kind='employee-cash'),0) cash_received,
        coalesce(sum(net) FILTER(WHERE kind='employee-cash-allocated'),0) cash_allocated INTO m
 FROM (SELECT kind,amount*CASE WHEN reverses_id IS NULL THEN 1 ELSE -1 END net
       FROM erp_private.t13_money_events WHERE case_id=p_case) e;
 settlement:=erp_private.t13_settlement_balance(p_case);
 recovery:=greatest(0,(settlement->>'allocated_deduction')::numeric-(settlement->>'allocated_refund')::numeric)+m.cash_allocated;
 SELECT coalesce(sum(opened.amount-solved.upheld),0) INTO disputed
 FROM erp_private.t13_disputes opened JOIN erp_private.t13_disputes solved ON solved.resolves_id=opened.id
 WHERE opened.case_id=p_case;
 approved_ceiling:=greatest(0,coalesce(h.ceiling,0)-disputed);
 IF c.source_status<>'cancelled' AND h.decision='employee' AND c.subject_status='verified' AND a.id IS NOT NULL THEN
   principal:=greatest(0,least(c.source_amount,approved_ceiling,a.actual_cost,p.case_limit)
                       -m.offsets-m.employee_direct);
 END IF;
 SELECT coalesce(sum(opened.amount),0) INTO disputed
 FROM erp_private.t13_disputes opened
 WHERE opened.case_id=p_case AND opened.resolves_id IS NULL
   AND (opened.route='defer' OR NOT coalesce(p.allow_deduct_correct,false))
   AND NOT EXISTS(SELECT 1 FROM erp_private.t13_disputes solved WHERE solved.resolves_id=opened.id);
 enforceable:=greatest(0,principal-disputed-recovery);
 financial_hold:=m.cash_received<>m.cash_allocated OR
   coalesce((settlement->>'unallocated_deduction')::numeric,0)<>0 OR coalesce((settlement->>'unallocated_refund')::numeric,0)<>0;
 RETURN settlement||jsonb_build_object('case_id',c.id,'source_digest',current_source,'hr_review_id',h.id,
    'reconciliation_id',a.id,'policy_id',p.id,'current_review',current_review,'current_cost',current_cost,
    'current_finance',coalesce(a.source_digest=current_source,false),'decision',h.decision,
    'authority_payable',CASE WHEN c.source_kind='fine' AND c.source_status<>'cancelled'
       THEN greatest(0,c.source_amount-m.authority_paid-m.employee_direct) ELSE 0 END,
    'authority_paid',m.authority_paid,'employee_direct',m.employee_direct,'offsets',m.offsets,
    'reconciled_cost',a.actual_cost,'employee_cash_received',m.cash_received,'employee_cash_allocated',m.cash_allocated,
    'collected',recovery,'principal',principal,'disputed',disputed,'outstanding',greatest(0,principal-recovery),
    'remaining',CASE WHEN current_review AND current_cost THEN enforceable ELSE 0 END,
    'unallocated',financial_hold,'refund_due',greatest(0,recovery-principal));
END $$;

CREATE FUNCTION erp_private.t13_policy_command(p_action text,p_branch bigint,p_data jsonb,p_actor bigint,p_note text)
RETURNS bigint LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE b public.branches; p erp_private.t13_policies; result bigint;
BEGIN
 SELECT * INTO STRICT b FROM public.branches WHERE id=p_branch;
 IF p_action='prepare-policy' THEN
   IF NOT EXISTS(SELECT 1 FROM public.currencies WHERE currency_code=p_data->>'currency' AND is_active AND decimal_places=2 FOR SHARE) THEN
     RAISE EXCEPTION 'Recovery policies require an active currency with two decimal places' USING ERRCODE='22023';
   END IF;
   INSERT INTO erp_private.t13_policies(company_id,branch_id,kind,validity,legal_basis,currency,
       case_limit,period_limit,wage_basis,wage_factor,priority,allow_deduct_correct,prepared_by,reason)
   VALUES(b.owner_company_id,b.id,p_data->>'kind',daterange((p_data->>'from')::date,(p_data->>'until')::date,'[)'),
       btrim(p_data->>'legal_basis'),p_data->>'currency',erp_private.t13_amount(p_data,'case_limit'),
       erp_private.t13_amount(p_data,'period_limit'),p_data->>'wage_basis',(p_data->>'wage_factor')::numeric,
       (p_data->>'priority')::int,coalesce((p_data->>'allow_deduct_correct')::boolean,false),p_actor,p_note)
   RETURNING id INTO result;
 ELSE
   SELECT * INTO p FROM erp_private.t13_policies
   WHERE id=(p_data->>'policy')::bigint AND branch_id=b.id AND company_id=b.owner_company_id FOR UPDATE;
   IF p.id IS NULL OR p.prepared_by=p_actor OR NOT erp_private.t12_staff_capability(p.prepared_by,'hr.recovery.policy',b.owner_company_id,b.id) THEN
     RAISE EXCEPTION 'The policy requires an independent authorised decision' USING ERRCODE='42501';
   END IF;
   UPDATE erp_private.t13_policies SET approved_by=p_actor,approved_at=clock_timestamp(),decision_reason=p_note
   WHERE id=p.id AND approved_at IS NULL RETURNING id INTO result;
   IF result IS NULL THEN RAISE EXCEPTION 'The policy already has a decision' USING ERRCODE='55000'; END IF;
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION erp_private.t13_hr_command(p_action text,p_case bigint,p_data jsonb,p_actor bigint,p_note text)
RETURNS bigint LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 c erp_private.t13_cases; h erp_private.t13_hr_reviews; p erp_private.t13_policies; d erp_private.t13_disputes;
 company bigint; branch bigint; evidence_id bigint; response_id bigint; result bigint; quantity numeric; notified date; decision text;
 current_source text; route text; event_date date; already_disputed numeric;
BEGIN
 SELECT * INTO STRICT c FROM erp_private.t13_cases WHERE id=p_case;
 company:=coalesce(c.employer_company_id,c.company_id); branch:=coalesce(c.employer_branch_id,c.branch_id);
 current_source:=erp_private.t13_source_digest(c.id);
 event_date:=(c.occurred_at AT TIME ZONE 'Asia/Dubai')::date;
 SELECT * INTO h FROM erp_private.t13_hr_reviews WHERE case_id=c.id ORDER BY id DESC LIMIT 1;
 IF p_action='review' THEN
   IF c.subject_status NOT IN('verified','no-referral') THEN
     RAISE EXCEPTION 'Complete responsibility intake first' USING ERRCODE='55000';
   END IF;
   decision:=p_data->>'decision';
   quantity:=erp_private.t13_amount(p_data,'ceiling',true);
   IF decision='employee' THEN
     SELECT * INTO p FROM erp_private.t13_policies WHERE company_id=company AND branch_id=branch
      AND kind=c.source_kind AND validity @> event_date AND approved_at IS NOT NULL AND currency=c.currency;
     IF c.subject_status<>'verified' OR c.employment_id IS NULL OR c.source_status='cancelled' OR p.id IS NULL
        OR quantity>least(p.case_limit,c.source_amount) THEN
       RAISE EXCEPTION 'Verified employment and a valid dated recovery rule are required' USING ERRCODE='55000';
     END IF;
     notified:=(p_data->>'notified_on')::date;
     IF notified IS NULL OR notified<event_date OR notified>(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date
        OR length(btrim(coalesce(p_data->>'response_note',''))) NOT BETWEEN 1 AND 2000 THEN
       RAISE EXCEPTION 'Enter the employee notification date and response or documented follow-up' USING ERRCODE='22023';
     END IF;
     evidence_id:=erp_private.t13_proof(c.id,company,branch,p_data->'notice','T13_RECOVERY_EMPLOYEE_NOTICE');
     IF p_data->>'response'<>'no-response' THEN
       response_id:=erp_private.t13_proof(c.id,company,branch,p_data->'response_evidence','T13_RECOVERY_EMPLOYEE_RESPONSE');
     END IF;
   END IF;
   INSERT INTO erp_private.t13_hr_reviews(case_id,source_digest,policy_id,decision,ceiling,notified_on,notice_id,
      response,response_id,response_note,reviewed_by,reason)
   VALUES(c.id,current_source,p.id,decision,quantity,notified,evidence_id,
      CASE WHEN decision='employee' THEN p_data->>'response' END,response_id,
      CASE WHEN decision='employee' THEN btrim(p_data->>'response_note') END,p_actor,p_note)
   RETURNING id INTO result;
   IF p_data->>'response'='disputed' AND decision='employee' AND NOT EXISTS(
      SELECT 1 FROM erp_private.t13_disputes recorded
      WHERE recorded.case_id=c.id AND recorded.evidence_id=response_id AND recorded.resolves_id IS NULL) THEN
     route:=coalesce(p_data->>'route','defer');
     IF route NOT IN('defer','deduct-correct') OR (route='deduct-correct' AND NOT p.allow_deduct_correct) THEN
       RAISE EXCEPTION 'This approved policy does not allow that dispute route' USING ERRCODE='55000';
     END IF;
     quantity:=erp_private.t13_amount(p_data,'disputed_amount');
     SELECT coalesce(sum(opened.amount-coalesce(solved.upheld,0)),0) INTO already_disputed
     FROM erp_private.t13_disputes opened LEFT JOIN erp_private.t13_disputes solved ON solved.resolves_id=opened.id
     WHERE opened.case_id=c.id AND opened.resolves_id IS NULL;
     IF quantity+already_disputed>(SELECT ceiling FROM erp_private.t13_hr_reviews WHERE id=result) THEN
       RAISE EXCEPTION 'Disputed amount exceeds the reviewed ceiling' USING ERRCODE='22023';
     END IF;
     INSERT INTO erp_private.t13_disputes(case_id,review_id,amount,route,evidence_id,actor_id,reason)
       VALUES(c.id,result,quantity,route,response_id,p_actor,p_note);
   END IF;
 ELSIF p_action='open-dispute' THEN
   SELECT * INTO p FROM erp_private.t13_policies WHERE id=h.policy_id;
   route:=p_data->>'route';
   quantity:=erp_private.t13_amount(p_data,'amount');
   SELECT coalesce(sum(opened.amount-coalesce(solved.upheld,0)),0) INTO already_disputed
   FROM erp_private.t13_disputes opened LEFT JOIN erp_private.t13_disputes solved ON solved.resolves_id=opened.id
   WHERE opened.case_id=c.id AND opened.resolves_id IS NULL;
   IF h.decision IS DISTINCT FROM 'employee' OR h.source_digest<>current_source
      OR route NOT IN('defer','deduct-correct') OR (route='deduct-correct' AND NOT coalesce(p.allow_deduct_correct,false))
      OR quantity>h.ceiling-already_disputed THEN
     RAISE EXCEPTION 'Dispute exceeds the review or the policy does not allow this route' USING ERRCODE='55000';
   END IF;
   evidence_id:=erp_private.t13_proof(c.id,company,branch,p_data->'evidence','T13_RECOVERY_EMPLOYEE_RESPONSE');
   IF EXISTS(SELECT 1 FROM erp_private.t13_disputes WHERE case_id=c.id AND t13_disputes.evidence_id=t13_hr_command.evidence_id
        AND resolves_id IS NULL) THEN
     RAISE EXCEPTION 'This response already has a dispute record' USING ERRCODE='PT409';
   END IF;
   INSERT INTO erp_private.t13_disputes(case_id,review_id,amount,route,evidence_id,actor_id,reason)
     VALUES(c.id,h.id,quantity,route,evidence_id,p_actor,p_note) RETURNING id INTO result;
 ELSE
   SELECT * INTO d FROM erp_private.t13_disputes WHERE case_id=c.id
     AND id=(p_data->>'dispute')::bigint AND resolves_id IS NULL;
   IF d.id IS NULL OR d.actor_id=p_actor THEN
     RAISE EXCEPTION 'The dispute requires an independent authorised decision' USING ERRCODE='42501';
   END IF;
   quantity:=erp_private.t13_amount(p_data,'upheld',true);
   IF quantity>d.amount THEN RAISE EXCEPTION 'Upheld amount exceeds the disputed amount' USING ERRCODE='22023'; END IF;
   IF EXISTS(SELECT 1 FROM erp_private.t13_disputes WHERE resolves_id=d.id) THEN
     RAISE EXCEPTION 'The dispute already has a decision' USING ERRCODE='55000';
   END IF;
   evidence_id:=erp_private.t13_proof(c.id,company,branch,p_data->'evidence','T13_RECOVERY_EMPLOYEE_RESPONSE');
   INSERT INTO erp_private.t13_disputes(case_id,review_id,resolves_id,amount,upheld,route,evidence_id,actor_id,reason)
    VALUES(c.id,d.review_id,d.id,d.amount,quantity,d.route,evidence_id,p_actor,p_note) RETURNING id INTO result;
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION erp_private.t13_money_command(p_action text,p_case bigint,p_data jsonb,p_actor bigint,p_note text)
RETURNS bigint LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 c erp_private.t13_cases; entry erp_private.t13_money_events; parent_entry erp_private.t13_money_events;
 totals jsonb; kind text; proof_kind text; ref text; quantity numeric; capacity numeric; parent_id bigint;
 original_id bigint; proof_company bigint; proof_branch bigint; evidence bigint; result bigint; paid_on date;
BEGIN
 SELECT * INTO STRICT c FROM erp_private.t13_cases WHERE id=p_case;
 totals:=erp_private.t13_financial_summary(c.id);
 quantity:=erp_private.t13_amount(p_data,'amount');
 kind:=p_data->>'kind';
 ref:=upper(btrim(p_data->>'reference'));
 paid_on:=(p_data->>'date')::date;
 proof_company:=coalesce(c.employer_company_id,c.company_id);
 proof_branch:=coalesce(c.employer_branch_id,c.branch_id);
 IF paid_on IS NULL OR paid_on<(c.occurred_at AT TIME ZONE 'Asia/Dubai')::date
    OR paid_on>(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date THEN
   RAISE EXCEPTION 'Enter the verified cash or offset date' USING ERRCODE='22023';
 END IF;
 IF p_action='reverse-money' THEN
   SELECT * INTO entry FROM erp_private.t13_money_events
   WHERE case_id=c.id AND id=(p_data->>'event')::bigint AND reverses_id IS NULL;
   IF entry.id IS NULL THEN RAISE EXCEPTION 'Original recovery event unavailable' USING ERRCODE='42501'; END IF;
   kind:=entry.kind; parent_id:=entry.parent_id; original_id:=entry.id;
   SELECT entry.amount-coalesce(sum(amount),0) INTO capacity FROM erp_private.t13_money_events WHERE reverses_id=entry.id;
   IF kind='employee-cash' THEN
     SELECT capacity-coalesce(sum(amount*CASE WHEN reverses_id IS NULL THEN 1 ELSE -1 END),0)
       INTO capacity FROM erp_private.t13_money_events WHERE t13_money_events.parent_id=entry.id;
   END IF;
   IF quantity>capacity OR paid_on<entry.value_date THEN
     RAISE EXCEPTION 'Correction exceeds the uncommitted amount or predates the original' USING ERRCODE='55000';
   END IF;
   proof_kind:='T13_RECOVERY_FINANCIAL_CORRECTION';
 ELSIF kind='employee-cash-allocated' THEN
   SELECT * INTO parent_entry FROM erp_private.t13_money_events WHERE case_id=c.id
     AND id=(p_data->>'cash')::bigint AND t13_money_events.kind='employee-cash' AND reverses_id IS NULL;
   IF parent_entry.id IS NULL THEN RAISE EXCEPTION 'Original employee cash receipt unavailable' USING ERRCODE='42501'; END IF;
   parent_id:=parent_entry.id;
   SELECT parent_entry.amount-coalesce(sum(CASE WHEN reverses_id=parent_entry.id OR reverses_id IS NULL THEN amount ELSE -amount END),0)
     INTO capacity FROM erp_private.t13_money_events m WHERE m.reverses_id=parent_entry.id OR m.parent_id=parent_entry.id;
   IF quantity>least(capacity,(totals->>'remaining')::numeric) OR paid_on<parent_entry.value_date
      OR NOT coalesce((totals->>'current_cost')::boolean,false)
      OR (totals->>'has_open_deduction')::boolean OR (totals->>'has_open_refund')::boolean
      OR (totals->>'unallocated_deduction')::numeric>0 OR (totals->>'unallocated_refund')::numeric>0 THEN
     RAISE EXCEPTION 'Cash allocation exceeds the available receipt or outstanding recovery' USING ERRCODE='55000';
   END IF;
   proof_kind:='T13_RECOVERY_CASH_RECEIPT';
 ELSE
   IF kind IN('authority-paid','employee-direct') AND (c.source_kind<>'fine' OR quantity>(totals->>'authority_payable')::numeric) THEN
     RAISE EXCEPTION 'Amount exceeds the authority balance' USING ERRCODE='55000';
   END IF;
   IF kind IN('insurer-offset','third-party-offset')
      AND quantity>greatest(0,coalesce((totals->>'reconciled_cost')::numeric,c.source_amount)-(totals->>'offsets')::numeric) THEN
     RAISE EXCEPTION 'Credit exceeds the supported cost' USING ERRCODE='55000';
   END IF;
   proof_kind:=CASE WHEN kind='employee-cash' THEN 'T13_RECOVERY_CASH_RECEIPT' ELSE 'T13_RECOVERY_FINANCIAL_PROOF' END;
 END IF;
 IF kind IN('authority-paid','employee-direct') THEN
   proof_company:=c.company_id; proof_branch:=c.branch_id;
   IF NOT erp_private.t02_has_scope('hr.recovery.accounts',proof_company,proof_branch) THEN
     RAISE EXCEPTION 'The operating branch must be authorised for authority payments' USING ERRCODE='42501';
   END IF;
 END IF;
 evidence:=erp_private.t13_proof(c.id,proof_company,proof_branch,p_data->'evidence',proof_kind);
 INSERT INTO erp_private.t13_money_events(case_id,kind,parent_id,reverses_id,amount,reference,cash_company_id,value_date,evidence_id,actor_id,reason)
 VALUES(c.id,kind,parent_id,original_id,quantity,ref,CASE WHEN kind='employee-cash' THEN proof_company END,
   paid_on,evidence,p_actor,p_note) RETURNING id INTO result;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION erp_private.t13_financial_summary(bigint),erp_private.t13_policy_command(text,bigint,jsonb,bigint,text),
 erp_private.t13_hr_command(text,bigint,jsonb,bigint,text),erp_private.t13_money_command(text,bigint,jsonb,bigint,text)
 FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
