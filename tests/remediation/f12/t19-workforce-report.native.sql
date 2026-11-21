DO $test$
BEGIN
 IF current_database() !~ '^(t00_clean|t19_[a-z0-9_]+)$'
 OR (SELECT shobj_description(oid,'pg_database') FROM pg_database WHERE datname=current_database())
    IS DISTINCT FROM 'Isolated HR T00 20261119'
 OR current_setting('cron.launch_active_jobs') IS DISTINCT FROM 'off' THEN
   RAISE EXCEPTION 'Marked isolated T19 database required';
 END IF;
 IF to_regprocedure('public.t19_workforce_leave_report(text,bigint[],date,date,date,text,integer,bigint,bigint,text[])') IS NULL THEN
   RAISE EXCEPTION 'The scoped T19 workforce report projection is missing';
 END IF;
END $test$;

-- Run after the guarded T04 regression before its fixture transaction is rolled back.
RESET ROLE;
SELECT set_config('request.jwt.claims','{}',true);

SET LOCAL session_replication_role=replica;
INSERT INTO public.employee_leave_balances(id,employee_id,leave_type_id,leave_year,entitled_days,used_days,carry_forward,period_start,period_end,period_basis)
 OVERRIDING SYSTEM VALUE VALUES(969191,920002,960001,2026,20,13,0,'2026-02-28','2027-02-27','joining_anniversary');
INSERT INTO public.employee_leave_requests(id,employee_id,leave_type_id,start_date,end_date,total_days,reason)
 OVERRIDING SYSTEM VALUE VALUES(969191,920001,960001,'2026-07-01','2026-07-07',7,'Private fixture reason');
INSERT INTO public.work_calendars(id,calendar_code,calendar_name,owner_company_id)
 OVERRIDING SYSTEM VALUE VALUES(969191,'T19-TIME','Synthetic report calendar',920001);
INSERT INTO public.work_shifts(id,shift_code,shift_name,calendar_id,shift_start_time,shift_end_time,is_overnight)
 OVERRIDING SYSTEM VALUE VALUES(969191,'EVENING','Synthetic evening',969191,'21:00','05:00',true);
INSERT INTO public.employee_shift_assignments(id,employee_id,work_calendar_id,work_shift_id,effective_from,effective_to)
 OVERRIDING SYSTEM VALUE VALUES(969191,920001,969191,969191,'2026-07-01','2026-07-30'),
  (969192,920001,969191,969191,'2026-07-02','2026-07-02');
INSERT INTO public.employee_attendance_daily_summary(id,employee_id,attendance_date,attendance_type,approval_status,
 total_hours,worked_minutes,entered_intervals,first_in_at,last_out_at)
 OVERRIDING SYSTEM VALUE VALUES
 (969191,920001,'2026-07-01','holiday','approved',0,0,'[]',NULL,NULL),
 (969192,920001,'2026-07-02','office','approved',NULL,NULL,NULL,NULL,NULL),
 (969193,920001,'2026-07-03','office','approved',7.5,NULL,NULL,NULL,NULL),
 (969194,920001,'2026-07-04','office','approved',6.52,391,'[{"start":"2026-07-04T22:00:00+04:00","end":"2026-07-05T04:31:00+04:00","breaks":[]}]',
    '2026-07-04T22:00:00+04:00','2026-07-05T04:31:00+04:00'),
 (969195,920001,erp_private.t04_today()+1,'office','pending',NULL,NULL,NULL,NULL,NULL);
SET LOCAL session_replication_role=origin;

WITH approved AS(
 INSERT INTO erp_private.t04_cases(employee_id,company_id,branch_id,employment_id,category,dates,
   status,revision,fingerprint,submitted_by,approved_by)
 SELECT e.employee_id,e.company_id,e.branch_id,e.id,'unpaid','[2026-07-03,2026-07-06)','approved',3,repeat('d',64),
   '96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002'
 FROM erp_private.t03_employment_periods e WHERE e.employee_id=920001 AND e.work_period @> '2026-07-03'::date RETURNING *
)
INSERT INTO erp_private.t04_days(case_id,employee_id,request_revision,day,policy_id,rate,state)
SELECT c.id,c.employee_id,1,v.day::date,(erp_private.t04_policy(c.company_id,c.employee_id,v.day::date)).id,0,'posted'
FROM approved c CROSS JOIN generate_series('2026-07-03'::date,'2026-07-05'::date,'1 day') v(day);

DO $workforce$
DECLARE today date:=erp_private.t04_today(); output jsonb; recorded jsonb; official jsonb; f jsonb;
 before_revision jsonb; after_revision jsonb; subject_profile bigint; assignment bigint;
BEGIN
 IF has_function_privilege('anon','public.t19_workforce_leave_report(text,bigint[],date,date,date,text,integer,bigint,bigint,text[])','EXECUTE')
    OR has_function_privilege('authenticated','public.t19_workforce_attendance_report(bigint[],date,date,date,bigint,text,integer,bigint,bigint,text[])','EXECUTE')
    OR has_function_privilege('authenticated','erp_private.t19_verified_leave_balance(bigint,bigint,bigint,date)','EXECUTE') THEN
   RAISE EXCEPTION 'Workforce report shortcut executes for a public role';
 END IF;
 SET LOCAL ROLE service_role;
 before_revision:=public.phase3_report_source_generations();
 output:=public.t19_workforce_leave_report('requests',ARRAY[920001]::bigint[],today,'2026-07-04','2026-07-05',NULL,30);
 IF jsonb_array_length(output)<>2 OR output::text LIKE '%Private fixture reason%'
    OR NOT output @> '[{"request_ref":"Legacy #969191","overlap_days":2,"allocated_days":null,"allocation_scope":"Not verified"}]'
    OR NOT output @> '[{"leave_type":"Unpaid leave","overlap_days":2,"allocated_days":2,"paid_allocated_days":0,"allocation_scope":"Posted"}]' THEN
   RAISE EXCEPTION 'Overlap or approved allocation differed: %',output;
 END IF;
 IF public.t19_workforce_leave_report('requests',ARRAY[]::bigint[],today,'2026-07-04','2026-07-05',NULL,30)<>'[]' THEN
   RAISE EXCEPTION 'A no-subject report had records';
 END IF;
 IF public.t19_workforce_leave_report('requests',ARRAY[920002]::bigint[],today,'2026-07-04','2026-07-05',NULL,30)<>'[]' THEN
   RAISE EXCEPTION 'A sibling-only admitted scope included another employee';
 END IF;
 output:=public.t19_workforce_leave_report('balances',ARRAY[920002]::bigint[],today,'2026-07-01','2026-07-31',NULL,30);
 SELECT frow INTO STRICT recorded FROM jsonb_array_elements(output) frow WHERE frow->>'balance_status'='Recorded only';
 SELECT frow INTO STRICT official FROM jsonb_array_elements(output) frow WHERE frow->>'balance_status'='Verified';
 IF recorded->'recorded_balance_days'='null' OR recorded->'verified_available_days'<>'null'
   OR official->'recorded_balance_days'<>'null' OR official->'pending_reservation_days'='null'
   OR official->>'as_of_date' IS DISTINCT FROM today::text THEN RAISE EXCEPTION 'Balance lanes collapsed: %',output; END IF;
 output:=public.t19_workforce_attendance_report(ARRAY[920001]::bigint[],today,'2026-07-01',today+1,NULL,NULL,10000);
 IF NOT output @> '[{"attendance_date":"2026-07-01","worked_minutes":0,"shift_name":"Synthetic evening","shift_context":"Dated assignment"}]'
  OR NOT output @> '[{"attendance_date":"2026-07-02","worked_minutes":null,"total_hours":null,"shift_name":null,"shift_context":"Conflicting assignments"}]'
  OR NOT output @> '[{"attendance_date":"2026-07-03","worked_minutes":null,"total_hours":7.5}]'
  OR NOT output @> '[{"attendance_date":"2026-07-04","worked_minutes":391}]'
  OR EXISTS(SELECT 1 FROM jsonb_array_elements(output) row WHERE (row->>'attendance_date')::date>today)
  OR public.t19_workforce_attendance_report(ARRAY[]::bigint[],today,NULL,NULL,NULL,NULL,30)<>'[]' THEN
   RAISE EXCEPTION 'Attendance exact work, shift or future clipping differed: %',output;
 END IF;
 BEGIN
   PERFORM public.t19_workforce_attendance_report(ARRAY[920001]::bigint[],today,'2026-07-01','2026-07-04',NULL,NULL,1);
   RAISE EXCEPTION 'Oversized export omitted rows'; EXCEPTION WHEN program_limit_exceeded THEN NULL;
 END;
 BEGIN
   PERFORM public.t19_workforce_leave_report('balances',ARRAY[]::bigint[],today-1,NULL,NULL,NULL,30);
   RAISE EXCEPTION 'Stale date exported as current'; EXCEPTION WHEN invalid_parameter_value THEN NULL;
 END;
 RESET ROLE;
 SET LOCAL ROLE authenticated;
 PERFORM pg_temp.t04_actor(1);
 f:=public.t04_leave_balance(920002,today);
 IF f->'available' IS DISTINCT FROM official->'verified_available_days'
    OR f->'reserved' IS DISTINCT FROM official->'pending_reservation_days' THEN
   RAISE EXCEPTION 'Employee and Report Center use different current balances';
 END IF;
 BEGIN
   PERFORM public.t19_workforce_leave_report('requests',ARRAY[920001]::bigint[],today,NULL,NULL,NULL,30);
   RAISE EXCEPTION 'Employee impersonated the sealed report collection'; EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 RESET ROLE;
 PERFORM set_config('request.jwt.claims','{}',true);
 UPDATE public.employee_shift_assignments SET notes='Changed after report opened' WHERE id=969191;
 SET LOCAL ROLE service_role;
 after_revision:=public.phase3_report_source_generations();
 IF after_revision->'employee_shift_assignments' IS NOT DISTINCT FROM before_revision->'employee_shift_assignments' THEN
   RAISE EXCEPTION 'Changed shift did not invalidate a report';
 END IF;
 RESET ROLE;
 IF (SELECT count(*) FROM public.erp_report_registry r WHERE r.report_code IN('HR_ATTENDANCE_SUMMARY','HR_LEAVE_BALANCE','HR_LEAVE_REQUESTS')
       AND (r.filter_schema_json->'filters') ? 'branch_id')<>3 THEN
   RAISE EXCEPTION 'Branch is still missing from a normal Report Center filter';
 END IF;
 SELECT user_profile_id,id INTO STRICT subject_profile,assignment FROM public.user_roles
  WHERE role_id=(SELECT id FROM public.roles WHERE role_code='t04_pro');
 SET LOCAL ROLE service_role;
 IF jsonb_array_length(public.t19_workforce_grants(subject_profile))=0 THEN RAISE EXCEPTION 'Active grant missing'; END IF;
 RESET ROLE;
 INSERT INTO erp_private.t02_role_validity(assignment_id,valid_until) VALUES(assignment,clock_timestamp()-interval '1 minute');
 SET LOCAL ROLE service_role;
 IF jsonb_array_length(public.t19_workforce_grants(subject_profile))<>0 THEN RAISE EXCEPTION 'An expired grant survived the Report Center guard'; END IF;
 RESET ROLE;
 SET LOCAL session_replication_role=replica;
 UPDATE public.employees SET branch_id=920012 WHERE id=920001;
 SET LOCAL session_replication_role=origin;
 SET LOCAL ROLE service_role;
 output:=public.t19_workforce_leave_report('requests',ARRAY[920001]::bigint[],today,'2026-07-04','2026-07-05',NULL,30,920001,920011,ARRAY['920001:920011']);
 IF jsonb_array_length(output)<>2 OR EXISTS(SELECT 1 FROM jsonb_array_elements(output) item WHERE item->>'branch_id'<>'920011')
   OR public.t19_workforce_leave_report('requests',ARRAY[920001]::bigint[],today,'2026-07-04','2026-07-05',NULL,30,920001,920011,ARRAY['920001:920012'])<>'[]' THEN
  RAISE EXCEPTION 'Dated leave scopes did not retain earlier authorized records or deny the receiving branch';
 END IF;
 output:=public.t19_workforce_attendance_report(ARRAY[920001]::bigint[],today,'2026-07-01','2026-07-04',NULL,NULL,30,920001,920011,ARRAY['920001:920011']);
 IF jsonb_array_length(output)<>4 OR EXISTS(SELECT 1 FROM jsonb_array_elements(output) item WHERE item->>'branch_id'<>'920011')
  OR public.t19_workforce_attendance_report(ARRAY[920001]::bigint[],today,'2026-07-01','2026-07-04',NULL,NULL,30,920001,920011,ARRAY['920001:920012'])<>'[]' THEN
   RAISE EXCEPTION 'Dated attendance omitted old authorized work or leaked to the new branch';
 END IF;
 RESET ROLE;
 RAISE NOTICE 'T19 report facts passed: overlap, posted zero rate, masked reasons, recorded versus verified leave, Dubai attendance, dated branch history, grant expiry and source fence.';
END $workforce$;
