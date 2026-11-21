
BEGIN;

CREATE FUNCTION erp_private.t18_activate(p_eos bigint,p_company bigint,p_branch bigint,p_actor bigint)
RETURNS erp_private.t18_cases LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE e public.employee_eos_cases; period erp_private.t03_employment_periods; opened erp_private.t18_cases;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('t14-payroll:'||p_company,0));
 SELECT * INTO e FROM public.employee_eos_cases WHERE id=p_eos AND deleted_at IS NULL
  AND case_status NOT IN('cancelled','closed') AND final_settlement_status<>'completed' FOR UPDATE NOWAIT;
 IF e.id IS NULL THEN RAISE EXCEPTION 'Choose an open HR exit case' USING ERRCODE='PT409'; END IF;
 IF e.last_working_date IS NULL OR e.employment_end_date IS NULL
    OR NOT isfinite(e.last_working_date) OR NOT isfinite(e.employment_end_date) THEN
   RAISE EXCEPTION 'Record the last working date and employment end date on the HR case first' USING ERRCODE='PT409';
 END IF;
 IF erp_private.t12_is_subject(p_actor,e.employee_id) THEN
   RAISE EXCEPTION 'An independent HR actor is required' USING ERRCODE='42501';
 END IF;
 SELECT * INTO period FROM erp_private.t03_employment_periods WHERE employee_id=e.employee_id
   AND company_id=p_company AND branch_id=p_branch AND work_period @> e.employment_end_date
   AND work_period @> e.last_working_date FOR SHARE NOWAIT;
 IF period.id IS NULL THEN RAISE EXCEPTION 'The exit dates must belong to this exact employment and paying scope' USING ERRCODE='42501'; END IF;
 PERFORM 1 FROM public.employees WHERE id=e.employee_id AND deleted_at IS NULL FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'The employment identity is unavailable' USING ERRCODE='42501'; END IF;
 IF EXISTS(SELECT 1 FROM erp_private.t18_cases a JOIN public.employee_eos_cases other ON other.id=a.eos_id
   WHERE a.employment_id=period.id AND a.eos_id<>p_eos AND other.case_status<>'cancelled' AND other.deleted_at IS NULL) THEN
   RAISE EXCEPTION 'This employment already has an active or completed exit case' USING ERRCODE='PT409';
 END IF;
 SELECT * INTO opened FROM erp_private.t18_cases WHERE eos_id=p_eos FOR UPDATE;
 IF NOT FOUND THEN
   INSERT INTO erp_private.t18_cases(eos_id,employee_id,employment_id,company_id,branch_id,last_day,last_working_day,opened_by)
   VALUES(p_eos,e.employee_id,period.id,p_company,p_branch,e.employment_end_date,e.last_working_date,p_actor) RETURNING * INTO opened;
 ELSIF ROW(opened.last_day,opened.last_working_day) IS DISTINCT FROM ROW(e.employment_end_date,e.last_working_date) THEN
   IF ROW(opened.employee_id,opened.employment_id,opened.company_id,opened.branch_id)
     IS DISTINCT FROM ROW(e.employee_id,period.id,p_company,p_branch)
   OR EXISTS(SELECT 1 FROM erp_private.t18_approvals a WHERE a.eos_id=p_eos AND a.state='approved')
   OR EXISTS(SELECT 1 FROM erp_private.t18_versions v WHERE v.eos_id=p_eos AND erp_private.t18_version_state(v.id)='submitted') THEN
     RAISE EXCEPTION 'Resolve the submitted or approved version before changing the exit dates' USING ERRCODE='PT409';
   END IF;
   UPDATE erp_private.t18_cases SET last_day=e.employment_end_date,last_working_day=e.last_working_date
    WHERE eos_id=p_eos RETURNING * INTO opened;
 END IF;
 PERFORM erp_private.t18_sync_clearance(p_eos,opened.employee_id,opened.employment_id,p_company,p_branch);
 RETURN opened;
EXCEPTION WHEN lock_not_available THEN
 RAISE EXCEPTION 'The exit case or its employment is changing. Retry the same action.' USING ERRCODE='40001';
END $$;

CREATE FUNCTION erp_private.t18_recovery_facts(p_case erp_private.t18_cases)
RETURNS TABLE(id bigint,kind text,state text,fingerprint text,decision bigint,disposition text,accepted boolean,
  recommended_by bigint,accepted_by bigint,accepted_at timestamptz,reason text,can_include boolean)
LANGUAGE sql STABLE SET search_path='' AS $$
 WITH subject_cases AS MATERIALIZED (
  SELECT c.id,c.source_kind,c.source_status,c.source_revision,erp_private.t13_financial_summary(c.id) AS financial,
     erp_private.t13_payroll_proposal(c.id,date_trunc('month',p_case.last_day::timestamp)::date,'deduction') AS deduction,
     erp_private.t13_payroll_proposal(c.id,date_trunc('month',p_case.last_day::timestamp)::date,'refund') AS refund
  FROM erp_private.t13_cases c
  WHERE c.employee_id=p_case.employee_id AND c.employment_id=p_case.employment_id
   AND c.employer_company_id=p_case.company_id AND c.employer_branch_id=p_case.branch_id
 ), open_cases AS (
  SELECT t.*,erp_private.t02_digest(jsonb_build_array(t.source_revision,t.source_status,t.financial,t.deduction,t.refund)) AS current_digest,
    ((t.deduction->>'status'='ready' AND coalesce((t.deduction->>'amount')::numeric,0)>0)
       OR (t.refund->>'status'='ready' AND coalesce((t.refund->>'amount')::numeric,0)>0)) AS eligible
  FROM subject_cases t
  WHERE coalesce((financial->>'unallocated')::boolean,false) OR coalesce((financial->>'refund_due')::numeric,0)>0
    OR (source_status<>'cancelled' AND
     ( NOT coalesce((financial->>'current_review')::boolean,false)
      OR financial->>'decision' IS NULL
      OR financial->>'decision'='hold'
      OR (financial->>'decision'='employee' AND (NOT coalesce((financial->>'current_cost')::boolean,false)
       OR coalesce((financial->>'outstanding')::numeric,0)>0 OR coalesce((financial->>'disputed')::numeric,0)>0))))
 )
 SELECT c.id,c.source_kind,
   CASE WHEN coalesce((c.financial->>'unallocated')::boolean,false) THEN 'reconciliation-required'
        WHEN coalesce(c.eligible,false) THEN 'eligible' ELSE 'review-required' END,
   c.current_digest,rec.id,rec.disposition,(acceptance.decision_id IS NOT NULL),rec.recommended_by,acceptance.accepted_by,acceptance.accepted_at,
   rec.reason,coalesce(c.eligible,false)
 FROM open_cases c
 LEFT JOIN LATERAL (
   SELECT r.* FROM erp_private.t18_recovery_decisions r WHERE r.eos_id=p_case.eos_id AND r.case_id=c.id
      AND r.fingerprint=c.current_digest ORDER BY r.id DESC LIMIT 1
 ) rec ON true
 LEFT JOIN erp_private.t18_recovery_acceptances acceptance ON acceptance.decision_id=rec.id
 ORDER BY c.id;
$$;

CREATE FUNCTION erp_private.t18_lock_current_inputs(p_case erp_private.t18_cases)
RETURNS void LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE recovery record;
BEGIN
 IF NOT pg_try_advisory_xact_lock_shared(hashtextextended('f06-geography-relations',0)) THEN
   RAISE EXCEPTION 'Employment is changing. Retry the same action.' USING ERRCODE='40001';
 END IF;
 PERFORM erp_private.t18_lock_clearance(p_case.employee_id);
 PERFORM 1 FROM public.employees WHERE id=p_case.employee_id AND deleted_at IS NULL FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'The employee identity is unavailable' USING ERRCODE='PT409'; END IF;
 PERFORM 1 FROM erp_private.t03_employment_periods WHERE id=p_case.employment_id
   AND employee_id=p_case.employee_id AND company_id=p_case.company_id AND branch_id=p_case.branch_id
   AND work_period @> p_case.last_day AND work_period @> p_case.last_working_day FOR SHARE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'The exact employment period changed' USING ERRCODE='PT409'; END IF;
 PERFORM 1 FROM public.employee_payroll_profiles WHERE employee_id=p_case.employee_id ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.employee_salary_components WHERE employee_id=p_case.employee_id ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.employee_salary_revision_effects WHERE employee_id=p_case.employee_id ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.employee_payroll_holds WHERE employee_id=p_case.employee_id ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM public.employee_attendance_daily_summary WHERE employee_id=p_case.employee_id ORDER BY id FOR SHARE NOWAIT;
 PERFORM 1 FROM erp_private.t04_cases WHERE employee_id=p_case.employee_id ORDER BY id FOR SHARE NOWAIT;
 FOR recovery IN SELECT id,assessment_id FROM erp_private.t13_cases
   WHERE employee_id=p_case.employee_id AND employment_id=p_case.employment_id
    AND employer_company_id=p_case.company_id AND employer_branch_id=p_case.branch_id
   ORDER BY id FOR UPDATE NOWAIT
 LOOP
   IF recovery.assessment_id IS NOT NULL THEN
     PERFORM 1 FROM erp_private.t10_assessments WHERE id=recovery.assessment_id FOR UPDATE NOWAIT;
     PERFORM 1 FROM erp_private.t10_job_cycles WHERE assessment_id=recovery.assessment_id ORDER BY id FOR SHARE NOWAIT;
   END IF;
   PERFORM erp_private.t13_lock_settlement(recovery.id);
 END LOOP;
EXCEPTION WHEN lock_not_available THEN
 RAISE EXCEPTION 'An exit source is changing. Retry the same action.' USING ERRCODE='40001';
END $$;

CREATE FUNCTION erp_private.t18_basis(p_case erp_private.t18_cases,p_cutoff timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' SET timezone='UTC' AS $$
DECLARE
 e public.employee_eos_cases; base jsonb; clearance jsonb; outcomes jsonb; issues jsonb; lines jsonb; policies jsonb; rule jsonb;
 curr text; v_month date:=date_trunc('month',p_case.last_day::timestamp)::date;
 r record; requested record; ref_currency text; proposal jsonb; input_line jsonb;
 wages numeric; basic numeric; gross numeric; deductions numeric; wage_cap numeric; group_ceiling numeric; allowed numeric;
 amount numeric; divisor numeric; fees_before numeric; due_on date; usable boolean;
BEGIN
 SELECT * INTO e FROM public.employee_eos_cases WHERE id=p_case.eos_id;
 IF e.deleted_at IS NOT NULL OR e.case_status IN('cancelled','closed') OR e.final_settlement_status='completed'
   OR ROW(e.employee_id,e.last_working_date,e.employment_end_date)
     IS DISTINCT FROM ROW(p_case.employee_id,p_case.last_working_day,p_case.last_day) THEN
   RAISE EXCEPTION 'The HR exit case or its verified dates changed. Refresh the case before calculation.' USING ERRCODE='PT409';
 END IF;
 base:=erp_private.t18_pay_basis(p_case,p_cutoff);
 clearance:=erp_private.t18_clearance_facts(p_case.eos_id,p_case.employee_id,p_case.employment_id,p_case.company_id,p_case.branch_id);
 issues:=coalesce(base->'issues','[]');
 lines:=coalesce(base->'lines','[]');
 policies:=coalesce(base->'policy','{}');
 rule:=policies->'facts';
 curr:=base->>'currency';
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]'::jsonb) INTO outcomes
 FROM erp_private.t18_recovery_facts(p_case) x;
 IF coalesce((clearance->>'blocking_count')::int,0)>0 THEN
   issues:=issues||erp_private.t14_issue('exit-clearance-open','Resolve the outstanding clearance items before submitting the settlement.',true);
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(outcomes) o WHERE NOT (o->>'accepted')::boolean
    OR (o->>'accepted_at')::timestamptz>p_cutoff) THEN
   issues:=issues||erp_private.t14_issue('exit-recovery-review','HR and Accounts must record a decision for every unresolved fine or damage case.',true);
 END IF;

 SELECT coalesce(sum((x->>'amount')::numeric) FILTER(WHERE x->>'kind'='earning' AND x->>'category' NOT IN('termination-benefit','leave-cashout')),0),
        coalesce(sum((x->>'amount')::numeric) FILTER(WHERE x->>'kind'='earning' AND x->>'category'='basic'),0),
        coalesce(sum((x->>'amount')::numeric) FILTER(WHERE x->>'kind'='deduction'),0)
 INTO wages,basic,fees_before FROM jsonb_array_elements(lines) x;
 group_ceiling:=greatest(0,least(floor(wages*(rule->>'recovery_fraction')::numeric*100)/100-fees_before,
                               wages-fees_before-(rule->>'net_floor')::numeric));
 allowed:=group_ceiling;
 divisor:=case rule->>'proration' WHEN 'fixed-days' THEN (rule->>'fixed_days')::numeric
  ELSE extract(day FROM ((v_month+interval '1 month')::date-1)) END;
 FOR r IN SELECT * FROM erp_private.t18_recovery_facts(p_case) x
    WHERE x.accepted AND x.accepted_at<=p_cutoff AND x.disposition='include'
    ORDER BY (erp_private.t13_payroll_proposal(x.id,v_month,'deduction')->>'priority')::integer NULLS LAST,x.id
 LOOP
   SELECT c.currency,(c.occurred_at AT TIME ZONE 'Asia/Dubai')::date INTO ref_currency,due_on FROM erp_private.t13_cases c WHERE c.id=r.id;
   usable:=false;
   FOR requested IN SELECT u.kind,erp_private.t13_payroll_proposal(r.id,v_month,u.kind) AS fact
       FROM unnest(ARRAY['refund','deduction']) u(kind) LOOP
     proposal:=requested.fact;
     IF proposal->>'status' IS DISTINCT FROM 'ready' OR coalesce((proposal->>'amount')::numeric,0)<=0 THEN CONTINUE; END IF;
     IF curr IS DISTINCT FROM ref_currency OR due_on>p_case.last_day OR rule IS NULL
        OR erp_private.t15_recovery_conflict(r.id,v_month,NULL) THEN CONTINUE; END IF;
     wage_cap:=CASE WHEN requested.kind='refund' THEN (proposal->>'amount')::numeric ELSE
         CASE proposal->>'wage_basis' WHEN 'fixed-amount' THEN (proposal->>'amount')::numeric
          WHEN 'gross-wage' THEN wages*(proposal->>'wage_factor')::numeric
          WHEN 'basic-wage' THEN basic*(proposal->>'wage_factor')::numeric
          WHEN 'daily-wage' THEN (CASE rule->>'daily_recovery_basis' WHEN 'basic' THEN basic ELSE wages END)
                                 *(proposal->>'wage_factor')::numeric/nullif(divisor,0) END END;
     IF wage_cap IS NULL OR (requested.kind='deduction' AND NOT (rule ?& ARRAY['recovery_fraction','net_floor','daily_recovery_basis'])) THEN
       CONTINUE;
     END IF;
     amount:=least((proposal->>'amount')::numeric,floor(wage_cap*100)/100,
        CASE requested.kind WHEN 'refund' THEN (proposal->>'amount')::numeric ELSE allowed END);
     IF amount<=0 THEN CONTINUE; END IF;
     usable:=true;
     IF requested.kind='deduction' THEN allowed:=allowed-amount; END IF;
     input_line:=(erp_private.t14_operational_line('recovery:'||requested.kind||':'||r.id,
       CASE requested.kind WHEN 'refund' THEN 'recovery-refund' ELSE 'recovery' END,
       CASE requested.kind WHEN 'refund' THEN amount ELSE -amount END,curr,1,'schedule',amount,due_on,r.accepted_at,
       jsonb_build_object('case',r.id,'schedule',(proposal->>'schedule_id')::bigint,
          'upstream_id',(proposal->>'source_id')::bigint,'recovery_kind',requested.kind,'fingerprint',proposal->>'digest',
          'proposal_amount',proposal->'amount','wage_cap',floor(wage_cap*100)/100,'group_headroom',group_ceiling,'month',v_month,
          'exit_decision',r.decision),
       'Verified recovery included by independent exit case review'));
     lines:=lines||input_line;
   END LOOP;
   IF NOT usable THEN
     issues:=issues||erp_private.t14_issue('exit-recovery-held','A selected recovery has no available verified amount. Refresh or review it separately.',true,
       jsonb_build_object('case',r.id));
   END IF;
 END LOOP;
 SELECT coalesce(sum((x->>'amount')::numeric) FILTER(WHERE x->>'kind'='earning'),0),
    coalesce(sum((x->>'amount')::numeric) FILTER(WHERE x->>'kind'='deduction'),0)
 INTO gross,deductions FROM jsonb_array_elements(lines) x;
 IF curr IS NULL OR deductions>gross THEN
   issues:=issues||erp_private.t14_issue('exit-total-held','Verify a single payroll currency and a non-negative settlement total.',true);
 END IF;
 RETURN base||jsonb_build_object('currency',curr,'lines',lines,'issues',issues,'case_revision',e.workspace_revision,
    'last_day',p_case.last_day,'last_working_day',p_case.last_working_day,'employment',p_case.employment_id,
    'clearance',clearance,'recovery',outcomes,'gross',gross,'deductions',deductions);
END $$;

CREATE FUNCTION erp_private.t18_assert_current(p_case erp_private.t18_cases,p_version erp_private.t18_versions)
RETURNS void LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE now_facts jsonb;
BEGIN
 PERFORM erp_private.t18_lock_current_inputs(p_case);
 now_facts:=erp_private.t18_basis(p_case,p_version.cutoff);
 IF erp_private.t02_digest(now_facts) IS DISTINCT FROM p_version.digest THEN
   RAISE EXCEPTION 'Exit sources changed. Return this version for recalculation.' USING ERRCODE='PT409';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(now_facts->'issues') x WHERE (x->>'blocking')::boolean) THEN
   RAISE EXCEPTION 'Resolve all blocking settlement issues before review or payment' USING ERRCODE='PT409';
 END IF;
END $$;

CREATE FUNCTION erp_private.t18_assert_payment_basis(p_version uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE v erp_private.t18_versions; scope erp_private.t18_cases;
BEGIN
 SELECT * INTO v FROM erp_private.t18_versions WHERE id=p_version;
 scope:=erp_private.t18_lock_case(v.eos_id);
 IF erp_private.t18_version_state(v.id)<>'approved'
    OR NOT EXISTS(SELECT 1 FROM erp_private.t18_approvals a WHERE a.version_id=v.id AND a.state='approved' AND a.digest=v.digest)
    OR scope.last_day>(clock_timestamp() AT TIME ZONE 'Asia/Dubai')::date THEN
   RAISE EXCEPTION 'A current approved settlement and verified end date are required before handoff' USING ERRCODE='PT409';
 END IF;
 PERFORM erp_private.t18_assert_current(scope,v);
 PERFORM erp_private.t18_assert_monthly_coverage(v.id);
END $$;

CREATE FUNCTION erp_private.t18_independent(p_version erp_private.t18_versions,p_actor bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p_version.calc_by<>p_actor
   AND NOT EXISTS(SELECT 1 FROM erp_private.t18_version_events e WHERE e.version_id=p_version.id
      AND e.kind IN('reviewed','submitted','request-revoke') AND e.actor_id=p_actor)
   AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(p_version.facts->'recovery') d
      WHERE (d->>'recommended_by')::bigint=p_actor OR (d->>'accepted_by')::bigint=p_actor)
   AND NOT EXISTS(SELECT 1 FROM erp_private.t18_lines l JOIN erp_private.t13_schedules s
       ON s.id=(l.source->>'schedule')::bigint AND l.category IN('recovery','recovery-refund')
       WHERE l.version_id=p_version.id AND s.prepared_by=p_actor)
   AND NOT EXISTS(SELECT 1 FROM erp_private.t18_lines l JOIN erp_private.t13_refunds r
       ON r.id=(l.source->>'upstream_id')::bigint AND l.category='recovery-refund'
       WHERE l.version_id=p_version.id AND r.prepared_by=p_actor)
   AND NOT EXISTS(SELECT 1 FROM erp_private.t18_lines l JOIN erp_private.t18_exit_adjustments a
       ON a.id=(l.source->>'adjustment')::bigint AND l.category='exit-adjustment'
       WHERE l.version_id=p_version.id AND p_actor IN(a.proposed_by,a.decided_by));
$$;

CREATE FUNCTION public.t18_exit_command(p_operation uuid,p_company bigint,p_branch bigint,p_eos bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE
 mode text; actor bigint:=public.current_user_profile_id(); note text:=btrim(p_data->>'reason');
 scope erp_private.t18_cases; v erp_private.t18_versions; current_version erp_private.t18_versions;
 decision erp_private.t18_recovery_decisions; recovery record; approval erp_private.t18_approvals;
 case_row public.employee_eos_cases; v_state text; basis jsonb; cutoff timestamptz; result jsonb; request_hash text;
 event_kind text; reservation_count int; wanted_case bigint; preferred_disposition text; keys text[];
BEGIN
 mode:=CASE WHEN p_action IN('activate','recommend-case','review','close-exit') THEN 'hr'
   WHEN p_action IN('accept-case','calculate','submit','withdraw','request-revoke') THEN 'accounts'
   WHEN p_action IN('approve','reject','revoke','decline-revoke') THEN 'approve' END;
 IF mode IS NULL OR p_operation IS NULL OR p_eos IS NULL OR p_eos<=0
    OR NOT coalesce(length(note) BETWEEN 1 AND 1000,false) THEN
   RAISE EXCEPTION 'Choose a valid exit settlement action and record a reason' USING ERRCODE='22023';
 END IF;
 keys:=CASE p_action WHEN 'activate' THEN ARRAY['reason'] WHEN 'calculate' THEN ARRAY['reason']
   WHEN 'recommend-case' THEN ARRAY['case','fingerprint','disposition','reason']
   WHEN 'accept-case' THEN ARRAY['case','fingerprint','decision','reason'] ELSE ARRAY['version','digest','reason'] END;
 IF NOT erp_private.t05_fields(p_data,keys) THEN RAISE EXCEPTION 'Invalid scoped exit action input' USING ERRCODE='22023'; END IF;
 IF NOT erp_private.t18_can(p_company,p_branch,mode) OR actor IS NULL THEN
   RAISE EXCEPTION 'Current exit settlement authority is unavailable in this scope' USING ERRCODE='42501';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('t14-payroll:'||p_company,0));
 SELECT * INTO scope FROM erp_private.t18_cases WHERE eos_id=p_eos AND company_id=p_company AND branch_id=p_branch;
 IF p_action<>'activate' THEN
   IF scope.eos_id IS NULL THEN RAISE EXCEPTION 'Activate the exact HR exit case in this scope first' USING ERRCODE='42501'; END IF;
   scope:=erp_private.t18_lock_case(scope.eos_id);
 ELSIF NOT EXISTS(SELECT 1 FROM public.employee_eos_cases e JOIN erp_private.t03_employment_periods h
    ON h.employee_id=e.employee_id AND h.work_period @> e.employment_end_date
   WHERE e.id=p_eos AND h.company_id=p_company AND h.branch_id=p_branch AND e.deleted_at IS NULL) THEN
   RAISE EXCEPTION 'The exit case and verified end date are unavailable in this scope' USING ERRCODE='42501';
 END IF;
 IF scope.employee_id IS NOT NULL AND erp_private.t12_is_subject(actor,scope.employee_id) THEN
   RAISE EXCEPTION 'An independent exit settlement actor is required' USING ERRCODE='42501';
 END IF;
 IF NOT erp_private.t18_can(p_company,p_branch,mode) THEN RAISE EXCEPTION 'Current exit authority expired' USING ERRCODE='42501'; END IF;
 request_hash:=erp_private.t02_digest(jsonb_build_array(p_company,p_branch,p_eos,p_action,p_data));
 result:=erp_private.t02_replay('t18-workflow',p_operation,request_hash);
 IF result IS NOT NULL THEN RETURN result; END IF;
 IF p_action='activate' THEN
   scope:=erp_private.t18_activate(p_eos,p_company,p_branch,actor);
   result:=jsonb_build_object('id',scope.eos_id,'state','activated');
 ELSE
   SELECT * INTO current_version FROM erp_private.t18_versions WHERE eos_id=p_eos ORDER BY number DESC LIMIT 1;
   v_state:=erp_private.t18_version_state(current_version.id);
   SELECT * INTO approval FROM erp_private.t18_approvals WHERE eos_id=p_eos AND state='approved';
   IF p_action IN('recommend-case','accept-case','calculate') THEN
     IF NOT EXISTS(SELECT 1 FROM public.employee_eos_cases e WHERE e.id=p_eos AND e.deleted_at IS NULL
         AND e.case_status NOT IN('cancelled','closed') AND ROW(e.employment_end_date,e.last_working_date)
         IS NOT DISTINCT FROM ROW(scope.last_day,scope.last_working_day)) THEN
       RAISE EXCEPTION 'HR must confirm the active exit dates before proceeding' USING ERRCODE='PT409';
     END IF;
     IF approval.id IS NOT NULL OR v_state='submitted' THEN
       RAISE EXCEPTION 'Resolve the current submission or approval before changing the reviewed exit inputs' USING ERRCODE='PT409';
     END IF;
     PERFORM erp_private.t18_lock_current_inputs(scope);
     IF p_action='calculate' THEN
       cutoff:=clock_timestamp();
       PERFORM erp_private.t18_sync_clearance(p_eos,scope.employee_id,scope.employment_id,p_company,p_branch);
       basis:=erp_private.t18_basis(scope,cutoff);
       INSERT INTO erp_private.t18_versions(eos_id,number,cutoff,digest,facts,policy,salary_claim_months,gross,deductions,currency,calc_by,reason)
       VALUES(p_eos,coalesce(current_version.number,0)+1,cutoff,erp_private.t02_digest(basis),basis,CASE WHEN jsonb_typeof(basis->'policy')='object' THEN basis->'policy' ELSE '{}'::jsonb END,
        ARRAY(SELECT jsonb_array_elements_text(coalesce(basis->'salary_claim_months','[]'))::date),
        (basis->>'gross')::numeric,(basis->>'deductions')::numeric,basis->>'currency',actor,note) RETURNING * INTO v;
       INSERT INTO erp_private.t18_lines(version_id,key,category,kind,amount,currency,quantity,unit,rate,original_on,available_at,source,reason)
       SELECT v.id,l.key,l.category,l.kind,l.amount,l.currency,l.quantity,l.unit,l.rate,l.original_on,l.available_at,l.source,l.reason
       FROM jsonb_to_recordset(basis->'lines') l(key text,category text,kind text,amount numeric,currency text,
           quantity numeric,unit text,rate numeric,original_on date,available_at timestamptz,source jsonb,reason text);
       result:=jsonb_build_object('id',p_eos,'version',v.id,'digest',v.digest,'state','draft');
     ELSE
       wanted_case:=(p_data->>'case')::bigint;
       SELECT * INTO recovery FROM erp_private.t18_recovery_facts(scope) x WHERE x.id=wanted_case;
       IF NOT FOUND OR recovery.fingerprint IS DISTINCT FROM p_data->>'fingerprint' THEN
          RAISE EXCEPTION 'The exact recovery review basis changed' USING ERRCODE='PT409';
       END IF;
       IF p_action='recommend-case' THEN
         preferred_disposition:=p_data->>'disposition';
         IF NOT coalesce(preferred_disposition IN('separate','include'),false) OR
              (preferred_disposition='include' AND NOT recovery.can_include) THEN
           RAISE EXCEPTION 'Only an eligible verified recovery can be included in the settlement' USING ERRCODE='PT409';
         END IF;
         IF recovery.decision IS NULL OR recovery.disposition IS DISTINCT FROM preferred_disposition THEN
           INSERT INTO erp_private.t18_recovery_decisions(eos_id,case_id,disposition,fingerprint,recommended_by,reason)
           VALUES(p_eos,wanted_case,preferred_disposition,recovery.fingerprint,actor,note) RETURNING * INTO decision;
         ELSE SELECT * INTO STRICT decision FROM erp_private.t18_recovery_decisions WHERE id=recovery.decision; END IF;
       ELSE
         SELECT * INTO decision FROM erp_private.t18_recovery_decisions
          WHERE id=(p_data->>'decision')::bigint AND eos_id=p_eos AND case_id=wanted_case;
         IF decision.id IS NULL OR decision.id IS DISTINCT FROM recovery.decision OR decision.recommended_by=actor THEN
           RAISE EXCEPTION 'An independent Accounts decision on the exact HR recommendation is required' USING ERRCODE='42501';
         END IF;
         IF decision.disposition='include' AND NOT recovery.can_include THEN
           RAISE EXCEPTION 'The recovery is no longer eligible to include' USING ERRCODE='PT409';
         END IF;
         INSERT INTO erp_private.t18_recovery_acceptances(decision_id,accepted_by,reason)
          VALUES(decision.id,actor,note) ON CONFLICT(decision_id) DO NOTHING;
       END IF;
       result:=jsonb_build_object('id',p_eos,'decision',decision.id,'state',CASE p_action WHEN 'accept-case' THEN 'accepted' ELSE 'recommended' END);
     END IF;
   ELSE
     v:=current_version;
     IF v.id IS NULL OR v.id IS DISTINCT FROM (p_data->>'version')::uuid OR v.digest IS DISTINCT FROM p_data->>'digest' THEN
       RAISE EXCEPTION 'Choose the latest exact reviewed settlement version' USING ERRCODE='PT409';
     END IF;
     CASE p_action
     WHEN 'review' THEN
       IF v_state<>'draft' THEN RAISE EXCEPTION 'Only the current draft can be reviewed' USING ERRCODE='PT409'; END IF;
       PERFORM erp_private.t18_assert_current(scope,v);
       event_kind:='reviewed';
     WHEN 'submit' THEN
       IF v_state<>'reviewed' OR EXISTS(SELECT 1 FROM erp_private.t18_version_events x
         WHERE x.version_id=v.id AND x.kind='reviewed' AND x.actor_id=actor) THEN
         RAISE EXCEPTION 'The exact version needs a separate HR review before Accounts submits it' USING ERRCODE='42501';
       END IF;
       PERFORM erp_private.t18_assert_current(scope,v);
       event_kind:='submitted';
     WHEN 'withdraw' THEN
       IF v_state NOT IN('reviewed','submitted') THEN RAISE EXCEPTION 'No open review to withdraw' USING ERRCODE='PT409'; END IF;
       event_kind:='withdrawn';
     WHEN 'approve','reject' THEN
       IF v_state<>'submitted' OR NOT erp_private.t18_independent(v,actor) THEN
         RAISE EXCEPTION 'The current submitted version requires an independent GM decision' USING ERRCODE='42501';
       END IF;
       IF p_action='approve' THEN
         PERFORM erp_private.t18_assert_current(scope,v);
         INSERT INTO erp_private.t18_approvals(eos_id,version_id,digest,decided_by)
          VALUES(p_eos,v.id,v.digest,actor) RETURNING * INTO approval;
         reservation_count:=erp_private.t18_reserve(v.id);
         event_kind:='approved';
       ELSE event_kind:='rejected'; END IF;
     WHEN 'request-revoke' THEN
       IF v_state<>'approved' OR approval.version_id IS DISTINCT FROM v.id OR NOT erp_private.t18_may_revoke(v.id) THEN
         RAISE EXCEPTION 'An externally unresolved or paid settlement must retain its approval' USING ERRCODE='PT409';
       END IF;
       event_kind:='request-revoke';
     WHEN 'revoke','decline-revoke' THEN
       IF v_state<>'request-revoke' OR approval.version_id IS DISTINCT FROM v.id OR NOT erp_private.t18_independent(v,actor) THEN
         RAISE EXCEPTION 'An independent GM decision on the exact revocation request is required' USING ERRCODE='42501';
       END IF;
       IF p_action='revoke' THEN
         IF NOT erp_private.t18_may_revoke(v.id) THEN
           RAISE EXCEPTION 'An externally unresolved or paid settlement must retain its approval' USING ERRCODE='PT409';
         END IF;
         PERFORM erp_private.t18_release(v.id,note);
         UPDATE erp_private.t18_approvals SET state='revoked',revoked_by=actor,revoked_at=clock_timestamp() WHERE id=approval.id;
         event_kind:='revoked';
       ELSE event_kind:='decline-revoke'; END IF;
     WHEN 'close-exit' THEN
       PERFORM erp_private.t18_lock_clearance(scope.employee_id);
       IF approval.version_id IS DISTINCT FROM v.id OR (erp_private.t18_payment_status(v.id)->>'state') IS DISTINCT FROM 'reconciled'
          OR coalesce((erp_private.t18_clearance_facts(p_eos,scope.employee_id,scope.employment_id,p_company,p_branch)->>'blocking_count')::int,0)<>0 THEN
         RAISE EXCEPTION 'Complete clearance and reconcile the exact settlement before closing the exit case' USING ERRCODE='PT409';
       END IF;
       SELECT * INTO STRICT case_row FROM public.employee_eos_cases WHERE id=p_eos;
       IF case_row.case_status<>'closed' THEN
         INSERT INTO erp_private.t18_close_receipts(eos_id,version_id,actor_id,operation_id,reason)
           VALUES(p_eos,v.id,actor,p_operation,note);
         UPDATE public.employee_eos_cases SET case_status='closed',updated_by=actor WHERE id=p_eos;
       END IF;
     END CASE;
     IF event_kind IS NOT NULL THEN
       INSERT INTO erp_private.t18_version_events(version_id,kind,actor_id,reason) VALUES(v.id,event_kind,actor,note);
     END IF;
     result:=jsonb_build_object('id',p_eos,'version',v.id,'digest',v.digest,
       'state',CASE p_action WHEN 'close-exit' THEN 'closed' ELSE erp_private.t18_version_state(v.id) END,'claims',reservation_count);
   END IF;
 END IF;
 IF NOT erp_private.t18_can(p_company,p_branch,mode) THEN RAISE EXCEPTION 'Exit authority expired before recording the action' USING ERRCODE='42501'; END IF;
 RETURN erp_private.t02_save_receipt('t18-workflow',p_operation,request_hash,result);
END $$;

REVOKE ALL ON FUNCTION erp_private.t18_activate(bigint,bigint,bigint,bigint),erp_private.t18_recovery_facts(erp_private.t18_cases),
 erp_private.t18_lock_current_inputs(erp_private.t18_cases),erp_private.t18_basis(erp_private.t18_cases,timestamptz),
 erp_private.t18_assert_current(erp_private.t18_cases,erp_private.t18_versions),
 erp_private.t18_assert_payment_basis(uuid),erp_private.t18_independent(erp_private.t18_versions,bigint),
 public.t18_exit_command(uuid,bigint,bigint,bigint,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t18_exit_command(uuid,bigint,bigint,bigint,text,jsonb) TO authenticated;
COMMIT;
