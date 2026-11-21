BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

-- Use the existing Fleet evidence ownership and original-file retention.
ALTER TABLE erp_private.fleet_operation_evidence DROP CONSTRAINT fleet_operation_evidence_purpose_check;
ALTER TABLE erp_private.fleet_operation_evidence ADD CONSTRAINT fleet_operation_evidence_purpose_check
 CHECK(purpose IN('trip-order','pre-trip','pod','weigh','rental-handover','rental-return','rental-sheet','rental-commercial','agreement','pod-exception'));
DROP INDEX erp_private.fleet_evidence_unique_paper;
CREATE UNIQUE INDEX fleet_evidence_unique_paper ON erp_private.fleet_operation_evidence(company_id,purpose,paper_reference)
 WHERE purpose NOT IN('rental-sheet','pod-exception');
ALTER TABLE erp_private.fleet_operation_evidence DROP CONSTRAINT fleet_operation_evidence_purpose_document_id_version_id_key;
CREATE UNIQUE INDEX fleet_evidence_unique_document_version ON erp_private.fleet_operation_evidence(purpose,document_id,version_id)
 WHERE purpose<>'pod-exception';
CREATE UNIQUE INDEX t09_evidence_version_by_assignment ON erp_private.fleet_operation_evidence(assignment_id,document_id,version_id)
 WHERE purpose='pod-exception';

CREATE TABLE erp_private.t09_witness_owners (
 document_id bigint PRIMARY KEY REFERENCES public.dms_documents(id),
 actual_id bigint NOT NULL REFERENCES erp_private.fleet_trip_leg_actuals(id),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 paper_reference text NOT NULL,
 UNIQUE(company_id,paper_reference)
);
CREATE TABLE erp_private.t09_pod_exceptions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actual_id bigint NOT NULL REFERENCES erp_private.fleet_trip_leg_actuals(id),
 evidence_id bigint NOT NULL REFERENCES erp_private.fleet_operation_evidence(id),
 witness_kind text NOT NULL CHECK(witness_kind IN('customer-confirmation','destination-weighbridge','site-receipt')),
 witness jsonb NOT NULL,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','approved','rejected')),
 submitted_by bigint NOT NULL REFERENCES public.user_profiles(id),
 submitted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 decided_by bigint REFERENCES public.user_profiles(id),
 decided_at timestamptz,
 decision_reason text,
 CHECK(decided_by IS DISTINCT FROM submitted_by),
 CHECK((state='pending')=(decided_by IS NULL) AND (decided_by IS NULL)=(decided_at IS NULL))
);
CREATE UNIQUE INDEX t09_one_pending_exception ON erp_private.t09_pod_exceptions(actual_id) WHERE state='pending';
CREATE INDEX t09_pod_exceptions_leg ON erp_private.t09_pod_exceptions(actual_id,id DESC);

CREATE TABLE erp_private.t09_rate_reviews (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actual_id bigint NOT NULL REFERENCES erp_private.fleet_trip_leg_actuals(id),
 rate_id bigint NOT NULL REFERENCES erp_private.t09_rates(id),
 digest text NOT NULL,
 reviewed_by bigint NOT NULL REFERENCES public.user_profiles(id),
 reviewed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 UNIQUE(actual_id,digest)
);

CREATE FUNCTION erp_private.t09_witness_type(p_kind text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT CASE p_kind WHEN 'customer-confirmation' THEN 'FLEET_CUSTOMER_DELIVERY_CONFIRMATION'
                    WHEN 'destination-weighbridge' THEN 'FLEET_WEIGH_TICKET'
                    WHEN 'site-receipt' THEN 'FLEET_DESTINATION_SITE_RECEIPT' END;
$$;

CREATE FUNCTION erp_private.t09_witness_lineage(p_actual bigint,p_document bigint,p_kind text)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT p_kind<>'destination-weighbridge' OR NOT EXISTS(
   SELECT 1 FROM erp_private.fleet_trip_leg_actuals f JOIN erp_private.fleet_operation_evidence e ON e.id=f.weigh_evidence_id
   WHERE f.id<>p_actual AND e.document_id=p_document
 );
$$;

CREATE FUNCTION erp_private.t09_signed_pod(p_actual bigint)
RETURNS bigint LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT latest.evidence_id FROM (
   SELECT p.* FROM erp_private.fleet_trip_delivery_facts p WHERE p.actual_id=p_actual ORDER BY p.id DESC LIMIT 1
 ) latest JOIN erp_private.fleet_operation_evidence e ON e.id=latest.evidence_id AND e.purpose='pod'
 JOIN public.dms_documents d ON d.id=e.document_id
 JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.type_code='FLEET_SIGNED_POD' AND t.deleted_at IS NULL
 WHERE latest.state='accepted' AND erp_private.t07_evidence_is_current(e.id);
$$;

CREATE FUNCTION erp_private.t09_witness_current(p_evidence bigint,p_kind text)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM erp_private.fleet_operation_evidence e JOIN public.dms_documents d ON d.id=e.document_id
   JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.deleted_at IS NULL
   WHERE e.id=p_evidence AND e.purpose='pod-exception' AND t.type_code=erp_private.t09_witness_type(p_kind)
   AND erp_private.t07_evidence_is_current(e.id));
$$;

-- This predicate compares structured observations transcribed from the exact
-- original. The independent manager reads that original before accepting.
CREATE FUNCTION erp_private.t09_witness_matches(p_actual bigint,p_kind text,p_observed jsonb)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM erp_private.fleet_trip_leg_actuals f
   JOIN erp_private.fleet_trip_legs l ON l.id=f.leg_id
   JOIN erp_private.fleet_operation_orders o ON o.id=l.order_id
   JOIN erp_private.fleet_operation_assignments a ON a.id=f.assignment_id
   JOIN erp_private.fleet_assets asset ON asset.id=a.asset_id
   WHERE f.id=p_actual AND f.load='loaded'
    AND erp_private.t09_witness_type(p_kind) IS NOT NULL
    AND erp_private.t05_fields(p_observed,ARRAY['trip','sequence','asset','origin','destination','delivered','issuer'])
    AND (erp_private.t05_identifier(p_observed->>'trip')=erp_private.t05_identifier(o.order_no)
      OR EXISTS(SELECT 1 FROM erp_private.fleet_trip_paper_orders p WHERE p.order_id=o.id AND p.pdf_sha256 IS NOT NULL
         AND p.snapshot->'assignments' @> jsonb_build_array(jsonb_build_object('id',a.id))
         AND erp_private.t05_identifier(p.issue_no)=erp_private.t05_identifier(p_observed->>'trip')))
    AND (p_observed->>'sequence')::integer=l.sequence
    AND erp_private.t05_identifier(p_observed->>'asset')=erp_private.t05_identifier(asset.asset_no)
    AND (p_observed->>'origin')::bigint=f.origin AND (p_observed->>'destination')::bigint=f.destination
    AND isfinite((p_observed->>'delivered')::timestamptz)
    AND (p_observed->>'delivered')::timestamptz BETWEEN f.arrived_at AND statement_timestamp()
    AND (p_kind<>'customer-confirmation' OR (p_observed->>'issuer')::bigint=o.customer_id));
$$;

CREATE FUNCTION erp_private.t09_record_witness(p_actual bigint,p_kind text,p_packet jsonb,p_observed jsonb)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE assignment erp_private.fleet_operation_assignments; owner erp_private.t09_witness_owners;
 doc bigint; ver bigint; file bigint; ref text; result bigint;
BEGIN
 IF NOT erp_private.t05_fields(p_packet,ARRAY['document','version','file','reference'])
   OR NOT erp_private.t09_witness_matches(p_actual,p_kind,p_observed)
 THEN RAISE EXCEPTION 'The witness must match this loaded leg, vehicle, journey and destination' USING ERRCODE='PT409'; END IF;
 SELECT a.* INTO assignment FROM erp_private.fleet_operation_assignments a JOIN erp_private.fleet_trip_leg_actuals f ON f.assignment_id=a.id
  WHERE f.id=p_actual;
 doc:=(p_packet->>'document')::bigint; ver:=(p_packet->>'version')::bigint; file:=(p_packet->>'file')::bigint;
 IF NOT erp_private.t09_witness_lineage(p_actual,doc,p_kind)
 THEN RAISE EXCEPTION 'The weigh ticket is already recorded for another leg' USING ERRCODE='PT409'; END IF;
 ref:=erp_private.t05_identifier(erp_private.t07_text(p_packet,'reference',100));
 IF ref!~'^[A-Z0-9./_]{1,100}$' THEN RAISE EXCEPTION 'Invalid witness reference' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.dms_documents d
   JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.type_code=erp_private.t09_witness_type(p_kind) AND t.deleted_at IS NULL
   JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.id=ver AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
   JOIN public.dms_document_files f ON f.id=file AND f.document_id=d.id AND f.version_id=v.id AND f.file_role='original'
     AND f.deleted_at IS NULL AND f.integrity_status='verified' AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$'
   JOIN erp_private.fleet_document_parents b ON b.document_id=d.id AND b.asset_id=assignment.asset_id
   JOIN public.dms_document_links l ON l.document_id=d.id AND l.entity_type='fleet_asset' AND l.entity_id=assignment.asset_id AND l.deleted_at IS NULL
   WHERE d.id=doc AND d.status='active' AND NOT d.is_archived AND d.deleted_at IS NULL
     AND erp_private.document_permission(d.id,'dms.documents.preview')
     AND (p_kind<>'customer-confirmation' OR d.party_id IS NULL OR d.party_id=(p_observed->>'issuer')::bigint)
   FOR SHARE OF d,t,v,f,l)
 THEN RAISE EXCEPTION 'Select a current verified original for this truck and witness type' USING ERRCODE='PT409'; END IF;
 INSERT INTO erp_private.t09_witness_owners(document_id,actual_id,company_id,paper_reference)
 VALUES(doc,p_actual,assignment.host_company_id,ref) ON CONFLICT(document_id) DO NOTHING;
 SELECT * INTO owner FROM erp_private.t09_witness_owners WHERE document_id=doc FOR UPDATE;
 IF owner.actual_id<>p_actual OR owner.paper_reference<>ref
 THEN RAISE EXCEPTION 'That witness is already registered to a different delivery or reference' USING ERRCODE='PT409'; END IF;
 SELECT e.id INTO result FROM erp_private.fleet_operation_evidence e
 WHERE e.purpose='pod-exception' AND e.assignment_id=assignment.id AND e.document_id=doc AND e.version_id=ver AND e.file_id=file
  AND e.paper_reference=ref;
 IF result IS NOT NULL THEN RETURN result; END IF;
 INSERT INTO erp_private.fleet_operation_evidence(order_id,assignment_id,purpose,company_id,paper_reference,document_id,version_id,file_id,recorded_by)
 VALUES(assignment.order_id,assignment.id,'pod-exception',assignment.host_company_id,ref,doc,ver,file,public.current_user_profile_id()) RETURNING id INTO result;
 RETURN result;
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'That witness reference or original is already registered' USING ERRCODE='PT409';
END;
$$;

CREATE FUNCTION erp_private.t09_exception_current(x erp_private.t09_pod_exceptions)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_private.t09_witness_current(x.evidence_id,x.witness_kind)
   AND erp_private.t09_witness_matches(x.actual_id,x.witness_kind,x.witness)
   AND EXISTS(SELECT 1 FROM erp_private.fleet_operation_evidence ev JOIN public.dms_documents d ON d.id=ev.document_id
      WHERE ev.id=x.evidence_id AND erp_private.t09_witness_lineage(x.actual_id,ev.document_id,x.witness_kind)
        AND (x.witness_kind<>'customer-confirmation' OR d.party_id IS NULL OR d.party_id=(x.witness->>'issuer')::bigint));
$$;

CREATE FUNCTION erp_private.t09_locked_preview(p_evidence bigint)
RETURNS boolean LANGUAGE sql VOLATILE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM erp_private.fleet_operation_evidence ev
   JOIN public.dms_documents d ON d.id=ev.document_id
   JOIN public.dms_document_types t ON t.id=d.document_type_id
   JOIN public.dms_document_versions v ON v.id=ev.version_id
   JOIN public.dms_document_files f ON f.id=ev.file_id
   WHERE ev.id=p_evidence AND erp_private.document_permission(d.id,'dms.documents.preview') FOR SHARE OF d,t,v,f);
$$;

CREATE FUNCTION erp_private.t09_independent(p_actual bigint,p_actor bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM erp_private.fleet_trip_leg_actuals f JOIN erp_private.fleet_trip_legs l ON l.id=f.leg_id
   JOIN erp_private.fleet_operation_orders o ON o.id=l.order_id
   CROSS JOIN LATERAL(SELECT first_fact.recorded_by FROM erp_private.fleet_trip_delivery_facts first_fact
        WHERE first_fact.actual_id=f.id ORDER BY first_fact.id LIMIT 1) entry
   WHERE f.id=p_actual AND p_actor<>entry.recorded_by AND p_actor<>o.raised_by);
$$;

CREATE FUNCTION erp_private.t09_leg_basis(p_actual bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path='' SET timezone='UTC' AS $$
DECLARE f erp_private.fleet_trip_leg_actuals; a erp_private.fleet_operation_assignments; c erp_private.fleet_commitments;
 quote erp_private.t09_assignment_rates; day date; conf record; rate erp_private.t09_rates; route jsonb; context_digest text;
BEGIN
 SELECT * INTO f FROM erp_private.fleet_trip_leg_actuals WHERE id=p_actual;
 IF f.id IS NULL THEN RETURN jsonb_build_object('state','incomplete'); END IF;
 IF f.load='empty' THEN RETURN jsonb_build_object('state','empty'); END IF;
 SELECT * INTO a FROM erp_private.fleet_operation_assignments WHERE id=f.assignment_id;
 SELECT * INTO c FROM erp_private.fleet_commitments WHERE id=a.actual_commitment_id AND kind='dispatch'
   AND employee_id=a.worker_id AND verified_driver_id=a.worker_id AND employment_period_id=a.employment_id
   AND committed_during @> tstzrange(f.departed_at,f.arrived_at,'[)');
 day:=(f.departed_at AT TIME ZONE 'Asia/Dubai')::date;
 IF c.id IS NULL OR f.arrived_at>statement_timestamp() OR NOT EXISTS(SELECT 1 FROM erp_private.t03_employment_periods p
       WHERE p.id=a.employment_id AND p.employee_id=a.worker_id AND p.company_id=a.employer_company_id AND p.work_period @> day)
 THEN RETURN jsonb_build_object('state','assignment-review'); END IF;
 SELECT * INTO conf FROM erp_private.t09_configuration(a.asset_id,f.departed_at);
 SELECT * INTO rate FROM erp_private.t09_rate_at(a.host_company_id,f.origin,f.destination,conf.truck_type,day);
 SELECT * INTO quote FROM erp_private.t09_assignment_rates WHERE assignment_id=a.id AND leg_id=f.leg_id;
 route:=jsonb_build_object('actual',f.id,'leg',f.leg_id,'order',a.order_id,'employee',a.worker_id,'employment',a.employment_id,
    'employer',a.employer_company_id,'employer_branch',a.employer_branch_id,'assignment',a.id,'asset',a.asset_id,
    'origin',f.origin,'destination',f.destination,'day',day,'departed',f.departed_at,'arrived',f.arrived_at,
    'truck_type',conf.truck_type,'configuration',conf.id,'rate',rate.id,'assignment_rate',quote.rate_id);
 context_digest:=erp_private.t02_digest(route);
 IF rate.id IS NULL THEN RETURN route||jsonb_build_object('state','missing-rate','route_digest',context_digest); END IF;
 IF ROW(quote.origin_id,quote.destination_id,quote.truck_type,quote.rate_id) IS DISTINCT FROM ROW(f.origin,f.destination,conf.truck_type,rate.id)
  AND NOT EXISTS(SELECT 1 FROM erp_private.t09_rate_reviews r WHERE r.actual_id=f.id AND r.digest=context_digest)
 THEN RETURN route||jsonb_build_object('state','rate-review','route_digest',context_digest); END IF;
 RETURN route||jsonb_build_object('state','rated','route_digest',context_digest,'currency',rate.currency,'amount',rate.amount);
END;
$$;

CREATE FUNCTION erp_private.t09_proof_basis(p_actual bigint,p_preferred bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (
  SELECT jsonb_build_object('evidence',proof.evidence_id,'exception',proof.exception_id)
  FROM (
    SELECT erp_private.t09_signed_pod(p_actual) AS evidence_id,NULL::bigint AS exception_id,0 AS priority
    UNION ALL SELECT e.evidence_id,e.id,1 FROM erp_private.t09_pod_exceptions e
      WHERE e.actual_id=p_actual AND e.state='approved' AND erp_private.t09_exception_current(e)
  ) proof WHERE proof.evidence_id IS NOT NULL AND (p_preferred IS NULL OR proof.evidence_id=p_preferred)
  ORDER BY proof.priority,proof.exception_id DESC LIMIT 1
 );
$$;

CREATE FUNCTION erp_private.t09_allowance_basis(p_actual bigint,p_preferred bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN basis->>'state'<>'rated' THEN basis WHEN proof IS NULL THEN basis||'{"state":"pod-review"}'::jsonb
        ELSE basis||proof||'{"state":"ready"}'::jsonb END
 FROM (SELECT erp_private.t09_leg_basis(p_actual) basis,erp_private.t09_proof_basis(p_actual,p_preferred) proof) record;
$$;

DO $$
DECLARE relation regclass;
BEGIN
 FOREACH relation IN ARRAY ARRAY['erp_private.t09_witness_owners'::regclass,'erp_private.t09_pod_exceptions','erp_private.t09_rate_reviews'] LOOP
   EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',relation);
   EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,anon,authenticated,service_role',relation);
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.t09_witness_type(text),erp_private.t09_witness_lineage(bigint,bigint,text),
 erp_private.t09_exception_current(erp_private.t09_pod_exceptions),erp_private.t09_signed_pod(bigint),erp_private.t09_witness_current(bigint,text),
 erp_private.t09_witness_matches(bigint,text,jsonb),erp_private.t09_record_witness(bigint,text,jsonb,jsonb),
 erp_private.t09_locked_preview(bigint),erp_private.t09_independent(bigint,bigint),erp_private.t09_leg_basis(bigint),
 erp_private.t09_proof_basis(bigint,bigint),erp_private.t09_allowance_basis(bigint,bigint)
 FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
