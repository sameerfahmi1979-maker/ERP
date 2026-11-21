BEGIN;

CREATE OR REPLACE FUNCTION erp_private.t07_text(p_data jsonb,p_key text,p_limit integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE value text:=nullif(btrim(p_data->>p_key),'');
BEGIN
 IF value IS NULL OR length(value)>p_limit OR jsonb_typeof(p_data->p_key) IS DISTINCT FROM 'string'
 THEN RAISE EXCEPTION 'Enter a valid %',p_key USING ERRCODE='22023'; END IF;
 RETURN value;
END;
$$;

CREATE OR REPLACE FUNCTION erp_private.t07_party_allowed(p_party bigint,p_company bigint,p_branch bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p_party IS NULL OR (
  (erp_private.permission_in_scope('master_data.parties.view',p_company,p_branch)
   OR erp_private.permission_in_scope('master_data.party_master.view',p_company,p_branch))
  AND EXISTS(SELECT 1 FROM public.parties p WHERE p.id=p_party AND p.is_active)
 );
$$;

CREATE OR REPLACE FUNCTION erp_private.t07_record_evidence(p_order bigint,p_assignment bigint,p_purpose text,p_packet jsonb)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a erp_private.fleet_operation_assignments; o erp_private.fleet_operation_orders;
 d_id bigint; v_id bigint; f_id bigint; evidence_id bigint; reference text; codes text[];
 sheet erp_private.fleet_rental_sheet_references;
BEGIN
 IF NOT erp_private.t05_fields(p_packet,ARRAY['document','version','file','reference'])
 THEN RAISE EXCEPTION 'Select the exact signed original and paper reference' USING ERRCODE='22023'; END IF;
 reference:=erp_private.t05_identifier(erp_private.t07_text(p_packet,'reference',100));
 IF reference IS NULL OR reference!~'^[A-Z0-9./_]{1,100}$' THEN RAISE EXCEPTION 'Invalid paper reference' USING ERRCODE='22023'; END IF;
 d_id:=(p_packet->>'document')::bigint; v_id:=(p_packet->>'version')::bigint; f_id:=(p_packet->>'file')::bigint;
 SELECT * INTO a FROM erp_private.fleet_operation_assignments fa WHERE fa.id=p_assignment AND fa.order_id=p_order;
 SELECT * INTO o FROM erp_private.fleet_operation_orders WHERE id=p_order;
 codes:=CASE p_purpose
  WHEN 'trip-order' THEN ARRAY['FLEET_TRIP_ORDER']
  WHEN 'pre-trip' THEN ARRAY['FLEET_PRE_TRIP_INSPECTION']
  WHEN 'pod' THEN ARRAY['FLEET_SIGNED_POD']
  WHEN 'weigh' THEN ARRAY['FLEET_WEIGH_TICKET']
  WHEN 'rental-handover' THEN ARRAY['FLEET_CUSTODY_ACK']
  WHEN 'rental-return' THEN ARRAY['FLEET_CUSTODY_ACK']
  WHEN 'rental-sheet' THEN ARRAY['FLEET_SIGNED_RENTAL_SHEET']
  WHEN 'rental-commercial' THEN ARRAY['FLEET_RENTAL_NOTICE']
  WHEN 'agreement' THEN ARRAY['FLEET_RENTAL_AGREEMENT']
  ELSE ARRAY[]::text[] END;
 IF a.id IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.dms_documents d
   JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.deleted_at IS NULL AND t.type_code=ANY(codes)
   JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.id=v_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
   JOIN public.dms_document_files f ON f.id=f_id AND f.document_id=d.id AND f.version_id=v.id AND f.file_role='original'
    AND f.deleted_at IS NULL AND f.integrity_status='verified' AND f.sha256_hash~'^[0-9a-f]{64}$' AND f.file_size_bytes>0
   JOIN erp_private.fleet_document_parents binding ON binding.document_id=d.id AND binding.asset_id=a.asset_id
   JOIN public.dms_document_links l ON l.document_id=d.id AND l.entity_type='fleet_asset' AND l.entity_id=a.asset_id AND l.deleted_at IS NULL
   WHERE d.id=d_id AND d.status='active' AND d.deleted_at IS NULL AND NOT d.is_archived
      AND erp_private.document_permission(d.id,'dms.documents.preview')
   FOR SHARE OF d,v,f,l
 ) THEN RAISE EXCEPTION 'Current reviewed DMS original for this assignment is required' USING ERRCODE='PT409'; END IF;
 IF p_purpose='rental-sheet' THEN
   INSERT INTO erp_private.fleet_rental_sheet_references(company_id,paper_reference,order_id,document_id)
     VALUES(o.company_id,reference,o.id,d_id) ON CONFLICT(company_id,paper_reference) DO NOTHING;
   SELECT * INTO sheet FROM erp_private.fleet_rental_sheet_references refs
     WHERE refs.company_id=o.company_id AND refs.paper_reference=reference FOR UPDATE;
   IF ROW(sheet.order_id,sheet.document_id) IS DISTINCT FROM ROW(o.id,d_id)
   THEN RAISE EXCEPTION 'This rental sheet number belongs to a different verified document or order' USING ERRCODE='23505'; END IF;
   SELECT ev.id INTO evidence_id FROM erp_private.fleet_operation_evidence ev WHERE ev.order_id=o.id
     AND ev.purpose=p_purpose AND ev.document_id=d_id AND ev.version_id=v_id AND ev.file_id=f_id AND ev.paper_reference=reference;
   IF evidence_id IS NOT NULL THEN RETURN evidence_id; END IF;
 END IF;
 INSERT INTO erp_private.fleet_operation_evidence(order_id,assignment_id,purpose,company_id,paper_reference,document_id,version_id,file_id,recorded_by)
 VALUES(o.id,a.id,p_purpose,o.company_id,reference,d_id,v_id,f_id,public.current_user_profile_id()) RETURNING id INTO evidence_id;
 RETURN evidence_id;
END;
$$;

CREATE OR REPLACE FUNCTION erp_private.t07_evidence_is_current(p_evidence bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(
  SELECT 1 FROM erp_private.fleet_operation_evidence e
  JOIN public.dms_documents d ON d.id=e.document_id AND d.current_version_id=e.version_id AND d.status='active' AND NOT d.is_archived AND d.deleted_at IS NULL
  JOIN public.dms_document_versions v ON v.id=e.version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
  JOIN public.dms_document_files f ON f.id=e.file_id AND f.document_id=d.id AND f.version_id=v.id AND f.file_role='original'
    AND f.deleted_at IS NULL AND f.integrity_status='verified'
  JOIN erp_private.fleet_operation_assignments a ON a.id=e.assignment_id
  WHERE e.id=p_evidence
   AND EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=d.id AND l.entity_type='fleet_asset' AND l.entity_id=a.asset_id AND l.deleted_at IS NULL)
 );
$$;

CREATE OR REPLACE FUNCTION erp_private.t07_current_evidence(p_assignment bigint,p_purpose text)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_private.t07_evidence_is_current((SELECT id FROM erp_private.fleet_operation_evidence checked
  WHERE checked.assignment_id=p_assignment AND checked.purpose=p_purpose ORDER BY checked.id DESC LIMIT 1));
$$;

CREATE OR REPLACE FUNCTION erp_private.t07_change_commitment(p_nonce uuid,p_step text,p_asset bigint,p_commitment bigint,p_kind text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c erp_private.fleet_commitments; result jsonb;
BEGIN
 IF p_commitment IS NOT NULL THEN
  SELECT * INTO c FROM erp_private.fleet_commitments item WHERE item.id=p_commitment AND item.asset_id=p_asset;
  IF c.id IS NULL THEN RAISE EXCEPTION 'Current Fleet commitment unavailable' USING ERRCODE='PT409'; END IF;
  INSERT INTO erp_private.fleet_ops_transition(tx,commitment_id) VALUES(txid_current(),c.id);
  p_data:=p_data||jsonb_build_object('commitment',c.id,'revision',c.revision);
 END IF;
 result:=public.t06_fleet_command(md5(p_nonce::text||':t07:'||p_step)::uuid,p_asset,p_kind,p_data);
 IF c.id IS NOT NULL THEN DELETE FROM erp_private.fleet_ops_transition grant_row
   WHERE grant_row.tx=txid_current() AND grant_row.commitment_id=c.id; END IF;
 RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION erp_private.t07_return_assignment(p_nonce uuid,p_entry bigint,p_at timestamptz,p_reason text,p_snapshot jsonb)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a erp_private.fleet_operation_assignments;
BEGIN
 SELECT * INTO a FROM erp_private.fleet_operation_assignments WHERE id=p_entry AND state='active';
 IF a.id IS NULL OR EXISTS(SELECT 1 FROM erp_private.fleet_trip_leg_actuals actual WHERE actual.assignment_id=a.id AND actual.arrived_at>p_at)
   OR EXISTS(SELECT 1 FROM erp_private.fleet_rental_usage usage WHERE usage.assignment_id=a.id AND upper(usage.work_period)>p_at)
 THEN RAISE EXCEPTION 'Return must follow the recorded work' USING ERRCODE='PT409'; END IF;
 PERFORM erp_private.t07_change_commitment(p_nonce,'return',a.asset_id,a.actual_commitment_id,'return',
  jsonb_build_object('at',p_at,'reason',p_reason,'snapshot',p_snapshot));
 UPDATE erp_private.fleet_operation_assignments item SET state='closed' WHERE item.id=a.id;
END;
$$;

CREATE OR REPLACE FUNCTION erp_private.t07_trip_action(p_nonce uuid,p_order bigint,p_action text,p_data jsonb,p_reason text)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE o erp_private.fleet_operation_orders; a erp_private.fleet_operation_assignments; leg erp_private.fleet_trip_legs;
 actual erp_private.fleet_trip_leg_actuals; paper erp_private.fleet_trip_paper_orders; c erp_private.fleet_commitments;
 origin_id bigint; destination_id bigint; seq integer; state_code text; load_code text; cargo_name text; result bigint;
 depart timestamptz; arrive timestamptz; day_from date; day_to date; previous_arrival timestamptz;
 pod_id bigint; weigh_id bigint; gross numeric; tare numeric; gap text; actor bigint:=public.current_user_profile_id();
BEGIN
 SELECT * INTO o FROM erp_private.fleet_operation_orders WHERE id=p_order AND kind='trip';
 IF o.id IS NULL THEN RAISE EXCEPTION 'Only trips use route and paper commands' USING ERRCODE='22023'; END IF;
 IF p_action='plan-leg' THEN
   IF o.status<>'requested' THEN RAISE EXCEPTION 'Plan route legs before authorization' USING ERRCODE='PT409'; END IF;
   origin_id:=(p_data->>'origin')::bigint; destination_id:=(p_data->>'destination')::bigint; seq:=(p_data->>'sequence')::integer;
   load_code:=p_data->>'load'; cargo_name:=nullif(btrim(p_data->>'cargo'),'');
   IF p_data?'leg' THEN
     SELECT * INTO leg FROM erp_private.fleet_trip_legs l WHERE l.id=(p_data->>'leg')::bigint AND l.order_id=o.id;
     IF leg.id IS NULL THEN RAISE EXCEPTION 'Draft route leg unavailable' USING ERRCODE='42501'; END IF;
     seq:=leg.sequence;
   END IF;
   day_from:=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date;
   IF NOT erp_private.t06_site_allowed(origin_id,o.company_id,o.branch_id,day_from,day_from)
     OR NOT erp_private.t06_site_allowed(destination_id,o.company_id,o.branch_id,day_from,day_from)
     OR NOT coalesce(load_code IN ('loaded','empty'),false) OR (load_code='loaded') IS DISTINCT FROM (cargo_name IS NOT NULL)
     OR length(cargo_name)>240
     OR (leg.id IS NULL AND seq IS DISTINCT FROM 1+(SELECT count(*)::integer FROM erp_private.fleet_trip_legs l WHERE l.order_id=o.id))
     OR (seq>1 AND NOT EXISTS(SELECT 1 FROM erp_private.fleet_trip_legs previous
       WHERE previous.order_id=o.id AND previous.sequence=seq-1 AND previous.planned_destination=origin_id))
     OR EXISTS(SELECT 1 FROM erp_private.fleet_trip_legs next_leg WHERE next_leg.order_id=o.id
       AND next_leg.sequence=seq+1 AND next_leg.planned_origin IS DISTINCT FROM destination_id)
   THEN RAISE EXCEPTION 'Enter a contiguous route with an authorized site and load' USING ERRCODE='22023'; END IF;
   IF leg.id IS NOT NULL THEN
     UPDATE erp_private.fleet_trip_legs planned SET planned_origin=origin_id,planned_destination=destination_id,
       planned_load=load_code,planned_cargo=cargo_name,
       pickup_contact=coalesce(nullif(left(btrim(p_data->>'pickup_contact'),100),''),(SELECT site_contact_name FROM public.work_sites WHERE id=origin_id)),
       pickup_phone=coalesce(nullif(left(btrim(p_data->>'pickup_phone'),40),''),(SELECT site_contact_phone FROM public.work_sites WHERE id=origin_id)),
       delivery_contact=coalesce(nullif(left(btrim(p_data->>'delivery_contact'),100),''),(SELECT site_contact_name FROM public.work_sites WHERE id=destination_id)),
       delivery_phone=coalesce(nullif(left(btrim(p_data->>'delivery_phone'),40),''),(SELECT site_contact_phone FROM public.work_sites WHERE id=destination_id)),
       instructions=nullif(left(btrim(p_data->>'instructions'),500),'')
     WHERE planned.id=leg.id RETURNING planned.id INTO result;
     RETURN result;
   END IF;
   INSERT INTO erp_private.fleet_trip_legs(order_id,sequence,planned_origin,planned_destination,planned_load,planned_cargo)
   VALUES(o.id,seq,origin_id,destination_id,load_code,cargo_name) RETURNING id INTO result;
 ELSIF p_action='issue-paper' THEN
   IF o.status NOT IN ('authorized','active','review') OR NOT EXISTS(
      SELECT 1 FROM erp_private.fleet_operation_assignments item WHERE item.order_id=o.id AND item.state='planned')
   THEN RAISE EXCEPTION 'An authorized trip with a planned assignment is required' USING ERRCODE='PT409'; END IF;
   INSERT INTO erp_private.fleet_trip_paper_orders(order_id,issue_no,issue_revision,issued_by,snapshot)
   SELECT o.id,o.order_no||'-P'||(o.revision+1),o.revision+1,actor,jsonb_build_object(
    'order_no',o.order_no,'subject',o.subject,'reference',o.request_reference,'authorization',o.authorization_reference,
    'employer',(SELECT legal_name_en FROM public.owner_companies WHERE id=o.company_id),
    'branch',(SELECT branch_name_en FROM public.branches WHERE id=o.branch_id),
    'customer',(SELECT display_name FROM public.parties WHERE id=o.customer_id),
    'legs',(SELECT jsonb_agg(jsonb_build_object('sequence',l.sequence,'origin',s.site_name,'destination',d.site_name,
       'load',l.planned_load,'cargo',l.planned_cargo) ORDER BY l.sequence)
       FROM erp_private.fleet_trip_legs l JOIN public.work_sites s ON s.id=l.planned_origin
         JOIN public.work_sites d ON d.id=l.planned_destination WHERE l.order_id=o.id),
    'assignments',(SELECT jsonb_agg(jsonb_build_object('id',a1.id,'asset_no',asset.asset_no,'asset_name',asset.name,
      'worker',e.full_name_en,'from',lower(a1.planned_period),'until',upper(a1.planned_period),'site',ws.site_name)
      ORDER BY a1.slot,a1.id) FROM erp_private.fleet_operation_assignments a1
      JOIN erp_private.fleet_assets asset ON asset.id=a1.asset_id JOIN public.employees e ON e.id=a1.worker_id
      JOIN public.work_sites ws ON ws.id=a1.site_id WHERE a1.order_id=o.id AND a1.state='planned'))
   RETURNING id INTO result;
 ELSIF p_action='complete-leg' THEN
   SELECT * INTO a FROM erp_private.fleet_operation_assignments item WHERE item.id=(p_data->>'assignment')::bigint AND item.order_id=o.id;
   SELECT * INTO c FROM erp_private.fleet_commitments WHERE id=a.actual_commitment_id AND kind='dispatch';
   SELECT * INTO leg FROM erp_private.fleet_trip_legs l WHERE l.id=(p_data->>'leg')::bigint AND l.order_id=o.id;
   origin_id:=(p_data->>'origin')::bigint; destination_id:=(p_data->>'destination')::bigint;
   depart:=(p_data->>'from')::timestamptz; arrive:=(p_data->>'until')::timestamptz; load_code:=p_data->>'load';
   cargo_name:=nullif(btrim(p_data->>'cargo'),''); gap:=nullif(btrim(p_data->>'discrepancy'),'');
   state_code:=p_data->>'delivery';
   day_from:=(depart AT TIME ZONE 'Asia/Dubai')::date; day_to:=(arrive AT TIME ZONE 'Asia/Dubai')::date;
   SELECT f.arrived_at INTO previous_arrival FROM erp_private.fleet_trip_leg_actuals f JOIN erp_private.fleet_trip_legs l ON l.id=f.leg_id
     WHERE l.order_id=o.id AND l.sequence=leg.sequence-1;
   IF o.status NOT IN('active','review') OR c.id IS NULL OR leg.id IS NULL
    OR depart IS NULL OR arrive IS NULL OR NOT isfinite(depart) OR NOT isfinite(arrive) OR depart>=arrive OR arrive>statement_timestamp()
    OR NOT (c.committed_during @> tstzrange(depart,arrive,'[)'))
    OR (leg.sequence>1 AND (previous_arrival IS NULL OR previous_arrival>depart))
    OR NOT erp_private.t06_site_allowed(origin_id,o.company_id,o.branch_id,day_from,day_to)
    OR NOT erp_private.t06_site_allowed(destination_id,o.company_id,o.branch_id,day_from,day_to)
    OR NOT coalesce(load_code IN('empty','loaded'),false) OR (load_code='loaded') IS DISTINCT FROM (cargo_name IS NOT NULL)
    OR length(cargo_name)>240 OR length(gap)>500
    OR ((ROW(origin_id,destination_id,load_code) IS DISTINCT FROM ROW(leg.planned_origin,leg.planned_destination,leg.planned_load)) AND gap IS NULL)
    OR (load_code='empty' AND state_code IS DISTINCT FROM 'not-required')
    OR (load_code='loaded' AND NOT coalesce(state_code IN('accepted','partial','missing','disputed'),false))
    OR (state_code IN('missing','disputed','partial') AND gap IS NULL)
   THEN RAISE EXCEPTION 'The leg needs a verified assignment, chronological times, route facts and an explicit evidence state' USING ERRCODE='PT409'; END IF;
   IF state_code IN('accepted','partial') OR p_data?'pod' THEN
    IF load_code='empty' THEN RAISE EXCEPTION 'An empty leg cannot claim a loaded delivery' USING ERRCODE='22023'; END IF;
    pod_id:=erp_private.t07_record_evidence(o.id,a.id,'pod',p_data->'pod');
   END IF;
   IF p_data?'weigh' THEN
    gross:=(p_data->>'gross_kg')::numeric; tare:=(p_data->>'tare_kg')::numeric;
    IF load_code<>'loaded' OR gross IS NULL OR tare IS NULL OR gross<=tare OR tare<=0
      OR gross<>round(gross,3) OR tare<>round(tare,3)
    THEN RAISE EXCEPTION 'Use positive weighed cargo and reconcile gross and tare in kilograms' USING ERRCODE='22023'; END IF;
    weigh_id:=erp_private.t07_record_evidence(o.id,a.id,'weigh',p_data->'weigh');
   ELSIF p_data?'gross_kg' OR p_data?'tare_kg' THEN
    RAISE EXCEPTION 'Weighing requires its actual inspected ticket' USING ERRCODE='22023';
   END IF;
   INSERT INTO erp_private.fleet_trip_leg_actuals(leg_id,assignment_id,origin,destination,departed_at,arrived_at,load,cargo,
    gross_kg,tare_kg,weigh_evidence_id,discrepancies)
   VALUES(leg.id,a.id,origin_id,destination_id,depart,arrive,load_code,cargo_name,gross,tare,weigh_id,gap) RETURNING id INTO result;
   INSERT INTO erp_private.fleet_trip_delivery_facts(actual_id,state,evidence_id,reason,recorded_by)
   VALUES(result,state_code,pod_id,gap,actor);
   IF state_code IN('missing','disputed','partial') THEN UPDATE erp_private.fleet_operation_orders SET status='review' WHERE id=o.id; END IF;
 ELSE
   SELECT f.* INTO actual FROM erp_private.fleet_trip_leg_actuals f JOIN erp_private.fleet_trip_legs l ON l.id=f.leg_id
     WHERE l.order_id=o.id AND l.id=(p_data->>'leg')::bigint;
   IF o.status NOT IN('active','review') OR actual.id IS NULL OR actual.load<>'loaded'
     OR EXISTS(SELECT 1 FROM erp_private.fleet_trip_delivery_facts fact WHERE fact.id=(
      SELECT max(prior.id) FROM erp_private.fleet_trip_delivery_facts prior WHERE prior.actual_id=actual.id)
       AND fact.state='accepted' AND erp_private.t07_evidence_is_current(fact.evidence_id))
   THEN RAISE EXCEPTION 'Review an unresolved loaded delivery' USING ERRCODE='PT409'; END IF;
   pod_id:=erp_private.t07_record_evidence(o.id,actual.assignment_id,'pod',p_data->'pod');
   INSERT INTO erp_private.fleet_trip_delivery_facts(actual_id,state,evidence_id,reason,recorded_by)
   VALUES(actual.id,'accepted',pod_id,p_reason,actor) RETURNING id INTO result;
 END IF;
 RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION erp_private.t07_assign(p_nonce uuid,p_order bigint,p_action text,p_data jsonb,p_reason text)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE o erp_private.fleet_operation_orders; a erp_private.fleet_operation_assignments; resource erp_private.fleet_assets;
 ep erp_private.t03_employment_periods; c erp_private.fleet_commitments; scope record;
 asset_id bigint:=(p_data->>'asset')::bigint; worker_id bigint:=(p_data->>'employee')::bigint;
 selected_slot integer:=(p_data->>'slot')::integer; starts timestamptz:=(p_data->>'from')::timestamptz; ends timestamptz:=(p_data->>'until')::timestamptz;
 new_id bigint; result jsonb; return_proof bigint; return_snapshot jsonb;
BEGIN
 SELECT * INTO o FROM erp_private.fleet_operation_orders WHERE id=p_order;
 IF o.status NOT IN('authorized','active','review') THEN RAISE EXCEPTION 'Authorize the request before making a hard booking' USING ERRCODE='PT409'; END IF;
 IF p_action='substitute' THEN
  SELECT * INTO a FROM erp_private.fleet_operation_assignments item
    WHERE item.id=(p_data->>'assignment')::bigint AND item.order_id=o.id AND item.state IN('planned','active');
  IF a.id IS NULL OR ROW(a.asset_id,a.worker_id) IS NOT DISTINCT FROM ROW(asset_id,worker_id)
  THEN RAISE EXCEPTION 'Select a current assignment and a different asset or worker' USING ERRCODE='PT409'; END IF;
  selected_slot:=a.slot;
 END IF;
 PERFORM 1 FROM erp_private.fleet_assets fa WHERE fa.id=ANY(ARRAY[asset_id,a.asset_id]) ORDER BY fa.id FOR UPDATE;
 SELECT * INTO resource FROM erp_private.fleet_assets WHERE id=asset_id;
 SELECT * INTO scope FROM erp_private.t06_operation_scope(asset_id);
 IF resource.id IS NULL OR ROW(scope.company_id,scope.branch_id) IS DISTINCT FROM ROW(o.company_id,o.branch_id)
   OR NOT erp_private.t06_custody_visible(resource.id)
 THEN RAISE EXCEPTION 'Asset unavailable in the operating branch' USING ERRCODE='42501'; END IF;
 IF starts IS NULL OR ends IS NULL OR NOT isfinite(starts) OR NOT isfinite(ends) OR starts>=ends
   OR coalesce(selected_slot,0) NOT BETWEEN 1 AND 50
 THEN RAISE EXCEPTION 'Enter a valid assignment window and resource slot' USING ERRCODE='22023'; END IF;
 SELECT * INTO ep FROM erp_private.t06_work_period(worker_id,starts,ends);
 IF ep.id IS NULL THEN RAISE EXCEPTION 'Worker needs a verified employment period' USING ERRCODE='42501'; END IF;
 IF a.id IS NOT NULL THEN
   IF a.state='active' THEN
    return_snapshot:=p_data->'snapshot';
    IF o.kind='rental' THEN
     return_proof:=erp_private.t07_record_evidence(o.id,a.id,'rental-return',p_data->'evidence');
     return_snapshot:=return_snapshot||((p_data->'evidence')-'reference');
     INSERT INTO erp_private.fleet_rental_events(order_id,assignment_id,kind,occurred_at,evidence_id,reason,recorded_by)
     VALUES(o.id,a.id,'return',starts,return_proof,p_reason,public.current_user_profile_id());
    END IF;
    PERFORM erp_private.t07_return_assignment(p_nonce,a.id,starts,p_reason,return_snapshot);
   ELSE
    PERFORM erp_private.t07_change_commitment(p_nonce,'cancel-plan',a.asset_id,a.reservation_id,'cancel',jsonb_build_object('reason',p_reason));
   END IF;
   UPDATE erp_private.fleet_operation_assignments item SET state='replaced' WHERE item.id=a.id;
 END IF;
 result:=erp_private.t07_change_commitment(p_nonce,'reserve',asset_id,NULL,'reserve',
   jsonb_build_object('employee',worker_id,'site',o.site_id,'from',starts,'until',ends,'reason',p_reason));
 SELECT * INTO c FROM erp_private.fleet_commitments item WHERE item.id=(result->>'id')::bigint;
 INSERT INTO erp_private.fleet_operation_assignments(order_id,slot,supersedes_id,reservation_id,asset_id,worker_id,employment_id,
   employer_company_id,employer_branch_id,host_company_id,host_branch_id,site_id,planned_period,planned_by,reason)
 VALUES(o.id,selected_slot,a.id,c.id,asset_id,worker_id,c.employment_period_id,ep.company_id,ep.branch_id,o.company_id,o.branch_id,
    o.site_id,c.committed_during,public.current_user_profile_id(),p_reason) RETURNING id INTO new_id;
 INSERT INTO erp_private.fleet_ops_owned_commitments(commitment_id,order_id) VALUES(c.id,o.id);
 RETURN new_id;
END;
$$;

REVOKE ALL ON FUNCTION erp_private.t07_text(jsonb,text,integer),erp_private.t07_party_allowed(bigint,bigint,bigint),
 erp_private.t07_record_evidence(bigint,bigint,text,jsonb),erp_private.t07_current_evidence(bigint,text),erp_private.t07_evidence_is_current(bigint),
 erp_private.t07_change_commitment(uuid,text,bigint,bigint,text,jsonb),erp_private.t07_return_assignment(uuid,bigint,timestamptz,text,jsonb),
 erp_private.t07_trip_action(uuid,bigint,text,jsonb,text),erp_private.t07_assign(uuid,bigint,text,jsonb,text)
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
