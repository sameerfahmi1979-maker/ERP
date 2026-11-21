BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=public,extensions,pg_catalog;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('hr.employment.lifecycle.manage','Prepare and apply employment lifecycle changes','HR','manage','held'),
 ('hr.employment.lifecycle.accept','Independently accept scoped employment changes','HR','accept','held');

CREATE TABLE erp_private.t03_employment_changes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 source_revision bigint NOT NULL,
 kind text NOT NULL CHECK(kind IN('confirm','transfer','end','rehire')),
 effective_on date NOT NULL,
 source_company bigint NOT NULL REFERENCES public.owner_companies(id),
 source_branch bigint REFERENCES public.branches(id),
 destination_company bigint NOT NULL REFERENCES public.owner_companies(id),
 destination_branch bigint REFERENCES public.branches(id),
 contractual_start date,
 eos_id bigint REFERENCES public.employee_eos_cases(id),
 reason text NOT NULL,
 digest text NOT NULL,
 proposed_by uuid NOT NULL,
 proposed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 applied_by uuid,
 applied_at timestamptz
);
CREATE INDEX t03_employment_change_employee ON erp_private.t03_employment_changes(employee_id,id DESC);
CREATE TABLE erp_private.t03_employment_acceptances (
 change_id bigint NOT NULL REFERENCES erp_private.t03_employment_changes(id),
 side text NOT NULL CHECK(side IN('source','destination')),
 actor uuid NOT NULL,
 digest text NOT NULL,
 reason text NOT NULL,
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 PRIMARY KEY(change_id,side), UNIQUE(change_id,actor)
);
CREATE TABLE erp_private.t03_employment_periods (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint REFERENCES public.branches(id),
 employee_category_id bigint REFERENCES public.hr_employee_categories(id),
 work_period daterange NOT NULL CHECK (NOT isempty(work_period) AND NOT lower_inf(work_period)),
 contractual_start date NOT NULL,
 actual_start date NOT NULL,
 source_revision bigint NOT NULL,
 change_id bigint REFERENCES erp_private.t03_employment_changes(id),
 recruitment_link_id bigint REFERENCES public.employee_recruitment_links(id),
 closed_by_change_id bigint REFERENCES erp_private.t03_employment_changes(id),
 CHECK (num_nonnulls(change_id,recruitment_link_id)=1),
 EXCLUDE USING gist(employee_id WITH =,work_period WITH &&)
);
CREATE TABLE erp_private.t03_employee_write_proofs (
 employee_id bigint PRIMARY KEY,
 transaction_id xid8 NOT NULL,
 actor uuid NOT NULL,
 operation_id uuid NOT NULL
);
ALTER TABLE erp_private.t03_employment_changes ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t03_employment_acceptances ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t03_employment_periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t03_employee_write_proofs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t03_employment_changes,erp_private.t03_employment_acceptances,
 erp_private.t03_employment_periods,erp_private.t03_employee_write_proofs FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.t03_guard_employee_lifecycle()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF ROW(OLD.owner_company_id,OLD.branch_id) IS DISTINCT FROM ROW(NEW.owner_company_id,NEW.branch_id)
   OR (OLD.employee_status IN('terminated','archived') AND NEW.employee_status NOT IN('terminated','archived'))
   OR (NEW.employee_status IN('active','probation','on_leave') AND EXISTS(
      SELECT 1 FROM public.employee_recruitment_links l JOIN public.hr_candidates c ON c.id=l.candidate_id
       WHERE l.employee_id=OLD.id AND c.joining_status<>'completed'
       AND (OLD.employee_status NOT IN('active','probation','on_leave') OR NEW.actual_joining_date IS DISTINCT FROM OLD.actual_joining_date)))
   OR (EXISTS(SELECT 1 FROM erp_private.t03_employment_periods p WHERE p.employee_id=OLD.id AND upper_inf(p.work_period))
      AND (NEW.deleted_at IS DISTINCT FROM OLD.deleted_at OR NEW.employee_status IN('terminated','archived')
       OR ROW(NEW.joining_date,NEW.actual_joining_date,NEW.employee_category_id)
       IS DISTINCT FROM ROW(OLD.joining_date,OLD.actual_joining_date,OLD.employee_category_id))) THEN
  IF NOT EXISTS(SELECT 1 FROM erp_private.t03_employee_write_proofs
    WHERE employee_id=OLD.id AND transaction_id=pg_current_xact_id() AND actor=auth.uid()) THEN
   RAISE EXCEPTION 'Use the reviewed employment lifecycle for this change' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER t03_employee_lifecycle BEFORE UPDATE ON public.employees
 FOR EACH ROW EXECUTE FUNCTION erp_private.t03_guard_employee_lifecycle();

CREATE FUNCTION erp_private.t03_write_employee(
 p_employee bigint,p_operation uuid,p_reason text,p_effective date,
 p_company bigint,p_branch bigint,p_contract date,p_actual date,p_status text
) RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE prior_context text:=coalesce(current_setting('erp.f11_employment_change',true),'');
DECLARE new_revision bigint;
DECLARE old_status text;
DECLARE event_id bigint;
BEGIN
 SELECT e.employee_status INTO STRICT old_status FROM public.employees e WHERE e.id=p_employee FOR UPDATE;
 INSERT INTO erp_private.t03_employee_write_proofs VALUES(p_employee,pg_current_xact_id(),auth.uid(),p_operation);
 PERFORM set_config('erp.f11_employment_change',jsonb_build_object('reason',p_reason,'effective_date',p_effective)::text,true);
 UPDATE public.employees SET
   department_id=CASE WHEN ROW(owner_company_id,branch_id) IS DISTINCT FROM ROW(p_company,p_branch) THEN NULL ELSE department_id END,
   designation_id=CASE WHEN ROW(owner_company_id,branch_id) IS DISTINCT FROM ROW(p_company,p_branch) THEN NULL ELSE designation_id END,
   primary_work_site_id=CASE WHEN ROW(owner_company_id,branch_id) IS DISTINCT FROM ROW(p_company,p_branch) THEN NULL ELSE primary_work_site_id END,
   mohre_establishment_id=CASE WHEN owner_company_id IS DISTINCT FROM p_company THEN NULL ELSE mohre_establishment_id END,
   reporting_manager_id=CASE WHEN owner_company_id IS DISTINCT FROM p_company THEN NULL ELSE reporting_manager_id END,
   supervisor_id=CASE WHEN owner_company_id IS DISTINCT FROM p_company THEN NULL ELSE supervisor_id END,
   owner_company_id=p_company,branch_id=p_branch,joining_date=p_contract,actual_joining_date=p_actual,employee_status=p_status,
   inactive_date=CASE WHEN p_status='terminated' THEN p_effective END,
   inactive_reason=CASE WHEN p_status='terminated' THEN p_reason END,
   updated_by=public.current_user_profile_id()
 WHERE id=p_employee RETURNING workspace_revision INTO STRICT new_revision;
 SELECT id INTO event_id FROM public.employee_employment_events WHERE employee_id=p_employee
  AND revision=new_revision AND operation_id=p_operation;
 IF old_status IS DISTINCT FROM p_status THEN
  INSERT INTO public.employee_status_events(employee_id,old_status,new_status,reason,effective_date,created_by,employment_event_id)
  VALUES(p_employee,old_status,p_status,p_reason,p_effective,public.current_user_profile_id(),event_id);
 END IF;
 PERFORM set_config('erp.f11_employment_change',prior_context,true);
 DELETE FROM erp_private.t03_employee_write_proofs WHERE employee_id=p_employee;
 RETURN new_revision;
END;
$$;

CREATE FUNCTION erp_private.t03_finish_candidate_joining(p_candidate bigint,p_actual date,p_reason text,p_operation uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE candidate_link public.employee_recruitment_links;
DECLARE employee public.employees;
DECLARE offer public.hr_offers;
DECLARE new_revision bigint;
BEGIN
 SELECT * INTO STRICT candidate_link FROM public.employee_recruitment_links WHERE candidate_id=p_candidate FOR SHARE;
 SELECT * INTO STRICT offer FROM public.hr_offers WHERE id=candidate_link.offer_id AND deleted_at IS NULL FOR SHARE;
 SELECT * INTO STRICT employee FROM public.employees WHERE id=candidate_link.employee_id AND deleted_at IS NULL FOR UPDATE;
 IF NOT erp_private.f12_subject_allowed(p_candidate,employee.id,'hr.recruitment.manage')
   OR NOT erp_private.t02_has_scope('hr.employment.lifecycle.manage',employee.owner_company_id,employee.branch_id) THEN
   RAISE EXCEPTION 'Scoped HR joining authority required' USING ERRCODE='42501';
 END IF;
 IF offer.offer_status<>'accepted' OR offer.approved_terms_version IS DISTINCT FROM offer.terms_version
   OR offer.accepted_terms_version IS DISTINCT FROM offer.terms_version
   OR offer.approved_by IS NULL OR offer.accepted_by IS NULL OR offer.approved_by IS NOT DISTINCT FROM offer.terms_changed_by
   OR ROW(employee.owner_company_id,employee.branch_id,employee.joining_date)
   IS DISTINCT FROM ROW(offer.owner_company_id,offer.branch_id,offer.proposed_joining_date) THEN
   RAISE EXCEPTION 'Review the linked offer and employer before joining' USING ERRCODE='23514';
 END IF;
 IF p_actual IS NULL OR NOT isfinite(p_actual) OR p_actual<employee.date_of_birth
   OR p_actual>(clock_timestamp() AT TIME ZONE 'Asia/Dubai')::date THEN
   RAISE EXCEPTION 'Enter a verified actual joining date' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM erp_private.t03_employment_periods WHERE recruitment_link_id=candidate_link.id AND actual_start=p_actual)
   AND EXISTS(SELECT 1 FROM erp_private.t03_employment_periods WHERE employee_id=employee.id AND recruitment_link_id=candidate_link.id AND upper_inf(work_period))
   AND employee.actual_joining_date=p_actual AND employee.employee_status IN('active','probation','on_leave') THEN RETURN; END IF;
 IF EXISTS(SELECT 1 FROM erp_private.t03_employment_periods WHERE employee_id=employee.id)
   OR employee.employee_status IN('terminated','archived')
   OR EXISTS(SELECT 1 FROM public.employee_employment_events e WHERE e.employee_id=employee.id AND e.old_values IS NOT NULL
      AND ROW(e.old_values->>'owner_company_id',e.old_values->>'branch_id')
       IS DISTINCT FROM ROW(e.new_values->>'owner_company_id',e.new_values->>'branch_id')) THEN
   RAISE EXCEPTION 'Joining history needs scoped HR review' USING ERRCODE='23514';
 END IF;
 new_revision:=erp_private.t03_write_employee(employee.id,p_operation,p_reason,p_actual,employee.owner_company_id,employee.branch_id,
     offer.proposed_joining_date,p_actual,CASE WHEN employee.employee_status='probation' THEN 'probation' ELSE 'active' END);
 INSERT INTO erp_private.t03_employment_periods(employee_id,company_id,branch_id,employee_category_id,work_period,
  contractual_start,actual_start,source_revision,recruitment_link_id)
 VALUES(employee.id,employee.owner_company_id,employee.branch_id,employee.employee_category_id,daterange(p_actual,NULL,'[)'),
  offer.proposed_joining_date,p_actual,new_revision,candidate_link.id);
END;
$$;

CREATE FUNCTION public.t03_employment_as_of(p_employee bigint,p_work_date date)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE period erp_private.t03_employment_periods;
DECLARE employee public.employees;
BEGIN
 IF NOT erp_private.business_principal_is_active() OR p_employee IS NULL
   OR p_work_date IS NULL OR NOT isfinite(p_work_date) THEN
  RAISE EXCEPTION 'Employment facts unavailable' USING ERRCODE='42501';
 END IF;
 SELECT * INTO period FROM erp_private.t03_employment_periods WHERE employee_id=p_employee AND work_period @> p_work_date;
 IF period.id IS NULL OR p_work_date>(clock_timestamp() AT TIME ZONE 'Asia/Dubai')::date THEN
  SELECT * INTO employee FROM public.employees WHERE id=p_employee AND deleted_at IS NULL;
  IF employee.id IS NULL OR NOT public.current_user_can_view_employee(p_employee) THEN
   RAISE EXCEPTION 'Employment facts unavailable' USING ERRCODE='42501';
  END IF;
  RETURN jsonb_build_object('status','unresolved');
 END IF;
 IF NOT (erp_private.t02_has_scope('hr.employees.view',period.company_id,period.branch_id)
      OR erp_private.t02_has_scope('hr.employee_profile.view',period.company_id,period.branch_id)) THEN
  RAISE EXCEPTION 'Employment facts unavailable' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object('status','resolved','employee_id',period.employee_id,'period_id',period.id,
  'company_id',period.company_id,'branch_id',period.branch_id,'contractual_start',period.contractual_start,
  'actual_start',period.actual_start,'effective_from',lower(period.work_period),'effective_until',upper(period.work_period),
  'source_revision',period.source_revision::text);
END;
$$;

CREATE FUNCTION public.t03_propose_employment_change(
 p_employee bigint,p_revision bigint,p_kind text,p_effective date,p_company bigint,p_branch bigint,
 p_contract date,p_eos bigint,p_reason text,p_operation uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.employees;
DECLARE change_row erp_private.t03_employment_changes;
DECLARE saved jsonb;
DECLARE request_hash text;
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Employment change unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO e FROM public.employees WHERE id=p_employee AND deleted_at IS NULL FOR UPDATE;
 IF e.id IS NULL OR NOT erp_private.t02_has_scope('hr.employment.lifecycle.manage',e.owner_company_id,e.branch_id) THEN
  RAISE EXCEPTION 'Employment change unavailable' USING ERRCODE='42501'; END IF;
 IF p_kind IS NULL OR p_kind NOT IN('confirm','transfer','end','rehire') OR NOT coalesce(isfinite(p_effective),false)
   OR NOT coalesce(length(btrim(p_reason)) BETWEEN 1 AND 1500,false)
   OR (p_kind IN('transfer','rehire') AND (p_company IS NULL OR NOT coalesce(isfinite(p_contract),false)))
   OR (p_kind IN('confirm','end') AND num_nonnulls(p_company,p_branch,p_contract)>0)
   OR ((p_kind IN('end','rehire')) IS DISTINCT FROM (p_eos IS NOT NULL)) THEN
  RAISE EXCEPTION 'Invalid employment change facts' USING ERRCODE='22023';
 END IF;
 IF p_kind IN('transfer','rehire') AND NOT EXISTS(
   SELECT 1 FROM public.owner_companies c WHERE c.id=p_company AND c.status='active'
    AND (p_branch IS NULL OR EXISTS(SELECT 1 FROM public.branches b WHERE b.id=p_branch AND b.owner_company_id=c.id AND b.status='active' AND b.operating_status='active'))
 ) THEN RAISE EXCEPTION 'Destination scope unavailable' USING ERRCODE='23514'; END IF;
 request_hash:=erp_private.t02_digest(jsonb_build_array('propose',p_employee,p_revision,p_kind,p_effective,p_company,p_branch,p_contract,p_eos,p_reason));
 saved:=erp_private.t02_replay('employment',p_operation,request_hash);
 IF saved IS NOT NULL THEN RETURN saved; END IF;
 IF e.workspace_revision IS DISTINCT FROM p_revision THEN RAISE EXCEPTION 'Employee changed since review' USING ERRCODE='P0409'; END IF;
 IF p_kind='transfer' AND ROW(p_company,p_branch) IS NOT DISTINCT FROM ROW(e.owner_company_id,e.branch_id) THEN
  RAISE EXCEPTION 'Choose a different receiving scope' USING ERRCODE='22023'; END IF;
 INSERT INTO erp_private.t03_employment_changes(employee_id,source_revision,kind,effective_on,source_company,source_branch,
  destination_company,destination_branch,contractual_start,eos_id,reason,digest,proposed_by)
 VALUES(e.id,e.workspace_revision,p_kind,p_effective,e.owner_company_id,e.branch_id,coalesce(p_company,e.owner_company_id),
  CASE WHEN p_company IS NOT NULL THEN p_branch ELSE e.branch_id END,p_contract,p_eos,btrim(p_reason),request_hash,auth.uid())
 RETURNING * INTO change_row;
 RETURN erp_private.t02_save_receipt('employment',p_operation,request_hash,jsonb_build_object('id',change_row.id,'digest',change_row.digest,'status','proposed'));
END;
$$;

CREATE FUNCTION public.t03_decide_employment_change(p_change bigint,p_digest text,p_step text,p_reason text,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c erp_private.t03_employment_changes;
DECLARE e public.employees;
DECLARE period erp_private.t03_employment_periods;
DECLARE eos public.employee_eos_cases;
DECLARE result jsonb;
DECLARE request_hash text;
DECLARE revision bigint;
DECLARE cross_scope boolean;
DECLARE next_status text;
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN RAISE EXCEPTION 'Employment change unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('f06-geography-relations',0));
 SELECT * INTO c FROM erp_private.t03_employment_changes WHERE id=p_change FOR UPDATE;
 cross_scope:=ROW(c.source_company,c.source_branch) IS DISTINCT FROM ROW(c.destination_company,c.destination_branch);
 IF c.id IS NULL OR (CASE p_step
  WHEN 'source' THEN NOT erp_private.t02_has_scope('hr.employment.lifecycle.accept',c.source_company,c.source_branch)
  WHEN 'destination' THEN NOT cross_scope OR NOT erp_private.t02_has_scope('hr.employment.lifecycle.accept',c.destination_company,c.destination_branch)
  WHEN 'apply' THEN NOT (erp_private.t02_has_scope('hr.employment.lifecycle.manage',c.source_company,c.source_branch)
           AND erp_private.t02_has_scope('hr.employment.lifecycle.manage',c.destination_company,c.destination_branch))
  ELSE true END) THEN RAISE EXCEPTION 'Employment change unavailable' USING ERRCODE='42501'; END IF;
 request_hash:=erp_private.t02_digest(jsonb_build_array('decide',p_change,p_digest,p_step,p_reason));
 result:=erp_private.t02_replay('employment',p_operation,request_hash);
 IF result IS NOT NULL THEN RETURN result; END IF;
 SELECT * INTO e FROM public.employees WHERE id=c.employee_id AND deleted_at IS NULL FOR UPDATE;
 IF e.id IS NULL OR e.workspace_revision<>c.source_revision OR c.digest IS DISTINCT FROM p_digest OR c.applied_at IS NOT NULL THEN
  RAISE EXCEPTION 'Employee or employment change revision changed' USING ERRCODE='P0409'; END IF;
 IF NOT coalesce(length(btrim(p_reason)) BETWEEN 1 AND 1500,false) THEN
  RAISE EXCEPTION 'Decision reason is required' USING ERRCODE='22023'; END IF;
 IF p_step<>'apply' THEN
  IF auth.uid()=c.proposed_by OR EXISTS(SELECT 1 FROM erp_private.t03_employment_acceptances a WHERE a.change_id=c.id AND a.actor=auth.uid()) THEN
   RAISE EXCEPTION 'An independent decision is required for each side' USING ERRCODE='42501'; END IF;
  INSERT INTO erp_private.t03_employment_acceptances(change_id,side,actor,digest,reason)
  VALUES(c.id,p_step,auth.uid(),p_digest,btrim(p_reason));
  RETURN erp_private.t02_save_receipt('employment',p_operation,request_hash,jsonb_build_object('id',c.id,'digest',p_digest,'status','accepted','side',p_step));
 END IF;
 IF (SELECT count(*) FROM erp_private.t03_employment_acceptances a WHERE a.change_id=c.id AND a.digest=c.digest)
   <> (CASE WHEN cross_scope THEN 2 ELSE 1 END) THEN
  RAISE EXCEPTION 'Required independent acceptances are missing' USING ERRCODE='23514'; END IF;
 IF c.effective_on>(clock_timestamp() AT TIME ZONE 'Asia/Dubai')::date OR c.effective_on<e.date_of_birth
    OR c.contractual_start<e.date_of_birth THEN
  RAISE EXCEPTION 'Employment change is not effective or its dates need review' USING ERRCODE='23514'; END IF;
 SELECT * INTO period FROM erp_private.t03_employment_periods WHERE employee_id=e.id AND upper_inf(work_period) FOR UPDATE;
 IF c.eos_id IS NOT NULL THEN
  SELECT * INTO eos FROM public.employee_eos_cases WHERE id=c.eos_id AND employee_id=e.id AND case_status='closed'
    AND employment_end_date IS NOT NULL AND deleted_at IS NULL FOR SHARE;
  IF eos.id IS NULL OR EXISTS(SELECT 1 FROM public.employee_eos_cases other
     WHERE other.employee_id=e.id AND other.deleted_at IS NULL AND other.case_status='closed' AND other.employment_end_date>eos.employment_end_date) THEN
   RAISE EXCEPTION 'Current closed exit evidence is required' USING ERRCODE='23514'; END IF;
 END IF;
 IF c.kind='confirm' THEN
  IF e.employee_status NOT IN('active','probation','on_leave') OR e.actual_joining_date IS NULL OR c.effective_on<e.actual_joining_date
     OR EXISTS(SELECT 1 FROM erp_private.t03_employment_periods WHERE employee_id=e.id)
     OR EXISTS(SELECT 1 FROM public.employee_employment_events j WHERE j.employee_id=e.id AND j.effective_date>c.effective_on
        AND j.old_values IS NOT NULL AND ROW(j.old_values->>'owner_company_id',j.old_values->>'branch_id')
        IS DISTINCT FROM ROW(j.new_values->>'owner_company_id',j.new_values->>'branch_id'))
     OR EXISTS(SELECT 1 FROM public.employee_recruitment_links l JOIN public.hr_candidates k ON k.id=l.candidate_id
        WHERE l.employee_id=e.id AND k.joining_status<>'completed') THEN
   RAISE EXCEPTION 'Verified unambiguous current employment is required' USING ERRCODE='23514'; END IF;
  revision:=e.workspace_revision;
 ELSIF c.kind='rehire' THEN
  IF period.id IS NOT NULL OR e.employee_status<>'terminated' OR c.effective_on<=eos.employment_end_date
     OR e.inactive_date IS NULL OR c.effective_on<e.inactive_date THEN
   RAISE EXCEPTION 'Rehire requires the same terminated employee after a verified exit' USING ERRCODE='23514'; END IF;
  revision:=erp_private.t03_write_employee(e.id,p_operation,c.reason,c.effective_on,c.destination_company,c.destination_branch,c.contractual_start,c.effective_on,'active');
 ELSE
  IF period.id IS NULL OR ROW(period.company_id,period.branch_id) IS DISTINCT FROM ROW(e.owner_company_id,e.branch_id)
     OR c.effective_on<=lower(period.work_period) OR e.employee_status NOT IN('active','probation','on_leave')
     OR (c.kind='end' AND c.effective_on IS DISTINCT FROM (eos.employment_end_date+1)) THEN
   RAISE EXCEPTION 'Verify the current period and effective date before closing it' USING ERRCODE='23514'; END IF;
  UPDATE erp_private.t03_employment_periods SET work_period=daterange(lower(work_period),c.effective_on,'[)'),closed_by_change_id=c.id WHERE id=period.id;
  next_status:=CASE WHEN c.kind='end' THEN 'terminated' ELSE e.employee_status END;
  revision:=erp_private.t03_write_employee(e.id,p_operation,c.reason,c.effective_on,c.destination_company,c.destination_branch,
    coalesce(c.contractual_start,e.joining_date),CASE WHEN c.kind='transfer' THEN c.effective_on ELSE e.actual_joining_date END,next_status);
 END IF;
 IF c.kind<>'end' THEN
  INSERT INTO erp_private.t03_employment_periods(employee_id,company_id,branch_id,employee_category_id,work_period,
    contractual_start,actual_start,source_revision,change_id)
  VALUES(e.id,c.destination_company,c.destination_branch,e.employee_category_id,daterange(c.effective_on,NULL,'[)'),
    coalesce(c.contractual_start,e.joining_date),CASE WHEN c.kind='confirm' THEN e.actual_joining_date ELSE c.effective_on END,revision,c.id);
 END IF;
 UPDATE erp_private.t03_employment_changes SET applied_by=auth.uid(),applied_at=clock_timestamp() WHERE id=c.id;
 RETURN erp_private.t02_save_receipt('employment',p_operation,request_hash,
  jsonb_build_object('id',c.id,'digest',p_digest,'status','applied','employee_id',e.id,'revision',revision::text));
END;
$$;

CREATE FUNCTION public.t03_read_employment_change(p_change bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c erp_private.t03_employment_changes;
BEGIN
 SELECT * INTO c FROM erp_private.t03_employment_changes WHERE id=p_change;
 IF c.id IS NULL OR NOT (erp_private.t02_has_scope('hr.employment.lifecycle.manage',c.source_company,c.source_branch)
     OR erp_private.t02_has_scope('hr.employment.lifecycle.accept',c.source_company,c.source_branch)
     OR erp_private.t02_has_scope('hr.employment.lifecycle.manage',c.destination_company,c.destination_branch)
     OR erp_private.t02_has_scope('hr.employment.lifecycle.accept',c.destination_company,c.destination_branch)) THEN
  RAISE EXCEPTION 'Employment change unavailable' USING ERRCODE='42501';
 END IF;
 RETURN jsonb_build_object('id',c.id,'employee_id',c.employee_id,'source_revision',c.source_revision::text,
  'kind',c.kind,'effective_on',c.effective_on,'source_company',c.source_company,'source_branch',c.source_branch,
  'destination_company',c.destination_company,'destination_branch',c.destination_branch,'contractual_start',c.contractual_start,
  'reason',c.reason,'digest',c.digest,'applied',c.applied_at IS NOT NULL,
  'source_accepted',EXISTS(SELECT 1 FROM erp_private.t03_employment_acceptances a WHERE a.change_id=c.id AND a.side='source'),
  'destination_accepted',EXISTS(SELECT 1 FROM erp_private.t03_employment_acceptances a WHERE a.change_id=c.id AND a.side='destination'));
END;
$$;

-- Keep the numbered conversion and replay, but require new conversions to remain pending.
-- Reuse F12's checklist and decision receipt. Activate the exact linked employee inside its transaction.
DO $$
DECLARE definition text;
DECLARE patched text;
BEGIN
 definition:=pg_get_functiondef('public.convert_candidate_to_employee_atomic(bigint,uuid,bigint,jsonb)'::regprocedure);
 patched:=replace(definition,'perform erp_private.f12_require_accepted_offer(p_candidate,p_data);',
  'if p_data->>''employee_status'' is distinct from ''inactive'' then raise exception ''A new hire remains pending until actual joining'' using errcode=''23514'';end if;
   perform erp_private.f12_require_accepted_offer(p_candidate,p_data);');
 IF patched=definition THEN RAISE EXCEPTION 'Unrecognized conversion predecessor'; END IF;
 EXECUTE patched;
 definition:=pg_get_functiondef('erp_private.f12_apply_recruitment(uuid,jsonb)'::regprocedure);
 patched:=replace(definition,
  $old$ SELECT to_jsonb(r) INTO rec FROM erp_private.f12_recruitment_receipts$old$,
  $new$ IF kind='joining' AND action='finish' AND NOT EXISTS(
    SELECT 1 FROM public.employee_recruitment_links l JOIN public.employees e ON e.id=l.employee_id
    WHERE l.candidate_id=candidate AND e.deleted_at IS NULL
     AND erp_private.t02_has_scope('hr.employment.lifecycle.manage',e.owner_company_id,e.branch_id)
  ) THEN RAISE EXCEPTION 'Scoped HR joining authority required' USING ERRCODE='42501'; END IF;
 SELECT to_jsonb(r) INTO rec FROM erp_private.f12_recruitment_receipts$new$);
 IF patched=definition THEN RAISE EXCEPTION 'Unrecognized joining replay predecessor'; END IF;
 definition:=patched;
 patched:=replace(definition,
  $old$ ELSIF data<>'{}'::jsonb THEN RAISE EXCEPTION 'Decision cannot edit material terms'$old$,
  $new$ ELSIF kind='joining' AND action='finish' THEN
   IF data-'actual_joining_date'<>'{}'::jsonb OR jsonb_typeof(data->'actual_joining_date') IS DISTINCT FROM 'string'
      OR (data->>'actual_joining_date')!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
     RAISE EXCEPTION 'Actual joining date required' USING ERRCODE='22023';
   END IF;
 ELSIF data<>'{}'::jsonb THEN RAISE EXCEPTION 'Decision cannot edit material terms'$new$);
 IF patched=definition THEN RAISE EXCEPTION 'Unrecognized joining decision predecessor'; END IF;
 definition:=patched;
 patched:=replace(definition,
  $old$   next:=next||jsonb_build_object('joining_status','completed');$old$,
  $new$   PERFORM erp_private.t03_finish_candidate_joining(candidate,(data->>'actual_joining_date')::date,why,p_operation);
   next:=next||jsonb_build_object('joining_status','completed');$new$);
 IF patched=definition THEN RAISE EXCEPTION 'Unrecognized joining completion predecessor'; END IF;
 EXECUTE patched;

 definition:=pg_get_functiondef('erp_private.f11_capture_employment_event()'::regprocedure);
 patched:=replace(definition,' INSERT INTO public.employee_employment_events',
  $new$ IF TG_OP='UPDATE' THEN
   SELECT p.operation_id INTO source_operation FROM erp_private.t03_employee_write_proofs p
    WHERE p.actor=auth.uid() AND p.employee_id=NEW.id AND p.transaction_id=pg_current_xact_id();
 END IF;
 INSERT INTO public.employee_employment_events$new$);
 IF patched=definition THEN RAISE EXCEPTION 'Unrecognized employment journal predecessor'; END IF;
 EXECUTE patched;

 -- T02 must use the historical employer and category once a verified
 -- employment period exists. Retain the prior contract for unmanaged records.
 definition:=pg_get_functiondef('public.t02_resolve_work_rule(bigint,date,text)'::regprocedure);
 patched:=replace(definition,'DECLARE employee public.employees;',
  'DECLARE employee public.employees; DECLARE dated_period erp_private.t03_employment_periods;');
 IF patched=definition THEN RAISE EXCEPTION 'Unrecognized work policy date predecessor'; END IF;
 definition:=patched;
 patched:=replace(definition,
 $old$  IF employee.id IS NULL OR NOT public.current_user_can_view_employee(p_employee)
     OR NOT erp_private.t02_has_scope('integrated.policy.view',employee.owner_company_id,employee.branch_id) THEN
    RAISE EXCEPTION 'Work policy scope unavailable' USING ERRCODE='42501';
  END IF;$old$,
 $new$  IF EXISTS(SELECT 1 FROM erp_private.t03_employment_periods WHERE employee_id=p_employee) THEN
    IF public.t03_employment_as_of(p_employee,p_work_date)->>'status' IS DISTINCT FROM 'resolved' THEN
      RETURN jsonb_build_object('status','missing');
    END IF;
    SELECT * INTO STRICT dated_period FROM erp_private.t03_employment_periods
      WHERE employee_id=p_employee AND work_period @> p_work_date;
    employee.owner_company_id:=dated_period.company_id;
    employee.branch_id:=dated_period.branch_id;
    employee.employee_category_id:=dated_period.employee_category_id;
    employee.joining_date:=dated_period.contractual_start;
    employee.actual_joining_date:=dated_period.actual_start;
  ELSIF employee.id IS NULL OR NOT public.current_user_can_view_employee(p_employee) THEN
    RAISE EXCEPTION 'Work policy scope unavailable' USING ERRCODE='42501';
  END IF;
  IF NOT erp_private.t02_has_scope('integrated.policy.view',employee.owner_company_id,employee.branch_id) THEN
    RAISE EXCEPTION 'Work policy scope unavailable' USING ERRCODE='42501';
  END IF;$new$);
 IF patched=definition THEN RAISE EXCEPTION 'Unrecognized work policy authority predecessor'; END IF;
 EXECUTE patched;
END;
$$;

-- The current workspace can only display both sides of a historical journal
-- event when the caller is still assigned to both captured scopes.
ALTER POLICY employee_employment_events_read ON public.employee_employment_events USING (
 employee_id IN (SELECT erp_private.readable_employee_ids()) AND
 (erp_private.permission_in_scope('hr.employees.view',(new_values->>'owner_company_id')::bigint,(new_values->>'branch_id')::bigint)
  OR erp_private.permission_in_scope('hr.employee_profile.view',(new_values->>'owner_company_id')::bigint,(new_values->>'branch_id')::bigint))
 AND (old_values IS NULL OR
  erp_private.permission_in_scope('hr.employees.view',(old_values->>'owner_company_id')::bigint,(old_values->>'branch_id')::bigint)
  OR erp_private.permission_in_scope('hr.employee_profile.view',(old_values->>'owner_company_id')::bigint,(old_values->>'branch_id')::bigint))
);

REVOKE ALL ON FUNCTION erp_private.t03_guard_employee_lifecycle(),
 erp_private.t03_write_employee(bigint,uuid,text,date,bigint,bigint,date,date,text),
 erp_private.t03_finish_candidate_joining(bigint,date,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.t03_employment_as_of(bigint,date),
 public.t03_propose_employment_change(bigint,bigint,text,date,bigint,bigint,date,bigint,text,uuid),
 public.t03_decide_employment_change(bigint,text,text,text,uuid),public.t03_read_employment_change(bigint) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t03_employment_as_of(bigint,date),
 public.t03_propose_employment_change(bigint,bigint,text,date,bigint,bigint,date,bigint,text,uuid),
 public.t03_decide_employment_change(bigint,text,text,text,uuid),public.t03_read_employment_change(bigint) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
