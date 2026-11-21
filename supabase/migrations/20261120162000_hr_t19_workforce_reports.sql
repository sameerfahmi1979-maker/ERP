BEGIN;
SET LOCAL lock_timeout='5s';

-- Restore the standard entries in schema-only environments, without replacing any existing template or report metadata.
INSERT INTO public.erp_report_registry (
  report_code, report_name_en, report_name_ar, module_code, report_category,
  description_en, default_output_formats, default_orientation,
  branding_strategy, branding_source_path, required_permissions,
  sensitive_profile, sensitive_field_rules_json, filter_schema_json, column_schema_json,
  supports_numbering, numbering_rule_code, supports_scheduling,
  is_letter_type, sort_order, is_system, is_active
) VALUES
-- 4. HR_ATTENDANCE_SUMMARY
('HR_ATTENDANCE_SUMMARY', 'Attendance Summary', 'ملخص الحضور والانصراف', 'HR', 'summary',
 'Daily attendance summary per employee with hours worked, late minutes, and punch status.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.attendance.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","branch_id","department_id","work_site_id","date_from","date_to","attendance_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","department","attendance_date","attendance_type","shift_name","shift_context","first_in","last_out","total_hours","worked_minutes","worked_fact","late_minutes","early_out_minutes","missing_punch","approval_status","work_site","as_of_date"]}'::jsonb,
 false, null, false, false, 103, true, true),

-- 5. HR_LEAVE_BALANCE
('HR_LEAVE_BALANCE', 'Leave Balance Report', 'تقرير أرصدة الإجازات', 'HR', 'summary',
 'Recorded leave and current verified availability with reservations shown separately.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.leave.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","branch_id","department_id","date_from","date_to"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","leave_type","period_start","period_end","entitled_days","carry_forward","used_days","recorded_balance_days","verified_available_days","pending_reservation_days","balance_status","as_of_date"]}'::jsonb,
 false, null, false, false, 104, true, true),

-- 6. HR_LEAVE_REQUESTS
('HR_LEAVE_REQUESTS', 'Leave Requests', 'طلبات الإجازات', 'HR', 'list',
 'Leave requests overlapping the selected dates, with exact posted or reserved days where verified.',
 ARRAY['screen','pdf','excel','csv','print'], 'landscape',
 'auto_by_owner_company', 'owner_company_id',
 ARRAY['hr.leave.view'],
 'normal', '{}'::jsonb,
 '{"filters":["owner_company_id","branch_id","department_id","date_from","date_to","leave_status"]}'::jsonb,
 '{"columns":["employee_code","employee_name","company","leave_type","request_date","start_date","end_date","total_days","overlap_days","allocated_days","paid_allocated_days","allocation_scope","approval_status","approved_by","approved_at"]}'::jsonb,
 false, null, false, false, 105, true, true)
ON CONFLICT (report_code) DO NOTHING;

-- Preserve registry governance and add the exact branch criterion to the existing reports.
UPDATE public.erp_report_registry
SET filter_schema_json=jsonb_set(filter_schema_json,'{filters}',(filter_schema_json->'filters')||'["branch_id"]'::jsonb)
WHERE report_code IN('HR_ATTENDANCE_SUMMARY','HR_LEAVE_BALANCE','HR_LEAVE_REQUESTS')
 AND jsonb_typeof(filter_schema_json->'filters')='array' AND NOT ((filter_schema_json->'filters') ? 'branch_id');

CREATE FUNCTION public.t19_workforce_grants(p_profile bigint)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_array(u.role_id,u.owner_company_id,u.branch_id)
   ORDER BY u.role_id,u.owner_company_id,u.branch_id),'[]'::jsonb)
 FROM public.user_roles u
 JOIN public.user_profiles p ON p.id=u.user_profile_id AND p.status='active' AND NOT p.must_change_password
 JOIN public.roles r ON r.id=u.role_id AND r.is_active
 LEFT JOIN public.owner_companies c ON c.id=u.owner_company_id
 LEFT JOIN public.branches b ON b.id=u.branch_id AND b.owner_company_id=u.owner_company_id
 LEFT JOIN erp_private.t02_role_validity dated ON dated.assignment_id=u.id
 WHERE u.user_profile_id=p_profile AND u.is_active AND (dated.valid_until IS NULL OR dated.valid_until>clock_timestamp())
 AND (u.owner_company_id IS NULL OR c.status='active')
 AND (u.branch_id IS NULL OR (b.status='active' AND b.operating_status='active'));
$$;

CREATE FUNCTION erp_private.t19_report_scope_key(p_company bigint,p_branch bigint)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT p_company::text||':'||coalesce(p_branch,0)::text;
$$;

-- Legacy dates without one attributable employment are held when the recorded
-- interval crosses a verified company or branch boundary.
CREATE FUNCTION erp_private.t19_workforce_dated_scope(p_employee bigint,p_span daterange,p_company bigint,p_branch bigint)
RETURNS TABLE(company_id bigint,branch_id bigint) LANGUAGE sql STABLE SET search_path='' AS $$
 WITH found AS (
   SELECT h.company_id,h.branch_id FROM erp_private.t03_employment_periods h
   WHERE h.employee_id=p_employee AND h.work_period @> p_span
 )
 SELECT f.company_id,f.branch_id FROM found f
 UNION ALL
 SELECT p_company,p_branch WHERE NOT EXISTS(SELECT 1 FROM found)
  AND NOT EXISTS(SELECT 1 FROM erp_private.t03_employment_periods h WHERE h.employee_id=p_employee
    AND h.work_period && p_span AND ROW(h.company_id,h.branch_id) IS DISTINCT FROM ROW(p_company,p_branch));
$$;

-- Use the same verified funds projection for employee details and the report.
CREATE FUNCTION erp_private.t19_verified_leave_balance(p_employee bigint,p_company bigint,p_branch bigint,p_day date)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE
 employment erp_private.t03_employment_periods;
 rule erp_private.t04_policies;
 period erp_private.t04_periods;
 today date:=erp_private.t04_today();
 carry numeric;
 reserved integer;
 used numeric;
BEGIN
 employment:=erp_private.t04_employment(p_employee,p_day);
 rule:=erp_private.t04_policy(p_company,p_employee,p_day);
 SELECT * INTO period FROM erp_private.t04_periods p WHERE p.employee_id=p_employee AND p.company_id=p_company
  AND p.service_start=erp_private.t04_service_start(employment,rule.facts) AND p.coverage @> p_day;
 IF employment.company_id IS DISTINCT FROM p_company OR employment.branch_id IS DISTINCT FROM p_branch
   OR period.id IS NULL OR period.cutoff>today THEN
  RETURN jsonb_build_object('status','review-required','as_of_date',today,'reason','Verified opening balance unavailable.');
 END IF;
 SELECT coalesce(sum(erp_private.t04_funds_remaining(period.id,m.id,today,NULL)),0) INTO carry
 FROM erp_private.f12_leave_movements m WHERE m.entitlement_id=period.id AND m.effect='carry-in' AND m.expires_before>today;
 SELECT count(*) INTO reserved FROM erp_private.t04_days x JOIN erp_private.t04_cases c ON c.id=x.case_id
  WHERE x.period_id=period.id AND x.state='reserved' AND x.rate=1 AND c.category='annual';
 SELECT period.opening_used-coalesce(sum(m.days),0) INTO used FROM erp_private.f12_leave_movements m
  WHERE m.entitlement_id=period.id AND m.movement_version=2 AND m.effect IN('consume','reverse');
 RETURN jsonb_build_object('status','ready','as_of_date',today,'id',period.id,'period_start',lower(period.coverage),
   'period_end',upper(period.coverage)-1,'opening_cutoff',period.cutoff,'full_entitlement',period.full_entitlement,
   'earned',erp_private.t04_earned(period,today),'reserved',reserved,'approved_usage',used,'carry_available',carry,
   'available',CASE WHEN today<upper(period.coverage)
     THEN erp_private.t04_funds_remaining(period.id,NULL,today,NULL)+carry ELSE 0 END);
END $$;

CREATE OR REPLACE FUNCTION public.t04_leave_balance(p_employee bigint,p_day date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE employee public.employees;
BEGIN
 employee:=erp_private.t04_scope(p_employee,ARRAY['hr.leave.view','hr.leave.assist','hr.leave.approve','hr.leave.sick.review']);
 RETURN erp_private.t19_verified_leave_balance(p_employee,employee.owner_company_id,employee.branch_id,p_day);
END $$;

-- Inputs come only from the Report Center's sealed, revalidated employee
-- collection. The authorized list is never supplied by a caller's form.
CREATE FUNCTION public.t19_workforce_leave_report(p_kind text,p_employees bigint[],p_as_of date,p_from date,p_to date,
 p_status text,p_limit integer,p_owner bigint DEFAULT NULL,p_branch bigint DEFAULT NULL,p_historical text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE output jsonb;
BEGIN
 IF NOT coalesce(p_kind IN('balances','requests'),false) OR cardinality(p_employees) IS NULL
    OR cardinality(p_employees)>20000 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20000
    OR p_as_of IS DISTINCT FROM erp_private.t04_today()
    OR (p_from IS NOT NULL AND (NOT isfinite(p_from) OR p_from<'1900-01-01'))
    OR (p_to IS NOT NULL AND (NOT isfinite(p_to) OR p_to>'9999-12-31'))
    OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to)
    OR (p_status IS NOT NULL AND NOT p_status IN('pending','reviewed','approved','withdrawn','rejected','cancelled')) THEN
   RAISE EXCEPTION 'Current Dubai date, valid filters and bounded report subjects required' USING ERRCODE='22023';
 END IF;
 IF p_kind='balances' THEN
   WITH subjects AS MATERIALIZED (
     SELECT e.id,e.employee_code,e.full_name_en,e.owner_company_id,e.branch_id,c.legal_name_en AS company
     FROM public.employees e JOIN public.owner_companies c ON c.id=e.owner_company_id
     WHERE e.id=ANY(p_employees) AND e.deleted_at IS NULL AND e.employee_status='active'
   ), legacy AS (
     SELECT s.id AS employee,0 AS lane,b.id,COALESCE(b.period_start,make_date(b.leave_year,1,1)) AS starts,
       jsonb_build_object('employee_code',s.employee_code,'employee_name',s.full_name_en,'owner_company_id',dated.company_id,
         'company',organization.legal_name_en,'branch_id',dated.branch_id,'leave_type',t.name_en,'leave_year',b.leave_year,
         'period_start',b.period_start,'period_end',b.period_end,'as_of_date',null,
         'entitled_days',b.entitled_days,'carry_forward',b.carry_forward,'used_days',b.used_days,'balance_days',b.balance_days,
         'recorded_balance_days',b.balance_days,'verified_available_days',null,'pending_reservation_days',null,
         'balance_status','Recorded only') AS item
     FROM subjects s JOIN public.employee_leave_balances b ON b.employee_id=s.id
     JOIN public.hr_leave_types t ON t.id=b.leave_type_id
     CROSS JOIN LATERAL erp_private.t19_workforce_dated_scope(s.id,
       daterange(COALESCE(b.period_start,make_date(b.leave_year,1,1)),COALESCE(b.period_end,make_date(b.leave_year,12,31)),'[]'),
       s.owner_company_id,s.branch_id) dated
     JOIN public.owner_companies organization ON organization.id=dated.company_id
     WHERE (p_from IS NULL OR COALESCE(b.period_end,make_date(b.leave_year,12,31))>=p_from)
       AND (p_to IS NULL OR COALESCE(b.period_start,make_date(b.leave_year,1,1))<=p_to)
       AND (p_owner IS NULL OR dated.company_id=p_owner) AND (p_branch IS NULL OR dated.branch_id=p_branch)
       AND (ROW(dated.company_id,dated.branch_id) IS NOT DISTINCT FROM ROW(s.owner_company_id,s.branch_id)
         OR erp_private.t19_report_scope_key(dated.company_id,dated.branch_id)=ANY(p_historical))
   ), checked AS MATERIALIZED (
     SELECT s.*,erp_private.t19_verified_leave_balance(s.id,s.owner_company_id,s.branch_id,p_as_of) AS facts
     FROM subjects s
   ), verified AS (
     SELECT s.id AS employee,1 AS lane,s.id,COALESCE((s.facts->>'period_start')::date,p_as_of) AS starts,
       jsonb_build_object('employee_code',s.employee_code,'employee_name',s.full_name_en,'owner_company_id',s.owner_company_id,
         'company',s.company,'branch_id',s.branch_id,'leave_type','Annual leave',
         'leave_year',extract(year FROM COALESCE((s.facts->>'period_start')::date,p_as_of)),
         'period_start',s.facts->'period_start','period_end',s.facts->'period_end','as_of_date',p_as_of,
         'entitled_days',s.facts->'full_entitlement','carry_forward',s.facts->'carry_available','used_days',s.facts->'approved_usage',
         'balance_days',null,'recorded_balance_days',null,'verified_available_days',s.facts->'available',
         'pending_reservation_days',s.facts->'reserved',
         'balance_status',CASE WHEN s.facts->>'status'='ready' THEN 'Verified' ELSE 'Review required' END) AS item
     FROM checked s
     WHERE (p_from IS NULL OR COALESCE((s.facts->>'period_end')::date,p_as_of)>=p_from)
       AND (p_to IS NULL OR COALESCE((s.facts->>'period_start')::date,p_as_of)<=p_to)
       AND (p_owner IS NULL OR s.owner_company_id=p_owner) AND (p_branch IS NULL OR s.branch_id=p_branch)
   ), capped AS (
     SELECT * FROM (SELECT * FROM legacy UNION ALL SELECT * FROM verified) f
     ORDER BY starts DESC,employee,lane,id LIMIT p_limit+1
   )
   SELECT coalesce(jsonb_agg(item ORDER BY starts DESC,employee,lane,id),'[]') INTO output FROM capped;
 ELSE
   WITH subjects AS MATERIALIZED (
     SELECT e.id,e.employee_code,e.full_name_en,e.owner_company_id,e.branch_id,c.legal_name_en AS company
     FROM public.employees e JOIN public.owner_companies c ON c.id=e.owner_company_id
     WHERE e.id=ANY(p_employees) AND e.deleted_at IS NULL
   ), recorded AS (
     SELECT 0 AS lane,r.id,r.request_date AS requested,
       jsonb_build_object('employee_code',s.employee_code,'employee_name',s.full_name_en,'owner_company_id',dated.company_id,
         'company',organization.legal_name_en,'branch_id',dated.branch_id,'leave_type',t.name_en,'request_date',r.request_date,
         'start_date',r.start_date,'end_date',r.end_date,'total_days',r.total_days,'approval_status',r.approval_status,
         'approved_by',a.display_name,'approved_at',r.approved_at,'request_ref','Legacy #'||r.id,
         'overlap_days',least(r.end_date,p_to)-greatest(r.start_date,p_from)+1,
         'allocated_days',CASE WHEN proof.days=r.end_date-r.start_date+1 THEN proof.overlap END,
         'paid_allocated_days',null,
         'allocation_scope',CASE WHEN proof.days=r.end_date-r.start_date+1 THEN 'Posted by period (legacy)' ELSE 'Not verified' END) AS item
     FROM subjects s JOIN public.employee_leave_requests r ON r.employee_id=s.id
     JOIN public.hr_leave_types t ON t.id=r.leave_type_id
     CROSS JOIN LATERAL erp_private.t19_workforce_dated_scope(s.id,daterange(r.start_date,r.end_date,'[]'),
       s.owner_company_id,s.branch_id) dated
     JOIN public.owner_companies organization ON organization.id=dated.company_id
     LEFT JOIN public.user_profiles a ON a.id=r.approved_by
     LEFT JOIN LATERAL (
       SELECT sum(m.days) AS days, sum(greatest(0,least(m.period_end,r.end_date,p_to)-
           greatest(m.period_start,r.start_date,p_from)+1)) AS overlap
       FROM erp_private.f12_leave_movements m
       WHERE r.approval_status='approved' AND r.f12_ledger_version=1 AND r.f12_policy IS NOT NULL
         AND m.request_id=r.id AND m.employee_id=s.id AND m.movement_version=1 AND m.effect='consume'
         AND m.days=least(m.period_end,r.end_date)-greatest(m.period_start,r.start_date)+1
     ) proof ON true
     WHERE r.deleted_at IS NULL AND (p_from IS NULL OR r.end_date>=p_from) AND (p_to IS NULL OR r.start_date<=p_to)
       AND (p_status IS NULL OR r.approval_status=p_status)
       AND (p_owner IS NULL OR dated.company_id=p_owner) AND (p_branch IS NULL OR dated.branch_id=p_branch)
       AND (ROW(dated.company_id,dated.branch_id) IS NOT DISTINCT FROM ROW(s.owner_company_id,s.branch_id)
         OR erp_private.t19_report_scope_key(dated.company_id,dated.branch_id)=ANY(p_historical))
   ), assisted AS (
     SELECT 1 AS lane,c.id,(c.created_at AT TIME ZONE 'Asia/Dubai')::date AS requested,
       jsonb_build_object('employee_code',s.employee_code,'employee_name',s.full_name_en,'owner_company_id',c.company_id,
         'company',organization.legal_name_en,'branch_id',c.branch_id,'leave_type',
           CASE c.category WHEN 'annual' THEN 'Annual leave' WHEN 'sick' THEN 'Sick leave' ELSE 'Unpaid leave' END,
         'request_date',(c.created_at AT TIME ZONE 'Asia/Dubai')::date,'start_date',lower(c.dates),'end_date',upper(c.dates)-1,
         'total_days',upper(c.dates)-lower(c.dates),'approval_status',c.status,'approved_by',a.display_name,
         'approved_at',approved.approved_at,'request_ref','Assisted #'||c.id,
         'overlap_days',least(upper(c.dates)-1,p_to)-greatest(lower(c.dates),p_from)+1,
         'allocated_days',CASE WHEN c.status IN('approved','pending','reviewed') AND exact.count_days>0 THEN exact.count_days END,
         'paid_allocated_days',CASE WHEN c.status IN('approved','pending','reviewed') AND exact.count_days>0 THEN exact.paid_days END,
         'allocation_scope',CASE WHEN c.status='approved' AND exact.count_days>0 THEN 'Posted'
           WHEN c.status IN('pending','reviewed') AND exact.count_days>0 THEN 'Reserved' ELSE 'Not verified' END) AS item
     FROM subjects s JOIN erp_private.t04_cases c ON c.employee_id=s.id
     JOIN public.owner_companies organization ON organization.id=c.company_id
     JOIN erp_private.t03_employment_periods h ON h.id=c.employment_id AND h.employee_id=s.id
       AND h.company_id=c.company_id AND h.branch_id IS NOT DISTINCT FROM c.branch_id AND h.work_period @> c.dates
     LEFT JOIN public.user_profiles a ON a.auth_user_id=c.approved_by
     LEFT JOIN LATERAL (
       SELECT max(v.created_at) AS approved_at FROM erp_private.t04_case_events v
       WHERE v.case_id=c.id AND v.action IN('approve','approve-exception')
     ) approved ON true
     LEFT JOIN LATERAL (
       SELECT count(*) AS count_days,sum(v.rate) AS paid_days
       FROM erp_private.t04_days v WHERE v.case_id=c.id AND v.employee_id=s.id AND c.dates @> v.day
         AND (p_from IS NULL OR v.day>=p_from) AND (p_to IS NULL OR v.day<=p_to)
         AND v.state=CASE WHEN c.status='approved' THEN 'posted' ELSE 'reserved' END
     ) exact ON true
     WHERE (p_from IS NULL OR upper(c.dates)>p_from) AND (p_to IS NULL OR lower(c.dates)<=p_to)
       AND (p_status IS NULL OR c.status=p_status OR (p_status='pending' AND c.status='reviewed'))
       AND (p_owner IS NULL OR c.company_id=p_owner) AND (p_branch IS NULL OR c.branch_id=p_branch)
       AND (ROW(c.company_id,c.branch_id) IS NOT DISTINCT FROM ROW(s.owner_company_id,s.branch_id)
         OR erp_private.t19_report_scope_key(c.company_id,c.branch_id)=ANY(p_historical))
   ), capped AS (
     SELECT * FROM (SELECT * FROM recorded UNION ALL SELECT * FROM assisted) f
     ORDER BY requested DESC,lane,id DESC LIMIT p_limit+1
   )
   SELECT coalesce(jsonb_agg(item ORDER BY requested DESC,lane,id DESC),'[]') INTO output FROM capped;
 END IF;
 IF jsonb_array_length(output)>p_limit THEN
   RAISE EXCEPTION 'The report exceeds its verified row limit. Narrow the filters.' USING ERRCODE='54000';
 END IF;
 RETURN output;
END $$;


CREATE FUNCTION public.t19_workforce_attendance_report(p_employees bigint[],p_as_of date,p_from date,p_to date,
 p_site bigint,p_status text,p_limit integer,p_owner bigint DEFAULT NULL,p_branch bigint DEFAULT NULL,p_historical text[] DEFAULT '{}')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE output jsonb;
BEGIN
 IF cardinality(p_employees) IS NULL OR cardinality(p_employees)>20000 OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 20000
    OR p_as_of IS DISTINCT FROM erp_private.t04_today()
    OR (p_from IS NOT NULL AND (NOT isfinite(p_from) OR p_from<'1900-01-01'))
    OR (p_to IS NOT NULL AND (NOT isfinite(p_to) OR p_to>'9999-12-31'))
    OR (p_from IS NOT NULL AND p_to IS NOT NULL AND p_from>p_to)
    OR (p_site IS NOT NULL AND p_site<=0)
    OR (p_status IS NOT NULL AND NOT p_status IN('site','office','yard','workshop','remote','on_leave','absent','holiday')) THEN
   RAISE EXCEPTION 'Current Dubai date, valid filters and bounded report subjects required' USING ERRCODE='22023';
 END IF;
 WITH selected AS MATERIALIZED (
   SELECT a.id,a.attendance_date,a.attendance_type,a.first_in_at,a.last_out_at,a.total_hours,a.worked_minutes,
     a.late_minutes,a.early_out_minutes,a.is_missing_punch,a.approval_status,a.work_site_id,a.employee_id,
     e.employee_code,e.full_name_en,dated.company_id AS owner_company_id,dated.branch_id,
     CASE WHEN ROW(dated.company_id,dated.branch_id) IS NOT DISTINCT FROM ROW(e.owner_company_id,e.branch_id) THEN e.department_id END AS department_id
   FROM public.employee_attendance_daily_summary a
   JOIN public.employees e ON e.id=a.employee_id AND e.deleted_at IS NULL
   CROSS JOIN LATERAL erp_private.t19_workforce_dated_scope(e.id,daterange(a.attendance_date,a.attendance_date,'[]'),
     e.owner_company_id,e.branch_id) dated
   WHERE a.employee_id=ANY(p_employees)
     AND a.attendance_date<=least(p_as_of,p_to) AND (p_from IS NULL OR a.attendance_date>=p_from)
     AND (p_site IS NULL OR a.work_site_id=p_site) AND (p_status IS NULL OR a.attendance_type=p_status)
     AND (p_owner IS NULL OR dated.company_id=p_owner) AND (p_branch IS NULL OR dated.branch_id=p_branch)
     AND (ROW(dated.company_id,dated.branch_id) IS NOT DISTINCT FROM ROW(e.owner_company_id,e.branch_id)
       OR erp_private.t19_report_scope_key(dated.company_id,dated.branch_id)=ANY(p_historical))
   ORDER BY a.attendance_date DESC,a.id DESC LIMIT p_limit+1
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'employee_code',a.employee_code,'employee_name',a.full_name_en,'owner_company_id',a.owner_company_id,'branch_id',a.branch_id,
   'company',c.legal_name_en,'department',d.department_name_en,'attendance_date',a.attendance_date,'attendance_type',a.attendance_type,
   'first_in_at',a.first_in_at,'last_out_at',a.last_out_at,'total_hours',a.total_hours,'worked_minutes',a.worked_minutes,
   'late_minutes',a.late_minutes,'early_out_minutes',a.early_out_minutes,'is_missing_punch',a.is_missing_punch,
   'approval_status',a.approval_status,'work_site',site.site_name,'as_of_date',p_as_of,
   'shift_name',CASE WHEN work.count=1 THEN work.name END,
   'shift_context',CASE WHEN work.count>1 THEN 'Conflicting assignments'
                      WHEN work.count=1 AND work.name IS NOT NULL THEN 'Dated assignment' ELSE 'Unknown' END)
   ORDER BY a.attendance_date DESC,a.id DESC),'[]') INTO output
 FROM selected a
 JOIN public.owner_companies c ON c.id=a.owner_company_id
 LEFT JOIN public.departments d ON d.id=a.department_id
 LEFT JOIN public.work_sites site ON site.id=a.work_site_id
 LEFT JOIN LATERAL (
   SELECT count(*) AS count,max(s.shift_name) AS name FROM public.employee_shift_assignments x
   LEFT JOIN public.work_shifts s ON s.id=x.work_shift_id AND s.deleted_at IS NULL
   WHERE x.employee_id=a.employee_id AND x.deleted_at IS NULL AND x.effective_from<=a.attendance_date
     AND (x.effective_to IS NULL OR x.effective_to>=a.attendance_date)
 ) work ON true;
 IF jsonb_array_length(output)>p_limit THEN
   RAISE EXCEPTION 'The report exceeds its verified row limit. Narrow the filters.' USING ERRCODE='54000';
 END IF;
 RETURN output;
END $$;
-- Add the canonical sources to the existing optimistic collection fence.
DO $fence$
DECLARE relation regclass; source_name text;
BEGIN
 FOREACH relation IN ARRAY ARRAY[
   'erp_private.t03_employment_periods'::regclass,'erp_private.t04_policies'::regclass,'erp_private.t04_periods'::regclass,
   'erp_private.t04_cases'::regclass,'erp_private.t04_days'::regclass,'erp_private.t04_case_events'::regclass,
   'erp_private.f12_leave_movements'::regclass,'public.employee_shift_assignments'::regclass,'public.work_shifts'::regclass
 ] LOOP
   SELECT relname INTO STRICT source_name FROM pg_class WHERE oid=relation;
   INSERT INTO erp_private.report_source_generations(relation_name,shard)
    SELECT source_name,g FROM generate_series(0,63) g;
   EXECUTE format('CREATE TRIGGER t19_report_source_change AFTER INSERT OR UPDATE OR DELETE OR TRUNCATE ON %s
     FOR EACH STATEMENT EXECUTE FUNCTION erp_private.advance_report_source_generation()',relation);
 END LOOP;
END $fence$;

REVOKE ALL ON FUNCTION public.t19_workforce_attendance_report(bigint[],date,date,date,bigint,text,integer,bigint,bigint,text[])
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t19_workforce_attendance_report(bigint[],date,date,date,bigint,text,integer,bigint,bigint,text[]) TO service_role;
REVOKE ALL ON FUNCTION public.t19_workforce_grants(bigint),erp_private.t19_report_scope_key(bigint,bigint),
 erp_private.t19_workforce_dated_scope(bigint,daterange,bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t19_workforce_grants(bigint) TO service_role;
REVOKE ALL ON FUNCTION erp_private.t19_verified_leave_balance(bigint,bigint,bigint,date),
 public.t19_workforce_leave_report(text,bigint[],date,date,date,text,integer,bigint,bigint,text[]) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t19_workforce_leave_report(text,bigint[],date,date,date,text,integer,bigint,bigint,text[]) TO service_role;
NOTIFY pgrst,'reload schema';
COMMIT;
