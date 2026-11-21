BEGIN;

-- The approval keeps its interval until the authoritative workflow releases it.
-- Payment allocations only determine how to describe that held interval.
CREATE FUNCTION erp_private.t14_fleet_interval_state(
 p_employee bigint,p_company bigint,p_branch bigint,p_ranges tstzmultirange,p_run uuid
) RETURNS TABLE(available tstzmultirange,draft tstzmultirange,approved tstzmultirange,paid tstzmultirange)
LANGUAGE sql STABLE SET search_path='' AS $$
 WITH spans AS (
   SELECT d.span,'draft' AS state
   FROM erp_private.t14_draft_usage d
   WHERE d.employee_id=p_employee AND d.span IS NOT NULL AND d.span&&p_ranges AND d.run_id IS DISTINCT FROM p_run
   UNION ALL
   SELECT c.claimed,'approved' FROM erp_private.t08_payable_claims c
   WHERE c.employee_id=p_employee AND c.claimed&&p_ranges
   UNION ALL
   SELECT r.span,CASE WHEN owning.company_id=p_company AND owning.branch_id=p_branch AND EXISTS (
       SELECT 1
       FROM erp_private.t16_payment_allocations a
       JOIN erp_private.t16_allocation_decisions d ON d.id=a.decision_id
       JOIN erp_private.t16_payments p ON p.id=d.payment_id AND p.employee_id=r.employee_id
       JOIN erp_private.t16_batches b ON b.id=p.batch_id AND b.review_id=r.review_id AND b.version_id=r.version_id
       JOIN erp_private.t16_current_payment_events e ON e.payment_id=p.id AND e.outcome IN('paid','partial')
       LEFT JOIN erp_private.t16_payment_reversals x ON x.payment_id=p.id
       WHERE a.line_id=l.id AND x.id IS NULL AND erp_private.t16_channel_ready(b.id,p.employee_id)
       HAVING sum(a.amount)=l.amount
     ) THEN 'paid' ELSE 'approved' END
   FROM erp_private.t15_reserved_lines r
   JOIN erp_private.t14_runs owning ON owning.id=r.run_id
   JOIN erp_private.t14_lines l ON l.id=r.line_id
   WHERE r.released_at IS NULL AND r.employee_id=p_employee AND r.span IS NOT NULL AND r.span&&p_ranges
     AND r.run_id IS DISTINCT FROM p_run
   UNION ALL
   SELECT s.span,CASE WHEN owning.company_id=p_company AND owning.branch_id=p_branch AND EXISTS (
       SELECT 1 FROM erp_private.t18_exit_active_allocations a
       JOIN erp_private.t18_exit_current_events e ON e.payment_id=a.payment_id AND e.outcome IN('paid','partial')
       WHERE a.line_id=l.id AND a.version_id=s.version_id
       HAVING sum(a.amount)=l.amount
     ) THEN 'paid' ELSE 'approved' END
   FROM erp_private.t18_reserved_sources s
   JOIN erp_private.t18_claim_reservations r ON r.version_id=s.version_id AND r.released_at IS NULL
   JOIN erp_private.t18_cases owning ON owning.eos_id=r.eos_id
   JOIN erp_private.t18_lines l ON l.id=s.line_id AND l.version_id=s.version_id
   WHERE s.released_at IS NULL AND s.employee_id=p_employee AND s.span IS NOT NULL AND s.span&&p_ranges
 ), grouped AS (
   SELECT coalesce(range_agg(span) FILTER (WHERE state='paid'),'{}'::tstzmultirange) AS paid,
          coalesce(range_agg(span) FILTER (WHERE state='approved'),'{}'::tstzmultirange) AS approved,
          coalesce(range_agg(span) FILTER (WHERE state='draft'),'{}'::tstzmultirange) AS draft
   FROM spans
 )
 SELECT p_ranges-(grouped.paid+grouped.approved+grouped.draft),
        (grouped.draft*p_ranges)-(grouped.paid+grouped.approved),
        (grouped.approved*p_ranges)-grouped.paid,
        grouped.paid*p_ranges
 FROM grouped;
$$;

CREATE OR REPLACE FUNCTION public.t08_fleet_payroll_candidates(p_employer bigint,p_cutoff timestamptz,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'work',x.work_id,'employee',x.employee_id,
   'employment',x.employment_id,'employer',p_employer,'host',x.host_company_id,'date',x.day,
   'minutes',erp_private.t08_minutes(x.open),'periods',x.open::text,
   'currency',x.currency,'amount',erp_private.t08_range_amount(x.eligible,x.open,x.rate)::text,
   'rule',x.rule_id,'snapshot',x.facts,'available',x.available_at) ORDER BY x.id DESC),'[]')
 FROM (SELECT c.*,w.employment_id,w.day,w.host_company_id,claims.available AS open
   FROM erp_private.t08_payable_candidates c JOIN erp_private.t08_fleet_work w ON w.id=c.work_id
   CROSS JOIN LATERAL erp_private.t14_fleet_interval_state(c.employee_id,w.employer_company_id,w.employer_branch_id,c.eligible,NULL) claims
   WHERE w.employer_company_id=p_employer AND c.available_at<=p_cutoff AND isfinite(p_cutoff) AND p_cutoff<=statement_timestamp()
     AND (p_before IS NULL OR c.id<p_before)
     AND erp_private.t05_scope('hr.payroll.view',w.employer_company_id,w.employer_branch_id)
     AND erp_private.t05_scope('hr.payroll.fleet_time.review',w.employer_company_id,w.employer_branch_id)
     AND c.digest=erp_private.t02_digest(erp_private.t08_source_basis(w.id))
     AND NOT isempty(claims.available)
   ORDER BY c.id DESC LIMIT 26) x;
$$;

CREATE OR REPLACE FUNCTION public.t08_payroll_queue(p_company bigint,p_day date,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('work',w.id,'employee',w.employee_id,'name',e.full_name_en,'date',w.day,
   'status',CASE
     WHEN candidate.id IS NULL THEN basis.facts->>'status'
     WHEN NOT isempty(claims.available) THEN 'accepted'
     WHEN candidate.eligible<@claims.paid THEN 'already-paid'
     WHEN NOT isempty(claims.approved) OR NOT isempty(claims.paid) THEN 'held-by-approval'
     ELSE 'held-by-draft' END,
   'digest',CASE WHEN basis.facts->>'status'='ready' THEN erp_private.t02_digest(basis.facts) END,
   'minutes',erp_private.t08_minutes(CASE WHEN candidate.id IS NULL THEN (basis.facts->>'eligible')::tstzmultirange ELSE claims.available END),
   'rate',CASE WHEN basis.facts->>'status'='ready' THEN round((basis.facts->>'rate')::numeric,6)::text END,
   'amount',CASE WHEN candidate.id IS NOT NULL THEN erp_private.t08_range_amount(candidate.eligible,claims.available,candidate.rate)::text
     WHEN basis.facts->>'status'='ready' THEN
       round((basis.facts->>'rate')::numeric*erp_private.t08_minutes((basis.facts->>'eligible')::tstzmultirange)/60,2)::text END,
   'currency',basis.facts#>>'{wage,currency}','rule',(basis.facts->>'rule')::bigint,'basis',basis.facts#>>'{wage,basis}',
   'available',candidate.available_at) ORDER BY w.id DESC),'[]')
 FROM (SELECT f.* FROM erp_private.t08_fleet_work f WHERE f.employer_company_id=p_company AND f.day=p_day
    AND (p_before IS NULL OR f.id<p_before)
    AND erp_private.t05_scope('hr.payroll.view',f.employer_company_id,f.employer_branch_id)
    AND erp_private.t05_scope('hr.payroll.fleet_time.review',f.employer_company_id,f.employer_branch_id)
    ORDER BY f.id DESC LIMIT 26) w JOIN public.employees e ON e.id=w.employee_id
 CROSS JOIN LATERAL(SELECT erp_private.t08_source_basis(w.id) AS facts) basis
 LEFT JOIN erp_private.t08_payable_candidates candidate ON candidate.work_id=w.id AND candidate.digest=erp_private.t02_digest(basis.facts)
 LEFT JOIN LATERAL erp_private.t14_fleet_interval_state(w.employee_id,w.employer_company_id,w.employer_branch_id,candidate.eligible,NULL) claims
   ON candidate.id IS NOT NULL;
$$;

CREATE FUNCTION erp_private.t14_fleet_project_claims(p_run uuid,p_employee bigint,p_company bigint,p_branch bigint,p_line jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH candidate AS (
   SELECT c.eligible,c.rate
   FROM erp_private.t08_payable_candidates c
   WHERE c.id=(p_line#>>'{source,candidate}')::bigint AND c.employee_id=p_employee
 ), state AS MATERIALIZED (
   SELECT * FROM erp_private.t14_fleet_interval_state(p_employee,p_company,p_branch,(p_line#>>'{source,interval}')::tstzmultirange,p_run)
 )
 SELECT jsonb_build_object(
   'lines',coalesce((
     SELECT jsonb_agg(CASE WHEN s.available=(p_line#>>'{source,interval}')::tstzmultirange THEN p_line ELSE p_line||jsonb_build_object(
       'key','fleet-overtime:'||(p_line#>>'{source,work}')||':'||p.piece::text,
       'amount',erp_private.t08_range_amount(c.eligible,tstzmultirange(p.piece),c.rate),
       'quantity',erp_private.t08_minutes(tstzmultirange(p.piece))/60,
       'source',(p_line->'source')||jsonb_build_object('interval',tstzmultirange(p.piece)::text)
     ) END ORDER BY p.piece)
     FROM state s CROSS JOIN candidate c CROSS JOIN LATERAL unnest(s.available) p(piece)
   ),'[]'::jsonb),
   'exceptions',coalesce((
     SELECT jsonb_agg(erp_private.t14_issue(e.code,e.message,false,
       (p_line->'source')||jsonb_build_object('interval',e.span::text)) ORDER BY e.ordinal)
     FROM state s CROSS JOIN LATERAL (VALUES
       (1,s.paid,'fleet-overtime-already-paid','This Fleet overtime interval has already been paid against its approved line.'),
       (2,s.approved,'fleet-overtime-held-by-approval','This Fleet overtime interval is held by an existing approval or payable claim.'),
       (3,s.draft,'source-in-another-draft','This Fleet overtime interval is held by another current draft.')
     ) e(ordinal,span,code,message)
     WHERE NOT isempty(e.span)
   ),'[]'::jsonb)
 );
$$;

-- Amend the currently installed T18-adopted monthly calculation. Leave the
-- shared non-Fleet predicates, approval commands and historical snapshots intact.
DO $adopt$
DECLARE
 target regprocedure:='erp_private.t14_employee_basis(uuid,bigint,bigint,bigint,date,timestamp with time zone)'::regprocedure;
 body text;
 definition text;
 anchor text:=$old$   ELSIF erp_private.t14_other_draft(p_run,p_employee,entry) THEN$old$;
 amended text;
BEGIN
 SELECT prosrc,pg_get_functiondef(oid) INTO STRICT body,definition FROM pg_proc WHERE oid=target;
 IF (length(body)-length(replace(body,anchor,'')))<>length(anchor)
    OR position('erp_private.t18_monthly_operational_sources(' IN body)=0 THEN
   RAISE EXCEPTION 'Expected the T18 monthly Fleet source and exact existing draft predicate';
 END IF;
 amended:=replace(body,anchor,$new$   ELSIF entry->>'category'='fleet-overtime' THEN
     part:=erp_private.t14_fleet_project_claims(p_run,p_employee,p_company,p_branch,entry);
     lines:=lines||(part->'lines');
     issues:=issues||(part->'exceptions');
     seen:=array_append(seen,entry->>'key');
   ELSIF erp_private.t14_other_draft(p_run,p_employee,entry) THEN$new$);
 EXECUTE replace(definition,body,amended);
END $adopt$;

REVOKE ALL ON FUNCTION erp_private.t14_fleet_interval_state(bigint,bigint,bigint,tstzmultirange,uuid),
 erp_private.t14_fleet_project_claims(uuid,bigint,bigint,bigint,jsonb) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;

