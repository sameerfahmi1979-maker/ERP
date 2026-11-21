BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE FUNCTION erp_private.mobile_hr_v5_active() RETURNS void
LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
  IF auth.uid() IS NULL OR public.f03_current_session_valid() IS NOT TRUE OR erp_private.business_principal_is_active() IS NOT TRUE THEN
    RAISE EXCEPTION 'Active ERP session required' USING ERRCODE='42501';
  END IF;
END $$;

CREATE FUNCTION erp_private.mobile_hr_v5_calendar(p_from date,p_to date,p_page integer,p_company bigint,p_branch bigint,p_employee bigint,p_search text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM erp_private.mobile_hr_v5_active();
  IF p_from IS NULL OR p_to IS NULL OR p_to-p_from NOT BETWEEN 0 AND 92 OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 OR p_search IS NULL OR length(p_search)>100 THEN
    RAISE EXCEPTION 'Invalid calendar window' USING ERRCODE='22023';
  END IF;
  IF p_employee IS NOT NULL AND erp_private.employee_permission(p_employee,'hr.leave.view') IS NOT TRUE THEN
    RAISE EXCEPTION 'Leave access required' USING ERRCODE='42501';
  END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."startDate",x.id),'[]') FROM (
    SELECT l.id,e.id AS "employeeId",e.full_name_en AS "employeeLabel",l.start_date AS "startDate",
      l.end_date AS "endDate",l.approval_status AS status,t.name_en AS label
    FROM public.employee_leave_requests l JOIN public.employees e ON e.id=l.employee_id
      JOIN public.hr_leave_types t ON l.leave_type_id=t.id
    WHERE l.deleted_at IS NULL AND e.deleted_at IS NULL AND l.start_date<=p_to AND l.end_date>=p_from
      AND erp_private.employee_permission(e.id,'hr.leave.view') AND (p_employee IS NULL OR p_employee=e.id)
      AND (p_company IS NULL OR e.owner_company_id=p_company) AND (p_branch IS NULL OR e.branch_id=p_branch)
      AND strpos(lower(e.full_name_en||' '||e.employee_code),lower(p_search))>0
    ORDER BY l.start_date,l.id LIMIT 26 OFFSET (p_page-1)*25) x);
END $$;

CREATE FUNCTION public.mobile_hr_v5_calendar(p_from date,p_to date,p_page integer,p_company bigint,p_branch bigint,p_employee bigint,p_search text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
 SELECT erp_private.mobile_hr_v5_calendar(p_from,p_to,p_page,p_company,p_branch,p_employee,p_search)
$$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_v5_calendar(date,date,integer,bigint,bigint,bigint,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.mobile_hr_v5_calendar(date,date,integer,bigint,bigint,bigint,text) TO authenticated;

CREATE FUNCTION erp_private.mobile_hr_v5_directory_choices(p_kind text,p_company bigint,p_branch bigint,p_search text,p_after bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  PERFORM erp_private.mobile_hr_v5_active();
  IF p_kind IS NULL OR p_kind NOT IN ('company','branch','department','designation','site','status') OR p_search IS NULL OR length(p_search)>100 OR p_after IS NULL OR p_after<0 THEN
    RAISE EXCEPTION 'Invalid directory filter' USING ERRCODE='22023';
  END IF;
  RETURN (WITH visible AS (
    SELECT DISTINCT CASE p_kind WHEN 'company' THEN e.owner_company_id WHEN 'branch' THEN e.branch_id
      WHEN 'department' THEN e.department_id WHEN 'designation' THEN e.designation_id WHEN 'site' THEN e.primary_work_site_id ELSE 0 END AS id,
      CASE p_kind WHEN 'company' THEN c.legal_name_en WHEN 'branch' THEN b.branch_name_en WHEN 'department' THEN d.department_name_en
        WHEN 'designation' THEN t.designation_name_en WHEN 'site' THEN s.site_name ELSE e.employee_status END AS label
    FROM public.employees e LEFT JOIN public.owner_companies c ON c.id=e.owner_company_id
      LEFT JOIN public.branches b ON b.id=e.branch_id AND b.owner_company_id=e.owner_company_id
      LEFT JOIN public.departments d ON d.id=e.department_id LEFT JOIN public.designations t ON t.id=e.designation_id
      LEFT JOIN public.work_sites s ON s.id=e.primary_work_site_id
    WHERE e.deleted_at IS NULL AND public.current_user_can_view_employee(e.id)
      AND (p_company IS NULL OR e.owner_company_id=p_company) AND (p_branch IS NULL OR e.branch_id=p_branch)
  ) SELECT coalesce(jsonb_agg(jsonb_build_object('value',CASE WHEN p_kind='status' THEN x.label ELSE x.id::text END,'label',x.label) ORDER BY x.id,x.label),'[]')
    FROM (SELECT v.* FROM visible v WHERE (p_kind='status' OR v.id>p_after) AND v.label IS NOT NULL AND strpos(lower(v.label),lower(p_search))>0
      ORDER BY v.id,v.label LIMIT CASE WHEN p_kind='status' THEN NULL ELSE 26 END) x);
END $$;

CREATE OR REPLACE FUNCTION public.mobile_hr_v5_directory_choices(p_kind text,p_company bigint,p_branch bigint,p_search text,p_after bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.mobile_hr_v5_directory_choices(p_kind,p_company,p_branch,p_search,p_after) $$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_v5_directory_choices(text,bigint,bigint,text,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.mobile_hr_v5_directory_choices(text,bigint,bigint,text,bigint) TO authenticated;

-- Own employees may read only an employee-bound onboarding projection without recruitment role assignment.
CREATE FUNCTION erp_private.mobile_hr_v5_disclose_evidence(eid bigint,doc bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.business_principal_is_active() AND public.current_user_can_view_dms_document(doc) AND erp_private.document_permission(doc,'dms.documents.preview')
 AND (erp_private.employee_permission(eid,'hr.medical.view') OR NOT EXISTS(
   SELECT FROM public.employee_medical_records m WHERE m.employee_id=eid AND m.dms_document_id=doc AND m.deleted_at IS NULL
   UNION ALL SELECT FROM public.employee_medical_insurances m WHERE m.employee_id=eid AND m.dms_document_id=doc AND m.deleted_at IS NULL
   UNION ALL SELECT FROM public.employee_leave_requests l WHERE l.employee_id=eid AND l.sick_cert_dms_id=doc AND l.deleted_at IS NULL))
 AND (erp_private.employee_permission(eid,'hr.confidential.view') OR NOT EXISTS(SELECT FROM public.employee_disciplinary_records d WHERE d.employee_id=eid AND d.dms_document_id=doc AND d.deleted_at IS NULL))
$$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_v5_disclose_evidence(bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.mobile_hr_v5_tasks(p_employee bigint,p_id bigint,p_page integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE own_access boolean; staff_access boolean;
BEGIN
  PERFORM erp_private.mobile_hr_v5_active();
  own_access:=erp_private.mobile_hr_self(p_employee) AND erp_private.employee_permission(p_employee,'hr.requests.submit') AND erp_private.employee_permission(p_employee,'hr.employees.view');
  staff_access:=erp_private.employee_permission(p_employee,'hr.recruitment.view') AND public.current_user_can_view_employee(p_employee);
  IF (own_access OR staff_access) IS NOT TRUE THEN RAISE EXCEPTION 'Current task scope required' USING ERRCODE='42501'; END IF;
  IF p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM (
    SELECT t.id,t.workspace_revision::text revision,t.task_title title,t.task_category category,t.task_status status,
      t.due_date AS "dueDate",t.is_required required,t.evidence_required AS "evidenceRequired",
      u.display_name AS "assignedTo",t.candidate_id AS "candidateId",t.completion_criteria AS "completionCriteria",
      t.prerequisite_task_id AS "prerequisiteTaskId",own_access AS "canSubmitEvidence",
      CASE WHEN d.id IS NOT NULL AND erp_private.mobile_hr_v5_disclose_evidence(p_employee,d.id) AND erp_private.mobile_hr_evidence(p_employee,d.id,d.current_version_id)
        THEN jsonb_build_object('documentId',d.id,'documentVersionId',d.current_version_id) END AS evidence
    FROM public.hr_onboarding_tasks t LEFT JOIN public.user_profiles u ON u.id=t.assigned_to
      LEFT JOIN public.dms_documents d ON d.id=t.dms_document_id
    WHERE t.employee_id=p_employee AND t.deleted_at IS NULL AND (p_id IS NULL OR t.id=p_id)
      AND (t.task_category IS DISTINCT FROM 'medical' OR erp_private.employee_permission(p_employee,'hr.medical.view'))
      AND (t.task_category IS DISTINCT FROM 'payroll' OR erp_private.employee_permission(p_employee,'hr.payroll.view'))
      AND (own_access OR erp_private.onboarding_permission(t.candidate_id,t.employee_id,'hr.recruitment.view'))
    ORDER BY t.id LIMIT 26 OFFSET (p_page-1)*25) x);
END $$;
CREATE FUNCTION public.mobile_hr_v5_tasks(p_employee bigint,p_id bigint,p_page integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.mobile_hr_v5_tasks(p_employee,p_id,p_page) $$;

REVOKE ALL ON FUNCTION erp_private.mobile_hr_v5_active(),public.mobile_hr_v5_calendar(date,date,integer,bigint,bigint,bigint,text),
 public.mobile_hr_v5_directory_choices(text,bigint,bigint,text,bigint),erp_private.mobile_hr_v5_tasks(bigint,bigint,integer),
 public.mobile_hr_v5_tasks(bigint,bigint,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.mobile_hr_v5_active(),public.mobile_hr_v5_calendar(date,date,integer,bigint,bigint,bigint,text),
 public.mobile_hr_v5_directory_choices(text,bigint,bigint,text,bigint),erp_private.mobile_hr_v5_tasks(bigint,bigint,integer),
 public.mobile_hr_v5_tasks(bigint,bigint,integer) TO authenticated;
CREATE FUNCTION public.mobile_hr_v5_team_readiness(p_date date,p_search text,p_company bigint,p_branch bigint,p_site bigint,p_page integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
BEGIN
 PERFORM erp_private.mobile_hr_v5_active();
 IF p_date IS NULL OR p_search IS NULL OR length(p_search)>100 OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid readiness page' USING ERRCODE='22023'; END IF;
 RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."employeeCode",x."employeeId"),'[]') FROM (
 SELECT e.id "employeeId",e.employee_code "employeeCode",e.full_name_en name,c.legal_name_en company,b.branch_name_en branch,
 s.site_name site,coalesce(latest.readiness_status,'unassessed') status,latest.checked_at "checkedAt",
 EXISTS(SELECT FROM public.employee_operational_blocks o WHERE o.employee_id=e.id AND o.deleted_at IS NULL AND o.block_status='active' AND o.effective_from<=p_date AND (o.effective_to IS NULL OR o.effective_to>=p_date)) AS "hasOperationalBlock"
 FROM public.employees e LEFT JOIN public.owner_companies c ON c.id=e.owner_company_id LEFT JOIN public.branches b ON b.id=e.branch_id
 LEFT JOIN LATERAL (SELECT r.work_site_id,r.readiness_status,r.checked_at FROM public.employee_site_readiness r WHERE r.employee_id=e.id AND r.deleted_at IS NULL AND (p_site IS NULL OR r.work_site_id=p_site)
 AND r.checked_at<(p_date+1)::timestamp AT TIME ZONE 'Asia/Dubai' ORDER BY r.checked_at DESC,r.id DESC LIMIT 1) latest ON true
 LEFT JOIN public.work_sites s ON s.id=coalesce(latest.work_site_id,e.primary_work_site_id)
 WHERE e.deleted_at IS NULL AND public.current_user_can_view_employee(e.id) AND erp_private.employee_permission(e.id,'hr.assignments.view') AND
 (p_company IS NULL OR e.owner_company_id=p_company) AND (p_branch IS NULL OR e.branch_id=p_branch) AND (p_site IS NULL OR s.id=p_site) AND strpos(lower(e.employee_code||' '||e.full_name_en),lower(p_search))>0
 ORDER BY e.employee_code,e.id LIMIT 26 OFFSET (p_page-1)*25)x);
END $$;
REVOKE ALL ON FUNCTION public.mobile_hr_v5_team_readiness(date,text,bigint,bigint,bigint,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mobile_hr_v5_team_readiness(date,text,bigint,bigint,bigint,integer) TO authenticated;
ALTER TABLE public.employee_pro_processes ADD COLUMN related_document_version_id bigint REFERENCES public.dms_document_versions(id);
CREATE INDEX employee_pro_process_evidence_version ON public.employee_pro_processes(related_document_version_id) WHERE related_document_version_id IS NOT NULL;
CREATE FUNCTION erp_private.mobile_hr_v5_detail(eid bigint,k text,rid bigint,case_id bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE doc bigint; ver bigint; item jsonb; ev jsonb; result jsonb:='[]'; protected boolean; label text; val text; who text; src text;
BEGIN
 PERFORM erp_private.mobile_hr_v5_active();
 IF k IN('clearance','clearanceHistory') THEN
  IF NOT (erp_private.employee_permission(eid,'hr.eos.view') OR erp_private.employee_permission(eid,'hr.actions.view')) THEN RAISE EXCEPTION 'Clearance access required' USING ERRCODE='42501'; END IF;
  IF k='clearance' THEN
   SELECT i.evidence_document_id,i.evidence_version_id INTO doc,ver FROM public.employee_clearance_items i JOIN public.employee_eos_cases ec ON ec.id=i.eos_case_id AND ec.deleted_at IS NULL AND ec.employee_id=eid
    WHERE i.id=rid AND i.employee_id=eid AND i.eos_case_id=case_id AND i.deleted_at IS NULL;
  ELSE
   SELECT (h.after_state->>'evidence_document_id')::bigint,(h.after_state->>'evidence_version_id')::bigint,u.display_name INTO doc,ver,who
    FROM erp_private.f12_clearance_history h JOIN public.employee_clearance_items i ON i.id=h.item_id AND i.employee_id=eid AND i.eos_case_id=case_id AND i.deleted_at IS NULL
    JOIN public.employee_eos_cases ec ON ec.id=i.eos_case_id AND ec.employee_id=eid AND ec.deleted_at IS NULL
    LEFT JOIN public.user_profiles u ON u.id=h.actor_profile_id WHERE h.employee_id=eid AND h.eos_case_id=case_id AND h.id=rid;
  END IF;
 ELSIF k='pro-process' THEN
  IF erp_private.employee_permission(eid,'hr.actions.view') IS NOT TRUE THEN RAISE EXCEPTION 'PRO access required' USING ERRCODE='42501'; END IF;
  SELECT p.related_document_id,coalesce(p.related_document_version_id,d.current_version_id) INTO doc,ver FROM public.employee_pro_processes p LEFT JOIN public.dms_documents d ON d.id=p.related_document_id WHERE p.id=rid AND p.employee_id=eid AND p.deleted_at IS NULL;
 ELSE
  IF erp_private.employee_permission(eid,'hr.assignments.view') IS NOT TRUE THEN RAISE EXCEPTION 'Operations access required' USING ERRCODE='42501'; END IF;
  src:=CASE k WHEN 'blocks' THEN 'employee_operational_blocks' WHEN 'requirements' THEN 'employee_role_requirements' WHEN 'readiness' THEN 'employee_site_readiness' WHEN 'assets' THEN 'employee_assets' WHEN 'ppe' THEN 'employee_ppe_issues' WHEN 'accommodation' THEN 'employee_accommodation_records' WHEN 'assignments' THEN 'employee_assignments' END;
  IF src IS NULL THEN RAISE EXCEPTION 'Unknown operational domain' USING ERRCODE='22023'; END IF;
  EXECUTE format('SELECT to_jsonb(x) FROM public.%I x WHERE x.id=$1 AND x.employee_id=$2 AND deleted_at IS NULL',src) INTO item USING rid,eid;
  IF item IS NULL THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501'; END IF;
  doc:=(item->>'dms_document_id')::bigint;
  IF doc IS NOT NULL THEN SELECT current_version_id INTO ver FROM public.dms_documents WHERE id=doc; END IF;
  protected:=erp_private.employee_permission(eid,'hr.confidential.view') AND erp_private.employee_permission(eid,'hr.compliance.view') AND erp_private.employee_permission(eid,'hr.medical.view')
    AND (item->>'block_type' IS DISTINCT FROM 'payroll' OR erp_private.employee_permission(eid,'hr.payroll.view'));
  IF k IN('readiness','blocks','requirements') THEN
   label:=CASE k WHEN 'blocks' THEN 'Block reason' WHEN 'readiness' THEN 'Readiness notes' ELSE 'Requirement' END;
   val:=CASE WHEN protected THEN CASE k WHEN 'blocks' THEN item->>'block_reason' WHEN 'readiness' THEN item->>'notes' ELSE item->>'requirement_name' END ELSE 'Restricted details' END;
   result:=jsonb_build_array(jsonb_build_object('key','details','label',label,'value',val));
  END IF;
 END IF;
 IF doc IS NOT NULL AND ver IS NOT NULL AND erp_private.mobile_hr_v5_disclose_evidence(eid,doc) AND erp_private.mobile_hr_evidence(eid,doc,ver) THEN ev:=jsonb_build_object('documentId',doc,'documentVersionId',ver); END IF;
 RETURN jsonb_build_object('fields',result,'evidence',ev,'actorLabel',who);
END $$;
CREATE FUNCTION public.mobile_hr_v5_detail(p_employee bigint,p_kind text,p_id bigint,p_case bigint DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.mobile_hr_v5_detail(p_employee,p_kind,p_id,p_case) $$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_v5_detail(bigint,text,bigint,bigint),public.mobile_hr_v5_detail(bigint,text,bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.mobile_hr_v5_detail(bigint,text,bigint,bigint),public.mobile_hr_v5_detail(bigint,text,bigint,bigint) TO authenticated;
COMMIT;
