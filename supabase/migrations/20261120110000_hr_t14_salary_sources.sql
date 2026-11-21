BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

-- Payroll reconstructs the cutoff view, including dates released later.
CREATE INDEX t14_leave_allocation_subject_day ON erp_private.t04_days(employee_id,day,id);
CREATE INDEX t14_leave_event_case_revision ON erp_private.t04_case_events(case_id,revision,action,created_at,id);

-- These private readers run inside the T14 draft transaction after exact
-- employment scope is checked. They never return HR, banking or medical files.
CREATE FUNCTION erp_private.t14_salary_profile(p_employee bigint,p_day date,p_cutoff timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE profile public.employee_payroll_profiles; pay_group public.hr_payroll_groups; resolved text;
BEGIN
 SELECT * INTO profile FROM public.employee_payroll_profiles p WHERE p.employee_id=p_employee;
 SELECT * INTO pay_group FROM public.hr_payroll_groups g WHERE g.id=profile.payroll_group_id;
 resolved:=CASE
  WHEN profile.id IS NULL OR profile.effective_date>p_day OR profile.created_at>p_cutoff
    OR profile.deleted_at<=p_cutoff THEN 'missing-salary-profile'
  WHEN profile.updated_at>p_cutoff THEN 'salary-profile-after-cutoff'
  WHEN profile.payroll_status='hold' THEN 'payroll-hold'
  WHEN profile.payroll_status<>'active' THEN 'inactive-salary-profile'
  WHEN pay_group.id IS NULL OR NOT pay_group.is_active OR pay_group.deleted_at IS NOT NULL
    OR pay_group.pay_frequency<>'monthly' THEN 'missing-monthly-payroll-group'
  WHEN pay_group.created_at>p_cutoff OR pay_group.updated_at>p_cutoff THEN 'payroll-group-after-cutoff'
  WHEN profile.currency!~'^[A-Z]{3}$' OR NOT EXISTS(SELECT 1 FROM public.currencies c
          WHERE c.currency_code=profile.currency AND c.is_active AND c.decimal_places=2) THEN 'invalid-payroll-currency'
  ELSE 'ready'
 END;
 RETURN jsonb_build_object('status',resolved,'currency',profile.currency,'group_id',profile.payroll_group_id,
  'source',jsonb_build_object('profile_id',profile.id,'profile_revision',profile.workspace_revision,
    'profile_effective_on',profile.effective_date,'group_id',pay_group.id,'available_at',
    greatest(profile.created_at,profile.updated_at,pay_group.created_at,pay_group.updated_at)));
END;
$$;

CREATE FUNCTION erp_private.t14_hr_exception(p_code text,p_reason text,p_blocking boolean,p_source jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_strip_nulls(jsonb_build_object('code',p_code,'reason',p_reason,'blocking',p_blocking,'source',p_source));
$$;

-- Apply the F12 salary inquiry's dated component eligibility and applied Basic
-- overlay to the verified historical employment scope. Its public inquiry
-- remains scoped to the current employee, so this projection uses the same
-- retained facts directly and additionally pins their cutoff and components.
CREATE FUNCTION erp_private.t14_salary_day(p_employee bigint,p_day date,p_cutoff timestamptz,p_currency text)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE component record; revised public.employee_salary_revision_effects; entries jsonb:='[]';
 declarations bigint[]:='{}'; old_basic jsonb:='[]'; gross numeric:=0; basic numeric:=0; deductions numeric:=0;
BEGIN
 FOR component IN
  SELECT c.id,c.component_type_id,c.amount,c.effective_from,c.effective_to,c.is_active,c.created_at,
    c.updated_at,c.workspace_revision,t.component_kind,t.is_basic,t.code,t.name_en,
    t.updated_at AS type_observed_at,t.workspace_revision AS type_revision,t.deleted_at AS type_deleted_at
  FROM public.employee_salary_components c LEFT JOIN public.hr_salary_component_types t ON t.id=c.component_type_id
  WHERE c.employee_id=p_employee AND c.created_at<=p_cutoff AND (c.deleted_at IS NULL OR c.deleted_at>p_cutoff)
    AND c.effective_from<=p_day AND (c.effective_to IS NULL OR c.effective_to>=p_day OR c.effective_to<c.effective_from)
    AND (c.is_active OR c.effective_to IS NOT NULL OR c.updated_at>p_cutoff)
  ORDER BY c.component_type_id,c.id
 LOOP
  IF component.updated_at>p_cutoff OR component.type_observed_at>p_cutoff THEN
   RETURN jsonb_build_object('status','salary-source-after-cutoff','source_id',component.id);
  END IF;
  IF component.component_type_id=ANY(declarations) THEN
   RETURN jsonb_build_object('status','overlapping-salary-components','source_id',component.id);
  END IF;
  IF NOT component.is_active OR component.effective_to<component.effective_from OR component.type_deleted_at IS NOT NULL
    OR component.amount IS NULL OR component.amount<0 OR component.amount::text IN('NaN','Infinity','-Infinity')
    OR component.component_kind IS NULL OR component.component_kind NOT IN('earning','deduction')
    OR component.is_basic IS NULL OR component.is_basic AND component.component_kind<>'earning' THEN
   RETURN jsonb_build_object('status','invalid-salary-source','source_id',component.id);
  END IF;
  declarations:=array_append(declarations,component.component_type_id);
  IF component.component_kind='earning' THEN gross:=gross+component.amount;
  ELSE deductions:=deductions+component.amount; END IF;
  IF component.is_basic THEN
   basic:=basic+component.amount;
   old_basic:=old_basic||jsonb_build_array(jsonb_build_object('component_id',component.id,
     'component_revision',component.workspace_revision,'type_id',component.component_type_id,'type_revision',component.type_revision));
  END IF;
  entries:=entries||jsonb_build_array(jsonb_build_object('component_key','component:'||component.component_type_id,
    'category',CASE WHEN component.is_basic THEN 'basic' WHEN component.component_kind='earning' THEN 'salary-component' ELSE 'salary-deduction' END,
    'kind',component.component_kind,'monthly_rate',component.amount,'available_at',greatest(component.created_at,component.updated_at,component.type_observed_at),
    'reason',component.name_en,'source',jsonb_build_object('component_id',component.id,'component_revision',component.workspace_revision,
      'type_id',component.component_type_id,'type_revision',component.type_revision,'component_code',component.code,
      'effective_from',component.effective_from,'effective_to',component.effective_to)));
 END LOOP;

 SELECT * INTO revised FROM public.employee_salary_revision_effects r
 WHERE r.employee_id=p_employee AND r.effective_date<=p_day AND r.applied_at<=p_cutoff
 ORDER BY r.effective_date DESC,r.id DESC LIMIT 1;
 IF revised.id IS NOT NULL THEN
  IF revised.currency<>p_currency THEN
   RETURN jsonb_build_object('status','salary-effect-currency-mismatch','source_id',revised.id);
  END IF;
  gross:=gross-basic+revised.new_basic;
  basic:=revised.new_basic;
  SELECT coalesce(jsonb_agg(entry ORDER BY ord),'[]') INTO entries
  FROM jsonb_array_elements(entries) WITH ORDINALITY e(entry,ord) WHERE entry->>'category'<>'basic';
  entries:=entries||jsonb_build_array(jsonb_build_object('component_key','basic-effect','category','basic',
    'kind','earning','monthly_rate',basic,'available_at',revised.applied_at,'reason','Applied Basic salary revision',
    'source',jsonb_build_object('salary_effect_id',revised.id,'salary_revision_id',revised.revision_id,
      'source_fingerprint',revised.source_fingerprint,'effective_from',revised.effective_date,'prior_basic_components',old_basic)));
 END IF;
 IF basic<=0 OR gross<=0 THEN RETURN jsonb_build_object('status','missing-basic-salary'); END IF;
 IF deductions>gross THEN RETURN jsonb_build_object('status','recurring-deductions-exceed-salary'); END IF;
 RETURN jsonb_build_object('status','ready','basic',basic,'gross',gross,'entries',entries);
END;
$$;

CREATE FUNCTION erp_private.t14_leave_day(p_employment bigint,p_employee bigint,p_company bigint,p_branch bigint,
 p_day date,p_cutoff timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE item record; selected jsonb; possible jsonb; approval_state text;
BEGIN
 FOR item IN
  SELECT d.id,d.request_revision,d.policy_id,d.period_id,d.rate,d.state,r.id AS case_id,r.category,r.status,
    approved.id AS approval_id,approved.created_at AS approved_at,approved.revision AS approved_revision,
    reversed.id AS reversal_id,reversed.created_at AS reversed_at
  FROM erp_private.t04_days d JOIN erp_private.t04_cases r ON r.id=d.case_id
  LEFT JOIN LATERAL (
   SELECT e.id,e.created_at,e.revision FROM erp_private.t04_case_events e
   WHERE e.case_id=r.id AND e.revision=d.request_revision+2 AND e.action IN ('approve','approve-exception')
   ORDER BY e.created_at,e.id LIMIT 1
  ) approved ON true
  LEFT JOIN LATERAL (
   SELECT e.id,e.created_at FROM erp_private.t04_case_events e
   WHERE e.case_id=r.id AND e.revision>approved.revision
     AND (e.action='cancel' OR e.action='return' AND d.day>=(e.input->>'from')::date)
   ORDER BY e.created_at,e.id LIMIT 1
  ) reversed ON approved.id IS NOT NULL
  WHERE d.employee_id=p_employee AND d.day=p_day AND r.employee_id=p_employee AND r.employment_id=p_employment
    AND r.company_id=p_company AND r.branch_id IS NOT DISTINCT FROM p_branch
  ORDER BY d.id
 LOOP
  IF item.reversal_id IS NOT NULL AND item.reversed_at<=p_cutoff THEN CONTINUE; END IF;
  approval_state:=CASE
   WHEN item.approval_id IS NOT NULL AND item.approved_at<=p_cutoff
       AND (item.state='posted' AND item.status='approved'
         OR item.state='released' AND item.reversal_id IS NOT NULL) THEN 'ready'
   WHEN item.approved_at>p_cutoff THEN 'late'
   WHEN item.state='reserved' AND item.status IN ('pending','reviewed') THEN 'pending'
   WHEN item.state='posted' OR item.approval_id IS NOT NULL THEN 'unverified'
  END;
  IF approval_state IS NULL THEN CONTINUE; END IF;
  possible:=jsonb_build_object('status',approval_state,'category',item.category,'allocation_id',item.id,
   'case_id',item.case_id,'policy_id',item.policy_id,'entitlement_period_id',item.period_id,
   'allocation_revision',item.request_revision,'approval_id',item.approval_id,
   'approval_revision',item.approved_revision,'approved_at',item.approved_at,'paid_fraction',item.rate);
  IF approval_state='ready' THEN
   IF selected->>'status'='ready' THEN RETURN jsonb_build_object('status','ambiguous'); END IF;
   selected:=possible;
  ELSIF selected IS NULL OR (approval_state='unverified' AND selected->>'status' IN ('pending','late')) THEN
   selected:=possible;
  END IF;
 END LOOP;
 RETURN selected;
END;
$$;

CREATE FUNCTION erp_private.t14_salary_sources(p_employee bigint,p_employment bigint,p_company bigint,p_branch bigint,
 p_month date,p_cutoff timestamptz,p_rule jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE employment erp_private.t03_employment_periods; opening_at timestamptz; closing_at timestamptz;
 month_end date; first_day date; until_day date; work_day date; month_days integer; divisor int; recurring_divisor int;
 total_employed int; salary_days jsonb:='[]'; day_basis jsonb; profile jsonb; held record; leave_day jsonb;
 attendance public.employee_attendance_daily_summary; legacy_id bigint;
 money_currency text; payroll_group bigint; lines jsonb:='[]'; exceptions jsonb:='[]'; result jsonb;
 eligibility text; deduction_monthly_rate numeric; paid_fraction numeric; unit_rate numeric; component_lines jsonb;
 wage_available_at timestamptz; salary_source_refs jsonb;
 day_loss_source jsonb; loss_code text; loss_reason text;
BEGIN
 IF NOT coalesce(isfinite(p_month) AND p_month=date_trunc('month',p_month)::date AND isfinite(p_cutoff),false)
 THEN RAISE EXCEPTION 'An exact payroll month and finite cutoff are required' USING ERRCODE='22023'; END IF;
 SELECT * INTO employment FROM erp_private.t03_employment_periods p WHERE p.id=p_employment AND p.employee_id=p_employee
 AND p.company_id=p_company AND p.branch_id IS NOT DISTINCT FROM p_branch;
 IF employment.id IS NULL THEN RAISE EXCEPTION 'Verified historical employment required' USING ERRCODE='42501'; END IF;

 month_end:=(p_month+interval '1 month')::date;
 month_days:=month_end-p_month;
 first_day:=greatest(p_month,lower(employment.work_period),employment.actual_start);
 until_day:=least(month_end,upper(employment.work_period));
 IF first_day>=until_day THEN RAISE EXCEPTION 'Employment does not intersect payroll month' USING ERRCODE='22023'; END IF;

 SELECT coalesce(c.applied_at,l.created_at),stop.applied_at INTO opening_at,closing_at
 FROM erp_private.t03_employment_periods e
 LEFT JOIN erp_private.t03_employment_changes c ON c.id=e.change_id
 LEFT JOIN public.employee_recruitment_links l ON l.id=e.recruitment_link_id
 LEFT JOIN erp_private.t03_employment_changes stop ON stop.id=e.closed_by_change_id
 WHERE e.id=employment.id;
 IF opening_at IS NULL OR opening_at>p_cutoff OR until_day<month_end AND employment.closed_by_change_id IS NOT NULL
      AND (closing_at IS NULL OR closing_at>p_cutoff) THEN
  exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception(
   'employment-unverified-at-cutoff','Confirm the employment start or changed period against the payroll cutoff.',true,
   jsonb_build_object('employment_id',employment.id)));
 END IF;

 IF NOT coalesce(p_rule->>'proration' IN ('calendar-days','fixed-days')
    AND p_rule->>'rounding'='line-half-up' AND p_rule->>'absence' IN ('unpaid-only','verified-absence')
    AND p_rule->>'leave_wage_basis' IN ('basic','gross'),false)
   OR p_rule->>'proration'='fixed-days' AND NOT coalesce(p_rule->>'fixed_days' ~ '^([1-9]|[12][0-9]|3[01])$',false)
 THEN
  exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception(
   'missing-salary-proration-policy','Approve the proration, absence, leave wage and rounding rules before calculating pay.',true));
 ELSE
  divisor:=CASE WHEN p_rule->>'proration'='fixed-days' THEN (p_rule->>'fixed_days')::int ELSE month_days END;
 END IF;

 profile:=erp_private.t14_salary_profile(p_employee,first_day,p_cutoff);
 money_currency:=profile->>'currency';
 payroll_group:=(profile->>'group_id')::bigint;
 eligibility:=profile->>'status';
 IF eligibility<>'ready' THEN
  exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception(eligibility,
   'Verify the dated salary profile, active monthly payroll group and currency before calculating pay.',true,profile->'source'));
 ELSIF p_rule->>'currency' IS NOT NULL AND p_rule->>'currency'<>money_currency THEN
  exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception(
   'policy-salary-currency-mismatch','The approved payroll rule and salary profile have different currencies.',true));
 END IF;

 FOR held IN
  SELECT h.id,h.hold_date,h.release_date FROM public.employee_payroll_holds h
  WHERE h.employee_id=p_employee AND h.hold_date<until_day AND h.created_at<=p_cutoff
    AND (h.deleted_at IS NULL OR h.deleted_at>p_cutoff)
    AND (h.is_active OR h.updated_at>p_cutoff OR h.release_date>(p_cutoff AT TIME ZONE 'Asia/Dubai')::date)
    AND (h.release_date IS NULL OR h.release_date>(p_cutoff AT TIME ZONE 'Asia/Dubai')::date OR h.updated_at>p_cutoff)
  ORDER BY h.id
 LOOP
  exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception('payroll-hold',
   'An effective payroll hold requires Accounts review.',true,jsonb_build_object('hold_id',held.id,'hold_date',held.hold_date)));
 END LOOP;
 result:=jsonb_build_object('lines','[]'::jsonb,'currency',money_currency,'group_id',payroll_group,'divisor',divisor,
  'profile',profile->'source','employment_id',employment.id,'from',first_day,'until',until_day);
 IF jsonb_array_length(exceptions)>0 THEN RETURN result||jsonb_build_object('exceptions',exceptions); END IF;

 -- A full month of verified continuous service uses the calendar denominator
 -- even when a transfer splits it. Partial service follows the approved
 -- divisor with a cap across all of the employee's verified pay periods.
 SELECT coalesce(sum(least(month_end,upper(e.work_period))-greatest(p_month,lower(e.work_period),e.actual_start)),0)
 INTO total_employed FROM erp_private.t03_employment_periods e WHERE e.employee_id=p_employee
   AND e.work_period&&daterange(p_month,month_end,'[)');
 recurring_divisor:=CASE WHEN total_employed=month_days THEN month_days ELSE greatest(divisor,total_employed) END;
 FOR work_day IN SELECT first_day+day_no FROM generate_series(0,until_day-first_day-1) day_no LOOP
  day_basis:=erp_private.t14_salary_day(p_employee,work_day,p_cutoff,money_currency);
  IF day_basis->>'status'<>'ready' THEN
   exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception(day_basis->>'status',
     'Review overlapping rates, missing Basic pay or unverified historical salary before calculating this employee.',true,
     jsonb_build_object('day',work_day,'source_id',day_basis->'source_id')));
   RETURN result||jsonb_build_object('exceptions',exceptions);
  END IF;
  salary_days:=salary_days||jsonb_build_array(jsonb_build_object('day',work_day,'basis',day_basis));
 END LOOP;

 IF EXISTS(SELECT 1 FROM public.employee_salary_revision_effects r WHERE r.employee_id=p_employee AND r.effective_date<until_day
   AND r.applied_at>p_cutoff) THEN
  exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception('salary-revision-after-cutoff',
   'A salary revision applied after the cutoff. The draft retains the salary basis available by cutoff.',false));
 END IF;
 IF EXISTS(SELECT 1 FROM public.employee_salary_components c WHERE c.employee_id=p_employee AND c.effective_from<until_day
   AND (c.effective_to IS NULL OR c.effective_to>=first_day) AND c.created_at>p_cutoff) THEN
  exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception('salary-component-after-cutoff',
   'A salary component was added after the cutoff. Review its effect on an eligible later run.',false));
 END IF;

 -- Group exact contiguous terms. Anchoring each rounded slice to the month's
 -- day offsets also preserves the last cent across an in-month transfer.
 WITH daily AS (
  SELECT (d->>'day')::date AS day,v AS entry
  FROM jsonb_array_elements(salary_days) d CROSS JOIN LATERAL jsonb_array_elements(d->'basis'->'entries') v
 ), consecutives AS (
  SELECT distinct_day.*,day-(row_number() OVER(PARTITION BY entry ORDER BY day))::int AS band
  FROM daily distinct_day
 ), grouped AS (
  SELECT entry,min(day) AS begins,max(day)+1 AS ends,(entry->>'monthly_rate')::numeric AS monthly_rate
  FROM consecutives GROUP BY entry,band
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'key','recurring:'||employment.id||':'||(entry->>'component_key')||':'||begins,
   'category',entry->>'category','kind',entry->>'kind','currency',money_currency,
   'amount',round(monthly_rate*(ends-p_month)/recurring_divisor,2)-round(monthly_rate*(begins-p_month)/recurring_divisor,2),
   'quantity',ends-begins,'rate',monthly_rate/recurring_divisor,'unit','calendar-day','original_on',begins,
   'available_at',greatest((entry->>'available_at')::timestamptz,(profile->'source'->>'available_at')::timestamptz,opening_at),
   'reason',entry->>'reason','source',(entry->'source')||(profile->'source')||jsonb_build_object(
    'employment_id',employment.id,'from',begins,'until',ends,'monthly_rate',monthly_rate,
    'proration_divisor',recurring_divisor,'month_anchor',p_month,'rounding',p_rule->>'rounding'))
   ORDER BY begins,entry->>'component_key'),'[]') INTO component_lines FROM grouped;
 lines:=component_lines;

 FOR work_day,day_basis IN SELECT (s->>'day')::date,s->'basis' FROM jsonb_array_elements(salary_days) s LOOP
  leave_day:=erp_private.t14_leave_day(p_employment,p_employee,p_company,p_branch,work_day,p_cutoff);
  deduction_monthly_rate:=(day_basis->>(p_rule->>'leave_wage_basis'))::numeric;
  unit_rate:=deduction_monthly_rate/divisor;
  SELECT * INTO attendance FROM public.employee_attendance_daily_summary a
   WHERE a.employee_id=p_employee AND a.attendance_date=work_day;
  IF leave_day->>'status'='ready' THEN
   IF attendance.approval_status IN ('approved','locked') AND attendance.approved_at<=p_cutoff
     AND attendance.updated_at<=p_cutoff AND (attendance.worked_minutes>0 OR attendance.total_hours>0) THEN
    exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception('work-overlapping-approved-leave',
     'Reconcile approved work and leave recorded on the same date.',true,
     jsonb_build_object('case_id',leave_day->'case_id','attendance_id',attendance.id,'day',work_day)));
    CONTINUE;
   END IF;
   paid_fraction:=(leave_day->>'paid_fraction')::numeric;
   loss_code:=CASE WHEN leave_day->>'category'='sick' THEN 'sick-leave'
                   WHEN paid_fraction=1 THEN 'paid-leave' ELSE 'unpaid-leave' END;
   loss_reason:=CASE WHEN paid_fraction=1 THEN 'Approved paid leave included in monthly pay'
                     WHEN leave_day->>'category'='sick' THEN 'Approved sick leave pay tier'
                     ELSE 'Approved unpaid leave' END;
   day_loss_source:=(leave_day-'status'-'approved_at');
  ELSIF leave_day IS NOT NULL THEN
   exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception(
    CASE leave_day->>'status' WHEN 'late' THEN 'leave-approval-after-cutoff' WHEN 'pending' THEN 'leave-review-pending'
      ELSE 'leave-approval-unverified' END,
    'Review the pending, late or unverified leave allocation before applying a payroll deduction.',
    leave_day->>'status' IN ('unverified','ambiguous'),jsonb_build_object('day',work_day,
     'case_id',leave_day->'case_id','allocation_id',leave_day->'allocation_id')));
   CONTINUE;
  ELSE
   SELECT l.id INTO legacy_id FROM public.employee_leave_requests l WHERE l.employee_id=p_employee
     AND l.approval_status='approved' AND l.deleted_at IS NULL AND l.created_at<=p_cutoff
     AND work_day BETWEEN l.start_date AND l.end_date ORDER BY l.id LIMIT 1;
   IF legacy_id IS NOT NULL THEN
    exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception('legacy-leave-pay-unverified',
     'Convert the approved legacy leave into a verified dated pay allocation before using it in payroll.',true,
      jsonb_build_object('request_id',legacy_id,'day',work_day)));
    CONTINUE;
   END IF;
   IF attendance.id IS NULL OR attendance.attendance_type NOT IN ('absent','on_leave') THEN CONTINUE; END IF;
   IF attendance.attendance_type='on_leave' THEN
    exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception('attendance-leave-without-allocation',
     'Match the leave attendance to its approved dated pay allocation.',true,
     jsonb_build_object('attendance_id',attendance.id,'day',work_day)));
    CONTINUE;
   END IF;
   IF p_rule->>'absence'='unpaid-only' THEN CONTINUE; END IF;
   IF attendance.approval_status NOT IN ('approved','locked') OR attendance.approved_by IS NULL
     OR attendance.approved_at IS NULL OR attendance.approved_at>p_cutoff OR attendance.updated_at>p_cutoff THEN
    exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception(
     CASE WHEN attendance.approved_at>p_cutoff OR attendance.updated_at>p_cutoff THEN 'attendance-after-cutoff'
       ELSE 'attendance-review-pending' END,
     'Only absence approved and available by the cutoff can affect the draft.',false,
     jsonb_build_object('attendance_id',attendance.id,'day',work_day)));
    CONTINUE;
   END IF;
   paid_fraction:=0;
   loss_code:='absence';
   loss_reason:='Independently approved absence';
   day_loss_source:=jsonb_build_object('attendance_id',attendance.id,'attendance_revision',attendance.workspace_revision,
     'attendance_digest',erp_private.t08_attendance_digest(attendance),'paid_fraction',paid_fraction);
  END IF;
  SELECT coalesce(jsonb_agg(v->'source' ORDER BY v->>'component_key'),'[]'),max((v->>'available_at')::timestamptz)
  INTO salary_source_refs,wage_available_at FROM jsonb_array_elements(day_basis->'entries') v
  WHERE v->>'kind'='earning' AND (p_rule->>'leave_wage_basis'='gross' OR v->>'category'='basic');
  lines:=lines||jsonb_build_array(jsonb_build_object(
   'key','pay-day-loss:'||employment.id||':'||work_day,
   'category',loss_code,'kind','deduction','amount',round(unit_rate*(1-paid_fraction),2),'currency',money_currency,
   'quantity',1-paid_fraction,'unit','unpaid-day','rate',unit_rate,'original_on',work_day,
   'available_at',greatest(coalesce((leave_day->>'approved_at')::timestamptz,attendance.approved_at),
                          wage_available_at,(profile->'source'->>'available_at')::timestamptz,opening_at),
   'reason',loss_reason,'source',day_loss_source||jsonb_build_object(
    'employment_id',employment.id,'wage_basis',p_rule->>'leave_wage_basis','monthly_rate',deduction_monthly_rate,
    'proration_divisor',divisor,'rounding',p_rule->>'rounding','salary_sources',salary_source_refs)));
 END LOOP;
 RETURN result||jsonb_build_object('lines',lines,'exceptions',exceptions,'recurring_divisor',recurring_divisor);
END;
$$;

REVOKE ALL ON FUNCTION erp_private.t14_salary_profile(bigint,date,timestamptz),
  erp_private.t14_hr_exception(text,text,boolean,jsonb),
  erp_private.t14_salary_day(bigint,date,timestamptz,text),
  erp_private.t14_leave_day(bigint,bigint,bigint,bigint,date,timestamptz),
  erp_private.t14_salary_sources(bigint,bigint,bigint,bigint,date,timestamptz,jsonb)
FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
