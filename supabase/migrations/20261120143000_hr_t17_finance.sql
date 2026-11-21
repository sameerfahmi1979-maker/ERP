BEGIN;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('hr.payroll.finance.reconcile','View aggregate payroll reconciliation for Finance','hr','payroll_finance_reconcile','held');

INSERT INTO public.erp_report_registry(report_code,report_name_en,module_code,report_category,description_en,
 default_output_formats,branding_strategy,required_permissions,sensitive_profile,filter_schema_json,
 supports_numbering,supports_scheduling,is_letter_type,is_system)
VALUES ('FIN_PAYROLL_RECONCILIATION','Payroll Reconciliation','FINANCE','summary',
 'Compare GM-approved payroll and verified payments for one branch or a fully authorized employer.',
 ARRAY['screen'],'none',ARRAY['reports.view','reports.run','hr.payroll.finance.reconcile'],
 'payroll','{"filters":["owner_company_id","branch_id","payroll_month"]}',false,false,false,true);

-- A NULL branch requires company-wide assignments for all three permissions.
CREATE FUNCTION erp_private.t17_finance_can(p_company bigint,p_branch bigint)
RETURNS boolean LANGUAGE sql VOLATILE SET search_path='' AS $$
 SELECT p_company IS NOT NULL
  AND erp_private.t02_has_scope('hr.payroll.finance.reconcile',p_company,p_branch)
  AND erp_private.t02_has_scope('reports.view',p_company,p_branch)
  AND erp_private.t02_has_scope('reports.run',p_company,p_branch);
$$;

CREATE FUNCTION public.t17_payroll_finance_scopes()
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('company_id',company_id,'branch_id',branch_id,
    'company',company,'branch',branch) ORDER BY company,branch_id NULLS FIRST,branch),'[]'::jsonb)
 FROM (
   SELECT c.id AS company_id,NULL::bigint AS branch_id,c.legal_name_en AS company,'All active branches'::text AS branch
   FROM public.owner_companies c
   WHERE c.status='active' AND erp_private.t17_finance_can(c.id,NULL)
   UNION ALL
   SELECT c.id,b.id,c.legal_name_en,b.branch_name_en
   FROM public.owner_companies c JOIN public.branches b ON b.owner_company_id=c.id
   WHERE c.status='active' AND b.status='active' AND b.operating_status='active'
    AND erp_private.t17_finance_can(c.id,b.id)
 ) scopes;
$$;

CREATE FUNCTION public.t17_payroll_finance_report(p_company bigint,p_branch bigint,p_month date)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE result jsonb;
BEGIN
 IF NOT erp_private.t17_finance_can(p_company,p_branch) THEN
  RAISE EXCEPTION 'Payroll reconciliation scope unavailable' USING ERRCODE='42501';
 END IF;
 IF p_month IS NULL OR NOT isfinite(p_month) OR extract(day FROM p_month)<>1 THEN
  RAISE EXCEPTION 'Select an exact payroll month' USING ERRCODE='22023';
 END IF;

 WITH anchor AS (
  SELECT r.id,r.branch_id,branch.branch_name_en AS branch
  FROM erp_private.t14_runs r JOIN public.branches branch ON branch.id=r.branch_id AND branch.owner_company_id=r.company_id
  WHERE r.company_id=p_company AND r.month=p_month AND (p_branch IS NULL OR r.branch_id=p_branch)
    AND branch.status='active' AND branch.operating_status='active'
 ), approvals AS MATERIALIZED (
  SELECT review.id,review.version_id,review.state,v.number,review.digest,b.id AS batch_id,a.branch
  FROM anchor a JOIN erp_private.t15_reviews review ON review.run_id=a.id AND review.state IN ('approved','superseded')
  JOIN erp_private.t14_versions v ON v.id=review.version_id AND v.run_id=a.id AND v.digest=review.digest
  LEFT JOIN erp_private.t16_batches b ON b.review_id=review.id AND b.version_id=review.version_id
    AND b.company_id=p_company AND b.branch_id=a.branch_id AND b.month=p_month AND b.digest=review.digest
 ), approved_results AS MATERIALIZED (
  SELECT e.version_id,e.employee_id,e.currency,e.gross,e.deductions,e.net,a.batch_id,
    erp_private.t16_result_status(a.batch_id,e.employee_id) AS settlement
  FROM approvals a JOIN erp_private.t14_results e ON e.version_id=a.version_id
  WHERE a.state='approved' AND e.state='ready'
 ), result_amounts AS (
  SELECT r.*,
    coalesce(r.settlement->>'status','unpaid') AS settlement_state,
    coalesce((r.settlement->>'verified_cash')::numeric,0) AS verified_cash,
    coalesce((r.settlement->>'applied_wages')::numeric,0) AS applied_wages,
    coalesce((r.settlement->>'applied_deductions')::numeric,0) AS applied_deductions,
    coalesce((r.settlement->>'unallocated')::numeric,0) AS unallocated_cash,
    coalesce((r.settlement->>'remaining')::numeric,r.net) AS outstanding_cash
  FROM approved_results r
 ), current_allocations AS (
  SELECT a.line_id,sum(a.amount) AS applied
  FROM approvals h JOIN erp_private.t16_payments p ON p.batch_id=h.batch_id AND p.version_id=h.version_id
  JOIN erp_private.t16_allocation_decisions d ON d.payment_id=p.id
  JOIN erp_private.t16_payment_allocations a ON a.decision_id=d.id
  WHERE h.state='approved' AND NOT EXISTS(SELECT 1 FROM erp_private.t16_payment_reversals x WHERE x.payment_id=p.id)
  GROUP BY a.line_id
 ), approved_lines AS MATERIALIZED (
  SELECT l.version_id,l.employee_id,l.category,l.kind,l.currency,l.amount,coalesce(c.applied,0) AS applied,
   CASE WHEN l.original_on<p_month THEN date_trunc('month',l.original_on::timestamp)::date END AS work_month,
   salary.type_id AS component_type,
   CASE WHEN salary.type_id IS NOT NULL THEN nullif(l.source->>'component_code','') END AS component_code,
   CASE WHEN salary.type_id IS NOT NULL THEN nullif(l.reason,'') END AS component_name
  FROM approved_results r JOIN erp_private.t14_lines l ON l.version_id=r.version_id AND l.employee_id=r.employee_id
  LEFT JOIN current_allocations c ON c.line_id=l.id
  CROSS JOIN LATERAL (
    SELECT CASE WHEN l.category IN ('salary-component','salary-deduction')
       AND l.source->>'type_id' ~ '^[1-9][0-9]{0,18}$' THEN l.source->>'type_id' END AS type_id
  ) salary
 ), line_checks AS (
  SELECT version_id,employee_id,
    coalesce(sum(amount) FILTER (WHERE kind='earning'),0) AS approved_earnings,
    coalesce(sum(amount) FILTER (WHERE kind='deduction'),0) AS approved_deductions,
    coalesce(sum(applied) FILTER (WHERE kind='earning'),0) AS applied_earnings,
    coalesce(sum(applied) FILTER (WHERE kind='deduction'),0) AS applied_deductions,
    coalesce(sum(amount) FILTER (WHERE category='recovery' AND kind='deduction'),0) AS recovery_approved,
    coalesce(sum(applied) FILTER (WHERE category='recovery' AND kind='deduction'),0) AS recovery_applied,
    coalesce(sum(amount) FILTER (WHERE category='recovery-refund' AND kind='earning'),0) AS recovery_refund_approved,
    coalesce(sum(applied) FILTER (WHERE category='recovery-refund' AND kind='earning'),0) AS recovery_refund_applied
  FROM approved_lines GROUP BY version_id,employee_id
 ), company_totals AS (
  SELECT r.currency,count(*) AS employee_count,
   count(*) FILTER (WHERE r.settlement_state='reconciled') AS reconciled_count,
   count(*) FILTER (WHERE r.settlement_state<>'reconciled') AS unsettled_count,
   count(*) FILTER (WHERE r.settlement_state='partial') AS partial_count,
   count(*) FILTER (WHERE r.settlement_state='pending') AS pending_count,
   count(*) FILTER (WHERE r.settlement_state='rejected') AS rejected_count,
   count(*) FILTER (WHERE r.settlement_state='reversed') AS reversed_count,
   count(*) FILTER (WHERE r.settlement_state='paid-unallocated') AS paid_unallocated_count,
   sum(r.gross) AS approved_gross,sum(r.deductions) AS approved_deductions,sum(r.net) AS approved_net,
   sum(r.verified_cash) AS verified_cash,sum(r.applied_wages) AS applied_wages,
   sum(r.applied_deductions) AS applied_deductions,sum(r.unallocated_cash) AS unallocated_cash,
   sum(r.outstanding_cash) AS outstanding_cash,sum(r.deductions-r.applied_deductions) AS outstanding_deductions,
   coalesce(sum(r.verified_cash) FILTER (WHERE r.settlement_state='reconciled'),0) AS reconciled_cash,
   coalesce(sum(l.recovery_approved),0) AS recovery_approved,coalesce(sum(l.recovery_applied),0) AS recovery_applied,
   coalesce(sum(l.recovery_approved-l.recovery_applied),0) AS recovery_outstanding,
   coalesce(sum(l.recovery_refund_approved),0) AS recovery_refund_approved,
   coalesce(sum(l.recovery_refund_applied),0) AS recovery_refund_applied,
   sum(abs(r.gross-coalesce(l.approved_earnings,0))+abs(r.deductions-coalesce(l.approved_deductions,0))
     +abs(r.applied_wages-coalesce(l.applied_earnings,0))+abs(r.applied_deductions-coalesce(l.applied_deductions,0))
     +abs(r.net-r.verified_cash-r.outstanding_cash)
     +abs(r.verified_cash-r.applied_wages+r.applied_deductions-r.unallocated_cash)) AS unexplained_difference
  FROM result_amounts r LEFT JOIN line_checks l
    ON l.version_id=r.version_id AND l.employee_id=r.employee_id
  GROUP BY r.currency
 ), files AS MATERIALIZED (
  SELECT f.filename AS file_reference,f.currency,f.row_count,f.net_total,f.establishment_id,a.number AS approval_version,a.branch,
    erp_private.t16_lane_state(f.batch_id,f.id::text) AS state,
    CASE WHEN a.state='approved' AND NOT EXISTS (
      SELECT 1 FROM erp_private.t16_files successor WHERE successor.replaces_file_id=f.id
    ) THEN 'current' ELSE 'superseded' END AS scope
  FROM approvals a JOIN erp_private.t16_files f ON f.batch_id=a.batch_id
 ), file_totals AS (
  SELECT currency,
    coalesce(sum(net_total) FILTER (WHERE scope='current'),0) AS current_total,
    coalesce(sum(net_total) FILTER (WHERE scope='current' AND state='accepted'),0) AS accepted_total
  FROM files GROUP BY currency
 ), components AS (
  SELECT currency,kind,category,work_month,component_code,component_name,round(sum(amount),2)::text AS approved,
    round(sum(applied),2)::text AS applied
  FROM approved_lines GROUP BY currency,kind,category,work_month,component_type,component_code,component_name
 )
 SELECT jsonb_build_object('company_id',p_company,'branch_id',p_branch,'payroll_month',p_month,
  'totals',coalesce((
    SELECT jsonb_agg(jsonb_build_object('currency',t.currency,'employee_count',t.employee_count,
      'reconciled_count',t.reconciled_count,'unsettled_count',t.unsettled_count,'partial_count',t.partial_count,
      'pending_count',t.pending_count,'rejected_count',t.rejected_count,'reversed_count',t.reversed_count,
      'paid_unallocated_count',t.paid_unallocated_count,'approved_gross',round(t.approved_gross,2)::text,
      'approved_deductions',round(t.approved_deductions,2)::text,'approved_net',round(t.approved_net,2)::text,
      'verified_cash',round(t.verified_cash,2)::text,'applied_wages',round(t.applied_wages,2)::text,
      'applied_deductions',round(t.applied_deductions,2)::text,'unallocated_cash',round(t.unallocated_cash,2)::text,
      'outstanding_cash',round(t.outstanding_cash,2)::text,'outstanding_deductions',round(t.outstanding_deductions,2)::text,
      'reconciled_cash',round(t.reconciled_cash,2)::text,'recovery_approved',round(t.recovery_approved,2)::text,
      'recovery_applied',round(t.recovery_applied,2)::text,'recovery_outstanding',round(t.recovery_outstanding,2)::text,
      'recovery_refund_approved',round(t.recovery_refund_approved,2)::text,
      'recovery_refund_applied',round(t.recovery_refund_applied,2)::text,
      'unexplained_difference',round(t.unexplained_difference,2)::text,
      'wps_current_total',round(coalesce(f.current_total,0),2)::text,
      'wps_accepted_total',round(coalesce(f.accepted_total,0),2)::text) ORDER BY t.currency)
    FROM company_totals t LEFT JOIN file_totals f USING(currency)
  ),'[]'::jsonb),
  'components',coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.currency,c.kind,c.category,c.component_code,c.component_name,c.work_month) FROM components c),'[]'::jsonb),
  'files',coalesce((SELECT jsonb_agg(jsonb_build_object('file_reference',f.file_reference,'currency',f.currency,
      'row_count',f.row_count,'file_total',round(f.net_total,2)::text,'approval_version',f.approval_version,
      'state',f.state,'scope',f.scope,'branch',f.branch) ORDER BY f.branch,f.approval_version DESC,f.establishment_id,f.scope,f.file_reference)
    FROM files f),'[]'::jsonb)
 ) INTO result;

 IF NOT erp_private.t17_finance_can(p_company,p_branch) THEN
  RAISE EXCEPTION 'Payroll reconciliation scope unavailable' USING ERRCODE='42501';
 END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION erp_private.t17_finance_can(bigint,bigint),public.t17_payroll_finance_scopes(),
 public.t17_payroll_finance_report(bigint,bigint,date) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t17_payroll_finance_scopes(),public.t17_payroll_finance_report(bigint,bigint,date)
 TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;

