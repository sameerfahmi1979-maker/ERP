
BEGIN;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('hr.exit.settlement.view','Read scoped exit clearance and settlement','hr','exit_settlement_view','held'),
 ('hr.exit.settlement.hr','Review exact exit clearance and settlement facts','hr','exit_settlement_hr','held'),
 ('hr.exit.settlement.accounts','Calculate and submit a scoped exit settlement','hr','exit_settlement_accounts','held'),
 ('hr.exit.settlement.approve','Independently decide the exact exit settlement','hr','exit_settlement_approve','held'),
 ('hr.exit.settlement.pay','Verify and allocate scoped exit settlement payments','hr','exit_settlement_pay','held');

CREATE TABLE erp_private.t18_cases (
 eos_id bigint PRIMARY KEY REFERENCES public.employee_eos_cases,
 employee_id bigint NOT NULL REFERENCES public.employees,
 employment_id bigint NOT NULL REFERENCES erp_private.t03_employment_periods,
 company_id bigint NOT NULL REFERENCES public.owner_companies,
 branch_id bigint NOT NULL REFERENCES public.branches,
 last_day date NOT NULL CHECK(isfinite(last_day)),
 last_working_day date CHECK(isfinite(last_working_day) AND last_working_day<=last_day),
 opened_by bigint NOT NULL REFERENCES public.user_profiles,
 opened_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
CREATE INDEX t18_scope_employee ON erp_private.t18_cases(company_id,branch_id,employee_id,eos_id);
CREATE INDEX t18_case_employment ON erp_private.t18_cases(employment_id,eos_id);

CREATE TABLE erp_private.t18_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 eos_id bigint NOT NULL REFERENCES erp_private.t18_cases,
 number int NOT NULL CHECK(number>0),
 cutoff timestamptz NOT NULL CHECK(isfinite(cutoff)),
 digest text NOT NULL CHECK(digest~'^[0-9a-f]{64}$'),
 facts jsonb NOT NULL CHECK(jsonb_typeof(facts)='object'),
 policy jsonb NOT NULL CHECK(jsonb_typeof(policy)='object'),
 salary_claim_months date[] NOT NULL DEFAULT '{}',
 gross numeric(20,2) NOT NULL CHECK(gross>=0),
 deductions numeric(20,2) NOT NULL CHECK(deductions>=0),
 net numeric(20,2) GENERATED ALWAYS AS (gross-deductions) STORED,
 currency text REFERENCES public.currencies(currency_code),
 calc_by bigint NOT NULL REFERENCES public.user_profiles,
 calc_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000),
 UNIQUE(eos_id,number),
 UNIQUE(eos_id,id)
);
CREATE TABLE erp_private.t18_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 version_id uuid NOT NULL REFERENCES erp_private.t18_versions,
 key text NOT NULL CHECK(length(key) BETWEEN 1 AND 500),
 category text NOT NULL,
 kind text NOT NULL CHECK(kind IN('earning','deduction')),
 amount numeric(20,2) NOT NULL CHECK(amount>=0),
 currency text NOT NULL REFERENCES public.currencies(currency_code),
 quantity numeric NOT NULL,
 unit text NOT NULL,
 rate numeric NOT NULL,
 original_on date NOT NULL CHECK(isfinite(original_on)),
 available_at timestamptz NOT NULL CHECK(isfinite(available_at)),
 source jsonb NOT NULL CHECK(jsonb_typeof(source)='object'),
 reason text NOT NULL,
 UNIQUE(version_id,key)
);
CREATE INDEX t18_version_lines ON erp_private.t18_lines(version_id,category,id);
CREATE TABLE erp_private.t18_recovery_decisions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 eos_id bigint NOT NULL REFERENCES erp_private.t18_cases,
 case_id bigint NOT NULL REFERENCES erp_private.t13_cases,
 disposition text NOT NULL CHECK(disposition IN('separate','include')),
 fingerprint text NOT NULL CHECK(fingerprint~'^[0-9a-f]{64}$'),
 recommended_by bigint NOT NULL REFERENCES public.user_profiles,
 recommended_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000)
);
CREATE INDEX t18_case_decisions ON erp_private.t18_recovery_decisions(eos_id,case_id,id DESC);
CREATE TABLE erp_private.t18_recovery_acceptances (
 decision_id bigint PRIMARY KEY REFERENCES erp_private.t18_recovery_decisions,
 accepted_by bigint NOT NULL REFERENCES public.user_profiles,
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000)
);
CREATE TABLE erp_private.t18_approvals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 eos_id bigint NOT NULL REFERENCES erp_private.t18_cases,
 version_id uuid NOT NULL UNIQUE,
 digest text NOT NULL CHECK(digest~'^[0-9a-f]{64}$'),
 state text NOT NULL DEFAULT 'approved' CHECK(state IN('approved','revoked')),
 decided_by bigint NOT NULL REFERENCES public.user_profiles,
 decided_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 revoked_by bigint REFERENCES public.user_profiles,
 revoked_at timestamptz,
 FOREIGN KEY(eos_id,version_id) REFERENCES erp_private.t18_versions(eos_id,id),
 CHECK((state='revoked')=(revoked_by IS NOT NULL AND revoked_at IS NOT NULL))
);
CREATE UNIQUE INDEX t18_one_active_approval ON erp_private.t18_approvals(eos_id) WHERE state='approved';
CREATE TABLE erp_private.t18_version_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 version_id uuid NOT NULL REFERENCES erp_private.t18_versions,
 kind text NOT NULL CHECK(kind IN('reviewed','submitted','withdrawn','rejected','approved','request-revoke','decline-revoke','revoked')),
 actor_id bigint NOT NULL REFERENCES public.user_profiles,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000)
);
CREATE INDEX t18_version_event_order ON erp_private.t18_version_events(version_id,id DESC);
CREATE TABLE erp_private.t18_close_receipts (
 eos_id bigint PRIMARY KEY REFERENCES erp_private.t18_cases,
 version_id uuid NOT NULL REFERENCES erp_private.t18_versions,
 actor_id bigint NOT NULL REFERENCES public.user_profiles,
 operation_id uuid NOT NULL UNIQUE,
 closed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 1 AND 1000)
);

DO $$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['t18_cases','t18_versions','t18_lines','t18_recovery_decisions','t18_recovery_acceptances',
                            't18_approvals','t18_version_events','t18_close_receipts'] LOOP
   EXECUTE format('ALTER TABLE erp_private.%I ENABLE ROW LEVEL SECURITY',table_name);
   EXECUTE format('REVOKE ALL ON erp_private.%I FROM PUBLIC,anon,authenticated,service_role',table_name);
   IF table_name NOT IN('t18_cases','t18_approvals') THEN
     EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON erp_private.%I
       FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_history()',table_name||'_retain',table_name);
   END IF;
 END LOOP;
END $$;

CREATE FUNCTION erp_private.t18_keep_approval()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF TG_OP='DELETE' OR OLD.state<>'approved' OR NEW.state<>'revoked'
   OR to_jsonb(OLD)-ARRAY['state','revoked_by','revoked_at'] IS DISTINCT FROM to_jsonb(NEW)-ARRAY['state','revoked_by','revoked_at'] THEN
   RAISE EXCEPTION 'The exact exit approval is retained' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER t18_retain_approval BEFORE UPDATE OR DELETE ON erp_private.t18_approvals
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_keep_approval();

CREATE FUNCTION erp_private.t18_can(p_company bigint,p_branch bigint,p_mode text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
BEGIN
 RETURN p_company IS NOT NULL AND p_branch IS NOT NULL AND coalesce(p_mode IN('view','hr','accounts','approve','pay'),false)
  AND erp_private.t02_has_scope('hr.exit.settlement.view',p_company,p_branch)
  AND erp_private.t02_has_scope('hr.payroll.view',p_company,p_branch)
  AND (erp_private.t02_has_scope('hr.eos.view',p_company,p_branch) OR erp_private.t02_has_scope('hr.actions.view',p_company,p_branch))
  AND (p_mode='view' OR erp_private.t02_has_scope('hr.exit.settlement.'||p_mode,p_company,p_branch));
END $$;

CREATE FUNCTION erp_private.t18_lock_case(p_eos bigint)
RETURNS erp_private.t18_cases LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE entry erp_private.t18_cases;
BEGIN
 SELECT * INTO entry FROM erp_private.t18_cases WHERE eos_id=p_eos;
 IF NOT FOUND THEN RAISE EXCEPTION 'Scoped exit case unavailable' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('t14-payroll:'||entry.company_id,0));
 SELECT * INTO STRICT entry FROM erp_private.t18_cases WHERE eos_id=p_eos FOR UPDATE;
 PERFORM 1 FROM public.employee_eos_cases e WHERE e.id=p_eos AND e.employee_id=entry.employee_id FOR UPDATE NOWAIT;
 IF NOT FOUND THEN RAISE EXCEPTION 'The existing HR exit case changed' USING ERRCODE='PT409'; END IF;
 RETURN entry;
EXCEPTION WHEN lock_not_available THEN
 RAISE EXCEPTION 'The existing HR exit case is changing. Retry the same action.' USING ERRCODE='40001';
END $$;

CREATE FUNCTION erp_private.t18_version_state(p_version uuid)
RETURNS text LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce((SELECT CASE kind WHEN 'decline-revoke' THEN 'approved' ELSE kind END
   FROM erp_private.t18_version_events WHERE version_id=p_version ORDER BY id DESC LIMIT 1),'draft');
$$;

REVOKE ALL ON FUNCTION erp_private.t18_keep_approval(),erp_private.t18_can(bigint,bigint,text),
 erp_private.t18_lock_case(bigint),erp_private.t18_version_state(uuid) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
