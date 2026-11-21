BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='60s';

CREATE TABLE erp_private.t09_allowance_changes (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actual_id bigint NOT NULL REFERENCES erp_private.fleet_trip_leg_actuals(id),
 mode text NOT NULL CHECK(mode IN('void','reprice')),
 target numeric(14,2) NOT NULL CHECK(target>=0),
 previously_settled numeric(14,2) NOT NULL,
 currency text NOT NULL,
 basis jsonb,
 proposed_by bigint NOT NULL REFERENCES public.user_profiles(id),
 proposed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 decided_by bigint REFERENCES public.user_profiles(id),
 decided_at timestamptz,
 decision_reason text,
 outcome text CHECK(outcome IN('accepted','rejected')),
 CHECK(decided_by IS DISTINCT FROM proposed_by),
 CHECK((decided_at IS NULL)=(outcome IS NULL))
);
CREATE UNIQUE INDEX t09_one_pending_change ON erp_private.t09_allowance_changes(actual_id) WHERE decided_at IS NULL;

CREATE TABLE erp_private.t09_allowance_versions (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actual_id bigint NOT NULL REFERENCES erp_private.fleet_trip_leg_actuals(id),
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 employment_id bigint NOT NULL REFERENCES erp_private.t03_employment_periods(id),
 employer_id bigint NOT NULL REFERENCES public.owner_companies(id),
 employer_branch_id bigint NOT NULL REFERENCES public.branches(id),
 work_day date NOT NULL,
 kind text NOT NULL CHECK(kind IN('base','adjustment')),
 amount numeric(14,2) NOT NULL CHECK(amount<>0),
 currency text NOT NULL,
 basis jsonb NOT NULL,
 digest text NOT NULL,
 prior_version_id bigint REFERENCES erp_private.t09_allowance_versions(id),
 change_id bigint UNIQUE REFERENCES erp_private.t09_allowance_changes(id),
 accepted_by bigint NOT NULL REFERENCES public.user_profiles(id),
 accepted_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 CHECK((kind='adjustment')=(change_id IS NOT NULL AND prior_version_id IS NOT NULL)),
 CHECK(kind<>'base' OR amount>0),
 UNIQUE(actual_id,kind,digest)
);
CREATE INDEX t09_allowance_by_employer ON erp_private.t09_allowance_versions(employer_id,id DESC);
CREATE INDEX t09_allowance_by_actual ON erp_private.t09_allowance_versions(actual_id,id DESC);
CREATE TABLE erp_private.t09_allowance_claims (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 actual_id bigint NOT NULL REFERENCES erp_private.fleet_trip_leg_actuals(id),
 version_id bigint NOT NULL UNIQUE REFERENCES erp_private.t09_allowance_versions(id),
 kind text NOT NULL CHECK(kind IN('base','adjustment')),
 consumer_key uuid NOT NULL UNIQUE,
 claimed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 settlement_key uuid UNIQUE,
 settled_at timestamptz,
 CHECK((settled_at IS NULL)=(settlement_key IS NULL))
);
CREATE UNIQUE INDEX t09_one_base_claim ON erp_private.t09_allowance_claims(actual_id) WHERE kind='base';
CREATE INDEX t09_allowance_claims_leg ON erp_private.t09_allowance_claims(actual_id,id DESC);
CREATE TABLE erp_private.t09_adjustment_withdrawals (
 version_id bigint PRIMARY KEY REFERENCES erp_private.t09_allowance_versions(id),
 withdrawn_by bigint NOT NULL REFERENCES public.user_profiles(id),
 withdrawn_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL
);

CREATE FUNCTION erp_private.t09_candidate_current(v erp_private.t09_allowance_versions)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT CASE WHEN v.kind='adjustment' THEN
  NOT EXISTS(SELECT 1 FROM erp_private.t09_adjustment_withdrawals w WHERE w.version_id=v.id) AND
  (v.basis->>'mode'='void' OR erp_private.t09_allowance_basis(v.actual_id,(v.basis#>>'{source,evidence}')::bigint)=v.basis->'source')
 ELSE
  erp_private.t02_digest(erp_private.t09_allowance_basis(v.actual_id,(v.basis->>'evidence')::bigint))=v.digest END;
$$;

CREATE FUNCTION erp_private.t09_payroll_scope(p_company bigint,p_branch bigint)
RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_private.t05_scope('hr.payroll.view',p_company,p_branch)
   AND erp_private.t05_scope('hr.payroll.trip_allowance.review',p_company,p_branch);
$$;

CREATE FUNCTION public.t09_trip_allowance(p_operation uuid,p_actual bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE f erp_private.fleet_trip_leg_actuals; a erp_private.fleet_operation_assignments; o erp_private.fleet_operation_orders;
 candidate erp_private.t09_allowance_versions; paid erp_private.t09_allowance_versions;
 case_row erp_private.t09_pod_exceptions; change_row erp_private.t09_allowance_changes;
 actor bigint:=public.current_user_profile_id(); cap text; hash text; receipt jsonb; decision_note text;
 basis jsonb; observed jsonb; v_digest text; ev bigint; result bigint; mode text; target numeric; prior_total numeric;
 payroll_action boolean;
BEGIN
 payroll_action:=coalesce(p_action IN('accept','accept-adjustment','reject-adjustment','withdraw-adjustment'),false);
 cap:=CASE WHEN p_action IN('submit-exception','propose-adjustment') THEN 'fleet.allowance.submit'
           WHEN p_action IN('approve-exception','reject-exception','review-rate') THEN 'fleet.allowance.approve'
           WHEN payroll_action THEN 'hr.payroll.trip_allowance.review' END;
 IF cap IS NULL OR NOT erp_private.t05_fields(p_data,ARRAY['id','kind','evidence','observed','digest','mode','reason'])
 THEN RAISE EXCEPTION 'Invalid allowance action' USING ERRCODE='22023'; END IF;
 SELECT * INTO f FROM erp_private.fleet_trip_leg_actuals WHERE id=p_actual;
 SELECT * INTO a FROM erp_private.fleet_operation_assignments WHERE id=f.assignment_id;
 SELECT * INTO o FROM erp_private.fleet_operation_orders WHERE id=a.order_id FOR UPDATE;
 IF o.id IS NULL OR (payroll_action AND NOT(
   erp_private.t02_has_scope(cap,a.employer_company_id,a.employer_branch_id) AND erp_private.t02_has_scope('hr.payroll.view',a.employer_company_id,a.employer_branch_id)))
  OR (NOT payroll_action AND NOT erp_private.t02_has_scope(cap,o.company_id,o.branch_id))
 THEN RAISE EXCEPTION 'This allowance is outside your current scope' USING ERRCODE='42501'; END IF;
 decision_note:=erp_private.t07_text(p_data,'reason',500);
 hash:=erp_private.t02_digest(jsonb_build_array(p_actual,p_action,p_data));
 receipt:=erp_private.t02_replay('fleet-trip-allowance',p_operation,hash);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;
 IF f.load<>'loaded' THEN RAISE EXCEPTION 'Only completed loaded legs qualify for trip allowance' USING ERRCODE='PT409'; END IF;
 IF p_action IN('review-rate','accept','propose-adjustment','accept-adjustment','withdraw-adjustment') THEN
   PERFORM 1 FROM erp_private.fleet_assets WHERE id=a.asset_id FOR SHARE;
   PERFORM pg_advisory_xact_lock_shared(hashtextextended('t09-rate-company:'||a.host_company_id,0));
 END IF;
 IF p_action='submit-exception' THEN
   IF erp_private.t09_signed_pod(f.id) IS NOT NULL OR erp_private.t09_proof_basis(f.id) IS NOT NULL
   THEN RAISE EXCEPTION 'Current delivery evidence already qualifies' USING ERRCODE='PT409'; END IF;
   ev:=erp_private.t09_record_witness(f.id,p_data->>'kind',p_data->'evidence',p_data->'observed');
   observed:=jsonb_build_object('trip',p_data#>>'{observed,trip}','asset',p_data#>>'{observed,asset}',
     'sequence',(p_data#>>'{observed,sequence}')::integer,'origin',(p_data#>>'{observed,origin}')::bigint,
     'destination',(p_data#>>'{observed,destination}')::bigint,'delivered',(p_data#>>'{observed,delivered}')::timestamptz,
     'issuer',(p_data#>>'{observed,issuer}')::bigint);
   INSERT INTO erp_private.t09_pod_exceptions(actual_id,evidence_id,witness_kind,witness,submitted_by,reason)
   VALUES(f.id,ev,p_data->>'kind',observed,actor,decision_note) RETURNING id INTO result;
 ELSIF p_action IN('approve-exception','reject-exception') THEN
   SELECT * INTO case_row FROM erp_private.t09_pod_exceptions WHERE id=(p_data->>'id')::bigint AND actual_id=f.id FOR UPDATE;
   IF case_row.id IS NULL OR case_row.submitted_by=actor OR NOT erp_private.t09_independent(f.id,actor)
   THEN RAISE EXCEPTION 'An independent Operations manager must decide the exact exception' USING ERRCODE='42501'; END IF;
   IF case_row.state<>'pending' THEN RAISE EXCEPTION 'This exception already has a decision' USING ERRCODE='PT409'; END IF;
   IF NOT erp_private.t09_locked_preview(case_row.evidence_id)
   THEN RAISE EXCEPTION 'Review the original witness under your current access' USING ERRCODE='42501'; END IF;
   IF p_action='approve-exception' AND (erp_private.t09_signed_pod(f.id) IS NOT NULL
       OR NOT erp_private.t09_exception_current(case_row))
   THEN RAISE EXCEPTION 'The delivery evidence changed. Review the current proof' USING ERRCODE='PT409'; END IF;
   UPDATE erp_private.t09_pod_exceptions SET state=CASE p_action WHEN 'approve-exception' THEN 'approved' ELSE 'rejected' END,
     decided_by=actor,decided_at=clock_timestamp(),decision_reason=decision_note WHERE id=case_row.id;
   IF p_action='reject-exception' THEN
     DELETE FROM erp_private.t09_witness_owners owner USING erp_private.fleet_operation_evidence ev
      WHERE ev.id=case_row.evidence_id AND owner.document_id=ev.document_id AND owner.actual_id=f.id
        AND NOT EXISTS(SELECT 1 FROM erp_private.t09_pod_exceptions accepted
          JOIN erp_private.fleet_operation_evidence original ON original.id=accepted.evidence_id
          WHERE accepted.actual_id=f.id AND accepted.state='approved' AND original.document_id=owner.document_id);
   END IF;
   result:=case_row.id;
 ELSIF p_action='review-rate' THEN
   IF NOT erp_private.t09_independent(f.id,actor)
   THEN RAISE EXCEPTION 'Rate changes require a manager independent from the trip entrant' USING ERRCODE='42501'; END IF;
   basis:=erp_private.t09_leg_basis(f.id);
   IF basis->>'state'<>'rate-review' OR basis->>'route_digest' IS DISTINCT FROM p_data->>'digest'
   THEN RAISE EXCEPTION 'Review the current route, truck type and approved rate' USING ERRCODE='PT409'; END IF;
   INSERT INTO erp_private.t09_rate_reviews(actual_id,rate_id,digest,reviewed_by,reason)
   VALUES(f.id,(basis->>'rate')::bigint,basis->>'route_digest',actor,decision_note) RETURNING id INTO result;
 ELSIF p_action='accept' THEN
   IF NOT erp_private.t09_independent(f.id,actor)
   THEN RAISE EXCEPTION 'An independent Accounts reviewer must accept the allowance' USING ERRCODE='42501'; END IF;
   IF EXISTS(SELECT 1 FROM erp_private.t09_allowance_claims WHERE actual_id=f.id AND kind='base')
   THEN RAISE EXCEPTION 'This leg already has a payroll claim. Use a linked correction for a settled item' USING ERRCODE='PT409'; END IF;
   basis:=erp_private.t09_allowance_basis(f.id);
   IF basis->>'state'<>'ready' THEN RAISE EXCEPTION 'This leg still needs verified delivery or rate review' USING ERRCODE='PT409'; END IF;
   ev:=(basis->>'evidence')::bigint;
   IF NOT erp_private.t09_locked_preview(ev) THEN RAISE EXCEPTION 'Proof access required for payroll review' USING ERRCODE='42501'; END IF;
   IF erp_private.t09_allowance_basis(f.id,ev) IS DISTINCT FROM basis
   THEN RAISE EXCEPTION 'Delivery evidence changed during review' USING ERRCODE='PT409'; END IF;
   v_digest:=erp_private.t02_digest(basis);
   IF v_digest IS DISTINCT FROM p_data->>'digest' THEN RAISE EXCEPTION 'Review the current allowance basis' USING ERRCODE='PT409'; END IF;
   SELECT id INTO result FROM erp_private.t09_allowance_versions WHERE actual_id=f.id AND kind='base' AND digest=v_digest;
   IF result IS NULL THEN
     INSERT INTO erp_private.t09_allowance_versions(actual_id,employee_id,employment_id,employer_id,employer_branch_id,work_day,
       kind,amount,currency,basis,digest,accepted_by,reason)
     VALUES(f.id,a.worker_id,a.employment_id,a.employer_company_id,a.employer_branch_id,(basis->>'day')::date,'base',
       (basis->>'amount')::numeric,basis->>'currency',basis,v_digest,actor,decision_note) RETURNING id INTO result;
   END IF;
 ELSIF p_action='reject-adjustment' THEN
   SELECT * INTO change_row FROM erp_private.t09_allowance_changes WHERE id=(p_data->>'id')::bigint AND actual_id=f.id FOR UPDATE;
   IF change_row.id IS NULL OR change_row.proposed_by=actor OR NOT erp_private.t09_independent(f.id,actor)
   THEN RAISE EXCEPTION 'An independent Accounts decision is required' USING ERRCODE='42501'; END IF;
   IF change_row.decided_at IS NOT NULL THEN RAISE EXCEPTION 'The correction already has a decision' USING ERRCODE='PT409'; END IF;
   UPDATE erp_private.t09_allowance_changes SET decided_at=clock_timestamp(),decided_by=actor,outcome='rejected',decision_reason=decision_note
     WHERE id=change_row.id;
   result:=change_row.id;
 ELSIF p_action='withdraw-adjustment' THEN
   SELECT * INTO candidate FROM erp_private.t09_allowance_versions WHERE id=(p_data->>'id')::bigint AND actual_id=f.id AND kind='adjustment';
   IF NOT erp_private.t09_independent(f.id,actor) THEN RAISE EXCEPTION 'Independent Accounts authority required' USING ERRCODE='42501'; END IF;
   IF candidate.id IS NULL OR candidate.basis->>'mode'<>'reprice' OR erp_private.t09_candidate_current(candidate)
     OR EXISTS(SELECT 1 FROM erp_private.t09_allowance_claims c WHERE c.version_id=candidate.id)
   THEN RAISE EXCEPTION 'Only an unclaimed reprice with changed source facts can be withdrawn' USING ERRCODE='PT409'; END IF;
   INSERT INTO erp_private.t09_adjustment_withdrawals(version_id,withdrawn_by,reason)
     VALUES(candidate.id,actor,decision_note);
   result:=candidate.id;
 ELSE
   SELECT v.* INTO paid FROM erp_private.t09_allowance_claims c JOIN erp_private.t09_allowance_versions v ON v.id=c.version_id
    WHERE c.actual_id=f.id AND c.settled_at IS NOT NULL ORDER BY c.id DESC LIMIT 1;
   IF paid.id IS NULL OR EXISTS(SELECT 1 FROM erp_private.t09_allowance_versions v
      LEFT JOIN erp_private.t09_allowance_claims c ON c.version_id=v.id
      WHERE v.actual_id=f.id AND v.kind='adjustment' AND c.settled_at IS NULL
        AND NOT EXISTS(SELECT 1 FROM erp_private.t09_adjustment_withdrawals w WHERE w.version_id=v.id))
   THEN RAISE EXCEPTION 'A correction requires a settled original and no outstanding adjustment' USING ERRCODE='PT409'; END IF;
   SELECT sum(v.amount) INTO prior_total FROM erp_private.t09_allowance_claims c JOIN erp_private.t09_allowance_versions v ON v.id=c.version_id
    WHERE c.actual_id=f.id AND c.settled_at IS NOT NULL;
   IF p_action='propose-adjustment' THEN
     mode:=p_data->>'mode';
     IF NOT coalesce(mode IN('void','reprice'),false) THEN RAISE EXCEPTION 'Select a reversal or updated approved rate' USING ERRCODE='22023'; END IF;
     IF mode='void' THEN target:=0;
     ELSE
       basis:=erp_private.t09_allowance_basis(f.id);
       IF basis->>'state'<>'ready' OR basis->>'currency' IS DISTINCT FROM paid.currency
       THEN RAISE EXCEPTION 'An approved current basis in the original currency is required' USING ERRCODE='PT409'; END IF;
       target:=(basis->>'amount')::numeric;
     END IF;
     IF target=prior_total THEN RAISE EXCEPTION 'There is no difference to adjust' USING ERRCODE='PT409'; END IF;
     INSERT INTO erp_private.t09_allowance_changes(actual_id,mode,target,previously_settled,currency,basis,proposed_by,reason)
     VALUES(f.id,mode,target,prior_total,paid.currency,basis,actor,decision_note) RETURNING id INTO result;
   ELSE
     SELECT * INTO change_row FROM erp_private.t09_allowance_changes WHERE id=(p_data->>'id')::bigint AND actual_id=f.id FOR UPDATE;
     IF change_row.id IS NULL OR change_row.decided_at IS NOT NULL OR change_row.proposed_by=actor OR NOT erp_private.t09_independent(f.id,actor)
     THEN RAISE EXCEPTION 'An independent Accounts decision is required' USING ERRCODE='42501'; END IF;
     IF change_row.previously_settled IS DISTINCT FROM prior_total OR change_row.currency<>paid.currency
     THEN RAISE EXCEPTION 'Settlement changed during correction' USING ERRCODE='PT409'; END IF;
     IF change_row.mode='reprice' THEN
       ev:=(change_row.basis->>'evidence')::bigint;
       IF NOT erp_private.t09_locked_preview(ev) THEN RAISE EXCEPTION 'Proof access required for payroll adjustment' USING ERRCODE='42501'; END IF;
       IF erp_private.t09_allowance_basis(f.id,ev) IS DISTINCT FROM change_row.basis
       THEN RAISE EXCEPTION 'Current evidence or rate changed during correction' USING ERRCODE='PT409'; END IF;
     END IF;
     basis:=jsonb_build_object('change',change_row.id,'prior',paid.id,'mode',change_row.mode,'target',change_row.target,
       'previously_settled',prior_total,'source',change_row.basis);
     INSERT INTO erp_private.t09_allowance_versions(actual_id,employee_id,employment_id,employer_id,employer_branch_id,work_day,
       kind,amount,currency,basis,digest,prior_version_id,change_id,accepted_by,reason)
     VALUES(f.id,paid.employee_id,paid.employment_id,paid.employer_id,paid.employer_branch_id,paid.work_day,'adjustment',
       change_row.target-prior_total,paid.currency,basis,erp_private.t02_digest(basis),paid.id,change_row.id,actor,decision_note) RETURNING id INTO result;
     UPDATE erp_private.t09_allowance_changes SET decided_by=actor,decided_at=clock_timestamp(),outcome='accepted',decision_reason=decision_note WHERE id=change_row.id;
   END IF;
 END IF;
 RETURN erp_private.t02_save_receipt('fleet-trip-allowance',p_operation,hash,jsonb_build_object('id',result,'action',p_action));
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'An allowance review or correction already exists for this delivery' USING ERRCODE='PT409';
END;
$$;

-- Private consumption/settlement boundary reserved for verified Payroll
-- handoffs. No current application or service-role grant can pay a candidate.
CREATE FUNCTION erp_private.t09_claim_allowance(p_version bigint,p_consumer uuid)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE v erp_private.t09_allowance_versions; saved erp_private.t09_allowance_claims;
 a erp_private.fleet_operation_assignments; result bigint;
BEGIN
 SELECT * INTO v FROM erp_private.t09_allowance_versions WHERE id=p_version;
 IF v.id IS NULL OR p_consumer IS NULL THEN RAISE EXCEPTION 'Exact payroll source required' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM erp_private.fleet_operation_orders o JOIN erp_private.fleet_trip_legs l ON l.order_id=o.id
  JOIN erp_private.fleet_trip_leg_actuals f ON f.leg_id=l.id WHERE f.id=v.actual_id FOR UPDATE OF o;
 PERFORM pg_advisory_xact_lock(hashtextextended('t09-claim:'||p_consumer,0));
 SELECT * INTO saved FROM erp_private.t09_allowance_claims WHERE consumer_key=p_consumer;
 IF saved.id IS NOT NULL THEN
   IF saved.version_id<>p_version THEN RAISE EXCEPTION 'Payroll source changed for this claim' USING ERRCODE='PT409'; END IF;
   RETURN saved.id;
 END IF;
 IF v.kind='base' OR v.basis->>'mode'='reprice' THEN
   SELECT item.* INTO a FROM erp_private.fleet_operation_assignments item JOIN erp_private.fleet_trip_leg_actuals f ON f.assignment_id=item.id
     WHERE f.id=v.actual_id;
   PERFORM 1 FROM erp_private.fleet_assets WHERE id=a.asset_id FOR SHARE;
   PERFORM pg_advisory_xact_lock_shared(hashtextextended('t09-rate-company:'||a.host_company_id,0));
   PERFORM 1 FROM erp_private.fleet_operation_evidence ev JOIN public.dms_documents d ON d.id=ev.document_id
    JOIN public.dms_document_types t ON t.id=d.document_type_id JOIN public.dms_document_versions ver ON ver.id=ev.version_id
    JOIN public.dms_document_files f ON f.id=ev.file_id WHERE ev.id=coalesce((v.basis->>'evidence')::bigint,
       (v.basis#>>'{source,evidence}')::bigint) FOR SHARE OF d,t,ver,f;
 END IF;
 IF erp_private.t09_candidate_current(v) IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'This reviewed allowance needs reconciliation' USING ERRCODE='PT409'; END IF;
 INSERT INTO erp_private.t09_allowance_claims(actual_id,version_id,kind,consumer_key)
 VALUES(v.actual_id,v.id,v.kind,p_consumer) RETURNING id INTO result;
 RETURN result;
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'This leg or adjustment already has a payroll claim' USING ERRCODE='PT409';
END;
$$;

CREATE FUNCTION erp_private.t09_record_allowance_settlement(p_claim bigint,p_settlement uuid)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE claim erp_private.t09_allowance_claims;
BEGIN
 SELECT * INTO claim FROM erp_private.t09_allowance_claims WHERE id=p_claim FOR UPDATE;
 IF claim.id IS NULL OR p_settlement IS NULL OR (claim.settlement_key IS NOT NULL AND claim.settlement_key<>p_settlement)
 THEN RAISE EXCEPTION 'Exact settlement identity required' USING ERRCODE='PT409'; END IF;
 IF claim.settled_at IS NULL THEN UPDATE erp_private.t09_allowance_claims SET settlement_key=p_settlement,settled_at=clock_timestamp() WHERE id=claim.id; END IF;
 RETURN claim.id;
END;
$$;

DO $$
DECLARE relation regclass;
BEGIN
 FOREACH relation IN ARRAY ARRAY['erp_private.t09_allowance_changes'::regclass,'erp_private.t09_allowance_versions','erp_private.t09_allowance_claims',
   'erp_private.t09_adjustment_withdrawals'] LOOP
   EXECUTE format('ALTER TABLE %s ENABLE ROW LEVEL SECURITY',relation);
   EXECUTE format('REVOKE ALL ON %s FROM PUBLIC,anon,authenticated,service_role',relation);
 END LOOP;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.t09_candidate_current(erp_private.t09_allowance_versions),erp_private.t09_payroll_scope(bigint,bigint),
 public.t09_trip_allowance(uuid,bigint,text,jsonb),erp_private.t09_claim_allowance(bigint,uuid),erp_private.t09_record_allowance_settlement(bigint,uuid)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t09_trip_allowance(uuid,bigint,text,jsonb) TO authenticated;
COMMIT;
