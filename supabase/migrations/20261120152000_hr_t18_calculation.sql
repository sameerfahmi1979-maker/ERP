BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';
SET LOCAL search_path=public,extensions,pg_catalog;

CREATE TABLE erp_private.t18_calculation_policies (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 effective daterange NOT NULL CHECK (NOT isempty(effective) AND NOT lower_inf(effective) AND NOT upper_inf(effective)),
 facts jsonb NOT NULL,
 receipt_digest text NOT NULL CHECK (receipt_digest ~ '^[0-9a-f]{64}$'),
 proposed_by bigint NOT NULL REFERENCES public.user_profiles(id),
 reason text NOT NULL,
 proposed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','approved','rejected')),
 decided_by bigint REFERENCES public.user_profiles(id),
 decided_at timestamptz,
 decision_reason text,
 CHECK (decided_by IS NULL OR decided_by<>proposed_by),
 EXCLUDE USING gist (company_id WITH =,branch_id WITH =,effective WITH &&) WHERE (status='approved')
);

CREATE TABLE erp_private.t18_exit_adjustments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 eos_id bigint NOT NULL REFERENCES erp_private.t18_cases(eos_id),
 kind text NOT NULL CHECK (kind IN ('earning','deduction')),
 amount numeric(14,2) NOT NULL CHECK (amount>0),
 currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
 document_id bigint NOT NULL REFERENCES public.dms_documents(id),
 version_id bigint NOT NULL REFERENCES public.dms_document_versions(id),
 file_id bigint NOT NULL REFERENCES public.dms_document_files(id),
 checksum text NOT NULL CHECK (checksum ~ '^[0-9a-f]{64}$'),
 receipt_digest text NOT NULL CHECK (receipt_digest ~ '^[0-9a-f]{64}$'),
 proposed_by bigint NOT NULL REFERENCES public.user_profiles(id),
 reason text NOT NULL,
 proposed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','verified','rejected')),
 decided_by bigint REFERENCES public.user_profiles(id),
 decided_at timestamptz,
 decision_reason text,
 CHECK (decided_by IS NULL OR decided_by<>proposed_by),
 UNIQUE(eos_id,document_id)
);

ALTER TABLE erp_private.t18_calculation_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t18_exit_adjustments ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t18_calculation_policies,erp_private.t18_exit_adjustments FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.t18_validate_calc_facts(p_facts jsonb)
RETURNS void LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE b jsonb:=p_facts->'benefit'; field text; channels jsonb:=p_facts->'payment_channels';
BEGIN
 IF jsonb_typeof(p_facts) IS DISTINCT FROM 'object'
    OR p_facts-ARRAY['proration','fixed_days','absence','leave_wage_basis','leave_cashout','leave_cashout_divisor',
      'payment_channels','benefit','recovery_fraction','net_floor','daily_recovery_basis']<>'{}'
    OR coalesce(p_facts->>'proration','') NOT IN ('calendar-days','fixed-days')
    OR coalesce(p_facts->>'absence','') NOT IN ('unpaid-only','verified-absence')
    OR coalesce(p_facts->>'leave_wage_basis','') NOT IN ('basic','gross')
    OR coalesce(p_facts->>'daily_recovery_basis','') NOT IN ('basic','gross')
    OR coalesce(p_facts->>'leave_cashout','') NOT IN ('current-and-approved-carry','none')
    OR jsonb_typeof(channels) IS DISTINCT FROM 'array'
    OR jsonb_typeof(b) IS DISTINCT FROM 'object' THEN
  RAISE EXCEPTION 'Provide approved exit salary, leave, benefit, recovery and payment rules' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(channels) NOT BETWEEN 1 AND 2
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(channels) ch
       WHERE ch NOT IN ('"exit-bank-transfer"'::jsonb,'"exit-cheque"'::jsonb))
    OR (SELECT count(DISTINCT ch) FROM jsonb_array_elements(channels) ch)<>jsonb_array_length(channels) THEN
  RAISE EXCEPTION 'Choose the allowed final settlement payment channels' USING ERRCODE='22023';
 END IF;
 IF p_facts->>'proration'='fixed-days' THEN
  PERFORM erp_private.t14_decimal(p_facts,'fixed_days',0,1,31);
 ELSIF p_facts ? 'fixed_days' THEN
  RAISE EXCEPTION 'Fixed days apply only to fixed-day proration' USING ERRCODE='22023';
 END IF;
 IF p_facts->>'leave_cashout'='current-and-approved-carry' THEN
  PERFORM erp_private.t14_decimal(p_facts,'leave_cashout_divisor',0,1,31);
 ELSIF p_facts ? 'leave_cashout_divisor' THEN
  RAISE EXCEPTION 'The cashout divisor applies only to paying eligible unused leave' USING ERRCODE='22023';
 END IF;
 PERFORM erp_private.t14_decimal(p_facts,'recovery_fraction',4,0,1);
 PERFORM erp_private.t14_decimal(p_facts,'net_floor',2,0,999999999999.99);
 IF b='{"mode":"none"}' THEN RETURN; END IF;
 IF coalesce(b->>'mode','')<>'tiered-basic'
    OR b-ARRAY['mode','service','exit_types','minimum_days','first_band_years','first_days_per_year',
      'later_days_per_year','day_divisor','year_divisor','cap_days','exclude_unpaid']<>'{}'
    OR coalesce(b->>'service','') NOT IN ('current-period','continuous-employer')
    OR jsonb_typeof(b->'exit_types') IS DISTINCT FROM 'array'
    OR jsonb_typeof(b->'exclude_unpaid') IS DISTINCT FROM 'boolean' THEN
  RAISE EXCEPTION 'Provide the approved dated service and termination-benefit rules' USING ERRCODE='22023';
 END IF;
 IF jsonb_array_length(b->'exit_types') NOT BETWEEN 1 AND 6
    OR EXISTS(SELECT 1 FROM jsonb_array_elements(b->'exit_types') e
       WHERE e NOT IN ('"resignation"'::jsonb,'"termination"'::jsonb,'"contract_end"'::jsonb,
                       '"absconding"'::jsonb,'"death"'::jsonb,'"other"'::jsonb))
    OR (SELECT count(DISTINCT e) FROM jsonb_array_elements(b->'exit_types') e)
        <>jsonb_array_length(b->'exit_types') THEN
  RAISE EXCEPTION 'Choose the applicable verified exit types' USING ERRCODE='22023';
 END IF;
 PERFORM erp_private.t14_decimal(b,'minimum_days',0,0,36500);
 PERFORM erp_private.t14_decimal(b,'first_band_years',2,0,100);
 FOREACH field IN ARRAY ARRAY['first_days_per_year','later_days_per_year'] LOOP
  PERFORM erp_private.t14_decimal(b,field,4,0,366);
 END LOOP;
 PERFORM erp_private.t14_decimal(b,'day_divisor',0,1,31);
 PERFORM erp_private.t14_decimal(b,'year_divisor',0,1,366);
 PERFORM erp_private.t14_decimal(b,'cap_days',4,0,36600);
END $$;

CREATE FUNCTION erp_private.t18_adjustment_original_once() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='t14_adjustments' THEN
  IF EXISTS(SELECT 1 FROM erp_private.t18_exit_adjustments a WHERE a.document_id=NEW.document_id AND a.status<>'rejected') THEN
   RAISE EXCEPTION 'This adjustment original already belongs to a final settlement' USING ERRCODE='PT409';
  END IF;
 ELSIF EXISTS(SELECT 1 FROM erp_private.t18_exit_adjustments a WHERE a.document_id=NEW.document_id AND a.status<>'rejected')
    OR EXISTS(SELECT 1 FROM erp_private.t14_adjustments a WHERE a.document_id=NEW.document_id AND a.decision IS DISTINCT FROM 'rejected') THEN
  RAISE EXCEPTION 'This adjustment original already belongs to a payroll or exit review' USING ERRCODE='PT409';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER t18_adjustment_monthly_fence BEFORE INSERT ON erp_private.t14_adjustments
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_adjustment_original_once();
CREATE TRIGGER t18_adjustment_exit_fence BEFORE INSERT ON erp_private.t18_exit_adjustments
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_adjustment_original_once();

CREATE FUNCTION public.t18_settlement_policy(p_operation uuid,p_company bigint,p_branch bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id(); mode text; note text:=btrim(p_data->>'reason');
  keys text[]; timing daterange; receipt jsonb; input_digest text; policy erp_private.t18_calculation_policies;
BEGIN
 mode:=CASE p_action WHEN 'propose' THEN 'accounts' WHEN 'approve' THEN 'approve' WHEN 'reject' THEN 'approve' END;
 IF actor IS NULL OR mode IS NULL OR NOT erp_private.t18_can(p_company,p_branch,mode) THEN
  RAISE EXCEPTION 'Scoped settlement policy authority required' USING ERRCODE='42501';
 END IF;
 keys:=CASE WHEN p_action='propose' THEN ARRAY['from','until','facts','reason'] ELSE ARRAY['policy','digest','reason'] END;
 IF NOT coalesce(jsonb_typeof(p_data)='object' AND p_data ?& keys AND p_data-keys='{}' AND length(note) BETWEEN 4 AND 2000,false) THEN
  RAISE EXCEPTION 'Provide exact policy details and a decision reason' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('t14-payroll:'||p_company,0));
 IF NOT erp_private.t18_can(p_company,p_branch,mode) THEN
  RAISE EXCEPTION 'Current settlement policy authority expired' USING ERRCODE='42501';
 END IF;
 input_digest:=erp_private.t02_digest(jsonb_build_array(p_company,p_branch,p_action,p_data));
 receipt:=erp_private.t02_replay('t18-policy',p_operation,input_digest);
 IF receipt IS NOT NULL THEN
  IF NOT erp_private.t18_can(p_company,p_branch,mode) THEN
   RAISE EXCEPTION 'Current settlement policy authority expired' USING ERRCODE='42501';
  END IF;
  RETURN receipt;
 END IF;
 IF p_action='propose' THEN
  IF NOT coalesce(isfinite((p_data->>'from')::date) AND isfinite((p_data->>'until')::date)
       AND (p_data->>'from')::date<(p_data->>'until')::date,false) THEN
   RAISE EXCEPTION 'A finite policy date range is required' USING ERRCODE='22023';
  END IF;
  timing:=daterange((p_data->>'from')::date,(p_data->>'until')::date,'[)');
  PERFORM erp_private.t18_validate_calc_facts(p_data->'facts');
  INSERT INTO erp_private.t18_calculation_policies(company_id,branch_id,effective,facts,receipt_digest,proposed_by,reason)
   VALUES(p_company,p_branch,timing,p_data->'facts',input_digest,actor,note) RETURNING * INTO policy;
 ELSE
  SELECT * INTO policy FROM erp_private.t18_calculation_policies WHERE id=(p_data->>'policy')::bigint
    AND company_id=p_company AND branch_id=p_branch FOR UPDATE;
  IF policy.id IS NULL OR policy.proposed_by=actor THEN
   RAISE EXCEPTION 'An independent scoped settlement policy reviewer is required' USING ERRCODE='42501';
  END IF;
  IF policy.status<>'proposed' OR policy.receipt_digest IS DISTINCT FROM p_data->>'digest' THEN
   RAISE EXCEPTION 'Review the exact pending settlement policy' USING ERRCODE='PT409';
  END IF;
  IF p_action='approve' AND EXISTS(SELECT 1 FROM erp_private.t18_calculation_policies p
      WHERE p.company_id=p_company AND p.branch_id=p_branch AND p.status='approved' AND p.effective&&policy.effective) THEN
   RAISE EXCEPTION 'An approved exit policy already covers this scope and period' USING ERRCODE='PT409';
  END IF;
  UPDATE erp_private.t18_calculation_policies
  SET status=CASE p_action WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
      decided_by=actor,decided_at=clock_timestamp(),decision_reason=note
  WHERE id=policy.id RETURNING * INTO policy;
 END IF;
 IF NOT erp_private.t18_can(p_company,p_branch,mode) THEN
  RAISE EXCEPTION 'Settlement policy authority expired before recording the decision' USING ERRCODE='42501';
 END IF;
 RETURN erp_private.t02_save_receipt('t18-policy',p_operation,input_digest,
     jsonb_build_object('id',policy.id,'digest',policy.receipt_digest,'status',policy.status));
END $$;

CREATE FUNCTION erp_private.t18_adjustment_retained(p_adjustment erp_private.t18_exit_adjustments,p_case erp_private.t18_cases)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS (
  SELECT 1 FROM public.dms_documents d
  JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.type_code='T14_PAYROLL_ADJUSTMENT'
       AND t.is_active AND t.deleted_at IS NULL
  JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id
       AND v.id=p_adjustment.version_id AND v.is_current AND v.unlinked_at IS NULL
  JOIN public.dms_document_files f ON f.id=p_adjustment.file_id AND f.document_id=d.id AND f.version_id=v.id
       AND f.file_role='original' AND f.deleted_at IS NULL AND f.integrity_status='verified' AND f.file_size_bytes>0
  WHERE d.id=p_adjustment.document_id AND d.owning_company_id=p_case.company_id AND d.owning_branch_id=p_case.branch_id
    AND d.confidentiality_level='finance' AND d.deleted_at IS NULL AND NOT d.is_archived AND d.status='active'
    AND f.sha256_hash=p_adjustment.checksum AND erp_private.t13_evidence_is_operative(d.id)
 );
$$;

CREATE FUNCTION public.t18_exit_adjustment(p_operation uuid,p_eos bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id(); mode text; note text:=btrim(p_data->>'reason');
 keys text[]; settled erp_private.t18_cases; adjustment erp_private.t18_exit_adjustments;
 input_digest text; receipt jsonb; doc bigint; ver bigint; file bigint; checksum text;
BEGIN
 mode:=CASE p_action WHEN 'propose' THEN 'accounts' WHEN 'verify' THEN 'hr' WHEN 'reject' THEN 'hr' END;
 SELECT * INTO settled FROM erp_private.t18_cases WHERE eos_id=p_eos;
 IF actor IS NULL OR mode IS NULL OR settled.eos_id IS NULL
     OR NOT erp_private.t18_can(settled.company_id,settled.branch_id,mode)
     OR erp_private.t12_is_subject(actor,settled.employee_id) THEN
  RAISE EXCEPTION 'Scoped final settlement adjustment authority required' USING ERRCODE='42501';
 END IF;
 keys:=CASE WHEN p_action='propose' THEN ARRAY['kind','amount','currency','document','version','file','reason']
       ELSE ARRAY['adjustment','digest','reason'] END;
 IF NOT coalesce(jsonb_typeof(p_data)='object' AND p_data ?& keys AND p_data-keys='{}' AND length(note) BETWEEN 4 AND 2000,false) THEN
  RAISE EXCEPTION 'Provide an exact adjustment and review reason' USING ERRCODE='22023';
 END IF;
 settled:=erp_private.t18_lock_case(p_eos);
 IF NOT erp_private.t18_can(settled.company_id,settled.branch_id,mode)
    OR erp_private.t12_is_subject(actor,settled.employee_id) THEN
  RAISE EXCEPTION 'Current settlement adjustment authority expired' USING ERRCODE='42501';
 END IF;
 input_digest:=erp_private.t02_digest(jsonb_build_array(p_eos,p_action,p_data));
 receipt:=erp_private.t02_replay('t18-adjustment',p_operation,input_digest);
 IF receipt IS NOT NULL THEN
  IF NOT erp_private.t18_can(settled.company_id,settled.branch_id,mode)
     OR erp_private.t12_is_subject(actor,settled.employee_id) THEN
   RAISE EXCEPTION 'Current settlement adjustment authority expired' USING ERRCODE='42501';
  END IF;
  RETURN receipt;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM public.employee_eos_cases e WHERE e.id=p_eos AND e.deleted_at IS NULL
     AND e.case_status NOT IN ('closed','cancelled') AND e.final_settlement_status<>'completed')
    OR EXISTS(SELECT 1 FROM erp_private.t18_versions v WHERE v.eos_id=p_eos
       AND erp_private.t18_version_state(v.id) IN ('submitted','approved')) THEN
  RAISE EXCEPTION 'Adjustments require an open settlement before GM approval' USING ERRCODE='PT409';
 END IF;
 IF p_action='propose' THEN
  doc:=(p_data->>'document')::bigint; ver:=(p_data->>'version')::bigint; file:=(p_data->>'file')::bigint;
  IF NOT coalesce(p_data->>'kind' IN ('earning','deduction') AND p_data->>'currency'~'^[A-Z]{3}$',false) THEN
   RAISE EXCEPTION 'Enter the adjustment treatment and salary currency' USING ERRCODE='22023';
  END IF;
  IF NOT erp_private.t14_adjustment_original(settled.company_id,settled.branch_id,doc,ver,file) THEN
   RAISE EXCEPTION 'Attach the current scoped finance adjustment original' USING ERRCODE='42501';
  END IF;
  IF EXISTS (SELECT 1 FROM erp_private.t18_exit_adjustments a WHERE a.eos_id=p_eos AND a.document_id=doc)
     OR EXISTS (SELECT 1 FROM erp_private.t14_adjustments a WHERE a.document_id=doc AND a.decision IS DISTINCT FROM 'rejected') THEN
   RAISE EXCEPTION 'This adjustment original already belongs to a payroll or exit review' USING ERRCODE='PT409';
  END IF;
  SELECT sha256_hash INTO STRICT checksum FROM public.dms_document_files WHERE id=file;
  INSERT INTO erp_private.t18_exit_adjustments(eos_id,kind,amount,currency,document_id,version_id,file_id,
    checksum,receipt_digest,proposed_by,reason)
  VALUES(p_eos,p_data->>'kind',erp_private.t14_decimal(p_data,'amount',2,0.01,999999999999.99),p_data->>'currency',
    doc,ver,file,checksum,input_digest,actor,note) RETURNING * INTO adjustment;
 ELSE
  SELECT * INTO adjustment FROM erp_private.t18_exit_adjustments WHERE id=(p_data->>'adjustment')::bigint
     AND eos_id=p_eos FOR UPDATE;
  IF adjustment.id IS NULL OR adjustment.proposed_by=actor THEN
   RAISE EXCEPTION 'An independent scoped adjustment reviewer is required' USING ERRCODE='42501';
  END IF;
  IF adjustment.status<>'proposed' OR adjustment.receipt_digest IS DISTINCT FROM p_data->>'digest' THEN
   RAISE EXCEPTION 'Review the exact pending settlement adjustment' USING ERRCODE='PT409';
  END IF;
  IF p_action='verify' AND (
    NOT erp_private.t14_adjustment_original(settled.company_id,settled.branch_id,
       adjustment.document_id,adjustment.version_id,adjustment.file_id)
    OR NOT erp_private.t18_adjustment_retained(adjustment,settled)
  ) THEN
   RAISE EXCEPTION 'The exact finance adjustment original must still be current' USING ERRCODE='PT409';
  END IF;
  UPDATE erp_private.t18_exit_adjustments
   SET status=CASE p_action WHEN 'verify' THEN 'verified' ELSE 'rejected' END,
       decided_by=actor,decided_at=clock_timestamp(),decision_reason=note
   WHERE id=adjustment.id RETURNING * INTO adjustment;
 END IF;
 IF NOT erp_private.t18_can(settled.company_id,settled.branch_id,mode)
    OR erp_private.t12_is_subject(actor,settled.employee_id)
    OR (p_action<>'reject' AND NOT erp_private.t14_adjustment_original(settled.company_id,settled.branch_id,
        adjustment.document_id,adjustment.version_id,adjustment.file_id)) THEN
  RAISE EXCEPTION 'Settlement adjustment authority expired before recording the decision' USING ERRCODE='42501';
 END IF;
 RETURN erp_private.t02_save_receipt('t18-adjustment',p_operation,input_digest,
     jsonb_build_object('id',adjustment.id,'digest',adjustment.receipt_digest,'status',adjustment.status));
END $$;

-- The monthly and final calculations share the same dated salary and absence rules.
CREATE FUNCTION erp_private.t14_salary_sources_through(p_employee bigint,p_employment bigint,p_company bigint,p_branch bigint,
 p_month date,p_cutoff timestamptz,p_rule jsonb,p_last_day date)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE employment erp_private.t03_employment_periods; opening_at timestamptz; closing_at timestamptz;
 month_end date; first_day date; until_day date; work_day date; month_days integer; divisor int; recurring_divisor int;
 total_employed int; salary_days jsonb:='[]'; day_basis jsonb; profile jsonb; held record; leave_day jsonb;
 attendance public.employee_attendance_daily_summary; legacy_id bigint;
 money_currency text; payroll_group bigint; lines jsonb:='[]'; exceptions jsonb:='[]'; result jsonb;
 eligibility text; deduction_monthly_rate numeric; paid_fraction numeric; unit_rate numeric; component_lines jsonb;
 wage_available_at timestamptz; salary_source_refs jsonb;
 day_loss_source jsonb; loss_code text; loss_reason text;
BEGIN
 IF NOT coalesce(isfinite(p_month) AND p_month=date_trunc('month',p_month)::date AND isfinite(p_cutoff),false)
 THEN RAISE EXCEPTION 'An exact payroll month and finite cutoff are required' USING ERRCODE='22023'; END IF;
 SELECT * INTO employment FROM erp_private.t03_employment_periods p WHERE p.id=p_employment AND p.employee_id=p_employee
 AND p.company_id=p_company AND p.branch_id IS NOT DISTINCT FROM p_branch;
 IF employment.id IS NULL THEN RAISE EXCEPTION 'Verified historical employment required' USING ERRCODE='42501'; END IF;

 month_end:=(p_month+interval '1 month')::date;
 month_days:=month_end-p_month;
 first_day:=greatest(p_month,lower(employment.work_period),employment.actual_start);
 IF p_last_day IS NOT NULL AND (NOT isfinite(p_last_day) OR p_last_day<p_month OR p_last_day>=month_end) THEN
  RAISE EXCEPTION 'Exit date must be inside the final pay month' USING ERRCODE='22023';
 END IF;
 until_day:=least(month_end,upper(employment.work_period),p_last_day+1);
 IF first_day>=until_day THEN RAISE EXCEPTION 'Employment does not intersect payroll month' USING ERRCODE='22023'; END IF;

 SELECT coalesce(c.applied_at,l.created_at),stop.applied_at INTO opening_at,closing_at
 FROM erp_private.t03_employment_periods e
 LEFT JOIN erp_private.t03_employment_changes c ON c.id=e.change_id
 LEFT JOIN public.employee_recruitment_links l ON l.id=e.recruitment_link_id
 LEFT JOIN erp_private.t03_employment_changes stop ON stop.id=e.closed_by_change_id
 WHERE e.id=employment.id;
 IF opening_at IS NULL OR opening_at>p_cutoff OR until_day<month_end AND employment.closed_by_change_id IS NOT NULL
      AND (closing_at IS NULL OR closing_at>p_cutoff) THEN
  exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception(
   'employment-unverified-at-cutoff','Confirm the employment start or changed period against the payroll cutoff.',true,
   jsonb_build_object('employment_id',employment.id)));
 END IF;

 IF NOT coalesce(p_rule->>'proration' IN ('calendar-days','fixed-days')
    AND p_rule->>'rounding'='line-half-up' AND p_rule->>'absence' IN ('unpaid-only','verified-absence')
    AND p_rule->>'leave_wage_basis' IN ('basic','gross'),false)
   OR p_rule->>'proration'='fixed-days' AND NOT coalesce(p_rule->>'fixed_days' ~ '^([1-9]|[12][0-9]|3[01])$',false)
 THEN
  exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception(
   'missing-salary-proration-policy','Approve the proration, absence, leave wage and rounding rules before calculating pay.',true));
 ELSE
  divisor:=CASE WHEN p_rule->>'proration'='fixed-days' THEN (p_rule->>'fixed_days')::int ELSE month_days END;
 END IF;

 profile:=erp_private.t14_salary_profile(p_employee,first_day,p_cutoff);
 money_currency:=profile->>'currency';
 payroll_group:=(profile->>'group_id')::bigint;
 eligibility:=profile->>'status';
 IF eligibility<>'ready' THEN
  exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception(eligibility,
   'Verify the dated salary profile, active monthly payroll group and currency before calculating pay.',true,profile->'source'));
 ELSIF p_rule->>'currency' IS NOT NULL AND p_rule->>'currency'<>money_currency THEN
  exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception(
   'policy-salary-currency-mismatch','The approved payroll rule and salary profile have different currencies.',true));
 END IF;

 FOR held IN
  SELECT h.id,h.hold_date,h.release_date FROM public.employee_payroll_holds h
  WHERE h.employee_id=p_employee AND h.hold_date<until_day AND h.created_at<=p_cutoff
    AND (h.deleted_at IS NULL OR h.deleted_at>p_cutoff)
    AND (h.is_active OR h.updated_at>p_cutoff OR h.release_date>(p_cutoff AT TIME ZONE 'Asia/Dubai')::date)
    AND (h.release_date IS NULL OR h.release_date>(p_cutoff AT TIME ZONE 'Asia/Dubai')::date OR h.updated_at>p_cutoff)
  ORDER BY h.id
 LOOP
  exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception('payroll-hold',
   'An effective payroll hold requires Accounts review.',true,jsonb_build_object('hold_id',held.id,'hold_date',held.hold_date)));
 END LOOP;
 result:=jsonb_build_object('lines','[]'::jsonb,'currency',money_currency,'group_id',payroll_group,'divisor',divisor,
  'profile',profile->'source','employment_id',employment.id,'from',first_day,'until',until_day);
 IF jsonb_array_length(exceptions)>0 THEN RETURN result||jsonb_build_object('exceptions',exceptions); END IF;

 -- A full month of verified continuous service uses the calendar denominator
 -- even when a transfer splits it. Partial service follows the approved
 -- divisor with a cap across all of the employee's verified pay periods.
 SELECT coalesce(sum(CASE WHEN p_last_day IS NULL THEN
    least(month_end,upper(e.work_period))-greatest(p_month,lower(e.work_period),e.actual_start)
   ELSE greatest(0,least(month_end,upper(e.work_period),
     CASE WHEN e.id=employment.id THEN p_last_day+1 END)-greatest(p_month,lower(e.work_period),e.actual_start)) END),0)
 INTO total_employed FROM erp_private.t03_employment_periods e WHERE e.employee_id=p_employee
   AND e.work_period&&daterange(p_month,month_end,'[)');
 recurring_divisor:=CASE WHEN total_employed=month_days THEN month_days ELSE greatest(divisor,total_employed) END;
 FOR work_day IN SELECT first_day+day_no FROM generate_series(0,until_day-first_day-1) day_no LOOP
  day_basis:=erp_private.t14_salary_day(p_employee,work_day,p_cutoff,money_currency);
  IF day_basis->>'status'<>'ready' THEN
   exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception(day_basis->>'status',
     'Review overlapping rates, missing Basic pay or unverified historical salary before calculating this employee.',true,
     jsonb_build_object('day',work_day,'source_id',day_basis->'source_id')));
   RETURN result||jsonb_build_object('exceptions',exceptions);
  END IF;
  salary_days:=salary_days||jsonb_build_array(jsonb_build_object('day',work_day,'basis',day_basis));
 END LOOP;

 IF EXISTS(SELECT 1 FROM public.employee_salary_revision_effects r WHERE r.employee_id=p_employee AND r.effective_date<until_day
   AND r.applied_at>p_cutoff) THEN
  exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception('salary-revision-after-cutoff',
   'A salary revision applied after the cutoff. The draft retains the salary basis available by cutoff.',false));
 END IF;
 IF EXISTS(SELECT 1 FROM public.employee_salary_components c WHERE c.employee_id=p_employee AND c.effective_from<until_day
   AND (c.effective_to IS NULL OR c.effective_to>=first_day) AND c.created_at>p_cutoff) THEN
  exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception('salary-component-after-cutoff',
   'A salary component was added after the cutoff. Review its effect on an eligible later run.',false));
 END IF;

 -- Group exact contiguous terms. Anchoring each rounded slice to the month's
 -- day offsets also preserves the last cent across an in-month transfer.
 WITH daily AS (
  SELECT (d->>'day')::date AS day,v AS entry
  FROM jsonb_array_elements(salary_days) d CROSS JOIN LATERAL jsonb_array_elements(d->'basis'->'entries') v
 ), consecutives AS (
  SELECT distinct_day.*,day-(row_number() OVER(PARTITION BY entry ORDER BY day))::int AS band
  FROM daily distinct_day
 ), grouped AS (
  SELECT entry,min(day) AS begins,max(day)+1 AS ends,(entry->>'monthly_rate')::numeric AS monthly_rate
  FROM consecutives GROUP BY entry,band
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'key','recurring:'||employment.id||':'||(entry->>'component_key')||':'||begins,
   'category',entry->>'category','kind',entry->>'kind','currency',money_currency,
   'amount',round(monthly_rate*(ends-p_month)/recurring_divisor,2)-round(monthly_rate*(begins-p_month)/recurring_divisor,2),
   'quantity',ends-begins,'rate',monthly_rate/recurring_divisor,'unit','calendar-day','original_on',begins,
   'available_at',greatest((entry->>'available_at')::timestamptz,(profile->'source'->>'available_at')::timestamptz,opening_at),
   'reason',entry->>'reason','source',(entry->'source')||(profile->'source')||jsonb_build_object(
    'employment_id',employment.id,'from',begins,'until',ends,'monthly_rate',monthly_rate,
    'proration_divisor',recurring_divisor,'month_anchor',p_month,'rounding',p_rule->>'rounding'))
   ORDER BY begins,entry->>'component_key'),'[]') INTO component_lines FROM grouped;
 lines:=component_lines;

 FOR work_day,day_basis IN SELECT (s->>'day')::date,s->'basis' FROM jsonb_array_elements(salary_days) s LOOP
  leave_day:=erp_private.t14_leave_day(p_employment,p_employee,p_company,p_branch,work_day,p_cutoff);
  deduction_monthly_rate:=(day_basis->>(p_rule->>'leave_wage_basis'))::numeric;
  unit_rate:=deduction_monthly_rate/divisor;
  SELECT * INTO attendance FROM public.employee_attendance_daily_summary a
   WHERE a.employee_id=p_employee AND a.attendance_date=work_day;
  IF leave_day->>'status'='ready' THEN
   IF attendance.approval_status IN ('approved','locked') AND attendance.approved_at<=p_cutoff
     AND attendance.updated_at<=p_cutoff AND (attendance.worked_minutes>0 OR attendance.total_hours>0) THEN
    exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception('work-overlapping-approved-leave',
     'Reconcile approved work and leave recorded on the same date.',true,
     jsonb_build_object('case_id',leave_day->'case_id','attendance_id',attendance.id,'day',work_day)));
    CONTINUE;
   END IF;
   paid_fraction:=(leave_day->>'paid_fraction')::numeric;
   loss_code:=CASE WHEN leave_day->>'category'='sick' THEN 'sick-leave'
                   WHEN paid_fraction=1 THEN 'paid-leave' ELSE 'unpaid-leave' END;
   loss_reason:=CASE WHEN paid_fraction=1 THEN 'Approved paid leave included in monthly pay'
                     WHEN leave_day->>'category'='sick' THEN 'Approved sick leave pay tier'
                     ELSE 'Approved unpaid leave' END;
   day_loss_source:=(leave_day-'status'-'approved_at');
  ELSIF leave_day IS NOT NULL THEN
   exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception(
    CASE leave_day->>'status' WHEN 'late' THEN 'leave-approval-after-cutoff' WHEN 'pending' THEN 'leave-review-pending'
      ELSE 'leave-approval-unverified' END,
    'Review the pending, late or unverified leave allocation before applying a payroll deduction.',
    leave_day->>'status' IN ('unverified','ambiguous'),jsonb_build_object('day',work_day,
     'case_id',leave_day->'case_id','allocation_id',leave_day->'allocation_id')));
   CONTINUE;
  ELSE
   SELECT l.id INTO legacy_id FROM public.employee_leave_requests l WHERE l.employee_id=p_employee
     AND l.approval_status='approved' AND l.deleted_at IS NULL AND l.created_at<=p_cutoff
     AND work_day BETWEEN l.start_date AND l.end_date ORDER BY l.id LIMIT 1;
   IF legacy_id IS NOT NULL THEN
    exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception('legacy-leave-pay-unverified',
     'Convert the approved legacy leave into a verified dated pay allocation before using it in payroll.',true,
      jsonb_build_object('request_id',legacy_id,'day',work_day)));
    CONTINUE;
   END IF;
   IF attendance.id IS NULL OR attendance.attendance_type NOT IN ('absent','on_leave') THEN CONTINUE; END IF;
   IF attendance.attendance_type='on_leave' THEN
    exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception('attendance-leave-without-allocation',
     'Match the leave attendance to its approved dated pay allocation.',true,
     jsonb_build_object('attendance_id',attendance.id,'day',work_day)));
    CONTINUE;
   END IF;
   IF p_rule->>'absence'='unpaid-only' THEN CONTINUE; END IF;
   IF attendance.approval_status NOT IN ('approved','locked') OR attendance.approved_by IS NULL
     OR attendance.approved_at IS NULL OR attendance.approved_at>p_cutoff OR attendance.updated_at>p_cutoff THEN
    exceptions:=exceptions||jsonb_build_array(erp_private.t14_hr_exception(
     CASE WHEN attendance.approved_at>p_cutoff OR attendance.updated_at>p_cutoff THEN 'attendance-after-cutoff'
       ELSE 'attendance-review-pending' END,
     'Only absence approved and available by the cutoff can affect the draft.',false,
     jsonb_build_object('attendance_id',attendance.id,'day',work_day)));
    CONTINUE;
   END IF;
   paid_fraction:=0;
   loss_code:='absence';
   loss_reason:='Independently approved absence';
   day_loss_source:=jsonb_build_object('attendance_id',attendance.id,'attendance_revision',attendance.workspace_revision,
     'attendance_digest',erp_private.t08_attendance_digest(attendance),'paid_fraction',paid_fraction);
  END IF;
  SELECT coalesce(jsonb_agg(v->'source' ORDER BY v->>'component_key'),'[]'),max((v->>'available_at')::timestamptz)
  INTO salary_source_refs,wage_available_at FROM jsonb_array_elements(day_basis->'entries') v
  WHERE v->>'kind'='earning' AND (p_rule->>'leave_wage_basis'='gross' OR v->>'category'='basic');
  lines:=lines||jsonb_build_array(jsonb_build_object(
   'key','pay-day-loss:'||employment.id||':'||work_day,
   'category',loss_code,'kind','deduction','amount',round(unit_rate*(1-paid_fraction),2),'currency',money_currency,
   'quantity',1-paid_fraction,'unit','unpaid-day','rate',unit_rate,'original_on',work_day,
   'available_at',greatest(coalesce((leave_day->>'approved_at')::timestamptz,attendance.approved_at),
                          wage_available_at,(profile->'source'->>'available_at')::timestamptz,opening_at),
   'reason',loss_reason,'source',day_loss_source||jsonb_build_object(
    'employment_id',employment.id,'wage_basis',p_rule->>'leave_wage_basis','monthly_rate',deduction_monthly_rate,
    'proration_divisor',divisor,'rounding',p_rule->>'rounding','salary_sources',salary_source_refs)));
 END LOOP;
 RETURN result||jsonb_build_object('lines',lines,'exceptions',exceptions,'recurring_divisor',recurring_divisor);
END;
$$;

CREATE OR REPLACE FUNCTION erp_private.t14_salary_sources(p_employee bigint,p_employment bigint,p_company bigint,p_branch bigint,
 p_month date,p_cutoff timestamptz,p_rule jsonb)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_private.t14_salary_sources_through(p_employee,p_employment,p_company,p_branch,p_month,p_cutoff,p_rule,NULL);
$$;

CREATE FUNCTION erp_private.t18_leave_cashout(
 p_case erp_private.t18_cases,p_cutoff timestamptz,p_policy erp_private.t18_calculation_policies,p_salary jsonb,p_currency text
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE leave_policy erp_private.t04_policies; employment erp_private.t03_employment_periods; period erp_private.t04_periods;
  fund record; days numeric; rate numeric; lines jsonb:='[]'; invalid boolean; entry jsonb;
  as_of_fingerprint text; wage_at timestamptz;
BEGIN
 IF p_policy.facts->>'leave_cashout'='none' THEN RETURN jsonb_build_object('lines',lines); END IF;
 SELECT * INTO STRICT employment FROM erp_private.t03_employment_periods WHERE id=p_case.employment_id;
 leave_policy:=erp_private.t04_policy(p_case.company_id,p_case.employee_id,p_case.last_day);
 SELECT per.* INTO period FROM erp_private.t04_periods per
 JOIN erp_private.t04_setup setup ON setup.id=per.setup_id AND setup.approved_at<=p_cutoff
 JOIN erp_private.t04_setup rule ON rule.id=per.policy_id AND rule.approved_at<=p_cutoff
 WHERE per.employee_id=p_case.employee_id AND per.company_id=p_case.company_id AND per.coverage @> p_case.last_day
   AND per.cutoff<=p_case.last_day AND per.policy_id=leave_policy.id
   AND per.service_start=erp_private.t04_service_start(employment,leave_policy.facts);
 IF period.id IS NULL THEN
  RETURN jsonb_build_object('issue',erp_private.t14_hr_exception('exit-leave-balance-unverified',
   'HR must verify the applicable annual leave entitlement and opening balance.',true));
 END IF;
 SELECT EXISTS(SELECT 1 FROM erp_private.f12_leave_movements m WHERE m.entitlement_id=period.id AND m.created_at>p_cutoff)
    OR EXISTS(SELECT 1 FROM erp_private.t04_days d JOIN erp_private.t04_cases c ON c.id=d.case_id
     WHERE d.period_id=period.id AND d.state IN ('reserved','posted') AND c.category='annual'
       AND (d.state='reserved' OR d.day>p_case.last_day))
    OR EXISTS(SELECT 1 FROM public.employee_leave_requests l WHERE l.employee_id=p_case.employee_id AND l.deleted_at IS NULL
       AND l.start_date<=p_case.last_day AND l.end_date>=period.cutoff AND l.approval_status IN ('pending','approved'))
 INTO invalid;
 IF invalid THEN
  RETURN jsonb_build_object('issue',erp_private.t14_hr_exception('exit-leave-review-required',
   'Reconcile pending, legacy, post-exit or late leave activity against the approved entitlement.',true,
   jsonb_build_object('period_id',period.id)));
 END IF;
 IF p_salary->>'status' IS DISTINCT FROM 'ready' THEN RETURN jsonb_build_object('lines',lines); END IF;
 rate:=(p_salary->>(p_policy.facts->>'leave_wage_basis'))::numeric/(p_policy.facts->>'leave_cashout_divisor')::numeric;
 SELECT max((e->>'available_at')::timestamptz) INTO wage_at FROM jsonb_array_elements(p_salary->'entries') e
  WHERE e->>'kind'='earning' AND (p_policy.facts->>'leave_wage_basis'='gross' OR e->>'category'='basic');
 FOR fund IN
  SELECT NULL::bigint AS id,NULL::timestamptz AS created_at
  UNION ALL
  SELECT m.id,m.created_at FROM erp_private.f12_leave_movements m
   WHERE m.entitlement_id=period.id AND m.movement_version=2 AND m.effect='carry-in' AND m.expires_before>p_case.last_day
  ORDER BY id NULLS FIRST
 LOOP
  days:=erp_private.t04_funds_remaining(period.id,fund.id,p_case.last_day,NULL);
  IF days<0 THEN
   RETURN jsonb_build_object('issue',erp_private.t14_hr_exception('exit-leave-balance-negative',
    'Reconcile the negative leave fund before calculating unused leave.',true,jsonb_build_object('period_id',period.id,'fund_id',fund.id)));
  END IF;
  IF days IS NULL OR round(days*rate,2)=0 THEN CONTINUE; END IF;
  SELECT erp_private.t02_digest(jsonb_build_array(to_jsonb(period),fund.id,coalesce(jsonb_agg(
     jsonb_build_array(m.id,m.effect,m.days,m.created_at,m.allocation_id,m.allocation_revision) ORDER BY m.id),'[]')))
   INTO as_of_fingerprint FROM erp_private.f12_leave_movements m
   WHERE m.entitlement_id=period.id AND (m.fund_id IS NOT DISTINCT FROM fund.id OR m.id=fund.id);
  entry:=erp_private.t14_operational_line('exit-leave:'||period.id||':'||coalesce(fund.id,0),'leave-cashout',round(days*rate,2),
   p_currency,days,'day',rate,p_case.last_day,greatest(wage_at,fund.created_at,p_policy.decided_at),
   jsonb_build_object('employment',p_case.employment_id,'period_id',period.id,'fund_id',fund.id,
    'eligible_days',days,'leave_policy_id',leave_policy.id,'fingerprint',as_of_fingerprint,'salary_basis',p_salary->'entries'),
   'Approved unused annual leave available on the final day');
  lines:=lines||jsonb_build_array(entry);
 END LOOP;
 RETURN jsonb_build_object('lines',lines);
END $$;

CREATE FUNCTION erp_private.t18_termination_benefit(
 p_case erp_private.t18_cases,p_cutoff timestamptz,p_policy erp_private.t18_calculation_policies,p_salary jsonb,p_currency text
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE b jsonb:=p_policy.facts->'benefit'; exit_kind text; sources jsonb; unpaid_sources jsonb;
  service_days int; unpaid_days int:=0; missing_origin boolean; unresolved_leave boolean; years numeric; wage_days numeric;
  wage_rate numeric; amount numeric; wage_at timestamptz; first_years numeric;
BEGIN
 SELECT eos_type INTO STRICT exit_kind FROM public.employee_eos_cases WHERE id=p_case.eos_id AND deleted_at IS NULL;
 IF b->>'mode'='none' OR NOT (b->'exit_types' ? exit_kind) THEN RETURN '{}'::jsonb; END IF;
 IF p_salary->>'status' IS DISTINCT FROM 'ready' THEN RETURN '{}'::jsonb; END IF;
 WITH RECURSIVE service AS (
   SELECT e.* FROM erp_private.t03_employment_periods e WHERE e.id=p_case.employment_id
   UNION ALL
   SELECT next_e.* FROM service current_e
   JOIN erp_private.t03_employment_periods next_e ON next_e.employee_id=current_e.employee_id
      AND next_e.company_id=current_e.company_id AND upper(next_e.work_period)=lower(current_e.work_period)
   WHERE b->>'service'='continuous-employer'
 ), verified AS (
  SELECT e.id,e.branch_id,greatest(lower(e.work_period),e.actual_start) AS begins,
   least(upper(e.work_period),p_case.last_day+1) AS ends,
   coalesce(c.applied_at,r.created_at) AS opened_at,e.source_revision
  FROM service e LEFT JOIN erp_private.t03_employment_changes c ON c.id=e.change_id
  LEFT JOIN public.employee_recruitment_links r ON r.id=e.recruitment_link_id
 )
 SELECT coalesce(sum(greatest(0,ends-begins)),0),coalesce(bool_or(opened_at IS NULL OR opened_at>p_cutoff),true),
    coalesce(jsonb_agg(to_jsonb(v) ORDER BY begins,id),'[]') INTO service_days,missing_origin,sources FROM verified v;
 IF missing_origin THEN
  RETURN jsonb_build_object('issue',erp_private.t14_hr_exception('exit-benefit-service-unverified',
   'Verify the employment dates and applicable continuous service before calculating the benefit.',true));
 END IF;
 IF (b->>'exclude_unpaid')::boolean THEN
  IF EXISTS(SELECT 1 FROM public.employee_leave_requests l WHERE l.employee_id=p_case.employee_id AND l.deleted_at IS NULL
     AND l.approval_status IN ('pending','approved') AND EXISTS(SELECT 1 FROM jsonb_array_elements(sources) s
     WHERE l.start_date<(s->>'ends')::date AND l.end_date>=(s->>'begins')::date)) THEN
   RETURN jsonb_build_object('issue',erp_private.t14_hr_exception('exit-benefit-legacy-leave-review',
    'Verify historical leave against the service exclusion rule.',true));
  END IF;
  WITH affected AS (
   SELECT DISTINCT d.day,c.employment_id,c.branch_id
   FROM erp_private.t04_days d JOIN erp_private.t04_cases c ON c.id=d.case_id
   JOIN jsonb_array_elements(sources) s ON (s->>'id')::bigint=c.employment_id
   WHERE d.employee_id=p_case.employee_id AND d.day>=(s->>'begins')::date AND d.day<(s->>'ends')::date
  ), verified AS (
   SELECT day,erp_private.t14_leave_day(employment_id,p_case.employee_id,p_case.company_id,branch_id,day,p_cutoff) AS facts
   FROM affected
  )
  SELECT count(*) FILTER(WHERE facts->>'status'='ready' AND (facts->>'paid_fraction')::numeric=0),
    coalesce(jsonb_agg(jsonb_build_object('day',day,'approval',facts) ORDER BY day)
             FILTER(WHERE facts->>'status'='ready' AND (facts->>'paid_fraction')::numeric=0),'[]'),
    coalesce(bool_or(facts IS NOT NULL AND facts->>'status'<>'ready'),false)
   INTO unpaid_days,unpaid_sources,unresolved_leave FROM verified;
  IF unresolved_leave THEN
   RETURN jsonb_build_object('issue',erp_private.t14_hr_exception('exit-benefit-leave-review',
    'Verify the leave that may change the days of service for this benefit.',true));
  END IF;
 END IF;
 service_days:=greatest(0,service_days-unpaid_days);
 IF service_days<(b->>'minimum_days')::int THEN RETURN '{}'::jsonb; END IF;
 years:=service_days::numeric/(b->>'year_divisor')::numeric;
 first_years:=least(years,(b->>'first_band_years')::numeric);
 wage_days:=least((b->>'cap_days')::numeric,first_years*(b->>'first_days_per_year')::numeric
                                      +(years-first_years)*(b->>'later_days_per_year')::numeric);
 wage_rate:=(p_salary->>'basic')::numeric/(b->>'day_divisor')::numeric;
 amount:=round(wage_days*wage_rate,2);
 IF amount=0 THEN RETURN '{}'::jsonb; END IF;
 SELECT max((e->>'available_at')::timestamptz) INTO wage_at FROM jsonb_array_elements(p_salary->'entries') e WHERE e->>'category'='basic';
 RETURN jsonb_build_object('line',erp_private.t14_operational_line(
   'exit-benefit:'||p_case.employment_id,'termination-benefit',amount,p_currency,wage_days,'day',wage_rate,
   p_case.last_day,greatest(wage_at,p_policy.decided_at),jsonb_build_object('employment',p_case.employment_id,
     'policy_id',p_policy.id,'verified_service_days',service_days,'exit_type',exit_kind,'verified_periods',sources,
     'excluded_unpaid_days',unpaid_sources,'salary_basis',p_salary->'entries'),
   'Termination benefit calculated under the approved employer exit rule'));
END $$;

CREATE FUNCTION erp_private.t18_pay_basis(p_case erp_private.t18_cases,p_cutoff timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE policy erp_private.t18_calculation_policies; adjustment erp_private.t18_exit_adjustments;
 month date:=date_trunc('month',p_case.last_day)::date;
 salary jsonb; dated_salary jsonb; work jsonb; item jsonb; pay_state jsonb; prior_holds jsonb;
 leave_result jsonb; benefit_result jsonb; currency text; issue_source jsonb;
 lines jsonb:='[]'; issues jsonb:='[]'; claim_months jsonb:='[]'; policy_basis jsonb;
BEGIN
 IF NOT coalesce(isfinite(p_cutoff) AND p_case.last_day<=(p_cutoff AT TIME ZONE 'Asia/Dubai')::date,false) THEN
  RAISE EXCEPTION 'Use a finite cutoff on or after the final day' USING ERRCODE='22023';
 END IF;
 SELECT * INTO policy FROM erp_private.t18_calculation_policies p
  WHERE p.company_id=p_case.company_id AND p.branch_id=p_case.branch_id AND p.effective @> p_case.last_day
     AND p.status='approved' AND p.decided_at<=p_cutoff;
 IF policy.id IS NULL THEN
  issues:=jsonb_build_array(erp_private.t14_hr_exception('exit-policy-missing',
   'Approve an effective final settlement policy for the exact employer and branch.',true));
  RETURN jsonb_build_object('currency',null,'lines',lines,'issues',issues,'policy',null,'salary_claim_months',claim_months);
 END IF;
 policy_basis:=jsonb_build_object('id',policy.id,'digest',policy.receipt_digest,'facts',policy.facts,
    'payment_channels',policy.facts->'payment_channels','approved_at',policy.decided_at);
 salary:=erp_private.t14_salary_sources_through(p_case.employee_id,p_case.employment_id,p_case.company_id,p_case.branch_id,
    month,p_cutoff,policy.facts||'{"rounding":"line-half-up"}',p_case.last_day);
 currency:=salary->>'currency';
 FOR item IN SELECT value FROM jsonb_array_elements(salary->'exceptions') LOOP
  IF item->>'code' IN ('leave-review-pending','leave-approval-after-cutoff','attendance-review-pending','attendance-after-cutoff',
     'salary-revision-after-cutoff','salary-component-after-cutoff') THEN item:=item||'{"blocking":true}'; END IF;
  issues:=issues||jsonb_build_array(item);
 END LOOP;
 pay_state:=erp_private.t18_monthly_payroll_status(p_case.employment_id,p_case.employee_id,month);
 IF pay_state->>'state'='settled' AND EXISTS(
    SELECT 1 FROM jsonb_array_elements(pay_state->'settlements') s WHERE s->>'coverage_from'=salary->>'from'
       AND s->>'coverage_until'=salary->>'until') THEN
  issues:=issues||jsonb_build_array(erp_private.t14_hr_exception('exit-salary-already-settled',
   'Reconciled monthly payroll covers the final salary days.',false,pay_state));
 ELSIF pay_state->>'state'='unclaimed' THEN
  lines:=lines||(salary->'lines');
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(salary->'lines') l WHERE l->>'category'='basic') THEN
   claim_months:=jsonb_build_array(month);
  END IF;
 ELSE
  issues:=issues||jsonb_build_array(erp_private.t14_hr_exception('exit-monthly-salary-coverage-review',
   'Reconcile the monthly salary result and its exact coverage before paying final salary.',true,pay_state));
 END IF;
 prior_holds:=erp_private.t18_prior_payroll_holds(p_case.employment_id,p_case.employee_id,month);
 IF jsonb_array_length(prior_holds)>0 THEN
  issues:=issues||jsonb_build_array(erp_private.t14_hr_exception('exit-earlier-payroll-unreconciled',
   'Resolve earlier partial, pending or unallocated payroll for this employment.',true,prior_holds));
 END IF;
 dated_salary:=erp_private.t14_salary_day(p_case.employee_id,p_case.last_day,p_cutoff,currency);
 IF dated_salary->>'status' IS DISTINCT FROM 'ready' THEN
  issues:=issues||jsonb_build_array(erp_private.t14_hr_exception('exit-final-day-wage-unverified',
   'Verify the salary basis effective on the final day.',true,jsonb_build_object('status',dated_salary->>'status')));
 END IF;
 leave_result:=erp_private.t18_leave_cashout(p_case,p_cutoff,policy,dated_salary,currency);
 lines:=lines||coalesce(leave_result->'lines','[]'::jsonb);
 IF leave_result ? 'issue' THEN issues:=issues||jsonb_build_array(leave_result->'issue'); END IF;
 benefit_result:=erp_private.t18_termination_benefit(p_case,p_cutoff,policy,dated_salary,currency);
 IF benefit_result ? 'line' THEN lines:=lines||jsonb_build_array(benefit_result->'line'); END IF;
 IF benefit_result ? 'issue' THEN issues:=issues||jsonb_build_array(benefit_result->'issue'); END IF;

 work:=erp_private.t14_operational_sources(p_case.employee_id,p_case.company_id,p_case.branch_id,month,p_cutoff);
 FOR item IN SELECT value FROM jsonb_array_elements(work->'lines') l
   WHERE (l->'source'->>'employment')::bigint=p_case.employment_id AND (l->>'original_on')::date<=p_case.last_day
 LOOP
  pay_state:=erp_private.t18_other_payroll_line(p_case.employee_id,item);
  IF pay_state->>'state'='settled' THEN
   issues:=issues||jsonb_build_array(erp_private.t14_hr_exception('exit-work-already-settled',
    'Reconciled monthly payroll already includes this earnings source.',false,
    jsonb_build_object('key',item->>'key','payroll',pay_state)));
  ELSIF pay_state->>'state' IS DISTINCT FROM 'unclaimed' THEN
   issues:=issues||jsonb_build_array(erp_private.t14_hr_exception('exit-work-payment-review',
    'Reconcile the outstanding or overlapping monthly claim before paying this earnings source.',true,
    jsonb_build_object('key',item->>'key','payroll',pay_state)));
  ELSIF currency IS DISTINCT FROM item->>'currency' THEN
   issues:=issues||jsonb_build_array(erp_private.t14_hr_exception('exit-earnings-currency-mismatch',
    'The verified earnings currency differs from the employment salary currency.',true,item->'source'));
  ELSE
   lines:=lines||jsonb_build_array(item);
  END IF;
 END LOOP;
 FOR item IN SELECT value FROM jsonb_array_elements(work->'exceptions') LOOP
  issue_source:=item->'source';
  IF (issue_source->>'employment')::bigint=p_case.employment_id
     AND coalesce((issue_source->>'work_day')::date,
      (SELECT c.day FROM erp_private.t12_payroll_candidates c WHERE c.id=(issue_source->>'prior_candidate')::bigint),
      (SELECT v.work_day FROM erp_private.t09_allowance_versions v
        WHERE v.id=(issue_source->>'version')::bigint AND issue_source ? 'change'))<=p_case.last_day THEN
   issues:=issues||jsonb_build_array(item);
  END IF;
 END LOOP;

 FOR adjustment IN SELECT * FROM erp_private.t18_exit_adjustments WHERE eos_id=p_case.eos_id AND status<>'rejected'
   AND proposed_at<=p_cutoff ORDER BY id
 LOOP
  IF adjustment.status<>'verified' OR adjustment.decided_at>p_cutoff
     OR NOT erp_private.t18_adjustment_retained(adjustment,p_case) OR adjustment.currency IS DISTINCT FROM currency THEN
   issues:=issues||jsonb_build_array(erp_private.t14_hr_exception('exit-adjustment-review',
    'Reconcile the pending or changed adjustment, exact original and salary currency.',true,
    jsonb_build_object('adjustment',adjustment.id)));
  ELSE
   lines:=lines||jsonb_build_array(erp_private.t14_operational_line('exit-adjustment:'||adjustment.id,
    'exit-adjustment',CASE adjustment.kind WHEN 'earning' THEN adjustment.amount ELSE -adjustment.amount END,
    currency,1,'adjustment',adjustment.amount,p_case.last_day,adjustment.decided_at,
    jsonb_build_object('adjustment',adjustment.id,'employment',p_case.employment_id,'document',adjustment.document_id,
     'version',adjustment.version_id,'file',adjustment.file_id,'checksum',adjustment.checksum,'digest',adjustment.receipt_digest),
    adjustment.reason));
  END IF;
 END LOOP;
 IF EXISTS(SELECT 1 FROM erp_private.t18_exit_adjustments a WHERE a.eos_id=p_case.eos_id
     AND a.proposed_at>p_cutoff AND a.status<>'rejected') THEN
  issues:=issues||jsonb_build_array(erp_private.t14_hr_exception('exit-adjustment-after-cutoff',
    'Advance the calculation cutoff to review the new adjustment.',true));
 END IF;
 RETURN jsonb_build_object('currency',currency,'lines',lines,'issues',issues,'policy',policy_basis,'salary_claim_months',claim_months);
END $$;

CREATE FUNCTION erp_private.t18_retain_adjustment_original() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE retained boolean;
BEGIN
 IF TG_TABLE_NAME='dms_document_files' THEN
  IF TG_OP='UPDATE' AND (to_jsonb(OLD)-ARRAY['updated_at','is_current'])=(to_jsonb(NEW)-ARRAY['updated_at','is_current']) THEN
   RETURN NEW;
  END IF;
  SELECT EXISTS(SELECT 1 FROM erp_private.t18_exit_adjustments a WHERE a.file_id=OLD.id AND a.status='verified') INTO retained;
 ELSIF TG_TABLE_NAME='dms_document_versions' THEN
  IF TG_OP='UPDATE' AND (to_jsonb(OLD)-ARRAY['updated_at','is_current'])=(to_jsonb(NEW)-ARRAY['updated_at','is_current']) THEN
   RETURN NEW;
  END IF;
  SELECT EXISTS(SELECT 1 FROM erp_private.t18_exit_adjustments a WHERE a.version_id=OLD.id AND a.status='verified') INTO retained;
 ELSE
  IF TG_OP='UPDATE' AND ROW(OLD.owning_company_id,OLD.owning_branch_id,OLD.document_type_id,OLD.confidentiality_level)
     IS NOT DISTINCT FROM ROW(NEW.owning_company_id,NEW.owning_branch_id,NEW.document_type_id,NEW.confidentiality_level) THEN
   RETURN NEW;
  END IF;
  SELECT EXISTS(SELECT 1 FROM erp_private.t18_exit_adjustments a WHERE a.document_id=OLD.id AND a.status='verified') INTO retained;
 END IF;
 IF retained THEN RAISE EXCEPTION 'The verified exit adjustment original is retained' USING ERRCODE='55000'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END $$;
CREATE TRIGGER t18_retain_adjustment_file BEFORE UPDATE OR DELETE ON public.dms_document_files
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_retain_adjustment_original();
CREATE TRIGGER t18_retain_adjustment_version BEFORE UPDATE OR DELETE ON public.dms_document_versions
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_retain_adjustment_original();
CREATE TRIGGER t18_retain_adjustment_document BEFORE UPDATE OR DELETE ON public.dms_documents
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_retain_adjustment_original();

REVOKE ALL ON FUNCTION erp_private.t18_validate_calc_facts(jsonb),erp_private.t18_adjustment_original_once(),
 erp_private.t18_adjustment_retained(erp_private.t18_exit_adjustments,erp_private.t18_cases),erp_private.t18_retain_adjustment_original(),
 erp_private.t14_salary_sources_through(bigint,bigint,bigint,bigint,date,timestamptz,jsonb,date),
 erp_private.t18_leave_cashout(erp_private.t18_cases,timestamptz,erp_private.t18_calculation_policies,jsonb,text),
 erp_private.t18_termination_benefit(erp_private.t18_cases,timestamptz,erp_private.t18_calculation_policies,jsonb,text),
 erp_private.t18_pay_basis(erp_private.t18_cases,timestamptz)
FROM PUBLIC,anon,authenticated,service_role;
REVOKE ALL ON FUNCTION public.t18_settlement_policy(uuid,bigint,bigint,text,jsonb),public.t18_exit_adjustment(uuid,bigint,text,jsonb)
 FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.t18_settlement_policy(uuid,bigint,bigint,text,jsonb),public.t18_exit_adjustment(uuid,bigint,text,jsonb)
 TO authenticated;
COMMIT;
