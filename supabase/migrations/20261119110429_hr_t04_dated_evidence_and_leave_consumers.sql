BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

ALTER TABLE erp_private.t04_sick_evidence ADD COLUMN covered_dates daterange NOT NULL,
 ADD COLUMN medical_digest text NOT NULL;
CREATE TABLE erp_private.t04_case_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id bigint NOT NULL REFERENCES erp_private.t04_cases(id),
 actor uuid NOT NULL,
 operation_id uuid NOT NULL,
 action text NOT NULL,
 revision bigint NOT NULL,
 input jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor,operation_id)
);
ALTER TABLE erp_private.t04_case_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t04_case_events FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.t04_preview_leave_revision(p_employee bigint,p_case bigint,p_from date,p_to date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE employee public.employees;
DECLARE request erp_private.t04_cases;
BEGIN
 employee:=erp_private.t04_scope(p_employee,ARRAY['hr.leave.assist']);
 SELECT * INTO request FROM erp_private.t04_cases WHERE id=p_case AND employee_id=p_employee AND company_id=employee.owner_company_id
  AND branch_id IS NOT DISTINCT FROM employee.branch_id AND status IN('pending','reviewed');
 IF request.id IS NULL THEN RAISE EXCEPTION 'Current pending request required' USING ERRCODE='42501'; END IF;
 RETURN erp_private.t04_quote(p_employee,request.category,p_from,p_to,p_case);
END;
$$;

CREATE FUNCTION public.t04_list_leave_requests(p_employee bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE employee public.employees;
BEGIN
 employee:=erp_private.t04_scope(p_employee,ARRAY['hr.leave.assist','hr.leave.approve','hr.leave.sick.review','hr.leave.view']);
 RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'category',r.category,'status',r.status,'from',lower(r.dates),
   'to',upper(r.dates)-1) ORDER BY r.id DESC),'[]'::jsonb) FROM (
  SELECT id,category,status,dates FROM erp_private.t04_cases WHERE employee_id=p_employee AND company_id=employee.owner_company_id
   AND branch_id IS NOT DISTINCT FROM employee.branch_id ORDER BY id DESC LIMIT 25) r);
END;
$$;

CREATE FUNCTION erp_private.t04_approved_leave_day(p_employee bigint,p_day date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.employee_permission(p_employee,'hr.attendance.view') AND EXISTS(
  SELECT 1 FROM erp_private.t04_days d JOIN erp_private.t04_cases r ON r.id=d.case_id
   JOIN erp_private.t03_employment_periods ep ON ep.id=r.employment_id AND ep.work_period @> d.day
   WHERE d.employee_id=p_employee AND d.day=p_day AND d.state='posted' AND r.status='approved');
$$;

DO $$
DECLARE original text;
DECLARE revised text;
BEGIN
 original:=pg_get_functiondef('erp_private.t04_quote(bigint,text,date,date,bigint)'::regprocedure);
 revised:=replace(original,$old$DECLARE facts jsonb:='[]'::jsonb;$old$,
  $new$DECLARE facts jsonb:='[]'::jsonb;
DECLARE funding jsonb:='{}'::jsonb;$new$);
 IF revised=original THEN RAISE EXCEPTION 'Invalid leave quote predecessor'; END IF;
 original:=revised;
 revised:=replace(original,$old$ IF employment.id IS NULL OR employee.owner_company_id<>employment.company_id$old$,
 $new$ IF employee.employee_status NOT IN('active','probation','on_leave') OR employment.id IS NULL OR employee.owner_company_id<>employment.company_id$new$);
 IF revised=original THEN RAISE EXCEPTION 'Invalid employment quote predecessor'; END IF;
 original:=revised;
 revised:=replace(original,
  $old$  RETURN jsonb_build_object('status','review-required','reason','Recorded attendance overlaps these dates.');
 END IF;$old$,
  $new$  RETURN jsonb_build_object('status','review-required','reason','Recorded attendance overlaps these dates.');
 END IF;
 IF EXISTS(SELECT 1 FROM public.employee_attendance_daily_summary a CROSS JOIN LATERAL jsonb_array_elements(a.entered_intervals) i
   WHERE a.employee_id=p_employee AND a.attendance_date=p_from-1 AND (i->>'end')::timestamptz>(p_from::timestamp AT TIME ZONE 'Asia/Dubai')) THEN
  RETURN jsonb_build_object('status','review-required','reason','Overnight attendance overlaps the requested leave.');
 END IF;$new$);
 IF revised=original THEN RAISE EXCEPTION 'Invalid attendance check predecessor'; END IF;
 original:=revised;
 revised:=replace(original,
 $old$   IF p_category='annual' AND d>=$old$,
 $new$   IF p_category='annual' AND NOT funding ? entitlement.id::text THEN
    funding:=funding||jsonb_build_object(entitlement.id::text,jsonb_build_object(
      'opening_id',entitlement.setup_id,'cutoff',entitlement.cutoff,
      'own_available',erp_private.t04_funds_remaining(entitlement.id,NULL,today,p_exclude),
      'carry',coalesce((SELECT jsonb_agg(jsonb_build_array(m.id,erp_private.t04_funds_remaining(entitlement.id,m.id,today,p_exclude))
        ORDER BY m.id) FROM erp_private.f12_leave_movements m
        WHERE m.entitlement_id=entitlement.id AND m.effect='carry-in' AND m.expires_before>today),'[]'::jsonb)));
   END IF;
   IF p_category='annual' AND d>=$new$);
 IF revised=original THEN RAISE EXCEPTION 'Invalid funding quote predecessor'; END IF;
 original:=revised;
 revised:=replace(original,
 $old$'from',p_from,'to',p_to,'days',facts,$old$,
 $new$'from',p_from,'to',p_to,'days',facts,'funding',funding,$new$);
 IF revised=original THEN RAISE EXCEPTION 'Invalid funding snapshot predecessor'; END IF;
 EXECUTE revised;

 original:=pg_get_functiondef('erp_private.t04_current_evidence(bigint,bigint)'::regprocedure);
 revised:=replace(original,$old$ IF evidence.id IS NULL THEN RETURN false; END IF;$old$,
  $new$ IF evidence.id IS NULL OR NOT EXISTS(SELECT 1 FROM erp_private.t04_cases c WHERE c.id=p_case AND c.dates=evidence.covered_dates) THEN
  RETURN false; END IF;$new$);
 IF revised=original THEN RAISE EXCEPTION 'Invalid dated evidence predecessor'; END IF;
 original:=revised;
 revised:=replace(original,$old$   AND f.file_size_bytes>0 AND f.sha256_hash=evidence.file_digest$old$,
  $new$   AND f.file_size_bytes>0 AND f.sha256_hash=evidence.file_digest
   AND erp_private.t02_digest(to_jsonb(r))=evidence.medical_digest$new$);
 IF revised=original THEN RAISE EXCEPTION 'Invalid evidence fingerprint predecessor'; END IF;
 EXECUTE revised;
 original:=pg_get_functiondef('public.t04_verify_sick_evidence(bigint,bigint,bigint,bigint,bigint,uuid)'::regprocedure);
 revised:=replace(original,$old$f.sha256_hash,h.id AS verification_id INTO certificate$old$,
  $new$f.sha256_hash,h.id AS verification_id,erp_private.t02_digest(to_jsonb(m)) AS medical_digest INTO certificate$new$);
 IF revised=original THEN RAISE EXCEPTION 'Invalid evidence review predecessor'; END IF;
 original:=revised;
 revised:=replace(original,$old$  AND v.id=p_version AND v.unlinked_at IS NULL$old$,
  $new$  AND request.dates @> m.examination_date AND v.id=p_version AND v.unlinked_at IS NULL$new$);
 IF revised=original THEN RAISE EXCEPTION 'Invalid certificate coverage predecessor'; END IF;
 original:=revised;
 revised:=replace(original,$old$verification_id,actor,operation_id)$old$,
  $new$verification_id,actor,operation_id,covered_dates,medical_digest)$new$);
 IF revised=original THEN RAISE EXCEPTION 'Invalid evidence record predecessor'; END IF;
 original:=revised;
 revised:=replace(original,$old$certificate.verification_id,auth.uid(),p_operation);$old$,
  $new$certificate.verification_id,auth.uid(),p_operation,request.dates,certificate.medical_digest);$new$);
 IF revised=original THEN RAISE EXCEPTION 'Invalid evidence snapshot predecessor'; END IF;
 EXECUTE revised;

 original:=pg_get_functiondef('public.t04_leave_command(bigint,bigint,text,jsonb,uuid)'::regprocedure);
 revised:=replace(original,$old$ RETURN erp_private.t02_save_receipt('assisted-leave',p_operation,hashed,$old$,
  $new$ INSERT INTO erp_private.t04_case_events(case_id,actor,operation_id,action,revision,input)
 VALUES(request.id,auth.uid(),p_operation,p_action,request.revision,p_data);
 RETURN erp_private.t02_save_receipt('assisted-leave',p_operation,hashed,$new$);
 IF revised=original THEN RAISE EXCEPTION 'Invalid leave audit predecessor'; END IF;
 EXECUTE revised;

 original:=pg_get_functiondef('public.t04_pay_leave(bigint,date,date)'::regprocedure);
 revised:=replace(original,$old$ -- Check every recorded scope$old$,
  $new$ PERFORM 1 FROM public.employees WHERE id=p_employee FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Leave payroll scope unavailable' USING ERRCODE='42501'; END IF;
 -- Check every recorded scope$new$);
 IF revised=original THEN RAISE EXCEPTION 'Invalid payroll read predecessor'; END IF;
 EXECUTE revised;

 original:=pg_get_functiondef('public.t04_approve_leave_setup(bigint,text,uuid)'::regprocedure);
 revised:=replace(original,$old$ hashed:=erp_private.t02_digest(jsonb_build_array('approve-setup',p_id,p_digest));$old$,
  $new$ IF entry.employee_id IS NOT NULL AND NOT EXISTS(
  SELECT 1 FROM public.employees e WHERE e.id=entry.employee_id AND e.owner_company_id=entry.company_id
   AND e.branch_id IS NOT DISTINCT FROM entry.branch_id AND e.deleted_at IS NULL FOR SHARE) THEN
  RAISE EXCEPTION 'The employee scope changed' USING ERRCODE='42501'; END IF;
 hashed:=erp_private.t02_digest(jsonb_build_array('approve-setup',p_id,p_digest));$new$);
 IF revised=original THEN RAISE EXCEPTION 'Invalid balance receipt predecessor'; END IF;
 original:=revised;
 revised:=replace(original,
  $old$     OR (entry.facts->>'earned')::numeric NOT BETWEEN 0 AND full_days$old$,
  $new$     OR (entry.facts->>'earned')::numeric<>round((entry.facts->>'earned')::numeric,2)
     OR (entry.facts->>'annual_used')::numeric<>round((entry.facts->>'annual_used')::numeric,2)
     OR (entry.facts->>'earned')::numeric NOT BETWEEN 0 AND full_days$new$);
 IF revised=original THEN RAISE EXCEPTION 'Invalid opening precision predecessor'; END IF;
 EXECUTE revised;

 original:=pg_get_functiondef('erp_private.f12_attendance_context(bigint,date)'::regprocedure);
 revised:=replace(original,'end_date>=p_date)INTO approved_leave;',
  'end_date>=p_date) OR erp_private.t04_approved_leave_day(p_employee,p_date) INTO approved_leave;');
 IF revised=original THEN RAISE EXCEPTION 'Invalid leave/attendance context predecessor'; END IF;
 EXECUTE revised;
 original:=pg_get_functiondef('public.f12_attendance_roster(date,bigint,bigint,bigint,bigint,bigint,text,integer,boolean,text)'::regprocedure);
 revised:=replace(original,
  $old$OR p_state='approved_leave'AND EXISTS(SELECT 1 FROM public.employee_leave_requests l WHERE l.employee_id=e.id AND l.deleted_at IS NULL AND l.approval_status='approved'AND l.start_date<=p_date AND l.end_date>=p_date)$old$,
  $new$OR p_state='approved_leave'AND (erp_private.t04_approved_leave_day(e.id,p_date) OR EXISTS(SELECT 1 FROM public.employee_leave_requests l WHERE l.employee_id=e.id AND l.deleted_at IS NULL AND l.approval_status='approved'AND l.start_date<=p_date AND l.end_date>=p_date))$new$);
 IF revised=original THEN RAISE EXCEPTION 'Invalid leave roster predecessor'; END IF;
 EXECUTE revised;
 original:=pg_get_functiondef('erp_private.f12_admit_attendance(jsonb)'::regprocedure);
 revised:=replace(original,$old$ IF(kind IN('absent','holiday','on_leave'))$old$,
  $new$ IF EXISTS(SELECT 1 FROM jsonb_array_elements(data->'intervals') i
   WHERE (i->>'end')::timestamptz>((day+1)::timestamp AT TIME ZONE 'Asia/Dubai')
    AND erp_private.t04_approved_leave_day(employee,day+1)) THEN
  RAISE EXCEPTION 'Actual overnight interval intersects approved assisted leave' USING ERRCODE='23514'; END IF;
 IF(kind IN('absent','holiday','on_leave'))$new$);
 IF revised=original THEN RAISE EXCEPTION 'Invalid overnight leave admission predecessor'; END IF;
 EXECUTE revised;
END;
$$;

CREATE OR REPLACE FUNCTION erp_private.t04_guard_legacy_leave()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF (EXISTS(SELECT 1 FROM erp_private.t04_periods p JOIN public.hr_leave_types t ON t.id=NEW.leave_type_id
      WHERE p.employee_id=NEW.employee_id AND t.code IN('ANNUAL','UNPAID','SICK')
       AND NEW.start_date<upper(p.coverage) AND NEW.end_date>=lower(p.coverage))
    OR EXISTS(SELECT 1 FROM erp_private.t04_days d WHERE d.employee_id=NEW.employee_id
      AND d.state IN('reserved','posted') AND d.day BETWEEN NEW.start_date AND NEW.end_date))
  AND (TG_OP='INSERT' OR ROW(OLD.approval_status,OLD.start_date,OLD.end_date,OLD.deleted_at)
          IS DISTINCT FROM ROW(NEW.approval_status,NEW.start_date,NEW.end_date,NEW.deleted_at)) THEN
   RAISE EXCEPTION 'Use the reviewed assisted leave workflow for this period' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.t04_preview_leave_revision(bigint,bigint,date,date),public.t04_list_leave_requests(bigint),
 erp_private.t04_approved_leave_day(bigint,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t04_preview_leave_revision(bigint,bigint,date,date),public.t04_list_leave_requests(bigint),
 erp_private.t04_approved_leave_day(bigint,date) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
