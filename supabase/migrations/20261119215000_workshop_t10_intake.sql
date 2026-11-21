BEGIN;

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('fleet.inspections.report','Report Fleet inspection findings','fleet','report_inspection','held'),
 ('workshop.assess','Assess Fleet defects and decide repair','workshop','assess','held'),
 ('workshop.jobs.manage','Plan and record Workshop work','workshop','manage_jobs','held'),
 ('workshop.jobs.release','Review Workshop QC and technical release','workshop','release_job','held'),
 ('fleet.maintenance.manage','Configure Fleet service clocks and record readings','fleet','maintenance','held'),
 ('hr.workshop.referrals.view','Review referred employee responsibility evidence','hr','workshop_referral','held');

CREATE TABLE erp_private.t10_assessments (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 asset_id bigint NOT NULL REFERENCES erp_private.fleet_assets(id),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 source_kind text NOT NULL CHECK(source_kind IN('custody-return','dispatch-inspection','inspection','incident','reported-failure','planned-service')),
 source_ref text NOT NULL CHECK(length(btrim(source_ref)) BETWEEN 1 AND 150),
 custody_event_id bigint UNIQUE REFERENCES erp_private.fleet_custody_events(id),
 inspection_id bigint UNIQUE REFERENCES erp_private.fleet_operation_evidence(id),
 commitment_id bigint REFERENCES erp_private.fleet_commitments(id),
 service_clock_id bigint,
 service_version_id bigint,
 document_id bigint REFERENCES public.dms_documents(id),
 version_id bigint REFERENCES public.dms_document_versions(id),
 file_id bigint REFERENCES public.dms_document_files(id),
 occurred_at timestamptz NOT NULL,
 reported_by bigint NOT NULL REFERENCES public.user_profiles(id),
 finding text NOT NULL,
 first_hold_id bigint NOT NULL UNIQUE REFERENCES erp_private.fleet_asset_holds(id),
 outcome text CHECK(outcome IN('usable-as-is','repair')),
 assessed_by bigint REFERENCES public.user_profiles(id),
 assessed_at timestamptz,
 diagnosis text,
 UNIQUE(asset_id,source_kind,source_ref),
 CHECK((outcome IS NULL)=(assessed_by IS NULL) AND (outcome IS NULL)=(assessed_at IS NULL) AND (outcome IS NULL)=(diagnosis IS NULL)),
 CHECK((document_id IS NULL)=(version_id IS NULL) AND (document_id IS NULL)=(file_id IS NULL)),
 CHECK((source_kind='planned-service')=(service_clock_id IS NOT NULL) AND (service_clock_id IS NULL)=(service_version_id IS NULL)),
 CHECK((source_kind='custody-return')=(custody_event_id IS NOT NULL)),
 CHECK((source_kind='dispatch-inspection')=(inspection_id IS NOT NULL))
);
CREATE INDEX t10_assessment_scope ON erp_private.t10_assessments(company_id,branch_id,id DESC);
CREATE INDEX t10_assessment_asset ON erp_private.t10_assessments(asset_id,id DESC);

CREATE TABLE erp_private.t10_job_cycles (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 assessment_id bigint NOT NULL REFERENCES erp_private.t10_assessments(id),
 cycle integer NOT NULL CHECK(cycle>0),
 hold_id bigint NOT NULL UNIQUE REFERENCES erp_private.fleet_asset_holds(id),
 state text NOT NULL CHECK(state IN('triage','planned','in-progress','qc','closed')),
 revision integer NOT NULL DEFAULT 1 CHECK(revision>0),
 opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 opened_by bigint NOT NULL REFERENCES public.user_profiles(id),
 scope_of_work text NOT NULL,
 assigned_employee_id bigint REFERENCES public.employees(id),
 planned_start timestamptz,
 planned_end timestamptz,
 estimate_aed numeric(14,2) CHECK(estimate_aed>=0),
 actual_start timestamptz,
 actual_end timestamptz,
 actual_work text,
 actual_cost_aed numeric(14,2) CHECK(actual_cost_aed>=0),
 warranty_ref text,
 warranty_until date,
 submitted_by bigint REFERENCES public.user_profiles(id),
 qc_by bigint REFERENCES public.user_profiles(id),
 qc_notes text,
 returned_at timestamptz,
 return_document_id bigint UNIQUE REFERENCES public.dms_documents(id),
 return_version_id bigint REFERENCES public.dms_document_versions(id),
 return_file_id bigint REFERENCES public.dms_document_files(id),
 closed_at timestamptz,
 UNIQUE(assessment_id,cycle),
 CHECK(planned_end IS NULL OR planned_end>planned_start),
 CHECK(actual_end IS NULL OR actual_end>actual_start),
 CHECK((warranty_ref IS NULL)=(warranty_until IS NULL)),
 CHECK((state='closed')=(closed_at IS NOT NULL))
);

CREATE TABLE erp_private.t10_job_events (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 job_cycle_id bigint NOT NULL REFERENCES erp_private.t10_job_cycles(id),
 revision integer NOT NULL,
 operation text NOT NULL,
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 occurred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL,
 facts jsonb NOT NULL,
 UNIQUE(job_cycle_id,revision)
);

CREATE TABLE erp_private.t10_hr_referrals (
 assessment_id bigint PRIMARY KEY REFERENCES erp_private.t10_assessments(id),
 employee_id bigint NOT NULL REFERENCES public.employees(id),
 employment_id bigint NOT NULL REFERENCES erp_private.t03_employment_periods(id),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 referred_by bigint NOT NULL REFERENCES public.user_profiles(id),
 referred_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text NOT NULL
);
CREATE INDEX t10_referral_scope ON erp_private.t10_hr_referrals(company_id,branch_id,assessment_id DESC);

ALTER TABLE erp_private.t10_assessments ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t10_job_cycles ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t10_job_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t10_hr_referrals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t10_assessments,erp_private.t10_job_cycles,
 erp_private.t10_job_events,erp_private.t10_hr_referrals FROM PUBLIC,anon,authenticated,service_role;

-- T06 already writes the return and its hold in the same asset transaction.
CREATE FUNCTION erp_private.t10_capture_return() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 INSERT INTO erp_private.t10_assessments(asset_id,company_id,branch_id,source_kind,source_ref,custody_event_id,
  commitment_id,document_id,version_id,file_id,occurred_at,reported_by,finding,first_hold_id)
 SELECT c.asset_id,c.company_id,c.branch_id,'custody-return',e.id::text,e.id,c.id,e.evidence_document_id,
  e.evidence_version_id,e.evidence_file_id,e.occurred_at,e.actor_id,e.reason,NEW.id
 FROM erp_private.fleet_commitments c JOIN erp_private.fleet_custody_events e ON e.commitment_id=c.id
 WHERE c.id=NEW.source_commitment_id AND c.asset_id=NEW.asset_id AND e.kind='return' AND e.discrepancy
 ON CONFLICT(custody_event_id) DO NOTHING;
 RETURN NEW;
END;
$$;
CREATE TRIGGER t10_capture_return AFTER INSERT ON erp_private.fleet_asset_holds
 FOR EACH ROW WHEN(NEW.kind='workshop' AND NEW.source_commitment_id IS NOT NULL)
 EXECUTE FUNCTION erp_private.t10_capture_return();

-- Existing unresolved signed returns enter the queue with their existing hold.
INSERT INTO erp_private.t10_assessments(asset_id,company_id,branch_id,source_kind,source_ref,custody_event_id,
 commitment_id,document_id,version_id,file_id,occurred_at,reported_by,finding,first_hold_id)
SELECT c.asset_id,c.company_id,c.branch_id,'custody-return',e.id::text,e.id,c.id,e.evidence_document_id,
 e.evidence_version_id,e.evidence_file_id,e.occurred_at,e.actor_id,e.reason,h.id
FROM erp_private.fleet_asset_holds h
JOIN erp_private.fleet_commitments c ON c.id=h.source_commitment_id AND c.asset_id=h.asset_id
JOIN erp_private.fleet_custody_events e ON e.commitment_id=c.id AND e.kind='return' AND e.discrepancy
WHERE h.kind='workshop' AND h.released_at IS NULL
ORDER BY h.id ON CONFLICT(custody_event_id) DO NOTHING;

CREATE FUNCTION erp_private.t10_capture_dispatch() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE p erp_private.fleet_operation_evidence; hold bigint; note text;
BEGIN
 SELECT * INTO p FROM erp_private.fleet_operation_evidence
 WHERE assignment_id=NEW.id AND order_id=NEW.order_id AND purpose='pre-trip' ORDER BY id DESC LIMIT 1;
 IF p.id IS NULL THEN RAISE EXCEPTION 'Record the failed inspection evidence first' USING ERRCODE='PT409'; END IF;
 IF EXISTS(SELECT 1 FROM erp_private.t10_assessments WHERE inspection_id=p.id) THEN RETURN NEW; END IF;
 note:='Failed pre-trip inspection '||p.paper_reference;
 INSERT INTO erp_private.fleet_asset_holds(asset_id,kind,placed_at,placed_by,reason)
 VALUES(NEW.asset_id,'workshop',clock_timestamp(),p.recorded_by,note) RETURNING id INTO hold;
 INSERT INTO erp_private.t10_assessments(asset_id,company_id,branch_id,source_kind,source_ref,inspection_id,commitment_id,
  document_id,version_id,file_id,occurred_at,reported_by,finding,first_hold_id)
 SELECT NEW.asset_id,o.company_id,o.branch_id,'dispatch-inspection',p.id::text,p.id,NEW.reservation_id,
  p.document_id,p.version_id,p.file_id,NEW.inspected_at,p.recorded_by,note,hold
 FROM erp_private.fleet_operation_orders o WHERE o.id=NEW.order_id;
 RETURN NEW;
END;
$$;
CREATE TRIGGER t10_capture_dispatch AFTER UPDATE OF inspected_at,inspection_passed ON erp_private.fleet_operation_assignments
 FOR EACH ROW WHEN(NEW.inspection_passed IS FALSE AND NEW.inspected_at IS NOT NULL)
 EXECUTE FUNCTION erp_private.t10_capture_dispatch();

-- Unresolved pre-trip failures already retained by T07 need the same workflow.
UPDATE erp_private.fleet_operation_assignments a SET inspected_at=a.inspected_at
WHERE a.state='planned' AND a.inspection_passed=false AND a.inspected_at IS NOT NULL
  AND EXISTS(SELECT 1 FROM erp_private.fleet_operation_evidence e
    WHERE e.assignment_id=a.id AND e.order_id=a.order_id AND e.purpose='pre-trip');

CREATE FUNCTION erp_private.t10_guard_release() RETURNS trigger
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM erp_private.t10_assessments a WHERE a.first_hold_id=OLD.id
    AND (a.outcome IS DISTINCT FROM 'usable-as-is' AND NOT EXISTS(
      SELECT 1 FROM erp_private.t10_job_cycles j WHERE j.hold_id=OLD.id AND j.state='closed')))
 OR EXISTS(SELECT 1 FROM erp_private.t10_job_cycles j WHERE j.hold_id=OLD.id AND j.state<>'closed')
 THEN RAISE EXCEPTION 'Complete the linked Workshop assessment or QC to release this hold' USING ERRCODE='PT409'; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER t10_guard_release BEFORE UPDATE OF released_at ON erp_private.fleet_asset_holds
 FOR EACH ROW WHEN(OLD.released_at IS NULL AND NEW.released_at IS NOT NULL AND OLD.kind='workshop')
 EXECUTE FUNCTION erp_private.t10_guard_release();

CREATE FUNCTION erp_private.t10_original(p_asset bigint,p_evidence jsonb,p_types text[]) RETURNS boolean
LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF NOT erp_private.t05_fields(p_evidence,ARRAY['document','version','file']) THEN RETURN false; END IF;
 PERFORM 1 FROM public.dms_documents d
 JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.deleted_at IS NULL AND t.type_code=ANY(p_types)
 JOIN erp_private.fleet_document_parents p ON p.document_id=d.id AND p.asset_id=p_asset
 JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
 JOIN public.dms_document_files f ON f.document_id=d.id AND f.version_id=v.id AND f.file_role='original'
  AND f.deleted_at IS NULL AND f.integrity_status='verified' AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$'
 JOIN public.dms_document_links l ON l.document_id=d.id AND l.entity_type='fleet_asset'
  AND l.entity_id=p_asset AND l.deleted_at IS NULL
 WHERE d.id=(p_evidence->>'document')::bigint AND v.id=(p_evidence->>'version')::bigint
  AND f.id=(p_evidence->>'file')::bigint AND d.deleted_at IS NULL AND NOT d.is_archived AND d.status='active'
  AND erp_private.document_permission(d.id,'dms.documents.preview')
 FOR SHARE OF d,v,f,l;
 RETURN FOUND;
END;
$$;

CREATE FUNCTION erp_private.t10_retain_document_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF OLD.entity_type='fleet_asset' AND OLD.deleted_at IS NULL
 AND (TG_OP='DELETE' OR NEW.deleted_at IS NOT NULL OR ROW(NEW.entity_id,NEW.entity_type,NEW.document_id)
    IS DISTINCT FROM ROW(OLD.entity_id,OLD.entity_type,OLD.document_id))
 AND (EXISTS(SELECT 1 FROM erp_private.t10_assessments a WHERE a.document_id=OLD.document_id AND a.asset_id=OLD.entity_id)
  OR EXISTS(SELECT 1 FROM erp_private.t10_job_cycles j JOIN erp_private.t10_assessments a ON a.id=j.assessment_id
   WHERE j.return_document_id=OLD.document_id AND a.asset_id=OLD.entity_id))
 THEN RAISE EXCEPTION 'Retain the Workshop evidence association' USING ERRCODE='PT409'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER t10_retain_document_link BEFORE UPDATE OR DELETE ON public.dms_document_links
 FOR EACH ROW EXECUTE FUNCTION erp_private.t10_retain_document_link();

CREATE INDEX t10_assessment_proof_file ON erp_private.t10_assessments(file_id) WHERE file_id IS NOT NULL;
CREATE INDEX t10_assessment_proof_version ON erp_private.t10_assessments(version_id) WHERE version_id IS NOT NULL;
CREATE INDEX t10_assessment_proof_document ON erp_private.t10_assessments(document_id) WHERE document_id IS NOT NULL;
CREATE INDEX t10_job_proof_file ON erp_private.t10_job_cycles(return_file_id) WHERE return_file_id IS NOT NULL;
CREATE INDEX t10_job_proof_version ON erp_private.t10_job_cycles(return_version_id) WHERE return_version_id IS NOT NULL;
CREATE INDEX t10_job_proof_document ON erp_private.t10_job_cycles(return_document_id) WHERE return_document_id IS NOT NULL;

CREATE FUNCTION erp_private.t10_retain_original() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='dms_document_files' THEN
  IF (TG_OP='DELETE' OR ROW(NEW.document_id,NEW.version_id,NEW.deleted_at,NEW.file_role,NEW.sha256_hash,
      NEW.file_size_bytes,NEW.storage_bucket,NEW.storage_path,NEW.integrity_status) IS DISTINCT FROM
    ROW(OLD.document_id,OLD.version_id,OLD.deleted_at,OLD.file_role,OLD.sha256_hash,
      OLD.file_size_bytes,OLD.storage_bucket,OLD.storage_path,OLD.integrity_status))
   AND (EXISTS(SELECT 1 FROM erp_private.t10_assessments a WHERE a.file_id=OLD.id)
     OR EXISTS(SELECT 1 FROM erp_private.t10_job_cycles j WHERE j.return_file_id=OLD.id)) THEN
   RAISE EXCEPTION 'Retain the exact signed Workshop original' USING ERRCODE='PT409';
  END IF;
 ELSE
  IF (TG_OP='DELETE' OR ROW(NEW.document_id,NEW.unlinked_at) IS DISTINCT FROM ROW(OLD.document_id,OLD.unlinked_at))
   AND (EXISTS(SELECT 1 FROM erp_private.t10_assessments a WHERE a.version_id=OLD.id)
     OR EXISTS(SELECT 1 FROM erp_private.t10_job_cycles j WHERE j.return_version_id=OLD.id)) THEN
   RAISE EXCEPTION 'Retain the signed Workshop evidence version' USING ERRCODE='PT409';
  END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER t10_retain_file BEFORE UPDATE OF document_id,version_id,deleted_at,file_role,sha256_hash,
 file_size_bytes,storage_bucket,storage_path,integrity_status OR DELETE ON public.dms_document_files
 FOR EACH ROW EXECUTE FUNCTION erp_private.t10_retain_original();
CREATE TRIGGER t10_retain_version BEFORE UPDATE OF document_id,unlinked_at OR DELETE ON public.dms_document_versions
 FOR EACH ROW EXECUTE FUNCTION erp_private.t10_retain_original();

REVOKE ALL ON FUNCTION erp_private.t10_capture_return(),erp_private.t10_capture_dispatch(),
 erp_private.t10_guard_release(),erp_private.t10_original(bigint,jsonb,text[]),
 erp_private.t10_retain_document_link(),erp_private.t10_retain_original() FROM PUBLIC,anon,authenticated,service_role;
COMMIT;
