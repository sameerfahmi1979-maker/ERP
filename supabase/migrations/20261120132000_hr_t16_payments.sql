BEGIN;

CREATE TABLE erp_private.t16_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 batch_id uuid NOT NULL,
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 version_id uuid NOT NULL,
 employee_id bigint NOT NULL,
 channel text NOT NULL CHECK (channel IN ('wps','cheque','zero')),
 reference text NOT NULL CHECK (length(reference) BETWEEN 1 AND 120),
 currency text NOT NULL REFERENCES public.currencies(currency_code),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY (batch_id,version_id) REFERENCES erp_private.t16_batches(id,version_id),
 FOREIGN KEY (batch_id,company_id) REFERENCES erp_private.t16_batches(id,company_id),
 FOREIGN KEY (batch_id,employee_id) REFERENCES erp_private.t16_batch_results(batch_id,employee_id),
 UNIQUE (id,company_id,employee_id)
);

CREATE UNIQUE INDEX t16_payment_bank_identity
 ON erp_private.t16_payments(company_id,channel,lower(reference),employee_id);
CREATE INDEX t16_payments_employee ON erp_private.t16_payments(batch_id,employee_id,id);

CREATE TABLE erp_private.t16_payment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 payment_id uuid NOT NULL,
 company_id bigint NOT NULL,
 employee_id bigint NOT NULL,
 outcome text NOT NULL CHECK (outcome IN ('paid','partial','rejected','pending')),
 amount numeric(20,2) NOT NULL CHECK (amount>=0),
 paid_on date NOT NULL CHECK (isfinite(paid_on)),
 document_id bigint NOT NULL REFERENCES public.dms_documents(id),
 version_id bigint NOT NULL REFERENCES public.dms_document_versions(id),
 file_id bigint NOT NULL REFERENCES public.dms_document_files(id),
 checksum text NOT NULL CHECK (checksum~'^[a-f0-9]{64}$'),
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY (payment_id,company_id,employee_id) REFERENCES erp_private.t16_payments(id,company_id,employee_id),
 UNIQUE (id,payment_id),
 CHECK (outcome NOT IN ('pending','rejected') OR amount=0)
);

CREATE UNIQUE INDEX t16_payment_single_pending
 ON erp_private.t16_payment_events(payment_id) WHERE outcome='pending';
CREATE UNIQUE INDEX t16_payment_single_conclusion
 ON erp_private.t16_payment_events(payment_id) WHERE outcome<>'pending';
-- A shared slip may prove different employees, but cannot represent two
-- positive or zero-final disbursements for the same employee and payer.
CREATE UNIQUE INDEX t16_payment_verified_proof
 ON erp_private.t16_payment_events(company_id,employee_id,checksum) WHERE outcome IN ('partial','paid');
CREATE INDEX t16_payment_events_latest ON erp_private.t16_payment_events(payment_id,order_id DESC);

CREATE TABLE erp_private.t16_payment_reversals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_id uuid NOT NULL UNIQUE REFERENCES erp_private.t16_payments(id),
 event_id uuid NOT NULL UNIQUE,
 document_id bigint NOT NULL REFERENCES public.dms_documents(id),
 version_id bigint NOT NULL REFERENCES public.dms_document_versions(id),
 file_id bigint NOT NULL REFERENCES public.dms_document_files(id),
 checksum text NOT NULL CHECK (checksum~'^[a-f0-9]{64}$'),
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY (event_id,payment_id) REFERENCES erp_private.t16_payment_events(id,payment_id)
);

ALTER TABLE erp_private.t16_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t16_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t16_payment_reversals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t16_payments,erp_private.t16_payment_events,
 erp_private.t16_payment_reversals FROM PUBLIC,anon,authenticated,service_role;

CREATE TRIGGER t16_payment_original_immutable BEFORE UPDATE OR DELETE ON erp_private.t16_payments
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_history();
CREATE TRIGGER t16_payment_event_immutable BEFORE UPDATE OR DELETE ON erp_private.t16_payment_events
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_history();
CREATE TRIGGER t16_payment_reversal_immutable BEFORE UPDATE OR DELETE ON erp_private.t16_payment_reversals
 FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_history();

CREATE VIEW erp_private.t16_current_payment_events WITH (security_invoker=true) AS
 SELECT DISTINCT ON (e.payment_id) e.*
 FROM erp_private.t16_payment_events e ORDER BY e.payment_id,e.order_id DESC;
REVOKE ALL ON erp_private.t16_current_payment_events FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.t16_payment_event(
 p_batch erp_private.t16_batches,p_actor bigint,p_data jsonb,p_checksum text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 channel_name text:=p_data->>'channel';
 employee bigint:=(p_data->>'employee')::bigint;
 document bigint:=(p_data->>'document')::bigint;
 document_version bigint:=(p_data->>'version')::bigint;
 document_file bigint:=(p_data->>'file')::bigint;
 payment_reference text:=btrim(p_data->>'reference');
 receipt_outcome text:=p_data->>'outcome';
 payment_currency text:=p_data->>'currency';
 received numeric;
 prior_cash numeric;
 paid_seen boolean;
 payment_day date;

 member erp_private.t16_batch_results;
 approved erp_private.t14_results;
 original erp_private.t16_payments;
 previous erp_private.t16_payment_events;
 result uuid;
BEGIN
 IF NOT erp_private.t05_fields(p_data,ARRAY[
    'batch','employee','channel','reference','amount','currency','paid_on','outcome','document','version','file'])
   OR NOT coalesce(length(payment_reference) BETWEEN 1 AND 120 AND payment_reference!~'[[:cntrl:]]',false)
   OR NOT coalesce(receipt_outcome IN('pending','rejected','partial','paid'),false)
   OR NOT coalesce(payment_currency~'^[A-Z]{3}$',false)
   OR NOT coalesce((p_data->>'amount')~'^[0-9]{1,18}(\.[0-9]{1,2})?$',false)
   OR NOT coalesce((p_data->>'paid_on')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$',false) THEN
   RAISE EXCEPTION 'Provide the exact employee payment, outcome, reference, date and amount' USING ERRCODE='22023';
 END IF;
 received:=(p_data->>'amount')::numeric;
 payment_day:=(p_data->>'paid_on')::date;
 SELECT * INTO member FROM erp_private.t16_batch_results WHERE batch_id=p_batch.id AND employee_id=employee;
 SELECT * INTO approved FROM erp_private.t14_results WHERE version_id=p_batch.version_id AND employee_id=employee;
 IF member.employee_id IS NULL OR member.version_id IS DISTINCT FROM p_batch.version_id
   OR approved.state IS DISTINCT FROM 'ready' OR approved.currency IS DISTINCT FROM payment_currency
   OR member.channel IS DISTINCT FROM channel_name OR erp_private.t12_is_subject(p_actor,employee) THEN
   RAISE EXCEPTION 'The independent Accounts actor must use this employee’s approved payment channel and currency' USING ERRCODE='42501';
 END IF;
 IF payment_day<p_batch.month OR payment_day>(clock_timestamp() AT TIME ZONE 'Asia/Dubai')::date THEN
   RAISE EXCEPTION 'Use the verified payment date for this payroll period' USING ERRCODE='22023';
 END IF;
 IF (receipt_outcome IN ('rejected','pending') AND received<>0)
    OR (channel_name='zero' AND received<>0) OR (channel_name<>'zero' AND receipt_outcome IN ('paid','partial') AND received=0)
    OR (channel_name='zero' AND receipt_outcome='partial') THEN
   RAISE EXCEPTION 'The payment amount does not match its outcome' USING ERRCODE='22023';
 END IF;
 SELECT * INTO original FROM erp_private.t16_payments
 WHERE company_id=p_batch.company_id AND channel=channel_name AND lower(reference)=lower(payment_reference)
       AND employee_id=employee;
 IF original.id IS NOT NULL THEN
   IF original.batch_id<>p_batch.id THEN
     RAISE EXCEPTION 'This payment reference already belongs to an approved result' USING ERRCODE='PT409';
   END IF;
   SELECT * INTO STRICT previous FROM erp_private.t16_current_payment_events WHERE payment_id=original.id;
   IF ROW(previous.outcome,previous.amount,previous.paid_on,previous.checksum)
      IS NOT DISTINCT FROM ROW(receipt_outcome,received,payment_day,p_checksum) THEN
     RETURN jsonb_build_object('event',previous.id,'created',false);
   END IF;
   IF previous.outcome<>'pending' OR receipt_outcome='pending' THEN
     RAISE EXCEPTION 'Retain the original payment outcome and use a new reference for additional cash' USING ERRCODE='PT409';
   END IF;
 END IF;
 IF receipt_outcome IN ('partial','paid') AND EXISTS (
   SELECT 1 FROM erp_private.t16_payment_events e WHERE e.company_id=p_batch.company_id AND e.employee_id=employee
     AND e.checksum=p_checksum AND e.outcome IN ('partial','paid')
 ) THEN RAISE EXCEPTION 'This bank evidence already proves a retained movement for this employee' USING ERRCODE='PT409'; END IF;
 SELECT coalesce(sum(e.amount),0),coalesce(bool_or(e.outcome='paid'),false) INTO prior_cash,paid_seen
 FROM erp_private.t16_payments p JOIN erp_private.t16_current_payment_events e ON e.payment_id=p.id
 WHERE p.batch_id=p_batch.id AND p.employee_id=employee
 AND NOT EXISTS (SELECT 1 FROM erp_private.t16_payment_reversals x WHERE x.payment_id=p.id);
 IF (receipt_outcome='paid' AND prior_cash+received<>approved.net)
   OR (receipt_outcome='partial' AND prior_cash+received>=approved.net)
   OR (receipt_outcome='pending' AND paid_seen AND prior_cash=approved.net)
   OR (channel_name='zero' AND receipt_outcome='paid' AND paid_seen) THEN
   RAISE EXCEPTION 'Verified employee cash exceeds the approved remainder or does not complete the stated outcome' USING ERRCODE='PT409';
 END IF;
 IF original.id IS NULL THEN
   INSERT INTO erp_private.t16_payments(batch_id,company_id,version_id,employee_id,channel,reference,currency)
   VALUES(p_batch.id,p_batch.company_id,p_batch.version_id,employee,channel_name,payment_reference,payment_currency)
   RETURNING * INTO original;
 END IF;
 INSERT INTO erp_private.t16_payment_events(payment_id,company_id,employee_id,outcome,amount,paid_on,document_id,version_id,file_id,checksum,actor_id)
 VALUES(original.id,p_batch.company_id,employee,receipt_outcome,received,payment_day,document,document_version,document_file,p_checksum,p_actor)
 RETURNING id INTO result;
 RETURN jsonb_build_object('event',result,'created',true);
END $$;

REVOKE ALL ON FUNCTION erp_private.t16_payment_event(erp_private.t16_batches,bigint,jsonb,text)
 FROM PUBLIC,anon,authenticated,service_role;

COMMIT;
