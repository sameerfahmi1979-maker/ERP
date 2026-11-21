BEGIN;

CREATE TABLE erp_private.fleet_lpo_authorities (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 customer_id bigint NOT NULL REFERENCES public.parties(id),
 currency_id bigint NOT NULL REFERENCES public.currencies(id),
 lpo_reference text NOT NULL,
 ceiling numeric(16,2) NOT NULL CHECK(ceiling>0),
 approved_at timestamptz NOT NULL DEFAULT statement_timestamp(),
 UNIQUE(company_id,customer_id,lpo_reference)
);
CREATE TABLE erp_private.fleet_rental_terms (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id bigint NOT NULL REFERENCES erp_private.fleet_operation_orders(id),
 quote_reference text NOT NULL,
 lpo_reference text NOT NULL,
 currency_id bigint NOT NULL REFERENCES public.currencies(id),
 ceiling numeric(16,2) NOT NULL CHECK(ceiling>0),
 unit text NOT NULL CHECK(unit IN('hour','day','trip','tonne','fixed')),
 unit_rate numeric(16,4) NOT NULL CHECK(unit_rate>0),
 valid_during daterange NOT NULL CHECK(NOT isempty(valid_during) AND NOT lower_inf(valid_during) AND NOT upper_inf(valid_during)),
 agreement_evidence_id bigint NOT NULL UNIQUE REFERENCES erp_private.fleet_operation_evidence(id),
 authority_id bigint REFERENCES erp_private.fleet_lpo_authorities(id),
 prepared_by bigint NOT NULL REFERENCES public.user_profiles(id),
 approved_by bigint REFERENCES public.user_profiles(id),
 approved_at timestamptz,
 CHECK(approved_by IS NULL OR (approved_by<>prepared_by AND authority_id IS NOT NULL AND approved_at IS NOT NULL)),
 EXCLUDE USING gist(order_id WITH =,valid_during WITH &&) WHERE(approved_at IS NOT NULL)
);
CREATE TABLE erp_private.fleet_rental_statements (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 order_id bigint NOT NULL REFERENCES erp_private.fleet_operation_orders(id),
 terms_id bigint NOT NULL REFERENCES erp_private.fleet_rental_terms(id),
 supersedes_id bigint REFERENCES erp_private.fleet_rental_statements(id),
 quantity numeric(14,3) NOT NULL CHECK(quantity>0),
 amount numeric(16,2) NOT NULL CHECK(amount>0),
 approved_by bigint REFERENCES public.user_profiles(id),
 approved_at timestamptz,
 prepared_by bigint NOT NULL REFERENCES public.user_profiles(id),
 CHECK(approved_by IS NULL OR (approved_by<>prepared_by AND approved_at IS NOT NULL))
);
CREATE UNIQUE INDEX fleet_statement_approved_successor ON erp_private.fleet_rental_statements(supersedes_id)
 WHERE approved_at IS NOT NULL AND supersedes_id IS NOT NULL;
CREATE TABLE erp_private.fleet_statement_usage (
 statement_id bigint NOT NULL REFERENCES erp_private.fleet_rental_statements(id),
 usage_id bigint NOT NULL REFERENCES erp_private.fleet_rental_usage(id),
 evidence_id bigint NOT NULL REFERENCES erp_private.fleet_operation_evidence(id),
 PRIMARY KEY(statement_id,usage_id)
);
CREATE TABLE erp_private.fleet_statement_active_claims (
 usage_id bigint PRIMARY KEY REFERENCES erp_private.fleet_rental_usage(id),
 statement_id bigint NOT NULL REFERENCES erp_private.fleet_rental_statements(id)
);
CREATE INDEX fleet_rental_terms_order ON erp_private.fleet_rental_terms(order_id,id DESC);
CREATE INDEX fleet_rental_statement_order ON erp_private.fleet_rental_statements(order_id,id DESC);

CREATE FUNCTION erp_private.t07_signed_chargeable_hours(p_usage bigint,p_terms bigint)
RETURNS numeric LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT greatest(0,extract(epoch FROM
    least(upper(u.work_period),coalesce(stopped.occurred_at,'infinity'::timestamptz))
    - greatest(lower(u.work_period),started.occurred_at))/3600)
 FROM erp_private.t07_effective_rental_usage u JOIN erp_private.fleet_rental_terms t ON t.id=p_terms AND t.order_id=u.order_id
 JOIN erp_private.fleet_operation_evidence e ON e.id=u.evidence_id
 JOIN erp_private.fleet_rental_events started ON started.order_id=u.order_id AND started.kind='customer-start'
 LEFT JOIN erp_private.fleet_rental_events stopped ON stopped.order_id=u.order_id AND stopped.kind='customer-stop'
 WHERE u.id=p_usage AND u.state='signed'
   AND erp_private.t07_evidence_is_current(e.id) AND erp_private.document_permission(e.document_id,'dms.documents.preview')
   AND t.valid_during @> (lower(u.work_period) AT TIME ZONE 'Asia/Dubai')::date
   AND t.valid_during @> ((upper(u.work_period)-interval '1 microsecond') AT TIME ZONE 'Asia/Dubai')::date;
$$;
REVOKE ALL ON FUNCTION erp_private.t07_signed_chargeable_hours(bigint,bigint) FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.t07_review_rental(p_operation uuid,p_order bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE o erp_private.fleet_operation_orders; terms erp_private.fleet_rental_terms; lpo erp_private.fleet_lpo_authorities;
 stmt erp_private.fleet_rental_statements; prior erp_private.fleet_rental_statements; r jsonb; request_hash text; why text;
 actor bigint:=public.current_user_profile_id(); id_result bigint; proof bigint; reference text;
 from_day date; to_day date; rate numeric; limit_amount numeric; currency bigint; unit_code text;
 ids bigint[]; approved_qty numeric; signed_hours numeric; found_count integer; total_held numeric;
BEGIN
 IF NOT coalesce(p_action IN('prepare-terms','approve-terms','prepare-statement','approve-statement'),false)
   OR NOT erp_private.t05_fields(p_data,ARRAY['id','quote','lpo','currency','ceiling','unit','rate','from','until','assignment',
     'evidence','terms','usage','quantity','supersedes','reason'])
 THEN RAISE EXCEPTION 'Invalid rental commercial review' USING ERRCODE='22023'; END IF;
 why:=erp_private.t07_text(p_data,'reason',500);
 SELECT * INTO o FROM erp_private.fleet_operation_orders WHERE id=p_order AND kind='rental' FOR UPDATE;
 IF o.id IS NULL OR NOT erp_private.t02_has_scope('fleet.operations.view',o.company_id,o.branch_id)
  OR NOT erp_private.t02_has_scope('fleet.operations.commercial',o.company_id,o.branch_id)
  OR (p_action IN('approve-terms','approve-statement') AND NOT erp_private.t02_has_scope('fleet.operations.approve',o.company_id,o.branch_id))
 THEN RAISE EXCEPTION 'Rental commercial review unavailable in your current scope' USING ERRCODE='42501'; END IF;
 request_hash:=erp_private.t02_digest(jsonb_build_array(p_order,p_action,p_data));
 r:=erp_private.t02_replay('fleet-rental-commercial',p_operation,request_hash);
 IF r IS NOT NULL THEN RETURN r; END IF;
 IF o.authorized_at IS NULL OR o.status='cancelled' THEN RAISE EXCEPTION 'Authorize the underlying rental first' USING ERRCODE='PT409'; END IF;

 IF p_action='prepare-terms' THEN
   from_day:=(p_data->>'from')::date; to_day:=(p_data->>'until')::date;
   currency:=(p_data->>'currency')::bigint; rate:=(p_data->>'rate')::numeric; limit_amount:=(p_data->>'ceiling')::numeric;
   unit_code:=p_data->>'unit'; reference:=erp_private.t05_identifier(erp_private.t07_text(p_data,'lpo',100));
   IF from_day IS NULL OR to_day IS NULL OR NOT isfinite(from_day) OR NOT isfinite(to_day) OR from_day>to_day
      OR rate IS NULL OR rate<=0 OR rate<>round(rate,4)
      OR limit_amount IS NULL OR limit_amount<=0 OR limit_amount<>round(limit_amount,2)
      OR reference IS NULL OR reference!~'^[A-Z0-9./_]{1,100}$'
      OR NOT EXISTS(SELECT 1 FROM public.currencies c WHERE c.id=currency AND c.is_active AND c.decimal_places=2)
   THEN RAISE EXCEPTION 'Select valid dated terms, two-decimal currency, rate, and LPO limit' USING ERRCODE='22023'; END IF;
   proof:=erp_private.t07_record_evidence(o.id,(p_data->>'assignment')::bigint,'agreement',p_data->'evidence');
   INSERT INTO erp_private.fleet_rental_terms(order_id,quote_reference,lpo_reference,currency_id,ceiling,unit,unit_rate,valid_during,
     agreement_evidence_id,prepared_by)
   VALUES(o.id,erp_private.t07_text(p_data,'quote',100),reference,currency,limit_amount,unit_code,rate,daterange(from_day,to_day+1,'[)'),proof,actor)
   RETURNING id INTO id_result;
 ELSIF p_action='approve-terms' THEN
   SELECT * INTO terms FROM erp_private.fleet_rental_terms rr WHERE rr.id=(p_data->>'id')::bigint AND rr.order_id=o.id FOR UPDATE;
   IF terms.id IS NULL OR terms.approved_at IS NOT NULL OR terms.prepared_by=actor OR NOT EXISTS(
      SELECT 1 FROM erp_private.fleet_operation_evidence ev JOIN public.dms_documents d ON d.id=ev.document_id AND d.current_version_id=ev.version_id
      WHERE ev.id=terms.agreement_evidence_id AND d.status='active' AND d.deleted_at IS NULL AND NOT d.is_archived
        AND erp_private.document_permission(d.id,'dms.documents.preview') AND erp_private.t07_evidence_is_current(ev.id))
   THEN RAISE EXCEPTION 'Independent approval needs the current signed agreement' USING ERRCODE='PT409'; END IF;
   INSERT INTO erp_private.fleet_lpo_authorities(company_id,customer_id,currency_id,lpo_reference,ceiling)
    VALUES(o.company_id,o.customer_id,terms.currency_id,terms.lpo_reference,terms.ceiling)
    ON CONFLICT(company_id,customer_id,lpo_reference) DO NOTHING;
   SELECT * INTO lpo FROM erp_private.fleet_lpo_authorities auth WHERE auth.company_id=o.company_id AND auth.customer_id=o.customer_id
     AND auth.lpo_reference=terms.lpo_reference FOR UPDATE;
   IF ROW(lpo.currency_id,lpo.ceiling) IS DISTINCT FROM ROW(terms.currency_id,terms.ceiling)
   THEN RAISE EXCEPTION 'The shared LPO currency or ceiling requires separate authorization' USING ERRCODE='PT409'; END IF;
   UPDATE erp_private.fleet_rental_terms rr SET authority_id=lpo.id,approved_by=actor,approved_at=statement_timestamp() WHERE rr.id=terms.id;
   id_result:=terms.id;
 ELSIF p_action='prepare-statement' THEN
   SELECT * INTO terms FROM erp_private.fleet_rental_terms rr WHERE rr.id=(p_data->>'terms')::bigint AND rr.order_id=o.id
     AND rr.approved_at IS NOT NULL;
   IF terms.id IS NULL OR terms.unit<>'hour' OR jsonb_typeof(p_data->'usage') IS DISTINCT FROM 'array'
      OR jsonb_array_length(p_data->'usage') NOT BETWEEN 1 AND 100
   THEN RAISE EXCEPTION 'The pilot statement requires approved hourly terms and exact signed usage' USING ERRCODE='PT409'; END IF;
   SELECT array_agg(value::bigint) INTO ids FROM jsonb_array_elements_text(p_data->'usage');
   SELECT count(hours),sum(hours) INTO found_count,signed_hours
   FROM (SELECT erp_private.t07_signed_chargeable_hours(u.id,terms.id) AS hours
         FROM erp_private.fleet_rental_usage u WHERE u.id=ANY(ids)) permitted WHERE hours>0;
   approved_qty:=(p_data->>'quantity')::numeric;
   IF found_count<>cardinality(ids) OR approved_qty IS NULL OR approved_qty<>round(approved_qty,3)
      OR approved_qty<=0 OR approved_qty>signed_hours
   THEN RAISE EXCEPTION 'Billable quantity cannot exceed the specific signed usage' USING ERRCODE='PT409'; END IF;
   IF p_data?'supersedes' THEN
    SELECT * INTO prior FROM erp_private.fleet_rental_statements previous WHERE previous.id=(p_data->>'supersedes')::bigint
      AND previous.order_id=o.id AND previous.terms_id=terms.id AND previous.approved_at IS NOT NULL;
    IF prior.id IS NULL OR EXISTS(SELECT 1 FROM erp_private.fleet_rental_statements subsequent
          WHERE subsequent.supersedes_id=prior.id AND subsequent.approved_at IS NOT NULL)
    THEN RAISE EXCEPTION 'Select the current approved statement to amend' USING ERRCODE='PT409'; END IF;
   END IF;
   INSERT INTO erp_private.fleet_rental_statements(order_id,terms_id,supersedes_id,quantity,amount,prepared_by)
    VALUES(o.id,terms.id,prior.id,approved_qty,round(approved_qty*terms.unit_rate,2),actor) RETURNING id INTO id_result;
   INSERT INTO erp_private.fleet_statement_usage(statement_id,usage_id,evidence_id)
     SELECT id_result,u.id,u.evidence_id FROM erp_private.t07_effective_rental_usage u WHERE u.id=ANY(ids);
 ELSE
   SELECT * INTO stmt FROM erp_private.fleet_rental_statements rr WHERE rr.id=(p_data->>'id')::bigint AND rr.order_id=o.id FOR UPDATE;
   IF stmt.id IS NULL OR stmt.approved_at IS NOT NULL OR stmt.prepared_by=actor THEN
    RAISE EXCEPTION 'An independent reviewer must approve the draft statement' USING ERRCODE='PT409'; END IF;
   SELECT * INTO terms FROM erp_private.fleet_rental_terms rr WHERE rr.id=stmt.terms_id;
   SELECT count(*),sum(hours) INTO found_count,signed_hours FROM (
     SELECT erp_private.t07_signed_chargeable_hours(claim.usage_id,terms.id) AS hours
     FROM erp_private.fleet_statement_usage claim JOIN erp_private.t07_effective_rental_usage u ON u.id=claim.usage_id
     WHERE claim.statement_id=stmt.id AND u.evidence_id=claim.evidence_id) source
     HAVING bool_and(coalesce(hours>0,false));
   IF NOT EXISTS(SELECT 1 FROM erp_private.fleet_operation_evidence ev WHERE ev.id=terms.agreement_evidence_id
       AND erp_private.t07_evidence_is_current(ev.id) AND erp_private.document_permission(ev.document_id,'dms.documents.preview'))
      OR found_count IS DISTINCT FROM (SELECT count(*)::integer FROM erp_private.fleet_statement_usage WHERE statement_id=stmt.id)
      OR signed_hours<stmt.quantity
   THEN RAISE EXCEPTION 'The agreement or signed usage changed after preparation' USING ERRCODE='PT409'; END IF;
   SELECT * INTO lpo FROM erp_private.fleet_lpo_authorities auth WHERE auth.id=terms.authority_id FOR UPDATE;
   IF lpo.id IS NULL OR EXISTS(SELECT 1 FROM erp_private.fleet_rental_statements later
     WHERE later.supersedes_id=stmt.supersedes_id AND later.approved_at IS NOT NULL)
   THEN RAISE EXCEPTION 'Statement authorization or prior version changed' USING ERRCODE='PT409'; END IF;
   SELECT coalesce(sum(old.amount),0) INTO total_held FROM erp_private.fleet_rental_statements old
    JOIN erp_private.fleet_rental_terms rr ON rr.id=old.terms_id AND rr.authority_id=lpo.id
    WHERE old.approved_at IS NOT NULL AND old.id IS DISTINCT FROM stmt.supersedes_id
      AND NOT EXISTS(SELECT 1 FROM erp_private.fleet_rental_statements next_version WHERE next_version.supersedes_id=old.id AND next_version.approved_at IS NOT NULL);
   IF total_held+stmt.amount>lpo.ceiling THEN RAISE EXCEPTION 'Statement exceeds the approved shared LPO ceiling' USING ERRCODE='PT409'; END IF;
   DELETE FROM erp_private.fleet_statement_active_claims previous WHERE previous.statement_id=stmt.supersedes_id;
   INSERT INTO erp_private.fleet_statement_active_claims(usage_id,statement_id)
   SELECT claimed.usage_id,stmt.id FROM erp_private.fleet_statement_usage claimed WHERE claimed.statement_id=stmt.id;
   UPDATE erp_private.fleet_rental_statements item SET approved_by=actor,approved_at=statement_timestamp() WHERE item.id=stmt.id;
   id_result:=stmt.id;
 END IF;
 INSERT INTO erp_private.fleet_ops_audit(order_id,action,entity_id,actor_id,reason) VALUES(o.id,p_action,id_result,actor,why);
 RETURN erp_private.t02_save_receipt('fleet-rental-commercial',p_operation,request_hash,
   jsonb_build_object('id',o.id,'order_no',o.order_no,'status',o.status,'revision',o.revision,'event_id',id_result));
END;
$$;

DO $$
DECLARE item regclass;
BEGIN
 FOREACH item IN ARRAY ARRAY['erp_private.fleet_lpo_authorities'::regclass,'erp_private.fleet_rental_terms',
  'erp_private.fleet_rental_statements','erp_private.fleet_statement_usage','erp_private.fleet_statement_active_claims']
 LOOP
  EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',item);
  EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,anon,authenticated,service_role',item);
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION public.t07_review_rental(uuid,bigint,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t07_review_rental(uuid,bigint,text,jsonb) TO authenticated;
COMMIT;
