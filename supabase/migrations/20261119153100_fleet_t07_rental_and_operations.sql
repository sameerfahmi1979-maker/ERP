BEGIN;

CREATE TABLE erp_private.fleet_rental_extensions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 assignment_id bigint NOT NULL REFERENCES erp_private.fleet_operation_assignments(id),
 previous_return timestamptz NOT NULL,
 new_return timestamptz NOT NULL CHECK(new_return>previous_return),
 evidence_id bigint NOT NULL REFERENCES erp_private.fleet_operation_evidence(id),
 approved_by bigint NOT NULL REFERENCES public.user_profiles(id),
 recorded_at timestamptz NOT NULL DEFAULT statement_timestamp()
);
ALTER TABLE erp_private.fleet_rental_extensions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.fleet_rental_extensions FROM PUBLIC,anon,authenticated,service_role;

CREATE VIEW erp_private.t07_effective_rental_usage AS
 SELECT u.id,u.order_id,u.assignment_id,u.work_period,coalesce(r.evidence_id,u.evidence_id) AS evidence_id,
   CASE WHEN r.id IS NULL THEN u.state ELSE 'signed' END AS state,
   coalesce(r.reason,u.reason) AS reason
 FROM erp_private.fleet_rental_usage u LEFT JOIN LATERAL (
   SELECT x.id,x.evidence_id,x.reason FROM erp_private.fleet_rental_usage_resolutions x WHERE x.usage_id=u.id ORDER BY x.id DESC LIMIT 1
 ) r ON true;
REVOKE ALL ON erp_private.t07_effective_rental_usage FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION erp_private.t07_rental_action(p_order bigint,p_action text,p_data jsonb,p_reason text)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE o erp_private.fleet_operation_orders; a erp_private.fleet_operation_assignments; c erp_private.fleet_commitments;
 line_assignment erp_private.fleet_operation_assignments; line_commitment erp_private.fleet_commitments;
 usage erp_private.t07_effective_rental_usage;
 record_id bigint; proof bigint; v_kind text; event_time timestamptz; begins timestamptz; ends timestamptz; line jsonb; v_state text;
 line_reason text; actor bigint:=public.current_user_profile_id(); previous_started timestamptz; new_due timestamptz; gate jsonb;
BEGIN
 SELECT * INTO o FROM erp_private.fleet_operation_orders WHERE id=p_order AND kind='rental';
 SELECT * INTO a FROM erp_private.fleet_operation_assignments item WHERE item.id=(p_data->>'assignment')::bigint AND item.order_id=o.id;
 IF o.id IS NULL OR a.id IS NULL OR a.actual_commitment_id IS NULL OR o.status NOT IN('active','review')
 THEN RAISE EXCEPTION 'Select a rental with a physical handover' USING ERRCODE='PT409'; END IF;
 SELECT * INTO c FROM erp_private.fleet_commitments WHERE id=a.actual_commitment_id;
 IF p_action='resolve-sheet' THEN
  SELECT * INTO usage FROM erp_private.t07_effective_rental_usage u WHERE u.id=(p_data->>'usage')::bigint AND u.order_id=o.id;
  IF usage.id IS NULL OR NOT EXISTS(SELECT 1 FROM erp_private.fleet_operation_assignments line
      WHERE line.id=usage.assignment_id AND erp_private.t06_custody_visible(line.asset_id))
     OR (usage.state='signed' AND erp_private.t07_evidence_is_current(usage.evidence_id))
  THEN RAISE EXCEPTION 'Select an interval with missing, disputed or stale evidence' USING ERRCODE='PT409'; END IF;
  UPDATE erp_private.fleet_operation_orders SET status='review' WHERE id=o.id;
  proof:=erp_private.t07_record_evidence(o.id,a.id,'rental-sheet',p_data->'evidence');
  IF proof=usage.evidence_id THEN RAISE EXCEPTION 'Choose new verified evidence for this finding' USING ERRCODE='PT409'; END IF;
  INSERT INTO erp_private.fleet_rental_usage_resolutions(usage_id,evidence_id,reason,resolved_by)
   VALUES(usage.id,proof,p_reason,actor) RETURNING id INTO record_id;
  RETURN record_id;
 END IF;
 IF p_action='record-sheet' THEN
  IF jsonb_typeof(p_data->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(p_data->'lines') NOT BETWEEN 1 AND 40
  THEN RAISE EXCEPTION 'Enter at least one signed, disputed or missing interval from the sheet' USING ERRCODE='22023'; END IF;
  proof:=erp_private.t07_record_evidence(o.id,a.id,'rental-sheet',p_data->'evidence');
  FOR line IN SELECT value FROM jsonb_array_elements(p_data->'lines') LOOP
   IF NOT erp_private.t05_fields(line,ARRAY['assignment','from','until','state','reason'])
   THEN RAISE EXCEPTION 'Invalid rental sheet interval' USING ERRCODE='22023'; END IF;
   SELECT * INTO line_assignment FROM erp_private.fleet_operation_assignments item
     WHERE item.order_id=o.id AND item.id=coalesce((line->>'assignment')::bigint,a.id);
   SELECT * INTO line_commitment FROM erp_private.fleet_commitments WHERE id=line_assignment.actual_commitment_id;
   IF line_commitment.id IS NULL OR NOT erp_private.t06_custody_visible(line_assignment.asset_id)
   THEN RAISE EXCEPTION 'The sheet line must identify an authorized actual assignment on the same rental' USING ERRCODE='42501'; END IF;
   begins:=(line->>'from')::timestamptz; ends:=(line->>'until')::timestamptz; v_state:=line->>'state';
   line_reason:=nullif(btrim(line->>'reason'),'');
   IF begins IS NULL OR ends IS NULL OR NOT isfinite(begins) OR NOT isfinite(ends)
     OR begins>=ends OR ends>statement_timestamp() OR NOT (line_commitment.committed_during @> tstzrange(begins,ends,'[)'))
     OR NOT coalesce(v_state IN('signed','disputed','missing'),false) OR length(line_reason)>500
     OR (v_state<>'signed' AND line_reason IS NULL)
   THEN RAISE EXCEPTION 'Each interval must be within the actual assignment with its separate evidence status' USING ERRCODE='PT409'; END IF;
   INSERT INTO erp_private.fleet_rental_usage(order_id,assignment_id,evidence_id,work_period,state,reason)
    VALUES(o.id,line_assignment.id,proof,tstzrange(begins,ends,'[)'),v_state,line_reason);
   IF v_state<>'signed' THEN UPDATE erp_private.fleet_operation_orders SET status='review' WHERE id=o.id; END IF;
  END LOOP;
  RETURN proof;
 END IF;
 IF p_action='extend-rental' THEN
  new_due:=(p_data->>'until')::timestamptz;
  IF a.state<>'active' OR actor=a.planned_by OR new_due IS NULL OR NOT isfinite(new_due)
    OR new_due<=greatest(c.planned_return,statement_timestamp())
    OR NOT erp_private.t02_has_scope('fleet.availability.plan',c.company_id,c.branch_id)
  THEN RAISE EXCEPTION 'An independent extension of an active rental requires a later approved return' USING ERRCODE='PT409'; END IF;
  PERFORM 1 FROM erp_private.fleet_assets fa WHERE fa.id=a.asset_id FOR UPDATE;
  gate:=erp_private.t06_check_availability(a.asset_id,a.worker_id,a.site_id,greatest(c.planned_return,statement_timestamp()),
    new_due,c.company_id,c.branch_id,c.id,false);
  IF NOT (gate->>'available')::boolean THEN RAISE EXCEPTION 'Extension is held by current Fleet availability' USING ERRCODE='PT409'; END IF;
  proof:=erp_private.t07_record_evidence(o.id,a.id,'rental-commercial',p_data->'evidence');
  INSERT INTO erp_private.fleet_rental_extensions(assignment_id,previous_return,new_return,evidence_id,approved_by)
   VALUES(a.id,c.planned_return,new_due,proof,actor) RETURNING id INTO record_id;
  INSERT INTO erp_private.fleet_ops_transition(tx,commitment_id) VALUES(txid_current(),c.id);
  UPDATE erp_private.fleet_commitments item SET planned_return=new_due,revision=item.revision+1 WHERE item.id=c.id;
  DELETE FROM erp_private.fleet_ops_transition x WHERE x.tx=txid_current() AND x.commitment_id=c.id;
  INSERT INTO erp_private.fleet_rental_events(order_id,assignment_id,kind,occurred_at,evidence_id,reason,recorded_by)
   VALUES(o.id,a.id,'extension',statement_timestamp(),proof,p_reason,actor);
  RETURN record_id;
 END IF;
 v_kind:=p_data->>'kind';
 event_time:=(p_data->>'at')::timestamptz;
 IF NOT coalesce(v_kind IN('off-hire','customer-start','customer-stop','supplier-start','supplier-stop','technical-clearance','claim'),false)
   OR event_time IS NULL OR NOT isfinite(event_time) OR event_time>statement_timestamp()
   OR (v_kind IN('supplier-start','supplier-stop') AND o.supplier_id IS NULL)
 THEN RAISE EXCEPTION 'Record a valid rental milestone for its own clock' USING ERRCODE='22023'; END IF;
 IF v_kind IN('customer-stop','supplier-stop') THEN
  SELECT event.occurred_at INTO previous_started FROM erp_private.fleet_rental_events event
   WHERE event.order_id=o.id AND event.kind=replace(v_kind,'-stop','-start');
  IF previous_started IS NULL OR event_time<=previous_started
  THEN RAISE EXCEPTION 'Record the corresponding clock start before stopping it' USING ERRCODE='PT409'; END IF;
 END IF;
 IF v_kind='technical-clearance' AND (c.status<>'closed' OR event_time<upper(c.committed_during) OR EXISTS(
     SELECT 1 FROM erp_private.fleet_asset_holds h WHERE h.asset_id=a.asset_id AND h.released_at IS NULL))
 THEN RAISE EXCEPTION 'Technical clearance requires actual return and resolution of current holds' USING ERRCODE='PT409'; END IF;
 proof:=erp_private.t07_record_evidence(o.id,a.id,'rental-commercial',p_data->'evidence');
 INSERT INTO erp_private.fleet_rental_events(order_id,assignment_id,kind,occurred_at,evidence_id,reason,recorded_by)
 VALUES(o.id,a.id,v_kind,event_time,proof,p_reason,actor) RETURNING id INTO record_id;
 RETURN record_id;
END;
$$;

CREATE OR REPLACE FUNCTION erp_private.t07_ops_readable(p_company bigint,p_branch bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_private.t05_scope('fleet.operations.view',p_company,p_branch);
$$;

CREATE OR REPLACE FUNCTION public.t07_fleet_operation(p_operation uuid,p_order bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o erp_private.fleet_operation_orders; a erp_private.fleet_operation_assignments; paper erp_private.fleet_trip_paper_orders;
 c erp_private.fleet_commitments; company bigint; branch bigint; site bigint; customer bigint; supplier bigint;
 actor bigint:=public.current_user_profile_id(); why text; cap text; digest text; receipt jsonb; outcome jsonb;
 order_id bigint; event_id bigint; proof_id bigint; kind text; mode text; state_code text;
 actual_at timestamptz; today date:=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date;
 snapshot jsonb; rendered_ref text;
BEGIN
 IF NOT coalesce(p_action IN('create','authorize','plan-leg','assign','substitute','inspect','issue-paper','start','complete-leg',
   'resolve-pod','return','cancel-assignment','complete','cancel','reopen','record-sheet','resolve-sheet','approve-handover','rental-event','extend-rental'),false)
   OR NOT erp_private.t05_fields(p_data,ARRAY['company','branch','site','customer','supplier','kind','rental_mode','reference','subject','reason',
    'revision','authorization','assignment','asset','employee','slot','from','until','at','snapshot','sequence','origin','destination','load','cargo',
    'leg','delivery','discrepancy','gross_kg','tare_kg','weigh','pod','evidence','passed','issue','offline','lines','usage'])
 THEN RAISE EXCEPTION 'Invalid Fleet operation' USING ERRCODE='22023'; END IF;
 why:=erp_private.t07_text(p_data,'reason',500);
 IF p_action='create' THEN
   IF p_order IS NOT NULL THEN RAISE EXCEPTION 'Open a new operation request' USING ERRCODE='22023'; END IF;
   company:=(p_data->>'company')::bigint; branch:=(p_data->>'branch')::bigint;
 ELSE
   SELECT * INTO o FROM erp_private.fleet_operation_orders item WHERE item.id=p_order FOR UPDATE;
   company:=o.company_id; branch:=o.branch_id;
 END IF;
 cap:=CASE WHEN p_action IN('authorize','reopen','extend-rental','approve-handover') OR (p_action='rental-event' AND p_data->>'kind'='technical-clearance')
      THEN 'fleet.operations.approve'
   WHEN p_action='rental-event' AND p_data->>'kind' IN('customer-start','customer-stop','supplier-start','supplier-stop','claim')
      THEN 'fleet.operations.commercial' ELSE 'fleet.operations.manage' END;
 IF branch IS NULL OR NOT erp_private.t02_has_scope('fleet.operations.view',company,branch)
    OR NOT erp_private.t02_has_scope(cap,company,branch)
 THEN RAISE EXCEPTION 'Fleet operation unavailable in your current scope' USING ERRCODE='42501'; END IF;
 digest:=erp_private.t02_digest(jsonb_build_array(p_order,p_action,p_data));
 receipt:=erp_private.t02_replay('fleet-operation',p_operation,digest);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;

 IF p_action='create' THEN
  site:=(p_data->>'site')::bigint; customer:=(p_data->>'customer')::bigint; supplier:=(p_data->>'supplier')::bigint;
  kind:=p_data->>'kind'; mode:=p_data->>'rental_mode';
  IF NOT erp_private.t06_site_allowed(site,company,branch,today,today)
   OR NOT erp_private.t07_party_allowed(customer,company,branch) OR NOT erp_private.t07_party_allowed(supplier,company,branch)
   OR NOT coalesce(kind IN('trip','rental'),false)
   OR (kind='rental' AND (customer IS NULL OR NOT coalesce(mode IN('wet','dry'),false)))
  THEN RAISE EXCEPTION 'Select the permitted site and authoritative parties' USING ERRCODE='22023'; END IF;
  order_id:=nextval(pg_get_serial_sequence('erp_private.fleet_operation_orders','id')::regclass);
  outcome:=erp_private.numbering_allocate(NULL,'FLEET_OPERATION',NULL,p_operation,actor,'consumed','fleet_operation_orders',
    order_id,'T07 Fleet operation '||digest,statement_timestamp());
  INSERT INTO erp_private.fleet_operation_orders(id,order_no,kind,company_id,branch_id,site_id,customer_id,supplier_id,rental_mode,
    request_reference,subject,raised_by) OVERRIDING SYSTEM VALUE
  VALUES(order_id,outcome->>'generated_reference_number',kind,company,branch,site,customer,supplier,mode,
    erp_private.t07_text(p_data,'reference',160),erp_private.t07_text(p_data,'subject',160),actor) RETURNING * INTO o;
 ELSE
  IF (p_data->>'revision')::integer IS DISTINCT FROM o.revision
  THEN RAISE EXCEPTION 'The operation has changed. Refresh and review it' USING ERRCODE='PT409'; END IF;
  IF o.status IN('completed','cancelled') AND p_action<>'reopen'
  THEN RAISE EXCEPTION 'Closed operation history is retained' USING ERRCODE='PT409'; END IF;
  state_code:=o.status;
  IF p_action='authorize' THEN
   IF o.status<>'requested' OR o.raised_by=actor OR (o.kind='trip' AND NOT EXISTS(
       SELECT 1 FROM erp_private.fleet_trip_legs planned WHERE planned.order_id=o.id))
   THEN RAISE EXCEPTION 'Independent authorization requires a complete request' USING ERRCODE='PT409'; END IF;
   UPDATE erp_private.fleet_operation_orders item SET authorized_by=actor,authorized_at=statement_timestamp(),
       authorization_reference=erp_private.t07_text(p_data,'authorization',160) WHERE item.id=o.id;
   state_code:='authorized';
  ELSIF p_action IN('plan-leg','issue-paper','complete-leg','resolve-pod') THEN
   event_id:=erp_private.t07_trip_action(p_operation,o.id,p_action,p_data,why);
   SELECT status INTO state_code FROM erp_private.fleet_operation_orders WHERE id=o.id;
  ELSIF p_action IN('assign','substitute') THEN
   event_id:=erp_private.t07_assign(p_operation,o.id,p_action,p_data,why);
  ELSIF p_action IN('record-sheet','resolve-sheet','rental-event','extend-rental') THEN
   event_id:=erp_private.t07_rental_action(o.id,p_action,p_data,why);
   SELECT status INTO state_code FROM erp_private.fleet_operation_orders WHERE id=o.id;
  ELSIF p_action IN('inspect','start','return','cancel-assignment','approve-handover') THEN
   SELECT * INTO a FROM erp_private.fleet_operation_assignments item WHERE item.id=(p_data->>'assignment')::bigint AND item.order_id=o.id;
   IF a.id IS NULL THEN RAISE EXCEPTION 'Assignment unavailable for this operation' USING ERRCODE='42501'; END IF;
   PERFORM 1 FROM erp_private.fleet_assets fa WHERE fa.id=a.asset_id FOR UPDATE;
   actual_at:=(p_data->>'at')::timestamptz;
   IF p_action='approve-handover' THEN
    IF NOT erp_private.t02_has_scope('fleet.custody.approve',o.company_id,o.branch_id)
    THEN RAISE EXCEPTION 'Independent custody approval authority is required' USING ERRCODE='42501'; END IF;
    IF o.kind<>'rental' OR a.state<>'planned' OR actor=a.planned_by OR a.handover_approved_by IS NOT NULL
       OR upper(a.planned_period)<=statement_timestamp()
    THEN RAISE EXCEPTION 'Only an independent reviewer can approve this current named rental assignment' USING ERRCODE='PT409'; END IF;
    UPDATE erp_private.fleet_operation_assignments SET handover_approved_by=actor WHERE id=a.id;
    event_id:=a.id;
   ELSIF p_action='inspect' THEN
    IF o.kind<>'trip' OR a.state<>'planned' OR jsonb_typeof(p_data->'passed') IS DISTINCT FROM 'boolean'
      OR actual_at IS NULL OR NOT isfinite(actual_at) OR actual_at>statement_timestamp()
    THEN RAISE EXCEPTION 'Record the completed inspection against the planned trip resource' USING ERRCODE='22023'; END IF;
    proof_id:=erp_private.t07_record_evidence(o.id,a.id,'pre-trip',p_data->'evidence');
    UPDATE erp_private.fleet_operation_assignments item SET inspected_at=actual_at,inspection_passed=(p_data->>'passed')::boolean WHERE item.id=a.id;
    event_id:=proof_id;
   ELSIF p_action='start' THEN
    IF o.status NOT IN('authorized','active','review') OR a.state<>'planned'
      OR actual_at IS NULL OR NOT isfinite(actual_at) OR actual_at>statement_timestamp()
    THEN RAISE EXCEPTION 'A planned authorized assignment and actual start are required' USING ERRCODE='PT409'; END IF;
    snapshot:=p_data->'snapshot';
    IF NOT erp_private.t05_fields(snapshot,ARRAY['meter','meter_unit','meter_unknown','condition','discrepancy','document','version','file'])
    THEN RAISE EXCEPTION 'Record actual condition and meter' USING ERRCODE='22023'; END IF;
    IF o.kind='trip' THEN
     SELECT * INTO paper FROM erp_private.fleet_trip_paper_orders item WHERE item.order_id=o.id ORDER BY issue_revision DESC LIMIT 1;
     IF paper.id IS NULL OR paper.pdf_bytes IS NULL OR paper.id IS DISTINCT FROM (p_data->>'issue')::bigint
       OR NOT paper.snapshot->'assignments' @> jsonb_build_array(jsonb_build_object('id',a.id))
       OR a.inspection_passed IS DISTINCT FROM true OR a.inspected_at>actual_at
       OR a.inspected_at<actual_at-interval '24 hours' OR NOT erp_private.t07_current_evidence(a.id,'pre-trip')
     THEN RAISE EXCEPTION 'Issue the current assignment order and complete current pre-trip inspection before dispatch' USING ERRCODE='PT409'; END IF;
     rendered_ref:=erp_private.t05_identifier(p_data#>>'{evidence,reference}');
     IF rendered_ref IS DISTINCT FROM erp_private.t05_identifier(paper.issue_no)
       AND coalesce(p_data->'offline','false'::jsonb)<>'true'::jsonb
     THEN RAISE EXCEPTION 'The signed paper reference must match its issued version' USING ERRCODE='PT409'; END IF;
     proof_id:=erp_private.t07_record_evidence(o.id,a.id,'trip-order',p_data->'evidence');
    ELSE
     proof_id:=erp_private.t07_record_evidence(o.id,a.id,'rental-handover',p_data->'evidence');
     snapshot:=snapshot||((p_data->'evidence')-'reference');
    END IF;
    outcome:=erp_private.t07_change_commitment(p_operation,'start',a.asset_id,a.reservation_id,
       CASE WHEN o.kind='trip' THEN 'dispatch' ELSE 'checkout' END,
       jsonb_build_object('at',actual_at,'reason',why,'snapshot',snapshot));
    SELECT * INTO c FROM erp_private.fleet_commitments item WHERE item.id=(outcome->>'id')::bigint;
    IF c.employment_period_id IS DISTINCT FROM a.employment_id OR c.employee_id IS DISTINCT FROM a.worker_id
    THEN RAISE EXCEPTION 'Verified employment changed. Replace or replan the assignment' USING ERRCODE='PT409'; END IF;
    UPDATE erp_private.fleet_operation_assignments item SET actual_commitment_id=c.id,state='active' WHERE item.id=a.id;
    INSERT INTO erp_private.fleet_ops_owned_commitments(commitment_id,order_id) VALUES(c.id,o.id);
    IF o.kind='rental' THEN
      INSERT INTO erp_private.fleet_rental_events(order_id,assignment_id,kind,occurred_at,evidence_id,reason,recorded_by)
      VALUES(o.id,a.id,'handover',actual_at,proof_id,why,actor);
    END IF;
    state_code:=CASE WHEN o.status='review' THEN 'review' ELSE 'active' END;
    event_id:=a.id;
   ELSIF p_action='return' THEN
    snapshot:=p_data->'snapshot';
    IF o.kind='rental' THEN
     proof_id:=erp_private.t07_record_evidence(o.id,a.id,'rental-return',p_data->'evidence');
     snapshot:=snapshot||((p_data->'evidence')-'reference');
    END IF;
    PERFORM erp_private.t07_return_assignment(p_operation,a.id,actual_at,why,snapshot);
    IF o.kind='rental' THEN
     INSERT INTO erp_private.fleet_rental_events(order_id,assignment_id,kind,occurred_at,evidence_id,reason,recorded_by)
      VALUES(o.id,a.id,'return',actual_at,proof_id,why,actor);
    END IF;
    event_id:=a.id;
   ELSE
    IF a.state<>'planned' THEN RAISE EXCEPTION 'Cancel only a planned assignment' USING ERRCODE='PT409'; END IF;
    PERFORM erp_private.t07_change_commitment(p_operation,'cancel',a.asset_id,a.reservation_id,'cancel',jsonb_build_object('reason',why));
    UPDATE erp_private.fleet_operation_assignments item SET state='cancelled' WHERE item.id=a.id;
    event_id:=a.id;
   END IF;
  ELSIF p_action='reopen' THEN
   IF o.status<>'completed' OR actor=o.raised_by OR actor IS NOT DISTINCT FROM
      (SELECT log.actor_id FROM erp_private.fleet_ops_audit log WHERE log.order_id=o.id AND log.action='complete' ORDER BY id DESC LIMIT 1)
   THEN RAISE EXCEPTION 'Only an independent reviewer can reopen a completed operation' USING ERRCODE='42501'; END IF;
   state_code:='review';
  ELSIF p_action='cancel' THEN
   IF EXISTS(SELECT 1 FROM erp_private.fleet_operation_assignments item WHERE item.order_id=o.id AND item.state IN('planned','active','closed','replaced'))
   THEN RAISE EXCEPTION 'Resolve commitments and retain performed work before cancellation' USING ERRCODE='PT409'; END IF;
   state_code:='cancelled';
  ELSE
   IF o.status NOT IN('active','review') OR EXISTS(SELECT 1 FROM erp_private.fleet_operation_assignments item
     WHERE item.order_id=o.id AND item.state IN('planned','active'))
   THEN RAISE EXCEPTION 'Close actual assignments before completing the operation' USING ERRCODE='PT409'; END IF;
   state_code:='completed';
   IF o.kind='trip' AND EXISTS(SELECT 1 FROM erp_private.fleet_trip_legs l
     LEFT JOIN erp_private.fleet_trip_leg_actuals f ON f.leg_id=l.id
     LEFT JOIN LATERAL(SELECT d.state,d.evidence_id FROM erp_private.fleet_trip_delivery_facts d WHERE d.actual_id=f.id ORDER BY id DESC LIMIT 1) last_delivery ON true
     WHERE l.order_id=o.id AND (f.id IS NULL OR NOT coalesce(last_delivery.state IN('accepted','not-required'),false)
       OR (last_delivery.state='accepted' AND NOT erp_private.t07_evidence_is_current(last_delivery.evidence_id))))
   THEN state_code:='review'; END IF;
   IF o.kind='rental' AND (NOT EXISTS(SELECT 1 FROM erp_private.t07_effective_rental_usage u WHERE u.order_id=o.id)
     OR EXISTS(SELECT 1 FROM erp_private.t07_effective_rental_usage u WHERE u.order_id=o.id
        AND (u.state<>'signed' OR NOT erp_private.t07_evidence_is_current(u.evidence_id)))
     OR NOT EXISTS(SELECT 1 FROM erp_private.fleet_rental_events e WHERE e.order_id=o.id AND e.kind='customer-stop')
     OR (o.supplier_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM erp_private.fleet_rental_events e WHERE e.order_id=o.id AND e.kind='supplier-stop'))
     OR EXISTS(SELECT 1 FROM erp_private.fleet_operation_assignments item WHERE item.order_id=o.id AND item.actual_commitment_id IS NOT NULL
        AND NOT EXISTS(SELECT 1 FROM erp_private.fleet_rental_events e WHERE e.assignment_id=item.id AND e.kind='technical-clearance')))
   THEN state_code:='review'; END IF;
  END IF;
  UPDATE erp_private.fleet_operation_orders item SET status=state_code,revision=item.revision+1 WHERE item.id=o.id RETURNING * INTO o;
 END IF;
 INSERT INTO erp_private.fleet_ops_audit(order_id,action,entity_id,actor_id,reason) VALUES(o.id,p_action,event_id,actor,why);
 RETURN erp_private.t02_save_receipt('fleet-operation',p_operation,digest,
   jsonb_build_object('id',o.id,'order_no',o.order_no,'status',o.status,'revision',o.revision,'event_id',event_id));
END;
$$;

REVOKE ALL ON FUNCTION erp_private.t07_rental_action(bigint,text,jsonb,text),erp_private.t07_ops_readable(bigint,bigint),
 public.t07_fleet_operation(uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t07_fleet_operation(uuid,bigint,text,jsonb) TO authenticated;
COMMIT;
