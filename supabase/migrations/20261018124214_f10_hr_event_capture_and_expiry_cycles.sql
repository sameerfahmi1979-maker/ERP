BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
CREATE FUNCTION erp_private.f10_capture_hr_event() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE n jsonb:=to_jsonb(NEW); old_row jsonb; relevant jsonb; kind text; key text;
BEGIN
 IF n->>'deleted_at' IS NOT NULL THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' THEN old_row:=to_jsonb(OLD); END IF;
 CASE TG_TABLE_NAME
 WHEN 'employee_leave_requests' THEN relevant:=jsonb_build_object('approval_status',n->'approval_status');kind:='leave_'||(n->>'approval_status');
 WHEN 'employee_attendance_corrections' THEN relevant:=jsonb_build_object('id',NEW.id);kind:='attendance_corrected';
 WHEN 'employee_salary_revisions' THEN relevant:=jsonb_build_object('id',NEW.id);kind:='salary_revision_recorded';
 WHEN 'employee_payroll_holds' THEN relevant:=jsonb_build_object('is_active',n->'is_active');kind:=CASE WHEN (n->>'is_active')::boolean THEN 'payroll_hold_recorded' ELSE 'payroll_hold_released' END;
 WHEN 'employee_approval_requests' THEN relevant:=jsonb_build_object('request_status',n->'request_status');kind:='employee_request_'||(n->>'request_status');
 WHEN 'hr_interviews' THEN relevant:=jsonb_build_object('interview_status',n->'interview_status','interview_datetime',n->'interview_datetime','interviewer_id',n->'interviewer_id');kind:='interview_changed';
 WHEN 'hr_offers' THEN relevant:=jsonb_build_object('offer_status',n->'offer_status');kind:='offer_'||(n->>'offer_status');
 WHEN 'hr_onboarding_tasks' THEN relevant:=jsonb_build_object('task_status',n->'task_status','assigned_to',n->'assigned_to','due_date',n->'due_date');kind:='onboarding_task_changed';
 ELSE RAISE EXCEPTION 'Unsupported HR event source' USING ERRCODE='22023';
 END CASE;
 IF TG_OP='UPDATE' AND NOT EXISTS(SELECT 1 FROM jsonb_each(relevant) f WHERE f.value IS DISTINCT FROM old_row->f.key) THEN RETURN NEW; END IF;
 -- One identity per committed trigger occurrence, not a status/timestamp hash:
 -- repeated transitions in one transaction can share updated_at legitimately.
 key:=TG_TABLE_NAME||':'||NEW.id||':'||pg_catalog.gen_random_uuid()::text;
 -- Snapshot only routing facts. No salaries, medical text, reasons or names.
 INSERT INTO erp_private.notification_events(event_key,source_table,source_id,event_type,actor_id,source_snapshot)
 VALUES(key,TG_TABLE_NAME,NEW.id,kind,coalesce((n->>'updated_by')::bigint,(n->>'created_by')::bigint,(n->>'corrected_by')::bigint),
  relevant||jsonb_build_object('employee_id',n->'employee_id','candidate_id',n->'candidate_id',
   'assigned_to',coalesce(n->'assigned_to',n->'interviewer_id'),'approval_request_id',n->'approval_request_id'))
 ON CONFLICT(event_key) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION erp_private.f10_capture_hr_event() FROM PUBLIC,anon,authenticated,service_role;
CREATE TRIGGER f10_leave_event AFTER INSERT OR UPDATE OF approval_status ON public.employee_leave_requests FOR EACH ROW EXECUTE FUNCTION erp_private.f10_capture_hr_event();
CREATE TRIGGER f10_attendance_event AFTER INSERT ON public.employee_attendance_corrections FOR EACH ROW EXECUTE FUNCTION erp_private.f10_capture_hr_event();
CREATE TRIGGER f10_salary_event AFTER INSERT ON public.employee_salary_revisions FOR EACH ROW EXECUTE FUNCTION erp_private.f10_capture_hr_event();
CREATE TRIGGER f10_payroll_hold_event AFTER INSERT OR UPDATE OF is_active ON public.employee_payroll_holds FOR EACH ROW EXECUTE FUNCTION erp_private.f10_capture_hr_event();
CREATE TRIGGER f10_employee_request_event AFTER INSERT OR UPDATE OF request_status ON public.employee_approval_requests FOR EACH ROW EXECUTE FUNCTION erp_private.f10_capture_hr_event();
CREATE TRIGGER f10_interview_event AFTER INSERT OR UPDATE OF interview_status,interview_datetime,interviewer_id ON public.hr_interviews FOR EACH ROW EXECUTE FUNCTION erp_private.f10_capture_hr_event();
CREATE TRIGGER f10_offer_event AFTER INSERT OR UPDATE OF offer_status ON public.hr_offers FOR EACH ROW EXECUTE FUNCTION erp_private.f10_capture_hr_event();
CREATE TRIGGER f10_onboarding_event AFTER INSERT OR UPDATE OF task_status,assigned_to,due_date ON public.hr_onboarding_tasks FOR EACH ROW EXECUTE FUNCTION erp_private.f10_capture_hr_event();

CREATE FUNCTION public.f10_collect_hr_expiry_events(batch_limit integer DEFAULT 200) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE inserted bigint; today date:=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date;
BEGIN
 IF $1 IS NULL OR $1<1 OR $1>500 THEN RAISE EXCEPTION 'Invalid expiry batch' USING ERRCODE='22023'; END IF;
 WITH sources AS (
  SELECT 'employee_identity_documents'::text source_table,d.id,d.employee_id,d.expiry_date
   FROM public.employee_identity_documents d JOIN public.employees e ON e.id=d.employee_id
   WHERE d.deleted_at IS NULL AND d.status IN ('active','expired') AND e.deleted_at IS NULL AND e.employee_status='active' AND d.expiry_date IS NOT NULL
  UNION ALL
  SELECT 'employee_medical_insurances',d.id,d.employee_id,d.expiry_date
   FROM public.employee_medical_insurances d JOIN public.employees e ON e.id=d.employee_id
   WHERE d.deleted_at IS NULL AND d.status IN ('active','expired') AND e.deleted_at IS NULL AND e.employee_status='active' AND d.expiry_date IS NOT NULL
 ), eligible AS (
  SELECT s.*,source_table||':'||id||':expiry:'||expiry_date||':'||
   CASE WHEN expiry_date<today THEN 'overdue' ELSE 'before:'||(expiry_date-today)::text END AS event_key
  FROM sources s WHERE expiry_date<today OR expiry_date-today=ANY(ARRAY[90,60,30,14,7,1,0])
 ), pending AS (
  SELECT s.* FROM eligible s WHERE NOT EXISTS(SELECT 1 FROM erp_private.notification_events e WHERE e.event_key=s.event_key)
  ORDER BY s.expiry_date,s.source_table,s.id LIMIT $1
 ), saved AS (
  INSERT INTO erp_private.notification_events(event_key,source_table,source_id,event_type,source_snapshot)
  SELECT event_key,source_table,id,CASE WHEN expiry_date<today THEN 'compliance_expired' ELSE 'compliance_expiry_reminder' END,
   jsonb_build_object('employee_id',employee_id,'expiry_date',expiry_date,'days_remaining',expiry_date-today)
  FROM pending ON CONFLICT(event_key) DO NOTHING RETURNING id
 ) SELECT count(*) INTO inserted FROM saved;
 RETURN inserted;
END $$;
REVOKE ALL ON FUNCTION public.f10_collect_hr_expiry_events(integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.f10_collect_hr_expiry_events(integer) TO service_role;
-- Expand canonical target resolution without trusting notification.action_url.
CREATE OR REPLACE FUNCTION public.f10_notification_target(source_type text,source_id bigint) RETURNS text
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE employee_id bigint; document_id bigint; candidate_id bigint; company_id bigint;
BEGIN
 IF NOT erp_private.business_principal_is_active() OR $2 IS NULL OR $2<1 THEN RETURN NULL; END IF;
 IF $1='dms_documents' THEN
  IF public.current_user_can_view_dms_document($2) THEN RETURN '/dms/documents/record/'||$2; END IF;
 ELSIF $1='dms_review_queue' THEN
  SELECT q.document_id INTO document_id FROM public.dms_review_queue q WHERE q.id=$2 AND q.deleted_at IS NULL;
  IF document_id IS NOT NULL AND public.current_user_can_view_dms_document(document_id) THEN RETURN '/dms/documents/record/'||document_id; END IF;
 ELSIF $1='erp_report_templates' THEN
  SELECT b.owner_company_id INTO company_id FROM public.erp_report_templates t
   LEFT JOIN public.erp_report_branding_profiles b ON b.id=t.branding_profile_id WHERE t.id=$2 AND t.deleted_at IS NULL;
  IF FOUND AND (erp_private.permission_in_scope('reports.template.approve',company_id,NULL)
    OR erp_private.permission_in_scope('reports.manage',company_id,NULL)) THEN
   RETURN '/admin/reports/templates/governance?template_id='||$2;
  END IF;
 ELSE
  CASE $1
  WHEN 'employees' THEN employee_id:=$2;
  WHEN 'employee_identity_documents' THEN SELECT d.employee_id INTO employee_id FROM public.employee_identity_documents d WHERE d.id=$2 AND d.deleted_at IS NULL;
  WHEN 'employee_medical_insurances' THEN SELECT d.employee_id INTO employee_id FROM public.employee_medical_insurances d WHERE d.id=$2 AND d.deleted_at IS NULL;
  WHEN 'employee_leave_requests' THEN SELECT d.employee_id INTO employee_id FROM public.employee_leave_requests d WHERE d.id=$2 AND d.deleted_at IS NULL;
  WHEN 'employee_attendance_corrections' THEN SELECT d.employee_id INTO employee_id FROM public.employee_attendance_corrections d WHERE d.id=$2;
  WHEN 'employee_salary_revisions' THEN SELECT d.employee_id INTO employee_id FROM public.employee_salary_revisions d WHERE d.id=$2;
  WHEN 'employee_payroll_holds' THEN SELECT d.employee_id INTO employee_id FROM public.employee_payroll_holds d WHERE d.id=$2 AND d.deleted_at IS NULL;
  WHEN 'employee_approval_requests' THEN SELECT d.employee_id INTO employee_id FROM public.employee_approval_requests d WHERE d.id=$2 AND d.deleted_at IS NULL;
  WHEN 'hr_candidates' THEN candidate_id:=$2;
  WHEN 'hr_interviews' THEN SELECT d.candidate_id INTO candidate_id FROM public.hr_interviews d WHERE d.id=$2 AND d.deleted_at IS NULL;
  WHEN 'hr_offers' THEN SELECT d.candidate_id INTO candidate_id FROM public.hr_offers d WHERE d.id=$2 AND d.deleted_at IS NULL;
  WHEN 'hr_onboarding_tasks' THEN SELECT d.employee_id,d.candidate_id INTO employee_id,candidate_id FROM public.hr_onboarding_tasks d WHERE d.id=$2 AND d.deleted_at IS NULL;
  ELSE RETURN NULL;
  END CASE;
  IF employee_id IS NOT NULL THEN
   IF NOT public.current_user_can_view_employee(employee_id) THEN RETURN NULL; END IF;
   IF $1='employee_identity_documents' AND NOT erp_private.employee_permission(employee_id,'hr.compliance.view') THEN RETURN NULL; END IF;
   IF $1='employee_leave_requests' AND NOT (erp_private.employee_permission(employee_id,'hr.leave.view') OR erp_private.employee_permission(employee_id,'hr.leave.manage')) THEN RETURN NULL; END IF;
   IF $1='employee_attendance_corrections' AND NOT erp_private.employee_permission(employee_id,'hr.attendance.view') THEN RETURN NULL; END IF;
   IF $1='employee_approval_requests' AND NOT erp_private.employee_permission(employee_id,'hr.actions.view') THEN RETURN NULL; END IF;
   IF $1='employee_medical_insurances' AND NOT public.current_user_can_view_employee_medical(employee_id) THEN RETURN NULL; END IF;
   IF $1 IN ('employee_salary_revisions','employee_payroll_holds') AND NOT public.current_user_can_view_employee_payroll(employee_id) THEN RETURN NULL; END IF;
   IF $1='hr_onboarding_tasks' AND NOT erp_private.onboarding_permission(candidate_id,employee_id,'hr.recruitment.view') THEN RETURN NULL; END IF;
   RETURN '/admin/hr/employees/record/'||employee_id;
  END IF;
  IF candidate_id IS NOT NULL AND erp_private.candidate_permission(candidate_id,'hr.recruitment.view') THEN
   RETURN '/admin/hr/recruitment/candidates/record/'||candidate_id;
  END IF;
 END IF;
 RETURN NULL;
END $$;
DROP POLICY f10_current_source_visibility ON public.erp_notifications;
CREATE POLICY f10_current_source_visibility ON public.erp_notifications AS RESTRICTIVE FOR SELECT TO authenticated USING (
 source_entity_type IS NULL OR source_entity_type NOT IN ('dms_documents','dms_review_queue','erp_report_templates',
 'employees','employee_identity_documents','employee_medical_insurances','employee_leave_requests','employee_attendance_corrections',
 'employee_salary_revisions','employee_payroll_holds','employee_approval_requests','hr_candidates','hr_interviews','hr_offers','hr_onboarding_tasks')
 OR public.f10_notification_target(source_entity_type,source_entity_id) IS NOT NULL);
NOTIFY pgrst,'reload schema';
COMMIT;
