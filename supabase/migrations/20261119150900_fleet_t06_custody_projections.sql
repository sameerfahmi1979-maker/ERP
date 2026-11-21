BEGIN;

CREATE OR REPLACE FUNCTION erp_private.t06_custody_reader(p_company bigint,p_branch bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_private.t05_scope('fleet.custody.manage',p_company,p_branch)
   OR erp_private.t05_scope('fleet.custody.approve',p_company,p_branch)
   OR erp_private.t05_scope('fleet.availability.plan',p_company,p_branch)
   OR erp_private.t05_scope('integrated.custody.transfer',p_company,p_branch)
   OR erp_private.t05_scope('fleet.holds.workshop',p_company,p_branch)
   OR erp_private.t05_scope('fleet.holds.hse',p_company,p_branch)
   OR erp_private.t05_scope('fleet.availability.policy',p_company,p_branch);
$$;

CREATE OR REPLACE FUNCTION erp_private.t06_guard_asset_retirement()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.status='retired' AND OLD.status<>'retired' AND
   (EXISTS(SELECT 1 FROM erp_private.fleet_commitments c WHERE c.asset_id=OLD.id AND c.status IN ('active','confirmed'))
   OR EXISTS(SELECT 1 FROM erp_private.fleet_asset_holds h WHERE h.asset_id=OLD.id AND h.released_at IS NULL))
 THEN RAISE EXCEPTION 'Resolve active Fleet commitments and holds before retiring this asset' USING ERRCODE='PT409'; END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER t06_asset_retirement BEFORE UPDATE OF status ON erp_private.fleet_assets
 FOR EACH ROW EXECUTE FUNCTION erp_private.t06_guard_asset_retirement();

CREATE OR REPLACE FUNCTION public.t06_fleet_custody_at(
 p_at timestamptz,p_asset bigint DEFAULT NULL,p_jurisdiction text DEFAULT NULL,p_plate_class text DEFAULT NULL,p_plate text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE resolved bigint:=p_asset; a erp_private.fleet_assets; item erp_private.fleet_commitments;
BEGIN
 IF p_at IS NULL OR NOT isfinite(p_at) OR p_at>statement_timestamp() OR (p_asset IS NULL AND
    (p_jurisdiction IS NULL OR p_plate_class IS NULL OR p_plate IS NULL))
 THEN RAISE EXCEPTION 'Select a valid historical moment and asset or plate' USING ERRCODE='22023'; END IF;
 IF resolved IS NULL THEN
  SELECT p.asset_id INTO resolved FROM erp_private.fleet_asset_plates p
   WHERE p.jurisdiction=erp_private.t05_identifier(p_jurisdiction) AND p.plate_class=erp_private.t05_identifier(p_plate_class)
     AND p.plate_number=erp_private.t05_identifier(p_plate)
     AND daterange(p.valid_from,p.valid_until,'[)') @> (p_at AT TIME ZONE 'Asia/Dubai')::date;
 END IF;
 SELECT * INTO a FROM erp_private.fleet_assets fa WHERE fa.id=resolved;
 IF a.id IS NULL OR NOT erp_private.t06_custody_visible(a.id) THEN RETURN jsonb_build_object('status','unavailable'); END IF;
 SELECT * INTO item FROM erp_private.fleet_commitments c WHERE c.asset_id=a.id AND c.status IN ('active','closed')
   AND c.committed_during @> p_at;
 IF NOT erp_private.t06_custody_reader(a.owner_company_id,a.home_branch_id)
   AND (item.id IS NULL OR NOT erp_private.t06_custody_reader(item.company_id,item.branch_id))
 THEN RETURN jsonb_build_object('status','unavailable'); END IF;
 RETURN jsonb_build_object('status',CASE WHEN item.id IS NULL THEN 'no-record'
         WHEN item.kind='custody' THEN 'custody-candidate' ELSE 'verified-dispatch' END,
    'asset_id',a.id,'commitment_id',item.id,'custody_candidate',CASE WHEN item.kind='custody' THEN item.employee_id END,
    'verified_driver',item.verified_driver_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.t06_fleet_custody_choices(p_asset bigint,p_query text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a erp_private.fleet_assets;
BEGIN
 SELECT * INTO a FROM erp_private.fleet_assets fa WHERE fa.id=p_asset;
 IF a.id IS NULL OR NOT erp_private.t06_custody_visible(a.id) THEN RETURN NULL; END IF;
 RETURN (
  WITH selected_scopes AS MATERIALIZED (
   SELECT b.id branch,b.owner_company_id company FROM public.branches b
   WHERE erp_private.t05_scope('fleet.custody.manage',b.owner_company_id,b.id)
      OR erp_private.t05_scope('fleet.availability.plan',b.owner_company_id,b.id)
  ), employees AS (
   SELECT e.id,e.employee_code,e.full_name_en,p.company_id,p.branch_id
   FROM erp_private.t03_employment_periods p JOIN public.employees e ON e.id=p.employee_id AND e.deleted_at IS NULL
   JOIN selected_scopes s ON s.company=p.company_id AND s.branch=p.branch_id
   WHERE e.employee_status IN ('active','probation') AND p.work_period @> (statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date
     AND length(btrim(p_query)) BETWEEN 2 AND 100
     AND (strpos(lower(e.full_name_en),lower(btrim(p_query)))>0 OR strpos(lower(e.employee_code),lower(btrim(p_query)))>0)
   ORDER BY e.full_name_en,e.id LIMIT 40
  )
  SELECT jsonb_build_object(
   'workers',coalesce((SELECT jsonb_agg(jsonb_build_object('id',e.id,'label',concat(e.employee_code,' · ',e.full_name_en),
     'company',e.company_id,'branch',e.branch_id) ORDER BY e.full_name_en,e.id) FROM employees e),'[]'),
   'sites',coalesce((SELECT jsonb_agg(jsonb_build_object('id',w.id,'label',w.site_name) ORDER BY w.site_name,w.id)
     FROM (SELECT ws.id,ws.site_name FROM public.work_sites ws WHERE ws.status='active' AND ws.deleted_at IS NULL
        AND EXISTS(SELECT 1 FROM selected_scopes s WHERE erp_private.assignment_scope_matches(
          ws.available_to_all_organizations,ws.owner_company_id,ws.branch_id,s.company,s.branch))
        ORDER BY ws.site_name,ws.id LIMIT 100) w),'[]')
  )
 );
END;
$$;

CREATE OR REPLACE FUNCTION public.t06_fleet_custody_workspace(p_asset bigint,p_before bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a erp_private.fleet_assets; operating record; home_reader boolean; operating_reader boolean; policy_reviewer boolean;
BEGIN
 SELECT * INTO a FROM erp_private.fleet_assets fa WHERE fa.id=p_asset;
 IF a.id IS NULL OR NOT erp_private.t06_custody_visible(a.id) THEN RETURN NULL; END IF;
 SELECT * INTO operating FROM erp_private.t06_operation_scope(a.id);
 home_reader:=erp_private.t06_custody_reader(a.owner_company_id,a.home_branch_id);
 operating_reader:=erp_private.t06_custody_reader(operating.company_id,operating.branch_id);
 IF NOT home_reader AND NOT operating_reader AND NOT EXISTS(
   SELECT 1 FROM erp_private.fleet_commitments c WHERE c.asset_id=a.id AND erp_private.t06_custody_reader(c.company_id,c.branch_id)
 ) THEN RETURN NULL; END IF;
 policy_reviewer:=EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles role ON role.id=ur.role_id
     JOIN public.role_permissions g ON g.role_id=role.id JOIN public.permissions cap ON cap.id=g.permission_id
     LEFT JOIN erp_private.t02_role_validity v ON v.assignment_id=ur.id
     WHERE erp_private.business_principal_is_active() AND ur.user_profile_id=public.current_user_profile_id()
       AND ur.is_active AND role.is_active AND cap.is_active AND role.role_code NOT IN('system_admin','group_admin','company_admin','branch_admin')
       AND ur.owner_company_id=a.owner_company_id AND ur.branch_id IS NULL AND cap.permission_code='fleet.availability.policy'
       AND (v.valid_until IS NULL OR v.valid_until>statement_timestamp()));
 RETURN jsonb_build_object(
  'asset',a.id,'asset_no',a.asset_no,'asset_name',a.name,'company',a.owner_company_id,'category',a.category,
  'can_manage',erp_private.t05_scope('fleet.custody.manage',operating.company_id,operating.branch_id),
  'can_plan',erp_private.t05_scope('fleet.availability.plan',operating.company_id,operating.branch_id),
  'can_approve',erp_private.t05_scope('fleet.custody.approve',operating.company_id,operating.branch_id)
    OR erp_private.t05_scope('integrated.custody.transfer',operating.company_id,operating.branch_id),
  'can_workshop',erp_private.t05_scope('fleet.holds.workshop',a.owner_company_id,a.home_branch_id),
  'can_hse',erp_private.t05_scope('fleet.holds.hse',a.owner_company_id,a.home_branch_id),
  'can_policy',policy_reviewer,
  'policies',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'from',lower(p.valid_during),'until',upper(p.valid_during)-1,
    'approved',p.approved_at IS NOT NULL,'prepared_by_me',p.prepared_by=public.current_user_profile_id(),
    'routine_minutes',p.routine_minutes,'signed_handover',p.signed_handover,'tentative_allowed',p.tentative_allowed,
    'registration_required',p.registration_required,'insurance_required',p.insurance_required,
    'licence_type',p.licence_type_id,'access_type',p.access_type_id,'employee_category',p.employee_category_id,
    'reason',p.reason) ORDER BY p.id DESC),'[]')
    FROM (SELECT cp.* FROM erp_private.fleet_availability_policies cp WHERE policy_reviewer AND cp.company_id=a.owner_company_id
       AND cp.category=a.category ORDER BY cp.id DESC LIMIT 20) p),
  'policy_choices',CASE WHEN policy_reviewer THEN jsonb_build_object(
    'licences',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'label',t.name_en)),'[]')
      FROM public.hr_identity_document_types t WHERE t.is_active AND t.deleted_at IS NULL AND t.code='DRIVING_LICENSE'),
    'access',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'label',t.name_en) ORDER BY t.name_en,t.id),'[]')
      FROM public.hr_access_card_types t WHERE t.is_active AND t.deleted_at IS NULL),
    'employee_categories',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',t.id,'label',t.name_en) ORDER BY t.name_en,t.id),'[]')
      FROM public.hr_employee_categories t WHERE t.is_active AND t.deleted_at IS NULL)) END,
  'signed_choices',(SELECT coalesce(jsonb_agg(jsonb_build_object('document',d.id,'version',v.id,'file',f.id,'label',d.document_no||' · '||d.title)
       ORDER BY d.id DESC,f.id),'[]')
    FROM erp_private.fleet_document_parents binding
    JOIN public.dms_documents d ON d.id=binding.document_id AND d.deleted_at IS NULL AND NOT d.is_archived AND d.status='active'
    JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.deleted_at IS NULL AND t.type_code='FLEET_CUSTODY_ACK'
    JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
    JOIN public.dms_document_files f ON f.document_id=d.id AND f.version_id=v.id AND f.file_role='original' AND f.deleted_at IS NULL
      AND f.integrity_status='verified' AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$'
    WHERE binding.asset_id=a.id AND erp_private.document_permission(d.id,'dms.documents.preview')
       AND EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.entity_type='fleet_asset'
          AND l.entity_id=a.id AND l.deleted_at IS NULL)),
  'commitments',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'kind',c.kind,'status',c.status,'revision',c.revision,
    'employee',c.employee_id,'employee_name',e.full_name_en,'site',c.site_id,'site_name',s.site_name,'from',lower(c.committed_during),
    'actual_return',CASE WHEN c.status='closed' THEN upper(c.committed_during) END,'planned_return',c.planned_return,
    'overdue',c.status='active' AND c.planned_return<statement_timestamp(),'assigned_driver',c.verified_driver_id,
    'events',(SELECT coalesce(jsonb_agg(jsonb_build_object('kind',ev.kind,'at',ev.occurred_at,'reason',ev.reason,'meter',ev.meter,
       'meter_unit',ev.meter_unit,'condition',ev.condition,'discrepancy',ev.discrepancy,
       'signed',ev.evidence_version_id IS NOT NULL) ORDER BY ev.id),'[]')
       FROM erp_private.fleet_custody_events ev WHERE ev.commitment_id=c.id)) ORDER BY c.id DESC),'[]')
     FROM (SELECT item.* FROM erp_private.fleet_commitments item WHERE item.asset_id=a.id
       AND (p_before IS NULL OR item.id<p_before) AND (home_reader OR erp_private.t06_custody_reader(item.company_id,item.branch_id))
       ORDER BY item.id DESC LIMIT 26) c
     JOIN public.employees e ON e.id=c.employee_id JOIN public.work_sites s ON s.id=c.site_id),
  'loans',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',l.id,'commitment',l.source_commitment_id,'revision',l.source_revision,
    'employee_name',e.full_name_en,'site_name',s.site_name,'start',l.planned_start,'until',l.planned_return,
    'status',CASE WHEN l.approved_at IS NULL THEN 'pending' ELSE 'approved' END)
    ORDER BY l.id DESC),'[]')
    FROM (SELECT loan.* FROM erp_private.fleet_loan_approvals loan WHERE loan.asset_id=a.id AND loan.used_by_commitment IS NULL
     AND loan.planned_return>statement_timestamp()
     AND (home_reader OR erp_private.t06_custody_reader(loan.source_company_id,loan.source_branch_id)
       OR erp_private.t06_custody_reader(loan.destination_company_id,loan.destination_branch_id))
     ORDER BY loan.id DESC LIMIT 30) l JOIN public.employees e ON e.id=l.employee_id JOIN public.work_sites s ON s.id=l.site_id),
  'holds',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'kind',h.kind,'placed_at',h.placed_at,'released_at',h.released_at,
     'reason',CASE WHEN home_reader AND erp_private.t05_scope(CASE WHEN h.kind='workshop' THEN 'fleet.holds.workshop' ELSE 'fleet.holds.hse' END,
        a.owner_company_id,a.home_branch_id) THEN h.reason END) ORDER BY (h.released_at IS NULL) DESC,h.id DESC),'[]')
    FROM (SELECT hold.* FROM erp_private.fleet_asset_holds hold WHERE hold.asset_id=a.id
      ORDER BY (hold.released_at IS NULL) DESC,hold.id DESC LIMIT 30) h)
 );
END;
$$;

CREATE OR REPLACE FUNCTION public.t06_fleet_board(p_assets bigint[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('asset',a.id,'status',
   CASE WHEN a.status<>'active' THEN a.status WHEN current_commitment.status='active' THEN current_commitment.kind
     WHEN EXISTS(SELECT 1 FROM erp_private.fleet_asset_holds h WHERE h.asset_id=a.id AND h.released_at IS NULL) THEN 'held'
     WHEN current_commitment.status='confirmed' THEN 'reserved' ELSE 'check-required' END,
   'due',current_commitment.planned_return,'overdue',coalesce(current_commitment.status='active' AND current_commitment.planned_return<statement_timestamp(),false),
   'held',EXISTS(SELECT 1 FROM erp_private.fleet_asset_holds h WHERE h.asset_id=a.id AND h.released_at IS NULL))
   ORDER BY a.id),'[]')
 FROM erp_private.fleet_assets a
 LEFT JOIN LATERAL(
  SELECT item.kind,item.status,item.planned_return FROM erp_private.fleet_commitments item
  WHERE item.asset_id=a.id AND (item.status='active' OR (item.status='confirmed' AND item.committed_during @> statement_timestamp()))
  ORDER BY item.id DESC LIMIT 1
 ) current_commitment ON true
 WHERE coalesce(cardinality(p_assets),0) BETWEEN 1 AND 50 AND a.id=ANY(p_assets) AND erp_private.t06_custody_visible(a.id);
$$;

CREATE OR REPLACE FUNCTION public.t06_fleet_host_assets(p_query text)
RETURNS TABLE(id bigint,asset_no text,name text,category text,status text,plate text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT a.id,a.asset_no,a.name,a.category,a.status,active_plate.plate_number
 FROM erp_private.fleet_assets a
 JOIN erp_private.fleet_commitments item ON item.asset_id=a.id AND item.status='active'
 LEFT JOIN LATERAL(SELECT p.plate_number FROM erp_private.fleet_asset_plates p
   WHERE p.asset_id=a.id AND p.valid_until IS NULL) active_plate ON true
 WHERE erp_private.t05_scope('fleet.assets.view',item.company_id,item.branch_id)
   AND erp_private.t05_scope('fleet.custody.manage',item.company_id,item.branch_id)
   AND NOT erp_private.t05_asset_readable(a.id) AND coalesce(length(p_query),0)<=200
   AND (nullif(btrim(p_query),'') IS NULL OR strpos(lower(a.name),lower(btrim(p_query)))>0
      OR strpos(erp_private.t05_identifier(a.asset_no),erp_private.t05_identifier(p_query))>0
      OR strpos(active_plate.plate_number,erp_private.t05_identifier(p_query))>0)
 ORDER BY a.asset_no,a.id LIMIT 25;
$$;

REVOKE ALL ON FUNCTION erp_private.t06_custody_reader(bigint,bigint),erp_private.t06_guard_asset_retirement(),
 public.t06_fleet_custody_at(timestamptz,bigint,text,text,text),public.t06_fleet_custody_choices(bigint,text),
 public.t06_fleet_custody_workspace(bigint,bigint),public.t06_fleet_board(bigint[]),public.t06_fleet_host_assets(text)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t06_fleet_custody_at(timestamptz,bigint,text,text,text),
 public.t06_fleet_custody_choices(bigint,text),public.t06_fleet_custody_workspace(bigint,bigint),public.t06_fleet_board(bigint[]),
 public.t06_fleet_host_assets(text)
 TO authenticated;
COMMIT;
