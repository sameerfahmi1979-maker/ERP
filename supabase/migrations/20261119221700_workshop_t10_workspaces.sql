BEGIN;

CREATE FUNCTION erp_private.t10_case_visible(p_company bigint,p_branch bigint) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_private.t05_scope('fleet.inspections.report',p_company,p_branch)
  OR erp_private.t05_scope('workshop.assess',p_company,p_branch)
  OR erp_private.t05_scope('workshop.jobs.manage',p_company,p_branch)
  OR erp_private.t05_scope('workshop.jobs.release',p_company,p_branch);
$$;

CREATE FUNCTION public.t10_workshop_assets(p_before bigint DEFAULT NULL,p_search text DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
 SELECT a.id,a.asset_no,a.name,
  EXISTS(SELECT 1 FROM erp_private.t10_assessments f WHERE f.asset_id=a.id AND f.outcome IS NULL
    AND erp_private.t10_case_visible(f.company_id,f.branch_id)) AS needs_assessment
 FROM erp_private.fleet_assets a CROSS JOIN LATERAL erp_private.t06_operation_scope(a.id) s
 WHERE (p_before IS NULL OR a.id<p_before)
  AND (nullif(btrim(p_search),'') IS NULL OR strpos(lower(a.asset_no||' '||a.name),lower(btrim(left(p_search,100))))>0)
  AND ((a.status='active' AND (erp_private.t10_case_visible(s.company_id,s.branch_id)
      OR erp_private.t05_scope('fleet.maintenance.manage',s.company_id,s.branch_id)))
   OR EXISTS(SELECT 1 FROM erp_private.t10_assessments f WHERE f.asset_id=a.id
      AND erp_private.t10_case_visible(f.company_id,f.branch_id)))
 ORDER BY a.id DESC LIMIT 30) x;
$$;

CREATE FUNCTION public.t10_workshop_workspace(p_asset bigint,p_before bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a erp_private.fleet_assets; scope record; report boolean; maintenance boolean; cases jsonb; clocks jsonb; documents jsonb;
 today date:=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date;
BEGIN
 SELECT * INTO a FROM erp_private.fleet_assets WHERE id=p_asset;
 IF a.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO scope FROM erp_private.t06_operation_scope(a.id);
 report:=a.status='active' AND erp_private.t05_scope('fleet.inspections.report',scope.company_id,scope.branch_id);
 maintenance:=erp_private.t05_scope('fleet.maintenance.manage',scope.company_id,scope.branch_id);
 IF NOT maintenance AND NOT erp_private.t10_case_visible(scope.company_id,scope.branch_id) AND NOT EXISTS(
   SELECT 1 FROM erp_private.t10_assessments f WHERE f.asset_id=a.id AND erp_private.t10_case_visible(f.company_id,f.branch_id))
 THEN RETURN NULL; END IF;

 SELECT coalesce(jsonb_agg(jsonb_build_object('id',f.id,'kind',f.source_kind,'reference',f.source_ref,'finding',f.finding,
   'occurred',f.occurred_at,'reported_by',r.full_name,'assessed_by',assessor.full_name,'outcome',f.outcome,
   'diagnosis',f.diagnosis,'clock',f.service_clock_id,'proof',CASE WHEN erp_private.document_permission(f.document_id,'dms.documents.preview') THEN f.file_id END,
   'blocking',h.released_at IS NULL OR EXISTS(SELECT 1 FROM erp_private.t10_job_cycles active_job
    JOIN erp_private.fleet_asset_holds active_hold ON active_hold.id=active_job.hold_id
    WHERE active_job.assessment_id=f.id AND active_hold.released_at IS NULL),
   'can_refer',f.document_id IS NOT NULL AND erp_private.document_permission(f.document_id,'dms.documents.preview') AND EXISTS(SELECT 1 FROM erp_private.fleet_commitments c
    JOIN erp_private.t03_employment_periods ep ON ep.id=c.employment_period_id AND ep.employee_id=c.employee_id
    WHERE c.id=f.commitment_id AND c.kind IN('custody','dispatch')
      AND ep.work_period @> (f.occurred_at AT TIME ZONE 'Asia/Dubai')::date),'can_assess',erp_private.t05_scope('workshop.assess',f.company_id,f.branch_id)
     AND public.current_user_profile_id()<>f.reported_by,
   'manage',rights.manage,'release',rights.release,'jobs',coalesce(jobs.rows,'[]')) ORDER BY f.id DESC),'[]') INTO cases
 FROM (SELECT item.* FROM erp_private.t10_assessments item WHERE item.asset_id=p_asset
    AND (p_before IS NULL OR item.id<p_before) AND erp_private.t10_case_visible(item.company_id,item.branch_id)
    ORDER BY item.id DESC LIMIT 25) f
 JOIN public.user_profiles r ON r.id=f.reported_by
 LEFT JOIN public.user_profiles assessor ON assessor.id=f.assessed_by
 JOIN erp_private.fleet_asset_holds h ON h.id=f.first_hold_id
 CROSS JOIN LATERAL(SELECT erp_private.t05_scope('workshop.jobs.manage',f.company_id,f.branch_id) AS manage,
   erp_private.t05_scope('workshop.jobs.release',f.company_id,f.branch_id) AS release,
   erp_private.t05_scope('workshop.assess',f.company_id,f.branch_id) AS assess) rights
 LEFT JOIN LATERAL(SELECT jsonb_agg(jsonb_build_object('id',j.id,'cycle',j.cycle,'revision',j.revision,
   'state',j.state,'scope',j.scope_of_work,'held',jhold.released_at IS NULL,'closed',j.closed_at,
   'worker',CASE WHEN rights.manage OR rights.release OR rights.assess THEN j.assigned_employee_id END,
   'plan_start',j.planned_start,'plan_end',j.planned_end,'actual_start',j.actual_start,'actual_end',j.actual_end,
   'actual_work',CASE WHEN rights.manage OR rights.release OR rights.assess THEN j.actual_work END,'estimate',CASE WHEN rights.manage OR rights.release OR rights.assess THEN j.estimate_aed END,
   'cost',CASE WHEN rights.manage OR rights.release OR rights.assess THEN j.actual_cost_aed END,
   'warranty',j.warranty_ref,'warranty_until',j.warranty_until,'qc',CASE WHEN rights.manage OR rights.release OR rights.assess THEN j.qc_notes END,'returned',j.returned_at,
   'proof',CASE WHEN erp_private.document_permission(j.return_document_id,'dms.documents.preview') THEN j.return_file_id END,
   'independent_qc',j.submitted_by IS DISTINCT FROM public.current_user_profile_id(),
   'workers',CASE WHEN rights.manage AND j.state IN('triage','planned') THEN
    coalesce((SELECT jsonb_agg(to_jsonb(worker) ORDER BY worker.name,worker.id) FROM(
     SELECT e.id,e.full_name_en AS name,e.employee_code AS code FROM public.employees e
     WHERE e.employee_status IN('active','probation') AND e.deleted_at IS NULL AND EXISTS(
      SELECT 1 FROM erp_private.t03_employment_periods ep WHERE ep.employee_id=e.id AND ep.company_id=f.company_id
       AND ep.branch_id=f.branch_id AND ep.work_period @> today) ORDER BY e.full_name_en,e.id) worker),'[]') END,
   'events',CASE WHEN rights.manage OR rights.release OR rights.assess THEN
     (SELECT jsonb_agg(jsonb_build_object('revision',ev.revision,'operation',ev.operation,'at',ev.occurred_at,'reason',ev.reason,
       'by',profile.full_name) ORDER BY ev.revision DESC)
     FROM erp_private.t10_job_events ev JOIN public.user_profiles profile ON profile.id=ev.actor_id WHERE ev.job_cycle_id=j.id)
    END) ORDER BY j.cycle DESC) AS rows
   FROM erp_private.t10_job_cycles j JOIN erp_private.fleet_asset_holds jhold ON jhold.id=j.hold_id WHERE j.assessment_id=f.id) jobs ON true;

 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'label',c.label,'unit',c.unit,'revision',v.id,'baseline_day',v.base_day,
   'baseline_value',v.base_value,'interval',v.interval_value,'notice',v.notice,'tolerance',v.tolerance,'max_age',v.reading_max_age,
   'block',v.block_overdue,'editable',maintenance AND a.status='active',
   'current',erp_private.t10_service_status(c,v,today,statement_timestamp()),
   'history',CASE WHEN maintenance THEN coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.id DESC)
     FROM (SELECT hist.id,hist.base_day,hist.action,hist.reason,hist.last_service_job,hist.previous_service_status,hist.reminder_active
       FROM erp_private.t10_service_versions hist WHERE hist.clock_id=c.id ORDER BY hist.id DESC LIMIT 20) x),'[]') END)
  ORDER BY c.label,c.id),'[]') INTO clocks
 FROM erp_private.t10_service_clocks c JOIN LATERAL (
  SELECT rule.* FROM erp_private.t10_service_versions rule WHERE rule.clock_id=c.id ORDER BY rule.id DESC LIMIT 1) v ON true
 WHERE c.asset_id=a.id AND (maintenance OR erp_private.t10_case_visible(scope.company_id,scope.branch_id));

 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.file DESC),'[]') INTO documents FROM(
  SELECT d.id AS document,v.id AS version,f.id AS file,d.document_no AS number,d.title,t.type_code AS type
  FROM erp_private.fleet_document_parents parent JOIN public.dms_documents d ON d.id=parent.document_id
  JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.deleted_at IS NULL
  JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
  JOIN public.dms_document_files f ON f.document_id=d.id AND f.version_id=v.id AND f.file_role='original'
     AND f.deleted_at IS NULL AND f.integrity_status='verified' AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$'
  JOIN public.dms_document_links l ON l.document_id=d.id AND l.entity_type='fleet_asset' AND l.entity_id=a.id AND l.deleted_at IS NULL
  WHERE parent.asset_id=a.id AND d.status='active' AND d.deleted_at IS NULL AND NOT d.is_archived
   AND erp_private.document_permission(d.id,'dms.documents.preview')
   AND ((report AND t.type_code IN('FLEET_WORKSHOP_FINDING','FLEET_PRE_TRIP_INSPECTION')) OR
    (t.type_code='FLEET_WORKSHOP_RETURN' AND EXISTS(SELECT 1 FROM erp_private.t10_assessments item WHERE item.asset_id=a.id
       AND erp_private.t05_scope('workshop.jobs.release',item.company_id,item.branch_id))))
  ORDER BY f.id DESC LIMIT 80) x;

 RETURN jsonb_build_object('asset',a.id,'number',a.asset_no,'name',a.name,'report',report,
  'maintenance',maintenance AND a.status='active','cases',cases,'clocks',clocks,'documents',documents);
END;
$$;

CREATE FUNCTION public.t10_hr_workshop_referrals(p_before bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM (
 SELECT r.assessment_id AS id,r.employee_id,w.full_name_en AS employee,a.asset_no,f.source_kind,f.occurred_at,
  r.referred_at,r.reason,f.diagnosis,CASE WHEN erp_private.document_permission(f.document_id,'dms.documents.preview') THEN f.file_id END AS proof
 FROM erp_private.t10_hr_referrals r JOIN public.employees w ON w.id=r.employee_id
 JOIN erp_private.t10_assessments f ON f.id=r.assessment_id
 JOIN erp_private.fleet_assets a ON a.id=f.asset_id
 WHERE erp_private.t05_scope('hr.workshop.referrals.view',r.company_id,r.branch_id)
  AND (p_before IS NULL OR r.assessment_id<p_before)
 ORDER BY r.assessment_id DESC LIMIT 30) x;
$$;

REVOKE ALL ON FUNCTION erp_private.t10_case_visible(bigint,bigint),
 public.t10_workshop_assets(bigint,text),public.t10_workshop_workspace(bigint,bigint),public.t10_hr_workshop_referrals(bigint)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t10_workshop_assets(bigint,text),public.t10_workshop_workspace(bigint,bigint),
 public.t10_hr_workshop_referrals(bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
