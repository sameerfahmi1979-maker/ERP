BEGIN;

-- A verified login-to-employee link confers no profile read. Resolve identity separately
-- so an explicitly granted own-domain read can be honored without exposing the employee table.
CREATE FUNCTION erp_private.mobile_hr_linked_id() RETURNS bigint LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT e.id FROM public.erp_user_employee_links l JOIN public.user_profiles p ON p.id=l.user_profile_id
    JOIN public.employees e ON e.id=l.employee_id AND e.deleted_at IS NULL
  WHERE erp_private.business_principal_is_active() AND p.id=public.current_user_profile_id()
    AND p.owner_company_id=e.owner_company_id AND p.branch_id IS NOT DISTINCT FROM e.branch_id;
$$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_linked_id() FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.mobile_hr_own_access() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  WITH subject AS (SELECT erp_private.mobile_hr_linked_id() AS id)
  SELECT CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
      'employeeId',s.id,'profile',public.current_user_can_view_employee(s.id),
      'leave',erp_private.employee_permission(s.id,'hr.leave.view'),'attendance',erp_private.employee_permission(s.id,'hr.attendance.view'),
      'compliance',erp_private.employee_permission(s.id,'hr.compliance.view'),'medical',erp_private.employee_permission(s.id,'hr.medical.view'),
      'submit',erp_private.employee_permission(s.id,'hr.requests.submit'),'actions',erp_private.employee_permission(s.id,'hr.actions.view'),
      'evidence',erp_private.permission_in_scope('dms.documents.view',e.owner_company_id,e.branch_id)
        AND erp_private.permission_in_scope('dms.documents.preview',e.owner_company_id,e.branch_id))
    END FROM subject s LEFT JOIN public.employees e ON e.id=s.id;
$$;
CREATE FUNCTION public.mobile_hr_own_access() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.mobile_hr_own_access() $$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_own_access(),public.mobile_hr_own_access() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.mobile_hr_own_access(),public.mobile_hr_own_access() TO authenticated;

-- For a linked actor without profile access the canonical F12 entry point rejects the profile.
-- Keep its unmodified, period-provenance calculation and expose only the exact subject's balances.
CREATE FUNCTION erp_private.mobile_hr_own_balance_facts(p_employee bigint,p_after bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
  SELECT CASE WHEN p_employee=erp_private.mobile_hr_linked_id() AND erp_private.employee_permission(p_employee,'hr.leave.view')
    AND p_after>=0 THEN (SELECT coalesce(jsonb_agg(to_jsonb(x)ORDER BY x.id),'[]')FROM(
 SELECT b.id,b.leave_type_id,b.leave_year,b.period_start,b.period_end,b.period_basis,b.entitled_days,b.used_days,
 CASE WHEN b.period_start IS NOT NULL THEN(SELECT coalesce(sum(greatest(0,least(r.end_date,b.period_end)-greatest(r.start_date,b.period_start)+1)),0)FROM public.employee_leave_requests r WHERE r.employee_id=b.employee_id AND r.leave_type_id=b.leave_type_id AND r.deleted_at IS NULL AND r.approval_status='pending'AND r.start_date<=b.period_end AND r.end_date>=b.period_start)END reserved_days,
 ((b.period_start IS NOT NULL AND b.period_end IS NOT NULL
  AND b.used_days=(SELECT coalesce(sum(m.days),0) FROM erp_private.f12_leave_movements m WHERE m.balance_id=b.id)
  AND NOT EXISTS(SELECT 1 FROM public.employee_leave_requests r WHERE r.employee_id=b.employee_id AND r.leave_type_id=b.leave_type_id
    AND r.deleted_at IS NULL AND r.approval_status='approved' AND r.start_date<=b.period_end AND r.end_date>=b.period_start
    AND (r.f12_ledger_version IS DISTINCT FROM 1 OR r.f12_policy IS NULL OR
      (SELECT coalesce(sum(m.days),0) FROM erp_private.f12_leave_movements m WHERE m.balance_id=b.id AND m.request_id=r.id AND m.effect='consume')
      <>least(r.end_date,b.period_end)-greatest(r.start_date,b.period_start)+1)))AND b.period_start IS NOT NULL AND b.carry_forward=0 AND b.entitled_days>=b.used_days AND EXISTS(SELECT 1 FROM public.hr_leave_types t JOIN public.employees e ON e.id=b.employee_id WHERE t.id=b.leave_type_id AND t.reset_basis=b.period_basis AND erp_private.f12_leave_period(b.period_start,e.joining_date,t.reset_basis)=daterange(b.period_start,b.period_end,'[]'))AND NOT EXISTS(SELECT 1 FROM public.employee_leave_requests r JOIN public.hr_leave_types t ON t.id=r.leave_type_id JOIN public.employees e ON e.id=r.employee_id WHERE r.employee_id=b.employee_id AND r.leave_type_id=b.leave_type_id AND r.deleted_at IS NULL AND r.approval_status='pending'AND(r.f12_policy IS NULL OR r.f12_policy->>'reset_basis'IS DISTINCT FROM t.reset_basis OR(r.f12_policy->>'joining_date')::date IS DISTINCT FROM e.joining_date)AND r.start_date<=b.period_end AND r.end_date>=b.period_start))known
 FROM public.employee_leave_balances b WHERE b.employee_id=p_employee AND b.id>p_after ORDER BY b.id LIMIT 26)x) END;
$$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_own_balance_facts(bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.mobile_hr_own_records(p_employee bigint,p_kind text,p_page integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE required_permission text; page_offset bigint; result jsonb;
BEGIN
  required_permission:=CASE WHEN p_kind IN ('punch','attendance','overtime','shift') THEN 'hr.attendance.view'
    WHEN p_kind IN ('identity-document','access-card','training-certificate') THEN 'hr.compliance.view'
    WHEN p_kind='medical-insurance' THEN 'hr.medical.view' END;
  IF required_permission IS NULL OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid own page' USING ERRCODE='22023'; END IF;
  IF p_employee IS NULL OR p_employee IS DISTINCT FROM erp_private.mobile_hr_linked_id() OR NOT erp_private.employee_permission(p_employee,required_permission)
    THEN RAISE EXCEPTION 'Current own subject and domain grant required' USING ERRCODE='42501'; END IF;
  page_offset:=(p_page-1)*25;
  IF p_kind IN ('punch','attendance','overtime','shift') THEN
    WITH facts AS (
      SELECT p.id,initcap(replace(p.punch_type,'_',' ')) AS label,p.punch_datetime AS stamp,
        p.punch_datetime::text AS date,NULL::text AS detail,NULL::text AS status,NULL::text AS revision
        FROM public.employee_attendance_punches p WHERE p_kind='punch' AND p.employee_id=p_employee
      UNION ALL SELECT a.id,initcap(replace(a.attendance_type,'_',' ')),a.attendance_date::timestamptz,a.attendance_date::text,
        nullif(concat_ws(' · ','In '||a.first_in_at::text,'Out '||a.last_out_at::text,a.total_hours::text||' h'),''),
        a.approval_status,a.workspace_revision::text FROM public.employee_attendance_daily_summary a WHERE p_kind='attendance' AND a.employee_id=p_employee
      UNION ALL SELECT o.id,o.hours::text||' h overtime',o.overtime_date::timestamptz,o.overtime_date::text,NULL,o.approval_status,NULL
        FROM public.employee_overtime_records o WHERE p_kind='overtime' AND o.employee_id=p_employee AND o.deleted_at IS NULL
      UNION ALL SELECT a.id,coalesce(s.shift_name,'Shift assignment'),a.effective_from::timestamptz,a.effective_from::text,
        nullif(concat_ws(' · ','Until '||a.effective_to::text,'Weekly off: '||a.weekly_off_day),''),NULL,NULL
        FROM public.employee_shift_assignments a LEFT JOIN public.work_shifts s ON s.id=a.work_shift_id
        WHERE p_kind='shift' AND a.employee_id=p_employee AND a.deleted_at IS NULL)
    SELECT coalesce(jsonb_agg(to_jsonb(x)-'stamp' ORDER BY stamp DESC,id DESC),'[]') INTO result
    FROM (SELECT * FROM facts ORDER BY stamp DESC,id DESC LIMIT 26 OFFSET page_offset) x;
  ELSE
    WITH facts AS (
      SELECT r.id,r.workspace_revision::text AS revision,coalesce(t.name_en,'Identity document') AS label,r.expiry_date AS "expiryDate"
        FROM public.employee_identity_documents r LEFT JOIN public.hr_identity_document_types t ON t.id=r.document_type_id
        WHERE p_kind='identity-document' AND r.employee_id=p_employee AND r.deleted_at IS NULL
      UNION ALL SELECT r.id,r.workspace_revision::text,coalesce(t.name_en,'Access card'),r.expiry_date
        FROM public.employee_access_cards r LEFT JOIN public.hr_access_card_types t ON t.id=r.access_type_id WHERE p_kind='access-card' AND r.employee_id=p_employee AND r.deleted_at IS NULL
      UNION ALL SELECT r.id,r.workspace_revision::text,coalesce(t.name_en,'Training certificate'),r.expiry_date
        FROM public.employee_training_certificates r LEFT JOIN public.hr_training_types t ON t.id=r.training_type_id WHERE p_kind='training-certificate' AND r.employee_id=p_employee AND r.deleted_at IS NULL
      UNION ALL SELECT r.id,r.workspace_revision::text,'Medical insurance',r.expiry_date FROM public.employee_medical_insurances r WHERE p_kind='medical-insurance' AND r.employee_id=p_employee AND r.deleted_at IS NULL)
    SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY "expiryDate" NULLS LAST,id),'[]') INTO result
    FROM (SELECT * FROM facts ORDER BY "expiryDate" NULLS LAST,id LIMIT 26 OFFSET page_offset) x;
  END IF;
  RETURN result;
END $$;
CREATE FUNCTION public.mobile_hr_own_records(p_employee bigint,p_kind text,p_page integer) RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.mobile_hr_own_records($1,$2,$3) $$;
REVOKE ALL ON FUNCTION public.mobile_hr_own_records(bigint,text,integer),erp_private.mobile_hr_own_records(bigint,text,integer) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.mobile_hr_own_records(bigint,text,integer),erp_private.mobile_hr_own_records(bigint,text,integer) TO authenticated;


-- Leave settings are not generally readable by employees. Only return their form options
-- and exact-period balances under the same employee predicates as the existing F12 reader.
CREATE FUNCTION erp_private.mobile_hr_leave_read(p_employee bigint,p_kind text,p_cursor bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT erp_private.business_principal_is_active() OR (NOT public.current_user_can_view_employee(p_employee) AND p_employee IS DISTINCT FROM erp_private.mobile_hr_linked_id())
     OR NOT erp_private.employee_permission(p_employee,'hr.leave.view') THEN
    RAISE EXCEPTION 'Current leave subject access required' USING ERRCODE='42501';
  END IF;
  IF p_cursor IS NULL OR p_cursor<0 THEN RAISE EXCEPTION 'Invalid cursor' USING ERRCODE='22023'; END IF;
  IF p_kind='options' AND p_cursor BETWEEN 1 AND 100000 THEN
    RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.label,x.id),'[]') FROM
      (SELECT t.id,t.name_en AS label,t.requires_document AS "requiresDocument" FROM public.hr_leave_types t WHERE t.is_active AND t.deleted_at IS NULL
       ORDER BY t.name_en,t.id LIMIT 26 OFFSET (p_cursor-1)*25) x);
  ELSIF p_kind='requests' AND p_cursor BETWEEN 1 AND 100000 THEN
    RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x."startDate" DESC,x.id DESC),'[]') FROM (
       SELECT l.id,l.workspace_revision::text AS revision,coalesce(t.name_en,'Leave request') AS label,
         l.start_date AS "startDate",l.end_date AS "endDate",l.approval_status AS status,
         (l.approval_status='pending' AND l.created_by IS NOT DISTINCT FROM public.current_user_profile_id()
          AND erp_private.employee_permission(l.employee_id,'hr.requests.submit') AND EXISTS (
           SELECT 1 FROM public.erp_user_employee_links u JOIN public.user_profiles p ON p.id=u.user_profile_id
           JOIN public.employees e ON e.id=u.employee_id AND e.deleted_at IS NULL
           WHERE u.user_profile_id=public.current_user_profile_id() AND u.employee_id=p_employee AND p.owner_company_id=e.owner_company_id
             AND p.branch_id IS NOT DISTINCT FROM e.branch_id)) AS "canCancel"
       FROM public.employee_leave_requests l LEFT JOIN public.hr_leave_types t ON t.id=l.leave_type_id
       WHERE l.employee_id=p_employee AND l.deleted_at IS NULL ORDER BY l.start_date DESC,l.id DESC LIMIT 26 OFFSET (p_cursor-1)*25) x);
  ELSIF p_kind='balances' THEN
    RETURN (SELECT coalesce(jsonb_agg(b || jsonb_build_object('label',t.name_en) ORDER BY (b->>'id')::bigint),'[]')
      FROM jsonb_array_elements(CASE WHEN public.current_user_can_view_employee(p_employee) THEN public.f12_leave_period_balances(p_employee,p_cursor) ELSE erp_private.mobile_hr_own_balance_facts(p_employee,p_cursor) END) b
      LEFT JOIN public.hr_leave_types t ON t.id=(b->>'leave_type_id')::bigint);
  END IF;
  RAISE EXCEPTION 'Invalid leave criteria' USING ERRCODE='22023';
END $$;
CREATE FUNCTION public.mobile_hr_leave_read(p_employee bigint,p_kind text,p_cursor bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.mobile_hr_leave_read($1,$2,$3) $$;

-- Only selectors backed by a currently authorized employee may contribute labels.
CREATE FUNCTION erp_private.mobile_hr_roster_scopes(p_company bigint,p_branch boolean,p_after bigint,p_search text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF NOT erp_private.business_principal_is_active() OR NOT public.current_user_has_permission_any_scope('hr.attendance.manage')
     OR NOT public.current_user_has_permission_any_scope('hr.attendance.view') THEN
    RAISE EXCEPTION 'Attendance management required' USING ERRCODE='42501'; END IF;
  IF p_search IS NULL OR length(p_search)>100 OR p_after IS NULL OR p_after<0 OR p_branch IS NULL
     OR (p_branch AND (p_company IS NULL OR p_company<=0)) THEN RAISE EXCEPTION 'Invalid criteria' USING ERRCODE='22023'; END IF;
  RETURN (WITH permitted AS MATERIALIZED (
    SELECT e.owner_company_id,e.branch_id FROM public.employees e WHERE e.deleted_at IS NULL
    AND (NOT p_branch OR e.owner_company_id=p_company) AND public.current_user_can_view_employee(e.id)
    AND erp_private.f11_child_authorized('attendance-summary',e.id)),
  options AS (
    SELECT c.id,c.legal_name_en AS label FROM public.owner_companies c WHERE NOT p_branch AND c.status='active' 
    AND EXISTS (SELECT 1 FROM permitted e WHERE e.owner_company_id=c.id)
    UNION ALL SELECT b.id,b.branch_name_en FROM public.branches b WHERE p_branch AND b.owner_company_id=p_company
    AND b.status='active'  AND EXISTS (SELECT 1 FROM permitted e WHERE e.branch_id=b.id))
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM (
    SELECT id,label FROM options WHERE id>p_after AND strpos(lower(label),lower(p_search))>0 ORDER BY id LIMIT 26) x);
END $$;
CREATE FUNCTION public.mobile_hr_roster_scopes(p_company bigint,p_branch boolean,p_after bigint,p_search text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$ SELECT erp_private.mobile_hr_roster_scopes($1,$2,$3,$4) $$;

CREATE FUNCTION erp_private.mobile_hr_evidence(p_employee bigint,p_page integer,p_purpose text DEFAULT 'renewal')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE subject public.employees%ROWTYPE;
BEGIN
  IF p_purpose IS NULL OR p_purpose NOT IN ('leave','renewal') OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 100000 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
  SELECT e.* INTO subject FROM public.employees e WHERE e.id=p_employee AND e.deleted_at IS NULL;
  IF NOT FOUND OR NOT erp_private.business_principal_is_active() OR (NOT public.current_user_can_view_employee(p_employee) AND p_employee IS DISTINCT FROM erp_private.mobile_hr_linked_id())
    OR (p_purpose='leave' AND NOT (erp_private.employee_permission(p_employee,'hr.medical.view') AND erp_private.employee_permission(p_employee,'hr.leave.view')))
    OR NOT erp_private.permission_in_scope('dms.documents.view',subject.owner_company_id,subject.branch_id)
    OR NOT erp_private.permission_in_scope('dms.documents.preview',subject.owner_company_id,subject.branch_id) THEN
    RAISE EXCEPTION 'Current document access required' USING ERRCODE='42501'; END IF;
  RETURN (SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM (
    SELECT d.id,concat_ws(' — ',d.document_no,d.title) AS label,d.current_version_id AS "versionId"
    FROM public.dms_documents d JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id
    WHERE d.deleted_at IS NULL AND d.status IN ('active','approved') AND NOT d.is_archived AND d.document_no IS NOT NULL
    AND v.unlinked_at IS NULL AND d.owning_company_id=subject.owner_company_id AND (d.owning_branch_id IS NULL OR d.owning_branch_id=subject.branch_id)
    AND EXISTS (SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.deleted_at IS NULL AND l.entity_type='employee' AND l.entity_id=p_employee)
    AND NOT EXISTS (SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.deleted_at IS NULL AND l.entity_type IN ('employee','employee_dependent')
      AND (l.entity_type<>'employee' OR l.entity_id<>p_employee))
    AND public.current_user_can_view_dms_document(d.id) AND erp_private.document_permission(d.id,'dms.documents.view')
    AND erp_private.document_permission(d.id,'dms.documents.preview')
    AND EXISTS (
      SELECT 1 FROM public.dms_document_files f WHERE f.document_id=d.id AND f.version_id=v.id AND f.file_role='original' AND f.deleted_at IS NULL
      HAVING count(*)=1 AND bool_and(f.file_size_bytes>0 AND f.integrity_status<>'failed'
        AND (p_purpose='renewal' OR f.sha256_hash ~ '^[0-9a-f]{64}$'))
    )
    ORDER BY d.id DESC LIMIT 26 OFFSET (p_page-1)*25) x);
END $$;
CREATE FUNCTION public.mobile_hr_evidence(p_employee bigint,p_page integer,p_purpose text DEFAULT 'renewal') RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=''
AS $$ SELECT erp_private.mobile_hr_evidence($1,$2,$3) $$;

REVOKE ALL ON FUNCTION erp_private.mobile_hr_leave_read(bigint,text,bigint),public.mobile_hr_leave_read(bigint,text,bigint),
  erp_private.mobile_hr_roster_scopes(bigint,boolean,bigint,text),public.mobile_hr_roster_scopes(bigint,boolean,bigint,text),
  erp_private.mobile_hr_evidence(bigint,integer,text),public.mobile_hr_evidence(bigint,integer,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION erp_private.mobile_hr_leave_read(bigint,text,bigint),public.mobile_hr_leave_read(bigint,text,bigint),
  erp_private.mobile_hr_roster_scopes(bigint,boolean,bigint,text),public.mobile_hr_roster_scopes(bigint,boolean,bigint,text),
  erp_private.mobile_hr_evidence(bigint,integer,text),public.mobile_hr_evidence(bigint,integer,text) TO authenticated;
-- Filter before pagination so actionable pages contain only independently reviewable rows.
CREATE FUNCTION public.mobile_hr_staff_inbox(p_kind text,p_after bigint,p_employee bigint DEFAULT NULL,p_id bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id();
BEGIN
  IF actor IS NULL OR NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Current session required' USING ERRCODE='42501'; END IF;
  IF p_kind NOT IN ('approval','leave') OR p_kind IS NULL OR p_after<0 OR p_after IS NULL OR (p_id IS NULL)<>(p_employee IS NULL)
    THEN RAISE EXCEPTION 'Invalid inbox criteria' USING ERRCODE='22023'; END IF;
  IF NOT public.current_user_has_permission_any_scope(CASE p_kind WHEN 'approval' THEN 'hr.actions.manage' ELSE 'hr.leave.manage' END)
    THEN RAISE EXCEPTION 'Current review permission required' USING ERRCODE='42501'; END IF;
  RETURN (WITH candidates AS (
    SELECT a.id,a.employee_id,a.workspace_revision::text AS revision,a.request_title AS title,
      NULL::date AS start_date,NULL::date AS end_date
    FROM public.employee_approval_requests a WHERE p_kind='approval' AND a.deleted_at IS NULL AND a.request_status='pending'
      AND a.requested_by<>actor AND a.created_by<>actor AND a.approval_role_id IS NULL
      AND a.approval_type IN ('hr_action','pro_process','other') AND a.related_record_type IS NULL AND a.related_record_id IS NULL
      AND erp_private.f11_child_authorized('approval',a.employee_id)
    UNION ALL
    SELECT l.id,l.employee_id,l.workspace_revision::text,'Leave request' AS title,l.start_date,l.end_date
    FROM public.employee_leave_requests l WHERE p_kind='leave' AND l.deleted_at IS NULL AND l.approval_status='pending'
      AND l.created_by<>actor AND erp_private.f11_child_authorized('leave-request',l.employee_id))
  SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') FROM (
    SELECT c.id,c.employee_id AS "employeeId",c.revision,p_kind AS kind,c.title || ' — ' || e.full_name_en AS label,'pending'::text AS status,
      concat_ws(' — ',e.employee_code,e.full_name_en) AS "employeeLabel",
      c.start_date AS "startDate",c.end_date AS "endDate",true AS "canDecide"
    FROM candidates c JOIN public.employees e ON e.id=c.employee_id AND e.deleted_at IS NULL
    WHERE c.id>p_after AND (p_id IS NULL OR (c.id=p_id AND c.employee_id=p_employee))
      AND NOT EXISTS (SELECT 1 FROM public.erp_user_employee_links l WHERE l.user_profile_id=actor AND l.employee_id=c.employee_id)
    ORDER BY c.id LIMIT 26) x);
END $$;
REVOKE ALL ON FUNCTION public.mobile_hr_staff_inbox(text,bigint,bigint,bigint) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.mobile_hr_staff_inbox(text,bigint,bigint,bigint) TO authenticated;

-- Evaluate role assignments on actual subjects. Menu hints never substitute for row authorization.
CREATE FUNCTION public.mobile_hr_staff_capabilities() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path='' AS $$
  WITH actor AS (SELECT public.current_user_profile_id() AS id),
  linked AS (SELECT l.employee_id FROM public.erp_user_employee_links l JOIN actor ON actor.id=l.user_profile_id
    JOIN public.employees self ON self.id=l.employee_id AND self.deleted_at IS NULL
    JOIN public.user_profiles u ON u.id=l.user_profile_id AND u.owner_company_id=self.owner_company_id AND u.branch_id IS NOT DISTINCT FROM self.branch_id),
  permitted AS (SELECT e.id,e.reporting_manager_id FROM public.employees e WHERE e.deleted_at IS NULL),
  independent AS (SELECT e.* FROM permitted e WHERE NOT EXISTS(SELECT 1 FROM public.erp_user_employee_links l JOIN actor ON actor.id=l.user_profile_id WHERE l.employee_id=e.id))
  SELECT jsonb_build_object(
    'roster',EXISTS(SELECT 1 FROM permitted e WHERE erp_private.f11_child_authorized('attendance-summary',e.id)),
    'requestsTeam',EXISTS(SELECT 1 FROM permitted e JOIN linked l ON l.employee_id=e.reporting_manager_id AND e.id<>l.employee_id WHERE erp_private.employee_permission(e.id,'hr.actions.view')),
    'approvalsGeneral',EXISTS(SELECT 1 FROM independent e WHERE erp_private.f11_child_authorized('approval',e.id)),
    'approvalsLeave',EXISTS(SELECT 1 FROM independent e WHERE erp_private.f11_child_authorized('leave-request',e.id)),
    'approvalsProposal',EXISTS(SELECT 1 FROM independent e WHERE erp_private.f11_child_authorized('approval',e.id)
      AND (erp_private.employee_permission(e.id,'hr.employees.update') OR erp_private.f11_child_authorized('attendance-summary',e.id)
        OR erp_private.f11_child_authorized('identity-document',e.id))));
$$;
REVOKE ALL ON FUNCTION public.mobile_hr_staff_capabilities() FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.mobile_hr_staff_capabilities() TO authenticated;

NOTIFY pgrst,'reload schema';
COMMIT;
