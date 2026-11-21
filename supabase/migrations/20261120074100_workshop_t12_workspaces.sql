BEGIN;

CREATE FUNCTION public.t12_labour_workspace(p_job bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE j erp_private.t10_job_cycles; f erp_private.t10_assessments; asset erp_private.fleet_assets;
 record_allowed boolean; approve_allowed boolean; cost_allowed boolean; rights boolean;
 today date:=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date;
BEGIN
 SELECT * INTO j FROM erp_private.t10_job_cycles WHERE id=p_job;
 SELECT * INTO f FROM erp_private.t10_assessments WHERE id=j.assessment_id;
 record_allowed:=erp_private.t05_scope('workshop.labour.record',f.company_id,f.branch_id);
 approve_allowed:=erp_private.t05_scope('workshop.labour.approve',f.company_id,f.branch_id);
 cost_allowed:=erp_private.t05_scope('workshop.labour.cost',f.company_id,f.branch_id);
 rights:=record_allowed OR approve_allowed OR cost_allowed OR erp_private.t05_scope('workshop.jobs.manage',f.company_id,f.branch_id)
   OR erp_private.t05_scope('workshop.jobs.release',f.company_id,f.branch_id);
 IF j.id IS NULL OR NOT rights THEN RETURN NULL; END IF;
 SELECT * INTO asset FROM erp_private.fleet_assets a WHERE a.id=f.asset_id;
 RETURN jsonb_build_object('job',j.id,'assessment',f.id,'cycle',j.cycle,'branch',f.branch_id,'asset',asset.id,'asset_name',asset.name,
  'asset_number',asset.asset_no,'state',j.state,'record',record_allowed,'cost',cost_allowed,
  'can_assign',record_allowed AND j.state IN('planned','in-progress'),
  'assignments',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
    SELECT a.id,a.employee_id,emp.full_name_en AS employee,person.full_name AS supervisor,a.bay,a.task,a.site_id,s.site_name AS site,
     lower(a.work_window) AS window_start,upper(a.work_window) AS window_end
    FROM erp_private.t12_labour_assignments a JOIN public.employees emp ON emp.id=a.employee_id
    JOIN public.user_profiles person ON person.id=a.supervisor_id JOIN public.work_sites s ON s.id=a.site_id
    WHERE a.job_id=j.id ORDER BY a.id DESC LIMIT 100) x),
  'versions',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
    SELECT v.id,a.id AS assignment,l.source_line,lower(v.period) AS started,upper(v.period) AS ended,v.day,
     erp_private.t08_minutes(tstzmultirange(v.period)) AS minutes,v.predecessor_id,v.voids_line,v.decision,v.entered_at,
     v.decided_at,v.reason,emp.full_name_en AS employee,
     NOT EXISTS(SELECT 1 FROM erp_private.t12_labour_versions later WHERE later.predecessor_id=v.id) AS current,
     approve_allowed AND a.supervisor_id=public.current_user_profile_id() AND v.entered_by<>public.current_user_profile_id()
       AND NOT erp_private.t12_is_subject(public.current_user_profile_id(),v.employee_id) AS supervisor,
     CASE WHEN v.cost_rate_id IS NULL THEN 'rate-required' ELSE 'valued' END AS cost_status,
     CASE WHEN cost_allowed THEN v.cost_amount END AS amount,CASE WHEN cost_allowed THEN v.cost_currency END AS currency,
     CASE WHEN erp_private.document_permission(v.document_id,'dms.documents.preview') THEN v.file_id END AS file
    FROM erp_private.t12_labour_versions v JOIN erp_private.t12_labour_lines l ON l.id=v.line_id
    JOIN erp_private.t12_labour_assignments a ON a.id=v.assignment_id JOIN public.employees emp ON emp.id=v.employee_id
    WHERE a.job_id=j.id ORDER BY v.id DESC LIMIT 150) x),
  'rates',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
    SELECT r.id,r.employee_group_id,lower(r.valid_during) AS from_day,upper(r.valid_during) AS until_day,r.rate,r.currency,r.reason,
     r.approved_at,r.approved_zero,r.prepared_by<>public.current_user_profile_id() AS independent
    FROM erp_private.t12_cost_rates r WHERE cost_allowed AND r.branch_id=f.branch_id ORDER BY r.id DESC LIMIT 100) x),
  'employees',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.label),'[]') FROM(
    SELECT e.id,e.employee_code||' · '||e.full_name_en AS label FROM public.employees e
    WHERE record_allowed AND e.employee_status IN('active','probation') AND e.deleted_at IS NULL AND EXISTS(
     SELECT 1 FROM erp_private.t03_employment_periods ep WHERE ep.employee_id=e.id AND ep.branch_id=f.branch_id AND ep.work_period @> today)
    ORDER BY e.full_name_en,e.id LIMIT 200) x),
  'supervisors',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.label),'[]') FROM(
    SELECT p.id,p.full_name AS label FROM public.user_profiles p WHERE record_allowed
     AND erp_private.t12_staff_capability(p.id,'workshop.labour.approve',f.company_id,f.branch_id)
    ORDER BY p.full_name,p.id LIMIT 100) x),
  'sites',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.label),'[]') FROM(
    SELECT s.id,s.site_name AS label FROM public.work_sites s WHERE record_allowed
     AND erp_private.t06_site_allowed(s.id,f.company_id,f.branch_id,today,today)
    ORDER BY s.site_name,s.id LIMIT 150) x),
  'groups',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',g.id,'label',g.name_en) ORDER BY g.name_en),'[]')
    FROM public.hr_employee_categories g WHERE cost_allowed AND g.is_active AND g.deleted_at IS NULL),
  'documents',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.file DESC),'[]') FROM(
    SELECT d.id AS document,v.id AS version,o.id AS file,d.document_no||' · '||d.title AS label
    FROM erp_private.fleet_document_parents p JOIN public.dms_documents d ON d.id=p.document_id
    JOIN public.dms_document_types dt ON dt.id=d.document_type_id AND dt.type_code='FLEET_WORKSHOP_LABOUR' AND dt.deleted_at IS NULL
    JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
    JOIN public.dms_document_files o ON o.document_id=d.id AND o.version_id=v.id AND o.file_role='original' AND o.deleted_at IS NULL
       AND o.integrity_status='verified' AND o.file_size_bytes>0 AND o.sha256_hash~'^[0-9a-f]{64}$'
    JOIN public.dms_document_links l ON l.document_id=d.id AND l.entity_type='fleet_asset' AND l.entity_id=asset.id AND l.deleted_at IS NULL
    WHERE record_allowed AND p.asset_id=asset.id AND d.status='active' AND NOT d.is_archived AND d.deleted_at IS NULL
     AND erp_private.document_permission(d.id,'dms.documents.preview')
     AND NOT EXISTS(SELECT 1 FROM erp_private.t12_labour_documents other WHERE other.document_id=d.id AND other.job_id<>j.id)
    ORDER BY o.id DESC LIMIT 80) x));
END $$;

CREATE FUNCTION erp_private.t12_user_review_scope(p_mode text,p_company bigint,p_branch bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE p_mode WHEN 'hr' THEN erp_private.t05_scope('hr.workshop.labour.review',p_company,p_branch)
  AND erp_private.t05_scope('hr.attendance.view',p_company,p_branch)
 WHEN 'accounts' THEN erp_private.t05_scope('hr.payroll.workshop.review',p_company,p_branch)
  AND erp_private.t05_scope('hr.payroll.view',p_company,p_branch) ELSE false END;
$$;

CREATE FUNCTION public.t12_labour_review_scopes(p_mode text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.company,x.name),'[]') FROM(
 SELECT b.id,b.branch_name_en AS name,c.legal_name_en AS company FROM public.branches b JOIN public.owner_companies c ON c.id=b.owner_company_id
 WHERE b.status='active' AND b.operating_status='active' AND c.status='active' AND erp_private.t12_user_review_scope(p_mode,c.id,b.id)) x;
$$;

CREATE FUNCTION erp_private.t12_segments(p_range tstzmultirange) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('from',lower(piece),'until',upper(piece)) ORDER BY piece),'[]') FROM unnest(p_range) piece;
$$;

CREATE FUNCTION public.t12_labour_hr_queue(p_branch bigint,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.branches;
BEGIN
 SELECT * INTO b FROM public.branches WHERE id=p_branch;
 IF b.id IS NULL OR NOT erp_private.t12_user_review_scope('hr',b.owner_company_id,b.id) THEN RETURN NULL; END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'job',v.job_id,'employee',v.employee,'day',v.day,
  'from',lower(v.period),'until',upper(v.period),'minutes',basis->'minutes','eligible_minutes',basis->'eligible_minutes',
  'conflicted_minutes',basis->'conflicted_minutes','unmatched_minutes',basis->'unmatched_minutes',
  'eligible_segments',erp_private.t12_segments((basis->>'eligible')::tstzmultirange),
  'conflicted_segments',erp_private.t12_segments((basis->>'conflicts')::tstzmultirange),
  'unmatched_segments',erp_private.t12_segments((basis->>'unmatched')::tstzmultirange),
  'status',basis->'status','cost_status',basis->'cost_status','can_review',v.entered_by<>public.current_user_profile_id()
   AND v.decided_by<>public.current_user_profile_id() AND NOT erp_private.t12_is_subject(public.current_user_profile_id(),v.employee_id),
  'digest',CASE WHEN basis->>'status'='ready' THEN erp_private.t02_digest(basis) END,
  'file',CASE WHEN erp_private.document_permission(v.document_id,'dms.documents.preview') THEN v.file_id END,
  'candidate', (SELECT c.id FROM erp_private.t12_payroll_candidates c WHERE c.version_id=v.id AND c.digest=erp_private.t02_digest(basis)),
  'previous_claims',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',claim.id,'portion',claim.claimed::text) ORDER BY claim.id),'[]')
    FROM erp_private.t08_payable_claims claim JOIN erp_private.t12_payroll_candidates c ON c.id=claim.workshop_candidate_id
    JOIN erp_private.t12_labour_versions older ON older.id=c.version_id WHERE older.line_id=v.line_id AND older.id<=v.id))
  ORDER BY v.id DESC) FROM(
    SELECT row_data.*,a.job_id,emp.full_name_en AS employee
    FROM erp_private.t12_labour_versions row_data JOIN erp_private.t12_labour_assignments a ON a.id=row_data.assignment_id
    JOIN erp_private.t10_job_cycles j ON j.id=a.job_id JOIN erp_private.t10_assessments f ON f.id=j.assessment_id
    JOIN public.employees emp ON emp.id=row_data.employee_id
    WHERE f.company_id=b.owner_company_id AND f.branch_id=b.id AND row_data.decision='approved'
     AND (p_before IS NULL OR row_data.id<p_before)
     AND NOT EXISTS(SELECT 1 FROM erp_private.t12_labour_versions later WHERE later.line_id=row_data.line_id AND later.id>row_data.id AND later.decision IS DISTINCT FROM 'rejected')
    ORDER BY row_data.id DESC LIMIT 50) v
  CROSS JOIN LATERAL(SELECT erp_private.t12_pay_basis(v.id) AS basis) ctx),'[]');
END $$;

CREATE FUNCTION public.t12_labour_payroll(p_branch bigint,p_through date,p_cutoff timestamptz,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.branches;
BEGIN
 SELECT * INTO b FROM public.branches WHERE id=p_branch;
 IF b.id IS NULL OR NOT erp_private.t12_user_review_scope('accounts',b.owner_company_id,b.id) THEN RETURN NULL; END IF;
 IF p_through IS NULL OR NOT isfinite(p_through) OR p_cutoff IS NULL OR NOT isfinite(p_cutoff) THEN
  RAISE EXCEPTION 'Choose the payroll work date and evidence cutoff' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('candidates',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
  SELECT c.id,c.version_id,c.employee_id,c.day,c.available_at,emp.full_name_en AS employee,
   erp_private.t08_minutes(c.eligible) AS eligible_minutes,
   erp_private.t12_segments(c.eligible) AS eligible_segments,erp_private.t12_segments(balance.portion) AS remaining_segments,erp_private.t08_minutes(balance.portion) AS remaining_minutes,
   erp_private.t08_range_amount(c.eligible,balance.portion,c.rate) AS amount,c.currency
  FROM erp_private.t12_payroll_candidates c JOIN public.employees emp ON emp.id=c.employee_id
  CROSS JOIN LATERAL(SELECT c.eligible-coalesce((SELECT range_agg(part) FROM erp_private.t08_payable_claims claimed
    CROSS JOIN LATERAL unnest(claimed.claimed) part WHERE claimed.employee_id=c.employee_id AND claimed.claimed&&c.eligible),'{}') AS portion) balance
  WHERE c.company_id=b.owner_company_id AND c.branch_id=b.id AND c.day<=p_through AND c.available_at<=p_cutoff
   AND (p_before IS NULL OR c.id<p_before) AND NOT isempty(balance.portion)
   AND c.digest=erp_private.t02_digest(erp_private.t12_pay_basis(c.version_id))
  ORDER BY c.id DESC LIMIT 50) x),
  'corrections',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
  SELECT correction.id,correction.claim_id,correction.new_version,c.day,emp.full_name_en AS employee,
   erp_private.t08_minutes(correction.portion) AS minutes,correction.amount,c.currency,correction.available_at,
   correction.proposed_by<>public.current_user_profile_id() AS independent,correction.reason,
   erp_private.t12_correction_current(correction.claim_id,correction.new_version,correction.portion) AS current
  FROM erp_private.t12_payroll_corrections correction JOIN erp_private.t08_payable_claims claim ON claim.id=correction.claim_id
  JOIN erp_private.t12_payroll_candidates c ON c.id=claim.workshop_candidate_id JOIN public.employees emp ON emp.id=c.employee_id
  WHERE c.company_id=b.owner_company_id AND c.branch_id=b.id AND c.day<=p_through
   AND correction.withdrawn_at IS NULL AND correction.proposed_at<=p_cutoff AND (correction.available_at IS NULL OR correction.available_at<=p_cutoff)
   AND NOT EXISTS(SELECT 1 FROM erp_private.t12_correction_claims picked WHERE picked.correction_id=correction.id)
  ORDER BY correction.id DESC LIMIT 75) x));
END $$;

REVOKE ALL ON FUNCTION public.t12_labour_workspace(bigint),erp_private.t12_segments(tstzmultirange),erp_private.t12_user_review_scope(text,bigint,bigint),
 public.t12_labour_review_scopes(text),public.t12_labour_hr_queue(bigint,bigint),
 public.t12_labour_payroll(bigint,date,timestamptz,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t12_labour_workspace(bigint),public.t12_labour_review_scopes(text),
 public.t12_labour_hr_queue(bigint,bigint),public.t12_labour_payroll(bigint,date,timestamptz,bigint) TO authenticated;
CREATE FUNCTION public.t12_job_work_index(p_before bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
 SELECT j.id,j.assessment_id,j.cycle,j.state,a.asset_no,a.name AS asset_name,j.scope_of_work AS title
 FROM erp_private.t10_job_cycles j JOIN erp_private.t10_assessments f ON f.id=j.assessment_id
 JOIN erp_private.fleet_assets a ON a.id=f.asset_id
 WHERE (p_before IS NULL OR j.id<p_before) AND (
  EXISTS(SELECT 1 FROM unnest(ARRAY['workshop.labour.record','workshop.labour.approve','workshop.labour.cost',
      'workshop.jobs.manage','workshop.jobs.release','workshop.outside.manage','workshop.finance.intake','supply.request']) code
   WHERE erp_private.t05_scope(code,f.company_id,f.branch_id))
  OR (erp_private.t05_scope('supply.purchase.approve',f.company_id,f.branch_id) AND EXISTS(
   SELECT 1 FROM erp_private.t12_outside_orders item WHERE item.job_cycle_id=j.id)))
 ORDER BY j.id DESC LIMIT 40) x;
$$;
REVOKE ALL ON FUNCTION public.t12_job_work_index(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t12_job_work_index(bigint) TO authenticated;


NOTIFY pgrst,'reload schema';
COMMIT;
