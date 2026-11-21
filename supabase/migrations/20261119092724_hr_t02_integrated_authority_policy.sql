BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = public, extensions, pg_catalog;
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;

-- Business role grants are explicit. These capabilities do not inherit to administrators.
INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
  ('integrated.policy.view','Read work policies','HR','view','held'),
  ('integrated.policy.prepare','Prepare work policies','HR','prepare','held'),
  ('integrated.policy.review','Review employment terms in work policies','HR','review','held'),
  ('integrated.policy.approve','Approve work policies','HR','approve','held'),
  ('integrated.policy.exception','Authorize individual work policy exceptions','HR','exception','held'),
  ('integrated.custody.transfer','Authorize cross-company custody transfer','FLEET','transfer','held');

CREATE TABLE erp_private.t02_role_validity (
  assignment_id bigint PRIMARY KEY REFERENCES public.user_roles(id) ON DELETE CASCADE,
  valid_until timestamptz NOT NULL CHECK (isfinite(valid_until))
);
ALTER TABLE erp_private.t02_role_validity ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t02_role_validity FROM PUBLIC,anon,authenticated,service_role;
COMMENT ON TABLE erp_private.t02_role_validity IS
  'Optional exclusive end of an explicit role assignment for integrated operations. Legacy permissions retain their original lifetime.';

CREATE FUNCTION erp_private.t02_lock_validity_assignment()
RETURNS trigger LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF TG_OP='UPDATE' AND OLD.assignment_id IS DISTINCT FROM NEW.assignment_id THEN
    RAISE EXCEPTION 'Create a validity record for the separate assignment' USING ERRCODE='22023';
  END IF;
  PERFORM 1 FROM public.user_roles WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.assignment_id ELSE NEW.assignment_id END FOR UPDATE;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
CREATE TRIGGER t02_lock_validity_assignment BEFORE INSERT OR UPDATE OR DELETE ON erp_private.t02_role_validity
  FOR EACH ROW EXECUTE FUNCTION erp_private.t02_lock_validity_assignment();

-- Resolve an action through one ordinary role assignment at the actual company
-- and branch. Share locks serialize admission against role/subject revocation.
CREATE FUNCTION erp_private.t02_has_scope(p_capability text, p_company bigint, p_branch bigint)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
DECLARE matched_assignment bigint;
BEGIN
  IF NOT erp_private.business_principal_is_active() THEN RETURN false; END IF;
  PERFORM 1 FROM public.user_profiles AS profile
    WHERE profile.auth_user_id=auth.uid() AND profile.status='active' AND NOT profile.must_change_password FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM auth.sessions AS session
    WHERE session.id=(auth.jwt()->>'session_id')::uuid AND session.user_id=auth.uid()
      AND (session.not_after IS NULL OR session.not_after>clock_timestamp()) FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  PERFORM 1 FROM public.owner_companies AS company
    WHERE company.id=p_company AND company.status='active' FOR SHARE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF p_branch IS NOT NULL THEN
    PERFORM 1 FROM public.branches AS branch WHERE branch.id=p_branch AND branch.owner_company_id=p_company
      AND branch.status='active' AND branch.operating_status='active' FOR SHARE;
    IF NOT FOUND THEN RETURN false; END IF;
  END IF;
  FOR matched_assignment IN SELECT assignment.id
    FROM public.user_roles AS assignment
    JOIN public.roles AS role ON role.id=assignment.role_id
    JOIN public.role_permissions AS grant_row ON grant_row.role_id=role.id
    JOIN public.permissions AS capability ON capability.id=grant_row.permission_id
   WHERE assignment.user_profile_id=public.current_user_profile_id()
     AND assignment.is_active AND role.is_active AND capability.is_active
     AND assignment.owner_company_id=p_company
     AND (assignment.branch_id IS NULL OR assignment.branch_id=p_branch)
     AND role.role_code NOT IN ('system_admin','group_admin','company_admin','branch_admin')
     AND capability.permission_code=p_capability
   ORDER BY assignment.id FOR SHARE OF assignment, role, grant_row, capability
  LOOP
    IF NOT EXISTS(SELECT 1 FROM erp_private.t02_role_validity window_row
      WHERE window_row.assignment_id=matched_assignment AND window_row.valid_until<=clock_timestamp()) THEN
      RETURN erp_private.business_principal_is_active();
    END IF;
  END LOOP;
  RETURN false;
END;
$$;

-- Call from the owning custody transaction with both scopes derived from its
-- persisted subjects. Canonical ordering prevents opposite transfers locking
-- the same two companies in inverse order.
CREATE FUNCTION erp_private.t02_cross_company_custody_allowed(
  p_source_company bigint, p_source_branch bigint, p_destination_company bigint, p_destination_branch bigint
) RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF p_source_company IS NULL OR p_destination_company IS NULL OR p_source_company=p_destination_company
     OR p_source_branch IS NULL OR p_destination_branch IS NULL THEN RETURN false; END IF;
  IF p_source_company<p_destination_company THEN
    RETURN erp_private.t02_has_scope('integrated.custody.transfer',p_source_company,p_source_branch)
       AND erp_private.t02_has_scope('integrated.custody.transfer',p_destination_company,p_destination_branch);
  END IF;
  RETURN erp_private.t02_has_scope('integrated.custody.transfer',p_destination_company,p_destination_branch)
     AND erp_private.t02_has_scope('integrated.custody.transfer',p_source_company,p_source_branch);
END;
$$;

CREATE TABLE erp_private.t02_work_rule_versions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  company_id bigint NOT NULL REFERENCES public.owner_companies(id),
  employee_group_id bigint REFERENCES public.hr_employee_categories(id),
  employee_id bigint REFERENCES public.employees(id),
  category text NOT NULL CHECK (category IN ('overtime.standard','overtime.rest_day','overtime.public_holiday','overtime.ramadan','overtime.overnight')),
  effective_period daterange NOT NULL CHECK (NOT isempty(effective_period) AND NOT lower_inf(effective_period) AND NOT upper_inf(effective_period)),
  priority smallint GENERATED ALWAYS AS (CASE WHEN employee_id IS NOT NULL THEN 2 WHEN employee_group_id IS NOT NULL THEN 1 ELSE 0 END) STORED,
  scope_key bigint GENERATED ALWAYS AS (coalesce(employee_id,employee_group_id,0)) STORED,
  facts jsonb NOT NULL,
  digest text NOT NULL CHECK (digest ~ '^[0-9a-f]{64}$'),
  phase text NOT NULL DEFAULT 'draft' CHECK (phase IN ('draft','reviewed','approved')),
  revision integer NOT NULL DEFAULT 1,
  prepared_by uuid NOT NULL,
  prepared_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_reason text,
  approved_by uuid,
  approved_at timestamptz,
  approval_reason text,
  CHECK (employee_id IS NULL OR employee_group_id IS NULL),
  CHECK (reviewed_by IS NULL OR prepared_by<>reviewed_by),
  CHECK (approved_by IS NULL OR (reviewed_by IS NOT NULL AND approved_by<>prepared_by AND approved_by<>reviewed_by)),
  EXCLUDE USING gist (company_id WITH =, category WITH =, priority WITH =, scope_key WITH =, effective_period WITH &&)
    WHERE (phase='approved')
);

CREATE INDEX t02_work_rule_company_list ON erp_private.t02_work_rule_versions(company_id,id DESC);
CREATE TABLE erp_private.t02_operation_receipts (
  actor uuid NOT NULL,
  domain text NOT NULL,
  operation_id uuid NOT NULL,
  request_digest text NOT NULL,
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY(actor,domain,operation_id)
);
ALTER TABLE erp_private.t02_work_rule_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t02_operation_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t02_work_rule_versions,erp_private.t02_operation_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.t02_digest(p_value jsonb)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path = '' AS $$
  SELECT encode(sha256(convert_to(p_value::text,'UTF8')),'hex');
$$;

-- The domain command must validate current authority before consulting a receipt.
-- The lock and receipt live in the transaction of its business effect.
CREATE FUNCTION erp_private.t02_replay(p_domain text,p_operation uuid,p_digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE saved erp_private.t02_operation_receipts;
BEGIN
  IF p_operation IS NULL OR p_domain IS NULL OR p_digest IS NULL
     OR NOT erp_private.business_principal_is_active() THEN
    RAISE EXCEPTION 'An operation identifier and active session are required' USING ERRCODE='22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(concat('erp-t02:',auth.uid(),':',p_domain,':',p_operation),0));
  SELECT * INTO saved FROM erp_private.t02_operation_receipts
   WHERE actor=auth.uid() AND domain=p_domain AND operation_id=p_operation;
  IF NOT FOUND THEN RETURN NULL; END IF;
  IF saved.request_digest<>p_digest THEN
    RAISE EXCEPTION 'Operation already used with different input' USING ERRCODE='P0409';
  END IF;
  RETURN saved.receipt || jsonb_build_object('replayed',true);
END;
$$;

CREATE FUNCTION erp_private.t02_save_receipt(p_domain text,p_operation uuid,p_digest text,p_result jsonb)
RETURNS jsonb LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path = '' AS $$
  INSERT INTO erp_private.t02_operation_receipts(actor,domain,operation_id,request_digest,receipt)
  VALUES(auth.uid(),p_domain,p_operation,p_digest,p_result || jsonb_build_object('replayed',false))
  RETURNING receipt;
$$;

CREATE FUNCTION erp_private.t02_rule_category(p_category text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT coalesce(p_category IN ('overtime.standard','overtime.rest_day','overtime.public_holiday','overtime.ramadan','overtime.overnight'),false);
$$;

CREATE FUNCTION erp_private.t02_employee_branch(p_company bigint,p_employee bigint)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE employee_branch bigint;
BEGIN
  IF p_employee IS NULL THEN RETURN NULL; END IF;
  SELECT e.branch_id INTO employee_branch FROM public.employees e
   WHERE e.id=p_employee AND e.owner_company_id=p_company AND e.deleted_at IS NULL FOR SHARE;
  IF NOT FOUND OR NOT public.current_user_can_view_employee(p_employee) THEN
    RAISE EXCEPTION 'Work policy scope unavailable' USING ERRCODE='42501';
  END IF;
  RETURN employee_branch;
END;
$$;

CREATE FUNCTION erp_private.t02_validate_work_rule(p_facts jsonb,p_individual boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE component jsonb;
DECLARE component_ids bigint[] := ARRAY[]::bigint[];
DECLARE component_id bigint;
BEGIN
  IF jsonb_typeof(p_facts) IS DISTINCT FROM 'object'
    OR p_facts - ARRAY['salary_basis','component_type_ids','rate_multiplier','monthly_hours','exception_reason'] <> '{}'::jsonb
    OR coalesce(p_facts->>'salary_basis','') NOT IN ('basic','approved_components')
    OR jsonb_typeof(p_facts->'rate_multiplier') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_facts->'monthly_hours') IS DISTINCT FROM 'number'
    OR jsonb_typeof(p_facts->'component_type_ids') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Invalid work policy facts' USING ERRCODE='22023';
  END IF;
  IF (p_facts->>'rate_multiplier')::numeric NOT BETWEEN 0.1 AND 10
    OR (p_facts->>'monthly_hours')::numeric NOT BETWEEN 1 AND 744
    OR jsonb_array_length(p_facts->'component_type_ids')>30
    OR (p_facts->>'salary_basis'='basic') IS DISTINCT FROM (jsonb_array_length(p_facts->'component_type_ids')=0)
    OR (p_individual AND (jsonb_typeof(p_facts->'exception_reason') IS DISTINCT FROM 'string'
         OR length(btrim(p_facts->>'exception_reason')) NOT BETWEEN 1 AND 500))
    OR (NOT p_individual AND p_facts ? 'exception_reason') THEN
    RAISE EXCEPTION 'Invalid salary basis, rate, or exception reason' USING ERRCODE='22023';
  END IF;
  FOR component IN SELECT value FROM jsonb_array_elements(p_facts->'component_type_ids') LOOP
    IF jsonb_typeof(component)<>'number' OR component::text !~ '^[1-9][0-9]{0,15}$' THEN
      RAISE EXCEPTION 'Invalid salary component' USING ERRCODE='22023';
    END IF;
    component_id := component::text::bigint;
    IF component_id=ANY(component_ids) OR component_id>9007199254740991 THEN
      RAISE EXCEPTION 'Duplicate or invalid salary component' USING ERRCODE='22023';
    END IF;
    PERFORM 1 FROM public.hr_salary_component_types
      WHERE id=component_id AND component_kind='earning' AND is_active AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Salary basis must use active earning components' USING ERRCODE='22023'; END IF;
    component_ids := array_append(component_ids,component_id);
  END LOOP;
END;
$$;

CREATE FUNCTION public.t02_prepare_work_rule(
  p_company bigint,p_group bigint,p_employee bigint,p_category text,
  p_from date,p_until date,p_facts jsonb,p_operation uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE branch bigint;
DECLARE payload jsonb;
DECLARE request_digest text;
DECLARE result jsonb;
DECLARE rule erp_private.t02_work_rule_versions;
BEGIN
  branch := erp_private.t02_employee_branch(p_company,p_employee);
  IF NOT erp_private.t02_has_scope('integrated.policy.prepare',p_company,branch)
     OR (p_employee IS NOT NULL AND NOT erp_private.t02_has_scope('integrated.policy.exception',p_company,branch)) THEN
    RAISE EXCEPTION 'Work policy scope unavailable' USING ERRCODE='42501';
  END IF;
  payload := jsonb_build_object('company',p_company,'group',p_group,'employee',p_employee,'category',p_category,
                               'from',p_from,'until',p_until,'facts',p_facts);
  request_digest := erp_private.t02_digest(jsonb_build_array('prepare',payload));
  result := erp_private.t02_replay('work-policy',p_operation,request_digest);
  IF result IS NOT NULL THEN RETURN result; END IF;
  IF NOT erp_private.t02_rule_category(p_category)
     OR NOT coalesce(isfinite(p_from) AND isfinite(p_until) AND p_from<p_until,false)
     OR (p_group IS NOT NULL AND p_employee IS NOT NULL) THEN
    RAISE EXCEPTION 'Invalid work policy selector or effective period' USING ERRCODE='22023';
  END IF;
  IF p_group IS NOT NULL THEN
    PERFORM 1 FROM public.hr_employee_categories WHERE id=p_group AND is_active AND deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Employee group unavailable' USING ERRCODE='22023'; END IF;
  END IF;
  PERFORM erp_private.t02_validate_work_rule(p_facts,p_employee IS NOT NULL);
  INSERT INTO erp_private.t02_work_rule_versions(company_id,employee_group_id,employee_id,category,effective_period,facts,digest,prepared_by)
  VALUES(p_company,p_group,p_employee,p_category,daterange(p_from,p_until,'[)'),p_facts,erp_private.t02_digest(payload),auth.uid())
  RETURNING * INTO rule;
  RETURN erp_private.t02_save_receipt('work-policy',p_operation,request_digest,
    jsonb_build_object('id',rule.id,'revision',rule.revision,'digest',rule.digest,'phase',rule.phase));
END;
$$;

CREATE FUNCTION public.t02_decide_work_rule(
  p_id bigint,p_revision integer,p_digest text,p_step text,p_reason text,p_operation uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE branch bigint;
DECLARE rule erp_private.t02_work_rule_versions;
DECLARE capability text;
DECLARE request_digest text;
DECLARE result jsonb;
BEGIN
  capability := CASE p_step WHEN 'review' THEN 'integrated.policy.review' WHEN 'approve' THEN 'integrated.policy.approve' END;
  IF capability IS NULL THEN RAISE EXCEPTION 'Invalid work policy decision' USING ERRCODE='22023'; END IF;
  SELECT * INTO rule FROM erp_private.t02_work_rule_versions WHERE id=p_id;
  branch := erp_private.t02_employee_branch(rule.company_id,rule.employee_id);
  IF rule.id IS NULL OR NOT erp_private.t02_has_scope(capability,rule.company_id,branch)
     OR (p_step='approve' AND rule.employee_id IS NOT NULL
         AND NOT erp_private.t02_has_scope('integrated.policy.exception',rule.company_id,branch)) THEN
    RAISE EXCEPTION 'Work policy scope unavailable' USING ERRCODE='42501';
  END IF;
  request_digest := erp_private.t02_digest(jsonb_build_array(p_step,p_id,p_revision,p_digest,p_reason));
  result := erp_private.t02_replay('work-policy',p_operation,request_digest);
  IF result IS NOT NULL THEN RETURN result; END IF;
  SELECT * INTO STRICT rule FROM erp_private.t02_work_rule_versions WHERE id=p_id FOR UPDATE;
  IF rule.revision IS DISTINCT FROM p_revision OR rule.digest IS DISTINCT FROM p_digest THEN
    RAISE EXCEPTION 'Work policy revision changed' USING ERRCODE='P0409';
  END IF;
  IF rule.prepared_by=auth.uid() OR rule.reviewed_by=auth.uid() THEN
    RAISE EXCEPTION 'An independent policy decision is required' USING ERRCODE='42501';
  END IF;
  IF NOT coalesce(length(btrim(p_reason)) BETWEEN 1 AND 500,false) THEN
    RAISE EXCEPTION 'A decision reason is required' USING ERRCODE='22023';
  END IF;
  IF p_step='review' AND rule.phase='draft' THEN
    UPDATE erp_private.t02_work_rule_versions SET phase='reviewed',revision=revision+1,reviewed_by=auth.uid(),
      reviewed_at=clock_timestamp(),review_reason=btrim(p_reason) WHERE id=p_id RETURNING * INTO rule;
  ELSIF p_step='approve' AND rule.phase='reviewed' THEN
    IF lower(rule.effective_period)<=(clock_timestamp() AT TIME ZONE 'Asia/Dubai')::date THEN
      RAISE EXCEPTION 'Approve the work policy before its effective date' USING ERRCODE='23514';
    END IF;
    IF rule.employee_group_id IS NOT NULL THEN
      PERFORM 1 FROM public.hr_employee_categories WHERE id=rule.employee_group_id AND is_active AND deleted_at IS NULL FOR SHARE;
      IF NOT FOUND THEN RAISE EXCEPTION 'Employee group unavailable' USING ERRCODE='23514'; END IF;
    END IF;
    PERFORM erp_private.t02_validate_work_rule(rule.facts,rule.employee_id IS NOT NULL);
    UPDATE erp_private.t02_work_rule_versions SET phase='approved',revision=revision+1,approved_by=auth.uid(),
      approved_at=clock_timestamp(),approval_reason=btrim(p_reason) WHERE id=p_id RETURNING * INTO rule;
  ELSE
    RAISE EXCEPTION 'Work policy is not ready for this decision' USING ERRCODE='P0409';
  END IF;
  RETURN erp_private.t02_save_receipt('work-policy',p_operation,request_digest,
    jsonb_build_object('id',rule.id,'revision',rule.revision,'digest',rule.digest,'phase',rule.phase));
END;
$$;

CREATE FUNCTION public.t02_list_work_rules(
  p_company bigint,p_branch bigint,p_category text,p_offset integer,p_limit integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE result jsonb;
DECLARE can_read_exception_reason boolean;
BEGIN
  IF NOT erp_private.t02_has_scope('integrated.policy.view',p_company,p_branch) THEN
    RAISE EXCEPTION 'Work policy scope unavailable' USING ERRCODE='42501';
  END IF;
  IF NOT coalesce(p_offset>=0 AND p_limit BETWEEN 1 AND 100,false)
     OR (p_category IS NOT NULL AND NOT erp_private.t02_rule_category(p_category)) THEN
    RAISE EXCEPTION 'Invalid work policy list criteria' USING ERRCODE='22023';
  END IF;
  can_read_exception_reason := erp_private.t02_has_scope('integrated.policy.review',p_company,p_branch)
    OR erp_private.t02_has_scope('integrated.policy.exception',p_company,p_branch);
  WITH matching AS MATERIALIZED (
    SELECT r.id,r.company_id,r.employee_id,r.employee_group_id,r.category,lower(r.effective_period) AS effective_from,
           upper(r.effective_period) AS effective_until,
           CASE WHEN can_read_exception_reason THEN r.facts ELSE r.facts - 'exception_reason' END AS facts,
           r.digest,r.phase,r.revision
      FROM erp_private.t02_work_rule_versions r
      LEFT JOIN public.employees e ON e.id=r.employee_id AND e.owner_company_id=r.company_id AND e.deleted_at IS NULL
     WHERE r.company_id=p_company AND (p_category IS NULL OR r.category=p_category)
       AND (r.employee_id IS NULL OR (e.id IS NOT NULL AND public.current_user_can_view_employee(e.id)))
       AND (p_branch IS NULL OR e.branch_id=p_branch)
  ), page AS (SELECT * FROM matching ORDER BY id DESC OFFSET p_offset LIMIT p_limit)
  SELECT jsonb_build_object('totalCount',(SELECT count(*) FROM matching),'rows',
          coalesce((SELECT jsonb_agg(to_jsonb(page) ORDER BY page.id DESC) FROM page),'[]'::jsonb)) INTO result;
  RETURN result;
END;
$$;

CREATE FUNCTION public.t02_resolve_work_rule(p_employee bigint,p_work_date date,p_category text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE employee public.employees;
DECLARE matches erp_private.t02_work_rule_versions[];
DECLARE selected erp_private.t02_work_rule_versions;
BEGIN
  SELECT * INTO employee FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR SHARE;
  IF employee.id IS NULL OR NOT public.current_user_can_view_employee(p_employee)
     OR NOT erp_private.t02_has_scope('integrated.policy.view',employee.owner_company_id,employee.branch_id) THEN
    RAISE EXCEPTION 'Work policy scope unavailable' USING ERRCODE='42501';
  END IF;
  IF NOT coalesce(isfinite(p_work_date),false) OR NOT erp_private.t02_rule_category(p_category) THEN
    RAISE EXCEPTION 'Invalid work date or policy category' USING ERRCODE='22023';
  END IF;
  IF p_work_date<coalesce(employee.actual_joining_date,employee.joining_date) THEN
    RETURN jsonb_build_object('status','missing');
  END IF;
  SELECT array_agg(candidate.rule ORDER BY candidate.priority DESC,candidate.id) INTO matches FROM (
    SELECT r AS rule,r.priority,r.id FROM erp_private.t02_work_rule_versions r
     WHERE r.company_id=employee.owner_company_id AND r.category=p_category AND r.phase='approved'
       AND r.effective_period @> p_work_date
       AND ((r.priority=2 AND r.scope_key=employee.id)
         OR (r.priority=1 AND r.scope_key=employee.employee_category_id) OR r.priority=0)
     ORDER BY r.priority DESC,r.id LIMIT 2
  ) AS candidate;
  IF matches IS NULL THEN RETURN jsonb_build_object('status','missing'); END IF;
  IF cardinality(matches)=2 AND matches[1].priority=matches[2].priority THEN
    RETURN jsonb_build_object('status','conflicting');
  END IF;
  selected := matches[1];
  RETURN jsonb_build_object('status','resolved','id',selected.id,'revision',selected.revision,'digest',selected.digest,
    'facts',selected.facts - 'exception_reason','effective_from',lower(selected.effective_period),
    'effective_until',upper(selected.effective_period));
END;
$$;

REVOKE ALL ON FUNCTION erp_private.t02_lock_validity_assignment(),erp_private.t02_has_scope(text,bigint,bigint),
  erp_private.t02_cross_company_custody_allowed(bigint,bigint,bigint,bigint),erp_private.t02_digest(jsonb),
  erp_private.t02_replay(text,uuid,text),erp_private.t02_save_receipt(text,uuid,text,jsonb),erp_private.t02_rule_category(text),
  erp_private.t02_employee_branch(bigint,bigint),erp_private.t02_validate_work_rule(jsonb,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.t02_prepare_work_rule(bigint,bigint,bigint,text,date,date,jsonb,uuid),
  public.t02_decide_work_rule(bigint,integer,text,text,text,uuid),public.t02_list_work_rules(bigint,bigint,text,integer,integer),
  public.t02_resolve_work_rule(bigint,date,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t02_prepare_work_rule(bigint,bigint,bigint,text,date,date,jsonb,uuid),
  public.t02_decide_work_rule(bigint,integer,text,text,text,uuid),public.t02_list_work_rules(bigint,bigint,text,integer,integer),
  public.t02_resolve_work_rule(bigint,date,text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
