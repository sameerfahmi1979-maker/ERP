BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

INSERT INTO public.permissions(permission_code,permission_name,module_code,action_code,administrator_scope)
VALUES ('hr.requests.submit.self','Submit own HR requests','hr','submit','branch');

-- These ordinary-role grants never appoint a user or confer staff/DMS authority.
DO $$
DECLARE role_id bigint;
BEGIN
  SELECT id INTO STRICT role_id FROM public.roles WHERE role_code='employee_self_service' AND is_active;
  IF (SELECT count(*) FROM public.permissions WHERE is_active AND permission_code IN
    ('hr.requests.submit.self','hr.employees.view.self','hr.leave.view.self','hr.attendance.view.self',
     'hr.compliance.view.self','hr.actions.view.self')) <> 6 THEN
    RAISE EXCEPTION 'Reviewed self-service permissions are missing or inactive';
  END IF;
  INSERT INTO public.role_permissions(role_id,permission_id)
    SELECT role_id,p.id FROM public.permissions p WHERE p.permission_code IN
      ('hr.requests.submit.self','hr.employees.view.self','hr.leave.view.self','hr.attendance.view.self',
       'hr.compliance.view.self','hr.actions.view.self') ON CONFLICT DO NOTHING;
END $$;

CREATE TABLE erp_private.hr_self_service_requests(
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 employee_id bigint NOT NULL REFERENCES public.employees,
 company_id bigint NOT NULL REFERENCES public.owner_companies,
 branch_id bigint REFERENCES public.branches,
 requester uuid NOT NULL,
 kind text NOT NULL CHECK (kind IN ('profile-correction','attendance-correction','compliance-renewal')),
 proposal jsonb NOT NULL,
 status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
 revision bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
 decided_at timestamptz, decided_by uuid, decision_reason text,
 CHECK ((status='pending' AND revision=1 AND decided_by IS NULL AND decided_at IS NULL)
     OR (status<>'pending' AND revision=2 AND decided_by IS NOT NULL AND decided_at IS NOT NULL AND decided_by<>requester))
);
CREATE INDEX hr_self_request_actor ON erp_private.hr_self_service_requests(requester,id);
CREATE INDEX hr_self_request_subject ON erp_private.hr_self_service_requests(employee_id,id);
CREATE INDEX hr_self_request_reviewer ON erp_private.hr_self_service_requests(company_id,branch_id,id) WHERE status='pending';
CREATE TABLE erp_private.hr_self_operation_receipts(
 actor uuid NOT NULL, operation_id uuid NOT NULL, action text NOT NULL, request_hash text NOT NULL,
 result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT clock_timestamp(), PRIMARY KEY(actor,operation_id)
);
-- A short-lived admission is visible only to the exact submitting DB transaction.
CREATE TABLE erp_private.hr_self_leave_admissions(
 actor uuid NOT NULL, tx xid8 NOT NULL, backend integer NOT NULL, employee_id bigint NOT NULL, operation_id uuid NOT NULL,
 data jsonb NOT NULL, action text NOT NULL, request_hash text NOT NULL, PRIMARY KEY(actor,tx)
);
-- An F11 receipt proves an ERP action. Only a separate, consumed admission
-- proves that this operation also passed the original mobile independence checks.
CREATE TABLE erp_private.hr_mobile_staff_admissions(
 actor uuid NOT NULL, operation_id uuid NOT NULL, tx xid8 NOT NULL, backend integer NOT NULL,
 action text NOT NULL, employee_id bigint NOT NULL, record_id bigint NOT NULL, opening_revision bigint NOT NULL,
 mobile_hash text NOT NULL, native_hash text NOT NULL, PRIMARY KEY(actor,operation_id)
);
ALTER TABLE erp_private.hr_mobile_staff_admissions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.hr_mobile_staff_admissions FROM PUBLIC,anon,authenticated,service_role;
CREATE FUNCTION erp_private.mobile_hr_settle_staff() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF EXISTS(SELECT FROM erp_private.hr_mobile_staff_admissions a WHERE a.actor=NEW.actor AND a.operation_id=NEW.operation_id AND a.tx=NEW.tx) THEN
  RAISE EXCEPTION 'Unsettled staff decision cannot commit' USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_settle_staff() FROM PUBLIC,anon,authenticated,service_role;
CREATE CONSTRAINT TRIGGER mobile_hr_staff_settlement AFTER INSERT ON erp_private.hr_mobile_staff_admissions
 DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION erp_private.mobile_hr_settle_staff();
CREATE TABLE erp_private.hr_self_leave_evidence(
 leave_id bigint PRIMARY KEY REFERENCES public.employee_leave_requests, document_id bigint NOT NULL REFERENCES public.dms_documents,
 version_id bigint NOT NULL REFERENCES public.dms_document_versions,
 original_file_id bigint NOT NULL, original_sha256 text NOT NULL CHECK(original_sha256~'^[0-9a-f]{64}$'),
 original_bytes bigint NOT NULL CHECK(original_bytes>0)
);
ALTER TABLE erp_private.hr_self_service_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.hr_self_operation_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.hr_self_leave_admissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE erp_private.hr_self_leave_evidence ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.hr_self_service_requests,erp_private.hr_self_operation_receipts,
 erp_private.hr_self_leave_admissions,erp_private.hr_self_leave_evidence FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.mobile_hr_self(eid bigint) RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT public.f03_current_session_valid() AND EXISTS(
   SELECT 1 FROM public.erp_user_employee_links l JOIN public.user_profiles u ON u.id=l.user_profile_id
   JOIN public.employees e ON e.id=l.employee_id
   WHERE l.user_profile_id=public.current_user_profile_id() AND l.employee_id=eid AND e.deleted_at IS NULL
     AND u.owner_company_id=e.owner_company_id AND u.branch_id IS NOT DISTINCT FROM e.branch_id)
$$;
CREATE FUNCTION erp_private.mobile_hr_domain(eid bigint,kind text,proposal jsonb) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT (public.current_user_can_view_employee(eid) OR (kind IN ('leave','attendance-correction','compliance-renewal')
   AND erp_private.mobile_hr_self(eid) AND erp_private.employee_permission(eid,'hr.requests.submit'))) AND erp_private.employee_permission(eid,
   CASE kind WHEN 'profile-correction' THEN 'hr.employees.view' WHEN 'attendance-correction' THEN 'hr.attendance.view'
    WHEN 'attendance' THEN 'hr.attendance.view' WHEN 'compliance-renewal' THEN 'hr.compliance.view'
    WHEN 'leave' THEN 'hr.leave.view' WHEN 'approval' THEN 'hr.actions.view' END)
   AND (proposal->>'sourceKind' IS DISTINCT FROM 'medical-insurance' OR erp_private.employee_permission(eid,'hr.medical.view'))
$$;
CREATE FUNCTION erp_private.mobile_hr_officer(eid bigint,kind text,proposal jsonb) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT public.f03_current_session_valid() AND public.current_user_can_view_employee(eid) AND erp_private.mobile_hr_domain(eid,kind,proposal)
   AND NOT EXISTS(SELECT 1 FROM public.erp_user_employee_links l WHERE l.user_profile_id=public.current_user_profile_id() AND l.employee_id=eid)
   AND CASE kind WHEN 'leave' THEN erp_private.f11_child_authorized('leave-request',eid)
                 WHEN 'attendance' THEN erp_private.f11_child_authorized('attendance-summary',eid)
                 WHEN 'approval' THEN erp_private.f11_child_authorized('approval',eid)
   ELSE erp_private.f11_child_authorized('approval',eid) AND
     CASE kind WHEN 'profile-correction' THEN erp_private.employee_permission(eid,'hr.employees.update')
               WHEN 'attendance-correction' THEN erp_private.f11_child_authorized('attendance-summary',eid)
               WHEN 'compliance-renewal' THEN erp_private.hr_compliance_renewal_authorized(eid,proposal->>'sourceKind')
               ELSE false END END
$$;

CREATE FUNCTION erp_private.mobile_hr_keys(data jsonb,required text[],optional text[] DEFAULT '{}') RETURNS void
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN
 IF jsonb_typeof(data) IS DISTINCT FROM 'object' OR NOT(data ?& required)
    OR EXISTS(SELECT 1 FROM jsonb_object_keys(data) k WHERE NOT(k=ANY(required||optional)) OR data->k='null') THEN
   RAISE EXCEPTION 'Missing or unexpected HR request field' USING ERRCODE='22023';
 END IF;
END $$;
CREATE FUNCTION erp_private.mobile_hr_text(v jsonb,n integer) RETURNS text
LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
DECLARE cleaned text:=btrim(v#>>'{}',E' \t\n\r\f\v'||U&'\00A0\1680\2000\2001\2002\2003\2004\2005\2006\2007\2008\2009\200A\2028\2029\202F\205F\3000\FEFF');
BEGIN
 IF jsonb_typeof(v) IS DISTINCT FROM 'string' OR length(cleaned) NOT BETWEEN 1 AND n THEN
   RAISE EXCEPTION 'Text is required within the field length' USING ERRCODE='22023';
 END IF;
 RETURN cleaned;
END $$;

-- Verify a real file in the exact employee's DMS folder; a numeric document ID is never authority.
CREATE FUNCTION erp_private.mobile_hr_evidence(eid bigint,did bigint,vid bigint) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT 1 FROM public.employees e JOIN public.dms_documents d ON d.owning_company_id=e.owner_company_id
   AND (d.owning_branch_id IS NULL OR d.owning_branch_id=e.branch_id)
   JOIN public.dms_document_versions v ON v.document_id=d.id AND d.current_version_id=v.id AND v.unlinked_at IS NULL
   WHERE e.id=eid AND e.deleted_at IS NULL AND d.id=did AND v.id=vid AND d.deleted_at IS NULL
    AND NOT d.is_archived AND d.status IN ('active','approved')
    AND public.current_user_can_view_dms_document(did)
    AND NOT EXISTS(SELECT FROM public.dms_document_links l WHERE l.document_id=did AND l.deleted_at IS NULL AND l.entity_type='employee_dependent')
    AND erp_private.document_permission(did,'dms.documents.view') AND erp_private.document_permission(did,'dms.documents.preview')
    AND EXISTS(SELECT 1 FROM public.dms_document_files f WHERE f.document_id=did AND f.version_id=vid AND f.file_role='original' AND f.deleted_at IS NULL AND f.file_size_bytes>0 AND f.integrity_status<>'failed')
    AND (SELECT count(*) FROM public.dms_document_files f WHERE f.document_id=did AND f.version_id=vid AND f.file_role='original' AND f.deleted_at IS NULL)=1
    AND EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=did AND l.deleted_at IS NULL AND l.entity_type='employee' AND l.entity_id=eid)
    AND NOT EXISTS(SELECT 1 FROM public.dms_document_links l WHERE l.document_id=did AND l.deleted_at IS NULL AND l.entity_type='employee' AND l.entity_id IS DISTINCT FROM eid))
$$;

CREATE FUNCTION erp_private.mobile_hr_validate_proposal(eid bigint,kind text,p jsonb) RETURNS void
LANGUAGE plpgsql SET search_path='' AS $$
DECLARE changes jsonb; k text; src record; table_name text; day date;
BEGIN
 CASE kind
 WHEN 'profile-correction' THEN
  PERFORM erp_private.mobile_hr_keys(p,ARRAY['sourceRevision','changes']);
  changes:=p->'changes';
  PERFORM erp_private.mobile_hr_keys(changes,'{}',ARRAY['mobile_number','personal_email','emergency_contact_name','emergency_contact_mobile']);
  IF changes='{}' THEN RAISE EXCEPTION 'Contact correction required' USING ERRCODE='22023'; END IF;
  FOR k IN SELECT jsonb_object_keys(changes) LOOP
   IF changes->>k IS DISTINCT FROM erp_private.mobile_hr_text(changes->k,CASE k WHEN 'personal_email' THEN 254 WHEN 'emergency_contact_name' THEN 160 ELSE 40 END)
      OR changes->>k ~ '[[:cntrl:]]' THEN RAISE EXCEPTION 'Use a trimmed, single-line contact value' USING ERRCODE='22023'; END IF;
   IF k='personal_email' AND changes->>k !~ '^[^@[:space:]]+@[^@[:space:]]+[.][^@[:space:]]+$' THEN RAISE EXCEPTION 'Invalid email' USING ERRCODE='22023'; END IF;
  END LOOP;
  IF NOT EXISTS(SELECT FROM public.employees WHERE id=eid AND workspace_revision=(p->>'sourceRevision')::bigint) THEN RAISE EXCEPTION 'Profile changed' USING ERRCODE='PT409'; END IF;
 WHEN 'attendance-correction' THEN
  PERFORM erp_private.mobile_hr_keys(p,ARRAY['date','reason'],ARRAY['summaryId','sourceRevision']);
  PERFORM erp_private.mobile_hr_text(p->'reason',2000);
  IF jsonb_typeof(p->'date')<>'string' OR p->>'date' !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN RAISE EXCEPTION 'ISO attendance date required' USING ERRCODE='22023'; END IF;
  BEGIN day:=(p->>'date')::date; EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN RAISE EXCEPTION 'Invalid calendar date' USING ERRCODE='22023'; END;
  IF NOT isfinite(day) OR day::text IS DISTINCT FROM p->>'date' OR day>(now() AT TIME ZONE 'Asia/Dubai')::date OR (p?'summaryId')<>(p?'sourceRevision') THEN RAISE EXCEPTION 'Invalid attendance correction opening' USING ERRCODE='22023'; END IF;
  SELECT id,workspace_revision INTO src FROM public.employee_attendance_daily_summary WHERE employee_id=eid AND attendance_date=day FOR SHARE;
  IF src.id IS DISTINCT FROM (p->>'summaryId')::bigint OR src.workspace_revision IS DISTINCT FROM (p->>'sourceRevision')::bigint THEN RAISE EXCEPTION 'Attendance changed; reopen' USING ERRCODE='PT409'; END IF;
 WHEN 'compliance-renewal' THEN
  PERFORM erp_private.mobile_hr_keys(p,ARRAY['sourceKind','sourceId','sourceRevision'],ARRAY['documentId','documentVersionId','reason']);
  IF p?'reason' OR NOT(p?'documentId') THEN PERFORM erp_private.mobile_hr_text(p->'reason',2000); END IF;
  IF (p?'documentId')<>(p?'documentVersionId') THEN RAISE EXCEPTION 'Exact DMS version required' USING ERRCODE='22023'; END IF;
  table_name:=CASE p->>'sourceKind' WHEN 'identity-document' THEN 'employee_identity_documents' WHEN 'access-card' THEN 'employee_access_cards'
    WHEN 'training-certificate' THEN 'employee_training_certificates' WHEN 'medical-insurance' THEN 'employee_medical_insurances' END;
  IF table_name IS NULL THEN RAISE EXCEPTION 'Unsupported renewal source' USING ERRCODE='22023'; END IF;
  EXECUTE format('SELECT workspace_revision,dms_document_id FROM public.%I WHERE id=$1 AND employee_id=$2 AND deleted_at IS NULL FOR SHARE',table_name)
   INTO src USING (p->>'sourceId')::bigint,eid;
  IF src.workspace_revision IS NULL OR src.workspace_revision IS DISTINCT FROM (p->>'sourceRevision')::bigint THEN RAISE EXCEPTION 'Renewal source changed or unavailable' USING ERRCODE='PT409'; END IF;
  IF p?'documentId' THEN
   PERFORM 1 FROM public.dms_documents WHERE id=(p->>'documentId')::bigint FOR SHARE;
   IF NOT erp_private.mobile_hr_evidence(eid,(p->>'documentId')::bigint,(p->>'documentVersionId')::bigint) OR src.dms_document_id=(p->>'documentId')::bigint
    OR (src.dms_document_id IS NOT NULL AND NOT EXISTS(SELECT FROM public.dms_documents o JOIN public.dms_documents n ON n.document_type_id=o.document_type_id WHERE o.id=src.dms_document_id AND n.id=(p->>'documentId')::bigint)) THEN
    RAISE EXCEPTION 'Current employee replacement evidence unavailable' USING ERRCODE='42501';
   END IF;
  END IF;
 ELSE RAISE EXCEPTION 'Unsupported request kind' USING ERRCODE='22023';
 END CASE;
END $$;
-- Dedicated admission for two transitions. F12 before/after triggers and all other
-- source, revision and audit hooks remain installed. A GUC is never an admission.
CREATE FUNCTION erp_private.mobile_hr_capture_leave(n jsonb,o jsonb) RETURNS boolean LANGUAGE plpgsql SET search_path='' AS $$
DECLARE gate erp_private.hr_self_leave_admissions; actor bigint:=public.current_user_profile_id(); e public.employees; d jsonb;
BEGIN
 DELETE FROM erp_private.hr_self_leave_admissions AS a WHERE a.tx=pg_current_xact_id() AND a.backend=pg_backend_pid() AND a.actor=auth.uid() RETURNING * INTO gate;
 IF NOT FOUND THEN RETURN false; END IF;
 d:=gate.data;
 IF NOT erp_private.mobile_hr_self(gate.employee_id) OR NOT erp_private.employee_permission(gate.employee_id,'hr.requests.submit')
   OR NOT erp_private.mobile_hr_domain(gate.employee_id,'leave','{}') OR gate.employee_id IS DISTINCT FROM (n->>'employee_id')::bigint THEN
  RAISE EXCEPTION 'Current own leave admission required' USING ERRCODE='42501'; END IF;
 IF gate.action='leave.submit' THEN
  IF o IS NOT NULL OR n->>'approval_status' IS DISTINCT FROM 'pending' OR (n->>'created_by')::bigint IS DISTINCT FROM actor
    OR (n->>'updated_by')::bigint IS DISTINCT FROM actor OR (n->>'workspace_revision')::bigint IS DISTINCT FROM 1
    OR (n->>'leave_type_id')::bigint IS DISTINCT FROM (d->>'leaveTypeId')::bigint OR n->>'start_date' IS DISTINCT FROM d->>'startDate'
    OR n->>'end_date' IS DISTINCT FROM d->>'endDate' OR n->>'reason' IS DISTINCT FROM d->>'reason'
    OR (n->>'sick_cert_dms_id')::bigint IS DISTINCT FROM (d->>'documentId')::bigint
    OR (n->>'total_days')::numeric IS DISTINCT FROM ((n->>'end_date')::date-(n->>'start_date')::date+1)::numeric
    OR n->>'approved_by' IS NOT NULL OR n->>'rejected_by' IS NOT NULL OR n->>'cancelled_by' IS NOT NULL OR n->>'deleted_at' IS NOT NULL THEN
    RAISE EXCEPTION 'Invalid employee leave submission' USING ERRCODE='23514'; END IF;
 ELSE
  IF gate.action<>'leave.cancel' OR o IS NULL OR o->>'approval_status' IS DISTINCT FROM 'pending'
    OR n->>'approval_status' IS DISTINCT FROM 'cancelled' OR (o->>'created_by')::bigint IS DISTINCT FROM actor
    OR (o->>'id')::bigint IS DISTINCT FROM (d->>'id')::bigint OR (o->>'workspace_revision')::bigint IS DISTINCT FROM (d->>'revision')::bigint
    OR (n->>'cancelled_by')::bigint IS DISTINCT FROM actor OR (n->>'updated_by')::bigint IS DISTINCT FROM actor OR n->>'cancelled_at' IS NULL
    OR n->>'notes' IS DISTINCT FROM d->>'reason' OR (n->>'workspace_revision')::bigint<>(o->>'workspace_revision')::bigint+1
    OR (n-ARRAY['approval_status','notes','cancelled_by','cancelled_at','updated_by','updated_at','workspace_revision'])
     IS DISTINCT FROM (o-ARRAY['approval_status','notes','cancelled_by','cancelled_at','updated_by','updated_at','workspace_revision']) THEN
    RAISE EXCEPTION 'Original pending employee leave required' USING ERRCODE='23514'; END IF;
 END IF;
 INSERT INTO erp_private.f11_child_receipts(actor,operation_id,kind,action,employee_id,record_id,revision,request_hash)
 VALUES(auth.uid(),gate.operation_id,'leave-request',CASE gate.action WHEN 'leave.submit' THEN 'create' ELSE 'cancel' END,gate.employee_id,(n->>'id')::bigint,(n->>'workspace_revision')::bigint,gate.request_hash);
 RETURN true;
END $$;

DO $$
DECLARE def text; marker text:='PERFORM erp_private.f11_verify_time_admission';
BEGIN
 SELECT pg_get_functiondef(oid) INTO STRICT def FROM pg_proc WHERE oid='erp_private.f11_capture_time_child()'::regprocedure AND md5(prosrc)='aa036538ba96e939b23c952ca9a0b17d' AND md5(pg_get_functiondef(oid))='d8bb68767e32bf153304dbcc704cce5e';
 IF position(marker IN def)=0 THEN RAISE EXCEPTION 'Unrecognized F11 capture'; END IF;
 EXECUTE replace(def,marker,'IF TG_TABLE_NAME=''employee_leave_requests'' AND erp_private.mobile_hr_capture_leave(to_jsonb(NEW),CASE WHEN TG_OP=''UPDATE'' THEN to_jsonb(OLD) END) THEN RETURN NEW; END IF; '||marker);
END $$;

-- Self-submitted leave also retains independence and evidence checks when an
-- officer opens the same ERP request in the existing staff workflow.
CREATE FUNCTION erp_private.mobile_hr_check_leave_certificate(r public.employee_leave_requests) RETURNS void LANGUAGE plpgsql SET search_path='' AS $$
DECLARE evidence erp_private.hr_self_leave_evidence; required boolean;
BEGIN
 SELECT t.requires_document INTO required FROM public.hr_leave_types t WHERE t.id=r.leave_type_id AND t.is_active AND t.deleted_at IS NULL FOR SHARE;
 IF NOT FOUND OR required IS NULL THEN RAISE EXCEPTION 'Current leave policy unavailable' USING ERRCODE='23514'; END IF;
 SELECT * INTO evidence FROM erp_private.hr_self_leave_evidence WHERE leave_id=r.id;
 IF NOT FOUND THEN
  IF required OR r.sick_cert_dms_id IS NOT NULL THEN RAISE EXCEPTION 'Current policy requires a pinned certificate; officer review required' USING ERRCODE='23514'; END IF;
  RETURN;
 END IF;
 PERFORM 1 FROM public.dms_documents WHERE id=evidence.document_id FOR SHARE;
 IF evidence.document_id IS DISTINCT FROM r.sick_cert_dms_id OR NOT erp_private.employee_permission(r.employee_id,'hr.medical.view')
  OR NOT erp_private.mobile_hr_evidence(r.employee_id,evidence.document_id,evidence.version_id) OR NOT EXISTS(
   SELECT FROM public.dms_document_files f WHERE f.id=evidence.original_file_id AND f.document_id=evidence.document_id AND f.version_id=evidence.version_id
     AND f.file_role='original' AND f.deleted_at IS NULL AND f.integrity_status='verified' AND f.file_size_bytes=evidence.original_bytes
     AND f.file_size_bytes>0 AND f.sha256_hash=evidence.original_sha256 AND f.sha256_hash~'^[0-9a-f]{64}$') THEN
  RAISE EXCEPTION 'Current verified original leave certificate unavailable or changed' USING ERRCODE='42501';
 END IF;
END $$;
REVOKE ALL ON FUNCTION erp_private.mobile_hr_check_leave_certificate(public.employee_leave_requests) FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.mobile_hr_leave_decision_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF auth.uid() IS NULL OR OLD.approval_status<>'pending' OR NEW.approval_status NOT IN ('approved','rejected') THEN RETURN NEW; END IF;
 IF EXISTS(SELECT FROM erp_private.hr_self_operation_receipts r WHERE r.action='leave.submit' AND (r.result->>'id')::bigint=OLD.id) THEN
  IF OLD.created_by IS NULL OR OLD.created_by=public.current_user_profile_id() OR NOT erp_private.mobile_hr_officer(OLD.employee_id,'leave','{}') THEN
   RAISE EXCEPTION 'Independent current leave reviewer required' USING ERRCODE='42501'; END IF;
  IF NEW.approval_status='approved' THEN PERFORM erp_private.mobile_hr_check_leave_certificate(OLD); END IF;
 END IF;
 RETURN NEW;
END $$;
CREATE INDEX hr_self_leave_submission ON erp_private.hr_self_operation_receipts(((result->>'id')::bigint)) WHERE action='leave.submit';
CREATE TRIGGER mobile_hr_leave_decision_guard BEFORE UPDATE OF approval_status ON public.employee_leave_requests FOR EACH ROW EXECUTE FUNCTION erp_private.mobile_hr_leave_decision_guard();

CREATE FUNCTION erp_private.mobile_hr_request_visible(r erp_private.hr_self_service_requests,mode text) RETURNS boolean
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT EXISTS(SELECT FROM public.employees e WHERE e.id=r.employee_id AND e.deleted_at IS NULL AND e.owner_company_id=r.company_id AND e.branch_id IS NOT DISTINCT FROM r.branch_id)
  AND erp_private.mobile_hr_domain(r.employee_id,r.kind,r.proposal)
  AND CASE mode WHEN 'mine' THEN r.requester=auth.uid() AND erp_private.mobile_hr_self(r.employee_id) AND erp_private.employee_permission(r.employee_id,'hr.requests.submit')
        WHEN 'officer' THEN r.requester<>auth.uid() AND erp_private.mobile_hr_officer(r.employee_id,r.kind,r.proposal)
        WHEN 'review' THEN r.status='pending' AND r.requester<>auth.uid() AND erp_private.mobile_hr_officer(r.employee_id,r.kind,r.proposal)
        WHEN 'team' THEN erp_private.employee_permission(r.employee_id,'hr.actions.view') AND EXISTS(
         SELECT FROM public.employees e WHERE e.id=r.employee_id AND e.id<>e.reporting_manager_id AND erp_private.mobile_hr_self(e.reporting_manager_id))
        ELSE false END
$$;
CREATE FUNCTION erp_private.mobile_hr_request_item(r erp_private.hr_self_service_requests) RETURNS jsonb
LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT jsonb_build_object('id',r.id,'employeeId',r.employee_id,'kind',r.kind,'status',r.status,'revision',r.revision,
  'createdAt',r.created_at,'decidedAt',r.decided_at,'decisionReason',CASE WHEN erp_private.mobile_hr_request_visible(r,'mine') OR erp_private.mobile_hr_request_visible(r,'officer') THEN r.decision_reason END,
  'proposal',CASE WHEN NOT (erp_private.mobile_hr_request_visible(r,'mine') OR erp_private.mobile_hr_request_visible(r,'officer')) THEN '{}'::jsonb WHEN r.proposal?'documentId' AND NOT erp_private.mobile_hr_evidence(r.employee_id,(r.proposal->>'documentId')::bigint,(r.proposal->>'documentVersionId')::bigint)
   THEN r.proposal-'documentId'-'documentVersionId' ELSE r.proposal END,
  'canDecide',erp_private.mobile_hr_request_visible(r,'review'))
$$;

CREATE FUNCTION erp_private.mobile_hr_read(action text,d jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path='' AS $$
DECLARE r erp_private.hr_self_service_requests; page_size integer; after_id bigint; items jsonb; mode text:=d->>'mode'; next_id bigint;
BEGIN
 IF action='request.open' THEN
  PERFORM erp_private.mobile_hr_keys(d,ARRAY['id']);
  SELECT * INTO r FROM erp_private.hr_self_service_requests WHERE id=(d->>'id')::bigint;
  IF NOT FOUND OR NOT(erp_private.mobile_hr_request_visible(r,'mine') OR erp_private.mobile_hr_request_visible(r,'officer') OR erp_private.mobile_hr_request_visible(r,'team')) THEN RAISE EXCEPTION 'HR request unavailable' USING ERRCODE='42501'; END IF;
  RETURN erp_private.mobile_hr_request_item(r);
 END IF;
 PERFORM erp_private.mobile_hr_keys(d,ARRAY['mode'],ARRAY['afterId','limit','employeeId']);
 page_size:=coalesce((d->>'limit')::int,25); after_id:=coalesce((d->>'afterId')::bigint,0);
 IF mode NOT IN ('mine','review','team') OR page_size NOT BETWEEN 1 AND 50 OR after_id<0 THEN RAISE EXCEPTION 'Invalid request page' USING ERRCODE='22023'; END IF;
 WITH candidates AS MATERIALIZED (
  SELECT s FROM erp_private.hr_self_service_requests s WHERE s.id>after_id AND (mode<>'review' OR s.status='pending') AND (mode<>'mine' OR s.requester=auth.uid()) AND (NOT(d?'employeeId') OR s.employee_id=(d->>'employeeId')::bigint)
    AND erp_private.mobile_hr_request_visible(s,mode) ORDER BY s.id LIMIT page_size+1
 ), numbered AS (SELECT s,row_number() OVER(ORDER BY (s).id) AS n FROM candidates)
 SELECT coalesce(jsonb_agg(erp_private.mobile_hr_request_item(s) ORDER BY n) FILTER(WHERE n<=page_size),'[]'),
  CASE WHEN count(*)>page_size THEN max((s).id) FILTER(WHERE n=page_size) END INTO items,next_id FROM numbered;
 RETURN jsonb_build_object('items',items,'nextAfterId',next_id);
END $$;
CREATE FUNCTION erp_private.mobile_hr_command(action text,d jsonb,finish boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE actor bigint:=public.current_user_profile_id(); op uuid; eid bigint; target_id bigint; original_rev bigint; rev bigint;
 e public.employees; r erp_private.hr_self_service_requests; original public.employee_leave_requests;
 rec erp_private.hr_self_operation_receipts; typ public.hr_leave_types; domain text; proposal jsonb:='{}'; status text;
 digest text; result jsonb; decision text; reason text; keys text[]:=ARRAY['employeeId','operationId']; fkind text; payload jsonb; fhash text;
 attachments boolean; evidence erp_private.hr_self_leave_evidence; is_officer boolean;
BEGIN
 IF auth.uid() IS NULL OR actor IS NULL OR NOT public.f03_current_session_valid() OR NOT erp_private.business_principal_is_active() THEN
  RAISE EXCEPTION 'Active ERP session required' USING ERRCODE='42501'; END IF;
 IF action IS NULL OR d IS NULL OR jsonb_typeof(d)<>'object' OR octet_length(d::text)>16384 OR finish IS NULL THEN RAISE EXCEPTION 'Invalid HR command' USING ERRCODE='22023'; END IF;
 IF action IN ('request.list','request.open') THEN RETURN erp_private.mobile_hr_read(action,d); END IF;
 IF action='receipt' THEN PERFORM erp_private.mobile_hr_keys(d,ARRAY['operationId']); END IF;
 op:=(d->>'operationId')::uuid;
 IF op IS NULL THEN RAISE EXCEPTION 'Operation ID required' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(auth.uid()::text||':'||op::text,0));
 -- Serialize security changes with this command. Shared row locks allow other
 -- submissions and staff readers; revocation/deletion must serialize on the
 -- actual session, profile, assignment, permission or existing employee link.
 PERFORM 1 FROM auth.sessions s JOIN auth.users u ON u.id=s.user_id WHERE s.user_id=auth.uid() AND s.id::text=auth.jwt()->>'session_id' FOR SHARE OF s,u;
 PERFORM 1 FROM public.user_profiles up WHERE up.id=actor FOR SHARE;
 PERFORM 1 FROM public.erp_user_employee_links l WHERE l.user_profile_id=actor FOR SHARE;
 PERFORM 1 FROM public.user_roles ur JOIN public.roles role ON role.id=ur.role_id JOIN public.role_permissions rp ON rp.role_id=role.id
  JOIN public.permissions perm ON perm.id=rp.permission_id WHERE ur.user_profile_id=actor AND ur.is_active AND role.is_active AND perm.is_active
    AND (perm.module_code ILIKE 'hr' OR perm.permission_code LIKE 'dms.%') ORDER BY ur.id,rp.permission_id FOR SHARE OF ur,role,rp,perm;
 PERFORM 1 FROM public.user_roles ur JOIN public.roles role ON role.id=ur.role_id WHERE ur.user_profile_id=actor AND ur.is_active AND role.is_active ORDER BY ur.id FOR SHARE OF ur,role;
 SELECT * INTO rec FROM erp_private.hr_self_operation_receipts x WHERE x.actor=auth.uid() AND x.operation_id=op;
 IF action='receipt' AND rec.actor IS NULL THEN RETURN NULL; END IF;
 digest:=encode(sha256(convert_to(jsonb_build_array(action,d)::text,'UTF8')),'hex');
 eid:=CASE WHEN action='receipt' THEN (rec.result->>'employeeId')::bigint ELSE (d->>'employeeId')::bigint END;
 target_id:=(d->>'id')::bigint; original_rev:=(d->>'revision')::bigint;
 -- Same lock ordering as the native Time writer. Recheck session, role and link
 -- after any wait and before returning even a minimal historic receipt.
 SELECT * INTO e FROM public.employees WHERE id=eid AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR NOT public.f03_current_session_valid() OR public.current_user_profile_id() IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Employee unavailable' USING ERRCODE='42501'; END IF;
 IF action='receipt' THEN
  action:=rec.action; domain:=rec.result->>'kind'; target_id:=(rec.result->>'id')::bigint;
 ELSE
  CASE action
   WHEN 'leave.submit' THEN PERFORM erp_private.mobile_hr_keys(d,keys||ARRAY['leaveTypeId','startDate','endDate','reason'],ARRAY['documentId','documentVersionId']); domain:='leave';
   WHEN 'leave.cancel' THEN PERFORM erp_private.mobile_hr_keys(d,keys||ARRAY['id','revision','reason']); domain:='leave';
   WHEN 'request.submit' THEN PERFORM erp_private.mobile_hr_keys(d,keys||ARRAY['kind','proposal']); domain:=d->>'kind'; proposal:=d->'proposal';
   WHEN 'attendance.approve' THEN PERFORM erp_private.mobile_hr_keys(d,keys||ARRAY['id','revision']); domain:='attendance'; decision:='approve';
   ELSE
    IF action NOT IN ('request.decide','approval.decide','leave.decide') THEN RAISE EXCEPTION 'Unknown HR command' USING ERRCODE='22023'; END IF;
    PERFORM erp_private.mobile_hr_keys(d,keys||ARRAY['id','revision','decision'],ARRAY['reason']);
    domain:=CASE action WHEN 'leave.decide' THEN 'leave' WHEN 'approval.decide' THEN 'approval' END; decision:=d->>'decision';
    IF decision NOT IN ('approve','reject') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023'; END IF;
    IF decision='reject' OR d?'reason' THEN reason:=erp_private.mobile_hr_text(d->'reason',500); END IF;
  END CASE;
 END IF;
 IF action='request.decide' OR (NOT(d?'employeeId') AND action='request.submit') THEN
  SELECT * INTO r FROM erp_private.hr_self_service_requests s WHERE s.id=target_id AND s.employee_id=eid AND s.company_id=e.owner_company_id AND s.branch_id IS NOT DISTINCT FROM e.branch_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'HR request unavailable' USING ERRCODE='42501'; END IF;
  domain:=r.kind; proposal:=r.proposal;
 END IF;
 is_officer:=action IN ('request.decide','approval.decide','leave.decide','attendance.approve');
 IF (is_officer AND (NOT erp_private.mobile_hr_officer(eid,domain,proposal) OR r.requester=auth.uid()))
    OR (NOT is_officer AND NOT(erp_private.mobile_hr_self(eid) AND erp_private.employee_permission(eid,'hr.requests.submit') AND erp_private.mobile_hr_domain(eid,domain,proposal))) THEN
  RAISE EXCEPTION 'Current scoped HR authority required' USING ERRCODE='42501'; END IF;
 IF rec.actor IS NOT NULL THEN
  IF d?'employeeId' AND rec.request_hash<>digest THEN RAISE EXCEPTION 'Operation already used for different input' USING ERRCODE='PT409'; END IF;
  RETURN rec.result||'{"replayed":true}'::jsonb;
 END IF;
 IF action IN ('leave.cancel','request.decide','approval.decide','leave.decide','attendance.approve') AND (target_id<1 OR original_rev<1) THEN RAISE EXCEPTION 'Invalid record opening' USING ERRCODE='22023'; END IF;
 IF action='request.submit' THEN
  PERFORM erp_private.mobile_hr_validate_proposal(eid,domain,proposal);
  INSERT INTO erp_private.hr_self_service_requests(employee_id,company_id,branch_id,requester,kind,proposal)
   VALUES(eid,e.owner_company_id,e.branch_id,auth.uid(),domain,proposal) RETURNING id,revision INTO target_id,rev; status:='pending';
 ELSIF action='request.decide' THEN
  IF r.status<>'pending' OR r.revision<>original_rev THEN RAISE EXCEPTION 'Request changed; reopen' USING ERRCODE='PT409'; END IF;
  IF decision='approve' THEN
   PERFORM erp_private.mobile_hr_validate_proposal(eid,domain,proposal);
   IF domain='profile-correction' THEN
    PERFORM public.save_workspace_record('employees',op,eid,(proposal->>'sourceRevision')::bigint,proposal->'changes');
   END IF;
  END IF;
  status:=CASE decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END;
  UPDATE erp_private.hr_self_service_requests s SET status=CASE decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END,
   decision_reason=reason,decided_by=auth.uid(),decided_at=clock_timestamp(),revision=s.revision+1
   WHERE s.id=target_id RETURNING s.revision INTO rev;
 ELSIF action IN ('leave.submit','leave.cancel') THEN
  reason:=erp_private.mobile_hr_text(d->'reason',CASE action WHEN 'leave.submit' THEN 1000 ELSE 500 END);
  IF reason IS DISTINCT FROM d->>'reason' THEN RAISE EXCEPTION 'Trim leave reason' USING ERRCODE='22023'; END IF;
  INSERT INTO erp_private.hr_self_leave_admissions VALUES(auth.uid(),pg_current_xact_id(),pg_backend_pid(),eid,op,d,action,digest);
  IF action='leave.submit' THEN
   SELECT * INTO typ FROM public.hr_leave_types WHERE id=(d->>'leaveTypeId')::bigint AND is_active AND deleted_at IS NULL FOR SHARE;
   IF NOT FOUND OR typ.reset_basis NOT IN ('calendar_year','joining_anniversary') OR e.joining_date IS NULL OR (d->>'startDate')::date<e.joining_date THEN RAISE EXCEPTION 'Reviewed leave policy unavailable' USING ERRCODE='23514'; END IF;
   PERFORM erp_private.f11_validate_time('leave-request','create',jsonb_build_object('leave_type_id',typ.id,'start_date',d->'startDate','end_date',d->'endDate','reason',reason,'notes',NULL));
   IF (d->>'endDate')::date-(d->>'startDate')::date>365 THEN RAISE EXCEPTION 'Leave span is too long' USING ERRCODE='23514'; END IF;
   attachments:=d?'documentId';
   IF attachments<>(d?'documentVersionId') OR (typ.requires_document AND NOT attachments) THEN RAISE EXCEPTION 'Current document and version required' USING ERRCODE='23514'; END IF;
   IF attachments THEN
    PERFORM 1 FROM public.dms_documents WHERE id=(d->>'documentId')::bigint FOR SHARE;
    IF NOT erp_private.employee_permission(eid,'hr.medical.view') OR NOT erp_private.mobile_hr_evidence(eid,(d->>'documentId')::bigint,(d->>'documentVersionId')::bigint) THEN RAISE EXCEPTION 'Leave attachment unavailable' USING ERRCODE='42501'; END IF;
   END IF;
   INSERT INTO public.employee_leave_requests(employee_id,leave_type_id,start_date,end_date,total_days,reason,approval_status,created_by,updated_by,sick_cert_dms_id)
    VALUES(eid,typ.id,(d->>'startDate')::date,(d->>'endDate')::date,(d->>'endDate')::date-(d->>'startDate')::date+1,reason,'pending',actor,actor,(d->>'documentId')::bigint)
    RETURNING id,workspace_revision INTO target_id,rev;
   IF attachments THEN
    INSERT INTO erp_private.hr_self_leave_evidence(leave_id,document_id,version_id,original_file_id,original_sha256,original_bytes)
     SELECT target_id,f.document_id,f.version_id,f.id,f.sha256_hash,f.file_size_bytes FROM public.dms_document_files f
     WHERE f.document_id=(d->>'documentId')::bigint AND f.version_id=(d->>'documentVersionId')::bigint AND f.file_role='original'
       AND f.deleted_at IS NULL AND f.file_size_bytes>0 AND f.sha256_hash~'^[0-9a-f]{64}$' AND f.integrity_status<>'failed';
    IF NOT FOUND THEN RAISE EXCEPTION 'Leave certificate requires a current original file and SHA-256' USING ERRCODE='23514'; END IF;
   END IF;
   status:='pending';
  ELSE
   SELECT * INTO original FROM public.employee_leave_requests WHERE id=target_id AND employee_id=eid AND deleted_at IS NULL FOR UPDATE;
   IF NOT FOUND OR original.created_by IS DISTINCT FROM actor THEN RAISE EXCEPTION 'Own pending leave required' USING ERRCODE='42501'; END IF;
   IF original.workspace_revision<>original_rev THEN RAISE EXCEPTION 'Leave changed; reopen' USING ERRCODE='PT409'; END IF;
   IF original.approval_status<>'pending' THEN RAISE EXCEPTION 'Only pending leave can be cancelled' USING ERRCODE='23514'; END IF;
   UPDATE public.employee_leave_requests SET approval_status='cancelled',notes=d->>'reason',cancelled_by=actor,cancelled_at=clock_timestamp(),updated_by=actor WHERE id=target_id RETURNING workspace_revision INTO rev;
   status:='cancelled';
  END IF;
  IF EXISTS(SELECT FROM erp_private.hr_self_leave_admissions a WHERE a.actor=auth.uid() AND a.tx=pg_current_xact_id()) THEN RAISE EXCEPTION 'Leave admission did not settle' USING ERRCODE='23514'; END IF;
 ELSE
  -- Staff actions run at authenticated invoker privilege in the public wrapper.
  -- The final receipt is issued only after canonical F11 acceptance of this hash.
  fkind:=CASE domain WHEN 'leave' THEN 'leave-request' WHEN 'attendance' THEN 'attendance-summary' ELSE 'approval' END;
  IF domain='attendance' THEN
   PERFORM 1 FROM public.employee_attendance_daily_summary WHERE employee_id=eid AND id=target_id FOR UPDATE;
  ELSIF domain='approval' THEN
   PERFORM 1 FROM public.employee_approval_requests WHERE employee_id=eid AND id=target_id FOR UPDATE;
  END IF;
  IF domain='leave' THEN
   SELECT * INTO original FROM public.employee_leave_requests WHERE id=target_id AND employee_id=eid AND deleted_at IS NULL FOR UPDATE;
   IF NOT FOUND OR original.created_by IS NULL OR original.created_by=actor THEN RAISE EXCEPTION 'Independent leave reviewer required' USING ERRCODE='42501'; END IF;
  ELSIF domain='approval' AND NOT EXISTS(
    SELECT FROM public.employee_approval_requests a WHERE a.id=target_id AND a.employee_id=eid AND a.deleted_at IS NULL
     AND a.approval_role_id IS NULL AND a.related_record_id IS NULL AND a.related_record_type IS NULL
     AND a.approval_type IN ('hr_action','pro_process','other') AND a.requested_by IS NOT NULL AND a.created_by IS NOT NULL
     AND a.requested_by<>actor AND a.created_by<>actor) THEN RAISE EXCEPTION 'Independent unbound HR approval required' USING ERRCODE='42501';
  ELSIF domain='attendance' AND NOT EXISTS(SELECT 1 FROM public.employee_attendance_daily_summary WHERE employee_id=eid AND id=target_id AND created_by IS NOT NULL AND created_by<>actor AND updated_by IS DISTINCT FROM actor) AND NOT finish THEN RAISE EXCEPTION 'Attendance unavailable' USING ERRCODE='42501';
  END IF;
  payload:=CASE WHEN reason IS NOT NULL AND (decision='reject' OR domain='approval') THEN jsonb_build_object('reason',reason) ELSE '{}'::jsonb END;
  fhash:=encode(sha256(convert_to(jsonb_build_array(fkind,eid,target_id,original_rev,decision,payload)::text,'UTF8')),'hex');
  IF NOT finish THEN
   IF EXISTS(SELECT FROM erp_private.f11_child_receipts x WHERE x.actor=auth.uid() AND x.operation_id=op) THEN RAISE EXCEPTION 'Operation already belongs to an ERP decision' USING ERRCODE='PT409'; END IF;
   IF domain='leave' AND (original.workspace_revision IS DISTINCT FROM original_rev OR original.approval_status<>'pending')
    OR domain='attendance' AND NOT EXISTS(SELECT FROM public.employee_attendance_daily_summary s WHERE s.id=target_id AND s.employee_id=eid AND s.workspace_revision=original_rev AND s.approval_status='pending')
    OR domain='approval' AND NOT EXISTS(SELECT FROM public.employee_approval_requests a WHERE a.id=target_id AND a.employee_id=eid AND a.workspace_revision=original_rev AND a.request_status='pending') THEN
    RAISE EXCEPTION 'Staff decision opening changed' USING ERRCODE='PT409'; END IF;
   IF domain='leave' AND decision='approve' THEN PERFORM erp_private.mobile_hr_check_leave_certificate(original); END IF;
   INSERT INTO erp_private.hr_mobile_staff_admissions VALUES(auth.uid(),op,pg_current_xact_id(),pg_backend_pid(),action,eid,target_id,original_rev,digest,fhash);
   RETURN jsonb_build_object('dispatch',fkind,'decision',decision,'data',payload);
  END IF;
  DELETE FROM erp_private.hr_mobile_staff_admissions a WHERE a.actor=auth.uid() AND a.operation_id=op AND a.tx=pg_current_xact_id() AND a.backend=pg_backend_pid()
   AND a.action=mobile_hr_command.action AND a.employee_id=eid AND a.record_id=target_id AND a.opening_revision=original_rev AND a.mobile_hash=digest AND a.native_hash=fhash;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current mobile decision admission required' USING ERRCODE='42501'; END IF;
  SELECT x.revision INTO rev FROM erp_private.f11_child_receipts x WHERE x.actor=auth.uid() AND x.operation_id=op AND x.employee_id=eid AND x.record_id=target_id AND x.kind=fkind AND x.action=decision AND x.request_hash=fhash;
  IF NOT FOUND THEN RAISE EXCEPTION 'Canonical ERP operation receipt required' USING ERRCODE='42501'; END IF;
  status:=CASE decision WHEN 'approve' THEN 'approved' ELSE 'rejected' END;
 END IF;
 result:=jsonb_build_object('id',target_id,'employeeId',eid,'operationId',op,'kind',domain,'status',status,'revision',rev,'replayed',false);
 INSERT INTO erp_private.hr_self_operation_receipts(actor,operation_id,action,request_hash,result) VALUES(auth.uid(),op,action,digest,result);
 INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,entity_id,action,new_values)
 VALUES(actor,e.owner_company_id,e.branch_id,'HR',CASE domain WHEN 'leave' THEN 'employee_leave_requests' WHEN 'approval' THEN 'employee_approval_requests' WHEN 'attendance' THEN 'employee_attendance_daily_summary' ELSE 'hr_self_service_requests' END,target_id,action,result);
 RETURN result;
END $$;

CREATE FUNCTION public.mobile_hr_command_v1(p_action text,p_data jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY INVOKER SET search_path='' AS $$
DECLARE v jsonb; op uuid; eid bigint; rid bigint; rev bigint;
BEGIN
 v:=erp_private.mobile_hr_command(p_action,p_data,false);
 IF NOT coalesce(v?'dispatch',false) THEN RETURN v; END IF;
 op:=(p_data->>'operationId')::uuid; eid:=(p_data->>'employeeId')::bigint; rid:=(p_data->>'id')::bigint; rev:=(p_data->>'revision')::bigint;
 IF v->>'dispatch'='approval' THEN
  PERFORM public.f11_mutate_approval('approval',eid,rid,rev,op,v->>'decision',v->'data');
 ELSE
  PERFORM public.f11_mutate_time_child(v->>'dispatch',eid,rid,rev,op,v->>'decision',v->'data');
 END IF;
 RETURN erp_private.mobile_hr_command(p_action,p_data,true);
END $$;
REVOKE ALL ON FUNCTION public.mobile_hr_command_v1(text,jsonb),erp_private.mobile_hr_command(text,jsonb,boolean),
 erp_private.mobile_hr_self(bigint),erp_private.mobile_hr_domain(bigint,text,jsonb),erp_private.mobile_hr_officer(bigint,text,jsonb),
 erp_private.mobile_hr_keys(jsonb,text[],text[]),erp_private.mobile_hr_text(jsonb,integer),erp_private.mobile_hr_evidence(bigint,bigint,bigint),
 erp_private.mobile_hr_validate_proposal(bigint,text,jsonb),erp_private.mobile_hr_capture_leave(jsonb,jsonb),erp_private.mobile_hr_leave_decision_guard(),
 erp_private.mobile_hr_request_visible(erp_private.hr_self_service_requests,text),erp_private.mobile_hr_request_item(erp_private.hr_self_service_requests),
 erp_private.mobile_hr_read(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mobile_hr_command_v1(text,jsonb),erp_private.mobile_hr_command(text,jsonb,boolean) TO authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;
