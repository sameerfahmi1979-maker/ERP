BEGIN;

CREATE TABLE erp_private.t13_payroll_pins (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id bigint NOT NULL REFERENCES erp_private.t13_cases(id),
  schedule_id bigint NOT NULL REFERENCES erp_private.t13_schedules(id),
  refund_id bigint REFERENCES erp_private.t13_refunds(id),
  kind text NOT NULL CHECK (kind IN ('deduction','refund')),
  source_id bigint NOT NULL,
  employee_id bigint NOT NULL REFERENCES public.employees(id),
  company_id bigint NOT NULL REFERENCES public.owner_companies(id),
  branch_id bigint NOT NULL REFERENCES public.branches(id),
  employer_company_id bigint NOT NULL REFERENCES public.owner_companies(id),
  employer_branch_id bigint NOT NULL REFERENCES public.branches(id),
  payroll_month date NOT NULL CHECK (isfinite(payroll_month) AND extract(day FROM payroll_month)=1),
  payroll_run_id uuid NOT NULL,
  payroll_line_id uuid NOT NULL UNIQUE,
  gm_approval_id uuid NOT NULL,
  gm_approver_id bigint NOT NULL REFERENCES public.user_profiles(id),
  approved_amount numeric(16,2) NOT NULL CHECK (approved_amount>0 AND approved_amount<='99999999999999.99'),
  headroom numeric(16,2) NOT NULL CHECK (headroom>=approved_amount AND headroom<='99999999999999.99'),
  currency text NOT NULL CHECK (currency~'^[A-Z]{3}$'),
  proposal_digest text NOT NULL CHECK (proposal_digest~'^[a-f0-9]{64}$'),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((kind='deduction' AND refund_id IS NULL AND source_id=schedule_id)
      OR (kind='refund' AND refund_id IS NOT NULL AND source_id=refund_id)),
  UNIQUE (case_id,kind,payroll_month),
  UNIQUE (id,case_id,payroll_month)
);
CREATE INDEX t13_pins_refund ON erp_private.t13_payroll_pins(refund_id) WHERE refund_id IS NOT NULL;

CREATE TABLE erp_private.t13_receipts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pin_id bigint NOT NULL,
  case_id bigint NOT NULL,
  payroll_month date NOT NULL,
  operation_id uuid NOT NULL UNIQUE,
  actual_amount numeric(16,2) NOT NULL CHECK (actual_amount>=0 AND actual_amount<='99999999999999.99'),
  bank_reference text,
  evidence_id uuid NOT NULL,
  final boolean NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (pin_id,case_id,payroll_month) REFERENCES erp_private.t13_payroll_pins(id,case_id,payroll_month),
  UNIQUE (id,pin_id,case_id),
  CHECK ((actual_amount>0 AND bank_reference IS NOT NULL AND length(btrim(bank_reference)) BETWEEN 1 AND 150)
      OR (actual_amount=0 AND final AND bank_reference IS NULL))
);
CREATE UNIQUE INDEX t13_receipts_unique_bank_reference ON erp_private.t13_receipts(lower(btrim(bank_reference)))
  WHERE bank_reference IS NOT NULL;
CREATE UNIQUE INDEX t13_receipts_final_pin ON erp_private.t13_receipts(pin_id) WHERE final;
CREATE INDEX t13_receipts_pin ON erp_private.t13_receipts(pin_id,id);

CREATE TABLE erp_private.t13_allocations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  case_id bigint NOT NULL,
  pin_id bigint NOT NULL,
  receipt_id bigint NOT NULL,
  amount numeric(16,2) NOT NULL CHECK (amount>0 AND amount<='99999999999999.99'),
  reverses_allocation_id bigint,
  authorized_by bigint NOT NULL REFERENCES public.user_profiles(id),
  reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
  recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  FOREIGN KEY (receipt_id,pin_id,case_id) REFERENCES erp_private.t13_receipts(id,pin_id,case_id),
  UNIQUE (id,case_id),
  UNIQUE (id,receipt_id),
  FOREIGN KEY (reverses_allocation_id,receipt_id) REFERENCES erp_private.t13_allocations(id,receipt_id),
  CHECK (reverses_allocation_id IS DISTINCT FROM id)
);
CREATE INDEX t13_allocations_pin ON erp_private.t13_allocations(pin_id,id);
CREATE INDEX t13_allocations_receipt ON erp_private.t13_allocations(receipt_id,id);
CREATE INDEX t13_allocations_reversal ON erp_private.t13_allocations(reverses_allocation_id)
  WHERE reverses_allocation_id IS NOT NULL;

ALTER TABLE erp_private.t13_refunds
  ADD CONSTRAINT t13_refunds_original_allocation
    FOREIGN KEY (original_allocation_id,case_id) REFERENCES erp_private.t13_allocations(id,case_id);

-- A write here forces a concurrent transaction with an older serializable or
-- repeatable-read snapshot to retry before it can post another movement.
CREATE TABLE erp_private.t13_settlement_writes (
  case_id bigint PRIMARY KEY REFERENCES erp_private.t13_cases(id)
);

ALTER TABLE erp_private.t13_payroll_pins ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t13_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t13_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t13_settlement_writes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t13_payroll_pins,erp_private.t13_receipts,erp_private.t13_allocations,
  erp_private.t13_settlement_writes FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.t13_preserve_settlement()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'Payroll settlement history is immutable' USING ERRCODE='42501';
END $$;

CREATE TRIGGER t13_preserve_pin BEFORE UPDATE OR DELETE ON erp_private.t13_payroll_pins
  FOR EACH ROW EXECUTE FUNCTION erp_private.t13_preserve_settlement();
CREATE TRIGGER t13_preserve_receipt BEFORE UPDATE OR DELETE ON erp_private.t13_receipts
  FOR EACH ROW EXECUTE FUNCTION erp_private.t13_preserve_settlement();
CREATE TRIGGER t13_preserve_allocation BEFORE UPDATE OR DELETE ON erp_private.t13_allocations
  FOR EACH ROW EXECUTE FUNCTION erp_private.t13_preserve_settlement();

CREATE FUNCTION erp_private.t13_lock_settlement(p_case bigint)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
  PERFORM 1 FROM erp_private.t13_cases WHERE id=p_case FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recovery case is unavailable' USING ERRCODE='42501';
  END IF;
  INSERT INTO erp_private.t13_settlement_writes(case_id) VALUES (p_case)
  ON CONFLICT (case_id) DO UPDATE SET case_id=excluded.case_id;
END $$;

CREATE FUNCTION erp_private.t13_settlement_balance(p_case bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
  WITH pin_balances AS (
    SELECT p.*,
      (SELECT coalesce(sum(CASE WHEN a.reverses_allocation_id IS NULL THEN a.amount ELSE -a.amount END),0)
         FROM erp_private.t13_allocations a WHERE a.pin_id=p.id) AS allocated,
      r.actual,
      r.closed
    FROM erp_private.t13_payroll_pins p
    CROSS JOIN LATERAL (
      SELECT coalesce(sum(actual_amount),0) AS actual,coalesce(bool_or(final),false) AS closed
      FROM erp_private.t13_receipts WHERE pin_id=p.id
    ) r
    WHERE p.case_id=p_case
  )
  SELECT jsonb_build_object(
    'allocated_deduction',coalesce(sum(allocated) FILTER (WHERE kind='deduction'),0),
    'allocated_refund',coalesce(sum(allocated) FILTER (WHERE kind='refund'),0),
    'actual_deduction',coalesce(sum(actual) FILTER (WHERE kind='deduction'),0),
    'actual_refund',coalesce(sum(actual) FILTER (WHERE kind='refund'),0),
    'pending_deduction',coalesce(sum(approved_amount-allocated) FILTER (WHERE kind='deduction' AND NOT closed),0),
    'pending_refund',coalesce(sum(approved_amount-allocated) FILTER (WHERE kind='refund' AND NOT closed),0),
    'unallocated_deduction',coalesce(sum(actual-allocated) FILTER (WHERE kind='deduction'),0),
    'unallocated_refund',coalesce(sum(actual-allocated) FILTER (WHERE kind='refund'),0),
    'latest_paid_month',max(payroll_month) FILTER (WHERE kind='deduction' AND allocated>0),
    'has_open_deduction',coalesce(bool_or(NOT closed) FILTER (WHERE kind='deduction'),false),
    'has_open_refund',coalesce(bool_or(NOT closed) FILTER (WHERE kind='refund'),false)
  ) FROM pin_balances;
$$;

CREATE FUNCTION erp_private.t13_refund_capacity(p_allocation bigint)
RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
  -- Withdrawal releases the unpaid reserve. Any refund already allocated
  -- still counts against the original deduction.
  SELECT coalesce((
    SELECT a.amount
      - (SELECT coalesce(sum(r.amount),0) FROM erp_private.t13_allocations r WHERE r.reverses_allocation_id=a.id)
      - (SELECT coalesce(sum(CASE WHEN w.refund_id IS NULL THEN f.amount ELSE (
           SELECT coalesce(sum(CASE WHEN paid.reverses_allocation_id IS NULL THEN paid.amount ELSE -paid.amount END),0)
           FROM erp_private.t13_payroll_pins refund_pin
           JOIN erp_private.t13_allocations paid ON paid.pin_id=refund_pin.id WHERE refund_pin.refund_id=f.id
         ) END),0)
         FROM erp_private.t13_refunds f LEFT JOIN erp_private.t13_refund_withdrawals w ON w.refund_id=f.id
         WHERE f.original_allocation_id=a.id)
    FROM erp_private.t13_allocations a
    JOIN erp_private.t13_payroll_pins p ON p.id=a.pin_id AND p.kind='deduction'
    WHERE a.id=p_allocation AND a.reverses_allocation_id IS NULL
  ),0);
$$;

-- The T15 approval transaction must establish the exact GM-approved run
-- version, line, employee, payer and approved payment before calling this.
CREATE FUNCTION erp_private.t13_payroll_pin(
  p_case bigint,p_kind text,p_source bigint,p_month date,p_run uuid,p_line uuid,p_approval uuid,p_gm_actor bigint,
  p_amount numeric,p_headroom numeric,p_digest text
) RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  c erp_private.t13_cases;
  s erp_private.t13_schedules;
  f erp_private.t13_refunds;
  pin erp_private.t13_payroll_pins;
  basis jsonb;
  remaining_refund numeric;
  identity bigint;
BEGIN
  IF p_case IS NULL OR p_kind IS NULL OR p_kind NOT IN ('deduction','refund') OR p_source IS NULL
     OR p_month IS NULL OR NOT isfinite(p_month) OR extract(day FROM p_month)<>1
     OR p_run IS NULL OR p_line IS NULL OR p_approval IS NULL OR p_gm_actor IS NULL
     OR NOT coalesce(p_amount>0 AND p_amount<=p_headroom AND p_headroom<=99999999999999.99
          AND p_amount=round(p_amount,2) AND p_headroom=round(p_headroom,2),false)
     OR NOT coalesce(p_digest~'^[a-f0-9]{64}$',false) THEN
    RAISE EXCEPTION 'Pin the exact approved payroll line, amount and case proposal' USING ERRCODE='22023';
  END IF;
  PERFORM erp_private.t13_lock_settlement(p_case);
  SELECT * INTO pin FROM erp_private.t13_payroll_pins WHERE payroll_line_id=p_line;
  IF FOUND THEN
    IF ROW(pin.case_id,pin.kind,pin.source_id,pin.payroll_month,pin.payroll_run_id,pin.gm_approval_id,pin.gm_approver_id,
           pin.approved_amount,pin.headroom,pin.proposal_digest)
       IS DISTINCT FROM ROW(p_case,p_kind,p_source,p_month,p_run,p_approval,p_gm_actor,p_amount,p_headroom,p_digest) THEN
      RAISE EXCEPTION 'The original recovery approval pin already exists' USING ERRCODE='PT409';
    END IF;
    RETURN pin.id;
  END IF;
  SELECT * INTO c FROM erp_private.t13_cases WHERE id=p_case;
  IF c.employee_id IS NULL OR c.employer_company_id IS NULL OR c.employer_branch_id IS NULL
     OR EXISTS (SELECT 1 FROM public.erp_user_employee_links WHERE user_profile_id=p_gm_actor AND employee_id=c.employee_id)
     OR EXISTS (SELECT 1 FROM erp_private.t13_payroll_pins p WHERE p.case_id=p_case AND p.kind=p_kind
          AND (p.payroll_month>=p_month OR NOT EXISTS (SELECT 1 FROM erp_private.t13_receipts WHERE pin_id=p.id AND final))) THEN
    RAISE EXCEPTION 'Review the prior settlement and obtain an independent exact payroll approval' USING ERRCODE='PT409';
  END IF;
  basis:=erp_private.t13_payroll_proposal(p_case,p_month,p_kind);
  IF ROW(basis->>'status',(basis->>'case_id')::bigint,basis->>'kind',(basis->>'source_id')::bigint,
         basis->>'currency',basis->>'digest')
     IS DISTINCT FROM ROW('ready'::text,p_case,p_kind,p_source,c.currency,p_digest)
     OR NOT coalesce(p_amount<=(basis->>'amount')::numeric,false) THEN
    RAISE EXCEPTION 'The recovery proposal changed before payroll approval' USING ERRCODE='PT409';
  END IF;
  SELECT * INTO s FROM erp_private.t13_schedules WHERE id=(basis->>'schedule_id')::bigint AND case_id=p_case;
  IF s.id IS NULL OR s.prepared_by IS NOT DISTINCT FROM p_gm_actor
     OR (p_kind='deduction' AND s.id<>p_source) THEN
    RAISE EXCEPTION 'Pin the independently approved schedule for this recovery case' USING ERRCODE='PT409';
  END IF;
  IF p_kind='refund' THEN
    SELECT f_row.* INTO f FROM erp_private.t13_refunds f_row
      JOIN erp_private.t13_allocations a ON a.id=f_row.original_allocation_id AND a.case_id=f_row.case_id
      JOIN erp_private.t13_payroll_pins original ON original.id=a.pin_id
      WHERE f_row.id=p_source AND f_row.case_id=p_case AND f_row.schedule_id=s.id AND f_row.prepared_by<>p_gm_actor
        AND original.schedule_id=s.id AND original.kind='deduction' AND a.reverses_allocation_id IS NULL
        AND p_month>=f_row.first_month AND p_month>=original.payroll_month
        AND NOT EXISTS (SELECT 1 FROM erp_private.t13_refund_withdrawals w WHERE w.refund_id=f_row.id)
        AND ROW(original.employee_id,original.employer_company_id,original.employer_branch_id,original.currency)
          =ROW(c.employee_id,c.employer_company_id,c.employer_branch_id,c.currency);
    IF f.id IS NULL THEN
      RAISE EXCEPTION 'Match refund to the original allocated deduction and payer' USING ERRCODE='PT409';
    END IF;
    SELECT f.amount-coalesce(sum(CASE WHEN a.reverses_allocation_id IS NULL THEN a.amount ELSE -a.amount END),0)
      INTO remaining_refund FROM erp_private.t13_allocations a
      JOIN erp_private.t13_payroll_pins prior ON prior.id=a.pin_id WHERE prior.refund_id=f.id;
    IF p_amount>remaining_refund THEN
      RAISE EXCEPTION 'Refund approval exceeds the original correction balance' USING ERRCODE='PT409';
    END IF;
  END IF;
  INSERT INTO erp_private.t13_payroll_pins(case_id,schedule_id,refund_id,kind,source_id,employee_id,company_id,branch_id,
    employer_company_id,employer_branch_id,payroll_month,payroll_run_id,payroll_line_id,gm_approval_id,gm_approver_id,
    approved_amount,headroom,currency,proposal_digest)
  VALUES (c.id,s.id,f.id,p_kind,p_source,c.employee_id,c.company_id,c.branch_id,c.employer_company_id,c.employer_branch_id,
    p_month,p_run,p_line,p_approval,p_gm_actor,p_amount,p_headroom,c.currency,p_digest) RETURNING id INTO identity;
  RETURN identity;
END $$;

COMMENT ON COLUMN erp_private.t13_payroll_pins.payroll_run_id IS
  'The immutable T15-approved payroll run version identifier.';
COMMENT ON COLUMN erp_private.t13_payroll_pins.gm_approval_id IS
  'The T15 GM approval for this exact payroll run version and recovery line.';

-- The T16 payment transaction verifies the actual cash and evidence before
-- calling this. Record even verified excess cash for Accounts reconciliation.
CREATE FUNCTION erp_private.t13_payroll_receipt(
  p_operation uuid,p_pin bigint,p_month date,p_run uuid,p_line uuid,p_approval uuid,p_schedule bigint,
  p_actual numeric,p_currency text,p_bank_reference text,p_evidence uuid,p_final boolean
) RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
  pin erp_private.t13_payroll_pins;
  previous erp_private.t13_receipts;
  identity bigint;
BEGIN
  IF p_operation IS NULL OR p_evidence IS NULL OR p_final IS NULL
     OR NOT coalesce(p_actual>=0 AND p_actual<=99999999999999.99 AND p_actual=round(p_actual,2),false)
     OR (p_actual=0 AND (NOT p_final OR p_bank_reference IS NOT NULL))
     OR (p_actual>0 AND NOT coalesce(length(btrim(p_bank_reference)) BETWEEN 1 AND 150,false)) THEN
    RAISE EXCEPTION 'Record verified cash or an evidenced final zero payment' USING ERRCODE='22023';
  END IF;
  SELECT * INTO pin FROM erp_private.t13_payroll_pins WHERE id=p_pin;
  IF pin.id IS NULL OR ROW(pin.payroll_month,pin.payroll_run_id,pin.payroll_line_id,pin.gm_approval_id,pin.schedule_id,pin.currency)
     IS DISTINCT FROM ROW(p_month,p_run,p_line,p_approval,p_schedule,p_currency) THEN
    RAISE EXCEPTION 'Settlement requires the exact approved schedule and payroll line' USING ERRCODE='PT409';
  END IF;
  PERFORM erp_private.t13_lock_settlement(pin.case_id);
  PERFORM pg_advisory_xact_lock(hashtextextended('t13-payroll-receipt:'||p_operation,0));
  SELECT * INTO previous FROM erp_private.t13_receipts WHERE operation_id=p_operation;
  IF FOUND THEN
    IF ROW(previous.pin_id,previous.actual_amount,previous.bank_reference,previous.evidence_id,previous.final)
       IS DISTINCT FROM ROW(p_pin,p_actual,btrim(p_bank_reference),p_evidence,p_final) THEN
      RAISE EXCEPTION 'Payment operation already used with different input' USING ERRCODE='P0409';
    END IF;
    RETURN previous.id;
  END IF;
  IF EXISTS (SELECT 1 FROM erp_private.t13_receipts WHERE pin_id=p_pin AND final) THEN
    RAISE EXCEPTION 'This approved line has a final receipt' USING ERRCODE='PT409';
  END IF;
  INSERT INTO erp_private.t13_receipts(pin_id,case_id,payroll_month,operation_id,actual_amount,bank_reference,evidence_id,final)
  VALUES (pin.id,pin.case_id,pin.payroll_month,p_operation,p_actual,btrim(p_bank_reference),p_evidence,p_final)
  RETURNING id INTO identity;
  RETURN identity;
END $$;

CREATE FUNCTION erp_private.t13_allocation_actor(p_pin erp_private.t13_payroll_pins)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id();
BEGIN
  IF p_pin.id IS NULL OR actor IS NULL OR actor=p_pin.gm_approver_id
     OR NOT erp_private.t02_has_scope('hr.recovery.accounts',p_pin.company_id,p_pin.branch_id)
     OR (ROW(p_pin.company_id,p_pin.branch_id) IS DISTINCT FROM ROW(p_pin.employer_company_id,p_pin.employer_branch_id)
         AND NOT erp_private.t02_has_scope('hr.recovery.accounts',p_pin.employer_company_id,p_pin.employer_branch_id))
     OR NOT erp_private.t02_has_scope('hr.payroll.view',p_pin.employer_company_id,p_pin.employer_branch_id)
     OR EXISTS (SELECT 1 FROM erp_private.t13_hr_reviews h WHERE h.case_id=p_pin.case_id AND h.reviewed_by=actor)
     OR EXISTS (SELECT 1 FROM erp_private.t13_disputes d WHERE d.case_id=p_pin.case_id AND d.actor_id=actor)
     OR EXISTS (SELECT 1 FROM public.erp_user_employee_links WHERE user_profile_id=actor AND employee_id=p_pin.employee_id) THEN
    RAISE EXCEPTION 'Payment allocation requires independent Accounts authorization in the historical scope' USING ERRCODE='42501';
  END IF;
  RETURN actor;
END $$;

CREATE FUNCTION public.t13_recovery_allocate(
  p_operation uuid,p_receipt bigint,p_pin bigint,p_schedule bigint,p_month date,p_line uuid,p_amount numeric,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  r erp_private.t13_receipts;
  pin erp_private.t13_payroll_pins;
  actor bigint;
  request_digest text;
  result jsonb;
  receipt_net numeric;
  pin_net numeric;
  identity bigint;
BEGIN
  SELECT * INTO r FROM erp_private.t13_receipts WHERE id=p_receipt;
  SELECT * INTO pin FROM erp_private.t13_payroll_pins WHERE id=r.pin_id;
  actor:=erp_private.t13_allocation_actor(pin);
  IF ROW(p_pin,p_schedule,p_month,p_line) IS DISTINCT FROM ROW(pin.id,pin.schedule_id,pin.payroll_month,pin.payroll_line_id)
     OR NOT coalesce(p_amount>0 AND p_amount<=99999999999999.99 AND p_amount=round(p_amount,2),false)
     OR NOT coalesce(length(btrim(p_reason)) BETWEEN 1 AND 500,false) THEN
    RAISE EXCEPTION 'Confirm the exact approved schedule, month, line and amount for this receipt' USING ERRCODE='22023';
  END IF;
  PERFORM erp_private.t13_lock_settlement(pin.case_id);
  request_digest:=erp_private.t02_digest(jsonb_build_array('allocate',p_receipt,p_pin,p_schedule,p_month,p_line,p_amount,p_reason));
  result:=erp_private.t02_replay('t13-settlement',p_operation,request_digest);
  IF result IS NOT NULL THEN RETURN result; END IF;
  SELECT coalesce(sum(signed_amount) FILTER (WHERE receipt_id=p_receipt),0),coalesce(sum(signed_amount),0)
    INTO receipt_net,pin_net
    FROM (SELECT receipt_id,CASE WHEN reverses_allocation_id IS NULL THEN amount ELSE -amount END AS signed_amount
      FROM erp_private.t13_allocations WHERE pin_id=pin.id) a;
  IF p_amount>r.actual_amount-receipt_net OR p_amount>pin.approved_amount-pin_net THEN
    RAISE EXCEPTION 'Allocation exceeds verified cash or the approved line amount' USING ERRCODE='PT409';
  END IF;
  INSERT INTO erp_private.t13_allocations(case_id,pin_id,receipt_id,amount,authorized_by,reason)
  VALUES (pin.case_id,pin.id,r.id,p_amount,actor,btrim(p_reason)) RETURNING id INTO identity;
  RETURN erp_private.t02_save_receipt('t13-settlement',p_operation,request_digest,
    jsonb_build_object('id',identity,'pin_id',pin.id,'receipt_id',r.id,'amount',p_amount,
      'unallocated',r.actual_amount-receipt_net-p_amount));
END $$;

CREATE FUNCTION public.t13_recovery_reverse(p_operation uuid,p_allocation bigint,p_amount numeric,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE
  a erp_private.t13_allocations;
  pin erp_private.t13_payroll_pins;
  actor bigint;
  reversible numeric;
  request_digest text;
  result jsonb;
  identity bigint;
BEGIN
  SELECT * INTO a FROM erp_private.t13_allocations WHERE id=p_allocation;
  SELECT * INTO pin FROM erp_private.t13_payroll_pins WHERE id=a.pin_id;
  actor:=erp_private.t13_allocation_actor(pin);
  IF a.reverses_allocation_id IS NOT NULL
     OR NOT coalesce(p_amount>0 AND p_amount<=99999999999999.99 AND p_amount=round(p_amount,2),false)
     OR NOT coalesce(length(btrim(p_reason)) BETWEEN 1 AND 500,false) THEN
    RAISE EXCEPTION 'Confirm the original allocation, reversal amount and reason' USING ERRCODE='22023';
  END IF;
  PERFORM erp_private.t13_lock_settlement(pin.case_id);
  request_digest:=erp_private.t02_digest(jsonb_build_array('reverse',p_allocation,p_amount,p_reason));
  result:=erp_private.t02_replay('t13-settlement',p_operation,request_digest);
  IF result IS NOT NULL THEN RETURN result; END IF;
  IF pin.kind='deduction' THEN
    reversible:=erp_private.t13_refund_capacity(a.id);
  ELSE
    SELECT a.amount-coalesce(sum(amount),0) INTO reversible
      FROM erp_private.t13_allocations WHERE reverses_allocation_id=a.id;
  END IF;
  IF p_amount>reversible THEN
    RAISE EXCEPTION 'Reversal exceeds the original allocation after prior corrections' USING ERRCODE='PT409';
  END IF;
  INSERT INTO erp_private.t13_allocations(case_id,pin_id,receipt_id,amount,reverses_allocation_id,authorized_by,reason)
  VALUES (pin.case_id,pin.id,a.receipt_id,p_amount,a.id,actor,btrim(p_reason)) RETURNING id INTO identity;
  RETURN erp_private.t02_save_receipt('t13-settlement',p_operation,request_digest,
    jsonb_build_object('id',identity,'pin_id',pin.id,'receipt_id',a.receipt_id,
      'reverses_allocation_id',a.id,'amount',p_amount));
END $$;

REVOKE ALL ON FUNCTION
  erp_private.t13_preserve_settlement(),erp_private.t13_lock_settlement(bigint),erp_private.t13_settlement_balance(bigint),
  erp_private.t13_refund_capacity(bigint),erp_private.t13_allocation_actor(erp_private.t13_payroll_pins),
  erp_private.t13_payroll_pin(bigint,text,bigint,date,uuid,uuid,uuid,bigint,numeric,numeric,text),
  erp_private.t13_payroll_receipt(uuid,bigint,date,uuid,uuid,uuid,bigint,numeric,text,text,uuid,boolean),
  public.t13_recovery_allocate(uuid,bigint,bigint,bigint,date,uuid,numeric,text),
  public.t13_recovery_reverse(uuid,bigint,numeric,text)
FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION
  public.t13_recovery_allocate(uuid,bigint,bigint,bigint,date,uuid,numeric,text),
  public.t13_recovery_reverse(uuid,bigint,numeric,text)
TO authenticated;

COMMIT;
