BEGIN;

CREATE FUNCTION erp_private.t11_visible(p_workspace text,p_company bigint,p_branch bigint) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE p_workspace
 WHEN 'procurement' THEN erp_private.t05_scope('supply.purchase',p_company,p_branch) OR erp_private.t05_scope('supply.purchase.approve',p_company,p_branch)
 WHEN 'fuel' THEN erp_private.t05_scope('supply.fuel',p_company,p_branch) OR erp_private.t05_scope('supply.approve',p_company,p_branch)
 WHEN 'inventory' THEN EXISTS(SELECT 1 FROM unnest(ARRAY['supply.setup','supply.stock','supply.approve','supply.request','supply.value']) cap
  WHERE erp_private.t05_scope(cap,p_company,p_branch))
 ELSE false END;
$$;

CREATE FUNCTION public.t11_supply_branches(p_workspace text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.company,x.name),'[]') FROM (
  SELECT b.id,b.branch_name_en AS name,c.legal_name_en AS company
  FROM public.branches b JOIN public.owner_companies c ON c.id=b.owner_company_id
  WHERE b.status='active' AND b.operating_status='active' AND c.status='active'
   AND erp_private.t11_visible(p_workspace,c.id,b.id)
 ) x;
$$;

CREATE FUNCTION public.t11_movement_receipt(p_movement bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT jsonb_build_object('id',m.id,'kind',m.kind,'quantity',m.quantity,'item',i.code,'uom',u.code,
  'owner',o.code,'recorded_at',m.occurred_at,'revision',m.id,'reference',m.linked_movement,'from_layer',m.from_layer,'to_layer',m.to_layer,
  'valuation',CASE WHEN m.verified_amount IS NULL THEN 'pending-finance' ELSE 'verified' END,
  'amount',CASE WHEN erp_private.t05_scope('supply.value',o.company_id,o.branch_id) THEN m.verified_amount END,
  'currency',CASE WHEN erp_private.t05_scope('supply.value',o.company_id,o.branch_id) THEN m.valuation_currency END)
 FROM erp_private.t11_movements m
 LEFT JOIN erp_private.t11_layers src ON src.id=m.from_layer
 LEFT JOIN erp_private.t11_layers dst ON dst.id=m.to_layer
 LEFT JOIN erp_private.t11_bins bs ON bs.id=src.bin_id
 LEFT JOIN erp_private.t11_bins bd ON bd.id=dst.bin_id
 JOIN erp_private.t11_items i ON i.id=coalesce(src.item_id,dst.item_id)
 JOIN erp_private.t11_units u ON u.id=i.unit_id
 JOIN erp_private.t11_owners o ON o.id=coalesce(src.owner_id,dst.owner_id)
 WHERE m.id=p_movement AND (erp_private.t11_visible('inventory',bs.company_id,bs.branch_id) OR erp_private.t11_visible('inventory',bd.company_id,bd.branch_id)
   OR (m.kind IN('goods-accepted','goods-quarantined','quarantine-accepted','supplier-return')
    AND (erp_private.t11_visible('procurement',bs.company_id,bs.branch_id) OR erp_private.t11_visible('procurement',bd.company_id,bd.branch_id))));
$$;

CREATE FUNCTION public.t11_supply_workspace(p_branch bigint,p_workspace text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.branches; result jsonb; rights jsonb; company_setup boolean;
BEGIN
 SELECT * INTO b FROM public.branches WHERE id=p_branch;
 IF b.id IS NULL OR p_workspace NOT IN('inventory','procurement') OR NOT erp_private.t11_visible(p_workspace,b.owner_company_id,b.id) THEN RETURN NULL; END IF;
 SELECT coalesce(jsonb_agg(cap),'[]') INTO rights FROM unnest(ARRAY['supply.setup','supply.stock','supply.approve',
  'supply.request','supply.value','supply.purchase','supply.purchase.approve']) cap
 WHERE erp_private.t05_scope(cap,b.owner_company_id,b.id);
 company_setup:=erp_private.business_principal_is_active() AND EXISTS(
  SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id AND r.is_active
  JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions cap ON cap.id=rp.permission_id AND cap.is_active
  LEFT JOIN erp_private.t02_role_validity v ON v.assignment_id=ur.id
  WHERE ur.user_profile_id=public.current_user_profile_id() AND ur.is_active AND ur.owner_company_id=b.owner_company_id
   AND ur.branch_id IS NULL AND cap.permission_code='supply.setup'
   AND r.role_code NOT IN('system_admin','group_admin','company_admin','branch_admin')
   AND (v.valid_until IS NULL OR v.valid_until>statement_timestamp()));
 result:=jsonb_build_object('rights',rights,'company_setup',company_setup,'branch',b.id,'name',b.branch_name_en,
  'units',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'label',u.code,'decimals',u.decimal_places) ORDER BY u.code),'[]')
      FROM erp_private.t11_units u WHERE u.company_id=b.owner_company_id OR EXISTS(
       SELECT 1 FROM erp_private.t11_items i JOIN erp_private.t11_layers l ON l.item_id=i.id JOIN erp_private.t11_bins bn ON bn.id=l.bin_id
       WHERE i.unit_id=u.id AND bn.branch_id=b.id)),
  'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'label',i.code||' · '||i.name,'uom',i.unit_id,'kind',i.kind,'trace',i.trace) ORDER BY i.code),'[]')
      FROM erp_private.t11_items i WHERE i.company_id=b.owner_company_id OR EXISTS(
       SELECT 1 FROM erp_private.t11_layers l JOIN erp_private.t11_bins bn ON bn.id=l.bin_id WHERE l.item_id=i.id AND bn.branch_id=b.id)),
  'owners',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.code||CASE WHEN o.party_id IS NULL THEN ' · Company' ELSE ' · Third party' END)
      ORDER BY o.code),'[]') FROM erp_private.t11_owners o WHERE o.branch_id=b.id OR EXISTS(
       SELECT 1 FROM erp_private.t11_layers l JOIN erp_private.t11_bins bn ON bn.id=l.bin_id WHERE l.owner_id=o.id AND bn.branch_id=b.id)),
  'bins',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',n.id,'label',n.store||' / '||n.code,'kind',n.kind,'branch',n.branch_id) ORDER BY n.code),'[]')
      FROM erp_private.t11_bins n WHERE n.branch_id=b.id OR (p_workspace='inventory' AND n.kind='available'
       AND (erp_private.t05_scope('supply.stock',n.company_id,n.branch_id) OR erp_private.t05_scope('supply.approve',n.company_id,n.branch_id)))),
  'policies',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
       SELECT p.id,p.domain,p.decision,p.reason,p.decided_at,person.full_name AS name,
        p.owner_profile=public.current_user_profile_id() AND p.decided_at IS NULL AS can_decide
       FROM erp_private.t11_policies p JOIN public.user_profiles person ON person.id=p.owner_profile
       WHERE p.branch_id=b.id ORDER BY p.id DESC LIMIT 30) x),
  'demands',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
       SELECT d.id,d.source_line AS label,d.item_id,d.owner_id,d.quantity,d.job_id,d.fuel_id,
        erp_private.t11_workshop_demand_current(d) AS active
       FROM erp_private.t11_demands d WHERE d.branch_id=b.id ORDER BY d.id DESC LIMIT 100) x)
 );
 IF p_workspace='inventory' THEN
  result:=result||jsonb_build_object(
   'sites',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',w.id,'label',w.site_name) ORDER BY w.site_name),'[]')
    FROM public.work_sites w WHERE rights?'supply.setup'
      AND erp_private.t06_site_allowed(w.id,b.owner_company_id,b.id,current_date,current_date)),
   'parties',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.label),'[]') FROM(
    SELECT p.id,p.display_name AS label FROM public.parties p WHERE rights?'supply.setup' AND erp_private.t11_party(p.id,b.owner_company_id,b.id)
    ORDER BY p.display_name,p.id LIMIT 150) x),
   'approvers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.label),'[]') FROM(
    SELECT person.id,person.full_name AS label FROM public.user_profiles person
    WHERE rights?'supply.setup' AND person.id<>public.current_user_profile_id() AND person.status='active' AND NOT person.must_change_password
     AND EXISTS(SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id AND r.is_active
       JOIN public.role_permissions rp ON rp.role_id=r.id JOIN public.permissions cap ON cap.id=rp.permission_id AND cap.is_active
       LEFT JOIN erp_private.t02_role_validity v ON v.assignment_id=ur.id
       WHERE ur.user_profile_id=person.id AND ur.is_active AND ur.owner_company_id=b.owner_company_id
        AND (ur.branch_id IS NULL OR ur.branch_id=b.id) AND cap.permission_code='supply.approve'
        AND r.role_code NOT IN('system_admin','group_admin','company_admin','branch_admin')
        AND (v.valid_until IS NULL OR v.valid_until>statement_timestamp()))
    ORDER BY person.full_name,person.id LIMIT 100) x),
   'jobs',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
    SELECT j.id,'WO-'||j.assessment_id||'/'||j.cycle||' · '||f.asset_id AS label
    FROM erp_private.t10_job_cycles j JOIN erp_private.t10_assessments f ON f.id=j.assessment_id
    WHERE f.branch_id=b.id AND j.state IN('planned','in-progress') AND rights?'supply.request'
    ORDER BY j.id DESC LIMIT 100) x),
   'fuel',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
    SELECT f.id,f.reference AS label,f.litres FROM erp_private.t11_fuel_vouchers f WHERE f.branch_id=b.id AND f.accepted_at IS NOT NULL
    AND f.source_kind IN('tank','tanker') AND rights?'supply.request' ORDER BY f.id DESC LIMIT 100) x),
   'layers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
    SELECT l.id,i.code||' · '||n.store||' / '||n.code AS label,i.unit_id AS uom,n.kind, l.on_hand,l.reserved,l.revision,
     l.lot,s.serial,l.count_root,CASE WHEN l.count_root IS NULL THEN
      l.on_hand+coalesce((SELECT sum(child.on_hand) FROM erp_private.t11_layers child WHERE child.count_root=l.id),0)
     END AS count_total,o.code AS owner,v.layer_id IS NOT NULL AS valued,l.bin_id
    FROM erp_private.t11_layers l JOIN erp_private.t11_bins n ON n.id=l.bin_id JOIN erp_private.t11_items i ON i.id=l.item_id
    JOIN erp_private.t11_owners o ON o.id=l.owner_id LEFT JOIN erp_private.t11_serials s ON s.id=l.serial_id
    LEFT JOIN erp_private.t11_values v ON v.layer_id=coalesce(l.finance_root,l.id)
    WHERE n.branch_id=b.id ORDER BY l.id DESC LIMIT 120) x),
   'reservations',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
    SELECT r.id,r.reference AS label,r.state,r.quantity,r.destination_bin,r.demand_id,r.layer_id
    FROM erp_private.t11_reservations r JOIN erp_private.t11_layers l ON l.id=r.layer_id JOIN erp_private.t11_bins bn ON bn.id=l.bin_id
    WHERE bn.branch_id=b.id ORDER BY r.id DESC LIMIT 100) x),
   'reviews',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
    SELECT r.id,r.kind||' · '||r.reason AS label,r.kind,r.outcome,r.quantity,r.movement_id
    FROM erp_private.t11_reviews r JOIN erp_private.t11_layers l ON l.id=r.layer_id JOIN erp_private.t11_bins bn ON bn.id=l.bin_id
    WHERE bn.branch_id=b.id ORDER BY r.id DESC LIMIT 100) x),
   'movements',(SELECT coalesce(jsonb_agg(public.t11_movement_receipt(x.id) ORDER BY x.id DESC),'[]') FROM(
    SELECT DISTINCT m.id FROM erp_private.t11_movements m JOIN erp_private.t11_layers l ON l.id IN(m.from_layer,m.to_layer)
    JOIN erp_private.t11_bins bn ON bn.id=l.bin_id WHERE bn.branch_id=b.id ORDER BY m.id DESC LIMIT 100) x)
  );
 ELSE
  result:=result||jsonb_build_object(
   'suppliers',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',vendor.id,'label',vendor.display_name) ORDER BY vendor.display_name),'[]')
    FROM public.parties vendor JOIN public.party_vendor_profiles p ON p.party_id=vendor.id AND p.can_create_po
    JOIN public.party_approval_statuses s ON s.id=p.vendor_approval_status_id AND s.is_active AND upper(s.approval_status_code)='APPROVED'
    WHERE erp_private.t11_party(vendor.id,b.owner_company_id,b.id)),
   'purchases',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
    SELECT l.id,l.reference||' / '||l.line_no AS label,l.approved_at,l.quantity,l.item_id,i.unit_id AS uom,
      CASE WHEN erp_private.t11_party(vendor.id,l.company_id,l.branch_id) THEN vendor.display_name END AS supplier,
      coalesce((SELECT sum(r.delivered) FROM erp_private.t11_goods_receipts r WHERE r.purchase_id=l.id),0) AS delivered
    FROM erp_private.t11_purchase_lines l JOIN public.parties vendor ON vendor.id=l.supplier_id
    JOIN erp_private.t11_items i ON i.id=l.item_id WHERE l.branch_id=b.id ORDER BY l.id DESC LIMIT 100) x),
   'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
    SELECT r.id,r.purchase_id,r.delivery_note AS label,r.delivered,r.accepted,r.rejected,r.quarantined,r.received_at,r.lot,r.serial,
      i.unit_id AS uom,r.accepted_movement,r.quarantine_movement,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'outcome',d.outcome,'quantity',d.quantity,'movement',d.movement_id) ORDER BY d.id),'[]')
       FROM erp_private.t11_quarantine_decisions d WHERE d.receipt_id=r.id) AS inspections,
      (SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'quantity',m.quantity,'movement',m.id,'reference',s.reference) ORDER BY s.id),'[]')
       FROM erp_private.t11_supplier_returns s JOIN erp_private.t11_movements m ON m.id=s.movement_id WHERE s.receipt_id=r.id) AS returns
    FROM erp_private.t11_goods_receipts r JOIN erp_private.t11_purchase_lines l ON l.id=r.purchase_id
    JOIN erp_private.t11_items i ON i.id=l.item_id WHERE l.branch_id=b.id ORDER BY r.id DESC LIMIT 100) x)
  );
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION public.t11_fuel_workspace(p_asset bigint DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a erp_private.fleet_assets; scope record; permitted boolean; report boolean;
BEGIN
 IF p_asset IS NULL THEN
  RETURN jsonb_build_object('assets',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
    SELECT fa.id,fa.asset_no||' · '||fa.name AS label FROM erp_private.fleet_assets fa
    CROSS JOIN LATERAL erp_private.t06_operation_scope(fa.id) s
    WHERE erp_private.t11_visible('fuel',s.company_id,s.branch_id) OR EXISTS(SELECT 1 FROM erp_private.t11_fuel_vouchers f
      WHERE f.asset_id=fa.id AND erp_private.t11_visible('fuel',f.company_id,f.branch_id))
    ORDER BY fa.id DESC LIMIT 120) x));
 END IF;
 SELECT * INTO a FROM erp_private.fleet_assets WHERE id=p_asset;
 IF a.id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO scope FROM erp_private.t06_operation_scope(a.id);
 permitted:=erp_private.t11_visible('fuel',scope.company_id,scope.branch_id);
 report:=a.status='active' AND erp_private.t05_scope('supply.fuel',scope.company_id,scope.branch_id);
 IF NOT permitted AND NOT EXISTS(SELECT 1 FROM erp_private.t11_fuel_vouchers f WHERE f.asset_id=a.id
   AND erp_private.t11_visible('fuel',f.company_id,f.branch_id)) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('asset',a.id,'label',a.asset_no||' · '||a.name,'report',report,
  'vouchers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id DESC),'[]') FROM(
    SELECT f.id,f.reference,f.source_kind,f.source_ref,f.occurred_at,f.litres,f.meter_unit,f.meter_value,f.accepted_at,f.reason,
     coalesce(m.booked,0) AS booked_litres,coalesce(m.issues,'[]') AS issues,
     CASE WHEN erp_private.document_permission(f.document_id,'dms.documents.preview') THEN f.file_id END AS file,
     f.accepted_at IS NULL AND f.reported_by<>public.current_user_profile_id()
       AND erp_private.t05_scope('supply.approve',f.company_id,f.branch_id)
       AND erp_private.document_permission(f.document_id,'dms.documents.preview') AS can_verify
    FROM erp_private.t11_fuel_vouchers f
    LEFT JOIN LATERAL (
     SELECT sum(i.quantity-coalesce(c.quantity,0)) AS booked,
       jsonb_agg(jsonb_build_object('id',i.id,'issued',i.quantity,'returned',coalesce(c.quantity,0)) ORDER BY i.id) AS issues
     FROM erp_private.t11_demands d JOIN erp_private.t11_reservations r ON r.demand_id=d.id
     JOIN erp_private.t11_movements i ON i.reservation_id=r.id AND i.kind='issue'
     LEFT JOIN LATERAL(SELECT sum(change.quantity) AS quantity FROM erp_private.t11_movements change
      WHERE change.linked_movement=i.id AND change.kind IN('unused-return','reverse')) c ON true
     WHERE d.fuel_id=f.id) m ON true
    WHERE f.asset_id=a.id AND erp_private.t11_visible('fuel',f.company_id,f.branch_id) ORDER BY f.id DESC LIMIT 100) x),
  'evidence',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.file DESC),'[]') FROM(
    SELECT d.id AS document,v.id AS version,f.id AS file,d.document_no||' · '||d.title AS label
    FROM erp_private.fleet_document_parents p JOIN public.dms_documents d ON d.id=p.document_id
    JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.type_code='FLEET_FUEL_VOUCHER' AND t.deleted_at IS NULL
    JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.is_current AND v.unlinked_at IS NULL AND v.document_id=d.id
    JOIN public.dms_document_files f ON f.document_id=d.id AND f.version_id=v.id AND f.file_role='original' AND f.deleted_at IS NULL
         AND f.integrity_status='verified' AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$'
    JOIN public.dms_document_links l ON l.document_id=d.id AND l.entity_type='fleet_asset' AND l.entity_id=a.id AND l.deleted_at IS NULL
    WHERE report AND p.asset_id=a.id AND d.status='active' AND NOT d.is_archived AND d.deleted_at IS NULL
     AND erp_private.document_permission(d.id,'dms.documents.preview')
     AND NOT EXISTS(SELECT 1 FROM erp_private.t11_fuel_vouchers recorded WHERE recorded.document_id=d.id)
    ORDER BY f.id DESC LIMIT 60) x),
  'bins',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',b.id,'label',b.store||' / '||b.code) ORDER BY b.code),'[]')
    FROM erp_private.t11_bins b WHERE report AND b.branch_id=scope.branch_id AND b.kind='available'),
  'items',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'label',i.code||' · '||i.name) ORDER BY i.code),'[]')
    FROM erp_private.t11_items i WHERE report AND i.company_id=scope.company_id AND i.kind='fuel'),
  'owners',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',o.id,'label',o.code) ORDER BY o.code),'[]')
    FROM erp_private.t11_owners o WHERE report AND o.branch_id=scope.branch_id),
  'suppliers',(SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.label),'[]') FROM(
    SELECT vendor.id,vendor.display_name AS label FROM public.parties vendor JOIN public.party_vendor_profiles p ON p.party_id=vendor.id
    WHERE report AND erp_private.t11_party(vendor.id,scope.company_id,scope.branch_id) ORDER BY vendor.display_name LIMIT 120) x));
END $$;

REVOKE ALL ON FUNCTION erp_private.t11_visible(text,bigint,bigint),public.t11_supply_branches(text),public.t11_movement_receipt(bigint),
 public.t11_supply_workspace(bigint,text),public.t11_fuel_workspace(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t11_supply_branches(text),public.t11_movement_receipt(bigint),
 public.t11_supply_workspace(bigint,text),public.t11_fuel_workspace(bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
