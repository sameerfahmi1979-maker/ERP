BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- Held storage. An independent, exact-selection approval writer has its own
-- acceptance gate. This migration provides no admission writer or seed.
CREATE TABLE erp_private.shared_hr_document_draft_control (
  singleton boolean NOT NULL DEFAULT true PRIMARY KEY CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false
);
ALTER TABLE erp_private.shared_hr_document_draft_control ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.shared_hr_document_draft_control FROM PUBLIC, anon, authenticated, service_role;
INSERT INTO erp_private.shared_hr_document_draft_control DEFAULT VALUES;

CREATE TABLE erp_private.shared_hr_document_draft_approvals (
  source_document_ids jsonb NOT NULL CHECK (jsonb_typeof(source_document_ids) = 'array'),
  selection_key bytea GENERATED ALWAYS AS (sha256(jsonb_send(source_document_ids))) STORED PRIMARY KEY,
  source_fingerprints jsonb NOT NULL CHECK (jsonb_typeof(source_fingerprints) = 'array'),
  approved_originals jsonb NOT NULL CHECK (jsonb_typeof(approved_originals) = 'array'),
  approved_by bigint NOT NULL REFERENCES public.user_profiles(id),
  approved_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  revoked_at timestamptz
);
ALTER TABLE erp_private.shared_hr_document_draft_approvals ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.shared_hr_document_draft_approvals FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE erp_private.shared_hr_document_drafts (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  source_document_ids jsonb NOT NULL,
  selection_key bytea GENERATED ALWAYS AS (sha256(jsonb_send(source_document_ids))) STORED
    UNIQUE REFERENCES erp_private.shared_hr_document_draft_approvals(selection_key),
  source_fingerprints jsonb NOT NULL,
  approved_originals jsonb NOT NULL,
  owner_company_id bigint NOT NULL REFERENCES public.owner_companies(id),
  branch_id bigint REFERENCES public.branches(id),
  revision integer NOT NULL DEFAULT 0 CHECK (revision >= 0),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by bigint REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  updated_by bigint REFERENCES public.user_profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
ALTER TABLE erp_private.shared_hr_document_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.shared_hr_document_drafts FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION erp_private.validate_shared_hr_document_draft_payload(p_payload jsonb)
RETURNS void LANGUAGE plpgsql SET search_path = '' AS $$
BEGIN
  IF jsonb_typeof(p_payload) IS DISTINCT FROM 'object' OR octet_length(p_payload::text) > 16384 THEN
    RAISE EXCEPTION 'Invalid shared HR draft fields' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_each(p_payload) AS field(name,value)
    WHERE CASE
      WHEN name IN ('full_name_en','full_name_ar','date_of_birth','mobile_number','personal_email',
                    'joining_date','emergency_contact_name','emergency_contact_mobile') THEN
        jsonb_typeof(value) <> 'string' OR char_length(value #>> '{}') > 500
      WHEN name = 'gender' THEN value NOT IN ('""','"male"','"female"')
      WHEN name IN ('nationality_id','department_id','designation_id','employee_category_id','employment_type_id') THEN
        CASE
          WHEN value = 'null' THEN false
          WHEN jsonb_typeof(value) = 'number' AND value::text ~ '^[1-9][0-9]{0,15}$'
            THEN value::text::numeric > 9007199254740991
          ELSE true
        END
      ELSE true
    END
  ) THEN
    RAISE EXCEPTION 'Invalid shared HR draft fields' USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.validate_shared_hr_document_draft_payload(jsonb)
  FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION erp_private.shared_hr_document_draft(
  p_action text, p_draft_id uuid, p_document_ids jsonb, p_source_fingerprints jsonb,
  p_expected_revision integer, p_payload jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
  actor bigint;
  enabled boolean;
  source record;
  source_ids jsonb;
  prepared jsonb;
  current_fingerprints jsonb;
  current_originals jsonb := '[]';
  original jsonb;
  original_count bigint;
  company_id bigint;
  branch bigint;
  scope_key bytea;
  approval erp_private.shared_hr_document_draft_approvals;
  draft erp_private.shared_hr_document_drafts;
  is_open boolean := p_action = 'open';
  is_save boolean := p_action = 'save';
BEGIN
  IF p_action IS NULL OR p_action NOT IN ('open','read','save')
    OR current_setting('transaction_isolation') <> 'read committed'
    OR NOT public.f03_current_session_valid() THEN
    RAISE EXCEPTION 'Shared HR draft unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM erp_private.dms_lock_intake_retry_session();
  SELECT c.enabled INTO enabled FROM erp_private.shared_hr_document_draft_control AS c WHERE c.singleton FOR SHARE;
  IF enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Shared HR draft unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT p.id INTO actor FROM public.user_profiles AS p
    WHERE p.auth_user_id = auth.uid() AND p.status = 'active' AND NOT p.must_change_password FOR SHARE;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Shared HR draft unavailable' USING ERRCODE = '42501';
  END IF;

  -- Retain locks on the actor's existing grant edges before preparing the
  -- source. All decisions still use the standard current F03 guards.
  PERFORM a.id FROM public.user_roles AS a WHERE a.user_profile_id = actor ORDER BY a.id FOR SHARE;
  PERFORM r.id FROM public.roles AS r WHERE EXISTS (
    SELECT 1 FROM public.user_roles AS a WHERE a.user_profile_id = actor AND a.role_id = r.id
  ) ORDER BY r.id FOR SHARE;
  PERFORM g.id FROM public.role_permissions AS g WHERE EXISTS (
    SELECT 1 FROM public.user_roles AS a WHERE a.user_profile_id = actor AND a.role_id = g.role_id
  ) ORDER BY g.id FOR SHARE;
  PERFORM p.id FROM public.permissions AS p WHERE EXISTS (
    SELECT 1 FROM public.user_roles AS a JOIN public.role_permissions AS g ON g.role_id = a.role_id
    WHERE a.user_profile_id = actor AND g.permission_id = p.id
  ) ORDER BY p.id FOR SHARE;
  PERFORM f.id FROM public.erp_ai_feature_flags AS f WHERE f.feature_code = 'ERP_AI_HR_DOCUMENT_TO_EMPLOYEE' FOR SHARE;

  IF is_open THEN
    source_ids := p_document_ids;
    IF jsonb_typeof(source_ids) IS DISTINCT FROM 'array'
      OR jsonb_typeof(p_source_fingerprints) IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Invalid shared draft source selection' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(source_ids) NOT BETWEEN 1 AND 200 OR
      jsonb_array_length(p_source_fingerprints) <> jsonb_array_length(source_ids) THEN
      RAISE EXCEPTION 'Invalid shared draft source selection' USING ERRCODE = '22023';
    END IF;
  ELSE
    SELECT d.* INTO draft FROM erp_private.shared_hr_document_drafts AS d WHERE d.id = p_draft_id;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Shared HR draft unavailable' USING ERRCODE = '42501';
    END IF;
    source_ids := draft.source_document_ids;
  END IF;

  -- Preparation takes the geography, document, file, extraction, version
  -- and type locks and computes the same fingerprint as the HR.14A wizard.
  prepared := public.prepare_document_employee_sources(source_ids);
  SELECT jsonb_agg(value->'documentId' ORDER BY ordinality),
    jsonb_agg(jsonb_build_object('documentId',value->'documentId','fingerprint',value->'fingerprint') ORDER BY ordinality)
    INTO source_ids, current_fingerprints FROM jsonb_array_elements(prepared) WITH ORDINALITY;
  company_id := (prepared->0->'document'->>'owning_company_id')::bigint;
  branch := (prepared->0->'document'->>'owning_branch_id')::bigint;

  IF company_id IS NULL OR NOT erp_private.permission_in_scope('hr.employees.create',company_id,branch)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(prepared) AS item
      WHERE ROW((item->'document'->>'owning_company_id')::bigint,(item->'document'->>'owning_branch_id')::bigint)
        IS DISTINCT FROM ROW(company_id,branch)
        OR NOT public.f03_has_document_permission((item->>'documentId')::bigint,'dms.documents.view')
    ) THEN
    RAISE EXCEPTION 'Shared HR draft unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM 1 FROM public.owner_companies AS c WHERE c.id = company_id AND c.status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shared HR draft unavailable' USING ERRCODE = '42501';
  END IF;
  IF branch IS NOT NULL THEN
    PERFORM 1 FROM public.branches AS b WHERE b.id = branch AND b.owner_company_id = company_id
      AND b.status = 'active' AND b.operating_status = 'active' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Shared HR draft unavailable' USING ERRCODE = '42501';
    END IF;
  END IF;

  scope_key := sha256(jsonb_send(source_ids));
  SELECT a.* INTO approval FROM erp_private.shared_hr_document_draft_approvals AS a
    WHERE a.selection_key = scope_key AND a.source_document_ids = source_ids AND a.revoked_at IS NULL FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shared HR draft unavailable' USING ERRCODE = '42501';
  END IF;
  IF current_fingerprints IS DISTINCT FROM approval.source_fingerprints
    OR (is_open AND p_source_fingerprints IS DISTINCT FROM current_fingerprints) THEN
    RAISE EXCEPTION 'Reviewed draft sources changed' USING ERRCODE = 'PT409';
  END IF;

  -- The preparation hash covers file identity but excludes the file role.
  -- Independently match exactly one current, retained original per document.
  FOR source IN SELECT (value #>> '{}')::bigint AS id FROM jsonb_array_elements(source_ids) LOOP
    PERFORM l.id FROM public.dms_document_links AS l
      WHERE l.document_id = source.id AND l.entity_type = 'employee' ORDER BY l.id FOR SHARE;
    IF EXISTS (SELECT 1 FROM public.dms_document_links AS l
      WHERE l.document_id = source.id AND l.entity_type = 'employee' AND l.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Reviewed draft source is already linked' USING ERRCODE = 'PT409';
    END IF;
    SELECT count(*), (jsonb_agg(jsonb_build_object(
      'documentId',d.id,'fileId',f.id,'versionId',v.id,'sha256',f.sha256_hash) ORDER BY f.id))->0
      INTO original_count, original
    FROM public.dms_documents AS d
      JOIN public.dms_document_versions AS v ON v.id = d.current_version_id AND v.document_id = d.id AND v.is_current
      JOIN public.dms_document_files AS f ON f.version_id = v.id AND f.document_id = d.id
        AND f.file_role = 'original' AND f.deleted_at IS NULL
    WHERE d.id = source.id AND d.status IN ('active','approved') AND NOT d.is_archived AND d.deleted_at IS NULL;
    IF original_count <> 1 OR coalesce(original->>'sha256','') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'Reviewed draft original changed' USING ERRCODE = 'PT409';
    END IF;
    current_originals := current_originals || jsonb_build_array(original);
  END LOOP;
  IF current_originals IS DISTINCT FROM approval.approved_originals THEN
    RAISE EXCEPTION 'Reviewed draft originals changed' USING ERRCODE = 'PT409';
  END IF;

  -- Validate after all source/approval waits, including wall-clock session
  -- expiry. Draft state cannot stand in for today's role or source checks.
  PERFORM erp_private.dms_lock_intake_retry_session();
  IF NOT erp_private.document_employee_enabled()
    OR NOT public.current_user_has_permission('numbering.rules.generate')
    OR NOT erp_private.permission_in_scope('hr.employees.create',company_id,branch)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(source_ids) AS source_id
      WHERE NOT public.f03_has_document_permission(source_id::text::bigint,'dms.documents.view')
        OR NOT public.f03_has_document_permission(source_id::text::bigint,'dms.documents.preview')
        OR NOT public.f03_has_document_permission(source_id::text::bigint,'dms.documents.edit')
    ) THEN
    RAISE EXCEPTION 'Shared HR draft unavailable' USING ERRCODE = '42501';
  END IF;

  IF is_open THEN
    INSERT INTO erp_private.shared_hr_document_drafts (
      source_document_ids,source_fingerprints,approved_originals,owner_company_id,branch_id,created_by,updated_by
    ) VALUES (source_ids,current_fingerprints,current_originals,company_id,branch,actor,actor)
    ON CONFLICT (selection_key) DO NOTHING;
    SELECT d.* INTO STRICT draft FROM erp_private.shared_hr_document_drafts AS d WHERE d.selection_key = scope_key;
  END IF;
  IF draft.source_document_ids IS DISTINCT FROM source_ids
    OR draft.source_fingerprints IS DISTINCT FROM current_fingerprints
    OR draft.approved_originals IS DISTINCT FROM current_originals
    OR ROW(draft.owner_company_id,draft.branch_id) IS DISTINCT FROM ROW(company_id,branch) THEN
    RAISE EXCEPTION 'Reviewed draft sources changed' USING ERRCODE = 'PT409';
  END IF;
  IF is_save THEN
    IF p_expected_revision IS NULL OR p_expected_revision < 0 THEN
      RAISE EXCEPTION 'Invalid shared draft revision' USING ERRCODE = '22023';
    END IF;
    PERFORM erp_private.validate_shared_hr_document_draft_payload(p_payload);
    UPDATE erp_private.shared_hr_document_drafts AS d
      SET payload = p_payload, revision = d.revision + 1, updated_by = actor, updated_at = clock_timestamp()
      WHERE d.id = p_draft_id AND d.revision = p_expected_revision
      RETURNING d.* INTO draft;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Shared HR draft revision changed' USING ERRCODE = 'PT409';
    END IF;
  ELSIF NOT is_open THEN
    -- The source locking above serializes with sibling readers and writers.
    -- Re-read after any wait to return the current committed revision.
    SELECT d.* INTO STRICT draft FROM erp_private.shared_hr_document_drafts AS d WHERE d.id = p_draft_id;
  END IF;

  RETURN jsonb_build_object(
    'draftId',draft.id,'revision',draft.revision,'ownerCompanyId',draft.owner_company_id,'branchId',draft.branch_id,
    'sourceFingerprints',draft.source_fingerprints,'payload',draft.payload
  );
END;
$$;
REVOKE ALL ON FUNCTION erp_private.shared_hr_document_draft(text,uuid,jsonb,jsonb,integer,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.shared_hr_document_draft(text,uuid,jsonb,jsonb,integer,jsonb) TO authenticated;

CREATE FUNCTION public.open_shared_hr_document_draft(p_document_ids jsonb, p_source_fingerprints jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT erp_private.shared_hr_document_draft('open',NULL,p_document_ids,p_source_fingerprints,NULL,NULL);
$$;
CREATE FUNCTION public.read_shared_hr_document_draft(p_draft_id uuid)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT erp_private.shared_hr_document_draft('read',p_draft_id,NULL,NULL,NULL,NULL);
$$;
CREATE FUNCTION public.save_shared_hr_document_draft(p_draft_id uuid, p_expected_revision integer, p_payload jsonb)
RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT erp_private.shared_hr_document_draft('save',p_draft_id,NULL,NULL,p_expected_revision,p_payload);
$$;
REVOKE ALL ON FUNCTION public.open_shared_hr_document_draft(jsonb,jsonb),
  public.read_shared_hr_document_draft(uuid), public.save_shared_hr_document_draft(uuid,integer,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.open_shared_hr_document_draft(jsonb,jsonb),
  public.read_shared_hr_document_draft(uuid), public.save_shared_hr_document_draft(uuid,integer,jsonb) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
