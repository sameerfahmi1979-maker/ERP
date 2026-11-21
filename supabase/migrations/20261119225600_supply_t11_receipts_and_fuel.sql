BEGIN;

CREATE TABLE erp_private.t11_purchase_lines (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 supplier_id bigint NOT NULL REFERENCES public.parties(id),
 item_id bigint NOT NULL REFERENCES erp_private.t11_items(id),
 owner_id bigint NOT NULL REFERENCES erp_private.t11_owners(id),
 demand_id bigint REFERENCES erp_private.t11_demands(id),
 reference text NOT NULL,
 line_no integer NOT NULL CHECK(line_no>0),
 quantity numeric(16,3) NOT NULL CHECK(quantity>0),
 comparison_ref text,
 prepared_by bigint NOT NULL REFERENCES public.user_profiles(id),
 prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 approved_by bigint REFERENCES public.user_profiles(id),
 approved_at timestamptz,
 reason text NOT NULL,
 approval_reason text,
 UNIQUE(company_id,reference,line_no),
 CHECK(approved_at IS NULL OR approved_by<>prepared_by)
);
CREATE INDEX t11_purchase_scope ON erp_private.t11_purchase_lines(company_id,branch_id,id DESC);

CREATE TABLE erp_private.t11_goods_receipts (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 purchase_id bigint NOT NULL REFERENCES erp_private.t11_purchase_lines(id),
 delivery_note text NOT NULL,
 lot text,
 serial text,
 delivered numeric(16,3) NOT NULL CHECK(delivered>0),
 accepted numeric(16,3) NOT NULL CHECK(accepted>=0),
 rejected numeric(16,3) NOT NULL CHECK(rejected>=0),
 quarantined numeric(16,3) NOT NULL CHECK(quarantined>=0),
 accepted_movement bigint UNIQUE REFERENCES erp_private.t11_movements(id),
 quarantine_movement bigint UNIQUE REFERENCES erp_private.t11_movements(id),
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 UNIQUE(purchase_id,delivery_note),
 CHECK(delivered=accepted+rejected+quarantined),
 CHECK((accepted=0)=(accepted_movement IS NULL) AND (quarantined=0)=(quarantine_movement IS NULL))
);
CREATE TABLE erp_private.t11_quarantine_decisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 receipt_id bigint NOT NULL REFERENCES erp_private.t11_goods_receipts(id),
 outcome text NOT NULL CHECK(outcome IN('accepted','rejected')),
 quantity numeric(16,3) NOT NULL CHECK(quantity>0),
 movement_id bigint UNIQUE REFERENCES erp_private.t11_movements(id),
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 CHECK((outcome='accepted')=(movement_id IS NOT NULL))
);
CREATE INDEX t11_quarantine_receipt ON erp_private.t11_quarantine_decisions(receipt_id,id);

CREATE TABLE erp_private.t11_supplier_returns (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 receipt_id bigint NOT NULL REFERENCES erp_private.t11_goods_receipts(id),
 original_id bigint NOT NULL REFERENCES erp_private.t11_movements(id),
 movement_id bigint NOT NULL UNIQUE REFERENCES erp_private.t11_movements(id),
 reference text NOT NULL,
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 returned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 UNIQUE(receipt_id,reference)
);

CREATE FUNCTION erp_private.t11_supplier_ready(p_supplier bigint,p_company bigint,p_branch bigint,p_comparison text)
RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT erp_private.t11_party(p_supplier,p_company,p_branch) THEN RETURN false; END IF;
 PERFORM 1 FROM public.party_vendor_profiles vp
 JOIN public.parties p ON p.id=vp.party_id AND p.is_active
 JOIN public.party_approval_statuses s ON s.id=vp.vendor_approval_status_id
    AND s.is_active AND upper(s.approval_status_code)='APPROVED'
 WHERE vp.party_id=p_supplier AND vp.can_create_po AND (NOT vp.requires_comparison OR p_comparison IS NOT NULL)
 FOR SHARE OF vp,p,s;
 RETURN FOUND;
END $$;

CREATE FUNCTION public.t11_purchase_command(p_operation uuid,p_branch bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE branch public.branches; order_line erp_private.t11_purchase_lines; receipt erp_private.t11_goods_receipts;
 item erp_private.t11_items; unit erp_private.t11_units; owner erp_private.t11_owners; demand erp_private.t11_demands;
 bin erp_private.t11_bins; quarantine erp_private.t11_bins; source erp_private.t11_layers; original erp_private.t11_movements;
 actor bigint:=public.current_user_profile_id(); keys text[]; cap text; digest text; replay jsonb;
 note text; ref text; comparison text; decision text; trace_lot text; trace_serial text; ref_line numeric;
 qty numeric; previous_qty numeric; admitted numeric; rejected_qty numeric; quarantine_qty numeric;
 identity bigint; layer_id bigint; accepted_move bigint; quarantine_move bigint; movement bigint; item_key bigint; order_key bigint;
BEGIN
 keys:=CASE p_action
 WHEN 'prepare' THEN ARRAY['supplier','item','owner','demand','reference','line','uom','quantity','comparison']
 WHEN 'approve' THEN ARRAY['purchase']
 WHEN 'receive' THEN ARRAY['purchase','delivery_note','uom','quantity','accepted','rejected','quarantined','bin','quarantine_bin','lot','serial']
 WHEN 'quarantine' THEN ARRAY['receipt','outcome','uom','quantity','bin']
 WHEN 'supplier-return' THEN ARRAY['receipt','movement','reference','uom','quantity']
 END;
 IF keys IS NULL OR NOT erp_private.t05_fields(p_data,keys||ARRAY['reason']) THEN
  RAISE EXCEPTION 'Choose a valid purchasing action' USING ERRCODE='22023'; END IF;
 SELECT * INTO branch FROM public.branches WHERE id=p_branch;
 cap:=CASE WHEN p_action IN('approve','quarantine') THEN 'supply.purchase.approve' ELSE 'supply.purchase' END;
 PERFORM erp_private.t11_scope(cap,branch.owner_company_id,branch.id);
 PERFORM erp_private.t11_pilot(branch.owner_company_id,branch.id,'purchasing');
 IF p_action IN('receive','quarantine','supplier-return') THEN PERFORM erp_private.t11_pilot(branch.owner_company_id,branch.id,'stock'); END IF;
 note:=erp_private.t10_text(p_data,'reason',1000);
 IF p_action IN('quarantine','supplier-return') THEN
  SELECT r.* INTO receipt FROM erp_private.t11_goods_receipts r JOIN erp_private.t11_purchase_lines l ON l.id=r.purchase_id
  WHERE r.id=(p_data->>'receipt')::bigint AND l.branch_id=branch.id;
  order_key:=receipt.purchase_id;
 ELSE order_key:=(p_data->>'purchase')::bigint;
 END IF;
 IF p_action<>'prepare' THEN
  SELECT * INTO order_line FROM erp_private.t11_purchase_lines WHERE id=order_key AND branch_id=branch.id;
  IF order_line.id IS NULL THEN RAISE EXCEPTION 'Purchase receipt unavailable in this branch' USING ERRCODE='42501'; END IF;
  item_key:=order_line.item_id;
 ELSE item_key:=(p_data->>'item')::bigint; END IF;
 SELECT * INTO item FROM erp_private.t11_items WHERE id=item_key AND company_id=branch.owner_company_id FOR UPDATE;
 IF item.id IS NULL THEN RAISE EXCEPTION 'Use an item from this company catalogue' USING ERRCODE='42501'; END IF;
 IF order_key IS NOT NULL THEN SELECT * INTO order_line FROM erp_private.t11_purchase_lines WHERE id=order_key FOR UPDATE; END IF;
 SELECT * INTO unit FROM erp_private.t11_units WHERE id=item.unit_id;
 IF p_action<>'approve' THEN
  IF unit.id IS DISTINCT FROM (p_data->>'uom')::bigint THEN RAISE EXCEPTION 'Use the exact purchase item unit' USING ERRCODE='22023'; END IF;
  qty:=erp_private.t11_quantity(p_data,'quantity',unit.decimal_places);
 END IF;

 -- Replay is subject to the same bin authority as first-time booking.
 IF (p_action='receive' AND (p_data->>'accepted')::numeric>0) OR (p_action='quarantine' AND p_data->>'outcome'='accepted') THEN
  bin:=erp_private.t11_bin_access('supply.stock',(p_data->>'bin')::bigint);
  IF bin.branch_id<>branch.id OR bin.kind<>'available' THEN RAISE EXCEPTION 'Use an available bin in this receiving branch' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_action='receive' AND (p_data->>'quarantined')::numeric>0 THEN
  quarantine:=erp_private.t11_bin_access('supply.stock',(p_data->>'quarantine_bin')::bigint);
  IF quarantine.branch_id<>branch.id OR quarantine.kind<>'quarantine' THEN RAISE EXCEPTION 'Use the receiving branch quarantine bin' USING ERRCODE='42501'; END IF;
 END IF;
 IF p_action='supplier-return' THEN
  SELECT m.* INTO original FROM erp_private.t11_movements m WHERE m.id=(p_data->>'movement')::bigint
   AND (m.id IN(receipt.accepted_movement,receipt.quarantine_movement)
    OR EXISTS(SELECT 1 FROM erp_private.t11_quarantine_decisions d WHERE d.receipt_id=receipt.id AND d.movement_id=m.id));
  IF original.id IS NULL THEN RAISE EXCEPTION 'Select the exact stock movement admitted by this goods receipt' USING ERRCODE='PT409'; END IF;
  SELECT * INTO source FROM erp_private.t11_layers WHERE id=original.to_layer FOR UPDATE;
  bin:=erp_private.t11_bin_access('supply.stock',source.bin_id);
  IF bin.branch_id<>branch.id THEN RAISE EXCEPTION 'Exact receiving branch authority is required' USING ERRCODE='42501'; END IF;
 END IF;
 digest:=erp_private.t02_digest(jsonb_build_array(branch.id,p_action,p_data));
 replay:=erp_private.t02_replay('t11-purchase',p_operation,digest);
 IF replay IS NOT NULL THEN RETURN replay; END IF;
 IF p_action='prepare' THEN
  comparison:=nullif(btrim(p_data->>'comparison'),'');
  IF length(comparison)>150 OR NOT erp_private.t11_supplier_ready((p_data->>'supplier')::bigint,branch.owner_company_id,branch.id,comparison) THEN
   RAISE EXCEPTION 'Select a currently approved Party Master vendor and its required comparison' USING ERRCODE='PT409'; END IF;
  SELECT * INTO owner FROM erp_private.t11_owners WHERE id=(p_data->>'owner')::bigint AND branch_id=branch.id;
  IF owner.id IS NULL THEN RAISE EXCEPTION 'Choose a stock owner for this branch' USING ERRCODE='42501'; END IF;
  IF p_data->>'demand' IS NOT NULL THEN
   SELECT * INTO demand FROM erp_private.t11_demands d WHERE d.id=(p_data->>'demand')::bigint AND d.branch_id=branch.id
    AND d.item_id=item.id AND d.owner_id=owner.id;
   IF demand.id IS NULL OR NOT erp_private.t11_workshop_demand_current(demand) THEN
    RAISE EXCEPTION 'Choose an open demand for this item and owner' USING ERRCODE='PT409'; END IF;
  END IF;
  ref:=erp_private.t11_key(p_data,'reference',100);
  ref_line:=erp_private.t11_quantity(p_data,'line',0);
  IF ref_line>2147483647 THEN RAISE EXCEPTION 'Enter a valid purchase line number' USING ERRCODE='22023'; END IF;
  INSERT INTO erp_private.t11_purchase_lines(company_id,branch_id,supplier_id,item_id,owner_id,demand_id,reference,line_no,
    quantity,comparison_ref,prepared_by,reason)
  VALUES(branch.owner_company_id,branch.id,(p_data->>'supplier')::bigint,item.id,owner.id,demand.id,ref,ref_line,qty,comparison,actor,note)
  ON CONFLICT DO NOTHING RETURNING id INTO identity;
  IF identity IS NULL THEN RAISE EXCEPTION 'This purchase line is already recorded' USING ERRCODE='PT409'; END IF;
 ELSIF p_action='approve' THEN
  IF order_line.approved_at IS NOT NULL OR order_line.prepared_by=actor OR
   NOT erp_private.t11_supplier_ready(order_line.supplier_id,branch.owner_company_id,branch.id,order_line.comparison_ref) THEN
   RAISE EXCEPTION 'Independent current purchasing approval is required' USING ERRCODE='PT409'; END IF;
  IF order_line.demand_id IS NOT NULL THEN
   SELECT * INTO demand FROM erp_private.t11_demands WHERE id=order_line.demand_id FOR UPDATE;
   SELECT coalesce(sum(l.quantity),0) INTO previous_qty FROM erp_private.t11_purchase_lines l
    WHERE l.demand_id=demand.id AND l.approved_at IS NOT NULL;
   IF NOT erp_private.t11_workshop_demand_current(demand) OR order_line.quantity+previous_qty>demand.quantity THEN
    RAISE EXCEPTION 'Proposed commitment exceeds the remaining demand or belongs to a closed job' USING ERRCODE='PT409'; END IF;
   IF demand.job_id IS NOT NULL THEN
    PERFORM 1 FROM erp_private.t10_job_cycles WHERE id=demand.job_id FOR SHARE;
    IF NOT erp_private.t11_workshop_demand_current(demand) THEN RAISE EXCEPTION 'Workshop job changed before purchase approval' USING ERRCODE='PT409'; END IF;
   END IF;
  END IF;
  UPDATE erp_private.t11_purchase_lines SET approved_at=clock_timestamp(),approved_by=actor,approval_reason=note WHERE id=order_line.id;
  identity:=order_line.id;
 ELSIF p_action='receive' THEN
  IF order_line.approved_at IS NULL THEN RAISE EXCEPTION 'Approve the exact purchase line before receiving' USING ERRCODE='PT409'; END IF;
  ref:=erp_private.t11_key(p_data,'delivery_note',100);
  admitted:=erp_private.t11_quantity(p_data,'accepted',unit.decimal_places,true);
  rejected_qty:=erp_private.t11_quantity(p_data,'rejected',unit.decimal_places,true);
  quarantine_qty:=erp_private.t11_quantity(p_data,'quarantined',unit.decimal_places,true);
  SELECT coalesce(sum(r.delivered),0) INTO previous_qty FROM erp_private.t11_goods_receipts r WHERE r.purchase_id=order_line.id;
  IF qty<>admitted+rejected_qty+quarantine_qty OR qty+previous_qty>order_line.quantity OR (item.trace='serial' AND qty<>1)
   OR EXISTS(SELECT 1 FROM erp_private.t11_goods_receipts r WHERE r.purchase_id=order_line.id AND r.delivery_note=ref) THEN
   RAISE EXCEPTION 'Reconcile the delivery split, remaining order or serial and use a new delivery note' USING ERRCODE='PT409'; END IF;
  trace_lot:=nullif(upper(btrim(p_data->>'lot')),''); trace_serial:=nullif(upper(btrim(p_data->>'serial')),'');
  IF (item.trace='lot')<>(trace_lot IS NOT NULL) OR (item.trace='serial')<>(trace_serial IS NOT NULL)
    OR coalesce(length(trace_lot),0)>150 OR coalesce(length(trace_serial),0)>150 THEN
   RAISE EXCEPTION 'Record the exact delivered lot or serial' USING ERRCODE='22023'; END IF;
  IF admitted>0 THEN
   layer_id:=erp_private.t11_new_layer(item.id,order_line.owner_id,bin.id,trace_lot,trace_serial,false);
   accepted_move:=erp_private.t11_move('goods-accepted',NULL,layer_id,admitted,actor,note);
  END IF;
  IF quarantine_qty>0 THEN
   layer_id:=erp_private.t11_new_layer(item.id,order_line.owner_id,quarantine.id,trace_lot,trace_serial,false);
   quarantine_move:=erp_private.t11_move('goods-quarantined',NULL,layer_id,quarantine_qty,actor,note);
  END IF;
  INSERT INTO erp_private.t11_goods_receipts(purchase_id,delivery_note,lot,serial,delivered,accepted,rejected,quarantined,
    accepted_movement,quarantine_movement,actor_id,reason)
  VALUES(order_line.id,ref,trace_lot,trace_serial,qty,admitted,rejected_qty,quarantine_qty,accepted_move,quarantine_move,actor,note) RETURNING id INTO identity;
 ELSIF p_action='quarantine' THEN
  decision:=p_data->>'outcome';
  SELECT coalesce(sum(d.quantity),0) INTO previous_qty FROM erp_private.t11_quarantine_decisions d WHERE d.receipt_id=receipt.id;
  IF receipt.actor_id=actor OR coalesce(decision,'') NOT IN('accepted','rejected') OR qty+previous_qty>receipt.quarantined THEN
   RAISE EXCEPTION 'Independent inspection must cover the remaining quarantined quantity' USING ERRCODE='PT409'; END IF;
  SELECT l.* INTO source FROM erp_private.t11_movements m JOIN erp_private.t11_layers l ON l.id=m.to_layer
   WHERE m.id=receipt.quarantine_movement FOR UPDATE OF l;
  IF source.id IS NULL THEN RAISE EXCEPTION 'Quarantine layer unavailable' USING ERRCODE='PT409'; END IF;
  IF decision='accepted' THEN
   layer_id:=erp_private.t11_matching_layer(source,bin.id,true);
   movement:=erp_private.t11_move('quarantine-accepted',source.id,layer_id,qty,actor,note,NULL,receipt.quarantine_movement);
  END IF;
  INSERT INTO erp_private.t11_quarantine_decisions(receipt_id,outcome,quantity,movement_id,actor_id,reason)
  VALUES(receipt.id,decision,qty,movement,actor,note) RETURNING id INTO identity;
 ELSE
  ref:=erp_private.t11_key(p_data,'reference',100);
  SELECT coalesce(sum(m.quantity),0) INTO previous_qty FROM erp_private.t11_movements m
  WHERE m.linked_movement=original.id AND m.kind='supplier-return';
  admitted:=original.quantity;
  IF original.id=receipt.quarantine_movement THEN
   SELECT coalesce(sum(d.quantity),0) INTO admitted FROM erp_private.t11_quarantine_decisions d
   WHERE d.receipt_id=receipt.id AND d.outcome='rejected';
  END IF;
  IF previous_qty+qty>admitted OR EXISTS(SELECT 1 FROM erp_private.t11_supplier_returns s WHERE s.receipt_id=receipt.id AND s.reference=ref) THEN
   RAISE EXCEPTION 'Return only the remaining quantity of this exact receipt and use a new reference' USING ERRCODE='PT409'; END IF;
  movement:=erp_private.t11_move('supplier-return',source.id,NULL,qty,actor,note,NULL,original.id);
  INSERT INTO erp_private.t11_supplier_returns(receipt_id,original_id,movement_id,reference,actor_id,reason)
  VALUES(receipt.id,original.id,movement,ref,actor,note) RETURNING id INTO identity;
 END IF;
 RETURN erp_private.t02_save_receipt('t11-purchase',p_operation,digest,jsonb_build_object('id',identity,
  'purchase',coalesce(order_line.id,identity),'movement',movement,'accepted_movement',accepted_move,'quarantine_movement',quarantine_move));
END $$;

CREATE FUNCTION public.t11_fuel_command(p_operation uuid,p_asset bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE asset erp_private.fleet_assets; scope record; fuel erp_private.t11_fuel_vouchers;
 actor bigint:=public.current_user_profile_id(); keys text[]; digest text; saved jsonb; at_time timestamptz; evidence jsonb;
 note text; ref text; mode text; merchant bigint; fuel_bin bigint; fuel_item bigint; fuel_owner bigint;
BEGIN
 keys:=CASE p_action WHEN 'record' THEN ARRAY['source','source_ref','source_bin','source_item','source_owner','supplier','reference','occurred','litres','meter_unit','meter_value','evidence']
  WHEN 'verify' THEN ARRAY['voucher'] END;
 IF keys IS NULL OR NOT erp_private.t05_fields(p_data,keys||ARRAY['reason']) THEN
  RAISE EXCEPTION 'Choose a valid manual fuel action' USING ERRCODE='22023'; END IF;
 SELECT * INTO asset FROM erp_private.fleet_assets WHERE id=p_asset FOR UPDATE;
 IF asset.id IS NULL THEN RAISE EXCEPTION 'Fuel asset unavailable' USING ERRCODE='42501'; END IF;
 IF p_action='verify' THEN
  SELECT * INTO fuel FROM erp_private.t11_fuel_vouchers WHERE id=(p_data->>'voucher')::bigint AND asset_id=p_asset FOR UPDATE;
  SELECT fuel.company_id AS company_id,fuel.branch_id AS branch_id INTO scope;
 ELSE SELECT * INTO scope FROM erp_private.t06_operation_scope(asset.id);
 END IF;
 PERFORM erp_private.t11_scope(CASE WHEN p_action='verify' THEN 'supply.approve' ELSE 'supply.fuel' END,scope.company_id,scope.branch_id);
 digest:=erp_private.t02_digest(jsonb_build_array(asset.id,p_action,p_data));
 saved:=erp_private.t02_replay('t11-fuel',p_operation,digest);
 IF saved IS NOT NULL THEN RETURN saved; END IF;
 note:=erp_private.t10_text(p_data,'reason',1000);
 IF p_action='record' THEN
  mode:=p_data->>'source'; evidence:=p_data->'evidence'; merchant:=(p_data->>'supplier')::bigint;
  at_time:=(p_data->>'occurred')::timestamptz;
  ref:=erp_private.t11_key(p_data,'reference',150);
  IF asset.status<>'active' OR at_time IS NULL OR NOT isfinite(at_time) OR at_time>statement_timestamp()
   OR coalesce(mode,'') NOT IN('station','card','tank','tanker') OR coalesce(p_data->>'meter_unit','') NOT IN('km','hours')
   OR (mode IN('station','card') AND merchant IS NULL)
   OR (merchant IS NOT NULL AND NOT erp_private.t11_party(merchant,scope.company_id,scope.branch_id))
   OR NOT erp_private.t10_original(asset.id,evidence,ARRAY['FLEET_FUEL_VOUCHER']) THEN
   RAISE EXCEPTION 'Record the fuel source, meter and verified voucher original for this asset' USING ERRCODE='PT409'; END IF;
  fuel_bin:=(p_data->>'source_bin')::bigint; fuel_item:=(p_data->>'source_item')::bigint; fuel_owner:=(p_data->>'source_owner')::bigint;
  IF mode IN('tank','tanker') THEN
   IF NOT EXISTS(SELECT 1 FROM erp_private.t11_bins b CROSS JOIN erp_private.t11_items i CROSS JOIN erp_private.t11_owners o
    WHERE b.id=fuel_bin AND b.branch_id=scope.branch_id AND b.kind='available' AND i.id=fuel_item AND i.kind='fuel'
      AND i.company_id=scope.company_id AND o.id=fuel_owner AND o.branch_id=scope.branch_id) THEN
    RAISE EXCEPTION 'Select the exact local dispensing bin, fuel item and stock owner' USING ERRCODE='PT409'; END IF;
  ELSIF num_nonnulls(fuel_bin,fuel_item,fuel_owner)<>0 THEN
   RAISE EXCEPTION 'External fuel has a supplier source and no own stock location' USING ERRCODE='22023';
  END IF;
  INSERT INTO erp_private.t11_fuel_vouchers(asset_id,company_id,branch_id,source_kind,supplier_id,source_ref,source_bin,source_item,source_owner,reference,occurred_at,
    litres,meter_unit,meter_value,document_id,version_id,file_id,reported_by,reason)
  VALUES(asset.id,scope.company_id,scope.branch_id,mode,merchant,erp_private.t11_key(p_data,'source_ref',150),fuel_bin,fuel_item,fuel_owner,ref,at_time,erp_private.t11_quantity(p_data,'litres',3),
    p_data->>'meter_unit',erp_private.t11_quantity(p_data,'meter_value',3,true),(evidence->>'document')::bigint,
    (evidence->>'version')::bigint,(evidence->>'file')::bigint,actor,note)
  ON CONFLICT DO NOTHING RETURNING * INTO fuel;
  IF fuel.id IS NULL THEN RAISE EXCEPTION 'This voucher original or reference is already recorded' USING ERRCODE='PT409'; END IF;
 ELSE
  evidence:=jsonb_build_object('document',fuel.document_id,'version',fuel.version_id,'file',fuel.file_id);
  IF fuel.reported_by=actor OR fuel.accepted_at IS NOT NULL OR
   NOT erp_private.t10_original(asset.id,evidence,ARRAY['FLEET_FUEL_VOUCHER']) THEN
   RAISE EXCEPTION 'An independent reviewer must check the current voucher original' USING ERRCODE='PT409'; END IF;
  UPDATE erp_private.t11_fuel_vouchers SET accepted_by=actor,accepted_at=clock_timestamp() WHERE id=fuel.id RETURNING * INTO fuel;
 END IF;
 RETURN erp_private.t02_save_receipt('t11-fuel',p_operation,digest,jsonb_build_object('id',fuel.id,
  'verified',fuel.accepted_at IS NOT NULL,'stock_movement',NULL,'posted_cost',NULL));
END $$;

CREATE FUNCTION erp_private.t11_retain_fuel_original() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='dms_document_files' THEN
  IF (TG_OP='DELETE' OR ROW(NEW.document_id,NEW.version_id,NEW.deleted_at,NEW.file_role,NEW.sha256_hash,
    NEW.file_size_bytes,NEW.storage_bucket,NEW.storage_path,NEW.integrity_status) IS DISTINCT FROM
   ROW(OLD.document_id,OLD.version_id,OLD.deleted_at,OLD.file_role,OLD.sha256_hash,
    OLD.file_size_bytes,OLD.storage_bucket,OLD.storage_path,OLD.integrity_status))
   AND EXISTS(SELECT 1 FROM erp_private.t11_fuel_vouchers f WHERE f.file_id=OLD.id) THEN
   RAISE EXCEPTION 'Retain the original manual fuel voucher' USING ERRCODE='PT409'; END IF;
 ELSIF TG_TABLE_NAME='dms_document_versions' THEN
  IF (TG_OP='DELETE' OR ROW(NEW.document_id,NEW.unlinked_at) IS DISTINCT FROM ROW(OLD.document_id,OLD.unlinked_at))
   AND EXISTS(SELECT 1 FROM erp_private.t11_fuel_vouchers f WHERE f.version_id=OLD.id) THEN
   RAISE EXCEPTION 'Retain the manual fuel voucher version' USING ERRCODE='PT409'; END IF;
 ELSE
  IF OLD.entity_type='fleet_asset' AND OLD.deleted_at IS NULL
   AND (TG_OP='DELETE' OR ROW(NEW.document_id,NEW.entity_id,NEW.entity_type,NEW.deleted_at) IS DISTINCT FROM
        ROW(OLD.document_id,OLD.entity_id,OLD.entity_type,OLD.deleted_at))
   AND EXISTS(SELECT 1 FROM erp_private.t11_fuel_vouchers f WHERE f.document_id=OLD.document_id AND f.asset_id=OLD.entity_id) THEN
   RAISE EXCEPTION 'Retain the fuel voucher association with the asset' USING ERRCODE='PT409'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER t11_retain_fuel_file BEFORE UPDATE OF document_id,version_id,deleted_at,file_role,sha256_hash,
 file_size_bytes,storage_bucket,storage_path,integrity_status OR DELETE ON public.dms_document_files
 FOR EACH ROW EXECUTE FUNCTION erp_private.t11_retain_fuel_original();
CREATE TRIGGER t11_retain_fuel_version BEFORE UPDATE OF document_id,unlinked_at OR DELETE ON public.dms_document_versions
 FOR EACH ROW EXECUTE FUNCTION erp_private.t11_retain_fuel_original();
CREATE TRIGGER t11_retain_fuel_link BEFORE UPDATE OF document_id,entity_id,entity_type,deleted_at OR DELETE ON public.dms_document_links
 FOR EACH ROW EXECUTE FUNCTION erp_private.t11_retain_fuel_original();

DO $$
DECLARE table_name text;
BEGIN
 FOR table_name IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='erp_private' AND c.relkind='r' AND c.relname IN('t11_purchase_lines','t11_goods_receipts','t11_quarantine_decisions','t11_supplier_returns') LOOP
  EXECUTE format('ALTER TABLE erp_private.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON erp_private.%I FROM PUBLIC,anon,authenticated,service_role',table_name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION erp_private.t11_supplier_ready(bigint,bigint,bigint,text),erp_private.t11_retain_fuel_original(),
 public.t11_purchase_command(uuid,bigint,text,jsonb),public.t11_fuel_command(uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t11_purchase_command(uuid,bigint,text,jsonb),public.t11_fuel_command(uuid,bigint,text,jsonb) TO authenticated;
COMMIT;
