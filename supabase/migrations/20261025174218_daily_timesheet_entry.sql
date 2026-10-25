BEGIN;
SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='60s';

CREATE FUNCTION erp_private.timesheet_validate_site(employee bigint,day date,data jsonb,kind text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.employees;s public.work_sites;site_id bigint;facts jsonb;
BEGIN
 SELECT * INTO e FROM public.employees WHERE id=employee;
 IF data?'work_site_id' AND data->'work_site_id'<>'null'::jsonb THEN
  IF jsonb_typeof(data->'work_site_id')<>'number' THEN RAISE EXCEPTION 'Choose a valid site' USING ERRCODE='22023';END IF;
  site_id:=(data->>'work_site_id')::bigint;
  IF site_id NOT BETWEEN 1 AND 9007199254740991 OR (data->>'work_site_id')::numeric<>site_id THEN RAISE EXCEPTION 'Choose an exact site' USING ERRCODE='22023';END IF;
 ELSE
  IF kind IN('site','office','yard','workshop') THEN RAISE EXCEPTION 'Choose the actual work site' USING ERRCODE='23514';END IF;
  RETURN;
 END IF;
 SELECT * INTO s FROM public.work_sites WHERE id=site_id FOR SHARE;
 IF s.id IS NULL OR s.deleted_at IS NOT NULL OR s.status<>'active' OR s.owner_company_id IS DISTINCT FROM e.owner_company_id
  OR s.opening_date>day OR s.closing_date<day OR NOT erp_private.permission_in_scope('hr.attendance.manage',s.owner_company_id,s.branch_id)
 THEN RAISE EXCEPTION 'Work site is unavailable for this employee, date or scope' USING ERRCODE='42501';END IF;
 IF s.is_restricted_area OR s.cicpa_required OR s.adnoc_required THEN
  IF NOT erp_private.f11_child_authorized('site-readiness',employee) THEN RAISE EXCEPTION 'Authorized site-readiness review required for restricted site' USING ERRCODE='42501';END IF;
  facts:=erp_private.f11_calculate_readiness(erp_private.f11_readiness_sources(employee,site_id));
  IF facts->>'status' IS DISTINCT FROM 'ready' THEN RAISE EXCEPTION 'Current restricted-site evidence is not ready' USING ERRCODE='23514';END IF;
 END IF;
END $$;
REVOKE ALL ON FUNCTION erp_private.timesheet_validate_site(bigint,date,jsonb,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.timesheet_site_choices(p_company bigint,p_date date,p_search text DEFAULT '',p_after bigint DEFAULT 0)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY id),'[]') FROM (
  SELECT s.id,concat_ws(' — ',s.site_code,s.site_name,nullif(s.address_line_1,'')) label FROM public.work_sites s
  WHERE erp_private.business_principal_is_active() AND s.owner_company_id=p_company AND s.deleted_at IS NULL AND s.status='active'
   AND (s.opening_date IS NULL OR s.opening_date<=p_date) AND (s.closing_date IS NULL OR s.closing_date>=p_date)
   AND erp_private.permission_in_scope('hr.attendance.manage',s.owner_company_id,s.branch_id)
   AND erp_private.permission_in_scope('hr.attendance.view',s.owner_company_id,s.branch_id)
   AND length(p_search)<=100 AND p_after>=0 AND s.id>p_after
   AND concat_ws(' ',s.site_code,s.site_name,s.address_line_1) ILIKE '%'||replace(replace(replace(p_search,'\','\\'),'%','\%'),'_','\_')||'%'
  ORDER BY s.id LIMIT 26
 )x;
$$;
REVOKE ALL ON FUNCTION public.timesheet_site_choices(bigint,date,text,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.timesheet_site_choices(bigint,date,text,bigint) TO authenticated;

CREATE OR REPLACE FUNCTION erp_private.f12_admit_attendance(p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE employee bigint:=(p_request->>'employeeId')::bigint;day date:=(p_request->>'date')::date;target bigint:=(p_request->>'id')::bigint;revision bigint:=(p_request->>'revision')::bigint;op uuid:=(p_request->>'operation')::uuid;data jsonb:=p_request->'values';r erp_private.f12_attendance_receipts;context jsonb;digest text;minutes integer;expected jsonb;kind text:=data->>'attendance_type';
BEGIN
 IF NOT erp_private.f11_child_authorized('attendance-summary',employee)THEN RAISE EXCEPTION 'Attendance authority required' USING ERRCODE='42501';END IF;
 IF op IS NULL OR day IS NULL OR jsonb_typeof(p_request)<>'object'OR jsonb_typeof(data)<>'object'OR octet_length(p_request::text)>32768 OR (p_request?'reason' AND (jsonb_typeof(p_request->'reason')<>'string' OR length(p_request->>'reason')>500)) OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_request)k WHERE k<>ALL(ARRAY['employeeId','date','id','revision','fingerprint','operation','reason','values']))OR EXISTS(SELECT 1 FROM jsonb_object_keys(data)k WHERE k<>ALL(ARRAY['attendance_type','intervals','notes','work_site_id']))OR kind IS NULL OR kind<>ALL(ARRAY['site','office','yard','workshop','remote','on_leave','absent','holiday'])OR data?'notes'AND data->'notes'<>'null'::jsonb AND(jsonb_typeof(data->'notes')<>'string'OR length(data->>'notes')>500)THEN RAISE EXCEPTION 'Invalid attendance request' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(p_request->'employeeId')<>'number'OR(p_request->>'employeeId')::numeric<>employee OR employee NOT BETWEEN 1 AND 9007199254740991 OR(p_request->>'id'IS NULL)IS DISTINCT FROM(p_request->>'revision'IS NULL)OR p_request->>'id'IS NOT NULL AND(jsonb_typeof(p_request->'id')<>'number'OR(p_request->>'id')::numeric<>target OR target NOT BETWEEN 1 AND 9007199254740991 OR jsonb_typeof(p_request->'revision')<>'string'OR coalesce(p_request->>'revision','')!~'^[1-9][0-9]{0,15}$')THEN RAISE EXCEPTION 'Invalid exact opening identity' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));PERFORM pg_advisory_xact_lock(hashtextextended('f12-attendance:'||employee||':'||day,0));PERFORM pg_advisory_xact_lock(hashtextextended('f12-attendance-op:'||auth.uid()||':'||op,0));
 PERFORM 1 FROM public.employees WHERE id=employee AND deleted_at IS NULL FOR UPDATE;PERFORM 1 FROM public.user_profiles WHERE id=public.current_user_profile_id()FOR SHARE;
 PERFORM 1 FROM public.user_roles u WHERE u.user_profile_id=public.current_user_profile_id()ORDER BY u.id FOR SHARE;
 PERFORM 1 FROM public.role_permissions p WHERE p.role_id IN(SELECT role_id FROM public.user_roles WHERE user_profile_id=public.current_user_profile_id())ORDER BY p.role_id,p.permission_id FOR SHARE;
 PERFORM 1 FROM public.roles role_row WHERE role_row.id IN(SELECT role_id FROM public.user_roles WHERE user_profile_id=public.current_user_profile_id())ORDER BY role_row.id FOR SHARE;
 PERFORM 1 FROM public.permissions p WHERE p.id IN(SELECT rp.permission_id FROM public.role_permissions rp JOIN public.user_roles u ON u.role_id=rp.role_id WHERE u.user_profile_id=public.current_user_profile_id())ORDER BY p.id FOR SHARE;
 PERFORM 1 FROM auth.sessions s WHERE s.user_id=auth.uid()AND s.id=(auth.jwt()->>'session_id')::uuid FOR SHARE;
 PERFORM 1 FROM public.employee_shift_assignments a WHERE a.employee_id=employee AND a.deleted_at IS NULL AND a.effective_from<=day AND(a.effective_to IS NULL OR a.effective_to>=day)ORDER BY a.id FOR SHARE;
 PERFORM 1 FROM public.work_calendars c WHERE c.id IN(SELECT a.work_calendar_id FROM public.employee_shift_assignments a WHERE a.employee_id=employee AND a.deleted_at IS NULL)ORDER BY c.id FOR SHARE;
 PERFORM 1 FROM public.work_shifts s WHERE s.id IN(SELECT a.work_shift_id FROM public.employee_shift_assignments a WHERE a.employee_id=employee AND a.deleted_at IS NULL)ORDER BY s.id FOR SHARE;
 digest:=encode(sha256(convert_to(p_request::text,'UTF8')),'hex');SELECT *INTO r FROM erp_private.f12_attendance_receipts WHERE actor=auth.uid()AND operation_id=op;
 IF FOUND THEN IF r.request_hash<>digest THEN RAISE EXCEPTION 'Original attendance operation changed' USING ERRCODE='22023';END IF;RETURN r.result||jsonb_build_object('replayed',true);END IF;
 context:=erp_private.f12_attendance_context(employee,day);
 IF context->>'fingerprint'IS DISTINCT FROM p_request->>'fingerprint'OR(context->>'id')::bigint IS DISTINCT FROM target OR(context->>'revision')::bigint IS DISTINCT FROM revision THEN RAISE EXCEPTION 'Attendance context changed; review original values' USING ERRCODE='PT409';END IF;
 IF NOT(context->>'eligible')::boolean OR day>(now()AT TIME ZONE'Asia/Dubai')::date OR(context->>'approved_leave')::boolean OR context->>'approval_status'IN('approved','locked')THEN RAISE EXCEPTION 'Attendance date is ineligible, approved, locked or on approved leave' USING ERRCODE='23514';END IF;
 PERFORM erp_private.timesheet_validate_site(employee,day,data,kind);
 minutes:=erp_private.f12_attendance_minutes(data->'intervals',day);
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(data->'intervals')i JOIN public.employee_leave_requests l ON l.employee_id=employee AND l.deleted_at IS NULL AND l.approval_status='approved'AND tstzrange((l.start_date::timestamp AT TIME ZONE'Asia/Dubai'),((l.end_date+1)::timestamp AT TIME ZONE'Asia/Dubai'),'[)')&&tstzrange((i->>'start')::timestamptz,(i->>'end')::timestamptz,'[)'))THEN RAISE EXCEPTION 'Actual interval intersects approved leave, including an overnight date' USING ERRCODE='23514';END IF;
 IF(kind IN('absent','holiday','on_leave'))IS DISTINCT FROM(jsonb_array_length(data->'intervals')=0)THEN RAISE EXCEPTION 'Work needs actual intervals; non-work needs none' USING ERRCODE='23514';END IF;
 expected:=jsonb_build_object('attendance_type',kind,'entered_intervals',data->'intervals','worked_minutes',minutes,'total_hours',round(minutes::numeric/60,2),'first_in_at',CASE WHEN minutes>0 THEN(data->'intervals'->0->>'start')::timestamptz END,'last_out_at',CASE WHEN minutes>0 THEN(data->'intervals'->-1->>'end')::timestamptz END,'is_missing_punch',false,'approval_status','pending');
 expected:=expected||jsonb_build_object('work_site_id',CASE WHEN data?'work_site_id' THEN data->'work_site_id' ELSE (SELECT to_jsonb(s.work_site_id) FROM public.employee_attendance_daily_summary s WHERE s.id=target) END);
 IF data?'notes'THEN expected:=expected||jsonb_build_object('notes',data->'notes');END IF;
 INSERT INTO erp_private.f12_attendance_proofs VALUES(auth.uid(),pg_current_xact_id(),pg_backend_pid(),op,employee,target,revision,day,expected,digest,coalesce(btrim(p_request->>'reason'),''));
 RETURN jsonb_build_object('expected',expected);
END$function$
;
CREATE OR REPLACE FUNCTION erp_private.f12_capture_attendance(p_new jsonb, p_old jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE proof erp_private.f12_attendance_proofs;key text;value jsonb;actor bigint:=public.current_user_profile_id();result jsonb;allowed text[]:=ARRAY['work_site_id','attendance_type','entered_intervals','worked_minutes','total_hours','first_in_at','last_out_at','notes','is_missing_punch','approval_status','workspace_revision','updated_at','updated_by'];
BEGIN
 SELECT p.*INTO proof FROM erp_private.f12_attendance_proofs p WHERE p.actor=auth.uid()AND p.transaction_id=pg_current_xact_id()AND p.backend=pg_backend_pid();
 IF NOT FOUND OR NOT erp_private.f11_child_authorized('attendance-summary',proof.employee_id)OR(p_new->>'employee_id')::bigint<>proof.employee_id OR(p_new->>'attendance_date')::date<>proof.attendance_date OR(p_old->>'id')::bigint IS DISTINCT FROM proof.record_id OR(p_old->>'workspace_revision')::bigint IS DISTINCT FROM proof.revision OR(p_new->>'workspace_revision')::bigint<>coalesce(proof.revision,0)+1 OR(p_new->>'updated_by')::bigint IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Native attendance proof unavailable' USING ERRCODE='42501';END IF;
 FOR key,value IN SELECT *FROM jsonb_each(proof.expected)LOOP IF p_new->key IS DISTINCT FROM value THEN RAISE EXCEPTION 'Attendance differs from admitted fields' USING ERRCODE='23514';END IF;END LOOP;
 IF p_old IS NOT NULL AND(p_new-allowed)IS DISTINCT FROM(p_old-allowed)THEN RAISE EXCEPTION 'Unrendered attendance changed' USING ERRCODE='23514';END IF;
 IF NOT(proof.expected?'notes')AND p_new->'notes'IS DISTINCT FROM coalesce(p_old->'notes','null'::jsonb)THEN RAISE EXCEPTION 'Omitted notes must remain unchanged' USING ERRCODE='23514';END IF;
 IF p_old IS NULL AND((p_new->>'created_by')::bigint IS DISTINCT FROM actor OR p_new->>'approved_at'IS NOT NULL OR p_new->>'approved_by'IS NOT NULL OR coalesce((p_new->>'overtime_hours')::numeric,0)<>0 OR coalesce((p_new->>'late_minutes')::integer,0)<>0 OR coalesce((p_new->>'early_out_minutes')::integer,0)<>0 OR(p_new->>'created_at')::timestamptz<>transaction_timestamp())THEN RAISE EXCEPTION 'New attendance cannot imply pay, forged raw context or approval' USING ERRCODE='23514';END IF;
 INSERT INTO public.employee_attendance_corrections(summary_id,employee_id,correction_reason,old_values_json,new_values_json,corrected_by)VALUES((p_new->>'id')::bigint,proof.employee_id,proof.reason,p_old,p_new,actor);
 INSERT INTO erp_private.f12_attendance_events(actor,operation_id,employee_id,record_id,reason,old_values,new_values)VALUES(auth.uid(),proof.operation_id,proof.employee_id,(p_new->>'id')::bigint,proof.reason,p_old,p_new);
 INSERT INTO public.audit_logs(actor_user_profile_id,module_code,entity_name,entity_id,action,new_values)VALUES(actor,'HR','employee_attendance_daily_summary',(p_new->>'id')::bigint,'entered_time',jsonb_build_object('employee_id',proof.employee_id,'operation_id',proof.operation_id));
 result:=jsonb_build_object('employee_id',proof.employee_id,'id',(p_new->>'id')::bigint,'revision',p_new->>'workspace_revision','operation_id',proof.operation_id,'replayed',false);
 INSERT INTO erp_private.f12_attendance_receipts(actor,operation_id,request_hash,result)VALUES(auth.uid(),proof.operation_id,proof.request_hash,result);
 DELETE FROM erp_private.f12_attendance_proofs p WHERE p.actor=auth.uid()AND p.transaction_id=pg_current_xact_id()AND p.backend=pg_backend_pid();
END$function$
;
CREATE OR REPLACE FUNCTION public.f12_save_attendance(p_request jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
DECLARE admitted jsonb;expected jsonb;target bigint;op uuid:=(p_request->>'operation')::uuid;BEGIN
 admitted:=erp_private.f12_admit_attendance(p_request);IF admitted?'replayed'THEN RETURN admitted;END IF;expected:=admitted->'expected';
 IF p_request->>'id'IS NULL THEN INSERT INTO public.employee_attendance_daily_summary(employee_id,attendance_date,work_site_id,attendance_type,entered_intervals,worked_minutes,total_hours,first_in_at,last_out_at,notes,is_missing_punch,created_by,updated_by)VALUES((p_request->>'employeeId')::bigint,(p_request->>'date')::date,(expected->>'work_site_id')::bigint,expected->>'attendance_type',expected->'entered_intervals',(expected->>'worked_minutes')::integer,(expected->>'total_hours')::numeric,(expected->>'first_in_at')::timestamptz,(expected->>'last_out_at')::timestamptz,expected->>'notes',false,public.current_user_profile_id(),public.current_user_profile_id())RETURNING id INTO target;
 ELSE UPDATE public.employee_attendance_daily_summary SET work_site_id=(expected->>'work_site_id')::bigint,attendance_type=expected->>'attendance_type',entered_intervals=expected->'entered_intervals',worked_minutes=(expected->>'worked_minutes')::integer,total_hours=(expected->>'total_hours')::numeric,first_in_at=(expected->>'first_in_at')::timestamptz,last_out_at=(expected->>'last_out_at')::timestamptz,notes=CASE WHEN expected?'notes'THEN expected->>'notes'ELSE notes END,is_missing_punch=false,approval_status='pending',updated_by=public.current_user_profile_id()WHERE id=(p_request->>'id')::bigint AND employee_id=(p_request->>'employeeId')::bigint AND workspace_revision=(p_request->>'revision')::bigint RETURNING id INTO target;END IF;
 IF target IS NULL THEN RAISE EXCEPTION 'Original attendance no longer writable' USING ERRCODE='42501';END IF;
 RETURN public.f12_reconcile_attendance(op);
END$function$
;
CREATE OR REPLACE FUNCTION erp_private.f12_attendance_context(p_employee bigint, p_date date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE e public.employees;s public.employee_attendance_daily_summary;assignments jsonb;calendar public.work_calendars;shift public.work_shifts;a public.employee_shift_assignments;approved_leave boolean;eligible boolean;schedule jsonb;warning text;fingerprint text;
BEGIN
 IF NOT erp_private.f11_child_authorized('attendance-summary',p_employee)THEN RAISE EXCEPTION 'Current attendance subject access required' USING ERRCODE='42501';END IF;
 SELECT *INTO e FROM public.employees WHERE id=p_employee AND deleted_at IS NULL;IF NOT FOUND THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501';END IF;
 SELECT *INTO s FROM public.employee_attendance_daily_summary WHERE employee_id=p_employee AND attendance_date=p_date;
 SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY x.id),'[]')INTO assignments FROM public.employee_shift_assignments x WHERE x.employee_id=p_employee AND x.deleted_at IS NULL AND x.effective_from<=p_date AND(x.effective_to IS NULL OR x.effective_to>=p_date);
 IF jsonb_array_length(assignments)=1 THEN SELECT *INTO a FROM public.employee_shift_assignments WHERE id=(assignments->0->>'id')::bigint;SELECT *INTO calendar FROM public.work_calendars WHERE id=a.work_calendar_id AND deleted_at IS NULL;SELECT *INTO shift FROM public.work_shifts WHERE id=a.work_shift_id AND deleted_at IS NULL;END IF;
 SELECT EXISTS(SELECT 1 FROM public.employee_leave_requests WHERE employee_id=p_employee AND deleted_at IS NULL AND approval_status='approved'AND start_date<=p_date AND end_date>=p_date)INTO approved_leave;
 eligible:=coalesce(e.joining_date IS NOT NULL AND e.joining_date<=p_date AND(e.inactive_date IS NULL OR e.inactive_date>p_date)AND(e.employee_status IN('active','probation','on_leave')OR e.inactive_date>p_date),false);
 IF jsonb_array_length(assignments)<>1 OR calendar.id IS NULL OR shift.id IS NULL OR shift.calendar_id<>calendar.id OR NOT calendar.is_active OR NOT shift.is_active OR calendar.owner_company_id IS NOT NULL AND calendar.owner_company_id<>e.owner_company_id OR(calendar.effective_from IS NOT NULL AND calendar.effective_from>p_date)OR(calendar.effective_to IS NOT NULL AND calendar.effective_to<p_date)THEN warning:='Shift/calendar unavailable or ambiguous; enter only verified actual times.';
 ELSIF calendar.has_ramadan_timing OR calendar.has_summer_timing THEN warning:='Seasonal calendar needs explicit review; scheduled times not assumed.';
 ELSIF NOT lower(to_char(p_date,'FMDay'))=ANY(SELECT lower(day)FROM unnest(calendar.working_days)day)THEN warning:='Not a configured working day; scheduled times not assumed.';
 ELSE
  schedule:=jsonb_build_array(jsonb_build_object('start',to_char(p_date+shift.shift_start_time::time,'YYYY-MM-DD"T"HH24:MI:00')||'+04:00','end',to_char(p_date+shift.shift_end_time::time+CASE WHEN shift.is_overnight THEN interval'1 day'ELSE interval'0 day'END,'YYYY-MM-DD"T"HH24:MI:00')||'+04:00','breaks',CASE WHEN shift.break_start_time IS NOT NULL AND shift.break_end_time IS NOT NULL AND NOT shift.is_overnight THEN jsonb_build_array(jsonb_build_object('start',to_char(p_date+shift.break_start_time::time,'YYYY-MM-DD"T"HH24:MI:00')||'+04:00','end',to_char(p_date+shift.break_end_time::time,'YYYY-MM-DD"T"HH24:MI:00')||'+04:00'))ELSE'[]'::jsonb END));
  IF shift.is_overnight AND(shift.break_start_time IS NOT NULL OR shift.break_end_time IS NOT NULL)THEN schedule:=NULL;warning:='Overnight break dates need explicit review.';END IF;
 END IF;
 fingerprint:=encode(sha256(convert_to(jsonb_build_array(jsonb_build_object('revision',e.workspace_revision,'joining',e.joining_date,'inactive',e.inactive_date,'status',e.employee_status,'company',e.owner_company_id,'branch',e.branch_id,'site',e.primary_work_site_id,'manager',e.reporting_manager_id),to_jsonb(s),assignments,to_jsonb(calendar),to_jsonb(shift),approved_leave)::text,'UTF8')),'hex');
 RETURN jsonb_build_object('employee_id',e.id,'employee_code',e.employee_code,'full_name_en',e.full_name_en,'id',s.id,'revision',s.workspace_revision::text,'fingerprint',fingerprint,'eligible',eligible,'approved_leave',approved_leave,'approval_status',s.approval_status,'entered',CASE WHEN s.entered_intervals IS NOT NULL THEN jsonb_build_object('attendance_type',s.attendance_type,'intervals',s.entered_intervals,'notes',s.notes,'work_site_id',s.work_site_id)END,'work_site_label',(SELECT concat_ws(' — ',ws.site_code,ws.site_name,nullif(ws.address_line_1,'')) FROM public.work_sites ws WHERE ws.id=s.work_site_id AND erp_private.permission_in_scope('hr.attendance.manage',ws.owner_company_id,ws.branch_id)),'schedule',CASE WHEN s.id IS NULL AND NOT approved_leave AND eligible THEN schedule END,'context_warning',warning);
END$function$
;
CREATE OR REPLACE FUNCTION public.f12_attendance_roster(p_date date, p_company bigint, p_branch bigint DEFAULT NULL::bigint, p_site bigint DEFAULT NULL::bigint, p_team bigint DEFAULT NULL::bigint, p_shift bigint DEFAULT NULL::bigint, p_search text DEFAULT ''::text, p_page integer DEFAULT 1, p_history boolean DEFAULT false, p_state text DEFAULT 'all'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
BEGIN
 IF p_date IS NULL OR p_company IS NULL OR p_company NOT BETWEEN 1 AND 9007199254740991 OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_search IS NULL OR length(p_search)>100 OR p_history IS NULL OR p_state IS NULL OR p_state<>ALL(ARRAY['all','not_entered','pending','queried','approved','locked','approved_leave','ineligible'])THEN RAISE EXCEPTION 'Invalid exact roster criteria' USING ERRCODE='22023';END IF;
 RETURN(WITH permitted AS MATERIALIZED(
 SELECT e.id FROM public.employees e LEFT JOIN public.employee_attendance_daily_summary s ON s.employee_id=e.id AND s.attendance_date=p_date
 WHERE e.deleted_at IS NULL AND e.owner_company_id=p_company AND erp_private.f11_child_authorized('attendance-summary',e.id)
 AND(p_branch IS NULL OR e.branch_id=p_branch)AND(p_site IS NULL OR EXISTS(SELECT 1 FROM public.employee_attendance_daily_summary ts WHERE ts.employee_id=e.id AND ts.attendance_date=p_date AND ts.work_site_id=p_site))AND(p_team IS NULL OR e.reporting_manager_id=p_team)
 AND(p_shift IS NULL OR EXISTS(SELECT 1 FROM public.employee_shift_assignments a WHERE a.employee_id=e.id AND a.work_shift_id=p_shift AND a.deleted_at IS NULL AND a.effective_from<=p_date AND(a.effective_to IS NULL OR a.effective_to>=p_date)))
 AND(e.full_name_en ILIKE'%'||replace(replace(replace(p_search,'\','\\'),'%','\%'),'_','\_')||'%'OR e.employee_code ILIKE'%'||replace(replace(replace(p_search,'\','\\'),'%','\%'),'_','\_')||'%')
 AND(p_history OR coalesce(e.joining_date<=p_date AND(e.inactive_date IS NULL OR e.inactive_date>p_date)AND(e.employee_status IN('active','probation','on_leave')OR e.inactive_date>p_date),false))
 AND(p_state='all'OR p_state='not_entered'AND s.id IS NULL OR p_state IN('pending','queried','approved','locked')AND s.approval_status=p_state
 OR p_state='approved_leave'AND EXISTS(SELECT 1 FROM public.employee_leave_requests l WHERE l.employee_id=e.id AND l.deleted_at IS NULL AND l.approval_status='approved'AND l.start_date<=p_date AND l.end_date>=p_date)
 OR p_state='ineligible'AND NOT coalesce(e.joining_date<=p_date AND(e.inactive_date IS NULL OR e.inactive_date>p_date)AND(e.employee_status IN('active','probation','on_leave')OR e.inactive_date>p_date),false))),
 page AS(SELECT id FROM permitted ORDER BY id LIMIT 25 OFFSET(p_page-1)*25)
 SELECT jsonb_build_object('rows',coalesce((SELECT jsonb_agg(erp_private.f12_attendance_context(id,p_date)ORDER BY id)FROM page),'[]'),'total',(SELECT count(*)FROM permitted),'page',p_page));
END
$function$
;
NOTIFY pgrst,'reload schema';
COMMIT;
