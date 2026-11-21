BEGIN;

-- Exit and monthly payroll share ownership of disbursement identities. The
-- original namespace for each bank/cheque channel and payer is retained.
CREATE TABLE erp_private.t18_cash_identities (
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 identity_kind text NOT NULL CHECK (identity_kind IN ('bank-reference','cheque-reference','zero-reference','cash-proof')),
 identity_key text NOT NULL,
 origin text NOT NULL CHECK (origin IN ('monthly','exit')),
 origin_id uuid NOT NULL,
 PRIMARY KEY (company_id,employee_id,identity_kind,identity_key)
);

CREATE FUNCTION erp_private.t18_reference_kind(p_channel text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE p_channel
   WHEN 'wps' THEN 'bank-reference'
   WHEN 'exit-bank-transfer' THEN 'bank-reference'
   WHEN 'cheque' THEN 'cheque-reference'
   WHEN 'exit-cheque' THEN 'cheque-reference'
   WHEN 'zero' THEN 'zero-reference'
 END;
$$;

LOCK TABLE erp_private.t16_payments,erp_private.t16_payment_events IN SHARE ROW EXCLUSIVE MODE;

INSERT INTO erp_private.t18_cash_identities(company_id,employee_id,identity_kind,identity_key,origin,origin_id)
SELECT company_id,employee_id,erp_private.t18_reference_kind(channel),lower(reference),'monthly',id
FROM erp_private.t16_payments
UNION ALL
SELECT company_id,employee_id,'cash-proof',checksum,'monthly',id
FROM erp_private.t16_payment_events WHERE outcome IN ('paid','partial');

CREATE TABLE erp_private.t18_exit_payment_fences (
 version_id uuid PRIMARY KEY REFERENCES erp_private.t18_versions(id),
 epoch bigint NOT NULL DEFAULT 0
);

CREATE TABLE erp_private.t18_exit_intents (
 version_id uuid PRIMARY KEY REFERENCES erp_private.t18_versions(id),
 approval_id uuid NOT NULL REFERENCES erp_private.t18_approvals(id),
 channel text NOT NULL CHECK (channel IN ('exit-bank-transfer','exit-cheque')),
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE erp_private.t18_exit_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 version_id uuid NOT NULL REFERENCES erp_private.t18_exit_intents(version_id),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 channel text NOT NULL CHECK (channel IN ('exit-bank-transfer','exit-cheque')),
 reference text NOT NULL CHECK (length(reference) BETWEEN 1 AND 120),
 currency text NOT NULL REFERENCES public.currencies(currency_code),
 UNIQUE (id,company_id,employee_id)
);
CREATE UNIQUE INDEX t18_exit_payment_reference
 ON erp_private.t18_exit_payments(version_id,lower(reference));

CREATE TABLE erp_private.t18_exit_payment_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 order_id bigint GENERATED ALWAYS AS IDENTITY UNIQUE,
 payment_id uuid NOT NULL,
 company_id bigint NOT NULL,
 employee_id bigint NOT NULL,
 outcome text NOT NULL CHECK (outcome IN ('pending','rejected','partial','paid')),
 amount numeric(20,2) NOT NULL CHECK (amount>=0),
 paid_on date NOT NULL CHECK (isfinite(paid_on)),
 document_id bigint NOT NULL REFERENCES public.dms_documents(id),
 version_id bigint NOT NULL REFERENCES public.dms_document_versions(id),
 file_id bigint NOT NULL REFERENCES public.dms_document_files(id),
 checksum text NOT NULL CHECK (checksum~'^[a-f0-9]{64}$'),
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY (payment_id,company_id,employee_id) REFERENCES erp_private.t18_exit_payments(id,company_id,employee_id),
 UNIQUE (id,payment_id),
 CHECK (outcome NOT IN ('pending','rejected') OR amount=0),
 CHECK (outcome<>'partial' OR amount>0)
);
CREATE UNIQUE INDEX t18_exit_one_pending ON erp_private.t18_exit_payment_events(payment_id) WHERE outcome='pending';
CREATE UNIQUE INDEX t18_exit_one_conclusion ON erp_private.t18_exit_payment_events(payment_id) WHERE outcome<>'pending';
CREATE INDEX t18_exit_latest_event ON erp_private.t18_exit_payment_events(payment_id,order_id DESC);

CREATE TABLE erp_private.t18_exit_reversals (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_id uuid NOT NULL UNIQUE REFERENCES erp_private.t18_exit_payments(id),
 event_id uuid NOT NULL UNIQUE,
 document_id bigint NOT NULL REFERENCES public.dms_documents(id),
 version_id bigint NOT NULL REFERENCES public.dms_document_versions(id),
 file_id bigint NOT NULL REFERENCES public.dms_document_files(id),
 checksum text NOT NULL CHECK (checksum~'^[a-f0-9]{64}$'),
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 FOREIGN KEY (event_id,payment_id) REFERENCES erp_private.t18_exit_payment_events(id,payment_id)
);

CREATE TABLE erp_private.t18_exit_allocation_decisions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 payment_id uuid NOT NULL REFERENCES erp_private.t18_exit_payments(id),
 revision integer NOT NULL CHECK (revision>0),
 document_id bigint REFERENCES public.dms_documents(id),
 version_id bigint REFERENCES public.dms_document_versions(id),
 file_id bigint REFERENCES public.dms_document_files(id),
 checksum text CHECK (checksum~'^[a-f0-9]{64}$'),
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 reason text NOT NULL CHECK (length(btrim(reason)) BETWEEN 1 AND 500),
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE (payment_id,revision),
 CHECK (num_nonnulls(document_id,version_id,file_id,checksum) IN (0,4))
);

CREATE TABLE erp_private.t18_exit_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 decision_id uuid NOT NULL REFERENCES erp_private.t18_exit_allocation_decisions(id),
 line_id uuid NOT NULL REFERENCES erp_private.t18_lines(id),
 amount numeric(20,2) NOT NULL CHECK (amount>0),
 UNIQUE (decision_id,line_id)
);
CREATE INDEX t18_exit_allocations_by_line ON erp_private.t18_exit_allocations(line_id);

CREATE TABLE erp_private.t18_exit_recovery_links (
 allocation_id uuid PRIMARY KEY REFERENCES erp_private.t18_exit_allocations(id),
 receipt_id bigint NOT NULL UNIQUE REFERENCES erp_private.t13_receipts(id),
 recovery_allocation_id bigint NOT NULL UNIQUE REFERENCES erp_private.t13_allocations(id)
);


CREATE TABLE erp_private.t18_exit_proof_originals (
 file_id bigint PRIMARY KEY REFERENCES public.dms_document_files(id),
 document_id bigint NOT NULL REFERENCES public.dms_documents(id),
 version_id bigint NOT NULL REFERENCES public.dms_document_versions(id),
 checksum text NOT NULL CHECK (checksum~'^[a-f0-9]{64}$')
);
CREATE INDEX t18_exit_proof_document ON erp_private.t18_exit_proof_originals(document_id);
CREATE INDEX t18_exit_proof_version ON erp_private.t18_exit_proof_originals(version_id);

-- A normal DMS replacement may designate a new current version. Exit cash
-- still retains the old original, its exact content and its finance scope.
CREATE FUNCTION erp_private.t18_retain_exit_proof()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE retained boolean;
BEGIN
 IF TG_TABLE_NAME='dms_document_files' THEN
   retained:=(TG_OP='DELETE' OR ROW(OLD.document_id,OLD.version_id,OLD.deleted_at,OLD.file_role,OLD.sha256_hash,
      OLD.file_size_bytes,OLD.storage_bucket,OLD.storage_path,OLD.integrity_status,OLD.mime_type,OLD.file_name)
     IS DISTINCT FROM ROW(NEW.document_id,NEW.version_id,NEW.deleted_at,NEW.file_role,NEW.sha256_hash,
      NEW.file_size_bytes,NEW.storage_bucket,NEW.storage_path,NEW.integrity_status,NEW.mime_type,NEW.file_name))
     AND EXISTS(SELECT 1 FROM erp_private.t18_exit_proof_originals WHERE file_id=OLD.id);
 ELSIF TG_TABLE_NAME='dms_document_versions' THEN
   retained:=(TG_OP='DELETE' OR ROW(OLD.document_id,OLD.version_number,OLD.unlinked_at)
     IS DISTINCT FROM ROW(NEW.document_id,NEW.version_number,NEW.unlinked_at))
     AND EXISTS(SELECT 1 FROM erp_private.t18_exit_proof_originals WHERE version_id=OLD.id);
 ELSE
   retained:=(TG_OP='DELETE' OR ROW(OLD.owning_company_id,OLD.owning_branch_id,OLD.document_type_id,OLD.category_id,
      OLD.confidentiality_level,OLD.status,OLD.is_archived,OLD.deleted_at)
     IS DISTINCT FROM ROW(NEW.owning_company_id,NEW.owning_branch_id,NEW.document_type_id,NEW.category_id,
      NEW.confidentiality_level,NEW.status,NEW.is_archived,NEW.deleted_at))
     AND EXISTS(SELECT 1 FROM erp_private.t18_exit_proof_originals WHERE document_id=OLD.id);
 END IF;
 IF retained THEN RAISE EXCEPTION 'The verified exit payment original is retained' USING ERRCODE='55000'; END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$$;

CREATE TRIGGER t18_retain_exit_payment_file BEFORE UPDATE OF document_id,version_id,deleted_at,file_role,sha256_hash,
 file_size_bytes,storage_bucket,storage_path,integrity_status,mime_type,file_name OR DELETE ON public.dms_document_files
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_retain_exit_proof();
CREATE TRIGGER t18_retain_exit_payment_version BEFORE UPDATE OF document_id,version_number,unlinked_at OR DELETE
 ON public.dms_document_versions FOR EACH ROW EXECUTE FUNCTION erp_private.t18_retain_exit_proof();
CREATE TRIGGER t18_retain_exit_payment_document BEFORE UPDATE OF owning_company_id,owning_branch_id,document_type_id,category_id,
 confidentiality_level,status,is_archived,deleted_at OR DELETE ON public.dms_documents
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_retain_exit_proof();

-- Only an exact operation replay can consult a previously verified original
-- that has since become historical. New evidence must pass the active T16 check.
CREATE FUNCTION erp_private.t18_exit_pinned_hash(
 p_company bigint,p_branch bigint,p_document bigint,p_version bigint,p_file bigint
) RETURNS text LANGUAGE sql VOLATILE SET search_path='' AS $$
 SELECT o.checksum FROM erp_private.t18_exit_proof_originals o
 JOIN public.dms_documents d ON d.id=o.document_id
 JOIN public.dms_document_files f ON f.id=o.file_id AND f.sha256_hash=o.checksum
 WHERE o.file_id=p_file AND o.document_id=p_document AND o.version_id=p_version
   AND d.owning_company_id=p_company AND d.owning_branch_id=p_branch AND d.confidentiality_level='finance'
   AND erp_private.t02_has_scope('dms.documents.preview',p_company,p_branch)
   AND erp_private.t02_has_scope('dms.documents.view.finance',p_company,p_branch)
   AND erp_private.document_permission(d.id,'dms.documents.preview');
$$;

DO $ddl$
DECLARE table_name text;
BEGIN
 FOREACH table_name IN ARRAY ARRAY['t18_cash_identities','t18_exit_payment_fences','t18_exit_intents',
   't18_exit_payments','t18_exit_payment_events','t18_exit_reversals',
   't18_exit_allocation_decisions','t18_exit_allocations','t18_exit_recovery_links','t18_exit_proof_originals']
 LOOP
   EXECUTE format('ALTER TABLE erp_private.%I ENABLE ROW LEVEL SECURITY',table_name);
   EXECUTE format('REVOKE ALL ON erp_private.%I FROM PUBLIC,anon,authenticated,service_role',table_name);
   IF table_name<>'t18_exit_payment_fences' THEN
     EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON erp_private.%I
        FOR EACH ROW EXECUTE FUNCTION erp_private.t15_keep_history()',table_name||'_retain',table_name);
   END IF;
 END LOOP;
END;
$ddl$;

CREATE FUNCTION erp_private.t18_claim_cash_identity()
RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE
 origin_name text:=CASE WHEN TG_TABLE_NAME IN ('t16_payments','t16_payment_events') THEN 'monthly' ELSE 'exit' END;
 identity_type text;
 identity_value text;
BEGIN
 IF TG_TABLE_NAME IN ('t16_payments','t18_exit_payments') THEN
   identity_type:=erp_private.t18_reference_kind(NEW.channel);
   identity_value:=lower(NEW.reference);
 ELSE
   IF NEW.outcome NOT IN ('paid','partial') THEN RETURN NEW; END IF;
   identity_type:='cash-proof';
   identity_value:=NEW.checksum;
 END IF;

 INSERT INTO erp_private.t18_cash_identities(company_id,employee_id,identity_kind,identity_key,origin,origin_id)
 VALUES(NEW.company_id,NEW.employee_id,identity_type,identity_value,origin_name,NEW.id);
 RETURN NEW;
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'This payment identity already belongs to a retained employee movement' USING ERRCODE='PT409';
END;
$$;

CREATE TRIGGER t18_monthly_reference_claim AFTER INSERT ON erp_private.t16_payments
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_claim_cash_identity();
CREATE TRIGGER t18_monthly_proof_claim AFTER INSERT ON erp_private.t16_payment_events
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_claim_cash_identity();
CREATE TRIGGER t18_exit_reference_claim AFTER INSERT ON erp_private.t18_exit_payments
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_claim_cash_identity();
CREATE TRIGGER t18_exit_proof_claim AFTER INSERT ON erp_private.t18_exit_payment_events
 FOR EACH ROW EXECUTE FUNCTION erp_private.t18_claim_cash_identity();

CREATE VIEW erp_private.t18_exit_current_events WITH(security_invoker=true) AS
 SELECT DISTINCT ON (payment_id) * FROM erp_private.t18_exit_payment_events ORDER BY payment_id,order_id DESC;

CREATE VIEW erp_private.t18_exit_active_allocations WITH(security_invoker=true) AS
 SELECT a.*,d.payment_id,d.checksum,p.version_id,l.kind
 FROM erp_private.t18_exit_allocations a
 JOIN erp_private.t18_exit_allocation_decisions d ON d.id=a.decision_id
 JOIN erp_private.t18_exit_payments p ON p.id=d.payment_id
 JOIN erp_private.t18_lines l ON l.id=a.line_id
 WHERE NOT EXISTS (SELECT 1 FROM erp_private.t18_exit_reversals r WHERE r.payment_id=p.id);

REVOKE ALL ON erp_private.t18_exit_current_events,erp_private.t18_exit_active_allocations FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.t18_exit_touch(p_version uuid)
RETURNS void LANGUAGE sql VOLATILE SET search_path='' AS $$
 INSERT INTO erp_private.t18_exit_payment_fences(version_id) VALUES(p_version)
 ON CONFLICT(version_id) DO UPDATE SET epoch=t18_exit_payment_fences.epoch+1;
$$;

CREATE FUNCTION erp_private.t18_may_revoke(p_version uuid)
RETURNS boolean LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
BEGIN
 PERFORM erp_private.t18_exit_touch(p_version);
 IF NOT EXISTS (SELECT 1 FROM erp_private.t18_exit_intents WHERE version_id=p_version) THEN RETURN true; END IF;
 RETURN EXISTS (
  SELECT 1 FROM erp_private.t18_exit_payments p
  JOIN erp_private.t18_exit_current_events e ON e.payment_id=p.id
  WHERE p.version_id=p_version AND e.outcome='rejected'
 )
 AND NOT EXISTS (
  SELECT 1 FROM erp_private.t18_exit_payments p
  JOIN erp_private.t18_exit_current_events e ON e.payment_id=p.id
  WHERE p.version_id=p_version AND e.outcome<>'rejected'
 );
END;
$$;

CREATE FUNCTION erp_private.t18_exit_revision(p_payment uuid)
RETURNS integer LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT coalesce(max(revision),0) FROM erp_private.t18_exit_allocation_decisions WHERE payment_id=p_payment;
$$;

CREATE FUNCTION erp_private.t18_payment_status(p_version uuid)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 WITH events AS (
   SELECT e.*,p.currency,p.reference,r.id IS NOT NULL AS reversed
   FROM erp_private.t18_exit_payments p
   JOIN erp_private.t18_exit_current_events e ON e.payment_id=p.id
   LEFT JOIN erp_private.t18_exit_reversals r ON r.payment_id=p.id
   WHERE p.version_id=p_version
 ), amounts AS (
   SELECT coalesce(sum(amount) FILTER (WHERE NOT reversed AND outcome IN ('paid','partial')),0) AS cash,
     coalesce(bool_or(NOT reversed AND outcome='paid'),false) AS paid,
     coalesce(bool_or(outcome='pending'),false) AS pending,
     coalesce(bool_or(outcome='rejected'),false) AS rejected,
     coalesce(bool_or(reversed),false) AS reversed
   FROM events
 ), allocations AS (
   SELECT coalesce(sum(amount) FILTER (WHERE kind='earning'),0) AS wages,
     coalesce(sum(amount) FILTER (WHERE kind='deduction'),0) AS deductions
   FROM erp_private.t18_exit_active_allocations WHERE version_id=p_version
 )
 SELECT jsonb_build_object(
   'state',CASE WHEN i.version_id IS NULL THEN 'unstarted'
     WHEN a.paid AND a.cash=v.net AND x.wages=v.gross AND x.deductions=v.deductions AND NOT a.pending THEN 'reconciled'
     WHEN a.paid AND a.cash=v.net AND a.pending THEN 'pending'
     WHEN a.paid AND a.cash=v.net THEN 'paid-unallocated'
     WHEN a.cash>0 THEN 'partial'
     WHEN a.pending THEN 'pending'
     WHEN a.reversed THEN 'reversed'
     WHEN a.rejected THEN 'rejected'
     ELSE 'handoff-pending' END,
   'channel',i.channel,'currency',v.currency,
   'verified_cash',a.cash::text,'applied_wages',x.wages::text,'applied_deductions',x.deductions::text,
   'unallocated',(a.cash-x.wages+x.deductions)::text,'remaining',(v.net-a.cash)::text,
   'movements',coalesce((SELECT jsonb_agg(jsonb_build_object(
     'id',e.payment_id,'amount',e.amount::text,'currency',e.currency,'outcome',e.outcome,'paid_on',e.paid_on,
     'recorded_at',e.created_at,'reference_suffix',CASE WHEN length(e.reference)>=8 THEN right(e.reference,4) END,
     'allocation_revision',erp_private.t18_exit_revision(e.payment_id),'reversed',e.reversed,
     'can_allocate',NOT e.reversed AND e.outcome IN ('paid','partial'),
     'can_reverse',NOT e.reversed AND e.outcome IN ('paid','partial')
   ) ORDER BY e.order_id DESC) FROM events e),'[]'::jsonb)
 )
 FROM erp_private.t18_versions v
 LEFT JOIN erp_private.t18_exit_intents i ON i.version_id=v.id
 CROSS JOIN amounts a CROSS JOIN allocations x
 WHERE v.id=p_version;
$$;

CREATE OR REPLACE FUNCTION public.t13_recovery_allocate(p_operation uuid,p_receipt bigint,p_pin bigint,p_schedule bigint,
 p_month date,p_line uuid,p_amount numeric,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pin erp_private.t13_payroll_pins;
BEGIN
 SELECT p.* INTO pin FROM erp_private.t13_payroll_pins p
 JOIN erp_private.t13_receipts r ON r.pin_id=p.id WHERE r.id=p_receipt;
 PERFORM erp_private.t13_allocation_actor(pin);
 IF EXISTS (SELECT 1 FROM erp_private.t16_recovery_links WHERE receipt_id=p_receipt)
   OR EXISTS (SELECT 1 FROM erp_private.t16_recovery_closures WHERE receipt_id=p_receipt)
   OR EXISTS (SELECT 1 FROM erp_private.t18_exit_recovery_links WHERE receipt_id=p_receipt) THEN
   RAISE EXCEPTION 'Reconcile this receipt through its approved payroll or exit payment' USING ERRCODE='42501';
 END IF;
 RETURN erp_private.t13_recovery_allocate(p_operation,p_receipt,p_pin,p_schedule,p_month,p_line,p_amount,p_reason);
END;
$$;

CREATE OR REPLACE FUNCTION public.t13_recovery_reverse(p_operation uuid,p_allocation bigint,p_amount numeric,p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE pin erp_private.t13_payroll_pins;
BEGIN
 SELECT p.* INTO pin FROM erp_private.t13_payroll_pins p
 JOIN erp_private.t13_allocations a ON a.pin_id=p.id WHERE a.id=p_allocation;
 PERFORM erp_private.t13_allocation_actor(pin);
 IF EXISTS (
   SELECT 1 FROM erp_private.t13_allocations a
   WHERE a.id=p_allocation AND (
     EXISTS(SELECT 1 FROM erp_private.t16_recovery_links l WHERE l.receipt_id=a.receipt_id)
     OR EXISTS(SELECT 1 FROM erp_private.t18_exit_recovery_links l WHERE l.receipt_id=a.receipt_id)
   )
 ) THEN RAISE EXCEPTION 'Reverse this recovery through its verified payroll or exit payment' USING ERRCODE='42501'; END IF;
 RETURN erp_private.t13_recovery_reverse(p_operation,p_allocation,p_amount,p_reason);
END;
$$;

CREATE OR REPLACE VIEW erp_private.t16_effective_recovery_receipts WITH (security_invoker=true) AS
 SELECT r.* FROM erp_private.t13_receipts r
 WHERE NOT EXISTS(
   SELECT 1 FROM erp_private.t16_recovery_links l
   JOIN erp_private.t16_payment_allocations a ON a.id=l.allocation_id
   JOIN erp_private.t16_allocation_decisions d ON d.id=a.decision_id
   JOIN erp_private.t16_payment_reversals x ON x.payment_id=d.payment_id
   WHERE l.receipt_id=r.id
 )
 AND NOT EXISTS(
   SELECT 1 FROM erp_private.t18_exit_recovery_links l
   JOIN erp_private.t18_exit_allocations a ON a.id=l.allocation_id
   JOIN erp_private.t18_exit_allocation_decisions d ON d.id=a.decision_id
   JOIN erp_private.t18_exit_reversals x ON x.payment_id=d.payment_id
   WHERE l.receipt_id=r.id
 );

CREATE FUNCTION erp_private.t18_exit_post_recovery(
 p_version erp_private.t18_versions,p_line erp_private.t18_lines,p_approval erp_private.t18_approvals,
 p_allocation uuid,p_decision uuid,p_amount numeric,p_reason text
) RETURNS void LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 case_identity bigint:=(p_line.source->>'case')::bigint;
 pin erp_private.t13_payroll_pins;
 pin_identity bigint;
 recovery_month date;
 receipt_identity bigint;
 posted jsonb;
 allocated numeric;
BEGIN
 SELECT month INTO STRICT recovery_month FROM erp_private.t18_reserved_sources
  WHERE version_id=p_version.id AND line_id=p_line.id AND released_at IS NULL;
 PERFORM 1 FROM erp_private.t13_cases WHERE id=case_identity FOR UPDATE NOWAIT;
 pin_identity:=erp_private.t13_payroll_pin(case_identity,p_line.source->>'recovery_kind',
   (p_line.source->>'upstream_id')::bigint,recovery_month,
   p_version.id,p_line.id,p_approval.id,p_approval.decided_by,p_line.amount,p_line.amount,p_line.source->>'fingerprint');
 SELECT * INTO STRICT pin FROM erp_private.t13_payroll_pins WHERE id=pin_identity;
 PERFORM erp_private.t13_allocation_actor(pin);

 IF EXISTS (
   SELECT 1 FROM erp_private.t13_receipts r WHERE r.pin_id=pin.id
   AND NOT EXISTS(SELECT 1 FROM erp_private.t18_exit_recovery_links l WHERE l.receipt_id=r.id)
   AND NOT EXISTS(SELECT 1 FROM erp_private.t16_recovery_closures c WHERE c.receipt_id=r.id)
 ) THEN RAISE EXCEPTION 'Resolve the existing recovery receipts before applying exit cash' USING ERRCODE='PT409'; END IF;

 INSERT INTO erp_private.t13_receipts(pin_id,case_id,payroll_month,operation_id,actual_amount,bank_reference,evidence_id,final)
 VALUES(pin.id,pin.case_id,pin.payroll_month,p_allocation,p_amount,'T18 allocation '||p_allocation,p_decision,false)
 RETURNING id INTO receipt_identity;
 posted:=erp_private.t13_recovery_allocate(gen_random_uuid(),receipt_identity,pin.id,pin.schedule_id,pin.payroll_month,
   pin.payroll_line_id,p_amount,p_reason);
 INSERT INTO erp_private.t18_exit_recovery_links(allocation_id,receipt_id,recovery_allocation_id)
 VALUES(p_allocation,receipt_identity,(posted->>'id')::bigint);

 SELECT coalesce(sum(CASE WHEN reverses_allocation_id IS NULL THEN amount ELSE -amount END),0)
 INTO allocated FROM erp_private.t13_allocations WHERE pin_id=pin.id;
 IF allocated=pin.approved_amount THEN PERFORM erp_private.t16_recovery_mark_final(pin,p_decision); END IF;
END;
$$;

CREATE FUNCTION erp_private.t18_exit_record_receipt(
 p_case erp_private.t18_cases,p_version erp_private.t18_versions,p_intent erp_private.t18_exit_intents,
 p_actor bigint,p_data jsonb,p_checksum text
) RETURNS uuid LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 payment_reference text:=btrim(p_data->>'reference');
 receipt_outcome text:=p_data->>'outcome';
 received numeric;
 prior_cash numeric;
 paid_seen boolean;
 payment_day date;
 original erp_private.t18_exit_payments;
 previous erp_private.t18_exit_payment_events;
BEGIN
 IF NOT coalesce(length(payment_reference) BETWEEN 1 AND 120 AND payment_reference!~'[[:cntrl:]]',false)
   OR NOT coalesce(receipt_outcome IN ('pending','rejected','partial','paid'),false)
   OR NOT coalesce((p_data->>'amount')~'^[0-9]{1,18}(\.[0-9]{1,2})?$',false)
   OR NOT coalesce((p_data->>'paid_on')~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$',false)
   OR p_data->>'currency' IS DISTINCT FROM p_version.currency
 THEN RAISE EXCEPTION 'Provide the exact exit payment outcome, reference, date, amount and approved currency' USING ERRCODE='22023'; END IF;
 received:=(p_data->>'amount')::numeric;
 payment_day:=(p_data->>'paid_on')::date;
 IF payment_day<p_case.last_day OR payment_day>(clock_timestamp() AT TIME ZONE 'Asia/Dubai')::date THEN
   RAISE EXCEPTION 'Use a verified payment date on or after the final work date' USING ERRCODE='22023';
 END IF;

 IF (receipt_outcome IN ('pending','rejected') AND received<>0)
   OR (receipt_outcome='partial' AND received=0)
   OR (receipt_outcome='paid' AND received=0 AND p_version.net<>0) THEN
   RAISE EXCEPTION 'The payment amount does not match the recorded outcome' USING ERRCODE='22023';
 END IF;

 SELECT * INTO original FROM erp_private.t18_exit_payments
 WHERE version_id=p_version.id AND lower(reference)=lower(payment_reference);
 IF FOUND THEN
   SELECT * INTO STRICT previous FROM erp_private.t18_exit_current_events WHERE payment_id=original.id;
   IF ROW(previous.outcome,previous.amount,previous.paid_on,previous.document_id,previous.version_id,previous.file_id,previous.checksum)
      IS NOT DISTINCT FROM ROW(receipt_outcome,received,payment_day,(p_data->>'document')::bigint,
         (p_data->>'version')::bigint,(p_data->>'file')::bigint,p_checksum) THEN
     RETURN original.id;
   END IF;
   IF previous.outcome<>'pending' OR receipt_outcome='pending' THEN
     RAISE EXCEPTION 'Retain the original outcome and use a new reference for different cash' USING ERRCODE='PT409';
   END IF;
 END IF;

 SELECT coalesce(sum(e.amount),0),coalesce(bool_or(e.outcome='paid'),false) INTO prior_cash,paid_seen
 FROM erp_private.t18_exit_payments p JOIN erp_private.t18_exit_current_events e ON e.payment_id=p.id
 WHERE p.version_id=p_version.id AND NOT EXISTS(SELECT 1 FROM erp_private.t18_exit_reversals r WHERE r.payment_id=p.id);

 IF (receipt_outcome='paid' AND (prior_cash+received<>p_version.net OR (paid_seen AND p_version.net=0)))
   OR (receipt_outcome='partial' AND prior_cash+received>=p_version.net)
   OR (receipt_outcome='pending' AND paid_seen AND prior_cash=p_version.net) THEN
   RAISE EXCEPTION 'Verified exit cash exceeds the approved remainder or does not match the stated outcome' USING ERRCODE='PT409';
 END IF;

 IF original.id IS NULL THEN
   INSERT INTO erp_private.t18_exit_payments(version_id,company_id,employee_id,channel,reference,currency)
   VALUES(p_version.id,p_case.company_id,p_case.employee_id,p_intent.channel,payment_reference,p_version.currency)
   RETURNING * INTO original;
 END IF;

 INSERT INTO erp_private.t18_exit_payment_events(payment_id,company_id,employee_id,outcome,amount,paid_on,
   document_id,version_id,file_id,checksum,actor_id)
 VALUES(original.id,p_case.company_id,p_case.employee_id,receipt_outcome,received,payment_day,
   (p_data->>'document')::bigint,(p_data->>'version')::bigint,(p_data->>'file')::bigint,p_checksum,p_actor);
 RETURN original.id;
END;
$$;

CREATE FUNCTION erp_private.t18_exit_allocate(
 p_version erp_private.t18_versions,p_approval erp_private.t18_approvals,p_event erp_private.t18_exit_payment_events,
 p_actor bigint,p_data jsonb,p_checksum text
) RETURNS void LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 note text:=btrim(p_data->>'reason');
 revision integer:=erp_private.t18_exit_revision(p_event.payment_id);
 item jsonb;
 line erp_private.t18_lines;
 taken numeric;
 effect numeric;
 decision_id uuid;
 allocation_id uuid;
BEGIN
 IF NOT coalesce(length(note) BETWEEN 1 AND 500 AND note!~'[[:cntrl:]]',false)
   OR jsonb_typeof(p_data->'lines') IS DISTINCT FROM 'array'
   OR NOT coalesce((p_data->>'revision')~'^(0|[1-9][0-9]{0,8})$',false)
 THEN RAISE EXCEPTION 'A payment revision, reason and exact approved lines are required' USING ERRCODE='22023'; END IF;
 IF (p_data->>'revision')::integer<>revision THEN
   RAISE EXCEPTION 'The payment allocation changed. Reload the current revision.' USING ERRCODE='PT409';
 END IF;
 IF jsonb_array_length(p_data->'lines') NOT BETWEEN 1 AND 100 THEN
   RAISE EXCEPTION 'Provide one to 100 exact approved lines' USING ERRCODE='22023';
 END IF;

 INSERT INTO erp_private.t18_exit_allocation_decisions(payment_id,revision,document_id,version_id,file_id,checksum,actor_id,reason)
 VALUES(p_event.payment_id,revision+1,(p_data->>'document')::bigint,
   (p_data->>'version')::bigint,(p_data->>'file')::bigint,p_checksum,p_actor,note)
 RETURNING id INTO decision_id;
 FOR item IN SELECT value FROM jsonb_array_elements(p_data->'lines') LOOP
   IF NOT erp_private.t05_fields(item,ARRAY['line','amount']) OR item->>'line' IS NULL
     OR NOT coalesce((item->>'amount')~'^[0-9]{1,18}(\.[0-9]{1,2})?$',false)
   THEN RAISE EXCEPTION 'Each allocation requires the exact line and an amount' USING ERRCODE='22023'; END IF;
   taken:=(item->>'amount')::numeric;
   SELECT * INTO line FROM erp_private.t18_lines WHERE id=(item->>'line')::uuid AND version_id=p_version.id;
   IF line.id IS NULL OR line.currency IS DISTINCT FROM p_version.currency THEN
     RAISE EXCEPTION 'The line is unavailable in this exact approved settlement' USING ERRCODE='42501';
   END IF;
   IF taken<=0 OR taken+coalesce((
       SELECT sum(a.amount) FROM erp_private.t18_exit_active_allocations a WHERE a.line_id=line.id
      ),0)>line.amount
   THEN RAISE EXCEPTION 'The allocation exceeds the remaining exact approved line' USING ERRCODE='PT409'; END IF;

   IF line.kind='deduction' OR line.category='recovery-refund' THEN
     IF p_checksum IS NULL OR EXISTS(
       SELECT 1 FROM erp_private.t18_cash_identities c WHERE c.company_id=p_event.company_id
         AND c.employee_id=p_event.employee_id AND c.identity_kind='cash-proof' AND c.identity_key=p_checksum
     ) OR EXISTS(
       SELECT 1 FROM erp_private.t18_exit_active_allocations a WHERE a.line_id=line.id AND a.checksum=p_checksum
     ) THEN RAISE EXCEPTION 'An exact deduction or refund needs distinct, independent verified evidence'
       USING ERRCODE='PT409'; END IF;
   END IF;

   INSERT INTO erp_private.t18_exit_allocations(decision_id,line_id,amount) VALUES(decision_id,line.id,taken)
   RETURNING id INTO allocation_id;
   IF line.category IN ('recovery','recovery-refund') THEN
     PERFORM erp_private.t18_exit_post_recovery(p_version,line,p_approval,allocation_id,decision_id,taken,note);
   END IF;
 END LOOP;

 SELECT coalesce(sum(CASE WHEN a.kind='deduction' THEN -a.amount ELSE a.amount END),0) INTO effect
 FROM erp_private.t18_exit_active_allocations a WHERE a.payment_id=p_event.payment_id;
 IF effect<0 OR effect>p_event.amount THEN
   RAISE EXCEPTION 'Allocated wages less verified deductions must remain within the payment cash' USING ERRCODE='PT409';
 END IF;
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'A payment decision already contains this line or revision' USING ERRCODE='PT409';
END;
$$;

CREATE FUNCTION erp_private.t18_exit_reverse(
 p_event erp_private.t18_exit_payment_events,p_actor bigint,p_data jsonb,p_checksum text
) RETURNS void LANGUAGE plpgsql VOLATILE SET search_path='' AS $$
DECLARE
 note text:=btrim(p_data->>'reason');
 allocation record;
BEGIN
 IF NOT coalesce(length(note) BETWEEN 1 AND 500 AND note!~'[[:cntrl:]]',false)
   OR NOT coalesce((p_data->>'revision')~'^(0|[1-9][0-9]{0,8})$',false)
 THEN RAISE EXCEPTION 'A payment revision and reversal reason are required' USING ERRCODE='22023'; END IF;
 IF (p_data->>'revision')::integer<>erp_private.t18_exit_revision(p_event.payment_id) THEN
   RAISE EXCEPTION 'The payment allocation changed. Reload the current revision.' USING ERRCODE='PT409';
 END IF;
 IF p_checksum=p_event.checksum OR EXISTS (
   SELECT 1 FROM erp_private.t18_cash_identities c WHERE c.company_id=p_event.company_id
    AND c.employee_id=p_event.employee_id AND c.identity_kind='cash-proof' AND c.identity_key=p_checksum
 ) THEN
   RAISE EXCEPTION 'Use independent verified evidence for this exact payment reversal' USING ERRCODE='PT409';
 END IF;

 FOR allocation IN
   SELECT t.id,t.amount FROM erp_private.t18_exit_active_allocations a
   JOIN erp_private.t18_exit_recovery_links l ON l.allocation_id=a.id
   JOIN erp_private.t13_allocations t ON t.id=l.recovery_allocation_id
   WHERE a.payment_id=p_event.payment_id ORDER BY t.pin_id,t.id
 LOOP
   PERFORM erp_private.t13_recovery_reverse(gen_random_uuid(),allocation.id,allocation.amount,note);
 END LOOP;
 INSERT INTO erp_private.t18_exit_reversals(payment_id,event_id,document_id,version_id,file_id,checksum,actor_id,reason)
 VALUES(p_event.payment_id,p_event.id,(p_data->>'document')::bigint,(p_data->>'version')::bigint,
   (p_data->>'file')::bigint,p_checksum,p_actor,note);
END;
$$;

CREATE FUNCTION public.t18_exit_payment(p_operation uuid,p_eos bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' SET timezone='UTC' AS $$
DECLARE
 actor bigint;
 settlement erp_private.t18_cases;
 approved erp_private.t18_versions;
 approval erp_private.t18_approvals;
 intent erp_private.t18_exit_intents;
 payment erp_private.t18_exit_payments;
 event erp_private.t18_exit_payment_events;
 data_keys text[];
 checksum text;
 doc_identity bigint;
 proof_version bigint;
 proof_file bigint;
 request_hash text;
 operation_receipt jsonb;
 result_state text;
 payment_identity uuid;
 channel_name text:=p_data->>'channel';
BEGIN
 data_keys:=CASE p_action
   WHEN 'start' THEN ARRAY['channel']
   WHEN 'receipt' THEN ARRAY['reference','outcome','amount','currency','paid_on','document','version','file']
   WHEN 'allocate' THEN ARRAY['payment','revision','lines','reason','document','version','file']
   WHEN 'reverse' THEN ARRAY['payment','revision','reason','document','version','file']
 END;
 IF p_operation IS NULL OR p_eos IS NULL OR data_keys IS NULL
   OR NOT erp_private.t05_fields(p_data,data_keys||ARRAY['settlement_version','digest'])
   OR octet_length(p_data::text)>32768 OR p_data->>'settlement_version' IS NULL
   OR NOT coalesce((p_data->>'digest')~'^[a-f0-9]{64}$',false)
 THEN RAISE EXCEPTION 'An operation and the exact approved exit version and digest are required' USING ERRCODE='22023'; END IF;

 SELECT * INTO settlement FROM erp_private.t18_cases WHERE eos_id=p_eos;
 IF settlement.eos_id IS NULL OR NOT coalesce(erp_private.t18_can(settlement.company_id,settlement.branch_id,'pay'),false) THEN
   RAISE EXCEPTION 'Independent Accounts exit payment authority is required in this scope' USING ERRCODE='42501';
 END IF;
 settlement:=erp_private.t18_lock_case(p_eos);
 actor:=public.current_user_profile_id();
 IF actor IS NULL OR erp_private.t12_is_subject(actor,settlement.employee_id) THEN
   RAISE EXCEPTION 'Independent Accounts exit payment authority is required in this scope' USING ERRCODE='42501';
 END IF;

 SELECT * INTO approved FROM erp_private.t18_versions WHERE id=(p_data->>'settlement_version')::uuid
   AND eos_id=p_eos AND digest=p_data->>'digest';
 SELECT * INTO approval FROM erp_private.t18_approvals WHERE eos_id=p_eos AND version_id=approved.id
   AND state='approved' AND digest=approved.digest;
 IF approved.id IS NULL OR approval.id IS NULL OR actor=approval.decided_by THEN
   RAISE EXCEPTION 'The exact independently approved exit settlement is unavailable' USING ERRCODE='42501';
 END IF;
 PERFORM erp_private.t18_exit_touch(approved.id);
 IF NOT coalesce(erp_private.t18_can(settlement.company_id,settlement.branch_id,'pay'),false) THEN
   RAISE EXCEPTION 'Independent Accounts exit payment authority is required in this scope' USING ERRCODE='42501';
 END IF;

 IF p_action IN ('receipt','reverse') OR p_data ?| ARRAY['document','version','file'] THEN
   doc_identity:=(p_data->>'document')::bigint;
   proof_version:=(p_data->>'version')::bigint;
   proof_file:=(p_data->>'file')::bigint;
   checksum:=coalesce(
     erp_private.t18_exit_pinned_hash(settlement.company_id,settlement.branch_id,doc_identity,proof_version,proof_file),
     erp_private.t16_evidence(settlement.company_id,settlement.branch_id,doc_identity,proof_version,proof_file));
 END IF;
 request_hash:=erp_private.t02_digest(jsonb_build_array(p_eos,p_action,p_data,checksum));
 operation_receipt:=erp_private.t02_replay('t18-exit-payment',p_operation,request_hash);
 IF operation_receipt IS NOT NULL THEN RETURN operation_receipt; END IF;

 IF checksum IS NOT NULL THEN
   IF checksum IS DISTINCT FROM
     erp_private.t16_evidence(settlement.company_id,settlement.branch_id,doc_identity,proof_version,proof_file)
   THEN RAISE EXCEPTION 'Verified bank evidence changed before the exit action' USING ERRCODE='PT409'; END IF;
   INSERT INTO erp_private.t18_exit_proof_originals(file_id,document_id,version_id,checksum)
   VALUES(proof_file,doc_identity,proof_version,checksum) ON CONFLICT(file_id) DO NOTHING;
 END IF;

 SELECT * INTO intent FROM erp_private.t18_exit_intents WHERE version_id=approved.id;
 IF p_action='start' THEN
   IF NOT coalesce(channel_name IN ('exit-bank-transfer','exit-cheque')
       AND (approved.policy->'payment_channels') ? channel_name,false) THEN
     RAISE EXCEPTION 'Use a payment channel in this exact approved policy version' USING ERRCODE='22023';
   END IF;
   IF intent.version_id IS NULL THEN
     PERFORM erp_private.t18_assert_payment_basis(approved.id);
     INSERT INTO erp_private.t18_exit_intents(version_id,approval_id,channel,actor_id)
     VALUES(approved.id,approval.id,channel_name,actor);
   ELSIF intent.channel IS DISTINCT FROM channel_name OR intent.approval_id IS DISTINCT FROM approval.id THEN
     RAISE EXCEPTION 'The original payment handoff channel and approval are retained' USING ERRCODE='PT409';
   END IF;
 ELSE
   IF intent.version_id IS NULL OR intent.approval_id IS DISTINCT FROM approval.id THEN
     RAISE EXCEPTION 'Record the exact approved exit payment handoff before reconciliation' USING ERRCODE='PT409';
   END IF;
   PERFORM erp_private.t18_assert_claims(approved.id);
   IF p_action='receipt' THEN
     payment_identity:=erp_private.t18_exit_record_receipt(settlement,approved,intent,actor,p_data,checksum);
   ELSE
     SELECT * INTO payment FROM erp_private.t18_exit_payments
       WHERE id=(p_data->>'payment')::uuid AND version_id=approved.id;
     IF payment.id IS NULL THEN
       RAISE EXCEPTION 'The payment is unavailable in this exact approved exit settlement' USING ERRCODE='42501';
     END IF;
     SELECT * INTO STRICT event FROM erp_private.t18_exit_current_events WHERE payment_id=payment.id;
     IF event.outcome NOT IN ('paid','partial') OR EXISTS (
       SELECT 1 FROM erp_private.t18_exit_reversals r WHERE r.payment_id=payment.id
     ) THEN RAISE EXCEPTION 'Use the exact unreversed verified payment movement' USING ERRCODE='PT409'; END IF;
     payment_identity:=payment.id;
     IF p_action='allocate' THEN
       PERFORM erp_private.t18_exit_allocate(approved,approval,event,actor,p_data,checksum);
     ELSE
       PERFORM erp_private.t18_exit_reverse(event,actor,p_data,checksum);
     END IF;
   END IF;
 END IF;

 IF NOT coalesce(erp_private.t18_can(settlement.company_id,settlement.branch_id,'pay'),false)
   OR erp_private.t12_is_subject(actor,settlement.employee_id) THEN
   RAISE EXCEPTION 'Independent Accounts exit payment authority is required in this scope' USING ERRCODE='42501';
 END IF;
 result_state:=erp_private.t18_payment_status(approved.id)->>'state';
 RETURN erp_private.t02_save_receipt('t18-exit-payment',p_operation,request_hash,jsonb_build_object(
   'version',approved.id,'payment',payment_identity,'state',result_state,
   'revision',erp_private.t18_exit_revision(payment_identity)));
EXCEPTION WHEN lock_not_available THEN
 RAISE EXCEPTION 'A linked exit or recovery record changed concurrently. Retry the same operation.' USING ERRCODE='40001';
END;
$$;

REVOKE ALL ON FUNCTION erp_private.t18_reference_kind(text),erp_private.t18_claim_cash_identity(),
 erp_private.t18_retain_exit_proof(),erp_private.t18_exit_pinned_hash(bigint,bigint,bigint,bigint,bigint),
 erp_private.t18_exit_touch(uuid),erp_private.t18_may_revoke(uuid),erp_private.t18_exit_revision(uuid),
 erp_private.t18_payment_status(uuid),
 erp_private.t18_exit_post_recovery(erp_private.t18_versions,erp_private.t18_lines,erp_private.t18_approvals,uuid,uuid,numeric,text),
 erp_private.t18_exit_record_receipt(erp_private.t18_cases,erp_private.t18_versions,erp_private.t18_exit_intents,bigint,jsonb,text),
 erp_private.t18_exit_allocate(erp_private.t18_versions,erp_private.t18_approvals,erp_private.t18_exit_payment_events,bigint,jsonb,text),
 erp_private.t18_exit_reverse(erp_private.t18_exit_payment_events,bigint,jsonb,text),
 public.t18_exit_payment(uuid,bigint,text,jsonb)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t18_exit_payment(uuid,bigint,text,jsonb) TO authenticated;

COMMIT;
