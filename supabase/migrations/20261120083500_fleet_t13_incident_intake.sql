BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope) VALUES
 ('fleet.fines.view','Read scoped official fines','fleet','fines_view','held'),
 ('fleet.fines.record','Record and revise official fine notices','fleet','fines_record','held'),
 ('fleet.fines.match','Match fines to historical Fleet custody','fleet','fines_match','held'),
 ('fleet.fines.verify','Verify actual Fleet drivers with evidence','fleet','fines_verify','held'),
 ('fleet.incidents.manage','Record and link scoped Fleet incident activities','fleet','incidents_manage','held'),
 ('workshop.recoveries.intake','Record scoped Workshop damage cases','workshop','recovery_intake','held');

INSERT INTO public.dms_document_categories(category_code,name_en)
VALUES ('T13_FLEET_RECOVERY','Fleet incidents and recovery evidence');
INSERT INTO public.dms_document_types(type_code,name_en,category_id,default_confidentiality)
SELECT t.code,t.label,c.id,t.confidentiality
FROM public.dms_document_categories c CROSS JOIN (VALUES
 ('T13_AUTHORITY_NOTICE','Official authority notice','internal'),
 ('T13_AUTHORITY_REVISION','Official authority revision','internal'),
 ('T13_DRIVER_EVIDENCE','Signed actual driver evidence','internal'),
 ('T13_INSURER_RECORD','Insurer claim or decision record','internal'),
 ('T13_RECOVERY_EMPLOYEE_NOTICE','Signed employee recovery notice','hr'),
 ('T13_RECOVERY_EMPLOYEE_RESPONSE','Signed employee recovery response','hr'),
 ('T13_RECOVERY_FINANCIAL_PROOF','Verified recovery financial proof','finance'),
 ('T13_RECOVERY_CASH_RECEIPT','Employee cash receipt for recovery','finance'),
 ('T13_RECOVERY_FINANCIAL_CORRECTION','Recovery financial correction proof','finance')
) t(code,label,confidentiality) WHERE c.category_code='T13_FLEET_RECOVERY';

CREATE TABLE erp_private.t13_incidents (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 asset_id bigint NOT NULL REFERENCES erp_private.fleet_assets(id),
 reference text NOT NULL,
 reference_key text NOT NULL,
 occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
 summary text NOT NULL,
 opened_by bigint NOT NULL REFERENCES public.user_profiles(id),
 opened_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 UNIQUE(company_id,branch_id,reference_key)
);
CREATE INDEX t13_incident_scope ON erp_private.t13_incidents(company_id,branch_id,id DESC);

CREATE TABLE erp_private.t13_cases (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 source_kind text NOT NULL CHECK (source_kind IN ('fine','damage')),
 company_id bigint NOT NULL REFERENCES public.owner_companies(id),
 branch_id bigint NOT NULL REFERENCES public.branches(id),
 asset_id bigint REFERENCES erp_private.fleet_assets(id),
 occurred_at timestamptz NOT NULL CHECK (isfinite(occurred_at)),
 source_amount numeric(18,4) NOT NULL CHECK (source_amount BETWEEN 0 AND 99999999999999.9999),
 currency text NOT NULL REFERENCES public.currencies(currency_code),
 source_revision bigint NOT NULL DEFAULT 1 CHECK (source_revision>0),
 source_status text NOT NULL CHECK (source_status IN ('reported','revised','appealed','upheld','reduced','increased','cancelled','assessed')),
 subject_status text NOT NULL DEFAULT 'unresolved' CHECK (subject_status IN ('unresolved','custody-candidate','verified','no-referral')),
 employee_id bigint REFERENCES public.employees(id),
 employment_id bigint REFERENCES erp_private.t03_employment_periods(id),
 employer_company_id bigint REFERENCES public.owner_companies(id),
 employer_branch_id bigint REFERENCES public.branches(id),
 incident_id bigint REFERENCES erp_private.t13_incidents(id),
 assessment_id bigint UNIQUE REFERENCES erp_private.t10_assessments(id),
 authority_key text,
 reference_key text,
 custody_commitment_id bigint REFERENCES erp_private.fleet_commitments(id),
 source_facts jsonb NOT NULL DEFAULT '{}' CHECK (jsonb_typeof(source_facts)='object'),
 reported_by bigint NOT NULL REFERENCES public.user_profiles(id),
 reported_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK ((subject_status='verified' AND num_nonnulls(employee_id,employment_id,employer_company_id,employer_branch_id)=4)
    OR (subject_status<>'verified' AND num_nonnulls(employee_id,employment_id,employer_company_id,employer_branch_id)=0)),
 CHECK ((source_kind='damage' AND assessment_id IS NOT NULL AND asset_id IS NOT NULL AND authority_key IS NULL
   AND reference_key IS NULL AND custody_commitment_id IS NULL AND source_status='assessed' AND subject_status IN ('verified','no-referral'))
    OR (source_kind='fine' AND assessment_id IS NULL AND authority_key IS NOT NULL AND reference_key IS NOT NULL
      AND source_status<>'assessed' AND subject_status<>'no-referral')),
 CHECK (source_status<>'cancelled' OR source_amount=0),
 CHECK (incident_id IS NULL OR asset_id IS NOT NULL)
);
CREATE UNIQUE INDEX t13_official_notice ON erp_private.t13_cases(authority_key,reference_key) WHERE source_kind='fine';
CREATE INDEX t13_case_scope ON erp_private.t13_cases(company_id,branch_id,source_kind,id DESC);
CREATE INDEX t13_case_employer ON erp_private.t13_cases(employer_company_id,employer_branch_id,id DESC)
 WHERE employer_company_id IS NOT NULL;
CREATE INDEX t13_case_incident ON erp_private.t13_cases(incident_id,id) WHERE incident_id IS NOT NULL;

CREATE TABLE erp_private.t13_incident_activities (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 incident_id bigint NOT NULL REFERENCES erp_private.t13_incidents(id),
 kind text NOT NULL CHECK (kind IN ('work','repair','hse','insurer')),
 work_order_id bigint REFERENCES erp_private.fleet_operation_orders(id),
 repair_cycle_id bigint REFERENCES erp_private.t10_job_cycles(id),
 hse_hold_id bigint REFERENCES erp_private.fleet_asset_holds(id),
 external_reference text,
 linked_by bigint NOT NULL REFERENCES public.user_profiles(id),
 linked_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 CHECK (num_nonnulls(work_order_id,repair_cycle_id,hse_hold_id,external_reference)=1
   AND (kind='work')=(work_order_id IS NOT NULL) AND (kind='repair')=(repair_cycle_id IS NOT NULL)
   AND (kind='hse')=(hse_hold_id IS NOT NULL) AND (kind='insurer')=(external_reference IS NOT NULL)),
 UNIQUE(work_order_id,incident_id),
 UNIQUE(repair_cycle_id),
 UNIQUE(hse_hold_id),
 UNIQUE(incident_id,external_reference)
);
CREATE INDEX t13_incident_activities_parent ON erp_private.t13_incident_activities(incident_id,id);

CREATE TABLE erp_private.t13_intake_evidence (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 case_id bigint REFERENCES erp_private.t13_cases(id),
 activity_id bigint UNIQUE REFERENCES erp_private.t13_incident_activities(id),
 document_id bigint NOT NULL REFERENCES public.dms_documents(id),
 version_id bigint NOT NULL REFERENCES public.dms_document_versions(id),
 file_id bigint NOT NULL UNIQUE REFERENCES public.dms_document_files(id),
 proof_role text NOT NULL CHECK (proof_role IN ('notice','authority-revision','driver','insurer')),
 reference text,
 sha256 text NOT NULL CHECK (sha256 ~ '^[0-9a-f]{64}$'),
 CHECK (num_nonnulls(case_id,activity_id)=1 AND (proof_role='insurer')=(activity_id IS NOT NULL))
);
CREATE INDEX t13_intake_document ON erp_private.t13_intake_evidence(document_id);
CREATE INDEX t13_intake_version ON erp_private.t13_intake_evidence(version_id);

CREATE TABLE erp_private.t13_case_versions (
 case_id bigint NOT NULL REFERENCES erp_private.t13_cases(id),
 revision bigint NOT NULL CHECK (revision>0),
 action text NOT NULL,
 authority_revision_key text,
 evidence_id bigint UNIQUE REFERENCES erp_private.t13_intake_evidence(id),
 actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
 recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 reason text,
 facts jsonb NOT NULL CHECK (jsonb_typeof(facts)='object'),
 PRIMARY KEY(case_id,revision),
 UNIQUE(case_id,authority_revision_key)
);

ALTER TABLE erp_private.t13_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t13_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t13_incident_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t13_intake_evidence ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.t13_case_versions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t13_incidents,erp_private.t13_cases,erp_private.t13_incident_activities,
 erp_private.t13_intake_evidence,erp_private.t13_case_versions FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.t13_evidence_is_operative(p_document bigint) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT NOT EXISTS(SELECT 1 FROM public.employee_medical_records m WHERE m.dms_document_id=p_document)
    AND NOT EXISTS(SELECT 1 FROM public.employee_medical_insurances m WHERE m.dms_document_id=p_document)
    AND NOT EXISTS(SELECT 1 FROM public.employee_leave_requests r WHERE r.sick_cert_dms_id=p_document)
    AND NOT EXISTS(SELECT 1 FROM erp_private.t01_leave_certificate_approvals v WHERE v.document_id=p_document);
$$;
CREATE FUNCTION erp_private.t13_original(p_company bigint,p_branch bigint,p_evidence jsonb,p_types text[])
RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 IF p_branch IS NULL OR NOT erp_private.t05_fields(p_evidence,ARRAY['document','version','file','reference'])
 OR coalesce(p_evidence->>'document','') !~ '^[0-9]{1,18}$' OR coalesce(p_evidence->>'version','') !~ '^[0-9]{1,18}$'
 OR coalesce(p_evidence->>'file','') !~ '^[0-9]{1,18}$' OR length(coalesce(p_evidence->>'reference',''))>150
 OR NOT erp_private.t02_has_scope('dms.documents.preview',p_company,p_branch) THEN RETURN false; END IF;

 PERFORM 1 FROM public.dms_documents d
 JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.is_active AND t.deleted_at IS NULL
   AND t.type_code=ANY(p_types)
 JOIN public.dms_document_categories category ON category.id=t.category_id AND category.id=d.category_id
   AND category.category_code='T13_FLEET_RECOVERY' AND category.is_active AND category.deleted_at IS NULL
 JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id
   AND v.is_current AND v.unlinked_at IS NULL
 JOIN public.dms_document_files f ON f.version_id=v.id AND f.document_id=d.id AND f.file_role='original'
   AND f.deleted_at IS NULL AND f.integrity_status='verified' AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$'
 WHERE d.id=(p_evidence->>'document')::bigint AND v.id=(p_evidence->>'version')::bigint AND f.id=(p_evidence->>'file')::bigint
   AND d.owning_company_id=p_company AND d.owning_branch_id=p_branch
   AND d.deleted_at IS NULL AND NOT d.is_archived AND d.status='active'
   AND d.confidentiality_level=CASE
     WHEN t.type_code IN ('T13_AUTHORITY_NOTICE','T13_AUTHORITY_REVISION','T13_DRIVER_EVIDENCE','T13_INSURER_RECORD') THEN 'internal'
     WHEN t.type_code IN ('T13_RECOVERY_EMPLOYEE_NOTICE','T13_RECOVERY_EMPLOYEE_RESPONSE') THEN 'hr'
     WHEN t.type_code IN ('T13_RECOVERY_FINANCIAL_PROOF','T13_RECOVERY_CASH_RECEIPT','T13_RECOVERY_FINANCIAL_CORRECTION') THEN 'finance'
   END
   AND (d.confidentiality_level='internal' OR erp_private.t02_has_scope('dms.documents.view.'||d.confidentiality_level,p_company,p_branch))
   AND erp_private.t13_evidence_is_operative(d.id) AND erp_private.document_permission(d.id,'dms.documents.preview')
 FOR SHARE OF d,t,category,v,f;
 RETURN FOUND;
END;
$$;

CREATE FUNCTION erp_private.t13_capture_intake(p_case bigint,p_activity bigint,p_role text,p_evidence jsonb)
RETURNS bigint LANGUAGE plpgsql SET search_path='' AS $$
DECLARE original public.dms_document_files; captured bigint;
BEGIN
 SELECT * INTO STRICT original FROM public.dms_document_files WHERE id=(p_evidence->>'file')::bigint;
 PERFORM pg_advisory_xact_lock(hashtextextended('t13-intake-document:'||original.document_id,0));
 IF EXISTS(SELECT 1 FROM erp_private.t13_intake_evidence registered WHERE registered.document_id=original.document_id
   AND (registered.case_id IS DISTINCT FROM p_case OR registered.activity_id IS DISTINCT FROM p_activity
     OR (registered.proof_role<>p_role AND (registered.proof_role NOT IN ('notice','authority-revision')
        OR p_role NOT IN ('notice','authority-revision'))))) THEN
  RAISE EXCEPTION 'Select an original bound to this exact evidence role and parent' USING ERRCODE='PT409';
 END IF;
 INSERT INTO erp_private.t13_intake_evidence(case_id,activity_id,document_id,version_id,file_id,proof_role,reference,sha256)
 VALUES(p_case,p_activity,original.document_id,original.version_id,original.id,p_role,nullif(btrim(p_evidence->>'reference'),''),original.sha256_hash)
 RETURNING id INTO captured;
 RETURN captured;
END;
$$;

CREATE FUNCTION erp_private.t13_retain_intake() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF TG_TABLE_NAME='dms_documents' THEN
   IF (TG_OP='DELETE' OR ROW(NEW.owning_company_id,NEW.owning_branch_id,NEW.document_type_id,NEW.category_id,NEW.confidentiality_level,
       NEW.deleted_at) IS DISTINCT FROM ROW(OLD.owning_company_id,OLD.owning_branch_id,OLD.document_type_id,OLD.category_id,
       OLD.confidentiality_level,OLD.deleted_at))
    AND EXISTS(SELECT 1 FROM erp_private.t13_intake_evidence e WHERE e.document_id=OLD.id) THEN
     RAISE EXCEPTION 'Retain the scoped T13 evidence document' USING ERRCODE='PT409';
   END IF;
 ELSIF TG_TABLE_NAME='dms_document_versions' THEN
   IF (TG_OP='DELETE' OR ROW(NEW.document_id,NEW.version_number,NEW.unlinked_at) IS DISTINCT FROM ROW(OLD.document_id,OLD.version_number,OLD.unlinked_at))
    AND EXISTS(SELECT 1 FROM erp_private.t13_intake_evidence e WHERE e.version_id=OLD.id) THEN
     RAISE EXCEPTION 'Retain the exact T13 evidence version' USING ERRCODE='PT409';
   END IF;
 ELSE
   IF (TG_OP='DELETE' OR ROW(NEW.document_id,NEW.version_id,NEW.deleted_at,NEW.file_role,NEW.sha256_hash,NEW.file_size_bytes,
       NEW.storage_bucket,NEW.storage_path,NEW.integrity_status) IS DISTINCT FROM ROW(OLD.document_id,OLD.version_id,OLD.deleted_at,
       OLD.file_role,OLD.sha256_hash,OLD.file_size_bytes,OLD.storage_bucket,OLD.storage_path,OLD.integrity_status))
    AND EXISTS(SELECT 1 FROM erp_private.t13_intake_evidence e WHERE e.file_id=OLD.id) THEN
     RAISE EXCEPTION 'Retain the exact T13 original file' USING ERRCODE='PT409';
   END IF;
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 RETURN NEW;
END;
$$;
CREATE TRIGGER t13_keep_intake_document BEFORE UPDATE OF owning_company_id,owning_branch_id,document_type_id,category_id,
 confidentiality_level,deleted_at OR DELETE ON public.dms_documents FOR EACH ROW EXECUTE FUNCTION erp_private.t13_retain_intake();
CREATE TRIGGER t13_keep_intake_version BEFORE UPDATE OF document_id,version_number,unlinked_at OR DELETE ON public.dms_document_versions
 FOR EACH ROW EXECUTE FUNCTION erp_private.t13_retain_intake();
CREATE TRIGGER t13_keep_intake_file BEFORE UPDATE OF document_id,version_id,deleted_at,file_role,sha256_hash,file_size_bytes,
 storage_bucket,storage_path,integrity_status OR DELETE ON public.dms_document_files FOR EACH ROW EXECUTE FUNCTION erp_private.t13_retain_intake();

CREATE FUNCTION erp_private.t13_keep_intake_history() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 RAISE EXCEPTION 'Retain T13 intake history and record a linked revision' USING ERRCODE='PT409';
END;
$$;
CREATE TRIGGER t13_keep_case_versions BEFORE UPDATE OR DELETE ON erp_private.t13_case_versions
 FOR EACH ROW EXECUTE FUNCTION erp_private.t13_keep_intake_history();
CREATE TRIGGER t13_keep_original_bindings BEFORE UPDATE OR DELETE ON erp_private.t13_intake_evidence
 FOR EACH ROW EXECUTE FUNCTION erp_private.t13_keep_intake_history();

CREATE FUNCTION erp_private.t13_source_digest(p_case bigint) RETURNS text
LANGUAGE sql STABLE SET search_path='' SET timezone='UTC' AS $$
 SELECT erp_private.t02_digest(jsonb_build_object('source',to_jsonb(c),'evidence',
   (SELECT coalesce(jsonb_agg(jsonb_build_array(v.revision,e.document_id,e.version_id,e.file_id,e.sha256)
     ORDER BY v.revision),'[]'::jsonb) FROM erp_private.t13_case_versions v
    JOIN erp_private.t13_intake_evidence e ON e.id=v.evidence_id WHERE v.case_id=c.id)))
 FROM erp_private.t13_cases c WHERE c.id=p_case;
$$;

CREATE FUNCTION erp_private.t13_at(p_text text) RETURNS timestamptz
LANGUAGE plpgsql STABLE SET search_path='' AS $$
DECLARE at_time timestamptz;
BEGIN
 IF coalesce(p_text,'') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[T ][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]{1,6})?)?(Z|[+-][0-9]{2}:[0-9]{2})$' THEN
  RAISE EXCEPTION 'Use an occurrence timestamp with an explicit UTC offset' USING ERRCODE='22023';
 END IF;
 at_time:=p_text::timestamptz;
 IF NOT isfinite(at_time) OR at_time>statement_timestamp() THEN
  RAISE EXCEPTION 'Record a valid historical occurrence' USING ERRCODE='22023';
 END IF;
 RETURN at_time;
END;
$$;

CREATE FUNCTION erp_private.t13_money(p_data jsonb,p_key text,p_currency text) RETURNS numeric
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE money numeric; places integer;
BEGIN
 SELECT c.decimal_places INTO places FROM public.currencies c WHERE c.currency_code=p_currency AND c.is_active FOR SHARE;
 IF places IS NULL OR jsonb_typeof(p_data->p_key) IS DISTINCT FROM 'number' THEN
  RAISE EXCEPTION 'Use the exact amount and an active ISO currency' USING ERRCODE='22023';
 END IF;
 money:=(p_data->>p_key)::numeric;
 IF money<0 OR money>99999999999999.9999 OR money<>round(money,places) THEN
  RAISE EXCEPTION 'Use the configured currency precision and a valid non-negative amount' USING ERRCODE='22023';
 END IF;
 RETURN money;
END;
$$;

CREATE FUNCTION erp_private.t13_notice_terms(p_data jsonb,p_occurred timestamptz,p_currency text,p_amount numeric) RETURNS jsonb
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE notice_at date; appeal date; payment date; discount numeric;
BEGIN
 notice_at:=(p_data->>'notice_on')::date;
 appeal:=(p_data->>'appeal_deadline')::date;
 payment:=(p_data->>'payment_deadline')::date;
 IF p_data->>'discount_amount' IS NOT NULL THEN discount:=erp_private.t13_money(p_data,'discount_amount',p_currency); END IF;
 IF notice_at IS NULL OR NOT isfinite(notice_at) OR notice_at<(p_occurred AT TIME ZONE 'Asia/Dubai')::date
   OR notice_at>(statement_timestamp() AT TIME ZONE 'Asia/Dubai')::date
   OR (appeal IS NOT NULL AND (NOT isfinite(appeal) OR appeal<notice_at))
   OR (payment IS NOT NULL AND (NOT isfinite(payment) OR payment<notice_at)) OR discount>p_amount THEN
  RAISE EXCEPTION 'Verify the notice date, applicable deadlines and discount' USING ERRCODE='22023';
 END IF;
 RETURN jsonb_build_object('notice_on',notice_at,'appeal_deadline',appeal,'payment_deadline',payment,'discount_amount',discount);
END;
$$;

CREATE FUNCTION erp_private.t13_reference_key(p_text text) RETURNS text
LANGUAGE sql IMMUTABLE STRICT SET search_path='' AS $$
 SELECT upper(regexp_replace(btrim(p_text),'[[:space:]]+',' ','g'));
$$;


-- Custody is authoritative for operating scope when a handover covers the moment.
-- Asset operating history is dated in Dubai and covers periods without a handover.
CREATE FUNCTION erp_private.t13_asset_at(p_asset bigint,p_company bigint,p_branch bigint,p_at timestamptz) RETURNS boolean
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE a erp_private.fleet_assets; matches bigint; scoped bigint; operating record;
BEGIN
 SELECT * INTO a FROM erp_private.fleet_assets WHERE id=p_asset FOR SHARE;
 IF a.id IS NULL THEN RETURN false; END IF;
 SELECT count(*),count(*) FILTER(WHERE c.company_id=p_company AND c.branch_id=p_branch)
 INTO matches,scoped FROM erp_private.fleet_commitments c
 WHERE c.asset_id=p_asset AND c.kind IN ('custody','dispatch') AND c.status IN ('active','closed')
  AND lower(c.committed_during)<=p_at AND (upper_inf(c.committed_during) OR upper(c.committed_during)>=p_at);
 IF matches>0 THEN RETURN scoped>0; END IF;
 SELECT h.company_id,h.branch_id INTO operating FROM erp_private.fleet_asset_history h
 WHERE h.asset_id=p_asset AND h.kind='operation' AND h.effective_on<=(p_at AT TIME ZONE 'Asia/Dubai')::date
 ORDER BY h.effective_on DESC,h.id DESC LIMIT 1;
 RETURN coalesce(operating.company_id,a.owner_company_id)=p_company AND coalesce(operating.branch_id,a.home_branch_id)=p_branch;
END;
$$;

CREATE FUNCTION erp_private.t13_plate_at(p_case erp_private.t13_cases) RETURNS bigint
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE resolved bigint; matches bigint;
BEGIN
 SELECT min(p.asset_id),count(*) INTO resolved,matches FROM erp_private.fleet_asset_plates p
 WHERE p.jurisdiction=p_case.source_facts->>'plate_jurisdiction' AND p.plate_class=p_case.source_facts->>'plate_class'
 AND p.plate_number=p_case.source_facts->>'plate_number'
 AND daterange(p.valid_from,p.valid_until,'[)') @> (p_case.occurred_at AT TIME ZONE 'Asia/Dubai')::date;
 IF matches<>1 OR NOT erp_private.t13_asset_at(resolved,p_case.company_id,p_case.branch_id,p_case.occurred_at) THEN RETURN NULL; END IF;
 -- Recheck after locking the asset against T05 plate and T06 custody writers.
 PERFORM 1 FROM erp_private.fleet_asset_plates p WHERE p.asset_id=resolved
 AND p.jurisdiction=p_case.source_facts->>'plate_jurisdiction' AND p.plate_class=p_case.source_facts->>'plate_class'
 AND p.plate_number=p_case.source_facts->>'plate_number'
 AND daterange(p.valid_from,p.valid_until,'[)') @> (p_case.occurred_at AT TIME ZONE 'Asia/Dubai')::date FOR SHARE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN resolved;
END;
$$;

CREATE FUNCTION erp_private.t13_find_custody(p_case erp_private.t13_cases)
RETURNS TABLE(asset_id bigint,commitment_id bigint,match_state text)
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE match_id bigint; total bigint; boundary boolean; c erp_private.fleet_commitments;
BEGIN
 asset_id:=erp_private.t13_plate_at(p_case);
 IF asset_id IS NULL THEN
  match_state:='plate-unresolved';
  RETURN NEXT; RETURN;
 END IF;
 SELECT min(f.id),count(*) FILTER(WHERE f.committed_during @> p_case.occurred_at),
  coalesce(bool_or(p_case.occurred_at=lower(f.committed_during) OR p_case.occurred_at=upper(f.committed_during)),false)
 INTO match_id,total,boundary
 FROM erp_private.fleet_commitments f
 WHERE f.asset_id=t13_find_custody.asset_id AND f.status IN ('active','closed') AND f.kind IN ('custody','dispatch')
   AND lower(f.committed_during)<=p_case.occurred_at
   AND (upper_inf(f.committed_during) OR upper(f.committed_during)>=p_case.occurred_at);
 IF boundary OR total>1 THEN
  match_state:=CASE WHEN boundary THEN 'boundary' ELSE 'overlap' END;
 ELSIF total=0 THEN
  match_state:='no-custody';
 ELSE
  SELECT * INTO c FROM erp_private.fleet_commitments WHERE id=match_id FOR SHARE;
  IF (c.company_id,c.branch_id) IS DISTINCT FROM (p_case.company_id,p_case.branch_id)
   OR NOT EXISTS(SELECT 1 FROM erp_private.fleet_custody_events e WHERE e.commitment_id=c.id
     AND e.kind IN ('checkout','dispatch','transfer-in') AND e.occurred_at=lower(c.committed_during))
   OR (c.status='closed' AND NOT EXISTS(SELECT 1 FROM erp_private.fleet_custody_events e WHERE e.commitment_id=c.id
     AND e.kind IN ('return','transfer-out') AND e.occurred_at=upper(c.committed_during))) THEN
   match_state:='no-custody';
  ELSE
   match_state:='custody-candidate';
   commitment_id:=c.id;
  END IF;
 END IF;
 RETURN NEXT;
END;
$$;

CREATE FUNCTION erp_private.t13_related_incident(
 p_incident bigint,p_company bigint,p_branch bigint,p_asset bigint,p_occurred timestamptz)
RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
BEGIN
 PERFORM 1 FROM erp_private.t13_incidents i WHERE i.id=p_incident AND i.company_id=p_company AND i.branch_id=p_branch
  AND i.asset_id=p_asset AND (i.occurred_at AT TIME ZONE 'Asia/Dubai')::date=(p_occurred AT TIME ZONE 'Asia/Dubai')::date
  FOR SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Select a related incident for this asset and operating scope' USING ERRCODE='PT409'; END IF;
END;
$$;

CREATE FUNCTION erp_private.t13_damage_source(p_assessment bigint)
RETURNS TABLE(source_amount numeric,facts jsonb,employee_id bigint,employment_id bigint,employer_company_id bigint,employer_branch_id bigint)
LANGUAGE plpgsql SET search_path='' SET timezone='UTC' AS $$
DECLARE a erp_private.t10_assessments; repair jsonb; estimated numeric; actual numeric; referral erp_private.t10_hr_referrals;
BEGIN
 SELECT * INTO a FROM erp_private.t10_assessments WHERE id=p_assessment FOR UPDATE;
 IF a.outcome IS NULL OR a.source_kind='planned-service' THEN
  RAISE EXCEPTION 'Select the exact assessed Workshop damage record' USING ERRCODE='PT409';
 END IF;
 PERFORM 1 FROM erp_private.t10_job_cycles WHERE assessment_id=a.id ORDER BY id FOR SHARE;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',j.id,'revision',j.revision,'state',j.state,'estimate',j.estimate_aed,
   'actual',CASE WHEN j.state='closed' THEN j.actual_cost_aed END) ORDER BY j.cycle),'[]'::jsonb),
  sum(j.estimate_aed),sum(j.actual_cost_aed) FILTER (WHERE j.state='closed')
 INTO repair,estimated,actual FROM erp_private.t10_job_cycles j WHERE j.assessment_id=a.id;
 SELECT r.* INTO referral FROM erp_private.t10_hr_referrals r
 JOIN erp_private.t03_employment_periods p ON p.id=r.employment_id AND p.employee_id=r.employee_id
   AND p.company_id=r.company_id AND p.branch_id=r.branch_id AND p.work_period @> (a.occurred_at AT TIME ZONE 'Asia/Dubai')::date
 JOIN public.dms_document_files f ON f.id=a.file_id AND f.document_id=a.document_id AND f.version_id=a.version_id
   AND f.file_role='original' AND f.deleted_at IS NULL AND f.integrity_status='verified' AND f.sha256_hash~'^[0-9a-f]{64}$'
 WHERE r.assessment_id=a.id FOR SHARE OF r,p,f;
 source_amount:=coalesce(actual,0);
 facts:=jsonb_build_object('assessment_source',a.source_kind,'assessment_reference',a.source_ref,'assessment_outcome',a.outcome,
   'assessed_at',a.assessed_at,'estimated_amount',estimated,'actual_amount',actual,'repair_cycles',repair,
   'has_referral',referral.assessment_id IS NOT NULL);
 employee_id:=referral.employee_id;
 employment_id:=referral.employment_id;
 employer_company_id:=referral.company_id;
 employer_branch_id:=referral.branch_id;
 RETURN NEXT;
END;
$$;

CREATE FUNCTION erp_private.t13_link_activity(p_incident erp_private.t13_incidents,p_data jsonb,p_actor bigint) RETURNS bigint
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE activity text:=p_data->>'kind'; parent_id bigint; item bigint; reference text;
BEGIN
 IF activity IN ('work','repair','hse') AND erp_private.t05_fields(p_data,ARRAY['kind','parent']) THEN
  parent_id:=(p_data->>'parent')::bigint;
  IF activity='work' THEN
   PERFORM 1 FROM erp_private.fleet_operation_orders o JOIN erp_private.fleet_operation_assignments a ON a.order_id=o.id
   JOIN erp_private.fleet_commitments c ON c.id=a.actual_commitment_id
   WHERE o.id=parent_id AND o.company_id=p_incident.company_id AND o.branch_id=p_incident.branch_id
    AND c.asset_id=p_incident.asset_id AND c.company_id=p_incident.company_id AND c.branch_id=p_incident.branch_id
    AND c.committed_during @> p_incident.occurred_at FOR SHARE OF o,a,c;
   IF NOT FOUND THEN RAISE EXCEPTION 'Select the related Fleet work order with actual use at the incident' USING ERRCODE='PT409'; END IF;
  ELSIF activity='repair' THEN
   PERFORM 1 FROM erp_private.t10_job_cycles j JOIN erp_private.t10_assessments a ON a.id=j.assessment_id
   WHERE j.id=parent_id AND a.company_id=p_incident.company_id AND a.branch_id=p_incident.branch_id AND a.asset_id=p_incident.asset_id
    AND (a.occurred_at=p_incident.occurred_at OR EXISTS(SELECT 1 FROM erp_private.t13_cases c
      WHERE c.assessment_id=a.id AND c.incident_id=p_incident.id)) FOR SHARE OF j,a;
   IF NOT FOUND THEN RAISE EXCEPTION 'Select the exact related Workshop repair cycle' USING ERRCODE='PT409'; END IF;
  ELSE
   PERFORM 1 FROM erp_private.fleet_asset_holds h
   WHERE h.id=parent_id AND h.kind='hse' AND h.asset_id=p_incident.asset_id
    AND (h.placed_at=p_incident.occurred_at OR EXISTS (SELECT 1 FROM erp_private.fleet_commitments c
      WHERE c.id=h.source_commitment_id AND c.asset_id=p_incident.asset_id AND c.company_id=p_incident.company_id
       AND c.branch_id=p_incident.branch_id AND c.committed_during @> p_incident.occurred_at)) FOR SHARE;
   IF NOT FOUND THEN RAISE EXCEPTION 'Select the exact related HSE hold record' USING ERRCODE='PT409'; END IF;
  END IF;
 ELSIF activity='insurer' AND erp_private.t05_fields(p_data,ARRAY['kind','reference','evidence']) THEN
  reference:=erp_private.t10_text(p_data,'reference',150);
  IF reference IS NULL OR NOT erp_private.t13_original(p_incident.company_id,p_incident.branch_id,p_data->'evidence',ARRAY['T13_INSURER_RECORD']) THEN
   RAISE EXCEPTION 'Select the exact scoped insurer original and reference' USING ERRCODE='PT409';
  END IF;
 ELSE
  RAISE EXCEPTION 'Use a supported incident activity and exact parent' USING ERRCODE='22023';
 END IF;
 INSERT INTO erp_private.t13_incident_activities(incident_id,kind,work_order_id,repair_cycle_id,hse_hold_id,external_reference,linked_by)
 VALUES(p_incident.id,activity,CASE WHEN activity='work' THEN parent_id END,CASE WHEN activity='repair' THEN parent_id END,
  CASE WHEN activity='hse' THEN parent_id END,reference,p_actor) RETURNING id INTO item;
 IF activity='insurer' THEN PERFORM erp_private.t13_capture_intake(NULL,item,'insurer',p_data->'evidence'); END IF;
 RETURN item;
END;
$$;

CREATE FUNCTION erp_private.t13_case_result(p_case erp_private.t13_cases) RETURNS jsonb
LANGUAGE sql IMMUTABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',p_case.id,'asset_id',p_case.asset_id,'source_revision',p_case.source_revision,'source_status',p_case.source_status,
  'source_amount',p_case.source_amount,'subject_status',p_case.subject_status,'match_state',p_case.source_facts->>'match_state',
  'incident_id',p_case.incident_id);
$$;


CREATE FUNCTION public.t13_fleet_command(p_operation uuid,p_target bigint,p_action text,p_data jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE fields text[]; capability text; company bigint; branch bigint; actor bigint; digest text; prior jsonb;
 c erp_private.t13_cases; i erp_private.t13_incidents; a erp_private.t10_assessments; employment erp_private.t03_employment_periods;
 found_custody record; damage record; amount numeric; currency_code text; status_code text; terms jsonb;
 authority text; reference text; reason text; label text; revision_key text; jurisdiction text; plate_class text; plate_number text;
 linked_incident bigint; resolved_asset bigint; occurrence timestamptz; proof_role text; proof_id bigint; linked_activity bigint;
BEGIN
 fields:=CASE p_action
  WHEN 'record-fine' THEN ARRAY['authority','reference','offence','occurred_at','location','notice_on','plate_jurisdiction','plate_class',
      'plate_number','amount','currency','discount_amount','appeal_deadline','payment_deadline','evidence','incident']
  WHEN 'revise-fine' THEN ARRAY['revision','authority_revision','status','amount','notice_on','discount_amount','appeal_deadline','payment_deadline','evidence','reason']
  WHEN 'match-custody' THEN ARRAY['revision']
  WHEN 'verify-driver' THEN ARRAY['revision','employee','evidence','reason']
  WHEN 'open-damage' THEN ARRAY['assessment','incident']
  WHEN 'refresh-damage' THEN ARRAY['revision']
  WHEN 'open-incident' THEN ARRAY['reference','asset','occurred_at','summary']
  WHEN 'link-incident' THEN ARRAY['revision','incident']
  WHEN 'link-activity' THEN ARRAY['kind','parent','reference','evidence']
 END;
 IF fields IS NULL OR p_operation IS NULL OR p_target IS NULL OR NOT erp_private.t05_fields(p_data,fields) THEN
  RAISE EXCEPTION 'Select a T13 operation and its exact subject' USING ERRCODE='22023';
 END IF;
 capability:=CASE p_action
  WHEN 'record-fine' THEN 'fleet.fines.record'
  WHEN 'revise-fine' THEN 'fleet.fines.record'
  WHEN 'match-custody' THEN 'fleet.fines.match'
  WHEN 'verify-driver' THEN 'fleet.fines.verify'
  WHEN 'open-damage' THEN 'workshop.recoveries.intake'
  WHEN 'refresh-damage' THEN 'workshop.recoveries.intake'
  ELSE 'fleet.incidents.manage'
 END;
 IF p_action IN ('record-fine','open-damage','open-incident') THEN
  SELECT b.owner_company_id,b.id INTO company,branch FROM public.branches b WHERE b.id=p_target;
 ELSIF p_action='link-activity' THEN
  SELECT * INTO i FROM erp_private.t13_incidents WHERE id=p_target FOR UPDATE;
  company:=i.company_id; branch:=i.branch_id;
 ELSE
  SELECT * INTO c FROM erp_private.t13_cases WHERE id=p_target FOR UPDATE;
  company:=c.company_id; branch:=c.branch_id;
 END IF;
 IF branch IS NULL OR NOT erp_private.t02_has_scope(capability,company,branch) THEN
  RAISE EXCEPTION 'The requested operating scope or T13 authorization is unavailable' USING ERRCODE='42501';
 END IF;

 actor:=public.current_user_profile_id();
 digest:=erp_private.t02_digest(jsonb_build_object('target',p_target,'action',p_action,'data',p_data));
 prior:=erp_private.t02_replay('fleet-t13',p_operation,digest);
 IF prior IS NOT NULL THEN RETURN prior; END IF;
 IF c.id IS NOT NULL AND c.source_revision IS DISTINCT FROM (p_data->>'revision')::bigint THEN
  RAISE EXCEPTION 'The case source changed. Review its current revision' USING ERRCODE='PT409';
 END IF;
 IF (p_action IN ('revise-fine','match-custody','verify-driver') AND c.source_kind<>'fine')
    OR (p_action='refresh-damage' AND c.source_kind<>'damage') THEN
  RAISE EXCEPTION 'The selected operation is unavailable for this source kind' USING ERRCODE='22023';
 END IF;

 IF p_action='open-incident' THEN
  occurrence:=erp_private.t13_at(p_data->>'occurred_at');
  resolved_asset:=(p_data->>'asset')::bigint;
  reference:=erp_private.t10_text(p_data,'reference',150);
  label:=erp_private.t10_text(p_data,'summary',500);
  IF reference IS NULL OR label IS NULL OR NOT erp_private.t13_asset_at(resolved_asset,company,branch,occurrence) THEN
   RAISE EXCEPTION 'Record the incident reference, related asset, and operational summary' USING ERRCODE='PT409';
  END IF;
  INSERT INTO erp_private.t13_incidents(company_id,branch_id,asset_id,reference,reference_key,occurred_at,summary,opened_by)
  VALUES(company,branch,resolved_asset,reference,erp_private.t13_reference_key(reference),occurrence,label,actor) RETURNING * INTO i;
  RETURN erp_private.t02_save_receipt('fleet-t13',p_operation,digest,jsonb_build_object('id',i.id,'reference',i.reference));
 ELSIF p_action='link-activity' THEN
  linked_activity:=erp_private.t13_link_activity(i,p_data,actor);
  RETURN erp_private.t02_save_receipt('fleet-t13',p_operation,digest,jsonb_build_object('id',i.id,'activity_id',linked_activity));
 ELSIF p_action='record-fine' THEN
  authority:=erp_private.t10_text(p_data,'authority',100);
  reference:=erp_private.t10_text(p_data,'reference',150);
  reason:=erp_private.t10_text(p_data,'offence',300);
  label:=erp_private.t10_text(p_data,'location',300);
  jurisdiction:=erp_private.t05_identifier(p_data->>'plate_jurisdiction');
  plate_class:=erp_private.t05_identifier(p_data->>'plate_class');
  plate_number:=erp_private.t05_identifier(p_data->>'plate_number');
  IF authority IS NULL OR reference IS NULL OR reason IS NULL OR label IS NULL
    OR coalesce(jurisdiction,'') !~ '^[A-Z0-9]{2,24}$' OR coalesce(plate_class,'') !~ '^[A-Z0-9]{1,24}$'
    OR coalesce(plate_number,'') !~ '^[A-Z0-9]{1,32}$' THEN
   RAISE EXCEPTION 'Record the authority, notice reference, offence, place and complete plate' USING ERRCODE='22023';
  END IF;
  occurrence:=erp_private.t13_at(p_data->>'occurred_at');
  currency_code:=upper(btrim(p_data->>'currency'));
  amount:=erp_private.t13_money(p_data,'amount',currency_code);
  IF amount<=0 THEN RAISE EXCEPTION 'Record the positive original authority amount' USING ERRCODE='22023'; END IF;
  terms:=erp_private.t13_notice_terms(p_data,occurrence,currency_code,amount);
  IF NOT erp_private.t13_original(company,branch,p_data->'evidence',ARRAY['T13_AUTHORITY_NOTICE']) THEN
   RAISE EXCEPTION 'Select the exact scoped official notice original' USING ERRCODE='PT409';
  END IF;
  c.company_id:=company; c.branch_id:=branch; c.occurred_at:=occurrence;
  c.source_facts:=terms||jsonb_build_object('authority',authority,'reference',reference,'offence',reason,'location',label,
    'plate_jurisdiction',jurisdiction,'plate_class',plate_class,'plate_number',plate_number,'match_state','pending');
  resolved_asset:=erp_private.t13_plate_at(c);
  linked_incident:=(p_data->>'incident')::bigint;
  IF linked_incident IS NOT NULL THEN
   PERFORM erp_private.t13_related_incident(linked_incident,company,branch,resolved_asset,occurrence);
  END IF;
  INSERT INTO erp_private.t13_cases(source_kind,company_id,branch_id,asset_id,occurred_at,source_amount,currency,source_status,
    incident_id,authority_key,reference_key,source_facts,reported_by)
  VALUES('fine',company,branch,resolved_asset,occurrence,amount,currency_code,'reported',linked_incident,
    erp_private.t13_reference_key(authority),erp_private.t13_reference_key(reference),c.source_facts,actor)
  RETURNING * INTO c;
  proof_role:='notice';
  reason:=NULL;
 ELSIF p_action='open-damage' THEN
  SELECT * INTO a FROM erp_private.t10_assessments WHERE id=(p_data->>'assessment')::bigint AND company_id=company AND branch_id=branch
   FOR UPDATE;
  IF a.id IS NULL THEN RAISE EXCEPTION 'Select the exact Workshop assessment in this scope' USING ERRCODE='PT409'; END IF;
  SELECT * INTO damage FROM erp_private.t13_damage_source(a.id);
  linked_incident:=(p_data->>'incident')::bigint;
  IF linked_incident IS NOT NULL THEN
   PERFORM erp_private.t13_related_incident(linked_incident,company,branch,a.asset_id,a.occurred_at);
  END IF;
  INSERT INTO erp_private.t13_cases(source_kind,company_id,branch_id,asset_id,occurred_at,source_amount,currency,source_status,subject_status,
   employee_id,employment_id,employer_company_id,employer_branch_id,incident_id,assessment_id,source_facts,reported_by)
  VALUES('damage',company,branch,a.asset_id,a.occurred_at,damage.source_amount,'AED','assessed',
   CASE WHEN damage.employee_id IS NULL THEN 'no-referral' ELSE 'verified' END,
   damage.employee_id,damage.employment_id,damage.employer_company_id,damage.employer_branch_id,linked_incident,a.id,damage.facts,actor)
  RETURNING * INTO c;
 ELSIF p_action='revise-fine' THEN
  reference:=erp_private.t10_text(p_data,'authority_revision',150);
  reason:=erp_private.t10_text(p_data,'reason',1000);
  status_code:=p_data->>'status';
  amount:=erp_private.t13_money(p_data,'amount',c.currency);
  terms:=erp_private.t13_notice_terms(p_data,c.occurred_at,c.currency,amount);
  IF reference IS NULL OR reason IS NULL OR coalesce(status_code,'') NOT IN ('revised','appealed','upheld','reduced','increased','cancelled')
    OR c.source_status='cancelled' OR (terms->>'notice_on')::date<(c.source_facts->>'notice_on')::date
    OR (status_code='cancelled' AND (c.source_amount<=0 OR amount<>0))
    OR (status_code='reduced' AND (amount<=0 OR amount>=c.source_amount))
    OR (status_code='increased' AND amount<=c.source_amount)
    OR (status_code IN ('revised','appealed','upheld') AND amount<>c.source_amount) THEN
   RAISE EXCEPTION 'Record a dated authority decision and its matching revised amount' USING ERRCODE='PT409';
  END IF;
  IF NOT erp_private.t13_original(company,branch,p_data->'evidence',ARRAY['T13_AUTHORITY_REVISION'])
   AND NOT (erp_private.t13_original(company,branch,p_data->'evidence',ARRAY['T13_AUTHORITY_NOTICE'])
    AND EXISTS(SELECT 1 FROM erp_private.t13_intake_evidence e WHERE e.case_id=c.id AND e.proof_role='notice'
      AND e.document_id=(p_data->'evidence'->>'document')::bigint)) THEN
   RAISE EXCEPTION 'Select the exact scoped authority revision original' USING ERRCODE='PT409';
  END IF;
  revision_key:=erp_private.t13_reference_key(reference);
  UPDATE erp_private.t13_cases SET source_amount=amount,source_status=status_code,source_revision=source_revision+1,
   source_facts=source_facts||terms||jsonb_build_object('authority_revision',reference)
   WHERE id=c.id RETURNING * INTO c;
  proof_role:='authority-revision';
 ELSIF p_action='match-custody' THEN
  IF c.source_status='cancelled' OR c.subject_status='verified' THEN
   RAISE EXCEPTION 'Custody matching requires an open case without verified responsibility' USING ERRCODE='PT409';
  END IF;
  SELECT * INTO found_custody FROM erp_private.t13_find_custody(c);
  IF c.incident_id IS NOT NULL THEN
   PERFORM erp_private.t13_related_incident(c.incident_id,company,branch,found_custody.asset_id,c.occurred_at);
  END IF;
  UPDATE erp_private.t13_cases SET asset_id=found_custody.asset_id,custody_commitment_id=found_custody.commitment_id,
   source_revision=source_revision+1,
   subject_status=CASE WHEN found_custody.commitment_id IS NULL THEN 'unresolved' ELSE 'custody-candidate' END,
   source_facts=source_facts||jsonb_build_object('match_state',found_custody.match_state,'matched_by',actor)
   WHERE id=c.id RETURNING * INTO c;
 ELSIF p_action='verify-driver' THEN
  IF actor=c.reported_by THEN
   RAISE EXCEPTION 'Driver verification requires an actor independent of the notice recorder' USING ERRCODE='42501';
  END IF;
  reason:=erp_private.t10_text(p_data,'reason',1000);
  SELECT * INTO found_custody FROM erp_private.t13_find_custody(c);
  IF c.source_status='cancelled' OR c.custody_commitment_id IS NULL OR c.custody_commitment_id IS DISTINCT FROM found_custody.commitment_id
    OR reason IS NULL OR NOT erp_private.t13_original(company,branch,p_data->'evidence',ARRAY['T13_DRIVER_EVIDENCE']) THEN
   RAISE EXCEPTION 'Verify the exact custody match and independent signed driver evidence' USING ERRCODE='PT409';
  END IF;
  SELECT p.* INTO employment FROM erp_private.t03_employment_periods p JOIN public.employees e ON e.id=p.employee_id AND e.deleted_at IS NULL
  WHERE p.employee_id=(p_data->>'employee')::bigint AND p.branch_id IS NOT NULL
   AND p.work_period @> (c.occurred_at AT TIME ZONE 'Asia/Dubai')::date FOR SHARE OF p,e;
  IF employment.id IS NULL OR NOT erp_private.t02_has_scope('fleet.fines.verify',employment.company_id,employment.branch_id) THEN
   RAISE EXCEPTION 'Select a verifiable employment period within the authorized scope' USING ERRCODE='PT409';
  END IF;
  UPDATE erp_private.t13_cases SET employee_id=employment.employee_id,employment_id=employment.id,employer_company_id=employment.company_id,
   employer_branch_id=employment.branch_id,subject_status='verified',source_revision=source_revision+1,
   source_facts=source_facts||jsonb_build_object('driver_verified_by',actor) WHERE id=c.id RETURNING * INTO c;
  proof_role:='driver';
 ELSIF p_action='refresh-damage' THEN
  SELECT * INTO damage FROM erp_private.t13_damage_source(c.assessment_id);
  IF c.source_facts IS NOT DISTINCT FROM damage.facts AND c.source_amount IS NOT DISTINCT FROM damage.source_amount
    AND c.employment_id IS NOT DISTINCT FROM damage.employment_id THEN
   RAISE EXCEPTION 'The assessment, referral and actual repair costs are already current' USING ERRCODE='PT409';
  END IF;
  UPDATE erp_private.t13_cases SET source_amount=damage.source_amount,source_facts=damage.facts,source_revision=source_revision+1,
   employee_id=damage.employee_id,employment_id=damage.employment_id,employer_company_id=damage.employer_company_id,
   employer_branch_id=damage.employer_branch_id,subject_status=CASE WHEN damage.employee_id IS NULL THEN 'no-referral' ELSE 'verified' END
   WHERE id=c.id RETURNING * INTO c;
 ELSE
  linked_incident:=(p_data->>'incident')::bigint;
  IF c.incident_id IS NOT NULL THEN RAISE EXCEPTION 'The case already has its retained incident parent' USING ERRCODE='PT409'; END IF;
  PERFORM erp_private.t13_related_incident(linked_incident,company,branch,c.asset_id,c.occurred_at);
  UPDATE erp_private.t13_cases SET incident_id=linked_incident,source_revision=source_revision+1 WHERE id=c.id RETURNING * INTO c;
 END IF;

 IF proof_role IS NOT NULL THEN proof_id:=erp_private.t13_capture_intake(c.id,NULL,proof_role,p_data->'evidence'); END IF;
 INSERT INTO erp_private.t13_case_versions(case_id,revision,action,authority_revision_key,evidence_id,actor_id,reason,facts)
 VALUES(c.id,c.source_revision,p_action,revision_key,proof_id,actor,reason,to_jsonb(c));
 RETURN erp_private.t02_save_receipt('fleet-t13',p_operation,digest,erp_private.t13_case_result(c));
EXCEPTION WHEN unique_violation THEN
 RAISE EXCEPTION 'This official reference, original, or relationship is already recorded' USING ERRCODE='PT409';
END;
$$;


CREATE FUNCTION erp_private.t13_case_workspace(p_case erp_private.t13_cases,p_preview boolean,p_person boolean) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT erp_private.t13_case_result(p_case) || jsonb_build_object(
  'source_kind',p_case.source_kind,'company_id',p_case.company_id,'branch_id',p_case.branch_id,'occurred_at',p_case.occurred_at,
  'currency',p_case.currency,'assessment_id',p_case.assessment_id,
  'employee_id',CASE WHEN p_person THEN p_case.employee_id END,'employment_id',CASE WHEN p_person THEN p_case.employment_id END,
  'employer_company_id',CASE WHEN p_person THEN p_case.employer_company_id END,
  'employer_branch_id',CASE WHEN p_person THEN p_case.employer_branch_id END,
  'custody_candidate_id',CASE WHEN p_person THEN custody.employee_id END,
  'commitment_id',CASE WHEN p_person THEN custody.id END,
  'authority',p_case.source_facts->>'authority','reference',coalesce(p_case.source_facts->>'reference',p_case.source_facts->>'assessment_reference'),
  'offence',p_case.source_facts->>'offence','location',p_case.source_facts->>'location',
  'plate_jurisdiction',p_case.source_facts->>'plate_jurisdiction','plate_class',p_case.source_facts->>'plate_class',
  'plate_number',p_case.source_facts->>'plate_number','notice_on',p_case.source_facts->'notice_on',
  'appeal_deadline',p_case.source_facts->'appeal_deadline','payment_deadline',p_case.source_facts->'payment_deadline',
  'discount_amount',p_case.source_facts->'discount_amount','assessment_outcome',p_case.source_facts->>'assessment_outcome',
  'estimated_amount',p_case.source_facts->'estimated_amount','actual_amount',p_case.source_facts->'actual_amount',
  'evidence',(SELECT jsonb_build_object('document',e.document_id,'version',e.version_id,'file',e.file_id,'reference',e.reference)
    FROM erp_private.t13_intake_evidence e WHERE e.case_id=p_case.id AND e.proof_role IN ('notice','authority-revision')
     AND p_preview AND erp_private.document_permission(e.document_id,'dms.documents.preview') ORDER BY e.id DESC LIMIT 1),
  'history',coalesce((SELECT jsonb_agg(jsonb_build_object('revision',record.revision,'action',record.action,'status',record.facts->>'source_status',
    'amount',record.facts->'source_amount','notice_on',record.facts->'source_facts'->'notice_on',
    'authority_revision',record.facts->'source_facts'->>'authority_revision','recorded_at',record.recorded_at,
    'evidence',CASE WHEN p_preview AND (e.proof_role<>'driver' OR p_person) AND erp_private.document_permission(e.document_id,'dms.documents.preview')
      THEN jsonb_build_object('document',e.document_id,'version',e.version_id,'file',e.file_id,'reference',e.reference) END)
    ORDER BY record.revision DESC)
   FROM (SELECT v.* FROM erp_private.t13_case_versions v WHERE v.case_id=p_case.id ORDER BY v.revision DESC LIMIT 50) record
   LEFT JOIN erp_private.t13_intake_evidence e ON e.id=record.evidence_id),'[]'::jsonb))
 FROM (SELECT 1) base LEFT JOIN erp_private.fleet_commitments custody ON custody.id=p_case.custody_commitment_id;
$$;

CREATE FUNCTION public.t13_fleet_workspace_page(p_branch bigint,p_before bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE company bigint; can_record boolean; can_match boolean; can_verify boolean; can_read_fine boolean;
 can_intake_damage boolean; can_link boolean; can_preview boolean;
 case_list jsonb; incident_list jsonb; assessments jsonb; evidence_choices jsonb; assets jsonb; page_boundary bigint; next_before bigint;
BEGIN
 SELECT b.owner_company_id INTO company FROM public.branches b WHERE b.id=p_branch;
 IF company IS NULL THEN RETURN NULL; END IF;
 can_record:=erp_private.t02_has_scope('fleet.fines.record',company,p_branch);
 can_match:=erp_private.t02_has_scope('fleet.fines.match',company,p_branch);
 can_verify:=erp_private.t02_has_scope('fleet.fines.verify',company,p_branch);
 can_read_fine:=erp_private.t02_has_scope('fleet.fines.view',company,p_branch) OR can_record OR can_match OR can_verify;
 can_intake_damage:=erp_private.t02_has_scope('workshop.recoveries.intake',company,p_branch);
 can_link:=erp_private.t02_has_scope('fleet.incidents.manage',company,p_branch);
 IF NOT(can_read_fine OR can_intake_damage OR can_link) THEN RETURN NULL; END IF;
 can_preview:=erp_private.t02_has_scope('dms.documents.preview',company,p_branch);

 SELECT coalesce(jsonb_agg(erp_private.t13_case_workspace(c,can_preview,
   c.source_kind='fine' AND (can_match OR can_verify) AND (c.employee_id IS NULL
    OR (c.employer_company_id,c.employer_branch_id)=(company,p_branch)
    OR erp_private.t02_has_scope('fleet.fines.verify',c.employer_company_id,c.employer_branch_id))) ORDER BY c.id DESC),'[]'::jsonb),min(c.id)
 INTO case_list,page_boundary FROM (SELECT candidate.* FROM erp_private.t13_cases candidate
  WHERE candidate.company_id=company AND candidate.branch_id=p_branch AND (p_before IS NULL OR candidate.id<p_before)
    AND ((candidate.source_kind='fine' AND can_read_fine) OR (candidate.source_kind='damage' AND can_intake_damage))
  ORDER BY candidate.id DESC LIMIT 100) c;
 IF jsonb_array_length(case_list)=100 AND EXISTS(SELECT 1 FROM erp_private.t13_cases earlier WHERE earlier.company_id=company
   AND earlier.branch_id=p_branch AND earlier.id<page_boundary
   AND ((earlier.source_kind='fine' AND can_read_fine) OR (earlier.source_kind='damage' AND can_intake_damage))) THEN
  next_before:=page_boundary;
 END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',i.id,'asset_id',i.asset_id,'reference',i.reference,'occurred_at',i.occurred_at,
  'summary',CASE WHEN can_link THEN i.summary END,
  'activities',CASE WHEN can_link THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',a.id,'kind',a.kind,
    'parent',coalesce(a.work_order_id,a.repair_cycle_id,a.hse_hold_id),'reference',a.external_reference,
    'evidence',CASE WHEN can_preview AND erp_private.document_permission(e.document_id,'dms.documents.preview')
     THEN jsonb_build_object('document',e.document_id,'version',e.version_id,'file',e.file_id,'reference',e.reference) END) ORDER BY a.id)
     FROM erp_private.t13_incident_activities a LEFT JOIN erp_private.t13_intake_evidence e ON e.activity_id=a.id
     WHERE a.incident_id=i.id),'[]'::jsonb) ELSE '[]'::jsonb END) ORDER BY i.id DESC),'[]'::jsonb)
 INTO incident_list FROM (SELECT scoped.* FROM erp_private.t13_incidents scoped WHERE scoped.company_id=company
  AND scoped.branch_id=p_branch AND (can_link OR can_record OR can_intake_damage) ORDER BY id DESC LIMIT 100) i;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'asset_id',a.asset_id,'reference',a.source_ref,
   'occurred_at',a.occurred_at,'outcome',a.outcome,'case_id',known.id) ORDER BY a.id DESC),'[]'::jsonb)
 INTO assessments FROM (SELECT eligible.* FROM erp_private.t10_assessments eligible WHERE can_intake_damage
   AND eligible.company_id=company AND eligible.branch_id=p_branch AND eligible.outcome IS NOT NULL
   AND eligible.source_kind<>'planned-service' ORDER BY id DESC LIMIT 100) a
 LEFT JOIN erp_private.t13_cases known ON known.assessment_id=a.id;
 SELECT coalesce(jsonb_agg(jsonb_build_object('document',d.id,'version',v.id,'file',f.id,'label',d.document_no||' · '||d.title,
   'type_code',t.type_code) ORDER BY d.id DESC),'[]'::jsonb) INTO evidence_choices
 FROM (SELECT eligible.id,eligible.document_type_id,eligible.current_version_id,eligible.document_no,eligible.title,eligible.category_id
    FROM public.dms_documents eligible WHERE can_preview AND eligible.owning_company_id=company AND eligible.owning_branch_id=p_branch
     AND eligible.deleted_at IS NULL AND NOT eligible.is_archived AND eligible.status='active' AND eligible.confidentiality_level='internal'
     AND eligible.category_id=(SELECT category.id FROM public.dms_document_categories category
      WHERE category.category_code='T13_FLEET_RECOVERY' AND category.is_active AND category.deleted_at IS NULL)
       ORDER BY eligible.id DESC LIMIT 250) d
 JOIN public.dms_document_types t ON t.id=d.document_type_id AND t.category_id=d.category_id AND t.is_active AND t.deleted_at IS NULL
    AND ((can_record AND t.type_code IN ('T13_AUTHORITY_NOTICE','T13_AUTHORITY_REVISION'))
     OR (can_verify AND t.type_code='T13_DRIVER_EVIDENCE') OR (can_link AND t.type_code='T13_INSURER_RECORD'))
 JOIN public.dms_document_versions v ON v.id=d.current_version_id AND v.document_id=d.id AND v.is_current AND v.unlinked_at IS NULL
 JOIN LATERAL(SELECT originals.id FROM public.dms_document_files originals WHERE originals.document_id=d.id
    AND originals.version_id=v.id AND originals.file_role='original' AND originals.deleted_at IS NULL
    AND originals.integrity_status='verified' AND originals.file_size_bytes>0 AND originals.sha256_hash~'^[0-9a-f]{64}$'
    AND NOT EXISTS(SELECT 1 FROM erp_private.t13_intake_evidence used WHERE used.file_id=originals.id)
    ORDER BY originals.id LIMIT 1) f ON true
 WHERE erp_private.t13_evidence_is_operative(d.id) AND erp_private.document_permission(d.id,'dms.documents.preview');
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'label',a.asset_no||' · '||a.name) ORDER BY a.asset_no),'[]'::jsonb)
 INTO assets FROM (SELECT eligible.id,eligible.asset_no,eligible.name FROM erp_private.fleet_assets eligible
   CROSS JOIN LATERAL erp_private.t06_operation_scope(eligible.id) operating
   WHERE can_link AND eligible.status='active' AND operating.company_id=company AND operating.branch_id=p_branch
   ORDER BY eligible.asset_no LIMIT 100) a;
 RETURN jsonb_build_object('company_id',company,'branch_id',p_branch,'cases',case_list,'incidents',incident_list,'next_before',next_before,
   'assessments',assessments,'evidence_choices',evidence_choices,'assets',assets,'can_record',can_record,'can_match',can_match,'can_verify',can_verify,
   'can_intake_damage',can_intake_damage,'can_link',can_link);
END;
$$;

CREATE FUNCTION public.t13_fleet_workspace(p_branch bigint) RETURNS jsonb
LANGUAGE sql SET search_path='' AS $$
 SELECT public.t13_fleet_workspace_page(p_branch,NULL);
$$;
CREATE FUNCTION public.t13_driver_choices(p_case bigint,p_search text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE c erp_private.t13_cases; needle text:=lower(btrim(p_search)); choices jsonb;
BEGIN
 IF length(coalesce(needle,'')) NOT BETWEEN 2 AND 80 THEN RETURN '[]'::jsonb; END IF;
 SELECT * INTO c FROM erp_private.t13_cases WHERE id=p_case AND source_kind='fine'
   AND custody_commitment_id IS NOT NULL AND source_status<>'cancelled';
 IF c.id IS NULL OR c.reported_by=public.current_user_profile_id() OR NOT erp_private.t02_has_scope('fleet.fines.verify',c.company_id,c.branch_id) THEN RETURN '[]'::jsonb; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',e.id,'label',e.employee_code||' · '||e.full_name_en) ORDER BY e.employee_code),'[]'::jsonb)
 INTO choices FROM (
   SELECT employee.id,employee.employee_code,employee.full_name_en FROM public.employees employee
   JOIN erp_private.t03_employment_periods employment ON employment.employee_id=employee.id
     AND employment.branch_id IS NOT NULL AND employment.work_period @> (c.occurred_at AT TIME ZONE 'Asia/Dubai')::date
   WHERE employee.deleted_at IS NULL AND position(needle in lower(employee.employee_code||' '||employee.full_name_en))>0
     AND erp_private.t02_has_scope('fleet.fines.verify',employment.company_id,employment.branch_id)
   ORDER BY employee.employee_code LIMIT 20
 ) e;
 RETURN choices;
END;
$$;
CREATE FUNCTION public.t13_fleet_scopes() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE scopes jsonb;
BEGIN
 IF NOT erp_private.business_principal_is_active() THEN RETURN '[]'::jsonb; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(visible) ORDER BY visible.owner_company_id,visible.branch_name_en,visible.id),'[]'::jsonb)
 INTO scopes FROM (
   SELECT b.id,b.owner_company_id,b.branch_name_en,b.branch_code FROM public.branches b
   WHERE EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_profile_id=public.current_user_profile_id()
      AND r.owner_company_id=b.owner_company_id AND (r.branch_id IS NULL OR r.branch_id=b.id) AND r.is_active)
    AND (erp_private.t02_has_scope('fleet.fines.record',b.owner_company_id,b.id)
      OR erp_private.t02_has_scope('fleet.fines.view',b.owner_company_id,b.id)
      OR erp_private.t02_has_scope('fleet.fines.match',b.owner_company_id,b.id)
      OR erp_private.t02_has_scope('fleet.fines.verify',b.owner_company_id,b.id)
      OR erp_private.t02_has_scope('fleet.incidents.manage',b.owner_company_id,b.id)
      OR erp_private.t02_has_scope('workshop.recoveries.intake',b.owner_company_id,b.id))
 ) visible;
 RETURN scopes;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.t13_evidence_is_operative(bigint),erp_private.t13_original(bigint,bigint,jsonb,text[]),
 erp_private.t13_capture_intake(bigint,bigint,text,jsonb),erp_private.t13_retain_intake(),erp_private.t13_keep_intake_history(),
 erp_private.t13_source_digest(bigint),erp_private.t13_at(text),erp_private.t13_money(jsonb,text,text),
 erp_private.t13_notice_terms(jsonb,timestamptz,text,numeric),erp_private.t13_reference_key(text),
 erp_private.t13_asset_at(bigint,bigint,bigint,timestamptz),erp_private.t13_plate_at(erp_private.t13_cases),
 erp_private.t13_find_custody(erp_private.t13_cases),erp_private.t13_related_incident(bigint,bigint,bigint,bigint,timestamptz),
 erp_private.t13_damage_source(bigint),erp_private.t13_link_activity(erp_private.t13_incidents,jsonb,bigint),
 erp_private.t13_case_result(erp_private.t13_cases),erp_private.t13_case_workspace(erp_private.t13_cases,boolean,boolean),
 public.t13_fleet_command(uuid,bigint,text,jsonb),public.t13_fleet_workspace(bigint),public.t13_fleet_workspace_page(bigint,bigint),public.t13_driver_choices(bigint,text),public.t13_fleet_scopes() FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.t13_fleet_command(uuid,bigint,text,jsonb),public.t13_fleet_workspace(bigint),public.t13_fleet_workspace_page(bigint,bigint),public.t13_driver_choices(bigint,text),public.t13_fleet_scopes() TO authenticated;

COMMIT;
