BEGIN;

CREATE TABLE erp_private.t12_outside_orders (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 job_cycle_id bigint NOT NULL REFERENCES erp_private.t10_job_cycles(id),
 asset_id bigint NOT NULL REFERENCES erp_private.fleet_assets(id),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 supplier_id bigint NOT NULL REFERENCES public.parties(id),
 reference text NOT NULL,
 comparison_ref text,
 estimate_aed numeric(14,2) NOT NULL CHECK(estimate_aed>=0),
 promised_return timestamptz NOT NULL,
 state text NOT NULL CHECK(state IN('prepared','approved','with-vendor','work-complete','returned','cancelled')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 prepared_by bigint NOT NULL REFERENCES public.user_profiles(id),
 prepared_policy_id bigint NOT NULL REFERENCES erp_private.t11_policies(id),
 approved_by bigint REFERENCES public.user_profiles(id),
 approved_policy_id bigint REFERENCES erp_private.t11_policies(id),
 dispatched_at timestamptz,
 completed_at timestamptz,
 completed_by bigint REFERENCES public.user_profiles(id),
 returned_at timestamptz,
 actual_aed numeric(14,2) CHECK(actual_aed>=0),
 invoice_ref text,
 outcome text CHECK(outcome IN('completed','partial','not-repaired')),
 variance_by bigint REFERENCES public.user_profiles(id),
 UNIQUE(company_id,reference),
 UNIQUE(company_id,supplier_id,invoice_ref),
 CHECK((approved_by IS NULL)=(approved_policy_id IS NULL) AND approved_by IS DISTINCT FROM prepared_by),
 CHECK(completed_at IS NULL OR (dispatched_at IS NOT NULL AND completed_at>=dispatched_at AND completed_by IS NOT NULL AND outcome IS NOT NULL AND actual_aed IS NOT NULL)),
 CHECK(returned_at IS NULL OR (completed_at IS NOT NULL AND returned_at>=completed_at)),
 CHECK(actual_aed IS NULL OR actual_aed=0 OR invoice_ref IS NOT NULL)
);
CREATE INDEX t12_outside_job ON erp_private.t12_outside_orders(job_cycle_id,id);
CREATE UNIQUE INDEX t12_outside_one_open_job_order ON erp_private.t12_outside_orders(job_cycle_id)
 WHERE state IN('prepared','approved','with-vendor','work-complete');
CREATE UNIQUE INDEX t12_outside_one_vendor_custody ON erp_private.t12_outside_orders(asset_id)
 WHERE state IN('with-vendor','work-complete');

CREATE TABLE erp_private.t12_outside_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 outside_id bigint NOT NULL REFERENCES erp_private.t12_outside_orders(id),
 revision integer NOT NULL CHECK(revision>0),
 action text NOT NULL CHECK(action IN('prepare','approve','cancel','dispatch','milestone','complete','return','approve-variance','stage-finance')),
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 occurred_at timestamptz NOT NULL,
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 milestone text,
 document_id bigint UNIQUE REFERENCES public.dms_documents(id),
 version_id bigint UNIQUE REFERENCES public.dms_document_versions(id),
 file_id bigint UNIQUE REFERENCES public.dms_document_files(id),
 UNIQUE(outside_id,revision),
 CHECK((action='milestone')=(milestone IS NOT NULL)),
 CHECK(num_nonnulls(document_id,version_id,file_id)=CASE WHEN action IN('dispatch','complete','return') THEN 3 ELSE 0 END)
);

-- This is a review receipt for the exact signed service cost. No accounting entry is created here.
CREATE TABLE erp_private.t12_outside_finance (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 outside_id bigint NOT NULL UNIQUE REFERENCES erp_private.t12_outside_orders(id),
 source_event_id bigint NOT NULL UNIQUE REFERENCES erp_private.t12_outside_events(id),
 qc_job_revision integer NOT NULL CHECK(qc_job_revision>0),
 amount_aed numeric(14,2) NOT NULL CHECK(amount_aed>0),
 invoice_ref text NOT NULL,
 staged_by bigint NOT NULL REFERENCES public.user_profiles(id),
 staged_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL
);

ALTER TABLE erp_private.t12_outside_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t12_outside_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t12_outside_finance ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t12_outside_orders,erp_private.t12_outside_events,erp_private.t12_outside_finance
 FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.t12_outside_qc_guard() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM erp_private.t12_outside_orders o WHERE o.job_cycle_id=NEW.id
   AND (o.state NOT IN('returned','cancelled') OR o.returned_at>NEW.actual_end)) THEN
  RAISE EXCEPTION 'Complete outside custody and record physical return before Workshop QC' USING ERRCODE='PT409';
 END IF;
 IF NEW.state='closed' AND EXISTS(
  SELECT 1 FROM erp_private.t12_outside_orders o JOIN erp_private.t12_outside_events e ON e.outside_id=o.id
  WHERE o.job_cycle_id=NEW.id AND e.action IN('dispatch','complete','return') AND e.actor_id=NEW.qc_by
 ) THEN
  RAISE EXCEPTION 'An independent Workshop reviewer must release this outside repair' USING ERRCODE='PT409';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER t12_outside_qc_guard BEFORE UPDATE OF state ON erp_private.t10_job_cycles
 FOR EACH ROW WHEN(NEW.state IN('qc','closed') AND OLD.state IS DISTINCT FROM NEW.state)
 EXECUTE FUNCTION erp_private.t12_outside_qc_guard();

CREATE FUNCTION erp_private.t12_outside_retain_evidence() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='dms_document_files' THEN
  IF (TG_OP='DELETE' OR ROW(NEW.document_id,NEW.version_id,NEW.deleted_at,NEW.file_role,NEW.sha256_hash,
     NEW.file_size_bytes,NEW.storage_bucket,NEW.storage_path,NEW.integrity_status) IS DISTINCT FROM
    ROW(OLD.document_id,OLD.version_id,OLD.deleted_at,OLD.file_role,OLD.sha256_hash,
     OLD.file_size_bytes,OLD.storage_bucket,OLD.storage_path,OLD.integrity_status))
   AND EXISTS(SELECT 1 FROM erp_private.t12_outside_events e WHERE e.file_id=OLD.id) THEN
   RAISE EXCEPTION 'Retain the exact signed outside Workshop original' USING ERRCODE='PT409';
  END IF;
 ELSIF TG_TABLE_NAME='dms_document_versions' THEN
  IF (TG_OP='DELETE' OR ROW(NEW.document_id,NEW.unlinked_at) IS DISTINCT FROM ROW(OLD.document_id,OLD.unlinked_at))
    AND EXISTS(SELECT 1 FROM erp_private.t12_outside_events e WHERE e.version_id=OLD.id) THEN
   RAISE EXCEPTION 'Retain the exact outside Workshop version' USING ERRCODE='PT409';
  END IF;
 ELSIF OLD.entity_type='fleet_asset' AND OLD.deleted_at IS NULL
  AND (TG_OP='DELETE' OR NEW.deleted_at IS NOT NULL OR ROW(NEW.document_id,NEW.entity_type,NEW.entity_id)
   IS DISTINCT FROM ROW(OLD.document_id,OLD.entity_type,OLD.entity_id))
  AND EXISTS(SELECT 1 FROM erp_private.t12_outside_events e JOIN erp_private.t12_outside_orders o ON o.id=e.outside_id
   WHERE e.document_id=OLD.document_id AND o.asset_id=OLD.entity_id) THEN
  RAISE EXCEPTION 'Retain the signed outside Workshop evidence association' USING ERRCODE='PT409';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER t12_outside_retain_file BEFORE UPDATE OF document_id,version_id,deleted_at,file_role,sha256_hash,
 file_size_bytes,storage_bucket,storage_path,integrity_status OR DELETE ON public.dms_document_files
 FOR EACH ROW EXECUTE FUNCTION erp_private.t12_outside_retain_evidence();
CREATE TRIGGER t12_outside_retain_version BEFORE UPDATE OF document_id,unlinked_at OR DELETE ON public.dms_document_versions
 FOR EACH ROW EXECUTE FUNCTION erp_private.t12_outside_retain_evidence();
CREATE TRIGGER t12_outside_retain_link BEFORE UPDATE OR DELETE ON public.dms_document_links
 FOR EACH ROW EXECUTE FUNCTION erp_private.t12_outside_retain_evidence();

CREATE FUNCTION public.t12_outside_work(p_operation uuid,p_job bigint,p_action text,p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE job erp_private.t10_job_cycles; assessment erp_private.t10_assessments; work erp_private.t12_outside_orders;
 actor bigint:=public.current_user_profile_id(); cap text; allowed_keys text[]; reason_text text; digest text; receipt jsonb;
 operating record; asset_status text; route bigint; supplier bigint; reference_text text; comparison text;
 promised timestamptz; at_time timestamptz:=statement_timestamp(); event_type text; milestone_text text;
 previous_at timestamptz; evidence jsonb; proof erp_private.t12_outside_events;
 estimate numeric; amount numeric; outcome_text text; invoice_text text; finance_id bigint;
BEGIN
 allowed_keys:=CASE p_action
  WHEN 'prepare' THEN ARRAY['supplier','reference','comparison','promised_return','estimate']
  WHEN 'approve' THEN ARRAY[]::text[]
  WHEN 'cancel' THEN ARRAY[]::text[]
  WHEN 'dispatch' THEN ARRAY['occurred','evidence']
  WHEN 'milestone' THEN ARRAY['occurred','milestone']
  WHEN 'complete' THEN ARRAY['occurred','outcome','actual','invoice','evidence']
  WHEN 'return' THEN ARRAY['occurred','evidence']
  WHEN 'approve-variance' THEN ARRAY[]::text[]
  WHEN 'stage-finance' THEN ARRAY[]::text[]
 END;
 IF p_operation IS NULL OR allowed_keys IS NULL OR NOT erp_private.t05_fields(p_data,
   allowed_keys||CASE WHEN p_action='prepare' THEN ARRAY['reason'] ELSE ARRAY['outside','revision','reason'] END) THEN
  RAISE EXCEPTION 'Select a valid outside Workshop action' USING ERRCODE='22023';
 END IF;
 reason_text:=erp_private.t10_text(p_data,'reason',1000);
 cap:=CASE WHEN p_action IN('approve','approve-variance') THEN 'supply.purchase.approve'
  WHEN p_action='stage-finance' THEN 'workshop.finance.intake' ELSE 'workshop.outside.manage' END;
 SELECT a.* INTO assessment FROM erp_private.t10_job_cycles j
 JOIN erp_private.t10_assessments a ON a.id=j.assessment_id WHERE j.id=p_job;
 IF actor IS NULL OR assessment.id IS NULL OR NOT erp_private.t05_scope(cap,assessment.company_id,assessment.branch_id) THEN
  RAISE EXCEPTION 'Outside Workshop action unavailable in this scope' USING ERRCODE='42501';
 END IF;
 -- All repair-state writers acquire the asset first, then the exact assessment and job.
 SELECT status INTO asset_status FROM erp_private.fleet_assets WHERE id=assessment.asset_id FOR UPDATE;
 SELECT * INTO assessment FROM erp_private.t10_assessments a WHERE id=assessment.id FOR UPDATE;
 SELECT * INTO job FROM erp_private.t10_job_cycles j WHERE j.id=p_job AND j.assessment_id=assessment.id FOR UPDATE;
 PERFORM erp_private.t11_scope(cap,assessment.company_id,assessment.branch_id);
 IF p_action='prepare' THEN PERFORM erp_private.t11_scope('supply.purchase',assessment.company_id,assessment.branch_id); END IF;
 digest:=erp_private.t02_digest(jsonb_build_array(p_job,p_action,p_data));
 receipt:=erp_private.t02_replay('workshop-t12-outside',p_operation,digest);
 IF receipt IS NOT NULL THEN RETURN receipt; END IF;
 IF p_action<>'prepare' THEN
  SELECT * INTO work FROM erp_private.t12_outside_orders o
   WHERE o.id=(p_data->>'outside')::bigint AND o.job_cycle_id=job.id FOR UPDATE;
  IF work.id IS NULL OR work.revision IS DISTINCT FROM (p_data->>'revision')::integer THEN
   RAISE EXCEPTION 'Reload the current outside Workshop record' USING ERRCODE='PT409';
  END IF;
 END IF;

 IF p_action IN('prepare','approve','dispatch','approve-variance') THEN
  PERFORM erp_private.t11_pilot(assessment.company_id,assessment.branch_id,'purchasing');
  SELECT p.id INTO route FROM erp_private.t11_policies p WHERE p.company_id=assessment.company_id
   AND p.branch_id=assessment.branch_id AND p.domain='purchasing' AND p.decided_at IS NOT NULL ORDER BY p.id DESC LIMIT 1;
 END IF;
 IF p_action IN('prepare','approve','dispatch') THEN
  SELECT * INTO operating FROM erp_private.t06_operation_scope(assessment.asset_id);
  IF asset_status<>'active' OR ROW(operating.company_id,operating.branch_id) IS DISTINCT FROM ROW(assessment.company_id,assessment.branch_id)
   OR NOT EXISTS(SELECT 1 FROM erp_private.fleet_asset_holds h WHERE h.id=job.hold_id AND h.released_at IS NULL) THEN
   RAISE EXCEPTION 'Use the active repair hold in the current operating scope' USING ERRCODE='PT409';
  END IF;
 END IF;

 IF p_action='prepare' THEN
  supplier:=(p_data->>'supplier')::bigint;
  reference_text:=erp_private.t11_key(p_data,'reference',150);
  comparison:=nullif(btrim(p_data->>'comparison'),'');
  promised:=(p_data->>'promised_return')::timestamptz;
  estimate:=erp_private.t10_amount(p_data,'estimate');
  IF job.state NOT IN('planned','in-progress') OR promised IS NULL OR NOT isfinite(promised)
   OR promised<assessment.occurred_at THEN
   RAISE EXCEPTION 'Use a planned or active repair job and a valid promised return time' USING ERRCODE='PT409';
  END IF;
  IF length(comparison)>150 OR (comparison IS NOT NULL AND jsonb_typeof(p_data->'comparison') IS DISTINCT FROM 'string')
   OR NOT erp_private.t11_supplier_ready(supplier,assessment.company_id,assessment.branch_id,comparison) THEN
   RAISE EXCEPTION 'Select a currently approved Party Master vendor and its required comparison' USING ERRCODE='PT409';
  END IF;
  INSERT INTO erp_private.t12_outside_orders(job_cycle_id,asset_id,company_id,branch_id,supplier_id,reference,
    comparison_ref,estimate_aed,promised_return,state,prepared_by,prepared_policy_id)
  VALUES(job.id,assessment.asset_id,assessment.company_id,assessment.branch_id,supplier,reference_text,
    comparison,estimate,promised,'prepared',actor,route)
  ON CONFLICT DO NOTHING RETURNING * INTO work;
  IF work.id IS NULL THEN
   RAISE EXCEPTION 'This commitment reference or an open outside order already exists' USING ERRCODE='PT409';
  END IF;
 ELSIF p_action='approve' THEN
  IF work.state<>'prepared' OR job.state NOT IN('planned','in-progress') OR actor=work.prepared_by
   OR NOT erp_private.t11_supplier_ready(work.supplier_id,work.company_id,work.branch_id,work.comparison_ref) THEN
   RAISE EXCEPTION 'Use independent approval for a current, eligible outside commitment' USING ERRCODE='PT409';
  END IF;
  UPDATE erp_private.t12_outside_orders o SET state='approved',approved_by=actor,approved_policy_id=route
   WHERE o.id=work.id RETURNING * INTO work;
 ELSIF p_action='cancel' THEN
  IF work.state NOT IN('prepared','approved') THEN
   RAISE EXCEPTION 'Record physical vendor return for an order already handed over' USING ERRCODE='PT409';
  END IF;
  IF work.state='approved' THEN
   PERFORM erp_private.t11_scope('supply.purchase.approve',assessment.company_id,assessment.branch_id);
  END IF;
  UPDATE erp_private.t12_outside_orders o SET state='cancelled' WHERE o.id=work.id RETURNING * INTO work;
 ELSIF p_action='approve-variance' THEN
  IF work.state NOT IN('work-complete','returned') OR work.actual_aed<=work.estimate_aed OR work.variance_by IS NOT NULL
   OR actor IN(work.prepared_by,work.completed_by) THEN
   RAISE EXCEPTION 'An independent purchasing reviewer must authorize the evidenced variance' USING ERRCODE='PT409';
  END IF;
  UPDATE erp_private.t12_outside_orders o SET variance_by=actor WHERE o.id=work.id RETURNING * INTO work;
 ELSIF p_action='stage-finance' THEN
  SELECT e.* INTO proof FROM erp_private.t12_outside_events e WHERE e.outside_id=work.id AND e.action='complete';
  IF job.state<>'closed' OR work.state<>'returned' OR work.actual_aed<=0 OR work.invoice_ref IS NULL
   OR (work.actual_aed>work.estimate_aed AND work.variance_by IS NULL)
   OR actor IN(work.prepared_by,work.completed_by,work.approved_by,coalesce(work.variance_by,work.approved_by))
   OR proof.id IS NULL OR NOT erp_private.document_permission(proof.document_id,'dms.documents.preview') THEN
   RAISE EXCEPTION 'An independent Finance reviewer needs the verified service cost and closed Workshop QC' USING ERRCODE='PT409';
  END IF;
  INSERT INTO erp_private.t12_outside_finance(outside_id,source_event_id,qc_job_revision,amount_aed,invoice_ref,staged_by,reason)
  VALUES(work.id,proof.id,job.revision,work.actual_aed,work.invoice_ref,actor,reason_text)
  ON CONFLICT(outside_id) DO NOTHING RETURNING id INTO finance_id;
  IF finance_id IS NULL THEN RAISE EXCEPTION 'A Finance review receipt already exists' USING ERRCODE='PT409'; END IF;
 ELSE
  IF job.state<>'in-progress' OR NOT EXISTS(SELECT 1 FROM erp_private.fleet_asset_holds h WHERE h.id=job.hold_id AND h.released_at IS NULL) THEN
   RAISE EXCEPTION 'Start and retain the technical hold on this Workshop job' USING ERRCODE='PT409';
  END IF;
  IF (p_action='dispatch' AND (work.state<>'approved' OR work.approved_policy_id<>route
     OR NOT erp_private.t11_supplier_ready(work.supplier_id,work.company_id,work.branch_id,work.comparison_ref)))
   OR (p_action IN('milestone','complete') AND work.state<>'with-vendor')
   OR (p_action='return' AND work.state<>'work-complete') THEN
   RAISE EXCEPTION 'Complete the preceding authorized vendor custody step first' USING ERRCODE='PT409';
  END IF;
  SELECT max(e.occurred_at) INTO previous_at FROM erp_private.t12_outside_events e
   WHERE e.outside_id=work.id AND e.action IN('approve','dispatch','milestone','complete','return');
  at_time:=(p_data->>'occurred')::timestamptz;
  IF at_time IS NULL OR NOT isfinite(at_time) OR at_time>statement_timestamp()
    OR at_time<greatest(previous_at,job.actual_start,assessment.occurred_at) THEN
   RAISE EXCEPTION 'Enter an actual vendor event time in custody sequence' USING ERRCODE='22023';
  END IF;
  IF p_action='milestone' THEN
   milestone_text:=erp_private.t10_text(p_data,'milestone',500);
  ELSE
   event_type:=CASE p_action WHEN 'dispatch' THEN 'FLEET_WORKSHOP_OUTSIDE_HANDOVER'
    WHEN 'complete' THEN 'FLEET_WORKSHOP_OUTSIDE_SERVICE' ELSE 'FLEET_WORKSHOP_OUTSIDE_RETURN' END;
   evidence:=p_data->'evidence';
   IF NOT erp_private.t10_original(assessment.asset_id,evidence,ARRAY[event_type]) THEN
    RAISE EXCEPTION 'Select the exact verified signed original for this asset and custody step' USING ERRCODE='PT409';
   END IF;
   IF p_action='complete' THEN
    amount:=erp_private.t10_amount(p_data,'actual');
    outcome_text:=p_data->>'outcome';
    IF amount>0 OR p_data->>'invoice' IS NOT NULL THEN invoice_text:=erp_private.t11_key(p_data,'invoice',150); END IF;
    IF coalesce(outcome_text,'') NOT IN('completed','partial','not-repaired') THEN
     RAISE EXCEPTION 'Record the supplier work outcome shown in the service original' USING ERRCODE='22023';
    END IF;
   END IF;
   UPDATE erp_private.t12_outside_orders o SET
    state=CASE p_action WHEN 'dispatch' THEN 'with-vendor' WHEN 'complete' THEN 'work-complete' ELSE 'returned' END,
    dispatched_at=CASE WHEN p_action='dispatch' THEN at_time ELSE o.dispatched_at END,
    completed_at=CASE WHEN p_action='complete' THEN at_time ELSE o.completed_at END,
    completed_by=CASE WHEN p_action='complete' THEN actor ELSE o.completed_by END,
    returned_at=CASE WHEN p_action='return' THEN at_time ELSE o.returned_at END,
    actual_aed=coalesce(amount,o.actual_aed),invoice_ref=coalesce(invoice_text,o.invoice_ref),outcome=coalesce(outcome_text,o.outcome)
   WHERE o.id=work.id RETURNING * INTO work;
  END IF;
 END IF;

 IF p_action<>'prepare' THEN
  UPDATE erp_private.t12_outside_orders o SET revision=o.revision+1 WHERE o.id=work.id RETURNING * INTO work;
 END IF;
 INSERT INTO erp_private.t12_outside_events(outside_id,revision,action,actor_id,occurred_at,reason,milestone,document_id,version_id,file_id)
 VALUES(work.id,work.revision,p_action,actor,at_time,reason_text,milestone_text,
   (evidence->>'document')::bigint,(evidence->>'version')::bigint,(evidence->>'file')::bigint);
 RETURN erp_private.t02_save_receipt('workshop-t12-outside',p_operation,digest,jsonb_build_object(
  'id',work.id,'job',job.id,'revision',work.revision,'state',work.state,'finance_receipt',finance_id));
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'The custody, supplier invoice or signed original has already been recorded' USING ERRCODE='PT409';
END $$;

CREATE FUNCTION public.t12_outside_workspace(p_job bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $$
DECLARE job erp_private.t10_job_cycles; assessment erp_private.t10_assessments; actor bigint:=public.current_user_profile_id();
 manage boolean; approval boolean; prepare boolean; finance boolean; technical boolean; costs boolean;
 orders jsonb; vendors jsonb; documents jsonb;
BEGIN
 SELECT * INTO job FROM erp_private.t10_job_cycles j WHERE j.id=p_job;
 SELECT * INTO assessment FROM erp_private.t10_assessments a WHERE a.id=job.assessment_id;
 IF assessment.id IS NULL OR actor IS NULL THEN RETURN NULL; END IF;
 manage:=erp_private.t05_scope('workshop.outside.manage',assessment.company_id,assessment.branch_id);
 approval:=erp_private.t05_scope('supply.purchase.approve',assessment.company_id,assessment.branch_id);
 finance:=erp_private.t05_scope('workshop.finance.intake',assessment.company_id,assessment.branch_id);
 technical:=erp_private.t05_scope('workshop.jobs.release',assessment.company_id,assessment.branch_id);
 IF NOT (manage OR approval OR finance OR technical) THEN RETURN NULL; END IF;
 prepare:=manage AND erp_private.t05_scope('supply.purchase',assessment.company_id,assessment.branch_id);
 costs:=manage OR approval OR finance;

 IF prepare THEN
  SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.name,v.id),'[]') INTO vendors FROM (
   SELECT p.id,p.display_name AS name,profile.requires_comparison
   FROM public.parties p JOIN public.party_vendor_profiles profile ON profile.party_id=p.id AND profile.can_create_po
   JOIN public.party_approval_statuses approval_status ON approval_status.id=profile.vendor_approval_status_id
    AND approval_status.is_active AND upper(approval_status.approval_status_code)='APPROVED'
   WHERE p.is_active AND erp_private.t11_party(p.id,assessment.company_id,assessment.branch_id)
   ORDER BY p.display_name,p.id LIMIT 100
  ) v;
 END IF;
 IF manage THEN
  SELECT coalesce(jsonb_agg(to_jsonb(candidate) ORDER BY candidate.file DESC),'[]') INTO documents FROM (
   SELECT d.id AS document,v.id AS version,f.id AS file,d.document_no AS number,d.title,t.type_code AS type
   FROM erp_private.fleet_document_parents parent JOIN public.dms_documents d ON d.id=parent.document_id
   JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.deleted_at IS NULL
   JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
   JOIN public.dms_document_files f ON f.document_id=d.id AND f.version_id=v.id AND f.file_role='original'
    AND f.deleted_at IS NULL AND f.integrity_status='verified' AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$'
   JOIN public.dms_document_links l ON l.document_id=d.id AND l.entity_type='fleet_asset'
    AND l.entity_id=assessment.asset_id AND l.deleted_at IS NULL
   WHERE parent.asset_id=assessment.asset_id AND d.status='active' AND d.deleted_at IS NULL AND NOT d.is_archived
    AND t.type_code IN('FLEET_WORKSHOP_OUTSIDE_HANDOVER','FLEET_WORKSHOP_OUTSIDE_SERVICE','FLEET_WORKSHOP_OUTSIDE_RETURN')
    AND NOT EXISTS(SELECT 1 FROM erp_private.t12_outside_events used WHERE used.document_id=d.id)
    AND erp_private.document_permission(d.id,'dms.documents.preview')
   ORDER BY f.id DESC LIMIT 80
  ) candidate;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',o.id,'revision',o.revision,'state',o.state,'supplier',CASE WHEN costs THEN o.supplier_id END,
  'supplier_name',CASE WHEN costs AND erp_private.t11_party(o.supplier_id,o.company_id,o.branch_id) THEN p.display_name END,
  'reference',o.reference,'comparison',CASE WHEN costs THEN o.comparison_ref END,'promised_return',o.promised_return,
  'estimate',CASE WHEN costs THEN o.estimate_aed END,'actual',CASE WHEN costs THEN o.actual_aed END,
  'invoice',CASE WHEN costs THEN o.invoice_ref END,'outcome',o.outcome,'dispatched',o.dispatched_at,
  'completed',o.completed_at,'returned',o.returned_at,
  'late',o.state NOT IN('cancelled','prepared') AND coalesce(o.returned_at,statement_timestamp())>o.promised_return,
  'can_approve',approval AND o.state='prepared' AND actor<>o.prepared_by,
  'can_approve_variance',approval AND o.state IN('work-complete','returned') AND o.actual_aed>o.estimate_aed
   AND o.variance_by IS NULL AND actor NOT IN(o.prepared_by,o.completed_by),
  'can_stage_finance',finance AND job.state='closed' AND o.state='returned' AND o.actual_aed>0
   AND (o.actual_aed<=o.estimate_aed OR o.variance_by IS NOT NULL) AND f.id IS NULL
   AND actor NOT IN(o.prepared_by,o.completed_by,o.approved_by,coalesce(o.variance_by,o.approved_by))
   AND erp_private.document_permission(service_proof.document_id,'dms.documents.preview'),
  'finance_receipt',CASE WHEN finance AND f.id IS NOT NULL THEN
    jsonb_build_object('id',f.id,'state','staged','amount',f.amount_aed,'invoice',f.invoice_ref,'at',f.staged_at) END,
  'events',(SELECT coalesce(jsonb_agg(jsonb_build_object('action',e.action,'at',e.occurred_at,'recorded_at',e.recorded_at,
    'reason',CASE WHEN costs OR e.action NOT IN('prepare','approve','complete','approve-variance') THEN e.reason END,
    'milestone',e.milestone,'by',profile.full_name,
    'proof',CASE WHEN erp_private.document_permission(e.document_id,'dms.documents.preview')
     THEN jsonb_build_object('document',e.document_id,'version',e.version_id,'file',e.file_id) END)
    ORDER BY e.revision),'[]') FROM erp_private.t12_outside_events e
    JOIN public.user_profiles profile ON profile.id=e.actor_id
    WHERE e.outside_id=o.id AND (finance OR e.action<>'stage-finance'))
 ) ORDER BY o.id DESC),'[]') INTO orders
 FROM erp_private.t12_outside_orders o JOIN public.parties p ON p.id=o.supplier_id
 LEFT JOIN erp_private.t12_outside_finance f ON f.outside_id=o.id
 LEFT JOIN erp_private.t12_outside_events service_proof ON service_proof.outside_id=o.id AND service_proof.action='complete'
 WHERE o.job_cycle_id=job.id;
 RETURN jsonb_build_object('job',job.id,'job_state',job.state,'manage',manage,'prepare',prepare,'approve',approval,'finance',finance,
  'custody_open',EXISTS(SELECT 1 FROM erp_private.t12_outside_orders o WHERE o.job_cycle_id=job.id AND o.state IN('with-vendor','work-complete')),
  'qc_blocked',EXISTS(SELECT 1 FROM erp_private.t12_outside_orders o WHERE o.job_cycle_id=job.id AND o.state NOT IN('returned','cancelled')),
  'documents',coalesce(documents,'[]'),'vendors',coalesce(vendors,'[]'),'orders',orders);
END $$;

REVOKE ALL ON FUNCTION erp_private.t12_outside_qc_guard(),erp_private.t12_outside_retain_evidence(),
 public.t12_outside_work(uuid,bigint,text,jsonb),public.t12_outside_workspace(bigint)
 FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t12_outside_work(uuid,bigint,text,jsonb),public.t12_outside_workspace(bigint) TO authenticated;

COMMIT;
