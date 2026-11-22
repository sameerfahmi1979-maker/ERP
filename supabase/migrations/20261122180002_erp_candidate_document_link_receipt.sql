BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';
SET LOCAL search_path = pg_catalog;

-- Keep one row per pair. The generation distinguishes a replay from a new
-- link after removal, including for pairs that already existed at upgrade.
ALTER TABLE public.hr_candidate_documents
  ADD COLUMN link_generation bigint NOT NULL DEFAULT 0 CHECK (link_generation >= 0);

CREATE TABLE erp_private.hr_candidate_document_link_receipts (
  actor uuid NOT NULL,
  operation_id uuid NOT NULL,
  request_hash text NOT NULL CHECK (length(request_hash) = 64),
  link_id bigint NOT NULL,
  link_generation bigint NOT NULL CHECK (link_generation > 0),
  outcome text NOT NULL CHECK (outcome IN ('linked', 'reactivated', 'already_linked')),
  PRIMARY KEY (actor, operation_id)
);
ALTER TABLE erp_private.hr_candidate_document_link_receipts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON erp_private.hr_candidate_document_link_receipts FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT, INSERT ON erp_private.hr_candidate_document_link_receipts TO erp_transaction_audit_writer;
CREATE POLICY hr_candidate_document_receipt_actor ON erp_private.hr_candidate_document_link_receipts
  FOR ALL TO erp_transaction_audit_writer
  USING (actor = (SELECT auth.uid()))
  WITH CHECK (actor = (SELECT auth.uid()));

-- Preserve the staged compatibility with old application instances. Their
-- direct inserts still use generation zero and their Verify/Remove updates
-- remain valid. They cannot forge a confirmed generation or reactivate a pair.
CREATE FUNCTION erp_private.hr_candidate_document_preserve_archive()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = '' AS $$
BEGIN
  IF current_user = 'authenticated' THEN
    IF TG_OP = 'INSERT' THEN
      IF NEW.link_generation <> 0 THEN
        RAISE EXCEPTION 'Candidate document link is unavailable' USING ERRCODE = '42501';
      END IF;
    ELSIF NEW.link_generation <> OLD.link_generation
      OR NEW.candidate_id <> OLD.candidate_id
      OR NEW.dms_document_id <> OLD.dms_document_id
      OR (OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL) THEN
      RAISE EXCEPTION 'Candidate document link is unavailable' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.hr_candidate_document_preserve_archive() FROM PUBLIC, anon, authenticated, service_role;
CREATE TRIGGER hr_candidate_document_preserve_archive
  BEFORE INSERT OR UPDATE ON public.hr_candidate_documents
  FOR EACH ROW EXECUTE FUNCTION erp_private.hr_candidate_document_preserve_archive();

-- A recruiter can link visible evidence without owning the DMS write
-- privilege. This private routine locks exactly those already verified source
-- rows and exposes only the scope and reference needed for trusted audit.
CREATE FUNCTION erp_private.lock_hr_candidate_document(p_candidate bigint, p_document bigint)
RETURNS TABLE (company_id bigint, branch_id bigint, candidate_code text, candidate_name text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  requisition bigint;
BEGIN
  IF NOT erp_private.candidate_permission(p_candidate, 'hr.recruitment.manage')
    OR NOT erp_private.document_permission(p_document, 'dms.documents.view') THEN
    RAISE EXCEPTION 'Candidate or document is unavailable' USING ERRCODE = '42501';
  END IF;

  SELECT c.requisition_id, c.candidate_code, c.full_name_en
    INTO requisition, candidate_code, candidate_name
    FROM public.hr_candidates c WHERE c.id = p_candidate AND c.deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Candidate or document is unavailable' USING ERRCODE = '42501';
  END IF;

  IF requisition IS NOT NULL THEN
    SELECT r.owner_company_id, r.branch_id INTO company_id, branch_id
      FROM public.hr_job_requisitions r WHERE r.id = requisition AND r.deleted_at IS NULL FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Candidate or document is unavailable' USING ERRCODE = '42501';
    END IF;
  END IF;

  PERFORM d.id FROM public.dms_documents d
    WHERE d.id = p_document AND d.deleted_at IS NULL AND d.is_archived IS FALSE FOR SHARE;
  IF NOT FOUND OR NOT erp_private.candidate_permission(p_candidate, 'hr.recruitment.manage')
    OR NOT erp_private.document_permission(p_document, 'dms.documents.view') THEN
    RAISE EXCEPTION 'Candidate or document is unavailable' USING ERRCODE = '42501';
  END IF;

  RETURN NEXT;
END;
$$;
REVOKE ALL ON FUNCTION erp_private.lock_hr_candidate_document(bigint, bigint) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION erp_private.lock_hr_candidate_document(bigint, bigint) TO erp_transaction_audit_writer;

CREATE FUNCTION erp_private.link_hr_candidate_document(
  p_candidate bigint, p_document bigint, p_operation uuid, p_purpose text, p_notes text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  actor_id uuid := auth.uid();
  profile_id bigint := public.current_user_profile_id();
  authority record;
  receipt erp_private.hr_candidate_document_link_receipts%ROWTYPE;
  existing public.hr_candidate_documents%ROWTYPE;
  request_hash text;
  outcome text;
  audit_type text;
  audit_action text;
  replayed boolean := false;
BEGIN
  IF actor_id IS NULL OR profile_id IS NULL THEN
    RAISE EXCEPTION 'Candidate or document is unavailable' USING ERRCODE = '42501';
  END IF;
  IF p_candidate IS NULL OR p_candidate NOT BETWEEN 1 AND 9007199254740991
    OR p_document IS NULL OR p_document NOT BETWEEN 1 AND 9007199254740991
    OR p_operation IS NULL OR p_purpose NOT IN ('cv','passport','certificate','offer','photo','other')
    OR octet_length(p_notes) > 10485760 THEN
    RAISE EXCEPTION 'Invalid candidate document link' USING ERRCODE = '22023';
  END IF;

  request_hash := encode(sha256(convert_to(jsonb_build_array(p_candidate, p_document, p_purpose, p_notes)::text, 'UTF8')), 'hex');
  PERFORM pg_advisory_xact_lock(hashtextextended('hr-candidate-document-operation:' || actor_id::text || ':' || p_operation::text, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended('hr-candidate-document-pair:' || p_candidate::text || ':' || p_document::text, 1));
  SELECT * INTO STRICT authority FROM erp_private.lock_hr_candidate_document(p_candidate, p_document);

  SELECT * INTO existing FROM public.hr_candidate_documents
    WHERE candidate_id = p_candidate AND dms_document_id = p_document FOR UPDATE;
  SELECT r.* INTO receipt FROM erp_private.hr_candidate_document_link_receipts r
    WHERE r.actor = actor_id AND r.operation_id = p_operation;

  IF FOUND THEN
    IF receipt.request_hash <> request_hash OR existing.id IS DISTINCT FROM receipt.link_id
      OR existing.deleted_at IS NOT NULL OR existing.link_generation <> receipt.link_generation THEN
      RAISE EXCEPTION 'Candidate document link request no longer matches the active link' USING ERRCODE = 'PT409';
    END IF;
    outcome := receipt.outcome;
    replayed := true;
  ELSE
    IF existing.id IS NULL THEN
      INSERT INTO public.hr_candidate_documents
        (candidate_id, dms_document_id, document_purpose, notes, created_by, link_generation)
      VALUES (p_candidate, p_document, p_purpose, p_notes, profile_id, 1)
      RETURNING * INTO existing;
      outcome := 'linked';
      audit_type := 'candidate_document_linked';
      audit_action := 'create';
    ELSIF existing.deleted_at IS NOT NULL THEN
      UPDATE public.hr_candidate_documents
        SET deleted_at = NULL, deleted_by = NULL, document_purpose = p_purpose, notes = p_notes,
          verification_status = 'unverified', link_generation = link_generation + 1
        WHERE id = existing.id
        RETURNING * INTO existing;
      outcome := 'reactivated';
      audit_type := 'candidate_document_reactivated';
      audit_action := 'update';
    ELSE
      outcome := 'already_linked';
      IF existing.link_generation = 0 THEN
        UPDATE public.hr_candidate_documents SET link_generation = 1 WHERE id = existing.id RETURNING * INTO existing;
        audit_type := 'candidate_document_link_confirmed';
        audit_action := 'update';
      END IF;
    END IF;


    IF audit_type IS NOT NULL THEN
      INSERT INTO public.audit_logs
        (actor_user_profile_id, owner_company_id, branch_id, module_code, entity_name, entity_id, entity_reference, action, new_values)
      VALUES (profile_id, authority.company_id, authority.branch_id, 'HR', 'hr_candidate_documents', existing.id, '', audit_action,
        jsonb_build_object('action_type', audit_type, 'candidate_id', p_candidate, 'candidate_code', authority.candidate_code,
          'candidate_name', authority.candidate_name, 'dms_document_id', p_document, 'operation_id', p_operation,
          'link_generation', existing.link_generation));
    END IF;

    INSERT INTO erp_private.hr_candidate_document_link_receipts
      VALUES (actor_id, p_operation, request_hash, existing.id, existing.link_generation, outcome);
  END IF;

  IF NOT erp_private.candidate_permission(p_candidate, 'hr.recruitment.manage')
    OR NOT erp_private.document_permission(p_document, 'dms.documents.view') THEN
    RAISE EXCEPTION 'Candidate or document is unavailable' USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object('id', existing.id, 'candidate_id', p_candidate, 'dms_document_id', p_document,
    'operation_id', p_operation, 'outcome', outcome, 'replayed', replayed);
END;
$$;
REVOKE ALL ON FUNCTION erp_private.link_hr_candidate_document(bigint, bigint, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT CREATE ON SCHEMA erp_private TO erp_transaction_audit_writer;
ALTER FUNCTION erp_private.link_hr_candidate_document(bigint, bigint, uuid, text, text) OWNER TO erp_transaction_audit_writer;
REVOKE CREATE ON SCHEMA erp_private FROM erp_transaction_audit_writer;
GRANT EXECUTE ON FUNCTION erp_private.link_hr_candidate_document(bigint, bigint, uuid, text, text) TO authenticated;

CREATE FUNCTION public.link_hr_candidate_document(
  p_candidate bigint, p_document bigint, p_operation uuid, p_purpose text DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS jsonb LANGUAGE sql SECURITY INVOKER SET search_path = '' AS $$
  SELECT erp_private.link_hr_candidate_document(p_candidate, p_document, p_operation, p_purpose, p_notes)
$$;
REVOKE ALL ON FUNCTION public.link_hr_candidate_document(bigint, bigint, uuid, text, text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.link_hr_candidate_document(bigint, bigint, uuid, text, text) TO authenticated;
NOTIFY pgrst, 'reload schema';
COMMIT;
