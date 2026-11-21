BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

REVOKE SELECT ON public.employee_leave_requests FROM PUBLIC, anon, authenticated;
REVOKE SELECT (reason, notes, sick_cert_dms_id) ON public.employee_leave_requests FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, employee_id, leave_type_id, request_date, start_date, end_date, total_days,
  approval_status, approved_by, approved_at, rejected_by, rejected_at, cancelled_by, cancelled_at,
  return_date, created_at, updated_at, created_by, updated_by, deleted_at, deleted_by,
  workspace_revision, f12_ledger_version, f12_policy) ON public.employee_leave_requests TO authenticated;

CREATE FUNCTION public.t01_leave_medical_detail(p_employee bigint, p_request bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object('reason', r.reason, 'notes', r.notes)
    FROM public.employee_leave_requests r
   WHERE r.id = p_request AND r.employee_id = p_employee AND r.deleted_at IS NULL
     AND erp_private.business_principal_is_active()
     AND public.current_user_can_view_employee(p_employee)
     AND (erp_private.employee_permission(p_employee, 'hr.leave.view') OR erp_private.employee_permission(p_employee, 'hr.leave.manage'))
     AND erp_private.employee_permission(p_employee, 'hr.medical.view');
$$;
REVOKE ALL ON FUNCTION public.t01_leave_medical_detail(bigint,bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.t01_leave_medical_detail(bigint,bigint) TO authenticated;

CREATE TABLE erp_private.t01_leave_certificate_approvals (
  request_id bigint PRIMARY KEY REFERENCES public.employee_leave_requests(id),
  request_revision bigint NOT NULL,
  employee_id bigint NOT NULL REFERENCES public.employees(id),
  medical_record_id bigint NOT NULL REFERENCES public.employee_medical_records(id),
  document_id bigint NOT NULL REFERENCES public.dms_documents(id),
  version_id bigint NOT NULL REFERENCES public.dms_document_versions(id),
  actor uuid NOT NULL,
  operation_id uuid NOT NULL,
  transaction_id xid8 NOT NULL,
  verified_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (actor, operation_id)
);
ALTER TABLE erp_private.t01_leave_certificate_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.t01_leave_certificate_approvals FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION erp_private.t01_leave_certificate_authorized(p_employee bigint)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT erp_private.f11_child_authorized('leave-request', p_employee)
     AND erp_private.employee_permission(p_employee, 'hr.medical.view')
     AND erp_private.employee_permission(p_employee, 'hr.medical.manage');
$$;
REVOKE ALL ON FUNCTION erp_private.t01_leave_certificate_authorized(bigint) FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION public.t01_leave_approval_opening(p_employee bigint, p_request bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  requires_document boolean;
  choices jsonb := '[]'::jsonb;
BEGIN
  IF NOT erp_private.f11_child_authorized('leave-request', p_employee) THEN
    RAISE EXCEPTION 'Current leave authority required' USING ERRCODE = '42501';
  END IF;
  SELECT t.requires_document INTO requires_document
    FROM public.employee_leave_requests r JOIN public.hr_leave_types t ON t.id = r.leave_type_id
   WHERE r.id = p_request AND r.employee_id = p_employee AND r.deleted_at IS NULL AND r.approval_status = 'pending';
  IF NOT FOUND THEN RAISE EXCEPTION 'Current pending leave request unavailable' USING ERRCODE = '42501'; END IF;
  IF requires_document AND erp_private.t01_leave_certificate_authorized(p_employee) THEN
    SELECT coalesce(jsonb_agg(to_jsonb(c)), '[]'::jsonb) INTO choices FROM (
      SELECT m.id AS medical_record_id, d.current_version_id AS version_id,
             d.document_no AS label
        FROM public.employee_medical_records m JOIN public.dms_documents d ON d.id = m.dms_document_id
       WHERE m.employee_id = p_employee AND m.deleted_at IS NULL
         AND erp_private.f12_verified_evidence('medical-record', p_employee, m.id)
       ORDER BY m.examination_date DESC NULLS LAST, m.id DESC LIMIT 100
    ) c;
  END IF;
  RETURN jsonb_build_object('required', requires_document, 'choices', choices);
END;
$$;
REVOKE ALL ON FUNCTION public.t01_leave_approval_opening(bigint,bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.t01_leave_approval_opening(bigint,bigint) TO authenticated;

CREATE FUNCTION erp_private.t01_admit_leave_certificate(p_employee bigint, p_request bigint, p_revision bigint, p_operation uuid, p_data jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  requires_document boolean;
  selected_document bigint;
  current_version bigint;
  existing_document bigint;
  medical_id bigint := (p_data->>'medical_record_id')::bigint;
  selected_version bigint := (p_data->>'version_id')::bigint;
BEGIN
  SELECT t.requires_document, r.sick_cert_dms_id INTO requires_document, existing_document
    FROM public.employee_leave_requests r JOIN public.hr_leave_types t ON t.id = r.leave_type_id
   WHERE r.id = p_request AND r.employee_id = p_employee AND r.deleted_at IS NULL AND r.approval_status = 'pending'
   FOR SHARE OF t;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current pending leave request required' USING ERRCODE = '23514'; END IF;
  IF NOT requires_document THEN
    IF p_data <> '{}'::jsonb THEN RAISE EXCEPTION 'Certificate is not required for this leave type' USING ERRCODE = '23514'; END IF;
    RETURN;
  END IF;
  IF NOT erp_private.t01_leave_certificate_authorized(p_employee) OR medical_id IS NULL OR selected_version IS NULL THEN
    RAISE EXCEPTION 'A required sick certificate must be selected and verified by authorised medical staff' USING ERRCODE = '23514';
  END IF;
  SELECT d.id, d.current_version_id INTO selected_document, current_version
    FROM public.employee_medical_records m JOIN public.dms_documents d ON d.id = m.dms_document_id
   WHERE m.id = medical_id AND m.employee_id = p_employee AND m.deleted_at IS NULL AND d.deleted_at IS NULL AND NOT d.is_archived
   FOR SHARE OF m, d;
  IF selected_document IS NULL OR current_version IS DISTINCT FROM selected_version
     OR (existing_document IS NOT NULL AND existing_document IS DISTINCT FROM selected_document)
     OR NOT erp_private.f12_verified_evidence('medical-record', p_employee, medical_id) THEN
    RAISE EXCEPTION 'Use the current verified certificate for this employee and request' USING ERRCODE = '23514';
  END IF;
  PERFORM 1 FROM public.dms_document_versions v
   WHERE v.id = selected_version AND v.document_id = selected_document AND v.unlinked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Certificate version changed' USING ERRCODE = '23514'; END IF;
  PERFORM 1 FROM public.dms_document_files f
   WHERE f.version_id = selected_version AND f.document_id = selected_document AND f.deleted_at IS NULL
     AND f.file_role = 'original' AND f.integrity_status = 'verified' AND f.file_size_bytes > 0 AND f.sha256_hash ~ '^[0-9a-f]{64}$'
   FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Current verified certificate file required' USING ERRCODE = '23514'; END IF;
  INSERT INTO erp_private.t01_leave_certificate_approvals
    (request_id, request_revision, employee_id, medical_record_id, document_id, version_id, actor, operation_id, transaction_id)
  VALUES (p_request, p_revision, p_employee, medical_id, selected_document, selected_version, auth.uid(), p_operation, pg_current_xact_id());
END;
$$;
REVOKE ALL ON FUNCTION erp_private.t01_admit_leave_certificate(bigint,bigint,bigint,uuid,jsonb) FROM PUBLIC, anon, authenticated, service_role;

-- Retain F11's scoped request identity, payload admission and atomic F12 balance movement.
DO $$
DECLARE
  def text;
  patched text;
BEGIN
  def := pg_get_functiondef('public.f11_mutate_time_child(text,bigint,bigint,bigint,uuid,text,jsonb)'::regprocedure);
  patched := replace(def,
$old$ IF p_action<>'create'THEN EXECUTE format('SELECT to_jsonb(r)FROM public.%I r WHERE id=$1 AND employee_id=$2%s FOR UPDATE',table_name,archive_filter)INTO existing USING p_id,p_employee;$old$,
$new$ IF p_action<>'create'THEN
  IF p_kind='leave-request' THEN
    SELECT jsonb_build_object('workspace_revision', r.workspace_revision, 'created_by', r.created_by,
      'leave_type_id', r.leave_type_id, 'f12_ledger_version', r.f12_ledger_version, 'total_days', r.total_days, 'start_date', r.start_date)
    INTO existing FROM public.employee_leave_requests r WHERE r.id=p_id AND r.employee_id=p_employee AND r.deleted_at IS NULL FOR UPDATE;
  ELSE
    EXECUTE format('SELECT to_jsonb(r)FROM public.%I r WHERE id=$1 AND employee_id=$2%s FOR UPDATE',table_name,archive_filter)INTO existing USING p_id,p_employee;
  END IF;$new$);
  IF def = patched THEN RAISE EXCEPTION 'Unexpected leave mutation opening'; END IF;
  EXECUTE patched;

  def := pg_get_functiondef('erp_private.f11_validate_time(text,text,jsonb)'::regprocedure);
  patched := replace(def, ' columns:=CASE WHEN p_action',
$new$ IF p_kind='leave-request' AND p_action='approve' AND p_data <> '{}'::jsonb THEN
    IF jsonb_typeof(p_data) IS DISTINCT FROM 'object' OR
       jsonb_typeof(p_data->'medical_record_id') IS DISTINCT FROM 'number' OR
       jsonb_typeof(p_data->'version_id') IS DISTINCT FROM 'number' OR
       p_data - 'medical_record_id' - 'version_id' <> '{}'::jsonb OR
       (p_data->>'medical_record_id') !~ '^[1-9][0-9]{0,15}$' OR
       (p_data->>'version_id') !~ '^[1-9][0-9]{0,15}$' OR
       (p_data->>'medical_record_id')::bigint > 9007199254740991 OR (p_data->>'version_id')::bigint > 9007199254740991 THEN
      RAISE EXCEPTION 'Invalid certificate identity' USING ERRCODE='23514';
    END IF;
    RETURN;
 END IF;
 columns:=CASE WHEN p_action$new$);
  IF def = patched THEN RAISE EXCEPTION 'Unexpected Time validation definition'; END IF;
  EXECUTE patched;

  def := pg_get_functiondef('erp_private.f11_admit_time_operation(jsonb,jsonb)'::regprocedure);
  patched := replace(def, ' INSERT INTO erp_private.f11_time_admissions',
$new$ IF kind='leave-request' AND action='approve' THEN
   PERFORM erp_private.t01_admit_leave_certificate(employee,target,expected_revision,(p_context->>'operation_id')::uuid,p_data);
 END IF;
 INSERT INTO erp_private.f11_time_admissions$new$);
  IF def = patched THEN RAISE EXCEPTION 'Unexpected Time admission definition'; END IF;
  EXECUTE patched;

  def := pg_get_functiondef('erp_private.f11_verify_time_admission(text,jsonb,jsonb,jsonb)'::regprocedure);
  patched := replace(def, ' IF actual IS NULL OR erp_private.f11_time_payload_hash(actual)',
$new$ IF kind='leave-request' AND gate.action='approve' THEN
   SELECT jsonb_build_object('medical_record_id', proof.medical_record_id, 'version_id', proof.version_id) INTO actual
     FROM erp_private.t01_leave_certificate_approvals proof
    WHERE proof.transaction_id=gate.transaction_id AND proof.actor=gate.actor AND proof.operation_id=gate.operation_id
      AND proof.request_id=gate.record_id AND proof.request_revision=gate.revision AND proof.employee_id=gate.employee_id
      AND erp_private.t01_leave_certificate_authorized(gate.employee_id);
   IF NOT FOUND THEN
     actual:='{}'::jsonb;
     IF EXISTS(SELECT 1 FROM public.hr_leave_types WHERE id=(p_new->>'leave_type_id')::bigint AND requires_document) THEN
       RAISE EXCEPTION 'Current verified certificate approval required' USING ERRCODE='23514';
     END IF;
   END IF;
 END IF;
 IF actual IS NULL OR erp_private.f11_time_payload_hash(actual)$new$);
  IF def = patched THEN RAISE EXCEPTION 'Unexpected Time verification definition'; END IF;
  EXECUTE patched;
END;
$$;

NOTIFY pgrst, 'reload schema';
COMMIT;

