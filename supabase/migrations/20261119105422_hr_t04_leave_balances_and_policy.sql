BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=public,extensions,pg_catalog;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('hr.leave.assist','Prepare and verify leave on behalf of an employee','HR','assist','held'),
 ('hr.leave.approve','Independently approve assisted leave and balance changes','HR','approve','held'),
 ('hr.leave.sick.review','Verify and decide routine sick evidence','HR','review','held'),
 ('hr.leave.sick.exception','Approve a configured sick evidence exception','HR','exception','held'),
 ('hr.leave.payroll.read','Read approved leave pay segments','HR','read','held'),
 ('hr.leave.policy.prepare','Prepare dated leave policy and accrual rules','HR','prepare','held');

CREATE TABLE erp_private.t04_setup (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 kind text NOT NULL CHECK(kind IN('policy','opening','carry','adjustment')),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint REFERENCES public.branches(id),
 employee_id bigint REFERENCES public.employees(id),
 facts jsonb NOT NULL,
 digest text NOT NULL,
 proposed_by uuid NOT NULL,
 proposed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 approved_by uuid,
 approved_at timestamptz,
 CHECK(approved_by IS NULL OR approved_by<>proposed_by)
);
CREATE TABLE erp_private.t04_policies (
 id bigint PRIMARY KEY REFERENCES erp_private.t04_setup(id),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 employee_id bigint REFERENCES public.employees(id),
 subject_key bigint GENERATED ALWAYS AS (coalesce(employee_id,0)) STORED,
 effective daterange NOT NULL,
 facts jsonb NOT NULL,
 EXCLUDE USING gist(company_id WITH =,subject_key WITH =,effective WITH &&)
);
CREATE TABLE erp_private.t04_periods (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 setup_id bigint NOT NULL UNIQUE REFERENCES erp_private.t04_setup(id),
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 service_start date NOT NULL,
 coverage daterange NOT NULL,
 policy_id bigint NOT NULL REFERENCES erp_private.t04_policies(id),
 cutoff date NOT NULL,
 full_entitlement numeric(6,2) NOT NULL CHECK(full_entitlement>=0),
 opening_earned numeric(6,2) NOT NULL CHECK(opening_earned>=0),
 opening_used numeric(6,2) NOT NULL CHECK(opening_used BETWEEN 0 AND opening_earned),
 opening_sick integer NOT NULL CHECK(opening_sick>=0),
 UNIQUE(employee_id,company_id,service_start,coverage)
);
CREATE TABLE erp_private.t04_cases (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint REFERENCES public.branches(id),
 employment_id bigint NOT NULL REFERENCES erp_private.t03_employment_periods(id),
 category text NOT NULL CHECK(category IN('annual','unpaid','sick')),
 dates daterange NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','reviewed','approved','withdrawn','rejected','cancelled')),
 revision bigint NOT NULL DEFAULT 1,
 fingerprint text NOT NULL,
 submitted_by uuid NOT NULL,
 pro_reviewed_by uuid,
 approved_by uuid,
 cutoff_review text,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX t04_cases_subject ON erp_private.t04_cases(employee_id,id DESC);
CREATE TABLE erp_private.t04_days (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id bigint NOT NULL REFERENCES erp_private.t04_cases(id),
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 request_revision bigint NOT NULL,
 day date NOT NULL,
 policy_id bigint NOT NULL REFERENCES erp_private.t04_policies(id),
 period_id bigint REFERENCES erp_private.t04_periods(id),
 fund_id bigint REFERENCES erp_private.f12_leave_movements(id),
 rate numeric(5,4) NOT NULL CHECK(rate BETWEEN 0 AND 1),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN('reserved','posted','released'))
);
CREATE UNIQUE INDEX t04_one_active_day ON erp_private.t04_days(employee_id,day) WHERE state IN('reserved','posted');
CREATE INDEX t04_case_days ON erp_private.t04_days(case_id,day,id);
CREATE INDEX t04_period_days ON erp_private.t04_days(period_id,fund_id,state);

CREATE TABLE erp_private.t04_sick_evidence (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id bigint NOT NULL REFERENCES erp_private.t04_cases(id),
 medical_id bigint NOT NULL REFERENCES public.employee_medical_records(id),
 document_id bigint NOT NULL REFERENCES public.dms_documents(id),
 version_id bigint NOT NULL REFERENCES public.dms_document_versions(id),
 file_id bigint NOT NULL REFERENCES public.dms_document_files(id),
 file_digest text NOT NULL,
 verification_id bigint NOT NULL REFERENCES erp_private.f12_evidence_verifications(id),
 actor uuid NOT NULL,
 operation_id uuid NOT NULL,
 verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(actor,operation_id)
);
CREATE INDEX t04_sick_evidence_case ON erp_private.t04_sick_evidence(case_id,id DESC);

ALTER TABLE erp_private.f12_leave_movements ADD COLUMN event_key text,
 ADD COLUMN movement_version smallint NOT NULL DEFAULT 1,
 ADD COLUMN entitlement_id bigint REFERENCES erp_private.t04_periods(id),
 ADD COLUMN allocation_id bigint REFERENCES erp_private.t04_days(id),
 ADD COLUMN allocation_revision bigint,
 ADD COLUMN reverses_movement_id bigint REFERENCES erp_private.f12_leave_movements(id),
 ADD COLUMN paired_movement_id bigint REFERENCES erp_private.f12_leave_movements(id),
 ADD COLUMN fund_id bigint REFERENCES erp_private.f12_leave_movements(id),
 ADD COLUMN expires_before date;
UPDATE erp_private.f12_leave_movements SET event_key='f12:'||id WHERE event_key IS NULL;
CREATE FUNCTION erp_private.t04_legacy_movement_key()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NEW.movement_version=1 AND NEW.event_key IS NULL THEN NEW.event_key:='f12:'||NEW.id; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER t04_legacy_movement_key BEFORE INSERT ON erp_private.f12_leave_movements
 FOR EACH ROW EXECUTE FUNCTION erp_private.t04_legacy_movement_key();
ALTER TABLE erp_private.f12_leave_movements ALTER COLUMN event_key SET NOT NULL,
 ALTER COLUMN request_id DROP NOT NULL, ALTER COLUMN balance_id DROP NOT NULL,
 DROP CONSTRAINT f12_leave_movements_request_id_balance_id_effect_key,
 DROP CONSTRAINT f12_leave_movements_effect_check,
 ADD CONSTRAINT t04_movement_version_facts CHECK (
  (movement_version=1 AND request_id IS NOT NULL AND balance_id IS NOT NULL AND effect IN('consume','reverse'))
  OR (movement_version=2 AND request_id IS NULL AND balance_id IS NULL AND entitlement_id IS NOT NULL
      AND effect IN('opening','adjustment','carry-in','carry-out','consume','reverse')));
CREATE UNIQUE INDEX t04_movement_event ON erp_private.f12_leave_movements(event_key);
CREATE UNIQUE INDEX t04_legacy_movement_uniqueness ON erp_private.f12_leave_movements(request_id,balance_id,effect) WHERE movement_version=1;
CREATE UNIQUE INDEX t04_allocation_movement_once ON erp_private.f12_leave_movements(allocation_id,effect) WHERE movement_version=2 AND allocation_id IS NOT NULL;
CREATE INDEX t04_entitlement_movements ON erp_private.f12_leave_movements(entitlement_id,fund_id) WHERE movement_version=2;

DO $$
DECLARE name text;
BEGIN
 FOREACH name IN ARRAY ARRAY['t04_setup','t04_policies','t04_periods','t04_cases','t04_days','t04_sick_evidence'] LOOP
  EXECUTE format('ALTER TABLE erp_private.%I ENABLE ROW LEVEL SECURITY',name);
  EXECUTE format('REVOKE ALL ON erp_private.%I FROM PUBLIC,anon,authenticated,service_role',name);
 END LOOP;
END;
$$;

CREATE FUNCTION erp_private.t04_today() RETURNS date LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date;
$$;

CREATE FUNCTION erp_private.t04_policy(p_company bigint,p_employee bigint,p_day date)
RETURNS erp_private.t04_policies LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p FROM erp_private.t04_policies p WHERE p.company_id=p_company
  AND (p.employee_id=p_employee OR p.employee_id IS NULL) AND p.effective @> p_day
 ORDER BY (p.employee_id IS NOT NULL) DESC LIMIT 1;
$$;

CREATE FUNCTION erp_private.t04_employment(p_employee bigint,p_day date)
RETURNS erp_private.t03_employment_periods LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p FROM erp_private.t03_employment_periods p WHERE p.employee_id=p_employee AND p.work_period @> p_day;
$$;

CREATE FUNCTION erp_private.t04_service_start(p erp_private.t03_employment_periods,p_rules jsonb)
RETURNS date LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE p_rules->>'service_basis' WHEN 'actual' THEN p.actual_start WHEN 'contractual' THEN p.contractual_start END;
$$;

CREATE FUNCTION erp_private.t04_earned(p erp_private.t04_periods,p_as_of date)
RETURNS numeric LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE rule jsonb;
DECLARE d date:=least(p_as_of,upper(p.coverage)-1);
DECLARE units int;
BEGIN
 IF d<p.cutoff THEN RETURN NULL; END IF;
 SELECT facts INTO STRICT rule FROM erp_private.t04_policies WHERE id=p.policy_id;
 IF rule->>'accrual'='daily' THEN
  RETURN least(p.full_entitlement,p.opening_earned+trunc(p.full_entitlement*(d-p.cutoff)/(upper(p.coverage)-lower(p.coverage)),2));
 END IF;
 SELECT count(*) INTO units FROM generate_series(1,12) i
  WHERE ((lower(p.coverage)+make_interval(months=>i))::date-1)>p.cutoff
    AND ((lower(p.coverage)+make_interval(months=>i))::date-1)<=d;
 RETURN least(p.full_entitlement,p.opening_earned+trunc(p.full_entitlement*units/12,2));
END;
$$;

CREATE FUNCTION erp_private.t04_funds_remaining(
 p_period bigint,p_fund bigint,p_as_of date,p_ignore_case bigint
) RETURNS numeric LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE period erp_private.t04_periods;
DECLARE available numeric;
BEGIN
 SELECT * INTO STRICT period FROM erp_private.t04_periods WHERE id=p_period;
 IF p_fund IS NULL THEN
  available:=erp_private.t04_earned(period,p_as_of)-period.opening_used;
 ELSE
  SELECT m.days INTO STRICT available FROM erp_private.f12_leave_movements m
   WHERE m.id=p_fund AND m.entitlement_id=p_period AND m.effect='carry-in' AND m.movement_version=2;
 END IF;
 RETURN available + (SELECT coalesce(sum(m.days),0) FROM erp_private.f12_leave_movements m
  WHERE m.entitlement_id=p_period AND m.fund_id IS NOT DISTINCT FROM p_fund
   AND m.effect IN('adjustment','carry-out','consume','reverse') AND m.movement_version=2)
  -(SELECT count(*) FROM erp_private.t04_days d JOIN erp_private.t04_cases c ON c.id=d.case_id
   WHERE d.period_id=p_period AND d.fund_id IS NOT DISTINCT FROM p_fund AND d.state='reserved'
    AND d.rate=1 AND c.category='annual' AND d.case_id IS DISTINCT FROM p_ignore_case);
END;
$$;

CREATE FUNCTION erp_private.t04_post_movement(
 p_period bigint,p_kind text,p_days numeric,p_key text,p_operation uuid,
 p_allocation bigint DEFAULT NULL,p_revision bigint DEFAULT NULL,p_fund bigint DEFAULT NULL,
 p_reverses bigint DEFAULT NULL,p_pair bigint DEFAULT NULL,p_expiry date DEFAULT NULL
) RETURNS bigint LANGUAGE sql VOLATILE SET search_path='' AS $$
 INSERT INTO erp_private.f12_leave_movements(employee_id,period_start,period_end,days,effect,source_operation,actor,
   event_key,movement_version,entitlement_id,allocation_id,allocation_revision,fund_id,reverses_movement_id,paired_movement_id,expires_before)
 SELECT p.employee_id,lower(p.coverage),upper(p.coverage)-1,p_days,p_kind,p_operation,auth.uid(),
   p_key,2,p.id,p_allocation,p_revision,p_fund,p_reverses,p_pair,p_expiry FROM erp_private.t04_periods p WHERE p.id=p_period
 RETURNING id;
$$;

CREATE FUNCTION erp_private.t04_validate_policy(p jsonb)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE field text;
BEGIN
 IF p - ARRAY['from','until','service_basis','accrual','annual_days','carry_limit','carry_valid_days','sick_full_days','sick_partial_days',
   'sick_partial_rate','sick_wait_months','annual_wait_months','sick_exception','excluded_dates','first_year_days']<>'{}'::jsonb
  OR coalesce(p->>'service_basis','') NOT IN('actual','contractual') OR coalesce(p->>'accrual','') NOT IN('daily','monthly')
  OR jsonb_typeof(p->'sick_exception') IS DISTINCT FROM 'boolean'
  OR jsonb_typeof(p->'excluded_dates') IS DISTINCT FROM 'array'
  OR jsonb_typeof(p->'from') IS DISTINCT FROM 'string' OR jsonb_typeof(p->'until') IS DISTINCT FROM 'string'
  OR NOT isfinite((p->>'from')::date) OR NOT isfinite((p->>'until')::date) OR (p->>'from')::date>=(p->>'until')::date THEN
  RAISE EXCEPTION 'Approved policy needs exact dates, calendar and accrual treatment' USING ERRCODE='22023';
 END IF;
 FOREACH field IN ARRAY ARRAY['annual_days','first_year_days','carry_limit','carry_valid_days','sick_full_days','sick_partial_days','sick_partial_rate','sick_wait_months','annual_wait_months'] LOOP
  IF jsonb_typeof(p->field) IS DISTINCT FROM 'number' OR (p->>field)::numeric NOT BETWEEN 0 AND 366 THEN
   RAISE EXCEPTION 'Invalid leave rule quantity' USING ERRCODE='22023'; END IF;
 END LOOP;
 IF (p->>'sick_partial_rate')::numeric NOT BETWEEN 0 AND 1
  OR (p->>'sick_partial_rate')::numeric<>round((p->>'sick_partial_rate')::numeric,4)
  OR jsonb_array_length(p->'excluded_dates')>366
  OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(p->'excluded_dates') x(day)
    WHERE day IS NULL OR NOT isfinite(day::date) OR day::date<(p->>'from')::date OR day::date>=(p->>'until')::date) THEN
  RAISE EXCEPTION 'Invalid approved sick tier or excluded dates' USING ERRCODE='22023'; END IF;
 FOREACH field IN ARRAY ARRAY['carry_valid_days','sick_full_days','sick_partial_days','sick_wait_months','annual_wait_months'] LOOP
  IF (p->>field)::numeric<>trunc((p->>field)::numeric) THEN RAISE EXCEPTION 'A whole number is required' USING ERRCODE='22023'; END IF;
 END LOOP;
 FOREACH field IN ARRAY ARRAY['annual_days','first_year_days','carry_limit'] LOOP
  IF (p->>field)::numeric<>round((p->>field)::numeric,2) THEN RAISE EXCEPTION 'Use up to two decimal places' USING ERRCODE='22023'; END IF;
 END LOOP;
END;
$$;

CREATE FUNCTION public.t04_prepare_leave_setup(
 p_kind text,p_company bigint,p_employee bigint,p_facts jsonb,p_operation uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE employee public.employees;
DECLARE entry erp_private.t04_setup;
DECLARE hashed text;
DECLARE saved jsonb;
BEGIN
 IF p_kind IS NULL OR p_kind NOT IN('policy','opening','carry','adjustment') OR jsonb_typeof(p_facts) IS DISTINCT FROM 'object'
   OR octet_length(p_facts::text)>12000 OR (p_employee IS NULL AND p_kind<>'policy') THEN
  RAISE EXCEPTION 'Choose a complete policy or balance change' USING ERRCODE='22023'; END IF;
 IF p_employee IS NOT NULL THEN
  SELECT * INTO employee FROM public.employees WHERE id=p_employee AND owner_company_id=p_company AND deleted_at IS NULL FOR SHARE;
  IF employee.id IS NULL THEN RAISE EXCEPTION 'Leave scope unavailable' USING ERRCODE='42501'; END IF;
 END IF;
 IF NOT erp_private.t02_has_scope(CASE WHEN p_kind='policy' THEN 'hr.leave.policy.prepare' ELSE 'hr.leave.assist' END,p_company,employee.branch_id) THEN
  RAISE EXCEPTION 'Leave setup scope unavailable' USING ERRCODE='42501'; END IF;
 hashed:=erp_private.t02_digest(jsonb_build_array('setup',p_kind,p_company,p_employee,p_facts));
 saved:=erp_private.t02_replay('leave-setup',p_operation,hashed);
 IF saved IS NOT NULL THEN RETURN saved; END IF;
 IF p_kind='policy' THEN PERFORM erp_private.t04_validate_policy(p_facts);
 ELSIF coalesce(length(btrim(p_facts->>'evidence_reference')) BETWEEN 1 AND 1000,false)=false THEN
  RAISE EXCEPTION 'Reviewed source and cutoff evidence required' USING ERRCODE='22023'; END IF;
 INSERT INTO erp_private.t04_setup(kind,company_id,branch_id,employee_id,facts,digest,proposed_by)
 VALUES(p_kind,p_company,employee.branch_id,p_employee,p_facts,hashed,auth.uid()) RETURNING * INTO entry;
 RETURN erp_private.t02_save_receipt('leave-setup',p_operation,hashed,jsonb_build_object('id',entry.id,'digest',hashed,'status','proposed'));
END;
$$;

CREATE FUNCTION public.t04_approve_leave_setup(p_id bigint,p_digest text,p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE entry erp_private.t04_setup;
DECLARE employment erp_private.t03_employment_periods;
DECLARE policy erp_private.t04_policies;
DECLARE source erp_private.t04_periods;
DECLARE destination erp_private.t04_periods;
DECLARE d date;
DECLARE anchor date;
DECLARE span daterange;
DECLARE full_days numeric;
DECLARE quantity numeric;
DECLARE debit bigint;
DECLARE hashed text;
DECLARE saved jsonb;
BEGIN
 SELECT * INTO entry FROM erp_private.t04_setup WHERE id=p_id FOR UPDATE;
 IF entry.id IS NULL OR NOT erp_private.t02_has_scope('hr.leave.approve',entry.company_id,entry.branch_id) THEN
  RAISE EXCEPTION 'Leave setup scope unavailable' USING ERRCODE='42501'; END IF;
 hashed:=erp_private.t02_digest(jsonb_build_array('approve-setup',p_id,p_digest));
 saved:=erp_private.t02_replay('leave-setup',p_operation,hashed);
 IF saved IS NOT NULL THEN RETURN saved; END IF;
 IF entry.digest IS DISTINCT FROM p_digest OR entry.approved_at IS NOT NULL THEN RAISE EXCEPTION 'Leave setup changed' USING ERRCODE='P0409'; END IF;
 IF entry.proposed_by=auth.uid() THEN RAISE EXCEPTION 'Independent approval is required' USING ERRCODE='42501'; END IF;
 IF entry.employee_id IS NOT NULL THEN
  PERFORM 1 FROM public.employees e WHERE e.id=entry.employee_id AND e.owner_company_id=entry.company_id
   AND e.branch_id IS NOT DISTINCT FROM entry.branch_id AND e.deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The employee scope changed' USING ERRCODE='42501'; END IF;
 END IF;
 IF entry.kind='policy' THEN
  INSERT INTO erp_private.t04_policies VALUES(entry.id,entry.company_id,entry.employee_id,
   DEFAULT,daterange((entry.facts->>'from')::date,(entry.facts->>'until')::date,'[)'),entry.facts);
 ELSIF entry.kind='opening' THEN
  d:=(entry.facts->>'cutoff')::date;
  employment:=erp_private.t04_employment(entry.employee_id,d);
  policy:=erp_private.t04_policy(entry.company_id,entry.employee_id,d);
  anchor:=erp_private.t04_service_start(employment,policy.facts);
  span:=erp_private.f12_leave_period(d,anchor,'joining_anniversary');
  IF d IS NULL OR NOT isfinite(d) OR d>erp_private.t04_today() OR employment.company_id IS DISTINCT FROM entry.company_id
     OR employment.branch_id IS DISTINCT FROM entry.branch_id OR policy.id IS NULL OR span IS NULL THEN
   RAISE EXCEPTION 'Verified employment, cutoff and dated leave policy required' USING ERRCODE='23514'; END IF;
  -- Carry in old summary cards is ambiguous. Do not guess dates, paid units, or conflicts.
  IF EXISTS(SELECT 1 FROM public.employee_leave_balances b JOIN public.hr_leave_types t ON t.id=b.leave_type_id
      WHERE b.employee_id=entry.employee_id AND t.code IN('ANNUAL','SICK')
       AND ((b.period_start IS NULL AND b.leave_year BETWEEN extract(year FROM lower(span)) AND extract(year FROM upper(span)-1))
        OR (b.period_start<upper(span) AND b.period_end>=lower(span)
          AND (b.carry_forward<>0 OR NOT erp_private.f12_leave_balance_reconciled(b.id)))))
    OR EXISTS(SELECT 1 FROM public.employee_leave_requests r JOIN public.hr_leave_types t ON t.id=r.leave_type_id
      WHERE r.employee_id=entry.employee_id AND t.code IN('ANNUAL','UNPAID','SICK') AND r.deleted_at IS NULL
       AND r.approval_status IN('pending','approved') AND r.start_date<upper(span) AND r.end_date>=lower(span)
       AND (r.end_date>=d OR r.approval_status='pending' OR r.f12_ledger_version IS DISTINCT FROM 1)) THEN
   RAISE EXCEPTION 'Legacy balances or requests need reconciliation before adoption' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.employee_leave_balances b JOIN public.hr_leave_types t ON t.id=b.leave_type_id
     WHERE b.employee_id=entry.employee_id AND t.code IN('ANNUAL','SICK') AND b.period_start<upper(span) AND b.period_end>=lower(span)
     GROUP BY t.code HAVING count(*)>1) THEN
   RAISE EXCEPTION 'Duplicate legacy periods require review' USING ERRCODE='23514'; END IF;
  IF EXISTS(SELECT 1 FROM public.employee_leave_balances b JOIN public.hr_leave_types t ON t.id=b.leave_type_id
     WHERE b.employee_id=entry.employee_id AND t.code IN('ANNUAL','SICK') AND b.period_start<upper(span) AND b.period_end>=lower(span)
      AND b.used_days IS DISTINCT FROM (entry.facts->>CASE t.code WHEN 'ANNUAL' THEN 'annual_used' ELSE 'sick_used' END)::numeric) THEN
   RAISE EXCEPTION 'Reviewed usage does not match the legacy record' USING ERRCODE='23514'; END IF;
  full_days:=(policy.facts->>CASE WHEN lower(span)=anchor THEN 'first_year_days' ELSE 'annual_days' END)::numeric;
  IF jsonb_typeof(entry.facts->'earned') IS DISTINCT FROM 'number' OR jsonb_typeof(entry.facts->'annual_used') IS DISTINCT FROM 'number'
     OR jsonb_typeof(entry.facts->'sick_used') IS DISTINCT FROM 'number'
     OR (entry.facts->>'sick_used') !~ '^[0-9]{1,3}$'
     OR (entry.facts->>'earned')::numeric NOT BETWEEN 0 AND full_days
     OR (entry.facts->>'annual_used')::numeric NOT BETWEEN 0 AND (entry.facts->>'earned')::numeric THEN
   RAISE EXCEPTION 'Reviewed earned and consumed opening totals are required' USING ERRCODE='22023'; END IF;
  INSERT INTO erp_private.t04_periods(setup_id,employee_id,company_id,service_start,coverage,policy_id,cutoff,full_entitlement,opening_earned,opening_used,opening_sick)
  VALUES(entry.id,entry.employee_id,entry.company_id,anchor,span,policy.id,d,full_days,
    (entry.facts->>'earned')::numeric,(entry.facts->>'annual_used')::numeric,(entry.facts->>'sick_used')::integer)
  RETURNING * INTO destination;
  PERFORM erp_private.t04_post_movement(destination.id,'opening',destination.opening_earned-destination.opening_used,'t04:setup:'||entry.id,p_operation);
 ELSE
  quantity:=(entry.facts->>'days')::numeric;
  SELECT * INTO destination FROM erp_private.t04_periods WHERE id=(entry.facts->>'destination')::bigint
   AND employee_id=entry.employee_id AND company_id=entry.company_id FOR UPDATE;
  IF destination.id IS NULL OR quantity IS NULL OR quantity=0 OR abs(quantity)>366 OR quantity<>round(quantity,2) THEN
   RAISE EXCEPTION 'Verified period and exact quantity required' USING ERRCODE='23514'; END IF;
  IF entry.kind='adjustment' THEN
   IF erp_private.t04_funds_remaining(destination.id,NULL,erp_private.t04_today(),NULL)+quantity<0 THEN
    RAISE EXCEPTION 'Insufficient balance for adjustment' USING ERRCODE='23514'; END IF;
   PERFORM erp_private.t04_post_movement(destination.id,'adjustment',quantity,'t04:setup:'||entry.id,p_operation);
  ELSE
   SELECT * INTO source FROM erp_private.t04_periods WHERE id=(entry.facts->>'source')::bigint AND employee_id=entry.employee_id
    AND company_id=entry.company_id AND service_start=destination.service_start FOR UPDATE;
   SELECT * INTO STRICT policy FROM erp_private.t04_policies WHERE id=destination.policy_id;
   d:=lower(destination.coverage)+(policy.facts->>'carry_valid_days')::int;
   IF source.id IS NULL OR upper(source.coverage)<>lower(destination.coverage) OR lower(destination.coverage)>erp_private.t04_today()
    OR d<=erp_private.t04_today() OR quantity<0 OR quantity>erp_private.t04_funds_remaining(source.id,NULL,upper(source.coverage)-1,NULL)
    OR quantity+(SELECT coalesce(sum(m.days),0) FROM erp_private.f12_leave_movements m WHERE m.entitlement_id=destination.id AND effect='carry-in')
       >(policy.facts->>'carry_limit')::numeric THEN RAISE EXCEPTION 'Carry is expired, excessive or not reconciled' USING ERRCODE='23514'; END IF;
   debit:=erp_private.t04_post_movement(source.id,'carry-out',-quantity,'t04:carry-debit:'||entry.id,p_operation);
   PERFORM erp_private.t04_post_movement(destination.id,'carry-in',quantity,'t04:carry-credit:'||entry.id,p_operation,
    p_pair=>debit,p_expiry=>d);
  END IF;
 END IF;
 UPDATE erp_private.t04_setup SET approved_by=auth.uid(),approved_at=clock_timestamp() WHERE id=entry.id;
 RETURN erp_private.t02_save_receipt('leave-setup',p_operation,hashed,jsonb_strip_nulls(jsonb_build_object(
  'id',entry.id,'status','approved','digest',p_digest,'period_id',destination.id)));
END;
$$;

REVOKE ALL ON FUNCTION erp_private.t04_legacy_movement_key(),erp_private.t04_today(),
 erp_private.t04_policy(bigint,bigint,date),erp_private.t04_employment(bigint,date),
 erp_private.t04_service_start(erp_private.t03_employment_periods,jsonb),erp_private.t04_earned(erp_private.t04_periods,date),
 erp_private.t04_funds_remaining(bigint,bigint,date,bigint),
 erp_private.t04_post_movement(bigint,text,numeric,text,uuid,bigint,bigint,bigint,bigint,bigint,date),
 erp_private.t04_validate_policy(jsonb) FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.t04_prepare_leave_setup(text,bigint,bigint,jsonb,uuid),
 public.t04_approve_leave_setup(bigint,text,uuid) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t04_prepare_leave_setup(text,bigint,bigint,jsonb,uuid),
 public.t04_approve_leave_setup(bigint,text,uuid) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
