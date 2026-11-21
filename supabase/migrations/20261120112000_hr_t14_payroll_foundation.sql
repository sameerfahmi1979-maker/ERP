
BEGIN;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('hr.payroll.run.manage','Calculate and review scoped monthly payroll drafts','hr','payroll_run','held'),
 ('hr.payroll.run.policy','Prepare and independently approve monthly payroll rules','hr','payroll_run_policy','held');

INSERT INTO public.dms_document_categories(category_code,name_en)
VALUES('T14_PAYROLL_EVIDENCE','Payroll calculation evidence');
INSERT INTO public.dms_document_types(type_code,name_en,category_id,default_confidentiality)
SELECT 'T14_PAYROLL_ADJUSTMENT','Signed payroll adjustment evidence',id,'finance'
FROM public.dms_document_categories WHERE category_code='T14_PAYROLL_EVIDENCE';

CREATE TABLE erp_private.t14_rules (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL REFERENCES public.owner_companies,
 branch_id bigint NOT NULL REFERENCES public.branches,
 group_id bigint REFERENCES public.hr_payroll_groups,
 group_key bigint GENERATED ALWAYS AS (coalesce(group_id,0)) STORED,
 validity daterange NOT NULL CHECK(NOT isempty(validity) AND NOT lower_inf(validity) AND NOT upper_inf(validity)),
 facts jsonb NOT NULL CHECK(jsonb_typeof(facts)='object'),
 prepared_by bigint NOT NULL REFERENCES public.user_profiles,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 approved_by bigint REFERENCES public.user_profiles,
 approved_at timestamptz,
 decision_reason text,
 CHECK((approved_by IS NULL)=(approved_at IS NULL) AND (approved_by IS NULL OR approved_by<>prepared_by)),
 EXCLUDE USING gist(branch_id WITH =,group_key WITH =,validity WITH &&) WHERE(approved_at IS NOT NULL)
);
CREATE INDEX t14_rule_scope ON erp_private.t14_rules(company_id,branch_id,group_id,id DESC);

CREATE TABLE erp_private.t14_runs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 company_id bigint NOT NULL REFERENCES public.owner_companies,
 branch_id bigint NOT NULL REFERENCES public.branches,
 month date NOT NULL CHECK(isfinite(month) AND month=date_trunc('month',month::timestamp)::date),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(company_id,branch_id,month)
);
CREATE TABLE erp_private.t14_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 run_id uuid NOT NULL REFERENCES erp_private.t14_runs,
 number integer NOT NULL CHECK(number>0),
 cutoff timestamptz NOT NULL CHECK(isfinite(cutoff)),
 source_digest text NOT NULL CHECK(source_digest~'^[0-9a-f]{64}$'),
 rule_digest text NOT NULL CHECK(rule_digest~'^[0-9a-f]{64}$'),
 digest text NOT NULL CHECK(digest~'^[0-9a-f]{64}$'),
 totals jsonb NOT NULL CHECK(jsonb_typeof(totals)='array'),
 exception_count integer NOT NULL CHECK(exception_count>=0),
 calculated_by bigint NOT NULL REFERENCES public.user_profiles,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 UNIQUE(run_id,number)
);
CREATE TABLE erp_private.t14_results (
 version_id uuid NOT NULL REFERENCES erp_private.t14_versions,
 employee_id bigint NOT NULL REFERENCES public.employees,
 employee_name text NOT NULL,
 employment_ids bigint[] NOT NULL,
 currency text REFERENCES public.currencies(currency_code),
 gross numeric(20,2) NOT NULL CHECK(gross>=0),
 deductions numeric(20,2) NOT NULL CHECK(deductions>=0),
 net numeric(20,2) GENERATED ALWAYS AS (gross-deductions) STORED,
 state text NOT NULL CHECK(state IN ('ready','held')),
 policy_snapshots jsonb NOT NULL CHECK(jsonb_typeof(policy_snapshots)='array'),
 exceptions jsonb NOT NULL CHECK(jsonb_typeof(exceptions)='array'),
 PRIMARY KEY(version_id,employee_id),
 CHECK((state<>'ready') OR (currency IS NOT NULL AND deductions<=gross))
);
CREATE TABLE erp_private.t14_lines (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 version_id uuid NOT NULL,
 employee_id bigint NOT NULL,
 key text NOT NULL,
 category text NOT NULL,
 kind text NOT NULL CHECK(kind IN ('earning','deduction')),
 amount numeric(20,2) NOT NULL CHECK(amount>=0),
 currency text NOT NULL REFERENCES public.currencies(currency_code),
 quantity numeric NOT NULL,
 unit text NOT NULL,
 rate numeric NOT NULL,
 original_on date NOT NULL,
 available_at timestamptz NOT NULL,
 source jsonb NOT NULL CHECK(jsonb_typeof(source)='object'),
 reason text NOT NULL,
 FOREIGN KEY(version_id,employee_id) REFERENCES erp_private.t14_results(version_id,employee_id),
 UNIQUE(version_id,key)
);

-- These are draft reservations. The actual payable claims and settlement stay
-- with the owning modules and the subsequent exact payroll approval.
CREATE TABLE erp_private.t14_draft_usage (
 key text PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES erp_private.t14_runs,
 line_id uuid NOT NULL UNIQUE REFERENCES erp_private.t14_lines,
 employee_id bigint NOT NULL REFERENCES public.employees,
 span tstzmultirange,
 CHECK(span IS NULL OR NOT isempty(span)),
 EXCLUDE USING gist(employee_id WITH =,span WITH &&) WHERE(span IS NOT NULL)
);
CREATE INDEX t14_usage_run ON erp_private.t14_draft_usage(run_id);

CREATE TABLE erp_private.t14_adjustments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 run_id uuid NOT NULL REFERENCES erp_private.t14_runs,
 employee_id bigint NOT NULL REFERENCES public.employees,
 original_line_id uuid NOT NULL REFERENCES erp_private.t14_lines,
 source_key text NOT NULL,
 kind text NOT NULL CHECK(kind IN('earning','deduction')),
 amount numeric(20,2) NOT NULL CHECK(amount>0),
 currency text NOT NULL REFERENCES public.currencies(currency_code),
 document_id bigint NOT NULL REFERENCES public.dms_documents,
 version_id bigint NOT NULL REFERENCES public.dms_document_versions,
 file_id bigint NOT NULL UNIQUE REFERENCES public.dms_document_files,
 proposed_by bigint NOT NULL REFERENCES public.user_profiles,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 decision text CHECK(decision IN('verified','rejected')),
 decided_by bigint REFERENCES public.user_profiles,
 decided_at timestamptz,
 decision_reason text,
 CHECK((decision IS NULL)=(decided_at IS NULL) AND (decision IS NULL)=(decided_by IS NULL)),
 CHECK(decided_by IS NULL OR proposed_by<>decided_by)
);
CREATE INDEX t14_adjustment_run ON erp_private.t14_adjustments(run_id,employee_id,id DESC);
CREATE INDEX t14_adjustment_document ON erp_private.t14_adjustments(document_id);
CREATE INDEX t14_adjustment_version ON erp_private.t14_adjustments(version_id);
CREATE UNIQUE INDEX t14_adjustment_effect ON erp_private.t14_adjustments(run_id,employee_id,source_key,kind,amount)
 WHERE decision IS DISTINCT FROM 'rejected';

ALTER TABLE erp_private.t14_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t14_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t14_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t14_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t14_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t14_draft_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t14_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t14_rules,erp_private.t14_runs,erp_private.t14_versions,erp_private.t14_results,erp_private.t14_lines,
 erp_private.t14_draft_usage,erp_private.t14_adjustments FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.t14_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'The payroll draft snapshot is retained' USING ERRCODE='55000';
END $$;
CREATE TRIGGER t14_immutable_version BEFORE UPDATE OR DELETE ON erp_private.t14_versions FOR EACH ROW EXECUTE FUNCTION erp_private.t14_immutable();
CREATE TRIGGER t14_immutable_result BEFORE UPDATE OR DELETE ON erp_private.t14_results FOR EACH ROW EXECUTE FUNCTION erp_private.t14_immutable();
CREATE TRIGGER t14_immutable_line BEFORE UPDATE OR DELETE ON erp_private.t14_lines FOR EACH ROW EXECUTE FUNCTION erp_private.t14_immutable();

CREATE FUNCTION erp_private.t14_run_authorized(p_company bigint,p_branch bigint)
RETURNS boolean LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
BEGIN
 RETURN erp_private.t02_has_scope('hr.payroll.run.manage',p_company,p_branch)
    AND erp_private.t02_has_scope('hr.payroll.view',p_company,p_branch);
END $$;

CREATE FUNCTION erp_private.t14_decimal(p_data jsonb,p_key text,p_scale integer,p_min numeric,p_max numeric)
RETURNS numeric LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE raw text:=p_data->>p_key; parsed numeric;
BEGIN
 IF raw IS NULL OR raw!~'^[0-9]{1,14}([.][0-9]{1,8})?$' THEN
   RAISE EXCEPTION 'Enter a supported payroll amount or rate' USING ERRCODE='22023';
 END IF;
 parsed:=raw::numeric;
 IF parsed<p_min OR parsed>p_max OR parsed<>round(parsed,p_scale) THEN
   RAISE EXCEPTION 'A payroll amount is outside the approved precision or limits' USING ERRCODE='22023';
 END IF;
 RETURN parsed;
END $$;

CREATE FUNCTION erp_private.t14_rule_write(p_company bigint,p_branch bigint,p_action text,p_data jsonb,p_actor bigint,p_reason text)
RETURNS bigint LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE result bigint; rule_row erp_private.t14_rules; group_id_input bigint; facts_input jsonb; fixed_input numeric;
 first_month date; end_month date;
BEGIN
 IF p_action='approve-rule' THEN
   SELECT * INTO rule_row FROM erp_private.t14_rules WHERE id=(p_data->>'rule')::bigint
      AND company_id=p_company AND branch_id=p_branch FOR UPDATE;
   IF rule_row.id IS NULL OR rule_row.prepared_by=p_actor
      OR NOT erp_private.t12_staff_capability(rule_row.prepared_by,'hr.payroll.run.policy',p_company,p_branch) THEN
     RAISE EXCEPTION 'An independent scoped policy decision is required' USING ERRCODE='42501';
   END IF;
   UPDATE erp_private.t14_rules SET approved_by=p_actor,approved_at=clock_timestamp(),decision_reason=p_reason
      WHERE id=rule_row.id AND approved_at IS NULL RETURNING id INTO result;
   IF result IS NULL THEN RAISE EXCEPTION 'The policy already has a decision' USING ERRCODE='PT409'; END IF;
 ELSE
   first_month:=(p_data->>'from')::date; end_month:=(p_data->>'until')::date;
   IF first_month IS NULL OR end_month IS NULL OR NOT isfinite(first_month) OR NOT isfinite(end_month)
      OR extract(day FROM first_month)<>1 OR extract(day FROM end_month)<>1 OR end_month<=first_month THEN
     RAISE EXCEPTION 'Monthly calculation rules start and end on the first of a payroll month' USING ERRCODE='22023';
   END IF;
   group_id_input:=(p_data->>'group_id')::bigint;
   IF group_id_input IS NOT NULL AND NOT EXISTS(
       SELECT 1 FROM public.hr_payroll_groups WHERE id=group_id_input AND is_active AND deleted_at IS NULL AND pay_frequency='monthly' FOR SHARE
   ) THEN RAISE EXCEPTION 'Select an active payroll group' USING ERRCODE='22023'; END IF;
   IF NOT coalesce(p_data->>'proration' IN('calendar-days','fixed-days')
     AND p_data->>'absence' IN('unpaid-only','verified-absence')
     AND p_data->>'leave_wage_basis' IN('basic','gross')
     AND p_data->>'daily_recovery_basis' IN('basic','gross'),false) THEN
     RAISE EXCEPTION 'Choose explicit proration, leave, absence and recovery wage bases' USING ERRCODE='22023';
   END IF;
   IF p_data->>'proration'='fixed-days' THEN fixed_input:=erp_private.t14_decimal(p_data,'fixed_days',0,1,31); END IF;
   facts_input:=jsonb_build_object('proration',p_data->>'proration','fixed_days',fixed_input,
     'absence',p_data->>'absence','leave_wage_basis',p_data->>'leave_wage_basis','daily_recovery_basis',p_data->>'daily_recovery_basis',
     'rounding','line-half-up','recovery_fraction',erp_private.t14_decimal(p_data,'recovery_fraction',6,0,1),
     'net_floor',erp_private.t14_decimal(p_data,'net_floor',2,0,999999999999.99));
   INSERT INTO erp_private.t14_rules(company_id,branch_id,group_id,validity,facts,prepared_by,reason)
   VALUES(p_company,p_branch,group_id_input,daterange(first_month,end_month,'[)'),
      facts_input,p_actor,p_reason) RETURNING id INTO result;
 END IF;
 RETURN result;
END $$;

CREATE FUNCTION erp_private.t14_adjustment_original(p_company bigint,p_branch bigint,p_document bigint,p_version bigint,p_file bigint)
RETURNS boolean LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
BEGIN
 IF NOT erp_private.t02_has_scope('dms.documents.preview',p_company,p_branch)
    OR NOT erp_private.t02_has_scope('dms.documents.view.finance',p_company,p_branch) THEN RETURN false; END IF;
 PERFORM 1 FROM public.dms_documents d
 JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.type_code='T14_PAYROLL_ADJUSTMENT'
   AND t.is_active AND t.deleted_at IS NULL
 JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
 JOIN public.dms_document_files f ON f.document_id=d.id AND f.version_id=v.id AND f.file_role='original'
     AND f.deleted_at IS NULL AND f.integrity_status='verified' AND f.sha256_hash~'^[0-9a-f]{64}$' AND f.file_size_bytes>0
 WHERE d.id=p_document AND v.id=p_version AND f.id=p_file AND d.owning_company_id=p_company AND d.owning_branch_id=p_branch
   AND d.confidentiality_level='finance' AND d.deleted_at IS NULL AND NOT d.is_archived AND d.status='active'
   AND erp_private.t13_evidence_is_operative(d.id) AND erp_private.document_permission(d.id,'dms.documents.preview')
 FOR SHARE OF d,t,v,f;
 RETURN FOUND;
END $$;

CREATE FUNCTION erp_private.t14_retain_proof() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE retained boolean;
BEGIN
 IF TG_TABLE_NAME='dms_document_files' THEN
   IF TG_OP='UPDATE' AND
      (to_jsonb(OLD)-ARRAY['updated_at','is_current'])=(to_jsonb(NEW)-ARRAY['updated_at','is_current']) THEN RETURN NEW; END IF;
   SELECT EXISTS(SELECT 1 FROM erp_private.t14_adjustments WHERE file_id=OLD.id) INTO retained;
 ELSIF TG_TABLE_NAME='dms_document_versions' THEN
   IF TG_OP='UPDATE' AND
      (to_jsonb(OLD)-ARRAY['updated_at','is_current'])=(to_jsonb(NEW)-ARRAY['updated_at','is_current']) THEN RETURN NEW; END IF;
   SELECT EXISTS(SELECT 1 FROM erp_private.t14_adjustments WHERE version_id=OLD.id) INTO retained;
 ELSE
   IF TG_OP='UPDATE' AND ROW(OLD.owning_company_id,OLD.owning_branch_id,OLD.document_type_id,OLD.confidentiality_level)
      IS NOT DISTINCT FROM ROW(NEW.owning_company_id,NEW.owning_branch_id,NEW.document_type_id,NEW.confidentiality_level) THEN RETURN NEW; END IF;
   SELECT EXISTS(SELECT 1 FROM erp_private.t14_adjustments WHERE document_id=OLD.id) INTO retained;
 END IF;
 IF retained THEN RAISE EXCEPTION 'The signed adjustment original is retained' USING ERRCODE='55000'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER t14_retain_file BEFORE UPDATE OR DELETE ON public.dms_document_files FOR EACH ROW EXECUTE FUNCTION erp_private.t14_retain_proof();
CREATE TRIGGER t14_retain_version BEFORE UPDATE OR DELETE ON public.dms_document_versions FOR EACH ROW EXECUTE FUNCTION erp_private.t14_retain_proof();
CREATE TRIGGER t14_retain_document BEFORE UPDATE OR DELETE ON public.dms_documents FOR EACH ROW EXECUTE FUNCTION erp_private.t14_retain_proof();

CREATE FUNCTION erp_private.t14_adjustment_write(p_company bigint,p_branch bigint,p_action text,p_data jsonb,p_actor bigint,p_reason text)
RETURNS bigint LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE result bigint; a erp_private.t14_adjustments; original erp_private.t14_lines;
 run_identity uuid; employee bigint; v uuid; doc bigint; ver bigint; file bigint; line_kind text;
BEGIN
 IF p_action='prepare-adjustment' THEN
   employee:=(p_data->>'employee')::bigint; v:=(p_data->>'version')::uuid; line_kind:=p_data->>'kind';
   SELECT r.id INTO run_identity FROM erp_private.t14_runs r JOIN erp_private.t14_versions s ON s.run_id=r.id
   WHERE r.company_id=p_company AND r.branch_id=p_branch AND r.month=(p_data->>'month')::date AND s.id=v
     AND s.number=(SELECT max(x.number) FROM erp_private.t14_versions x WHERE x.run_id=r.id) FOR UPDATE OF r;
   SELECT * INTO original FROM erp_private.t14_lines WHERE version_id=v AND employee_id=employee AND key=p_data->>'source_key';
   IF run_identity IS NULL OR original.id IS NULL OR erp_private.t12_is_subject(p_actor,employee)
      OR original.category='adjustment' OR p_data->>'currency' IS DISTINCT FROM original.currency THEN
     RAISE EXCEPTION 'Choose an independently reviewed source line in the current draft and its currency' USING ERRCODE='PT409';
   END IF;
   doc:=(p_data->'evidence'->>'document')::bigint; ver:=(p_data->'evidence'->>'version')::bigint; file:=(p_data->'evidence'->>'file')::bigint;
   IF NOT erp_private.t14_adjustment_original(p_company,p_branch,doc,ver,file) THEN
     RAISE EXCEPTION 'The scoped signed payroll adjustment original is required' USING ERRCODE='42501';
   END IF;
   INSERT INTO erp_private.t14_adjustments(run_id,employee_id,original_line_id,source_key,kind,amount,currency,document_id,version_id,file_id,proposed_by,reason)
   VALUES(run_identity,employee,original.id,original.key,line_kind,erp_private.t14_decimal(p_data,'amount',2,0.01,999999999999.99),
     original.currency,doc,ver,file,p_actor,p_reason) RETURNING id INTO result;
 ELSE
   SELECT entry.* INTO a FROM erp_private.t14_adjustments entry JOIN erp_private.t14_runs r ON r.id=entry.run_id
   WHERE entry.id=(p_data->>'adjustment')::bigint AND r.company_id=p_company AND r.branch_id=p_branch FOR UPDATE OF entry;
   IF a.id IS NULL OR a.proposed_by=p_actor OR erp_private.t12_is_subject(p_actor,a.employee_id) THEN
     RAISE EXCEPTION 'An independent scoped payroll adjustment decision is required' USING ERRCODE='42501';
   END IF;
   IF p_action='verify-adjustment' AND (
     NOT erp_private.t14_adjustment_original(p_company,p_branch,a.document_id,a.version_id,a.file_id)
     OR NOT erp_private.t12_staff_capability(a.proposed_by,'hr.payroll.run.manage',p_company,p_branch)
     OR NOT erp_private.t12_staff_capability(a.proposed_by,'hr.payroll.view',p_company,p_branch)
   ) THEN RAISE EXCEPTION 'Refresh the adjustment original and proposer authorization' USING ERRCODE='PT409'; END IF;
   UPDATE erp_private.t14_adjustments SET decision=CASE WHEN p_action='verify-adjustment' THEN 'verified' ELSE 'rejected' END,
     decided_by=p_actor,decided_at=clock_timestamp(),decision_reason=p_reason
   WHERE id=a.id AND decision IS NULL RETURNING id INTO result;
   IF result IS NULL THEN RAISE EXCEPTION 'The adjustment already has a decision' USING ERRCODE='PT409'; END IF;
 END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION erp_private.t14_immutable(),erp_private.t14_run_authorized(bigint,bigint),
 erp_private.t14_decimal(jsonb,text,integer,numeric,numeric),erp_private.t14_rule_write(bigint,bigint,text,jsonb,bigint,text),
 erp_private.t14_adjustment_original(bigint,bigint,bigint,bigint,bigint),erp_private.t14_retain_proof(),
 erp_private.t14_adjustment_write(bigint,bigint,text,jsonb,bigint,text) FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
