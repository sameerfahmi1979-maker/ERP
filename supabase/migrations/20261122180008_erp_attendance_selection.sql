BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;

-- Both commands must use the same scoped roster. Pin the reviewed T04 roster and leave helper
-- before replacing the old 25-row entry point with a compatibility wrapper.
DO $guard$
BEGIN
 IF NOT EXISTS(
   SELECT 1 FROM pg_catalog.pg_proc p WHERE p.oid=to_regprocedure('public.f12_attendance_roster(date,bigint,bigint,bigint,bigint,bigint,text,integer,boolean,text)')
     AND md5(replace(p.prosrc,E'\r\n',E'\n'))='ee890532863857a296deec6062df239f'
     AND NOT p.prosecdef AND p.provolatile='s' AND p.prorettype='jsonb'::regtype
     AND p.proconfig=ARRAY['search_path=""']::text[]
 ) THEN
   RAISE EXCEPTION 'Attendance roster predecessor requires review';
 END IF;
 IF NOT EXISTS(
   SELECT 1 FROM pg_catalog.pg_proc p
   WHERE p.oid=to_regprocedure('erp_private.t04_approved_leave_day(bigint,date)')
     AND md5(replace(p.prosrc,E'\r\n',E'\n'))='71f1a4da255ae6580172487ceeccd2c7'
     AND p.prosecdef AND p.provolatile='s' AND p.prorettype='boolean'::regtype
     AND p.proconfig=ARRAY['search_path=""']::text[]
 ) THEN
   RAISE EXCEPTION 'Managed leave attendance predecessor requires review';
 END IF;
END
$guard$;

CREATE FUNCTION erp_private.f12_attendance_roster_window(p_date date, p_company bigint, p_branch bigint, p_site bigint, p_team bigint, p_shift bigint, p_search text, p_page integer, p_history boolean, p_state text, p_limit integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path = '' AS $function$
BEGIN
 IF p_limit IS NULL OR p_limit NOT IN (25,500) THEN RAISE EXCEPTION 'Invalid attendance roster window' USING ERRCODE='22023'; END IF;
 IF p_date IS NULL OR p_company IS NULL OR p_company NOT BETWEEN 1 AND 9007199254740991 OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_search IS NULL OR length(p_search)>100 OR p_history IS NULL OR p_state IS NULL OR p_state<>ALL(ARRAY['all','not_entered','pending','queried','approved','locked','approved_leave','ineligible'])THEN RAISE EXCEPTION 'Invalid exact roster criteria' USING ERRCODE='22023';END IF;
 RETURN(WITH permitted AS MATERIALIZED(
 SELECT e.id FROM public.employees e LEFT JOIN public.employee_attendance_daily_summary s ON s.employee_id=e.id AND s.attendance_date=p_date
 WHERE e.deleted_at IS NULL AND e.owner_company_id=p_company AND erp_private.f11_child_authorized('attendance-summary',e.id)
 AND(p_branch IS NULL OR e.branch_id=p_branch)AND(p_site IS NULL OR EXISTS(SELECT 1 FROM public.employee_attendance_daily_summary ts WHERE ts.employee_id=e.id AND ts.attendance_date=p_date AND ts.work_site_id=p_site))AND(p_team IS NULL OR e.reporting_manager_id=p_team)
 AND(p_shift IS NULL OR EXISTS(SELECT 1 FROM public.employee_shift_assignments a WHERE a.employee_id=e.id AND a.work_shift_id=p_shift AND a.deleted_at IS NULL AND a.effective_from<=p_date AND(a.effective_to IS NULL OR a.effective_to>=p_date)))
 AND(e.full_name_en ILIKE'%'||replace(replace(replace(p_search,'\','\\'),'%','\%'),'_','\_')||'%'OR e.employee_code ILIKE'%'||replace(replace(replace(p_search,'\','\\'),'%','\%'),'_','\_')||'%')
 AND(p_history OR coalesce(e.joining_date<=p_date AND(e.inactive_date IS NULL OR e.inactive_date>p_date)AND(e.employee_status IN('active','probation','on_leave')OR e.inactive_date>p_date),false))
 AND(p_state='all'OR p_state='not_entered'AND s.id IS NULL OR p_state IN('pending','queried','approved','locked')AND s.approval_status=p_state
 OR p_state='approved_leave'AND (erp_private.t04_approved_leave_day(e.id,p_date) OR EXISTS(SELECT 1 FROM public.employee_leave_requests l WHERE l.employee_id=e.id AND l.deleted_at IS NULL AND l.approval_status='approved'AND l.start_date<=p_date AND l.end_date>=p_date))
 OR p_state='ineligible'AND NOT coalesce(e.joining_date<=p_date AND(e.inactive_date IS NULL OR e.inactive_date>p_date)AND(e.employee_status IN('active','probation','on_leave')OR e.inactive_date>p_date),false))),
 page AS(SELECT id FROM permitted ORDER BY id LIMIT p_limit OFFSET(p_page-1)*25)
 SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(erp_private.f12_attendance_context(id,p_date)ORDER BY id)FROM page),'[]'),'total',(SELECT count(*)FROM permitted),'page',p_page));
END
$function$;
REVOKE ALL ON FUNCTION erp_private.f12_attendance_roster_window(date,bigint,bigint,bigint,bigint,bigint,text,integer,boolean,text,integer) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.f12_attendance_roster_window(date,bigint,bigint,bigint,bigint,bigint,text,integer,boolean,text,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.f12_attendance_roster(p_date date, p_company bigint, p_branch bigint DEFAULT NULL::bigint, p_site bigint DEFAULT NULL::bigint, p_team bigint DEFAULT NULL::bigint, p_shift bigint DEFAULT NULL::bigint, p_search text DEFAULT ''::text, p_page integer DEFAULT 1, p_history boolean DEFAULT false, p_state text DEFAULT 'all'::text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT erp_private.f12_attendance_roster_window($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,25)
$$;

-- A single statement freezes at most 500 authorized candidates and the exact
-- total. Each attendance write still rechecks the captured row fingerprint.
CREATE FUNCTION public.f12_attendance_selection(p_date date, p_company bigint, p_branch bigint DEFAULT NULL::bigint, p_site bigint DEFAULT NULL::bigint, p_team bigint DEFAULT NULL::bigint, p_shift bigint DEFAULT NULL::bigint, p_search text DEFAULT ''::text, p_page integer DEFAULT 1, p_history boolean DEFAULT false, p_state text DEFAULT 'all'::text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
 SELECT erp_private.f12_attendance_roster_window($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,500)
$$;
REVOKE ALL ON FUNCTION public.f12_attendance_selection(date,bigint,bigint,bigint,bigint,bigint,text,integer,boolean,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.f12_attendance_selection(date,bigint,bigint,bigint,bigint,bigint,text,integer,boolean,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
