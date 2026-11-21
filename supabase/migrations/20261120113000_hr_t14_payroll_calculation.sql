
BEGIN;

CREATE FUNCTION erp_private.t14_issue(p_code text,p_reason text,p_blocking boolean,p_source jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('code',p_code,'reason',p_reason,'blocking',p_blocking,'source',p_source);
$$;

CREATE FUNCTION erp_private.t14_rule_as_of(p_company bigint,p_branch bigint,p_group bigint,p_day date,p_cutoff timestamptz)
RETURNS erp_private.t14_rules LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT rule FROM erp_private.t14_rules rule
 WHERE rule.company_id=p_company AND rule.branch_id=p_branch AND rule.validity @> p_day
   AND rule.approved_at<=p_cutoff AND (rule.group_id IS NULL OR rule.group_id=p_group)
 ORDER BY (rule.group_id IS NOT NULL) DESC LIMIT 1;
$$;

CREATE FUNCTION erp_private.t14_adjustment_basis(p_run uuid,p_employee bigint,p_available jsonb,p_cutoff timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
 a record; lines jsonb:='[]'; issues jsonb:='[]'; source_facts jsonb;
BEGIN
 FOR a IN
   SELECT adj.*,o.key AS original_key,o.source AS original_source,o.amount AS original_amount,o.original_on AS original_date
   FROM erp_private.t14_adjustments adj JOIN erp_private.t14_lines o ON o.id=adj.original_line_id
   WHERE adj.run_id=p_run AND adj.employee_id=p_employee AND adj.decision IS DISTINCT FROM 'rejected'
   ORDER BY adj.id
 LOOP
   source_facts:=jsonb_build_object('adjustment',a.id,'original_line',a.original_line_id,'original_key',a.original_key,
      'verified_at',a.decided_at,'evidence_version',a.version_id);
   IF a.decision IS NULL THEN
     issues:=issues||erp_private.t14_issue('adjustment-pending','A separate adjustment awaits independent verification.',false,source_facts);
   ELSIF NOT EXISTS(
     SELECT 1 FROM jsonb_array_elements(p_available) old
     WHERE old->>'key'=a.original_key AND old->'source'=a.original_source AND (old->>'amount')::numeric=a.original_amount
   ) THEN
     issues:=issues||erp_private.t14_issue('adjustment-source-changed','The original amount or source changed. Review the linked adjustment.',true,source_facts);
   ELSE
     IF a.decided_at>p_cutoff THEN
       issues:=issues||erp_private.t14_issue('review-adjustment-after-cutoff',
         'Accounts independently verified this documented correction during draft review, after the source cutoff.',false,source_facts);
     END IF;
     lines:=lines||jsonb_build_object('key','adjustment:'||a.id,'category','adjustment','kind',a.kind,
       'amount',a.amount,'currency',a.currency,'quantity',1,'unit','adjustment','rate',a.amount,
       'original_on',a.original_date,'available_at',a.decided_at,'source',source_facts,'reason',a.reason);
   END IF;
 END LOOP;
 RETURN jsonb_build_object('lines',lines,'exceptions',issues);
END $$;

CREATE FUNCTION erp_private.t14_recovery_basis(p_run uuid,p_employee bigint,p_company bigint,p_branch bigint,p_month date,p_cutoff timestamptz,
 p_rule jsonb,p_currency text,p_basic numeric,p_gross numeric,p_deductions numeric,p_divisor numeric)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
 item record; entry jsonb; facts jsonb; lines jsonb:='[]'; issues jsonb:='[]'; approved numeric; available timestamptz;
 headroom numeric; amount numeric; wage_cap numeric; group_remaining numeric;
BEGIN
 headroom:=greatest(0,least(floor(p_gross*(p_rule->>'recovery_fraction')::numeric*100)/100-p_deductions,
     p_gross-p_deductions-(p_rule->>'net_floor')::numeric));
 group_remaining:=headroom;
 FOR item IN
   SELECT c.id,c.occurred_at,c.source_kind,c.currency,p.version->>'kind' AS kind,p.version
   FROM erp_private.t13_cases c
   CROSS JOIN LATERAL (
     SELECT erp_private.t13_payroll_proposal(c.id,p_month,k.kind) AS version
     FROM unnest(ARRAY['refund','deduction']) k(kind)
   ) p
   WHERE c.employee_id=p_employee AND c.employer_company_id=p_company AND c.employer_branch_id=p_branch
     AND (c.occurred_at AT TIME ZONE 'Asia/Dubai')::date<(p_month+interval '1 month')::date
     AND ((p.version->>'amount')::numeric>0 OR
          (p.version->>'kind'='deduction' AND coalesce((p.version->>'open_due')::numeric,0)>0))
   ORDER BY (p.version->>'kind'='refund') DESC, (p.version->>'priority')::int NULLS LAST,c.id
 LOOP
   entry:=item.version;
   facts:=jsonb_build_object('case',item.id,'schedule',(entry->>'schedule_id')::bigint,
     'upstream_id',(entry->>'source_id')::bigint,'recovery_kind',item.kind,'fingerprint',entry->>'digest',
     'basis',entry->>'wage_basis','priority',entry->'priority','proposal_amount',entry->'amount','month',p_month);
   SELECT greatest(c.reported_at,s.created_at,r.created_at,h.created_at,f.created_at,
        (SELECT max(d.created_at) FROM erp_private.t13_disputes d WHERE d.case_id=item.id),
        (SELECT max(e.created_at) FROM erp_private.t13_money_events e WHERE e.case_id=item.id),
        (SELECT max(v.recorded_at) FROM erp_private.t13_case_versions v WHERE v.case_id=item.id),
        (SELECT max(a.recorded_at) FROM erp_private.t13_allocations a WHERE a.case_id=item.id),
        (SELECT max(k.recorded_at) FROM erp_private.t13_receipts k WHERE k.case_id=item.id),
        (SELECT max(pin.recorded_at) FROM erp_private.t13_payroll_pins pin WHERE pin.case_id=item.id),
        (SELECT max(w.created_at) FROM erp_private.t13_refund_withdrawals w
          JOIN erp_private.t13_refunds refund ON refund.id=w.refund_id WHERE refund.case_id=item.id),
        policy.approved_at)
     INTO available
   FROM erp_private.t13_cases c
   LEFT JOIN erp_private.t13_schedules s ON s.id=(entry->>'schedule_id')::bigint
   LEFT JOIN erp_private.t13_hr_reviews h ON h.id=(entry->>'hr_review_id')::bigint
   LEFT JOIN erp_private.t13_reconciliations r ON r.id=(entry->>'reconciliation_id')::bigint
   LEFT JOIN erp_private.t13_refunds f ON item.kind='refund' AND f.id=(entry->>'source_id')::bigint
   LEFT JOIN erp_private.t13_policies policy ON policy.id=(entry->>'policy_id')::bigint
   WHERE c.id=item.id;
   IF available>p_cutoff OR entry->>'status'<>'ready' THEN
     issues:=issues||erp_private.t14_issue('recovery-held','Recovery awaits reconciliation or the next monthly review cutoff.',false,facts);
     CONTINUE;
   END IF;
   IF item.currency IS DISTINCT FROM p_currency THEN
     issues:=issues||erp_private.t14_issue('recovery-currency','Recovery currency differs from the payroll currency.',true,facts);
     CONTINUE;
   END IF;
   IF erp_private.t14_other_draft(p_run,p_employee,jsonb_build_object('key','recovery:'||item.kind||':'||item.id)) THEN
     issues:=issues||erp_private.t14_issue('recovery-in-another-draft','This recovery is awaiting disposition in another monthly draft.',false,facts);
     CONTINUE;
   END IF;
   approved:=(entry->>'amount')::numeric;
   IF item.kind='refund' THEN amount:=approved;
   ELSE
     wage_cap:=CASE entry->>'wage_basis'
       WHEN 'fixed-amount' THEN approved
       WHEN 'gross-wage' THEN p_gross*(entry->>'wage_factor')::numeric
       WHEN 'basic-wage' THEN p_basic*(entry->>'wage_factor')::numeric
       WHEN 'daily-wage' THEN (CASE p_rule->>'daily_recovery_basis' WHEN 'basic' THEN p_basic ELSE p_gross END)
                         *(entry->>'wage_factor')::numeric/nullif(p_divisor,0)
     END;
     IF wage_cap IS NULL THEN
       issues:=issues||erp_private.t14_issue('recovery-basis','The approved recovery wage basis is unavailable.',true,facts);
       CONTINUE;
     END IF;
     amount:=least(approved,floor(wage_cap*100)/100,group_remaining);
     group_remaining:=group_remaining-amount;
     IF amount<approved THEN
       issues:=issues||erp_private.t14_issue('recovery-headroom','The proposed amount was limited by approved wage headroom.',false,
         facts||jsonb_build_object('eligible',amount,'carry_for_review',approved-amount));
     END IF;
     facts:=facts||jsonb_build_object('wage_cap',floor(wage_cap*100)/100,'group_headroom',headroom);
   END IF;
   IF amount>0 THEN
     lines:=lines||jsonb_build_object('key','recovery:'||item.kind||':'||item.id,
       'category',CASE WHEN item.kind='refund' THEN 'recovery-refund' ELSE 'recovery' END,
       'kind',CASE WHEN item.kind='refund' THEN 'earning' ELSE 'deduction' END,'amount',amount,
       'currency',item.currency,'quantity',1,'unit','schedule','rate',amount,'available_at',available,
       'original_on',(item.occurred_at AT TIME ZONE 'Asia/Dubai')::date,'source',facts,
       'reason',CASE WHEN item.kind='refund' THEN 'Verified linked recovery refund' ELSE 'Reviewed recovery within remaining wage headroom' END);
   END IF;
 END LOOP;
 RETURN jsonb_build_object('lines',lines,'exceptions',issues);
END $$;

-- Compare event identities and shared Fleet/Workshop time against the current
-- draft holdings of other months or employer scopes. An amended interval that
-- overlaps an earlier draft is visible as a review exception.
CREATE FUNCTION erp_private.t14_other_draft(p_run uuid,p_employee bigint,p_line jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(
   SELECT 1 FROM erp_private.t14_draft_usage used
   WHERE used.run_id<>p_run
     AND (used.key=p_line->>'key' OR (used.employee_id=p_employee AND used.span IS NOT NULL
             AND used.span && (p_line->'source'->>'interval')::tstzmultirange))
 );
$$;

CREATE FUNCTION erp_private.t14_employee_basis(p_run uuid,p_employee bigint,p_company bigint,p_branch bigint,
 p_month date,p_cutoff timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' SET timezone='UTC' AS $$
DECLARE
 person public.employees; employment erp_private.t03_employment_periods; period_rule erp_private.t14_rules;
 rule_row erp_private.t14_rules; month_end date:=(p_month+interval '1 month - 1 day')::date; context_day date;
 profile jsonb; part jsonb; entry jsonb; available jsonb:='[]'; lines jsonb:='[]'; issues jsonb:='[]';
 linked_periods bigint[]:=ARRAY[]::bigint[]; currency text; profile_currency text; seen text[]:=ARRAY[]::text[];
 basic numeric:=0; gross numeric:=0; deductions numeric:=0; divisor numeric; total_state text:='ready';
 rules jsonb:='[]';
BEGIN
 SELECT * INTO person FROM public.employees WHERE id=p_employee;
 IF person.id IS NULL THEN RETURN NULL; END IF;
 FOR employment IN SELECT h.* FROM erp_private.t03_employment_periods h
   WHERE h.employee_id=p_employee AND h.company_id=p_company AND h.branch_id=p_branch
     AND h.work_period && daterange(p_month,month_end+1,'[)') ORDER BY lower(h.work_period),h.id
 LOOP
   linked_periods:=array_append(linked_periods,employment.id);
   context_day:=least(month_end,upper(employment.work_period)-1);
   profile:=erp_private.t14_salary_profile(p_employee,context_day,p_cutoff);
   period_rule:=erp_private.t14_rule_as_of(p_company,p_branch,(profile->>'group_id')::bigint,context_day,p_cutoff);
   rule_row:=period_rule;
   IF period_rule.id IS NULL THEN
     issues:=issues||erp_private.t14_issue('rule-missing','No approved calculation rule was effective for the employment period and cutoff.',
         true,jsonb_build_object('employment',employment.id,'as_of',context_day));
     IF profile->>'status' IS DISTINCT FROM 'ready' THEN
       issues:=issues||erp_private.t14_issue(coalesce(profile->>'status','profile-missing'),'Review the dated payroll profile.',
          true,profile->'source');
     END IF;
     CONTINUE;
   END IF;
   rules:=rules||jsonb_build_object('id',period_rule.id,'facts',period_rule.facts,'employment',employment.id);
   part:=erp_private.t14_salary_sources(p_employee,employment.id,p_company,p_branch,p_month,p_cutoff,period_rule.facts);
   available:=available||coalesce((SELECT jsonb_agg(v||jsonb_build_object('source',
       (v->'source')||jsonb_build_object('calculation_rule_id',period_rule.id)))
     FROM jsonb_array_elements(coalesce(part->'lines','[]')) v),'[]');
   issues:=issues||coalesce(part->'exceptions','[]');
   divisor:=coalesce((part->>'divisor')::numeric,divisor);
 END LOOP;

 part:=erp_private.t14_operational_sources(p_employee,p_company,p_branch,p_month,p_cutoff);
 available:=available||coalesce(part->'lines','[]');
 issues:=issues||coalesce(part->'exceptions','[]');
 IF cardinality(linked_periods)=0 THEN
   SELECT h.* INTO employment FROM erp_private.t03_employment_periods h
    WHERE h.employee_id=p_employee AND h.company_id=p_company AND h.branch_id=p_branch
      AND lower(h.work_period)<=month_end ORDER BY upper(h.work_period) DESC NULLS FIRST,h.id DESC LIMIT 1;
   IF employment.id IS NULL THEN RETURN NULL; END IF;
   linked_periods:=ARRAY[employment.id];
   context_day:=least(month_end,upper(employment.work_period)-1);
   profile:=erp_private.t14_salary_profile(p_employee,context_day,p_cutoff);
   rule_row:=erp_private.t14_rule_as_of(p_company,p_branch,(profile->>'group_id')::bigint,month_end,p_cutoff);
   IF rule_row.id IS NULL THEN
     issues:=issues||erp_private.t14_issue('rule-missing','No approved calculation rule is available for this late input.',true);
   ELSE
     rules:=rules||jsonb_build_object('id',rule_row.id,'facts',rule_row.facts,'employment',employment.id);
   END IF;
   IF profile->>'status' IS DISTINCT FROM 'ready' THEN
     issues:=issues||erp_private.t14_issue(coalesce(profile->>'status','profile-missing'),'Review the dated payroll profile for the late input.',
       true,profile->'source');
   END IF;
   IF EXISTS(SELECT 1 FROM public.employee_payroll_holds h WHERE h.employee_id=p_employee
        AND h.hold_date<(p_month+interval '1 month')::date AND h.created_at<=p_cutoff
        AND (h.deleted_at IS NULL OR h.deleted_at>p_cutoff)
        AND (h.is_active OR h.updated_at>p_cutoff OR h.release_date>(p_cutoff AT TIME ZONE 'Asia/Dubai')::date)
        AND (h.release_date IS NULL OR h.release_date>(p_cutoff AT TIME ZONE 'Asia/Dubai')::date OR h.updated_at>p_cutoff)) THEN
     issues:=issues||erp_private.t14_issue('payroll-hold','An effective payroll hold also applies to this late input.',true);
   END IF;
 END IF;
 profile_currency:=profile->>'currency';

 FOR entry IN SELECT value FROM jsonb_array_elements(available) ORDER BY value->>'key' LOOP
   IF entry->>'key'=ANY(seen) THEN
     issues:=issues||erp_private.t14_issue('duplicate-source','Two facts resolved to the same payable source identity.',true,entry->'source');
   ELSIF erp_private.t14_other_draft(p_run,p_employee,entry) THEN
     issues:=issues||erp_private.t14_issue('source-in-another-draft','This amount or overlapping time is already held by another draft.',false,entry->'source');
   ELSE
     seen:=array_append(seen,entry->>'key');
     lines:=lines||entry;
   END IF;
 END LOOP;

 part:=erp_private.t14_adjustment_basis(p_run,p_employee,lines,p_cutoff);
 lines:=lines||coalesce(part->'lines','[]');
 issues:=issues||coalesce(part->'exceptions','[]');

 SELECT coalesce(sum(round((v->>'amount')::numeric,2)) FILTER(WHERE v->>'category'='basic'),0),
        coalesce(sum(round((v->>'amount')::numeric,2)) FILTER(WHERE v->>'kind'='earning'),0),
        coalesce(sum(round((v->>'amount')::numeric,2)) FILTER(WHERE v->>'kind'='deduction'),0),
        min(v->>'currency')
 INTO basic,gross,deductions,currency FROM jsonb_array_elements(lines) v;
 currency:=coalesce(currency,profile_currency);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(lines) v WHERE v->>'currency' IS DISTINCT FROM currency)
    OR (profile_currency IS NOT NULL AND currency IS DISTINCT FROM profile_currency) THEN
   issues:=issues||erp_private.t14_issue('mixed-currency','Resolve conflicting currencies before combining payroll amounts.',true);
   -- Retain each exact line for review, and leave the aggregate unavailable.
   currency:=NULL; gross:=0; deductions:=0;
 ELSIF rule_row.id IS NOT NULL AND currency IS NOT NULL THEN
   part:=erp_private.t14_recovery_basis(p_run,p_employee,p_company,p_branch,p_month,p_cutoff,
       rule_row.facts,currency,basic,gross,deductions,divisor);
   issues:=issues||coalesce(part->'exceptions','[]');
   FOR entry IN SELECT value FROM jsonb_array_elements(coalesce(part->'lines','[]')) LOOP
     lines:=lines||(entry||jsonb_build_object('source',
          (entry->'source')||jsonb_build_object('calculation_rule_id',rule_row.id)));
     IF entry->>'kind'='earning' THEN gross:=gross+(entry->>'amount')::numeric;
     ELSE deductions:=deductions+(entry->>'amount')::numeric; END IF;
   END LOOP;
 END IF;

 IF deductions>gross THEN
   issues:=issues||erp_private.t14_issue('negative-net','Calculated deductions exceed earnings. Review the source amounts.',true);
 ELSIF deductions>0 AND gross-deductions<(rule_row.facts->>'net_floor')::numeric THEN
   issues:=issues||erp_private.t14_issue('net-floor','Calculated deductions would leave less than the approved net-pay minimum.',true);
 END IF;
 IF currency IS NULL OR EXISTS(SELECT 1 FROM jsonb_array_elements(issues) i WHERE (i->>'blocking')::boolean) THEN total_state:='held'; END IF;
 IF cardinality(linked_periods)=1 AND lower(employment.work_period)<p_month AND upper(employment.work_period)<=p_month
     AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(lines) v WHERE (v->>'amount')::numeric>0)
     AND jsonb_array_length(issues)=0 THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('id',person.id,'name',coalesce(person.full_name_en,person.employee_code),
    'employment_ids',linked_periods,'currency',currency,'gross',gross,'deductions',deductions,'state',total_state,
    'rules',rules,'lines',lines,'exceptions',issues);
END $$;

CREATE FUNCTION erp_private.t14_reservable(p_category text) RETURNS boolean
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT p_category IN('fleet-overtime','workshop-overtime','trip-allowance','trip-allowance-adjustment',
      'workshop-correction','recovery','recovery-refund','adjustment');
$$;

CREATE FUNCTION erp_private.t14_calculate(p_company bigint,p_branch bigint,p_month date,p_cutoff timestamptz,
 p_expected uuid,p_actor bigint,p_reason text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' SET timezone='UTC' AS $$
DECLARE
 anchor erp_private.t14_runs; head erp_private.t14_versions; snapshot jsonb; summary jsonb;
 source_hash text; rules_hash text; identity uuid; content_hash text; count_issues int;
BEGIN
 IF p_month IS NULL OR NOT isfinite(p_month) OR p_month<>date_trunc('month',p_month::timestamp)::date OR p_cutoff IS NULL
    OR NOT isfinite(p_cutoff) OR p_cutoff>(statement_timestamp()) OR (p_cutoff AT TIME ZONE 'Asia/Dubai')::date<p_month THEN
   RAISE EXCEPTION 'Select a payroll month and elapsed cutoff in that month or later' USING ERRCODE='22023';
 END IF;
 -- Serialize monthly draft holdings for this employing company. The unique and
 -- interval exclusions also protect cross-employer races on a shared fact.
 PERFORM pg_advisory_xact_lock(hashtextextended('t14-payroll:'||p_company,0));
 INSERT INTO erp_private.t14_runs(company_id,branch_id,month) VALUES(p_company,p_branch,p_month) ON CONFLICT DO NOTHING;
 SELECT * INTO STRICT anchor FROM erp_private.t14_runs WHERE company_id=p_company AND branch_id=p_branch AND month=p_month FOR UPDATE;
 SELECT * INTO head FROM erp_private.t14_versions WHERE run_id=anchor.id ORDER BY number DESC LIMIT 1;
 IF head.id IS DISTINCT FROM p_expected THEN
   RAISE EXCEPTION 'Payroll draft changed. Reload the latest version before recalculating.' USING ERRCODE='PT409';
 END IF;
 IF head.id IS NOT NULL AND head.cutoff<>p_cutoff THEN
   RAISE EXCEPTION 'Use the original cutoff for this monthly draft. Late inputs remain for the next monthly review.' USING ERRCODE='PT409';
 END IF;
 WITH subjects AS (
   SELECT h.employee_id FROM erp_private.t03_employment_periods h WHERE h.company_id=p_company AND h.branch_id=p_branch
     AND h.work_period && daterange(p_month,(p_month+interval '1 month')::date,'[)')
   UNION
   SELECT employee_id FROM erp_private.t14_operational_subjects(p_company,p_branch,p_month,p_cutoff)
   UNION
   SELECT c.employee_id FROM erp_private.t13_cases c WHERE c.employer_company_id=p_company AND c.employer_branch_id=p_branch
     AND c.subject_status='verified' AND c.occurred_at<=p_cutoff AND c.reported_at<=p_cutoff
 ), calculated AS MATERIALIZED (
   SELECT b.employee_id,erp_private.t14_employee_basis(anchor.id,b.employee_id,p_company,p_branch,p_month,p_cutoff) AS facts
   FROM subjects b
 )
 SELECT coalesce(jsonb_agg(facts ORDER BY employee_id) FILTER(WHERE facts IS NOT NULL),'[]') INTO snapshot FROM calculated;

 IF jsonb_array_length(snapshot)=0 THEN
   RAISE EXCEPTION 'There are no verified employment periods or late payroll sources in this scope' USING ERRCODE='PT409';
 END IF;
 SELECT coalesce(jsonb_agg(val ORDER BY val->>'currency'),'[]') INTO summary FROM (
   SELECT jsonb_build_object('currency',row->>'currency','gross',sum((row->>'gross')::numeric)::text,
      'deductions',sum((row->>'deductions')::numeric)::text,
      'net',sum((row->>'gross')::numeric-(row->>'deductions')::numeric)::text,'employees',count(*)) val
   FROM jsonb_array_elements(snapshot) row WHERE row->>'state'='ready' GROUP BY row->>'currency'
 ) totals;
 SELECT coalesce(sum(jsonb_array_length(row->'exceptions')),0),
   erp_private.t02_digest(jsonb_agg(jsonb_build_array(row->'id',row->'rules') ORDER BY (row->>'id')::bigint))
 INTO count_issues,rules_hash FROM jsonb_array_elements(snapshot) row;
 source_hash:=erp_private.t02_digest(snapshot);
 content_hash:=erp_private.t02_digest(jsonb_build_object('run',anchor.id,'month',p_month,'cutoff',p_cutoff,
   'source',source_hash,'rules',rules_hash,'totals',summary));

 INSERT INTO erp_private.t14_versions(run_id,number,cutoff,source_digest,rule_digest,digest,totals,exception_count,calculated_by,reason)
 VALUES(anchor.id,coalesce(head.number+1,1),p_cutoff,source_hash,rules_hash,content_hash,summary,count_issues,p_actor,p_reason)
 RETURNING id INTO identity;

 INSERT INTO erp_private.t14_results(version_id,employee_id,employee_name,employment_ids,currency,gross,deductions,state,policy_snapshots,exceptions)
 SELECT identity,(row->>'id')::bigint,row->>'name',
    ARRAY(SELECT value::bigint FROM jsonb_array_elements_text(row->'employment_ids')),
    row->>'currency',(row->>'gross')::numeric,(row->>'deductions')::numeric,row->>'state',row->'rules',row->'exceptions'
 FROM jsonb_array_elements(snapshot) row;
 INSERT INTO erp_private.t14_lines(version_id,employee_id,key,category,kind,amount,currency,quantity,unit,rate,original_on,available_at,source,reason)
 SELECT identity,(row->>'id')::bigint,v->>'key',v->>'category',v->>'kind',(v->>'amount')::numeric,
    v->>'currency',(v->>'quantity')::numeric,v->>'unit',(v->>'rate')::numeric,
    (v->>'original_on')::date,(v->>'available_at')::timestamptz,v->'source',v->>'reason'
 FROM jsonb_array_elements(snapshot) row CROSS JOIN LATERAL jsonb_array_elements(row->'lines') v;

 DELETE FROM erp_private.t14_draft_usage WHERE run_id=anchor.id;
 INSERT INTO erp_private.t14_draft_usage(key,run_id,line_id,employee_id,span)
 SELECT l.key,anchor.id,l.id,l.employee_id,(l.source->>'interval')::tstzmultirange
 FROM erp_private.t14_lines l JOIN erp_private.t14_results e ON e.version_id=l.version_id AND e.employee_id=l.employee_id
 WHERE l.version_id=identity AND e.state='ready' AND l.amount>0 AND erp_private.t14_reservable(l.category);
 RETURN jsonb_build_object('run',anchor.id,'version',identity,'number',coalesce(head.number+1,1),'digest',content_hash,
   'source_digest',source_hash,'rule_digest',rules_hash,'totals',summary,'exception_count',count_issues);
END $$;

REVOKE ALL ON FUNCTION erp_private.t14_issue(text,text,boolean,jsonb),
 erp_private.t14_rule_as_of(bigint,bigint,bigint,date,timestamptz),erp_private.t14_adjustment_basis(uuid,bigint,jsonb,timestamptz),
 erp_private.t14_recovery_basis(uuid,bigint,bigint,bigint,date,timestamptz,jsonb,text,numeric,numeric,numeric,numeric),
 erp_private.t14_other_draft(uuid,bigint,jsonb),erp_private.t14_employee_basis(uuid,bigint,bigint,bigint,date,timestamptz),
 erp_private.t14_reservable(text),erp_private.t14_calculate(bigint,bigint,date,timestamptz,uuid,bigint,text)
 FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
