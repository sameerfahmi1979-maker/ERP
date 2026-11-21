
BEGIN;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('hr.recovery.review','Review employee responsibility and disputes','hr','recovery_review','held'),
 ('hr.recovery.policy','Prepare or independently approve dated recovery policy','hr','recovery_policy','held'),
 ('hr.recovery.accounts','Reconcile recovery evidence and propose repayment','hr','recovery_accounts','held');

CREATE TABLE erp_private.t13_policies (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL REFERENCES public.owner_companies,
 branch_id bigint NOT NULL REFERENCES public.branches,
 kind text NOT NULL CHECK(kind IN('fine','damage')),
 validity daterange NOT NULL CHECK(NOT isempty(validity) AND NOT lower_inf(validity) AND NOT upper_inf(validity)),
 legal_basis text NOT NULL CHECK(length(btrim(legal_basis)) BETWEEN 1 AND 2000),
 currency text NOT NULL CHECK(currency ~ '^[A-Z]{3}$'),
 case_limit numeric(16,2) NOT NULL CHECK(case_limit>0),
 period_limit numeric(16,2) NOT NULL CHECK(period_limit>0 AND period_limit<=case_limit),
 wage_basis text NOT NULL CHECK(wage_basis IN('fixed-amount','gross-wage','basic-wage','daily-wage')),
 wage_factor numeric(9,6),
 priority integer NOT NULL CHECK(priority BETWEEN 1 AND 999),
 allow_deduct_correct boolean NOT NULL,
 prepared_by bigint NOT NULL REFERENCES public.user_profiles,
 reason text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 approved_by bigint REFERENCES public.user_profiles,
 approved_at timestamptz,
 decision_reason text,
 CHECK(coalesce((wage_basis='fixed-amount' AND wage_factor IS NULL) OR
   (wage_basis IN('gross-wage','basic-wage') AND wage_factor>0 AND wage_factor<=1) OR
   (wage_basis='daily-wage' AND wage_factor>0 AND wage_factor<=31),false)),
 CHECK((approved_by IS NULL)=(approved_at IS NULL) AND (approved_by IS NULL OR approved_by<>prepared_by)),
 EXCLUDE USING gist(branch_id WITH =,kind WITH =,validity WITH &&) WHERE(approved_at IS NOT NULL)
);

CREATE TABLE erp_private.t13_recovery_proofs (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id bigint NOT NULL REFERENCES erp_private.t13_cases,
 document_id bigint NOT NULL REFERENCES public.dms_documents,
 version_id bigint NOT NULL REFERENCES public.dms_document_versions,
 file_id bigint NOT NULL REFERENCES public.dms_document_files,
 UNIQUE(case_id,document_id,version_id,file_id)
);
CREATE INDEX t13_recovery_proof_file ON erp_private.t13_recovery_proofs(file_id);
CREATE INDEX t13_recovery_proof_version ON erp_private.t13_recovery_proofs(version_id);
CREATE INDEX t13_recovery_proof_document ON erp_private.t13_recovery_proofs(document_id);

CREATE TABLE erp_private.t13_hr_reviews (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id bigint NOT NULL REFERENCES erp_private.t13_cases,
 source_digest text NOT NULL,
 policy_id bigint REFERENCES erp_private.t13_policies,
 decision text NOT NULL CHECK(decision IN('employee','wear','employer','third-party','insurer','unresolved')),
 ceiling numeric(16,2) NOT NULL CHECK(ceiling>=0),
 notified_on date,
 notice_id bigint REFERENCES erp_private.t13_recovery_proofs,
 response text CHECK(response IN('acknowledged','disputed','no-response')),
 response_id bigint REFERENCES erp_private.t13_recovery_proofs,
 response_note text,
 reviewed_by bigint NOT NULL REFERENCES public.user_profiles,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 CHECK((decision='employee' AND ceiling>0 AND policy_id IS NOT NULL AND notified_on IS NOT NULL AND notice_id IS NOT NULL AND response IS NOT NULL)
   OR (decision<>'employee' AND ceiling=0))
);
CREATE INDEX t13_hr_review_case ON erp_private.t13_hr_reviews(case_id,id DESC);

CREATE TABLE erp_private.t13_disputes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id bigint NOT NULL REFERENCES erp_private.t13_cases,
 review_id bigint NOT NULL REFERENCES erp_private.t13_hr_reviews,
 resolves_id bigint UNIQUE REFERENCES erp_private.t13_disputes,
 amount numeric(16,2) NOT NULL CHECK(amount>0),
 upheld numeric(16,2) CHECK(upheld>=0 AND upheld<=amount),
 route text NOT NULL CHECK(route IN('defer','deduct-correct')),
 evidence_id bigint NOT NULL REFERENCES erp_private.t13_recovery_proofs,
 actor_id bigint NOT NULL REFERENCES public.user_profiles,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 CHECK((resolves_id IS NULL)=(upheld IS NULL))
);
CREATE INDEX t13_dispute_case ON erp_private.t13_disputes(case_id,id DESC);

CREATE TABLE erp_private.t13_reconciliations (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id bigint NOT NULL REFERENCES erp_private.t13_cases,
 hr_review_id bigint REFERENCES erp_private.t13_hr_reviews,
 source_digest text NOT NULL,
 actual_cost numeric(16,2) NOT NULL CHECK(actual_cost>=0),
 evidence_id bigint NOT NULL REFERENCES erp_private.t13_recovery_proofs,
 checked_by bigint NOT NULL REFERENCES public.user_profiles,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL
);
CREATE INDEX t13_reconciliation_case ON erp_private.t13_reconciliations(case_id,id DESC);

CREATE TABLE erp_private.t13_money_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id bigint NOT NULL REFERENCES erp_private.t13_cases,
 kind text NOT NULL CHECK(kind IN('authority-paid','employee-direct','insurer-offset','third-party-offset','employee-cash','employee-cash-allocated')),
 parent_id bigint REFERENCES erp_private.t13_money_events,
 reverses_id bigint REFERENCES erp_private.t13_money_events,
 amount numeric(16,2) NOT NULL CHECK(amount>0),
 reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 160),
 cash_company_id bigint REFERENCES public.owner_companies,
 value_date date NOT NULL,
 evidence_id bigint NOT NULL REFERENCES erp_private.t13_recovery_proofs,
 actor_id bigint NOT NULL REFERENCES public.user_profiles,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 UNIQUE(case_id,kind,reference),
 CHECK((kind='employee-cash-allocated')=(parent_id IS NOT NULL)),
 CHECK((kind='employee-cash')=(cash_company_id IS NOT NULL))
);
CREATE UNIQUE INDEX t13_unique_employee_cash_receipt ON erp_private.t13_money_events(cash_company_id,reference)
 WHERE kind='employee-cash' AND reverses_id IS NULL;
CREATE INDEX t13_money_case ON erp_private.t13_money_events(case_id,kind,id);
CREATE INDEX t13_money_parent ON erp_private.t13_money_events(parent_id) WHERE parent_id IS NOT NULL;
CREATE INDEX t13_money_reversal ON erp_private.t13_money_events(reverses_id) WHERE reverses_id IS NOT NULL;

CREATE TABLE erp_private.t13_schedules (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id bigint NOT NULL REFERENCES erp_private.t13_cases,
 hr_review_id bigint NOT NULL REFERENCES erp_private.t13_hr_reviews,
 reconciliation_id bigint NOT NULL REFERENCES erp_private.t13_reconciliations,
 mode text NOT NULL CHECK(mode IN('one-time','instalments')),
 principal numeric(16,2) NOT NULL CHECK(principal>0),
 prepared_by bigint NOT NULL REFERENCES public.user_profiles,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL
);
CREATE INDEX t13_schedule_case ON erp_private.t13_schedules(case_id,id DESC);
CREATE TABLE erp_private.t13_instalments (
 schedule_id bigint NOT NULL REFERENCES erp_private.t13_schedules,
 due_month date NOT NULL CHECK(due_month=date_trunc('month',due_month::timestamp)::date),
 amount numeric(16,2) NOT NULL CHECK(amount>0),
 PRIMARY KEY(schedule_id,due_month)
);
CREATE TABLE erp_private.t13_refunds (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id bigint NOT NULL REFERENCES erp_private.t13_cases,
 schedule_id bigint NOT NULL REFERENCES erp_private.t13_schedules,
 original_allocation_id bigint NOT NULL,
 reconciliation_id bigint NOT NULL REFERENCES erp_private.t13_reconciliations,
 amount numeric(16,2) NOT NULL CHECK(amount>0),
 first_month date NOT NULL CHECK(first_month=date_trunc('month',first_month::timestamp)::date),
 prepared_by bigint NOT NULL REFERENCES public.user_profiles,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL
);
CREATE INDEX t13_refund_case ON erp_private.t13_refunds(case_id,id DESC);
CREATE INDEX t13_refund_allocation ON erp_private.t13_refunds(original_allocation_id);
CREATE TABLE erp_private.t13_refund_withdrawals (
 refund_id bigint PRIMARY KEY REFERENCES erp_private.t13_refunds,
 withdrawn_by bigint NOT NULL REFERENCES public.user_profiles,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL
);

CREATE FUNCTION erp_private.t13_amount(p_input jsonb,p_field text,p_zero boolean DEFAULT false)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE amount numeric;
BEGIN
 IF p_input->>p_field IS NULL OR p_input->>p_field !~ '^[0-9]{1,14}([.][0-9]{1,2})?$' THEN
   RAISE EXCEPTION 'Use an exact monetary amount' USING ERRCODE='22023';
 END IF;
 amount:=(p_input->>p_field)::numeric;
 IF amount=0 AND NOT p_zero THEN RAISE EXCEPTION 'Amount must be positive' USING ERRCODE='22023'; END IF;
 RETURN amount;
END $$;

CREATE FUNCTION erp_private.t13_proof(p_case bigint,p_company bigint,p_branch bigint,p_data jsonb,p_kind text)
RETURNS bigint LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE result bigint; document bigint;
BEGIN
 IF NOT coalesce(erp_private.t13_original(p_company,p_branch,p_data,ARRAY[p_kind]),false) THEN
   RAISE EXCEPTION 'The required protected DMS original is unavailable' USING ERRCODE='42501';
 END IF;
 document:=(p_data->>'document')::bigint;
 IF p_kind IN('T13_RECOVERY_EMPLOYEE_NOTICE','T13_RECOVERY_EMPLOYEE_RESPONSE') THEN
   PERFORM pg_advisory_xact_lock(hashtextextended('t13-employee-evidence:'||document,0));
   IF EXISTS(SELECT 1 FROM erp_private.t13_recovery_proofs e WHERE e.document_id=document AND e.case_id<>p_case) THEN
     RAISE EXCEPTION 'Employee evidence is already retained by another case' USING ERRCODE='PT409';
   END IF;
 END IF;
 INSERT INTO erp_private.t13_recovery_proofs(case_id,document_id,version_id,file_id)
 VALUES(p_case,document,(p_data->>'version')::bigint,(p_data->>'file')::bigint)
 ON CONFLICT DO NOTHING RETURNING id INTO result;
 RETURN coalesce(result,(SELECT id FROM erp_private.t13_recovery_proofs
   WHERE case_id=p_case AND document_id=(p_data->>'document')::bigint
     AND version_id=(p_data->>'version')::bigint AND file_id=(p_data->>'file')::bigint));
END $$;

CREATE FUNCTION erp_private.t13_subject_guard() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF OLD.employee_id IS NOT NULL AND
    ROW(OLD.employee_id,OLD.employment_id,OLD.employer_company_id,OLD.employer_branch_id)
    IS DISTINCT FROM ROW(NEW.employee_id,NEW.employment_id,NEW.employer_company_id,NEW.employer_branch_id)
    AND EXISTS(SELECT 1 FROM erp_private.t13_hr_reviews r WHERE r.case_id=OLD.id) THEN
   RAISE EXCEPTION 'A reviewed subject requires a linked correction' USING ERRCODE='55000';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER t13_reviewed_subject BEFORE UPDATE ON erp_private.t13_cases
 FOR EACH ROW EXECUTE FUNCTION erp_private.t13_subject_guard();

CREATE FUNCTION erp_private.t13_retain_proof() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE retained boolean;
BEGIN
 CASE TG_TABLE_NAME
 WHEN 'dms_document_files' THEN
  IF TG_OP='UPDATE' AND
    (to_jsonb(OLD)-ARRAY['updated_at','is_current'])=(to_jsonb(NEW)-ARRAY['updated_at','is_current']) THEN RETURN NEW; END IF;
  SELECT EXISTS(SELECT 1 FROM erp_private.t13_recovery_proofs WHERE file_id=OLD.id) INTO retained;
 WHEN 'dms_document_versions' THEN
  IF TG_OP='UPDATE' AND
    (to_jsonb(OLD)-ARRAY['updated_at','is_current'])=(to_jsonb(NEW)-ARRAY['updated_at','is_current']) THEN RETURN NEW; END IF;
  SELECT EXISTS(SELECT 1 FROM erp_private.t13_recovery_proofs WHERE version_id=OLD.id) INTO retained;
 ELSE
  IF TG_OP='UPDATE' AND ROW(OLD.owning_company_id,OLD.owning_branch_id,OLD.document_type_id,OLD.confidentiality_level)
      IS NOT DISTINCT FROM ROW(NEW.owning_company_id,NEW.owning_branch_id,NEW.document_type_id,NEW.confidentiality_level) THEN RETURN NEW; END IF;
  SELECT EXISTS(SELECT 1 FROM erp_private.t13_recovery_proofs WHERE document_id=OLD.id) INTO retained;
 END CASE;
 IF retained THEN RAISE EXCEPTION 'This original is retained with a recovery case' USING ERRCODE='55000'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER t13_retain_hr_document BEFORE UPDATE OR DELETE ON public.dms_documents
 FOR EACH ROW EXECUTE FUNCTION erp_private.t13_retain_proof();
CREATE TRIGGER t13_retain_hr_version BEFORE UPDATE OR DELETE ON public.dms_document_versions
 FOR EACH ROW EXECUTE FUNCTION erp_private.t13_retain_proof();
CREATE TRIGGER t13_retain_hr_file BEFORE UPDATE OR DELETE ON public.dms_document_files
 FOR EACH ROW EXECUTE FUNCTION erp_private.t13_retain_proof();

REVOKE ALL ON erp_private.t13_policies,erp_private.t13_recovery_proofs,erp_private.t13_hr_reviews,erp_private.t13_disputes,
 erp_private.t13_reconciliations,erp_private.t13_money_events,erp_private.t13_schedules,erp_private.t13_instalments,
 erp_private.t13_refunds,erp_private.t13_refund_withdrawals FROM PUBLIC,anon,authenticated,service_role;
ALTER TABLE erp_private.t13_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t13_recovery_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t13_hr_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t13_disputes ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t13_reconciliations ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t13_money_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t13_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t13_instalments ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t13_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t13_refund_withdrawals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON FUNCTION erp_private.t13_amount(jsonb,text,boolean),erp_private.t13_proof(bigint,bigint,bigint,jsonb,text),
 erp_private.t13_subject_guard(),erp_private.t13_retain_proof() FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
