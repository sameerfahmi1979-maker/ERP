BEGIN;

CREATE FUNCTION erp_private.t10_text(p_data jsonb,p_key text,p_limit integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE value text:=btrim(p_data->>p_key);
BEGIN
 IF jsonb_typeof(p_data->p_key) IS DISTINCT FROM 'string' OR coalesce(length(value),0) NOT BETWEEN 1 AND p_limit THEN
  RAISE EXCEPTION 'Complete % before saving',replace(p_key,'_',' ') USING ERRCODE='22023';
 END IF;
 RETURN value;
END;
$$;

CREATE FUNCTION erp_private.t10_amount(p_data jsonb,p_key text)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE value numeric:=(p_data->>p_key)::numeric;
BEGIN
 IF jsonb_typeof(p_data->p_key) IS DISTINCT FROM 'number' OR value<0 OR value>=1e12 OR value<>round(value,2) THEN
  RAISE EXCEPTION 'Enter a valid AED amount to two decimal places' USING ERRCODE='22023';
 END IF;
 RETURN value;
END;
$$;

CREATE FUNCTION erp_private.t10_append_job(p_job erp_private.t10_job_cycles,p_operation text,p_actor bigint,p_reason text)
RETURNS void LANGUAGE sql SET search_path='' AS $$
 INSERT INTO erp_private.t10_job_events(job_cycle_id,revision,operation,actor_id,reason,facts)
 VALUES(p_job.id,p_job.revision,p_operation,p_actor,p_reason,to_jsonb(p_job));
$$;

CREATE FUNCTION erp_private.t10_release_hold(p_hold bigint,p_actor bigint,p_reason text)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 UPDATE erp_private.fleet_asset_holds SET released_at=clock_timestamp(),released_by=p_actor,release_reason=p_reason
 WHERE id=p_hold AND kind='workshop' AND released_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'This Workshop hold has already changed' USING ERRCODE='PT409'; END IF;
END;
$$;

CREATE FUNCTION public.t10_workshop_command(p_operation uuid,p_asset bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE asset erp_private.fleet_assets; assessment erp_private.t10_assessments; job erp_private.t10_job_cycles;
 scope record; operating record; commitment erp_private.fleet_commitments; employment erp_private.t03_employment_periods;
 actor bigint:=public.current_user_profile_id(); cap text; note text; digest text; receipt jsonb; keys text[];
 evidence jsonb:=p_data->'evidence'; finding_kind text; finding_reference text; at_time timestamptz; end_time timestamptz;
 hold bigint; worker bigint; referral text; job_state text; decision text; warrant text; warranty_date date; cost numeric; clock_id bigint; service_version bigint;
BEGIN
 keys:=CASE p_action
  WHEN 'report' THEN ARRAY['kind','reference','occurred','commitment','evidence','clock']
  WHEN 'assess' THEN ARRAY['outcome','responsibility']
  WHEN 'plan' THEN ARRAY['job','revision','worker','starts','ends','estimate']
  WHEN 'start' THEN ARRAY['job','revision','occurred']
  WHEN 'submit-qc' THEN ARRAY['job','revision','occurred','actual_work','cost','warranty','warranty_until']
  WHEN 'return-to-work' THEN ARRAY['job','revision']
  WHEN 'release' THEN ARRAY['job','revision','occurred','evidence','return_reference']
  WHEN 'reopen' THEN ARRAY['job','revision']
 END;
 IF p_operation IS NULL OR keys IS NULL OR NOT erp_private.t05_fields(p_data,keys||ARRAY['assessment','reason']) THEN
  RAISE EXCEPTION 'Select a valid Workshop action' USING ERRCODE='22023';
 END IF;
 note:=erp_private.t10_text(p_data,'reason',1000);
 SELECT * INTO asset FROM erp_private.fleet_assets WHERE id=p_asset FOR UPDATE;
 IF asset.id IS NULL THEN RAISE EXCEPTION 'Workshop record unavailable' USING ERRCODE='42501'; END IF;
 IF p_action='report' THEN
  SELECT * INTO scope FROM erp_private.t06_operation_scope(asset.id);
  cap:='fleet.inspections.report';
 ELSE
  SELECT * INTO assessment FROM erp_private.t10_assessments
   WHERE id=(p_data->>'assessment')::bigint AND asset_id=asset.id FOR UPDATE;
  SELECT assessment.company_id AS company_id,assessment.branch_id AS branch_id INTO scope;
  cap:=CASE p_action WHEN 'assess' THEN 'workshop.assess'
    WHEN 'release' THEN 'workshop.jobs.release' WHEN 'return-to-work' THEN 'workshop.jobs.release'
    WHEN 'reopen' THEN 'workshop.jobs.release' ELSE 'workshop.jobs.manage' END;
 END IF;
 IF scope.company_id IS NULL OR NOT erp_private.t02_has_scope(cap,scope.company_id,scope.branch_id) THEN
  RAISE EXCEPTION 'Workshop action unavailable in this scope' USING ERRCODE='42501';
 END IF;
 digest:=erp_private.t02_digest(jsonb_build_array(asset.id,p_action,p_data));
 receipt:=erp_private.t02_replay('workshop-t10',p_operation,digest);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;
 IF p_action='reopen' THEN
  SELECT * INTO operating FROM erp_private.t06_operation_scope(asset.id);
  IF operating.company_id IS NULL OR ROW(operating.company_id,operating.branch_id) IS DISTINCT FROM ROW(scope.company_id,scope.branch_id)
     AND NOT erp_private.t02_has_scope('workshop.jobs.release',operating.company_id,operating.branch_id) THEN
   RAISE EXCEPTION 'Current operating-scope authority is required to place a new hold' USING ERRCODE='42501';
  END IF;
 END IF;
 IF p_action IN('report','reopen') AND asset.status<>'active' THEN
  RAISE EXCEPTION 'The asset must be active to place a new Workshop hold' USING ERRCODE='PT409';
 END IF;
 IF p_action='report' THEN
  finding_kind:=p_data->>'kind'; finding_reference:=lower(erp_private.t10_text(p_data,'reference',150));
  at_time:=(p_data->>'occurred')::timestamptz;
  IF coalesce(finding_kind,'') NOT IN('inspection','incident','reported-failure','planned-service')
   OR at_time IS NULL OR NOT isfinite(at_time) OR at_time>statement_timestamp() THEN
   RAISE EXCEPTION 'Select a finding source and actual occurrence time' USING ERRCODE='22023';
  END IF;
  IF finding_kind='planned-service' THEN
   SELECT c.id,v.id INTO clock_id,service_version FROM erp_private.t10_service_clocks c
   JOIN LATERAL(SELECT rule.id,rule.created_at FROM erp_private.t10_service_versions rule
     WHERE rule.clock_id=c.id ORDER BY rule.id DESC LIMIT 1) v ON true
   WHERE c.id=(p_data->>'clock')::bigint AND c.asset_id=asset.id;
   IF service_version IS NULL OR EXISTS(SELECT 1 FROM erp_private.t10_assessments f
    JOIN erp_private.t10_service_versions issued ON issued.id=f.service_version_id
    JOIN erp_private.t10_service_versions current_rule ON current_rule.id=service_version
    WHERE f.service_clock_id=current_rule.clock_id AND f.outcome IS DISTINCT FROM 'usable-as-is'
     AND ROW(issued.base_day,issued.base_value,issued.last_service_job) IS NOT DISTINCT FROM
      ROW(current_rule.base_day,current_rule.base_value,current_rule.last_service_job)) THEN
    RAISE EXCEPTION 'Use the current service clock and its existing job before requesting another' USING ERRCODE='PT409';
   END IF;
  ELSIF p_data->>'clock' IS NOT NULL THEN
   RAISE EXCEPTION 'Select the clock only for planned service' USING ERRCODE='22023';
  END IF;
  IF p_data->>'commitment' IS NOT NULL THEN
   SELECT * INTO commitment FROM erp_private.fleet_commitments c
   WHERE c.id=(p_data->>'commitment')::bigint AND c.asset_id=asset.id AND c.kind IN('custody','dispatch')
    AND ROW(c.company_id,c.branch_id)=ROW(scope.company_id,scope.branch_id)
    AND c.committed_during @> at_time;
   IF NOT FOUND THEN RAISE EXCEPTION 'The custody record does not match the finding' USING ERRCODE='PT409'; END IF;
  END IF;
  IF evidence IS NOT NULL AND NOT erp_private.t10_original(asset.id,evidence,ARRAY['FLEET_WORKSHOP_FINDING','FLEET_PRE_TRIP_INSPECTION']) THEN
   RAISE EXCEPTION 'Select a current verified Fleet finding original for this asset' USING ERRCODE='PT409';
  END IF;
  IF EXISTS(SELECT 1 FROM erp_private.t10_assessments a WHERE a.asset_id=asset.id AND a.source_kind=finding_kind AND a.source_ref=finding_reference) THEN
   RAISE EXCEPTION 'This finding already has a Workshop assessment' USING ERRCODE='PT409';
  END IF;
  INSERT INTO erp_private.fleet_asset_holds(asset_id,kind,placed_at,placed_by,reason)
  VALUES(asset.id,'workshop',clock_timestamp(),actor,'Workshop assessment required') RETURNING id INTO hold;
  INSERT INTO erp_private.t10_assessments(asset_id,company_id,branch_id,source_kind,source_ref,commitment_id,service_clock_id,service_version_id,
   document_id,version_id,file_id,occurred_at,reported_by,finding,first_hold_id)
  VALUES(asset.id,scope.company_id,scope.branch_id,finding_kind,finding_reference,commitment.id,clock_id,service_version,
   (evidence->>'document')::bigint,(evidence->>'version')::bigint,(evidence->>'file')::bigint,at_time,actor,note,hold)
  RETURNING * INTO assessment;
 ELSIF p_action='assess' THEN
  decision:=p_data->>'outcome';
  IF assessment.assessed_at IS NOT NULL OR actor=assessment.reported_by
     OR coalesce(decision,'') NOT IN('usable-as-is','repair') THEN
   RAISE EXCEPTION 'A current finding requires an independent Workshop diagnosis' USING ERRCODE='PT409';
  END IF;
  IF p_data->>'responsibility' IS NOT NULL THEN
   referral:=erp_private.t10_text(p_data,'responsibility',1000);
   SELECT e.* INTO employment FROM erp_private.fleet_commitments c
   JOIN erp_private.t03_employment_periods e ON e.id=c.employment_period_id AND e.employee_id=c.employee_id
    AND e.work_period @> (assessment.occurred_at AT TIME ZONE 'Asia/Dubai')::date
   WHERE c.id=assessment.commitment_id AND c.kind IN('custody','dispatch');
   IF employment.id IS NULL OR assessment.document_id IS NULL
     OR NOT erp_private.document_permission(assessment.document_id,'dms.documents.preview') THEN
    RAISE EXCEPTION 'Verified employee custody and its retained evidence are required for an HR referral' USING ERRCODE='PT409';
   END IF;
   INSERT INTO erp_private.t10_hr_referrals(assessment_id,employee_id,employment_id,company_id,branch_id,referred_by,reason)
   VALUES(assessment.id,employment.employee_id,employment.id,employment.company_id,employment.branch_id,actor,referral);
  END IF;
  UPDATE erp_private.t10_assessments SET outcome=decision,assessed_by=actor,assessed_at=clock_timestamp(),diagnosis=note
   WHERE id=assessment.id RETURNING * INTO assessment;
  IF decision='usable-as-is' THEN
   PERFORM erp_private.t10_release_hold(assessment.first_hold_id,actor,note);
  ELSE
   INSERT INTO erp_private.t10_job_cycles(assessment_id,cycle,hold_id,state,opened_by,scope_of_work)
   VALUES(assessment.id,1,assessment.first_hold_id,'triage',actor,note) RETURNING * INTO job;
   PERFORM erp_private.t10_append_job(job,'open',actor,note);
  END IF;
 ELSE
  SELECT * INTO job FROM erp_private.t10_job_cycles j WHERE j.assessment_id=assessment.id ORDER BY j.cycle DESC LIMIT 1 FOR UPDATE;
  IF job.id IS NULL OR job.id IS DISTINCT FROM (p_data->>'job')::bigint
   OR job.revision IS DISTINCT FROM (p_data->>'revision')::integer THEN
   RAISE EXCEPTION 'Reload the current Workshop job cycle' USING ERRCODE='PT409';
  END IF;
  job_state:=CASE p_action WHEN 'plan' THEN 'planned' WHEN 'start' THEN 'in-progress' WHEN 'submit-qc' THEN 'qc'
   WHEN 'return-to-work' THEN 'in-progress' WHEN 'release' THEN 'closed' WHEN 'reopen' THEN 'triage' END;
  IF (p_action='plan' AND job.state NOT IN('triage','planned'))
   OR (p_action='start' AND job.state<>'planned')
   OR (p_action='submit-qc' AND job.state<>'in-progress')
   OR (p_action IN('return-to-work','release') AND (job.state<>'qc' OR actor=job.submitted_by))
   OR (p_action='reopen' AND job.state<>'closed') THEN
   RAISE EXCEPTION 'The job state or independent QC decision is invalid' USING ERRCODE='PT409';
  END IF;
  at_time:=(p_data->>'occurred')::timestamptz;
  IF p_action IN('start','submit-qc','release') AND (at_time IS NULL OR NOT isfinite(at_time)
     OR at_time>statement_timestamp() OR at_time<assessment.occurred_at
     OR (p_action='submit-qc' AND at_time<=job.actual_start) OR (p_action='release' AND at_time<job.actual_end)) THEN
   RAISE EXCEPTION 'Enter the actual time in work sequence' USING ERRCODE='22023';
  END IF;
  IF p_action='plan' THEN
   at_time:=(p_data->>'starts')::timestamptz; end_time:=(p_data->>'ends')::timestamptz; worker:=(p_data->>'worker')::bigint;
   cost:=erp_private.t10_amount(p_data,'estimate');
   IF at_time IS NULL OR end_time IS NULL OR NOT isfinite(at_time) OR NOT isfinite(end_time) OR end_time<=at_time
    OR NOT EXISTS(SELECT 1 FROM erp_private.t03_employment_periods e JOIN public.employees w ON w.id=e.employee_id
     WHERE e.employee_id=worker AND e.company_id=assessment.company_id AND e.branch_id=assessment.branch_id
      AND w.deleted_at IS NULL AND w.employee_status IN('active','probation')
      AND e.work_period @> (at_time AT TIME ZONE 'Asia/Dubai')::date
      AND e.work_period @> ((end_time-interval '1 microsecond') AT TIME ZONE 'Asia/Dubai')::date) THEN
    RAISE EXCEPTION 'Use a named Workshop assignee with current employment in this scope and a valid work window' USING ERRCODE='PT409';
   END IF;
  ELSIF p_action='submit-qc' THEN
   PERFORM erp_private.t10_text(p_data,'actual_work',2000);
   cost:=erp_private.t10_amount(p_data,'cost');
   warranty_date:=(p_data->>'warranty_until')::date;
   IF p_data->>'warranty' IS NOT NULL OR warranty_date IS NOT NULL THEN
    warrant:=erp_private.t10_text(p_data,'warranty',150);
    IF warranty_date IS NULL OR NOT isfinite(warranty_date) OR warranty_date<(at_time AT TIME ZONE 'Asia/Dubai')::date THEN
     RAISE EXCEPTION 'Enter the warranty reference and valid end date' USING ERRCODE='22023';
    END IF;
   END IF;
  ELSIF p_action='release' AND (
   p_data->>'return_reference' IS DISTINCT FROM 'WO-'||assessment.id||'/'||job.cycle
   OR NOT erp_private.t10_original(asset.id,evidence,ARRAY['FLEET_WORKSHOP_RETURN'])
   OR EXISTS(SELECT 1 FROM erp_private.t10_job_cycles recorded WHERE recorded.return_document_id=(evidence->>'document')::bigint)
  ) THEN
   RAISE EXCEPTION 'Match a new, current verified returned-equipment original to this job and cycle' USING ERRCODE='PT409';
  END IF;
  IF p_action='reopen' THEN
   INSERT INTO erp_private.fleet_asset_holds(asset_id,kind,placed_at,placed_by,reason)
   VALUES(asset.id,'workshop',clock_timestamp(),actor,'Reopened Workshop job') RETURNING id INTO hold;
   INSERT INTO erp_private.t10_job_cycles(assessment_id,cycle,hold_id,state,opened_by,scope_of_work)
   VALUES(assessment.id,job.cycle+1,hold,job_state,actor,note) RETURNING * INTO job;
  ELSE
   UPDATE erp_private.t10_job_cycles j SET state=job_state,revision=j.revision+1,
    assigned_employee_id=coalesce(worker,j.assigned_employee_id),
    planned_start=CASE WHEN p_action='plan' THEN at_time ELSE j.planned_start END,
    planned_end=coalesce(end_time,j.planned_end),
    estimate_aed=CASE WHEN p_action='plan' THEN cost ELSE j.estimate_aed END,
    actual_start=CASE WHEN p_action='start' THEN at_time ELSE j.actual_start END,
    actual_end=CASE WHEN p_action='submit-qc' THEN at_time WHEN p_action='return-to-work' THEN NULL ELSE j.actual_end END,
    actual_work=CASE WHEN p_action='submit-qc' THEN btrim(p_data->>'actual_work') ELSE j.actual_work END,
    actual_cost_aed=CASE WHEN p_action='submit-qc' THEN cost ELSE j.actual_cost_aed END,
    warranty_ref=CASE WHEN p_action='submit-qc' THEN warrant ELSE j.warranty_ref END,
    warranty_until=CASE WHEN p_action='submit-qc' THEN warranty_date ELSE j.warranty_until END,
    submitted_by=CASE WHEN p_action='submit-qc' THEN actor WHEN p_action='return-to-work' THEN NULL ELSE j.submitted_by END,
    qc_by=CASE WHEN p_action IN('release','return-to-work') THEN actor ELSE j.qc_by END,
    qc_notes=CASE WHEN p_action IN('release','return-to-work') THEN note ELSE j.qc_notes END,
    returned_at=CASE WHEN p_action='release' THEN at_time ELSE NULL END,
    return_document_id=(evidence->>'document')::bigint,return_version_id=(evidence->>'version')::bigint,
    return_file_id=(evidence->>'file')::bigint,
    closed_at=CASE WHEN p_action='release' THEN clock_timestamp() ELSE NULL END
   WHERE j.id=job.id RETURNING * INTO job;
  END IF;
  PERFORM erp_private.t10_append_job(job,p_action,actor,note);
  IF p_action='release' THEN PERFORM erp_private.t10_release_hold(job.hold_id,actor,note); END IF;
 END IF;
 RETURN erp_private.t02_save_receipt('workshop-t10',p_operation,digest,jsonb_build_object('assessment',assessment.id,
  'job',job.id,'cycle',job.cycle,'state',coalesce(job.state,assessment.outcome,'waiting-assessment')));
END;
$$;

REVOKE ALL ON FUNCTION erp_private.t10_text(jsonb,text,integer),erp_private.t10_amount(jsonb,text),
 erp_private.t10_append_job(erp_private.t10_job_cycles,text,bigint,text),erp_private.t10_release_hold(bigint,bigint,text),
 public.t10_workshop_command(uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t10_workshop_command(uuid,bigint,text,jsonb) TO authenticated;
COMMIT;
