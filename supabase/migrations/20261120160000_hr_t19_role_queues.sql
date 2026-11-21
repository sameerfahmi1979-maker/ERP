BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Source grants determine both scope choices and the lanes that can contribute rows.
CREATE FUNCTION erp_private.t19_queue_kinds(p_company bigint,p_branch bigint)
RETURNS text[] LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE kinds text[]:='{}';
BEGIN
 IF erp_private.t02_has_scope('hr.actions.view',p_company,p_branch) THEN
   kinds:=array_append(kinds,'pro');
 END IF;
 IF p_branch IS NULL THEN RETURN kinds; END IF;
 IF erp_private.t05_scope('fleet.assets.view',p_company,p_branch) THEN
   IF erp_private.t05_scope('fleet.custody.manage',p_company,p_branch) THEN
     kinds:=array_append(kinds,'custody');
   END IF;
   IF erp_private.t05_scope('fleet.availability.plan',p_company,p_branch)
      OR erp_private.t05_scope('fleet.holds.workshop',p_company,p_branch)
      OR erp_private.t05_scope('fleet.holds.hse',p_company,p_branch) THEN
     kinds:=array_append(kinds,'readiness');
   END IF;
 END IF;
 IF erp_private.t07_ops_readable(p_company,p_branch)
    OR erp_private.t05_scope('fleet.allowance.submit',p_company,p_branch)
    OR erp_private.t05_scope('fleet.allowance.approve',p_company,p_branch) THEN
   kinds:=array_append(kinds,'proof');
 END IF;
 IF erp_private.t05_scope('fleet.time.verify',p_company,p_branch) THEN
   kinds:=array_append(kinds,'discrepancy');
 END IF;
 IF erp_private.t05_scope('workshop.assess',p_company,p_branch)
    OR erp_private.t05_scope('workshop.jobs.manage',p_company,p_branch)
    OR erp_private.t05_scope('workshop.jobs.release',p_company,p_branch)
    OR erp_private.t05_scope('fleet.maintenance.manage',p_company,p_branch) THEN
   kinds:=array_append(kinds,'workshop');
 END IF;
 IF erp_private.t02_has_scope('hr.recovery.review',p_company,p_branch)
    OR (erp_private.t02_has_scope('hr.recovery.accounts',p_company,p_branch)
        AND erp_private.t02_has_scope('hr.payroll.view',p_company,p_branch)) THEN
   kinds:=array_append(kinds,'recovery');
 END IF;
 IF erp_private.t14_run_authorized(p_company,p_branch)
    OR erp_private.t15_review_permissions(p_company,p_branch,'approve') THEN
   kinds:=array_append(kinds,'payroll');
 END IF;
 IF erp_private.t16_can(p_company,p_branch,'issue') OR erp_private.t16_can(p_company,p_branch,'reconcile') THEN
   kinds:=array_append(kinds,'payment');
 END IF;
 IF erp_private.t18_can(p_company,p_branch,'view') THEN
   kinds:=array_append(kinds,'exit');
 END IF;
 RETURN kinds;
END $$;

CREATE FUNCTION public.t19_queue_scopes()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE answer jsonb;
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN
   RAISE EXCEPTION 'Work queues require a current ERP session' USING ERRCODE='42501';
 END IF;
 WITH assignments AS MATERIALIZED (
   SELECT DISTINCT u.owner_company_id company,u.branch_id branch
   FROM public.user_roles u
   WHERE u.user_profile_id=public.current_user_profile_id() AND u.is_active AND u.owner_company_id IS NOT NULL
 ), candidates AS (
   SELECT a.company,a.branch FROM assignments a
   UNION
   SELECT a.company,b.id FROM assignments a JOIN public.branches b ON b.owner_company_id=a.company
   WHERE a.branch IS NULL AND b.status='active' AND b.operating_status='active'
 ), allowed AS MATERIALIZED (
   SELECT c.company,c.branch,erp_private.t19_queue_kinds(c.company,c.branch) kinds FROM candidates c
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('company',a.company,'branch',a.branch,'company_name',c.legal_name_en,
    'branch_name',b.branch_name_en,'kinds',a.kinds) ORDER BY c.legal_name_en,b.branch_name_en,a.company,a.branch),'[]'::jsonb)
 INTO answer
 FROM allowed a JOIN public.owner_companies c ON c.id=a.company LEFT JOIN public.branches b ON b.id=a.branch
 WHERE cardinality(a.kinds)>0;
 RETURN answer;
END $$;

-- The output migration supplies the internal original check. This default
-- keeps role queues usable before the independent filing workflow is installed.
CREATE FUNCTION erp_private.t19_internal_sheet_evidence(p_work bigint)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT 'missing'::text;
$$;

CREATE FUNCTION erp_private.t19_queue_rows(p_company bigint,p_branch bigint,p_kinds text[],p_day date,p_at timestamptz)
RETURNS TABLE(kind text,source_type text,source_id text,reference text,title text,responsible text,
  assignee text,action text,state text,opened_on date,due_on date,evidence text,href text)
LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 actor bigint:=public.current_user_profile_id();
 can_proof_review boolean;
 can_proof_submit boolean;
 can_ops_read boolean;
 can_maintain boolean;
 can_assess boolean;
 can_manage_job boolean;
 can_release_job boolean;
 can_recovery_review boolean;
 can_recovery_accounts boolean;
 can_run boolean;
 can_payroll_approve boolean;
 can_issue boolean;
 can_reconcile boolean;
BEGIN
 IF 'pro'=ANY(p_kinds) THEN
   RETURN QUERY SELECT 'pro','pro-process',p.id::text,'PRO #'||p.id,p.process_title,'PRO',coalesce(person.display_name,person.full_name),
    CASE p.process_status WHEN 'waiting_for_document' THEN 'Follow up on required documents'
      WHEN 'submitted' THEN 'Follow up on submitted process'
      WHEN 'approved' THEN 'Record completion' ELSE 'Review PRO process' END,
    p.process_status,p.request_date,p.target_date,
    CASE WHEN p.related_document_id IS NULL THEN 'in-workflow'
      WHEN erp_private.document_permission(p.related_document_id,'dms.documents.preview') THEN 'available'
      ELSE 'restricted' END,
    '/admin/hr/actions/pro?record='||p.id
   FROM public.employee_pro_processes p JOIN public.employees e ON e.id=p.employee_id AND e.deleted_at IS NULL
   LEFT JOIN public.user_profiles person ON person.id=p.assigned_to
     AND (person.auth_user_id=auth.uid()
       OR public.current_user_has_permission_in_company('users.view',person.owner_company_id)
       OR (person.branch_id IS NOT NULL AND public.current_user_has_permission_in_branch('users.view',person.branch_id)))
   WHERE e.owner_company_id=p_company AND e.branch_id IS NOT DISTINCT FROM p_branch
     AND p.deleted_at IS NULL AND p.process_status IN('draft','requested','in_progress','waiting_for_document','submitted','approved')
     AND public.current_user_can_view_employee_hr_actions(e.id);
 END IF;

 IF 'custody'=ANY(p_kinds) THEN
   RETURN QUERY SELECT 'custody','fleet-commitment',c.id::text,a.asset_no,'Custody #'||c.id,'Fleet custodian',NULL::text,
    'Record actual return','overdue',(lower(c.committed_during) AT TIME ZONE 'Asia/Dubai')::date,
    (c.planned_return AT TIME ZONE 'Asia/Dubai')::date,'in-workflow','/modules/fleet/'||a.id||'?custodyBefore='||(c.id+1)
   FROM erp_private.fleet_commitments c JOIN erp_private.fleet_assets a ON a.id=c.asset_id
   CROSS JOIN LATERAL erp_private.t06_operation_scope(a.id) s
   WHERE c.company_id=p_company AND c.branch_id=p_branch AND c.status='active' AND c.planned_return<p_at
     AND c.kind IN('custody','dispatch') AND ROW(s.company_id,s.branch_id)=ROW(p_company,p_branch)
     AND erp_private.t06_custody_visible(a.id);
 END IF;

 IF 'readiness'=ANY(p_kinds) THEN
   RETURN QUERY SELECT 'readiness','fleet-hold',h.id::text,a.asset_no,'Asset hold #'||h.id,
     CASE h.kind WHEN 'hse' THEN 'HSE' ELSE 'Workshop' END,NULL::text,'Review readiness hold',
     h.kind||'-hold',(h.placed_at AT TIME ZONE 'Asia/Dubai')::date,NULL::date,'in-workflow','/modules/fleet/'||a.id
   FROM erp_private.fleet_asset_holds h JOIN erp_private.fleet_assets a ON a.id=h.asset_id
   WHERE a.owner_company_id=p_company AND a.home_branch_id=p_branch AND h.released_at IS NULL
     AND erp_private.t06_custody_visible(a.id)
     AND (erp_private.t05_scope('fleet.availability.plan',p_company,p_branch)
       OR erp_private.t05_scope(CASE h.kind WHEN 'hse' THEN 'fleet.holds.hse' ELSE 'fleet.holds.workshop' END,p_company,p_branch));

   IF erp_private.t05_scope('fleet.availability.plan',p_company,p_branch) THEN
     RETURN QUERY SELECT 'readiness','fleet-asset',a.id::text,a.asset_no,'Asset readiness','Fleet operations',NULL::text,
      'Review missing readiness requirements',issue.code,(a.created_at AT TIME ZONE 'Asia/Dubai')::date,
      NULL::date,'in-workflow','/modules/fleet/'||a.id
     FROM erp_private.fleet_assets a
     CROSS JOIN LATERAL erp_private.t06_operation_scope(a.id) s
     LEFT JOIN erp_private.fleet_availability_policies p ON p.company_id=a.owner_company_id AND p.category=a.category
       AND p.approved_at IS NOT NULL AND p.valid_during @> p_day
     CROSS JOIN LATERAL (SELECT CASE
       WHEN p.id IS NULL THEN 'policy-missing'
       WHEN p.registration_required AND NOT erp_private.t06_asset_proof_current(a.id,'registration',p_day,p_day) THEN 'registration-required'
       WHEN p.insurance_required AND NOT erp_private.t06_asset_proof_current(a.id,'insurance',p_day,p_day) THEN 'insurance-required'
     END AS code) issue
     WHERE ROW(s.company_id,s.branch_id)=ROW(p_company,p_branch) AND a.status='active'
       AND erp_private.t06_custody_visible(a.id) AND issue.code IS NOT NULL;
   END IF;
 END IF;

 IF 'proof'=ANY(p_kinds) THEN
   can_proof_submit:=erp_private.t05_scope('fleet.allowance.submit',p_company,p_branch);
   can_proof_review:=erp_private.t05_scope('fleet.allowance.approve',p_company,p_branch);
   can_ops_read:=erp_private.t07_ops_readable(p_company,p_branch);
   RETURN QUERY SELECT 'proof','trip-leg',f.id::text,o.order_no,'Trip leg '||l.sequence,
    CASE WHEN rights.approve THEN 'Fleet approval' ELSE 'Fleet operations' END,NULL::text,
    CASE WHEN rights.approve THEN 'Review proof exception'
      WHEN delivery.state IN('partial','disputed') THEN 'Resolve delivery discrepancy'
      ELSE 'Follow up on signed delivery proof' END,
    CASE WHEN exception.id IS NOT NULL THEN 'pending-exception-review'
      WHEN delivery.state IN('partial','disputed') THEN delivery.state ELSE 'signed-proof-required' END,
    (coalesce(exception.submitted_at,delivery.recorded_at,f.arrived_at) AT TIME ZONE 'Asia/Dubai')::date,
    NULL::date,
    CASE WHEN proof.document_id IS NULL THEN 'missing'
      WHEN erp_private.document_permission(proof.document_id,'dms.documents.preview') THEN 'available'
      ELSE 'restricted' END,
    CASE WHEN NOT rights.approve AND can_ops_read THEN '/modules/fleet/operations/'||o.id
      ELSE '/modules/fleet/allowances?order='||o.id END
   FROM erp_private.fleet_operation_orders o JOIN erp_private.fleet_trip_legs l ON l.order_id=o.id
   JOIN erp_private.fleet_trip_leg_actuals f ON f.leg_id=l.id
   LEFT JOIN LATERAL (SELECT df.state,df.evidence_id,df.recorded_at FROM erp_private.fleet_trip_delivery_facts df
     WHERE df.actual_id=f.id ORDER BY df.id DESC LIMIT 1) delivery ON true
   LEFT JOIN erp_private.t09_pod_exceptions exception ON exception.actual_id=f.id AND exception.state='pending'
   LEFT JOIN erp_private.fleet_operation_evidence proof ON proof.id=coalesce(exception.evidence_id,delivery.evidence_id)
   CROSS JOIN LATERAL (SELECT exception.id IS NOT NULL AND can_proof_review AND exception.submitted_by<>actor
     AND erp_private.t09_independent(f.id,actor) AND erp_private.document_permission(proof.document_id,'dms.documents.preview')
     AS approve) rights
   WHERE o.company_id=p_company AND o.branch_id=p_branch AND o.kind='trip' AND o.status<>'cancelled'
     AND f.load='loaded' AND erp_private.t09_signed_pod(f.id) IS NULL
     AND (can_ops_read OR can_proof_submit OR rights.approve);
 END IF;

 IF 'discrepancy'=ANY(p_kinds) THEN
   RETURN QUERY SELECT 'discrepancy','fleet-work',w.id::text,o.order_no,'Fleet work #'||w.id,
     'Operations time verifier',NULL::text,
     CASE WHEN evidence.status='missing' THEN 'Follow up on signed timesheet'
       ELSE 'Reconcile Fleet time against signed work' END,
     CASE WHEN evidence.status='missing' THEN 'signed-proof-required'
       WHEN review.id IS NULL THEN 'awaiting-verification' ELSE 'time-discrepancy' END,
     w.day,NULL::date,
     evidence.status,
     '/modules/fleet/time?order='||o.id||'&before='||(w.id+1)
   FROM erp_private.t08_fleet_work w JOIN erp_private.fleet_operation_orders o ON o.id=w.order_id
   LEFT JOIN LATERAL (SELECT r.id FROM erp_private.t08_time_reviews r WHERE r.work_id=w.id ORDER BY r.id DESC LIMIT 1) review ON true
   CROSS JOIN LATERAL (
     SELECT count(*)>0 AS present,
       coalesce(bool_or(erp_private.document_permission((d->>'document')::bigint,'dms.documents.preview')),false) AS readable
     FROM jsonb_array_elements(erp_private.t08_sheet_sources(w.id)) d
     WHERE (d->>'current')::boolean
   ) rental_proof
   CROSS JOIN LATERAL (SELECT erp_private.t19_internal_sheet_evidence(w.id) AS status) internal_proof
   CROSS JOIN LATERAL (SELECT CASE
     WHEN rental_proof.readable OR internal_proof.status='available' THEN 'available'
     WHEN rental_proof.present OR internal_proof.status='restricted' THEN 'restricted'
     ELSE 'missing' END AS status) evidence
   WHERE w.host_company_id=p_company AND w.host_branch_id=p_branch AND o.status<>'cancelled'
     AND w.entered_by<>actor AND erp_private.t08_ops_readable(o.id,w.host_company_id,w.host_branch_id)
     AND (w.activity<>'internal' OR NOT erp_private.t12_is_subject(actor,w.employee_id))
     AND (review.id IS NULL OR NOT(tstzmultirange(w.work_period) <@ erp_private.t08_current_match(w.id,review.id))
       OR (w.activity='internal' AND evidence.status='missing'));
 END IF;

 IF 'workshop'=ANY(p_kinds) THEN
   can_maintain:=erp_private.t05_scope('fleet.maintenance.manage',p_company,p_branch);
   can_assess:=erp_private.t05_scope('workshop.assess',p_company,p_branch);
   can_manage_job:=erp_private.t05_scope('workshop.jobs.manage',p_company,p_branch);
   can_release_job:=erp_private.t05_scope('workshop.jobs.release',p_company,p_branch);

   RETURN QUERY SELECT 'workshop','workshop-finding',f.id::text,a.asset_no,'Finding #'||f.id,
     CASE WHEN f.outcome IS NULL THEN 'Workshop assessor' ELSE 'Workshop supervisor' END,NULL::text,
     CASE WHEN f.outcome IS NULL THEN 'Assess the finding' ELSE 'Open repair job card' END,
     CASE WHEN f.outcome IS NULL THEN 'assessment-due' ELSE 'repair-required' END,
     (coalesce(f.assessed_at,f.occurred_at) AT TIME ZONE 'Asia/Dubai')::date,NULL::date,
     CASE WHEN f.document_id IS NULL THEN 'in-workflow'
       WHEN erp_private.document_permission(f.document_id,'dms.documents.preview') THEN 'available'
       ELSE 'restricted' END,
     '/modules/workshop?asset='||a.id||'&before='||(f.id+1)
   FROM erp_private.t10_assessments f JOIN erp_private.fleet_assets a ON a.id=f.asset_id
   JOIN erp_private.fleet_asset_holds h ON h.id=f.first_hold_id AND h.released_at IS NULL
   WHERE f.company_id=p_company AND f.branch_id=p_branch
     AND (f.outcome IS NULL AND can_assess AND f.reported_by<>actor
       OR f.outcome='repair' AND can_manage_job AND NOT EXISTS(
         SELECT 1 FROM erp_private.t10_job_cycles j WHERE j.assessment_id=f.id));

   RETURN QUERY SELECT 'workshop','workshop-job',j.id::text,a.asset_no,'Job #'||j.id||' / cycle '||j.cycle,
     CASE WHEN j.state='qc' THEN 'Workshop release reviewer' ELSE 'Workshop supervisor' END,
     NULL::text,
     CASE j.state WHEN 'triage' THEN 'Plan the repair' WHEN 'planned' THEN 'Start planned repair'
       WHEN 'in-progress' THEN 'Submit the repair for QC' ELSE 'Review repair and release hold' END,
     j.state,(j.opened_at AT TIME ZONE 'Asia/Dubai')::date,(j.planned_end AT TIME ZONE 'Asia/Dubai')::date,
     'in-workflow','/modules/workshop?asset='||a.id||'&before='||(f.id+1)
   FROM erp_private.t10_job_cycles j JOIN erp_private.t10_assessments f ON f.id=j.assessment_id
   JOIN erp_private.fleet_assets a ON a.id=f.asset_id
   JOIN erp_private.fleet_asset_holds h ON h.id=j.hold_id AND h.released_at IS NULL
   WHERE f.company_id=p_company AND f.branch_id=p_branch AND j.state<>'closed'
     AND (j.state='qc' AND can_release_job AND j.submitted_by IS DISTINCT FROM actor
       OR j.state<>'qc' AND can_manage_job);

   IF can_maintain THEN
     RETURN QUERY SELECT 'workshop','maintenance-clock',c.id::text,a.asset_no,'Service clock #'||c.id,
       'Fleet maintenance',NULL::text,
       CASE status.facts->>'status' WHEN 'unavailable' THEN 'Verify the current meter reading'
         ELSE 'Review preventive maintenance' END,
       status.facts->>'status',(v.created_at AT TIME ZONE 'Asia/Dubai')::date,
       (status.facts->>'due_day')::date,'in-workflow','/modules/workshop?asset='||a.id
     FROM erp_private.t10_service_clocks c JOIN erp_private.fleet_assets a ON a.id=c.asset_id
     CROSS JOIN LATERAL erp_private.t06_operation_scope(a.id) s
     CROSS JOIN LATERAL (SELECT r.* FROM erp_private.t10_service_versions r WHERE r.clock_id=c.id ORDER BY r.id DESC LIMIT 1) v
     CROSS JOIN LATERAL (SELECT erp_private.t10_service_status(c,v,p_day,p_at) facts) status
     WHERE ROW(s.company_id,s.branch_id)=ROW(p_company,p_branch) AND a.status='active'
       AND status.facts->>'status' IN('due','overdue','upcoming','unavailable')
       AND (status.facts->>'status' IN('due','overdue') OR v.reminder_active OR (status.facts->>'blocking')::boolean);
   END IF;
 END IF;

 IF 'recovery'=ANY(p_kinds) THEN
   can_recovery_review:=erp_private.t02_has_scope('hr.recovery.review',p_company,p_branch);
   can_recovery_accounts:=erp_private.t02_has_scope('hr.recovery.accounts',p_company,p_branch)
     AND erp_private.t02_has_scope('hr.payroll.view',p_company,p_branch);
   RETURN QUERY SELECT 'recovery','recovery-case',c.id::text,'Recovery #'||c.id,
     CASE c.source_kind WHEN 'fine' THEN 'Fine recovery' ELSE 'Workshop recovery' END,
     CASE WHEN todo.step IN('hr-review','dispute-review') THEN 'HR recovery reviewer' ELSE 'Accounts recovery reviewer' END,NULL::text,
     CASE todo.step WHEN 'hr-review' THEN 'Review current recovery facts' WHEN 'dispute-review' THEN 'Review open recovery dispute'
       WHEN 'financial-review' THEN 'Reconcile current recovery facts'
       WHEN 'allocation-follow-up' THEN 'Follow up on outstanding allocation' ELSE 'Review outstanding recovery' END,
     todo.step,(c.reported_at AT TIME ZONE 'Asia/Dubai')::date,NULL::date,'in-workflow',
     '/admin/hr/operations/recoveries?branch='||p_branch||'&month='||to_char(p_day,'YYYY-MM')||'&case='||c.id
   FROM erp_private.t13_cases c
   CROSS JOIN LATERAL (SELECT erp_private.t13_financial_summary(c.id) AS facts) summary
   CROSS JOIN LATERAL (SELECT CASE
      WHEN can_recovery_review AND c.source_status<>'cancelled' AND c.subject_status IN('verified','no-referral')
        AND NOT (summary.facts->>'current_review')::boolean
        THEN 'hr-review'
      WHEN can_recovery_review AND EXISTS(SELECT 1 FROM erp_private.t13_disputes opened
        WHERE opened.case_id=c.id AND opened.resolves_id IS NULL AND opened.actor_id<>actor
          AND NOT EXISTS(SELECT 1 FROM erp_private.t13_disputes solved WHERE solved.resolves_id=opened.id))
        THEN 'dispute-review'
      WHEN can_recovery_accounts AND c.source_status<>'cancelled' AND (summary.facts->>'current_review')::boolean
        AND summary.facts->>'decision'='employee' AND NOT (summary.facts->>'current_finance')::boolean THEN 'financial-review'
      WHEN can_recovery_accounts AND ((summary.facts->>'unallocated')::boolean OR (summary.facts->>'refund_due')::numeric>0)
        THEN 'allocation-follow-up'
      WHEN can_recovery_accounts AND c.source_status<>'cancelled'
        AND ((summary.facts->>'outstanding')::numeric>0 OR (summary.facts->>'authority_payable')::numeric>0)
        THEN 'recovery-follow-up'
     END AS step) todo
   WHERE coalesce(c.employer_company_id,c.company_id)=p_company AND coalesce(c.employer_branch_id,c.branch_id)=p_branch
     AND NOT erp_private.t12_is_subject(actor,c.employee_id) AND todo.step IS NOT NULL;
 END IF;

 IF 'payroll'=ANY(p_kinds) THEN
   can_run:=erp_private.t14_run_authorized(p_company,p_branch);
   can_payroll_approve:=erp_private.t15_review_permissions(p_company,p_branch,'approve');

   IF can_run THEN
     RETURN QUERY SELECT 'payroll','payroll-version',v.id::text,'Payroll '||to_char(r.month,'YYYY-MM'),'Payroll input gaps',
       'Payroll preparer',NULL::text,'Review payroll input gaps','review-required',
       (v.created_at AT TIME ZONE 'Asia/Dubai')::date,NULL::date,'in-workflow',
       '/admin/hr/payroll/runs?scope='||p_company||'.'||p_branch||'&month='||to_char(r.month,'YYYY-MM')||'&version='||v.id
     FROM erp_private.t14_runs r
     CROSS JOIN LATERAL (SELECT draft.* FROM erp_private.t14_versions draft WHERE draft.run_id=r.id ORDER BY draft.number DESC LIMIT 1) v
     WHERE r.company_id=p_company AND r.branch_id=p_branch AND v.exception_count>0
       AND NOT EXISTS(SELECT 1 FROM erp_private.t15_reviews rv WHERE rv.run_id=r.id AND rv.state IN('submitted','approved'));
   END IF;

   IF can_payroll_approve THEN
     RETURN QUERY SELECT 'payroll','payroll-review',rv.id::text,'Payroll '||to_char(r.month,'YYYY-MM'),'Payroll approval',
       'Independent payroll approver',NULL::text,'Review exact payroll version',rv.state,
       (rv.submitted_at AT TIME ZONE 'Asia/Dubai')::date,NULL::date,'in-workflow',
       '/admin/hr/payroll/approvals?scope='||p_company||'.'||p_branch||'&month='||to_char(r.month,'YYYY-MM')||'&review='||rv.id
     FROM erp_private.t15_reviews rv JOIN erp_private.t14_runs r ON r.id=rv.run_id
     WHERE r.company_id=p_company AND r.branch_id=p_branch AND rv.state='submitted' AND rv.submitted_by<>actor;
   END IF;
 END IF;

 IF 'payment'=ANY(p_kinds) THEN
   can_issue:=erp_private.t16_can(p_company,p_branch,'issue');
   can_reconcile:=erp_private.t16_can(p_company,p_branch,'reconcile');

   IF can_issue THEN
     RETURN QUERY SELECT 'payment','payroll-dispatch',rv.id::text,'Payroll '||to_char(r.month,'YYYY-MM'),'Payroll issue',
       'Payroll issue officer',NULL::text,CASE WHEN b.id IS NULL THEN 'Prepare approved payroll issue'
         ELSE 'Follow up on payroll handoff' END,
       coalesce(erp_private.t16_batch_state(b.id),'not-issued'),
       (coalesce(b.issued_at,rv.decided_at) AT TIME ZONE 'Asia/Dubai')::date,NULL::date,'in-workflow',
       '/admin/hr/payroll/settlement?scope='||p_company||'.'||p_branch||'&month='||to_char(r.month,'YYYY-MM')||'&review='||rv.id
     FROM erp_private.t15_reviews rv JOIN erp_private.t14_runs r ON r.id=rv.run_id
     LEFT JOIN erp_private.t16_batches b ON b.review_id=rv.id
     WHERE r.company_id=p_company AND r.branch_id=p_branch AND rv.state='approved'
       AND rv.replacement_requested_by IS NULL
       AND (b.id IS NULL OR EXISTS(SELECT 1 FROM erp_private.t16_batch_lanes(b.id) l
         WHERE l.current_state IN('prepared','handoff-pending','submitted','acknowledged','rejected')));
   END IF;

   IF can_reconcile THEN
     RETURN QUERY SELECT 'payment','payroll-payment',b.id||'/'||m.employee_id,
       'Payroll '||to_char(b.month,'YYYY-MM'),'Employee payment #'||m.employee_id,
       'Accounts payment reconciler',NULL::text,
       CASE pending.step WHEN 'paid-unallocated' THEN 'Reconcile verified payment allocations' ELSE 'Follow up on payroll payment' END,
       pending.step,(b.issued_at AT TIME ZONE 'Asia/Dubai')::date,NULL::date,'in-workflow',
       '/admin/hr/payroll/settlement?scope='||p_company||'.'||p_branch||'&month='||to_char(b.month,'YYYY-MM')
        ||'&review='||b.review_id||'&employee='||m.employee_id
        ||CASE WHEN m.employee_id>1 THEN '&after='||(m.employee_id-1) ELSE '' END
     FROM erp_private.t16_batches b JOIN erp_private.t15_reviews rv ON rv.id=b.review_id
     JOIN erp_private.t16_batch_results m ON m.batch_id=b.id
     CROSS JOIN LATERAL (SELECT erp_private.t16_result_status(b.id,m.employee_id)->>'status' AS step) pending
     WHERE b.company_id=p_company AND b.branch_id=p_branch AND rv.state='approved' AND rv.decided_by<>actor
       AND NOT erp_private.t12_is_subject(actor,m.employee_id)
       AND erp_private.t16_channel_ready(b.id,m.employee_id) AND pending.step<>'reconciled';
   END IF;
 END IF;

 IF 'exit'=ANY(p_kinds) THEN
   RETURN QUERY SELECT 'exit','exit-case',e.id::text,'Exit #'||e.id,'Exit settlement',
     CASE
       WHEN v.step IN('submitted','request-revoke') THEN 'Independent exit approver'
       WHEN payment.step IS NOT NULL AND payment.step<>'reconciled' THEN 'Exit payment reconciler'
       WHEN v.step='reviewed' THEN 'Accounts exit reviewer'
       ELSE 'HR exit case owner' END,
     NULL::text,
     CASE
       WHEN v.step IN('submitted','request-revoke') THEN 'Review exact exit settlement version'
       WHEN payment.step='reconciled' THEN 'Review clearance and close exit'
       WHEN payment.step IS NOT NULL THEN 'Follow up on final settlement payment'
       WHEN v.step='reviewed' THEN 'Submit reviewed exit settlement'
       ELSE 'Review clearance and settlement facts' END,
     CASE WHEN v.step='request-revoke' THEN v.step ELSE coalesce(payment.step,v.step,e.case_status) END,(e.created_at AT TIME ZONE 'Asia/Dubai')::date,
     coalesce(c.last_day,e.employment_end_date),'in-workflow',
     '/admin/hr/actions/final-settlement?scope='||p_company||'.'||p_branch||'&eos='||e.id
   FROM public.employee_eos_cases e JOIN public.employees emp ON emp.id=e.employee_id AND emp.deleted_at IS NULL
   LEFT JOIN erp_private.t18_cases c ON c.eos_id=e.id
   LEFT JOIN erp_private.t03_employment_periods ep ON c.eos_id IS NULL AND ep.employee_id=e.employee_id
     AND ep.work_period @> e.employment_end_date
   LEFT JOIN LATERAL (SELECT ev.id,erp_private.t18_version_state(ev.id) step
     FROM erp_private.t18_versions ev WHERE ev.eos_id=e.id ORDER BY ev.number DESC LIMIT 1) v ON true
   LEFT JOIN erp_private.t18_approvals a ON a.eos_id=e.id AND a.version_id=v.id AND a.state='approved'
   LEFT JOIN LATERAL (SELECT erp_private.t18_payment_status(a.version_id)->>'state' step WHERE a.id IS NOT NULL) payment ON true
   WHERE e.deleted_at IS NULL AND e.case_status NOT IN('closed','cancelled') AND e.final_settlement_status<>'completed'
     AND (ROW(c.company_id,c.branch_id)=ROW(p_company,p_branch) OR c.eos_id IS NULL
       AND (ROW(ep.company_id,ep.branch_id)=ROW(p_company,p_branch)
         OR e.employment_end_date IS NULL AND ROW(emp.owner_company_id,emp.branch_id)=ROW(p_company,p_branch)));
 END IF;
END $$;

CREATE FUNCTION public.t19_work_queue(
 p_company bigint,p_branch bigint,p_kind text DEFAULT 'all',p_query text DEFAULT '',
 p_page integer DEFAULT 1,p_size integer DEFAULT 25)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE
 kinds text[];
 now_at timestamptz:=statement_timestamp();
 day_at date:=(now_at AT TIME ZONE 'Asia/Dubai')::date;
 search text:=lower(btrim(p_query));
 answer jsonb;
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN
   RAISE EXCEPTION 'Work queues require a current ERP session' USING ERRCODE='42501';
 END IF;
 IF p_company IS NULL OR p_company<1 OR p_branch<1 OR p_kind IS NULL
   OR p_kind NOT IN('all','pro','custody','readiness','proof','discrepancy','workshop','recovery','payroll','payment','exit')
   OR p_query IS NULL OR length(p_query)>100 OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 2000
   OR p_size IS NULL OR p_size NOT BETWEEN 1 AND 50 THEN
   RAISE EXCEPTION 'Invalid work queue filters' USING ERRCODE='22023';
 END IF;
 kinds:=erp_private.t19_queue_kinds(p_company,p_branch);
 IF cardinality(kinds)=0 OR (p_kind<>'all' AND NOT(p_kind=ANY(kinds))) THEN
   RAISE EXCEPTION 'Work queue is restricted in this scope' USING ERRCODE='42501';
 END IF;
 IF p_kind<>'all' THEN kinds:=ARRAY[p_kind]; END IF;
 WITH matching AS MATERIALIZED (
   SELECT r.*,greatest(0,day_at-r.opened_on) age_days,
      CASE WHEN r.due_on IS NOT NULL THEN greatest(0,day_at-r.due_on) END overdue_days
   FROM erp_private.t19_queue_rows(p_company,p_branch,kinds,day_at,now_at) r
   WHERE search='' OR strpos(lower(concat_ws(' ',r.reference,r.title,r.state,r.responsible,r.assignee,r.source_id)),search)>0
 ), paged AS (
   SELECT * FROM matching m ORDER BY m.due_on NULLS LAST,m.opened_on,m.kind,m.source_type,m.source_id
   LIMIT p_size OFFSET ((p_page-1)*p_size)
 )
 SELECT jsonb_build_object('as_of',day_at,'total',(SELECT count(*) FROM matching),'page',p_page,'page_size',p_size,
   'rows',coalesce(jsonb_agg(to_jsonb(r) ORDER BY r.due_on NULLS LAST,r.opened_on,r.kind,r.source_type,r.source_id),'[]'))
 INTO answer FROM paged r;
 RETURN answer;
END $$;

REVOKE ALL ON FUNCTION erp_private.t19_queue_kinds(bigint,bigint),erp_private.t19_internal_sheet_evidence(bigint),
 erp_private.t19_queue_rows(bigint,bigint,text[],date,timestamptz),
 public.t19_queue_scopes(),public.t19_work_queue(bigint,bigint,text,text,integer,integer)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t19_queue_scopes(),public.t19_work_queue(bigint,bigint,text,text,integer,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
