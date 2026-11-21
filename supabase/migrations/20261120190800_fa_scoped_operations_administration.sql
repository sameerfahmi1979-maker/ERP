-- Provide scoped, aggregate administration for operating workspaces.
-- Existing command and record-detail permissions remain the authority.
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

CREATE FUNCTION public.fa_operations_admin_summary(p_area text, p_company bigint, p_branch bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  total bigint;
  pending bigint;
BEGIN
  IF NOT erp_private.business_principal_is_active()
    OR NOT public.current_user_has_role('system_admin')
    OR NOT EXISTS (SELECT 1 FROM public.owner_companies c WHERE c.id = p_company AND c.status = 'active')
    OR ((p_area = 'allowance-rates') IS DISTINCT FROM (p_branch IS NULL))
    OR (p_branch IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.branches b WHERE b.id = p_branch AND b.owner_company_id = p_company
        AND b.status = 'active' AND b.operating_status = 'active'
    )) THEN
    RAISE EXCEPTION 'Operations overview requires an active administrative scope' USING ERRCODE = '42501';
  END IF;

  CASE p_area
    WHEN 'fleet' THEN
      SELECT count(*), count(*) FILTER (WHERE a.status = 'active') INTO total, pending
      FROM erp_private.fleet_assets a WHERE a.owner_company_id = p_company AND a.home_branch_id = p_branch;
    WHEN 'dispatch' THEN
      SELECT count(*), count(*) FILTER (WHERE o.status NOT IN ('completed', 'cancelled')) INTO total, pending
      FROM erp_private.fleet_operation_orders o WHERE o.company_id = p_company AND o.branch_id = p_branch;
    WHEN 'fines' THEN
      SELECT count(*) INTO total FROM erp_private.t13_cases c
      WHERE c.company_id = p_company AND c.branch_id = p_branch;
    WHEN 'allowances' THEN
      SELECT count(*) INTO total FROM erp_private.t09_allowance_versions v
      WHERE v.employer_id = p_company AND v.employer_branch_id = p_branch;
    WHEN 'allowance-rates' THEN
      SELECT count(*), count(*) FILTER (WHERE r.approved_at IS NULL) INTO total, pending
      FROM erp_private.t09_rates r WHERE r.company_id = p_company;
    WHEN 'fuel' THEN
      SELECT count(*), count(*) FILTER (WHERE v.accepted_at IS NULL) INTO total, pending
      FROM erp_private.t11_fuel_vouchers v WHERE v.company_id = p_company AND v.branch_id = p_branch;
    WHEN 'workshop' THEN
      SELECT count(*), count(*) FILTER (WHERE a.outcome IS NULL) INTO total, pending
      FROM erp_private.t10_assessments a WHERE a.company_id = p_company AND a.branch_id = p_branch;
    WHEN 'job-work' THEN
      SELECT count(*), count(*) FILTER (WHERE j.state <> 'closed') INTO total, pending
      FROM erp_private.t10_job_cycles j JOIN erp_private.t10_assessments a ON a.id = j.assessment_id
      WHERE a.company_id = p_company AND a.branch_id = p_branch;
    WHEN 'inventory' THEN
      SELECT count(*) INTO total FROM erp_private.t11_layers l JOIN erp_private.t11_bins b ON b.id = l.bin_id
      WHERE b.company_id = p_company AND b.branch_id = p_branch;
      SELECT count(*) INTO pending FROM erp_private.t11_reviews r
        JOIN erp_private.t11_layers l ON l.id = r.layer_id JOIN erp_private.t11_bins b ON b.id = l.bin_id
      WHERE b.company_id = p_company AND b.branch_id = p_branch AND r.outcome IS NULL;
    WHEN 'procurement' THEN
      SELECT count(*), count(*) FILTER (WHERE l.approved_at IS NULL) INTO total, pending
      FROM erp_private.t11_purchase_lines l WHERE l.company_id = p_company AND l.branch_id = p_branch;
    WHEN 'workshop-time' THEN
      SELECT count(*) INTO total FROM erp_private.t12_labour_versions v
        JOIN erp_private.t12_labour_assignments l ON l.id = v.assignment_id
        JOIN erp_private.t10_job_cycles j ON j.id = l.job_id
        JOIN erp_private.t10_assessments a ON a.id = j.assessment_id
      WHERE a.company_id = p_company AND a.branch_id = p_branch;
    WHEN 'workshop-referrals' THEN
      SELECT count(*) INTO total FROM erp_private.t10_hr_referrals r
      WHERE r.company_id = p_company AND r.branch_id = p_branch;
    ELSE
      RAISE EXCEPTION 'Unknown operations overview' USING ERRCODE = '22023';
  END CASE;
  RETURN jsonb_build_object('total', total, 'pending', pending);
END $$;

REVOKE ALL ON FUNCTION public.fa_operations_admin_summary(text, bigint, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.fa_operations_admin_summary(text, bigint, bigint) TO authenticated;

-- Job Work links lead to an actual readable detail. A supply requester still
-- selects eligible jobs through Inventory's existing, independently scoped demand entry.
CREATE OR REPLACE FUNCTION public.t12_job_work_index(p_before bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM (
   SELECT j.id,j.assessment_id,j.cycle,j.state,a.asset_no,a.name AS asset_name,j.scope_of_work AS title
   FROM erp_private.t10_job_cycles j JOIN erp_private.t10_assessments f ON f.id=j.assessment_id
   JOIN erp_private.fleet_assets a ON a.id=f.asset_id
   WHERE (p_before IS NULL OR j.id<p_before) AND (
     EXISTS (SELECT 1 FROM unnest(ARRAY['workshop.labour.record','workshop.labour.approve','workshop.labour.cost',
         'workshop.jobs.manage','workshop.jobs.release','workshop.outside.manage','workshop.finance.intake']) code
       WHERE erp_private.t05_scope(code,f.company_id,f.branch_id))
     OR (erp_private.t05_scope('supply.purchase.approve',f.company_id,f.branch_id) AND EXISTS (
       SELECT 1 FROM erp_private.t12_outside_orders item WHERE item.job_cycle_id=j.id))
   )
   ORDER BY j.id DESC LIMIT 40
 ) x;
$$;

NOTIFY pgrst, 'reload schema';

