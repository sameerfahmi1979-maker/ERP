BEGIN;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('workshop.labour.record','Plan assigned Workshop work and record signed time','workshop','labour_record','held'),
 ('workshop.labour.approve','Approve the exact signed Workshop time as assigned supervisor','workshop','labour_approve','held'),
 ('workshop.labour.cost','Configure and review restricted Workshop labour costs','workshop','labour_cost','held'),
 ('hr.workshop.labour.review','Reconcile Workshop time against approved attendance','hr','workshop_labour','held'),
 ('workshop.outside.manage','Manage outside repair supplier custody','workshop','outside_manage','held'),
 ('workshop.finance.intake','Review and stage exact outside repair evidence for Finance','workshop','finance_intake','held'),
 ('hr.payroll.workshop.review','Review Workshop overtime for payroll','hr','payroll_workshop','held');

CREATE TABLE erp_private.t12_cost_rates (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 employee_group_id bigint REFERENCES public.hr_employee_categories(id),
 group_key bigint GENERATED ALWAYS AS (coalesce(employee_group_id,0)) STORED,
 valid_during daterange NOT NULL CHECK(NOT isempty(valid_during) AND NOT lower_inf(valid_during) AND NOT upper_inf(valid_during)),
 rate numeric(16,4) NOT NULL CHECK(rate>=0),
 currency text NOT NULL CHECK(currency~'^[A-Z]{3}$'),
 approved_zero boolean NOT NULL,
 prepared_by bigint NOT NULL REFERENCES public.user_profiles(id),
 prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 approved_by bigint REFERENCES public.user_profiles(id),
 approved_at timestamptz,
 reason text NOT NULL,
 decision_reason text,
 CHECK((rate=0)=approved_zero),
 CHECK(approved_at IS NULL OR approved_by<>prepared_by),
 EXCLUDE USING gist(branch_id WITH =,group_key WITH =,valid_during WITH &&) WHERE(approved_at IS NOT NULL)
);
CREATE INDEX t12_rate_scope ON erp_private.t12_cost_rates(company_id,branch_id,employee_group_id,id DESC);

CREATE TABLE erp_private.t12_labour_assignments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 job_id bigint NOT NULL REFERENCES erp_private.t10_job_cycles(id),
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 employment_id bigint NOT NULL REFERENCES erp_private.t03_employment_periods(id),
 supervisor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 site_id bigint NOT NULL REFERENCES public.work_sites(id),
 bay text NOT NULL,
 task text NOT NULL,
 work_window tstzrange NOT NULL CHECK(NOT isempty(work_window) AND NOT lower_inf(work_window) AND NOT upper_inf(work_window)),
 planned_by bigint NOT NULL REFERENCES public.user_profiles(id),
 planned_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 EXCLUDE USING gist(site_id WITH =,bay WITH =,work_window WITH &&)
);
CREATE INDEX t12_labour_assignments_job ON erp_private.t12_labour_assignments(job_id,id DESC);

CREATE TABLE erp_private.t12_labour_lines (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 assignment_id bigint NOT NULL REFERENCES erp_private.t12_labour_assignments(id),
 source_line text NOT NULL,
 UNIQUE(assignment_id,source_line)
);

CREATE TABLE erp_private.t12_labour_documents (
 document_id bigint PRIMARY KEY REFERENCES public.dms_documents(id),
 job_id bigint NOT NULL REFERENCES erp_private.t10_job_cycles(id)
);

CREATE TABLE erp_private.t12_labour_versions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 line_id bigint NOT NULL REFERENCES erp_private.t12_labour_lines(id),
 assignment_id bigint NOT NULL REFERENCES erp_private.t12_labour_assignments(id),
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 predecessor_id bigint UNIQUE REFERENCES erp_private.t12_labour_versions(id),
 voids_line boolean NOT NULL DEFAULT false,
 CHECK(NOT voids_line OR predecessor_id IS NOT NULL),
 day date NOT NULL,
 period tstzrange NOT NULL CHECK(NOT isempty(period) AND NOT lower_inf(period) AND NOT upper_inf(period)),
 document_id bigint NOT NULL REFERENCES erp_private.t12_labour_documents(document_id),
 version_id bigint NOT NULL REFERENCES public.dms_document_versions(id),
 file_id bigint NOT NULL REFERENCES public.dms_document_files(id),
 cost_rate_id bigint REFERENCES erp_private.t12_cost_rates(id),
 cost_amount numeric(20,2),
 cost_currency text,
 entered_by bigint NOT NULL REFERENCES public.user_profiles(id),
 entered_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 decision text CHECK(decision IN('approved','rejected')),
 decided_by bigint REFERENCES public.user_profiles(id),
 decided_at timestamptz,
 decision_reason text,
 CHECK((cost_amount IS NULL)=(cost_rate_id IS NULL) AND (cost_currency IS NULL)=(cost_rate_id IS NULL)),
 CHECK((decided_at IS NULL)=(decision IS NULL) AND (decided_at IS NULL)=(decided_by IS NULL)),
 CHECK(decided_at IS NULL OR entered_by<>decided_by)
);
CREATE INDEX t12_labour_employee_day ON erp_private.t12_labour_versions(employee_id,day,id DESC);
CREATE INDEX t12_labour_line_head ON erp_private.t12_labour_versions(line_id,id DESC);
CREATE INDEX t12_labour_file ON erp_private.t12_labour_versions(file_id);
CREATE INDEX t12_labour_version ON erp_private.t12_labour_versions(version_id);

CREATE FUNCTION erp_private.t12_staff_capability(p_actor bigint,p_permission text,p_company bigint,p_branch bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(
  SELECT 1 FROM public.user_profiles person JOIN public.user_roles ur ON ur.user_profile_id=person.id AND ur.is_active
  JOIN public.roles r ON r.id=ur.role_id AND r.is_active
  JOIN public.role_permissions g ON g.role_id=r.id JOIN public.permissions cap ON cap.id=g.permission_id AND cap.is_active
  LEFT JOIN erp_private.t02_role_validity v ON v.assignment_id=ur.id
  WHERE person.id=p_actor AND person.status='active' AND NOT person.must_change_password
   AND cap.permission_code=p_permission AND ur.owner_company_id=p_company AND (ur.branch_id IS NULL OR ur.branch_id=p_branch)
   AND r.role_code NOT IN('system_admin','group_admin','company_admin','branch_admin')
   AND (v.valid_until IS NULL OR v.valid_until>statement_timestamp()));
$$;

CREATE FUNCTION erp_private.t12_is_subject(p_actor bigint,p_employee bigint) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.erp_user_employee_links l WHERE l.user_profile_id=p_actor AND l.employee_id=p_employee);
$$;

CREATE FUNCTION erp_private.t12_day_lock(p_employee bigint,p_day date) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('f12-attendance:'||p_employee||':'||(p_day-1),0));
 PERFORM pg_advisory_xact_lock(hashtextextended('f12-attendance:'||p_employee||':'||p_day,0));
END $$;

CREATE FUNCTION erp_private.t12_interval(p_from timestamptz,p_to timestamptz) RETURNS tstzrange
LANGUAGE plpgsql STABLE SET search_path='' AS $$
BEGIN
 IF p_from IS NULL OR p_to IS NULL OR NOT isfinite(p_from) OR NOT isfinite(p_to) OR p_to<=p_from
   OR p_to-p_from>interval '1 day' OR p_from<>date_trunc('minute',p_from) OR p_to<>date_trunc('minute',p_to) THEN
  RAISE EXCEPTION 'Enter a start and finish on minute boundaries, up to one day' USING ERRCODE='22023'; END IF;
 RETURN tstzrange(p_from,p_to,'[)');
END $$;

CREATE FUNCTION erp_private.t12_cost_basis(p_assignment erp_private.t12_labour_assignments,p_period tstzrange)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' SET timezone='UTC' AS $$
DECLARE data record; work_day date:=(lower(p_period) AT TIME ZONE 'Asia/Dubai')::date; rate erp_private.t12_cost_rates;
BEGIN
 SELECT f.company_id,f.branch_id,ep.employee_category_id INTO data FROM erp_private.t03_employment_periods ep
 JOIN erp_private.t10_job_cycles j ON j.id=p_assignment.job_id JOIN erp_private.t10_assessments f ON f.id=j.assessment_id
 WHERE ep.id=p_assignment.employment_id AND ep.employee_id=p_assignment.employee_id
  AND ep.company_id=f.company_id AND ep.branch_id=f.branch_id AND ep.work_period @> work_day;
 IF NOT FOUND OR NOT (p_period<@p_assignment.work_window) OR work_day IS DISTINCT FROM
    ((upper(p_period)-interval '1 microsecond') AT TIME ZONE 'Asia/Dubai')::date THEN
  RAISE EXCEPTION 'Time must fit the named technician allocation and one Dubai work date' USING ERRCODE='PT409'; END IF;
 SELECT * INTO rate FROM erp_private.t12_cost_rates r WHERE r.company_id=data.company_id AND r.branch_id=data.branch_id
  AND r.approved_at IS NOT NULL AND r.valid_during @> work_day AND (r.employee_group_id IS NULL OR r.employee_group_id=data.employee_category_id)
 ORDER BY (r.employee_group_id IS NOT NULL) DESC,r.id DESC LIMIT 1;
 RETURN jsonb_build_object('assignment',p_assignment.id,'period',p_period::text,'day',work_day,'rate',rate.id,'currency',rate.currency,
  'amount',CASE WHEN rate.id IS NOT NULL THEN erp_private.t08_range_amount(tstzmultirange(p_period),tstzmultirange(p_period),rate.rate) END,
  'minutes',erp_private.t08_minutes(tstzmultirange(p_period)));
END $$;

CREATE FUNCTION public.t12_labour_preview(p_assignment bigint,p_from timestamptz,p_to timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE a erp_private.t12_labour_assignments; f erp_private.t10_assessments; basis jsonb; can_cost boolean;
BEGIN
 SELECT * INTO a FROM erp_private.t12_labour_assignments WHERE id=p_assignment;
 SELECT af.* INTO f FROM erp_private.t10_assessments af JOIN erp_private.t10_job_cycles j ON j.assessment_id=af.id WHERE j.id=a.job_id;
 IF a.id IS NULL OR NOT erp_private.t05_scope('workshop.labour.record',f.company_id,f.branch_id) THEN RETURN NULL; END IF;
 basis:=erp_private.t12_cost_basis(a,erp_private.t12_interval(p_from,p_to));
 can_cost:=erp_private.t05_scope('workshop.labour.cost',f.company_id,f.branch_id);
 RETURN jsonb_build_object('digest',erp_private.t02_digest(basis),'minutes',basis->'minutes','cost_status',
   CASE WHEN basis->>'rate' IS NULL THEN 'rate-required' ELSE 'valued' END,
   'amount',CASE WHEN can_cost THEN basis->'amount' END,'currency',CASE WHEN can_cost THEN basis->'currency' END);
END $$;

CREATE FUNCTION public.t12_labour_rate(p_operation uuid,p_branch bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b public.branches; candidate erp_private.t12_cost_rates; actor bigint:=public.current_user_profile_id();
 keys text[]; note text; digest text; receipt jsonb; currency_code_input text; wage_rate numeric; zero_choice boolean;
BEGIN
 keys:=CASE p_action WHEN 'prepare' THEN ARRAY['group','from','until','rate','currency','approved_zero'] WHEN 'approve' THEN ARRAY['id'] END;
 IF keys IS NULL OR NOT erp_private.t05_fields(p_data,keys||ARRAY['reason']) THEN RAISE EXCEPTION 'Choose an authorised costing action' USING ERRCODE='22023'; END IF;
 SELECT * INTO b FROM public.branches WHERE id=p_branch;
 PERFORM erp_private.t11_scope('workshop.labour.cost',b.owner_company_id,b.id);
 note:=erp_private.t10_text(p_data,'reason',1000);
 PERFORM pg_advisory_xact_lock(hashtextextended('t12-cost:'||b.id,0));
 digest:=erp_private.t02_digest(jsonb_build_array(b.id,p_action,p_data));
 receipt:=erp_private.t02_replay('t12-cost',p_operation,digest);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;
 IF p_action='prepare' THEN
  wage_rate:=erp_private.t11_quantity(p_data,'rate',4,true);
  currency_code_input:=erp_private.t11_key(p_data,'currency',3);
  zero_choice:=coalesce(p_data->'approved_zero'='true'::jsonb,false);
  IF (wage_rate=0)<>zero_choice OR NOT EXISTS(SELECT 1 FROM public.currencies c WHERE c.currency_code=currency_code_input AND c.is_active)
   OR (p_data->>'from')::date IS NULL OR (p_data->>'until')::date IS NULL
   OR NOT isfinite((p_data->>'from')::date) OR NOT isfinite((p_data->>'until')::date)
   OR (p_data->>'until')::date<=(p_data->>'from')::date THEN
   RAISE EXCEPTION 'Specify an active currency, dated rate or explicit reviewed zero rule' USING ERRCODE='22023'; END IF;
  INSERT INTO erp_private.t12_cost_rates(company_id,branch_id,employee_group_id,valid_during,rate,currency,approved_zero,prepared_by,reason)
  VALUES(b.owner_company_id,b.id,(p_data->>'group')::bigint,daterange((p_data->>'from')::date,(p_data->>'until')::date,'[)'),
   wage_rate,currency_code_input,zero_choice,actor,note) RETURNING * INTO candidate;
 ELSE
  SELECT * INTO candidate FROM erp_private.t12_cost_rates WHERE id=(p_data->>'id')::bigint AND branch_id=b.id FOR UPDATE;
  IF candidate.id IS NULL OR candidate.prepared_by=actor OR candidate.approved_at IS NOT NULL THEN
   RAISE EXCEPTION 'An independent current costing decision is required' USING ERRCODE='PT409'; END IF;
  UPDATE erp_private.t12_cost_rates SET approved_by=actor,approved_at=clock_timestamp(),decision_reason=note WHERE id=candidate.id;
 END IF;
 RETURN erp_private.t02_save_receipt('t12-cost',p_operation,digest,jsonb_build_object('id',candidate.id));
END $$;

CREATE FUNCTION public.t12_labour_command(p_operation uuid,p_job bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job erp_private.t10_job_cycles; f erp_private.t10_assessments; a erp_private.t12_labour_assignments;
 ep erp_private.t03_employment_periods; v erp_private.t12_labour_versions; old erp_private.t12_labour_versions;
 actor bigint:=public.current_user_profile_id(); keys text[]; cap text; note text; hash text; receipt jsonb; source text;
 proposed tstzrange; work_day date; site bigint; worker bigint; reviewer bigint; line bigint; prior bigint;
 proof jsonb; doc bigint; bound_job bigint; basis jsonb; decision_code text; void_requested boolean;
BEGIN
 keys:=CASE p_action WHEN 'assign' THEN ARRAY['employee','supervisor','site','bay','task','from','until']
 WHEN 'record' THEN ARRAY['assignment','source_line','from','until','evidence','preview','previous','void']
 WHEN 'approve' THEN ARRAY['version'] WHEN 'reject' THEN ARRAY['version'] END;
 IF keys IS NULL OR NOT erp_private.t05_fields(p_data,keys||ARRAY['reason']) THEN
  RAISE EXCEPTION 'Choose a valid Workshop labour action' USING ERRCODE='22023'; END IF;
 SELECT * INTO job FROM erp_private.t10_job_cycles WHERE id=p_job FOR SHARE;
 SELECT * INTO f FROM erp_private.t10_assessments WHERE id=job.assessment_id;
 cap:=CASE WHEN p_action IN('approve','reject') THEN 'workshop.labour.approve' ELSE 'workshop.labour.record' END;
 PERFORM erp_private.t11_scope(cap,f.company_id,f.branch_id);
 note:=erp_private.t10_text(p_data,'reason',1000);
 IF p_action='record' THEN
  SELECT * INTO a FROM erp_private.t12_labour_assignments WHERE id=(p_data->>'assignment')::bigint AND job_id=p_job;
  IF a.id IS NULL THEN RAISE EXCEPTION 'The named technician allocation is unavailable' USING ERRCODE='42501'; END IF;
  proposed:=erp_private.t12_interval((p_data->>'from')::timestamptz,(p_data->>'until')::timestamptz);
  work_day:=(lower(proposed) AT TIME ZONE 'Asia/Dubai')::date;
 ELSIF p_action IN('approve','reject') THEN
  SELECT item.* INTO v FROM erp_private.t12_labour_versions item JOIN erp_private.t12_labour_assignments x ON x.id=item.assignment_id
   WHERE item.id=(p_data->>'version')::bigint AND x.job_id=p_job;
  SELECT * INTO a FROM erp_private.t12_labour_assignments WHERE id=v.assignment_id;
  IF a.id IS NULL OR actor<>a.supervisor_id OR erp_private.t12_is_subject(actor,a.employee_id) THEN RAISE EXCEPTION 'This line requires its named supervisor' USING ERRCODE='42501'; END IF;
  work_day:=v.day;
 END IF;
 IF work_day IS NOT NULL THEN PERFORM erp_private.t12_day_lock(a.employee_id,work_day); END IF;
 hash:=erp_private.t02_digest(jsonb_build_array(p_job,p_action,p_data));
 receipt:=erp_private.t02_replay('t12-labour',p_operation,hash);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;
 IF p_action='assign' THEN
  proposed:=erp_private.t12_interval((p_data->>'from')::timestamptz,(p_data->>'until')::timestamptz);
  worker:=(p_data->>'employee')::bigint; reviewer:=(p_data->>'supervisor')::bigint; site:=(p_data->>'site')::bigint;
  SELECT * INTO ep FROM erp_private.t06_work_period(worker,lower(proposed),upper(proposed));
  IF job.state NOT IN('planned','in-progress') OR job.planned_start IS NULL OR job.planned_end IS NULL
   OR NOT (proposed<@tstzrange(job.planned_start,job.planned_end,'[)'))
   OR erp_private.t12_is_subject(reviewer,worker) OR ep.id IS NULL OR ROW(ep.company_id,ep.branch_id) IS DISTINCT FROM ROW(f.company_id,f.branch_id)
   OR NOT erp_private.t12_staff_capability(reviewer,'workshop.labour.approve',f.company_id,f.branch_id)
   OR NOT erp_private.t06_site_allowed(site,f.company_id,f.branch_id,(lower(proposed) AT TIME ZONE 'Asia/Dubai')::date,
        ((upper(proposed)-interval '1 microsecond') AT TIME ZONE 'Asia/Dubai')::date) THEN
   RAISE EXCEPTION 'Choose a current job, technician, named supervisor and authorised bay site' USING ERRCODE='PT409'; END IF;
  INSERT INTO erp_private.t12_labour_assignments(job_id,employee_id,employment_id,supervisor_id,site_id,bay,task,work_window,planned_by,reason)
  VALUES(p_job,worker,ep.id,reviewer,site,erp_private.t11_key(p_data,'bay',50),erp_private.t10_text(p_data,'task',200),
   proposed,actor,note) RETURNING * INTO a;
 ELSIF p_action='record' THEN
  IF upper(proposed)>statement_timestamp() OR a.supervisor_id=actor
   OR job.actual_start IS NULL OR lower(proposed)<job.actual_start
   OR (job.actual_end IS NOT NULL AND upper(proposed)>job.actual_end) THEN
   RAISE EXCEPTION 'Use actual time inside the repair window and a separate entrant from the named supervisor' USING ERRCODE='PT409'; END IF;
  PERFORM pg_advisory_xact_lock_shared(hashtextextended('t12-cost:'||f.branch_id,0));
  basis:=erp_private.t12_cost_basis(a,proposed);
  IF p_data->>'preview' IS DISTINCT FROM erp_private.t02_digest(basis) THEN
   RAISE EXCEPTION 'Refresh the exact workshop duration and cost preview' USING ERRCODE='PT409'; END IF;
  source:=erp_private.t11_key(p_data,'source_line',100); prior:=(p_data->>'previous')::bigint; proof:=p_data->'evidence';
  SELECT l.id INTO line FROM erp_private.t12_labour_lines l WHERE l.assignment_id=a.id AND l.source_line=source;
  SELECT * INTO old FROM erp_private.t12_labour_versions WHERE line_id=line ORDER BY id DESC LIMIT 1 FOR UPDATE;
  void_requested:=coalesce(p_data->'void'='true'::jsonb,false);
  IF void_requested AND (old.id IS NULL OR proposed IS DISTINCT FROM old.period) THEN
   RAISE EXCEPTION 'A void keeps the exact original dates and attaches a signed correction' USING ERRCODE='PT409';
  END IF;
  IF prior IS DISTINCT FROM old.id OR (old.id IS NOT NULL AND (old.day IS DISTINCT FROM work_day OR
    (old.period IS DISTINCT FROM proposed OR old.voids_line<>void_requested) AND old.version_id=(proof->>'version')::bigint
    OR ROW(old.period,old.version_id,old.file_id,old.cost_rate_id,old.voids_line) IS NOT DISTINCT FROM
      ROW(proposed,(proof->>'version')::bigint,(proof->>'file')::bigint,(basis->>'rate')::bigint,void_requested) AND old.decision IS DISTINCT FROM 'rejected')) THEN
   RAISE EXCEPTION 'Keep the original identity and use a changed version on its actual work date' USING ERRCODE='PT409'; END IF;
  IF NOT erp_private.t10_original(f.asset_id,proof,ARRAY['FLEET_WORKSHOP_LABOUR']) THEN
   RAISE EXCEPTION 'Use the current verified signed labour original for this asset' USING ERRCODE='PT409'; END IF;
  doc:=(proof->>'document')::bigint;
  INSERT INTO erp_private.t12_labour_documents(document_id,job_id) VALUES(doc,p_job) ON CONFLICT DO NOTHING;
  SELECT job_id INTO bound_job FROM erp_private.t12_labour_documents WHERE document_id=doc FOR SHARE;
  IF bound_job IS DISTINCT FROM p_job THEN RAISE EXCEPTION 'The signed labour original belongs to a different job cycle' USING ERRCODE='PT409'; END IF;
  IF line IS NULL THEN
   INSERT INTO erp_private.t12_labour_lines(assignment_id,source_line) VALUES(a.id,source) RETURNING id INTO line; END IF;
  INSERT INTO erp_private.t12_labour_versions(line_id,assignment_id,employee_id,predecessor_id,day,period,document_id,version_id,file_id,voids_line,
   cost_rate_id,cost_amount,cost_currency,entered_by,reason)
  VALUES(line,a.id,a.employee_id,prior,work_day,proposed,doc,(proof->>'version')::bigint,(proof->>'file')::bigint,void_requested,
   (basis->>'rate')::bigint,(basis->>'amount')::numeric,basis->>'currency',actor,note) RETURNING * INTO v;
 ELSE
  SELECT * INTO v FROM erp_private.t12_labour_versions item WHERE id=v.id FOR UPDATE;
  IF v.decision IS NOT NULL OR v.entered_by=actor OR EXISTS(SELECT 1 FROM erp_private.t12_labour_versions replacement WHERE replacement.predecessor_id=v.id) THEN
   RAISE EXCEPTION 'Independently decide the latest signed Workshop time' USING ERRCODE='PT409'; END IF;
  IF NOT erp_private.t10_original(f.asset_id,jsonb_build_object('document',v.document_id,'version',v.version_id,'file',v.file_id),
   ARRAY['FLEET_WORKSHOP_LABOUR']) THEN RAISE EXCEPTION 'The signed labour source changed or is restricted' USING ERRCODE='PT409'; END IF;
  decision_code:=CASE WHEN p_action='approve' THEN 'approved' ELSE 'rejected' END;
  UPDATE erp_private.t12_labour_versions SET decision=decision_code,decided_by=actor,decided_at=clock_timestamp(),decision_reason=note WHERE id=v.id
  RETURNING * INTO v;
 END IF;
 RETURN erp_private.t02_save_receipt('t12-labour',p_operation,hash,jsonb_build_object('id',coalesce(v.id,a.id),'assignment',a.id,
  'decision',v.decision,'minutes',CASE WHEN v.id IS NOT NULL THEN erp_private.t08_minutes(tstzmultirange(v.period)) END,
  'cost_status',CASE WHEN v.id IS NOT NULL THEN CASE WHEN v.cost_rate_id IS NULL THEN 'rate-required' ELSE 'valued' END END));
END $$;

CREATE FUNCTION erp_private.t12_guard_labour_completion() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM erp_private.t12_labour_versions v JOIN erp_private.t12_labour_assignments a ON a.id=v.assignment_id
   WHERE a.job_id=NEW.id AND NOT v.voids_line AND v.decision IS DISTINCT FROM 'rejected' AND upper(v.period)>NEW.actual_end
   AND NOT EXISTS(SELECT 1 FROM erp_private.t12_labour_versions later WHERE later.predecessor_id=v.id)) THEN
  RAISE EXCEPTION 'Reconcile recorded signed labour before saving an earlier job finish' USING ERRCODE='PT409';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER t12_labour_completion BEFORE UPDATE OF actual_end ON erp_private.t10_job_cycles
 FOR EACH ROW WHEN(NEW.actual_end IS NOT NULL) EXECUTE FUNCTION erp_private.t12_guard_labour_completion();

CREATE FUNCTION erp_private.t12_labour_original_current(p_ver bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM erp_private.t12_labour_versions w JOIN erp_private.t12_labour_documents bound ON bound.document_id=w.document_id
 JOIN erp_private.t12_labour_assignments a ON a.id=w.assignment_id AND a.job_id=bound.job_id
 JOIN erp_private.t10_job_cycles j ON j.id=a.job_id JOIN erp_private.t10_assessments af ON af.id=j.assessment_id
 JOIN public.dms_documents d ON d.id=w.document_id AND d.current_version_id=w.version_id AND d.deleted_at IS NULL
   AND d.status='active' AND NOT d.is_archived
 JOIN public.dms_document_types dt ON dt.id=d.document_type_id AND dt.type_code='FLEET_WORKSHOP_LABOUR' AND dt.deleted_at IS NULL
 JOIN public.dms_document_versions v ON v.id=w.version_id AND v.is_current AND v.unlinked_at IS NULL AND v.document_id=d.id
 JOIN public.dms_document_files file ON file.id=w.file_id AND file.version_id=v.id AND file.document_id=d.id
   AND file.file_role='original' AND file.deleted_at IS NULL AND file.integrity_status='verified'
   AND file.file_size_bytes>0 AND file.sha256_hash~'^[0-9a-f]{64}$'
 JOIN public.dms_document_links l ON l.document_id=d.id AND l.entity_type='fleet_asset' AND l.entity_id=af.asset_id AND l.deleted_at IS NULL
 JOIN erp_private.fleet_document_parents p ON p.document_id=d.id AND p.asset_id=af.asset_id WHERE w.id=p_ver);
$$;

CREATE FUNCTION erp_private.t12_lock_labour_original(p_version bigint) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM erp_private.t12_labour_versions w JOIN public.dms_documents d ON d.id=w.document_id
 JOIN public.dms_document_versions v ON v.id=w.version_id JOIN public.dms_document_files f ON f.id=w.file_id
 WHERE w.id=p_version FOR SHARE OF d,v,f;
END $$;

CREATE FUNCTION erp_private.t12_retain_labour_proof() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='dms_document_files' THEN
  IF (TG_OP='DELETE' OR ROW(NEW.document_id,NEW.version_id,NEW.deleted_at,NEW.file_role,NEW.sha256_hash,
    NEW.file_size_bytes,NEW.storage_bucket,NEW.storage_path,NEW.integrity_status) IS DISTINCT FROM
    ROW(OLD.document_id,OLD.version_id,OLD.deleted_at,OLD.file_role,OLD.sha256_hash,OLD.file_size_bytes,OLD.storage_bucket,OLD.storage_path,OLD.integrity_status))
   AND EXISTS(SELECT 1 FROM erp_private.t12_labour_versions w WHERE w.file_id=OLD.id) THEN
   RAISE EXCEPTION 'Retain signed Workshop labour bytes' USING ERRCODE='PT409'; END IF;
 ELSIF TG_TABLE_NAME='dms_document_versions' THEN
  IF (TG_OP='DELETE' OR ROW(NEW.document_id,NEW.unlinked_at) IS DISTINCT FROM ROW(OLD.document_id,OLD.unlinked_at))
   AND EXISTS(SELECT 1 FROM erp_private.t12_labour_versions w WHERE w.version_id=OLD.id) THEN
   RAISE EXCEPTION 'Retain the signed Workshop labour version' USING ERRCODE='PT409'; END IF;
 ELSE
  IF OLD.entity_type='fleet_asset' AND OLD.deleted_at IS NULL
   AND (TG_OP='DELETE' OR ROW(NEW.document_id,NEW.entity_id,NEW.entity_type,NEW.deleted_at) IS DISTINCT FROM
     ROW(OLD.document_id,OLD.entity_id,OLD.entity_type,OLD.deleted_at))
   AND EXISTS(SELECT 1 FROM erp_private.t12_labour_documents w JOIN erp_private.t10_job_cycles j ON j.id=w.job_id
    JOIN erp_private.t10_assessments f ON f.id=j.assessment_id WHERE w.document_id=OLD.document_id AND f.asset_id=OLD.entity_id) THEN
   RAISE EXCEPTION 'Retain the signed Workshop labour association' USING ERRCODE='PT409'; END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER t12_keep_labour_file BEFORE UPDATE OF document_id,version_id,deleted_at,file_role,sha256_hash,file_size_bytes,
 storage_bucket,storage_path,integrity_status OR DELETE ON public.dms_document_files FOR EACH ROW EXECUTE FUNCTION erp_private.t12_retain_labour_proof();
CREATE TRIGGER t12_keep_labour_version BEFORE UPDATE OF document_id,unlinked_at OR DELETE ON public.dms_document_versions
 FOR EACH ROW EXECUTE FUNCTION erp_private.t12_retain_labour_proof();
CREATE TRIGGER t12_keep_labour_link BEFORE UPDATE OF document_id,entity_id,entity_type,deleted_at OR DELETE ON public.dms_document_links
 FOR EACH ROW EXECUTE FUNCTION erp_private.t12_retain_labour_proof();

DO $$ DECLARE name text; BEGIN
 FOREACH name IN ARRAY ARRAY['t12_cost_rates','t12_labour_assignments','t12_labour_lines','t12_labour_versions','t12_labour_documents'] LOOP
  EXECUTE format('ALTER TABLE erp_private.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('REVOKE ALL ON erp_private.%I FROM PUBLIC,anon,authenticated,service_role',name);
 END LOOP;
END $$;
REVOKE ALL ON FUNCTION erp_private.t12_staff_capability(bigint,text,bigint,bigint),erp_private.t12_is_subject(bigint,bigint),
 erp_private.t12_guard_labour_completion(),erp_private.t12_day_lock(bigint,date),
 erp_private.t12_interval(timestamptz,timestamptz),erp_private.t12_cost_basis(erp_private.t12_labour_assignments,tstzrange),
 erp_private.t12_labour_original_current(bigint),erp_private.t12_lock_labour_original(bigint),erp_private.t12_retain_labour_proof(),
 public.t12_labour_preview(bigint,timestamptz,timestamptz),public.t12_labour_rate(uuid,bigint,text,jsonb),
 public.t12_labour_command(uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t12_labour_preview(bigint,timestamptz,timestamptz),public.t12_labour_rate(uuid,bigint,text,jsonb),
 public.t12_labour_command(uuid,bigint,text,jsonb) TO authenticated;
COMMIT;
