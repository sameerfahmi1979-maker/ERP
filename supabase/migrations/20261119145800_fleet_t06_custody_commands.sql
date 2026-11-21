BEGIN;

ALTER TABLE erp_private.fleet_availability_policies ADD COLUMN IF NOT EXISTS tentative_allowed boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION erp_private.t06_cross_approver_current(p_actor bigint,p_company bigint,p_branch bigint,p_target_company bigint,p_target_branch bigint)
RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE company_row record; branch_row record; matching_role bigint;
BEGIN
 IF p_company IS NULL OR p_branch IS NULL OR p_target_company IS NULL OR p_target_branch IS NULL OR p_company=p_target_company THEN RETURN false; END IF;
 PERFORM 1 FROM public.user_profiles p WHERE p.id=p_actor AND p.status='active' AND NOT p.must_change_password FOR SHARE;
 IF NOT FOUND THEN RETURN false; END IF;
 -- Durable company-wide business role, shared by the approval and its consumption.
 FOR company_row IN SELECT c.id FROM public.owner_companies c WHERE c.status='active' ORDER BY c.id FOR SHARE LOOP
   SELECT ur.id INTO matching_role FROM public.user_roles ur JOIN public.roles r ON r.id=ur.role_id
   JOIN public.role_permissions g ON g.role_id=r.id JOIN public.permissions cap ON cap.id=g.permission_id
   LEFT JOIN erp_private.t02_role_validity validity ON validity.assignment_id=ur.id
   WHERE ur.user_profile_id=p_actor AND ur.owner_company_id=company_row.id AND ur.branch_id IS NULL
     AND ur.is_active AND r.is_active AND cap.is_active AND cap.permission_code='integrated.custody.transfer'
     AND r.role_code NOT IN ('system_admin','group_admin','company_admin','branch_admin')
     AND (validity.valid_until IS NULL OR validity.valid_until>clock_timestamp())
   ORDER BY ur.id LIMIT 1 FOR SHARE OF ur,r,g,cap;
   IF matching_role IS NULL THEN RETURN false; END IF;
 END LOOP;
 FOR branch_row IN SELECT * FROM (VALUES (p_company,p_branch),(p_target_company,p_target_branch)) branch_scope(company_id,branch_id)
   ORDER BY company_id,branch_id
 LOOP
  PERFORM 1 FROM public.branches b JOIN public.owner_companies c ON c.id=b.owner_company_id
    WHERE c.id=branch_row.company_id AND c.status='active' AND b.id=branch_row.branch_id
      AND b.status='active' AND b.operating_status='active' FOR SHARE OF b,c;
  IF NOT FOUND THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION erp_private.t06_write_event(
 p_commitment bigint,p_kind text,p_at timestamptz,p_reason text,p_snapshot jsonb,p_signed boolean)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE c erp_private.fleet_commitments; previous erp_private.fleet_custody_events; doc bigint; ver bigint; original bigint;
 measured numeric; measure_unit text; condition_code text; discrepancy boolean:=false; event_id bigint;
BEGIN
 SELECT * INTO c FROM erp_private.fleet_commitments WHERE id=p_commitment;
 IF p_kind IN ('checkout','return','dispatch','transfer-out','transfer-in') THEN
  IF NOT erp_private.t05_fields(p_snapshot,ARRAY['meter','meter_unit','meter_unknown','condition','discrepancy','document','version','file'])
  THEN RAISE EXCEPTION 'Complete the handover or return snapshot' USING ERRCODE='22023'; END IF;
  measured:=(p_snapshot->>'meter')::numeric;
  measure_unit:=p_snapshot->>'meter_unit';
  condition_code:=p_snapshot->>'condition';
  doc:=(p_snapshot->>'document')::bigint;
  ver:=(p_snapshot->>'version')::bigint;
  original:=(p_snapshot->>'file')::bigint;
  IF coalesce(condition_code,'') NOT IN ('good','fair','damaged','unknown')
    OR (measured IS NULL AND (p_snapshot->'meter_unknown' IS DISTINCT FROM 'true'::jsonb OR measure_unit IS NOT NULL))
    OR (measured IS NOT NULL AND (jsonb_typeof(p_snapshot->'meter') IS DISTINCT FROM 'number'
       OR measured<0 OR measured<>round(measured,3) OR coalesce(measure_unit,'') NOT IN ('km','hours')))
    OR (p_snapshot?'discrepancy' AND jsonb_typeof(p_snapshot->'discrepancy')<>'boolean')
  THEN RAISE EXCEPTION 'Record a valid meter reading or explicitly mark it unknown, and record the condition' USING ERRCODE='22023'; END IF;
  SELECT * INTO previous FROM erp_private.fleet_custody_events e WHERE e.commitment_id=c.id AND e.kind IN ('checkout','transfer-in','dispatch');
  discrepancy:=coalesce((p_snapshot->>'discrepancy')::boolean,false) OR condition_code='damaged'
     OR (previous.id IS NOT NULL AND (previous.condition IS DISTINCT FROM condition_code
        OR (previous.meter IS NOT NULL AND (previous.meter_unit IS DISTINCT FROM measure_unit OR measured<previous.meter))));
  IF (p_signed OR discrepancy OR doc IS NOT NULL OR ver IS NOT NULL OR original IS NOT NULL) AND NOT EXISTS(
    SELECT 1 FROM public.dms_documents d
    JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.deleted_at IS NULL AND t.type_code='FLEET_CUSTODY_ACK'
    JOIN erp_private.fleet_document_parents owner_link ON owner_link.document_id=d.id AND owner_link.asset_id=c.asset_id
    JOIN public.dms_document_versions v ON v.id=ver AND v.id=d.current_version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
    JOIN public.dms_document_files f ON f.id=original AND f.document_id=d.id AND f.version_id=v.id AND f.deleted_at IS NULL
       AND f.file_role='original' AND f.integrity_status='verified' AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$'
    JOIN public.dms_document_links l ON l.document_id=d.id AND l.entity_type='fleet_asset' AND l.entity_id=c.asset_id AND l.deleted_at IS NULL
    WHERE d.id=doc AND d.deleted_at IS NULL AND NOT d.is_archived AND d.status='active'
      AND erp_private.document_permission(d.id,'dms.documents.preview')
    FOR SHARE OF d,v,f,l
  ) THEN RAISE EXCEPTION 'A current verified signed DMS original for this asset is required' USING ERRCODE='PT409'; END IF;
 END IF;
 INSERT INTO erp_private.fleet_custody_events(commitment_id,kind,occurred_at,actor_id,reason,meter,meter_unit,condition,discrepancy,
   evidence_document_id,evidence_version_id,evidence_file_id)
 VALUES(c.id,p_kind,p_at,public.current_user_profile_id(),p_reason,measured,measure_unit,condition_code,discrepancy,doc,ver,original)
 RETURNING id INTO event_id;
 IF p_kind='return' AND discrepancy THEN
   INSERT INTO erp_private.fleet_asset_holds(asset_id,kind,placed_at,placed_by,reason,source_commitment_id)
   VALUES(c.asset_id,'workshop',clock_timestamp(),public.current_user_profile_id(),'Returned condition needs Workshop assessment',c.id);
 END IF;
 IF p_kind IN ('transfer-out','transfer-in','checkout','dispatch') AND condition_code='damaged' THEN
  RAISE EXCEPTION 'Record a separate return and Workshop assessment for damage' USING ERRCODE='PT409';
 END IF;
 RETURN event_id;
END;
$$;

CREATE OR REPLACE FUNCTION erp_private.t06_keep_signed_link()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.entity_type='fleet_asset' AND OLD.deleted_at IS NULL
    AND EXISTS (SELECT 1 FROM erp_private.fleet_custody_events e WHERE e.evidence_document_id=OLD.document_id)
    AND (TG_OP='DELETE' OR NEW.deleted_at IS NOT NULL)
 THEN RAISE EXCEPTION 'Retain the signed Fleet evidence association' USING ERRCODE='PT409'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE OR REPLACE TRIGGER t06_keep_signed_fleet_link BEFORE UPDATE OF deleted_at OR DELETE ON public.dms_document_links
 FOR EACH ROW EXECUTE FUNCTION erp_private.t06_keep_signed_link();

CREATE OR REPLACE FUNCTION public.t06_fleet_policy(
 p_operation uuid,p_company bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE req_hash text; receipt jsonb; row_data erp_private.fleet_availability_policies;
 explanation text:=btrim(p_data->>'reason');
 from_day date; last_day date; licence bigint; site_access bigint; employee_class bigint;
 actor bigint:=public.current_user_profile_id();
BEGIN
 IF NOT erp_private.t02_has_scope('fleet.availability.policy',p_company,NULL) THEN
  RAISE EXCEPTION 'Company Fleet policy authority is required' USING ERRCODE='42501'; END IF;
 IF coalesce(p_action,'') NOT IN ('prepare','approve')
   OR NOT erp_private.t05_fields(p_data,CASE WHEN p_action='prepare' THEN
    ARRAY['category','from','until','routine_minutes','signed_handover','registration_required','insurance_required','tentative_allowed','licence_type','access_type','employee_category','reason']
    ELSE ARRAY['id','reason'] END)
   OR coalesce(length(explanation),0) NOT BETWEEN 1 AND 500
 THEN RAISE EXCEPTION 'Complete the Fleet policy and review reason' USING ERRCODE='22023'; END IF;
 req_hash:=erp_private.t02_digest(jsonb_build_array(p_company,p_action,p_data));
 receipt:=erp_private.t02_replay('fleet-policy',p_operation,req_hash);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;
 IF p_action='prepare' THEN
  from_day:=(p_data->>'from')::date;
  last_day:=(p_data->>'until')::date;
  licence:=(p_data->>'licence_type')::bigint;
  site_access:=(p_data->>'access_type')::bigint;
  employee_class:=(p_data->>'employee_category')::bigint;
  IF from_day IS NULL OR last_day IS NULL OR NOT isfinite(from_day) OR NOT isfinite(last_day) OR last_day<from_day
    OR jsonb_typeof(p_data->'signed_handover') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_data->'registration_required') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_data->'insurance_required') IS DISTINCT FROM 'boolean'
    OR jsonb_typeof(p_data->'tentative_allowed') IS DISTINCT FROM 'boolean'
    OR (licence IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hr_identity_document_types t
        WHERE t.id=licence AND t.code='DRIVING_LICENSE' AND t.is_active AND t.deleted_at IS NULL))
    OR (site_access IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hr_access_card_types t
        WHERE t.id=site_access AND t.is_active AND t.deleted_at IS NULL))
    OR (employee_class IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.hr_employee_categories t
        WHERE t.id=employee_class AND t.is_active AND t.deleted_at IS NULL))
  THEN RAISE EXCEPTION 'Select valid Fleet policy dates and current requirements' USING ERRCODE='22023'; END IF;
  INSERT INTO erp_private.fleet_availability_policies(company_id,category,valid_during,routine_minutes,signed_handover,
    registration_required,insurance_required,tentative_allowed,licence_type_id,access_type_id,employee_category_id,prepared_by,reason)
  VALUES(p_company,p_data->>'category',daterange(from_day,last_day+1,'[)'),(p_data->>'routine_minutes')::integer,
     (p_data->>'signed_handover')::boolean,(p_data->>'registration_required')::boolean,(p_data->>'insurance_required')::boolean,(p_data->>'tentative_allowed')::boolean,
     licence,site_access,employee_class,actor,explanation) RETURNING * INTO row_data;
 ELSE
  SELECT * INTO row_data FROM erp_private.fleet_availability_policies cp WHERE cp.id=(p_data->>'id')::bigint
    AND cp.company_id=p_company FOR UPDATE;
  IF row_data.id IS NULL OR row_data.prepared_by=actor OR row_data.approved_at IS NOT NULL
  THEN RAISE EXCEPTION 'An independent approver must review the pending policy' USING ERRCODE='42501'; END IF;
  UPDATE erp_private.fleet_availability_policies cp SET approved_by=actor,approved_at=clock_timestamp(),approval_reason=explanation
    WHERE cp.id=row_data.id RETURNING * INTO row_data;
 END IF;
 RETURN erp_private.t02_save_receipt('fleet-policy',p_operation,req_hash,jsonb_build_object('id',row_data.id,
    'status',CASE WHEN row_data.approved_at IS NULL THEN 'pending' ELSE 'approved' END));
END;
$$;

CREATE OR REPLACE FUNCTION public.t06_fleet_command(p_operation uuid,p_asset bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE a erp_private.fleet_assets; current_scope record; c erp_private.fleet_commitments; new_c erp_private.fleet_commitments;
 loan erp_private.fleet_loan_approvals; hold erp_private.fleet_asset_holds; policy erp_private.fleet_availability_policies;
 employment erp_private.t03_employment_periods; req_hash text; receipt jsonb; gate jsonb; result jsonb;
 actor bigint:=public.current_user_profile_id(); company bigint; branch bigint; destination_company bigint; destination_branch bigint;
 employee bigint; site bigint; from_time timestamptz; end_time timestamptz; at_time timestamptz;
 explanation text:=btrim(p_data->>'reason'); kind text; mode text; cap text;
 target bigint:=(p_data->>'commitment')::bigint; loan_id bigint:=(p_data->>'approval')::bigint;
 revision integer:=(p_data->>'revision')::integer; needed_approval boolean;
BEGIN
 IF coalesce(p_action,'') NOT IN ('tentative','reserve','confirm','cancel','request-loan','approve-loan','checkout','return',
   'transfer','dispatch','place-hold','release-hold') OR NOT erp_private.t05_fields(p_data,ARRAY[
   'reason','commitment','revision','approval','employee','site','from','until','at','snapshot','handover','hold','kind'])
   OR coalesce(length(explanation),0) NOT BETWEEN 1 AND 500
 THEN RAISE EXCEPTION 'Complete the Fleet action and reason' USING ERRCODE='22023'; END IF;
 SELECT * INTO a FROM erp_private.fleet_assets fa WHERE fa.id=p_asset FOR UPDATE;
 IF NOT FOUND OR NOT erp_private.t06_custody_visible(a.id) THEN RAISE EXCEPTION 'Fleet asset unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO current_scope FROM erp_private.t06_operation_scope(a.id);
 company:=current_scope.company_id;
 branch:=current_scope.branch_id;
 IF target IS NOT NULL THEN
   SELECT * INTO c FROM erp_private.fleet_commitments item WHERE item.id=target AND item.asset_id=a.id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Fleet commitment unavailable' USING ERRCODE='42501'; END IF;
   company:=c.company_id; branch:=c.branch_id;
 END IF;
 IF loan_id IS NOT NULL THEN
   SELECT * INTO loan FROM erp_private.fleet_loan_approvals request WHERE request.id=loan_id AND request.asset_id=a.id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Fleet loan unavailable' USING ERRCODE='42501'; END IF;
   company:=loan.source_company_id;
   branch:=loan.source_branch_id;
 END IF;

 IF p_action IN ('place-hold','release-hold') THEN
  IF p_action='release-hold' THEN
   SELECT * INTO hold FROM erp_private.fleet_asset_holds h WHERE h.id=(p_data->>'hold')::bigint AND h.asset_id=a.id FOR UPDATE;
   kind:=hold.kind;
  ELSE kind:=p_data->>'kind'; END IF;
  cap:=CASE kind WHEN 'workshop' THEN 'fleet.holds.workshop' WHEN 'hse' THEN 'fleet.holds.hse' END;
  IF cap IS NULL OR NOT erp_private.t02_has_scope(cap,a.owner_company_id,a.home_branch_id)
  THEN RAISE EXCEPTION 'Exact Fleet hold authority is required' USING ERRCODE='42501'; END IF;
 ELSIF p_action='approve-loan' THEN
  IF loan.id IS NULL OR (loan.source_company_id=loan.destination_company_id AND NOT
    erp_private.t02_has_scope('fleet.custody.approve',loan.source_company_id,loan.source_branch_id))
    OR (loan.source_company_id<>loan.destination_company_id AND NOT
      (erp_private.t02_cross_company_custody_allowed(loan.source_company_id,loan.source_branch_id,loan.destination_company_id,loan.destination_branch_id)
        AND erp_private.t06_cross_approver_current(actor,loan.source_company_id,loan.source_branch_id,loan.destination_company_id,loan.destination_branch_id)))
   THEN RAISE EXCEPTION 'The current loan approval is outside your authority' USING ERRCODE='42501'; END IF;
 ELSE
  cap:=CASE WHEN p_action IN ('tentative','reserve','confirm','cancel','dispatch') THEN 'fleet.availability.plan' ELSE 'fleet.custody.manage' END;
  IF NOT erp_private.t02_has_scope(cap,company,branch) THEN
   RAISE EXCEPTION 'Fleet action unavailable in this scope' USING ERRCODE='42501'; END IF;
  IF p_action IN ('checkout','transfer') AND loan.id IS NOT NULL
    AND NOT erp_private.t02_has_scope('fleet.custody.manage',loan.destination_company_id,loan.destination_branch_id)
  THEN RAISE EXCEPTION 'Destination custody authority is required' USING ERRCODE='42501'; END IF;
 END IF;

 req_hash:=erp_private.t02_digest(jsonb_build_array(p_asset,p_action,p_data));
 receipt:=erp_private.t02_replay('fleet-custody',p_operation,req_hash);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;

 IF p_action='place-hold' THEN
  INSERT INTO erp_private.fleet_asset_holds(asset_id,kind,placed_at,placed_by,reason)
   VALUES(a.id,kind,clock_timestamp(),actor,explanation) RETURNING * INTO hold;
  result:=jsonb_build_object('id',hold.id,'status','held');
 ELSIF p_action='release-hold' THEN
  IF hold.released_at IS NOT NULL THEN RAISE EXCEPTION 'This hold has already been resolved' USING ERRCODE='PT409'; END IF;
  UPDATE erp_private.fleet_asset_holds h SET released_at=clock_timestamp(),released_by=actor,release_reason=explanation WHERE h.id=hold.id;
  result:=jsonb_build_object('id',hold.id,'status','released');
 ELSIF p_action='approve-loan' THEN
  IF loan.approved_at IS NOT NULL OR loan.planned_return<=statement_timestamp()
    OR (loan.source_company_id<>loan.destination_company_id AND actor=loan.requested_by)
  THEN RAISE EXCEPTION 'An independent, current cross-company loan decision is required' USING ERRCODE='PT409'; END IF;
  UPDATE erp_private.fleet_loan_approvals l SET approved_by=actor,approved_at=clock_timestamp(),approval_reason=explanation
    WHERE l.id=loan.id;
  result:=jsonb_build_object('id',loan.id,'status','approved');
 ELSIF p_action='return' THEN
  at_time:=(p_data->>'at')::timestamptz;
  IF c.id IS NULL OR c.status<>'active' OR revision IS DISTINCT FROM c.revision OR at_time IS NULL
    OR NOT isfinite(at_time) OR at_time<=lower(c.committed_during) OR at_time>statement_timestamp()
  THEN RAISE EXCEPTION 'Check the current checkout, version and actual return time' USING ERRCODE='PT409'; END IF;
  SELECT * INTO policy FROM erp_private.fleet_availability_policies cp WHERE cp.id=c.policy_id;
  PERFORM erp_private.t06_write_event(c.id,'return',at_time,explanation,p_data->'snapshot',policy.signed_handover);
  UPDATE erp_private.fleet_commitments item SET committed_during=tstzrange(lower(c.committed_during),at_time,'[)'),
    status='closed',revision=item.revision+1 WHERE item.id=c.id RETURNING * INTO new_c;
  result:=jsonb_build_object('id',new_c.id,'status','closed','revision',new_c.revision);
 ELSIF p_action='cancel' THEN
  IF c.id IS NULL OR c.kind<>'reservation' OR c.status NOT IN ('tentative','confirmed') OR revision IS DISTINCT FROM c.revision
  THEN RAISE EXCEPTION 'The reservation has changed' USING ERRCODE='PT409'; END IF;
  UPDATE erp_private.fleet_commitments item SET status='cancelled',revision=item.revision+1 WHERE item.id=c.id RETURNING * INTO new_c;
  PERFORM erp_private.t06_write_event(c.id,'cancel',clock_timestamp(),explanation,NULL,false);
  result:=jsonb_build_object('id',new_c.id,'status','cancelled','revision',new_c.revision);
 ELSE
  -- Resolve dates and employee from the exact approved loan or reservation
  -- whenever one is consumed. Source and destination are derived separately.
  IF c.id IS NOT NULL AND revision IS DISTINCT FROM c.revision
  THEN RAISE EXCEPTION 'The custody or reservation changed' USING ERRCODE='PT409'; END IF;
  IF loan.id IS NOT NULL AND p_action IN ('checkout','transfer') THEN
   IF loan.approved_at IS NULL OR loan.used_by_commitment IS NOT NULL
     OR loan.source_commitment_id IS DISTINCT FROM target OR loan.source_revision IS DISTINCT FROM c.revision
     OR ROW(current_scope.company_id,current_scope.branch_id) IS DISTINCT FROM ROW(loan.source_company_id,loan.source_branch_id)
     OR (loan.source_company_id<>loan.destination_company_id AND NOT erp_private.t06_cross_approver_current(
         loan.approved_by,loan.source_company_id,loan.source_branch_id,loan.destination_company_id,loan.destination_branch_id))
   THEN RAISE EXCEPTION 'The matching approved loan has changed or lost authority' USING ERRCODE='PT409'; END IF;
   employee:=loan.employee_id; site:=loan.site_id; from_time:=loan.planned_start; end_time:=loan.planned_return;
  ELSIF c.id IS NOT NULL AND c.kind='reservation' THEN
   employee:=c.employee_id; site:=c.site_id; from_time:=lower(c.committed_during); end_time:=c.planned_return;
  ELSE
   employee:=(p_data->>'employee')::bigint; site:=(p_data->>'site')::bigint;
   from_time:=(p_data->>'from')::timestamptz; end_time:=(p_data->>'until')::timestamptz;
  END IF;
  IF from_time IS NULL OR end_time IS NULL OR NOT isfinite(from_time) OR NOT isfinite(end_time)
     OR from_time>=end_time OR end_time-from_time>interval '366 days'
  THEN RAISE EXCEPTION 'Select valid handover and planned return dates' USING ERRCODE='22023'; END IF;
  IF p_action IN ('checkout','transfer','dispatch') AND p_data?'at' THEN
    at_time:=(p_data->>'at')::timestamptz;
    IF at_time IS NULL OR NOT isfinite(at_time) OR at_time<from_time OR at_time>=end_time
    THEN RAISE EXCEPTION 'Record the actual handover inside the authorized window' USING ERRCODE='22023'; END IF;
    from_time:=at_time;
  END IF;
  IF p_action IN ('checkout','transfer','dispatch') AND from_time>statement_timestamp()
  THEN RAISE EXCEPTION 'A physical handover cannot be recorded in the future' USING ERRCODE='22023'; END IF;
  IF p_action IN ('tentative','reserve','request-loan') AND end_time<=statement_timestamp()
  THEN RAISE EXCEPTION 'Select a planning window with a future return' USING ERRCODE='22023'; END IF;

  PERFORM 1 FROM public.employees e WHERE e.id=employee AND e.deleted_at IS NULL FOR SHARE;
  SELECT * INTO employment FROM erp_private.t06_work_period(employee,from_time,end_time);
  IF employment.id IS NULL THEN RAISE EXCEPTION 'Verified employment is required for this window' USING ERRCODE='42501'; END IF;
  destination_company:=employment.company_id; destination_branch:=employment.branch_id;
  IF destination_branch IS NULL OR NOT erp_private.t06_site_allowed(site,destination_company,destination_branch,
    (from_time AT TIME ZONE 'Asia/Dubai')::date,((end_time-interval '1 microsecond') AT TIME ZONE 'Asia/Dubai')::date)
  THEN RAISE EXCEPTION 'Employee and site must match an authorized operating scope' USING ERRCODE='42501'; END IF;
  IF p_action IN ('checkout','transfer','request-loan') AND NOT erp_private.t02_has_scope('fleet.custody.manage',destination_company,destination_branch)
  THEN RAISE EXCEPTION 'Destination custody authority is required' USING ERRCODE='42501'; END IF;
  IF p_action IN ('tentative','reserve','confirm','dispatch')
    AND ROW(destination_company,destination_branch) IS DISTINCT FROM ROW(company,branch)
  THEN RAISE EXCEPTION 'Planning requires the exact current operating scope' USING ERRCODE='42501'; END IF;

  IF p_action='request-loan' THEN
   IF loan.id IS NOT NULL OR (c.id IS NOT NULL AND (c.status<>'active' OR from_time<=lower(c.committed_during)))
   THEN RAISE EXCEPTION 'Loan must match the current custody and requested period' USING ERRCODE='PT409'; END IF;
   INSERT INTO erp_private.fleet_loan_approvals(asset_id,source_commitment_id,source_revision,source_company_id,source_branch_id,
    destination_company_id,destination_branch_id,employee_id,site_id,planned_start,planned_return,reason,requested_by)
   VALUES(a.id,c.id,c.revision,company,branch,destination_company,destination_branch,employee,site,from_time,end_time,explanation,actor)
   RETURNING * INTO loan;
   result:=jsonb_build_object('id',loan.id,'status','pending');
  ELSE
   IF p_action='confirm' AND (c.id IS NULL OR c.kind<>'reservation' OR c.status<>'tentative' OR c.planned_return<=statement_timestamp())
   THEN RAISE EXCEPTION 'Confirm a current tentative reservation' USING ERRCODE='PT409'; END IF;
   IF (p_action IN ('reserve','tentative') AND c.id IS NOT NULL)
      OR (p_action='transfer' AND (c.id IS NULL OR c.kind<>'custody' OR c.status<>'active' OR from_time<=lower(c.committed_during)))
      OR (p_action IN ('checkout','dispatch') AND c.id IS NOT NULL AND (c.kind<>'reservation' OR c.status<>'confirmed'))
   THEN RAISE EXCEPTION 'The selected commitment cannot be used for this action' USING ERRCODE='PT409'; END IF;
   IF p_action IN ('checkout','transfer','dispatch') AND end_time<statement_timestamp() AND from_time>statement_timestamp()-interval '5 minutes'
   THEN RAISE EXCEPTION 'Review the planned return before handover' USING ERRCODE='22023'; END IF;
   gate:=erp_private.t06_check_availability(a.id,employee,site,from_time,end_time,destination_company,destination_branch,c.id,
      p_action IN ('checkout','transfer','dispatch'));
   IF p_action<>'tentative' AND NOT (gate->>'available')::boolean
   THEN RAISE EXCEPTION 'Fleet availability changed: %',gate->'blockers' USING ERRCODE='PT409'; END IF;
   SELECT * INTO policy FROM erp_private.fleet_availability_policies cp WHERE cp.id=(gate->>'policy_id')::bigint;
   IF policy.id IS NULL THEN RAISE EXCEPTION 'An approved Fleet policy is required' USING ERRCODE='PT409'; END IF;
   IF p_action='tentative' AND NOT policy.tentative_allowed
   THEN RAISE EXCEPTION 'The approved Fleet policy does not allow tentative bookings' USING ERRCODE='PT409'; END IF;
   needed_approval:=ROW(company,branch) IS DISTINCT FROM ROW(destination_company,destination_branch)
     OR (from_time AT TIME ZONE 'Asia/Dubai')::date<>((end_time-interval '1 microsecond') AT TIME ZONE 'Asia/Dubai')::date
     OR end_time-from_time>make_interval(mins=>policy.routine_minutes);
   IF p_action IN ('checkout','transfer') AND needed_approval AND loan.id IS NULL
   THEN RAISE EXCEPTION 'An approved overnight, extended or cross-scope loan is required' USING ERRCODE='PT409'; END IF;
   IF loan.id IS NOT NULL AND ROW(destination_company,destination_branch) IS DISTINCT FROM ROW(loan.destination_company_id,loan.destination_branch_id)
   THEN RAISE EXCEPTION 'The receiving employee scope changed after loan approval' USING ERRCODE='PT409'; END IF;

   IF p_action='confirm' THEN
    UPDATE erp_private.fleet_commitments item SET status='confirmed',revision=item.revision+1 WHERE item.id=c.id RETURNING * INTO new_c;
    PERFORM erp_private.t06_write_event(c.id,'confirm',clock_timestamp(),explanation,NULL,false);
   ELSE
    IF p_action='transfer' THEN
      PERFORM erp_private.t06_write_event(c.id,'transfer-out',from_time,explanation,p_data->'snapshot',policy.signed_handover);
      UPDATE erp_private.fleet_commitments item SET status='closed',revision=item.revision+1,
        committed_during=tstzrange(lower(c.committed_during),from_time,'[)') WHERE item.id=c.id;
    ELSIF c.id IS NOT NULL THEN
      UPDATE erp_private.fleet_commitments item SET status='cancelled',revision=item.revision+1 WHERE item.id=c.id;
      PERFORM erp_private.t06_write_event(c.id,'cancel',clock_timestamp(),'Converted to actual commitment: '||explanation,NULL,false);
    END IF;
    mode:=CASE WHEN p_action='dispatch' THEN 'dispatch' WHEN p_action IN ('checkout','transfer') THEN 'custody' ELSE 'reservation' END;
    INSERT INTO erp_private.fleet_commitments(asset_id,employee_id,employment_period_id,company_id,branch_id,site_id,kind,status,
     committed_during,planned_return,verified_driver_id,policy_id,predecessor_id,created_by)
    VALUES(a.id,employee,employment.id,destination_company,destination_branch,site,mode,
      CASE WHEN mode<>'reservation' THEN 'active' WHEN p_action='reserve' THEN 'confirmed' ELSE 'tentative' END,
      tstzrange(from_time,CASE WHEN mode='reservation' THEN end_time ELSE NULL END,'[)'),end_time,
      CASE WHEN mode='dispatch' THEN employee END,policy.id,c.id,actor) RETURNING * INTO new_c;
    PERFORM erp_private.t06_write_event(new_c.id,CASE WHEN p_action='transfer' THEN 'transfer-in' ELSE p_action END,
      CASE WHEN mode='reservation' THEN clock_timestamp() ELSE from_time END,explanation,
      CASE WHEN p_action='transfer' THEN p_data->'handover' ELSE p_data->'snapshot' END,policy.signed_handover);
    IF loan.id IS NOT NULL THEN UPDATE erp_private.fleet_loan_approvals SET used_by_commitment=new_c.id WHERE id=loan.id; END IF;
   END IF;
   result:=jsonb_build_object('id',new_c.id,'status',new_c.status,'revision',new_c.revision);
  END IF;
 END IF;
 RETURN erp_private.t02_save_receipt('fleet-custody',p_operation,req_hash,result||jsonb_build_object('asset_id',a.id));
END;
$$;

REVOKE ALL ON FUNCTION erp_private.t06_cross_approver_current(bigint,bigint,bigint,bigint,bigint),
 erp_private.t06_write_event(bigint,text,timestamptz,text,jsonb,boolean),erp_private.t06_keep_signed_link(),
 public.t06_fleet_policy(uuid,bigint,text,jsonb),public.t06_fleet_command(uuid,bigint,text,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t06_fleet_policy(uuid,bigint,text,jsonb),public.t06_fleet_command(uuid,bigint,text,jsonb) TO authenticated;

COMMIT;
