BEGIN;

CREATE TABLE erp_private.t10_service_clocks (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 asset_id bigint NOT NULL REFERENCES erp_private.fleet_assets(id),
 label text NOT NULL CHECK(length(btrim(label)) BETWEEN 1 AND 100),
 unit text NOT NULL CHECK(unit IN('days','km','hours','cycles','usage-hours')),
 UNIQUE(asset_id,label,unit)
);
CREATE INDEX t10_clocks_asset ON erp_private.t10_service_clocks(asset_id,id);

CREATE TABLE erp_private.t10_service_versions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 clock_id bigint NOT NULL REFERENCES erp_private.t10_service_clocks(id),
 base_day date NOT NULL,
 base_value numeric(14,3) NOT NULL CHECK(base_value>=0),
 interval_value numeric(14,3) NOT NULL CHECK(interval_value>0),
 notice numeric(14,3) NOT NULL CHECK(notice>=0 AND notice<interval_value),
 tolerance numeric(14,3) NOT NULL CHECK(tolerance>=0 AND tolerance<interval_value),
 reading_max_age integer NOT NULL CHECK(reading_max_age BETWEEN 1 AND 3650),
 block_overdue boolean NOT NULL,
 reminder_active boolean NOT NULL DEFAULT false,
 last_service_job bigint REFERENCES erp_private.t10_job_cycles(id),
 previous_service_status jsonb,
 created_by bigint NOT NULL REFERENCES public.user_profiles(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 action text NOT NULL CHECK(action IN('create','edit','activate-reminder','deactivate-reminder','record-service')),
 reason text NOT NULL
);
ALTER TABLE erp_private.t10_assessments
 ADD FOREIGN KEY(service_clock_id) REFERENCES erp_private.t10_service_clocks(id),
 ADD FOREIGN KEY(service_version_id) REFERENCES erp_private.t10_service_versions(id);
CREATE INDEX t10_assessment_service_clock ON erp_private.t10_assessments(service_clock_id,service_version_id)
 WHERE service_clock_id IS NOT NULL;
CREATE INDEX t10_service_versions_current ON erp_private.t10_service_versions(clock_id,id DESC);
CREATE UNIQUE INDEX t10_service_visit ON erp_private.t10_service_versions(clock_id,last_service_job)
 WHERE action='record-service';

CREATE TABLE erp_private.t10_meter_observations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 asset_id bigint NOT NULL REFERENCES erp_private.fleet_assets(id),
 unit text NOT NULL CHECK(unit IN('km','hours','cycles','usage-hours')),
 value numeric(14,3) CHECK(value>=0),
 observed_at timestamptz NOT NULL,
 reference text NOT NULL,
 reason text NOT NULL,
 observed_by bigint NOT NULL REFERENCES public.user_profiles(id),
 UNIQUE(asset_id,unit,observed_at),
 UNIQUE(asset_id,unit,reference)
);
CREATE INDEX t10_observation_current ON erp_private.t10_meter_observations(asset_id,unit,observed_at DESC);

ALTER TABLE erp_private.t10_service_clocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t10_service_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t10_meter_observations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t10_service_clocks,erp_private.t10_service_versions,
 erp_private.t10_meter_observations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.t10_meter_at(p_asset bigint,p_unit text,p_asof timestamptz,p_next boolean DEFAULT false,p_known boolean DEFAULT false)
RETURNS TABLE(value numeric,observed_at timestamptz) LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT facts.value,facts.observed FROM (
  SELECT o.value,o.observed_at AS observed,3 AS priority FROM erp_private.t10_meter_observations o
  WHERE o.asset_id=p_asset AND o.unit=p_unit
  UNION ALL
  SELECT e.meter,e.occurred_at,2 FROM erp_private.fleet_custody_events e
  JOIN erp_private.fleet_commitments c ON c.id=e.commitment_id
  WHERE c.asset_id=p_asset AND e.meter_unit=p_unit AND e.meter IS NOT NULL
  UNION ALL
  SELECT m.value,(m.observed_on::timestamp AT TIME ZONE 'Asia/Dubai'),1
  FROM erp_private.fleet_asset_meters m WHERE m.asset_id=p_asset AND m.unit=p_unit
   AND NOT EXISTS(SELECT 1 FROM erp_private.fleet_asset_meters replacement WHERE replacement.replaces_id=m.id
    AND (replacement.observed_on::timestamp AT TIME ZONE 'Asia/Dubai')<=p_asof)
 ) facts WHERE ((NOT p_next AND facts.observed<=p_asof) OR (p_next AND facts.observed>p_asof))
 AND (NOT p_known OR facts.value IS NOT NULL)
 ORDER BY CASE WHEN p_next THEN facts.observed END ASC, facts.observed DESC, facts.priority DESC, facts.value DESC
 LIMIT 1;
$$;

CREATE FUNCTION erp_private.t10_service_status(p_clock erp_private.t10_service_clocks,
 p_rule erp_private.t10_service_versions,p_until date,p_observed_at timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE meter_value numeric; meter_at timestamptz; progress numeric; remaining numeric; due_day date; status text; unavailable text; overdue_known boolean:=false;
 today date:=(p_observed_at AT TIME ZONE 'Asia/Dubai')::date;
BEGIN
 IF p_until<p_rule.base_day THEN unavailable:='before-baseline';
 ELSIF p_clock.unit='days' THEN
  progress:=p_until-p_rule.base_day;
  due_day:=p_rule.base_day+p_rule.interval_value::integer;
 ELSE
  SELECT m.value,m.observed_at INTO meter_value,meter_at FROM erp_private.t10_meter_at(p_clock.asset_id,p_clock.unit,p_observed_at) m;
  IF meter_at IS NULL OR meter_value IS NULL THEN unavailable:='reading-missing';
  ELSIF (meter_at AT TIME ZONE 'Asia/Dubai')::date<p_rule.base_day THEN unavailable:='reading-before-baseline';
  ELSIF today-(meter_at AT TIME ZONE 'Asia/Dubai')::date>p_rule.reading_max_age THEN unavailable:='reading-stale';
  ELSIF meter_value<p_rule.base_value THEN unavailable:='reading-below-baseline';
  ELSE progress:=meter_value-p_rule.base_value; END IF;
 END IF;
 remaining:=p_rule.interval_value-progress;
 status:=CASE WHEN unavailable IS NOT NULL THEN 'unavailable'
  WHEN remaining<0 THEN 'overdue' WHEN remaining=0 THEN 'due'
  WHEN remaining<=p_rule.notice THEN 'upcoming' ELSE 'current' END;
 -- Retiring a known overdue reading does not substantiate a technical release.
 IF status='unavailable' AND p_clock.unit<>'days' AND p_rule.block_overdue AND p_until>=p_rule.base_day THEN
  SELECT m.value,m.observed_at INTO meter_value,meter_at
  FROM erp_private.t10_meter_at(p_clock.asset_id,p_clock.unit,p_observed_at,false,true) m;
  overdue_known:=coalesce((meter_at AT TIME ZONE 'Asia/Dubai')::date>=p_rule.base_day
    AND meter_value>p_rule.base_value+p_rule.interval_value,false);
 END IF;
 RETURN jsonb_build_object('status',status,'unavailable',unavailable,'remaining',remaining,
  'due_day',due_day,'due_reading',CASE WHEN p_clock.unit<>'days' THEN p_rule.base_value+p_rule.interval_value END,
  'observed',CASE WHEN p_clock.unit<>'days' AND unavailable IS NULL THEN meter_value END,
  'blocking',p_rule.block_overdue AND (status='overdue' OR overdue_known),'reminder_active',p_rule.reminder_active);
END;
$$;

CREATE FUNCTION erp_private.t10_maintenance_blocking(p_asset bigint,p_until date) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM erp_private.t10_service_clocks c
 JOIN LATERAL(SELECT v.* FROM erp_private.t10_service_versions v WHERE v.clock_id=c.id ORDER BY v.id DESC LIMIT 1) r ON true
 WHERE c.asset_id=p_asset AND r.block_overdue AND
  (erp_private.t10_service_status(c,r,p_until,statement_timestamp())->>'blocking')::boolean);
$$;

CREATE FUNCTION erp_private.t10_measurement(p_data jsonb,p_key text,p_places integer)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE measured numeric:=(p_data->>p_key)::numeric;
BEGIN
 IF jsonb_typeof(p_data->p_key) IS DISTINCT FROM 'number' OR measured<0 OR measured>=1e11 OR measured<>round(measured,p_places) THEN
  RAISE EXCEPTION 'Enter % with up to % decimal places',replace(p_key,'_',' '),p_places USING ERRCODE='22023';
 END IF;
 RETURN measured;
END;
$$;

CREATE FUNCTION public.t10_maintenance_command(p_operation uuid,p_asset bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE asset erp_private.fleet_assets; scope record; service erp_private.t10_service_clocks;
 rule erp_private.t10_service_versions; service_rule erp_private.t10_service_versions; finished erp_private.t10_job_cycles;
 actor bigint:=public.current_user_profile_id(); digest text; receipt jsonb; keys text[];
 note text; label_text text; unit_text text; source text; places integer; value numeric; before_reading record; after_reading record;
 today date:=(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date; at_time timestamptz; saved bigint; prior jsonb;
BEGIN
 keys:=CASE p_action
  WHEN 'create' THEN ARRAY['label','unit','baseline_day','baseline_value','interval','notice','tolerance','max_age','block']
  WHEN 'edit' THEN ARRAY['clock','revision','interval','notice','tolerance','max_age','block']
  WHEN 'activate-reminder' THEN ARRAY['clock','revision']
  WHEN 'deactivate-reminder' THEN ARRAY['clock','revision']
  WHEN 'record-service' THEN ARRAY['clock','revision','job']
  WHEN 'reading' THEN ARRAY['unit','observed','value','reference']
 END;
 IF p_operation IS NULL OR keys IS NULL OR NOT erp_private.t05_fields(p_data,keys||'{"reason"}'::text[]) THEN
  RAISE EXCEPTION 'Select a valid maintenance action' USING ERRCODE='22023'; END IF;
 note:=erp_private.t10_text(p_data,'reason',1000);
 SELECT * INTO asset FROM erp_private.fleet_assets WHERE id=p_asset FOR UPDATE;
 SELECT * INTO scope FROM erp_private.t06_operation_scope(p_asset);
 IF asset.id IS NULL OR scope.company_id IS NULL OR NOT erp_private.t02_has_scope('fleet.maintenance.manage',scope.company_id,scope.branch_id) THEN
  RAISE EXCEPTION 'Fleet maintenance unavailable in this scope' USING ERRCODE='42501'; END IF;
 digest:=erp_private.t02_digest(jsonb_build_array(p_asset,p_action,p_data));
 receipt:=erp_private.t02_replay('maintenance-t10',p_operation,digest);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;
 IF asset.status<>'active' THEN RAISE EXCEPTION 'Select an active asset for maintenance' USING ERRCODE='PT409'; END IF;
 IF p_action='reading' THEN
  unit_text:=p_data->>'unit'; at_time:=(p_data->>'observed')::timestamptz;
  source:=lower(erp_private.t10_text(p_data,'reference',150));
  IF coalesce(unit_text,'') NOT IN('km','hours','cycles','usage-hours') OR at_time IS NULL OR NOT isfinite(at_time)
   OR at_time>statement_timestamp() OR NOT (p_data?'value') THEN
   RAISE EXCEPTION 'Enter an actual meter reading or explicitly mark it unavailable' USING ERRCODE='22023';
  END IF;
  IF p_data->'value'<>'null'::jsonb THEN
   value:=erp_private.t10_measurement(p_data,'value',CASE WHEN unit_text='cycles' THEN 0 ELSE 3 END);
   SELECT * INTO before_reading FROM erp_private.t10_meter_at(p_asset,unit_text,at_time,false,true);
   SELECT * INTO after_reading FROM erp_private.t10_meter_at(p_asset,unit_text,at_time,true,true);
   IF value<before_reading.value OR value>after_reading.value THEN
    RAISE EXCEPTION 'Reading conflicts with the retained meter timeline' USING ERRCODE='PT409';
   END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM erp_private.t10_meter_observations o WHERE o.asset_id=p_asset AND o.unit=unit_text
   AND (o.observed_at=at_time OR o.reference=source)) THEN
   RAISE EXCEPTION 'This meter occurrence or source reference is already recorded' USING ERRCODE='PT409';
  END IF;
  INSERT INTO erp_private.t10_meter_observations(asset_id,unit,value,observed_at,reference,reason,observed_by)
  VALUES(p_asset,unit_text,value,at_time,source,note,actor) RETURNING id INTO saved;
 ELSE
  IF p_action='create' THEN
   label_text:=erp_private.t10_text(p_data,'label',100); unit_text:=p_data->>'unit';
   rule.base_day:=(p_data->>'baseline_day')::date;
   IF coalesce(unit_text,'') NOT IN('days','km','hours','cycles','usage-hours')
    OR rule.base_day IS NULL OR NOT isfinite(rule.base_day) OR rule.base_day>today THEN
    RAISE EXCEPTION 'Enter the maintenance clock and documented baseline date' USING ERRCODE='22023';
   END IF;
   rule.base_value:=CASE WHEN unit_text='days' THEN 0 ELSE erp_private.t10_measurement(p_data,'baseline_value',CASE WHEN unit_text='cycles' THEN 0 ELSE 3 END) END;
   rule.reminder_active:=false;
   INSERT INTO erp_private.t10_service_clocks(asset_id,label,unit) VALUES(p_asset,label_text,unit_text) RETURNING * INTO service;
  ELSE
   SELECT * INTO service FROM erp_private.t10_service_clocks c WHERE c.id=(p_data->>'clock')::bigint AND c.asset_id=p_asset;
   SELECT * INTO rule FROM erp_private.t10_service_versions v WHERE v.clock_id=service.id ORDER BY v.id DESC LIMIT 1;
   IF rule.id IS NULL OR rule.id IS DISTINCT FROM (p_data->>'revision')::bigint THEN
    RAISE EXCEPTION 'Reload the current maintenance clock' USING ERRCODE='PT409';
   END IF;
   unit_text:=service.unit;
  END IF;
  IF p_action IN('create','edit') THEN
   places:=CASE WHEN unit_text IN('days','cycles') THEN 0 ELSE 3 END;
   rule.interval_value:=erp_private.t10_measurement(p_data,'interval',places);
   rule.notice:=erp_private.t10_measurement(p_data,'notice',places);
   rule.tolerance:=erp_private.t10_measurement(p_data,'tolerance',places);
   rule.reading_max_age:=erp_private.t10_measurement(p_data,'max_age',0);
   IF rule.interval_value=0 OR rule.notice>=rule.interval_value OR rule.tolerance>=rule.interval_value
    OR rule.reading_max_age NOT BETWEEN 1 AND 3650 OR (unit_text='days' AND rule.interval_value>36500)
    OR jsonb_typeof(p_data->'block') IS DISTINCT FROM 'boolean' THEN
    RAISE EXCEPTION 'Check the maintenance interval, notice, tolerance, reading age and blocking choice' USING ERRCODE='22023';
   END IF;
   rule.block_overdue:=(p_data->>'block')::boolean;
  ELSIF p_action='record-service' THEN
   SELECT j.* INTO finished FROM erp_private.t10_job_cycles j JOIN erp_private.t10_assessments a ON a.id=j.assessment_id
   WHERE a.asset_id=p_asset AND j.id=(p_data->>'job')::bigint AND j.state='closed'
    AND NOT EXISTS(SELECT 1 FROM erp_private.t10_job_cycles next WHERE next.assessment_id=j.assessment_id AND next.cycle>j.cycle)
    AND a.company_id=scope.company_id AND a.branch_id=scope.branch_id;
   SELECT v.* INTO service_rule FROM erp_private.t10_assessments a
   JOIN erp_private.t10_service_versions v ON v.id=a.service_version_id AND v.clock_id=a.service_clock_id
   WHERE a.id=finished.assessment_id AND a.service_clock_id=service.id;
   at_time:=finished.actual_end;
   IF service_rule.id IS NULL OR
    ROW(rule.base_day,rule.base_value,rule.last_service_job) IS DISTINCT FROM
    ROW(service_rule.base_day,service_rule.base_value,service_rule.last_service_job) OR at_time IS NULL OR (at_time AT TIME ZONE 'Asia/Dubai')::date<rule.base_day OR EXISTS(
    SELECT 1 FROM erp_private.t10_service_versions v WHERE v.clock_id=service.id AND v.last_service_job=finished.id) THEN
    RAISE EXCEPTION 'Use a technically released service job linked to this clock and baseline' USING ERRCODE='PT409';
   END IF;
   prior:=erp_private.t10_service_status(service,service_rule,(at_time AT TIME ZONE 'Asia/Dubai')::date,at_time);
   prior:=prior||jsonb_build_object('rule_version',service_rule.id,'completed_at',at_time,'tolerance',service_rule.tolerance,
    'compliance',CASE WHEN prior->>'remaining' IS NULL THEN 'unavailable'
     WHEN (prior->>'remaining')::numeric>=0 THEN 'on-time'
     WHEN (prior->>'remaining')::numeric>=-service_rule.tolerance THEN 'within-tolerance' ELSE 'late' END);
   IF unit_text<>'days' THEN
    SELECT * INTO before_reading FROM erp_private.t10_meter_at(p_asset,unit_text,at_time);
    IF before_reading.value IS NULL OR (before_reading.observed_at AT TIME ZONE 'Asia/Dubai')::date<>(at_time AT TIME ZONE 'Asia/Dubai')::date
      OR before_reading.value<rule.base_value THEN
     RAISE EXCEPTION 'Record the valid service-day reading before advancing this clock' USING ERRCODE='PT409';
    END IF;
    rule.base_value:=before_reading.value;
   END IF;
   rule.base_day:=(at_time AT TIME ZONE 'Asia/Dubai')::date;
   rule.last_service_job:=finished.id;
  ELSE
   rule.reminder_active:=p_action='activate-reminder';
  END IF;
  INSERT INTO erp_private.t10_service_versions(clock_id,base_day,base_value,interval_value,notice,tolerance,
   reading_max_age,block_overdue,reminder_active,last_service_job,previous_service_status,created_by,action,reason)
  VALUES(service.id,rule.base_day,rule.base_value,rule.interval_value,rule.notice,rule.tolerance,
   rule.reading_max_age,rule.block_overdue,rule.reminder_active,rule.last_service_job,prior,actor,p_action,note) RETURNING id INTO saved;
 END IF;
 RETURN erp_private.t02_save_receipt('maintenance-t10',p_operation,digest,
   jsonb_build_object('id',saved,'clock',service.id,'reminder_active',rule.reminder_active));
END;
$$;

REVOKE ALL ON FUNCTION erp_private.t10_meter_at(bigint,text,timestamptz,boolean,boolean),
 erp_private.t10_service_status(erp_private.t10_service_clocks,erp_private.t10_service_versions,date,timestamptz),
 erp_private.t10_maintenance_blocking(bigint,date),erp_private.t10_measurement(jsonb,text,integer),
 public.t10_maintenance_command(uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t10_maintenance_command(uuid,bigint,text,jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION erp_private.t06_check_availability(
 p_asset bigint,p_employee bigint,p_site bigint,p_from timestamptz,p_to timestamptz,
 p_company bigint,p_branch bigint,p_skip bigint,p_physical boolean)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE a erp_private.fleet_assets; employee erp_private.t03_employment_periods; policy erp_private.fleet_availability_policies;
 day_from date; day_until date; requested_span tstzrange; blockers text[]:='{}';
BEGIN
 IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to)
   OR p_from>=p_to OR p_to-p_from>interval '366 days'
 THEN RAISE EXCEPTION 'Enter a valid availability window' USING ERRCODE='22023'; END IF;
 day_from:=(p_from AT TIME ZONE 'Asia/Dubai')::date;
 day_until:=((p_to-interval '1 microsecond') AT TIME ZONE 'Asia/Dubai')::date;
 requested_span:=tstzrange(p_from,CASE WHEN p_physical THEN NULL ELSE p_to END,'[)');
 SELECT * INTO a FROM erp_private.fleet_assets WHERE id=p_asset;
 SELECT * INTO employee FROM erp_private.t06_work_period(p_employee,p_from,p_to);
 SELECT * INTO policy FROM erp_private.fleet_availability_policies cp WHERE cp.company_id=a.owner_company_id AND cp.category=a.category
   AND cp.approved_at IS NOT NULL AND cp.valid_during @> day_from AND cp.valid_during @> day_until;
 IF a.status IS DISTINCT FROM 'active' OR NOT EXISTS(
   SELECT 1 FROM erp_private.fleet_asset_history h WHERE h.asset_id=a.id AND h.kind='lifecycle'
     AND h.facts->>'status'='active' AND h.effective_on<=day_from
 ) THEN blockers:=array_append(blockers,'asset-unverified'); END IF;
 IF policy.id IS NULL THEN blockers:=array_append(blockers,'policy-missing'); END IF;
 IF employee.id IS NULL OR ROW(employee.company_id,employee.branch_id) IS DISTINCT FROM ROW(p_company,p_branch)
 THEN RETURN jsonb_build_object('available',false,'blockers',ARRAY['employee-scope'],'policy_id',policy.id,
   'employment_period_id',NULL,'as_of',statement_timestamp()); END IF;
 IF policy.employee_category_id IS NOT NULL AND policy.employee_category_id IS DISTINCT FROM employee.employee_category_id
 THEN blockers:=array_append(blockers,'worker-compatibility'); END IF;
 IF NOT erp_private.t06_site_allowed(p_site,p_company,p_branch,day_from,day_until)
 THEN blockers:=array_append(blockers,'site-scope'); END IF;
 IF EXISTS(SELECT 1 FROM erp_private.fleet_asset_holds h WHERE h.asset_id=p_asset AND h.kind='workshop' AND h.released_at IS NULL)
 THEN blockers:=array_append(blockers,'workshop-hold'); END IF;
 IF EXISTS(SELECT 1 FROM erp_private.fleet_asset_holds h WHERE h.asset_id=p_asset AND h.kind='hse' AND h.released_at IS NULL)
 THEN blockers:=array_append(blockers,'hse-hold'); END IF;
 IF erp_private.t10_maintenance_blocking(p_asset,day_until)
 THEN blockers:=array_append(blockers,'maintenance-overdue'); END IF;
 IF EXISTS(SELECT 1 FROM public.employee_operational_blocks b WHERE b.employee_id=p_employee AND b.deleted_at IS NULL
   AND b.block_status='active' AND b.effective_from<=day_until AND (b.effective_to IS NULL OR b.effective_to>=day_from))
 THEN blockers:=array_append(blockers,'hr-operational-hold'); END IF;
 IF EXISTS(SELECT 1 FROM erp_private.t04_days d JOIN erp_private.t04_cases r ON r.id=d.case_id
   WHERE d.employee_id=p_employee AND d.day BETWEEN day_from AND day_until AND d.state='posted'
     AND r.status='approved' AND r.employment_id=employee.id)
 THEN blockers:=array_append(blockers,'employee-on-leave'); END IF;
 IF policy.licence_type_id IS NOT NULL AND NOT erp_private.t06_credential_current('identity-document',p_employee,policy.licence_type_id,p_site,day_from,day_until)
 THEN blockers:=array_append(blockers,'licence-required'); END IF;
 IF policy.access_type_id IS NOT NULL AND NOT erp_private.t06_credential_current('access-card',p_employee,policy.access_type_id,p_site,day_from,day_until)
 THEN blockers:=array_append(blockers,'site-credential-required'); END IF;
 IF policy.access_type_id IS NULL AND EXISTS(SELECT 1 FROM public.work_sites s WHERE s.id=p_site
     AND (s.is_restricted_area OR s.cicpa_required OR s.adnoc_required))
 THEN blockers:=array_append(blockers,'site-policy-required'); END IF;
 IF policy.registration_required AND NOT erp_private.t06_asset_proof_current(p_asset,'registration',day_from,day_until)
 THEN blockers:=array_append(blockers,'registration-required'); END IF;
 IF policy.insurance_required AND NOT erp_private.t06_asset_proof_current(p_asset,'insurance',day_from,day_until)
 THEN blockers:=array_append(blockers,'insurance-required'); END IF;
 IF EXISTS(SELECT 1 FROM erp_private.fleet_commitments c WHERE c.asset_id=p_asset AND c.id IS DISTINCT FROM p_skip
    AND c.status IN ('confirmed','active','closed') AND c.committed_during && requested_span)
 THEN blockers:=array_append(blockers,'asset-committed'); END IF;
 IF EXISTS(SELECT 1 FROM erp_private.fleet_commitments c WHERE c.employee_id=p_employee AND c.id IS DISTINCT FROM p_skip
    AND c.status IN ('confirmed','active','closed') AND c.committed_during && requested_span)
 THEN blockers:=array_append(blockers,'employee-committed'); END IF;
 RETURN jsonb_build_object('available',cardinality(blockers)=0,'blockers',blockers,'policy_id',policy.id,
   'employment_period_id',employee.id,'as_of',statement_timestamp());
END;
$$;

COMMIT;
