BEGIN;

CREATE TABLE erp_private.t16_allocation_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_id uuid NOT NULL REFERENCES erp_private.t16_payments(id),
 revision integer NOT NULL CHECK (revision>0),
 document_id bigint REFERENCES public.dms_documents(id),
 version_id bigint REFERENCES public.dms_document_versions(id),
 file_id bigint REFERENCES public.dms_document_files(id),
 checksum text CHECK (checksum~'^[a-f0-9]{64}$'),
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 reason text CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE (payment_id,revision),
 CHECK (num_nonnulls(document_id,version_id,file_id,checksum) IN (0,4))
);

CREATE TABLE erp_private.t16_payment_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 decision_id uuid NOT NULL REFERENCES erp_private.t16_allocation_decisions(id),
 line_id uuid NOT NULL REFERENCES erp_private.t14_lines(id),
 amount numeric(20,2) NOT NULL CHECK (amount>0),
 UNIQUE (decision_id,line_id)
);
CREATE INDEX t16_allocation_exact_line ON erp_private.t16_payment_allocations(line_id);

CREATE TABLE erp_private.t16_recovery_links (
 allocation_id uuid PRIMARY KEY REFERENCES erp_private.t16_payment_allocations(id),
 receipt_id bigint NOT NULL UNIQUE REFERENCES erp_private.t13_receipts(id),
 recovery_allocation_id bigint NOT NULL UNIQUE REFERENCES erp_private.t13_allocations(id)
);
CREATE TABLE erp_private.t16_recovery_closures (
 pin_id bigint PRIMARY KEY REFERENCES erp_private.t13_payroll_pins(id),
 receipt_id bigint NOT NULL UNIQUE REFERENCES erp_private.t13_receipts(id)
);

CREATE TABLE erp_private.t16_recovery_dispositions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 decision_id uuid NOT NULL REFERENCES erp_private.t16_allocation_decisions(id),
 pin_id bigint NOT NULL REFERENCES erp_private.t13_payroll_pins(id),
 line_id uuid NOT NULL REFERENCES erp_private.t14_lines(id),
 actual_amount numeric(20,2) NOT NULL CHECK (actual_amount>=0),
 UNIQUE(decision_id,line_id)
);
CREATE INDEX t16_recovery_dispositions_pin ON erp_private.t16_recovery_dispositions(pin_id);

ALTER TABLE erp_private.t16_recovery_dispositions ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t16_allocation_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t16_payment_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t16_recovery_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t16_recovery_closures ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t16_allocation_decisions,erp_private.t16_payment_allocations,
 erp_private.t16_recovery_links,erp_private.t16_recovery_closures,erp_private.t16_recovery_dispositions
 FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER t16_allocation_decision_immutable BEFORE UPDATE OR DELETE ON erp_private.t16_allocation_decisions
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_history();
CREATE TRIGGER t16_payment_allocation_immutable BEFORE UPDATE OR DELETE ON erp_private.t16_payment_allocations
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_history();
CREATE TRIGGER t16_recovery_link_immutable BEFORE UPDATE OR DELETE ON erp_private.t16_recovery_links
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_history();
CREATE TRIGGER t16_recovery_closure_immutable BEFORE UPDATE OR DELETE ON erp_private.t16_recovery_closures
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_history();
CREATE TRIGGER t16_recovery_disposition_immutable BEFORE UPDATE OR DELETE ON erp_private.t16_recovery_dispositions
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_history();

-- T16 owns the transaction when a canonical T13 recovery entry originated in payroll.
-- The existing recovery API keeps its historical behavior for every other receipt.
ALTER FUNCTION public.t13_recovery_allocate(uuid,bigint,bigint,bigint,date,uuid,numeric,text) SET SCHEMA erp_private;
ALTER FUNCTION public.t13_recovery_reverse(uuid,bigint,numeric,text) SET SCHEMA erp_private;
REVOKE ALL ON FUNCTION erp_private.t13_recovery_allocate(uuid,bigint,bigint,bigint,date,uuid,numeric,text),
 erp_private.t13_recovery_reverse(uuid,bigint,numeric,text) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION public.t13_recovery_allocate(p_operation uuid,p_receipt bigint,p_pin bigint,p_schedule bigint,
 p_month date,p_line uuid,p_amount numeric,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pin erp_private.t13_payroll_pins;
BEGIN
 SELECT p.* INTO pin FROM erp_private.t13_payroll_pins p
 JOIN erp_private.t13_receipts r ON r.pin_id=p.id WHERE r.id=p_receipt;
 PERFORM erp_private.t13_allocation_actor(pin);
 IF EXISTS (SELECT 1 FROM erp_private.t16_recovery_links WHERE receipt_id=p_receipt)
   OR EXISTS (SELECT 1 FROM erp_private.t16_recovery_closures WHERE receipt_id=p_receipt) THEN
   RAISE EXCEPTION 'Reconcile this receipt through its approved payroll payment' USING ERRCODE='42501';
 END IF;
 RETURN erp_private.t13_recovery_allocate(p_operation,p_receipt,p_pin,p_schedule,p_month,p_line,p_amount,p_reason);
END $$;

CREATE FUNCTION public.t13_recovery_reverse(p_operation uuid,p_allocation bigint,p_amount numeric,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pin erp_private.t13_payroll_pins;
BEGIN
 SELECT p.* INTO pin FROM erp_private.t13_payroll_pins p
 JOIN erp_private.t13_allocations a ON a.pin_id=p.id WHERE a.id=p_allocation;
 PERFORM erp_private.t13_allocation_actor(pin);
 IF EXISTS (
   SELECT 1 FROM erp_private.t13_allocations a
   JOIN erp_private.t16_recovery_links l ON l.receipt_id=a.receipt_id WHERE a.id=p_allocation
 ) THEN RAISE EXCEPTION 'Reverse this recovery through its verified payroll payment' USING ERRCODE='42501'; END IF;
 RETURN erp_private.t13_recovery_reverse(p_operation,p_allocation,p_amount,p_reason);
END $$;

-- Reversing a bank movement removes its verified cash as well as the linked
-- allocation. The original receipt, marker and signed T13 movements remain.
CREATE VIEW erp_private.t16_effective_recovery_receipts WITH (security_invoker=true) AS
 SELECT r.* FROM erp_private.t13_receipts r
 WHERE NOT EXISTS(
   SELECT 1 FROM erp_private.t16_recovery_links l
   JOIN erp_private.t16_payment_allocations a ON a.id=l.allocation_id
   JOIN erp_private.t16_allocation_decisions d ON d.id=a.decision_id
   JOIN erp_private.t16_payment_reversals x ON x.payment_id=d.payment_id
   WHERE l.receipt_id=r.id
 );
REVOKE ALL ON erp_private.t16_effective_recovery_receipts FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.t16_active_disposition(p_pin bigint)
RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT f.actual_amount FROM erp_private.t16_recovery_dispositions f
 JOIN erp_private.t16_allocation_decisions d ON d.id=f.decision_id
 WHERE f.pin_id=p_pin AND NOT EXISTS(
   SELECT 1 FROM erp_private.t16_payment_reversals x WHERE x.payment_id=d.payment_id
 ) LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION erp_private.t13_settlement_balance(p_case bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH pin_balances AS (
   SELECT p.*,a.allocated,r.actual,
     CASE WHEN EXISTS(SELECT 1 FROM erp_private.t16_recovery_closures c WHERE c.pin_id=p.id)
          THEN a.allocated=coalesce(erp_private.t16_active_disposition(p.id),p.approved_amount)
            AND a.allocated=r.actual ELSE r.closed END AS closed
   FROM erp_private.t13_payroll_pins p
   CROSS JOIN LATERAL (
     SELECT coalesce(sum(CASE WHEN x.reverses_allocation_id IS NULL THEN x.amount ELSE -x.amount END),0) AS allocated
     FROM erp_private.t13_allocations x WHERE x.pin_id=p.id
   ) a
   CROSS JOIN LATERAL (
     SELECT coalesce(sum(actual_amount),0) AS actual,coalesce(bool_or(final),false) AS closed
     FROM erp_private.t16_effective_recovery_receipts WHERE pin_id=p.id
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

CREATE OR REPLACE FUNCTION erp_private.t15_recovery_closed(p_line uuid)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(
   SELECT 1 FROM erp_private.t15_reserved_lines reserve
   JOIN erp_private.t13_payroll_pins pin ON pin.payroll_line_id=reserve.line_id
     AND pin.gm_approval_id=reserve.review_id AND pin.payroll_run_id=reserve.version_id
     AND pin.case_id=reserve.recovery_case_id AND pin.payroll_month=reserve.month
   WHERE reserve.line_id=p_line
     AND EXISTS(SELECT 1 FROM erp_private.t13_receipts r WHERE r.pin_id=pin.id AND r.final)
     AND (NOT EXISTS(SELECT 1 FROM erp_private.t16_recovery_closures c WHERE c.pin_id=pin.id)
       OR coalesce(erp_private.t16_active_disposition(pin.id),pin.approved_amount)=(
         SELECT coalesce(sum(actual_amount),0) FROM erp_private.t16_effective_recovery_receipts WHERE pin_id=pin.id))
     AND NOT EXISTS(
       SELECT 1 FROM erp_private.t16_effective_recovery_receipts r WHERE r.pin_id=pin.id
       AND r.actual_amount IS DISTINCT FROM (SELECT coalesce(sum(CASE WHEN a.reverses_allocation_id IS NULL
         THEN a.amount ELSE -a.amount END),0) FROM erp_private.t13_allocations a WHERE a.receipt_id=r.id)
     )
 );
$$;

CREATE FUNCTION erp_private.t16_recovery_pin(p_batch erp_private.t16_batches,p_line erp_private.t14_lines)
RETURNS erp_private.t13_payroll_pins LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 recovery_case bigint:=(p_line.source->>'case')::bigint;
 approval erp_private.t15_reviews;
 pin erp_private.t13_payroll_pins;
 pin_identity bigint;
BEGIN
 SELECT * INTO approval FROM erp_private.t15_reviews WHERE id=p_batch.review_id;
 IF NOT EXISTS(
   SELECT 1 FROM erp_private.t15_reserved_lines r
   WHERE r.review_id=approval.id AND r.version_id=p_batch.version_id AND r.line_id=p_line.id
     AND r.recovery_case_id=recovery_case AND r.released_at IS NULL
 ) THEN RAISE EXCEPTION 'The exact GM-approved recovery reserve is unavailable' USING ERRCODE='PT409'; END IF;
 PERFORM 1 FROM erp_private.t13_cases WHERE id=recovery_case FOR UPDATE NOWAIT;
 pin_identity:=erp_private.t13_payroll_pin(recovery_case,p_line.source->>'recovery_kind',
   (p_line.source->>'upstream_id')::bigint,p_batch.month,p_batch.version_id,p_line.id,approval.id,approval.decided_by,
   p_line.amount,p_line.amount,p_line.source->>'fingerprint');
 SELECT * INTO STRICT pin FROM erp_private.t13_payroll_pins WHERE id=pin_identity;
 PERFORM erp_private.t13_allocation_actor(pin);

 IF EXISTS(
   SELECT 1 FROM erp_private.t13_receipts r WHERE r.pin_id=pin.id
   AND NOT EXISTS(SELECT 1 FROM erp_private.t16_recovery_links l WHERE l.receipt_id=r.id)
   AND NOT EXISTS(SELECT 1 FROM erp_private.t16_recovery_closures c WHERE c.receipt_id=r.id)
 ) THEN RAISE EXCEPTION 'Resolve the existing recovery receipts before applying payroll cash' USING ERRCODE='PT409'; END IF;
 RETURN pin;
END $$;

CREATE FUNCTION erp_private.t16_recovery_mark_final(p_pin erp_private.t13_payroll_pins,p_decision uuid)
RETURNS void LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE closure_identity bigint;
BEGIN
 IF EXISTS(SELECT 1 FROM erp_private.t16_recovery_closures WHERE pin_id=p_pin.id) THEN RETURN; END IF;
 closure_identity:=erp_private.t13_payroll_receipt(gen_random_uuid(),p_pin.id,p_pin.payroll_month,p_pin.payroll_run_id,
   p_pin.payroll_line_id,p_pin.gm_approval_id,p_pin.schedule_id,0,p_pin.currency,NULL,p_decision,true);
 INSERT INTO erp_private.t16_recovery_closures(pin_id,receipt_id) VALUES(p_pin.id,closure_identity);
END $$;

CREATE FUNCTION erp_private.t16_recovery_post(
 p_batch erp_private.t16_batches,p_line erp_private.t14_lines,p_allocation uuid,p_decision uuid,p_amount numeric,p_reason text
) RETURNS void LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 pin erp_private.t13_payroll_pins:=erp_private.t16_recovery_pin(p_batch,p_line);
 allocated numeric;
 receipt_identity bigint;
 posted jsonb;
BEGIN
 IF erp_private.t16_active_disposition(pin.id) IS NOT NULL THEN
   RAISE EXCEPTION 'This recovery has a verified final amount for the approved month' USING ERRCODE='PT409';
 END IF;

 -- A corrected, verified movement can refill a line after its original close
 -- and reversal. Ownership, pin, amount and evidence are already locked and exact.
 INSERT INTO erp_private.t13_receipts(pin_id,case_id,payroll_month,operation_id,actual_amount,bank_reference,evidence_id,final)
 VALUES(pin.id,pin.case_id,pin.payroll_month,p_allocation,p_amount,'T16 allocation '||p_allocation,p_decision,false)
 RETURNING id INTO receipt_identity;
 posted:=erp_private.t13_recovery_allocate(gen_random_uuid(),receipt_identity,pin.id,pin.schedule_id,pin.payroll_month,
   pin.payroll_line_id,p_amount,p_reason);
 INSERT INTO erp_private.t16_recovery_links(allocation_id,receipt_id,recovery_allocation_id)
 VALUES(p_allocation,receipt_identity,(posted->>'id')::bigint);

 SELECT coalesce(sum(CASE WHEN reverses_allocation_id IS NULL THEN amount ELSE -amount END),0)
 INTO allocated FROM erp_private.t13_allocations WHERE pin_id=pin.id;
 IF allocated=pin.approved_amount THEN PERFORM erp_private.t16_recovery_mark_final(pin,p_decision); END IF;
END $$;

CREATE FUNCTION erp_private.t16_close_recovery(
 p_batch erp_private.t16_batches,p_line erp_private.t14_lines,p_decision uuid,p_actual numeric
) RETURNS void LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 pin erp_private.t13_payroll_pins:=erp_private.t16_recovery_pin(p_batch,p_line);
 allocated numeric;
BEGIN
 SELECT coalesce(sum(CASE WHEN reverses_allocation_id IS NULL THEN amount ELSE -amount END),0)
 INTO allocated FROM erp_private.t13_allocations WHERE pin_id=pin.id;
 IF erp_private.t16_active_disposition(pin.id) IS NOT NULL OR p_actual>=pin.approved_amount OR p_actual<>allocated THEN
   RAISE EXCEPTION 'Confirm the exact final amount actually allocated for this approved recovery' USING ERRCODE='PT409';
 END IF;
 PERFORM erp_private.t16_recovery_mark_final(pin,p_decision);
 INSERT INTO erp_private.t16_recovery_dispositions(decision_id,pin_id,line_id,actual_amount)
 VALUES(p_decision,pin.id,p_line.id,p_actual);
END $$;

CREATE FUNCTION erp_private.t16_payment_revision(p_payment uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(max(revision),0) FROM erp_private.t16_allocation_decisions WHERE payment_id=p_payment;
$$;

CREATE FUNCTION erp_private.t16_payment_history(p_batch uuid,p_employee bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'amount',e.amount,'currency',p.currency,'outcome',e.outcome,
   'paid_on',e.paid_on,'recorded_at',e.created_at,
   'reference_suffix',CASE WHEN length(p.reference)>=8 THEN right(p.reference,4) END,
   'allocation_revision',erp_private.t16_payment_revision(p.id),'reversed',x.id IS NOT NULL,
   'can_allocate',x.id IS NULL AND e.outcome IN ('paid','partial'),
   'can_reverse',x.id IS NULL AND e.outcome IN ('paid','partial')) ORDER BY e.order_id DESC),'[]'::jsonb)
 FROM erp_private.t16_payments p
 JOIN erp_private.t16_current_payment_events e ON e.payment_id=p.id
 LEFT JOIN erp_private.t16_payment_reversals x ON x.payment_id=p.id
 WHERE p.batch_id=p_batch AND p.employee_id=p_employee;
$$;

CREATE FUNCTION erp_private.t16_result_status(p_batch uuid,p_employee bigint)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH payments AS (
   SELECT p.id,e.amount,e.outcome,x.id AS reversal
   FROM erp_private.t16_payments p JOIN erp_private.t16_current_payment_events e ON e.payment_id=p.id
   LEFT JOIN erp_private.t16_payment_reversals x ON x.payment_id=p.id
   WHERE p.batch_id=p_batch AND p.employee_id=p_employee
 ), cash AS (
   SELECT coalesce(sum(amount) FILTER(WHERE reversal IS NULL),0) AS verified,
     coalesce(bool_or(outcome='paid' AND reversal IS NULL),false) AS completed,
     coalesce(bool_or(outcome='pending'),false) AS pending,
     coalesce(bool_or(outcome='rejected'),false) AS rejected,
     coalesce(bool_or(reversal IS NOT NULL),false) AS reversed
   FROM payments
 ), applied AS (
   SELECT coalesce(sum(a.amount) FILTER(WHERE l.kind='earning'),0) AS wages,
          coalesce(sum(a.amount) FILTER(WHERE l.kind='deduction'),0) AS deductions
   FROM payments p JOIN erp_private.t16_allocation_decisions d ON d.payment_id=p.id
   JOIN erp_private.t16_payment_allocations a ON a.decision_id=d.id
   JOIN erp_private.t14_lines l ON l.id=a.line_id WHERE p.reversal IS NULL
 )
 SELECT jsonb_build_object('status',CASE
   WHEN NOT c.pending AND (c.completed OR c.verified>0) AND c.verified=r.net AND a.wages=r.gross AND a.deductions=r.deductions THEN 'reconciled'
   WHEN c.pending AND (c.completed OR c.verified>0) AND c.verified=r.net THEN 'pending'
   WHEN (c.completed OR c.verified>0) AND c.verified=r.net THEN 'paid-unallocated'
   WHEN c.verified>0 THEN 'partial' WHEN c.pending THEN 'pending'
   WHEN c.reversed THEN 'reversed' WHEN c.rejected THEN 'rejected' ELSE 'unpaid' END,
   'verified_cash',c.verified,'applied_wages',a.wages,'applied_deductions',a.deductions,
   'unallocated',c.verified-a.wages+a.deductions,'payable',r.net,'remaining',r.net-c.verified,'currency',r.currency)
 FROM erp_private.t16_batch_results b JOIN erp_private.t14_results r ON r.version_id=b.version_id AND r.employee_id=b.employee_id
 CROSS JOIN cash c CROSS JOIN applied a WHERE b.batch_id=p_batch AND b.employee_id=p_employee;
$$;

CREATE FUNCTION erp_private.t16_allocate(
 p_batch erp_private.t16_batches,p_payment erp_private.t16_payments,p_event erp_private.t16_payment_events,
 p_actor bigint,p_data jsonb,p_checksum text
) RETURNS uuid LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 expected integer:=(p_data->>'revision')::integer;
 decision uuid;
 allocation_identity uuid;
 current_revision integer;
 item record;
 line erp_private.t14_lines;
 known_count integer;
 new_wages numeric;
 new_deductions numeric;
 old_net numeric;
 note text:=btrim(p_data->>'reason');
 dispositions jsonb:=coalesce(p_data->'close_recoveries','[]'::jsonb);
BEGIN
 IF NOT erp_private.t05_fields(p_data,ARRAY['batch','payment','revision','lines','close_recoveries','document','version','file','reason'])
   OR expected IS NULL OR expected<0 OR jsonb_typeof(p_data->'lines') IS DISTINCT FROM 'array'
   OR jsonb_typeof(dispositions) IS DISTINCT FROM 'array'
   OR (note IS NOT NULL AND length(note) NOT BETWEEN 1 AND 500)
 THEN RAISE EXCEPTION 'Provide the exact approved lines and current allocation revision' USING ERRCODE='22023'; END IF;
 IF jsonb_array_length(p_data->'lines')+jsonb_array_length(dispositions) NOT BETWEEN 1 AND 128 OR EXISTS(
   SELECT 1 FROM jsonb_array_elements((p_data->'lines')||dispositions) line_input
   WHERE NOT erp_private.t05_fields(line_input,ARRAY['line','amount'])
     OR NOT coalesce(line_input->>'line'~'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$',false)
     OR NOT coalesce(line_input->>'amount'~'^[0-9]{1,18}(\.[0-9]{1,2})?$',false)
 ) THEN RAISE EXCEPTION 'Enter one exact decimal amount for each allocation or final recovery' USING ERRCODE='22023'; END IF;
 current_revision:=erp_private.t16_payment_revision(p_payment.id);
 IF expected<>current_revision OR p_event.outcome NOT IN('paid','partial')
   OR EXISTS(SELECT 1 FROM erp_private.t16_payment_reversals WHERE payment_id=p_payment.id)
 THEN RAISE EXCEPTION 'Reload the active verified payment and allocation revision' USING ERRCODE='PT409'; END IF;

 SELECT count(DISTINCT l.id),
   coalesce(sum(x.amount) FILTER(WHERE l.kind='earning'),0),
   coalesce(sum(x.amount) FILTER(WHERE l.kind='deduction'),0)
 INTO known_count,new_wages,new_deductions
 FROM jsonb_to_recordset(p_data->'lines') AS x(line uuid,amount numeric)
 JOIN erp_private.t14_lines l ON l.id=x.line AND l.version_id=p_batch.version_id AND l.employee_id=p_payment.employee_id
 WHERE x.amount>0;
 IF known_count<>jsonb_array_length(p_data->'lines') THEN
   RAISE EXCEPTION 'Choose distinct positive lines from this exact approved employee result' USING ERRCODE='PT409';
 END IF;

 SELECT coalesce(sum(CASE WHEN l.kind='earning' THEN a.amount ELSE -a.amount END),0) INTO old_net
 FROM erp_private.t16_allocation_decisions d
 JOIN erp_private.t16_payment_allocations a ON a.decision_id=d.id
 JOIN erp_private.t14_lines l ON l.id=a.line_id WHERE d.payment_id=p_payment.id;
 IF old_net+new_wages-new_deductions NOT BETWEEN 0 AND p_event.amount THEN
   RAISE EXCEPTION 'Applied earnings less verified deductions must fit the actual payment' USING ERRCODE='PT409';
 END IF;
 IF (new_deductions>0 OR jsonb_array_length(dispositions)>0 OR EXISTS(
   SELECT 1 FROM jsonb_to_recordset(p_data->'lines') AS x(line uuid,amount numeric)
   JOIN erp_private.t14_lines l ON l.id=x.line WHERE l.category='recovery-refund'
 )) AND (p_checksum IS NULL OR p_checksum=p_event.checksum OR note IS NULL) THEN
   RAISE EXCEPTION 'Confirm deductions, recovery refunds and final recovery amounts with separate verified evidence and a reason' USING ERRCODE='PT409';
 END IF;

 INSERT INTO erp_private.t16_allocation_decisions(payment_id,revision,document_id,version_id,file_id,checksum,actor_id,reason)
 VALUES(p_payment.id,current_revision+1,(p_data->>'document')::bigint,(p_data->>'version')::bigint,
   (p_data->>'file')::bigint,p_checksum,p_actor,note) RETURNING id INTO decision;
 FOR item IN
   SELECT l.id,x.amount FROM jsonb_to_recordset(p_data->'lines') AS x(line uuid,amount numeric)
   JOIN erp_private.t14_lines l ON l.id=x.line ORDER BY (l.source->>'case')::bigint NULLS LAST,l.id
 LOOP
   SELECT * INTO STRICT line FROM erp_private.t14_lines WHERE id=item.id;
   IF item.amount>line.amount-(
     SELECT coalesce(sum(a.amount),0) FROM erp_private.t16_payment_allocations a
     JOIN erp_private.t16_allocation_decisions d ON d.id=a.decision_id
     WHERE a.line_id=line.id AND NOT EXISTS(
       SELECT 1 FROM erp_private.t16_payment_reversals x WHERE x.payment_id=d.payment_id
     )
   ) THEN RAISE EXCEPTION 'Allocation exceeds the exact outstanding approved line' USING ERRCODE='PT409'; END IF;
   IF (line.kind='deduction' OR line.category='recovery-refund') AND EXISTS(
     SELECT 1 FROM erp_private.t16_payment_allocations a
     JOIN erp_private.t16_allocation_decisions d ON d.id=a.decision_id
     WHERE a.line_id=line.id AND d.checksum=p_checksum AND NOT EXISTS(
       SELECT 1 FROM erp_private.t16_payment_reversals x WHERE x.payment_id=d.payment_id
     )
   ) THEN RAISE EXCEPTION 'This evidence already supports an active allocation for the exact line' USING ERRCODE='PT409'; END IF;
   INSERT INTO erp_private.t16_payment_allocations(decision_id,line_id,amount)
   VALUES(decision,line.id,item.amount) RETURNING id INTO allocation_identity;
   IF line.category IN ('recovery','recovery-refund') THEN
     PERFORM erp_private.t16_recovery_post(p_batch,line,allocation_identity,decision,item.amount,note);
   END IF;
 END LOOP;
 SELECT count(DISTINCT l.id) INTO known_count FROM jsonb_to_recordset(dispositions) AS x(line uuid,amount numeric)
 JOIN erp_private.t14_lines l ON l.id=x.line AND l.version_id=p_batch.version_id
   AND l.employee_id=p_payment.employee_id AND l.category='recovery' AND x.amount<l.amount;
 IF known_count<>jsonb_array_length(dispositions) THEN
   RAISE EXCEPTION 'Choose distinct exact recovery lines and attest amounts below the approval' USING ERRCODE='PT409';
 END IF;
 FOR item IN
   SELECT l.id,x.amount FROM jsonb_to_recordset(dispositions) AS x(line uuid,amount numeric)
   JOIN erp_private.t14_lines l ON l.id=x.line ORDER BY (l.source->>'case')::bigint,l.id
 LOOP
   SELECT * INTO STRICT line FROM erp_private.t14_lines WHERE id=item.id;
   PERFORM erp_private.t16_close_recovery(p_batch,line,decision,item.amount);
 END LOOP;
 RETURN decision;
END $$;

CREATE FUNCTION erp_private.t16_reverse_payment(
 p_payment erp_private.t16_payments,p_event erp_private.t16_payment_events,p_actor bigint,p_data jsonb,p_checksum text
) RETURNS uuid LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 current_revision integer:=erp_private.t16_payment_revision(p_payment.id);
 expected integer:=(p_data->>'revision')::integer;
 note text:=btrim(p_data->>'reason');
 item record;
 restored uuid;
BEGIN
 IF NOT erp_private.t05_fields(p_data,ARRAY['batch','payment','revision','reason','document','version','file'])
   OR NOT coalesce(length(note) BETWEEN 1 AND 500,false) OR expected IS NULL
 THEN RAISE EXCEPTION 'Provide the exact payment revision and reversal reason' USING ERRCODE='22023'; END IF;
 IF p_event.outcome NOT IN ('partial','paid') OR current_revision<>expected OR p_checksum=p_event.checksum
   OR EXISTS(SELECT 1 FROM erp_private.t16_payment_reversals WHERE payment_id=p_payment.id)
 THEN RAISE EXCEPTION 'Use the current unreversed payment and independent reversal evidence' USING ERRCODE='PT409'; END IF;

 FOR item IN
   SELECT x.case_id,x.id,x.amount FROM erp_private.t16_allocation_decisions d
   JOIN erp_private.t16_payment_allocations a ON a.decision_id=d.id
   JOIN erp_private.t16_recovery_links r ON r.allocation_id=a.id
   JOIN erp_private.t13_allocations x ON x.id=r.recovery_allocation_id
   WHERE d.payment_id=p_payment.id ORDER BY x.case_id,x.id
 LOOP
   PERFORM 1 FROM erp_private.t13_cases WHERE id=item.case_id FOR UPDATE NOWAIT;
   PERFORM erp_private.t13_recovery_reverse(gen_random_uuid(),item.id,item.amount,note);
 END LOOP;
 INSERT INTO erp_private.t16_payment_reversals(payment_id,event_id,document_id,version_id,file_id,checksum,actor_id,reason)
 VALUES(p_payment.id,p_event.id,(p_data->>'document')::bigint,(p_data->>'version')::bigint,(p_data->>'file')::bigint,
   p_checksum,p_actor,note) RETURNING id INTO restored;
 RETURN restored;
END $$;

CREATE FUNCTION erp_private.t16_refresh_payment_state(p_batch erp_private.t16_batches,p_change uuid,p_reverse boolean)
RETURNS void LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 old_state text:=erp_private.t15_bank_state(p_batch.review_id);
 target text;
 any_verified boolean;
 all_reconciled boolean;
BEGIN
 IF p_reverse THEN target:='reversed';
 ELSE
   SELECT coalesce(bool_or((x.status->>'verified_cash')::numeric>0 OR x.status->>'status' IN ('paid-unallocated','reconciled')),false),
     coalesce(bool_and(x.status->>'status'='reconciled'),false)
   INTO any_verified,all_reconciled
   FROM erp_private.t16_batch_results b
   CROSS JOIN LATERAL (SELECT erp_private.t16_result_status(b.batch_id,b.employee_id) AS status) x
   WHERE b.batch_id=p_batch.id;
   target:=CASE WHEN all_reconciled THEN 'settled' WHEN any_verified THEN 'partially-settled' END;
 END IF;
 IF target IS NOT NULL AND target IS DISTINCT FROM old_state THEN
   PERFORM erp_private.t15_record_bank_event(p_change,p_batch.review_id,p_batch.version_id,p_batch.digest,target,p_change,
     CASE target WHEN 'reversed' THEN 'Verified linked employee payment reversal'
       WHEN 'settled' THEN 'All exact approved employee results reconciled'
       ELSE 'Verified employee payments require further reconciliation' END);
 END IF;
END $$;

CREATE FUNCTION public.t16_payroll_payment_command(p_operation uuid,p_company bigint,p_branch bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE
 actor bigint;
 batch erp_private.t16_batches;
 approval erp_private.t15_reviews;
 payment erp_private.t16_payments;
 payment_event erp_private.t16_payment_events;
 receipt_employee bigint;
 request_hash text;
 receipt jsonb;
 evidence_checksum text;
 monetary_change uuid;
 payment_change jsonb;
 result_state text;
BEGIN
 IF p_operation IS NULL OR NOT coalesce(p_action IN ('receipt','allocate','reverse'),false)
   OR jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR octet_length(p_data::text)>32768 OR p_data->>'batch' IS NULL
 THEN RAISE EXCEPTION 'An operation and exact payroll payment action are required' USING ERRCODE='22023'; END IF;
 actor:=erp_private.t16_actor(p_company,p_branch,'reconcile');
 batch:=erp_private.t16_lock_batch((p_data->>'batch')::uuid,p_company,p_branch);
 PERFORM erp_private.t16_touch_batch(batch.id);
 SELECT * INTO approval FROM erp_private.t15_reviews WHERE id=batch.review_id;
 IF actor=approval.decided_by OR approval.state IS DISTINCT FROM 'approved'
   OR approval.version_id IS DISTINCT FROM batch.version_id OR approval.digest IS DISTINCT FROM batch.digest THEN
   RAISE EXCEPTION 'Independent Accounts authority is required for this exact approval' USING ERRCODE='42501';
 END IF;

 IF p_action='receipt' THEN
   receipt_employee:=(p_data->>'employee')::bigint;
 ELSE
   SELECT * INTO payment FROM erp_private.t16_payments WHERE id=(p_data->>'payment')::uuid AND batch_id=batch.id
     AND company_id=batch.company_id AND version_id=batch.version_id;
   receipt_employee:=payment.employee_id;
 END IF;
 IF receipt_employee IS NULL OR erp_private.t12_is_subject(actor,receipt_employee)
   OR NOT EXISTS(
     SELECT 1 FROM erp_private.t16_batch_results r WHERE r.batch_id=batch.id AND r.version_id=batch.version_id
       AND r.employee_id=receipt_employee
   ) THEN RAISE EXCEPTION 'The exact approved employee payment is unavailable to this actor' USING ERRCODE='42501'; END IF;

 IF p_action<>'allocate' OR p_data ?| ARRAY['document','version','file'] THEN
   evidence_checksum:=erp_private.t16_evidence(p_company,p_branch,(p_data->>'document')::bigint,
      (p_data->>'version')::bigint,(p_data->>'file')::bigint);
   IF evidence_checksum IS NULL THEN
     RAISE EXCEPTION 'Verified payroll evidence is required' USING ERRCODE='42501';
   END IF;
 END IF;
 request_hash:=erp_private.t02_digest(jsonb_build_array(p_company,p_branch,p_action,p_data,evidence_checksum));
 PERFORM erp_private.t16_actor(p_company,p_branch,'reconcile');
 receipt:=erp_private.t02_replay('t16-payment',p_operation,request_hash);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;
 IF NOT erp_private.t16_channel_ready(batch.id,receipt_employee) THEN
   RAISE EXCEPTION 'Retain verified acceptance for the employee’s exact payment channel' USING ERRCODE='PT409';
 END IF;

 IF p_action='receipt' THEN
   payment_change:=erp_private.t16_payment_event(batch,actor,p_data,evidence_checksum);
   SELECT * INTO STRICT payment_event FROM erp_private.t16_payment_events WHERE id=(payment_change->>'event')::uuid;
   SELECT * INTO STRICT payment FROM erp_private.t16_payments WHERE id=payment_event.payment_id;
   IF (payment_change->>'created')::boolean THEN
     monetary_change:=payment_event.id;
   END IF;
 ELSE
   SELECT * INTO STRICT payment_event FROM erp_private.t16_current_payment_events WHERE payment_id=payment.id;
   IF p_action='allocate' THEN monetary_change:=erp_private.t16_allocate(batch,payment,payment_event,actor,p_data,evidence_checksum);
   ELSE monetary_change:=erp_private.t16_reverse_payment(payment,payment_event,actor,p_data,evidence_checksum); END IF;
 END IF;
 IF monetary_change IS NOT NULL THEN PERFORM erp_private.t16_refresh_payment_state(batch,monetary_change,p_action='reverse'); END IF;
 PERFORM erp_private.t16_actor(p_company,p_branch,'reconcile');
 IF evidence_checksum IS NOT NULL THEN
   PERFORM erp_private.t16_evidence(p_company,p_branch,(p_data->>'document')::bigint,
      (p_data->>'version')::bigint,(p_data->>'file')::bigint);
 END IF;
 result_state:=CASE WHEN EXISTS(SELECT 1 FROM erp_private.t16_payment_reversals WHERE payment_id=payment.id)
   THEN 'reversed' ELSE payment_event.outcome END;
 RETURN erp_private.t02_save_receipt('t16-payment',p_operation,request_hash,jsonb_build_object(
   'batch',batch.id,'payment',payment.id,'state',result_state,'revision',erp_private.t16_payment_revision(payment.id)));
EXCEPTION WHEN lock_not_available THEN
 RAISE EXCEPTION 'A linked payroll or recovery record changed concurrently. Retry the same operation.' USING ERRCODE='40001';
END $$;

REVOKE ALL ON FUNCTION
 erp_private.t16_active_disposition(bigint),erp_private.t16_recovery_pin(erp_private.t16_batches,erp_private.t14_lines),
 erp_private.t16_recovery_mark_final(erp_private.t13_payroll_pins,uuid),
 erp_private.t16_close_recovery(erp_private.t16_batches,erp_private.t14_lines,uuid,numeric),
 erp_private.t16_recovery_post(erp_private.t16_batches,erp_private.t14_lines,uuid,uuid,numeric,text),
 erp_private.t16_payment_revision(uuid),erp_private.t16_payment_history(uuid,bigint),erp_private.t16_result_status(uuid,bigint),
 erp_private.t16_allocate(erp_private.t16_batches,erp_private.t16_payments,erp_private.t16_payment_events,bigint,jsonb,text),
 erp_private.t16_reverse_payment(erp_private.t16_payments,erp_private.t16_payment_events,bigint,jsonb,text),
 erp_private.t16_refresh_payment_state(erp_private.t16_batches,uuid,boolean),
 public.t16_payroll_payment_command(uuid,bigint,bigint,text,jsonb),
 public.t13_recovery_allocate(uuid,bigint,bigint,bigint,date,uuid,numeric,text),
 public.t13_recovery_reverse(uuid,bigint,numeric,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t16_payroll_payment_command(uuid,bigint,bigint,text,jsonb),
 public.t13_recovery_allocate(uuid,bigint,bigint,bigint,date,uuid,numeric,text),
 public.t13_recovery_reverse(uuid,bigint,numeric,text) TO authenticated;

COMMIT;
