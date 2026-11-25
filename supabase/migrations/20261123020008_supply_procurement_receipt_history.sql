BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE FUNCTION erp_private.t11_procurement_receipt_data(r erp_private.t11_goods_receipts,p_uom bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object(
  'id',($1).id,'purchase_id',($1).purchase_id,'label',($1).delivery_note,'delivered',($1).delivered,
  'accepted',($1).accepted,'rejected',($1).rejected,'quarantined',($1).quarantined,
  'received_at',($1).received_at,'lot',($1).lot,'serial',($1).serial,'uom',p_uom,
  'accepted_movement',($1).accepted_movement,'quarantine_movement',($1).quarantine_movement,
  'inspections',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',d.id,'outcome',d.outcome,
   'quantity',d.quantity,'movement',d.movement_id) ORDER BY d.id),'[]')
   FROM erp_private.t11_quarantine_decisions d WHERE d.receipt_id=($1).id),
  'returns',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',s.id,'quantity',m.quantity,
   'movement',m.id,'reference',s.reference) ORDER BY s.id),'[]')
   FROM erp_private.t11_supplier_returns s JOIN erp_private.t11_movements m ON m.id=s.movement_id
   WHERE s.receipt_id=($1).id)
 );
$$;

CREATE FUNCTION erp_private.t11_supply_workspace_projection(p_branch bigint,p_workspace text,p_include_receipt_details boolean) RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path='' AS $$
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
    JOIN erp_private.t11_items i ON i.id=l.item_id WHERE l.branch_id=b.id ORDER BY l.id DESC LIMIT 100) x)
  );
  IF p_include_receipt_details THEN
   result:=result||jsonb_build_object('receipts',(
    SELECT coalesce(jsonb_agg(erp_private.t11_procurement_receipt_data(r,i.unit_id) ORDER BY r.id DESC),'[]')
    FROM (
     SELECT receipt.id
     FROM erp_private.t11_goods_receipts receipt
     JOIN erp_private.t11_purchase_lines line ON line.id=receipt.purchase_id
     WHERE line.branch_id=b.id ORDER BY receipt.id DESC LIMIT 100
    )ids
    JOIN erp_private.t11_goods_receipts r ON r.id=ids.id
    JOIN erp_private.t11_purchase_lines l ON l.id=r.purchase_id
    JOIN erp_private.t11_items i ON i.id=l.item_id
   ));
  ELSE
   result:=result||jsonb_build_object('receipt_choices',(
    SELECT coalesce(jsonb_agg(jsonb_build_object('id',r.id,'label',r.delivery_note,
     'needs_inspection',r.quarantined>coalesce((SELECT sum(d.quantity)
      FROM erp_private.t11_quarantine_decisions d WHERE d.receipt_id=r.id),0)) ORDER BY r.id DESC),'[]')
    FROM (
     SELECT receipt.id,receipt.delivery_note,receipt.quarantined
     FROM erp_private.t11_goods_receipts receipt
     JOIN erp_private.t11_purchase_lines line ON line.id=receipt.purchase_id
     WHERE line.company_id=b.owner_company_id AND line.branch_id=b.id
     ORDER BY receipt.id DESC LIMIT 100
    )r
   ));
  END IF;
 END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION public.t11_supply_workspace(p_branch bigint,p_workspace text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.t11_supply_workspace_projection(p_branch,p_workspace,true);
$$;

CREATE FUNCTION public.t11_procurement_workspace(p_branch bigint) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path='' AS $$
 SELECT erp_private.t11_supply_workspace_projection(p_branch,'procurement',false);
$$;

CREATE FUNCTION public.t11_procurement_receipt_history(p_branch bigint,p_page integer,p_page_size integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE company bigint; result jsonb;
BEGIN
 IF p_branch IS NULL OR p_branch<1 OR p_page IS NULL OR p_page NOT BETWEEN 1 AND 1000000
  OR p_page_size IS NULL OR p_page_size NOT BETWEEN 1 AND 100 THEN
  RAISE EXCEPTION 'Choose a valid goods receipt history page' USING ERRCODE='22023';
 END IF;

 SELECT b.owner_company_id INTO company
 FROM public.branches b JOIN public.owner_companies c ON c.id=b.owner_company_id
 WHERE b.id=p_branch AND b.status='active' AND b.operating_status='active' AND c.status='active';
 IF company IS NULL OR NOT erp_private.t11_visible('procurement',company,p_branch) THEN RETURN NULL; END IF;

 WITH matched AS MATERIALIZED (
  SELECT r.id,i.unit_id
  FROM erp_private.t11_purchase_lines l
  JOIN erp_private.t11_goods_receipts r ON r.purchase_id=l.id
  JOIN erp_private.t11_items i ON i.id=l.item_id
  WHERE l.company_id=company AND l.branch_id=p_branch
 ), page_rows AS MATERIALIZED (
  SELECT id,unit_id FROM matched ORDER BY id DESC LIMIT p_page_size OFFSET (p_page::bigint-1)*p_page_size
 )
 SELECT jsonb_build_object('branch',p_branch,'page',p_page,'pageSize',p_page_size,
  'totalCount',(SELECT count(*) FROM matched),
  'rows',coalesce(jsonb_agg(erp_private.t11_procurement_receipt_data(r,p.unit_id) ORDER BY p.id DESC),'[]'))
 INTO result FROM page_rows p JOIN erp_private.t11_goods_receipts r ON r.id=p.id;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION erp_private.t11_procurement_receipt_data(erp_private.t11_goods_receipts,bigint),
 erp_private.t11_supply_workspace_projection(bigint,text,boolean),public.t11_procurement_workspace(bigint),
 public.t11_procurement_receipt_history(bigint,integer,integer) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t11_procurement_workspace(bigint),
 public.t11_procurement_receipt_history(bigint,integer,integer) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
