BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Separate from the legacy automatic linker. A release operator must first bind
-- one approved original and two designated actors to one operation. Seed none.
CREATE TABLE erp_private.phase5_emirates_link_permits (
  operation_id uuid PRIMARY KEY,
  document_id bigint NOT NULL REFERENCES public.dms_documents(id),
  version_id bigint NOT NULL REFERENCES public.dms_document_versions(id),
  file_id bigint NOT NULL REFERENCES public.dms_document_files(id),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  employee_id bigint NOT NULL REFERENCES public.employees(id),
  owner_company_id bigint NOT NULL REFERENCES public.owner_companies(id),
  branch_id bigint NOT NULL REFERENCES public.branches(id),
  requested_actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
  reviewer_actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
  enabled boolean NOT NULL DEFAULT false,
  expires_at timestamptz NOT NULL CHECK (isfinite(expires_at)),
  requested_at timestamptz,
  witness bytea,
  link_id bigint UNIQUE REFERENCES public.dms_document_links(id),
  event_id bigint UNIQUE REFERENCES public.dms_document_events(id),
  audit_id bigint UNIQUE REFERENCES public.audit_logs(id),
  committed_at timestamptz,
  CHECK (reviewer_actor_id <> requested_actor_id),
  CHECK ((requested_at IS NULL) = (witness IS NULL)),
  CHECK ((link_id IS NULL) = (committed_at IS NULL)),
  CHECK ((event_id IS NULL) = (committed_at IS NULL)),
  CHECK ((audit_id IS NULL) = (committed_at IS NULL)),
  CHECK (committed_at IS NULL OR requested_at IS NOT NULL)
);
ALTER TABLE erp_private.phase5_emirates_link_permits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.phase5_emirates_link_permits FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION erp_private.phase5_exact_hr_link_grants(
  p_actor bigint, p_company bigint, p_branch bigint, p_required text[]
) RETURNS boolean LANGUAGE sql STABLE SECURITY INVOKER SET search_path = '' AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_profiles AS p JOIN auth.users AS u ON u.id = p.auth_user_id
    WHERE p.id = p_actor AND p.status = 'active' AND NOT p.must_change_password
      AND u.deleted_at IS NULL AND (u.banned_until IS NULL OR u.banned_until < clock_timestamp())
  ) AND (
    SELECT count(DISTINCT p.permission_code) = cardinality(p_required)
    FROM public.user_roles AS a JOIN public.roles AS r ON r.id = a.role_id AND r.is_active
    JOIN public.role_permissions AS g ON g.role_id = r.id
    JOIN public.permissions AS p ON p.id = g.permission_id AND p.is_active
    WHERE a.user_profile_id = p_actor AND a.owner_company_id = p_company AND a.branch_id = p_branch
      AND a.is_active AND p.permission_code = ANY(p_required)
  );
$$;
REVOKE ALL ON FUNCTION erp_private.phase5_exact_hr_link_grants(bigint,bigint,bigint,text[])
  FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION erp_private.link_phase5_emirates_employee(
  p_operation uuid, p_document bigint, p_version bigint, p_file bigint,
  p_sha256 text, p_employee bigint, p_approve boolean
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '3s' AS $$
DECLARE
  permit erp_private.phase5_emirates_link_permits;
  document public.dms_documents;
  target public.employees;
  approval record;
  identity_row record;
  actor bigint;
  locked_actors bigint[];
  required_capability text;
  shared_capabilities text[] := ARRAY['dms.documents.view','dms.documents.preview','hr.employees.view'];
  identity_number text;
  birth_date date;
  expiry_date date;
  metadata_count bigint;
  metadata_witness bytea;
  current_witness bytea;
  matching_count bigint;
  matched_identity bigint;
  today date := (clock_timestamp() AT TIME ZONE 'Asia/Dubai')::date;
  link bigint;
  event bigint;
  audit bigint;
BEGIN
  IF p_approve IS NULL OR current_setting('transaction_isolation') <> 'read committed'
    OR NOT public.f03_current_session_valid() THEN
    RAISE EXCEPTION 'Scoped HR link unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM erp_private.dms_lock_intake_retry_session();
  SELECT p.id INTO actor FROM public.user_profiles AS p
    WHERE p.auth_user_id = auth.uid() AND p.status = 'active' AND NOT p.must_change_password FOR SHARE;
  SELECT * INTO permit FROM erp_private.phase5_emirates_link_permits AS p
    WHERE p.operation_id = p_operation AND p.document_id = p_document AND p.version_id = p_version
      AND p.file_id = p_file AND p.sha256 = p_sha256 AND p.employee_id = p_employee AND p.enabled
      AND actor = CASE WHEN p_approve THEN p.reviewer_actor_id ELSE p.requested_actor_id END FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scoped HR link unavailable' USING ERRCODE = '42501'; END IF;

  -- Hold both participants' authority when publishing a pending request. A
  -- historical receipt only requires the current reader's exact scope.
  locked_actors := CASE WHEN p_approve AND permit.link_id IS NULL THEN ARRAY[actor,permit.requested_actor_id]
    ELSE ARRAY[actor] END;
  PERFORM p.id FROM public.user_profiles AS p WHERE p.id = ANY(locked_actors) ORDER BY p.id FOR SHARE;
  PERFORM u.id FROM auth.users AS u WHERE EXISTS (
    SELECT 1 FROM public.user_profiles AS p WHERE p.id = ANY(locked_actors) AND p.auth_user_id = u.id
  ) ORDER BY u.id FOR SHARE;
  PERFORM a.id FROM public.user_roles AS a WHERE a.user_profile_id = ANY(locked_actors) ORDER BY a.id FOR SHARE;
  PERFORM r.id FROM public.roles AS r WHERE EXISTS (
    SELECT 1 FROM public.user_roles AS a WHERE a.user_profile_id = ANY(locked_actors) AND a.role_id = r.id
  ) ORDER BY r.id FOR SHARE;
  PERFORM g.id FROM public.role_permissions AS g WHERE EXISTS (
    SELECT 1 FROM public.user_roles AS a WHERE a.user_profile_id = ANY(locked_actors) AND a.role_id = g.role_id
  ) ORDER BY g.id FOR SHARE;
  PERFORM p.id FROM public.permissions AS p WHERE EXISTS (
    SELECT 1 FROM public.user_roles AS a JOIN public.role_permissions AS g ON g.role_id = a.role_id
    WHERE a.user_profile_id = ANY(locked_actors) AND g.permission_id = p.id
  ) ORDER BY p.id FOR SHARE;

  required_capability := CASE WHEN p_approve THEN 'dms.documents.approve' ELSE 'dms.documents.edit' END;
  IF NOT erp_private.phase5_exact_hr_link_grants(actor,permit.owner_company_id,permit.branch_id,
    shared_capabilities || CASE WHEN p_approve THEN ARRAY[required_capability,'hr.compliance.manage']
      ELSE ARRAY[required_capability] END) THEN
    RAISE EXCEPTION 'Scoped HR link unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.owner_companies AS c WHERE c.id = permit.owner_company_id AND c.status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scoped HR link unavailable' USING ERRCODE = '42501'; END IF;
  PERFORM 1 FROM public.branches AS b WHERE b.id = permit.branch_id AND b.owner_company_id = permit.owner_company_id
    AND b.status = 'active' AND b.operating_status = 'active' FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Scoped HR link unavailable' USING ERRCODE = '42501'; END IF;

  -- The one-case write must serialize against independent identities,
  -- dependents and links. Fail fast when an ordinary writer owns these tables.
  IF permit.link_id IS NULL AND p_approve THEN
    LOCK TABLE public.employee_dependents, public.employee_identity_documents IN SHARE MODE NOWAIT;
    LOCK TABLE public.dms_document_links IN SHARE ROW EXCLUSIVE MODE NOWAIT;
  END IF;
  SELECT * INTO document FROM public.dms_documents AS d WHERE d.id = permit.document_id
    AND d.owning_company_id = permit.owner_company_id AND d.owning_branch_id = permit.branch_id
    AND d.deleted_at IS NULL FOR UPDATE;
  SELECT * INTO target FROM public.employees AS e WHERE e.id = permit.employee_id
    AND e.owner_company_id = permit.owner_company_id AND e.branch_id = permit.branch_id
    AND e.deleted_at IS NULL FOR SHARE;
  IF document.id IS NULL OR target.id IS NULL
    OR NOT public.f03_has_document_permission(document.id,'dms.documents.view')
    OR NOT public.f03_has_document_permission(document.id,'dms.documents.preview')
    OR NOT public.f03_has_document_permission(document.id,required_capability)
    OR NOT public.current_user_can_view_employee(target.id) THEN
    RAISE EXCEPTION 'Scoped HR link unavailable' USING ERRCODE = '42501';
  END IF;

  -- A committed response is historical. Recover it after a lost acknowledgment
  -- without reapplying the link, even if an original or role later changed.
  IF permit.link_id IS NOT NULL THEN
    RETURN jsonb_build_object('operationId',p_operation,'state','linked','linkId',permit.link_id,
      'eventId',permit.event_id,'auditId',permit.audit_id);
  END IF;
  IF permit.expires_at <= clock_timestamp() OR (p_approve AND permit.requested_at IS NULL) THEN
    RAISE EXCEPTION 'Scoped HR link unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_approve AND NOT erp_private.phase5_exact_hr_link_grants(permit.requested_actor_id,
    permit.owner_company_id,permit.branch_id,shared_capabilities || ARRAY['dms.documents.edit'] ||
    CASE WHEN document.confidentiality_level NOT IN ('internal','company')
      THEN ARRAY['dms.documents.view.' || document.confidentiality_level] ELSE ARRAY[]::text[] END) THEN
    RAISE EXCEPTION 'Scoped HR link unavailable' USING ERRCODE = '42501';
  END IF;
  IF document.current_version_id IS DISTINCT FROM permit.version_id OR document.is_archived
    OR document.status NOT IN ('active','approved') OR target.employee_status <> 'active'
    OR document.approval_status IN ('pending_approval','rejected','withdrawn') THEN
    RAISE EXCEPTION 'Exact HR source or match requires review' USING ERRCODE = 'PT409';
  END IF;
  PERFORM 1 FROM public.dms_document_types AS t WHERE t.id = document.document_type_id AND t.type_code = 'EMIRATES_ID'
    AND t.is_active AND t.deleted_at IS NULL AND 'employee' = ANY(t.allowed_entity_types)
    AND (document.approval_status = 'approved' OR NOT (t.requires_approval OR EXISTS (
      SELECT 1 FROM public.dms_document_workflows AS w
      WHERE w.is_active AND w.deleted_at IS NULL AND (w.document_type_id = t.id OR EXISTS (
        SELECT 1 FROM public.dms_workflow_document_types AS m WHERE m.workflow_id = w.id AND m.document_type_id = t.id
      ))
    ))) FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Exact HR source or match requires review' USING ERRCODE = 'PT409'; END IF;

  SELECT r.id AS run_id, p.request_hash, p.request_json, f.file_size_bytes, f.storage_path,
      o.id AS storage_object_id,o.version AS storage_version,o.updated_at AS storage_updated_at
    INTO approval FROM erp_private.ai_approval_plans AS p
    JOIN public.dms_approve_runs AS r ON r.id = p.approve_run_id AND r.document_id = p.document_id
      AND r.upload_session_id = p.upload_session_id AND r.started_by = p.actor_id
      AND r.status = 'completed' AND r.stage = 'approve_save_completed' AND r.completed_at IS NOT NULL
      AND r.metadata_json->>'mode' = 'single_file_new_document' AND r.metadata_json->>'file_id' = permit.file_id::text
    JOIN public.dms_upload_sessions AS s ON s.id = r.upload_session_id AND s.document_id = p.document_id
      AND s.approve_run_id = r.id AND s.ai_result_id = r.ai_result_id AND s.reviewed_by = r.started_by
      AND s.owning_company_id = permit.owner_company_id AND s.owning_branch_id = permit.branch_id
      AND s.status = 'completed' AND s.intake_status = 'approved' AND s.review_status = 'approved'
      AND s.approve_status = 'completed' AND s.deleted_at IS NULL AND s.discarded_at IS NULL AND s.approved_at IS NOT NULL
      AND s.uploaded_by IS DISTINCT FROM r.started_by AND s.sha256_hash = permit.sha256
    JOIN erp_private.f07_intake_analyses AS a ON a.result_id = r.ai_result_id AND a.upload_session_id = s.id
      AND a.source_sha256 = permit.sha256
    JOIN public.dms_document_versions AS v ON v.id = permit.version_id AND v.document_id = document.id AND v.is_current
    JOIN public.dms_document_files AS f ON f.id = permit.file_id AND f.version_id = v.id AND f.document_id = document.id
      AND f.file_role = 'original' AND f.sha256_hash = permit.sha256 AND f.mime_type = 'application/pdf'
      AND f.storage_bucket = 'dms-documents' AND f.storage_path = p.storage_path
      AND f.file_size_bytes = s.file_size_bytes AND f.file_size_bytes > 0 AND f.deleted_at IS NULL
    JOIN erp_private.ai_approval_verified_copies AS proof ON proof.actor_id = p.actor_id
      AND proof.operation_id = p.operation_id AND proof.request_hash = p.request_hash
      AND proof.content_sha256 = permit.sha256 AND proof.file_size_bytes = f.file_size_bytes AND proof.file_name = f.file_name
    JOIN storage.buckets AS b ON b.id = f.storage_bucket AND b.public IS FALSE
    JOIN storage.objects AS o ON o.id = proof.object_id AND o.bucket_id = b.id AND o.name = f.storage_path
      AND o.version = proof.object_version AND o.updated_at = proof.object_updated_at
      AND o.metadata->>'size' = f.file_size_bytes::text AND o.metadata->>'mimetype' = f.mime_type
    WHERE p.document_id = document.id AND p.completed_at IS NOT NULL AND p.actor_id <> permit.reviewer_actor_id
      AND s.uploaded_by IS DISTINCT FROM permit.reviewer_actor_id
      AND p.request_json->>'documentTypeId' = document.document_type_id::text
      AND p.request_json->>'owningCompanyId' = permit.owner_company_id::text
      AND p.request_json->>'owningBranchId' = permit.branch_id::text
      AND p.request_json#>>'{prepared,content_sha256}' = permit.sha256
      AND p.request_json#>>'{prepared,analysis_result_id}' = r.ai_result_id::text
      AND p.result @> jsonb_build_object('documentId',document.id,'file_id',permit.file_id,
        'upload_session_id',s.id,'approve_run_id',r.id,'operation_id',p.operation_id,'completed',true)
    FOR SHARE OF p,r,s,a,v,f,proof,b,o;
  IF NOT FOUND OR jsonb_typeof(approval.request_json->'metadataValues') IS DISTINCT FROM 'array' THEN
    RAISE EXCEPTION 'Exact HR source or match requires review' USING ERRCODE = 'PT409';
  END IF;
  IF EXISTS (SELECT 1 FROM public.dms_document_files AS f WHERE f.document_id = document.id
    AND f.version_id = permit.version_id AND f.file_role = 'original' AND f.id <> permit.file_id AND f.deleted_at IS NULL) THEN
    RAISE EXCEPTION 'Exact HR source or match requires review' USING ERRCODE = 'PT409';
  END IF;

  -- Compare stored values to the immutable officer approval, never to client
  -- assertions or an unreviewed AI suggestion.
  PERFORM d.id FROM public.dms_metadata_definitions AS d WHERE d.document_type_id = document.document_type_id
    AND d.field_code IN ('emirates_id_number','date_of_birth','expiry_date') ORDER BY d.id FOR SHARE;
  PERFORM m.id FROM public.dms_document_metadata_values AS m
    WHERE m.document_id = document.id ORDER BY m.id FOR SHARE;
  SELECT count(*), max(m.value_text) FILTER (WHERE d.field_code = 'emirates_id_number'),
    max(m.value_date) FILTER (WHERE d.field_code = 'date_of_birth'),
    max(m.value_date) FILTER (WHERE d.field_code = 'expiry_date'),
    sha256(jsonb_send(jsonb_agg(jsonb_build_array(d.id,m.id,m.value_text,m.value_date) ORDER BY d.id,m.id)))
    INTO metadata_count,identity_number,birth_date,expiry_date,metadata_witness
    FROM public.dms_metadata_definitions AS d
    JOIN public.dms_document_metadata_values AS m ON m.definition_id = d.id AND m.document_id = document.id AND m.deleted_at IS NULL
    CROSS JOIN LATERAL jsonb_array_elements(approval.request_json->'metadataValues') AS reviewed(value)
    WHERE d.document_type_id = document.document_type_id AND d.is_active AND d.deleted_at IS NULL
      AND ((d.field_code = 'emirates_id_number' AND d.field_type = 'text' AND m.value_date IS NULL)
        OR (d.field_code IN ('date_of_birth','expiry_date') AND d.field_type = 'date' AND m.value_text IS NULL))
      AND reviewed.value->>'definitionId' = d.id::text AND reviewed.value->>'fieldType' = d.field_type
      AND reviewed.value->>'rawValue' = coalesce(m.value_date::text,m.value_text);
  IF metadata_count <> 3 OR identity_number IS NULL OR identity_number !~ '^[0-9[:space:]-]+$'
    OR birth_date IS NULL OR NOT isfinite(birth_date) OR birth_date > (today - interval '18 years')::date
    OR expiry_date IS NULL OR NOT isfinite(expiry_date) OR expiry_date < today
    OR expiry_date IS DISTINCT FROM document.expiry_date OR birth_date IS DISTINCT FROM target.date_of_birth THEN
    RAISE EXCEPTION 'Exact HR source or match requires review' USING ERRCODE = 'PT409';
  END IF;
  identity_number := regexp_replace(identity_number,'[[:space:]-]','','g');
  IF identity_number !~ '^784[0-9]{12}$' OR EXISTS (
    SELECT 1 FROM public.employee_dependents AS d WHERE d.deleted_at IS NULL AND
      (d.dms_document_id = document.id OR regexp_replace(d.emirates_id_number,'[[:space:]-]','','g') = identity_number)
  ) THEN RAISE EXCEPTION 'Exact HR source or match requires review' USING ERRCODE = 'PT409'; END IF;

  -- Search all company scopes for competing identity records and only return
  -- a single bounded denial. No foreign identity or personal value is exposed.
  SELECT count(*), min(i.id) INTO matching_count,matched_identity
    FROM public.employee_identity_documents AS i
    JOIN public.hr_identity_document_types AS t ON t.id = i.document_type_id AND t.code = 'EMIRATES_ID'
    JOIN public.employees AS e ON e.id = i.employee_id AND e.deleted_at IS NULL
    WHERE i.deleted_at IS NULL AND regexp_replace(i.document_number,'[[:space:]-]','','g') = identity_number;
  SELECT i.id,i.dms_document_id,i.expiry_date INTO identity_row FROM public.employee_identity_documents AS i
    JOIN public.hr_identity_document_types AS t ON t.id = i.document_type_id AND t.code = 'EMIRATES_ID'
      AND t.is_active AND t.deleted_at IS NULL
    WHERE i.id = matched_identity AND i.employee_id = target.id AND i.deleted_at IS NULL AND i.status = 'active'
      AND regexp_replace(i.document_number,'[[:space:]-]','','g') = identity_number FOR SHARE OF i,t;
  IF matching_count <> 1 OR identity_row.id IS NULL
    OR (identity_row.dms_document_id IS NOT NULL AND identity_row.dms_document_id <> document.id)
    OR (identity_row.expiry_date IS NOT NULL AND identity_row.expiry_date <> expiry_date)
    OR EXISTS (SELECT 1 FROM public.employee_identity_documents AS i
      WHERE i.dms_document_id = document.id AND i.deleted_at IS NULL AND i.id <> identity_row.id)
    OR EXISTS (
      SELECT 1 FROM public.dms_document_links AS l JOIN public.dms_documents AS d ON d.id = l.document_id
      WHERE l.deleted_at IS NULL AND (l.document_id = document.id OR
        (l.entity_type = 'employee' AND l.entity_id = target.id AND d.document_type_id = document.document_type_id
          AND d.deleted_at IS NULL AND NOT d.is_archived AND d.status IN ('active','approved','published')))
    ) THEN RAISE EXCEPTION 'Exact HR source or match requires review' USING ERRCODE = 'PT409'; END IF;

  current_witness := sha256(jsonb_send(jsonb_build_array(permit.sha256,approval.run_id,approval.request_hash,
    approval.file_size_bytes,approval.storage_path,approval.storage_object_id,approval.storage_version,
    approval.storage_updated_at,metadata_witness,identity_row.id)));
  IF permit.witness IS NOT NULL AND permit.witness IS DISTINCT FROM current_witness THEN
    RAISE EXCEPTION 'Exact HR source or match requires review' USING ERRCODE = 'PT409';
  END IF;

  PERFORM erp_private.dms_lock_intake_retry_session();
  IF permit.expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'Scoped HR link unavailable' USING ERRCODE = '42501';
  END IF;
  IF NOT p_approve THEN
    IF permit.requested_at IS NULL THEN
      UPDATE erp_private.phase5_emirates_link_permits SET requested_at = clock_timestamp(), witness = current_witness
        WHERE operation_id = p_operation;
    END IF;
    RETURN jsonb_build_object('operationId',p_operation,'state','pending');
  END IF;

  INSERT INTO public.dms_document_links(document_id,entity_type,entity_id,link_role,is_primary,linked_by,notes)
    VALUES(document.id,'employee',target.id,'identity_document',false,actor,'Officer-confirmed exact HR identity document')
    RETURNING id INTO link;
  INSERT INTO public.dms_document_events(document_id,event_type,description,performed_by,metadata_json)
    VALUES(document.id,'link_added','Officer linked exact approved identity document to HR',actor,
      jsonb_build_object('link_id',link,'approve_run_id',approval.run_id,'operation_id',p_operation))
    RETURNING id INTO event;
  INSERT INTO public.audit_logs(actor_user_profile_id,owner_company_id,branch_id,module_code,entity_name,
      entity_id,entity_reference,action,new_values)
    VALUES(actor,permit.owner_company_id,permit.branch_id,'DMS','dms_document_links',link,document.id::text,'create',
      jsonb_build_object('entity_type','employee','entity_id',target.id,'link_id',link,'approve_run_id',approval.run_id,
        'operation_id',p_operation,'source','phase5_exact_identity_link'))
    RETURNING id INTO audit;
  UPDATE erp_private.phase5_emirates_link_permits SET link_id = link,event_id = event,audit_id = audit,
    committed_at = clock_timestamp() WHERE operation_id = p_operation;
  RETURN jsonb_build_object('operationId',p_operation,'state','linked','linkId',link,'eventId',event,'auditId',audit);
END;
$$;
REVOKE ALL ON FUNCTION erp_private.link_phase5_emirates_employee(uuid,bigint,bigint,bigint,text,bigint,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION erp_private.link_phase5_emirates_employee(uuid,bigint,bigint,bigint,text,bigint,boolean) TO authenticated;

CREATE FUNCTION public.phase5_link_emirates_employee(
  p_operation uuid, p_document bigint, p_version bigint, p_file bigint,
  p_sha256 text, p_employee bigint, p_approve boolean
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT erp_private.link_phase5_emirates_employee(p_operation,p_document,p_version,p_file,p_sha256,p_employee,p_approve);
$$;
REVOKE ALL ON FUNCTION public.phase5_link_emirates_employee(uuid,bigint,bigint,bigint,text,bigint,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.phase5_link_emirates_employee(uuid,bigint,bigint,bigint,text,bigint,boolean) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
