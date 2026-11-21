BEGIN;

CREATE TABLE erp_private.t11_demands (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 item_id bigint NOT NULL REFERENCES erp_private.t11_items(id),
 owner_id bigint NOT NULL REFERENCES erp_private.t11_owners(id),
 job_id bigint REFERENCES erp_private.t10_job_cycles(id),
 fuel_id bigint REFERENCES erp_private.t11_fuel_vouchers(id),
 source_revision integer,
 source_line text NOT NULL,
 quantity numeric(16,3) NOT NULL CHECK(quantity>0),
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 CHECK(num_nonnulls(job_id,fuel_id)=1)
);
CREATE UNIQUE INDEX t11_workshop_demand_source ON erp_private.t11_demands(job_id,source_line) WHERE job_id IS NOT NULL;
CREATE UNIQUE INDEX t11_fuel_demand_source ON erp_private.t11_demands(fuel_id) WHERE fuel_id IS NOT NULL;

CREATE TABLE erp_private.t11_reservations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 layer_id bigint NOT NULL REFERENCES erp_private.t11_layers(id),
 demand_id bigint REFERENCES erp_private.t11_demands(id),
 destination_bin bigint REFERENCES erp_private.t11_bins(id),
 reference text NOT NULL,
 quantity numeric(16,3) NOT NULL CHECK(quantity>0),
 state text NOT NULL CHECK(state IN('reserved','in-transit','completed','cancelled')),
 opened_by bigint NOT NULL REFERENCES public.user_profiles(id),
 opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 sent_by bigint REFERENCES public.user_profiles(id),
 sent_at timestamptz,
 closed_by bigint REFERENCES public.user_profiles(id),
 closed_at timestamptz,
 close_reason text,
 CHECK(num_nonnulls(demand_id,destination_bin)=1),
 UNIQUE(layer_id,reference)
);
CREATE INDEX t11_res_demand ON erp_private.t11_reservations(demand_id,id) WHERE demand_id IS NOT NULL;

CREATE TABLE erp_private.t11_movements (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN('opening','count-up','count-down','issue','transfer','unused-return','reverse',
  'goods-accepted','goods-quarantined','quarantine-accepted','supplier-return')),
 from_layer bigint REFERENCES erp_private.t11_layers(id),
 to_layer bigint REFERENCES erp_private.t11_layers(id),
 reservation_id bigint REFERENCES erp_private.t11_reservations(id),
 linked_movement bigint REFERENCES erp_private.t11_movements(id),
 quantity numeric(16,3) NOT NULL CHECK(quantity>0),
 valuation_currency text,
 verified_amount numeric(30,4),
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 CHECK(num_nonnulls(from_layer,to_layer)>0 AND (from_layer IS NULL OR to_layer IS NULL OR from_layer<>to_layer)),
 CHECK((valuation_currency IS NULL)=(verified_amount IS NULL))
);
CREATE UNIQUE INDEX t11_res_book_once ON erp_private.t11_movements(reservation_id) WHERE reservation_id IS NOT NULL;
CREATE INDEX t11_move_original ON erp_private.t11_movements(linked_movement) WHERE linked_movement IS NOT NULL;
CREATE INDEX t11_move_from ON erp_private.t11_movements(from_layer,id DESC);
CREATE INDEX t11_move_to ON erp_private.t11_movements(to_layer,id DESC);

CREATE TABLE erp_private.t11_reviews (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN('opening','count','unused-return','reverse')),
 layer_id bigint NOT NULL REFERENCES erp_private.t11_layers(id),
 original_id bigint REFERENCES erp_private.t11_movements(id),
 expected_revision bigint NOT NULL,
 quantity numeric(16,3) NOT NULL CHECK(quantity>=0),
 proposed_by bigint NOT NULL REFERENCES public.user_profiles(id),
 proposed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 outcome text CHECK(outcome IN('approved','rejected')),
 decided_by bigint REFERENCES public.user_profiles(id),
 decided_at timestamptz,
 decision_reason text,
 movement_id bigint UNIQUE REFERENCES erp_private.t11_movements(id),
 CHECK(decided_by IS NULL OR (decided_by<>proposed_by AND decided_at IS NOT NULL)),
 CHECK((kind IN('unused-return','reverse'))=(original_id IS NOT NULL))
);
CREATE INDEX t11_reviews_layer ON erp_private.t11_reviews(layer_id,id DESC);
ALTER TABLE erp_private.t11_movements ADD COLUMN review_id bigint REFERENCES erp_private.t11_reviews(id);
CREATE INDEX t11_move_review ON erp_private.t11_movements(review_id) WHERE review_id IS NOT NULL;

CREATE FUNCTION erp_private.t11_count_revision() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 UPDATE erp_private.t11_layers SET revision=revision+1 WHERE id=NEW.count_root;
 RETURN NEW;
END $$;
CREATE TRIGGER t11_count_revision AFTER UPDATE OF revision ON erp_private.t11_layers
 FOR EACH ROW WHEN(NEW.count_root IS NOT NULL) EXECUTE FUNCTION erp_private.t11_count_revision();

CREATE FUNCTION erp_private.t11_bin_access(p_cap text,p_bin bigint,p_booking boolean DEFAULT true)
RETURNS erp_private.t11_bins LANGUAGE plpgsql SET search_path='' AS $$
DECLARE bin erp_private.t11_bins;
BEGIN
 SELECT * INTO bin FROM erp_private.t11_bins WHERE id=p_bin;
 PERFORM erp_private.t11_scope(p_cap,bin.company_id,bin.branch_id);
 IF p_booking THEN PERFORM erp_private.t11_pilot(bin.company_id,bin.branch_id,'stock'); END IF;
 IF p_booking AND NOT erp_private.t06_site_allowed(bin.site_id,bin.company_id,bin.branch_id,
   (now() AT TIME ZONE 'Asia/Dubai')::date,(now() AT TIME ZONE 'Asia/Dubai')::date) THEN
  RAISE EXCEPTION 'Stock site is unavailable in its assigned branch' USING ERRCODE='42501'; END IF;
 RETURN bin;
END $$;

CREATE FUNCTION erp_private.t11_move(p_kind text,p_from bigint,p_to bigint,p_qty numeric,p_actor bigint,p_reason text,
 p_reservation bigint DEFAULT NULL,p_original bigint DEFAULT NULL,p_review bigint DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE ref erp_private.t11_values; original erp_private.t11_movements; currency text; amount numeric; already numeric; layer erp_private.t11_layers; movement bigint;
BEGIN
 IF p_qty<=0 OR (p_from IS NULL AND p_to IS NULL) THEN RAISE EXCEPTION 'Invalid bookable quantity' USING ERRCODE='22023'; END IF;
 SELECT * INTO layer FROM erp_private.t11_layers WHERE id=coalesce(p_from,p_to);
 IF p_from IS NOT NULL THEN
  UPDATE erp_private.t11_layers SET on_hand=on_hand-p_qty,revision=revision+1 WHERE id=p_from AND on_hand-reserved>=p_qty;
  IF NOT FOUND THEN RAISE EXCEPTION 'The exact stock layer no longer has enough available quantity' USING ERRCODE='PT409'; END IF;
 END IF;
 IF p_to IS NOT NULL THEN
  UPDATE erp_private.t11_layers SET on_hand=on_hand+p_qty,revision=revision+1 WHERE id=p_to;
  IF NOT FOUND THEN RAISE EXCEPTION 'The receiving stock layer changed' USING ERRCODE='PT409'; END IF;
 END IF;
 IF p_original IS NOT NULL AND p_kind IN('unused-return','reverse','supplier-return') THEN
  SELECT * INTO original FROM erp_private.t11_movements WHERE id=p_original;
  currency:=original.valuation_currency;
  SELECT coalesce(sum(m.quantity),0) INTO already FROM erp_private.t11_movements m
  WHERE m.linked_movement=p_original AND m.kind IN('unused-return','reverse','supplier-return');
  amount:=round(original.verified_amount*(already+p_qty)/original.quantity,4)
    -round(original.verified_amount*already/original.quantity,4);
 ELSE
  SELECT * INTO ref FROM erp_private.t11_values WHERE layer_id=coalesce(layer.finance_root,layer.id);
  currency:=ref.currency;
  amount:=round(ref.unit_cost*p_qty,4);
 END IF;
 INSERT INTO erp_private.t11_movements(kind,from_layer,to_layer,quantity,actor_id,reason,reservation_id,linked_movement,
  valuation_currency,verified_amount,review_id)
 VALUES(p_kind,p_from,p_to,p_qty,p_actor,p_reason,p_reservation,p_original,currency,amount,p_review)
 RETURNING id INTO movement;
 RETURN movement;
END $$;

CREATE FUNCTION erp_private.t11_matching_layer(p_layer erp_private.t11_layers,p_bin bigint,p_copy_value boolean)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE identity bigint;
BEGIN
 INSERT INTO erp_private.t11_layers(item_id,owner_id,bin_id,lot,serial_id,finance_root)
 VALUES(p_layer.item_id,p_layer.owner_id,p_bin,p_layer.lot,p_layer.serial_id,
  CASE WHEN p_copy_value THEN coalesce(p_layer.finance_root,p_layer.id) END)
 RETURNING id INTO identity;
 RETURN identity;
END $$;

CREATE FUNCTION erp_private.t11_workshop_demand_current(p_demand erp_private.t11_demands)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p_demand.job_id IS NULL OR EXISTS(SELECT 1 FROM erp_private.t10_job_cycles job
  JOIN erp_private.t10_assessments a ON a.id=job.assessment_id
  WHERE job.id=p_demand.job_id AND job.state IN('planned','in-progress')
   AND ROW(a.company_id,a.branch_id)=ROW(p_demand.company_id,p_demand.branch_id)
   AND NOT EXISTS(SELECT 1 FROM erp_private.t10_job_cycles other WHERE other.assessment_id=job.assessment_id AND other.cycle>job.cycle));
$$;

CREATE FUNCTION public.t11_stock_command(p_operation uuid,p_branch bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE branch public.branches; bin erp_private.t11_bins; dest erp_private.t11_bins; item erp_private.t11_items; unit erp_private.t11_units;
 layer erp_private.t11_layers; owner erp_private.t11_owners; demand erp_private.t11_demands; reservation erp_private.t11_reservations;
 move erp_private.t11_movements; review erp_private.t11_reviews; job erp_private.t10_job_cycles; fuel erp_private.t11_fuel_vouchers;
 actor bigint:=public.current_user_profile_id(); keys text[]; cap text; note text; decision text; stamp text;
 digest text; saved jsonb; result jsonb; qty numeric; sent numeric; left_qty numeric; counted record; portion numeric; identity bigint; move_id bigint; to_id bigint;
 layer_key bigint; item_key bigint; request_key bigint; is_part boolean; requested_currency text; lot_code text; serial_code text;
BEGIN
 keys:=CASE p_action
 WHEN 'demand' THEN ARRAY['job','fuel','source_line','item','owner','uom','quantity']
 WHEN 'opening' THEN ARRAY['item','owner','bin','uom','quantity','lot','serial']
 WHEN 'count' THEN ARRAY['layer','revision','uom','quantity']
 WHEN 'correction' THEN ARRAY['movement','mode','uom','quantity']
 WHEN 'decide' THEN ARRAY['review','outcome']
 WHEN 'reserve' THEN ARRAY['layer','demand','destination','reference','uom','quantity']
 WHEN 'send' THEN ARRAY['reservation'] WHEN 'complete' THEN ARRAY['reservation'] WHEN 'cancel' THEN ARRAY['reservation']
 WHEN 'value' THEN ARRAY['layer','currency','unit_cost','finance_ref']
 END;
 IF keys IS NULL OR NOT erp_private.t05_fields(p_data,keys||ARRAY['reason']) THEN
  RAISE EXCEPTION 'Choose a valid stock action' USING ERRCODE='22023'; END IF;
 SELECT * INTO branch FROM public.branches WHERE id=p_branch;
 cap:=CASE p_action WHEN 'demand' THEN 'supply.request' WHEN 'decide' THEN 'supply.approve' WHEN 'value' THEN 'supply.value' ELSE 'supply.stock' END;
 PERFORM erp_private.t11_scope(cap,branch.owner_company_id,branch.id);
 note:=erp_private.t10_text(p_data,'reason',1000);
 IF p_action IN('reserve','complete','send','opening','count','correction','decide') THEN
  PERFORM erp_private.t11_pilot(branch.owner_company_id,branch.id,'stock');
 END IF;

 IF p_action='decide' THEN
  SELECT * INTO review FROM erp_private.t11_reviews WHERE id=(p_data->>'review')::bigint;
  layer_key:=review.layer_id;
  SELECT * INTO move FROM erp_private.t11_movements WHERE id=review.original_id;
 ELSIF p_action='correction' THEN
  SELECT * INTO move FROM erp_private.t11_movements WHERE id=(p_data->>'movement')::bigint AND kind IN('issue','transfer');
  layer_key:=move.from_layer;
 ELSIF p_action IN('send','complete','cancel') THEN
  SELECT * INTO reservation FROM erp_private.t11_reservations WHERE id=(p_data->>'reservation')::bigint;
  layer_key:=reservation.layer_id;
 ELSE
  layer_key:=(p_data->>'layer')::bigint;
 END IF;
 IF layer_key IS NOT NULL THEN
  SELECT * INTO layer FROM erp_private.t11_layers WHERE id=layer_key;
  SELECT * INTO bin FROM erp_private.t11_bins WHERE id=layer.bin_id AND branch_id=branch.id;
  IF bin.id IS NULL THEN RAISE EXCEPTION 'Stock record unavailable in this branch' USING ERRCODE='42501'; END IF;
  item_key:=layer.item_id;
 ELSIF p_action IN('demand','opening') THEN
  item_key:=(p_data->>'item')::bigint;
  IF p_action='opening' THEN
   SELECT * INTO bin FROM erp_private.t11_bins WHERE id=(p_data->>'bin')::bigint AND branch_id=branch.id AND kind='available';
   IF bin.id IS NULL THEN RAISE EXCEPTION 'Choose an available bin in this branch' USING ERRCODE='42501'; END IF;
  END IF;
 ELSE RAISE EXCEPTION 'Stock record unavailable in this branch' USING ERRCODE='42501';
 END IF;
 SELECT * INTO item FROM erp_private.t11_items WHERE id=item_key FOR UPDATE;
 IF item.id IS NULL OR (p_action='opening' AND item.company_id<>branch.owner_company_id) THEN
  RAISE EXCEPTION 'Stock item unavailable' USING ERRCODE='42501'; END IF;

 SELECT * INTO unit FROM erp_private.t11_units WHERE id=item.unit_id;
 IF p_action IN('demand','opening','count','reserve','correction') THEN
  IF unit.id IS DISTINCT FROM (p_data->>'uom')::bigint THEN RAISE EXCEPTION 'Use the exact item unit' USING ERRCODE='22023'; END IF;
  qty:=erp_private.t11_quantity(p_data,'quantity',unit.decimal_places,p_action='count');
  IF item.trace='serial' AND qty>1 AND p_action<>'demand' THEN
   RAISE EXCEPTION 'A serialised layer holds a single unit' USING ERRCODE='22023'; END IF;
 END IF;
 IF layer_key IS NOT NULL THEN SELECT * INTO layer FROM erp_private.t11_layers WHERE id=layer_key FOR UPDATE; END IF;
 IF reservation.id IS NOT NULL THEN SELECT * INTO reservation FROM erp_private.t11_reservations WHERE id=reservation.id FOR UPDATE; END IF;
 IF review.id IS NOT NULL THEN SELECT * INTO review FROM erp_private.t11_reviews WHERE id=review.id FOR UPDATE; END IF;
 IF p_action='reserve' AND p_data->>'destination' IS NOT NULL THEN
  dest:=erp_private.t11_bin_access(cap,(p_data->>'destination')::bigint);
 ELSIF reservation.destination_bin IS NOT NULL THEN
  dest:=erp_private.t11_bin_access(cap,reservation.destination_bin,p_action<>'cancel');
 ELSIF move.kind='transfer' THEN
  dest:=erp_private.t11_bin_access(cap,(SELECT l.bin_id FROM erp_private.t11_layers l WHERE l.id=move.to_layer));
 END IF;
 IF bin.id IS NOT NULL AND p_action IN('reserve','send','complete','opening','count','correction','decide')
   AND NOT erp_private.t06_site_allowed(bin.site_id,bin.company_id,bin.branch_id,
     (now() AT TIME ZONE 'Asia/Dubai')::date,(now() AT TIME ZONE 'Asia/Dubai')::date) THEN
  RAISE EXCEPTION 'Stock site is unavailable in its assigned branch' USING ERRCODE='42501';
 END IF;
 IF dest.id IS NOT NULL AND (dest.id=bin.id OR dest.kind<>'available' OR bin.kind<>'available') THEN
  RAISE EXCEPTION 'Use different available source and destination bins' USING ERRCODE='PT409'; END IF;

 IF p_action='value' THEN
  SELECT * INTO owner FROM erp_private.t11_owners WHERE id=layer.owner_id;
  PERFORM erp_private.t11_scope('supply.value',owner.company_id,owner.branch_id);
 END IF;
 digest:=erp_private.t02_digest(jsonb_build_array(branch.id,p_action,p_data));
 saved:=erp_private.t02_replay('t11-stock',p_operation,digest);
 IF saved IS NOT NULL THEN RETURN saved; END IF;
 IF p_action='demand' THEN
  SELECT * INTO owner FROM erp_private.t11_owners WHERE id=(p_data->>'owner')::bigint;
  IF owner.id IS NULL OR (owner.branch_id<>branch.id AND NOT EXISTS(SELECT 1 FROM erp_private.t11_layers l
   JOIN erp_private.t11_bins b ON b.id=l.bin_id WHERE l.owner_id=owner.id AND l.item_id=item.id AND b.branch_id=branch.id))
  OR (item.company_id<>branch.owner_company_id AND NOT EXISTS(SELECT 1 FROM erp_private.t11_layers l JOIN erp_private.t11_bins b ON b.id=l.bin_id
     WHERE l.item_id=item.id AND l.owner_id=owner.id AND b.branch_id=branch.id)) THEN
   RAISE EXCEPTION 'Choose a stock owner and item available in this branch' USING ERRCODE='42501'; END IF;
  SELECT j.* INTO job FROM erp_private.t10_job_cycles j JOIN erp_private.t10_assessments a ON a.id=j.assessment_id
  WHERE j.id=(p_data->>'job')::bigint AND a.branch_id=branch.id AND j.state IN('planned','in-progress') FOR SHARE OF j;
  SELECT * INTO fuel FROM erp_private.t11_fuel_vouchers WHERE id=(p_data->>'fuel')::bigint AND branch_id=branch.id;
  is_part:=item.kind='part'; stamp:=erp_private.t11_key(p_data,'source_line',100);
  IF (is_part AND (job.id IS NULL OR p_data->>'fuel' IS NOT NULL)) OR
     (NOT is_part AND (fuel.accepted_at IS NULL OR fuel.source_kind NOT IN('tank','tanker') OR qty<>fuel.litres
        OR fuel.source_item IS DISTINCT FROM item.id OR fuel.source_owner IS DISTINCT FROM owner.id OR p_data->>'job' IS NOT NULL)) THEN
   RAISE EXCEPTION 'Use a current Workshop job or the exact verified internal fuel voucher' USING ERRCODE='PT409'; END IF;
  INSERT INTO erp_private.t11_demands(company_id,branch_id,item_id,owner_id,job_id,fuel_id,source_revision,source_line,quantity,actor_id,reason)
  VALUES(branch.owner_company_id,branch.id,item.id,owner.id,job.id,fuel.id,job.revision,stamp,qty,actor,note)
  ON CONFLICT DO NOTHING RETURNING id INTO identity;
  IF identity IS NULL THEN RAISE EXCEPTION 'This demand source is already recorded' USING ERRCODE='PT409'; END IF;
 ELSIF p_action='opening' THEN
  SELECT * INTO owner FROM erp_private.t11_owners WHERE id=(p_data->>'owner')::bigint AND branch_id=branch.id;
  IF owner.id IS NULL THEN RAISE EXCEPTION 'Choose a local legal stock owner group' USING ERRCODE='42501'; END IF;
  lot_code:=nullif(upper(btrim(p_data->>'lot')),''); serial_code:=nullif(upper(btrim(p_data->>'serial')),'');
  SELECT l.* INTO layer FROM erp_private.t11_layers l LEFT JOIN erp_private.t11_serials s ON s.id=l.serial_id
  WHERE l.is_opening AND l.item_id=item.id AND l.owner_id=owner.id AND l.bin_id=bin.id
   AND l.lot IS NOT DISTINCT FROM lot_code AND s.serial IS NOT DISTINCT FROM serial_code FOR UPDATE OF l;
  IF layer.id IS NULL THEN
   layer_key:=erp_private.t11_new_layer(item.id,owner.id,bin.id,lot_code,serial_code,true);
  ELSIF NOT EXISTS(SELECT 1 FROM erp_private.t11_reviews r WHERE r.layer_id=layer.id AND r.kind='opening' AND r.outcome IS DISTINCT FROM 'rejected') THEN
   layer_key:=layer.id;
  ELSE RAISE EXCEPTION 'This opening identity is already recorded or awaiting review' USING ERRCODE='PT409'; END IF;
  INSERT INTO erp_private.t11_reviews(kind,layer_id,expected_revision,quantity,proposed_by,reason)
  VALUES('opening',layer_key,coalesce(layer.revision,1),qty,actor,note) RETURNING id INTO identity;
 ELSIF p_action IN('count','correction') THEN
  IF p_action='count' THEN
   IF layer.revision IS DISTINCT FROM (p_data->>'revision')::bigint OR bin.kind<>'available' OR layer.count_root IS NOT NULL THEN
    RAISE EXCEPTION 'Recount the current available layer revision' USING ERRCODE='PT409'; END IF;
   decision:='count';
  ELSE
   decision:=p_data->>'mode';
   IF coalesce(decision,'') NOT IN('unused-return','reverse') OR (decision='unused-return' AND move.kind<>'issue') THEN
    RAISE EXCEPTION 'Choose an existing issue or completed transfer and correction kind' USING ERRCODE='PT409'; END IF;
  END IF;
  INSERT INTO erp_private.t11_reviews(kind,layer_id,original_id,expected_revision,quantity,proposed_by,reason)
  VALUES(decision,layer.id,move.id,layer.revision,qty,actor,note) RETURNING id INTO identity;
 ELSIF p_action='decide' THEN
  decision:=p_data->>'outcome'; qty:=review.quantity;
  IF review.proposed_by=actor OR review.decided_at IS NOT NULL OR coalesce(decision,'') NOT IN('approved','rejected') THEN
   RAISE EXCEPTION 'An independent current stock decision is required' USING ERRCODE='PT409'; END IF;
  IF decision='approved' THEN
   IF review.kind IN('opening','count') AND layer.revision<>review.expected_revision THEN
    RAISE EXCEPTION 'Stock changed since the count was prepared' USING ERRCODE='PT409';
   ELSIF review.kind='opening' THEN
    move_id:=erp_private.t11_move('opening',NULL,layer.id,qty,actor,note);
   ELSIF review.kind='count' THEN
    SELECT sum(l.on_hand) INTO sent FROM erp_private.t11_layers l WHERE l.id=layer.id OR l.count_root=layer.id;
    IF qty<sent THEN
     left_qty:=sent-qty;
     FOR counted IN SELECT l.id,l.on_hand-l.reserved AS available FROM erp_private.t11_layers l
       WHERE (l.id=layer.id OR l.count_root=layer.id) AND l.on_hand>l.reserved ORDER BY (l.id=layer.id),l.id
     LOOP
      portion:=least(counted.available,left_qty);
      move_id:=erp_private.t11_move('count-down',counted.id,NULL,portion,actor,note,NULL,NULL,review.id);
      left_qty:=left_qty-portion;
      EXIT WHEN left_qty=0;
     END LOOP;
     IF left_qty>0 THEN RAISE EXCEPTION 'The count cannot remove reserved quantities' USING ERRCODE='PT409'; END IF;
    ELSIF qty>sent THEN
     IF layer.serial_id IS NOT NULL THEN
      RAISE EXCEPTION 'Restore an issued serial through its linked correction' USING ERRCODE='PT409'; END IF;
     to_id:=erp_private.t11_matching_layer(layer,bin.id,false);
     UPDATE erp_private.t11_layers SET count_root=layer.id WHERE id=to_id;
     move_id:=erp_private.t11_move('count-up',NULL,to_id,qty-sent,actor,note,NULL,NULL,review.id);
    ELSE
     UPDATE erp_private.t11_layers SET revision=revision+1 WHERE id=layer.id;
    END IF;
   ELSE
    SELECT coalesce(sum(m.quantity),0) INTO sent FROM erp_private.t11_movements m
    WHERE m.linked_movement=move.id AND m.kind IN('unused-return','reverse');
    IF qty>move.quantity-sent THEN RAISE EXCEPTION 'Correction exceeds the unreturned original quantity' USING ERRCODE='PT409'; END IF;
    move_id:=erp_private.t11_move(review.kind,move.to_layer,layer.id,qty,actor,note,NULL,move.id);
   END IF;
  END IF;
  UPDATE erp_private.t11_reviews SET outcome=decision,decided_by=actor,decided_at=clock_timestamp(),
   decision_reason=note,movement_id=move_id WHERE id=review.id;
  identity:=review.id;
 ELSIF p_action='reserve' THEN
  request_key:=(p_data->>'demand')::bigint;
  IF bin.kind<>'available' OR num_nonnulls(request_key,dest.id)<>1 OR layer.on_hand-layer.reserved<qty THEN
   RAISE EXCEPTION 'The selected available stock cannot satisfy this reservation' USING ERRCODE='PT409'; END IF;
  IF request_key IS NOT NULL THEN
   SELECT * INTO demand FROM erp_private.t11_demands d WHERE d.id=request_key AND d.branch_id=branch.id
    AND d.item_id=layer.item_id AND d.owner_id=layer.owner_id FOR UPDATE;
   SELECT coalesce(sum(r.quantity),0)-coalesce((SELECT sum(m.quantity) FROM erp_private.t11_movements m
     JOIN erp_private.t11_movements original ON original.id=m.linked_movement JOIN erp_private.t11_reservations r0 ON r0.id=original.reservation_id
     WHERE r0.demand_id=request_key AND m.kind IN('unused-return','reverse')),0)
   INTO sent FROM erp_private.t11_reservations r WHERE r.demand_id=request_key AND r.state<>'cancelled';
   IF demand.id IS NULL OR NOT erp_private.t11_workshop_demand_current(demand) OR qty+sent>demand.quantity
     OR (demand.fuel_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp_private.t11_fuel_vouchers f
        WHERE f.id=demand.fuel_id AND f.source_bin=bin.id AND f.source_item=item.id AND f.source_owner=layer.owner_id)) THEN
    RAISE EXCEPTION 'Demand scope, source or remaining quantity changed' USING ERRCODE='PT409'; END IF;
  END IF;
  stamp:=erp_private.t11_key(p_data,'reference',100);
  INSERT INTO erp_private.t11_reservations(layer_id,demand_id,destination_bin,reference,quantity,state,opened_by)
  VALUES(layer.id,demand.id,dest.id,stamp,qty,'reserved',actor)
  ON CONFLICT DO NOTHING RETURNING id INTO identity;
  IF identity IS NULL THEN RAISE EXCEPTION 'This reservation reference is retained' USING ERRCODE='PT409'; END IF;
  UPDATE erp_private.t11_layers SET reserved=reserved+qty,revision=revision+1 WHERE id=layer.id;
 ELSIF p_action IN('send','complete','cancel') THEN
  IF (p_action='send' AND (reservation.state<>'reserved' OR dest.id IS NULL))
   OR (p_action='complete' AND ((dest.id IS NOT NULL AND (reservation.state<>'in-transit' OR reservation.sent_by=actor))
      OR (dest.id IS NULL AND reservation.state<>'reserved')))
   OR (p_action='cancel' AND reservation.state NOT IN('reserved','in-transit')) THEN
   RAISE EXCEPTION 'Choose an active reservation and an independent receiver for an in-transit transfer' USING ERRCODE='PT409'; END IF;
  IF p_action='send' THEN
   UPDATE erp_private.t11_reservations SET state='in-transit',sent_by=actor,sent_at=clock_timestamp() WHERE id=reservation.id;
  ELSE
   qty:=reservation.quantity;
   IF p_action='complete' AND reservation.demand_id IS NOT NULL THEN
    SELECT * INTO demand FROM erp_private.t11_demands WHERE id=reservation.demand_id FOR UPDATE;
    IF NOT erp_private.t11_workshop_demand_current(demand) THEN
     RAISE EXCEPTION 'Workshop job is no longer open for issue' USING ERRCODE='PT409'; END IF;
    IF demand.job_id IS NOT NULL THEN
     PERFORM 1 FROM erp_private.t10_job_cycles WHERE id=demand.job_id FOR SHARE;
     IF NOT erp_private.t11_workshop_demand_current(demand) THEN RAISE EXCEPTION 'Workshop job changed before issue' USING ERRCODE='PT409'; END IF;
    END IF;
   END IF;
   UPDATE erp_private.t11_layers SET reserved=reserved-qty,revision=revision+1 WHERE id=layer.id;
   IF p_action='complete' THEN
    IF dest.id IS NOT NULL THEN to_id:=erp_private.t11_matching_layer(layer,dest.id,true); END IF;
    move_id:=erp_private.t11_move(CASE WHEN dest.id IS NULL THEN 'issue' ELSE 'transfer' END,
      layer.id,to_id,qty,actor,note,reservation.id);
   END IF;
   UPDATE erp_private.t11_reservations SET state=CASE WHEN p_action='complete' THEN 'completed' ELSE 'cancelled' END,
    closed_by=actor,closed_at=clock_timestamp(),close_reason=note WHERE id=reservation.id;
  END IF;
  identity:=reservation.id;
 ELSE
  IF layer.finance_root IS NOT NULL OR NOT EXISTS(SELECT 1 FROM erp_private.t11_movements m WHERE m.to_layer=layer.id) THEN
   RAISE EXCEPTION 'Verify valuation at its received origin after quantity is booked' USING ERRCODE='PT409'; END IF;
  requested_currency:=erp_private.t11_key(p_data,'currency',3);
  IF NOT EXISTS(SELECT 1 FROM public.currencies c WHERE c.currency_code=requested_currency AND c.is_active) THEN
   RAISE EXCEPTION 'Use an active currency' USING ERRCODE='22023'; END IF;
  INSERT INTO erp_private.t11_values(layer_id,unit_cost,currency,finance_ref,verified_by)
  VALUES(layer.id,erp_private.t11_quantity(p_data,'unit_cost',4,true),requested_currency,erp_private.t11_key(p_data,'finance_ref',150),actor)
  ON CONFLICT DO NOTHING RETURNING layer_id INTO identity;
  IF identity IS NULL THEN RAISE EXCEPTION 'This origin already has a retained Finance valuation' USING ERRCODE='PT409'; END IF;
 END IF;
 result:=jsonb_build_object('id',identity,'movement',move_id,'layer',coalesce(layer.id,layer_key));
 IF move_id IS NOT NULL THEN
  SELECT result||jsonb_build_object('quantity',m.quantity,'owner',layer.owner_id,'revision',m.id,'recorded_at',m.occurred_at,
   'valuation',CASE WHEN m.verified_amount IS NULL THEN 'pending-finance' ELSE 'verified' END)
  INTO result FROM erp_private.t11_movements m WHERE m.id=move_id;
 END IF;
 RETURN erp_private.t02_save_receipt('t11-stock',p_operation,digest,result);
END $$;

DO $$
DECLARE table_name text;
BEGIN
 FOR table_name IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='erp_private' AND c.relkind='r' AND c.relname IN('t11_demands','t11_reservations','t11_movements','t11_reviews') LOOP
  EXECUTE format('ALTER TABLE erp_private.%I ENABLE ROW LEVEL SECURITY',table_name);
  EXECUTE format('REVOKE ALL ON erp_private.%I FROM PUBLIC,anon,authenticated,service_role',table_name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION erp_private.t11_bin_access(text,bigint,boolean),
 erp_private.t11_move(text,bigint,bigint,numeric,bigint,text,bigint,bigint,bigint),erp_private.t11_count_revision(),erp_private.t11_matching_layer(erp_private.t11_layers,bigint,boolean),
 erp_private.t11_workshop_demand_current(erp_private.t11_demands),public.t11_stock_command(uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t11_stock_command(uuid,bigint,text,jsonb) TO authenticated;
COMMIT;
