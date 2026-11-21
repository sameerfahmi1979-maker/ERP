BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE FUNCTION erp_private.t08_ops_readable(p_order bigint,p_company bigint,p_branch bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM erp_private.fleet_operation_orders o WHERE o.id=p_order
     AND erp_private.t07_ops_readable(o.company_id,o.branch_id))
   OR erp_private.t05_scope('fleet.time.enter',p_company,p_branch)
   OR erp_private.t05_scope('fleet.time.verify',p_company,p_branch)
   OR erp_private.t05_scope('fleet.time.host',p_company,p_branch);
$$;

CREATE FUNCTION public.t08_fleet_order_time(p_order bigint,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o erp_private.fleet_operation_orders; owner_visible boolean;
BEGIN
 SELECT * INTO o FROM erp_private.fleet_operation_orders WHERE id=p_order;
 IF o.id IS NULL THEN RETURN NULL; END IF;
 owner_visible:=erp_private.t07_ops_readable(o.company_id,o.branch_id);
 IF NOT owner_visible AND NOT erp_private.t08_ops_readable(o.id,o.company_id,o.branch_id)
    AND NOT EXISTS(SELECT 1 FROM erp_private.t08_time_hosts h JOIN erp_private.fleet_operation_assignments a ON a.id=h.assignment_id
      WHERE a.order_id=o.id AND erp_private.t08_ops_readable(o.id,h.company_id,h.branch_id))
 THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('id',o.id,'number',o.order_no,'subject',o.subject,
  'can_propose',erp_private.t05_scope('fleet.time.host',o.company_id,o.branch_id),
  'can_record',erp_private.t05_scope('fleet.time.enter',o.company_id,o.branch_id),
  'assignments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'asset',f.asset_no,'employee',e.full_name_en,
      'from',lower(c.committed_during),'until',upper(c.committed_during)) ORDER BY a.id),'[]')
    FROM erp_private.fleet_operation_assignments a JOIN erp_private.fleet_assets f ON f.id=a.asset_id
    JOIN public.employees e ON e.id=a.worker_id JOIN erp_private.fleet_commitments c ON c.id=a.actual_commitment_id
    WHERE a.order_id=o.id AND (erp_private.t08_ops_readable(o.id,o.company_id,o.branch_id)
      OR EXISTS(SELECT 1 FROM erp_private.t08_time_hosts h WHERE h.assignment_id=a.id AND erp_private.t08_ops_readable(o.id,h.company_id,h.branch_id)))),
  'hosts',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'assignment',h.assignment_id,'company',coalesce(c.trade_name,c.legal_name_en),'branch',b.branch_name_en,
    'from',lower(h.work_period),'until',upper(h.work_period),'accepted',h.approved_at IS NOT NULL,
    'can_accept',h.approved_at IS NULL AND h.proposed_by<>public.current_user_profile_id() AND erp_private.t05_scope('fleet.time.host',h.company_id,h.branch_id),
    'can_record',h.approved_at IS NOT NULL AND erp_private.t05_scope('fleet.time.enter',h.company_id,h.branch_id)) ORDER BY h.id DESC),'[]')
    FROM erp_private.t08_time_hosts h JOIN erp_private.fleet_operation_assignments a ON a.id=h.assignment_id
     JOIN public.owner_companies c ON c.id=h.company_id JOIN public.branches b ON b.id=h.branch_id
     WHERE a.order_id=o.id AND erp_private.t08_ops_readable(o.id,h.company_id,h.branch_id)),
  'work',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',w.id,'assignment',w.assignment_id,'employee',e.full_name_en,'date',w.day,
    'from',lower(w.work_period),'until',upper(w.work_period),'minutes',erp_private.t08_minutes(tstzmultirange(w.work_period)),
    'matched_minutes',erp_private.t08_minutes(erp_private.t08_current_match(w.id,r.id)),
    'activity',w.activity,'host',coalesce(c.trade_name,c.legal_name_en),'review',r.id,
    'can_verify',w.entered_by<>public.current_user_profile_id() AND erp_private.t05_scope('fleet.time.verify',w.host_company_id,w.host_branch_id),
    'source_digest',erp_private.t02_digest(evidence.sources),
    'attendance_linked',EXISTS(SELECT 1 FROM erp_private.t08_attendance_links l WHERE l.work_id=w.id),
    'eligible_minutes',erp_private.t08_minutes((basis.facts->>'eligible')::tstzmultirange),
    'eligibility',CASE WHEN basis.facts->>'status' IN('awaiting-operations','awaiting-attendance','no-eligible-time','ready')
      THEN basis.facts->>'status' ELSE 'needs-payroll-review' END,
    'payroll_reviewed',EXISTS(SELECT 1 FROM erp_private.t08_payable_candidates pc WHERE pc.work_id=w.id
      AND pc.digest=erp_private.t02_digest(basis.facts)),
    'sources',(SELECT coalesce(jsonb_agg(x ORDER BY (x->>'usage')::bigint),'[]') FROM jsonb_array_elements(evidence.sources) x
       WHERE erp_private.document_permission((x->>'document')::bigint,'dms.documents.preview'))) ORDER BY w.id DESC),'[]')
    FROM (SELECT fact.* FROM erp_private.t08_fleet_work fact WHERE fact.order_id=o.id AND (p_before IS NULL OR fact.id<p_before)
      AND erp_private.t08_ops_readable(o.id,fact.host_company_id,fact.host_branch_id) ORDER BY fact.id DESC LIMIT 26) w
    JOIN public.employees e ON e.id=w.employee_id JOIN public.owner_companies c ON c.id=w.host_company_id
    LEFT JOIN LATERAL(SELECT * FROM erp_private.t08_time_reviews rr WHERE rr.work_id=w.id ORDER BY id DESC LIMIT 1) r ON true
    CROSS JOIN LATERAL(SELECT erp_private.t08_sheet_sources(w.id) sources) evidence
    CROSS JOIN LATERAL(SELECT erp_private.t08_source_basis(w.id) facts) basis));
END;
$$;

CREATE FUNCTION public.t08_receiving_orders(p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',item.id,'number',item.order_no,'subject',item.subject,
    'pending',item.pending) ORDER BY item.id DESC),'[]')
 FROM (SELECT o.id,o.order_no,o.subject,bool_or(h.approved_at IS NULL) AS pending
   FROM erp_private.t08_time_hosts h JOIN erp_private.fleet_operation_assignments a ON a.id=h.assignment_id
   JOIN erp_private.fleet_operation_orders o ON o.id=a.order_id
   WHERE (p_before IS NULL OR o.id<p_before) AND o.status<>'cancelled'
    AND (erp_private.t05_scope('fleet.time.host',h.company_id,h.branch_id)
      OR erp_private.t05_scope('fleet.time.enter',h.company_id,h.branch_id)
      OR erp_private.t05_scope('fleet.time.verify',h.company_id,h.branch_id))
   GROUP BY o.id ORDER BY o.id DESC LIMIT 26) item;
$$;

CREATE FUNCTION public.t08_attendance_drafts(p_day date,p_after bigint DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('employee',item.employee_id,'name',e.full_name_en,'code',e.employee_code,
   'attendance',coalesce((ctx->>'id')::bigint,prior.id),'status',coalesce(ctx->>'approval_status',prior.approval_status),'eligible',(ctx->>'eligible')::boolean,
   'leave',(ctx->>'approved_leave')::boolean,'entered',CASE WHEN ctx->>'id' IS NOT NULL THEN ctx->'entered'
      WHEN prior.id IS NOT NULL THEN jsonb_build_object('intervals',prior.entered_intervals) END,
   'token',erp_private.t08_day_token(item.employee_id,p_day,ctx),
   'can_create',item.can_create AND prior.id IS NULL,'works',item.works) ORDER BY item.employee_id),'[]')
 FROM (SELECT w.employee_id,count(DISTINCT w.site_id)=1 AND count(*)<=8 AND bool_and(w.host_company_id=w.employer_company_id) AS can_create,
   jsonb_agg(jsonb_build_object('id',w.id,'from',lower(w.work_period),'until',upper(w.work_period),
     'order',w.order_id,'site',s.site_name,'linked_minutes',coalesce(l.linked_minutes,0),
     'reviewed',l.linked_minutes IS NOT NULL) ORDER BY lower(w.work_period),w.id) AS works
   FROM erp_private.t08_fleet_work w JOIN public.work_sites s ON s.id=w.site_id
   LEFT JOIN LATERAL(SELECT sum(erp_private.t08_minutes(il.accepted)) AS linked_minutes
      FROM erp_private.t08_attendance_links il WHERE il.work_id=w.id AND il.decision_id=(
        SELECT newest.decision_id FROM erp_private.t08_attendance_links newest WHERE newest.work_id=w.id ORDER BY id DESC LIMIT 1)) l ON true
   WHERE w.day=p_day AND w.employee_id>coalesce(p_after,0)
     AND erp_private.t05_scope('hr.attendance.view',w.employer_company_id,w.employer_branch_id)
     AND erp_private.t05_scope('hr.attendance.manage',w.employer_company_id,w.employer_branch_id)
     AND EXISTS(SELECT 1 FROM erp_private.t03_employment_periods p WHERE p.id=w.employment_id AND p.work_period @> p_day)
   GROUP BY w.employee_id ORDER BY w.employee_id LIMIT 26) item
 JOIN public.employees e ON e.id=item.employee_id
 CROSS JOIN LATERAL(SELECT erp_private.t08_attendance_context(item.employee_id,p_day) AS ctx) opening
 LEFT JOIN LATERAL erp_private.t08_previous_attendance(item.employee_id,p_day) prior ON true;
$$;

CREATE FUNCTION public.t08_payroll_queue(p_company bigint,p_day date,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('work',w.id,'employee',w.employee_id,'name',e.full_name_en,'date',w.day,
   'status',CASE WHEN candidate.id IS NOT NULL THEN 'accepted' ELSE basis.facts->>'status' END,
   'digest',CASE WHEN basis.facts->>'status'='ready' THEN erp_private.t02_digest(basis.facts) END,
   'minutes',erp_private.t08_minutes((basis.facts->>'eligible')::tstzmultirange),
   'rate',CASE WHEN basis.facts->>'status'='ready' THEN round((basis.facts->>'rate')::numeric,6)::text END,
   'amount',CASE WHEN basis.facts->>'status'='ready' THEN round((basis.facts->>'rate')::numeric*erp_private.t08_minutes((basis.facts->>'eligible')::tstzmultirange)/60,2)::text END,
   'currency',basis.facts#>>'{wage,currency}','rule',(basis.facts->>'rule')::bigint,'basis',basis.facts#>>'{wage,basis}',
   'available',candidate.available_at) ORDER BY w.id DESC),'[]')
 FROM (SELECT f.* FROM erp_private.t08_fleet_work f WHERE f.employer_company_id=p_company AND f.day=p_day
    AND (p_before IS NULL OR f.id<p_before)
    AND erp_private.t05_scope('hr.payroll.view',f.employer_company_id,f.employer_branch_id)
    AND erp_private.t05_scope('hr.payroll.fleet_time.review',f.employer_company_id,f.employer_branch_id)
    ORDER BY f.id DESC LIMIT 26) w JOIN public.employees e ON e.id=w.employee_id
 CROSS JOIN LATERAL(SELECT erp_private.t08_source_basis(w.id) AS facts) basis
 LEFT JOIN erp_private.t08_payable_candidates candidate ON candidate.work_id=w.id AND candidate.digest=erp_private.t02_digest(basis.facts);
$$;

CREATE INDEX t08_fleet_payroll_scope ON erp_private.t08_fleet_work(employer_company_id,id DESC);
CREATE INDEX t08_payable_claim_subject ON erp_private.t08_payable_claims(employee_id);
CREATE FUNCTION public.t08_fleet_payroll_candidates(p_employer bigint,p_cutoff timestamptz,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'work',x.work_id,'employee',x.employee_id,
   'employment',x.employment_id,'employer',p_employer,'host',x.host_company_id,'date',x.day,
   'minutes',erp_private.t08_minutes(x.open), 'periods',x.open::text,
   'currency',x.currency,'amount',erp_private.t08_range_amount(x.eligible,x.open,x.rate)::text,
   'rule',x.rule_id,'snapshot',x.facts,'available',x.available_at) ORDER BY x.id DESC),'[]')
 FROM (SELECT c.*,w.employment_id,w.day,w.host_company_id,c.eligible-coalesce((
     SELECT range_agg(span) FROM erp_private.t08_payable_claims d CROSS JOIN LATERAL unnest(d.claimed) span
       WHERE d.employee_id=c.employee_id AND d.claimed&&c.eligible),'{}') AS open
   FROM erp_private.t08_payable_candidates c JOIN erp_private.t08_fleet_work w ON w.id=c.work_id
   WHERE w.employer_company_id=p_employer AND c.available_at<=p_cutoff AND isfinite(p_cutoff) AND p_cutoff<=statement_timestamp()
     AND (p_before IS NULL OR c.id<p_before)
     AND erp_private.t05_scope('hr.payroll.view',w.employer_company_id,w.employer_branch_id)
     AND erp_private.t05_scope('hr.payroll.fleet_time.review',w.employer_company_id,w.employer_branch_id)
     AND c.digest=erp_private.t02_digest(erp_private.t08_source_basis(w.id))
     AND NOT(c.eligible<@coalesce((SELECT range_agg(span) FROM erp_private.t08_payable_claims d
       CROSS JOIN LATERAL unnest(d.claimed) span WHERE d.employee_id=c.employee_id AND d.claimed&&c.eligible),'{}'))
   ORDER BY c.id DESC LIMIT 26) x;
$$;
REVOKE ALL ON FUNCTION erp_private.t08_ops_readable(bigint,bigint,bigint),public.t08_fleet_order_time(bigint,bigint),
 public.t08_receiving_orders(bigint),
 public.t08_attendance_drafts(date,bigint),public.t08_payroll_queue(bigint,date,bigint),
 public.t08_fleet_payroll_candidates(bigint,timestamptz,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t08_fleet_order_time(bigint,bigint),public.t08_receiving_orders(bigint),public.t08_attendance_drafts(date,bigint),
 public.t08_payroll_queue(bigint,date,bigint),public.t08_fleet_payroll_candidates(bigint,timestamptz,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
