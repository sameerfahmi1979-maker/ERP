BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=public,extensions,pg_catalog;

CREATE TABLE erp_private.t08_calendar_overrides (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 day date NOT NULL CHECK(isfinite(day)),
 category text NOT NULL CHECK(category IN('overtime.standard','overtime.rest_day','overtime.public_holiday','overtime.ramadan','overtime.overnight')),
 regular_minutes integer NOT NULL CHECK(regular_minutes BETWEEN 0 AND 1440),
 reason text NOT NULL,
 prepared_by bigint NOT NULL REFERENCES public.user_profiles(id),
 reviewed_by bigint REFERENCES public.user_profiles(id),
 approved_by bigint REFERENCES public.user_profiles(id),
 approved_at timestamptz,
 CHECK(category NOT IN('overtime.rest_day','overtime.public_holiday') OR regular_minutes=0),
 CHECK(reviewed_by IS DISTINCT FROM prepared_by),
 CHECK(approved_by IS NULL OR (reviewed_by IS NOT NULL AND approved_by<>reviewed_by AND approved_by<>prepared_by))
);
CREATE UNIQUE INDEX t08_one_approved_calendar_day ON erp_private.t08_calendar_overrides(company_id,day) WHERE approved_at IS NOT NULL;

CREATE TABLE erp_private.t08_payable_candidates (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 work_id bigint NOT NULL REFERENCES erp_private.t08_fleet_work(id),
 time_review_id bigint NOT NULL REFERENCES erp_private.t08_time_reviews(id),
 attendance_link_id bigint NOT NULL REFERENCES erp_private.t08_attendance_links(id),
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 rule_id bigint NOT NULL REFERENCES erp_private.t02_work_rule_versions(id),
 eligible tstzmultirange NOT NULL CHECK(NOT isempty(eligible)),
 rate numeric NOT NULL CHECK(rate>0),
 currency text NOT NULL CHECK(currency~'^[A-Z]{3}$'),
 facts jsonb NOT NULL,
 digest text NOT NULL,
 approved_by bigint NOT NULL REFERENCES public.user_profiles(id),
 available_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 UNIQUE(work_id,digest)
);
CREATE INDEX t08_latest_candidate ON erp_private.t08_payable_candidates(work_id,id DESC);

CREATE TABLE erp_private.t08_payable_aliases (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 work_id bigint NOT NULL REFERENCES erp_private.t08_fleet_work(id),
 kind text NOT NULL CHECK(kind IN('fleet','attendance','workshop','legacy-overtime')),
 source_id bigint NOT NULL CHECK(source_id>0),
 source_fingerprint text NOT NULL,
 covered tstzmultirange NOT NULL CHECK(NOT isempty(covered)),
 UNIQUE(kind,source_id,work_id,source_fingerprint)
);
CREATE TABLE erp_private.t08_payable_claims (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 candidate_id bigint NOT NULL REFERENCES erp_private.t08_payable_candidates(id),
 alias_id bigint NOT NULL REFERENCES erp_private.t08_payable_aliases(id),
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 consumer_key uuid NOT NULL UNIQUE,
 claimed tstzmultirange NOT NULL CHECK(NOT isempty(claimed)),
 amount numeric(16,2) NOT NULL CHECK(amount>=0),
 currency text NOT NULL CHECK(currency~'^[A-Z]{3}$'),
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 EXCLUDE USING gist(employee_id WITH =,claimed WITH &&)
);

CREATE FUNCTION public.t08_calendar_day(p_operation uuid,p_company bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id(); item erp_private.t08_calendar_overrides;
 capability text; hash text; receipt jsonb; reason text;
BEGIN
 capability:=CASE p_action WHEN 'prepare' THEN 'integrated.policy.prepare' WHEN 'review' THEN 'integrated.policy.review'
   WHEN 'approve' THEN 'integrated.policy.approve' END;
 IF capability IS NULL OR NOT erp_private.t05_fields(p_data,ARRAY['id','day','category','regular_minutes','reason'])
 THEN RAISE EXCEPTION 'Invalid company calendar decision' USING ERRCODE='22023'; END IF;
 IF NOT erp_private.t02_has_scope(capability,p_company,NULL)
 THEN RAISE EXCEPTION 'Company-wide policy authority is required' USING ERRCODE='42501'; END IF;
 reason:=erp_private.t07_text(p_data,'reason',500);
 hash:=erp_private.t02_digest(jsonb_build_array(p_company,p_action,p_data));
 receipt:=erp_private.t02_replay('fleet-time-calendar',p_operation,hash);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;
 IF p_action='prepare' THEN
   INSERT INTO erp_private.t08_calendar_overrides(company_id,day,category,regular_minutes,reason,prepared_by)
     VALUES(p_company,(p_data->>'day')::date,p_data->>'category',(p_data->>'regular_minutes')::int,reason,actor)
     RETURNING * INTO item;
 ELSE
   SELECT * INTO item FROM erp_private.t08_calendar_overrides WHERE id=(p_data->>'id')::bigint AND company_id=p_company FOR UPDATE;
   IF item.id IS NULL OR item.approved_at IS NOT NULL OR actor=item.prepared_by OR
      (p_action='review' AND item.reviewed_by IS NOT NULL) OR
      (p_action='approve' AND (item.reviewed_by IS NULL OR actor=item.reviewed_by))
   THEN RAISE EXCEPTION 'Independent review of the exact company date is required' USING ERRCODE='PT409'; END IF;
   IF p_action='review' THEN UPDATE erp_private.t08_calendar_overrides SET reviewed_by=actor WHERE id=item.id;
   ELSE UPDATE erp_private.t08_calendar_overrides SET approved_by=actor,approved_at=clock_timestamp() WHERE id=item.id; END IF;
 END IF;
 RETURN erp_private.t02_save_receipt('fleet-time-calendar',p_operation,hash,jsonb_build_object('id',item.id,'action',p_action));
END;
$$;

CREATE FUNCTION erp_private.t08_calendar_basis(p_employee bigint,p_company bigint,p_day date,p_overnight boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE special erp_private.t08_calendar_overrides; shift record; minutes numeric;
 day_name text:=left(lower(to_char(p_day,'FMDay')),3); previous_name text:=left(lower(to_char(p_day-1,'FMDay')),3);
BEGIN
 SELECT * INTO special FROM erp_private.t08_calendar_overrides WHERE company_id=p_company AND day=p_day AND approved_at IS NOT NULL;
 SELECT s.id,s.workspace_revision,c.id AS cid,c.workspace_revision AS crev,a.id AS aid,a.workspace_revision AS arev,
   s.total_hours,s.is_overnight,s.shift_start_time,s.shift_end_time,s.break_start_time,s.break_end_time,c.working_days,c.weekend_days,
   c.has_ramadan_timing,c.has_summer_timing,a.overtime_eligible,left(lower(a.weekly_off_day),3) AS off_day,count(*) OVER() AS matches INTO shift
 FROM public.employee_shift_assignments a JOIN public.work_shifts s ON s.id=a.work_shift_id AND s.calendar_id=a.work_calendar_id
 JOIN public.work_calendars c ON c.id=a.work_calendar_id WHERE a.employee_id=p_employee AND a.deleted_at IS NULL
   AND a.effective_from<=p_day AND (a.effective_to IS NULL OR a.effective_to>=p_day)
   AND s.deleted_at IS NULL AND s.is_active AND c.deleted_at IS NULL AND c.is_active
   AND (c.owner_company_id IS NULL OR c.owner_company_id=p_company)
   AND (c.effective_from IS NULL OR c.effective_from<=p_day) AND (c.effective_to IS NULL OR c.effective_to>=p_day)
 LIMIT 1;
 IF shift.matches IS DISTINCT FROM 1 THEN RETURN NULL; END IF;
 IF NOT shift.overtime_eligible THEN RETURN jsonb_build_object('ineligible',true); END IF;
 IF special.id IS NOT NULL THEN
   RETURN jsonb_build_object('category',special.category,'regular_minutes',special.regular_minutes,'calendar_override',special.id,
      'assignment',shift.aid,'assignment_revision',shift.arev);
 END IF;
 IF shift.has_ramadan_timing OR shift.has_summer_timing THEN RETURN NULL; END IF;
 IF shift.off_day=day_name THEN minutes:=0;
 ELSIF shift.is_overnight THEN
   -- Explicit day overrides resolve shift changes, midnight breaks and seasonal days.
   IF shift.break_start_time IS NOT NULL OR shift.break_end_time IS NOT NULL OR shift.shift_start_time<=shift.shift_end_time
       OR NOT EXISTS(SELECT 1 FROM public.employee_shift_assignments a WHERE a.id=shift.aid AND a.effective_from<p_day)
   THEN RETURN NULL; END IF;
   minutes:=(CASE WHEN day_name=ANY(SELECT left(lower(d),3) FROM unnest(shift.working_days) d)
                   THEN 1440-extract(epoch FROM shift.shift_start_time)/60 ELSE 0 END)+
            (CASE WHEN previous_name IS DISTINCT FROM shift.off_day
                  AND previous_name=ANY(SELECT left(lower(d),3) FROM unnest(shift.working_days) d)
                   THEN extract(epoch FROM shift.shift_end_time)/60 ELSE 0 END);
 ELSIF day_name=ANY(SELECT left(lower(d),3) FROM unnest(shift.working_days) d) THEN
   minutes:=shift.total_hours*60;
 ELSIF day_name=ANY(SELECT left(lower(d),3) FROM unnest(shift.weekend_days) d) THEN minutes:=0;
 ELSE RETURN NULL; END IF;
 IF minutes IS NULL OR minutes NOT BETWEEN 0 AND 1440 OR trunc(minutes)<>minutes THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('category',CASE WHEN minutes=0 THEN 'overtime.rest_day'
    WHEN p_overnight OR shift.is_overnight THEN 'overtime.overnight' ELSE 'overtime.standard' END,
   'regular_minutes',minutes::integer,'shift',shift.id,'shift_revision',shift.workspace_revision,
   'calendar',shift.cid,'calendar_revision',shift.crev,'assignment',shift.aid,'assignment_revision',shift.arev);
END;
$$;

-- Trusted dated wage-basis resolver. A future payroll calculation can reuse this
-- service without granting wage reads to an operations user.
CREATE FUNCTION erp_private.t08_wage_basis(p_employee bigint,p_day date,p_rule bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE profile public.employee_payroll_profiles; rule erp_private.t02_work_rule_versions; revised public.employee_salary_revision_effects;
 row record; sources jsonb:='[]'; ids bigint[]:='{}'; expected bigint[]; total numeric:=0; selected_basic numeric:=0;
 basic boolean; includes_basic boolean:=false;
BEGIN
 SELECT r.* INTO rule FROM erp_private.t02_work_rule_versions r JOIN erp_private.t03_employment_periods employment
   ON employment.employee_id=p_employee AND employment.company_id=r.company_id AND employment.work_period @> p_day
 WHERE r.id=p_rule AND r.phase='approved' AND r.effective_period @> p_day
   AND (r.priority=0 OR (r.priority=1 AND r.employee_group_id=employment.employee_category_id)
        OR (r.priority=2 AND r.employee_id=p_employee));
 IF rule.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO profile FROM public.employee_payroll_profiles WHERE employee_id=p_employee AND deleted_at IS NULL;
 IF profile.id IS NULL OR profile.effective_date>p_day OR profile.currency!~'^[A-Z]{3}$' THEN RETURN NULL; END IF;
 SELECT array_agg(value::bigint) INTO expected FROM jsonb_array_elements_text(rule.facts->'component_type_ids');
 basic:=rule.facts->>'salary_basis'='basic';
 FOR row IN SELECT c.id,c.component_type_id,c.amount,c.workspace_revision,c.is_active,t.component_kind,t.is_basic
   FROM public.employee_salary_components c JOIN public.hr_salary_component_types t ON t.id=c.component_type_id
   WHERE c.employee_id=p_employee AND c.deleted_at IS NULL AND c.effective_from<=p_day AND (c.effective_to IS NULL OR c.effective_to>=p_day)
     AND ((basic AND t.is_basic) OR (NOT basic AND t.id=ANY(expected))) ORDER BY c.id
 LOOP
   IF NOT row.is_active OR row.component_kind<>'earning' OR row.component_type_id=ANY(ids)
     OR row.amount IS NULL OR row.amount<0 OR row.amount::text IN('NaN','Infinity','-Infinity') THEN RETURN NULL; END IF;
   total:=total+row.amount;
   IF row.is_basic THEN includes_basic:=true; selected_basic:=selected_basic+row.amount; END IF;
   ids:=array_append(ids,row.component_type_id);
   sources:=sources||jsonb_build_array(jsonb_build_object('id',row.id,'revision',row.workspace_revision,
     'type',row.component_type_id,'amount',row.amount));
 END LOOP;
 IF basic OR includes_basic THEN
   SELECT * INTO revised FROM public.employee_salary_revision_effects WHERE employee_id=p_employee AND effective_date<=p_day
     ORDER BY effective_date DESC,id DESC LIMIT 1;
   IF revised.id IS NOT NULL THEN
     IF revised.currency<>profile.currency THEN RETURN NULL; END IF;
     total:=total-selected_basic+revised.new_basic;
   END IF;
 END IF;
 IF total<=0 OR (NOT basic AND cardinality(ids) IS DISTINCT FROM cardinality(expected))
 THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('profile',profile.id,'revision',profile.workspace_revision,'components',sources,'currency',profile.currency,'basis',total,
   'salary_effect',revised.id,'effect_digest',revised.source_fingerprint);
END;
$$;

CREATE FUNCTION erp_private.t08_current_match(p_work bigint,p_review bigint)
RETURNS tstzmultirange LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((
    SELECT CASE WHEN w.activity='internal' THEN r.matched ELSE (
      SELECT coalesce(range_agg((pinned->>'span')::tstzrange),'{}')
      FROM jsonb_array_elements(r.sources) pinned
      JOIN jsonb_array_elements(erp_private.t08_sheet_sources(w.id)) current_entry ON current_entry=pinned
      WHERE pinned->>'state'='signed' AND pinned->>'current'='true'
    ) END
    FROM erp_private.t08_fleet_work w JOIN erp_private.t08_time_reviews r ON r.work_id=w.id
    WHERE w.id=p_work AND r.id=p_review
 ),'{}'::tstzmultirange);
$$;

CREATE FUNCTION erp_private.t08_source_basis(p_work bigint)
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
 eligible:=matched*accepted*overtime;
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

CREATE FUNCTION public.t08_payroll_review(p_operation uuid,p_work bigint,p_digest text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE w erp_private.t08_fleet_work; basis jsonb; hash text; receipt jsonb; candidate bigint;
 actor bigint:=public.current_user_profile_id();
BEGIN
 SELECT * INTO w FROM erp_private.t08_fleet_work WHERE id=p_work;
 IF w.id IS NULL OR NOT erp_private.t02_has_scope('hr.payroll.view',w.employer_company_id,w.employer_branch_id)
   OR NOT erp_private.t02_has_scope('hr.payroll.fleet_time.review',w.employer_company_id,w.employer_branch_id)
 THEN RAISE EXCEPTION 'Employing branch payroll authority is required' USING ERRCODE='42501'; END IF;
 IF length(btrim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 500 OR p_digest IS NULL
 THEN RAISE EXCEPTION 'Accept reviewed overtime with a reason' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM erp_private.fleet_operation_orders WHERE id=w.order_id FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('f12-attendance:'||w.employee_id||':'||w.day,0));
 PERFORM 1 FROM public.employees WHERE id=w.employee_id FOR SHARE;
 PERFORM 1 FROM public.employee_attendance_daily_summary WHERE employee_id=w.employee_id AND attendance_date IN(w.day-1,w.day)
    ORDER BY attendance_date FOR SHARE;
 hash:=erp_private.t02_digest(jsonb_build_array(p_work,p_digest,p_reason));
 receipt:=erp_private.t02_replay('fleet-overtime',p_operation,hash);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;
 basis:=erp_private.t08_source_basis(p_work);
 IF basis->>'status'<>'ready' OR erp_private.t02_digest(basis)<>p_digest
 THEN RAISE EXCEPTION 'Review the current evidence and pay basis' USING ERRCODE='PT409'; END IF;
 IF actor=w.entered_by OR EXISTS(SELECT 1 FROM erp_private.t08_time_reviews
      WHERE id=(basis->>'review')::bigint AND reviewed_by=actor)
 THEN RAISE EXCEPTION 'The entrant or Fleet verifier cannot authorize this payroll candidate' USING ERRCODE='42501'; END IF;
 INSERT INTO erp_private.t08_payable_candidates(work_id,time_review_id,attendance_link_id,employee_id,rule_id,eligible,rate,currency,facts,digest,approved_by,reason)
 VALUES(w.id,(basis->>'review')::bigint,(basis->>'attendance_link')::bigint,w.employee_id,(basis->>'rule')::bigint,
  (basis->>'eligible')::tstzmultirange,(basis->>'rate')::numeric,basis#>>'{wage,currency}',basis,p_digest,actor,p_reason)
 ON CONFLICT(work_id,digest) DO NOTHING RETURNING id INTO candidate;
 IF candidate IS NULL THEN SELECT id INTO candidate FROM erp_private.t08_payable_candidates WHERE work_id=w.id AND digest=p_digest; END IF;
 INSERT INTO erp_private.t08_payable_aliases(work_id,kind,source_id,source_fingerprint,covered)
 VALUES(w.id,'fleet',w.id,p_digest,(basis->>'eligible')::tstzmultirange) ON CONFLICT DO NOTHING;
 INSERT INTO erp_private.t08_payable_aliases(work_id,kind,source_id,source_fingerprint,covered)
 SELECT w.id,'attendance',link.attendance_id,link.attendance_digest,link.accepted FROM erp_private.t08_attendance_links link
  WHERE link.id IN(SELECT (ref->>'id')::bigint FROM jsonb_array_elements(basis->'attendance_links') ref)
     AND NOT isempty(link.accepted) ON CONFLICT DO NOTHING;
 RETURN erp_private.t02_save_receipt('fleet-overtime',p_operation,hash,jsonb_build_object('id',candidate,'work',w.id));
END;
$$;

CREATE FUNCTION erp_private.t08_minutes(p_ranges tstzmultirange)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(sum(extract(epoch FROM upper(span)-lower(span))/60),0) FROM unnest(p_ranges) span;
$$;

-- Allocate cents by rounded cumulative duration in the original eligible
-- ranges. Splitting or claiming the same ranges in a different order cannot
-- mint another cent.
CREATE FUNCTION erp_private.t08_range_amount(p_full tstzmultirange,p_subset tstzmultirange,p_rate numeric)
RETURNS numeric LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 WITH ordered AS (
   SELECT span,coalesce(sum(extract(epoch FROM upper(span)-lower(span)))
     OVER (ORDER BY span ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING),0) AS before_seconds
   FROM unnest(p_full) span
 ), pieces AS (
   SELECT ordered.span,ordered.before_seconds,ordered.span*portion AS piece
   FROM ordered CROSS JOIN unnest(p_subset) portion WHERE ordered.span&&portion
 )
 SELECT coalesce(sum(
   round(p_rate*(before_seconds+extract(epoch FROM upper(piece)-lower(span)))/3600,2)-
   round(p_rate*(before_seconds+extract(epoch FROM lower(piece)-lower(span)))/3600,2)
 ),0)::numeric(16,2) FROM pieces;
$$;

-- Trusted consumption contract. A later domain supplies its own authorized
-- source registration and pays through the shared fact. T08 grants no caller.
CREATE FUNCTION erp_private.t08_register_workshop_alias(p_work bigint,p_source bigint,p_employee bigint,p_covered tstzmultirange,p_fingerprint text)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE w erp_private.t08_fleet_work; result bigint;
BEGIN
 SELECT * INTO w FROM erp_private.t08_fleet_work WHERE id=p_work AND employee_id=p_employee;
 IF w.id IS NULL OR NOT coalesce(NOT isempty(p_covered) AND p_covered<@tstzmultirange(w.work_period),false)
     OR p_fingerprint IS NULL OR p_fingerprint!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Alias must identify exact underlying work' USING ERRCODE='22023'; END IF;
 INSERT INTO erp_private.t08_payable_aliases(work_id,kind,source_id,source_fingerprint,covered)
   VALUES(w.id,'workshop',p_source,p_fingerprint,p_covered) ON CONFLICT DO NOTHING RETURNING id INTO result;
 IF result IS NULL THEN
   SELECT id INTO result FROM erp_private.t08_payable_aliases WHERE work_id=w.id AND kind='workshop' AND source_id=p_source
      AND source_fingerprint=p_fingerprint AND covered=p_covered;
   IF result IS NULL THEN RAISE EXCEPTION 'Alias already identifies different work' USING ERRCODE='PT409'; END IF;
 END IF;
 RETURN result;
END;
$$;

CREATE FUNCTION erp_private.t08_claim_work(p_candidate bigint,p_alias bigint,p_consumer uuid,p_span tstzmultirange)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE candidate erp_private.t08_payable_candidates; alias erp_private.t08_payable_aliases;
 receipt erp_private.t08_payable_claims; w erp_private.t08_fleet_work; result bigint;
BEGIN
 SELECT * INTO candidate FROM erp_private.t08_payable_candidates WHERE id=p_candidate;
 SELECT * INTO w FROM erp_private.t08_fleet_work WHERE id=candidate.work_id;
 PERFORM 1 FROM erp_private.fleet_operation_orders WHERE id=w.order_id FOR UPDATE;
 PERFORM pg_advisory_xact_lock(hashtextextended('f12-attendance:'||w.employee_id||':'||w.day,0));
 PERFORM 1 FROM public.employee_attendance_daily_summary WHERE employee_id=w.employee_id AND attendance_date IN(w.day-1,w.day)
    ORDER BY attendance_date FOR SHARE;
 SELECT * INTO alias FROM erp_private.t08_payable_aliases WHERE id=p_alias AND work_id=candidate.work_id;
 IF alias.id IS NULL OR p_consumer IS NULL OR NOT coalesce(NOT isempty(p_span) AND p_span<@candidate.eligible AND p_span<@alias.covered,false)
 THEN RAISE EXCEPTION 'Claim must identify eligible underlying work' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('fleet-time-claim:'||p_consumer,0));
 SELECT * INTO receipt FROM erp_private.t08_payable_claims WHERE consumer_key=p_consumer;
 IF receipt.id IS NOT NULL THEN
   IF ROW(receipt.candidate_id,receipt.alias_id,receipt.claimed) IS DISTINCT FROM ROW(p_candidate,p_alias,p_span)
   THEN RAISE EXCEPTION 'Claim identity changed' USING ERRCODE='PT409'; END IF;
   RETURN receipt.id;
 END IF;
 IF candidate.digest IS DISTINCT FROM erp_private.t02_digest(erp_private.t08_source_basis(candidate.work_id))
 THEN RAISE EXCEPTION 'Source review changed before consumption' USING ERRCODE='PT409'; END IF;
 INSERT INTO erp_private.t08_payable_claims(candidate_id,alias_id,employee_id,consumer_key,claimed,amount,currency)
 VALUES(p_candidate,p_alias,candidate.employee_id,p_consumer,p_span,erp_private.t08_range_amount(candidate.eligible,p_span,candidate.rate),
    candidate.currency) RETURNING id INTO result;
 RETURN result;
END;
$$;

DO $$
DECLARE relation regclass;
BEGIN
 FOREACH relation IN ARRAY ARRAY['erp_private.t08_calendar_overrides'::regclass,'erp_private.t08_payable_candidates',
    'erp_private.t08_payable_aliases','erp_private.t08_payable_claims'] LOOP
   EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',relation);
   EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,anon,authenticated,service_role',relation);
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.t08_calendar_day(uuid,bigint,text,jsonb),public.t08_payroll_review(uuid,bigint,text,text),
 erp_private.t08_calendar_basis(bigint,bigint,date,boolean),erp_private.t08_wage_basis(bigint,date,bigint),
 erp_private.t08_source_basis(bigint),erp_private.t08_current_match(bigint,bigint),erp_private.t08_minutes(tstzmultirange),
 erp_private.t08_range_amount(tstzmultirange,tstzmultirange,numeric),erp_private.t08_register_workshop_alias(bigint,bigint,bigint,tstzmultirange,text),
 erp_private.t08_claim_work(bigint,bigint,uuid,tstzmultirange) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t08_calendar_day(uuid,bigint,text,jsonb),public.t08_payroll_review(uuid,bigint,text,text) TO authenticated;
COMMIT;
