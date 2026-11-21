BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE FUNCTION erp_private.t09_company_scope(p_cap text,p_company bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_private.business_principal_is_active() AND EXISTS(
   SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
   JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions p ON p.id=rp.permission_id
   JOIN public.owner_companies c ON c.id=ur.owner_company_id AND c.status='active'
   LEFT JOIN erp_private.t02_role_validity validity ON validity.assignment_id=ur.id
   WHERE ur.user_profile_id=public.current_user_profile_id() AND ur.is_active AND r.is_active AND p.is_active
     AND ur.owner_company_id=p_company AND ur.branch_id IS NULL
     AND r.role_code NOT IN ('system_admin','group_admin','company_admin','branch_admin')
     AND p.permission_code=p_cap AND (validity.valid_until IS NULL OR validity.valid_until>statement_timestamp()));
$$;

CREATE FUNCTION public.t09_allowance_rates(p_company bigint,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE prepare boolean:=erp_private.t09_company_scope('fleet.allowance.rates.prepare',p_company);
 approve boolean:=erp_private.t09_company_scope('fleet.allowance.rates.approve',p_company);
 day date:=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date;
BEGIN
 IF NOT (prepare OR approve) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('can_prepare',prepare,'can_approve',approve,
  'sites',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'label',s.site_name) ORDER BY s.site_name,s.id),'[]')
    FROM public.work_sites s WHERE EXISTS(SELECT 1 FROM public.branches b WHERE b.owner_company_id=p_company AND b.status='active'
       AND erp_private.t06_site_allowed(s.id,p_company,b.id,day,day))),
  'currencies',(SELECT coalesce(jsonb_agg(c.currency_code ORDER BY c.currency_code),'[]')
    FROM public.currencies c WHERE c.is_active AND c.decimal_places=2),
  'truck_types',(SELECT coalesce(jsonb_agg(item.truck_type ORDER BY item.truck_type),'[]') FROM (
    SELECT DISTINCT conf.truck_type FROM erp_private.fleet_assets asset
    CROSS JOIN LATERAL erp_private.t09_configuration(asset.id,statement_timestamp()) conf
    WHERE asset.owner_company_id=p_company AND asset.category='truck' AND asset.status='active' AND conf.truck_type IS NOT NULL
  ) item),
  'rates',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'origin',origin.site_name,'destination',destination.site_name,'truck',r.truck_type,
    'from',r.effective_from,'until',r.effective_until,'amount',r.amount::text,'currency',r.currency,'approved',r.approved_at IS NOT NULL,
    'can_decide',approve AND r.approved_at IS NULL AND r.prepared_by<>public.current_user_profile_id(),'reason',r.reason) ORDER BY r.id DESC),'[]')
    FROM (SELECT * FROM erp_private.t09_rates WHERE company_id=p_company AND (p_before IS NULL OR id<p_before) ORDER BY id DESC LIMIT 26) r
    JOIN public.work_sites origin ON origin.id=r.origin_id JOIN public.work_sites destination ON destination.id=r.destination_id));
END;
$$;

CREATE FUNCTION erp_private.t09_witness_choices(p_asset bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('document',item.document,'version',item.version,'file',item.file,'type',item.type,'label',item.label)
    ORDER BY item.document DESC),'[]')
 FROM (SELECT d.id AS document,v.id AS version,f.id AS file,t.type_code AS type,d.document_no||' · '||d.title AS label
   FROM erp_private.fleet_document_parents parent JOIN public.dms_documents d ON d.id=parent.document_id
   JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.deleted_at IS NULL
   JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
   JOIN public.dms_document_files f ON f.document_id=d.id AND f.version_id=v.id AND f.file_role='original' AND f.deleted_at IS NULL
    AND f.integrity_status='verified' AND f.sha256_hash~'^[0-9a-f]{64}$' AND f.file_size_bytes>0
   WHERE parent.asset_id=p_asset AND d.status='active' AND NOT d.is_archived AND d.deleted_at IS NULL
    AND t.type_code IN('FLEET_CUSTOMER_DELIVERY_CONFIRMATION','FLEET_WEIGH_TICKET','FLEET_DESTINATION_SITE_RECEIPT')
    AND erp_private.document_permission(d.id,'dms.documents.preview')
    AND EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.entity_type='fleet_asset'
      AND l.entity_id=p_asset AND l.deleted_at IS NULL)
   ORDER BY d.id DESC,f.id LIMIT 100) item;
$$;

CREATE FUNCTION public.t09_trip_allowance_order(p_order bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE o erp_private.fleet_operation_orders; viewer boolean; submit boolean; approve boolean; payroll boolean;
 actor bigint:=public.current_user_profile_id();
BEGIN
 SELECT * INTO o FROM erp_private.fleet_operation_orders WHERE id=p_order AND kind='trip';
 IF o.id IS NULL THEN RETURN NULL; END IF;
 viewer:=erp_private.t07_ops_readable(o.company_id,o.branch_id);
 submit:=erp_private.t05_scope('fleet.allowance.submit',o.company_id,o.branch_id);
 approve:=erp_private.t05_scope('fleet.allowance.approve',o.company_id,o.branch_id);
 payroll:=EXISTS(SELECT 1 FROM erp_private.fleet_trip_legs l JOIN erp_private.fleet_trip_leg_actuals f ON f.leg_id=l.id
   JOIN erp_private.fleet_operation_assignments a ON a.id=f.assignment_id WHERE l.order_id=o.id
   AND erp_private.t09_payroll_scope(a.employer_company_id,a.employer_branch_id));
 IF NOT(viewer OR submit OR approve OR payroll) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('id',o.id,'number',o.order_no,'subject',o.subject,'customer',o.customer_id,
  'customer_label',(SELECT p.display_name FROM public.parties p WHERE p.id=o.customer_id),
  'can_submit',submit,'can_approve',approve,'can_payroll',payroll,
  'legs',(SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',f.id,'sequence',l.sequence,'date',(f.departed_at AT TIME ZONE 'Asia/Dubai')::date,'arrival',f.arrived_at,
    'origin',origin.site_name,'destination',destination.site_name,'origin_id',f.origin,'destination_id',f.destination,
    'asset',asset.asset_no,'worker',e.full_name_en,'truck',basis->>'truck_type','load',f.load,'state',
      CASE WHEN EXISTS(SELECT 1 FROM erp_private.t09_allowance_claims c WHERE c.actual_id=f.id AND c.kind='base') THEN 'claimed'
        WHEN EXISTS(SELECT 1 FROM erp_private.t09_allowance_versions v WHERE v.actual_id=f.id AND v.kind='base' AND erp_private.t09_candidate_current(v))
          THEN 'accepted' ELSE basis->>'state' END,
    'has_signed_pod',erp_private.t09_signed_pod(f.id) IS NOT NULL,
    'proof_available',erp_private.t09_proof_basis(f.id) IS NOT NULL,
    'proof',(SELECT jsonb_build_object('document',ev.document_id,'version',ev.version_id,'file',ev.file_id,'reference',ev.paper_reference)
      FROM erp_private.fleet_operation_evidence ev WHERE ev.id=(basis->>'evidence')::bigint
      AND erp_private.document_permission(ev.document_id,'dms.documents.preview')),
    'route_digest',CASE WHEN approve THEN basis->>'route_digest' END,
    'rate_needs_review',basis->>'state'='rate-review',
    'assigned_rate',(basis->>'assignment_rate')::bigint,'current_rate',(basis->>'rate')::bigint,
    'digest',CASE WHEN scope.payroll AND basis->>'state'='ready' THEN erp_private.t02_digest(basis) END,
    'amount',CASE WHEN scope.payroll THEN basis->>'amount' END,'currency',CASE WHEN scope.payroll THEN basis->>'currency' END,
    'can_decide',approve AND erp_private.t09_independent(f.id,actor),
    'can_accept',scope.payroll AND erp_private.t09_independent(f.id,actor),
    'sources',CASE WHEN submit AND f.load='loaded' THEN erp_private.t09_witness_choices(a.asset_id) ELSE '[]'::jsonb END,
    'exceptions',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',x.id,'state',x.state,'kind',x.witness_kind,'reason',x.reason,
       'decision_reason',x.decision_reason,'can_decide',approve AND x.state='pending' AND actor<>x.submitted_by
         AND erp_private.t09_independent(f.id,actor) AND proof.allowed,'document',CASE WHEN proof.allowed THEN ev.document_id END,
       'version',CASE WHEN proof.allowed THEN ev.version_id END,'file',CASE WHEN proof.allowed THEN ev.file_id END,
       'observed',CASE WHEN proof.allowed THEN x.witness END) ORDER BY x.id DESC),'[]')
       FROM erp_private.t09_pod_exceptions x JOIN erp_private.fleet_operation_evidence ev ON ev.id=x.evidence_id
       CROSS JOIN LATERAL (SELECT erp_private.document_permission(ev.document_id,'dms.documents.preview') AS allowed) proof
       WHERE x.actual_id=f.id),
    'settled',EXISTS(SELECT 1 FROM erp_private.t09_allowance_claims c WHERE c.actual_id=f.id AND c.kind='base' AND c.settled_at IS NOT NULL),
    'changes',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',ch.id,'mode',ch.mode,'reason',ch.reason,'decided',ch.decided_at IS NOT NULL,
      'outcome',CASE WHEN withdrawn.version_id IS NOT NULL THEN 'withdrawn' ELSE ch.outcome END,
      'can_accept',scope.payroll AND actor<>ch.proposed_by AND ch.decided_at IS NULL AND erp_private.t09_independent(f.id,actor),
      'withdraw_version',CASE WHEN scope.payroll AND ch.mode='reprice' AND v.id IS NOT NULL AND withdrawn.version_id IS NULL
        AND claim.id IS NULL AND erp_private.t09_candidate_current(v) IS DISTINCT FROM true AND erp_private.t09_independent(f.id,actor) THEN v.id END,
      'amount',CASE WHEN scope.payroll THEN (ch.target-ch.previously_settled)::text END,
      'currency',CASE WHEN scope.payroll THEN ch.currency END) ORDER BY ch.id DESC),'[]')
       FROM erp_private.t09_allowance_changes ch
       LEFT JOIN erp_private.t09_allowance_versions v ON v.change_id=ch.id
       LEFT JOIN erp_private.t09_adjustment_withdrawals withdrawn ON withdrawn.version_id=v.id
       LEFT JOIN erp_private.t09_allowance_claims claim ON claim.version_id=v.id
       WHERE ch.actual_id=f.id)
    ) ORDER BY l.sequence),'[]')
   FROM erp_private.fleet_trip_legs l JOIN erp_private.fleet_trip_leg_actuals f ON f.leg_id=l.id
   JOIN erp_private.fleet_operation_assignments a ON a.id=f.assignment_id
   JOIN erp_private.fleet_assets asset ON asset.id=a.asset_id JOIN public.employees e ON e.id=a.worker_id
   JOIN public.work_sites origin ON origin.id=f.origin JOIN public.work_sites destination ON destination.id=f.destination
   CROSS JOIN LATERAL(SELECT erp_private.t09_payroll_scope(a.employer_company_id,a.employer_branch_id) payroll) scope
   CROSS JOIN LATERAL(SELECT erp_private.t09_allowance_basis(f.id) basis) calc
   WHERE l.order_id=o.id AND (viewer OR submit OR approve OR scope.payroll)));
END;
$$;

CREATE FUNCTION public.t09_payroll_orders(p_company bigint,p_day date,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',item.id,'number',item.order_no,'subject',item.subject) ORDER BY item.id DESC),'[]')
 FROM (SELECT DISTINCT o.id,o.order_no,o.subject FROM erp_private.fleet_trip_leg_actuals f
   JOIN erp_private.fleet_trip_legs l ON l.id=f.leg_id JOIN erp_private.fleet_operation_orders o ON o.id=l.order_id
   JOIN erp_private.fleet_operation_assignments a ON a.id=f.assignment_id
   WHERE a.employer_company_id=p_company AND erp_private.t09_payroll_scope(a.employer_company_id,a.employer_branch_id)
    AND f.load='loaded' AND (f.departed_at AT TIME ZONE 'Asia/Dubai')::date=p_day AND (p_before IS NULL OR o.id<p_before)
   ORDER BY o.id DESC LIMIT 26) item;
$$;

CREATE FUNCTION public.t09_payroll_candidates(p_employer bigint,p_cutoff timestamptz,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',item.id,'actual',item.actual_id,'employee',item.employee_id,'employer',item.employer_id,
    'employment',item.employment_id,'date',item.work_day,'kind',item.kind,'amount',item.amount::text,'currency',item.currency,
    'basis',CASE WHEN refs.scope THEN item.basis ELSE item.basis-ARRAY['evidence','exception','source'] END,
    'prior',item.prior_version_id,'available',item.accepted_at) ORDER BY item.id DESC),'[]')
 FROM (SELECT v.* FROM erp_private.t09_allowance_versions v WHERE v.employer_id=p_employer
   AND isfinite(p_cutoff) AND p_cutoff<=statement_timestamp() AND v.accepted_at<=p_cutoff
   AND (p_before IS NULL OR v.id<p_before) AND erp_private.t09_payroll_scope(v.employer_id,v.employer_branch_id)
   AND erp_private.t09_candidate_current(v)
   AND NOT EXISTS(SELECT 1 FROM erp_private.t09_allowance_claims c WHERE c.version_id=v.id OR (v.kind='base' AND c.kind='base' AND c.actual_id=v.actual_id))
   AND (v.kind<>'base' OR NOT EXISTS(SELECT 1 FROM erp_private.t09_allowance_versions newer WHERE newer.actual_id=v.actual_id
      AND newer.kind='base' AND newer.id>v.id AND newer.accepted_at<=p_cutoff AND erp_private.t09_candidate_current(newer)))
   ORDER BY v.id DESC LIMIT 26) item
 CROSS JOIN LATERAL (SELECT EXISTS(SELECT 1 FROM erp_private.fleet_operation_evidence ev WHERE
   ev.id=coalesce((item.basis->>'evidence')::bigint,(item.basis#>>'{source,evidence}')::bigint)
   AND erp_private.document_permission(ev.document_id,'dms.documents.preview')) AS scope) refs;
$$;

REVOKE ALL ON FUNCTION erp_private.t09_company_scope(text,bigint),erp_private.t09_witness_choices(bigint),
 public.t09_allowance_rates(bigint,bigint),public.t09_trip_allowance_order(bigint),public.t09_payroll_orders(bigint,date,bigint),
 public.t09_payroll_candidates(bigint,timestamptz,bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t09_allowance_rates(bigint,bigint),public.t09_trip_allowance_order(bigint),
 public.t09_payroll_orders(bigint,date,bigint),public.t09_payroll_candidates(bigint,timestamptz,bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
