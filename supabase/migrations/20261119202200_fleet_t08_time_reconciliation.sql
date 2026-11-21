BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=public,extensions,pg_catalog;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('fleet.time.enter','Record actual Fleet work intervals','fleet','manage','held'),
 ('fleet.time.verify','Verify Fleet time for the receiving branch','fleet','approve','held'),
 ('fleet.time.host','Prepare or accept a temporary Fleet time host','fleet','manage','held'),
 ('hr.payroll.fleet_time.review','Review Fleet overtime valuation for payroll','hr','review','held');

CREATE TABLE erp_private.t08_time_hosts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 assignment_id bigint NOT NULL REFERENCES erp_private.fleet_operation_assignments(id),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 site_id bigint NOT NULL REFERENCES public.work_sites(id),
 work_period tstzrange NOT NULL CHECK(NOT isempty(work_period) AND NOT lower_inf(work_period) AND NOT upper_inf(work_period)),
 proposed_by bigint NOT NULL REFERENCES public.user_profiles(id),
 approved_by bigint REFERENCES public.user_profiles(id),
 approved_at timestamptz,
 reason text NOT NULL,
 acceptance_reason text,
 CHECK((approved_at IS NULL)=(approved_by IS NULL) AND approved_by IS DISTINCT FROM proposed_by),
 EXCLUDE USING gist(assignment_id WITH =,work_period WITH &&) WHERE(approved_at IS NOT NULL)
);
CREATE INDEX t08_time_hosts_scope ON erp_private.t08_time_hosts(company_id,branch_id,assignment_id);

CREATE TABLE erp_private.t08_fleet_work (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id bigint NOT NULL REFERENCES erp_private.fleet_operation_orders(id),
 assignment_id bigint NOT NULL REFERENCES erp_private.fleet_operation_assignments(id),
 commitment_id bigint NOT NULL REFERENCES erp_private.fleet_commitments(id),
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 employment_id bigint NOT NULL REFERENCES erp_private.t03_employment_periods(id),
 employer_company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 employer_branch_id bigint NOT NULL REFERENCES public.branches(id),
 host_company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 host_branch_id bigint NOT NULL REFERENCES public.branches(id),
 host_id bigint REFERENCES erp_private.t08_time_hosts(id),
 site_id bigint NOT NULL REFERENCES public.work_sites(id),
 day date NOT NULL,
 work_period tstzrange NOT NULL,
 overnight boolean NOT NULL,
 activity text NOT NULL CHECK(activity IN('customer-rental','internal')),
 entered_by bigint NOT NULL REFERENCES public.user_profiles(id),
 entered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 CHECK(NOT isempty(work_period) AND NOT lower_inf(work_period) AND NOT upper_inf(work_period)),
 EXCLUDE USING gist(employee_id WITH =,work_period WITH &&)
);
CREATE INDEX t08_fleet_work_order ON erp_private.t08_fleet_work(order_id,id DESC);
CREATE INDEX t08_fleet_work_day ON erp_private.t08_fleet_work(day,employer_company_id,employer_branch_id,employee_id);

CREATE TABLE erp_private.t08_time_reviews (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 work_id bigint NOT NULL REFERENCES erp_private.t08_fleet_work(id),
 matched tstzmultirange NOT NULL,
 sources jsonb NOT NULL,
 reviewed_by bigint NOT NULL REFERENCES public.user_profiles(id),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL
);
CREATE INDEX t08_time_reviews_latest ON erp_private.t08_time_reviews(work_id,id DESC);

CREATE TABLE erp_private.t08_attendance_links (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 work_id bigint NOT NULL REFERENCES erp_private.t08_fleet_work(id),
 decision_id uuid NOT NULL,
 attendance_id bigint NOT NULL REFERENCES public.employee_attendance_daily_summary(id),
 attendance_digest text NOT NULL,
 reviewed_by bigint NOT NULL REFERENCES public.user_profiles(id),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 accepted tstzmultirange NOT NULL,
 reason text NOT NULL
);
CREATE INDEX t08_attendance_links_current ON erp_private.t08_attendance_links(work_id,id DESC);
CREATE INDEX t08_attendance_links_decision ON erp_private.t08_attendance_links(work_id,decision_id);

-- The scoped original and all observed worksheet intervals travel together.
CREATE FUNCTION erp_private.t08_sheet_sources(p_work bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' SET timezone='UTC' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('usage',u.id,'evidence',u.evidence_id,'document',e.document_id,
   'version',e.version_id,'file',e.file_id,'state',u.state,'span',(u.work_period*w.work_period)::text,
   'current',erp_private.t07_evidence_is_current(u.evidence_id)) ORDER BY u.id),'[]')
 FROM erp_private.t08_fleet_work w JOIN erp_private.t07_effective_rental_usage u
  ON u.assignment_id=w.assignment_id AND u.work_period&&w.work_period
 JOIN erp_private.fleet_operation_evidence e ON e.id=u.evidence_id WHERE w.id=p_work;
$$;

CREATE FUNCTION public.t08_fleet_time(p_operation uuid,p_order bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o erp_private.fleet_operation_orders; a erp_private.fleet_operation_assignments; c erp_private.fleet_commitments;
 w erp_private.t08_fleet_work; h erp_private.t08_time_hosts; previous erp_private.t08_time_reviews;
 actor bigint:=public.current_user_profile_id(); request_hash text; receipt jsonb; why text; cap text;
 host_company bigint; host_branch bigint; site bigint; begins timestamptz; ends timestamptz; part record;
 sources jsonb; accepted tstzmultirange; row_id bigint; created bigint[]:='{}';
BEGIN
 IF NOT coalesce(p_action IN('record','verify','propose-host','accept-host'),false)
   OR NOT erp_private.t05_fields(p_data,ARRAY['assignment','from','until','work','reason','company','branch','site','host','source_digest','review'])
 THEN RAISE EXCEPTION 'Invalid Fleet time action' USING ERRCODE='22023'; END IF;
 why:=erp_private.t07_text(p_data,'reason',500);
 SELECT * INTO o FROM erp_private.fleet_operation_orders WHERE id=p_order FOR UPDATE;
 IF o.id IS NULL OR o.status IN('requested','cancelled') THEN RAISE EXCEPTION 'Fleet time is unavailable' USING ERRCODE='42501'; END IF;
 IF p_action='verify' THEN
   SELECT * INTO w FROM erp_private.t08_fleet_work item WHERE item.id=(p_data->>'work')::bigint AND item.order_id=o.id FOR UPDATE;
   IF w.id IS NULL THEN RAISE EXCEPTION 'Fleet work is unavailable' USING ERRCODE='42501'; END IF;
   host_company:=w.host_company_id; host_branch:=w.host_branch_id; cap:='fleet.time.verify';
 ELSIF p_action='accept-host' THEN
   SELECT ext.* INTO h FROM erp_private.t08_time_hosts ext JOIN erp_private.fleet_operation_assignments fa ON fa.id=ext.assignment_id
     WHERE ext.id=(p_data->>'host')::bigint AND fa.order_id=o.id FOR UPDATE OF ext;
   host_company:=h.company_id; host_branch:=h.branch_id; cap:='fleet.time.host';
 ELSE
   SELECT * INTO a FROM erp_private.fleet_operation_assignments item WHERE item.id=(p_data->>'assignment')::bigint AND item.order_id=o.id;
   IF a.id IS NULL THEN RAISE EXCEPTION 'Fleet assignment is unavailable' USING ERRCODE='42501'; END IF;
   host_company:=o.company_id; host_branch:=o.branch_id;
   cap:=CASE WHEN p_action='record' THEN 'fleet.time.enter' ELSE 'fleet.time.host' END;
   IF p_action='record' AND p_data->>'host' IS NOT NULL THEN
     SELECT * INTO h FROM erp_private.t08_time_hosts ext WHERE ext.id=(p_data->>'host')::bigint AND ext.assignment_id=a.id AND ext.approved_at IS NOT NULL;
     IF h.id IS NULL THEN RAISE EXCEPTION 'Approved receiving branch is unavailable' USING ERRCODE='42501'; END IF;
     host_company:=h.company_id; host_branch:=h.branch_id;
   END IF;
 END IF;
 IF host_branch IS NULL OR NOT erp_private.t02_has_scope(cap,host_company,host_branch)
 THEN RAISE EXCEPTION 'Fleet time is outside your current assignment' USING ERRCODE='42501'; END IF;
 request_hash:=erp_private.t02_digest(jsonb_build_array(p_order,p_action,p_data));
 receipt:=erp_private.t02_replay('fleet-time',p_operation,request_hash);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;
 IF p_action='accept-host' THEN
   SELECT * INTO a FROM erp_private.fleet_operation_assignments WHERE id=h.assignment_id;
   IF h.proposed_by=actor OR h.approved_at IS NOT NULL OR a.state='cancelled'
      OR NOT erp_private.t06_site_allowed(h.site_id,h.company_id,h.branch_id,(lower(h.work_period) AT TIME ZONE 'Asia/Dubai')::date,
            ((upper(h.work_period)-interval '1 microsecond') AT TIME ZONE 'Asia/Dubai')::date)
      OR EXISTS(SELECT 1 FROM erp_private.t08_fleet_work x WHERE x.assignment_id=a.id AND x.work_period&&h.work_period)
   THEN RAISE EXCEPTION 'The receiving assignment changed or needs an independent approver' USING ERRCODE='PT409'; END IF;
   UPDATE erp_private.t08_time_hosts SET approved_by=actor,approved_at=clock_timestamp(),acceptance_reason=why WHERE id=h.id;
   row_id:=h.id;
 ELSIF p_action='verify' THEN
   IF w.entered_by=actor THEN RAISE EXCEPTION 'The entrant cannot verify the same Fleet time' USING ERRCODE='42501'; END IF;
   SELECT * INTO previous FROM erp_private.t08_time_reviews r WHERE r.work_id=w.id ORDER BY r.id DESC LIMIT 1;
   IF previous.id IS DISTINCT FROM (p_data->>'review')::bigint
   THEN RAISE EXCEPTION 'Review the latest verification' USING ERRCODE='PT409'; END IF;
   IF w.activity='internal' THEN
     sources:='[]'; accepted:=tstzmultirange(w.work_period);
   ELSE
     sources:=erp_private.t08_sheet_sources(w.id);
     IF erp_private.t02_digest(sources) IS DISTINCT FROM p_data->>'source_digest'
       OR (sources='[]' AND previous.id IS NULL)
     THEN RAISE EXCEPTION 'The signed sheet changed or has not been filed' USING ERRCODE='PT409'; END IF;
     -- Lock current DMS subjects before trusting the version the supervisor saw.
     PERFORM d.id FROM public.dms_documents d JOIN (SELECT DISTINCT (s->>'document')::bigint AS id FROM jsonb_array_elements(sources) s) evidence ON evidence.id=d.id
      ORDER BY d.id FOR SHARE OF d;
     PERFORM f.id FROM public.dms_document_files f JOIN (SELECT DISTINCT (s->>'file')::bigint AS id FROM jsonb_array_elements(sources) s) evidence ON evidence.id=f.id
      ORDER BY f.id FOR SHARE OF f;
     IF erp_private.t08_sheet_sources(w.id) IS DISTINCT FROM sources THEN RAISE EXCEPTION 'The signed source changed' USING ERRCODE='PT409'; END IF;
     IF EXISTS(SELECT 1 FROM jsonb_array_elements(sources) s WHERE NOT erp_private.document_permission((s->>'document')::bigint,'dms.documents.preview'))
     THEN RAISE EXCEPTION 'Signed sheet preview authority is required' USING ERRCODE='42501'; END IF;
     SELECT coalesce(range_agg((s->>'span')::tstzrange),'{}') INTO accepted FROM jsonb_array_elements(sources) s
      WHERE s->>'state'='signed' AND (s->>'current')::boolean;
   END IF;
   IF previous.id IS NOT NULL AND ROW(previous.matched,previous.sources) IS NOT DISTINCT FROM ROW(accepted,sources)
   THEN RAISE EXCEPTION 'The current verification already covers this evidence' USING ERRCODE='PT409'; END IF;
   INSERT INTO erp_private.t08_time_reviews(work_id,matched,sources,reviewed_by,reason)
     VALUES(w.id,accepted,sources,actor,why) RETURNING id INTO row_id;
 ELSE
   begins:=(p_data->>'from')::timestamptz; ends:=(p_data->>'until')::timestamptz;
   IF begins IS NULL OR ends IS NULL OR NOT isfinite(begins) OR NOT isfinite(ends)
      OR begins>=ends OR date_trunc('minute',begins)<>begins OR date_trunc('minute',ends)<>ends
     THEN RAISE EXCEPTION 'Enter a valid work window to the minute' USING ERRCODE='22023'; END IF;
   IF p_action='propose-host' THEN
     host_company:=(p_data->>'company')::bigint; host_branch:=(p_data->>'branch')::bigint; site:=(p_data->>'site')::bigint;
     IF host_company IS NULL OR host_company=o.company_id OR NOT (a.planned_period @> tstzrange(begins,ends,'[)'))
       OR NOT erp_private.t06_site_allowed(site,host_company,host_branch,(begins AT TIME ZONE 'Asia/Dubai')::date,
             ((ends-interval '1 microsecond') AT TIME ZONE 'Asia/Dubai')::date)
       OR EXISTS(SELECT 1 FROM erp_private.t08_fleet_work x WHERE x.assignment_id=a.id AND x.work_period&&tstzrange(begins,ends,'[)'))
     THEN RAISE EXCEPTION 'Choose a receiving company, site and unused time in the named assignment' USING ERRCODE='PT409'; END IF;
     INSERT INTO erp_private.t08_time_hosts(assignment_id,company_id,branch_id,site_id,work_period,proposed_by,reason)
       VALUES(a.id,host_company,host_branch,site,tstzrange(begins,ends,'[)'),actor,why) RETURNING id INTO row_id;
   ELSE
     SELECT * INTO c FROM erp_private.fleet_commitments item WHERE item.id=a.actual_commitment_id FOR SHARE;
     IF c.id IS NULL OR c.employee_id<>a.worker_id OR c.employment_period_id<>a.employment_id
       OR ends>statement_timestamp() OR ends-begins>interval '24 hours' OR NOT (c.committed_during @> tstzrange(begins,ends,'[)'))
       OR (h.id IS NOT NULL AND NOT (h.work_period @> tstzrange(begins,ends,'[)')))
       OR (h.id IS NULL AND EXISTS(SELECT 1 FROM erp_private.t08_time_hosts receiver
          WHERE receiver.assignment_id=a.id AND receiver.approved_at IS NOT NULL AND receiver.work_period&&tstzrange(begins,ends,'[)')))
       OR NOT EXISTS(SELECT 1 FROM erp_private.t03_employment_periods p WHERE p.id=a.employment_id AND p.employee_id=a.worker_id
          AND p.work_period @> (begins AT TIME ZONE 'Asia/Dubai')::date
          AND p.work_period @> ((ends-interval '1 microsecond') AT TIME ZONE 'Asia/Dubai')::date)
     THEN RAISE EXCEPTION 'Actual work must fit the recorded handover, employment and receiving scope' USING ERRCODE='PT409'; END IF;
     FOR part IN SELECT d::date AS day,
         tstzrange(greatest(d AT TIME ZONE 'Asia/Dubai',begins),least((d+interval '1 day') AT TIME ZONE 'Asia/Dubai',ends),'[)') AS span
       FROM generate_series(date_trunc('day',begins AT TIME ZONE 'Asia/Dubai'),
            date_trunc('day',(ends-interval '1 microsecond') AT TIME ZONE 'Asia/Dubai'),interval '1 day') d
     LOOP
       PERFORM pg_advisory_xact_lock(hashtextextended('f12-attendance:'||a.worker_id||':'||part.day,0));
       INSERT INTO erp_private.t08_fleet_work(order_id,assignment_id,commitment_id,employee_id,employment_id,employer_company_id,
         employer_branch_id,host_company_id,host_branch_id,host_id,site_id,day,work_period,overnight,activity,entered_by,reason)
       VALUES(o.id,a.id,c.id,a.worker_id,a.employment_id,a.employer_company_id,a.employer_branch_id,host_company,host_branch,h.id,
         coalesce(h.site_id,a.site_id),part.day,part.span,
         (begins AT TIME ZONE 'Asia/Dubai')::date<>((ends-interval '1 microsecond') AT TIME ZONE 'Asia/Dubai')::date,
         CASE WHEN o.kind='rental' THEN 'customer-rental' ELSE 'internal' END,actor,why) RETURNING id INTO row_id;
       created:=array_append(created,row_id);
     END LOOP;
   END IF;
 END IF;
 RETURN erp_private.t02_save_receipt('fleet-time',p_operation,request_hash,
    jsonb_build_object('id',row_id,'work_ids',to_jsonb(created),'action',p_action));
EXCEPTION WHEN exclusion_violation THEN
 RAISE EXCEPTION 'This interval overlaps recorded work or an accepted receiving assignment' USING ERRCODE='PT409';
END;
$$;

-- Normalize attendance entries to paid-time facts with breaks removed. Legacy
-- hours without actual times are never expanded into fictional intervals.
CREATE FUNCTION erp_private.t08_attended(p_entries jsonb)
RETURNS tstzmultirange LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT coalesce(range_agg(real_span),'{}') FROM (
   SELECT unnest(tstzmultirange(tstzrange((i->>'start')::timestamptz,(i->>'end')::timestamptz,'[)'))-
      coalesce((SELECT range_agg(tstzrange((b->>'start')::timestamptz,(b->>'end')::timestamptz,'[)'))
                FROM jsonb_array_elements(i->'breaks') b),'{}')) AS real_span
   FROM jsonb_array_elements(coalesce(p_entries,'[]')) i
 ) parts;
$$;

CREATE FUNCTION erp_private.t08_attendance_digest(p_row public.employee_attendance_daily_summary)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_private.t02_digest(jsonb_build_array(p_row.id,p_row.employee_id,p_row.attendance_date,p_row.work_site_id,
   p_row.attendance_type,p_row.entered_intervals,p_row.worked_minutes));
$$;

CREATE FUNCTION erp_private.t08_previous_attendance(p_employee bigint,p_day date)
RETURNS public.employee_attendance_daily_summary LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT prior.* FROM public.employee_attendance_daily_summary prior WHERE prior.employee_id=p_employee AND prior.attendance_date=p_day-1
   AND EXISTS(SELECT 1 FROM erp_private.t08_fleet_work w WHERE w.employee_id=p_employee AND w.day=p_day
        AND EXISTS(SELECT 1 FROM erp_private.t03_employment_periods p WHERE p.id=w.employment_id AND p.work_period @> prior.attendance_date)
        AND erp_private.t08_attended(prior.entered_intervals)&&tstzmultirange(w.work_period));
$$;

-- Current HR uses F12's normal opening. Prior-employer HR can link existing
-- facts for their own dated employment, but cannot open or edit today's record.
CREATE FUNCTION erp_private.t08_attendance_context(p_employee bigint,p_day date)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE s public.employee_attendance_daily_summary; is_leave boolean;
BEGIN
 IF erp_private.f11_child_authorized('attendance-summary',p_employee)
 THEN RETURN erp_private.f12_attendance_context(p_employee,p_day); END IF;
 SELECT * INTO s FROM public.employee_attendance_daily_summary WHERE employee_id=p_employee AND attendance_date=p_day;
 SELECT EXISTS(SELECT 1 FROM public.employee_leave_requests WHERE employee_id=p_employee
   AND deleted_at IS NULL AND approval_status='approved' AND p_day BETWEEN start_date AND end_date) INTO is_leave;
 RETURN jsonb_build_object('id',s.id,'approval_status',s.approval_status,'eligible',false,'approved_leave',is_leave,
   'entered',CASE WHEN s.entered_intervals IS NOT NULL THEN jsonb_build_object('intervals',s.entered_intervals) END,
   'fingerprint',erp_private.t02_digest(jsonb_build_array(s.id,s.workspace_revision,s.approval_status,is_leave)));
END;
$$;

CREATE FUNCTION erp_private.t08_day_token(p_employee bigint,p_day date,p_context jsonb)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_private.t02_digest(jsonb_build_array(p_context->>'fingerprint',erp_private.t08_previous_attendance(p_employee,p_day),
  coalesce((SELECT jsonb_agg(jsonb_build_array(w.id,last_link.id) ORDER BY w.id) FROM erp_private.t08_fleet_work w
    LEFT JOIN LATERAL(SELECT l.id FROM erp_private.t08_attendance_links l WHERE l.work_id=w.id ORDER BY l.id DESC LIMIT 1) last_link ON true
    WHERE w.employee_id=p_employee AND w.day=p_day),'[]')));
$$;

CREATE FUNCTION public.t08_review_attendance(p_operation uuid,p_employee bigint,p_day date,p_mode text,p_token text,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE ep erp_private.t03_employment_periods; summary public.employee_attendance_daily_summary; prior public.employee_attendance_daily_summary;
 ctx jsonb; accepted tstzmultirange; older tstzmultirange; selected jsonb; previous jsonb;
 decision uuid:=gen_random_uuid();
 request_hash text; receipt jsonb; intervals jsonb; facts jsonb; site bigint; source record;
 actor bigint:=public.current_user_profile_id();
BEGIN
 IF NOT coalesce(p_mode IN ('create-draft','link-existing'),false) OR p_day IS NULL OR NOT isfinite(p_day)
   OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 1 AND 500
 THEN RAISE EXCEPTION 'Choose a valid attendance review and reason' USING ERRCODE='22023'; END IF;
 -- Use F12's geographic and employee/day transaction boundary.
 PERFORM pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 PERFORM pg_advisory_xact_lock(hashtextextended('f12-attendance:'||p_employee||':'||(p_day-1),0));
 PERFORM pg_advisory_xact_lock(hashtextextended('f12-attendance:'||p_employee||':'||p_day,0));
 SELECT * INTO ep FROM erp_private.t03_employment_periods p WHERE p.employee_id=p_employee AND p.work_period @> p_day FOR SHARE;
 IF ep.branch_id IS NULL OR NOT erp_private.t02_has_scope('hr.attendance.manage',ep.company_id,ep.branch_id)
   OR NOT erp_private.t02_has_scope('hr.attendance.view',ep.company_id,ep.branch_id)
   OR (p_mode='create-draft' AND NOT erp_private.f11_child_authorized('attendance-summary',p_employee))
 THEN RAISE EXCEPTION 'Attendance review is outside your current scope' USING ERRCODE='42501'; END IF;
 request_hash:=erp_private.t02_digest(jsonb_build_array(p_employee,p_day,p_mode,p_token,p_reason));
 receipt:=erp_private.t02_replay('fleet-attendance',p_operation,request_hash);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;
 ctx:=erp_private.t08_attendance_context(p_employee,p_day);
 IF erp_private.t08_day_token(p_employee,p_day,ctx) IS DISTINCT FROM p_token
 THEN RAISE EXCEPTION 'Review the current Fleet and attendance intervals' USING ERRCODE='PT409'; END IF;
 IF (ctx->>'approved_leave')::boolean OR NOT EXISTS(SELECT 1 FROM erp_private.t08_fleet_work w WHERE w.employee_id=p_employee AND w.day=p_day AND w.employment_id=ep.id)
 THEN RAISE EXCEPTION 'Work requires an eligible day with Fleet facts' USING ERRCODE='PT409'; END IF;
 IF EXISTS(SELECT 1 FROM erp_private.t08_fleet_work w WHERE w.employee_id=p_employee AND w.day=p_day AND w.entered_by=actor)
 THEN RAISE EXCEPTION 'The Fleet entrant cannot review their own attendance draft' USING ERRCODE='42501'; END IF;
 SELECT * INTO prior FROM erp_private.t08_previous_attendance(p_employee,p_day);
 IF prior.id IS NOT NULL THEN
   PERFORM 1 FROM public.employee_attendance_daily_summary WHERE id=prior.id FOR SHARE;
   IF erp_private.t08_day_token(p_employee,p_day,ctx) IS DISTINCT FROM p_token
   THEN RAISE EXCEPTION 'Overnight attendance changed during review' USING ERRCODE='PT409'; END IF;
 END IF;
 IF p_mode='create-draft' THEN
   IF ctx->>'id' IS NOT NULL OR prior.id IS NOT NULL THEN RAISE EXCEPTION 'Review the existing or overnight attendance before linking Fleet' USING ERRCODE='PT409'; END IF;
   SELECT jsonb_agg(jsonb_build_object('start',to_char(lower(w.work_period) AT TIME ZONE 'Asia/Dubai','YYYY-MM-DD"T"HH24:MI:00')||'+04:00',
      'end',to_char(upper(w.work_period) AT TIME ZONE 'Asia/Dubai','YYYY-MM-DD"T"HH24:MI:00')||'+04:00','breaks','[]'::jsonb)
      ORDER BY lower(w.work_period)),CASE WHEN count(DISTINCT w.site_id)=1 AND bool_and(w.host_company_id=w.employer_company_id)
        THEN min(w.site_id) END INTO intervals,site
    FROM erp_private.t08_fleet_work w WHERE w.employee_id=p_employee AND w.day=p_day AND w.employment_id=ep.id;
   IF site IS NULL THEN RAISE EXCEPTION 'Multiple or receiving-company sites need an explicit F12 attendance entry before linking' USING ERRCODE='PT409'; END IF;
   facts:=public.f12_save_attendance(jsonb_build_object('operation',p_operation,'employeeId',p_employee,'date',p_day,'id',NULL,
      'revision',NULL,'fingerprint',ctx->>'fingerprint','reason',p_reason,'values',
      jsonb_build_object('attendance_type','site','intervals',intervals,'work_site_id',site)));
   IF facts->>'id' IS NULL THEN RAISE EXCEPTION 'F12 attendance draft was not saved' USING ERRCODE='PT409'; END IF;
 ELSE
   IF ctx->>'id' IS NULL AND prior.id IS NULL THEN RAISE EXCEPTION 'No existing attendance to compare' USING ERRCODE='PT409'; END IF;
   facts:=jsonb_build_object('id',coalesce((ctx->>'id')::bigint,prior.id));
 END IF;
 SELECT * INTO summary FROM public.employee_attendance_daily_summary WHERE id=(facts->>'id')::bigint FOR SHARE;
 IF summary.entered_intervals IS NULL THEN RAISE EXCEPTION 'Legacy attendance needs exact actual times before linking' USING ERRCODE='PT409'; END IF;
 FOR source IN SELECT w.id,w.work_period FROM erp_private.t08_fleet_work w WHERE w.employee_id=p_employee AND w.day=p_day AND w.employment_id=ep.id LOOP
   accepted:=tstzmultirange(source.work_period)*erp_private.t08_attended(summary.entered_intervals);
   selected:=jsonb_build_array(jsonb_build_object('attendance',summary.id,'digest',erp_private.t08_attendance_digest(summary),'part',accepted::text));
   IF prior.id IS NOT NULL AND prior.id<>summary.id THEN
     older:=tstzmultirange(source.work_period)*erp_private.t08_attended(prior.entered_intervals);
     selected:=jsonb_build_array(
       jsonb_build_object('attendance',prior.id,'digest',erp_private.t08_attendance_digest(prior),'part',(older-accepted)::text),
       jsonb_build_object('attendance',summary.id,'digest',erp_private.t08_attendance_digest(summary),'part',(accepted-older)::text));
   END IF;
   SELECT jsonb_agg(jsonb_build_object('attendance',l.attendance_id,'digest',l.attendance_digest,'part',l.accepted::text) ORDER BY l.id)
    INTO previous FROM erp_private.t08_attendance_links l WHERE l.work_id=source.id AND l.decision_id=(
      SELECT d.decision_id FROM erp_private.t08_attendance_links d WHERE d.work_id=source.id ORDER BY d.id DESC LIMIT 1);
   IF previous IS DISTINCT FROM selected THEN
     INSERT INTO erp_private.t08_attendance_links(work_id,decision_id,attendance_id,attendance_digest,reviewed_by,accepted,reason)
       SELECT source.id,decision,(s->>'attendance')::bigint,s->>'digest',actor,(s->>'part')::tstzmultirange,p_reason
        FROM jsonb_array_elements(selected) s;
   END IF;
 END LOOP;
 RETURN erp_private.t02_save_receipt('fleet-attendance',p_operation,request_hash,jsonb_build_object('id',summary.id,'action',p_mode));
END;
$$;

DO $$
DECLARE relation regclass;
BEGIN
 FOREACH relation IN ARRAY ARRAY['erp_private.t08_time_hosts'::regclass,'erp_private.t08_fleet_work','erp_private.t08_time_reviews',
   'erp_private.t08_attendance_links'] LOOP
   EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',relation);
   EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,anon,authenticated,service_role',relation);
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.t08_sheet_sources(bigint),erp_private.t08_attended(jsonb),
 erp_private.t08_attendance_digest(public.employee_attendance_daily_summary),erp_private.t08_previous_attendance(bigint,date),erp_private.t08_day_token(bigint,date,jsonb),
 erp_private.t08_attendance_context(bigint,date),
 public.t08_fleet_time(uuid,bigint,text,jsonb),public.t08_review_attendance(uuid,bigint,date,text,text,text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t08_fleet_time(uuid,bigint,text,jsonb),public.t08_review_attendance(uuid,bigint,date,text,text,text) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
