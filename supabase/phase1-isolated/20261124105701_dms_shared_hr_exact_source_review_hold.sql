BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

-- This receipt establishes independent review of exact DMS sources. HR
-- admission has a separate ledger and requires its own eligibility checks.
ALTER TABLE erp_private.shared_hr_document_draft_control
  ADD COLUMN source_review_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE erp_private.shared_hr_document_source_reviewers (
  actor_id bigint NOT NULL REFERENCES public.user_profiles(id),
  owner_company_id bigint NOT NULL REFERENCES public.owner_companies(id),
  branch_id bigint REFERENCES public.branches(id),
  UNIQUE NULLS NOT DISTINCT (actor_id, owner_company_id, branch_id)
);
ALTER TABLE erp_private.shared_hr_document_source_reviewers ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.shared_hr_document_source_reviewers FROM PUBLIC, anon, authenticated, service_role;

CREATE TABLE erp_private.shared_hr_document_source_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  witness_key bytea NOT NULL UNIQUE,
  source_document_ids jsonb NOT NULL,
  source_fingerprints jsonb NOT NULL,
  originals jsonb NOT NULL,
  owner_company_id bigint NOT NULL REFERENCES public.owner_companies(id),
  branch_id bigint REFERENCES public.branches(id),
  requested_by bigint NOT NULL REFERENCES public.user_profiles(id),
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  approved_by bigint REFERENCES public.user_profiles(id),
  approved_at timestamptz,
  CHECK ((approved_by IS NULL) = (approved_at IS NULL)),
  CHECK (approved_by IS DISTINCT FROM requested_by)
);
ALTER TABLE erp_private.shared_hr_document_source_reviews ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.shared_hr_document_source_reviews FROM PUBLIC, anon, authenticated, service_role;

CREATE FUNCTION erp_private.review_shared_hr_document_sources(
  p_request_id uuid,
  p_document_ids jsonb,
  p_source_fingerprints jsonb,
  p_originals jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' SET lock_timeout = '5s' AS $$
DECLARE
  actor bigint;
  enabled boolean;
  review erp_private.shared_hr_document_source_reviews;
  source_ids jsonb;
  prepared jsonb;
  fingerprints jsonb;
  originals jsonb := '[]';
  original jsonb;
  original_count bigint;
  original_reviewer_owned boolean;
  source record;
  document_id bigint;
  company_id bigint;
  branch bigint;
  witness bytea;
BEGIN
  IF current_setting('transaction_isolation') <> 'read committed'
    OR NOT public.f03_current_session_valid() THEN
    RAISE EXCEPTION 'Shared HR source review unavailable' USING ERRCODE = '42501';
  END IF;
  PERFORM erp_private.dms_lock_intake_retry_session();
  SELECT c.source_review_enabled INTO enabled
    FROM erp_private.shared_hr_document_draft_control AS c WHERE c.singleton FOR SHARE;
  IF enabled IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'Shared HR source review unavailable' USING ERRCODE = '42501';
  END IF;
  SELECT p.id INTO actor FROM public.user_profiles AS p
    WHERE p.auth_user_id = auth.uid() AND p.status = 'active' AND NOT p.must_change_password FOR SHARE;
  IF actor IS NULL THEN
    RAISE EXCEPTION 'Shared HR source review unavailable' USING ERRCODE = '42501';
  END IF;

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
  PERFORM f.id FROM public.erp_ai_feature_flags AS f
    WHERE f.feature_code = 'ERP_AI_HR_DOCUMENT_TO_EMPLOYEE' FOR SHARE;

  IF jsonb_typeof(p_source_fingerprints) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_originals) IS DISTINCT FROM 'array'
    OR octet_length(p_source_fingerprints::text) > 32768 OR octet_length(p_originals::text) > 49152 THEN
    RAISE EXCEPTION 'Invalid shared HR source review witnesses' USING ERRCODE = '22023';
  END IF;

  IF p_request_id IS NULL THEN
    source_ids := p_document_ids;
  ELSE
    SELECT r.* INTO review FROM erp_private.shared_hr_document_source_reviews AS r WHERE r.id = p_request_id;
    IF NOT FOUND OR review.requested_by = actor
      OR (review.approved_by IS NOT NULL AND review.approved_by <> actor)
      OR NOT erp_private.permission_in_scope('hr.employees.create',review.owner_company_id,review.branch_id)
      OR NOT erp_private.permission_in_scope('dms.documents.approve',review.owner_company_id,review.branch_id) THEN
      RAISE EXCEPTION 'Shared HR source review unavailable' USING ERRCODE = '42501';
    END IF;
    PERFORM 1 FROM erp_private.shared_hr_document_source_reviewers AS a
      WHERE a.actor_id = actor AND a.owner_company_id = review.owner_company_id
        AND a.branch_id IS NOT DISTINCT FROM review.branch_id FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Shared HR source review unavailable' USING ERRCODE = '42501';
    END IF;
    source_ids := review.source_document_ids;
  END IF;

  -- This is the current caller's HR.14A preparation. It locks the geography,
  -- documents, files, extraction, versions and types in the existing order.
  prepared := public.prepare_document_employee_sources(source_ids);
  SELECT jsonb_agg(value->'documentId' ORDER BY ordinality),
    jsonb_agg(jsonb_build_object('documentId',value->'documentId','fingerprint',value->'fingerprint') ORDER BY ordinality)
    INTO source_ids, fingerprints FROM jsonb_array_elements(prepared) WITH ORDINALITY;
  company_id := (prepared->0->'document'->>'owning_company_id')::bigint;
  branch := (prepared->0->'document'->>'owning_branch_id')::bigint;

  IF company_id IS NULL OR NOT erp_private.permission_in_scope('hr.employees.create',company_id,branch)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(prepared) AS item
      WHERE ROW((item->'document'->>'owning_company_id')::bigint,(item->'document'->>'owning_branch_id')::bigint)
        IS DISTINCT FROM ROW(company_id,branch)
        OR NOT public.f03_has_document_permission((item->>'documentId')::bigint,'dms.documents.view')
    ) THEN
    RAISE EXCEPTION 'Shared HR source review unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_request_id IS NOT NULL
    AND ROW(review.owner_company_id,review.branch_id) IS DISTINCT FROM ROW(company_id,branch) THEN
    RAISE EXCEPTION 'Reviewed HR sources changed' USING ERRCODE = 'PT409';
  END IF;
  PERFORM 1 FROM public.owner_companies AS c WHERE c.id = company_id AND c.status = 'active' FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Shared HR source review unavailable' USING ERRCODE = '42501';
  END IF;
  IF branch IS NOT NULL THEN
    PERFORM 1 FROM public.branches AS b WHERE b.id = branch AND b.owner_company_id = company_id
      AND b.status = 'active' AND b.operating_status = 'active' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Shared HR source review unavailable' USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR document_id IN SELECT value::text::bigint FROM jsonb_array_elements(source_ids) LOOP
    SELECT d.id, d.created_by, d.submitted_by, d.approval_status, t.requires_approval, t.id AS type_id
      INTO source FROM public.dms_documents AS d
      JOIN public.dms_document_types AS t ON t.id = d.document_type_id AND t.is_active AND t.deleted_at IS NULL
      WHERE d.id = document_id AND d.status IN ('active','approved') AND NOT d.is_archived AND d.deleted_at IS NULL;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Reviewed HR source unavailable' USING ERRCODE = 'PT409';
    END IF;
    IF p_request_id IS NOT NULL AND (
      actor IN (source.created_by,source.submitted_by)
      OR NOT public.f03_has_document_permission(document_id,'dms.documents.approve')
    ) THEN
      RAISE EXCEPTION 'Shared HR source review unavailable' USING ERRCODE = '42501';
    END IF;
    IF source.approval_status IN ('pending_approval','rejected','withdrawn')
      OR (source.approval_status IS DISTINCT FROM 'approved' AND (
        source.requires_approval OR EXISTS (
          SELECT 1 FROM public.dms_document_workflows AS w
          WHERE w.is_active AND w.deleted_at IS NULL AND (
            w.document_type_id = source.type_id OR EXISTS (
              SELECT 1 FROM public.dms_workflow_document_types AS m
              WHERE m.workflow_id = w.id AND m.document_type_id = source.type_id
            )
          )
        )
      )) THEN
      RAISE EXCEPTION 'DMS source approval is incomplete' USING ERRCODE = 'PT409';
    END IF;

    PERFORM l.id FROM public.dms_document_links AS l
      WHERE l.document_id = source.id ORDER BY l.id FOR SHARE;
    IF EXISTS (
      SELECT 1 FROM public.dms_document_links AS l WHERE l.document_id = source.id AND l.deleted_at IS NULL
    ) THEN
      RAISE EXCEPTION 'Reviewed HR source already has a link' USING ERRCODE = 'PT409';
    END IF;
    SELECT count(*), (jsonb_agg(jsonb_build_object(
        'documentId',d.id,'fileId',f.id,'versionId',v.id,'sha256',f.sha256_hash) ORDER BY f.id))->0,
        bool_or(actor IN (v.created_by,f.created_by))
      INTO original_count, original, original_reviewer_owned
      FROM public.dms_documents AS d
      JOIN public.dms_document_versions AS v ON v.id = d.current_version_id AND v.document_id = d.id AND v.is_current
      JOIN public.dms_document_files AS f ON f.version_id = v.id AND f.document_id = d.id
        AND f.file_role = 'original' AND f.deleted_at IS NULL
      WHERE d.id = source.id;
    IF p_request_id IS NOT NULL AND original_reviewer_owned THEN
      RAISE EXCEPTION 'Shared HR source review unavailable' USING ERRCODE = '42501';
    END IF;

    IF original_count <> 1 OR coalesce(original->>'sha256','') !~ '^[a-f0-9]{64}$' THEN
      RAISE EXCEPTION 'Reviewed HR original unavailable' USING ERRCODE = 'PT409';
    END IF;
    originals := originals || jsonb_build_array(original);
  END LOOP;

  IF p_source_fingerprints IS DISTINCT FROM fingerprints OR p_originals IS DISTINCT FROM originals THEN
    RAISE EXCEPTION 'Reviewed HR sources changed' USING ERRCODE = 'PT409';
  END IF;
  IF p_request_id IS NOT NULL AND (
    review.source_document_ids IS DISTINCT FROM source_ids
    OR review.source_fingerprints IS DISTINCT FROM fingerprints OR review.originals IS DISTINCT FROM originals
  ) THEN
    RAISE EXCEPTION 'Reviewed HR sources changed' USING ERRCODE = 'PT409';
  END IF;

  PERFORM erp_private.dms_lock_intake_retry_session();
  IF NOT erp_private.document_employee_enabled()
    OR NOT public.current_user_has_permission('numbering.rules.generate')
    OR NOT erp_private.permission_in_scope('hr.employees.create',company_id,branch)
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(source_ids) AS source_id
      WHERE NOT public.f03_has_document_permission(source_id::text::bigint,'dms.documents.view')
        OR NOT public.f03_has_document_permission(source_id::text::bigint,'dms.documents.preview')
        OR NOT public.f03_has_document_permission(source_id::text::bigint,'dms.documents.edit')
        OR (p_request_id IS NOT NULL AND NOT public.f03_has_document_permission(source_id::text::bigint,'dms.documents.approve'))
    ) THEN
    RAISE EXCEPTION 'Shared HR source review unavailable' USING ERRCODE = '42501';
  END IF;

  IF p_request_id IS NULL THEN
    -- Same requester and exact inputs recover the original ticket. A changed
    -- source gets a separate ticket without rewriting the earlier evidence.
    witness := sha256(jsonb_send(jsonb_build_array(actor,source_ids,fingerprints,originals)));
    INSERT INTO erp_private.shared_hr_document_source_reviews (
      witness_key,source_document_ids,source_fingerprints,originals,owner_company_id,branch_id,requested_by
    ) VALUES (witness,source_ids,fingerprints,originals,company_id,branch,actor)
    ON CONFLICT (witness_key) DO NOTHING;
    SELECT r.* INTO STRICT review FROM erp_private.shared_hr_document_source_reviews AS r WHERE r.witness_key = witness;
    IF review.requested_by <> actor OR review.source_document_ids IS DISTINCT FROM source_ids
      OR review.source_fingerprints IS DISTINCT FROM fingerprints OR review.originals IS DISTINCT FROM originals THEN
      RAISE EXCEPTION 'Reviewed HR sources changed' USING ERRCODE = 'PT409';
    END IF;
  ELSE
    -- Source locks serialize competing approvals. Refresh the persisted actor
    -- after waiting, returning the ticket only to its recorded approver.
    SELECT r.* INTO STRICT review FROM erp_private.shared_hr_document_source_reviews AS r
      WHERE r.id = p_request_id FOR UPDATE;
    IF review.approved_by IS NULL THEN
      UPDATE erp_private.shared_hr_document_source_reviews AS r
        SET approved_by = actor, approved_at = clock_timestamp()
        WHERE r.id = p_request_id RETURNING r.* INTO review;
    ELSIF review.approved_by <> actor THEN
      RAISE EXCEPTION 'Shared HR source review unavailable' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN jsonb_build_object('requestId',review.id,'state',
    CASE WHEN review.approved_by IS NULL THEN 'pending' ELSE 'approved' END);
END;
$$;
REVOKE ALL ON FUNCTION erp_private.review_shared_hr_document_sources(uuid,jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.review_shared_hr_document_sources(uuid,jsonb,jsonb,jsonb) TO authenticated;

CREATE FUNCTION public.request_shared_hr_document_source_review(
  p_document_ids jsonb,p_source_fingerprints jsonb,p_originals jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT erp_private.review_shared_hr_document_sources(NULL,p_document_ids,p_source_fingerprints,p_originals);
$$;
CREATE FUNCTION public.approve_shared_hr_document_source_review(
  p_request_id uuid,p_source_fingerprints jsonb,p_originals jsonb
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT erp_private.review_shared_hr_document_sources(p_request_id,NULL,p_source_fingerprints,p_originals);
$$;
REVOKE ALL ON FUNCTION public.request_shared_hr_document_source_review(jsonb,jsonb,jsonb),
  public.approve_shared_hr_document_source_review(uuid,jsonb,jsonb) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.request_shared_hr_document_source_review(jsonb,jsonb,jsonb),
  public.approve_shared_hr_document_source_review(uuid,jsonb,jsonb) TO authenticated;

NOTIFY pgrst, 'reload schema';
COMMIT;
